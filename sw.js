// ═══════════════════════════════════════════════════════════════
// Court Booking — Service Worker
// Caches app shell for offline support + fast repeat loads
// ═══════════════════════════════════════════════════════════════

// Bump this whenever a deploy changes tailwind.css / motion.* / other
// cache-first assets -- those are served from cache without revalidation, so
// returning visitors keep the old copy until the cache name changes.
const CACHE_NAME = 'courtbooking-v31';

importScripts('/push-inbox.js');

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
  '/my-active.js',
  '/push-inbox.js',
];

// Secondary pages (cached on first visit)
const SECONDARY_PAGES = [
  '/picker.html',
  '/tournament.html',
  '/tournament-admin.html',
  '/gallery.html',
  '/store.html',
  '/superadmin.html',
  '/my-matches.html',
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

  // HTML pages: network-first (branding/behavior must reflect the latest
  // deploy immediately; cache is only a fallback for offline use)
  if (request.headers.get('Accept')?.includes('text/html') ||
      url.pathname.endsWith('.html') ||
      url.pathname === '/') {
    event.respondWith(networkFirst(request, CACHE_NAME));
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

// ── Match alerts (web push) ─────────────────────────────────
// Payload: { title, body, tag, url }. Sent by the tournament notifier job.
// Also recorded into PushInbox (IndexedDB) so my-matches.html can show a
// device-local history -- a Service Worker can't touch localStorage, but it
// shares IndexedDB with the page. Recording is best-effort: a failure there
// never blocks showing the actual notification.
self.addEventListener('push', (event) => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; }
  catch { d = { body: event.data ? event.data.text() : '' }; }
  event.waitUntil(Promise.all([
    self.registration.showNotification(d.title || 'Tournament update', {
      body: d.body || '',
      tag: d.tag || undefined,
      renotify: !!d.tag,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      data: { url: d.url || '/' },
    }),
    (typeof PushInbox !== 'undefined' ? PushInbox.record(d) : Promise.resolve()).catch(() => {}),
  ]));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  // Only ever open this site's own pages, whatever the payload says.
  let target = new URL('/', self.location.origin);
  try {
    const u = new URL((event.notification.data && event.notification.data.url) || '/', self.location.origin);
    if (u.origin === self.location.origin) target = u;
  } catch { /* keep the home page */ }
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        if (new URL(w.url).pathname === target.pathname && 'focus' in w) {
          return w.navigate(target.href).then(() => w.focus()).catch(() => w.focus());
        }
      }
      return self.clients.openWindow(target.href);
    })
  );
});
