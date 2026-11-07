/* Division colour coding, shared by tournament.html, tournament-admin.html and
   tournament-display.html: the SAME 6-colour cycling palette queue.html /
   index.html already use for match-NUMBER coding (QueueEngine.matchColor /
   MATCH_COLOR_NAMES), here keyed to a division's stable INDEX in the
   tournament's own canonical division order instead of a match number.

   "Canonical order" = the tournament's `divisions` subcollection ordered by
   `createdAt asc` -- that is how every page that already needs "the" division
   order reads it (tournament.html's loadDivisionsAndRender, tournament-admin's
   loadDivisions, tournament-display's subscribeDivisions all do
   `.orderBy('createdAt', 'asc')`), and it's what tournament-display's own
   Combined-leaderboard division switcher already treats as the definitive
   list. A division's position in that array is a stable index for the
   lifetime of the tournament (divisions are never reordered or deleted out
   from under a running event), so `divisionColor(index)` -- same shape as
   matchColor(matchNumber) -- gives every page the SAME colour for the SAME
   division as long as each page resolves the index from that one shared
   order (DIVISIONS.findIndex(d => d.id === someDivisionId)).

   Unlike matchColor (1-based match number, defensive fallback to blue),
   divisionColor takes a 0-based array index: 0 is always blue, 1 coral, ...,
   5 teal, wrapping back to blue at index 6. A negative or non-numeric index
   (division not found in the array) also falls back to blue (index 0) rather
   than silently wrapping to some other colour -- "unknown" should look like
   "first", not like an arbitrary later division.

   Pure name/index + palette hex here, no CSS variables/classes: those are
   page-local (theme.css's .divc-* classes for tournament.html/tournament-
   admin.html, which already share theme.css and need light+dark values;
   literal hex for tournament-display.html, which is always-dark, own CSS,
   no toggle -- see its own <style> comment). Hex values are copied VERBATIM
   from queue.html's --match-* tokens (light) and index.html's MATCH_COLOR_HEX
   (dark) so a division's colour and a match's colour mean the same thing
   everywhere in the app.

   No DOM, no Firestore -- loaded by the browser as `DivisionColor` and by the
   tests via require(), same convention as queue-engine.js / tournament-display.js. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.DivisionColor = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var DIVISION_COLOR_NAMES = ['blue', 'coral', 'green', 'amber', 'purple', 'teal'];

  function divisionColor(index) {
    var n = Math.trunc(Number(index));
    var i = Number.isFinite(n) && n >= 0 ? n % DIVISION_COLOR_NAMES.length : 0;
    return { index: i, name: DIVISION_COLOR_NAMES[i] };
  }

  /* light = queue.html's --match-* light tokens; dark = queue.html's own
     [data-theme="dark"] overrides, identical to index.html's MATCH_COLOR_HEX
     .text values. bg* are the matching tint used behind a "Match N"/division
     badge (queue.html's --match-*-bg / index.html's MATCH_COLOR_HEX .bg). */
  var DIVISION_COLOR_HEX = {
    blue:   { light: '#1D4ED8', dark: '#93C5FD', lightBg: 'rgba(29,78,216,.10)',  darkBg: 'rgba(147,197,253,.16)' },
    coral:  { light: '#B91C1C', dark: '#FFB4AB', lightBg: 'rgba(185,28,28,.08)',  darkBg: 'rgba(255,180,171,.16)' },
    green:  { light: '#15803D', dark: '#5AEF82', lightBg: 'rgba(21,128,61,.08)',  darkBg: 'rgba(90,239,130,.14)'  },
    amber:  { light: '#92400E', dark: '#FCD34D', lightBg: 'rgba(146,64,14,.10)',  darkBg: 'rgba(252,211,77,.16)'  },
    purple: { light: '#5B21B6', dark: '#CFC4FF', lightBg: 'rgba(91,33,182,.08)',  darkBg: 'rgba(207,196,255,.16)' },
    teal:   { light: '#0F766E', dark: '#5EEAD4', lightBg: 'rgba(15,118,110,.08)', darkBg: 'rgba(94,234,212,.16)'  },
  };

  /* Resolves a division's colour straight from its id, given the tournament's
     own canonical, ordered DIVISIONS array (createdAt asc) -- the one helper
     every page actually calls, so "how to find the index" lives in exactly
     one place. A divisionId that isn't in the array (deleted division, stale
     reference, etc) falls back to blue, same as a negative/missing index. */
  function divisionColorFor(divisionId, divisions) {
    var idx = (divisions || []).findIndex(function (d) { return d && d.id === divisionId; });
    return divisionColor(idx);
  }

  return {
    DIVISION_COLOR_NAMES,
    divisionColor,
    DIVISION_COLOR_HEX,
    divisionColorFor,
  };
}));
