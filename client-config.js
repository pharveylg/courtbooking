/* ============================================================================
   CLIENT CONFIG — shared defaults for every tenant
   ----------------------------------------------------------------------------
   One deployment (courts.dulahq.app, Firebase project courtbooking-85175)
   serves every tenant — there are no per-client branches or separate
   deployments (see CLIENTS.md). This file supplies the plain, grey,
   client-agnostic DEFAULTS every tenant starts from.

   A tenant's real branding/theme/rates/hours lives in Firestore at
   clients/{slug}/config/state (set from that tenant's own Admin →
   Branding & Site Settings) and overrides these defaults at runtime for
   anyone visiting with ?client=slug. This file is only what a
   brand-new, not-yet-configured tenant — or the bare site with no
   ?client= at all — sees before that.

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

  /* Default schedule: all operating hours (7AM–10PM) are bookable */
  hours: {
    queueStart:   7,
    queueEnd:     7,      // No queue-only window by default; all hours 7AM–10PM are bookable
    bookingStart: 7,
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
