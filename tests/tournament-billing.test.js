/* ================================================================
   Platform tournament fees -- engine rules, the sync/freeze behaviour
   against an in-memory Firestore, overrides, and who may call the callables
   (real functions/index.js).

   Usage:  node tests/tournament-billing.test.js
   ================================================================ */
const path = require('path');
const { store, fakeDb, installMocks } = require('./helpers/fakeFirestore');
installMocks();

const billing = require('../functions/engines/tournamentBilling');
const charges = require('../functions/tournamentCharges');
const fns = require(path.join(__dirname, '..', 'functions', 'index.js'));

let passed = 0, failed = 0;
function check(name, ok, detail) { if (ok) passed++; else { failed++; console.log(`  FAIL: ${name}${detail ? ' -- ' + detail : ''}`); } }
const section = (t) => console.log(`\n${t}`);
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const near = (a, b) => Math.abs(a - b) < 0.005;

const at = (date, h = 12) => { const [y, m, d] = date.split('-').map(Number); return Date.UTC(y, m - 1, d, h - 8, 0); }; // Manila wall clock
const RATES = { baseFee: 1000, perDayFee: 500, perDivisionFee: 200, perParticipantFee: 25, freeParticipants: 20 };

const reg = (id, divisionId, players, status = 'approved') => ({ id, divisionId, status, playerIds: players });
const T0 = { name: 'Summer Open', status: 'published', startDate: '2026-10-10', endDate: '2026-10-11', publishedAt: { seconds: 1 } };

(async () => {
  /* ============================ ENGINE ============================ */
  section('rates');
  const junk = billing.normalizeRates({ baseFee: '1500.555', perDayFee: -5, perDivisionFee: 'abc', perParticipantFee: 1e12, freeParticipants: 12.9 });
  check('money is rounded to centavos; negatives and junk become 0; huge values are capped', junk.baseFee === 1500.56 && junk.perDayFee === 0 && junk.perDivisionFee === 0 && junk.perParticipantFee === 10000000);
  check('free allowance is a whole, non-negative number', junk.freeParticipants === 12 && billing.normalizeRates({ freeParticipants: -3 }).freeParticipants === 0);
  check('missing rates mean nothing is charged', eq(billing.normalizeRates(undefined), { baseFee: 0, perDayFee: 0, perDivisionFee: 0, perParticipantFee: 0, freeParticipants: 0 }) && !billing.hasRates(billing.normalizeRates(null)));

  section('usage');
  check('days: an explicit schedule wins', billing.tournamentDays({ scheduleConfig: { days: [{ date: '2026-10-10' }, { date: '2026-10-12' }, { date: '2026-10-12' }] }, startDate: '2026-10-01', endDate: '2026-10-30' }) === 2);
  check('days: else the inclusive date range', billing.tournamentDays({ startDate: '2026-10-10', endDate: '2026-10-12' }) === 3);
  check('days: same-day and missing dates are one day; a backwards range is one day', billing.tournamentDays({ startDate: '2026-10-10' }) === 1 && billing.tournamentDays({}) === 1 && billing.tournamentDays({ startDate: '2026-10-10', endDate: '2026-10-01' }) === 1);
  check('days: an absurd range is capped', billing.tournamentDays({ startDate: '2026-01-01', endDate: '2030-01-01' }) === 60);
  const divs = [{ id: 'D1' }, { id: 'D2' }, { id: 'D3' }];
  const regs = [reg('r1', 'D1', ['p1', 'p2']), reg('r2', 'D1', ['p3', 'p4']), reg('r3', 'D2', ['p1', 'p5']), reg('r4', 'D2', ['p6', 'p7'], 'withdrawn'), reg('r5', 'D2', ['p8', 'p9'], 'waitlisted'), reg('r6', 'D2', ['p10', 'p11'], 'checked_in')];
  const u = billing.usageFrom({ tournament: T0, divisions: divs, registrations: regs });
  check('participants are unique players (p1 plays two divisions, counts once)', u.participants === 7, JSON.stringify(u));
  check('withdrawn and waitlisted entries are not billed', u.registrations === 4);
  check('only divisions that have players count (D3 is empty)', u.divisions === 2);
  check('a registration with no player ids still counts as one participant', billing.usageFrom({ tournament: T0, divisions: divs, registrations: [{ id: 'x', divisionId: 'D1', status: 'approved' }] }).participants === 1);

  section('charge maths');
  const full = billing.computeLines(RATES, { days: 2, divisions: 3, participants: 64 });
  check('base + days + divisions + players beyond the free allowance', near(full.total, 1000 + 2 * 500 + 3 * 200 + (64 - 20) * 25), String(full.total));
  check('lines are explainable', full.lines.length === 4 && /first 20 free \(64 total\)/.test(full.lines[3].description) && full.lines[3].qty === 44);
  const within = billing.computeLines(RATES, { days: 1, divisions: 1, participants: 20 });
  check('at or under the free allowance the per-player fee is zero', !within.lines.some((l) => l.key === 'participants') && near(within.total, 1000 + 500 + 200));
  check('one player over the allowance is billed for one', billing.computeLines(RATES, { days: 1, divisions: 1, participants: 21 }).lines.find((l) => l.key === 'participants').qty === 1);
  check('zero rates give an empty charge', billing.computeLines(billing.normalizeRates({}), { days: 3, divisions: 3, participants: 99 }).total === 0);
  check('base-only (cancelled after publishing) ignores usage', near(billing.computeLines(RATES, { days: 3, divisions: 3, participants: 99 }, { baseOnly: true }).total, 1000));
  check('a rate that is zero adds no line', eq(billing.computeLines({ ...RATES, perDayFee: 0 }, { days: 2, divisions: 1, participants: 0 }).lines.map((l) => l.key), ['base', 'divisions']));

  section('when a tournament is charged');
  const st = (over, today) => billing.chargeState({ ...T0, ...over }, today);
  check('draft: nothing (even if it once carried a publish date)', st({ status: 'draft', publishedAt: undefined }, '2026-10-01') === 'none' && st({ status: 'draft' }, '2026-10-01') === 'none');
  check('published, not over: live estimate', st({}, '2026-10-05') === 'accruing' && st({}, '2026-10-11') === 'accruing');
  check('published, day after the last day: final', st({}, '2026-10-12') === 'final');
  check('the last scheduled day beats the header dates', st({ scheduleConfig: { days: [{ date: '2026-10-20' }] } }, '2026-10-15') === 'accruing');
  check('marked completed: final even before the end date', st({ status: 'completed' }, '2026-10-05') === 'final');
  check('legacy published with no publishedAt still counts', st({ publishedAt: undefined }, '2026-10-05') === 'accruing');
  check('cancelled after publishing: final, base fee only', st({ status: 'cancelled' }, '2026-10-05') === 'cancelled_final');
  check('cancelled before ever publishing: nothing', st({ status: 'cancelled', publishedAt: undefined }, '2026-10-05') === 'none');

  section('overrides and invoice line');
  const base = { id: 'demo__T1', tournamentName: 'Summer Open', computedTotal: 3000, usage: { days: 2, divisions: 3, participants: 64 } };
  check('no override: the computed amount', billing.effectiveTotal(base) === 3000);
  check('waive: zero', billing.effectiveTotal({ ...base, override: { mode: 'waive' } }) === 0);
  check('custom amount replaces it (including a discount and a surcharge)', billing.effectiveTotal({ ...base, override: { mode: 'custom', amount: 1200.5 } }) === 1200.5 && billing.effectiveTotal({ ...base, override: { mode: 'custom', amount: 9000 } }) === 9000);
  check('a broken override is ignored, not trusted', billing.effectiveTotal({ ...base, override: { mode: 'custom', amount: -5 } }) === 3000 && billing.effectiveTotal({ ...base, override: { mode: 'custom', amount: 'x' } }) === 3000);
  const line = billing.invoiceLine(base);
  check('invoice line names the tournament and its usage', line.sourceType === 'tournament' && line.amount === 3000 && /Summer Open — 2 days, 3 divisions, 64 players/.test(line.description), line.description);
  check('invoice line marks adjustments and base-only cancellations', /adjusted/.test(billing.invoiceLine({ ...base, override: { mode: 'custom', amount: 1 } }).description) && /cancelled after publishing/.test(billing.invoiceLine({ ...base, reason: 'cancelled_after_publish' }).description));
  check('period and today follow the Manila wall clock across the UTC date line', billing.todayOf(Date.UTC(2026, 9, 31, 17, 0), 480) === '2026-11-01' && billing.periodOf(Date.UTC(2026, 9, 31, 17, 0), 480) === '2026-11' && billing.periodOf(Date.UTC(2026, 9, 31, 15, 0), 480) === '2026-10');

  /* ============================ SYNC ============================ */
  async function seed() {
    store.clear();
    await fakeDb.doc('platformTenants/demo').set({ businessName: 'Demo', billing: { baseFee: 500, tournament: RATES } });
    const mk = async (id, t, divisions, registrations) => {
      await fakeDb.doc(`clients/demo/tournaments/${id}`).set(t);
      for (const d of divisions) await fakeDb.doc(`clients/demo/tournaments/${id}/divisions/${d.id}`).set({ name: d.id });
      for (const r of registrations) { const { id: rid, ...rest } = r; await fakeDb.doc(`clients/demo/tournaments/${id}/registrations/${rid}`).set(rest); }
    };
    const players = (n, prefix) => Array.from({ length: n }, (_, i) => reg(`${prefix}${i}`, 'D1', [`${prefix}p${i}a`, `${prefix}p${i}b`]));
    await mk('live', { ...T0, name: 'Live Cup', startDate: '2026-10-10', endDate: '2026-10-12' }, [{ id: 'D1' }, { id: 'D2' }], [...players(16, 'a'), reg('x', 'D2', ['z1', 'z2'])]);
    await mk('done', { ...T0, name: 'Done Cup', startDate: '2026-09-01', endDate: '2026-09-02' }, [{ id: 'D1' }], players(5, 'd'));
    await mk('draft', { name: 'Draft Cup', status: 'draft', startDate: '2026-10-10' }, [], []);
    await mk('cxlpub', { ...T0, name: 'Cancelled After', status: 'cancelled', startDate: '2026-10-20' }, [{ id: 'D1' }], players(4, 'c'));
    await mk('cxlraw', { name: 'Cancelled Early', status: 'cancelled', startDate: '2026-10-20' }, [{ id: 'D1' }], players(4, 'e'));
  }
  const get = async (id) => (await fakeDb.doc(`platformTournamentCharges/demo__${id}`).get()).data();

  section('sync');
  await seed();
  const r1 = await charges.syncTenant({ db: fakeDb, slug: 'demo', nowMs: at('2026-10-11') });
  const live = await get('live');
  check('a running tournament gets a live estimate', live && live.status === 'accruing' && live.reason === 'in_progress' && live.period === undefined);
  check('estimate uses the superadmin rates: 3 days, 2 divisions, 34 players (14 billable)', near(live.computedTotal, 1000 + 3 * 500 + 2 * 200 + 14 * 25) && live.usage.participants === 34 && live.usage.divisions === 2, JSON.stringify(live.usage));
  const done = await get('done');
  check('an ended tournament is finalized into the month it was finalized in', done.status === 'final' && done.period === '2026-10' && done.reason === 'completed' && done.finalizedAtMs === at('2026-10-11'));
  check('final amount: 2 days, 1 division, 10 players (all under the free 20)', near(done.computedTotal, 1000 + 2 * 500 + 200), String(done.computedTotal));
  check('rates are snapshotted onto the charge', eq(done.rates, RATES) && done.effectiveTotal === done.computedTotal);
  check('a draft is not charged', (await get('draft')) === undefined);
  const cx = await get('cxlpub');
  check('cancelled after publishing: base fee only', cx.status === 'final' && cx.reason === 'cancelled_after_publish' && near(cx.computedTotal, 1000) && cx.lines.length === 1);
  check('cancelled before publishing: no charge', (await get('cxlraw')) === undefined);
  check('sync reports what it did', r1.accruing === 1 && r1.finalized === 2, JSON.stringify(r1));

  section('freeze and stability');
  await fakeDb.doc('platformTenants/demo').set({ billing: { tournament: { ...RATES, baseFee: 99999 } } }, { merge: true });
  await fakeDb.doc('clients/demo/tournaments/done/registrations/late').set({ divisionId: 'D1', status: 'approved', playerIds: ['newbie1', 'newbie2'] });
  const r2 = await charges.syncTenant({ db: fakeDb, slug: 'demo', nowMs: at('2026-11-15') });
  const done2 = await get('done');
  check('a final charge never changes after a rate change or a late registration', done2.computedTotal === done.computedTotal && done2.period === '2026-10' && r2.skippedFinal >= 2);
  const live2 = await get('live');
  check('the live estimate flips to final (with current rates) once the tournament has ended', live2.status === 'final' && live2.period === '2026-11' && live2.rates.baseFee === 99999);
  const r3 = await charges.syncTenant({ db: fakeDb, slug: 'demo', nowMs: at('2026-11-16') });
  check('syncing again changes nothing', r3.finalized === 0 && r3.accruing === 0);

  await seed();
  await charges.syncTenant({ db: fakeDb, slug: 'demo', nowMs: at('2026-10-11') });
  await fakeDb.doc('clients/demo/tournaments/live').set({ status: 'draft' }, { merge: true });
  const r4 = await charges.syncTenant({ db: fakeDb, slug: 'demo', nowMs: at('2026-10-11') });
  check('a tournament pulled back to draft loses its estimate', (await get('live')) === undefined && r4.removed === 1);

  await seed();
  await fakeDb.doc('platformTenants/demo').set({ billing: { baseFee: 500 } });
  await charges.syncTenant({ db: fakeDb, slug: 'demo', nowMs: at('2026-10-11') });
  check('no rate card set: charges exist but are zero (nothing billed until you set rates)', (await get('done')).computedTotal === 0 && (await get('live')).effectiveTotal === 0);

  section('syncAll');
  await seed();
  await fakeDb.doc('platformTenants/other').set({ businessName: 'Other', billing: { tournament: { baseFee: 10 } } });
  await fakeDb.doc('clients/other/tournaments/T9').set({ ...T0, startDate: '2026-10-10', endDate: '2026-10-10' });
  await fakeDb.doc('platformTenants/BAD ID').set({});
  const all = await charges.syncAll({ db: fakeDb, nowMs: at('2026-10-11') });
  check('every tenant is processed; invalid ids are skipped', all.tenants === 2 && all.errors === 0 && (await fakeDb.doc('platformTournamentCharges/other__T9').get()).exists, JSON.stringify(all));

  /* ============================ OVERRIDES ============================ */
  section('override');
  await seed();
  await charges.syncTenant({ db: fakeDb, slug: 'demo', nowMs: at('2026-10-11') });
  const stamp = () => new Date();
  const ov = (o) => charges.setOverride({ db: fakeDb, tenantId: 'demo', tournamentId: 'done', actorEmail: 'boss@dulahq.app', stamp, ...o });
  const rej = async (o) => { try { await ov(o); return null; } catch (e) { return e.code; } };
  const w = await ov({ mode: 'waive', reason: 'Launch partner' });
  check('waive: charge drops to zero and says so', w.effectiveTotal === 0 && (await get('done')).override.mode === 'waive' && (await get('done')).computedTotal > 0);
  check('the original computed amount is kept for the record', near((await get('done')).computedTotal, 2200));
  const c = await ov({ mode: 'custom', amount: 800, reason: 'Negotiated rate' });
  check('custom amount replaces it', c.effectiveTotal === 800 && (await get('done')).override.by === 'boss@dulahq.app');
  const cl = await ov({ mode: 'clear' });
  check('clear restores the computed charge', cl.effectiveTotal === (await get('done')).computedTotal && (await get('done')).override === null);
  check('a reason is required to waive or adjust', await rej({ mode: 'waive', reason: '  ' }) === 'invalid-argument' && await rej({ mode: 'custom', amount: 5 }) === 'invalid-argument');
  check('bad amounts and modes are refused', await rej({ mode: 'custom', amount: -1, reason: 'x' }) === 'invalid-argument' && await rej({ mode: 'custom', amount: 'abc', reason: 'x' }) === 'invalid-argument' && await rej({ mode: 'free', reason: 'x' }) === 'invalid-argument');
  check('an unknown charge is a clear not-found', await rej({ tournamentId: 'nope', mode: 'waive', reason: 'x' }) === 'not-found');
  await ov({ mode: 'waive', reason: 'Goodwill' });
  const audit = (await fakeDb.collection('platformAuditLog').get()).docs.map((d) => d.data()).filter((a) => a.action === 'tournament-charge-override');
  check('every change is written to the audit log with who and why', audit.length >= 4 && audit.some((a) => /waived \(Goodwill\)/.test(a.details) && a.actorEmail === 'boss@dulahq.app' && a.slug === 'demo'));
  await fakeDb.doc('clients/demo/tournaments/live').set({ endDate: '2026-10-11' }, { merge: true });
  await charges.syncTenant({ db: fakeDb, slug: 'demo', nowMs: at('2026-10-15') });
  await ov({ tournamentId: 'live', mode: 'custom', amount: 50, reason: 'Set while running' }).catch(() => null);

  await seed();
  await charges.syncTenant({ db: fakeDb, slug: 'demo', nowMs: at('2026-10-11') });
  await charges.setOverride({ db: fakeDb, tenantId: 'demo', tournamentId: 'live', mode: 'waive', reason: 'Friend of the club', actorEmail: 'boss', stamp });
  await charges.syncTenant({ db: fakeDb, slug: 'demo', nowMs: at('2026-10-11') });
  check('an override set while running survives every re-estimate', (await get('live')).override.mode === 'waive' && (await get('live')).effectiveTotal === 0);
  await charges.syncTenant({ db: fakeDb, slug: 'demo', nowMs: at('2026-10-13') });
  check('and carries into the final charge', (await get('live')).status === 'final' && (await get('live')).override.mode === 'waive' && (await get('live')).effectiveTotal === 0 && (await get('live')).computedTotal > 0);

  /* ============================ CALLABLES ============================ */
  section('who may call');
  const code = async (p) => { try { await p; return null; } catch (e) { return e.code; } };
  const call = (name, data, auth) => fns[name]({ data, ...(auth ? { auth } : {}) });
  const tok = (t) => ({ token: t });
  check('no sign-in: refused', await code(call('syncTournamentCharges', {})) === 'unauthenticated' && await code(call('setTournamentChargeOverride', { tenantId: 'demo', tournamentId: 'live', mode: 'waive', reason: 'x' })) === 'unauthenticated');
  check('signed in but not platform staff: refused', await code(call('syncTournamentCharges', {}, tok({ email: 'x@y.z' }))) === 'permission-denied');
  check('staff with an unrelated permission: refused', await code(call('syncTournamentCharges', {}, tok({ platformPerms: ['manage_support'] }))) === 'permission-denied' && await code(call('setTournamentChargeOverride', { tenantId: 'demo', tournamentId: 'live', mode: 'waive', reason: 'x' }, tok({ platformPerms: ['view_platform_usage'] }))) === 'permission-denied');
  check('a tenant-style caller cannot fake it with a tenant id', await code(call('setTournamentChargeOverride', { tenantId: 'demo', tournamentId: 'live', mode: 'waive', reason: 'x' }, tok({}))) === 'permission-denied');
  await seed();
  const syncRes = await call('syncTournamentCharges', {}, tok({ platformPerms: ['view_platform_billing'] }));
  check('billing staff can run a sync', syncRes.tenants === 1 && (await get('live')) !== undefined, JSON.stringify(syncRes));
  const one = await call('syncTournamentCharges', { tenantId: 'demo' }, tok({ superadmin: true }));
  check('a superadmin can sync one tenant', typeof one.accruing === 'number');
  check('a bad tenant id is rejected', await code(call('syncTournamentCharges', { tenantId: 'BAD ID' }, tok({ superadmin: true }))) === 'invalid-argument');
  const ovr = await call('setTournamentChargeOverride', { tenantId: 'demo', tournamentId: 'done', mode: 'waive', reason: 'Promo' }, tok({ platformPerms: ['verify_platform_payment'], email: 'staff@dulahq.app' }));
  check('permitted staff can waive; the audit entry carries their email', ovr.effectiveTotal === 0 && (await fakeDb.collection('platformAuditLog').get()).docs.some((d) => d.data().actorEmail === 'staff@dulahq.app'));
  check('override errors surface as proper codes', await code(call('setTournamentChargeOverride', { tenantId: 'demo', tournamentId: 'done', mode: 'custom', amount: -3, reason: 'x' }, tok({ superadmin: true }))) === 'invalid-argument');
  check('the daily job entry point runs', await (async () => { await fns.tournamentChargesJob(); return true; })());

  section('pages and rules');
  const fsx = require('fs');
  const sa = fsx.readFileSync(path.join(__dirname, '..', 'superadmin.html'), 'utf8');
  const fnMatch = sa.match(/function chargeInvoiceLine\(c\)\{[\s\S]*?\r?\n\}/);
  const pageLine = fnMatch ? new Function(fnMatch[0] + '; return chargeInvoiceLine;')() : null;
  const samples = [
    { id: 'a__b', tournamentName: 'Summer Open', computedTotal: 3000, usage: { days: 2, divisions: 3, participants: 64 } },
    { id: 'a__c', tournamentId: 'c', computedTotal: 1234.567, usage: { days: 1, divisions: 1, participants: 1 }, override: { mode: 'waive', reason: 'x' } },
    { id: 'a__d', tournamentName: 'D', computedTotal: 500, usage: { days: 3, divisions: 0, participants: 0 }, override: { mode: 'custom', amount: 99.999, reason: 'x' } },
    { id: 'a__e', tournamentName: 'E', computedTotal: 1000, reason: 'cancelled_after_publish', usage: { days: 1, divisions: 2, participants: 9 } },
    { id: 'a__f', tournamentName: 'F', computedTotal: 50, usage: {}, override: { mode: 'custom', amount: -1 } },
  ];
  check('the superadmin invoice line is identical to the server one', !!pageLine && samples.every((s) => eq(pageLine(s), billing.invoiceLine(s))), samples.map((s) => pageLine && pageLine(s).description).join(' | '));
  const ta = fsx.readFileSync(path.join(__dirname, '..', 'tournament-admin.html'), 'utf8');
  check('the tenant page has no platform fee inputs or estimate', !/tfBaseFee|tfPerParticipantFee|tfPerDayFee|tfExpectedParticipants|pricingTotal|pricingBreakdown|recomputePricing|Total Before Publish|Premium Pricing/.test(ta));
  check('the tenant page cannot write a pricing block', !/\bpricing\b\s*[,:]/.test(ta));
  check('division entry fee is still the tenant-set fee', /dfEntryFee/.test(ta) && /entryFee:/.test(ta));
  const rules = fsx.readFileSync(path.join(__dirname, '..', 'firestore.rules'), 'utf8');
  const rm = rules.match(/match \/platformTournamentCharges\/\{chargeId\}\s*\{([\s\S]*?)\n    \}/);
  check('charges are never client-writable and only billing staff can read them', !!rm && /allow write: if false/.test(rm[1]) && !/isValidTenantId/.test(rm[1]) && /platformPerm\('view_platform_billing'\)/.test(rm[1]));

  console.log(`\n=== TOURNAMENT BILLING: ${passed}/${passed + failed} passed ===`);
  process.exit(failed === 0 ? 0 : 1);
})().catch((e) => { console.log('\nUNCAUGHT:', e.stack || e); process.exit(1); });
