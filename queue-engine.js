/* Walk-in queue rotation engine -- pure functions, no DOM, no storage, no
   network. Mutates and returns the session object you pass in; how that
   session is stored (Firestore-backed, for a facility's queue module, or
   sessionStorage-only, for the standalone queue tool) is entirely up to
   the caller.

   A session looks like:
     { mode: 'singles'|'doubles', rule: <one of the six rules>,
       waiting: [{ id, names: [...] }], activeMatch: { teamA, teamB, ... } | null,
       matches: [...], playCounts: {}, teams: {}, lastPartnerGroup,
       winnerConfig: { minGames, rankingOrder } | undefined, ... }

   Six rotation rules: winner_stays, four_off_four_on (the default), fixed_rotation,
   timed_rotation, partner_rotation (doubles only), fixed_pairs (doubles only).
   Every rule except fixed_pairs pulls players from the waiting line by REST
   PRIORITY (RotationPick): whoever has played the fewest games goes first, so
   nobody is stuck sitting out indefinitely and nobody plays non-stop while
   others wait. fixed_pairs rotates whole teams, strictly FIFO, since the team
   -- not the player -- is its unit.

   Loaded by the browser as `QueueEngine` and by the tests via require(). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./rotation-pick.js'));
  else root.QueueEngine = factory(root.RotationPick);
}(typeof self !== 'undefined' ? self : this, function (RotationPick) {
  'use strict';

  function teamLabel(names) { return (names || []).join(' & '); }

  /* Overall-winner qualifying bar (computeStandings, computeOverallWinner): a
     player/team must have played at least this share of the session's most
     active player/team's game count to be eligible at all -- regardless of
     how good their record looks. Without it, someone who joined late and
     played one lucky game at 100% would outrank a player who's gone 8-2 all
     night. Below the bar, they still get ranked (by the same criteria,
     amongst themselves) so the result is always decided; they just can't
     outrank anyone who cleared it. This is the AUTOMATIC default; a session
     can override it with an explicit absolute count via
     session.winnerConfig.minGames (see qualifyingBar below). */
  const MIN_GAMES_SHARE = 0.4;

  /* Ranking criteria, in the order they're applied by default, both for
     computeStandings (Fixed Pairs) and computeOverallWinner (every other
     rule). A session can override the order via session.winnerConfig.
     rankingOrder -- any permutation of these same 5 keys -- to rearrange
     which tiebreak matters most. The qualifying-games gate always runs
     first (see qualifyingBar) and name is always the final, deterministic
     tiebreak; neither is part of the configurable order. */
  const DEFAULT_RANKING_ORDER = ['winPct', 'headToHead', 'pointDiff', 'wins', 'gamesPlayed'];
  const RANKING_CRITERIA_LABELS = {
    winPct: 'Win rate', headToHead: 'Head-to-head', pointDiff: 'Point differential',
    wins: 'Total wins', gamesPlayed: 'Games played',
  };

  /* Falls back to DEFAULT_RANKING_ORDER unless `order` is a genuine
     permutation of it (same 5 keys, no dupes, nothing missing) -- so a
     corrupted or hand-edited session can never produce an order that
     silently drops or duplicates a criterion. */
  function normalizeRankingOrder(order) {
    if (Array.isArray(order) && order.length === DEFAULT_RANKING_ORDER.length &&
        new Set(order).size === DEFAULT_RANKING_ORDER.length &&
        order.every((k) => DEFAULT_RANKING_ORDER.includes(k))) {
      return order.slice();
    }
    return DEFAULT_RANKING_ORDER.slice();
  }

  /* The qualifying bar itself: an explicit positive session.winnerConfig.
     minGames (an absolute games-played count) overrides the automatic
     MIN_GAMES_SHARE-of-the-leader default entirely. Either way, someone
     below the bar still gets ranked among themselves (see the comment on
     MIN_GAMES_SHARE) -- this only decides where the bar sits. */
  function qualifyingBar(configuredMin, maxCount) {
    if (Number.isFinite(configuredMin) && configuredMin > 0) return configuredMin;
    return Math.ceil(maxCount * MIN_GAMES_SHARE);
  }

  /* ---------- Fixed Pairs League: team-level standings ---------- */
  function ensureTeam(session, id, names) {
    if (!session.teams) session.teams = {};
    if (!session.teams[id]) session.teams[id] = { id, names, gp: 0, w: 0, l: 0, pf: 0, pa: 0, h2h: {} };
    return session.teams[id];
  }

  function applyMatchResult(session, aId, bId, scoreA, scoreB) {
    const a = ensureTeam(session, aId, (session.activeMatch && session.activeMatch.teamA) || []);
    const b = ensureTeam(session, bId, (session.activeMatch && session.activeMatch.teamB) || []);
    a.gp++; b.gp++;
    a.pf += scoreA; a.pa += scoreB;
    b.pf += scoreB; b.pa += scoreA;
    if (scoreA > scoreB) { a.w++; b.l++; } else { b.w++; a.l++; }
    a.h2h[bId] = a.h2h[bId] || { w: 0, l: 0 };
    b.h2h[aId] = b.h2h[aId] || { w: 0, l: 0 };
    if (scoreA > scoreB) { a.h2h[bId].w++; b.h2h[aId].l++; }
    else { b.h2h[aId].w++; a.h2h[bId].l++; }
  }

  function computeStandings(session) {
    const teams = Object.values(session.teams || {});
    const winnerConfig = (session && session.winnerConfig) || {};
    const order = normalizeRankingOrder(winnerConfig.rankingOrder);
    const winPct = (t) => (t.gp ? t.w / t.gp : 0);
    const pd = (t) => t.pf - t.pa;
    // Qualifying threshold (see qualifyingBar/MIN_GAMES_SHARE): a team that
    // hasn't played enough games can't win on a thin sample, no matter how
    // good their record looks -- they rank behind every qualifying team
    // regardless of win%, before any other criterion.
    const maxGp = teams.reduce((m, t) => Math.max(m, t.gp), 0);
    const minQualifyingGp = qualifyingBar(winnerConfig.minGames, maxGp);
    const qualifies = (t) => t.gp >= minQualifyingGp;
    // Each configurable criterion, as a comparator returning <0 when `a`
    // should rank above `b`, >0 when `b` should, 0 when tied (fall through
    // to the next criterion in session.winnerConfig.rankingOrder).
    const criteria = {
      winPct: (a, b) => winPct(b) - winPct(a),
      headToHead: (a, b) => { const ab = a.h2h && a.h2h[b.id]; return ab && ab.w !== ab.l ? ab.l - ab.w : 0; },
      pointDiff: (a, b) => pd(b) - pd(a),
      wins: (a, b) => b.w - a.w,
      gamesPlayed: (a, b) => b.gp - a.gp,
    };
    teams.sort((a, b) => {
      const qa = qualifies(a), qb = qualifies(b);
      if (qa !== qb) return qa ? -1 : 1;              // 0. enough games played to qualify
      for (let i = 0; i < order.length; i++) {
        const c = criteria[order[i]](a, b);
        if (c !== 0) return c;                        // 1-5. configured order (default: win% -> h2h -> point diff -> wins -> games played)
      }
      return teamLabel(a.names).localeCompare(teamLabel(b.names)); // 6. name, deterministic
    });
    return teams;
  }

  /* ---------- Rest priority: who plays next ---------- */

  /* Pull `count` players from the waiting line, preferring whoever has
     played the fewest games so far. Mutates session.waiting and
     session.playCounts. Returns the picked names in queue order, or null
     if the queue does not hold enough players yet (nothing is changed). */
  function pullRestedPlayers(session, count) {
    const pick = RotationPick.pickPlayers(session.waiting, count, session.playCounts);
    if (!pick) return null;
    session.waiting = pick.waiting;
    session.playCounts = RotationPick.countRotation(session.playCounts, pick.picked);
    return pick.picked;
  }

  /* Pull `count` players, same as pullRestedPlayers, but treat `avoidNames`
     (typically the group that just finished playing together) as having
     played far more games than anyone else for THIS pick only -- so they
     sort last and are only picked if there are not enough other players to
     fill the match. That gives: a queue of exactly `count` players repeats
     the same group (nobody else exists); a queue of 2x`count` or more never
     repeats the same group back to back; anything in between fills as many
     rested spots as it can and backfills the rest from the group that just
     played. The real playCounts are unaffected -- only this pick's ordering
     is biased. */
  function pullRestedPlayersAvoiding(session, count, avoidNames) {
    if (!avoidNames || avoidNames.length === 0) return pullRestedPlayers(session, count);
    const AVOID_BIAS = 1e6;
    const biased = { ...(session.playCounts || {}) };
    avoidNames.forEach((name) => { biased[name] = (biased[name] || 0) + AVOID_BIAS; });
    const pick = RotationPick.pickPlayers(session.waiting, count, biased);
    if (!pick) return null;
    session.waiting = pick.waiting;
    session.playCounts = RotationPick.countRotation(session.playCounts, pick.picked); // real counts, unbiased
    return pick.picked;
  }

  /* Remove one player from the waiting line by (groupId, name) -- never the whole
     group. If `name` was part of a pair that joined together, the other player
     stays in the line as their own entry (same group id, now holding just their
     name) instead of being removed along with them. If the group was already
     solo, or this removes its last name, the group itself is dropped. A no-op if
     the group or name isn't found. Mutates session.waiting. */
  function removeWaitingPlayer(session, groupId, name) {
    session.waiting = session.waiting
      .map((g) => (g.id === groupId ? { ...g, names: g.names.filter((n) => n !== name) } : g))
      .filter((g) => g.names.length > 0);
  }

  /* ---------- Editing the active match (admin override) ----------
     Staff can always override who's on court right now and who serves
     first -- these never validate against the rotation rule or the
     consecutive-games concern, they only ever WARN about it (see
     justPlayed below) and let the admin decide. */

  function setFirstServer(session, side) {
    if (!session || !session.activeMatch) return { error: 'No active match.' };
    if (side !== 'teamA' && side !== 'teamB') return { error: 'Invalid side.' };
    session.activeMatch = { ...session.activeMatch, firstServer: side };
    return { ok: true };
  }

  /* Did `name` play in the match that just finished? The one signal used to
     flag (never block) a consecutive-games pick, regardless of which rule
     is running -- rest-priority already keeps this from happening on its
     own, this is purely for when an admin overrides it by hand. */
  function justPlayed(session, name) {
    const last = session && session.matches && session.matches[session.matches.length - 1];
    return !!(last && [...(last.teamA || []), ...(last.teamB || [])].includes(name));
  }

  /* Swaps the player at session.activeMatch[team][index] for `newName`, which
     is either (a) another player currently on court -- a straight position
     swap, no waiting-line involved, no consecutive-games concern since
     neither player is new to this match -- or (b) someone from the waiting
     line, who is pulled in while the replaced player goes back to the FRONT
     of the line (they were about to play and got bumped, so they're first
     up next round among equal playCounts, not shuffled to the back).
     Calling this once per slot is also how "change the whole match" works --
     there's no separate bulk version, it's the same edit repeated. Not for
     Fixed Pairs: see swapActiveTeam. Returns { error } or
     { ok, replaced, added, consecutiveWarning, swappedWithinMatch }. */
  function swapActivePlayer(session, team, index, newName) {
    if (!session || !session.activeMatch) return { error: 'No active match.' };
    if (session.rule === 'fixed_pairs') return { error: 'Fixed Pairs swaps whole teams, not individual players -- see swapActiveTeam.' };
    const roster = session.activeMatch[team];
    if (!Array.isArray(roster) || index < 0 || index >= roster.length) return { error: 'Invalid player slot.' };
    const oldName = roster[index];
    if (newName === oldName) return { error: `${newName} is already playing there.` };

    for (const t of ['teamA', 'teamB']) {
      const i = (session.activeMatch[t] || []).indexOf(newName);
      if (i !== -1 && (t !== team || i !== index)) {
        const nextA = session.activeMatch.teamA.slice();
        const nextB = session.activeMatch.teamB.slice();
        (t === 'teamA' ? nextA : nextB)[i] = oldName;
        (team === 'teamA' ? nextA : nextB)[index] = newName;
        session.activeMatch = { ...session.activeMatch, teamA: nextA, teamB: nextB };
        return { ok: true, replaced: oldName, added: newName, consecutiveWarning: false, swappedWithinMatch: true };
      }
    }

    let found = false;
    const waiting = [];
    for (const g of session.waiting) {
      if (!found && g.names.includes(newName)) {
        found = true;
        const rest = g.names.filter((n) => n !== newName);
        if (rest.length) waiting.push({ ...g, names: rest });
        continue;
      }
      waiting.push(g);
    }
    if (!found) return { error: `${newName} isn't on court or in the waiting line.` };
    const consecutiveWarning = justPlayed(session, newName);
    session.waiting = waiting;
    session.waiting.unshift({ id: 'w_swap_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6), names: [oldName] });
    const nextRoster = roster.slice();
    nextRoster[index] = newName;
    session.activeMatch = { ...session.activeMatch, [team]: nextRoster };
    return { ok: true, replaced: oldName, added: newName, consecutiveWarning, swappedWithinMatch: false };
  }

  /* Fixed Pairs equivalent of swapActivePlayer: teams are a stable, named
     unit with its own accumulated win/loss record (session.teams), so
     swapping one player out would mean quietly reassigning that record to a
     different roster -- instead this swaps the WHOLE team on `side` for a
     different team currently waiting (by its waiting-group id). The
     replaced team goes back to the front of the line, same reasoning as
     swapActivePlayer. Returns { error } or
     { ok, replacedTeamId, addedTeamId, consecutiveWarning }. */
  function swapActiveTeam(session, side, newTeamGroupId) {
    if (!session || !session.activeMatch) return { error: 'No active match.' };
    if (session.rule !== 'fixed_pairs') return { error: 'Not a Fixed Pairs match -- see swapActivePlayer.' };
    if (side !== 'teamA' && side !== 'teamB') return { error: 'Invalid side.' };
    const oldTeamId = side === 'teamA' ? session.activeMatch.teamAId : session.activeMatch.teamBId;
    const otherTeamId = side === 'teamA' ? session.activeMatch.teamBId : session.activeMatch.teamAId;
    if (newTeamGroupId === otherTeamId) return { error: 'That team is already on court.' };
    const idx = session.waiting.findIndex((g) => g.id === newTeamGroupId);
    if (idx === -1) return { error: 'That team is not in the waiting line.' };
    const incoming = session.waiting[idx];
    const oldNames = session.activeMatch[side];
    const consecutiveWarning = incoming.names.some((n) => justPlayed(session, n));
    session.waiting = session.waiting.slice(0, idx).concat(session.waiting.slice(idx + 1));
    session.waiting.unshift({ id: oldTeamId, names: oldNames });
    session.activeMatch = { ...session.activeMatch, [side]: incoming.names, [side + 'Id']: incoming.id };
    ensureTeam(session, incoming.id, incoming.names);
    return { ok: true, replacedTeamId: oldTeamId, addedTeamId: incoming.id, consecutiveWarning };
  }

  /* How many times `a` and `b` have been TEAMMATES (same side) in any
     recorded match -- derived from session.matches, same "no separate
     counter to keep in sync" style as computeHeadToHead. This is partner
     history, not opponent history: two players who've faced each other many
     times but never partnered score 0 here. */
  function partnerCount(session, a, b) {
    if (!session || !session.matches) return 0;
    let n = 0;
    session.matches.forEach((m) => {
      if ((m.teamA.includes(a) && m.teamA.includes(b)) || (m.teamB.includes(a) && m.teamB.includes(b))) n++;
    });
    return n;
  }

  /* Of the 3 ways to split 4 players into two teams, picks whichever
     pairing(s) have partnered each other the FEWEST times before (summed
     across both teams), so Partner Rotation actually rotates partners
     instead of repeating the same couple of duos. A random tie-break among
     equally-fresh pairings (common early in a session, when everything is
     still 0) keeps the rotation from settling into one guessable sequence --
     selection is never random, only which of several EQUALLY good pairings
     gets used this round. */
  function bestPartnerPairing(session, players) {
    const [a, b, c, d] = players;
    const options = [
      { teamA: [a, b], teamB: [c, d] },
      { teamA: [a, c], teamB: [b, d] },
      { teamA: [a, d], teamB: [b, c] },
    ];
    const scored = options.map((opt) => ({
      ...opt,
      score: partnerCount(session, opt.teamA[0], opt.teamA[1]) + partnerCount(session, opt.teamB[0], opt.teamB[1]),
    }));
    const minScore = Math.min(...scored.map((o) => o.score));
    const tied = scored.filter((o) => o.score === minScore);
    const pick = tied[Math.floor(Math.random() * tied.length)];
    return { teamA: pick.teamA, teamB: pick.teamB };
  }

  /* Starts the next match when there are enough waiting players and none is
     already running. No-op otherwise. */
  function checkAndFillActiveMatch(session) {
    if (session.activeMatch) return;

    if (session.rule === 'fixed_pairs') {
      if (session.waiting.length >= 2) {
        const tA = session.waiting.shift();
        const tB = session.waiting.shift();
        ensureTeam(session, tA.id, tA.names);
        ensureTeam(session, tB.id, tB.names);
        session.activeMatch = { id: 'match_' + Date.now(), teamA: tA.names, teamB: tB.names, teamAId: tA.id, teamBId: tB.id };
      }
      return;
    }

    const isDoubles = session.mode === 'doubles';
    const countNeeded = isDoubles ? 4 : 2;

    if (session.rule === 'partner_rotation' && isDoubles) {
      // Pull the 4 LEAST-PLAYED eligible players every round (same
      // rest-priority mechanism every other rule uses), avoiding the exact
      // group that just played unless there aren't enough others -- nobody
      // is ever held together for a fixed block of rounds, so a queue
      // larger than four never leaves anyone sitting out while the same
      // four play repeatedly. Then pair them to minimize repeated
      // teammates: see bestPartnerPairing.
      const players = pullRestedPlayersAvoiding(session, 4, session.lastPartnerGroup);
      if (players) {
        const pairing = bestPartnerPairing(session, players);
        session.activeMatch = { id: 'match_' + Date.now(), teamA: pairing.teamA, teamB: pairing.teamB };
      }
      return;
    }

    if (session.rule === 'fixed_rotation') {
      const players = pullRestedPlayers(session, countNeeded);
      if (players) {
        const half = countNeeded / 2;
        session.activeMatch = { id: 'match_' + Date.now(), teamA: players.slice(0, half), teamB: players.slice(half) };
      }
      return;
    }

    // DEFAULT (Winner Stays, Four Off Four On, Timed Rotation)
    const players = pullRestedPlayers(session, countNeeded);
    if (players) {
      const teamSize = countNeeded / 2;
      session.activeMatch = { id: 'match_' + Date.now(), teamA: players.slice(0, teamSize), teamB: players.slice(teamSize) };
    }
  }

  /* ---------- Recording a finished match ---------- */

  /* Validates the two scores, records the match, rotates the queue
     according to the session's rule, and fills the next match. Mutates
     `session`. Returns { error } if the scores are not valid or there is
     no active match, otherwise { winner, winnerNames, loserNames, notices,
     timerReset }. `notices` is the toast text the caller may want to show,
     in the order the rule produced them -- this never touches the DOM
     itself, so the caller decides how (or whether) to display them. */
  function recordMatchResult(session, scoreAInput, scoreBInput) {
    if (!session || !session.activeMatch) return { error: 'No active match.' };
    if (scoreAInput === '' || scoreBInput === '' || scoreAInput == null || scoreBInput == null) {
      return { error: 'Please enter final scores for both teams.' };
    }
    const scoreA = parseInt(scoreAInput, 10), scoreB = parseInt(scoreBInput, 10);
    if (!Number.isFinite(scoreA) || !Number.isFinite(scoreB) || scoreA < 0 || scoreB < 0) {
      return { error: 'Please enter valid numeric scores.' };
    }
    if (scoreA === scoreB) return { error: 'Pickleball matches cannot end in a draw. Please specify a winner.' };

    const match = session.activeMatch;
    const winner = scoreA > scoreB ? 'teamA' : 'teamB';
    const winnerNames = winner === 'teamA' ? match.teamA : match.teamB;
    const loserNames = winner === 'teamA' ? match.teamB : match.teamA;

    session.matches = session.matches || [];
    session.matches.push({ id: 'm_' + Date.now(), teamA: match.teamA, teamB: match.teamB, scoreA, scoreB, winner, timestamp: Date.now() });

    const notices = [];
    let timerReset = false;

    if (session.rule === 'winner_stays') {
      session.waiting.push({ id: 'w_ws_lose_' + Date.now(), names: loserNames });
      const teamSize = session.mode === 'doubles' ? 2 : 1;
      const nextChallengers = pullRestedPlayers(session, teamSize);
      if (nextChallengers) {
        session.activeMatch = { id: 'match_' + Date.now(), teamA: winnerNames, teamB: nextChallengers };
      } else {
        session.waiting.unshift({ id: 'w_win_' + Date.now(), names: winnerNames });
        session.activeMatch = null;
      }
    } else if (session.rule === 'partner_rotation' && session.mode === 'doubles') {
      // Every round stands alone now (see checkAndFillActiveMatch): rotate
      // all four off immediately, same as any other rule, so nobody plays
      // twice in a row and the next checkAndFillActiveMatch call re-draws
      // the next 4 LEAST-PLAYED players from the full, current waiting
      // line -- never the same held-together foursome.
      session.waiting.push({ id: 'w_pr_single_' + Date.now(), names: match.teamA });
      session.waiting.push({ id: 'w_pr_single_' + (Date.now() + 1), names: match.teamB });
      session.lastPartnerGroup = [...match.teamA, ...match.teamB];
      session.activeMatch = null;
    } else if (session.rule === 'fixed_rotation') {
      [...match.teamA, ...match.teamB].forEach((name) => session.waiting.push({ id: 'w_fr_end_' + Math.random().toString(36).slice(2, 6), names: [name] }));
      session.activeMatch = null;
    } else if (session.rule === 'fixed_pairs') {
      if (match.teamAId && match.teamBId) applyMatchResult(session, match.teamAId, match.teamBId, scoreA, scoreB);
      const tA = { id: match.teamAId || ('T' + Date.now().toString(36)), names: match.teamA };
      const tB = { id: match.teamBId || ('T' + (Date.now() + 1).toString(36)), names: match.teamB };
      ensureTeam(session, tA.id, tA.names);
      ensureTeam(session, tB.id, tB.names);
      session.waiting.push(tA);
      session.waiting.push(tB);
      session.activeMatch = null;
    } else if (session.rule === 'timed_rotation') {
      session.timerSecondsLeft = session.timerLimit * 60;
      session.timerRunning = false;
      timerReset = true;
      session.waiting.push({ id: 'w_rot_A_' + Date.now(), names: match.teamA });
      session.waiting.push({ id: 'w_rot_B_' + Date.now(), names: match.teamB });
      session.activeMatch = null;
      notices.push('Timer reset for the next match!');
    } else {
      // Four Off, Four On (default)
      session.waiting.push({ id: 'w_rot_A_' + Date.now(), names: match.teamA });
      session.waiting.push({ id: 'w_rot_B_' + Date.now(), names: match.teamB });
      session.activeMatch = null;
    }

    checkAndFillActiveMatch(session);
    notices.push(`Match completed! Winners: ${winnerNames.join(' & ')}`);

    return { winner, winnerNames, loserNames, notices, timerReset };
  }

  /* ---------- Name matching, to catch duplicate/misspelled entries ---------- */

  function normalizeName(name) {
    return name.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
  }
  function levenshtein(a, b) {
    const m = a.length, n = b.length;
    if (m === 0) return n;
    if (n === 0) return m;
    const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
    return dp[m][n];
  }
  function nameSimilarity(a, b) {
    const na = normalizeName(a), nb = normalizeName(b);
    if (na === nb) return 1.0;
    if (na.includes(nb) || nb.includes(na)) return 0.85;
    const dist = levenshtein(na, nb);
    const maxLen = Math.max(na.length, nb.length);
    return maxLen === 0 ? 0 : 1 - dist / maxLen;
  }
  function getAllPlayerNamesInSession(session) {
    const names = new Set();
    (session.waiting || []).forEach((w) => w.names.forEach((n) => names.add(n)));
    if (session.activeMatch) {
      (session.activeMatch.teamA || []).forEach((n) => names.add(n));
      (session.activeMatch.teamB || []).forEach((n) => names.add(n));
    }
    (session.matches || []).forEach((m) => {
      (m.teamA || []).forEach((n) => names.add(n));
      (m.teamB || []).forEach((n) => names.add(n));
    });
    return [...names];
  }
  function findSimilarNames(existingNames, newName, threshold) {
    const t = threshold == null ? 0.7 : threshold;
    const matches = [];
    existingNames.forEach((existing) => {
      const sim = nameSimilarity(existing, newName);
      if (sim >= t && normalizeName(existing) !== normalizeName(newName)) matches.push({ name: existing, similarity: sim });
    });
    return matches.sort((a, b) => b.similarity - a.similarity);
  }
  /* Browser-only: asks via confirm() when a new name looks like an existing
     player. Returns the (possibly updated) name. Safe to call from any page
     that runs in a browser -- it touches no facility or storage state. */
  function promptNameConflict(session, newName) {
    const existing = getAllPlayerNamesInSession(session);
    const exactMatch = existing.find((n) => normalizeName(n) === normalizeName(newName));
    if (exactMatch) {
      const useExisting = confirm(`"${newName}" looks like it matches existing player "${exactMatch}".\n\nClick OK to use the existing name "${exactMatch}", or Cancel to keep "${newName}" as a separate player.`);
      return useExisting ? exactMatch : newName;
    }
    const similar = findSimilarNames(existing, newName);
    if (similar.length > 0) {
      const top = similar[0];
      const useExisting = confirm(`"${newName}" is similar to existing player "${top.name}".\n\nIs this the same person?\n\nClick OK to use "${top.name}", or Cancel to add "${newName}" as a new player.`);
      return useExisting ? top.name : newName;
    }
    return newName;
  }

  /* ---------- Match stats, computed on the fly from session.matches ---------- */

  function computePlayerStats(session) {
    const stats = {};
    if (!session || !session.matches || session.matches.length === 0) return stats;
    session.matches.forEach((match) => {
      const { teamA, teamB, scoreA, scoreB, winner } = match;
      const winnerTeam = winner === 'teamA' ? teamA : teamB;
      [...teamA, ...teamB].forEach((player) => {
        if (!stats[player]) stats[player] = { matches: 0, wins: 0, losses: 0, pointsFor: 0, pointsAgainst: 0 };
        stats[player].matches++;
        if (winnerTeam.includes(player)) stats[player].wins++; else stats[player].losses++;
        const playerScore = teamA.includes(player) ? scoreA : scoreB;
        const opponentScore = teamA.includes(player) ? scoreB : scoreA;
        stats[player].pointsFor += playerScore;
        stats[player].pointsAgainst += opponentScore;
      });
    });
    return stats;
  }

  function computeTeamStats(session) {
    const teams = {};
    if (!session || !session.matches || session.matches.length === 0) return [];
    session.matches.forEach((match) => {
      const { teamA, teamB, scoreA, scoreB, winner } = match;
      const teamAKey = [...teamA].sort().join(' & ');
      const teamBKey = [...teamB].sort().join(' & ');
      if (!teams[teamAKey]) teams[teamAKey] = { names: teamA, matches: 0, wins: 0, losses: 0, pointsFor: 0, pointsAgainst: 0 };
      if (!teams[teamBKey]) teams[teamBKey] = { names: teamB, matches: 0, wins: 0, losses: 0, pointsFor: 0, pointsAgainst: 0 };
      teams[teamAKey].matches++; teams[teamBKey].matches++;
      teams[teamAKey].pointsFor += scoreA; teams[teamAKey].pointsAgainst += scoreB;
      teams[teamBKey].pointsFor += scoreB; teams[teamBKey].pointsAgainst += scoreA;
      if (winner === 'teamA') { teams[teamAKey].wins++; teams[teamBKey].losses++; }
      else { teams[teamBKey].wins++; teams[teamAKey].losses++; }
    });
    return Object.values(teams);
  }

  /* Head-to-head: for every pair of players who have ever been on OPPOSING teams
     (never teammates -- this is "who beat whom", not win-together record), how many
     times has each beaten the other. Works the same for every rule, including
     Partner Rotation and Winner Stays, where who's on which side changes match to
     match -- it only reads session.matches, never which rule produced them. In
     doubles, both players on one side are counted as having faced both players on
     the other side for that match. Returns an array sorted by most meetings first
     (the most-played rivalries), each entry { a, b, aWins, bWins, meetings } with
     a < b alphabetically so the same pair always gets the same entry regardless of
     which side either player was on in any given match. */
  function computeHeadToHead(session) {
    const pairs = {};
    if (!session || !session.matches) return [];
    session.matches.forEach((match) => {
      const { teamA, teamB, winner } = match;
      (teamA || []).forEach((x) => {
        (teamB || []).forEach((y) => {
          const a = x < y ? x : y;
          const b = x < y ? y : x;
          const key = a + '\u0001' + b;
          if (!pairs[key]) pairs[key] = { a, b, aWins: 0, bWins: 0, meetings: 0 };
          const rec = pairs[key];
          rec.meetings++;
          const xWon = winner === 'teamA';
          if (x === a) { if (xWon) rec.aWins++; else rec.bWins++; }
          else { if (xWon) rec.bWins++; else rec.aWins++; }
        });
      });
    });
    return Object.values(pairs).sort((r1, r2) => r2.meetings - r1.meetings || r1.a.localeCompare(r2.a) || r1.b.localeCompare(r2.b));
  }

  /* The overall winner of a session, for declaring one when the session ends.
     Ranking priority, both for Fixed Pairs (the top team from
     computeStandings) and every other rule (the top player, using
     computeHeadToHead for the head-to-head step):
       0. qualifying games played -- qualifyingBar's threshold (an explicit
          session.winnerConfig.minGames, or MIN_GAMES_SHARE of the session's
          most active player/team by default); someone who joined late and
          played barely any games can't win on a thin, possibly lucky
          sample, no matter how good it looks. This is checked BEFORE the
          configured order below -- it's a gate, not a tiebreak. Below the
          bar, a player still gets ranked (by the same criteria, among the
          other players below it), so the result is always decided; they
          just can't outrank anyone who cleared it.
       1-5. win percentage -> head-to-head -> point differential -> total
          wins -> games played, IN THAT ORDER BY DEFAULT -- but any
          permutation of these 5 can be set via session.winnerConfig.
          rankingOrder (see normalizeRankingOrder) to rearrange which
          tiebreak matters most for a given session.
       6. name -- always deterministic, so the result is never unresolved,
          and never part of the configurable order.
     With the default order, an undefeated player (or team) therefore always
     outranks one with more total wins but a lower win rate, and a player
     who has the other tied player's number head-to-head outranks them even
     if the other has the better point differential. Returns null if no
     matches have been played yet. `decidedBy` names whichever criterion
     separated the winner from the runner-up, for a transparent "won on
     countback" message. */
  function computeOverallWinner(session) {
    if (!session || !session.matches || session.matches.length === 0) return null;
    const winnerConfig = (session && session.winnerConfig) || {};
    const order = normalizeRankingOrder(winnerConfig.rankingOrder);

    if (session.rule === 'fixed_pairs') {
      const standings = computeStandings(session);
      if (!standings.length) return null;
      const top = standings[0];
      return {
        type: 'team', name: teamLabel(top.names),
        matches: top.gp, wins: top.w, losses: top.l,
        pointsFor: top.pf, pointsAgainst: top.pa, pointDiff: top.pf - top.pa,
        winPct: top.gp ? Math.round((top.w / top.gp) * 100) : 0,
        decidedBy: 'standings',
      };
    }

    const playerStats = computePlayerStats(session);
    const names = Object.keys(playerStats);
    if (!names.length) return null;
    const h2h = computeHeadToHead(session);
    const recordBetween = (a, b) => h2h.find((r) => (r.a === a && r.b === b) || (r.a === b && r.b === a));

    const rows = names.map((name) => {
      const s = playerStats[name];
      return { name, matches: s.matches, wins: s.wins, losses: s.losses, pointsFor: s.pointsFor, pointsAgainst: s.pointsAgainst, pointDiff: s.pointsFor - s.pointsAgainst, winPct: s.matches ? (s.wins / s.matches) * 100 : 0 };
    });

    // Qualifying threshold -- see qualifyingBar/MIN_GAMES_SHARE. A late
    // joiner who's only played a couple of games can't win on win% alone;
    // they rank behind every player who cleared the bar, before the
    // configured order is even compared.
    const maxMatches = rows.reduce((m, r) => Math.max(m, r.matches), 0);
    const minQualifyingMatches = qualifyingBar(winnerConfig.minGames, maxMatches);
    const qualifies = (r) => r.matches >= minQualifyingMatches;

    // Each configurable criterion, as a comparator returning either
    // { cmp, by } when it separates a from b, or null when tied (fall
    // through to the next criterion in session.winnerConfig.rankingOrder).
    const criteria = {
      winPct: (a, b) => (b.winPct !== a.winPct ? { cmp: b.winPct - a.winPct, by: 'win%' } : null),
      headToHead: (a, b) => {
        const rec = recordBetween(a.name, b.name);
        if (!rec) return null;
        const aWins = rec.a === a.name ? rec.aWins : rec.bWins;
        const bWins = rec.a === a.name ? rec.bWins : rec.aWins;
        return aWins !== bWins ? { cmp: bWins - aWins, by: 'head-to-head' } : null;
      },
      pointDiff: (a, b) => (b.pointDiff !== a.pointDiff ? { cmp: b.pointDiff - a.pointDiff, by: 'point differential' } : null),
      wins: (a, b) => (b.wins !== a.wins ? { cmp: b.wins - a.wins, by: 'total wins' } : null),
      gamesPlayed: (a, b) => (b.matches !== a.matches ? { cmp: b.matches - a.matches, by: 'games played' } : null),
    };

    const compare = (a, b) => {
      const qa = qualifies(a), qb = qualifies(b);
      if (qa !== qb) return { cmp: qa ? -1 : 1, by: 'qualifying games played' };
      for (let i = 0; i < order.length; i++) {
        const result = criteria[order[i]](a, b);
        if (result) return result;
      }
      return { cmp: a.name.localeCompare(b.name), by: 'name' };
    };

    rows.sort((a, b) => compare(a, b).cmp);
    const top = rows[0];
    const decidedBy = rows.length > 1 ? compare(top, rows[1]).by : 'win%';
    return {
      type: 'player', name: top.name,
      matches: top.matches, wins: top.wins, losses: top.losses,
      pointsFor: top.pointsFor, pointsAgainst: top.pointsAgainst, pointDiff: top.pointDiff,
      winPct: Math.round(top.winPct), decidedBy,
    };
  }

  /* A complete, serializable snapshot of a session's final stats --
     standings (Fixed Pairs only), the player leaderboard, the team/pairing
     leaderboard, head-to-head, and full match history -- captured once so
     it survives the caller wiping the session right after (both queue
     pages clear their stored session the moment a queue ends, before the
     winner is even shown). This is the data behind the "download stats"
     PDF/print view; pure, no DOM, just plain data the caller renders. */
  function buildStatsReport(session) {
    if (!session) return null;
    const pdOf = (f, a) => f - a;
    const standings = session.rule === 'fixed_pairs' ? computeStandings(session).map((t) => ({
      name: teamLabel(t.names), gp: t.gp, w: t.w, l: t.l, pf: t.pf, pa: t.pa, pd: pdOf(t.pf, t.pa),
      winPct: t.gp ? Math.round((t.w / t.gp) * 100) : 0,
    })) : [];
    const playerStats = computePlayerStats(session);
    const players = Object.entries(playerStats).map(([name, s]) => ({
      name, matches: s.matches, wins: s.wins, losses: s.losses, pointsFor: s.pointsFor, pointsAgainst: s.pointsAgainst,
      pd: pdOf(s.pointsFor, s.pointsAgainst), winPct: s.matches ? Math.round((s.wins / s.matches) * 100) : 0,
    })).sort((a, b) => b.winPct - a.winPct || b.pd - a.pd || b.pointsFor - a.pointsFor);
    const teams = computeTeamStats(session).map((t) => ({
      name: teamLabel(t.names), matches: t.matches, wins: t.wins, losses: t.losses, pointsFor: t.pointsFor, pointsAgainst: t.pointsAgainst,
      pd: pdOf(t.pointsFor, t.pointsAgainst), winPct: t.matches ? Math.round((t.wins / t.matches) * 100) : 0,
    })).sort((a, b) => b.winPct - a.winPct || b.pd - a.pd || b.pointsFor - a.pointsFor);
    const headToHead = computeHeadToHead(session);
    const matches = (session.matches || []).slice().reverse().map((m) => ({
      teamA: teamLabel(m.teamA), teamB: teamLabel(m.teamB), scoreA: m.scoreA, scoreB: m.scoreB,
    }));
    return {
      name: session.name || null, mode: session.mode, rule: session.rule,
      generatedAt: Date.now(), standings, players, teams, headToHead, matches,
    };
  }

  return {
    teamLabel,
    ensureTeam, applyMatchResult, computeStandings,
    pullRestedPlayers, pullRestedPlayersAvoiding, checkAndFillActiveMatch, recordMatchResult, removeWaitingPlayer,
    setFirstServer, justPlayed, swapActivePlayer, swapActiveTeam,
    partnerCount, bestPartnerPairing,
    normalizeName, nameSimilarity, getAllPlayerNamesInSession, findSimilarNames, promptNameConflict,
    computePlayerStats, computeTeamStats, computeHeadToHead, computeOverallWinner, buildStatsReport,
    DEFAULT_RANKING_ORDER, RANKING_CRITERIA_LABELS, normalizeRankingOrder,
  };
}));
