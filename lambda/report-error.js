/**
 * Compliance365 Checkpoint — client-side error reporting
 *
 * Receives error reports from the Checkpoint browser app (window.onerror
 * / unhandledrejection handlers, plus a handful of explicit
 * reportError() calls around genuinely unexpected failures — see
 * public/checkpoint/app.js) and writes them to a "Checkpoint Partner
 * ErrorReports" list in Compliance365's OWN SharePoint — never a
 * client's tenant. This is the one piece of visibility Compliance365
 * has into a signed-in practitioner hitting a real bug in the browser,
 * across every client tenant, since nothing else in this app reports
 * failures back here.
 *
 * Deliberately unauthenticated, like a standard error-telemetry ingest
 * endpoint (Sentry/Bugsnag-style: a public project key, not per-request
 * auth) — catching a real crash is worth more than the low-severity
 * abuse risk of someone spamming fake reports, which the rate limiter
 * below bounds. Never receives anything from a client's own posture,
 * risk or compliance data — only error text/stack, the app's own state
 * (view, version), and the browser's own info, all client-supplied and
 * therefore untrusted: every field is truncated and coerced to a string
 * before being written anywhere.
 *
 * Deploy steps:
 *   1. Create a new Lambda function (Node.js 20.x runtime)
 *   2. Paste this file as index.mjs (or zip and upload)
 *   3. Rename the handler to `index.handler`
 *   4. Set env vars: OWNER_TENANT_ID, OWNER_APP_CLIENT_ID,
 *      OWNER_APP_CLIENT_SECRET — the SAME app registration
 *      recordOnOwnerRoster() in provision.js already uses (Application
 *      Sites.Selected or Sites.ReadWrite.All on OUR OWN tenant,
 *      admin-consented). See DEPLOY-PROVISION.md §4 if that registration
 *      doesn't exist yet — reuse it rather than creating a second one.
 *   5. Add an API Gateway HTTP API trigger: POST /report-error
 *   6. Enable CORS on the route:
 *        Allow-Origin: https://www.compliance365.com.au
 *        Allow-Methods: POST, OPTIONS
 *        Allow-Headers: Content-Type
 *   7. Open the owner console at least once (it provisions the
 *      "Checkpoint Partner ErrorReports" list automatically, same as
 *      every other Partner* list).
 *   8. Copy the endpoint URL into public/checkpoint/config.js's
 *      errorReportUrl. Leave it blank and this feature is simply never
 *      attempted — the browser app degrades to no error reporting at
 *      all, exactly like every other optional endpoint in this repo.
 */

const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 20;
const rateBuckets = new Map(); // ip -> [timestamps]

function rateLimited(ip) {
  const now = Date.now();
  const hits = (rateBuckets.get(ip) || []).filter((t) => now - t < RATE_WINDOW_MS);
  if (hits.length >= RATE_MAX) { rateBuckets.set(ip, hits); return true; }
  hits.push(now);
  rateBuckets.set(ip, hits);
  if (rateBuckets.size > 5000) rateBuckets.clear(); // cap memory on hot containers
  return false;
}

/* Coerces anything to a bounded string — every field on the incoming
   report is client-supplied and therefore untrusted (could be missing,
   the wrong type, or absurdly long if a bug in the reporting code
   itself feeds back a huge object). Never throws, whatever's handed
   in. */
export function truncate(v, max) {
  if (v == null) return '';
  var s;
  try { s = typeof v === 'string' ? v : JSON.stringify(v); } catch (e) { s = String(v); }
  s = String(s == null ? '' : s);
  return s.length > max ? s.slice(0, max) + '…' : s;
}

/* Shapes one incoming report body into exactly the fields written to
   SharePoint, with every field truncated and every SharePoint-required
   field defaulted. Exported for testing without needing a mocked
   network at all — this is the entire "what do we trust from the
   client, and how much of it" decision. */
export function shapeReport(body) {
  body = body && typeof body === 'object' ? body : {};
  return {
    tenantId: truncate(body.tenantId, 100),
    clientName: truncate(body.clientName, 200),
    message: truncate(body.message, 2000) || '(no message provided)',
    stack: truncate(body.stack, 4000),
    source: truncate(body.source, 50) || 'unknown',
    context: truncate(body.context, 2000),
    appVersion: truncate(body.appVersion, 20),
    userAgent: truncate(body.userAgent, 300),
    url: truncate(body.url, 300),
    reportedAt: new Date().toISOString()
  };
}

/* Same app-only client-credentials pattern as recordOnOwnerRoster() in
   provision.js — writes to OUR OWN roster only, never a customer's
   tenant. */
async function getOwnerGraphToken() {
  const tenant = process.env.OWNER_TENANT_ID;
  const res = await fetch('https://login.microsoftonline.com/' + tenant + '/oauth2/v2.0/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: process.env.OWNER_APP_CLIENT_ID,
      client_secret: process.env.OWNER_APP_CLIENT_SECRET,
      scope: 'https://graph.microsoft.com/.default'
    })
  });
  const tok = await res.json();
  if (!res.ok) throw new Error('Owner Graph auth failed: ' + (tok.error_description || tok.error));
  return tok.access_token;
}
async function ownerGraph(token, path, opts = {}) {
  const res = await fetch('https://graph.microsoft.com/v1.0' + path, {
    method: opts.method || 'GET',
    headers: Object.assign({ Authorization: 'Bearer ' + token }, opts.body ? { 'Content-Type': 'application/json' } : {}),
    body: opts.body ? JSON.stringify(opts.body) : undefined
  });
  if (!res.ok) throw new Error('Graph ' + res.status + ': ' + (await res.text()));
  if (res.status === 204 || res.status === 202) return null;
  return res.json();
}

async function writeToRoster(report) {
  const token = await getOwnerGraphToken();
  const site = await ownerGraph(token, '/sites/root?$select=id');
  const lists = await ownerGraph(token, '/sites/' + site.id + '/lists?$select=id,displayName&$top=200');
  const list = lists.value.find((l) => l.displayName === 'Checkpoint Partner ErrorReports');
  if (!list) {
    throw new Error('Checkpoint Partner ErrorReports list not found — open the owner console at least once first (it provisions this automatically).');
  }
  await ownerGraph(token, '/sites/' + site.id + '/lists/' + list.id + '/items', {
    method: 'POST',
    body: { fields: Object.assign({ Title: report.message.slice(0, 255) }, {
      TenantId: report.tenantId, ClientName: report.clientName, Message: report.message, Stack: report.stack,
      Source: report.source, Context: report.context, AppVersion: report.appVersion, UserAgent: report.userAgent,
      Url: report.url, ReportedAt: report.reportedAt
    }) }
  });
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
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  if (event.requestContext?.http?.method === 'OPTIONS' || event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders, body: '' };
  }

  const ip = event.requestContext?.http?.sourceIp || event.requestContext?.identity?.sourceIp || 'unknown';
  if (rateLimited(ip)) {
    // A rate-limited beacon still gets a clean response, never an error
    // status — the last thing a struggling client needs is its OWN
    // error-reporting call throwing a new error to report.
    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ ok: false, dropped: 'rate-limited' }) };
  }

  let report;
  try {
    report = shapeReport(JSON.parse(event.body || '{}'));
  } catch (e) {
    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ ok: false, dropped: 'malformed body' }) };
  }

  // Best-effort write: a SharePoint hiccup here must never turn into a
  // 500 the browser's fire-and-forget beacon could interpret as
  // something to retry — dropping one report silently beats a retry
  // storm hitting this endpoint every time a tenant's SharePoint is
  // briefly unavailable.
  try {
    await writeToRoster(report);
  } catch (e) {
    console.error('report-error: failed to write to roster (report dropped):', e && e.message ? e.message : e);
    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ ok: false, dropped: 'write failed' }) };
  }

  return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ ok: true }) };
};
