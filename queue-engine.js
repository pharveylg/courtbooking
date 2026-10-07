/* Walk-in queue rotation engine -- pure functions, no DOM, no storage, no
   network. Mutates and returns the session object you pass in; how that
   session is stored (Firestore-backed, for a facility's queue module, or
   sessionStorage-only, for the standalone queue tool) is entirely up to
   the caller.

   A session looks like:
     { mode: 'singles'|'doubles', rule: <one of the six rules>,
       waiting: [{ id, names: [...] }], activeMatch: { teamA, teamB, ... } | null,
       matches: [...], playCounts: {}, teams: {}, partnerRotationState, ... }

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

  /* Partner Rotation holds a foursome together for three rounds so they get to play with
     every possible partner -- that only makes sense when the queue doesn't comfortably
     supply a fresh four every round. Above this many players in the whole queue, every
     round stands alone instead: see checkAndFillActiveMatch and recordMatchResult. */
  const PARTNER_ROTATION_HOLD_LIMIT = 8;

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
    const winPct = (t) => (t.gp ? t.w / t.gp : 0);
    const pd = (t) => t.pf - t.pa;
    teams.sort((a, b) => {
      const wa = winPct(a), wb = winPct(b);
      if (wb !== wa) return wb - wa;                 // 1. winning percentage
      const da = pd(a), db = pd(b);
      if (db !== da) return db - da;                 // 2. point differential
      const ab = a.h2h && a.h2h[b.id];
      if (ab && ab.w !== ab.l) return ab.l - ab.w;    // 3. head-to-head
      return b.pf - a.pf;                             // 4. total points scored
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
      // Pull 4 players, avoiding the group that just played (session.lastPartnerGroup)
      // unless there aren't enough others to fill the court.
      const players = pullRestedPlayersAvoiding(session, 4, session.lastPartnerGroup);
      if (players) {
        // With more than PARTNER_ROTATION_HOLD_LIMIT players in the whole queue (nobody is on
        // court at this exact moment, so session.waiting is the whole pool), there's no need to
        // hold this foursome together for three rounds -- there's always a fully fresh four
        // waiting, so every round stands alone and nobody plays back to back at all. At or
        // below the limit, keep the three-round, swap-partners structure (session.waiting
        // already reflects the players NOT picked, since pullRestedPlayersAvoiding removed them).
        const poolSize = players.length + session.waiting.reduce((sum, w) => sum + w.names.length, 0);
        if (poolSize <= PARTNER_ROTATION_HOLD_LIMIT) session.partnerRotationState = { players, round: 1 };
        session.activeMatch = { id: 'match_' + Date.now() + '_pr1', teamA: [players[0], players[1]], teamB: [players[2], players[3]] };
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
    } else if (session.rule === 'partner_rotation' && session.mode === 'doubles' && session.partnerRotationState) {
      const prState = session.partnerRotationState;
      const p = prState.players; // [P1, P2, P3, P4]
      // Re-check the threshold at every round, not just when the group formed: if the
      // queue has grown past the limit since then, stop holding these four together
      // right now instead of forcing the rest of the 3 rounds through.
      const poolSize = p.length + session.waiting.reduce((sum, w) => sum + w.names.length, 0);
      if (poolSize > PARTNER_ROTATION_HOLD_LIMIT) {
        p.forEach((name) => session.waiting.push({ id: 'w_pr_end_' + Math.random().toString(36).slice(2, 6), names: [name] }));
        session.lastPartnerGroup = p.slice();
        delete session.partnerRotationState;
        session.activeMatch = null;
      } else if (prState.round === 1) {
        prState.round = 2;
        session.activeMatch = { id: 'match_' + Date.now() + '_pr2', teamA: [p[0], p[2]], teamB: [p[1], p[3]] };
        notices.push('Round 1 finished! Setting up Round 2 partners.');
      } else if (prState.round === 2) {
        prState.round = 3;
        session.activeMatch = { id: 'match_' + Date.now() + '_pr3', teamA: [p[0], p[3]], teamB: [p[1], p[2]] };
        notices.push('Round 2 finished! Setting up Round 3 partners.');
      } else {
        p.forEach((name) => session.waiting.push({ id: 'w_pr_end_' + Math.random().toString(36).slice(2, 6), names: [name] }));
        session.lastPartnerGroup = p.slice(); // avoided for the next group, unless too few others are waiting
        delete session.partnerRotationState;
        session.activeMatch = null;
        notices.push('Partner rotation complete! Next 4 players stepping up.');
      }
    } else if (session.rule === 'partner_rotation' && session.mode === 'doubles') {
      // No partnerRotationState: the queue was large enough (more than
      // PARTNER_ROTATION_HOLD_LIMIT) that this foursome was never held together --
      // this one round stands alone. Rotate all four off immediately, same as any
      // other rule, so nobody plays two rounds back to back.
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
     Fixed Pairs: the top team from computeStandings (win% -> point diff ->
     head-to-head -> points scored -- that ranking already exists for the
     league table). Every other rule: the top player by the same Player
     Leaderboard ranking (win% -> point diff -> points scored), with
     head-to-head added as a further tiebreak using computeHeadToHead -- the
     leaderboard alone doesn't use it, but there's no reason not to when
     declaring a single winner. Still tied after that: most games played,
     then name, so the result is always decided. Returns null if no matches
     have been played yet. `decidedBy` names whichever criterion separated
     the winner from the runner-up, for a transparent "won on countback"
     message. */
  function computeOverallWinner(session) {
    if (!session || !session.matches || session.matches.length === 0) return null;

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

    const compare = (a, b) => {
      if (b.winPct !== a.winPct) return { cmp: b.winPct - a.winPct, by: 'win%' };
      if (b.pointDiff !== a.pointDiff) return { cmp: b.pointDiff - a.pointDiff, by: 'point differential' };
      if (b.pointsFor !== a.pointsFor) return { cmp: b.pointsFor - a.pointsFor, by: 'points scored' };
      const rec = recordBetween(a.name, b.name);
      if (rec) {
        const aWins = rec.a === a.name ? rec.aWins : rec.bWins;
        const bWins = rec.a === a.name ? rec.bWins : rec.aWins;
        if (aWins !== bWins) return { cmp: bWins - aWins, by: 'head-to-head' };
      }
      if (b.matches !== a.matches) return { cmp: b.matches - a.matches, by: 'games played' };
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

  return {
    teamLabel,
    ensureTeam, applyMatchResult, computeStandings,
    pullRestedPlayers, pullRestedPlayersAvoiding, checkAndFillActiveMatch, recordMatchResult, removeWaitingPlayer,
    normalizeName, nameSimilarity, getAllPlayerNamesInSession, findSimilarNames, promptNameConflict,
    computePlayerStats, computeTeamStats, computeHeadToHead, computeOverallWinner,
  };
}));
