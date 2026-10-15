/* ================================================================
   CBTheme -- opt-in dark mode (light is the default; never auto-follows the
   OS unless the person explicitly picks "system").
   Preference: localStorage key cb_theme_v1 = {"pref":"light|dark|system","at":<ms>}.
   UMD like my-auth.js: pure helpers are tested under Node (require), the
   browser runtime hangs off window.CBTheme. Nothing happens on load --
   CBTheme.init() must be called (pages that only want the colour helpers can
   load it without init(); they stay light until a page opts in).
   Cross-device sync: pages that load my-auth.js (picker, account, onboarding)
   get it automatically at init() -- on MyAuth's 'synced' event the device and
   account preferences are merged with reconcileTheme() (newest `at` wins), and
   every toggle is written to localStorage first, then (fire-and-forget) to
   users/{uid}.theme / .themeAt via MyAuth.writeTheme. theme.js feature-detects
   MyAuth; my-auth.js has no dependency on this file, and queue.html (which
   never loads my-auth.js) stays Firebase-free.
   ================================================================ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CBTheme = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const KEY = 'cb_theme_v1';
  const FALLBACK_ACCENT = '#D6FF5F';
  const INK = '#0B1326';
  const META_LIGHT = '#FFFBF5';
  const META_DARK = '#0B1326';

  /* Canonical pre-paint snippet. Pages inline this text, byte for byte, in
     <head> right after the theme-color meta (tests enforce it). */
  const BOOTSTRAP = "try{var r=JSON.parse(localStorage.getItem('cb_theme_v1')||'null'),p=r&&r.pref,d=p==='dark'||(p==='system'&&matchMedia('(prefers-color-scheme: dark)').matches),e=document.documentElement;e.setAttribute('data-theme',d?'dark':'light');e.setAttribute('data-theme-pref',p||'light');document.querySelector('meta[name=theme-color]').content=d?'#0B1326':'#FFFBF5'}catch(x){}";

  /* ---------- colour helpers (pure) ---------- */
  function parseHex(s) {
    if (typeof s !== 'string') return null;
    let m = /^#([0-9a-fA-F]{3})$/.exec(s.trim());
    if (m) { const h = m[1]; return { r: parseInt(h[0] + h[0], 16), g: parseInt(h[1] + h[1], 16), b: parseInt(h[2] + h[2], 16) }; }
    m = /^#([0-9a-fA-F]{6})$/.exec(s.trim());
    if (m) return { r: parseInt(m[1].slice(0, 2), 16), g: parseInt(m[1].slice(2, 4), 16), b: parseInt(m[1].slice(4, 6), 16) };
    return null;
  }
  function toRgb(x) { return typeof x === 'string' ? (parseHex(x) || parseHex(FALLBACK_ACCENT)) : x; }
  function toHex(c) {
    const h = (v) => ('0' + Math.max(0, Math.min(255, Math.round(v))).toString(16)).slice(-2);
    return ('#' + h(c.r) + h(c.g) + h(c.b)).toUpperCase();
  }
  function luminance(x) {
    const c = toRgb(x);
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  }
  function contrast(a, b) {
    const x = luminance(a), y = luminance(b);
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  }
  /* Readable text colour for a given fill: white or ink, whichever contrasts
     more; if even that is under 4.5, pure black. */
  function onColor(fill) {
    const w = contrast(fill, '#FFFFFF'), k = contrast(fill, INK);
    const best = w >= k ? { c: '#FFFFFF', v: w } : { c: INK, v: k };
    return best.v >= 4.5 ? best.c : '#000000';
  }
  /* t = 0 -> a, t = 1 -> b */
  function mix(a, b, t) {
    const x = toRgb(a), y = toRgb(b);
    return toHex({ r: x.r + (y.r - x.r) * t, g: x.g + (y.g - x.g) * t, b: x.b + (y.b - x.b) * t });
  }
  /* A tenant colour made legible against `surface`: unchanged if it already
     meets `min` (4.5 for text, 3 for non-text), else the smallest nudge toward
     white (dark surface) or black (light surface) that does. */
  function accentForSurface(hex, surface, min) {
    const need = min || 4.5;
    const c = parseHex(hex) ? toHex(parseHex(hex)) : FALLBACK_ACCENT;
    if (contrast(c, surface) >= need) return c;
    const target = luminance(surface) < 0.5 ? '#FFFFFF' : '#000000';
    if (contrast(target, surface) < need) return target;
    let lo = 0, hi = 1;
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2;
      if (contrast(mix(c, target, mid), surface) >= need) hi = mid; else lo = mid;
    }
    return mix(c, target, hi);
  }
  /* How to paint a tenant primary on `surface`: a solid fill with readable text
     when the colour stands out from the surface (>= 3:1), otherwise a tinted
     "chip" (tint background, legible border and text). */
  function fillWithText(primary, surface) {
    const p = parseHex(primary) ? toHex(parseHex(primary)) : FALLBACK_ACCENT;
    if (contrast(p, surface) >= 3) return { mode: 'fill', fill: p, text: onColor(p) };
    const bg = mix(surface, p, 0.16); // 16% primary tint over the surface
    return { mode: 'chip', bg, border: accentForSurface(p, surface, 3), text: accentForSurface(p, bg, 4.5) };
  }

  /* ---------- preference logic (pure) ---------- */
  function normalizePref(p) { return p === 'dark' || p === 'system' ? p : 'light'; }
  function resolveTheme(pref, osDark) {
    const p = normalizePref(pref);
    return p === 'dark' || (p === 'system' && !!osDark) ? 'dark' : 'light';
  }
  function validRec(r) { return !!r && typeof r === 'object' && (r.pref === 'light' || r.pref === 'dark' || r.pref === 'system'); }
  /* A timestamp more than 24h in the future (wrong device clock) counts as 0 (invalid), so it can never
     out-vote a legitimate later choice. Same rule as normalizeThemeRecord() in my-auth.js. */
  function atOf(r) { return typeof r.at === 'number' && isFinite(r.at) && r.at <= Date.now() + 86400000 ? r.at : 0; }
  /* Merge a device record with an account record. Newest `at` wins, a tie goes
     to the remote copy. action says what the caller should do about it:
     'adopt' = take remote, 'push' = send local, 'none' = already agree/empty. */
  function reconcileTheme(local, remote) {
    const l = validRec(local) ? local : null, r = validRec(remote) ? remote : null;
    if (l && r) {
      if (atOf(l) > atOf(r)) return { pref: l.pref, at: atOf(l), action: l.pref === r.pref ? 'none' : 'push' };
      return { pref: r.pref, at: atOf(r), action: r.pref === l.pref ? 'none' : 'adopt' };
    }
    if (r) return { pref: r.pref, at: atOf(r), action: 'adopt' };
    if (l) return { pref: l.pref, at: atOf(l), action: 'push' };
    return { pref: 'light', at: 0, action: 'none' };
  }

  /* ---------- storage helpers ---------- */
  function defaultStorage() { try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch (e) { return null; } }
  function readTheme(storage) {
    try {
      const s = storage || defaultStorage();
      const r = JSON.parse((s && s.getItem(KEY)) || 'null');
      return validRec(r) ? { pref: r.pref, at: atOf(r) } : null;
    } catch (e) { return null; }
  }
  function writeTheme(pref, storage, now) {
    const rec = { pref: normalizePref(pref), at: typeof now === 'number' ? now : Date.now() };
    try { const s = storage || defaultStorage(); if (s) s.setItem(KEY, JSON.stringify(rec)); } catch (e) { /* blocked / full */ }
    return rec;
  }

  /* ---------- browser runtime (inert until init) ---------- */
  const listeners = [];
  let env = null;
  let initedDoc = null;
  let state = { pref: 'light', theme: 'light' };
  let auth = null; // MyAuth, when the page loads it (account sync)

  function osDark() {
    try { return !!(env.matchMedia && env.matchMedia('(prefers-color-scheme: dark)').matches); } catch (e) { return false; }
  }
  function apply(pref, notify) {
    pref = normalizePref(pref);
    const theme = resolveTheme(pref, osDark());
    const changed = theme !== state.theme || pref !== state.pref;
    state = { pref, theme };
    const doc = env.document, el = doc.documentElement;
    el.setAttribute('data-theme', theme);
    el.setAttribute('data-theme-pref', pref);
    const meta = doc.querySelector('meta[name=theme-color]');
    if (meta) meta.content = theme === 'dark' ? META_DARK : META_LIGHT;
    const btns = doc.querySelectorAll('[data-cb-theme-toggle]');
    for (let i = 0; i < btns.length; i++) btns[i].setAttribute('aria-pressed', theme === 'dark' ? 'true' : 'false');
    if (notify && changed) listeners.slice().forEach((cb) => { try { cb({ pref, theme }); } catch (e) { /* listener error */ } });
  }
  /* Fire-and-forget upload of a just-saved choice. Never throws, never blocks. */
  function pushNow(rec) {
    try {
      if (!auth || typeof auth.writeTheme !== 'function') return;
      Promise.resolve(auth.writeTheme(rec.pref, rec.at)).catch(function () { /* offline / denied: the device copy stands */ });
    } catch (e) { /* ignore */ }
  }
  /* Trailing debounce (last value wins) so arrowing through the Appearance radios sends one account write.
     The device write and the page switch stay immediate; only the account upload waits. */
  const PUSH_DELAY = 500;
  let pushTimer = null;
  function pushSoon(rec) {
    const st = (env && env.setTimeout) || (typeof setTimeout === 'function' ? setTimeout : null);
    const ct = (env && env.clearTimeout) || (typeof clearTimeout === 'function' ? clearTimeout : null);
    if (!st || !ct) { pushNow(rec); return; }
    if (pushTimer !== null) ct(pushTimer);
    pushTimer = st(function () { pushTimer = null; pushNow(rec); }, PUSH_DELAY);
  }
  function setPref(pref) {
    const rec = writeTheme(pref, env && env.localStorage); // device first: instant
    if (env && env.document) apply(rec.pref, true); // before init(): just persist
    pushSoon(rec);
    return rec;
  }
  /* MyAuth emits 'synced' after it has pulled users/{uid}: merge the two copies. */
  function onSynced() {
    let remote = null;
    try { remote = typeof auth.readTheme === 'function' ? auth.readTheme() : null; } catch (e) { remote = null; }
    const res = reconcileTheme(readTheme(env.localStorage), remote);
    if (res.action === 'adopt') {
      writeTheme(res.pref, env.localStorage, res.at); // keep the account's timestamp, not "now"
      apply(res.pref, true);
    } else if (res.action === 'push') {
      pushNow({ pref: res.pref, at: res.at });
    }
    return res;
  }
  function init(opts) {
    const next = Object.assign({
      document: typeof document !== 'undefined' ? document : null,
      localStorage: defaultStorage(),
      matchMedia: typeof matchMedia === 'function' ? matchMedia.bind(typeof window !== 'undefined' ? window : undefined) : null,
      window: typeof window !== 'undefined' ? window : null,
      myAuth: typeof MyAuth !== 'undefined' ? MyAuth : null,
    }, opts || {});
    if (next.document && next.document === initedDoc) return state; // idempotent per document: never double-registers listeners
    env = next;
    if (!env.document) return state;
    initedDoc = env.document;
    const rec = readTheme(env.localStorage);
    state = { pref: null, theme: null };
    apply(rec ? rec.pref : 'light', false);
    const btns = env.document.querySelectorAll('[data-cb-theme-toggle]');
    for (let i = 0; i < btns.length; i++) {
      btns[i].addEventListener('click', () => setPref(state.theme === 'dark' ? 'light' : 'dark'));
    }
    if (env.window && env.window.addEventListener) {
      env.window.addEventListener('storage', (e) => {
        if (e && e.key && e.key !== KEY) return;
        const r = readTheme(env.localStorage);
        apply(r ? r.pref : 'light', true);
      });
    }
    auth = env.myAuth && typeof env.myAuth.onChange === 'function' ? env.myAuth : null;
    if (auth) auth.onChange(function (evt) { if (evt === 'synced') { try { onSynced(); } catch (e) { /* never break the page */ } } });
    try {
      const mq = env.matchMedia && env.matchMedia('(prefers-color-scheme: dark)');
      const onOs = () => { if (state.pref === 'system') apply('system', true); };
      if (mq && mq.addEventListener) mq.addEventListener('change', onOs);
      else if (mq && mq.addListener) mq.addListener(onOs);
    } catch (e) { /* no matchMedia */ }
    return state;
  }
  function onChange(cb) {
    if (typeof cb === 'function') listeners.push(cb);
    return function () { const i = listeners.indexOf(cb); if (i >= 0) listeners.splice(i, 1); };
  }
  function current() { return { pref: state.pref, theme: state.theme }; }

  return {
    KEY, BOOTSTRAP,
    parseHex, luminance, contrast, onColor, mix, accentForSurface, fillWithText,
    normalizePref, resolveTheme, reconcileTheme,
    readTheme, writeTheme,
    init, setPref, onChange, current,
  };
});
