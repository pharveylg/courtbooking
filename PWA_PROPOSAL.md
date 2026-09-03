# Court Booking PWA Restructuring Proposal

## Current Architecture Audit

| Aspect | Current State | Issue |
|--------|--------------|-------|
| **Structure** | Single `index.html` (7,479 lines, ~386KB) | Monolithic, no code splitting |
| **JS** | Inline `<script>` block (~5,500 lines) | Not cacheable, not tree-shakeable |
| **CSS** | Tailwind (compiled) + inline `<style>` + motion.css | Good, but inline styles bloat HTML |
| **Data** | localStorage (13 keys) + Firebase Firestore | localStorage = 5MB limit, no structured queries |
| **External deps** | Firebase SDK (4 CDN scripts) + Google Fonts | Blocks rendering, not cacheable by SW |
| **Deployment** | Firebase Hosting + Vercel | No service worker, no manifest |
| **Offline** | None | App is useless without network |
| **Install** | Not installable | No manifest, no service worker |

---

## Proposed Architecture

### Phase 1: App Shell + Service Worker (Week 1-2)
### Phase 2: Offline Data Layer (Week 3-4)
### Phase 3: Background Sync + Push (Week 5-6)
### Phase 4: Install UX + Polish (Week 7-8)

---

## Phase 1: App Shell + Service Worker

### 1.1 File Structure

```
courtbooking/
├── public/
│   ├── index.html          # App shell (minimal HTML, ~50 lines)
│   ├── manifest.json       # Web App Manifest
│   ├── sw.js               # Service Worker
│   ├── icons/
│   │   ├── icon-192.png
│   │   ├── icon-512.png
│   │   └── icon-maskable.png
│   ├── css/
│   │   ├── tailwind.css    # Compiled Tailwind (cacheable)
│   │   └── motion.css      # Motion primitives (cacheable)
│   ├── js/
│   │   ├── app.js          # Main app logic (ES modules)
│   │   ├── booking.js      # Booking module
│   │   ├── queue.js        # Queue module
│   │   ├── stats.js        # Match Stats module
│   │   ├── admin.js        # Admin console module
│   │   ├── opengames.js    # Find a Game module
│   │   ├── motion.js       # Motion primitives
│   │   └── db.js           # IndexedDB wrapper
│   └── vendor/
│       ├── firebase-app.js
│       ├── firebase-firestore.js
│       ├── firebase-auth.js
│       └── firebase-storage.js
├── functions/               # Cloud Functions (unchanged)
├── firestore.rules
├── storage.rules
└── firebase.json
```

### 1.2 App Shell (`index.html`)

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <meta name="theme-color" content="#201C19"/>
  <link rel="manifest" href="/manifest.json"/>
  <link rel="apple-touch-icon" href="/icons/icon-192.png"/>
  <link rel="stylesheet" href="/css/tailwind.css"/>
  <link rel="stylesheet" href="/css/motion.css"/>
  <link rel="preconnect" href="https://fonts.googleapis.com"/>
  <link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400..800&family=JetBrains+Mono:wght@400;600&display=swap" rel="stylesheet"/>
  <title>Court Booking</title>
</head>
<body>
  <!-- App shell: header + nav + empty view containers -->
  <div id="app-shell">
    <header id="app-header"><!-- rendered by JS --></header>
    <main id="app-main"><!-- views injected here --></main>
  </div>

  <!-- Skeleton screen for instant perceived load -->
  <div id="skeleton" class="skeleton-loader">
    <div class="skeleton-hero"></div>
    <div class="skeleton-rows"></div>
  </div>

  <script type="module" src="/js/app.js"></script>
</body>
</html>
```

**Key changes:**
- HTML is now a **shell** (~50 lines) — all content rendered by JS
- CSS/JS are **external files** — cacheable by service worker
- Firebase SDK moved to **local vendor/** — no CDN dependency
- **Skeleton screen** shows instantly while JS loads

### 1.3 Service Worker (`sw.js`)

```javascript
const CACHE_VERSION = 'v1';
const APP_SHELL = [
  '/',
  '/index.html',
  '/css/tailwind.css',
  '/css/motion.css',
  '/js/app.js',
  '/js/booking.js',
  '/js/queue.js',
  '/js/stats.js',
  '/js/admin.js',
  '/js/opengames.js',
  '/js/motion.js',
  '/js/db.js',
  '/vendor/firebase-app.js',
  '/vendor/firebase-firestore.js',
  '/vendor/firebase-auth.js',
  '/vendor/firebase-storage.js',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

// Install: cache app shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(`app-shell-${CACHE_VERSION}`)
      .then(cache => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => !k.includes(CACHE_VERSION))
            .map(k => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// Fetch: stale-while-revalidate for app shell, network-first for API
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // App shell: cache-first with network fallback
  if (APP_SHELL.some(path => url.pathname === path)) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        const fetchPromise = fetch(event.request).then(response => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(`app-shell-${CACHE_VERSION}`)
              .then(cache => cache.put(event.request, clone));
          }
          return response;
        }).catch(() => cached);
        return cached || fetchPromise;
      })
    );
    return;
  }

  // Tenant config: network-first (always fresh)
  if (url.pathname.includes('client-config') || url.pathname.includes('firebase-config')) {
    event.respondWith(
      fetch(event.request)
        .then(r => {
          const clone = r.clone();
          caches.open(`config-${CACHE_VERSION}`)
            .then(cache => cache.put(event.request, clone));
          return r;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Firestore API: network-only (Firebase handles its own offline)
  if (url.hostname.includes('firestore.googleapis.com') ||
      url.hostname.includes('googleapis.com')) {
    return; // let Firebase SDK handle it
  }

  // Google Fonts: cache-first
  if (url.hostname.includes('fonts.googleapis.com') ||
      url.hostname.includes('fonts.gstatic.com')) {
    event.respondWith(
      caches.match(event.request).then(cached =>
        cached || fetch(event.request).then(response => {
          const clone = response.clone();
          caches.open(`fonts-${CACHE_VERSION}`)
            .then(cache => cache.put(event.request, clone));
          return response;
        })
      )
    );
    return;
  }
});
```

### 1.4 Web App Manifest (`manifest.json`)

```json
{
  "name": "Court Booking — Pickleball Reservations",
  "short_name": "CourtBook",
  "description": "Book courts, manage queues, track match stats",
  "start_url": "/",
  "display": "standalone",
  "orientation": "portrait",
  "background_color": "#FFFBF5",
  "theme_color": "#201C19",
  "icons": [
    {
      "src": "/icons/icon-192.png",
      "sizes": "192x192",
      "type": "image/png"
    },
    {
      "src": "/icons/icon-512.png",
      "sizes": "512x512",
      "type": "image/png"
    },
    {
      "src": "/icons/icon-maskable.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "maskable"
    }
  ],
  "categories": ["sports", "productivity"],
  "shortcuts": [
    {
      "name": "Book Court",
      "short_name": "Book",
      "description": "Reserve a court",
      "url": "/?tab=book",
      "icons": [{ "src": "/icons/icon-192.png", "sizes": "192x192" }]
    },
    {
      "name": "Queue",
      "short_name": "Queue",
      "description": "Join the walk-in queue",
      "url": "/?tab=queue",
      "icons": [{ "src": "/icons/icon-192.png", "sizes": "192x192" }]
    },
    {
      "name": "Match Stats",
      "short_name": "Stats",
      "description": "View match statistics",
      "url": "/?tab=stats",
      "icons": [{ "src": "/icons/icon-192.png", "sizes": "192x192" }]
    }
  ]
}
```

---

## Phase 2: Offline Data Layer

### 2.1 IndexedDB Wrapper (`db.js`)

Replace localStorage with IndexedDB for structured, larger storage:

```javascript
// db.js — IndexedDB wrapper for offline-first data
const DB_NAME = 'courtbooking';
const DB_VERSION = 1;

const STORES = {
  bookings:     { keyPath: 'id', indexes: ['date', 'status', 'court'] },
  queues:       { keyPath: 'id', indexes: ['court', 'createdAt'] },
  openPlays:    { keyPath: 'id', indexes: ['date', 'court'] },
  courts:       { keyPath: 'id' },
  config:       { keyPath: 'key' },
  syncQueue:    { keyPath: 'id', indexes: ['type', 'createdAt'] },
  proofs:       { keyPath: 'id', indexes: ['bookingId'] },
};

export async function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      for (const [name, config] of Object.entries(STORES)) {
        if (!db.objectStoreNames.contains(name)) {
          const store = db.createObjectStore(name, { keyPath: config.keyPath });
          (config.indexes || []).forEach(idx => store.createIndex(idx, idx));
        }
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function getAll(storeName) { /* ... */ }
export async function put(storeName, data) { /* ... */ }
export async function remove(storeName, id) { /* ... */ }
export async function getByIndex(storeName, index, value) { /* ... */ }
```

**Why IndexedDB over localStorage:**
- No 5MB size limit (IndexedDB = ~50MB+ on mobile)
- Structured queries with indexes
- Transaction support
- Better for storing booking history, match records, etc.

### 2.2 Migration Strategy

```javascript
// Migrate localStorage → IndexedDB on first PWA load
async function migrateLocalStorage() {
  const db = await openDB();
  const migrations = {
    bookings: 'cb_bookings_v1',
    queues: 'cb_queues_v1',
    openPlays: 'cb_openPlays_v1',
    courts: 'cb_courts_v1',
  };

  for (const [store, lsKey] of Object.entries(migrations)) {
    const raw = localStorage.getItem(lsKey);
    if (raw) {
      const data = JSON.parse(raw);
      const tx = db.transaction(store, 'readwrite');
      data.forEach(item => tx.objectStore(store).put(item));
      await new Promise(r => tx.oncomplete = r);
      localStorage.removeItem(lsKey); // clean up
    }
  }
}
```

### 2.3 Firestore Offline Mode

Firebase Firestore already has built-in offline support — we just need to enable it:

```javascript
// In app.js initialization
firebase.firestore().enablePersistence({ synchronizeTabs: true })
  .catch(err => {
    if (err.code === 'failed-precondition') {
      console.warn('Multiple tabs open, persistence can only be enabled in one tab at a time.');
    } else if (err.code === 'unimplemented') {
      console.warn('Browser does not support offline persistence.');
    }
  });
```

This gives us:
- **Automatic offline reads** from local cache
- **Automatic offline writes** queued and synced when back online
- **No custom sync logic needed** for Firestore operations

---

## Phase 3: Background Sync + Push Notifications

### 3.1 Background Sync

For operations that must reach the server (booking submissions, payment proof uploads):

```javascript
// In sw.js
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-bookings') {
    event.waitUntil(syncPendingBookings());
  }
  if (event.tag === 'sync-proofs') {
    event.waitUntil(syncPendingProofs());
  }
});

async function syncPendingBookings() {
  const db = await openDB();
  const pending = await getByIndex('syncQueue', 'type', 'booking');
  for (const item of pending) {
    try {
      await fetch('/api/bookings', {
        method: 'POST',
        body: JSON.stringify(item.data),
      });
      await remove('syncQueue', item.id);
    } catch (e) {
      // Will retry on next sync event
      break;
    }
  }
}
```

### 3.2 Push Notifications

```javascript
// In sw.js
self.addEventListener('push', (event) => {
  const data = event.data.json();
  const options = {
    body: data.body,
    icon: '/icons/icon-192.png',
    badge: '/icons/badge-72.png',
    vibrate: [100, 50, 100],
    data: { url: data.url },
    actions: data.actions || [],
  };
  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.openWindow(event.notification.data.url)
  );
});
```

**Notification triggers:**
- Booking confirmed (admin approved payment)
- Booking cancelled
- Queue position update ("You're next!")
- Open Play starting soon
- Match score submitted

---

## Phase 4: Install UX + Polish

### 4.1 Install Prompt

```javascript
// In app.js
let deferredPrompt;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  showInstallBanner();
});

function showInstallBanner() {
  const banner = document.createElement('div');
  banner.className = 'fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-[360px] ...';
  banner.innerHTML = `
    <div class="flex items-center gap-3">
      <img src="/icons/icon-192.png" class="w-12 h-12 rounded-xl"/>
      <div class="flex-1">
        <div class="font-[800] text-[14px]">Install Court Booking</div>
        <div class="mono text-[11px] opacity-60">Book courts from your home screen</div>
      </div>
      <button id="installBtn" class="px-4 h-9 rounded-full bg-[#D6FF5F] ...">Install</button>
      <button id="dismissBtn" class="w-8 h-8 rounded-full ...">✕</button>
    </div>
  `;
  document.body.appendChild(banner);

  document.getElementById('installBtn').onclick = async () => {
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') banner.remove();
    deferredPrompt = null;
  };
  document.getElementById('dismissBtn').onclick = () => banner.remove();
}
```

### 4.2 Offline Indicator

```javascript
// In app.js
window.addEventListener('online', updateOnlineStatus);
window.addEventListener('offline', updateOnlineStatus);

function updateOnlineStatus() {
  const indicator = document.getElementById('offlineIndicator');
  if (!navigator.onLine) {
    indicator.classList.remove('hidden');
    indicator.textContent = '⚡ Offline mode — changes sync when connected';
  } else {
    indicator.classList.add('hidden');
  }
}
```

---

## Migration Plan

### What stays the same:
- Firebase Firestore (backend)
- Cloud Functions (tournament engine, scoring)
- Firestore/Storage rules
- Multi-tenant architecture (per-branch configs)
- All business logic (booking, queue, stats, admin)

### What changes:
| Before | After |
|--------|-------|
| `index.html` (7,479 lines) | `index.html` (50 lines) + `js/*.js` modules |
| Inline `<script>` | ES modules (`<script type="module">`) |
| Firebase CDN | Local vendor files (cached by SW) |
| localStorage | IndexedDB + Firestore offline |
| No offline | Full offline support |
| Not installable | Installable PWA |
| No push | Push notifications |
| No background sync | Background sync for writes |

### Risk Mitigation:
1. **Feature parity**: Every feature must work identically before and after
2. **Data migration**: One-time localStorage → IndexedDB migration
3. **Graceful degradation**: If SW fails, app still works (network-only mode)
4. **Rollback**: Keep old `index.html` as `legacy.html` for 30 days
5. **Testing**: Lighthouse PWA audit must score 90+ before launch

### Estimated Effort:
- **Phase 1** (App Shell + SW): 2 weeks
- **Phase 2** (Offline Data): 2 weeks
- **Phase 3** (Sync + Push): 2 weeks
- **Phase 4** (Install UX): 1 week
- **Testing + Polish**: 1 week
- **Total**: ~8 weeks

---

## Quick Wins (Can Do Now Without Full Restructure)

Even without the full restructuring, we can add these to the current app today:

1. **Web App Manifest** — Makes the app installable
2. **Basic Service Worker** — Caches the current HTML/CSS/JS
3. **Firestore offline persistence** — One line of code
4. **Offline indicator** — Shows when network is lost
5. **App icon + theme color** — Home screen experience

These 5 items would take ~1 day and give us 70% of the PWA benefits.
