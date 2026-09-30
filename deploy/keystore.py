#!/usr/bin/env python3
"""
Encrypted local keystore for blockchain account keys.

Why this exists: an Algorand account generated with `account.random()` holds
its key inside a signer closure, so the key cannot be recovered and any funds
sent to the address are stranded. Keys must therefore be persisted deliberately.

Secrets are encrypted at rest with AES-256-GCM using a key derived from the
store passphrase via scrypt. The database holds only ciphertext.

Passphrase resolution order:
  1. KEYSTORE_PASSPHRASE environment variable
  2. ~/.algorand-keystore.passphrase  (mode 600)

Usage:
  keystore.py add --label NAME --address ADDR --network NET --mnemonic "..." [--asa AID ...]
  keystore.py list
  keystore.py get --label NAME            # prints the record (secret included)
  keystore.py path --label NAME           # prints the stored JSON for scripts
"""
import argparse
import getpass
import json
import os
import sqlite3
import stat
import sys
from pathlib import Path

from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.scrypt import Scrypt

DB_PATH = Path.home() / ".local/share/algorand-keystore/keystore.db"
PASS_FILE = Path.home() / ".algorand-keystore.passphrase"
SCRYPT_N = 2**15
SCRYPT_R = 8
SCRYPT_P = 1
SALT = b"algorand-keystore-v1"  # fixed salt: one local file, not a multi-tenant store


def passphrase() -> bytes:
    env = os.environ.get("KEYSTORE_PASSPHRASE")
    if env:
        return env.encode()
    if PASS_FILE.exists():
        return PASS_FILE.read_text().strip().encode()
    raise SystemExit(
        f"No passphrase. Set KEYSTORE_PASSPHRASE or create {PASS_FILE} (mode 600)."
    )


def crypto_key(pass_phrase: bytes) -> bytes:
    kdf = Scrypt(salt=SALT, length=32, n=SCRYPT_N, r=SCRYPT_R, p=SCRYPT_P)
    return kdf.derive(pass_phrase)


def connect() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    os.chmod(DB_PATH.parent, 0o700)
    conn = sqlite3.connect(DB_PATH)
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS keys (
            label      TEXT PRIMARY KEY,
            address    TEXT NOT NULL,
            network    TEXT NOT NULL,
            secret_ct  BLOB NOT NULL,
            secret_nonce BLOB NOT NULL,
            asas       TEXT NOT NULL DEFAULT '[]',
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            notes      TEXT
        )
        """
    )
    conn.commit()
    return conn


def encrypt(secret: dict, pass_phrase: bytes) -> tuple[bytes, bytes]:
    nonce = os.urandom(12)
    ct = AESGCM(crypto_key(pass_phrase)).encrypt(nonce, json.dumps(secret).encode(), None)
    return ct, nonce


def decrypt(row, pass_phrase: bytes) -> dict:
    # AESGCM.decrypt takes (nonce, data) - nonce first.
    ct, nonce = row
    return json.loads(
        AESGCM(crypto_key(pass_phrase)).decrypt(nonce, ct, None).decode()
    )


def cmd_add(args: argparse.Namespace) -> None:
    conn = connect()
    pass_phrase = passphrase()
    secret = {"mnemonic": args.mnemonic}
    ct, nonce = encrypt(secret, pass_phrase)
    conn.execute(
        "INSERT OR REPLACE INTO keys (label,address,network,secret_ct,secret_nonce,asas,notes)"
        " VALUES (?,?,?,?,?,?,?)",
        (args.label, args.address, args.network, ct, nonce, json.dumps(args.asa or []), args.notes),
    )
    conn.commit()
    print(f"stored {args.label}: {args.address} on {args.network}")


def cmd_secret(args: argparse.Namespace) -> None:
    """Store an arbitrary key/value payload (non-blockchain credentials).

    The payload is read from a file so the value never appears in argv, shell
    history, or process listings. The file is deleted by the caller.
    """
    conn = connect()
    pass_phrase = passphrase()
    with open(args.file, "r", encoding="utf-8") as fh:
        payload = json.load(fh)
    ct, nonce = encrypt(payload, pass_phrase)
    conn.execute(
        "INSERT OR REPLACE INTO keys (label,address,network,secret_ct,secret_nonce,asas,notes)"
        " VALUES (?,?,?,?,?,?,?)",
        (args.label, args.address or args.label, args.network, ct, nonce, "[]", args.notes),
    )
    conn.commit()
    print(f"stored secret {args.label}")


def cmd_list(_args: argparse.Namespace) -> None:
    conn = connect()
    rows = conn.execute(
        "SELECT label,address,network,asas,notes,created_at FROM keys ORDER BY label"
    ).fetchall()
    if not rows:
        print("keystore is empty")
        return
    for label, address, network, asas, notes, created in rows:
        print(f"{label}")
        print(f"  address : {address}")
        print(f"  network : {network}")
        print(f"  asas    : {asas}")
        if notes:
            print(f"  notes   : {notes}")
        print(f"  created : {created}")


def _row(args: argparse.Namespace):
    conn = connect()
    row = conn.execute(
        "SELECT label,address,network,asas,notes,secret_ct,secret_nonce FROM keys WHERE label=?",
        (args.label,),
    ).fetchone()
    if not row:
        raise SystemExit(f"no entry labelled {args.label}")
    meta = row[:5]
    return meta, (row[5], row[6])


def cmd_get(args: argparse.Namespace) -> None:
    meta, row = _row(args)
    secret = decrypt(row, passphrase())
    print(json.dumps({"label": meta[0], "address": meta[1], "network": meta[2],
                      "asas": json.loads(meta[3]), "notes": meta[4], **secret}, indent=2))


def cmd_path(args: argparse.Namespace) -> None:
    """Emit a key file for Node scripts, then delete it is the caller's job."""
    meta, row = _row(args)
    secret = decrypt(row, passphrase())
    out = Path(args.out)
    out.write_text(json.dumps({"address": meta[1], **secret}, indent=2))
    os.chmod(out, 0o600)
    print(out)


def cmd_delete(args: argparse.Namespace) -> None:
    conn = connect()
    conn.execute("DELETE FROM keys WHERE label=?", (args.label,))
    conn.commit()
    print(f"deleted {args.label}")


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__)
    sub = p.add_subparsers(dest="cmd", required=True)

    a = sub.add_parser("add")
    a.add_argument("--label", required=True)
    a.add_argument("--address", required=True)
    a.add_argument("--network", required=True)
    a.add_argument("--mnemonic", required=True)
    a.add_argument("--asa", action="append", default=[])
    a.add_argument("--notes")
    a.set_defaults(fn=cmd_add)

    sub.add_parser("list").set_defaults(fn=cmd_list)

    s = sub.add_parser("secret")
    s.add_argument("--label", required=True)
    s.add_argument("--file", required=True, help="JSON payload file (mode 600)")
    s.add_argument("--network", default="n/a")
    s.add_argument("--address")
    s.add_argument("--notes")
    s.set_defaults(fn=cmd_secret)

    g = sub.add_parser("get")
    g.add_argument("--label", required=True)
    g.set_defaults(fn=cmd_get)

    gp = sub.add_parser("path")
    gp.add_argument("--label", required=True)
    gp.add_argument("--out", required=True)
    gp.set_defaults(fn=cmd_path)

    d = sub.add_parser("delete")
    d.add_argument("--label", required=True)
    d.set_defaults(fn=cmd_delete)

    args = p.parse_args()
    args.fn(args)


if __name__ == "__main__":
    main()
