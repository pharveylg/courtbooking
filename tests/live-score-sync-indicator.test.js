/* Live-score "Not syncing" indicator (court-scoreboard.js's live() push +
   tournament.html/tournament-admin.html's flush() throttlers). These used to
   swallow every push failure silently (explicitly commented "best effort").
   The fix adds an informational-only signal for the SCORER after a few
   consecutive failures, never blocking local scoring.

   court-scoreboard.js is DOM-heavy (no pure-logic export, unlike
   next-open.js/queue-engine.js), so this is a source-level wiring check --
   same convention as tests/theme-tokens.test.js and
   tests/queue-standalone.test.js's own court-scoreboard.js assertions --
   rather than a full functional simulation.

   Usage: node tests/live-score-sync-indicator.test.js */
const fs = require('fs');
const path = require('path');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

let passed = 0, failed = 0;
function check(name, ok, detail) { if (ok) passed++; else { failed++; console.log(`  FAIL: ${name}${detail ? ' -- ' + detail : ''}`); } }
const section = (t) => console.log(`\n${t}`);

const board = read('court-scoreboard.js');
const tournament = read('tournament.html');
const tournamentAdmin = read('tournament-admin.html');

section('court-scoreboard.js -- consecutive-failure counter + banner, never blocks local scoring');

check('tracks consecutive failures with a named threshold', /LIVE_SYNC_FAIL_THRESHOLD\s*=\s*3/.test(board));
check('reportLiveSync(ok) resets the counter on success, increments on failure', /function reportLiveSync\(ok\)/.test(board) && /liveSyncFailures = ok \? 0 : liveSyncFailures \+ 1/.test(board));
check('reportLiveSync is exposed from open()\'s return value for callers to drive', /return \{ close:.*getState:.*reportLiveSync \};/.test(board));
check('shows a small, non-alarming banner once the threshold is hit, reusing the existing rb-banner style (not a new alarming UI)', /liveSyncBad.*rb-banner.*Not syncing/.test(board.replace(/\s+/g, ' ')));
check('the banner copy makes clear local scoring still works -- purely informational, never a blocker', /Not syncing.*Scoring here still works/.test(board.replace(/\s+/g, ' ')));
check('finish() never shows the raw ex.message -- always the friendly template message', /errBox\.textContent = 'Could not save\. Check your connection and try again\.';/.test(board) && !/errBox\.textContent = \(e && e\.message\)/.test(board));

section('tournament.html / tournament-admin.html -- flush() reports each push\'s outcome back to the board');

check('tournament.html captures the CourtBoard handle and reports success/failure from flush()', /board = CourtBoard\.open\(/.test(tournament) && /board && board\.reportLiveSync\(true\)/.test(tournament) && /board && board\.reportLiveSync\(false\)/.test(tournament));
check('tournament-admin.html does the same', /board = CourtBoard\.open\(/.test(tournamentAdmin) && /board && board\.reportLiveSync\(true\)/.test(tournamentAdmin) && /board && board\.reportLiveSync\(false\)/.test(tournamentAdmin));

console.log(`\n=== LIVE-SCORE SYNC INDICATOR (wiring): ${passed}/${passed + failed} passed ===`);
process.exit(failed === 0 ? 0 : 1);
