/* Configurable overall-winner ranking (ranking order + minimum games to
   qualify) and the "download stats as PDF" link shown when a queue ends,
   in both queue modules (index.html's facility queue, queue.html's
   standalone tool). The pure engine logic (QueueEngine.normalizeRankingOrder,
   computeStandings/computeOverallWinner reading session.winnerConfig,
   buildStatsReport) is covered in queue-engine.test.js; this file checks
   each page actually wires it up: the setup/creation form exposes both
   settings and writes them into the new session's winnerConfig, and the
   winner screen offers a PDF download built from a stats snapshot taken
   before the session is wiped. Usage: node tests/queue-winner-pdf.test.js */
const fs = require('fs');
const path = require('path');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const indexHtml = read('index.html'), queueHtml = read('queue.html');

let passed = 0, failed = 0;
function check(name, ok, detail) { if (ok) passed++; else { failed++; console.log(`  FAIL: ${name}${detail ? ' -- ' + detail : ''}`); } }
const section = (t) => console.log(`\n${t}`);

for (const [name, html] of [['index.html', indexHtml], ['queue.html', queueHtml]]) {
  section(`${name} -- setup form exposes the configurable winner settings`);
  check('a reorderable ranking-order list exists, rendered from QueueEngine.DEFAULT_RANKING_ORDER/RANKING_CRITERIA_LABELS (not hardcoded labels)', /DEFAULT_RANKING_ORDER/.test(html) && /RANKING_CRITERIA_LABELS/.test(html));
  check('up/down reorder buttons mutate a JS-tracked order array, not the DOM order alone', /data-dir="up"/.test(html) && /data-dir="down"/.test(html) && /swapIdx/.test(html));
  check('a "minimum games to qualify" number input exists, separate from the ranking order', /Min\.? games to qualify/.test(html));

  section(`${name} -- the new session is given a winnerConfig built from those fields`);
  check('the created/started session carries winnerConfig.minGames and winnerConfig.rankingOrder', /winnerConfig:\s*\{[\s\S]{0,150}?minGames:[\s\S]{0,150}?rankingOrder:/.test(html));
  check('an unset/zero minGames is stored as null, not 0 or NaN (so QueueEngine falls back to its automatic default)', /minGamesVal\) && minGamesVal > 0 \? minGamesVal : null/.test(html));

  section(`${name} -- "download stats as PDF" is offered on the winner screen, from data captured before the session is wiped`);
  check('a stats snapshot is captured via QueueEngine.buildStatsReport at the same moment the winner is computed, before the session/queue data is cleared', /buildStatsReport\(session\)/.test(html));
  check('a PDF/print button exists on the winner screen', /Download stats \(PDF\)/.test(html));
  check('clicking it opens a new window and calls print() on it -- the same print-to-PDF pattern already used elsewhere in this app, no PDF library', /window\.open\(/.test(html) && /\.print\(\)/.test(html));
  check('the generated report includes the standings\/players\/pairings\/head-to-head\/match-history sections it was built from', /report\.standings/.test(html) && /report\.players/.test(html) && /report\.teams/.test(html) && /report\.headToHead/.test(html) && /report\.matches/.test(html));
}

section('index.html -- the new engine exports are destructured from QueueEngine, not referenced ad hoc');
check('buildStatsReport, DEFAULT_RANKING_ORDER, RANKING_CRITERIA_LABELS are in the top-of-file destructure', /computeOverallWinner, buildStatsReport,/.test(indexHtml) && /DEFAULT_RANKING_ORDER, RANKING_CRITERIA_LABELS,/.test(indexHtml));

section('index.html -- both session-ending actions (Reset, Delete) capture the stats snapshot before wiping');
check('Reset Session captures buildStatsReport before clearing waiting/activeMatch/matches', /qResetSessionBtn[\s\S]{0,400}?lastEndedQueueStats = buildStatsReport\(session\)[\s\S]{0,200}?session\.waiting = \[\]/.test(indexHtml));
check('Delete Session captures buildStatsReport before the session is filtered out', /qDeleteSessionBtn[\s\S]{0,400}?lastEndedQueueStats = buildStatsReport\(session\)[\s\S]{0,200}?filtered = sessions\.filter/.test(indexHtml));

section('queue.html -- ending the queue captures the stats snapshot before sessionStorage is cleared');
check('endQueueBtn captures buildStatsReport before clear()', /endQueueBtn[\s\S]{0,400}?lastEndedStatsReport = session \? QueueEngine\.buildStatsReport\(session\) : null[\s\S]{0,200}?clear\(\)/.test(queueHtml));

console.log(`\n=== QUEUE WINNER CONFIG + PDF: ${passed}/${passed + failed} passed ===`);
process.exit(failed === 0 ? 0 : 1);
