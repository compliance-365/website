/**
 * Compliance365 Email Signup — AWS Lambda handler
 *
 * Deploy steps:
 *   1. Create a new Lambda function (Node.js 20.x runtime)
 *   2. Paste this file as index.mjs (or zip and upload)
 *   3. No extra env variables needed — uses the existing contact-us endpoint
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
