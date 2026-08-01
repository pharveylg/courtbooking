/* ============================================================================
   CLIENT CONFIG — WHITE-LABEL DEPLOYMENT FILE
   ----------------------------------------------------------------------------
   Each client deployment gets its OWN copy of this file.
   Copy this file, change the values below, and deploy — no other edits needed.

   SETUP CHECKLIST (30–60 min per client):
     1. Create Firebase project + enable Firestore
     2. Paste Firebase keys into index.html (FIREBASE_CONFIG block)
     3. Edit the values in THIS file (branding, rates, hours, contact)
     4. Create Vercel project → connect repo → deploy
     5. (Optional) Point a custom domain

   OWNERSHIP NOTE:
     - Developer retains IP of the software. Client receives a usage license.
     - Client owns all data entered into their deployment.
   ========================================================================== */

window.CLIENT_CONFIG = {

  /* ------------------------------------------------------------------------
     BUSINESS IDENTITY
  ------------------------------------------------------------------------ */
  business: {
    name:      'WHITE KITCHEN',                 // Shown in header + footer + email subject
    sub:       'Pickleball Court • Single Court', // Header subtitle line
    tagline:   'Reserve the court.\nOwn the rally.', // Hero headline (use \n for line break)
    location:  'Single Court • Davao',          // Hero badge
  },

  /* ------------------------------------------------------------------------
     CONTACT INFO  (shown in footer + Payment tab)
     Leave blank ('') to hide a field.
  ------------------------------------------------------------------------ */
  contact: {
    address:   '',                              // e.g. '123 Court St., Davao City'
    phone:     '',                              // e.g. '+63 917 888 0123'
    email:     '',                              // e.g. 'book@whitekitchen.ph'
    facebook:  '',                              // full URL
    instagram: '',                              // full URL
  },

  /* ------------------------------------------------------------------------
     BRANDING
     logoUrl:   Direct image URL (PNG/SVG). Leave '' to show text monogram.
     faviconUrl: Direct image URL for the browser tab icon.
     monogram:  1–2 letters used when logoUrl is empty.
  ------------------------------------------------------------------------ */
  branding: {
    logoUrl:    '',
    faviconUrl: '',
    monogram:   'WK',
  },

  /* ------------------------------------------------------------------------
     THEME COLORS
     The entire UI palette remaps from these values at runtime.
  ------------------------------------------------------------------------ */
  theme: {
    primary:      '#D6FF5F',  // Accent / CTA buttons / highlights (lime)
    primaryHover: '#CBF052',  // Accent hover state
    dark:         '#201C19',  // Dark cards, header text, nav (near-black)
    bg:           '#FFFBF5',  // Page background (warm cream)
    border:       '#EAE0D5',  // Card borders
    borderSoft:   '#F1E9DF',  // Inner dividers / soft fills
    staff:        '#FF8A5B',  // Staff-reserved badge color
    openPlay:     '#9B8EFF',  // Open Play badge color
    queue:        '#4ADE80',  // Open / queue green
    pending:      '#FDBA74',  // Pending amber
  },

  /* ------------------------------------------------------------------------
     CURRENCY
  ------------------------------------------------------------------------ */
  currency: '₱',

  /* ------------------------------------------------------------------------
     RATES
  ------------------------------------------------------------------------ */
  rates: {
    hourly:      300,   // Reservation rate per hour
    queuePerHead: 100,  // Morning walk-in / queue rate per head
  },

  /* ------------------------------------------------------------------------
     OPERATING HOURS  (24-hour integers)
     White Kitchen default: 7AM–12PM queue, 1PM–10PM reservations.

     For other clients, change freely — the schedule, dropdowns,
     slot preview, and validation all adapt automatically.
     Booking slots always remain 1-hour increments.

     queueStart    : First morning hour (queue / walk-in begins)
     queueEnd      : Morning session ends (exclusive) — e.g. 12 = ends noon
     bookingStart  : Afternoon reservations open — e.g. 13 = 1PM
     close         : Court closes (exclusive) — e.g. 22 = last slot 9–10PM
  ------------------------------------------------------------------------ */
  hours: {
    queueStart:   7,
    queueEnd:     12,
    bookingStart: 13,
    close:        22,
  },

  /* ------------------------------------------------------------------------
     STAFF RESERVED BLOCK
     days      : Array of weekdays (0=Sun ... 6=Sat) staff block applies
     startHour : Block start (24h)
     endHour   : Block end (24h, exclusive)
     label     : Short label shown on badges
  ------------------------------------------------------------------------ */
  staff: {
    days:      [0, 2, 4, 6],   // Sun, Tue, Thu, Sat
    startHour: 17,             // 5 PM
    endHour:   22,             // 10 PM
    label:     'STAFF',
  },

  /* ------------------------------------------------------------------------
     BOOKING POLICY
     maxDaysAhead       : How far in the future the calendar allows selection
     maxHoursPerBooking : Longest single reservation (0 = unlimited)
  ------------------------------------------------------------------------ */
  booking: {
    maxDaysAhead:       60,
    maxHoursPerBooking: 0,
  },
};
