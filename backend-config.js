// ============================================================
// SUPABASE CONFIG — NEUTRAL MAIN (DEMO MODE)
// ============================================================
// Main branch runs as a self-contained demo: no Supabase keys,
// all data persists in the visitor's own browser (localStorage).
// A "Demo mode" badge appears in the bottom-right corner.
//
// For a real client deployment, replace this file with that
// client's Supabase web config. The app then syncs bookings,
// queues, QR codes and settings across all devices live.
// ============================================================

window.SUPABASE_CONFIG = {
  url: "PASTE_SUPABASE_URL",
  anonKey: "PASTE_SUPABASE_ANON_KEY"
};
