# AI Handoff

**Purpose:** continuity when switching Claude accounts/sessions or hitting a usage limit mid-task. Read this FIRST when picking this project back up. Keep it updated — refresh it after every merge, every new background agent spawned, and especially right before a session is expected to end or hit a limit.

Last updated: 2026-11-06 — refreshed against git state (`main` at `cb01461`). Earlier entries in this file were stale; git log is the source of truth if they disagree.

## Shared across both accounts (personal + enterprise)

- **Two Claude accounts (personal and enterprise) maintain this same handoff.** Whichever account is active, read this file first and update it before a session ends, after every merge, after every background agent spawn, and before any expected usage-limit interruption. Keep the "Last updated" line current.
- Write it so the other account can act on it cold: state exact commit hashes, branch names, what is pushed vs local-only, and what is deployed vs merged.
- Do not record secrets, tokens, or account credentials here. Note which account touched an item only if it matters to the next step.
- Whether both accounts see this file depends on them sharing the same checkout. If they work on different machines, it must be committed and pushed to reach the other side — that is an open decision for the user (see PENDING).

## Current state of `main`

- Branch: `main`, commit `cb01461`. Local `main` is ahead of `origin/main` by 4 commits, **none pushed**: `11d1650` + `b9c4b9f` (tournament division color-coding), `773c056` (`.gitattributes`: LF normalisation), `cb01461` (Graphify docs + `graphify-out/` ignore). Push is pending the user's go-ahead.
- Working tree: only untracked files remain — this `AI_HANDOFF.md` and `CLAUDE.md.backup-20261104-153227` (a backup snapshot, not source; leave it out of commits). `.gitignore` and `CLAUDE.md` are committed.
- Line endings: `.gitattributes` (`* text=auto eol=lf`) is committed. The theme tests were failing on Windows because autocrlf wrote CRLF into the working copy; that is fixed.
- Deploy state (what is confirmed live):
  - **Hosting**: last confirmed deployed at `5bd1f7e` (queue grid, store/tournament desktop widening, superadmin UI, queue match color-coding). **Not yet confirmed deployed:** `0c3dc20`/`5999328` (superadmin owner email) and `11d1650`/`b9c4b9f` (tournament division color-coding). Check with the user before assuming either is live.
  - **functions**: deployed at `6695c08` — "Publish on their behalf" superadmin feature is live. No functions changes in the newer commits.
  - **firestore.rules**: deployed and production-verified at `0285be8`. Nothing newer pending for rules.
- Full test suite: **47/47 test files pass** on `cb01461` (run at `773c056`, after the line-ending fix). Re-run before any new commit or deploy.
- Locked worktree: `.claude/worktrees/agent-ac6f79dffb40f1606` (branch `worktree-agent-ac6f79dffb40f1606`) is **locked by a live agent process (pid 38316)**. Do not remove it while that process runs. Its branch is merged into `main` via `b9c4b9f`. Clean up only after confirming the lock is gone.
- Other worktrees to leave alone: `claude/vibrant-brattain-887064` (unrelated, out of scope) and a scratchpad `premerge-check` worktree (detached HEAD at `5999328`, can be removed once the user confirms it's not needed).

## Completed and merged (newest first)

- `cb01461` / `773c056`: Repo hygiene — `.gitattributes` (`* text=auto eol=lf`) fixes CRLF breaking the theme tests on Windows; CLAUDE.md Graphify section + `graphify-out/` ignore. Local only, not pushed.
- `b9c4b9f` (merge) / `11d1650`: **Tournament division color-coding** — match cards and leaderboard rows colour-coded by division. Local only (not pushed, not confirmed deployed).
- `5999328` (merge) / `0c3dc20`: **Superadmin self-serve owner email** — `superadmin.html` shows the owner signup email next to the tenant row. Merged; deploy status unconfirmed.
- `5bd1f7e` (merge) / `5635445`: **Queue match-number color coding** — court cards in `queue.html` coloured by match number. Hosting-deployed.
- `6695c08` (merge) / `6367a29`: Superadmin "stuck tenant" monitor + override-publish — "Needs Publish" filter, `publishFacility` staff branch (`manage_organizations`; owner path unchanged, audit-logged as `publish-facility-staff`), "Publish on their behalf" button. **Fully live** (hosting + functions).
- `e495e83` (merge) / `cb4cd0a`: Desktop-width layout fix — `store.html` POS grid, `tournament-admin.html` match list, `tournament.html` public schedule. Hosting-deployed.
- `aeb1412` (merge) / `a1210a6`: `queue.html` multi-court desktop grid. Hosting-deployed.
- `0285be8` (merge) / `e732f84`: `firestore.rules` owner-self-read fix for `platformTenants` — deployed, production-verified.
- `f351a8e` (merge) / `acc46d7`: `onboarding.html` publish-step UX fix + `picker.html` "finish setup" nudge banner.
- `278193d`: UI-reliability Phase 1+2 — offline/stale-data indicators, silent `onSnapshot` listener fixes + load timeout, PIN cooldown, friendly error messages.
- `31fe4ac` (merge) / `01eb5d6`: `tournament-display.html` — public venue TV dashboard. Hosting-deployed.

## PENDING / OPEN

0. **Shared-handoff decision (user to answer):** should `AI_HANDOFF.md` be committed to the repo so both accounts get it via push/pull? Current file is untracked and only reaches the other account if they share this checkout. Do not commit or push without an explicit yes.
1. **Push decision:** `11d1650`, `b9c4b9f`, `773c056`, `cb01461` are unpushed. Ask the user before pushing (push = commit+push only, per CLAUDE.md).
2. **Deploy decision:** confirm with the user whether the superadmin owner-email (`5999328`) and tournament color-coding (`b9c4b9f`) should be hosting-deployed. Hosting-only; no functions or rules involved. Deploy is a separate explicit step.
3. **Re-run the test suite** (`for f in tests/*.test.js; do node "$f"; done`) against current `main` before any commit or deploy.
4. **Locked worktree cleanup** (`agent-ac6f79dffb40f1606`): wait until pid 38316 exits, then `git worktree remove` + `git branch -d` (plain `-d`, never force).
5. **"Dinker Lane" tenant:** a second self-serve tenant not appearing on `picker.html`. Most likely never published, or a court was re-priced and `publishFacility` readiness re-validation is rejecting it. Now resolvable via the superadmin "Needs Publish" filter — follow up with the user, live Firestore lookup not yet done.
6. **"Forgot my slug" self-serve lookup flow** for onboarding owners: open question, never answered by the user. Not started; do not build without a confirmed go-ahead and a proposed design.
7. This `AI_HANDOFF.md` is untracked; the user asked for it to be kept current.

## Known decisions / context worth preserving

- **CLAUDE.md workflow rule** (read the repo's CLAUDE.md fresh — it has more detail): delegate non-trivial work to subagents; "push" means commit+push ONLY, "deploy" is a separate explicit step, never bundled unless both are asked for together; propose a design before building a new feature unless the request is already specific; run the full test suite before any commit.
- **Queue color-coding design (approved, shipped):** cycling palette (blue, coral/red, green, amber, purple, teal, then repeats), keyed to the court's current match number: `color = PALETTE[(matchNumber - 1) % 6]`. Tournament color-coding is keyed to **division** instead, because tournament views mix divisions.
- **`platformTenants` security history** — if touching `firestore.rules` for this collection again: a prior tenant-self-read branch was removed after being proven exploitable (it checked only slug format; slugs are public). See commits `d717fef` and `b8a6cad`. The current owner-self-read rule (`0285be8`) uses `request.auth.uid == resource.data.ownerUid`. Apply the same scrutiny to any further change.
- **Deploy scope reminders:** superadmin override feature needed a `functions` deploy (done). Layout fix, queue and tournament color-coding, and the owner-email change are hosting-only. Nothing pending needs a `firestore:rules` deploy.

## Housekeeping conventions

- Background builds run in isolated `git worktree`s (`worktree-agent-<id>` branches). After merging one into `main`: verify `git merge-base --is-ancestor <branch> main` is true, confirm the worktree is clean (`git -C <path> status --short` empty) and not locked, then `git worktree remove <path>` + `git branch -d <branch>`. Use plain `-d`, never `-D`/`--force`; if a step fails, leave it and report.
- Don't touch `claude/vibrant-brattain-887064` or its worktree.
- Merges use `--no-ff` (keep merge commits, no squash/rebase).
