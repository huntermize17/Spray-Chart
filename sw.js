// Spray Chart offline helper. Keeps a copy of the app on the device so it opens
// and charts with no signal. Your charts themselves are saved by the app on every tap;
// this file only makes sure the app itself can load at a field with no service.
const CACHE = 'spray-chart-v1';
const FB = 'https://www.gstatic.com/firebasejs/12.18.0/';
const CORE = ['./', 'index.html', 'firebase-config.txt', 'apple-touch-icon.png', 'icon-512.png'];
const EXTRA = [FB + 'firebase-app.js', FB + 'firebase-auth.js', FB + 'firebase-firestore.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(
    [...CORE, ...EXTRA].map(u => c.add(new Request(u, {cache: 'reload'})).catch(() => {}))
  )).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// libraries and fonts that never change at a given address: use the saved copy
const CDN = /^https:\/\/(www\.gstatic\.com\/firebasejs\/|fonts\.googleapis\.com\/|fonts\.gstatic\.com\/|cdnjs\.cloudflare\.com\/|cdn\.jsdelivr\.net\/)/;

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // the app page and settings: get the newest when there's signal, saved copy when there isn't
  if (url.origin === location.origin) {
    if (req.mode === 'navigate' || /(\/|index\.html|firebase-config\.txt|\.png)$/.test(url.pathname)) {
      e.respondWith(networkFirst(req, req.mode === 'navigate'));
    }
    return;
  }
  if (CDN.test(req.url)) e.respondWith(cacheFirst(req));
  // everything else (cloud database, Google sign-in, AI import) goes straight to the network
});

async function networkFirst(req, isPage) {
  const c = await caches.open(CACHE);
  const key = isPage ? new URL('index.html', self.registration.scope).href : req.url.split('?')[0];
  try {
    // weak signal: don't wait forever, fall back to the saved copy after a few seconds
    const res = await Promise.race([
      fetch(req),
      new Promise((_, rej) => setTimeout(() => rej(new Error('slow')), isPage ? 4000 : 3000))
    ]);
    if (res && res.ok) c.put(key, res.clone());
    return res;
  } catch (err) {
    const hit = await c.match(key) || (isPage && await c.match(new URL('./', self.registration.scope).href));
    if (hit) return hit;
    throw err;
  }
}

async function cacheFirst(req) {
  const c = await caches.open(CACHE);
  const hit = await c.match(req, {ignoreVary: true});
  if (hit) return hit;
  const res = await fetch(req);
  if (res && (res.ok || res.type === 'opaque')) c.put(req, res.clone());
  return res;
}
