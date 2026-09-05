// Tests for lambda/threat-intel.js's pure functions — tagEntry() and
// shapeKevResponse() are the entire "what does CISA's raw KEV feed
// become for this app" decision, and neither needs a network call to
// verify: shapeKevResponse() takes the raw JSON shape as a plain
// object, so a real feed snapshot, a hand-built fixture, or malformed
// input can all be asserted against directly.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { tagEntry, shapeKevResponse } from '../lambda/threat-intel.js';

function kevEntry(over) {
  return Object.assign({
    cveID: 'CVE-2024-0001',
    vendorProject: 'Microsoft',
    product: 'Exchange Server',
    vulnerabilityName: 'Example RCE',
    dateAdded: '2024-06-01',
    shortDescription: 'An example vulnerability.',
    dueDate: '2024-06-22',
    knownRansomwareCampaignUse: 'Unknown'
  }, over || {});
}

describe('tagEntry()', () => {
  test('tags a Microsoft entry as microsoft', () => {
    assert.deepEqual(tagEntry('Microsoft', 'Exchange Server'), ['microsoft']);
  });

  test('tags a network-edge vendor', () => {
    assert.deepEqual(tagEntry('Fortinet', 'FortiOS'), ['network-edge']);
  });

  test('an entry can carry more than one tag', () => {
    // VMware ESXi virtualization host — no vendor overlap with the
    // network-edge list, but a real example of a product matching two
    // rules would be, e.g., a Citrix Hypervisor entry (network-edge +
    // virtualization); assert the mechanism directly instead.
    const tags = tagEntry('Fortinet', 'FortiOS SSL-VPN identity gateway');
    assert.ok(tags.includes('network-edge'));
    assert.ok(tags.includes('identity'));
  });

  test('falls back to "general" when nothing matches', () => {
    assert.deepEqual(tagEntry('Some Obscure Vendor', 'Widget'), ['general']);
  });

  test('is case-insensitive and tolerates missing fields', () => {
    assert.deepEqual(tagEntry('MICROSOFT', undefined), ['microsoft']);
    assert.deepEqual(tagEntry(undefined, undefined), ['general']);
  });
});

describe('shapeKevResponse()', () => {
  test('shapes a well-formed entry from an allowlisted vendor', () => {
    const out = shapeKevResponse({ vulnerabilities: [kevEntry()] }, { now: '2024-06-10' });
    assert.equal(out.length, 1);
    assert.equal(out[0].cveId, 'CVE-2024-0001');
    assert.equal(out[0].vendor, 'Microsoft');
    assert.deepEqual(out[0].tags, ['microsoft']);
    assert.equal(out[0].url, 'https://nvd.nist.gov/vuln/detail/CVE-2024-0001');
    assert.equal(out[0].knownRansomwareUse, false);
  });

  test('flags known ransomware use', () => {
    const out = shapeKevResponse({ vulnerabilities: [kevEntry({ knownRansomwareCampaignUse: 'Known' })] }, { now: '2024-06-10' });
    assert.equal(out[0].knownRansomwareUse, true);
  });

  test('drops entries from vendors outside the allowlist', () => {
    const out = shapeKevResponse({ vulnerabilities: [kevEntry({ vendorProject: 'Acme Widgets Inc' })] }, { now: '2024-06-10' });
    assert.equal(out.length, 0);
  });

  test('drops entries older than maxAgeDays', () => {
    const out = shapeKevResponse(
      { vulnerabilities: [kevEntry({ dateAdded: '2023-01-01' })] },
      { now: '2024-06-10', maxAgeDays: 180 }
    );
    assert.equal(out.length, 0);
  });

  test('keeps entries within maxAgeDays', () => {
    const out = shapeKevResponse(
      { vulnerabilities: [kevEntry({ dateAdded: '2024-05-01' })] },
      { now: '2024-06-10', maxAgeDays: 180 }
    );
    assert.equal(out.length, 1);
  });

  test('sorts newest-first by dateAdded', () => {
    const out = shapeKevResponse({
      vulnerabilities: [
        kevEntry({ cveID: 'CVE-2024-0001', dateAdded: '2024-05-01' }),
        kevEntry({ cveID: 'CVE-2024-0002', dateAdded: '2024-06-01' }),
        kevEntry({ cveID: 'CVE-2024-0003', dateAdded: '2024-05-15' })
      ]
    }, { now: '2024-06-10' });
    assert.deepEqual(out.map((i) => i.cveId), ['CVE-2024-0002', 'CVE-2024-0003', 'CVE-2024-0001']);
  });

  test('caps the result at maxItems', () => {
    const many = Array.from({ length: 10 }, (_, i) => kevEntry({ cveID: 'CVE-2024-' + i, dateAdded: '2024-06-0' + (i % 9 + 1) }));
    const out = shapeKevResponse({ vulnerabilities: many }, { now: '2024-06-10', maxItems: 3 });
    assert.equal(out.length, 3);
  });

  test('never throws on malformed input — missing vulnerabilities array', () => {
    assert.deepEqual(shapeKevResponse({}), []);
    assert.deepEqual(shapeKevResponse(null), []);
    assert.deepEqual(shapeKevResponse({ vulnerabilities: 'not an array' }), []);
  });

  test('skips individual malformed entries without dropping the rest', () => {
    const out = shapeKevResponse({
      vulnerabilities: [null, 'garbage', kevEntry(), { vendorProject: 'Microsoft' /* no dateAdded */ }]
    }, { now: '2024-06-10' });
    assert.equal(out.length, 1);
    assert.equal(out[0].cveId, 'CVE-2024-0001');
  });
});
