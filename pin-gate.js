/* PIN-gate attempt tracking + short cooldown -- pure logic, no DOM/prompt().

   Used by index.html's walk-in Booking PIN gates (pay-pending / cancel-booking
   actions on the public schedule). Those used to just alert('Incorrect Booking
   PIN!') forever, with no limit -- an infinite bare guess loop. This is a
   walk-in booking PIN, not a security-critical account (contrast
   superadmin.html's real auth gate), so the fix is a brief cooldown after a
   few consecutive wrong guesses, not a permanent lockout -- with clear
   messaging about why the retry is temporarily blocked, following the same
   "explain why, give a concrete recovery route" shape as superadmin.html's
   "Not authorized" screen.

   Each gate (keyed by caller, e.g. one key per booking + action) keeps its
   own independent { count, cooldownUntil } record so one wrong guess on one
   booking never penalizes another. A correct PIN resets the record.

   No DOM, no timers, no prompt()/alert() -- callers own all of that and just
   feed this module a record + outcome. Loaded by the browser as `PinGate` and
   by the tests via require(), same convention as next-open.js / queue-engine.js. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PinGate = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const DEFAULT_MAX_ATTEMPTS = 3;
  const DEFAULT_COOLDOWN_MS = 8000;

  function emptyRecord() {
    return { count: 0, cooldownUntil: 0 };
  }

  /* Call before prompting for a PIN. Returns whether this gate is currently
     cooling down (and, if so, how many seconds are left to show the person),
     plus the record to pass back into recordResult() once they've answered. */
  function checkGate(record, nowMs, cooldownMs) {
    const rec = record || emptyRecord();
    const now = typeof nowMs === 'number' ? nowMs : Date.now();
    const remainingMs = rec.cooldownUntil - now;
    if (remainingMs > 0) {
      return { blocked: true, secondsLeft: Math.ceil(remainingMs / 1000), record: rec };
    }
    // Cooldown has lapsed (or never started) -- a lapsed cooldown also clears
    // the record, so the person gets a fresh run of attempts, not an instant
    // re-trigger on their very next try.
    return { blocked: false, secondsLeft: 0, record: rec.cooldownUntil ? emptyRecord() : rec };
  }

  /* Call after the person answers the prompt. Returns the updated record
     (persist it under the same key) plus what to tell them:
       - correct: never any cooldown messaging, record resets.
       - wrong, under the attempt limit: how many attempts remain.
       - wrong, limit reached: a cooldown is now armed (counter resets so the
         next run of attempts starts clean once it lapses) and how long it
         lasts. */
  function recordResult(record, correct, opts) {
    const o = opts || {};
    const maxAttempts = typeof o.maxAttempts === 'number' ? o.maxAttempts : DEFAULT_MAX_ATTEMPTS;
    const cooldownMs = typeof o.cooldownMs === 'number' ? o.cooldownMs : DEFAULT_COOLDOWN_MS;
    const nowMs = typeof o.nowMs === 'number' ? o.nowMs : Date.now();
    const rec = record || emptyRecord();

    if (correct) {
      return { record: emptyRecord(), outcome: 'correct' };
    }

    const count = rec.count + 1;
    if (count >= maxAttempts) {
      return {
        record: { count: 0, cooldownUntil: nowMs + cooldownMs },
        outcome: 'cooldown',
        cooldownSeconds: Math.round(cooldownMs / 1000),
      };
    }
    return {
      record: { count, cooldownUntil: rec.cooldownUntil },
      outcome: 'wrong',
      attemptsLeft: maxAttempts - count,
    };
  }

  return {
    DEFAULT_MAX_ATTEMPTS,
    DEFAULT_COOLDOWN_MS,
    emptyRecord,
    checkGate,
    recordResult,
  };
}));
