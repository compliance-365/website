// The multi-framework bundle, the integrated ISO page, the consulting
// section on /pricing and the government buyer's page.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SELF_SERVE, BUNDLE_DISCOUNTS } from '../src/data/pricing.js';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const start = read('src/pages/start/index.astro');
const pricing = read('src/pages/pricing.astro');
const ims = read('src/pages/services/integrated-iso.astro');
const gov = read('src/pages/government.astro');

test('a bundle quote never reaches a Paddle checkout without the matching discount', () => {
  assert.ok(BUNDLE_DISCOUNTS.length > 0);
  assert.equal(typeof SELF_SERVE.bundleDiscountId, 'string');
  assert.match(start, /if \(q\.discount && !cfg\.bundleDiscountId\) return false;/);
  assert.match(start, /discountId: cfg\.bundleDiscountId/);
});

test('new pages take every price from pricing.js', () => {
  for (const [name, src] of [['integrated-iso', ims], ['government', gov]]) {
    const body = src.split('---').slice(2).join('---');
    assert.doesNotMatch(body.replace(/\{[^}]*\}/g, ''), /\$\d/, name);
  }
});

test('the pricing page explains the bundle and how much consulting to expect', () => {
  assert.match(pricing, /id="how-much-consulting"/);
  assert.match(pricing, /BUNDLE_RATE_PCT/);
  assert.match(pricing, /services\/integrated-iso\//);
});

test('the government page links to the procurement documents that exist', () => {
  for (const p of ['security/questionnaire.astro', 'security/index.astro', 'accessibility.astro', 'services/is18.astro', 'services/rffr.astro', 'services/disp-ism-irap.astro', 'services/essential-eight.astro', 'services/integrated-iso.astro']) {
    read('src/pages/' + p);
  }
  assert.match(gov, /security\/checkpoint-security-answers\.xlsx/);
});
