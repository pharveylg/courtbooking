/* theme.js: colour helpers, preference logic, reconcile truth table, and the
   pre-paint bootstrap snippet run in a fake browser. Usage: node tests/theme.test.js */
const vm = require('vm');
const T = require('../theme.js');

let passed = 0, failed = 0;
function check(name, ok, detail) { if (ok) passed++; else { failed++; console.log(`  FAIL: ${name}${detail ? ' -- ' + detail : ''}`); } }
const section = (t) => console.log(`\n${t}`);
const near = (a, b, e) => Math.abs(a - b) <= (e || 0.01);

section('parseHex / luminance / contrast');
check('#RRGGBB parses', JSON.stringify(T.parseHex('#D6FF5F')) === JSON.stringify({ r: 214, g: 255, b: 95 }));
check('#RGB expands', JSON.stringify(T.parseHex('#fa0')) === JSON.stringify({ r: 255, g: 170, b: 0 }));
check('invalid input is null', ['', 'red', '#12', '#12345', '#GGGGGG', null, undefined, 42, '#1234567'].every((x) => T.parseHex(x) === null));
check('luminance of white/black', near(T.luminance('#FFFFFF'), 1, 1e-9) && near(T.luminance('#000000'), 0, 1e-9));
check('black on white is 21:1', near(T.contrast('#000000', '#FFFFFF'), 21, 1e-6));
check('contrast is symmetric', near(T.contrast('#0B1326', '#F4EEE6'), T.contrast('#F4EEE6', '#0B1326'), 1e-9));
check('same colour is 1:1', near(T.contrast('#808080', '#808080'), 1, 1e-9));
check('lime on near-black is high (known pair)', T.contrast('#D6FF5F', '#0B1326') > 14);
check('mix endpoints and midpoint', T.mix('#000000', '#FFFFFF', 0) === '#000000' && T.mix('#000000', '#FFFFFF', 1) === '#FFFFFF' && T.mix('#000000', '#FFFFFF', 0.5) === '#808080');

section('onColor >= 4.5 across an RGB grid');
let worst = 99, bad = 0;
for (let r = 0; r <= 255; r += 51) for (let g = 0; g <= 255; g += 51) for (let b = 0; b <= 255; b += 51) {
  const fill = '#' + [r, g, b].map((v) => ('0' + v.toString(16)).slice(-2)).join('');
  const c = T.contrast(fill, T.onColor(fill));
  worst = Math.min(worst, c); if (c < 4.5) bad++;
}
check('every grid colour gets a >=4.5:1 text colour', bad === 0, 'worst ' + worst.toFixed(2));
check('onColor: white on navy, ink on lime', T.onColor('#1E3A8A') === '#FFFFFF' && T.onColor('#D6FF5F') === '#0B1326');

section('accentForSurface');
const S = '#201C19';
check('already-legible colours are unchanged (lime)', T.accentForSurface('#D6FF5F', S, 4.5) === '#D6FF5F');
['#1E3A8A', '#0B1F3A', '#DC2626', '#808080', '#D6FF5F', '#000000', '#123'].forEach((c) => {
  const t = T.accentForSurface(c, S, 4.5), n = T.accentForSurface(c, S, 3);
  check(`${c} -> ${t} text >= 4.5 on dark surface`, T.contrast(t, S) >= 4.5, T.contrast(t, S).toFixed(2));
  check(`${c} -> ${n} non-text >= 3 on dark surface`, T.contrast(n, S) >= 3 && T.contrast(n, S) <= T.contrast(t, S) + 1e-9);
});
check('dark navy is lightened, not left alone', T.accentForSurface('#0B1F3A', S, 4.5) !== '#0B1F3A' && T.luminance(T.accentForSurface('#0B1F3A', S, 4.5)) > T.luminance('#0B1F3A'));
check('the nudge is minimal (not jumped all the way to white)', T.accentForSurface('#1E3A8A', S, 4.5) !== '#FFFFFF');
check('light surface darkens instead', T.contrast(T.accentForSurface('#D6FF5F', '#FFFFFF', 4.5), '#FFFFFF') >= 4.5);
check('invalid hex falls back to the lime accent', T.accentForSurface('nope', S, 4.5) === '#D6FF5F');

section('fillWithText');
const fl = T.fillWithText('#D6FF5F', '#0B1326');
check('bright primary -> solid fill with readable text', fl.mode === 'fill' && fl.fill === '#D6FF5F' && T.contrast(fl.fill, fl.text) >= 4.5);
const ch = T.fillWithText('#0B1F3A', '#0B1326');
check('near-surface primary -> chip', ch.mode === 'chip');
check('chip border >= 3:1 and text >= 4.5:1 on its own background', T.contrast(ch.border, '#0B1326') >= 3 && T.contrast(ch.text, ch.bg) >= 4.5);
check('chip bg is a faint tint of the primary over the surface', T.contrast(ch.bg, '#0B1326') < 1.3);
check('invalid primary falls back to lime', T.fillWithText('x', '#0B1326').fill === '#D6FF5F');

section('normalizePref / resolveTheme');
check('invalid/absent -> light', [undefined, null, '', 'LIGHT', 'auto', 7, {}].every((p) => T.normalizePref(p) === 'light'));
check('valid values pass through', ['light', 'dark', 'system'].every((p) => T.normalizePref(p) === p));
check('default is light even if the OS is dark', T.resolveTheme(undefined, true) === 'light' && T.resolveTheme('light', true) === 'light');
check('dark is dark regardless of OS', T.resolveTheme('dark', false) === 'dark' && T.resolveTheme('dark', true) === 'dark');
check("'system' follows the OS only when asked", T.resolveTheme('system', true) === 'dark' && T.resolveTheme('system', false) === 'light');

section('reconcileTheme truth table');
const R = T.reconcileTheme;
const eq = (a, b) => a.pref === b.pref && a.at === b.at && a.action === b.action;
check('neither -> light / none', eq(R(null, null), { pref: 'light', at: 0, action: 'none' }));
check('remote only -> adopt', eq(R(null, { pref: 'dark', at: 5 }), { pref: 'dark', at: 5, action: 'adopt' }));
check('local only -> push', eq(R({ pref: 'system', at: 5 }, undefined), { pref: 'system', at: 5, action: 'push' }));
check('both, local newer -> local wins, push', eq(R({ pref: 'dark', at: 9 }, { pref: 'light', at: 5 }), { pref: 'dark', at: 9, action: 'push' }));
check('both, remote newer -> remote wins, adopt', eq(R({ pref: 'dark', at: 5 }, { pref: 'light', at: 9 }), { pref: 'light', at: 9, action: 'adopt' }));
check('tie with different prefs -> remote wins', eq(R({ pref: 'dark', at: 7 }, { pref: 'light', at: 7 }), { pref: 'light', at: 7, action: 'adopt' }));
check('same pref either way -> none', R({ pref: 'dark', at: 9 }, { pref: 'dark', at: 5 }).action === 'none' && R({ pref: 'dark', at: 1 }, { pref: 'dark', at: 5 }).action === 'none');
check('invalid local is ignored (remote adopted)', eq(R({ pref: 'purple', at: 99 }, { pref: 'dark', at: 1 }), { pref: 'dark', at: 1, action: 'adopt' }));
check('invalid remote is ignored (local pushed)', eq(R({ pref: 'dark', at: 1 }, 'junk'), { pref: 'dark', at: 1, action: 'push' }));
check('missing at counts as 0', eq(R({ pref: 'dark' }, { pref: 'light', at: 1 }), { pref: 'light', at: 1, action: 'adopt' }));

section('readTheme / writeTheme');
const mem = () => { const m = {}; return { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, _m: m }; };
const st = mem();
const rec = T.writeTheme('dark', st, 1234);
check('writes {pref, at} under cb_theme_v1', T.KEY === 'cb_theme_v1' && JSON.stringify(rec) === '{"pref":"dark","at":1234}' && st._m.cb_theme_v1 === '{"pref":"dark","at":1234}');
check('reads it back', JSON.stringify(T.readTheme(st)) === '{"pref":"dark","at":1234}');
check('invalid pref is normalised to light on write', T.writeTheme('purple', mem(), 1).pref === 'light');
const badSt = mem(); badSt.setItem('cb_theme_v1', '{oops');
check('malformed JSON reads as null, never throws', T.readTheme(badSt) === null);
check('throwing storage is tolerated', T.readTheme({ getItem() { throw new Error('x'); } }) === null && T.writeTheme('dark', { setItem() { throw new Error('x'); } }, 1).pref === 'dark');

section('bootstrap snippet (run in a fake browser)');
function boot(stored, osDark, opts) {
  opts = opts || {};
  const attrs = {}, meta = { content: '#FFFBF5' };
  const ctx = {
    localStorage: { getItem: (k) => { if (opts.throwStorage) throw new Error('blocked'); return k === 'cb_theme_v1' ? stored : null; } },
    matchMedia: (q) => ({ matches: q.indexOf('dark') > -1 && osDark }),
    document: { documentElement: { setAttribute: (k, v) => { attrs[k] = v; } }, querySelector: () => (opts.noMeta ? null : meta) },
  };
  let threw = false;
  try { vm.runInNewContext(T.BOOTSTRAP, ctx); } catch (e) { threw = true; }
  return { attrs, meta, threw };
}
let b = boot(null, true);
check('nothing stored -> light, even when the OS is dark', b.attrs['data-theme'] === 'light' && b.attrs['data-theme-pref'] === 'light' && b.meta.content === '#FFFBF5');
b = boot('{"pref":"dark","at":1}', false);
check('stored dark -> dark + dark theme-color', b.attrs['data-theme'] === 'dark' && b.attrs['data-theme-pref'] === 'dark' && b.meta.content === '#0B1326');
b = boot('{"pref":"system","at":1}', true);
check('system + OS dark -> dark, pref kept as system', b.attrs['data-theme'] === 'dark' && b.attrs['data-theme-pref'] === 'system' && b.meta.content === '#0B1326');
b = boot('{"pref":"system","at":1}', false);
check('system + OS light -> light', b.attrs['data-theme'] === 'light' && b.attrs['data-theme-pref'] === 'system');
b = boot('{"pref":"light","at":1}', true);
check('stored light + OS dark -> light', b.attrs['data-theme'] === 'light');
b = boot('{oops', true);
check('malformed JSON does not throw and never goes dark', !b.threw && b.attrs['data-theme'] !== 'dark');
b = boot('{"pref":"banana"}', true);
check('unknown pref -> light theme', !b.threw && b.attrs['data-theme'] === 'light');
b = boot(null, false, { throwStorage: true });
check('blocked storage does not throw', !b.threw);
b = boot('{"pref":"dark"}', false, { noMeta: true });
check('a page with no theme-color meta does not throw', !b.threw);

section('runtime init (fake DOM)');
function fakeDom(stored, osDark) {
  const attrs = {}, meta = { content: '' }, listeners = {}, btnAttrs = {};
  const btn = { setAttribute: (k, v) => { btnAttrs[k] = v; }, addEventListener: (ev, fn) => { listeners.click = fn; } };
  const mqL = [];
  const store = mem(); if (stored) store.setItem('cb_theme_v1', stored);
  const winL = {};
  const env = {
    document: { documentElement: { setAttribute: (k, v) => { attrs[k] = v; } }, querySelector: () => meta, querySelectorAll: (q) => (q === '[data-cb-theme-toggle]' ? [btn] : []) },
    localStorage: store,
    matchMedia: () => ({ matches: osDark.v, addEventListener: (e, fn) => mqL.push(fn) }),
    window: { addEventListener: (e, fn) => { winL[e] = fn; } },
  };
  return { env, attrs, meta, btnAttrs, listeners, mqL, winL, store };
}
let d = fakeDom(null, { v: true });
const seen = [];
T.onChange((s) => seen.push(s.theme));
T.init(d.env);
check('init with nothing stored -> light and aria-pressed=false', d.attrs['data-theme'] === 'light' && d.btnAttrs['aria-pressed'] === 'false' && d.meta.content === '#FFFBF5');
d.listeners.click();
check('toggle -> dark, persisted with a timestamp, meta + aria updated, onChange fired', d.attrs['data-theme'] === 'dark' && d.meta.content === '#0B1326' && d.btnAttrs['aria-pressed'] === 'true' && JSON.parse(d.store._m.cb_theme_v1).pref === 'dark' && JSON.parse(d.store._m.cb_theme_v1).at > 0 && seen[seen.length - 1] === 'dark');
d.listeners.click();
check('toggle again -> light', d.attrs['data-theme'] === 'light' && JSON.parse(d.store._m.cb_theme_v1).pref === 'light');
d.store.setItem('cb_theme_v1', '{"pref":"dark","at":99}'); d.winL.storage({ key: 'cb_theme_v1' });
check('storage event from another tab applies the new theme', d.attrs['data-theme'] === 'dark');
d.winL.storage({ key: 'something_else' });
check('unrelated storage keys are ignored', d.attrs['data-theme'] === 'dark');
const os = { v: false }; d = fakeDom('{"pref":"system","at":1}', os);
T.init(d.env);
check('system + OS light starts light', d.attrs['data-theme'] === 'light' && d.attrs['data-theme-pref'] === 'system');
os.v = true; d.mqL.forEach((fn) => fn());
check('OS flips to dark -> follows (system only)', d.attrs['data-theme'] === 'dark');
os.v = false; d = fakeDom('{"pref":"light","at":1}', os); T.init(d.env); os.v = true; d.mqL.forEach((fn) => fn());
check('explicit light ignores OS changes', d.attrs['data-theme'] === 'light');
check('toggle from system+OS dark goes to light', (() => { const o = { v: true }; const x = fakeDom('{"pref":"system","at":1}', o); T.init(x.env); x.listeners.click(); return x.attrs['data-theme'] === 'light' && JSON.parse(x.store._m.cb_theme_v1).pref === 'light'; })());
check('inert without a document (Node)', (() => { try { return typeof T.init({ document: null }) === 'object'; } catch (e) { return false; } })());

section('lifecycle guards');
const fresh = () => { delete require.cache[require.resolve('../theme.js')]; return require('../theme.js'); };
check('setPref before init() does not throw and just persists', (() => { try { return fresh().setPref('dark').pref === 'dark'; } catch (e) { return false; } })());
check('init() twice on the same document registers listeners once', (() => {
  const T2 = fresh();
  let clicks = 0, wins = 0, mqs = 0;
  const btn = { setAttribute() {}, addEventListener() { clicks++; } };
  const doc = { documentElement: { setAttribute() {} }, querySelector: () => ({ content: '' }), querySelectorAll: () => [btn] };
  const env = { document: doc, localStorage: mem(), matchMedia: () => ({ matches: false, addEventListener() { mqs++; } }), window: { addEventListener() { wins++; } } };
  T2.init(env); T2.init(env); T2.init(env);
  return clicks === 1 && wins === 1 && mqs === 1;
})());
check('a toggle after a double init flips to dark exactly once', (() => {
  const T2 = fresh();
  const handlers = [], attrs = {};
  const btn = { setAttribute() {}, addEventListener(e, fn) { handlers.push(fn); } };
  const doc = { documentElement: { setAttribute: (k, v) => { attrs[k] = v; } }, querySelector: () => ({ content: '' }), querySelectorAll: () => [btn] };
  const env = { document: doc, localStorage: mem(), matchMedia: () => ({ matches: false, addEventListener() {} }), window: { addEventListener() {} } };
  T2.init(env); T2.init(env); handlers.forEach((h) => h());
  return handlers.length === 1 && attrs['data-theme'] === 'dark';
})());

console.log(`\n=== THEME: ${passed}/${passed + failed} passed ===`);
process.exit(failed === 0 ? 0 : 1);
