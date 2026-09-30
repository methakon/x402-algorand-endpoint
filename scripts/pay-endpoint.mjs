/**
 * Pays the local x402 endpoint and prints the settled response.
 *
 * Reads the payer account from the gitignored key file, calls the protected
 * route with @x402/fetch, and reports what came back. The facilitator verifies
 * and settles the USDC transfer before the resource is served.
 */
import { x402Client } from "@x402/core/client";
import { ExactAvmScheme } from "@x402/avm/exact/client";
import { toClientAvmSigner } from "@x402/avm";
import { wrapFetchWithPayment, decodePaymentResponseHeader } from "@x402/fetch";
import { readFileSync } from "node:fs";

const BASE = process.env.X402_BASE_URL || "http://127.0.0.1:8402";

// Pay from the customer account by default; the merchant is the payTo.
const payerFile = process.env.X402_PAYER_FILE || "x402-CUSTOMER-ACCOUNT.json";
const record = JSON.parse(
  readFileSync(new URL(`../${payerFile}`, import.meta.url), "utf8"),
);

const signer = toClientAvmSigner(record.secretKey64Base64);
const client = new x402Client().register("algorand:*", new ExactAvmScheme(signer));
const payingFetch = wrapFetchWithPayment(fetch, client);

const url = `${BASE}/api/analyze`;
const body = { text: "algorand adoption growth strong buy signal" };

console.log(`POST ${url}`);
console.log(`payer: ${record.address}\n`);

const res = await payingFetch(url, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

console.log(`status: ${res.status} ${res.statusText}`);
if (res.status !== 200) {
  console.log("body:", (await res.text()).slice(0, 400));
  process.exit(1);
}

// The facilitator's settlement receipt. AVM responses do not always match the
// generic decoder's base64 regex, so decode defensively and fall back to raw.
const raw = res.headers.get("payment-response");
if (!raw) {
  console.log("settlement: no payment-response header");
} else {
  let settlement = null;
  try {
    settlement = decodePaymentResponseHeader(res);
  } catch {
    try {
      settlement = JSON.parse(Buffer.from(raw, "base64").toString());
    } catch {
      settlement = null;
    }
  }
  console.log("settlement:", settlement ? JSON.stringify(settlement) : `(undecodable) ${raw.slice(0, 160)}`);
}
console.log("\nresource response:");
console.log(JSON.stringify(await res.json(), null, 2));
