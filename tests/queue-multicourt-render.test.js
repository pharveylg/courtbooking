/* Regression coverage for the multi-court queue dashboard DOM-rendering bug:
   submitting (or swapping, or serving-first on) ONE court used to trigger a
   full "wipe the whole court-cards container and rebuild every card from
   session data" render in both pages. Since a court's typed-but-not-yet-
   submitted score inputs are plain, transient DOM state -- never written
   into the session until Submit is clicked -- that blanket rebuild silently
   cleared whatever staff had typed into every OTHER court's inputs too.

   The real fix lives in:
     - queue-engine.js: recordMatchResult(session, court, ...) now also
       returns `affectedCourts`, the minimal list of court indices whose
       card actually changed (this court, plus any other court that was
       empty and got filled as a side effect) -- see
       tests/queue-engine.test.js for the pure-function coverage of that.
     - index.html: renderActiveMatchCourts(session, affectedCourts) and
       queue.html: renderActiveMatch(session, courts) -- passed a specific
       list of court indices, each now replaces ONLY those courts' existing
       DOM nodes in place (container.querySelector('[data-court="N"]') +
       replaceChild) instead of clearing and rebuilding the whole region.

   This file is a source-level wiring check (regex/text-presence over the
   actual page source), the same technique the rest of this suite's page
   tests use (see queue-match-edit.test.js, queue-standalone.test.js) --
   the DOM-survives-a-partial-render behavior itself was verified live in a
   real browser for the exact reported scenario (4 courts, type into all 4,
   submit court 1, courts 2-4 untouched); see QUEUE_MODULE.md.
   Usage: node tests/queue-multicourt-render.test.js */
const fs = require('fs');
const path = require('path');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const indexHtml = read('index.html'), queueHtml = read('queue.html');

let passed = 0, failed = 0;
function check(name, ok, detail) { if (ok) passed++; else { failed++; console.log(`  FAIL: ${name}${detail ? ' -- ' + detail : ''}`); } }
const section = (t) => console.log(`\n${t}`);

/* Extracts one `function name(args){ ... }` body by counting braces from the
   declaration's opening brace to its matching close -- robust to however
   deeply nested the body is (forEach callbacks, if-blocks, template
   literals with their own ${...} braces), unlike a "first closing brace"
   regex. Returns '' if the header isn't found. */
function fnBody(src, header) {
  const i = src.indexOf(header);
  if (i === -1) return '';
  // If `header` already ends with the function's own opening brace, that IS
  // the opening brace to balance from -- searching further forward for the
  // next '{' (e.g. the first nested one) would mispair entirely.
  const openIdx = header.trimEnd().endsWith('{') ? i + header.length - 1 : src.indexOf('{', i + header.length);
  if (openIdx === -1) return '';
  let depth = 0, j = openIdx;
  for (; j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}') { depth--; if (depth === 0) { j++; break; } }
  }
  return src.slice(i, j);
}

for (const [name, html] of [['index.html', indexHtml], ['queue.html', queueHtml]]) {
  const renderFn = name === 'index.html' ? 'renderActiveMatchCourts' : 'renderActiveMatch';
  const renderHeader = name === 'index.html'
    ? 'function renderActiveMatchCourts(session, affectedCourts) {'
    : 'function renderActiveMatch(session, courts){';
  // index.html does the per-card DOM patch inline inside renderActiveMatchCourts;
  // queue.html delegates it to a small mountCourtWrap(block, session, court)
  // helper (renderActiveMatch itself just decides full-rebuild vs which
  // specific courts to pass to it) -- check whichever function actually
  // contains the DOM-replace logic for each page.
  const mountHeader = name === 'index.html' ? null : 'function mountCourtWrap(block, session, court){';

  section(`${name} -- ${renderFn} takes an optional court list and only wipes the whole region when it's omitted`);
  const body = fnBody(html, renderHeader);
  const mountBody = mountHeader ? fnBody(html, mountHeader) : body;
  check(`${renderFn} declares the second (court-list) parameter`, body.length > 0, 'function header not found as expected');
  check('the blanket innerHTML wipe is now CONDITIONAL on no court list being given (not unconditional, like the old blanket-rebuild-on-every-action bug)', /if\s*\(\s*!(?:affectedCourts|courts)\s*\)\s*\{?[\s\S]{0,40}?\.innerHTML\s*=\s*''/.test(body));
  check('a given court list replaces each one\'s EXISTING DOM node in place (querySelector(\'[data-court="N"]\') + replaceChild), rather than rebuilding every card', mountBody.length > 0 && /querySelector\(`\[data-court="\$\{court\}"\]`\)/.test(mountBody) && /replaceChild\(/.test(mountBody));

  section(`${name} -- per-court "Match N" counter in the card header, derived from the shared engine (not reinvented per page), opposite the court label`);
  check('matchesFinishedOnCourt is called with the session and this specific court (QueueEngine.matchesFinishedOnCourt, destructured or namespaced)', /matchesFinishedOnCourt\(session, court\)/.test(html));
  check('the header row shows the match count as "Match N" (N = finished-on-this-court + 1)', /Match \$\{matchNum\}/.test(html));
  check('the header is a flex row (court name and the match count on opposite sides), not the old single court-name-only line', /justify-between/.test(body) || /class="court-header"/.test(html));
}

section('queue-engine.js -- matchesFinishedOnCourt is exported and used by both pages as the single source of truth for the per-court match count');
check('exported from the QueueEngine module', /matchesFinishedOnCourt,/.test(read('queue-engine.js')));
check('index.html destructures it from QueueEngine rather than reinventing a per-court counter', /matchesFinishedOnCourt,/.test(indexHtml));
check('queue.html calls QueueEngine.matchesFinishedOnCourt directly, same function as index.html', /QueueEngine\.matchesFinishedOnCourt\(session, court\)/.test(queueHtml));

section('index.html -- every per-court action handler redraws ONLY the affected court(s), never every court\'s card');
check('applyQueueSwap redraws just [court] on both the error path and the success path, never a blanket call', (() => {
  const b = fnBody(indexHtml, 'function applyQueueSwap(court, team, index, newName){');
  return b.length > 0 && (b.match(/renderActiveQueueDashboard\(\[court\]\)/g) || []).length === 2 && !/renderActiveQueueDashboard\(\)/.test(b);
})());
check('applyQueueTeamSwap redraws just [court] on both paths, never a blanket call', (() => {
  const b = fnBody(indexHtml, 'function applyQueueTeamSwap(court, side, newTeamId){');
  return b.length > 0 && (b.match(/renderActiveQueueDashboard\(\[court\]\)/g) || []).length === 2 && !/renderActiveQueueDashboard\(\)/.test(b);
})());
check('applyQueueFirstServer redraws just [court], never a blanket call', (() => {
  const b = fnBody(indexHtml, 'function applyQueueFirstServer(court, side){');
  return b.length > 0 && /renderActiveQueueDashboard\(\[court\]\)/.test(b) && !/renderActiveQueueDashboard\(\)/.test(b);
})());
check('onQueueSubmitScore redraws exactly result.affectedCourts (the engine\'s own minimal list -- this court, plus any other court filled as a side effect), never a blanket call', (() => {
  const b = fnBody(indexHtml, 'function onQueueSubmitScore(court){');
  return b.length > 0 && /renderActiveQueueDashboard\(result\.affectedCourts\)/.test(b) && !/renderActiveQueueDashboard\(\)/.test(b);
})());
check('a global, not-scoped-to-one-court action (removing a waiting player, which can free up ANY empty court) still does the full rebuild on purpose', /removeWaitingPlayer\(session, waitId, removeName\);[\s\S]{0,200}renderActiveQueueDashboard\(\);/.test(indexHtml));

section('queue.html -- every per-court action handler redraws ONLY the affected court(s), never every court\'s card');
check('applyServeFirst calls render([court]), not a blanket render()', (() => {
  const b = fnBody(queueHtml, 'function applyServeFirst(court, side){');
  return b.length > 0 && /render\(\[court\]\)/.test(b) && !/render\(\)/.test(b);
})());
check('applySwapPlayer calls render([court]), not a blanket render()', (() => {
  const b = fnBody(queueHtml, 'function applySwapPlayer(court, team, index, newName){');
  return b.length > 0 && /render\(\[court\]\)/.test(b) && !/render\(\)/.test(b);
})());
check('applySwapTeam calls render([court]), not a blanket render()', (() => {
  const b = fnBody(queueHtml, 'function applySwapTeam(court, side, newTeamId){');
  return b.length > 0 && /render\(\[court\]\)/.test(b) && !/render\(\)/.test(b);
})());
check('onSubmitScore calls render(result.affectedCourts), the engine\'s own minimal list, not a blanket render()', (() => {
  const b = fnBody(queueHtml, 'function onSubmitScore(court){');
  return b.length > 0 && /render\(result\.affectedCourts\)/.test(b) && !/render\(\)/.test(b);
})());
check('the global render() function forwards its optional court-list argument straight into renderActiveMatch, rather than always doing the full rebuild itself', /function render\(affectedCourts\)\{/.test(queueHtml) && /renderActiveMatch\(session, affectedCourts\)/.test(queueHtml));

console.log(`\n=== QUEUE MULTI-COURT RENDER (CROSS-COURT CLOBBER FIX): ${passed}/${passed + failed} passed ===`);
process.exit(failed === 0 ? 0 : 1);
