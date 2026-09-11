/* ================================================================
   Billing portal smoke test: runs billing.html's inline script
   against stubbed DOM/Firebase and verifies the boot path renders
   the PIN gate and wires the app chrome without throwing.

   Usage:  node tests/billing-portal.test.js
   ================================================================ */
const fs = require('fs');
const path = require('path');

const elements = new Map();
function makeEl(id) {
  const el = {
    id, innerHTML: '', value: '', textContent: '', disabled: false, checked: false, files: [],
    dataset: {}, style: {},
    classList: { toggle(){}, add(){}, remove(){}, contains(){ return false; } },
    addEventListener(){}, onclick: null,
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
global.firebase = {
  initializeApp() { return {}; },
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

setTimeout(() => {
  const gate = elements.get('gateStateWrap');
  const okGate = gate && /Admin PIN/.test(gate.innerHTML);
  const title = elements.get('appBizName').textContent || elements.get('gateLogo').textContent;
  console.log(okGate && title
    ? `=== BILLING PORTAL SMOKE: OK (gate rendered, branding applied: "${title}") ===`
    : `=== BILLING PORTAL SMOKE: FAILED (gate=${!!okGate}, title="${title}") ===`);
  process.exit(okGate ? 0 : 1);
}, 150);
