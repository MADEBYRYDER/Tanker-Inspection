/*
 * app.js — state, rendering and navigation for the inspection wizard.
 *
 * State shape:
 *   { id, createdAt, updatedAt, currentStep, data: { [stepId]: { [fieldKey]: value } } }
 *
 * Field value encodings:
 *   photos     -> array of photo ids (records live in the photos store)
 *   checklist  -> { [itemKey]: 'ok' | 'defect' | 'na' }
 *   repeater   -> array of objects, each with a private __id
 *   signature  -> data URL string
 *   everything else -> string
 */

const App = (() => {
  const STATE_KEY = 'state';
  const INDEX_KEY = 'index';

  let state = null;
  let view = 'wizard';
  let pendingShot = null;   // shot label to attach to the next captured photo
  let saveTimer = null;

  /* ------------------------------------------------------------------ */
  /* State                                                               */
  /* ------------------------------------------------------------------ */

  function blankState() {
    const now = new Date();
    const s = {
      id: 'insp_' + now.getTime().toString(36),
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      schemaVersion: SCHEMA.version,
      currentStep: 0,
      data: {}
    };
    SCHEMA.steps.forEach(step => { s.data[step.id] = {}; });
    applyDefaults(s);
    return s;
  }

  function applyDefaults(s) {
    const now = new Date();
    const pad = n => String(n).padStart(2, '0');
    const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const time = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
    SCHEMA.steps.forEach(step => {
      (step.fields || []).forEach(field => {
        if (!field.default) return;
        const bucket = s.data[step.id] || (s.data[step.id] = {});
        if (bucket[field.key]) return;
        if (field.default === 'today') bucket[field.key] = today;
        else if (field.default === 'now') bucket[field.key] = time;
        else bucket[field.key] = field.default;
      });
    });
  }

  function save({ immediate = false } = {}) {
    if (!state) return;
    state.updatedAt = new Date().toISOString();
    clearTimeout(saveTimer);
    const write = () => Store.set('kv', STATE_KEY, state)
      .then(() => flashSaved())
      .catch(err => console.error('save failed', err));
    if (immediate) write();
    else saveTimer = setTimeout(write, 350);
  }

  let flashTimer = null;
  function flashSaved() {
    const el = document.getElementById('saveState');
    if (!el) return;
    el.textContent = 'Saved';
    el.classList.add('is-on');
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => el.classList.remove('is-on'), 1200);
  }

  /* Accessors scoped to a step, or to one item inside a repeater. */
  function stepCtx(stepId) {
    const bucket = state.data[stepId] || (state.data[stepId] = {});
    return {
      get: key => bucket[key],
      set: (key, value) => { bucket[key] = value; save(); }
    };
  }
  function itemCtx(item) {
    return {
      get: key => item[key],
      set: (key, value) => { item[key] = value; save(); }
    };
  }

  /* ------------------------------------------------------------------ */
  /* Completeness                                                        */
  /* ------------------------------------------------------------------ */

  function isEmpty(value) {
    if (value == null) return true;
    if (typeof value === 'string') return value.trim() === '';
    if (Array.isArray(value)) return value.length === 0;
    if (typeof value === 'object') return Object.keys(value).length === 0;
    return false;
  }

  /* Returns { requiredTotal, requiredDone, missing[], answered, answerable } */
  function stepStatus(step) {
    const bucket = state.data[step.id] || {};
    const missing = [];
    let requiredTotal = 0, requiredDone = 0;
    let answerable = 0, answered = 0;

    (step.fields || []).forEach(field => {
      const value = bucket[field.key];

      if (field.type === 'checklist') {
        const items = field.items || [];
        answerable += items.length;
        const marks = value || {};
        items.forEach(item => { if (marks[item.key]) answered++; });
        return;
      }

      if (field.type === 'photos') {
        const count = (value || []).length;
        answerable += 1;
        if (count > 0) answered++;
        if (field.required) {
          const need = field.min || 1;
          requiredTotal += 1;
          if (count >= need) requiredDone += 1;
          else missing.push(`${field.label}: ${count} of ${need} photos`);
        }
        return;
      }

      if (field.type === 'repeater') {
        answerable += 1;
        if (!isEmpty(value)) answered++;
        return;
      }

      if (field.type === 'note') return;

      answerable += 1;
      if (!isEmpty(value)) answered++;
      if (field.required) {
        requiredTotal += 1;
        if (isEmpty(value)) missing.push(field.label);
        else requiredDone += 1;
      }
    });

    return { requiredTotal, requiredDone, missing, answered, answerable };
  }

  function stepState(step) {
    const st = stepStatus(step);
    if (st.answered === 0) return 'empty';
    if (st.missing.length > 0) return 'partial';
    if (st.answered < st.answerable) return 'partial';
    return 'done';
  }

  function overallProgress() {
    let answered = 0, answerable = 0;
    SCHEMA.steps.forEach(step => {
      const st = stepStatus(step);
      answered += st.answered;
      answerable += st.answerable;
    });
    return answerable ? Math.round((answered / answerable) * 100) : 0;
  }

  /* Every photo id referenced anywhere in a state object. */
  function photoIdsIn(s) {
    const ids = [];
    SCHEMA.steps.forEach(step => {
      const bucket = (s.data && s.data[step.id]) || {};
      (step.fields || []).forEach(field => {
        if (field.type === 'photos') {
          (bucket[field.key] || []).forEach(id => ids.push(id));
        } else if (field.type === 'repeater') {
          (bucket[field.key] || []).forEach(item => {
            (field.fields || []).forEach(sub => {
              if (sub.type === 'photos') (item[sub.key] || []).forEach(id => ids.push(id));
            });
          });
        }
      });
    });
    return ids;
  }

  /* ------------------------------------------------------------------ */
  /* Small DOM helpers                                                   */
  /* ------------------------------------------------------------------ */

  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    if (attrs) {
      Object.entries(attrs).forEach(([k, v]) => {
        if (v == null || v === false) return;
        if (k === 'class') node.className = v;
        else if (k === 'text') node.textContent = v;
        else if (k === 'html') node.innerHTML = v;
        else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
        else node.setAttribute(k, v === true ? '' : v);
      });
    }
    (Array.isArray(children) ? children : children ? [children] : [])
      .filter(Boolean)
      .forEach(c => node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c));
    return node;
  }

  const uid = (() => { let n = 0; return prefix => `${prefix}_${++n}`; })();

  /* ------------------------------------------------------------------ */
  /* Field renderers                                                     */
  /* ------------------------------------------------------------------ */

  function renderField(field, ctx) {
    switch (field.type) {
      case 'note': return renderNote(field);
      case 'textarea': return renderTextarea(field, ctx);
      case 'select': return renderSelect(field, ctx);
      case 'radio': return renderRadio(field, ctx);
      case 'checklist': return renderChecklist(field, ctx);
      case 'photos': return renderPhotos(field, ctx);
      case 'repeater': return renderRepeater(field, ctx);
      case 'signature': return renderSignature(field, ctx);
      default: return renderInput(field, ctx);
    }
  }

  function fieldShell(field, controls, extraClass) {
    const id = uid('f');
    const label = el('label', { class: 'field__label', for: id }, [
      field.label,
      field.required ? el('span', { class: 'req', text: 'required' }) : null
    ]);
    if (controls.id !== undefined && !controls.id) controls.id = id;
    return el('div', { class: 'field ' + (extraClass || '') }, [
      label,
      field.help ? el('p', { class: 'field__help', text: field.help }) : null,
      controls
    ]);
  }

  function renderNote(field) {
    return el('div', { class: 'callout callout--' + (field.tone || 'info') }, [
      el('span', { class: 'callout__icon', text: field.tone === 'danger' ? '⛔' : field.tone === 'warn' ? '⚠️' : 'ℹ️' }),
      el('p', { text: field.text })
    ]);
  }

  function renderInput(field, ctx) {
    const input = el('input', {
      class: 'input',
      type: field.type === 'number' ? 'number' : field.type || 'text',
      placeholder: field.placeholder || '',
      value: ctx.get(field.key) || '',
      oninput: e => ctx.set(field.key, e.target.value),
      onchange: () => refreshStatus()
    });
    return fieldShell(field, input);
  }

  function renderTextarea(field, ctx) {
    const area = el('textarea', {
      class: 'input input--area',
      rows: field.rows || 3,
      placeholder: field.placeholder || '',
      oninput: e => { ctx.set(field.key, e.target.value); autogrow(e.target); },
      onchange: () => refreshStatus()
    });
    area.value = ctx.get(field.key) || '';
    requestAnimationFrame(() => autogrow(area));
    return fieldShell(field, area);
  }

  function autogrow(area) {
    area.style.height = 'auto';
    area.style.height = Math.min(area.scrollHeight + 2, 420) + 'px';
  }

  function renderSelect(field, ctx) {
    const select = el('select', {
      class: 'input',
      onchange: e => { ctx.set(field.key, e.target.value); refreshStatus(); }
    }, [el('option', { value: '', text: '— select —' })]
      .concat(field.options.map(o => el('option', { value: o, text: o }))));
    select.value = ctx.get(field.key) || '';
    return fieldShell(field, select);
  }

  function renderRadio(field, ctx) {
    const name = uid('r');
    const current = ctx.get(field.key);
    const group = el('div', { class: 'radiogroup' }, field.options.map(option => {
      const input = el('input', {
        type: 'radio', name, value: option,
        onchange: () => { ctx.set(field.key, option); refreshStatus(); }
      });
      input.checked = current === option;
      return el('label', { class: 'radio' }, [input, el('span', { text: option })]);
    }));
    return fieldShell(field, group);
  }

  const MARKS = [
    { key: 'ok', label: 'OK', title: 'Acceptable' },
    { key: 'defect', label: 'Defect', title: 'Defect found — add it to the defect log' },
    { key: 'na', label: 'N/A', title: 'Not applicable to this car' }
  ];

  function renderChecklist(field, ctx) {
    const marks = ctx.get(field.key) || {};
    const list = el('div', { class: 'checklist' }, (field.items || []).map(item => {
      const row = el('div', { class: 'check' });
      const buttons = el('div', { class: 'check__marks' }, MARKS.map(mark => {
        const button = el('button', {
          type: 'button',
          class: 'mark mark--' + mark.key + (marks[item.key] === mark.key ? ' is-on' : ''),
          title: mark.title,
          text: mark.label,
          onclick: () => {
            const next = { ...(ctx.get(field.key) || {}) };
            if (next[item.key] === mark.key) delete next[item.key];
            else next[item.key] = mark.key;
            ctx.set(field.key, next);
            row.className = 'check' + (next[item.key] === 'defect' ? ' is-defect' : '');
            buttons.querySelectorAll('.mark').forEach(b => b.classList.remove('is-on'));
            if (next[item.key]) {
              const idx = MARKS.findIndex(m => m.key === next[item.key]);
              buttons.querySelectorAll('.mark')[idx].classList.add('is-on');
            }
            refreshStatus();
          }
        });
        return button;
      }));
      if (marks[item.key] === 'defect') row.classList.add('is-defect');
      row.appendChild(el('div', { class: 'check__text' }, [
        el('span', { class: 'check__label', text: item.label }),
        item.help ? el('span', { class: 'check__help', text: item.help }) : null
      ]));
      row.appendChild(buttons);
      return row;
    }));

    const bulk = el('div', { class: 'checklist__bulk' }, [
      el('button', {
        type: 'button', class: 'btn btn--ghost btn--sm', text: 'Mark all OK',
        onclick: () => {
          const next = { ...(ctx.get(field.key) || {}) };
          (field.items || []).forEach(item => { if (!next[item.key]) next[item.key] = 'ok'; });
          ctx.set(field.key, next);
          rerenderStep();
        }
      }),
      el('button', {
        type: 'button', class: 'btn btn--ghost btn--sm', text: 'Clear',
        onclick: () => { ctx.set(field.key, {}); rerenderStep(); }
      })
    ]);

    return fieldShell(field, el('div', {}, [list, bulk]));
  }

  /* --- photos ------------------------------------------------------- */

  function renderPhotos(field, ctx) {
    const ids = ctx.get(field.key) || [];
    const wrap = el('div', { class: 'photos' });

    if (field.shots && field.shots.length) {
      const done = new Set();
      const grid = el('div', { class: 'shots' });
      Photos.getMany(ids).then(records => {
        records.forEach(r => { if (r.shot) done.add(r.shot); });
        grid.innerHTML = '';
        field.shots.forEach(shot => {
          grid.appendChild(el('button', {
            type: 'button',
            class: 'shot' + (done.has(shot) ? ' is-done' : ''),
            onclick: () => { pendingShot = shot; camera.click(); }
          }, [
            el('span', { class: 'shot__tick', text: done.has(shot) ? '✓' : '＋' }),
            el('span', { text: shot })
          ]));
        });
      });
      wrap.appendChild(el('p', { class: 'shots__title', text: 'Suggested shots — tap one to capture it' }));
      wrap.appendChild(grid);
    }

    const gallery = el('div', { class: 'gallery' });
    wrap.appendChild(gallery);

    const camera = el('input', {
      type: 'file', accept: 'image/*', capture: 'environment', class: 'visually-hidden',
      onchange: e => intake(e.target.files, e.target)
    });
    const picker = el('input', {
      type: 'file', accept: 'image/*', multiple: true, class: 'visually-hidden',
      onchange: e => intake(e.target.files, e.target)
    });

    const counter = el('span', { class: 'photos__count' });

    wrap.appendChild(el('div', { class: 'photos__actions' }, [
      el('button', { type: 'button', class: 'btn btn--primary', text: '📷 Take photo', onclick: () => { pendingShot = null; camera.click(); } }),
      el('button', { type: 'button', class: 'btn', text: '🖼️ Add from files', onclick: () => { pendingShot = null; picker.click(); } }),
      counter, camera, picker
    ]));

    async function intake(files, input) {
      if (!files || !files.length) return;
      const shot = pendingShot;
      pendingShot = null;
      const busy = el('div', { class: 'gallery__busy', text: `Processing ${files.length} photo${files.length > 1 ? 's' : ''}…` });
      gallery.appendChild(busy);
      const next = [...(ctx.get(field.key) || [])];
      for (const file of Array.from(files)) {
        if (!file.type.startsWith('image/')) continue;
        try {
          const record = await Photos.add(file, { shot: shot || '' });
          next.push(record.id);
        } catch (err) {
          console.error('photo failed', err);
          alert('That photo could not be read: ' + err.message);
        }
      }
      input.value = '';
      ctx.set(field.key, next);
      await paint();
      refreshStatus();
      rerenderShots();
    }

    function rerenderShots() {
      if (!field.shots) return;
      const grid = wrap.querySelector('.shots');
      if (!grid) return;
      Photos.getMany(ctx.get(field.key) || []).then(records => {
        const done = new Set(records.map(r => r.shot).filter(Boolean));
        grid.querySelectorAll('.shot').forEach(button => {
          const label = button.lastChild.textContent;
          const isDone = done.has(label);
          button.classList.toggle('is-done', isDone);
          button.firstChild.textContent = isDone ? '✓' : '＋';
        });
      });
    }

    async function paint() {
      const current = ctx.get(field.key) || [];
      const records = await Photos.getMany(current);
      gallery.innerHTML = '';
      counter.textContent = records.length
        ? `${records.length} photo${records.length === 1 ? '' : 's'}${field.min ? ` · ${field.min} suggested` : ''}`
        : field.min ? `${field.min} suggested` : '';
      counter.className = 'photos__count' + (field.required && records.length < (field.min || 1) ? ' is-short' : '');

      records.forEach((record, index) => {
        gallery.appendChild(el('figure', { class: 'thumb', onclick: () => openViewer(field, ctx, index) }, [
          el('img', { src: record.thumb, alt: record.shot || record.caption || 'inspection photo', loading: 'lazy' }),
          (record.shot || record.caption)
            ? el('figcaption', { text: record.shot || record.caption })
            : null
        ]));
      });
      if (!records.length) {
        gallery.appendChild(el('p', { class: 'gallery__empty', text: 'No photos yet.' }));
      }
    }

    paint();
    return fieldShell(field, wrap, 'field--photos');
  }

  /* Full-screen photo viewer with caption, shot assignment and delete. */
  async function openViewer(field, ctx, index) {
    const ids = ctx.get(field.key) || [];
    let i = index;

    const overlay = el('div', { class: 'viewer', onclick: e => { if (e.target === overlay) close(); } });
    const img = el('img', { class: 'viewer__img', alt: '' });
    const caption = el('input', { class: 'input', placeholder: 'Caption (what this shows)' });
    const shotSelect = el('select', { class: 'input' }, [el('option', { value: '', text: '— no shot label —' })]
      .concat((field.shots || []).map(s => el('option', { value: s, text: s }))));
    const meta = el('p', { class: 'viewer__meta' });

    async function load() {
      const record = await Photos.get(ids[i]);
      if (!record) return close();
      img.src = record.dataUrl;
      caption.value = record.caption || '';
      if (record.shot && !(field.shots || []).includes(record.shot)) {
        shotSelect.appendChild(el('option', { value: record.shot, text: record.shot }));
      }
      shotSelect.value = record.shot || '';
      meta.textContent = `${i + 1} of ${ids.length} · ${record.w}×${record.h} · ${new Date(record.takenAt).toLocaleString()}`;
    }

    caption.addEventListener('input', () => Photos.update(ids[i], { caption: caption.value }));
    shotSelect.addEventListener('change', () => {
      Photos.update(ids[i], { shot: shotSelect.value }).then(() => rerenderStep());
    });

    function step(delta) {
      const next = i + delta;
      if (next < 0 || next >= ids.length) return;
      i = next;
      load();
    }

    function close() {
      document.removeEventListener('keydown', onKey);
      overlay.remove();
      rerenderStep();
    }

    function onKey(e) {
      if (e.key === 'Escape') close();
      if (e.key === 'ArrowLeft') step(-1);
      if (e.key === 'ArrowRight') step(1);
    }
    document.addEventListener('keydown', onKey);

    overlay.appendChild(el('div', { class: 'viewer__panel' }, [
      el('div', { class: 'viewer__top' }, [
        el('button', { type: 'button', class: 'btn btn--ghost', text: '‹ Prev', onclick: () => step(-1) }),
        el('button', { type: 'button', class: 'btn btn--ghost', text: 'Next ›', onclick: () => step(1) }),
        el('button', { type: 'button', class: 'btn btn--ghost viewer__close', text: '✕ Close', onclick: close })
      ]),
      img,
      meta,
      el('div', { class: 'viewer__fields' }, [caption, shotSelect]),
      el('button', {
        type: 'button', class: 'btn btn--danger', text: '🗑 Delete photo',
        onclick: async () => {
          if (!confirm('Delete this photo? It cannot be recovered.')) return;
          const id = ids[i];
          const next = (ctx.get(field.key) || []).filter(x => x !== id);
          ctx.set(field.key, next);
          await Photos.remove(id);
          close();
        }
      })
    ]));

    document.body.appendChild(overlay);
    await load();
  }

  /* --- repeater ------------------------------------------------------ */

  function renderRepeater(field, ctx) {
    const wrap = el('div', { class: 'repeater' });
    const list = el('div', { class: 'repeater__list' });

    function items() { return ctx.get(field.key) || []; }

    function paint() {
      list.innerHTML = '';
      const rows = items();
      if (!rows.length) {
        list.appendChild(el('p', { class: 'gallery__empty', text: `No ${field.itemLabel.toLowerCase()}s recorded.` }));
      }
      rows.forEach((item, index) => {
        const body = el('div', { class: 'repeater__body' });
        (field.fields || []).forEach(sub => body.appendChild(renderField(sub, itemCtx(item))));
        list.appendChild(el('div', { class: 'repeater__item' }, [
          el('div', { class: 'repeater__head' }, [
            el('h4', { text: `${field.itemLabel} ${index + 1}${item.number ? ' — ' + item.number : ''}` }),
            el('button', {
              type: 'button', class: 'btn btn--ghost btn--sm', text: 'Remove',
              onclick: async () => {
                if (!confirm(`Remove ${field.itemLabel} ${index + 1}?`)) return;
                const removed = items()[index];
                const next = items().filter((_, n) => n !== index);
                ctx.set(field.key, next);
                for (const sub of field.fields || []) {
                  if (sub.type === 'photos') {
                    for (const id of removed[sub.key] || []) await Photos.remove(id);
                  }
                }
                paint();
                refreshStatus();
              }
            })
          ]),
          body
        ]));
      });
    }

    wrap.appendChild(list);
    wrap.appendChild(el('button', {
      type: 'button', class: 'btn btn--primary', text: '＋ ' + (field.addLabel || 'Add'),
      onclick: () => {
        const next = [...items(), { __id: 'i_' + Math.random().toString(36).slice(2, 9) }];
        ctx.set(field.key, next);
        paint();
        refreshStatus();
        list.lastElementChild?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }));

    paint();
    return fieldShell(field, wrap, 'field--repeater');
  }

  /* --- signature ----------------------------------------------------- */

  function renderSignature(field, ctx) {
    const canvas = el('canvas', { class: 'sigpad' });
    const wrap = el('div', { class: 'signature' }, [
      canvas,
      el('div', { class: 'signature__actions' }, [
        el('button', { type: 'button', class: 'btn btn--ghost btn--sm', text: 'Clear', onclick: clear })
      ])
    ]);

    let ctx2d, drawing = false, dirty = false;

    function size() {
      const ratio = window.devicePixelRatio || 1;
      const width = canvas.clientWidth || 320;
      const height = 160;
      canvas.width = width * ratio;
      canvas.height = height * ratio;
      canvas.style.height = height + 'px';
      ctx2d = canvas.getContext('2d');
      ctx2d.scale(ratio, ratio);
      ctx2d.lineWidth = 2.2;
      ctx2d.lineCap = 'round';
      ctx2d.lineJoin = 'round';
      ctx2d.strokeStyle = '#111';
      ctx2d.fillStyle = '#fff';
      ctx2d.fillRect(0, 0, width, height);
      const existing = ctx.get(field.key);
      if (existing) {
        const img = new Image();
        img.onload = () => ctx2d.drawImage(img, 0, 0, width, height);
        img.src = existing;
      }
    }

    function point(e) {
      const rect = canvas.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    }

    canvas.addEventListener('pointerdown', e => {
      drawing = true;
      canvas.setPointerCapture(e.pointerId);
      const p = point(e);
      ctx2d.beginPath();
      ctx2d.moveTo(p.x, p.y);
      e.preventDefault();
    });
    canvas.addEventListener('pointermove', e => {
      if (!drawing) return;
      const p = point(e);
      ctx2d.lineTo(p.x, p.y);
      ctx2d.stroke();
      dirty = true;
      e.preventDefault();
    });
    /* Pointer capture keeps the stroke alive when the finger leaves the pad,
       so end on pointerup/cancel only — capture makes the browser fire a
       pointerleave the instant capture is taken, which would cut every
       stroke short. */
    ['pointerup', 'pointercancel'].forEach(type =>
      canvas.addEventListener(type, () => {
        if (!drawing) return;
        drawing = false;
        if (dirty) { ctx.set(field.key, canvas.toDataURL('image/png')); refreshStatus(); }
      }));

    function clear() {
      const width = canvas.clientWidth || 320;
      ctx2d.fillStyle = '#fff';
      ctx2d.fillRect(0, 0, width, 160);
      dirty = false;
      ctx.set(field.key, '');
      refreshStatus();
    }

    requestAnimationFrame(size);
    return fieldShell(field, wrap, 'field--signature');
  }

  /* ------------------------------------------------------------------ */
  /* Step rendering                                                      */
  /* ------------------------------------------------------------------ */

  function rerenderStep() { renderStep(state.currentStep); }

  function renderStep(index) {
    state.currentStep = Math.max(0, Math.min(SCHEMA.steps.length - 1, index));
    const step = SCHEMA.steps[state.currentStep];
    const ctx = stepCtx(step.id);
    const host = document.getElementById('stepHost');
    host.innerHTML = '';

    const header = el('header', { class: 'step__header' }, [
      el('div', { class: 'step__eyebrow' }, [
        el('span', { class: 'step__icon', text: step.icon }),
        el('span', { text: `Step ${state.currentStep + 1} of ${SCHEMA.steps.length}` })
      ]),
      el('h2', { class: 'step__title', text: step.title }),
      step.intro ? el('p', { class: 'step__intro', text: step.intro }) : null
    ]);
    host.appendChild(header);

    (step.notes || []).forEach(note => host.appendChild(renderNote(note)));

    if (step.guidance && step.guidance.length) {
      const open = localStorage.getItem('ti:guidance') !== 'closed';
      const details = el('details', { class: 'guidance' }, [
        el('summary', { text: 'How to do this step' }),
        el('ul', {}, step.guidance.map(g => el('li', { text: g })))
      ]);
      details.open = open;
      details.addEventListener('toggle', () =>
        localStorage.setItem('ti:guidance', details.open ? 'open' : 'closed'));
      host.appendChild(details);
    }

    const form = el('div', { class: 'step__fields' });
    (step.fields || []).forEach(field => form.appendChild(renderField(field, ctx)));
    host.appendChild(form);

    if (step.id === 'signoff') host.appendChild(renderCompleteness());

    renderRail();
    renderFooter();
    refreshStatus();
    document.getElementById('stepScroll').scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
  }

  function renderCompleteness() {
    const wrap = el('div', { class: 'summary' }, [el('h3', { text: 'Completeness check' })]);
    let clean = true;
    SCHEMA.steps.forEach((step, index) => {
      const st = stepStatus(step);
      const gaps = [];
      if (st.missing.length) gaps.push(...st.missing);
      const unanswered = st.answerable - st.answered;
      if (unanswered > 0) gaps.push(`${unanswered} item${unanswered === 1 ? '' : 's'} not filled in`);
      if (!gaps.length) return;
      clean = false;
      wrap.appendChild(el('div', { class: 'summary__row' }, [
        el('button', {
          type: 'button', class: 'summary__link', text: `${index + 1}. ${step.title}`,
          onclick: () => renderStep(index)
        }),
        el('span', { class: 'summary__gaps', text: gaps.join(' · ') })
      ]));
    });
    if (clean) wrap.appendChild(el('p', { class: 'summary__ok', text: '✓ Every step is complete.' }));
    return wrap;
  }

  function renderRail() {
    const rail = document.getElementById('rail');
    rail.innerHTML = '';
    SCHEMA.steps.forEach((step, index) => {
      const status = stepState(step);
      const chip = el('button', {
        type: 'button',
        class: `chip chip--${status}` + (index === state.currentStep ? ' is-current' : ''),
        onclick: () => renderStep(index)
      }, [
        el('span', { class: 'chip__num', text: status === 'done' ? '✓' : String(index + 1) }),
        el('span', { class: 'chip__label', text: step.short || step.title })
      ]);
      rail.appendChild(chip);
    });
    const current = rail.querySelector('.is-current');
    if (current) current.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }

  function renderFooter() {
    const back = document.getElementById('backBtn');
    const next = document.getElementById('nextBtn');
    back.disabled = state.currentStep === 0;
    const last = state.currentStep === SCHEMA.steps.length - 1;
    next.textContent = last ? 'Generate report →' : 'Next →';
    next.onclick = () => last ? Report.open(state) : renderStep(state.currentStep + 1);
    back.onclick = () => renderStep(state.currentStep - 1);
  }

  function refreshStatus() {
    const percent = overallProgress();
    const bar = document.getElementById('progressBar');
    if (bar) {
      bar.style.width = percent + '%';
      bar.parentElement.setAttribute('aria-valuenow', String(percent));
    }
    const label = document.getElementById('progressLabel');
    if (label) label.textContent = percent + '%';
    const carLabel = document.getElementById('carLabel');
    if (carLabel) {
      const mark = (state.data.setup || {}).reportingMark;
      carLabel.textContent = mark ? mark : 'New inspection';
    }
    const rail = document.getElementById('rail');
    if (rail && rail.children.length) {
      SCHEMA.steps.forEach((step, index) => {
        const chip = rail.children[index];
        if (!chip) return;
        const status = stepState(step);
        chip.className = `chip chip--${status}` + (index === state.currentStep ? ' is-current' : '');
        chip.firstChild.textContent = status === 'done' ? '✓' : String(index + 1);
      });
    }
  }

  /* ------------------------------------------------------------------ */
  /* Export / import / archive                                           */
  /* ------------------------------------------------------------------ */

  function download(filename, content, type) {
    const blob = new Blob([content], { type: type || 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = el('a', { href: url, download: filename });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  function fileBase(s) {
    const mark = ((s.data.setup || {}).reportingMark || 'inspection').replace(/[^\w-]+/g, '_');
    const date = (s.data.setup || {}).date || new Date().toISOString().slice(0, 10);
    return `${mark}_${date}`;
  }

  async function exportJson() {
    const ids = photoIdsIn(state);
    const photos = await Photos.getMany(ids);
    const bundle = { format: 'tanker-inspection/v1', exportedAt: new Date().toISOString(), state, photos };
    download(fileBase(state) + '.json', JSON.stringify(bundle));
  }

  async function importJson(file) {
    const text = await file.text();
    let bundle;
    try { bundle = JSON.parse(text); }
    catch { return alert('That file is not valid JSON.'); }
    if (!bundle.state || !bundle.state.data) return alert('That file is not an inspection export.');
    if (!confirm('Importing replaces the inspection currently open. Continue?')) return;
    await Photos.importRecords(bundle.photos);
    state = bundle.state;
    applyDefaults(state);
    await Store.set('kv', STATE_KEY, state);
    Photos.clearCache();
    renderStep(0);
    closeMenu();
  }

  async function archiveList() {
    return (await Store.get('kv', INDEX_KEY)) || [];
  }

  async function archiveCurrent() {
    const list = await archiveList();
    const entry = {
      id: state.id,
      mark: (state.data.setup || {}).reportingMark || '(no reporting mark)',
      date: (state.data.setup || {}).date || '',
      disposition: (state.data.defects || {}).disposition || '',
      savedAt: new Date().toISOString()
    };
    await Store.set('kv', 'insp:' + state.id, state);
    const next = list.filter(x => x.id !== entry.id);
    next.unshift(entry);
    await Store.set('kv', INDEX_KEY, next);
    return entry;
  }

  async function openArchived(id) {
    const saved = await Store.get('kv', 'insp:' + id);
    if (!saved) return alert('That inspection could not be found.');
    state = saved;
    applyDefaults(state);
    await Store.set('kv', STATE_KEY, state);
    renderStep(state.currentStep || 0);
    closeMenu();
  }

  async function startNew() {
    if (!confirm('Save the current inspection to the archive and start a new one?')) return;
    await archiveCurrent();
    state = blankState();
    await Store.set('kv', STATE_KEY, state);
    renderStep(0);
    closeMenu();
  }

  async function discardAll() {
    if (!confirm('Delete the inspection currently open, including its photos? This cannot be undone.')) return;
    for (const id of photoIdsIn(state)) await Photos.remove(id);
    state = blankState();
    await Store.set('kv', STATE_KEY, state);
    renderStep(0);
    closeMenu();
  }

  /* ------------------------------------------------------------------ */
  /* Menu                                                                */
  /* ------------------------------------------------------------------ */

  function closeMenu() {
    document.getElementById('menu').classList.remove('is-open');
  }

  async function openMenu() {
    const menu = document.getElementById('menu');
    const body = document.getElementById('menuBody');
    body.innerHTML = '';

    body.appendChild(el('div', { class: 'menu__group' }, [
      el('h4', { text: 'This inspection' }),
      el('button', { class: 'menu__item', text: '📄 Generate report', onclick: () => { closeMenu(); Report.open(state); } }),
      el('button', { class: 'menu__item', text: '⬇️ Export backup (JSON + photos)', onclick: exportJson }),
      el('button', { class: 'menu__item', text: '🗄️ Archive and start new', onclick: startNew }),
      el('button', { class: 'menu__item menu__item--danger', text: '🗑 Discard this inspection', onclick: discardAll })
    ]));

    const importer = el('input', {
      type: 'file', accept: 'application/json,.json', class: 'visually-hidden',
      onchange: e => { if (e.target.files[0]) importJson(e.target.files[0]); e.target.value = ''; }
    });
    body.appendChild(el('div', { class: 'menu__group' }, [
      el('h4', { text: 'Restore' }),
      el('button', { class: 'menu__item', text: '⬆️ Import a backup file', onclick: () => importer.click() }),
      importer
    ]));

    const archived = await archiveList();
    const group = el('div', { class: 'menu__group' }, [el('h4', { text: `Archived (${archived.length})` })]);
    if (!archived.length) group.appendChild(el('p', { class: 'menu__empty', text: 'Nothing archived yet.' }));
    archived.slice(0, 20).forEach(entry => {
      group.appendChild(el('button', {
        class: 'menu__item', onclick: () => openArchived(entry.id)
      }, [
        el('span', { text: entry.mark }),
        el('span', { class: 'menu__meta', text: [entry.date, entry.disposition].filter(Boolean).join(' · ') })
      ]));
    });
    body.appendChild(group);

    const est = await Store.estimate();
    if (est && est.usage != null) {
      body.appendChild(el('p', { class: 'menu__storage', text:
        `Local storage used: ${(est.usage / 1048576).toFixed(1)} MB` +
        (est.quota ? ` of ${(est.quota / 1048576).toFixed(0)} MB available` : '') }));
    }
    body.appendChild(el('p', { class: 'menu__storage', text:
      'Everything is stored on this device only. Export a backup before clearing browser data.' }));

    menu.classList.add('is-open');
  }

  /* ------------------------------------------------------------------ */
  /* Boot                                                                */
  /* ------------------------------------------------------------------ */

  async function init() {
    try {
      state = await Store.get('kv', STATE_KEY);
    } catch (err) {
      console.error(err);
    }
    if (!state || !state.data) state = blankState();
    else applyDefaults(state);

    document.getElementById('menuBtn').onclick = openMenu;
    document.getElementById('menuClose').onclick = closeMenu;
    document.getElementById('menu').addEventListener('click', e => {
      if (e.target.id === 'menu') closeMenu();
    });
    document.getElementById('backToWizard').onclick = () => Report.close();

    document.addEventListener('keydown', e => {
      if (e.target.matches('input, textarea, select')) return;
      if (e.key === 'ArrowRight' && state.currentStep < SCHEMA.steps.length - 1) renderStep(state.currentStep + 1);
      if (e.key === 'ArrowLeft' && state.currentStep > 0) renderStep(state.currentStep - 1);
    });

    window.addEventListener('beforeunload', () => save({ immediate: true }));

    renderStep(state.currentStep || 0);
    document.getElementById('boot').remove();

    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
      navigator.serviceWorker.register('sw.js').catch(() => { /* offline support is optional */ });
    }
  }

  return {
    init, renderStep, stepStatus, stepState, photoIdsIn, exportJson,
    get state() { return state; },
    set view(v) { view = v; },
    get view() { return view; }
  };
})();

document.addEventListener('DOMContentLoaded', () => App.init());
