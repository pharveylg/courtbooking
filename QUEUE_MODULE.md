# Queue module

The queue module runs open play on a court: players wait in a line, the next group steps onto court, and the winners or rotation rules decide who plays next. It lives in `index.html`, with the partner-rotation pick rule in `rotation-pick.js`.

## Sessions

A queue is a session stored in `localStorage` under `LS.queues` (see `loadQueues` / `saveQueues`). Each session has:

| Field | Meaning |
|---|---|
| `id`, `name` | Identity and display name |
| `mode` | `singles` or `doubles` |
| `rule` | The rotation rule (see below) |
| `waiting` | Ordered list of groups `{ id, names: [...] }`. A pair that came together is one group. |
| `activeMatch` | The match on court now: `teamA`, `teamB`, and team ids for fixed pairs |
| `matches` | Finished matches, used for match numbers and stats |
| `partnerRotationState` | Partner rotation only: the four players and the current round (1 to 3) |
| `playCounts` | Partner rotation only: how many rotations each player has been picked for |
| `gameFormat` | Points target, win-by, and scoring for the live scoreboard |
| `expiresAt` | Expired sessions are removed on load |

Sessions created from a Find a Game are linked to the game with the id `q_og_<gameId>` (`ogLinkedQueueId`). Their rule is always `winner_stays`.

## Rotation rules

| Rule | Mode | How the next match forms |
|---|---|---|
| Winner Stays | both | The winners stay on court as team A. The losers go to the back of the line. The next group from the front plays team B. |
| Four Off, Four On | both | Listed in the rule menu. Its pick logic is not covered in this document. |
| Fixed Rotation | both | Players come off in first-in-first-out order and are put back at the back as individuals. Pairs are broken to rotate everyone equally. |
| Timed Rotation | both | Like the others, with a timer on the dashboard (`initDashboardTimer`). |
| Partner Rotation | doubles only | See below. |
| Fixed Pairs League | doubles only | Teams stay together for the whole session and record league results (`applyMatchResult`, `computeStandings`). |

### Partner Rotation

Four players play three rounds together, each round with a new partner:

- Round 1: P1 and P2 against P3 and P4.
- Round 2: P1 and P3 against P2 and P4.
- Round 3: P1 and P4 against P2 and P3.

When round 3 ends, all four go back to the end of the line as individuals.

**Choosing the four (uneven queues).** `RotationPick.pickPlayers` (`rotation-pick.js`) picks the next four:

1. If the waiting list holds exactly four players, they all play, in queue order.
2. If it holds more than four, the players who have been picked the fewest times (`playCounts`) go first. Ties go to whoever has waited longest.
3. Players who are left out keep their place at the front of the line, so they are picked next time.
4. A pair that came together stays together when it is picked. If only part of a group is picked, the rest keeps the group id.

The result is that game counts stay close together. Over time they can differ by one. The dashboard shows a note whenever the waiting count is not a multiple of four.

Each pick adds one to `playCounts` for every player picked (`RotationPick.countRotation`). The counts are per session and are not reset.

## Key functions

| Function | Role |
|---|---|
| `checkAndFillActiveMatch(session)` | Starts the next match when there are enough waiting players. Runs the rule-specific pick. |
| `ensureTeam`, `applyMatchResult`, `computeStandings` | Fixed pairs teams and league results |
| `renderActiveQueueDashboard()` | Draws the dashboard: rule, waiting list, rotation note, and live score button |
| `renderQueueModule()` | Draws the list of sessions |
| `ogEnsureLinkedQueue(game, booking)` | Creates or reuses the queue linked to a Find a Game |
| `loadQueues` / `saveQueues` | Local storage, with a cloud copy via `fbSave('queues', ...)` |

## Live score

The Live score button opens `CourtBoard` with the names of the match teams and the session's `gameFormat`. Scoring and the callouts are in [pickleball-scoring.js](pickleball-scoring.js) and [court-scoreboard.js](court-scoreboard.js). How the final result is stored back to the queue is not covered in this document.

## Tests

- `tests/rotation-pick.test.js` covers the partner rotation pick, the counts, and a seven-player simulation.
- Queue wiring is checked by the Find a Game tests (`tests/og-queue-link.test.js`, `tests/og-reserve.test.js`).
