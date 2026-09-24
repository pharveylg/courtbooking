/* ================================================================
   PushInbox -- a device-local history of push notifications this
   browser has actually shown, so my-matches.html can list "messages
   about schedules" (match alerts) instead of them being pure fire-
   and-forget. Backed by IndexedDB specifically because it's the one
   storage a Service Worker can share with the page -- sw.js records
   into it from the `push` event, my-matches.html reads it back.
   Deliberately NOT synced anywhere: it only ever reflects what THIS
   device has received, and the UI that reads it says so.
   UMD: `normalize`/clientId-from-url parsing are pure (tested under
   Node); the IndexedDB-backed methods only exist where IndexedDB does
   (service worker + browser, not Node).
   ================================================================ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PushInbox = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const DB_NAME = 'cb-push-inbox';
  const DB_VERSION = 1;
  const STORE = 'messages';
  const MAX_MESSAGES = 100;

  function clientIdFromUrl(url) {
    try {
      const u = new URL(url, 'https://x.invalid');
      return u.searchParams.get('client') || null;
    } catch (e) {
      return null;
    }
  }
  // payload is whatever shape the push event's JSON carries today: { title, body, tag, url }
  function normalize(payload, receivedAt) {
    const p = payload || {};
    return {
      id: (p.tag ? p.tag + '_' : 'm_') + (receivedAt || Date.now()) + '_' + Math.random().toString(36).slice(2, 8),
      title: p.title || 'Notification',
      body: p.body || '',
      url: p.url || '/',
      clientId: clientIdFromUrl(p.url),
      receivedAt: receivedAt || Date.now(),
    };
  }

  const api = { DB_NAME, DB_VERSION, STORE, MAX_MESSAGES, normalize, clientIdFromUrl };

  if (typeof indexedDB !== 'undefined') {
    function openDb() {
      return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    }
    function getAll(db) {
      return new Promise((resolve, reject) => {
        const req = db.transaction(STORE, 'readonly').objectStore(STORE).getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
      });
    }
    api.record = async function (payload) {
      const msg = normalize(payload);
      const db = await openDb();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put(msg);
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
      });
      const all = await getAll(db);
      if (all.length > MAX_MESSAGES) {
        const stale = all.sort((a, b) => a.receivedAt - b.receivedAt).slice(0, all.length - MAX_MESSAGES);
        await new Promise((resolve, reject) => {
          const tx = db.transaction(STORE, 'readwrite');
          const store = tx.objectStore(STORE);
          stale.forEach((m) => store.delete(m.id));
          tx.oncomplete = resolve;
          tx.onerror = () => reject(tx.error);
        });
      }
      return msg;
    };
    api.list = async function () {
      const db = await openDb();
      const all = await getAll(db);
      return all.sort((a, b) => b.receivedAt - a.receivedAt);
    };
  }

  return api;
});
