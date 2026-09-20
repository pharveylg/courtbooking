/* Pickleball scoring engine tests.  Usage: node tests/pickleball-scoring.test.js */
const S = require('../pickleball-scoring.js');

let passed = 0, failed = 0;
function check(name, ok, detail) { if (ok) passed++; else { failed++; console.log(`  FAIL: ${name}${detail ? ' -- ' + detail : ''}`); } }
const section = (t) => console.log(`\n${t}`);
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/* play: 'h' / 'a' = rally winner, in order */
const play = (state, seq) => [...seq].reduce((s, c) => S.applyRally(s, c === 'h' ? 'home' : 'away', 1000), state);
const call = (s) => S.scoreCallText(s);
const N = { home: 'Alex & Sam', away: 'Jordan & Lee' };

section('config');
check('defaults: to 11, win by 2, one game, side-out, doubles', eq(S.normalizeConfig(), { target: 11, winBy: 2, bestOf: 1, scoring: 'sideout', doubles: true }));
check('valid settings are kept', eq(S.normalizeConfig({ target: 15, winBy: 1, bestOf: 3, scoring: 'rally', doubles: false }), { target: 15, winBy: 1, bestOf: 3, scoring: 'rally', doubles: false }));
check('junk falls back to defaults', eq(S.normalizeConfig({ target: 'abc', winBy: 9, bestOf: 4, scoring: 'x', doubles: undefined }), { target: 11, winBy: 2, bestOf: 1, scoring: 'sideout', doubles: true }) && S.normalizeConfig({ target: 999 }).target === 11);
check('games needed to win a match', S.gamesToWin({ bestOf: 1 }) === 1 && S.gamesToWin({ bestOf: 3 }) === 2 && S.gamesToWin({ bestOf: 5 }) === 3);
check('format label reads naturally', S.formatLabel({ target: 11, bestOf: 3, scoring: 'rally' }) === 'Game to 11, win by 2, best of 3, rally scoring' && /one game, side-out/.test(S.formatLabel({})));

section('doubles side-out serving');
let m = S.createMatch({}, N);
check('starts 0-0-2 with the first side serving', call(m) === '0-0-2' && m.serving === 'home' && m.serverNumber === 2 && m.startedAt === null);
let m1 = play(m, 'a');
check('receivers win the first rally: side out, new side serves as server 1', m1.serving === 'away' && m1.serverNumber === 1 && call(m1) === '0-0-1' && m1.home === 0 && m1.away === 0);
let m2 = play(m1, 'a');
check('serving side wins a rally: scores, same server', call(m2) === '1-0-1' && m2.serving === 'away');
let m3 = play(m2, 'h');
check('first server faults: second server takes over, no side out', m3.serving === 'away' && m3.serverNumber === 2 && call(m3) === '1-0-2');
let m4 = play(m3, 'h');
check('second server faults: side out to the other side, server 1', m4.serving === 'home' && m4.serverNumber === 1 && call(m4) === '0-1-1');
check('the call is always server-first: after side out the new server\'s score leads', call(play(m4, 'h')) === '1-1-1');
check('applyRally never mutates the old state', m.rallies === 0 && m.home === 0 && m1.rallies === 1 && m1 !== m);
check('the clock starts on the first rally', m1.startedAt === 1000 && S.createMatch({}, N).startedAt === null);
check('rallies are counted', play(m, 'hhaha').rallies === 5);

section('singles side-out');
const sg = S.createMatch({ doubles: false }, N);
check('singles: no server number in the call', call(sg) === '0-0' && sg.serverNumber === 1);
check('singles: a fault is an immediate side out', (() => { const s = play(sg, 'a'); return s.serving === 'away' && call(s) === '0-0'; })());

section('winning a game');
let g = { ...S.createMatch({}, N), home: 10, away: 5, serving: 'home', serverNumber: 1 };
g = S.applyRally(g, 'home', 1);
check('11-5 wins the game and the match (one game)', g.complete && g.winner === 'home' && eq(g.games, [{ home: 11, away: 5 }]) && g.gamesWon.home === 1);
check('a finished match ignores further taps', S.applyRally(g, 'away') === g && S.applyRally(g, 'home') === g);
let w2 = S.createMatch({ doubles: false, target: 11 }, N);
w2 = { ...w2, home: 10, away: 10, serving: 'home' };
w2 = S.applyRally(w2, 'home', 1);
check('11-10 is not enough when you must win by 2', !w2.gameOver && w2.home === 11 && w2.away === 10);
w2 = S.applyRally(w2, 'home', 1);
check('12-10 wins it', w2.complete && w2.winner === 'home' && eq(w2.games, [{ home: 12, away: 10 }]));
let w1 = S.createMatch({ winBy: 1 }, N); w1 = { ...w1, home: 10, away: 10, serving: 'home' };
check('win-by-1 ends at 11-10', S.applyRally(w1, 'home', 1).complete);
let t15 = S.createMatch({ target: 15 }, N); t15 = { ...t15, home: 11, away: 3, serving: 'home' };
check('a game to 15 does not end at 11', !S.applyRally(t15, 'home', 1).gameOver);
let long = S.createMatch({ doubles: false }, N); long = { ...long, home: 20, away: 20, serving: 'home' };
long = S.applyRally(S.applyRally(long, 'home'), 'home');
check('long deuce games work (22-20)', long.complete && long.games[0].home === 22);

section('rally scoring');
const ry = S.createMatch({ scoring: 'rally' }, N);
check('rally scoring: no server number, call is two numbers', call(ry) === '0-0' && ry.serverNumber === 1);
const r1 = play(ry, 'a');
check('rally scoring: the receiver who wins the rally scores AND takes the serve', r1.away === 1 && r1.serving === 'away' && call(r1) === '1-0');
check('rally scoring: server winning scores and keeps serving', (() => { const s = play(ry, 'hh'); return s.home === 2 && s.serving === 'home'; })());
check('rally scoring: game ends at 11 win by 2', (() => { let s = ry; for (let i = 0; i < 11; i++) s = S.applyRally(s, 'home', 1); return s.complete && s.games[0].home === 11 && s.games[0].away === 0; })());

section('best of three');
let b3 = S.createMatch({ bestOf: 3, doubles: false }, N);
const winGame = (s, side) => { let st = s; while (!st.gameOver) st = S.applyRally(st, side, 1); return st; };
b3 = winGame(b3, 'home');
check('game 1 won: game over but match not', b3.gameOver && !b3.complete && b3.gamesWon.home === 1 && b3.games.length === 1);
check('taps are ignored until the next game is started', S.applyRally(b3, 'away') === b3);
const b3n = S.startNextGame(b3);
check('next game: fresh score, serve alternates to the other side', b3n.home === 0 && b3n.away === 0 && !b3n.gameOver && b3n.firstServer === 'away' && b3n.serving === 'away');
check('next game keeps the games won so far', b3n.gamesWon.home === 1 && b3n.games.length === 1);
check('startNextGame does nothing mid-game or after the match', S.startNextGame(b3n) === b3n && (() => { const done = winGame(b3n, 'home'); return S.startNextGame(done) === done; })());
const b3done = winGame(b3n, 'away');
check('1-1 in games: another game is needed', b3done.gameOver && !b3done.complete && b3done.gamesWon.away === 1);
const b3final = winGame(S.startNextGame(b3done), 'away');
check('winning two games wins best-of-3', b3final.complete && b3final.winner === 'away' && b3final.games.length === 3 && eq(b3final.gamesWon, { home: 1, away: 2 }));
check('doubles starts every game at server 2', (() => { const d = winGame(S.createMatch({ bestOf: 3 }, N), 'home'); return S.startNextGame(d).serverNumber === 2; })());
const b5 = (() => { let s = S.createMatch({ bestOf: 5, doubles: false }, N); for (const side of ['home', 'away', 'home', 'away']) s = S.startNextGame(winGame(s, side)); return winGame(s, 'home'); })();
check('best of 5 needs three games', b5.complete && b5.gamesWon.home === 3 && b5.games.length === 5);

section('calls and announcements');
check('spoken call uses commas', S.scoreCallSpoken(play(S.createMatch({}, N), 'a')) === '0, 0, 1' && S.scoreCallSpoken(S.createMatch({ scoring: 'rally' }, N)) === '0, 0');
const a0 = S.createMatch({}, N);
check('side out is announced with the new call', S.announcement(a0, S.applyRally(a0, 'away', 1)) === 'Side out. 0, 0, 1');
const a1 = S.applyRally(S.applyRally(a0, 'away', 1), 'away', 1);
check('a point is just the call', S.announcement(S.applyRally(a0, 'away', 1), a1) === '1, 0, 1');
check('second-server hand-over is not called a side out', S.announcement(a1, S.applyRally(a1, 'home', 1)) === '1, 0, 2');
check('rally scoring never says "side out"', (() => { const r = S.createMatch({ scoring: 'rally' }, N); return !/Side out/.test(S.announcement(r, S.applyRally(r, 'away', 1))); })());
const gEnd = { ...S.createMatch({ bestOf: 3, doubles: false }, N), home: 10, away: 4, serving: 'home' };
check('game end names the winner and score', S.announcement(gEnd, S.applyRally(gEnd, 'home', 1)) === 'Game to Alex & Sam, 11 to 4.');
const mEnd = { ...S.createMatch({ doubles: false }, N), home: 10, away: 4, serving: 'home' };
check('match end says match', /^Game and match to Alex & Sam, 11 to 4\./.test(S.announcement(mEnd, S.applyRally(mEnd, 'home', 1))));
check('no announcement when nothing changed', S.announcement(g, g) === '');

section('summary and live view');
const sum = S.summary(b3final);
check('summary: games, games won, total points, winner', sum.complete && sum.winner === 'away' && sum.games.length === 3 && sum.totalPoints.home === b3final.games.reduce((a, x) => a + x.home, 0) && sum.gamesWon.away === 2);
const lv = S.liveView(S.applyRally(S.createMatch({}, N), 'away', 5));
check('live view: names, points, server, server number, config only', eq(Object.keys(lv).sort(), ['complete', 'config', 'gameOver', 'games', 'gamesWon', 'names', 'points', 'serverNumber', 'serving', 'startedAt', 'winner']) && lv.serving === 'away' && lv.serverNumber === 1);
check('live view hides the server number in singles/rally', S.liveView(S.createMatch({ doubles: false }, N)).serverNumber === null && S.liveView(S.createMatch({ scoring: 'rally' }, N)).serverNumber === null);
check('state survives a JSON round trip (save/restore/sync)', (() => { const s = play(S.createMatch({ bestOf: 3 }, N), 'ahhaahh'); return eq(JSON.parse(JSON.stringify(s)), s) && eq(play(JSON.parse(JSON.stringify(s)), 'ha'), play(s, 'ha')); })());
check('names are trimmed to a sane length and defaulted', S.createMatch({}, { home: 'x'.repeat(200) }).names.home.length === 60 && S.createMatch({}).names.away === 'Away');

section('property: random matches are always legal');
let bad = null;
for (let seed = 1; seed <= 300 && !bad; seed++) {
  let x = seed * 9301 % 233280; const rnd = () => (x = (x * 9301 + 49297) % 233280) / 233280;
  const cfg = { target: [7, 11, 15][seed % 3], winBy: 1 + (seed % 2), bestOf: [1, 3, 5][seed % 3], scoring: seed % 4 === 0 ? 'rally' : 'sideout', doubles: seed % 5 !== 0 };
  let s = S.createMatch(cfg, N), steps = 0;
  while (!s.complete && steps++ < 4000) {
    if (s.gameOver) { s = S.startNextGame(s); continue; }
    const prev = s; s = S.applyRally(s, rnd() < 0.5 ? 'home' : 'away', 1);
    if (s.home < prev.home || s.away < prev.away) bad = `score went down (seed ${seed})`;
    if (![1, 2].includes(s.serverNumber)) bad = `bad server number (seed ${seed})`;
    if (cfg.scoring === 'sideout' && !s.gameOver && s.home + s.away < prev.home + prev.away) bad = `sideout score decreased (seed ${seed})`;
    if (cfg.scoring === 'sideout' && (s.home - prev.home) + (s.away - prev.away) > 1) bad = `two points in one rally (seed ${seed})`;
    if (cfg.scoring === 'sideout' && s.home > prev.home && prev.serving !== 'home') bad = `receiver scored in side-out (seed ${seed})`;
    if (cfg.scoring === 'sideout' && s.away > prev.away && prev.serving !== 'away') bad = `receiver scored in side-out (seed ${seed})`;
  }
  if (!bad && !s.complete) bad = `never finished (seed ${seed})`;
  if (!bad) {
    const need = S.gamesToWin(s.config);
    const okGames = s.games.every((gm) => { const hi = Math.max(gm.home, gm.away), lo = Math.min(gm.home, gm.away); return hi >= cfg.target && hi - lo >= cfg.winBy && (hi === cfg.target || hi - lo === cfg.winBy); });
    if (!okGames) bad = `illegal game score ${JSON.stringify(s.games)} (seed ${seed})`;
    else if (Math.max(s.gamesWon.home, s.gamesWon.away) !== need || s.games.length > cfg.bestOf) bad = `wrong games won (seed ${seed})`;
    else if (s.gamesWon[s.winner] !== need) bad = `winner mismatch (seed ${seed})`;
  }
}
check('300 random matches across formats: scores only rise, only servers score, every game score is legal, winner has the games', !bad, bad);

console.log(`\n=== PICKLEBALL SCORING: ${passed}/${passed + failed} passed ===`);
process.exit(failed === 0 ? 0 : 1);
