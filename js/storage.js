/*
 * storage.js — persistence.
 *
 * Two concerns:
 *   Store   — a tiny promise wrapper over IndexedDB, falling back to
 *             localStorage when IndexedDB is unavailable (private mode,
 *             file:// in some browsers).
 *   Photos  — capture, downscale and keep images. Photos are stored as JPEG
 *             data URLs so that export, print and report rendering need no
 *             object-URL lifecycle management.
 */

const Store = (() => {
  const DB_NAME = 'tanker-inspection';
  const DB_VERSION = 1;
  const STORES = ['kv', 'photos'];

  let dbPromise = null;
  let useFallback = false;

  function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      if (!('indexedDB' in window)) return reject(new Error('no indexedDB'));
      let req;
      try {
        req = indexedDB.open(DB_NAME, DB_VERSION);
      } catch (err) {
        return reject(err);
      }
      req.onupgradeneeded = () => {
        const db = req.result;
        STORES.forEach(name => {
          if (!db.objectStoreNames.contains(name)) db.createObjectStore(name);
        });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error('indexedDB blocked'));
    }).catch(err => {
      useFallback = true;
      console.warn('IndexedDB unavailable, falling back to localStorage:', err);
      throw err;
    });
    return dbPromise;
  }

  /* localStorage fallback helpers -------------------------------------- */
  const lsKey = (store, key) => `ti:${store}:${key}`;

  function lsGet(store, key) {
    const raw = localStorage.getItem(lsKey(store, key));
    return raw == null ? undefined : JSON.parse(raw);
  }
  function lsSet(store, key, value) {
    localStorage.setItem(lsKey(store, key), JSON.stringify(value));
  }
  function lsDel(store, key) {
    localStorage.removeItem(lsKey(store, key));
  }
  function lsKeys(store) {
    const prefix = `ti:${store}:`;
    return Object.keys(localStorage)
      .filter(k => k.startsWith(prefix))
      .map(k => k.slice(prefix.length));
  }

  /* Public API --------------------------------------------------------- */
  async function tx(store, mode, fn) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const t = db.transaction(store, mode);
      const req = fn(t.objectStore(store));
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error || new Error('transaction aborted'));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function get(store, key) {
    try {
      if (useFallback) return lsGet(store, key);
      return await tx(store, 'readonly', s => s.get(key));
    } catch {
      return lsGet(store, key);
    }
  }

  async function set(store, key, value) {
    try {
      if (useFallback) return lsSet(store, key, value);
      return await tx(store, 'readwrite', s => s.put(value, key));
    } catch {
      return lsSet(store, key, value);
    }
  }

  async function del(store, key) {
    try {
      if (useFallback) return lsDel(store, key);
      return await tx(store, 'readwrite', s => s.delete(key));
    } catch {
      return lsDel(store, key);
    }
  }

  async function keys(store) {
    try {
      if (useFallback) return lsKeys(store);
      return await tx(store, 'readonly', s => s.getAllKeys());
    } catch {
      return lsKeys(store);
    }
  }

  async function clear(store) {
    try {
      if (useFallback) return lsKeys(store).forEach(k => lsDel(store, k));
      await tx(store, 'readwrite', s => s.clear());
    } catch {
      lsKeys(store).forEach(k => lsDel(store, k));
    }
  }

  /* Rough usage figure for the storage meter in the UI. */
  async function estimate() {
    if (navigator.storage && navigator.storage.estimate) {
      try { return await navigator.storage.estimate(); } catch { /* ignore */ }
    }
    return null;
  }

  return { get, set, del, keys, clear, estimate };
})();


const Photos = (() => {
  const MAX_EDGE = 1600;   // longest side of the stored image
  const THUMB_EDGE = 360;  // longest side of the grid thumbnail
  const QUALITY = 0.78;
  const THUMB_QUALITY = 0.6;

  const cache = new Map(); // id -> record, so re-rendering does not re-read IDB

  function newId() {
    return 'p_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  }

  /* Decode honouring EXIF orientation where the browser supports it. */
  async function decode(file) {
    if ('createImageBitmap' in window) {
      try {
        return await createImageBitmap(file, { imageOrientation: 'from-image' });
      } catch {
        try { return await createImageBitmap(file); } catch { /* fall through */ }
      }
    }
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('could not decode image')); };
      img.src = url;
    });
  }

  function drawScaled(source, maxEdge, quality) {
    const sw = source.width, sh = source.height;
    const scale = Math.min(1, maxEdge / Math.max(sw, sh));
    const w = Math.max(1, Math.round(sw * scale));
    const h = Math.max(1, Math.round(sh * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(source, 0, 0, w, h);
    return { dataUrl: canvas.toDataURL('image/jpeg', quality), w, h };
  }

  /* Turn a File from a camera/file input into a stored photo record. */
  async function add(file, meta) {
    const source = await decode(file);
    const full = drawScaled(source, MAX_EDGE, QUALITY);
    const thumb = drawScaled(source, THUMB_EDGE, THUMB_QUALITY);
    if (source.close) source.close();

    const record = {
      id: newId(),
      dataUrl: full.dataUrl,
      thumb: thumb.dataUrl,
      w: full.w,
      h: full.h,
      bytes: Math.round(full.dataUrl.length * 0.75),
      caption: (meta && meta.caption) || '',
      shot: (meta && meta.shot) || '',
      takenAt: new Date().toISOString(),
      sourceName: file.name || ''
    };
    await Store.set('photos', record.id, record);
    cache.set(record.id, record);
    return record;
  }

  async function get(id) {
    if (cache.has(id)) return cache.get(id);
    const record = await Store.get('photos', id);
    if (record) cache.set(id, record);
    return record;
  }

  async function getMany(ids) {
    const out = [];
    for (const id of ids || []) {
      const record = await get(id);
      if (record) out.push(record);
    }
    return out;
  }

  async function update(id, patch) {
    const record = await get(id);
    if (!record) return null;
    Object.assign(record, patch);
    await Store.set('photos', id, record);
    cache.set(id, record);
    return record;
  }

  async function remove(id) {
    cache.delete(id);
    await Store.del('photos', id);
  }

  /* Delete photo records that no set of ids references any more. */
  async function pruneOrphans(liveIds) {
    const live = new Set(liveIds);
    const all = await Store.keys('photos');
    let removed = 0;
    for (const id of all) {
      if (!live.has(id)) { await remove(id); removed++; }
    }
    return removed;
  }

  /* Import records that came in from an exported JSON bundle. */
  async function importRecords(records) {
    for (const record of records || []) {
      if (!record || !record.id) continue;
      await Store.set('photos', record.id, record);
      cache.set(record.id, record);
    }
  }

  function clearCache() { cache.clear(); }

  return { add, get, getMany, update, remove, pruneOrphans, importRecords, clearCache };
})();
