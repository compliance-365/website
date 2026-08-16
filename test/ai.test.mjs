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

describe('buildContext() — new sections for the user-facing AI features', () => {
  test('explain: checkDetail is included, other sections are not on its allow-list', () => {
    const ctx = CheckpointAI.buildContext('explain', {
      checkDetail: { area: 'Identity', label: 'MFA enforced', result: 'Fail', note: 'No CA policy found', relatedControls: [{ code: 'A.5.15', title: 'Access control' }] },
      risks: [{ id: 'R-1', title: 'should not appear', band: 'Low', status: 'Open' }]
    });
    assert.match(ctx.text, /MFA enforced/);
    assert.match(ctx.text, /A.5.15/);
    assert.doesNotMatch(ctx.text, /should not appear/);
  });

  test('mockAudit: gaps section formats unevidenced controls, failing checks and overdue actions, each truncated independently', () => {
    const many = Array.from({ length: CheckpointAI.MAX_LIST_ITEMS + 3 }, (_, i) => ({ code: 'A.' + i, title: 'control ' + i }));
    const ctx = CheckpointAI.buildContext('mockAudit', {
      gaps: { unevidencedControls: many, failingChecks: [{ label: 'MFA enforced' }], overdueActions: [{ id: 'ACT-1', title: 'Patch servers', dueDate: '2026-01-01' }] }
    });
    assert.match(ctx.text, /Implemented but unevidenced controls/);
    assert.match(ctx.text, /Failing posture checks/);
    assert.match(ctx.text, /Overdue actions/);
    assert.match(ctx.text, new RegExp('truncated to ' + CheckpointAI.MAX_LIST_ITEMS + ' of ' + many.length));
    assert.equal(ctx.truncated, true);
  });

  test('chat: auditFindings is on the allow-list and formats id/framework/status/summary', () => {
    const ctx = CheckpointAI.buildContext('chat', {
      auditFindings: [{ id: 'AUD-1', fw: 'ISO 27001', status: 'Completed', summary: 'Two minor NCs raised on access review.' }]
    });
    assert.match(ctx.text, /AUD-1/);
    assert.match(ctx.text, /minor NCs raised/);
  });

  test('policy/risk/report/evidence feature allow-lists are unchanged by the new sections', () => {
    assert.deepEqual(CheckpointAI.FEATURE_CONTEXT_ALLOW.policy, ['soaSummary', 'risks']);
    assert.deepEqual(CheckpointAI.FEATURE_CONTEXT_ALLOW.evidence, ['soaSummary']);
    assert.deepEqual(CheckpointAI.FEATURE_CONTEXT_ALLOW.risk, ['risks', 'scanSummary']);
    assert.deepEqual(CheckpointAI.FEATURE_CONTEXT_ALLOW.report, ['scanSummary', 'soaSummary', 'risks', 'actions']);
  });

  test('evidenceRequestSim: controlList is included, formatted as "code: title", and independently truncated', () => {
    const many = Array.from({ length: CheckpointAI.MAX_LIST_ITEMS + 4 }, (_, i) => ({ code: 'A.' + i, title: 'control ' + i }));
    const ctx = CheckpointAI.buildContext('evidenceRequestSim', { controlList: many });
    assert.match(ctx.text, /Applicable controls/);
    assert.match(ctx.text, /A\.0: control 0/);
    assert.match(ctx.text, new RegExp('truncated to ' + CheckpointAI.MAX_LIST_ITEMS + ' of ' + many.length));
    assert.equal(ctx.truncated, true);
  });

  test('evidenceRequestSim allow-list matches mockAudit plus controlList', () => {
    assert.deepEqual(
      CheckpointAI.FEATURE_CONTEXT_ALLOW.evidenceRequestSim,
      CheckpointAI.FEATURE_CONTEXT_ALLOW.mockAudit.concat(['controlList'])
    );
  });
});

describe('parseRiskDraft() — risk drafting parser', () => {
  test('parses a well-formed response into title/likelihood/impact/reasons/actions', () => {
    const text = 'TITLE: Unpatched internet-facing servers\nLIKELIHOOD: 4\nLIKELIHOOD_REASON: No patch cadence enforced.\nIMPACT: 5\nIMPACT_REASON: Could lead to full compromise.\nACTIONS:\n1. Apply latest security patches\n2. Establish monthly patch cadence\n3. Enable automated patch scanning';
    const draft = CheckpointAI.parseRiskDraft(text);
    assert.equal(draft.title, 'Unpatched internet-facing servers');
    assert.equal(draft.likelihood, 4);
    assert.equal(draft.impact, 5);
    assert.equal(draft.actions.length, 3);
    assert.equal(draft.actions[0], 'Apply latest security patches');
  });

  test('clamps out-of-range or non-numeric likelihood/impact to a safe default rather than throwing', () => {
    const draft = CheckpointAI.parseRiskDraft('TITLE: x\nLIKELIHOOD: 99\nIMPACT: not-a-number\nACTIONS:\n1. do a thing');
    assert.equal(draft.likelihood, 5); // clamped to the 1-5 max
    assert.equal(draft.impact, 3); // non-numeric falls back to the mid-scale default
  });

  test('never throws on a completely malformed response', () => {
    assert.doesNotThrow(() => CheckpointAI.parseRiskDraft('the model said something unexpected with no labels at all'));
    const draft = CheckpointAI.parseRiskDraft('garbage');
    assert.equal(draft.title, '');
    assert.deepEqual(draft.actions, []);
  });
});

describe('parsePolicyTailor() — policy tailoring parser', () => {
  const fallback = { purpose: 'orig purpose', scope: 'orig scope', policyStatements: ['orig 1', 'orig 2'] };

  test('parses tailored purpose/scope/statements', () => {
    const text = 'PURPOSE: Tailored purpose for Acme Corp.\nSCOPE: Applies to all Acme staff.\nSTATEMENTS:\n1. Statement one\n2. Statement two';
    const tailored = CheckpointAI.parsePolicyTailor(text, fallback);
    assert.equal(tailored.purpose, 'Tailored purpose for Acme Corp.');
    assert.equal(tailored.scope, 'Applies to all Acme staff.');
    assert.deepEqual(tailored.statements, ['Statement one', 'Statement two']);
  });

  test('falls back to the original template fields when the response is unparseable', () => {
    const tailored = CheckpointAI.parsePolicyTailor('unparseable nonsense', fallback);
    assert.equal(tailored.purpose, fallback.purpose);
    assert.equal(tailored.scope, fallback.scope);
    assert.deepEqual(tailored.statements, fallback.policyStatements);
  });
});

describe('parseQuestionnaireAnswers() — questionnaire assistant parser', () => {
  test('parses one Q/ANSWER/CONFIDENCE/VERIFY block per question, in order', () => {
    const questions = ['Do you enforce MFA?', 'Do you encrypt data at rest?'];
    const text = 'Q1: Do you enforce MFA?\nANSWER: Yes, for all privileged roles.\nCONFIDENCE: High\nVERIFY: Confirm coverage extends to all users.\n\nQ2: Do you encrypt data at rest?\nANSWER: Yes, via platform defaults.\nCONFIDENCE: Medium\nVERIFY: Check for any exceptions.';
    const answers = CheckpointAI.parseQuestionnaireAnswers(text, questions);
    assert.equal(answers.length, 2);
    assert.equal(answers[0].question, questions[0]);
    assert.equal(answers[0].confidence, 'High');
    assert.equal(answers[1].verify, 'Check for any exceptions.');
  });

  test('a malformed block for one question does not lose the others, and falls back to safe defaults', () => {
    const questions = ['Question one?', 'Question two?'];
    const text = 'Q1: Question one?\nANSWER: A real answer.\nCONFIDENCE: High\nVERIFY: Check X.\n\ngarbled nonsense with no labels';
    const answers = CheckpointAI.parseQuestionnaireAnswers(text, questions);
    assert.equal(answers.length, 2);
    assert.equal(answers[0].answer, 'A real answer.');
    assert.equal(answers[1].confidence, 'Low'); // safe default, never invented
    assert.match(answers[1].verify, /review the underlying register/i);
  });
});

describe('parseMockAuditQA() — mock auditor parser', () => {
  test('parses 10 Q/ANSWER/GAP blocks, flags gap:yes correctly', () => {
    const text = Array.from({ length: 10 }, (_, i) => 'Q' + (i + 1) + ': Sample question ' + (i + 1) + '\nANSWER: Sample answer ' + (i + 1) + '\nGAP: ' + (i % 2 === 0 ? 'yes' : 'no')).join('\n\n');
    const qa = CheckpointAI.parseMockAuditQA(text);
    assert.equal(qa.length, 10);
    assert.equal(qa[0].gapFlag, true);
    assert.equal(qa[1].gapFlag, false);
    assert.equal(qa[0].question, 'Sample question 1');
  });

  test('a response with fewer than 10 blocks still parses whatever is there, never throws', () => {
    const text = 'Q1: Only one question\nANSWER: Only one answer\nGAP: no';
    assert.doesNotThrow(() => CheckpointAI.parseMockAuditQA(text));
    assert.equal(CheckpointAI.parseMockAuditQA(text).length, 1);
  });
});

describe('buildEvidenceRequestPrompt() / parseEvidenceRequestList() — evidence request simulator', () => {
  test('the prompt names the framework and forbids inventing a control code', () => {
    const prompt = CheckpointAI.buildEvidenceRequestPrompt('ISO 27001');
    assert.match(prompt, /ISO 27001/);
    assert.match(prompt, /Never invent a control code/i);
    assert.match(prompt, /ITEM<n>/);
    assert.match(prompt, /CONTROL:/);
  });

  test('parses ITEM/CONTROL blocks in order', () => {
    const text = 'ITEM1: MFA enforcement policy export\nCONTROL: A.8.5\n\nITEM2: Backup restoration test log\nCONTROL: A.8.13\n\nITEM3: General induction training records\nCONTROL: General';
    const items = CheckpointAI.parseEvidenceRequestList(text);
    assert.equal(items.length, 3);
    assert.equal(items[0].item, 'MFA enforcement policy export');
    assert.equal(items[0].controlCode, 'A.8.5');
    assert.equal(items[2].controlCode, 'General');
  });

  test('a malformed block does not lose the others, and never throws', () => {
    const text = 'ITEM1: Real item\nCONTROL: A.1\n\ngarbled nonsense with no labels';
    assert.doesNotThrow(() => CheckpointAI.parseEvidenceRequestList(text));
    const items = CheckpointAI.parseEvidenceRequestList(text);
    assert.equal(items.length, 1);
    assert.equal(items[0].item, 'Real item');
  });

  test('a missing CONTROL line falls back to "General" rather than throwing or inventing a code', () => {
    const items = CheckpointAI.parseEvidenceRequestList('ITEM1: Item with no control line given at all');
    assert.equal(items.length, 1);
    assert.equal(items[0].controlCode, 'General');
  });
});

// Evidence interpretation — reads an artefact the client already holds
// (supplier SOC 2 report, pen test, backup job export) and proposes which
// of THIS tenant's controls it evidences. The parser matters more than
// most: app.js resolves every proposed code against the real register
// before rendering, so a mangled parse degrades to "nothing proposed"
// rather than to a wrong mapping — but a parse that silently drops the
// GAPS section would remove the one part of the output that argues
// against over-claiming coverage.
describe('buildEvidenceInterpretPrompt() / parseEvidenceInterpretation() — evidence interpretation', () => {
  const wellFormed = [
    'SUMMARY: A SOC 2 Type II report for Northwind Cloud Hosting covering the FY26 period.',
    'PERIOD: 1 July 2025 to 30 June 2026',
    'MAP1: A.5.19',
    'WHY: Section 3 documents the supplier\'s own access control testing with no exceptions.',
    'MAP2: A.8.16',
    'WHY: Continuous monitoring controls are described and tested in CC7.2.',
    '',
    'GAPS: Does not evidence your own internal access reviews, or any control operating inside your tenant.'
  ].join('\n');

  test('the prompt names the artefact and pins the model to the supplied control list', () => {
    const p = CheckpointAI.buildEvidenceInterpretPrompt('Northwind SOC 2', 'some report text');
    assert.match(p, /Northwind SOC 2/);
    assert.match(p, /some report text/);
    assert.match(p, /ONLY the control codes listed in the CONTEXT/);
    assert.match(p, /what a reader might wrongly assume it covers but it does not/i);
  });

  test('parses summary, period, every mapping and the gaps section', () => {
    const r = CheckpointAI.parseEvidenceInterpretation(wellFormed);
    assert.match(r.summary, /^A SOC 2 Type II report/);
    assert.equal(r.period, '1 July 2025 to 30 June 2026');
    assert.equal(r.mappings.length, 2);
    assert.deepEqual(r.mappings.map((m) => m.code), ['A.5.19', 'A.8.16']);
    assert.match(r.mappings[0].why, /access control testing/);
    assert.match(r.gaps, /internal access reviews/);
  });

  test('a response with no mappings still yields usable summary and gaps', () => {
    const r = CheckpointAI.parseEvidenceInterpretation('SUMMARY: An invoice.\nPERIOD: Not stated\nGAPS: Evidences nothing in your control set.');
    assert.equal(r.mappings.length, 0);
    assert.match(r.gaps, /Evidences nothing/);
  });

  test('missing period and gaps fall back to explicit wording, never blank', () => {
    const r = CheckpointAI.parseEvidenceInterpretation('SUMMARY: Something.\nMAP1: A.5.1\nWHY: Because.');
    assert.equal(r.period, 'Not stated');
    assert.equal(r.gaps, 'None identified');
  });

  test('garbage in does not throw and proposes nothing', () => {
    assert.doesNotThrow(() => CheckpointAI.parseEvidenceInterpretation('the model rambled without using the format at all'));
    const r = CheckpointAI.parseEvidenceInterpretation('the model rambled without using the format at all');
    assert.deepEqual(r.mappings, []);
    assert.equal(r.summary, '');
    assert.doesNotThrow(() => CheckpointAI.parseEvidenceInterpretation(''));
    assert.doesNotThrow(() => CheckpointAI.parseEvidenceInterpretation(null));
  });

  test('a MAP line with no code is dropped rather than proposing an empty control', () => {
    const r = CheckpointAI.parseEvidenceInterpretation('SUMMARY: x\nMAP1:\nWHY: nothing\nMAP2: A.5.1\nWHY: real');
    assert.deepEqual(r.mappings.map((m) => m.code), ['A.5.1']);
  });

  test('evidenceInterpret is context-restricted to the control list and SoA summary', () => {
    assert.deepEqual(CheckpointAI.FEATURE_CONTEXT_ALLOW.evidenceInterpret, ['controlList', 'soaSummary'],
      'an artefact-mapping question has no use for the risk or action registers, so they are never sent');
  });
});
