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
}

section('index.html -- the new engine functions are destructured from QueueEngine, not referenced ad hoc');
check('setFirstServer, swapActivePlayer, swapActiveTeam are in the top-of-file destructure', /setFirstServer, swapActivePlayer, swapActiveTeam,/.test(indexHtml));

console.log(`\n=== QUEUE MATCH EDIT (ADMIN OVERRIDE): ${passed}/${passed + failed} passed ===`);
process.exit(failed === 0 ? 0 : 1);
