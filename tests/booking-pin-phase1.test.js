/* Booking PIN security fix, Phase 1 -- regression checks (source-level, same
   convention as tests/ui-reliability.test.js) in index.html:
   - Pay Now and cancel compare only against the booking's own PIN (bk.pin),
     with no getPin() or '1234' fallback, and refuse when no PIN is stored.
   - The new-booking PIN default is empty, not '1234'.
   - Open-play joins generate and store a per-booking PIN.
   - Staff can reset a booking PIN from the admin bookings list.

   Usage: node tests/booking-pin-phase1.test.js */
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

let passed = 0, failed = 0;
function check(name, ok, detail) { if (ok) passed++; else { failed++; console.log(`  FAIL: ${name}${detail ? ' -- ' + detail : ''}`); } }
const section = (t) => console.log(`\n${t}`);

/* Slice out the Pay Now and cancel click-handler bodies. */
const payStart = html.indexOf("container.querySelectorAll('.pay-pending-btn')");
const cancelStart = html.indexOf("container.querySelectorAll('.cancel-booking-btn')");
const cancelEnd = html.indexOf('/* ---------- Selected-date slot availability', cancelStart);
const payBody = payStart >= 0 && cancelStart > payStart ? html.slice(payStart, cancelStart) : '';
const cancelBody = cancelStart >= 0 && cancelEnd > cancelStart ? html.slice(cancelStart, cancelEnd) : '';

section('Pay Now and cancel -- only the booking\'s own PIN is accepted');

check('pay handler block was located', payBody.length > 0);
check('cancel handler block was located', cancelBody.length > 0);
check('pay handler body contains no \'1234\' fallback', payBody.length > 0 && !/'1234'/.test(payBody));
check('cancel handler body contains no \'1234\' fallback', cancelBody.length > 0 && !/'1234'/.test(cancelBody));
check('pay handler body does not call getPin()', payBody.length > 0 && !/getPin\(/.test(payBody));
check('cancel handler body does not call getPin()', cancelBody.length > 0 && !/getPin\(/.test(cancelBody));
check('pay handler compares the typed PIN against bk.pin', /const correct = String\(inputPin\)\.trim\(\) === String\(bk\.pin\)\.trim\(\);/.test(payBody));
check('cancel handler compares the typed PIN against bk.pin', /const correct = String\(inputPin\)\.trim\(\) === String\(bk\.pin\)\.trim\(\);/.test(cancelBody));
check('pay handler refuses when the booking has no stored PIN (before the gate)', /if\(!bk\.pin\)\{[^}]*\}\s*\n\s*if\(!tryBookingPinGate\('pay_' \+ bkId\)\)/.test(payBody));
check('cancel handler refuses when the booking has no stored PIN (before the gate)', /if\(!bk\.pin\)\{[^}]*\}\s*\n\s*if\(!tryBookingPinGate\('cancel_' \+ bkId\)\)/.test(cancelBody));
check('pay and cancel still go through tryBookingPinGate / reportBookingPinResult', /tryBookingPinGate\('pay_' \+ bkId\)/.test(payBody) && /reportBookingPinResult\('pay_' \+ bkId, correct\)/.test(payBody) && /tryBookingPinGate\('cancel_' \+ bkId\)/.test(cancelBody) && /reportBookingPinResult\('cancel_' \+ bkId, correct\)/.test(cancelBody));

section('New-booking PIN default -- empty, not \'1234\'');

check('booking form PIN default is an empty string', /const pin = pinInput \? pinInput\.value\.trim\(\) : '';/.test(html));
check('no \'1234\' default left on the booking form PIN read', !/pinInput\.value\.trim\(\) : '1234'/.test(html));
check('the existing required-PIN check still rejects an empty PIN', /if\(!pin \|\| pin\.length < 4 \|\| isNaN\(pin\)\) \{ showFormError\('Please enter a 4-digit Booking PIN\.'\); return; \}/.test(html));

section('Open-play joins -- per-booking PIN generated and stored at join time');

check('generateBookingPin() is defined', /function generateBookingPin\(\)\{/.test(html));
check('generateBookingPin() returns a 4-digit string (1000-9999)', /return String\(1000 \+ \(n % 9000\)\);/.test(html));
check('the open-play join booking record stores pin: generateBookingPin()', /linkedOpenGameId: gameId, amountDue, createdAt: Date\.now\(\),\s*\n\s*pin: generateBookingPin\(\)/.test(html));

section('Staff reset -- admin bookings list can regenerate a booking PIN');

check('admin bookings rows render a Reset PIN button for non-open-play bookings', /data-reset-pin="\$\{b\.id\}"/.test(html) && /b\.status!=='OpenPlay' \?/.test(html));
check('reset handler is bound and gated on adminUnlocked', /button\[data-reset-pin\]/.test(html) && /if\(!adminUnlocked\) return;/.test(html));
check('reset handler stores a new PIN via generateBookingPin() and saves bookings', /b\.pin = generateBookingPin\(\);\s*\n\s*saveBookings\(bookings\);/.test(html));

console.log(`\n=== BOOKING PIN PHASE 1 (index.html wiring): ${passed}/${passed + failed} passed ===`);
process.exit(failed === 0 ? 0 : 1);
