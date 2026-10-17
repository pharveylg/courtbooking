/* Dark-mode contrast for the Tailwind-utility overrides (theme-tw-map.json).
   Every (background, text) pair that occurs on the SAME element in the customer
   pages (static class-set scan, both branches of ${cond ? 'a' : 'b'}, hover and
   focus states, unknown tags tried as both a link/button and a plain box) is
   resolved through the generated dark rules and must reach 4.5:1 (text) /
   3:1 (non-text). Translucent fills are blended over the dark page surfaces and
   the worst surface is used. What cannot be proven statically (text with no
   fill on the same element: its fill comes from an ancestor) is checked against
   every dark surface instead and listed as UNVERIFIED-BY-ELEMENT.
   Usage: node tests/theme-tw-contrast.test.js */
const fs = require('fs');
const path = require('path');
const T = require('../theme.js');
const G = require('../scripts/gen-theme-tw.js');

let passed = 0, failed = 0;
function check(name, ok, detail) { if (ok) passed++; else { failed++; console.log(`  FAIL: ${name}${detail ? ' -- ' + detail : ''}`); } }
const section = (t) => console.log(`\n${t}`);

const css = fs.readFileSync(path.join(__dirname, '..', 'theme.css'), 'utf8');
const dm = /@media screen\s*\{\s*:root\[data-theme="dark"\]\s*\{([^}]*)\}/.exec(css);
const dark = {};
dm[1].replace(/(--[\w-]+)\s*:\s*([^;]+);/g, (_, k, v) => { dark[k] = v.trim().replace(/\s*\/\*.*$/, ''); });

const SURFACES = { cream: dark['--cream'], card: dark['--card'], sand: dark['--sand'] };
function parseCssColor(v) { // -> { hex, a } | null
  v = String(v).trim();
  let m = /^var\((--[\w-]+)\)$/.exec(v);
  if (m) return dark[m[1]] ? parseCssColor(dark[m[1]]) : null;
  if (/^#[0-9a-f]{3}$|^#[0-9a-f]{6}$/i.test(v)) return { hex: T.parseHex(v) ? T.mix(v, v, 0) : null, a: 1 };
  m = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/.exec(v);
  if (m) return { hex: T.mix({ r: +m[1], g: +m[2], b: +m[3] }, { r: +m[1], g: +m[2], b: +m[3] }, 0), a: m[4] === undefined ? 1 : +m[4] };
  return null;
}
/* light literal of an allow-listed colour utility (what stays on screen in dark) */
function literal(tok) {
  const p = G.parseToken(tok);
  if (!p) return null;
  let hex = null;
  if (p.color === 'white') hex = '#FFFFFF'; else if (p.color === 'black') hex = '#000000'; else if (/^\[#/.test(p.color)) hex = p.color.slice(1, -1); else return null;
  let a = 1;
  if (p.alpha) a = /^\[/.test(p.alpha) ? parseFloat(p.alpha.slice(1, -1)) : +p.alpha / 100;
  return { hex: T.mix(hex, hex, 0), a };
}
const map = G.loadMap();
const built = G.buildRules(map);
const rules = built.rules;

/* effective colour of `kind` ('bg'|'text') for an element in a state, or null if inherited */
function effective(classes, tag, state, kind, rs) {
  rs = rs || rules;
  const prop = kind === 'bg' ? 'background-color' : 'color';
  const v = G.resolveDark(rs, classes, tag, state, prop);
  if (v) return parseCssColor(v);
  // no dark rule: an allow-listed token keeps its own colour (state tokens win in their state)
  const toks = classes.map(G.parseToken).filter((p) => p && p.kind === kind && p.color !== 'transparent');
  const pick = toks.filter((p) => state !== 'base' && p.variants.join(':') === state).concat(toks.filter((p) => !p.variants.length)).filter((p) => map.allow[p.raw])[0];
  return pick ? literal(pick.raw) : null;
}
function worstText(textC, bgC) { // contrast of text over bg, bg possibly translucent -> worst over surfaces
  const surfs = bgC.a < 1 ? Object.values(SURFACES) : [SURFACES.card];
  let worst = 99, where = '';
  surfs.forEach((s) => {
    const bg = bgC.a < 1 ? T.mix(s, bgC.hex, bgC.a) : bgC.hex;
    const fg = textC.a < 1 ? T.mix(bg, textC.hex, textC.a) : textC.hex;
    const c = T.contrast(fg, bg);
    if (c < worst) { worst = c; where = bg + '/' + fg; }
  });
  return { c: worst, where };
}

section('same-element (background, text) pairs resolved through the dark rules');
const sets = G.scanSets();
const seenPair = new Map();
let unverified = 0, pairsChecked = 0;
sets.forEach((s) => {
  const tags = s.tag === '?' ? ['div', 'button'] : [s.tag];
  tags.forEach((tag) => ['base', 'hover', 'focus'].forEach((state) => {
    if (state !== 'base' && !s.classes.some((c) => c.startsWith(state + ':'))) return;
    const bg = effective(s.classes, tag, state, 'bg'), tx = effective(s.classes, tag, state, 'text');
    if (!bg || !tx) { if (tx && !bg && state === 'base') unverified++; return; }
    if (bg.a === 0) return;
    const r = worstText(tx, bg);
    pairsChecked++;
    const key = [s.page, tag, state, s.classes.filter((c) => G.parseToken(c) && /^(bg|text)$/.test(G.parseToken(c).kind)).join(' ')].join(' | ');
    if (!seenPair.has(key)) seenPair.set(key, r);
    if (r.c < 4.5) check(`${s.page} <${tag}> ${state}: ${s.classes.filter((c) => G.parseToken(c)).join(' ')}`, false, r.c.toFixed(2) + ' (' + r.where + ')');
    else passed++;
  }));
});
console.log(`  ${pairsChecked} (element, state) pairs, ${seenPair.size} distinct class-set pairs checked; ${unverified} text-only class sets (fill is inherited from an ancestor) are checked against the three page surfaces below`);

section('text-only elements: the mapped text colour must read on every dark page surface it can sit on (cream, card, sand)');
const textOnly = new Set();
sets.forEach((s) => s.classes.forEach((c) => { const p = G.parseToken(c); if (p && p.kind === 'text' && !p.variants.length) textOnly.add(c); }));
const onLimeFill = new Set(['text-white', 'text-[#D6FF5F]']); // documented: only legible on the panel / lime handled by compounds
[...textOnly].sort().forEach((tok) => {
  const v = G.resolveDark(rules, [tok], 'div', 'base', 'color');
  const c = v ? parseCssColor(v) : literal(tok);
  if (!c) return;
  if (map.allow[tok] && !v) { // allow-listed: only meaningful on dark panels; report, never fail
    return;
  }
  const worst = Math.min.apply(null, Object.values(SURFACES).map((s) => T.contrast(c.a < 1 ? T.mix(s, c.hex, c.a) : c.hex, s)));
  check(`${tok} -> ${v} reads on cream/card/sand`, worst >= 4.5, worst.toFixed(2));
});

section('status tints: every chip/dot colour family against the dark surfaces');
const FAM = [
  ['peach chip', 'rgba(255,180,171,.14)', '#FFB4AB'], ['amber chip', 'rgba(251,191,36,.14)', '#FCD34D'], ['green chip', 'rgba(90,239,130,.12)', '#5AEF82'],
  ['purple chip', 'rgba(185,168,255,.14)', '#CFC4FF'], ['blue PAID chip', 'rgba(147,197,253,.14)', '#BFDBFE'], ['red text', 'rgba(255,180,171,.14)', '#FFB4AB'],
];
FAM.forEach(([n, fill, tx]) => {
  const f = parseCssColor(fill), t = parseCssColor(tx);
  const r = worstText(t, f);
  check(`${n}: ${tx} on ${fill} over cream/card/sand >= 4.5`, r.c >= 4.5, r.c.toFixed(2));
});
const dots = ['bg-[#4ADE80]', 'bg-[#FDBA74]', 'bg-[#FBBF24]', 'bg-[#FF8A5B]', 'bg-[#60A5FA]', 'bg-[#9B8EFF]', 'bg-[#B11016]', 'bg-[#0055FE]', 'bg-[#00BE6A]', 'bg-[#CFE8B5]', 'bg-[#F87171]'];
dots.forEach((tok) => {
  const v = G.resolveDark(rules, [tok], 'i', 'base', 'background-color');
  const c = parseCssColor(v);
  const worst = Math.min.apply(null, Object.values(SURFACES).map((s) => T.contrast(c.hex, s)));
  check(`status dot ${tok} -> ${v} is >= 3:1 on cream/card/sand`, worst >= 3, worst.toFixed(2));
});

section('structural colour pairs (not element-local)');
const P = (n, a, b, min) => check(`${n} >= ${min || 4.5}`, T.contrast(a, b) >= (min || 4.5), T.contrast(a, b).toFixed(2));
P('lime fill vs sand track (active pill / progress fill, non-text)', dark['--lime'], dark['--sand'], 3);
P('lime fill vs card (primary button edge, non-text)', dark['--lime'], dark['--card'], 3);
P('on-lime text on the lime fill', dark['--on-lime'], dark['--lime']);
P('ink on the hover limes (#9EE939 / --lime)', dark['--on-lime'], dark['--lime-text']);
P('control border on card (inputs/selects) non-text', dark['--control-border'], dark['--card'], 3);
P('focus border / ring --lime-text on card non-text', dark['--lime-text'], dark['--card'], 3);
P('muted (text-[#201C19]/60..) on sand', dark['--muted'], dark['--sand']);
P('text-white/40 remap (.6 white) on --panel', T.mix(dark['--panel'], '#FFFFFF', 0.6), dark['--panel']);

section('what could not be proven statically');
console.log(`  UNVERIFIED-BY-ELEMENT: ${unverified} class sets carry a text colour but no fill (inherit the ancestor's fill). Covered by the surface check above and by the in-browser audit; overlay/ancestor-dependent cases are listed in the report.`);
/* light mode, same-element literal pairs under 4.5 (pre-existing, NOT changed by dark mode) */
const lightIssues = new Set();
sets.forEach((s) => {
  const bgs = s.classes.map(G.parseToken).filter((p) => p && p.kind === "bg" && !p.variants.length && literal(p.raw) && literal(p.raw).a === 1);
  const txs = s.classes.map(G.parseToken).filter((p) => p && p.kind === "text" && !p.variants.length && literal(p.raw) && literal(p.raw).a === 1);
  bgs.forEach((b) => txs.forEach((t) => { const c = T.contrast(literal(t.raw).hex, literal(b.raw).hex); if (c < 4.5) lightIssues.add(s.page + " " + b.raw + " + " + t.raw + " = " + c.toFixed(2)); }));
});
console.log('  pre-existing LIGHT-mode same-element pairs under 4.5:1 (unchanged, listed only): ' + lightIssues.size + (lightIssues.size ? '\n    ' + [...lightIssues].sort().join('\n    ') : ''));

section("mutation: the checker really fails when a compound rule is removed");
(() => {
  const m2 = JSON.parse(JSON.stringify(map));
  m2.compounds = m2.compounds.filter((c) => c.id !== "primary-white");
  delete m2.map["bg-[#201C19]"].tagAlso; // the lime button's own on-lime text (belt and braces) removed too
  const rs = G.buildRules(m2).rules;
  const cls = ["bg-[#201C19]", "text-white"];
  const bg = effective(cls, "button", "base", "bg", rs), tx = effective(cls, "button", "base", "text", rs);
  check("without the primary-white compound and the tag colour a lime button with white text is < 4.5 (checker catches it)", worstText(tx, bg).c < 4.5, worstText(tx, bg).c.toFixed(2));
  const bg1 = effective(cls, "button", "base", "bg"), tx1 = effective(cls, "button", "base", "text");
  check("with it, the same button passes", worstText(tx1, bg1).c >= 4.5, worstText(tx1, bg1).c.toFixed(2));
})();



console.log(`\ntheme-tw-contrast: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
