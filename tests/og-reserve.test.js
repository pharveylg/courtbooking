/* Find a Game: "Also reserve the court for this time" on Create a Game --
   checks real-time availability (reusing the real hasOverlap()) and blocks
   the organizer from continuing/submitting when the slot is taken, instead
   prompting them to change the schedule. Usage: node tests/og-reserve.test.js */
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

const grab = (a, b) => { const i = html.indexOf(a), j = html.indexOf(b, i); if (i < 0 || j < 0) throw new Error('markers not found: ' + a.slice(0, 40)); return html.slice(i, j); };
const activeCourtsSrc = 'function getActiveCourts(){ return COURTS.filter(c => c.active !== false); }';
const overlapChain = grab('function getTemplateHours(courtId, dow){', '/* ---------- Court Tab Rendering ---------- */');
const reserveSrc = grab('// OG-RESERVE-START', '// OG-RESERVE-END');
const build = new Function('COURTS', 'bookings', 'openPlays', 'staffReserveEnabled',
  `${activeCourtsSrc}\n${overlapChain}\n${reserveSrc}\nreturn { hasOverlap, ogAvailableCourt, getActiveCourts };`);

let passed = 0, failed = 0;
function check(name, ok, detail) { if (ok) passed++; else { failed++; console.log(`  FAIL: ${name}${detail ? ' -- ' + detail : ''}`); } }
const section = (t) => console.log(`\n${t}`);

const COURTS = [{ id: 'c1', name: 'Court 1', active: true }, { id: 'c2', name: 'Court 2', active: true }, { id: 'c3', name: 'Court 3', active: false }];
const bk = (o = {}) => ({ id: 'b1', name: 'Ana', pin: '1234', court: 'c1', date: '2026-10-10', start: 18, end: 19, status: 'Reserved', ...o });

section('hasOverlap (the real, shared conflict check -- first coverage of it)');
{
  const api = build(COURTS, [bk()], [], {});
  check('free slot -> no overlap', api.hasOverlap('2026-10-10', 20, 21, null, 'c1') === null);
  check('overlapping booking on the same court is flagged', api.hasOverlap('2026-10-10', 18, 19, null, 'c1')?.type === 'booking');
  check('a booking on a different court does not block this one', api.hasOverlap('2026-10-10', 18, 19, null, 'c2') === null);
  const opApi = build(COURTS, [], [{ id: 'op1', date: '2026-10-10', start: 9, end: 10, court: 'c1' }], {});
  check('open play block is flagged', opApi.hasOverlap('2026-10-10', 9, 10, null, 'c1')?.type === 'openplay');
  const staff = { template: { c1: { [String(new Date('2026-10-10T12:00:00').getDay())]: { '18': true } } } };
  const staffApi = build(COURTS, [], [], staff);
  check('staff-reserved hour is flagged', staffApi.hasOverlap('2026-10-10', 18, 19, null, 'c1')?.type === 'staff');
}

section('ogAvailableCourt -- resolving a free court for a date/time');
{
  const emptyApi = build(COURTS, [], [], {});
  check('no preference, nothing booked -> first active court', emptyApi.ogAvailableCourt('2026-10-10', 18, 19, null) === 'c1');
  check('a specific free court is returned as-is', emptyApi.ogAvailableCourt('2026-10-10', 18, 19, 'c2') === 'c2');

  const oneBookedApi = build(COURTS, [bk({ court: 'c1' })], [], {});
  check('preferred court is taken -> null (no silent switch)', oneBookedApi.ogAvailableCourt('2026-10-10', 18, 19, 'c1') === null);
  check('no preference falls through to the next free active court', oneBookedApi.ogAvailableCourt('2026-10-10', 18, 19, null) === 'c2');

  const bothBookedApi = build(COURTS, [bk({ id: 'b1', court: 'c1' }), bk({ id: 'b2', court: 'c2' })], [], {});
  check('every active court taken -> null', bothBookedApi.ogAvailableCourt('2026-10-10', 18, 19, null) === null);
  check('the inactive court is never offered as a fallback', !getFallbackCourts(bothBookedApi));
  function getFallbackCourts(a){ return a.ogAvailableCourt('2026-10-10', 18, 19, null) === 'c3'; }

  const staff = { template: { c1: { [String(new Date('2026-10-10T12:00:00').getDay())]: { '18': true } } } };
  const staffBlockedApi = build(COURTS, [], [], staff);
  check('a staff-blocked court is not offered even with no preference', staffBlockedApi.ogAvailableCourt('2026-10-10', 18, 19, null) === 'c2');

  check('a court freed up by a different date is available again', oneBookedApi.ogAvailableCourt('2026-10-11', 18, 19, 'c1') === 'c1');
  check('a court freed up outside the booked hours is available again', oneBookedApi.ogAvailableCourt('2026-10-10', 19, 20, 'c1') === 'c1');
}

section('wiring: the checkbox, PIN field and their toggle');
check('Step 1 has the reserve checkbox and a hidden PIN field', /id="ogReserveCourt"/.test(html) && /id="ogReserveFields" class="hidden"/.test(html) && /id="ogReservePin"/.test(html));
check('checking it reveals the PIN field', /ogReserveCourt'\)\?\.addEventListener\('change', \(e\) => \{\s*document\.getElementById\('ogReserveFields'\)\.classList\.toggle\('hidden', !e\.target\.checked\);/.test(html));
check('the form reset clears it back to unchecked/hidden/empty', /ogReserveCourt'\)\.checked = false;\s*document\.getElementById\('ogReserveFields'\)\.classList\.add\('hidden'\);\s*document\.getElementById\('ogReservePin'\)\.value = '';/.test(html));

section('wiring: blocked at Step 1 before the organizer can continue');
const stepNext = grab("document.getElementById('ogStepNext')?.addEventListener('click', () => {", "document.getElementById('ogStepBack')");
check('Step 1 Continue calls ogAvailableCourt when the box is checked', /ogReserveCourt'\)\.checked\)\{[^]*?ogAvailableCourt\(date, start, end, preferredCourt\)/.test(stepNext));
check('a conflict shows an error and does not advance (no ogGoStep call on that path)', /if\(!ogAvailableCourt\(date, start, end, preferredCourt\)\)\{\s*errEl\.textContent = [^;]+;\s*errEl\.classList\.remove\('hidden'\);\s*return;\s*\}/.test(stepNext));
check('the prompt tells the user to change the schedule', /pick a different date, time, or court/.test(stepNext) && /pick a different date or time/.test(stepNext));

section('wiring: re-validated at final submit, then booked with the game');
const submitHandler = grab("document.getElementById('ogCreateForm')?.addEventListener('submit', async (e) => {", "async function ogJoinGame");
check('the PIN is required and format-checked before anything else', /reservePin\.length < 4 \|\| isNaN\(reservePin\)/.test(submitHandler));
check('availability is re-checked at submit time (not just trusted from Step 1)', /reservedCourtId = ogAvailableCourt\(date, startHour, endHour, court\)/.test(submitHandler));
check('a conflict at submit time sends the organizer back to Step 1', /if\(!reservedCourtId\)\{[^]*?ogGoStep\(1\);\s*return;/.test(submitHandler));
check('a real booking record is created alongside the game, starting Pending like any other reservation', /newBooking = \{[^]*?status: 'Pending',/.test(submitHandler));
check('the game is created already linked to it (no separate link step needed)', /reservationId: newBooking \? newBooking\.id : null/.test(submitHandler) && /status: newBooking \? 'RESERVED'/.test(submitHandler));
check('the booking is persisted and the existing linked-queue machinery is reused, not duplicated', /bookings\.unshift\(newBooking\);\s*saveBookings\(bookings\);\s*ogEnsureLinkedQueue\(\{ \.\.\.game, id: ref\.id \}, newBooking\);/.test(submitHandler));
check('when not reserving, behavior is unchanged (OPEN/FULL from player count, no booking)', /players\.length >= playersNeeded \? 'FULL' : 'OPEN'/.test(submitHandler));

section('wiring: the organizer is sent to pay, not left to remember later');
check('a reserved game routes straight into the real payment flow (PAY_CTX + routeTo)', /if\(newBooking\)\{[^]*?_currentProofBookingId = newBooking\.id;\s*PAY_CTX = \{ bookingId: newBooking\.id, proofSent: false \};\s*routeTo\('payment'\);/.test(submitHandler));
check('a non-reserved game still shows the normal "game is up" confirmation', /\} else \{\s*ogShowDone\(\{ title: 'Your game is up'/.test(submitHandler));
check('renderPayContext (the real payment screen) shows Pending-payment copy for any booking with that status, ours included', /Reservation held · Pending payment/.test(html));
check('admin confirmation of payment is the same existing toggle (setBookingStatus), not something new', /function setBookingStatus\(bookingId, newStatus\)/.test(html));

console.log(`\n=== FIND A GAME: RESERVE A COURT ON CREATE: ${passed}/${passed + failed} passed ===`);
process.exit(failed === 0 ? 0 : 1);
