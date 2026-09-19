/* Platform tournament fees -- pure functions, no I/O.

   What a tenant owes the PLATFORM for running a tournament. Set by the
   superadmin per tenant (never by the tenant), computed here from real data
   (days, divisions with players, unique participants) and turned into a
   frozen charge when the tournament ends. The tenant's own entry fees are a
   different thing and never pass through here.

   Rates (all optional, 0 = not charged):
     baseFee            once per tournament
     perDayFee          per tournament day
     perDivisionFee     per division that has players
     perParticipantFee  per unique player beyond the free allowance
     freeParticipants   how many players are free before the per-player fee starts */

const RATE_MONEY_KEYS = Object.freeze(['baseFee', 'perDayFee', 'perDivisionFee', 'perParticipantFee']);
const MAX_MONEY = 10000000;
const MAX_FREE = 100000;
const MAX_DAYS = 60;

const round2 = (n) => Math.round(n * 100) / 100;
const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);

function normalizeRates(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const money = (v) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? round2(Math.min(n, MAX_MONEY)) : 0; };
  const free = Number(r.freeParticipants);
  return {
    baseFee: money(r.baseFee), perDayFee: money(r.perDayFee), perDivisionFee: money(r.perDivisionFee), perParticipantFee: money(r.perParticipantFee),
    freeParticipants: Number.isFinite(free) && free > 0 ? Math.min(Math.floor(free), MAX_FREE) : 0,
  };
}
const hasRates = (rates) => RATE_MONEY_KEYS.some((k) => rates[k] > 0);

/* Tournament days: the scheduled days if the organizer set them, else the
   inclusive start..end date range, else one day. */
function tournamentDays(t) {
  const sched = ((t.scheduleConfig && t.scheduleConfig.days) || []).map((d) => d && d.date).filter(isDate);
  if (sched.length) return new Set(sched).size;
  if (isDate(t.startDate)) {
    const end = isDate(t.endDate) && t.endDate >= t.startDate ? t.endDate : t.startDate;
    const ms = Date.parse(`${end}T00:00:00Z`) - Date.parse(`${t.startDate}T00:00:00Z`);
    return Math.min(MAX_DAYS, Math.max(1, Math.round(ms / 86400000) + 1));
  }
  return 1;
}
function lastDay(t) {
  const sched = ((t.scheduleConfig && t.scheduleConfig.days) || []).map((d) => d && d.date).filter(isDate).sort();
  const cands = [sched[sched.length - 1], t.endDate, t.startDate].filter(isDate).sort();
  return cands.length ? cands[cands.length - 1] : null;
}

const isActiveReg = (r) => r && (r.status === 'approved' || r.status === 'checked_in');

function usageFrom({ tournament, divisions, registrations }) {
  const active = (registrations || []).filter(isActiveReg);
  const players = new Set();
  active.forEach((r) => {
    const ids = Array.isArray(r.playerIds) && r.playerIds.length ? r.playerIds : [r.id];
    ids.forEach((p) => players.add(p));
  });
  const divisionIds = new Set(active.map((r) => r.divisionId));
  const divisionCount = (divisions || []).filter((d) => divisionIds.has(d.id)).length;
  return { days: tournamentDays(tournament), divisions: divisionCount, participants: players.size, registrations: active.length };
}

function computeLines(rates, usage, opts) {
  const lines = [];
  const add = (key, description, qty, unit) => {
    if (qty > 0 && unit > 0) lines.push({ key, description, qty, unitAmount: unit, amount: round2(qty * unit) });
  };
  add('base', 'Tournament base fee', 1, rates.baseFee);
  if (!(opts && opts.baseOnly)) {
    add('days', `Tournament days (${usage.days})`, usage.days, rates.perDayFee);
    add('divisions', `Divisions with players (${usage.divisions})`, usage.divisions, rates.perDivisionFee);
    const billable = Math.max(0, usage.participants - rates.freeParticipants);
    add('participants', rates.freeParticipants
      ? `Players beyond the first ${rates.freeParticipants} free (${usage.participants} total)`
      : `Players (${usage.participants})`, billable, rates.perParticipantFee);
  }
  return { lines, total: round2(lines.reduce((s, l) => s + l.amount, 0)) };
}

/* draft -> 'none'; published/live and not over -> 'accruing'; over or
   completed -> 'final'; cancelled after publishing -> 'cancelled_final'
   (base fee only); cancelled before ever publishing -> 'none'. */
function chargeState(t, today) {
  if (t.status === 'draft') return 'none';
  const wasPublished = !!t.publishedAt || ['published', 'live', 'completed'].includes(t.status);
  if (t.status === 'cancelled') return t.publishedAt ? 'cancelled_final' : 'none';
  if (!wasPublished) return 'none';
  const end = lastDay(t);
  if (t.status === 'completed' || (end && end < today)) return 'final';
  return 'accruing';
}

/* The amount that actually goes on the invoice. */
function effectiveTotal(charge) {
  const o = charge && charge.override;
  if (o && o.mode === 'waive') return 0;
  if (o && o.mode === 'custom' && Number.isFinite(Number(o.amount)) && Number(o.amount) >= 0) return round2(Number(o.amount));
  return round2(Number(charge && charge.computedTotal) || 0);
}

function invoiceLine(charge) {
  const total = effectiveTotal(charge);
  const o = charge.override;
  const usage = charge.usage || {};
  const bits = [`${usage.days || 0} day${usage.days === 1 ? '' : 's'}`, `${usage.divisions || 0} division${usage.divisions === 1 ? '' : 's'}`, `${usage.participants || 0} player${usage.participants === 1 ? '' : 's'}`];
  const note = o && o.mode === 'custom' ? ' (adjusted)' : charge.reason === 'cancelled_after_publish' ? ' (cancelled after publishing: base fee only)' : '';
  return { sourceType: 'tournament', sourceId: charge.id, description: `Tournament: ${charge.tournamentName || charge.tournamentId} — ${bits.join(', ')}${note}`, qty: 1, unitAmount: total, amount: total };
}

/* 'YYYY-MM' of an epoch-ms instant on the wall clock at a fixed UTC offset. */
function periodOf(nowMs, offsetMin) {
  return new Date(nowMs + offsetMin * 60000).toISOString().slice(0, 7);
}
function todayOf(nowMs, offsetMin) {
  return new Date(nowMs + offsetMin * 60000).toISOString().slice(0, 10);
}

module.exports = {
  RATE_MONEY_KEYS, normalizeRates, hasRates, tournamentDays, lastDay, usageFrom, computeLines,
  chargeState, effectiveTotal, invoiceLine, periodOf, todayOf, round2,
};
