/* Group Stage -> Knockout: participants split into groups that each run an
   internal Round Robin (stage: 'group'), then the top N per group seed into
   a Single Elimination bracket (stage: 'knockout'). The knockout half can't
   be generated until every group match is done, so it's a separate,
   explicitly-triggered step (advanceToKnockout in index.js) rather than
   something this module decides on its own. */

const roundRobin = require('./roundRobin');
const singleElim = require('./singleElim');

const GROUP_LABELS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

/* Snake-deal seeded participants into `groupCount` groups so each group
   gets a spread of seed strength (group A: seeds 1, 2*g+1, ...; not just
   the top N in one group). seeded is already ranked 1..N. */
function assignGroups(seeded, groupSize) {
  const groupCount = Math.max(1, Math.ceil(seeded.length / groupSize));
  const groups = Array.from({ length: groupCount }, () => []);
  seeded.forEach((p, i) => { groups[i % groupCount].push(p); });
  return groups.map((members, i) => ({ groupId: GROUP_LABELS[i], members }));
}

/* Returns { matches, groups } for the group stage. Each match carries a
   `groupId` in addition to round/position (round/position are scoped to
   that group's own round robin, not the whole division). */
function generateGroupStageMatches(seeded, groupSize) {
  const groups = assignGroups(seeded, groupSize);
  const matches = [];
  groups.forEach(({ groupId, members }) => {
    roundRobin.generateMatches(members).forEach((m) => {
      matches.push({ ...m, groupId, stage: 'group' });
    });
  });
  return { matches, groups };
}

/* Round robin inside each already-assigned pool (see poolPlanner.assignPools).
   Pools may differ in size by one, so match counts differ per pool. */
function generateMatchesForPools(pools) {
  const matches = [];
  pools.forEach(({ groupId, members }) => {
    roundRobin.generateMatches(members).forEach((m) => {
      matches.push({ ...m, groupId, stage: 'group' });
    });
  });
  return matches;
}

/* Given every completed group-stage match and the group assignments, ranks
   each group internally (reusing Round Robin's win/loss/differential
   table) and returns the participants who advance, in knockout-seed order:
   all group winners first (ordered by group label), then all runners-up,
   and so on -- so the strongest group finishers meet the latest. */
function selectAdvancers(groups, allGroupMatches, advancePerGroup) {
  const byGroupStandings = groups.map(({ groupId, members }) => {
    const groupMatches = allGroupMatches.filter((m) => m.groupId === groupId);
    const namedMembers = members.map((m) => ({ participantId: m.participantId, name: m.playerNames.join(' & ') }));
    const standings = roundRobin.computeStandings(namedMembers, groupMatches);
    return { groupId, standings, members };
  });
  const advancers = [];
  for (let place = 0; place < advancePerGroup; place++) {
    byGroupStandings.forEach(({ standings, members }) => {
      const row = standings[place];
      if (!row) return;
      const participant = members.find((m) => m.participantId === row.participantId);
      if (participant) advancers.push(participant);
    });
  }
  return advancers;
}

module.exports = { assignGroups, generateGroupStageMatches, generateMatchesForPools, selectAdvancers, GROUP_LABELS };
