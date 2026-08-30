# Dwella server

Two things live here, deliberately separate:

- **The AI gateway** (`/ai/*`) — the only component that talks to Anthropic. It
  exists so the API key lives on a server the operator controls rather than inside
  a mobile app bundle, where it would be trivially extractable and spendable by
  anyone who downloads the app.
- **The dispatch service** (`/dispatch/*`, `/provider/*`) — receives service
  requests from the app, gives contractors a web queue to work, and reports status
  back to the homeowner.

## Running

```bash
npm install
export ANTHROPIC_API_KEY=sk-ant-...   # or run `ant auth login`
npm run dev                            # :8787, dispatch at /dispatch
```

With no `DWELLA_PROVIDERS` set, the server generates a random access token for
the launch partner and prints it once at boot. That is a development convenience,
not a default password: it is different every process, so an instance you forgot to
shut down is not a door anyone can walk through.

| Variable | Purpose |
|---|---|
| `ANTHROPIC_API_KEY` | Credentials. `ANTHROPIC_AUTH_TOKEN` or an `ant auth login` profile also work. |
| `PORT` | Listen port. Default `8787`. |
| `DWELLA_MODEL` | Model id. Default `claude-opus-5`. |
| `DWELLA_ALLOWED_ORIGIN` | CORS origin. Defaults to reflecting the request origin — set this in production. |
| `DWELLA_PROVIDERS` | `id:Name:token`, comma-separated. Defines who can sign in to a dispatch queue. |
| `DWELLA_DATA_DIR` | Where dispatch requests and photos are written. Default `./.dispatch-data`. |

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

## Dispatch

| Route | Who | Purpose |
|---|---|---|
| `POST /dispatch/requests` | the app | Files a service request against a provider. Idempotent on `clientRequestId`. |
| `GET /dispatch/requests/:id?token=` | the homeowner | Reads that one request's status back. |
| `GET /dispatch` | a contractor | The dispatch view: sign-in, queue, and one page per job. |
| `GET /provider/api/requests` | a contractor | The queue as JSON. |
| `GET,POST /provider/api/requests/:id` | a contractor | Read a job; move its status, quote, schedule, or close it out. |
| `POST /provider/api/requests/:id/photos` | a contractor | Upload completion photos. |
| `GET /provider/photo/:photoId` | a contractor | A photo, only if it belongs to one of their own jobs. |

Three audiences, three authentication stories, kept apart on purpose:

- **The app posts with no credential.** Anyone can send a provider a job, exactly as
  anyone can telephone their office. What that buys an attacker is a nuisance entry
  in a queue a human reads — not access to anything.
- **The homeowner** reads their request back with a per-request tracking token issued
  at intake. It grants one request and nothing else, so there is no account to create
  and nothing to leak beyond the one job. A wrong token and a wrong id return the same
  `404`, so the endpoint cannot be used to discover which ids exist.
- **The contractor** authenticates as a provider and sees only their own queue.
  Photo access is by ownership of a job that references the photo — possession of an
  id is not access.

Status is a state machine, enforced server-side: a job cannot be completed unless it
was scheduled, cannot move backwards, and `completed` / `declined` / `cancelled` are
terminal. Anything further is a new request, which keeps the audit trail honest. A
refused transition is `409`, not `500` — it means the caller asked for something the
job's state does not allow, not that dispatch is broken.

### What a contractor receives

Only what is needed to quote and schedule the one job: the address and callback
number, the equipment identity and age, that item's service history, the problem
description, and any photos. Not the cost history, not the documents, not the rest
of the record, not the health score. The homeowner sees the entire packet on the
compose screen before it sends, itemised.

Provenance (`documented` / `estimated`) rides all the way to the contractor's screen
and is rendered as a badge beside each spec. A quote built on an estimate the
contractor believed was a fact is the exact trust failure this product exists to
prevent.

### Storage

A JSON file plus a photo directory under `DWELLA_DATA_DIR`, held in memory and
written through on every change (temp file plus rename, so a crash cannot truncate
the queue; a corrupt file is moved aside rather than deleted). That deploys anywhere
with a writable disk and needs no database to stand up. It is **not** safe across
multiple processes — run one instance. When that stops being enough, that is the
signal to move to a real database, and the seam is `src/dispatch/store.ts` alone.

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

**Add authentication to the AI routes.** There is none. Any client that can reach
`/ai/*` can spend your Anthropic budget. Put an authenticating proxy, per-user rate
limiting, and request logging in front of it. The dispatch routes carry their own
authentication, described above.

Set `DWELLA_ALLOWED_ORIGIN` rather than leaving CORS reflecting the caller, and
terminate TLS in front of the process — the dispatch session cookie is marked
`Secure` when `NODE_ENV=production`, and it is `SameSite=Strict` because every state
change in the dispatch view is a plain HTML form and would otherwise be forgeable
cross-site.

Set `DWELLA_PROVIDERS` explicitly so tokens survive a restart, and rotate a
provider's token by editing that variable and redeploying.

Images sent to `/ai/*` are forwarded to the Anthropic API and are not written to disk.
Photos attached to a **service request** are different: they are stored under
`DWELLA_DATA_DIR` so a contractor can look at them, along with the address and
phone number of a real household. Back that directory up, encrypt the volume, and
decide a retention period before you take a second customer.

One shared token per provider is honest for a launch partner with one crew. The
moment two people at a company need different permissions, this needs real per-user
accounts; the seam for that is `authenticate()` returning a richer principal.
