# LEGACY_CANDIDATES.md

Companion to `CURRENT_ARCHITECTURE.md`. Tracks only **remaining, unaddressed** legacy/duplicate/risk findings in the codebase, classified from evidence found by static analysis (direct reads + background research passes covering `functions/`, `superadmin.html`, `store.html`/`tournament-admin.html`/`tournament.html`/`gallery.html`, `index.html`, `picker.html`, `account.html`, the shared JS modules, and `firestore.rules`).

**Earlier revisions of this document also listed items that have since been resolved**: the legacy root-level `firestore.rules` block and an orphaned `isTenantContext()` helper (both removed), a duplicate `platformAuditLog` write on the tenant quick-suspend toggle (fixed), two misplaced HTML section comments (fixed), `billing.html`'s missing in-app link (confirmed intentional, no action), and two "legacy suspect" compatibility shims (`LEGACY_STAFF_HOURS_SA`, the virtual `{legacy: true}` entitlement synthesis) that turned out to be active, working-as-intended migration-on-read patterns needing no action. Those are no longer listed below — see git history for the original write-ups and evidence.

**Reminder of the classification rule this document follows:** an item with no static reference is `ORPHANED — STATIC ANALYSIS ONLY`, not "confirmed unused," unless additional evidence (an explicit deprecation comment, a matching replacement, etc.) upgrades it.

---

## Open items

### 1. Tournament match scheduling — two coexisting implementations

- **Location:** `functions/index.js` (`scheduleMatch`, exported ~line 466) vs (`generateSchedule` ~line 816, `moveMatch` ~line 888); client branch point `tournament-admin.html`, `venuesConfigured()` (~line 1307) and `renderMatchCard` (~line 2069).
- **What it does:** `scheduleMatch` is the older, single-court, single-match assignment that writes directly into the ordinary `clients/{slug}/bookings/state` array (documented in its own header comment as pre-dating the later multi-venue scheduler). `generateSchedule`/`moveMatch` are the newer, venue-aware scheduling engine (`engines/scheduler.js`) that writes a richer `sched.{venueId,courtId,date,startMin,endMin}` object.
- **Evidence they're both still live:** both have confirmed, current callers in `tournament-admin.html` (`scheduleMatch` at lines ~781, 2288, 2296; the newer scheduler at ~1565, 1574, 2262), and the UI actively branches between them per-tournament based on whether venues are configured.
- **Relationship:** **old vs. new implementation, coexisting by design** (a tournament with no venues configured still uses the old form) — not accidental duplication, but a real consolidation opportunity: every tournament could in principle be migrated to "always has at least one venue" and the old path retired.
- **Classification:** `DUPLICATE` (intentional, currently both required). **Confidence:** `HIGH` that both are live; `MEDIUM` on whether consolidation is actually desirable (that's a product decision, not a static-analysis conclusion).
- **Recommended next action:** flag for a product decision on whether "venues" should become mandatory for all tournaments, which would let `scheduleMatch` be retired.

### 2. Superadmin — three ways to set a tenant's billing formula

- **Location:** `superadmin.html` — (a) `initializeTenantCommercial()` at tenant creation (~line 902), (b) `assignPlanToTenant()` from the Plans & Pricing tab (~line 834), (c) the Tenant Directory row's inline "Save Billing" button (`data-save-billing`, ~line 3057).
- **What each does:** all three ultimately write `platformTenants/{slug}.billing` (and sometimes `.subscription`), but through three independent code paths with three different permission checks, and (c) can hand-edit the formula without any `subscription.planId`/`pricingVersion` stamp — silently drifting a tenant out of sync with the plan it's nominally "assigned."
- **Relationship:** **parallel implementations of the same conceptual operation** ("set this tenant's billing formula"), unlike entitlement changes, which the code itself documents as deliberately consolidated into one function (`setEntitlement()`).
- **Classification:** `DUPLICATE`. **Confidence:** `HIGH`.
- **Recommended next action:** consider consolidating into one "set billing" function the way `setEntitlement()` already models, so a plan assignment can't silently be undone by a hand-edit elsewhere. Product/priority decision, not a mechanical cleanup.

### 3. Superadmin — three ways to adjust a tenant's credit balance

- **Location:** `superadmin.html` — (a) invoice-linked `applyCredit` action (~line 1828), (b) direct top-up button `data-top-up` (~line 3071), (c) direct "apply charge" button `data-apply-charge` (~line 3086).
- **Evidence of divergence:** (a) and (b) both touch `platformTenants/{slug}.creditBalance` with an audit trail; (c) *also* decrements `creditBalance` but **creates or updates no invoice document at all** — it bypasses `platformInvoices` entirely, leaving only an audit-log line and a changed number on the tenant doc, even though the whole rest of the Invoices tab is built around invoices being the billing system's record of truth.
- **Relationship:** parallel implementations, one of which (c) is materially different in effect (no invoice trail) from the other two.
- **Classification:** `DUPLICATE`, with (c) additionally worth flagging as a **data-integrity risk** (a charge with no invoice record). **Confidence:** `HIGH`.
- **Recommended next action:** decide whether `data-apply-charge` should be retired in favor of generating a real invoice, or explicitly documented as an intentional "quick adjustment, no invoice" tool.

### 4. `platformTenants/{slug}.status` / `tenantDirectory/{slug}.status` (old) vs `.lifecycle` (new)

- **Evidence:** `superadmin.html`'s `syncTenantRuntime()` (~line 685) keeps the old boolean-ish `status` field in sync with the new `lifecycle` field, with a comment explicitly saying this is so "picker/reports keep working" — i.e., `picker.html` and reporting code still read the *old* field, not the new one.
- **Also self-documented at the time it shipped:** the control-plane restructure that introduced `lifecycle` was explicit that it was backward-compatible by design — no tenant-facing file was modified, and the legacy booleans were kept as the runtime contract on purpose (see `CURRENT_ARCHITECTURE.md` §7 for the current-state version of this same point).
- **Relationship:** this is the clearest **OLD FLOW → NEW FLOW, both still present** pattern found in the whole app. `lifecycle` is the new authoritative model; `status` is the old one, deliberately kept alive because other code still depends on it.
- **Classification:** `LEGACY SUSPECT` (with unusually strong self-documentation — closer to `DEPRECATED` in spirit, but *not* marked for removal, and it has real current dependents). **Confidence:** `HIGH` that both fields are real and both are needed *today*; `LOW` on when/whether `status` can ever be retired (that requires migrating `picker.html`/reporting to read `lifecycle` instead — out of scope for this audit).
- **Recommended next action:** runtime-verify that nothing else reads `.status`; if confirmed, plan a follow-up migration (update `picker.html`/reporting to read `.lifecycle`, then retire `.status`). Not safe to remove today.

### 5. Scoped staff permissions vs. `firestore.rules` for the runtime-status mirror write

- **What's uncertain:** `superadmin.html`'s documented permission model (see `SUPERADMIN_GUIDE.md`) says a scoped staff account holding `manage_entitlements`, `manage_organizations`, or `diagnose_access` should be able to change entitlements/lifecycle and re-sync the tenant runtime mirror. Every one of those flows calls `syncTenantRuntime()`, whose first write is to `clients/{slug}/status/state` — but `firestore.rules` (~lines 257–260) gates that exact path on `request.auth.token.superadmin == true` only, not on any of the scoped permission claims.
- **Why static analysis can't settle this:** this is a claims/rules interaction that depends on how custom claims are actually issued to real accounts (`set-superadmin-claim.js`) — reading the code shows a *plausible* conflict, not a proven one, since it's possible in practice that every account granted those scoped perms is *also* given the raw `superadmin` claim, which would make this a non-issue in practice even though the code paths look inconsistent.
- **Classification:** `UNKNOWN — RUNTIME VERIFICATION REQUIRED`. **Confidence:** `MEDIUM` that this is a real bug, based on reading the rule and the call site directly.
- **Verification method:** sign in as a test account holding only `manage_entitlements` (no `superadmin` claim) in a staging project and attempt to grant/pause an entitlement; check whether the mirror write throws `permission-denied`.

---

## Dependency / Blast-Radius Table

| Candidate | Direct Consumers | Indirect Consumers | Data Dependencies | External Dependencies | Blast Radius | Removal Risk |
|---|---|---|---|---|---|---|
| §1 `scheduleMatch` (legacy scheduling) | `tournament-admin.html` (3 call sites) | Any tournament with zero venues configured | `clients/{slug}/bookings/state`, `matches.{court,scheduledDate,scheduledHour}` | None | Removing it breaks scheduling for every venue-less tournament until venues become mandatory | **High** — do not remove without a product decision + migration of existing tournaments |
| §2 Three billing-formula paths | `superadmin.html` only | Every tenant's `platformTenants/{slug}.billing`/`.subscription` | `platformPlans` (plan catalog) | None | Consolidating (not removing) is safe if done as "add one canonical function, redirect the three buttons to it" | **Medium** — a refactor, not a deletion; test each of the three call sites still works post-consolidation |
| §3 `data-apply-charge` (invoice-less credit adjustment) | `superadmin.html` only | Any tenant's `creditBalance` | `platformTenants/{slug}.creditBalance`, `_lastReportingRows` (in-memory) | None | Changing its behavior (e.g. forcing it to create an invoice) changes what operators see in the Invoices tab going forward | **Medium** — a behavior change, needs sign-off before altering |
| §4 `.status` vs `.lifecycle` | `picker.html`, reporting code, `syncTenantRuntime()` | Every tenant-facing page that ultimately reads `clients/{slug}/status/state` | `platformTenants/{slug}`, `tenantDirectory/{slug}`, `clients/{slug}/status/state` | None | Retiring `.status` without first migrating readers would silently break tenant online/offline detection everywhere | **High** — do not touch without first confirming (and migrating) every reader of `.status` |
| §5 permission/rules mismatch | Any non-owner staff account with scoped perms | Whoever operates staff accounts today | `clients/{slug}/status/state` rule | None | If real: every scoped-permission staff account is silently broken for this one action | **N/A (bug, not a removal candidate)** — fix, don't remove |

---

## Runtime Verification Plan

| Item | Static Evidence | Runtime Verification | Expected Result | Decision |
|---|---|---|---|---|
| §5 Permission/rules mismatch | Code paths look inconsistent by inspection | In a staging project, create a test account with only `manage_entitlements` (no `superadmin` claim); attempt an entitlement change | Either succeeds (claims are always paired in practice) or throws `permission-denied` | If it throws: file as a real bug and fix the rule to also accept the scoped claim |
| §1 Legacy tournament scheduling | Both paths have confirmed live callers | Query how many existing tournaments have zero venues configured (would still depend on `scheduleMatch`) | A count — 0 means safe to plan retirement; >0 means those tournaments need migration first | Product decision once the count is known |

---

## Recommended Cleanup Sequence

Ordered smallest/safest first. Each step is independent and reversible.

| Order | Cleanup | Reason | Evidence | Dependencies | Risk | Verification | Rollback |
|---|---|---|---|---|---|---|---|
| 1 | Investigate and resolve the scoped-permission vs. Firestore-rules mismatch (§5) | Possible functional bug blocking real staff accounts from documented actions | Direct code/rules comparison | Depends on how staff accounts are actually provisioned today | Low to test, unknown severity until tested | Staging-account test as described above | N/A — this is a fix, not a removal |
| 2 | Decide and act on the `.status` vs `.lifecycle` migration (§4) — migrate `picker.html`/reporting to read `.lifecycle`, then retire `.status` | Real technical debt, explicitly self-documented, but high blast radius | `syncTenantRuntime()` comment + `CURRENT_ARCHITECTURE.md` §7 | Every reader of `.status` must be migrated first | High until migrated, then low | Full regression pass on picker.html's tenant listing and all reporting views | Keep `syncTenantRuntime()` mirroring both fields until migration is fully verified |
| 3 | Consolidate the three billing-formula-setting paths and the three credit-adjustment paths in `superadmin.html` into single canonical functions (mirroring `setEntitlement()`'s pattern) | Real duplicate-logic risk for billing data integrity, one path bypasses invoices entirely | Superadmin research pass (§2, §3) | Every existing button/flow must be redirected without behavior change | Medium | Manual test of all affected buttons pre/post refactor | Revert the refactor commit |
| 4 | Decide whether venues become mandatory for all tournaments, enabling retirement of the legacy `scheduleMatch` path | Two coexisting scheduling systems is real complexity, but actively used for venue-less tournaments today | Tournament-admin research pass (§1) | Requires a migration for any existing venue-less tournament | High | Count of currently venue-less tournaments; migrate each before removing the fallback | Do not remove `scheduleMatch` until that count is zero |
