/* Platform tournament charges -- the Firestore side.

   platformTournamentCharges/{tenant}__{tournamentId}   (server-only writes)
     status 'accruing'  live estimate while the tournament is running
            'final'     frozen: the amount that goes on that month's invoice
     usage, rates (snapshot), lines, computedTotal, override, effectiveTotal,
     period ('YYYY-MM' the charge was finalized in), reason

   A final charge is never recomputed, so later rate changes can't rewrite it;
   the superadmin adjusts one with an override (waive, or a custom amount). */

const billing = require('./engines/tournamentBilling');

const OFFSET_MIN = 480; // charges follow the platform's home timezone (Manila)
const MAX_OVERRIDE = 10000000;
const chargeId = (slug, tournamentId) => `${slug}__${tournamentId}`;
const fail = (code, message) => Object.assign(new Error(message), { code });

async function syncTenant({ db, slug, nowMs }) {
  const out = { accruing: 0, finalized: 0, removed: 0, skippedFinal: 0 };
  const tenantSnap = await db.doc(`platformTenants/${slug}`).get();
  const rates = billing.normalizeRates(tenantSnap.exists && tenantSnap.data().billing && tenantSnap.data().billing.tournament);
  const today = billing.todayOf(nowMs, OFFSET_MIN);
  const period = billing.periodOf(nowMs, OFFSET_MIN);

  const tournaments = await db.collection(`clients/${slug}/tournaments`).get();
  for (const doc of tournaments.docs) {
    const t = doc.data();
    const ref = db.doc(`platformTournamentCharges/${chargeId(slug, doc.id)}`);
    const exSnap = await ref.get();
    const ex = exSnap.exists ? exSnap.data() : null;
    const state = billing.chargeState(t, today);
    if (state === 'none') {
      if (ex && ex.status === 'accruing') { await ref.delete(); out.removed++; }
      continue;
    }
    if (ex && ex.status === 'final') { out.skippedFinal++; continue; }

    const [divs, regs] = await Promise.all([
      db.collection(`clients/${slug}/tournaments/${doc.id}/divisions`).get(),
      db.collection(`clients/${slug}/tournaments/${doc.id}/registrations`).get(),
    ]);
    const usage = billing.usageFrom({
      tournament: t,
      divisions: divs.docs.map((d) => ({ id: d.id, ...d.data() })),
      registrations: regs.docs.map((d) => ({ id: d.id, ...d.data() })),
    });
    const final = state !== 'accruing';
    const { lines, total } = billing.computeLines(rates, usage, { baseOnly: state === 'cancelled_final' });
    const data = {
      tenantId: slug, tournamentId: doc.id, tournamentName: String(t.name || ''),
      status: final ? 'final' : 'accruing',
      reason: state === 'cancelled_final' ? 'cancelled_after_publish' : final ? 'completed' : 'in_progress',
      rates, usage, lines, computedTotal: total,
      override: (ex && ex.override) || null,
      updatedAtMs: nowMs,
      ...(final ? { period, finalizedAtMs: nowMs } : {}),
    };
    data.effectiveTotal = billing.effectiveTotal(data);
    await ref.set(data);
    if (final) out.finalized++; else out.accruing++;
  }
  return out;
}

async function syncAll({ db, nowMs }) {
  const now = nowMs == null ? Date.now() : nowMs;
  const tenants = await db.collection('platformTenants').get();
  const total = { tenants: 0, accruing: 0, finalized: 0, removed: 0, errors: 0 };
  for (const t of tenants.docs) {
    if (!/^[a-z0-9-]{1,50}$/.test(t.id)) continue;
    try {
      const r = await syncTenant({ db, slug: t.id, nowMs: now });
      total.tenants++; total.accruing += r.accruing; total.finalized += r.finalized; total.removed += r.removed;
    } catch (e) { total.errors++; console.warn(`[charges] ${t.id}: ${e.message}`); }
  }
  return total;
}

/* mode: 'waive' | 'custom' | 'clear'. A reason is required to change anything. */
async function setOverride({ db, tenantId, tournamentId, mode, amount, reason, actorEmail, stamp }) {
  if (!['waive', 'custom', 'clear'].includes(mode)) throw fail('invalid-argument', 'Choose waive, custom amount, or clear.');
  const ref = db.doc(`platformTournamentCharges/${chargeId(tenantId, tournamentId)}`);
  const snap = await ref.get();
  if (!snap.exists) throw fail('not-found', 'No charge exists for that tournament yet. Recalculate first.');
  const why = String(reason || '').trim().slice(0, 200);
  let override = null;
  if (mode !== 'clear') {
    if (!why) throw fail('invalid-argument', 'Give a reason for the change.');
    if (mode === 'custom') {
      const n = Number(amount);
      if (!Number.isFinite(n) || n < 0 || n > MAX_OVERRIDE) throw fail('invalid-argument', 'Enter an amount of 0 or more.');
      override = { mode, amount: billing.round2(n), reason: why, by: actorEmail || 'unknown', atMs: Date.now() };
    } else {
      override = { mode, reason: why, by: actorEmail || 'unknown', atMs: Date.now() };
    }
  }
  const next = { ...snap.data(), override };
  const effective = billing.effectiveTotal(next);
  await ref.set({ ...next, effectiveTotal: effective, updatedAtMs: Date.now() });
  await db.collection('platformAuditLog').add({
    action: 'tournament-charge-override', slug: tenantId,
    details: `${next.tournamentName || tournamentId}: ${mode === 'clear' ? 'override cleared' : mode === 'waive' ? `waived (${why})` : `set to ${override.amount.toFixed(2)} (${why})`}; charge now ${effective.toFixed(2)}`,
    actorEmail: actorEmail || 'unknown', createdAt: stamp ? stamp() : new Date(),
  });
  return { effectiveTotal: effective, period: next.period || null, status: next.status };
}

module.exports = { chargeId, syncTenant, syncAll, setOverride, OFFSET_MIN };
