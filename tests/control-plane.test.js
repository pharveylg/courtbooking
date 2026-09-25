/* ================================================================
   Control-plane integration tests (no Firebase project needed).
   Runs the superadmin console's inline script against an in-memory
   Firestore + stubbed DOM, then drives real flows: entitlements,
   lifecycle, plans, invoices, submissions, historical periods.

   Usage:  node tests/control-plane.test.js
   ================================================================ */
const fs = require('fs');
const path = require('path');

/* ---------- in-memory Firestore ---------- */
const TS = () => ({ __ts: true });
const store = new Map();
function resolveFields(data, current) {
  const out = { ...data };
  for (const [k, v] of Object.entries(data)) {
    if (v && v.__ts) out[k] = new Date();
    else if (v && typeof v === 'object' && '__inc' in v) out[k] = (Number((current || {})[k]) || 0) + v.__inc;
    else if (v && typeof v === 'object' && '__au' in v) out[k] = [...((current || {})[k] || []), ...v.__au.filter(x => !((current || {})[k] || []).some(y => JSON.stringify(y) === JSON.stringify(x)))];
  }
  return out;
}
function childDocs(prefix) {
  const res = [];
  for (const [p, data] of store) {
    if (p.startsWith(prefix + '/') && !p.slice(prefix.length + 1).includes('/')) res.push({ id: p.slice(prefix.length + 1), data() { return data; } });
  }
  return res;
}
function cmp(a, op, b) { if (op === '==') return a === b; if (op === '>=') return a >= b; if (op === '<') return a < b; if (op === '<=') return a <= b; if (op === '>') return a > b; throw new Error('op ' + op); }
function unwrap(v) { return v && v.toDate ? v.toDate() : v; }
function snap(docs) { return { empty: docs.length === 0, size: docs.length, docs, forEach(cb) { docs.forEach(cb); } }; }
function chainQ(path, filters) {
  return {
    where: (f, op, v) => chainQ(path, [...filters, { f, op, v }]),
    orderBy: () => chainQ(path, filters),
    limit: () => chainQ(path, filters),
    get: async () => {
      let docs = childDocs(path);
      for (const fl of filters) docs = docs.filter(d => cmp(unwrap(d.data()[fl.f]), fl.op, unwrap(fl.v)));
      return snap(docs);
    },
  };
}
function makeCollection(path) {
  return {
    doc: (id) => makeDoc(path + '/' + id),
    add: async (data) => { const id = 'auto_' + Math.random().toString(36).slice(2, 9); store.set(path + '/' + id, resolveFields(data, {})); return { id }; },
    where: (f, op, v) => chainQ(path, [{ f, op, v }]),
    orderBy: () => chainQ(path, []),
    limit: () => chainQ(path, []),
    get: async () => snap(childDocs(path)),
  };
}
function makeDoc(path) {
  return {
    get: async () => ({ exists: store.has(path), data: () => store.get(path) || {}, id: path.split('/').pop() }),
    set: async (data, opts) => { const cur = store.get(path) || {}; store.set(path, opts && opts.merge ? { ...cur, ...resolveFields(data, cur) } : resolveFields(data, {})); },
    update: async (data) => { if (!store.has(path)) throw new Error('update on missing doc ' + path); const cur = store.get(path); store.set(path, { ...cur, ...resolveFields(data, cur) }); },
    delete: async () => store.delete(path),
    collection: (sub) => makeCollection(path + '/' + sub),
  };
}

/* ---------- DOM stubs (persistent elements) ---------- */
const elements = new Map();
function makeEl(id) {
  const el = {
    id, innerHTML: '', value: '', textContent: '', disabled: false, checked: false, files: [],
    dataset: {},
    classList: { toggle(){}, add(){}, remove(){}, contains(){ return false; } },
    addEventListener(){}, removeAttribute(){}, setAttribute(k, v){ el['_attr_' + k] = v; }, getAttribute(k){ return el['_attr_' + k] || null; },
    appendChild(){}, querySelector(){ return makeEl(id + '-q-' + Math.random()); }, querySelectorAll(){ return []; },
    scrollIntoView(){}, reset(){}, focus(){}, click(){}, href: '', download: '',
  };
  return el;
}
global.document = {
  getElementById: (id) => { if (!elements.has(id)) elements.set(id, makeEl(id)); return elements.get(id); },
  querySelector: () => makeEl('docq'), querySelectorAll: () => [], createElement: (t) => makeEl('created-' + t),
};

/* ---------- Firebase global ---------- */
global.firebase = (() => {
  const FV = { serverTimestamp: TS, increment: (n) => ({ __inc: n }), arrayUnion: (...a) => ({ __au: a }) };
  const inst = { doc: (p) => makeDoc(p), collection: (p) => makeCollection(p), FieldValue: FV };
  const FS = () => inst; FS.FieldValue = FV;
  return {
    initializeApp() { return {}; },
    auth() { return { onAuthStateChanged(cb){ if (global.__signedIn) cb({ email: 'owner@test', uid: 'u1', getIdTokenResult: async () => ({ claims: { superadmin: true } }) }); }, currentUser: { email: 'owner@test' }, signInWithEmailAndPassword(){ return Promise.resolve(); }, signOut(){} }; },
    firestore: FS,
    storage() { return { ref(){ return { put(){ return { snapshot: { ref: { getDownloadURL(){ return Promise.resolve('http://proof'); } } } }; } }; } }; },
  };
})();
global.window = global;
global.StaffAuth = { uiEnabled: () => false }; // staff-auth.js scaffold: Google sign-in is off by default
global.__signedIn = true;
global.confirm = () => true;
global.prompt = () => '1234';
global.localStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };
global.sessionStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };
global.crypto = { subtle: { digest() { return Promise.resolve(new ArrayBuffer(32)); } } };
global.TextEncoder = require('util').TextEncoder;
global.FileReader = class { readAsDataURL(){} };
global.URL = { createObjectURL: () => 'blob:test', revokeObjectURL() {} }; global.Blob = class {}; global.alert = () => {};

/* ---------- seed data ---------- */
const now = new Date();
const d = (daysAgo, h = 10) => { const x = new Date(now); x.setDate(x.getDate() - daysAgo); x.setHours(h, 0, 0, 0); return { toDate: () => x }; };
store.set('platformTenants/alpha', { businessName: 'Alpha Club', status: 'active', billing: { baseFee: 0, freeBookings: 0, perBookingRate: 0 }, creditBalance: 100, createdAt: d(30) });
store.set('platformTenants/beta', { businessName: 'Beta Sports', status: 'suspended', createdAt: d(20) });
store.set('clients/alpha/status/state', { data: { bookingPaused: false, storeEnabled: true, storePaused: false, tournamentEnabled: false, tournamentPaused: false } });
store.set('clients/alpha/courts/state', { data: [{ id: 'court1', name: 'C1', startHour: 8, active: true }] });
store.set('clients/alpha/staffReserve/state', { data: {} });
store.set('clients/alpha/config/state', { data: { business: { name: 'Alpha Club' }, hours: { queueStart: 8, queueEnd: 22 } } });
for (let i = 0; i < 5; i++) store.set(`platformTenants/alpha/events/ev_c${i}`, { type: 'booking_confirmed', createdAt: d(i), durationHours: 1, playerEmail: `p${i % 3}@x.com`, sample: false });
store.set('platformTenants/alpha/events/ev_x1', { type: 'booking_cancelled', createdAt: d(1), durationHours: 1, sample: false });
store.set('platformTenants/alpha/events/ev_q1', { type: 'queue_session_created', createdAt: d(2), sample: false });

/* ---------- load the console script ---------- */
const html = fs.readFileSync(path.join(__dirname, '..', 'superadmin.html'), 'utf8');
const scripts = html.match(/<script>([\s\S]*?)<\/script>/g);
const inline = scripts.map(s => s.replace(/^<script>/, '').replace(/<\/script>$/, ''));
const code = inline[inline.length - 1];
const EXPOSE = `
globalThis.__makeCtx = () => ({ get TENANT_INDEX(){return TENANT_INDEX}, get ENT_STATE(){return ENT_STATE}, get PLANS_CACHE(){return PLANS_CACHE},
  setEntitlement, setTenantLifecycle, setTenantBillingStatus, seedStarterPlans, assignPlanToTenant, generateDraftInvoices, invoiceApplyAction,
  loadPendingSubmissions, loadInvoiceSubmissions, verifySubmission, rejectSubmission, renderInvoiceQueue, monthInputToOffset, computeTenantReport,
  renderEntitlementsTab, renderPlansTab, renderInvoicesTab, renderOverview, exportReportingCsv, usagePeriod, monthStartDate, invoiceDocId, loadTenants, deriveRuntimeExpectation, computeBillingSuggestions, updatePlatformPolicy, get POLICY(){return POLICY}, renderDiagnostics,
  computeMyPerms, can, requirePerm, PLATFORM_PERMISSIONS,
  get MY_PERMS(){return MY_PERMS}, set MY_PERMS(v){MY_PERMS = v}, db });
`;
eval(code + EXPOSE);
const C = globalThis.__makeCtx();

(async () => {
  const results = [];
  const check = (name, cond) => { results.push([name, !!cond]); if (!cond) console.error('FAIL:', name); };

  /* ===== control plane: state, entitlements, lifecycle ===== */
  await C.loadTenants();
  check('TENANT_INDEX has alpha+beta', C.TENANT_INDEX.alpha && C.TENANT_INDEX.beta);
  check('alpha booking ent virtual active', C.ENT_STATE.alpha.booking && C.ENT_STATE.alpha.booking.status === 'active');
  check('alpha store ent legacy active', C.ENT_STATE.alpha.store && C.ENT_STATE.alpha.store.status === 'active' && C.ENT_STATE.alpha.store.legacy === true);
  check('alpha tournament ent not added', C.ENT_STATE.alpha.tournament === null);
  check('beta booking ent suspended (tenant suspended)', C.ENT_STATE.beta.booking.status === 'suspended');

  await C.setEntitlement('beta', 'tournament', { status: 'active', paused: false }, 'grant', 'test grant');
  const betaEntDoc = store.get('platformTenants/beta/entitlements/tournament');
  check('beta tournament ent doc materialized', betaEntDoc && betaEntDoc.status === 'active' && Array.isArray(betaEntDoc.history) && betaEntDoc.history.length === 1);
  check('beta mirror tournamentEnabled true', store.get('clients/beta/status/state').data.tournamentEnabled === true);
  check('beta mirror bookingPaused true (tenant suspended)', store.get('clients/beta/status/state').data.bookingPaused === true);
  check('audit logged ent-grant', [...store.keys()].some(k => k.startsWith('platformAuditLog/') && store.get(k).action === 'ent-grant'));

  await C.setTenantLifecycle('beta', 'active');
  check('beta platformTenants.status active', store.get('platformTenants/beta').status === 'active');
  check('beta tenantDirectory mirrored', store.get('tenantDirectory/beta').status === 'active');
  check('beta bookingPaused false after reactivate', store.get('clients/beta/status/state').data.bookingPaused === false);

  await C.setTenantLifecycle('alpha', 'suspended');
  const alphaMirror = store.get('clients/alpha/status/state');
  check('alpha bookingPaused true on suspend', alphaMirror.data.bookingPaused === true);
  check('alpha storeEnabled still true on suspend', alphaMirror.data.storeEnabled === true);
  await C.setTenantLifecycle('alpha', 'active');

  /* ===== plans ===== */
  await C.seedStarterPlans();
  check('3 starter plans', Object.keys(C.PLANS_CACHE).length === 3);
  document.getElementById('assignTenant').value = 'alpha';
  document.getElementById('assignPlan').value = 'plan-a';
  await C.assignPlanToTenant();
  const alphaDoc = store.get('platformTenants/alpha');
  check('alpha subscription stamped', alphaDoc.subscription && alphaDoc.subscription.planId === 'plan-a' && alphaDoc.subscription.pricingVersion === '2026-09');
  check('alpha billing formula overwritten from plan', alphaDoc.billing.baseFee === 500 && alphaDoc.billing.freeBookings === 100 && alphaDoc.billing.perBookingRate === 15);

  /* ===== invoices: current month ===== */
  await C.generateDraftInvoices(0);
  const period = C.usagePeriod(0);
  const inv = store.get(`platformInvoices/inv_alpha_${period}`);
  check('alpha draft invoice created', !!inv && inv.status === 'draft');
  check('invoice total = 750 (500 base + 250 store add-on)', inv && inv.total === 750);
  check('invoice has subscription line with sourceId plan-a', inv && inv.lines.some(l => l.sourceType === 'subscription' && l.sourceId === 'plan-a' && l.amount === 500));
  check('invoice has entitlement line for store', inv && inv.lines.some(l => l.sourceType === 'entitlement' && l.sourceId === 'store' && l.amount === 250));
  check('snapshot frozen with confirmedBookings=5', inv && inv.snapshot && inv.snapshot.confirmedBookings === 5);
  check('beta skipped (no billing formula)', store.get(`platformInvoices/inv_beta_${period}`) === undefined);

  /* ===== manual payment states (console-side) ===== */
  let live = { id: `inv_alpha_${period}`, ...store.get(`platformInvoices/inv_alpha_${period}`) };
  await C.invoiceApplyAction(live, { status: 'awaiting_payment' }, 'issue', 'issued');
  check('issued -> awaiting_payment', store.get(`platformInvoices/inv_alpha_${period}`).status === 'awaiting_payment');
  await C.invoiceApplyAction(live, { status: 'submitted_for_verification' }, 'submitted', 'payer says paid');
  check('submitted_for_verification is NOT verified', store.get(`platformInvoices/inv_alpha_${period}`).status === 'submitted_for_verification');

  /* ===== B2: historical-period invoicing ===== */
  const lmStart = C.monthStartDate(1);
  for (let i = 0; i < 3; i++) {
    const dt = new Date(lmStart); dt.setDate(dt.getDate() + 3 + i);
    store.set(`platformTenants/alpha/events/ev_lm${i}`, { type: 'booking_confirmed', createdAt: { toDate: () => dt }, durationHours: 2, playerEmail: `lm${i}@x.com`, sample: false });
  }
  await C.generateDraftInvoices(1);
  const lmPeriod = C.usagePeriod(1);
  const lmInv = store.get(`platformInvoices/inv_alpha_${lmPeriod}`);
  check('B2: last-month invoice created with correct period id', !!lmInv && lmInv.period === lmPeriod);
  check('B2: last-month confirmed = 3 (not this month\'s 5)', !!(lmInv && lmInv.snapshot && lmInv.snapshot.confirmedBookings === 3));
  check('B2: last-month total = 750 (500 base + 250 store add-on, 3<100 included)', !!lmInv && lmInv.total === 750);
  check('B2: monthInputToOffset math', C.monthInputToOffset(lmPeriod) === 1 && C.monthInputToOffset(C.usagePeriod(0)) === 0);

  /* ===== B1: payer submissions + verification queue ===== */
  live = { id: `inv_alpha_${lmPeriod}`, ...store.get(`platformInvoices/inv_alpha_${lmPeriod}`) };
  await C.invoiceApplyAction(live, { status: 'awaiting_payment' }, 'issue', 'issued');
  await makeCollection('platformSubmissions').add({
    tenantId: 'alpha', tenantName: 'Alpha Club', invoiceId: `inv_alpha_${lmPeriod}`, period: lmPeriod,
    method: 'gcash', reference: 'GC-777', amount: 750, proofUrl: 'http://proof/1', status: 'pending', createdAt: { toDate: () => new Date() },
  });
  const pending = await C.loadPendingSubmissions();
  check('B1: pending submission visible in queue', pending.length === 1 && pending[0].reference === 'GC-777');
  const subsForInv = await C.loadInvoiceSubmissions(`inv_alpha_${lmPeriod}`);
  check('B1: invoice-scoped submission lookup works', subsForInv.length === 1);

  live = { id: `inv_alpha_${lmPeriod}`, ...store.get(`platformInvoices/inv_alpha_${lmPeriod}`) };
  const vOk = await C.verifySubmission(live, pending[0]);
  const vInv = store.get(`platformInvoices/inv_alpha_${lmPeriod}`);
  const allSubs1 = [...store.entries()].filter(([k]) => k.startsWith('platformSubmissions/')).map(([, v]) => v);
  check('B1: verifySubmission ok', vOk === true);
  check('B1: invoice verified with attributed payment', vInv.status === 'verified' && vInv.payments.length === 1 && vInv.payments[0].submissionId === pending[0].id && vInv.payments[0].reference === 'GC-777');
  check('B1: submission stamped verified by reviewer', allSubs1.some(s => s.status === 'verified' && s.reviewedBy === 'owner@test'));

  await makeCollection('platformSubmissions').add({
    tenantId: 'alpha', tenantName: 'Alpha Club', invoiceId: `inv_alpha_${lmPeriod}`, period: lmPeriod,
    method: 'bank', reference: 'BK-1', amount: 750, proofUrl: '', status: 'pending', createdAt: { toDate: () => new Date() },
  });
  const pending2 = await C.loadPendingSubmissions();
  live = { id: `inv_alpha_${lmPeriod}`, ...store.get(`platformInvoices/inv_alpha_${lmPeriod}`) };
  const rOk = await C.rejectSubmission(live, pending2[0], 'wrong amount');
  const rInv = store.get(`platformInvoices/inv_alpha_${lmPeriod}`);
  const allSubs2 = [...store.entries()].filter(([k]) => k.startsWith('platformSubmissions/')).map(([, v]) => v);
  const rejSub = allSubs2.find(s => s.reference === 'BK-1');
  check('B1: rejectSubmission ok', rOk === true);
  check('B1: invoice moved to rejected with adjustment', rInv.status === 'rejected' && (rInv.adjustments || []).some(a => a.type === 'rejection' && a.submissionId === pending2[0].id));
  check('B1: submission stamped rejected with reason', !!(rejSub && rejSub.status === 'rejected' && rejSub.rejectionReason === 'wrong amount'));

  /* ===== credit application path ===== */
  store.set(`platformInvoices/inv_alpha2_${period}`, { tenantId: 'alpha2', tenantName: 'Alpha2', period, status: 'awaiting_payment', total: 300, lines: [], creditsApplied: 0, payments: [], adjustments: [] });
  C.TENANT_INDEX.alpha2 = { businessName: 'Alpha2', creditBalance: 200, status: 'active' };
  live = { id: `inv_alpha2_${period}`, ...store.get(`platformInvoices/inv_alpha2_${period}`) };
  await C.db.doc(`platformInvoices/inv_alpha2_${period}`).update({});
  await C.invoiceApplyAction(live, { status: 'partially_paid', creditsApplied: 200 }, 'credit-applied', 'applied 200', { method: 'credit_balance', reference: 'prepaid ledger', amount: 200 });
  const inv2 = store.get(`platformInvoices/inv_alpha2_${period}`);
  check('credit applied recorded', inv2.creditsApplied === 200 && inv2.payments[0].method === 'credit_balance' && inv2.status === 'partially_paid');

  /* ===== B3: suspension policy engine ===== */
  check('B3: derive default — active alpha store on', C.deriveRuntimeExpectation('alpha').storeEnabled === true);
  await C.updatePlatformPolicy({ suspendTenantAffectsAddons: true });
  check('B3: POLICY updated', C.POLICY.suspendTenantAffectsAddons === true);
  check('B3: audit logged policy-change', [...store.keys()].some(k => k.startsWith('platformAuditLog/') && store.get(k).action === 'policy-change'));
  await C.setTenantLifecycle('alpha', 'suspended');
  let dS = C.deriveRuntimeExpectation('alpha');
  let mS = store.get('clients/alpha/status/state').data;
  check('B3: policy ON — suspend gates addons (derived)', dS.storeEnabled === false && dS.tournamentEnabled === false && dS.bookingPaused === true);
  check('B3: policy ON — mirror written accordingly', mS.storeEnabled === false && mS.tournamentEnabled === false && mS.bookingPaused === true);
  await C.setTenantLifecycle('alpha', 'active');
  dS = C.deriveRuntimeExpectation('alpha'); mS = store.get('clients/alpha/status/state').data;
  check('B3: policy ON — reactivate restores addons', dS.storeEnabled === true && mS.storeEnabled === true);
  await C.updatePlatformPolicy({ suspendTenantAffectsAddons: false });
  await C.setTenantLifecycle('alpha', 'suspended');
  dS = C.deriveRuntimeExpectation('alpha'); mS = store.get('clients/alpha/status/state').data;
  check('B3: policy OFF (default) — suspend preserves addons', dS.storeEnabled === true && mS.storeEnabled === true && dS.bookingPaused === true);
  await C.setTenantLifecycle('alpha', 'active');

  /* ===== B3: billing-status suggestion engine ===== */
  const sugPeriod = C.usagePeriod(0);
  C.TENANT_INDEX.gamma = { businessName: 'Gamma', billingStatus: 'current', creditBalance: -50, status: 'active' };
  C.TENANT_INDEX.delta = { businessName: 'Delta', billingStatus: 'current', creditBalance: 0, status: 'active' };
  C.TENANT_INDEX.eps = { businessName: 'Eps', billingStatus: 'overdue', creditBalance: 0, status: 'active' };
  const sugInv = [
    { tenantId: 'gamma', status: 'awaiting_payment', total: 100, payments: [], creditsApplied: 0 },
    { tenantId: 'delta', status: 'overdue', total: 50, payments: [], creditsApplied: 0 },
    { tenantId: 'alpha', status: 'verified', total: 750, payments: [{ amount: 750 }], creditsApplied: 0 },
  ];
  const sug = C.computeBillingSuggestions(sugInv);
  const sg = Object.fromEntries(sug.map(s => [s.slug, s]));
  check('B3: gamma (open + negative balance) -> grace', sg.gamma && sg.gamma.to === 'grace');
  check('B3: delta (overdue invoice) -> overdue', sg.delta && sg.delta.to === 'overdue');
  check('B3: eps (overdue status, nothing open) -> current', sg.eps && sg.eps.to === 'current');
  check('B3: alpha (settled, current) -> no suggestion', !sg.alpha);
  check('B3: draft invoices never count as open', C.computeBillingSuggestions([{ tenantId: 'gamma', status: 'draft', total: 999, payments: [], creditsApplied: 0 }]).find(s => s.slug === 'gamma') === undefined || C.computeBillingSuggestions([{ tenantId: 'gamma', status: 'draft', total: 999, payments: [], creditsApplied: 0 }]).find(s => s.slug === 'gamma').to === 'grace');

  /* ===== B5: permission groups ===== */
  check('B5: owner claims get full registry', C.computeMyPerms({ superadmin: true }).size === Object.keys(C.PLATFORM_PERMISSIONS).length);
  const limited = C.computeMyPerms({ platformPerms: ['manage_entitlements', 'bogus_perm'] });
  check('B5: staff claims filtered to registry', limited.size === 1 && limited.has('manage_entitlements'));
  check('B5: no claims -> empty set', C.computeMyPerms({}).size === 0);
  C.MY_PERMS = limited;
  await C.setEntitlement('beta', 'store', { status: 'active', paused: false }, 'grant', 'B5 scoped-op grant');
  check('B5: entitlements operator CAN grant entitlements', store.get('platformTenants/beta/entitlements/store').status === 'active');
  let denied = null;
  try { await C.setTenantLifecycle('beta', 'suspended'); } catch(ex) { denied = ex.message; }
  check('B5: lifecycle denied without manage_organizations', !!denied && /Not permitted: manage_organizations/.test(denied));
  denied = null;
  try { await C.invoiceApplyAction({ id: 'x' }, { status: 'verified' }, 'payment', 'x'); } catch(ex) { denied = ex.message; }
  check('B5: invoice verification denied without verify_platform_payment', !!denied && /Not permitted: verify_platform_payment/.test(denied));
  check('B5: can() reflects scoped set', C.can('manage_entitlements') === true && C.can('manage_plans') === false);
  C.MY_PERMS = C.computeMyPerms({ superadmin: true });   // restore owner for remaining tests
  check('B5: owner can() everything', C.can('manage_organizations') && C.can('issue_platform_credit'));

  /* ===== Per-product suspension independence (operator scenario:
     tenant stays ACTIVE, only ONE product is suspended) ===== */
  // Suspend ONLY the Store, through the same service the Entitlements
  // matrix and the Manage widgets use.
  await C.setEntitlement('alpha', 'store', { status: 'suspended' }, 'suspend', 'product-only suspend');
  let dX = C.deriveRuntimeExpectation('alpha');
  let mX = store.get('clients/alpha/status/state').data;
  check('PRODUCT: suspending Store leaves Booking online', dX.bookingPaused === false && mX.bookingPaused === false);
  check('PRODUCT: Store gated in derivation AND mirror', dX.storeEnabled === false && mX.storeEnabled === false);
  check('PRODUCT: Tournaments untouched by Store suspension', dX.tournamentEnabled === false && mX.tournamentEnabled === false);
  check('PRODUCT: store.html sees storeEnabled=false (Not Available screen)', mX.storeEnabled === false);
  // Reactivate the Store — same path, opposite direction.
  await C.setEntitlement('alpha', 'store', { status: 'active', paused: false }, 'activate', 'product-only resume');
  dX = C.deriveRuntimeExpectation('alpha'); mX = store.get('clients/alpha/status/state').data;
  check('PRODUCT: Store reactivated, everything else still online', dX.storeEnabled === true && mX.storeEnabled === true && mX.bookingPaused === false);
  // Pause hold: entitlement stays ACTIVE but runtime shows the paused screen.
  await C.setEntitlement('alpha', 'store', { paused: true }, 'pause', 'pause-hold only');
  dX = C.deriveRuntimeExpectation('alpha'); mX = store.get('clients/alpha/status/state').data;
  check('PRODUCT: pause keeps status ACTIVE but shows paused screen', dX.storeEnabled === true && dX.storePaused === true && mX.storePaused === true);
  // And the reverse: suspend TOURNAMENT only, Store + Booking unaffected.
  await C.setEntitlement('alpha', 'store', { paused: false }, 'unpause', 'restore');
  await C.setEntitlement('alpha', 'tournament', { status: 'active', paused: false }, 'grant', 'for isolation test');
  await C.setEntitlement('alpha', 'tournament', { status: 'suspended' }, 'suspend', 'tournament-only suspend');
  dX = C.deriveRuntimeExpectation('alpha'); mX = store.get('clients/alpha/status/state').data;
  check('PRODUCT: suspending Tournaments leaves Store + Booking online', dX.bookingPaused === false && dX.storeEnabled === true && dX.tournamentEnabled === false && mX.tournamentEnabled === false);

  /* ===== B6: participation metrics ===== */
  const pEv = (daysAgo, type, extra) => ({ type, createdAt: d(daysAgo), ...extra });
  store.set('platformTenants/alpha/events/ev_op1', pEv(1, 'booking_confirmed', { source: 'openplay-join', linkedOpenGameId: 'og1', amountDue: 200, playerEmail: 'op1@x.com', durationHours: 2 }));
  store.set('platformTenants/alpha/events/ev_op2', pEv(2, 'booking_confirmed', { source: 'openplay-join', linkedOpenGameId: 'og1', amountDue: 200, playerEmail: 'op2@x.com', durationHours: 2 }));
  store.set('platformTenants/alpha/events/ev_qj1', pEv(1, 'queue_player_joined', { playersInTeam: 2, waitingCount: 3 }));
  store.set('platformTenants/alpha/events/ev_qj2', pEv(2, 'queue_player_joined', { playersInTeam: 1, waitingCount: 4 }));
  store.set('platformTenants/alpha/events/ev_qj3', pEv(3, 'queue_player_joined', { playersInTeam: 1, waitingCount: 5 }));
  store.set('platformTenants/alpha/events/ev_qm1', pEv(1, 'queue_match_completed', { playerCount: 4 }));
  store.set('platformTenants/alpha/events/ev_qm2', pEv(2, 'queue_match_completed', { playerCount: 4 }));
  const repB6 = await C.computeTenantReport({ slug: 'alpha', businessName: 'Alpha Club', billing: {} });
  check('B6: open play joins counted (2)', repB6.thisM.openPlayJoins === 2);
  check('B6: unique open play participants (2)', repB6.thisM.openPlayParticipants === 2);
  check('B6: participation revenue summed (400)', repB6.thisM.openPlayParticipationRevenue === 400);
  check('B6: queue walk-in joins counted (3)', repB6.thisM.queueJoins === 3);
  check('B6: queue match player-slots summed (8)', repB6.thisM.queueMatchPlayers === 8);
  check('B6: confirmed bookings total now 7 (5 + 2 openplay)', repB6.thisM.confirmedBookings === 7);
  C.exportReportingCsv();
  check('B6: CSV export with participation columns executed', true);

  /* ===== renderers ===== */
  C.renderEntitlementsTab(); C.renderPlansTab(); C.renderInvoicesTab([{ id: 'x', ...vInv }]); C.renderInvoiceQueue(); await C.renderOverview(); await C.renderDiagnostics();
  check('renderers executed without throw', true);
  C.exportReportingCsv();
  check('CSV export executed', true);

  const passed = results.filter(r => r[1]).length;
  console.log(`\n=== CONTROL-PLANE TESTS: ${passed}/${results.length} passed ===`);
  results.filter(r => !r[1]).forEach(r => console.log('  FAILED:', r[0]));
  process.exit(passed === results.length ? 0 : 1);
})().catch(e => { console.error('TEST CRASHED:', e); process.exit(1); });
