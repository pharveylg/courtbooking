/* GalleryUploadBatch -- the partial-failure-aware photo upload batching used
   by gallery.html. That flow used to stop on the very first failed photo and
   show the raw ex.message; this module is the pure fold/summarize logic
   behind the fix (keep attempting remaining photos, only a true hard-stop
   condition ends the batch early, friendly summary + scoped retry). No
   DOM/network, so it's require()-able here, same convention as
   next-open.js/queue-engine.js.

   Usage: node tests/gallery-upload-batch.test.js */
const path = require('path');
const GUB = require(path.join(__dirname, '..', 'gallery-upload-batch.js'));

let passed = 0, failed = 0;
function check(name, ok, detail) { if (ok) passed++; else { failed++; console.log(`  FAIL: ${name}${detail ? ' -- ' + detail : ''}`); } }
const section = (t) => console.log(`\n${t}`);
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const OK = { ok: true };
const FAIL = { ok: false, hardStop: false };
const hardStop = (message) => ({ ok: false, hardStop: true, message });

/* ================================================================
   foldOutcome -- one outcome at a time
   ================================================================ */
section('foldOutcome -- success increments uploaded, failure sets the file aside, hard-stop ends it');

let s = GUB.initialState();
check('starts at zero, nothing failed, not stopped', eq(s, { uploaded: 0, failed: [], hardStopMessage: null, stopped: false }));

s = GUB.foldOutcome(s, OK, 'photo1.jpg');
check('a success increments uploaded', s.uploaded === 1 && s.failed.length === 0);

s = GUB.foldOutcome(s, FAIL, 'photo2.jpg');
check('a per-photo failure is set aside, NOT a stop -- the batch keeps going', s.uploaded === 1 && eq(s.failed, ['photo2.jpg']) && s.stopped === false);

s = GUB.foldOutcome(s, OK, 'photo3.jpg');
check('the batch resumed after the failure and kept uploading', s.uploaded === 2 && eq(s.failed, ['photo2.jpg']));

s = GUB.foldOutcome(s, hardStop('Upload limit reached for this link.'), 'photo4.jpg');
check('a hard-stop records its message and marks the batch stopped', s.hardStopMessage === 'Upload limit reached for this link.' && s.stopped === true);
check('a hard-stop does NOT add the triggering file to `failed` (there is nothing to retry individually)', eq(s.failed, ['photo2.jpg']));

const afterStop = GUB.foldOutcome(s, OK, 'photo5.jpg');
check('once stopped, further outcomes are ignored (mirrors the real loop\'s `break`)', eq(afterStop, s));

/* ================================================================
   reduceOutcomes -- a whole sequence at once
   ================================================================ */
section('reduceOutcomes -- folds a full sequence, stopping at the first hard-stop');

const allOk = GUB.reduceOutcomes([
  { file: 'a.jpg', outcome: OK },
  { file: 'b.jpg', outcome: OK },
  { file: 'c.jpg', outcome: OK },
]);
check('every photo succeeds -> 3 uploaded, none failed', allOk.uploaded === 3 && allOk.failed.length === 0 && !allOk.stopped);

const mixed = GUB.reduceOutcomes([
  { file: 'a.jpg', outcome: OK },
  { file: 'b.jpg', outcome: FAIL },
  { file: 'c.jpg', outcome: OK },
  { file: 'd.jpg', outcome: FAIL },
  { file: 'e.jpg', outcome: OK },
]);
check('"3 of 5 uploaded -- 2 failed" case: continues past every failure', mixed.uploaded === 3 && eq(mixed.failed, ['b.jpg', 'd.jpg']));

const stoppedEarly = GUB.reduceOutcomes([
  { file: 'a.jpg', outcome: OK },
  { file: 'b.jpg', outcome: FAIL },
  { file: 'c.jpg', outcome: hardStop('This link has been revoked since you started uploading.') },
  { file: 'd.jpg', outcome: OK }, // never reached
]);
check('stops folding at the hard-stop -- "d.jpg" is never counted', stoppedEarly.uploaded === 1 && eq(stoppedEarly.failed, ['b.jpg']) && stoppedEarly.stopped === true);
check('carries the hard-stop message through', stoppedEarly.hardStopMessage === 'This link has been revoked since you started uploading.');

/* ================================================================
   summarize -- the user-facing text, never raw error text
   ================================================================ */
section('summarize -- friendly text + retry affordance, matching the finish() template');

const okSummary = GUB.summarize({ uploaded: 5, failed: [], hardStopMessage: null, stopped: false }, 5);
check('all succeeded -> "allOk" with a plain count, no retry button', okSummary.kind === 'allOk' && okSummary.text === '5 photos submitted for review.');

const oneSummary = GUB.summarize({ uploaded: 1, failed: [], hardStopMessage: null, stopped: false }, 1);
check('singular phrasing for exactly 1 photo', oneSummary.text === '1 photo submitted for review.');

const partialSummary = GUB.summarize({ uploaded: 3, failed: ['b.jpg', 'd.jpg'], hardStopMessage: null, stopped: false }, 5);
check('"3 of 5 uploaded -- 2 failed." exactly, from the task\'s own example', partialSummary.kind === 'partial' && partialSummary.text === '3 of 5 uploaded -- 2 failed.', partialSummary.text);
check('retry label is scoped to just the failed count, plural', partialSummary.retryLabel === 'Retry 2 failed photos');

const partialOneSummary = GUB.summarize({ uploaded: 4, failed: ['b.jpg'], hardStopMessage: null, stopped: false }, 5);
check('retry label singular for exactly 1 failed photo', partialOneSummary.retryLabel === 'Retry 1 failed photo');

const hardStopSummary = GUB.summarize({ uploaded: 0, failed: [], hardStopMessage: 'Upload limit reached for this link.', stopped: true }, 5);
check('a hard-stop with nothing uploaded yet shows just the reason', hardStopSummary.kind === 'hardStop' && hardStopSummary.text === 'Upload limit reached for this link.');

const hardStopPartialSummary = GUB.summarize({ uploaded: 2, failed: [], hardStopMessage: 'This link has been revoked since you started uploading.', stopped: true }, 5);
check('a hard-stop after some successes credits what did get through', hardStopPartialSummary.text === '2 uploaded before this happened: This link has been revoked since you started uploading.');

console.log(`\n=== GALLERY UPLOAD BATCH (partial-failure-aware uploads): ${passed}/${passed + failed} passed ===`);
process.exit(failed === 0 ? 0 : 1);
