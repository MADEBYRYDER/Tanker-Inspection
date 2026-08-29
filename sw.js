/*
 * sw.js — offline support.
 *
 * The app shell is precached so the app opens with no signal, which is the
 * normal condition in a railyard. Inspection data never goes through the
 * service worker; it lives in IndexedDB on the device.
 */

const CACHE = 'tanker-inspection-v1';

const SHELL = [
  './',
  'index.html',
  'assets/styles.css',
  'assets/report.css',
  'assets/icon.svg',
  'js/schema.js',
  'js/storage.js',
  'js/report.js',
  'js/app.js',
  'manifest.webmanifest'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/* Cache-first for the shell, with a background refresh so an updated
   deployment is picked up on the next launch. */
self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  if (new URL(request.url).origin !== location.origin) return;

  event.respondWith(
    caches.match(request).then(cached => {
      const network = fetch(request)
        .then(response => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then(cache => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached || caches.match('index.html'));
      return cached || network;
    })
  );
});
