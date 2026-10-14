# Pickleball Court Booking

A multi-tenant pickleball/court-booking platform: a single Firebase project serves booking, walk-in queues, Find a Game matchmaking, a Store (POS) add-on, and a Tournaments add-on to every facility ("tenant") that signs up, plus a platform-operator console for provisioning, billing, and support. Live at **[courts.dulahq.app](https://courts.dulahq.app)**.

No bundler, no framework — plain static HTML files with inline `<script>` tags, Tailwind CSS (compiled, not CDN-loaded at runtime), and the Firebase compat SDKs. Each tenant's data lives under its own Firestore path (`clients/{slug}/...`); the same static files serve every tenant, selected via `?client=slug`.

For how any of this actually works end-to-end — screens, data flow, journeys, known inconsistencies — **start with [`ARCHITECTURE.md`](ARCHITECTURE.md)**, not this file. This README is setup/workflow only.

---

## Stack

| Layer | What it is |
|---|---|
| Hosting | Firebase Hosting, serving static files straight from the repo root |
| Data | Firestore (tenant data path-isolated under `clients/{slug}/`, platform data under `platformTenants`/`platformInvoices`/etc.) |
| Auth | Firebase Auth (Google + email/password) for the optional player account system and the superadmin console; tenant staff use a shared 4-digit PIN instead, no per-person login |
| Storage | Firebase Storage (payment proofs, branding assets, tournament gallery photos) |
| Server logic | Cloud Functions v2 (`functions/`, region `asia-southeast1`) — only for the handful of operations that must not trust the client: tournament bracket/score/schedule mutations, push-alert subscriptions, billing-portal reads, platform billing recalculation |
| Styling | Tailwind CSS, compiled locally (`npm run build`), not the CDN build |

## Repo structure

```
index.html              Tenant app: booking, Find a Game, queue, stats, tenant Admin console
picker.html              Facility directory (first-time landing page)
account.html             Signed-in "My Account" (cross-facility matches/profile/notifications)
queue.html                Standalone walk-in-queue tool (no facility/booking needed)
onboarding.html           Self-service facility setup (in progress — see FACILITY_ONBOARDING_PROPOSAL.md)
store.html                 Store add-on (POS/inventory), own PIN
tournament.html / tournament-admin.html   Tournaments add-on (public page / organizer console)
gallery.html                Anonymous, token-gated tournament photo upload
billing.html                 Tenant billing portal (PIN-gated)
superadmin.html                Platform operator console

functions/                 Cloud Functions (tournament engine, billing, notifications)
tests/                       Plain Node test files, one per feature area — node tests/<name>.test.js
*.js (root)                   Shared client-side modules, each also require()-able from tests
firestore.rules, storage.rules, firestore.indexes.json
setup-*.js, seed-*.js           One-off provisioning/migration/seeding scripts (run with node)
```

## Local development

```bash
npm install
npm run build        # compiles tailwind.css from tailwind-input.css
npx serve .           # serve the repo root as static files, then open the printed localhost URL
```

Any page takes `?client=<tenantId>` to pick a tenant (e.g. `index.html?client=demo`). With no tenant remembered, `/` routes to `picker.html`.

## Tests

```bash
node tests/<file>.test.js      # run one
for f in tests/*.test.js; do node "$f"; done   # run all (29 files)
```

Plain Node scripts — no test runner/framework. Each asserts with a small local `check()`/`section()` helper and exits non-zero on failure. Most exercise pure logic directly (`require()`-ing the shared modules); some are in-memory Firestore integration tests; some are regex-based wiring checks against the HTML source.

## Deploying

```bash
firebase deploy --only hosting              # static files (*.md and tests/ are excluded — see firebase.json)
firebase deploy --only firestore:rules      # after any firestore.rules change
firebase deploy --only functions            # after any functions/ change
```

Hosting, rules, and functions deploy independently — check `firebase.json`'s `ignore` list for exactly what hosting does and doesn't serve.

## Admin / staff access

Each tenant has one shared 4-digit Admin PIN (Admin → Security to change it), gating the tenant Admin console and Tournament Admin. Store has its own, separate PIN. There is no per-staff login or role system by design — see [`ADMIN_GUIDE.md`](ADMIN_GUIDE.md) §13 and [`ARCHITECTURE.md`](ARCHITECTURE.md) §6 for the trust model this implies.

## Documentation index

| Doc | For |
|---|---|
| [`ARCHITECTURE.md`](ARCHITECTURE.md) | Evidence-based baseline of how the app actually works — start here |
| [`LEGACY_CANDIDATES.md`](LEGACY_CANDIDATES.md) | Tracked technical-debt/cleanup backlog, classified by confidence |
| [`CLIENTS.md`](CLIENTS.md) | Real tenant registry, plan pricing, licensing/data-ownership terms |
| [`MULTI_TENANCY_SETUP.md`](MULTI_TENANCY_SETUP.md) | How tenant isolation works; how to provision a new tenant by hand |
| [`SAMPLE_TENANTS_SETUP.md`](SAMPLE_TENANTS_SETUP.md) | Seeding demo tenants for local/dev testing |
| [`ADMIN_GUIDE.md`](ADMIN_GUIDE.md) | Tenant staff / Admin console guide |
| [`SUPERADMIN_GUIDE.md`](SUPERADMIN_GUIDE.md) | Platform operator console guide |
| [`BILLING_PORTAL.md`](BILLING_PORTAL.md) | Tenant-facing guide to `billing.html` |
| [`QUEUE_MODULE.md`](QUEUE_MODULE.md) | Walk-in queue engine design (rotation rules, winner ranking, admin overrides) |
| [`USER_ONE_PAGER.md`](USER_ONE_PAGER.md) | Quick guide for players |
| [`FACILITY_ONBOARDING_PROPOSAL.md`](FACILITY_ONBOARDING_PROPOSAL.md) | Design for self-service facility signup — partially built, see `onboarding.html` |

## Licensing

Not open source. Software ownership stays with the developer; facilities ("clients") receive a non-exclusive license to use their tenant. See [`CLIENTS.md`](CLIENTS.md) for the real client registry, plan terms, and data-ownership policy.
