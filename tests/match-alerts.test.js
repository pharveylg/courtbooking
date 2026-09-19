/* ================================================================
   Match alerts -- engine rules, the runner against an in-memory Firestore
   with a fake push sender, and the callable hooks (publish / move / advance
   / subscribe) through the REAL functions/index.js.

   Usage:  node tests/match-alerts.test.js
   ================================================================ */
const fs = require('fs');
const path = require('path');
const { store, fakeDb, pushCalls, installMocks } = require('./helpers/fakeFirestore');
installMocks();

const notifier = require('../functions/engines/notifier');
const runner = require('../functions/notifyRunner');
const fns = require(path.join(__dirname, '..', 'functions', 'index.js'));

let passed = 0, failed = 0;
function check(name, ok, detail) { if (ok) passed++; else { failed++; console.log(`  FAIL: ${name}${detail ? ' -- ' + detail : ''}`); } }
const section = (t) => console.log(`\n${t}`);
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const CID = 'demo', TID = 'T1';
const TP = `clients/${CID}/tournaments/${TID}`;
const DAY = '2026-10-10';
/* wall-clock in the tournament's timezone (UTC+8) -> epoch ms */
const at = (date, h, m = 0) => { const [y, mo, d] = date.split('-').map(Number); return Date.UTC(y, mo - 1, d, h - 8, m); };
const cfg = notifier.normalizeNotifyConfig({});
const VENUES = [
  { id: 'club', name: 'Sports Zone Main', address: '123 Premium St', kind: 'facility', courts: [{ id: 'k1', name: 'Court 1', tenantCourtId: 'court1' }, { id: 'k2', name: 'Court 2', tenantCourtId: 'court2' }] },
  { id: 'sat', name: 'Satellite Hall', address: '9 Side Rd', kind: 'external', courts: [{ id: 's1', name: 'Court A' }] },
];
const HM = (h, m = 0) => h * 60 + m;
const sched = (venueId, courtId, startH, startM = 0, date = DAY) => ({ venueId, courtId, date, startMin: HM(startH, startM), endMin: HM(startH, startM) + 30 });
const M = (id, a, b, s, extra = {}) => ({ id, participantIds: [a, b], participantNames: [`Team ${a}`, `Team ${b}`], status: 'scheduled', sched: s, ...extra });

const PHONES = { r1: '09171110001', r2: '09171110002', r3: '09171110003', r4: '09171110004' };
const PLAYER = (r) => runner.normalizePhone(PHONES[r]);

async function seed({ published = true, notifications, pending = false, dates = [DAY] } = {}) {
  store.clear(); pushCalls.length = 0;
  await fakeDb.doc(TP).set({
    name: 'Test Cup', status: 'open', venues: VENUES,
    scheduleConfig: { days: [{ date: DAY, startMin: HM(8), endMin: HM(18) }], matchMinutes: 30, restMinutes: 15, travelBufferMinutes: 30, primaryVenueId: 'club' },
    schedule: { status: published ? 'published' : 'draft' },
    ...(notifications ? { notifications } : {}),
  });
  await fakeDb.doc(`${TP}/divisions/D1`).set({ name: "Men's Doubles", format: 'group_knockout' });
  for (const r of ['r1', 'r2', 'r3', 'r4']) {
    await fakeDb.doc(`${TP}/registrations/${r}`).set({ divisionId: 'D1', status: 'approved', playerIds: [PLAYER(r), `${PLAYER(r)}b`], playerNames: [`${r} A`, `${r} B`], registeredAt: { seconds: 1000 } });
  }
  await fakeDb.doc(`clients/${CID}/courts/state`).set({ data: [{ id: 'court1', name: 'Main', active: true }, { id: 'court2', name: 'Two', active: true }] });
  await fakeDb.doc(`clients/${CID}/bookings/state`).set({ data: [] });
  await fakeDb.doc(`platformLiveTournaments/${CID}__${TID}`).set({ clientId: CID, tournamentId: TID, dates, pending });
}
const putMatch = (id, m) => fakeDb.doc(`${TP}/matches/${id}`).set({ divisionId: 'D1', stage: 'group', groupId: 'A', round: 1, position: 0, ...m });
async function subscribe(reg, n = 1) {
  for (let i = 0; i < n; i++) {
    await fakeDb.doc(`${TP}/pushSubs/${reg}_${i}`).set({ playerId: PLAYER(reg), regIds: [reg], endpoint: `https://fcm.googleapis.com/fcm/send/${reg}_${i}`, keys: { p256dh: 'BPk' + 'x'.repeat(20), auth: 'a'.repeat(12) }, createdAtMs: 1 });
  }
}
const send = async (sub, payload) => {
  if (send.gone && send.gone.has(sub.id)) return { gone: true };
  pushCalls.push({ id: sub.id, payload });
  return { ok: true };
};
send.gone = null;
const run = (nowMs) => runner.runNotifier({ db: fakeDb, send, nowMs });
const sentTo = (id) => pushCalls.filter((c) => c.id.startsWith(id)).map((c) => c.payload);
const state = async () => (await fakeDb.doc(`${TP}/notifyState/state`).get()).data();
const outbox = async () => (await fakeDb.collection(`${TP}/notifyOutbox`).get()).docs.map((d) => ({ id: d.id, ...d.data() }));
const registry = async () => (await fakeDb.doc(`platformLiveTournaments/${CID}__${TID}`).get()).data();

(async () => {
  /* ============================ ENGINE ============================ */
  section('config + time');
  check('defaults: on, 15 min, reassignments on, Manila', eq([cfg.enabled, cfg.leadMinutes, cfg.reassignments, cfg.utcOffsetMin], [true, 15, true, 480]));
  const c2 = notifier.normalizeNotifyConfig({ enabled: false, leadMinutes: 30, reassignments: false, utcOffsetMin: 420 });
  check('explicit settings are kept', eq([c2.enabled, c2.leadMinutes, c2.reassignments, c2.utcOffsetMin], [false, 30, false, 420]));
  const c3 = notifier.normalizeNotifyConfig({ leadMinutes: 7, utcOffsetMin: 99999 });
  check('junk falls back to defaults (lead must be a listed option, offset in range)', c3.leadMinutes === 15 && c3.utcOffsetMin === 480);
  check('slotStartMs turns a local 8:00 AM into 00:00 UTC', notifier.slotStartMs({ date: DAY, startMin: HM(8) }, 480) === Date.UTC(2026, 9, 10, 0, 0));
  check('localNow round-trips', eq(notifier.localNow(at(DAY, 14, 5), 480), { date: DAY, min: HM(14, 5) }));
  check('localNow crosses the date line correctly (11 PM local is next day UTC minus 8h)', eq(notifier.localNow(Date.UTC(2026, 9, 10, 15, 30), 480), { date: '2026-10-10', min: HM(23, 30) }));
  check('addDays handles month ends', notifier.addDays('2026-10-31', 1) === '2026-11-01' && notifier.addDays('2026-01-01', -1) === '2025-12-31');
  check('fmtClock', notifier.fmtClock(HM(0)) === '12:00 AM' && notifier.fmtClock(HM(13, 5)) === '1:05 PM' && notifier.fmtClock(HM(12)) === '12:00 PM');

  section('push endpoint allow-list');
  const ok = ['https://fcm.googleapis.com/fcm/send/abc', 'https://updates.push.services.mozilla.com/wpush/v2/x', 'https://web.push.apple.com/Q1', 'https://wns2-par02p.notify.windows.com/w/?token=x'];
  const bad = ['http://fcm.googleapis.com/x', 'https://evil.example.com/x', 'https://fcm.googleapis.com.evil.com/x', 'https://evilfcm.googleapis.com.attacker.io/x', 'https://user:pw@fcm.googleapis.com/x', 'https://fcm.googleapis.com:8443/x', 'ftp://fcm.googleapis.com/x', 'not a url', '', null, 'https://169.254.169.254/latest/meta-data', 'https://localhost/x'];
  check('real push services are accepted', ok.every(notifier.isAllowedPushEndpoint));
  check('everything else is refused (SSRF guard)', bad.every((u) => !notifier.isAllowedPushEndpoint(u)), bad.filter(notifier.isAllowedPushEndpoint).join(','));
  check('a very long endpoint is refused', !notifier.isAllowedPushEndpoint('https://fcm.googleapis.com/' + 'a'.repeat(1100)));

  section('quiet hours');
  const can = (h, m, live) => notifier.canSendChangesNow(at(DAY, h, m), cfg, live);
  check('daytime changes go out', can(7, 0) && can(12, 0) && can(21, 59));
  check('10 PM - 7 AM changes are held', !can(22, 0) && !can(23, 30) && !can(0, 0) && !can(6, 30) && !can(6, 59));
  check('live play overrides the quiet window', can(23, 0, true) && can(3, 0, true));
  const liveMatches = [M('a', 'r1', 'r2', sched('club', 'k1', 22, 30))];
  check('play within an hour of a match counts as live', notifier.isLivePlay(liveMatches, at(DAY, 22, 0), cfg) && notifier.isLivePlay(liveMatches, at(DAY, 23, 30), cfg));
  check('no match nearby -> not live', !notifier.isLivePlay(liveMatches, at(DAY, 20, 0), cfg) && !notifier.isLivePlay([], at(DAY, 23, 0), cfg));

  section('Up Next reminders');
  const m10 = M('m10', 'r1', 'r2', sched('club', 'k1', 10, 0));
  const due = (matches, h, m, reminded, over) => notifier.planReminders({ matches, cfg: { ...cfg, ...(over || {}) }, nowMs: at(DAY, h, m), reminded });
  check('nothing before the lead window', due([m10], 9, 44).due.length === 0);
  check('due exactly at 15 minutes out', due([m10], 9, 45).due.length === 1 && due([m10], 9, 45).due[0].minutesLeft === 15);
  check('still due until 30 minutes after the start (late release)', due([m10], 10, 30).due.length === 1 && due([m10], 10, 31).due.length === 0);
  check('a different lead time is honoured', due([m10], 9, 30, {}, { leadMinutes: 30 }).due.length === 1 && due([m10], 9, 44, {}, { leadMinutes: 5 }).due.length === 0);
  check('a reminder already sent is not repeated', due([m10], 9, 50, { [notifier.reminderKey(m10)]: 1 }).due.length === 0);
  check('rescheduling the match makes a fresh reminder possible (key includes the slot)', notifier.reminderKey(m10) !== notifier.reminderKey({ ...m10, sched: sched('club', 'k2', 10, 0) }));
  check('played, bye, unscheduled matches never remind', due([{ ...m10, status: 'completed' }, { ...m10, id: 'b', participantIds: ['r1', 'BYE'] }, { ...m10, id: 'c', sched: null }], 9, 50).due.length === 0);
  const prevDone = M('p', 'r3', 'r4', sched('club', 'k1', 9, 0), { status: 'completed' });
  const prevOverran = M('p', 'r3', 'r4', sched('club', 'k1', 9, 0));
  const prevOtherCourt = M('p', 'r3', 'r4', sched('club', 'k2', 9, 0));
  const prevRunning = M('p', 'r3', 'r4', sched('club', 'k1', 9, 30));
  check('court free (previous match completed) -> reminder goes out', due([m10, prevDone], 9, 45).due.length === 1);
  const overran = due([m10, prevOverran], 9, 45);
  check('COURT DELAYED: previous match overran and is unfinished -> reminder held', overran.due.length === 0 && overran.held.length === 1);
  check('a delay on a different court does not hold it', due([m10, prevOtherCourt], 9, 45).due.length === 1);
  check('previous match still inside its window (not yet overrun) does not hold it', due([m10, prevRunning], 9, 45).due.some((d) => d.match.id === 'm10') && due([m10, prevRunning], 9, 45).held.length === 0);
  check('held reminder is released once the court frees up', due([m10, { ...prevOverran, status: 'completed' }], 9, 55).due.length === 1);
  check('a hold cannot last forever: it expires 30 min after the start', due([m10, prevOverran], 10, 31).due.length === 0 && due([m10, prevOverran], 10, 31).held.length === 0);

  section('message copy');
  const slotMatch = M('mx', 'r1', 'r2', sched('sat', 's1', 14, 30));
  const rem = notifier.msgReminder({ match: slotMatch, sideIndex: 0, venues: VENUES, cfg, nowMs: at(DAY, 14, 15), minutesLeft: 15 });
  check('reminder names opponent, venue, court and lead time', rem.title.includes('Up Next') && rem.body === 'Your match against Team r2 starts in 15 mins at Satellite Hall on Court A. Warm up now!', rem.body);
  const remB = notifier.msgReminder({ match: slotMatch, sideIndex: 1, venues: VENUES, cfg, nowMs: at(DAY, 14, 15), minutesLeft: 15 });
  check('the other team sees ITS opponent', remB.body.includes('against Team r1'));
  const remLate = notifier.msgReminder({ match: slotMatch, sideIndex: 0, venues: VENUES, cfg, nowMs: at(DAY, 14, 40), minutesLeft: -10 });
  check('after a court delay the copy says the court is free, not "starts in -10"', remLate.body.includes('court is free now') && !/-\d/.test(remLate.body));
  check('1 minute is singular', notifier.msgReminder({ match: slotMatch, sideIndex: 0, venues: VENUES, cfg, nowMs: at(DAY, 14, 29), minutesLeft: 1 }).body.includes('starts in 1 min at'));
  const chg = notifier.msgMatchChange({ match: slotMatch, sideIndex: 0, venues: VENUES, cfg, nowMs: at(DAY, 9, 0), prevKnown: true });
  check('move message: "moved to Venue - Court at time"', chg.title.includes('Location / Schedule Change') && chg.body === 'Your match against Team r2 has been moved to Satellite Hall - Court A at 2:30 PM.', chg.body);
  const nextDay = { ...slotMatch, sched: sched('sat', 's1', 9, 0, '2026-10-11') };
  check('a move to another day names the day', notifier.msgMatchChange({ match: nextDay, sideIndex: 0, venues: VENUES, cfg, nowMs: at(DAY, 9, 0), prevKnown: true }).body.includes('Sun Oct 11, 9:00 AM'));
  check('first-time scheduling reads as "scheduled", not "moved"', notifier.msgMatchChange({ match: slotMatch, sideIndex: 0, venues: VENUES, cfg, nowMs: at(DAY, 9, 0), prevKnown: false }).title.includes('Match Scheduled'));
  check('taken off the schedule says a new time is coming', /off the schedule.*new time/.test(notifier.msgMatchChange({ match: { ...slotMatch, sched: null }, sideIndex: 0, venues: VENUES, cfg, nowMs: at(DAY, 9, 0), prevKnown: true }).body));
  check('unknown venue/court ids degrade gracefully', notifier.msgMatchChange({ match: M('z', 'r1', 'r2', sched('gone', 'gone', 9)), sideIndex: 0, venues: VENUES, cfg, nowMs: at(DAY, 8, 0), prevKnown: true }).body.includes('the venue'));
  check('schedule-live message matches the spec', notifier.msgPublish().title.includes('The schedule is live!') && /pool assignments, match times, venues, and court numbers/.test(notifier.msgPublish().body));
  check('round names', eq([2, 3, 4, 5, 8, 9, 16, 17].map(notifier.knockoutRoundName), ['Final', 'Semifinals', 'Semifinals', 'Quarterfinals', 'Quarterfinals', 'Round of 16', 'Round of 16', 'Round of 32']));
  const q = notifier.msgQualified({ divisionName: "Men's Doubles", advancerCount: 8, nextMatch: slotMatch, venues: VENUES, cfg, nowMs: at(DAY, 9, 0) });
  check('qualified copy names round, division, venue, court, time', q.title.includes("You've Qualified") && q.body === "You have advanced to the Quarterfinals in Men's Doubles. Your next match is at Satellite Hall on Court A at 2:30 PM.", q.body);
  check('qualified before a time exists says it will be announced', /announced soon/.test(notifier.msgQualified({ divisionName: 'X', advancerCount: 4, nextMatch: null, venues: VENUES, cfg, nowMs: 0 }).body));
  const co = notifier.coalesceForRecipient([chg, chg]);
  check('two change alerts for one person collapse into one digest', co.length === 1 && co[0].title.includes('updates') && co[0].body.includes('2 updates'));
  check('a single change stays as is', notifier.coalesceForRecipient([chg]).length === 1 && notifier.coalesceForRecipient([chg])[0] === chg);
  const co2 = notifier.coalesceForRecipient([rem, chg, chg]);
  check('reminders are never folded into a digest', co2.length === 2 && co2[0] === rem);

  section('phone normalisation matches the pages');
  const grab = (file) => { const src = fs.readFileSync(path.join(__dirname, '..', file), 'utf8'); const m = src.match(/function normalizePhone\(raw\)\{[\s\S]*?\n\}/); return m ? new Function(`${m[0]}; return normalizePhone;`)() : null; };
  const adminNorm = grab('tournament-admin.html'), publicNorm = grab('tournament.html');
  const samples = ['0917 111 0001', '+63 917 111 0001', '9171110001', '(0917)-111-0001', '639171110001', '', null, 'abc', '0917-111-0001 loc 2'];
  check('admin page normalizePhone found', typeof adminNorm === 'function');
  check('public page normalizePhone found', typeof publicNorm === 'function');
  check('server, admin page and public page agree on every sample', adminNorm && publicNorm && samples.every((s) => runner.normalizePhone(s) === adminNorm(s) && adminNorm(s) === publicNorm(s)), samples.map((s) => [runner.normalizePhone(s), adminNorm && adminNorm(s), publicNorm && publicNorm(s)].join('/')).join(' | '));

  /* ============================ RUNNER ============================ */
  section('runner: reminders');
  await seed();
  await putMatch('m1', M('m1', 'r1', 'r2', sched('club', 'k1', 10, 0)));
  await putMatch('m2', M('m2', 'r3', 'r4', sched('club', 'k1', 10, 30)));
  await putMatch('m3', M('m3', 'r1', 'r3', sched('sat', 's1', 12, 0)));
  await subscribe('r1'); await subscribe('r2'); await subscribe('r3');
  await run(at(DAY, 9, 44));
  check('nothing at 9:44', pushCalls.length === 0);
  const r945 = await run(at(DAY, 9, 45));
  check('at 9:45 both teams of the 10:00 match are alerted', pushCalls.length === 2 && sentTo('r1').length === 1 && sentTo('r2').length === 1 && r945.sent === 2, JSON.stringify(pushCalls));
  check('each sees the right opponent', sentTo('r1')[0].body.includes('against Team r2') && sentTo('r2')[0].body.includes('against Team r1'));
  check('payload links to My Matches on this tournament', sentTo('r1')[0].url === `/tournament.html?client=${CID}&t=${TID}#my`);
  check('tag lets a later local alert replace it', sentTo('r1')[0].tag === 'rem-m1');
  await run(at(DAY, 9, 46)); await run(at(DAY, 9, 59));
  check('exactly once, however often the job runs', pushCalls.length === 2);
  const st = await state();
  check('state remembers it and the lock is released', Object.keys(st.reminded).length === 1 && st.lockUntil === 0);
  await run(at(DAY, 10, 15));
  check('10:15: the 10:30 match alerts r3 (subscribed) but not r4 (not subscribed)', sentTo('r3').length === 1 && pushCalls.length === 3);

  section('runner: court delayed');
  await seed();
  await putMatch('m1', M('m1', 'r1', 'r2', sched('club', 'k1', 9, 0)));
  await putMatch('m2', M('m2', 'r3', 'r4', sched('club', 'k1', 10, 0)));
  await subscribe('r3');
  await run(at(DAY, 9, 45));
  check('previous match overran (unscored) -> 10:00 reminder held', pushCalls.length === 0);
  await run(at(DAY, 9, 50));
  check('still held while the court is busy', pushCalls.length === 0);
  await fakeDb.doc(`${TP}/matches/m1`).update({ status: 'completed' });
  await run(at(DAY, 9, 52));
  check('court freed -> released', pushCalls.length === 1 && /starts in 8 mins/.test(pushCalls[0].payload.body), JSON.stringify(pushCalls));

  section('runner: organizer changes, quiet hours, digest');
  await seed({ pending: true });
  await putMatch('m1', M('m1', 'r1', 'r2', sched('club', 'k1', 15, 0)));
  await putMatch('m2', M('m2', 'r1', 'r3', sched('sat', 's1', 16, 0)));
  await subscribe('r1'); await subscribe('r2');
  await fakeDb.doc(`${TP}/notifyOutbox/m_m1`).set({ type: 'match_change', matchId: 'm1', prevKnown: true, createdAtMs: at(DAY, 9, 0) });
  await run(at(DAY, 9, 5));
  check('daytime move: both teams told immediately', sentTo('r1').length === 1 && sentTo('r2').length === 1 && /moved to Sports Zone Main - Court 1 at 3:00 PM/.test(sentTo('r1')[0].body), JSON.stringify(sentTo('r1')));
  check('outbox emptied and pending cleared', (await outbox()).length === 0 && (await registry()).pending === false);

  pushCalls.length = 0;
  await fakeDb.doc(`${TP}/notifyOutbox/m_m1`).set({ type: 'match_change', matchId: 'm1', prevKnown: true, createdAtMs: at(DAY, 22, 30) });
  await run(at(DAY, 23, 0));
  check('11 PM change is muted', pushCalls.length === 0 && (await outbox()).length === 1);
  await run(at('2026-10-11', 6, 30));
  check('still muted at 6:30 AM', pushCalls.length === 0);
  const r7 = await run(at('2026-10-11', 7, 0));
  check('released at exactly 7:00 AM', pushCalls.length === 2 && r7.sent === 2 && (await outbox()).length === 0, `sent ${pushCalls.length}`);

  pushCalls.length = 0;
  await fakeDb.doc(`${TP}/notifyOutbox/m_m1`).set({ type: 'match_change', matchId: 'm1', prevKnown: true, createdAtMs: at(DAY, 22, 40) });
  await fakeDb.doc(`${TP}/notifyOutbox/m_m2`).set({ type: 'match_change', matchId: 'm2', prevKnown: true, createdAtMs: at(DAY, 22, 40) });
  await fakeDb.doc(`${TP}/matches/m1`).update({ sched: sched('club', 'k1', 22, 45) });
  await fakeDb.doc(`platformLiveTournaments/${CID}__${TID}`).set({ clientId: CID, tournamentId: TID, dates: [DAY], pending: true });
  await run(at(DAY, 22, 50));
  const tagged = (id, t) => sentTo(id).filter((p) => p.tag === t);
  check('live play (a match is on) overrides the mute; r1 has two changes -> ONE digest (plus its own Up Next)', tagged('r1', 'digest').length === 1 && sentTo('r1').filter((p) => p.tag.startsWith('chg-')).length === 0 && tagged('r1', 'rem-m1').length === 1, JSON.stringify(sentTo('r1')));
  check('r2 (one change) gets the plain message', tagged('r2', 'chg-m1').length === 1 && tagged('r2', 'digest').length === 0);

  section('runner: publish, qualified, no-ops');
  await seed({ pending: true });
  await putMatch('m1', M('m1', 'r1', 'r2', sched('club', 'k1', 15, 0)));
  await subscribe('r1'); await subscribe('r4');
  await fakeDb.doc(`${TP}/notifyOutbox/publish`).set({ type: 'publish', createdAtMs: at(DAY, 8, 0) });
  await run(at(DAY, 8, 1));
  check('"schedule is live" goes to every subscriber, whatever their match', pushCalls.length === 2 && pushCalls.every((c) => c.payload.title.includes('The schedule is live')));

  pushCalls.length = 0;
  await fakeDb.doc(`${TP}/matches/k1`).set({ divisionId: 'D1', stage: 'knockout', round: 1, position: 0, participantIds: ['r1', 'r2'], participantNames: ['Team r1', 'Team r2'], status: 'scheduled', sched: sched('club', 'k1', 17, 0) });
  await fakeDb.doc(`${TP}/matches/k2`).set({ divisionId: 'D1', stage: 'knockout', round: 1, position: 1, participantIds: ['r3', 'r4'], participantNames: ['Team r3', 'Team r4'], status: 'scheduled' });
  await fakeDb.doc(`${TP}/notifyOutbox/q_D1`).set({ type: 'qualified', divisionId: 'D1', divisionName: "Men's Doubles", advancerCount: 4, participantIds: ['r1', 'r2', 'r3', 'r4'], createdAtMs: at(DAY, 12, 0) });
  await fakeDb.doc(`platformLiveTournaments/${CID}__${TID}`).set({ clientId: CID, tournamentId: TID, dates: [DAY], pending: true });
  await run(at(DAY, 12, 1));
  const qr1 = sentTo('r1'), qr4 = sentTo('r4');
  check('qualifiers are told the round and, when known, the court and time', qr1.length === 1 && /Semifinals in Men's Doubles\. Your next match is at Sports Zone Main on Court 1 at 5:00 PM/.test(qr1[0].body), qr1[0] && qr1[0].body);
  check('a qualifier whose match is not yet scheduled hears the time is coming', qr4.length === 1 && /announced soon/.test(qr4[0].body));

  pushCalls.length = 0;
  await seed({ pending: true, notifications: { reassignments: false } });
  await putMatch('m1', M('m1', 'r1', 'r2', sched('club', 'k1', 15, 0)));
  await subscribe('r1');
  await fakeDb.doc(`${TP}/notifyOutbox/m_m1`).set({ type: 'match_change', matchId: 'm1', prevKnown: true, createdAtMs: at(DAY, 9, 0) });
  await run(at(DAY, 9, 5));
  check('"dispatch alerts for reassignments" OFF drops the change alert (and clears it)', pushCalls.length === 0 && (await outbox()).length === 0);

  await seed({ pending: true, notifications: { enabled: false } });
  await putMatch('m1', M('m1', 'r1', 'r2', sched('club', 'k1', 10, 0)));
  await subscribe('r1');
  await fakeDb.doc(`${TP}/notifyOutbox/publish`).set({ type: 'publish', createdAtMs: at(DAY, 8, 0) });
  await run(at(DAY, 9, 50));
  check('notifications switched off: nothing is sent and the queue is cleared', pushCalls.length === 0 && (await outbox()).length === 0);

  await seed({ dates: [DAY, '2026-10-14'] });
  await putMatch('m1', M('m1', 'r1', 'r2', sched('club', 'k1', 10, 0)));
  await subscribe('r1');
  const before = store.size;
  await run(at('2026-10-12', 9, 50));
  check('a day with nothing on and no pending work does no work at all', pushCalls.length === 0 && store.size === before);

  await seed();
  await putMatch('m1', M('m1', 'r1', 'r2', sched('club', 'k1', 10, 0)));
  await run(at(DAY, 9, 50));
  check('nobody subscribed -> nothing to send, nothing breaks', pushCalls.length === 0);

  section('runner: housekeeping');
  await seed({ published: false });
  await run(at(DAY, 9, 50));
  check('an unpublished schedule removes the tournament from the live list', (await registry()) === undefined);
  await seed({ dates: ['2026-10-01'] });
  await run(at('2026-10-10', 12, 0));
  check('a tournament that ended days ago drops off the live list', (await registry()) === undefined);
  await seed();
  await fakeDb.doc(TP).set({ status: 'cancelled' }, { merge: true });
  await run(at(DAY, 9, 50));
  check('a cancelled tournament drops off too', (await registry()) === undefined);

  await seed();
  await putMatch('m1', M('m1', 'r1', 'r2', sched('club', 'k1', 10, 0)));
  await subscribe('r1'); await subscribe('r2');
  send.gone = new Set(['r2_0']);
  await run(at(DAY, 9, 50));
  send.gone = null;
  check('a device the push service says is gone (410) is forgotten', !(await fakeDb.doc(`${TP}/pushSubs/r2_0`).get()).exists && (await fakeDb.doc(`${TP}/pushSubs/r1_0`).get()).exists);

  await seed();
  await putMatch('m1', M('m1', 'r1', 'r2', sched('club', 'k1', 10, 0)));
  await subscribe('r1');
  await fakeDb.doc(`${TP}/notifyState/state`).set({ lockUntil: at(DAY, 9, 51), reminded: {} });
  await run(at(DAY, 9, 50));
  check('a concurrent run (lock held) does nothing', pushCalls.length === 0);
  await run(at(DAY, 9, 53));
  check('an expired lock does not block forever', pushCalls.length === 1);

  await seed();
  await putMatch('m1', M('m1', 'r1', 'r2', sched('club', 'k1', 10, 0)));
  await subscribe('r1');
  const boom = await runner.runNotifier({ db: fakeDb, send: async () => { throw new Error('push service down'); }, nowMs: at(DAY, 9, 50) });
  check('a failing push service does not crash the run or repeat the alert', boom.errors === 0 && Object.keys((await state()).reminded).length === 1);

  /* ======================= SUBSCRIPTIONS ======================= */
  section('subscribe / unsubscribe');
  await seed();
  const goodSub = { endpoint: 'https://fcm.googleapis.com/fcm/send/abcDEF123', keys: { p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM', auth: 'tBHItJI5svbpez7KI4CCXg' } };
  const sends = [];
  const reg1 = await runner.registerSubscription({ db: fakeDb, clientId: CID, tournamentId: TID, phone: '0917 111 0001', subscription: goodSub, send: async (s, p) => sends.push([s, p]) });
  check('a registered number can subscribe; it is linked to their registration', reg1.registrations === 1 && reg1.names[0] === 'r1 A & r1 B');
  const stored = (await fakeDb.doc(`${TP}/pushSubs/${reg1.subscriptionId}`).get()).data();
  check('stored server-side with player id and registration ids', stored.playerId === PLAYER('r1') && eq(stored.regIds, ['r1']) && stored.endpoint === goodSub.endpoint);
  check('a confirmation push is sent straight away', sends.length === 1 && sends[0][1].title.includes('Match alerts are on') && sends[0][1].url.includes('#my'));
  await runner.registerSubscription({ db: fakeDb, clientId: CID, tournamentId: TID, phone: '09171110001', subscription: goodSub });
  check('subscribing the same device again does not duplicate it', (await fakeDb.collection(`${TP}/pushSubs`).get()).size === 1);
  const rej = async (over) => { try { await runner.registerSubscription({ db: fakeDb, clientId: CID, tournamentId: TID, phone: '09171110001', subscription: goodSub, ...over }); return null; } catch (e) { return e.code; } };
  check('an unregistered number is refused', await rej({ phone: '09990000000' }) === 'not-found');
  check('a junk number is refused', await rej({ phone: '12' }) === 'invalid-argument');
  check('a non-push endpoint is refused', await rej({ subscription: { ...goodSub, endpoint: 'https://evil.example.com/x' } }) === 'invalid-argument');
  check('bad keys are refused', await rej({ subscription: { ...goodSub, keys: { p256dh: '<script>', auth: 'x' } } }) === 'invalid-argument' && await rej({ subscription: { endpoint: goodSub.endpoint } }) === 'invalid-argument');
  check('withdrawn registrations do not count', await (async () => { await fakeDb.doc(`${TP}/registrations/r4`).update({ status: 'withdrawn' }); return rej({ phone: '09171110004' }); })() === 'not-found');
  for (let i = 0; i < 7; i++) await runner.registerSubscription({ db: fakeDb, clientId: CID, tournamentId: TID, phone: '09171110002', subscription: { ...goodSub, endpoint: `https://fcm.googleapis.com/fcm/send/dev${i}` } });
  check('a person can have at most 5 devices (oldest replaced)', (await fakeDb.collection(`${TP}/pushSubs`).get()).docs.filter((d) => d.data().playerId === PLAYER('r2')).length === 5);
  await runner.removeSubscription({ db: fakeDb, clientId: CID, tournamentId: TID, endpoint: goodSub.endpoint });
  check('unsubscribe removes the device', !(await fakeDb.doc(`${TP}/pushSubs/${reg1.subscriptionId}`).get()).exists);
  const partner = await runner.registerSubscription({ db: fakeDb, clientId: CID, tournamentId: TID, phone: `${PHONES.r3.replace(/^0/, '+63')}`, subscription: { ...goodSub, endpoint: 'https://fcm.googleapis.com/fcm/send/partner' } });
  check('+63 formatting resolves to the same registration', partner.registrations === 1);
  const partnerB = await runner.registerSubscription({ db: fakeDb, clientId: CID, tournamentId: TID, phone: `${PHONES.r3}b`.replace('b', ''), subscription: { ...goodSub, endpoint: 'https://fcm.googleapis.com/fcm/send/partner2' } });
  check('either partner (player ids) can subscribe', partnerB.registrations === 1);

  /* ======================= CALLABLE HOOKS ======================= */
  section('callable hooks (real index.js)');
  await seed({ published: false });
  store.delete(`platformLiveTournaments/${CID}__${TID}`);
  await putMatch('m1', M('m1', 'r1', 'r2', sched('club', 'k1', 9, 0)));
  await putMatch('m2', M('m2', 'r3', 'r4', sched('club', 'k2', 9, 0)));
  const call = (name, data) => fns[name]({ data: { clientId: CID, tournamentId: TID, ...data } });
  await call('publishSchedule', {});
  const reg = await registry();
  check('publishing registers the tournament for the notifier with its match days', reg && eq(reg.dates, [DAY]) && reg.pending === true, JSON.stringify(reg));
  check('and queues exactly one "schedule is live" alert', eq((await outbox()).map((o) => o.type), ['publish']));
  await call('publishSchedule', {});
  check('re-publishing an already-live schedule does not queue another', (await outbox()).length === 1);

  await fakeDb.doc(`${TP}/notifyOutbox/publish`).delete();
  await call('moveMatch', { matchId: 'm1', sched: { venueId: 'club', courtId: 'k1', date: DAY, startMin: HM(14) } });
  const ob = await outbox();
  check('moving a live match queues one alert for it, remembering it had a slot', ob.length === 1 && ob[0].id === 'm_m1' && ob[0].type === 'match_change' && ob[0].prevKnown === true, JSON.stringify(ob));
  await call('moveMatch', { matchId: 'm1', sched: { venueId: 'club', courtId: 'k1', date: DAY, startMin: HM(14, 30) } });
  check('moving it again keeps one pending alert per match', (await outbox()).length === 1);
  await call('moveMatch', { matchId: 'm1', sched: { venueId: 'club', courtId: 'k1', date: DAY, startMin: HM(14, 30) } });
  check('a no-op "move" queues nothing new', (await outbox()).length === 1);
  await call('moveMatch', { matchId: 'm2', sched: null });
  check('taking a match off the schedule queues an alert too', (await outbox()).some((o) => o.id === 'm_m2' && o.prevKnown === true));
  await fakeDb.doc(`${TP}/matches/m3`).set({ divisionId: 'D1', stage: 'group', groupId: 'A', round: 2, position: 0, ...M('m3', 'r1', 'r3', null) });
  await call('generateSchedule', {});
  const ob2 = await outbox();
  const m3Alert = ob2.find((o) => o.id === 'm_m3');
  check('generating times for an unscheduled match on a live schedule says "scheduled" (no previous slot)', m3Alert && m3Alert.prevKnown === false, JSON.stringify(ob2));
  check('generating does not re-alert matches whose slot did not change', ob2.filter((o) => o.id === 'm_m1').length === 1);

  await call('publishSchedule', { publish: false });
  check('taking the schedule back to draft removes it from the notifier and discards waiting alerts', (await registry()) === undefined && (await outbox()).length === 0);
  await call('moveMatch', { matchId: 'm1', sched: { venueId: 'club', courtId: 'k1', date: DAY, startMin: HM(15) } });
  check('editing a DRAFT schedule alerts nobody', (await outbox()).length === 0 && (await registry()) === undefined);

  const reach = await call('getAlertReach', {});
  check('organizer reach counts registered players vs. devices', reach.players === 8 && typeof reach.reached === 'number' && typeof reach.devices === 'number', JSON.stringify(reach));
  const viaCallable = await call('subscribeMatchAlerts', { phone: '09171110001', subscription: { ...goodSub, endpoint: 'https://fcm.googleapis.com/fcm/send/viaCallable' } });
  check('subscribe callable works end to end and sends the confirmation through web-push', viaCallable.registrations === 1 && pushCalls.some((c) => c.endpoint.endsWith('viaCallable') && c.payload.title.includes('alerts are on')));
  const errCode = async (p) => { try { await p; return null; } catch (e) { return e.code; } };
  check('callable maps problems to proper error codes', await errCode(call('subscribeMatchAlerts', { phone: '09990001111', subscription: goodSub })) === 'not-found' && await errCode(call('subscribeMatchAlerts', { phone: '09171110001', subscription: { ...goodSub, endpoint: 'https://evil.example.com/x' } })) === 'invalid-argument');
  check('bad tenant id rejected', await errCode(fns.subscribeMatchAlerts({ data: { clientId: 'BAD ID', tournamentId: TID, phone: '1', subscription: goodSub } })) === 'invalid-argument');
  await fakeDb.doc(`platformLiveTournaments/${CID}__${TID}`).set({ clientId: CID, tournamentId: TID, dates: [DAY], pending: false });
  await fakeDb.doc(TP).set({ schedule: { status: 'published' } }, { merge: true });
  check('the scheduled job entry point runs the runner', await (async () => { await fns.tournamentNotifier(); return true; })());

  console.log(`\n=== MATCH ALERTS: ${passed}/${passed + failed} passed ===`);
  process.exit(failed === 0 ? 0 : 1);
})().catch((e) => { console.log('\nUNCAUGHT:', e.stack || e); process.exit(1); });
