// DISP/IRAP: the ISM's PROTECTED baseline as opt-in rows, the draft
// system security plan, IRAP assessor findings, and control titles that
// fit SharePoint's 255-character Title column.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
global.window = global.window || {};
window.CHECKPOINT_CONFIG = window.CHECKPOINT_CONFIG || { scopesProvision: [] };
require('../public/checkpoint/store.js');

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const app = read('public/checkpoint/app.js');
const PACK_URL = new URL('../checkpoint-content/dispirap.json', import.meta.url);
const HAVE_PACK = existsSync(PACK_URL);

describe('ISM rows in the DISP/IRAP pack', { skip: !HAVE_PACK }, () => {
  const pack = HAVE_PACK ? JSON.parse(readFileSync(PACK_URL, 'utf8')) : null;
  const ism = HAVE_PACK ? pack.extra.ismControls : [];

  test('the whole PROTECTED baseline, keyed so it never collides with RFFR', () => {
    assert.ok(ism.length > 1000, `only ${ism.length} ISM controls`);
    const codes = new Set();
    ism.forEach((c) => {
      assert.match(c.code, /^DISP-ISM-\d{4}$/);
      assert.equal(c.code.replace('DISP-', ''), c.ism);
      assert.ok(!codes.has(c.code), 'duplicate ' + c.code);
      codes.add(c.code);
      assert.ok(c.t && c.t.length > 10, c.code + ' has no requirement text');
    });
  });

  test('every ISM row has a guideline category with a label', () => {
    ism.forEach((c) => assert.match(app, new RegExp("'?" + c.cat.replace('-', '\\-') + "'?: '"), `${c.code}: no SOA_CAT_LABELS entry for ${c.cat}`));
    pack.framework.controls.forEach((c) => assert.equal(c.cat, 'dispMembership'));
  });

  test('the source and the ACSC licence are recorded', () => {
    assert.match(pack.sourceRef.ismSource, /OSCAL/);
    assert.match(pack.sourceRef.ismAttribution, /Commonwealth of Australia.*CC BY 4\.0/);
  });

  test('the demo sample is real ISM text from the pack', () => {
    const byCode = Object.fromEntries(ism.map((c) => [c.code, c]));
    window.DEMO_DISP_ISM.forEach((c) => assert.equal(c.t, byCode[c.code] && byCode[c.code].t, c.code));
  });
});

describe('opt-in, not seeded by default', () => {
  test('ISM rows are never part of the default seed', () => {
    assert.ok(!window.allControlSeeds().some((c) => /^DISP-ISM-/.test(c.code)));
    assert.equal(window.DEFAULT_SETTINGS ? window.DEFAULT_SETTINGS.dispIrapIsm : 'off', 'off');
  });
  test('they show on the SoA only when the switch is on', () => {
    assert.match(app, /c\.id\.indexOf\('DISP-ISM-'\) === 0\) \{\s*return \(\(S\.settings && S\.settings\.dispIrapIsm\) \|\| 'off'\) === 'protected';/);
    assert.match(app, /setDispIrapIsm: async function/);
    assert.match(read('public/checkpoint/index.html'), /id="dispIrapIsmRow"/);
  });
});

describe('system security plan and IRAP findings', () => {
  test('a draft SSP report, tied to DISP/IRAP', () => {
    assert.match(app, /ssp: function \(\) \{\s*var fw = 'dispirap';/);
    assert.match(read('public/checkpoint/index.html'), /data-id="ssp">Generate</);
  });
  test('IRAP findings are actions sourced "IRAP assessment", prioritised by the assessor\'s rating', () => {
    assert.match(app, /var IRAP_FINDING_SOURCE = 'IRAP assessment';/);
    assert.match(app, /\{ Extreme: 'Critical', High: 'High', Medium: 'Medium', Low: 'Low' \}/);
  });
});

describe('control titles fit SharePoint', () => {
  test('long titles are cut to 255 characters with an ellipsis; short ones are untouched', () => {
    assert.equal(window.spTitle('Short title'), 'Short title');
    const cut = window.spTitle('x'.repeat(1400));
    assert.equal(cut.length, 255);
    assert.ok(cut.endsWith('…'));
  });
  test('every Controls write goes through it, and the app restores the full text', () => {
    const store = read('public/checkpoint/store.js');
    assert.doesNotMatch(store, /addItem\('Controls', \{ Title: c\.t,/);
    assert.match(app, /function restoreFullControlTitles\(\)/);
  });
});

describe('SOC 2 report scope', () => {
  test('Security is always in scope; the optional categories can be left out, all in by default', () => {
    assert.equal(window.DEFAULT_SETTINGS.soc2Categories, 'A,C,PI,P');
    assert.match(app, /return !tsc \|\| tsc === 'CC' \|\| soc2CategoriesInScope\(\)\.indexOf\(tsc\) !== -1;/);
    assert.match(app, /var m = \/\^\(CC\|PI\|A\|C\|P\)\\d\/\.exec/);
  });
  test('the new settings and finding actions are blocked for read-only users', () => {
    ['setDispIrapIsm', 'raiseIrapFinding', 'toggleSoc2Category'].forEach((a) => assert.match(app, new RegExp("MUTATING_ACTIONS = new Set\\(\\[[\\s\\S]*'" + a + "'")));
  });
});

describe('applying an activation file in the Licence panel', () => {
  test('loads the newly licensed packs and adds their controls without a reload', () => {
    const i = app.indexOf('applyEntitlementFile: async function');
    const body = app.slice(i, app.indexOf("if (fileInput) fileInput.value = '';", i));
    assert.match(body, /await mergeLicensedPacks\(result\.evalResult\);/);
    assert.match(body, /await Store\.reconcileControls\(\);/);
  });
});
