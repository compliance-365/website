// Fixture tests for the self-serve pricing math (src/data/pricing.js).
// Pure, no DOM — the same computeQuote() the /pricing configurator runs
// client-side, so a wrong total on the page is a failing test here.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeQuote, MODULES, TIERS, ADDONS, CURRENCIES, PRICE_BOOK, SELF_SERVE,
  modulePrice, addonPrice, enterprisePrices, detectCurrency, currencyForCountry, fmtMoney
} from '../src/data/pricing.js';

describe('computeQuote() — self-serve pricing', () => {
  test('single module, micro tier — list price, no discount', () => {
    const q = computeQuote(['iso27001'], [], 'micro');
    assert.equal(q.custom, false);
    assert.equal(q.subtotal, 7000);
    assert.equal(q.discount, null);
    assert.equal(q.total, 7000);
  });

  test('SOC 2 is priced higher than the standard modules', () => {
    const soc2 = computeQuote(['soc2'], [], 'micro').total;
    const iso = computeQuote(['iso27001'], [], 'micro').total;
    assert.ok(soc2 > iso, 'SOC 2 should be the premium module');
  });

  test('two modules get no bundle discount', () => {
    const q = computeQuote(['iso27001', 'soc2'], [], 'micro');
    assert.equal(q.subtotal, 7000 + 8999);
    assert.equal(q.discount, null);
    assert.equal(q.total, 7000 + 8999);
  });

  test('three or more modules get 10% off the framework subtotal', () => {
    const q = computeQuote(['iso27001', 'iso27701', 'iso42001'], [], 'growth');
    assert.equal(q.subtotal, 9999 * 3);
    assert.equal(q.discount.rate, 0.1);
    assert.equal(q.discount.amount, 3000);
    assert.equal(q.total, 26997);
  });

  test('the bundle discount never applies to add-ons', () => {
    const q = computeQuote(['iso27001', 'essential8', 'iso42001', 'iso27701'], ['ai'], 'growth');
    assert.equal(q.discount.amount, Math.round(9999 * 4 * 0.1));
    assert.equal(q.total, 9999 * 4 - q.discount.amount + 1200);
  });

  test('add-ons are added on top of the module subtotal', () => {
    const q = computeQuote(['iso27001', 'soc2'], ['ai'], 'micro');
    assert.equal(q.addonTotal, 1200);
    assert.equal(q.total, (7000 + 8999) + 1200);
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

describe('local-currency prices', () => {
  const foreign = CURRENCIES.filter((c) => c.code !== 'AUD').map((c) => c.code);

  test('every currency offered has a full price book, and nothing else does', () => {
    assert.deepEqual(Object.keys(PRICE_BOOK).sort(), [...foreign].sort());
    for (const code of foreign) {
      for (const m of MODULES) {
        for (const tier of ['micro', 'growth']) {
          assert.equal(typeof modulePrice(m.id, tier, code), 'number', `${code} ${m.id} ${tier}`);
        }
        assert.equal(modulePrice(m.id, 'enterprise', code), null, `${code} ${m.id} enterprise is custom`);
      }
      for (const a of ADDONS) assert.equal(typeof addonPrice(a.id, code), 'number', `${code} ${a.id}`);
    }
  });

  test('each currency keeps the orderings the AUD list has', () => {
    for (const code of ['AUD', ...foreign]) {
      const p = (id, tier) => modulePrice(id, tier, code);
      const ent = enterprisePrices(code);
      assert.ok(p('soc2', 'micro') > p('iso27001', 'micro'), code + ': SOC 2 above standard');
      assert.ok(p('privacyact', 'micro') < p('iso27001', 'micro'), code + ': Privacy Act below standard');
      for (const m of MODULES) assert.ok(p(m.id, 'growth') > p(m.id, 'micro'), `${code}: ${m.id} growth above micro`);
      assert.ok(ent.startingPrice > p('iso27001', 'growth'), code + ': Enterprise above Growth');
      assert.ok(ent.startingPriceSoc2 > p('soc2', 'growth'), code + ': Enterprise SOC 2 above Growth SOC 2');
      assert.equal(ent.addonPrice, addonPrice('ai', code), code + ': Enterprise AI add-on is the list price');
    }
  });

  test('a quote in another currency uses that price book, discount included', () => {
    const q = computeQuote(['iso27001', 'iso27701', 'iso42001'], ['ai'], 'growth', 'GBP');
    assert.equal(q.currency, 'GBP');
    assert.equal(q.subtotal, 5200 * 3);
    assert.equal(q.discount.amount, Math.round(5200 * 3 * 0.1));
    assert.equal(q.total, 5200 * 3 - q.discount.amount + 620);
  });

  test('no country is charged in two currencies', () => {
    const seen = new Map();
    for (const c of CURRENCIES) {
      for (const cc of c.countries) {
        assert.ok(!seen.has(cc), `${cc} is in both ${seen.get(cc)} and ${c.code}`);
        seen.set(cc, c.code);
      }
    }
  });

  test('checkout currencies are ones the page can quote', () => {
    assert.ok(SELF_SERVE.liveCurrencies.includes('AUD'));
    for (const code of SELF_SERVE.liveCurrencies) assert.ok(CURRENCIES.some((c) => c.code === code), code);
  });

  test('visitor currency comes from the time zone, then the language', () => {
    assert.equal(detectCurrency('Australia/Brisbane', ['en-US']), 'AUD');
    assert.equal(detectCurrency('America/Chicago', ['en-US']), 'USD');
    assert.equal(detectCurrency('America/Toronto', ['en-CA']), 'AUD');
    assert.equal(detectCurrency('Europe/London', ['en-US']), 'GBP');
    assert.equal(detectCurrency('Europe/Berlin', ['de-DE']), 'EUR');
    assert.equal(detectCurrency('Pacific/Auckland', ['en-NZ']), 'NZD');
    assert.equal(detectCurrency('Europe/Zurich', ['de-CH']), 'AUD');
    assert.equal(detectCurrency('UTC', ['en-GB']), 'GBP');
    assert.equal(detectCurrency('', []), 'AUD');
    assert.equal(currencyForCountry('ie'), 'EUR');
  });

  test('money formatting tells the dollars apart', () => {
    assert.equal(fmtMoney(7000, 'AUD'), '$7,000');
    assert.equal(fmtMoney(4500, 'USD'), 'US$4,500');
    assert.equal(fmtMoney(7700, 'NZD'), 'NZ$7,700');
    assert.equal(fmtMoney(3600, 'GBP'), '£3,600');
    assert.equal(fmtMoney(4200, 'EUR'), '€4,200');
  });
});
