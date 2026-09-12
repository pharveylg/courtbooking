/* ================================================================
   Billing portal smoke test: runs billing.html's inline script
   against stubbed DOM/Firebase and verifies the boot path renders
   the PIN gate and wires the app chrome without throwing.

   Also exercises the PIN-submission flow end-to-end through the
   getBillingPortalData callable (functions/index.js) -- a wrong PIN
   must surface an error and leave the gate up, a right PIN must
   unlock the app screen with the callable's data rendered. This is
   the flow the original version of this test never touched: it only
   ever checked the gate's initial render, so it would not have
   caught a regression in PIN submission itself (including the switch
   from a direct Firestore compare to this callable). It still can't
   verify firestore.rules or the real Cloud Function -- see
   rules_perm_test-style emulator checks for that -- but it does
   verify billing.html's own client-side wiring: hashing the PIN,
   calling the callable, handling success/failure, and persisting the
   session so a refresh re-authenticates silently.

   Usage:  node tests/billing-portal.test.js
   ================================================================ */
const fs = require('fs');
const path = require('path');

const elements = new Map();
function makeEl(id) {
  const classes = new Set();
  const listeners = {};
  const el = {
    id, innerHTML: '', value: '', textContent: '', disabled: false, checked: false, files: [],
    dataset: {}, style: {},
    classList: {
      toggle(c, force) {
        if (force === undefined) { if (classes.has(c)) { classes.delete(c); return false; } classes.add(c); return true; }
        if (force) classes.add(c); else classes.delete(c);
        return force;
      },
      add(...cs) { cs.forEach(c => classes.add(c)); },
      remove(...cs) { cs.forEach(c => classes.delete(c)); },
      contains(c) { return classes.has(c); },
    },
    addEventListener(type, fn) { (listeners[type] = listeners[type] || []).push(fn); },
    async _trigger(type, evt) { for (const fn of (listeners[type] || [])) await fn(evt); },
    onclick: null,
    setAttribute(){}, getAttribute(){ return null; }, removeAttribute(){},
    appendChild(){}, querySelector(){ return makeEl(id + '-q'); }, querySelectorAll(){ return []; },
    reset(){}, focus(){}, click(){},
  };
  return el;
}
global.document = {
  getElementById: (id) => { if (!elements.has(id)) elements.set(id, makeEl(id)); return elements.get(id); },
  querySelector: () => makeEl('docq'), querySelectorAll: () => [], createElement: (t) => makeEl('created-' + t),
};
global.window = global;
global.FIREBASE_CONFIG = { apiKey: 'test-key', projectId: 'test-project' };
global.location = { search: '?client=demo' };
const session = new Map();
global.sessionStorage = { getItem: k => session.has(k) ? session.get(k) : null, setItem: (k, v) => session.set(k, v), removeItem: k => session.delete(k) };

const docData = { exists: true, data: () => ({}) };
const stubDoc = () => ({ get: async () => docData, set: async () => {}, update: async () => {} });
const stubCol = () => new Proxy({}, { get(t, prop) {
  if (prop === 'get') return async () => ({ empty: true, forEach(){}, docs: [] });
  if (prop === 'doc') return stubDoc;
  if (prop === 'add') return async () => ({ id: 'x' });
  return () => stubCol();
}});
const FV = { serverTimestamp: () => null, increment: n => ({ __inc: n }), arrayUnion: (...a) => ({ __au: a }) };
const FS = () => ({ doc: stubDoc, collection: stubCol, FieldValue: FV }); FS.FieldValue = FV;

/* Mocks getBillingPortalData (functions/index.js) -- toggle
   MOCK_CALLABLE.succeed to switch between a correct and incorrect PIN
   without needing hashPin() to actually vary (the crypto stub below
   always returns the same digest regardless of input). */
const MOCK_CALLABLE = { succeed: false, calls: [] };
function mockGetBillingPortalData(data) {
  MOCK_CALLABLE.calls.push(data);
  if (!MOCK_CALLABLE.succeed) {
    const err = new Error('Incorrect PIN.');
    err.code = 'functions/permission-denied';
    return Promise.reject(err);
  }
  return Promise.resolve({
    data: {
      tenant: { businessName: 'Demo Courts', creditBalance: 42, billing: { baseFee: 0, freeBookings: 0, perBookingRate: 0 } },
      confirmedBookingsThisMonth: 3,
      invoices: [],
    },
  });
}
global.firebase = {
  initializeApp() { return {}; },
  app() { return { functions() { return { httpsCallable(name) {
    if (name !== 'getBillingPortalData') throw new Error('unexpected callable: ' + name);
    return mockGetBillingPortalData;
  } }; } }; },
  firestore: FS,
  storage() { return { ref() { return { put() { return { snapshot: { ref: { getDownloadURL(){ return Promise.resolve('u'); } } } }; }, }; } }; },
};
global.confirm = () => true; global.alert = () => {};
global.crypto = { subtle: { digest() { return Promise.resolve(new ArrayBuffer(32)); } } };
global.TextEncoder = require('util').TextEncoder;
global.FileReader = class { readAsDataURL(){} };

const html = fs.readFileSync(path.join(__dirname, '..', 'billing.html'), 'utf8');
const inline = html.match(/<script>([\s\S]*?)<\/script>/g).map(s => s.replace(/^<script>/, '').replace(/<\/script>$/, ''));
eval(inline[inline.length - 1]);

let passed = 0, failed = 0;
function check(name, ok) {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}: ${name}`);
  if (ok) passed++; else failed++;
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  await wait(150);

  const gate = elements.get('gateStateWrap');
  const okGate = gate && /Admin PIN/.test(gate.innerHTML);
  const title = elements.get('appBizName').textContent || elements.get('gateLogo').textContent;
  check(`initial boot renders the PIN gate with branding applied ("${title}")`, !!(okGate && title));

  console.log('\n=== PIN submission: wrong PIN ===');
  MOCK_CALLABLE.succeed = false;
  document.getElementById('portalPinInput').value = '0000';
  await elements.get('portalPinForm')._trigger('submit', { preventDefault(){}, target: elements.get('portalPinForm') });
  check('calls getBillingPortalData with clientId + a pinHash',
    MOCK_CALLABLE.calls.length === 1 && MOCK_CALLABLE.calls[0].clientId === 'demo' && typeof MOCK_CALLABLE.calls[0].pinHash === 'string' && MOCK_CALLABLE.calls[0].pinHash.length > 0);
  check('shows "Incorrect PIN" on the gate', /Incorrect PIN/.test(document.getElementById('portalPinError').textContent));
  check('gate stays up (appScreen not entered) after a wrong PIN', !document.getElementById('gateScreen').classList.contains('hidden'));
  check('nothing persisted to sessionStorage after a wrong PIN', session.get('cb_billing_unlocked_demo') === undefined);

  console.log('\n=== PIN submission: correct PIN ===');
  MOCK_CALLABLE.succeed = true;
  document.getElementById('portalPinInput').value = '1234';
  await elements.get('portalPinForm')._trigger('submit', { preventDefault(){}, target: elements.get('portalPinForm') });
  await wait(20);
  check('gate hidden, app screen entered after a correct PIN',
    document.getElementById('gateScreen').classList.contains('hidden') && !document.getElementById('appScreen').classList.contains('hidden'));
  check('callable data reaches the rendered summary (creditBalance 42)',
    /42\.00/.test(document.getElementById('sumBalance').textContent));
  check('pinHash (not a boolean) persisted for silent re-auth on refresh',
    typeof session.get('cb_billing_unlocked_demo') === 'string' && session.get('cb_billing_unlocked_demo').length > 0);

  console.log('\n=== Refresh: stored hash re-authenticates without prompting ===');
  MOCK_CALLABLE.calls.length = 0;
  const storedHash = session.get('cb_billing_unlocked_demo');
  const ok = await (async () => { try { return await loadPortalData(storedHash); } catch { return false; } })();
  check('loadPortalData(storedHash) succeeds using the persisted hash', ok === true);
  check('re-used the exact stored hash (not the boolean the old version stored)', MOCK_CALLABLE.calls[0] && MOCK_CALLABLE.calls[0].pinHash === storedHash);

  console.log(`\n=== RESULT: ${passed} passed, ${failed} failed ===`);
  process.exit(failed === 0 ? 0 : 1);
})();
