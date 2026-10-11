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
 *   6b. Configuration -> General configuration -> Edit -> Timeout: 10
 *       sec. AWS's 3-second default is not enough for this handler's
 *       four sequential Graph round trips (token, site, list-resolve,
 *       item POST) from ap-southeast-2. Left at 3s, CloudWatch shows
 *       the invocation killed mid-flight (Duration: 3000.00 ms, no
 *       error logged) rather than a caught failure -- and the write
 *       can still land in SharePoint just after the kill, so the
 *       caller gets a raw 500 for a report that actually saved.
 *   7. Open the owner console at least once (it provisions the
 *      "Checkpoint Partner ErrorReports" list automatically, same as
 *      every other Partner* list).
 *   7b. The same endpoint also receives SETUP HEALTH reports (body
 *       type: 'health', see shapeHealth() below and app.js
 *       reportSetupHealth()). They upsert one row per tenant into
 *       "Checkpoint Partner Health", which the owner console also
 *       provisions on load. Redeploying this file is the only step —
 *       no new env vars, route or CORS change.
 *   7c. Optional email alerts: set OWNER_NOTIFY_EMAIL (the same mailbox
 *       and the same Mail.Send application permission provision.js's
 *       signup emails use). Each new error from a signed-in client
 *       tenant, and each tenant whose setup health turns failing, is
 *       emailed to that address; see errorAlertEmail() and
 *       healthAlertEmail(). ALERT_TIMEZONE (optional, default
 *       Australia/Brisbane) sets the time zone the emails use.
 *       Unset = no emails, no behaviour change.
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

/* Setup-health report (type: 'health'): status flags about a tenant's
   Checkpoint setup, sent by app.js reportSetupHealth(). Everything is
   client-supplied and unauthenticated, so it is whitelisted rather than
   truncated: only known check ids and statuses survive, the tenant id
   must look like a GUID, dates must look like dates. A forged report can
   at worst make one roster row show the wrong colour until the real
   tenant's next report replaces it; it can never write arbitrary
   fields. Returns null for a body that cannot be a genuine report. */
const HEALTH_CHECK_IDS = ['activation', 'permissions', 'lists', 'library', 'packs', 'evidence', 'scan', 'capabilities'];
const HEALTH_STATUSES = ['healthy', 'warning', 'failing'];
const FLAG_VALUES = ['pass', 'warn', 'fail', 'info'];
export function shapeHealth(body) {
  body = body && typeof body === 'object' ? body : {};
  const tenantId = String(body.tenantId || '').trim().toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(tenantId)) return null;
  const status = HEALTH_STATUSES.includes(body.status) ? body.status : null;
  if (!status) return null;
  const flags = {};
  const inFlags = body.flags && typeof body.flags === 'object' ? body.flags : {};
  HEALTH_CHECK_IDS.forEach((id) => { if (FLAG_VALUES.includes(inFlags[id])) flags[id] = inFlags[id]; });
  const details = (Array.isArray(body.details) ? body.details : []).slice(0, 10).map((d) => truncate(d, 300));
  const lastScanDate = /^\d{4}-\d{2}-\d{2}$/.test(String(body.lastScanDate || '')) ? body.lastScanDate : '';
  const frameworks = (Array.isArray(body.frameworks) ? body.frameworks : [])
    .map((f) => String(f)).filter((f) => /^[a-z0-9]{1,20}$/.test(f)).slice(0, 30);
  const domains = (Array.isArray(body.domains) ? body.domains : [])
    .map((d) => String(d).trim().toLowerCase()).filter((d) => /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(d) && d.length <= 253).slice(0, 20);
  return {
    tenantId,
    domains,
    clientName: truncate(body.clientName, 200),
    appVersion: truncate(body.appVersion, 20),
    status,
    headline: truncate(body.headline, 255),
    flags,
    details,
    lastScanDate,
    frameworks,
    reportedAt: new Date().toISOString()
  };
}

/* ============== Email alerts (optional) ============== */
/* An error report or a health change worth a person's attention right
   away is emailed to OWNER_NOTIFY_EMAIL. This endpoint is public, so
   what can trigger an email is narrowed and capped:
   - only reports from a signed-in client tenant (a GUID tenant id); the
     public demo's errors still land in the list, without an email;
   - the same error from the same tenant is emailed once per 6 hours;
   - at most 10 alert emails an hour per Lambda container.
   The list in the owner console stays the full record either way. */
const ALERT_REPEAT_MS = 6 * 3600_000;
const ALERT_HOURLY_MAX = 10;
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function newAlertState() { return { lastByKey: new Map(), sent: [] }; }
const alertState = newAlertState();

/* Records the send and returns true when this alert should be emailed now. */
export function shouldAlert(key, now, state) {
  state.sent = state.sent.filter((t) => now - t < 3600_000);
  const last = state.lastByKey.get(key);
  if (last !== undefined && now - last < ALERT_REPEAT_MS) return false;
  if (state.sent.length >= ALERT_HOURLY_MAX) return false;
  state.lastByKey.set(key, now);
  state.sent.push(now);
  if (state.lastByKey.size > 1000) state.lastByKey.clear();
  return true;
}

const CONSOLE_URL = 'https://www.compliance365.com.au/owner/';

/* Checkpoint's screens by their element id (public/checkpoint/index.html),
   so the email names the screen the way the client sees it. A test keeps
   this in step with index.html. */
export const SCREEN_NAMES = {
  'v-dash': 'Dashboard', 'v-integrations': 'Integrations', 'v-board': 'Board view', 'v-constellation': 'Cross-framework mapping',
  'v-scan': 'Posture scan', 'v-risks': 'Risk register', 'v-quantrisk': 'Financial risk analysis', 'v-actions': 'Actions register',
  'v-vendors': 'Supplier risk', 'v-aisystems': 'AI systems', 'v-threatintel': 'Threat intel', 'v-frameworks': 'Frameworks',
  'v-settings': 'Settings', 'v-soa': 'Statement of Applicability', 'v-auditor': 'Auditor guide', 'v-start': 'Start here',
  'v-build': 'Guided build', 'v-whodoes': 'Who does what', 'v-mytasks': 'My tasks', 'v-clauses': 'Management system clauses',
  'v-sharedevidence': 'Shared evidence', 'v-documents': 'Documents', 'v-attestations': 'Policy attestation', 'v-training': 'Training',
  'v-certification': 'Certification', 'v-audits': 'Internal audits', 'v-incidents': 'Incident register', 'v-reviews': 'Management review',
  'v-objectives': 'Objectives register', 'v-assets': 'Asset register', 'v-legal': 'Legal & regulatory register',
  'v-questionnaires': 'Security questionnaires', 'v-calendar': 'Compliance calendar', 'v-auditlog': 'Audit log',
  'v-reports': 'Audit reports', 'v-selftest': 'Self-test', 'v-trustcenter': 'Trust Center', 'v-auditorpack': 'Auditor pack',
  'v-aitools': 'AI tools'
};
export function screenName(context) {
  let view = '';
  try { view = String(JSON.parse(context || '{}').view || ''); } catch (e) { /* context is free text */ }
  return SCREEN_NAMES[view] || (view ? view.replace(/^v-/, '') : 'unknown screen');
}

/* "Safari on macOS" from a user agent string; good enough to know where
   to reproduce it. */
export function browserName(ua) {
  ua = String(ua || '');
  const b = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : '';
  const o = /iPhone|iPad/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows' : /Mac OS X|Macintosh/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : '';
  return b && o ? b + ' on ' + o : (b || o || 'unknown browser');
}

/* When it happened, in the owner's own time zone (ALERT_TIMEZONE, default
   Brisbane), e.g. "Sun 11 Oct 2026, 7:33 pm (Brisbane time)". */
export function localTime(iso, tz) {
  tz = tz || process.env.ALERT_TIMEZONE || 'Australia/Brisbane';
  try {
    const t = new Date(iso).toLocaleString('en-AU', { timeZone: tz, weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
    return t + ' (' + tz.split('/').pop().replace(/_/g, ' ') + ' time)';
  } catch (e) { return iso; }
}

/* What the source means for the client, and a likely cause and next step
   read from the error text. Plain English for the email; the raw error
   stays underneath. */
export function explainError(message, source) {
  const m = String(message || '');
  const seen = source === 'warn'
    ? 'The client saw a "Sync issue" message: something they tried to load or save did not work.'
    : source === 'unhandledrejection'
      ? 'A background task failed, usually loading or saving data. The client may not have seen a message, but something on the screen may be missing or out of date.'
      : source === 'window.onerror'
        ? 'Part of the screen stopped working unexpectedly. The client may not have seen a message, but a button or panel may not have responded.'
        : 'Checkpoint reported an error.';
  const rules = [
    [/\b401\b|InvalidAuthenticationToken|interaction_required|login_required|token.*expired|AADSTS/i,
      'Their Microsoft sign-in expired or needs to be renewed.', 'Usually fixed by signing out and back in. If it keeps happening, check whether their admin has changed sign-in or Conditional Access settings.'],
    [/\b403\b|Forbidden|accessDenied|Access ?denied|Authorization_RequestDenied|insufficient privileges/i,
      'Microsoft refused access: the signed-in person, or Checkpoint, does not have permission for this.', 'Check their role and that admin consent was given for Checkpoint. Settings, Setup health shows what is missing.'],
    [/\b404\b|itemNotFound|not found|does not exist|listNotFound/i,
      'Something Checkpoint expected in their SharePoint was not there (a list, library or record).', 'Open Settings, Setup health with them; it can recreate missing lists. Check nobody deleted or renamed a Checkpoint list.'],
    [/\b429\b|throttl|TooManyRequests|activityLimitReached/i,
      'Microsoft temporarily slowed their requests (throttling).', 'Usually clears by itself within minutes. Only worth acting on if it repeats.'],
    [/\b50[0-4]\b|serviceNotAvailable|generalException|ServiceUnavailable/i,
      'A Microsoft service had a temporary problem.', 'Usually clears by itself. Check the Microsoft 365 service health page if it repeats.'],
    [/Failed to fetch|NetworkError|Load failed|network|ERR_|timed? ?out|aborted/i,
      'The connection dropped or timed out (their network, VPN, proxy or browser extension).', 'Usually nothing to fix in Checkpoint. If it repeats for this client, ask whether a proxy or web filter blocks graph.microsoft.com or SharePoint.'],
    [/QuotaExceeded|storage|quota/i,
      'Their browser or SharePoint ran out of space for something Checkpoint stores.', 'Check their SharePoint storage. In the browser, clearing site data for compliance365.com.au resets Checkpoint\'s local cache.'],
    [/is not a function|is not defined|Cannot read propert|undefined is not|null is not|TypeError|ReferenceError|SyntaxError/i,
      'Probably a bug in Checkpoint.', 'Note the screen and what they were doing, and try to reproduce it in the demo. Send it through for a fix.']
  ];
  const hit = rules.find(([re]) => re.test(m));
  return { seen, likely: hit ? hit[1] : 'Not clear from the error alone.', todo: hit ? hit[2] : 'Check the owner console for other reports from this client around the same time, and ask them what they were doing.' };
}

const esc = (v) => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
/* A stack is only worth showing if it names a file; a console-thrown
   error in Safari leaves just "@". */
const usefulStack = (s) => (/\.js|\.mjs|https?:/.test(String(s || '')) ? String(s).split('\n').slice(0, 8).join('\n') : '');

/* Who the client is, from the owner console's own lists (the client
   roster and the latest health report). Empty fields when not found. */
export function clientFromLists(tenantId, clients, health) {
  const t = String(tenantId || '').toLowerCase();
  const c = (clients || []).find((f) => String(f.TenantId || '').toLowerCase() === t) || {};
  const h = (health || []).find((f) => String(f.TenantId || '').toLowerCase() === t) || {};
  return {
    name: c.ClientName || h.ClientName || '',
    contactName: c.ContactName || '',
    contactEmail: c.ContactEmail || '',
    status: c.Status || '',
    domain: String(h.Domains || '').split(',').filter(Boolean)[0] || '',
    health: h.Status || '',
    healthHeadline: h.Headline || ''
  };
}

function rows(pairs) {
  return '<table cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:8px 0 16px;font-size:14px">' +
    pairs.filter(([, v]) => v).map(([k, v]) => '<tr><td style="padding:3px 16px 3px 0;color:#6B6860;vertical-align:top;white-space:nowrap">' + esc(k) + '</td><td style="padding:3px 0;color:#1F1D1A">' + v + '</td></tr>').join('') +
    '</table>';
}
function page(title, intro, body) {
  return '<div style="font-family:Segoe UI,system-ui,-apple-system,sans-serif;max-width:640px;color:#1F1D1A;line-height:1.5">' +
    '<p style="margin:0 0 4px;font-size:12px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#A63A12">Checkpoint alert</p>' +
    '<h2 style="margin:0 0 8px;font-size:20px">' + esc(title) + '</h2>' +
    '<p style="margin:0 0 12px;font-size:15px">' + intro + '</p>' + body +
    '<p style="margin:20px 0 8px"><a href="' + CONSOLE_URL + '" style="display:inline-block;background:#A63A12;color:#fff;text-decoration:none;font-weight:700;padding:10px 18px;border-radius:6px">Open the owner console</a></p>' +
    '</div>';
}
function clientRows(c, tenantId, version) {
  return [
    ['Client', '<b>' + esc(c.name || 'Not on your client list') + '</b>' + (c.status ? ' (' + esc(c.status) + ')' : '')],
    ['Contact', c.contactName || c.contactEmail ? esc(c.contactName) + (c.contactEmail ? ' &lt;<a href="mailto:' + esc(c.contactEmail) + '">' + esc(c.contactEmail) + '</a>&gt;' : '') : ''],
    ['Domain', esc(c.domain)],
    ['Setup health', c.health ? esc(c.health) + (c.healthHeadline ? ': ' + esc(c.healthHeadline) : '') : ''],
    ['Checkpoint', version ? 'v' + esc(version) : ''],
    ['Tenant ID', '<span style="color:#6B6860">' + esc(tenantId) + '</span>']
  ];
}

/* True when this error report should be emailed now (see the limits above). */
export function errorAlertDue(report, now, state) {
  return GUID.test(report.tenantId) && shouldAlert('err|' + report.tenantId.toLowerCase() + '|' + report.message.slice(0, 200), now, state);
}

/* The email for one error report. Every value from the report is
   client-supplied, so all of it is escaped. */
export function errorAlertEmail(report, client) {
  const c = client || {};
  const who = c.name || report.clientName || 'A client';
  const screen = screenName(report.context);
  const ex = explainError(report.message, report.source);
  const stack = usefulStack(report.stack);
  const html = page(
    who + ' hit an error on ' + screen,
    esc(ex.seen),
    rows([
      ['Likely cause', esc(ex.likely)],
      ['What to do', esc(ex.todo)],
      ['When', esc(localTime(report.reportedAt))],
      ['Screen', esc(screen)],
      ['Browser', esc(browserName(report.userAgent))]
    ]) +
    rows(clientRows(c, report.tenantId, report.appVersion)) +
    '<p style="margin:0 0 4px;font-size:13px;color:#6B6860">The error as Checkpoint reported it:</p>' +
    '<pre style="margin:0;padding:10px 12px;background:#F4F1EA;border-radius:6px;font-size:12px;white-space:pre-wrap;word-break:break-word">' + esc(report.message) + (stack ? '\n\n' + esc(stack) : '') + '</pre>' +
    '<p style="margin:12px 0 0;font-size:12px;color:#6B6860">The same error from this client is not emailed again for 6 hours. Every report is listed in the owner console.</p>'
  );
  return { subject: who + ' hit an error in Checkpoint (' + screen + '): ' + report.message.slice(0, 90), html };
}

/* True when a tenant's setup health has just turned failing. */
export function healthAlertDue(h, previousStatus, now, state) {
  return h.status === 'failing' && previousStatus !== 'failing' && shouldAlert('health|' + h.tenantId, now, state);
}

export function healthAlertEmail(h, previousStatus, client) {
  const c = Object.assign({}, client || {}, { health: '' }); // the health is the subject of this email
  const who = c.name || h.clientName || 'A client';
  const html = page(
    who + "'s Checkpoint setup needs attention",
    "Checkpoint's own setup check for this client has turned to <b>failing</b>" + (previousStatus ? ' (it was ' + esc(previousStatus) + ')' : '') + '. Until it is fixed, parts of Checkpoint may not load or save for them.',
    rows([
      ['Summary', esc(h.headline || 'No summary given')],
      ['When', esc(localTime(h.reportedAt))]
    ]) +
    (h.details.length ? '<p style="margin:0 0 4px;font-size:14px"><b>What the check found</b></p><ul style="margin:0 0 16px;padding-left:20px;font-size:14px">' + h.details.map((d) => '<li>' + esc(d) + '</li>').join('') + '</ul>' : '') +
    '<p style="margin:0 0 12px;font-size:14px"><b>What to do:</b> ask the client (or open Checkpoint with them) to go to Settings, Setup health. It explains each problem and offers a fix for the common ones: <b>Repair setup</b> recreates missing lists and the evidence library, and <b>Grant admin consent</b> covers missing permissions.</p>' +
    rows(clientRows(c, h.tenantId, h.appVersion))
  );
  return { subject: who + "'s Checkpoint setup is failing: " + (h.headline || 'see details').slice(0, 100), html };
}

/* Looks the client up in the owner console's lists; never throws. */
async function lookupClient(token, siteId, lists, tenantId) {
  try {
    const read = async (name, select) => {
      const l = lists.find((x) => x.displayName === name);
      if (!l) return [];
      const page = await ownerGraph(token, '/sites/' + siteId + '/lists/' + l.id + '/items?$expand=fields($select=' + select + ')&$select=id&$top=500');
      return (page.value || []).map((i) => i.fields || {});
    };
    const [clients, health] = await Promise.all([
      read('Checkpoint Partner PartnerClients', 'TenantId,ClientName,ContactName,ContactEmail,Status'),
      read('Checkpoint Partner Health', 'TenantId,ClientName,Domains,Status,Headline')
    ]);
    return clientFromLists(tenantId, clients, health);
  } catch (e) {
    console.error('report-error: client lookup failed (email sent without it):', e && e.message ? e.message : e);
    return {};
  }
}

async function sendAlert(token, mail) {
  const mailbox = process.env.OWNER_NOTIFY_EMAIL;
  if (!mailbox || !mail) return;
  await ownerGraph(token, '/users/' + encodeURIComponent(mailbox) + '/sendMail', {
    method: 'POST',
    body: {
      message: {
        subject: mail.subject.slice(0, 250),
        body: { contentType: 'html', content: mail.html },
        toRecipients: [{ emailAddress: { address: mailbox } }]
      },
      saveToSentItems: false
    }
  });
}

/* Same app-only client-credentials pattern as recordOnOwnerRoster() in
   provision.js — writes to OUR OWN roster only, never a customer's
   tenant. */
let cachedToken = null; // { token, until } — reused while the container is warm
async function getOwnerGraphToken() {
  if (cachedToken && Date.now() < cachedToken.until) return cachedToken.token;
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
  cachedToken = { token: tok.access_token, until: Date.now() + Math.max(0, (Number(tok.expires_in) || 0) - 300) * 1000 };
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
  return { token, siteId: site.id, lists: lists.value };
}

/* One row per tenant: the latest report replaces the previous one. The
   list holds one row per client, so reading it whole to find the row is
   cheaper and safer than a filter on an unindexed column. */
async function upsertHealth(h) {
  const token = await getOwnerGraphToken();
  const site = await ownerGraph(token, '/sites/root?$select=id');
  const lists = await ownerGraph(token, '/sites/' + site.id + '/lists?$select=id,displayName&$top=200');
  const list = lists.value.find((l) => l.displayName === 'Checkpoint Partner Health');
  if (!list) throw new Error('Checkpoint Partner Health list not found — open the owner console once (it provisions this automatically).');
  const base = '/sites/' + site.id + '/lists/' + list.id + '/items';
  const fields = {
    Title: h.clientName || h.tenantId, TenantId: h.tenantId, Domains: h.domains.join(','), ClientName: h.clientName, AppVersion: h.appVersion,
    Status: h.status, Headline: h.headline, Flags: JSON.stringify(h.flags), Details: h.details.join('\n'),
    LastScanDate: h.lastScanDate, Frameworks: h.frameworks.join(','), ReportedAt: h.reportedAt
  };
  let url = base + '?$expand=fields($select=TenantId,Status)&$select=id&$top=500';
  let existing = null;
  while (url && !existing) {
    const page = await ownerGraph(token, url.replace('https://graph.microsoft.com/v1.0', ''));
    existing = (page.value || []).find((i) => String(i.fields && i.fields.TenantId || '').toLowerCase() === h.tenantId) || null;
    url = page['@odata.nextLink'] || null;
  }
  if (existing) await ownerGraph(token, base + '/' + existing.id + '/fields', { method: 'PATCH', body: fields });
  else await ownerGraph(token, base, { method: 'POST', body: { fields } });
  return { token, siteId: site.id, lists: lists.value, previousStatus: existing ? String(existing.fields.Status || '') : '' };
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

  let parsed;
  try { parsed = JSON.parse(event.body || '{}'); } catch (e) { parsed = null; }
  if (parsed && parsed.type === 'health') {
    const health = shapeHealth(parsed);
    if (!health) return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ ok: false, dropped: 'invalid health report' }) };
    let written;
    try {
      written = await upsertHealth(health);
    } catch (e) {
      console.error('report-error: failed to write health report (dropped):', e && e.message ? e.message : e);
      return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ ok: false, dropped: 'write failed' }) };
    }
    if (process.env.OWNER_NOTIFY_EMAIL) {
      try {
        if (healthAlertDue(health, written.previousStatus, Date.now(), alertState)) {
          const client = await lookupClient(written.token, written.siteId, written.lists, health.tenantId);
          await sendAlert(written.token, healthAlertEmail(health, written.previousStatus, client));
        }
      } catch (e) { console.error('report-error: health alert email failed:', e && e.message ? e.message : e); }
    }
    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ ok: true }) };
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
  let written;
  try {
    written = await writeToRoster(report);
  } catch (e) {
    console.error('report-error: failed to write to roster (report dropped):', e && e.message ? e.message : e);
    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ ok: false, dropped: 'write failed' }) };
  }
  // The report is saved; an email failing must not change the response.
  if (process.env.OWNER_NOTIFY_EMAIL) {
    try {
      if (errorAlertDue(report, Date.now(), alertState)) {
        const client = await lookupClient(written.token, written.siteId, written.lists, report.tenantId);
        await sendAlert(written.token, errorAlertEmail(report, client));
      }
    } catch (e) { console.error('report-error: alert email failed:', e && e.message ? e.message : e); }
  }

  return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ ok: true }) };
};
