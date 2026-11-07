/* Division colour coding (tournament.html / tournament-admin.html / tournament-display.html):
   divisionColor(index) cycles the SAME 6-colour palette queue.html's matchColor uses for match
   NUMBER, here keyed to a division's stable 0-based INDEX in the tournament's own canonical
   division order (its `divisions` subcollection ordered by createdAt asc -- see every page's
   own loadDivisions/loadDivisionsAndRender/subscribeDivisions). divisionColorFor(divisionId,
   divisions) is the one helper every page actually calls: it resolves "the" index from that
   shared, ordered array so a division reads as the same colour on tournament.html,
   tournament-admin.html AND tournament-display.html for the same tournament.
   Usage: node tests/division-color.test.js */
const DC = require('../division-color.js');

let passed = 0, failed = 0;
function check(name, ok, detail) { if (ok) passed++; else { failed++; console.log(`  FAIL: ${name}${detail ? ' -- ' + detail : ''}`); } }
const section = (t) => console.log(`\n${t}`);
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

section('divisionColor: 0-based index -> the same 6-colour cycle queue.html\'s matchColor uses');
check('6 named colours, in the documented cycle order, IDENTICAL to QueueEngine.MATCH_COLOR_NAMES', eq(DC.DIVISION_COLOR_NAMES, ['blue', 'coral', 'green', 'amber', 'purple', 'teal']));
check('index 0 is blue (first division)', eq(DC.divisionColor(0), { index: 0, name: 'blue' }));
check('index 1 is coral', DC.divisionColor(1).name === 'coral');
check('index 2 is green', DC.divisionColor(2).name === 'green');
check('index 3 is amber', DC.divisionColor(3).name === 'amber');
check('index 4 is purple', DC.divisionColor(4).name === 'purple');
check('index 5 is teal', DC.divisionColor(5).name === 'teal');
check('index 6 (a 7th division) wraps back around to blue, same as index 0', DC.divisionColor(6).name === DC.divisionColor(0).name && DC.divisionColor(6).name === 'blue');
check('index 13 (two full cycles + 1) is coral again, same as index 1', DC.divisionColor(13).name === DC.divisionColor(1).name && DC.divisionColor(13).name === 'coral');
check('stable: calling divisionColor with the same index repeatedly always returns the same colour', DC.divisionColor(4).name === DC.divisionColor(4).name && DC.divisionColor(4).index === 4);
check('defensive: a missing/negative/non-numeric index falls back to index 0 (blue), not an arbitrary later colour', [undefined, null, -1, -6, NaN, 'x', {}].every((v) => { const c = DC.divisionColor(v); return c.index === 0 && c.name === 'blue'; }));

section('divisionColorFor: resolves a divisionId against the tournament\'s own ordered division list -- the one call every page makes');
const DIVISIONS = [{ id: 'd_open', name: 'Open Doubles' }, { id: 'd_3_5', name: "3.5 Doubles" }, { id: 'd_mixed', name: 'Mixed Doubles' }];
check('1st division in the array -> blue', DC.divisionColorFor('d_open', DIVISIONS).name === 'blue');
check('2nd division in the array -> coral', DC.divisionColorFor('d_3_5', DIVISIONS).name === 'coral');
check('3rd division in the array -> green', DC.divisionColorFor('d_mixed', DIVISIONS).name === 'green');
check('the SAME divisionId always resolves to the SAME colour regardless of which page/array-copy asks, as long as the order is the same (cross-page consistency)', (() => {
  const copyOnAnotherPage = DIVISIONS.map((d) => ({ ...d })); // simulates a second page's own DIVISIONS/CURRENT_DIVISIONS array, same Firestore order
  return DC.divisionColorFor('d_3_5', DIVISIONS).name === DC.divisionColorFor('d_3_5', copyOnAnotherPage).name;
})());
check('a divisionId not present in the array (deleted/stale reference) falls back to blue, not a crash', eq(DC.divisionColorFor('d_missing', DIVISIONS), { index: 0, name: 'blue' }));
check('an empty/missing divisions array falls back to blue', eq(DC.divisionColorFor('d_open', []), { index: 0, name: 'blue' }) && eq(DC.divisionColorFor('d_open', undefined), { index: 0, name: 'blue' }));
check('a wraparound tournament with 7+ divisions: the 7th division (index 6) is blue again, same as the 1st', (() => {
  const many = Array.from({ length: 7 }, (_, i) => ({ id: 'd' + i, name: 'Division ' + i }));
  return DC.divisionColorFor('d6', many).name === DC.divisionColorFor('d0', many).name && DC.divisionColorFor('d6', many).name === 'blue';
})());

section('DIVISION_COLOR_HEX: palette values match queue.html\'s --match-* tokens / index.html\'s MATCH_COLOR_HEX verbatim, for both themes');
const EXPECTED = {
  blue:   { light: '#1D4ED8', dark: '#93C5FD' },
  coral:  { light: '#B91C1C', dark: '#FFB4AB' },
  green:  { light: '#15803D', dark: '#5AEF82' },
  amber:  { light: '#92400E', dark: '#FCD34D' },
  purple: { light: '#5B21B6', dark: '#CFC4FF' },
  teal:   { light: '#0F766E', dark: '#5EEAD4' },
};
Object.keys(EXPECTED).forEach((name) => {
  check(`${name}: light = ${EXPECTED[name].light}, dark = ${EXPECTED[name].dark} (same hex the queue feature already uses)`,
    DC.DIVISION_COLOR_HEX[name].light === EXPECTED[name].light && DC.DIVISION_COLOR_HEX[name].dark === EXPECTED[name].dark);
});
check('every colour name in the palette has a HEX entry (no gaps)', DC.DIVISION_COLOR_NAMES.every((n) => !!DC.DIVISION_COLOR_HEX[n]));

console.log(`\n=== DIVISION COLOR: ${passed}/${passed + failed} passed ===`);
process.exit(failed === 0 ? 0 : 1);
