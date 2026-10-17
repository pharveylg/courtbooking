/* Inline colours (style="...", el.style.x = '...', template strings that build style attributes,
   {bg:'#..', fg:'#..'} maps, page <style> blocks) cannot be reached by a Tailwind utility override.
   Every hex / rgb() / rgba() literal outside Tailwind class names on the customer pages must either
   be covered by a dark attribute-selector rule in theme.css (matched by the exact authored substring,
   or its browser-serialised rgb() form for JS-set styles) or be allow-listed with a reason in
   theme-tw-map.json ("inline"). Usage: node tests/theme-tw-inline.test.js */
const fs = require('fs');
const path = require('path');
const T = require('../theme.js');
const G = require('../scripts/gen-theme-tw.js');

let passed = 0, failed = 0;
function check(name, ok, detail) { if (ok) passed++; else { failed++; console.log(`  FAIL: ${name}${detail ? ' -- ' + detail : ''}`); } }
const section = (t) => console.log(`\n${t}`);
const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const WIRED = ['index.html', 'store.html', 'tournament.html', 'gallery.html', 'billing.html', 'tournament-admin.html'];

const norm = (s) => s.toLowerCase().replace(/\s+/g, '');
const kebab = (s) => s.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase());
function rgbOf(hex) { const p = T.parseHex(hex); return p ? `rgb(${p.r},${p.g},${p.b})` : null; }

/* literals: [{ key, prop, value, line }] */
const LIT = /#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b|rgba?\([^)]*\)/g;
function roleBefore(before) {
  let m = /\.style\.(\w+)\s*=[^;\n]*$/.exec(before);
  if (m) return kebab(m[1]).replace(/^background$/, 'background');
  m = /\b(bg|fg)\s*:\s*['"`]$/.exec(before);
  if (m) return m[1] === 'bg' ? 'background' : 'color';
  m = /([a-z-]+)\s*:\s*[^;'"`{}]*$/.exec(before.slice(-80));
  return m ? m[1] : null;
}
function literals(text) {
  let t = text.split(T.BOOTSTRAP).join('').replace(/<meta name="theme-color"[^>]*>/g, '');
  t = t.replace(/\[[^\]\s'"`]*\]/g, '[]'); // Tailwind arbitrary values (bg-[#...], shadow-[..rgba(..)])
  const out = [];
  let m;
  LIT.lastIndex = 0;
  while ((m = LIT.exec(t))) {
    const prop = roleBefore(t.slice(Math.max(0, m.index - 100), m.index));
    const value = /^#/.test(m[0]) ? m[0].toUpperCase() : m[0].replace(/\s+/g, '');
    out.push({ prop, value, key: (prop ? prop + ':' : '') + value, line: t.slice(0, m.index).split('\n').length });
  }
  return out;
}

const css = read('theme.css');
const selText = []; // authored substrings of every dark [style*="..."] selector
css.replace(/\[style\*="([^"]*)"\]/g, (_, s) => { selText.push(norm(s)); return ''; });
const covered = (l) => {
  const cands = [norm(l.key)];
  if (/^#/.test(l.value)) cands.push(norm((l.prop ? l.prop + ':' : '') + rgbOf(l.value)));
  return cands.some((c) => selText.some((s) => s.includes(c)));
};
const map = G.loadMap();
const allow = {};
Object.keys(map.inline || {}).forEach((k) => { allow[norm(k)] = map.inline[k]; });
const allowed = (l, page) => [norm(l.key), norm(l.value)].some((k) => k in allow || (page && (norm(page + '|' + k) in allow)));

function uncovered(page, extraSel) {
  const text = read(page);
  return literals(text).filter((l) => !covered(l) && !allowed(l, page));
}

section('every inline colour literal on the wired pages is covered or allow-listed');
WIRED.forEach((p) => {
  const lits = literals(read(p));
  const bad = uncovered(p);
  check(`${p}: ${lits.length} colour literals outside class names, ${bad.length} uncovered`, bad.length === 0, [...new Set(bad.map((b) => b.key + '@' + b.line))].join(' | '));
});
check('every allow-list entry has a reason', Object.values(map.inline || {}).every((r) => typeof r === 'string' && r.length > 10));
const staleKeys = Object.keys(map.inline || {}).filter((k) => {
  const [pg, rest] = k.includes('|') ? k.split('|') : [null, k];
  return !(pg ? [pg] : WIRED).some((p) => literals(read(p)).some((l) => norm(l.key) === norm(rest) || norm(l.value) === norm(rest)));
});
check('every allow-list entry is still used by a wired page (no stale entries)', staleKeys.length === 0, staleKeys.join(' '));

section('rules the allow-list leans on really exist');
check('scrollbar thumb override exists (page <style> background:#e5ddd4)', /:root\[data-theme="dark"\] ::-webkit-scrollbar-thumb\{[^}]*var\(--line\)/.test(css));
check('billing tenant logo tile override exists (style.background = primary)', /#gateLogo[^{]*#appLogo[^{]*\{background-color:var\(--panel\)/.test(css));
check('the credit-pill rules exist and are .dula-credit scoped', (css.match(/\.dula-credit[^{]*\[style\*=/g) || []).length === 2);

section('mutation: removing a dark attribute rule makes the check fail');
(() => {
  const strip = css.replace(/:root\[data-theme="dark"\] \[style\*="color:rgba\(32,28,25,0\.7\)"\]\{[^}]*\}\n/, '');
  check('(sanity) the mutated css really lost the rank-colour rule', strip !== css);
  const sel2 = []; strip.replace(/\[style\*="([^"]*)"\]/g, (_, s) => { sel2.push(norm(s)); return ''; });
  const cov2 = (l) => [norm(l.key)].some((c) => sel2.some((s) => s.includes(c)));
  const rank = literals(read('tournament.html')).filter((l) => l.value === 'rgba(32,28,25,0.7)');
  check('tournament.html has the rgba(32,28,25,0.7) rank colour literal', rank.length === 1);
  check('with the rule removed the literal is reported uncovered (the original bug)', rank.every((l) => !cov2(l) && !allowed(l, 'tournament.html')));
  const amber = literals(read('billing.html')).filter((l) => l.value === '#8A5A00');
  check('billing.html #8A5A00 (amber status text) is covered by a RAW-hex rule, not just the rgb() serialisation', amber.length > 0 && amber.every((l) => selText.some((s) => s.includes('color:#8a5a00'))));
  const strip2 = css.replace(/\[style\*="color:#8A5A00"\]/, '[style*="color:#000001"]');
  const sel3 = []; strip2.replace(/\[style\*="([^"]*)"\]/g, (_, s) => { sel3.push(norm(s)); return ''; });
  check('without the raw #8A5A00 rule only the rgb(138,90,0) form remains, which does not match template-string styles', !sel3.some((s) => s.includes('color:#8a5a00')) && sel3.some((s) => s.includes('rgb(138,90,0)')));
})();

console.log(`\ntheme-tw-inline: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
