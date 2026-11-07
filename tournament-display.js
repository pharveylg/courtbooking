/* Pure logic for the public, no-PIN "venue screen" dashboard (tournament-display.html):
   - courts-playing aggregation (join a live match to its scheduled court)
   - the leaderboard math (identical to tournament.html's renderStatsTab, generalized
     to run over any slice of matches -- one division, or every division combined)
   - spotlight-ticker callout generation, built from that same leaderboard data
   - the session-start timestamp's idempotent stamping decision
   - a small generic Auto/Manual rotator used both for the featured-match panel
     (auto-only cycling) and the leaderboard view switcher (auto cycling that a
     manual pin overrides, released back to resume auto)

   No DOM, no Firestore -- loaded by the browser as `TournamentDisplay` and by the
   tests via require(), same convention as next-open.js / queue-engine.js. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TournamentDisplay = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ---------------- courts playing ---------------- */

  function countTotalCourts(venues) {
    return (venues || []).reduce((sum, v) => sum + ((v.courts || []).filter((c) => c.active !== false).length), 0);
  }

  /* liveDocs: [{id, divisionId?, ...}] (id is the matchId), matchesById: {matchId: matchDoc},
     venues: [{id, courts:[{id, active?}]}].
     A live match whose schedule isn't published yet (no match.sched, or no
     venueId/courtId on it) has no court to join to and is excluded from the
     "currently playing" count -- it still shows up in the featured-match panel,
     it just can't be attributed to a specific court. */
  function aggregateCourtsPlaying({ liveDocs, matchesById, venues }) {
    const total = countTotalCourts(venues);
    const matchesMap = matchesById || {};
    const courtKeys = new Set();
    const liveByCourtKey = {};
    (liveDocs || []).forEach((live) => {
      const match = matchesMap[live.id];
      const sched = match && match.sched;
      if (!sched || !sched.venueId || !sched.courtId) return;
      const key = `${sched.venueId}:${sched.courtId}`;
      courtKeys.add(key);
      liveByCourtKey[key] = {
        matchId: live.id,
        venueId: sched.venueId,
        courtId: sched.courtId,
        divisionId: live.divisionId || match.divisionId || null,
      };
    });
    return { total, playing: courtKeys.size, courtKeys: Array.from(courtKeys), liveByCourtKey };
  }

  function venueCourtLabel(sched, venues) {
    if (!sched || !sched.venueId) return null;
    const v = (venues || []).find((x) => x.id === sched.venueId);
    const c = v && (v.courts || []).find((x) => x.id === sched.courtId);
    if (!v) return null;
    return c ? `${v.name} · ${c.name}` : v.name;
  }

  /* ---------------- leaderboard math (same math as tournament.html's
     renderStatsTab, generalized to accept any slice of matches: one
     division's matches for a per-division view, or every division's
     matches concatenated for the Combined view). Participant ids are
     registration ids, scoped tournament-wide, so combining divisions
     is a plain concat -- there is no cross-division id collision to
     resolve. ---------------- */
  function computeLeaderboardRows(matches) {
    const completed = (matches || []).filter((m) => m.status === 'completed' && m.score && m.winnerParticipantId);
    const stats = {};
    completed.forEach((m) => {
      const [idA, idB] = m.participantIds || [];
      const [nameA, nameB] = m.participantNames || [];
      if (!idA || !idB || idA === 'BYE' || idB === 'BYE') return;
      // divisionId travels with each row so the Combined view (every division's
      // matches concatenated) can still show which division a row belongs to --
      // a participant only ever plays within one division, so the first match
      // seen for an id sets it and every later match agrees.
      if (!stats[idA]) stats[idA] = { participantId: idA, name: nameA, divisionId: m.divisionId || null, gp: 0, w: 0, l: 0, pf: 0, pa: 0 };
      if (!stats[idB]) stats[idB] = { participantId: idB, name: nameB, divisionId: m.divisionId || null, gp: 0, w: 0, l: 0, pf: 0, pa: 0 };
      stats[idA].gp++; stats[idB].gp++;
      stats[idA].pf += m.score.a; stats[idA].pa += m.score.b;
      stats[idB].pf += m.score.b; stats[idB].pa += m.score.a;
      if (m.winnerParticipantId === idA) { stats[idA].w++; stats[idB].l++; }
      else { stats[idB].w++; stats[idA].l++; }
    });
    const rows = Object.values(stats).map((s) => ({ ...s, winPct: s.gp > 0 ? (s.w / s.gp) * 100 : 0, diff: s.pf - s.pa }));
    rows.sort((a, b) => {
      if (b.winPct !== a.winPct) return b.winPct - a.winPct;
      if (b.diff !== a.diff) return b.diff - a.diff;
      return b.pf - a.pf;
    });
    const totalMatches = completed.length;
    const totalPlayers = rows.length;
    const avgScore = totalMatches ? Math.round(completed.reduce((sum, m) => sum + m.score.a + m.score.b, 0) / (totalMatches * 2)) : 0;
    const biggestBlowout = completed.length ? Math.max(...completed.map((m) => Math.abs(m.score.a - m.score.b))) : 0;
    return { rows, totalMatches, totalPlayers, avgScore, biggestBlowout };
  }

  /* ---------------- spotlight ticker callouts ----------------
     Built from the exact same completed-matches data the leaderboard above
     already computed from -- no extra Firestore reads. Extends the Stats
     tab's existing "biggest blowout" / "avg score" idea with a couple more
     templates in the same spirit. Returns plain-text strings; the page
     scrolls them along the bottom. */
  function buildSpotlightCallouts({ matches, rows }) {
    const completed = (matches || []).filter((m) => m.status === 'completed' && m.score && m.winnerParticipantId);
    const callouts = [];
    if (!completed.length || !rows || !rows.length) return callouts;

    const unbeaten = rows.filter((r) => r.l === 0 && r.gp >= 2).sort((a, b) => b.gp - a.gp)[0];
    if (unbeaten) callouts.push(`${unbeaten.name} is unbeaten in ${unbeaten.gp} games`);

    const mostGames = rows.slice().sort((a, b) => b.gp - a.gp)[0];
    if (mostGames && mostGames.gp > 0) callouts.push(`${mostGames.name} has played the most games (${mostGames.gp})`);

    let biggest = null;
    completed.forEach((m) => {
      const diff = Math.abs(m.score.a - m.score.b);
      if (!biggest || diff > biggest.diff) biggest = { diff, m };
    });
    if (biggest && biggest.diff > 0) {
      const [nameA, nameB] = biggest.m.participantNames || [];
      const winnerIsA = biggest.m.winnerParticipantId === (biggest.m.participantIds || [])[0];
      const winner = winnerIsA ? nameA : nameB;
      const loser = winnerIsA ? nameB : nameA;
      if (winner && loser) callouts.push(`Biggest win: ${winner} beat ${loser} by ${biggest.diff} points`);
    }

    let closest = null;
    completed.forEach((m) => {
      const diff = Math.abs(m.score.a - m.score.b);
      if (diff > 0 && (!closest || diff < closest.diff)) closest = { diff, m };
    });
    if (closest && (!biggest || closest.m !== biggest.m)) {
      const [nameA, nameB] = closest.m.participantNames || [];
      if (nameA && nameB) callouts.push(`Nail-biter: ${nameA} vs ${nameB} decided by just ${closest.diff} point${closest.diff === 1 ? '' : 's'}`);
    }

    const leader = rows.find((r) => r.gp > 0);
    if (leader) callouts.push(`${leader.name} leads the board at ${Math.round(leader.winPct)}% wins`);

    return callouts;
  }

  /* ---------------- session-start timestamp ----------------
     firestore.rules leaves `clients/{clientId}/tournaments/{document}` wide
     open to any client write (same as every other operational doc in this
     app, see firestore.rules's own comments) -- no Cloud Function needed.
     This is the pure idempotency decision: given the tournament doc's
     current data, should the page write a stamp, and what should it be?
     Returns null when one is already set (never overwrite it). */
  function computeSessionStampPayload(tournamentData, nowMs) {
    const existing = tournamentData && tournamentData.displaySession && tournamentData.displaySession.startedAtMs;
    if (existing) return null;
    return { startedAtMs: typeof nowMs === 'number' ? nowMs : Date.now() };
  }

  /* ---------------- feed health / stale-data indicator ----------------
     This is an unattended venue TV: if a listener silently stops updating
     nobody is there to notice, so the page would just keep showing stale
     data forever with no signal anything is wrong. Pure decision logic
     for tournament-display.html's "Reconnecting..." header line: given
     each tracked listener's last-successful-snapshot time (and any
     outstanding error), and the current time, what (if anything) should
     the indicator say?

     health: { <name>: { lastOkAt: ms|null, errorMsg: string|null }, ... }
     An error on ANY listener is shown immediately (no threshold -- a
     permission-denied or similar failure doesn't need 30s to be real).
     Otherwise, once at least one listener has reported in, staleness is
     judged from the MOST RECENT lastOkAt across all of them (any one
     updating is evidence the connection is alive); past thresholdMs with
     no update from any of them, show "last updated Xs ago". */
  function computeFeedStatus(health, nowMs, thresholdMs) {
    const now = typeof nowMs === 'number' ? nowMs : Date.now();
    const threshold = typeof thresholdMs === 'number' ? thresholdMs : 30000;
    const entries = Object.values(health || {});
    const erroring = entries.find((e) => e && e.errorMsg);
    if (erroring) return { show: true, text: '⚠ Reconnecting… live feed hit an error' };

    const started = entries.filter((e) => e && e.lastOkAt != null);
    if (!started.length) return { show: false, text: '' };

    const mostRecent = Math.max.apply(null, started.map((e) => e.lastOkAt));
    const ageMs = now - mostRecent;
    if (ageMs > threshold) {
      return { show: true, text: `⚠ Reconnecting… last updated ${Math.floor(ageMs / 1000)}s ago` };
    }
    return { show: false, text: '' };
  }

  /* ---------------- generic Auto/Manual rotator ----------------
     Used for both:
       - the featured-match panel (auto-only: just cycles through whichever
         matches are live right now)
       - the leaderboard view switcher (Auto cycles Combined -> each division;
         a manual pin overrides the cycle until released back to Auto, which
         resumes cycling from wherever it left off -- it does not jump back
         to the start). */
  function createRotator(initialItems) {
    let items = Array.isArray(initialItems) ? initialItems.slice() : [];
    let autoIndex = 0;
    let manualItem = null;

    function clampIndex() {
      if (items.length === 0) { autoIndex = 0; return; }
      if (autoIndex >= items.length) autoIndex = autoIndex % items.length;
    }

    return {
      setItems(newItems) {
        items = Array.isArray(newItems) ? newItems.slice() : [];
        clampIndex();
        if (manualItem != null && items.indexOf(manualItem) === -1) manualItem = null; // pinned item vanished -> fall back to Auto
      },
      items() { return items.slice(); },
      current() {
        if (manualItem != null) return manualItem;
        return items.length ? items[autoIndex] : null;
      },
      advance() {
        if (manualItem != null) return; // manual mode ignores the auto timer entirely
        if (items.length === 0) return;
        autoIndex = (autoIndex + 1) % items.length;
      },
      pin(item) { manualItem = item; },
      release() { manualItem = null; },
      isManual() { return manualItem != null; },
    };
  }

  return {
    countTotalCourts,
    aggregateCourtsPlaying,
    venueCourtLabel,
    computeLeaderboardRows,
    buildSpotlightCallouts,
    computeSessionStampPayload,
    computeFeedStatus,
    createRotator,
  };
}));
