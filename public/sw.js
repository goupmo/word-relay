// Makes the game installable and lets solo / pass-and-play start with no connection.
// Network first, so a new deploy shows up at once; the cache is only the fallback when offline.
const CACHE = 'wr-v1';
const SHELL = [
  '/', '/style.css', '/app.js', '/i18n.js', '/sfx.js', '/net.js', '/local.js', '/bot.js', '/ads.js', '/config.js',
  '/shared/chars.js', '/shared/game.js', '/shared/rooms.js', '/data/categories.json', '/icon.svg', '/manifest.webmanifest',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return; // fonts, ads, kakao: leave to the browser
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
        return res;
      })
      .catch(() => caches.match(req).then((hit) => hit || (req.mode === 'navigate' ? caches.match('/') : Response.error()))),
  );
});
