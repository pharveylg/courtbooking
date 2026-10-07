/* The standalone Walk-in Queue tool: its own page, a homepage entry point,
   and sharing the rotation engine with the facility queue module instead of
   duplicating it. Usage: node tests/queue-standalone.test.js */
const fs = require('fs');
const path = require('path');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const queueHtml = read('queue.html'), pickerHtml = read('picker.html'), indexHtml = read('index.html');

let passed = 0, failed = 0;
function check(name, ok, detail) { if (ok) passed++; else { failed++; console.log(`  FAIL: ${name}${detail ? ' -- ' + detail : ''}`); } }
const section = (t) => console.log(`\n${t}`);

section('homepage entry point');
check('picker.html links to /queue.html from an always-visible card', /href="\/queue\.html" id="walkinQueueCard"/.test(pickerHtml));
check('the card sits outside the facility-load show/hide logic (not gridSection/continueSection/myMatchesSection)', !/walkinQueueSection[\s\S]{0,400}style="display:none"/.test(pickerHtml));
check('the card says what it is: no sign-in, not saved', /No sign-in, no facility[\s\S]{0,40}not saved/.test(pickerHtml));

section('fully standalone: no tenant, no PIN, no Firestore, no analytics');
check('no PIN field or check anywhere on the page', !/\bpin\b/i.test(queueHtml));
check('never touches Firestore (fbSave) or usage analytics (logUsageEvent)', !/fbSave\(/.test(queueHtml) && !/logUsageEvent\(/.test(queueHtml));
check('loads no tenant/client config script', !/client-config\.js|firebase-config\.js|firebasejs/.test(queueHtml));
check('loads the shared rotation engine and the live scoreboard, nothing tenant-specific', /<script src="\/rotation-pick\.js">/.test(queueHtml) && /<script src="\/queue-engine\.js">/.test(queueHtml) && /<script src="\/pickleball-scoring\.js">/.test(queueHtml) && /<script src="\/court-scoreboard\.js">/.test(queueHtml));

section('storage: sessionStorage for queue state, cleared with the tab');
check('reads and writes sessionStorage, never localStorage, for the queue itself', /sessionStorage\.(getItem|setItem|removeItem)\(KEY\)/.test(queueHtml) && !/localStorage\.(get|set)Item\(KEY\)/.test(queueHtml));
check('the page says plainly that it is lost when the tab closes', /lost when you close this tab or browser/.test(queueHtml));
check('the live scoreboard opens with a storageKey, so a refresh mid-game can resume', (() => {
  const i = queueHtml.indexOf('CourtBoard.open({');
  const call = queueHtml.slice(i, queueHtml.indexOf('});', i));
  return i > -1 && /^\s*storageKey\s*:\s*boardKeyFor\(m\.id\)/m.test(call);
})());
check('stray scoreboard keys are cleaned up on render, and fully on End Queue -- the one piece of state that\'s in localStorage never outlives this tool', /function cleanupBoardKeys\(/.test(queueHtml) && /cleanupBoardKeys\(session\.activeMatch \? session\.activeMatch\.id : null\)/.test(queueHtml) && /cleanupBoardKeys\(null\)/.test(queueHtml));

section('shares the rotation engine with the facility queue module -- no duplicate logic');
check('index.html pulls the rule engine from QueueEngine instead of defining its own copy', /\}\s*=\s*QueueEngine;/.test(indexHtml) && !/^function checkAndFillActiveMatch\(/m.test(indexHtml) && !/^function ensureTeam\(/m.test(indexHtml));
check('both index.html and queue.html call the same QueueEngine.recordMatchResult for scoring', /recordMatchResult\(session, scoreAVal, scoreBVal\)/.test(indexHtml) && /QueueEngine\.recordMatchResult\(session, scoreAVal, scoreBVal\)/.test(queueHtml));
check('both call the same QueueEngine.checkAndFillActiveMatch to fill the next match', /checkAndFillActiveMatch\(session\)/.test(indexHtml) && /QueueEngine\.checkAndFillActiveMatch\(session\)/.test(queueHtml));
check('both pages compute head-to-head with the same shared function, not two implementations', /computeHeadToHead\(session\)/.test(indexHtml) && /QueueEngine\.computeHeadToHead\(session\)/.test(queueHtml));

section('setup and dashboard present');
check('setup form: mode, rule, optional starting players', /id="setMode"/.test(queueHtml) && /id="setRule"/.test(queueHtml) && /id="setInitialPlayers"/.test(queueHtml));
check('all six rotation rules are offered', ['winner_stays', 'four_off_four_on', 'fixed_rotation', 'timed_rotation', 'partner_rotation', 'fixed_pairs'].every((r) => queueHtml.includes(`value="${r}"`)));
check('fixed pairs / partner rotation force doubles mode, same guard as the facility module', /rule === 'fixed_pairs' \|\| rule === 'partner_rotation'/.test(queueHtml));
check('join flow checks for similar/duplicate names via the shared engine', /QueueEngine\.promptNameConflict\(session, p1\)/.test(queueHtml));
check('a single-queue page: one sessionStorage record, not a list of sessions', !/\bq_og_|loadQueues\(\)|saveQueues\(/.test(queueHtml));
check('stats tab shows players, teams\/standings, and match history, computed by the shared engine', /QueueEngine\.computePlayerStats\(session\)/.test(queueHtml) && /QueueEngine\.computeStandings\(session\)/.test(queueHtml) && /matchHistory/.test(queueHtml));
check('player and team tables include points for/against and point differential, same comprehensiveness as the facility module', /id="playerStatsBody"/.test(queueHtml) && /id="teamStatsBody"/.test(queueHtml) && /pointsFor/.test(queueHtml) && /pointsAgainst/.test(queueHtml) && (queueHtml.match(/\bpd\b/g) || []).length > 2);
check('head-to-head ("win over the other") is shown, computed by the same shared engine function the facility module uses', /QueueEngine\.computeHeadToHead\(session\)/.test(queueHtml) && /id="h2hList"/.test(queueHtml));

console.log(`\n=== STANDALONE QUEUE: ${passed}/${passed + failed} passed ===`);
process.exit(failed === 0 ? 0 : 1);
