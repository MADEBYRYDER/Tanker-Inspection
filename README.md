# Tank Car Inspection

A guided, step-by-step web app for documenting a tank car / tanker inspection —
from photographing the seals as found, through every hatch, fitting and valve,
to a printable report with all the photos in it.

Built to be used one-handed on a phone, on a track, with no signal. It is a
single static site: no build step, no server, no accounts, no dependencies.

<!-- screenshots live in docs/ if you add them -->

## What it does

**Walks you through 15 steps**, each with plain-language guidance on what to
photograph and what to look for:

| # | Step | What it captures |
|---|------|------------------|
| 1 | Inspection Details | Reporting mark, spec, commodity, BOL, inspector, location |
| 2 | Safety & Access | Blue flag, derail, chocks, grounding, fall protection, gas reading |
| 3 | Overall Condition | Four-side walkaround photos, shell/jacket/coating condition |
| 4 | Placards, Stencils & Test Dates | Placards, spec plate, tank and service equipment test dates |
| 5 | Existing Seals — As Found | Every seal photographed and logged **before** any is broken |
| 6 | Manway / Hatch Cover | Eyebolts, hinge, gasket, sealing face |
| 7 | Top Fittings & Housing | PRV and its test tag, vacuum relief, gauging, thermowell, caps |
| 8 | Liquid & Vapor Valves | Handle positions, caps and plugs, packing, flanges |
| 9 | Bottom Outlet & Underframe | Internal valve, outlet cap, protective skid, staining |
| 10 | Interior Condition | Visual-from-the-manway check: cleanliness, heel, lining |
| 11 | Running Gear & Structure | Wheels, trucks, brakes, couplers, hand brake |
| 12 | Leak Check & Final Walkaround | Everything closed, final perimeter check |
| 13 | New Seals Applied | Seal numbers for the bill of lading, each photographed |
| 14 | Defects & Disposition | Findings with severity, action and who was notified |
| 15 | Review & Sign-off | Completeness check, summary, on-screen signature |

**Guided photo capture.** Each photo step lists the shots that belong in the
record — "Full car, left side, whole length in frame", "Close-up, seal number
readable". Tap a shot to open the camera with that label already attached; the
chip turns green once you have it, so you can see at a glance what is still
missing.

**Three-state checklists.** Every check is OK / Defect / N/A. Anything marked
Defect turns red and is pulled automatically into the Findings table on the
report, so a checked box cannot quietly disappear.

**Repeating entries** for seals and defects — add as many as the car has, each
with its own photos.

**Completeness check** on the sign-off step lists every step with a gap and
links straight to it, so you find out what is missing while you are still
standing at the car.

**A real report at the end**, with three outputs:
- **Print / Save as PDF** — print-styled, page-break aware
- **Report (HTML)** — one self-contained file with the photos embedded, for email
- **Backup (JSON)** — full data plus photos, for archiving or moving to another device

## Running it

It is a static site. Any of these work:

```bash
python3 -m http.server 8000     # then open http://localhost:8000
npx serve .
```

Opening `index.html` directly from the filesystem mostly works, but some
browsers restrict IndexedDB on `file://` — serve it over HTTP if photos are not
sticking.

### Deploying

Push to GitHub and turn on **Pages → Deploy from branch**, pointing at the repo
root. Nothing to build. Once loaded over HTTPS the service worker caches the app
shell, so it opens and runs with no connection, and it can be installed to a
phone's home screen ("Add to Home Screen") and used like a native app.

## Where the data lives

Everything is stored **on the device only**, in IndexedDB — inspections, photos
and signatures. Nothing is uploaded and there is no backend to upload it to.

That has one consequence worth knowing: clearing browser data deletes
inspections. Use **Backup (JSON)** from the menu when an inspection matters, and
finish an inspection with **Archive and start new** rather than discarding it.
Archived inspections are listed in the menu and can be reopened.

Photos are downscaled to 1600px on the long edge and stored as JPEG (~200–400 KB
each), which keeps a full inspection to a few megabytes. The originals stay in
the device's camera roll if the camera app saved them there.

## Customising the inspection

The whole workflow — steps, questions, checklists, photo shot lists, guidance
text — is data in [`js/schema.js`](js/schema.js). Adding a check, a photo
requirement, or a whole new step means editing that file; the renderer, the
progress tracking and the report all pick it up automatically.

Field types available: `text`, `textarea`, `number`, `date`, `time`, `select`,
`radio`, `photos`, `checklist`, `repeater`, `signature`, and `note` for safety
callouts.

```js
{
  key: 'checks', type: 'checklist', label: 'Manway condition',
  items: [
    { key: 'eyebolts', label: 'All eyebolts present, swung in and nuts tight' },
    // ...
  ]
}
```

## Project layout

```
index.html               app shell
assets/styles.css        app UI (dark, large tap targets)
assets/report.css        the report — also inlined into the HTML export
js/schema.js             the inspection workflow (edit this to change it)
js/storage.js            IndexedDB wrapper + photo capture/downscaling
js/app.js                state, field rendering, navigation, export/import
js/report.js             report generation and the standalone HTML export
sw.js                    offline caching of the app shell
```

## Scope

This app is a documentation and workflow tool. The step sequence and checks are
modelled on common tank car pre-load / post-load practice, but they are a
starting point, not a compliance document — every facility, carrier and
commodity carries its own requirements. Adapt `js/schema.js` to your own SOPs
and the regulations that apply to you before putting it into service, and treat
the safety callouts in the app as reminders rather than as a substitute for your
site's procedures.
