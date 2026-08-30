// Tests for caSignInFrequencyResult() and caTermsOfUseResult() — the
// scoring behind the 'ca-sif' and 'ca-tou' posture checks.
//
// Both mine fields off the SAME Conditional Access policy array
// mfa-all/legacy/mfa-priv/ca-device/ca-risk already fetch —
// sessionControls.signInFrequency and grantControls.termsOfUse — that
// nothing was previously reading. No new Graph call, no new scope.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import CheckpointLib from '../public/checkpoint/lib.js';

const { caSignInFrequencyResult, caTermsOfUseResult } = CheckpointLib;

function policy(over) {
  return Object.assign({
    id: 'p1', state: 'enabled',
    conditions: {},
    grantControls: { builtInControls: [] },
    sessionControls: {}
  }, over || {});
}

describe('caSignInFrequencyResult() — A.8.2 / A.8.5', () => {
  test('no policies at all fails', () => {
    assert.equal(caSignInFrequencyResult([]).result, 'fail');
    assert.equal(caSignInFrequencyResult(null).result, 'fail');
  });

  test('sign-in frequency enabled for a policy targeting privileged roles passes', () => {
    const p = policy({
      conditions: { users: { includeRoles: ['role-1'] } },
      sessionControls: { signInFrequency: { isEnabled: true, type: 'hours', value: 4, frequencyInterval: 'timeBased' } }
    });
    assert.equal(caSignInFrequencyResult([p]).result, 'pass');
  });

  test('sign-in frequency enabled with frequencyInterval "everyTime" (no type/value) still passes', () => {
    // type can legitimately be null when frequencyInterval is 'everyTime'.
    const p = policy({
      conditions: { users: { includeRoles: ['role-1'] } },
      sessionControls: { signInFrequency: { isEnabled: true, type: null, frequencyInterval: 'everyTime' } }
    });
    assert.equal(caSignInFrequencyResult([p]).result, 'pass');
  });

  test('a session control present but isEnabled false does not count', () => {
    const p = policy({
      conditions: { users: { includeRoles: ['role-1'] } },
      sessionControls: { signInFrequency: { isEnabled: false, type: 'hours', value: 4 } }
    });
    assert.equal(caSignInFrequencyResult([p]).result, 'fail');
  });

  test('sign-in frequency enabled but the policy does not target any role fails', () => {
    const p = policy({
      conditions: { users: { includeUsers: ['All'] } },
      sessionControls: { signInFrequency: { isEnabled: true, type: 'hours', value: 4 } }
    });
    assert.equal(caSignInFrequencyResult([p]).result, 'fail');
  });

  test('a disabled policy is ignored even if it would otherwise pass', () => {
    const p = policy({
      state: 'disabled',
      conditions: { users: { includeRoles: ['role-1'] } },
      sessionControls: { signInFrequency: { isEnabled: true, type: 'hours', value: 1 } }
    });
    assert.equal(caSignInFrequencyResult([p]).result, 'fail');
  });

  test('a role-targeted policy with no session controls at all fails', () => {
    const p = policy({ conditions: { users: { includeRoles: ['role-1'] } } });
    assert.equal(caSignInFrequencyResult([p]).result, 'fail');
  });
});

describe('caTermsOfUseResult() — A.5.10', () => {
  test('no policies at all is a review, not a fail — an out-of-band process may exist', () => {
    assert.equal(caTermsOfUseResult([]).result, 'review');
    assert.equal(caTermsOfUseResult(null).result, 'review');
  });

  test('a policy requiring Terms of Use passes', () => {
    const p = policy({ grantControls: { termsOfUse: ['tou-guid-1'] } });
    assert.equal(caTermsOfUseResult([p]).result, 'pass');
  });

  test('an empty termsOfUse array does not count as requiring it', () => {
    const p = policy({ grantControls: { termsOfUse: [] } });
    assert.equal(caTermsOfUseResult([p]).result, 'review');
  });

  test('a disabled policy requiring Terms of Use is ignored', () => {
    const p = policy({ state: 'disabled', grantControls: { termsOfUse: ['tou-guid-1'] } });
    assert.equal(caTermsOfUseResult([p]).result, 'review');
  });

  test('one policy with Terms of Use among several without still passes', () => {
    const plain = policy({ grantControls: { builtInControls: ['mfa'] } });
    const withTou = policy({ id: 'p2', grantControls: { termsOfUse: ['tou-guid-1'] } });
    assert.equal(caTermsOfUseResult([plain, withTou]).result, 'pass');
  });
});
