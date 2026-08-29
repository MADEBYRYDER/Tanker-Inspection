/*
 * report.js — builds the finished inspection report.
 *
 * The report renders into an in-app view that is styled for print, so
 * "Print / Save as PDF" produces the deliverable with no server round trip.
 * It can also be exported as a single self-contained HTML file with the
 * photos embedded, which is what usually gets emailed to the shipper.
 */

const Report = (() => {
  const MARK_LABEL = { ok: 'OK', defect: 'DEFECT', na: 'N/A' };

  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    if (attrs) {
      Object.entries(attrs).forEach(([k, v]) => {
        if (v == null || v === false) return;
        if (k === 'class') node.className = v;
        else if (k === 'text') node.textContent = v;
        else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
        else node.setAttribute(k, v === true ? '' : v);
      });
    }
    (Array.isArray(children) ? children : children ? [children] : [])
      .filter(Boolean)
      .forEach(c => node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c));
    return node;
  }

  const isEmpty = v =>
    v == null || (typeof v === 'string' && !v.trim()) ||
    (Array.isArray(v) && !v.length) ||
    (typeof v === 'object' && !Array.isArray(v) && !Object.keys(v).length);

  /* Photo records, resolved once per report build. */
  let photoMap = new Map();

  function photoBlock(ids, opts) {
    const records = (ids || []).map(id => photoMap.get(id)).filter(Boolean);
    if (!records.length) return null;
    return el('div', { class: 'rp-photos' }, records.map(r =>
      el('figure', { class: 'rp-photo' }, [
        el('img', { src: (opts && opts.full) ? r.dataUrl : r.dataUrl, alt: r.shot || r.caption || '' }),
        el('figcaption', {}, [
          el('strong', { text: r.shot || 'Photo' }),
          r.caption ? el('span', { text: ' — ' + r.caption }) : null,
          el('span', { class: 'rp-photo__ts', text: new Date(r.takenAt).toLocaleString() })
        ])
      ])
    ));
  }

  function fieldBlock(field, bucket) {
    const value = bucket[field.key];

    if (field.type === 'note') return null;

    if (field.type === 'checklist') {
      const marks = value || {};
      /* A checklist nobody touched is noise on the report — leave it out
         rather than printing a column of dashes. */
      if (!Object.keys(marks).length) return null;
      const rows = (field.items || []).map(item => {
        const mark = marks[item.key];
        return el('tr', { class: mark ? 'is-' + mark : 'is-blank' }, [
          el('td', { text: item.label }),
          el('td', { class: 'rp-mark rp-mark--' + (mark || 'blank'), text: mark ? MARK_LABEL[mark] : '—' })
        ]);
      });
      return el('div', { class: 'rp-field' }, [
        el('h4', { text: field.label }),
        el('table', { class: 'rp-table' }, [el('tbody', {}, rows)])
      ]);
    }

    if (field.type === 'photos') {
      const block = photoBlock(value);
      if (!block) return null;
      return el('div', { class: 'rp-field' }, [el('h4', { text: field.label }), block]);
    }

    if (field.type === 'repeater') {
      /* Drop entries the inspector added but never filled in. */
      const rows = (value || []).filter(item =>
        (field.fields || []).some(sub => !isEmpty(item[sub.key])));
      if (!rows.length) return null;
      return el('div', { class: 'rp-field' }, [
        el('h4', { text: field.label }),
        el('div', { class: 'rp-items' }, rows.map((item, index) =>
          el('div', { class: 'rp-item' }, [
            el('h5', { text: `${field.itemLabel} ${index + 1}` }),
            el('dl', { class: 'rp-dl' }, (field.fields || []).flatMap(sub => {
              if (sub.type === 'photos') return [];
              const v = item[sub.key];
              if (isEmpty(v)) return [];
              return [el('dt', { text: sub.label }), el('dd', { text: String(v) })];
            })),
            ...(field.fields || [])
              .filter(sub => sub.type === 'photos')
              .map(sub => photoBlock(item[sub.key]))
              .filter(Boolean)
          ])
        ))
      ]);
    }

    if (field.type === 'signature') {
      if (isEmpty(value)) return null;
      return el('div', { class: 'rp-field rp-sig' }, [
        el('h4', { text: field.label }),
        el('img', { class: 'rp-sig__img', src: value, alt: field.label })
      ]);
    }

    if (isEmpty(value)) return null;
    return el('div', { class: 'rp-pair' }, [
      el('span', { class: 'rp-pair__k', text: field.label }),
      el('span', { class: 'rp-pair__v', text: String(value) })
    ]);
  }

  /* Pull every checklist item marked as a defect, for the summary table. */
  function collectDefectMarks(state) {
    const found = [];
    SCHEMA.steps.forEach(step => {
      const bucket = state.data[step.id] || {};
      (step.fields || []).forEach(field => {
        if (field.type !== 'checklist') return;
        const marks = bucket[field.key] || {};
        (field.items || []).forEach(item => {
          if (marks[item.key] === 'defect') found.push({ step: step.title, label: item.label });
        });
      });
    });
    return found;
  }

  function buildReport(state) {
    const setup = state.data.setup || {};
    const defects = state.data.defects || {};
    const signoff = state.data.signoff || {};
    const flagged = collectDefectMarks(state);
    const disposition = defects.disposition || 'Not recorded';
    const dispoClass = /Rejected|Held/.test(disposition) ? 'is-bad'
      : /exceptions|cleaning/i.test(disposition) ? 'is-warn'
        : /Accepted/.test(disposition) ? 'is-good' : '';

    const root = el('article', { class: 'rp' });

    /* Cover -------------------------------------------------------- */
    root.appendChild(el('header', { class: 'rp-head' }, [
      el('div', { class: 'rp-head__top' }, [
        el('div', {}, [
          el('h1', { text: 'Tank Car / Tanker Inspection Report' }),
          el('p', { class: 'rp-head__sub', text: setup.inspectionType || 'Inspection' })
        ]),
        el('div', { class: 'rp-badge ' + dispoClass, text: disposition })
      ]),
      el('div', { class: 'rp-keyfacts' }, [
        ['Reporting mark', setup.reportingMark],
        ['Specification', setup.specPlate],
        ['Commodity', setup.commodity],
        ['UN / NA number', setup.unNumber],
        ['Previous lading', setup.previousLading],
        ['BOL / work order', setup.billOfLading],
        ['Facility', setup.facility],
        ['Track & spot', setup.trackSpot],
        ['Date', setup.date],
        ['Time', [setup.startTime, signoff.endTime].filter(Boolean).join(' – ')],
        ['Inspector', setup.inspector],
        ['Company / ID', setup.inspectorId]
      ].filter(([, v]) => !isEmpty(v)).map(([k, v]) =>
        el('div', { class: 'rp-fact' }, [
          el('span', { class: 'rp-fact__k', text: k }),
          el('span', { class: 'rp-fact__v', text: v })
        ])
      ))
    ]));

    /* Summary ------------------------------------------------------ */
    const summary = el('section', { class: 'rp-section rp-summary' }, [el('h2', { text: 'Summary' })]);
    if (signoff.summary) summary.appendChild(el('p', { class: 'rp-narrative', text: signoff.summary }));
    if (defects.dispositionNotes) {
      summary.appendChild(el('p', { class: 'rp-narrative', text: defects.dispositionNotes }));
    }

    const logged = (defects.items || []).filter(d => !isEmpty(d.description) || !isEmpty(d.area));
    if (logged.length || flagged.length) {
      summary.appendChild(el('h3', { text: 'Findings' }));
      const table = el('table', { class: 'rp-table rp-table--findings' }, [
        el('thead', {}, el('tr', {}, [
          el('th', { text: 'Area' }), el('th', { text: 'Finding' }),
          el('th', { text: 'Severity' }), el('th', { text: 'Action' })
        ])),
        el('tbody', {}, [
          ...logged.map(d => el('tr', {}, [
            el('td', { text: d.area || '—' }),
            el('td', { text: d.description || '—' }),
            el('td', { text: d.severity || '—' }),
            el('td', { text: d.action || '—' })
          ])),
          ...flagged.map(f => el('tr', { class: 'is-checkfail' }, [
            el('td', { text: f.step }),
            el('td', { text: f.label }),
            el('td', { text: 'Checklist defect' }),
            el('td', { text: 'See notes' })
          ]))
        ])
      ]);
      summary.appendChild(table);
    } else {
      summary.appendChild(el('p', { class: 'rp-narrative', text: 'No defects were recorded during this inspection.' }));
    }

    const hasSeal = s => !isEmpty(s.number) || !isEmpty(s.location);
    const sealsFound = ((state.data.sealsExisting || {}).seals || []).filter(hasSeal);
    const sealsNew = ((state.data.sealsNew || {}).seals || []).filter(hasSeal);
    if (sealsFound.length || sealsNew.length) {
      summary.appendChild(el('h3', { text: 'Seal record' }));
      summary.appendChild(el('table', { class: 'rp-table' }, [
        el('thead', {}, el('tr', {}, [
          el('th', { text: 'Stage' }), el('th', { text: 'Location' }),
          el('th', { text: 'Seal number' }), el('th', { text: 'Condition / type' })
        ])),
        el('tbody', {}, [
          ...sealsFound.map(s => el('tr', {}, [
            el('td', { text: 'As found' }), el('td', { text: s.location || '—' }),
            el('td', { class: 'rp-mono', text: s.number || '—' }), el('td', { text: s.condition || '—' })
          ])),
          ...sealsNew.map(s => el('tr', {}, [
            el('td', { text: 'Applied' }), el('td', { text: s.location || '—' }),
            el('td', { class: 'rp-mono', text: s.number || '—' }), el('td', { text: s.type || '—' })
          ]))
        ])
      ]));
    }
    root.appendChild(summary);

    /* Step detail -------------------------------------------------- */
    SCHEMA.steps.forEach((step, index) => {
      const bucket = state.data[step.id] || {};
      const blocks = (step.fields || []).map(f => fieldBlock(f, bucket)).filter(Boolean);
      if (!blocks.length) return;
      const section = el('section', { class: 'rp-section' }, [
        el('h2', { text: `${index + 1}. ${step.title}` })
      ]);
      const pairs = blocks.filter(b => b.classList.contains('rp-pair'));
      const rest = blocks.filter(b => !b.classList.contains('rp-pair'));
      if (pairs.length) section.appendChild(el('div', { class: 'rp-pairs' }, pairs));
      rest.forEach(b => section.appendChild(b));
      root.appendChild(section);
    });

    /* Footer ------------------------------------------------------- */
    root.appendChild(el('footer', { class: 'rp-foot' }, [
      el('p', { text: `Report generated ${new Date().toLocaleString()} · Inspection ID ${state.id}` }),
      el('p', { text: 'Photographs are stored at reduced resolution for transport. Originals remain on the capturing device.' })
    ]));

    return root;
  }

  /* ------------------------------------------------------------------ */

  async function open(state) {
    const ids = App.photoIdsIn(state);
    const records = await Photos.getMany(ids);
    photoMap = new Map(records.map(r => [r.id, r]));

    const host = document.getElementById('reportHost');
    host.innerHTML = '';
    host.appendChild(buildReport(state));

    document.getElementById('printBtn').onclick = () => window.print();
    document.getElementById('exportHtmlBtn').onclick = () => exportHtml(state, host.innerHTML);
    document.getElementById('exportJsonBtn').onclick = () => App.exportJson();

    document.body.classList.add('is-report');
    App.view = 'report';
    window.scrollTo(0, 0);
  }

  function close() {
    document.body.classList.remove('is-report');
    App.view = 'wizard';
  }

  /* A single file that opens anywhere, with the photos already inside it. */
  async function exportHtml(state, innerHtml) {
    const css = await loadReportCss();
    const setup = state.data.setup || {};
    const title = `Inspection Report — ${setup.reportingMark || 'tank car'} — ${setup.date || ''}`.trim();
    const doc = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
body { margin: 0; background: #fff; color: #16181d; font: 15px/1.55 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
.rp { max-width: 900px; margin: 0 auto; padding: 32px 24px 64px; }
${css}
</style>
</head>
<body>${innerHtml}</body>
</html>`;
    const mark = (setup.reportingMark || 'inspection').replace(/[^\w-]+/g, '_');
    const blob = new Blob([doc], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${mark}_${setup.date || 'report'}_report.html`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  /* Pull the .rp-* rules out of the stylesheet so the standalone file
     looks the same as the on-screen report. */
  let cssCache = null;
  async function loadReportCss() {
    if (cssCache != null) return cssCache;
    try {
      const res = await fetch('assets/report.css');
      cssCache = await res.text();
    } catch {
      cssCache = '';
    }
    return cssCache;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  return { open, close };
})();
