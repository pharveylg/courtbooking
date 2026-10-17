#!/usr/bin/env node
/* gen-theme-tw.js -- generates the dark-mode overrides for Tailwind colour utilities.

   WHY: store / tournament / gallery / billing / index are styled by Tailwind
   arbitrary-hex utilities (bg-[#201C19], hover:border-[#201C19], bg-white ...), so
   there is no token to flip. This script scans those pages for every colour
   utility, looks each one up in a HUMAN-EDITED map (theme-tw-map.json) and writes
   one dark override rule per utility into a delimited block of theme.css:

       / * BEGIN GENERATED theme-tw * /   ...   / * END GENERATED theme-tw * /

   WORKFLOW
     1. edit theme-tw-map.json            (map a new token, or allow-list it with a reason)
     2. node scripts/gen-theme-tw.js      (rewrites the block in theme.css)
     3. node tests/theme-tw-*.test.js     (or the full suite)
     4. bump CACHE_NAME in sw.js          (sw.js serves theme.css cache-first)
   node scripts/gen-theme-tw.js --check   exits 1 when the committed block is stale,
                                          2 when a scanned token is neither mapped nor allow-listed.

   HOW THE RULES WIN (no change to applyTheme(), tailwind.css or any page):
     tailwind.css wraps utilities in @layer; theme.css and index.html's injected
     #client-theme are UNLAYERED. Every dark rule is
         :root[data-theme="dark"] <the selector tailwind.css itself emits>{prop:value!important}
     inside @media screen (print stays light) and, for hover, inside
     @media (hover:hover). Between two unlayered !important rules the higher
     specificity wins: applyTheme's shapes are (0,1,0) / hover (0,2,0) / divide
     (0,3,0); a dark rule is always >= (0,3,0) and the divide shape keeps its
     combinator so it reaches (0,5,0). Tenant colours therefore never reach dark.

   MAP FORMAT (theme-tw-map.json)
     map[token]        string  -> that one declaration (property implied by the utility kind)
                       object  -> { value, also:{prop:value}, tags:{"button,a":value} }
                                  tags = element-qualified override of the plain (variant-less) rule
     compounds[]       { id, when:[class,...], tag?:"button,a", decls:{prop:value}, why }
                       same-element rule: `tag.class1.class2` (text colour that depends on the fill)
     descendants[]     { id, within:{tag, classes}, target:[class,...], decls, why }
     allow[token]      reason the token is intentionally left alone in dark
   Values are theme tokens (var(--panel)) or literals (#FFB4AB, rgba(...)). */
'use strict';
const fs = require('fs');
const path = require('path');

/* THEME_TW_ROOT lets the tests run the script against a scratch copy of the repo files. */
const ROOT = process.env.THEME_TW_ROOT || path.join(__dirname, '..');
/* The customer-facing union. superadmin.html is OUT of scope for dark mode;
   tournament-admin.html (the organizer console, Phase 3d) is listed too. */
const PAGES = ['index.html', 'store.html', 'tournament.html', 'gallery.html', 'billing.html', 'tournament-admin.html'];
const BEGIN = '/* BEGIN GENERATED theme-tw */';
const NOTE = '/* Generated from theme-tw-map.json by scripts/gen-theme-tw.js -- do not edit by hand; run: node scripts/gen-theme-tw.js */';
const END = '/* END GENERATED theme-tw */';
const SCOPE = ':root[data-theme="dark"]';

const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

/* ---------------- token parsing ---------------- */
const PALETTE = '(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\\d{2,3}';
const KINDS = '(?:bg|text|border|border-[trblxyse]|ring|divide|accent|fill|stroke|outline|from|to|via|decoration|caret|placeholder|ring-offset)';
const COLOR = '(?:\\[#[0-9a-fA-F]{3,8}\\]|white|black|transparent|' + PALETTE + ')';
const TOKEN_RE = new RegExp('^((?:[a-z0-9-]+:)*)(' + KINDS + ')-(' + COLOR + ')(?:/(\\d+|\\[[0-9.]+\\]))?$');
/* a colour utility we cannot map by name: report it instead of silently missing it */
const UNSUPPORTED_RE = /^(?:[a-z0-9-]+:)*(?:bg|text|border|border-[trblxyse]|ring|divide|accent|fill|stroke|outline|from|to|via|decoration|caret|placeholder)-\[(?:rgb|hsl|oklch|oklab|color|var|[^\]]*\$\{)/;
const PROP = { bg: 'background-color', text: 'color', border: 'border-color', ring: '--tw-ring-color', divide: 'border-color', accent: 'accent-color', fill: 'fill', stroke: 'stroke', outline: 'outline-color', caret: 'caret-color', decoration: 'text-decoration-color', placeholder: 'color' };
const kindProp = (kind) => PROP[kind] || (/^border-/.test(kind) ? 'border-color' : null);

function parseToken(tok) {
  const m = TOKEN_RE.exec(tok);
  if (!m) return null;
  const variants = m[1] ? m[1].slice(0, -1).split(':') : [];
  return { raw: tok, variants, kind: m[2], color: m[3], alpha: m[4] || null };
}

/* ---------------- scanning the pages ---------------- */
function tokensIn(text) {
  const out = new Map(), bad = new Set();
  for (let tok of text.split(/[\s"'`]+/)) {
    tok = tok.replace(/^[.(]+/, '').replace(/[.,;:)]+$/, '');
    if (!tok) continue;
    if (UNSUPPORTED_RE.test(tok)) { bad.add(tok); continue; }
    if (TOKEN_RE.test(tok)) out.set(tok, (out.get(tok) || 0) + 1);
  }
  return { tokens: out, bad };
}
function scanPage(page) { return tokensIn(read(page)); }
function scanAll(pages) {
  const all = new Map(), bad = new Set();
  (pages || PAGES).forEach((p) => {
    const r = scanPage(p);
    r.tokens.forEach((n, t) => { const e = all.get(t) || {}; e[p] = n; all.set(t, e); });
    r.bad.forEach((b) => bad.add(p + ': ' + b));
  });
  return { tokens: all, bad: [...bad].sort() };
}

/* Class-name construction the scanner cannot see (a colour utility assembled at run time). Returns
   [{ line, text }] for patterns such as  'bg-[#' + hex ,  "text-[#"+c ,  bg-[${x}] ,  border-[#${x}] . */
const DYNAMIC_RES = [
  /['"`](?:[a-z0-9-]+:)*(?:bg|text|border|ring|divide|accent|fill|stroke|from|to|via)-\[#?['"`]\s*\+/,
  /(?:bg|text|border|ring|divide|accent|fill|stroke|from|to|via)-\[#?\$\{/,
  /['"`](?:bg|text|border|ring|divide|accent|fill|stroke)-['"`]\s*\+/,
];
function dynamicClassSites(text) {
  const out = [];
  text.split(/\r?\n/).forEach((l, i) => { if (DYNAMIC_RES.some((r) => r.test(l))) out.push({ line: i + 1, text: l.trim().slice(0, 140) }); });
  return out;
}

/* Class sets (one per element / class string) for the static contrast checks.
   tag is '?' for class strings found in JS literals (element unknown).
   `${...}` expressions inside a class attribute contribute each string literal in
   them as an alternative (so both branches of a ternary are covered). */
function altSets(attr) {
  const exprs = [];
  const stat = attr.replace(/\$\{((?:[^{}]|\{[^{}]*\})*)\}/g, (_, e) => { exprs.push(e); return ' '; });
  let sets = [stat.split(/\s+/).filter(Boolean)];
  exprs.forEach((e) => {
    const lits = (e.match(/'([^']*)'|"([^"]*)"|`([^`]*)`/g) || []).map((s) => s.slice(1, -1).split(/\s+/).filter(Boolean));
    if (!lits.length) return;
    const next = [];
    sets.forEach((s) => { next.push(s); lits.forEach((l) => next.push(s.concat(l))); });
    sets = next.slice(0, 64);
  });
  return sets;
}
function scanSets(pages) {
  const out = [], seen = new Set();
  const push = (page, tag, classes) => {
    if (!classes.some((c) => TOKEN_RE.test(c))) return;
    const key = page + '|' + tag + '|' + classes.slice().sort().join(' ');
    if (seen.has(key)) return;
    seen.add(key); out.push({ page, tag, classes });
  };
  (pages || PAGES).forEach((p) => {
    const t = read(p);
    const re = /<([a-zA-Z][\w-]*)\b[^>]*?\bclass=(?:"([^"]*)"|'([^']*)')/g;
    let m;
    while ((m = re.exec(t))) altSets(m[2] || m[3] || '').forEach((cs) => push(p, m[1].toLowerCase(), cs));
    const lre = /(`[^`]*`|'[^'\n]*'|"[^"\n]*")/g;
    while ((m = lre.exec(t))) {
      if (/class=$/.test(t.slice(Math.max(0, m.index - 12), m.index))) continue;
      if (m[1].indexOf('<') >= 0) continue; // HTML templates are covered, element by element, by the class-attribute pass
      push(p, '?', m[1].slice(1, -1).replace(/\$\{[^}]*\}/g, ' ').split(/\s+/).filter(Boolean));
    }
  });
  return out;
}

/* Every class token a page uses (class attributes incl. both branches of ${...} ternaries, and
   classList.add/remove/toggle/contains arguments), minus the classes the page defines in its own
   <style>. Used to prove that a page which is not an @source of tailwind-input.css (billing.html)
   only relies on classes that tailwind.css compiled for other pages. */
function classTokens(page) {
  const t = read(page), toks = new Set();
  let m;
  const re = /\bclass=(?:"([^"]*)"|'([^']*)')/g;
  while ((m = re.exec(t))) altSets(m[1] || m[2] || '').forEach((cs) => cs.forEach((x) => toks.add(x)));
  const re2 = /classList\.(?:add|remove|toggle|contains)\(([^)]*)\)/g;
  while ((m = re2.exec(t))) (m[1].match(/'([^']*)'|"([^"]*)"/g) || []).forEach((q) => q.slice(1, -1).split(/\s+/).forEach((x) => x && toks.add(x)));
  const own = new Set();
  ((/<style>([\s\S]*?)<\/style>/.exec(t) || [, ''])[1]).replace(/\.([\w-]+)/g, (_, c) => own.add(c));
  return { tokens: toks, own };
}
function missingFromTailwind(page) {
  const c = classTokens(page);
  return [...c.tokens].filter((x) => !c.own.has(x) && twSelectors(x).length === 0).sort();
}

/* ---------------- tailwind.css lookup (to copy its exact selector shapes) ---------------- */
function parseCss(s, ctx, out) {
  let i = 0;
  while (i < s.length) {
    let j = i, inStr = null;
    while (j < s.length) {
      const c = s[j];
      if (c === '\\') j++; else if (inStr) { if (c === inStr) inStr = null; } else if (c === '"' || c === "'") inStr = c; else if (c === '{' || c === ';') break;
      j++;
    }
    if (j >= s.length) break;
    if (s[j] === ';') { i = j + 1; continue; }
    const head = s.slice(i, j).trim();
    let d = 1, k = j + 1; inStr = null;
    while (k < s.length && d > 0) {
      const c = s[k];
      if (c === '\\') k++; else if (inStr) { if (c === inStr) inStr = null; } else if (c === '"' || c === "'") inStr = c; else if (c === '{') d++; else if (c === '}') d--;
      k++;
    }
    const body = s.slice(j + 1, k - 1);
    if (head.startsWith('@')) {
      if (/^@(layer|media|supports)/.test(head) && body.includes('{')) parseCss(body, ctx.concat(head), out);
      else out.push({ sel: head, body, ctx });
    } else out.push({ sel: head, body, ctx });
    i = k;
  }
}
let _tw = null;
function tailwindRules() {
  if (_tw) return _tw;
  const out = [];
  parseCss(read('tailwind.css'), [], out);
  _tw = out.filter((r) => r.ctx.includes('@layer utilities') && !r.sel.startsWith('@'));
  return _tw;
}
const esc = (cls) => cls.replace(/[^A-Za-z0-9_-]/g, (c) => '\\' + c);
/* Tokens whose :hover state index.html's applyTheme() overrides with a tenant colour (derived from its real
   pushes, never by hand). applyTheme's :hover rules are NOT gated by (hover:hover), so on touch devices a
   tapped element keeps the tenant hover colour; the matching dark rule must therefore be UNGATED too or a
   tenant colour leaks into dark. Returns a Set of class tokens such as "hover:bg-[#CBF052]". */
function applyThemeHoverTokens() {
  const t = read('index.html');
  const baseM = /const _themeBaseHex = (\{[\s\S]*?\});/.exec(t);
  if (!baseM) return new Set();
  const base = new Function('return ' + baseM[1])();
  const start = t.indexOf('function applyTheme(){');
  const body = t.slice(start, t.indexOf('\napplyTheme();', start));
  const out = new Set();
  body.replace(/push\(`([^`]*)`,\s*'([^']+)',\s*t\.(\w+)\)/g, (_, tpl) => {
    const sel = new Function('base', 'esc', 'return `' + tpl + '`')(base, (h) => h.replace('#', '\\#'));
    if (/:hover$/.test(sel)) out.add(sel.replace(/:hover$/, '').replace(/\\(.)/g, '$1'));
    return '';
  });
  return out;
}
/* [{ sel, media }] for a class token; [] if tailwind.css never compiled it */
function twSelectors(token) {
  const dot = '.' + esc(token);
  const found = new Map();
  tailwindRules().forEach((r) => {
    // the class must be followed by a non-name character (or end) so bg-x does not match bg-x/10
    const idx = r.sel.indexOf(dot);
    if (idx < 0) return;
    const after = r.sel.charAt(idx + dot.length);
    if (after && /[A-Za-z0-9_\\-]/.test(after)) return;
    if (r.sel.indexOf(dot, idx + 1) >= 0 && /^:where\(/.test(r.sel)) { /* divide shape handled below */ }
    const media = r.ctx.filter((c) => c.startsWith('@media')).map((c) => c.slice(7).trim());
    found.set(r.sel + '|' + media.join(','), { sel: r.sel, media: media.join(' and ') || null });
  });
  return [...found.values()];
}

/* ---------------- specificity (limited grammar, used for ordering and by the cascade test) ---------------- */
function specificity(sel) {
  function parts(s) { // split on top-level commas
    const out = []; let d = 0, cur = '';
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (c === '\\') { cur += c + (s[i + 1] || ''); i++; continue; }
      if (c === '(' || c === '[') d++; if (c === ')' || c === ']') d--;
      if (c === ',' && d === 0) { out.push(cur); cur = ''; } else cur += c;
    }
    out.push(cur); return out;
  }
  function one(s) {
    let a = 0, b = 0, c = 0, i = 0;
    while (i < s.length) {
      const ch = s[i];
      if (ch === '\\') { i += 2; continue; }
      if (ch === '#') { a++; i++; while (i < s.length && /[\w-]/.test(s[i])) i++; continue; }
      if (ch === '.') { b++; i++; while (i < s.length && (/[\w-]/.test(s[i]) || s[i] === '\\')) i += s[i] === '\\' ? 2 : 1; continue; }
      if (ch === '[') { b++; let d = 1; i++; while (i < s.length && d) { if (s[i] === '[') d++; else if (s[i] === ']') d--; i++; } continue; }
      if (ch === ':') {
        if (s[i + 1] === ':') { c++; i += 2; while (i < s.length && /[\w-]/.test(s[i])) i++; continue; }
        i++; let name = ''; while (i < s.length && /[\w-]/.test(s[i])) name += s[i++];
        if (s[i] === '(') {
          let d = 1, j = i + 1; while (j < s.length && d) { if (s[j] === '(') d++; else if (s[j] === ')') d--; j++; }
          const inner = s.slice(i + 1, j - 1); i = j;
          if (name === 'where') continue;
          if (name === 'is' || name === 'not' || name === 'has') { const best = parts(inner).map(one).sort(cmp).pop() || [0, 0, 0]; a += best[0]; b += best[1]; c += best[2]; continue; }
          b++; continue;
        }
        b++; continue;
      }
      if (/[A-Za-z]/.test(ch)) { c++; while (i < s.length && /[\w-]/.test(s[i])) i++; continue; }
      i++;
    }
    return [a, b, c];
  }
  return parts(sel).map((p) => one(p.replace(/[>+~]/g, ' '))).sort(cmp).pop();
}
function cmp(x, y) { return x[0] - y[0] || x[1] - y[1] || x[2] - y[2]; }

/* ---------------- map + rule building ---------------- */
function loadMap() { return JSON.parse(read('theme-tw-map.json')); }
const asObj = (e) => (typeof e === 'string' ? { value: e } : e);

function stateOf(variants) {
  if (!variants.length) return 'base';
  const v = variants.join(':');
  return v; // hover, focus, selection, placeholder, file, peer-checked, peer-checked:after, after, ...
}

/* Structured rules; each carries enough info for the static resolver (resolveDark). */
const tiers_ = (of) => (of.tiers || []).map(String);
function buildRules(map) {
  const UNGATED_HOVER = applyThemeHoverTokens();
  const rules = [];
  const add = (r) => { r.spec = specificity(r.sel); rules.push(r); };
  const errors = [];
  Object.keys(map.map).sort().forEach((token) => {
    const p = parseToken(token);
    if (!p) { errors.push('map key is not a colour utility: ' + token); return; }
    const e = asObj(map.map[token]);
    const prop = kindProp(p.kind);
    if (!prop) { errors.push('no property for kind ' + p.kind + ' (' + token + ')'); return; }
    const decls = [[prop, e.value]].concat(Object.entries(e.also || {}));
    const state = stateOf(p.variants);
    if (p.kind === 'divide') {
      const c = '.' + esc(token);
      ['> :not(:last-child)', '> :not([hidden]) ~ :not([hidden])'].forEach((tail) => add({ token, state: 'divide', req: [token], tags: null, media: null, sel: SCOPE + ' ' + c + ' ' + tail, decls }));
      return;
    }
    const sels = twSelectors(token);
    if (!sels.length) { errors.push('not compiled in tailwind.css: ' + token); return; }
    sels.forEach((s) => add({ token, state, req: [token], tags: null, media: UNGATED_HOVER.has(token) ? null : s.media, sel: SCOPE + ' ' + s.sel, decls }));
    if (e.tags) {
      if (p.variants.length) { errors.push('tags only apply to variant-less tokens: ' + token); return; }
      Object.keys(e.tags).sort().forEach((tagList) => {
        const tags = tagList.split(',').map((x) => x.trim());
        const val = e.tags[tagList];
        add({ token, state: 'base', req: [token], tags, media: null, sel: tags.map((t) => SCOPE + ' ' + t + '.' + esc(token)).join(','), decls: [[prop, val]].concat(Object.entries((e.tagAlso && e.tagAlso[tagList]) || {})) });
      });
    }
  });
  (map.compounds || []).forEach((c) => {
    const tags = c.tag ? c.tag.split(',').map((x) => x.trim()) : null;
    const cls = c.when.map((w) => '.' + esc(w)).join('');
    add({ token: c.id, compound: true, state: 'base', req: c.when, tags, media: null, sel: (tags ? tags : ['']).map((t) => SCOPE + ' ' + t + cls).join(','), decls: Object.entries(c.decls) });
  });
  (map.descendants || []).forEach((d) => {
    const tags = d.within.tag.split(',').map((x) => x.trim());
    const anc = d.within.classes.map((w) => '.' + esc(w)).join('');
    const sels = [];
    tags.forEach((t) => d.target.forEach((tg) => sels.push(SCOPE + ' ' + t + anc + ' .' + esc(tg))));
    add({ token: d.id, descendant: true, state: 'descendant', req: d.target, within: d.within, tags: null, media: null, sel: sels.join(','), decls: Object.entries(d.decls) });
  });
  /* Phase 3c: dark-only opacity FLOOR for low-opacity text tiers (opacity-30/40/45/50/55 -> floor).
     Exempt kinds are excluded in the selector itself (tags, classes, disabled controls). */
  const of = map.opacityFloor;
  if (of) {
    const val = String(of.floor).replace(/^0\./, '.');
    const notSel = (of.exemptTags || []).map((t) => ':not(' + t + ')').concat((of.exemptClasses || []).map((c) => ':not(.' + esc(c) + ')'), (of.exemptStates || []).map((s) => ':not(' + s + ')')).join('');
    (of.tiers || []).forEach((t) => add({ token: 'opacity-' + t, opacity: true, state: 'opacity', req: ['opacity-' + t], tags: null, media: null, sel: SCOPE + ' .opacity-' + t + notSel, decls: [['opacity', val]] }));
    Object.keys(of.inline || {}).sort().forEach((k) => add({ token: 'inline:' + k, opacity: true, state: 'opacity-inline', req: [], tags: null, media: null, sel: SCOPE + ' :where([style*="' + k + '"])', decls: [['opacity', val]] }));
    /* Nested opacity multiplies: a floored (or passing) opacity utility INSIDE another opacity utility dims twice (.6 x .6 = .36).
       In dark the ancestor already sits at >= its tier (floored to .6 or a passing 0.6-0.9), so the descendant is set to 1. */
    if (of.nested) {
      const all = (of.tiers || []).concat((of.pass || []).filter((n) => +n < 100)).map(String);
      const anc = ':is(' + all.map((n) => '.opacity-' + n).join(',') + ')';
      all.forEach((n) => add({ token: 'nested-opacity-' + n, opacity: true, state: 'opacity-nested', req: ['opacity-' + n], tags: null, media: null, sel: SCOPE + ' ' + anc + ' .opacity-' + n + notSel, decls: [['opacity', '1']] }));
    }
    /* tier + hover:opacity-NN pairs that really occur: restore the hover value above the floor (same selector + the variant, so it out-ranks it) */
    Object.keys(of.hoverRestore || {}).sort().forEach((pair) => {
      const [tier, variant] = pair.split('+'), vm = /opacity-(\d+)$/.exec(variant), sels = twSelectors(variant);
      if (!/^hover:opacity-\d+$/.test(variant) || !vm || !tiers_(of).includes(tier.replace('opacity-', ''))) { errors.push('bad hoverRestore pair: ' + pair); return; }
      if (!sels.length) { errors.push('hoverRestore variant not compiled in tailwind.css: ' + variant); return; }
      sels.forEach((s) => add({ token: pair, opacity: true, state: 'opacity-hover', req: [tier, variant], tags: null, media: s.media, sel: SCOPE + ' .' + esc(tier) + notSel + s.sel, decls: [['opacity', String(+vm[1] / 100).replace(/^0\./, '.')]] }));
    });
  }
  return { rules, errors };
}

function order(rules) {
  return rules.map((r, i) => [r, i]).sort((x, y) => (x[0].media || '').localeCompare(y[0].media || '') || cmp(x[0].spec, y[0].spec) || (x[0].sel < y[0].sel ? -1 : x[0].sel > y[0].sel ? 1 : 0) || x[1] - y[1]).map((x) => x[0]);
}
const ruleText = (r) => r.sel + '{' + r.decls.map(([p, v]) => p + ':' + v + '!important').join(';') + '}';

function render(rules) {
  const sorted = order(rules);
  const base = sorted.filter((r) => !r.media), byMedia = {};
  sorted.filter((r) => r.media).forEach((r) => { (byMedia[r.media] = byMedia[r.media] || []).push(r); });
  const lines = [BEGIN, NOTE, '@media screen{'];
  base.forEach((r) => lines.push(ruleText(r)));
  Object.keys(byMedia).sort().forEach((m) => { lines.push('@media ' + m + '{'); byMedia[m].forEach((r) => lines.push(ruleText(r))); lines.push('}'); });
  lines.push('}', END);
  return lines.join('\n');
}

/* ---------------- validation of map vs scan ---------------- */
/* ---------------- opacity classification (Phase 3c) ---------------- */
const OPACITY_TOKEN_RE = /(?:^|[\s"'`.(])((?:[a-z0-9-]+:)*)opacity-(\d+|\[[^\]\s]+\])(?=$|[\s"'`,;:)])/g;
const stripStyleBlocks = (t) => t.replace(/<style>[\s\S]*?<\/style>/g, ' ');
/* a hover/focus/active-style variant of opacity: the dark floor is !important and would silently beat it */
const TRAP_VARIANT_RE = /^(?:[a-z0-9-]+:)*(?:hover|focus|active|group-hover|group-focus|focus-within|focus-visible|peer-hover|peer-focus)(?::[a-z0-9-]+)*:opacity-/;
function floorTrapSets(text, tiers) {
  const out = [];
  const tierRe = new RegExp('^opacity-(' + (tiers || []).join('|') + ')$');
  const test = (toks, line) => { const ts = toks.filter((c) => tierRe.test(c)), vs = toks.filter((c) => TRAP_VARIANT_RE.test(c)); if (ts.length && vs.length) out.push({ line, classes: ts.concat(vs), pairs: [].concat.apply([], ts.map((t) => vs.map((v) => t + '+' + v))) }); };
  let m;
  const re = /\bclass=(?:"([^"]*)"|'([^']*)')/g;
  while ((m = re.exec(text))) altSets(m[1] || m[2] || '').forEach((cs) => test(cs, text.slice(0, m.index).split('\n').length));
  const lre = /(`[^`]*`|'[^'\n]*'|"[^"\n]*")/g;
  while ((m = lre.exec(text))) {
    if (m[1].indexOf('<') >= 0) continue; // HTML templates are covered, attribute by attribute, above
    if (/class=$/.test(text.slice(Math.max(0, m.index - 6), m.index))) continue; // the attribute pass already handled it
    test(m[1].slice(1, -1).replace(/\$\{[^}]*\}/g, ' ').split(/\s+/).filter(Boolean), text.slice(0, m.index).split('\n').length);
  }
  return out;
}
/* Every inline opacity literal (outside page <style> blocks). `covered` = a dark attribute rule matches it:
   the rules are [style*="opacity:0.5"] / [style*="opacity:0.4"], so only the exact form `opacity:` + a value that
   starts with one of the keys is covered (supersets such as opacity:0.55 / 0.45 / 0.50 are intentionally lifted too).
   Forms the selectors cannot match (space after the colon, no leading zero, percentages) are reported as uncovered. */
function inlineOpacityLiterals(text, of) {
  const body = stripStyleBlocks(text), floor = (of && of.floor) || 0.6, keys = Object.keys((of && of.inline) || {});
  const out = [];
  const re = /(?<![\w-])opacity(\s*:\s*)([^;"'`}<>\s]+)/g;
  let m;
  while ((m = re.exec(body))) {
    const raw = m[2], pct = /%$/.test(raw), v = pct ? parseFloat(raw) / 100 : parseFloat(raw);
    if (!(v < floor)) continue;
    const key = 'opacity:' + raw;
    const form = m[1] !== ':' ? 'whitespace' : pct ? 'percent' : /^\./.test(raw) ? 'no-leading-zero' : 'ok';
    out.push({ raw: 'opacity' + m[1] + raw, key, value: v, form, covered: (form === 'ok' && keys.some((k) => key.startsWith(k))) || !!(of.exemptInline || {})[key] });
  }
  return out;
}
/* every opacity utility / inline opacity literal on the pages, with its classification state */
function opacityScan(pages) {
  const map = loadMap(), of = map.opacityFloor || {}, found = new Map(), issues = [];
  const tiers = new Set(of.tiers || []), pass = new Set(of.pass || []);
  (pages || PAGES).forEach((p) => {
    const text = read(p);
    let m;
    OPACITY_TOKEN_RE.lastIndex = 0;
    while ((m = OPACITY_TOKEN_RE.exec(text))) {
      const variant = m[1].replace(/:$/, ''), n = m[2], tok = (m[1] || '') + 'opacity-' + n;
      const e = found.get(tok) || {}; e[p] = (e[p] || 0) + 1; found.set(tok, e);
      let kind = null;
      if (variant) kind = (of.variantAllow || {})[tok] ? 'variant' : null;
      else if (tiers.has(n)) kind = 'tier';
      else if (pass.has(n)) kind = 'pass';
      else if ((of.exemptArbitrary || {})[tok]) kind = 'exempt-arbitrary';
      if (!kind) issues.push(p + ': unclassified opacity utility ' + tok + ' (add it to opacityFloor tiers / pass / variantAllow / exemptArbitrary in theme-tw-map.json)');
    }
    floorTrapSets(text, of.tiers).filter((s) => s.pairs.some((pr) => !(of.hoverRestore || {})[pr])).forEach((s) => issues.push(p + ':' + s.line + ': floored tier + hover/focus/active opacity variant on one element (' + s.classes.join(' ') + '): the !important dark floor would silently kill the variant (list the pair in opacityFloor.hoverRestore to emit a restoring rule)'));
    inlineOpacityLiterals(text, of).forEach((l) => { if (!l.covered) issues.push(p + ': inline opacity below the floor not covered by a dark rule (' + l.raw + ', form: ' + l.form + '; rules only match "opacity:" + a value starting 0.5 / 0.4)'); });
    const body = stripStyleBlocks(text);
    (body.match(/(?<![\w])(?:fill|stroke|stop|flood|lighting)-opacity\s*[:=]\s*["']?[^;"'\s>]+/g) || []).forEach((x) => {
      const v = parseFloat(/[:=]\s*["']?([^;"'\s>]+)/.exec(x)[1]);
      if (v < (of.floor || 0.6)) issues.push(p + ': ' + x + ' is below the floor and contains the substring "opacity:" that the inline dark rules match -- unsupported form');
    });
    if (/\.style\.opacity\s*=|setProperty\(\s*['"]opacity['"]/.test(body)) issues.push(p + ': JS sets element.style.opacity (unclassified)');
  });
  return { found, issues };
}


function analyse(pages) {
  const map = loadMap();
  const scan = scanAll(pages);
  const mapped = new Set(Object.keys(map.map)), allowed = new Set(Object.keys(map.allow || {}));
  const both = [...mapped].filter((t) => allowed.has(t));
  const unmapped = [...scan.tokens.keys()].filter((t) => !mapped.has(t) && !allowed.has(t)).sort();
  const stale = [...mapped, ...allowed].filter((t) => !scan.tokens.has(t)).sort();
  const built = buildRules(map);
  const errors = built.errors.slice();
  both.forEach((t) => errors.push('both mapped and allow-listed: ' + t));
  (map.compounds || []).forEach((c) => c.when.forEach((w) => { /* plain classes are allowed; colour tokens must be real */ }));
  scan.bad.forEach((b) => errors.push('unsupported colour utility: ' + b));
  const opa = opacityScan(pages);
  opa.issues.forEach((x) => errors.push(x));
  const dynamic = [];
  (pages || PAGES).forEach((p) => dynamicClassSites(read(p)).forEach((d) => dynamic.push(p + ':' + d.line + ' ' + d.text)));
  return { map, scan, unmapped, stale, errors, dynamic, opacity: opa, rules: built.rules, block: render(built.rules) };
}

/* ---------------- static resolver (used by the contrast test) ---------------- */
/* Which dark value does `prop` take for an element with these classes in `state`?
   Tokens carrying `hover:` etc. only apply in that state. Returns a CSS value
   string, or null if no dark rule touches the property (the light value stays). */
function resolveDark(rules, classes, tag, state, prop) {
  const set = new Set(classes);
  let win = null;
  order(rules).forEach((r) => {
    if (r.media && !/hover/.test(r.media)) return;
    if (r.state === 'descendant' || /^(selection|placeholder|file|after|peer)/.test(r.state)) return;
    if (r.state !== 'base' && r.state !== 'divide' && r.state !== state) return;
    if (r.state === 'divide') return;
    if (!r.req.every((c) => set.has(c))) return;
    if (r.tags && !r.tags.includes(tag)) return;
    const d = r.decls.find(([p]) => p === prop);
    if (d) win = d[1];
  });
  return win;
}

/* ---------------- theme.css block I/O ---------------- */
function currentBlock(css) {
  const a = css.indexOf(BEGIN), b = css.indexOf(END);
  if (a < 0 || b < 0) return null;
  return css.slice(a, b + END.length);
}
function spliceBlock(css, block) {
  const a = css.indexOf(BEGIN), b = css.indexOf(END);
  if (a >= 0 && b >= 0) return css.slice(0, a) + block + css.slice(b + END.length);
  const anchor = css.indexOf('/* Theme toggle:');
  if (anchor < 0) throw new Error('theme.css: no "/* Theme toggle:" anchor to insert the generated block before');
  return css.slice(0, anchor) + block + '\n\n' + css.slice(anchor);
}

function main(argv) {
  const check = argv.includes('--check');
  const a = analyse();
  const out = (s) => process.stdout.write(s + '\n');
  if (a.errors.length) { out('ERRORS:\n  ' + a.errors.join('\n  ')); return 2; }
  if (a.unmapped.length) { out('Unmapped colour utilities (add each to theme-tw-map.json "map" or "allow"):\n  ' + a.unmapped.join('\n  ')); return 2; }
  if (a.dynamic.length) {
    out('WARNING: class names built at run time (the scan cannot see them; map their tokens by hand or restructure):\n  ' + a.dynamic.join('\n  '));
    if (check) return 2;
  }
  if (a.stale.length) out('note: map/allow entries no longer used by any scanned page:\n  ' + a.stale.join('\n  '));
  const css = read('theme.css'), cur = currentBlock(css);
  if (check) {
    if (cur === a.block) { out('theme-tw: theme.css generated block is up to date (' + a.rules.length + ' rules, ' + Buffer.byteLength(a.block) + ' bytes)'); return 0; }
    out('theme-tw: theme.css generated block is STALE -- run: node scripts/gen-theme-tw.js'); return 1;
  }
  fs.writeFileSync(path.join(ROOT, 'theme.css'), spliceBlock(css, a.block));
  out('theme-tw: wrote ' + a.rules.length + ' rules (' + Buffer.byteLength(a.block) + ' bytes) for ' + a.scan.tokens.size + ' scanned tokens (' + Object.keys(a.map.map).length + ' mapped, ' + Object.keys(a.map.allow || {}).length + ' allow-listed)');
  return 0;
}

module.exports = { floorTrapSets, inlineOpacityLiterals, altSets, opacityScan, applyThemeHoverTokens, dynamicClassSites, classTokens, missingFromTailwind, PAGES, BEGIN, END, SCOPE, parseToken, kindProp, scanAll, scanPage, scanSets, tokensIn, twSelectors, specificity, buildRules, render, order, analyse, resolveDark, currentBlock, spliceBlock, loadMap, esc, TOKEN_RE };
if (require.main === module) process.exit(main(process.argv.slice(2)));
