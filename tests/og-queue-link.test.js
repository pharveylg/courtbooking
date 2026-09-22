/* Linking a peer game to a reservation creates a queue session named after
   the game, seeded with its players and unlocked with the reservation's PIN.
   Helpers are extracted from the real page.  Usage: node tests/og-queue-link.test.js */
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

const grab = (a, b) => { const i = html.indexOf(a), j = html.indexOf(b, i); if (i < 0 || j < 0) throw new Error('markers not found: ' + a.slice(0, 40)); return html.slice(i, j); };
const fmt = grab('function fmtTime(h){', '/* Short badge labels');
const queueFns = grab('// OG-QUEUE-START', '// OG-QUEUE-END');
const api = new Function(`${fmt}\nfunction getMidnightTimestamp(){ const d = new Date(); d.setHours(23,59,59,999); return d.getTime(); }\n${queueFns}\nreturn { fmtTime, ogQueueNameForGame, ogQueueModeForGame, ogQueueWaitingForGame, ogLinkedQueueId, ogBuildLinkedQueueSession };`)();

let passed = 0, failed = 0;
function check(name, ok, detail) { if (ok) passed++; else { failed++; console.log(`  FAIL: ${name}${detail ? ' -- ' + detail : ''}`); } }
const section = (t) => console.log(`\n${t}`);
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const P = (n) => Array.from({ length: n }, (_, i) => ({ name: 'Player ' + 'ABCDEFGH'[i], email: `p${i}@x.com` }));
const game = (o = {}) => ({ id: 'g1', date: '2026-10-10', startHour: 18, endHour: 20, format: 'Doubles', skillLevel: 'Intermediate', players: P(4), playersNeeded: 4, ...o });
const booking = (o = {}) => ({ id: 'bk1', pin: '4321', court: 'court1', ...o });

section('the queue\'s name');
check('skill level plus the start time', api.ogQueueNameForGame(game()) === 'Intermediate Game — 6:00 PM');
check('an "Open" skill game omits the skill', api.ogQueueNameForGame(game({ skillLevel: 'Open' })) === 'Game — 6:00 PM');
check('a missing skill level is treated the same as Open', api.ogQueueNameForGame(game({ skillLevel: null })) === 'Game — 6:00 PM');
check('the time updates with the game', api.ogQueueNameForGame(game({ startHour: 7 })) === 'Intermediate Game — 7:00 AM');

section('mode');
check('Singles maps to singles', api.ogQueueModeForGame(game({ format: 'Singles' })) === 'singles');
check('Doubles and Open both map to doubles', api.ogQueueModeForGame(game({ format: 'Doubles' })) === 'doubles' && api.ogQueueModeForGame(game({ format: 'Open' })) === 'doubles');

section('seeding the waiting list from the game\'s players');
const w = api.ogQueueWaitingForGame(game());
check('one waiting entry per player, in order', w.length === 4 && w.map((x) => x.names[0]).join(',') === 'Player A,Player B,Player C,Player D');
check('each entry is a solo group (pairing happens once a match starts)', w.every((x) => x.names.length === 1));
check('the ids are unique and stable per game/slot', new Set(w.map((x) => x.id)).size === 4 && api.ogQueueWaitingForGame(game())[0].id === w[0].id);
check('no players -> an empty list, not a crash', eq(api.ogQueueWaitingForGame(game({ players: [] })), []) && eq(api.ogQueueWaitingForGame({ ...game(), players: undefined }), []));

section('the queue id is deterministic (guards against creating it twice)');
check('same game -> same id', api.ogLinkedQueueId('g1') === api.ogLinkedQueueId('g1'));
check('different games -> different ids', api.ogLinkedQueueId('g1') !== api.ogLinkedQueueId('g2'));

section('building the session');
const s = api.ogBuildLinkedQueueSession(game(), booking());
check('named after the game', s.name === 'Intermediate Game — 6:00 PM');
check('doubles for a Doubles game', s.mode === 'doubles');
check('a sensible default rotation rule', s.rule === 'winner_stays');
check('unlocked with the reservation\'s own PIN', s.pin === '4321');
check('a numeric PIN on the booking still becomes a string', api.ogBuildLinkedQueueSession(game(), booking({ pin: 4321 })).pin === '4321');
check('open to walk-ins by default, like a facility Open Play block', s.allowJoin === true);
check('the reservation\'s court is used', s.court === 'court1');
check('falls back to the game\'s own court if the booking has none', api.ogBuildLinkedQueueSession(game({ court: 'court2' }), booking({ court: null })).court === 'court2');
check('seeded with the game\'s players', s.waiting.length === 4);
check('starts with no active match or history', s.activeMatch === null && eq(s.matches, []) && eq(s.teams, {}));
check('remembers which game it came from', s.linkedOpenGameId === 'g1');
check('expires at local midnight like any other queue', typeof s.expiresAt === 'number' && s.expiresAt > Date.now());
check('the id matches ogLinkedQueueId', s.id === api.ogLinkedQueueId('g1'));

section('wiring in the page');
check('linking calls the queue creator with the booking, using its (possibly reassigned) court', /ogEnsureLinkedQueue\(\{ \.\.\.game, court: check\.booking\.court \|\| game\.court \}, check\.booking\)/.test(html));
check('a second link attempt for the same game does not create a second board', /if\(list\.some\(q => q\.id === ogLinkedQueueId\(game\.id\)\)\) return;/.test(html));
check('the new match is auto-filled like a normal queue, and it is saved + tracked as usage', /checkAndFillActiveMatch\(session\);\s*\n\s*list\.unshift\(session\);\s*\n\s*saveQueues\(list\);/.test(html) && /logUsageEvent\('queue_session_created', \{ court: session\.court \|\| null, source: 'open-game-link' \}\)/.test(html));
check('the organizer is told a queue was created', /A queue was created for this game/.test(html));
check('the real page defines getMidnightTimestamp (stubbed above for the extracted helpers)', /function getMidnightTimestamp\(\)/.test(html));

console.log(`\n=== FIND A GAME -> QUEUE ON LINK: ${passed}/${passed + failed} passed ===`);
process.exit(failed === 0 ? 0 : 1);
