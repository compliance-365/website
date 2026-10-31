/* Australian regulatory updates (lib REG_UPDATES / regUpdatesFor): each
   sourced, tied to real frameworks and controls, shown to the tenants it
   concerns, and recorded when reviewed. */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import Lib from '../public/checkpoint/lib.js';

const require = createRequire(import.meta.url);
global.window = global.window || {};
window.CHECKPOINT_CONFIG = window.CHECKPOINT_CONFIG || { scopesProvision: [] };
require('../public/checkpoint/store.js');
const app = readFileSync(new URL('../public/checkpoint/app.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../public/checkpoint/index.html', import.meta.url), 'utf8');
const FW = new Set(window.FRAMEWORK_ORDER.concat(['asdessentials']));
const checkIds = new Set(window.CHECK_DEFS.map((c) => c.id));
/* Control codes: ISO 27001 from store.js; premium frameworks from their
   content pack when the private repo is checked out. */
const codesFor = (fw) => {
  if (fw === 'iso27001') return new Set(window.FRAMEWORKS.iso27001.controls.map((c) => c.code));
  const u = new URL(`../checkpoint-content/${fw}.json`, import.meta.url);
  return existsSync(u) ? new Set(JSON.parse(readFileSync(u)).framework.controls.map((c) => c.code)) : null;
};

describe('the updates', () => {
  test('each is sourced, dated and says what to do', () => {
    const ids = new Set();
    for (const u of Lib.REG_UPDATES) {
      assert.ok(!ids.has(u.id), u.id + ' unique'); ids.add(u.id);
      assert.match(u.url, /^https:\/\//, u.id + ' source link');
      assert.match(u.date, /^\d{4}-\d{2}-\d{2}$/);
      if (u.effective) assert.match(u.effective, /^\d{4}-\d{2}-\d{2}$/);
      assert.ok(u.when && u.summary.length > 80 && u.actions.length, u.id);
    }
  });
  test('frameworks, controls and checks are real', () => {
    for (const u of Lib.REG_UPDATES) {
      for (const f of u.frameworks) assert.ok(FW.has(f), `${u.id}: ${f}`);
      for (const [fw, codes] of Object.entries(u.controls)) {
        const real = codesFor(fw);
        if (real) for (const c of codes) assert.ok(real.has(c), `${u.id}: ${fw} ${c}`);
      }
      for (const c of u.checks || []) assert.ok(checkIds.has(c), `${u.id}: check ${c}`);
    }
  });
});

describe('regUpdatesFor', () => {
  test('a tenant sees updates for its frameworks, and those for everyone', () => {
    const ids = (ent) => Lib.regUpdatesFor(Lib.REG_UPDATES, ent, {}, '2026-10-31').map((u) => u.id);
    assert.deepEqual(ids(['iso27001']), ['2026-09-ism']);
    assert.ok(ids(['iso27001', 'privacyact']).includes('2026-12-privacy-adm'));
    assert.ok(ids(['essential8']).includes('2026-10-asd-essentials'));
  });
  test('an action for an unlicensed framework is left out', () => {
    const ism = (ent) => Lib.regUpdatesFor(Lib.REG_UPDATES, ent, {}, '2026-10-31').find((u) => u.id === '2026-09-ism');
    assert.equal(ism(['iso27001']).actions.length, 4);
    assert.equal(ism(['iso27001', 'iso42001']).actions.length, 5);
  });
  test('an obligation still to start is flagged, and reviews are carried', () => {
    const r = Lib.regUpdatesFor(Lib.REG_UPDATES, ['privacyact'], { '2026-12-privacy-adm': { date: '2026-10-31', by: 'K' } }, '2026-10-31');
    const adm = r.find((u) => u.id === '2026-12-privacy-adm');
    assert.equal(adm.upcoming, true);
    assert.deepEqual(adm.reviewed, { date: '2026-10-31', by: 'K' });
    assert.equal(Lib.regUpdatesFor(Lib.REG_UPDATES, ['privacyact'], {}, '2026-12-11').find((u) => u.id === '2026-12-privacy-adm').upcoming, false);
  });
});

describe('wiring', () => {
  test('a Dashboard card; reviewing is recorded and audited; actions are due before an obligation starts', () => {
    assert.match(html, /id="regUpdatesCard"/);
    assert.match(app, /audit\('Regulatory update reviewed', 'Regulation', id, '', u\.title\);/);
    assert.match(app, /if \(u\.effective && u\.effective < due\) due = u\.effective;/);
    assert.match(app, /'regReview', 'regRaiseAction',/);
  });
});
