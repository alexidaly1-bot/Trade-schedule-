// Keeps the app working offline. Only caches the app's own files (and the text reader).
const CACHE = 'trades-v2';
const SHELL = ['./', 'index.html', 'styles.css', 'js/app.js', 'js/db.js', 'js/parser.js', 'js/ocr.js', 'js/person.js', 'manifest.webmanifest', 'icon.svg'];
self.addEventListener('install', e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(fetch(e.request).then(res => {
    if (res.ok && (e.request.url.startsWith(self.location.origin) || e.request.url.includes('tesseract') || e.request.url.includes('tessdata'))) {
      const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy));
    }
    return res;
  }).catch(() => caches.match(e.request)));
});
