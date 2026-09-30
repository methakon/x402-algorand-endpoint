/**
 * Opts an account into the x402 USDC ASA. An Algorand Standard Asset must be
 * opted into before it can hold or send it, so a customer account needs this
 * before the merchant can transfer USDC to it.
 *
 * Usage: node scripts/optin-usdc.mjs [--customer]
 */
import { AlgorandClient } from "@algorandfoundation/algokit-utils";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const isCustomer = process.argv.includes("--customer");
const file = isCustomer ? "x402-CUSTOMER-ACCOUNT.json" : "x402-TESTNET-ACCOUNT.json";

const record = JSON.parse(readFileSync(join(here, "..", file), "utf8"));

const client = await AlgorandClient.testNet();
const account = client.account.fromMnemonic(record.mnemonic);
client.setDefaultSigner(account);

const results = await client.asset.bulkOptIn(record.address, [BigInt(record.usdcAsaTestnet)]);

console.log("who    :", isCustomer ? "customer" : "merchant");
console.log("address:", record.address);
console.log("asset  :", record.usdcAsaTestnet, "(USDC testnet)");
for (const r of results) {
  console.log("txn id :", r.transactionId);
}
