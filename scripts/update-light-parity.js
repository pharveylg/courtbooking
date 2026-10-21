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
   byte-for-byte hash. The delta (queue multi-court dashboard fix): renderActiveQueueDashboard/
   renderActiveMatchCourts now take an optional `affectedCourts` list so a single-court action (submit score,
   swap, serve-first) redraws only that court's card -- instead of wiping and rebuilding every court's card,
   which used to blow away whatever staff had typed into any OTHER court's still-unsubmitted score inputs --
   plus a new per-court "Match N" counter in each card's header (QueueEngine.matchesFinishedOnCourt). Each
   entry below is one contiguous changed region; reversing all of them in the current body must give back the
   baseline body (sha256 recorded from git ref BASELINE_REF) exactly. */
const BASELINE_REF = 'b3ac2f6';
const SUBSTITUTIONS = [
  {
    "from": "  pullRestedPlayers, checkAndFillActiveMatch, recordMatchResult, removeWaitingPlayer,\n  setFirstServer, swapActivePlayer, swapActiveTeam,",
    "to": "  pullRestedPlayers, checkAndFillActiveMatch, recordMatchResult, removeWaitingPlayer,\n  matchesFinishedOnCourt,\n  setFirstServer, swapActivePlayer, swapActiveTeam,",
    "count": 1
  },
  {
    "from": "function renderActiveQueueDashboard() {",
    "to": "function renderActiveQueueDashboard(affectedCourts) {",
    "count": 1
  },
  {
    "from": "  renderActiveMatchCourts(session);",
    "to": "  renderActiveMatchCourts(session, affectedCourts);",
    "count": 1
  },
  {
    "from": "   (for Timed Rotation) timer are fully independent of every other court's. */\nfunction renderActiveMatchCourts(session) {",
    "to": "   (for Timed Rotation) timer are fully independent of every other court's.\n   `affectedCourts`, when given, redraws only those specific court cards\n   (replacing each one's existing DOM node in place) instead of wiping and\n   rebuilding every card -- so a single-court action never touches any\n   OTHER court's still-unsubmitted score inputs. */\nfunction renderActiveMatchCourts(session, affectedCourts) {",
    "count": 1
  },
  {
    "from": "  container.innerHTML = '';\n  for (let court = 0; court < courtCount; court++) {\n    const m = session.activeMatches[court];",
    "to": "  if (!affectedCourts) container.innerHTML = '';\n  const courts = affectedCourts || Array.from({ length: courtCount }, (_, i) => i);\n  courts.forEach((court) => {\n    if (session.rule === 'timed_rotation') stopActiveTimer(court);\n    const m = session.activeMatches[court];",
    "count": 1
  },
  {
    "from": "    const courtLabel = courtCount > 1 ? `<div class=\"mono text-[10px] uppercase tracking-wider opacity-50 mb-2\">${escapeHtml(courtName)}</div>` : '';",
    "to": "    const matchNum = matchesFinishedOnCourt(session, court) + 1;\n    const courtLabel = `<div class=\"flex items-center justify-between mb-2\">\n        <span class=\"mono text-[10px] uppercase tracking-wider opacity-50\">${courtCount > 1 ? escapeHtml(courtName) : ''}</span>\n        <span class=\"mono text-[10px] uppercase tracking-wider opacity-50\">Match ${matchNum}</span>\n      </div>`;",
    "count": 1
  },
  {
    "from": "      </div>`;\n    container.appendChild(wrap);",
    "to": "      </div>`;\n    const existing = container.querySelector(`[data-court=\"${court}\"]`);\n    if (existing) container.replaceChild(wrap, existing); else container.appendChild(wrap);",
    "count": 1
  },
  {
    "from": "    if (session.rule === 'timed_rotation') initDashboardTimer(session, court);\n  }",
    "to": "    if (session.rule === 'timed_rotation') initDashboardTimer(session, court);\n  });",
    "count": 1
  },
  {
    "from": "if (r.error) { toast(r.error); renderActiveQueueDashboard(); return r; }",
    "to": "if (r.error) { toast(r.error); renderActiveQueueDashboard([court]); return r; }",
    "count": 2
  },
  {
    "from": "  renderActiveQueueDashboard();",
    "to": "  renderActiveQueueDashboard([court]);",
    "count": 3
  },
  {
    "from": "  renderActiveQueueDashboard();",
    "to": "  renderActiveQueueDashboard(result.affectedCourts);",
    "count": 1
  }
];
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
