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
    chat: ['scanSummary', 'soaSummary', 'risks', 'actions', 'calendar', 'auditFindings'],
    policy: ['soaSummary', 'risks'],
    evidence: ['soaSummary'],
    risk: ['risks', 'scanSummary'],
    report: ['scanSummary', 'soaSummary', 'risks', 'actions'],
    /* "Explain this finding" — a single posture check's own detail, plus
       enough scan context to place it. Never the whole register. */
    explain: ['checkDetail', 'scanSummary'],
    /* Questionnaire assistant — answers questionnaire questions from
       what's actually implemented/evidenced, plus posture, never raw
       risk/action detail (out of scope for "answer this questionnaire"). */
    questionnaire: ['soaSummary', 'scanSummary'],
    /* Mock auditor — deliberately sees the gap-shaped view of the
       register (unevidenced controls, failing checks, overdue actions)
       plus the same summaries every other feature can see. */
    mockAudit: ['soaSummary', 'scanSummary', 'risks', 'actions', 'gaps'],
    /* Evidence request simulator — same gap-shaped view as Mock Auditor,
       plus controlList (this tenant's own Implemented control codes for
       the selected framework). The model only ever proposes evidence
       items and points at a control CODE from that list; it never
       decides ready-vs-missing itself — the caller (app.js) looks that
       code up in the real register and classifies it deterministically.
       See buildEvidenceRequestPrompt()'s own comment below. */
    evidenceRequestSim: ['soaSummary', 'scanSummary', 'risks', 'actions', 'gaps', 'controlList']
  };

  /* Fixed priority order sections are considered in when the character
     budget runs out — earlier sections are kept, later ones are the
     first to be dropped whole. Deliberately a plain constant (not
     derived from FEATURE_CONTEXT_ALLOW's own key order) so truncation
     behaviour never quietly changes if a feature's allow-list is
     reordered. */
  var CONTEXT_SECTION_ORDER = ['scanSummary', 'soaSummary', 'risks', 'actions', 'calendar', 'auditFindings', 'checkDetail', 'gaps', 'controlList'];
  var SECTION_LABELS = {
    scanSummary: 'Latest scan summary',
    soaSummary: 'Statement of Applicability summary',
    risks: 'Open risks',
    actions: 'Open actions',
    calendar: 'Upcoming calendar items',
    auditFindings: 'Recent internal/external audits',
    checkDetail: 'Posture check detail',
    gaps: 'Current gaps (unevidenced controls, failing checks, overdue actions)',
    controlList: 'Applicable controls for the selected framework (code: title) — the ONLY control codes that may be referenced'
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

  function fmtCheckDetail(d) {
    if (!d) return null;
    var lines = [];
    if (d.area) lines.push('Area: ' + d.area);
    if (d.label) lines.push('Check: ' + d.label);
    if (d.result) lines.push('Result: ' + d.result);
    if (d.note) lines.push('Note: ' + d.note);
    if (Array.isArray(d.relatedControls) && d.relatedControls.length) {
      lines.push('Related controls: ' + d.relatedControls.map(function (c) { return c.code + (c.title ? ' (' + c.title + ')' : ''); }).join(', '));
    }
    return lines.length ? { text: lines.join('\n'), truncated: false } : null;
  }

  function fmtGaps(d) {
    if (!d) return null;
    var blocks = [];
    var uc = fmtListSection(d.unevidencedControls, function (c) { return '- ' + c.code + (c.title ? ': ' + c.title : ''); });
    if (uc) blocks.push('Implemented but unevidenced controls:\n' + uc.text);
    var fc = fmtListSection(d.failingChecks, function (c) { return '- ' + c.label; });
    if (fc) blocks.push('Failing posture checks:\n' + fc.text);
    var oa = fmtListSection(d.overdueActions, function (a) { return '- ' + (a.id || '?') + ': ' + (a.title || '') + (a.dueDate ? ' (due ' + a.dueDate + ')' : ''); });
    if (oa) blocks.push('Overdue actions:\n' + oa.text);
    if (!blocks.length) return null;
    var truncated = (uc && uc.truncated) || (fc && fc.truncated) || (oa && oa.truncated);
    return { text: blocks.join('\n\n'), truncated: !!truncated };
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
    if (key === 'auditFindings') return fmtListSection(data, function (a) {
      return '- ' + (a.id || '?') + ' (' + (a.fw || '') + ', ' + (a.status || '') + '): ' + (a.summary || a.scope || 'no summary recorded');
    });
    if (key === 'checkDetail') return fmtCheckDetail(data);
    if (key === 'gaps') return fmtGaps(data);
    if (key === 'controlList') return fmtListSection(data, function (c) { return '- ' + c.code + ': ' + c.title; });
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

  /* ==========================================================
     Prompt builders + parsers for the structured drafting features
     (risk drafting, policy tailoring, questionnaire assistant, mock
     auditor). chat() is still strictly one free-text response in,
     one free-text response out — these just ask the model, in the
     USER message (never the fixed system prompt), to shape that free
     text into a fixed, delimited layout, then parse it back out
     here. Parsing is always defensive: a model that doesn't follow
     the format exactly still returns whatever it can find rather than
     throwing, since this is advice a practitioner reviews before any
     of it is saved, not something that must parse perfectly to be
     safe. ========================================================== */

  function clampScore(n, fallback) {
    var v = parseInt(n, 10);
    if (isNaN(v)) return fallback;
    return Math.max(1, Math.min(5, v));
  }

  /* Pulls "LABEL: value" lines (case-insensitive label, rest-of-line
     value) into a plain object keyed by lower-cased label — the common
     first pass every parser below builds on. */
  function extractLabelledLines(text, labels) {
    var out = {};
    String(text || '').split('\n').forEach(function (line) {
      for (var i = 0; i < labels.length; i++) {
        var m = line.match(new RegExp('^\\s*' + labels[i] + '\\s*:\\s*(.*)$', 'i'));
        if (m) { out[labels[i].toLowerCase()] = m[1].trim(); return; }
      }
    });
    return out;
  }

  /* Numbered-list lines ("1. foo", "1) foo", "- foo") between two
     labelled markers, or to the end of the text if no end marker is
     found — used for ACTIONS:/STATEMENTS: blocks. */
  function extractNumberedList(text, afterLabel) {
    var lines = String(text || '').split('\n');
    var startIdx = -1;
    for (var i = 0; i < lines.length; i++) {
      if (new RegExp('^\\s*' + afterLabel + '\\s*:?\\s*$', 'i').test(lines[i])) { startIdx = i + 1; break; }
    }
    if (startIdx === -1) return [];
    var out = [];
    for (var j = startIdx; j < lines.length; j++) {
      var m = lines[j].match(/^\s*(?:\d+[.)]|-)\s*(.+)$/);
      if (m) out.push(m[1].trim());
      else if (lines[j].trim() === '') continue;
      else if (/^[A-Z_]+\s*:/.test(lines[j])) break; /* next labelled section starts */
    }
    return out.filter(Boolean);
  }

  function buildRiskDraftPrompt(findingDescription) {
    return 'Draft a risk register entry for the following finding, using only the CONTEXT provided:\n\n"' + findingDescription + '"\n\n' +
      'Respond in EXACTLY this format, nothing before or after it:\n' +
      'TITLE: <one-line risk statement>\n' +
      'LIKELIHOOD: <a single whole number, 1-5>\n' +
      'LIKELIHOOD_REASON: <one sentence>\n' +
      'IMPACT: <a single whole number, 1-5>\n' +
      'IMPACT_REASON: <one sentence>\n' +
      'ACTIONS:\n1. <treatment action>\n2. <treatment action>\n3. <treatment action>';
  }

  /* Never throws — a malformed/partial response still yields whatever
     could be parsed, with safe fallbacks (mid-scale L/I, no actions)
     rather than blocking the practitioner from at least seeing the
     title. The caller always still has to review/edit/save through
     the normal form. */
  function parseRiskDraft(text) {
    var f = extractLabelledLines(text, ['TITLE', 'LIKELIHOOD', 'LIKELIHOOD_REASON', 'IMPACT', 'IMPACT_REASON']);
    var actions = extractNumberedList(text, 'ACTIONS');
    return {
      title: f.title || '',
      likelihood: clampScore(f.likelihood, 3),
      likelihoodReason: f.likelihood_reason || '',
      impact: clampScore(f.impact, 3),
      impactReason: f.impact_reason || '',
      actions: actions.slice(0, 5)
    };
  }

  function buildPolicyTailorPrompt(template, clientContext) {
    return 'Tailor the following policy template for this organisation\'s specific context: "' + clientContext + '"\n\n' +
      'Original purpose: ' + template.purpose + '\n' +
      'Original scope: ' + template.scope + '\n' +
      'Original policy statements:\n' + template.policyStatements.map(function (s, i) { return (i + 1) + '. ' + s; }).join('\n') + '\n\n' +
      'Respond in EXACTLY this format, nothing before or after it:\n' +
      'PURPOSE: <tailored purpose, 2-4 sentences>\n' +
      'SCOPE: <tailored scope, 2-4 sentences>\n' +
      'STATEMENTS:\n1. <statement>\n2. <statement>\n(as many statements as appropriate)';
  }

  function parsePolicyTailor(text, fallbackTemplate) {
    var f = extractLabelledLines(text, ['PURPOSE', 'SCOPE']);
    var statements = extractNumberedList(text, 'STATEMENTS');
    return {
      purpose: f.purpose || fallbackTemplate.purpose,
      scope: f.scope || fallbackTemplate.scope,
      statements: statements.length ? statements : fallbackTemplate.policyStatements.slice()
    };
  }

  function buildQuestionnairePrompt(questions) {
    return 'Answer each of the following questionnaire questions using only the CONTEXT provided — if the context does not show evidence for something, say so rather than assuming it is in place.\n\n' +
      'Questions:\n' + questions.map(function (q, i) { return (i + 1) + '. ' + q; }).join('\n') + '\n\n' +
      'Respond in EXACTLY this format, repeated once per question, nothing before or after it:\n' +
      'Q<n>: <restate the question>\nANSWER: <answer>\nCONFIDENCE: High, Medium or Low\nVERIFY: <what a practitioner should verify before sending this answer>\n\n(one Q/ANSWER/CONFIDENCE/VERIFY block per question, in order)';
  }

  /* Splits on "Q<n>:" markers and parses each block independently, so
     one malformed block doesn't lose every other answer. Falls back to
     the original question text if a block's own restated question is
     missing/unparseable, and to 'Low'/blank for confidence/verify
     rather than guessing. */
  function parseQuestionnaireAnswers(text, questions) {
    var raw = String(text || '');
    var blocks = raw.split(/\n(?=\s*Q\d+\s*:)/i);
    var out = [];
    for (var i = 0; i < questions.length; i++) {
      var block = blocks[i] || blocks.find(function (b) { return new RegExp('^\\s*Q' + (i + 1) + '\\s*:', 'i').test(b); }) || '';
      var f = extractLabelledLines(block, ['Q' + (i + 1), 'ANSWER', 'CONFIDENCE', 'VERIFY']);
      out.push({
        question: questions[i],
        answer: f.answer || '(no answer parsed — see raw response)',
        confidence: /^(high|medium|low)$/i.test(f.confidence || '') ? f.confidence : 'Low',
        verify: f.verify || 'Review the underlying register/evidence before relying on this answer.'
      });
    }
    return out;
  }

  function buildMockAuditPrompt() {
    return 'Act as an external auditor preparing for an interview. Generate exactly 10 interview questions that specifically target this tenant\'s CURRENT gaps — unevidenced implemented controls, failing posture checks, and overdue actions shown in the CONTEXT — not generic questions. For each, give the model answer an auditee could honestly give based on the actual register state; where the honest answer reveals a gap, say so plainly rather than glossing over it.\n\n' +
      'Respond in EXACTLY this format, repeated once per question, nothing before or after it:\n' +
      'Q<n>: <interview question>\nANSWER: <honest model answer>\nGAP: yes or no\n\n(exactly 10 Q/ANSWER/GAP blocks)';
  }

  function parseMockAuditQA(text) {
    var raw = String(text || '');
    var blocks = raw.split(/\n(?=\s*Q\d+\s*:)/i).filter(function (b) { return /Q\d+\s*:/i.test(b); });
    return blocks.map(function (block, i) {
      var f = extractLabelledLines(block, ['Q' + (i + 1), 'ANSWER', 'GAP']);
      var qMatch = block.match(/^\s*Q\d+\s*:\s*(.*)$/im);
      return {
        question: (qMatch && qMatch[1].trim()) || ('Question ' + (i + 1)),
        answer: f.answer || '',
        gapFlag: /^y/i.test(f.gap || '')
      };
    });
  }

  /* Evidence request simulator — generates a Prepared-By-Client-style
     evidence request list. Deliberately asks the model for TWO things
     only: the evidence item itself, and which control CODE (from the
     controlList context section) it relates to — never whether the
     tenant already has that evidence. Ready-vs-missing is decided by
     the caller (app.js), by looking that exact code up in the real
     register, so a hallucinated "you already have this" claim is
     structurally impossible: an unrecognised or invented code simply
     fails the caller's lookup and renders as missing. */
  function buildEvidenceRequestPrompt(fwLabel) {
    return 'Act as an external auditor preparing a Prepared-By-Client (PBC) evidence request list for a ' + fwLabel + ' audit. ' +
      'Using ONLY the control codes listed in the CONTEXT\'s "Applicable controls" section, generate up to 15 realistic evidence items an auditor would ask to see — concrete artefacts or records (e.g. "MFA enforcement policy export", "Q2 access review sign-off", "backup restoration test log"), not a restatement of the control itself.\n\n' +
      'For each item, name the SINGLE control code from the CONTEXT list it most relates to. Never invent a control code that is not in that list — if no listed control fits, write "General" instead.\n\n' +
      'Respond in EXACTLY this format, repeated once per item, nothing before or after it:\n' +
      'ITEM<n>: <evidence item description>\nCONTROL: <control code from the CONTEXT list, or "General">\n\n(up to 15 ITEM/CONTROL blocks)';
  }

  function parseEvidenceRequestList(text) {
    var raw = String(text || '');
    var blocks = raw.split(/\n(?=\s*ITEM\d+\s*:)/i).filter(function (b) { return /ITEM\d+\s*:/i.test(b); });
    return blocks.map(function (block, i) {
      var f = extractLabelledLines(block, ['ITEM' + (i + 1), 'CONTROL']);
      var itemMatch = block.match(/^\s*ITEM\d+\s*:\s*(.*)$/im);
      return {
        item: (itemMatch && itemMatch[1].trim()) || ('Evidence item ' + (i + 1)),
        controlCode: (f.control || 'General').trim()
      };
    });
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
    buildRiskDraftPrompt: buildRiskDraftPrompt,
    parseRiskDraft: parseRiskDraft,
    buildPolicyTailorPrompt: buildPolicyTailorPrompt,
    parsePolicyTailor: parsePolicyTailor,
    buildQuestionnairePrompt: buildQuestionnairePrompt,
    parseQuestionnaireAnswers: parseQuestionnaireAnswers,
    buildMockAuditPrompt: buildMockAuditPrompt,
    parseMockAuditQA: parseMockAuditQA,
    buildEvidenceRequestPrompt: buildEvidenceRequestPrompt,
    parseEvidenceRequestList: parseEvidenceRequestList,
    _resetForTests: _resetForTests
  };
});
