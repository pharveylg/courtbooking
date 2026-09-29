# LEGACY_CANDIDATES.md

Companion to `CURRENT_ARCHITECTURE.md`. **Nothing in this document has been deleted or changed.** Every item is classified from evidence found by static analysis (direct reads + three background research passes covering `functions/`, `superadmin.html`, and `store.html`/`tournament-admin.html`/`tournament.html`/`gallery.html`); `index.html`, `picker.html`, `account.html`, the shared JS modules, and `firestore.rules` were verified directly.

**Reminder of the classification rule this document follows:** an item with no static reference is `ORPHANED — STATIC ANALYSIS ONLY`, not "confirmed unused," unless additional evidence (an explicit deprecation comment, a matching replacement, etc.) upgrades it.

---

## CONFIRMED DEPRECATED

### 1. `firestore.rules` — "Legacy single-tenant structure" block (lines 522–541) — ✅ REMOVED

- **What it is:** root-level rules for `/bookings/{document}`, `/openPlay/{document}`, `/morning/{document}`, `/staffReserve/{document}`, `/settings/{document}`, `/queues/{document}`, `/courts/{document}`, `/proofs/{document}` — each with `allow read, write: if true`.
- **Evidence:** the comment header at line 523 reads *"Legacy single-tenant structure (for backward compatibility during migration)"* and line 524 says *"WARNING: These should be removed once all clients are migrated to multi-tenant."* This is the code explicitly telling us it's deprecated, per Rule 4 (fact vs. inference).
- **Current caller:** none found. Repo-wide grep for the bare (non-`clients/{slug}/`) form of each of these collection names — `db.collection('bookings')`, `.collection('openPlay')`, `.collection('morning')`, `.collection('queues')`, `.collection('courts')`, `.collection('proofs')`, `.doc('settings/...')` — across every `.html` file returned **zero matches**. Every current client write goes through `clients/{slug}/{collection}/state` instead.
- **Dependency risk:** these rules currently grant **unauthenticated read/write to anyone** who requests these exact root paths, from any client (this app's or otherwise) that still knows the old, pre-multi-tenant path shape. That is a live exposure, not just dead weight, for as long as the rules stay in place.
- **Classification:** `DEPRECATED`. **Confidence:** `HIGH`.
- **Possible replacement:** already fully replaced by the `clients/{clientId}/...` rules block above it in the same file.
- **Action taken:** removed. Re-confirmed zero repo-wide references to the bare paths immediately beforehand (a second pass beyond the one that produced this document), then deleted the block. Firestore rules file brace-balance verified, full test suite (`tests/*.test.js`) re-run clean afterward. **Not yet deployed** — this was a local edit only; deploying it (`firebase deploy --only firestore:rules`) is a separate, explicit step. Live Firestore/Hosting access-log verification (the original Runtime Verification Plan entry for this item) was not performed — this removal proceeded on repo-wide static evidence alone, at the user's direction.

---

## HIGH-CONFIDENCE ORPHANED

*(Found after the original four research passes — surfaced by a compiler warning during the §1 rules deploy, not by the initial audit. Corrected into this document rather than left as a spoken claim only.)*

### 1a. `firestore.rules` — `isTenantContext()` helper function — ✅ REMOVED

- **What it was:** a `function isTenantContext(tenantId)` (originally lines 14–18, right after `isValidTenantId()`) that referenced `request.resource.data` inside a plain helper function — not valid in that position in the Firestore rules language, which the deploy step confirmed with a compiler warning: `[W] 17:14 - Invalid variable name: request.`
- **Evidence:** repo-wide grep found it defined and never called — not from any `allow` rule in the same file, and not from any other file (Firestore rules functions aren't callable from client code anyway, so this was always going to be rules-file-only).
- **Classification:** `ORPHANED`. **Confidence:** `HIGH`.
- **Action taken:** removed rather than fixed in place, since a corrected-but-still-unused function provides no value. Brace-balance re-verified, full test suite re-run clean.
- **Deploy note:** confirmed via `git diff` that this warning was pre-existing and unrelated to the §1 rules removal that surfaced it — this function was untouched by that change.

---

## LIKELY DUPLICATES

### 2. Tournament match scheduling — two coexisting implementations

- **Location:** `functions/index.js` (`scheduleMatch`, exported ~line 466) vs (`generateSchedule` ~line 816, `moveMatch` ~line 888); client branch point `tournament-admin.html`, `venuesConfigured()` (~line 1307) and `renderMatchCard` (~line 2069).
- **What it does:** `scheduleMatch` is the older, single-court, single-match assignment that writes directly into the ordinary `clients/{slug}/bookings/state` array (documented in its own header comment as pre-dating the later multi-venue scheduler). `generateSchedule`/`moveMatch` are the newer, venue-aware scheduling engine (`engines/scheduler.js`) that writes a richer `sched.{venueId,courtId,date,startMin,endMin}` object.
- **Evidence they're both still live:** both have confirmed, current callers in `tournament-admin.html` (`scheduleMatch` at lines ~781, 2288, 2296; the newer scheduler at ~1565, 1574, 2262), and the UI actively branches between them per-tournament based on whether venues are configured.
- **Relationship:** **old vs. new implementation, coexisting by design** (a tournament with no venues configured still uses the old form) — not accidental duplication, but a real consolidation opportunity: every tournament could in principle be migrated to "always has at least one venue" and the old path retired.
- **Classification:** `DUPLICATE` (intentional, currently both required). **Confidence:** `HIGH` that both are live; `MEDIUM` on whether consolidation is actually desirable (that's a product decision, not a static-analysis conclusion).
- **Recommended next action:** none from this audit alone — flag for a product decision on whether "venues" should become mandatory for all tournaments, which would let `scheduleMatch` be retired.

### 3. Superadmin — three ways to set a tenant's billing formula

- **Location:** `superadmin.html` — (a) `initializeTenantCommercial()` at tenant creation (~line 902), (b) `assignPlanToTenant()` from the Plans & Pricing tab (~line 834), (c) the Tenant Directory row's inline "Save Billing" button (`data-save-billing`, ~line 3057).
- **What each does:** all three ultimately write `platformTenants/{slug}.billing` (and sometimes `.subscription`), but through three independent code paths with three different permission checks, and (c) can hand-edit the formula without any `subscription.planId`/`pricingVersion` stamp — silently drifting a tenant out of sync with the plan it's nominally "assigned."
- **Relationship:** **parallel implementations of the same conceptual operation** ("set this tenant's billing formula"), unlike entitlement changes, which the code itself documents as deliberately consolidated into one function (`setEntitlement()`).
- **Classification:** `DUPLICATE`. **Confidence:** `HIGH`.
- **Recommended next action:** consider consolidating into one "set billing" function the way `setEntitlement()` already models, so a plan assignment can't silently be undone by a hand-edit elsewhere. Product/priority decision, not a mechanical cleanup.

### 4. Superadmin — three ways to adjust a tenant's credit balance

- **Location:** `superadmin.html` — (a) invoice-linked `applyCredit` action (~line 1828), (b) direct top-up button `data-top-up` (~line 3071), (c) direct "apply charge" button `data-apply-charge` (~line 3086).
- **Evidence of divergence:** (a) and (b) both touch `platformTenants/{slug}.creditBalance` with an audit trail; (c) *also* decrements `creditBalance` but **creates or updates no invoice document at all** — it bypasses `platformInvoices` entirely, leaving only an audit-log line and a changed number on the tenant doc, even though the whole rest of the Invoices tab is built around invoices being the billing system's record of truth.
- **Relationship:** parallel implementations, one of which (c) is materially different in effect (no invoice trail) from the other two.
- **Classification:** `DUPLICATE`, with (c) additionally worth flagging as a **data-integrity risk** (a charge with no invoice record). **Confidence:** `HIGH`.
- **Recommended next action:** decide whether `data-apply-charge` should be retired in favor of generating a real invoice, or explicitly documented as an intentional "quick adjustment, no invoice" tool.

### 5. `functions/index.js` — `submitMatchScore` vs `correctMatchScore`

- **Both write** a match's official `status`/`score`/`winnerParticipantId`.
- **Evidence this is intentional, not accidental:** `correctMatchScore`'s own header comment explicitly documents that, unlike `submitMatchScore`, it does not cascade to downstream matches (just logs a warning) and is allowed even on a "completed" tournament, requiring a `reason`.
- **Classification:** `DUPLICATE (by design)` — two write-paths to the same fields, differentiated by trust/workflow semantics. **Confidence:** `HIGH` this is intentional.
- **Recommended next action:** none — this is healthy design, documented in the audit for completeness per the brief's instruction to explicitly search for parallel implementations.

---

## LEGACY SUSPECTS

### 6. `platformTenants/{slug}.status` / `tenantDirectory/{slug}.status` (old) vs `.lifecycle` (new)

- **Evidence:** `superadmin.html`'s `syncTenantRuntime()` (~line 685) keeps the old boolean-ish `status` field in sync with the new `lifecycle` field, with a comment explicitly saying this is so "picker/reports keep working" — i.e., `picker.html` and reporting code still read the *old* field, not the new one.
- **Also documented externally:** `GAP_ANALYSIS.md` (a prior architecture-restructure record in this same repo) states outright: *"Everything shipped is backward compatible: no tenant-facing file was modified... the legacy booleans remain the runtime contract."*
- **Relationship:** this is the clearest **OLD FLOW → NEW FLOW, both still present** pattern found in the whole app. `lifecycle` is the new authoritative model; `status` is the old one, deliberately kept alive because other code still depends on it.
- **Classification:** `LEGACY SUSPECT` (with unusually strong self-documentation — closer to `DEPRECATED` in spirit, but *not* marked for removal the way the Firestore-rules block is, and it has real current dependents). **Confidence:** `HIGH` that both fields are real and both are needed *today*; `LOW` on when/whether `status` can ever be retired (that requires migrating `picker.html`/reporting to read `lifecycle` instead — out of scope for this audit).
- **Recommended next action:** runtime-verify that nothing else reads `.status`; if confirmed, plan a follow-up migration (update `picker.html`/reporting to read `.lifecycle`, then retire `.status`). Not safe to remove today.

### 7. `LEGACY_STAFF_HOURS_SA` fallback (superadmin.html, ~lines 2126–2141)

- **What it is:** a hard-coded fallback staff-reserved-hours template (17:00–21:00), used by `migrateStaffReserveShapeSA()` when migrating an old-shape `staffReserve` doc to the new per-court/per-day shape.
- **Evidence:** name and comment both say "legacy"; it's a migration-on-read shim, actively invoked (not dead), for tenants whose `staffReserve` doc hasn't yet been touched since the shape changed.
- **Classification:** `LEGACY SUSPECT` (active compatibility shim, safe to leave). **Confidence:** `HIGH` that it's a real, working migration path; `LOW`/`UNKNOWN` on how many tenants still have the old shape (would need a Firestore query across all tenants' `staffReserve` docs to know if this can ever be retired).

### 8. `loadEntitlementsFor()` — synthesizes a virtual `{legacy: true}` entitlement doc

- **Location:** `superadmin.html` ~lines 626–640.
- **What it is:** when no real `platformTenants/{slug}/entitlements/{product}` doc exists yet, this function fabricates one in memory from the old `storeEnabled`/`tournamentEnabled` booleans, tagged `legacy: true`, so the Entitlements tab UI has something to render for tenants provisioned before the entitlement-lifecycle model existed.
- **Classification:** `LEGACY SUSPECT` (active migration-on-read compatibility path). **Confidence:** `HIGH`.
- **Recommended next action:** none required; this is exactly the kind of "old and new coexist safely" pattern the brief asked us to look for, already handled gracefully.

---

## UNKNOWN / REQUIRES VERIFICATION

### 9. Scoped staff permissions vs. `firestore.rules` for the runtime-status mirror write

- **What's uncertain:** `superadmin.html`'s documented permission model (see `SUPERADMIN_GUIDE.md`) says a scoped staff account holding `manage_entitlements`, `manage_organizations`, or `diagnose_access` should be able to change entitlements/lifecycle and re-sync the tenant runtime mirror. Every one of those flows calls `syncTenantRuntime()`, whose first write is to `clients/{slug}/status/state` — but `firestore.rules` (~lines 257–260) gates that exact path on `request.auth.token.superadmin == true` only, not on any of the scoped permission claims.
- **Why static analysis can't settle this:** this is a claims/rules interaction that depends on how custom claims are actually issued to real accounts (`set-superadmin-claim.js`) — reading the code shows a *plausible* conflict, not a proven one, since it's possible in practice that every account granted those scoped perms is *also* given the raw `superadmin` claim, which would make this a non-issue in practice even though the code paths look inconsistent.
- **Classification:** `UNKNOWN — RUNTIME VERIFICATION REQUIRED`. **Confidence:** `MEDIUM` that this is a real bug, based on reading the rule and the call site directly.
- **Verification method:** sign in as a test account holding only `manage_entitlements` (no `superadmin` claim) in a staging project and attempt to grant/pause an entitlement; check whether the mirror write throws `permission-denied`.

### 10. `billing.html` — no in-app entry point found

- **What's uncertain:** the file is real, tested (`tests/billing-portal.test.js`), and PIN-gated, but a repo-wide search found no `<a href="billing.html">` or equivalent link from any other page. It's reachable only by a direct URL.
- **Classification:** `UNKNOWN`. **Confidence:** `LOW` on whether this is intentional (e.g., the link is sent out-of-band by the platform operator) or a genuinely missing "Billing" link that should exist somewhere in `index.html`'s tenant Admin console.
- **Verification method:** ask whoever operates the platform whether tenants are ever given this link manually, or check Hosting access logs for `billing.html` traffic.

### 11. `ARCHITECTURE_DIAGRAM.html` — standalone, unreferenced

- **What's uncertain:** it's a real, git-tracked, styled documentation page (37KB) with zero references to or from any other file in the repo. Not dead code in the harmful sense (nothing was ever meant to call it), but its up-to-dateness relative to the app's current state is unknown, and it may now be superseded by this document.
- **Classification:** `UNKNOWN` (documentation freshness, not a code-legacy question). **Confidence:** `LOW`.
- **Verification method:** a human diff of its content against `CURRENT_ARCHITECTURE.md`; if superseded, either delete it or keep it as a dated historical snapshot (rename to make that explicit).

### 12. Duplicate `platformAuditLog` write on the tenant quick-suspend toggle

- **Location:** `superadmin.html`, quick-toggle button handler ~lines 2941–2952, which calls `logAudit('suspend'/'activate', ...)` itself **in addition to** the `logAudit('lifecycle-change', ...)` that `setTenantLifecycle()` (~line 753) already performs internally. The separate lifecycle-dropdown path (~lines 2953–2960) does not have this double-write.
- **Classification:** likely a small bug (duplicate audit-log entry per click), not a legacy artifact. **Confidence:** `MEDIUM`. Listed here for completeness since it surfaced during the same pass.
- **Recommended next action:** a human decision on whether to remove the redundant `logAudit` call in the quick-toggle handler — small, isolated, easily verified by clicking the toggle once and checking for one vs. two audit-log entries.

---

## Dependency / Blast-Radius Table

| Candidate | Direct Consumers | Indirect Consumers | Data Dependencies | External Dependencies | Blast Radius | Removal Risk |
|---|---|---|---|---|---|---|
| §1 Legacy Firestore rules block | None found in repo | Unknown — any external client that predates multi-tenant migration | Root-level `bookings`/`openPlay`/etc. docs, if any still exist | Unknown (could be an old mobile client, a partner script, or nothing) | If truly unreferenced: near-zero. If something external still calls it: that caller breaks entirely, silently (no fallback) | **Low** to remove the *rule*, but verify via Firestore access logs first — the rule is the only thing currently protecting/permitting those paths |
| §2 `scheduleMatch` (legacy scheduling) | `tournament-admin.html` (3 call sites) | Any tournament with zero venues configured | `clients/{slug}/bookings/state`, `matches.{court,scheduledDate,scheduledHour}` | None | Removing it breaks scheduling for every venue-less tournament until venues become mandatory | **High** — do not remove without a product decision + migration of existing tournaments |
| §3 Three billing-formula paths | `superadmin.html` only | Every tenant's `platformTenants/{slug}.billing`/`.subscription` | `platformPlans` (plan catalog) | None | Consolidating (not removing) is safe if done as "add one canonical function, redirect the three buttons to it" | **Medium** — a refactor, not a deletion; test each of the three call sites still works post-consolidation |
| §4 `data-apply-charge` (invoice-less credit adjustment) | `superadmin.html` only | Any tenant's `creditBalance` | `platformTenants/{slug}.creditBalance`, `_lastReportingRows` (in-memory) | None | Changing its behavior (e.g. forcing it to create an invoice) changes what operators see in the Invoices tab going forward | **Medium** — a behavior change, needs sign-off before altering |
| §6 `.status` vs `.lifecycle` | `picker.html`, reporting code, `syncTenantRuntime()` | Every tenant-facing page that ultimately reads `clients/{slug}/status/state` | `platformTenants/{slug}`, `tenantDirectory/{slug}`, `clients/{slug}/status/state` | None | Retiring `.status` without first migrating readers would silently break tenant online/offline detection everywhere | **High** — do not touch without first confirming (and migrating) every reader of `.status` |
| §9 permission/rules mismatch | Any non-owner staff account with scoped perms | Whoever operates staff accounts today | `clients/{slug}/status/state` rule | None | If real: every scoped-permission staff account is silently broken for this one action | **N/A (bug, not a removal candidate)** — fix, don't remove |

---

## Runtime Verification Plan

| Item | Static Evidence | Runtime Verification | Expected Result | Decision |
|---|---|---|---|---|
| §1 Legacy rules block | Zero code references anywhere in repo; self-labeled deprecated | Check Firestore/Hosting access logs (or add temporary logging) for reads/writes to the bare `bookings`/`openPlay`/etc. paths over a real time window | Zero hits | If zero: safe to remove the rules block. If any hits: identify the caller before touching anything |
| §9 Permission/rules mismatch | Code paths look inconsistent by inspection | In a staging project, create a test account with only `manage_entitlements` (no `superadmin` claim); attempt an entitlement change | Either succeeds (claims are always paired in practice) or throws `permission-denied` | If it throws: file as a real bug and fix the rule to also accept the scoped claim |
| §10 `billing.html` reachability | No in-app link found | Check Hosting access logs for `billing.html` traffic; ask the platform operator how tenants are given the link | Either regular traffic (intentional out-of-band link) or none (dead entry point) | If none: decide whether to add an in-app link or leave as an operator-distributed link by design |
| §11 `ARCHITECTURE_DIAGRAM.html` freshness | No references; content not diffed against current app | Human read-through comparing it to `CURRENT_ARCHITECTURE.md` | Either still accurate, partially stale, or fully superseded | Human call — not a code-safety question |
| §2 Legacy tournament scheduling | Both paths have confirmed live callers | Query how many existing tournaments have zero venues configured (would still depend on `scheduleMatch`) | A count — 0 means safe to plan retirement; >0 means those tournaments need migration first | Product decision once the count is known |

---

## Recommended Cleanup Sequence

Ordered smallest/safest first, per the brief's prioritization (orphaned → duplicates → deprecated-but-referenced → runtime-verified legacy → high-risk last). Each step is independent and reversible.

| Order | Cleanup | Reason | Evidence | Dependencies | Risk | Verification | Rollback |
|---|---|---|---|---|---|---|---|
| 1 | Remove the duplicate `logAudit('suspend'/'activate', ...)` call in the tenant quick-suspend-toggle handler (superadmin.html ~2948) | Redundant audit-log entry per click, likely accidental | Direct read; asymmetric vs. the dropdown path | None | Very low | Click the toggle once; confirm exactly one new `platformAuditLog` entry | Single-line revert |
| 2 | ✅ DONE (repo edit only, not yet deployed) — deleted the legacy `firestore.rules` root-level block (§1) | Self-labeled deprecated, zero code callers found, currently an open write surface | `firestore.rules` comment + repo-wide grep (re-confirmed zero hits immediately before removal) | None found | Low | Test suite re-run clean. **Skipped:** live Firestore/Hosting log check for external traffic — proceeded on static evidence alone per explicit instruction. Manually smoke-test booking/queue/staff-reserve flows once deployed | `git revert` the rules change; redeploy rules |
| 3 | Add an in-app link to `billing.html` from the tenant Admin console (or explicitly document it as operator-distributed only) | Currently unreachable except by direct URL — likely a UX gap, not a code risk | No in-app reference found anywhere | None | Very low (additive) | Click through from Admin console to Billing and back | Remove the link |
| 4 | ✅ DONE — moved `<!-- Settings -->` (store.html) and `<!-- Tournament Financials -->` (tournament-admin.html) to sit above their actual sections instead of a neighboring one | Pure documentation drift, zero functional impact | Direct read, comment position vs. actual section | None | None | Full test suite re-run clean (no test asserted on comment position; this was a pure readability fix) | `git revert` the commit |
| 5 | Decide and act on the `.status` vs `.lifecycle` migration (§6) — migrate `picker.html`/reporting to read `.lifecycle`, then retire `.status` | Real technical debt, explicitly self-documented, but high blast radius | `syncTenantRuntime()` comment + `GAP_ANALYSIS.md` | Every reader of `.status` must be migrated first | High until migrated, then low | Full regression pass on picker.html's tenant listing and all reporting views | Keep `syncTenantRuntime()` mirroring both fields until migration is fully verified |
| 6 | Consolidate the three billing-formula-setting paths and the three credit-adjustment paths in `superadmin.html` into single canonical functions (mirroring `setEntitlement()`'s pattern) | Real duplicate-logic risk for billing data integrity, one path bypasses invoices entirely | Superadmin research pass (§3, §4) | Every existing button/flow must be redirected without behavior change | Medium | Manual test of all affected buttons pre/post refactor | Revert the refactor commit |
| 7 | Decide whether venues become mandatory for all tournaments, enabling retirement of the legacy `scheduleMatch` path | Two coexisting scheduling systems is real complexity, but actively used for venue-less tournaments today | Tournament-admin research pass (§2) | Requires a migration for any existing venue-less tournament | High | Count of currently venue-less tournaments; migrate each before removing the fallback | Do not remove `scheduleMatch` until that count is zero |
| 8 | Investigate and resolve the scoped-permission vs. Firestore-rules mismatch (§9) | Possible functional bug blocking real staff accounts from documented actions | Direct code/rules comparison | Depends on how staff accounts are actually provisioned today | Low to test, unknown severity until tested | Staging-account test as described above | N/A — this is a fix, not a removal |
