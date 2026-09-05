/**
 * Compliance365 Checkpoint — threat intel feed proxy
 *
 * Serves a filtered, tagged slice of the U.S. Cybersecurity and
 * Infrastructure Security Agency's (CISA) Known Exploited
 * Vulnerabilities (KEV) catalog — the closest thing to a single,
 * authoritative "this is being actively exploited right now" feed
 * that's public, free, and stable enough to build a client-side panel
 * on. Checkpoint's own posture checks only ever read a client's own
 * Microsoft 365 tenant (see graph.js); this is the one piece of the app
 * that looks OUTWARD, at the general threat landscape, rather than at
 * any one tenant — so it deliberately never receives or needs a Graph
 * token, a tenant ID, or anything else about the caller. Every browser
 * hitting this endpoint gets the exact same response.
 *
 * "Customised for industry and technical stack" (see the Threat intel
 * view in public/checkpoint/app.js) happens entirely CLIENT-SIDE, in
 * lib.js's rankThreatIntelItems() — this Lambda only tags each entry
 * with a small set of generic topic tags (see TAG_RULES below); the
 * browser already knows the signed-in tenant's declared industry
 * (orgIndustry) and self-declared tech stack (orgTechStack) and uses
 * those tags to sort "relevant to you" to the top. Nothing about a
 * client's industry or stack is ever sent to this endpoint, and nothing
 * this endpoint returns is tenant-specific — it's safe to cache and
 * safe to over-share, unlike every other Lambda in this directory.
 *
 * Deploy steps:
 *   1. Create a new Lambda function (Node.js 20.x runtime)
 *   2. Paste this file as index.mjs (or zip and upload)
 *   3. Rename the handler to `index.handler`
 *   4. No environment variables and no Entra app registration needed —
 *      this Lambda calls no Microsoft API and holds no secret.
 *   5. Add an API Gateway HTTP API trigger: GET /threat-intel
 *   6. Enable CORS on the route:
 *        Allow-Origin: https://www.compliance365.com.au
 *        Allow-Methods: GET, OPTIONS
 *   7. Copy the endpoint URL into public/checkpoint/config.js's
 *      threatIntelUrl. Leave it blank and this feature is simply never
 *      attempted — the Threat intel view shows its "not configured"
 *      state, exactly like every other optional endpoint in this repo.
 */

const KEV_URL = 'https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json';
const MAX_AGE_DAYS = 180;
const MAX_ITEMS = 40;
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // a warm container re-serves this from memory instead of re-fetching CISA on every page load across every tenant

/* Vendors an M365-centric SMB/mid-market IT stack is actually likely to
   run. CISA's KEV catalog lists thousands of entries across every
   vendor imaginable — most of them (a niche industrial sensor brand, a
   consumer router nobody here runs) would just be noise in a panel
   meant to be scanned in a few seconds. A curated allowlist, not a
   claim that these are the only vendors that matter: it's the
   difference between a useful ~15-item list and an unreadable
   thousand-item one. */
const VENDOR_ALLOWLIST = [
  'microsoft', 'cisco', 'fortinet', 'ivanti', 'citrix', 'vmware', 'palo alto',
  'sonicwall', 'f5', 'juniper', 'check point', 'barracuda', 'apple', 'google',
  'mozilla', 'adobe', 'oracle', 'atlassian', 'zoho', 'progress software',
  'progress', 'fortra', 'accellion', 'qnap', 'synology', 'schneider electric',
  'siemens', 'rockwell automation', 'd-link', 'netgear', 'draytek', 'zyxel',
  'watchguard', 'sophos', 'pulse secure', 'sap', 'ibm', 'veeam', 'zimbra'
];

/* Topic tags, matched against "<vendorProject> <product>" lowercased.
   Order doesn't matter — an entry can (and often should) carry more
   than one tag, since lib.js's rankThreatIntelItems() (browser side)
   only cares whether ANY tag matches a tenant's declared stack or
   industry, not which. */
const TAG_RULES = [
  { tag: 'microsoft', match: ['microsoft'] },
  { tag: 'identity', match: ['active directory', 'ad fs', 'adfs', 'identity', 'okta', 'duo ', 'ping identity'] },
  { tag: 'network-edge', match: ['cisco', 'fortinet', 'ivanti', 'citrix', 'palo alto', 'sonicwall', 'f5', 'juniper', 'check point', 'barracuda', 'watchguard', 'sophos', 'pulse secure', 'zyxel', 'draytek', 'd-link'] },
  { tag: 'virtualization', match: ['vmware', 'hyper-v', 'hypervisor', 'esxi', 'nutanix'] },
  { tag: 'ics-ot', match: ['schneider electric', 'siemens', 'rockwell automation', 'honeywell', 'mitsubishi electric', 'delta electronics', 'moxa'] },
  { tag: 'storage-nas', match: ['qnap', 'synology', 'netgear'] },
  { tag: 'browser', match: ['chrome', 'firefox', 'safari', 'edge browser'] },
  { tag: 'collaboration', match: ['atlassian', 'confluence', 'jira', 'zimbra'] },
  { tag: 'file-transfer', match: ['progress software', 'moveit', 'fortra', 'goanywhere', 'accellion'] }
];

/* Pure — exported for testing without a network call. Always returns at
   least ['general'] so nothing in the browser renders with an empty tag
   list. */
export function tagEntry(vendorProject, product) {
  const haystack = (String(vendorProject || '') + ' ' + String(product || '')).toLowerCase();
  const tags = TAG_RULES.filter((r) => r.match.some((m) => haystack.indexOf(m) !== -1)).map((r) => r.tag);
  return tags.length ? tags : ['general'];
}

function isAllowedVendor(vendorProject) {
  const v = String(vendorProject || '').toLowerCase();
  return VENDOR_ALLOWLIST.some((allowed) => v.indexOf(allowed) !== -1);
}

/* Pure — the entire "what does CISA's raw feed become for this app"
   decision, exported for testing against fixture JSON (real or
   malformed) without a network call. Never throws: a feed that doesn't
   parse the way this function expects returns an empty item list rather
   than propagating an error, which is what lets the caller fall back to
   whatever it already had cached instead of a 500. */
export function shapeKevResponse(raw, opts) {
  opts = opts || {};
  const maxAgeDays = opts.maxAgeDays || MAX_AGE_DAYS;
  const maxItems = opts.maxItems || MAX_ITEMS;
  const now = opts.now ? new Date(opts.now) : new Date();
  const cutoff = new Date(now.getTime() - maxAgeDays * 24 * 60 * 60 * 1000);

  const vulns = (raw && Array.isArray(raw.vulnerabilities)) ? raw.vulnerabilities : [];
  const items = [];
  for (const v of vulns) {
    if (!v || typeof v !== 'object') continue;
    if (!isAllowedVendor(v.vendorProject)) continue;
    const added = new Date(v.dateAdded);
    if (isNaN(added.getTime()) || added < cutoff) continue;
    items.push({
      cveId: String(v.cveID || ''),
      vendor: String(v.vendorProject || ''),
      product: String(v.product || ''),
      name: String(v.vulnerabilityName || v.cveID || ''),
      description: String(v.shortDescription || ''),
      dateAdded: v.dateAdded,
      dueDate: v.dueDate || '',
      knownRansomwareUse: String(v.knownRansomwareCampaignUse || '').toLowerCase() === 'known',
      tags: tagEntry(v.vendorProject, v.product),
      url: v.cveID ? 'https://nvd.nist.gov/vuln/detail/' + v.cveID : ''
    });
  }
  items.sort((a, b) => String(b.dateAdded).localeCompare(String(a.dateAdded)));
  return items.slice(0, maxItems);
}

let cache = { at: 0, items: [] };

async function loadItems() {
  if (Date.now() - cache.at < CACHE_TTL_MS && cache.items.length) return cache.items;
  const res = await fetch(KEV_URL);
  if (!res.ok) throw new Error('CISA KEV fetch failed: ' + res.status);
  const raw = await res.json();
  const items = shapeKevResponse(raw);
  cache = { at: Date.now(), items };
  return items;
}

export const handler = async (event) => {
  const origin = event.headers?.origin || event.headers?.Origin || '';
  const allowed = [
    'https://www.compliance365.com.au',
    'http://localhost:4321',
    'http://localhost:3000',
  ];
  const corsHeaders = {
    'Access-Control-Allow-Origin': allowed.includes(origin) ? origin : allowed[0],
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Content-Type': 'application/json',
  };

  if (event.requestContext?.http?.method === 'OPTIONS' || event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders, body: '' };
  }

  try {
    const items = await loadItems();
    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ updatedAt: new Date(cache.at).toISOString(), items }) };
  } catch (e) {
    // Serve whatever's cached, even if stale, rather than an error — this
    // is a "nice to have" panel, never something a practitioner's workflow
    // depends on (the "manual is never a failure" design note that runs
    // through this whole app applies here too: a feed outage degrades to
    // stale or empty, never to a broken view).
    if (cache.items.length) {
      return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ updatedAt: new Date(cache.at).toISOString(), items: cache.items, stale: true }) };
    }
    console.error('threat-intel: failed to load KEV feed:', e && e.message ? e.message : e);
    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ updatedAt: null, items: [] }) };
  }
};
