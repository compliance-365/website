// Tests for caDeviceComplianceResult() and caRiskBasedResult() — the
// scoring behind the 'ca-device' and 'ca-risk' posture checks.
//
// Both are mined from the SAME Conditional Access policy array graph.js
// already fetches for mfa-all/legacy/mfa-priv — no new Graph call, no new
// scope, just reading fields of a response nothing was previously
// looking at. That makes the scoring boundaries the only thing worth
// testing here; the fetch itself is already covered by the existing
// mfa-all/legacy/mfa-priv code path.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import CheckpointLib from '../public/checkpoint/lib.js';

const { caDeviceComplianceResult, caRiskBasedResult } = CheckpointLib;

function policy(over) {
  return Object.assign({
    id: 'p1', state: 'enabled',
    conditions: { applications: { includeApplications: ['All'] } },
    grantControls: { builtInControls: [] }
  }, over || {});
}

describe('caDeviceComplianceResult() — A.8.1 / A.5.15', () => {
  test('no policies at all fails', () => {
    assert.equal(caDeviceComplianceResult([]).result, 'fail');
    assert.equal(caDeviceComplianceResult(null).result, 'fail');
  });

  test('a policy requiring a compliant device for all apps passes', () => {
    const p = policy({ grantControls: { builtInControls: ['compliantDevice'] } });
    assert.equal(caDeviceComplianceResult([p]).result, 'pass');
  });

  test('a domain-joined-device requirement also passes', () => {
    const p = policy({ grantControls: { builtInControls: ['domainJoinedDevice'] } });
    assert.equal(caDeviceComplianceResult([p]).result, 'pass');
  });

  test('device compliance required for only some apps is a review, not a pass', () => {
    const p = policy({
      conditions: { applications: { includeApplications: ['00000003-0000-0000-c000-000000000000'] } },
      grantControls: { builtInControls: ['compliantDevice'] }
    });
    assert.equal(caDeviceComplianceResult([p]).result, 'review');
  });

  test('a disabled policy is ignored even if it would otherwise pass', () => {
    const p = policy({ state: 'disabled', grantControls: { builtInControls: ['compliantDevice'] } });
    assert.equal(caDeviceComplianceResult([p]).result, 'fail');
  });

  test('a report-only policy is ignored — it enforces nothing yet', () => {
    const p = policy({ state: 'enabledForReportingButNotEnforced', grantControls: { builtInControls: ['compliantDevice'] } });
    assert.equal(caDeviceComplianceResult([p]).result, 'fail');
  });

  test('an unrelated enabled policy with no device grant fails', () => {
    const p = policy({ grantControls: { builtInControls: ['mfa'] } });
    assert.equal(caDeviceComplianceResult([p]).result, 'fail');
  });

  test('one broad policy outranks a narrower one — pass wins', () => {
    const narrow = policy({
      conditions: { applications: { includeApplications: ['app1'] } },
      grantControls: { builtInControls: ['compliantDevice'] }
    });
    const broad = policy({ grantControls: { builtInControls: ['compliantDevice'] } });
    assert.equal(caDeviceComplianceResult([narrow, broad]).result, 'pass');
  });
});

describe('caRiskBasedResult() — A.8.5 / A.5.15', () => {
  test('no policies at all fails', () => {
    assert.equal(caRiskBasedResult([]).result, 'fail');
    assert.equal(caRiskBasedResult(null).result, 'fail');
  });

  test('sign-in risk blocked and user risk forces a password change — both covered, passes', () => {
    const signIn = policy({
      conditions: { signInRiskLevels: ['high'] },
      grantControls: { builtInControls: ['block'] }
    });
    const user = policy({
      conditions: { userRiskLevels: ['high'] },
      grantControls: { builtInControls: ['passwordChange'] }
    });
    assert.equal(caRiskBasedResult([signIn, user]).result, 'pass');
  });

  test('only sign-in-risk covered is a review', () => {
    const signIn = policy({
      conditions: { signInRiskLevels: ['high'] },
      grantControls: { builtInControls: ['mfa'] }
    });
    const r = caRiskBasedResult([signIn]);
    assert.equal(r.result, 'review');
    assert.match(r.note, /Sign-in-risk/);
  });

  test('only user-risk covered is a review', () => {
    const user = policy({
      conditions: { userRiskLevels: ['high'] },
      grantControls: { builtInControls: ['block'] }
    });
    const r = caRiskBasedResult([user]);
    assert.equal(r.result, 'review');
    assert.match(r.note, /User-risk/);
  });

  test('a risk condition with no meaningful grant control does not count', () => {
    // Targeting a risk level but not actually gating access on it (e.g.
    // only requiring a terms-of-use acceptance) is not risk-based access
    // control — the point is a block or a step-up, not a checkbox.
    const p = policy({
      conditions: { signInRiskLevels: ['high'] },
      grantControls: { builtInControls: ['termsOfUse'] }
    });
    assert.equal(caRiskBasedResult([p]).result, 'fail');
  });

  test('a disabled risk-based policy is ignored', () => {
    const p = policy({
      state: 'disabled',
      conditions: { signInRiskLevels: ['high'], userRiskLevels: ['high'] },
      grantControls: { builtInControls: ['block'] }
    });
    assert.equal(caRiskBasedResult([p]).result, 'fail');
  });

  test('a single policy covering both risk conditions still passes', () => {
    const p = policy({
      conditions: { signInRiskLevels: ['high'], userRiskLevels: ['high'] },
      grantControls: { builtInControls: ['block'] }
    });
    assert.equal(caRiskBasedResult([p]).result, 'pass');
  });
});
