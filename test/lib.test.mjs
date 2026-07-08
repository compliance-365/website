// Zero-dependency tests for public/checkpoint/lib.js — the pure
// scoring/threshold logic that used to live only inside app.js's IIFE.
// Uses Node's built-in test runner and assert module; no framework, no
// devDependency to install or keep patched.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import CheckpointLib from '../public/checkpoint/lib.js';

const { band, residual, checkResult, score, readinessPct, suggestVendorCriticality } = CheckpointLib;

describe('band()', () => {
  test('Low for scores under 5', () => {
    assert.equal(band(1), 'Low');
    assert.equal(band(4), 'Low');
  });
  test('Medium for 5-9', () => {
    assert.equal(band(5), 'Medium');
    assert.equal(band(9), 'Medium');
  });
  test('High for 10-14', () => {
    assert.equal(band(10), 'High');
    assert.equal(band(14), 'High');
  });
  test('Critical for 15+', () => {
    assert.equal(band(15), 'Critical');
    assert.equal(band(25), 'Critical');
  });
});

describe('residual()', () => {
  test('no actions done -> inherent L/I unchanged', () => {
    const r = { L: 4, I: 4, actions: ['ACT-001', 'ACT-002'] };
    const actions = [{ id: 'ACT-001', status: 'Open' }, { id: 'ACT-002', status: 'In progress' }];
    assert.deepEqual(residual(r, actions), { L: 4, I: 4 });
  });
  test('each completed action reduces L by 1, floor 1', () => {
    const r = { L: 3, I: 5, actions: ['ACT-001', 'ACT-002', 'ACT-003'] };
    const actions = [
      { id: 'ACT-001', status: 'Done' }, { id: 'ACT-002', status: 'Done' }, { id: 'ACT-003', status: 'Open' }
    ];
    // 2 of 3 done -> L drops by 2 (floor 1), I unchanged since not ALL are done
    assert.deepEqual(residual(r, actions), { L: 1, I: 5 });
  });
  test('L never drops below 1 even with many completed actions', () => {
    const r = { L: 2, I: 3, actions: ['ACT-001', 'ACT-002', 'ACT-003', 'ACT-004'] };
    const actions = ['ACT-001', 'ACT-002', 'ACT-003', 'ACT-004'].map(id => ({ id, status: 'Done' }));
    // all 4 done -> L would be 2-4=-2, floored to 1; I drops by 1 since ALL actions done
    assert.deepEqual(residual(r, actions), { L: 1, I: 2 });
  });
  test('I only drops once every linked action is Done, floor 1', () => {
    const r = { L: 5, I: 1, actions: ['ACT-001'] };
    const actions = [{ id: 'ACT-001', status: 'Done' }];
    // I=1-1=0 floored to 1
    assert.deepEqual(residual(r, actions), { L: 4, I: 1 });
  });
  test('a risk with no linked actions never gets the all-done impact reduction', () => {
    const r = { L: 3, I: 4, actions: [] };
    assert.deepEqual(residual(r, []), { L: 3, I: 4 });
  });
});

describe('checkResult()', () => {
  test('scored:false always returns manual, regardless of scan state', () => {
    assert.equal(checkResult({ id: 'dlp', scored: false }, { lastResults: null }), 'manual');
    assert.equal(checkResult({ id: 'dlp', scored: false }, { lastResults: { dlp: 'fail' } }), 'manual');
  });
  test('no scan has ever run -> null', () => {
    assert.equal(checkResult({ id: 'mfa-all', scored: true }, { lastResults: null }), null);
  });
  test('returns the raw scan result once a scan has run', () => {
    const ctx = { lastResults: { 'mfa-all': 'review' } };
    assert.equal(checkResult({ id: 'mfa-all', scored: true }, ctx), 'review');
  });
  test('demo mode: a templated check flips to pass once every linked remediation action is Done', () => {
    const ctx = {
      lastResults: { legacy: 'fail' },
      isDemo: true,
      risks: [{ id: 'R-010', tpl: 'legacy', actions: ['ACT-050', 'ACT-051'] }],
      actions: [{ id: 'ACT-050', status: 'Done' }, { id: 'ACT-051', status: 'Done' }]
    };
    assert.equal(checkResult({ id: 'legacy', scored: true, tpl: 'legacy' }, ctx), 'pass');
  });
  test('demo mode: stays at the raw result if not every linked action is Done yet', () => {
    const ctx = {
      lastResults: { legacy: 'fail' },
      isDemo: true,
      risks: [{ id: 'R-010', tpl: 'legacy', actions: ['ACT-050', 'ACT-051'] }],
      actions: [{ id: 'ACT-050', status: 'Done' }, { id: 'ACT-051', status: 'Open' }]
    };
    assert.equal(checkResult({ id: 'legacy', scored: true, tpl: 'legacy' }, ctx), 'fail');
  });
  test('live mode never applies the demo remediation flip, even with matching data', () => {
    const ctx = {
      lastResults: { legacy: 'fail' },
      isDemo: false,
      risks: [{ id: 'R-010', tpl: 'legacy', actions: ['ACT-050'] }],
      actions: [{ id: 'ACT-050', status: 'Done' }]
    };
    assert.equal(checkResult({ id: 'legacy', scored: true, tpl: 'legacy' }, ctx), 'fail');
  });
});

describe('score()', () => {
  const CHECK_DEFS = [
    { id: 'a', scored: true }, { id: 'b', scored: true }, { id: 'c', scored: true },
    { id: 'd', scored: false } // never counted
  ];
  test('no scan yet -> floors at 5 (app.js only ever calls score() right after a scan populates lastResults, so this path is unreachable in practice, but the function itself treats an unscanned check as 0 points, not as excluded)', () => {
    assert.equal(score(CHECK_DEFS, { lastResults: null }), 5);
  });
  test('all pass -> 100', () => {
    const ctx = { lastResults: { a: 'pass', b: 'pass', c: 'pass' } };
    assert.equal(score(CHECK_DEFS, ctx), 100);
  });
  test('mixed pass/review/fail computes the weighted average, floored at 5', () => {
    // a=pass(1), b=review(0.5), c=fail(0) -> 1.5/3 = 50%
    const ctx = { lastResults: { a: 'pass', b: 'review', c: 'fail' } };
    assert.equal(score(CHECK_DEFS, ctx), 50);
  });
  test('all fail floors at 5, never 0', () => {
    const ctx = { lastResults: { a: 'fail', b: 'fail', c: 'fail' } };
    assert.equal(score(CHECK_DEFS, ctx), 5);
  });
  test('a scored:true check that resolves to manual this scan is excluded from the denominator, not counted as 0', () => {
    // a=pass(1), b=manual(excluded), c=pass(1) -> 2/2 = 100%, not 2/3
    const ctx = { lastResults: { a: 'pass', b: 'manual', c: 'pass' } };
    assert.equal(score(CHECK_DEFS, ctx), 100);
  });
  test('scored:false checks never enter the calculation at all', () => {
    const withManualCheck = [{ id: 'a', scored: true }, { id: 'd', scored: false }];
    const ctx = { lastResults: { a: 'pass' } };
    assert.equal(score(withManualCheck, ctx), 100);
  });
  test('accepts a checkResultFn override instead of a ctx (used by app.js)', () => {
    const fn = (c) => (c.id === 'a' ? 'pass' : c.id === 'b' ? 'fail' : 'manual');
    // a=pass(1), b=fail(0) -> 1/2 = 50%; c is scored:true but resolves 'manual' via fn -> excluded
    assert.equal(score(CHECK_DEFS, null, fn), 50);
  });
});

describe('readinessPct()', () => {
  test('0% when nothing is applicable', () => {
    assert.equal(readinessPct([{ app: false, st: 'Not started' }]), 0);
  });
  test('0% when applicable controls exist but none are implemented', () => {
    assert.equal(readinessPct([{ app: true, st: 'Not started' }, { app: true, st: 'In progress' }]), 0);
  });
  test('100% when every applicable control is implemented', () => {
    assert.equal(readinessPct([{ app: true, st: 'Implemented' }, { app: true, st: 'Implemented' }]), 100);
  });
  test('rounds to the nearest whole percent', () => {
    // 1 of 3 implemented = 33.33% -> rounds to 33
    const controls = [
      { app: true, st: 'Implemented' }, { app: true, st: 'Not started' }, { app: true, st: 'Not started' }
    ];
    assert.equal(readinessPct(controls), 33);
  });
  test('non-applicable controls never count toward the denominator', () => {
    const controls = [
      { app: true, st: 'Implemented' }, { app: false, st: 'Not started' }, { app: false, st: 'Not started' }
    ];
    assert.equal(readinessPct(controls), 100);
  });
  test('empty controls array -> 0, not NaN or a thrown error', () => {
    assert.equal(readinessPct([]), 0);
  });
});

describe('suggestVendorCriticality()', () => {
  test('health information, credentials, or production access -> Critical', () => {
    assert.equal(suggestVendorCriticality(['Health information']), 'Critical');
    assert.equal(suggestVendorCriticality(['Credentials & secrets']), 'Critical');
    assert.equal(suggestVendorCriticality(['Production system access']), 'Critical');
  });
  test('customer PII or financial data -> High', () => {
    assert.equal(suggestVendorCriticality(['Customer PII']), 'High');
    assert.equal(suggestVendorCriticality(['Financial / payment data']), 'High');
  });
  test('employee data or company confidential -> Medium', () => {
    assert.equal(suggestVendorCriticality(['Employee data']), 'Medium');
    assert.equal(suggestVendorCriticality(['Company confidential']), 'Medium');
  });
  test('public-only or nothing selected -> Low', () => {
    assert.equal(suggestVendorCriticality(['Public / non-sensitive only']), 'Low');
    assert.equal(suggestVendorCriticality([]), 'Low');
    assert.equal(suggestVendorCriticality(undefined), 'Low');
  });
  test('highest-sensitivity category wins when several are ticked', () => {
    assert.equal(suggestVendorCriticality(['Company confidential', 'Customer PII', 'Health information']), 'Critical');
    assert.equal(suggestVendorCriticality(['Public / non-sensitive only', 'Financial / payment data']), 'High');
  });
});
