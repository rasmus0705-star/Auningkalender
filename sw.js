// Service worker: hurtig opstart og offline-visning af selve appen.
// VIGTIGT: Hæv VERSION, hver gang du uploader nye filer, så brugerne får opdateringen.
const VERSION = 'kk-v17';
const SKAL = [
  './', './index.html', './manifest.webmanifest', './css/style.css',
  './js/app.js', './js/config.js', './js/util.js', './js/state.js', './js/ui.js',
  './js/push.js', './js/api-supabase.js', './js/api-demo.js',
  './js/view-home.js', './js/view-calendar.js', './js/view-event.js', './js/view-form.js', './js/view-mod.js', './js/view-text.js', './js/standard-billeder.js',
  './icons/favicon.svg', './icons/icon-192.png',
  './images/standarder/musik.svg', './images/standarder/boern-leg.svg', './images/standarder/sport-motion.svg',
  './images/standarder/marked-fest.svg', './images/standarder/teater.svg', './images/standarder/foredrag.svg',
  './images/standarder/mad.svg', './images/standarder/natur.svg', './images/standarder/forening.svg', './images/standarder/andet.svg',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SKAL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const egen = url.origin === self.location.origin;
  const cdn = url.hostname === 'cdn.jsdelivr.net';
  if (!egen && !cdn) return;                       // Supabase, kort, Turnstile m.m. går direkte på nettet

  if (req.mode === 'navigate') {                    // netværk først, så cache hvis offline
    e.respondWith(fetch(req).catch(() => caches.match('./index.html')));
    return;
  }
  // stale-while-revalidate
  e.respondWith(caches.open(VERSION).then(async (c) => {
    const gammel = await c.match(req);
    const ny = fetch(req).then((r) => { if (r && r.ok) c.put(req, r.clone()); return r; }).catch(() => gammel);
    return gammel || ny;
  }));
});

// ---------- Notifikationer ----------
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { tekst: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.titel || 'Kulturkalender', {
    body: d.tekst || '', icon: './icons/icon-192.png', badge: './icons/icon-192.png', tag: d.tag || undefined, data: { url: d.url || './' },
  }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const maal = new URL((e.notification.data && e.notification.data.url) || './', self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (liste) => {
    for (const c of liste) {
      if (c.url.startsWith(self.registration.scope) && 'focus' in c) {
        await c.focus();
        try { await c.navigate(maal); } catch { /* ignorer */ }
        return;
      }
    }
    return self.clients.openWindow(maal);
  }));
});
