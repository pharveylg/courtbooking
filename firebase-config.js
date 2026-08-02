// ============================================================
// FIREBASE CONFIG — NEUTRAL MAIN (DEMO MODE)
// ============================================================
// Main branch runs as a self-contained demo: no Firebase keys,
// all data persists in the visitor's own browser (localStorage).
// A "Demo mode" badge appears in the bottom-right corner.
//
// For a real client deployment, replace this file with that
// client's Firebase web config (see examples/firebase-config
// .white-kitchen.js for the shape). The app then syncs bookings,
// queues, QR codes and settings across all devices live.
// ============================================================

window.FIREBASE_CONFIG = {
  apiKey: "PASTE_FIREBASE_API_KEY",
  authDomain: "",
  projectId: "",
  storageBucket: "",
  messagingSenderId: "",
  appId: ""
};
