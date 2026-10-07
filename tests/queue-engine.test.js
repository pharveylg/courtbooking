/* Queue rotation engine tests.  Usage: node tests/queue-engine.test.js */
const Q = require('../queue-engine.js');

let passed = 0, failed = 0;
function check(name, ok, detail) { if (ok) passed++; else { failed++; console.log(`  FAIL: ${name}${detail ? ' -- ' + detail : ''}`); } }
const section = (t) => console.log(`\n${t}`);
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const solo = (...names) => names.map((n) => ({ id: 'w_' + n, names: [n] }));

const base = (rule, mode, waiting) => ({
  mode, rule, waiting: waiting || [], activeMatch: null, matches: [], teams: {}, playCounts: {},
});

section('checkAndFillActiveMatch: pure rules');
check('winner stays doubles: fills from the front when exactly enough', (() => {
  const s = base('winner_stays', 'doubles', solo('a', 'b', 'c', 'd'));
  Q.checkAndFillActiveMatch(s);
  return eq(s.activeMatch.teamA, ['a', 'b']) && eq(s.activeMatch.teamB, ['c', 'd']) && s.waiting.length === 0;
})());
check('winner stays singles: needs only two', (() => {
  const s = base('winner_stays', 'singles', solo('a', 'b'));
  Q.checkAndFillActiveMatch(s);
  return eq(s.activeMatch.teamA, ['a']) && eq(s.activeMatch.teamB, ['b']);
})());
check('not enough waiting: no match forms', (() => {
  const s = base('winner_stays', 'doubles', solo('a', 'b', 'c'));
  Q.checkAndFillActiveMatch(s);
  return s.activeMatch === null && s.waiting.length === 3;
})());
check('a match already running is left alone', (() => {
  const s = base('winner_stays', 'doubles', solo('a', 'b', 'c', 'd'));
  s.activeMatch = { teamA: ['x'], teamB: ['y'] };
  Q.checkAndFillActiveMatch(s);
  return eq(s.activeMatch, { teamA: ['x'], teamB: ['y'] }) && s.waiting.length === 4;
})());
check('fixed pairs: pulls two teams strictly FIFO, no rest priority', (() => {
  const s = base('fixed_pairs', 'doubles', [{ id: 'T1', names: ['a', 'b'] }, { id: 'T2', names: ['c', 'd'] }, { id: 'T3', names: ['e', 'f'] }]);
  Q.checkAndFillActiveMatch(s);
  return s.activeMatch.teamAId === 'T1' && s.activeMatch.teamBId === 'T2' && s.waiting.length === 1 && s.teams.T1 && s.teams.T2;
})());
check('fixed rotation: fills from four individuals, splits in half', (() => {
  const s = base('fixed_rotation', 'doubles', solo('a', 'b', 'c', 'd'));
  Q.checkAndFillActiveMatch(s);
  return eq(s.activeMatch.teamA, ['a', 'b']) && eq(s.activeMatch.teamB, ['c', 'd']);
})());
check('partner rotation: pulls four and starts round 1', (() => {
  const s = base('partner_rotation', 'doubles', solo('a', 'b', 'c', 'd'));
  Q.checkAndFillActiveMatch(s);
  return eq(s.activeMatch.teamA, ['a', 'b']) && eq(s.activeMatch.teamB, ['c', 'd']) && s.partnerRotationState.round === 1 && eq(s.partnerRotationState.players, ['a', 'b', 'c', 'd']);
})());

section('rest priority: shared across every rule except fixed pairs');
['winner_stays', 'four_off_four_on', 'fixed_rotation', 'timed_rotation'].forEach((rule) => {
  check(`${rule}: an uneven doubles queue fills by fewest games played`, (() => {
    const s = base(rule, 'doubles', solo('a', 'b', 'c', 'd', 'e'));
    s.playCounts = { a: 3 };
    Q.checkAndFillActiveMatch(s);
    const onCourt = [...s.activeMatch.teamA, ...s.activeMatch.teamB];
    return !onCourt.includes('a') && s.waiting.length === 1 && s.waiting[0].names[0] === 'a';
  })());
});
check('fixed pairs ignores play counts entirely (teams rotate FIFO)', (() => {
  const s = base('fixed_pairs', 'doubles', [{ id: 'T1', names: ['a', 'b'] }, { id: 'T2', names: ['c', 'd'] }]);
  s.playCounts = { a: 99 };
  Q.checkAndFillActiveMatch(s);
  return s.activeMatch.teamAId === 'T1';
})());

section('recordMatchResult: validation');
check('refuses when there is no active match', !!Q.recordMatchResult(base('winner_stays', 'doubles'), 11, 4).error);
check('refuses a blank score', !!Q.recordMatchResult({ ...base('winner_stays', 'doubles'), activeMatch: { teamA: ['a'], teamB: ['b'] } }, '', 4).error);
check('refuses a non-numeric or negative score', (() => {
  const s = { ...base('winner_stays', 'doubles'), activeMatch: { teamA: ['a'], teamB: ['b'] } };
  return !!Q.recordMatchResult(s, 'x', 4).error && !!Q.recordMatchResult(s, -1, 4).error;
})());
check('refuses a tie', !!Q.recordMatchResult({ ...base('winner_stays', 'doubles'), activeMatch: { teamA: ['a'], teamB: ['b'] } }, 7, 7).error);

section('recordMatchResult: winner stays');
check('winner stays on as team A, loser to the back, next challenger pulled', (() => {
  const s = base('winner_stays', 'singles', solo('c'));
  s.activeMatch = { teamA: ['a'], teamB: ['b'] };
  const r = Q.recordMatchResult(s, 11, 4);
  return !r.error && r.winner === 'teamA' && eq(s.activeMatch, { id: s.activeMatch.id, teamA: ['a'], teamB: ['c'] }) && s.waiting.length === 1 && s.waiting[0].names[0] === 'b' && s.matches.length === 1;
})());
check('winner stays with nobody else queued: the loser immediately re-challenges', (() => {
  // Matches the original behavior: the loser joins the back of an otherwise
  // empty line, and the queue is immediately refilled from that same line.
  const s = base('winner_stays', 'singles', []);
  s.activeMatch = { teamA: ['a'], teamB: ['b'] };
  const r = Q.recordMatchResult(s, 11, 4);
  return !r.error && s.waiting.length === 0 && eq(s.activeMatch.teamA, ['a']) && eq(s.activeMatch.teamB, ['b']);
})());

section('recordMatchResult: partner rotation, three rounds then re-queue');
check('round 1 to round 2, new partners', (() => {
  const s = base('partner_rotation', 'doubles');
  s.activeMatch = { teamA: ['a', 'b'], teamB: ['c', 'd'] };
  s.partnerRotationState = { players: ['a', 'b', 'c', 'd'], round: 1 };
  const r = Q.recordMatchResult(s, 11, 4);
  return !r.error && s.partnerRotationState.round === 2 && eq(s.activeMatch.teamA, ['a', 'c']) && eq(s.activeMatch.teamB, ['b', 'd']) && /Round 1 finished/.test(r.notices[0]);
})());
check('round 3 finished: all four re-queue as individuals, and the next rotation starts from whoever is rested', (() => {
  const s = base('partner_rotation', 'doubles', solo('e', 'f', 'g', 'h'));
  s.activeMatch = { teamA: ['a', 'd'], teamB: ['b', 'c'] };
  s.partnerRotationState = { players: ['a', 'b', 'c', 'd'], round: 3 };
  const r = Q.recordMatchResult(s, 11, 4);
  return !r.error && /complete/.test(r.notices[0]) && eq(s.partnerRotationState.players, ['e', 'f', 'g', 'h']) && eq(s.waiting.map((w) => w.names[0]), ['a', 'b', 'c', 'd']);
})());
check('round 3 finished: session.lastPartnerGroup records who just played', (() => {
  const s = base('partner_rotation', 'doubles', solo('e', 'f', 'g', 'h'));
  s.activeMatch = { teamA: ['a', 'd'], teamB: ['b', 'c'] };
  s.partnerRotationState = { players: ['a', 'b', 'c', 'd'], round: 3 };
  Q.recordMatchResult(s, 11, 4);
  return eq(s.lastPartnerGroup, ['a', 'b', 'c', 'd']);
})());

section('partner rotation: avoid an immediate repeat');
check('pullRestedPlayersAvoiding: a queue of exactly 4 has no choice but to repeat the same group', (() => {
  const s = base('partner_rotation', 'doubles', solo('a', 'b', 'c', 'd'));
  const players = Q.pullRestedPlayersAvoiding(s, 4, ['a', 'b', 'c', 'd']);
  return eq(players.slice().sort(), ['a', 'b', 'c', 'd']);
})());
check('pullRestedPlayersAvoiding: a queue of 8+ never repeats the group that just played, even if one of them has a lower lifetime play count', (() => {
  // 'a' has played only once (just now); 'e' has played twice already, from an
  // earlier cycle. Plain "fewest games" would rank 'a' ahead of 'e' -- the
  // avoid rule overrides that so nobody who just played repeats immediately.
  const s = base('partner_rotation', 'doubles', solo('e', 'f', 'g', 'h'));
  s.playCounts = { a: 1, b: 1, c: 1, d: 1, e: 2 };
  const players = Q.pullRestedPlayersAvoiding(s, 4, ['a', 'b', 'c', 'd']);
  return eq(players.slice().sort(), ['e', 'f', 'g', 'h']) && eq(s.waiting, []);
})());
check('pullRestedPlayersAvoiding: a queue of 6 rests two and backfills two from the group that just played', (() => {
  const s = base('partner_rotation', 'doubles', solo('a', 'b', 'c', 'd', 'e', 'f'));
  const players = Q.pullRestedPlayersAvoiding(s, 4, ['a', 'b', 'c', 'd']);
  const outsiders = players.filter((p) => p === 'e' || p === 'f');
  const backfilled = players.filter((p) => ['a', 'b', 'c', 'd'].includes(p));
  return outsiders.length === 2 && backfilled.length === 2 && s.waiting.length === 2;
})());
check('pullRestedPlayersAvoiding falls back to plain rest priority with no avoid list', (() => {
  const s = base('partner_rotation', 'doubles', solo('a', 'b', 'c', 'd'));
  const players = Q.pullRestedPlayersAvoiding(s, 4, null);
  return eq(players, ['a', 'b', 'c', 'd']);
})());
check('checkAndFillActiveMatch honors session.lastPartnerGroup end to end', (() => {
  const s = base('partner_rotation', 'doubles', solo('e', 'f', 'g', 'h'));
  s.lastPartnerGroup = ['a', 'b', 'c', 'd'];
  s.playCounts = { a: 1, b: 1, c: 1, d: 1 };
  Q.checkAndFillActiveMatch(s);
  const onCourt = [...s.activeMatch.teamA, ...s.activeMatch.teamB].sort();
  return eq(onCourt, ['e', 'f', 'g', 'h']);
})());

section('partner rotation: no held-over foursome above 8 players');
// Holding 4 players together for 3 rounds only makes sense when the queue can't easily
// supply a fresh 4 every round. Above 8 total, every round stands alone instead.
check('9 players: round 1 does not start a 3-round rotation (no partnerRotationState)', (() => {
  const s = base('partner_rotation', 'doubles', solo('a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'));
  Q.checkAndFillActiveMatch(s);
  return !s.partnerRotationState && s.activeMatch !== null;
})());
check('9 players: the match ends after a single round -- no "setting up round 2" notice, foursome rotates off immediately', (() => {
  const s = base('partner_rotation', 'doubles', solo('a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'));
  Q.checkAndFillActiveMatch(s);
  const firstFour = [...s.activeMatch.teamA, ...s.activeMatch.teamB].slice().sort();
  const r = Q.recordMatchResult(s, 11, 4);
  return !r.error && !/Round/.test(r.notices[0]) && eq(s.lastPartnerGroup.slice().sort(), firstFour) && s.waiting.some((w) => firstFour.includes(w.names[0]));
})());
check('9 players: nobody plays two matches in a row, across many matches', (() => {
  const s = base('partner_rotation', 'doubles', solo('a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'));
  Q.checkAndFillActiveMatch(s);
  let prev = null, bad = null;
  for (let i = 0; i < 20 && !bad; i++) {
    if (!s.activeMatch) { bad = 'no active match at match ' + i; break; }
    const cur = [...s.activeMatch.teamA, ...s.activeMatch.teamB].slice().sort();
    if (prev && cur.some((p) => prev.includes(p))) bad = `overlap at match ${i}: ${JSON.stringify(cur)} vs previous ${JSON.stringify(prev)}`;
    prev = cur;
    const r = Q.recordMatchResult(s, 11, 4);
    if (r.error) bad = r.error;
  }
  return !bad;
})());
check('exactly 8 players still holds the foursome for 3 rounds (the limit is "more than 8", not "8 or more")', (() => {
  const s = base('partner_rotation', 'doubles', solo('a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'));
  Q.checkAndFillActiveMatch(s);
  return !!s.partnerRotationState && s.partnerRotationState.round === 1;
})());
check('a queue that grows past 8 mid-rotation stops holding the foursome together immediately, not at the end of round 3', (() => {
  // This is the exact scenario a 500-seed fuzz run caught: a group starts at exactly 8 (holds),
  // a 9th player joins between round 1 and round 2, and round 2 must NOT repeat round 1's four.
  const s = base('partner_rotation', 'doubles', solo('a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'));
  Q.checkAndFillActiveMatch(s); // 8 players: round 1 of a held-together group
  const round1Four = [...s.activeMatch.teamA, ...s.activeMatch.teamB].slice().sort();
  s.waiting.push({ id: 'w_i', names: ['i'] }); // a 9th joins before round 1 even finishes
  const r = Q.recordMatchResult(s, 11, 4); // would normally advance to "round 2" of the same four
  const nextFour = [...s.activeMatch.teamA, ...s.activeMatch.teamB].slice().sort();
  return !r.error && !s.partnerRotationState && !/Setting up Round 2/.test(r.notices[0] || '') && nextFour.every((n) => !round1Four.includes(n));
})());

section('recordMatchResult: fixed rotation, fixed pairs, timed rotation, four off');
check('fixed rotation breaks pairs, everyone re-queues as individuals', (() => {
  const s = base('fixed_rotation', 'doubles', solo('e', 'f', 'g', 'h'));
  s.activeMatch = { teamA: ['a', 'b'], teamB: ['c', 'd'] };
  const r = Q.recordMatchResult(s, 11, 4);
  // e/f/g/h are rested (0 games); a/b/c/d just played, so they wait this time.
  return !r.error && eq(s.activeMatch.teamA, ['e', 'f']) && eq(s.activeMatch.teamB, ['g', 'h']) && eq(s.waiting.map((w) => w.names[0]), ['a', 'b', 'c', 'd']);
})());
check('fixed pairs records league stats and both teams go to the back, strictly FIFO', (() => {
  const s = base('fixed_pairs', 'doubles', [{ id: 'T3', names: ['e', 'f'] }, { id: 'T4', names: ['g', 'h'] }]);
  s.activeMatch = { teamAId: 'T1', teamBId: 'T2', teamA: ['a', 'b'], teamB: ['c', 'd'] };
  const r = Q.recordMatchResult(s, 11, 4);
  // FIFO, not rest priority: T3/T4 play next because they were already waiting, not because of play counts.
  return !r.error && s.teams.T1.w === 1 && s.teams.T2.l === 1 && s.activeMatch.teamAId === 'T3' && s.activeMatch.teamBId === 'T4' && eq(s.waiting.map((w) => w.id), ['T1', 'T2']);
})());
check('timed rotation resets the timer and flags it for the caller', (() => {
  const s = base('timed_rotation', 'doubles');
  s.timerLimit = 10; s.timerSecondsLeft = 3; s.timerRunning = true;
  s.activeMatch = { teamA: ['a', 'b'], teamB: ['c', 'd'] };
  const r = Q.recordMatchResult(s, 11, 4);
  return !r.error && r.timerReset === true && s.timerSecondsLeft === 600 && s.timerRunning === false;
})());
check('four off four on: both teams rotate to the back as pairs (not broken into individuals)', (() => {
  const s = base('four_off_four_on', 'doubles', solo('e', 'f', 'g', 'h'));
  s.activeMatch = { teamA: ['a', 'b'], teamB: ['c', 'd'] };
  const r = Q.recordMatchResult(s, 11, 4);
  return !r.error && eq(s.activeMatch.teamA, ['e', 'f']) && eq(s.activeMatch.teamB, ['g', 'h']) && eq(s.waiting.map((w) => w.names), [['a', 'b'], ['c', 'd']]);
})());
check('the final notice always names the winners', (() => {
  const s = base('four_off_four_on', 'doubles');
  s.activeMatch = { teamA: ['a', 'b'], teamB: ['c', 'd'] };
  const r = Q.recordMatchResult(s, 11, 4);
  return r.notices[r.notices.length - 1] === 'Match completed! Winners: a & b';
})());
check('recordMatchResult fills the next match automatically when enough are waiting', (() => {
  const s = base('four_off_four_on', 'doubles', solo('e', 'f', 'g', 'h'));
  s.activeMatch = { teamA: ['a', 'b'], teamB: ['c', 'd'] };
  const r = Q.recordMatchResult(s, 11, 4);
  return !r.error && s.activeMatch !== null && s.waiting.length === 2;
})());

section('fixed pairs standings');
check('computeStandings ranks by win%, then point diff, then head-to-head, then points scored', (() => {
  const s = base('fixed_pairs', 'doubles');
  Q.ensureTeam(s, 'T1', ['a', 'b']);
  Q.ensureTeam(s, 'T2', ['c', 'd']);
  Q.applyMatchResult(s, 'T1', 'T2', 11, 4);
  const standings = Q.computeStandings(s);
  return standings[0].id === 'T1' && standings[0].w === 1 && standings[1].l === 1;
})());

section('name matching');
check('exact match after normalizing case/punctuation', Q.normalizeName('  Álex-Rivera! ') !== '' && Q.normalizeName('alex rivera') === Q.normalizeName('Alex Rivera'));
check('similarity: identical normalized names score 1', Q.nameSimilarity('Alex', 'alex') === 1);
check('similarity: a substring scores high but not identical', Q.nameSimilarity('Alex', 'Alexander') === 0.85);
check('findSimilarNames finds a near-miss and ranks it first', (() => {
  const found = Q.findSimilarNames(['Alexander', 'Jordan'], 'Alex');
  return found.length >= 1 && found[0].name === 'Alexander';
})());
check('getAllPlayerNamesInSession covers waiting, active match, and history', (() => {
  const s = base('winner_stays', 'doubles', solo('a'));
  s.activeMatch = { teamA: ['b'], teamB: ['c'] };
  s.matches = [{ teamA: ['d'], teamB: ['e'] }];
  return eq(Q.getAllPlayerNamesInSession(s).sort(), ['a', 'b', 'c', 'd', 'e']);
})());

section('removeWaitingPlayer: removes one player, never the whole pair');
check('removing one name from a pair leaves the other still waiting, same group id', (() => {
  const s = base('winner_stays', 'doubles', [{ id: 'g1', names: ['alice', 'bob'] }]);
  Q.removeWaitingPlayer(s, 'g1', 'bob');
  return eq(s.waiting, [{ id: 'g1', names: ['alice'] }]);
})());
check('removing a solo entry removes the whole group', (() => {
  const s = base('winner_stays', 'doubles', solo('alice'));
  Q.removeWaitingPlayer(s, 'w_alice', 'alice');
  return eq(s.waiting, []);
})());
check('removing the last name in a pair drops the empty group entirely', (() => {
  const s = base('winner_stays', 'doubles', [{ id: 'g1', names: ['alice', 'bob'] }]);
  Q.removeWaitingPlayer(s, 'g1', 'bob');
  Q.removeWaitingPlayer(s, 'g1', 'alice');
  return eq(s.waiting, []);
})());
check('removing by (groupId, name) does not touch other groups, even with the same name elsewhere', (() => {
  const s = base('winner_stays', 'doubles', [{ id: 'g1', names: ['alice', 'bob'] }, { id: 'g2', names: ['carl', 'alice'] }]);
  Q.removeWaitingPlayer(s, 'g1', 'alice');
  return eq(s.waiting, [{ id: 'g1', names: ['bob'] }, { id: 'g2', names: ['carl', 'alice'] }]);
})());
check('a group/name that does not exist is a no-op', (() => {
  const s = base('winner_stays', 'doubles', solo('alice', 'bob'));
  Q.removeWaitingPlayer(s, 'nope', 'alice');
  Q.removeWaitingPlayer(s, 'w_alice', 'nobody');
  return eq(s.waiting, solo('alice', 'bob'));
})());
check('does not mutate other groups\' object identity (no stray re-renders)', (() => {
  const g2 = { id: 'g2', names: ['carl'] };
  const s = base('winner_stays', 'doubles', [{ id: 'g1', names: ['alice', 'bob'] }, g2]);
  Q.removeWaitingPlayer(s, 'g1', 'bob');
  return s.waiting[1] === g2;
})());

section('a recent joiner never cuts ahead of an original queue member who has not played yet');
// A join adds a new group to the BACK of session.waiting (session.waiting.push, same as
// both pages' join handlers) -- that, plus the tie-break-by-queue-order already built
// into RotationPick, is what gives the original queue first priority. These tests
// exercise that emergent guarantee end to end, through the real engine functions,
// rather than asserting it as a separate rule.
check('winner_stays: a joiner waits behind the original challenger (only 2 are needed)', (() => {
  const s = base('winner_stays', 'doubles', solo('a', 'b', 'c', 'd', 'e', 'f'));
  Q.checkAndFillActiveMatch(s); // a,b vs c,d; e,f still original and unplayed
  s.waiting.push({ id: 'w_join', names: ['zoe'] }); // a brand-new joiner, appended at the back
  const r = Q.recordMatchResult(s, 11, 4); // the loser stays off court; e,f challenge the winner next
  const onCourt = [...s.activeMatch.teamA, ...s.activeMatch.teamB];
  return !r.error && onCourt.includes('e') && onCourt.includes('f') && !onCourt.includes('zoe');
})());
['four_off_four_on', 'fixed_rotation'].forEach((rule) => {
  check(`${rule}: with enough original players left to fill the next match (4), the joiner still waits`, (() => {
    // 8 originals: after the first group of 4 plays, exactly 4 unplayed originals remain --
    // enough to fill the next match on their own, so the joiner should not be needed yet.
    const s = base(rule, 'doubles', solo('a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'));
    Q.checkAndFillActiveMatch(s); // a,b vs c,d
    s.waiting.push({ id: 'w_join', names: ['zoe'] });
    const r = Q.recordMatchResult(s, 11, 4); // a,b,c,d rotate off; e,f,g,h should fill next
    const onCourt = [...s.activeMatch.teamA, ...s.activeMatch.teamB];
    return !r.error && eq(onCourt.slice().sort(), ['e', 'f', 'g', 'h']) && !onCourt.includes('zoe');
  })());
  check(`${rule}: when too FEW unplayed originals remain to fill the match, a joiner with fewer games correctly fills the gap`, (() => {
    // Only 6 originals: after the first group of 4, just 2 unplayed originals (e, f) remain --
    // not enough for a full match of 4. The joiner (0 games) fairly outranks a/b/c/d, who have
    // already had their turn (1 game) -- this is ordinary rest priority working correctly, not
    // the joiner unfairly cutting ahead of anyone still owed a first turn.
    const s = base(rule, 'doubles', solo('a', 'b', 'c', 'd', 'e', 'f'));
    Q.checkAndFillActiveMatch(s);
    s.waiting.push({ id: 'w_join', names: ['zoe'] });
    const r = Q.recordMatchResult(s, 11, 4);
    const onCourt = [...s.activeMatch.teamA, ...s.activeMatch.teamB];
    return !r.error && onCourt.includes('e') && onCourt.includes('f') && onCourt.includes('zoe');
  })());
});
check('partner rotation: a joiner waits behind the rest of the original 8 across multiple rotations', (() => {
  // Joining after the first group's 3 rounds finish (not mid-rotation), so the queue
  // stays at exactly 8 -- at the hold limit -- through the whole first rotation, and
  // only grows to 9 for the decision about the second group.
  const s = base('partner_rotation', 'doubles', solo('a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'));
  Q.checkAndFillActiveMatch(s); // first group of 4 from the original 8
  Q.recordMatchResult(s, 11, 4); Q.recordMatchResult(s, 11, 4); Q.recordMatchResult(s, 11, 4); // all 3 rounds, same 4
  s.waiting.push({ id: 'w_join', names: ['zoe'] }); // joiner arrives now that the first group is done
  Q.checkAndFillActiveMatch(s);
  // The second group should be the other 4 originals -- zoe still hasn't played.
  let onCourt = [...s.activeMatch.teamA, ...s.activeMatch.teamB];
  const firstFour = s.lastPartnerGroup;
  const secondFour = onCourt.slice();
  const stillOriginal = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].filter((n) => !firstFour.includes(n));
  return !onCourt.includes('zoe') && eq(secondFour.sort(), stillOriginal.sort());
})());
check('once every original has played, a recent joiner is not starved forever', (() => {
  const s = base('winner_stays', 'singles', solo('a', 'b'));
  Q.checkAndFillActiveMatch(s); // a vs b -- both originals, both about to have played
  s.waiting.push({ id: 'w_join', names: ['zoe'] });
  const r = Q.recordMatchResult(s, 11, 4); // b (loser) goes to the back; zoe already waiting ahead of them
  const onCourt = [...s.activeMatch.teamA, ...s.activeMatch.teamB];
  // Both originals (a, b) have now played once; zoe (0 games) gets picked over b (who is
  // just waiting for a second go), which is correct, ordinary rest priority -- not starved.
  return !r.error && onCourt.includes('zoe');
})());

section('odd headcounts (confirming no regression from the above)');
['winner_stays', 'four_off_four_on', 'fixed_rotation', 'timed_rotation', 'partner_rotation'].forEach((rule) => {
  check(`${rule}: a 5-player doubles queue fills a match of 4 and rests exactly 1`, (() => {
    const s = base(rule, 'doubles', solo('a', 'b', 'c', 'd', 'e'));
    if (rule === 'timed_rotation') { s.timerLimit = 15; s.timerSecondsLeft = 900; }
    Q.checkAndFillActiveMatch(s);
    const onCourt = [...s.activeMatch.teamA, ...s.activeMatch.teamB];
    return onCourt.length === 4 && s.waiting.length === 1;
  })());
});
check('a 7-player singles queue (odd total, odd vs. the 2-per-match size) fills one match and rests 5', (() => {
  const s = base('winner_stays', 'singles', solo('a', 'b', 'c', 'd', 'e', 'f', 'g'));
  Q.checkAndFillActiveMatch(s);
  const onCourt = [...s.activeMatch.teamA, ...s.activeMatch.teamB];
  return onCourt.length === 2 && s.waiting.length === 5;
})());
check('join with an odd headcount still fills a match once there are enough', (() => {
  const s = base('four_off_four_on', 'doubles', solo('a', 'b', 'c'));
  Q.checkAndFillActiveMatch(s); // only 3 -- not enough for doubles
  s.waiting.push({ id: 'w_join', names: ['d'] }); // 4th joiner completes the match
  Q.checkAndFillActiveMatch(s);
  return s.activeMatch !== null && s.waiting.length === 0;
})());

section('match stats');
check('computePlayerStats tallies matches, wins, losses and points per player', (() => {
  const s = base('winner_stays', 'doubles');
  s.matches = [{ teamA: ['a', 'b'], teamB: ['c', 'd'], scoreA: 11, scoreB: 4, winner: 'teamA' }];
  const stats = Q.computePlayerStats(s);
  return stats.a.wins === 1 && stats.c.losses === 1 && stats.a.pointsFor === 11 && stats.c.pointsAgainst === 11;
})());
check('computeTeamStats keys by sorted team name and tallies both sides', (() => {
  const s = base('winner_stays', 'doubles');
  s.matches = [{ teamA: ['b', 'a'], teamB: ['c', 'd'], scoreA: 11, scoreB: 9, winner: 'teamA' }];
  const teams = Q.computeTeamStats(s);
  const a = teams.find((t) => t.names.includes('a'));
  return a.wins === 1 && a.pointsFor === 11;
})());
check('no matches yet: both stats are empty', eq(Q.computePlayerStats(base('winner_stays', 'doubles')), {}) && eq(Q.computeTeamStats(base('winner_stays', 'doubles')), []));

section('head-to-head (win over the other)');
check('singles: a beat b twice, b beat a once -- tallied under one entry regardless of name order', (() => {
  const s = base('winner_stays', 'singles');
  s.matches = [
    { teamA: ['a'], teamB: ['b'], scoreA: 11, scoreB: 4, winner: 'teamA' },
    { teamA: ['b'], teamB: ['a'], scoreA: 9, scoreB: 11, winner: 'teamB' }, // a still wins, now on teamB
    { teamA: ['a'], teamB: ['b'], scoreA: 8, scoreB: 11, winner: 'teamB' }, // b wins this one
  ];
  const h2h = Q.computeHeadToHead(s);
  return h2h.length === 1 && h2h[0].a === 'a' && h2h[0].b === 'b' && h2h[0].aWins === 2 && h2h[0].bWins === 1 && h2h[0].meetings === 3;
})());
check('doubles: both players on one side count as having faced both on the other', (() => {
  const s = base('winner_stays', 'doubles');
  s.matches = [{ teamA: ['a', 'b'], teamB: ['c', 'd'], scoreA: 11, scoreB: 4, winner: 'teamA' }];
  const h2h = Q.computeHeadToHead(s);
  // 4 opposing pairs: a-c, a-d, b-c, b-d -- each a win for the teamA player
  return h2h.length === 4 && h2h.every((r) => (r.a === 'a' || r.a === 'b' ? r.aWins === 1 : r.bWins === 1));
})());
check('teammates are never counted against each other', (() => {
  const s = base('winner_stays', 'doubles');
  s.matches = [{ teamA: ['a', 'b'], teamB: ['c', 'd'], scoreA: 11, scoreB: 4, winner: 'teamA' }];
  const h2h = Q.computeHeadToHead(s);
  return !h2h.some((r) => (r.a === 'a' && r.b === 'b') || (r.a === 'b' && r.b === 'a'));
})());
check('sorted by most meetings first, ties broken alphabetically', (() => {
  const s = base('winner_stays', 'singles');
  s.matches = [
    { teamA: ['x'], teamB: ['y'], scoreA: 11, scoreB: 4, winner: 'teamA' },
    { teamA: ['a'], teamB: ['b'], scoreA: 11, scoreB: 4, winner: 'teamA' },
    { teamA: ['a'], teamB: ['b'], scoreA: 11, scoreB: 4, winner: 'teamA' },
  ];
  const h2h = Q.computeHeadToHead(s);
  return h2h[0].a === 'a' && h2h[0].b === 'b' && h2h[0].meetings === 2 && h2h[1].a === 'x' && h2h[1].meetings === 1;
})());
check('works the same regardless of which rule produced the matches (partner rotation included)', (() => {
  const s = base('partner_rotation', 'doubles');
  s.matches = [
    { teamA: ['a', 'b'], teamB: ['c', 'd'], scoreA: 11, scoreB: 4, winner: 'teamA' }, // round 1: a&b vs c&d
    { teamA: ['a', 'c'], teamB: ['b', 'd'], scoreA: 11, scoreB: 9, winner: 'teamA' }, // round 2: a&c vs b&d -- a and b are now opponents
  ];
  const h2h = Q.computeHeadToHead(s);
  const ab = h2h.find((r) => (r.a === 'a' && r.b === 'b') || (r.a === 'b' && r.b === 'a'));
  // round 1: a,b teammates (not counted); round 2: a beat b as opponents
  return ab && ab.meetings === 1 && (ab.a === 'a' ? ab.aWins === 1 : ab.bWins === 1);
})());
check('no matches yet: no head-to-head records', eq(Q.computeHeadToHead(base('winner_stays', 'doubles')), []));

section('overall winner (declared when a session ends)');
check('no matches yet: no winner to declare', Q.computeOverallWinner(base('winner_stays', 'doubles')) === null);
check('a clear leader by win% is declared winner, with full stats attached', (() => {
  const s = base('winner_stays', 'singles');
  s.matches = [
    { teamA: ['a'], teamB: ['b'], scoreA: 11, scoreB: 4, winner: 'teamA' },
    { teamA: ['a'], teamB: ['c'], scoreA: 11, scoreB: 9, winner: 'teamA' },
    { teamA: ['b'], teamB: ['c'], scoreA: 11, scoreB: 6, winner: 'teamA' },
  ];
  const w = Q.computeOverallWinner(s);
  return w.type === 'player' && w.name === 'a' && w.wins === 2 && w.losses === 0 && w.winPct === 100 && w.pointsFor === 22 && w.pointsAgainst === 13 && w.pointDiff === 9 && w.decidedBy === 'win%';
})());
check('a tie on win% is broken by point differential', (() => {
  const s = base('winner_stays', 'singles');
  s.matches = [
    { teamA: ['a'], teamB: ['x'], scoreA: 11, scoreB: 2, winner: 'teamA' }, // a: +9
    { teamA: ['b'], teamB: ['y'], scoreA: 11, scoreB: 9, winner: 'teamA' }, // b: +2, same 1-0 record
  ];
  const w = Q.computeOverallWinner(s);
  return w.name === 'a' && w.decidedBy === 'point differential';
})());
check('a tie on win%, point diff, and points scored is broken by head-to-head between the tied players', (() => {
  // A 4-player round robin where a and b finish perfectly tied (2-1, +4, 29 points)
  // but a beat b directly in their one meeting.
  const s = base('winner_stays', 'singles');
  s.matches = [
    { teamA: ['a'], teamB: ['b'], scoreA: 11, scoreB: 7, winner: 'teamA' },
    { teamA: ['a'], teamB: ['x'], scoreA: 11, scoreB: 7, winner: 'teamA' },
    { teamA: ['a'], teamB: ['y'], scoreA: 7, scoreB: 11, winner: 'teamB' },
    { teamA: ['b'], teamB: ['x'], scoreA: 11, scoreB: 7, winner: 'teamA' },
    { teamA: ['b'], teamB: ['y'], scoreA: 11, scoreB: 7, winner: 'teamA' },
    { teamA: ['x'], teamB: ['y'], scoreA: 11, scoreB: 7, winner: 'teamA' },
  ];
  const w = Q.computeOverallWinner(s);
  return w.name === 'a' && w.decidedBy === 'head-to-head';
})());
check('still tied with no head-to-head between them: falls back to games played, then name, so it is never unresolved', (() => {
  // a and b never meet, and everything else is identical -- genuinely unbreakable
  // except by the final, always-deterministic fallback (name).
  const s = base('winner_stays', 'singles');
  s.matches = [
    { teamA: ['a'], teamB: ['x'], scoreA: 11, scoreB: 4, winner: 'teamA' },
    { teamA: ['b'], teamB: ['y'], scoreA: 11, scoreB: 4, winner: 'teamA' },
  ];
  const w = Q.computeOverallWinner(s);
  return w.name === 'a' && w.decidedBy === 'name';
})());
check('fixed pairs: the top team from computeStandings is declared, not an individual player', (() => {
  const s = base('fixed_pairs', 'doubles');
  s.matches = [{ teamA: ['a', 'b'], teamB: ['c', 'd'], scoreA: 11, scoreB: 4, winner: 'teamA', teamAId: 'T1', teamBId: 'T2' }];
  Q.ensureTeam(s, 'T1', ['a', 'b']); Q.ensureTeam(s, 'T2', ['c', 'd']);
  Q.applyMatchResult(s, 'T1', 'T2', 11, 4);
  const w = Q.computeOverallWinner(s);
  return w.type === 'team' && w.name === 'a & b' && w.wins === 1 && w.decidedBy === 'standings';
})());
check('works the same regardless of which rule produced the matches (partner rotation included)', (() => {
  const s = base('partner_rotation', 'doubles');
  s.matches = [
    { teamA: ['a', 'b'], teamB: ['c', 'd'], scoreA: 11, scoreB: 4, winner: 'teamA' },
    { teamA: ['a', 'c'], teamB: ['b', 'd'], scoreA: 11, scoreB: 9, winner: 'teamA' },
  ];
  const w = Q.computeOverallWinner(s);
  return w.type === 'player' && w.name === 'a' && w.wins === 2;
})());

console.log(`\n=== QUEUE ENGINE: ${passed}/${passed + failed} passed ===`);
process.exit(failed === 0 ? 0 : 1);
