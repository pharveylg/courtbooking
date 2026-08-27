/* Shared seeding helpers used by the single-elimination and group+knockout
   engines. Kept separate from Firestore I/O so the bracket math itself is
   plain, testable JS. */

function nextPowerOfTwo(n) {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

/* Standard tournament-bracket slot order: the recursive construction that
   keeps seed 1 and seed 2 apart until the final (and seed 3/4 apart until
   the semis, etc). seedOrder(8) => [1,8,4,5,2,7,3,6], meaning round-1 pairs
   are (1v8),(4v5),(2v7),(3v6). */
function seedOrder(size) {
  if (size === 1) return [1];
  if (size === 2) return [1, 2];
  const half = seedOrder(size / 2);
  const result = [];
  half.forEach((s) => {
    result.push(s);
    result.push(size + 1 - s);
  });
  return result;
}

/* Ranks participants 1..N per a division's seedingMethod. `participants` is
   an array of {participantId, playerIds, playerNames, dupr (max of the
   team's players, or null), registeredAtSeconds}. Returns a NEW array in
   seeded order (index 0 = seed 1). */
function rankParticipants(participants, seedingMethod) {
  const list = [...participants];
  if (seedingMethod === 'dupr') {
    list.sort((a, b) => {
      const da = a.dupr == null ? -1 : a.dupr;
      const db = b.dupr == null ? -1 : b.dupr;
      return db - da; // highest DUPR first; unrated sorts last
    });
  } else if (seedingMethod === 'random') {
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
  } else {
    // 'manual' -- registration order stands in for director-set seeding
    // until a dedicated re-order UI exists; earliest registration = seed 1.
    list.sort((a, b) => (a.registeredAtSeconds || 0) - (b.registeredAtSeconds || 0));
  }
  return list;
}

module.exports = { nextPowerOfTwo, seedOrder, rankParticipants };
