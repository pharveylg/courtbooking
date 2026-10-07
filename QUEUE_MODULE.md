# Queue module

Two pages run open play on a court: players wait in a line, the next group steps onto court, and the winners or rotation rules decide who plays next.

- **Facility queue module** — a tab inside `index.html`, tied to a tenant, saved to Firestore, PIN-gated.
- **Walk-in Queue** — [queue.html](queue.html), a standalone page linked from the homepage ([picker.html](picker.html)). No facility, no PIN, no sign-in, no Firestore, no analytics. State lives in `sessionStorage` only (cleared when the tab or browser closes) and supports exactly one queue at a time.

Both share the same rotation rules and pull every rule-specific calculation from one pure module, **[queue-engine.js](queue-engine.js)**, so there is one place to fix a rotation bug instead of two. The partner-rotation pick itself (rest priority, group handling) is in **[rotation-pick.js](rotation-pick.js)**, which `queue-engine.js` depends on.

## Sessions

A session has:

| Field | Meaning |
|---|---|
| `id`, `name` | Identity and display name (the facility module only — the standalone page has one unnamed session) |
| `mode` | `singles` or `doubles` |
| `rule` | The rotation rule (see below) |
| `waiting` | Ordered list of groups `{ id, names: [...] }`. A pair that came together is one group. |
| `activeMatch` | The match on court now: `teamA`, `teamB`, and team ids for fixed pairs |
| `matches` | Finished matches, used for match numbers and stats |
| `partnerRotationState` | Partner rotation only: the four players and the current round (1 to 3) |
| `lastPartnerGroup` | Partner rotation only: the four names from the rotation that just finished, avoided by the next pick (see below) |
| `playCounts` | Every rule except Fixed Pairs: how many games each player has been picked for, used for rest priority |
| `gameFormat` | Points target, win-by, and scoring for the live scoreboard |
| `expiresAt` | Facility module only: expired sessions are removed on load |

The facility module stores sessions in `localStorage` under `LS.queues` (`loadQueues` / `saveQueues`), with a cloud copy via `fbSave('queues', ...)`. Sessions created from a Find a Game are linked to the game with the id `q_og_<gameId>` (`ogLinkedQueueId`); their rule is always `winner_stays`. The standalone page stores its one session in `sessionStorage` under `cb_standalone_queue_v1` — never `localStorage`, and never sent anywhere.

## Rotation rules

| Rule | Mode | How the next match forms |
|---|---|---|
| Winner Stays | both | The winners stay on court as team A. The losers go to the back of the line. The next challenger(s) are pulled by rest priority (see below) to play team B. |
| Four Off, Four On | both | Both teams rotate off after the match. The next match is filled by rest priority. |
| Fixed Rotation | both | Players come off and are put back at the back as individuals, breaking pairs. The next match is filled by rest priority. |
| Timed Rotation | both | Like the others, with a timer that resets each time a score is submitted. |
| Partner Rotation | doubles only | See below. |
| Fixed Pairs League | doubles only | Teams stay together for the whole session and record league results (`applyMatchResult`, `computeStandings`). Teams are pulled strictly FIFO — rest priority does not apply, since the team, not the player, is the rotation unit. |

### Rest priority (every rule except Fixed Pairs)

Whenever a rule needs to pull players from the waiting line — to fill a match, or (Winner Stays) to find the next challenger — it goes through `pullRestedPlayers(session, count)`, which calls `RotationPick.pickPlayers`:

1. If the waiting list holds exactly the number needed, they all play, in queue order.
2. If it holds more, the players who have been picked the fewest times (`playCounts`) go first. Ties go to whoever has waited longest.
3. Players left out keep their place at the front of the line, so they are picked next time — this is what gives them rest time after playing several games in a row.
4. A pair that came together stays together when it is picked. If only part of a group is picked, the rest keeps the group id.
5. If the queue does not hold enough players yet, nothing is pulled and the waiting list is untouched.

**A recent joiner never cuts ahead of an original queue member who hasn't played yet.** This isn't a separate rule — it falls out of two things that are already true: a join always appends to the *back* of `session.waiting` (`session.waiting.push(...)` in both pages' join handlers), and rule 2's tie-break always favors whoever has waited longest. Since every original player starts at 0 games and is positioned before anyone who joins later, the original queue always exhausts its 0-games pool first. Once every original has played at least once, a recent joiner with fewer games than someone waiting for a *second* turn is picked ahead of them — that's ordinary rest priority working correctly, not the joiner cutting the line; nobody who hasn't had a first turn is ever skipped for one. Covered by `tests/queue-engine.test.js` ("a recent joiner never cuts ahead...").

The result is that game counts stay close together across the whole queue, even when the headcount is odd. Over time they can differ by one. The dashboard shows a note whenever the waiting count is not a multiple of the players needed for one match (2 for singles, 4 for doubles).

Each pick adds one to `playCounts` for every player picked (`RotationPick.countRotation`). The counts are per session and are not reset.

### Partner Rotation

**At 8 or fewer players in the whole queue**, four players play three rounds together, each round with a new partner:

- Round 1: P1 and P2 against P3 and P4.
- Round 2: P1 and P3 against P2 and P4.
- Round 3: P1 and P4 against P2 and P3.

When round 3 ends, all four go back to the end of the line as individuals, and `session.lastPartnerGroup` is set to their four names.

**Above 8, every round stands alone instead** — `PARTNER_ROTATION_HOLD_LIMIT` in `queue-engine.js`. Holding a foursome together for three rounds only makes sense when the queue can't comfortably supply a fresh four every round; above the limit it always can, so `session.partnerRotationState` is never set, each round rotates all four players off the instant it ends (exactly like Four Off Four On), and nobody plays two rounds back to back under any circumstance.

The threshold is re-checked at **every** round, not just when a group starts: if a group formed at 8 or fewer and the queue grows past the limit before round 3, the group stops being held together right then — it does not play out its remaining rounds first. (The reverse direction needs no special handling: once a round finishes above the limit, the next pick naturally re-evaluates the current total from scratch.)

**Choosing the next group avoids whoever just played.** The next group of 4 is pulled with `pullRestedPlayersAvoiding(session, 4, session.lastPartnerGroup)` instead of the plain `pullRestedPlayers`. It treats anyone in `lastPartnerGroup` as if they had played far more games than anyone else, for that one pick only — so they sort to the very back and are only picked if there are not enough other players to fill the court:

- **Exactly 4 in the whole queue:** nobody else exists, so the same four repeat. This is the only case where that happens.
- **More than 8 in the whole queue:** the next group of 4 is drawn entirely from players who were not in the group that just finished, even if one of them has a lower lifetime play count than someone who just played — the "just played" exclusion overrides plain rest priority for this one pick. Combined with the rule above, this is what guarantees nobody plays consecutive rounds once the queue is large enough.
- **5 to 8 in the whole queue:** every non-recently-played player available gets a rested spot; the remaining spot(s) are backfilled from the group that just played.

Verified with a 1,000-seed randomized simulation (`node -e` scratch script, not checked in) covering mid-session joins and removals at random points, including while a group is mid-rotation: zero instances of a player appearing in two consecutive matches whenever the true pool at decision time exceeded 8.

`playCounts` are unaffected by this bias — only the ordering of this one pick is biased; the real counts used for every other rule's rest priority, and for stats, are untouched.

## Key functions (queue-engine.js)

| Function | Role |
|---|---|
| `checkAndFillActiveMatch(session)` | Starts the next match when there are enough waiting players. Runs the rule-specific pick. |
| `recordMatchResult(session, scoreA, scoreB)` | Validates the scores, records the match, rotates the queue per the rule, and fills the next match. Returns `{ error }` or `{ winner, winnerNames, loserNames, notices, timerReset }`. Both pages' submit-score handlers are thin wrappers around this. |
| `pullRestedPlayers` / `pullRestedPlayersAvoiding` | The rest-priority and anti-repeat pulls described above |
| `ensureTeam`, `applyMatchResult`, `computeStandings` | Fixed Pairs teams and league results |
| `computePlayerStats`, `computeTeamStats`, `computeHeadToHead` | Match stats, computed on the fly from `session.matches` |
| `normalizeName`, `nameSimilarity`, `getAllPlayerNamesInSession`, `findSimilarNames`, `promptNameConflict` | Catches a duplicate or misspelled name when someone joins |

`index.html` destructures these from `window.QueueEngine` instead of defining its own copies. `queue.html` calls `QueueEngine.*` directly.

## Match stats

Both pages show the same four views, with identical columns — Matches, Wins, Losses, Points For, Points Against, Point Differential, Win% — computed by the same engine functions, so neither page is more "comprehensive" than the other:

- **Players** (`computePlayerStats`): one row per player.
- **Teams / Pairings** (`computeTeamStats`): one row per exact pairing (sorted names as the key), so a pair that's played together more than once accumulates in one row regardless of which rule or which match produced the pairing.
- **Standings** (`computeStandings`): Fixed Pairs League only, since that's the one rule with a persistent team unit and a real head-to-head tiebreak built into the ranking itself (see `applyMatchResult`).
- **Head-to-head** (`computeHeadToHead`): win over the other, for every pair of players who have ever been on *opposing* teams — teammates are never counted against each other. This is **rule-agnostic**: it only reads `session.matches` (`teamA`, `teamB`, `winner`), never which rule produced them, so it works identically for Partner Rotation (where opponents change every round — two players who were partners in one round and opponents in the next are scored only for the rounds they actually opposed each other) as it does for Fixed Pairs. Returns the pairs sorted by how many times they've met, most first.
- **Match history**: every finished match, newest first, with its point differential.

## Live score and resume-on-refresh

The Live score button opens `CourtBoard` ([court-scoreboard.js](court-scoreboard.js)) with the match teams and the session's `gameFormat`; scoring and callouts are in [pickleball-scoring.js](pickleball-scoring.js). `CourtBoard` always persists mid-game progress to `localStorage` under its own `storageKey`, so a refresh while the scoreboard is open resumes where it left off, in both pages:

- Facility module: `lsKey('cb_board_' + session.id + '_' + m.id)`.
- Standalone page: `cb_standalone_board_<matchId>`. Since the rest of the page is `sessionStorage`-only, the page actively cleans up this one `localStorage` key: on every render it removes any board key that isn't the current match's, and "End this queue" removes it outright. A key can only ever be read back by reopening the live scoreboard for the same still-open match in the same tab — once the queue session itself is gone, the key is orphaned and is swept on the next render.

When the scoreboard finishes a match, `onFinish` fills the two score fields and clicks Submit, which runs through `recordMatchResult` like a manually entered score.

## Tests

- `tests/rotation-pick.test.js` — the partner-rotation pick, rest-priority counts, and a seven-player simulation.
- `tests/queue-engine.test.js` — every rule's fill and rotation logic, rest priority, the Partner Rotation anti-repeat rule, validation, Fixed Pairs standings, name matching, and match stats.
- `tests/queue-standalone.test.js` — the standalone page: no PIN/Firestore/analytics, `sessionStorage`-only queue state, the `storageKey`/cleanup wiring for resume-on-refresh, and that both pages call the same `QueueEngine` functions.
- Facility-module wiring is checked by the Find a Game tests (`tests/og-queue-link.test.js`, `tests/og-reserve.test.js`).
