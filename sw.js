// Veiling Analyser – service worker
// Eerst het netwerk (altijd de nieuwste versie), alleen zonder internet de opgeslagen versie.
// Analyses en accountverzoeken gaan nooit via de cache.
const CACHE = 'va-schil-v5';
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
