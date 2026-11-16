// Service worker: fa aprire l'app anche senza rete (mostra l'ultima lista salvata).
// Quando modifichi i file dell'app, aumenta il numero di versione qui sotto.
const VERSION = 'serie-v2';
const SHELL = ['/', '/index.html', '/style.css', '/app.js', '/config.js', '/manifest.webmanifest', '/icons/icon-192.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  // Dati (Supabase, TMDB) sempre dalla rete.
  if (url.origin !== location.origin || url.pathname.startsWith('/api/')) {
    if (url.hostname === 'image.tmdb.org') {
      // Le locandine si tengono in cache: non cambiano.
      e.respondWith(caches.open(VERSION + '-img').then(async (c) => {
        const hit = await c.match(e.request);
        if (hit) return hit;
        const r = await fetch(e.request);
        if (r.ok || r.type === 'opaque') c.put(e.request, r.clone());
        return r;
      }));
    }
    return;
  }
  // File dell'app: prima la rete (così prendi gli aggiornamenti), poi la cache.
  e.respondWith(
    fetch(e.request)
      .then((r) => { const copy = r.clone(); caches.open(VERSION).then((c) => c.put(e.request, copy)); return r; })
      .catch(() => caches.match(e.request).then((r) => r || caches.match('/index.html')))
  );
});
