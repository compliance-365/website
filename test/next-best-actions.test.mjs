// Tests for nextBestActions() — the Dashboard's "Next 3 actions" card,
// which answers the question every other view in Checkpoint leaves
// unanswered after a first scan: given a dozen open actions, which ones
// actually matter right now?
//
// The core claim it makes has to stay honest: it never invents a
// "+N% readiness" number (that would require simulating the whole scan),
// it only ever says "this action's control sits behind a live check that
// is currently failing/under review" — a fact, not a projection. These
// tests pin that a failing-check action always outranks a merely
// high-priority one, and that the reason text never claims more than the
// data supports.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import CheckpointLib from '../public/checkpoint/lib.js';

const { nextBestActions, controlToCheckIds, overdueDaysOf } = CheckpointLib;

const CHECK_CONTROLS = {
  'sod': ['A.5.3'],
  'mfa-priv': ['A.8.2', 'A.5.18'],
  'legacy': ['A.8.5', 'A.5.15']
};
const CHECK_LABELS = {
  'sod': 'No Privileged Role Administrator holds another directory role',
  'mfa-priv': 'Phishing-resistant MFA — privileged roles'
};

function action(over) {
  return Object.assign({ id: 'ACT-1', title: 'Do the thing', pr: 'Medium', status: 'Open', due: '', control: '' }, over || {});
}

describe('controlToCheckIds() — reverse of CHECK_CONTROLS', () => {
  test('maps each control code back to every check that speaks to it', () => {
    const rev = controlToCheckIds(CHECK_CONTROLS);
    assert.deepEqual(rev['A.5.3'], ['sod']);
    assert.deepEqual(rev['A.8.5'], ['legacy']);
  });

  test('a control cited by two checks lists both', () => {
    const rev = controlToCheckIds({ a: ['X.1'], b: ['X.1'] });
    assert.deepEqual(rev['X.1'], ['a', 'b']);
  });

  test('an empty or missing map returns an empty object, not a throw', () => {
    assert.deepEqual(controlToCheckIds({}), {});
    assert.deepEqual(controlToCheckIds(null), {});
  });
});

describe('overdueDaysOf()', () => {
  test('a due date in the past is overdue by whole days', () => {
    // Anchored to whole-day UTC-midnight arithmetic (matching how
    // overdueDaysOf() itself compares dates) rather than a fractional
    // offset off Date.now(), which would land on 2 or 3 days depending
    // on what time of day the test happens to run.
    const threeDaysAgo = new Date(Date.now() - 3 * 86400000).toISOString().slice(0, 10);
    assert.equal(overdueDaysOf(action({ due: threeDaysAgo })), 3);
  });

  test('a future due date is not overdue', () => {
    const future = new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10);
    assert.equal(overdueDaysOf(action({ due: future })), 0);
  });

  test('a Done or Cancelled action is never overdue, whatever its due date', () => {
    const wayPast = '2020-01-01';
    assert.equal(overdueDaysOf(action({ due: wayPast, status: 'Done' })), 0);
    assert.equal(overdueDaysOf(action({ due: wayPast, status: 'Cancelled' })), 0);
  });

  test('no due date at all is not overdue', () => {
    assert.equal(overdueDaysOf(action({ due: '' })), 0);
  });
});

describe('nextBestActions() — ranking', () => {
  test('an action behind a FAILING check always outranks a merely Critical-priority one with no live check', () => {
    const failing = action({ id: 'ACT-FAIL', control: 'A.5.3', pr: 'Low' });
    const criticalNoCheck = action({ id: 'ACT-CRIT', control: '', pr: 'Critical' });
    const results = { sod: 'fail' };
    const ranked = nextBestActions([criticalNoCheck, failing], CHECK_CONTROLS, results, CHECK_LABELS, 3);
    assert.equal(ranked[0].action.id, 'ACT-FAIL', 'the failing-check action must rank first regardless of the other one\'s priority label');
  });

  test('a REVIEW-grade check outranks priority/overdue alone, but not a FAILING one', () => {
    const reviewAction = action({ id: 'ACT-REVIEW', control: 'A.8.2', pr: 'Low' });
    const overdueNoCheck = action({ id: 'ACT-OVERDUE', control: '', pr: 'High', due: '2020-01-01' });
    const failingAction = action({ id: 'ACT-FAIL', control: 'A.5.3', pr: 'Low' });
    const results = { 'mfa-priv': 'review', sod: 'fail' };
    const ranked = nextBestActions([overdueNoCheck, reviewAction, failingAction], CHECK_CONTROLS, results, CHECK_LABELS, 3);
    assert.equal(ranked[0].action.id, 'ACT-FAIL');
    assert.equal(ranked[1].action.id, 'ACT-REVIEW');
    assert.equal(ranked[2].action.id, 'ACT-OVERDUE');
  });

  test('an action whose check already passes never claims to be high-impact', () => {
    const passingAction = action({ id: 'ACT-PASS', control: 'A.5.3', pr: 'Critical' });
    const results = { sod: 'pass' };
    const ranked = nextBestActions([passingAction], CHECK_CONTROLS, results, CHECK_LABELS, 3);
    assert.equal(ranked[0].checkResult, 'pass');
    assert.doesNotMatch(ranked[0].reason, /clears a currently failing|flagged for review/i);
  });

  test('Done and Cancelled actions are excluded entirely', () => {
    const done = action({ id: 'ACT-DONE', status: 'Done', control: 'A.5.3' });
    const cancelled = action({ id: 'ACT-CANCEL', status: 'Cancelled', control: 'A.5.3' });
    const ranked = nextBestActions([done, cancelled], CHECK_CONTROLS, { sod: 'fail' }, CHECK_LABELS, 3);
    assert.equal(ranked.length, 0);
  });

  test('an empty open register returns an empty array, not an error', () => {
    assert.deepEqual(nextBestActions([], CHECK_CONTROLS, {}, CHECK_LABELS, 3), []);
    assert.deepEqual(nextBestActions(null, CHECK_CONTROLS, {}, CHECK_LABELS, 3), []);
  });

  test('respects a custom limit, and defaults to 3', () => {
    const five = ['a', 'b', 'c', 'd', 'e'].map((id) => action({ id, control: 'A.5.3' }));
    const results = { sod: 'fail' };
    assert.equal(nextBestActions(five, CHECK_CONTROLS, results, CHECK_LABELS).length, 3);
    assert.equal(nextBestActions(five, CHECK_CONTROLS, results, CHECK_LABELS, 2).length, 2);
    assert.equal(nextBestActions(five, CHECK_CONTROLS, results, CHECK_LABELS, 10).length, 5);
  });

  test('ties within the same tier break on priority, then overdue days, then soonest due date', () => {
    const lowPriority = action({ id: 'ACT-LOW', control: 'A.5.3', pr: 'Low' });
    const highPriority = action({ id: 'ACT-HIGH', control: 'A.5.3', pr: 'High' });
    const results = { sod: 'fail' };
    const ranked = nextBestActions([lowPriority, highPriority], CHECK_CONTROLS, results, CHECK_LABELS, 2);
    assert.equal(ranked[0].action.id, 'ACT-HIGH');
    assert.equal(ranked[1].action.id, 'ACT-LOW');
  });

  test('the reason text names the check label when one is available', () => {
    const a = action({ id: 'ACT-1', control: 'A.5.3' });
    const ranked = nextBestActions([a], CHECK_CONTROLS, { sod: 'fail' }, CHECK_LABELS, 3);
    assert.match(ranked[0].reason, /No Privileged Role Administrator holds another directory role/);
  });

  test('missing labels degrade to a reason with no label named, not a throw', () => {
    const a = action({ id: 'ACT-1', control: 'A.5.3' });
    const ranked = nextBestActions([a], CHECK_CONTROLS, { sod: 'fail' }, {}, 3);
    assert.match(ranked[0].reason, /Clears a currently failing check/);
  });

  test('an action with no linked control, or a control no check speaks to, is not treated as high-impact', () => {
    const noControl = action({ id: 'ACT-NC', control: '' });
    const unmappedControl = action({ id: 'ACT-UNMAPPED', control: 'A.99.99' });
    const ranked = nextBestActions([noControl, unmappedControl], CHECK_CONTROLS, { sod: 'fail' }, CHECK_LABELS, 3);
    ranked.forEach((r) => assert.equal(r.checkResult, null));
  });
});
