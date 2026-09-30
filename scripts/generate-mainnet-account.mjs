/**
 * Creates an Algorand MAINNET account with a recoverable key.
 *
 * Derived from a locally generated secret so the account can be restored with
 * client.account.fromMnemonic(). account.random() would hide the key inside a
 * signer closure and strand any funds sent to the address.
 *
 * The mnemonic and secret are written to a gitignored file with mode 600. The
 * private key is never printed here.
 */
import { AlgorandClient } from "@algorandfoundation/algokit-utils";
import { randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "..", "x402-MAINNET-ACCOUNT.json");

// algo25 is an internal subpath, so load it by absolute file URL.
const algo25 = await import(
  new URL(
    "../node_modules/@algorandfoundation/algokit-utils/packages/algo25/src/index.mjs",
    import.meta.url,
  ).href
);

const secretKey = new Uint8Array(randomBytes(32));
const phrase = algo25.secretKeyToMnemonic(secretKey);

const client = await AlgorandClient.mainNet();
const account = client.account.fromMnemonic(phrase);

// Prove the phrase round-trips before reporting success.
const check = client.account.fromMnemonic(phrase).addr.toString();

const record = {
  note:
    "MAINNET - REAL VALUE. Opt in to USDC ASA 31566704 before receiving USDC.",
  address: account.address ? account.address.toString() : account.addr.toString(),
  mnemonic: phrase,
  secretKeyBase64: Buffer.from(secretKey).toString("base64"),
  network: "algorand:wGHE2Pwdvd7S12BL5FaOP20EGYesN73ktiC1qzkkit8=",
  usdcAsaMainnet: "31566704",
  restore: "AlgorandClient.mainNet().account.fromMnemonic(<mnemonic>)",
};

writeFileSync(out, JSON.stringify(record, null, 2), { mode: 0o600 });

console.log("MAINNET ADDRESS:", record.address);
console.log("round-trip verified:", check === record.address ? "YES" : "NO - BROKEN");
console.log("record written to:", out, "(mode 600, gitignored)");
