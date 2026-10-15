/* Admin override of the active queue match -- who's on court and who serves
   first -- in both queue modules (index.html's facility queue, queue.html's
   standalone tool). The pure engine logic (QueueEngine.setFirstServer,
   swapActivePlayer, swapActiveTeam, justPlayed) is covered in
   queue-engine.test.js; this file checks each page actually wires it up:
   editable selects instead of plain text, the serve-first toggle, and the
   firstServer option threaded into CourtBoard.open. Usage:
   node tests/queue-match-edit.test.js */
const fs = require('fs');
const path = require('path');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const indexHtml = read('index.html'), queueHtml = read('queue.html');
const pickleballScoring = read('pickleball-scoring.js'), courtScoreboard = read('court-scoreboard.js');

let passed = 0, failed = 0;
function check(name, ok, detail) { if (ok) passed++; else { failed++; console.log(`  FAIL: ${name}${detail ? ' -- ' + detail : ''}`); } }
const section = (t) => console.log(`\n${t}`);

section('pickleball-scoring.js / court-scoreboard.js -- firstServer is additive, defaults preserved');
check('createMatch takes an optional 3rd arg, defaulting to home for anything but the literal string "away"', /function createMatch\(rawConfig, names, firstServer\)/.test(pickleballScoring) && /const first = firstServer === 'away' \? 'away' : 'home';/.test(pickleballScoring));
check('serving starts on whichever side firstServer resolved to, not hardcoded to home', /serving: first,/.test(pickleballScoring));
check('CourtBoard.open forwards opts.firstServer straight through to createMatch', /P\.createMatch\(config, names, opts\.firstServer\)/.test(courtScoreboard));

section('pickleball-scoring.js -- atGameStart is the authoritative "no rally yet in THIS game" signal');
const PickleScore = require('../pickleball-scoring.js');
(function () {
  const cfg = { target: 11, winBy: 2, bestOf: 3, scoring: 'sideout', doubles: true };
  let m = PickleScore.createMatch(cfg, { home: 'A', away: 'B' }, 'home');
  check('true at the very start of game 1 (0-0, second server)', PickleScore.atGameStart(m) === true, JSON.stringify(m));
  const afterFault = PickleScore.applyRally(m, 'away'); // receivers win the rally: a fault, score unchanged
  check('a scoreless fault (server flips, score still 0-0) already locks it', afterFault.home === 0 && afterFault.away === 0 && PickleScore.atGameStart(afterFault) === false);
  let m2 = m;
  while (!m2.gameOver) m2 = PickleScore.applyRally(m2, 'home');
  const next = PickleScore.startNextGame(m2);
  check('true again at the start of game 2 (not just game 1)', PickleScore.atGameStart(next) === true, JSON.stringify(next));
  check("rallies is match-wide (doesn't reset per game), so atGameStart can't just check rallies === 0", next.rallies > 0);
  const servedByAway = PickleScore.setFirstServer(next, 'away');
  check('setFirstServer flips firstServer AND serving, reusing those fields -- no parallel field', servedByAway.firstServer === 'away' && servedByAway.serving === 'away');
  const renamed = PickleScore.renameSide(next, 'home', 'Carol & Dan');
  check('renameSide updates just that side\'s label', renamed.names.home === 'Carol & Dan' && renamed.names.away === next.names.away);
  const afterRally = PickleScore.applyRally(next, 'home');
  check('both setFirstServer and renameSide are no-ops once a rally has happened this game', PickleScore.setFirstServer(afterRally, 'away') === afterRally && PickleScore.renameSide(afterRally, 'home', 'Someone Else') === afterRally);
}());

section('court-scoreboard.js -- pre-rally admin override panel, gated by atGameStart');
check('a pre-game panel only renders while PickleScore.atGameStart(state) is true', /function renderPreGame\(\)\s*\{\s*pregameHost\.textContent = '';\s*if \(!P\.atGameStart\(state\)\)/.test(courtScoreboard));
check('the serves-first control calls opts.onSetFirstServer, then mirrors it locally via PickleScore.setFirstServer (no close/reopen)', /opts\.onSetFirstServer\(side\)/.test(courtScoreboard) && /change\(P\.setFirstServer\(state, side\)\)/.test(courtScoreboard));
check('the player-swap control calls opts.onSwapPlayer, then mirrors it locally via PickleScore.renameSide', /opts\.onSwapPlayer\(side, index, newName\)/.test(courtScoreboard) && /change\(P\.renameSide\(state, side, roster\[side\]\.join\(TEAM_SEP\)\)\)/.test(courtScoreboard));
check('the Fixed Pairs team-swap control calls opts.onSwapTeam, not onSwapPlayer', /opts\.onSwapTeam\(side, newTeamId\)/.test(courtScoreboard));
check('Fixed Pairs swaps the whole team, not an individual player, inside the scoreboard too (onSwapTeam wins over onSwapPlayer when both could apply)', /const hasPlayerSwap = !hasTeamSwap && typeof opts\.onSwapPlayer === 'function';/.test(courtScoreboard));
check('the real on-court roster (not just the joined display string) and the waiting line are accepted as opts', /opts\.roster/.test(courtScoreboard) && /opts\.waitingNames/.test(courtScoreboard) && /opts\.waitingTeams/.test(courtScoreboard));

for (const [name, html] of [['index.html', indexHtml], ['queue.html', queueHtml]]) {
  section(`${name} -- active match players are editable, not plain text`);
  check('per-player <select> elements exist (data-team + data-index), not hardcoded <div> name tags', /data-team="\$\{team\}"/.test(html) || /data-team="teamA"/.test(html));
  check('a name that just played is flagged in its own option, via the shared QueueEngine.justPlayed', /justPlayed\(session, n\)/.test(html) && /just played/.test(html));
  check('changing a select calls into the shared engine (swapActivePlayer), not page-local swap logic', /swapActivePlayer\(/.test(html));

  section(`${name} -- Fixed Pairs swaps whole teams, not individual players`);
  check('a team-level <select> (data-team-swap) exists for Fixed Pairs, separate from the per-player one', /data-team-swap/.test(html));
  check('changing it calls the shared engine (swapActiveTeam), not page-local logic', /swapActiveTeam\(/.test(html));

  section(`${name} -- "serves first" is a visible, clickable control, not fixed to teamA`);
  check('a serve-first control exists, driven by activeMatch.firstServer', /firstServer/.test(html));
  check('choosing a side calls into the shared engine (setFirstServer), not a page-local field write', /setFirstServer\(/.test(html));

  section(`${name} -- CourtBoard.open is told who serves first`);
  check('passes firstServer mapped from activeMatch.firstServer (teamB -> away, else home) -- same home=teamA/away=teamB mapping the rest of the page already relies on', /firstServer:\s*m\.firstServer === 'teamB' \? 'away' : 'home'/.test(html));

  section(`${name} -- CourtBoard.open gets the live-scoreboard pre-rally override wiring too`);
  const fns = name === 'index.html'
    ? { firstServer: 'applyQueueFirstServer', swap: 'applyQueueSwap', teamSwap: 'applyQueueTeamSwap' }
    : { firstServer: 'applyServeFirst', swap: 'applySwapPlayer', teamSwap: 'applySwapTeam' };
  check('passes the real roster arrays (teamA/teamB), not just the joined display string already used for names', /roster:\s*\{\s*home:\s*m\.teamA\.slice\(\),\s*away:\s*m\.teamB\.slice\(\)\s*\}/.test(html));
  check('passes waitingNames for every rule but Fixed Pairs, and waitingTeams for Fixed Pairs -- same fixedPairs branch the rest of the page uses', /waitingNames:\s*fixedPairs \? undefined : session\.waiting\.flatMap/.test(html) && /waitingTeams:\s*fixedPairs \? session\.waiting\.map/.test(html));
  check(`onSetFirstServer calls the SAME ${fns.firstServer} the dashboard's own serves-first control calls, not a second implementation`, new RegExp(`onSetFirstServer:\\s*\\(side\\)\\s*=>\\s*${fns.firstServer}\\(`).test(html));
  check(`onSwapPlayer (non-Fixed-Pairs) calls the SAME ${fns.swap} the dashboard's per-player selects call`, new RegExp(`onSwapPlayer:\\s*fixedPairs \\? undefined : \\(side, index, newName\\)\\s*=>\\s*${fns.swap}\\(`).test(html));
  check(`onSwapTeam (Fixed Pairs only) calls the SAME ${fns.teamSwap} the dashboard's team-level select calls -- whole team, not one player`, new RegExp(`onSwapTeam:\\s*fixedPairs \\? \\(side, newTeamId\\)\\s*=>\\s*${fns.teamSwap}\\(`).test(html));
}

section('index.html -- the new engine functions are destructured from QueueEngine, not referenced ad hoc');
check('setFirstServer, swapActivePlayer, swapActiveTeam are in the top-of-file destructure', /setFirstServer, swapActivePlayer, swapActiveTeam,/.test(indexHtml));

function fnBody(src, header) {
  const m = new RegExp(header.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\{[\\s\\S]*?\\n(  )?\\}').exec(src);
  return m ? m[0] : '';
}

section('index.html -- the dashboard wrapper functions report their result, so CourtBoard can mirror a swap it triggered');
check('applyQueueSwap returns the engine result (not void)', fnBody(indexHtml, 'function applyQueueSwap(team, index, newName)').includes('return r;'));
check('applyQueueTeamSwap returns the engine result (not void)', fnBody(indexHtml, 'function applyQueueTeamSwap(side, newTeamId)').includes('return r;'));
check('applyQueueFirstServer exists and returns the engine result', fnBody(indexHtml, 'function applyQueueFirstServer(side)').includes('return r;'));

section('queue.html -- the dashboard wrapper functions report their result, so CourtBoard can mirror a swap it triggered');
check('applyServeFirst exists and returns the engine result', fnBody(queueHtml, 'function applyServeFirst(side)').includes('return r;'));
check('applySwapPlayer exists and returns the engine result', fnBody(queueHtml, 'function applySwapPlayer(team, index, newName)').includes('return r;'));
check('applySwapTeam exists and returns the engine result', fnBody(queueHtml, 'function applySwapTeam(side, newTeamId)').includes('return r;'));

console.log(`\n=== QUEUE MATCH EDIT (ADMIN OVERRIDE): ${passed}/${passed + failed} passed ===`);
process.exit(failed === 0 ? 0 : 1);
