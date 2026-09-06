# Sample Tenants Setup Guide

This guide will help you set up 4 sample tenants to test the multi-tenancy system.

## Sample Tenants Overview

| Tenant ID | Business Name | Theme | Courts | Bookings |
|-----------|---------------|-------|--------|----------|
| `demo` | Demo Pickleball Club | 🔵 Blue | 2 | 1 |
| `acepickle` | Ace Pickleball Academy | 🟢 Green | 4 | 2 |
| `smash-club` | Smash Pickleball Club | 🟠 Orange | 3 | 1 |
| `rally-point` | Rally Point Sports | 🟣 Purple | 4 | 0 |

**Admin PIN for all tenants:** `1234`

---

## Option 1: Firebase Admin SDK (Recommended)

This method bypasses Firestore security rules and is the easiest way to set up sample data.

### Prerequisites

1. Install Firebase Admin SDK:
   ```bash
   npm install firebase-admin
   ```

2. Download service account key:
   - Go to [Firebase Console](https://console.firebase.google.com)
   - Select your project (courtbooking-85175)
   - Click ⚙️ **Project Settings** → **Service accounts**
   - Click **Generate new private key**
   - Save the downloaded JSON file as `serviceAccountKey.json` in the `courtbooking` directory

### Run the Script

```bash
node setup-sample-tenants-admin.js
```

### Expected Output

```
🚀 Setting up sample tenants with Firebase Admin SDK...

📦 Setting up tenant: demo
  ✓ Creating config...
  ✓ Creating 2 courts...
  ✓ Creating settings (PIN: 1234)...
  ✓ Creating 1 sample bookings...
  ✓ Creating empty collections...
  ✅ Tenant "demo" created successfully

📦 Setting up tenant: acepickle
  ...

✅ All sample tenants created!
```

---

## Option 2: Firebase Console (Manual)

If you prefer not to use service account keys, you can create tenants manually.

### Step 1: Create First Tenant (demo)

1. Go to [Firebase Console](https://console.firebase.google.com) → **Firestore Database**

2. Click **Start collection**
   - Collection ID: `clients`
   - Document ID: `demo`
   - Click **Save**

3. Create config subcollection:
   - Click **Start collection** inside `demo`
   - Collection ID: `config`
   - Document ID: `state`
   - Add field: `data` (type: map)
   - Add nested fields:
     ```
     businessName: "Demo Pickleball Club"
     tagline: "Book courts, play pickleball"
     contactEmail: "demo@example.com"
     contactPhone: "+639171234567"
     address: "123 Demo Street, Makati City"
     theme: (map)
       primaryColor: "#3B82F6"
       primaryHover: "#2563EB"
       dark: "#1F2937"
       bg: "#F9FAFB"
       border: "#E5E7EB"
     social: (map)
       facebook: "https://facebook.com/demo"
       instagram: "https://instagram.com/demo"
     logoUrl: ""
     faviconUrl: ""
     heroHeadline: "Welcome to Demo Pickleball"
     heroSubheadline: "Book your court in seconds"
     ```

4. Create courts subcollection:
   - Collection ID: `courts`
   - Document ID: `state`
   - Add field: `data` (type: array)
   - Add 2 court objects:
     ```
     [
       { id: "court1", name: "Main Court", startHour: 8, endHour: 22, active: true },
       { id: "court2", name: "Court 2", startHour: 9, endHour: 21, active: true }
     ]
     ```

5. Create settings subcollection:
   - Collection ID: `settings`
   - Document ID: `state`
   - Add field: `data` (type: map)
     ```
     pin: "e4870ad7eb252a74b90f4c2c80aaec31844a74bb156e1806aaa0db7c21a31286"
     payMethods: {}
     ```

6. Create empty subcollections:
   - `bookings/state` → `{ data: [] }`
   - `openPlay/state` → `{ data: [] }`
   - `morning/state` → `{ data: {} }`
   - `staffReserve/state` → `{ data: {} }`
   - `queues/state` → `{ data: [] }`

### Step 2: Repeat for Other Tenants

Repeat the above steps for:
- `acepickle` (green theme, 4 courts)
- `smash-club` (orange theme, 3 courts)
- `rally-point` (purple theme, 4 courts)

Use the configurations from `setup-sample-tenants-admin.js` as reference.

---

## Testing the Tenants

### 1. Visit Each Tenant

Open these URLs in your browser:

- **Demo**: https://courtbooking-85175.web.app/?client=demo
- **Ace Pickleball**: https://courtbooking-85175.web.app/?client=acepickle
- **Smash Club**: https://courtbooking-85175.web.app/?client=smash-club
- **Rally Point**: https://courtbooking-85175.web.app/?client=rally-point

### 2. Verify Branding

Each tenant should show:
- ✅ Unique business name and tagline
- ✅ Different primary colors
- ✅ Custom hero headlines
- ✅ Tenant-specific courts

### 3. Test Admin Access

1. Click the **Staff** button
2. Enter PIN: `1234`
3. Verify you can see admin panel
4. Check that bookings are tenant-specific

### 4. Verify Data Isolation

1. Open browser DevTools → Console
2. Check for: `[CourtBooking] Tenant ID: {tenant-id}`
3. Verify Firestore reads are scoped to `clients/{tenant-id}/...`
4. Try changing the `?client=` parameter to access another tenant
   - Should work (different tenant data loads)
   - Each tenant's data remains isolated

### 5. Test Invalid Tenant

Visit: https://courtbooking-85175.web.app/?client=invalid-tenant-123

Expected behavior:
- ❌ Should show error or fallback to default
- ❌ Should NOT load any real tenant data

---

## Troubleshooting

### Script fails with "Cannot find module 'firebase-admin'"

```bash
npm install firebase-admin
```

### Script fails with "serviceAccountKey.json not found"

Download the service account key from Firebase Console:
- Project Settings → Service accounts → Generate new private key
- Rename the downloaded file to `serviceAccountKey.json`
- Place it in the `courtbooking` directory

### Script fails with "PERMISSION_DENIED"

This means Firestore security rules are blocking the writes. Use the Admin SDK script (`setup-sample-tenants-admin.js`) instead of the client SDK script.

### Tenant not loading in browser

1. Check browser console for errors
2. Verify tenant exists in Firestore: `clients/{tenant-id}/config/state`
3. Check tenant ID format (only lowercase alphanumeric + hyphens)
4. Verify Firestore security rules are deployed

### Admin PIN not working

- Default PIN is `1234`
- If you changed it, use the new PIN
- Check localStorage for `cb_adminPin_v7_{tenant-id}`

---

## Next Steps

After setting up sample tenants:

1. ✅ Test all 4 tenants in the browser
2. ✅ Verify data isolation between tenants
3. ✅ Test admin access with PIN `1234`
4. ✅ Check browser console for tenant ID
5. ✅ Deploy Firestore security rules (if not already done):
   ```bash
   firebase deploy --only firestore:rules
   ```

---

## Adding More Tenants

To add a new tenant, copy the configuration from `setup-sample-tenants-admin.js` and modify:

```javascript
{
  id: 'your-tenant-id',  // lowercase, alphanumeric, hyphens only
  config: {
    businessName: "Your Business Name",
    theme: {
      primaryColor: "#FF0000",  // Your brand color
      // ... other theme colors
    },
    // ... other config
  },
  courts: [
    // ... your courts
  ],
  bookings: []
}
```

Then run the script again or add manually via Firebase Console.

---

## Cleaning Up Sample Data

To remove sample tenants:

1. Go to Firebase Console → Firestore Database
2. Navigate to `clients` collection
3. Delete the tenant documents: `demo`, `acepickle`, `smash-club`, `rally-point`

Or use Firebase CLI:

```bash
firebase firestore:delete clients/demo --recursive
firebase firestore:delete clients/acepickle --recursive
firebase firestore:delete clients/smash-club --recursive
firebase firestore:delete clients/rally-point --recursive
```

---

## Support

For issues or questions:
- Check the main MULTI_TENANCY_SETUP.md for architecture details
- Review browser console for JavaScript errors
- Check Firebase Console for Firestore errors
- Verify Firestore security rules are deployed
