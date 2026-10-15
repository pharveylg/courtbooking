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
check('account.html is precached and the cache version moved on', /'\/account\.html'/.test(swJs) && /courtbooking-v(3[5-9]|[4-9]\d)/.test(swJs));
check("'account' can never be misread as a facility slug", /'my-matches', 'account'\]/.test(indexHtml));

section('service worker: scripts are network-first so a fresh page never runs an old script');
check("our .js files go network-first (cache is only the offline fallback), ahead of the cache-first asset rule", /if \(url\.pathname\.endsWith\('\.js'\)\) \{\s*event\.respondWith\(networkFirst\(request, CACHE_NAME\)\);\s*return;\s*\}[^]*?CSS, images: cache-first/.test(swJs));

section('Google sign-in: never a silent "blink"');
check('a popup that closes within 2 seconds is treated as a failed popup and falls back to the redirect flow', authJs.includes("closedInstantly = code === 'auth/popup-closed-by-user' && Date.now() - started < 2000") && authJs.includes('return api.signInWithGoogleRedirect(started);'));
check('a popup that closes LATER with no sign-in is reported (thrown to the page), never swallowed as a quiet cancel', !authJs.includes("if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return;") && authJs.includes("if (code === 'auth/cancelled-popup-request') return;") && /A popup that closed later[^]*?throw e;/.test(authJs));
check('every Google attempt leaves a breadcrumb trail (popup -> result/code with seconds -> redirect), kept across the redirect', authJs.includes("const TRACE_KEY = 'cb_google_trace'") && authJs.includes("trace('popup')") && authJs.includes("trace('redirect', started)") && authJs.includes('api.trace = '));
check('a failed return from the redirect reports the trail plus site vs auth domain, so a domain mismatch is visible', authJs.includes("returned signed out' + domain") && authJs.includes('firebase.app().options.authDomain'));
check('a failed Google attempt shows the code and trail, and offers a full-page sign-in that skips the popup', accountHtml.includes('MyAuth.trace()') && accountHtml.includes('Try full-page Google sign-in') && accountHtml.includes('MyAuth.signInWithGoogleRedirect()'));
check('the redirect hand-off is remembered so coming back signed-out is reported, not ignored', authJs.includes("sessionStorage.setItem(REDIRECT_FLAG, '1')") && authJs.includes('getRedirectResult()') && authJs.includes("emit('signin-problem')"));
check('the page shows the problem, including the Firebase error code, so it can be diagnosed', accountHtml.includes('signin-problem') && accountHtml.includes("e && e.code ? ' (' + e.code + ')'"));
check('a redirect-return error message survives the re-render race', accountHtml.includes('MyAuth.lastProblem && !MyAuth.currentUser()'));

section('Google sign-in trail stays visible even if the page reloads');
check('a reload in the middle of an attempt is recorded and the trail is dropped once signed in', authJs.includes("if (api.trace()) trace('page loaded');") && authJs.includes('else api.clearTrace();'));
check('the Account page shows "Last Google attempt: ..." on load whenever there is a trail, without needing the error message', accountHtml.includes("Last Google attempt: ' + esc(MyAuth.trace())") && accountHtml.includes('id="traceLine"'));

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

(async () => {
section('Appearance control (Profile tab) -- dark mode preference');
{
  const prof = grab(accountHtml, '<section id="pane-profile"', '<section id="pane-notifications"');
  const app = grab(prof, '<div class="appearance" id="appearance">', 'id="profileSignedOut"');
  check('the Appearance block sits between the <h1> and #profileSignedOut, in the Profile tab', prof.indexOf('<h1>Your profile</h1>') > -1 && prof.indexOf('<h1>Your profile</h1>') < prof.indexOf('id="appearance"') && prof.indexOf('id="appearance"') < prof.indexOf('id="profileSignedOut"'));
  check('it is visible to signed-out visitors too: not inside #profileSignedIn / #profileSignedOut / #profileForm', prof.indexOf('id="appearance"') < prof.indexOf('id="profileSignedIn"') && !/<div id="profileSignedOut"[^>]*>[^]*id="appearance"/.test(prof) && !/<form id="profileForm"[^]*?<\/form>/.exec(prof)[0].includes('appearance'));
  check('it is a radiogroup labelled "Appearance" with exactly three radios: Light | Dark | System', /role="radiogroup" aria-labelledby="appearanceTitle"/.test(app) && /id="appearanceTitle">Appearance</.test(app) && (app.match(/role="radio"/g) || []).length === 3 && /data-pref="light"[^>]*>Light</.test(app) && /data-pref="dark"[^>]*>Dark</.test(app) && /data-pref="system"[^>]*>System</.test(app));
  check('each radio is a real <button type="button"> with aria-checked; roving tabindex (one 0, two -1)', (app.match(/<button type="button" class="seg-opt" role="radio" aria-checked="(true|false)" tabindex="(0|-1)"/g) || []).length === 3 && (app.match(/tabindex="0"/g) || []).length === 1 && (app.match(/tabindex="-1"/g) || []).length === 2);
  check('the 44px target and the helper text', /\.seg-opt\{[^}]*min-height:44px/.test(accountHtml) && /Applies on this device; syncs to your account when signed in\./.test(app));
  check('arrow keys / Home / End move + select (radio-group keyboard pattern); Space and Enter select', /'ArrowRight'/.test(accountHtml) && /'ArrowLeft'/.test(accountHtml) && /'Home'/.test(accountHtml) && /'End'/.test(accountHtml) && /e\.key === ' ' \|\| e\.key === 'Enter'/.test(accountHtml));
  check('a pick saves immediately through CBTheme.setPref (device first, then the account) and keeps aria-checked in step', /CBTheme\.setPref\(b\.dataset\.pref\)/.test(accountHtml) && /setAttribute\('aria-checked'/.test(accountHtml) && /CBTheme\.onChange\(syncAppearance\)/.test(accountHtml));
  check('the control reflects the current pref on load, in showTab and in renderProfile', /showTab[^]*?syncAppearance\(\); renderProfile\(\)/.test(accountHtml) && /async function renderProfile\(\) \{\s*syncAppearance\(\);/.test(accountHtml) && /\r?\n  syncAppearance\(\);\r?\n/.test(accountHtml));
  check('the profile form logic is untouched: submit handler does not mention the theme, Save button stays in #profileForm', !/profileForm'\)\.addEventListener\('submit'[^]*?btn\.disabled = false;\s*\}\);/.exec(accountHtml)[0].includes('Theme') && /id="pfSave"/.test(accountHtml));
  check('saveProfile never carries a theme (theme is a top-level users/{uid} field, so a profile save cannot wipe it)', !/theme/i.test(grab(authJs, 'api.saveProfile = async function', 'api.reauthenticate')));
}

section('my-auth.js theme sync (in-memory Firebase mock)');
{
  const vm = require('vm');
  const mem = () => { const m = {}; return { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: (k) => { delete m[k]; }, _m: m }; };
  function boot(docs, opts) {
    opts = opts || {};
    const writes = [], deletes = [];
    let authCb = null;
    const ls = mem();
    const db = {
      doc: (p) => ({
        get: async () => ({ exists: p in docs, data: () => docs[p] }),
        set: async (d, o) => { if (opts.gateSet && 'theme' in d && d.themeAt === 77) await opts.gateSet; if (opts.rejectSet && opts.rejectSet(d)) throw new Error('offline'); writes.push({ p, d: JSON.parse(JSON.stringify(d)), o }); docs[p] = o && o.merge ? Object.assign({}, docs[p] || {}, d) : d; },
        delete: async () => { deletes.push(p); delete docs[p]; },
      }),
    };
    const firebase = { auth: Object.assign(() => ({ onAuthStateChanged: (cb) => { authCb = cb; }, signOut: async () => {} }), { GoogleAuthProvider: function () {} }), firestore: Object.assign(() => db, { FieldValue: { serverTimestamp: () => 'TS' } }), app: () => ({ options: {} }) };
    const ctx = { document: {}, firebase, localStorage: ls, sessionStorage: mem(), MyActive: { load: () => [], save() {} }, setTimeout, clearTimeout, console, Date };
    ctx.self = ctx;
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'my-auth.js'), 'utf8'), ctx);
    const A = ctx.MyAuth, events = [];
    A.onChange((e) => events.push([e, A.readTheme && A.readTheme()]));
    A.init();
    const player = (uid) => ({ uid: uid || 'u1', providerData: [{ providerId: 'google.com' }], displayName: 'Ana', email: 'a@b.co', getIdTokenResult: async () => ({ claims: {} }) });
    const staff = { uid: 's1', providerData: [{ providerId: 'password' }], email: 's@x.co', getIdTokenResult: async () => ({ claims: { superadmin: true } }) };
    return { A, docs, writes, deletes, events, ls, signIn: (u) => authCb(u), player, staff };
  }
  const base = () => ({ 'users/u1': { phone: null, profile: { name: 'Ana', phone: '', homeClientId: '', prefill: true }, active: [] } });
  check('normalizeThemeRecord: only light|dark|system, at defaults to 0', MyAuth.normalizeThemeRecord('dark', 5).pref === 'dark' && MyAuth.normalizeThemeRecord('dark').at === 0 && MyAuth.normalizeThemeRecord('purple', 5) === null && MyAuth.normalizeThemeRecord(undefined, 5) === null && MyAuth.normalizeThemeRecord('system', 'x').at === 0 && MyAuth.normalizeThemeRecord('dark', Date.now() + 3 * 86400000).at === 0 && MyAuth.normalizeThemeRecord('dark', Date.now() + 3600000).at > 0);

  await (async () => {
    let t = boot({ 'users/u1': Object.assign(base()['users/u1'], { theme: 'dark', themeAt: 500 }) });
    check('readTheme is null before any sync', t.A.readTheme() === null);
    await t.signIn(t.player());
    check("sync stashes the account's theme BEFORE 'synced' is emitted, so a listener can read it", JSON.stringify(t.events.find((e) => e[0] === 'synced')[1]) === '{"pref":"dark","at":500}' && JSON.stringify(t.A.readTheme()) === '{"pref":"dark","at":500}');
    check("the sync write does not carry theme/themeAt (merge keeps the stored values), and the profile cache is unchanged in shape", !('theme' in t.writes[0].d) && !('themeAt' in t.writes[0].d) && t.docs['users/u1'].theme === 'dark' && t.docs['users/u1'].themeAt === 500 && !('theme' in t.writes[0].d.profile));

    t = boot(base()); await t.signIn(t.player());
    check('no theme on the account -> readTheme() null (device keeps its own)', t.A.readTheme() === null);
    t = boot({ 'users/u1': Object.assign(base()['users/u1'], { theme: 'purple', themeAt: 5 }) }); await t.signIn(t.player());
    check('a junk theme value on the account is ignored (null)', t.A.readTheme() === null);

    t = boot(base()); await t.signIn(t.player()); t.writes.length = 0;
    const ok = await t.A.writeTheme('dark', 777);
    check('writeTheme writes TOP-LEVEL {theme, themeAt} with merge:true to users/{uid} -- nothing else', ok === true && t.writes.length === 1 && t.writes[0].p === 'users/u1' && JSON.stringify(t.writes[0].d) === '{"theme":"dark","themeAt":777}' && t.writes[0].o.merge === true);
    check('after writeTheme the in-memory copy follows', JSON.stringify(t.A.readTheme()) === '{"pref":"dark","at":777}');
    check('an invalid pref is a no-op (false, nothing written)', (await t.A.writeTheme('purple', 1)) === false && t.writes.length === 1);

    await t.A.saveProfile({ name: 'Bea' });
    check('a later profile save does not touch or wipe the theme fields', !('theme' in t.writes[t.writes.length - 1].d) && !('themeAt' in t.writes[t.writes.length - 1].d) && t.docs['users/u1'].theme === 'dark' && t.docs['users/u1'].themeAt === 777);

    t.ls.setItem('cb_theme_v1', '{"pref":"dark","at":777}');
    await t.signIn(null);
    check('sign-out clears the in-memory account copy but keeps the device preference', t.A.readTheme() === null && t.ls._m.cb_theme_v1 === '{"pref":"dark","at":777}');
    check('signed out: writeTheme is a no-op (false, nothing written)', (await t.A.writeTheme('light', 9)) === false && t.writes.filter((w) => 'theme' in w.d && w.d.themeAt === 9).length === 0);

    t = boot(base()); await t.signIn(t.staff);
    check("staff sessions never sync: no 'synced', no write, readTheme null, writeTheme false", !t.events.some((e) => e[0] === 'synced') && t.writes.length === 0 && t.A.readTheme() === null && (await t.A.writeTheme('dark', 5)) === false && t.writes.length === 0);

    t = boot(base(), { rejectSet: (d) => 'theme' in d }); await t.signIn(t.player());
    let rejected = false; try { await t.A.writeTheme('dark', 3); } catch (e) { rejected = true; }
    check('a failed account write rejects (theme.js catches it) and leaves the in-memory copy alone', rejected && t.A.readTheme() === null);

    {
      let release; const gate = new Promise((res) => { release = res; });
      t = boot({ 'users/u1': base()['users/u1'], 'users/u2': { theme: 'light', themeAt: 40, active: [], profile: {} } }, { gateSet: gate });
      await t.signIn(t.player());
      const slow = t.A.writeTheme('dark', 77); // account A's write is still in flight
      await t.signIn(t.player('u2'));
      const before = JSON.stringify(t.A.readTheme());
      release(); await slow;
      check("a slow write from account A that resolves after B signed in does not change B's in-memory theme", before === '{"pref":"light","at":40}' && JSON.stringify(t.A.readTheme()) === before);
    }
    t = boot(base()); await t.signIn(t.player()); await t.signIn(t.player('u2'));
    check("another account signing in on the same page never inherits the previous account's theme", t.A.readTheme() === null);
  })();
}


console.log(`\n=== ACCOUNT PAGE: ${passed}/${passed + failed} passed ===`);
process.exit(failed === 0 ? 0 : 1);
})().catch((e) => { console.log('  FAIL: test crashed -- ' + (e && e.stack || e)); process.exit(1); });
