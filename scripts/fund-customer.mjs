/**
 * Moves testnet USDC from the merchant account to the customer account.
 *
 * The challenge requires a real payment between distinct parties, so the
 * customer must hold USDC of its own before it can pay the endpoint. The
 * merchant is the only funded account, so it funds the customer first.
 */
import { AlgorandClient } from "@algorandfoundation/algokit-utils";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const read = (name) =>
  JSON.parse(readFileSync(join(here, "..", name), "utf8"));

const merchant = read("x402-TESTNET-ACCOUNT.json");
const customer = read("x402-CUSTOMER-ACCOUNT.json");

// Fall back to the documented testnet ASA if the record predates the field.
const usdcTestnet = BigInt(
  merchant.usdcAsaTestnet ?? customer.usdcAsaTestnet ?? "10458941",
);
const amount = Number(process.env.TRANSFER_USDC_UNITS || 5_000_000); // 5 USDC

const client = await AlgorandClient.testNet();
const sender = client.account.fromMnemonic(merchant.mnemonic);
client.setDefaultSigner(sender);

// send.* takes the same params object and builds its own composer, so pass the
// transfer details rather than a pre-built transaction.
const result = await client.send.assetTransfer({
  sender,
  receiver: customer.address,
  assetId: usdcTestnet,
  amount,
});

console.log("from  :", merchant.address);
console.log("to    :", customer.address);
console.log("asset :", usdcTestnet.toString());
console.log("amount:", amount, `(${amount / 1e6} USDC)`);
console.log("txn   :", result.txId);
