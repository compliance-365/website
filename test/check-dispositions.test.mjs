// Tests for per-check dispositions — the mechanism that lets a tenant
// say "we meet this control with something other than Microsoft" without
// being permanently punished for it by the posture score.
//
// The behaviour under test is deliberately concentrated in two pure
// functions in lib.js (activeDisposition() and checkResult()), because
// four separate call sites in app.js depend on them agreeing: the score,
// the scan view's own rendering, the risk-proposal loop, and the
// assurance observation set. If they ever disagreed, a tenant would see
// a check pass on one screen and fail on another, which is worse than
// either answer on its own.
//
// The assurance consequence — that a dispositioned check drops out of
// the observation set entirely, so a control can never reach
// 'demonstrated' on the strength of a tenant's own assertion — lives in
// app.js's assuranceForControl() and is exercised through the filter
// there rather than here; controlAssurance()'s own ranking is already
// covered in lib.test.mjs.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import CheckpointLib from '../public/checkpoint/lib.js';

const { activeDisposition, checkResult, score } = CheckpointLib;

const TODAY = '2026-06-15';
const FUTURE = '2027-01-01';
const PAST = '2026-01-01';

function disp(over) {
  return Object.assign({
    checkId: 'alerts', disposition: 'alternative', tool: 'CrowdStrike Falcon',
    justification: 'SOC monitoring delivered by CrowdStrike.', reviewDue: FUTURE
  }, over || {});
}

describe('activeDisposition()', () => {
  test('no dispositions at all -> null (the default for nearly every check)', () => {
    assert.equal(activeDisposition('alerts', undefined, TODAY), null);
    assert.equal(activeDisposition('alerts', [], TODAY), null);
  });

  test('a disposition for a different check does not leak across', () => {
    assert.equal(activeDisposition('logging', [disp()], TODAY), null);
  });

  test('an active alternative disposition is returned', () => {
    const d = activeDisposition('alerts', [disp()], TODAY);
    assert.ok(d);
    assert.equal(d.tool, 'CrowdStrike Falcon');
  });

  test('notApplicable is honoured the same way alternative is', () => {
    assert.ok(activeDisposition('alerts', [disp({ disposition: 'notApplicable' })], TODAY));
  });

  test('an unrecognised disposition value is ignored rather than trusted', () => {
    // Guards against a hand-edited SharePoint row silently suppressing a
    // check with a value the app never wrote.
    assert.equal(activeDisposition('alerts', [disp({ disposition: 'microsoft' })], TODAY), null);
    assert.equal(activeDisposition('alerts', [disp({ disposition: 'whatever' })], TODAY), null);
    assert.equal(activeDisposition('alerts', [disp({ disposition: '' })], TODAY), null);
  });

  test('LAPSES once ReviewDue has passed — this is the whole point of the expiry', () => {
    assert.equal(activeDisposition('alerts', [disp({ reviewDue: PAST })], TODAY), null);
  });

  test('is still active ON the review date itself, and lapses the day after', () => {
    assert.ok(activeDisposition('alerts', [disp({ reviewDue: TODAY })], TODAY));
    assert.equal(activeDisposition('alerts', [disp({ reviewDue: '2026-06-14' })], TODAY), null);
  });

  test('no ReviewDue at all stays active — a blank field must not silently revert a real disposition', () => {
    assert.ok(activeDisposition('alerts', [disp({ reviewDue: '' })], TODAY));
  });

  test('a null entry in the list does not throw', () => {
    assert.equal(activeDisposition('alerts', [null, undefined], TODAY), null);
  });
});

describe('checkResult() with dispositions', () => {
  const CHECK = { id: 'alerts', scored: true };

  test('alternative -> pass: the control is in place, just not via Microsoft', () => {
    const ctx = { lastResults: { alerts: 'fail' }, checkDispositions: [disp()], today: TODAY };
    assert.equal(checkResult(CHECK, ctx), 'pass');
  });

  test('notApplicable -> manual, so score() drops it from the denominator entirely', () => {
    const ctx = { lastResults: { alerts: 'fail' }, checkDispositions: [disp({ disposition: 'notApplicable' })], today: TODAY };
    assert.equal(checkResult(CHECK, ctx), 'manual');
  });

  test('a lapsed disposition falls through to the real scan result', () => {
    const ctx = { lastResults: { alerts: 'fail' }, checkDispositions: [disp({ reviewDue: PAST })], today: TODAY };
    assert.equal(checkResult(CHECK, ctx), 'fail');
  });

  test('scored:false still wins over any disposition', () => {
    const ctx = { lastResults: { alerts: 'fail' }, checkDispositions: [disp()], today: TODAY };
    assert.equal(checkResult({ id: 'alerts', scored: false }, ctx), 'manual');
  });

  test('before any scan has run, a disposition does not manufacture a pass', () => {
    // "We use CrowdStrike" is not a reason to report a result on a tenant
    // nobody has scanned yet — null means "not scanned", and stays that way.
    const ctx = { lastResults: null, checkDispositions: [disp()], today: TODAY };
    assert.equal(checkResult(CHECK, ctx), null);
  });

  test('a disposition beats the demo remediation flip', () => {
    const ctx = {
      lastResults: { legacy: 'fail' }, isDemo: true,
      risks: [{ id: 'R-1', tpl: 'legacy', actions: ['A-1'] }],
      actions: [{ id: 'A-1', status: 'Open' }],
      checkDispositions: [disp({ checkId: 'legacy' })], today: TODAY
    };
    assert.equal(checkResult({ id: 'legacy', scored: true, tpl: 'legacy' }, ctx), 'pass');
  });

  test('unchanged behaviour when no dispositions are supplied at all', () => {
    // Every existing caller that has not been updated must behave
    // exactly as it did before this feature existed.
    assert.equal(checkResult(CHECK, { lastResults: { alerts: 'review' } }), 'review');
    assert.equal(checkResult(CHECK, { lastResults: {} }), 'manual');
  });
});

describe('score() with dispositions', () => {
  const DEFS = [
    { id: 'a', scored: true }, { id: 'b', scored: true }, { id: 'c', scored: true }, { id: 'd', scored: true }
  ];

  test('an alternative disposition lifts the score exactly as a real pass would', () => {
    const results = { a: 'pass', b: 'pass', c: 'pass', d: 'fail' };
    const bare = score(DEFS, { lastResults: results, today: TODAY });
    const withDisp = score(DEFS, {
      lastResults: results, today: TODAY,
      checkDispositions: [disp({ checkId: 'd' })]
    });
    assert.equal(bare, 75);
    assert.equal(withDisp, 100);
  });

  test('notApplicable REMOVES the check from the denominator rather than passing it', () => {
    // 2 of 3 passing scores 67, not the 75 it would if 'd' were counted
    // as a pass, and not the 50 it would if it stayed a fail.
    const results = { a: 'pass', b: 'pass', c: 'fail', d: 'fail' };
    const withDisp = score(DEFS, {
      lastResults: results, today: TODAY,
      checkDispositions: [disp({ checkId: 'd', disposition: 'notApplicable' })]
    });
    assert.equal(withDisp, 67);
  });

  test('a lapsed disposition stops helping the score the day it expires', () => {
    const results = { a: 'pass', b: 'pass', c: 'pass', d: 'fail' };
    const lapsed = score(DEFS, {
      lastResults: results, today: TODAY,
      checkDispositions: [disp({ checkId: 'd', reviewDue: PAST })]
    });
    assert.equal(lapsed, 75);
  });
});
