/* Find a Game chat: who may post, message cleanup, sender labels and times,
   and the wiring in index.html + firestore.rules. Helpers are extracted from
   the real page.  Usage: node tests/og-chat.test.js */
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const rules = fs.readFileSync(path.join(__dirname, '..', 'firestore.rules'), 'utf8');

const grab = (a, b) => { const i = html.indexOf(a), j = html.indexOf(b, i); if (i < 0 || j < 0) throw new Error('markers not found: ' + a.slice(0, 40)); return html.slice(i, j); };
const chatFns = grab('// OG-CHAT-START', '// OG-CHAT-END');
const api = new Function(`${chatFns}\nreturn { ogCanChat, ogChatMessageText, ogChatIsMine, ogChatSenderLabel, ogChatClockTime, ogChatTimeLabel, OG_CHAT_MAX };`)();

let passed = 0, failed = 0;
function check(name, ok, detail) { if (ok) passed++; else { failed++; console.log(`  FAIL: ${name}${detail ? ' -- ' + detail : ''}`); } }
const section = (t) => console.log(`\n${t}`);

const game = (o = {}) => ({ id: 'g1', source: 'player', creatorEmail: 'org@x.com', ...o });

section('who may post');
check('a player who joined can post', api.ogCanChat(game(), true));
check('a stranger just browsing cannot', !api.ogCanChat(game(), false));
check('facility Open Play never gets chat, even for a joined player', !api.ogCanChat(game({ source: 'facility' }), true));
check('no game -> no chat', !api.ogCanChat(null, true));

section('cleaning up what gets sent');
check('trims whitespace', api.ogChatMessageText('  hey, running late  ') === 'hey, running late');
check('blank or whitespace-only messages are rejected', api.ogChatMessageText('') === null && api.ogChatMessageText('   ') === null && api.ogChatMessageText(null) === null && api.ogChatMessageText(undefined) === null);
check('very long messages are capped', api.ogChatMessageText('x'.repeat(1000)).length === api.OG_CHAT_MAX);
check('a non-string value does not throw', api.ogChatMessageText(42) === '42');

section('whose bubble is whose');
const msg = (o = {}) => ({ name: 'Ana Cruz', email: 'ana@x.com', text: 'hi', ...o });
check('matches by email, case-insensitively', api.ogChatIsMine(msg(), 'ANA@X.COM') === true);
check('a different email is not mine', api.ogChatIsMine(msg(), 'ben@x.com') === false);
check('no identity yet -> nothing is "mine"', api.ogChatIsMine(msg(), '') === false && api.ogChatIsMine(msg(), null) === false);
check('a message with no data does not throw', api.ogChatIsMine(null, 'ana@x.com') === false);

section('sender label');
check('a regular player is just their name', api.ogChatSenderLabel(msg(), game()) === 'Ana Cruz');
check('the organizer is tagged', api.ogChatSenderLabel(msg({ email: 'org@x.com' }), game()) === 'Ana Cruz · Organizer');
check('matching is case-insensitive', api.ogChatSenderLabel(msg({ email: 'ORG@X.COM' }), game()) === 'Ana Cruz · Organizer');
check('a blank name falls back to "Player"', api.ogChatSenderLabel(msg({ name: '' }), game()) === 'Player');
check('no game context -> never tagged organizer', api.ogChatSenderLabel(msg({ email: 'org@x.com' }), null) === 'Ana Cruz');

section('showing the time');
check('12-hour clock, zero-padded minutes', api.ogChatClockTime(new Date(2026, 0, 1, 9, 5)) === '9:05 AM' && api.ogChatClockTime(new Date(2026, 0, 1, 21, 30)) === '9:30 PM');
check('midnight and noon', api.ogChatClockTime(new Date(2026, 0, 1, 0, 0)) === '12:00 AM' && api.ogChatClockTime(new Date(2026, 0, 1, 12, 0)) === '12:00 PM');
check('a Firestore Timestamp-like value (has toDate)', api.ogChatTimeLabel({ toDate: () => new Date(2026, 0, 1, 9, 5) }) === '9:05 AM');
check('a plain Date works directly', api.ogChatTimeLabel(new Date(2026, 0, 1, 9, 5)) === '9:05 AM');
check('a raw epoch number works', api.ogChatTimeLabel(new Date(2026, 0, 1, 9, 5).getTime()) === '9:05 AM');
check('an unresolved serverTimestamp (still null on the client) shows as sending', api.ogChatTimeLabel(null) === 'Sending…' && api.ogChatTimeLabel(undefined) === 'Sending…');

section('firestore rules');
check('the chat subcollection is scoped to the tenant, same as the game itself', /match \/openGames\/\{gameId\}\/messages\/\{document\} \{\s*allow read: if isValidTenantId\(clientId\);\s*allow write: if isValidTenantId\(clientId\);\s*\}/.test(rules));

section('wiring in the page');
check('the chat panel only shows when ogCanChat allows it', /const chatHtml = ogCanChat\(game, alreadyJoined \|\| isCreator \|\| adminUnlocked\) \? ogChatPanelHtml\(\) : ''/.test(html));
check('it is placed in the modal and wired (or the listener is stopped) after render', /\$\{chatHtml\}/.test(html) && /if\(chatHtml\) ogWireChatPanel\(game\); else ogStopChatListener\(\);/.test(html));
check('a live listener feeds the message list, newest 50, oldest first', /orderBy\('createdAt'\)\.limitToLast\(50\)/.test(html) && /onSnapshot\(snap => \{\s*_ogChatMsgs = snap\.docs\.map/.test(html));
check('switching games does not pile up listeners (guards on the same id, unsubscribes on stop)', /if\(_ogChatGameId === gameId\) return;/.test(html) && /if\(_ogChatUnsub\) _ogChatUnsub\(\);/.test(html));
check('closing or leaving the game stops the listener (no leaked reads while browsing away)', (html.match(/ogStopChatListener\(\);/g) || []).length >= 3);
check('sending clears the input and re-checks identity like the rest of Find a Game', /input\.value = '';\s*input\.focus\(\);\s*await ogSendChatMessage/.test(html) && /if\(!id\.name \|\| !id\.email\)/.test(html.slice(html.indexOf('ogWireChatPanel'))));
check('messages are escaped before going into the page', /escapeHtml\(m\.text \|\| ''\)/.test(html) && /escapeHtml\(ogChatSenderLabel\(m, game\)\)/.test(html));

console.log(`\n=== FIND A GAME CHAT: ${passed}/${passed + failed} passed ===`);
process.exit(failed === 0 ? 0 : 1);
