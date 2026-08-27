# Tenant Staff / Admin Console Guide

This guide is for the staff of an individual court facility ("tenant") running its own booking site on this platform — for example, the person confirming payments, setting up pricing, or blocking staff-only court time. It covers everything reachable from **your own site's Admin Console** using your Admin PIN.

If you manage the platform itself (creating tenants, billing, cross-tenant reporting), see `SUPERADMIN_GUIDE.md` instead — most of what's in that guide is not something you can do from here, and vice versa. If you just want the player-facing quick guide to hand out, see `USER_ONE_PAGER.md`.

---

## 1. Your Site & Multi-Tenancy

Your booking site is reachable at `https://<the platform's domain>/?client=<your-slug>` — the `?client=` part is what tells the app which facility's data to load. Bookmark and share the full link, including the `?client=` part; sharing just the bare domain will not point guests to your facility.

Everything you and your players do is scoped to your slug — courts, bookings, pricing, operating hours, staff-reserved hours, queues, and Open Games are all independent per tenant. Nothing you do here affects any other facility on the platform.

## 2. Getting Into the Admin Console

1. Click **Staff / Admin Access** (top right of the header) or the lock icon.
2. Enter your Admin PIN. The default PIN for a newly-provisioned tenant is `1234` unless whoever set up your site changed it — change it yourself under Admin → Security as your first step (Section 10).
3. Once unlocked, two tabs that were hidden become visible in the nav: **Bookings** and **Admin**. Everyone else (players, guests) only ever sees Book, Queue, Find a Game, and Payment.

Unlocking is per-browser: if you switch devices or clear your browser data, you'll need to enter the PIN again. There's no separate staff account/login — the PIN is the only gate.

## 3. Confirming Reservations (Payment Verification)

Go to **Admin → Confirm & Tag Bookings**. This app never processes payment itself — players pay you externally (GCash, Maya, bank transfer, cash, whatever you've set up) and you manually mark their reservation once you've verified it.

For each booking you'll see the player's name, date/time, court, group size, and (unless it's an Open Play block) their email — plus a status dropdown and a delete (✕) button.

| Status | Meaning |
|---|---|
| Pending | Player submitted the reservation; you have not verified their payment yet |
| Reserved | You've verified payment — the slot is confirmed and locked in |

Workflow:

1. A player books a slot → it appears here as **Pending**.
2. Check your payment channel (GCash/Maya/bank) for their reference number or screenshot, matching the amount and player name.
3. Once verified, change the dropdown from Pending to Reserved. This is also the moment it counts toward billing — see the note below.
4. If a player never pays, or you need to remove a booking, click ✕ to delete it (this frees the slot back up immediately).

There are only ever two statuses in this app: Pending and Reserved (plus the system-generated "Open Play" tag for admin-created blocks). Don't look for "Confirmed" or "Paid" — they don't exist here.

> **Billing note:** if the platform bills your facility on a per-booking basis, only bookings you actually mark **Reserved** are counted — submitting a Pending reservation, or one that gets deleted/cancelled before you confirm it, is never billed.

The separate **Bookings** nav tab (visible once unlocked) is a read-only, filterable view of the same data — filter by status or date (today/upcoming) when you just need to look something up rather than take action.

## 4. Court Management

Admin → **Court Management**. Each court has fully independent bookings, schedule, staff-reserved hours, pricing, and (see Section 6) operating hours.

- **+ Add Court** creates a new court (auto-numbered).
- Each court row lets you: rename it, set its active/maintenance toggle (an inactive court disappears from the public booking flow but its history is kept), set its start hour, or delete it (only allowed if you have more than one court — you can't delete your last remaining court).

If you only ever have one court, the court tab bar stays hidden everywhere in the app to keep the UI simple — it only appears once you add a second court. The same rule applies to the per-court tabs in Pricing and Operating Hours below.

## 5. Pricing

Admin → **Pricing**. Set rates per court:

1. Pick a court from the tabs at the top (only shown if you have more than one court).
2. **Default Rate (all hours)** sets the base hourly rate for every hour on that court that doesn't have a specific override.
3. **Hour Overrides**: click individual hours in the grid to select them (or **Select All**), type a **Rate for Selected Hours**, and click **Apply** — e.g. to charge more for prime evening slots. **Clear** removes overrides for the currently-selected hours, reverting them to the default rate.

The schedule list always shows the real effective rate per hour (default, unless a specific hour has an override). The hero banner's rate chip near the top of the Book page, however, shows a single general rate and won't reflect per-hour overrides — if you've set varied pricing, trust the per-slot rate shown in Today's Schedule, not the hero chip.

## 6. Operating Hours

Admin → **Operating Hours**. This sets your **Queue Start/End** (the walk-in window), **Booking Start** (when hourly reservations open), and **Close** (closing time) — the hours that shape everything from the schedule list to the reservation form's time dropdowns.

- **One court:** there are no tabs — you're editing your facility's one and only schedule directly.
- **More than one court:** a row of tabs appears — **Facility Default** plus one tab per active court.
  - **Facility Default** is the fallback every court uses unless it has its own override. Editing it updates every court that hasn't been customized.
  - Selecting a specific **court's tab** shows that court's *currently effective* hours (its own override if it has one, otherwise the facility default) — edit and **Save** to give that court its own schedule, independent of the rest. A **Reset to Facility Default** button appears once a court has a custom override, to drop it back to following the shared default.

A few things worth knowing:
- Set **Queue Start** equal to **Queue End** to disable the queue window entirely (booking-only, no separate walk-in period).
- Hours are entered as whole numbers, 0–24 (7 = 7:00 AM, 22 = 10:00 PM, 24 = midnight).
- Changing hours takes effect immediately on your own screen and for anyone visiting fresh; a browser that already had your site open will pick it up automatically within moments (see the caching note in Section 13), not instantly mid-session.
- The gap between Queue End and Booking Start (if any) is treated as a break — not walk-in, not bookable, not billed. If you don't want a break, set Booking Start equal to Queue End.
- The "All Courts" aggregate schedule view (only shown on narrower screens when multiple courts exist) uses the Facility Default hours rather than trying to merge differing per-court windows into one list — view a specific court's tab to see its actual hours.

## 7. Staff Reserved Hours

Admin → **Staff Reserved Hours**. This blocks a court from public booking for specific hours — for staff practice, lessons, league play, maintenance, whatever you need.

Two layers:

- **Weekly Pattern**: a recurring template per court, per day of week (e.g. "Tuesdays and Thursdays, 5–10 PM, Court 1 is staff-only, every week"). This is your default, ongoing rule.
- **Date Overrides**: use the calendar to punch in a specific date and adjust just that day — e.g. a one-off staff block on a date the weekly pattern wouldn't otherwise cover, or to free up an hour on a date that the weekly pattern would normally block.

A blocked hour shows to players as **"STAFF RESERVED"** and cannot be booked, on the schedule and in the hero "Today's Blocked" summary.

> **Billing note:** if your platform bills usage, staff-reserved hours are typically billed too (at a reduced rate relative to a normal booking) — they're not purely internal/free, since they block a court the same way a booking does. Check with whoever manages your platform account if you're unsure how your facility is billed.

## 8. Open Play (Admin-Created Blocks)

Admin → **Create Open Play Entry**. This is a simpler, one-off version of Staff Reserved Hours: pick a date, start, and end time (and a court, if you have more than one), and it blocks that window from public booking, shown as **"RESERVED — OPEN PLAY"**. Use this for a single community/open-play event rather than a recurring weekly pattern — for recurring blocks, Staff Reserved Hours is the right tool.

Note this form's time dropdowns are based on your Facility Default hours (Section 6), not a specific court's custom hours, even if you then assign the block to a particular court.

This is different from **Find a Game** (Section 9 below), which is a public, player-run matchmaking feature, not something staff create.

## 9. Find a Game (Open Games) — What Your Players See

You don't create these — players do, from the public **Find a Game** tab. It's worth understanding so you can help players who ask about it:

- Any player can create an open game: date, start time, skill level, format (singles/doubles/open), players needed, an optional court, notes, and their name + email.
- Other players browse open games and join until it's full.
- A player can optionally **link** their open game to a real court reservation using their **Booking PIN** (the 4-digit PIN they chose when they reserved — see Section 3 of the player guide) once that reservation is marked Reserved — this ties the pickup game to an actual paid slot on your schedule.
- There's a soft rate limit on how many games one email can create in a short window, meant to discourage spam/abuse — a player who hits it will see a message asking them to wait, not a hard account lock.
- Games auto-expire (marked completed/expired) once their time window has passed, and a creator can cancel their own game before then.

## 10. Branding & Site Settings

Admin → **Branding & Site Settings**. You can self-serve most of your site's look and business info here — no need to go through the platform owner for these:

| Section | What it controls |
|---|---|
| Color Theme | Primary accent, dark/header color, page background, and border colors, site-wide |
| Logo | Square image (512×512px recommended, min 256×256, transparent PNG/SVG under ~300KB) shown in the header and footer; falls back to a two-letter monogram if removed |
| Business & Contact | Business name, address, phone, email, Facebook/Instagram URLs — shown in the header, footer, page title, booking-confirmation email preview, and the Payment tab's contact card |
| Hero Call-outs | The header/footer subtitle and the big headline on the Book page's hero card — auto-generated from your business info unless you override it here |

Click each section's own Save button — they save independently.

Two things are still **not** self-serve from here and need the platform owner (superadmin):
- **Watermark image** (a faint background graphic behind your hero card) — set during your onboarding/provisioning, or updated later by the platform owner.
- **Currency symbol** — fixed at whatever was configured when your site was set up.

(Operating hours *used to* be on this not-self-serve list — that's no longer true, see Section 6.)

## 11. Payment QR Code & Channels Manager

Admin → **Payment QR Code & Channels Manager**. Upload QR codes for the payment channels you accept (GCash, Maya, BPI/Bank) — either an image file or a direct image URL — and set the account label shown alongside each. Players switch between your configured channels on the public **Payment** tab; whichever channels you leave without a QR code simply won't show as an option to players.

## 12. Queue Module Notes

The **Queue** tab is public, self-serve, and not tied to reservations at all — players use it to organize informal walk-in rotations without any staff involvement:

- Multiple independent queue sessions can run at once.
- Singles (2 players) or doubles (4 players) format.
- Rotation styles: Winner Stays or Fixed Order.
- Exact scores can be logged per match.
- Mid-queue joining is allowed if the queue's creator enabled it.
- Each queue has its own PIN (set by whoever created it) required to reset, delete, or remove a player — separate from your facility's Admin PIN.

Queue sessions automatically expire and get cleared out after midnight, on whichever page load first notices the day has changed — there's no separate cleanup step for you to run.

## 13. Security (Your Admin PIN)

Admin → **Security**. Enter a new PIN and click **Save PIN** — takes effect immediately for future unlock attempts. If you ever get locked out (forgot the PIN), you can't self-reset it — the platform owner can reset it for you from the Superadmin Console without needing your old PIN.

## 14. Data Storage & Retention — What You Should Know

Your live data (courts, bookings, staff-reserve config, pricing, operating hours, queues) lives in Firestore, synced in real time across every device that opens your site — this is not a "your browser only" localStorage app. Your browser does keep a local cache for speed (including a background check that refreshes it automatically after changes), but the source of truth is shared and centralized.

Your platform account has a **data retention window** (commonly 14 days, but set per facility by the platform owner) — periodically, all current bookings, open-play blocks, and queue sessions are cleared out and the window restarts. This is a full reset of that operational data, not selective cleanup of only old entries, and it's triggered by someone visiting the site around the time the window elapses rather than on an exact schedule. If you rely on looking up bookings from a while back, export or note anything you need before the window is up. Historical usage/billing counts are kept separately and are not affected by this reset.

## 15. Tenant Staff Troubleshooting FAQ

**A player says their booking disappeared.**
Most likely the data retention reset ran (Section 14) — it clears all current bookings on a schedule, not just old ones. Check with the platform owner what your facility's retention window is set to.

**The hero banner shows a weird rate range like "7:00 AM–7:00 AM" for Queue.**
A zero-width "7:00 AM–7:00 AM" queue window means Queue Start and Queue End are set equal (no separate walk-in window configured) — go to Admin → Operating Hours and adjust Queue Start/End yourself; this is no longer something only the platform owner can fix.

**I changed my color/logo/business name/hours but it's not showing for a customer who says they've visited before.**
Their browser cached your site's config before your change. The app automatically re-checks in the background on their next visit and should self-correct within moments without them needing to do anything — if it's been a while and it's still not showing, double-check your change actually saved (reopen the section and confirm the field still shows your update).

**A booking's total price doesn't match what I expect.**
Check Pricing (Section 5) for hour-specific overrides on that court — the actual charge follows the per-hour effective rate, not the general rate shown in the hero chip.

**One of my courts shows different bookable hours than the others.**
Check Admin → Operating Hours — that court has its own override (a "Reset to Facility Default" button will be visible on its tab). This is expected once you've customized a specific court; if you didn't mean to, hit Reset.

**I can't delete my last remaining court.**
By design — you always need at least one court to keep the booking flow working. Add a second court first if you actually need to retire the original one.

**A player asks how to link their "Find a Game" post to their real reservation.**
They need their booking's 4-digit PIN (which they set themselves when reserving) and their reservation must already be marked **Reserved** by you — Pending reservations can't be linked yet.

**Someone tried creating several "Find a Game" posts quickly and got blocked.**
That's the built-in soft rate limit meant to discourage spam. It's temporary and tied to the email they used — no manual admin unlock exists for this today; they just need to wait.

**I forgot my Admin PIN.**
You can't reset it yourself. Contact the platform owner — they can reset it from the Superadmin Console without needing the old PIN.

**My site says it's paused / shows a "Booking Page Paused" screen.**
The platform owner suspended your tenant from the Superadmin Console — this now genuinely takes your site offline for everyone (players and staff alike) rather than just a directory label. Contact the platform owner directly to resolve whatever caused the suspension (commonly non-payment); there's nothing you can do from your end to lift it yourself.

**Where do I see how much my facility owes / has been billed?**
You don't — billing and usage reporting live entirely in the Superadmin Console, which only the platform owner can access. Ask them directly for your numbers.
