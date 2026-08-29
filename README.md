# Homestead

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
