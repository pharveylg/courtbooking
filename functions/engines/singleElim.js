/* Single Elimination: only round 1 is known upfront. Every later round is
   generated incrementally as its feeder matches complete -- there is no
   bracket doc that "contains" the whole tree; the tree is reconstructed
   from each match's (round, position) and the standard slot order below. */

const { nextPowerOfTwo, seedOrder } = require('./seeding');

const BYE = 'BYE';

/* seeded: array of participants already ranked 1..N (index 0 = seed 1).
   Returns { matches, roundsTotal } for round 1 -- byes are represented as
   an immediately-completed match so a bye and a played match look the same
   shape to everything downstream (advancement, standings, the UI). */
function generateInitialMatches(seeded) {
  const n = seeded.length;
  const size = nextPowerOfTwo(n);
  const roundsTotal = Math.log2(size);
  const order = seedOrder(size); // e.g. [1,8,4,5,2,7,3,6] for size 8
  const slots = order.map((seedNum) => (seedNum <= n ? seeded[seedNum - 1] : null));

  const matches = [];
  for (let i = 0; i < size / 2; i++) {
    const a = slots[i * 2];
    const b = slots[i * 2 + 1];
    if (a && b) {
      matches.push({
        round: 1, position: i,
        participantIds: [a.participantId, b.participantId],
        participantNames: [a.playerNames.join(' & '), b.playerNames.join(' & ')],
        status: 'scheduled',
      });
    } else {
      // Exactly one side is a bye (both-null is impossible once size is the
      // next power of two >= n >= 1) -- auto-advance the real side.
      const real = a || b;
      matches.push({
        round: 1, position: i,
        participantIds: [real.participantId, BYE],
        participantNames: [real.playerNames.join(' & '), 'Bye'],
        status: 'completed',
        winnerParticipantId: real.participantId,
        isBye: true,
      });
    }
  }
  return { matches, roundsTotal };
}

/* Given a match that just completed at (round, position), and the sibling
   match at the same round (position XOR 1, i.e. whichever of the pair of
   matches feeds the same next-round slot), returns the next match
   descriptor if the sibling is also done -- or null if not yet. */
function tryAdvance(completedMatch, siblingMatch, roundsTotal) {
  if (completedMatch.round >= roundsTotal) return null; // was the final
  if (!siblingMatch) return null;
  const siblingDone = ['completed', 'walkover', 'forfeit'].includes(siblingMatch.status);
  if (!siblingDone) return null;

  const winnerThisIdx = completedMatch.participantIds.indexOf(completedMatch.winnerParticipantId);
  const winnerSiblingIdx = siblingMatch.participantIds.indexOf(siblingMatch.winnerParticipantId);
  const nextRound = completedMatch.round + 1;
  const nextPosition = Math.floor(completedMatch.position / 2);
  return {
    round: nextRound, position: nextPosition,
    participantIds: [completedMatch.participantIds[winnerThisIdx], siblingMatch.participantIds[winnerSiblingIdx]],
    participantNames: [completedMatch.participantNames[winnerThisIdx], siblingMatch.participantNames[winnerSiblingIdx]],
    status: 'scheduled',
  };
}
function siblingPosition(position) {
  return position % 2 === 0 ? position + 1 : position - 1;
}

/* At bracket-generation time, the only matches that can already be
   "completed" are byes (nothing has been scored yet). When both feeder
   matches into a next-round slot are byes, that next match is already
   fully determined -- this walks the bracket forward creating every such
   match, so e.g. a bracket with several byes doesn't sit waiting on
   matches that were never going to be played. Returns the full match list
   (input plus any newly-created ones); each new match copies stage/
   divisionId from its feeders. */
function cascadeByes(initialMatches, roundsTotal) {
  const byRound = new Map();
  initialMatches.forEach((m) => {
    if (!byRound.has(m.round)) byRound.set(m.round, new Map());
    byRound.get(m.round).set(m.position, m);
  });
  const created = [...initialMatches];
  for (let round = 1; round < roundsTotal; round++) {
    const thisRound = byRound.get(round);
    if (!thisRound) break;
    const nextRoundMap = byRound.get(round + 1) || new Map();
    const seenNextPositions = new Set();
    for (const [pos, m] of thisRound.entries()) {
      const nextPos = Math.floor(pos / 2);
      if (seenNextPositions.has(nextPos) || nextRoundMap.has(nextPos)) continue;
      seenNextPositions.add(nextPos);
      const sibling = thisRound.get(siblingPosition(pos));
      if (!sibling) continue;
      if (m.status !== 'completed' || sibling.status !== 'completed') continue;
      const winnerThisIdx = m.participantIds.indexOf(m.winnerParticipantId);
      const winnerSibIdx = sibling.participantIds.indexOf(sibling.winnerParticipantId);
      const newMatch = {
        round: round + 1, position: nextPos, stage: m.stage, divisionId: m.divisionId,
        participantIds: [m.participantIds[winnerThisIdx], sibling.participantIds[winnerSibIdx]],
        participantNames: [m.participantNames[winnerThisIdx], sibling.participantNames[winnerSibIdx]],
        status: 'scheduled',
      };
      nextRoundMap.set(nextPos, newMatch);
      created.push(newMatch);
    }
    byRound.set(round + 1, nextRoundMap);
  }
  return created;
}

/* "Standings" for a knockout bracket is really just current status --
   still alive, eliminated, or champion -- ranked by how far each
   participant got. `participants` here is [{participantId, name}]. */
function computeStandings(participants, matches, roundsTotal) {
  const furthestRound = new Map();
  const eliminated = new Set();
  let champion = null;
  matches.forEach((m) => {
    if (!['completed', 'walkover', 'forfeit'].includes(m.status)) return;
    m.participantIds.forEach((pid) => {
      if (pid === BYE) return;
      furthestRound.set(pid, Math.max(furthestRound.get(pid) || 0, m.round));
    });
    const loserId = m.participantIds.find((pid) => pid !== m.winnerParticipantId);
    if (loserId && loserId !== BYE) eliminated.add(loserId);
    if (m.round === roundsTotal) champion = m.winnerParticipantId;
  });
  const rows = participants.map((p) => ({
    participantId: p.participantId,
    name: p.name,
    status: p.participantId === champion ? 'champion' : eliminated.has(p.participantId) ? 'eliminated' : 'alive',
    roundsWon: furthestRound.get(p.participantId) || 0,
  }));
  rows.sort((a, b) => {
    const rank = { champion: 0, alive: 1, eliminated: 2 };
    if (rank[a.status] !== rank[b.status]) return rank[a.status] - rank[b.status];
    return b.roundsWon - a.roundsWon;
  });
  rows.forEach((r, i) => { r.rank = i + 1; });
  return rows;
}

module.exports = { generateInitialMatches, tryAdvance, siblingPosition, cascadeByes, computeStandings, BYE };
