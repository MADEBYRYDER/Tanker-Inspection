# Homestead AI gateway

The only component that talks to Anthropic. It exists so the API key lives on a
server the operator controls rather than inside a mobile app bundle, where it would
be trivially extractable and spendable by anyone who downloads the app.

## Running

```bash
npm install
export ANTHROPIC_API_KEY=sk-ant-...   # or run `ant auth login`
npm run dev                            # :8787
```

| Variable | Purpose |
|---|---|
| `ANTHROPIC_API_KEY` | Credentials. `ANTHROPIC_AUTH_TOKEN` or an `ant auth login` profile also work. |
| `PORT` | Listen port. Default `8787`. |
| `HOMESTEAD_MODEL` | Model id. Default `claude-opus-5`. |
| `HOMESTEAD_ALLOWED_ORIGIN` | CORS origin. Defaults to reflecting the request origin — set this in production. |

## Endpoints

| Route | Purpose | Effort |
|---|---|---|
| `GET /health` | Liveness and the configured model. | — |
| `POST /ai/scan` | Identify equipment from photos of it and its nameplate. | `high` |
| `POST /ai/document` | Extract an invoice, receipt, or warranty into a record entry. | `high` |
| `POST /ai/problem` | Triage a reported problem against the home's record. | `xhigh` |
| `POST /ai/assistant` | Answer a question grounded in the home's record. | `high` |

Every route uses structured outputs against the Zod schemas in
`../src/ai/schemas.ts`, which the app imports too — so a response that does not
conform fails at this boundary rather than arriving half-parsed at a review screen
and being written into a permanent record.

Problem triage runs at `xhigh` because its urgency call has real consequences: the
difference between "schedule someone next week" and "leave the house and call the gas
company" is the most load-bearing output in the product.

## Input limits

Requests are treated as untrusted. Images are capped at 6 per request and ~5 MB each
(base64 is stripped of any `data:` prefix and whitespace, which the API rejects);
free text is length-capped; conversation history is validated turn by turn and
truncated to the last 8.

## Errors

| Status | Meaning |
|---|---|
| `400` | Input validation — too many images, wrong media type, missing field. |
| `422` | The model declined the request (`stop_reason: "refusal"`), with its category. |
| `429` | Rate limited upstream. |
| `502` | Upstream API error, or output that did not match the schema. |
| `500` | Missing or invalid credentials, or an unexpected fault. |

## Before deploying this publicly

**Add authentication.** There is none. Any client that can reach this server can
spend your Anthropic budget. Put an authenticating proxy, per-user rate limiting, and
request logging in front of it.

Set `HOMESTEAD_ALLOWED_ORIGIN` rather than leaving CORS reflecting the caller, and
terminate TLS in front of the process.

Images are forwarded to the Anthropic API and are not written to disk or retained by
this server.
