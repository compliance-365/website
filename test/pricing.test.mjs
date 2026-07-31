// Fixture tests for the self-serve pricing math (src/data/pricing.js).
// Pure, no DOM — the same computeQuote() the /pricing configurator runs
// client-side, so a wrong total on the page is a failing test here.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { computeQuote, MODULES, TIERS } from '../src/data/pricing.js';

describe('computeQuote() — self-serve pricing', () => {
  test('single module, micro tier — list price, no discount', () => {
    const q = computeQuote(['iso27001'], [], 'micro');
    assert.equal(q.custom, false);
    assert.equal(q.subtotal, 3500);
    assert.equal(q.discount, null);
    assert.equal(q.total, 3500);
  });

  test('SOC 2 is priced higher than the standard modules', () => {
    const soc2 = computeQuote(['soc2'], [], 'micro').total;
    const iso = computeQuote(['iso27001'], [], 'micro').total;
    assert.ok(soc2 > iso, 'SOC 2 should be the premium module');
  });

  // BUNDLE_DISCOUNTS is currently paused (empty array) — see its own
  // comment in pricing.js for why: shipping a displayed discount with no
  // matching Paddle Discount object would show a total the checkout
  // never actually charges. These tests confirm today's real behaviour;
  // if bundle pricing is re-enabled, restore assertions on q.discount's
  // rate/amount alongside re-adding entries to BUNDLE_DISCOUNTS.
  test('multiple modules currently get no bundle discount (paused)', () => {
    const q = computeQuote(['iso27001', 'soc2'], [], 'micro');
    assert.equal(q.subtotal, 3500 + 6000);
    assert.equal(q.discount, null);
    assert.equal(q.total, 3500 + 6000);
  });

  test('four modules also get no discount while bundling is paused', () => {
    const q = computeQuote(['iso27001', 'essential8', 'iso42001', 'iso27701'], [], 'growth');
    assert.equal(q.discount, null);
    const subtotal = 5500 * 4;
    assert.equal(q.subtotal, subtotal);
    assert.equal(q.total, subtotal);
  });

  test('add-ons are added on top of the module subtotal', () => {
    const q = computeQuote(['iso27001', 'soc2'], ['ai'], 'micro');
    assert.equal(q.addonTotal, 1200);
    assert.equal(q.total, (3500 + 6000) + 1200);
  });

  test('enterprise tier is always custom — no fabricated total', () => {
    const q = computeQuote(['iso27001'], [], 'enterprise');
    assert.equal(q.custom, true);
  });

  test('growth tier costs more than micro for the same module', () => {
    assert.ok(computeQuote(['iso27001'], [], 'growth').total > computeQuote(['iso27001'], [], 'micro').total);
  });

  test('empty selection is a zero quote, never a crash', () => {
    const q = computeQuote([], [], 'micro');
    assert.equal(q.total, 0);
    assert.equal(q.custom, false);
  });

  test('every catalogue module has a micro and growth price, enterprise is custom', () => {
    for (const m of MODULES) {
      assert.equal(typeof m.prices.micro, 'number', m.id + ' micro price');
      assert.equal(typeof m.prices.growth, 'number', m.id + ' growth price');
      assert.equal(m.prices.enterprise, null, m.id + ' enterprise is custom');
    }
    assert.ok(TIERS.some((t) => t.id === 'enterprise' && t.custom));
  });
});
