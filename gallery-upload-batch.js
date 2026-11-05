/* Partial-failure-aware photo upload batching -- pure logic, no DOM/network.

   Used by gallery.html's upload flow. That flow used to stop on the very
   first failed photo (a `break`) and show the raw ex.message. The fix has
   two parts: (1) keep attempting the rest of the batch after one photo
   fails instead of giving up on all of them, and (2) only a true hard-stop
   condition (the upload link got revoked/expired/hit its cap, or couldn't
   even be verified) should end the batch early, since every remaining file
   would fail the same way.

   This module is just the reducer over a sequence of per-photo outcomes --
   it doesn't know about Firestore/Storage/compressImage at all, so it's
   require()-able and fully testable without any of that. gallery.html's
   uploadOnePhoto() produces the outcomes; runUploadBatch() there is a thin
   async loop that calls reduceUploadOutcome() here. Loaded by the browser as
   `GalleryUploadBatch` and by the tests via require(), same convention as
   next-open.js / queue-engine.js. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.GalleryUploadBatch = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* Folds one more per-file outcome into the running batch state.
     outcome: { ok: true } | { ok: false, hardStop: false } | { ok: false, hardStop: true, message }
     state: { uploaded: number, failed: array (opaque items, e.g. the File),
               hardStopMessage: string|null, stopped: boolean }
     `file` is pushed into `failed` as-is (opaque to this module) so the
     caller can offer a "retry just these" action. */
  function foldOutcome(state, outcome, file) {
    if (state.stopped) return state; // already stopped -- ignore anything after
    if (outcome.ok) {
      return { uploaded: state.uploaded + 1, failed: state.failed, hardStopMessage: null, stopped: false };
    }
    if (outcome.hardStop) {
      return { uploaded: state.uploaded, failed: state.failed, hardStopMessage: outcome.message, stopped: true };
    }
    return { uploaded: state.uploaded, failed: state.failed.concat([file]), hardStopMessage: null, stopped: false };
  }

  function initialState() {
    return { uploaded: 0, failed: [], hardStopMessage: null, stopped: false };
  }

  /* Convenience: fold a whole already-computed array of {file, outcome}
     pairs at once (handy for tests and for callers that already ran every
     attempt and just want the summary). Stops folding once `stopped` -- a
     hard-stop always wins over anything after it, mirroring the real loop's
     `break`. */
  function reduceOutcomes(pairs) {
    let state = initialState();
    for (const { file, outcome } of pairs) {
      if (state.stopped) break;
      state = foldOutcome(state, outcome, file);
    }
    return state;
  }

  /* The user-facing summary for a finished (or hard-stopped) batch --
     never raw error text, matching the court-scoreboard.js finish()
     template (friendly message, retry affordance). */
  function summarize(state, total) {
    if (state.hardStopMessage) {
      return {
        kind: 'hardStop',
        text: state.uploaded > 0 ? `${state.uploaded} uploaded before this happened: ${state.hardStopMessage}` : state.hardStopMessage,
      };
    }
    if (state.failed.length === 0) {
      return { kind: 'allOk', text: `${state.uploaded} photo${state.uploaded === 1 ? '' : 's'} submitted for review.` };
    }
    return {
      kind: 'partial',
      text: `${state.uploaded} of ${total} uploaded -- ${state.failed.length} failed.`,
      retryLabel: `Retry ${state.failed.length} failed photo${state.failed.length === 1 ? '' : 's'}`,
    };
  }

  return {
    initialState,
    foldOutcome,
    reduceOutcomes,
    summarize,
  };
}));
