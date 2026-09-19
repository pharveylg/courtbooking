/* Match-alert planning -- pure functions, no I/O.

   The runner (notifyRunner.js) loads Firestore and sends pushes; everything
   that decides WHAT to send and WHEN lives here so it can be tested without
   a clock, a database or a push service.

   Rules implemented (from the tournament notification spec):
   - Up Next reminder: N minutes before a match, both teams, held while the
     court's previous match has overrun and isn't finished, dropped once the
     match is well underway.
   - Schedule changes (moved / newly scheduled / taken off): instant, but
     suppressed 10 PM - 6 AM and released from 7 AM, unless live play is
     running.
   - Several changes for the same person collapse into one digest.
   Times are wall-clock in the tournament's own timezone (a fixed UTC offset;
   Manila has no daylight saving). */

const DEFAULTS = Object.freeze({
  enabled: true,
  leadMinutes: 15,
  reassignments: true,
  utcOffsetMin: 480,
  quietStartMin: 22 * 60,
  quietEndMin: 6 * 60,
  digestMin: 7 * 60,
  graceMinutes: 30,
});
const LEAD_OPTIONS = Object.freeze([5, 10, 15, 20, 30, 45, 60]);
const PLAYED = Object.freeze(['completed', 'walkover', 'forfeit', 'cancelled']);
const OUTBOX_MAX_AGE_MS = 36 * 3600 * 1000;
const DIGEST_THRESHOLD = 2; // this many change-type messages for one person -> one digest

function normalizeNotifyConfig(raw) {
  const r = raw || {};
  const off = Math.round(Number(r.utcOffsetMin));
  return {
    enabled: r.enabled !== false,
    leadMinutes: LEAD_OPTIONS.includes(Number(r.leadMinutes)) ? Number(r.leadMinutes) : DEFAULTS.leadMinutes,
    reassignments: r.reassignments !== false,
    utcOffsetMin: Number.isFinite(off) && off >= -720 && off <= 840 ? off : DEFAULTS.utcOffsetMin,
    quietStartMin: DEFAULTS.quietStartMin,
    quietEndMin: DEFAULTS.quietEndMin,
    digestMin: DEFAULTS.digestMin,
    graceMinutes: DEFAULTS.graceMinutes,
  };
}

/* ---------------- time ---------------- */
const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);

function slotStartMs(sched, offsetMin) {
  const [y, m, d] = sched.date.split('-').map(Number);
  return Date.UTC(y, m - 1, d) + (sched.startMin - offsetMin) * 60000;
}
function slotEndMs(sched, offsetMin) {
  const [y, m, d] = sched.date.split('-').map(Number);
  return Date.UTC(y, m - 1, d) + (sched.endMin - offsetMin) * 60000;
}
/* Wall-clock date + minute-of-day in the tournament's timezone. */
function localNow(nowMs, offsetMin) {
  const t = new Date(nowMs + offsetMin * 60000);
  return { date: t.toISOString().slice(0, 10), min: t.getUTCHours() * 60 + t.getUTCMinutes() };
}
function addDays(date, n) {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function fmtDay(date) {
  const [y, m, d] = date.split('-').map(Number);
  return `${DAY_NAMES[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]} ${MONTH_NAMES[m - 1]} ${d}`;
}
function fmtClock(min) {
  const h24 = Math.floor(min / 60) % 24;
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(min % 60).padStart(2, '0')} ${h24 < 12 ? 'AM' : 'PM'}`;
}

/* ---------------- match helpers ---------------- */
const isBye = (m) => !!(m.isBye || (m.participantIds || []).includes('BYE'));
const isPlayed = (m) => PLAYED.includes(m.status);
const hasSched = (m) => !!(m.sched && isDate(m.sched.date) && Number.isFinite(m.sched.startMin));
const schedFingerprint = (s) => (s ? `${s.venueId}|${s.courtId}|${s.date}|${s.startMin}` : '');
const safeKey = (s) => String(s).replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 120);
const reminderKey = (m) => safeKey(`${m.id}_${schedFingerprint(m.sched)}`);

/* Where and when, in the words a player would use. */
function describeSlot(sched, venues, todayDate) {
  const v = (venues || []).find((x) => x.id === sched.venueId);
  const c = v && (v.courts || []).find((x) => x.id === sched.courtId);
  const venueName = (v && v.name) || 'the venue';
  const courtName = (c && c.name) || null;
  return {
    venueName, courtName,
    where: courtName ? `${venueName} - ${courtName}` : venueName,
    when: `${sched.date === todayDate ? '' : `${fmtDay(sched.date)}, `}${fmtClock(sched.startMin)}`,
    address: (v && v.address) || '',
  };
}

/* ---------------- push endpoint safety ----------------
   The subscribe callable stores whatever URL the browser hands it and the
   server later POSTs to it, so only genuine push-service hosts are accepted. */
const PUSH_HOST_SUFFIXES = ['fcm.googleapis.com', 'push.services.mozilla.com', 'push.apple.com', 'notify.windows.com'];
function isAllowedPushEndpoint(endpoint) {
  if (typeof endpoint !== 'string' || endpoint.length > 1000) return false;
  let u;
  try { u = new URL(endpoint); } catch (e) { return false; }
  if (u.protocol !== 'https:' || u.username || u.password || (u.port && u.port !== '443')) return false;
  const host = u.hostname.toLowerCase();
  return PUSH_HOST_SUFFIXES.some((s) => host === s || host.endsWith(`.${s}`));
}

/* ---------------- quiet hours ---------------- */
/* Live play: some scheduled match is within an hour of its window. */
function isLivePlay(matches, nowMs, cfg) {
  return matches.some((m) => hasSched(m) && !isBye(m)
    && nowMs >= slotStartMs(m.sched, cfg.utcOffsetMin) - 3600000
    && nowMs <= slotEndMs(m.sched, cfg.utcOffsetMin) + 3600000);
}
/* Organizer-made changes go out 7 AM - 10 PM, or any time during live play. */
function canSendChangesNow(nowMs, cfg, live) {
  if (live) return true;
  const { min } = localNow(nowMs, cfg.utcOffsetMin);
  return min >= cfg.digestMin && min < cfg.quietStartMin;
}

/* ---------------- reminders ---------------- */
/* A court is "delayed" when an earlier match on it is unfinished although its
   scheduled window is over. The reminder for the next match waits for it. */
function courtDelayed(match, matches, nowMs, offsetMin) {
  const s = match.sched;
  return matches.some((o) => o.id !== match.id && hasSched(o) && !isBye(o) && !isPlayed(o)
    && o.sched.venueId === s.venueId && o.sched.courtId === s.courtId && o.sched.date === s.date
    && o.sched.startMin < s.startMin && slotEndMs(o.sched, offsetMin) <= nowMs);
}

/* Which matches should get an Up Next reminder right now. `reminded` maps
   reminderKey -> true for ones already sent. */
function planReminders({ matches, cfg, nowMs, reminded }) {
  const due = [], held = [];
  const done = reminded || {};
  matches.forEach((m) => {
    if (!hasSched(m) || isBye(m) || isPlayed(m)) return;
    const start = slotStartMs(m.sched, cfg.utcOffsetMin);
    if (nowMs < start - cfg.leadMinutes * 60000 || nowMs > start + cfg.graceMinutes * 60000) return;
    if (done[reminderKey(m)]) return;
    (courtDelayed(m, matches, nowMs, cfg.utcOffsetMin) ? held : due).push({ match: m, key: reminderKey(m), minutesLeft: Math.round((start - nowMs) / 60000) });
  });
  return { due, held };
}

/* ---------------- message copy ---------------- */
function opponentOf(match, sideIndex) {
  const names = match.participantNames || [];
  return names[sideIndex === 0 ? 1 : 0] || 'your opponent';
}
function knockoutRoundName(advancerCount) {
  let size = 2;
  while (size < advancerCount) size *= 2;
  if (size <= 2) return 'Final';
  if (size === 4) return 'Semifinals';
  if (size === 8) return 'Quarterfinals';
  return `Round of ${size}`;
}

const msgPublish = () => ({ kind: 'change', title: '🗓️ The schedule is live!', body: 'Check the app to view your pool assignments, match times, venues, and court numbers.', tag: 'publish' });
const msgWelcome = (tournamentName) => ({ kind: 'info', title: '✅ Match alerts are on', body: `We'll let you know before your matches${tournamentName ? ` at ${tournamentName}` : ''}, and if a court or time changes.`, tag: 'welcome' });
const msgDigest = (count) => ({ kind: 'change', title: '📅 Tournament updates', body: `You have ${count} updates about your matches. Tap to see the latest.`, tag: 'digest' });

function msgReminder({ match, sideIndex, venues, cfg, nowMs, minutesLeft }) {
  const slot = describeSlot(match.sched, venues, localNow(nowMs, cfg.utcOffsetMin).date);
  const opp = opponentOf(match, sideIndex);
  const lead = minutesLeft > 0
    ? `starts in ${minutesLeft} min${minutesLeft === 1 ? '' : 's'}`
    : 'is up next -- your court is free now';
  return { kind: 'reminder', title: '🏓 Up Next!', body: `Your match against ${opp} ${lead} at ${slot.venueName}${slot.courtName ? ` on ${slot.courtName}` : ''}. Warm up now!`, tag: `rem-${match.id}` };
}

/* prevKnown: did the players already have a slot for this match? */
function msgMatchChange({ match, sideIndex, venues, cfg, nowMs, prevKnown }) {
  const opp = opponentOf(match, sideIndex);
  if (!hasSched(match)) {
    return { kind: 'change', title: '⚠️ Schedule Change', body: `Your match against ${opp} is off the schedule for now. A new time will be announced.`, tag: `chg-${match.id}` };
  }
  const slot = describeSlot(match.sched, venues, localNow(nowMs, cfg.utcOffsetMin).date);
  if (prevKnown === false) {
    return { kind: 'change', title: '📅 Match Scheduled', body: `Your match against ${opp} is set for ${slot.when} at ${slot.where}.`, tag: `chg-${match.id}` };
  }
  return { kind: 'change', title: '⚠️ Location / Schedule Change', body: `Your match against ${opp} has been moved to ${slot.where} at ${slot.when}.`, tag: `chg-${match.id}` };
}

/* nextMatch: the player's earliest unplayed knockout match, if any. */
function msgQualified({ divisionName, advancerCount, nextMatch, venues, cfg, nowMs }) {
  const round = knockoutRoundName(advancerCount);
  let tail = 'Your match time will be announced soon.';
  if (nextMatch && hasSched(nextMatch)) {
    const slot = describeSlot(nextMatch.sched, venues, localNow(nowMs, cfg.utcOffsetMin).date);
    tail = `Your next match is at ${slot.venueName}${slot.courtName ? ` on ${slot.courtName}` : ''} at ${slot.when}.`;
  }
  return { kind: 'change', title: "🏆 You've Qualified!", body: `You have advanced to the ${round}${divisionName ? ` in ${divisionName}` : ''}. ${tail}`, tag: `q-${safeKey(divisionName || 'division')}` };
}

/* Reminders always go out on their own (they are time-critical); change-type
   messages collapse into one digest once a person has several. */
function coalesceForRecipient(messages) {
  const reminders = messages.filter((m) => m.kind === 'reminder');
  const others = messages.filter((m) => m.kind !== 'reminder');
  const changes = others.filter((m) => m.kind === 'change');
  if (changes.length >= DIGEST_THRESHOLD) return [...reminders, msgDigest(changes.length), ...others.filter((m) => m.kind !== 'change')];
  return [...reminders, ...others];
}

module.exports = {
  DEFAULTS, LEAD_OPTIONS, PLAYED, OUTBOX_MAX_AGE_MS, DIGEST_THRESHOLD,
  normalizeNotifyConfig, isDate, slotStartMs, slotEndMs, localNow, addDays, fmtDay, fmtClock,
  isBye, isPlayed, hasSched, schedFingerprint, safeKey, reminderKey, describeSlot,
  isAllowedPushEndpoint, isLivePlay, canSendChangesNow, courtDelayed, planReminders,
  opponentOf, knockoutRoundName,
  msgPublish, msgWelcome, msgDigest, msgReminder, msgMatchChange, msgQualified, coalesceForRecipient,
};
