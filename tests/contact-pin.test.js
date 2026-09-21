/* Map pin helpers from index.html, extracted from the real page and exercised.
   Usage: node tests/contact-pin.test.js */
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

const grab = (startMarker, endMarker) => {
  const a = html.indexOf(startMarker), b = html.indexOf(endMarker, a);
  if (a < 0 || b < 0) throw new Error('markers not found: ' + startMarker.slice(0, 40));
  return html.slice(a, b);
};
const src = grab('const round6 =', 'function contactSocials(c){');
const api = new Function(`${src}; return { parseMapInput, hasPin, mapPinUrl, mapDirectionsUrl, round6 };`)();

let passed = 0, failed = 0;
function check(name, ok, detail) { if (ok) passed++; else { failed++; console.log(`  FAIL: ${name}${detail ? ' -- ' + detail : ''}`); } }
const section = (t) => console.log(`\n${t}`);
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const P = api.parseMapInput;

section('parsing coordinates and links');
check('plain "lat, lng"', eq(P('14.5547, 121.0244'), { lat: 14.5547, lng: 121.0244 }));
check('whitespace or comma separated, negatives', eq(P('  -33.8688 151.2093 '), { lat: -33.8688, lng: 151.2093 }) && eq(P('-33.8688,-70.5'), { lat: -33.8688, lng: -70.5 }));
check('rounds to 6 decimals', eq(P('14.554729123456, 121.024412345678'), { lat: 14.554729, lng: 121.024412 }));
check('full Google Maps place link (@lat,lng)', eq(P('https://www.google.com/maps/place/Sports+Zone/@14.5547,121.0244,17z/data=!4m6'), { lat: 14.5547, lng: 121.0244 }));
check('the exact pin (!3d!4d) wins over the map centre (@)', eq(P('https://www.google.com/maps/place/X/@14.5,121.0,17z/data=!3m1!4b1!4m6!3m5!1s0x0:0x0!8m2!3d14.5547!4d121.0244'), { lat: 14.5547, lng: 121.0244 }));
check('?q= and query= and ll= forms', eq(P('https://maps.google.com/?q=14.5547,121.0244'), { lat: 14.5547, lng: 121.0244 }) && eq(P('https://www.google.com/maps/search/?api=1&query=14.5547%2C121.0244'), { lat: 14.5547, lng: 121.0244 }) && eq(P('https://maps.google.com/maps?ll=14.5547,121.0244&z=15'), { lat: 14.5547, lng: 121.0244 }));
check('short share links are reported, not guessed', eq(P('https://maps.app.goo.gl/abc123'), { short: true }) && eq(P('goo.gl/maps/xyz'), { short: true }));
check('out-of-range and junk are refused', P('95, 10') === null && P('10, 190') === null && P('hello') === null && P('https://example.com/nowhere') === null && P('') === null && P(null) === null && P(undefined) === null);
check('a single number is not a pin', P('14.5547') === null);
check('other schemes with numbers are not treated as pins', P('javascript:alert(1)') === null);

section('using a pin');
const pin = { lat: 14.5547, lng: 121.0244, address: '123 Demo St' };
check('hasPin: numbers and numeric strings, within range', api.hasPin(pin) && api.hasPin({ lat: '14.5', lng: '121.1' }) && api.hasPin({ lat: 0, lng: 0 }));
check('hasPin: nulls, blanks, junk and out-of-range are not pins', !api.hasPin({ lat: null, lng: null }) && !api.hasPin({ lat: '', lng: '' }) && !api.hasPin({ lat: 14.5 }) && !api.hasPin({ lat: 'x', lng: 1 }) && !api.hasPin({ lat: 91, lng: 0 }) && !api.hasPin(null) && !api.hasPin({}));
check('with a pin, "Find us" opens the exact spot', api.mapPinUrl(pin) === 'https://www.google.com/maps/search/?api=1&query=14.5547,121.0244');
check('with a pin, directions go to the coordinates', api.mapDirectionsUrl(pin) === 'https://www.google.com/maps/dir/?api=1&destination=14.5547,121.0244');
check('no pin: falls back to a search for the address (safely encoded)', api.mapPinUrl({ address: '123 Demo St, Makati & Co' }) === 'https://www.google.com/maps/search/?api=1&query=123%20Demo%20St%2C%20Makati%20%26%20Co' && api.mapDirectionsUrl({ address: 'A B' }) === 'https://www.google.com/maps/dir/?api=1&destination=A%20B');
check('no pin and no address: no link', api.mapPinUrl({}) === null && api.mapDirectionsUrl({}) === null);
check('links are always https to Google Maps (no injection through the address)', /^https:\/\/www\.google\.com\/maps\//.test(api.mapPinUrl({ address: '"><script>alert(1)</script>' })) && !/[<>"]/.test(api.mapPinUrl({ address: '"><script>alert(1)</script>' })));
check('numeric strings from storage become clean numbers in the URL', api.mapPinUrl({ lat: '14.5547', lng: '121.0244' }) === 'https://www.google.com/maps/search/?api=1&query=14.5547,121.0244');

section('wiring in the page');
check('admin form has the pin controls', ['bizUseLocationBtn', 'bizClearPinBtn', 'bizMapLinkInput', 'bizLatInput', 'bizLngInput', 'bizPinStatus'].every((id) => html.includes(`id="${id}"`)));
check('saving writes lat/lng (null when cleared)', /lat: pin\.lat, lng: pin\.lng/.test(html));
check('the Contact screen has a directions button and a pin-aware Find us row', /Get directions/.test(html) && /mapPinUrl\(c\)/.test(html));

console.log(`\n=== CONTACT PIN: ${passed}/${passed + failed} passed ===`);
process.exit(failed === 0 ? 0 : 1);
