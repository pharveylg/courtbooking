/* Tournament engine callables.
   ================================================================
   Every other write in this app -- bookings, sales, even entitlement
   flags -- goes straight from the browser to Firestore under an
   open-per-tenant rule (`isValidTenantId(clientId)`), because the worst
   case of two people racing a write is a wrong number that's easy to
   see and fix. A bracket is different: match B's participants literally
   ARE match A's recorded winner, so two browsers "advancing" from stale
   local state can corrupt the tree's structure, not just its data. That
   one property is why this file exists -- it is the only place in the
   whole project where a write is server-adjudicated instead of an open
   Firestore rule, and firestore.rules denies direct client writes to
   `matches` and `standings` specifically because these functions are
   now the only intended path to them.

   There is no per-person auth in this app (tenant staff share a PIN,
   checked client-side) -- these callables intentionally do not add one
   either. They accept a clientId the same way every other write in the
   app implicitly trusts whoever already reached the dashboard for that
   tenant. That preserves the existing trust model instead of quietly
   introducing a stronger one only for this feature; the goal here is
   write-concurrency correctness, not new authorization.
   ================================================================ */

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');

admin.initializeApp();
const db = admin.firestore();
const REGION = 'asia-southeast1';

const seeding = require('./engines/seeding');
const roundRobin = require('./engines/roundRobin');
const singleElim = require('./engines/singleElim');
const groupKnockout = require('./engines/groupKnockout');

const GROUP_SIZE = 4;
const ADVANCE_PER_GROUP = 2;

function assertValidTenantId(clientId) {
  if (typeof clientId !== 'string' || !/^[a-z0-9-]{1,50}$/.test(clientId)) {
    throw new HttpsError('invalid-argument', 'Invalid client id.');
  }
}
function requireString(value, field) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new HttpsError('invalid-argument', `${field} is required.`);
  }
}

function tournamentRef(clientId, tournamentId) {
  return db.doc(`clients/${clientId}/tournaments/${tournamentId}`);
}
async function logAudit(tRef, action, detail) {
  await tRef.collection('auditLog').add({
    action, detail, actorRole: 'tenant-admin-server',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

/* Active registrations (approved or checked_in) for a division, shaped
   for the seeding/format engines. */
async function loadActiveParticipants(tRef, divisionId) {
  const snap = await tRef.collection('registrations').where('divisionId', '==', divisionId).get();
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((r) => r.status === 'approved' || r.status === 'checked_in')
    .map((r) => {
      const duprs = (r.playerDuprs || []).filter((v) => v != null);
      return {
        participantId: r.id,
        playerIds: r.playerIds,
        playerNames: r.playerNames,
        dupr: duprs.length ? duprs.reduce((a, b) => a + b, 0) / duprs.length : null,
        registeredAtSeconds: r.registeredAt && r.registeredAt.seconds,
      };
    });
}

/* ================================================================
   generateBracket -- turns a division's active registrations into its
   initial match schedule. One-shot: refuses to run twice for the same
   division (regenerating would orphan whatever's already been scored).
   ================================================================ */
exports.generateBracket = onCall({ region: REGION }, async (request) => {
  const { clientId, tournamentId, divisionId } = request.data || {};
  assertValidTenantId(clientId);
  requireString(tournamentId, 'tournamentId');
  requireString(divisionId, 'divisionId');

  const tRef = tournamentRef(clientId, tournamentId);
  const divRef = tRef.collection('divisions').doc(divisionId);
  const divSnap = await divRef.get();
  if (!divSnap.exists) throw new HttpsError('not-found', 'Division not found.');
  const division = divSnap.data();

  const existing = await tRef.collection('matches').where('divisionId', '==', divisionId).limit(1).get();
  if (!existing.empty) throw new HttpsError('already-exists', 'A bracket already exists for this division.');

  const participants = await loadActiveParticipants(tRef, divisionId);
  if (participants.length < 2) {
    throw new HttpsError('failed-precondition', 'Need at least 2 approved/checked-in participants to generate a bracket.');
  }
  const seeded = seeding.rankParticipants(participants, division.seedingMethod || 'random');

  let matches = [];
  const bracketMeta = {};

  if (division.format === 'round_robin') {
    matches = roundRobin.generateMatches(seeded).map((m) => ({ ...m, divisionId, stage: 'main' }));
  } else if (division.format === 'single_elim') {
    const { matches: initial, roundsTotal } = singleElim.generateInitialMatches(seeded);
    const tagged = initial.map((m) => ({ ...m, divisionId, stage: 'main' }));
    matches = singleElim.cascadeByes(tagged, roundsTotal);
    bracketMeta.roundsTotal = roundsTotal;
  } else if (division.format === 'group_knockout') {
    const { matches: groupMatches, groups } = groupKnockout.generateGroupStageMatches(seeded, GROUP_SIZE);
    matches = groupMatches.map((m) => ({ ...m, divisionId }));
    bracketMeta.groupSize = GROUP_SIZE;
    bracketMeta.advancePerGroup = ADVANCE_PER_GROUP;
    bracketMeta.groups = groups.map((g) => ({
      groupId: g.groupId,
      participants: g.members.map((m) => ({ participantId: m.participantId, name: m.playerNames.join(' & ') })),
    }));
  } else {
    throw new HttpsError('failed-precondition', `Unknown format: ${division.format}`);
  }

  const batch = db.batch();
  matches.forEach((m) => {
    const ref = tRef.collection('matches').doc();
    batch.set(ref, { ...m, createdAt: admin.firestore.FieldValue.serverTimestamp() });
  });
  if (Object.keys(bracketMeta).length) batch.set(divRef, { bracketMeta }, { merge: true });
  await batch.commit();

  await recomputeAndWriteStandings(tRef, divRef, divisionId);
  await logAudit(tRef, 'bracket-generated', `Generated ${matches.length} match(es) for "${division.name}" (${participants.length} participants)`);
  return { matchCount: matches.length };
});

/* ================================================================
   advanceToKnockout -- the group+knockout format's second, explicitly
   triggered step. Only runs once every group-stage match is done, so a
   director always chooses when the cut to knockout happens rather than
   it silently completing behind their back mid-review.
   ================================================================ */
exports.advanceToKnockout = onCall({ region: REGION }, async (request) => {
  const { clientId, tournamentId, divisionId } = request.data || {};
  assertValidTenantId(clientId);
  requireString(tournamentId, 'tournamentId');
  requireString(divisionId, 'divisionId');

  const tRef = tournamentRef(clientId, tournamentId);
  const divRef = tRef.collection('divisions').doc(divisionId);
  const divSnap = await divRef.get();
  if (!divSnap.exists) throw new HttpsError('not-found', 'Division not found.');
  const division = divSnap.data();
  if (division.format !== 'group_knockout') throw new HttpsError('failed-precondition', 'Not a group+knockout division.');
  if (!division.bracketMeta || !division.bracketMeta.groups) throw new HttpsError('failed-precondition', 'Group stage has not been generated yet.');

  const knockoutExists = await tRef.collection('matches').where('divisionId', '==', divisionId).where('stage', '==', 'knockout').limit(1).get();
  if (!knockoutExists.empty) throw new HttpsError('already-exists', 'Knockout bracket already generated.');

  const groupMatchesSnap = await tRef.collection('matches').where('divisionId', '==', divisionId).where('stage', '==', 'group').get();
  const groupMatches = groupMatchesSnap.docs.map((d) => d.data());
  const unfinished = groupMatches.some((m) => !['completed', 'walkover', 'forfeit'].includes(m.status));
  if (unfinished) throw new HttpsError('failed-precondition', 'Group stage is not complete yet.');

  const groups = division.bracketMeta.groups.map((g) => ({
    groupId: g.groupId,
    members: g.participants.map((p) => ({ participantId: p.participantId, playerNames: [p.name] })),
  }));
  const advancers = groupKnockout.selectAdvancers(groups, groupMatches, division.bracketMeta.advancePerGroup || ADVANCE_PER_GROUP);
  if (advancers.length < 2) throw new HttpsError('failed-precondition', 'Not enough advancers to form a knockout bracket.');

  const { matches: initial, roundsTotal } = singleElim.generateInitialMatches(advancers);
  const tagged = initial.map((m) => ({ ...m, divisionId, stage: 'knockout' }));
  const matches = singleElim.cascadeByes(tagged, roundsTotal);

  const batch = db.batch();
  matches.forEach((m) => {
    const ref = tRef.collection('matches').doc();
    batch.set(ref, { ...m, createdAt: admin.firestore.FieldValue.serverTimestamp() });
  });
  batch.set(divRef, { bracketMeta: { ...division.bracketMeta, knockoutRoundsTotal: roundsTotal } }, { merge: true });
  await batch.commit();

  await recomputeAndWriteStandings(tRef, divRef, divisionId);
  await logAudit(tRef, 'advance-to-knockout', `Advanced ${advancers.length} participant(s) from groups to the knockout bracket for "${division.name}"`);
  return { matchCount: matches.length };
});

/* ================================================================
   submitMatchScore -- the only writer of match completion, standings,
   and single-elim advancement.
   ================================================================ */
exports.submitMatchScore = onCall({ region: REGION }, async (request) => {
  const { clientId, tournamentId, matchId, scoreA, scoreB, forfeitWinnerParticipantId } = request.data || {};
  assertValidTenantId(clientId);
  requireString(tournamentId, 'tournamentId');
  requireString(matchId, 'matchId');

  const tRef = tournamentRef(clientId, tournamentId);
  const matchRef = tRef.collection('matches').doc(matchId);
  const matchSnap = await matchRef.get();
  if (!matchSnap.exists) throw new HttpsError('not-found', 'Match not found.');
  const match = matchSnap.data();
  if (['completed', 'walkover', 'forfeit', 'cancelled'].includes(match.status)) {
    throw new HttpsError('failed-precondition', 'This match is already decided -- use a correction instead.');
  }

  let winnerParticipantId, status, score = null;
  if (forfeitWinnerParticipantId) {
    if (!match.participantIds.includes(forfeitWinnerParticipantId)) throw new HttpsError('invalid-argument', 'Forfeit winner is not in this match.');
    winnerParticipantId = forfeitWinnerParticipantId;
    status = 'forfeit';
  } else {
    const a = Number(scoreA), b = Number(scoreB);
    if (!Number.isFinite(a) || !Number.isFinite(b) || a === b) {
      throw new HttpsError('invalid-argument', 'Enter two different numeric scores -- pickleball games don\'t end in a tie.');
    }
    winnerParticipantId = a > b ? match.participantIds[0] : match.participantIds[1];
    status = 'completed';
    score = { a, b };
  }

  await matchRef.set({ status, score, winnerParticipantId, completedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
  await logAudit(tRef, 'score-submitted', `${match.participantNames.join(' vs ')}: ${score ? `${score.a}-${score.b}` : 'forfeit'} -- winner ${match.participantNames[match.participantIds.indexOf(winnerParticipantId)]}`);

  const divRef = tRef.collection('divisions').doc(match.divisionId);
  const divSnap = await divRef.get();
  const division = divSnap.data();

  if (division.format === 'single_elim' || (division.format === 'group_knockout' && match.stage === 'knockout')) {
    const roundsTotal = division.format === 'single_elim' ? division.bracketMeta.roundsTotal : division.bracketMeta.knockoutRoundsTotal;
    await attemptAdvance(tRef, { ...match, status, winnerParticipantId }, roundsTotal);
  }

  await recomputeAndWriteStandings(tRef, divRef, match.divisionId);
  return { status, winnerParticipantId };
});

/* ================================================================
   correctMatchScore -- Director-only in spirit (this app has no
   per-person auth to enforce that with), required reason, always
   allowed even on an already-completed match. Does NOT cascade into
   any match already generated from this one's old winner -- flagged in
   the audit log instead of silently reshuffling a published bracket.
   ================================================================ */
exports.correctMatchScore = onCall({ region: REGION }, async (request) => {
  const { clientId, tournamentId, matchId, scoreA, scoreB, winnerParticipantId: forcedWinner, reason } = request.data || {};
  assertValidTenantId(clientId);
  requireString(tournamentId, 'tournamentId');
  requireString(matchId, 'matchId');
  requireString(reason, 'reason');

  const tRef = tournamentRef(clientId, tournamentId);
  const matchRef = tRef.collection('matches').doc(matchId);
  const matchSnap = await matchRef.get();
  if (!matchSnap.exists) throw new HttpsError('not-found', 'Match not found.');
  const match = matchSnap.data();
  const previousWinner = match.winnerParticipantId;

  let winnerParticipantId, score = match.score;
  if (forcedWinner) {
    if (!match.participantIds.includes(forcedWinner)) throw new HttpsError('invalid-argument', 'Winner is not in this match.');
    winnerParticipantId = forcedWinner;
  } else {
    const a = Number(scoreA), b = Number(scoreB);
    if (!Number.isFinite(a) || !Number.isFinite(b) || a === b) throw new HttpsError('invalid-argument', 'Enter two different numeric scores.');
    winnerParticipantId = a > b ? match.participantIds[0] : match.participantIds[1];
    score = { a, b };
  }

  await matchRef.set({ status: 'completed', score, winnerParticipantId, correctedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });

  let warning = '';
  if (previousWinner && previousWinner !== winnerParticipantId && match.round != null) {
    const nextRound = match.round + 1;
    const nextPosition = Math.floor(match.position / 2);
    const downstreamSnap = await tRef.collection('matches')
      .where('divisionId', '==', match.divisionId).where('stage', '==', match.stage)
      .where('round', '==', nextRound).where('position', '==', nextPosition).limit(1).get();
    if (!downstreamSnap.empty && downstreamSnap.docs[0].data().participantIds.includes(previousWinner)) {
      warning = ` -- WARNING: round ${nextRound} already has a match using the previous winner; update it manually.`;
    }
  }
  await logAudit(tRef, 'score-corrected', `Corrected ${match.participantNames.join(' vs ')} -- new winner ${match.participantNames[match.participantIds.indexOf(winnerParticipantId)]}. Reason: ${reason}${warning}`);

  const divRef = tRef.collection('divisions').doc(match.divisionId);
  await recomputeAndWriteStandings(tRef, divRef, match.divisionId);
  return { winnerParticipantId, warning };
});

/* ---------------- shared helpers ---------------- */

async function attemptAdvance(tRef, completedMatch, roundsTotal) {
  if (completedMatch.round == null || completedMatch.round >= roundsTotal) return;
  const siblingPos = singleElim.siblingPosition(completedMatch.position);
  const siblingSnap = await tRef.collection('matches')
    .where('divisionId', '==', completedMatch.divisionId).where('stage', '==', completedMatch.stage)
    .where('round', '==', completedMatch.round).where('position', '==', siblingPos).limit(1).get();
  if (siblingSnap.empty) return;
  const sibling = siblingSnap.docs[0].data();
  if (!['completed', 'walkover', 'forfeit'].includes(sibling.status)) return;

  const nextRound = completedMatch.round + 1;
  const nextPosition = Math.floor(completedMatch.position / 2);
  const existingSnap = await tRef.collection('matches')
    .where('divisionId', '==', completedMatch.divisionId).where('stage', '==', completedMatch.stage)
    .where('round', '==', nextRound).where('position', '==', nextPosition).limit(1).get();
  if (!existingSnap.empty) return;

  const winnerThisIdx = completedMatch.participantIds.indexOf(completedMatch.winnerParticipantId);
  const winnerSibIdx = sibling.participantIds.indexOf(sibling.winnerParticipantId);
  await tRef.collection('matches').add({
    divisionId: completedMatch.divisionId, stage: completedMatch.stage,
    round: nextRound, position: nextPosition,
    participantIds: [completedMatch.participantIds[winnerThisIdx], sibling.participantIds[winnerSibIdx]],
    participantNames: [completedMatch.participantNames[winnerThisIdx], sibling.participantNames[winnerSibIdx]],
    status: 'scheduled', createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

async function recomputeAndWriteStandings(tRef, divRef, divisionId) {
  const divSnap = await divRef.get();
  const division = divSnap.data();
  const standingsRef = tRef.collection('standings').doc(divisionId);
  const computedAt = admin.firestore.FieldValue.serverTimestamp();

  if (division.format === 'round_robin') {
    const participants = await loadActiveParticipants(tRef, divisionId);
    const named = participants.map((p) => ({ participantId: p.participantId, name: p.playerNames.join(' & ') }));
    const matchesSnap = await tRef.collection('matches').where('divisionId', '==', divisionId).where('stage', '==', 'main').get();
    const table = roundRobin.computeStandings(named, matchesSnap.docs.map((d) => d.data()));
    await standingsRef.set({ format: 'round_robin', table, computedAt });
  } else if (division.format === 'single_elim') {
    const participants = await loadActiveParticipants(tRef, divisionId);
    const named = participants.map((p) => ({ participantId: p.participantId, name: p.playerNames.join(' & ') }));
    const matchesSnap = await tRef.collection('matches').where('divisionId', '==', divisionId).where('stage', '==', 'main').get();
    const roundsTotal = (division.bracketMeta && division.bracketMeta.roundsTotal) || 1;
    const table = singleElim.computeStandings(named, matchesSnap.docs.map((d) => d.data()), roundsTotal);
    await standingsRef.set({ format: 'single_elim', table, computedAt });
  } else if (division.format === 'group_knockout') {
    const knockoutSnap = await tRef.collection('matches').where('divisionId', '==', divisionId).where('stage', '==', 'knockout').get();
    if (!knockoutSnap.empty && division.bracketMeta && division.bracketMeta.knockoutRoundsTotal) {
      const advancerIds = new Set();
      knockoutSnap.docs.forEach((d) => d.data().participantIds.forEach((id) => id !== singleElim.BYE && advancerIds.add(id)));
      const named = [];
      const seen = new Set();
      knockoutSnap.docs.forEach((d) => {
        const m = d.data();
        m.participantIds.forEach((id, i) => {
          if (id !== singleElim.BYE && !seen.has(id)) { seen.add(id); named.push({ participantId: id, name: m.participantNames[i] }); }
        });
      });
      const table = singleElim.computeStandings(named, knockoutSnap.docs.map((d) => d.data()), division.bracketMeta.knockoutRoundsTotal);
      await standingsRef.set({ format: 'group_knockout', stage: 'knockout', table, computedAt });
    } else if (division.bracketMeta && division.bracketMeta.groups) {
      const groupMatchesSnap = await tRef.collection('matches').where('divisionId', '==', divisionId).where('stage', '==', 'group').get();
      const groupMatches = groupMatchesSnap.docs.map((d) => d.data());
      const groupTables = division.bracketMeta.groups.map((g) => {
        const matches = groupMatches.filter((m) => m.groupId === g.groupId);
        const table = roundRobin.computeStandings(g.participants, matches);
        return { groupId: g.groupId, table };
      });
      await standingsRef.set({ format: 'group_knockout', stage: 'group', groupTables, computedAt });
    }
  }
}
