/**
 * Compliance365 AI Chat — AWS Lambda handler
 *
 * Deploy steps:
 *   1. Create a new Lambda function (Node.js 20.x runtime)
 *   2. Paste this file as index.mjs (or zip and upload)
 *   3. Add env variable: ANTHROPIC_API_KEY = sk-ant-...
 *   4. Add an API Gateway HTTP trigger (POST /chat)
 *   5. Enable CORS on the route — Allow-Origin: https://www.compliance365.com.au
 *   6. Copy the invoke URL into src/components/AIChat.astro (CHAT_API constant)
 *
 * Dependencies: none — uses the native fetch available in Node 20
 */

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const MODEL         = 'claude-haiku-4-5-20251001'; // fast + affordable for chat
const MAX_TOKENS    = 512;
const MAX_HISTORY   = 10; // keep last N turns to limit token usage

const SYSTEM_PROMPT = `You are the AI assistant for Compliance365, an Australian cybersecurity compliance consultancy.

## About Compliance365
- Delivers ISO 27001, ISO 27701, ISO 42001, SOC 2, Essential Eight, NIST CSF, and DISP/ISM/IRAP
- 100% first-time certification pass rate
- Fixed-price, milestone-gated engagements — no platform licences required
- Works within Microsoft 365 (SharePoint, Entra ID, Intune, Defender, Purview)
- Based in Australia; serves Australian and Asia-Pacific clients
- Led by senior practitioners, not junior consultants

## Services and typical timelines
- ISO 27001:2022 — 8–16 weeks to certification (typically 12)
- ISO 27701 (privacy) — built on ISO 27001, adds 4–6 weeks
- ISO 42001 (AI governance) — 6–10 weeks standalone, or integrated
- SOC 2 Type I — 6–10 weeks; Type II requires 12-month observation period
- Essential Eight ML1–ML2 — 8–14 weeks; ML3 is 16–24+ weeks
- NIST CSF 2.0 — 8–16 weeks gap assessment and roadmap
- DISP / ISM / IRAP — 10–20 weeks depending on classification level

## Pricing signals (approximate, scope-dependent)
- ISO 27001: $25k–$130k
- Essential Eight: $22k–$120k
- SOC 2: $22k–$115k
- ISO 27701: $18k–$80k (on top of ISO 27001 base)
- ISO 42001: $20k–$90k

## Typical clients
- SaaS and technology companies needing enterprise sales credentials
- FinTech companies approaching Series A or regulated market entry
- Healthcare and HealthTech vendors processing clinical or patient data
- Queensland or federal government agencies (IS18, Essential Eight)
- Defence-adjacent companies needing DISP or IRAP assessment

## Your role
1. Help visitors identify which framework applies to their situation
2. Ask clarifying questions to understand sector, size, driver, and timeline
3. Give accurate, concise answers about compliance frameworks
4. When someone is clearly a good fit, encourage them to book a free 30-minute call
5. Never invent facts — if unsure, say so and suggest they book a call

## Booking
Direct visitors to book a free 30-minute call:
https://calendly.com/matt-nicholas-compliance365/30min

Keep responses concise (3–5 sentences where possible). This is a B2B audience — be direct and practical. Do not use excessive jargon without explaining it.`;

exports.handler = async (event) => {
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
    const userMessage = (body.message || '').trim().slice(0, 2000);
    const rawHistory  = Array.isArray(body.history) ? body.history : [];

    if (!userMessage) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'No message provided' }) };
    }

    // Sanitise history — keep last MAX_HISTORY turns, alternating user/assistant
    const history = rawHistory
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .map(m => ({ role: m.role, content: String(m.content).slice(0, 1000) }))
      .slice(-MAX_HISTORY);

    const messages = [...history, { role: 'user', content: userMessage }];

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');

    const res = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ model: MODEL, max_tokens: MAX_TOKENS, system: SYSTEM_PROMPT, messages }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error('Anthropic error:', err);
      throw new Error('Upstream API error');
    }

    const data = await res.json();
    const reply = data.content?.[0]?.text || "Sorry, I couldn't generate a response. Please try again.";

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ reply }),
    };
  } catch (err) {
    console.error('Chat handler error:', err);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Something went wrong. Please try again or contact us directly.' }),
    };
  }
};
