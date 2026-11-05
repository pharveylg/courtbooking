/* PinGate -- the walk-in Booking PIN gate's attempt-tracking + cooldown state
   machine used by index.html's pay-pending / cancel-booking PIN prompts
   (replacing an old infinite bare alert() loop). Pure logic, no DOM/prompt(),
   so it's require()-able here, same convention as next-open.js/queue-engine.js.

   Usage: node tests/pin-gate.test.js */
const path = require('path');
const PinGate = require(path.join(__dirname, '..', 'pin-gate.js'));

let passed = 0, failed = 0;
function check(name, ok, detail) { if (ok) passed++; else { failed++; console.log(`  FAIL: ${name}${detail ? ' -- ' + detail : ''}`); } }
const section = (t) => console.log(`\n${t}`);
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const NOW = 1700000000000;

/* ================================================================
   checkGate -- whether a gate is currently cooling down
   ================================================================ */
section('checkGate -- fresh/no record is never blocked');

check('no record at all -> not blocked', PinGate.checkGate(undefined, NOW).blocked === false);
check('a fresh (never-failed) record -> not blocked', PinGate.checkGate(PinGate.emptyRecord(), NOW).blocked === false);

section('checkGate -- an armed cooldown blocks until it lapses');

const cooling = { count: 0, cooldownUntil: NOW + 5000 };
const mid = PinGate.checkGate(cooling, NOW + 2000);
check('blocked while cooldownUntil is still in the future', mid.blocked === true);
check('secondsLeft rounds UP so the person never sees "0s left" while still blocked', mid.secondsLeft === 3, JSON.stringify(mid));

const justAfter = PinGate.checkGate(cooling, NOW + 5000);
check('cooldownUntil === now is no longer blocked (strictly greater-than)', justAfter.blocked === false);

const lapsed = PinGate.checkGate(cooling, NOW + 9000);
check('a fully lapsed cooldown is not blocked', lapsed.blocked === false);
check('a lapsed cooldown also resets the record -- next run of attempts starts clean', eq(lapsed.record, PinGate.emptyRecord()));

/* ================================================================
   recordResult -- correct / wrong / cooldown-armed transitions
   ================================================================ */
section('recordResult -- correct PIN always resets, regardless of prior attempts');

const afterTwoWrong = { count: 2, cooldownUntil: 0 };
const correctResult = PinGate.recordResult(afterTwoWrong, true, { nowMs: NOW });
check('outcome is "correct"', correctResult.outcome === 'correct');
check('record resets to empty', eq(correctResult.record, PinGate.emptyRecord()));

section('recordResult -- wrong PIN under the limit just counts down attempts left');

const r1 = PinGate.recordResult(PinGate.emptyRecord(), false, { nowMs: NOW, maxAttempts: 3 });
check('1st wrong attempt -> "wrong", 2 left', r1.outcome === 'wrong' && r1.attemptsLeft === 2, JSON.stringify(r1));
check('record remembers the count', r1.record.count === 1);

const r2 = PinGate.recordResult(r1.record, false, { nowMs: NOW, maxAttempts: 3 });
check('2nd wrong attempt -> "wrong", 1 left', r2.outcome === 'wrong' && r2.attemptsLeft === 1);

section('recordResult -- hitting the limit arms a cooldown and resets the counter');

const r3 = PinGate.recordResult(r2.record, false, { nowMs: NOW, maxAttempts: 3, cooldownMs: 8000 });
check('3rd consecutive wrong attempt -> "cooldown"', r3.outcome === 'cooldown', JSON.stringify(r3));
check('reports the cooldown length in seconds', r3.cooldownSeconds === 8);
check('counter resets to 0 once the cooldown is armed', r3.record.count === 0);
check('cooldownUntil is nowMs + cooldownMs', r3.record.cooldownUntil === NOW + 8000);

section('recordResult -- a provided cooldown does not get cleared by a later wrong guess within it');
// (checkGate is what actually blocks attempts during the window -- callers
// are expected to call checkGate first and never reach recordResult while
// blocked. This just documents recordResult alone doesn't need to re-check.)
const r4 = PinGate.recordResult({ count: 0, cooldownUntil: NOW + 8000 }, false, { nowMs: NOW + 1000, maxAttempts: 3 });
check('still just counts as attempt 1 of a new run', r4.outcome === 'wrong' && r4.attemptsLeft === 2);

/* ================================================================
   End-to-end: three wrong guesses in a row triggers exactly one cooldown,
   a correct guess at any point resets cleanly, and independent keys (two
   different bookings) never interfere with each other.
   ================================================================ */
section('end-to-end sequence -- mirrors how index.html drives this per booking');

function simulate(maxAttempts, cooldownMs, sequenceOfCorrect) {
  let record = PinGate.emptyRecord();
  const outcomes = [];
  let t = NOW;
  for (const correct of sequenceOfCorrect) {
    const gate = PinGate.checkGate(record, t);
    record = gate.record;
    if (gate.blocked) { outcomes.push('blocked'); continue; }
    const result = PinGate.recordResult(record, correct, { nowMs: t, maxAttempts, cooldownMs });
    record = result.record;
    outcomes.push(result.outcome);
    t += 100; // each attempt happens quickly, well inside the cooldown window
  }
  return outcomes;
}

check('wrong, wrong, wrong -> wrong, wrong, cooldown (3rd consecutive triggers it)',
  eq(simulate(3, 8000, [false, false, false]), ['wrong', 'wrong', 'cooldown']));

check('a 4th attempt right after the cooldown is armed is blocked, not re-prompted',
  eq(simulate(3, 8000, [false, false, false, false]), ['wrong', 'wrong', 'cooldown', 'blocked']));

check('a correct guess before the limit resets cleanly -- no cooldown carries over',
  eq(simulate(3, 8000, [false, true, false, false, false]), ['wrong', 'correct', 'wrong', 'wrong', 'cooldown']));

let recA = PinGate.emptyRecord(), recB = PinGate.emptyRecord();
[false, false, false].forEach(() => { recA = PinGate.recordResult(recA, false, { nowMs: NOW, maxAttempts: 3 }).record; });
check('booking A hit its cooldown', PinGate.checkGate(recA, NOW).blocked === true);
check('booking B (a different key/record) is completely unaffected by A\'s cooldown', PinGate.checkGate(recB, NOW).blocked === false);

console.log(`\n=== PIN GATE (booking PIN attempt/cooldown): ${passed}/${passed + failed} passed ===`);
process.exit(failed === 0 ? 0 : 1);
