/**
 * Generates a fresh Algorand TESTNET account for the x402 Global Challenge.
 *
 * The account is created through algokit-utils so the keypair is derived the
 * same way AlgoKit derives it. The secret is written to a gitignored file with
 * 600 permissions and is never printed, logged, or committed.
 *
 * This account holds no real value and must never be reused on Mainnet.
 */
import { AlgorandClient } from "@algorandfoundation/algokit-utils";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "..", "x402-TESTNET-ACCOUNT.json");

const client = await AlgorandClient.testNet();
const account = client.account.random();

const record = {
  note: "TESTNET ONLY - no real value. Never reuse this key for Mainnet.",
  address: account.addr.toString(),
  network: "algorand:SGO1GKSzyE7IEPItTxCByw9x8FmnrCDexi9/cOUJOiI=",
  usdcAsaTestnet: "10458941",
  usdcAsaMainnet: "31566704",
  signing: "Re-create with: client.account.fromMnemonic(<phrase>) or store the algokit keystore.",
};

writeFileSync(out, JSON.stringify(record, null, 2), { mode: 0o600 });

console.log("address:", record.address);
console.log("record written to:", out, "(mode 600)");
