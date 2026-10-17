/* scripts/gen-theme-tw.js: the committed block in theme.css is exactly what the
   generator produces, every colour utility on the customer pages is mapped or
   allow-listed (and a new unmapped one makes the generator fail), the page list is
   right. Usage: node tests/theme-tw-generator.test.js */
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');
const G = require('../scripts/gen-theme-tw.js');

let passed = 0, failed = 0;
function check(name, ok, detail) { if (ok) passed++; else { failed++; console.log(`  FAIL: ${name}${detail ? ' -- ' + detail : ''}`); } }
const section = (t) => console.log(`\n${t}`);
const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

section('generator output vs the committed theme.css');
const a = G.analyse();
const css = read('theme.css');
check('analysis has no errors', a.errors.length === 0, a.errors.join(' | '));
check('theme.css contains the BEGIN/END markers exactly once', css.split(G.BEGIN).length === 2 && css.split(G.END).length === 2);
check('the committed generated block equals a fresh in-memory generation', G.currentBlock(css) === a.block);
check('re-splicing the fresh block into theme.css changes nothing (idempotent)', G.spliceBlock(css, a.block) === css);
check('generation is deterministic (two runs are identical)', G.analyse().block === a.block);
check('rules are emitted in specificity order within each media group', (() => {
  const o = G.order(a.rules);
  for (let i = 1; i < o.length; i++) {
    if ((o[i - 1].media || '') === (o[i].media || '')) {
      const x = o[i - 1].spec, y = o[i].spec;
      if (x[0] > y[0] || (x[0] === y[0] && (x[1] > y[1] || (x[1] === y[1] && x[2] > y[2])))) return false;
    }
  }
  return true;
})());

section('page list');
check('index, store, tournament, gallery, billing are scanned', ['index.html', 'store.html', 'tournament.html', 'gallery.html', 'billing.html'].every((p) => G.PAGES.includes(p)));
check('superadmin.html is NOT in the generator page list (out of scope for dark mode)', !G.PAGES.includes('superadmin.html'));
check('tournament-admin.html is not scanned (it would add map entries; Phase 3d)', !G.PAGES.includes('tournament-admin.html'));
const adminOnly = [...G.scanPage('tournament-admin.html').tokens.keys()].filter((t) => !a.scan.tokens.has(t));
check('...and the reason is real: it carries colour utilities the map does not know yet (' + adminOnly.join(', ') + ')', adminOnly.length > 0);

section('every scanned colour utility is mapped or allow-listed');
G.PAGES.forEach((p) => {
  const toks = [...G.scanPage(p).tokens.keys()];
  const missing = toks.filter((t) => !(t in a.map.map) && !(t in a.map.allow));
  check(`${p}: ${toks.length} distinct colour utilities, none unmapped`, missing.length === 0, missing.join(' '));
});
check('no token is both mapped and allow-listed', Object.keys(a.map.map).every((t) => !(t in a.map.allow)));
check('every allow-list entry carries a reason', Object.values(a.map.allow).every((r) => typeof r === 'string' && r.length > 10));
check('every mapped token is a real colour utility that tailwind.css compiles (buildRules reports no error)', a.errors.length === 0);
check('no mapped / allow-listed entry is stale (all still used by a scanned page)', a.stale.length === 0, a.stale.join(' '));
check('the scanner found no colour utility it cannot map by name (templated, rgb(), var() ...)', a.scan.bad.length === 0, a.scan.bad.join(' | '));
check('every compound/descendant class that is a colour utility is known to the pages', [].concat(a.map.compounds.map((c) => c.when), a.map.descendants.map((d) => d.within.classes.concat(d.target))).every((arr) => arr.filter((c) => G.parseToken(c)).every((c) => a.scan.tokens.has(c))));

section('mutation: an unmapped utility is caught');
(() => {
  const NEW = 'bg-[#123456]';
  const toks = G.tokensIn(read('store.html') + ' <div class="' + NEW + '">').tokens;
  const unm = [...toks.keys()].filter((t) => !(t in a.map.map) && !(t in a.map.allow));
  check('an extra `bg-[#123456]` on a page shows up as unmapped (in-memory)', unm.length === 1 && unm[0] === NEW, unm.join(' '));
  // end to end: run the real script against a scratch copy of the inputs
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'thtw-'));
  try {
    ['theme.css', 'theme-tw-map.json', 'tailwind.css'].concat(G.PAGES).forEach((f) => fs.copyFileSync(path.join(ROOT, f), path.join(dir, f)));
    const run = (args) => cp.spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'gen-theme-tw.js')].concat(args), { env: Object.assign({}, process.env, { THEME_TW_ROOT: dir }), encoding: 'utf8' });
    const ok = run(['--check']);
    check('scratch copy: --check exits 0 when everything matches', ok.status === 0, ok.stdout + ok.stderr);
    fs.appendFileSync(path.join(dir, 'store.html'), '\n<div class="' + NEW + '"></div>\n');
    const bad = run(['--check']);
    check('scratch copy: --check exits 2 and names the unmapped token after an unmapped utility is added', bad.status === 2 && bad.stdout.includes(NEW), 'status ' + bad.status + ' ' + bad.stdout);
    fs.copyFileSync(path.join(ROOT, 'store.html'), path.join(dir, 'store.html'));
    fs.writeFileSync(path.join(dir, 'theme.css'), fs.readFileSync(path.join(dir, 'theme.css'), 'utf8').replace('background-color:var(--panel)!important', 'background-color:red!important'));
    const stale = run(['--check']);
    check('scratch copy: --check exits 1 when the committed block is stale', stale.status === 1, 'status ' + stale.status + ' ' + stale.stdout);
    const fix = run([]);
    check('scratch copy: default mode rewrites the block and --check is green again', fix.status === 0 && run(['--check']).status === 0, fix.stdout + fix.stderr);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
})();

section('tailwind.css coverage: billing.html is not an @source, so it must only use classes compiled for other pages');
const twIn = read('tailwind-input.css');
check('billing.html is NOT listed in tailwind-input.css (documented: tailwind.css is not rebuilt for it)', !/billing\.html/.test(twIn));
const miss = G.missingFromTailwind('billing.html');
const KNOWN = ['dula-credit', 'file:mono']; // dula-credit is a marker class with no CSS; `file:mono` is a pre-existing typo (no utility of that name exists in any build)
check('billing.html: 0 Tailwind utility classes are missing from tailwind.css (only the marker class and the pre-existing `file:mono` typo have no rule)', miss.every((c) => KNOWN.includes(c)), miss.join(' '));
G.PAGES.filter((p) => p !== 'index.html').forEach((p) => {
  const m = G.missingFromTailwind(p).filter((c) => !KNOWN.includes(c));
  // classes the page defines itself (JS-toggled state classes such as `active`) are not Tailwind; only colour utilities matter here
  check(`${p}: every COLOUR utility it uses is compiled in tailwind.css`, m.filter((c) => G.parseToken(c)).length === 0, m.filter((c) => G.parseToken(c)).join(' '));
});

section('guards for rules that are only safe in a specific context');
(() => {
  // (d) hover:text-[#201C19] -> on-lime is only right where the hover fill is lime
  const sets = G.scanSets().filter((s) => s.classes.includes('hover:text-[#201C19]'));
  check('hover:text-[#201C19] (mapped to on-lime) occurs only on elements that also have hover:bg-[#D6FF5F] (lime hover fill): ' + sets.length + ' occurrence(s)', sets.length > 0 && sets.every((s) => s.classes.includes('hover:bg-[#D6FF5F]')), sets.filter((s) => !s.classes.includes('hover:bg-[#D6FF5F]')).map((s) => s.page).join(' '));
  check('...and none of them is on a wired page without a lime hover fill (they are index.html only for now)', sets.every((s) => s.page === 'index.html'));
  // (e) divide-* children that carry their own border-[hex] would be recoloured by the dark divide rule
  const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
  function divideHits(p, t) {
    const hits = [];
    const re = /<(\/)?([a-zA-Z][\w-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g;
    const stack = [];
    let m;
    while ((m = re.exec(t))) {
      const tag = m[2].toLowerCase();
      if (m[1]) { for (let i = stack.length - 1; i >= 0; i--) if (stack[i].tag === tag) { stack.length = i; break; } continue; }
      const cm = /\bclass=(?:"([^"]*)"|'([^']*)')/.exec(m[3]);
      const classes = cm ? (cm[1] || cm[2]).split(/\s+/) : [];
      const parent = stack[stack.length - 1];
      if (parent && parent.classes.some((c) => /^divide-\[#/.test(c)) && classes.some((c) => /^(?:border|border-[trblxy])-\[#/.test(c))) hits.push(p + ':' + t.slice(0, m.index).split('\n').length + ' <' + tag + '> inside divide parent <' + parent.tag + '>');
      if (!VOID.has(tag) && !/\/\s*$/.test(m[3])) stack.push({ tag, classes });
    }
    return hits;
  }
  const hits = [].concat.apply([], G.PAGES.map((p) => divideHits(p, read(p))));
  check('(detector sanity) a synthetic divide parent with a bordered child IS found, a bordered grandchild is not', divideHits('x', '<ul class="divide-[#F5EDE4]"><li class="border-[#EAE0D5]">a</li><li><b class="border-[#EAE0D5]"></b></li></ul>').length === 1);
  check('no element inside a divide-[#hex] parent carries its own border-[#hex] (the dark divide rule would recolour it)', hits.length === 0, hits.join(' | '));
  // (b) class names assembled at run time are invisible to the scan
  check('no wired/customer page builds a colour utility class name at run time (scan gap)', G.PAGES.every((p) => G.dynamicClassSites(read(p)).length === 0), G.PAGES.map((p) => G.dynamicClassSites(read(p)).map((d) => p + ':' + d.line)).flat().join(' '));
  const sample = ["const c = 'bg-[#' + hex + ']';", 'el.className = `text-[#${c}] px-2`;', "x.classList.add('border-' + color);", "x.classList.add('bg-[#201C19]');"];
  const found = sample.map((l) => G.dynamicClassSites(l).length);
  check('the detector flags concatenated / templated colour classes and ignores a static one', found.join() === '1,1,1,0', found.join());
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'thtw2-'));
  try {
    ['theme.css', 'theme-tw-map.json', 'tailwind.css'].concat(G.PAGES).forEach((f) => fs.copyFileSync(path.join(ROOT, f), path.join(dir, f)));
    fs.appendFileSync(path.join(dir, 'store.html'), "\n<script>const c = 'bg-[#' + hex + ']';</script>\n");
    const r = cp.spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'gen-theme-tw.js'), '--check'], { env: Object.assign({}, process.env, { THEME_TW_ROOT: dir }), encoding: 'utf8' });
    check('scratch copy: --check exits 2 and prints a WARNING when a dynamic colour class appears', r.status === 2 && /WARNING: class names built at run time/.test(r.stdout), 'status ' + r.status + ' ' + r.stdout.slice(0, 200));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
})();

console.log(`\ntheme-tw-generator: ${passed} passed, ${failed} failed  (${a.scan.tokens.size} tokens scanned, ${Object.keys(a.map.map).length} mapped, ${Object.keys(a.map.allow).length} allow-listed, ${a.rules.length} rules, ${Buffer.byteLength(a.block)} bytes)`);
process.exit(failed ? 1 : 0);
