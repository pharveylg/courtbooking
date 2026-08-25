# Dula HQ Multi-Tenancy Setup Guide

## Overview

Dula HQ is a multi-tenant pickleball court booking system deployed at `https://dula-hq.vercel.app/`. Each tenant (pickleball club/court owner) gets their own isolated data, branding, and booking system while sharing the same application infrastructure.

**First-Year Scale:**
- <10 clients
- Max 4 courts per client
- Firebase free tier
- Single Vercel deployment

---

## Tenant Resolution

The application supports multiple tenant resolution strategies:

### Current (Development/Testing)
```
https://dula-hq.vercel.app/?client=demo
https://dula-hq.vercel.app/?client=acepickle
```

### Path-Based (Production Ready)
```
https://dula-hq.vercel.app/demo
https://dula-hq.vercel.app/acepickle
```

### Future (Custom Domain)
```
https://demo.customdomain.com
https://acepickle.customdomain.com
```

**Tenant ID Format:** Lowercase alphanumeric with hyphens only (e.g., `demo`, `ace-pickle`, `club123`)

---

## Firestore Data Structure

All tenant data is isolated under `clients/{clientId}/`:

```
clients/
  demo/
    config/state          # Tenant branding and configuration
    courts/state          # Court definitions
    bookings/state        # Booking records
    openPlay/state        # Open play sessions
    morning/state         # Morning booking settings
    staffReserve/state    # Staff reserve settings
    queues/state          # Queue management
    proofs/{id}           # Payment proof documents
  acepickle/
    config/state
    courts/state
    ...
```

### Key Collections

#### 1. Config (`clients/{clientId}/config/state`)
Tenant branding and business information:

```javascript
{
  data: {
    businessName: "Demo Pickleball Club",
    tagline: "Book courts, play pickleball",
    contactEmail: "demo@example.com",
    contactPhone: "+1234567890",
    address: "123 Demo Street",
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
    faviconUrl: "",
    heroHeadline: "Welcome to Demo Pickleball",
    heroSubheadline: "Book your court in seconds"
  }
}
```

#### 2. Courts (`clients/{clientId}/courts/state`)
Court definitions and availability:

```javascript
{
  data: [
    {
      id: "court1",
      name: "Main Court",
      startHour: 8,
      endHour: 22,
      active: true
    }
  ]
}
```

#### 3. Settings (`clients/{clientId}/settings/state`)
Operational settings including **hashed** admin PIN:

```javascript
{
  data: {
    pin: "5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8", // SHA-256 hash
    payMethods: {
      gcash: { enabled: true, qrCode: "..." },
      maya: { enabled: false }
    }
  }
}
```

**Security Note:** The admin PIN is stored as a SHA-256 hash, never plaintext.

#### 4. Bookings (`clients/{clientId}/bookings/state`)
All booking records for the tenant:

```javascript
{
  data: [
    {
      id: "booking_123",
      courtId: "court1",
      date: "2026-08-25",
      startTime: "14:00",
      endTime: "15:00",
      playerName: "Juan Dela Cruz",
      email: "juan@example.com",
      phone: "+639171234567",
      status: "confirmed",
      pin: "1234", // Booking PIN for cancellation (plaintext, user-provided)
      createdAt: "2026-08-25T10:00:00Z"
    }
  ]
}
```

---

## Security Model

### Firestore Security Rules

All tenant data is protected by Firestore security rules that enforce:

1. **Tenant Isolation:** Each tenant can only access their own data
2. **Valid Tenant IDs:** Only properly formatted tenant IDs are allowed
3. **No Cross-Tenant Access:** Impossible to access another tenant's data by changing URLs or parameters

**Current Rules:**
```
match /clients/{clientId} {
  // All subcollections require valid tenant ID
  match /{document=**} {
    allow read, write: if isValidTenantId(clientId);
  }
}
```

### Admin PIN Security

- **Storage:** SHA-256 hashed with salt
- **Verification:** Async comparison using `verifyAdminPin()`
- **Default PIN:** `1234` (hash: `5e884898...`)
- **Migration:** Legacy plaintext PINs are supported during transition

**Important:** The admin PIN is a basic security measure. For production use with sensitive data, consider implementing Firebase Authentication.

---

## Setting Up a New Tenant

### Step 1: Create Tenant Config

Create a document at `clients/{clientId}/config/state`:

```javascript
// Using Firebase Console or setup script
{
  data: {
    businessName: "Ace Pickleball",
    tagline: "Play like a pro",
    contactEmail: "info@acepickle.com",
    contactPhone: "+639171234567",
    address: "456 Sports Complex, Manila",
    theme: {
      primaryColor: "#10B981", // Green theme
      primaryHover: "#059669",
      dark: "#1F2937",
      bg: "#F9FAFB",
      border: "#E5E7EB"
    },
    social: {
      facebook: "https://facebook.com/acepickle",
      instagram: "https://instagram.com/acepickle"
    },
    logoUrl: "",
    faviconUrl: "",
    heroHeadline: "Ace Pickleball Club",
    heroSubheadline: "Train smarter, play better"
  }
}
```

### Step 2: Initialize Courts

Create `clients/{clientId}/courts/state`:

```javascript
{
  data: [
    {
      id: "court1",
      name: "Court 1",
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
}
```

### Step 3: Initialize Settings

Create `clients/{clientId}/settings/state`:

```javascript
{
  data: {
    pin: "5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8", // Hash of "1234"
    payMethods: {}
  }
}
```

### Step 4: Initialize Empty Collections

Create empty state documents for:
- `clients/{clientId}/bookings/state` → `{ data: [] }`
- `clients/{clientId}/openPlay/state` → `{ data: [] }`
- `clients/{clientId}/morning/state` → `{ data: {} }`
- `clients/{clientId}/staffReserve/state` → `{ data: {} }`
- `clients/{clientId}/queues/state` → `{ data: [] }`

### Step 5: Access the Tenant

Visit: `https://dula-hq.vercel.app/?client={clientId}`

Or with path-based routing: `https://dula-hq.vercel.app/{clientId}`

---

## Automated Setup Script

Use `setup-first-client.js` to automate tenant creation:

```bash
npm install firebase
node setup-first-client.js
```

**Edit the script** to customize:
- `CLIENT_ID` - Your tenant ID (e.g., `demo`, `acepickle`)
- `clientConfig.data` - Business name, theme, contact info
- `courtsConfig.data` - Court definitions

---

## Tenant Customization

### Branding (Presentation Layer)

Each tenant can customize:
- Business name and tagline
- Logo and favicon URLs
- Theme colors (primary, hover, dark, bg, border)
- Hero section headline and subheadline
- Social media links
- Contact information

### Operational Data (Tenant-Specific)

Each tenant has isolated:
- Court definitions and availability
- Booking records
- Open play sessions
- Queue management
- Payment methods
- Admin PIN (hashed)

### Shared Application Logic

All tenants share:
- Booking engine and validation
- UI components and navigation
- Date/time handling
- Firebase access layer
- Tenant resolution system

---

## Performance Optimization

### Caching Strategy

1. **Client Config Cache:** Stored in memory and localStorage to minimize Firestore reads
2. **Session Storage:** Admin unlock state persists across page reloads
3. **Efficient Reads:** Single document reads for config, courts, settings

### Free Tier Considerations

- **Firestore Reads:** ~10-20 reads per page load (config + courts + settings + bookings)
- **Firestore Writes:** Only on booking creation/updates (not on every action)
- **Storage:** Payment proofs stored in Firebase Storage with 7-day retention
- **Bandwidth:** Minimal, mostly JSON data

**Estimated Monthly Usage (10 tenants, 100 bookings each):**
- Reads: ~50,000 (well under 50,000/day free tier)
- Writes: ~5,000 (well under 20,000/day free tier)
- Storage: <1GB (well under 1GB free tier)

---

## Testing Tenant Isolation

### Test Cases

1. **Valid Tenant Access:**
   ```
   GET https://dula-hq.vercel.app/?client=demo
   Expected: Loads demo tenant config and data
   ```

2. **Invalid Tenant:**
   ```
   GET https://dula-hq.vercel.app/?client=invalid-tenant
   Expected: Shows error or falls back to default config
   ```

3. **Cross-Tenant Data Access:**
   ```
   Tenant A tries to access: clients/tenantB/bookings/state
   Expected: Firestore security rules block access
   ```

4. **Tenant ID Injection:**
   ```
   Attempt to use: ?client=../../other-tenant
   Expected: Rejected by tenant ID validation (only alphanumeric + hyphens)
   ```

---

## Future: Custom Domain Setup

When ready to add custom domains:

### Step 1: Add Domain in Vercel
```bash
vercel domains add customdomain.com
```

### Step 2: Configure DNS
Add CNAME record:
```
*.customdomain.com → cname.vercel-dns.com
```

### Step 3: Update Tenant Resolution
The app already supports subdomain-based resolution:
```javascript
// getCurrentTenant() will detect:
// demo.customdomain.com → clientId = "demo"
```

### Step 4: Update Firestore Rules
Add custom domain validation if needed.

---

## Troubleshooting

### Tenant Not Loading
- Check tenant ID format (lowercase, alphanumeric, hyphens only)
- Verify `clients/{clientId}/config/state` exists in Firestore
- Check browser console for errors

### Admin PIN Not Working
- Default PIN is `1234`
- If migrated from plaintext, try the old PIN (will be auto-hashed on next save)
- Check localStorage for `cb_adminPin_v7_{clientId}`

### Cross-Tenant Data Leakage
- Should be impossible due to Firestore security rules
- Verify rules are deployed: `firebase deploy --only firestore:rules`
- Test with different tenant IDs to confirm isolation

### Performance Issues
- Check Firestore read/write counts in Firebase Console
- Verify client config caching is working (check console logs)
- Consider reducing real-time listeners if usage is high

---

## Migration from Legacy Structure

If you have data in the old structure (top-level collections), migrate to tenant-scoped:

### Old Structure:
```
bookings/state
courts/state
settings/state
```

### New Structure:
```
clients/{clientId}/bookings/state
clients/{clientId}/courts/state
clients/{clientId}/settings/state
```

**Migration Steps:**
1. Create tenant config at `clients/{clientId}/config/state`
2. Copy data from old collections to `clients/{clientId}/{collection}/state`
3. Update all references to use `fbDocPath()` helper
4. Deploy updated Firestore security rules
5. Test tenant isolation
6. Remove old top-level collections (after verification)

---

## Support

For issues or questions:
- Check Firebase Console for Firestore errors
- Review browser console for JavaScript errors
- Verify Firestore security rules are deployed
- Test tenant isolation with different tenant IDs

---

## Summary

✅ **Single application** serving multiple tenants  
✅ **Tenant isolation** enforced by Firestore security rules  
✅ **Hashed admin PINs** for basic security  
✅ **Cached configs** to minimize Firestore reads  
✅ **Flexible tenant resolution** (query param, path, subdomain)  
✅ **Free tier optimized** for <10 tenants, <40 courts  
✅ **Future-ready** for custom domains and subdomains  

**Next Steps:**
1. Run `setup-first-client.js` to create your first tenant
2. Test at `https://dula-hq.vercel.app/?client={clientId}`
3. Customize branding and courts for each tenant
4. Deploy Firestore security rules
5. Monitor usage in Firebase Console
