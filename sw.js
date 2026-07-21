/* Jednoduchý service worker – appka funguje offline (kromě vyhledávání v OpenFoodFacts). */
const CACHE = 'kt-v1';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.webmanifest',
  './icon.svg',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  // Data z OpenFoodFacts nikdy necachujeme – jdou vždy ze sítě.
  if (url.hostname.includes('openfoodfacts.org')) return;
  if (e.request.method !== 'GET') return;

  // Vlastní soubory: nejdřív cache, pak síť (a doplň do cache).
  e.respondWith(
    caches.match(e.request).then(hit => hit || fetch(e.request).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {});
      return res;
    }).catch(() => hit))
  );
});
