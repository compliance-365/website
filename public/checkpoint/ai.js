/* ============================================================
   Checkpoint — AI assistant foundation
   ------------------------------------------------------------
   A thin client for a client tenant's OWN Azure OpenAI resource — chat
   completions only, Entra ID bearer auth (Graph.aiToken(),
   CONFIG.scopesAi = https://cognitiveservices.azure.com/.default).
   No API key is ever used, stored, or sent by this file; access is
   granted entirely through Entra RBAC (Cognitive Services OpenAI User)
   on the client's own resource — see AI-SETUP.md. Everything this file
   talks to lives in the client's own tenant; it introduces no new
   third-party data flow beyond what the client already configured.

   This is the ONLY place any AI feature is allowed to call the model.
   That's deliberate: every governance rail below (no tool/function
   calling, the review-before-use disclaimer, the central system
   prompt, audit logging, client-side rate limiting) is enforced HERE,
   once, so no individual feature (chat/policy/evidence/risk/report)
   can accidentally skip one by calling the API directly. Features only
   ever get a { text, disclaimer } back — never raw model output, never
   a way to make the model take an action.

   Exposed as window.CheckpointAI in the browser and via module.exports
   under Node for the test suite — same dual-mode pattern as lib.js.
   ============================================================ */
(function (factory) {
  var mod = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = mod;
  if (typeof window !== 'undefined') window.CheckpointAI = mod;
})(function () {

  /* ==========================================================
     Governance constants
     ========================================================== */

  /* Central system prompt — every chat() call prepends this, and only
     this; individual features cannot supply or override a system
     prompt. Deliberately instructs the model to (a) ground answers in
     the supplied CONTEXT block and say which register data it used,
     (b) admit insufficient information rather than invent control/risk
     references, and (c) never claim a certification/audit outcome —
     those are decided by accredited auditors, not this assistant. */
  var SYSTEM_PROMPT = [
    'You are the Checkpoint compliance assistant, helping a compliance practitioner draft or review compliance artefacts (policy language, evidence descriptions, risk treatment notes, report commentary).',
    'A CONTEXT block, drawn from this tenant\'s own compliance registers, is included with every message. Ground your answer in it and say which parts of it you used (e.g. "per Risk R-004", "per your ISO 27001 Statement of Applicability", "per the latest scan summary").',
    'If the CONTEXT block does not contain enough information to answer, say so plainly — for example "I don\'t have enough information in your current registers to answer that." Never invent control references, risk IDs, dates, or figures that are not present in the CONTEXT block.',
    'Never state or imply that a certification, accreditation, or audit has been achieved, passed, or is guaranteed. You may describe readiness, gaps and progress, but certification/audit outcomes are determined by accredited external auditors, never by this assistant.',
    'Every response you give is a draft for a human practitioner to review before use, not a final answer — write accordingly.'
  ].join(' ');

  /* Rendered verbatim next to every AI response in the UI — never
     omitted, never reworded per feature. */
  var DISCLAIMER = 'AI-assisted draft — review before use.';

  /* Per-feature allow-lists of which buildContext() sections may be
     included — enforced inside buildContext() itself, not left to each
     feature to remember. A feature asking for a section outside its
     own allow-list simply never sees that data, regardless of what its
     caller passes in dataBag. */
  var FEATURE_CONTEXT_ALLOW = {
    chat: ['scanSummary', 'soaSummary', 'risks', 'actions', 'calendar'],
    policy: ['soaSummary', 'risks'],
    evidence: ['soaSummary'],
    risk: ['risks', 'scanSummary'],
    report: ['scanSummary', 'soaSummary', 'risks', 'actions']
  };

  /* Fixed priority order sections are considered in when the character
     budget runs out — earlier sections are kept, later ones are the
     first to be dropped whole. Deliberately a plain constant (not
     derived from FEATURE_CONTEXT_ALLOW's own key order) so truncation
     behaviour never quietly changes if a feature's allow-list is
     reordered. */
  var CONTEXT_SECTION_ORDER = ['scanSummary', 'soaSummary', 'risks', 'actions', 'calendar'];
  var SECTION_LABELS = {
    scanSummary: 'Latest scan summary',
    soaSummary: 'Statement of Applicability summary',
    risks: 'Open risks',
    actions: 'Open actions',
    calendar: 'Upcoming calendar items'
  };

  /* ~4 characters/token is a standard rough estimate for English text;
     this is a plain character budget, not a real tokenizer — deliberately
     conservative (a real tokenizer would usually fit MORE than this into
     the same budget), so "token-bounded" here means "comfortably under
     budget", never "right at the edge and sometimes over". */
  var MAX_CONTEXT_CHARS = 6000;
  /* Cap per list-style section BEFORE the character budget is even
     considered, so one long list (say, 200 open risks) can't quietly
     consume the entire budget on its own — every other allowed section
     still gets a chance to appear. */
  var MAX_LIST_ITEMS = 20;

  function truncateNote(shown, total) { return '[truncated to ' + shown + ' of ' + total + ' item(s)]'; }

  function fmtScanSummary(d) {
    if (!d) return null;
    var lines = [];
    if (d.postureScore != null) lines.push('Posture score: ' + d.postureScore + '/100');
    if (d.lastScanDate) lines.push('Last scan date: ' + d.lastScanDate);
    if (d.criticalRisks != null) lines.push('High/critical risks open: ' + d.criticalRisks);
    if (d.readinessByFw && typeof d.readinessByFw === 'object') {
      Object.keys(d.readinessByFw).forEach(function (fw) { lines.push('Readiness (' + fw + '): ' + d.readinessByFw[fw] + '%'); });
    }
    return lines.length ? { text: lines.join('\n'), truncated: false } : null;
  }

  function fmtSoaSummary(d) {
    if (!d) return null;
    var lines = [];
    if (d.implemented != null && d.total != null) {
      var pct = d.total ? Math.round(d.implemented / d.total * 100) : 0;
      lines.push('Controls implemented: ' + d.implemented + '/' + d.total + ' (' + pct + '%)');
    }
    if (d.byFramework && typeof d.byFramework === 'object') {
      Object.keys(d.byFramework).forEach(function (fw) {
        var f = d.byFramework[fw] || {};
        lines.push(fw + ': ' + (f.implemented != null ? f.implemented : '?') + '/' + (f.total != null ? f.total : '?') + ' implemented');
      });
    }
    return lines.length ? { text: lines.join('\n'), truncated: false } : null;
  }

  /* Deterministic truncation: keep the FIRST MAX_LIST_ITEMS entries of
     whatever order the caller supplied (callers should pre-sort by
     whatever "most important first" means for that list — e.g. risk
     score descending) and note how many were dropped. Never samples,
     shuffles, or picks by any other rule — the same input always
     truncates to the same output. */
  function fmtListSection(items, formatRow) {
    if (!Array.isArray(items) || !items.length) return null;
    var capped = items.slice(0, MAX_LIST_ITEMS);
    var text = capped.map(formatRow).join('\n');
    if (capped.length < items.length) text += '\n' + truncateNote(capped.length, items.length);
    return { text: text, truncated: capped.length < items.length };
  }

  function formatSection(key, data) {
    if (key === 'scanSummary') return fmtScanSummary(data);
    if (key === 'soaSummary') return fmtSoaSummary(data);
    if (key === 'risks') return fmtListSection(data, function (r) {
      return '- ' + (r.id || '?') + ': ' + (r.title || r.name || '') + (r.band ? ' [' + r.band + ']' : '') + (r.status ? ' (' + r.status + ')' : '');
    });
    if (key === 'actions') return fmtListSection(data, function (a) {
      return '- ' + (a.id || '?') + ': ' + (a.title || '') + (a.dueDate ? ' due ' + a.dueDate : '') + (a.status ? ' (' + a.status + ')' : '');
    });
    if (key === 'calendar') return fmtListSection(data, function (c) {
      return '- ' + (c.title || '') + (c.dueDate ? ' — ' + c.dueDate : '');
    });
    return null;
  }

  /* Serialises the sections of `dataBag` this `feature` is allowed to
     see (FEATURE_CONTEXT_ALLOW) into one compact plain-text block,
     bounded to MAX_CONTEXT_CHARS. Sections are considered in
     CONTEXT_SECTION_ORDER; once a section wouldn't fit, it (and every
     section after it) is omitted WHOLE rather than cut mid-section —
     truncation always happens at a section boundary or a list-item
     boundary (fmtListSection), never mid-sentence. Every truncation,
     per-section or overall, is noted in the returned text itself, so
     the model (and anyone reading the raw context for review) can see
     that something was left out rather than silently getting a partial
     picture.
     dataBag is caller-assembled, already-shaped data (e.g. { risks: S.risks.map(...) }) —
     buildContext() never reaches into S/Store itself, so it stays
     testable with plain objects. */
  function buildContext(feature, dataBag) {
    dataBag = dataBag || {};
    var allow = FEATURE_CONTEXT_ALLOW[feature];
    if (!allow) throw new Error('Unknown AI feature "' + feature + '" — no context allow-list defined for it.');
    var blocks = [], omittedSections = [], truncatedAny = false, usedChars = 0;
    CONTEXT_SECTION_ORDER.forEach(function (key) {
      if (allow.indexOf(key) === -1) return; /* not on this feature's allow-list at all */
      var formatted = formatSection(key, dataBag[key]);
      if (!formatted) return; /* nothing supplied for this section this call */
      var block = SECTION_LABELS[key] + ':\n' + formatted.text;
      if (usedChars + block.length + 2 > MAX_CONTEXT_CHARS) {
        omittedSections.push(key);
        truncatedAny = true;
        return;
      }
      blocks.push(block);
      usedChars += block.length + 2;
      if (formatted.truncated) truncatedAny = true;
    });
    var text = blocks.join('\n\n');
    if (truncatedAny) {
      text += (text ? '\n\n' : '') + '[Note: this context was truncated to fit a size budget' +
        (omittedSections.length ? ' — the following section(s) were left out entirely: ' + omittedSections.join(', ') : '') +
        '. Some register data may not be reflected above.]';
    }
    return { text: text, truncated: truncatedAny, includedSections: blocks.length, omittedSections: omittedSections };
  }

  /* ==========================================================
     Governance-wrapped chat() — the single seam every AI feature
     calls through
     ========================================================== */

  var _state = null; /* { getToken, audit, getConfig, fetchImpl } — set by init() */
  var _queue = null; /* always-resolving promise chain — serialises calls to max concurrency 1 */

  function requireInit() {
    if (!_state) throw new Error('CheckpointAI.init() must be called before chat()/testConnection() — wire getToken/audit/getConfig once at app startup.');
  }

  /* opts.getToken() -> Promise<string>            — Graph.aiToken() in the browser
     opts.audit({feature, deployment, outcome, timestamp}) -> void  — wired to app.js's audit(), never given prompt/response text
     opts.getConfig() -> {endpoint, deployment, apiVersion, enabled} — read live from S.settings each call, so a Settings change takes effect without re-init
     opts.fetchImpl(url, init) -> Promise<Response>  — defaults to the global fetch; overridable for tests */
  function init(opts) {
    opts = opts || {};
    _state = {
      getToken: opts.getToken,
      audit: opts.audit,
      getConfig: opts.getConfig,
      fetchImpl: opts.fetchImpl || (typeof fetch !== 'undefined' ? fetch : null)
    };
    _queue = Promise.resolve();
  }

  function sleep(ms) { return new Promise(function (resolve) { setTimeout(resolve, ms); }); }

  function auditSafe(feature, deployment, outcome) {
    if (!_state || typeof _state.audit !== 'function') return;
    try { _state.audit({ feature: feature, deployment: deployment || '', outcome: outcome, timestamp: new Date().toISOString() }); }
    catch (e) { /* audit logging must never break an AI call */ }
  }

  /* One in-flight request at a time (the task's "max concurrent 1"),
     with a simple exponential backoff retry on 429 (rate-limited by
     the client's own Azure OpenAI resource, not by us) — up to
     MAX_429_RETRIES attempts, honouring a Retry-After header if the
     endpoint sends one. Every other non-2xx response is surfaced as a
     typed error (.code) so the caller can render the right "not
     configured" / "no access" / "endpoint not found" message rather
     than a raw HTTP failure. */
  var MAX_429_RETRIES = 3;
  var BASE_BACKOFF_MS = 1000;

  async function doChat(feature, userText, dataBag) {
    var cfg = (_state.getConfig && _state.getConfig()) || {};
    if (!cfg.enabled || !cfg.endpoint || !cfg.deployment) {
      var notConfigured = new Error('AI is not configured for this tenant.');
      notConfigured.code = 'not_configured';
      throw notConfigured;
    }
    var ctx = buildContext(feature, dataBag);
    var body = {
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'system', content: 'CONTEXT (this tenant\'s own compliance register data):\n' + (ctx.text || '(no context supplied)') },
        { role: 'user', content: String(userText || '') }
      ],
      temperature: 0.2,
      max_tokens: 800
      /* Deliberately NO `tools`/`functions`/`tool_choice` field, ever —
         text-in/text-out only. The AI never has Graph access and never
         causes a write; this is the enforcement point for that rule,
         not a per-feature convention. */
    };
    var url = String(cfg.endpoint).replace(/\/+$/, '') + '/openai/deployments/' + encodeURIComponent(cfg.deployment) +
      '/chat/completions?api-version=' + (cfg.apiVersion || '2024-08-01-preview');

    for (var attempt = 0; ; attempt++) {
      var token;
      try {
        token = await _state.getToken();
      } catch (e) {
        auditSafe(feature, cfg.deployment, 'token_error');
        var authErr = new Error('Could not sign in for AI access: ' + (e.message || e));
        authErr.code = 'auth_error';
        throw authErr;
      }
      var res;
      try {
        res = await _state.fetchImpl(url, {
          method: 'POST',
          headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
      } catch (netErr) {
        auditSafe(feature, cfg.deployment, 'network_error');
        var ne = new Error('Could not reach the AI endpoint: ' + (netErr.message || netErr));
        ne.code = 'network_error';
        throw ne;
      }
      if (res.status === 429 && attempt < MAX_429_RETRIES) {
        var retryAfterHeader = res.headers && res.headers.get && res.headers.get('Retry-After');
        var retryAfterSec = retryAfterHeader ? Number(retryAfterHeader) : 0;
        var waitMs = retryAfterSec > 0 ? retryAfterSec * 1000 : BASE_BACKOFF_MS * Math.pow(2, attempt);
        await sleep(waitMs);
        continue;
      }
      if (!res.ok) {
        auditSafe(feature, cfg.deployment, 'http_' + res.status);
        var httpErr = new Error('AI request failed (HTTP ' + res.status + ')');
        httpErr.status = res.status;
        httpErr.code = (res.status === 401 || res.status === 403) ? 'auth_error' : (res.status === 404 ? 'not_found' : (res.status === 429 ? 'rate_limited' : 'http_error'));
        throw httpErr;
      }
      var json = await res.json();
      var text = (json && json.choices && json.choices[0] && json.choices[0].message && json.choices[0].message.content) || '';
      auditSafe(feature, cfg.deployment, 'ok');
      return { text: text, disclaimer: DISCLAIMER, truncatedContext: ctx.truncated };
    }
  }

  /* Public entry point every AI feature calls. feature must be one of
     FEATURE_CONTEXT_ALLOW's keys. dataBag is the same caller-assembled
     shape buildContext() expects. Calls are serialised to one in-flight
     request at a time regardless of how many features call chat()
     concurrently — a second call simply waits for the first to finish
     (or fail) before its own request goes out. */
  function chat(feature, userText, dataBag) {
    requireInit();
    if (!FEATURE_CONTEXT_ALLOW.hasOwnProperty(feature)) {
      return Promise.reject(new Error('Unknown AI feature "' + feature + '".'));
    }
    var run = function () { return doChat(feature, userText, dataBag); };
    var result = _queue.then(run, run);
    _queue = result.then(function () {}, function () {}); /* queue itself must never stay rejected */
    return result;
  }

  /* Minimal connectivity probe — used by Settings/the wizard's "Enable
     AI" step to classify 401/403/404/network failures into a friendly
     status without going through chat()'s audit/rate-limit machinery
     (this is an infrastructure check, not assistant usage). Never
     throws; always resolves to a status object. */
  async function testConnection(cfg) {
    cfg = cfg || {};
    if (!cfg.endpoint || !cfg.deployment) {
      return { ok: false, status: 'not_configured', message: 'An endpoint URL and a deployment name are both required.' };
    }
    requireInit();
    var url = String(cfg.endpoint).replace(/\/+$/, '') + '/openai/deployments/' + encodeURIComponent(cfg.deployment) +
      '/chat/completions?api-version=' + (cfg.apiVersion || '2024-08-01-preview');
    try {
      var token = await _state.getToken();
      var res = await _state.fetchImpl(url, {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [{ role: 'user', content: 'ping' }], max_tokens: 5 })
      });
      if (res.ok) return { ok: true, status: 'available', message: 'Connected.' };
      if (res.status === 401 || res.status === 403) return { ok: false, status: 'noAccess', message: 'Signed in, but not authorised for this resource — check the Cognitive Services OpenAI User role assignment (see AI-SETUP.md).' };
      if (res.status === 404) return { ok: false, status: 'notFound', message: 'Endpoint or deployment name not found — double-check both against the Azure OpenAI resource.' };
      return { ok: false, status: 'error', message: 'AI endpoint responded with HTTP ' + res.status + '.' };
    } catch (e) {
      return { ok: false, status: 'error', message: e.message || String(e) };
    }
  }

  /* Test-only: drops wiring and resets the concurrency queue between
     test cases. Never called from app.js. */
  function _resetForTests() { _state = null; _queue = null; }

  return {
    SYSTEM_PROMPT: SYSTEM_PROMPT,
    DISCLAIMER: DISCLAIMER,
    FEATURE_CONTEXT_ALLOW: FEATURE_CONTEXT_ALLOW,
    CONTEXT_SECTION_ORDER: CONTEXT_SECTION_ORDER,
    MAX_CONTEXT_CHARS: MAX_CONTEXT_CHARS,
    MAX_LIST_ITEMS: MAX_LIST_ITEMS,
    buildContext: buildContext,
    init: init,
    chat: chat,
    testConnection: testConnection,
    _resetForTests: _resetForTests
  };
});
