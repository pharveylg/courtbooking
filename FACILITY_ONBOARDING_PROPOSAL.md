# Facility Self-Service Onboarding — Proposal

Written against `reverse flow.txt`'s "Club & Facility Self-Service Onboarding"
spec, adapted to what this app actually has today. Where the reference spec
assumes capabilities (owner accounts, connected payment processors) that
don't exist here, this document says so explicitly and proposes a path —
it does not pretend the gap away. **This is a proposal only; nothing has
been built.**

## 0. Reality check: three gaps the reference spec assumes don't exist

Before anything else, three structural facts about this app shape everything
below. Skipping past them would produce a plan that can't actually ship.

| Reference assumption | What this app has today |
|---|---|
| A facility owner signs up and creates their own facility | Tenant creation is **superadmin-only** — `superadmin.html`'s "Provision Tenant" form, gated by a Firebase Auth account with a manually-granted `superadmin` custom claim ([SUPERADMIN_GUIDE.md](SUPERADMIN_GUIDE.md) §2, §4). There is also an "organic" path — visiting any unclaimed `?client=slug` auto-seeds a minimal default tenant — but it's an accident of the architecture, not a designed onboarding flow, and such a tenant doesn't appear on the public facility picker until a superadmin registers it. |
| An owner has an account (name, email, password) distinct from "staff" | There is no per-person identity on the tenant side at all. A tenant has **one shared 4-digit Admin PIN** — whoever has it is staff, full stop. No roles, no invites, no "who did this" attribution. ([ADMIN_GUIDE.md](ADMIN_GUIDE.md) §2, §13) |
| Payments are a connected processor ("Connect your payment account") | Payments are **manual**: the facility uploads a GCash/Maya/bank QR code, the player pays the facility directly outside the app, and staff manually flips the booking from Pending to Reserved once they've checked their own payment channel ([ADMIN_GUIDE.md](ADMIN_GUIDE.md) §3, §11). There is no Stripe/PayMongo-style OAuth connection anywhere in this app. |

None of these are bugs — they're real, deliberate, documented design choices
for a <10-tenant, free-tier-Firebase product. The proposal below treats the
first two as worth closing (they're what actually blocks self-service) and
recommends **not** building the third (see §5).

## 1. Objective (unchanged from the reference)

Let a new facility owner set up and launch their own facility without a
platform operator running `superadmin.html` on their behalf. Everything
else — the booking engine, Find a Game, the Queue module, Store, Tournaments,
player experience — stays exactly as it is. This is an onboarding layer, not
a rebuild.

## 2. Product principle (unchanged)

Guided checklist, not an admin system. Reuse what already exists rather than
building a second configuration surface. This matters more here than usual:
**the tenant-side admin screens this app already has are 80–90% of the
reference spec's steps 1–6**, already self-serve, already PIN-gated, already
documented in [ADMIN_GUIDE.md](ADMIN_GUIDE.md). The actual work is mostly
*sequencing* existing screens into a stepper and closing the two real gaps
in §0 — not building seven new config UIs from scratch.

## 3. What to reuse, step by step

This is the center of the proposal: for each of the reference spec's seven
setup steps, what exists today and what the onboarding step should literally
*be* — a thin wrapper around the existing admin screen, not a parallel one.

| Reference step | Existing screen it wraps | Gap to close |
|---|---|---|
| 1. Facility details | Admin → **Branding & Site Settings** (business name, address, phone, email, social links, logo, hero headline/subheadline, color theme — [ADMIN_GUIDE.md](ADMIN_GUIDE.md) §10) | None — already exactly this. Currency symbol is the one field that's still superadmin-only ([SUPERADMIN_GUIDE.md](SUPERADMIN_GUIDE.md) FAQ) — expose it here too, or infer it from address/locale as the reference's "smart defaults" (§31) suggests. |
| 2. Courts | Admin → **Court Management** — add, rename, activate/deactivate ([ADMIN_GUIDE.md](ADMIN_GUIDE.md) §4) | No bulk "add N courts at once" — today it's one `+ Add Court` click per court. Small, worth adding (reference §8). |
| 3. Schedule | Admin → **Operating Hours** (facility default + per-court override) and **Staff Reserved Hours** (weekly pattern + date overrides — [ADMIN_GUIDE.md](ADMIN_GUIDE.md) §6–7) | None structurally — this already *is* the reference's "facility default, customize individual courts, copy to all" model (§9–10), just not framed as onboarding copy. Exceptions/holidays (§10) already exist as Staff Reserved Hours' date overrides. |
| 4. Pricing & fees | Admin → **Pricing** — per-court default rate + hour-grid overrides ([ADMIN_GUIDE.md](ADMIN_GUIDE.md) §5) | The reference's weekday/weekend and peak/off-peak **presets** (§11–12) don't exist — pricing here is purely an hourly grid you click cells in. Worth a thin preset layer *on top of* the existing grid (a preset just pre-fills grid cells), not a new pricing engine. "Fees" (booking fee, service fee) in the reference's sense don't exist at all — this app has no per-booking fee concept beyond the rate itself; out of scope unless separately requested. |
| 5. Payment methods | Admin → **Payment QR Code & Channels Manager** — upload QR + label per channel ([ADMIN_GUIDE.md](ADMIN_GUIDE.md) §11) | This is where the reference spec diverges most (§0 above). See §5 below — recommend keeping the manual-QR model, not building OAuth. |
| 6. Add-ons | **Doesn't exist in the reference's sense.** The closest thing is the separate **Store** product (`store.html`) — a point-of-sale system with products, inventory, and credit/pay-later sales — but it's a standalone retail screen, not something attached to a court booking's checkout, and it's gated behind its own platform entitlement (a tenant has to be granted Store access, same as Tournaments — [SUPERADMIN_GUIDE.md](SUPERADMIN_GUIDE.md) §3.1). | Two honest choices: (a) treat "Add-ons" as "point new owners at Store if they want rentals/extras" rather than building booking-checkout add-ons, or (b) scope real booking-attached add-ons as separate, net-new work. Recommend (a) for onboarding v1 — it reuses what exists; (b) is a real feature request in its own right, not an onboarding-layer task. |
| 7. Review & publish | **Doesn't exist.** A tenant provisioned via `superadmin.html` is `status: active` immediately — there's no draft state, no readiness check, no owner-controlled publish moment. | New, but small: a summary screen reading back what was just entered across steps 1–6 (all of which already live in Firestore the moment each step's existing Save button is clicked — nothing to re-fetch specially), plus a publish action that's really just "list this tenant on the public picker" (today: writing to `tenantDirectory/{slug}`, currently superadmin-only — needs to move to the new provisioning path in §4). |

## 4. The two gaps this proposal actually recommends closing

### 4.1 Self-service tenant creation

**Today:** only `superadmin.html`'s Provision Tenant form (or the Firestore
security rules) can create `platformTenants/{slug}` and register
`tenantDirectory/{slug}`.

**Proposed:** a new Cloud Function (`createFacility`, onCall, following the
pattern of every other mutating function in `functions/index.js`) that does
exactly what Provision Tenant already does — write the config/courts/settings
docs, hash the chosen PIN, register `platformTenants/{slug}` and
`tenantDirectory/{slug}` — but is callable by a signed-in facility owner
instead of a superadmin, with:

- Slug format validation and uniqueness check (same rule `isValidTenantId()`
  already enforces — [MULTI_TENANCY_SETUP.md](MULTI_TENANCY_SETUP.md)).
- The new tenant's lifecycle starting at `trial` (the state machine already
  exists — [SUPERADMIN_GUIDE.md](SUPERADMIN_GUIDE.md) §3.3), not `active` —
  so a self-provisioned facility is automatically on the same 7-day trial
  clock a superadmin would otherwise set by hand, and the platform still
  has a natural checkpoint before it's a paying tenant.
- One facility per owner account at launch (simplest abuse guard; relax
  later if an owner legitimately runs multiple clubs).

This function becomes the one place both the new "Create your facility"
entry point (reference §4) and superadmin's existing Provision Tenant form
could eventually call — not two implementations of the same write.

### 4.2 An owner identity, reusing what's already half-built

**Today:** `staff-auth.js` is a complete, tested, *disabled* scaffold for
Google sign-in, gated by `STAFF_GOOGLE_ENABLED = false` and an allow-list at
`clients/{slug}/settings/staffAuth`. Its own header comment already flags
exactly what's missing for production use: the allow-list "sits under this
app's open per-facility Firestore rule, so anyone could edit it" and needs
"a staff custom claim" or a locked-down rule before go-live.

**Proposed:** this scaffold supplies the *admin-access gate*; sign-up itself
should reuse a different, already-**live** piece — `my-auth.js` (`MyAuth`),
the Google + email/password sign-in already used for player accounts
(`account.html`). Full detail in §11; summary:

1. A facility owner signs up with `MyAuth` — the exact same Google/email
   flow a player already uses, not new sign-in UI.
2. Account creation calls `createFacility` (§4.1); the signed-in UID is
   written as that tenant's owner — a new field, since nothing today
   records who *made* a tenant, only its PIN.
3. The owner's email (Google *or* password account — see §11.4 for why
   `staff-auth.js` needs a small generalization here) is auto-added to that
   tenant's `staffAuth.emails` allow-list, closing the loop: the same person
   who just created the facility can immediately get into its Admin Console
   without also needing to know the PIN they just set.
4. The existing "invite staff" gap (reference §28) becomes: add more emails
   to that same allow-list from Admin → Security. Small addition to an
   existing screen, not a new feature.
5. Before this goes live for real owners, do the hardening the scaffold's
   own comment already calls for: move the allow-list behind a Firestore
   rule or a callable that checks a staff custom claim, mirroring how
   `superadmin.html` already works.

This is deliberately **not** a proposal to build a new auth system — it's
"turn on and harden the thing already sitting in the repo."

## 5. Payments: recommend keeping the manual model, not building OAuth

The reference spec's §14–16 assume a connectable payment processor. Building
that (PayMongo, Stripe, or similar, with OAuth, webhooks, reconciliation) is
a materially larger project than the rest of this proposal combined, and the
manual-QR model is a considered design choice for this app's current scale,
not an oversight — it's exactly what every existing tenant already uses, and
[ADMIN_GUIDE.md](ADMIN_GUIDE.md) §3 documents it as intentional ("This app
never processes payment itself").

**Recommendation:** onboarding Step 5 should be "upload your GCash/Maya/bank
QR code" (wrapping the existing Payment QR Code & Channels Manager), with
copy that sets expectations correctly — not "Connect your payment account,"
but "Show players how to pay you." If and when a connected processor is
wanted, that's its own proposal, not a sub-task of onboarding.

## 6. Onboarding progress, save & resume

The reference's persistent stepper/checklist (§6, §23–24) is new UI but not
new *data* — every step's answer already lives in Firestore the moment its
existing Save button is clicked (config doc, courts doc, settings doc,
staff-reserve doc). "Progress" can be derived by checking which of those
docs are non-default, rather than needing a separate onboarding-progress
record:

| Step | "Complete" when |
|---|---|
| Facility details | `config/state.businessName` isn't empty |
| Courts | `courts/state` has at least one court |
| Schedule | `clients/{slug}/status` or hours doc has been saved at least once (vs. the auto-seeded default) |
| Pricing | At least one court has a non-default rate, or the owner explicitly confirmed the default |
| Payments | At least one QR channel has an image |
| Add-ons | Always "complete" (optional, reference §19) |

This also means save & resume (reference §23) is close to free — there's
nothing to persist beyond "which step is the owner currently on," since the
underlying answers are already durable the moment each step is saved. A new,
tiny `onboarding/state` doc per tenant (current step index, dismissed at
publish) is the only new data this whole proposal actually needs.

## 7. Draft → Published lifecycle

Map directly onto the lifecycle state machine that already exists
([SUPERADMIN_GUIDE.md](SUPERADMIN_GUIDE.md) §3.3:
`provisioning → trial → active → grace → restricted → suspended → cancelled → archived`):

- `createFacility` starts a tenant at `provisioning` (new: today's
  provisioning flow skips straight to `active` or `trial`).
- The tenant does **not** appear on the public facility picker while
  `provisioning` — `picker.html` only ever reads `tenantDirectory` rows
  with `status == 'active'`, so `createFacility` simply doesn't write (or
  writes a non-`active` status into) the `tenantDirectory` entry until
  publish. This is the "draft" state the reference asks for (§25), reusing
  the picker's existing filter rather than adding a new one — no change to
  `picker.html` needed.
- "Publish facility" (reference step 7 → readiness check → publish) moves
  the tenant from `provisioning` to `trial`, which is also the moment it's
  registered into `tenantDirectory` and becomes visible.
- The readiness check (reference §21) is the table in §6 above, rendered as
  a checklist with "Fix" links back to the relevant step — no new validation
  logic, just reading the same docs the steps already wrote.

## 8. Entry point

Reference §4. Today `picker.html` is purely a facility *directory* — nothing
on it leads to creating one. Add a card there, same visual pattern as the
existing "My Matches" / "Walk-in Queue" cards (see [QUEUE_MODULE.md](QUEUE_MODULE.md)
for that pattern) — "Own a facility? List it here →" — leading to the new
owner sign-up (§4.2) and then straight into the stepper.

## 9. What this proposal deliberately does not do

- **Does not touch the booking engine, Find a Game, Queue, Store, or
  Tournaments.** Onboarding only writes to the same config/courts/settings
  docs those features already read.
- **Does not change how existing tenants work.** A tenant provisioned the
  old way (superadmin, or organically) has no `owner` field and no
  `onboarding/state` doc; the admin screens should treat both as equally
  valid (`owner` absent just means "ask a superadmin," same as today).
- **Does not retire `superadmin.html`'s Provision Tenant form.** It stays —
  for support cases, bulk/manual provisioning, or an owner who'd rather call
  the platform than self-serve. It should eventually call the same
  `createFacility` function (§4.1) instead of duplicating its writes, but
  that's a refactor, not a blocker.
- **Does not build payment processor integration** (§5) or **booking-attached
  add-ons** (§3, step 6) — both flagged as separate proposals if wanted.

## 10. Suggested phasing

1. **`createFacility` Cloud Function** + minimal owner sign-up (Google, via
   the existing scaffold) + the stepper shell wrapping steps 1–5 (facility
   details, courts, schedule, pricing, payments) exactly as they exist in
   Admin today, each just re-skinned with onboarding copy and a "Next" button.
2. **Readiness check + publish**, closing the provisioning→trial lifecycle
   gap (§7).
3. **Bulk-add-courts** and **pricing presets** (§3) — small UX improvements,
   not blockers to shipping phase 1.
4. **Staff invites** via the allow-list (§4.2 step 4) and the allow-list
   hardening its own code comment calls for.
5. *(Only if separately requested)* Add-ons attached to booking checkout,
   or a connected payment processor.

Phase 1 alone — reusing five already-built, already-documented admin
screens behind a stepper, plus one new Cloud Function and the dormant
Google-auth scaffold switched on — is enough to hit the reference spec's
core promise: **a new owner can create and launch a facility without a
platform operator touching `superadmin.html` on their behalf.** Everything
after phase 1 makes that experience better; it doesn't change whether
self-service is possible.

---

## 11. Detailed technical design: closing the two gaps

§4 named the two gaps and the shape of the fix. This section is the concrete
design — exact functions, exact data, and why it needs **zero changes to
`firestore.rules`**, which matters: that file has been deliberately,
carefully field-scoped (its own comments on `platformTenants` walk through
exactly why a plain `allow write` there was wrong), and this design avoids
reopening it.

### 11.1 Owner sign-up: reuse `MyAuth`, not `StaffAuth`, for the sign-in itself

`my-auth.js` is already live, already handles both Google (popup, with a
redirect fallback already built for the sign-in "blink" issue tested earlier
on this project) and email/password (`signInWithEmail`,
`createAccountWithEmail`), and already writes a normalized profile to
`users/{uid}` — a collection whose Firestore rule already allows exactly
"the signed-in user, for their own doc, excluding superadmin/platformPerms
accounts" (`firestore.rules` line ~493). A facility owner signing up is not
a new *kind* of identity — it's a player-style Firebase Auth account that
happens to also own a tenant. The new "Create your facility" entry point
(§8) should call `MyAuth.signIn()` / `signInWithEmail()` /
`createAccountWithEmail()` exactly as `account.html` already does, then
call `createFacility` (§11.2) with the resulting UID/email. No new sign-in
component.

`staff-auth.js` is not involved in sign-up at all — it's purely the gate
that later lets this now-authenticated owner *into their tenant's Admin
Console*, same as it would for any invited staff member (§11.4).

### 11.2 `createFacility` — new Cloud Function

```
exports.createFacility = onCall({ region: REGION }, async (request) => {
```

following the exact shape every function in `functions/index.js` already
uses ([functions/index.js](functions/index.js), e.g. `submitMatchScore`).

**Auth check** (new pattern for this codebase — worth calling out):
`correctMatchScore`'s own comment admits "this app has no per-person auth to
enforce that with." `createFacility` is the first function that needs one,
because unlike tournament actions (PIN-gated at the UI layer, same tenant
either way) this call is *minting* a tenant, and must know who's asking:

```js
if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in first.');
const uid = request.auth.uid, email = request.auth.token.email;
if (request.auth.token.superadmin || request.auth.token.platformPerms) {
  throw new HttpsError('permission-denied', 'Use the Superadmin Console to provision tenants.');
}
```

(That last check mirrors the exact exclusion already written into the
`users/{uid}` rule — platform staff accounts shouldn't double as tenant
owners through this path.)

**Validation, in order** (each a plain `HttpsError('failed-precondition', …)`
with a message the UI can show inline, same pattern as every existing
function):

1. `slug` matches the same format rule `functions/index.js`'s own
   `assertValidTenantId()` already enforces for every other function
   (reuse it directly — it's already imported in that file).
2. One-facility-per-owner: `platformTenants` query
   `.where('ownerUid', '==', uid).limit(1)` — reject if non-empty.
3. Slug uniqueness: `platformTenants/{slug}` read — reject if it exists.
   (An "organic" tenant that already has `clients/{slug}/config/state` but
   no `platformTenants/{slug}` entry — §0's organic-tenant case — is still
   available; the function should register *into* it rather than reject,
   mirroring exactly what Provision Tenant's existing
   `provisionTenantDefaults` already does for that case.)

**Writes**, one `admin.firestore().batch()` (atomic — partial tenant
creation on a mid-write failure would be worse than rejecting up front):

| Doc | Content |
|---|---|
| `clients/{slug}/config/state` | business name, address, contact email/phone, default theme color, hero headline/subheadline defaulted from the business name |
| `clients/{slug}/courts/state` | one default court, `{ id: 'court1', name: 'Court 1', startHour: 8, endHour: 22, active: true }` — identical default to today's Provision Tenant |
| `clients/{slug}/settings/state` | hashed PIN (same hashing utility `provisionTenantDefaults` already uses), empty `payMethods` |
| `clients/{slug}/settings/staffAuth` | `{ emails: [email] }` — the owner can reach their own Admin Console the moment they're done, without separately learning their own PIN |
| `clients/{slug}/bookings\|openPlay\|morning\|staffReserve\|queues/state` | empty defaults, identical to today |
| `clients/{slug}/onboarding/state` | **new** — `{ ownerUid: uid, currentStep: 'courts', createdAt }`. This is the doc the stepper UI reads/writes directly from the client (no new rule needed — it's inside the already-open `clients/{slug}/**` surface every other per-tenant doc uses today) |
| `platformTenants/{slug}` | `{ status: 'provisioning', lifecycle: 'provisioning', ownerUid: uid, ownerEmail: email, createdAt, plan: null }` — **not** `tenantDirectory` yet (§7) |

Returns `{ slug }`.

### 11.3 `publishFacility` — new Cloud Function

```js
exports.publishFacility = onCall({ region: REGION }, async (request) => {
  const { slug } = request.data || {};
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in first.');
  const tenantRef = db.collection('platformTenants').doc(slug);
  const tenant = (await tenantRef.get()).data();
  if (!tenant || tenant.ownerUid !== request.auth.uid) {
    throw new HttpsError('permission-denied', 'Not your facility.');
  }
  const missing = await checkReadiness(slug); // the §6 table, server-side
  if (missing.length) return { ready: false, missing };

  await Promise.all([
    tenantRef.set({ status: 'active', lifecycle: 'trial', publishedAt: now }, { merge: true }),
    db.collection('tenantDirectory').doc(slug).set({ businessName, theme, status: 'active' }),
  ]);
  return { ready: true };
});
```

The ownership check (`tenant.ownerUid !== request.auth.uid`) is why the
client never needs to read `platformTenants` directly — the one place that
needs to know "is this really the owner" does the check server-side, with
Admin SDK access, and returns only a yes/no plus what's missing. **This is
the reason the whole design needs no `firestore.rules` changes**: the one
genuinely sensitive check (who owns this tenant) never crosses into a
client-readable rule at all.

### 11.4 Generalize `staff-auth.js`'s Google-only check

One precise, small change. Today:

```js
function googleStaffFrom(user, allowList) { /* checks user is Google-provider */ }
```

Since owners (and future invited staff) may have signed up via `MyAuth`
with *either* Google or email/password, this should become:

```js
function staffFrom(user, allowList) {
  // Any verified Firebase Auth email counts, not just Google's.
}
```

— dropping the Google-specific provider check, keeping everything else
(the allow-list lookup, `accessDecision()`'s `pin` / `pin-or-google` /
`google` modes — which should probably be renamed `pin-or-auth` / `auth`
at the same time, since they're no longer Google-specific). `STAFF_GOOGLE_ENABLED`
becomes effectively `STAFF_AUTH_ENABLED`. This touches one file, is covered
by that file's existing Node-testable pure functions, and changes no
Firestore access pattern.

### 11.5 Open product decisions (recommending a default, not deciding silently)

| Decision | Recommendation | Why it's not just decided here |
|---|---|---|
| One facility per owner account, at least initially? | **Yes.** Simplest abuse guard; `createFacility`'s check in §11.2 is one query. | If the business already has owners running multiple clubs under one identity, this blocks them day one — worth confirming before building. |
| Auto-expire tenants stuck in `provisioning` and never published? | **Not in phase 1.** A handful of abandoned draft slugs cost nothing at this scale (free-tier Firestore, <10 tenants today) and `isValidTenantId()` already prevents slug squatting from blocking a *real* name (a draft can be deleted and the slug reused). Revisit if self-service volume grows. | Policy call, not a technical constraint. |
| Does the owner choose their own PIN during sign-up, or is one generated? | **Owner chooses** (matches the reference spec's step 3 "Configure booking fees" pattern of asking, not generating, and matches today's Provision Tenant form, which also lets the provisioner pick it). | Minor, but affects the sign-up form's field list. |

This section is deliberately more opinionated than §0–§10 — it's answering
"how," not just "what" — but every recommendation above is a default, not a
commitment. Flag disagreement on any row and the design changes there, not
everywhere.
