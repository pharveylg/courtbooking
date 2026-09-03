// ═══════════════════════════════════════════════════════════════
// Court Booking — Service Worker
// Caches app shell for offline support + fast repeat loads
// ═══════════════════════════════════════════════════════════════

const CACHE_NAME = 'courtbooking-v1';

// App shell: everything needed to render the app offline
const APP_SHELL = [
  '/',
  '/index.html',
  '/tailwind.css',
  '/motion.css',
  '/motion.js',
  '/client-config.js',
  '/firebase-config.js',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

// Secondary pages (cached on first visit)
const SECONDARY_PAGES = [
  '/picker.html',
  '/tournament.html',
  '/tournament-admin.html',
  '/gallery.html',
  '/store.html',
  '/superadmin.html',
];

// ── Install ─────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // Cache app shell, skip any that fail (e.g. icons not generated yet)
      return Promise.allSettled(
        APP_SHELL.map(url =>
          cache.add(url).catch(err => {
            // Silently skip missing files
          })
        )
      );
    })
  );
  self.skipWaiting(); // activate immediately
});

// ── Activate ────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim(); // take control of all open tabs
});

// ── Fetch ───────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests (Firebase writes, form submissions)
  if (request.method !== 'GET') return;

  // Skip cross-origin requests except Google Fonts and Firebase SDK
  if (url.origin !== location.origin) {
    // Google Fonts: cache-first
    if (url.hostname.includes('fonts.googleapis.com') ||
        url.hostname.includes('fonts.gstatic.com')) {
      event.respondWith(cacheFirst(request, 'fonts-cache'));
      return;
    }
    // Firebase SDK CDN: cache-first
    if (url.hostname.includes('gstatic.com/firebasejs')) {
      event.respondWith(cacheFirst(request, 'vendor-cache'));
      return;
    }
    // Everything else (Firestore API, etc.): network-only
    return;
  }

  // HTML pages: stale-while-revalidate
  if (request.headers.get('Accept')?.includes('text/html') ||
      url.pathname.endsWith('.html') ||
      url.pathname === '/') {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }

  // CSS, JS, images: cache-first with network fallback
  if (url.pathname.match(/\.(css|js|png|jpg|jpeg|svg|woff2|woff|ttf)$/)) {
    event.respondWith(cacheFirst(request, CACHE_NAME));
    return;
  }

  // Config files (client-config.js, firebase-config.js): network-first
  // These change per tenant branch and should always be fresh
  if (url.pathname.includes('config')) {
    event.respondWith(networkFirst(request, CACHE_NAME));
    return;
  }

  // Default: network-first
  event.respondWith(networkFirst(request, CACHE_NAME));
});

// ── Strategies ──────────────────────────────────────────────

// Cache-first: fast, works offline, updates in background
async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
  }
}

// Network-first: always fresh, falls back to cache when offline
async function networkFirst(request, cacheName) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    return cached || new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
  }
}

// Stale-while-revalidate: instant load from cache, update in background
async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);

  const fetchPromise = fetch(request).then((response) => {
    if (response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  }).catch(() => cached);

  return cached || fetchPromise;
}
