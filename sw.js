// Service worker de Kirakai (portée /KirakaiTCG/) : ouverture instantanée après la première visite,
// consultation hors ligne avec les derniers prix connus. Les prix sont toujours redemandés au réseau d'abord.
// Les caches sont préfixés « kirakai- » pour ne jamais toucher à ceux des autres sites du même domaine.
const VERSION = 'c6aca1760e';
const STATIC = 'kirakai-static-' + VERSION;
const DATA = 'kirakai-data-v1';
const IMAGES = 'kirakai-images-v1';
const MAX_IMAGES = 1200;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(STATIC).then((c) => c.addAll(['./', 'index.html', 'manifest.webmanifest', 'icon.svg'])).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('kirakai-static-') && k !== STATIC) await caches.delete(k);
    await self.clients.claim();
  })());
});

async function trim(name, max) {
  const c = await caches.open(name);
  const keys = await c.keys();
  for (let i = 0; i < keys.length - max; i++) await c.delete(keys[i]);
}

async function networkFirst(req, cacheName, timeout = 6000) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);
  const net = fetch(req).then((res) => { if (res.ok) cache.put(req, res.clone()); return res; });
  if (!cached) return net;
  return Promise.race([net.catch(() => cached), new Promise((r) => setTimeout(() => r(cached), timeout))]);
}

async function cacheFirst(req, cacheName, max) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok || res.type === 'opaque') { cache.put(req, res.clone()); if (max) trim(cacheName, max); }
  return res;
}

const SCOPE = new URL('./', self.location).pathname;

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const same = url.origin === self.location.origin;
  if (same && req.mode === 'navigate' && url.pathname.startsWith(SCOPE)) {
    // pages de cartes et d'extensions (…/carte/x.html) : la vraie page ; sinon l'accueil de l'application
    if (/\/(carte|extension)\/[^/]+\.html$/.test(url.pathname)) { e.respondWith(networkFirst(req, STATIC, 4000).catch(() => caches.match('index.html'))); return; }
    e.respondWith(networkFirst(new Request('index.html'), STATIC, 4000).catch(() => caches.match('index.html'))); return;
  }
  if (same && url.pathname.startsWith(SCOPE + 'assets/')) { e.respondWith(cacheFirst(req, STATIC)); return; }
  if (same && /\/(img|db\/packs)\/|\.(svg|png|jpg|webmanifest)$/.test(url.pathname)) { e.respondWith(cacheFirst(req, STATIC)); return; }
  if (same && /\/db\//.test(url.pathname)) { e.respondWith(networkFirst(req, DATA)); return; }
  if (/fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) { e.respondWith(cacheFirst(req, STATIC)); return; }
  if (req.destination === 'image') { e.respondWith(cacheFirst(req, IMAGES, MAX_IMAGES).catch(() => fetch(req))); return; }
});

// Alertes de prix envoyées par le robot (même site fermé)
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { body: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(d.title || 'Kirakai', {
    body: d.body || '', icon: 'icon-192.png', badge: 'icon-192.png', tag: d.tag || 'kirakai-alerte', renotify: true,
    data: { url: d.url || './#/suivis' },
  }));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = new URL(e.notification.data?.url || './#/suivis', self.registration.scope).href;
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const w of wins) if (w.url.startsWith(self.registration.scope) && 'focus' in w) { try { await w.navigate(url); } catch {} return w.focus(); }
    return self.clients.openWindow(url);
  })());
});
