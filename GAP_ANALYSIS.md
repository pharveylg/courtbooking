# CourtBooking → Platform Control Plane: Gap Analysis & Restructure

**Date:** 11 September 2026
**Basis:** `dulahq-platform-implementation-roadmap.md` (10 September 2026) — the DulaHQ platform model: Platform Admin → Organizations (tenants) → Entitlements & Plans → Billing domain, with the entitlement/permission separation, separate access-billing-product statuses, and a manual-QR billing domain before any payment processing.
**Subject:** `pharveylg/courtbooking` @ `98886d7` (multi-tenant pickleball court booking SaaS on Firebase: Hosting + Firestore + Storage + Auth + Functions v2; tenant apps are vanilla HTML/JS).
**Scope applied:** the superadmin console restructured into a platform control plane organized around **Tenants** and **Entitlements**, plus the plan catalog and invoice/billing-domain primitives — per the roadmap's Platform Admin blueprint.

---

## 1. Executive summary

CourtBooking already had the three hard parts of a multi-tenant SaaS in place: path-isolated tenant data (`clients/{slug}/...`), a superadmin-gated platform registry (`platformTenants`), and a usage-event ledger that billing derives from. What it did **not** have was the roadmap's *control-plane model*: tenants were flat rows with an on/off switch, "entitlements" were raw boolean flags (`storeEnabled`, `tournamentEnabled`) written straight onto a runtime document, pricing lived as three loose numbers per tenant with no plan concept or versioning, and billing stopped at a "suggested charge" + prepaid balance with no invoice documents, no payment states, and no verification trail.

This restructure applies the DulaHQ roadmap's Platform Admin pattern to that reality:

- **Tenants became organizations with a lifecycle** (provisioning → trial → active → grace → restricted → suspended → cancelled → archived), with access status, billing status, and product status represented as **separate fields** (roadmap §3).
- **Product entitlements became entities** — one lifecycle document per product per tenant (booking core / Store / Tournaments) with trial/active/suspended/cancelled states, an independent pause hold, and an append-only history — instead of scattered booleans (roadmap §2.1, §3).
- **A two-layer entitlement model**: the platform decides what a tenant owns (superadmin-only `platformTenants/{slug}/entitlements/*`); tenant-facing apps keep consuming a derived runtime gate (`clients/{slug}/status/state`) that the console re-mirrors on every change. Roadmap §2.1's "entitlement ≠ permission" is preserved within this app's trust model (see gap G-08).
- **A plan catalog with versioned pricing** and per-tenant subscriptions stamped with the pricing version, seeded from the real plan reference in `CLIENTS.md` (roadmap §3 core commercial entities).
- **The billing domain's core document**: platform invoices with frozen, explainable line items (base subscription / booking overage / staff-reserve hours / add-on fees, each with `sourceType` + `sourceId`), walking the roadmap's manual payment states — `draft → awaiting_payment → submitted_for_verification → verified / rejected / partially_paid / waived / cancelled` — where a submitted payment is **never** auto-verified (roadmap §5, §10, §11).
- **Platform Admin navigation** per roadmap §5: Overview / Tenants / Provision Tenant / Entitlements / Plans & Pricing / Invoices / Usage Reports / Feature Ideas / Audit & Security.

Everything shipped is backward compatible: no tenant-facing file was modified, existing tenants keep working through migration-on-read, and the legacy booleans remain the runtime contract.

---

## 2. Current-state snapshot (as cloned)

```text
courtbooking
├── index.html                  ← tenant booking app (players + staff PIN admin console)
├── store.html                  ← Store add-on product (per-tenant POS)
├── tournament.html / -admin.html ← Tournaments add-on product
├── picker.html                 ← public facility directory (reads tenantDirectory)
├── superadmin.html             ← platform console  ★ restructured
├── firestore.rules             ← tenant isolation + superadmin gates  ★ extended
├── functions/                  ← tournament bracket engine (only server-adjudicated writes)
├── setup-*.js / seed-*.js      ← provisioning/migration scripts
└── CLIENTS.md                  ← real tenant registry + plan reference (A/B/C)
```

**Before this restructure:**

| Concept | Implementation |
|---|---|
| Tenant registry | `platformTenants/{slug}`: name, `status: active\|suspended`, `billing {baseFee, freeBookings, perBookingRate}`, `creditBalance` |
| Entitlements | Raw booleans on the public-readable runtime doc `clients/{slug}/status/state`: `bookingPaused`, `storeEnabled/storePaused`, `tournamentEnabled/tournamentPaused` |
| Product gating | Tenant apps read `status/state` directly; Store and Tournaments render "Not enabled — contact support" when off |
| Plans | None. `CLIENTS.md` documents Plan A (₱3,000 setup, ₱500/mo after yr 1) and Plan C (₱10,000 annual) — but only in prose |
| Billing | Suggested charge computed from the usage events ledger (base + bookings over allowance + staff-reserve hrs at half rate); manual prepaid `creditBalance` top-up/apply; CSV export |
| Invoices | None — no document, no states, no verification trail |
| Audit | `platformAuditLog` (append-only) — already strong |
| Platform identity | Firebase Auth + `superadmin` custom claim — single role, no permission groups |

---

## 3. Gap analysis matrix

Statuses: **CLOSED** (shipped in this restructure) · **PARTIAL** (foundation shipped, completion items listed) · **OPEN** (deferred, with roadmap phase reference).

| # | Roadmap capability (§ref) | State before | State after | Status |
|---|---|---|---|---|
| G-01 | Platform Admin is a platform-scoped authority (§4 P0) | Single `superadmin` claim; console mixed platform + per-tenant ops | Same trust model, but the console is now organized as a control plane (Overview → Audit), and every mutating action is audited with actor attribution | PARTIAL → G-19 |
| G-02 | Organization lifecycle: provisioning → trial → active → grace → restricted → suspended → cancelled → archived (§3) | Binary `active/suspended` flag only | Full `lifecycle` field with all eight roadmap states; lifecycle drives the runtime site gate; Suspend/Activate is now a lifecycle action | CLOSED |
| G-03 | Access status ≠ billing status ≠ product status (§3) | One `status` flag carried all three meanings | Separate: `lifecycle` (access), `billingStatus` (`current/grace/overdue/suspended_notify_only` — notify-only by design, matching the existing no-auto-suspend policy), and per-product entitlement status | CLOSED |
| G-04 | Product entitlements as entities with lifecycle + history (§3) | Booleans on the runtime doc; no trial concept, no history | `platformTenants/{slug}/entitlements/{product}` docs: `trial/active/suspended/cancelled` + independent `paused` hold + `grantedAt/grantedBy` + append-only `history[]` per change | CLOSED |
| G-05 | Entitlement gating separate from product runtime (§2.1) | N/A — booleans were the only layer | Two layers: platform entitlement docs (superadmin-only) → derived runtime mirror (`status/state`) written by one `syncTenantRuntime()` path on every change | CLOSED |
| G-06 | Plans, pricing versions, limits (§3) | None (three loose numbers per tenant) | `platformPlans/{planId}`: monthly base, included bookings, overage rate, max-courts limit, per-add-on monthly fees, features, `pricingVersion`; assignment stamps a `subscription` on the tenant | CLOSED |
| G-07 | Entitlement-to-plan relationship (§3) | None | Subscription `{planId, planName, pricingVersion, status, startedAt}` on each tenant; plans show subscriber counts; add-on entitlements are billed via the plan's add-on fees | CLOSED |
| G-08 | Entitlement must not auto-grant user permission (§2.1) | App has no per-user auth by design (staff share a PIN; rules trust tenant context) | Unchanged — documented as a deliberate platform-level gap. Entitlement gates *product access per tenant*; per-person permissions remain out of scope for this app's trust model | OPEN (by design) |
| G-09 | Usage meters + events (§4 P2) | Already present: `platformTenants/{slug}/events` ledger + `usage/{period}` views | Unchanged (already roadmap-conformant); invoices now consume the ledger with frozen snapshots | CLOSED (pre-existing) |
| G-10 | Historical usage immutable when current data changes (§4 P2 exit) | Reporting recomputed live; no snapshot | Invoice `lines[]` + `snapshot{}` freeze confirmed bookings / staff hours / formula at generation; issued invoices are never rewritten by regeneration | CLOSED |
| G-11 | Draft invoices with explainable lines (§4 P2) | None | `platformInvoices/inv_{slug}_{period}` with per-line `sourceType/sourceId/description/qty/unitAmount/amount` — base subscription, overage, staff-reserve, add-on fees | CLOSED |
| G-12 | Manual QR payment states + verification (§5, §11) | Only prepaid top-up/apply; no states | Full state machine: `draft → awaiting_payment → submitted_for_verification → verified/rejected/partially_paid/overdue/waived/cancelled`; submission never auto-verifies; payments[] and adjustments[] recorded on the invoice; status overrides audited. **Extended (Phase B1):** payer claims arrive as `platformSubmissions` docs (method/reference/amount/proof) and are decided in the console's Verification Queue — verify applies an attributed payment, reject stamps the reason visible in the tenant portal | CLOSED |
| G-13 | Payment instructions / platform QR config (§5) | None | `platformSettings/billing` (GCash / bank / notes), editable in Plans & Pricing, rendered on every unverified invoice | CLOSED |
| G-14 | Credits and manual adjustments (§4 P2) | `creditBalance` increment + "apply month's charge" | Kept, and integrated: "Apply from Credit Balance" decrements the ledger, records a `credit_balance` payment, and marks the invoice verified/partially_paid; waivers/rejections/cancellations recorded as adjustments | CLOSED |
| G-15 | Billing events audit (§4 P2) | Generic platform audit only | Every invoice action, plan change, entitlement change, and lifecycle change is a distinct audited action with labels | CLOSED |
| G-16 | Platform Admin navigation by workspace (§5) | 5 ad-hoc tabs | 9 workspaces mirroring the roadmap list: Overview / Tenants / Provision / Entitlements / Plans & Pricing / Invoices / Usage Reports / Feature Ideas / Audit & Security | CLOSED |
| G-17 | Organization cockpit (§4 P1) | Per-tenant Manage accordion (branding, PIN, retention, watermark, billing, demo data) | Kept in full, plus lifecycle + billing-status controls, subscription panel, plan chip, entitlement chips | CLOSED |
| G-18 | Platform overview / health (§5 Overview; §7) | None — no landing surface | Overview tab: tenants by state, live entitlements per product, MTD projected billing, open-invoice exposure, verified MTD, "needs attention" list (suspended tenants, non-current billing, expiring trials, unverified invoices), recent audit | PARTIAL (no background-job health — there are no jobs; no uptime surface) |
| G-19 | Platform Admin permission groups (`manage_organizations`, `manage_entitlements`, … §4 P1) | Single `superadmin` claim for everything | Not implemented — one role remains. The audit log + append-only rules bound the blast radius. Blocked on real multi-admin need | OPEN (P1) |
| G-20 | Support queue & diagnostics / "explain why" access (§4 P1) | Feature Ideas scratchpad doubles as support scoping; troubleshooting FAQ | Unchanged; Feature Ideas tab retained as the support/scoping surface | OPEN (P1) |
| G-21 | Organization-facing billing portal (§5 org view: see invoices, submit proof, track verification) | None (platform-side only) | **CLOSED (Phase B1):** `billing.html` — PIN-gated tenant portal showing plan/balance/billing status, this-month projection, all invoices with frozen lines, platform payment instructions, and payment-claim submission (method + reference + proof upload). Claims land in the console's Verification Queue; a submission never mutates the invoice | CLOSED |
| G-22 | Invoices for historical periods (§10 source references) | Generation is current-month only (`computeTenantReport` is month-bound) | **CLOSED (Phase B2):** `computeTenantReport(t, offset)` is period-parameterized (month-to-date now, full-month for history); the Invoices tab has a month picker and generation notes the retroactive staff-reserve caveat for historical months | CLOSED |
| G-23 | Automated payment provider (§4 P7, B5) | None | Deliberately deferred per the roadmap's core decision: *build the billing domain now, defer the processor*. `platformSettings/billing` + invoice states are provider-ready | OPEN (P4/B5) |
| G-24 | Suspension blocks only the intended product scope (§6 cross-tenant tests) | Suspend = booking page only; Store/Tournament pages stay reachable when tenant suspended | Behavior preserved exactly (no tenant-app change). Lifecycle policy should decide whether tenant suspension should also gate add-ons — one-line change in `syncTenantRuntime` when decided | OPEN (policy decision) |
| G-25 | Free-tier operating rules (§6) | Already followed: no paid infra, no payment credentials, manual jobs | Unchanged; new collections are free-tier-neutral (reads bounded by console use) | CLOSED (pre-existing) |

**Pre-existing strengths confirmed against the roadmap** (no action needed): tenant isolation by Firestore path + rules (§4 P0), append-only audit (§4 P0), usage-event ledger as billing source of truth (§4 P2), append-only per-tournament audit, server-adjudicated bracket writes (the one place client trust was correctly withheld), public directory separation (`tenantDirectory` vs `platformTenants`).

---

## 4. What changed (applied code)

### 4.1 Data model

```text
platformPlans/{planId}                              NEW  superadmin-only
  name, monthlyBase, includedBookings, perBookingRate,
  maxCourts, addonFees{store,tournament}, products[],
  features[], pricingVersion, seeded?, createdAt/updatedAt

platformTenants/{slug}                              EXTENDED
  lifecycle: provisioning|trial|active|grace|restricted|suspended|cancelled|archived
  billingStatus: current|grace|overdue|suspended_notify_only   (notify-only)
  subscription: { planId, planName, pricingVersion, status, startedAt, trialEndsAt? }
  (legacy `status: active|suspended` kept in sync — picker/reports unchanged)

platformTenants/{slug}/entitlements/{product}       NEW  inherits superadmin-only rule
  product: booking|store|tournament
  status: trial|active|suspended|cancelled
  paused: bool                    ← independent hold; status unchanged
  grantedAt/grantedBy, updatedAt/updatedBy
  history: [ { at, action, from, to, pausedTo?, by, note } ]   (append-only via arrayUnion)

platformInvoices/inv_{slug}_{YYYY-MM}               NEW  superadmin-only
  tenantId, tenantName, period, status (9 roadmap states)
  lines: [ { sourceType: subscription|usage_event|entitlement,
             sourceId, description, qty, unitAmount, amount } ]
  subtotal, total, creditsApplied
  payments:   [ { at, method, reference, amount, by } ]
  adjustments:[ { at, type, note, by } ]
  snapshot: { confirmedBookings, staffReserveHours, includedBookings,
              perBookingRate, planId, generatedAt, note }     ← frozen inputs

platformSettings/billing                            NEW  read: public (payers need it) · write: superadmin
  gcashName, gcashNumber, bankName, bankAccount, notes

platformSubmissions/{autoId}                        NEW  create: payer (billing.html) · review: superadmin
  tenantId, tenantName, invoiceId, period
  method, reference, amount, proofUrl
  status: pending|verified|rejected
  reviewedBy, reviewedAt, rejectionReason?

storage: platformProofs/{slug}/{file}               NEW  payment-proof uploads from billing.html (image/pdf, <8MB)
```

### 4.2 Two-layer entitlement flow

```text
SUPERADMIN ACTION (console)                     TENANT-FACING RUNTIME (unchanged)
setEntitlement() / setTenantLifecycle()         clients/{slug}/status/state
  → entitlement doc + history                       bookingPaused
  → syncTenantRuntime()                ──mirror──►  storeEnabled / storePaused
  → platformAuditLog entry                          tournamentEnabled / tournamentPaused
```

Derivation: site online ⇔ `lifecycle ∈ {provisioning, trial, active, grace}`; `bookingPaused = !siteOnline` (or booking entitlement not live); Store/Tournament enabled ⇔ entitlement `trial|active`; paused ⇔ `paused` hold or `suspended`. Virtual entitlements (pre-restructure tenants with no docs) are synthesized from the legacy booleans and materialize on first change — zero-migration onboarding.

### 4.3 Files touched

| File | Change |
|---|---|
| `superadmin.html` | Control-plane restructure: 9-tab navigation; new Overview / Entitlements / Plans & Pricing / Invoices panels; platform services (entitlement lifecycle, lifecycle/billing-status, plans, payment settings, invoices); tenant rows gain lifecycle chip, plan chip, lifecycle + billing-status controls, subscription panel; Store/Tournament/booking toggles rewired from raw status writes to the entitlement service; provisioning gains plan + trial selection; CSV export gains Plan/Lifecycle/Billing Status columns; audit labels for all new actions |
| `firestore.rules` | `platformPlans`, `platformInvoices`, `platformSettings` (superadmin-only); entitlements subcollection note (inherits the `platformTenants` rule) |
| `GAP_ANALYSIS.md` | This document |
| `SUPERADMIN_GUIDE.md` | Rewritten for the new console (below) |

**Not touched (deliberately):** `index.html`, `store.html`, `tournament*.html`, `picker.html`, `functions/`, setup/seed scripts. The runtime contract (`status/state` booleans) is unchanged, so tenant apps need no redeploy beyond rules.

---

## 5. Roadmap-to-implementation mapping

| Roadmap concept | CourtBooking implementation |
|---|---|
| Organization | Tenant (`platformTenants/{slug}`, data under `clients/{slug}/…`) |
| Product entitlement: Club / Tournament / Combined | Product entitlements: `booking` (core) / `store` / `tournament` add-ons — per-tenant, independently lifecycled |
| Platform Admin | Superadmin console (Firebase Auth + `superadmin` claim) |
| plans / plan_features / plan_limits / pricing_versions | `platformPlans` (features[], maxCourts, addonFees, pricingVersion) |
| subscriptions / subscription_items | `subscription{}` on the tenant (single-item; items implicit in the formula) |
| entitlements | `platformTenants/{slug}/entitlements/{product}` |
| usage_meters / usage_events / usage_period_summaries | Pre-existing `usage/{period}` views + `events/` ledger; meter scope unchanged (confirmed bookings billed; staff-reserve hrs at ½ rate; views/queues/open-play analytics-only) |
| invoices / invoice_lines | `platformInvoices` with `lines[]` + frozen `snapshot{}` |
| payments / credits / refunds / billing_adjustments | `payments[]` + `adjustments[]` on invoices; `creditBalance` ledger + credit-application action; refunds/waivers as adjustment types |
| billing_events | `platformAuditLog` with invoice/plan/entitlement/lifecycle action labels |
| ManualQrPaymentProvider | `platformSettings/billing` instructions + manual verification queue (console side); provider interface deferred (G-23) |
| Two-level billing (§9): platform billing vs product billing | Already separated in the Reporting & Billing Center ("tenant's own revenue from their players" vs "what the tenant owes the platform"); invoices cover the platform level only |

---

## 6. Verification

- `node --check` on the full console script and the billing portal script — clean.
- Static ID audit: every `getElementById` target, `data-sa-tab` ↔ panel pairing, duplicate-ID check — clean.
- **`tests/control-plane.test.js` — in-memory Firestore integration suite, 40/40 passed.** Covers: platform-state building with legacy migration fallbacks; entitlement grant → doc materialization + mirror + audit; lifecycle suspend/reactivate → runtime pause + `platformTenants`/`tenantDirectory` mirrors; suspend-preserves-Store behavior; starter-plan seeding; plan assignment → subscription + billing overwrite; draft invoice generation (frozen lines, overage math, add-on fees, zero-formula skip); issued → submitted → verified (never auto-verified); **B2:** historical-month generation buckets the right month's events (this test caught and fixed an offset bug) + month-offset math; **B1:** submission → queue → verify (attributed payment + reviewer stamp) and reject (reason stamped, visible to tenant); credit application; renderers; CSV export.
- **`tests/billing-portal.test.js`** — portal boot smoke: tenant resolution, branding application, PIN gate render.
- Rule changes ship with matching exposures: tenants `get` their own invoice docs (id-bound: `inv_{slug}_{period}` encodes the tenant, `list` stays superadmin-only), their own registry doc, and their own usage/events ledger; `platformSettings/billing` and `platformSubmissions` are publicly readable (payment instructions must reach payers; submissions are claims — same posture as the existing public `proofs/` bucket, flagged for the Security tab); invoice writes and submission reviews remain superadmin-only.

**Deployment note:** run `firebase deploy --only firestore:rules` with this branch. No indexes are required by the new queries (single-field ordering + client-side filtering). No data migration is required — entitlement docs materialize on first management action, and a one-time "Seed Starter Plans" click populates the catalog.

---

## 7. Phased build status (roadmap-referenced)

| Phase | Scope | Status |
|---|---|---|
| **B0 — Control-plane restructure** | Tenants, entitlements, plans, invoices, console navigation (this document §3–§5) | ✅ Shipped 11 Sep 2026 |
| **B1 — Tenant billing portal** | `billing.html` (payer side of the manual-QR loop): PIN-gated, shows plan/balance/status + this-month projection + all invoices; payment-claim submission with proof upload → `platformSubmissions`; console **Verification Queue** (verify applies an attributed payment, reject stamps a reason the tenant sees); rules expose own invoices/registry/usage to the tenant and payment instructions publicly | ✅ Shipped 11 Sep 2026 |
| **B2 — Historical-period invoicing** | `computeTenantReport(t, offset)` full-month walks for past periods; month picker on invoice generation with retroactive-staff-pattern caveat; offset-aware event bucketing (newer months excluded from historical invoices) | ✅ Shipped 11 Sep 2026 |
| B3 — Lifecycle policy engine | Trial-expiry one-click actions; suspension × add-ons policy decision (G-24); invoice-driven billing-status suggestions | Next |
| B4 — Diagnostics workspace | "Explain access" panel (why is X paused, since when, by whom), org troubleshooting (G-20) | Queued |
| B5 — Permission groups | Split single `superadmin` claim into roadmap permission families (G-19) — when a second admin exists | Queued |
| B6 — Usage meter expansion | Queue→booking conversion, Open Play participation (touches tenant app; event-schema change) | Queued |
| P4 — Automated payments | Provider adapter behind the manual loop — deferred per the roadmap's core decision until customers justify it | Deferred (deliberate) |

---

## 8. Final rule (mirroring the roadmap)

> **The platform contract now exists: tenants have lifecycles, products are entitled entities, plans are versioned, and billing is a document trail that a human verifies. Payment processing remains deferred until customers justify it.**

The console is now the control plane the roadmap describes — provision and lifecycle organizations, grant/revoke/pause products with history, price through versioned plans, and invoice with explainable, frozen lines — all within the free-tier, no-processor operating model the platform already runs on.
