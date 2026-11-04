/* Public "venue screen" TV dashboard (tournament-display.html): the pure
   logic lives in tournament-display.js (TournamentDisplay) so it's
   require()-able here, same convention as next-open.js/queue-engine.js.
   Covers: courts-playing aggregation (joining a live match to its
   scheduled court), the leaderboard math (must stay identical to
   tournament.html's renderStatsTab), the spotlight-ticker callouts built
   from that same data, the session-start timestamp's idempotent stamping
   decision, and the generic Auto/Manual rotator used by both the
   featured-match panel and the leaderboard view switcher. Also checks
   (regex-over-HTML, same precedent as tests/queue-winner-pdf.test.js) that
   the new page exists and is linked from Tournament Admin.

   Usage: node tests/tournament-display.test.js */
const fs = require('fs');
const path = require('path');
const TD = require(path.join(__dirname, '..', 'tournament-display.js'));

let passed = 0, failed = 0;
function check(name, ok, detail) { if (ok) passed++; else { failed++; console.log(`  FAIL: ${name}${detail ? ' -- ' + detail : ''}`); } }
const section = (t) => console.log(`\n${t}`);
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/* ================================================================
   Courts-playing aggregation
   ================================================================ */
section('aggregateCourtsPlaying -- joins a live match to its scheduled court');

const VENUES = [
  { id: 'v1', name: 'Main Hall', courts: [{ id: 'c1', name: 'Court 1' }, { id: 'c2', name: 'Court 2' }, { id: 'c3', name: 'Court 3', active: false }] },
  { id: 'v2', name: 'Annex', courts: [{ id: 'c4', name: 'Court 4' }] },
];
check('countTotalCourts excludes courts with active:false', TD.countTotalCourts(VENUES) === 3);

const MATCHES_BY_ID = {
  m1: { sched: { venueId: 'v1', courtId: 'c1', date: '2026-01-01', startMin: 540 }, divisionId: 'D1' },
  m2: { sched: { venueId: 'v2', courtId: 'c4', date: '2026-01-01', startMin: 540 }, divisionId: 'D2' },
  m3: { divisionId: 'D1' }, // schedule not published for this match -- no sched at all
};
const agg1 = TD.aggregateCourtsPlaying({
  liveDocs: [{ id: 'm1' }, { id: 'm2' }, { id: 'm3' }],
  matchesById: MATCHES_BY_ID,
  venues: VENUES,
});
check('total court count is independent of how many are live', agg1.total === 3);
check('two live matches on two different, published-schedule courts count as 2 playing', agg1.playing === 2, JSON.stringify(agg1));
check('a live match whose schedule is not published is excluded, not counted as a 3rd court', agg1.courtKeys.length === 2 && !agg1.courtKeys.includes('undefined:undefined'));
check('liveByCourtKey carries the matchId/venueId/courtId/divisionId for each counted court', eq(agg1.liveByCourtKey['v1:c1'], { matchId: 'm1', venueId: 'v1', courtId: 'c1', divisionId: 'D1' }));

const agg2 = TD.aggregateCourtsPlaying({ liveDocs: [], matchesById: {}, venues: VENUES });
check('no live matches -> 0 playing, total unaffected', agg2.playing === 0 && agg2.total === 3);

check('venueCourtLabel formats "Venue · Court"', TD.venueCourtLabel({ venueId: 'v1', courtId: 'c2' }, VENUES) === 'Main Hall · Court 2');
check('venueCourtLabel falls back to just the venue name if the court is unknown', TD.venueCourtLabel({ venueId: 'v1', courtId: 'zzz' }, VENUES) === 'Main Hall');
check('venueCourtLabel returns null with no sched / no venue match', TD.venueCourtLabel(null, VENUES) === null && TD.venueCourtLabel({ venueId: 'nope' }, VENUES) === null);

/* ================================================================
   Leaderboard math -- must match tournament.html's renderStatsTab
   ================================================================ */
section('computeLeaderboardRows -- same math as tournament.html\'s Stats tab, generalized across divisions');

const MATCHES = [
  // Division D1: A beats B twice (11-3, 11-9), B beats A once isn't present -- A is unbeaten
  { divisionId: 'D1', status: 'completed', participantIds: ['A', 'B'], participantNames: ['Team A', 'Team B'], score: { a: 11, b: 3 }, winnerParticipantId: 'A' },
  { divisionId: 'D1', status: 'completed', participantIds: ['A', 'B'], participantNames: ['Team A', 'Team B'], score: { a: 11, b: 9 }, winnerParticipantId: 'A' },
  // Division D2: C beats D by a lot (blowout), D beats C by 1 (closest)
  { divisionId: 'D2', status: 'completed', participantIds: ['C', 'D'], participantNames: ['Team C', 'Team D'], score: { a: 11, b: 0 }, winnerParticipantId: 'C' },
  { divisionId: 'D2', status: 'completed', participantIds: ['D', 'C'], participantNames: ['Team D', 'Team C'], score: { a: 11, b: 10 }, winnerParticipantId: 'D' },
  // Not completed yet -- excluded
  { divisionId: 'D1', status: 'scheduled', participantIds: ['A', 'B'], participantNames: ['Team A', 'Team B'] },
  // A bye -- excluded
  { divisionId: 'D1', status: 'completed', participantIds: ['BYE', 'E'], participantNames: ['BYE', 'Team E'], score: { a: 0, b: 0 }, winnerParticipantId: 'E' },
];

const combined = TD.computeLeaderboardRows(MATCHES);
check('combines every division\'s matches (A appears, from D1 only, with 2 games)', combined.rows.find(r => r.participantId === 'A').gp === 2);
check('BYE matches are excluded from the per-player rows', !combined.rows.some(r => r.participantId === 'BYE') && !combined.rows.some(r => r.participantId === 'E'));
check('unplayed/scheduled matches are excluded from the completed count (the completed BYE match still counts, same as the Stats tab\'s own completed-matches filter)', combined.totalMatches === 5);
check('sorted by win% first: A (2-0) ranks above C and D (1-1, tied with each other)', combined.rows[0].participantId === 'A');
check('within a win% tie, point differential breaks it: C (+10) ranks above D (-10), both 1-1', eq(combined.rows.map(r => r.participantId), ['A', 'C', 'D', 'B']));
check('avgScore and biggestBlowout match the Stats tab\'s own formulas', combined.biggestBlowout === 11 && typeof combined.avgScore === 'number');

const d1Only = TD.computeLeaderboardRows(MATCHES.filter(m => m.divisionId === 'D1'));
check('a single division\'s matches produce only that division\'s players', d1Only.rows.every(r => ['A', 'B', 'E'].includes(r.participantId)) && !d1Only.rows.some(r => r.participantId === 'C'));

const empty = TD.computeLeaderboardRows([]);
check('no matches -> empty rows, zeroed summary, no NaN', empty.rows.length === 0 && empty.totalMatches === 0 && empty.avgScore === 0 && empty.biggestBlowout === 0);

/* ================================================================
   Spotlight ticker callouts
   ================================================================ */
section('buildSpotlightCallouts -- built from the same completed-matches data as the leaderboard');

const callouts = TD.buildSpotlightCallouts({ matches: MATCHES, rows: combined.rows });
check('mentions the unbeaten player', callouts.some(c => /Team A is unbeaten in 2 games/.test(c)), JSON.stringify(callouts));
check('mentions who has played the most games', callouts.some(c => /has played the most games \(2\)/.test(c)));
check('mentions the biggest win with both team names and the margin', callouts.some(c => /Biggest win: Team C beat Team D by 11 points/.test(c)));
check('mentions a close/nail-biter match distinct from the biggest win', callouts.some(c => /Nail-biter/.test(c)));
check('mentions the current leaderboard leader', callouts.some(c => /Team A leads the board at 100% wins/.test(c)));

const noCallouts = TD.buildSpotlightCallouts({ matches: [], rows: [] });
check('no completed matches -> no callouts (page shows a neutral filler instead)', noCallouts.length === 0);

/* ================================================================
   Session-start timestamp: idempotent stamping decision
   ================================================================ */
section('computeSessionStampPayload -- stamped once, never overwritten');

const payload1 = TD.computeSessionStampPayload({}, 1700000000000);
check('no existing stamp -> returns a payload with the given clock time', eq(payload1, { startedAtMs: 1700000000000 }));

const payload2 = TD.computeSessionStampPayload({ displaySession: { startedAtMs: 123 } }, 999999999999);
check('an existing stamp -> returns null (idempotent: never overwrite)', payload2 === null);

const payload3 = TD.computeSessionStampPayload(null, 42);
check('a tournament doc with no displaySession field at all still stamps', eq(payload3, { startedAtMs: 42 }));

check('defaults to Date.now() when no clock is passed', typeof TD.computeSessionStampPayload({}).startedAtMs === 'number');

/* ================================================================
   Generic Auto/Manual rotator (featured-match panel + leaderboard switcher)
   ================================================================ */
section('createRotator -- Auto cycles; Manual pins and overrides; release resumes Auto');

const r = TD.createRotator(['combined', 'D1', 'D2']);
check('starts on the first item, in Auto', r.current() === 'combined' && !r.isManual());
r.advance();
check('advance() cycles forward', r.current() === 'D1');
r.advance();
check('advance() cycles forward again', r.current() === 'D2');
r.advance();
check('advance() wraps back to the start', r.current() === 'combined');

r.pin('D1');
check('pin() switches to Manual on the pinned item', r.current() === 'D1' && r.isManual());
r.advance();
check('advance() is a no-op while Manual', r.current() === 'D1');

r.release();
check('release() returns to Auto', !r.isManual());
check('release() resumes cycling from where Auto left off, not a reset to the start', r.current() === 'combined');
r.advance();
check('and Auto keeps advancing normally after release', r.current() === 'D1');

r.pin('D2');
r.setItems(['combined', 'D1']); // the pinned division no longer exists (e.g. re-rendered division list)
check('a pinned item that disappears from the item list falls back to Auto automatically', !r.isManual());

const featuredRotator = TD.createRotator([]);
check('an empty rotator (no live matches) has no current item and advance() is safe', featuredRotator.current() === null);
featuredRotator.setItems(['matchA']);
check('a single-item rotator stays on that item across advance() calls', featuredRotator.current() === 'matchA');
featuredRotator.advance();
check('single item: advance() keeps the same item (nothing else to cycle to)', featuredRotator.current() === 'matchA');
featuredRotator.setItems(['matchA', 'matchB']);
featuredRotator.advance();
check('a second live match appearing lets Auto cycle to it', featuredRotator.current() === 'matchB');

/* ================================================================
   Wiring: the new page exists and is linked from Tournament Admin
   (regex-over-HTML, same precedent as tests/queue-winner-pdf.test.js)
   ================================================================ */
section('wiring -- tournament-display.html exists and is reachable');

const displayPath = path.join(__dirname, '..', 'tournament-display.html');
check('tournament-display.html exists', fs.existsSync(displayPath));
const displayHtml = fs.existsSync(displayPath) ? fs.readFileSync(displayPath, 'utf8') : '';

check('resolves client/tournament id from the same ?client&t convention as tournament.html', /getParams\(\)/.test(displayHtml) && /p\.get\('client'\)/.test(displayHtml) && /p\.get\('t'\)/.test(displayHtml));
check('loads the pure-logic module', /<script src="tournament-display\.js">/.test(displayHtml));
check('reads matches/live/divisions live via onSnapshot, no polling', /collection\(`clients\/\$\{currentClientId\}\/tournaments\/\$\{CURRENT_TOURNAMENT_ID\}\/matches`\)\.onSnapshot/.test(displayHtml)
  && /\/live`\)\.onSnapshot/.test(displayHtml) && /\/divisions`\)[\s\S]{0,60}\.onSnapshot/.test(displayHtml));
check('writes the session-start stamp with set(..., {merge:true}), never overwriting an existing one', /maybeStampSessionStart/.test(displayHtml) && /computeSessionStampPayload/.test(displayHtml) && /\{ merge: true \}/.test(displayHtml));
check('requests a screen wake lock, best-effort (no throw on unsupported browsers)', /navigator\.wakeLock\.request/.test(displayHtml) && /'wakeLock' in navigator/.test(displayHtml));
check('offers a Fullscreen control, feature-detected', /requestFullscreen/.test(displayHtml));

const adminHtml = fs.readFileSync(path.join(__dirname, '..', 'tournament-admin.html'), 'utf8');
check('Tournament Admin links to the new venue display page', /id="displayPageLink"/.test(adminHtml) && /tournament-display\.html\?client=/.test(adminHtml));
check('the display link is shown/hidden alongside the existing public-page link (draft vs published)', /displayLink\.classList\.add\('hidden'\)/.test(adminHtml) && /displayLink\.classList\.remove\('hidden'\)/.test(adminHtml));

const archHtml = fs.readFileSync(path.join(__dirname, '..', 'ARCHITECTURE.md'), 'utf8');
check('ARCHITECTURE.md\'s runtime-pages table lists the new page', /tournament-display\.html/.test(archHtml));

console.log(`\n=== TOURNAMENT DISPLAY (venue screen): ${passed}/${passed + failed} passed ===`);
process.exit(failed === 0 ? 0 : 1);
