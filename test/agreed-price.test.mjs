// A client's agreed annual price: replaces the price-list sum wherever
// the owner console shows revenue, and splits across modules so the
// revenue-by-module view still adds up.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import Lib from '../public/checkpoint/lib.js';

const { entitlementAnnualValue, isAgreedPrice, moduleRevenueShares, computePartnerRevenue } = Lib;
const prices = { iso27001: 3000, privacyact: 1000 };

describe('entitlementAnnualValue()', () => {
  test('uses the price list when no agreed price is set', () => {
    assert.equal(entitlementAnnualValue(['iso27001', 'privacyact'], prices), 4000);
    assert.equal(entitlementAnnualValue(['iso27001'], prices, null), 3000);
    assert.equal(entitlementAnnualValue(['iso27001'], {}, undefined), 0);
  });
  test('an agreed price replaces the list total, including zero', () => {
    assert.equal(entitlementAnnualValue(['iso27001'], prices, 5000), 5000);
    assert.equal(entitlementAnnualValue(['iso27001'], {}, 5000), 5000);
    assert.equal(entitlementAnnualValue(['iso27001'], prices, 0), 0);
  });
});

test('isAgreedPrice() accepts 0 and positive numbers only', () => {
  assert.equal(isAgreedPrice(5000), true);
  assert.equal(isAgreedPrice('5000'), true);
  assert.equal(isAgreedPrice(0), true);
  for (const v of [null, undefined, '', -1, 'abc', NaN]) assert.equal(isAgreedPrice(v), false, String(v));
});

describe('moduleRevenueShares()', () => {
  test('splits in proportion to list prices, and always sums to the agreed price', () => {
    const s = moduleRevenueShares(['iso27001', 'privacyact'], prices, 6000);
    assert.equal(s.iso27001, 4500);
    assert.equal(s.privacyact, 1500);
  });
  test('splits evenly when there is no price list', () => {
    const s = moduleRevenueShares(['iso27001', 'privacyact'], {}, 5000);
    assert.deepEqual(s, { iso27001: 2500, privacyact: 2500 });
  });
});

describe('computePartnerRevenue() with an agreed price', () => {
  const today = '2026-09-27';
  const ents = [
    { tenantId: 'mineguard', type: 'client', modules: ['iso27001'], issuedAt: '2026-09-27', expiry: '2027-09-27', agreedPrice: 5000 },
    { tenantId: 'hecticks', type: 'client', modules: ['iso27001'], issuedAt: '2026-07-27', expiry: '2027-07-27' }
  ];
  test('the agreed client counts at its agreed price; others stay on the list', () => {
    const r = computePartnerRevenue(ents, prices, today);
    assert.equal(r.activeAnnualRevenue, 8000);
    assert.equal(r.revenueByModule.iso27001, 8000);
  });
});

test('owner console wiring', () => {
  const owner = readFileSync(new URL('../public/owner/owner.js', import.meta.url), 'utf8');
  assert.match(owner, /\{ name: 'AgreedPrice', number: \{\} \}/);
  assert.match(owner, /'PaddleStatus', 'AgreedPrice'\]/, 'existing consoles get the column');
  assert.match(owner, /partnerEditAgreedPrice: async function/);
  assert.equal((owner.match(/entitlementAnnualValue\(.*?ent\.agreedPrice\)/g) || []).length, 3, 'every annual-value display uses the agreed price');
});
