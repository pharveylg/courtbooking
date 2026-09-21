/* "Next open" -- the soonest bookable hour still free today.

   Pure functions, no DOM and no I/O. Shared by the facility app (Home hint) and
   the facility picker (Continue card) so both apply the same rules: per-court
   operating hours, staff-reserved hours (weekly template + per-date overrides),
   open-play blocks and existing bookings. Loaded by the browser as `NextOpen`
   and by the tests via require(). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.NextOpen = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const pad = (n) => String(n).padStart(2, '0');

  /* The calendar date on the player's own clock. (toISOString() would give the
     UTC date, which is the previous day for anyone east of UTC before 8am.) */
  function localISO(d) {
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  function fmtHour(h) {
    if (h === 12) return '12:00 PM';
    if (h === 24) return '12:00 AM';
    if (h < 12) return `${h}:00 AM`;
    return `${h - 12}:00 PM`;
  }

  /* Older saves stored day-of-week on/off flags for a fixed 5-10pm block, with
     or without per-court keys. Same migration the app has always applied. */
  const LEGACY_STAFF_HOURS = { 17: true, 18: true, 19: true, 20: true, 21: true };
  function migrateStaffReserve(raw, activeCourts) {
    if (!raw || typeof raw !== 'object') return { template: {}, overrides: {} };
    if (raw.template) return { template: raw.template, overrides: raw.overrides || {} };
    const days = raw.days || {};
    const isPerCourt = Object.keys(days).some((k) => !/^[0-6]$/.test(k));
    const template = {};
    if (isPerCourt) {
      Object.entries(days).forEach(([courtId, dowMap]) => {
        template[courtId] = {};
        Object.entries(dowMap || {}).forEach(([dow, on]) => { if (on) template[courtId][dow] = { ...LEGACY_STAFF_HOURS }; });
      });
    } else {
      (activeCourts || []).forEach((c) => {
        template[c.id] = {};
        Object.entries(days).forEach(([dow, on]) => { if (on) template[c.id][dow] = { ...LEGACY_STAFF_HOURS }; });
      });
    }
    return { template, overrides: {} };
  }

  /* Hours for one court: its own override, else the facility-wide hours (and
     the court's older startHour for the booking-start hour). */
  function effectiveHours(court, baseHours, courtHours) {
    const override = court && courtHours ? courtHours[court.id] : null;
    const base = baseHours || {};
    const legacyStart = court && court.startHour !== undefined ? court.startHour : base.bookingStart;
    return {
      bookStart: override && override.bookingStart !== undefined ? override.bookingStart : legacyStart,
      close: override && override.close !== undefined ? override.close : base.close,
    };
  }

  function staffBlocked(staffReserve, courtId, dateISO, hour) {
    const dow = String(new Date(dateISO + 'T12:00:00').getDay());
    const tmpl = (staffReserve && staffReserve.template && staffReserve.template[courtId] && staffReserve.template[courtId][dow]) || {};
    const ov = staffReserve && staffReserve.overrides && staffReserve.overrides[courtId] && staffReserve.overrides[courtId][dateISO];
    const eff = ov ? { ...tmpl, ...ov } : tmpl;
    return eff[String(hour)] === true;
  }

  /* opts: {
       now?: Date, dateISO?: 'YYYY-MM-DD' (defaults to today on `now`'s clock),
       courts: [{id, active?, startHour?}], baseHours: {bookingStart, close},
       courtHours?: {[courtId]: {bookingStart?, close?}},
       staffReserve?: {template, overrides}, bookings?: [], openPlays?: []
     }
     Returns the hour (e.g. 16 for 4:00 PM), or null when nothing is left today. */
  function compute(opts) {
    const now = opts.now || new Date();
    const dateISO = opts.dateISO || localISO(now);
    const from = Math.ceil(now.getHours() + now.getMinutes() / 60 - 0.0001);
    const bookings = (opts.bookings || []).filter((b) => b.date === dateISO);
    const ops = [
      ...bookings.filter((b) => b.status === 'OpenPlay'),
      ...(opts.openPlays || []).filter((o) => o.date === dateISO),
    ];
    const plain = bookings.filter((b) => b.status !== 'OpenPlay');
    let best = null;
    (opts.courts || []).filter((c) => c.active !== false).forEach((c) => {
      const hrs = effectiveHours(c, opts.baseHours, opts.courtHours);
      for (let h = Math.max(hrs.bookStart, from); h < hrs.close; h++) {
        if (staffBlocked(opts.staffReserve, c.id, dateISO, h)) continue;
        if (ops.some((op) => (!op.court || op.court === c.id) && h < op.end && h + 1 > op.start)) continue;
        if (plain.some((b) => (!b.court || b.court === c.id) && h < b.end && h + 1 > b.start)) continue;
        if (best === null || h < best) best = h;
        break;
      }
    });
    return best;
  }

  return { localISO, fmtHour, migrateStaffReserve, effectiveHours, compute };
}));
