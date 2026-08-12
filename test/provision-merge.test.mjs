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
import { readFileSync } from 'node:fs';
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

/* Static-text coverage for the optional new-signup notification email —
   the actual send is a live Graph call (app-only Mail.Send), not
   feasible to exercise without a real tenant and a real mailbox, but two
   things about it are cheap and important to guard structurally:
   1. It must only fire on a FRESH checkout (a real transactionId), never
      on the routine on-load refresh every other live self-serve tenant
      triggers on every single page load — get this gate wrong and every
      customer opening the app becomes an email.
   2. ownerGraph()'s response handling has to treat 202 (what /sendMail
      actually returns — accepted, empty body) the same as 204, or the
      very first notification this Lambda ever tries to send throws on
      res.json() parsing an empty body. Found by reading Graph's own
      documented response shape for sendMail, not by a failure in this
      environment — there's no way to trigger a live send here to
      observe it directly. */
describe('new-signup notification — structural guards (no live send exercised here)', () => {
  const src = readFileSync(new URL('../lambda/provision.js', import.meta.url), 'utf8');

  test('notifyOwnerOfSignup() is only called inside the fresh-transaction branch, not on every refresh', () => {
    const handlerMatch = src.match(/export const handler = async \(event\) => \{([\s\S]*)$/);
    assert.ok(handlerMatch, 'handler not found');
    const notifyCallMatch = handlerMatch[0].match(/if \(transactionId\) \{\s*try \{\s*await notifyOwnerOfSignup\(/);
    assert.ok(notifyCallMatch, 'notifyOwnerOfSignup() is no longer called inside "if (transactionId)" — this would fire on every self-serve tenant\'s routine page-load refresh, not just fresh checkouts, flooding the owner\'s inbox');
  });

  test('notifyOwnerOfSignup() no-ops silently when OWNER_NOTIFY_EMAIL is unset', () => {
    const fnMatch = src.match(/async function notifyOwnerOfSignup\(payload, purchase\) \{([\s\S]*?)\n\}/);
    assert.ok(fnMatch, 'notifyOwnerOfSignup() not found');
    assert.match(fnMatch[1], /if \(!mailbox\) return;/, 'notifyOwnerOfSignup() no longer no-ops when OWNER_NOTIFY_EMAIL is unset — this feature must stay opt-in');
  });

  test('the notification failing never blocks the customer\'s own activation response', () => {
    const handlerMatch = src.match(/if \(transactionId\) \{\s*try \{\s*await notifyOwnerOfSignup\(file\.payload, purchase\);\s*\} catch \(notifyErr\) \{/);
    assert.ok(handlerMatch, 'notifyOwnerOfSignup() call is no longer wrapped in its own try/catch — an email failure (bad mailbox, missing Graph permission, transient error) would throw the whole handler into its outer catch and fail the customer\'s activation, which just succeeded');
  });

  test('ownerGraph() treats 202 (sendMail\'s actual response) the same as 204 — no res.json() on an empty body', () => {
    const fnMatch = src.match(/async function ownerGraph\(token, path, opts = \{\}\) \{([\s\S]*?)\n\}/);
    assert.ok(fnMatch, 'ownerGraph() not found');
    assert.match(fnMatch[1], /res\.status === 204 \|\| res\.status === 202/, 'ownerGraph() no longer special-cases 202 alongside 204 — Graph\'s /sendMail endpoint returns 202 with an empty body, and res.json() throws on that, which would make every notification attempt fail even when Graph successfully sent the mail');
  });
});
