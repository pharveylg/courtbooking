/* Every player- and staff-facing page shows "Powered by DulaHQ", with DulaHQ linked
   to dulahq.app (new tab, no opener leak).  Usage: node tests/branding.test.js */
const fs = require('fs');
const path = require('path');

let passed = 0, failed = 0;
function check(name, ok, detail) { if (ok) passed++; else { failed++; console.log(`  FAIL: ${name}${detail ? ' -- ' + detail : ''}`); } }

const PAGES = { 'index.html': 2, 'picker.html': 1, 'tournament.html': 1, 'tournament-admin.html': 1, 'store.html': 1, 'billing.html': 1, 'gallery.html': 1 };
for (const [file, expected] of Object.entries(PAGES)) {
  const html = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
  const links = [...html.matchAll(/<a href="https:\/\/dulahq\.app"([^>]*)>DulaHQ<\/a>/g)];
  check(`${file}: ${expected} DulaHQ link(s)`, links.length === expected, `found ${links.length}`);
  check(`${file}: opens in a new tab safely`, links.every((m) => /target="_blank"/.test(m[1]) && /rel="noopener"/.test(m[1])));
  check(`${file}: reads "Powered by"`, (html.match(/Powered by <a href="https:\/\/dulahq\.app"/g) || []).length === expected);
  check(`${file}: the old faint text is gone`, !/Dulà HQ/.test(html));
  check(`${file}: badge is readable (not the old 40% text)`, (html.match(/class="dula-credit"/g) || []).length === expected);
}
console.log(`\n=== BRANDING: ${passed}/${passed + failed} passed ===`);
process.exit(failed === 0 ? 0 : 1);
