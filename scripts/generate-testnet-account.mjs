/**
 * Generates an Algorand TESTNET account with a recoverable key.
 *
 * The previous version used client.account.random(), which derives the keypair
 * inside a signer closure and returns only the public address, so the private
 * key cannot be recovered afterwards and any funds sent to the address are
 * stranded. This version derives the account from a locally generated secret
 * key, and converts that key to an Algorand 25-word mnemonic, so the account can
 * be restored with client.account.fromMnemonic().
 *
 * The mnemonic is written to a gitignored file with mode 600. It is not printed,
 * logged, or committed. Testnet only: no real value.
 */
import { AlgorandClient } from "@algorandfoundation/algokit-utils";
import { randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "..", "x402-TESTNET-ACCOUNT.json");

// algo25 is an internal subpath, so load it by absolute file URL.
const algo25 = await import(
  new URL(
    "../node_modules/@algorandfoundation/algokit-utils/packages/algo25/src/index.mjs",
    import.meta.url,
  ).href
);

// A 32-byte secret key, then its Algorand 25-word mnemonic.
const secretKey = new Uint8Array(randomBytes(32));
const phrase = algo25.secretKeyToMnemonic(secretKey);

const client = await AlgorandClient.testNet();
const account = client.account.fromMnemonic(phrase);

const record = {
  note: "TESTNET ONLY - no real value. Never reuse this key for Mainnet.",
  address: account.addr.toString(),
  mnemonic: phrase,
  secretKeyBase64: Buffer.from(secretKey).toString("base64"),
  network: "algorand:SGO1GKSzyE7IEPItTxCByw9x8FmnrCDexi9/cOUJOiI=",
  usdcAsaTestnet: "10458941",
  usdcAsaMainnet: "31566704",
  restore: "client.account.fromMnemonic(<mnemonic>)",
};

writeFileSync(out, JSON.stringify(record, null, 2), { mode: 0o600 });

// Prove the phrase round-trips to the same address before reporting success.
const check = client.account.fromMnemonic(phrase).addr.toString();

console.log("address:", record.address);
console.log("round-trip verified:", check === record.address ? "YES" : "NO - BROKEN");
console.log("record written to:", out, "(mode 600, gitignored)");
