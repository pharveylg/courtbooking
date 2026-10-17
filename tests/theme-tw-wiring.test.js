/* Phase 3a wiring of store / tournament / gallery / billing: head-only edits.
   - bootstrap byte-identical to CBTheme.BOOTSTRAP, one theme-color meta, theme.css linked after
     tailwind.css and the page style block, theme.js + CBTheme.init() present, no toggle;
   - LIGHT-PARITY GUARD: the markup from <body onward (sha256) and the class-token multiset of each page
     equal the committed fixture tests/fixtures/light-parity.json (seeded from a tree verified identical to
     HEAD 9ba0e40; regenerate deliberately with scripts/update-light-parity.js). The <head> additions only add a
     meta, a stylesheet that is inert without data-theme="dark", and two scripts.
   Usage: node tests/theme-tw-wiring.test.js */
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const T = require('../theme.js');

let passed = 0, failed = 0;
function check(name, ok, detail) { if (ok) passed++; else { failed++; console.log(`  FAIL: ${name}${detail ? ' -- ' + detail : ''}`); } }
const section = (t) => console.log(`\n${t}`);
const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const norm = (s) => s.replace(/\r\n/g, '\n');
const PAGES = ['store.html', 'tournament.html', 'gallery.html', 'billing.html', 'tournament-admin.html'];
const BOOT_TAG = '<script>' + T.BOOTSTRAP + '</script>';

section('wiring (same recipe as queue/picker/account/onboarding)');
PAGES.forEach((f) => {
  const h = norm(read(f)), headEnd = h.indexOf('</head>');
  check(f + ': exactly one theme-color meta, #FFFBF5, for the bootstrap to rewrite', (h.match(/<meta name="theme-color"/g) || []).length === 1 && /<meta name="theme-color" content="#FFFBF5"\s*\/?>/.test(h));
  check(f + ': bootstrap snippet is byte-identical to CBTheme.BOOTSTRAP, exactly once, in <head>, after the meta', h.split(BOOT_TAG).length === 2 && h.indexOf(BOOT_TAG) > h.indexOf('<meta name="theme-color"') && h.indexOf(BOOT_TAG) < headEnd);
  const tw = h.indexOf('<link rel="stylesheet" href="tailwind.css"'), th = h.indexOf('<link rel="stylesheet" href="theme.css"'), st = h.lastIndexOf('</style>', headEnd);
  check(f + ': theme.css is linked once, in <head>, after tailwind.css AND after the page style block', tw > -1 && th > tw && th > st && th < headEnd && h.split('href="theme.css"').length === 2);
  check(f + ': the bootstrap runs before any stylesheet (no flash)', h.indexOf(BOOT_TAG) < tw && h.indexOf(BOOT_TAG) < th);
const ts = h.indexOf('<script src="/theme.js"></script>'), ti = h.indexOf('<script>CBTheme.init();</script>');
  check(f + ': loads /theme.js then calls CBTheme.init() (once each)', ts > th && ti > ts && ti < headEnd && h.split('src="/theme.js"').length === 2 && h.split('CBTheme.init()').length === 2);
  check(f + ': no theme toggle on the page (it honours the stored preference)', !/data-cb-theme-toggle|cb-theme-btn/.test(h));
  check(f + ': theme.js is loaded after firebase-config.js (page scripts unchanged in order)', h.indexOf('firebase-config.js') < ts);
});
check('superadmin.html stays OUT of scope: not wired, no theme.js / CBTheme / theme.css', ['superadmin.html'].every((f) => !/theme\.js|CBTheme|theme\.css/.test(read(f))));
check('tailwind.css / motion.css carry no dark rules (immutable-cached files)', !/data-theme/.test(read('tailwind.css')) && !/data-theme/.test(read('motion.css')));
check('billing.html is not an @source of tailwind-input.css and tailwind.css was not rebuilt for it', !/billing\.html/.test(read('tailwind-input.css')));

section('LIGHT-PARITY GUARD vs the committed fixture tests/fixtures/light-parity.json (durable, no git needed)');
const P = require('../scripts/update-light-parity.js');
const fixture = JSON.parse(read('tests/fixtures/light-parity.json'));
PAGES.forEach((f) => {
  const fx = fixture.pages[f];
  check(f + ': a fixture entry exists', !!fx);
  if (!fx) return;
  const d = P.describe(read(f));
  check(f + ': markup from <body onward is byte-identical (sha256) to the fixture -- no body edits (regenerate with scripts/update-light-parity.js only on purpose)', d.bodySha256 === fx.bodySha256);
  const added = [], cur = d.classTokens;
  Object.keys(cur).forEach((t) => { if (cur[t] !== fx.classTokens[t]) added.push(t + ':' + (fx.classTokens[t] || 0) + '->' + cur[t]); });
  Object.keys(fx.classTokens).forEach((t) => { if (!(t in cur)) added.push(t + ':' + fx.classTokens[t] + '->0'); });
  check(f + ': the multiset of class tokens (' + fx.classTokenCount + ' distinct) is identical to the fixture (no class edits)', added.length === 0 && d.classTokensSha256 === fx.classTokensSha256, added.slice(0, 8).join(' '));
  check(f + ': <head> minus the 5 wiring lines is identical to the fixture', d.headBaseSha256 === fx.headBaseSha256);
  const h = norm(read(f)), head = h.slice(0, h.indexOf('<body')).split('\n');
  check(f + ': the 5 wiring lines are present exactly once each, in this order', JSON.stringify(P.WIRING.map((w) => head.indexOf(w)).sort((a, b) => a - b)) === JSON.stringify(P.WIRING.map((w) => head.indexOf(w))) && P.WIRING.every((w) => head.filter((l) => l === w).length === 1));
});
check('the fixture covers exactly the wired pages', Object.keys(fixture.pages).sort().join() === PAGES.slice().sort().join());
check('mutation: a one-class edit changes the body hash and the class multiset (the guard would fail)', (() => {
  const t = read('store.html'), i = t.indexOf('<body'), mut = t.slice(0, i) + t.slice(i).replace('bg-[#FFFBF5]', 'bg-[#FFFBF6]');
  const d = P.describe(mut), fx = fixture.pages['store.html'];
  return d.bodySha256 !== fx.bodySha256 && d.classTokensSha256 !== fx.classTokensSha256;
})());
check('tests/** and scripts/** are excluded from Firebase Hosting (fixtures are never served)', (() => { const ig = JSON.parse(read('firebase.json')).hosting.ignore; return ig.includes('tests/**') && ig.includes('scripts/**'); })());

section('Phase 3b: index.html wiring (tenant booking app)');
(() => {
  const f = 'index.html', h = norm(read(f)), headEnd = h.indexOf('</head>');
  check(f + ': exactly one theme-color meta (#FFFBF5) for the bootstrap to rewrite', (h.match(/<meta name="theme-color"/g) || []).length === 1 && /<meta name="theme-color" content="#FFFBF5"\s*\/?>/.test(h));
  check(f + ': bootstrap is byte-identical to CBTheme.BOOTSTRAP, once, in <head>, right after the meta', h.split(BOOT_TAG).length === 2 && h.indexOf(BOOT_TAG) > h.indexOf('<meta name="theme-color"') && h.indexOf(BOOT_TAG) < headEnd && h.slice(h.indexOf('<meta name="theme-color"')).split('\n')[1] === BOOT_TAG);
  const tw = h.indexOf('href="tailwind.css"'), mo = h.indexOf('href="motion.css"'), th = h.indexOf('<link rel="stylesheet" href="theme.css"'), st = h.lastIndexOf('</style>', headEnd);
  check(f + ': theme.css is the LAST stylesheet: after tailwind.css, motion.css and the page <style> block, still in <head>', tw > -1 && mo > -1 && th > tw && th > mo && th > st && th < headEnd && h.split('href="theme.css"').length === 2);
const ts = h.indexOf('<script src="/theme.js"></script>'), ti = h.indexOf('<script>CBTheme.init();</script>');
  check(f + ': /theme.js is loaded in <head>; CBTheme.init() runs once at the END of <body> (after the header toggles exist, so their click handlers bind)', ts > th && ts < headEnd && ti > h.indexOf('<body') && h.slice(ti).replace(/\s+$/, '') === '<script>CBTheme.init();</script>\n</body>\n</html>' && h.split('src="/theme.js"').length === 2 && h.split('CBTheme.init()').length === 2);
  check(f + ': my-auth.js is still loaded but MyAuth.init() is NOT called (no cross-device theme sync on index)', /<script src="\/my-auth\.js"><\/script>/.test(h) && !/MyAuth\.init\(/.test(h));
  check(f + ': MyAuth.init() is never called, so no account-sync event can ever reach CBTheme (device preference only); my-auth.js has no CBTheme dependency', !/MyAuth\.init\(/.test(h) && !/CBTheme/.test(read('my-auth.js')));
  const tog = h.match(/<button[^>]*data-cb-theme-toggle[^>]*>/g) || [];
  const common = (b) => b.includes('aria-label="Dark mode"') && b.includes('aria-pressed="false"') && b.includes('type="button"');
  check(f + ': exactly two toggles: one desktop header toggle (32px, .cb-theme-btn--32) and one mobile Home-footer toggle (36px, .cb-theme-btn--foot), each with aria-label "Dark mode" and aria-pressed', tog.length === 2 && tog.every(common) && tog.filter((b) => b.includes('class="cb-theme-btn cb-theme-btn--32 ')).length === 1 && tog.filter((b) => b.includes('class="cb-theme-btn cb-theme-btn--foot"')).length === 1);
  const hdr = h.slice(h.indexOf('<header'), h.indexOf('</header>'));
  check(f + ': the MOBILE header is untouched: exactly ONE toggle inside <header> (desktop cluster only); the mobile cluster is just the two original circles', (hdr.match(/data-cb-theme-toggle/g) || []).length === 1 && !/cb-theme-btn--m\b/.test(h));
  const desk = hdr.slice(hdr.indexOf('hidden md:flex items-center gap-2'), hdr.indexOf('flex items-center gap-1.5 md:hidden'));
  check(f + ': the desktop toggle sits in the desktop cluster (hidden below md, so display:none on phones) before the Staff button', desk.indexOf('cb-theme-btn--32') > -1 && desk.indexOf('cb-theme-btn--32') < desk.indexOf('id="headerAdminToggle"'));
  const home = h.slice(h.indexOf('id="view-home"'), h.indexOf('id="view-contact"'));
  const pill = home.indexOf('class="dula-credit"'), foot = home.indexOf('cb-theme-btn--foot');
  check(f + ': the footer toggle is a NEW row right after the dula-credit pill container on the Home view, wrapped in `md:hidden` (display:none on desktop, so not focusable there); the pill markup is untouched', pill > -1 && foot > pill && /<\/div>\n        <div class="flex justify-center md:hidden pb-2"><button type="button" class="cb-theme-btn cb-theme-btn--foot"/.test(home.slice(pill)) && !/cb-theme-btn/.test(home.slice(pill, home.indexOf('</div>', pill))));
  check(f + ': the admin theme editor carries the "Dark mode ignores these colors" hint', /Dark mode ignores these colors \(fixed palette\)\./.test(h));
  const tcss = read('theme.css');
  check(f + ': toggle CSS: --32 is 32px, --foot is 36px with a 44px hit area; the old mobile-header modifier is gone', /\.cb-theme-btn--32\s*\{[^}]*height: 32px/.test(tcss) && /\.cb-theme-btn--foot\s*\{[^}]*height: 36px/.test(tcss) && /\.cb-theme-btn--foot::after\s*\{[^}]*top: -4px/.test(tcss) && !/cb-theme-btn--m|cb-theme-btn--36/.test(tcss));
})();

section('index.html light parity: pinned by an ALLOWED DELTA (toggle buttons, admin hint, token-for-literal substitutions)');
(() => {
  const fx = fixture.index, cur = read('index.html');
  check('the fixture has an index entry with a baseline (' + (fx && fx.baselineRef) + ')', !!fx && /^[0-9a-f]{7,40}$/.test(fx.baselineRef));
  if (!fx) return;
  const body = P.bodyOf(cur);
  // 1. the class-token multiset delta vs the baseline is EXACTLY the toggle + hint classes
  const now = P.classTokens(norm(cur)), delta = {};
  Object.keys(now).forEach((t) => { if (now[t] !== (fx.baselineClassTokens[t] || 0)) delta[t] = now[t] - (fx.baselineClassTokens[t] || 0); });
  Object.keys(fx.baselineClassTokens).forEach((t) => { if (!(t in now)) delta[t] = -fx.baselineClassTokens[t]; });
  const expected = { 'cb-theme-btn': 2, 'cb-theme-btn--32': 1, 'cb-theme-btn--foot': 1, 'cb-ico-moon': 2, 'cb-ico-sun': 2, 'shadow-xs': 1, 'shrink-0': 1, 'cursor-pointer': 1, flex: 1, 'justify-center': 1, 'md:hidden': 1, 'pb-2': 1, mono: 1, 'text-[11px]': 1, 'opacity-60': 1, 'mt-1': 1 };
  check('class-token delta vs ' + fx.baselineRef + ' equals exactly the toggle + hint classes', JSON.stringify(delta, Object.keys(delta).sort()) === JSON.stringify(expected, Object.keys(expected).sort()), JSON.stringify(delta));
  check('...and equals the delta recorded in the fixture', JSON.stringify(delta, Object.keys(delta).sort()) === JSON.stringify(fx.classTokenDelta, Object.keys(fx.classTokenDelta).sort()));
  // 2. reversing exactly the allowed delta in today's body gives back the baseline body (sha256)
  let rev = null;
  try { rev = P.reverseDelta(body, fx.additions, fx.substitutions); } catch (e) { rev = 'ERR ' + e.message; }
  check('reversing the allowed delta (1 desktop toggle, 1 footer toggle row, 1 hint line, the CBTheme.init() script, ' + fx.substitutions.reduce((n, s) => n + s.count, 0) + ' literal-to-token substitutions) restores the baseline body byte for byte', rev !== null && P.sha(rev) === fx.baselineBodySha256, String(rev).slice(0, 120));
  // 3. every literal replaced by a token resolves in light to the same value
  const css = read('theme.css'), root = /:root\s*\{([^}]*--card[^}]*)\}/.exec(css)[1];
  const light = {}; root.replace(/(--[\w-]+)\s*:\s*([^;]+);/g, (_, k, v) => { light[k] = v.trim(); });
  fx.substitutions.forEach((s) => {
    const m = /var\((--[\w-]+),\s*(#[0-9A-Fa-f]{6})\)/.exec(s.to);
    check('substitution ' + s.token + ': the light token value ' + light[m && m[1]] + ' AND the var() fallback ' + (m && m[2]) + ' both equal the old literal ' + s.lightValue, !!m && m[1] === s.token && light[m[1]].toUpperCase() === s.lightValue.toUpperCase() && m[2].toUpperCase() === s.lightValue.toUpperCase());
    check('substitution ' + s.token + ': the old literal no longer appears at those ' + s.count + ' sites and the new one does', body.split(s.from).length === 1 && body.split(s.to).length - 1 === s.count);
  });
  check('index <head> minus the wiring lines equals the baseline head (only the 4 new wiring lines were added; the meta already existed)', P.describe(cur).headBaseSha256 === fx.headBaseSha256);
  // 4. the toggle buttons carry no colour of their own that could change light look: neighbouring borders / white fill
  check('toggle light look = neighbouring circle buttons: 1px var(--control-border) #EAE0D5 border, --card #FFF fill', /--control-border: #EAE0D5/.test(css) && /\.cb-theme-btn--32 \{[^}]*background: var\(--card\)/.test(css) && /--card: #FFFFFF/.test(css));
})();

section('bootstrap vs hostile localStorage values (never throws, always resolves to light unless pref is exactly dark/system+OS dark)');
(() => {
  const vm = require('vm');
  function run(stored, os) {
    const attrs = {}, meta = { content: '#FFFBF5' };
    const ctx = vm.createContext({
      localStorage: { getItem: () => stored }, matchMedia: () => ({ matches: !!os }),
      document: { documentElement: { setAttribute: (k, v) => { attrs[k] = v; } }, querySelector: () => meta },
    });
    let threw = false;
    try { vm.runInContext(T.BOOTSTRAP, ctx); } catch (e) { threw = true; }
    return { threw, theme: attrs['data-theme'], meta: meta.content };
  }
  const big = '{"pref":"' + 'x'.repeat(200000) + '"}';
  const hostile = ['not json', '{', 'null', '[]', '"dark"', '42', '{"pref":{"a":1}}', '{"pref":["dark"]}', '{"pref":"__proto__"}', '{"pref":"constructor"}', '{"__proto__":{"pref":"dark"}}', '{"pref":"DARK"}', '{"pref":null}', '{}', big, '{"pref":"dark\\u0000"}', ''];
  hostile.forEach((v) => {
    const r = run(v, true);
    check('hostile cb_theme_v1 ' + JSON.stringify(v.length > 40 ? v.slice(0, 30) + '...(' + v.length + ' chars)' : v) + ': no throw, never dark (light, or no attribute at all when the JSON is unparseable: the CSS default is light), meta stays cream even with an OS that prefers dark', !r.threw && (r.theme === 'light' || r.theme === undefined) && r.meta === '#FFFBF5', JSON.stringify(r));
  });
  check('a getItem that throws (blocked storage) is swallowed: no throw, no data-theme change', (() => { const attrs = {}; const ctx = vm.createContext({ localStorage: { getItem() { throw new Error('denied'); } }, matchMedia: () => ({ matches: true }), document: { documentElement: { setAttribute: (k, v) => { attrs[k] = v; } }, querySelector: () => ({}) } }); try { vm.runInContext(T.BOOTSTRAP, ctx); } catch (e) { return false; } return Object.keys(attrs).length === 0; })());
  check('sanity: the exact values dark / system(+OS dark) still resolve to dark', run('{"pref":"dark"}', false).theme === 'dark' && run('{"pref":"system"}', true).theme === 'dark' && run('{"pref":"system"}', false).theme === 'light');
})();

console.log(`\ntheme-tw-wiring: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
