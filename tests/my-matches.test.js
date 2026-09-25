/* Returning-visitor landing: picker.html for first-timers, my-matches.html
   (a new, cross-facility "what's active" screen) for anyone with something
   remembered on this device -- a facility, a tracked booking/game, or a
   phone number used to look up tournament matches. Usage:
   node tests/my-matches.test.js */
const fs = require('fs');
const path = require('path');
const MyActive = require('../my-active.js');
const PushInbox = require('../push-inbox.js');

const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const tournamentHtml = fs.readFileSync(path.join(__dirname, '..', 'tournament.html'), 'utf8');
const swJs = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');
const myMatchesHtml = fs.readFileSync(path.join(__dirname, '..', 'my-matches.html'), 'utf8');
const pickerHtml = fs.readFileSync(path.join(__dirname, '..', 'picker.html'), 'utf8');

const grab = (src, a, b) => { const i = src.indexOf(a), j = src.indexOf(b, i); if (i < 0 || j < 0) throw new Error('markers not found: ' + a.slice(0, 60)); return src.slice(i, j); };

let passed = 0, failed = 0;
function check(name, ok, detail) { if (ok) passed++; else { failed++; console.log(`  FAIL: ${name}${detail ? ' -- ' + detail : ''}`); } }
const section = (t) => console.log(`\n${t}`);

section('my-active.js -- pure cross-facility pointer list');
{
  const item = (o = {}) => ({ clientId: 'demo', kind: 'booking', refId: 'b1', ...o });
  check('a well-formed item normalizes with an addedAt stamp', MyActive.normalize(item()).addedAt > 0);
  check('missing clientId/kind/refId -> not a valid item', !MyActive.normalize({}) && !MyActive.normalize({ clientId: 'demo' }) && !MyActive.normalize({ clientId: 'demo', kind: 'booking' }));
  check('only booking/game kinds are accepted (no typo\'d kind silently stored)', !MyActive.normalize(item({ kind: 'tournament' })));
  check('withAdded on an empty list adds the one item', MyActive.withAdded([], item()).length === 1);
  check('re-adding the same {clientId,kind,refId} de-dupes instead of duplicating', MyActive.withAdded(MyActive.withAdded([], item()), item()).length === 1);
  check('re-adding moves it to the front with a fresh addedAt (a re-touch counts as recent)', MyActive.withAdded([item({ addedAt: 1 })], item()).find(x => x.refId === 'b1').addedAt > 1);
  check('a different refId is a distinct entry, not a dupe', MyActive.withAdded([item()], item({ refId: 'b2' })).length === 2);
  check('the same refId but a different kind is a distinct entry (booking vs game can share an id space)', MyActive.withAdded([item()], item({ kind: 'game' })).length === 2);
  check('the list is capped so it can\'t grow unbounded', (() => { let l = []; for (let i = 0; i < MyActive.MAX_ITEMS + 20; i++) l = MyActive.withAdded(l, item({ refId: 'b' + i })); return l.length === MyActive.MAX_ITEMS; })());
  check('withRemoved drops exactly the matching pointer, nothing else', MyActive.withRemoved([item(), item({ refId: 'b2' })], item()).length === 1 && MyActive.withRemoved([item()], item()).length === 0);
  const grouped = MyActive.groupByClient([item({ clientId: 'a' }), item({ clientId: 'b', refId: 'x' }), item({ clientId: 'a', refId: 'y' })]);
  check('groupByClient buckets by facility, preserving each facility\'s own items', grouped.a.length === 2 && grouped.b.length === 1);

  check('nothing remembered at all -> no local trace', !MyActive.hasAnyLocalTraceFrom(null, null, []));
  check('a remembered facility alone counts as a trace', MyActive.hasAnyLocalTraceFrom('demo', null, []));
  check('a remembered phone alone counts as a trace', MyActive.hasAnyLocalTraceFrom(null, '639171234567', []));
  check('a non-empty active-items list alone counts as a trace', MyActive.hasAnyLocalTraceFrom(null, null, [item()]));
  check('an empty active-items array is NOT a trace by itself (must not false-positive on "[]")', !MyActive.hasAnyLocalTraceFrom(null, null, []));
  check('a non-array active list is treated as empty, not a crash', !MyActive.hasAnyLocalTraceFrom(null, null, undefined) && !MyActive.hasAnyLocalTraceFrom(null, null, null));
}

section('push-inbox.js -- pure message shaping');
{
  check('a payload normalizes with title/body/url defaults', PushInbox.normalize({}).title === 'Notification' && PushInbox.normalize({}).url === '/');
  check('the real payload fields pass through', PushInbox.normalize({ title: 'Court change', body: 'Now on Court 2', url: '/tournament.html?client=demo' }).title === 'Court change');
  check('the facility is recovered from the url\'s ?client= (so an inbox message can be attributed without extra payload fields)', PushInbox.clientIdFromUrl('/tournament.html?client=demo&t=xyz') === 'demo');
  check('a url with no client param -> no facility guess', PushInbox.clientIdFromUrl('/tournament.html') === null);
  check('a malformed url never throws, just gives up cleanly', PushInbox.clientIdFromUrl(undefined) === null && PushInbox.clientIdFromUrl('') === null);
  check('two calls for the same payload never collide on id (each notification gets its own record)', PushInbox.normalize({ tag: 'x' }, 1000).id !== PushInbox.normalize({ tag: 'x' }, 1000).id);
}

section('wiring: index.html tracks bookings and games into the cross-facility index');
check('my-active.js is loaded', /<script src="\/my-active\.js"><\/script>/.test(indexHtml));
check('a normal court reservation is tracked at the moment it\'s created', /bookings\.unshift\(newBooking\);\s*saveBookings\(bookings\);\s*renderSchedule\(\);\s*renderBookingsList\(\);\s*if\(adminUnlocked\) renderAdminBookings\(\);[^]*?MyActive\.add\(\{ clientId: currentClientId, kind: 'booking', refId: newBooking\.id \}\);/.test(indexHtml));
check('the reserve-a-court-on-create booking is tracked too', /bookings\.unshift\(newBooking\);\s*saveBookings\(bookings\);\s*MyActive\.add\(\{ clientId: currentClientId, kind: 'booking', refId: newBooking\.id \}\);\s*ogEnsureLinkedQueue/.test(indexHtml));
check('ogTrackMyGame is the single choke point for tracking a game (covers both create and join, since both already call it)', /function ogTrackMyGame\(gameId, role, token\)\{[^]*?MyActive\.add\(\{ clientId: currentClientId, kind: 'game', refId: gameId \}\);\s*\}/.test(indexHtml));
check('ogTrackMyGame really is called from both the create and the join paths', /ogTrackMyGame\(ref\.id, 'creator', creatorToken\)/.test(indexHtml) && /ogTrackMyGame\(gameId, 'player', null\)/.test(indexHtml));

section('wiring: root-route landing picks picker.html vs my-matches.html');
const landingLogic = grab(indexHtml, 'function _isReturningVisitor(){', "} else if (!currentClientId && FB_ENABLED) {");
check('the redirect decision now delegates to the shared MyActive.hasAnyLocalTrace() (one source of truth, not a duplicated copy)', /function _isReturningVisitor\(\)\{\s*return typeof MyActive !== 'undefined' && MyActive\.hasAnyLocalTrace\(\);\s*\}/.test(indexHtml));
check('root path with no ?client redirects based on that check', /window\.location\.replace\(_isReturningVisitor\(\) \? '\/my-matches\.html' : '\/picker\.html'\)/.test(landingLogic));
check("'my-matches' is a reserved path segment so it's never misread as a tenant slug", /RESERVED_PATH_SEGMENTS = \[.*'my-matches'\]/.test(indexHtml));
check('my-active.js is loaded before the redirect logic runs (script order, not just presence)', indexHtml.indexOf('<script src="/my-active.js">') > 0 && indexHtml.indexOf('<script src="/my-active.js">') < indexHtml.indexOf('function _isReturningVisitor'));

section('wiring: Switch Facility always reaches the picker directly');
check('handleSwitchFacility navigates straight to /picker.html, not through / (which would just bounce back to My Matches for a returning visitor)', /function handleSwitchFacility\(\) \{[^]*?window\.location\.href = '\/picker\.html';\s*\}/.test(indexHtml));

section('wiring: tournament.html remembers the phone globally, not just per-facility');
const lookupFn = grab(tournamentHtml, 'async function lookupMyMatches(rawPhone){', '\nfunction ');
check('the existing per-facility phone memory (lsSet) is untouched', /lsSet\('phone', rawPhone\);/.test(lookupFn));
check('a facility-agnostic copy is also saved, keyed by the normalized (platformPlayers-shaped) id', /localStorage\.setItem\('cb_my_phone_v1', pid\)/.test(lookupFn));

section('wiring: sw.js records each push notification into the device-local inbox');
check('push-inbox.js is imported into the service worker', /importScripts\('\/push-inbox\.js'\)/.test(swJs));
check('both shared modules are precached (cache-first assets)', /'\/my-active\.js'/.test(swJs) && /'\/push-inbox\.js'/.test(swJs));
check('my-matches.html is precached as a secondary page', /'\/my-matches\.html'/.test(swJs));
check('the push handler shows the notification AND records it, and a recording failure never blocks the notification (Promise.all + .catch on the record call)', /Promise\.all\(\[\s*self\.registration\.showNotification\([^]*?PushInbox\.record\(d\) : Promise\.resolve\(\)\)\.catch\(\(\) => \{\}\),/.test(swJs));
check('the cache version was bumped for this deploy (stale sw.js would keep serving the old push handler)', /const CACHE_NAME = 'courtbooking-v31';/.test(swJs));

section('wiring: picker.html has a persistent My Matches entry point');
check('my-active.js is loaded on the picker too', /<script src="\/my-active\.js"><\/script>/.test(pickerHtml));
check('the card links straight to my-matches.html', /<a class="mymatches-card rise" href="\/my-matches\.html"/.test(pickerHtml));
check('the status is computed purely from localStorage (via MyActive), not a Firestore read -- instant, no network dependency', /function refreshMyMatchesStatus\(\)\{[^]*?MyActive\.hasAnyLocalTrace\(\)/.test(pickerHtml));
check('it\'s a binary signal (has-data / not), not a precise count -- honest about what a localStorage-only check can know', /hasData \? 'Saved on this device' : 'Nothing cached yet'/.test(pickerHtml));
check('the dot indicator actually reflects that binary state', /myMatchesDot\.classList\.toggle\('has-data', hasData\)/.test(pickerHtml));
check('the card carries its own small, low-opacity disclaimer (font-size 10px, low opacity -- kept deliberately minor, not a warning banner)', /\.mymatches-note\{font-size:10px;opacity:0\.4/.test(pickerHtml) && /Saved only on this device — clears with your browser data\./.test(pickerHtml));
check('it stays visible while the grid is showing, hidden during loading/error/empty states (same lifecycle as the other sections)', /myMatchesSection\.style\.display = '';/.test(pickerHtml) && /gridSection\.style\.display = 'none'; continueSection\.style\.display = 'none'; myMatchesSection\.style\.display = 'none';/.test(pickerHtml));
check('unlike the Continue card, it does not hide while actively searching (it is facility-agnostic)', !/query[^;]*myMatchesSection\.style\.display/.test(pickerHtml));

section('wiring: the Continue card offers Book / Find a game shortcuts');
check('two shortcut buttons sit under the Continue card (not nested inside its <button>, which would be invalid HTML)', /<\/button>\s*<div class="continue-actions">[^]*?data-go="book"[^]*?data-go="opengames"/.test(pickerHtml));
check('the shortcuts live INSIDE the lime .continue card (a div wrapping the main button + actions row)', /<div class="continue rise">\s*<button class="continue-main" id="continueBtn"[^]*?<div class="continue-actions">[^]*?<\/div>\s*<\/div>`;/.test(pickerHtml));
check('each shortcut selects the remembered facility and passes its route through', /b\.dataset\.go\)\)/.test(pickerHtml) && /function selectTenant\(clientId, label, route\)/.test(pickerHtml));
check('the route becomes a hash on the facility URL, which index.html already honors on load', /'\/\?client=' \+ encodeURIComponent\(clientId\) \+ \(route \? '#' \+ route : ''\)/.test(pickerHtml) && /routeTo\(location\.hash\.slice\(1\), true\)/.test(indexHtml));
check('the plain Continue card and facility tiles still open the facility home (no route)', /selectTenant\(last\.clientId \|\| last\.id, last\.name \|\| last\.clientId\)\);/.test(pickerHtml));

section('wiring: my-matches.html\'s page-level device-local disclaimer');
check('a single page-level note replaces the old inbox-only one, shown regardless of populated/empty state', /<div class="disclaimer">⏱ Reads information saved in this browser only\./.test(myMatchesHtml));
check('the old, narrower inbox-only disclaimer text is gone (consolidated, not duplicated)', !/Saved on this device only — clearing browser data or switching devices loses this history\./.test(myMatchesHtml));
check('the empty state explains WHY it\'s empty (device-local caching), not just that it is', /Nothing cached on this device yet\. Once you reserve a court, join a game, or look yourself up in a tournament — from this browser/.test(myMatchesHtml));

section('wiring: my-matches.html itself');
check('it reads the cross-facility index and the device-local inbox via the shared modules', /MyActive\.load\(\)/.test(myMatchesHtml) && /MyActive\.groupByClient\(/.test(myMatchesHtml) && /PushInbox\.list\(\)/.test(myMatchesHtml));
check('facility name/logo comes from the public tenantDirectory (same source picker.html already uses)', /tenantDirectory\/'/.test(myMatchesHtml));
check('tournament matches are found via the existing cross-tenant platformPlayers identity, not a new one', /platformPlayers\/'/.test(myMatchesHtml) && /memberTenants/.test(myMatchesHtml));
check('the whole page is clearly labeled as device-only, not synced (now a single page-level note, see below)', /Reads information saved in this browser only/.test(myMatchesHtml));
check('there\'s a way back to the facility picker from this page', /href="\/picker\.html"/.test(myMatchesHtml));
check('an empty state exists for a visitor with nothing tracked yet', /Nothing cached on this device yet/.test(myMatchesHtml));
check('game cards show the friendly Pending/Confirmed label, not the raw status', /badge \$\{gameBadge\(status\)\}">\$\{esc\(ogStatusLabel\(status\)\)\}/.test(myMatchesHtml));

section('regression guard: my-matches.html\'s copy of the reservation-expiry rule stays in sync with index.html\'s real one');
{
  const realExpire = grab(indexHtml, '// OG-EXPIRE-START', '// OG-EXPIRE-END');
  const mmExpire = grab(myMatchesHtml, '// MM-PURE-START', '// MM-PURE-END');
  const collapse = (s) => s.replace(/\s+/g, ''); // style differs between the two files (if( vs if (); compare logic only
  const bodyOf = (src, sig, close) => grab(src, sig, close).replace(/^function[^{]*\{/, '');
  check('the real OG_RESERVE_GRACE_MS (1 hour) is mirrored exactly', /const OG_RESERVE_GRACE_MS = 3600000;/.test(realExpire) && /const OG_RESERVE_GRACE_MS = 3600000;/.test(mmExpire));
  check(
    'ogReservationExpired\'s body is identical between the two copies',
    collapse(bodyOf(realExpire, 'function ogReservationExpired(game, allBookings){', '\n}')) === collapse(bodyOf(mmExpire, 'function ogReservationExpired(game, allBookings) {', '\n  }')),
    'bodies diverged -- update my-matches.html to match index.html\'s ogReservationExpired'
  );
  check(
    'ogReservationAwaitingPayment\'s body is identical between the two copies',
    collapse(bodyOf(realExpire, 'function ogReservationAwaitingPayment(game, allBookings){', '\n}')) === collapse(bodyOf(mmExpire, 'function ogReservationAwaitingPayment(game, allBookings) {', '\n  }')),
    'bodies diverged -- update my-matches.html to match index.html\'s ogReservationAwaitingPayment'
  );
  check(
    'ogEffectiveStatus\'s body is identical between the two copies (only the default-parameter, which needs a global that doesn\'t exist on this page, differs)',
    collapse(bodyOf(realExpire, 'function ogEffectiveStatus(game, allBookings = bookings){', '\n}')) === collapse(bodyOf(mmExpire, 'function ogEffectiveStatus(game, allBookings) {', '\n  }')),
    'bodies diverged -- update my-matches.html to match index.html\'s ogEffectiveStatus'
  );
  check(
    'ogStatusLabel\'s body is identical between the two copies',
    collapse(bodyOf(realExpire, 'function ogStatusLabel(status){', '\n}')) === collapse(bodyOf(mmExpire, 'function ogStatusLabel(status) {', '\n  }')),
    'bodies diverged -- update my-matches.html to match index.html\'s ogStatusLabel'
  );
}

section('my-matches.html pure functions (extracted, same technique as the rest of this suite)');
{
  const pureSrc = grab(myMatchesHtml, '// MM-PURE-START', '// MM-PURE-END');
  const api = new Function(`${pureSrc}\nreturn { isBookingActive, isGameActive, isTournamentActive, ogEffectiveStatus, ogStatusLabel };`)();

  check('an unpaid booking today or in the future is active', api.isBookingActive({ status: 'Pending', date: '2030-01-01' }, '2026-01-01'));
  check('a cancelled booking is never active, regardless of date', !api.isBookingActive({ status: 'Cancelled', date: '2030-01-01' }, '2026-01-01'));
  check('a past-dated booking is not active', !api.isBookingActive({ status: 'Pending', date: '2020-01-01' }, '2026-01-01'));
  check('a null/undefined booking is safely not active', !api.isBookingActive(null) && !api.isBookingActive(undefined));

  check('OPEN/FULL/RESERVED/RESERVATION_PENDING are active game statuses', api.isGameActive('OPEN') && api.isGameActive('FULL') && api.isGameActive('RESERVED') && api.isGameActive('RESERVATION_PENDING'));
  check('CANCELLED/EXPIRED/COMPLETED are not', !api.isGameActive('CANCELLED') && !api.isGameActive('EXPIRED') && !api.isGameActive('COMPLETED'));

  check('a tournament that hasn\'t ended yet is active', api.isTournamentActive({ startDate: '2030-01-01', endDate: '2030-01-02' }, '2026-01-01'));
  check('a tournament with no end date at all falls back to still-active (never silently hidden)', api.isTournamentActive({ startDate: '2030-01-01' }, '2026-01-01'));
  check('a tournament that fully ended in the past is not active', !api.isTournamentActive({ startDate: '2020-01-01', endDate: '2020-01-02' }, '2026-01-01'));

  const gm = (o = {}) => ({ id: 'g1', status: 'RESERVED', reservationId: 'b1', date: '2030-01-01', startHour: 18, endHour: 20, ...o });
  const bk = (o = {}) => ({ id: 'b1', status: 'Pending', createdAt: Date.now(), ...o });
  check('a lapsed unpaid reservation reports EXPIRED here too, same as index.html', api.ogEffectiveStatus(gm(), [bk({ createdAt: Date.now() - 3700000 })]) === 'EXPIRED');
  check('a still-pending, not-yet-expired reservation reports RESERVATION_PENDING here too', api.ogEffectiveStatus(gm(), [bk({ createdAt: Date.now() - 1000 })]) === 'RESERVATION_PENDING');
  check('once confirmed (Reserved/Paid), the same game reports RESERVED', api.ogEffectiveStatus(gm(), [bk({ status: 'Paid', createdAt: Date.now() - 3700000 })]) === 'RESERVED');
  check('the label mapping matches index.html\'s: Pending vs Confirmed, everything else passes through', api.ogStatusLabel('RESERVATION_PENDING') === 'Reservation Pending' && api.ogStatusLabel('RESERVED') === 'Reservation Confirmed' && api.ogStatusLabel('OPEN') === 'OPEN');
}

console.log(`\n=== RETURNING-VISITOR LANDING (MY MATCHES): ${passed}/${passed + failed} passed ===`);
process.exit(failed === 0 ? 0 : 1);
