// ============================================================
// src/pages/api/chat.ts
// Backend API route for ComplianceBot AI chat agent
//
// SETUP:
//   1. Copy this file to src/pages/api/chat.ts in your Astro project
//   2. Add ANTHROPIC_API_KEY=sk-ant-... to your .env file
//   3. The frontend widget (in index.astro) POSTs to /api/chat
//
// This keeps your API key server-side — never exposed to the browser.
// ============================================================

import type { APIRoute } from 'astro';

export const POST: APIRoute = async ({ request }) => {
  // ── Validate API key ──────────────────────────────────────
  const apiKey = import.meta.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('ANTHROPIC_API_KEY is not set in environment variables');
    return new Response(
      JSON.stringify({ error: 'Server configuration error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // ── Parse request body ────────────────────────────────────
  let body: { system?: string; messages?: Array<{ role: string; content: string }> };
  try {
    body = await request.json();
  } catch {
    return new Response(
      JSON.stringify({ error: 'Invalid request body' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const { system, messages } = body;
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return new Response(
      JSON.stringify({ error: 'messages array is required' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // ── Validate message format (basic sanitisation) ──────────
  const sanitisedMessages = messages
    .filter(m => m.role && m.content && typeof m.content === 'string')
    .map(m => ({
      role: m.role === 'user' ? 'user' : 'assistant',
      content: m.content.trim().slice(0, 2000), // Hard cap per message
    }));

  if (sanitisedMessages.length === 0) {
    return new Response(
      JSON.stringify({ error: 'No valid messages provided' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // ── Call Anthropic API ────────────────────────────────────
  try {
    const anthropicResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001', // Fast + cheap — ideal for chat widgets
        max_tokens: 400,                     // Keeps replies concise
        system: system || 'You are a helpful compliance assistant for Compliance365.',
        messages: sanitisedMessages,
      }),
    });

    if (!anthropicResponse.ok) {
      const errorText = await anthropicResponse.text();
      console.error('Anthropic API error:', anthropicResponse.status, errorText);
      return new Response(
        JSON.stringify({ error: 'AI service error' }),
        { status: 502, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const data = await anthropicResponse.json();

    // ── Return the response ────────────────────────────────
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        // CORS — adjust origin if you have a separate frontend domain
        'Access-Control-Allow-Origin': '*',
      },
    });

  } catch (err) {
    console.error('Unexpected error calling Anthropic:', err);
    return new Response(
      JSON.stringify({ error: 'Unexpected server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};

// ── Handle OPTIONS preflight (CORS) ──────────────────────────
export const OPTIONS: APIRoute = () => {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
};
