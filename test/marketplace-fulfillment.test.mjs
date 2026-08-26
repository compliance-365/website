// Microsoft Marketplace SaaS fulfillment (lambda/marketplace-fulfillment.js).
//
// Two things in this file carry real consequences and both are tested
// here:
//
//   verifyOperation() — Microsoft's webhook POST is NOT authenticated.
//   Anyone who learns the endpoint URL can send one. Acting on the body
//   directly would let a stranger POST {action:'Unsubscribe',
//   subscriptionId:'<a paying customer's>'} and revoke their access. The
//   body is a hint; the operation must be re-read from the Fulfillment
//   API and cross-checked before anything happens.
//
//   mergeMarketplaceSubscriptions() — one plan per framework means a
//   customer buying a second framework gets a SECOND subscription.
//   Merging them wrongly either drops a module they paid for or grants
//   one they didn't.
//
// The rest of the file talks to Microsoft over the network and is
// exercised against the official SaaS API Emulator per
// DEPLOY-MARKETPLACE.md, not here — same convention as provision.js.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mergeMarketplaceSubscriptions, verifyOperation, resolveCallerTenantId, AuthError } from '../lambda/marketplace-fulfillment.js';

function sub(overrides = {}) {
  return Object.assign({
    subscriptionId: 'sub-1', status: 'Subscribed', frameworks: ['iso27001'],
    type: 'client', expiry: '2027-01-01', customerEmail: 'a@example.com', planId: 'iso27001'
  }, overrides);
}

describe('verifyOperation() — the webhook is untrusted input', () => {
  test('re-reads the operation from Microsoft rather than trusting the body', async () => {
    let askedFor = null;
    const op = await verifyOperation(
      { id: 'op-1', subscriptionId: 'sub-1', action: 'Unsubscribe' },
      async (subId, opId) => { askedFor = [subId, opId]; return { id: opId, subscriptionId: subId, action: 'ChangePlan' }; }
    );
    assert.deepEqual(askedFor, ['sub-1', 'op-1'], 'must fetch the operation, not act on the POST body');
    assert.equal(op.action, 'ChangePlan', "the API's answer is authoritative, not the body's claimed action");
  });

  test('refuses when the operation does not exist', async () => {
    // A fabricated webhook naming an operation id that was never issued.
    await assert.rejects(
      () => verifyOperation({ id: 'made-up', subscriptionId: 'sub-1' }, async () => null),
      /does not exist/i
    );
  });

  test('refuses when the operation belongs to a DIFFERENT subscription', async () => {
    // The attack this check exists for: quote a real operation id but
    // point it at someone else's subscription.
    await assert.rejects(
      () => verifyOperation(
        { id: 'op-1', subscriptionId: 'victim-sub' },
        async () => ({ id: 'op-1', subscriptionId: 'attacker-sub' })
      ),
      /different subscription/i
    );
  });

  test('refuses a payload missing an operation id or subscription id', async () => {
    await assert.rejects(() => verifyOperation({ subscriptionId: 'sub-1' }, async () => ({})), /missing an operation id/i);
    await assert.rejects(() => verifyOperation({ id: 'op-1' }, async () => ({})), /missing an operation id/i);
    await assert.rejects(() => verifyOperation(null, async () => ({})), /missing an operation id/i);
  });

  test('subscription ids are compared as strings, so a numeric id still matches', async () => {
    const op = await verifyOperation(
      { id: 'op-1', subscriptionId: 12345 },
      async () => ({ id: 'op-1', subscriptionId: '12345' })
    );
    assert.equal(op.id, 'op-1');
  });
});

describe('mergeMarketplaceSubscriptions() — one plan per framework', () => {
  test('returns null when nothing resolved, so the caller can error clearly', () => {
    assert.equal(mergeMarketplaceSubscriptions([]), null);
    assert.equal(mergeMarketplaceSubscriptions(null), null);
    assert.equal(mergeMarketplaceSubscriptions(undefined), null);
  });

  test('unions frameworks across separate subscriptions', () => {
    // The whole reason this exists: buying a second framework creates a
    // second subscription, and dropping either loses paid-for access.
    const merged = mergeMarketplaceSubscriptions([
      sub({ subscriptionId: 'sub-1', frameworks: ['iso27001'] }),
      sub({ subscriptionId: 'sub-2', frameworks: ['cps234'] })
    ]);
    assert.deepEqual(merged.frameworks.sort(), ['cps234', 'iso27001']);
    assert.deepEqual(merged.subscriptionIds, ['sub-1', 'sub-2']);
  });

  test('deduplicates a framework held through two subscriptions', () => {
    const merged = mergeMarketplaceSubscriptions([sub({ subscriptionId: 'a' }), sub({ subscriptionId: 'b' })]);
    assert.deepEqual(merged.frameworks, ['iso27001']);
  });

  test('any paid subscription makes the whole entitlement client, not demo', () => {
    // One module converted to paid while another is still in trial is a
    // paying client overall — downgrading them to demo would strip
    // features they are paying for.
    const merged = mergeMarketplaceSubscriptions([
      sub({ subscriptionId: 'a', type: 'demo', frameworks: ['iso27001'] }),
      sub({ subscriptionId: 'b', type: 'client', frameworks: ['soc2'] })
    ]);
    assert.equal(merged.type, 'client');
  });

  test('all-trial stays demo', () => {
    const merged = mergeMarketplaceSubscriptions([sub({ type: 'demo' }), sub({ subscriptionId: 'b', type: 'demo' })]);
    assert.equal(merged.type, 'demo');
  });

  test('takes the LATEST expiry, so access runs to the longest runway', () => {
    const merged = mergeMarketplaceSubscriptions([
      sub({ subscriptionId: 'a', expiry: '2026-06-30' }),
      sub({ subscriptionId: 'b', expiry: '2027-12-31' })
    ]);
    assert.equal(merged.expiry, '2027-12-31');
  });

  test('carries a customer email through from whichever subscription has one', () => {
    const merged = mergeMarketplaceSubscriptions([
      sub({ subscriptionId: 'a', customerEmail: '' }),
      sub({ subscriptionId: 'b', customerEmail: 'real@example.com' })
    ]);
    assert.equal(merged.customerEmail, 'real@example.com');
  });
});

describe('resolveCallerTenantId() — body.tenantId is never trusted', () => {
  test('returns the tenant Microsoft Graph resolves for the caller token', async () => {
    const id = await resolveCallerTenantId('caller-token', async (url, tok) => {
      assert.match(url, /graph\.microsoft\.com\/v1\.0\/organization/);
      assert.equal(tok, 'caller-token');
      return { value: [{ id: 'tenant-a' }] };
    });
    assert.equal(id, 'tenant-a');
  });

  test('takes no tenantId argument at all — nothing a request body could influence', async () => {
    const resolved = await resolveCallerTenantId('token-for-tenant-a', async () => ({ value: [{ id: 'tenant-a' }] }));
    assert.equal(resolved, 'tenant-a');
  });

  test('a rejected token becomes an AuthError the handler maps to 401', async () => {
    await assert.rejects(
      () => resolveCallerTenantId('stale', async () => { throw new Error('Graph 401'); }),
      AuthError
    );
  });

  test('an empty organization response is an AuthError, not an undefined tenant id', async () => {
    await assert.rejects(() => resolveCallerTenantId('t', async () => ({ value: [] })), AuthError);
  });
});
