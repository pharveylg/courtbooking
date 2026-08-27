# Superadmin Console Guide

This is the platform owner's guide to the Superadmin Console (`superadmin.html`), the single place that manages every tenant on the platform. It is separate from each tenant's own booking site and separate from the on-site Admin Console tenant staff use.

If you are looking for the guide for court/facility staff running their own tenant, see `ADMIN_GUIDE.md`. If you're looking for the one-page guide for players, see `USER_ONE_PAGER.md`.

---

## 1. What the Superadmin Console Is

- URL: `https://<your-domain>/superadmin.html` (also reachable at `/superadmin` — both are configured to route to the same file).
- It manages the **platform**, not one court: creating tenants, renaming/re-theming them, resetting PINs, setting billing formulas, tracking usage, and exploring feature ideas.
- It is a completely separate authentication system from the tenant-facing app. Tenant sites have no login for players and only a 4-digit Admin PIN for staff. The Superadmin Console uses real Firebase Authentication (email + password) gated by a custom claim — nobody can reach it just by knowing a URL or a PIN.
- There is **no self-serve sign-up**. Every superadmin account is created manually by whoever already has access to the Firebase project (see Section 2).

## 2. Getting Access (First-Time Setup)

Superadmin access requires three things to exist together: a Firebase Auth account, the `superadmin` custom claim on that account, and a signed-in session using it.

1. **Enable Email/Password sign-in** (one-time, per Firebase project): Firebase Console → Authentication → Sign-in method → enable "Email/Password".
2. **Create the account**: Firebase Console → Authentication → Users → Add user. Set an email and password.
3. **Grant the claim**: from the project directory, run:
   ```
   node set-superadmin-claim.js you@example.com
   ```
   This requires `serviceAccountKey.json` to be present in the project folder (Firebase Console → Project Settings → Service Accounts → Generate new private key). This file is never committed to git — treat it like a password.
4. **Sign in** at `/superadmin.html` with that email/password. If you were already signed in when the claim was granted, sign out and back in — the claim is embedded in the auth token and only refreshes on a new sign-in.
5. To remove access later: `node set-superadmin-claim.js you@example.com --revoke`.

There is no in-app "forgot password" link. Reset a superadmin's password from Firebase Console → Authentication → Users → (select user) → Reset password, the same way as any other Firebase Auth account. Revoking/re-granting the claim is unaffected by password resets since the claim is tied to the account's UID.

## 3. Layout

The console is a single page with a left sidebar (top bar on mobile) and four tabs:

| Tab | Purpose |
|---|---|
| Tenant Directory | Every registered tenant, quick actions, and the full per-tenant Manage panel |
| Provisioning | Create a brand-new tenant |
| Reports & Billing | Usage metrics and the billing formula per tenant, with CSV export |
| Feature Ideas | A running, superadmin-only scratchpad of ideas worth scoping before building |

## 4. Provisioning a New Tenant

Go to **Provisioning**. Fields:

| Field | Notes |
|---|---|
| Slug (used as `?client=`) | Lowercase letters, numbers, and hyphens only (e.g. `rally-point`). This becomes the tenant's URL: `yoursite.com/?client=rally-point`. Cannot be changed later without effectively creating a new tenant — pick carefully. |
| Business Name | Shown in the header, footer, and browser tab title. |
| Starter Color | The tenant's primary accent color. Sets both the swatch and a slightly darker hover shade automatically. |
| Initial Admin PIN | The 4+ digit PIN tenant staff will use to unlock their Admin Console. Defaults to `1234` in the form — change it before handing off to the tenant, or have them change it themselves under Admin → Security on day one. |
| Watermark Image (optional) | An image file uploaded to Firebase Storage and shown as a faint (14% opacity) background layer behind the booking page's hero card, for a personal touch. Can be skipped and added later from Manage. |

Click **Create / Register Tenant**. Two things can happen:

- **New slug**: default courts (one court, "Court 1"), default settings (hashed PIN, empty payment methods), empty bookings/queues/open play, and a default weekly staff-reserve pattern are all written, plus the config document (business name, branding, theme color). The tenant is registered in `platformTenants/{slug}` with `status: active`.
- **Slug already has data**: the tenant-facing app auto-creates a minimal default config for *any* slug the moment someone visits it (see Section 9's note on organic tenants). If that already happened before you provisioned it, the form detects the existing config and **registers it into the directory without overwriting it** — it pulls the existing business name/color instead of the ones you typed. If you uploaded a watermark in this case, it's still applied on top of the existing config.

After creation, open the tenant from the Tenant Directory ("Open Site ↗") to verify it looks right, and hand the staff their PIN and URL.

## 5. Tenant Directory & the Manage Panel

Each row shows the tenant's name, color swatch, slug, and active/suspended state, with three actions:

- **Open Site ↗** — opens the tenant's live booking page in a new tab.
- **Manage** — expands an in-place panel (see below).
- **Suspend / Activate** — actually takes the tenant's site offline (see below), and updates the status flag shown in this directory and in Reports.

Suspend sets `status` on the tenant's `platformTenants/{slug}` document (superadmin-only, for the directory/Reports display) **and** mirrors a `paused` flag onto the tenant's own `clients/{slug}/config/state` document, which the tenant-facing app actually reads. When paused, the tenant's site replaces its entire booking app with a "Booking Page Paused" screen (showing the facility's name/logo and contact info, if set) for every visitor — players and staff alike, with no PIN bypass. Realtime listeners, view counting, and the retention check are all skipped while paused, so nothing runs in the background either. A tenant that's already open in someone's browser when you suspend it will pick this up and reload within moments, the same way any other config change propagates (Section 9). Activating reverses all of this immediately.

Expanding **Manage** loads a few fields lazily (data-retention days and the current watermark, if any) and gives you:

| Control | What it does |
|---|---|
| Rename Business | Updates the display name everywhere on the tenant's site. |
| Primary Color | Updates the accent color and its hover shade. |
| Reset Admin PIN | Overwrites the tenant's PIN hash directly — use this if staff forgot their PIN. It does not require knowing the old PIN. |
| Data Retention (days) | See Section 8. Defaults to 14 if never set. |
| Watermark Image | Upload a new image (replaces any existing one) or Remove the current one. Preview thumbnail shown once loaded. |
| Billing — Base Fee / Free Confirmed Bookings / Rate / Booking Over Allowance | The tenant's billing formula (Section 6). |
| Prepaid Balance — Top Up / Apply This Month's Charge | Manual prepaid ledger (Section 6). |
| Demo Data — Load / Wipe | Section 7. |

Every save button here writes directly to Firestore and takes effect for players/staff the next time their browser re-checks the config (near-instant on a fresh visit; existing open tabs pick it up via a background revalidation — see Section 9's note on caching).

## 6. Reports & Billing

### What's billed vs. what's tracked

The billing model only meters two things; everything else is analytics-only:

| Billed | Analytics only (never billed) |
|---|---|
| Confirmed bookings (each `booking_confirmed` event) | Page views |
| Staff-reserved hours, at **half** the per-booking rate | Queue sessions |
| | Open Games / Open Play activity |
| | Cancelled bookings, cancellation rate, utilization %, returning players |

**Suggested charge formula:**

```
suggestedCharge = baseFee
                + max(0, confirmedBookings - freeBookings) × perBookingRate
                + staffReservedHours(MTD) × (perBookingRate / 2)
```

- `baseFee`, `freeBookings`, and `perBookingRate` are set per tenant in the Manage panel's Billing section. Set Base Fee and Free Bookings to 0 for pure per-booking metering.
- **Staff-reserved hours** are counted from the tenant's *current* staff-reserve configuration (weekly template + date overrides), walked across the days elapsed so far this month — not from an event log, since blocking an hour is a standing rule, not something that "fires" once. If a tenant changes their staff-reserve pattern mid-month, the count reflects whatever the pattern *currently* is applied retroactively across the month-to-date, not what it was on each historical day.
- A confirmed booking only counts once, when it's marked **Reserved**, never when the guest first submits it as Pending. A cancelled booking that was never confirmed contributes nothing to the charge.

### Reading a tenant's report card

Each card shows this-month vs. last-month bar comparisons for: Confirmed Bookings, Cancelled Bookings, Court-Hours, Unique Players, Queue Sessions, and Open Games + Open Play. Below that:

- Cancellation rate, returning players, and court utilization (month-to-date court-hours booked against total available court-hours).
- Staff-reserved hours (month-to-date) and its billed contribution.
- The full billing usage line with the computed suggested charge, and how much of it came from staff reserve specifically — so the number is never opaque.
- Page views, tracked but explicitly called out as never billed.

Note two things not yet tracked (called out directly in the UI so it isn't mistaken for a bug): queue sessions aren't linked to whether they ever converted into a real booking, and Open Play/Open Games don't currently capture who actually showed up as a participant. Both would need additional event capture to build.

### Prepaid balance

Every tenant has a `creditBalance` field. **Top Up** adds an amount you tell it you received (there's no payment processor integration — this assumes you collected payment outside the app, e.g. bank transfer, and are just recording it). **Apply This Month's Charge** subtracts the currently-computed suggested charge from the balance, with a confirmation prompt, and does not block or restrict the tenant's site if the balance goes to zero or negative — it's "notify only" by design (you'll see the balance go negative in Reports and can follow up manually).

### CSV Export

**Export CSV** on the Reports tab downloads every tenant's current-month numbers as `superadmin-reporting-{YYYY-MM}.csv`, including confirmed/cancelled bookings, cancellation rate, court-hours, unique/returning players, queue sessions, Open Play sessions/court-hours, staff-reserved hours **and their charge**, utilization %, views, suggested charge, and prepaid balance.

## 7. Demo / Sample Data

Under a tenant's Manage panel:

- **Load Sample Usage Data** writes a batch of realistic-looking events (confirmed/cancelled bookings, queue sessions, Open Games created/joined) backdated across the last ~75 days, every one tagged `sample: true`. Use this to see what a tenant's Reports charts look like before it has real traffic, e.g. for a demo or sales conversation.
- **Wipe Sample Data (going live)** deletes only the events tagged `sample: true` for that tenant — real usage events are never touched by this, and vice versa (real activity is never tagged `sample`, so it can never be accidentally wiped). Run this once the tenant has gone live so their Reports reflect only real activity.

Sample data affects Reports numbers (it's just events in the same ledger) but does not create any visible bookings on the tenant's actual site — it only exists in the `platformTenants/{slug}/events` collection.

## 8. Data Retention

Set per tenant in Manage (default: 14 days if never touched). This is **not** a backend job — there is no server, cron, or Cloud Function in this app. Instead, the tenant-facing site itself checks on every page load whether the retention window has elapsed since the last reset, and if so:

- Wipes **all** current bookings, open-play blocks, and queue sessions for that tenant — not just old ones. Think of it as a periodic full reset of operational data, not selective pruning.
- Restamps the period start to "now."
- Reconciles the billing usage counter first, so historical billing numbers (which live in the separate, never-wiped events ledger) aren't affected.

Because it's triggered by a visit rather than a clock, a tenant with zero traffic for a while won't actually reset until the next time someone loads the page after the window has passed — the reset isn't exactly on schedule, it's "on the next visit at or after the deadline."

## 9. Two Things Worth Understanding About How Tenants Work

**Anyone can "organically" create a tenant.** The tenant-facing app auto-seeds default courts/settings/config for *any* slug the first time it's visited via `?client=whatever` — there's no gate. Provisioning through this console is how you set a real name/color/PIN/watermark upfront and get the tenant listed in the Tenant Directory; skipping it doesn't stop the tenant from working, it just means it won't show up here until you register it (which the Create Tenant form does automatically if you try to provision an already-existing slug — see Section 4).

**Config changes take effect on next real load, with a safety net.** Tenant browsers cache their config in `localStorage` so the site loads instantly. A background check runs after every page load that compares against Firestore and silently patches the page (theme, branding, watermark, business info) if anything changed since that browser's cache was written — so an edit you make here will show up for returning visitors without them needing to clear anything, typically within moments of their next visit.

## 10. Superadmin Troubleshooting FAQ

**I created a tenant, but the report/reporting card says "error" or shows zeros for everything.**
The reporting query needs Firestore composite indexes for the events ledger (used for the "returning players" lifetime lookup). If `firestore.indexes.json` hasn't been deployed (`firebase deploy --only firestore:indexes`), that specific calculation silently falls back to 0 rather than failing the whole card — check the browser console on the Superadmin page for index-related warnings. Everything else in the report doesn't need the composite index and should still populate.

**I suspended a tenant but their site still works.**
Give it a moment if their browser was already open — an already-loaded tab picks up the pause via the same background revalidation that catches any other config change, and reloads itself once it does (Section 9). A fresh visit (or a reload you trigger yourself) should show the paused screen immediately. If it's been a while and it's genuinely still not paused, confirm the toggle actually shows "Activate" now (i.e. the tenant is currently suspended) — re-open Manage or refresh the Tenant Directory to check.

**A tenant's color/name/watermark change isn't showing on their site.**
Almost always a stale cache on the *visitor's* browser, not a save failure — check Section 9's second note. As of the background-revalidation fix, this should self-correct on the visitor's next load without needing a hard refresh or cache clear. If it's been a while and it still isn't showing, verify the save actually succeeded (re-open Manage and confirm the field reflects your change) before assuming it's a caching issue.

**"Create / Register Tenant" says the slug already had data and used a different name/color than what I typed.**
Someone (a curious visitor, a bookmark, a shared link) already loaded `?client=that-slug` before you provisioned it, which auto-seeded a default config. The form deliberately won't overwrite existing data — it registers what's already there. If you need the name/color you originally typed, use Manage → Rename Business / Primary Color after registration, and add the watermark from there too if you had selected one.

**I reset a tenant's Admin PIN, but they say the old PIN still works / staff say they're locked out immediately everywhere.**
The PIN check happens against the currently-stored hash on each unlock attempt, so a reset takes effect immediately for new unlock attempts — but a staff member who was already unlocked in an existing browser tab stays unlocked in that tab until they explicitly log out or clear that browser's local admin-session flag; the reset doesn't retroactively lock out an already-open session.

**The suggested charge for a tenant looks higher than expected this month.**
Check whether they have a wide staff-reserve pattern configured — remember every reserved hour bills at half the per-booking rate across every active court, every day it's blocked, which adds up quickly for a broad weekly pattern. The report card breaks out exactly how much of the suggested charge came from staff reserve vs. bookings, so start there.

**A tenant's queue/booking rate chip shows an odd value like "7:00 AM–7:00 AM".**
That means `hours.queueStart` equals `hours.queueEnd` — no separate queue window configured. This is now self-serve on the tenant's own side: point them to their Admin → Operating Hours section (with per-court overrides once they have more than one court) rather than editing Firestore for them. **Currency symbol** is still not exposed anywhere in either console — that still requires editing the `currency` field directly on `clients/{slug}/config/state` in the Firebase Console.

**I want to fully delete a tenant.**
There's no "Delete Tenant" button in this console. It would need manual removal of `clients/{slug}/*` and `platformTenants/{slug}` (and its `usage`/`events` subcollections) directly in the Firebase Console, or a one-off admin-SDK script.

**My login works but I still can't reach the console / I get a permissions error reading `platformTenants`.**
The `superadmin` custom claim isn't on your token yet — either it was never granted (re-run `set-superadmin-claim.js`) or you haven't signed out and back in since it was granted. Custom claims are baked into the ID token at sign-in time; they don't apply retroactively to an already-open session.
