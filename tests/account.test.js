/* The Account page: My Matches as its first tab, plus Profile (name, phone,
   home facility, prefill, delete account) and Notifications. Usage:
   node tests/account.test.js */
const fs = require('fs');
const path = require('path');
const MyAuth = require('../my-auth.js');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const accountHtml = read('account.html'), aliasHtml = read('my-matches.html'), pickerHtml = read('picker.html'), indexHtml = read('index.html'), swJs = read('sw.js'), authJs = read('my-auth.js'), tournamentHtml = read('tournament.html'), rules = read('firestore.rules');

let passed = 0, failed = 0;
function check(name, ok, detail) { if (ok) passed++; else { failed++; console.log(`  FAIL: ${name}${detail ? ' -- ' + detail : ''}`); } }
const section = (t) => console.log(`\n${t}`);
const grab = (src, a, b) => { const i = src.indexOf(a), j = src.indexOf(b, i); if (i < 0 || j < 0) throw new Error('markers not found: ' + a.slice(0, 50)); return src.slice(i, j); };

section('profile helpers (pure)');
{
  const p = MyAuth.normalizeProfile({ name: '  Ana Cruz  ', phone: '0917 123 4567', homeClientId: 'demo', prefill: false });
  check('name is trimmed, phone normalized to the tournament format, home kept, prefill respected', p.name === 'Ana Cruz' && p.phone === '639171234567' && p.homeClientId === 'demo' && p.prefill === false);
  check('prefill defaults ON when unset', MyAuth.normalizeProfile({}).prefill === true && MyAuth.normalizeProfile(null).prefill === true);
  check('only an explicit false turns prefill off', MyAuth.normalizeProfile({ prefill: 0 }).prefill === true && MyAuth.normalizeProfile({ prefill: false }).prefill === false);
  check('a bogus home facility id is dropped, not stored', MyAuth.normalizeProfile({ homeClientId: 'Bad Id!' }).homeClientId === '' && MyAuth.normalizeProfile({ homeClientId: '../x' }).homeClientId === '');
  check('an overlong name is capped', MyAuth.normalizeProfile({ name: 'x'.repeat(200) }).name.length === 80);
  check('an empty phone stays empty', MyAuth.normalizeProfile({ phone: '' }).phone === '');
  check('phone validation accepts real numbers and rejects junk', MyAuth.validPhone('0917 123 4567') && MyAuth.validPhone('+63 917 123 4567') && !MyAuth.validPhone('12345') && !MyAuth.validPhone('abc'));
  check('re-authentication has its own plain-language message', /confirm your sign-in/.test(MyAuth.friendlyError('auth/requires-recent-login')));
  // normalizePhone is duplicated (static pages) -- prove it matches the tournament page's copy.
  const theirs = new Function(grab(tournamentHtml, 'function normalizePhone(raw){', 'return digits;') + 'return digits;\n}\nreturn normalizePhone;')();
  check('phone normalization matches tournament.html exactly, so a saved profile phone finds the same registrations', ['0917 123 4567', '9171234567', '+639171234567', '917-123-4567', '', null].every((x) => MyAuth.normalizePhone(x) === theirs(x)));
}

section('layout: one Account page, My Matches is its first tab');
check('three tabs: Matches, Profile, Notifications', /data-tab="matches"/.test(accountHtml) && /data-tab="profile"/.test(accountHtml) && /data-tab="notifications"/.test(accountHtml));
check('Matches is the default tab and keeps the existing content + note + sign-in bar', /id="pane-matches"/.test(accountHtml) && /id="pageNote"/.test(accountHtml) && /id="accountBar"/.test(accountHtml) && /id="upcomingSection"/.test(accountHtml));
check('the URL hash picks the tab; #signin lands on Matches with the form open', /function tabFromHash\(\)/.test(accountHtml) && /h === 'signin'\) return 'matches'/.test(accountHtml) && /location\.hash === '#signin'/.test(accountHtml));
check('the notification history moved to its own tab (device-local, not synced, and says so)', /id="pane-notifications"/.test(accountHtml) && /Saved on this device only/.test(accountHtml) && /id="inboxSection"/.test(accountHtml));
check('an empty inbox no longer makes the Matches tab look populated', /if \(!upcoming\.length && !tournamentCards\.length\) \{/.test(accountHtml));
check('the old URL still works: my-matches.html forwards to the Account page, keeping query and hash', /location\.replace\('\/account\.html' \+ location\.search \+ location\.hash\)/.test(aliasHtml) && /url=\/account\.html/.test(aliasHtml));
check('root redirect and the picker card now point at the Account page', /_isReturningVisitor\(\) \? '\/account\.html'/.test(indexHtml) && /href="\/account\.html" id="myMatchesCard"/.test(pickerHtml));
check('account.html is precached and the cache version moved on', /'\/account\.html'/.test(swJs) && /courtbooking-v34/.test(swJs));
check("'account' can never be misread as a facility slug", /'my-matches', 'account'\]/.test(indexHtml));

section('service worker: scripts are network-first so a fresh page never runs an old script');
check("our .js files go network-first (cache is only the offline fallback), ahead of the cache-first asset rule", /if \(url\.pathname\.endsWith\('\.js'\)\) \{\s*event\.respondWith\(networkFirst\(request, CACHE_NAME\)\);\s*return;\s*\}[^]*?CSS, images: cache-first/.test(swJs));

section('Profile tab');
check('signed-out visitors get a sign-in prompt instead of the form', /id="profileSignedOut"/.test(accountHtml) && /Sign in to keep a profile/.test(accountHtml));
check('editable name and phone, read-only email, home facility picker, prefill switch', /id="pfName"/.test(accountHtml) && /id="pfPhone"/.test(accountHtml) && /id="pfEmail" readonly/.test(accountHtml) && /id="pfHome"/.test(accountHtml) && /id="pfPrefill"/.test(accountHtml));
check('facility choices come from the public tenantDirectory', /collection\('tenantDirectory'\)\.where\('status', '==', 'active'\)/.test(accountHtml));
check('the phone is validated before saving', /MyAuth\.validPhone\(phone\)/.test(accountHtml));
check('saving goes through MyAuth.saveProfile with all four fields', /MyAuth\.saveProfile\(\{[^}]*name:[^}]*phone,[^}]*homeClientId:[^}]*prefill:/.test(accountHtml));
check('saveProfile writes the account doc, the device cache, and the tournament phone key', /users\/'|userRef\(\)\.set\(\{ profile: next/.test(authJs) && /localStorage\.setItem\(PHONE_LS_KEY, next\.phone\)/.test(authJs) && /writeProfileCache\(next\)/.test(authJs));
check('first sign-in seeds the profile (Google name, device phone) without overwriting an existing one', /normalizeProfile\(Object\.assign\(\{\}, remoteProfile, \{ name: remoteProfile\.name \|\| user\.displayName \|\| '', phone \}\)\)/.test(authJs));
check('the profile cache is removed on sign-out and when signed out, so nothing prefills on a shared device', /api\.signOut = \(\) => \{ clearProfileCache\(\);/.test(authJs) && /if \(!u\) clearProfileCache\(\);/.test(authJs));

section('delete account');
check('the button stays disabled until DELETE is typed exactly', /id="pfDeleteAccount" disabled/.test(accountHtml) && /e\.target\.value\.trim\(\) !== 'DELETE'/.test(accountHtml));
check('deletion removes the account doc first, then the sign-in account', /await userRef\(\)\.delete\(\);\s*try \{ await u\.delete\(\); \}/.test(authJs));
check('a stale login triggers re-authentication and one retry, not a dead end', /requires-recent-login'\) throw e;\s*await api\.reauthenticate\(askPassword\);\s*await u\.delete\(\);/.test(authJs));
check('Google users re-authenticate with the popup; email users are asked for their password', /reauthenticateWithPopup/.test(authJs) && /reauthenticateWithCredential\(firebase\.auth\.EmailAuthProvider\.credential/.test(authJs));
check('cancelling re-authentication says what did and did not happen', /your sign-in account was not deleted \(your saved data was already removed\)/.test(accountHtml));
check('staff sessions can never reach any of this (deleteAccount / saveProfile bail unless a player account)', /api\.deleteAccount = async function \(askPassword\) \{\s*if \(!isPlayer\(\)\) return;/.test(authJs) && /if \(!isPlayer\(\)\) throw new Error\('not signed in'\);/.test(authJs));
check('the account doc rule already covers profile and deletion (owner only, player providers, no staff claims)', /match \/users\/\{uid\}/.test(rules) && /sign_in_provider in \['google\.com', 'password'\]/.test(rules));

section('picker: account chip and home facility');
check('the header carries an account chip: Sign in when signed out, initials + Account when signed in', /id="acctChip" href="\/account\.html#signin"/.test(pickerHtml) && /u \? '\/account\.html#profile' : '\/account\.html#signin'/.test(pickerHtml) && /charAt\(0\)\.toUpperCase\(\)/.test(pickerHtml));
check('the chip is hidden until the first auth event and never shown over a staff session', /id="acctChip"[^>]*style="display:none"/.test(pickerHtml) && /if \(!MyAuth\.canShowAccountUi\(\)\) \{ chip\.style\.display = 'none'; return; \}/.test(pickerHtml));
check('the profile home facility beats "last visited" for the Continue card', /if \(p && p\.homeClientId\) return p\.homeClientId;/.test(pickerHtml));
check('the Continue card re-renders after sync in case the home facility changed', /evt === 'synced' && allTenants\.length\) applySearch\(\)/.test(pickerHtml));

section('prefill on booking and game forms');
check('the profile prefill only applies when switched on and has something to fill', /function profilePrefill\(\)\{[^]*?p\.prefill !== false && \(p\.name \|\| p\.email\)/.test(indexHtml));
check('Create a Game / join flows prefill through ogIdentity, and a remembered device identity always wins', /return pf \? \{ \.\.\.saved, name: saved\.name \|\| pf\.name, email: saved\.email \|\| pf\.email \} : saved;/.test(indexHtml));
check('the booking form falls back to the profile after the last-used contact', /\)\(\) \|\| profilePrefill\(\);/.test(indexHtml));
check('booking and game submissions still validate exactly as before (prefill fills fields, it never skips them)', /Name and email required\./.test(indexHtml) && /Your name and email are required\./.test(indexHtml));

console.log(`\n=== ACCOUNT PAGE: ${passed}/${passed + failed} passed ===`);
process.exit(failed === 0 ? 0 : 1);
