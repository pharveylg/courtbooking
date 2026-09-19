/* Pool-play planning: how many pools, how big, who advances, and how the
   qualifiers are seeded into the playoff bracket. Pure functions only (no
   Firestore), so the bracket math is unit-testable and the preview callable
   and the real generator can never disagree.

   Rules, in priority order (an earlier rule always wins a conflict):
     1. No pool smaller than MIN_POOL_SIZE (3) -- a 2-team "pool" is just a
        single match and gives no standings to seed from.
     2. Pool sizes differ by at most 1, so no pool is stranded with a
        fraction of the games another pool plays.
     3. Sizes land as close to the organizer's target as rules 1-2 allow.
   "Target games" is therefore a target, not a guarantee: 13 teams at
   target 6 become pools of 7 and 6, so teams play 6 or 5 games. */

const { nextPowerOfTwo, seedOrder } = require('./seeding');

const MIN_POOL_SIZE = 3;
const MAX_TARGET_SIZE = 12;
const DEFAULT_TARGET_SIZE = 4;
const POOL_LABELS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

function poolLabel(i) { return POOL_LABELS[i] || `P${i + 1}`; }

function clampInt(v, lo, hi, fallback) {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(hi, Math.max(lo, n));
}
function floorPowerOfTwo(n) {
  let p = 1;
  while (p * 2 <= n) p *= 2;
  return p;
}
const sum = (arr) => arr.reduce((a, b) => a + b, 0);

/* config: { strategy: 'size'|'games', targetSize?, targetGames? }.
   A pool of S teams plays S-1 games each (single round robin), so
   targetGames G and targetSize S are the same dial: S = G + 1. */
function resolveTarget(config) {
  const cfg = config || {};
  if (cfg.strategy === 'games') {
    const games = clampInt(cfg.targetGames, MIN_POOL_SIZE - 1, MAX_TARGET_SIZE - 1, DEFAULT_TARGET_SIZE - 1);
    return { strategy: 'games', targetGames: games, targetSize: games + 1 };
  }
  const size = clampInt(cfg.targetSize, MIN_POOL_SIZE, MAX_TARGET_SIZE, DEFAULT_TARGET_SIZE);
  return { strategy: 'size', targetSize: size, targetGames: size - 1 };
}

/* total teams over `pools` pools, sizes differing by at most 1; the larger
   pools come first (Pool A gets the extra team). */
function balancedSizes(total, pools) {
  const base = Math.floor(total / pools);
  const extra = total % pools;
  return Array.from({ length: pools }, (_, i) => base + (i < extra ? 1 : 0));
}

function planPools(teamCount, config) {
  const target = resolveTarget(config);
  const teams = Math.max(0, Math.floor(Number(teamCount)) || 0);
  const plan = { ...target, teamCount: teams };

  if (teams < MIN_POOL_SIZE) {
    return { ...plan, ok: false, poolCount: 0, poolSizes: [], poolLabels: [],
      reason: `Pool play needs at least ${MIN_POOL_SIZE} teams (have ${teams}). Use Round Robin or Single Elimination for a field this small.` };
  }

  // Nearest average pool size to the target; on a tie prefer FEWER, larger
  // pools (more games per team).
  const maxPools = Math.floor(teams / MIN_POOL_SIZE);
  let poolCount = 1;
  let bestDist = Infinity;
  for (let p = 1; p <= maxPools; p++) {
    const dist = Math.abs(teams / p - target.targetSize);
    if (dist < bestDist - 1e-9) { bestDist = dist; poolCount = p; }
  }

  const poolSizes = balancedSizes(teams, poolCount);
  const matchesPerPool = poolSizes.map((s) => (s * (s - 1)) / 2);
  const minGames = Math.min(...poolSizes) - 1;
  const maxGames = Math.max(...poolSizes) - 1;
  return {
    ...plan, ok: true, poolCount, poolSizes,
    poolLabels: poolSizes.map((_, i) => poolLabel(i)),
    matchesPerPool, totalMatches: sum(matchesPerPool),
    // An odd-sized pool needs a bye slot in the circle method, so it takes
    // as many rounds as it has teams; an even one takes size-1.
    roundsPerPool: poolSizes.map((s) => (s % 2 ? s : s - 1)),
    minGames, maxGames,
    exact: poolSizes.every((s) => s === target.targetSize),
    meetsTarget: minGames >= target.targetGames,
  };
}

/* ---------- Advancement ---------- */

// Eliminate roughly half a mid-size field: an 8-team playoff from 12+
// teams, a 4-team one below that.
function defaultAdvanceCount(teamCount) { return teamCount >= 12 ? 8 : 4; }

/* poolSizes: from planPools. requested: organizer's "teams advancing" or
   null/'' for the default. Every pool sends its winner; no pool ever sends
   everyone (at least one team per pool is eliminated, or pool play would be
   a formality). Spots that don't divide evenly across pools become
   `wildcards`, filled at advance time from the best next-place finishers. */
function planAdvancement(poolSizes, requested) {
  const pools = poolSizes.length;
  const teams = sum(poolSizes);
  const cap = sum(poolSizes.map((s) => s - 1));
  const auto = requested == null || requested === '' || !Number.isFinite(Number(requested));

  let count;
  if (auto) {
    count = defaultAdvanceCount(teams);
    if (count < pools) count = nextPowerOfTwo(pools);
    if (count > cap) count = floorPowerOfTwo(cap);
  } else {
    count = Math.round(Number(requested));
  }
  const before = count;
  count = Math.min(cap, Math.max(pools, count, 2));

  const base = Math.floor(count / pools);
  const perPool = poolSizes.map((s) => Math.min(base, s - 1));
  const wildcards = count - sum(perPool);
  const bracketSize = nextPowerOfTwo(count);
  return {
    count, perPool, wildcards, cap, bracketSize, byes: bracketSize - count,
    adjusted: !auto && count !== before,
    auto,
  };
}

/* ---------- Qualifier selection & seeding ---------- */

/* Pools of different sizes play different numbers of games, so cross-pool
   comparisons (wildcards, seed order within a finishing place) use rates,
   not raw wins. */
function record(row) {
  const played = (row.wins || 0) + (row.losses || 0);
  return {
    winPct: played ? row.wins / played : 0,
    diffPer: played ? ((row.pointsFor || 0) - (row.pointsAgainst || 0)) / played : 0,
    pfPer: played ? (row.pointsFor || 0) / played : 0,
  };
}
function compareQualifiers(x, y) {
  const a = record(x.row);
  const b = record(y.row);
  if (b.winPct !== a.winPct) return b.winPct - a.winPct;
  if (b.diffPer !== a.diffPer) return b.diffPer - a.diffPer;
  if (b.pfPer !== a.pfPer) return b.pfPer - a.pfPer;
  if (x.groupId !== y.groupId) return x.groupId < y.groupId ? -1 : 1;
  return x.row.participantId < y.row.participantId ? -1 : 1;
}

/* groups: [{ groupId, table }] where table is that pool's ranked standings
   (row.participantId/name/wins/losses/pointsFor/pointsAgainst). plan is
   planAdvancement()'s result. Returns qualifiers in seed order:
   [{ groupId, place, row }], strongest first. */
function selectQualifiers(groups, plan) {
  const picked = [];
  const taken = new Map();
  groups.forEach((g, i) => {
    const direct = Math.min(plan.perPool[i], g.table.length);
    for (let place = 1; place <= direct; place++) picked.push({ groupId: g.groupId, place, row: g.table[place - 1] });
    taken.set(g.groupId, direct);
  });

  // Wildcards: best remaining finisher from the LOWEST available finishing
  // place -- never a 4th-place team ahead of a 3rd-place one.
  let left = plan.wildcards;
  while (left > 0) {
    const candidates = [];
    groups.forEach((g) => {
      const place = taken.get(g.groupId) + 1;
      if (place <= g.table.length - 1) candidates.push({ groupId: g.groupId, place, row: g.table[place - 1] });
    });
    if (!candidates.length) break;
    const lowest = Math.min(...candidates.map((c) => c.place));
    const best = candidates.filter((c) => c.place === lowest).sort(compareQualifiers)[0];
    picked.push(best);
    taken.set(best.groupId, best.place);
    left--;
  }

  return picked.sort((x, y) => (x.place - y.place) || compareQualifiers(x, y));
}

/* Standard bracket order (1v8, 4v5, 2v7, 3v6 ...) can still pair two teams
   from the same pool in round 1 once there are 3+ pools or wildcards. Swap
   such a team with another of the SAME finishing place elsewhere in the
   bracket, only when that leaves both affected pairings free of same-pool
   rematches. Never moves a team across finishing places, so seeding
   strength is preserved. Mutates and returns `seeded`. */
function separatePoolRematches(seeded) {
  const n = seeded.length;
  if (n < 4) return seeded;
  const size = nextPowerOfTwo(n);
  const order = seedOrder(size);
  const pairs = [];
  for (let i = 0; i < size; i += 2) {
    const a = order[i] - 1;
    const b = order[i + 1] - 1;
    if (a < n && b < n) pairs.push([a, b]);
  }
  const partnerOf = (idx) => {
    const pr = pairs.find((p) => p[0] === idx || p[1] === idx);
    return pr ? (pr[0] === idx ? pr[1] : pr[0]) : null;
  };
  const clash = (i, j) => i != null && j != null && seeded[i].groupId === seeded[j].groupId;

  for (let pass = 0; pass < 20; pass++) {
    let changed = false;
    for (const [a, b] of pairs) {
      if (!clash(a, b)) continue;
      // try moving b, then a
      for (const mover of [b, a]) {
        const stay = mover === b ? a : b;
        const moverPlace = seeded[mover].place;
        let swapped = false;
        for (let c = 0; c < n && !swapped; c++) {
          if (c === mover || c === stay || seeded[c].place !== moverPlace) continue;
          const cPartner = partnerOf(c);
          if (cPartner == null || cPartner === mover) continue;
          // after swap: stay meets c; mover meets cPartner
          if (seeded[stay].groupId === seeded[c].groupId) continue;
          if (seeded[mover].groupId === seeded[cPartner].groupId) continue;
          [seeded[mover], seeded[c]] = [seeded[c], seeded[mover]];
          swapped = true;
          changed = true;
        }
        if (swapped) break;
      }
    }
    if (!changed) break;
  }
  return seeded;
}

/* ---------- Pool assignment ---------- */

/* Snake-deal seeded teams into pools of the given sizes (1..P across, then
   P..1 back), skipping pools that are already full. The comment on the old
   dealer said "snake" but it dealt straight across, which quietly made
   Pool A stronger than the last pool. */
function assignPools(seeded, sizes) {
  const pools = sizes.map(() => []);
  const P = sizes.length;
  const poolAt = (k) => { const cycle = Math.floor(k / P); const i = k % P; return cycle % 2 === 0 ? i : P - 1 - i; };
  let pos = 0;
  seeded.forEach((team) => {
    while (pools[poolAt(pos)].length >= sizes[poolAt(pos)]) pos++;
    pools[poolAt(pos)].push(team);
    pos++;
  });
  return pools.map((members, i) => ({ groupId: poolLabel(i), members }));
}

/* ---------- Plain-English preview for the organizer ---------- */

function roundName(bracketSize) {
  return { 2: 'a final', 4: 'semifinals', 8: 'quarterfinals', 16: 'a round of 16' }[bracketSize] || `a ${bracketSize}-team bracket`;
}

/* [{ level: 'success'|'info'|'warning'|'error', text }] */
function describePlan(pools, adv) {
  const out = [];
  if (!pools.ok) { out.push({ level: 'error', text: pools.reason }); return out; }
  const n = pools.teamCount;
  const sizesTxt = pools.poolSizes.join(', ');
  if (pools.exact) {
    out.push({ level: 'success', text: `Balanced pools: ${n} teams divide evenly into ${pools.poolCount} pool${pools.poolCount > 1 ? 's' : ''} of ${pools.poolSizes[0]}. Every team plays ${pools.minGames} games in pool play (${pools.totalMatches} pool matches).` });
  } else {
    const games = pools.minGames === pools.maxGames ? `${pools.minGames}` : `${pools.minGames}–${pools.maxGames}`;
    out.push({ level: pools.meetsTarget ? 'success' : 'warning', text: `${n} teams become ${pools.poolCount} pool${pools.poolCount > 1 ? 's' : ''} of ${sizesTxt}. Teams play ${games} games in pool play (target ${pools.targetGames}); ${pools.totalMatches} pool matches in total.` });
    if (!pools.meetsTarget) out.push({ level: 'warning', text: `Some teams will play fewer than ${pools.targetGames} games because there aren't enough teams to reach the target while keeping every pool at 3+ teams. Add teams, or lower the target.` });
    if (pools.maxGames > pools.targetGames) out.push({ level: 'info', text: `Some pools are larger than the target so that no pool has fewer than ${MIN_POOL_SIZE} teams and pool sizes stay within 1 team of each other.` });
    if (pools.minGames !== pools.maxGames) out.push({ level: 'info', text: 'Larger pools play one more game per team, so wildcard and cross-pool seeding compare win % and point difference per game rather than raw wins.' });
  }
  if (adv) {
    const perPoolTxt = adv.wildcards
      ? `${adv.perPool.reduce((a, b) => Math.max(a, b), 0)} per pool plus ${adv.wildcards} wildcard${adv.wildcards > 1 ? 's' : ''} (best next-place finishers)`
      : `${adv.perPool[0]} per pool`;
    out.push({ level: 'info', text: `Playoffs: ${adv.count} teams advance (${perPoolTxt}) into ${roundName(adv.bracketSize)}${adv.byes ? `, with ${adv.byes} first-round bye${adv.byes > 1 ? 's' : ''} for the top seeds` : ''}. Pool winners are cross-seeded against other pools' lower finishers, and same-pool rematches are avoided in round 1 where possible.` });
    if (adv.adjusted) out.push({ level: 'warning', text: `Advancing count was adjusted to ${adv.count} (at least one team per pool is always eliminated, and every pool sends its winner).` });
  }
  return out;
}

module.exports = {
  MIN_POOL_SIZE, MAX_TARGET_SIZE, DEFAULT_TARGET_SIZE,
  poolLabel, resolveTarget, balancedSizes, planPools,
  defaultAdvanceCount, planAdvancement,
  record, compareQualifiers, selectQualifiers, separatePoolRematches,
  assignPools, describePlan,
};
