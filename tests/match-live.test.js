/* ================================================================
   Game-by-game results, live scores and player-proposed results, through the
   REAL functions/index.js against the in-memory Firestore.

   Usage:  node tests/match-live.test.js
   ================================================================ */
const path = require('path');
const fs = require('fs');
const { store, fakeDb, installMocks } = require('./helpers/fakeFirestore');
installMocks();
const fns = require(path.join(__dirname, '..', 'functions', 'index.js'));

let passed = 0, failed = 0;
function check(name, ok, detail) { if (ok) passed++; else { failed++; console.log(`  FAIL: ${name}${detail ? ' -- ' + detail : ''}`); } }
const section = (t) => console.log(`\n${t}`);
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const CID = 'demo', TID = 'T1';
const TP = `clients/${CID}/tournaments/${TID}`;
const call = (name, data) => fns[name]({ data: { clientId: CID, tournamentId: TID, ...data } });
const code = async (p) => { try { await p; return null; } catch (e) { return e.code || 'ERR:' + e.message; } };
const doc = async (p) => (await fakeDb.doc(p).get()).data();
const exists = async (p) => (await fakeDb.doc(p).get()).exists;
const matches = async () => (await fakeDb.collection(`${TP}/matches`).get()).docs.map((d) => ({ id: d.id, ...d.data() }));

async function seed() {
  store.clear();
  await fakeDb.doc(TP).set({ name: 'Cup', status: 'open' });
  await fakeDb.doc(`${TP}/divisions/D1`).set({ name: 'Open', format: 'round_robin', seedingMethod: 'manual' });
  for (const r of ['r1', 'r2', 'r3']) {
    await fakeDb.doc(`${TP}/registrations/${r}`).set({ divisionId: 'D1', status: 'approved', playerIds: [`${r}a`, `${r}b`], playerNames: [`${r} A`, `${r} B`], registeredAt: { seconds: 1 } });
  }
  await call('generateBracket', { divisionId: 'D1' });
  const ms = await matches();
  return ms.find((m) => m.participantIds.includes('r1') && m.participantIds.includes('r2'));
}
const LIVE = { names: { home: 'r1 A & r1 B', away: 'r2 A & r2 B' }, games: [{ home: 11, away: 7 }], gamesWon: { home: 1, away: 0 }, points: { home: 4, away: 2 }, serving: 'home', serverNumber: 2, gameOver: false, complete: false, winner: null, config: { target: 11, winBy: 2, bestOf: 3, scoring: 'sideout', doubles: true } };

(async () => {
  let m = await seed();
  const [pa, pb] = m.participantIds;

  section('game-by-game official result');
  const r1 = await call('submitMatchScore', { matchId: m.id, games: [{ a: 11, b: 7 }, { a: 8, b: 11 }, { a: 11, b: 9 }] });
  const done = await doc(`${TP}/matches/${m.id}`);
  check('winner is decided by games won', r1.winnerParticipantId === pa && done.winnerParticipantId === pa && done.status === 'completed');
  check('score holds TOTAL points so standings and stats keep working', eq(done.score, { a: 30, b: 27 }));
  check('the games are kept for display', eq(done.games, [{ a: 11, b: 7 }, { a: 8, b: 11 }, { a: 11, b: 9 }]));
  const st = await doc(`${TP}/standings/D1`);
  const row = (id) => st.table.find((r) => r.participantId === id);
  check('standings: winner gets the win, both get the point totals', row(pa).wins === 1 && row(pb).losses === 1 && row(pa).pointsFor === 30 && row(pa).pointsAgainst === 27, JSON.stringify(row(pa)));

  m = await seed();
  await call('submitMatchScore', { matchId: m.id, games: [{ a: 11, b: 0 }, { a: 9, b: 11 }, { a: 9, b: 11 }] });
  const odd = await doc(`${TP}/matches/${m.id}`);
  check('winning more games beats scoring more points (B wins 2-1 despite fewer points)', odd.winnerParticipantId === m.participantIds[1] && eq(odd.score, { a: 29, b: 22 }));

  m = await seed();
  await call('submitMatchScore', { matchId: m.id, games: [{ a: 11, b: 4 }] });
  const single = await doc(`${TP}/matches/${m.id}`);
  check('a single game works exactly like the old score', single.winnerParticipantId === m.participantIds[0] && eq(single.score, { a: 11, b: 4 }) && single.games.length === 1);

  m = await seed();
  await call('submitMatchScore', { matchId: m.id, scoreA: 6, scoreB: 11 });
  const legacy = await doc(`${TP}/matches/${m.id}`);
  check('the plain two-number score still works and stores no games', legacy.winnerParticipantId === m.participantIds[1] && legacy.games === undefined);

  section('validation');
  m = await seed();
  const bad = (games) => code(call('submitMatchScore', { matchId: m.id, games }));
  check('no games / too many games', await bad([]) === 'invalid-argument' && await bad(Array.from({ length: 6 }, () => ({ a: 11, b: 1 }))) === 'invalid-argument' && await bad('x') === 'invalid-argument');
  check('a tied game is refused', await bad([{ a: 10, b: 10 }]) === 'invalid-argument');
  check('junk numbers are refused', await bad([{ a: 11.5, b: 3 }]) === 'invalid-argument' && await bad([{ a: -1, b: 11 }]) === 'invalid-argument' && await bad([{ a: 'x', b: 2 }]) === 'invalid-argument' && await bad([{ a: 150, b: 3 }]) === 'invalid-argument');
  check('games that split evenly have no winner', await bad([{ a: 11, b: 5 }, { a: 5, b: 11 }]) === 'invalid-argument');
  check('nothing was written by the refused attempts', (await doc(`${TP}/matches/${m.id}`)).status === 'scheduled');

  section('correction clears the game list');
  m = await seed();
  await call('submitMatchScore', { matchId: m.id, games: [{ a: 11, b: 7 }, { a: 8, b: 11 }, { a: 11, b: 9 }] });
  await call('correctMatchScore', { matchId: m.id, scoreA: 4, scoreB: 11, reason: 'Scored the wrong side' });
  const fixed = await doc(`${TP}/matches/${m.id}`);
  check('corrected result replaces the games it no longer matches', fixed.games === undefined && eq(fixed.score, { a: 4, b: 11 }) && fixed.winnerParticipantId === m.participantIds[1]);

  section('live scores');
  m = await seed();
  await call('setLiveScore', { matchId: m.id, live: LIVE });
  const live = await doc(`${TP}/live/${m.id}`);
  check('a live score is published for spectators', live && eq(live.points, { home: 4, away: 2 }) && live.serving === 'home' && live.serverNumber === 2 && live.divisionId === 'D1' && typeof live.updatedAtMs === 'number');
  await call('setLiveScore', { matchId: m.id, live: { ...LIVE, points: { home: 5, away: 2 } } });
  check('later updates replace it (one doc per match)', (await doc(`${TP}/live/${m.id}`)).points.home === 5 && (await fakeDb.collection(`${TP}/live`).get()).size === 1);
  await call('setLiveScore', { matchId: m.id, live: { names: { home: 'x'.repeat(500), away: '<b>hi</b>' }, points: { home: 9999, away: -4 }, games: Array.from({ length: 20 }, () => ({ home: 11, away: 3, evil: 'x' })), hack: 'no', __proto__: { polluted: 1 }, serving: 'sideways', serverNumber: 7, config: { target: 9999, bestOf: 4, scoring: 'weird' } } });
  const clean = await doc(`${TP}/live/${m.id}`);
  check('names are trimmed, numbers clamped, junk fields dropped', clean.names.home.length === 80 && clean.names.away === '<b>hi</b>' && clean.points.home === 0 && clean.points.away === 0 && clean.games.length === 5 && !('evil' in clean.games[0]) && !('hack' in clean));
  check('bad server / config values fall back to safe ones', clean.serving === 'home' && clean.serverNumber === null && clean.config.target === 11 && clean.config.bestOf === 1 && clean.config.scoring === 'sideout');
  await call('setLiveScore', { matchId: m.id, clear: true });
  check('clearing removes it', !(await exists(`${TP}/live/${m.id}`)));
  check('an unknown match is refused', await code(call('setLiveScore', { matchId: 'nope', live: LIVE })) === 'not-found');
  await call('setLiveScore', { matchId: m.id, live: LIVE });
  await call('submitMatchScore', { matchId: m.id, games: [{ a: 11, b: 1 }] });
  check('an official result removes the live score', !(await exists(`${TP}/live/${m.id}`)));
  check('a decided match cannot go live again', await code(call('setLiveScore', { matchId: m.id, live: LIVE })) === 'failed-precondition');
  await fakeDb.doc(TP).set({ status: 'cancelled' }, { merge: true });
  check('a cancelled tournament takes no live scores', await code(call('setLiveScore', { matchId: m.id, live: LIVE })) === 'failed-precondition');
  check('bad tenant id is refused', await code(fns.setLiveScore({ data: { clientId: 'BAD ID', tournamentId: TID, matchId: 'x', live: LIVE } })) === 'invalid-argument');

  section('player-proposed results');
  m = await seed();
  await call('setLiveScore', { matchId: m.id, live: LIVE });
  await call('proposeMatchResult', { matchId: m.id, games: [{ a: 11, b: 6 }, { a: 11, b: 8 }] });
  const prop = await doc(`${TP}/proposals/${m.id}`);
  check('a proposal is stored with its totals and winner side, and is NOT official', prop && eq(prop.games, [{ a: 11, b: 6 }, { a: 11, b: 8 }]) && eq(prop.score, { a: 22, b: 14 }) && prop.winnerIndex === 0 && (await doc(`${TP}/matches/${m.id}`)).status === 'scheduled');
  check('proposing takes the match off the live board', !(await exists(`${TP}/live/${m.id}`)));
  check('bad proposals are refused', await code(call('proposeMatchResult', { matchId: m.id, games: [{ a: 5, b: 5 }] })) === 'invalid-argument' && await code(call('proposeMatchResult', { matchId: 'nope', games: [{ a: 11, b: 1 }] })) === 'not-found');
  await call('dismissMatchProposal', { matchId: m.id });
  check('the organizer can dismiss it', !(await exists(`${TP}/proposals/${m.id}`)) && (await doc(`${TP}/matches/${m.id}`)).status === 'scheduled');
  await call('proposeMatchResult', { matchId: m.id, games: [{ a: 11, b: 6 }, { a: 11, b: 8 }] });
  await call('submitMatchScore', { matchId: m.id, games: prop.games });
  check('accepting it (an official submit) makes it real and clears the proposal', (await doc(`${TP}/matches/${m.id}`)).status === 'completed' && !(await exists(`${TP}/proposals/${m.id}`)));
  check('a decided match cannot be proposed for', await code(call('proposeMatchResult', { matchId: m.id, games: [{ a: 11, b: 1 }] })) === 'failed-precondition');

  section('rules');
  const rules = fs.readFileSync(path.join(__dirname, '..', 'firestore.rules'), 'utf8');
  const rule = (name) => { const r = rules.match(new RegExp(`match /tournaments/\\{tournamentId\\}/${name}/\\{document\\}\\s*\\{([\\s\\S]*?)\\n      \\}`)); return r && r[1]; };
  check('live and proposals: anyone can read, nobody writes from a browser', ['live', 'proposals'].every((n) => { const b = rule(n); return b && /allow read: if isValidTenantId/.test(b) && /allow write: if false/.test(b); }));

  console.log(`\n=== MATCH LIVE + RESULTS: ${passed}/${passed + failed} passed ===`);
  process.exit(failed === 0 ? 0 : 1);
})().catch((e) => { console.log('\nUNCAUGHT:', e.stack || e); process.exit(1); });
