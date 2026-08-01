# Adding a New Client — Deployment Runbook

One GitHub repo. One deployment per client. Fully isolated data.

Estimated time per client: **30–60 minutes**.

---

## Architecture Recap

```
GitHub repo (one codebase, one branch per client)
        │
        ├── branch: main               → Vercel A  → Firebase A   (White Kitchen)
        ├── branch: client/ace-pickle  → Vercel B  → Firebase B   (Ace Pickle)
        └── branch: client/smash       → Vercel C  → Firebase C   (Smash Courts)
```

Each client gets its own Firebase project (own database), its own Vercel
deployment, and its own config. Clients can never see each other's data.

---

## Step 1 — Create the client's Firebase project

1. Go to [console.firebase.google.com](https://console.firebase.google.com)
2. **Add project** → name it after the client, e.g. `ace-pickle-booking`
3. Disable Google Analytics (not needed) → **Create project**
4. In the project, open **Firestore Database → Create database**
   - Location: `asia-southeast1` (Singapore) for PH clients
   - Start in **production mode**
5. Deploy the rules from the repo root:
   ```bash
   firebase login
   firebase use ace-pickle-booking
   firebase deploy --only firestore:rules
   ```
6. **Project settings (gear icon) → Your apps → Add app → Web**
   - Nickname: `Ace Pickle Web`
   - Copy the `firebaseConfig` values that appear

---

## Step 2 — Create the client branch

```bash
git checkout main
git pull
git checkout -b client/ace-pickle
```

All client-specific edits happen **only on this branch**.

---

## Step 3 — Edit the three config files

### 3a. `firebase-config.js`
Replace every value with the ones copied in Step 1.6.

### 3b. `.firebaserc`
```json
{ "projects": { "default": "ace-pickle-booking" } }
```

### 3c. `client-config.js`
This is where the entire brand lives. Copy
`examples/client-config.ace-pickle.js` over `client-config.js` and edit.

| Field | What it controls |
|---|---|
| `clientId` | Internal key — lowercase, hyphens |
| `isWhiteKitchen` | `true` locks WK's fixed schedule; `false` enables dynamic hours |
| `branding.businessName / productName` | Header, footer, email previews, page title |
| `branding.shortName` | Monogram shown when no logo is set |
| `branding.logoUrl / faviconUrl` | Paste direct image URLs; blank = monogram fallback |
| `theme.*` | Every color in the app (CTA, dark, badges, slot states) |
| `currency.symbol` | ₱ / $ / € — used on all totals and chips |
| `rates.*` | Hourly reservation rate + morning queue rate |
| `schedule.operatingHours` | Open/close (only used when `isWhiteKitchen:false`) |
| `schedule.staffReserveDefaults` | Which weekdays start staff-blocked |
| `contact.*` | Shown on the Payment tab contact card + footer |
| `policies.*` | Cancellation, walk-in, and payment notes |
| `paymentChannels.*` | Default account labels for GCash / Maya / BPI |

Commit the branch:
```bash
git add client-config.js firebase-config.js .firebaserc
git commit -m "Ace Pickle client config"
git push -u origin client/ace-pickle
```

---

## Step 4 — Deploy to Vercel

1. [vercel.com/new](https://vercel.com/new) → import your repo
2. **Branch:** select `client/ace-pickle` (not main)
3. Framework preset: **Other** — no build command, output directory `.`
4. Deploy → you get e.g. `ace-pickle.vercel.app`

Every future push to `client/ace-pickle` auto-redeploys.

### Firebase Hosting (optional second host)
```bash
firebase use ace-pickle-booking
firebase deploy --only hosting
```

---

## Step 5 — Custom domain (optional)

Vercel → project → **Domains** → add `book.acepickle.ph`
Then at the client's DNS provider, point a `CNAME` record:

```
book   →   cname.vercel-dns.com
```

Free SSL is automatic.

---

## Step 6 — Hand over to the client admin

On the live site, the client's staff should:

1. Click **Staff** → enter default PIN `1234`
2. **Admin → Security** → change the PIN immediately
3. **Admin → Payment QR Manager** → upload real GCash/Maya/BPI QR images
4. **Admin → Morning Booking Toggle** → set walk-in vs bookable hours
5. **Admin → Staff Reserve Toggle** → adjust blocked weekdays if needed
6. **Admin → Confirm & Tag Bookings** → start verifying payments

---

## Updating all clients later

When you fix a bug or add a feature:

```bash
# fix on main
git checkout main
# ...edit, test...
git commit -am "fix: score rotation edge case"
git push

# roll out to each client
git checkout client/ace-pickle
git merge main          # resolve config conflicts by keeping the client's config
git push                # Vercel auto-redeploys
```

The only files that should ever conflict are the three config files —
always keep the **client branch's version** of those.

---

## Quick checklist

- [ ] Firebase project + Firestore created, rules deployed
- [ ] Web app config copied into `firebase-config.js`
- [ ] `.firebaserc` points at the new project
- [ ] `client-config.js` customized (brand, colors, rates, hours, contact)
- [ ] Client branch pushed
- [ ] Vercel project created from the client branch
- [ ] (Optional) Custom domain + DNS connected
- [ ] Client admin changed PIN and uploaded QR codes

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| Bookings don't sync across devices | Wrong `projectId` in `firebase-config.js`, or rules not deployed |
| App still shows White Kitchen branding | `client-config.js` edits not committed to the client branch |
| Blank page after deploy | Open browser console — usually a typo in a config file |
| Colors didn't change | Theme values must be valid hex (`#RRGGBB`) |
| Rates show old values on a phone | Hard-refresh; localStorage caches until next cloud sync |
