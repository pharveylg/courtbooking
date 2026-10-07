/* Partner rotation pick tests.  Usage: node tests/rotation-pick.test.js */
const R = require('../rotation-pick.js');

let passed = 0, failed = 0;
function check(name, ok, detail) { if (ok) passed++; else { failed++; console.log(`  FAIL: ${name}${detail ? ' -- ' + detail : ''}`); } }
const section = (t) => console.log(`\n${t}`);
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const solo = (...names) => names.map((n) => ({ id: 'w_' + n, names: [n] }));

section('picking');
check('exactly four waiting: all of them, in queue order, queue empties', (() => { const r = R.pickPlayers(solo('a', 'b', 'c', 'd'), 4, {}); return eq(r.picked, ['a', 'b', 'c', 'd']) && r.waiting.length === 0; })());
check('fewer than four waiting: no pick', R.pickPlayers(solo('a', 'b', 'c'), 4, {}) === null);
check('an uneven queue picks four and leaves one at the front', (() => { const r = R.pickPlayers(solo('a', 'b', 'c', 'd', 'e'), 4, {}); return eq(r.picked, ['a', 'b', 'c', 'd']) && eq(r.waiting, solo('e')); })());
check('the fewest rotations go first, ties go to whoever waited longest', (() => { const r = R.pickPlayers(solo('a', 'b', 'c', 'd', 'e'), 4, { a: 2, b: 2, c: 1, d: 1, e: 0 }); return eq(r.picked, ['a', 'c', 'd', 'e']) && eq(r.waiting, solo('b')); })());
check('a player who played more sits out even when they arrived first', (() => { const r = R.pickPlayers(solo('a', 'b', 'c', 'd', 'e'), 4, { a: 3 }); return !r.picked.includes('a') && r.waiting.length === 1 && r.waiting[0].names[0] === 'a'; })());
check('pairs that came together stay together while they are picked', (() => { const q = [{ id: 'p1', names: ['a', 'b'] }, { id: 's1', names: ['c'] }, { id: 'p2', names: ['d', 'e', 'f'] }]; const r = R.pickPlayers(q, 4, {}); return eq(r.picked, ['a', 'b', 'c', 'd']) && eq(r.waiting, [{ id: 'p2', names: ['e', 'f'] }]); })());
check('a group left partly behind keeps its id', (() => { const r = R.pickPlayers([{ id: 'p', names: ['a', 'b', 'c'] }], 2, {}); return eq(r.picked, ['a', 'b']) && eq(r.waiting, [{ id: 'p', names: ['c'] }]); })());
check('picking does not mutate the queue', (() => { const q = solo('a', 'b', 'c', 'd', 'e'); R.pickPlayers(q, 4, {}); return q.length === 5 && q[0].names[0] === 'a'; })());

section('counting');
const c1 = R.countRotation({ a: 1 }, ['a', 'b']);
check('counting adds one rotation per picked player and returns a new object', eq(c1, { a: 2, b: 1 }) && eq({ a: 1 }, { a: 1 }));
check('a name like "constructor" is counted as a plain name', eq(R.countRotation({}, ['constructor']), { constructor: 1 }) && R.pickPlayers(solo('constructor', 'x', 'y', 'z', 'w'), 4, {}).picked.length === 4);

section('odd queue over many rounds');
// Each pick goes to the back of the queue, as partner rotation does after round three.
let queue = solo('a', 'b', 'c', 'd', 'e', 'f', 'g');
let counts = {};
for (let round = 0; round < 40; round++) {
  const r = R.pickPlayers(queue, 4, counts);
  counts = R.countRotation(counts, r.picked);
  queue = [...r.waiting, ...r.picked.map((n) => ({ id: 'w_' + n + round, names: [n] }))];
}
const vals = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((n) => counts[n] || 0);
check('seven players over forty rounds: games stay within one of each other', Math.max(...vals) - Math.min(...vals) <= 1, JSON.stringify(vals));

console.log(`\n=== ROTATION PICK: ${passed}/${passed + failed} passed ===`);
process.exit(failed === 0 ? 0 : 1);
