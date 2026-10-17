/* Phase 3c: dark-mode opacity floor for low-opacity TEXT tiers (opacity-30/40/45/50/55 -> 0.6).
   Classification lives in theme-tw-map.json ("opacityFloor"); scripts/gen-theme-tw.js emits the dark rules and
   fails when an opacity utility is not classified. Usage: node tests/theme-tw-opacity.test.js */
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');
const T = require('../theme.js');
const G = require('../scripts/gen-theme-tw.js');

let passed = 0, failed = 0;
function check(name, ok, detail) { if (ok) passed++; else { failed++; console.log(`  FAIL: ${name}${detail ? ' -- ' + detail : ''}`); } }
const section = (t) => console.log(`\n${t}`);
const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

const map = G.loadMap(), OF = map.opacityFloor;
const css = read('theme.css');
const block = G.currentBlock(css);
const dm = /@media screen\s*\{\s*:root\[data-theme="dark"\]\s*\{([^}]*)\}/.exec(css);
const dark = {};
dm[1].replace(/(--[\w-]+)\s*:\s*([^;]+);/g, (_, k, v) => { dark[k] = v.trim().replace(/\s*\/\*.*$/, ''); });
const SURF = { cream: dark['--cream'], card: dark['--card'], sand: dark['--sand'] };
const INK = dark['--ink'];

section('every opacity utility / inline opacity is classified');
const scan = G.opacityScan();
check('no unclassified opacity utility or uncovered inline opacity on the customer pages', scan.issues.length === 0, scan.issues.slice(0, 5).join(' | '));
const tiers = new Set(OF.tiers), pass = new Set(OF.pass);
const cat = {};
G.PAGES.forEach((p) => { cat[p] = { tier: 0, pass: 0, variant: 0, 'exempt-arbitrary': 0 }; });
scan.found.forEach((byPage, tok) => {
  const m = /^((?:[a-z0-9-]+:)*)opacity-(.+)$/.exec(tok);
  const k = m[1] ? 'variant' : tiers.has(m[2]) ? 'tier' : pass.has(m[2]) ? 'pass' : 'exempt-arbitrary';
  Object.keys(byPage).forEach((p) => { cat[p][k] += byPage[p]; });
});
console.log('  occurrences per page (tier = floor applies | pass = already >= 0.6 | variant = hover/disabled | exempt-arbitrary = decorative glow/watermark):');
G.PAGES.forEach((p) => console.log('   ' + p.padEnd(16) + JSON.stringify(cat[p])));
check('the floor equals the opacity-60 tier and every tier is below it', OF.floor === 0.6 && OF.tiers.every((t) => +t / 100 < OF.floor) && OF.pass.every((t) => +t / 100 >= OF.floor));
check('variant tokens (hover:/disabled:) are allow-listed with reasons; arbitrary opacities have reasons', Object.values(OF.variantAllow).concat(Object.values(OF.exemptArbitrary)).every((r) => r.length > 10));

section('derivation of the floor');
const need = (s) => { let a = 0.3; while (a < 1 && T.contrast(T.mix(s, INK, a), s) < 4.5) a += 0.005; return a; };
Object.entries(SURF).forEach(([n, s]) => check(`ink at 0.6 over ${n} >= 4.5 (minimum alpha ${need(s).toFixed(3)})`, T.contrast(T.mix(s, INK, OF.floor), s) >= 4.5 && need(s) <= OF.floor));
check('...and over --line (chips/track surfaces) too', T.contrast(T.mix(dark['--line'], INK, OF.floor), dark['--line']) >= 4.5);

section('generated rules (dark-scoped, !important, exemptions in the selector)');
const rules = block.split(/\r?\n/).filter((l) => /\.opacity-\d+/.test(l) || /:where\(\[style\*="opacity/.test(l));
check('one rule per tier (' + OF.tiers.length + ') plus one per inline key (' + Object.keys(OF.inline).length + ')', rules.length === OF.tiers.length + Object.keys(OF.inline).length, String(rules.length));
check('every opacity rule starts with :root[data-theme="dark"], is !important and sets opacity:.6', rules.every((l) => l.startsWith(':root[data-theme="dark"] ') && /\{opacity:\.6!important\}$/.test(l)));
const tierRules = rules.filter((l) => /\.opacity-\d+/.test(l));
check('every tier rule carries the exemptions: svg, img, canvas, i, .animate-pulse, :disabled, [aria-disabled="true"]', tierRules.every((l) => ['svg', 'img', 'canvas', 'i', '.animate-pulse', ':disabled', '[aria-disabled="true"]'].every((x) => l.includes(':not(' + x + ')'))));
check('no rule touches the passing tiers (60..100), hover:/disabled: variants or the arbitrary decorative opacities', !rules.some((l) => /opacity-(60|65|70|75|80|90|100)\b|hover\\:|disabled\\:|\\\[0/.test(l)));
check('inline rules use :where() so picker/queue/account\'s own (0,3,0) [style*="opacity:0.5"] rules still win on those pages', rules.filter((l) => /\[style\*=/.test(l)).every((l) => l.includes(':where(')));
check('all opacity rules are inside the single @media screen group of the generated block', block.indexOf('@media screen{') < block.indexOf(rules[0]) && !/@media print/.test(block));

check('the :where() inline rules have specificity (0,2,0) < the page-local (0,3,0) [style*="opacity:0.5"] dark rules of picker/queue/account, which therefore still win there', rules.filter((l) => l.includes(':where(')).every((l) => G.specificity(l.slice(0, l.indexOf('{'))).join() === '0,2,0') && read('queue.html').includes('[data-theme="dark"] [style*="opacity:0.5"]{opacity:1!important'));

section('static dark contrast of every text-only occurrence after the floor');
const re = /<([a-zA-Z][\w-]*)\b[^>]*?\bclass=(?:"([^"]*)"|'([^']*)')/g;
const rulesObj = G.buildRules(map).rules;
const rows = [];
G.PAGES.forEach((p) => {
  const t = read(p);
  let m;
  while ((m = re.exec(t))) {
    G.altSets(m[2] || m[3] || '').forEach((cs) => {
      const tier = cs.map((c) => /^opacity-(\d+)$/.exec(c)).filter(Boolean).map((x) => x[1]).find((n) => tiers.has(n));
      if (!tier) return;
      rows.push({ page: p, tag: m[1].toLowerCase(), classes: cs, tier, tagText: m[0] });
    });
  }
});
const kinds = { 'text-only': 0, mixed: 0, exempt: 0, disabled: 0 };
const mixedIds = [];
/* disabled elements are exempt (:disabled in the selector). Derived from the markup: a static `disabled` attribute, or a conditional
   ${...'disabled'...} attribute whose class branch also carries cursor-not-allowed (the disabled branch). */
const isDisabledEl = (r) => /sdisabled(?=[s>=])/.test(r.tagText.replace(/${[^}]*}/g, ' ')) || /aria-disabled="true"/.test(r.tagText) || (/['"`]disabled['"`]/.test(r.tagText) && r.classes.includes('cursor-not-allowed'));
const worst = [];
rows.forEach((r) => {
  if (OF.exemptTags.includes(r.tag) || r.classes.some((c) => OF.exemptClasses.includes(c))) { kinds.exempt++; return; }
  if (isDisabledEl(r)) { kinds.disabled++; return; }
  const bgTok = r.classes.map(G.parseToken).find((x) => x && x.kind === 'bg' && !x.variants.length);
  const fgv = G.resolveDark(rulesObj, r.classes, r.tag, 'base', 'color');
  const fg = fgv && /^var\(--ink\)$|^var\(--muted\)$/.test(fgv) ? dark[fgv.slice(4, -1)] : INK;
  const a = Math.max(+r.tier / 100, OF.floor);
  if (bgTok) {
    kinds.mixed++;
    mixedIds.push(r.page + ' ' + ((/id="([^"]+)"/.exec(r.tagText) || [])[1] || r.tag));
    const fillv = G.resolveDark(rulesObj, r.classes, r.tag, 'base', 'background-color');
    const fill = fillv && /^var\(/.test(fillv) ? dark[fillv.slice(4, -1)] : dark['--sand'];
    ['cream', 'card'].forEach((s) => {
      const bg = T.mix(SURF[s], fill, a), tx = T.mix(SURF[s], fg, a), c = T.contrast(tx, bg);
      worst.push([c, r.page + ' <' + r.tag + '> mixed fill over ' + s + ' ' + r.classes.join(' ')]);
    });
  } else {
    kinds['text-only']++;
    Object.entries(SURF).forEach(([s, sv]) => worst.push([T.contrast(T.mix(sv, fg, a), sv), r.page + ' <' + r.tag + '> over ' + s + ' ' + r.classes.join(' ')]));
  }
});
console.log(`  ${rows.length} class sets with a low tier: ${kinds['text-only']} text-only, ${kinds.mixed} mixed (own fill, floored), ${kinds.disabled} disabled-attribute elements (exempt via :disabled), ${kinds.exempt} exempt (tag/class)`);
check('derived from the markup: exactly 1 mixed element is floored (the #posterPreview "No poster" box) and exactly 2 mixed-looking buttons are disabled (index og-link picker, store out-of-stock product) and therefore exempt', kinds.mixed === 1 && mixedIds[0] === 'index.html posterPreview' && kinds.disabled === 2, JSON.stringify({ mixed: mixedIds, disabled: kinds.disabled }));
const bad = worst.filter(([c]) => c < 4.5);
check('every text-only / mixed occurrence is >= 4.5:1 over cream, card and sand once floored to 0.6 (min ' + Math.min.apply(null, worst.map((w) => w[0])).toFixed(2) + ')', bad.length === 0, bad.slice(0, 3).map((b) => b[0].toFixed(2) + ' ' + b[1]).join(' | '));
console.log('  MANUAL: nested opacity (a floored element inside another floored element) multiplies; the static check cannot see ancestors -- covered by the in-browser audit.');

section('alpha-text tokens (colour alpha, not opacity) mapped in 3a still read in dark');
[['text-[#201C19]/50', 'var(--muted)'], ['text-[#201C19]/60', 'var(--muted)'], ['text-[#201C19]/70', 'var(--muted)'], ['text-[#201C19]/80', 'var(--ink)']].forEach(([tok, v]) => {
  check(tok + ' -> ' + map.map[tok] + ' reads on cream/card/sand', map.map[tok] === v && Object.values(SURF).every((s) => T.contrast(dark[v.slice(4, -1)], s) >= 4.5));
});
const panel = dark['--panel'];
[['text-white/40', 0.6], ['text-white/60', 0.72], ['placeholder:text-white/40', 0.6]].forEach(([tok, a]) => check(tok + ' (white at ' + a + ') on --panel >= 4.5', /rgba\(255,255,255,\.\d+\)/.test(map.map[tok]) && T.contrast(T.mix(panel, '#FFFFFF', a), panel) >= 4.5));
check('text-white/50 (left as-is) on --panel >= 4.5', T.contrast(T.mix(panel, '#FFFFFF', 0.5), panel) >= 4.5);
check('text-white/80 (left as-is) on --panel >= 4.5', T.contrast(T.mix(panel, '#FFFFFF', 0.8), panel) >= 4.5);

section('hover/focus trap guard: a floored tier and a hover:/focus:/active: opacity variant must never share an element');
const scratch = (extra, file) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'thtw6-'));
  try {
    ['theme.css', 'theme-tw-map.json', 'tailwind.css'].concat(G.PAGES).forEach((f) => fs.copyFileSync(path.join(ROOT, f), path.join(dir, f)));
    fs.appendFileSync(path.join(dir, file || 'store.html'), '\n' + extra + '\n');
    const r = cp.spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'gen-theme-tw.js'), '--check'], { env: Object.assign({}, process.env, { THEME_TW_ROOT: dir }), encoding: 'utf8' });
    return r;
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
};
check('no customer page has a floored tier + hover/focus/active opacity variant on one element', G.PAGES.every((p) => G.floorTrapSets(read(p), OF.tiers).length === 0), G.PAGES.map((p) => G.floorTrapSets(read(p), OF.tiers).map((s) => p + ':' + s.line)).flat().join(' '));
const negSets = G.PAGES.reduce((n, p) => n + (read(p).match(/class="[^"]*\bopacity-(?:60|65|70|75|80)\b[^"]*\bhover:opacity-(?:100|90)\b[^"]*"/g) || []).length, 0);
check('negative case is real: ' + negSets + ' elements today combine a PASSING tier (opacity-60..80) with hover:opacity-100/90 and are allowed', negSets > 0);
check('unit: opacity-50 + hover:opacity-100 flagged; opacity-70 + hover:opacity-100 allowed; opacity-40 + group-hover: flagged; opacity-50 + disabled:opacity-40 allowed (disabled is exempt from the floor)', [G.floorTrapSets('<div class="opacity-50 hover:opacity-100">', OF.tiers).length > 0, G.floorTrapSets('<div class="opacity-70 hover:opacity-100">', OF.tiers).length === 0, G.floorTrapSets("c='opacity-40 group-hover:opacity-100'", OF.tiers).length > 0, G.floorTrapSets('<div class="opacity-50 disabled:opacity-40">', OF.tiers).length === 0, G.floorTrapSets('<div class="opacity-45 focus:opacity-100 md:hover:opacity-90">', OF.tiers).length > 0].every(Boolean));
let r1 = scratch('<div class="opacity-50 hover:opacity-100">x</div>');
check('scratch copy: class="opacity-50 hover:opacity-100" makes --check exit 2 and names the element', r1.status === 2 && /floored tier \+ hover/.test(r1.stdout), 'status ' + r1.status + ' ' + r1.stdout.slice(0, 160));
r1 = scratch('<div class="opacity-70 hover:opacity-100">x</div>');
check('scratch copy: class="opacity-70 hover:opacity-100" is fine (exit 0)', r1.status === 0, 'status ' + r1.status + ' ' + r1.stdout.slice(0, 160));
r1 = scratch("<script>const c = 'opacity-30 hover:opacity-100';</script>");
check('scratch copy: the same pair inside a JS string literal is caught too (exit 2)', r1.status === 2);

section('inline opacity: the generator scan and the CSS attribute selectors must agree exactly');
const lit = (s) => G.inlineOpacityLiterals('<div style="' + s + '">', OF);
check('forms the selectors cannot match are reported uncovered: "opacity: 0.5" (space), "opacity:.5" (no leading zero), "opacity:50%"', ['opacity: 0.5', 'opacity:.5', 'opacity:50%', 'opacity: .4', 'opacity:40%'].every((s) => lit(s).length === 1 && !lit(s)[0].covered), JSON.stringify(['opacity: 0.5', 'opacity:.5', 'opacity:50%'].map((s) => lit(s).map((l) => l.form))));
check('"opacity:0.5" and "opacity:0.4" are covered; so are the INTENTIONAL substring supersets 0.55 (lifted by the 0.5 rule) and 0.45 (lifted by the 0.4 rule); 0.35 is not; 0.7 is above the floor', lit('opacity:0.5')[0].covered && lit('opacity:0.4')[0].covered && lit('opacity:0.55')[0].covered && lit('opacity:0.45')[0].covered && !lit('opacity:0.35')[0].covered && lit('opacity:0.7').length === 0);
const attrKeys = []; css.replace(/:where\(\[style\*="(opacity:[^"]*)"\]\)/g, (_, k) => { attrKeys.push(k); return ''; });
let nLits = 0, agree = true, why = '';
G.PAGES.forEach((p) => G.inlineOpacityLiterals(read(p), OF).forEach((l) => { nLits++; const hasRule = attrKeys.some((k) => l.key.startsWith(k)) && l.form === 'ok'; if (!hasRule) { agree = false; why += p + ' ' + l.raw + '; '; } }));
check('every below-floor inline opacity the generator finds (' + nLits + ') is matched by a dark attribute rule in theme.css (generator and CSS agree)', nLits > 0 && agree, why);
check('the CSS has exactly the rules the map declares (' + attrKeys.join(', ') + ')', JSON.stringify(attrKeys.sort()) === JSON.stringify(Object.keys(OF.inline).sort()));
r1 = scratch('<div style="opacity: 0.5">x</div>');
check('scratch copy: style="opacity: 0.5" (space) -> exit 2', r1.status === 2 && /inline opacity/.test(r1.stdout));
r1 = scratch('<div style="opacity:.5">x</div>');
check('scratch copy: style="opacity:.5" (no leading zero) -> exit 2', r1.status === 2);
r1 = scratch('<div style="opacity:50%">x</div>');
check('scratch copy: style="opacity:50%" -> exit 2', r1.status === 2);
r1 = scratch('<div style="opacity:0.5">x</div>');
check('scratch copy: style="opacity:0.5" (the supported form) -> exit 0', r1.status === 0, r1.stdout.slice(0, 120));
r1 = scratch('<svg><rect style="fill-opacity:0.3"/></svg>');
check('scratch copy: an inline fill-opacity below the floor (contains the substring the rules match) -> exit 2', r1.status === 2 && /fill-opacity/.test(r1.stdout));
r1 = scratch('<svg><stop stop-opacity="0.2"/></svg>');
check('scratch copy: stop-opacity="0.2" -> exit 2', r1.status === 2);
r1 = scratch('<svg><rect style="fill-opacity:0.8"/></svg>');
check('scratch copy: fill-opacity above the floor is fine (exit 0)', r1.status === 0);
check('no customer page uses fill-/stroke-/stop-opacity below the floor today', G.opacityScan().issues.filter((i) => /-opacity/.test(i)).length === 0);

section('page-local <style> opacity in queue / picker / account / onboarding (Phase 2 pages)');
const PL = { 'queue.html': { exempt: ['.rank-item button:disabled', '.btn:disabled'] }, 'picker.html': { exempt: ['.hero::before', '.rise', '.install-bar'] }, 'account.html': { exempt: ['.btn-danger:disabled'] }, 'onboarding.html': { exempt: ['.btn-dark:disabled'] } };
Object.keys(PL).forEach((pg) => {
  const t = read(pg).replace(/\r\n/g, '\n');
  const st = (/<style>([\s\S]*?)<\/style>/.exec(t) || [, ''])[1].replace(/\/\*[\s\S]*?\*\//g, '').replace(/@keyframes[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, '');
  const rulesL = [];
  let m;
  const rr = /(?:@media[^{]*\{\s*)?([^{}@]+)\{([^{}]*)\}/g;
  while ((m = rr.exec(st))) rulesL.push([m[1].trim(), m[2]]);
  const emptySel = rulesL.filter(([sel]) => sel.split(',').some((s) => s.trim() === '')).map(([sel]) => sel.slice(-60));
  check(pg + ': no selector list in the page <style> has an empty selector (a trailing comma silently DROPS the whole rule -- queue.html lost its dark opacity lifts this way)', emptySel.length === 0, emptySel.join(' | '));
  const darkSel = new Set();
  rulesL.filter(([sel]) => sel.startsWith(':root[data-theme="dark"]')).forEach(([sel, body]) => { if (/opacity\s*:\s*1\b/.test(body) || /opacity\s*:\s*\.?[0-9.]+/.test(body)) sel.split(',').forEach((s) => darkSel.add(s.trim())); });
  const missing = [];
  rulesL.filter(([sel, body]) => !sel.startsWith(':root') && /(?:^|;)\s*opacity\s*:\s*\.?[0-9.]+/.test(body) && parseFloat(/(?:^|;)\s*opacity\s*:\s*(\.?[0-9.]+)/.exec(body)[1]) < 0.6).forEach(([sel]) => sel.split(',').forEach((s) => { s = s.trim(); if (!PL[pg].exempt.includes(s) && !darkSel.has(':root[data-theme="dark"] ' + s)) missing.push(s); }));
  check(pg + ': every page-local rule with opacity < 0.6 has a dark override (exempt: ' + PL[pg].exempt.join(', ') + ' = disabled / decorative / animation start state)', missing.length === 0, missing.join(' '));
});

check('mutation: the empty-selector detector flags the exact queue.html bug shape (a trailing comma right before the brace)', (() => { const m2 = /([^{}@]+){([^{}]*)}/g.exec(':root[data-theme="dark"] .a,:root[data-theme="dark"] .b,{opacity:1}'); return m2[1].split(',').some((x) => x.trim() === ''); })());

section('mutations');
check('a floor of 0.5 would NOT be enough on --sand (the derivation bites)', T.contrast(T.mix(SURF.sand, INK, 0.5), SURF.sand) < 4.5);
check('an unclassified opacity utility (opacity-35) fails the generator --check (exit 2) in a scratch copy', (() => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'thtw3-'));
  try {
    ['theme.css', 'theme-tw-map.json', 'tailwind.css'].concat(G.PAGES).forEach((f) => fs.copyFileSync(path.join(ROOT, f), path.join(dir, f)));
    fs.appendFileSync(path.join(dir, 'store.html'), '\n<div class="opacity-35">x</div>\n');
    const r = cp.spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'gen-theme-tw.js'), '--check'], { env: Object.assign({}, process.env, { THEME_TW_ROOT: dir }), encoding: 'utf8' });
    return r.status === 2 && /opacity-35/.test(r.stdout);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
})());
check('an uncovered inline opacity (style="opacity:0.35") fails --check too', (() => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'thtw4-'));
  try {
    ['theme.css', 'theme-tw-map.json', 'tailwind.css'].concat(G.PAGES).forEach((f) => fs.copyFileSync(path.join(ROOT, f), path.join(dir, f)));
    fs.appendFileSync(path.join(dir, 'store.html'), '\n<div style="opacity:0.35">x</div>\n');
    const r = cp.spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'gen-theme-tw.js'), '--check'], { env: Object.assign({}, process.env, { THEME_TW_ROOT: dir }), encoding: 'utf8' });
    return r.status === 2 && /inline opacity/.test(r.stdout);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
})());
check('removing the floor rule from theme.css makes --check report the block STALE (exit 1)', (() => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'thtw5-'));
  try {
    ['theme.css', 'theme-tw-map.json', 'tailwind.css'].concat(G.PAGES).forEach((f) => fs.copyFileSync(path.join(ROOT, f), path.join(dir, f)));
    const c = fs.readFileSync(path.join(dir, 'theme.css'), 'utf8').split('\n').filter((l) => !/\.opacity-50:not/.test(l)).join('\n');
    fs.writeFileSync(path.join(dir, 'theme.css'), c);
    const r = cp.spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'gen-theme-tw.js'), '--check'], { env: Object.assign({}, process.env, { THEME_TW_ROOT: dir }), encoding: 'utf8' });
    return r.status === 1;
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
})());

console.log(`\ntheme-tw-opacity: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
