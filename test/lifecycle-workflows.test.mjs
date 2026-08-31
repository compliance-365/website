// Tests for lifecycleWorkflowsResult() — the scoring behind the
// 'lifecycle-workflows' posture check, which reads Entra ID
// Governance's Lifecycle Workflows (GA on Graph v1.0).
//
// Checkpoint reads whether joiner/leaver automation is configured and
// enabled; it never provisions a workflow on the tenant's behalf. Only
// joiner and leaver drive the result — mover is real and worth
// surfacing, but gating a pass on it would penalize a tenant for not
// automating a lower-stakes internal transfer the same way as failing
// to automate offboarding.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import CheckpointLib from '../public/checkpoint/lib.js';

const { lifecycleWorkflowsResult } = CheckpointLib;

function wf(over) {
  return Object.assign({ id: 'wf-1', displayName: 'Workflow', isEnabled: true, category: 'joiner' }, over || {});
}

describe('lifecycleWorkflowsResult()', () => {
  test('no workflows at all fails — a licensed, unused capability is a real gap', () => {
    assert.equal(lifecycleWorkflowsResult([]).result, 'fail');
    assert.equal(lifecycleWorkflowsResult(null).result, 'fail');
    assert.equal(lifecycleWorkflowsResult(undefined).result, 'fail');
  });

  test('both joiner and leaver enabled passes', () => {
    const r = lifecycleWorkflowsResult([wf({ category: 'joiner' }), wf({ id: 'wf-2', category: 'leaver' })]);
    assert.equal(r.result, 'pass');
    assert.equal(r.joiner, true);
    assert.equal(r.leaver, true);
  });

  test('only joiner enabled is a review', () => {
    const r = lifecycleWorkflowsResult([wf({ category: 'joiner' })]);
    assert.equal(r.result, 'review');
    assert.equal(r.joiner, true);
    assert.equal(r.leaver, false);
  });

  test('only leaver enabled is a review', () => {
    const r = lifecycleWorkflowsResult([wf({ category: 'leaver' })]);
    assert.equal(r.result, 'review');
    assert.equal(r.leaver, true);
    assert.equal(r.joiner, false);
  });

  test('mover alone does not count toward pass or review', () => {
    const r = lifecycleWorkflowsResult([wf({ category: 'mover' })]);
    assert.equal(r.result, 'fail');
    assert.equal(r.mover, true);
  });

  test('a disabled workflow does not count, even if joiner and leaver both exist', () => {
    const r = lifecycleWorkflowsResult([
      wf({ category: 'joiner', isEnabled: false }),
      wf({ id: 'wf-2', category: 'leaver', isEnabled: false })
    ]);
    assert.equal(r.result, 'fail');
    assert.equal(r.joiner, false);
    assert.equal(r.leaver, false);
  });

  test('one enabled and one disabled workflow: only the enabled one counts', () => {
    const r = lifecycleWorkflowsResult([
      wf({ category: 'joiner', isEnabled: true }),
      wf({ id: 'wf-2', category: 'leaver', isEnabled: false })
    ]);
    assert.equal(r.result, 'review');
    assert.equal(r.joiner, true);
    assert.equal(r.leaver, false);
  });

  test('multiple enabled workflows in the same category still count once, correctly totalled', () => {
    const r = lifecycleWorkflowsResult([
      wf({ id: 'wf-1', category: 'joiner' }),
      wf({ id: 'wf-2', category: 'joiner' }),
      wf({ id: 'wf-3', category: 'leaver' })
    ]);
    assert.equal(r.result, 'pass');
    assert.equal(r.total, 3);
    assert.equal(r.enabled, 3);
  });

  test('a null entry in the array does not throw', () => {
    const r = lifecycleWorkflowsResult([null, undefined, wf({ category: 'joiner' }), wf({ id: 'wf-2', category: 'leaver' })]);
    assert.equal(r.result, 'pass');
    assert.equal(r.total, 2);
  });

  test('total and enabled counts distinguish configured-but-off from nothing configured', () => {
    const configuredButOff = lifecycleWorkflowsResult([wf({ isEnabled: false })]);
    assert.equal(configuredButOff.total, 1);
    assert.equal(configuredButOff.enabled, 0);
    const nothingConfigured = lifecycleWorkflowsResult([]);
    assert.equal(nothingConfigured.total, 0);
    assert.equal(nothingConfigured.enabled, 0);
  });
});
