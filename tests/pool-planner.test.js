/* ================================================================
   Pool planner + standings tests (pure engine code, no Firebase).

   Usage:  node tests/pool-planner.test.js
   ================================================================ */
const path = require('path');
const eng = path.join(__dirname, '..', 'functions', 'engines');
const P = require(path.join(eng, 'poolPlanner'));
const RR = require(path.join(eng, 'roundRobin'));
const { seedOrder, nextPowerOfTwo } = require(path.join(eng, 'seeding'));

let passed = 0, failed = 0;
function check(name, ok, detail) {
  if (ok) { passed++; } else { failed++; console.log(`  FAIL: ${name}${detail ? ' -- ' + detail : ''}`); }
}
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const section = (t) => console.log(`\n${t}`);

/* ---------------- planPools: the spec's examples ---------------- */
section('planPools -- spec examples');
{
  const p24 = P.planPools(24, { strategy: 'size', targetSize: 6 });
  check('24 teams @6 -> 4 pools of 6', eq(p24.poolSizes, [6, 6, 6, 6]));
  check('24 teams @6 -> 60 pool matches', p24.totalMatches === 60);
  check('24 teams @6 -> exact, every team plays 5', p24.exact && p24.minGames === 5 && p24.maxGames === 5);

  const p13 = P.planPools(13, { strategy: 'size', targetSize: 6 });
  check('13 teams @6 -> pools of 7 and 6 (nearest to target)', eq(p13.poolSizes, [7, 6]), JSON.stringify(p13.poolSizes));
  check('13 teams @6 -> teams play 5-6 games, target met', p13.minGames === 5 && p13.maxGames === 6 && p13.meetsTarget);

  const p14 = P.planPools(14, { strategy: 'size', targetSize: 6 });
  check('14 teams @6 -> 7,7', eq(p14.poolSizes, [7, 7]));

  const g = P.planPools(24, { strategy: 'games', targetGames: 5 });
  check('games strategy: 5 games == size 6', eq(g.poolSizes, [6, 6, 6, 6]) && g.targetSize === 6 && g.targetGames === 5);
}

section('planPools -- rules & edge cases');
{
  check('2 teams -> not ok', P.planPools(2, {}).ok === false);
  check('0 teams -> not ok', P.planPools(0, {}).ok === false);
  const p3 = P.planPools(3, { strategy: 'size', targetSize: 6 });
  check('3 teams @6 -> single pool of 3', p3.ok && eq(p3.poolSizes, [3]));
  const p7 = P.planPools(7, { strategy: 'size', targetSize: 3 });
  check('7 teams @3 -> 4+3, never 3+2+2', eq(p7.poolSizes, [4, 3]), JSON.stringify(p7.poolSizes));
  const p12 = P.planPools(12, { strategy: 'size', targetSize: 5 });
  check('12 teams @5: tie between 6,6 and 4,4,4 prefers fewer, larger pools', eq(p12.poolSizes, [6, 6]), JSON.stringify(p12.poolSizes));
  check('odd pool gets a bye round (rounds == size)', P.planPools(5, { strategy: 'size', targetSize: 5 }).roundsPerPool[0] === 5);
  check('even pool rounds == size-1', P.planPools(6, { strategy: 'size', targetSize: 6 }).roundsPerPool[0] === 5);
  check('garbage config falls back to defaults', P.planPools(8, { strategy: 'size', targetSize: 'abc' }).targetSize === 4);
  check('target size clamps to allowed range', P.planPools(30, { strategy: 'size', targetSize: 99 }).targetSize === P.MAX_TARGET_SIZE);
}

section('planPools -- invariants across every field size and target');
{
  let bad = null;
  for (let T = 3; T <= 64 && !bad; T++) {
    for (let S = 3; S <= 10 && !bad; S++) {
      const plan = P.planPools(T, { strategy: 'size', targetSize: S });
      const sizes = plan.poolSizes;
      if (!plan.ok) { bad = `T=${T} S=${S} not ok`; break; }
      if (sizes.reduce((a, b) => a + b, 0) !== T) bad = `T=${T} S=${S} sizes don't sum`;
      else if (Math.min(...sizes) < 3) bad = `T=${T} S=${S} pool < 3: ${sizes}`;
      else if (Math.max(...sizes) - Math.min(...sizes) > 1) bad = `T=${T} S=${S} unbalanced: ${sizes}`;
      else {
        // optimality: no other legal pool count is strictly closer to the target
        const chosen = Math.abs(T / plan.poolCount - S);
        for (let pc = 1; pc <= Math.floor(T / 3); pc++) {
          if (Math.abs(T / pc - S) < chosen - 1e-9) { bad = `T=${T} S=${S}: ${pc} pools is closer than ${plan.poolCount}`; break; }
        }
      }
    }
  }
  check('all sizes sum, >=3, within 1, and nearest to target (T 3..64, S 3..10)', !bad, bad);
}

/* ---------------- planAdvancement ---------------- */
section('planAdvancement');
{
  const a24 = P.planAdvancement([6, 6, 6, 6], null);
  check('4 pools of 6 -> 8 advance, 2 each, no wildcards', a24.count === 8 && eq(a24.perPool, [2, 2, 2, 2]) && a24.wildcards === 0);
  const a13 = P.planAdvancement([7, 6], null);
  check('7+6 (13 teams, 12+) -> 8-team playoff, top 4 from each pool (the spec\'s dual-pool quarterfinals)', a13.count === 8 && eq(a13.perPool, [4, 4]) && a13.wildcards === 0);
  const a11 = P.planAdvancement([6, 5], null);
  check('6+5 (11 teams, under 12) -> 4-team playoff, 2 each', a11.count === 4 && eq(a11.perPool, [2, 2]));
  const a12 = P.planAdvancement([6, 6], null);
  check('12 teams in 2 pools -> 8-team playoff, 4 each', a12.count === 8 && eq(a12.perPool, [4, 4]));
  const s4 = P.planAdvancement([4], null);
  check('single pool of 4 never advances everyone', s4.count === 2 && s4.count < 4);
  const s5 = P.planAdvancement([5], null);
  check('single pool of 5 -> semifinals of 4', s5.count === 4);
  const a18 = P.planAdvancement([6, 6, 6], null);
  check('3 pools of 6 -> 8 = 2 each + 2 wildcards', a18.count === 8 && eq(a18.perPool, [2, 2, 2]) && a18.wildcards === 2 && a18.bracketSize === 8 && a18.byes === 0);
  const big = P.planAdvancement([6, 6], 20);
  check('requesting more than allowed is capped and flagged', big.count === 10 && big.adjusted);
  const low = P.planAdvancement([6, 6, 6], 1);
  check('requesting fewer than one per pool bumps to pool count', low.count === 3);
  const odd = P.planAdvancement([6, 6, 6], 6);
  check('6 of 8-bracket -> 2 byes', odd.count === 6 && odd.bracketSize === 8 && odd.byes === 2);

  let bad = null;
  for (let T = 6; T <= 60 && !bad; T++) {
    const plan = P.planPools(T, { strategy: 'size', targetSize: 5 });
    const adv = P.planAdvancement(plan.poolSizes, null);
    const cap = plan.poolSizes.reduce((a, s) => a + s - 1, 0);
    if (adv.count > cap) bad = `T=${T} advances ${adv.count} > cap ${cap}`;
    else if (adv.count < plan.poolCount) bad = `T=${T} advances fewer than pool winners`;
    else if (adv.perPool.some((k, i) => k >= plan.poolSizes[i])) bad = `T=${T} a pool sends everyone`;
    else if (adv.perPool.reduce((a, b) => a + b, 0) + adv.wildcards !== adv.count) bad = `T=${T} slots don't add up`;
  }
  check('defaults never exceed the cap, always include every pool winner, never send a whole pool (T 6..60)', !bad, bad);
}

/* ---------------- pool assignment (snake) ---------------- */
section('assignPools (snake)');
{
  const seeded = Array.from({ length: 13 }, (_, i) => ({ participantId: 's' + (i + 1) }));
  const pools = P.assignPools(seeded, [5, 4, 4]);
  check('sizes honored', eq(pools.map((p) => p.members.length), [5, 4, 4]));
  check('labels A,B,C', eq(pools.map((p) => p.groupId), ['A', 'B', 'C']));
  const seedNum = (p) => parseInt(p.participantId.slice(1), 10);
  check('snake order: seeds 1,2,3 -> A,B,C then 4,5,6 -> C,B,A',
    pools[0].members[0].participantId === 's1' && pools[1].members[0].participantId === 's2' && pools[2].members[0].participantId === 's3'
    && pools[2].members[1].participantId === 's4' && pools[1].members[1].participantId === 's5' && pools[0].members[1].participantId === 's6');
  const all = pools.flatMap((p) => p.members.map(seedNum)).sort((a, b) => a - b);
  check('every team placed exactly once', eq(all, Array.from({ length: 13 }, (_, i) => i + 1)));
  const strength = pools.map((p) => p.members.reduce((a, m) => a + seedNum(m), 0) / p.members.length);
  check('pool strength is balanced (avg seed within 1.5)', Math.max(...strength) - Math.min(...strength) < 1.5, JSON.stringify(strength));
}

/* ---------------- standings: head-to-head ---------------- */
section('computeStandings -- head-to-head tiebreak');
{
  const ppl = ['A', 'B', 'C', 'D'].map((id) => ({ participantId: id, name: id }));
  const m = (a, b, sa, sb) => ({ status: 'completed', participantIds: [a, b], score: { a: sa, b: sb }, winnerParticipantId: sa > sb ? a : b });

  // A and B both finish 2-1; B beat A, but A has the far better point diff.
  const t1 = RR.computeStandings(ppl, [
    m('A', 'B', 5, 11), m('A', 'C', 11, 0), m('A', 'D', 11, 0),
    m('B', 'C', 11, 9), m('B', 'D', 9, 11), m('C', 'D', 11, 9),
  ]);
  const order1 = t1.map((r) => r.participantId);
  check('2-way tie on wins: head-to-head winner ranks first despite worse diff', order1.indexOf('B') < order1.indexOf('A'), order1.join(''));
  check('rows carry played count', t1.every((r) => r.played === 3));

  // 3-way cycle A>B, B>C, C>A (each 1-1 vs each other) -> falls to point diff.
  const t2 = RR.computeStandings(ppl.slice(0, 3), [m('A', 'B', 11, 9), m('B', 'C', 11, 5), m('C', 'A', 11, 10)]);
  // A: 1 win diff (+2 -1 = +1); B: 1 win diff (-2 +6 = +4); C: 1 win diff (-6 +1 = -5)
  check('3-way cycle falls through to point differential', eq(t2.map((r) => r.participantId), ['B', 'A', 'C']), t2.map((r) => r.participantId).join(''));

  const t3 = RR.computeStandings(ppl.slice(0, 2), []);
  check('no matches yet: stable deterministic order, ranks assigned', t3.length === 2 && t3[0].rank === 1 && t3[1].rank === 2);
}

/* ---------------- qualifiers & seeding ---------------- */
function mkTable(groupId, results) { // results: array of [wins, losses, pf, pa] best-first
  return {
    groupId,
    table: results.map(([w, l, pf, pa], i) => ({ participantId: `${groupId}${i + 1}`, name: `${groupId}${i + 1}`, wins: w, losses: l, pointsFor: pf, pointsAgainst: pa, rank: i + 1 })),
  };
}
function round1Pairs(seeded) {
  const n = seeded.length;
  const order = seedOrder(nextPowerOfTwo(n));
  const out = [];
  for (let i = 0; i < order.length; i += 2) {
    const a = order[i] - 1, b = order[i + 1] - 1;
    if (a < n && b < n) out.push([seeded[a], seeded[b]]);
  }
  return out;
}
const sameIds = (pairs) => pairs.map(([a, b]) => `${a.row.participantId}v${b.row.participantId}`).sort();

section('selectQualifiers / separatePoolRematches');
{
  // Spec: dual pool, top 4 each -> A1vB4, B1vA4, A2vB3, B2vA3.
  const A = mkTable('A', [[4, 0, 44, 20], [3, 1, 40, 30], [2, 2, 35, 35], [1, 3, 25, 40], [0, 4, 15, 45]]);
  const B = mkTable('B', [[4, 0, 43, 21], [3, 1, 39, 31], [2, 2, 34, 36], [1, 3, 24, 41], [0, 4, 14, 46]]);
  const plan = P.planAdvancement([5, 5], 8);
  const q = P.selectQualifiers([A, B], plan);
  check('dual pool: 8 qualifiers, A1 seeded first (better record)', q.length === 8 && q[0].row.participantId === 'A1' && q[1].row.participantId === 'B1');
  P.separatePoolRematches(q);
  check('dual pool cross-seeding matches the spec exactly',
    eq(sameIds(round1Pairs(q)), ['A1vB4', 'A2vB3', 'B1vA4', 'B2vA3'].sort()), sameIds(round1Pairs(q)).join(','));

  // 3 pools of different sizes, 2 each + 2 wildcards: best 3rd places win the wildcards by win%, not raw wins.
  const C1 = mkTable('A', [[4, 0, 44, 20], [3, 1, 40, 30], [1, 3, 30, 40], [1, 3, 20, 44], [0, 4, 10, 44]]); // 5 teams, 3rd = 1-3 (25%)
  const C2 = mkTable('B', [[3, 0, 33, 15], [2, 1, 30, 25], [1, 2, 22, 30], [0, 3, 10, 33]]);                // 4 teams, 3rd = 1-2 (33%)
  const C3 = mkTable('C', [[3, 0, 33, 12], [2, 1, 28, 24], [0, 3, 12, 33], [0, 3, 10, 33]]);                // 4 teams, 3rd = 0-3 (0%)
  const plan3 = P.planAdvancement([5, 4, 4], 8);
  check('3 pools -> 2 each + 2 wildcards', eq(plan3.perPool, [2, 2, 2]) && plan3.wildcards === 2, JSON.stringify(plan3));
  const q3 = P.selectQualifiers([C1, C2, C3], plan3);
  const wild = q3.filter((x) => x.place === 3).map((x) => x.row.participantId).sort();
  check('wildcards are the two best 3rd places by win% (B3 33%, A3 25%), not C3', eq(wild, ['A3', 'B3']), wild.join(','));
  check('all 8 distinct', new Set(q3.map((x) => x.row.participantId)).size === 8);

  // Constructed clash: a plain seed order pairs two same-pool teams in round 1; the swap must resolve it.
  const mk = (groupId, place, id, w) => ({ groupId, place, row: { participantId: id, name: id, wins: w, losses: 0, pointsFor: 10, pointsAgainst: 5 } });
  const seeded = [mk('A', 1, 'A1', 9), mk('B', 1, 'B1', 8), mk('C', 1, 'C1', 7), mk('D', 1, 'D1', 6),
                  mk('A', 2, 'A2', 5), mk('B', 2, 'B2', 4), mk('C', 2, 'C2', 3), mk('D', 2, 'D2', 2)];
  // standard order pairs seed 4 (D1) with seed 5 (A2); seed1 A1 v seed8 D2; 2v7 B1 v C2; 3v6 C1 v B2 -> already clean.
  const clean = round1Pairs(seeded).every(([a, b]) => a.groupId !== b.groupId);
  check('baseline 4 pools top 2 is already rematch-free', clean);
  const dirty = [mk('A', 1, 'A1', 9), mk('B', 1, 'B1', 8), mk('C', 1, 'C1', 7), mk('D', 1, 'D1', 6),
                 mk('B', 2, 'B2', 5), mk('A', 2, 'A2', 4), mk('D', 2, 'D2', 3), mk('C', 2, 'C2', 2)];
  // seed1 A1 v seed8 C2 ok; 4v5 D1 v B2 ok; 2v7 B1 v D2 ok; 3v6 C1 v A2 ok -> use a genuinely dirty layout:
  const dirty2 = [mk('A', 1, 'A1', 9), mk('B', 1, 'B1', 8), mk('C', 1, 'C1', 7), mk('D', 1, 'D1', 6),
                  mk('A', 2, 'A2', 5), mk('B', 2, 'B2', 4), mk('C', 2, 'C2', 3), mk('D', 2, 'D2', 2)];
  dirty2[7] = mk('A', 2, 'A2b', 2); // seed 8 is another Pool A team: seed1 A1 vs seed8 A2b is a rematch
  const before = round1Pairs(dirty2).filter(([a, b]) => a.groupId === b.groupId).length;
  P.separatePoolRematches(dirty2);
  const after = round1Pairs(dirty2).filter(([a, b]) => a.groupId === b.groupId).length;
  check('constructed same-pool clash is detected then resolved by a same-place swap', before === 1 && after === 0, `${before} -> ${after}`);
  check('swap keeps every finishing place in its seed slot', eq(dirty2.map((x) => x.place), [1, 1, 1, 1, 2, 2, 2, 2]));
}

section('selectQualifiers / separatePoolRematches -- property test');
{
  let seedRand = 12345;
  const rnd = () => { seedRand = (seedRand * 1103515245 + 12345) & 0x7fffffff; return seedRand / 0x7fffffff; };
  let bad = null, trials = 0;
  for (let t = 0; t < 400 && !bad; t++) {
    const pools = 2 + Math.floor(rnd() * 5);
    const sizes = Array.from({ length: pools }, () => 4 + Math.floor(rnd() * 3));
    const groups = sizes.map((s, gi) => {
      const rows = Array.from({ length: s }, () => { const w = Math.floor(rnd() * s); return [w, s - 1 - w, 20 + Math.floor(rnd() * 30), 20 + Math.floor(rnd() * 30)]; });
      rows.sort((a, b) => b[0] - a[0]);
      return mkTable(String.fromCharCode(65 + gi), rows);
    });
    const plan = P.planAdvancement(sizes, null);
    const q = P.selectQualifiers(groups, plan);
    trials++;
    if (q.length !== plan.count) { bad = `count ${q.length} != ${plan.count}`; break; }
    if (new Set(q.map((x) => x.row.participantId)).size !== q.length) { bad = 'duplicate qualifier'; break; }
    const placesBefore = q.map((x) => x.place);
    const clashBefore = round1Pairs(q).filter(([a, b]) => a.groupId === b.groupId).length;
    P.separatePoolRematches(q);
    const clashAfter = round1Pairs(q).filter(([a, b]) => a.groupId === b.groupId).length;
    if (!eq(placesBefore, q.map((x) => x.place))) bad = 'swap moved a team across finishing places';
    else if (clashAfter > clashBefore) bad = `rematches increased ${clashBefore} -> ${clashAfter}`;
    else if (placesBefore.some((p, i) => i > 0 && p < placesBefore[i - 1])) bad = 'seeds not ordered by finishing place';
  }
  check(`${trials} random tournaments: right count, no duplicates, places preserved, rematches never increase`, !bad, bad);
}

/* ---------------- describePlan copy ---------------- */
section('describePlan (organizer-facing copy)');
{
  const p24 = P.planPools(24, { strategy: 'size', targetSize: 6 });
  const t24 = P.describePlan(p24, P.planAdvancement(p24.poolSizes, null));
  check('24 teams: success message names 4 pools of 6 and 60 matches', t24[0].level === 'success' && /4 pools of 6/.test(t24[0].text) && /60 pool matches/.test(t24[0].text), t24[0].text);
  check('24 teams: playoff message mentions quarterfinals', t24.some((m) => /quarterfinals/.test(m.text)));

  const p13 = P.planPools(13, { strategy: 'size', targetSize: 6 });
  const t13 = P.describePlan(p13, P.planAdvancement(p13.poolSizes, null));
  check('13 teams: explains 7 and 6 with a 5-6 game range', /pools of 7, 6/.test(t13[0].text) && /5–6 games/.test(t13[0].text), t13[0].text);
  check('13 teams: notes larger pools and the per-game comparison', t13.some((m) => /larger than the target/.test(m.text)) && t13.some((m) => /per game/.test(m.text)));

  const p9 = P.planPools(9, { strategy: 'size', targetSize: 6 });
  const t9 = P.describePlan(p9, null);
  check('9 teams @6: warns the target games cannot be reached', t9.some((m) => m.level === 'warning' && /fewer than 5 games/.test(m.text)), JSON.stringify(t9));

  const t2 = P.describePlan(P.planPools(2, {}), null);
  check('2 teams: error message', t2[0].level === 'error');
}

console.log(`\n=== POOL PLANNER TESTS: ${passed}/${passed + failed} passed ===`);
process.exit(failed === 0 ? 0 : 1);
