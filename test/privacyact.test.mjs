// The Privacy Act (APP) content pack — checkpoint-content/privacyact.json.
// Skips when the private content repo is not checked out, like cps234.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const CONTENT_AVAILABLE = existsSync(new URL('../checkpoint-content/privacyact.json', import.meta.url));
const SKIP = CONTENT_AVAILABLE ? false : 'checkpoint-content/privacyact.json not present locally — private content repo not checked out';
const pack = CONTENT_AVAILABLE ? JSON.parse(readFileSync(new URL('../checkpoint-content/privacyact.json', import.meta.url))) : null;
const CheckpointLib = require('../public/checkpoint/lib.js');

describe('Privacy Act pack', { skip: SKIP }, () => {
  test('covers all 13 APPs and the three NDB duties', () => {
    const codes = pack.framework.controls.map(c => c.code);
    for (let n = 1; n <= 13; n++) assert.ok(codes.some(c => c.startsWith('APP' + n + '.')), 'APP ' + n + ' missing');
    ['NDB.26WH', 'NDB.26WK', 'NDB.26WL'].forEach(c => assert.ok(codes.includes(c), c));
  });
  test('codes are unique, and every control has guidance and a category label', () => {
    const codes = pack.framework.controls.map(c => c.code);
    assert.equal(new Set(codes).size, codes.length);
    const labelled = ['appGovernance', 'appCollection', 'appUse', 'appQuality', 'appSecurity', 'appRights', 'appNdb'];
    pack.framework.controls.forEach(c => {
      assert.ok(pack.guidance[c.code] && pack.guidance[c.code].how && pack.guidance[c.code].evidence, c.code);
      assert.ok(labelled.includes(c.cat), c.code + ' has unknown category ' + c.cat);
    });
  });
  test('every code resolves through parseMapTokens as privacyact', () => {
    pack.framework.controls.forEach(c => {
      assert.deepEqual(CheckpointLib.parseMapTokens('ISO27001 A.5.34 · ' + c.code).pop(), { fw: 'privacyact', code: c.code });
    });
  });
  test('every control cross-maps to ISO 27001 so the ISMS evidence carries over', () => {
    pack.framework.controls.forEach(c => assert.ok(CheckpointLib.parseMapTokens(c.map).some(t => t.fw === 'iso27001'), c.code));
  });
  test('the demo slice matches the pack word for word', () => {
    global.window = global.window || {};
    window.CHECKPOINT_CONFIG = window.CHECKPOINT_CONFIG || { scopesProvision: [] };
    require('../public/checkpoint/store.js');
    const byCode = Object.fromEntries(pack.framework.controls.map(c => [c.code, c]));
    window.DEMO_FRAMEWORK_SEEDS.privacyact.forEach(d => {
      assert.ok(byCode[d.code], d.code + ' not in pack');
      assert.equal(d.t, byCode[d.code].t, d.code);
      assert.equal(d.cat, byCode[d.code].cat, d.code);
    });
  });
  test('the 2026 automated-decision obligation carries its commencement date', () => {
    assert.match(pack.framework.controls.find(c => c.code === 'APP1.7').t, /10 December 2026/);
  });
});
