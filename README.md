# Dwella

A digital operating system for a house — a permanent record of what a home is made
of, what has been done to it, what it needs next, and what that is likely to cost.

Carfax for your house, with an assistant that knows *this* house.

```
Scan Home → Build Record → Predict Maintenance → DIY or Hire
     ↑                                                  ↓
Transfer Record ← Sell Home ← Improve History ← Record Completed Work
```

---

## What it does

| | |
|---|---|
| **Scan My Home** | Photograph equipment nameplates; the model reads manufacturer, model, serial, specs, and decodes the build year from the serial where it can. |
| **Home Record** | A profile per component — documents, photos, warranties, maintenance and repair history. |
| **Home Timeline** | Chronological history by year with totals. Photograph an invoice and it is read, dated, priced, and filed against the right equipment. |
| **AI Assistant** | Grounded in this home's record. Lookups are answered from the record directly; open-ended questions go to the model with the record as context. |
| **Maintenance** | A calendar built from the equipment you actually own, with a DIY path (steps, materials, tools, time) and a hire path (real price ranges) for every task. |
| **Problem Scanner** | Triage — not diagnosis — from photos plus the home's own history. Urgency, ranked possible causes, safe steps, and an explicit statement of what a photo cannot tell you. |
| **Home Health** | A 0–100 score per system and overall, where every reason is labelled a documented fact or an estimate. |
| **Financial Forecast** | Probability-weighted 1/3/5-year projections and a suggested monthly reserve. |
| **Contractor Marketplace** | The service request is assembled from the record — make, model, serial, age, warranty, history — so the owner explains nothing twice. |
| **Transfer on Sale** | A buyer-facing record: the work transfers, the seller's money and notes do not. |
| **Warranty intelligence** | Coverage about to lapse, ranked by whether the record already shows that item playing up — the one case where a date is worth money. |
| **Spending insights** | Year-over-year, per-item totals, and a straight answer to what to budget next year. |
| **Dispatch** | A web queue for the contractor: the packet, the address, the photos, and a status channel back to the homeowner. |

---

## Architecture: accounts, properties, memberships

**A person and a place are separate objects, and neither owns the other.** This
is non-negotiable and is built in from the first commit, because retrofitting it
means migrating every record in the product.

```
Account ──< Membership >── Property ──< Assets, Tasks, Documents, Warranties,
 (person)     (+ role)      (place)      Timeline, Expenses, Service requests
                                │
                                └──< Ownership periods (append-only)
```

Three things fall out of that separation, none of which is possible if a
property is a field on a user:

- **One account, many properties.** A residence, a beach house, three rentals —
  each with its own entirely separate record. Switch from the address under the
  greeting on the dashboard, or from My Homes.
- **One property, many accounts.** Both owners, a property manager, a parent, a
  contractor with a job to do. Access is per property: someone added to your
  rental sees nothing about your house.
- **The record survives a sale.** Nothing is copied between accounts. The
  property row is untouched — same id, same public id (`DW-829173`), same
  equipment and history. The seller's ownership period gets an end date, the
  buyer's opens, and the memberships are replaced. That is the whole mechanism
  behind a Carfax for a house: the history belongs to the building.

### Roles

| Role | What they can do |
|---|---|
| **Owner** | Everything, including transferring or deleting the property. |
| **Household admin** | Everything day to day — home, equipment, tasks, services, and who else has access. Not transfer or delete. |
| **Manager** | Runs maintenance and services. No costs, no members, no ownership. |
| **Member** | Sees the home and its costs, adds records, completes tasks. |
| **Viewer** | Read-only, and not the costs. |
| **Professional** | Temporary, expiring access for a contractor or inspector: read the record, add the work they did. |

Two lines worth defending: an admin runs the house but cannot sell it, and a
manager does the work without seeing what the owner paid for the kitchen. The
last owner of a property cannot be removed or demoted — a property with no owner
is unreachable and unsellable.

Roles are enforced **server-side**, not just in the UI. `permissionsFor()` in
`src/core/account.ts` is the single source of truth and is imported by both the
app and the server, so the two cannot disagree about who may do what.

### Billing is account-level; memberships are property-level

One card, one payment history, one person responsible — **a plan per house.**
Somebody can hold Dwella Care on their residence, Dwella+ on a rental, and
nothing at all on the beach house.

Every charge carries an account id and, where it is about a building, a property
id. That one field is what turns a transaction list into something a landlord
can read:

```
August 2026 — $246.94
  Main Residence   $39.00
  Rental #1        $39.00
  Rental #2        $160.94   Dwella+ $7.99 · Handyman $121.95 · Care $39.00
  Rental #3         $7.99
```

Pricing is per property. Adding a home is **free** — it starts on Dwella Free
with its own record, schedule, and reminders; you pay for what you put on it.
Dwella+ is $7.99 for the first property and $3.99 for each additional one; Care
is $39 everywhere, because a van visiting an address does not get cheaper
because you own more addresses.

Care benefits are shown as **remaining credits**, not as terms — "1 of 2
seasonal visits left", not "two visits per membership year". Visits count
against the *membership* year rather than the calendar year, so joining in
November does not hand out four visits in five months, and consecutive visits
are spaced four months apart so a "seasonal" visit lands in a different season.

Billing access is separate from household access:

| | Plan and benefits | Payment history and card |
|---|---|---|
| Owner | ✓ | ✓ |
| Billing admin (a flag, not a role) | ✓ | ✓ |
| Household admin | ✓ | — |
| Member / Manager | Benefits only | — |
| Professional | — | — |

A household admin runs the house and can see there is a Care visit left; they
cannot see the card or cancel the membership. Running the house and holding the
account are different responsibilities.

### Property types

Primary residence · Second/vacation home · Rental · Condo/townhome · Under
renovation. V1 does not branch behaviour on these; the data model carries the
distinction now because collecting it later means re-interviewing every user.

## Dwella and Dwella+

**Dwella remembers your home. Dwella+ knows what's coming.**

The free tier is a real product, not a demo. Creating the house, scanning every
system in it, keeping the history, and getting the reminders that stop a water
heater rusting through are free forever, for everyone. The property record is worth
more to the business than eight dollars squeezed out of someone who would otherwise
never start one.

Dwella+ ($7.99/month, or $69.99/year — 27% less) is the forward-looking half:

| | Dwella | Dwella+ |
|---|---|---|
| Home profile, scan, equipment records | ✓ | ✓ |
| Maintenance schedule, reminders, timeline | ✓ | ✓ |
| Receipts and documents | 20 stored | Unlimited |
| Ask Dwella | 5 questions a month* | Unlimited (fair-use ceiling 400/mo) |
| Home health | Every system's status | …plus the reasoning behind each one |
| **Home Forecast** | — | 1, 3, and 5 years, with a monthly reserve |
| **Replacement planning** | — | Per item, probability-weighted |
| **Warranty intelligence** | — | ✓ |
| Problem scanner | 2 scans a month | 40 a month |
| Spending | This year's total | Trends, per-item totals, budget answers |
| Seasonal plans | Standard checklist | Built from your systems and climate |
| DIY guides | Standard steps | Your sizes, model, age, and history |
| Record export | Summary | Complete, with work history and documents |
| Priority service requests | — | ✓ |
| Family sharing | — | Household sharing with roles |
| Homes included | 1 | 1, then $3.99/mo each |

\* Questions answered straight from the record — ages, dates, costs, warranties,
filter sizes, what's overdue — **never** count against the allowance. They are a
local lookup against the owner's own data and cost nothing to serve.

**Dwella Portfolio** covers five properties before the per-home charge starts,
for landlords and property managers. Someone with six rentals has a harder
version of the same problem a homeowner has — which HVAC is at which address,
which lease property needs filters, what Oak Street cost last year — and the
architecture already answers it. Per-home pricing rather than a flat fee, because
thirty-seven records cost thirty-seven times as much to hold and forecast against.

A 30-day trial is offered once, at the moment the guided home scan completes —
the first point at which Dwella knows enough about the house for a forecast to say
anything true. Offering it during onboarding would be selling a projection of an
empty record.

### Rules the entitlement code enforces

- **Safety is never paywalled.** `proOnlyReason` and every catalogued hazard render
  on both plans. What Dwella+ adds to a DIY guide is your filter size and your
  service history — convenience and money, never safety.
- **Nothing is deleted or locked when a subscription ends.** The record stays; only
  the forecasting stops.
- **Priority service ranks within an urgency band, never across one.** A
  subscriber's routine job never gets in front of somebody's emergency.
- **Allowances state the real number**, including for subscribers. A gauge that
  only appears when you are running out is a pressure tactic.
- **The paywall never quotes the answer it is selling.** It counts real things in
  the record — systems, aging items, live warranties — and stops there.

`src/core/entitlements.ts` is the single source of truth for all of it, including
the published comparison table, and `src/core/entitlements.test.ts` asserts that
the table and the rules cannot drift apart.

---

## Design direction

Apple Home meets Carfax meets a private-banking app — not a contractor portal.

The homeowner is being asked to trust a $9,000 replacement warning, and the visual
language software normally uses to signal intelligence (gradients, glowing accents,
a chat bubble on every screen) reads as marketing. Marketing is the opposite of what
this product is selling. So: warm off-white ground, near-black text, generous space,
thin line icons, and colour used **only** to carry status.

| Token | Use |
|---|---|
| Muted sage | Healthy |
| Amber | Needs attention |
| Red | Genuinely urgent — rare by design, so it still means something |
| Soft blue | Informational and AI actions, deliberately quiet |

**Navigation is five items with the camera in the middle**, elevated off the bar:

```
Home  ·  Timeline  ·  ( Scan )  ·  Tasks  ·  Profile
```

That is the product in one row. See something → scan it.

**One design rule is non-negotiable:** the homeowner should never have to hunt
through the app to work out what to do next. Every screen answers it.

- **Home** — what needs my attention? Health ring, the specific things wrong, what's
  coming, then the systems themselves.
- **Asset** — what do I know about this thing? Age, last service, next task, and a
  replacement *window* rather than a false-precision date.
- **Task** — what should I do? DIY steps and materials, or a contractor price and a
  one-tap request.
- **Scan** — add information effortlessly. Four large choices, not twenty menu items.
- **Timeline** — what has happened to my house?

The AI is contextual, never a destination. It appears as one quiet row on the
dashboard and at the bottom of each asset page, and its answers render as tappable
task cards rather than paragraphs.

---

## Running it

```bash
npm install
npm run web        # opens in a browser — quickest way to look at it
npm start          # Expo — press i / a, or scan the QR with Expo Go on your phone
```

The app is fully usable at this point. On first launch, **Explore a sample home**
loads a worked example (a 1998 coastal home with twelve years of history) and every
screen fills in with real computed numbers.

The browser build is the fastest way to see it and needs no phone or simulator.
Everything works there except the camera flows, which need a real device — so for
scanning equipment, capturing invoices, and the problem scanner, use Expo Go.

### The AI gateway

Photo identification, document reading, problem triage, and open-ended assistant
questions need a model. They go through a small server that holds the Anthropic API
key:

```bash
cd server
npm install
export ANTHROPIC_API_KEY=sk-ant-...          # or run `ant auth login`
npm run dev                                   # listens on :8787
```

Then point the app at it:

```bash
EXPO_PUBLIC_AI_GATEWAY_URL=http://localhost:8787 npm start
```

(or set `expo.extra.aiGatewayUrl` in `app.json`). Use your machine's LAN IP rather
than `localhost` when running on a physical device.

**The app never holds the API key.** A key shipped inside a mobile binary is a key
you have published — it can be extracted from the app bundle in minutes and spent by
anyone who downloads the app. The gateway exists solely so that never happens.

### Without a gateway

Everything that does not require a model runs on-device and works with no gateway at
all: the maintenance schedule, health scoring, cost forecasting, the record export,
and the assistant's record lookups. Equipment can be entered by hand, and every
downstream feature behaves identically either way. The features that do need a model
say so plainly rather than failing silently.

---

## Verifying it

```bash
npm test           # 85 unit tests over the domain engines
npm run typecheck  # app
npx expo export --platform ios     # proves the whole app bundles
cd server && npm run typecheck
```

---

## How it is put together

```
app/                    expo-router screens
  (tabs)/               home · timeline · scan · tasks · profile
  scan/guided           the whole-home walkthrough, with progress
  scan/equipment        capture → confirm → save
  component/[id]        asset page
  task/[key]            one task, DIY and hire paths
  problem/ document/    AI capture flows
  service/[id]          request packet + close-out
  health · costs        score breakdown, cost forecast
  assistant             contextual, reached from Home and asset pages
  record/               Home Record and transfer copy

src/
  core/                 pure domain logic — no React, no I/O, fully tested
    types.ts            the model, built around Provenance and Visibility
    catalog/            lifespans, replacement costs, the maintenance library
    engine/             age · schedule · health · forecast · timeline ·
                        warranty · serviceRequest · transfer · query · guided
  ai/                   schemas (shared with the server) and the gateway client
  state/                zustand store, persisted to AsyncStorage
  ui/                   theme, components, capture helpers
  data/sampleHome.ts    the worked example

server/                 the AI gateway — the only thing that talks to Anthropic
```

### Two ideas that run through everything

**Provenance.** Every fact carries where it came from. A serial number read off a
nameplate is not the same kind of fact as an age the app guessed from the year the
house was built, and the UI is required to say which is which. Nothing in the scoring
or forecasting engines launders an estimate into a documented fact, and the model is
told the difference in its grounding context and instructed not to blur it. This is
the whole credibility of the product: a homeowner who catches the app stating a guess
as a fact once will not trust the $9,000 replacement warning later.

**Visibility.** Records split into what transfers with the house and what stays with
the person. The work transfers — the roof was replaced in 2025, by whom, under what
warranty. The money does not. Redaction drops private entries entirely rather than
blanking fields, because a redacted-but-present row still leaks that something
happened.

### Derived state is never stored

The schedule, health score, and forecast are pure functions of the record, recomputed
on read. Logging one completed task immediately and consistently reshapes the
calendar, the score, and the five-year projection — there is no second source of
truth to drift.

### The forecast is probabilistic on purpose

Treating the replacement year as a point estimate gives a forecast that lurches from
$0 to $9,000 between one year and the next, which is exactly the planning failure the
feature exists to prevent. Instead, replacement is modelled as a triangular
distribution over 0.75–1.40 of rated life, and the forecast asks a conditional
question: given this unit has survived to where it is now, what is the chance it
needs replacing inside the horizon? Cost is charged in proportion. A 13-year-old
condenser does not cost you $8,500 next year — it carries roughly a 48% chance in
that window, so the projection charges about half, and the monthly reserve stays
stable.

### The assistant answers lookups without a model

"What size filter", "when was the roof replaced", "how much have I spent" are
database reads. `src/core/engine/query.ts` answers them deterministically — faster,
free, offline, and impossible to hallucinate. The same module builds the grounding
context the model sees when a question genuinely needs reasoning. The UI labels which
of the two answered.

---

## Deliberate limitations

- **No accounts, no sync.** The record lives on the device. Nothing leaves the phone
  unless you send a photo for identification or share a service request. The trade-off
  is real: a lost phone loses the record. Export from the Home Record screen.
- **The gateway has no authentication.** It validates and size-caps input, but any
  client that can reach it can spend your API budget. Put auth and rate limiting in
  front of it before exposing it publicly.
- **Lifespan and cost figures are population averages** drawn from published
  component life-expectancy data and typical installed pricing, adjusted for climate
  and home size. They describe typical equipment, not yours, and are labelled
  estimates everywhere they surface.
- **One task per system, not per system per home.** A home with two independent HVAC
  systems and two air handlers gets two filter reminders (they anchor to the air
  handlers), but the component model has no explicit notion of a "system", so unusual
  configurations may need manual adjustment.
- **Server-side refusal fallbacks are not enabled.** The current guidance is to opt
  into `fallbacks` on Opus 5 by default, but combining the `beta` messages endpoint
  with the `messages.parse` structured-output helper is not a documented pairing, and
  an unverifiable 400 in production would be worse than no fallback for a workload
  (reading equipment nameplates) that is not refusal-prone. Refusals are instead
  detected explicitly via `stop_reason` and surfaced as a clean 422.
- **Not a substitute for inspection.** For anything involving gas, combustion, carbon
  monoxide, electrical work, or structure, the app routes to a qualified trade rather
  than walking anyone through it.
