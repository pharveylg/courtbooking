/* Match-alert runner -- the Firestore side of notifications.

   Data (all server-only; firestore.rules has no match for these paths):
     platformLiveTournaments/{clientId}__{tournamentId}
         { clientId, tournamentId, dates[], pending }   what the job scans
     clients/{c}/tournaments/{t}/pushSubs/{id}
         { playerId, regIds[], endpoint, keys, createdAtMs }
     clients/{c}/tournaments/{t}/notifyOutbox/{id}
         events queued by the callables (publish, match_change, qualified)
     clients/{c}/tournaments/{t}/notifyState/state
         { reminded{key:ms}, lockUntil }

   One scheduled job (see index.js) calls runNotifier() every minute. It only
   touches tournaments whose schedule is published, and only reads their
   matches on the days that matter, so an idle platform costs a handful of
   reads a minute.

   `send` is injected: production passes a web-push sender, tests pass a fake. */

const crypto = require('crypto');
const notifier = require('./engines/notifier');
const scheduler = require('./engines/scheduler');

const REGISTRY = 'platformLiveTournaments';
const LOCK_MS = 90 * 1000;
const MAX_SUBS_PER_PLAYER = 5;
const REMINDED_KEEP_MS = 3 * 24 * 3600 * 1000;

const registryId = (clientId, tournamentId) => `${clientId}__${tournamentId}`;
const fail = (code, message) => Object.assign(new Error(message), { code });
const tournamentPath = (clientId, tournamentId) => `clients/${clientId}/tournaments/${tournamentId}`;
const pushUrl = (clientId, tournamentId) => `/tournament.html?client=${encodeURIComponent(clientId)}&t=${encodeURIComponent(tournamentId)}#my`;

/* Same normalisation the admin page uses when it creates a player id, so a
   phone typed by a player resolves to the id stored on their registration. */
function normalizePhone(raw) {
  let digits = String(raw || '').replace(/\D/g, '');
  if (digits.startsWith('0')) digits = '63' + digits.slice(1);
  else if (digits.startsWith('9') && digits.length === 10) digits = '63' + digits;
  return digits;
}

/* ---------------- registry + outbox (called from the schedule callables) ---------------- */
async function syncRegistry(db, clientId, tournamentId, dates) {
  const uniq = [...new Set((dates || []).filter(notifier.isDate))].sort();
  await db.doc(`${REGISTRY}/${registryId(clientId, tournamentId)}`).set({ clientId, tournamentId, dates: uniq, updatedAtMs: Date.now() }, { merge: true });
}
/* Taking a schedule back to draft also discards alerts still waiting to go
   out, so a later re-publish doesn't replay stale changes. */
async function removeRegistry(db, clientId, tournamentId) {
  await db.doc(`${REGISTRY}/${registryId(clientId, tournamentId)}`).delete();
  for (const d of (await db.collection(`${tournamentPath(clientId, tournamentId)}/notifyOutbox`).get()).docs) await d.ref.delete();
}
/* events: [{ id, data }]. Same id twice keeps the newest (one pending alert
   per match, however many times the organizer drags it). */
async function enqueueEvents(db, clientId, tournamentId, events) {
  if (!events.length) return;
  const createdAtMs = Date.now();
  for (let i = 0; i < events.length; i += 400) {
    const batch = db.batch();
    events.slice(i, i + 400).forEach((e) => batch.set(db.doc(`${tournamentPath(clientId, tournamentId)}/notifyOutbox/${e.id}`), { ...e.data, createdAtMs }));
    await batch.commit();
  }
  await db.doc(`${REGISTRY}/${registryId(clientId, tournamentId)}`).set({ clientId, tournamentId, pending: true }, { merge: true });
}

/* ---------------- subscriptions ---------------- */
function validateSubscription(sub) {
  if (!sub || typeof sub !== 'object') throw fail('invalid-argument', 'Missing push subscription.');
  if (!notifier.isAllowedPushEndpoint(sub.endpoint)) throw fail('invalid-argument', 'That push service is not supported.');
  const k = sub.keys || {};
  const okKey = (s, max) => typeof s === 'string' && /^[A-Za-z0-9_-]+={0,2}$/.test(s) && s.length >= 8 && s.length <= max;
  if (!okKey(k.p256dh, 200) || !okKey(k.auth, 60)) throw fail('invalid-argument', 'Invalid push keys.');
  return { endpoint: sub.endpoint, keys: { p256dh: k.p256dh, auth: k.auth } };
}

async function registerSubscription({ db, clientId, tournamentId, phone, subscription, send }) {
  const tRef = db.doc(tournamentPath(clientId, tournamentId));
  const tSnap = await tRef.get();
  if (!tSnap.exists) throw fail('not-found', 'Tournament not found.');
  const t = tSnap.data();
  if (t.status === 'draft' || t.status === 'cancelled') throw fail('failed-precondition', 'This tournament is not open for alerts.');
  const cleaned = validateSubscription(subscription);
  const playerId = normalizePhone(phone);
  if (playerId.length < 10 || playerId.length > 15) throw fail('invalid-argument', 'Enter the mobile number you registered with.');

  const regSnap = await tRef.collection('registrations').where('playerIds', 'array-contains', playerId).get();
  const regs = regSnap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((r) => r.status === 'approved' || r.status === 'checked_in' || r.status === 'waitlisted');
  if (!regs.length) throw fail('not-found', "We couldn't find that number in this tournament's registrations.");

  const id = crypto.createHash('sha256').update(cleaned.endpoint).digest('hex').slice(0, 40);
  const subsCol = tRef.collection('pushSubs');
  const mine = (await subsCol.where('playerId', '==', playerId).get()).docs.map((d) => ({ id: d.id, ...d.data() }));
  const others = mine.filter((s) => s.id !== id).sort((a, b) => (a.createdAtMs || 0) - (b.createdAtMs || 0));
  while (others.length >= MAX_SUBS_PER_PLAYER) await subsCol.doc(others.shift().id).delete();

  const doc = { playerId, regIds: regs.map((r) => r.id), endpoint: cleaned.endpoint, keys: cleaned.keys, createdAtMs: Date.now() };
  await subsCol.doc(id).set(doc);
  if (send) await send({ id, ...doc }, { ...notifier.msgWelcome(t.name), url: pushUrl(clientId, tournamentId), ts: Date.now() }).catch(() => null);
  return { subscriptionId: id, registrations: regs.length, names: regs.map((r) => (r.playerNames || []).join(' & ')).filter(Boolean) };
}

async function removeSubscription({ db, clientId, tournamentId, endpoint }) {
  if (typeof endpoint !== 'string' || endpoint.length > 1000) throw fail('invalid-argument', 'Missing endpoint.');
  const id = crypto.createHash('sha256').update(endpoint).digest('hex').slice(0, 40);
  await db.doc(`${tournamentPath(clientId, tournamentId)}/pushSubs/${id}`).delete();
  return { removed: true };
}

/* ---------------- delivery ---------------- */
async function deliver({ tRef, send, plan, url, nowMs }) {
  const jobs = [];
  plan.forEach(({ sub, msgs }) => notifier.coalesceForRecipient(msgs).forEach((m) => jobs.push({ sub, m })));
  const gone = new Set();
  let sent = 0;
  for (let i = 0; i < jobs.length; i += 25) {
    const slice = jobs.slice(i, i + 25);
    const results = await Promise.allSettled(slice.map((j) => send(j.sub, { title: j.m.title, body: j.m.body, tag: j.m.tag, url, ts: nowMs })));
    results.forEach((r, k) => {
      if (r.status !== 'fulfilled' || !r.value) return;
      if (r.value.ok) sent++;
      else if (r.value.gone) gone.add(slice[k].sub.id);
    });
  }
  for (const id of gone) await tRef.collection('pushSubs').doc(id).delete();
  return { sent, expired: gone.size, messages: jobs.length };
}

/* ---------------- one tournament ---------------- */
async function processTournament({ db, send, nowMs }, entry) {
  const { clientId, tournamentId } = entry;
  const regRef = db.doc(`${REGISTRY}/${registryId(clientId, tournamentId)}`);
  const tRef = db.doc(tournamentPath(clientId, tournamentId));
  const tSnap = await tRef.get();
  const t = tSnap.exists ? tSnap.data() : null;
  if (!t || !(t.schedule && t.schedule.status === 'published') || t.status === 'cancelled' || t.status === 'completed') {
    await regRef.delete();
    return { removed: true };
  }
  const cfg = notifier.normalizeNotifyConfig(t.notifications);
  if (!cfg.enabled) {
    if (entry.pending) {
      for (const d of (await tRef.collection('notifyOutbox').get()).docs) await d.ref.delete();
      await regRef.set({ pending: false }, { merge: true });
    }
    return { skipped: 'disabled' };
  }

  const local = notifier.localNow(nowMs, cfg.utcOffsetMin);
  const dates = entry.dates || [];
  const lastDate = dates.length ? dates.reduce((a, b) => (a > b ? a : b)) : null;
  if (!entry.pending && lastDate && notifier.addDays(lastDate, 2) < local.date) { await regRef.delete(); return { removed: true }; }
  const scanDay = dates.includes(local.date) || (local.min >= 1380 && dates.includes(notifier.addDays(local.date, 1)));
  if (!scanDay && !entry.pending) return { skipped: 'idle' };

  const subs = (await tRef.collection('pushSubs').get()).docs.map((d) => ({ id: d.id, ...d.data() }));
  const outboxSnap = await tRef.collection('notifyOutbox').get();
  if (!subs.length) {
    for (const d of outboxSnap.docs) await d.ref.delete();
    if (entry.pending) await regRef.set({ pending: false }, { merge: true });
    return { skipped: 'no-subscribers' };
  }

  // One runner per tournament at a time.
  const stateRef = tRef.collection('notifyState').doc('state');
  const prev = await db.runTransaction(async (tx) => {
    const s = await tx.get(stateRef);
    const d = s.exists ? s.data() : {};
    if (d.lockUntil && d.lockUntil > nowMs) return null;
    tx.set(stateRef, { ...d, lockUntil: nowMs + LOCK_MS });
    return d;
  });
  if (!prev) return { skipped: 'locked' };
  const reminded = {};
  Object.entries(prev.reminded || {}).forEach(([k, v]) => { if (nowMs - v < REMINDED_KEEP_MS) reminded[k] = v; });

  let plan = new Map();
  let toDelete = [];
  let summary = {};
  try {
    const venues = scheduler.normalizeVenues(t.venues);
    const windowDates = [notifier.addDays(local.date, -1), local.date, notifier.addDays(local.date, 1)];
    const nearby = (await tRef.collection('matches').where('sched.date', 'in', windowDates).get()).docs.map((d) => ({ id: d.id, ...d.data() }));
    const byId = new Map(nearby.map((m) => [m.id, m]));
    const live = notifier.isLivePlay(nearby, nowMs, cfg);
    const allowChanges = notifier.canSendChangesNow(nowMs, cfg, live);

    const add = (sub, msg) => { if (!plan.has(sub.id)) plan.set(sub.id, { sub, msgs: [] }); plan.get(sub.id).msgs.push(msg); };
    const sideOf = (sub, match) => {
      const ids = match.participantIds || [];
      for (let i = 0; i < ids.length; i++) if (ids[i] !== 'BYE' && (sub.regIds || []).includes(ids[i])) return i;
      return -1;
    };

    const koCache = {};
    const knockoutFor = async (divisionId) => {
      if (!koCache[divisionId]) {
        koCache[divisionId] = (await tRef.collection('matches').where('divisionId', '==', divisionId).where('stage', '==', 'knockout').get()).docs.map((d) => ({ id: d.id, ...d.data() }));
      }
      return koCache[divisionId];
    };

    // 1. queued organizer events
    let held = 0;
    for (const doc of outboxSnap.docs) {
      const o = doc.data();
      if (nowMs - (o.createdAtMs || 0) > notifier.OUTBOX_MAX_AGE_MS) { toDelete.push(doc.ref); continue; }
      if (!allowChanges) { held++; continue; }
      toDelete.push(doc.ref);
      if (o.type === 'publish') {
        subs.forEach((s) => add(s, notifier.msgPublish()));
      } else if (o.type === 'match_change') {
        if (!cfg.reassignments) continue;
        let m = byId.get(o.matchId);
        if (!m) { const ms = await tRef.collection('matches').doc(o.matchId).get(); m = ms.exists ? { id: ms.id, ...ms.data() } : null; }
        if (!m || notifier.isPlayed(m) || notifier.isBye(m)) continue;
        if (!notifier.hasSched(m) && o.prevKnown === false) continue;
        subs.forEach((s) => {
          const side = sideOf(s, m);
          if (side >= 0) add(s, notifier.msgMatchChange({ match: m, sideIndex: side, venues, cfg, nowMs, prevKnown: o.prevKnown }));
        });
      } else if (o.type === 'qualified') {
        const ko = await knockoutFor(o.divisionId);
        for (const pid of o.participantIds || []) {
          const next = ko.filter((m) => !notifier.isPlayed(m) && (m.participantIds || []).includes(pid))
            .sort((a, b) => (a.round - b.round) || (a.position - b.position))[0];
          subs.filter((s) => (s.regIds || []).includes(pid)).forEach((s) => add(s, notifier.msgQualified({ divisionName: o.divisionName, advancerCount: o.advancerCount || (o.participantIds || []).length, nextMatch: next, venues, cfg, nowMs })));
        }
      }
    }

    // 2. Up Next reminders
    const { due, held: delayed } = notifier.planReminders({ matches: nearby, cfg, nowMs, reminded });
    due.forEach(({ match, key, minutesLeft }) => {
      reminded[key] = nowMs;
      subs.forEach((s) => {
        const side = sideOf(s, match);
        if (side >= 0) add(s, notifier.msgReminder({ match, sideIndex: side, venues, cfg, nowMs, minutesLeft }));
      });
    });
    summary = { reminders: due.length, delayed: delayed.length, heldEvents: held, live };
  } catch (e) {
    await stateRef.set({ ...prev, lockUntil: 0 });
    throw e;
  }

  // Claim first, send second: a crash can drop an alert but never repeat one.
  await stateRef.set({ reminded, lockUntil: 0, lastRunMs: nowMs });
  for (const ref of toDelete) await ref.delete();
  const remaining = outboxSnap.docs.length - toDelete.length;
  if (Boolean(entry.pending) !== (remaining > 0)) await regRef.set({ pending: remaining > 0 }, { merge: true });

  const delivered = await deliver({ tRef, send, plan, url: pushUrl(clientId, tournamentId), nowMs });
  return { ...summary, ...delivered };
}

/* ---------------- all live tournaments ---------------- */
async function runNotifier({ db, send, nowMs, log }) {
  const now = nowMs == null ? Date.now() : nowMs;
  const entries = (await db.collection(REGISTRY).get()).docs.map((d) => d.data());
  const out = { tournaments: entries.length, sent: 0, errors: 0 };
  for (const entry of entries) {
    if (!entry || !entry.clientId || !entry.tournamentId) continue;
    try {
      const r = await processTournament({ db, send, nowMs: now }, entry);
      out.sent += r.sent || 0;
    } catch (e) {
      out.errors++;
      if (log) log(`notify ${entry.clientId}/${entry.tournamentId}: ${e.message}`);
    }
  }
  return out;
}

module.exports = {
  REGISTRY, registryId, normalizePhone, pushUrl,
  syncRegistry, removeRegistry, enqueueEvents,
  validateSubscription, registerSubscription, removeSubscription,
  processTournament, runNotifier,
};
