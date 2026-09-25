/* Staff / superadmin Google sign-in -- a SCAFFOLD, off by default. The PIN
   stays the only way into Admin, Store and Tournaments while testing.
   Usage: node tests/staff-auth.test.js */
const fs = require('fs');
const path = require('path');
const StaffAuth = require('../staff-auth.js');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const indexHtml = read('index.html'), superHtml = read('superadmin.html'), storeHtml = read('store.html'), tAdminHtml = read('tournament-admin.html'), tournamentHtml = read('tournament.html'), swJs = read('sw.js'), authJs = read('staff-auth.js');

let passed = 0, failed = 0;
function check(name, ok, detail) { if (ok) passed++; else { failed++; console.log(`  FAIL: ${name}${detail ? ' -- ' + detail : ''}`); } }
const section = (t) => console.log(`\n${t}`);

section('the scaffold is off by default');
check('the go-live switch ships OFF', StaffAuth.STAFF_GOOGLE_ENABLED === false);
check('with the switch off and no override, no Google button is shown', !StaffAuth.googleUiEnabled(false, '') && !StaffAuth.googleUiEnabled(false, '?client=demo'));
check('?staffgoogle=1 reveals the button for trying it out (and nothing else)', StaffAuth.googleUiEnabled(false, '?staffgoogle=1') && StaffAuth.googleUiEnabled(false, '?client=demo&staffgoogle=1'));
check('a near-miss param does not count', !StaffAuth.googleUiEnabled(false, '?staffgoogle=10') && !StaffAuth.googleUiEnabled(false, '?xstaffgoogle=1'));
check('flipping the switch shows it everywhere', StaffAuth.googleUiEnabled(true, ''));

section('accessDecision -- PIN today, Google later, one place to change it');
check("mode 'pin': only the PIN counts (Google is ignored even if verified)", StaffAuth.accessDecision({ mode: 'pin', pinOk: true, googleStaff: false }) && !StaffAuth.accessDecision({ mode: 'pin', pinOk: false, googleStaff: true }));
check("mode 'pin-or-google': either one unlocks", StaffAuth.accessDecision({ mode: 'pin-or-google', pinOk: true, googleStaff: false }) && StaffAuth.accessDecision({ mode: 'pin-or-google', pinOk: false, googleStaff: true }) && !StaffAuth.accessDecision({ mode: 'pin-or-google', pinOk: false, googleStaff: false }));
check("mode 'google' (go-live end state): the PIN no longer opens anything", StaffAuth.accessDecision({ mode: 'google', pinOk: false, googleStaff: true }) && !StaffAuth.accessDecision({ mode: 'google', pinOk: true, googleStaff: false }));
check('an unknown / missing mode falls back to PIN-only (fail closed to today\'s behavior)', StaffAuth.accessDecision({ mode: 'bogus', pinOk: true }) && !StaffAuth.accessDecision({ mode: undefined, pinOk: false, googleStaff: true }));

section('who counts as Google staff');
{
  const g = (o = {}) => ({ providerData: [{ providerId: 'google.com' }], email: 'Coach@Club.com', emailVerified: true, ...o });
  const list = ['coach@club.com', ' Owner@Club.com '];
  check('emails compare case-insensitively and ignore padding', StaffAuth.isStaffEmail('COACH@club.com', list) && StaffAuth.isStaffEmail('owner@club.com', list));
  check('an email not on the list is not staff; blank never matches', !StaffAuth.isStaffEmail('x@y.com', list) && !StaffAuth.isStaffEmail('', list) && !StaffAuth.isStaffEmail('a@b.com', null));
  check('a verified Google account on the list is staff', StaffAuth.googleStaffFrom(g(), list));
  check('a Google account NOT on the list is not staff', !StaffAuth.googleStaffFrom(g({ email: 'random@x.com' }), list));
  check('an email/password account with a listed email is NOT staff (only verified Google identities count)', !StaffAuth.googleStaffFrom(g({ providerData: [{ providerId: 'password' }] }), list));
  check('an unverified email is not staff', !StaffAuth.googleStaffFrom(g({ emailVerified: false }), list));
  check('no user -> not staff', !StaffAuth.googleStaffFrom(null, list));
}

section('wiring: PINs stay the gate');
check('the facility Admin modal still verifies the PIN through the decision helper in PIN-only mode', /StaffAuth\.accessDecision\(\{ mode: 'pin', pinOk: await verifyAdminPin\(pin\) \}\)/.test(indexHtml));
check('the unlock steps were extracted, not changed, so PIN and Google share one path', /function unlockStaffMode\(\)\{[^]*?adminUnlocked = true;[^]*?updateAdminTabsVisibility\(\);/.test(indexHtml));
check('the Google button in Admin is hidden markup unless StaffAuth is on', /id="staffGoogleWrap" class="hidden/.test(indexHtml) && /if\(StaffAuth\.uiEnabled\(\) && fbAuth\)\{/.test(indexHtml));
check("when shown it is an additional path ('pin-or-google') gated on the allow-list result", /mode: 'pin-or-google', pinOk: false, googleStaff: r\.allowed/.test(indexHtml));
check('a Google account off the list is told to use the PIN', /isn't on this facility's staff list\. Use the PIN instead\./.test(indexHtml));
check('Store, Tournament Admin and the public Tournament page are untouched -- still PIN only, no StaffAuth', ![storeHtml, tAdminHtml, tournamentHtml].some((h) => /StaffAuth|staff-auth\.js/.test(h)));
check('Find a Game creation is untouched (no staff auth involved)', !/StaffAuth[^]{0,400}ogCreateForm|ogCreateForm[^]{0,400}StaffAuth/.test(indexHtml));

section('wiring: superadmin');
check('superadmin login gets a hidden Google option, shown only when StaffAuth is on', /id="saGoogleWrap" class="hidden/.test(superHtml) && /if\(StaffAuth\.uiEnabled\(\)\)\{/.test(superHtml));
check('authorization there is unchanged: still the superadmin / platformPerms claim, not the sign-in method', /claims\.superadmin === true\) \|\| MY_PERMS\.size > 0/.test(superHtml));
check('email + password sign-in is untouched', /signInWithEmailAndPassword\(email, password\)/.test(superHtml));

section('wiring: shell + honesty about what is not enforced yet');
check('staff-auth.js is precached', /'\/staff-auth\.js'/.test(swJs));
check('the file states plainly that the allow-list needs claims/rules before go-live (settings docs are openly writable today)', /BEFORE GOING LIVE/.test(authJs) && /open\s+per-facility Firestore rule/.test(authJs));

console.log(`\n=== STAFF GOOGLE SIGN-IN (SCAFFOLD): ${passed}/${passed + failed} passed ===`);
process.exit(failed === 0 ? 0 : 1);
