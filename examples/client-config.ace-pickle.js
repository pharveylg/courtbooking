// ============================================================
// EXAMPLE CLIENT: ACE PICKLE CLUB
// ============================================================
// How to use:
//   1. Copy the repo's root client-config.js into a new client branch
//   2. Replace its contents with a file like this one
//   3. Edit the values below — nothing else in the app changes
//
// This example shows a client that is DIFFERENT from White Kitchen:
//   - Cool navy + ice-blue identity (vs. lime + cream)
//   - Higher rates, longer operating hours
//   - No staff-reserved days
//   - Its own contact details and payment accounts
// ============================================================

window.CLIENT_CONFIG = {
  clientId: "ace-pickle",
  isWhiteKitchen: false,   // ← unlocks dynamic operating hours

  branding: {
    businessName: "Ace Pickle",
    productName: "Ace Pickle Club",
    shortName: "AP",            // used as the monogram if no logoUrl
    tagline: "Serve it. Smash it. Repeat it.",
    subline: "Pickleball Club • Single Court",
    locationLabel: "BGC, Taguig",
    logoUrl: "",                // paste a direct image URL, or leave blank for "AP" monogram
    faviconUrl: ""
  },

  theme: {
    primary:   "#7DD3FC",   // CTA buttons, accents (keep light enough for dark text)
    dark:      "#0C1B2A",   // headers, dark cards, nav
    bg:        "#F4F8FB",   // page background
    surface:   "#FFFFFF",   // cards, panels
    border:    "#DCE7F0",   // borders, dividers
    muted:     "#E8F1F8",   // chips, soft fills
    staff:     "#F59E0B",   // staff-reserved slots
    pending:   "#FBBF24",   // pending bookings
    reserved:  "#0C1B2A",   // reserved bookings
    open:      "#34D399",   // open slots
    openPlay:  "#22D3EE"    // open play blocks
  },

  currency: { symbol: "₱", code: "PHP" },

  rates: {
    reservationPerHour: 450,     // ₱450/hr instead of ₱300
    morningQueuePerHead: 120
  },

  schedule: {
    operatingHours: { open: 6, close: 23 },   // 6 AM – 11 PM

    // With isWhiteKitchen:false, these drive the reservation dropdowns.
    queueHours:       { start: 6,  end: 12 },
    reservationHours: { start: 12, end: 23 },

    maxBookingHours: 3,
    slotDurationHours: 1,

    // No staff-reserved days for this client
    staffReserveDefaults: { "0": false, "2": false, "4": false, "6": false },
    staffReserveWindow:   { start: 17, end: 22 }
  },

  contact: {
    address: "28th St cor 5th Ave, BGC, Taguig",
    phone: "0917-555-0188",
    email: "play@acepickle.ph",
    facebook: "facebook.com/acepickleclub",
    instagram: "@acepickleclub",
    website: "acepickle.ph"
  },

  policies: {
    advanceBookingDays: 14,
    cancellationPolicy: "Free cancellation up to 2 hours before your slot.",
    walkInPolicy: "Morning queue is walk-in. First to arrive, first to play.",
    paymentNote: "Pay via GCash or Maya, then show your reference at the counter."
  },

  paymentChannels: {
    gcash: {
      name: "GCash",
      badge: "GCash Payment",
      icon: "G", color: "#0055FE",
      account: "0917-555-0188 • Ace Pickle Club"
    },
    maya: {
      name: "Maya",
      badge: "Maya e-Wallet",
      icon: "M", color: "#00BE6A",
      account: "0917-555-0188 • Ace Pickle Club"
    },
    bpi: {
      name: "BPI / Bank",
      badge: "BPI InstaPay",
      icon: "B", color: "#B11016",
      account: "Account # 8800-1122-33 • Ace Pickle Club"
    }
  }
};
