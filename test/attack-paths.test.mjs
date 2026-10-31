/* "How an attacker could get in" (lib attackPaths): common Microsoft 365
   intrusion routes read from the scan's failing and partial checks. */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import Lib from '../public/checkpoint/lib.js';

const require = createRequire(import.meta.url);
global.window = global.window || {};
window.CHECKPOINT_CONFIG = window.CHECKPOINT_CONFIG || { scopesProvision: [] };
require('../public/checkpoint/store.js');
const app = readFileSync(new URL('../public/checkpoint/app.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../public/checkpoint/index.html', import.meta.url), 'utf8');
const ids = new Set(window.CHECK_DEFS.map((c) => c.id));

describe('catalogue', () => {
  test('every link names real checks, and every path cites ATT&CK techniques', () => {
    for (const p of Lib.ATTACK_PATHS) {
      assert.ok(p.links.some((l) => !l.optional), p.id + ' has a required link');
      for (const l of p.links) for (const c of l.checks) assert.ok(ids.has(c), `${p.id}: ${c} is not a check`);
      assert.ok(p.techniques.length && p.techniques.every((t) => /^T\d{4}(\.\d{3})? \S/.test(t)), p.id + ' techniques');
    }
  });
});

describe('attackPaths', () => {
  test('a path shows only when every required link has a failing or partial check', () => {
    assert.deepEqual(Lib.attackPaths({ legacy: 'fail' }).paths, [], 'one link is not a path');
    const one = Lib.attackPaths({ legacy: 'fail', admins: 'review' });
    assert.deepEqual(one.paths.map((p) => p.id), ['spray']);
    assert.equal(one.paths[0].severity, 'Medium', 'detection not known to be weak');
    assert.equal(Lib.attackPaths({ legacy: 'fail', admins: 'review', alerts: 'fail' }).paths[0].severity, 'High');
    assert.deepEqual(Lib.attackPaths({ legacy: 'manual', admins: 'fail' }).paths, [], 'unmeasured is not weak');
  });
  test('says where to break each path: the required link with the fewest weak checks', () => {
    const p = Lib.attackPaths({ legacy: 'fail', 'mfa-all': 'review', admins: 'fail' }).paths[0];
    assert.deepEqual(p.breakWith, { role: 'Take control', checks: ['admins'] });
  });
  test('fix first is the check whose fix alone breaks the most paths', () => {
    const m = Lib.attackPaths({ sharing: 'pass', guests: 'review', dlp: 'fail', 'dormant-accounts': 'fail', 'access-review': 'pass', legacy: 'fail', admins: 'fail' });
    assert.deepEqual(m.paths.map((p) => p.id).sort(), ['leak', 'leaver', 'spray']);
    assert.equal(m.fixFirst.check, 'guests');
    assert.deepEqual(m.fixFirst.breaks.sort(), ['leak', 'leaver']);
  });
  test('a check that cannot break a path alone is never claimed to', () => {
    const m = Lib.attackPaths({ legacy: 'fail', 'mfa-all': 'fail', admins: 'fail', pim: 'fail' });
    assert.deepEqual(m.fixFirst.breaks, []);
    assert.deepEqual(m.fixFirst.appearsIn, ['spray']);
  });
});

describe('wiring', () => {
  test('shown on the Scan screen and as a board slide when there is a path', () => {
    assert.match(html, /<div id="scanFixFirst"><\/div>\s*<div id="scanAttackPaths"><\/div>/);
    assert.match(app, /renderScanFixFirst\(\);\n    renderAttackPaths\(\);/);
    assert.match(app, /attackPathModel\(\) && attackPathModel\(\)\.paths\.length \? \[boardroomSlideAttackPaths\] : \[\]/);
    assert.match(app, /not evidence of a compromise/);
  });
});
