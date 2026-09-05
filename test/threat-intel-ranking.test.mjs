// Tests for lib.js's threatIntelRelevance()/rankThreatIntelItems() — the
// client-side half of "customised for industry and technical stack"
// (see app.js's renderThreatIntel()). lambda/threat-intel.js only tags
// each CISA KEV entry with generic topic tags; everything about WHICH
// tags matter to a given tenant lives here instead, so it can be
// verified without a network call or a Lambda.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import CheckpointLib from '../public/checkpoint/lib.js';

const { threatIntelRelevance, rankThreatIntelItems, THREAT_INTEL_INDUSTRY_TAGS } = CheckpointLib;

function item(over) {
  return Object.assign({ cveId: 'CVE-0000-0000', vendor: 'X', product: 'Y', dateAdded: '2024-01-01', tags: ['general'] }, over || {});
}

describe('threatIntelRelevance()', () => {
  test('matches on a declared tech-stack tag', () => {
    const r = threatIntelRelevance(item({ tags: ['network-edge'] }), { stackTags: ['network-edge'] });
    assert.equal(r.matchedStack, true);
    assert.equal(r.relevant, true);
  });

  test('matches on an industry-implied tag even with no stack declared', () => {
    const r = threatIntelRelevance(item({ tags: ['microsoft'] }), { industryId: 'healthcare' });
    assert.equal(r.matchedIndustry, true);
    assert.equal(r.relevant, true);
  });

  test('no match when neither industry nor stack overlaps', () => {
    const r = threatIntelRelevance(item({ tags: ['ics-ot'] }), { industryId: 'saas', stackTags: ['browser'] });
    assert.equal(r.matchedStack, false);
    assert.equal(r.matchedIndustry, false);
    assert.equal(r.relevant, false);
  });

  test('an unknown industry id matches nothing rather than throwing', () => {
    const r = threatIntelRelevance(item({ tags: ['microsoft'] }), { industryId: 'not-a-real-industry' });
    assert.equal(r.relevant, false);
  });

  test('every declared industry profile resolves to a non-empty tag list', () => {
    Object.keys(THREAT_INTEL_INDUSTRY_TAGS).forEach((id) => {
      assert.ok(THREAT_INTEL_INDUSTRY_TAGS[id].length > 0, id + ' has no relevance tags');
    });
  });
});

describe('rankThreatIntelItems()', () => {
  test('sorts stack matches ahead of industry-only matches, ahead of no match', () => {
    const items = [
      item({ cveId: 'no-match', tags: ['ics-ot'], dateAdded: '2024-06-01' }),
      item({ cveId: 'industry-only', tags: ['microsoft'], dateAdded: '2024-01-01' }),
      item({ cveId: 'stack-match', tags: ['network-edge'], dateAdded: '2024-01-01' })
    ];
    const ranked = rankThreatIntelItems(items, { industryId: 'saas', stackTags: ['network-edge'] });
    assert.deepEqual(ranked.map((i) => i.cveId), ['stack-match', 'industry-only', 'no-match']);
  });

  test('within the same relevance tier, sorts newest first', () => {
    const items = [
      item({ cveId: 'older', tags: ['microsoft'], dateAdded: '2024-01-01' }),
      item({ cveId: 'newer', tags: ['microsoft'], dateAdded: '2024-06-01' })
    ];
    const ranked = rankThreatIntelItems(items, { industryId: 'saas' });
    assert.deepEqual(ranked.map((i) => i.cveId), ['newer', 'older']);
  });

  test('annotates every item with relevant/matchedStack/matchedIndustry without dropping fields', () => {
    const ranked = rankThreatIntelItems([item({ cveId: 'CVE-1', vendor: 'Acme' })], { industryId: 'saas' });
    assert.equal(ranked[0].cveId, 'CVE-1');
    assert.equal(ranked[0].vendor, 'Acme');
    assert.equal(typeof ranked[0].relevant, 'boolean');
  });

  test('never filters anything out — only reorders', () => {
    const items = [item({ cveId: 'a', tags: ['ics-ot'] }), item({ cveId: 'b', tags: ['ics-ot'] })];
    const ranked = rankThreatIntelItems(items, { industryId: 'saas' });
    assert.equal(ranked.length, 2);
  });

  test('tolerates no options and a non-array input', () => {
    assert.deepEqual(rankThreatIntelItems(null), []);
    assert.doesNotThrow(() => rankThreatIntelItems([item()]));
  });
});
