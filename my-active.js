/* ================================================================
   MyActive -- a cross-facility "things I'm currently part of" index.
   This whole app is one origin (index.html just varies ?client=), so
   localStorage already spans every facility on a device -- this is the
   one index in the app that is deliberately NOT suffixed by clientId
   (contrast with index.html's lsKey(), which suffixes everything else).
   It only ever holds POINTERS ({clientId, kind, refId}), never a copy of
   the booking/game itself -- my-matches.html re-reads the real record
   from that facility so it's never stale. "Active info only" is a read-
   time filter (past/cancelled/expired items are dropped when rendering),
   not something enforced here, so this module never needs a removal
   hook wired into every cancel/expire code path.
   UMD: pure functions work under Node (tests), the localStorage-backed
   convenience methods only exist where `document` is defined (browser).
   ================================================================ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MyActive = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const LS_KEY = 'cb_my_active_v1';
  const MAX_ITEMS = 300;
  const KINDS = ['booking', 'game'];

  function normalize(item) {
    if (!item || !item.clientId || !item.kind || !item.refId) return null;
    if (KINDS.indexOf(item.kind) < 0) return null;
    return {
      clientId: String(item.clientId),
      kind: String(item.kind),
      refId: String(item.refId),
      addedAt: item.addedAt || Date.now(),
    };
  }
  const sameItem = (a, b) => a.clientId === b.clientId && a.kind === b.kind && a.refId === b.refId;

  // Adds/refreshes one pointer -- de-duped (re-adding moves it to the front
  // with a fresh addedAt), capped so the list can't grow unbounded.
  function withAdded(list, item) {
    const n = normalize(item);
    if (!n) return list || [];
    const rest = (list || []).filter((x) => !sameItem(x, n));
    return [n, ...rest].slice(0, MAX_ITEMS);
  }
  function withRemoved(list, item) {
    if (!item || !item.clientId || !item.kind || !item.refId) return list || [];
    return (list || []).filter((x) => !sameItem(x, item));
  }
  function groupByClient(list) {
    const out = {};
    (list || []).forEach((x) => {
      if (!out[x.clientId]) out[x.clientId] = [];
      out[x.clientId].push(x);
    });
    return out;
  }

  const api = { LS_KEY, MAX_ITEMS, normalize, withAdded, withRemoved, groupByClient };

  if (typeof document !== 'undefined') {
    api.load = function () {
      try {
        const v = JSON.parse(localStorage.getItem(LS_KEY));
        return Array.isArray(v) ? v : [];
      } catch (e) {
        return [];
      }
    };
    api.save = function (list) {
      try { localStorage.setItem(LS_KEY, JSON.stringify(list)); } catch (e) {}
    };
    api.add = function (item) {
      const next = withAdded(api.load(), item);
      api.save(next);
      return next;
    };
    api.remove = function (item) {
      const next = withRemoved(api.load(), item);
      api.save(next);
      return next;
    };
  }

  return api;
});
