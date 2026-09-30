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
