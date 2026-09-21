/* ================================================================
   Match alerts x live scoreboards.
   A scoreboard publishes tournaments/{t}/live/{matchId} while a match is being
   scored; the notifier uses it to know what the schedule can't:
     - a match already under way gets no "Up Next, warm up" reminder
     - a court whose previous match is finished on the scoreboard is free even if
       the result hasn't been entered, so the next reminder is released
     - an active scoreboard counts as live play (organizer alerts still go out late)

   Usage:  node tests/match-alerts-live.test.js
   ================================================================ */
const path = require('path');
const { store, fakeDb, pushCalls, installMocks } = require('./helpers/fakeFirestore');
installMocks();

const notifier = require('../functions/engines/notifier');
const runner = require('../functions/notifyRunner');
require(path.join(__dirname, '..', 'functions', 'index.js'));

let passed = 0, failed = 0;
function check(name, ok, detail) { if (ok) passed++; else { failed++; console.log(`  FAIL: ${name}${detail ? ' -- ' + detail : ''}`); } }
const section = (t) => console.log(`\n${t}`);

const CID = 'demo', TID = 'T1';
const TP = `clients/${CID}/tournaments/${TID}`;
const DAY = '2026-10-10';
const at = (date, h, m = 0) => { const [y, mo, d] = date.split('-').map(Number); return Date.UTC(y, mo - 1, d, h - 8, m); };
const cfg = notifier.normalizeNotifyConfig({});
const VENUES = [{ id: 'club', name: 'Sports Zone Main', address: '123 Premium St', kind: 'facility', courts: [{ id: 'k1', name: 'Court 1', tenantCourtId: 'court1' }, { id: 'k2', name: 'Court 2', tenantCourtId: 'court2' }] }];
const HM = (h, m = 0) => h * 60 + m;
const sched = (courtId, startH, startM = 0) => ({ venueId: 'club', courtId, date: DAY, startMin: HM(startH, startM), endMin: HM(startH, startM) + 30 });
const M = (id, a, b, s, extra = {}) => ({ id, participantIds: [a, b], participantNames: [`Team ${a}`, `Team ${b}`], status: 'scheduled', sched: s, ...extra });
const PHONES = { r1: '09171110001', r2: '09171110002', r3: '09171110003', r4: '09171110004' };
const PLAYER = (r) => runner.normalizePhone(PHONES[r]);

async function seed() {
  store.clear(); pushCalls.length = 0;
  await fakeDb.doc(TP).set({ name: 'Test Cup', status: 'open', venues: VENUES, schedule: { status: 'published' } });
  await fakeDb.doc(`platformLiveTournaments/${CID}__${TID}`).set({ clientId: CID, tournamentId: TID, dates: [DAY], pending: false });
}
const putMatch = (id, m) => fakeDb.doc(`${TP}/matches/${id}`).set({ divisionId: 'D1', stage: 'group', groupId: 'A', round: 1, position: 0, ...m });
async function subscribe(reg) {
  await fakeDb.doc(`${TP}/pushSubs/${reg}_0`).set({ playerId: PLAYER(reg), regIds: [reg], endpoint: `https://fcm.googleapis.com/fcm/send/${reg}_0`, keys: { p256dh: 'BPk' + 'x'.repeat(20), auth: 'a'.repeat(12) }, createdAtMs: 1 });
}
const putLive = (matchId, extra, nowMs) => fakeDb.doc(`${TP}/live/${matchId}`).set({ points: { home: 3, away: 2 }, complete: false, winner: null, updatedAtMs: nowMs, ...extra });
const send = async (sub, payload) => { pushCalls.push({ id: sub.id, payload }); return { ok: true }; };
const run = (nowMs) => runner.runNotifier({ db: fakeDb, send, nowMs });
const state = async () => (await fakeDb.doc(`${TP}/notifyState/state`).get()).data();

(async () => {
  /* ============================ ENGINE ============================ */
  section('reading a live doc');
  const N = at(DAY, 10, 0);
  check('no doc -> none', notifier.liveState(null, N) === 'none' && notifier.liveState(undefined, N) === 'none');
  check('published a minute ago -> playing', notifier.liveState({ updatedAtMs: N - 60000 }, N) === 'playing');
  check('exactly 15 minutes ago is still playing; 15:01 is stale', notifier.liveState({ updatedAtMs: N - notifier.LIVE_FRESH_MS }, N) === 'playing' && notifier.liveState({ updatedAtMs: N - notifier.LIVE_FRESH_MS - 1000 }, N) === 'stale');
  check('complete or a winner -> finished, however old', notifier.liveState({ complete: true, updatedAtMs: 1 }, N) === 'finished' && notifier.liveState({ winner: 'home', updatedAtMs: 1 }, N) === 'finished');
  check('missing timestamp is treated as stale, not playing', notifier.liveState({ points: { home: 1, away: 0 } }, N) === 'stale');

  section('Up Next reminders');
  const m10 = M('m10', 'r1', 'r2', sched('k1', 10, 0));
  const plan = (matches, h, m, liveById, reminded) => notifier.planReminders({ matches, cfg, nowMs: at(DAY, h, m), reminded, liveById });
  check('baseline (no scoreboards): due at 9:45', plan([m10], 9, 45).due.length === 1 && plan([m10], 9, 45).started.length === 0);
  const playing = { m10: { updatedAtMs: at(DAY, 9, 44) } };
  const pl = plan([m10], 9, 45, playing);
  check('the match is already being scored -> no reminder, reported as started', pl.due.length === 0 && pl.held.length === 0 && pl.started.length === 1 && pl.started[0].key === notifier.reminderKey(m10));
  check('a scoreboard that already finished it -> started too', plan([m10], 9, 45, { m10: { complete: true, updatedAtMs: 1 } }).started.length === 1);
  check('an abandoned (stale) scoreboard does not suppress the reminder', plan([m10], 9, 45, { m10: { updatedAtMs: at(DAY, 9, 0) } }).due.length === 1);
  check('a scoreboard on some other match does not affect this one', plan([m10], 9, 45, { other: { updatedAtMs: at(DAY, 9, 44) } }).due.length === 1);
  check('an already-reminded match is not reported again', plan([m10], 9, 50, playing, { [notifier.reminderKey(m10)]: 1 }).started.length === 0);

  section('court delay released by the scoreboard');
  const prev = M('p', 'r3', 'r4', sched('k1', 9, 0)); // window over by 9:45, result not entered
  check('baseline: previous match overran unscored -> held', plan([m10, prev], 9, 45).held.length === 1);
  const freed = plan([m10, prev], 9, 45, { p: { complete: true, winner: 'home', updatedAtMs: at(DAY, 9, 40) } });
  check('previous match FINISHED on its scoreboard -> court free, reminder goes out', freed.held.length === 0 && freed.due.length === 1);
  check('previous match still being scored -> still held', plan([m10, prev], 9, 45, { p: { updatedAtMs: at(DAY, 9, 44) } }).held.length === 1);
  check('previous match scoreboard abandoned (stale) -> still held', plan([m10, prev], 9, 45, { p: { updatedAtMs: at(DAY, 9, 0) } }).held.length === 1);
  check('finished match on a different court does not release this one', plan([m10, prev], 9, 45, { other: { complete: true } }).held.length === 1);

  section('scoreboard counts as live play');
  const far = [M('a', 'r1', 'r2', sched('k1', 8, 0))];
  check('no scoreboard, nothing scheduled near 11:30 PM -> not live', !notifier.isLivePlay(far, at(DAY, 23, 30), cfg) && !notifier.isLivePlay(far, at(DAY, 23, 30), cfg, {}));
  check('an active scoreboard -> live', notifier.isLivePlay(far, at(DAY, 23, 30), cfg, { a: { updatedAtMs: at(DAY, 23, 25) } }));
  check('a stale or finished scoreboard -> not live', !notifier.isLivePlay(far, at(DAY, 23, 30), cfg, { a: { updatedAtMs: at(DAY, 22, 0) } }) && !notifier.isLivePlay(far, at(DAY, 23, 30), cfg, { a: { complete: true, updatedAtMs: at(DAY, 23, 29) } }));

  /* ============================ RUNNER ============================ */
  section('runner: the scoreboard says the previous match is over');
  await seed();
  await putMatch('m1', M('m1', 'r1', 'r2', sched('k1', 9, 0)));
  await putMatch('m2', M('m2', 'r3', 'r4', sched('k1', 10, 0)));
  await subscribe('r3');
  await run(at(DAY, 9, 45));
  check('held while the previous match is unscored and unfinished', pushCalls.length === 0);
  await putLive('m1', { complete: true, winner: 'home', points: { home: 11, away: 6 } }, at(DAY, 9, 46));
  await run(at(DAY, 9, 47));
  check('scoreboard finished it -> the next reminder is released', pushCalls.length === 1 && /starts in 13 mins/.test(pushCalls[0].payload.body), JSON.stringify(pushCalls));
  await run(at(DAY, 9, 50));
  check('and it is sent once', pushCalls.length === 1);

  section('runner: a match already under way is not reminded');
  await seed();
  await putMatch('m1', M('m1', 'r1', 'r2', sched('k1', 10, 0)));
  await subscribe('r1');
  await putLive('m1', {}, at(DAY, 9, 46));
  const r = await run(at(DAY, 9, 47));
  check('in play at 9:47 -> nothing sent, and the summary counts it', pushCalls.length === 0 && r.sent === 0);
  const st = await state();
  check('it is marked handled so it can never fire later', Object.keys(st.reminded).length === 1 && st.lockUntil === 0);
  await fakeDb.doc(`${TP}/live/m1`).delete();
  await run(at(DAY, 9, 55)); await run(at(DAY, 10, 5));
  check('even after the scoreboard clears, no late "warm up" reminder', pushCalls.length === 0);

  section('runner: an abandoned scoreboard does not block anything');
  await seed();
  await putMatch('m1', M('m1', 'r1', 'r2', sched('k1', 10, 0)));
  await subscribe('r1');
  await putLive('m1', {}, at(DAY, 8, 0)); // last touched 1h45m ago
  await run(at(DAY, 9, 45));
  check('stale scoreboard -> the reminder still goes out', pushCalls.length === 1);

  section('runner: an active scoreboard lets organizer alerts out after hours');
  const queueMove = async () => {
    await fakeDb.doc(`${TP}/notifyOutbox/m1`).set({ type: 'match_change', matchId: 'm1', prevKnown: true, createdAtMs: at(DAY, 22, 30) });
    await fakeDb.doc(`platformLiveTournaments/${CID}__${TID}`).set({ pending: true }, { merge: true });
  };
  await seed();
  await putMatch('m1', M('m1', 'r1', 'r2', sched('k1', 8, 0)));
  await subscribe('r1');
  await queueMove();
  await run(at(DAY, 23, 30));
  check('11:30 PM, no scoreboard -> the change is held for morning', pushCalls.length === 0);
  await putLive('m9', {}, at(DAY, 23, 29));
  await run(at(DAY, 23, 31));
  check('11:31 PM with a scoreboard in use -> it is sent', pushCalls.length === 1 && /moved to|Schedule Change/.test(JSON.stringify(pushCalls[0].payload)), JSON.stringify(pushCalls));

  console.log(`\n=== MATCH ALERTS x LIVE: ${passed}/${passed + failed} passed ===`);
  process.exit(failed === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
