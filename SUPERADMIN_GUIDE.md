# Superadmin Console Guide

This is the platform owner's guide to the Superadmin Console (`superadmin.html`), the single place that manages every tenant on the platform. It is separate from each tenant's own booking site and separate from the on-site Admin Console tenant staff use.

If you are looking for the guide for court/facility staff running their own tenant, see `ADMIN_GUIDE.md`. If you're looking for the one-page guide for players, see `USER_ONE_PAGER.md`.

---

## 1. What the Superadmin Console Is

- URL: `https://<your-domain>/superadmin.html` (also reachable at `/superadmin` — both are configured to route to the same file). This is the **only** way in — no tenant site, the public facility picker, or any other page in the app links to or exposes this console.
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

The console is a single page with a left sidebar (top bar on mobile) and nine tabs, organized as a platform control plane — the same shape the DulaHQ platform roadmap prescribes (Overview → Tenants → Entitlements → Plans & Billing → Usage → Support → Audit):

| Tab | Purpose |
|---|---|
| Overview | Platform health at a glance: tenants by state, live entitlements per product, month-to-date projected billing, open-invoice exposure, a "needs attention" list (suspended tenants, non-current billing, expiring trials, unverified invoices), and the latest audit entries |
| Tenants | Every registered tenant, quick actions, and the full per-tenant Manage panel (lifecycle, billing status, subscription, branding, PIN, retention, watermark, billing formula, prepaid balance, demo data) |
| Provision Tenant | Create a brand-new tenant — now with plan selection and a 7-day-trial option |
| Entitlements | The tenant × product entitlement matrix (Court Booking core / Store / Tournaments): grant, start trial, activate, pause, suspend, revoke — with per-entitlement history |
| Plans & Pricing | The plan catalog (base fee, included bookings, overage rate, court limits, add-on fees, pricing version), plan assignment to tenants, and the platform's manual payment instructions (GCash/bank) |
| Invoices | The billing domain: generate draft invoices for the current month with frozen line items, issue them, record/verify manual payments, apply credit balance, waive, reject, cancel |
| Usage Reports | Usage metrics and the billing formula per tenant (the Reporting & Billing Center deep dive + all-tenants usage), with CSV export |
| Feature Ideas | A running, superadmin-only scratchpad of ideas worth scoping before building |
| Audit & Security | Known risk areas and the append-only audit log of every mutating console action |

### 3.1 The entitlement model (what "entitlement" now means)

Each tenant owns **product entitlements** — one per product: `booking` (the core product, every tenant has it), `store`, and `tournament`. An entitlement is a lifecycle entity, not a switch:

```text
not added → trial → active → suspended → cancelled        (+ independent PAUSED hold)
```

- **Trial** — a 7-day evaluation window (end date tracked; the Overview flags trials ending within 2 days).
- **Active** — the product is entitled and live.
- **Suspended** — the product is offline for that tenant; other products are unaffected.
- **Cancelled (revoke)** — entitlement removed; the tenant's product data is kept, and re-granting restores it. History is preserved on the entitlement record.
- **Paused** — a temporary hold that does *not* change the lifecycle status (the "closed for today, not fired" lever).

Every change writes an entry to that entitlement's history (who, when, from → to, why) and is audited.

### 3.2 Two layers: what the platform decides vs. what tenants read

The entitlement documents live under `platformTenants/{slug}/entitlements/` and are superadmin-only. The tenant-facing sites don't read those directly — they read the same runtime flags as always (`clients/{slug}/status/state`: `bookingPaused`, `storeEnabled/storePaused`, `tournamentEnabled/tournamentPaused`). The console re-derives and re-mirrors those flags automatically on every entitlement or lifecycle change. Consequence: **you never edit `status/state` by hand anymore** — grant/revoke/pause/suspend through the console and the runtime follows.

### 3.3 Tenant lifecycle and billing status (three separate statuses)

A tenant now carries three independent statuses, per the roadmap's "access status ≠ billing status ≠ product status" rule:

- **Lifecycle** (access): `provisioning → trial → active → grace → restricted → suspended → cancelled → archived`. Lifecycle states outside {provisioning, trial, active, grace} take the tenant's booking site offline. The old Suspend/Activate button is now just the fast path between `active` and `suspended`.
- **Billing status**: `current / grace / overdue / suspended_notify_only` — metadata for the money conversation. It does **not** block anything by itself (consistent with this platform's no-automatic-suspension policy); it feeds the Overview "needs attention" list and the Entitlements matrix.
- **Product status**: each entitlement's own trial/active/suspended/cancelled/paused state (3.1).

### 3.4 Plans and subscriptions

A plan bundles pricing: monthly base fee, included confirmed bookings per month, per-booking overage rate, max courts, and monthly add-on fees for Store and Tournaments. Plans carry a **pricing version**; assigning a plan to a tenant stamps a subscription (`planId`, version, status, start date) and overwrites the tenant's billing formula from the plan. Editing the plan later never rewrites a tenant's subscription history. The three starter plans (seedable in one click from the tab) mirror `CLIENTS.md`: **Demo/Validation** (free), **Plan A — Monthly** (₱500/mo after setup, 100 included bookings, ₱15/booking over), **Plan C — Annual** (₱0/mo, 200 included, ₱10/booking). The numbers are editable defaults, not commercial commitments.

### 3.5 Invoices (the billing domain)

**Generate Draft Invoices** materializes a period's usage into invoice documents with **frozen line items** — base subscription, confirmed bookings over the included allowance, staff-reserved hours at half rate, and any plan add-on fees for live Store/Tournament entitlements. Every line carries its source (`subscription` / `usage_event` / `entitlement` + source id), so any amount is explainable; the generation snapshot (counts + formula) is stored on the invoice, so later usage changes never alter an existing draft. Issued invoices are never rewritten. The **Invoice period** picker chooses the month: the current month bills month-to-date, any earlier month bills the full month (its staff-reserve hours apply the *current* weekly pattern retroactively — the note after generation reminds you).

Invoices then walk the manual payment states:

```text
draft → awaiting payment → submitted for verification → verified
                        ↘ rejected → (resubmit)         ↘ partially paid
any pre-verified state → overdue / waived / cancelled (with reason, audited)
```

A payer reporting payment **never** verifies anything — verification is always a human action here. Since Phase B1, tenants can report payment themselves from the **billing portal** (`billing.html?client=<slug>`, same Admin PIN as the booking page): they pick the invoice, enter method/reference/amount, optionally attach proof, and the claim lands in this console's **Verification Queue** as a pending submission. From the queue you either **Verify & Apply** (records an attributed payment, marks the invoice verified or partially paid) or **Reject** (records your reason — the tenant sees it in their portal). Every invoice card also lists its payer submissions under "Payer submissions". The manual buttons (Record Verified Payment / Mark Submitted) still work for payments reported out-of-band. Payment instructions come from Plans & Pricing → Platform Payment Instructions (`platformSettings/billing`). Tenants with nothing to bill (zero formula, no live add-ons) are skipped and reported.

## 4. Provisioning a New Tenant

Go to **Provision Tenant**. Fields:

| Field | Notes |
|---|---|
| Slug (used as `?client=`) | Lowercase letters, numbers, and hyphens only (e.g. `rally-point`). This becomes the tenant's URL: `yoursite.com/?client=rally-point`. Cannot be changed later without effectively creating a new tenant — pick carefully. |
| Business Name | Shown in the header, footer, and browser tab title. |
| Starter Color | The tenant's primary accent color. Sets both the swatch and a slightly darker hover shade automatically. |
| Initial Admin PIN | The 4+ digit PIN tenant staff will use to unlock their Admin Console. Defaults to `1234` in the form — change it before handing off to the tenant, or have them change it themselves under Admin → Security on day one. |
| Plan | Optional. Picks the plan that sets the tenant's billing formula and subscription (with pricing version) at creation time. Leave as "No plan" for a manual billing formula. |
| Start in Trial | Starts the tenant in a 7-day trial — the booking entitlement begins as Trial and the tenant's lifecycle is set to `trial`. |
| Watermark Image (optional) | An image file uploaded to Firebase Storage and shown as a faint (14% opacity) background layer behind the booking page's hero card. Can be skipped and added later from Manage. |

Click **Create / Register Tenant**. Two things can happen:

- **New slug**: default courts (one court, "Court 1"), default settings (hashed PIN, empty payment methods), empty bookings/queues/open play, and a default weekly staff-reserve pattern are all written, plus the config document (business name, branding, theme color). The tenant is registered in `platformTenants/{slug}` with `status: active`.
- **Slug already has data**: the tenant-facing app auto-creates a minimal default config for *any* slug the moment someone visits it (see Section 9's note on organic tenants). If that already happened before you provisioned it, the form detects the existing config and **registers it into the directory without overwriting it** — it pulls the existing business name/color instead of the ones you typed. If you uploaded a watermark in this case, it's still applied on top of the existing config.

Either way, this also writes a mirror doc to `tenantDirectory/{slug}` (business name + status only — no billing data) — that's the collection the public **facility picker** actually reads (Section 9), so the new tenant shows up there immediately, not just in this console.

After creation, open the tenant from the Tenants tab ("Open Site ↗") to verify it looks right, hand the staff their PIN and URL, and grant any add-ons (Store / Tournaments) from the Entitlements tab.

## 5. Tenants (Directory) & the Manage Panel

Each row shows the tenant's name, color swatch, slug, operational state (ACTIVE/SUSPENDED), lifecycle chip, and plan (or "no plan"), with three actions:

- **Open Site ↗** — opens the tenant's live booking page in a new tab, at the canonical `/?client=<slug>` URL. Because your superadmin sign-in session carries over to that new tab (same origin), the tenant's Admin Console **unlocks automatically** — you don't need their PIN.
- **Manage** — expands an in-place panel (see below).
- **Suspend / Activate** — the fast path between the `suspended` and `active` lifecycle states (Section 3.3). It takes the tenant's booking site offline and updates the status flag shown in this directory, in Reports, and on the public facility picker. The full lifecycle (trial, grace, restricted, cancelled, archived) is set from the Manage panel's Lifecycle control.

Suspend sets `status` on the tenant's `platformTenants/{slug}` document (superadmin-only, for the directory/Reports display), mirrors that same status to `tenantDirectory/{slug}` (so a suspended tenant also disappears from the public facility picker — Section 9), **and** mirrors a `paused` flag onto the tenant's own `clients/{slug}/config/state` document, which the tenant-facing app actually reads. When paused, the tenant's site replaces its entire booking app with a "Booking Page Paused" screen (showing the facility's name/logo and contact info, if set) for every visitor — players and staff alike, with no PIN bypass. Realtime listeners, view counting, and the retention check are all skipped while paused, so nothing runs in the background either. A tenant that's already open in someone's browser when you suspend it will pick this up and reload within moments, the same way any other config change propagates (Section 9). Activating reverses all of this immediately.

Expanding **Manage** loads a few fields lazily (data-retention days and the current watermark, if any) and gives you:

| Control | What it does |
|---|---|
| Rename Business | Updates the display name everywhere on the tenant's site, and mirrors the new name to `tenantDirectory` so the facility picker reflects it too. |
| Tenant Lifecycle | Sets the full lifecycle state (Section 3.3). Going outside {provisioning, trial, active, grace} pauses the booking site; coming back reactivates it. Mirrors to the picker automatically. |
| Billing Status | Sets `current / grace / overdue / suspended_notify_only` — the money-conversation flag. Never blocks anything by itself; feeds Overview "needs attention". |
| Primary Color | Updates the accent color and its hover shade on the tenant's own site. **Does not** mirror to `tenantDirectory` — the picker's tile color reflects whatever color was set at provisioning time only, so a later color change here won't show up there. |
| Reset Admin PIN | Overwrites the tenant's PIN hash directly — use this if staff forgot their PIN. It does not require knowing the old PIN. |
| Data Retention (days) | See Section 8. Defaults to 14 if never set. |
| Watermark Image | Upload a new image (replaces any existing one) or Remove the current one. Preview thumbnail shown once loaded. |
| Billing — Base Fee / Free Confirmed Bookings / Rate / Booking Over Allowance | The tenant's billing formula (Section 6). |
| Prepaid Balance — Top Up / Apply This Month's Charge | Manual prepaid ledger (Section 6). |
| Demo Data — Load / Wipe | Section 7. |

Every save button here writes directly to Firestore and takes effect for players/staff the next time their browser re-checks the config (near-instant on a fresh visit; existing open tabs pick it up via a background revalidation — see Section 9's note on caching).

## 6. Usage Reports & Invoices

Invoice documents now live under the **Invoices** tab (Section 3.5). This section covers the usage metering and the per-tenant billing formula that feeds both the reports and the invoice lines.

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

The credit balance also plugs into the Invoices tab: **Apply from Credit Balance** on an open invoice moves the owed amount from the prepaid ledger onto the invoice as a recorded payment (method `credit_balance`), marking it verified or partially paid. The prepaid flow and the invoice flow now share one ledger without double-counting.

### CSV Export

**Export CSV** on the Usage Reports tab downloads every tenant's current-month numbers as `superadmin-reporting-{YYYY-MM}.csv`, including plan, lifecycle, billing status, confirmed/cancelled bookings, cancellation rate, court-hours, unique/returning players, queue sessions, Open Play sessions/court-hours, staff-reserved hours **and their charge**, utilization %, views, suggested charge, and prepaid balance.

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

**Anyone can "organically" create a tenant.** The tenant-facing app auto-seeds default courts/settings/config for *any* slug the first time it's visited via `?client=whatever` — there's no gate. Provisioning through this console is how you set a real name/color/PIN/watermark upfront and get the tenant listed in the Tenant Directory; skipping it doesn't stop the tenant from working, it just means it won't show up here until you register it (which the Create Tenant form does automatically if you try to provision an already-existing slug — see Section 4). An organically-created tenant also won't appear on the **public facility picker** (below) until it's registered here, since only this console writes to the collection the picker reads.

**The public facility picker is a separate, read-only mirror of this directory.** A visitor who lands on the site's bare domain (no `?client=`) sees a searchable grid of every active facility — that's `picker.html`, reading from the `tenantDirectory` collection, which is deliberately **not** the same collection as `platformTenants`. `platformTenants` holds billing/credit data and is locked to superadmin-only reads; `tenantDirectory` holds nothing but business name, theme color, and active/suspended status, and is public-readable so an anonymous visitor can browse it safely. This console writes to both together whenever something picker-relevant changes (provisioning, rename, suspend/activate — see above), so you never edit `tenantDirectory` directly; just use the normal Manage controls and the mirror keeps itself current.

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

**I suspended a tenant but their Store page still works.**
That's preserved behavior, not a bug: tenant-level Suspend (the lifecycle) pauses the booking site; Store and Tournaments have their own entitlements with their own pause/suspend controls. If policy says a suspended tenant should lose everything, suspend the individual entitlements too (or change the one derivation in `syncTenantRuntime`) — it's a deliberate decision point, not an accident.

**A tenant's entitlement chips show "Not Added" even though their store works.**
Pre-restructure tenants have no entitlement documents yet — the console synthesizes their current state from the legacy runtime flags (migration-on-read, marked as legacy). The moment you make any change to that entitlement (pause, suspend, re-grant), a real entitlement document with history is materialized. Nothing to fix.

**Generate Draft Invoices skipped a tenant.**
Tenants with nothing to bill are skipped on purpose: zero base fee, no overage (bookings under the included allowance), no staff-reserve charge, and no live paid add-ons. The generation note lists exactly which tenants were skipped and why.

**An invoice says "Submitted for verification" — is it paid?**
No. A submission is the payer *claiming* they paid. Only "Record Verified Payment" (with method + reference) or "Apply from Credit Balance" actually verifies and settles it. This is deliberate: no invoice ever becomes paid from a user-submitted declaration.

**I edited a plan but a tenant's charges didn't change.**
Plan edits never rewrite an existing subscription or an already-generated invoice. The tenant's billing formula was copied from the plan at assignment time; re-assign the plan to push updated pricing, and next month's draft invoices pick it up. Each subscription keeps the pricing version it was signed at.

**A tenant says they paid — where do I see it?**
Invoices tab → **Verification Queue**. Submissions from their billing portal arrive there with method, reference, amount, and (usually) attached proof. Verify & Apply to settle the invoice, or Reject with a reason. A submission sitting in "pending" has not moved the invoice at all — that's by design.

**Can a tenant pay or mark anything paid from their side?**
They can *submit* a claim (billing.html → "I've Paid — Submit for Verification"), including proof upload. They can never mark an invoice paid — invoice writes are superadmin-only in the rules, and verification only happens from this console.

**My login works but I still can't reach the console / I get a permissions error reading `platformTenants`.**
The `superadmin` custom claim isn't on your token yet — either it was never granted (re-run `set-superadmin-claim.js`) or you haven't signed out and back in since it was granted. Custom claims are baked into the ID token at sign-in time; they don't apply retroactively to an already-open session.
