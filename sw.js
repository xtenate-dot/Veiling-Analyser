/**
 * sw.js
 * Cachet de app-shell (HTML/CSS/JS/manifest/icon) zodat de app ook zonder
 * internet opstart. API-aanroepen naar Anthropic gaan altijd rechtstreeks
 * over het netwerk — die cachen we bewust niet.
 */
var CACHE_NAAM = 'veiling-analyser-v1';
var APP_SHELL = [
  './',
  './index.html',
  './style.css',
  './manifest.json',
  './icon.svg',
  './helpers.js',
  './logger.js',
  './storage.js',
  './state.js',
  './veilinghuizen.js',
  './api.js',
  './sheets.js',
  './ui.js',
  './analyse.js',
  './exportImport.js',
  './app.js'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_NAAM).then(function (cache) { return cache.addAll(APP_SHELL); })
  );
  self.skipWaiting();
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (namen) {
      return Promise.all(namen.filter(function (n) { return n !== CACHE_NAAM; }).map(function (n) { return caches.delete(n); }));
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', function (event) {
  var url = event.request.url;
  // Nooit API-verkeer cachen of onderscheppen.
  if (url.indexOf('api.anthropic.com') !== -1) return;
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then(function (cached) {
      var netwerkFetch = fetch(event.request).then(function (resp) {
        if (resp && resp.status === 200) {
          var kopie = resp.clone();
          caches.open(CACHE_NAAM).then(function (cache) { cache.put(event.request, kopie); });
        }
        return resp;
      }).catch(function () { return cached; });
      return cached || netwerkFetch;
    })
  );
});
