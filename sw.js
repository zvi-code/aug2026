/* Trip Companion service worker — offline app shell + runtime tile/CDN cache.
   The app's encrypted data lives inside index.html, so once cached the planner
   opens AND unlocks fully offline (critical for no-signal areas like Trinity Alps). */
const V = 'tc-v2';
const SHELL = [
  './', './index.html', './manifest.webmanifest',
  './icon-192.png', './icon-512.png', './icon-180.png',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
];

// Precache the offline games CONTENT (CC0 images) listed in games/precache.json,
// so the quiz visuals + jigsaw photos work with no signal.
self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(caches.open(V).then(c =>
    Promise.allSettled(SHELL.map(u => c.add(u))).then(() =>
      fetch('./games/precache.json').then(r => r.ok ? r.json() : [])
        .then(list => Promise.allSettled((list || []).map(p => c.add('./' + p))))
        .catch(() => null)
    )
  ));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k !== V && k !== 'tc-tiles').map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Live-data APIs (weather): always hit the network — the app keeps its own
  // offline copy in localStorage, and the cache-first branch below would
  // otherwise freeze the first response forever.
  if (url.hostname === 'api.open-meteo.com') return;

  // App HTML: network-first (so updates land), fall back to cache offline.
  const isDoc = req.mode === 'navigate' ||
                (url.origin === location.origin && (url.pathname.endsWith('/') || url.pathname.endsWith('index.html')));
  if (isDoc) {
    e.respondWith(
      fetch(req).then(r => { const cp = r.clone(); caches.open(V).then(c => c.put(req, cp)); return r; })
                .catch(() => caches.match(req).then(m => m || caches.match('./index.html')))
    );
    return;
  }

  // Everything else (Leaflet CDN, map tiles, icons): cache-first, then network (runtime cache).
  e.respondWith(
    caches.match(req).then(m => m || fetch(req).then(r => {
      if (r && (r.status === 200 || r.type === 'opaque')) {
        const cp = r.clone(); caches.open(V).then(c => c.put(req, cp));
      }
      return r;
    }).catch(() => m))
  );
});
