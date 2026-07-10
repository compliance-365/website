// Unit tests for public/checkpoint/ai.js — the AI assistant foundation.
// Covers the two things the task specifically calls out: buildContext()'s
// deterministic truncation, and the governance wrapper (chat()) — no
// tool/function calling ever sent, disclaimer always returned, audit
// callback invoked with {feature, deployment, timestamp} and never the
// prompt/response text, max-concurrency-1 serialisation, and 429 backoff.
// Never touches the network — every fetch is a local mock passed in via
// init()'s fetchImpl, same dependency-injection pattern the rest of this
// app's test suite uses for anything that would otherwise be a live call.
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import CheckpointAI from '../public/checkpoint/ai.js';

function fakeChatResponse(text) {
  return { ok: true, status: 200, headers: { get: () => null }, json: async () => ({ choices: [{ message: { content: text } }] }) };
}

beforeEach(() => { CheckpointAI._resetForTests(); });

describe('buildContext() — deterministic, allow-listed, size-bounded serialisation', () => {
  test('only includes sections on the given feature\'s allow-list', () => {
    const ctx = CheckpointAI.buildContext('evidence', {
      soaSummary: { implemented: 10, total: 20 },
      risks: [{ id: 'R-1', title: 'Unpatched servers', band: 'High', status: 'Open' }]
    });
    assert.match(ctx.text, /Statement of Applicability/);
    assert.doesNotMatch(ctx.text, /Open risks/);
    assert.doesNotMatch(ctx.text, /Unpatched servers/);
  });

  test('throws for an unknown feature — never silently includes everything', () => {
    assert.throws(() => CheckpointAI.buildContext('not_a_real_feature', {}), /Unknown AI feature/);
  });

  test('omits a section entirely when no data was supplied for it', () => {
    const ctx = CheckpointAI.buildContext('chat', { risks: [{ id: 'R-1', title: 'x', band: 'Low', status: 'Open' }] });
    assert.doesNotMatch(ctx.text, /scan summary/i);
    assert.match(ctx.text, /Open risks/);
  });

  test('list sections cap at MAX_LIST_ITEMS and note how many were dropped, keeping the FIRST N deterministically', () => {
    const risks = Array.from({ length: CheckpointAI.MAX_LIST_ITEMS + 15 }, (_, i) => ({ id: 'R-' + i, title: 'risk ' + i, band: 'Low', status: 'Open' }));
    const ctx1 = CheckpointAI.buildContext('risk', { risks });
    const ctx2 = CheckpointAI.buildContext('risk', { risks });
    assert.equal(ctx1.text, ctx2.text, 'same input must always truncate to the exact same output');
    assert.match(ctx1.text, new RegExp('truncated to ' + CheckpointAI.MAX_LIST_ITEMS + ' of ' + risks.length));
    assert.match(ctx1.text, /R-0:/, 'keeps the first item');
    assert.match(ctx1.text, new RegExp('R-' + (CheckpointAI.MAX_LIST_ITEMS - 1) + ':'), 'keeps the last item within the cap');
    assert.doesNotMatch(ctx1.text, new RegExp('R-' + CheckpointAI.MAX_LIST_ITEMS + ':'), 'drops the first item beyond the cap');
    assert.equal(ctx1.truncated, true);
  });

  test('drops a whole section that cannot fit at all, in CONTEXT_SECTION_ORDER, without consuming budget from sections after it', () => {
    // 'risks' alone is sized to blow the whole budget — it comes before
    // 'actions' in CONTEXT_SECTION_ORDER, so it must be the one omitted;
    // a small section AFTER it (actions) should still fit normally,
    // since an omitted section is skipped whole rather than partially
    // consuming the budget.
    const hugeRisks = Array.from({ length: CheckpointAI.MAX_LIST_ITEMS }, (_, i) => ({ id: 'R-' + i, title: 'x'.repeat(400), band: 'Low', status: 'Open' }));
    const ctx = CheckpointAI.buildContext('report', {
      scanSummary: { postureScore: 80 },
      soaSummary: { implemented: 5, total: 10 },
      risks: hugeRisks,
      actions: [{ id: 'A-1', title: 'Do the thing', dueDate: '2026-01-01', status: 'Open' }]
    });
    assert.equal(ctx.truncated, true);
    assert.deepEqual(ctx.omittedSections, ['risks'], 'the oversized section is the one omitted, named exactly');
    assert.doesNotMatch(ctx.text, /x{400}/, 'the omitted section\'s content never appears in the text at all');
    assert.match(ctx.text, /Do the thing/, 'a later, small section still gets included — omission is per-section, not "everything after the first miss"');
    assert.match(ctx.text, /truncated to fit a size budget/);
  });

  test('is pure — never mutates the dataBag it was given', () => {
    const risks = [{ id: 'R-1', title: 'x', band: 'Low', status: 'Open' }];
    const dataBag = { risks };
    const before = JSON.stringify(dataBag);
    CheckpointAI.buildContext('risk', dataBag);
    assert.equal(JSON.stringify(dataBag), before);
  });
});

describe('chat() — governance wrapper', () => {
  test('never sends a tools/functions/tool_choice field — text in, text out only', async () => {
    let sentBody = null;
    CheckpointAI.init({
      getToken: async () => 'tok',
      audit: () => {},
      getConfig: () => ({ endpoint: 'https://x.openai.azure.com', deployment: 'gpt', enabled: true }),
      fetchImpl: async (url, init) => { sentBody = JSON.parse(init.body); return fakeChatResponse('draft text'); }
    });
    await CheckpointAI.chat('chat', 'hello', {});
    assert.equal('tools' in sentBody, false);
    assert.equal('functions' in sentBody, false);
    assert.equal('tool_choice' in sentBody, false);
  });

  test('every response carries { text, disclaimer } — disclaimer is the fixed review-before-use label', async () => {
    CheckpointAI.init({
      getToken: async () => 'tok',
      audit: () => {},
      getConfig: () => ({ endpoint: 'https://x.openai.azure.com', deployment: 'gpt', enabled: true }),
      fetchImpl: async () => fakeChatResponse('some draft')
    });
    const res = await CheckpointAI.chat('chat', 'hello', {});
    assert.equal(res.text, 'some draft');
    assert.equal(res.disclaimer, CheckpointAI.DISCLAIMER);
    assert.match(res.disclaimer, /review before use/i);
  });

  test('the system prompt instructs grounding in context, admitting insufficient information, and never claiming certification outcomes', async () => {
    let sentBody = null;
    CheckpointAI.init({
      getToken: async () => 'tok',
      audit: () => {},
      getConfig: () => ({ endpoint: 'https://x.openai.azure.com', deployment: 'gpt', enabled: true }),
      fetchImpl: async (url, init) => { sentBody = JSON.parse(init.body); return fakeChatResponse('x'); }
    });
    await CheckpointAI.chat('chat', 'hello', {});
    const systemMsg = sentBody.messages.find((m) => m.role === 'system' && m.content === CheckpointAI.SYSTEM_PROMPT);
    assert.ok(systemMsg, 'the exact central system prompt is always the first system message');
    assert.match(CheckpointAI.SYSTEM_PROMPT, /don't have enough information/i);
    assert.match(CheckpointAI.SYSTEM_PROMPT, /never invent control references/i);
    assert.match(CheckpointAI.SYSTEM_PROMPT, /never state or imply/i);
    assert.match(CheckpointAI.SYSTEM_PROMPT, /certificat/i);
  });

  test('audit is called with {feature, deployment, timestamp} and never with prompt/response text', async () => {
    const auditCalls = [];
    CheckpointAI.init({
      getToken: async () => 'tok',
      audit: (evt) => auditCalls.push(evt),
      getConfig: () => ({ endpoint: 'https://x.openai.azure.com', deployment: 'my-deployment', enabled: true }),
      fetchImpl: async () => fakeChatResponse('a secret-shaped answer nobody should see in the audit log')
    });
    await CheckpointAI.chat('policy', 'a very specific prompt nobody should see in the audit log', {});
    assert.equal(auditCalls.length, 1);
    assert.equal(auditCalls[0].feature, 'policy');
    assert.equal(auditCalls[0].deployment, 'my-deployment');
    assert.ok(auditCalls[0].timestamp);
    const serialized = JSON.stringify(auditCalls[0]);
    assert.doesNotMatch(serialized, /a very specific prompt/);
    assert.doesNotMatch(serialized, /secret-shaped answer/);
  });

  test('audits failures too (not just successes), still without prompt/response text', async () => {
    const auditCalls = [];
    CheckpointAI.init({
      getToken: async () => 'tok',
      audit: (evt) => auditCalls.push(evt),
      getConfig: () => ({ endpoint: 'https://x.openai.azure.com', deployment: 'gpt', enabled: true }),
      fetchImpl: async () => ({ ok: false, status: 500, headers: { get: () => null }, json: async () => ({}) })
    });
    await assert.rejects(() => CheckpointAI.chat('chat', 'hello', {}));
    assert.equal(auditCalls.length, 1);
    assert.equal(auditCalls[0].outcome, 'http_500');
  });

  test('throws a typed not_configured error and makes no network call when aiEnabled/endpoint/deployment are missing', async () => {
    let fetchCalled = false;
    CheckpointAI.init({
      getToken: async () => 'tok',
      audit: () => {},
      getConfig: () => ({ endpoint: '', deployment: '', enabled: false }),
      fetchImpl: async () => { fetchCalled = true; return fakeChatResponse('x'); }
    });
    await assert.rejects(() => CheckpointAI.chat('chat', 'hello', {}), (e) => e.code === 'not_configured');
    assert.equal(fetchCalled, false);
  });

  test('classifies a 401/403 as auth_error, a 404 as not_found', async () => {
    async function statusToError(status) {
      CheckpointAI.init({
        getToken: async () => 'tok',
        audit: () => {},
        getConfig: () => ({ endpoint: 'https://x.openai.azure.com', deployment: 'gpt', enabled: true }),
        fetchImpl: async () => ({ ok: false, status, headers: { get: () => null }, json: async () => ({}) })
      });
      try { await CheckpointAI.chat('chat', 'hi', {}); return null; } catch (e) { return e.code; }
    }
    assert.equal(await statusToError(401), 'auth_error');
    assert.equal(await statusToError(403), 'auth_error');
    assert.equal(await statusToError(404), 'not_found');
  });

  test('max concurrency 1 — a second call does not start its request until the first has finished', async () => {
    const order = [];
    let resolveFirst;
    const firstGate = new Promise((r) => { resolveFirst = r; });
    CheckpointAI.init({
      getToken: async () => 'tok',
      audit: () => {},
      getConfig: () => ({ endpoint: 'https://x.openai.azure.com', deployment: 'gpt', enabled: true }),
      fetchImpl: async (url, init) => {
        const body = JSON.parse(init.body);
        const which = body.messages[body.messages.length - 1].content;
        order.push('start:' + which);
        if (which === 'first') await firstGate;
        order.push('end:' + which);
        return fakeChatResponse(which);
      }
    });
    const p1 = CheckpointAI.chat('chat', 'first', {});
    const p2 = CheckpointAI.chat('chat', 'second', {});
    // Give the microtask queue a beat — if concurrency were > 1, 'start:second'
    // would already be in `order` by now, before 'first' ever resolves.
    await new Promise((r) => setTimeout(r, 20));
    assert.deepEqual(order, ['start:first']);
    resolveFirst();
    await Promise.all([p1, p2]);
    assert.deepEqual(order, ['start:first', 'end:first', 'start:second', 'end:second']);
  });

  test('a rejected call does not jam the queue for the next call', async () => {
    let call = 0;
    CheckpointAI.init({
      getToken: async () => 'tok',
      audit: () => {},
      getConfig: () => ({ endpoint: 'https://x.openai.azure.com', deployment: 'gpt', enabled: true }),
      fetchImpl: async () => {
        call++;
        if (call === 1) return { ok: false, status: 500, headers: { get: () => null }, json: async () => ({}) };
        return fakeChatResponse('recovered');
      }
    });
    await assert.rejects(() => CheckpointAI.chat('chat', 'first', {}));
    const res = await CheckpointAI.chat('chat', 'second', {});
    assert.equal(res.text, 'recovered');
  });

  test('backs off and retries on 429, honouring Retry-After, then succeeds', async () => {
    const waits = [];
    const realSetTimeout = global.setTimeout;
    global.setTimeout = (fn, ms) => { waits.push(ms); return realSetTimeout(fn, 0); };
    try {
      let attempt = 0;
      CheckpointAI.init({
        getToken: async () => 'tok',
        audit: () => {},
        getConfig: () => ({ endpoint: 'https://x.openai.azure.com', deployment: 'gpt', enabled: true }),
        fetchImpl: async () => {
          attempt++;
          if (attempt === 1) return { ok: false, status: 429, headers: { get: (h) => (h === 'Retry-After' ? '2' : null) }, json: async () => ({}) };
          return fakeChatResponse('ok after retry');
        }
      });
      const res = await CheckpointAI.chat('chat', 'hi', {});
      assert.equal(res.text, 'ok after retry');
      assert.equal(attempt, 2);
      assert.equal(waits[0], 2000, 'honours the Retry-After header (seconds -> ms) over the default backoff');
    } finally { global.setTimeout = realSetTimeout; }
  });

  test('gives up after MAX_429_RETRIES and surfaces a rate_limited error', async () => {
    const realSetTimeout = global.setTimeout;
    global.setTimeout = (fn) => realSetTimeout(fn, 0);
    try {
      let attempt = 0;
      CheckpointAI.init({
        getToken: async () => 'tok',
        audit: () => {},
        getConfig: () => ({ endpoint: 'https://x.openai.azure.com', deployment: 'gpt', enabled: true }),
        fetchImpl: async () => { attempt++; return { ok: false, status: 429, headers: { get: () => null }, json: async () => ({}) }; }
      });
      await assert.rejects(() => CheckpointAI.chat('chat', 'hi', {}), (e) => e.code === 'rate_limited');
      assert.ok(attempt > 1, 'actually retried at least once before giving up');
    } finally { global.setTimeout = realSetTimeout; }
  });

  test('rejects an unknown feature before ever calling fetch', async () => {
    let fetchCalled = false;
    CheckpointAI.init({
      getToken: async () => 'tok',
      audit: () => {},
      getConfig: () => ({ endpoint: 'https://x.openai.azure.com', deployment: 'gpt', enabled: true }),
      fetchImpl: async () => { fetchCalled = true; return fakeChatResponse('x'); }
    });
    await assert.rejects(() => CheckpointAI.chat('not_a_feature', 'hi', {}));
    assert.equal(fetchCalled, false);
  });
});

describe('testConnection() — infrastructure probe, distinct from chat()', () => {
  test('returns not_configured without calling fetch when endpoint/deployment are missing', async () => {
    let fetchCalled = false;
    CheckpointAI.init({ getToken: async () => 'tok', audit: () => {}, getConfig: () => ({}), fetchImpl: async () => { fetchCalled = true; return fakeChatResponse('x'); } });
    const res = await CheckpointAI.testConnection({});
    assert.equal(res.ok, false);
    assert.equal(res.status, 'not_configured');
    assert.equal(fetchCalled, false);
  });

  test('never throws — a network failure resolves to {ok:false}', async () => {
    CheckpointAI.init({
      getToken: async () => 'tok',
      audit: () => {},
      getConfig: () => ({}),
      fetchImpl: async () => { throw new Error('DNS fail'); }
    });
    const res = await CheckpointAI.testConnection({ endpoint: 'https://x.openai.azure.com', deployment: 'gpt' });
    assert.equal(res.ok, false);
    assert.match(res.message, /DNS fail/);
  });

  test('does not go through the audit/rate-limit wrapper (no audit call from a test connection)', async () => {
    const auditCalls = [];
    CheckpointAI.init({
      getToken: async () => 'tok',
      audit: (evt) => auditCalls.push(evt),
      getConfig: () => ({}),
      fetchImpl: async () => fakeChatResponse('pong')
    });
    await CheckpointAI.testConnection({ endpoint: 'https://x.openai.azure.com', deployment: 'gpt' });
    assert.equal(auditCalls.length, 0);
  });
});
