/* ================================================================
   Multi-venue scheduler tests (pure engine code, no Firebase).

   Usage:  node tests/scheduler.test.js
   ================================================================ */
const path = require('path');
const eng = path.join(__dirname, '..', 'functions', 'engines');
const S = require(path.join(eng, 'scheduler'));
const RR = require(path.join(eng, 'roundRobin'));

let passed = 0, failed = 0;
function check(name, ok, detail) {
  if (ok) passed++; else { failed++; console.log(`  FAIL: ${name}${detail ? ' -- ' + detail : ''}`); }
}
const section = (t) => console.log(`\n${t}`);
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const HM = (h, m = 0) => h * 60 + m;

/* ---------------- fixtures ---------------- */
function venue(id, name, courtCount, extra = {}) {
  return { id, name, address: '', kind: extra.kind || 'external',
    courts: Array.from({ length: courtCount }, (_, i) => ({ id: `${id}c${i + 1}`, name: `Court ${i + 1}`, active: true, tenantCourtId: extra.tenantCourts ? extra.tenantCourts[i] : null })) };
}
const cfg = (over = {}) => S.normalizeScheduleConfig({
  days: [{ date: '2026-10-10', startMin: HM(8), endMin: HM(18) }],
  matchMinutes: 30, restMinutes: 15, travelBufferMinutes: 30, primaryVenueId: 'v1', ...over,
}, over.__venues || [venue('v1', 'Main', 4), venue('v2', 'Satellite', 4)]);

/* a pool of `size` teams -> match descriptors with 2 players per team */
function poolMatches(divisionId, groupId, size, stage = 'group') {
  const teams = Array.from({ length: size }, (_, i) => ({ participantId: `${divisionId}${groupId}t${i + 1}`, playerNames: [`P${i}a`, `P${i}b`] }));
  const players = Object.fromEntries(teams.map((t) => [t.participantId, [`${t.participantId}-1`, `${t.participantId}-2`]]));
  return RR.generateMatches(teams).map((m, i) => ({
    id: `${divisionId}-${groupId}-${i + 1}`, divisionId, stage, unitKey: `${divisionId}:${groupId}`, round: m.round, position: m.position,
    participantIds: m.participantIds, participantNames: m.participantNames,
    playerIds: [...players[m.participantIds[0]], ...players[m.participantIds[1]]],
  }));
}
const withSched = (matches, res) => matches.map((m) => ({ ...m, sched: res.assignments[m.id] || null }));
const errorsOf = (r) => r.conflicts.filter((c) => c.severity === 'error');

/* ---------------- normalization ---------------- */
section('normalizeVenues / normalizeScheduleConfig');
{
  const v = S.normalizeVenues([{ id: 'Main Venue!!', name: '  <b>Sports Zone</b>  ', address: '123 St', kind: 'facility', courts: [{ name: 'Court 1', tenantCourtId: 'court1' }, { id: 'c1', active: false }] }, null, { courts: 'nope' }]);
  check('ids are sanitized (lowercase, no punctuation) and names lose angle brackets', v[0].id === 'mainvenue' && !/[<>]/.test(v[0].name) && v[0].name.length > 0, JSON.stringify(v[0]));
  check('duplicate court ids within a venue are made unique', new Set(v[0].courts.map((c) => c.id)).size === v[0].courts.length);
  check('facility courts keep tenantCourtId; external drop it', v[0].courts[0].tenantCourtId === 'court1' && v[2].courts.length === 0 && v[1].kind === 'external');
  check('court defaults: names, active flag', v[0].courts[1].active === false && v[0].courts[0].name === 'Court 1');
  check('caps venues at 8', S.normalizeVenues(Array.from({ length: 20 }, () => ({}))).length === 8);
  check('caps courts per venue at 24', S.normalizeVenues([{ courts: Array.from({ length: 60 }, () => ({})) }])[0].courts.length === 24);

  const c = S.normalizeScheduleConfig({ matchMinutes: 500, restMinutes: -5, travelBufferMinutes: 'x', primaryVenueId: 'nope',
    days: [{ date: '2026-10-11', startMin: 480, endMin: 1080 }, { date: 'garbage' }, { date: '2026-10-10', startMin: 480, endMin: 490 }, { date: '2026-10-11', startMin: 0, endMin: 100 }] }, [{ id: 'a' }]);
  check('match minutes clamp to 120, rest to 0, bad travel falls back to default', c.matchMinutes === 120 && c.restMinutes === 0 && c.travelBufferMinutes === 30);
  check('invalid, too-short, and duplicate days are dropped', c.days.length === 1 && c.days[0].date === '2026-10-11');
  check('unknown primary venue falls back to the first venue', c.primaryVenueId === 'a');
  check('days are sorted', S.normalizeScheduleConfig({ days: [{ date: '2026-10-12', startMin: 480, endMin: 1000 }, { date: '2026-10-10', startMin: 480, endMin: 1000 }] }, []).days[0].date === '2026-10-10');
}

/* ---------------- estimateUnits & capacity ---------------- */
section('estimateUnits / capacityCheck -- the spec scenarios');
{
  const divs = [{ id: 'd1', name: "Men's Doubles", format: 'group_knockout', groupConfig: { strategy: 'size', targetSize: 6 } }];
  const units = S.estimateUnits(divs, { d1: 24 });
  const pools = units.filter((u) => u.stage === 'group');
  check('24 teams @6 -> 4 pools of 15 matches + a 7-match playoff', pools.length === 4 && pools.every((u) => u.matchCount === 15) && units.find((u) => u.stage === 'knockout').matchCount === 7);
  check('round robin of 6 -> 15, bracket of 8 -> 7', S.estimateUnits([{ id: 'r', name: 'R', format: 'round_robin' }], { r: 6 })[0].matchCount === 15 && S.estimateUnits([{ id: 's', name: 'S', format: 'single_elim' }], { s: 8 })[0].matchCount === 7);
  check('divisions with <2 teams contribute nothing', S.estimateUnits(divs, { d1: 1 }).length === 0);

  const venues = [venue('v1', 'Venue 1 (Main)', 4), venue('v2', 'Venue 2 (Satellite)', 4)];
  const A = S.capacityCheck(units, venues, cfg());
  const success = A.messages.find((m) => m.level === 'success');
  check('Scenario A: two 4-court venues fit 24 teams', A.ok && success && /Balanced multi-venue plan/.test(success.text), JSON.stringify(A.messages));
  check('Scenario A: pools split across both venues, playoffs consolidate at the primary', success && /Playoffs consolidate at Venue 1 \(Main\)/.test(success.text) && A.assignment[`d1:ko`] === 'v1');
  check('Scenario A: each venue gets whole pools (isolation)', Object.entries(A.assignment).filter(([k]) => !k.endsWith(':ko')).every(([, v]) => v === 'v1' || v === 'v2'));

  // Scenario B: a short day and a 1-court satellite -> bottleneck with a computed recommendation
  const venuesB = [venue('v1', 'Venue 1', 4), venue('v2', 'Venue 2', 1)];
  const B = S.capacityCheck(units, venuesB, cfg({ days: [{ date: '2026-10-10', startMin: HM(9), endMin: HM(13) }], __venues: venuesB }));
  const warn = B.messages.find((m) => m.level === 'warning' && /Venue 2/.test(m.text));
  check('Scenario B: reports insufficient capacity on the 1-court venue', !B.ok && warn && /Insufficient court capacity/.test(warn.text) && /Venue 2/.test(warn.text), JSON.stringify(B.messages));
  const v2 = B.perVenue.find((r) => r.venueId === 'v2');
  check('Scenario B: recommendation is computed from the numbers, not hard-coded', warn && new RegExp(`at least ${v2.recommendedCourts}\\b`).test(warn.text) && v2.recommendedCourts > 1, warn && warn.text);

  check('no venues -> friendly prompt, not a crash', S.capacityCheck(units, [], cfg()).messages[0].level === 'info');
  const noCourt = [venue('v1', 'Empty', 0)];
  check('a venue with matches but no active courts is an error', S.capacityCheck(units, noCourt, cfg({ __venues: noCourt })).messages.some((m) => m.level === 'error'));

  const pool8 = S.estimateUnits([{ id: 'x', name: 'X', format: 'round_robin' }], { x: 12 });
  const longPool = S.capacityCheck(pool8, [venue('v1', 'V', 20)], cfg({ days: [{ date: '2026-10-10', startMin: HM(9), endMin: HM(11) }], __venues: [venue('v1', 'V', 20)] }));
  check('a pool that cannot finish in a day even with unlimited courts is an error', longPool.messages.some((m) => m.level === 'error' && /unlimited courts/.test(m.text)), JSON.stringify(longPool.messages));
}

/* ---------------- the scheduler ---------------- */
section('scheduleMatches');
{
  const venues = [venue('v1', 'Main', 4)];
  const config = cfg({ __venues: venues });
  const ms = poolMatches('d1', 'A', 6);
  const res = S.scheduleMatches({ matches: ms, venues, config, unitVenue: { 'd1:A': 'v1' } });
  const placed = withSched(ms, res);
  check('all 15 matches of a 6-team pool are placed', Object.keys(res.assignments).length === 15 && res.unscheduled.length === 0);
  const v = S.validateSchedule({ matches: placed, venues, config });
  check('the schedule validates with no errors or warnings', v.errorCount === 0 && v.warningCount === 0, JSON.stringify(v.conflicts));
  const lastEnd = Math.max(...Object.values(res.assignments).map((a) => a.endMin));
  check('finishes in a sensible time (5 rounds with rest, well inside the day)', lastEnd <= HM(12), S.fmtMin(lastEnd));
  check('uses several courts at once (rounds run in parallel)', new Set(Object.values(res.assignments).filter((a) => a.startMin === HM(8)).map((a) => a.courtId)).size === 3);
  check('start times sit on the 5-minute grid', Object.values(res.assignments).every((a) => a.startMin % 5 === 0));

  const again = S.scheduleMatches({ matches: ms, venues, config, unitVenue: { 'd1:A': 'v1' } });
  check('deterministic: identical input gives identical output', eq(res, again));

  // real bookings are respected
  const busy = { 'v1|v1c1|2026-10-10': [{ s: HM(8), e: HM(10) }], 'v1|v1c2|2026-10-10': [{ s: HM(8), e: HM(9) }] };
  const res2 = S.scheduleMatches({ matches: ms, venues, config, busy, unitVenue: { 'd1:A': 'v1' } });
  const onBusy = Object.values(res2.assignments).filter((a) => (a.courtId === 'v1c1' && a.startMin < HM(10)) || (a.courtId === 'v1c2' && a.startMin < HM(9)));
  check('existing bookings block those courts and times', onBusy.length === 0 && res2.unscheduled.length === 0);
  const v2r = S.validateSchedule({ matches: withSched(ms, res2), venues, config, busy });
  check('and the validator agrees (no facility_busy)', !v2r.conflicts.some((c) => c.type === 'facility_busy'));

  // capacity exhaustion
  const tiny = cfg({ days: [{ date: '2026-10-10', startMin: HM(9), endMin: HM(10) }], __venues: [venue('v1', 'Main', 1)] });
  const res3 = S.scheduleMatches({ matches: poolMatches('d2', 'A', 3), venues: [venue('v1', 'Main', 1)], config: tiny, unitVenue: { 'd2:A': 'v1' } });
  check('when time runs out, the rest are reported unscheduled with a reason', Object.keys(res3.assignments).length === 1 && res3.unscheduled.length === 2 && /No free court/.test(res3.unscheduled[0].reason), JSON.stringify(res3));

  // multi-day spillover
  const twoDay = cfg({ restMinutes: 0, days: [{ date: '2026-10-10', startMin: HM(9), endMin: HM(10) }, { date: '2026-10-11', startMin: HM(9), endMin: HM(10) }], __venues: [venue('v1', 'Main', 1)] });
  const res4 = S.scheduleMatches({ matches: poolMatches('d2', 'A', 3), venues: [venue('v1', 'Main', 1)], config: twoDay, unitVenue: { 'd2:A': 'v1' } });
  check('overflow continues onto the next tournament day', Object.keys(res4.assignments).length === 3 && new Set(Object.values(res4.assignments).map((a) => a.date)).size === 2);

  // inactive court is never used
  const mv = [{ ...venue('v1', 'Main', 2) }];
  mv[0].courts[0].active = false;
  const res5 = S.scheduleMatches({ matches: poolMatches('d3', 'A', 4), venues: mv, config: cfg({ __venues: mv }), unitVenue: { 'd3:A': 'v1' } });
  check('courts in maintenance are never scheduled', Object.values(res5.assignments).every((a) => a.courtId === 'v1c2'));
}

section('scheduleMatches -- multiple venues, travel, players in two divisions');
{
  const venues = [venue('v1', 'Main', 2), venue('v2', 'Satellite', 2)];
  const config = cfg({ __venues: venues });
  // one player appears in a Pool at Main AND a match at the Satellite (two divisions)
  const a = { id: 'a1', divisionId: 'd1', stage: 'group', unitKey: 'd1:A', round: 1, position: 0, playerIds: ['shared', 'x1'], participantIds: ['t1', 't2'], participantNames: ['T1', 'T2'] };
  const b = { id: 'b1', divisionId: 'd2', stage: 'group', unitKey: 'd2:A', round: 1, position: 0, playerIds: ['shared', 'y1'], participantIds: ['t3', 't4'], participantNames: ['T3', 'T4'] };
  const res = S.scheduleMatches({ matches: [a, b], venues, config, unitVenue: { 'd1:A': 'v1', 'd2:A': 'v2' } });
  const sa = res.assignments.a1, sb = res.assignments.b1;
  const gap = sb.startMin >= sa.endMin ? sb.startMin - sa.endMin : sa.startMin - sb.endMin;
  check('a shared player is never in two places, and gets the full travel buffer between venues', sa && sb && sa.date === sb.date ? gap >= 30 : true, `gap=${gap}`);
  const v = S.validateSchedule({ matches: [{ ...a, sched: sa }, { ...b, sched: sb }], venues, config });
  check('validator sees no travel or overlap error', v.errorCount === 0, JSON.stringify(v.conflicts));

  // Knockout must follow pool play (and use travel time if the pool was elsewhere)
  const pool = poolMatches('d5', 'A', 4);
  const ko = [{ id: 'ko1', divisionId: 'd5', stage: 'knockout', unitKey: 'd5:ko', round: 1, position: 0, playerIds: [...pool[0].playerIds.slice(0, 2), ...pool[5].playerIds.slice(0, 2)], participantIds: ['k1', 'k2'], participantNames: ['K1', 'K2'] }];
  const all = [...pool, ...ko];
  const resK = S.scheduleMatches({ matches: all, venues, config, unitVenue: { 'd5:A': 'v2', 'd5:ko': 'v1' } });
  const lastPoolEnd = Math.max(...pool.map((m) => resK.assignments[m.id].endMin));
  check('the knockout starts only after every pool match ends, plus the travel buffer', resK.assignments.ko1.startMin >= lastPoolEnd + 30, `${S.fmtMin(resK.assignments.ko1.startMin)} vs pool end ${S.fmtMin(lastPoolEnd)}`);
  const vk = S.validateSchedule({ matches: withSched(all, resK), venues, config });
  check('the consolidated schedule has no errors', vk.errorCount === 0, JSON.stringify(vk.conflicts));
  check('players moving from the satellite to the primary are flagged', vk.flags.some((f) => f.type === 'venue_change' && f.matchId === 'ko1'));

  const hints = S.assignUnitsToVenues([{ key: 'd1:A', matchCount: 10, stage: 'group' }, { key: 'd1:B', matchCount: 10, stage: 'group' }, { key: 'd1:ko', matchCount: 7, stage: 'knockout' }], venues, config, null);
  check('pool isolation: pools land on different venues when capacity allows, playoffs at primary', hints['d1:ko'] === 'v1' && hints['d1:A'] !== hints['d1:B'], JSON.stringify(hints));
  const stay = S.assignUnitsToVenues([{ key: 'd1:A', matchCount: 10, stage: 'group' }], venues, config, { 'd1:A': 'v2' });
  check('a pool that already has scheduled matches stays at its venue', stay['d1:A'] === 'v2');
  check('court-weighted balancing: a 4-court venue takes about twice the load of a 2-court one',
    (() => { const vs = [venue('v1', 'Big', 4), venue('v2', 'Small', 2)]; const us = Array.from({ length: 6 }, (_, i) => ({ key: `u${i}`, matchCount: 10, stage: 'group' })); const m = S.assignUnitsToVenues(us, vs, cfg({ __venues: vs }), null); const big = Object.values(m).filter((x) => x === 'v1').length; return big === 4; })());
}

/* ---------------- validator: every conflict type ---------------- */
section('validateSchedule -- each rule');
{
  const venues = [venue('v1', 'Main', 2), venue('v2', 'Sat', 1)];
  venues[0].courts[1].active = false;
  const config = cfg({ __venues: venues });
  const mk = (id, sched, playerIds, extra = {}) => ({ id, divisionId: 'd', stage: 'group', unitKey: 'd:A', participantNames: [id, 'opp'], playerIds, sched, ...extra });
  const day = '2026-10-10';
  const S1 = (venueId, courtId, s, e = s + 30, date = day) => ({ venueId, courtId, date, startMin: s, endMin: e });

  const types = (ms, busy) => S.validateSchedule({ matches: ms, venues, config, busy }).conflicts.map((c) => c.type);
  check('court_overlap', types([mk('a', S1('v1', 'v1c1', HM(9)), ['p1']), mk('b', S1('v1', 'v1c1', HM(9, 15)), ['p2'])]).includes('court_overlap'));
  check('player_overlap', types([mk('a', S1('v1', 'v1c1', HM(9)), ['p1']), mk('b', S1('v2', 'v2c1', HM(9, 10)), ['p1'])]).includes('player_overlap'));
  check('travel_buffer blocks a 20-minute hop between venues', types([mk('a', S1('v1', 'v1c1', HM(9)), ['p1']), mk('b', S1('v2', 'v2c1', HM(9, 50)), ['p1'])]).includes('travel_buffer'));
  check('a 30-minute hop between venues is fine', !types([mk('a', S1('v1', 'v1c1', HM(9)), ['p1']), mk('b', S1('v2', 'v2c1', HM(10)), ['p1'])]).includes('travel_buffer'));
  const rest = S.validateSchedule({ matches: [mk('a', S1('v1', 'v1c1', HM(9)), ['p1']), mk('b', S1('v1', 'v1c1', HM(9, 35)), ['p1'])], venues, config });
  check('rest_short is only a warning', rest.conflicts.some((c) => c.type === 'rest_short' && c.severity === 'warning') && rest.errorCount === 0);
  check('inactive_court', types([mk('a', S1('v1', 'v1c2', HM(9)), ['p1'])]).includes('inactive_court'));
  check('unknown_court', types([mk('a', S1('v9', 'zz', HM(9)), ['p1'])]).includes('unknown_court'));
  check('outside_window (before opening)', types([mk('a', S1('v1', 'v1c1', HM(6)), ['p1'])]).includes('outside_window'));
  check('outside_window (not a tournament day)', types([mk('a', S1('v1', 'v1c1', HM(9), HM(9, 30), '2026-12-25'), ['p1'])]).includes('outside_window'));
  check('facility_busy', types([mk('a', S1('v1', 'v1c1', HM(9)), ['p1'])], { [`v1|v1c1|${day}`]: [{ s: HM(9), e: HM(10) }] }).includes('facility_busy'));
  check('pool_split warns when one pool spans two venues', types([mk('a', S1('v1', 'v1c1', HM(9)), ['p1']), mk('b', S1('v2', 'v2c1', HM(9)), ['p2'])]).includes('pool_split'));
  check('errors sort before warnings', (() => { const r = S.validateSchedule({ matches: [mk('a', S1('v1', 'v1c1', HM(9)), ['p1']), mk('b', S1('v1', 'v1c1', HM(9, 35)), ['p1']), mk('c', S1('v1', 'v1c1', HM(9, 10)), ['p9'])], venues, config }); return r.conflicts[0].severity === 'error'; })());
  check('unscheduled matches are ignored, not errors', S.validateSchedule({ matches: [mk('a', null, ['p1'])], venues, config }).conflicts.length === 0);
}

/* ---------------- busy intervals & court blocks ---------------- */
section('busyFromBookings / courtBlocks');
{
  const venues = [venue('v1', 'Club', 2, { kind: 'facility', tenantCourts: ['court1', 'court2'] }), venue('v2', 'Ext', 1)];
  const bookings = [
    { court: 'court1', date: '2026-10-10', start: 9, end: 11, status: 'Reserved' },
    { court: 'court2', date: '2026-10-10', start: 14, end: 15, status: 'OpenPlay' },
    { court: 'courtX', date: '2026-10-10', start: 9, end: 10 },
    { court: 'court1', date: '2026-10-10', start: 12, end: 13, source: 'tournament', tournamentId: 'T1' },
  ];
  const busy = S.busyFromBookings(bookings, venues, (b) => b.source === 'tournament' && b.tournamentId === 'T1');
  check('facility bookings become busy minutes on the mapped court', eq(busy['v1|v1c1|2026-10-10'], [{ s: 540, e: 660 }]));
  check('open play blocks count as busy too; unknown courts are ignored', eq(busy['v1|v1c2|2026-10-10'], [{ s: 840, e: 900 }]) && Object.keys(busy).length === 2);
  check("the tournament's own earlier blocks are ignored so regenerating doesn't fight itself", !(busy['v1|v1c1|2026-10-10'] || []).some((x) => x.s === 720));
  check('external venues never get busy intervals from club bookings', !Object.keys(busy).some((k) => k.startsWith('v2|')));

  const m = (id, court, s, e) => ({ id, sched: { venueId: 'v1', courtId: court, date: '2026-10-10', startMin: s, endMin: e } });
  const merged = S.courtBlocks([m('a', 'v1c1', HM(8), HM(8, 30)), m('b', 'v1c1', HM(8, 30), HM(9)), m('c', 'v1c1', HM(9, 30), HM(10, 15))], venues);
  check('touching/overlapping matches merge into one hour-aligned block (8-11)', eq(merged, [{ tenantCourtId: 'court1', date: '2026-10-10', startHour: 8, endHour: 11 }]), JSON.stringify(merged));
  const split = S.courtBlocks([m('a', 'v1c1', HM(8), HM(8, 30)), m('c', 'v1c1', HM(10), HM(10, 30))], venues);
  check('a gap of a whole hour stays as two blocks', split.length === 2 && split[0].endHour === 9 && split[1].startHour === 10);
  check('external-venue matches produce no calendar blocks', S.courtBlocks([{ id: 'x', sched: { venueId: 'v2', courtId: 'v2c1', date: '2026-10-10', startMin: 480, endMin: 510 } }], venues).length === 0);
}

/* ---------------- property test: scheduler output always validates ---------------- */
section('property test -- whatever the scheduler places passes the validator');
{
  let seed = 987654;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const ri = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));
  let bad = null, trials = 0, totalPlaced = 0;
  for (let t = 0; t < 250 && !bad; t++) {
    const nv = ri(1, 3);
    const venues = Array.from({ length: nv }, (_, i) => venue(`v${i + 1}`, `V${i + 1}`, ri(1, 4)));
    const config = S.normalizeScheduleConfig({
      days: Array.from({ length: ri(1, 2) }, (_, i) => ({ date: `2026-10-${10 + i}`, startMin: HM(ri(7, 10)), endMin: HM(ri(14, 20)) })),
      matchMinutes: [20, 25, 30, 40, 45][ri(0, 4)], restMinutes: ri(0, 30), travelBufferMinutes: ri(0, 45), primaryVenueId: 'v1',
    }, venues);
    // a mix of pools, sharing a player across some pools to force cross-venue conflicts
    const pools = Array.from({ length: ri(1, 4) }, (_, i) => poolMatches(`d${i}`, 'A', ri(3, 6)));
    const shared = `shared${t}`;
    pools.forEach((p, i) => { if (i % 2 === 0) p[0].playerIds[0] = shared; });
    const matches = pools.flat();
    const units = [...new Set(matches.map((m) => m.unitKey))].map((k) => ({ key: k, matchCount: matches.filter((m) => m.unitKey === k).length, stage: 'group' }));
    const unitVenue = S.assignUnitsToVenues(units, venues, config, null);
    const busy = rnd() < 0.5 ? { [`v1|v1c1|${config.days[0].date}`]: [{ s: HM(9), e: HM(11) }] } : {};
    const res = S.scheduleMatches({ matches, venues, config, busy, unitVenue });
    trials++;
    totalPlaced += Object.keys(res.assignments).length;
    if (Object.keys(res.assignments).length + res.unscheduled.length !== matches.length) { bad = `t${t}: placed+unscheduled != total`; break; }
    const v = S.validateSchedule({ matches: withSched(matches, res), venues, config, busy });
    if (v.errorCount) { bad = `t${t}: ${JSON.stringify(v.conflicts.filter((c) => c.severity === 'error').slice(0, 2))}`; break; }
    const rerun = S.scheduleMatches({ matches, venues, config, busy, unitVenue });
    if (!eq(rerun, res)) { bad = `t${t}: not deterministic`; break; }
  }
  check(`${trials} random tournaments (${totalPlaced} matches placed): zero validator errors, nothing lost, deterministic`, !bad, bad);
}

console.log(`\n=== SCHEDULER TESTS: ${passed}/${passed + failed} passed ===`);
process.exit(failed === 0 ? 0 : 1);
