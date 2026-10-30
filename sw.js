// Veiling Analyser – service worker
// Eerst het netwerk (altijd de nieuwste versie), alleen zonder internet de opgeslagen versie.
// Analyses en accountverzoeken gaan nooit via de cache.
const CACHE = 'va-schil-v6';
const SCHIL = ['app.html', 'styles.css', 'config.js', 'kern.js', 'app.js', 'account.js', 'functies.js', 'home.js', 'start.js', 'manifest.json', 'icons/icon192.png', 'icons/icon512.png', 'fonts/bricolage-grotesque.woff2', 'fonts/instrument-sans.woff2', 'privacy.html', 'voorwaarden.html', 'juridisch.css'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SCHIL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // server, AI en lettertypes: niet aankomen
  if (url.pathname.startsWith('/api/')) return; // accountgegevens en analyses nooit uit de cache
  e.respondWith(
    fetch(req).then(resp => {
      if (resp.ok) { const kopie = resp.clone(); caches.open(CACHE).then(c => c.put(req, kopie)); }
      return resp;
    }).catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || caches.match('app.html')))
  );
});

// Meldingen: de server stuurt een versleuteld bericht { titel, tekst, url, tag }
self.addEventListener('push', e => {
  let b = {};
  try { b = e.data ? e.data.json() : {}; } catch (err) { b = { titel: 'Veiling Analyser', tekst: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(b.titel || 'Veiling Analyser', {
    body: b.tekst || '', icon: 'icons/icon192.png', badge: 'icons/icon48.png', tag: b.tag || undefined, renotify: !!b.tag,
    data: { url: b.url || '/app' }
  }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const doel = new URL((e.notification.data && e.notification.data.url) || '/app', self.location.origin).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(lijst => {
    for (const c of lijst) {
      if (new URL(c.url).origin === self.location.origin && 'focus' in c) { c.navigate(doel).catch(() => {}); return c.focus(); }
    }
    return self.clients.openWindow(doel);
  }));
});
