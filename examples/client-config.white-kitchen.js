/* ============================================================================
   CLIENT CONFIG — WHITE KITCHEN PICKLEBALL COURT
   ----------------------------------------------------------------------------
   This is the live configuration for the White Kitchen deployment.
   On the client/white-kitchen branch, this file's contents are copied
   over the root client-config.js.

   To spin up THIS client from scratch:
     git checkout -b client/white-kitchen
     cp examples/client-config.white-kitchen.js client-config.js
     cp examples/firebase-config.white-kitchen.js firebase-config.js
     git commit -am "White Kitchen deployment"
   ========================================================================== */

window.CLIENT_CONFIG = {

  /* ---- BUSINESS IDENTITY ---- */
  business: {
    name:      'WHITE KITCHEN',
    sub:       'Pickleball Court • Single Court',
    tagline:   'Reserve the court.\nOwn the rally.',
    location:  'Single Court • Davao',
  },

  /* ---- CONTACT (shown in footer + Payment tab) ---- */
  contact: {
    address:   '',
    phone:     '',
    email:     '',
    facebook:  '',
    instagram: '',
  },

  /* ---- BRANDING ---- */
  branding: {
    logoUrl:    '',
    faviconUrl: '',
    monogram:   'WK',
  },

  /* ---- THEME: lime + near-black signature ---- */
  theme: {
    primary:      '#D6FF5F',
    primaryHover: '#CBF052',
    dark:         '#201C19',
    bg:           '#FFFBF5',
    border:       '#EAE0D5',
    borderSoft:   '#F1E9DF',
    staff:        '#FF8A5B',
    openPlay:     '#9B8EFF',
    queue:        '#4ADE80',
    pending:      '#FDBA74',
  },

  currency: '₱',

  rates: {
    hourly:      300,
    queuePerHead: 100,
  },

  /* White Kitchen fixed schedule: 7AM–12PM queue, 1PM–10PM reservations */
  hours: {
    queueStart:   7,
    queueEnd:     12,
    bookingStart: 13,
    close:        22,
  },

  staff: {
    days:      [0, 2, 4, 6],   // Sun, Tue, Thu, Sat
    startHour: 17,
    endHour:   22,
    label:     'STAFF',
  },

  booking: {
    maxDaysAhead:       60,
    maxHoursPerBooking: 0,
  },
};
