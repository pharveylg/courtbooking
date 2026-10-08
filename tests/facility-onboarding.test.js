/* Facility self-service onboarding -- createFacility and publishFacility,
   the two Cloud Functions behind onboarding.html, plus (Phase B) its entry
   point on picker.html. See FACILITY_ONBOARDING_PROPOSAL.md section 11.

   Integration test against the same in-memory Firestore double the
   tournament callables use, so Firestore-writing logic gets real
   coverage instead of just regex wiring checks. Usage:
   node tests/facility-onboarding.test.js */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { store, fakeDb, installMocks } = require('./helpers/fakeFirestore');
installMocks();
const fns = require(path.join(__dirname, '..', 'functions', 'index.js'));
const pickerHtml = fs.readFileSync(path.join(__dirname, '..', 'picker.html'), 'utf8');
const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const onboardingHtml = fs.readFileSync(path.join(__dirname, '..', 'onboarding.html'), 'utf8');

let passed = 0, failed = 0;
function check(name, ok, detail) { if (ok) passed++; else { failed++; console.log(`  FAIL: ${name}${detail ? ' -- ' + detail : ''}`); } }
const section = (t) => console.log(`\n${t}`);

const OWNER = { uid: 'owner-1', token: { email: 'owner@example.com' } };
const OTHER = { uid: 'owner-2', token: { email: 'other@example.com' } };
const hashPin = (pin) => crypto.createHash('sha256').update(pin + 'picklecourt-salt-2024').digest('hex');
// Every createFacility test spreads this in, then overrides only what it's testing --
// keeps the new required fields (courtCount, hourlyRate) from bloating every call site.
const BASE = { slug: 'riverside', businessName: 'Riverside Courts', pin: '4321', courtCount: 1, hourlyRate: 350 };
async function expectError(promise, code) {
  try { await promise; return null; }
  catch (e) { return e.code === code ? e : Object.assign(new Error('wrong error: ' + e.code + ' ' + e.message), { wrong: true }); }
}
const doc = async (p) => (await fakeDb.doc(p).get()).data();
const auditLog = async () => (await fakeDb.collection('platformAuditLog').get()).docs.map((d) => d.data());

async function run() {

section('createFacility -- requires auth');
{
  store.clear();
  const err = await expectError(fns.createFacility({ data: BASE }), 'unauthenticated');
  check('no request.auth -> unauthenticated', err && !err.wrong, err && err.message);
}

section('createFacility -- input validation');
{
  store.clear();
  let err = await expectError(fns.createFacility({ auth: OWNER, data: { ...BASE, slug: 'Not Valid!' } }), 'invalid-argument');
  check('invalid slug -> invalid-argument', err && !err.wrong, err && err.message);
  err = await expectError(fns.createFacility({ auth: OWNER, data: { ...BASE, businessName: undefined } }), 'invalid-argument');
  check('missing businessName -> invalid-argument', err && !err.wrong, err && err.message);
  err = await expectError(fns.createFacility({ auth: OWNER, data: { ...BASE, pin: undefined } }), 'invalid-argument');
  check('missing pin -> invalid-argument', err && !err.wrong, err && err.message);
  err = await expectError(fns.createFacility({ auth: OWNER, data: { ...BASE, courtCount: 0 } }), 'invalid-argument');
  check('courtCount below 1 -> invalid-argument', err && !err.wrong, err && err.message);
  err = await expectError(fns.createFacility({ auth: OWNER, data: { ...BASE, courtCount: 21 } }), 'invalid-argument');
  check('courtCount above 20 -> invalid-argument', err && !err.wrong, err && err.message);
  err = await expectError(fns.createFacility({ auth: OWNER, data: { ...BASE, courtCount: 2.5 } }), 'invalid-argument');
  check('non-integer courtCount -> invalid-argument', err && !err.wrong, err && err.message);
  err = await expectError(fns.createFacility({ auth: OWNER, data: { ...BASE, hourlyRate: 0 } }), 'invalid-argument');
  check('zero hourlyRate -> invalid-argument (this is the gap that lets a real facility silently inherit the generic placeholder rate)', err && !err.wrong, err && err.message);
  err = await expectError(fns.createFacility({ auth: OWNER, data: { ...BASE, hourlyRate: -50 } }), 'invalid-argument');
  check('negative hourlyRate -> invalid-argument', err && !err.wrong, err && err.message);
  err = await expectError(fns.createFacility({ auth: OWNER, data: { ...BASE, hourlyRate: undefined } }), 'invalid-argument');
  check('missing hourlyRate -> invalid-argument', err && !err.wrong, err && err.message);
}

section('createFacility -- happy path writes the same default doc shapes as superadmin.html provisioning');
{
  store.clear();
  const res = await fns.createFacility({ auth: OWNER, data: { ...BASE, color: '#3B2A9E' } });
  check('returns ok + slug', res && res.ok === true && res.slug === 'riverside');

  const tenant = await doc('platformTenants/riverside');
  check('platformTenants: businessName set', tenant && tenant.businessName === 'Riverside Courts');
  check('platformTenants: theme.primary set from input color', tenant && tenant.theme && tenant.theme.primary === '#3B2A9E');
  check('platformTenants: status active (stays online during provisioning)', tenant && tenant.status === 'active');
  check('platformTenants: lifecycle starts at provisioning (draft)', tenant && tenant.lifecycle === 'provisioning');
  check('platformTenants: ownerUid stamped to the calling user, not client-supplied', tenant && tenant.ownerUid === 'owner-1');
  check('platformTenants: ownerEmail from the auth token', tenant && tenant.ownerEmail === 'owner@example.com');
  check('platformTenants: createdAt stamped', tenant && !!tenant.createdAt);

  check('does NOT write tenantDirectory -- a draft stays off the public picker', (await fakeDb.doc('tenantDirectory/riverside').get()).exists === false);

  const cfg = await doc('clients/riverside/config/state');
  check('config: business name', cfg && cfg.data.business.name === 'Riverside Courts');
  check('config: monogram derived from name', cfg && cfg.data.branding.monogram === 'RI');
  check('config: theme primary + darkened hover, same formula as superadmin.html', cfg && cfg.data.theme.primary === '#3B2A9E' && /^#[0-9a-f]{6}$/i.test(cfg.data.theme.primaryHover) && cfg.data.theme.primaryHover !== cfg.data.theme.primary);

  const courts = await doc('clients/riverside/courts/state');
  check('courts: seeded with one active court', Array.isArray(courts.data) && courts.data.length === 1 && courts.data[0].active === true);

  const pricing = await doc('clients/riverside/pricing/state');
  check('pricing: seeded so the court never silently inherits the generic placeholder rate', pricing && pricing.data.court1 && pricing.data.court1.default === 350 && JSON.stringify(pricing.data.court1.hours) === '{}');

  const settings = await doc('clients/riverside/settings/state');
  check('settings: PIN hashed with the same algorithm as the browser hashPin', settings && settings.data.pin === hashPin('4321'));
  check('settings: payMethods starts empty', settings && JSON.stringify(settings.data.payMethods) === '{}');

  const bookings = await doc('clients/riverside/bookings/state');
  const openPlay = await doc('clients/riverside/openPlay/state');
  const queues = await doc('clients/riverside/queues/state');
  check('bookings/openPlay/queues seeded empty', Array.isArray(bookings.data) && bookings.data.length === 0 && Array.isArray(openPlay.data) && Array.isArray(queues.data));

  const staffReserve = await doc('clients/riverside/staffReserve/state');
  check('staffReserve starts empty (off by default, not a pre-picked schedule)', staffReserve && JSON.stringify(staffReserve.data) === '{}');

  const log = await auditLog();
  check('writes a platformAuditLog entry for the creation', log.some((e) => e.action === 'create-facility-self-service' && e.slug === 'riverside' && e.actorEmail === 'owner@example.com'));
}

section('createFacility -- multiple courts');
{
  store.clear();
  await fns.createFacility({ auth: OWNER, data: { ...BASE, courtCount: 3, hourlyRate: 400 } });
  const courts = await doc('clients/riverside/courts/state');
  check('seeds courtCount courts, sequentially named/ided', courts.data.length === 3 && courts.data.map((c) => c.id).join(',') === 'court1,court2,court3' && courts.data.every((c) => c.active));
  const pricing = await doc('clients/riverside/pricing/state');
  check('every seeded court gets the same hourly rate -- no court is left on the generic placeholder', ['court1', 'court2', 'court3'].every((id) => pricing.data[id] && pricing.data[id].default === 400));
}

section('createFacility -- a taken slug is rejected, whether registered or organic');
{
  store.clear();
  await fns.createFacility({ auth: OWNER, data: BASE });
  const err1 = await expectError(fns.createFacility({ auth: OTHER, data: { ...BASE, businessName: 'Hijack' } }), 'already-exists');
  check('slug already in platformTenants -> already-exists', err1 && !err1.wrong, err1 && err1.message);

  store.clear();
  await fakeDb.doc('clients/organic-club/config/state').set({ data: { business: { name: 'Organic Club' } } }); // seeded by someone visiting ?client=organic-club, never registered
  const err2 = await expectError(fns.createFacility({ auth: OWNER, data: { ...BASE, slug: 'organic-club', businessName: 'Steal It' } }), 'already-exists');
  check('slug already has organic client data (no platformTenants doc) -> still already-exists', err2 && !err2.wrong, err2 && err2.message);
}

section('publishFacility -- requires auth, valid slug, and an existing facility');
{
  store.clear();
  let err = await expectError(fns.publishFacility({ data: { slug: 'riverside' } }), 'unauthenticated');
  check('no request.auth -> unauthenticated', err && !err.wrong, err && err.message);
  err = await expectError(fns.publishFacility({ auth: OWNER, data: { slug: 'nope-does-not-exist' } }), 'not-found');
  check('unknown slug -> not-found', err && !err.wrong, err && err.message);
}

section('publishFacility -- only the owner can publish');
{
  store.clear();
  await fns.createFacility({ auth: OWNER, data: BASE });
  const err = await expectError(fns.publishFacility({ auth: OTHER, data: { slug: 'riverside' } }), 'permission-denied');
  check('a different signed-in user cannot publish someone else\'s facility', err && !err.wrong, err && err.message);
}

section('publishFacility -- re-checks readiness server-side');
{
  store.clear();
  await fns.createFacility({ auth: OWNER, data: BASE });
  // Defaults already satisfy the readiness bar -- remove the court to prove
  // the server re-checks rather than trusting whatever the client's own
  // checklist last showed.
  await fakeDb.doc('clients/riverside/courts/state').set({ data: [] });
  let err = await expectError(fns.publishFacility({ auth: OWNER, data: { slug: 'riverside' } }), 'failed-precondition');
  check('no active court -> failed-precondition naming what\'s missing', err && !err.wrong && /active court/.test(err.message), err && err.message);
  check('tenantDirectory still not written after a failed publish', (await fakeDb.doc('tenantDirectory/riverside').get()).exists === false);

  store.clear();
  await fns.createFacility({ auth: OWNER, data: BASE });
  // A court added after creation (e.g. via Court Management) has no pricing
  // entry yet -- publish must catch that instead of letting it go live
  // silently on the generic placeholder rate.
  await fakeDb.doc('clients/riverside/courts/state').set({ data: [{ id: 'court1', name: 'Court 1', active: true }, { id: 'court2', name: 'Court 2', active: true }] });
  err = await expectError(fns.publishFacility({ auth: OWNER, data: { slug: 'riverside' } }), 'failed-precondition');
  check('a newly added court with no price set -> failed-precondition naming the gap', err && !err.wrong && /hourly rate/.test(err.message), err && err.message);

  store.clear();
  await fns.createFacility({ auth: OWNER, data: BASE });
  await fakeDb.doc('clients/riverside/pricing/state').set({ data: { court1: { default: 0, hours: {} } } });
  err = await expectError(fns.publishFacility({ auth: OWNER, data: { slug: 'riverside' } }), 'failed-precondition');
  check('a zeroed-out rate also blocks publish', err && !err.wrong && /hourly rate/.test(err.message), err && err.message);
}

section('publishFacility -- happy path makes the facility visible on the picker');
{
  store.clear();
  await fns.createFacility({ auth: OWNER, data: BASE });
  const res = await fns.publishFacility({ auth: OWNER, data: { slug: 'riverside' } });
  check('returns ok + slug', res && res.ok === true && res.slug === 'riverside');

  const dir = await doc('tenantDirectory/riverside');
  check('tenantDirectory written with status active -- this is what picker.html queries', dir && dir.businessName === 'Riverside Courts' && dir.status === 'active');

  const tenant = await doc('platformTenants/riverside');
  check('platformTenants lifecycle moves out of provisioning on publish', tenant && tenant.lifecycle === 'trial');
  check('platformTenants gets a publishedAt stamp', tenant && !!tenant.publishedAt);

  const log = await auditLog();
  check('writes a platformAuditLog entry for the publish', log.some((e) => e.action === 'publish-facility' && e.slug === 'riverside'));
}

section('publishFacility -- self-serve billing: no self-serve plan configured');
{
  store.clear();
  await fns.createFacility({ auth: OWNER, data: BASE });
  const res = await fns.publishFacility({ auth: OWNER, data: { slug: 'riverside' } });
  check('publish still succeeds with no platformSettings/selfServe configured', res.ok === true);
  const tenant = await doc('platformTenants/riverside');
  check('no subscription/billing stamped when there is nothing to assign', !tenant.subscription && !tenant.billing);
  check('no invoice raised', (await fakeDb.doc('platformInvoices/inv_riverside_onboarding').get()).exists === false);
}

section('publishFacility -- self-serve billing: plan configured with onboarding fee + store + tournament');
{
  store.clear();
  await fakeDb.doc('platformPlans/self-serve-standard').set({
    name: 'Self-Serve Standard', monthlyBase: 0, includedBookings: 30, perBookingRate: 12, maxCourts: 0,
    addonFees: { store: 150, tournament: 150 }, products: ['booking', 'store', 'tournament'],
    onboardingFee: 1500, pricingVersion: '2026-10',
  });
  await fakeDb.doc('platformSettings/selfServe').set({ defaultPlanId: 'self-serve-standard' });
  await fns.createFacility({ auth: OWNER, data: BASE });
  const res = await fns.publishFacility({ auth: OWNER, data: { slug: 'riverside' } });
  check('publish still succeeds', res.ok === true);

  const tenant = await doc('platformTenants/riverside');
  check('subscription stamped from the self-serve plan', tenant.subscription && tenant.subscription.planId === 'self-serve-standard' && tenant.subscription.planName === 'Self-Serve Standard' && tenant.subscription.pricingVersion === '2026-10');
  check('billing formula matches the plan -- this is the recurring fee based on successful checkouts (per-booking rate over a free allowance)', tenant.billing && tenant.billing.baseFee === 0 && tenant.billing.freeBookings === 30 && tenant.billing.perBookingRate === 12);

  const storeEnt = await doc('platformTenants/riverside/entitlements/store');
  const tournEnt = await doc('platformTenants/riverside/entitlements/tournament');
  check('store entitlement granted, trial status, same shape setEntitlement writes', storeEnt && storeEnt.status === 'trial' && storeEnt.paused === false && Array.isArray(storeEnt.history) && storeEnt.history.length === 1);
  check('tournament entitlement granted identically -- "just like tournament" cuts both ways', tournEnt && tournEnt.status === 'trial' && tournEnt.paused === false);
  check('booking gets no explicit entitlement doc -- its runtime gate is derived from lifecycle alone, same as an organic tenant', (await fakeDb.doc('platformTenants/riverside/entitlements/booking').get()).exists === false);

  const status = await doc('clients/riverside/status/state');
  check('runtime mirror enables both products immediately (lifecycle is trial, which is always online)', status.data.storeEnabled === true && status.data.storePaused === false && status.data.tournamentEnabled === true && status.data.tournamentPaused === false && status.data.bookingPaused === false);

  const invoice = await doc('platformInvoices/inv_riverside_onboarding');
  check('one-time onboarding invoice raised as a draft, reusing the exact invoice doc shape generateDraftInvoices writes', invoice && invoice.status === 'draft' && invoice.total === 1500 && invoice.lines.length === 1 && invoice.lines[0].sourceType === 'onboarding_fee' && invoice.lines[0].amount === 1500);
  check('invoice id never collides with the monthly inv_{slug}_{YYYY-MM} scheme', invoice && !/^\d{4}-\d{2}$/.test('onboarding'));

  const log = await auditLog();
  check('audit entry notes the plan assignment', log.some((e) => e.action === 'publish-facility' && /self-serve plan "Self-Serve Standard"/.test(e.details) && /store \+ tournament/.test(e.details)));
}

section('publishFacility -- self-serve billing: zero onboarding fee raises no invoice');
{
  store.clear();
  await fakeDb.doc('platformPlans/self-serve-free').set({ name: 'Self-Serve Free', monthlyBase: 0, includedBookings: 20, perBookingRate: 5, addonFees: {}, products: ['booking'], onboardingFee: 0, pricingVersion: '2026-10' });
  await fakeDb.doc('platformSettings/selfServe').set({ defaultPlanId: 'self-serve-free' });
  await fns.createFacility({ auth: OWNER, data: BASE });
  await fns.publishFacility({ auth: OWNER, data: { slug: 'riverside' } });
  check('no invoice when onboardingFee is 0', (await fakeDb.doc('platformInvoices/inv_riverside_onboarding').get()).exists === false);
  check('no entitlements granted when the plan only includes booking', (await fakeDb.doc('platformTenants/riverside/entitlements/store').get()).exists === false && (await fakeDb.doc('platformTenants/riverside/entitlements/tournament').get()).exists === false);
  const status = await doc('clients/riverside/status/state');
  check('runtime mirror still written, both add-ons off', status.data.storeEnabled === false && status.data.tournamentEnabled === false);
}

section('publishFacility -- self-serve billing: publishing twice never double-charges the onboarding fee');
{
  store.clear();
  await fakeDb.doc('platformPlans/self-serve-standard').set({ name: 'Self-Serve Standard', monthlyBase: 0, includedBookings: 30, perBookingRate: 12, addonFees: {}, products: ['booking'], onboardingFee: 1500, pricingVersion: '2026-10' });
  await fakeDb.doc('platformSettings/selfServe').set({ defaultPlanId: 'self-serve-standard' });
  await fns.createFacility({ auth: OWNER, data: BASE });
  await fns.publishFacility({ auth: OWNER, data: { slug: 'riverside' } });
  // publishFacility itself only runs once in the real flow (tenantDirectory write
  // would already mark it published), but the billing step is defensively
  // idempotent in case it's ever re-triggered.
  await fns.publishFacility({ auth: OWNER, data: { slug: 'riverside' } });
  const invoiceSnap = await fakeDb.collection('platformInvoices').where('tenantId', '==', 'riverside').get();
  check('still exactly one onboarding invoice after a second publish call', invoiceSnap.docs.length === 1);
}

section('publishFacility -- self-serve billing: staff-provisioned tenants are never touched');
{
  store.clear();
  await fakeDb.doc('platformPlans/self-serve-standard').set({ name: 'Self-Serve Standard', monthlyBase: 0, includedBookings: 30, perBookingRate: 12, addonFees: {}, products: ['booking', 'store'], onboardingFee: 1500, pricingVersion: '2026-10' });
  await fakeDb.doc('platformSettings/selfServe').set({ defaultPlanId: 'self-serve-standard' });
  // Simulate a staff-provisioned tenant reaching publishFacility by direct
  // call (not a real path through the UI, but proves the source check holds
  // even if it were ever invoked) -- no 'source' field at all, same as every
  // tenant created before this feature existed.
  await fakeDb.doc(`platformTenants/riverside`).set({ businessName: 'Riverside Courts', status: 'active', lifecycle: 'provisioning', ownerUid: OWNER.uid, ownerEmail: OWNER.token.email, createdAt: null });
  await fakeDb.doc('clients/riverside/config/state').set({ data: { business: { name: 'Riverside Courts' } } });
  await fakeDb.doc('clients/riverside/courts/state').set({ data: [{ id: 'court1', active: true }] });
  await fakeDb.doc('clients/riverside/pricing/state').set({ data: { court1: { default: 300, hours: {} } } });
  await fakeDb.doc('clients/riverside/settings/state').set({ data: { pin: 'x' } });
  await fns.publishFacility({ auth: OWNER, data: { slug: 'riverside' } });
  const tenant = await doc('platformTenants/riverside');
  check('no subscription/billing stamped for a non self-serve tenant', !tenant.subscription && !tenant.billing);
  check('no onboarding invoice for a non self-serve tenant', (await fakeDb.doc('platformInvoices/inv_riverside_onboarding').get()).exists === false);
}

section('Phase B -- entry point on picker.html');
check('picker.html links to /onboarding.html', /href="\/onboarding\.html"/.test(pickerHtml));
check('the link sits right below the search field, above Walk-in Queue', (() => {
  const searchWrapOpen = pickerHtml.indexOf('id="searchWrap"');
  const searchWrapEnd = pickerHtml.indexOf('</div>', searchWrapOpen);
  const queueStart = pickerHtml.indexOf('id="walkinQueueSection"');
  const i = pickerHtml.indexOf('class="owner-link');
  return searchWrapOpen !== -1 && searchWrapEnd !== -1 && queueStart !== -1 && i !== -1 && i > searchWrapEnd && i < queueStart;
})());
check('always visible, independent of facility load state -- not inside <footer>, not toggled by showState()', (() => {
  const i = pickerHtml.indexOf('class="owner-link');
  const footerStart = pickerHtml.indexOf('<footer');
  // showState() only ever toggles stateLoading/stateError/stateEmpty/gridSection/
  // continueSection/myMatchesSection/searchWrap -- the owner link isn't in that
  // list (no id of its own for JS to reach), so it's always rendered, same as
  // the Walk-in Queue entry point right below it.
  return i !== -1 && footerStart !== -1 && i < footerStart && !/id="ownerLink"/.test(pickerHtml);
})());
check('copy reads exactly "Own a facility? Set it up yourself."', pickerHtml.includes('Own a facility? Set it up yourself.'));

section('Admin Console -- location, contact, logo, and poster are all self-service (not staff-only)');
check('Business & Contact already covers address, phone, email, and socials -- this existed before, the gap was never telling owners about it', /id="bizAddressInput"/.test(indexHtml) && /id="bizPhoneInput"/.test(indexHtml) && /id="bizEmailInput"/.test(indexHtml) && /id="bizFacebookInput"/.test(indexHtml));
check('map pin is settable without typing coordinates (current location or a pasted Maps link)', /id="bizUseLocationBtn"/.test(indexHtml) && /id="bizMapLinkInput"/.test(indexHtml));
check('Logo upload already existed and is unaffected', /id="logoUploadBtn"/.test(indexHtml) && /id="logoRemoveBtn"/.test(indexHtml));
check('Poster upload is new -- the real gap: no self-service way to set the hero watermark before this', /id="posterUploadBtn"/.test(indexHtml) && /id="posterRemoveBtn"/.test(indexHtml) && /id="posterFileInput"/.test(indexHtml));
check('poster upload goes to Firebase Storage (clients/{id}/branding/...), not a data URL in Firestore -- same path shape superadmin’s own watermark upload already uses, so a self-serve poster behaves identically to a staff-set one', /clients\/\$\{currentClientId\}\/branding\/watermark_/.test(indexHtml) && /fbStorage\.ref\(path\)/.test(indexHtml));
check('poster writes to branding.watermarkUrl, which index.html already renders behind the hero -- wiring a new writer onto an existing reader, not inventing a new field', /watermarkUrl:\s*url/.test(indexHtml) && /br\.watermarkUrl/.test(indexHtml));
check('poster upload is capped (2MB) and requires a tenant context, same defensive posture as every other upload in this file', /file\.size > 2 \* 1024 \* 1024/.test(indexHtml) && /Poster upload requires a tenant/.test(indexHtml));

section('onboarding.html checklist -- points new owners at branding/location/contact, not just payments and hours');
check('a "branding" item is in the Recommended list, linking to the Branding & Site Settings tab', /key:\s*'branding'/.test(onboardingHtml) && /tab:\s*'Branding & Site Settings'/.test(onboardingHtml));
check('readiness is computed from the config doc already being read for this screen -- no extra Firestore round trip needed', /branding\.logoUrl \|\| branding\.watermarkUrl \|\| contact\.address \|\| contact\.phone \|\| contact\.email/.test(onboardingHtml));

section('onboarding.html -- Open Admin Console unlocks the PIN gate instead of just linking to the lock screen');
check('"Open Admin Console" is a PIN form now, not a plain link', /id="adminUnlockForm"/.test(onboardingHtml) && /id="adminUnlockPin"/.test(onboardingHtml) && /Unlock &amp;/.test(onboardingHtml));
check('the per-item "Open {tab}" deep links (Payment QR, Operating Hours, Branding) are untouched -- still plain manual links, only the primary CTA changed', /href="\$\{adminUrl\}" target="_blank" rel="noopener" style="color:inherit">Open \$\{esc\(item\.tab\)\}/.test(onboardingHtml));
check('hashes the entered PIN with the exact same algorithm (SHA-256 + picklecourt-salt-2024) createFacility hashes it with server-side', /hashOnboardingPin/.test(onboardingHtml) && /pin \+ 'picklecourt-salt-2024'/.test(onboardingHtml));
check('re-reads settings/state fresh rather than trusting a cached value -- the PIN could have just been changed from inside Admin Console itself', /settingsSnap\.data\(\)\?\.data\?\.pin/.test(onboardingHtml));
check('never compares against a falsy/missing stored hash (a tenant with no PIN set must not "match" an empty input)', /storedHash && inputHash === storedHash/.test(onboardingHtml));
check('on a match, pre-sets the EXACT sessionStorage key index.html’s own PIN gate reads (lsKey(\'cb_admin_unlocked_v7\') = `${base}_${clientId}`) -- so landing on #admin skips that gate entirely', /sessionStorage\.setItem\('cb_admin_unlocked_v7_' \+ slug, 'true'\)/.test(onboardingHtml));
check('navigates same-tab (window.location.href), not target=_blank -- sessionStorage set here is not reliably inherited by a new tab opened with rel="noopener"', /window\.location\.href = adminUrl \+ '#admin'/.test(onboardingHtml));
check('a wrong PIN shows an inline error and re-enables the button instead of silently failing or locking the owner out', /That PIN doesn.t match/.test(onboardingHtml) && /btn\.disabled = false/.test(onboardingHtml));

section('index.html -- confirms the sessionStorage key format onboarding.html must match exactly');
check('lsKey() appends the client id to the base key (cb_admin_unlocked_v7_{clientId}), read at page load before any Admin click', /function lsKey\(baseKey\)\s*\{\s*return currentClientId \? `\$\{baseKey\}_\$\{currentClientId\}` : baseKey;/.test(indexHtml));
check('adminUnlocked is initialized straight from that sessionStorage key on load -- a pre-set flag is honored with no extra click', /let adminUnlocked = sessionStorage\.getItem\(LS\.adminUnlocked\) === 'true'/.test(indexHtml));
check('currentClientId is resolved from ?client= before adminUnlocked is read, so the key is tenant-scoped from the very first read, not just after a manual unlock', (() => {
  const clientIdx = indexHtml.indexOf('let currentClientId = getCurrentTenant()');
  const unlockedIdx = indexHtml.indexOf("let adminUnlocked = sessionStorage.getItem(LS.adminUnlocked)");
  return clientIdx > -1 && unlockedIdx > -1 && clientIdx < unlockedIdx;
})());
check('#admin in the URL hash is honored on load via routeTo(), which re-checks adminUnlocked and skips the PIN modal when already true', /if\(location\.hash && location\.hash !== '#home'\) setTimeout\(\(\) => routeTo\(location\.hash\.slice\(1\), true\), 350\);/.test(indexHtml));

console.log(`\n=== FACILITY ONBOARDING: ${passed}/${passed + failed} passed ===`);
process.exit(failed === 0 ? 0 : 1);
}

run();
