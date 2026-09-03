// Tests for resolvableFindings() — Item 4 of the "market-leading, low-
// pain" set: when a scan-derived risk's originating check now passes,
// propose closing it rather than leaving it to sit open forever after
// the underlying issue is actually fixed. The function only ever
// identifies candidates; nothing here writes anything, and a risk a
// practitioner already dismissed ("not yet") stays excluded until its
// check state changes.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import CheckpointLib from '../public/checkpoint/lib.js';

const { resolvableFindings } = CheckpointLib;

function risk(over) {
  return Object.assign({ id: 'R-001', title: 'Finding', status: 'Open', tpl: 'sod', actions: [] }, over || {});
}
function action(over) {
  return Object.assign({ id: 'ACT-001', title: 'Do the thing', status: 'Open' }, over || {});
}

describe('resolvableFindings()', () => {
  test('a scan-derived risk whose check now passes is proposed for closing', () => {
    const r = risk({ tpl: 'sod' });
    const out = resolvableFindings([r], [], { sod: 'pass' });
    assert.equal(out.length, 1);
    assert.equal(out[0].risk.id, 'R-001');
  });

  test('a risk whose check still fails or needs review is not proposed', () => {
    const r1 = risk({ id: 'R-1', tpl: 'sod' });
    const r2 = risk({ id: 'R-2', tpl: 'legacy' });
    const out = resolvableFindings([r1, r2], [], { sod: 'fail', legacy: 'review' });
    assert.equal(out.length, 0);
  });

  test('a Closed risk is never re-proposed, whatever its check says', () => {
    const r = risk({ status: 'Closed', tpl: 'sod' });
    const out = resolvableFindings([r], [], { sod: 'pass' });
    assert.equal(out.length, 0);
  });

  test('a workshop-captured risk with no tpl never matches — nothing "resolved" it', () => {
    const r = risk({ tpl: undefined });
    const out = resolvableFindings([r], [], { sod: 'pass' });
    assert.equal(out.length, 0);
  });

  test('a risk the practitioner already dismissed stays excluded', () => {
    const r = risk({ tpl: 'sod', resolutionDismissed: true });
    const out = resolvableFindings([r], [], { sod: 'pass' });
    assert.equal(out.length, 0);
  });

  test('lists only the risk\'s STILL-OPEN linked actions, excluding Done/Cancelled ones', () => {
    const r = risk({ tpl: 'sod', actions: ['ACT-1', 'ACT-2', 'ACT-3'] });
    const actions = [
      action({ id: 'ACT-1', status: 'Open' }),
      action({ id: 'ACT-2', status: 'Done' }),
      action({ id: 'ACT-3', status: 'Cancelled' })
    ];
    const out = resolvableFindings([r], actions, { sod: 'pass' });
    assert.deepEqual(out[0].openActionIds, ['ACT-1']);
  });

  test('a risk whose actions are already all Done still gets proposed, with an empty action list', () => {
    const r = risk({ tpl: 'sod', actions: ['ACT-1'] });
    const actions = [action({ id: 'ACT-1', status: 'Done' })];
    const out = resolvableFindings([r], actions, { sod: 'pass' });
    assert.equal(out.length, 1);
    assert.deepEqual(out[0].openActionIds, []);
  });

  test('a check with no recorded result at all does not match — never assumes pass', () => {
    const r = risk({ tpl: 'sod' });
    const out = resolvableFindings([r], [], {});
    assert.equal(out.length, 0);
  });

  test('empty or missing inputs return an empty array, not a throw', () => {
    assert.deepEqual(resolvableFindings([], [], {}), []);
    assert.deepEqual(resolvableFindings(null, null, null), []);
  });
});
