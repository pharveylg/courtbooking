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
// Phase 3a wired store/tournament/gallery/billing, 3b wired index and 3d wired tournament-admin (see tests/theme-tw-wiring.test.js, which asserts the wiring of each). The old "stays light-only" assertion for tournament-admin is therefore removed; superadmin.html (out of scope) is asserted unwired there.

section('Phase 0: theme-color and manifest');
['index.html', 'queue.html', 'picker.html', 'account.html', 'onboarding.html'].forEach((f) => check(`${f}: single theme-color #FFFBF5`, (read(f).match(/<meta name="theme-color"/g) || []).length === 1 && /<meta name="theme-color" content="#FFFBF5"\s*\/?>/.test(read(f))));
check('manifest theme_color #FFFBF5, background_color kept #201C19', manifest.theme_color === '#FFFBF5' && manifest.background_color === '#201C19');

check('queue.html: the dark inline-opacity override uses !important (inline style="opacity:0.5" beats a normal rule)', /\[data-theme="dark"\] \[style\*="opacity:0\.5"\]\{opacity:1!important;color:var\(--muted\)\}/.test(queueHtml));
section('Phase 2: picker / account / onboarding wiring (same bootstrap, one theme-color, theme.css after the page style block)');
const P2 = ['picker.html', 'account.html', 'onboarding.html'];
const ALL4 = ['queue.html'].concat(P2);
const BOOT_TAG = '<script>' + T.BOOTSTRAP + '</script>';
ALL4.forEach((f) => {
  const h = read(f), headEnd = h.indexOf('</head>');
  check(f + ': exactly one theme-color meta (#FFFBF5) for the bootstrap to rewrite', (h.match(/<meta name="theme-color"/g) || []).length === 1 && /<meta name="theme-color" content="#FFFBF5"\s*\/?>/.test(h));
  check(f + ': bootstrap snippet is byte-identical to theme.js BOOTSTRAP, once, in <head>, after the meta', h.split(BOOT_TAG).length === 2 && h.indexOf(BOOT_TAG) > h.indexOf('<meta name="theme-color"') && h.indexOf(BOOT_TAG) < headEnd);
  check(f + ': theme.css is linked in <head> after the page style block (so tokens win nothing they should not)', h.indexOf('<link rel="stylesheet" href="theme.css"') > h.indexOf('</style>') && h.indexOf('<link rel="stylesheet" href="theme.css"') < headEnd);
  check(f + ': the bootstrap runs before the stylesheet (no flash)', h.indexOf(BOOT_TAG) < h.indexOf('href="theme.css"'));
});
P2.forEach((f) => {
  const h = read(f);
  const tIdx = h.indexOf('<script src="/theme.js"></script>'), aIdx = h.indexOf('<script src="/my-auth.js"></script>'), initIdx = h.indexOf('<script>CBTheme.init();</script>');
  check(f + ': loads theme.js right after my-auth.js and calls CBTheme.init() before the page script runs MyAuth.init()', aIdx > -1 && tIdx > aIdx && initIdx > tIdx && initIdx < h.indexOf('MyAuth.init()'));
  check(f + ': my-auth.js has no hard dependency on theme.js (and theme.js is feature-detecting MyAuth)', !/CBTheme/.test(read('my-auth.js')) && !/require\(/.test(read('my-auth.js').replace(/module\.exports/g, '')) && /typeof MyAuth !== 'undefined'/.test(read('theme.js')));
});
check('queue.html stays Firebase-free: no my-auth.js, no firebase scripts, no MyAuth reference', !/my-auth\.js|firebasejs|MyAuth/.test(queueHtml));

section('Phase 2: light :root values equal the literals at HEAD (light mode is visually identical)');
const LIGHT_ROOT = {
  'picker.html': ':root{--cream:#FFFBF5;--ink:#201C19;--lime:#D6FF5F;--line:#EAE0D5;--sand:#F1E9DF}',
  'account.html': ':root{--cream:#FFFBF5;--ink:#201C19;--lime:#D6FF5F;--line:#EAE0D5;--sand:#F1E9DF;--amber:#FFF0D6;--amber-ink:#92400E;--green:#E8F5D8;--green-ink:#3F7019}',
  'onboarding.html': ':root{--cream:#FFFBF5;--ink:#201C19;--lime:#D6FF5F;--line:#EAE0D5;--sand:#F1E9DF;--amber:#FFF0D6;--amber-ink:#92400E;--green:#E8F5D8;--green-ink:#3F7019;--red:#FFE9E0;--red-ink:#8C2C10}',
};
P2.forEach((f) => check(f + ': light :root unchanged', read(f).replace(/\r\n/g, '\n').includes('\n' + LIGHT_ROOT[f] + '\n')));
check('the light token values the pages now read (--panel / --on-panel / --lime-text / --on-lime / --control-border / --placeholder / --danger-text / --card) equal the old literals', light['--panel'] === '#201C19' && light['--on-panel'] === '#FFFBF5' && light['--lime-text'] === '#D6FF5F' && light['--on-lime'] === '#201C19' && light['--control-border'] === '#EAE0D5' && light['--placeholder'] === 'rgba(32,28,25,.4)' && light['--danger-text'] === '#8C2C10' && light['--card'] === '#FFFFFF');

section('Phase 2: page CSS is tokenized (no flip-unsafe fills left)');
function pageCss(f) { return /<style>([\s\S]*?)<\/style>/.exec(read(f).replace(/\r\n/g, '\n'))[1]; }
function lightRules(css) { // rules outside @media blocks and comments
  const c = css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/@media[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, '');
  const out = []; c.replace(/([^{}]+)\{([^{}]*)\}/g, (_, sel, body) => { out.push([sel.trim(), body]); });
  return out;
}
const ALLOW_FILL = { // selector -> why a literal white / ink-alpha background is still right
  'picker.html': { '.continue-action:hover': 'white hover on the fixed lime card', '.continue-action': 'translucent white on the fixed lime card', '.mymatches-dot': 'status dot (dark override exists)', '.hero-badge': 'translucent white on the panel', '.feature-pill': 'translucent white on the panel', '.install-dismiss': 'translucent white on the panel', '.install-dismiss:hover': 'translucent white on the panel' },
  'account.html': {}, 'onboarding.html': {},
};
P2.forEach((f) => {
  const rules = lightRules(pageCss(f));
  const bad = rules.filter(([sel, body]) => /background(?:-color)?:\s*(#fff\b|#FFF\b|#ffffff|rgba\(32,28,25|rgba\(255,255,255)/i.test(body) && !(sel in ALLOW_FILL[f])).map((r) => r[0]);
  check(f + ': no bare #fff / ink-alpha background left outside the allow-list', bad.length === 0, bad.join(' | '));
  const inkFill = rules.filter(([, body]) => /background:\s*var\(--ink\)/.test(body)).map((r) => r[0]);
  check(f + ': no fill still uses var(--ink) (it flips to light text colour in dark)', inkFill.length === 0, inkFill.join(' | '));
  const bareLime = rules.filter(([, body]) => /(^|;)\s*color:\s*var\(--lime\)/.test(body)).map((r) => r[0]);
  check(f + ': lime text uses --lime-text (the fill lime is darker in dark)', bareLime.length === 0, bareLime.join(' | '));
});
check('picker: continue card/actions use fixed lime fill with --on-lime text; install button too', /\.continue\{[^}]*background:var\(--lime\);color:var\(--on-lime\)/.test(pageCss('picker.html')) && /\.continue-action\{[^}]*color:var\(--on-lime\)/.test(pageCss('picker.html')) && /\.install-btn\{[^}]*background:var\(--lime\);color:var\(--on-lime\)/.test(pageCss('picker.html')));
check('picker: hero/footer/install/retry/mark/avatar use --panel + --on-panel / --lime-text', /\.hero\{[^}]*background:var\(--panel\);color:var\(--on-panel\)/.test(pageCss('picker.html')) && /\.foot\{background:var\(--panel\);color:var\(--on-panel\)/.test(pageCss('picker.html')) && /\.install-bar\{[^}]*background:var\(--panel\);color:var\(--on-panel\)/.test(pageCss('picker.html')) && /\.retry-btn\{[^}]*background:var\(--panel\);color:var\(--on-panel\)/.test(pageCss('picker.html')) && /\.mark\{[^}]*background:var\(--panel\);color:var\(--lime-text\)/.test(pageCss('picker.html')) && /\.acct-avatar\{[^}]*background:var\(--panel\);color:var\(--lime-text\)/.test(pageCss('picker.html')));
check('picker: inputs/chip borders use --control-border; placeholders use --placeholder', /\.search-input\{[^}]*border:1px solid var\(--control-border\)/.test(pageCss('picker.html')) && /\.acct-chip\{[^}]*border:1px solid var\(--control-border\)/.test(pageCss('picker.html')) && /\.search-input::placeholder\{color:var\(--placeholder\)\}/.test(pageCss('picker.html')) && /\.search-icon\{[^}]*color:var\(--placeholder\)/.test(pageCss('picker.html')));
check('picker: the mymatches-note light colour is untouched (tests/my-matches.test.js pins it); dark overrides it separately', /\.mymatches-note\{[^}]*color:rgba\(32,28,25,0\.4\)/.test(pageCss('picker.html')) && /\[data-theme="dark"\][^{]*\.mymatches-note[^{]*\{opacity:1;color:var\(--muted\)\}/.test(pageCss('picker.html')));
check('account: danger text + button use --danger-text; dark button is error-container with #FFB4AB text', /\.delete-title\{[^}]*color:var\(--danger-text\)/.test(pageCss('account.html')) && /\.btn-danger\{[^}]*background:var\(--danger-text\);color:#fff/.test(pageCss('account.html')) && /\[data-theme="dark"\] \.btn-danger\{background:#93000A;color:var\(--danger-text\)/.test(pageCss('account.html')));
check('account/onboarding: .btn-dark uses --panel/--on-panel; .card/.btn-google/inputs use --card + --control-border', P2.slice(1).every((f) => /\.btn-dark\{[^}]*background:var\(--panel\);color:var\(--on-panel\)/.test(pageCss(f)) && /\.card\{background:var\(--card\)/.test(pageCss(f)) && /\.btn-google\{[^}]*background:var\(--card\);border:1px solid var\(--control-border\)/.test(pageCss(f))));
check('account: tabs, Appearance control and badges are tokenized', /\.badge-dark\{background:var\(--panel\);color:#fff\}/.test(pageCss('account.html')) && /\.seg-opt\[aria-checked="true"\]\{[^}]*background:var\(--pill-on-bg\);color:var\(--lime-text\)/.test(pageCss('account.html')));

section('Phase 2: page-local dark values and every new pair they create');
function darkVars(f) { const m = /@media screen\{\s*:root\[data-theme="dark"\]\{([^}]*)\}/.exec(pageCss(f)); return decls(m ? m[1] + ';' : ''); }
const dAcc = darkVars('account.html'), dOnb = darkVars('onboarding.html');
check('account dark chip vars defined (--amber/-ink, --green/-ink)', ['--amber', '--amber-ink', '--green', '--green-ink'].every((k) => dAcc[k]));
check('onboarding dark chip vars defined (--amber, --green, --red and their inks)', ['--amber', '--amber-ink', '--green', '--green-ink', '--red', '--red-ink'].every((k) => dOnb[k]));
check('picker needs no page-local dark values (its only vars are the shared names)', !/\[data-theme="dark"\]\{--/.test(pageCss('picker.html')));
[['account', dAcc], ['onboarding', dOnb]].forEach(([n, v]) => {
  [['green', '--green', '--green-ink'], ['amber', '--amber', '--amber-ink']].concat(n === 'onboarding' ? [['red', '--red', '--red-ink']] : []).forEach(([c, bgk, fgk]) => {
    check(n + ' ' + c + ' chip text on its fill >= 4.5', T.contrast(v[fgk], v[bgk]) >= 4.5, T.contrast(v[fgk], v[bgk]).toFixed(2));
    check(n + ' ' + c + ' text on the card and on the page bg >= 4.5 (messages sit on either)', T.contrast(v[fgk], dark['--card']) >= 4.5 && T.contrast(v[fgk], dark['--cream']) >= 4.5);
    check(n + ' ' + c + ' fill is the Stitch tint over the card (15%)', v[bgk].toUpperCase() === T.mix(dark['--card'], { green: '#22C55E', amber: '#F59E0B', red: '#FFB4AB' }[c], 0.15), v[bgk]);
  });
});
check('account/onboarding green + amber inks are the Stitch badge colours (#22C55E / #F59E0B); red ink is the error colour', dAcc['--green-ink'] === '#22C55E' && dAcc['--amber-ink'] === '#F59E0B' && dOnb['--red-ink'] === '#FFB4AB' && dOnb['--green-ink'] === dAcc['--green-ink']);
const P = (n, a, b, min) => check(n + ' >= ' + (min || 4.5), T.contrast(a, b) >= (min || 4.5), T.contrast(a, b).toFixed(2));
const D = dark, panel = D['--panel'], lime = D['--lime'], onLime = D['--on-lime'];
const comp = (fg, a, under) => T.mix(under, fg, a);
P('mark / avatar / hero accent: --lime-text on --panel', D['--lime-text'], panel);
P('footer/hero/install text: --on-panel on --panel', D['--on-panel'], panel);
P('muted on panel (footer small print, install sub-line)', D['--muted'], panel);
P('continue card / install button / letter logo: --on-lime on --lime', onLime, lime);
P('continue-meta (opacity .72) on lime', comp(onLime, 0.72, lime), lime);
P('continue-next.wait (dark opacity .8) on lime', comp(onLime, 0.8, lime), lime);
P('continue-action text on its white .55 tint over lime', onLime, comp('#FFFFFF', 0.55, lime));
P('hero-badge text on its translucent tint', D['--on-panel'], comp('#FFFFFF', 0.09, panel));
P('feature-pill text (rgba(255,251,245,.78)) on its tint', comp('#FFFBF5', 0.78, comp('#FFFFFF', 0.07, panel)), comp('#FFFFFF', 0.07, panel));
P('install-dismiss text (.6) on its tint, and its hover on-panel text', comp('#FFFBF5', 0.6, comp('#FFFFFF', 0.1, panel)), comp('#FFFFFF', 0.1, panel));
P('install-dismiss:hover --on-panel on its brighter tint', D['--on-panel'], comp('#FFFFFF', 0.2, panel));
P('footer credit link #D6FF5F on panel', '#D6FF5F', panel);
P('footer credit text #FFFBF5 on its tint', '#FFFBF5', comp('#FFFFFF', 0.07, panel));
P('badge-dark #fff on panel; badge-muted --muted on --sand', '#FFFFFF', panel); P('badge-muted --muted on --sand', D['--muted'], D['--sand']);
P('btn-danger: #FFB4AB on error-container #93000A', '#FFB4AB', '#93000A');
P('delete-title: --danger-text on the card', D['--danger-text'], D['--card']);
P('Appearance: selected --lime-text on --pill-on-bg', D['--lime-text'], D['--pill-on-bg']); P('Appearance: unselected --ink on --card', D['--ink'], D['--card']);
P('Appearance: selected ring (--pill-on-border) on the card, non-text', D['--pill-on-border'], D['--card'], 3);
P('tabs: muted on the page bg; active ink on the page bg', D['--muted'], D['--cream']);
P('chk.pending: --muted on --sand', D['--muted'], D['--sand']);
P('search/inputs/chip border --control-border on the card (non-text)', D['--control-border'], D['--card'], 3);
P('btn inset ring --control-border on the page bg (non-text)', D['--control-border'], D['--cream'], 3);
P('placeholder on the card', D['--placeholder'], D['--card']);
P('mymatches-dot (--control-border) on the card (non-text)', D['--control-border'], D['--card'], 3);
check('dark overrides for low-opacity text tiers exist on all three pages (full opacity, --muted)', P2.every((f) => /\[data-theme="dark"\][^{}]*\{opacity:1;color:var\(--muted\)\}/.test(pageCss(f))));
check('no tenant colour ever feeds these pages: no tenant/branding colour variables in picker/account/onboarding CSS', P2.every((f) => !/--(primary|brand|tenant|accent)/i.test(pageCss(f))));
check('every page dark rule is inside @media screen (print stays light)', P2.every((f) => { const c = pageCss(f); const i = c.indexOf('@media screen{'); return i > -1 && !/\[data-theme="dark"\]/.test(c.slice(0, i).replace(/\/\*[\s\S]*?\*\//g, '')); }));

section('Phase 2: forced-white wells for logos');
check('picker: image logos get cb-force-light; white in dark, today\'s lime/panel backdrop in light', /logo\$\{t\.logoUrl \? ' cb-force-light' : ''\}/.test(read('picker.html')) && /\.logo\.cb-force-light\{background:var\(--lime\)\}/.test(pageCss('picker.html')) && /\.continue \.logo\.cb-force-light\{background:var\(--panel\)\}/.test(pageCss('picker.html')) && /\[data-theme="dark"\] \.logo\.cb-force-light,:root\[data-theme="dark"\] \.continue \.logo\.cb-force-light\{background:#fff\}/.test(pageCss('picker.html')));
check('account: image logos get cb-force-light; white in dark, --sand in light', /logo\$\{facility\.logoUrl \? ' cb-force-light' : ''\}/.test(read('account.html')) && /\.logo\.cb-force-light\{background:var\(--sand\)\}/.test(pageCss('account.html')) && /\[data-theme="dark"\] \.logo\.cb-force-light\{background:#fff\}/.test(pageCss('account.html')));
check('letter-fallback logos stay lime with --on-lime text (no cb-force-light on them)', /\.logo\{[^}]*background:var\(--lime\);color:var\(--on-lime\)/.test(pageCss('picker.html')) && !/'\+? ?esc\(\(facility\.name[^]*cb-force-light/.test(read('account.html')));

section('Phase 2: theme toggle on picker and onboarding (no extra height, 44px hit area, same markup as queue.html)');
['picker.html', 'onboarding.html'].forEach((f) => {
  const h = read(f), css = pageCss(f);
  check(f + ': icon toggle with data-cb-theme-toggle, aria-label, aria-pressed, moon + sun svgs', /<button type="button" class="cb-theme-btn" data-cb-theme-toggle aria-label="Dark mode" aria-pressed="false" title="Dark mode">/.test(h) && h.includes('cb-ico-moon') && h.includes('cb-ico-sun'));
  check(f + ': adds no topbar height (negative vertical margins) and keeps a 44px target (36px + 4px each side)', /\.topbar \.cb-theme-btn\{[^}]*margin-top:-7px[^}]*margin-bottom:-7px[^}]*width:36px/.test(css) && /\.topbar \.cb-theme-btn::after\{[^}]*left:-4px[^}]*right:-4px/.test(css));
});
check('picker: toggle sits before the account chip and the chip no longer pushes right (margin-left:0 after the toggle)', read('picker.html').indexOf('data-cb-theme-toggle') < read('picker.html').indexOf('id="acctChip"') && /\.cb-theme-btn \+ \.acct-chip\{margin-left:0\}/.test(pageCss('picker.html')));
check('account: NO topbar toggle (it makes the brand sub-line wrap at 390px); the Appearance control is the canonical control', !/data-cb-theme-toggle/.test(read('account.html')) && /id="appearance"/.test(read('account.html')));

section('service worker and hosting');
check('CACHE_NAME bumped to v36 or later (theme.js / pages changed in Phase 2)', /const CACHE_NAME = 'courtbooking-v(3[6-9]|[4-9]\d)';/.test(sw));
check('APP_SHELL precaches theme.css and theme.js', /APP_SHELL = \[[^\]]*'\/theme\.css'[^\]]*\]/.test(sw) && /APP_SHELL = \[[^\]]*'\/theme\.js'[^\]]*\]/.test(sw));
const hdrs = fb.hosting.headers;
const themeHdr = hdrs.find((h) => /theme/.test(h.source));
check('firebase.json serves theme.{css,js} with no-cache', !!themeHdr && themeHdr.source === 'theme.{css,js}' && themeHdr.headers.some((x) => x.key === 'Cache-Control' && x.value === 'no-cache'));
check('theme.* is NOT in the immutable header blocks', hdrs.filter((h) => h.headers.some((x) => /immutable/.test(x.value))).every((h) => !/theme/.test(h.source)));
check('dark rules never added to the immutable-cached motion.css / tailwind.css', !/data-theme/.test(read('motion.css')) && !/data-theme/.test(read('tailwind.css')));

console.log(`\n=== THEME TOKENS: ${passed}/${passed + failed} passed ===`);
process.exit(failed === 0 ? 0 : 1);
