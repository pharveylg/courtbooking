# Multi-Tenancy Setup Guide

This guide walks you through setting up your first client in the multi-tenant court booking system.

## Prerequisites

- Firebase project created and configured
- Firestore database initialized
- App deployed to Vercel
- Domain purchased and connected to Vercel

---

## Step 1: Create Your First Client in Firestore

### Option A: Using Firebase Console (Recommended for First Client)

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Select your project (e.g., `courtbooking-85175`)
3. Navigate to **Firestore Database**
4. Click **Start collection**
5. Collection ID: `clients`
6. Document ID: `demo` (this will be your subdomain: `demo.yourdomain.com`)
7. Add the following fields:

```javascript
// Click "Add field" and create a map field called "data"
// Then add these nested fields inside "data":

data: {
  businessName: "Demo Pickleball Club",
  tagline: "Book courts, play pickleball",
  contactEmail: "demo@example.com",
  contactPhone: "+1234567890",
  address: "123 Demo Street, Demo City",
  theme: {
    primaryColor: "#3B82F6",
    primaryHover: "#2563EB",
    dark: "#1F2937",
    bg: "#F9FAFB",
    border: "#E5E7EB"
  },
  social: {
    facebook: "https://facebook.com/demo",
    instagram: "https://instagram.com/demo"
  },
  logoUrl: "",  // Optional: URL to logo image
  faviconUrl: "" // Optional: URL to favicon
}
```

8. Click **Save**

### Option B: Using Firebase CLI (Programmatic)

Create a file `setup-first-client.js`:

```javascript
const { initializeApp } = require('firebase/app');
const { getFirestore, doc, setDoc } = require('firebase/firestore');

// Your Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyAkf7GJ3mrEUtykHLQ3wizwfGpl5OugE2I",
  authDomain: "courtbooking-85175.firebaseapp.com",
  projectId: "courtbooking-85175",
  storageBucket: "courtbooking-85175.firebasestorage.app",
  messagingSenderId: "291819153596",
  appId: "1:291819153596:web:f31c27b24a5eaa718088b9"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function setupFirstClient() {
  const clientId = 'demo'; // This will be your subdomain
  
  const clientConfig = {
    data: {
      businessName: "Demo Pickleball Club",
      tagline: "Book courts, play pickleball",
      contactEmail: "demo@example.com",
      contactPhone: "+1234567890",
      address: "123 Demo Street, Demo City",
      theme: {
        primaryColor: "#3B82F6",
        primaryHover: "#2563EB",
        dark: "#1F2937",
        bg: "#F9FAFB",
        border: "#E5E7EB"
      },
      social: {
        facebook: "https://facebook.com/demo",
        instagram: "https://instagram.com/demo"
      },
      logoUrl: "",
      faviconUrl: ""
    }
  };

  try {
    await setDoc(doc(db, 'clients', clientId, 'config', 'state'), clientConfig);
    console.log(`✅ Client "${clientId}" created successfully!`);
    console.log(`📍 Access at: https://${clientId}.yourdomain.com`);
  } catch (error) {
    console.error('❌ Error creating client:', error);
  }
}

setupFirstClient();
```

Run it:
```bash
npm install firebase
node setup-first-client.js
```

---

## Step 2: Seed Initial Data for the Client

After creating the client config, you need to seed the initial data (courts, settings, etc.).

### Create Initial Courts

In Firebase Console:

1. Navigate to: `clients` → `demo` → **Start collection**
2. Collection ID: `courts`
3. Document ID: `state`
4. Add field:

```javascript
data: [
  {
    id: "court1",
    name: "Main Court",
    startHour: 8,
    endHour: 22,
    active: true
  },
  {
    id: "court2",
    name: "Court 2",
    startHour: 9,
    endHour: 21,
    active: true
  }
]
```

### Create Initial Settings

1. Navigate to: `clients` → `demo` → **Start collection**
2. Collection ID: `settings`
3. Document ID: `state`
4. Add field:

```javascript
data: {
  pin: "1234",
  payMethods: {},
  rates: {
    hourly: 300,
    queuePerHead: 100
  },
  hours: {
    queueStart: 7,
    queueEnd: 12,
    bookingStart: 12,
    close: 22
  },
  staff: {
    days: [0, 2, 4, 6],
    startHour: 17,
    endHour: 22,
    label: "Staff"
  }
}
```

---

## Step 3: Set Up DNS for Subdomain

### For Vercel Deployment

1. Go to your domain registrar (e.g., Namecheap, GoDaddy, Cloudflare)
2. Add a **CNAME record**:
   - **Host/Name**: `demo` (or `*` for wildcard)
   - **Value**: `cname.vercel-dns.com`
   - **TTL**: Automatic or 3600

3. Go to [Vercel Dashboard](https://vercel.com/dashboard)
4. Select your project
5. Go to **Settings** → **Domains**
6. Add domain: `demo.yourdomain.com`
7. Vercel will verify the DNS and issue SSL certificate

### Wildcard Subdomain (Optional - for unlimited clients)

If you want to support unlimited clients without adding each one manually:

1. Add a **wildcard CNAME record**:
   - **Host/Name**: `*`
   - **Value**: `cname.vercel-dns.com`

2. In Vercel, add a wildcard domain: `*.yourdomain.com`

---

## Step 4: Test the Setup

1. Visit: `https://demo.yourdomain.com`
2. You should see:
   - ✅ "Demo Pickleball Club" branding
   - ✅ Blue theme (#3B82F6)
   - ✅ Two courts available
   - ✅ Demo mode badge (if no Firebase config in client-config.js)
   - ✅ OR live data from Firestore (if Firebase config is present)

3. Test functionality:
   - Create a booking
   - Check Firebase Console → Firestore → `clients/demo/bookings/state`
   - Verify the booking appears in the `data` array

---

## Step 5: Add More Clients

To add a new client, repeat Step 1 with a different Document ID:

```javascript
// New client: "acepickle"
// Will be accessible at: acepickle.yourdomain.com

await setDoc(doc(db, 'clients', 'acepickle', 'config', 'state'), {
  data: {
    businessName: "Ace Pickleball Academy",
    tagline: "Train like a pro",
    theme: {
      primaryColor: "#10B981",  // Green theme
      primaryHover: "#059669",
      // ... rest of theme
    }
  }
});
```

---

## Complete Client Config Reference

Here's a complete client config with all available fields:

```javascript
{
  data: {
    // Business Info
    businessName: "Your Business Name",
    tagline: "Your tagline here",
    
    // Contact
    contactEmail: "contact@example.com",
    contactPhone: "+1234567890",
    address: "123 Street, City, Country",
    
    // Branding
    logoUrl: "https://example.com/logo.png",      // Optional
    faviconUrl: "https://example.com/favicon.ico", // Optional
    
    // Theme Colors
    theme: {
      primaryColor: "#3B82F6",    // Main brand color
      primaryHover: "#2563EB",    // Hover state
      dark: "#1F2937",            // Dark backgrounds
      bg: "#F9FAFB",              // Page background
      border: "#E5E7EB",          // Borders
      success: "#10B981",         // Success states
      warning: "#F59E0B",         // Warning states
      error: "#EF4444"            // Error states
    },
    
    // Social Links
    social: {
      facebook: "https://facebook.com/yourpage",
      instagram: "https://instagram.com/yourpage",
      twitter: "https://twitter.com/yourpage",
      website: "https://yourwebsite.com"
    },
    
    // Custom CSS (advanced)
    customCSS: `
      .hero-section { background: linear-gradient(...); }
    `
  }
}
```

---

## Troubleshooting

### "Demo mode" badge appears
- **Cause**: `firebase-config.js` has placeholder values
- **Solution**: Add your Firebase config to `firebase-config.js` and redeploy

### Client config not loading
- **Check**: Firestore path is correct: `clients/{clientId}/config/state`
- **Check**: Document has a `data` field (map type)
- **Check**: Browser console for errors

### Subdomain not working
- **Check**: DNS CNAME record is pointing to `cname.vercel-dns.com`
- **Check**: Domain is added in Vercel dashboard
- **Check**: SSL certificate is issued (can take up to 24 hours)

### Data not isolated between clients
- **Check**: Subdomain matches the Firestore document ID exactly
- **Check**: No hardcoded collection paths in code
- **Check**: Browser localStorage is cleared between testing different clients

---

## Next Steps

1. **Customize themes**: Each client can have unique colors and branding
2. **Upload logos**: Store in Firebase Storage under `clients/{clientId}/assets/`
3. **Monitor usage**: Check Firestore usage per client in Firebase Console
4. **Backup data**: Set up Firestore export schedule
5. **Scale**: Add more clients by repeating Step 1

---

## Support

For issues or questions:
- Check Firebase Console logs
- Review browser console for errors
- Verify Firestore security rules are deployed
- Ensure Vercel deployment is successful
