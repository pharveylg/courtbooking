/* The generated theme-tw block (and the hand-written extras next to it) can only
   ever act in dark mode on screen: every selector is scoped to
   :root[data-theme="dark"], everything sits inside @media screen, hover rules sit
   inside @media (hover:hover), every declaration is !important, and the block
   defines no tokens. Usage: node tests/theme-tw-scope.test.js */
const fs = require('fs');
const path = require('path');
const G = require('../scripts/gen-theme-tw.js');

let passed = 0, failed = 0;
function check(name, ok, detail) { if (ok) passed++; else { failed++; console.log(`  FAIL: ${name}${detail ? ' -- ' + detail : ''}`); } }
const section = (t) => console.log(`\n${t}`);
const css = fs.readFileSync(path.join(__dirname, '..', 'theme.css'), 'utf8');
const SCOPE = ':root[data-theme="dark"]';

/* tiny brace walker: returns [{ at: ['@media screen', '@media (hover:hover)'], sel, body }] for style rules */
function walk(s, at, out) {
  let i = 0;
  while (i < s.length) {
    let j = i;
    while (j < s.length && s[j] !== '{') { if (s[j] === '\\') j++; j++; }
    if (j >= s.length) break;
    const head = s.slice(i, j).trim();
    let d = 1, k = j + 1;
    while (k < s.length && d) { if (s[k] === '\\') k++; else if (s[k] === '{') d++; else if (s[k] === '}') d--; k++; }
    const body = s.slice(j + 1, k - 1);
    if (head.startsWith('@')) walk(body, at.concat(head), out); else out.push({ at, sel: head, body });
    i = k;
  }
  return out;
}
function section_(begin, end) {
  const a = css.indexOf(begin), b = css.indexOf(end);
  return a < 0 || b < 0 ? null : css.slice(a + begin.length, b);
}
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').trim();

section('generated block');
const gen = section_(G.BEGIN, G.END);
check('the block exists', gen !== null);
const body = strip(gen);
const top = walk(body, [], []);
check('the block is a single @media screen{...} and nothing else', /^@media screen\s*\{/.test(body) && body.endsWith('}') && walk(body, [], []).every((r) => r.at[0] === '@media screen'));
const rules = top;
check('rules were emitted (' + rules.length + ')', rules.length > 100);
check('every rule is inside @media screen (print stays light)', rules.every((r) => r.at[0] === '@media screen'));
check('every comma-separated selector starts with :root[data-theme="dark"]', rules.every((r) => r.sel.split(/,(?![^(]*\))/).every((s) => s.trim().startsWith(SCOPE + ' '))), rules.filter((r) => !r.sel.split(/,(?![^(]*\))/).every((s) => s.trim().startsWith(SCOPE + ' '))).map((r) => r.sel).join(' | '));
check('every declaration is !important', rules.every((r) => r.body.split(';').filter(Boolean).every((d) => /!important$/.test(d.trim()))), rules.filter((r) => !r.body.split(';').filter(Boolean).every((d) => /!important$/.test(d.trim()))).map((r) => r.sel).join(' | '));
const hov = rules.filter((r) => /:hover\b/.test(r.sel));
const tokenOf = (sel) => sel.replace(/^:root\[data-theme="dark"\] \./, '').replace(/:hover$/, '').replace(/\\(.)/g, '$1');
const UNGATED = G.applyThemeHoverTokens(); // tokens applyTheme() overrides on :hover (ungated there, so ungated here)
const isGated = (r) => r.at.length === 2 && r.at[1] === '@media (hover:hover)';
check('hover rules exist (' + hov.length + ') and ALL of them are inside @media (hover:hover) EXCEPT the tokens applyTheme() overrides on :hover (touch devices keep a tapped :hover, so those dark rules must be ungated)', hov.length > 5 && hov.every((r) => isGated(r) || UNGATED.has(tokenOf(r.sel))), hov.filter((r) => !isGated(r) && !UNGATED.has(tokenOf(r.sel))).map((r) => r.sel).join(' | '));
const ungatedHov = hov.filter((r) => !isGated(r));
check('the ungated hover rules are EXACTLY the applyTheme hover targets (' + ungatedHov.length + ' of ' + UNGATED.size + '): every one of them is ungated and no other hover rule is', ungatedHov.length === UNGATED.size && ungatedHov.every((r) => UNGATED.has(tokenOf(r.sel))) && [...UNGATED].every((t) => ungatedHov.some((r) => tokenOf(r.sel) === t)), [...UNGATED].filter((t) => !ungatedHov.some((r) => tokenOf(r.sel) === t)).join(' '));
check('nothing else is inside @media (hover:hover)', rules.filter((r) => r.at.length > 1).every((r) => /:hover\b/.test(r.sel) && r.at[1] === '@media (hover:hover)'));
check('no @layer, @import, @supports in the block (unlayered on purpose: it must beat both layered tailwind and the unlayered applyTheme rules)', !/@layer|@import|@supports/.test(body));
check('the block defines no custom property and no color-scheme (token definitions stay in the first @media screen block)', !/(^|[;{\s])--[\w-]+\s*:/.test(rules.map((r) => r.body).join(';').replace(/--tw-ring-color/g, '')) && !/color-scheme/.test(body));
check('only var(--card|cream|sand|panel|line|ink|muted|lime|lime-text|on-lime|on-panel|danger-text|control-border|scrim) and literals are used; no tenant/brand/primary variable', !/var\(--(primary|brand|tenant|accent|bg-color)/i.test(body) && (body.match(/var\(--[\w-]+\)/g) || []).every((v) => /--(card|cream|sand|panel|line|ink|muted|lime|lime-text|on-lime|on-panel|danger-text|control-border|scrim|placeholder)\)/.test(v)));
const divs = rules.filter((r) => /divide-/.test(r.sel));
check('the divide override keeps the combinator shape applyTheme uses (> :not([hidden]) ~ :not([hidden])) and the tailwind shape (> :not(:last-child))', divs.some((r) => r.sel.includes('> :not([hidden]) ~ :not([hidden])')) && divs.some((r) => r.sel.includes('> :not(:last-child)')));
check('print is untouched: no @media print and no rule outside @media screen anywhere in the generated block', !/@media print/.test(body));

section('hand-written extras (theme-tw-extras)');
const hw = section_('/* BEGIN HAND-WRITTEN theme-tw-extras', '/* END HAND-WRITTEN theme-tw-extras */');
check('the hand-written section exists, after the generated block', hw !== null && css.indexOf('BEGIN HAND-WRITTEN') > css.indexOf(G.END));
const hrules = walk(strip(hw.slice(hw.indexOf('*/') + 2)), [], []);
check('hand-written rules (' + hrules.length + ') are all inside @media screen, scoped to :root[data-theme="dark"], and !important', hrules.length > 5 && hrules.every((r) => r.at.length === 1 && r.at[0] === '@media screen' && r.sel.split(/,(?![^(]*\))/).every((s) => s.trim().startsWith(SCOPE + ' ')) && r.body.split(';').filter(Boolean).every((d) => /!important$/.test(d.trim()))));
check('billing tenant logo tile: overrides background-COLOR (not the background shorthand) to var(--panel) in dark', hrules.some((r) => /#gateLogo/.test(r.sel) && /#appLogo/.test(r.sel) && /^background-color:var\(--panel\)!important$/.test(r.body.trim())) && !hrules.some((r) => /#gateLogo|#appLogo/.test(r.sel) && /(^|;)background:/.test(r.body)));
check('credit-pill overrides are scoped to .dula-credit (picker/queue keep their own pill)', hrules.filter((r) => /dula-credit/.test(r.sel)).length === 2);

section('the file outside the new sections is unchanged in kind');
const outside = css.slice(0, css.indexOf(G.BEGIN)) + css.slice(css.indexOf('/* END HAND-WRITTEN theme-tw-extras */'));
check('the original token block and toggle styles are still present', /--card: #FFFFFF/.test(outside) && /\.cb-theme-btn/.test(outside) && /\.cb-force-light/.test(outside));
check('dark tokens are still defined once, in the first @media screen block, with color-scheme: dark', (outside.match(/color-scheme:\s*dark/g) || []).length === 1);

console.log(`\ntheme-tw-scope: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
