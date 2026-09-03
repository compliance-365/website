/* Shared Graph client for this Function App — app-only (client-credentials)
 * auth, used identically by every function folder under azure/ (currently
 * PostureMonitor and EvidenceSubmit). Extracted here so both share ONE
 * token-acquisition/request implementation rather than two copies that
 * could quietly drift; `func azure functionapp publish` packages this
 * whole azure/ directory tree, so a local `require('../lib/graph')` from
 * either function folder is safe (unlike a `require('../../lib.js')`
 * reaching for the browser bundle one level further up, which is NOT
 * packaged — see PostureMonitor/index.js's own header comment).
 */

const GRAPH = 'https://graph.microsoft.com/v1.0';

async function getAppToken() {
  const tenantId = process.env.TENANT_ID;
  const url = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    client_id: process.env.CLIENT_ID,
    client_secret: process.env.CLIENT_SECRET,
    scope: 'https://graph.microsoft.com/.default',
    grant_type: 'client_credentials'
  });
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
  if (!res.ok) throw new Error('Token request failed: ' + res.status + ' ' + await res.text());
  return (await res.json()).access_token;
}

/* Whether a Graph HTTP status is a throttling/transient-availability
   signal worth retrying automatically. Hand-mirrored from
   isRetryableGraphStatus()/graphRetryDelayMs() in public/checkpoint/
   lib.js (this Function has no shared module with the browser bundle —
   see PostureMonitor/index.js's own header comment) — if you change
   one, change the other. This Function runs unattended, once a day
   against every check the browser app also makes; getting throttled
   partway through a run without retrying means a scan silently missing
   checks, or a governance sweep that never gets to the owner-chase
   emails, with no signed-in practitioner around to notice or retry by
   hand. */
function isRetryableGraphStatus(status) {
  return status === 429 || status === 503 || status === 504;
}

function graphRetryDelayMs(retryAfterHeader, attempt) {
  const fromHeader = parseInt(retryAfterHeader, 10);
  if (!isNaN(fromHeader) && fromHeader >= 0) return fromHeader * 1000;
  const base = Math.min(1000 * Math.pow(2, attempt), 16000);
  const jitter = Math.random() * base * 0.25;
  return Math.round(base + jitter);
}

const GRAPH_MAX_RETRIES = 3;

function graphClient(token) {
  async function g(path, opts) {
    opts = opts || {};
    const url = path.indexOf('http') === 0 ? path : GRAPH + path;
    let res, attempt = 0;
    for (;;) {
      res = await fetch(url, {
        method: opts.method || 'GET',
        headers: Object.assign({ Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, opts.headers || {}),
        body: opts.body ? JSON.stringify(opts.body) : undefined
      });
      if (!isRetryableGraphStatus(res.status) || attempt >= GRAPH_MAX_RETRIES) break;
      const delay = graphRetryDelayMs(res.headers.get('Retry-After'), attempt);
      await new Promise(resolve => setTimeout(resolve, delay));
      attempt++;
    }
    if (!res.ok) { const e = new Error('Graph ' + res.status + ' on ' + path + ': ' + await res.text()); e.status = res.status; throw e; }
    if (res.status === 204) return null;
    return res.json();
  }
  async function gAll(path) {
    let out = [], next = path;
    while (next) {
      const page = await g(next);
      out = out.concat(page.value || []);
      next = page['@odata.nextLink'] || null;
    }
    return out;
  }
  return { g, gAll };
}

async function resolveSiteId(g) {
  const hostname = process.env.SP_HOSTNAME;
  const sitePath = process.env.SP_SITE_PATH || '';
  if (!hostname) return (await g('/sites/root?$select=id')).id;
  const path = sitePath ? `/sites/${hostname}:${sitePath}?$select=id` : `/sites/${hostname}?$select=id`;
  return (await g(path)).id;
}

/* Resolved WITHOUT throwing — a tenant on an older Checkpoint version
   simply doesn't have some of these lists yet, and that must degrade
   gracefully (PostureMonitor still runs its posture scan; EvidenceSubmit
   reports a clear "not available yet" rather than a raw Graph 404) not
   fail outright. ActionUpdates is here alongside the governance sweep's
   own set purely so EvidenceSubmit can resolve it in the SAME call —
   PostureMonitor doesn't read this particular key. */
async function resolveOptionalLists(g, siteId) {
  const prefix = process.env.LIST_PREFIX || 'Checkpoint';
  const lists = await g(`/sites/${siteId}/lists?$select=id,displayName&$top=200`);
  const byName = {};
  (lists.value || []).forEach(l => { byName[l.displayName] = l.id; });
  return {
    Documents: byName[prefix + ' Documents'] || null,
    Attestations: byName[prefix + ' Attestations'] || null,
    Training: byName[prefix + ' Training'] || null,
    Actions: byName[prefix + ' Actions'] || null,
    ActionUpdates: byName[prefix + ' ActionUpdates'] || null,
    Controls: byName[prefix + ' Controls'] || null,
    Incidents: byName[prefix + ' Incidents'] || null,
    Vendors: byName[prefix + ' Vendors'] || null,
    Calendar: byName[prefix + ' Calendar'] || null,
    Audits: byName[prefix + ' Audits'] || null
  };
}

module.exports = { getAppToken, graphClient, resolveSiteId, resolveOptionalLists, isRetryableGraphStatus, graphRetryDelayMs };
