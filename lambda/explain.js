/**
 * Compliance365 Posture Scan — AI Gap Explainer — AWS Lambda handler
 *
 * Same pattern as chat.js: a plain AWS Lambda (Node 20.x) behind an API
 * Gateway HTTP API, called directly from the browser. This one takes the
 * visitor's posture-scan gap list (control id/title/method/status/effort/
 * framework clauses — no tenant name, no PII) and returns a short plain-
 * language explanation per gap.
 *
 * Deploy steps:
 *   1. Create a new Lambda function (Node.js 20.x runtime)
 *   2. Paste this file as index.mjs (or zip and upload)
 *   3. Add env variable: ANTHROPIC_API_KEY = sk-ant-...
 *      (same key as the chat Lambda — Lambda env vars are per-function,
 *      so it needs to be set again here even if chat.js already has it)
 *   4. Add an API Gateway HTTP trigger (POST /explain)
 *   5. Enable CORS on the route — Allow-Origin: https://www.compliance365.com.au
 *   6. Copy the invoke URL into src/pages/posture-scan/index.astro
 *      (EXPLAIN_API_URL constant near the top of the inline <script>)
 *   7. IMPORTANT — throttle the route, same as chat.js. Set an API
 *      Gateway stage/route throttle (e.g. rate 2 rps, burst 5) and a
 *      CloudWatch billing/invocation alarm. The in-memory limiter below
 *      resets on every cold start and is per-container, so it's a second
 *      line of defence only, not a substitute for the gateway throttle.
 *
 * See lambda/DEPLOY-EXPLAIN.md for the full walkthrough.
 *
 * Dependencies: none — uses the native fetch available in Node 20
 */

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const MODEL         = 'claude-haiku-4-5-20251001'; // fast + affordable, same choice as chat.js
const MAX_TOKENS    = 2000;
const MAX_GAPS      = 18; // the scan never produces more than 18 controls total

const SYSTEM_PROMPT = `You explain Microsoft 365 compliance posture scan findings to a non-technical business owner in Australia, for Compliance365, a cybersecurity compliance consultancy.

You will be given a JSON array of "gap" controls from a scan across Essential Eight, ISO 27001, ISO 27701 and ISO 42001. Each item has:
- id: a stable identifier — echo this back exactly
- title: the control name
- method: "automated" (read directly and verified from the customer's Microsoft 365 tenant via Microsoft Graph) or "attested" (cannot be read from Graph — requires the customer to manually confirm/provide evidence)
- status: "fail" (automated control checked and failed), "partial" (automated control partially met), or "attest" (attested control — not yet confirmed)
- effort: "quick" (well under a day), "moderate" (about a week), or "project" (multiple weeks)
- frameworks: which framework(s)/clauses this control maps to

For EACH item, write one short plain-language explanation (about 40-70 words) covering:
1. What the finding actually means in plain English (no jargon).
2. Why it matters specifically for the framework(s) listed for that control.
3. Roughly how hard it is to fix, in plain language consistent with the given effort tier — don't invent a different difficulty than the tier implies.

Critically: the explanation MUST make it unambiguous whether this is an "automated" finding (something we directly measured as failing in their tenant) or an "attested" item (something we cannot see — it may already be fine, but they need to confirm/document it themselves). Never blur this distinction. For method:"automated", open by making clear this was measured directly. For method:"attested", open by making clear this couldn't be read automatically and needs their confirmation — do not claim it is "failing" since we don't actually know.

Never invent facts about the customer's environment beyond what's given. Write in Australian English. Be direct and practical, not alarmist.

Respond with ONLY a JSON object of this exact shape, no markdown fences, no commentary:
{"explanations":[{"id":"<id>","text":"<explanation>"}]}
One entry per input item, same ids, same order.`;

/* Best-effort, in-memory per-IP limiter — same pattern as chat.js.
 * Tighter than chat.js since each call is a larger, costlier request. */
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 5;
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

const VALID_METHOD = new Set(['automated', 'attested']);
const VALID_STATUS = new Set(['fail', 'partial', 'attest']);
const VALID_EFFORT = new Set(['quick', 'moderate', 'project']);

function sanitiseGaps(rawGaps) {
  if (!Array.isArray(rawGaps)) return [];
  return rawGaps
    .slice(0, MAX_GAPS)
    .filter((g) => g && typeof g === 'object')
    .map((g) => ({
      id: String(g.id || '').slice(0, 64),
      title: String(g.title || '').slice(0, 200),
      method: VALID_METHOD.has(g.method) ? g.method : 'attested',
      status: VALID_STATUS.has(g.status) ? g.status : 'attest',
      effort: VALID_EFFORT.has(g.effort) ? g.effort : 'moderate',
      frameworks: Array.isArray(g.frameworks) ? g.frameworks.slice(0, 6).map((f) => String(f).slice(0, 80)) : [],
    }))
    .filter((g) => g.id && g.title);
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
    const gaps = sanitiseGaps(body.gaps);

    if (!gaps.length) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'No gaps provided' }) };
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');

    const res = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: JSON.stringify(gaps) }],
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error('Anthropic error:', err);
      throw new Error('Upstream API error');
    }

    const data = await res.json();
    const raw = data.content?.[0]?.text || '';

    let explanations = [];
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed.explanations)) {
        explanations = parsed.explanations
          .filter((e) => e && typeof e.id === 'string' && typeof e.text === 'string')
          .map((e) => ({ id: e.id, text: e.text.slice(0, 1000) }));
      }
    } catch (e) {
      console.error('Failed to parse Claude JSON response:', raw);
      throw new Error('Malformed upstream response');
    }

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ explanations }),
    };
  } catch (err) {
    console.error('Explain handler error:', err);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Something went wrong generating explanations.' }),
    };
  }
};
