/* Find a Game scoreboard: who may keep score, picking the two sides, the result
   line, and the wiring in index.html. Helpers are extracted from the real page.
   Usage: node tests/og-score.test.js */
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

const grab = (a, b) => { const i = html.indexOf(a), j = html.indexOf(b, i); if (i < 0 || j < 0) throw new Error('markers not found: ' + a.slice(0, 40)); return html.slice(i, j); };
const timeFns = grab('function ogGameStartsAt(game)', '/* Derived, not persisted');
const scoreFns = grab('// OG-SCORE-START', '// OG-SCORE-END');
const api = new Function(`${timeFns}\n${scoreFns}\nreturn { ogGameStartsAt, ogGameEndsAt, ogCanKeepScore, ogScoreDefaults, ogScoreSides, ogScoreLine };`)();

let passed = 0, failed = 0;
function check(name, ok, detail) { if (ok) passed++; else { failed++; console.log(`  FAIL: ${name}${detail ? ' -- ' + detail : ''}`); } }
const section = (t) => console.log(`\n${t}`);
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const P = (n) => Array.from({ length: n }, (_, i) => ({ name: 'Player ' + 'ABCDEFGH'[i], email: `p${i}@x.com` }));
const game = (o = {}) => ({ id: 'g1', date: '2026-10-10', startHour: 18, format: 'Doubles', players: P(4), playersNeeded: 4, status: 'FULL', ...o });
const start = api.ogGameStartsAt(game()), end = api.ogGameEndsAt(game());
const MIN = 60000;

section('who can keep score, and when');
check('a joined player, mid-game', api.ogCanKeepScore(game(), 'FULL', true, start + 10 * MIN));
check('not someone who is only browsing', !api.ogCanKeepScore(game(), 'FULL', false, start + 10 * MIN));
check('opens 30 minutes before the game, not earlier', api.ogCanKeepScore(game(), 'FULL', true, start - 30 * MIN) && !api.ogCanKeepScore(game(), 'FULL', true, start - 31 * MIN));
check('stays available for 6 hours after it ends, then closes', api.ogCanKeepScore(game(), 'COMPLETED', true, end + 6 * 3600000) && !api.ogCanKeepScore(game(), 'COMPLETED', true, end + 6 * 3600000 + MIN));
check('not for cancelled or expired games', !api.ogCanKeepScore(game(), 'CANCELLED', true, start + MIN) && !api.ogCanKeepScore(game(), 'EXPIRED', true, start + MIN));
check('needs at least two players', !api.ogCanKeepScore(game({ players: P(1) }), 'OPEN', true, start + MIN) && api.ogCanKeepScore(game({ players: P(2) }), 'OPEN', true, start + MIN));
check('facility open play is scored from the Queue, not here', !api.ogCanKeepScore(game({ source: 'facility' }), 'OPEN', true, start + MIN));
check('a game with no data does not throw', api.ogCanKeepScore(null, 'OPEN', true, start) === false);

section('default sides');
check('4 players, doubles: A & B vs C & D', eq(api.ogScoreDefaults(game()), { mode: 'doubles', home: [0, 1], away: [2, 3], target: 11, winBy: 2, scoring: 'sideout', bestOf: 1 }));
check('a Singles game is singles even with more players', api.ogScoreDefaults(game({ format: 'Singles', players: P(4) })).mode === 'singles' && eq(api.ogScoreDefaults(game({ format: 'Singles', players: P(4) })).home, [0]));
check('two players can only be singles', api.ogScoreDefaults(game({ players: P(2) })).mode === 'singles' && eq(api.ogScoreDefaults(game({ players: P(2) })).away, [1]));
check('an "Open" format game with 6 players defaults to doubles on the first four', eq(api.ogScoreDefaults(game({ format: 'Open', players: P(6) })).away, [2, 3]));

section('picking the sides');
const pick = (o) => ({ ...api.ogScoreDefaults(game()), ...o });
check('doubles names are joined with &', eq(api.ogScoreSides(game(), pick({})), { home: 'Player A & Player B', away: 'Player C & Player D' }));
check('a rotating game: choose any four of six', eq(api.ogScoreSides(game({ players: P(6) }), pick({ home: [4, 0], away: [2, 5] })), { home: 'Player E & Player A', away: 'Player C & Player F' }));
check('singles', eq(api.ogScoreSides(game(), pick({ mode: 'singles', home: [1], away: [3] })), { home: 'Player B', away: 'Player D' }));
check('the same player on both sides is refused', /only be on one side/.test(api.ogScoreSides(game(), pick({ home: [0, 1], away: [1, 3] })).error || ''));
check('the same player twice on one side is refused', /only be on one side/.test(api.ogScoreSides(game(), pick({ home: [0, 0], away: [2, 3] })).error || ''));
check('someone who left (index no longer exists) is refused', /from the list/.test(api.ogScoreSides(game({ players: P(3) }), pick({ home: [0, 1], away: [2, 3] })).error || ''));
check('the wrong number of players for the mode is refused', /Pick 4/.test(api.ogScoreSides(game(), pick({ home: [0], away: [2, 3] })).error || '') && /Pick 2/.test(api.ogScoreSides(game(), pick({ mode: 'singles', home: [0, 1], away: [2] })).error || ''));
check('non-numeric picks are refused', !!api.ogScoreSides(game(), pick({ home: ['0', 1], away: [2, 3] })).error);

section('the saved result line');
const sides = { home: 'Player A & Player B', away: 'Player C & Player D' };
check('one game', api.ogScoreLine(sides, { games: [{ home: 11, away: 7 }], gamesWon: { home: 1, away: 0 } }) === 'Player A & Player B 11–7 Player C & Player D');
check('best of 3 shows games won, then each game', api.ogScoreLine(sides, { games: [{ home: 11, away: 7 }, { home: 9, away: 11 }, { home: 11, away: 8 }], gamesWon: { home: 2, away: 1 } }) === 'Player A & Player B 2–1 Player C & Player D (11–7, 9–11, 11–8)');
check('an empty summary does not throw', api.ogScoreLine(sides, { games: [], gamesWon: { home: 0, away: 0 } }).includes('0–0'));

section('wiring in the page');
check('the modal shows the panel only when allowed', /const scoreHtml = ogCanKeepScore\(game, status, alreadyJoined \|\| isCreator \|\| adminUnlocked, Date\.now\(\)\) \? ogScorePanelHtml\(game\) : ''/.test(html) && /\$\{scoreHtml\}/.test(html));
check('the panel is wired after render', /if\(scoreHtml\) ogWireScorePanel\(game\)/.test(html));
check('it opens the shared court scoreboard, resumable, and saves results locally', /CourtBoard\.open\(\{\s*title: \(game\.skillLevel/.test(html) && /cb_board_og_/.test(html) && /ogScoresAdd\(game\.id, ogScoreLine\(sides, sum\)\)/.test(html));
check('player names go through escapeHtml in the panel', (html.match(/escapeHtml\(pl\.name\)/g) || []).length >= 1 && /escapeHtml\(r\.line\)/.test(html));
check('service worker cache was bumped for the new styles', /courtbooking-v(2\d|[3-9]\d)/.test(fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8')));

console.log(`\n=== FIND A GAME SCOREBOARD: ${passed}/${passed + failed} passed ===`);
process.exit(failed === 0 ? 0 : 1);
