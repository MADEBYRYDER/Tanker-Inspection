import type { ProviderAccount } from './providers';
import type { StoredRequest } from './store';
import type { DispatchStatus } from '../../../src/dispatch/contract';
import { ALLOWED_TRANSITIONS } from '../../../src/dispatch/contract';

/**
 * The dispatch view.
 *
 * Server-rendered HTML with plain forms, and that is the design decision that
 * matters most here. This gets used in a truck, one-handed, on a phone with two
 * bars — so there is no build step, no client framework, no hydration wait, and
 * every action works with JavaScript disabled or still loading. Photo upload is
 * the single progressive enhancement, and its absence degrades to filing the
 * completion without photos rather than to a broken button.
 *
 * It deliberately does not look like the homeowner app. That app is calm and
 * spacious because someone is browsing their house on a sofa. This is a work
 * queue: dense, high-contrast, urgency legible from arm's length, and the
 * address and phone number reachable in one tap before anything else.
 */

/* -------------------------------------------------------------------------
 * Escaping
 * ---------------------------------------------------------------------- */

/**
 * Everything in a packet was typed by a homeowner on a phone and is rendered
 * into a contractor's browser. It is untrusted text, without exception.
 */
function esc(value: unknown): string {
  if (value === undefined || value === null) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** For values interpolated into an href — refuses anything but the scheme we intend. */
function escTel(value: string): string {
  return encodeURIComponent(value.replace(/[^0-9+]/g, ''));
}

/* -------------------------------------------------------------------------
 * Formatting
 * ---------------------------------------------------------------------- */

function money(cents: number | undefined): string {
  if (cents === undefined) return '—';
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function ago(iso: string): string {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (!Number.isFinite(minutes)) return '';
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? 'yesterday' : `${days}d ago`;
}

const STATUS_LABEL: Record<DispatchStatus, string> = {
  submitted: 'New',
  acknowledged: 'Acknowledged',
  quoted: 'Quoted',
  scheduled: 'Scheduled',
  completed: 'Completed',
  declined: 'Declined',
  cancelled: 'Withdrawn',
};

/* -------------------------------------------------------------------------
 * Shell
 * ---------------------------------------------------------------------- */

const CSS = `
:root {
  --ground: #EDEEF0;
  --panel: #FFFFFF;
  --panel-2: #F5F6F8;
  --ink: #14171C;
  --ink-2: #4A525E;
  --ink-3: #79828F;
  --rule: #D9DCE1;
  --chrome: #1B2A33;
  --chrome-ink: #E8EDF0;
  --emergency: #C0341A;
  --emergency-bg: #FBE9E5;
  --soon: #9A5B0C;
  --soon-bg: #FBF0DF;
  --routine: #3D5A6C;
  --routine-bg: #E7EEF2;
  --done: #2F6B4F;
  --done-bg: #E3EFE8;
  --focus: #2F6285;
  --sans: "IBM Plex Sans", ui-sans-serif, -apple-system, "Segoe UI", Roboto, sans-serif;
  --mono: "IBM Plex Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace;
}
@media (prefers-color-scheme: dark) {
  :root {
    --ground: #101317;
    --panel: #191D23;
    --panel-2: #21262E;
    --ink: #E7EBF0;
    --ink-2: #A8B2BE;
    --ink-3: #78838F;
    --rule: #2C333C;
    --chrome: #0A0E12;
    --chrome-ink: #E7EBF0;
    --emergency: #F08A72;
    --emergency-bg: #35201C;
    --soon: #E0AC63;
    --soon-bg: #322616;
    --routine: #9FC0D2;
    --routine-bg: #1D2830;
    --done: #7FBF9C;
    --done-bg: #16261E;
    --focus: #7FB3D5;
  }
}

* { box-sizing: border-box; }
body {
  margin: 0;
  background: var(--ground);
  color: var(--ink);
  font-family: var(--sans);
  font-size: 15px;
  line-height: 1.45;
  -webkit-text-size-adjust: 100%;
}
a { color: var(--focus); }
h1, h2, h3 { margin: 0; text-wrap: balance; letter-spacing: -0.015em; }

/* The chrome names the crew whose queue this is — on a shared tablet in a shop,
   that is the first thing that has to be unambiguous. */
header.top {
  background: var(--chrome);
  color: var(--chrome-ink);
  padding: 14px 18px;
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
  position: sticky;
  top: 0;
  z-index: 10;
}
header.top .mark {
  font-family: var(--mono);
  font-size: 11px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  opacity: 0.62;
}
header.top .crew { font-size: 16px; font-weight: 600; }
header.top form { margin-left: auto; }
header.top button.link {
  background: none; border: 1px solid rgba(255,255,255,0.25); color: inherit;
  font: inherit; font-size: 13px; padding: 5px 12px; border-radius: 4px; cursor: pointer;
}

main { max-width: 780px; margin: 0 auto; padding: 18px 14px 64px; }

/* Counts strip: the shape of the queue before any row is read. */
.counts { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 16px; }
.count {
  background: var(--panel); border: 1px solid var(--rule); border-radius: 6px;
  padding: 8px 12px; min-width: 78px;
}
.count b { display: block; font-size: 20px; font-variant-numeric: tabular-nums; line-height: 1.1; }
.count span { font-size: 11px; text-transform: uppercase; letter-spacing: 0.07em; color: var(--ink-3); }

.filter { display: flex; gap: 6px; margin-bottom: 14px; font-size: 13px; }
.filter a {
  text-decoration: none; padding: 5px 11px; border-radius: 999px;
  border: 1px solid var(--rule); color: var(--ink-2); background: var(--panel);
}
.filter a[aria-current="true"] { background: var(--ink); color: var(--ground); border-color: var(--ink); }

/* Queue rows. The urgency stripe is the whole point: it has to read at arm's
   length, before any word does. */
ul.queue { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
ul.queue a {
  display: block; text-decoration: none; color: inherit;
  background: var(--panel); border: 1px solid var(--rule); border-left-width: 5px;
  border-radius: 6px; padding: 12px 14px;
}
ul.queue a:hover { border-color: var(--ink-3); }
ul.queue a:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
.u-emergency { border-left-color: var(--emergency) !important; }
.u-soon { border-left-color: var(--soon) !important; }
.u-routine { border-left-color: var(--routine) !important; }
.row-top { display: flex; align-items: baseline; gap: 10px; }
.row-top h3 { font-size: 15.5px; font-weight: 600; flex: 1; }
.row-meta { font-size: 12.5px; color: var(--ink-3); margin-top: 3px; font-variant-numeric: tabular-nums; }
.row-meta .addr { color: var(--ink-2); }

.chip {
  font-size: 10.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.07em;
  padding: 3px 8px; border-radius: 3px; white-space: nowrap;
}
.chip.emergency { background: var(--emergency-bg); color: var(--emergency); }
.chip.soon { background: var(--soon-bg); color: var(--soon); }
.chip.routine { background: var(--routine-bg); color: var(--routine); }
.chip.done { background: var(--done-bg); color: var(--done); }
.chip.plain { background: var(--panel-2); color: var(--ink-2); }

section.card {
  background: var(--panel); border: 1px solid var(--rule); border-radius: 6px;
  padding: 16px; margin-bottom: 12px;
}
section.card > h2 {
  font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em;
  color: var(--ink-3); margin-bottom: 10px; font-weight: 700;
}

/* Data goes in mono. A model number is a string to be transcribed into a parts
   order, not prose, and a proportional font makes 0/O and 1/l a coin flip. */
dl.spec { margin: 0; display: grid; grid-template-columns: minmax(96px, auto) 1fr; gap: 5px 14px; }
dl.spec dt { font-size: 12.5px; color: var(--ink-3); }
dl.spec dd { margin: 0; font-family: var(--mono); font-size: 13px; word-break: break-word; }
dl.spec dd.prose { font-family: var(--sans); font-size: 14.5px; }
.prov {
  font-family: var(--sans); font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em;
  padding: 1px 5px; border-radius: 3px; margin-left: 6px; vertical-align: 1px;
  background: var(--soon-bg); color: var(--soon);
}
.prov.documented { background: var(--done-bg); color: var(--done); }

.actions { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 14px; }
.actions a.call {
  flex: 1 1 140px; text-align: center; text-decoration: none;
  background: var(--chrome); color: var(--chrome-ink);
  padding: 12px; border-radius: 6px; font-weight: 600;
}
.actions a.map {
  flex: 1 1 140px; text-align: center; text-decoration: none;
  background: var(--panel); border: 1px solid var(--rule); color: var(--ink);
  padding: 12px; border-radius: 6px; font-weight: 600;
}

.problem { font-size: 15.5px; white-space: pre-wrap; }

ol.history { margin: 0; padding-left: 18px; font-size: 14px; color: var(--ink-2); }
ol.history li { margin-bottom: 4px; }

.photos { display: flex; gap: 8px; overflow-x: auto; padding-bottom: 4px; }
.photos img {
  height: 130px; width: auto; border-radius: 5px; border: 1px solid var(--rule);
  background: var(--panel-2);
}

label { display: block; font-size: 12px; text-transform: uppercase; letter-spacing: 0.06em;
  color: var(--ink-3); margin: 12px 0 4px; font-weight: 600; }
input, textarea, select {
  width: 100%; font: inherit; padding: 10px; border-radius: 5px;
  border: 1px solid var(--rule); background: var(--panel-2); color: var(--ink);
}
input:focus-visible, textarea:focus-visible, select:focus-visible, button:focus-visible {
  outline: 2px solid var(--focus); outline-offset: 1px;
}
textarea { min-height: 84px; resize: vertical; }
button.primary {
  margin-top: 14px; width: 100%; font: inherit; font-weight: 650; cursor: pointer;
  background: var(--chrome); color: var(--chrome-ink);
  border: 0; padding: 13px; border-radius: 6px;
}
button.danger { background: none; color: var(--emergency); border: 1px solid var(--rule); }

.tabs { display: flex; gap: 4px; border-bottom: 1px solid var(--rule); margin-bottom: 4px; flex-wrap: wrap; }
.tabs button {
  font: inherit; font-size: 13.5px; font-weight: 600; cursor: pointer;
  background: none; border: 0; border-bottom: 2px solid transparent;
  padding: 9px 12px; color: var(--ink-3);
}
.tabs button[aria-selected="true"] { color: var(--ink); border-bottom-color: var(--ink); }

.notice { border-radius: 5px; padding: 11px 13px; font-size: 14px; margin-bottom: 12px; }
.notice.error { background: var(--emergency-bg); color: var(--emergency); }
.notice.info { background: var(--routine-bg); color: var(--routine); }

.empty { text-align: center; color: var(--ink-3); padding: 48px 20px; }
.back { display: inline-block; margin-bottom: 12px; font-size: 13.5px; text-decoration: none; }
`;

function shell(title: string, body: string, options?: { bodyEnd?: string }): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="color-scheme" content="light dark">
<meta name="robots" content="noindex, nofollow">
<title>${esc(title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600&family=IBM+Plex+Sans:wght@400;600;700&display=swap">
<style>${CSS}</style>
</head>
<body>
${body}
${options?.bodyEnd ?? ''}
</body>
</html>`;
}

/* -------------------------------------------------------------------------
 * Pages
 * ---------------------------------------------------------------------- */

export function loginPage(options: { error?: boolean }): string {
  return shell(
    'Dispatch — sign in',
    `<header class="top"><div><div class="mark">Homestead</div><div class="crew">Dispatch</div></div></header>
<main>
  ${options.error ? '<p class="notice error">That access token was not recognised.</p>' : ''}
  <section class="card">
    <h2>Sign in</h2>
    <p style="margin-top:0;color:var(--ink-2);font-size:14.5px">
      Enter the access token your Homestead operator issued to your company. It signs in this
      device for 30 days.
    </p>
    <form method="post" action="/dispatch/login">
      <label for="token">Access token</label>
      <input id="token" name="token" type="password" autocomplete="current-password"
             autocapitalize="off" autocorrect="off" spellcheck="false" required>
      <button class="primary" type="submit">Sign in</button>
    </form>
  </section>
</main>`,
  );
}

export function queuePage(params: {
  provider: ProviderAccount;
  requests: StoredRequest[];
  counts: Record<string, number>;
  showingOpenOnly: boolean;
}): string {
  const { provider, requests, counts, showingOpenOnly } = params;

  const countTile = (label: string, value: number) =>
    `<div class="count"><b>${value}</b><span>${esc(label)}</span></div>`;

  const rows = requests
    .map((request) => {
      const equipment = request.packet.equipment?.name;
      const meta = [
        request.packet.contact.address
          ? `<span class="addr">${esc(request.packet.contact.address)}</span>`
          : undefined,
        equipment ? esc(equipment) : undefined,
        ago(request.receivedAt),
      ]
        .filter(Boolean)
        .join(' · ');

      return `<li><a class="u-${esc(request.urgency)}" href="/dispatch/r/${esc(request.id)}">
  <div class="row-top">
    <h3>${esc(request.title)}</h3>
    <span class="chip ${request.status === 'completed' ? 'done' : 'plain'}">${esc(STATUS_LABEL[request.status])}</span>
  </div>
  <div class="row-meta">${meta}</div>
</a></li>`;
    })
    .join('\n');

  return shell(
    `Dispatch — ${provider.name}`,
    `<header class="top">
  <div><div class="mark">Homestead Dispatch</div><div class="crew">${esc(provider.name)}</div></div>
  <form method="post" action="/dispatch/logout"><button class="link" type="submit">Sign out</button></form>
</header>
<main>
  <div class="counts">
    ${countTile('New', counts.submitted ?? 0)}
    ${countTile('Acknowledged', counts.acknowledged ?? 0)}
    ${countTile('Quoted', counts.quoted ?? 0)}
    ${countTile('Scheduled', counts.scheduled ?? 0)}
    ${countTile('Completed', counts.completed ?? 0)}
  </div>
  <div class="filter">
    <a href="/dispatch" aria-current="${showingOpenOnly}">Open work</a>
    <a href="/dispatch?all=1" aria-current="${!showingOpenOnly}">Everything</a>
  </div>
  ${
    requests.length === 0
      ? `<div class="empty">${
          showingOpenOnly ? 'No open jobs. Everything is closed out.' : 'Nothing here yet.'
        }</div>`
      : `<ul class="queue">${rows}</ul>`
  }
</main>`,
  );
}

export function requestPage(params: {
  provider: ProviderAccount;
  request: StoredRequest;
  error?: string;
}): string {
  const { provider, request, error } = params;
  const packet = request.packet;
  const contact = packet.contact;
  const next = ALLOWED_TRANSITIONS[request.status];

  const specRows = (packet.equipment?.specs ?? [])
    .map(
      (spec) =>
        `<dt>${esc(spec.label)}</dt><dd>${esc(spec.value)}${
          spec.provenance === 'documented' || spec.provenance === 'contractor'
            ? '<span class="prov documented">documented</span>'
            : `<span class="prov">${esc(spec.provenance)}</span>`
        }</dd>`,
    )
    .join('');

  const equipment = packet.equipment
    ? `<section class="card">
  <h2>Equipment</h2>
  <dl class="spec">
    <dt>Item</dt><dd class="prose">${esc(packet.equipment.name)} — ${esc(packet.equipment.type)}</dd>
    ${packet.equipment.manufacturer ? `<dt>Make</dt><dd>${esc(packet.equipment.manufacturer)}</dd>` : ''}
    ${packet.equipment.modelNumber ? `<dt>Model</dt><dd>${esc(packet.equipment.modelNumber)}</dd>` : ''}
    ${packet.equipment.serialNumber ? `<dt>Serial</dt><dd>${esc(packet.equipment.serialNumber)}</dd>` : ''}
    <dt>Age</dt><dd>${esc(packet.equipment.ageSummary)}</dd>
    ${specRows}
  </dl>
  <p style="margin:12px 0 0;font-size:13.5px;color:var(--ink-2)">${esc(packet.equipment.warrantyStatus)}</p>
</section>`
    : '';

  const history =
    packet.relevantHistory.length > 0
      ? `<section class="card">
  <h2>Service history on this item</h2>
  <ol class="history">
    ${packet.relevantHistory
      .map((h) => `<li>${esc(h.date)} — ${esc(h.title)}${h.vendor ? ` <span style="color:var(--ink-3)">(${esc(h.vendor)})</span>` : ''}</li>`)
      .join('')}
  </ol>
</section>`
      : '';

  const photos =
    request.photoIds.length > 0
      ? `<section class="card">
  <h2>Photos from the homeowner</h2>
  <div class="photos">
    ${request.photoIds
      .map((id) => `<a href="/provider/photo/${esc(id)}" target="_blank" rel="noopener"><img src="/provider/photo/${esc(id)}" alt="Photo from the homeowner" loading="lazy"></a>`)
      .join('')}
  </div>
</section>`
      : '';

  const closed = next.length === 0;

  const statusOptions = next
    .filter((s) => s !== 'completed' && s !== 'declined')
    .map((s) => `<option value="${esc(s)}">${esc(STATUS_LABEL[s])}</option>`)
    .join('');

  /*
   * The forms are separated by what the dispatcher is actually doing, rather
   * than collapsed into one "edit" screen: replying with a quote, booking a
   * window, and closing the job out are three different moments in the day.
   */
  const actions = closed
    ? `<section class="card"><h2>Closed</h2><p style="margin:0;color:var(--ink-2)">
        This job is ${esc(STATUS_LABEL[request.status].toLowerCase())} and can no longer be changed.
        Anything further is a new request.</p></section>`
    : `<section class="card">
  <h2>Update</h2>
  <div class="tabs" role="tablist">
    <button type="button" role="tab" aria-selected="true" data-panel="reply">Reply</button>
    ${next.includes('scheduled') ? '<button type="button" role="tab" aria-selected="false" data-panel="schedule">Schedule</button>' : ''}
    ${next.includes('completed') ? '<button type="button" role="tab" aria-selected="false" data-panel="complete">Close out</button>' : ''}
    ${next.includes('declined') ? '<button type="button" role="tab" aria-selected="false" data-panel="decline">Decline</button>' : ''}
  </div>

  <form method="post" action="/dispatch/r/${esc(request.id)}" data-panel-body="reply">
    ${statusOptions ? `<label for="status">Move to</label><select id="status" name="status">${statusOptions}</select>` : ''}
    <label for="quotedDollars">Quote (optional)</label>
    <input id="quotedDollars" name="quotedDollars" inputmode="decimal" placeholder="0.00"
           value="${request.quotedCents !== undefined ? esc((request.quotedCents / 100).toFixed(2)) : ''}">
    <label for="providerNote">Note to the homeowner</label>
    <textarea id="providerNote" name="providerNote" placeholder="What you found, what it will take, when you can come.">${esc(request.providerNote ?? '')}</textarea>
    <button class="primary" type="submit">Send update</button>
  </form>

  ${
    next.includes('scheduled')
      ? `<form method="post" action="/dispatch/r/${esc(request.id)}" data-panel-body="schedule" hidden>
    <input type="hidden" name="status" value="scheduled">
    <label for="scheduledFor">Appointment</label>
    <input id="scheduledFor" name="scheduledFor" type="datetime-local" required>
    <label for="schedNote">Note to the homeowner</label>
    <textarea id="schedNote" name="providerNote" placeholder="Two-hour window, who to expect.">${esc(request.providerNote ?? '')}</textarea>
    <button class="primary" type="submit">Book it</button>
  </form>`
      : ''
  }

  ${
    next.includes('completed')
      ? `<form method="post" action="/dispatch/r/${esc(request.id)}" data-panel-body="complete" hidden id="completeForm">
    <input type="hidden" name="status" value="completed">
    <input type="hidden" name="completionPhotoIds" id="completionPhotoIds" value="">
    <label for="completedOn">Date of work</label>
    <input id="completedOn" name="completedOn" type="date" value="${esc(new Date().toISOString().slice(0, 10))}" required>
    <label for="vendor">Who did the work</label>
    <input id="vendor" name="vendor" value="${esc(provider.name)}" required>
    <label for="costDollars">Invoice total</label>
    <input id="costDollars" name="costDollars" inputmode="decimal" placeholder="0.00">
    <label for="description">What was done</label>
    <textarea id="description" name="description" placeholder="Replaced the thermocouple; drained and flushed the tank."></textarea>
    <label for="completionPhotos">Completion photos (optional)</label>
    <input id="completionPhotos" type="file" accept="image/*" multiple>
    <p id="uploadStatus" style="font-size:13px;color:var(--ink-3);margin:6px 0 0"></p>
    <button class="primary" type="submit">File the completion</button>
    <p style="font-size:13px;color:var(--ink-3);margin:10px 0 0">
      This writes the work into the homeowner's permanent record, where it transfers with the house.
    </p>
  </form>`
      : ''
  }

  ${
    next.includes('declined')
      ? `<form method="post" action="/dispatch/r/${esc(request.id)}" data-panel-body="decline" hidden>
    <input type="hidden" name="status" value="declined">
    <label for="declineNote">Reason (the homeowner sees this)</label>
    <textarea id="declineNote" name="providerNote" placeholder="Outside our service area; not a trade we cover." required></textarea>
    <button class="primary danger" type="submit">Decline this job</button>
  </form>`
      : ''
  }
</section>`;

  const completion = request.completion
    ? `<section class="card">
  <h2>Filed completion</h2>
  <dl class="spec">
    <dt>Date</dt><dd>${esc(request.completion.completedOn)}</dd>
    <dt>By</dt><dd class="prose">${esc(request.completion.vendor)}</dd>
    <dt>Invoice</dt><dd>${esc(money(request.completion.costCents))}</dd>
  </dl>
  ${request.completion.description ? `<p class="problem" style="margin-top:12px">${esc(request.completion.description)}</p>` : ''}
  ${
    request.completion.photoIds.length > 0
      ? `<div class="photos" style="margin-top:12px">${request.completion.photoIds
          .map((id) => `<img src="/provider/photo/${esc(id)}" alt="Completion photo" loading="lazy">`)
          .join('')}</div>`
      : ''
  }
</section>`
    : '';

  const script = `<script>
(function () {
  // Tabs. Without JS every panel is simply visible, which is a longer page but a working one.
  var tabs = document.querySelectorAll('[data-panel]');
  var panels = document.querySelectorAll('[data-panel-body]');
  tabs.forEach(function (tab) {
    tab.addEventListener('click', function () {
      tabs.forEach(function (t) { t.setAttribute('aria-selected', String(t === tab)); });
      panels.forEach(function (p) { p.hidden = p.getAttribute('data-panel-body') !== tab.getAttribute('data-panel'); });
    });
  });

  // Completion photos upload ahead of the form post, so the form itself stays a
  // plain urlencoded submit and works when this script does not run.
  var picker = document.getElementById('completionPhotos');
  var form = document.getElementById('completeForm');
  if (!picker || !form) return;
  var status = document.getElementById('uploadStatus');
  var idsField = document.getElementById('completionPhotoIds');
  var uploading = false;

  form.addEventListener('submit', function (event) {
    if (uploading) { event.preventDefault(); return; }
    if (!picker.files || picker.files.length === 0 || idsField.value) return;
    event.preventDefault();
    uploading = true;
    status.textContent = 'Uploading photos…';
    Promise.all(Array.prototype.map.call(picker.files, function (file) {
      return new Promise(function (resolve, reject) {
        var reader = new FileReader();
        reader.onerror = reject;
        reader.onload = function () {
          var result = String(reader.result);
          resolve({ data: result.slice(result.indexOf(',') + 1), mediaType: file.type });
        };
        reader.readAsDataURL(file);
      });
    })).then(function (photos) {
      return fetch(location.pathname.replace('/dispatch/r/', '/provider/api/requests/') + '/photos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ photos: photos.filter(function (p) { return /^image\\//.test(p.mediaType); }) })
      });
    }).then(function (response) {
      if (!response.ok) throw new Error('upload failed');
      return response.json();
    }).then(function (json) {
      idsField.value = (json.photoIds || []).join(',');
      uploading = false;
      form.submit();
    }).catch(function () {
      // Never block filing the job on a photo upload — the completion is what matters.
      uploading = false;
      status.textContent = 'Photos could not be uploaded. Filing without them.';
      form.submit();
    });
  });
})();
</script>`;

  return shell(
    `${request.title} — Dispatch`,
    `<header class="top">
  <div><div class="mark">Homestead Dispatch</div><div class="crew">${esc(provider.name)}</div></div>
  <form method="post" action="/dispatch/logout"><button class="link" type="submit">Sign out</button></form>
</header>
<main>
  <a class="back" href="/dispatch">← Queue</a>
  ${error ? `<p class="notice error">${esc(error)}</p>` : ''}

  <section class="card">
    <div class="row-top" style="margin-bottom:8px">
      <h1 style="font-size:21px;flex:1">${esc(request.title)}</h1>
      <span class="chip ${esc(request.urgency)}">${esc(request.urgency)}</span>
    </div>
    <div class="row-meta">
      ${esc(STATUS_LABEL[request.status])} · received ${esc(ago(request.receivedAt))}
      ${request.quotedCents !== undefined ? ` · quoted ${esc(money(request.quotedCents))}` : ''}
      ${request.scheduledFor ? ` · scheduled ${esc(request.scheduledFor.replace('T', ' '))}` : ''}
    </div>
  </section>

  <div class="actions">
    ${contact.phone ? `<a class="call" href="tel:${escTel(contact.phone)}">Call ${esc(contact.ownerName ?? 'homeowner')}</a>` : ''}
    ${contact.address ? `<a class="map" href="https://maps.google.com/?q=${encodeURIComponent(contact.address)}" target="_blank" rel="noopener">Directions</a>` : ''}
  </div>

  <section class="card">
    <h2>Where and who</h2>
    <dl class="spec">
      ${contact.address ? `<dt>Address</dt><dd class="prose">${esc(contact.address)}</dd>` : ''}
      ${contact.ownerName ? `<dt>Contact</dt><dd class="prose">${esc(contact.ownerName)}</dd>` : ''}
      ${contact.phone ? `<dt>Phone</dt><dd>${esc(contact.phone)}</dd>` : ''}
      <dt>Property</dt><dd class="prose">${esc(packet.homeSummary)}</dd>
    </dl>
  </section>

  <section class="card">
    <h2>Reported problem</h2>
    <p class="problem" style="margin:0">${esc(packet.problem)}</p>
  </section>

  ${photos}
  ${equipment}
  ${history}
  ${completion}
  ${actions}

  <p style="font-size:12.5px;color:var(--ink-3);margin-top:18px">
    Fields marked <span class="prov">estimated</span> were inferred from the equipment type and age,
    not read off the unit. Confirm them before pricing parts.
  </p>
</main>`,
    { bodyEnd: script },
  );
}
