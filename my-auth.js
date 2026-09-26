/* ================================================================
   MyAuth -- optional sign-in (Google, or email + password) that lets My
   Matches follow a person across devices. Signed-out behavior is
   unchanged (everything stays device-local, see my-active.js). Signed
   in, the same data is also kept in Firestore at users/{uid}, readable/
   writable only by that user (see firestore.rules).
   What syncs: the tracked bookings/games list (MyActive) and the phone
   used for tournament lookup. The push-notification inbox stays on the
   device -- a push subscription belongs to one device.
   Staff/superadmin accounts live in the same email/password pool and
   share this origin's sign-in session, so accounts carrying a staff
   custom claim are never treated as player accounts: no sync, no
   account UI, and this page can't sign them out.
   UMD: the merge/error helpers are pure (tested under Node); everything
   that touches Firebase/localStorage only exists in a browser.
   ================================================================ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MyAuth = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const MAX_ITEMS = 300;
  const PHONE_LS_KEY = 'cb_my_phone_v1';
  const REDIRECT_FLAG = 'cb_google_redirect_pending';
  const TRACE_KEY = 'cb_google_trace';
  function redirectLostMessage() {
    return 'Google sign-in didn’t finish in this browser — it may be blocking the return step. Use email instead, or try another browser.';
  }
  const PROFILE_LS_KEY = 'cb_my_profile_v1'; // device cache of the signed-in profile (cleared on sign-out)
  const MIN_PASSWORD = 6; // Firebase's own minimum
  const key = (x) => x.clientId + '|' + x.kind + '|' + x.refId;

  // Union of the device list and the account list. The same booking/game on
  // both sides keeps its newest addedAt; result is newest-first and capped.
  function mergeActive(local, remote) {
    const byKey = new Map();
    [].concat(remote || [], local || []).forEach((x) => {
      if (!x || !x.clientId || !x.kind || !x.refId) return;
      const prev = byKey.get(key(x));
      if (!prev || (x.addedAt || 0) > (prev.addedAt || 0)) byKey.set(key(x), x);
    });
    return Array.from(byKey.values()).sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0)).slice(0, MAX_ITEMS);
  }
  // The device's number wins (it's what the person just used); the account's
  // fills in on a fresh device.
  function mergePhone(localPhone, remotePhone) {
    return localPhone || remotePhone || null;
  }
  // A player account is one that signed in with Google or email + password.
  function isPlayerUser(user) {
    return !!(user && (user.providerData || []).some((p) => p && (p.providerId === 'google.com' || p.providerId === 'password')));
  }
  // Platform staff (superadmin console) sign in with email + password too --
  // the claim is what tells them apart from a player.
  function hasStaffClaim(claims) {
    return !!(claims && (claims.superadmin === true || claims.platformPerms));
  }
  // Account UI is offered to signed-out visitors and to player accounts, and
  // never over a staff session.
  function canShowAccountUi(user, isStaff) {
    if (!user) return true;
    return isPlayerUser(user) && !isStaff;
  }
  // Same rule as tournament.html / tournament-admin.html / functions/notifyRunner.js
  // (duplicated on purpose -- static pages, no shared bundle; a test keeps them equal).
  function normalizePhone(raw) {
    let digits = String(raw || '').replace(/\D/g, '');
    if (digits.startsWith('0')) digits = '63' + digits.slice(1);
    else if (digits.startsWith('9') && digits.length === 10) digits = '63' + digits;
    return digits;
  }
  // What the Profile tab stores at users/{uid}.profile.
  function normalizeProfile(raw) {
    const p = raw || {};
    return {
      name: String(p.name || '').trim().slice(0, 80),
      phone: p.phone ? normalizePhone(p.phone) : '',
      homeClientId: /^[a-z0-9-]{1,50}$/.test(String(p.homeClientId || '')) ? String(p.homeClientId) : '',
      prefill: p.prefill !== false,
    };
  }
  function validPhone(raw) {
    const n = normalizePhone(raw);
    return n.length >= 10 && n.length <= 15;
  }
  function validEmail(e) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(e || '').trim()); }
  // Plain-language messages for the errors people actually hit.
  function friendlyError(code) {
    switch (code) {
      case 'auth/invalid-email': return 'That email address doesn’t look right.';
      case 'auth/missing-password':
      case 'auth/weak-password': return 'Use a password of at least ' + MIN_PASSWORD + ' characters.';
      case 'auth/email-already-in-use': return 'That email already has an account — try signing in instead.';
      case 'auth/invalid-credential':
      case 'auth/wrong-password':
      case 'auth/user-not-found': return 'Email or password is incorrect.';
      case 'auth/requires-recent-login': return 'For your security, please confirm your sign-in and try again.';
      case 'auth/too-many-requests': return 'Too many attempts — wait a moment and try again.';
      case 'auth/network-request-failed': return 'Network problem — check your connection and try again.';
      default: return 'Something went wrong — please try again.';
    }
  }

  const api = { MAX_ITEMS, MIN_PASSWORD, PROFILE_LS_KEY, normalizePhone, normalizeProfile, validPhone, mergeActive, mergePhone, isPlayerUser, hasStaffClaim, canShowAccountUi, validEmail, friendlyError };

  if (typeof document !== 'undefined') {
    let user = null;
    let isStaff = false;
    let pushTimer = null;
    const listeners = [];
    const emit = (evt) => listeners.forEach((fn) => { try { fn(evt, user); } catch (e) {} });
    const userRef = () => firebase.firestore().doc('users/' + user.uid);
    const readPhone = () => { try { return localStorage.getItem(PHONE_LS_KEY); } catch (e) { return null; } };
    const isPlayer = () => isPlayerUser(user) && !isStaff;
    const clearProfileCache = () => { try { localStorage.removeItem(PROFILE_LS_KEY); } catch (e) {} };
    const writeProfileCache = (profile) => { try { localStorage.setItem(PROFILE_LS_KEY, JSON.stringify(Object.assign({}, profile, { email: user ? user.email || '' : '' }))); } catch (e) {} };
    // Device cache of the profile so forms can prefill without a network wait.
    // Only ever written while signed in, removed on sign-out.
    api.getProfile = function () {
      try { const p = JSON.parse(localStorage.getItem(PROFILE_LS_KEY)); return p ? Object.assign(normalizeProfile(p), { email: p.email || '' }) : null; }
      catch (e) { return null; }
    };

    api.onChange = (fn) => { listeners.push(fn); };
    api.currentUser = () => (isPlayer() ? user : null);
    api.canShowAccountUi = () => canShowAccountUi(user, isStaff);

    // Pulls the account's copy, merges it with this device, and writes the
    // merged result to BOTH places so they agree from here on.
    async function syncFromAccount() {
      const snap = await userRef().get();
      const remote = snap.exists ? snap.data() : {};
      const active = mergeActive(MyActive.load(), remote.active);
      const remoteProfile = normalizeProfile(remote.profile);
      const phone = mergePhone(readPhone(), remote.phone || remoteProfile.phone);
      MyActive.save(active);
      if (phone) { try { localStorage.setItem(PHONE_LS_KEY, phone); } catch (e) {} }
      const profile = normalizeProfile(Object.assign({}, remoteProfile, { name: remoteProfile.name || user.displayName || '', phone }));
      writeProfileCache(profile);
      await userRef().set({ active, phone: phone || null, profile, name: user.displayName || '', email: user.email || '', updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
    }
    // Debounced upload after a local change (MyActive.save calls this).
    api.pushSoon = function () {
      if (typeof firebase === 'undefined' || !firebase.auth || !isPlayer()) return;
      const uid = user.uid;
      clearTimeout(pushTimer);
      pushTimer = setTimeout(() => {
        firebase.firestore().doc('users/' + uid)
          .set({ active: MyActive.load(), phone: readPhone(), updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true })
          .catch(() => {});
      }, 1500);
    };

    api.init = function () {
      if (typeof firebase === 'undefined' || !firebase.auth) return;
      // Coming back from the redirect flow: surface a failure, or a silent
      // "came back signed out" (browsers that block the return step).
      // If a Google attempt is in progress, note that the page (re)loaded --
      // a reload in the middle of sign-in is itself the clue to why it "blinks".
      if (api.trace()) trace('page loaded');
      const wasRedirecting = (() => { try { const f = sessionStorage.getItem(REDIRECT_FLAG); sessionStorage.removeItem(REDIRECT_FLAG); return !!f; } catch (e) { return false; } })();
      if (wasRedirecting) {
        firebase.auth().getRedirectResult().then((res) => {
          if (res && res.user) { api.clearTrace(); return; }
          let domain = '';
          try { domain = ' \u2014 site ' + location.host + ', auth ' + firebase.app().options.authDomain; } catch (e) {}
          api.lastProblem = redirectLostMessage() + ' [' + api.trace() + ' \u2192 returned signed out' + domain + ']';
          emit('signin-problem');
        }).catch((e) => {
          api.lastProblem = friendlyError(e && e.code) + ' [' + api.trace() + ' \u2192 ' + (e && e.code) + ']';
          emit('signin-problem');
        });
      }
      firebase.auth().onAuthStateChanged(async (u) => {
        user = u;
        isStaff = false;
        if (!u) clearProfileCache();
        else api.clearTrace(); // signed in: the attempt worked, drop its trail
        if (u) {
          try { isStaff = hasStaffClaim((await u.getIdTokenResult()).claims); } catch (e) {}
        }
        if (isPlayer()) {
          try { await syncFromAccount(); emit('synced'); } catch (e) { emit('sync-failed'); }
        }
        emit('auth');
      });
    };
    // A short breadcrumb trail of what the Google sign-in did, kept in
    // sessionStorage so it survives the full-page redirect and can be shown
    // if sign-in doesn't complete (mobile browsers fail in different ways).
    const trace = (msg, started) => {
      try {
        const secs = started ? ' (' + ((Date.now() - started) / 1000).toFixed(1) + 's)' : '';
        const prev = sessionStorage.getItem(TRACE_KEY);
        sessionStorage.setItem(TRACE_KEY, (prev ? prev + ' \u2192 ' : '') + msg + secs);
      } catch (x) {}
    };
    api.trace = () => { try { return sessionStorage.getItem(TRACE_KEY) || ''; } catch (x) { return ''; } };
    api.clearTrace = () => { try { sessionStorage.removeItem(TRACE_KEY); } catch (x) {} };
    // Full-page Google sign-in (no popup) -- offered directly too, for browsers
    // where the popup misbehaves.
    api.signInWithGoogleRedirect = function (started) {
      try { sessionStorage.setItem(REDIRECT_FLAG, '1'); } catch (x) {}
      trace('redirect', started);
      return firebase.auth().signInWithRedirect(new firebase.auth.GoogleAuthProvider());
    };
    api.signIn = async function () { // Google, popup first
      const provider = new firebase.auth.GoogleAuthProvider();
      const started = Date.now();
      api.clearTrace();
      trace('popup');
      try {
        await firebase.auth().signInWithPopup(provider);
        trace('popup ok', started);
      } catch (e) {
        const code = e && e.code;
        trace(String(code || 'error').replace('auth/', ''), started);
        // In-app browsers and some mobile setups can't open the popup, and some
        // close it the instant it opens (a person doesn't finish signing in
        // in under two seconds) -- use the full-page redirect instead.
        const closedInstantly = code === 'auth/popup-closed-by-user' && Date.now() - started < 2000;
        if (code === 'auth/popup-blocked' || code === 'auth/operation-not-supported-in-this-environment' || closedInstantly) {
          return api.signInWithGoogleRedirect(started);
        }
        // Double-tap: the first attempt is still in flight, nothing to report.
        if (code === 'auth/cancelled-popup-request') return;
        // A popup that closed later (with no sign-in) is reported, never swallowed.
        throw e;
      }
    };
    // Set when we hand off to the redirect flow, so coming back with no user
    // can be reported instead of silently looking like nothing happened.
    api.lastProblem = null;
    api.signInWithEmail = (email, password) => firebase.auth().signInWithEmailAndPassword(String(email).trim(), password);
    api.signUpWithEmail = async function (email, password, name) {
      const cred = await firebase.auth().createUserWithEmailAndPassword(String(email).trim(), password);
      if (name && cred.user) { try { await cred.user.updateProfile({ displayName: String(name).trim() }); } catch (e) {} }
      return cred;
    };
    api.resetPassword = (email) => firebase.auth().sendPasswordResetEmail(String(email).trim());
    api.signOut = () => { clearProfileCache(); return firebase.auth().signOut(); };
    // Saves Profile-tab edits to the account and the device cache. A changed
    // phone also updates the number tournament lookup remembers.
    api.saveProfile = async function (patch) {
      if (!isPlayer()) throw new Error('not signed in');
      const current = api.getProfile() || normalizeProfile({});
      const next = normalizeProfile(Object.assign({}, current, patch));
      if (next.phone) { try { localStorage.setItem(PHONE_LS_KEY, next.phone); } catch (e) {} }
      writeProfileCache(next);
      await userRef().set({ profile: next, phone: next.phone || null, updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
      return next;
    };
    // Proves it's still the same person (Firebase requires a recent sign-in to
    // delete an account). Google re-opens the popup; email asks for the password.
    api.reauthenticate = async function (askPassword) {
      if ((user.providerData || []).some((p) => p && p.providerId === 'google.com')) return user.reauthenticateWithPopup(new firebase.auth.GoogleAuthProvider());
      const pw = await askPassword();
      if (!pw) throw Object.assign(new Error('cancelled'), { code: 'auth/cancelled-popup-request' });
      return user.reauthenticateWithCredential(firebase.auth.EmailAuthProvider.credential(user.email, pw));
    };
    // Deletes the account doc, then the sign-in account itself. The device's own
    // list is left alone (that's just signed-out behavior).
    api.deleteAccount = async function (askPassword) {
      if (!isPlayer()) return;
      const u = user;
      await userRef().delete();
      try { await u.delete(); }
      catch (e) {
        if (!e || e.code !== 'auth/requires-recent-login') throw e;
        await api.reauthenticate(askPassword);
        await u.delete();
      }
      clearProfileCache();
    };
    // Removes the account's saved copy and signs out. Deliberately leaves the
    // device's own list alone -- that's the signed-out behavior it falls back to.
    api.deleteMyData = async function () {
      if (!isPlayer()) return;
      await userRef().delete();
      clearProfileCache();
      await firebase.auth().signOut();
    };
  }

  return api;
});
