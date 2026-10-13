// ============================================================
// FIREBASE CONFIG — the one shared project every tenant runs on
// ============================================================
// All tenants share this single Firebase project and this one
// config file — there is no per-client branch or separate project
// (see CLIENTS.md). Tenant isolation is by Firestore path
// (clients/{slug}/...) and security rules, not by separate
// credentials.
//
// These are the standard Firebase WEB config values, meant to be
// public — the browser needs them to talk to Firestore/Auth/
// Storage at all. Access control is enforced by firestore.rules/
// storage.rules, not by hiding this.
//
// If window.FIREBASE_CONFIG is ever missing or empty (e.g. a local
// fork that hasn't set up its own Firebase project yet), index.html
// falls back to a localStorage-only "Demo mode" automatically — the
// #demoModeBanner near the bottom of the page is that fallback, not
// something this file needs to turn on.
// ============================================================

window.FIREBASE_CONFIG = {
  apiKey: "AIzaSyAkf7GJ3mrEUtykHLQ3wizwfGpl5OugE2I",
  authDomain: "courtbooking-85175.firebaseapp.com",
  projectId: "courtbooking-85175",
  storageBucket: "courtbooking-85175.firebasestorage.app",
  messagingSenderId: "291819153596",
  appId: "1:291819153596:web:f31c27b24a5eaa718088b9"
};

