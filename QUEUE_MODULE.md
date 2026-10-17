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
| `activeMatch` | The match on court now: `teamA`, `teamB`, team ids for fixed pairs, and `firstServer` (which side serves first — admin-settable, see below) |
| `matches` | Finished matches, used for match numbers and stats |
| `lastPartnerGroup` | Partner rotation only: the four names from the rotation that just finished, avoided by the next pick (see below) |
| `playCounts` | Every rule except Fixed Pairs: how many games each player has been picked for, used for rest priority |
| `gameFormat` | Points target, win-by, and scoring for the live scoreboard |
| `winnerConfig` | `{ minGames, rankingOrder }`, set once at queue creation — overrides the automatic qualifying bar and/or the default winner-ranking order (see "Declaring the overall winner" below). Optional; a missing or invalid value falls back to the defaults. |
| `expiresAt` | Facility module only: expired sessions are removed on load |

The facility module stores sessions in `localStorage` under `LS.queues` (`loadQueues` / `saveQueues`), with a cloud copy via `fbSave('queues', ...)`. Sessions created from a Find a Game are linked to the game with the id `q_og_<gameId>` (`ogLinkedQueueId`); their rule is always `winner_stays`. The standalone page stores its one session in `sessionStorage` under `cb_standalone_queue_v1` — never `localStorage`, and never sent anywhere.

The standalone page also supports an opt-in **dark mode** (topbar moon/sun button, shared `theme.css` / `theme.js`). The theme preference (`localStorage.cb_theme_v1`) is the one thing the page persists beyond the tab besides the live-scoreboard resume key; the queue itself is still `sessionStorage`-only, and the page still loads no Firebase, client config, or PIN. Light is the default; dark uses the fixed Stitch "Court Kinetic" dark palette (see `theme.css`); the winner-PDF print window stays light. The live scoreboard is always dark with a fixed Stitch lime accent.

## Rotation rules

| Rule | Mode | How the next match forms |
|---|---|---|
| Winner Stays | both | The winners stay on court as team A. The losers go to the back of the line. The next challenger(s) are pulled by rest priority (see below) to play team B. |
| Four Off, Four On | both | Both teams rotate off after the match. The next match is filled by rest priority. |
| Fixed Rotation | both | Players come off and are put back at the back as individuals, breaking pairs. The next match is filled by rest priority. |
| Timed Rotation | both | Like the others, with a timer that resets each time a score is submitted. |
| Partner Rotation | doubles only | See below. |
| Fixed Pairs League | doubles only | Teams stay together for the whole session and record league results (`applyMatchResult`, `computeStandings`). Teams are pulled strictly FIFO — rest priority does not apply, since the team, not the player, is the rotation unit. |

## Admin override: editing the active match

Whoever has the queue's PIN can always change who's on court and who serves first, in both pages — the rotation rule decides who plays *next*, but never locks in who's playing *now*:

- **Change who serves first.** A "serves first" toggle on the active match calls `setFirstServer(session, side)`; it's forwarded straight into the live scoreboard (`CourtBoard.open({ firstServer, ... })`) so the serve indicator starts on the chosen side.
- **Swap an individual player.** Each on-court name is an editable select (`swapActivePlayer(session, team, index, newName)`), offering every name currently in the waiting line or elsewhere in the active match. Picking someone else either swaps the two players' positions (if both are already on court) or pulls the new name in from waiting and returns whoever they replaced to the back of the line.
- **Swap a whole team (Fixed Pairs only).** Since Fixed Pairs' rotation unit is the team, not the player, its active-match selects swap the entire team (`swapActiveTeam(session, side, newTeamGroupId)`) instead of one player at a time.
- **The "just played" rule warns, never blocks.** `justPlayed(session, name)` flags anyone who was in the match that just finished. Picking them anyway still works — the UI shows a toast ("consecutive warning"), but staff can always override it. This is deliberate: the rotation rule's job is to suggest a fair next match, not to override a human's judgment about who's actually ready to play.
- **The same two controls, inside the live scoreboard, while the game is still at 0-0-2.** `CourtBoard.open` accepts `roster` (the real on-court names, not just the joined display string), `waitingNames`/`waitingTeams`, and `onSetFirstServer`/`onSwapPlayer`/`onSwapTeam` callbacks. Both pages' callbacks are the exact same `applyQueueFirstServer`/`applyQueueSwap`/`applyQueueTeamSwap` (`applyServeFirst`/`applySwapPlayer`/`applySwapTeam` in the standalone page) functions their own dashboard selects already call, so a swap made from inside the scoreboard lands in the session identically. `court-scoreboard.js` only shows these controls while `PickleScore.atGameStart(state)` is true — score 0-0, serve still on whoever opened the game, and (doubles side-out) still server 2 — the conventional "0-0-2" call before the first rally of *that* game, re-checked at the start of every game in the match, not just game 1. The first rally, even a scoreless fault that only flips the server, hides both controls for the rest of that game. On a successful change, the board updates its own displayed names/serve indicator in place (`PickleScore.setFirstServer`/`renameSide`) — no close/reopen.

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

Every round stands alone: each time a match is needed, `checkAndFillActiveMatch` pulls a fresh 4 and pairs them up from scratch. Nobody is ever held together for a fixed block of rounds, so a queue larger than four never leaves other waiting players sitting out while the same four play repeatedly (that *was* the old design's failure mode -- see below).

**Picking the 4, same as every other rule.** `pullRestedPlayersAvoiding(session, 4, session.lastPartnerGroup)` -- the 4 least-played eligible players, treating anyone in `lastPartnerGroup` (whoever was in the match that just finished) as if they'd played far more games than anyone else *for that one pick only*, so they sort to the back and are only picked if there aren't enough other players to fill the court:

- **Exactly 4 in the whole queue:** nobody else exists, so the same four repeat every round. The only case where that happens.
- **8 or more in the whole queue:** a fully fresh four is always available, so nobody ever plays two rounds in a row.
- **5 to 7 in the whole queue:** there physically aren't enough rested players for an entirely fresh four -- e.g. at 5 players only 1 can ever be on the bench, so 3 of the next match's 4 are forced repeats no matter how smart the picker is. The engine still picks the *fewest possible* forced repeats (`8 - playerCount`, floored at 0); this is a hard lower bound, not a shortcoming of the algorithm.

`playCounts` are unaffected by this bias -- only the ordering of this one pick is biased; the real counts used for every other rule's rest priority, and for stats, are untouched.

**Pairing the 4 minimizes repeated teammates.** Given the 4 selected players, there are exactly 3 ways to split them into two teams. `bestPartnerPairing` scores each option by `partnerCount` -- how many times each pairing's two teammates have played *together* before (derived from `session.matches`, same "no separate counter to keep in sync" style as `computeHeadToHead`; this is teammate history, not opponent history) -- and picks whichever pairing(s) scored lowest. When multiple pairings are equally fresh (common early in a session, when everything is still 0), the tie is broken **randomly** among just those equally-good options -- selection and pairing are never random, only which of several *equally* good pairings gets used this round. That keeps the rotation from settling into one guessable, fixed sequence without making it feel arbitrary.

When a match ends, all 4 players go back to the end of the line as individuals (same as Four Off Four On), and `session.lastPartnerGroup` is set to their four names so the very next pick avoids repeating them.

**Previously**, groups of 8 or fewer held the same 4 players together for a fixed 3-round block (round-robin through all 3 possible pairings) before releasing them -- `PARTNER_ROTATION_HOLD_LIMIT`/`session.partnerRotationState`, now removed. That meant anyone else waiting (queues of 5-8) sat out for all 3 rounds while the held four played three games straight -- fine for participation *within* the held group, badly uneven for anyone outside it. The current design re-draws the least-played players every single round instead, so participation stays even regardless of queue size, and still rotates partners via `bestPartnerPairing` rather than a fixed round order.

## Key functions (queue-engine.js)

| Function | Role |
|---|---|
| `checkAndFillActiveMatch(session)` | Starts the next match when there are enough waiting players. Runs the rule-specific pick. |
| `recordMatchResult(session, scoreA, scoreB)` | Validates the scores, records the match, rotates the queue per the rule, and fills the next match. Returns `{ error }` or `{ winner, winnerNames, loserNames, notices, timerReset }`. Both pages' submit-score handlers are thin wrappers around this. |
| `pullRestedPlayers` / `pullRestedPlayersAvoiding` | The rest-priority and anti-repeat pulls described above |
| `bestPartnerPairing(session, players)` / `partnerCount(session, a, b)` | Partner Rotation's pairing step: of the 3 ways to split 4 players into two teams, picks whichever minimizes repeated teammates (derived from `session.matches`), with a random tie-break among equally-fresh options |
| `removeWaitingPlayer(session, groupId, name)` | Removes one player from the waiting line by (group id, name) -- never the whole group. If `name` was paired with someone (joined together, or a Fixed Pairs team), the other player stays waiting on their own under the same group id; removing the last name in a group drops the now-empty entry. Both pages' waiting-list "remove" buttons are per-player, not per-row, and go through this. |
| `setFirstServer(session, side)` / `justPlayed(session, name)` | Admin override: who serves first, and the "just played" warning flag -- see Admin override above |
| `swapActivePlayer(session, team, index, newName)` / `swapActiveTeam(session, side, newTeamGroupId)` | Admin override: changing who's on court, per player or (Fixed Pairs) per team -- see Admin override above |
| `ensureTeam`, `applyMatchResult`, `computeStandings` | Fixed Pairs teams and league results |
| `computePlayerStats`, `computeTeamStats`, `computeHeadToHead` | Match stats, computed on the fly from `session.matches` |
| `computeOverallWinner(session)` / `buildStatsReport(session)` | Declaring the overall winner and the full final-stats snapshot used for the PDF download -- see "Declaring the overall winner" below |
| `normalizeRankingOrder(order)` | Validates a `session.winnerConfig.rankingOrder`, falling back to `DEFAULT_RANKING_ORDER` if it isn't a genuine permutation of the 5 criteria |
| `normalizeName`, `nameSimilarity`, `getAllPlayerNamesInSession`, `findSimilarNames`, `promptNameConflict` | Catches a duplicate or misspelled name when someone joins |

`index.html` destructures these from `window.QueueEngine` instead of defining its own copies. `queue.html` calls `QueueEngine.*` directly.

## Match stats

Both pages show the same four views, with identical columns — Matches, Wins, Losses, Points For, Points Against, Point Differential, Win% — computed by the same engine functions, so neither page is more "comprehensive" than the other:

- **Players** (`computePlayerStats`): one row per player.
- **Teams / Pairings** (`computeTeamStats`): one row per exact pairing (sorted names as the key), so a pair that's played together more than once accumulates in one row regardless of which rule or which match produced the pairing.
- **Standings** (`computeStandings`): Fixed Pairs League only, since that's the one rule with a persistent team unit and a real head-to-head tiebreak built into the ranking itself (see `applyMatchResult`).
- **Head-to-head** (`computeHeadToHead`): win over the other, for every pair of players who have ever been on *opposing* teams — teammates are never counted against each other. This is **rule-agnostic**: it only reads `session.matches` (`teamA`, `teamB`, `winner`), never which rule produced them, so it works identically for Partner Rotation (where opponents change every round — two players who were partners in one round and opponents in the next are scored only for the rounds they actually opposed each other) as it does for Fixed Pairs. Returns the pairs sorted by how many times they've met, most first.
- **Match history**: every finished match, newest first, with its point differential.

## Declaring the overall winner when a session ends

`computeOverallWinner(session)` declares a single winner using all of the above, shown in both pages when the session's data is about to disappear -- the facility module's Reset Queue and Delete Session, and the standalone tool's End Queue. Returns `null` when no matches have been played yet (nothing is shown).

- **Fixed Pairs**: the top team from `computeStandings`.
- **Every other rule**: the top player, ranked the same way (see below), with `computeHeadToHead` supplying the head-to-head step.

**Ranking, both for `computeStandings` and `computeOverallWinner`:**

1. **Qualifying games played** -- a gate, not a tiebreak, checked before anything else. By default this is `MIN_GAMES_SHARE` (40%) of the session's most active player/team's game count, so someone who joined late and played one lucky game can't outrank a player who's gone 8-2 all night. A session can override the bar with an explicit absolute count instead, via `session.winnerConfig.minGames`. Below the bar, a player/team still gets ranked (by the same criteria, among the others below it), so the result is always decided -- they just can't outrank anyone who cleared it.
2. **The configurable order** -- by default `win% → head-to-head → point differential → total wins → games played`, but any permutation of those same 5 criteria can be set via `session.winnerConfig.rankingOrder` (validated by `normalizeRankingOrder`; an invalid or missing order falls back to the default silently).
3. **Name** -- always the final, deterministic tiebreak, never part of the configurable order.

Both the ranking order and the qualifying-games bar are set once, at queue creation, in the same setup form as mode/rule (a reorderable priority list + an optional "min. games to qualify" number input). `decidedBy` reports whichever criterion actually separated the winner from the runner-up, so the UI can say e.g. "Decided by head-to-head" -- or, honestly, "everything else was tied" when it comes down to name order.

### Downloading the final stats

Both pages' winner screen offers a **"Download stats (PDF)"** link. `buildStatsReport(session)` captures a full, serializable snapshot (standings if Fixed Pairs, the player leaderboard, pairings, head-to-head, and full match history) -- captured in the same click handler that computes the winner, *before* the session's data is wiped, since both pages clear their stored session the instant a queue ends. The page then opens that snapshot as a print-friendly page in a new tab and calls `window.print()` -- the same "download as PDF" pattern already used by `superadmin.html`'s Print button (the browser's own print dialog, "Save as PDF"), no PDF library involved.

## Live score and resume-on-refresh

The Live score button opens `CourtBoard` ([court-scoreboard.js](court-scoreboard.js)) with the match teams and the session's `gameFormat`; scoring and callouts are in [pickleball-scoring.js](pickleball-scoring.js). `CourtBoard` always persists mid-game progress to `localStorage` under its own `storageKey`, so a refresh while the scoreboard is open resumes where it left off, in both pages:

- Facility module: `lsKey('cb_board_' + session.id + '_' + m.id)`.
- Standalone page: `cb_standalone_board_<matchId>`. Since the rest of the page is `sessionStorage`-only, the page actively cleans up this one `localStorage` key: on every render it removes any board key that isn't the current match's, and "End this queue" removes it outright. A key can only ever be read back by reopening the live scoreboard for the same still-open match in the same tab — once the queue session itself is gone, the key is orphaned and is swept on the next render.

When the scoreboard finishes a match, `onFinish` fills the two score fields and clicks Submit, which runs through `recordMatchResult` like a manually entered score.

### Voice callouts: set point and match point

`announcement(prev, next)` in [pickleball-scoring.js](pickleball-scoring.js) is the single source of what `court-scoreboard.js` speaks after every rally. Three cases, checked in order against the state *after* the rally:

1. **The rally just won the game** (`next.gameOver` flips true): `"Game! Winner, <name>. <score>"` — one unified phrasing whether or not the win also ends the match. There is no separate wording for the match-deciding game.
2. **Otherwise, either side is now one point from winning the current game** — found by asking `gameIsWon` hypothetically (`mine + 1`), never by comparing to `target - 1`, since win-by-2 and deuce scores make that comparison unsafe. If winning that next point would also win the match (that side is already one game-win short of `gamesToWin`), it's `"Match point, <name>"`; if the match would continue into another game, it's `"Set point, <name>"`. This replaces the normal score callout for that point outright. For a one-game match every game is match-deciding, so it is always "Match point", never "Set point". The check re-runs after every rally, so a side stuck at set/match point across repeated side-outs (common in doubles) hears it again each time, not just once.
3. **Otherwise**, the normal callout: the side-out notice (side-out scoring only) followed by the spoken score (`scoreCallSpoken`).

## Tests

- `tests/rotation-pick.test.js` — the partner-rotation pick, rest-priority counts, and a seven-player simulation.
- `tests/queue-engine.test.js` — every rule's fill and rotation logic, rest priority, the Partner Rotation anti-repeat/pairing rules, admin-override functions (`setFirstServer`, `justPlayed`, `swapActivePlayer`, `swapActiveTeam`), validation, Fixed Pairs standings, name matching, match stats, the configurable winner ranking order and qualifying-games bar, and `buildStatsReport`.
- `tests/queue-match-edit.test.js` — wiring check for the admin-override UI (editable on-court selects, the serves-first control, `CourtBoard.open`'s `firstServer`) in both pages, plus `court-scoreboard.js`'s pre-rally "0-0-2" gate (`PickleScore.atGameStart`/`setFirstServer`/`renameSide`), the `roster`/`waitingNames`/`waitingTeams`/`onSetFirstServer`/`onSwapPlayer`/`onSwapTeam` opts, and that both pages wire them to the same `applyQueue*`/`apply*` functions their dashboard controls already use.
- `tests/queue-winner-pdf.test.js` — wiring check for the ranking-order/min-games setup fields, `winnerConfig` being built into the new session, and the "Download stats (PDF)" button, in both pages.
- `tests/queue-standalone.test.js` — the standalone page: no PIN/Firestore/analytics, `sessionStorage`-only queue state, the `storageKey`/cleanup wiring for resume-on-refresh, and that both pages call the same `QueueEngine` functions.
- Facility-module wiring is checked by the Find a Game tests (`tests/og-queue-link.test.js`, `tests/og-reserve.test.js`).
