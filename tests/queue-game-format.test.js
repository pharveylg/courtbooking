/* Configurable game format (points target + win condition) at queue creation,
   in both queue modules (index.html's facility queue, queue.html's standalone
   tool). The pure engine clamping (PickleScore.normalizeConfig: target 1-50,
   winBy 1-2) is covered in pickleball-scoring.test.js; this file checks each
   page's setup/creation form actually exposes the two new controls, reveals
   and validates the Custom points input against that same range, and writes
   the result into the new session's gameFormat -- same "setup field exists +
   gets wired into the new session object" pattern as
   tests/queue-winner-pdf.test.js. Usage: node tests/queue-game-format.test.js */
const fs = require('fs');
const path = require('path');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const indexHtml = read('index.html'), queueHtml = read('queue.html');

// Returns the full <input ...> tag containing id="attrId", regardless of
// where that attribute falls among the tag's other attributes.
function findTagById(html, attrId) {
  const marker = `id="${attrId}"`;
  const markerIdx = html.indexOf(marker);
  if (markerIdx === -1) return '';
  const tagStart = html.lastIndexOf('<', markerIdx);
  const tagEnd = html.indexOf('>', markerIdx);
  if (tagStart === -1 || tagEnd === -1) return '';
  return html.slice(tagStart, tagEnd + 1);
}

let passed = 0, failed = 0;
function check(name, ok, detail) { if (ok) passed++; else { failed++; console.log(`  FAIL: ${name}${detail ? ' -- ' + detail : ''}`); } }
const section = (t) => console.log(`\n${t}`);

const pages = [
  {
    name: 'index.html', html: indexHtml,
    targetSelectId: 'qTargetPoints', winSelectId: 'qWinCondition',
    customWrapperId: 'qCustomTargetWrapper', customInputId: 'qCustomTarget',
    hiddenAttr: 'class="hidden"',
  },
  {
    name: 'queue.html', html: queueHtml,
    targetSelectId: 'setTargetPoints', winSelectId: 'setWinCondition',
    customWrapperId: 'setCustomTargetField', customInputId: 'setCustomTarget',
    hiddenAttr: 'style="display:none"',
  },
];

for (const p of pages) {
  const { name, html } = p;
  section(`${name} -- setup form exposes the configurable game format`);

  check('a points-to-win control exists with 11/15/21/Custom options', new RegExp(`id="${p.targetSelectId}"[\\s\\S]{0,250}?value="11"[\\s\\S]{0,120}?value="15"[\\s\\S]{0,120}?value="21"[\\s\\S]{0,120}?value="custom"`, 'i').test(html));
  check('11 is the default selected option (today\'s fixed behavior)', new RegExp(`id="${p.targetSelectId}"[\\s\\S]{0,250}?<option value="11" selected`).test(html));

  check('a win-condition control exists offering Win by 2 and Sudden Death', new RegExp(`id="${p.winSelectId}"[\\s\\S]{0,250}?value="2"[\\s\\S]{0,120}?value="1"`, 'i').test(html) && new RegExp(`id="${p.winSelectId}"[\\s\\S]{0,350}?sudden death`, 'i').test(html));
  check('Win by 2 (value 2) is the default selected option', new RegExp(`id="${p.winSelectId}"[\\s\\S]{0,250}?<option value="2" selected`).test(html));

  check('a Custom points target number input exists, hidden until "Custom" is chosen', html.includes(`id="${p.customWrapperId}" ${p.hiddenAttr}`) && html.includes(`id="${p.customInputId}"`));
  const customInputTag = findTagById(html, p.customInputId);
  check('the Custom input is bounded 1-50 in the markup too, matching the engine\'s own range', customInputTag.includes('min="1"') && customInputTag.includes('max="50"'));

  section(`${name} -- the Custom input is revealed and validated, not just decorative`);
  check(`a change listener on #${p.targetSelectId} toggles the Custom wrapper based on value === 'custom'`, new RegExp(`${p.targetSelectId}[\\s\\S]{0,300}?addEventListener\\('change'[\\s\\S]{0,300}?=== 'custom'`).test(html));
  check('the Custom value is parsed and rejected outside 1-50, same bound as PickleScore.normalizeConfig(target: 1-50)', new RegExp(`parseInt\\(document\\.getElementById\\('${p.customInputId}'\\)\\.value, 10\\)[\\s\\S]{0,250}?target < 1 \\|\\| target > 50`).test(html));

  section(`${name} -- the new session's gameFormat is built from these fields`);
  check('winBy is read as 1 (Sudden Death) or 2 (Win by 2) from the win-condition control', new RegExp(`Number\\(document\\.getElementById\\('${p.winSelectId}'\\)\\.value\\) === 1 \\? 1 : 2`).test(html));
  check('the created/started session carries gameFormat.target and gameFormat.winBy from those two variables', /gameFormat:\s*\{\s*target,\s*winBy,\s*scoring:\s*'sideout'\s*\}/.test(html));
}

console.log(`\n=== QUEUE GAME FORMAT (points target + win condition): ${passed}/${passed + failed} passed ===`);
process.exit(failed === 0 ? 0 : 1);
