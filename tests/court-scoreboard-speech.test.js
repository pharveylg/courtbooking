/* Court scoreboard spoken score calls: queue behaviour of speak() in
   court-scoreboard.js. Calls must not cut each other off, the queue advances on
   onend/onerror, a waiting backlog is trimmed to the newest calls, and a
   spoken utterance is held until it finishes. The board is loaded into a vm
   with a DOM and speechSynthesis stub (same approach as theme-tokens.test.js)
   and speech is driven through the real "Test voice" button.
   Usage: node tests/court-scoreboard-speech.test.js */
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const board = read('court-scoreboard.js');

let passed = 0, failed = 0;
function check(name, ok, detail) { if (ok) passed++; else { failed++; console.log(`  FAIL: ${name}${detail ? ' -- ' + detail : ''}`); } }
const section = (t) => console.log(`\n${t}`);

/* Opens a board in a fresh vm. Every utterance gets an id (1, 2, 3...) in
   creation order; synth.spoken records each speechSynthesis.speak() call along
   with how many cancel() calls had happened before it. */
function makeBoard(opts = {}) {
  const els = [];
  const synth = { spoken: [], cancels: 0 };
  const uttStore = [];
  function Utt(text) { this.id = uttStore.length + 1; this.text = text; this.onend = null; this.onerror = null; uttStore.push(this); }
  const speechSynthesis = {
    speak(u) { synth.spoken.push({ id: u.id, cancelsBefore: synth.cancels }); },
    cancel() { synth.cancels++; },
  };
  const mk = (tag) => {
    const e = { tag, children: [], listeners: {}, style: { props: {}, setProperty(k, v) { this.props[k] = v; } }, className: '', attrs: {}, setAttribute(k, v) { this.attrs[k] = v; }, append(...c) { this.children.push(...c); }, appendChild(c) { this.children.push(c); return c; }, addEventListener(t, fn) { (this.listeners[t] = this.listeners[t] || []).push(fn); }, classList: { add() {}, remove() {}, toggle() {} }, remove() {}, querySelector() { return null; }, querySelectorAll() { return []; }, focus() {}, textContent: '' };
    els.push(e); return e;
  };
  const doc = { createElement: mk, head: mk('head'), body: mk('body'), getElementById: () => null, querySelector: () => null, addEventListener() {}, removeEventListener() {}, visibilityState: 'hidden' };
  doc.body.style = {}; doc.createTextNode = (t) => ({ text: t });
  const store = { getItem: () => (opts.audio === 'off' ? 'off' : null), setItem() {}, removeItem() {} };
  const win = { PickleScore: require('../pickleball-scoring.js'), speechSynthesis, SpeechSynthesisUtterance: Utt, addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }), innerWidth: 400, innerHeight: 800 };
  win.window = win;
  /* Fake timers: the watchdog timer is recorded, never run on its own. */
  const timers = { next: 1, pending: new Map(), fire(id) { const t = this.pending.get(id); this.pending.delete(id); t.fn(); } };
  const fakeSetTimeout = (fn, ms) => { const id = timers.next++; timers.pending.set(id, { fn, ms }); return id; };
  const fakeClearTimeout = (id) => { timers.pending.delete(id); };
  const ctx = vm.createContext(Object.assign({ document: doc, localStorage: store, console, setTimeout: fakeSetTimeout, clearTimeout: fakeClearTimeout, navigator: {}, requestAnimationFrame: (f) => f() }, win));
  vm.runInContext(board, ctx);
  const B = win.CourtBoard;
  const api = B.open({ title: 't', names: { home: 'A', away: 'B' }, config: { target: 11, winBy: 2, scoring: 'sideout', bestOf: 1, doubles: true } });
  const press = (text) => {
    const b = els.find((e) => e.textContent === text && e.tag === 'button');
    if (!b) throw new Error(`no button "${text}"`);
    (b.listeners.click || []).forEach((fn) => fn({}));
  };
  return { api, synth, press, uttStore, timers };
}

/* ---- source checks ---- */
section('source: speak() never cancels, and the utterance is held in module state');
const speakSrc = /function speak\(text, force\) \{[\s\S]*?\n    \}/.exec(board);
check('speak() source found', !!speakSrc);
check('speak() does not call speechSynthesis.cancel()', !!speakSrc && !/cancel\(/.test(speakSrc[0]));
check('a module-level speechCurrent slot holds the utterance until onend/onerror', /let speechCurrent = null;/.test(board) && /speechCurrent = u;/.test(board) && /u\.onend = done; u\.onerror = done;/.test(board));
check('the utterance is stored in speechCurrent before speechSynthesis.speak(u)', board.indexOf('speechCurrent = u;') < board.indexOf('window.speechSynthesis.speak(u)'));
check('backlog is capped at 2 waiting calls', /const SPEECH_BACKLOG = 2;/.test(board) && /while \(speechWaiting\.length > SPEECH_BACKLOG\) speechWaiting\.shift\(\);/.test(board));

section('(a) back-to-back calls do not cancel the speaking utterance');
{
  const b = makeBoard();
  b.press('Test voice');
  b.press('Test voice');
  check('only the first call starts speaking while it is in progress', b.synth.spoken.length === 1, `spoke ${b.synth.spoken.length}`);
  check('cancel() was never called before the first speak', b.synth.cancels === 0, `cancels=${b.synth.cancels}`);
  b.uttStore[0].onend();
  check('second call starts after the first ends, with no cancel() in between', b.synth.spoken.length === 2 && b.synth.spoken[1].cancelsBefore === 0, JSON.stringify(b.synth.spoken));
}

section('(b) the queue advances on onend and on onerror');
{
  const b = makeBoard();
  b.press('Test voice'); b.press('Test voice'); b.press('Test voice');
  b.uttStore[0].onend();
  check('onend starts the next waiting call', b.synth.spoken.map((s) => s.id).join(',') === '1,2', b.synth.spoken.map((s) => s.id).join(','));
  b.uttStore[1].onerror({ error: 'network' });
  check('onerror also starts the next waiting call', b.synth.spoken.map((s) => s.id).join(',') === '1,2,3', b.synth.spoken.map((s) => s.id).join(','));
  b.uttStore[2].onend();
  check('queue is empty after the last call ends (no extra speak)', b.synth.spoken.length === 3);
}

section('(c) a waiting backlog larger than 2 is trimmed to the newest calls');
{
  const b = makeBoard();
  for (let i = 0; i < 5; i++) b.press('Test voice');
  b.uttStore[0].onend();
  b.uttStore[3].onend();
  const order = b.synth.spoken.map((s) => s.id).join(',');
  check('speaking call 1 is never dropped, and calls 2 and 3 (the oldest waiting) are dropped', order === '1,4,5', order);
  b.uttStore[4].onend();
  check('nothing is left after the newest call finishes', b.synth.spoken.length === 3);
}

section('(d) an utterance is held until its onend fires');
{
  const b = makeBoard();
  b.press('Test voice');
  b.press('Test voice');
  b.uttStore[0].onend();
  b.uttStore[0].onend(); // a duplicate event for the finished utterance must not advance the queue again
  check('a duplicate onend for a finished utterance does not start an extra call', b.synth.spoken.length === 2, `spoke ${b.synth.spoken.length}`);
  check('the held utterance is still the speaking one while it plays (second call waits)', b.synth.spoken.length === 2 && b.synth.spoken[1].id === 2);
}

section('(e) the watchdog advances a stuck utterance');
{
  const b = makeBoard();
  /* The board arms its own timers (keep-awake and similar); only timers armed after this point are speech watchdogs. */
  const baseKeys = new Set(b.timers.pending.keys());
  const speechTimers = () => [...b.timers.pending.entries()].filter(([id]) => !baseKeys.has(id));
  b.press('Test voice'); b.press('Test voice');
  check('one watchdog timer is armed for the speaking utterance', speechTimers().length === 1, `armed=${speechTimers().length}`);
  const [wdId, wd] = speechTimers()[0];
  check('watchdog delay is max(4000, 120 ms per character)', wd.ms === Math.max(4000, 120 * b.uttStore[0].text.length), `ms=${wd.ms}`);
  b.timers.fire(wdId);
  check('a stuck utterance is treated as ended: the next call starts', b.synth.spoken.map((s) => s.id).join(',') === '1,2', b.synth.spoken.map((s) => s.id).join(','));
  b.uttStore[0].onend();
  check('a late onend for the timed-out utterance does not start a third call', b.synth.spoken.length === 2, `spoke ${b.synth.spoken.length}`);
  check('the second call has its own watchdog armed', speechTimers().length === 1, `armed=${speechTimers().length}`);
  b.uttStore[1].onend();
  check('onend clears the watchdog timer', speechTimers().length === 0, `armed=${speechTimers().length}`);
  b.press('Test voice'); b.press('Test voice');
  b.press('Close');
  check('close() clears the watchdog timer', speechTimers().length === 0, `armed=${speechTimers().length}`);
}
check('source: the watchdog is armed on speechCurrent and cleared in cancelSpeech', /speechWatchdog = setTimeout\(done, Math\.max\(4000, 120 \* String\(u\.text \|\| ''\)\.length\)\);/.test(board) && /function cancelSpeech\(\) \{\s*clearTimeout\(speechWatchdog\);/.test(board));

section('force semantics: Test voice speaks even with audio off');
{
  const b = makeBoard({ audio: 'off' });
  b.press('Test voice');
  check('forced call speaks with audio off', b.synth.spoken.length === 1);
}

section('close() cancels speech and clears the waiting queue');
{
  const b = makeBoard();
  b.press('Test voice'); b.press('Test voice'); b.press('Test voice');
  b.press('Close');
  check('close() calls cancel()', b.synth.cancels >= 1, `cancels=${b.synth.cancels}`);
  const before = b.synth.spoken.length;
  b.uttStore[0].onend();
  check('after close(), the waiting calls are never spoken', b.synth.spoken.length === before, `before=${before} after=${b.synth.spoken.length}`);
}

console.log(`\n=== COURT SCOREBOARD SPEECH: ${passed}/${passed + failed} passed ===`);
process.exit(failed === 0 ? 0 : 1);
