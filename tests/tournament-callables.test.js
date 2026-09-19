/* ================================================================
   Tournament Cloud Functions -- integration test against an in-memory
   Firestore. Loads the REAL functions/index.js (firebase-admin and
   firebase-functions are swapped for test doubles) and drives a whole
   tournament through it: registrations -> pool plan -> bracket ->
   multi-venue schedule -> publish -> scores -> playoffs -> playoff
   schedule. Nothing here needs a Firebase project or billing.

   The fake Firestore is deliberately strict where the real one is:
   undefined field values throw, writes to missing docs via update() throw,
   and batch/transaction semantics match what the code relies on.

   Usage:  node tests/tournament-callables.test.js
   ================================================================ */
const Module = require('module');
const path = require('path');

/* ---------------- in-memory Firestore ---------------- */
const store = new Map();
const DELETE = { __delete: true };
const TS = { __ts: true };
const isPlain = (v) => v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date) && v !== DELETE && v !== TS;

function resolveValue(v, where) {
  if (v === undefined) throw new Error(`Unsupported field value: undefined (${where})`);
  if (v === TS) return new Date();
  if (Array.isArray(v)) return v.map((x, i) => resolveValue(x, `${where}[${i}]`));
  if (isPlain(v)) {
    const out = {};
    for (const [k, x] of Object.entries(v)) { if (x !== DELETE) out[k] = resolveValue(x, `${where}.${k}`); }
    return out;
  }
  return v;
}
function applyWrite(existing, incoming, merge, where) {
  const out = merge && existing ? structuredClone(existing) : {};
  for (const [k, v] of Object.entries(incoming)) {
    if (v === DELETE) delete out[k];
    else if (merge && isPlain(v) && isPlain(out[k])) out[k] = applyWrite(out[k], v, true, `${where}.${k}`);
    else out[k] = resolveValue(v, `${where}.${k}`);
  }
  return out;
}

class DocRef {
  constructor(p) { this.path = p; this.id = p.split('/').pop(); }
  async get() { return new Snap(this, store.has(this.path) ? structuredClone(store.get(this.path)) : null); }
  async set(data, opts) { store.set(this.path, applyWrite(store.get(this.path), data, !!(opts && opts.merge), this.path)); }
  // update() replaces only the top-level fields it names and keeps the rest
  async update(data) {
    if (!store.has(this.path)) throw new Error(`NOT_FOUND: no document to update: ${this.path}`);
    const cur = structuredClone(store.get(this.path));
    for (const [k, v] of Object.entries(data)) {
      if (v === DELETE) delete cur[k];
      else cur[k] = resolveValue(v, `${this.path}.${k}`);
    }
    store.set(this.path, cur);
  }
  async delete() { store.delete(this.path); }
  collection(name) { return new Query(`${this.path}/${name}`); }
}
class Snap {
  constructor(ref, data) { this.ref = ref; this.id = ref.id; this.exists = data !== null; this._d = data; }
  data() { return this._d === null ? undefined : structuredClone(this._d); }
}
class Query {
  constructor(p, filters = [], lim = null) { this.path = p; this.filters = filters; this.lim = lim; }
  doc(id) { return new DocRef(`${this.path}/${id || 'auto_' + Math.random().toString(36).slice(2, 10)}`); }
  async add(data) { const r = this.doc(); await r.set(data); return r; }
  where(f, op, v) { return new Query(this.path, [...this.filters, { f, op, v }], this.lim); }
  limit(n) { return new Query(this.path, this.filters, n); }
  orderBy() { return this; }
  async get() {
    let docs = [];
    for (const [p, data] of store) {
      if (p.startsWith(this.path + '/') && !p.slice(this.path.length + 1).includes('/')) docs.push(new Snap(new DocRef(p), structuredClone(data)));
    }
    this.filters.forEach(({ f, op, v }) => {
      docs = docs.filter((d) => {
        const x = d._d[f];
        if (op === '==') return x === v;
        if (op === '>=') return x >= v;
        throw new Error('unsupported op ' + op);
      });
    });
    if (this.lim != null) docs = docs.slice(0, this.lim);
    return { docs, empty: docs.length === 0, size: docs.length, forEach: (cb) => docs.forEach(cb) };
  }
}
const fakeDb = {
  doc: (p) => new DocRef(p),
  collection: (p) => new Query(p),
  batch() {
    const ops = [];
    return {
      set: (ref, data, opts) => ops.push(() => ref.set(data, opts)),
      update: (ref, data) => ops.push(() => ref.update(data)),
      delete: (ref) => ops.push(() => ref.delete()),
      commit: async () => { for (const op of ops) await op(); },
    };
  },
  async runTransaction(fn) {
    const writes = [];
    const tx = { get: (ref) => ref.get(), set: (ref, data, opts) => writes.push(() => ref.set(data, opts)), update: (ref, data) => writes.push(() => ref.update(data)) };
    const out = await fn(tx);
    for (const w of writes) await w();
    return out;
  },
};
class HttpsError extends Error { constructor(code, message, details) { super(message); this.code = code; this.details = details; } }
const fakeAdmin = { initializeApp() {}, firestore: Object.assign(() => fakeDb, { FieldValue: { serverTimestamp: () => TS, delete: () => DELETE } }) };
const origLoad = Module._load;
Module._load = function (request, ...rest) {
  if (request === 'firebase-admin') return fakeAdmin;
  if (request === 'firebase-functions/v2/https') return { onCall: (_opts, handler) => handler, HttpsError };
  return origLoad.call(this, request, ...rest);
};
const fns = require(path.join(__dirname, '..', 'functions', 'index.js'));

/* ---------------- harness ---------------- */
let passed = 0, failed = 0;
function check(name, ok, detail) { if (ok) passed++; else { failed++; console.log(`  FAIL: ${name}${detail ? ' -- ' + detail : ''}`); } }
const section = (t) => console.log(`\n${t}`);
const HM = (h, m = 0) => h * 60 + m;
const CID = 'demo', TID = 'T1';
const call = (name, data) => fns[name]({ data: { clientId: CID, tournamentId: TID, ...data } });
async function expectError(promise, code) { try { await promise; return null; } catch (e) { return e.code === code ? e : Object.assign(new Error('wrong error: ' + e.message), { wrong: true }); } }
const list = async (col) => (await fakeDb.collection(`clients/${CID}/tournaments/${TID}/${col}`).get()).docs.map((d) => ({ id: d.id, ...d.data() }));
const jsonSafe = (v) => { try { JSON.stringify(v); } catch { return false; } return !/"__/.test(JSON.stringify(v)); };

async function seed() {
  store.clear();
  await fakeDb.doc(`clients/${CID}/tournaments/${TID}`).set({
    name: 'Test Cup', status: 'open',
    venues: [
      { id: 'club', name: 'Sports Zone Main', address: '123 Premium St', kind: 'facility', courts: [{ id: 'k1', name: 'Court 1', tenantCourtId: 'court1' }, { id: 'k2', name: 'Court 2', tenantCourtId: 'court2' }] },
      { id: 'sat', name: 'Satellite Hall', address: '9 Side Rd', kind: 'external', courts: [{ id: 's1', name: 'Court A' }, { id: 's2', name: 'Court B' }, { id: 's3', name: 'Court C' }] },
    ],
    scheduleConfig: { days: [{ date: '2026-10-10', startMin: HM(8), endMin: HM(18) }], matchMinutes: 30, restMinutes: 15, travelBufferMinutes: 30, primaryVenueId: 'club' },
  });
  await fakeDb.doc(`clients/${CID}/tournaments/${TID}/divisions/D1`).set({ name: "Men's Doubles", format: 'group_knockout', seedingMethod: 'manual' });
  for (let i = 1; i <= 13; i++) {
    const id = 'r' + String(i).padStart(2, '0');
    await fakeDb.doc(`clients/${CID}/tournaments/${TID}/registrations/${id}`).set({
      divisionId: 'D1', status: 'approved', playerIds: [`p${id}a`, `p${id}b`], playerNames: [`Ann ${i}`, `Ben ${i}`], registeredAt: { seconds: 1000 + i },
    });
  }
  // a customer already booked court1 9-10 -- tournament must route around it
  await fakeDb.doc(`clients/${CID}/bookings/state`).set({ data: [{ id: 'cust1', name: 'Walk-in Wendy', court: 'court1', date: '2026-10-10', start: 9, end: 10, status: 'Reserved' }] });
}

(async () => {
  await seed();

  section('previewPoolPlan (organizer preview, nothing written)');
  const before = store.size;
  const prev = await call('previewPoolPlan', { divisionId: 'D1', groupConfig: { strategy: 'size', targetSize: 6 } });
  check('13 teams @6 -> pools of 7 and 6, 8-team playoff', prev.pools.poolSizes.join() === '7,6' && prev.advancement.count === 8);
  check('preview returns organizer copy and is JSON-safe', prev.messages.length >= 2 && jsonSafe(prev));
  check('preview writes nothing', store.size === before);
  const tiny = await call('previewPoolPlan', { teamCount: 2, groupConfig: {} });
  check('2 teams -> a friendly error message, not an exception', tiny.pools.ok === false && tiny.messages[0].level === 'error');

  section('generateBracket (group stage via poolPlanner)');
  const gen = await call('generateBracket', { divisionId: 'D1', groupConfig: { strategy: 'size', targetSize: 6 } });
  check('7-team pool (21) + 6-team pool (15) = 36 matches', gen.matchCount === 36, String(gen.matchCount));
  const div = (await fakeDb.doc(`clients/${CID}/tournaments/${TID}/divisions/D1`).get()).data();
  check('division remembers the config and plan', div.groupConfig.targetSize === 6 && div.bracketMeta.poolSizes.join() === '7,6' && div.bracketMeta.advancePlan.count === 8);
  check('pools A and B hold 7 and 6 teams', div.bracketMeta.groups[0].participants.length === 7 && div.bracketMeta.groups[1].participants.length === 6);
  const standings = (await fakeDb.doc(`clients/${CID}/tournaments/${TID}/standings/D1`).get()).data();
  check('group standings written for both pools', standings && standings.groupTables.length === 2);
  check('regenerating is refused', (await expectError(call('generateBracket', { divisionId: 'D1' }), 'already-exists')) === null ? false : true);

  section('previewSchedulePlan');
  const plan = await call('previewSchedulePlan', {});
  check('capacity is computed from the real matches (2 pools + playoffs)', plan.capacity.totalMatches >= 36 && plan.capacity.perVenue.length === 2, JSON.stringify(plan.capacity.perVenue.map((v) => v.matches)));
  check('progress shows nothing scheduled yet', plan.progress.total === 36 && plan.progress.scheduled === 0);
  check('preview is JSON-safe', jsonSafe(plan));

  section('generateSchedule');
  const bad = await expectError(fns.generateSchedule({ data: { clientId: CID, tournamentId: 'nope' } }), 'not-found');
  check('unknown tournament -> not-found', bad === null || !bad.wrong ? bad !== null : false);
  const sch = await call('generateSchedule', {});
  check('all 36 pool matches are placed', sch.scheduledCount === 36 && sch.unscheduled.length === 0, JSON.stringify(sch.unscheduled.slice(0, 2)));
  check('generateSchedule result is JSON-safe', jsonSafe(sch));
  check('generated schedule has zero validation errors', sch.errorCount === 0, JSON.stringify(sch.conflicts.filter((c) => c.severity === 'error').slice(0, 2)));
  const matches = await list('matches');
  const onClub = matches.filter((m) => m.sched.venueId === 'club');
  check('the customer\'s 9-10 booking on court1 is respected', !onClub.some((m) => m.sched.courtId === 'k1' && m.sched.startMin < HM(10) && m.sched.endMin > HM(9)));
  const poolVenue = {};
  matches.filter((m) => m.stage === 'group').forEach((m) => { (poolVenue[m.groupId] = poolVenue[m.groupId] || new Set()).add(m.sched.venueId); });
  check('pool isolation: each pool plays entirely at one venue', Object.values(poolVenue).every((s) => s.size === 1));
  check('schedule is a draft (nothing on the public calendar yet)', (await fakeDb.doc(`clients/${CID}/tournaments/${TID}`).get()).data().schedule.status === 'draft' && (await fakeDb.doc(`clients/${CID}/bookings/state`).get()).data().data.length === 1);
  const again = await call('generateSchedule', {});
  check('running it again is a no-op (idempotent)', again.scheduledCount === 0);

  section('validateSchedule / moveMatch');
  const v = await call('validateSchedule', {});
  check('validate: clean, 36 scheduled, 0 unscheduled', v.errorCount === 0 && v.scheduled === 36 && v.unscheduled === 0);
  const m0 = matches[0], m1 = matches.find((m) => m.id !== m0.id && m.sched.venueId === m0.sched.venueId && m.sched.courtId !== m0.sched.courtId);
  const clash = await expectError(call('moveMatch', { matchId: m0.id, sched: { ...m1.sched } }), 'failed-precondition');
  check('moving onto an occupied court/time is refused with the reason', clash && !clash.wrong && /same court|at once|overlap/i.test(clash.message), clash && clash.message);
  const ghost = await expectError(call('moveMatch', { matchId: m0.id, sched: { venueId: 'sat', courtId: 'nope', date: '2026-10-10', startMin: HM(9) } }), 'failed-precondition');
  check('a court that does not exist is refused', ghost && !ghost.wrong);
  const late = await expectError(call('moveMatch', { matchId: m0.id, sched: { venueId: m0.sched.venueId, courtId: m0.sched.courtId, date: '2026-10-10', startMin: HM(22) } }), 'failed-precondition');
  check('outside the opening hours is refused', late && !late.wrong);
  const junk = await expectError(call('moveMatch', { matchId: m0.id, sched: { venueId: 'club', courtId: 'k1', date: 'not-a-date', startMin: 600 } }), 'invalid-argument');
  check('garbage input is rejected as invalid-argument', junk && !junk.wrong);
  const freeSlot = { venueId: m0.sched.venueId, courtId: m0.sched.courtId, date: '2026-10-10', startMin: HM(17) };
  const moved = await call('moveMatch', { matchId: m0.id, sched: freeSlot });
  check('a valid move is applied', moved.applied && (await fakeDb.doc(`clients/${CID}/tournaments/${TID}/matches/${m0.id}`).get()).data().sched.startMin === HM(17));
  const un = await call('moveMatch', { matchId: m0.id, sched: null });
  check('unscheduling removes the assignment', un.applied && (await fakeDb.doc(`clients/${CID}/tournaments/${TID}/matches/${m0.id}`).get()).data().sched === undefined);
  const refill = await call('generateSchedule', {});
  check('the freed match is picked up again by the next generate', refill.scheduledCount === 1 && refill.errorCount === 0);

  section('publishSchedule');
  const pub = await call('publishSchedule', { publish: true });
  check('publishes cleanly', pub.status === 'published' && pub.scheduled === 36 && pub.unscheduled === 0);
  const booked = (await fakeDb.doc(`clients/${CID}/bookings/state`).get()).data().data;
  const blocks = booked.filter((b) => b.kind === 'schedule-block');
  check('club court blocks are placed on the real booking calendar', blocks.length >= 1 && blocks.every((b) => b.status === 'Reserved' && b.source === 'tournament'));
  check("the customer's own booking is untouched", booked.some((b) => b.id === 'cust1' && b.start === 9 && b.end === 10));
  check('no tournament block overlaps the customer booking', !blocks.some((b) => b.court === 'court1' && b.date === '2026-10-10' && b.start < 10 && b.end > 9));
  check('every match on a club court sits inside a published block covering its hours', await (async () => {
    const nowMatches = await list('matches');
    const tenantOf = { k1: 'court1', k2: 'court2' };
    return nowMatches.filter((m) => m.sched && m.sched.venueId === 'club').every((m) =>
      blocks.some((b) => b.court === tenantOf[m.sched.courtId] && b.date === m.sched.date && b.start <= Math.floor(m.sched.startMin / 60) && b.end >= Math.ceil(m.sched.endMin / 60)));
  })());
  check('external-venue matches leave no footprint on the club calendar', blocks.every((b) => b.court === 'court1' || b.court === 'court2'));
  check('tournament status is published', (await fakeDb.doc(`clients/${CID}/tournaments/${TID}`).get()).data().schedule.status === 'published');

  section('publish gate -- travel buffer blocks going live');
  {
    // force a player to hop venues with a 10-minute gap
    const all = await list('matches');
    const a = all.find((m) => m.sched.venueId === 'club');
    const b = all.find((m) => m.sched.venueId === 'sat' && m.id !== a.id);
    const playerOfA = (await fakeDb.doc(`clients/${CID}/tournaments/${TID}/registrations/${a.participantIds[0]}`).get()).data().playerIds[0];
    // rewrite b's registration so it shares a player with a, then place b 10 minutes after a ends
    const regB = fakeDb.doc(`clients/${CID}/tournaments/${TID}/registrations/${b.participantIds[0]}`);
    const rb = (await regB.get()).data();
    await regB.set({ playerIds: [playerOfA, rb.playerIds[1]] }, { merge: true });
    await fakeDb.doc(`clients/${CID}/tournaments/${TID}/matches/${b.id}`).update({ sched: { venueId: 'sat', courtId: b.sched.courtId, date: a.sched.date, startMin: a.sched.endMin + 10, endMin: a.sched.endMin + 40 } });
    const v2 = await call('validateSchedule', {});
    check('validator reports the too-short transit as an error', v2.conflicts.some((c) => c.type === 'travel_buffer' || c.type === 'court_overlap' || c.type === 'player_overlap'), JSON.stringify(v2.conflicts.slice(0, 2)));
    await call('publishSchedule', { publish: false });
    const refused = await expectError(call('publishSchedule', { publish: true }), 'failed-precondition');
    check('publishing is refused until it is fixed, with the conflicts attached', refused && !refused.wrong && refused.details && refused.details.conflicts.length >= 1, refused && refused.message);
    check('the refusal explains how to fix it', refused && /can't go live|conflict/i.test(refused.message));
    // fix: hand b back to the scheduler
    await fakeDb.doc(`clients/${CID}/tournaments/${TID}/matches/${b.id}`).update({ sched: DELETE });
    await regB.set({ playerIds: rb.playerIds }, { merge: true });
    const fixed = await call('generateSchedule', {});
    check('regenerating that match resolves the conflict', fixed.errorCount === 0, JSON.stringify(fixed.conflicts.slice(0, 1)));
    const re = await call('publishSchedule', { publish: true });
    check('and it publishes again', re.status === 'published');
  }

  section('unpublish');
  const un2 = await call('publishSchedule', { publish: false });
  const afterUn = (await fakeDb.doc(`clients/${CID}/bookings/state`).get()).data().data;
  check('back to draft removes only the tournament blocks', un2.status === 'draft' && afterUn.length === 1 && afterUn[0].id === 'cust1');
  await call('publishSchedule', { publish: true });

  section('scores -> playoffs -> playoff schedule');
  const pool = await list('matches');
  const seedNo = (pid) => parseInt(pid.slice(1), 10); // lower number = stronger, always wins
  for (const m of pool.filter((x) => x.stage === 'group')) {
    const [a, b] = m.participantIds;
    const aWins = seedNo(a) < seedNo(b);
    await call('submitMatchScore', { matchId: m.id, scoreA: aWins ? 11 : 5, scoreB: aWins ? 5 : 11 });
  }
  const st = (await fakeDb.doc(`clients/${CID}/tournaments/${TID}/standings/D1`).get()).data();
  check('all 36 pool matches scored; tables ranked with head-to-head applied', st.groupTables.every((g) => g.table[0].rank === 1 && g.table.every((r) => typeof r.played === 'number')));
  const adv = await call('advanceToKnockout', { divisionId: 'D1' });
  check('8 qualifiers -> 4 quarterfinals now (later rounds are generated as matches finish)', adv.matchCount === 4, String(adv.matchCount));
  const ko = (await list('matches')).filter((m) => m.stage === 'knockout');
  const div2 = (await fakeDb.doc(`clients/${CID}/tournaments/${TID}/divisions/D1`).get()).data();
  const poolOf = {};
  div2.bracketMeta.groups.forEach((g) => g.participants.forEach((p) => { poolOf[p.participantId] = g.groupId; }));
  const r1 = ko.filter((m) => m.round === 1);
  check('quarterfinals: four matches, eight distinct teams', r1.length === 4 && new Set(r1.flatMap((m) => m.participantIds)).size === 8);
  check('no same-pool rematch in round 1 (cross-seeded)', r1.every((m) => poolOf[m.participantIds[0]] !== poolOf[m.participantIds[1]]), r1.map((m) => m.participantIds.map((p) => poolOf[p]).join('v')).join(','));

  const ksch = await call('generateSchedule', {});
  check('playoff round 1 gets scheduled (later rounds appear as matches finish)', ksch.scheduledCount === 4 && ksch.errorCount === 0, JSON.stringify(ksch));
  const all2 = await list('matches');
  const kos = all2.filter((m) => m.stage === 'knockout' && m.sched);
  check('playoffs consolidate at the primary venue', kos.every((m) => m.sched.venueId === 'club'));
  const lastPool = Math.max(...all2.filter((m) => m.stage === 'group').map((m) => m.sched.endMin));
  check('playoffs start after every pool match ends (plus the travel buffer)', kos.every((m) => m.sched.startMin >= lastPool + 15), `${Math.min(...kos.map((m) => m.sched.startMin))} vs ${lastPool}`);
  const vfinal = await call('validateSchedule', {});
  check('whole tournament schedule still validates', vfinal.errorCount === 0, JSON.stringify(vfinal.conflicts.filter((c) => c.severity === 'error').slice(0, 2)));
  check('players moving from the satellite are flagged for the playoffs', vfinal.venueChanges >= 1);
  const booked2 = (await fakeDb.doc(`clients/${CID}/bookings/state`).get()).data().data;
  check('published schedule auto-extended the club calendar for the playoffs', booked2.filter((b) => b.kind === 'schedule-block').length >= 1 && booked2.some((b) => b.id === 'cust1'));

  section('guards');
  const noVenues = await (async () => { await fakeDb.doc(`clients/${CID}/tournaments/${TID}`).set({ venues: [] }, { merge: true }); return expectError(call('generateSchedule', { mode: 'all' }), 'failed-precondition'); })();
  check('no venues -> clear precondition error', noVenues && !noVenues.wrong && /venue/i.test(noVenues.message));
  await fakeDb.doc(`clients/${CID}/tournaments/${TID}`).set({ status: 'cancelled' }, { merge: true });
  const cancelled = await expectError(call('generateSchedule', {}), 'failed-precondition');
  check('a cancelled tournament cannot be rescheduled', cancelled && !cancelled.wrong);
  const badTenant = await expectError(fns.generateSchedule({ data: { clientId: 'BAD TENANT!', tournamentId: TID } }), 'invalid-argument');
  check('invalid tenant id is rejected', badTenant && !badTenant.wrong);

  console.log(`\n=== TOURNAMENT CALLABLES: ${passed}/${passed + failed} passed ===`);
  process.exit(failed === 0 ? 0 : 1);
})().catch((e) => { console.log('\nUNCAUGHT:', e.stack || e); process.exit(1); });
