/* Find a Game: the end time on Create a Game, and linking a reservation by
   picking the booked session first, then entering its PIN. Helpers are
   extracted from the real page.  Usage: node tests/og-link.test.js */
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

const grab = (a, b) => { const i = html.indexOf(a), j = html.indexOf(b, i); if (i < 0 || j < 0) throw new Error('markers not found: ' + a.slice(0, 40)); return html.slice(i, j); };
const fmt = grab('function fmtTime(h){', '/* Short badge labels');
const timeFns = grab('// OG-TIME-START', '// OG-TIME-END');
const linkFns = grab('// OG-LINK-START', '// OG-LINK-END');
const api = new Function(`${fmt}\n${timeFns}\n${linkFns}\nreturn { fmtTime, to12Range, ogEndHours, ogTimeLabel, ogBookingCoversGame, ogMaskName, ogLinkableBookings, ogCheckLink };`)();

let passed = 0, failed = 0;
function check(name, ok, detail) { if (ok) passed++; else { failed++; console.log(`  FAIL: ${name}${detail ? ' -- ' + detail : ''}`); } }
const section = (t) => console.log(`\n${t}`);
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

section('end time choices');
check('from one hour after the start up to closing time', eq(api.ogEndHours(18, 22, 0), [19, 20, 21, 22]));
check('a game starting at the last hour can still end at closing', eq(api.ogEndHours(21, 22, 0), [22]));
check('a start at or after closing still gets one option (start + 1)', eq(api.ogEndHours(22, 22, 0), [23]) && eq(api.ogEndHours(23, 22, 0), [24]));
check('never past midnight', api.ogEndHours(23, 30, 0).every((e) => e <= 24));
check('the per-booking hour limit is respected when the facility has one', eq(api.ogEndHours(13, 22, 2), [14, 15]) && eq(api.ogEndHours(13, 22, 0), [14, 15, 16, 17, 18, 19, 20, 21, 22]) && eq(api.ogEndHours(21, 22, 3), [22]));
check('junk close/limit values do not break it', eq(api.ogEndHours(18, undefined, undefined), [19]) && eq(api.ogEndHours(18, '22', '0'), [19, 20, 21, 22]));

section('showing the time');
check('a game with an end time shows the range', api.ogTimeLabel({ startHour: 18, endHour: 20 }) === '6:00 PM – 8:00 PM');
check('an older game without one still shows its start', api.ogTimeLabel({ startHour: 18 }) === '6:00 PM' && api.ogTimeLabel({ startHour: 18, endHour: null }) === '6:00 PM');

section('which reservations fit the game');
const game = (o = {}) => ({ id: 'g1', date: '2026-10-10', startHour: 18, endHour: 20, ...o });
const bk = (o = {}) => ({ id: 'b1', name: 'Ana Maria Cruz', pin: '4321', court: 'c1', date: '2026-10-10', start: 18, end: 20, status: 'Reserved', group: '4 players', ...o });
check('a booking over the same hours covers the game', api.ogBookingCoversGame(bk(), game()));
check('overlapping any part counts', api.ogBookingCoversGame(bk({ start: 19, end: 21 }), game()) && api.ogBookingCoversGame(bk({ start: 16, end: 19 }), game()) && api.ogBookingCoversGame(bk({ start: 17, end: 22 }), game()));
check('back-to-back is not an overlap', !api.ogBookingCoversGame(bk({ start: 20, end: 21 }), game()) && !api.ogBookingCoversGame(bk({ start: 16, end: 18 }), game()));
check('an older game (no end) is treated as one hour', api.ogBookingCoversGame(bk({ start: 18, end: 19 }), game({ endHour: undefined })) && !api.ogBookingCoversGame(bk({ start: 19, end: 20 }), game({ endHour: undefined })));

section('the list of booked sessions');
const all = [
  bk({ id: 'late', start: 21, end: 22 }),
  bk({ id: 'fits2', court: 'c2', start: 19, end: 20 }),
  bk({ id: 'fits1', court: 'c1', start: 18, end: 19 }),
  bk({ id: 'pending', status: 'Pending' }),
  bk({ id: 'paid', status: 'Paid', court: 'c3' }),
  bk({ id: 'otherday', date: '2026-10-11' }),
  bk({ id: 'nopin', pin: '' }),
  bk({ id: 'openplay', status: 'OpenPlay' }),
  bk({ id: 'joined', source: 'openplay-join', status: 'Reserved' }),
];
const list = api.ogLinkableBookings(game(), all, []);
check('only confirmed (Reserved / Paid) sessions on that date', eq(list.map((r) => r.booking.id).sort(), ['fits1', 'fits2', 'late', 'paid'].sort()), list.map((r) => r.booking.id).join(','));
check('pending, other-day, PIN-less, open-play and open-play-join rows are not listed', !list.some((r) => ['pending', 'otherday', 'nopin', 'openplay', 'joined'].includes(r.booking.id)));
check('sessions that fit the game come first, then by start time and court', eq(list.map((r) => r.booking.id), ['fits1', 'paid', 'fits2', 'late']), list.map((r) => r.booking.id).join(','));
check('the fits/doesn\'t-fit flag is right', list.find((r) => r.booking.id === 'late').matches === false && list.find((r) => r.booking.id === 'fits2').matches === true);
const takenList = api.ogLinkableBookings(game(), all, [{ id: 'other', reservationId: 'fits1' }, { id: 'g1', reservationId: 'fits2' }]);
check('a session already linked to ANOTHER game is hidden (this game\'s own link is not)', !takenList.some((r) => r.booking.id === 'fits1') && takenList.some((r) => r.booking.id === 'fits2'));
check('an empty day gives an empty list', api.ogLinkableBookings(game({ date: '2030-01-01' }), all, []).length === 0 && api.ogLinkableBookings(game(), [], []).length === 0 && api.ogLinkableBookings(game(), null, null).length === 0);

section('names in the list');
check('first name and last initial only', api.ogMaskName('Ana Maria Cruz') === 'Ana C.' && api.ogMaskName('ana cruz') === 'ana C.' && api.ogMaskName('Ana') === 'Ana');
check('blank names become Guest', api.ogMaskName('') === 'Guest' && api.ogMaskName(null) === 'Guest' && api.ogMaskName('   ') === 'Guest');

section('picking a session, then the PIN');
const ok = api.ogCheckLink(game(), all, [], 'fits1', '4321');
check('right session + right PIN -> linked to that booking', ok.ok && ok.booking.id === 'fits1');
check('a PIN typed with spaces is accepted', api.ogCheckLink(game(), all, [], 'fits1', ' 4321 ').ok);
check('wrong PIN is refused, and it says so', /doesn't match/.test(api.ogCheckLink(game(), all, [], 'fits1', '0000').error || ''));
check('an empty PIN is refused', !api.ogCheckLink(game(), all, [], 'fits1', '').ok && !api.ogCheckLink(game(), all, [], 'fits1', undefined).ok);
const other = [bk({ id: 'x', pin: '1111' }), bk({ id: 'y', pin: '2222', court: 'c2' })];
check("another session's PIN does not work for the one you picked", !api.ogCheckLink(game(), other, [], 'x', '2222').ok && api.ogCheckLink(game(), other, [], 'x', '1111').ok);
check('a session at a different time cannot be linked, even with its PIN', /different time/.test(api.ogCheckLink(game(), all, [], 'late', '4321').error || ''));
check('a session that is pending, on another day, or gone cannot be linked', ['pending', 'otherday', 'nopin', 'ghost'].every((id) => /no longer available/.test(api.ogCheckLink(game(), all, [], id, '4321').error || '')));
check('a session already linked to another game cannot be linked again', /no longer available/.test(api.ogCheckLink(game(), all, [{ id: 'other', reservationId: 'fits1' }], 'fits1', '4321').error || ''));
check('a numeric PIN stored as a number still matches', api.ogCheckLink(game(), [bk({ pin: 4321 })], [], 'b1', '4321').ok);

section('wiring in the page');
check('Create a Game has both start and end time fields', /id="ogStart"/.test(html) && /id="ogEnd"/.test(html) && />End Time</.test(html));
check('the end list follows the start', /ogRefreshEndOptions/.test(html) && /getElementById\('ogStart'\)\?\.addEventListener\('change', ogRefreshEndOptions\)/.test(html));
check('the game is saved with endHour and validated (end after start)', /date, startHour, endHour, skillLevel/.test(html) && /The end time must be after the start time/.test(html));
check('the time range is shown everywhere via one helper', (html.match(/ogTimeLabel\(/g) || []).length >= 8);
const outsideHelper = html.replace(timeFns, '');
check('no game list, banner or detail shows the start time alone any more', !/fmtTime\((first|match|g)\.startHour\)/.test(outsideHelper) && !/\$\{fmtTime\(game\.startHour\)\}/.test(outsideHelper));
check('the old PIN-only form is gone; PIN comes after choosing a session', !/ogLinkPin[^]*Reservation PIN/.test(html) && /data-og-link-pick/.test(html) && /step: 'pin'/.test(html) && /ogLinkReservation\(game\.id, mine\.token, st\(\)\.bookingId/.test(html));
check('the picker is only for the organizer', /if\(isCreator && mine\) ogWireLink\(game, mine\)/.test(html) && /else if\(isCreator && status !== 'CANCELLED' && status !== 'EXPIRED'\)\{\s*reservationHtml = ogLinkPanelHtml\(game\)/.test(html));
check('booker names/PINs are escaped, and the PIN field is masked', /escapeHtml\(ogMaskName\(/.test(html) && /type="password" inputmode="numeric"/.test(html));

console.log(`\n=== FIND A GAME TIME + LINK: ${passed}/${passed + failed} passed ===`);
process.exit(failed === 0 ? 0 : 1);
