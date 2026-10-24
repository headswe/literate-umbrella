// Lets the installed game start without network. Always tries the network first so
// a new version shows up right away, and falls back to the last copy when offline.
const CACHE = 'myson-v1';
const SHELL = [
  './', 'manifest.json', 'icons/icon-192.png', 'vendor/three.module.min.js',
  ...['main', 'data', 'sim', 'worldgen', 'path', 'textures', 'models', 'characters', 'render3d', 'audio', 'speech', 'storage', 'net', 'p2p']
    .map((m) => `js/${m}.js`),
];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  // Fetch the game once up front, so it can start offline even if it was only opened once.
  e.waitUntil(caches.open(CACHE).then((c) => Promise.all(SHELL.map((u) => c.add(u).catch(() => {})))));
});
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  const mine = url.origin === location.origin;
  const fonts = url.host === 'fonts.googleapis.com' || url.host === 'fonts.gstatic.com';
  if (req.method !== 'GET' || (!mine && !fonts) || url.pathname.includes('/api/')) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const res = await fetch(req);
      if (res.ok || res.type === 'opaque') cache.put(req, res.clone());
      return res;
    } catch (err) {
      const hit = await cache.match(req.mode === 'navigate' ? './' : req, { ignoreSearch: req.mode === 'navigate' });
      if (hit) return hit;
      throw err;
    }
  })());
});
