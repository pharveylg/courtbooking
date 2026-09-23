/* Pure physics math behind the picker's interactive pickleball: how big it
   must grow to cover the screen (the warp transition), circle-vs-box
   collision, bounce reflection, and device-tilt -> gravity conversion.
   Usage: node tests/pickle-ball.test.js */
const PB = require('../pickle-ball.js');

let passed = 0, failed = 0;
function check(name, ok, detail) { if (ok) passed++; else { failed++; console.log(`  FAIL: ${name}${detail ? ' -- ' + detail : ''}`); } }
const section = (t) => console.log(`\n${t}`);
const close = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

section('coverScale (the warp target size)');
check('covers a centered ball\'s farthest corner exactly at scale*r, with a 12% margin', (() => {
  const s = PB.coverScale(400, 300, 800, 600, 22);
  const farthest = Math.hypot(400, 300);
  return close(s, (farthest / 22) * 1.12, 1e-9);
})());
check('a centered ball needs less growth than one already at a corner (which must still reach the far corner)', PB.coverScale(400, 300, 800, 600, 22) < PB.coverScale(0, 0, 800, 600, 22));
check('never below the floor (avoids a shrinking "cover")', PB.coverScale(0, 0, 10, 10, 100) >= 8);
check('scales down as the viewport shrinks', PB.coverScale(200, 200, 400, 400, 22) < PB.coverScale(200, 200, 1600, 1600, 22));

section('circleRectHit (collision)');
check('far away -> no hit', PB.circleRectHit(0, 0, 20, 100, 100, 50, 50) === null);
check('touching the right edge -> normal points right (away from the box)', (() => {
  const h = PB.circleRectHit(115, 50, 20, 0, 0, 100, 100); // ball just past the right edge
  return h && close(h.nx, 1) && close(h.ny, 0) && h.pen > 0;
})());
check('touching the top edge -> normal points up', (() => {
  const h = PB.circleRectHit(50, -15, 20, 0, 0, 100, 100);
  return h && close(h.nx, 0) && close(h.ny, -1);
})());
check('a corner hit points diagonally away from that corner', (() => {
  const h = PB.circleRectHit(-10, -10, 20, 0, 0, 100, 100);
  return h && h.nx < 0 && h.ny < 0 && close(Math.hypot(h.nx, h.ny), 1);
})());
check('center landed inside the box -> ejects along the nearest (shortest) side', (() => {
  const h = PB.circleRectHit(5, 50, 20, 0, 0, 100, 100); // 5px from the left edge, well inside
  return h && close(h.nx, -1) && close(h.ny, 0) && h.pen > 20;
})());
check('penetration grows the deeper the ball has gone in', (() => {
  const shallow = PB.circleRectHit(95, 50, 20, 0, 0, 100, 100).pen;
  const deep = PB.circleRectHit(85, 50, 20, 0, 0, 100, 100).pen;
  return deep > shallow;
})());

section('bounceVelocity (reflection)');
check('a straight-on hit reverses and scales the OUTGOING speed by restitution', (() => {
  const v = PB.bounceVelocity(0, 300, 0, -1, 0.9); // moving down, into a surface whose outward normal points up
  return v && close(v.vx, 0) && close(v.vy, -300 * 0.9, 1e-6);
})());
check('already moving away from the surface -> no bounce (null)', PB.bounceVelocity(0, -300, 0, -1, 0.9) === null);
check('restitution 1 preserves speed (perfectly elastic)', (() => {
  const v = PB.bounceVelocity(400, 0, -1, 0, 1);
  return close(Math.hypot(v.vx, v.vy), 400);
})());
check('"bouncy" (>1) adds energy on impact', (() => {
  const v = PB.bounceVelocity(0, 300, 0, -1, 1.05);
  return Math.abs(v.vy) > 300;
})());
check('a glancing hit only reflects the normal component, tangential speed untouched', (() => {
  const v = PB.bounceVelocity(500, 300, 0, -1, 0.9); // moving mostly sideways, and into the surface along y
  return v && close(v.vx, 500); // tangent (x) untouched by a normal along y
})());

section('gravityFromTilt (device orientation -> gravity vector)');
check('flat and level -> mostly straight down (the resting bias)', (() => {
  const g = PB.gravityFromTilt(0, 0, 1000);
  return close(g.x, 0) && g.y > 300;
})());
check('tilted right (positive gamma) pulls gravity right', PB.gravityFromTilt(0, 45, 1000).x > 0);
check('tilted left (negative gamma) pulls gravity left', PB.gravityFromTilt(0, -45, 1000).x < 0);
check('tilted forward (positive beta) pulls gravity further down', PB.gravityFromTilt(45, 0, 1000).y > PB.gravityFromTilt(0, 0, 1000).y);
check('tilted back (negative beta) can pull gravity upward', PB.gravityFromTilt(-90, 0, 1000).y < 0);
check('clamped to the requested magnitude on each axis, however extreme the tilt', (() => {
  const g = PB.gravityFromTilt(999, 999, 500);
  return Math.abs(g.x) <= 500 && Math.abs(g.y) <= 500;
})());
check('garbage input does not throw and stays finite', (() => {
  const g = PB.gravityFromTilt(NaN, undefined, 800);
  return Number.isFinite(g.x) && Number.isFinite(g.y);
})());

section('wiring in picker.html');
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'picker.html'), 'utf8');
const pbSrc = fs.readFileSync(path.join(__dirname, '..', 'pickle-ball.js'), 'utf8');
check('the module is loaded', /<script src="\/pickle-ball\.js"><\/script>/.test(html));
check('the ambient toy is started once on load', /PickleBall\.start\(\)/.test(html));
check('only an explicit opt-in list are colliders -- no blanket page scan', /PickleBall\.scan\(/.test(html) && !/data-pb-ignore/.test(html));
check('small text is never tagged as a collider (meta lines, labels, footer, feature pills)', !/class="tenant-meta[^"]*"\s+data-pb/.test(html) && !/class="label[^"]*"\s+data-pb/.test(html) && !/class="feature-pill[^"]*"\s+data-pb/.test(html) && !/class="continue-meta[^"]*"\s+data-pb/.test(html) && !/<footer[^>]*data-pb/.test(html));
check('real controls are tagged (logo, search, install/dismiss/retry buttons)', /class="mark"[^>]*data-pb=/.test(html) && /id="searchInput"[^>]*data-pb=/.test(html) && /id="installBtn"[^>]*data-pb=/.test(html) && /id="installDismiss"[^>]*data-pb=/.test(html) && /class="retry-btn"[^>]*data-pb=/.test(html));
check('cards themselves are excluded (hero, continue, tenant tile) -- they leave too little room for the ball to move', !/class="hero rise"[^>]*data-pb=/.test(html) && !/class="continue rise"[^>]*data-pb=/.test(html) && !/class="tenant-tile rise"[^>]*data-pb=/.test(html));
check('bold callouts inside those cards ARE tagged: the hero headline, the continue title, each facility name', /<h1 data-pb="Headline"/.test(html) && /class="continue-title"[^>]*data-pb=/.test(html) && /class="tenant-name"[^>]*data-pb=/.test(html));
check('icons inside those cards ARE tagged: logos and arrows, on both the continue card and every tile', /class="logo[^"]*"\s+data-pb=/.test(html) && /class="continue-arrow"[^>]*data-pb=/.test(html) && /class="tenant-arrow"[^>]*data-pb=/.test(html));
check('small text next to those callouts is still never tagged (the meta line, the "Next open" line)', !/class="tenant-meta[^"]*"[^>]*data-pb=/.test(html) && !/class="continue-meta[^"]*"[^>]*data-pb=/.test(html) && !/class="continue-next[^>]*data-pb=/.test(html));
check('a facility pick launches the warp using the live ball, then navigates on cover', /PickleBall\.warp\(\{[^}]*label:/.test(html) && /onCover:\s*go/.test(html));
check('no artificial minimum hold is added -- the destination\'s own loading screen is unavoidable once it starts, so padding this further has no benefit', !/hold:\s*0\.\d/.test(html));
check('the hand-off to onCover waits only for the prefetch (or its timeout), not a fixed dwell', /if\(!wCoverFired && wLoadDone\)/.test(pbSrc.replace(/\s+/g, ' ').replace(/if \(/g, 'if(')) && !/wT >= 1 && wLoadDone\) \{ wCoverFired/.test(pbSrc.replace(/\s+/g, ' ')));
check('re-render after search/data changes re-measures the new tile boxes', (html.match(/PickleBall\.scan\(/g) || []).length >= 1 && /PickleBall\.invalidate\(\)/.test(html));
check('a "tilt to play" affordance exists and asks the engine, not the raw browser API, to request permission', /enableTilt/.test(html));
check('service worker cache was bumped for the new script', /courtbooking-v(2[3-9]|[3-9]\d)/.test(fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8')));

check('the ball was made smaller than its original 44px/22px-radius size', /width:36px;height:36px/.test(pbSrc) && /const R = 18/.test(pbSrc));

section('prefetching the destination while the ball covers the screen (option 1)');
const grab = (src, a, b) => { const i = src.indexOf(a), j = src.indexOf(b, i); if (i < 0 || j < 0) throw new Error('markers not found: ' + a.slice(0, 40)); return src.slice(i, j); };
const appHtml = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const appNorm = grab(appHtml, 'function normalizeClientConfig(raw) {', '/* ---------- Tenant suspend/pause status');
const pickerNorm = grab(html, 'function normalizeClientConfig(raw) {', 'async function warmClientConfigCache');
const appFn = new Function(`${appNorm}\nreturn normalizeClientConfig;`)();
const pickerFn = new Function(`${pickerNorm}\nreturn normalizeClientConfig;`)();
const sameJson = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const samples = [
  null, undefined, {},
  { business: { name: 'Already Nested' }, theme: { primary: '#111' } },
  { businessName: 'Ace Pickleball', tagline: 'Play hard', address: '123 St', contactPhone: '0917', social: { facebook: 'fb.co/ace' } },
  { logoUrl: 'x.png', faviconUrl: 'f.png', theme: { primaryColor: '#D6FF5F' }, hours: { close: 22 }, rates: { hourly: 300 } },
];
check('picker.html\'s copy of normalizeClientConfig agrees with index.html\'s on every sample (the prefetch cache must match the shape the destination page expects)', samples.every((s) => sameJson(appFn(s), pickerFn(s))), samples.map((s) => JSON.stringify(appFn(s)) === JSON.stringify(pickerFn(s))).join(','));
check('picking a facility prefetches and caches its config under the exact key index.html reads first', /db\.doc\('clients\/' \+ clientId \+ '\/config\/state'\)\.get\(\)/.test(html) && /localStorage\.setItem\('cb_client_config_v7_' \+ clientId, JSON\.stringify\(normalizeClientConfig\(snap\.data\(\)\.data\)\)\)/.test(html));
check('the prefetch runs during the warp\'s hold phase via its `load` hook', /load: \(\) => Promise\.race\(\[warmClientConfigCache\(clientId\)/.test(html));
check('a slow or failed prefetch can never hang the transition -- it is always raced against a timeout', /new Promise\(\(r\) => setTimeout\(r, 1200\)\)/.test(html));
check('the tenant\'s own pause status is deliberately left alone (index.html\'s comment says why: it must never be cached)', !/status\/state.*localStorage\.setItem/.test(html.replace(/\n/g, ' ')));

console.log(`\n=== PICKLE BALL: ${passed}/${passed + failed} passed ===`);
process.exit(failed === 0 ? 0 : 1);
