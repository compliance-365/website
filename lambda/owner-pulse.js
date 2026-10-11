/**
 * Compliance365 owner pulse: a weekly summary of every Checkpoint client,
 * and a daily watchdog on the endpoints that bring in money.
 *
 * Two jobs, chosen by the scheduled event's input:
 *   { "job": "weekly" }    Monday morning email: trials ending, licences
 *                          due for renewal, clients who have gone quiet,
 *                          setups that are failing, errors this week, and
 *                          new sign-ups. Always sent, even when all quiet.
 *   { "job": "watchdog" }  Daily: checks the website, Checkpoint, the
 *                          contact form, sign-ups, checkout activation and
 *                          error reporting still respond. Emails only when
 *                          something fails.
 *
 * Reads the owner console's own SharePoint lists (PartnerClients,
 * PartnerEntitlements, Health, ErrorReports) with the same app-only
 * credential as report-error.js and provision.js, and sends from and to
 * OWNER_NOTIFY_EMAIL with the same Mail.Send permission. Read-only: it
 * never writes to a list. Setup: lambda/DEPLOY-OWNER-PULSE.md.
 *
 * Env: OWNER_TENANT_ID, OWNER_APP_CLIENT_ID, OWNER_APP_CLIENT_SECRET,
 *      OWNER_NOTIFY_EMAIL, ALERT_TIMEZONE (optional, default
 *      Australia/Brisbane).
 */

const DAY = 864e5;
const CONSOLE_URL = 'https://www.compliance365.com.au/owner/';

/* What the watchdog checks. Each probe is chosen so it proves the
   endpoint's code is running without creating anything: no email, no
   SharePoint write, no HubSpot record. `means` is what a failure costs. */
export const CHECKS = [
  { id: 'site', name: 'Website', means: 'Visitors cannot reach compliance365.com.au.',
    url: 'https://www.compliance365.com.au/', method: 'GET',
    ok: (status, text) => status === 200 && /Compliance365/.test(text) },
  { id: 'checkpoint', name: 'Checkpoint app', means: 'Clients and trial users cannot open Checkpoint.',
    url: 'https://www.compliance365.com.au/checkpoint/', method: 'GET',
    ok: (status, text) => status === 200 && /<html/i.test(text) },
  { id: 'contact', name: 'Contact form', means: 'Enquiries from the contact form, checklists, booking page and posture scan may not be reaching you.',
    url: 'https://zzb9g575zh.execute-api.ap-southeast-2.amazonaws.com/Prod/contact-us', method: 'OPTIONS',
    // A real test message would land in your inbox, so this checks only
    // that the route answers the browser's pre-send (CORS) check.
    ok: (status) => status >= 200 && status < 300 },
  { id: 'subscribe', name: 'Sign-ups (newsletter, Essentials alert, HubSpot)', means: 'Newsletter and alert sign-ups, and copies of enquiries to HubSpot, are failing.',
    url: 'https://uclqeiwzgi.execute-api.ap-southeast-2.amazonaws.com/NewDeploy/subscribe', method: 'POST', body: {},
    // An empty sign-up is rejected before anything is sent.
    ok: (status, text) => status === 400 && /Valid email required/.test(text) },
  { id: 'provision', name: 'Checkout activation', means: 'People who buy or start a trial may not get Checkpoint activated, and the access check every client runs may fail.',
    url: 'https://rha5tsq48h.execute-api.ap-southeast-2.amazonaws.com/default/compliance365-provision', method: 'POST',
    body: () => ({ checkRevocation: true, tenantId: process.env.OWNER_TENANT_ID }),
    // Asks whether your own tenant is blocked: proves the function runs
    // and can still read the owner console's lists.
    ok: (status, text) => status === 200 && /"blocked":false/.test(text) },
  { id: 'errors', name: 'Error reporting and alerts', means: 'Client errors and setup problems are not reaching the owner console or your inbox.',
    url: 'https://chlzljct24.execute-api.ap-southeast-2.amazonaws.com/default/Compliance365-Checkpoint-Error', method: 'POST', body: { type: 'health' },
    // An invalid health report is dropped without being saved.
    ok: (status, text) => status === 200 && /invalid health report/.test(text) }
];

/* Runs every check; never throws. Each result: { id, name, means, ok, detail, ms }. */
export async function runChecks(fetchImpl = fetch, checks = CHECKS) {
  return Promise.all(checks.map(async (c) => {
    const t0 = Date.now();
    try {
      const body = typeof c.body === 'function' ? c.body() : c.body;
      const res = await fetchImpl(c.url, {
        method: c.method,
        headers: Object.assign({ Origin: 'https://www.compliance365.com.au' },
          c.method === 'OPTIONS' ? { 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type' } : {},
          body ? { 'Content-Type': 'application/json' } : {}),
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(15000)
      });
      const text = c.method === 'OPTIONS' ? '' : (await res.text()).slice(0, 20000);
      const ok = !!c.ok(res.status, text);
      return { id: c.id, name: c.name, means: c.means, ok, detail: ok ? 'OK' : 'Unexpected response: HTTP ' + res.status + (text ? ', ' + text.replace(/\s+/g, ' ').slice(0, 160) : ''), ms: Date.now() - t0 };
    } catch (e) {
      return { id: c.id, name: c.name, means: c.means, ok: false, detail: 'No response: ' + (e && e.name === 'TimeoutError' ? 'timed out after 15 seconds' : (e && e.message) || String(e)), ms: Date.now() - t0 };
    }
  }));
}

/* ---------------- the weekly summary ---------------- */

const day = (v) => { const t = Date.parse(v || ''); return Number.isFinite(t) ? t : null; };
const lc = (v) => String(v || '').trim().toLowerCase();

/* The latest licence per tenant (by expiry). */
function latestLicence(ents) {
  const by = new Map();
  for (const e of ents || []) {
    const t = lc(e.TenantId); if (!t) continue;
    const cur = by.get(t);
    if (!cur || (day(e.Expiry) || 0) > (day(cur.Expiry) || 0)) by.set(t, e);
  }
  return by;
}

/* Everything the weekly email says, from the four lists' fields. Pure, so
   it can be tested with sample rows. `now` is a timestamp. */
export function buildWeekly({ clients = [], entitlements = [], health = [], errors = [] }, now) {
  const nameOf = new Map();
  for (const h of health) if (lc(h.TenantId)) nameOf.set(lc(h.TenantId), h.ClientName || '');
  for (const c of clients) if (lc(c.TenantId) && c.ClientName) nameOf.set(lc(c.TenantId), c.ClientName);
  const contactOf = new Map(clients.map((c) => [lc(c.TenantId), c]));
  const healthOf = new Map(health.map((h) => [lc(h.TenantId), h]));
  const who = (t) => nameOf.get(t) || t;
  const latest = latestLicence(entitlements);
  const daysTo = (v) => Math.ceil(((day(v) || 0) - now) / DAY);

  const trialsEnding = [], trialsLapsed = [], renewals = [], quiet = [], newSignups = [];
  for (const [t, e] of latest) {
    const blocked = (contactOf.get(t) || {}).Blocked === true;
    const exp = day(e.Expiry);
    if (blocked || exp == null) continue;
    const d = daysTo(e.Expiry);
    if (lc(e.Type) === 'demo') {
      if (d >= 0 && d <= 7) trialsEnding.push({ tenantId: t, name: who(t), days: d, expiry: e.Expiry });
      else if (d < 0 && d >= -7) trialsLapsed.push({ tenantId: t, name: who(t), days: -d, expiry: e.Expiry });
    } else if (d >= 0 && d <= 30 && lc(e.ManualStatus) !== 'renewed' && !e.RenewedBy) {
      renewals.push({ tenantId: t, name: who(t), days: d, expiry: e.Expiry, status: e.ManualStatus || '' });
    }
    if (d >= 0) {
      const seen = day((healthOf.get(t) || {}).ReportedAt);
      const idle = seen == null ? null : Math.floor((now - seen) / DAY);
      if (seen == null || idle >= 14) quiet.push({ tenantId: t, name: who(t), idle, trial: lc(e.Type) === 'demo' });
    }
  }
  for (const e of entitlements) {
    const issued = day(e.IssuedAt);
    if ((contactOf.get(lc(e.TenantId)) || {}).Blocked === true) continue;
    if (issued != null && now - issued <= 7 * DAY && now >= issued) newSignups.push({ tenantId: lc(e.TenantId), name: who(lc(e.TenantId)), trial: lc(e.Type) === 'demo' });
  }

  const setup = health.filter((h) => ['failing', 'warning'].includes(lc(h.Status)) && latest.has(lc(h.TenantId)) && daysTo(latest.get(lc(h.TenantId)).Expiry) >= 0)
    .map((h) => ({ tenantId: lc(h.TenantId), name: who(lc(h.TenantId)), status: lc(h.Status), headline: h.Headline || '' }))
    .sort((a, b) => (a.status === 'failing' ? 0 : 1) - (b.status === 'failing' ? 0 : 1));

  const recent = errors.filter((r) => { const t = day(r.ReportedAt); return t != null && now - t <= 7 * DAY && /^[0-9a-f-]{36}$/i.test(String(r.TenantId || '')); });
  const errBy = new Map();
  for (const r of recent) {
    const t = lc(r.TenantId);
    const g = errBy.get(t) || { tenantId: t, name: who(t), count: 0, messages: new Map() };
    g.count++;
    const m = String(r.Message || '').slice(0, 120);
    g.messages.set(m, (g.messages.get(m) || 0) + 1);
    errBy.set(t, g);
  }
  const errorsByClient = [...errBy.values()].sort((a, b) => b.count - a.count)
    .map((g) => ({ tenantId: g.tenantId, name: g.name, count: g.count, top: [...g.messages.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3) }));

  const byDays = (a, b) => a.days - b.days;
  trialsEnding.sort(byDays); renewals.sort(byDays); trialsLapsed.sort(byDays);
  quiet.sort((a, b) => (b.idle == null ? 1e9 : b.idle) - (a.idle == null ? 1e9 : a.idle));
  const needs = trialsEnding.length + trialsLapsed.length + renewals.length + setup.filter((s) => s.status === 'failing').length + quiet.length;
  const active = [...latest.values()].filter((e) => daysTo(e.Expiry) >= 0).length;
  return { trialsEnding, trialsLapsed, renewals, quiet, setup, errorsByClient, errorCount: recent.length, newSignups, needs, active, contactOf };
}

const esc = (v) => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const plural = (n, one, many) => n + ' ' + (n === 1 ? one : (many || one + 's'));

function section(title, intro, items) {
  if (!items.length) return '';
  return '<h3 style="margin:22px 0 4px;font-size:16px">' + esc(title) + '</h3>' +
    (intro ? '<p style="margin:0 0 6px;font-size:13px;color:#6B6860">' + intro + '</p>' : '') +
    '<ul style="margin:0;padding-left:20px;font-size:14px;line-height:1.6">' + items.map((i) => '<li>' + i + '</li>').join('') + '</ul>';
}
function contactLine(w, t) {
  const c = w.contactOf.get(t) || {};
  return c.ContactEmail ? ' · <a href="mailto:' + esc(c.ContactEmail) + '">' + esc(c.ContactName || c.ContactEmail) + '</a>' : '';
}
const inDays = (d) => (d === 0 ? 'today' : d === 1 ? 'tomorrow' : 'in ' + d + ' days');

export function weeklyEmail(w, checks, now, tz) {
  tz = tz || process.env.ALERT_TIMEZONE || 'Australia/Brisbane';
  const date = new Date(now).toLocaleDateString('en-AU', { timeZone: tz, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const failing = (checks || []).filter((c) => !c.ok);
  const headline = w.needs || failing.length
    ? plural(w.needs + failing.length, 'thing needs', 'things need') + ' you this week'
    : 'All quiet this week';
  const body =
    (failing.length ? section('Something is not working', 'The daily watchdog found these failing this morning.', failing.map((c) => '<b>' + esc(c.name) + '</b>: ' + esc(c.means) + ' <span style="color:#6B6860">(' + esc(c.detail) + ')</span>')) : '') +
    section('Trials ending this week', 'A good time to ask how it is going and offer the setup call.', w.trialsEnding.map((x) => '<b>' + esc(x.name) + '</b>: trial ends ' + inDays(x.days) + contactLine(w, x.tenantId))) +
    section('Trials that ended without buying', 'In the last 7 days.', w.trialsLapsed.map((x) => '<b>' + esc(x.name) + '</b>: ended ' + plural(x.days, 'day') + ' ago' + contactLine(w, x.tenantId))) +
    section('Licences due for renewal', 'Paid licences ending in the next 30 days, not yet marked renewed.', w.renewals.map((x) => '<b>' + esc(x.name) + '</b>: ends ' + inDays(x.days) + (x.status ? ' (' + esc(x.status) + ')' : '') + contactLine(w, x.tenantId))) +
    section('Gone quiet', 'Licensed clients who have not opened Checkpoint for 14 days or more.', w.quiet.map((x) => '<b>' + esc(x.name) + '</b>' + (x.trial ? ' (trial)' : '') + ': ' + (x.idle == null ? 'has not opened Checkpoint since it was set up' : 'last opened ' + plural(x.idle, 'day') + ' ago') + contactLine(w, x.tenantId))) +
    section('Setup problems', 'From Checkpoint\'s own setup check. Settings, Setup health shows the fix.', w.setup.map((x) => '<b>' + esc(x.name) + '</b>: ' + esc(x.status) + (x.headline ? ', ' + esc(x.headline) : ''))) +
    section('Errors this week', plural(w.errorCount, 'error') + ' from signed-in clients in the last 7 days.', w.errorsByClient.map((g) => '<b>' + esc(g.name) + '</b>: ' + plural(g.count, 'error') + '<br><span style="color:#6B6860;font-size:13px">' + g.top.map(([m, n]) => esc(m) + (n > 1 ? ' (×' + n + ')' : '')).join('<br>') + '</span>')) +
    section('New this week', '', w.newSignups.map((x) => '<b>' + esc(x.name) + '</b>: ' + (x.trial ? 'started a trial' : 'new or renewed licence')));
  const html = '<div style="font-family:Segoe UI,system-ui,-apple-system,sans-serif;max-width:640px;color:#1F1D1A;line-height:1.5">' +
    '<p style="margin:0 0 4px;font-size:12px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#A63A12">Checkpoint weekly · ' + esc(date) + '</p>' +
    '<h2 style="margin:0 0 6px;font-size:20px">' + esc(headline) + '</h2>' +
    '<p style="margin:0;font-size:14px;color:#6B6860">' + plural(w.active, 'client') + ' with a current licence or trial. ' +
    (failing.length ? plural(failing.length, 'check') + ' failing.' : 'Website, Checkpoint, sign-ups, checkout and error reporting all responded this morning.') + '</p>' +
    (body || '<p style="margin:16px 0 0;font-size:14px">No trials ending, no renewals due, nobody gone quiet, no setup problems and no errors. Nothing to do.</p>') +
    '<p style="margin:22px 0 8px"><a href="' + CONSOLE_URL + '" style="display:inline-block;background:#A63A12;color:#fff;text-decoration:none;font-weight:700;padding:10px 18px;border-radius:6px">Open the owner console</a></p></div>';
  return { subject: 'Checkpoint weekly: ' + headline.charAt(0).toLowerCase() + headline.slice(1), html };
}

export function watchdogEmail(checks) {
  const failing = checks.filter((c) => !c.ok);
  if (!failing.length) return null;
  const html = '<div style="font-family:Segoe UI,system-ui,-apple-system,sans-serif;max-width:640px;color:#1F1D1A;line-height:1.5">' +
    '<p style="margin:0 0 4px;font-size:12px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#A63A12">Compliance365 watchdog</p>' +
    '<h2 style="margin:0 0 8px;font-size:20px">' + esc(failing.map((c) => c.name).join(', ')) + (failing.length === 1 ? ' is' : ' are') + ' not working</h2>' +
    failing.map((c) => '<p style="margin:12px 0 2px;font-size:15px"><b>' + esc(c.name) + '</b></p><p style="margin:0;font-size:14px">' + esc(c.means) + '</p><p style="margin:2px 0 0;font-size:13px;color:#6B6860">' + esc(c.detail) + '</p>').join('') +
    '<p style="margin:16px 0 0;font-size:14px"><b>What to do:</b> open the function in AWS Lambda, then Monitor, View CloudWatch logs, for the reason. If it was a one-off, tomorrow\'s check will be clear and no email is sent.</p>' +
    '<p style="margin:12px 0 0;font-size:13px;color:#6B6860">Still working: ' + esc(checks.filter((c) => c.ok).map((c) => c.name).join(', ') || 'nothing') + '.</p></div>';
  return { subject: 'Compliance365 watchdog: ' + failing.map((c) => c.name).join(', ') + (failing.length === 1 ? ' is' : ' are') + ' not working', html };
}

/* ---------------- Graph ---------------- */

async function graphToken() {
  const res = await fetch('https://login.microsoftonline.com/' + process.env.OWNER_TENANT_ID + '/oauth2/v2.0/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: process.env.OWNER_APP_CLIENT_ID, client_secret: process.env.OWNER_APP_CLIENT_SECRET, scope: 'https://graph.microsoft.com/.default' })
  });
  const tok = await res.json();
  if (!res.ok) throw new Error('Owner Graph auth failed: ' + (tok.error_description || tok.error));
  return tok.access_token;
}
async function graph(token, path, opts = {}) {
  const res = await fetch(path.startsWith('https://') ? path : 'https://graph.microsoft.com/v1.0' + path, {
    method: opts.method || 'GET',
    headers: Object.assign({ Authorization: 'Bearer ' + token }, opts.body ? { 'Content-Type': 'application/json' } : {}),
    body: opts.body ? JSON.stringify(opts.body) : undefined
  });
  if (!res.ok) throw new Error('Graph ' + res.status + ': ' + (await res.text()).slice(0, 300));
  return res.status === 202 || res.status === 204 ? null : res.json();
}
/* Every row's fields from one owner-console list ([] if the list does not exist). */
async function readList(token, siteId, lists, name, select) {
  const l = lists.find((x) => x.displayName === 'Checkpoint Partner ' + name);
  if (!l) return [];
  const out = [];
  let url = '/sites/' + siteId + '/lists/' + l.id + '/items?$expand=fields($select=' + select + ')&$select=id&$top=500';
  for (let page = 0; url && page < 20; page++) {
    const r = await graph(token, url);
    for (const i of r.value || []) out.push(i.fields || {});
    url = r['@odata.nextLink'] || null;
  }
  return out;
}
async function sendMail(token, mail) {
  const box = process.env.OWNER_NOTIFY_EMAIL;
  if (!box) throw new Error('OWNER_NOTIFY_EMAIL is not set');
  await graph(token, '/users/' + encodeURIComponent(box) + '/sendMail', { method: 'POST', body: {
    message: { subject: mail.subject.slice(0, 250), body: { contentType: 'html', content: mail.html }, toRecipients: [{ emailAddress: { address: box } }] },
    saveToSentItems: false
  } });
}

export const handler = async (event) => {
  const job = (event && event.job) || 'weekly';
  const checks = await runChecks();
  const token = await graphToken();
  if (job === 'watchdog') {
    const mail = watchdogEmail(checks);
    if (mail) await sendMail(token, mail);
    console.log('owner-pulse watchdog:', checks.map((c) => c.id + '=' + (c.ok ? 'ok' : 'FAIL') + ' ' + c.ms + 'ms').join(' '));
    return { job, failing: checks.filter((c) => !c.ok).map((c) => c.id) };
  }
  const site = await graph(token, '/sites/root?$select=id');
  const lists = (await graph(token, '/sites/' + site.id + '/lists?$select=id,displayName&$top=200')).value || [];
  const [clients, entitlements, health, errors] = await Promise.all([
    readList(token, site.id, lists, 'PartnerClients', 'TenantId,ClientName,ContactName,ContactEmail,Status,Blocked'),
    readList(token, site.id, lists, 'PartnerEntitlements', 'TenantId,Type,IssuedAt,Expiry,ManualStatus,RenewedBy'),
    readList(token, site.id, lists, 'Health', 'TenantId,ClientName,Status,Headline,ReportedAt'),
    readList(token, site.id, lists, 'ErrorReports', 'TenantId,ClientName,Message,ReportedAt')
  ]);
  const now = Date.now();
  const w = buildWeekly({ clients, entitlements, health, errors }, now);
  await sendMail(token, weeklyEmail(w, checks, now));
  console.log('owner-pulse weekly: needs=' + w.needs + ' active=' + w.active + ' errors=' + w.errorCount);
  return { job, needs: w.needs, active: w.active };
};
