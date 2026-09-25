/* ================================================================
   StaffAuth -- SCAFFOLD for letting staff and the superadmin sign in
   with Google. It is deliberately switched off: PINs remain the only
   way in to Admin, Store, Tournaments and everything else that is PIN-
   gated today, so nothing here adds a step while the app is being
   tested. When it goes live, flip STAFF_GOOGLE_ENABLED (and decide the
   mode, see accessDecision) -- the plumbing is already in place.

   Turning it on early for one browser (to try it): open the site with
   ?staffgoogle=1 -- that only reveals the button; it grants nothing by
   itself. Access still needs a Google account whose verified email is
   in that facility's allow-list, kept at
   clients/{clientId}/settings/staffAuth as { emails: ["a@b.com", ...] }.

   BEFORE GOING LIVE: that settings doc sits under this app's open
   per-facility Firestore rule, so anyone could edit the allow-list. Real
   enforcement needs the allow-list moved behind a rule or a callable
   that checks a staff custom claim -- exactly how the superadmin
   console already works. Until then this is a convenience path only
   and the PIN remains the actual gate.

   The superadmin already authenticates with a Firebase account holding a
   `superadmin` custom claim; signing in with Google works for them when
   the Google email matches that existing account (Firebase links
   accounts that share a verified email).
   UMD: the decision helpers are pure (tested under Node); Firebase calls
   exist only in a browser.
   ================================================================ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.StaffAuth = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const STAFF_GOOGLE_ENABLED = false; // the go-live switch

  // 'pin'           -- today: only the PIN unlocks (Google not consulted)
  // 'pin-or-google' -- Google is an additional way in; the PIN still works
  // 'google'        -- go-live end state: PIN retired, Google only
  const MODES = ['pin', 'pin-or-google', 'google'];

  const normalizeEmail = (e) => String(e || '').trim().toLowerCase();
  function isStaffEmail(email, list) {
    const e = normalizeEmail(email);
    return !!e && (list || []).some((x) => normalizeEmail(x) === e);
  }
  // Whether the Google button should be visible at all.
  function googleUiEnabled(enabledFlag, search) {
    if (enabledFlag) return true;
    return /(?:^|[?&])staffgoogle=1(?:&|$)/.test(String(search || ''));
  }
  // The single place that decides "may this person in?", so moving from
  // PIN-only to PIN-or-Google to Google-only is a one-word change.
  function accessDecision({ mode, pinOk, googleStaff }) {
    const m = MODES.indexOf(mode) >= 0 ? mode : 'pin';
    if (m === 'pin') return !!pinOk;
    if (m === 'pin-or-google') return !!pinOk || !!googleStaff;
    return !!googleStaff;
  }
  // Only a verified Google email counts as a staff identity.
  function googleStaffFrom(user, allowList) {
    if (!user) return false;
    const google = (user.providerData || []).some((p) => p && p.providerId === 'google.com');
    return !!(google && user.emailVerified !== false && isStaffEmail(user.email, allowList));
  }

  const api = { STAFF_GOOGLE_ENABLED, MODES, normalizeEmail, isStaffEmail, googleUiEnabled, accessDecision, googleStaffFrom };

  if (typeof document !== 'undefined') {
    api.uiEnabled = () => googleUiEnabled(STAFF_GOOGLE_ENABLED, location.search);
    api.signInWithGoogle = async function () {
      const provider = new firebase.auth.GoogleAuthProvider();
      const cred = await firebase.auth().signInWithPopup(provider);
      return cred.user;
    };
    api.loadAllowList = async function (clientId) {
      try {
        const snap = await firebase.firestore().doc('clients/' + clientId + '/settings/staffAuth').get();
        return (snap.exists && snap.data().emails) || [];
      } catch (e) { return []; }
    };
    // Signs in with Google and reports whether that person is on this
    // facility's staff allow-list.
    api.signInAsStaff = async function (clientId) {
      const user = await api.signInWithGoogle();
      const list = await api.loadAllowList(clientId);
      return { user, allowed: googleStaffFrom(user, list) };
    };
  }

  return api;
});
