/* Phase 2 item 6: raw-error-to-user leaks replaced with a friendly message +
   retry affordance (court-scoreboard.js's finish() is the app's template).
   Source-level wiring checks for the sites that aren't pure functions on
   their own -- store.html's friendlyTxError() IS a small pure helper and
   gets a couple of direct checks too.

   Usage: node tests/friendly-error-messages.test.js */
const fs = require('fs');
const path = require('path');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

let passed = 0, failed = 0;
function check(name, ok, detail) { if (ok) passed++; else { failed++; console.log(`  FAIL: ${name}${detail ? ' -- ' + detail : ''}`); } }
const section = (t) => console.log(`\n${t}`);

section('tournament.html -- gate-screen load failure is friendly, with a Retry button, not raw ex.message');
const tournament = read('tournament.html');
check('no more "Failed to load: ${escapeHtml(ex.message)}" leak', !/Failed to load: \$\{escapeHtml\(ex\.message\)\}/.test(tournament));
check('shows showLoadFailed() with a Retry button that reloads the page', /function showLoadFailed\(\)/.test(tournament) && /gateRetryBtn/.test(tournament) && /location\.reload\(\)/.test(tournament));

section('tournament-display.html -- same fix, same template');
const display = read('tournament-display.html');
check('no more "Failed to load: ${escapeHtml(ex.message)}" leak', !/Failed to load: \$\{escapeHtml\(ex\.message\)\}/.test(display));
check('shows showLoadFailed() with a Retry button that reloads the page', /function showLoadFailed\(\)/.test(display) && /gateRetryBtn/.test(display) && /location\.reload\(\)/.test(display));

section('gallery.html -- upload failures never show raw ex.message, and the batch keeps going');
const gallery = read('gallery.html');
check('no more "Failed on photo ${n}: ${ex.message}" leak', !/Failed on photo \$\{uploaded \+ 1\}: \$\{ex\.message\}/.test(gallery));
check('loads the pure GalleryUploadBatch module', /<script src="gallery-upload-batch\.js">/.test(gallery));
check('the per-photo catch never breaks the whole batch (continues; only a hardStop result does)', /catch\(ex\) \{\s*console\.warn\('\[Gallery\] upload failed for a photo:', ex && ex\.message\);\s*return \{ ok: false, hardStop: false \};/.test(gallery));

section('store.html -- no more native alert() + raw ex.message; toast() + a friendly/retryable message');
const store = read('store.html');
check('none of the 4 original alert(...ex.message) sites remain', !/alert\('Sale failed: ' \+ ex\.message\)/.test(store) && !/alert\('Failed: ' \+ ex\.message\)/.test(store) && !/alert\('Void failed: ' \+ ex\.message\)/.test(store));
check('completeSale/receiveStock/adjustStock/voidSale all now toast() via friendlyTxError()', (store.match(/toast\(friendlyTxError\(ex, /g) || []).length === 4);
check('friendlyTxError distinguishes our own thrown validation Error (no .code, safe to show) from a raw Firebase/network error (has .code -> friendly fallback)', /function friendlyTxError\(ex, fallback\)\{\s*return \(ex && !ex\.code && ex\.message\) \? ex\.message : fallback;/.test(store));
check('the triggering action stays retryable -- completeSale re-enables its button in a finally{}', /\} finally \{ btn\.disabled = false; \}/.test(store));

console.log(`\n=== FRIENDLY ERROR MESSAGES (Phase 2 item 6): ${passed}/${passed + failed} passed ===`);
process.exit(failed === 0 ? 0 : 1);
