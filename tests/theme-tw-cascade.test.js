/* Why the dark overrides win without touching applyTheme(): index.html's
   applyTheme() injects UNLAYERED `!important` rules (.bg-\[\#FFFBF5\]{...} etc.);
   so do the generated dark rules. Between two unlayered !important rules the
   higher specificity wins (order is never relied on). This test parses the real
   pushes out of index.html and compares specificity shape by shape.
   Usage: node tests/theme-tw-cascade.test.js */
const fs = require('fs');
const path = require('path');
const G = require('../scripts/gen-theme-tw.js');

let passed = 0, failed = 0;
function check(name, ok, detail) { if (ok) passed++; else { failed++; console.log(`  FAIL: ${name}${detail ? ' -- ' + detail : ''}`); } }
const section = (t) => console.log(`\n${t}`);
const cmp = (x, y) => x[0] - y[0] || x[1] - y[1] || x[2] - y[2];
const SCOPE_LEN = G.SCOPE.length;
const index = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

section('parse applyTheme() from index.html');
const baseM = /const _themeBaseHex = (\{[\s\S]*?\});/.exec(index);
const base = new Function('return ' + baseM[1])();
const fnStart = index.indexOf('function applyTheme(){');
const fnBody = index.slice(fnStart, index.indexOf('\napplyTheme();', fnStart));
const esc = (h) => h.replace('#', '\\#');
const pushes = [];
fnBody.replace(/push\(`([^`]*)`,\s*'([^']+)',\s*t\.(\w+)\)/g, (_, tpl, prop, key) => {
  const sel = new Function('base', 'esc', 'return `' + tpl + '`')(base, esc);
  pushes.push({ sel: '.' + sel, prop, key });
});
check('applyTheme pushes were parsed (' + pushes.length + ')', pushes.length === 25);
check('applyTheme output is `.<class>{prop:value !important}` (unlayered, !important)', /rules\.push\(`\.\$\{cls\}\{\$\{prop\}:\$\{val\} !important\}`\)/.test(fnBody) && !/@layer/.test(fnBody));
check('every applyTheme shape has specificity <= (0,3,0)', pushes.every((p) => cmp(G.specificity(p.sel), [0, 3, 0]) <= 0));
const shapes = {
  plain: pushes.find((p) => /^\.bg-\\\[\\#FFFBF5\\\]$/.test(p.sel)),
  hover: pushes.find((p) => /:hover$/.test(p.sel)),
  divide: pushes.find((p) => /divide/.test(p.sel)),
};
check('shape specificities are plain (0,1,0), hover (0,2,0), divide (0,3,0)', G.specificity(shapes.plain.sel).join() === '0,1,0' && G.specificity(shapes.hover.sel).join() === '0,2,0' && G.specificity(shapes.divide.sel).join() === '0,3,0', [shapes.plain, shapes.hover, shapes.divide].map((s) => s.sel + '=' + G.specificity(s.sel)).join(' '));

section('every dark rule beats the applyTheme rule it shadows');
const a = G.analyse();
const hexOf = { primary: base.primary, primaryHover: base.primaryHover, dark: base.dark, bg: base.bg, border: base.border, borderSoft: base.borderSoft, borderSoft2: base.borderSoft2, staff: base.staff, openPlay: base.openPlay, queue: base.queue, pending: base.pending };
let paired = 0;
const unmatched = [];
pushes.forEach((p) => {
  // the token this push targets, e.g. `.hover\:bg-\[\#CBF052\]:hover` -> hover:bg-[#CBF052]
  const cls = p.sel.replace(/:hover$/, '').replace(/ > :not\(\[hidden\]\) ~ :not\(\[hidden\]\)$/, '').slice(1).replace(/\\(.)/g, '$1');
  const tokenHits = a.rules.filter((r) => r.token === cls);
  if (!tokenHits.length) { unmatched.push(cls); return; }
  paired++;
  const wanted = /divide/.test(p.sel) ? tokenHits.filter((r) => /~ :not\(\[hidden\]\)/.test(r.sel)) : tokenHits.filter((r) => !r.tags);
  const light = G.specificity(p.sel);
  check(`${cls}: dark rule (${wanted.map((r) => r.spec.join('.')).join('/')}) > applyTheme (${light.join('.')})`, wanted.length > 0 && wanted.every((r) => cmp(r.spec, light) > 0), wanted.map((r) => r.sel).join(' | '));
  if (/divide/.test(p.sel)) {
    // the tailwind-shaped sibling (> :not(:last-child)) must also beat the combinator shape on the elements both hit
    tokenHits.forEach((r) => check(`${cls}: ${r.sel.slice(SCOPE_LEN)} beats applyTheme's divide shape`, cmp(r.spec, light) > 0));
  }
  // tags / hover sets with the same token: all variants beat it too
  tokenHits.forEach((r) => { if (cmp(r.spec, light) <= 0) check(`${cls}: ${r.sel}`, false, 'does not beat ' + light.join('.')); });
});
console.log(`  ${paired} applyTheme targets are shadowed by a dark rule; applyTheme targets no scanned page uses (tenants can recolour them, but no element carries them): ${unmatched.join(', ') || 'none'}`);
check('every applyTheme target that IS used on a customer page has a dark rule (no tenant colour can reach dark)', unmatched.every((c) => !a.scan.tokens.has(c)), unmatched.filter((c) => a.scan.tokens.has(c)).join(' '));

section('applyTheme :hover targets: the dark rule must be UNGATED (touch devices keep a tapped :hover)');
(() => {
  const hovers = pushes.filter((p) => /:hover$/.test(p.sel));
  check('applyTheme pushes ' + hovers.length + ' :hover rules (not wrapped in @media (hover:hover))', hovers.length === 7 && !/hover:hover/.test(fnBody));
  const css0 = fs.readFileSync(path.join(__dirname, '..', 'theme.css'), 'utf8');
  const blk = G.currentBlock(css0), gateAt = blk.indexOf('@media (hover:hover){');
  const unprefixed = (sel) => sel.slice(1).replace(/:hover$/, '').replace(/\\(.)/g, '$1');
  hovers.forEach((p) => {
    const tok = unprefixed(p.sel), light = G.specificity(p.sel);
    const hits = a.rules.filter((r) => r.token === tok && !r.tags);
    check(tok + ': has a dark rule, emitted UNGATED (no @media (hover:hover)), !important, specificity > applyTheme', hits.length > 0 && hits.every((r) => r.media === null && cmp(r.spec, light) > 0 && r.decls.length > 0));
    const line = blk.split(/\r?\n/).findIndex((l) => l.startsWith(':root[data-theme="dark"] ' + p.sel + '{'));
    const pos = blk.split(/\r?\n/).slice(0, line).join('\n').length;
    check(tok + ': the rule sits in theme.css BEFORE the @media (hover:hover) group and ends with !important', line > 0 && pos < gateAt && /!important\}$/.test(blk.split(/\r?\n/)[line]));
  });
  // any other pseudo-class applyTheme emits (focus, active, ...) would have the same gap
  check('applyTheme emits no pseudo-class other than :hover and the divide combinator (no focus:/active: gap)', pushes.every((p) => !/:(focus|active|checked|disabled|focus-within|focus-visible)/.test(p.sel)));
  check('mutation: a hover target emitted INSIDE @media (hover:hover) would fail the ungated assertion', (() => { const r = a.rules.find((x) => x.token === 'hover:bg-[#D6FF5F]'); return r && r.media === '(hover:hover)'; })());
})();

section('dark rules for the base-theme hexes are all !important');
const baseHexes = new Set(Object.values(base).map((h) => h.toUpperCase()));
const baseRules = a.rules.filter((r) => { const p = G.parseToken(r.token || ''); return p && /^\[#/.test(p.color) && baseHexes.has(p.color.slice(1, -1).toUpperCase()); });
check('there are dark rules for the _themeBaseHex tokens (' + baseRules.length + ')', baseRules.length > 30);
const css = fs.readFileSync(path.join(__dirname, '..', 'theme.css'), 'utf8');
const block = G.currentBlock(css);
const lines = block.split(/\r?\n/);
check('each of them is emitted with !important on every declaration in theme.css', baseRules.every((r) => { const line = lines.find((l) => l.startsWith(r.sel + '{')); return !!line && line.slice(line.indexOf('{') + 1, -1).split(';').every((d) => /!important$/.test(d)); }));

section('the divide shape');
const divRules = a.rules.filter((r) => r.state === 'divide');
check('the combinator-shaped dark rule is (0,5,0): > applyTheme (0,3,0)', divRules.some((r) => G.specificity(r.sel).join() === '0,5,0'));
check('the :not(:last-child) shaped dark rule (0,4,0) also beats it', divRules.some((r) => G.specificity(r.sel).join() === '0,4,0'));

section('mutation: a dark rule without enough specificity would be caught');
check('a bare `.bg-x{...!important}` (0,1,0) is NOT > applyTheme plain (0,1,0)', cmp(G.specificity('.bg-x'), G.specificity(shapes.plain.sel)) <= 0);
check('a scoped `:root[data-theme="dark"] .bg-x` (0,3,0) is > applyTheme plain and hover shapes', cmp(G.specificity(':root[data-theme="dark"] .bg-x'), G.specificity(shapes.plain.sel)) > 0 && cmp(G.specificity(':root[data-theme="dark"] .bg-x'), G.specificity(shapes.hover.sel)) > 0);
check('...but a scoped plain rule (0,3,0) only TIES the divide shape (0,3,0): hence the dedicated 0,5,0 divide rule', cmp(G.specificity(':root[data-theme="dark"] .bg-x'), G.specificity(shapes.divide.sel)) === 0);

console.log(`\ntheme-tw-cascade: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
