// The cost estimator only uses figures the site publishes: every
// per-size band sits inside its published range, the published ranges
// still appear on the pages that publish them, and Checkpoint prices come
// from pricing.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FRAMEWORKS, SIZES, estimate, checkpointLicence, audRange } from '../src/data/cost-estimator.js';
import { MODULES, ENTERPRISE } from '../src/data/pricing.js';

const page = (p) => readFileSync(new URL('../src/pages/' + p.replace(/\/$/, '') + '.astro', import.meta.url), 'utf8');
const k = (n) => '$' + n / 1000 + 'k';

test('every band sits inside its published range, and bands rise with size', () => {
  for (const [id, f] of Object.entries(FRAMEWORKS)) {
    const groups = [...f.scopes, f.audit, f.later].filter(Boolean);
    for (const g of groups) {
      let prev = null;
      for (const s of SIZES) {
        const [lo, hi] = g.bands[s.id];
        assert.ok(lo >= g.published[0] && hi <= g.published[1] && lo < hi, `${id} ${g.label || g.id} ${s.id}`);
        if (prev) assert.ok(lo >= prev[0] && hi >= prev[1], `${id} ${g.label || g.id} rises at ${s.id}`);
        prev = [lo, hi];
      }
      assert.equal(g.bands.s[0], g.published[0], `${id}: smallest size starts at the published floor`);
      assert.equal(g.bands.xl[1], g.published[1], `${id}: largest size ends at the published ceiling`);
    }
  }
});

test('the published consulting ranges are still on the service pages', () => {
  for (const [id, f] of Object.entries(FRAMEWORKS)) {
    const src = page(f.page);
    for (const sc of f.scopes) {
      const [lo, hi] = sc.published.map(k);
      assert.ok(src.includes(lo) && src.includes(hi), `${id} ${sc.label}: ${lo}–${hi} on ${f.page}`);
    }
  }
  assert.match(page('services/iso27001/'), /typically \$8k–\$25k/);
  assert.match(page('services/soc2/'), /\$10k–\$30k/);
  assert.match(page('services/soc2/'), /\$20k–\$60k for Type II/);
  assert.match(page('resources/iso27001-cost-australia/'), /\$4,000–\$10,000 per year/);
  assert.match(page('services/iso42001/'), /30–40% lower/);
});

test('Checkpoint licences come from pricing.js', () => {
  for (const [id, f] of Object.entries(FRAMEWORKS)) {
    const mod = MODULES.find((m) => m.id === f.module);
    assert.equal(checkpointLicence(id, 's').amount, mod.prices.micro);
    assert.equal(checkpointLicence(id, 'm').amount, mod.prices.growth);
    assert.equal(checkpointLicence(id, 'xl').from, true);
  }
  assert.equal(checkpointLicence('soc2', 'l').amount, ENTERPRISE.startingPriceSoc2);
  assert.equal(checkpointLicence('iso27001', 'l').amount, ENTERPRISE.startingPrice);
});

test('an estimate adds up', () => {
  const r = estimate({ fw: 'iso27001', size: 'm', approach: 'consulting' });
  assert.deepEqual(r.year1Total, [45000, 86000]);
  assert.deepEqual(r.threeYearTotal, [45000 + 10000 + 19998, 86000 + 16000 + 19998]);
  assert.equal(audRange([1000, 2000]), '$1,000–$2,000');
  const big = estimate({ fw: 'iso27001', size: 'xl', approach: 'consulting' });
  assert.equal(big.year1From, false, 'a fixed-price engagement is not a starting price');
  assert.equal(big.threeYearFrom, true, 'the Enterprise licence in years 2-3 is');
  const self = estimate({ fw: 'essential8', size: 's', approach: 'selfserve', scope: 'assess' });
  assert.deepEqual(self.year1Total, [7000, 7000]);
  const ext = estimate({ fw: 'iso42001', size: 's', approach: 'consulting', hasIso27001: true });
  assert.deepEqual(ext.year1[0].range, [11000, 19500]);
});

test('the estimator is on each service page and the ISO 27001 cost guide, with no inline handlers', () => {
  for (const [id, f] of Object.entries(FRAMEWORKS)) assert.match(page(f.page), new RegExp(`<CostEstimator fw="${id}" />`), id);
  assert.match(page('resources/iso27001-cost-australia/'), /<CostEstimator fw="iso27001"/);
  const comp = readFileSync(new URL('../src/components/CostEstimator.astro', import.meta.url), 'utf8');
  assert.doesNotMatch(comp.replace(/<script[\s\S]*?<\/script>/, ''), /\son[a-z]+=/);
});
