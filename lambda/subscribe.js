/**
 * Compliance365 Email Signup — AWS Lambda handler
 *
 * Deploy steps:
 *   1. Create a new Lambda function (Node.js 20.x runtime)
 *   2. Paste this file as index.mjs (or zip and upload)
 *   3. No extra env variables needed — uses the existing contact-us endpoint.
 *      Optional: HUBSPOT_TOKEN (a HubSpot private app token) keeps every
 *      sign-up and website enquiry in HubSpot as a contact; see
 *      lambda/DEPLOY-HUBSPOT.md and the HubSpot section below. Set the
 *      Lambda timeout to 10 seconds when it is on.
 *   4. Add an API Gateway HTTP trigger: POST /subscribe
 *      (same API Gateway as the chat function)
 *   5. Enable CORS on the route:
 *        Allow-Origin: https://www.compliance365.com.au
 *        Allow-Methods: POST, OPTIONS
 *        Allow-Headers: Content-Type
 */

const CONTACT_URL = 'https://zzb9g575zh.execute-api.ap-southeast-2.amazonaws.com/Prod/contact-us';
const NOTIFY_EMAIL = 'info@compliance365.com.au';

/* Same in-memory per-IP limiter chat.js/explain.js already use — see
 * their own comments on its limits (resets per cold start, per-container
 * under concurrency; the real backstop is an API Gateway throttle). This
 * endpoint previously had NO limiter at all, unlike its two siblings —
 * every POST triggers an outbound call to the contact-us Lambda (which
 * emails NOTIFY_EMAIL), so an unthrottled anonymous caller could spam
 * that inbox and rack up invocations of a downstream function with
 * nothing standing in the way at all. */
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 10;
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

/* A minimal, deliberately permissive shape check — this is a marketing
 * newsletter signup, not an account, so rejecting a real-looking address
 * is worse than accepting a slightly malformed one. Catches the trivial
 * junk ("@", "a@") the previous `.includes('@')` check let through,
 * without pretending to be a full RFC 5322 validator. The recipient is
 * always the fixed NOTIFY_EMAIL above, never this address, so there is
 * no open-relay/spam-third-parties risk either way — this is purely
 * about not emailing the team "New subscriber: @" as if it were real. */
function looksLikeEmail(s) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

/* ============== HubSpot (optional) ============== */
/* With HUBSPOT_TOKEN set (a HubSpot private app token with the contact
   read/write and contact-schema write scopes), every sign-up and every
   website enquiry (type 'lead', sent by window.c365SendLead() in
   BaseLayout) is kept in HubSpot as a contact: how they found the site,
   the last form and page, which updates they asked for, and the enquiry
   as a note. The first-visit fields are set once and never overwritten.
   Unset = no HubSpot calls at all. A HubSpot failure never changes what
   the visitor sees. */
const HUBSPOT = 'https://api.hubapi.com';
export const C365_PROPERTIES = [
  { name: 'c365_first_visit', label: 'First website visit (date)' },
  { name: 'c365_first_page', label: 'First page seen on compliance365.com.au' },
  { name: 'c365_first_referrer', label: 'First referring site' },
  { name: 'c365_utm_source', label: 'Campaign source (utm_source)' },
  { name: 'c365_utm_medium', label: 'Campaign medium (utm_medium)' },
  { name: 'c365_utm_campaign', label: 'Campaign name (utm_campaign)' },
  { name: 'c365_ad_click', label: 'Came from an ad click' },
  { name: 'c365_last_form', label: 'Last website form' },
  { name: 'c365_last_page', label: 'Last page a form was sent from' },
  { name: 'c365_digest_signup', label: 'Monthly digest sign-up', bool: true },
  { name: 'c365_essentials_alert', label: 'Essentials series release alert sign-up', bool: true }
];

const clip = (v, n) => String(v == null ? '' : v).trim().slice(0, n);
export function splitName(name) {
  const parts = clip(name, 120).split(/\s+/).filter(Boolean);
  return { firstname: parts[0] || '', lastname: parts.slice(1).join(' ') };
}

/* The contact properties for one lead or sign-up: `always` is written on
   every submission, `firstOnly` only when the contact has no first visit
   recorded yet. Everything is client-supplied, so it is trimmed and
   capped. */
export function contactProps(x) {
  const touch = x.touch && typeof x.touch === 'object' ? x.touch : null;
  const always = { email: clip(x.email, 200).toLowerCase() };
  const n = splitName(x.name);
  if (n.firstname) always.firstname = n.firstname;
  if (n.lastname) always.lastname = n.lastname;
  if (clip(x.company, 160)) always.company = clip(x.company, 160);
  if (clip(x.form, 80)) always.c365_last_form = clip(x.form, 80);
  if (clip(x.page, 200)) always.c365_last_page = clip(x.page, 200);
  if (x.kind === 'signup' && x.source !== 'free-roadmap') {
    if (/essentials/i.test(x.topic || '')) always.c365_essentials_alert = 'true';
    else always.c365_digest_signup = 'true';
  }
  const firstOnly = {
    c365_first_visit: clip(touch && /^\d{4}-\d{2}-\d{2}$/.test(touch.at) ? touch.at : new Date().toISOString().slice(0, 10), 10),
    c365_first_page: clip((touch && touch.landing) || x.page || '/', 200),
    c365_first_referrer: clip((touch ? touch.ref : x.ref) || 'direct or not shown', 200)
  };
  if (touch) {
    ['utm_source', 'utm_medium', 'utm_campaign'].forEach((k) => { if (clip(touch[k], 80)) firstOnly['c365_' + k] = clip(touch[k], 80); });
    if (clip(touch.ad, 40)) firstOnly.c365_ad_click = clip(touch.ad, 40);
  }
  return { always, firstOnly };
}

const escHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
export function noteBody(x) {
  const lines = x.kind === 'lead'
    ? [(x.form || 'Website enquiry') + (x.subject ? ': ' + x.subject : ''), '', clip(x.message, 4000)]
    : ['Signed up for: ' + (x.topic || 'updates') + (x.source ? ' (' + x.source + ')' : '')];
  lines.push('', 'Sent from ' + (x.page || 'the website') + ' on compliance365.com.au.');
  return escHtml(lines.join('\n')).replace(/\n/g, '<br>');
}

async function hubspot(path, opts = {}) {
  const res = await fetch(HUBSPOT + path, {
    method: opts.method || 'GET',
    headers: Object.assign({ Authorization: 'Bearer ' + process.env.HUBSPOT_TOKEN }, opts.body ? { 'Content-Type': 'application/json' } : {}),
    body: opts.body ? JSON.stringify(opts.body) : undefined
  });
  const text = await res.text();
  if (!res.ok) { const e = new Error('HubSpot ' + res.status + ': ' + text.slice(0, 300)); e.status = res.status; throw e; }
  return text ? JSON.parse(text) : null;
}

let propsReady = false;
/* Creates any c365_ contact property that does not exist yet; once per warm container. */
async function ensureProperties() {
  if (propsReady) return;
  const have = new Set(((await hubspot('/crm/v3/properties/contacts')).results || []).map((p) => p.name));
  const inputs = C365_PROPERTIES.filter((p) => !have.has(p.name)).map((p) => (p.bool
    ? { name: p.name, label: p.label, groupName: 'contactinformation', type: 'bool', fieldType: 'booleancheckbox', options: [{ label: 'Yes', value: 'true' }, { label: 'No', value: 'false' }] }
    : { name: p.name, label: p.label, groupName: 'contactinformation', type: 'string', fieldType: 'text' }));
  if (inputs.length) await hubspot('/crm/v3/properties/contacts/batch/create', { method: 'POST', body: { inputs } });
  propsReady = true;
}

async function findContact(email) {
  const r = await hubspot('/crm/v3/objects/contacts/search', { method: 'POST', body: {
    filterGroups: [{ filters: [{ propertyName: 'email', operator: 'EQ', value: email }] }], properties: ['c365_first_page'], limit: 1
  } });
  return (r && r.results && r.results[0]) || null;
}

/* Creates or updates the contact and adds the note. Returns the contact id. */
export async function syncToHubSpot(x) {
  await ensureProperties();
  const { always, firstOnly } = contactProps(x);
  let contact = await findContact(always.email);
  let id;
  if (contact) {
    id = contact.id;
    const props = Object.assign({}, always, contact.properties && contact.properties.c365_first_page ? {} : firstOnly);
    await hubspot('/crm/v3/objects/contacts/' + id, { method: 'PATCH', body: { properties: props } });
  } else {
    try {
      id = (await hubspot('/crm/v3/objects/contacts', { method: 'POST', body: { properties: Object.assign({ lifecyclestage: 'lead' }, firstOnly, always) } })).id;
    } catch (e) {
      if (e.status !== 409) throw e; // created a moment ago by a parallel submission
      contact = await findContact(always.email);
      id = contact.id;
      await hubspot('/crm/v3/objects/contacts/' + id, { method: 'PATCH', body: { properties: always } });
    }
  }
  await hubspot('/crm/v3/objects/notes', { method: 'POST', body: {
    properties: { hs_timestamp: new Date().toISOString(), hs_note_body: noteBody(x) },
    associations: [{ to: { id }, types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 202 }] }]
  } });
  return id;
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

  // Preflight
  if (event.requestContext?.http?.method === 'OPTIONS' || event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders, body: '' };
  }

  const ip = event.requestContext?.http?.sourceIp || event.requestContext?.identity?.sourceIp || 'unknown';
  if (rateLimited(ip)) {
    return { statusCode: 429, headers: corsHeaders, body: JSON.stringify({ error: 'Too many requests — please wait a minute and try again.' }) };
  }

  try {
    const body = JSON.parse(event.body || '{}');

    /* A website enquiry, copied here for HubSpot only: the form has
       already emailed it through contact-us, so nothing is emailed. */
    if (body.type === 'lead') {
      const lead = body.lead && typeof body.lead === 'object' ? body.lead : {};
      if (!looksLikeEmail(String(lead.email || '').trim())) {
        return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'Valid email required' }) };
      }
      if (!process.env.HUBSPOT_TOKEN) return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ ok: true, hubspot: 'off' }) };
      try {
        await syncToHubSpot(Object.assign({}, lead, { kind: 'lead' }));
        return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ ok: true, hubspot: 'saved' }) };
      } catch (e) {
        console.error('subscribe: HubSpot lead failed:', e && e.message ? e.message : e);
        return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ ok: true, hubspot: 'failed' }) };
      }
    }

    const email      = (body.email      || '').trim().slice(0, 200);
    const org        = (body.org        || '').trim().slice(0, 200);
    const framework  = (body.framework  || 'Not specified').trim().slice(0, 100);
    const source     = (body.source     || 'website').trim().slice(0, 50);

    if (!email || !looksLikeEmail(email)) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Valid email required' }),
      };
    }

    const subject = `New subscriber — ${framework} (${source})`;
    const message = [
      `New email signup from compliance365.com.au`,
      ``,
      `Email:        ${email}`,
      `Organisation: ${org || '(not provided)'}`,
      `Framework:    ${framework}`,
      `Source:       ${source}`,
      `Time:         ${new Date().toISOString()}`,
    ].join('\n');

    await fetch(CONTACT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: org || email,
        email: NOTIFY_EMAIL,
        subject,
        message,
      }),
    });

    if (process.env.HUBSPOT_TOKEN) {
      try {
        await syncToHubSpot({ kind: 'signup', email, company: org, topic: framework, source, form: source === 'free-roadmap' ? 'Free roadmap (' + framework + ')' : framework, page: body.page, touch: body.touch });
      } catch (e) { console.error('subscribe: HubSpot sign-up failed (the email was sent):', e && e.message ? e.message : e); }
    }

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ ok: true }),
    };
  } catch (err) {
    console.error('Subscribe handler error:', err);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Something went wrong. Please try again.' }),
    };
  }
};
