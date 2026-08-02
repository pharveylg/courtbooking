/* ============================================================================
   CLIENT CONFIG — NEUTRAL MAIN (GREY DEMO)
   ----------------------------------------------------------------------------
   The main branch ships a PLAIN, client-agnostic deployment:
   grey color scheme, generic branding, no business-specific details.

   Per-client deployments live on their own branches
   (client/white-kitchen, client/ace-pickle, ...) where this file is
   replaced. See NEW_CLIENT.md for the full runbook and
   examples/client-config.white-kitchen.js for a worked example.

   Every field below is optional — omit anything and the app falls back
   to its built-in defaults (the same grey scheme).
   ========================================================================== */

window.CLIENT_CONFIG = {

  /* ---- BUSINESS IDENTITY ---- */
  business: {
    name:      'COURT BOOKING',                 // header, footer, emails, page title
    sub:       'Pickleball • Single Court',     // header subtitle
    tagline:   'Book the court.\nRun the queue.', // hero headline (\n = line break)
    location:  'Single Court',                  // hero badge
  },

  /* ---- CONTACT (footer + Payment tab). Blank = hidden ---- */
  contact: {
    address:   '',
    phone:     '',
    email:     '',
    facebook:  '',
    instagram: '',
  },

  /* ---- BRANDING (blank logo = text monogram) ---- */
  branding: {
    logoUrl:    '',
    faviconUrl: '',
    monogram:   'CB',
  },

  /* ---- THEME: neutral graphite grey ---- */
  theme: {
    primary:      '#D4D4D8',   // CTA + accents (light grey, dark text)
    primaryHover: '#A1A1AA',
    dark:         '#18181B',   // headers, dark cards, nav
    bg:           '#FAFAFA',   // page background
    border:       '#E4E4E7',
    borderSoft:   '#F4F4F5',
    staff:        '#FB923C',   // staff-reserved (semantic)
    openPlay:     '#8B5CF6',   // open play blocks
    queue:        '#34D399',   // open / queue
    pending:      '#FBBF24',   // pending bookings
  },

  currency: '₱',

  rates: {
    hourly:      300,
    queuePerHead: 100,
  },

  /* Default schedule: 7AM–12PM queue, 1PM–10PM reservations */
  hours: {
    queueStart:   7,
    queueEnd:     12,
    bookingStart: 13,
    close:        22,
  },

  staff: {
    days:      [0, 2, 4, 6],
    startHour: 17,
    endHour:   22,
    label:     'STAFF',
  },

  booking: {
    maxDaysAhead:       60,
    maxHoursPerBooking: 0,
  },
};
