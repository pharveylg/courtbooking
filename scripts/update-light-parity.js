#!/usr/bin/env node
/* update-light-parity.js -- regenerates tests/fixtures/light-parity.json.

   The fixture pins what makes light mode byte-identical on the four Phase 3a pages
   (store / tournament / gallery / billing): per page
     - bodySha256        sha256 of the markup from `<body` onward, CRLF normalised to LF
     - headBaseSha256    sha256 of the <head> with the 5 dark-mode wiring lines removed
     - classTokens       multiset of class tokens (token -> count) and its sha256
   tests/theme-tw-wiring.test.js fails when any of these drift. Run this script ONLY when a page body
   or class list was changed on purpose (i.e. a later phase edits classes/markup), then review the
   fixture diff and commit it together with the page change:

       node scripts/update-light-parity.js

   `--verify-against <git-ref>` additionally refuses to write unless every body and class multiset is
   identical to that ref (used once to seed the fixture from a tree verified identical to HEAD). */
'use strict';
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const crypto = require('crypto');
const T = require('../theme.js');

const ROOT = path.join(__dirname, '..');
const PAGES = ['store.html', 'tournament.html', 'gallery.html', 'billing.html', 'tournament-admin.html'];
const WIRING = ['<meta name="theme-color" content="#FFFBF5"/>', '<script>' + T.BOOTSTRAP + '</script>', '<link rel="stylesheet" href="theme.css"/>', '<script src="/theme.js"></script>', '<script>CBTheme.init();</script>'];
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const norm = (s) => s.replace(/\r\n/g, '\n');

function classTokens(html) {
  const m = {};
  (html.match(/\bclass=(?:"[^"]*"|'[^']*')/g) || []).forEach((a) => a.slice(a.indexOf('=') + 2, -1).split(/\s+/).filter(Boolean).forEach((t) => { m[t] = (m[t] || 0) + 1; }));
  const sorted = {};
  Object.keys(m).sort().forEach((k) => { sorted[k] = m[k]; });
  return sorted;
}
function describe(html) {
  const h = norm(html), b = h.indexOf('<body');
  if (b < 0) throw new Error('no <body');
  const head = h.slice(0, b), body = h.slice(b);
  const baseHead = head.split('\n').filter((l) => !WIRING.includes(l)).join('\n');
  const tokens = classTokens(h);
  return { bodySha256: sha(body), headBaseSha256: sha(baseHead), classTokensSha256: sha(JSON.stringify(tokens)), classTokenCount: Object.keys(tokens).length, classTokens: tokens };
}
/* ---- index.html (Phase 3b): its body DID change on purpose, so it is pinned by an ALLOWED DELTA, not by a
   byte-for-byte hash. The delta is: two header toggle buttons, one admin hint line, and a few JS colour
   literals replaced by theme tokens whose LIGHT value is the old literal. Reversing exactly that delta in the
   current body must give back the baseline body (sha256 recorded from git ref BASELINE_REF). */
const BASELINE_REF = '3d2eec1e3bd4cf11ebe193d22c2563dc823a5de8';
const SUBSTITUTIONS = [];
const ADDITION_RES = [];
function bodyOf(html) { const h = norm(html); return h.slice(h.indexOf('<body')); }
function reverseDelta(body, additions, substitutions) {
  let b = body;
  additions.forEach((a) => { if (b.split(a).length !== 2) throw new Error('addition not found exactly once: ' + a.slice(0, 60)); b = b.replace(a, () => ''); });
  substitutions.forEach((s) => { if (b.split(s.to).length - 1 !== s.count) throw new Error('substitution count mismatch: ' + s.to); b = b.split(s.to).join(s.from); });
  return b;
}
function describeIndex(currentHtml, baselineHtml) {
  const cur = bodyOf(currentHtml), base = bodyOf(baselineHtml);
  const additions = ADDITION_RES.map((re) => { const m = re.exec(cur); if (!m) throw new Error('allowed addition missing: ' + re); return m[0]; });
  const reversed = reverseDelta(cur, additions, SUBSTITUTIONS);
  if (reversed !== base) throw new Error('index.html body differs from ' + BASELINE_REF + ' by more than the allowed delta');
  const bt = classTokens(base), ct = classTokens(cur), delta = {};
  Object.keys(ct).forEach((t) => { if (ct[t] !== (bt[t] || 0)) delta[t] = ct[t] - (bt[t] || 0); });
  Object.keys(bt).forEach((t) => { if (!(t in ct)) delta[t] = -bt[t]; });
  const dh = describe(currentHtml), bh = describe(baselineHtml);
  if (dh.headBaseSha256 !== bh.headBaseSha256) throw new Error('index.html <head> differs from the baseline by more than the wiring lines');
  return { baselineRef: BASELINE_REF, baselineBodySha256: sha(base), headBaseSha256: bh.headBaseSha256, baselineClassTokens: bt, classTokenDelta: delta, additions, substitutions: SUBSTITUTIONS };
}

function build(readFn, baselineIndex) {
  const out = { _doc: 'Light-mode parity fixture for the Phase 3a pages. Regenerate deliberately: node scripts/update-light-parity.js (see its header and ARCHITECTURE.md).', pages: {} };
  PAGES.forEach((p) => { out.pages[p] = describe(readFn(p)); });
  if (baselineIndex !== undefined) out.index = describeIndex(readFn('index.html'), baselineIndex);
  return out;
}
module.exports = { describeIndex, reverseDelta, bodyOf, BASELINE_REF, PAGES, WIRING, describe, build, classTokens, norm, sha };

if (require.main === module) {
  const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
  const i = process.argv.indexOf('--verify-against');
  if (i > 0) {
    const ref = process.argv[i + 1];
    PAGES.forEach((p) => {
      const r = cp.spawnSync('git', ['show', ref + ':' + p], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
      if (r.status !== 0) throw new Error('git show failed for ' + p);
      const a = describe(r.stdout), b = describe(read(p));
      if (a.bodySha256 !== b.bodySha256 || a.headBaseSha256 !== b.headBaseSha256 || a.classTokensSha256 !== b.classTokensSha256) { console.error('REFUSING: ' + p + ' head/body/classes differ from ' + ref); process.exit(1); }
    });
    console.log('verified: bodies and class multisets identical to ' + process.argv[i + 1]);
  }
  fs.mkdirSync(path.join(ROOT, 'tests', 'fixtures'), { recursive: true });
  const bi = cp.spawnSync('git', ['show', BASELINE_REF + ':index.html'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (bi.status !== 0) throw new Error('git show ' + BASELINE_REF + ':index.html failed');
  fs.writeFileSync(path.join(ROOT, 'tests', 'fixtures', 'light-parity.json'), JSON.stringify(build(read, bi.stdout), null, 2) + '\n');
  console.log('wrote tests/fixtures/light-parity.json');
}
