# Sentiment402

A pay-per-request market sentiment analysis API on Algorand. Each call is paid
for individually in USDC through the x402 protocol, so cost tracks actual use
instead of a subscription commitment.

Built for the [Algorand Global x402 Challenge](https://algorand.co/global-x402-challenge).

## Why this exists

Sentiment data is normally sold behind a subscription, a seat licence, or a bulk
data contract. All three price a user out before they have received any value
from the data. A single analyst or a small product team that wants to classify a
handful of headlines has no sensible way to buy that access, so the practical
effect is that the data is either unaffordable or simply unavailable to them.

Sentiment402 removes the up-front commitment. Every request is priced
independently and settled on chain, so the cost of using the service is exactly
the cost of the requests actually made. A caller who wants to classify one
headline pays for one classification. A caller with volume gets a proportionally
lower effective unit cost without ever negotiating or committing to a contract.

## The problem it solves, in one paragraph

Analysts, developers, and small product teams need sentiment scoring as a
component of something they are building, but the prevailing pricing model
requires them to forecast usage before the integration has proved useful. The
pay-per-request model removes that forecast requirement entirely. The target
user is specifically the developer embedding the capability into a trading
dashboard, news pipeline, or research notebook, rather than a human consumer of
a finished analytics product.

## How it uses x402 on Algorand

The endpoint serves `POST /api/analyze`, which takes a text sample and returns a
sentiment label with a confidence score and the bullish/bearish signals behind
it. An unpaid request receives an HTTP 402 Payment Required response carrying an
x402 v2 payment requirement. That requirement names the exact scheme, network,
asset, amount, and the `payTo` address that must receive the funds, so what is
owed and to whom is never ambiguous.

Payment on Algorand is an Algorand Standard Asset (ASA) transfer rather than an
EVM-style authorisation, implemented with the AVM exact scheme. USDC moves from
the caller to the service's `payTo` address, is verified and settled by the
[GoPlausible facilitator](https://facilitator.goplausible.xyz), and only then is
the analysis response served.

Two properties follow from that design:

- **A caller is never charged for a response they did not receive.** Settlement
  is atomic with the transaction group, so payment and delivery cannot diverge.
- **The service never holds custody of customer funds.** Its key is only ever
  used to build payment requirements. Verification, on-chain settlement, and
  response delivery are distinct steps, and the facilitator is the party that
  attests the payment landed.

## Usage

An unpaid request:

```bash
curl -i -X POST http://127.0.0.1:8402/api/analyze \
  -H 'Content-Type: application/json' \
  -d '{"text":"algorand growth and strong buy signals"}'
```

```http
HTTP/1.1 402 Payment Required
PAYMENT-REQUIRED: eyJ4ND...
```

A paid request adds the `PAYMENT-SIGNATURE` header and returns the analysis:

```json
{
  "sentiment": "bullish",
  "confidence": 0.67,
  "signals": { "bullish": 2, "bearish": 1 },
  "analysed": { "words": 6, "characters": 35 },
  "network": "algorand:SGO1GKSzyE7IEPItTxCByw9x8FmnrCDexi9/cOUJOiI="
}
```

## Discovery

`GET /discovery/resources` serves the Bazaar discovery document so the endpoint
is listed in the x402 catalogue, tagged for the challenge.

## Configuration

| Variable | Purpose |
|---|---|
| `X402_PAY_TO` | Algorand address that receives USDC. Required. |
| `X402_NETWORK` | CAIP-2 network id. Defaults to Testnet. |
| `X402_PRICE_USDC` | Price per request in USDC. Default `0.02`. |
| `X402_FACILITATOR_URL` | Facilitator base URL. |
| `PORT` | Listen port. Default `8402`. |

The network identifiers used here are the reference-suffixed CAIP-2 ids the
facilitator advertises through its `/supported` endpoint. The shorter form in the
package README is rejected by route validation:

| Network | Identifier | USDC ASA |
|---|---|---|
| Testnet | `algorand:SGO1GKSzyE7IEPItTxCByw9x8FmnrCDexi9/cOUJOiI=` | `10458941` |
| Mainnet | `algorand:wGHE2Pwdvd7S12BL5FaOP20EGYesN73ktiC1qzkkit8=` | `31566704` |

## Running it

```bash
npm install
X402_PAY_TO=<your-algorand-address> npm start
```

## Tests

```bash
npm test
```

## Security

This service holds no customer funds. Its Algorand key is only used to build
payment requirements; verification and settlement happen at the facilitator.
Do not reuse a key across Mainnet and Testnet.

## License

MIT
