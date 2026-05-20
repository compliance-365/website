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

  try {
    const body = JSON.parse(event.body || '{}');
    const email      = (body.email      || '').trim().slice(0, 200);
    const org        = (body.org        || '').trim().slice(0, 200);
    const framework  = (body.framework  || 'Not specified').trim().slice(0, 100);
    const source     = (body.source     || 'website').trim().slice(0, 50);

    if (!email || !email.includes('@')) {
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
