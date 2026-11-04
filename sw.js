// GLV Global Food Services — Service Worker v1.0
// Caches ONLY public static assets. NEVER caches private routes, API, or session data.

const CACHE_NAME = 'glv-global-static-v1';

const BLOCKED_PREFIXES = [
  '/api/',
  '/admin/',
  '/login',
  '/session',
  '/auth',
  '/panel',
  '/gos',
  '/send-email',
];

const CACHEABLE_EXTENSIONS = ['.css', '.js', '.png', '.jpg', '.jpeg', '.webp', '.svg', '.ico', '.woff', '.woff2'];

function isBlockedPath(url) {
  const pathname = new URL(url).pathname;
  return BLOCKED_PREFIXES.some(p => pathname.startsWith(p));
}

function isCacheableAsset(url) {
  const pathname = new URL(url).pathname;
  return CACHEABLE_EXTENSIONS.some(ext => pathname.endsWith(ext));
}

function isSameOrigin(url) {
  return new URL(url).origin === self.location.origin;
}

self.addEventListener('install', event => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;

  if (req.method !== 'GET') return;

  const url = req.url;

  if (!isSameOrigin(url)) return;

  if (isBlockedPath(url)) return;

  if (!isCacheableAsset(url)) return;

  event.respondWith(
    caches.open(CACHE_NAME).then(cache =>
      cache.match(req).then(cached => {
        if (cached) return cached;

        return fetch(req).then(response => {
          if (
            response.ok &&
            response.status === 200 &&
            response.type === 'basic' &&
            !response.headers.has('set-cookie') &&
            isSameOrigin(url) &&
            !isBlockedPath(url)
          ) {
            cache.put(req, response.clone());
          }
          return response;
        }).catch(() => cached || Response.error());
      })
    )
  );
});
