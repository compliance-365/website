// Tests for describeServicePrincipal() — the formatting behind the app
// names riskyapps/oauth-consent now attach to a risky OAuth grant.
//
// The actual /servicePrincipals/{id} lookups live in graph.js (one per
// distinct risky clientId, under the Directory.Read.All the app already
// holds — no new scope); this is the pure, testable half: turning one
// resolved servicePrincipal into the label a finding shows.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import CheckpointLib from '../public/checkpoint/lib.js';

const { describeServicePrincipal } = CheckpointLib;

describe('describeServicePrincipal()', () => {
  test('null/undefined input resolves to no name, never a guess', () => {
    assert.equal(describeServicePrincipal(null), null);
    assert.equal(describeServicePrincipal(undefined), null);
  });

  test('a servicePrincipal with no displayName resolves to no name', () => {
    assert.equal(describeServicePrincipal({ id: 'sp-1' }), null);
  });

  test('a verified publisher is named', () => {
    const sp = { id: 'sp-1', displayName: 'Contoso CRM', verifiedPublisher: { displayName: 'Contoso Inc' } };
    assert.equal(describeServicePrincipal(sp), 'Contoso CRM (verified: Contoso Inc)');
  });

  test('no verifiedPublisher at all is flagged unverified', () => {
    const sp = { id: 'sp-1', displayName: 'Random Third-Party App' };
    assert.equal(describeServicePrincipal(sp), 'Random Third-Party App (unverified publisher)');
  });

  test('an empty verifiedPublisher object (revoked/expired verification) is flagged unverified', () => {
    const sp = { id: 'sp-1', displayName: 'Formerly Verified App', verifiedPublisher: {} };
    assert.equal(describeServicePrincipal(sp), 'Formerly Verified App (unverified publisher)');
  });
});
