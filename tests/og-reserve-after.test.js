/* Find a Game: reserving a court AFTER a game already exists without one --
   previously the only option was "Link a reservation" (an already-confirmed
   booking made elsewhere); this adds "Reserve this court" as a real second
   path, sharing the same booking-builder as reserve-at-creation. Usage:
   node tests/og-reserve-after.test.js */
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

const grab = (a, b) => { const i = html.indexOf(a), j = html.indexOf(b, i); if (i < 0 || j < 0) throw new Error('markers not found: ' + a.slice(0, 60)); return html.slice(i, j); };

let passed = 0, failed = 0;
function check(name, ok, detail) { if (ok) passed++; else { failed++; console.log(`  FAIL: ${name}${detail ? ' -- ' + detail : ''}`); } }
const section = (t) => console.log(`\n${t}`);

section('the initial "not yet linked" panel offers both paths, not just Link');
const panel = grab('function ogLinkPanelHtml(game){', 'function ogWireLink(game, mine){');
check('a "Reserve this court" button sits alongside "Link existing" when nothing is linked yet', /id="ogReserveStart"[^]*?Reserve this court/.test(panel) && /id="ogLinkStart"[^]*?Link existing/.test(panel));
check('both are real buttons in the same choice, not one replacing the other', /<div class="flex gap-2">\s*<button type="button" id="ogReserveStart"[^]*?<button type="button" id="ogLinkStart"/.test(panel));

section('the reserve form (new "reserve" step)');
check('shows the game\'s own date/time (the slot being reserved, not editable from here)', /st\.step === 'reserve'\)\{[^]*?fmtDateLabel\(game\.date\)[^]*?ogTimeLabel\(game\)/.test(panel));
check('offers a court picker only when the facility has more than one court', /courts\.length > 1 \? `<label[^]*?ogReserveCourtSel/.test(panel));
check('the organizer sets their own PIN here (no separate ownership proof needed -- it\'s their own fresh reservation)', /id="ogReservePin2" placeholder="Set a 4-digit PIN"/.test(panel));
check('has its own Cancel back to the two-button choice', /id="ogLinkCancel" class="mt-2 mono text-\[11px\] font-\[700\] underline cursor-pointer">Cancel<\/button>/.test(panel));

section('wiring: ogReserveStart opens the reserve step; submit validates and calls the shared reserve function');
const wire = grab('function ogWireLink(game, mine){', 'function ogCanKeepScore(game, status, canScore, nowMs){');
check('clicking "Reserve this court" opens the reserve step, focused on the PIN', /ogReserveStart'\)\?\.addEventListener\('click', \(\) => \{ _ogLink = \{ gameId: game\.id, step: 'reserve'/.test(wire) && /ogReservePin2'\)\?\.focus\(\)/.test(wire));
check('a PIN under 4 digits or non-numeric is rejected before calling Firestore', /if\(!pin \|\| pin\.length < 4 \|\| isNaN\(pin\)\)\{ st\(\)\.error = 'Enter a 4-digit PIN\.'; rerender\(\); return; \}/.test(wire));
check('the chosen court (or "no preference") is read from the picker when present, else falls back to the game\'s own court', /const preferredCourt = courtSel \? \(courtSel\.value \|\| null\) : \(game\.court \|\| null\);/.test(wire));
check('submit calls the shared ogReserveCourtForGame with the organizer\'s token', /ogReserveCourtForGame\(game\.id, mine\.token, preferredCourt, pin\)/.test(wire));
check('on success: modal closes, a toast confirms, and it goes straight to Payment -- same ending as reserving at creation', /document\.getElementById\('ogDetailModal'\)\.classList\.add\('hidden'\);\s*toast\('Reservation held! Now let.s pay for the court\.'\);\s*routeTo\('payment'\);/.test(wire));
check('a failure (e.g. slot taken) shows the error inline instead of navigating away', /else \{ st\(\)\.error = result\.error; rerender\(\); \}/.test(wire));

section('ogReserveCourtForGame (the core function) -- reuses ogAvailableCourt and the shared booking builder, doesn\'t duplicate them');
const core = grab('async function ogReserveCourtForGame(gameId, token, preferredCourt, pin){', 'async function ogLinkReservation(gameId, token, bookingId, pin){');
check('only the organizer (matching creatorToken) can reserve', /game\.creatorToken !== token\) return \{ ok:false, error:'Only the organizer can reserve a court\.' \}/.test(core));
check('refuses to double-reserve a game that already has a reservation', /if\(game\.reservationId\) return \{ ok:false, error:'This game is already linked to a reservation\.' \}/.test(core));
check('availability is checked with the real, shared hasOverlap-backed helper against the GAME\'s own date/time', /ogAvailableCourt\(game\.date, game\.startHour, game\.endHour, preferredCourt\)/.test(core));
check('a taken preferred court and "nothing at all available" get distinct, honest messages (no schedule-editing offered, since none exists)', /pick a different court, or leave "No preference"/.test(core) && /No court is available for this time\.'/.test(core));
check('the booking comes from the SAME builder reserve-at-creation uses -- one place, not two copies', /ogNewReservationBooking\(gameId, game\.creatorName, game\.creatorEmail, courtId, game\.date, game\.startHour, game\.endHour, pin\)/.test(core));
check('the game doc is updated with reservationId/court/status the same way ogLinkReservation does', /await ref\.update\(\{ reservationId: booking\.id, court: courtId, status: 'RESERVED', updatedAt: firebase\.firestore\.FieldValue\.serverTimestamp\(\) \}\);/.test(core));
check('the booking is persisted, tracked (My Matches), and gets the same linked-queue auto-creation as every other reservation path', /bookings\.unshift\(booking\);\s*saveBookings\(bookings\);\s*MyActive\.add\(\{ clientId: currentClientId, kind: 'booking', refId: booking\.id \}\);\s*ogEnsureLinkedQueue\(\{ \.\.\.game, court: courtId \}, booking\);/.test(core));
check('it hands off to Payment exactly like the create-time path (PAY_CTX + _currentProofBookingId), so "Reservation Pending -> Confirmed" and the 1-hour expiry work here for free', /_currentProofBookingId = booking\.id;\s*PAY_CTX = \{ bookingId: booking\.id, proofSent: false \};/.test(core));
check('a Firestore failure is reported, not thrown uncaught', /catch\(ex\)\{ return \{ ok:false, error: 'Failed to reserve: ' \+ ex\.message \}; \}/.test(core));

section('the shared builder used by both reserve-at-creation and reserve-after-the-fact');
check('ogNewReservationBooking exists once and both call sites use it (grep count, not just presence)', (html.match(/ogNewReservationBooking\(/g) || []).length === 3); // 1 definition + create-flow call + ogReserveCourtForGame call

console.log(`\n=== FIND A GAME: RESERVE A COURT AFTER CREATION: ${passed}/${passed + failed} passed ===`);
process.exit(failed === 0 ? 0 : 1);
