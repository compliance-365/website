// Unit coverage for mergeResolvedSubscriptions() in lambda/provision.js —
// the one piece of that Lambda's logic with no Paddle/network dependency,
// so the one piece that's actually feasible to test outside a real
// sandbox checkout. This is the fix for a real bug found while auditing
// the self-serve activation flow: a customer who buys a second module in
// a SEPARATE, later checkout gets a brand new Paddle subscription
// (/start's anonymous overlay checkout has no way to attach a purchase to
// an existing subscription), and the app used to track only the single
// most-recently-seen subscription id — so refreshing after a second
// purchase would silently drop the first module's entitlement (or vice
// versa, depending on refresh timing). The fix tracks every subscription
// id a tenant has ever completed checkout for and asks this Lambda to
// resolve and merge all of them into one signed file; this suite is the
// merge itself.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mergeResolvedSubscriptions } from '../lambda/provision.js';

function sub(overrides) {
  return Object.assign({
    subscriptionId: 'sub_1', status: 'active', frameworks: ['iso27001'], expiry: '2027-01-01', customerEmail: 'a@example.com'
  }, overrides);
}

describe('mergeResolvedSubscriptions()', () => {
  test('returns null for an empty list — every id failed to resolve, or none were passed', () => {
    assert.equal(mergeResolvedSubscriptions([]), null);
    assert.equal(mergeResolvedSubscriptions(null), null);
    assert.equal(mergeResolvedSubscriptions(undefined), null);
  });

  test('a single subscription passes through as its own union', () => {
    const merged = mergeResolvedSubscriptions([sub({ frameworks: ['iso27001', 'soc2'] })]);
    assert.deepEqual(merged.subscriptionIds, ['sub_1']);
    assert.deepEqual(merged.frameworks.sort(), ['iso27001', 'soc2']);
    assert.equal(merged.type, 'client');
    assert.equal(merged.expiry, '2027-01-01');
  });

  test('the exact bug this fixes: a second, separate subscription for a different module is UNIONED, not dropped', () => {
    // subscription 1: bought essential8 months ago. subscription 2: bought
    // soc2 today, in a completely separate checkout. Before this fix, only
    // the most recently seen subscription's frameworks ever reached the
    // signed activation file — essential8 would vanish.
    const merged = mergeResolvedSubscriptions([
      sub({ subscriptionId: 'sub_essential8', frameworks: ['iso27001', 'essential8'], expiry: '2026-11-01' }),
      sub({ subscriptionId: 'sub_soc2', frameworks: ['iso27001', 'soc2'], expiry: '2027-03-01' })
    ]);
    assert.deepEqual(merged.frameworks.sort(), ['essential8', 'iso27001', 'soc2']);
    assert.deepEqual(merged.subscriptionIds.sort(), ['sub_essential8', 'sub_soc2']);
  });

  test('frameworks are de-duplicated across subscriptions that both include iso27001 (or any overlapping module)', () => {
    const merged = mergeResolvedSubscriptions([
      sub({ subscriptionId: 's1', frameworks: ['iso27001', 'soc2'] }),
      sub({ subscriptionId: 's2', frameworks: ['iso27001', 'nistcsf'] })
    ]);
    const counts = {};
    merged.frameworks.forEach((f) => { counts[f] = (counts[f] || 0) + 1; });
    Object.values(counts).forEach((n) => assert.equal(n, 1, 'every framework should appear exactly once in the merged list'));
    assert.deepEqual(merged.frameworks.sort(), ['iso27001', 'nistcsf', 'soc2']);
  });

  test('expiry is the LATEST among the resolved subscriptions — access runs to whichever has the most runway', () => {
    const merged = mergeResolvedSubscriptions([
      sub({ subscriptionId: 's1', expiry: '2026-06-01' }),
      sub({ subscriptionId: 's2', expiry: '2027-09-01' }),
      sub({ subscriptionId: 's3', expiry: '2026-12-01' })
    ]);
    assert.equal(merged.expiry, '2027-09-01');
  });

  test('type is "client" if ANY subscription is active, even if another is still trialing', () => {
    const merged = mergeResolvedSubscriptions([
      sub({ subscriptionId: 's1', status: 'trialing' }),
      sub({ subscriptionId: 's2', status: 'active' })
    ]);
    assert.equal(merged.type, 'client');
  });

  test('type is "demo" only when every resolved subscription is still trialing', () => {
    const merged = mergeResolvedSubscriptions([
      sub({ subscriptionId: 's1', status: 'trialing' }),
      sub({ subscriptionId: 's2', status: 'trialing' })
    ]);
    assert.equal(merged.type, 'demo');
  });

  test('customerEmail falls back to the first subscription that has one', () => {
    const merged = mergeResolvedSubscriptions([
      sub({ subscriptionId: 's1', customerEmail: '' }),
      sub({ subscriptionId: 's2', customerEmail: 'real@example.com' })
    ]);
    assert.equal(merged.customerEmail, 'real@example.com');
  });

  test('carries the individual per-subscription results through, for recordOnOwnerRoster() to write one roster row per subscription', () => {
    const inputs = [sub({ subscriptionId: 's1' }), sub({ subscriptionId: 's2', status: 'trialing' })];
    const merged = mergeResolvedSubscriptions(inputs);
    assert.equal(merged.results, inputs);
  });
});
