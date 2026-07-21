/* Jednoduchý service worker – appka funguje offline (kromě vyhledávání v OpenFoodFacts). */
const CACHE = 'kt-v3';
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

  // Vlastní soubory: vrať z cache hned (rychlé, funguje offline),
  // ale na pozadí stáhni čerstvou verzi do cache → příští načtení už je aktuální.
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(e.request);
    const fromNet = fetch(e.request).then(res => {
      if (res && res.ok) cache.put(e.request, res.clone());
      return res;
    }).catch(() => null);
    return cached || (await fromNet) || new Response('Offline', { status: 503 });
  })());
});
