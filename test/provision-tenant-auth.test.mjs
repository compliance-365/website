// Unit coverage for the real fix to lambda/provision.js's tenantId gap:
// the Lambda used to sign and record whatever tenantId the request body
// claimed, checked only for GUID/domain SHAPE (isValidTenantIdentifier),
// never for whether the caller actually held it. Anyone who completed a
// real Paddle checkout — even the cheapest available price — could name
// an arbitrary victim tenant and receive back a validly-signed
// activation for it, plus a PartnerClients/PartnerEntitlements roster
// row claiming that tenant as a customer.
//
// resolveCallerTenantId() is the fix: it asks Microsoft Graph's own
// /organization endpoint, using the caller's own bearer token, which
// tenant belongs to that token. It talks to the network, so — same
// convention as mergeResolvedSubscriptions() in provision-merge.test.mjs
// being the one network-free piece of the Paddle side worth unit
// testing — this suite exercises it with an injectable fetch rather than
// hitting real Graph, and leaves the actual live call to the sandbox
// walkthrough in DEPLOY-PROVISION.md.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { resolveCallerTenantId, AuthError } from '../lambda/provision.js';

function fakeGraphFetch(response, opts = {}) {
  return async (url, bearerToken) => {
    assert.equal(url, 'https://graph.microsoft.com/v1.0/organization?$select=id', 'must call Graph\'s own /organization endpoint, not trust anything client-supplied');
    if (opts.expectToken) assert.equal(bearerToken, opts.expectToken, 'must forward the caller\'s own bearer token to Graph, not a stored/service credential');
    if (opts.throws) throw opts.throws;
    return response;
  };
}

describe('resolveCallerTenantId() — the actual fix for the tenantId trust gap', () => {
  test('returns the tenant id Graph resolves for the caller\'s own token', async () => {
    const fetch = fakeGraphFetch({ value: [{ id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' }] }, { expectToken: 'real-caller-token' });
    const id = await resolveCallerTenantId('real-caller-token', fetch);
    assert.equal(id, 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
  });

  test('forwards the EXACT token given — a Lambda that used its own service credential instead would defeat the fix entirely', async () => {
    const fetch = fakeGraphFetch({ value: [{ id: 'tenant-x' }] }, { expectToken: 'caller-supplied-abc123' });
    await resolveCallerTenantId('caller-supplied-abc123', fetch);
  });

  test('a Graph call that throws (expired/invalid/revoked token) becomes an AuthError, not a generic one', async () => {
    const fetch = fakeGraphFetch(null, { throws: new Error('Graph 401: InvalidAuthenticationToken') });
    await assert.rejects(() => resolveCallerTenantId('stale-token', fetch), AuthError);
  });

  test('an empty organization list becomes an AuthError rather than an undefined tenant id being signed', async () => {
    const fetch = fakeGraphFetch({ value: [] });
    await assert.rejects(() => resolveCallerTenantId('token', fetch), AuthError);
  });

  test('a malformed Graph response (no value array at all) becomes an AuthError, not a crash', async () => {
    const fetch = fakeGraphFetch({ somethingElse: true });
    await assert.rejects(() => resolveCallerTenantId('token', fetch), AuthError);
  });

  test('AuthError carries a message a customer can act on (sign in again), not a raw Graph error dump', async () => {
    const fetch = fakeGraphFetch(null, { throws: new Error('Graph 401: InvalidAuthenticationToken') });
    await assert.rejects(
      () => resolveCallerTenantId('stale-token', fetch),
      (e) => { assert.match(e.message, /sign in again/i); return true; }
    );
  });
});

describe('the exploit this closes — malicious body.tenantId can no longer bypass caller verification', () => {
  test('a caller whose token resolves to tenant A can never have tenant B\'s id returned, however the request body is shaped', async () => {
    // The whole point: resolveCallerTenantId() takes NO tenantId
    // argument at all — there is nothing in its signature a malicious
    // request body could influence. The handler compares its return
    // value against body.tenantId and rejects on mismatch (exercised
    // end-to-end in the sandbox walkthrough, not here, since the
    // handler itself needs a real Lambda event/Paddle call to invoke).
    const fetch = fakeGraphFetch({ value: [{ id: 'tenant-A' }] });
    const resolved = await resolveCallerTenantId('victim-tenant-B-attacker-does-not-actually-hold', fetch);
    assert.equal(resolved, 'tenant-A', 'resolution depends only on what the token itself is good for, never on a claimed identity');
  });
});
