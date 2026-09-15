// Tests for lambda/threat-intel.js's pure functions — tagEntry() and
// shapeKevResponse() are the entire "what does CISA's raw KEV feed
// become for this app" decision, and neither needs a network call to
// verify: shapeKevResponse() takes the raw JSON shape as a plain
// object, so a real feed snapshot, a hand-built fixture, or malformed
// input can all be asserted against directly.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { tagEntry, shapeKevResponse, TAG_RULES } from '../lambda/threat-intel.js';

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

/* One REAL vendor/product pair per tag, spelled the way CISA spells it
   in the published catalog — not derived from the rule's own match
   terms, which is the whole point. The browser rule used to match
   'chrome' and CISA files these as "Google / Chromium V8"; "chromium"
   does not contain "chrome", so the rule matched nothing in a
   40-item live feed while looking perfectly correct in review.
   Deriving fixtures from the rules would have reproduced that blind
   spot exactly. */
const REAL_CISA_ENTRIES = {
  microsoft:      ['Microsoft', 'SharePoint Server'],
  identity:       ['Microsoft', 'Entra ID'],
  'network-edge': ['Citrix', 'NetScaler ADC and NetScaler Gateway'],
  virtualization: ['VMware', 'ESXi'],
  'ics-ot':       ['Schneider Electric', 'Modicon'],
  'storage-nas':  ['QNAP', 'QTS'],
  browser:        ['Google', 'Chromium V8'],
  collaboration:  ['Atlassian', 'Confluence Data Center and Server'],
  'file-transfer':['Progress Software', 'MOVEit Transfer']
};

describe('TAG_RULES — every rule is reachable from a real advisory', () => {
  test('each tag fires for a vendor/product string as CISA actually writes it', () => {
    const unreachable = [];
    TAG_RULES.forEach((rule) => {
      const fixture = REAL_CISA_ENTRIES[rule.tag];
      if (!fixture) {
        unreachable.push(`${rule.tag} has no REAL_CISA_ENTRIES fixture — add one spelled as CISA spells it`);
        return;
      }
      const tags = tagEntry(fixture[0], fixture[1]);
      if (!tags.includes(rule.tag)) {
        unreachable.push(`${rule.tag} does not fire for "${fixture[0]} / ${fixture[1]}" — got ${JSON.stringify(tags)}`);
      }
    });
    assert.deepEqual(unreachable, [],
      'a tag rule that never fires silently drops a whole category of advisory:\n  ' + unreachable.join('\n  '));
  });

  test('the fixture list has no entry for a tag no rule defines', () => {
    const ruleTags = new Set(TAG_RULES.map((r) => r.tag));
    const orphans = Object.keys(REAL_CISA_ENTRIES).filter((t) => !ruleTags.has(t));
    assert.deepEqual(orphans, [], `REAL_CISA_ENTRIES names tags no rule produces: ${orphans.join(', ')}`);
  });

  test('Entra ID and Azure AD both tag as identity, not just microsoft', () => {
    // Microsoft renamed Azure AD to Entra ID in 2023 and CISA uses
    // whichever name the advisory carried, so both have to resolve.
    ['Entra ID', 'Azure AD Connect', 'Active Directory Federation Services'].forEach((product) => {
      assert.ok(tagEntry('Microsoft', product).includes('identity'),
        `"Microsoft / ${product}" should carry the identity tag`);
    });
  });
});

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
