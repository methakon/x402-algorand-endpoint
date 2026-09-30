/**
 * x402 paid API endpoint on Algorand (Testnet by default).
 *
 * Each call to POST /api/analyze requires an x402 payment in USDC. The
 * facilitator verifies and settles the Algorand ASA transfer, and only then is
 * the response served.
 */
import express from "express";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { paymentMiddleware, x402ResourceServer } from "@x402/express";
import { ExactAvmScheme } from "@x402/avm/exact/server";
import { HTTPFacilitatorClient } from "@x402/core/server";
import swaggerUi from "swagger-ui-express";
import { buildOpenApi } from "./openapi.js";
import { hasPayerKey, payAndFetch } from "./payer.js";

const PORT = Number(process.env.PORT || 8402);

// Algorand CAIP-2 identifiers, as advertised by the facilitator's /supported
// endpoint. Note the reference-suffixed form the facilitator actually uses:
//   Testnet: algorand:SGO1GKSzyE7IEPItTxCByw9x8FmnrCDexi9/cOUJOiI=
//   Mainnet: algorand:wGHE2Pwdvd7S12BL5FaOP20EGYesN73ktiC1qzkkit8=
const NETWORK =
  process.env.X402_NETWORK || "algorand:SGO1GKSzyE7IEPItTxCByw9x8FmnrCDexi9/cOUJOiI=";
const PAY_TO = process.env.X402_PAY_TO || "";
const FACILITATOR = process.env.X402_FACILITATOR_URL || "https://facilitator.goplausible.xyz";
const PRICE_USDC = process.env.X402_PRICE_USDC || "0.02";

if (!PAY_TO) {
  console.error("X402_PAY_TO is required: the Algorand address that receives the USDC.");
  process.exit(1);
}

const app = express();
app.use(express.json());

const here = dirname(fileURLToPath(import.meta.url));

const openapi = buildOpenApi({
  network: NETWORK,
  payTo: PAY_TO,
  price: PRICE_USDC,
  facilitator: FACILITATOR,
});

// Swagger UI renders the spec above; the spec itself is served as JSON.
app.use("/docs", swaggerUi.serve, swaggerUi.setup(openapi, { customSiteTitle: "Sentiment402 API" }));
app.get("/openapi.json", (_req, res) => res.json(openapi));

app.use(express.static(join(here, "public")));

app.get("/healthz", (_req, res) => {
  res.json({ ok: true, network: NETWORK, payTo: PAY_TO, price: PRICE_USDC });
});

// Bazaar discovery document. The x402-global-challenge tag is what the
// challenge leaderboard indexes.
app.get("/discovery/resources", (_req, res) => {
  res.json({
    x402Version: 2,
    resources: [
      {
        address: PAY_TO,
        network: NETWORK,
        lastUpdated: new Date().toISOString(),
        config: { accepts: [] },
        resource: {
          method: "POST",
          path: "/api/analyze",
          description: "Algorand x402 paid market sentiment analysis endpoint",
          mimeType: "application/json",
          payTo: PAY_TO,
          maxTimeoutSeconds: 300,
          extra: { name: "USDC", version: "2", tag: "x402-global-challenge" },
        },
      },
    ],
  });
});

const facilitator = new HTTPFacilitatorClient({ url: FACILITATOR });
const resourceServer = new x402ResourceServer(facilitator).register(
  NETWORK,
  new ExactAvmScheme(),
);

const routes = {
  "POST /api/analyze": {
    description: "Market sentiment analysis of a text sample",
    mimeType: "application/json",
    accepts: [
      {
        scheme: "exact",
        network: NETWORK,
        price: PRICE_USDC,
        payTo: PAY_TO,
        maxTimeoutSeconds: 300,
        extra: { name: "USDC", version: "2", tag: "x402-global-challenge" },
      },
    ],
  },
};

app.use(paymentMiddleware(routes, resourceServer));

app.post("/api/analyze", (req, res) => {
  const text = String(req.body?.text || "").trim();
  if (!text) {
    return res.status(400).json({ error: "text is required" });
  }

  const words = text.split(/\s+/).filter(Boolean);
  const bearish = (text.match(/\b(fall|drop|crash|risk|bear|sell|decline|weak)\b/gi) || []).length;
  const bullish = (text.match(/\b(rise|growth|bull|buy|strong|gain|surge)\b/gi) || []).length;
  const total = bullish + bearish;

  let sentiment;
  if (total === 0) sentiment = "neutral";
  else if (bullish > bearish) sentiment = "bullish";
  else if (bearish > bullish) sentiment = "bearish";
  else sentiment = "mixed";

  res.json({
    sentiment,
    confidence: total === 0 ? 0 : Number((Math.max(bullish, bearish) / total).toFixed(2)),
    signals: { bullish, bearish },
    analysed: { words: words.length, characters: text.length },
    network: NETWORK,
  });
});

// Demo helper for the UI's "pay" button. It settles a real payment using a key
// held on this host, so it must stay disabled unless X402_PAYER_KEY64 is set.
// The public deployment deliberately leaves it unset: the endpoint host should
// never hold a funded signing key.
app.post("/pay", async (req, res) => {
  const text = String(req.body?.text || "").trim();
  if (!text) {
    return res.status(400).json({ error: "text is required" });
  }
  if (!hasPayerKey()) {
    return res.status(503).json({
      error:
        "Demo payment is disabled: no payer key is configured on this host. " +
        "Payments are made by a client, never by the server.",
    });
  }

  // Guard against enabling /pay with a real Mainnet key. The payer signs
  // transactions on behalf of whoever calls this route, so a funded mainnet key
  // on a publicly reachable host is a standing loss risk. Testnet only.
  const isTestnet = NETWORK.includes("SGO1GKSzyE7IEPItTxCByw9x8FmnrCDe");
  if (!isTestnet) {
    return res.status(503).json({
      error:
        "Demo payment is disabled on Mainnet: this route spends a key held by the " +
        "server on behalf of any caller, which is unsafe for real funds.",
    });
  }

  try {
    res.json(await payAndFetch(`http://127.0.0.1:${PORT}`, text));
  } catch (err) {
    res.status(502).json({ error: String(err.message || err).slice(0, 300) });
  }
});

app.listen(PORT, () => {
  console.log(`x402 endpoint listening on http://127.0.0.1:${PORT}`);
  console.log(`  network     : ${NETWORK}`);
  console.log(`  payTo       : ${PAY_TO}`);
  console.log(`  price       : ${PRICE_USDC} USDC per POST /api/analyze`);
  console.log(`  facilitator : ${FACILITATOR}`);
  console.log(`  ui          : /          api reference: /docs`);
  console.log(`  demo /pay   : ${hasPayerKey() ? "enabled" : "disabled (no X402_PAYER_KEY64 set)"}`);
});
