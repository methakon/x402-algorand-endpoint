/**
 * Builds the OpenAPI document for the endpoint.
 *
 * Kept separate from the server so the spec can be served at /openapi.json and
 * rendered by Swagger UI at /docs without the two drifting apart.
 */
export function buildOpenApi({ network, payTo, price, facilitator }) {
  return {
    openapi: "3.0.3",
    info: {
      title: "Sentiment402",
      version: "1.0.0",
      description: [
        "Pay-per-request market sentiment analysis on Algorand.",
        "",
        `Each \`POST /api/analyze\` call costs **${price} USDC**. An unpaid request receives`,
        "HTTP 402 Payment Required with an x402 v2 payment requirement naming the scheme,",
        "network, asset, amount and payTo address. Payment is an Algorand Standard Asset",
        "transfer implemented with the AVM exact scheme; the facilitator verifies and settles",
        "it, and only then is the response served.",
        "",
        "The service never holds customer funds. Its key is used only to build payment",
        "requirements; verification and settlement happen at the facilitator.",
      ].join("\n"),
    },
    servers: [{ url: "/", description: "This deployment" }],
    tags: [
      { name: "Paid", description: "Endpoints that require an x402 payment" },
      { name: "Sandbox", description: "Free, rate-limited preview. No payment, no settlement." },
      { name: "Free", description: "Discovery and health, no payment required" },
    ],
    paths: {
      "/api/analyze": {
        post: {
          tags: ["Paid"],
          summary: "Analyse text for market sentiment",
          description: [
            "Returns a sentiment label, a confidence score, and the signals behind them.",
            "",
            `Costs **${price} USDC** per call. Requires an \`X-PAYMENT\` (or the standard`,
            "`PAYMENT-SIGNATURE`) header carrying a signed x402 payment payload.",
          ].join("\n"),
          security: [{ x402Payment: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["text"],
                  properties: {
                    text: {
                      type: "string",
                      description: "Text sample to analyse.",
                      example: "algorand adoption growth and strong buy signal",
                    },
                  },
                },
                example: { text: "algorand adoption growth and strong buy signal" },
              },
            },
          },
          responses: {
            200: {
              description: "Payment settled; the analysis is returned.",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Analysis" },
                },
              },
            },
            400: {
              description: "Malformed request.",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: { error: { type: "string", example: "text is required" } },
                  },
                },
              },
            },
            402: {
              description:
                "Payment required. The response carries an x402 payment requirement; " +
                "the PAYMENT-REQUIRED header holds the base64-encoded JSON requirement.",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/PaymentRequired" },
                },
              },
            },
          },
        },
      },
      "/api/sandbox": {
        post: {
          tags: ["Sandbox"],
          summary: "Free, rate-limited preview of the analysis",
          description: [
            "Returns the same analysis as `POST /api/analyze` without requiring a",
            "payment. Use this to see the shape of the resource before deciding to",
            "pay for it.",
            "",
            "Requires the demo key in the `x-sandbox-key` header. Click **Authorize**",
            "above to enter it. The key is a published demo value, not a secret:",
            "`sandbox-demo-key`.",
            "",
            "Rate limited to **10 requests per 60 seconds**. Responses carry",
            "`X-RateLimit-Limit`, `X-RateLimit-Remaining` and `X-RateLimit-Reset`;",
            "exceeding the limit returns `429` with `Retry-After`.",
            "",
            "This route is deliberately separate from the paid route. Nothing here is",
            "billed and no settlement occurs.",
          ].join("\n"),
          security: [{ sandboxKey: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["text"],
                  properties: {
                    text: {
                      type: "string",
                      example: "algorand adoption growth and strong buy signal",
                    },
                  },
                },
                example: { text: "algorand adoption growth and strong buy signal" },
              },
            },
          },
          responses: {
            200: {
              description: "Free preview returned.",
              headers: {
                "X-RateLimit-Limit": {
                  description: "Requests allowed per window.",
                  schema: { type: "integer", example: 10 },
                },
                "X-RateLimit-Remaining": {
                  description: "Requests left in the current window.",
                  schema: { type: "integer", example: 7 },
                },
                "X-RateLimit-Reset": {
                  description: "Unix time the window resets.",
                  schema: { type: "integer", example: 1790778000 },
                },
              },
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/SandboxAnalysis" },
                },
              },
            },
            400: {
              description: "Malformed request.",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: { error: { type: "string", example: "text is required" } },
                  },
                },
              },
            },
            401: {
              description: "Missing or invalid sandbox key.",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      error: { type: "string", example: "Invalid or missing sandbox key." },
                      hint: { type: "string" },
                    },
                  },
                },
              },
            },
            429: {
              description: "Rate limit exceeded. Retry after `Retry-After` seconds.",
              headers: {
                "Retry-After": {
                  description: "Seconds until the window resets.",
                  schema: { type: "integer", example: 42 },
                },
              },
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      error: { type: "string" },
                      retryAfterSeconds: { type: "integer" },
                    },
                  },
                },
              },
            },
          },
        },
      },
      "/discovery/resources": {
        get: {
          tags: ["Free"],
          summary: "Bazaar discovery document",
          description:
            "Publishes the endpoint so it is discoverable in the x402 Bazaar catalogue. " +
            "Tagged `x402-global-challenge`.",
          responses: {
            200: {
              description: "Discovery document.",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Discovery" },
                },
              },
            },
          },
        },
      },
      "/healthz": {
        get: {
          tags: ["Free"],
          summary: "Health and active configuration",
          responses: {
            200: {
              description: "Service is up.",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      ok: { type: "boolean", example: true },
                      network: { type: "string", example: network },
                      payTo: { type: "string", example: payTo },
                      price: { type: "string", example: price },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    components: {
      securitySchemes: {
        sandboxKey: {
          type: "apiKey",
          in: "header",
          name: "x-sandbox-key",
          description:
            "Published demo key for the sandbox preview: `sandbox-demo-key`. " +
            "It is not a secret and grants no access to the paid route. " +
            "Rate limited to 10 requests per 60 seconds.",
          example: "sandbox-demo-key",
        },
        x402Payment: {
          type: "apiKey",
          in: "header",
          name: "PAYMENT-SIGNATURE",
          description:
            "Base64-encoded x402 payment payload. Obtain it by sending an unpaid request, " +
            "reading the PAYMENT-REQUIRED header, building a payment for those requirements, " +
            "and retrying with this header set.",
        },
      },
      schemas: {
        SandboxAnalysis: {
          type: "object",
          properties: {
            sentiment: {
              type: "string",
              enum: ["bullish", "bearish", "mixed", "neutral"],
              example: "bullish",
            },
            confidence: { type: "number", example: 1 },
            signals: {
              type: "object",
              properties: {
                bullish: { type: "integer", example: 3 },
                bearish: { type: "integer", example: 0 },
              },
            },
            analysed: {
              type: "object",
              properties: {
                words: { type: "integer", example: 7 },
                characters: { type: "integer", example: 46 },
              },
            },
            network: { type: "string", example: network },
            sandbox: { type: "boolean", example: true },
            notice: { type: "string" },
          },
        },
        Analysis: {
          type: "object",
          properties: {
            sentiment: {
              type: "string",
              enum: ["bullish", "bearish", "mixed", "neutral"],
              example: "bullish",
            },
            confidence: {
              type: "number",
              minimum: 0,
              maximum: 1,
              description: "Share of the dominant signal among all matched signals.",
              example: 1,
            },
            signals: {
              type: "object",
              properties: {
                bullish: { type: "integer", example: 3 },
                bearish: { type: "integer", example: 0 },
              },
            },
            analysed: {
              type: "object",
              properties: {
                words: { type: "integer", example: 6 },
                characters: { type: "integer", example: 42 },
              },
            },
            network: { type: "string", example: network },
          },
        },
        PaymentRequired: {
          type: "object",
          description: "x402 v2 payment requirement, as sent in the PAYMENT-REQUIRED header.",
          properties: {
            x402Version: { type: "integer", example: 2 },
            error: { type: "string", example: "Payment required" },
            resource: {
              type: "object",
              properties: {
                url: { type: "string" },
                description: { type: "string" },
                mimeType: { type: "string", example: "application/json" },
              },
            },
            accepts: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  scheme: { type: "string", example: "exact" },
                  network: { type: "string", example: network },
                  amount: {
                    type: "string",
                    description: "Amount in the asset's smallest unit (6 decimals).",
                    example: "20000",
                  },
                  asset: {
                    type: "string",
                    description: "ASA id: USDC on the active network.",
                    example: "10458941",
                  },
                  payTo: { type: "string", example: payTo },
                  maxTimeoutSeconds: { type: "integer", example: 300 },
                },
              },
            },
          },
        },
        Discovery: {
          type: "object",
          properties: {
            x402Version: { type: "integer", example: 2 },
            resources: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  address: { type: "string", example: payTo },
                  network: { type: "string", example: network },
                  config: { type: "object" },
                  resource: { type: "object" },
                },
              },
            },
          },
        },
      },
    },
  };
}
