/**
 * Demo helper: pays this endpoint's own /api/analyze and returns both the
 * settlement and the analysis.
 *
 * The signing key lives here, on the operator's machine or a private host - NOT
 * on the public endpoint host. The public server exposes only this route, which
 * simply forwards to the paying client. If no key is configured the route
 * returns 503 and the UI says so plainly, rather than pretending to pay.
 */
import { x402Client } from "@x402/core/client";
import { ExactAvmScheme } from "@x402/avm/exact/client";
import { toClientAvmSigner } from "@x402/avm";
import { wrapFetchWithPayment } from "@x402/fetch";

const KEY_ENV = process.env.X402_PAYER_KEY64 || "";

export function hasPayerKey() {
  return Boolean(KEY_ENV);
}

/**
 * @param {string} baseUrl  the endpoint to pay, e.g. http://127.0.0.1:8402
 * @param {string} text     text to analyse
 * @returns {Promise<{settlement: object, analysis: object}>}
 */
export async function payAndFetch(baseUrl, text) {
  const signer = toClientAvmSigner(KEY_ENV);
  const client = new x402Client().register("algorand:*", new ExactAvmScheme(signer));
  const payingFetch = wrapFetchWithPayment(fetch, client);

  const res = await payingFetch(`${baseUrl}/api/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });

  if (res.status !== 200) {
    const detail = (await res.text()).slice(0, 300);
    throw new Error(`endpoint returned ${res.status} ${res.statusText}: ${detail}`);
  }

  const raw = res.headers.get("payment-response");
  let settlement = null;
  if (raw) {
    try {
      settlement = JSON.parse(Buffer.from(raw, "base64").toString());
    } catch {
      settlement = { raw: raw.slice(0, 200) };
    }
  }

  return { settlement, analysis: await res.json() };
}
