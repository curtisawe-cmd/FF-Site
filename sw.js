/* Bitch Boy League — service worker.

   The whole app is one index.html, so the caching rule that matters is how we treat it.
   This is NETWORK-FIRST for the page: every launch tries the network, and the cache is only
   a fallback for when you're offline. A cache-first worker would be faster but would serve a
   stale app after every push, which is exactly the confusion we don't want.

   Live data (Firebase, Sleeper, ESPN) is never cached — it must always be current, and a
   stale scoreboard is worse than no scoreboard. */

const VERSION = 'bbl-v3';   /* bump to retire the v1 cache, which could serve a stale page */
const SHELL = [
  './',
  './index.html',
  './icon-192.png',
  './favicon-32.png',
  './icon-512.png',
  './apple-touch-icon.png',
  './manifest.json'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(VERSION)
      .then(c => c.addAll(SHELL).catch(()=>{}))   /* one bad URL shouldn't abort the install */
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/* hosts whose responses must never be served from cache */
const LIVE = /(firebaseio|googleapis|gstatic|firebase|sleeper|espn|sleepercdn|espncdn)\./i;

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;                    /* never touch writes */
  const url = new URL(req.url);
  if (LIVE.test(url.hostname)) return;                 /* straight to the network */
  if (url.origin !== self.location.origin) return;     /* leave other origins alone */

  /* Network-first is not enough on its own: GitHub Pages serves index.html with a ~10 minute
     max-age, so a plain fetch() here can be answered from the browser's own HTTP cache and
     hand back the old app even though the network was "used". Force a revalidation for the
     page itself; static assets can still come from cache. */
  const isPage = req.mode === 'navigate' ||
                 (req.headers.get('accept') || '').includes('text/html') ||
                 /\/$|\.html$/.test(url.pathname);

  e.respondWith(
    fetch(isPage ? new Request(req, { cache: 'reload' }) : req)
      .then(res => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(VERSION).then(c => c.put(req, copy)).catch(()=>{});
        }
        return res;
      })
      .catch(() => caches.match(req).then(hit => hit || caches.match('./index.html')))
  );
});
