/* Dark-mode tokens and wiring: theme.css values vs the approved palette,
   contrast thresholds, queue.html parity/bootstrap, scoreboard palette, SW and
   hosting headers. Usage: node tests/theme-tokens.test.js */
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const T = require('../theme.js');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const css = read('theme.css'), queueHtml = read('queue.html'), sw = read('sw.js'), fb = JSON.parse(read('firebase.json'));
const board = read('court-scoreboard.js'), manifest = JSON.parse(read('manifest.json'));

let passed = 0, failed = 0;
function check(name, ok, detail) { if (ok) passed++; else { failed++; console.log(`  FAIL: ${name}${detail ? ' -- ' + detail : ''}`); } }
const section = (t) => console.log(`\n${t}`);

function decls(block) {
  const o = {};
  block.replace(/(--[\w-]+)\s*:\s*([^;]+);/g, (_, k, v) => { o[k] = v.trim(); });
  return o;
}
/* the :root{...} light block (first one carrying --card) and the dark block inside @media screen */
const lightBlock = /:root\s*\{([^}]*--card[^}]*)\}/.exec(css);
const mediaBlock = /@media screen\s*\{\s*:root\[data-theme="dark"\]\s*\{([^}]*)\}\s*\}/.exec(css);
const light = decls(lightBlock ? lightBlock[1] : ''), dark = decls(mediaBlock ? mediaBlock[1] : '');

section('theme.css structure');
check('color-scheme: light globally; color-scheme: dark only inside @media screen (print stays light-flagged)', /:root\s*\{\s*color-scheme:\s*light;?\s*\}/.test(css) && /color-scheme:\s*dark/.test(mediaBlock ? mediaBlock[1] : '') && (css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/@media screen\s*\{[\s\S]*?\}\s*\}/, '').match(/color-scheme:\s*dark/g) || []).length === 0);
check('theme.css comment says sw.js serves css cache-first and needs a CACHE_NAME bump (not "served no-cache")', /cache-first/.test(css) && /CACHE_NAME/.test(css) && !/Served no-cache/.test(css));
check('the dark token block is wrapped in @media screen (print stays light)', !!mediaBlock);
check('no dark token rule exists outside @media screen', (css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/@media screen\s*\{[\s\S]*?\}\s*\}/, '').match(/--(cream|ink|sand|line)\s*:/g) || []).length === 0);
check('.cb-force-light and .cb-theme-btn exist; button is at least 44px', /\.cb-force-light\s*\{[^}]*background:\s*#fff[^}]*color-scheme:\s*light/.test(css) && /\.cb-theme-btn\s*\{[^}]*min-width:\s*44px[^}]*min-height:\s*44px/.test(css));
check('the toggle styles aria-pressed', /\.cb-theme-btn\[aria-pressed="true"\]/.test(css));

section('light token values equal the pre-dark literals');
const LIGHT = { '--card': '#FFFFFF', '--panel': '#201C19', '--on-panel': '#FFFBF5', '--pill-on-bg': '#201C19', '--pill-on-border': '#201C19', '--control-border': '#EAE0D5', '--placeholder': 'rgba(32,28,25,.4)', '--scrim': 'rgba(32,28,25,.6)', '--danger-text': '#8C2C10', '--ink-fixed': '#201C19' };
Object.keys(LIGHT).forEach((k) => check(`light ${k} = ${LIGHT[k]}`, light[k] === LIGHT[k], String(light[k])));

section('dark token values equal the Stitch "Court Kinetic" dark palette');
const DARK = { '--cream': '#0B1326', '--ink': '#DAE2FD', '--sand': '#222A3D', '--line': '#2D3449', '--muted': '#C1CAB0', '--lime': '#84CC16', '--lime-text': '#9EE939', '--on-lime': '#0B1326', '--card': '#171F33', '--panel': '#222A3D', '--on-panel': '#DAE2FD', '--pill-on-bg': '#222A3D', '--pill-on-border': '#9EE939', '--control-border': '#8B947D', '--placeholder': '#8B947D', '--scrim': 'rgba(6,14,32,.72)', '--danger-text': '#FFB4AB', '--ink-fixed': '#201C19' };
Object.keys(DARK).forEach((k) => check(`dark ${k} = ${DARK[k]}`, dark[k] === DARK[k], String(dark[k])));
check('light --lime-text / --on-lime equal the old literals (D6FF5F / 201C19)', light['--lime-text'] === '#D6FF5F' && light['--on-lime'] === '#201C19');
check('no old warm-brown dark palette values remain in theme.css', !/#14110F|#2B2622|#F4EEE6|#7A7168|#A9A29A|#8F887F|#3A342F|#FF9B80/i.test(css));
check('dark chrome is fixed: theme.css and the dark CSS never reference tenant colour variables', !/--(primary|brand|tenant|accent|bg-color)/i.test(css) && !/tenant|--brand|--primary/i.test(queueHtml.slice(queueHtml.indexOf('/* ---- Dark mode'), queueHtml.indexOf('</style>'))));

section('dark contrast thresholds (every pair the dark theme uses)');
const surfaces = { bg: dark['--cream'], card: dark['--card'], surface2: dark['--sand'] };
Object.entries(surfaces).forEach(([n, s]) => {
  check(`text on ${n} >= 4.5`, T.contrast(dark['--ink'], s) >= 4.5, T.contrast(dark['--ink'], s).toFixed(2));
  check(`muted on ${n} >= 4.5`, T.contrast(dark['--muted'], s) >= 4.5, T.contrast(dark['--muted'], s).toFixed(2));
  check(`lime text on ${n} >= 4.5`, T.contrast(dark['--lime-text'], s) >= 4.5, T.contrast(dark['--lime-text'], s).toFixed(2));
  check(`control border on ${n} >= 3`, T.contrast(dark['--control-border'], s) >= 3, T.contrast(dark['--control-border'], s).toFixed(2));
  check(`placeholder on ${n} >= 4.5`, T.contrast(dark['--placeholder'], s) >= 4.5, T.contrast(dark['--placeholder'], s).toFixed(2));
  check(`error / danger text #FFB4AB on ${n} >= 4.5`, T.contrast(dark['--danger-text'], s) >= 4.5 && T.contrast('#FFB4AB', s) >= 4.5);
  check(`success text #5AEF82 on ${n} >= 4.5`, T.contrast('#5AEF82', s) >= 4.5, T.contrast('#5AEF82', s).toFixed(2));
});
check('dark text on the lime button (--on-lime on --lime) >= 4.5', T.contrast(dark['--on-lime'], dark['--lime']) >= 4.5, T.contrast(dark['--on-lime'], dark['--lime']).toFixed(2));
check('lime text on the pressed-pill fill >= 4.5', T.contrast(dark['--lime-text'], dark['--pill-on-bg']) >= 4.5);
check('pressed-pill border (lime) >= 3 on the page bg', T.contrast(dark['--pill-on-border'], dark['--cream']) >= 3);
check('toast/button text on the panel >= 4.5', T.contrast(dark['--on-panel'], dark['--panel']) >= 4.5);
check('primary .btn border (--control-border) >= 3 on the card it sits on', T.contrast(dark['--control-border'], dark['--card']) >= 3);
// Stitch status badges: solid-equivalent of the translucent fill over the card they sit on
const over = (fg, bg, a) => T.mix(bg, fg, a);
[['Live', '#22C55E', 0.15], ['Confirmed', '#10B981', 0.15], ['Pending', '#F59E0B', 0.15], ['Expired', '#94A3B8', 0.12], ['Error', '#FFB4AB', 0.15]].forEach(([n, fg, a]) => {
  check(`${n} badge text on its tint over the card >= 4.5`, T.contrast(fg, over(fg, dark['--card'], a)) >= 4.5, T.contrast(fg, over(fg, dark['--card'], a)).toFixed(2));
  check(`${n} badge text on its tint over the page bg >= 4.5`, T.contrast(fg, over(fg, dark['--cream'], a)) >= 4.5);
});
check('error chip: #FFB4AB on error-container #93000A >= 4.5', T.contrast('#FFB4AB', '#93000A') >= 4.5);
check('the Stitch-literal outline (#8B947D) is what we use, and the old rejected #6B635A would fail 3:1', dark['--control-border'] === '#8B947D' && T.contrast('#6B635A', dark['--card']) < 3);

section('queue.html wiring');
check('links theme.css in <head>, after the page style block', (() => { const a = queueHtml.indexOf('</style>'), b = queueHtml.indexOf('<link rel="stylesheet" href="theme.css"'); const head = queueHtml.indexOf('</head>'); return a > -1 && b > a && b < head; })());
check('exactly one theme-color meta, #FFFBF5', (queueHtml.match(/<meta name="theme-color"/g) || []).length === 1 && /<meta name="theme-color" content="#FFFBF5"\/>/.test(queueHtml));
check('inline bootstrap is byte-identical to the canonical snippet and sits in <head> after the meta', (() => {
  const tag = '<script>' + T.BOOTSTRAP + '</script>';
  const i = queueHtml.indexOf(tag), m = queueHtml.indexOf('<meta name="theme-color"'), h = queueHtml.indexOf('</head>');
  return i > m && m > -1 && i < h && queueHtml.split(tag).length === 2;
})());
check('bootstrap runs before the stylesheet link (no flash)', queueHtml.indexOf(T.BOOTSTRAP) < queueHtml.indexOf('href="theme.css"'));
check('loads theme.js before court-scoreboard.js and calls CBTheme.init()', queueHtml.indexOf('/theme.js') > -1 && queueHtml.indexOf('/theme.js') < queueHtml.indexOf('/court-scoreboard.js') && /CBTheme\.init\(\)/.test(queueHtml));
check('has the toggle: icon button, aria-label, aria-pressed, data attribute, before the switch link', (() => { const i = queueHtml.indexOf('data-cb-theme-toggle'); return i > -1 && i < queueHtml.indexOf('class="switch-btn"') && /aria-label="Dark mode"/.test(queueHtml) && /aria-pressed="false"/.test(queueHtml); })());
check("legacy light :root values are unchanged", queueHtml.includes(':root{--cream:#FFFBF5;--ink:#201C19;--lime:#D6FF5F;--line:#EAE0D5;--sand:#F1E9DF;--red:#B91C1C;--green:#15803D}'));
check('page-local dark values (--red / --green) live in a @media screen block', /@media screen\{\s*:root\[data-theme="dark"\]\{--red:#FFB4AB;--green:#5AEF82\}/.test(queueHtml));
const style = /<style>([\s\S]*?)<\/style>/.exec(queueHtml)[1];
const lightPart = style.split('/* ---- Dark mode')[0];
check('no raw #fff card/input backgrounds remain in the light CSS', !/background:#fff/.test(lightPart));
check('fills that used --ink now use --panel / --pill-on-* (so flipping --ink cannot break them)', !/background:var\(--ink\)/.test(lightPart) && !/border-color:var\(--ink\)/.test(lightPart));
check('lime button text comes from --on-lime (light #201C19, dark #0B1326); pressed pills use --lime-text', /\.btn\.lime\{[^}]*color:var\(--on-lime\)/.test(lightPart) && /\.badge\.on\{[^}]*color:var\(--lime-text\)/.test(lightPart) && /\.tab\.active\{[^}]*color:var\(--lime-text\)/.test(lightPart));
check('the winner-PDF print window is still its own light document', /<!doctype html><html><head><meta charset="utf-8">[\s\S]*?color:#201C19/.test(queueHtml) && !/data-theme/.test(queueHtml.slice(queueHtml.indexOf('win.document.write'), queueHtml.indexOf('win.document.close'))));
check('dark buttons get visible borders: primary .btn and .btn.ghost use --control-border', /\[data-theme="dark"\] \.btn:not\(\.lime\):not\(\.ghost\):not\(\.outline-red\)\{border-color:var\(--control-border\)\}/.test(style) && /\[data-theme="dark"\] \.btn\.ghost\{border-color:var\(--control-border\)\}/.test(style) && T.contrast(dark['--control-border'], dark['--card']) >= 3);
check('light .btn border is still --panel (#201C19), unchanged', /\.btn\{[^}]*border:1px solid var\(--panel\)/.test(lightPart) && light['--panel'] === '#201C19');
check('dark name-edit hover/focus restores the underline colour (same specificity as the dark base rule)', /\[data-theme="dark"\] \.name-edit:hover,:root\[data-theme="dark"\] \.name-edit:focus\{border-bottom-color:var\(--ink\)\}/.test(style));
check('toggle adds no topbar height (negative vertical margins) and keeps a 44px hit area (36px + 4px each side)', /\.topbar \.cb-theme-btn\{[^}]*margin-top:-7px[^}]*margin-bottom:-7px[^}]*width:36px/.test(style) && /\.topbar \.cb-theme-btn::after\{[^}]*left:-4px[^}]*right:-4px/.test(style));
check('narrow screens (<=430px) shorten the facilities link so the brand never wraps', /@media \(max-width:430px\)\{\.sw-long\{display:none\}\.sw-short\{display:inline\}\}/.test(style) && /<span class="sw-long">Browse f<\/span><span class="sw-short">F<\/span>acilities/.test(queueHtml));
check('every dark rule is inside @media screen', (() => { const d = style.slice(style.indexOf('/* ---- Dark mode')); return /^\/\* ---- Dark mode[^\n]*\n@media screen\{/.test(d) && !/@media print/.test(d); })());

section('scoreboard: fixed Stitch dark palette + fixed Stitch lime, tenant accent ignored');
const bcss = /const CSS = `([\s\S]*?)`;/.exec(board)[1];
['#0B1326', '#171F33', '#222A3D', '#8B947D', '#DAE2FD', '#C1CAB0', '#F3B562', 'rgba(11,19,38,.94)'].forEach((c) => check(`scoreboard uses ${c}`, bcss.includes(c)));
['#14110F', '#201C19', '#2B2622', '#7A7168', '#F4EEE6', '#A9A29A', '#8F887F', '#08111F', '#101D30', '#152740', '#27405E', '#F4E7D0', '#91A4B8', '#527089', 'rgba(8,17,31', 'rgba(20,17,15', '#D6FF5F'].forEach((c) => check(`old colour ${c} is gone`, !bcss.toUpperCase().includes(c.toUpperCase())));
check('scoreboard palette values equal the theme.css dark tokens', bcss.includes(dark['--cream']) && bcss.includes(dark['--card']) && bcss.includes(dark['--sand']) && bcss.includes(dark['--control-border']) && bcss.includes(dark['--ink']) && bcss.includes(dark['--muted']) && bcss.includes(dark['--lime-text']) && bcss.includes(dark['--lime']));
check('.rb-root fixes the accent vars to Stitch lime (accent #9EE939, fill #84CC16, on-accent #0B1326)', /\.rb-root\{--rb-accent:#9EE939;--rb-accent-fill:#84CC16;--rb-on-accent:#0B1326;/.test(bcss));
check('primary button text comes from --rb-on-accent', /\.rb-btn\.rb-primary\{[^}]*color:var\(--rb-on-accent/.test(bcss));
check('scoreboard text/hint pairs pass: hint #8B947D and accent #9EE939 on its surfaces, on-accent on the lime fill', T.contrast('#8B947D', '#171F33') >= 4.5 && T.contrast('#9EE939', '#171F33') >= 4.5 && T.contrast('#9EE939', '#0B1326') >= 4.5 && T.contrast('#0B1326', '#84CC16') >= 4.5 && T.contrast('#C1CAB0', '#171F33') >= 4.5 && T.contrast('#DAE2FD', '#222A3D') >= 4.5);
check('no tenant-accent handling remains: opts.accent / CBTheme are not consumed, nothing sets --rb-accent at runtime', !/opts\.accent\b[^\n]*(test|setProperty)/.test(board) && !/CBTheme|accentForSurface|fillWithText/.test(board) && !/setProperty\('--rb-/.test(board));
check('scoreboard has no dependency on theme.js or require()', !/require\(/.test(board));
// Behavioural: open the board with a navy tenant accent -> the root carries no inline accent override
(() => {
  const els = [];
  const mk = (tag) => { const e = { tag, children: [], style: { props: {}, setProperty(k, v) { this.props[k] = v; } }, className: '', attrs: {}, setAttribute(k, v) { this.attrs[k] = v; }, append(...c) { this.children.push(...c); }, appendChild(c) { this.children.push(c); return c; }, addEventListener() {}, classList: { add() {}, remove() {}, toggle() {} }, remove() {}, querySelector() { return null; }, querySelectorAll() { return []; }, focus() {}, textContent: '' }; els.push(e); return e; };
  const doc = { createElement: mk, head: mk('head'), body: mk('body'), getElementById: () => null, querySelector: () => null, addEventListener() {}, removeEventListener() {} };
  doc.body.style = {}; doc.createTextNode = (t) => ({ text: t }); doc.visibilityState = 'hidden';
  const win = { PickleScore: require('../pickleball-scoring.js'), CBTheme: T, addEventListener() {}, removeEventListener() {}, speechSynthesis: null, matchMedia: () => ({ matches: false }), innerWidth: 400, innerHeight: 800 };
  win.window = win;
  const ctx = vm.createContext(Object.assign({ document: doc, localStorage: { getItem: () => null, setItem() {}, removeItem() {} }, console, setTimeout, clearTimeout, navigator: {}, requestAnimationFrame: (f) => f() }, win, { window: win }));
  let ok = true, root = null;
  try { vm.runInContext(board, ctx); const B = win.CourtBoard || ctx.CourtBoard || ctx.window.CourtBoard; if (B) { B.open({ title: 't', names: { home: 'A', away: 'B' }, config: { target: 11, winBy: 2, scoring: 'sideout', bestOf: 1, doubles: true }, accent: '#1E3A8A' }); root = els.find((e) => e.className === 'rb-root'); } else ok = false; } catch (e) { ok = false; }
  check('opening the board with a navy tenant accent sets no inline --rb-accent / --rb-accent-fill / --rb-on-accent (stays Stitch lime)', ok && !!root && Object.keys(root.style.props).every((k) => !/^--rb-/.test(k)), ok ? '' : 'could not run board in vm');
})();

section('theme.js is only loaded where it is used (queue.html); the scoreboard no longer needs it');
check('queue.html loads theme.js and calls CBTheme.init()', /<script src="\/theme\.js"><\/script>/.test(queueHtml) && /CBTheme\.init\(\)/.test(queueHtml));
['index.html', 'tournament.html', 'tournament-admin.html'].forEach((f) => check(`${f}: no dead theme.js include and no CBTheme.init (stays light-only)`, !/theme\.js/.test(read(f)) && !/CBTheme/.test(read(f))));

section('Phase 0: theme-color and manifest');
['index.html', 'queue.html', 'picker.html', 'account.html', 'onboarding.html'].forEach((f) => check(`${f}: single theme-color #FFFBF5`, (read(f).match(/<meta name="theme-color"/g) || []).length === 1 && /<meta name="theme-color" content="#FFFBF5"\s*\/?>/.test(read(f))));
check('manifest theme_color #FFFBF5, background_color kept #201C19', manifest.theme_color === '#FFFBF5' && manifest.background_color === '#201C19');

section('service worker and hosting');
check('CACHE_NAME bumped to v35 or later', /const CACHE_NAME = 'courtbooking-v(3[5-9]|[4-9]\d)';/.test(sw));
check('APP_SHELL precaches theme.css and theme.js', /APP_SHELL = \[[^\]]*'\/theme\.css'[^\]]*\]/.test(sw) && /APP_SHELL = \[[^\]]*'\/theme\.js'[^\]]*\]/.test(sw));
const hdrs = fb.hosting.headers;
const themeHdr = hdrs.find((h) => /theme/.test(h.source));
check('firebase.json serves theme.{css,js} with no-cache', !!themeHdr && themeHdr.source === 'theme.{css,js}' && themeHdr.headers.some((x) => x.key === 'Cache-Control' && x.value === 'no-cache'));
check('theme.* is NOT in the immutable header blocks', hdrs.filter((h) => h.headers.some((x) => /immutable/.test(x.value))).every((h) => !/theme/.test(h.source)));
check('dark rules never added to the immutable-cached motion.css / tailwind.css', !/data-theme/.test(read('motion.css')) && !/data-theme/.test(read('tailwind.css')));

console.log(`\n=== THEME TOKENS: ${passed}/${passed + failed} passed ===`);
process.exit(failed === 0 ? 0 : 1);
