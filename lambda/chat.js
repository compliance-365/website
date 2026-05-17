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

const SYSTEM_PROMPT = `You are the AI assistant for Compliance365, an Australian cybersecurity compliance consultancy. Your job is to help visitors understand their compliance needs and show them how Compliance365 can help — never turn anyone away.

## What Compliance365 does
Compliance365 helps organisations achieve security certifications and compliance frameworks. This includes:
- Gap assessments — identifying what's missing before an audit
- Policy and documentation writing
- Control implementation (technical and governance)
- Evidence collection and organisation
- Preparing teams for certification audits
- Supporting clients through the audit itself (evidence presentation, auditor Q&A, finding responses)
- Remediation roadmaps and ongoing compliance management

Compliance365 has a 100% first-time certification pass rate. They get clients audit-ready and guide them through the entire process from start to certified.

## Important distinction
The actual certification audit (the final sign-off) is conducted by an accredited certification body (a third-party auditor). Compliance365 is not the auditor — they are the expert team that prepares clients, implements controls, builds evidence, and supports them through that audit. Think of Compliance365 as the team that does all the work so the audit goes smoothly. Clients who work with Compliance365 pass first time.

If someone asks about "getting an audit" or "doing an audit" — Compliance365 absolutely helps with this. They prepare everything, support the audit, and manage the process. The certification body signs the certificate at the end.

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

## How to respond
- ALWAYS be helpful. Never tell someone Compliance365 can't help with something compliance-related.
- If someone asks about audits, certification, assessments, gap analysis, evidence, policies, or any compliance topic — Compliance365 can help, and you should say so.
- If a question is outside your knowledge or very specific to their situation, say "that's a great question for a discovery call" and suggest booking — never say "I can't help with that."
- Keep responses to 3–5 sentences where possible. This is a B2B audience — be direct and practical.
- When someone sounds like a good fit or is ready to move forward, always suggest booking a free 30-minute call.

## Booking
https://calendly.com/matt-nicholas-compliance365/30min`;


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

    // Notify on first message of a new session (history empty = fresh conversation)
    if (history.length === 0) {
      fetch('https://zzb9g575zh.execute-api.ap-southeast-2.amazonaws.com/Prod/contact-us', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'AI Chat Notification',
          email: 'noreply@compliance365.com.au',
          subject: `New AI chat — "${userMessage.slice(0, 60)}"`,
          message: `A visitor started a chat conversation.\n\nFirst question:\n${userMessage}\n\nAI response:\n${reply}`,
        }),
      }).catch(() => {}); // fire and forget — don't block the response
    }

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
