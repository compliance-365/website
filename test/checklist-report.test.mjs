// Every readiness checklist draws its PDF with the one shared report
// (public/assets/checklist-report.js), so the reports stay aligned:
// same layout, brand fonts and colours, and the question guidance.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const CHECKLISTS = ['iso27001', 'iso27701', 'iso42001', 'soc2', 'essential-eight', 'disp-ism-irap', 'is18'];

for (const name of CHECKLISTS) {
  test(`${name}: uses the shared report and publishes its guidance`, () => {
    const s = read(`src/pages/checklist/${name}.astro`);
    assert.match(s, /assets\/checklist-report\.js/);
    assert.match(s, /id="cl-guidance"/);
    assert.match(s, /window\.c365ChecklistReport\(/);
    assert.doesNotMatch(s, /new jsPDF\(/, 'no page-specific PDF drawing');
  });
}

test('the report ships its brand fonts and their licences', () => {
  for (const f of ['manrope-regular.ttf', 'manrope-bold.ttf', 'bricolage-bold.ttf', 'OFL-manrope.txt', 'OFL-bricolage.txt']) {
    assert.ok(existsSync(new URL('../public/assets/fonts/pdf/' + f, import.meta.url)), f);
  }
  const js = read('public/assets/checklist-report.js');
  assert.match(js, /window\.c365ChecklistReport = function/);
  assert.match(js, /\/assets\/fonts\/pdf\//);
});

for (const name of CHECKLISTS) {
  test(`${name}: opens on the questions and asks only name, email and organisation`, () => {
    const s = read(`src/pages/checklist/${name}.astro`);
    assert.match(s, /<div id="stage-1" class="stage" style="display:none;">/, 'details step hidden at first');
    assert.match(s, /<div id="stage-2" class="stage">/, 'questions shown at first');
    assert.match(s, /var reqIds = \['org-name','contact-name','contact-email'\];/);
    assert.match(s, /if \(!window\.__clDetailsDone\) \{ setStage\(1\); return; \}/, 'report button asks for details first');
  });
}
