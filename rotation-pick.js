/* Partner rotation: choosing who plays next from an uneven queue. Pure functions, no DOM.

   The waiting list is a list of groups (a pair that came together stays a group),
   in the order they arrived. A rotation needs `count` players. When the queue holds
   more than that, the players who have played the FEWEST rotations go first, so
   everyone's games stay close together. Ties go to whoever has waited longest.
   Anyone left over stays at the front of the queue and is picked up next time.

   Loaded by the browser as `RotationPick` and by the tests via require(). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RotationPick = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const playedBefore = (counts, name) => (counts && Object.prototype.hasOwnProperty.call(counts, name) ? counts[name] : 0);

  /* Returns { picked: [names in queue order], waiting: remaining groups }.
     Returns null when the queue does not hold enough players yet. */
  function pickPlayers(waiting, count, playCounts) {
    const groups = Array.isArray(waiting) ? waiting : [];
    const flat = [];
    groups.forEach((g, gi) => (g.names || []).forEach((name) => flat.push({ name, gi, order: flat.length })));
    if (flat.length < count) return null;

    const ranked = flat.slice().sort((a, b) => (playedBefore(playCounts, a.name) - playedBefore(playCounts, b.name)) || (a.order - b.order));
    const chosen = new Set(ranked.slice(0, count).map((e) => e.order));

    const picked = flat.filter((e) => chosen.has(e.order)).map((e) => e.name);
    let order = 0;
    const remaining = [];
    groups.forEach((g) => {
      const names = (g.names || []).filter(() => !chosen.has(order++));
      if (names.length) remaining.push({ ...g, names });
    });
    return { picked, waiting: remaining };
  }

  /* Records one rotation for each player who was picked. Returns a NEW counts object. */
  function countRotation(playCounts, picked) {
    const next = { ...(playCounts || {}) };
    picked.forEach((name) => { next[name] = playedBefore(next, name) + 1; });
    return next;
  }

  return { pickPlayers, countRotation };
}));
