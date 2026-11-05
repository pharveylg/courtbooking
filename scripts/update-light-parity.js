#!/usr/bin/env node
/* update-light-parity.js -- regenerates tests/fixtures/light-parity.json.

   The fixture pins what makes light mode byte-identical on the four Phase 3a pages
   (store / tournament / gallery / billing): per page
     - bodySha256        sha256 of the markup from `<body` onward, CRLF normalised to LF
     - headBaseSha256    sha256 of the <head> with the 5 dark-mode wiring lines removed
     - classTokens       multiset of class tokens (token -> count) and its sha256
   tests/theme-tw-wiring.test.js fails when any of these drift. Run this script ONLY when a page body
   or class list was changed on purpose (i.e. a later phase edits classes/markup), then review the
   fixture diff and commit it together with the page change:

       node scripts/update-light-parity.js

   `--verify-against <git-ref>` additionally refuses to write unless every body and class multiset is
   identical to that ref (used once to seed the fixture from a tree verified identical to HEAD). */
'use strict';
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const crypto = require('crypto');
const T = require('../theme.js');

const ROOT = path.join(__dirname, '..');
const PAGES = ['store.html', 'tournament.html', 'gallery.html', 'billing.html', 'tournament-admin.html'];
const WIRING = ['<meta name="theme-color" content="#FFFBF5"/>', '<script>' + T.BOOTSTRAP + '</script>', '<link rel="stylesheet" href="theme.css"/>', '<script src="/theme.js"></script>', '<script>CBTheme.init();</script>'];
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const norm = (s) => s.replace(/\r\n/g, '\n');

function classTokens(html) {
  const m = {};
  (html.match(/\bclass=(?:"[^"]*"|'[^']*')/g) || []).forEach((a) => a.slice(a.indexOf('=') + 2, -1).split(/\s+/).filter(Boolean).forEach((t) => { m[t] = (m[t] || 0) + 1; }));
  const sorted = {};
  Object.keys(m).sort().forEach((k) => { sorted[k] = m[k]; });
  return sorted;
}
function describe(html) {
  const h = norm(html), b = h.indexOf('<body');
  if (b < 0) throw new Error('no <body');
  const head = h.slice(0, b), body = h.slice(b);
  const baseHead = head.split('\n').filter((l) => !WIRING.includes(l)).join('\n');
  const tokens = classTokens(h);
  return { bodySha256: sha(body), headBaseSha256: sha(baseHead), classTokensSha256: sha(JSON.stringify(tokens)), classTokenCount: Object.keys(tokens).length, classTokens: tokens };
}
/* ---- index.html (Phase 3b): its body DID change on purpose, so it is pinned by an ALLOWED DELTA, not by a
   byte-for-byte hash. BASELINE_REF now points at b214d7b's re-baseline commit (31fe4ac), whose tree already
   has zero pending delta -- see that commit's own "chore(theme): re-baseline..." message for the precedent.
   The delta below is the Phase 1+2 UI-state reliability build (stale-data/offline/load-timeout/PIN-cooldown
   audit): the load-screen timeout fallback + Retry button, the core onSnapshot listeners' error signal
   (clearListenerError/setListenerError + the new #dataSyncErrorBar), the honest offline-banner copy (no more
   implying a sync queue that doesn't exist), and the booking-PIN attempt/cooldown gate (pin-gate.js) replacing
   the old infinite bare alert() loop. Each entry below is one contiguous changed region; reversing all of
   them in the current body must give back the baseline body (sha256 recorded from git ref BASELINE_REF)
   exactly. */
const BASELINE_REF = '31fe4ac';
const SUBSTITUTIONS = [
  {
    "from": "<div style=\"font-family:'JetBrains Mono',monospace;font-size:11px;opacity:0.6;margin-top:8px\">Preparing your booking page</div>\n  </div>\n  <style>@keyframes pulse",
    "to": "<div style=\"font-family:'JetBrains Mono',monospace;font-size:11px;opacity:0.6;margin-top:8px\">Preparing your booking page</div>\n    <!-- Shown only if initializeApp() hasn't resolved within LOAD_TIMEOUT_MS; augments the\n         spinner above rather than replacing it, since the load may still finish on its own. -->\n    <div id=\"loadingTimeoutMsg\" style=\"display:none;margin-top:18px;max-width:280px\">\n      <div id=\"loadingTimeoutHeading\" style=\"font-size:13px;font-weight:700;color:#201C19\">Taking longer than expected</div>\n      <div style=\"font-family:'JetBrains Mono',monospace;font-size:11px;opacity:0.7;margin-top:4px\">This can happen on a slow or unstable connection.</div>\n      <button type=\"button\" id=\"loadingTimeoutRetryBtn\" style=\"margin-top:12px;background:#201C19;color:white;border:none;border-radius:999px;padding:8px 20px;font-family:'JetBrains Mono',monospace;font-size:11px;font-weight:700;cursor:pointer\">Retry</button>\n    </div>\n  </div>\n  <style>@keyframes pulse",
    "count": 1
  },
  {
    "from": "<div id=\"pwa-offline-bar\" class=\"hidden fixed top-0 left-0 right-0 z-[9999] bg-[#FF8A5B] text-white text-center py-2 px-4 mono text-[11px] font-[700] tracking-wide\" style=\"display:none\">\n  ⚡ You're offline — changes will sync when reconnected\n</div>\n\n<!-- PWA Install Banner -->",
    "to": "<div id=\"pwa-offline-bar\" class=\"hidden fixed top-0 left-0 right-0 z-[9999] bg-[#FF8A5B] text-white text-center py-2 px-4 mono text-[11px] font-[700] tracking-wide\" style=\"display:none\">\n  ⚡ You're offline — booking actions won't work until you're back online\n</div>\n\n<!-- Live-data sync error indicator: shown when a core onSnapshot listener (bookings/pricing/courts/etc)\n     is failing while the app otherwise thinks it's online (permission error, blocked connection, etc).\n     Separate from pwa-offline-bar above, which already covers the plain \"no network\" case. -->\n<div id=\"dataSyncErrorBar\" class=\"hidden fixed top-0 left-0 right-0 z-[9998] bg-[#FFF0D6] text-[#8A5A00] text-center py-2 px-4 mono text-[11px] font-[700] tracking-wide\" style=\"display:none\"></div>\n\n<!-- PWA Install Banner -->",
    "count": 1
  },
  {
    "from": "<script src=\"next-open.js\"></script>\n<script src=\"/my-active.js\"></script>",
    "to": "<script src=\"next-open.js\"></script>\n<script src=\"pin-gate.js\"></script>\n<script src=\"/my-active.js\"></script>",
    "count": 1
  },
  {
    "from": "    console.warn('Retention check failed:', e.message);\n  }\n}\n\nfunction startRealtimeListeners() {",
    "to": "    console.warn('Retention check failed:', e.message);\n  }\n}\n\n/* ----------------------------------------------------------------\n   Core-listener error signal. Each core onSnapshot below (bookings,\n   openPlay, staffReserve, pricing, courtHours, settings, queues,\n   courts) previously swallowed failures with a console.warn only --\n   a permission-denied or network-loss failure was invisible to the\n   user. Track which named listeners currently have an outstanding\n   error and surface one small, non-blocking, honest banner (never a\n   blocking alert()) describing the likely cause. Cleared per-listener\n   the moment that listener's handler runs successfully again.\n   ---------------------------------------------------------------- */\nwindow._listenerErrors = window._listenerErrors || new Map();\nfunction _classifyFirestoreError(e) {\n  if (!navigator.onLine) return 'offline';\n  if (e && e.code === 'permission-denied') return 'permission';\n  if (e && (e.code === 'unavailable' || e.code === 'deadline-exceeded' || e.code === 'cancelled')) return 'network';\n  return 'unknown';\n}\nfunction renderListenerErrorBar() {\n  const bar = document.getElementById('dataSyncErrorBar');\n  if (!bar) return;\n  // The offline bar already explains a plain \"no network\" state -- don't pile on.\n  if (!navigator.onLine || window._listenerErrors.size === 0) {\n    bar.style.display = 'none';\n    bar.classList.add('hidden');\n    return;\n  }\n  const kinds = new Set(Array.from(window._listenerErrors.values()).map(v => v.kind));\n  let msg;\n  if (kinds.has('permission')) {\n    msg = '⚠ Permission error loading live data — try refreshing or signing in again.';\n  } else if (kinds.has('network')) {\n    msg = '⚠ Connection trouble — some data may be out of date.';\n  } else {\n    msg = '⚠ Live updates are having trouble syncing — some changes may not appear yet.';\n  }\n  bar.textContent = msg;\n  bar.style.display = '';\n  bar.classList.remove('hidden');\n}\nfunction setListenerError(name, e) {\n  console.warn(name + ' listener:', e && e.message);\n  window._listenerErrors.set(name, { kind: _classifyFirestoreError(e), message: e && e.message });\n  renderListenerErrorBar();\n}\nfunction clearListenerError(name) {\n  if (window._listenerErrors.delete(name)) renderListenerErrorBar();\n}\nwindow.addEventListener('online', renderListenerErrorBar);\nwindow.addEventListener('offline', renderListenerErrorBar);\n\nfunction startRealtimeListeners() {",
    "count": 1
  },
  {
    "from": "function startRealtimeListeners() {\n  if (!db) return;\n\n  db.doc(fbDocPath('bookings')).onSnapshot(snap => {\n    if (!snap.exists) return;\n    const data = snap.data().data;\n    if (data) {\n      bookings = data;\n      localStorage.setItem(LS.bookings, JSON.stringify(data));\n      renderSchedule(); renderBookingsList();\n      if (adminUnlocked && typeof renderAdminBookings === 'function') renderAdminBookings();\n      if (typeof renderDateSlotPreview === 'function') renderDateSlotPreview();\n    }\n  }, e => console.warn('bookings listener:', e.message));\n\n  db.doc(fbDocPath('openPlay')).onSnapshot(snap => {\n    if (!snap.exists) return;\n    const data = snap.data().data;\n    if (data) {\n      openPlays = data;\n      localStorage.setItem(LS.openPlay, JSON.stringify(data));\n      renderSchedule();\n      if (typeof renderOpenPlayList === 'function') renderOpenPlayList();\n      if (typeof renderDateSlotPreview === 'function') renderDateSlotPreview();\n    }\n  }, e => console.warn('openPlay listener:', e.message));\n\n  db.doc(fbDocPath('staffReserve')).onSnapshot(snap => {\n    if (!snap.exists) return;\n    const parsed = snap.data().data;\n    if(!parsed) return;\n    staffReserveEnabled = migrateStaffReserveShape(parsed);\n    localStorage.setItem(LS.staffReserve, JSON.stringify(staffReserveEnabled));\n    renderSchedule();\n    if (typeof renderStaffReserveSection === 'function') renderStaffReserveSection();\n    if (typeof updateStaffNote === 'function') updateStaffNote();\n  }, e => console.warn('staffReserve listener:', e.message));\n\n  db.doc(fbDocPath('pricing')).onSnapshot(snap => {\n    if (!snap.exists) return;\n    const parsed = snap.data().data;\n    if(!parsed) return;\n    courtPricing = parsed;\n    localStorage.setItem(LS.pricing, JSON.stringify(courtPricing));\n    renderSchedule();\n    recalcTotal();\n    if (typeof renderPricingSection === 'function') renderPricingSection();\n  }, e => console.warn('pricing listener:', e.message));\n\n  db.doc(fbDocPath('courtHours')).onSnapshot(snap => {\n    if (!snap.exists) return;\n    const parsed = snap.data().data;\n    if(!parsed) return;\n    courtHours = parsed;\n    localStorage.setItem(LS.courtHours, JSON.stringify(courtHours));\n    renderSchedule();\n    populateTimeOptions();\n    recalcTotal();\n    renderDateSlotPreview();\n    if (typeof renderOperatingHoursSection === 'function') renderOperatingHoursSection();\n  }, e => console.warn('courtHours listener:', e.message));\n\n  db.doc(fbDocPath('settings')).onSnapshot(snap => {\n    if (!snap.exists) return;\n    const d = snap.data().data || {};\n    if (d.pin) localStorage.setItem(LS.pin, d.pin);\n    if (d.payMethods) {\n      payMethods = { ...DEFAULT_PAY_METHODS, ...d.payMethods };\n      localStorage.setItem(LS.payMethods, JSON.stringify(payMethods));\n      if (typeof renderPublicPayTab === 'function') renderPublicPayTab();\n      if (typeof renderAdminQrManager === 'function') renderAdminQrManager();\n    }\n  }, e => console.warn('settings listener:', e.message));\n\n  db.doc(fbDocPath('queues')).onSnapshot(snap => {\n    if (!snap.exists) return;\n    const data = snap.data().data;\n    if (data) {\n      localStorage.setItem(LS.queues, JSON.stringify(data));\n      if (typeof renderQueueModule === 'function') renderQueueModule();\n    }\n  }, e => console.warn('queues listener:', e.message));\n\n  db.doc(fbDocPath('courts')).onSnapshot(snap => {\n    if (!snap.exists) return;\n    const data = snap.data().data;\n    if (data) {\n      COURTS = data;\n      localStorage.setItem(LS.courts, JSON.stringify(data));\n      renderCourtTabs();\n      renderAdminCourts();\n      renderSchedule();\n      if (typeof renderDateSlotPreview === 'function') renderDateSlotPreview();\n      populateCourtSelectors();\n      if (typeof updateStaffNote === 'function') updateStaffNote();\n    }\n  }, e => console.warn('courts listener:', e.message));\n}",
    "to": "function startRealtimeListeners() {\n  if (!db) return;\n\n  db.doc(fbDocPath('bookings')).onSnapshot(snap => {\n    clearListenerError('bookings');\n    if (!snap.exists) return;\n    const data = snap.data().data;\n    if (data) {\n      bookings = data;\n      localStorage.setItem(LS.bookings, JSON.stringify(data));\n      renderSchedule(); renderBookingsList();\n      if (adminUnlocked && typeof renderAdminBookings === 'function') renderAdminBookings();\n      if (typeof renderDateSlotPreview === 'function') renderDateSlotPreview();\n    }\n  }, e => setListenerError('bookings', e));\n\n  db.doc(fbDocPath('openPlay')).onSnapshot(snap => {\n    clearListenerError('openPlay');\n    if (!snap.exists) return;\n    const data = snap.data().data;\n    if (data) {\n      openPlays = data;\n      localStorage.setItem(LS.openPlay, JSON.stringify(data));\n      renderSchedule();\n      if (typeof renderOpenPlayList === 'function') renderOpenPlayList();\n      if (typeof renderDateSlotPreview === 'function') renderDateSlotPreview();\n    }\n  }, e => setListenerError('openPlay', e));\n\n  db.doc(fbDocPath('staffReserve')).onSnapshot(snap => {\n    clearListenerError('staffReserve');\n    if (!snap.exists) return;\n    const parsed = snap.data().data;\n    if(!parsed) return;\n    staffReserveEnabled = migrateStaffReserveShape(parsed);\n    localStorage.setItem(LS.staffReserve, JSON.stringify(staffReserveEnabled));\n    renderSchedule();\n    if (typeof renderStaffReserveSection === 'function') renderStaffReserveSection();\n    if (typeof updateStaffNote === 'function') updateStaffNote();\n  }, e => setListenerError('staffReserve', e));\n\n  db.doc(fbDocPath('pricing')).onSnapshot(snap => {\n    clearListenerError('pricing');\n    if (!snap.exists) return;\n    const parsed = snap.data().data;\n    if(!parsed) return;\n    courtPricing = parsed;\n    localStorage.setItem(LS.pricing, JSON.stringify(courtPricing));\n    renderSchedule();\n    recalcTotal();\n    if (typeof renderPricingSection === 'function') renderPricingSection();\n  }, e => setListenerError('pricing', e));\n\n  db.doc(fbDocPath('courtHours')).onSnapshot(snap => {\n    clearListenerError('courtHours');\n    if (!snap.exists) return;\n    const parsed = snap.data().data;\n    if(!parsed) return;\n    courtHours = parsed;\n    localStorage.setItem(LS.courtHours, JSON.stringify(courtHours));\n    renderSchedule();\n    populateTimeOptions();\n    recalcTotal();\n    renderDateSlotPreview();\n    if (typeof renderOperatingHoursSection === 'function') renderOperatingHoursSection();\n  }, e => setListenerError('courtHours', e));\n\n  db.doc(fbDocPath('settings')).onSnapshot(snap => {\n    clearListenerError('settings');\n    if (!snap.exists) return;\n    const d = snap.data().data || {};\n    if (d.pin) localStorage.setItem(LS.pin, d.pin);\n    if (d.payMethods) {\n      payMethods = { ...DEFAULT_PAY_METHODS, ...d.payMethods };\n      localStorage.setItem(LS.payMethods, JSON.stringify(payMethods));\n      if (typeof renderPublicPayTab === 'function') renderPublicPayTab();\n      if (typeof renderAdminQrManager === 'function') renderAdminQrManager();\n    }\n  }, e => setListenerError('settings', e));\n\n  db.doc(fbDocPath('queues')).onSnapshot(snap => {\n    clearListenerError('queues');\n    if (!snap.exists) return;\n    const data = snap.data().data;\n    if (data) {\n      localStorage.setItem(LS.queues, JSON.stringify(data));\n      if (typeof renderQueueModule === 'function') renderQueueModule();\n    }\n  }, e => setListenerError('queues', e));\n\n  db.doc(fbDocPath('courts')).onSnapshot(snap => {\n    clearListenerError('courts');\n    if (!snap.exists) return;\n    const data = snap.data().data;\n    if (data) {\n      COURTS = data;\n      localStorage.setItem(LS.courts, JSON.stringify(data));\n      renderCourtTabs();\n      renderAdminCourts();\n      renderSchedule();\n      if (typeof renderDateSlotPreview === 'function') renderDateSlotPreview();\n      populateCourtSelectors();\n      if (typeof updateStaffNote === 'function') updateStaffNote();\n    }\n  }, e => setListenerError('courts', e));\n}",
    "count": 1
  },
  {
    "from": "      const bkId = btn.dataset.payPending;\n      const bk = bookings.find(b=>b.id===bkId);\n      if(!bk) return;\n      const inputPin = prompt(`Enter Booking PIN for ${bk.name}'s reservation:`);\n      if(inputPin === null) return;\n      if(inputPin === bk.pin || inputPin === getPin() || inputPin === '1234'){\n        _currentProofBookingId = bk.id;\n        document.querySelector('[data-nav=\"payment\"]').click();\n        toast(`Booking verified! Upload your payment proof or scan QR for ${fmtMoney(sumCourtRate(bk.court, bk.start, bk.end))}.`);\n      } else {\n        alert('Incorrect Booking PIN!');\n      }\n    });",
    "to": "      const bkId = btn.dataset.payPending;\n      const bk = bookings.find(b=>b.id===bkId);\n      if(!bk) return;\n      if(!tryBookingPinGate('pay_' + bkId)) return;\n      const inputPin = prompt(`Enter Booking PIN for ${bk.name}'s reservation:`);\n      if(inputPin === null) return;\n      const correct = inputPin === bk.pin || inputPin === getPin() || inputPin === '1234';\n      reportBookingPinResult('pay_' + bkId, correct);\n      if(correct){\n        _currentProofBookingId = bk.id;\n        document.querySelector('[data-nav=\"payment\"]').click();\n        toast(`Booking verified! Upload your payment proof or scan QR for ${fmtMoney(sumCourtRate(bk.court, bk.start, bk.end))}.`);\n      }\n    });",
    "count": 1
  },
  {
    "from": "      const bkId = btn.dataset.cancelBooking;\n      const bk = bookings.find(b=>b.id===bkId);\n      if(!bk) return;\n      const inputPin = prompt(`Enter Booking PIN to cancel ${bk.name}'s reservation:`);\n      if(inputPin === null) return;\n      if(inputPin === bk.pin || inputPin === getPin() || inputPin === '1234'){\n        if(confirm(`Cancel booking for ${bk.name} on ${bk.date} at ${bk.startTime}? This cannot be undone.`)){\n          removeBooking(bkId);\n          renderSchedule();\n          renderBookingsList();\n          if(adminUnlocked) renderAdminBookings();\n          toast('Booking cancelled successfully.');\n        }\n      } else {\n        alert('Incorrect Booking PIN!');\n      }\n    });",
    "to": "      const bkId = btn.dataset.cancelBooking;\n      const bk = bookings.find(b=>b.id===bkId);\n      if(!bk) return;\n      if(!tryBookingPinGate('cancel_' + bkId)) return;\n      const inputPin = prompt(`Enter Booking PIN to cancel ${bk.name}'s reservation:`);\n      if(inputPin === null) return;\n      const correct = inputPin === bk.pin || inputPin === getPin() || inputPin === '1234';\n      reportBookingPinResult('cancel_' + bkId, correct);\n      if(correct){\n        if(confirm(`Cancel booking for ${bk.name} on ${bk.date} at ${bk.startTime}? This cannot be undone.`)){\n          removeBooking(bkId);\n          renderSchedule();\n          renderBookingsList();\n          if(adminUnlocked) renderAdminBookings();\n          toast('Booking cancelled successfully.');\n        }\n      }\n    });",
    "count": 1
  },
  {
    "from": "/* ---------- Toast ---------- */\nlet toastTimer;",
    "to": "/* ---------- Booking PIN gate: attempt tracking + brief cooldown ----------\n   The pay-pending / cancel-booking PIN prompts below used to just\n   alert('Incorrect Booking PIN!') in an infinite bare loop. The state\n   machine (attempt counting + cooldown window) is pure logic in\n   pin-gate.js (PinGate) so it's unit-testable; this is just the DOM-side\n   prompt()/alert() wiring around it, one independent record per\n   booking+action key so a wrong guess on one booking never penalizes\n   another. This is a walk-in booking PIN, not a security-critical\n   account, so a short cooldown is enough -- not a permanent lockout. */\nconst _bookingPinRecords = new Map();\nfunction tryBookingPinGate(key){\n  const check = PinGate.checkGate(_bookingPinRecords.get(key), Date.now());\n  _bookingPinRecords.set(key, check.record);\n  if(check.blocked){\n    alert(`Too many incorrect PIN attempts. Please wait ${check.secondsLeft}s before trying again.`);\n    return false;\n  }\n  return true;\n}\nfunction reportBookingPinResult(key, correct){\n  const result = PinGate.recordResult(_bookingPinRecords.get(key), correct, { nowMs: Date.now() });\n  _bookingPinRecords.set(key, result.record);\n  if(result.outcome === 'cooldown'){\n    alert(`Incorrect Booking PIN. Too many wrong attempts -- please wait ${result.cooldownSeconds}s before trying again.`);\n  } else if(result.outcome === 'wrong'){\n    alert(`Incorrect Booking PIN! (${result.attemptsLeft} attempt${result.attemptsLeft === 1 ? '' : 's'} left before a short cooldown)`);\n  }\n}\n\n/* ---------- Toast ---------- */\nlet toastTimer;",
    "count": 1
  },
  {
    "from": "/* ---------- Init ---------- */\nasync function initializeApp() {",
    "to": "/* ---------- Load-screen timeout ----------\n   initializeApp() awaits loadClientConfig()+loadTenantStatus() with no\n   client-side timeout, so #loadingScreen never gets a fallback if that\n   hangs (e.g. a very slow or stalled connection). Show a \"taking longer\n   than expected\" message with a Retry button INSIDE the existing\n   loading screen after LOAD_TIMEOUT_MS -- the spinner/text stay, this\n   only augments it. If the load finishes first, the timer is cleared\n   and this never shows. */\nconst LOAD_TIMEOUT_MS = 10000;\nlet _loadTimeoutTimer = null;\nfunction armLoadTimeout() {\n  clearTimeout(_loadTimeoutTimer);\n  _loadTimeoutTimer = setTimeout(showLoadTimeoutMessage, LOAD_TIMEOUT_MS);\n}\nfunction disarmLoadTimeout() {\n  clearTimeout(_loadTimeoutTimer);\n  _loadTimeoutTimer = null;\n}\nfunction showLoadTimeoutMessage() {\n  const msg = document.getElementById('loadingTimeoutMsg');\n  if (msg) msg.style.display = 'block';\n}\ndocument.getElementById('loadingTimeoutRetryBtn')?.addEventListener('click', () => location.reload());\n\n/* ---------- Init ---------- */\nasync function initializeApp() {",
    "count": 1
  },
  {
    "from": "  // Only now does the page actually reflect this tenant -- safe to reveal it.\n  const loadingScreen = document.getElementById('loadingScreen');",
    "to": "  // Only now does the page actually reflect this tenant -- safe to reveal it.\n  disarmLoadTimeout();\n  const loadingScreen = document.getElementById('loadingScreen');",
    "count": 1
  },
  {
    "from": "initializeApp();\nloadHomeTournaments();",
    "to": "armLoadTimeout();\ninitializeApp();\nloadHomeTournaments();",
    "count": 1
  },
  {
    "from": "offlineBar.style.color = '';\n        offlineBar.textContent = '⚡ You\\'re offline — changes will sync when reconnected';\n      }, 2500);",
    "to": "offlineBar.style.color = '';\n        offlineBar.textContent = '⚡ You\\'re offline — booking actions won\\'t work until you\\'re back online';\n      }, 2500);",
    "count": 1
  }
];
const ADDITION_RES = [];
function bodyOf(html) { const h = norm(html); return h.slice(h.indexOf('<body')); }
function reverseDelta(body, additions, substitutions) {
  let b = body;
  additions.forEach((a) => { if (b.split(a).length !== 2) throw new Error('addition not found exactly once: ' + a.slice(0, 60)); b = b.replace(a, () => ''); });
  substitutions.forEach((s) => { if (b.split(s.to).length - 1 !== s.count) throw new Error('substitution count mismatch: ' + s.to); b = b.split(s.to).join(s.from); });
  return b;
}
function describeIndex(currentHtml, baselineHtml) {
  const cur = bodyOf(currentHtml), base = bodyOf(baselineHtml);
  const additions = ADDITION_RES.map((re) => { const m = re.exec(cur); if (!m) throw new Error('allowed addition missing: ' + re); return m[0]; });
  const reversed = reverseDelta(cur, additions, SUBSTITUTIONS);
  if (reversed !== base) throw new Error('index.html body differs from ' + BASELINE_REF + ' by more than the allowed delta');
  const bt = classTokens(base), ct = classTokens(cur), delta = {};
  Object.keys(ct).forEach((t) => { if (ct[t] !== (bt[t] || 0)) delta[t] = ct[t] - (bt[t] || 0); });
  Object.keys(bt).forEach((t) => { if (!(t in ct)) delta[t] = -bt[t]; });
  const dh = describe(currentHtml), bh = describe(baselineHtml);
  if (dh.headBaseSha256 !== bh.headBaseSha256) throw new Error('index.html <head> differs from the baseline by more than the wiring lines');
  return { baselineRef: BASELINE_REF, baselineBodySha256: sha(base), headBaseSha256: bh.headBaseSha256, baselineClassTokens: bt, classTokenDelta: delta, additions, substitutions: SUBSTITUTIONS };
}

function build(readFn, baselineIndex) {
  const out = { _doc: 'Light-mode parity fixture for the Phase 3a pages. Regenerate deliberately: node scripts/update-light-parity.js (see its header and ARCHITECTURE.md).', pages: {} };
  PAGES.forEach((p) => { out.pages[p] = describe(readFn(p)); });
  if (baselineIndex !== undefined) out.index = describeIndex(readFn('index.html'), baselineIndex);
  return out;
}
module.exports = { describeIndex, reverseDelta, bodyOf, BASELINE_REF, PAGES, WIRING, describe, build, classTokens, norm, sha };

if (require.main === module) {
  const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
  const i = process.argv.indexOf('--verify-against');
  if (i > 0) {
    const ref = process.argv[i + 1];
    PAGES.forEach((p) => {
      const r = cp.spawnSync('git', ['show', ref + ':' + p], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
      if (r.status !== 0) throw new Error('git show failed for ' + p);
      const a = describe(r.stdout), b = describe(read(p));
      if (a.bodySha256 !== b.bodySha256 || a.headBaseSha256 !== b.headBaseSha256 || a.classTokensSha256 !== b.classTokensSha256) { console.error('REFUSING: ' + p + ' head/body/classes differ from ' + ref); process.exit(1); }
    });
    console.log('verified: bodies and class multisets identical to ' + process.argv[i + 1]);
  }
  fs.mkdirSync(path.join(ROOT, 'tests', 'fixtures'), { recursive: true });
  const bi = cp.spawnSync('git', ['show', BASELINE_REF + ':index.html'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (bi.status !== 0) throw new Error('git show ' + BASELINE_REF + ':index.html failed');
  fs.writeFileSync(path.join(ROOT, 'tests', 'fixtures', 'light-parity.json'), JSON.stringify(build(read, bi.stdout), null, 2) + '\n');
  console.log('wrote tests/fixtures/light-parity.json');
}
