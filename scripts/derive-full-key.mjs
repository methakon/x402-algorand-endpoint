/**
 * Derives the 64-byte Algorand secret key (seed || publicKey) that
 * toClientAvmSigner() requires, from a saved 32-byte seed.
 *
 * The x402 AVM signer rejects a 32-byte seed: it wants the full 64-byte
 * Algorand secret key. Storing both makes the account usable by every tool
 * without re-deriving it each time.
 */
import crypto from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));

// PKCS8 prefix for an Ed25519 private key holding a raw 32-byte seed.
const PKCS8_ED25519_SEED = Buffer.from("302e020100300506032b657004220420", "hex");

const file = process.argv[2] || "x402-TESTNET-ACCOUNT.json";
const path = join(here, "..", file);
const record = JSON.parse(readFileSync(path, "utf8"));

const seed = new Uint8Array(Buffer.from(record.secretKeyBase64, "base64"));
const pkcs8 = crypto.createPrivateKey({
  key: Buffer.concat([PKCS8_ED25519_SEED, Buffer.from(seed)]),
  format: "der",
  type: "pkcs8",
});
const spki = crypto.createPublicKey(pkcs8).export({ format: "der", type: "spki" });

const full = new Uint8Array(64);
full.set(seed, 0);
full.set(new Uint8Array(spki.subarray(spki.length - 32)), 32);

record.secretKey64Base64 = Buffer.from(full).toString("base64");
writeFileSync(path, JSON.stringify(record, null, 2));
console.log("derived 64-byte key for", record.address);
