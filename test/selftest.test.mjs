// Wires public/checkpoint/selftest.js into `npm test`/CI — the same
// pure-logic checks the hidden in-app diagnostics view (?selftest=1,
// demo mode only) runs in the browser, run here headlessly on every
// push. Per ACCEPTANCE.md §2: this is not a substitute for that
// document's manual tenant pass, only a regression net for the pieces
// that don't need a real tenant to exercise.
//
// selftest.js is a plain (non-module) script assigning onto `window`,
// same pattern as every other Checkpoint file this test suite already
// requires this way — stub `window`/`location`/`crypto` first (Node
// 22 exposes WebCrypto as a global already, but we reference it
// explicitly here for clarity, same as build-content-packs.mjs does).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
global.window = global.window || {};
global.location = global.location || { href: 'https://example.com/checkpoint/index.html' };
window.CHECKPOINT_CONFIG = window.CHECKPOINT_CONFIG || { scopesProvision: [] };
require('../public/checkpoint/store.js');
require('../public/checkpoint/guidance.js');
window.CheckpointLib = require('../public/checkpoint/lib.js');
require('../public/checkpoint/report.js');
require('../public/checkpoint/selftest.js');

describe('CheckpointSelfTest.run() — every pure-logic check passes', () => {
  test('window.CheckpointSelfTest is exposed with a run() function', () => {
    assert.equal(typeof window.CheckpointSelfTest, 'object');
    assert.equal(typeof window.CheckpointSelfTest.run, 'function');
  });

  test('run() resolves an array of { group, name, pass, detail } and every check passes', async () => {
    const results = await window.CheckpointSelfTest.run();
    assert.ok(Array.isArray(results));
    assert.ok(results.length > 0, 'expected at least one check to run');
    results.forEach((r) => {
      assert.equal(typeof r.group, 'string');
      assert.equal(typeof r.name, 'string');
      assert.equal(typeof r.pass, 'boolean');
    });
    const failed = results.filter((r) => !r.pass);
    assert.deepEqual(failed, [], `self-test check(s) failed:\n${failed.map((r) => `  [${r.group}] ${r.name}: ${r.detail}`).join('\n')}`);
  });

  test('covers every group the task specification asks for', async () => {
    const results = await window.CheckpointSelfTest.run();
    const groups = new Set(results.map((r) => r.group));
    ['Registry', 'Scoring', 'Residual', 'Entitlement', 'Charts', 'CSV export'].forEach((g) => {
      assert.ok(groups.has(g), `expected a "${g}" check group, got: ${[...groups].join(', ')}`);
    });
  });

  test('a genuinely broken registry (dangling map reference within a populated framework) is caught, not silently passed', async () => {
    // mutate a live control's map field to point at a code that
    // doesn't exist, confirming the check is a real assertion and not
    // a no-op — then restore it so this test doesn't leak state into
    // whichever test runs next.
    const original = window.FRAMEWORKS.iso27001.controls[0].map;
    window.FRAMEWORKS.iso27001.controls[0].map = 'ISO27001 A.99.99';
    try {
      const results = await window.CheckpointSelfTest.run();
      const mapCheck = results.find((r) => /map reference/.test(r.name));
      assert.ok(mapCheck, 'expected a map-reference registry check to exist');
      assert.equal(mapCheck.pass, false);
      assert.match(mapCheck.detail, /A\.99\.99/);
    } finally {
      window.FRAMEWORKS.iso27001.controls[0].map = original;
    }
  });
});
