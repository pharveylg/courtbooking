/* Round Robin: every participant plays every other participant exactly
   once. All matches are known upfront -- unlike single elimination, nothing
   here depends on an earlier match's result, so generateMatches produces
   the whole schedule in one pass and there is no advancement step. */

const BYE = 'BYE';

/* Circle method: fix the first entry, rotate the rest each round. Standard
   algorithm for round-robin scheduling; handles an odd participant count by
   scheduling against a BYE slot (that round, that participant sits out --
   no match is created for it). */
function circleMethodRounds(ids) {
  const isOdd = ids.length % 2 !== 0;
  let arr = isOdd ? [...ids, BYE] : [...ids];
  const size = arr.length;
  const half = size / 2;
  const rounds = [];
  for (let r = 0; r < size - 1; r++) {
    const pairs = [];
    for (let i = 0; i < half; i++) {
      const a = arr[i];
      const b = arr[size - 1 - i];
      if (a !== BYE && b !== BYE) pairs.push([a, b]);
    }
    rounds.push(pairs);
    const fixed = arr[0];
    const rest = arr.slice(1);
    rest.unshift(rest.pop());
    arr = [fixed, ...rest];
  }
  return rounds;
}

/* participants: seeded array (order doesn't affect fairness for round
   robin, only display/round numbering). Returns match descriptors ready to
   be written as Firestore docs by the caller. */
function generateMatches(participants) {
  const byId = new Map(participants.map((p) => [p.participantId, p]));
  const rounds = circleMethodRounds(participants.map((p) => p.participantId));
  const matches = [];
  rounds.forEach((pairs, roundIdx) => {
    pairs.forEach(([aId, bId], posIdx) => {
      const a = byId.get(aId);
      const b = byId.get(bId);
      matches.push({
        round: roundIdx + 1,
        position: posIdx,
        participantIds: [a.participantId, b.participantId],
        participantNames: [a.playerNames.join(' & '), b.playerNames.join(' & ')],
        status: 'scheduled',
      });
    });
  });
  return matches;
}

/* Standings order: wins, then head-to-head among the teams tied on wins,
   then overall point differential, then points scored, then id (so the
   order is deterministic). Head-to-head for a 2-way tie is simply who won
   that match; for a 3+ way tie it's wins within the tied group (a mini
   league), and a cycle (A beat B beat C beat A) falls through to point
   differential. `matches` is every completed match in the division (round
   robin has no separate "advancement" concept -- standings are a tally).
   `participants` here is [{participantId, name}] -- a display name, not
   the raw playerNames array generateMatches() works with. */
function computeStandings(participants, matches) {
  const table = new Map();
  participants.forEach((p) => {
    table.set(p.participantId, {
      participantId: p.participantId,
      name: p.name,
      wins: 0, losses: 0, pointsFor: 0, pointsAgainst: 0,
    });
  });
  const completed = matches.filter((m) => m.status === 'completed' || m.status === 'walkover' || m.status === 'forfeit');
  completed.forEach((m) => {
    const [aId, bId] = m.participantIds;
    const a = table.get(aId);
    const b = table.get(bId);
    if (!a || !b) return;
    const scoreA = m.score ? m.score.a : null;
    const scoreB = m.score ? m.score.b : null;
    if (scoreA != null) a.pointsFor += scoreA, a.pointsAgainst += scoreB || 0;
    if (scoreB != null) b.pointsFor += scoreB, b.pointsAgainst += scoreA || 0;
    if (m.winnerParticipantId === aId) { a.wins++; b.losses++; }
    else if (m.winnerParticipantId === bId) { b.wins++; a.losses++; }
  });

  const diff = (r) => r.pointsFor - r.pointsAgainst;
  const byWins = new Map();
  [...table.values()].forEach((r) => {
    if (!byWins.has(r.wins)) byWins.set(r.wins, []);
    byWins.get(r.wins).push(r);
  });
  const rows = [];
  [...byWins.keys()].sort((x, y) => y - x).forEach((w) => {
    const tied = byWins.get(w);
    const ids = new Set(tied.map((r) => r.participantId));
    const h2h = new Map(tied.map((r) => [r.participantId, 0]));
    if (tied.length > 1) {
      completed.forEach((m) => {
        const [aId, bId] = m.participantIds;
        if (ids.has(aId) && ids.has(bId) && m.winnerParticipantId && h2h.has(m.winnerParticipantId)) {
          h2h.set(m.winnerParticipantId, h2h.get(m.winnerParticipantId) + 1);
        }
      });
    }
    tied.sort((x, y) => {
      const hx = h2h.get(x.participantId);
      const hy = h2h.get(y.participantId);
      if (hy !== hx) return hy - hx;
      if (diff(y) !== diff(x)) return diff(y) - diff(x);
      if (y.pointsFor !== x.pointsFor) return y.pointsFor - x.pointsFor;
      return x.participantId < y.participantId ? -1 : 1;
    });
    rows.push(...tied);
  });
  rows.forEach((r, i) => { r.rank = i + 1; r.played = r.wins + r.losses; });
  return rows;
}

module.exports = { generateMatches, computeStandings, BYE };
