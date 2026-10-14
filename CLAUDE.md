# CLAUDE.md

Guidance for Claude Code working in this repository.

## Start here

- [`ARCHITECTURE.md`](ARCHITECTURE.md) — evidence-based baseline of how the app actually works (screens, data flow, journeys, known inconsistencies). Read this before making changes, not just this file.
- [`LEGACY_CANDIDATES.md`](LEGACY_CANDIDATES.md) — tracked, still-open technical debt and gaps. Check it before "fixing" something that might already be a known, deliberate tradeoff.
- [`README.md`](README.md) has the full documentation index (`QUEUE_MODULE.md`, `ADMIN_GUIDE.md`, `SUPERADMIN_GUIDE.md`, `BILLING_PORTAL.md`, `CLIENTS.md`, `MULTI_TENANCY_SETUP.md`, `SAMPLE_TENANTS_SETUP.md`, `USER_ONE_PAGER.md`, `FACILITY_ONBOARDING_PROPOSAL.md`).

## Workflow rules

- **Never do real work all by yourself — use a subagent for every task that is not trivial.** Investigation, code changes, code review, and documentation all get delegated to a subagent (the Agent/Task tool); reserve doing something directly for genuinely trivial actions (a quick status check, reading one file to confirm a fact).
  - **One practical exception:** interactive visual widgets (diagrams, charts, mockups rendered through the visualization tool) only render inline for the person in the conversation that calls them — a subagent's tool calls report back as text only. Draw those directly instead of delegating.
- **"push" means commit + push only.** "Deploy" (`firebase deploy --only hosting`, `--only firestore:rules`, `--only functions`) is a separate, explicit step — never bundle the two unless both are explicitly asked for in the same request.
- **Propose a design before building a new feature.** Don't start writing code for a new feature straight from a one-line request — lay out the approach first, unless the request is already specific and detailed enough that a design step wouldn't add anything.
- **Run the full test suite before any commit:**
  ```bash
  for f in tests/*.test.js; do node "$f"; done
  ```
  All currently pass; a change that breaks one needs a fix, not a skip.
- `.md` files (and a few setup/seed scripts) are excluded from Firebase Hosting — see `firebase.json`'s `hosting.ignore` list. Documentation-only changes never need a deploy step.
