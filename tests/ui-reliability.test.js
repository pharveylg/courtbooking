/* Phase 1+2 UI-state reliability fixes in index.html -- wiring checks
   (source-level regex, same convention as tests/theme-tokens.test.js and
   tests/queue-standalone.test.js) for the pieces that aren't pure functions
   on their own (DOM/timer wiring). The pure PIN-gate state machine itself is
   covered functionally in tests/pin-gate.test.js.

   Usage: node tests/ui-reliability.test.js */
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

let passed = 0, failed = 0;
function check(name, ok, detail) { if (ok) passed++; else { failed++; console.log(`  FAIL: ${name}${detail ? ' -- ' + detail : ''}`); } }
const section = (t) => console.log(`\n${t}`);

section('Load-screen timeout -- a stuck initializeApp() gets a visible fallback, not an eternal spinner');

check('loading screen gets a "taking longer than expected" message + Retry button, not a replacement UI', /id="loadingTimeoutMsg"/.test(html) && /id="loadingTimeoutRetryBtn"/.test(html) && /Taking longer than expected/.test(html));
check('a 10s client-side timeout is armed before initializeApp() runs', /const LOAD_TIMEOUT_MS = 10000;/.test(html) && /armLoadTimeout\(\);\s*\n\s*initializeApp\(\);/.test(html));
check('the timeout is disarmed the moment the load actually succeeds, before any early return (bookingPaused, etc)', /disarmLoadTimeout\(\);\s*\n\s*const loadingScreen = document\.getElementById\('loadingScreen'\);/.test(html));
check('retry is the simplest correct one -- reload the page', /loadingTimeoutRetryBtn.*location\.reload\(\)/.test(html.replace(/\s+/g, ' ')));

section('Core onSnapshot listeners -- failures are no longer invisible console.warn-only');

const coreListenerNames = ['bookings', 'openPlay', 'staffReserve', 'pricing', 'courtHours', 'settings', 'queues', 'courts'];
for (const name of coreListenerNames) {
  check(`${name} listener's error callback feeds setListenerError (visible), not just console.warn`, new RegExp(`e => setListenerError\\('${name}', e\\)`).test(html));
  check(`${name} listener's success handler clears any prior error via clearListenerError`, new RegExp(`clearListenerError\\('${name}'\\)`).test(html));
}
check('never a blocking alert() for a listener failure', !/function setListenerError[\s\S]{0,400}alert\(/.test(html));
check('classifies offline vs permission-denied vs unknown rather than one generic string', /_classifyFirestoreError/.test(html) && /permission-denied/.test(html) && /'unavailable'/.test(html));
check('the sync-error banner respects the plain offline case already covered by pwa-offline-bar', /if \(!navigator\.onLine \|\| window\._listenerErrors\.size === 0\)/.test(html));

section('Offline banner copy -- no longer claims a sync mechanism that does not exist');

check('no remaining "changes will sync when reconnected" claim anywhere in the page', !/changes will sync when reconnected/.test(html));
check('both the initial markup and the post-"back online" reset use the corrected, honest copy', (html.match(/booking actions won\\?'t work until you\\?'re back online/g) || []).length >= 2);

section('Booking PIN gates -- attempt tracking + cooldown instead of an infinite bare alert() loop');

check('loads the pure PinGate state machine', /<script src="pin-gate\.js">/.test(html));
check('the pay-pending PIN prompt is gated through tryBookingPinGate/reportBookingPinResult', /tryBookingPinGate\('pay_' \+ bkId\)/.test(html) && /reportBookingPinResult\('pay_' \+ bkId, correct\)/.test(html));
check('the cancel-booking PIN prompt is gated through tryBookingPinGate/reportBookingPinResult', /tryBookingPinGate\('cancel_' \+ bkId\)/.test(html) && /reportBookingPinResult\('cancel_' \+ bkId, correct\)/.test(html));
check('no bare, ungated "alert(\'Incorrect Booking PIN!\');" statement left (only the gated wording inside reportBookingPinResult)', !/alert\('Incorrect Booking PIN!'\);/.test(html));
check('each booking+action gets its own independent attempt record (keyed, not global)', /_bookingPinRecords\.get\(key\)/.test(html) && /'pay_' \+ bkId/.test(html) && /'cancel_' \+ bkId/.test(html));

console.log(`\n=== UI RELIABILITY (index.html wiring): ${passed}/${passed + failed} passed ===`);
process.exit(failed === 0 ? 0 : 1);
