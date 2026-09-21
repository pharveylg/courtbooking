/* "Next open" rules and the wiring in the facility app and picker.
   Usage: node tests/next-open.test.js */
process.env.TZ = 'Asia/Manila'; // the app's home time zone: UTC+8, where the old todayISO() gave yesterday
const fs = require('fs');
const path = require('path');
const NO = require('../next-open.js');

let passed = 0, failed = 0;
function check(name, ok, detail) { if (ok) passed++; else { failed++; console.log(`  FAIL: ${name}${detail ? ' -- ' + detail : ''}`); } }
const section = (t) => console.log(`\n${t}`);
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const at = (h, m = 0, day = 21) => new Date(2026, 8, day, h, m); // Mon 21 Sep 2026, local time
const D = '2026-09-21';
const base = { baseHours: { bookingStart: 7, close: 22 }, courts: [{ id: 'c1', active: true }] };
const run = (o) => NO.compute({ ...base, now: at(10, 30), ...o });

section('dates and labels');
check('localISO is the local calendar day, even just after local midnight', NO.localISO(at(0, 5)) === D && NO.localISO(at(23, 59)) === D);
check('the old UTC-based version was a day behind here (why localISO exists)', (() => { const d = at(10); d.setHours(0, 0, 0, 0); return d.toISOString().slice(0, 10) === '2026-09-20'; })());
check('fmtHour', NO.fmtHour(0) === '0:00 AM' && NO.fmtHour(7) === '7:00 AM' && NO.fmtHour(12) === '12:00 PM' && NO.fmtHour(13) === '1:00 PM' && NO.fmtHour(16) === '4:00 PM' && NO.fmtHour(24) === '12:00 AM');

section('the basics');
check('empty day: the next whole hour', run({}) === 11);
check('on the hour: that hour is still open', run({ now: at(10, 0) }) === 10);
check('mid-hour: rounds up to the next hour', run({ now: at(10, 1) }) === 11 && run({ now: at(10, 59) }) === 11);
check('before opening: the opening hour', run({ now: at(5) }) === 7);
check('after closing: nothing left', run({ now: at(22) }) === null && run({ now: at(23, 30) }) === null);
check('no courts: nothing', run({ courts: [] }) === null);
check('inactive courts are ignored', run({ courts: [{ id: 'c1', active: false }] }) === null && run({ courts: [{ id: 'c1', active: false }, { id: 'c2' }] }) === 11);
check('court startHour (older field) is the opening hour', run({ now: at(5), courts: [{ id: 'c1', startHour: 13 }] }) === 13);

section('bookings, open play and staff hours');
const bk = (o) => ({ date: D, status: 'Reserved', court: 'c1', ...o });
check('a booking blocks its hour', run({ bookings: [bk({ start: 11, end: 12 })] }) === 12);
check('multi-hour booking blocks all of it', run({ bookings: [bk({ start: 11, end: 14 })] }) === 14);
check('other days do not block', run({ bookings: [bk({ date: '2026-09-22', start: 11, end: 12 })] }) === 11);
check('court-agnostic booking blocks every court', run({ courts: [{ id: 'c1' }, { id: 'c2' }], bookings: [bk({ court: undefined, start: 11, end: 12 })] }) === 12);
check('a booking on one court leaves the other open', run({ courts: [{ id: 'c1' }, { id: 'c2' }], bookings: [bk({ start: 11, end: 12 })] }) === 11);
check('open-play booking blocks too', run({ bookings: [bk({ status: 'OpenPlay', start: 11, end: 13 })] }) === 13);
check('stored open play blocks', run({ openPlays: [{ date: D, court: 'c1', start: 11, end: 12 }] }) === 12 && run({ openPlays: [{ date: '2026-09-22', start: 11, end: 12 }] }) === 11);
check('fully booked for the rest of the day: null', run({ bookings: [bk({ start: 7, end: 22 })] }) === null);
const mondayBlock = { template: { c1: { 1: { 11: true, 12: true } } }, overrides: {} };
check('staff template blocks on its weekday (21 Sep 2026 is a Monday)', run({ staffReserve: mondayBlock }) === 13);
check('staff template for another weekday does not', run({ staffReserve: { template: { c1: { 2: { 11: true } } }, overrides: {} } }) === 11);
check('a per-date override adds a block', run({ staffReserve: { template: {}, overrides: { c1: { [D]: { 11: true } } } } }) === 12);
check('a per-date override of false releases a templated hour', run({ staffReserve: { template: { c1: { 1: { 11: true } } }, overrides: { c1: { [D]: { 11: false } } } } }) === 11);
check('per-court hours override the facility hours', run({ now: at(5), courtHours: { c1: { bookingStart: 9, close: 12 } } }) === 9 && run({ now: at(13), courtHours: { c1: { bookingStart: 9, close: 12 } } }) === null);
check('the soonest across courts wins', run({ courts: [{ id: 'c1' }, { id: 'c2' }], bookings: [bk({ start: 11, end: 15 }), bk({ court: 'c2', start: 11, end: 13 })] }) === 13);
check('explicit dateISO looks at that day, not today', NO.compute({ ...base, now: at(10), dateISO: '2026-09-22', bookings: [bk({ date: '2026-09-22', start: 10, end: 11 })] }) === 11);

section('old staff-reserve saves are migrated');
const m1 = NO.migrateStaffReserve({ days: { 1: true } }, [{ id: 'c1' }, { id: 'c2' }]);
check('day flags become a 5-10pm block on every court', eq(Object.keys(m1.template), ['c1', 'c2']) && m1.template.c1['1']['17'] === true && m1.template.c1['1']['21'] === true && !m1.template.c1['1']['22']);
const m2 = NO.migrateStaffReserve({ days: { c1: { 3: true } } }, []);
check('per-court flags keep their courts', eq(Object.keys(m2.template), ['c1']) && m2.template.c1['3']['18'] === true);
check('new shape passes through; junk becomes empty', eq(NO.migrateStaffReserve({ template: { a: 1 }, overrides: { b: 2 } }, []), { template: { a: 1 }, overrides: { b: 2 } }) && eq(NO.migrateStaffReserve(null, []), { template: {}, overrides: {} }) && eq(NO.migrateStaffReserve('x', []), { template: {}, overrides: {} }));

section('wiring');
const app = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const picker = fs.readFileSync(path.join(__dirname, '..', 'picker.html'), 'utf8');
check('the app loads the module before its main script', app.indexOf('<script src="next-open.js"></script>') > -1 && app.indexOf('<script src="next-open.js"></script>') < app.indexOf('CLIENT WHITE-LABEL LAYER'));
check('the app uses the shared code (no private copies left)', /NextOpen\.compute\(/.test(app) && /NextOpen\.localISO\(/.test(app) && /NextOpen\.migrateStaffReserve\(/.test(app) && !/LEGACY_STAFF_HOURS/.test(app) && !/function todayISO\(\)\{\s*const d=new Date/.test(app));
check('the picker loads the module and uses it', /<script src="\/next-open\.js"><\/script>/.test(picker) && /NextOpen\.compute\(/.test(picker));

console.log(`\n=== NEXT OPEN: ${passed}/${passed + failed} passed ===`);
process.exit(failed === 0 ? 0 : 1);
