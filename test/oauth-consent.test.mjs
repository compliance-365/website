// Tests for oauthConsentRiskResult() — the scoring behind the
// 'oauth-consent' posture check.
//
// This mines a field the 'riskyapps' check already fetches and selects
// off /oauth2PermissionGrants — consentType — but has never scored on.
// riskyapps treats every high-privilege grant the same regardless of who
// approved it; this check isolates the one riskyapps' combined count
// hides: a high-privilege scope a single end user consented to
// themselves, with no admin in the loop. No new Graph call, no new
// scope — consentType was already on the wire.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import CheckpointLib from '../public/checkpoint/lib.js';

const { oauthConsentRiskResult } = CheckpointLib;

function grant(over) {
  return Object.assign({
    clientId: 'app-1', resourceId: 'graph', consentType: 'AllPrincipals',
    scope: 'User.Read'
  }, over || {});
}

describe('oauthConsentRiskResult()', () => {
  test('no grants at all passes', () => {
    const r = oauthConsentRiskResult([]);
    assert.equal(r.result, 'pass');
    assert.equal(r.userConsented, 0);
  });

  test('null/undefined input does not throw', () => {
    assert.equal(oauthConsentRiskResult(null).result, 'pass');
    assert.equal(oauthConsentRiskResult(undefined).result, 'pass');
  });

  test('a low-privilege user-consented grant is fine — User.Read is the normal sign-in scope', () => {
    const g = grant({ consentType: 'Principal', scope: 'User.Read openid profile' });
    assert.equal(oauthConsentRiskResult([g]).result, 'pass');
  });

  test('an admin-consented high-privilege grant is fine — an admin reviewed it', () => {
    const g = grant({ consentType: 'AllPrincipals', scope: 'Mail.ReadWrite' });
    const r = oauthConsentRiskResult([g]);
    assert.equal(r.result, 'pass');
    assert.equal(r.adminConsented, 1);
    assert.equal(r.userConsented, 0);
  });

  test('a single user-consented high-privilege grant is a review', () => {
    const g = grant({ consentType: 'Principal', scope: 'Mail.ReadWrite' });
    const r = oauthConsentRiskResult([g]);
    assert.equal(r.result, 'review');
    assert.equal(r.userConsented, 1);
  });

  test('two or more user-consented high-privilege grants fail', () => {
    const g1 = grant({ clientId: 'a', consentType: 'Principal', scope: 'Mail.ReadWrite' });
    const g2 = grant({ clientId: 'b', consentType: 'Principal', scope: 'Files.ReadWrite.All' });
    assert.equal(oauthConsentRiskResult([g1, g2]).result, 'fail');
  });

  test('a grant with a scope matching only as a substring does not count', () => {
    // 'Mail.ReadWrite.Shared' must not match the 'Mail.ReadWrite' check by
    // substring — scopes are space-separated tokens, not prefixes.
    const g = grant({ consentType: 'Principal', scope: 'Mail.ReadWrite.Shared' });
    assert.equal(oauthConsentRiskResult([g]).result, 'pass');
  });

  test('mixed admin- and user-consented grants: only the user-consented ones drive the result', () => {
    const admin = grant({ clientId: 'a', consentType: 'AllPrincipals', scope: 'Directory.ReadWrite.All' });
    const user = grant({ clientId: 'b', consentType: 'Principal', scope: 'Sites.FullControl.All' });
    const r = oauthConsentRiskResult([admin, user]);
    assert.equal(r.result, 'review');
    assert.equal(r.adminConsented, 1);
    assert.equal(r.userConsented, 1);
  });

  test('a null entry in the array does not throw', () => {
    const r = oauthConsentRiskResult([null, undefined, grant({ consentType: 'Principal', scope: 'Mail.Send' })]);
    assert.equal(r.userConsented, 1);
  });

  test('an unrecognised consentType value is not treated as user consent', () => {
    // Graph's schema is AllPrincipals | Principal; anything else (a
    // future value, a malformed record) should not silently count as
    // the riskier case.
    const g = grant({ consentType: 'Unknown', scope: 'Mail.ReadWrite' });
    const r = oauthConsentRiskResult([g]);
    assert.equal(r.userConsented, 0);
    assert.equal(r.adminConsented, 0);
    assert.equal(r.result, 'pass');
  });
});
