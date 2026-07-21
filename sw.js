/* Jednoduchý service worker – appka funguje offline (kromě vyhledávání v OpenFoodFacts). */
const CACHE = 'kt-v14';
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
  if (e.request.method !== 'GET') return;
  if (url.hostname.includes('openfoodfacts.org')) return; // vyhledávání vždy ze sítě
  if (url.origin !== location.origin) return;              // cizí (proxy apod.) neřešíme
  if (url.pathname.startsWith('/api/')) return;            // vlastní API vždy ze sítě

  // App shell = "nejdřív síť": online vždy čerstvá verze (aktualizace hned vidět),
  // offline se vrátí poslední uložená z cache.
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const fresh = await fetch(e.request);
      if (fresh && fresh.ok) cache.put(e.request, fresh.clone());
      return fresh;
    } catch {
      return (await cache.match(e.request)) || (await cache.match('./index.html')) || new Response('Offline', { status: 503 });
    }
  })());
});
