function isValidEmail(s) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s); }

/* Keyboard focus trap for a dialog-like container (the modal box, the
   drawer) — called from each one's own keydown handler on Tab, so
   Tab/Shift+Tab cycle only through elements inside `container` rather
   than escaping into the page behind it, per WCAG 2.1 SC 2.1.2 (no
   keyboard trap OUT, but a dialog is expected to trap focus IN while
   open). Recomputes focusable elements on every call rather than
   caching them, since both callers rebuild their content via innerHTML
   on each open. */
function trapFocusKeydown(e, container) {
  if (e.key !== 'Tab') return;
  var focusables = container.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])');
  if (!focusables.length) { e.preventDefault(); return; }
  var first = focusables[0], last = focusables[focusables.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
}

/* Replaces every native prompt()/confirm() in this app with an in-app
   modal matching the drawer/toast styling, built with createElement +
   addEventListener only (never innerHTML or inline handlers) so no
   dynamic value passed through opts can execute as script. Declared here,
   outside the main App IIFE, so it can call it — a plain top-level
   function in a non-module script is visible to every scope declared
   after it in the same file. Two shapes:
     - Confirm-only (no `fields`): resolves true/false.
     - One or more `fields`: resolves an object keyed by field id, or
       null if cancelled — same "null means cancelled" contract
       window.prompt() had, so call sites barely change shape.
   opts: {
     title, message,
     fields: [{ id, label, type: 'text'|'textarea'|'email'|'date', value, placeholder }],
     confirmText, cancelText,
     validate: fn(values) -> error string | null
   } */
var _modalFieldIdSeq = 0;
function showModal(opts) {
  return new Promise(function (resolve) {
    var overlay = document.getElementById('modalOverlay');
    var box = document.getElementById('modalBox');
    var hasFields = !!(opts.fields && opts.fields.length);
    var returnFocus = document.activeElement;
    box.innerHTML = '';

    var titleId = 'modalTitle' + (++_modalFieldIdSeq);
    var h3 = document.createElement('h3');
    h3.id = titleId;
    h3.textContent = opts.title || '';
    box.appendChild(h3);
    box.setAttribute('aria-labelledby', titleId);
    box.removeAttribute('aria-describedby');

    if (opts.message) {
      var msgId = 'modalMsg' + _modalFieldIdSeq;
      var msg = document.createElement('p');
      msg.id = msgId;
      msg.className = 'm-msg';
      msg.textContent = opts.message;
      box.appendChild(msg);
      box.setAttribute('aria-describedby', msgId);
    }

    var inputs = {};
    (opts.fields || []).forEach(function (f) {
      var wrap = document.createElement('div');
      wrap.className = 'm-field';
      var fieldId = 'modalField' + (++_modalFieldIdSeq);
      var label = document.createElement('label');
      label.textContent = f.label;
      label.setAttribute('for', fieldId);
      wrap.appendChild(label);
      var el = document.createElement(f.type === 'textarea' ? 'textarea' : 'input');
      el.id = fieldId;
      if (f.type && f.type !== 'textarea') el.type = f.type === 'email' ? 'email' : f.type;
      el.value = f.value || '';
      if (f.placeholder) el.placeholder = f.placeholder;
      wrap.appendChild(el);
      box.appendChild(wrap);
      inputs[f.id] = el;
    });

    var errorEl = document.createElement('div');
    errorEl.className = 'm-error';
    errorEl.setAttribute('role', 'alert');
    box.appendChild(errorEl);

    var btnRow = document.createElement('div');
    btnRow.className = 'm-btns';
    var cancelBtn = document.createElement('button');
    cancelBtn.className = 'btn ghost sm';
    cancelBtn.textContent = opts.cancelText || 'Cancel';
    var confirmBtn = document.createElement('button');
    confirmBtn.className = 'btn sm';
    confirmBtn.textContent = opts.confirmText || 'OK';
    btnRow.appendChild(cancelBtn);
    btnRow.appendChild(confirmBtn);
    box.appendChild(btnRow);

    function close(result) {
      overlay.classList.remove('open');
      box.classList.remove('open');
      document.removeEventListener('keydown', onKey);
      if (returnFocus && document.body.contains(returnFocus)) returnFocus.focus();
      resolve(result);
    }
    function cancelResult() { return hasFields ? null : false; }
    function tryConfirm() {
      var values = {};
      Object.keys(inputs).forEach(function (id) { values[id] = inputs[id].value.trim(); });
      var err = opts.validate ? opts.validate(values) : null;
      if (err) { errorEl.textContent = err; errorEl.classList.add('show'); return; }
      close(hasFields ? values : true);
    }
    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); close(cancelResult()); return; }
      trapFocusKeydown(e, box);
      /* Enter on the Cancel button must cancel, not confirm — otherwise
         keyboard users who Tab to Cancel and press Enter get the exact
         opposite of what they asked for */
      if (e.key === 'Enter' && e.target === cancelBtn) { e.preventDefault(); close(cancelResult()); }
      else if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') { e.preventDefault(); tryConfirm(); }
    }
    cancelBtn.addEventListener('click', function () { close(cancelResult()); });
    confirmBtn.addEventListener('click', tryConfirm);
    document.addEventListener('keydown', onKey);

    overlay.classList.add('open');
    box.classList.add('open');
    var firstField = box.querySelector('input,textarea');
    if (firstField) { firstField.focus(); if (firstField.select) firstField.select(); }
    else confirmBtn.focus();
  });
}

/* ============================================================
   Checkpoint — application
   Views, rendering and actions. Data comes from window.Store
   (DemoStore or SpStore — same interface).
   ============================================================ */
(function () {
  var S = null;          /* in-memory state, loaded from Store */
  var Store = null;      /* active store */
  var CONFIG = window.CHECKPOINT_CONFIG;
  var W = null;          /* onboarding wizard state — in memory only, never persisted (see the "onboarding wizard" section near the bottom of this file); reset fresh every time Wizard.start()/startAt() runs */
  var CAP = null;        /* capability detection result (see detectAppCapabilities() below) — session-cached, never persisted, re-probed fresh on every page load */
  /* Two-role model — {readOnly, detected} from Graph.detectRole(), or a
     demo-mode stand-in (see detectAppReadOnly() below). readOnly:true
     disables/hides mutating UI (see MUTATING_ACTIONS/applyReadOnlyUi()
     near the bottom of this file) for a Viewer's session.
     SECURITY: this is UX only, never enforcement. The SharePoint list
     permissions set up per SETUP.md are what actually stop a Viewer
     from writing — this flag cannot grant or restrict anything by
     itself, it only decides which buttons this browser tab shows as
     clickable. Treat every render below as advisory, not a security
     boundary; if it's ever wrong (stale cache, a bug, a user editing
     the DOM directly), the worst case is a confusing button, not a
     data breach, because Store calls still hit SharePoint's own
     permission check underneath.
     READONLY itself is the single flag every gating mechanism reads
     (MUTATING_ACTIONS/applyReadOnlyUi/the delegated dispatch); it's
     recomputed by recomputeReadOnly() below from TWO independent
     sources — the Viewer role (VIEWER_READONLY) and an expired-past-
     grace activation (ENTITLEMENT_STATE.status === 'expired') — either
     one alone is enough to force it. READONLY_REASON exists purely so
     the UI (the role chip, banners) can explain WHICH of the two it
     is, without every render site re-deriving that itself. */
  var READONLY = null;
  var VIEWER_READONLY = null;
  /* Hidden diagnostics view (see renderSelfTest()) — demo-mode-only by
     design (the checks it runs are pure-logic and never touch a real
     tenant, but there's no reason to expose it outside demo, and
     several things gate on Store.kind === 'demo' being set first, so
     this is only ever computed true once bootUi() actually runs in
     demo mode). ?selftest=1, same query-flag convention as ?demo and
     ?role=viewer above. */
  var SELFTEST_MODE = false;
  var READONLY_REASON = null; /* 'viewer' | 'expired' | null */
  function recomputeReadOnly() {
    var expiredPastGrace = !!(ENTITLEMENT_STATE && ENTITLEMENT_STATE.status === 'expired');
    READONLY = !!(VIEWER_READONLY || expiredPastGrace);
    READONLY_REASON = VIEWER_READONLY ? 'viewer' : (expiredPastGrace ? 'expired' : null);
    updateRoleChip();
  }

  /* Kept separate from bootUi() so recomputeReadOnly() can refresh the
     chip at any point in a live session (e.g. right after
     App.applyEntitlementFile() changes READONLY) without needing to
     re-run the rest of bootUi()'s one-time boot sequence. A no-op
     before the app shell exists yet (getElementById returns null). */
  function updateRoleChip() {
    var roleChip = document.getElementById('roleChip');
    if (!roleChip) return;
    roleChip.style.display = READONLY ? 'inline-block' : 'none';
    roleChip.textContent = READONLY_REASON === 'expired' ? 'Activation expired — read only' : 'Viewer — read only';
  }

  /* Result of the last activation check this session (see
     reconcileEntitlementsOnLoad()/verifyActivationRaw() below) — null in
     demo mode or before this tenant has ever had a verified activation.
     Shape: { status: 'valid'|'grace'|'expired'|'mismatch', frameworks,
     expiry, issuedAt, tenantId, graceDays, graceUntil }. A valid Ed25519
     signature over a tenant-matched payload now gates the WHOLE app —
     provisioning (see store.js's assertActivationAuthorizesProvisioning())
     and, once expired past its grace window, ongoing write access (via
     READONLY above) — not just which framework toggles are on.
     S.entitlements (the Entitlements SharePoint list) remains the cache
     every framework-gating check in the rest of this app actually
     reads; this var explains WHY, and drives the two gates that read it
     directly (READONLY, and the provisioning flag on window). */
  var ENTITLEMENT_STATE = null;

  /* Licence type — 'client' | 'partner' | 'demo' (see lib.js's
     normalizeEntitlementType()/tools/ISSUANCE.md). A live tenant's
     type comes straight from ENTITLEMENT_STATE.type once a signed
     activation verifies; demo mode has no activation file at all, so
     it gets a SIMULATED type instead — 'client' by default (Portfolio/
     Partner Console hidden, matching what a licensed client actually
     sees), overridable for previewing the other two experiences via
     ?entType=partner|demo, or automatically 'partner' when the local-
     dev bypass is active (see isDevBypassActive() in lib.js and
     devflag.js) so a developer gets partner-only UI without needing to
     remember the query string every time. Never applies to a real
     (live) tenant — a real client's UI is always driven by their own
     actual verified activation, never a URL parameter. */
  function simulatedEntitlementType() {
    var qp = new URLSearchParams(location.search).get('entType');
    if (qp === 'partner' || qp === 'demo' || qp === 'client') return qp;
    if (window.CheckpointLib.isDevBypassActive(window.CHECKPOINT_DEV_BYPASS, location.hostname)) return 'partner';
    return 'client';
  }
  function currentEntitlementType() {
    if (ENTITLEMENT_STATE) return ENTITLEMENT_STATE.type;
    if (Store && Store.kind === 'demo') return simulatedEntitlementType();
    return 'client';
  }

  /* Which premium modules have had their content pack merged into
     window.FRAMEWORKS/GUIDANCE/NIST_SUBCATEGORIES/CHECK_E8 this page
     load — moduleId -> true. In-memory only (never localStorage): a
     fresh page load always re-fetches, re-verifies and re-decrypts
     packs from scratch, exactly like the Ed25519 activation check
     itself never trusts anything cached beyond the raw activation file
     text. Prevents mergeLicensedPacks() redoing the fetch/decrypt work
     every time it's called from more than one hook point in the same
     load (wizard activation step + provisioning; pre-load check +
     post-load reconcile). */
  var PACKS_MERGED = {};

  /* Templates: a failed / review check proposes this risk + actions.
     Nothing enters the register without practitioner approval. */
  var TPL = {
    'legacy': {
      risk: { title: 'Legacy authentication protocols allow credential-stuffing & MFA bypass', cat: 'Access', L: 5, I: 4, controls: ['A.8.5', 'A.5.15'] },
      actions: [{ t: 'Block legacy authentication via Conditional Access policy', pr: 'Critical', days: 14, control: 'A.8.5' }]
    },
    'wdac': {
      risk: { title: 'Unhardened endpoints permit untrusted code execution across the fleet', cat: 'Ops', L: 4, I: 4, controls: ['A.8.7', 'A.8.19'] },
      actions: [{ t: 'Deploy WDAC application control baseline via Intune', pr: 'High', days: 30, control: 'A.8.7' }, { t: 'Stand up pilot ring & exception process for app control', pr: 'Medium', days: 45, control: 'A.8.19' }]
    },
    'mfa-priv': {
      risk: { title: 'Privileged accounts protected by phishable MFA methods', cat: 'Access', L: 4, I: 5, controls: ['A.8.2', 'A.8.5'] },
      actions: [{ t: 'Enforce FIDO2/passkey sign-in for all privileged roles', pr: 'Critical', days: 21, control: 'A.8.2' }]
    },
    'admins': {
      risk: { title: 'Excess Global Administrator assignments widen the blast radius', cat: 'Access', L: 3, I: 5, controls: ['A.8.2'] },
      actions: [{ t: 'Reduce Global Admins to ≤4; move others to PIM-eligible roles', pr: 'High', days: 14, control: 'A.8.2' }]
    },
    'patch': {
      risk: { title: 'Patch latency leaves known vulnerabilities exploitable', cat: 'Ops', L: 4, I: 4, controls: ['A.8.8'] },
      actions: [{ t: 'Tighten Intune update rings to 7-day deferral with compliance gate', pr: 'High', days: 21, control: 'A.8.8' }]
    },
    'backup': {
      risk: { title: 'Backup coverage unverified for business-critical workloads', cat: 'Data', L: 3, I: 5, controls: ['A.8.13'] },
      actions: [{ t: 'Enable & verify M365 backup for Exchange/SharePoint/OneDrive', pr: 'High', days: 21, control: 'A.8.13' }]
    },
    'pim': {
      risk: { title: 'Privileged directory roles held as permanent assignments rather than time-bound, approved elevation', cat: 'Access', L: 3, I: 4, controls: ['A.8.2', 'A.5.18'] },
      actions: [{ t: 'Convert permanent privileged role assignments to PIM-eligible with approval workflow', pr: 'High', days: 30, control: 'A.8.2' }]
    },
    'riskyusers': {
      risk: { title: 'Risky sign-ins and risky user flags in Identity Protection are not being triaged', cat: 'Access', L: 4, I: 4, controls: ['A.5.25', 'A.5.26'] },
      actions: [{ t: 'Establish a weekly Identity Protection risky-user triage & remediation process', pr: 'High', days: 21, control: 'A.5.26' }]
    },
    'riskyapps': {
      risk: { title: 'Third-party OAuth app grants with high-privilege scopes have not been reviewed', cat: 'Supplier', L: 3, I: 4, controls: ['A.5.21', 'A.8.3'] },
      actions: [{ t: 'Review and revoke unnecessary high-privilege OAuth application consents', pr: 'Medium', days: 30, control: 'A.5.21' }]
    }
  };

  /* ================= helpers ================= */
  function daysFrom(n) { var d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); }

  /* Sentinel written to a control's VerifiedBy field when its
     evidenceUrl was filled by autoEvidenceCapture(), never by a human —
     lets the SoA distinguish "auto-captured" from "manually linked"
     without a new SharePoint column. setControlEvidence() clears it the
     moment a practitioner edits that control's evidence by hand. */
  var AUTO_EVIDENCE_TAG = 'Auto-capture (posture scan)';

  /* Trust Center / Auditor pack — both generate a fully self-contained
     standalone HTML file (no reference to this app's own CSS/JS/fonts:
     it's opened outside Checkpoint entirely, by people who may have no
     Checkpoint access at all, so it can depend on nothing but itself).
     System fonts only — there's no reliable way to self-host a webfont
     inside a single-file document without a data: URI bloating it. */
  function buildStandaloneHtml(opts) {
    return '<!DOCTYPE html><html><head><meta charset="utf-8"><title>' + opts.title + '</title><style>' +
      'body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;background:#FAF7F1;color:#0B0B0C;margin:0;padding:48px;max-width:820px;margin-left:auto;margin-right:auto;line-height:1.6;font-size:14px}' +
      'h1{font-size:30px;margin:0 0 6px;font-weight:700}' +
      'h2{font-size:19px;margin:32px 0 12px;font-weight:700;border-bottom:2px solid #0B0B0C;padding-bottom:8px}' +
      'p{color:#4b473e}a{color:#A9812E}' +
      (opts.extraCss || '') +
      '</style></head><body>' + opts.bodyHtml + '</body></html>';
  }
  var STANDALONE_CSS = '.tc-mast{border-bottom:2px solid #0B0B0C;padding-bottom:18px;margin-bottom:8px}' +
    '.tc-mast p{text-transform:uppercase;letter-spacing:.08em;font-size:11px;color:#6b675e;margin:4px 0 0}' +
    '.tc-grid{display:flex;flex-wrap:wrap;gap:14px;margin-top:14px}' +
    '.tc-card{border:1px solid rgba(11,11,12,.15);border-radius:6px;padding:16px 20px;min-width:180px}' +
    '.tc-card b{display:block;font-size:15px;margin-bottom:6px}.tc-card span{font-size:12px;color:#6b675e}' +
    '.tc-table{width:100%;border-collapse:collapse;margin-top:10px}' +
    '.tc-table th{text-align:left;font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:#6b675e;padding:8px;border-bottom:1px solid #0B0B0C}' +
    '.tc-table td{padding:10px 8px;border-bottom:1px solid rgba(11,11,12,.12);vertical-align:top}' +
    '.tc-src{font-size:11px;color:#6b675e;font-style:italic;margin-top:4px}' +
    '.tc-p{max-width:70ch}' +
    '.tc-foot{margin-top:40px;padding-top:16px;border-top:1px solid rgba(11,11,12,.2);font-size:11px;color:#8b877d}';

  /* Category pills shown in the SoA when the active framework's controls
     carry an optional `cat` field (currently only SOC 2, which spans
     Common Criteria plus the four optional Trust Services categories). */
  var SOA_CAT_LABELS = { CC: 'Common Criteria', A: 'Availability', C: 'Confidentiality', PI: 'Processing Integrity', P: 'Privacy' };

  var TRUST_CENTER_TOGGLES = [
    { key: 'trustCenterShowCerts', label: 'Certifications held', desc: 'List every framework currently entitled (ISO 27001, SOC 2, etc.) by name.' },
    { key: 'trustCenterShowSoaPct', label: 'SoA implementation %', desc: 'Show the % of applicable controls implemented per framework, alongside the certification list above.' },
    { key: 'trustCenterShowPosture', label: 'High-level posture summary', desc: 'A qualitative rating (Strong/Developing/Needs improvement) and whether continuous monitoring is enabled — never the raw numeric score.' },
    { key: 'trustCenterShowSubProcessors', label: 'Sub-processor list', desc: 'List only the vendors individually opted in below. Off by default — the most sensitive item on this page.' }
  ];

  /* Every App.xxx action name that writes tenant data (adds/edits a
     register row, toggles/sets a control or setting, verifies, uploads,
     sends email, approves/dismisses a finding, runs a scan). Checked
     against the bare name (the part after "App.") by
     isMutatingAction()/applyReadOnlyUi() below to disable the matching
     controls for a read-only (Viewer) session — see the READONLY
     comment above for why this is UX, not the security boundary.
     Deliberately an explicit list, not a naming-convention regex:
     several "toggleAdd*" actions (toggleAddAction, toggleAddAudit, …)
     only show/hide an add-panel and never write anything, so a
     prefix match on "toggle" would over-block harmless UI — see
     HIDE_ACTIONS below for how those panel-openers are handled instead.
     Kept in sync by hand; a stale/missing entry only ever means a
     button is visible that shouldn't be, never the reverse breaking
     something a Viewer needs — SharePoint's own permissions are the
     backstop either way. */
  var MUTATING_ACTIONS = new Set([
    'approve', 'dismiss', 'complete', 'addManualAction', 'setActionEvidence',
    'saveVendor', 'sendVendorQuestionnaire', 'markVendorReviewed', 'toggleVendorPublicListed',
    'saveAiSystem', 'advanceAiImpactStatus', 'addAiCandidate', 'dismissAiCandidate',
    'toggleApp', 'setSt', 'verifyControl', 'setControlEvidence', 'applySharedEvidence',
    'toggleTrustCenterSetting', 'saveTrustCenterSettings', 'generateTrustCenter',
    'generateAuditorPack', 'uploadDocument', 'generateTemplate', 'approveTemplate',
    'emailStatusUpdate', 'addAudit', 'completeAudit', 'recordReview',
    'addCalItem', 'completeCalItem', 'setRiskAppetite', 'setScanCadence',
    'toggleDigestEnabled', 'setDigestFrequency', 'saveDigestRecipients', 'sendDigestNow',
    'setDispTargetLevel', 'setNistDepth', 'setThreshold', 'toggleFeature',
    'toggleEntitlement', 'acknowledgeAlert', 'runScan', 'runScanFromDash', 'setE8TargetLevel',
    'confirmE8Suggestion', 'dismissE8Suggestion', 'reset', 'rerunSetup',
    'setReportClassification', 'uploadClientLogo', 'clearClientLogo',
    'partnerPromptAddClient', 'partnerRemoveClient', 'partnerSetClientStatus',
    'partnerEditClient', 'partnerPromptAddEntitlement', 'partnerSyncClient',
    'aiSaveConfig'
    /* 'report' itself is deliberately NOT in this set — generating a
       report is exactly the kind of thing a read-only Viewer (a board
       member, say) should still be able to do; the version-number
       increment/audit-log entry it writes are already best-effort
       (nextReportVersion() catches its own Store.setSetting failure),
       same reasoning as applyEntitlementFile's exemption above. */
    /* applyEntitlementFile is deliberately NOT in this set — one of the
       two ways READONLY becomes true is an expired-past-grace
       activation, and gating the one action that renews it here would
       create a permanent deadlock (expired -> read-only -> can't renew
       -> stays expired forever without a page reload/console hack).
       This doesn't weaken enforcement: a genuine Viewer's SharePoint
       Settings-list write still gets rejected by SharePoint itself in
       a real tenant (§5a's "detection, not enforcement" principle) — a
       Viewer clicking this button just gets a Store-level failure
       instead of a pre-emptive UI block, same as any other action a
       Viewer isn't actually permitted to write. */
  ]);

  /* Standalone "+ Add X" buttons whose only purpose is opening a form
     that leads to a MUTATING_ACTIONS submit — hidden entirely for a
     Viewer rather than left visible-but-dead-ended, since there's
     nothing useful behind them once the submit button is disabled. */
  var HIDE_ACTIONS = new Set([
    'toggleAddAction', 'toggleAddAudit', 'toggleAddReview', 'toggleAddCalItem',
    'toggleAddVendor', 'toggleAddAiSystem'
  ]);

  function isMutatingAction(path) {
    if (!path || path.indexOf('App.') !== 0) return false;
    return MUTATING_ACTIONS.has(path.slice(4));
  }

  /* Shared drawer open/close — every App.open*() detail view (risk,
     control guidance, vendor, AI system, audit, review, changelog)
     builds its own innerHTML then calls this instead of toggling
     .open/focus/keydown wiring itself: one focus trap (trapFocusKeydown,
     top of this file), one Escape-to-close, one "move focus in on open,
     restore it on close" implementation to keep in sync, rather than
     seven copies that could individually drift. `label` sets the
     drawer's accessible name (aria-label) per view, since its content
     is entirely dynamic. */
  var _drawerReturnFocus = null;
  var _drawerKeyHandler = null;
  function openDrawerUi(label) {
    var drawer = document.getElementById('drawer');
    var overlay = document.getElementById('overlay');
    drawer.setAttribute('aria-label', label || 'Details');
    drawer.classList.add('open');
    overlay.classList.add('open');
    _drawerReturnFocus = document.activeElement;
    if (_drawerKeyHandler) document.removeEventListener('keydown', _drawerKeyHandler);
    _drawerKeyHandler = function (e) {
      if (e.key === 'Escape') { e.preventDefault(); App.closeDrawer(); return; }
      trapFocusKeydown(e, drawer);
    };
    document.addEventListener('keydown', _drawerKeyHandler);
    var firstFocusable = drawer.querySelector('button,a[href],input,select,textarea');
    (firstFocusable || drawer).focus();
  }
  function closeDrawerUi() {
    var drawer = document.getElementById('drawer');
    var overlay = document.getElementById('overlay');
    drawer.classList.remove('open');
    overlay.classList.remove('open');
    if (_drawerKeyHandler) { document.removeEventListener('keydown', _drawerKeyHandler); _drawerKeyHandler = null; }
    if (_drawerReturnFocus && document.body.contains(_drawerReturnFocus)) _drawerReturnFocus.focus();
    _drawerReturnFocus = null;
  }

  /* Mobile-only off-canvas sidebar (<=860px — see index.html's own
     media query; .side is a permanent grid column above that width,
     so this toggle is simply never reachable there since .nav-toggle
     stays display:none). Same open/close shape as the record-detail
     drawer above — its own focus trap, its own Escape handler, its
     own return-focus-on-close — kept as a separate pair of functions
     rather than generalising the two into one, since a genuine third
     caller has never shown up and premature sharing would just add
     an indirection neither one needs yet. */
  var _navReturnFocus = null;
  var _navKeyHandler = null;
  function openNavUi() {
    var side = document.getElementById('appSide');
    var overlay = document.getElementById('navOverlay');
    var toggle = document.getElementById('navToggleBtn');
    side.classList.add('open');
    overlay.classList.add('open');
    if (toggle) toggle.setAttribute('aria-expanded', 'true');
    _navReturnFocus = document.activeElement;
    if (_navKeyHandler) document.removeEventListener('keydown', _navKeyHandler);
    _navKeyHandler = function (e) {
      if (e.key === 'Escape') { e.preventDefault(); App.closeNav(); return; }
      trapFocusKeydown(e, side);
    };
    document.addEventListener('keydown', _navKeyHandler);
    var closeBtn = document.getElementById('navCloseBtn');
    (closeBtn || side).focus();
  }
  function closeNavUi() {
    var side = document.getElementById('appSide');
    var overlay = document.getElementById('navOverlay');
    var toggle = document.getElementById('navToggleBtn');
    side.classList.remove('open');
    overlay.classList.remove('open');
    if (toggle) toggle.setAttribute('aria-expanded', 'false');
    if (_navKeyHandler) { document.removeEventListener('keydown', _navKeyHandler); _navKeyHandler = null; }
    if (_navReturnFocus && document.body.contains(_navReturnFocus)) _navReturnFocus.focus();
    _navReturnFocus = null;
  }

  /* Thin delegate to the shared, tested implementation in lib.js — see
     parseMapTokens() there for the token-shape rules. */
  function parseMapTokens(mapStr) {
    return window.CheckpointLib.parseMapTokens(mapStr);
  }

  /* ================= CSV / ZIP export =================
     One entry per register a client might want a flat-file copy of —
     the "you keep your data" half of the offboarding story (SETUP.md).
     Column lists mirror what's actually shown in that register's own
     table, not raw SharePoint field names, so the export reads the same
     way the UI does. `rows()` always reads straight from S (never the
     filtered/sorted DOM), so an export is never missing a record just
     because a filter pill happens to be active when the button is
     clicked. Exporting never mutates a register and needs no
     SharePoint write of its own beyond the audit-log entry each export
     records — Viewers can use every button here exactly like a
     Practitioner (this file's MUTATING_ACTIONS deliberately excludes
     exportCsv/exportAllZip; see the READONLY comment near the top of
     this file). */
  var EXPORT_REGISTERS = [
    {
      key: 'risks', label: 'Risks', filename: 'risks.csv',
      header: ['ID', 'Risk', 'Category', 'Source', 'Inherent score', 'Inherent band', 'Residual score', 'Residual band', 'Owner', 'Status'],
      rows: function () {
        return S.risks.map(function (r) {
          var q = residual(r);
          return [r.id, r.title, r.cat, r.src, r.L * r.I, band(r.L * r.I), q.L * q.I, band(q.L * q.I), r.owner, r.status];
        });
      }
    },
    {
      key: 'actions', label: 'Actions', filename: 'actions.csv',
      header: ['ID', 'Title', 'Type', 'Risk', 'Control', 'Priority', 'Owner', 'Due', 'Status', 'Evidence URL'],
      rows: function () {
        return S.actions.map(function (a) { return [a.id, a.title, a.type || 'Action', a.risk, a.control, a.pr, a.owner, a.due, a.status, a.evidenceUrl]; });
      }
    },
    {
      key: 'controls', label: 'Controls (SoA)', filename: 'controls.csv',
      header: ['Framework', 'Control ID', 'Title', 'Applicable', 'Status', 'Also satisfies', 'Owner', 'Verified date', 'Verified by', 'Evidence URL', 'Justification'],
      rows: function () {
        return S.controls.map(function (c) {
          return [fwName(c.fw), c.id, c.t, c.app ? 'Yes' : 'No', c.app ? c.st : 'N/A', c.map, c.own, c.verified, c.verifiedBy, c.evidenceUrl, c.just];
        });
      }
    },
    {
      key: 'audits', label: 'Internal audits', filename: 'audits.csv',
      header: ['ID', 'Framework', 'Scope', 'Auditor', 'Planned date', 'Completed date', 'Status'],
      rows: function () {
        return (S.audits || []).map(function (a) { return [a.id, fwName(a.fw), a.scope, a.auditor, a.planned, a.completed, a.status]; });
      }
    },
    {
      key: 'reviews', label: 'Management reviews', filename: 'reviews.csv',
      header: ['ID', 'Date', 'Attendees', 'Next due', 'Inputs', 'Decisions'],
      rows: function () {
        return (S.reviews || []).map(function (r) { return [r.id, r.date, r.attendees, r.nextDue, r.inputs, r.decisions]; });
      }
    },
    {
      key: 'calendar', label: 'Compliance calendar', filename: 'calendar.csv',
      header: ['ID', 'Activity', 'Category', 'Frequency', 'Owner', 'Next due', 'Last completed', 'Status', 'Notes'],
      rows: function () {
        return (S.calendar || []).map(function (c) { return [c.id, c.title, c.category, c.freq, c.owner, c.nextDue, c.lastCompleted, c.status, c.notes]; });
      }
    },
    {
      key: 'auditlog', label: 'Audit log', filename: 'audit-log.csv',
      header: ['When', 'Actor', 'Action', 'Target type', 'Target ID', 'Before', 'After'],
      rows: function () {
        return (S.auditLog || []).map(function (e) { return [e.entryDateTime, e.actor, e.action, e.targetType, e.targetId, e.before, e.after]; });
      }
    },
    {
      key: 'vendors', label: 'Vendors', filename: 'vendors.csv',
      header: ['ID', 'Name', 'Service', 'Data categories', 'Criticality', 'Review status', 'Next review due', 'Certifications', 'Owner', 'Questionnaire status'],
      rows: function () {
        return (S.vendors || []).map(function (v) {
          return [v.id, v.name, v.service, (v.dataCategories || []).join('; '), v.criticality, v.reviewStatus, v.nextReviewDue, v.certifications, v.owner, v.questionnaireStatus];
        });
      }
    }
  ];

  /* U+FEFF (UTF-8 BOM) so Excel — which otherwise guesses the wrong
     encoding for anything outside plain ASCII — opens the file as
     UTF-8 instead of Windows-1252, the one real interoperability gotcha
     for a CSV built entirely client-side. Every other spreadsheet app
     either ignores the BOM or also wants it, so it's added
     unconditionally rather than sniffed per file. */
  function downloadTextFile(filename, mimeType, content) {
    var blob = new Blob(['﻿' + content], { type: mimeType });
    downloadBlob(filename, blob);
  }
  function downloadBlob(filename, blob) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  /* Every control a given posture check's evidence satisfies: its
     canonical ISO 27001 control(s) from CHECK_CONTROLS, plus — for
     every OTHER framework the client actually has entitled — whatever
     control that ISO 27001 control's own cross-mapping resolves to
     exactly. Never invents a mapping; a token that doesn't resolve to a
     real control row in an entitled framework is silently skipped. */
  function controlsForCheck(checkId) {
    var codes = (window.CHECK_CONTROLS && window.CHECK_CONTROLS[checkId]) || [];
    var out = [];
    codes.forEach(function (code) {
      if (!S.entitlements.iso27001) return;
      var iso = S.controls.find(function (c) { return c.fw === 'iso27001' && c.id === code; });
      if (!iso) return;
      out.push(iso);
      parseMapTokens(iso.map).forEach(function (ref) {
        if (!S.entitlements[ref.fw]) return;
        var match = S.controls.find(function (c) { return c.fw === ref.fw && c.id === ref.code; });
        if (match) out.push(match);
      });
    });
    var seen = {};
    return out.filter(function (c) {
      var k = c.fw + '|' + c.id;
      if (seen[k]) return false;
      seen[k] = true;
      return true;
    });
  }

  /* Every control across every ENTITLED framework that shares the same
     real-world evidence as `start` — the Shared evidence view's engine.
     Unlike controlsForCheck() (a fixed check -> canonical-control lookup),
     this walks the cross-mapping graph from an arbitrary starting
     control in both directions: forward (start's own "Also satisfies"
     map field) and backward (any other control whose map field points
     at start) — the seed data isn't consistently bidirectional (e.g.
     ISO 27001 A.5.15 maps to SOC2 CC6.1, but CC6.1's own map field also
     reaches Essential Eight E8.7 and NIST PR.AA that A.5.15's map field
     never mentions directly), so a one-hop lookup would under-report
     real matches. Breadth-first over a small (~250-control) graph, so a
     plain queue is more than fast enough. */
  function sharedEvidenceClosure(start) {
    var key = function (c) { return c.fw + '|' + c.id; };
    var visited = {};
    visited[key(start)] = true;
    var queue = [start], result = [start];
    while (queue.length) {
      var cur = queue.shift();
      parseMapTokens(cur.map).forEach(function (ref) {
        if (!S.entitlements[ref.fw]) return;
        var m = S.controls.find(function (c) { return c.fw === ref.fw && c.id === ref.code; });
        if (m && !visited[key(m)]) { visited[key(m)] = true; result.push(m); queue.push(m); }
      });
      S.controls.forEach(function (other) {
        if (!S.entitlements[other.fw] || visited[key(other)]) return;
        var pointsToCur = parseMapTokens(other.map).some(function (e) { return e.fw === cur.fw && e.code === cur.id; });
        if (pointsToCur) { visited[key(other)] = true; result.push(other); queue.push(other); }
      });
    }
    return result;
  }

  /* Turns each Graph-backed check's raw signal (graph.js's
     runPostureChecks returns one per check id, see its own comment) into
     a dated, hashed evidence file in the Documents library, and — only
     where a mapped control has no evidence link at all yet — fills it
     in and tags it auto-captured. Never blocks or fails the scan itself:
     every failure here is caught and logged, not surfaced to the user
     as a scan failure, same philosophy as audit()/log(). */
  async function captureAutoEvidence(raw, today) {
    if (!raw || Store.kind !== 'sharepoint') return;
    var ids = Object.keys(raw);
    for (var i = 0; i < ids.length; i++) {
      var id = ids[i];
      try {
        var def = window.CHECK_DEFS.find(function (c) { return c.id === id; });
        var content = {
          checkId: id,
          label: def ? def.label : id,
          generatedAt: new Date().toISOString(),
          result: S.lastResults ? S.lastResults[id] : undefined,
          note: S.lastNotes ? S.lastNotes[id] : undefined,
          data: raw[id]
        };
        var json = JSON.stringify(content, null, 2);
        var filename = id + '-' + today + '.json';
        var file = new File([json], filename, { type: 'application/json' });
        var uploaded = await Store.uploadDocument(file, 'Auto-evidence');

        var hashBuf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(json));
        var hashHex = Array.prototype.map.call(new Uint8Array(hashBuf), function (b) { return b.toString(16).padStart(2, '0'); }).join('');
        audit('Auto-evidence captured', 'Document', filename, '', 'sha256:' + hashHex);

        var targets = controlsForCheck(id);
        for (var j = 0; j < targets.length; j++) {
          var c = targets[j];
          if (c.evidenceUrl) continue; /* never overwrite — manual link or an earlier auto-capture, either way it stays */
          c.evidenceUrl = uploaded.url;
          c.verifiedBy = AUTO_EVIDENCE_TAG;
          c.verified = today;
          try { await Store.updateControl(c); } catch (e2) { warn(e2); }
        }
      } catch (e) {
        console.error('Auto-evidence capture failed for ' + id + ':', e);
      }
    }
  }

  /* AI Governance discovery — only called while iso42001 is entitled.
     Reuses the OAuth grants the riskyapps posture check already fetched
     this scan (no duplicate Graph call for that part); the only new
     call is Graph.discoverAiSystems' own /servicePrincipals lookup. A
     candidate already present in the register (matched by spId) or
     already dismissed this session is never re-surfaced. High-privilege
     grants get a real risk proposed via the same TPL/S.proposed pipeline
     every posture-scan finding uses — no separate approval UI needed. */
  async function discoverAiSystemsFromScan(raw) {
    var grants = (raw && raw.riskyapps && raw.riskyapps.oauthGrants) || [];
    var candidates = await Graph.discoverAiSystems(grants);
    var known = {};
    (S.aiSystems || []).forEach(function (a) { if (a.spId) known[a.spId] = true; });
    var dismissed = window._aiDismissedThisSession || {};
    S.aiCandidates = candidates.filter(function (c) { return !known[c.id] && !dismissed[c.id]; });

    S.aiCandidates.forEach(function (c) {
      if (!c.highPrivilegeScopes.length) return;
      var tplKey = 'ai-risk-' + c.id;
      TPL[tplKey] = {
        risk: {
          title: 'High-privilege OAuth grant to AI application "' + c.name + '" not yet reviewed',
          cat: 'AI Governance', L: 3, I: 4, controls: ['A.9.2', 'A.5.19']
        },
        actions: [{ t: 'Review and, if appropriate, revoke high-privilege consent for ' + c.name, pr: 'High', days: 21, control: 'A.9.2' }]
      };
      if (S.handledTpl.indexOf(tplKey) === -1 && S.proposed.indexOf(tplKey) === -1) S.proposed.push(tplKey);
    });
  }

  /* band/residual/checkResult/score are thin wrappers around
     public/checkpoint/lib.js's pure implementations — same names/
     signatures every call site in this file already uses, just no
     longer duplicating the logic itself. See lib.js for the actual
     rules and the reasoning behind them; see test/lib.test.mjs for
     coverage. Supplying S/Store as context here, not inside lib.js, is
     what keeps lib.js itself dependency-free and unit-testable. */
  function band(sc) { return window.CheckpointLib.band(sc); }
  function risk(id) { return S.risks.find(function (r) { return r.id === id; }); }
  function residual(r) { return window.CheckpointLib.residual(r, S.actions); }
  function checkResult(c) {
    return window.CheckpointLib.checkResult(c, { lastResults: S.lastResults, isDemo: Store.kind === 'demo', risks: S.risks, actions: S.actions });
  }
  function score() {
    return window.CheckpointLib.score(window.CHECK_DEFS, null, checkResult);
  }
  /* 'ML1'|'ML2'|'ML3' -> 1|2|3, defaulting to ML2 for any unrecognised value. */
  function e8Lvl(s) { var n = parseInt(String(s || '').replace(/\D/g, ''), 10); return (n >= 1 && n <= 3) ? n : 2; }
  function toast(msg) {
    var t = document.getElementById('toast'); t.innerHTML = msg; t.classList.add('show');
    clearTimeout(t._h); t._h = setTimeout(function () { t.classList.remove('show'); }, 3400);
  }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
  /* evidence links render as real <a href> — reject javascript: and other
     non-http(s) schemes so a pasted link can never become an XSS vector */
  function isSafeUrl(u) { return /^https?:\/\//i.test(u); }
  function fmtDate(d) { if (!d) return '—'; return new Date(d + 'T00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }); }
  function overdue(a) { return a.status !== 'Done' && a.due && a.due < new Date().toISOString().slice(0, 10); }

  /* Opens a print-preview popup for any fully-built, self-contained HTML
     document (reports, and generated policy templates) — same sandboxed-
     iframe pattern either way: no allow-scripts, so no script the HTML
     might contain can ever run; the print button lives outside the frame,
     wired with addEventListener, so it works regardless. Returns the
     popup window, or null (after toasting) if the popup was blocked. */
  function printPreview(title, fullHtml) {
    var w = window.open('', '_blank');
    if (!w) { toast('Popup blocked — allow pop-ups for this site to preview and print.'); return null; }
    w.document.title = title;
    var wbody = w.document.body;
    wbody.style.margin = '0';
    wbody.style.background = '#FAF7F1';

    var bar = w.document.createElement('div');
    bar.style.cssText = 'position:sticky;top:0;display:flex;justify-content:flex-end;padding:14px 24px;background:#FAF7F1;border-bottom:1px solid rgba(11,11,12,.15);z-index:10';
    var printBtn = w.document.createElement('button');
    printBtn.textContent = 'PRINT / SAVE AS PDF';
    printBtn.style.cssText = 'background:#A9812E;color:#fff;border:none;padding:12px 24px;border-radius:3px;font-family:Manrope,sans-serif;font-size:11px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;cursor:pointer';
    bar.appendChild(printBtn);
    wbody.appendChild(bar);

    var iframe = w.document.createElement('iframe');
    iframe.setAttribute('sandbox', 'allow-same-origin allow-modals');
    iframe.style.cssText = 'width:100%;border:none;display:block';
    wbody.appendChild(iframe);
    iframe.srcdoc = fullHtml;

    printBtn.addEventListener('click', function () {
      try { iframe.contentWindow.focus(); iframe.contentWindow.print(); } catch (e) { /* pop-up/frame torn down already */ }
    });
    iframe.addEventListener('load', function () {
      try { iframe.style.height = iframe.contentDocument.documentElement.scrollHeight + 'px'; } catch (e) { /* cross-origin fallback: fixed height */ iframe.style.height = '1400px'; }
    });
    return w;
  }

  /* Report-specific sibling of printPreview() above — same sandboxed-
     iframe pattern (view mode: the popup shows the report exactly as
     report.js's @media screen rules style it), but the button is
     "Export PDF" and, critically, sets document.title on BOTH the
     popup window and the iframe's own document to
     "<Client> - <Report> - <YYYY-MM-DD>" before printing — that's what
     Chrome/Edge's Save-as-PDF dialog uses to suggest a filename, and it
     has to be set on the iframe's document too since print() is
     invoked on iframe.contentWindow, not the popup window itself. */
  function reportPreview(spec, fullHtml) {
    var w = window.open('', '_blank');
    if (!w) { toast('Popup blocked — allow pop-ups for this site to preview and export.'); return null; }
    var fileTitle = spec.client.name + ' - ' + spec.reportTitle + ' - ' + spec.dateIso;
    w.document.title = fileTitle;
    var wbody = w.document.body;
    wbody.style.margin = '0';
    wbody.style.background = '#FAF7F1';

    var bar = w.document.createElement('div');
    bar.style.cssText = 'position:sticky;top:0;display:flex;justify-content:flex-end;padding:14px 24px;background:#FAF7F1;border-bottom:1px solid rgba(11,11,12,.15);z-index:10';
    var printBtn = w.document.createElement('button');
    printBtn.textContent = 'EXPORT PDF';
    printBtn.style.cssText = 'background:#A9812E;color:#fff;border:none;padding:12px 24px;border-radius:3px;font-family:Manrope,sans-serif;font-size:11px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;cursor:pointer';
    bar.appendChild(printBtn);
    wbody.appendChild(bar);

    var iframe = w.document.createElement('iframe');
    iframe.setAttribute('sandbox', 'allow-same-origin allow-modals');
    iframe.style.cssText = 'width:100%;border:none;display:block';
    wbody.appendChild(iframe);
    iframe.srcdoc = fullHtml;

    printBtn.addEventListener('click', function () {
      try { iframe.contentDocument.title = fileTitle; iframe.contentWindow.focus(); iframe.contentWindow.print(); } catch (e) { /* pop-up/frame torn down already */ }
    });
    iframe.addEventListener('load', function () {
      try { iframe.contentDocument.title = fileTitle; iframe.style.height = iframe.contentDocument.documentElement.scrollHeight + 'px'; } catch (e) { iframe.style.height = '1400px'; }
    });
    return w;
  }

  /* Which Graph-derived signals and scan data informed a report, for
     the Methodology appendix every report type shares — CAP (see
     detectAppCapabilities()) and S.scans are the same things the
     Coverage card and Dashboard already surface, just reformatted for
     a printed appendix. The scoring explanation is a fixed paragraph,
     identical across every report type, so it only needs writing once. */
  function buildMethodology() {
    var keys = ['conditionalAccess', 'identityProtection', 'pim', 'intune', 'secureScore'];
    var signals = keys.map(function (k) {
      var c = CAP && CAP[k];
      return { label: c ? c.label : k, available: !!(c && c.available) };
    });
    var scanTimestamps = (S.scans || []).slice(-3).reverse().map(function (s) {
      return fmtDate(s.date) + ' — scored ' + s.score + '/100' + (s.source ? ' (' + s.source + ')' : '');
    });
    return {
      signals: signals,
      scanTimestamps: scanTimestamps,
      coverage: automatableCheckCount(),
      scoringNote: 'Each posture check resolves to <b>Pass</b>, <b>Review</b> or <b>Fail</b> from a live Microsoft Graph signal where this tenant’s licensing allows it, or <b>Manual</b> where it doesn’t (see capability coverage above) — a Manual result is never silently counted as a pass. Statement of Applicability status (Implemented / In progress / Not started) is self-reported by the practitioner; only controls with a linked evidence document are treated as evidence-backed rather than self-reported alone, and reports call this distinction out explicitly wherever it matters (see the Audit Readiness Report’s “Implemented without linked evidence” section).'
    };
  }

  /* Report version numbers auto-increment per report TYPE, per client
     (i.e. per tenant — there's one Checkpoint instance per client, so
     "per client" and "per Settings list" are the same scope here),
     stored as an ordinary Settings key/value pair exactly like every
     other per-tenant setting in this app. Demo mode's Settings are
     just as real as any other setting there — version numbers still
     climb across a demo session, they just never leave the browser. */
  async function nextReportVersion(type) {
    var key = 'reportVersion_' + type;
    var current = parseInt((S.settings && S.settings[key]) || '0', 10) || 0;
    var next = current + 1;
    S.settings[key] = String(next);
    try { await Store.setSetting(key, String(next)); } catch (e) { warn(e); }
    return next;
  }

  /* Charts: this session's own reusable-chart-functions feature.
     window.ReportEngine.charts + palette are report.js's SVG chart
     primitives (data in, SVG string out) — see report.js's own header
     comment for the design. Everything below turns app.js's live
     tenant state into the plain data objects those functions expect;
     report.js itself never reads S/Store/Graph directly. */
  var RC = window.ReportEngine.charts;
  var RPAL = window.ReportEngine.palette;
  var CONTROL_STATUS_LEGEND = [
    { label: 'Implemented', color: RPAL.good },
    { label: 'In progress', color: RPAL.warn },
    { label: 'Not started', color: RPAL.neutral, hatch: true },
    { label: 'Not applicable', color: RPAL.muted }
  ];
  var SEVERITY_LEGEND = [
    { label: 'Low', color: RPAL.good },
    { label: 'Medium', color: RPAL.warn },
    { label: 'High', color: RPAL.high },
    { label: 'Critical', color: RPAL.bad }
  ];
  var THROUGHPUT_LEGEND = [
    { label: 'Done', color: RPAL.good },
    { label: 'Open', color: RPAL.neutral, hatch: true }
  ];

  function controlStatusCounts(rows) {
    var implemented = 0, inProgress = 0, notStarted = 0, notApplicable = 0;
    rows.forEach(function (c) {
      if (!c.app) { notApplicable++; return; }
      if (c.st === 'Implemented') implemented++;
      else if (c.st === 'In progress') inProgress++;
      else notStarted++;
    });
    return { implemented: implemented, inProgress: inProgress, notStarted: notStarted, notApplicable: notApplicable };
  }

  /* Groups for the stacked-bars chart ("control status by theme/
     category" — item 3's own examples): ISO 27001's A.5-A.8 theme
     prefixes, SOC 2's CC/A/C/PI/P categories (inferred from the code
     prefix — S.controls rows don't carry a separate `cat` field, only
     window.FRAMEWORKS[fw].controls' source objects do, same reasoning
     the framework-registry test suite's own inferCat() already
     documents), and Essential Eight's per-strategy grouping (codes
     share a "<strategy>-ML<level>" prefix; the parent row with no
     "-ML" suffix supplies the human-readable label). Any other
     framework has no natural sub-grouping defined anywhere else in
     this app, so it falls back to one group covering every control —
     the chart still renders sensibly rather than being empty. */
  function themeGroupsFor(fw, rows) {
    function group(label, subset) {
      var c = controlStatusCounts(subset);
      return { label: label, values: [c.implemented, c.inProgress, c.notStarted, c.notApplicable] };
    }
    if (fw === 'iso27001') {
      var THEMES = [['A.5', 'Organizational controls'], ['A.6', 'People controls'], ['A.7', 'Physical controls'], ['A.8', 'Technological controls']];
      return THEMES.map(function (t) { return group(t[1], rows.filter(function (c) { return c.id.indexOf(t[0] + '.') === 0; })); });
    }
    if (fw === 'soc2') {
      var CATS = [['CC', 'Common Criteria'], ['PI', 'Processing Integrity'], ['A', 'Availability'], ['C', 'Confidentiality'], ['P', 'Privacy']]; /* order matters: PI before P, CC is its own prefix */
      function inferCat(code) { return CATS.find(function (cp) { return code.indexOf(cp[0]) === 0; }); }
      return CATS.map(function (cp) { return group(cp[1], rows.filter(function (c) { var m = inferCat(c.id); return m && m[0] === cp[0]; })); });
    }
    if (fw === 'essential8') {
      var byStrategy = {};
      rows.forEach(function (c) { var prefix = c.id.split('-ML')[0]; (byStrategy[prefix] = byStrategy[prefix] || []).push(c); });
      return Object.keys(byStrategy).map(function (prefix) {
        var subset = byStrategy[prefix];
        var parent = subset.find(function (c) { return c.id === prefix; });
        return group((parent && parent.t) || prefix, subset);
      });
    }
    return [group(fwName(fw), rows)];
  }

  /* Evidence gauge input — over IMPLEMENTED controls only (task's own
     wording: "% of implemented controls with linked evidence"), split
     auto-captured (autoEvidenceCapture() wrote it, tagged via
     AUTO_EVIDENCE_TAG) vs manually linked — the same distinction
     renderSoa()'s evidence-coverage strip already computes, just
     scoped to Implemented rather than every applicable control. */
  function evidenceCoverageFor(rows) {
    var impl = rows.filter(function (c) { return c.st === 'Implemented'; });
    var autoCaptured = 0, manual = 0;
    impl.forEach(function (c) {
      if (!c.evidenceUrl) return;
      if (c.verifiedBy === AUTO_EVIDENCE_TAG) autoCaptured++; else manual++;
    });
    return { autoCaptured: autoCaptured, manual: manual, total: impl.length };
  }

  /* Trend chart input — reuses the exact same scan history the
     Dashboard sparkline already plots (see renderDash()'s spark
     rendering), just formatted as report.js's chart contract expects
     (a pre-formatted date label, since report.js stays date-
     formatting-agnostic). */
  function scanTrendData() {
    return (S.scans || []).map(function (s) { return { dateLabel: fmtDate(s.date), score: s.score, readiness: typeof s.readiness === 'number' ? s.readiness : undefined }; });
  }
  var REPORT_TARGET_SCORE = 80; /* a fixed, non-per-tenant "healthy posture" reference line — there's no stored target-score setting elsewhere in this app to reuse (unlike E8/DISP/NIST's target LEVEL settings) */

  function openResidualPairs() {
    return (S.risks || []).filter(function (r) { return r.status !== 'Closed'; }).map(residual);
  }

  /* Action-throughput-by-month — mgmt report only. Buckets by the
     month of each action's OWN due date (an action with no due date
     isn't placed in any month — it has no date to bucket by), done vs
     still-open within that month. Capped to the most recent 6 months
     so a long-lived tenant's chart stays readable rather than growing
     without bound. */
  function actionThroughputByMonth() {
    var buckets = {};
    (S.actions || []).forEach(function (a) {
      if (!a.due) return;
      var key = a.due.slice(0, 7);
      if (!buckets[key]) buckets[key] = { done: 0, open: 0 };
      if (a.status === 'Done') buckets[key].done++; else buckets[key].open++;
    });
    var keys = Object.keys(buckets).sort().slice(-6);
    return keys.map(function (key) {
      var label = new Date(key + '-01T00:00').toLocaleDateString('en-AU', { month: 'short', year: '2-digit' });
      return { label: label, values: [buckets[key].done, buckets[key].open] };
    });
  }

  /* Per-report-type spec builders — each returns { title, dashboard,
     sections } for window.ReportEngine.buildReport() to assemble
     alongside the cover/document-control/TOC/methodology/sign-off
     every report type shares. All five used to build one big HTML
     string inline in App.report(); the table/section computations are
     exactly what they always were — esc()/band()/residual() calls are
     unchanged — only dashboard.kpis became dashboard.charts, an
     ordered array of this report type's visual-dashboard composition
     (see the task spec: which report type gets which of the six chart
     functions). */
  var REPORT_BUILDERS = {
    soa: function (activeFw, fwLabel) {
      var fwControls = frameworkVisibleRows(activeFw);
      var app = fwControls.filter(function (c) { return c.app; });
      var impl = app.filter(function (c) { return c.st === 'Implemented'; }).length;
      var pct = window.CheckpointLib.readinessPct(app);
      var tableHtml = '<table class="rpt-table"><tr><th>Control</th><th>Title</th><th>Applicable</th><th>Status</th><th>Also satisfies</th></tr>' +
        fwControls.map(function (c) { return '<tr><td class="rpt-idc">' + c.id + '</td><td>' + esc(c.t) + (c.just ? '<div class="rpt-just">Exclusion justification: ' + esc(c.just) + '</div>' : '') + '</td><td>' + (c.app ? 'Yes' : 'No') + '</td><td>' + c.st + '</td><td>' + esc(c.map) + '</td></tr>'; }).join('') + '</table>';
      var statusCounts = controlStatusCounts(fwControls);
      return {
        title: 'Statement of Applicability — ' + fwLabel,
        dashboard: {
          intro: 'Controls assessed for applicability with implementation status and cross-framework mapping. Justifications recorded for all exclusions. Evidence references resolve to the tenant Evidence library.',
          charts: [
            { figure: 1, title: 'Readiness — ' + fwLabel, caption: pct + '% of applicable controls implemented (' + impl + '/' + app.length + ').', svg: RC.donut(statusCounts) },
            { figure: 2, title: 'Control status by theme', caption: 'Implementation mix across ' + fwLabel + '’s own theme/category grouping.', svg: RC.stackedBars(themeGroupsFor(activeFw, fwControls), CONTROL_STATUS_LEGEND) }
          ]
        },
        sections: [{ heading: 'Control applicability', html: tableHtml, pageBreak: true }]
      };
    },

    risk: function () {
      var openRisks = S.risks.filter(function (r) { return r.status !== 'Closed'; });
      var crit = openRisks.filter(function (r) { var q = residual(r); return (q.L * q.I) >= 10; }).length;
      var tableHtml = '<table class="rpt-table"><tr><th>ID</th><th>Risk</th><th>Category</th><th>Inherent</th><th>Residual</th><th>Treatment</th><th>Owner</th><th>Status</th></tr>' +
        S.risks.map(function (r) { var q = residual(r); return '<tr><td class="rpt-idc">' + r.id + '</td><td>' + esc(r.title) + '</td><td>' + esc(r.cat) + '</td><td>' + (r.L * r.I) + ' — ' + band(r.L * r.I) + '</td><td><b>' + (q.L * q.I) + ' — ' + band(q.L * q.I) + '</b></td><td>' + r.treat + '</td><td>' + esc(r.owner) + '</td><td>' + r.status + '</td></tr>'; }).join('') + '</table>';
      var sevCounts = { Low: 0, Medium: 0, High: 0, Critical: 0 };
      openRisks.forEach(function (r) { var q = residual(r); sevCounts[band(q.L * q.I)]++; });
      return {
        title: 'Risk Register Snapshot',
        dashboard: {
          intro: S.risks.length + ' risks under management. Residual scores computed from completed treatment actions as at report date.',
          charts: [
            { figure: 1, title: 'Residual risk heatmap', caption: openRisks.length + ' open risk(s) plotted by residual likelihood × impact.', svg: RC.riskHeatmap(openResidualPairs()) },
            { figure: 2, title: 'Severity distribution', caption: crit + ' risk(s) currently score High or Critical residual.', svg: RC.stackedBars([{ label: 'Open risks', values: [sevCounts.Low, sevCounts.Medium, sevCounts.High, sevCounts.Critical] }], SEVERITY_LEGEND) }
          ]
        },
        sections: [{ heading: 'Risk register', html: tableHtml, pageBreak: true }]
      };
    },

    ready: function (activeFw, fwLabel) {
      var fwControls = frameworkVisibleRows(activeFw);
      var app = fwControls.filter(function (c) { return c.app; });
      var impl = app.filter(function (c) { return c.st === 'Implemented'; }).length;
      var od = S.actions.filter(overdue).length;
      var openRisks = S.risks.filter(function (r) { return r.status !== 'Closed'; });
      var crit = openRisks.filter(function (r) { var q = residual(r); return (q.L * q.I) >= 10; }).length;
      var lastScan = S.scans[S.scans.length - 1];
      var applicableCount = app.length;
      var pct = window.CheckpointLib.readinessPct(app);
      var notImpl = fwControls.filter(function (c) { return c.app && c.st !== 'Implemented'; });
      var readinessBand = pct >= 90 ? 'Certification-ready' : pct >= 70 ? 'On track — minor gaps remain' : pct >= 50 ? 'Material gaps — a remediation plan is required before audit' : 'Significant uplift required before audit can be scheduled';

      var sections = [];

      /* per-theme breakdown — only ISO 27001's control codes carry a
         natural theme prefix (A.5 Organizational / A.6 People /
         A.7 Physical / A.8 Technological) */
      if (activeFw === 'iso27001') {
        var THEMES = [['A.5', 'Organizational controls'], ['A.6', 'People controls'], ['A.7', 'Physical controls'], ['A.8', 'Technological controls']];
        var themedHtml = '<table class="rpt-table"><tr><th>Theme</th><th>Applicable</th><th>Implemented</th><th>%</th></tr>' +
          THEMES.map(function (t) {
            var group = fwControls.filter(function (c) { return c.id.indexOf(t[0] + '.') === 0; });
            var gApp = group.filter(function (c) { return c.app; });
            var gImpl = gApp.filter(function (c) { return c.st === 'Implemented'; }).length;
            var gPct = gApp.length ? Math.round(gImpl / gApp.length * 100) : 0;
            return '<tr><td>' + t[1] + '</td><td>' + gApp.length + '</td><td>' + gImpl + '</td><td><b>' + gPct + '%</b></td></tr>';
          }).join('') + '</table>';
        sections.push({ heading: 'Control implementation by theme', html: themedHtml, pageBreak: true });
      }

      var gapsHtml = notImpl.length
        ? '<table class="rpt-table"><tr><th>Control</th><th>Title</th><th>Status</th></tr>' +
          notImpl.map(function (c) { return '<tr><td class="rpt-idc">' + c.id + '</td><td>' + esc(c.t) + '</td><td>' + c.st + '</td></tr>'; }).join('') + '</table>'
        : '<p class="rpt-intro">None — every applicable control is marked Implemented.</p>';
      sections.push({ heading: 'Open control gaps (' + notImpl.length + ')', html: gapsHtml, pageBreak: sections.length === 0 });

      /* the honesty gap: self-reported "Implemented" with no evidence
         on file is exactly what an auditor will challenge first */
      var unevidenced = app.filter(function (c) { return c.st === 'Implemented' && !c.evidenceUrl; });
      if (unevidenced.length) {
        var unevidencedHtml = '<p class="rpt-intro">Self-reported as Implemented, but no evidence document is linked. This is the first thing a certification auditor will test — attach evidence or downgrade the status before audit.</p><table class="rpt-table"><tr><th>Control</th><th>Title</th></tr>' +
          unevidenced.map(function (c) { return '<tr><td class="rpt-idc">' + c.id + '</td><td>' + esc(c.t) + '</td></tr>'; }).join('') + '</table>';
        sections.push({ heading: 'Implemented without linked evidence (' + unevidenced.length + ')', html: unevidencedHtml, pageBreak: false });
      }

      var topRisks = openRisks.slice().sort(function (a, b) { var qa = residual(a), qb = residual(b); return (qb.L * qb.I) - (qa.L * qa.I); }).slice(0, 5);
      var riskHtml = '<p class="rpt-intro">' + openRisks.length + ' risk(s) under active management' + (crit ? ', ' + crit + ' scoring High or Critical residual' : '') + '.</p>' +
        (topRisks.length ? '<table class="rpt-table"><tr><th>ID</th><th>Risk</th><th>Residual</th><th>Owner</th><th>Status</th></tr>' +
          topRisks.map(function (r) { var q = residual(r); return '<tr><td class="rpt-idc">' + r.id + '</td><td>' + esc(r.title) + '</td><td><b>' + (q.L * q.I) + ' — ' + band(q.L * q.I) + '</b></td><td>' + esc(r.owner) + '</td><td>' + r.status + '</td></tr>'; }).join('') + '</table>' : '');
      sections.push({ heading: 'Risk register position', html: riskHtml, pageBreak: false });

      var auditorAskHtml = '<ul class="rpt-plain">' +
        fwControls.filter(function (c) { return !c.app && c.just; }).map(function (c) {
          return '<li>Exclusion justification for ' + c.id + ' (' + esc(c.t) + ') — recorded: ' + esc(c.just) + '</li>';
        }).join('') +
        '<li>Evidence of management review — generate the Management Review Pack quarterly to satisfy this directly.</li>' +
        (activeFw === 'iso27001' ? '<li>Restore-test evidence for A.8.13 — ' + (S.actions.find(function (a) { return a.control === 'A.8.13' && a.status !== 'Done'; }) ? '⚠ open action outstanding' : '✓ no open actions') + '.</li>' : '') +
        '<li>Residual-risk acceptance sign-off for all risks scoring Medium+ after treatment.</li></ul>';
      sections.push({ heading: 'What the auditor will ask', html: auditorAskHtml, pageBreak: false });

      var openNCs = S.actions.filter(function (a) { return a.status !== 'Done' && a.type && a.type.indexOf('Non-conformity') === 0; });
      var recs = [];
      if (notImpl.length) recs.push('Close the ' + notImpl.length + ' open control gap' + (notImpl.length > 1 ? 's' : '') + ' listed above before scheduling the certification audit.');
      if (unevidenced.length) recs.push('Attach evidence for the ' + unevidenced.length + ' control' + (unevidenced.length > 1 ? 's' : '') + ' marked Implemented without it — self-reported status alone will not satisfy an auditor.');
      if (openNCs.length) recs.push('Close out the ' + openNCs.length + ' open non-conformit' + (openNCs.length > 1 ? 'ies' : 'y') + ' in the Actions register before the next surveillance audit.');
      if (crit) recs.push('Treat the ' + crit + ' open High/Critical residual risk' + (crit > 1 ? 's' : '') + ' — auditors will ask for documented risk-acceptance sign-off on anything left at Medium or above.');
      if (od) recs.push('Clear the ' + od + ' overdue action' + (od > 1 ? 's' : '') + ' — auditors read overdue remediation as a control-effectiveness concern, not just a project-management one.');
      recs.push('Generate the Management Review Pack each quarter to keep the management-review requirement satisfied continuously, not assembled the week before audit.');
      sections.push({ heading: 'Recommendations', html: '<ul class="rpt-plain">' + recs.map(function (r) { return '<li>' + r + '</li>'; }).join('') + '</ul>', pageBreak: false });

      var readyStatusCounts = controlStatusCounts(fwControls);
      var readyEvidence = evidenceCoverageFor(fwControls);
      return {
        title: 'Audit Readiness Report — ' + fwLabel,
        dashboard: {
          intro: '<b>' + readinessBand + '.</b> ' + pct + '% of ' + applicableCount + ' applicable ' + fwLabel + ' controls are implemented (' + impl + '/' + applicableCount + '). ' +
            crit + ' high/critical residual risk' + (crit === 1 ? '' : 's') + ' remain open, with ' + od + ' overdue action' + (od === 1 ? '' : 's') + ' against the remediation plan. Latest posture scan scored ' + (lastScan ? lastScan.score + '/100' : 'not yet run') + '.',
          /* 'ready' gets all six chart functions — the most detailed
             report type, matching its role as the pre-audit deep dive. */
          charts: [
            { figure: 1, title: 'Key metrics', caption: 'Snapshot as at this report’s date.', svg: RC.kpiStrip([
              { value: pct + '%', label: 'Controls implemented' },
              { value: String(crit), label: 'High/critical risks open' },
              { value: String(od), label: 'Overdue actions' },
              { value: lastScan ? String(lastScan.score) : '—', label: 'Latest posture score' }
            ]) },
            { figure: 2, title: 'Readiness — ' + fwLabel, caption: pct + '% of applicable controls implemented (' + impl + '/' + applicableCount + ').', svg: RC.donut(readyStatusCounts) },
            { figure: 3, title: 'Posture score trend', caption: lastScan ? ('Latest scan: ' + lastScan.score + '/100 (' + fmtDate(lastScan.date) + ').') : 'No posture scans recorded yet.', svg: RC.trend(scanTrendData(), REPORT_TARGET_SCORE) },
            { figure: 4, title: 'Control status by theme', caption: 'Implementation mix across ' + fwLabel + '’s own theme/category grouping.', svg: RC.stackedBars(themeGroupsFor(activeFw, fwControls), CONTROL_STATUS_LEGEND) },
            { figure: 5, title: 'Residual risk heatmap', caption: openRisks.length + ' open risk(s) plotted by residual likelihood × impact.', svg: RC.riskHeatmap(openResidualPairs()) },
            { figure: 6, title: 'Evidence coverage', caption: readyEvidence.total ? (Math.round((readyEvidence.autoCaptured + readyEvidence.manual) / readyEvidence.total * 100) + '% of implemented controls have linked evidence.') : 'No implemented controls yet.', svg: RC.evidenceGauge(readyEvidence) }
          ]
        },
        sections: sections
      };
    },

    exec: function (activeFw, fwLabel) {
      var fwControls = frameworkVisibleRows(activeFw);
      var app = fwControls.filter(function (c) { return c.app; });
      var lastSc = S.scans[S.scans.length - 1];
      var prevSc = S.scans[S.scans.length - 2];
      var trendArrow = (lastSc && prevSc) ? (lastSc.score > prevSc.score ? '▲' : lastSc.score < prevSc.score ? '▼' : '—') : '';
      var trendColor = (lastSc && prevSc && lastSc.score > prevSc.score) ? '#2e7d32' : (lastSc && prevSc && lastSc.score < prevSc.score) ? '#b91c1c' : '#6b675e';
      var pctExec = window.CheckpointLib.readinessPct(app);
      var critExec = S.risks.filter(function (r) { if (r.status === 'Closed') return false; var q = residual(r); return band(q.L * q.I) === 'Critical' || band(q.L * q.I) === 'High'; }).length;
      var topRisks3 = S.risks.filter(function (r) { return r.status !== 'Closed'; }).slice().sort(function (a, b) { var qa = residual(a), qb = residual(b); return (qb.L * qb.I) - (qa.L * qa.I); }).slice(0, 3);
      var entitledExec = entitledFrameworks();
      var nextPhase = 'Certify';
      (function () {
        var iPct = window.CheckpointLib.readinessPct(app);
        var ePct = app.length ? Math.round(app.filter(function (c) { return c.st === 'Implemented' && (c.verified || c.evidenceUrl); }).length / app.length * 100) : 0;
        nextPhase = iPct < 100 ? 'Implement (' + iPct + '% complete)' : ePct < 100 ? 'Evidence (' + ePct + '% complete)' : 'Certify — ready for external audit';
      })();
      return {
        title: 'Executive Summary — ' + fwLabel,
        dashboard: {
          intro: '',
          /* KPI strip + donut + trend + top-risk heatmap, all on the
             one dashboard page — the board-ready, five-minute version. */
          charts: [
            { figure: 1, title: 'Key metrics', caption: 'Trend arrow vs the previous scan.', svg: RC.kpiStrip([
              { value: lastSc ? String(lastSc.score) : '—', label: 'Posture score', trend: trendArrow === '▲' ? 'up' : trendArrow === '▼' ? 'down' : null, trendGood: lastSc && prevSc ? lastSc.score >= prevSc.score : true },
              { value: pctExec + '%', label: 'Controls implemented' },
              { value: String(critExec), label: 'High/critical risks open' }
            ]) },
            { figure: 2, title: 'Readiness — ' + fwLabel, caption: pctExec + '% of applicable controls implemented.', svg: RC.donut(controlStatusCounts(fwControls)) },
            { figure: 3, title: 'Posture score trend', caption: lastSc ? ('Latest scan: ' + lastSc.score + '/100.') : 'No posture scans recorded yet.', svg: RC.trend(scanTrendData(), REPORT_TARGET_SCORE) },
            { figure: 4, title: 'Top-risk heatmap', caption: critExec + ' risk(s) currently score High or Critical residual.', svg: RC.riskHeatmap(openResidualPairs()) }
          ]
        },
        sections: [
          { heading: 'Next milestone', html: '<p class="rpt-intro" style="font-size:15px">' + esc(nextPhase) + '</p>', pageBreak: true },
          { heading: 'Top risks', html: topRisks3.length ? ('<table class="rpt-table"><tr><th>Risk</th><th>Residual</th><th>Owner</th></tr>' +
            topRisks3.map(function (r) { var q = residual(r); return '<tr><td>' + esc(r.title) + '</td><td><b>' + band(q.L * q.I) + '</b></td><td>' + esc(r.owner) + '</td></tr>'; }).join('') + '</table>') : '<p class="rpt-intro">No open risks.</p>', pageBreak: false },
          { heading: 'Frameworks in scope', html: '<p class="rpt-intro">' + entitledExec.map(fwName).join(', ') + '</p>', pageBreak: false }
        ]
      };
    },

    mgmt: function (activeFw, fwLabel) {
      var fwControls = frameworkVisibleRows(activeFw);
      var app = fwControls.filter(function (c) { return c.app; });
      var impl = app.filter(function (c) { return c.st === 'Implemented'; }).length;
      var doneQ = S.actions.filter(function (a) { return a.status === 'Done'; }).length;
      var lastS = S.scans[S.scans.length - 1];
      var tableHtml = '<table class="rpt-table"><tr><th>ID</th><th>Risk</th><th>Residual</th><th>Owner</th></tr>' +
        S.risks.slice().sort(function (a, b) { var qa = residual(a), qb = residual(b); return (qb.L * qb.I) - (qa.L * qa.I); }).slice(0, 5).map(function (r) { var q = residual(r); return '<tr><td class="rpt-idc">' + r.id + '</td><td>' + esc(r.title) + '</td><td><b>' + (q.L * q.I) + ' — ' + band(q.L * q.I) + '</b></td><td>' + esc(r.owner) + '</td></tr>'; }).join('') + '</table>';
      var throughput = actionThroughputByMonth();
      return {
        title: 'Management Review Pack — ' + fwLabel + (activeFw === 'iso27001' ? ' Clause 9.3' : ''),
        dashboard: {
          intro: 'Prepared for the quarterly management review. Inputs per clause 9.3.2; minutes and decisions to be appended as the record of review.',
          /* trend + action-throughput bar + heatmap — the inputs a
             management review actually works through: is posture
             trending the right way, is the team clearing its actions,
             and where does residual risk still sit. */
          charts: [
            { figure: 1, title: 'Posture score trend', caption: lastS ? ('Latest scan: ' + lastS.score + '/100.') : 'No posture scans recorded yet.', svg: RC.trend(scanTrendData(), REPORT_TARGET_SCORE) },
            { figure: 2, title: 'Action throughput by month', caption: doneQ + ' of ' + S.actions.length + ' action(s) completed to date.', svg: RC.stackedBars(throughput, THROUGHPUT_LEGEND) },
            { figure: 3, title: 'Residual risk heatmap', caption: S.risks.filter(function (r) { return r.status !== 'Closed'; }).length + ' open risk(s) plotted by residual likelihood × impact.', svg: RC.riskHeatmap(openResidualPairs()) }
          ]
        },
        sections: [
          { heading: 'Top residual risks', html: tableHtml, pageBreak: true },
          { heading: 'Recommendations', html: '<ul class="rpt-plain"><li>Close open identity-related scan findings before the surveillance window.</li><li>Schedule the A.8.13 restore test; evidence auto-captures on completion.</li><li>Confirm risk acceptance for residual Medium risks with the executive sponsor.</li></ul>', pageBreak: false }
        ]
      };
    }
  };

  /* Renders a POLICY_TEMPLATES entry into a self-contained HTML document —
     same print-preview/PDF pattern and brand styling as App.report(), plus
     a DRAFT watermark until opts.approved is true. Deterministic given the
     same inputs, so App.approveTemplate() can call it again later with
     approved:true to produce a clean replacement of the same file. */
  function buildTemplateHtml(t, opts) {
    var fontBase = location.href.slice(0, location.href.lastIndexOf('/') + 1);
    var head = '<div class="mast"><div class="lk"><svg width="30" height="30" viewBox="0 0 200 200" fill="none"><path d="M176.2,56 A88,88 0 1,0 176.2,144" stroke="#0B0B0C" stroke-width="16" stroke-linecap="round"/><circle cx="188" cy="100" r="14" fill="#A9812E"/></svg><span class="w1">COMPLIANCE</span><span class="w2">365</span></div><div class="mr">Policy document · Generated ' + esc(opts.generatedDate) + '<br>' + esc(opts.clientLabel) + '</div></div>';
    var watermarkHtml = opts.approved ? '' :
      '<div class="wm">DRAFT</div><div class="db">DRAFT — review and approve. Not yet confirmed by a practitioner as ready for use.</div>';
    var statementsHtml = '<ol>' + t.policyStatements.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ol>';
    var body = '<div class="stats" style="margin-top:0"><div><b style="font-size:15px">' + esc(opts.clientLabel) + '</b><span>Organisation</span></div><div><b style="font-size:15px">' + esc(opts.owner) + '</b><span>Document owner</span></div><div><b style="font-size:15px">' + (opts.reviewDate ? fmtDate(opts.reviewDate) : '—') + '</b><span>Next review due</span></div></div>' +
      '<h2>Purpose</h2><p class="intro">' + esc(t.purpose) + '</p>' +
      '<h2>Scope</h2><p class="intro">' + esc(t.scope) + '</p>' +
      '<h2>Policy</h2>' + statementsHtml +
      '<h2>Review</h2><p class="intro">' + esc(t.reviewCadence) + '</p>' +
      (t.controls.length ? '<h2>Helps satisfy</h2><p class="intro">' + esc(t.controls.join(', ')) + '</p>' : '');
    return '<!DOCTYPE html><html><head><style>' +
      "@font-face{font-family:'Fraunces';font-style:normal;font-weight:400 500;src:url('" + fontBase + "fonts/fraunces.woff2') format('woff2')}" +
      "@font-face{font-family:'Manrope';font-style:normal;font-weight:300 800;src:url('" + fontBase + "fonts/manrope.woff2') format('woff2')}" +
      'body{font-family:Manrope,sans-serif;background:#FAF7F1;color:#0B0B0C;padding:48px;max-width:900px;margin:0 auto;font-size:13px;line-height:1.6}' +
      '.mast{display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #0B0B0C;padding-bottom:18px;margin-bottom:8px}' +
      '.lk{display:flex;align-items:center;gap:10px}.w1{font-weight:300;letter-spacing:.13em}.w2{font-weight:800;color:#A9812E}' +
      '.mr{text-align:right;font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:#6b675e}' +
      'h1{font-family:Fraunces,serif;font-weight:500;font-size:30px;margin:26px 0 4px}h2{font-family:Fraunces,serif;font-weight:500;font-size:19px;margin:30px 0 12px}' +
      '.gr{width:26px;height:1px;background:#A9812E;margin:14px 0 18px}' +
      '.intro{color:#4b473e;max-width:70ch}' +
      'ol{margin:10px 0 0 20px}li{margin-bottom:10px}' +
      '.stats{display:flex;gap:0;border-top:1px solid rgba(11,11,12,.2);border-bottom:1px solid rgba(11,11,12,.2);margin:20px 0}' +
      '.stats div{flex:1;padding:16px;border-right:1px solid rgba(11,11,12,.12)}.stats div:last-child{border-right:none}' +
      '.stats span{display:block;margin-top:4px;font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:#6b675e}' +
      '.pf{margin-top:40px;padding-top:14px;border-top:1px solid rgba(11,11,12,.2);font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:#8b877d;display:flex;justify-content:space-between}' +
      '.wm{position:fixed;top:40%;left:50%;transform:translate(-50%,-50%) rotate(-30deg);font-family:Fraunces,serif;font-size:140px;font-weight:700;color:rgba(185,28,28,.14);letter-spacing:.05em;pointer-events:none;white-space:nowrap}' +
      '.db{position:sticky;top:0;background:#b91c1c;color:#fff;padding:10px 16px;font-size:11px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;text-align:center;margin:-48px -48px 24px}' +
      '</style></head><body>' + watermarkHtml + head + '<h1>' + esc(t.title) + '</h1><div class="gr"></div>' + body +
      '<div class="pf"><span>Compliance365 — Checkpoint</span><span>' + (opts.approved ? 'Approved · ' : 'Draft · ') + esc(opts.generatedDate) + '</span></div>' +
      '</body></html>';
  }

  function entitledFrameworks() {
    return window.FRAMEWORK_ORDER.filter(function (fw) { return S.entitlements && S.entitlements[fw]; });
  }
  function fwName(fw) { return (window.FRAMEWORKS[fw] || {}).name || (window.ADDON_MODULE_NAMES || {})[fw] || fw; }
  /* default to ON if a key isn't present yet (older tenants provisioned
     before this feature existed shouldn't have things silently vanish) */
  function featureOn(key) { return !(S.settings && S.settings[key] === 'false'); }
  function overdueDays(a) {
    if (a.status === 'Done' || !a.due) return 0;
    var today = new Date().toISOString().slice(0, 10);
    if (a.due >= today) return 0;
    return Math.floor((new Date(today) - new Date(a.due)) / 86400000);
  }
  var SEV_RANK = { Low: 1, Medium: 2, High: 3, Critical: 4 };
  /* fixed RAG severity scale for the risk heatmap — status colors, not an
     arbitrary hue ramp, so a cell's color always means the same thing
     regardless of how many risks happen to land in it */
  var SEV_RGB = { Low: '12,163,12', Medium: '250,178,25', High: '236,131,90', Critical: '208,59,59' };
  var SEV_TEXT = { Low: '#eafbea', Medium: '#2a1c00', High: '#2a1200', Critical: '#fdeceb' };
  function daysSince(dateStr) {
    if (!dateStr) return Infinity;
    return Math.floor((new Date(new Date().toISOString().slice(0, 10)) - new Date(dateStr)) / 86400000);
  }
  /* generic trend badge vs a previous snapshot. higherIsBetter flips which
     direction counts as "good" (green) — a rising posture score is good, a
     rising risk/overdue count is not. */
  function trendBadge(current, previous, higherIsBetter) {
    if (previous === undefined || previous === null || current === previous) return '';
    var up = current > previous;
    var good = higherIsBetter ? up : !up;
    return '<span class="trend" style="color:' + (good ? 'var(--pass)' : 'var(--fail)') + '">' + (up ? '▲' : '▼') + Math.abs(current - previous) + '</span>';
  }
  function busy(on) { document.getElementById('busy').style.display = on ? 'flex' : 'none'; }
  function log(msg) { S.activity.unshift({ t: new Date().toISOString().slice(0, 10), msg: msg }); Store.logActivity(msg).catch(warn); }
  /* Append-only audit trail — distinct from the activity feed above,
     which is prose for humans; this is structured (actor/action/target/
     before/after) for evidence (ISO 27001 A.8.15, SOC 2 CC7.2). Never
     blocks the action it's recording: a logging failure surfaces a
     non-blocking toast, not a broken workflow. */
  function audit(action, targetType, targetId, before, after) {
    var acc = (typeof Graph !== 'undefined' && Graph.getAccount()) || null;
    var entry = {
      actor: (acc && (acc.name || acc.username)) || (Store.kind === 'demo' ? 'Demo user' : 'Practitioner'),
      actorId: (acc && (acc.homeAccountId || acc.localAccountId)) || '',
      action: action, targetType: targetType, targetId: String(targetId),
      before: before === undefined || before === null ? '' : String(before),
      after: after === undefined || after === null ? '' : String(after),
      entryDateTime: new Date().toISOString()
    };
    if (!S.auditLog) S.auditLog = [];
    /* Store.appendAudit() does the S.auditLog.unshift() itself (both
       stores), same as every other addX()/appendX() in this app —
       don't duplicate it here or every entry gets logged twice. */
    Store.appendAudit(entry).catch(function (e) {
      console.error(e);
      toast('<b>Audit log entry not recorded:</b> ' + esc(e.message || e));
    });
  }
  function warn(e) { console.error(e); toast('<b>Sync issue:</b> ' + esc(e.message || e)); }

  /* ================= render ================= */
  function renderNavCounts() {
    document.getElementById('nRisks').textContent = S.risks.filter(function (r) { return r.status !== 'Closed'; }).length;
    document.getElementById('nActions').textContent = S.actions.filter(function (a) { return a.status !== 'Done'; }).length;
    var p = S.proposed.length; var el = document.getElementById('nScan');
    el.textContent = p || ''; el.style.display = p ? 'inline-block' : 'none';

    var today = new Date().toISOString().slice(0, 10);
    var overdueAudits = (S.audits || []).filter(function (a) { return a.status === 'Planned' && a.planned && a.planned < today; }).length;
    var aEl = document.getElementById('nAudits');
    aEl.textContent = overdueAudits || ''; aEl.style.display = overdueAudits ? 'inline-block' : 'none';

    var lastReview = (S.reviews || [])[S.reviews.length - 1];
    var reviewOverdue = lastReview && lastReview.nextDue && lastReview.nextDue < today;
    var rEl = document.getElementById('nReviews');
    rEl.textContent = reviewOverdue ? '!' : ''; rEl.style.display = reviewOverdue ? 'inline-block' : 'none';

    var overdueCal = (S.calendar || []).filter(function (c) { return c.status !== 'Done' && c.nextDue && c.nextDue < today; }).length;
    var cEl = document.getElementById('nCalendar');
    cEl.textContent = overdueCal || ''; cEl.style.display = overdueCal ? 'inline-block' : 'none';

    var overdueVendors = (S.vendors || []).filter(vendorOverdue).length;
    var vEl = document.getElementById('nVendors');
    vEl.textContent = overdueVendors || ''; vEl.style.display = overdueVendors ? 'inline-block' : 'none';

    var aiPending = (S.aiCandidates || []).length;
    var aiEl = document.getElementById('nAiSystems');
    if (aiEl) { aiEl.textContent = aiPending || ''; aiEl.style.display = aiPending ? 'inline-block' : 'none'; }
  }

  function renderDash() {
    var openActs = S.actions.filter(function (a) { return a.status !== 'Done'; });
    var odActs = S.actions.filter(function (a) { return overdueDays(a) > 0; });
    var b1 = odActs.filter(function (a) { return overdueDays(a) <= 7; }).length;
    var b2 = odActs.filter(function (a) { var d = overdueDays(a); return d > 7 && d <= 30; }).length;
    var b3 = odActs.filter(function (a) { return overdueDays(a) > 30; }).length;
    var od = odActs.length;
    var crit = S.risks.filter(function (r) { if (r.status === 'Closed') return false; var q = residual(r); return band(q.L * q.I) === 'Critical' || band(q.L * q.I) === 'High'; }).length;
    var last = S.scans[S.scans.length - 1];
    var prevScan = S.scans[S.scans.length - 2];

    /* posture score tile — trend vs last scan + pass/review/fail breakdown,
       not just a bare number with a date */
    var scoreTrendHtml = last && prevScan ? trendBadge(last.score, prevScan.score, true) : '';
    var scoreBreakdownHtml = 'No scan yet — run one from the sidebar';
    if (last) {
      if (S.lastResults) {
        var scoredDefs = window.CHECK_DEFS.filter(function (c) { return c.scored !== false; });
        var passN = 0, reviewN = 0, failN = 0;
        scoredDefs.forEach(function (c) {
          var r = checkResult(c);
          if (r === 'pass') passN++; else if (r === 'review') reviewN++; else if (r === 'fail') failN++;
        });
        scoreBreakdownHtml = '<i class="dot" style="background:var(--pass)"></i>' + passN + ' &nbsp; <i class="dot" style="background:var(--warn)"></i>' + reviewN + ' &nbsp; <i class="dot" style="background:var(--fail)"></i>' + failN + ' &nbsp; ' + daysSince(last.date) + 'd ago';
      } else {
        scoreBreakdownHtml = 'Last scan ' + fmtDate(last.date);
      }
    }

    /* risks/overdue-actions trend vs the counts snapshotted at the last scan
       (scan-to-scan is the natural cadence here, same as the score tile —
       not every render, which would just show noise from mid-session edits) */
    var critTrendHtml = prevScan ? trendBadge(crit, prevScan.critRisks, false) : '';
    var odTrendHtml = prevScan ? trendBadge(od, prevScan.overdueActions, false) : '';

    /* one readiness tile per purchased framework, each with its own trend
       vs the per-framework readiness snapshotted at the last scan */
    var fwTiles = entitledFrameworks().map(function (fw) {
      var applicable = frameworkAppRows(fw);
      var impl = applicable.filter(function (c) { return c.st === 'Implemented'; }).length;
      var ready = window.CheckpointLib.readinessPct(applicable);
      var prevReady = prevScan && prevScan.readinessByFw ? prevScan.readinessByFw[fw] : undefined;
      return '<div class="card kpi"><div class="kpi-num"><b>' + ready + '<small>%</small></b>' + trendBadge(ready, prevReady, true) + '</div><span>Audit readiness — ' + esc(fwName(fw)) + '</span><div class="sub">' + impl + ' of ' + applicable.length + ' applicable controls implemented</div></div>';
    }).join('');
    document.getElementById('kpiRow').innerHTML = fwTiles +
      '<div class="card kpi"><div class="kpi-num"><b>' + (last ? last.score : '—') + (last ? '<small>/100</small>' : '') + '</b>' + scoreTrendHtml + '</div><span>Posture score</span><div class="sub">' + scoreBreakdownHtml + '</div></div>' +
      '<div class="card kpi"><div class="kpi-num"><b>' + crit + '</b>' + critTrendHtml + '</div><span>High / critical residual risks</span><div class="sub">' + S.risks.filter(function (r) { return r.status !== 'Closed'; }).length + ' open risks total</div></div>' +
      '<div class="card kpi"><div class="kpi-num"><b style="color:' + (od ? 'var(--fail)' : 'var(--gold-light)') + '">' + od + '</b>' + odTrendHtml + '</div><span>Overdue actions</span><div class="sub">' + (od ? ('0–7d: ' + b1 + ' · 8–30d: ' + b2 + ' · 30+d: ' + b3) : openActs.length + ' open actions') + '</div></div>';

    var covNoteEl = document.getElementById('coverageNote');
    if (covNoteEl) {
      var covCounts = automatableCheckCount();
      covNoteEl.textContent = CAP
        ? covCounts.automatable + ' of ' + covCounts.total + ' checks automatable in this tenant — see Coverage on the Posture scan view for what\'s licensed and what isn\'t.'
        : '';
    }

    /* risk appetite breach banner */
    var appetite = (S.settings && S.settings.riskAppetite) || 'Medium';
    var appetiteRank = SEV_RANK[appetite] || 2;
    var breaches = S.risks.filter(function (r) {
      if (r.status === 'Closed') return false;
      var q = residual(r);
      return SEV_RANK[band(q.L * q.I)] > appetiteRank;
    });
    var bannerEl = document.getElementById('appetiteBanner');
    if (bannerEl) {
      var appetiteFeatOn = featureOn('featAppetite');
      bannerEl.innerHTML = (appetiteFeatOn && breaches.length)
        ? '<b>' + breaches.length + ' risk' + (breaches.length > 1 ? 's' : '') + ' exceed' + (breaches.length > 1 ? '' : 's') + ' your risk appetite (' + appetite + ')</b> — ' + breaches.slice(0, 3).map(function (r) { return r.id; }).join(', ') + (breaches.length > 3 ? ' and ' + (breaches.length - 3) + ' more' : '') + '. <a href="#" data-action="App.go" data-id="risks" style="color:inherit;text-decoration:underline">Review the risk register →</a>'
        : '';
      bannerEl.style.display = (appetiteFeatOn && breaches.length) ? 'block' : 'none';
    }

    /* posture scan due — a nudge on load, not a real schedule, unless the
       optional Azure Function/Logic App monitor (SETUP.md § Continuous
       monitoring) is deployed in this tenant, in which case scans keep
       recording themselves whether or not anyone has the tab open. */
    var scanDueEl = document.getElementById('scanDueBanner');
    if (scanDueEl) {
      var cadence = parseInt((S.settings && S.settings.scanCadenceDays) || '30', 10) || 30;
      var sinceLast = last ? daysSince(last.date) : Infinity;
      var due = sinceLast >= cadence;
      scanDueEl.innerHTML = due
        ? '<b>Posture scan is overdue</b> — ' + (last ? 'last run ' + sinceLast + ' days ago' : 'none has ever been run') + ' (reminder set to every ' + cadence + ' days). <a href="#" data-action="App.go" data-id="scan" style="color:inherit;text-decoration:underline">Run it now →</a>'
        : '';
      scanDueEl.style.display = due ? 'block' : 'none';
    }

    /* email digest due — same on-load nudge as the scan-due banner
       above, not a real schedule: a browser tab can't send mail while
       nobody has it open. The scheduled Function/Logic App (SETUP.md
       § Continuous monitoring) can send this digest unattended once
       deployed; until then, a practitioner has to be looking at the
       Dashboard to be reminded to click "Send now". */
    var digestDueEl = document.getElementById('digestDueBanner');
    if (digestDueEl) {
      var digestOn = S.settings && S.settings.digestEnabled === 'true';
      var digestFreqDays = { Weekly: 7, Monthly: 30 }[(S.settings && S.settings.digestFrequency) || 'Weekly'] || 7;
      var sinceDigest = daysSince(S.settings && S.settings.digestLastSent);
      var digestDue = digestOn && sinceDigest >= digestFreqDays;
      digestDueEl.innerHTML = digestDue
        ? '<b>Compliance digest is due</b> — ' + (S.settings.digestLastSent ? 'last sent ' + sinceDigest + ' days ago' : 'never sent') + ' (frequency: ' + esc(S.settings.digestFrequency || 'Weekly') + '). Browser tabs can\'t send this unattended — <a href="#" data-action="App.sendDigestNow" style="color:inherit;text-decoration:underline">send it now</a>.'
        : '';
      digestDueEl.style.display = digestDue ? 'block' : 'none';
    }

    /* continuous monitoring — cadence/last-run status for the scheduled
       (application-permission) monitor, distinct from a scan run
       interactively from this browser, plus any pass -> fail drift it
       has flagged since the previous scan */
    var monitorEl = document.getElementById('monitorStatus');
    if (monitorEl) {
      var autoScans = S.scans.filter(function (s) { return s.source === 'automated'; });
      var lastAuto = autoScans[autoScans.length - 1];
      var cadence2 = parseInt((S.settings && S.settings.scanCadenceDays) || '30', 10) || 30;
      if (lastAuto) {
        var sinceAuto = daysSince(lastAuto.date);
        var autoOnTrack = sinceAuto < cadence2;
        monitorEl.innerHTML = '<div class="d-kv"><span>Last automated scan</span><b style="' + (autoOnTrack ? '' : 'color:var(--warn)') + '">' + fmtDate(lastAuto.date) + ' (' + sinceAuto + 'd ago)' + (autoOnTrack ? '' : ' ⚑ overdue') + '</b></div>' +
          '<div class="d-kv"><span>Reminder cadence</span><b>every ' + cadence2 + ' days</b></div>';
      } else {
        monitorEl.innerHTML = '<p style="color:var(--paper-dim);font-size:12.5px">No automated scans recorded yet. Deploy the scheduled monitor (SETUP.md § Continuous monitoring) to keep posture current in this tenant without anyone signed in.</p>';
      }
    }
    var driftEl = document.getElementById('driftPanel');
    if (driftEl) {
      var openAlerts = (S.alerts || []).filter(function (a) { return !a.ack; }).sort(function (a, b) { return (b.detected || '').localeCompare(a.detected || ''); });
      driftEl.innerHTML = openAlerts.length
        ? openAlerts.map(function (a) {
            return '<div class="card" style="padding:10px 14px;margin-bottom:8px;border-left:3px solid var(--fail)">' +
              '<div style="display:flex;justify-content:space-between;align-items:center;gap:10px">' +
              '<b>' + esc(a.label) + '</b>' +
              '<button class="btn ghost sm" data-action="App.acknowledgeAlert" data-id="' + a.id + '">Acknowledge</button>' +
              '</div>' +
              '<div class="d-kv" style="padding:2px 0"><span>' + esc(a.prev) + ' → <b style="color:var(--fail)">' + esc(a.next) + '</b></span><span>detected ' + fmtDate(a.detected) + '</span></div>' +
              (a.note ? '<div style="color:var(--paper-dim);font-size:11.5px;margin-top:2px">' + esc(a.note) + '</div>' : '') +
            '</div>';
          }).join('')
        : '<p style="color:var(--paper-dim);font-size:12.5px">No drift detected since your last scan.</p>';
    }

    /* governance card — internal audit programme + management review cadence */
    var govEl = document.getElementById('governanceCard');
    if (govEl) {
      var audits = S.audits || [], reviews = S.reviews || [];
      var lastAudit = audits.filter(function (a) { return a.status === 'Completed'; }).sort(function (a, b) { return (b.completed || '').localeCompare(a.completed || ''); })[0];
      var nextAudit = audits.filter(function (a) { return a.status === 'Planned'; }).sort(function (a, b) { return (a.planned || '').localeCompare(b.planned || ''); })[0];
      var lastReview = reviews[reviews.length - 1];
      var reviewOverdue = lastReview && lastReview.nextDue && lastReview.nextDue < new Date().toISOString().slice(0, 10);
      var today2 = new Date().toISOString().slice(0, 10);
      var upcomingCal = (S.calendar || []).filter(function (c) { return c.status !== 'Done'; }).sort(function (a, b) { return (a.nextDue || '').localeCompare(b.nextDue || ''); })[0];
      var calOverdue = upcomingCal && upcomingCal.nextDue && upcomingCal.nextDue < today2;
      var overdueVendorList = (S.vendors || []).filter(vendorOverdue);
      govEl.innerHTML =
        '<div class="d-kv"><span>Last internal audit</span><b>' + (lastAudit ? fmtDate(lastAudit.completed) + ' — ' + esc(lastAudit.scope) : 'None recorded') + '</b></div>' +
        '<div class="d-kv"><span>Next internal audit</span><b>' + (nextAudit ? fmtDate(nextAudit.planned) + ' — ' + esc(nextAudit.scope) : 'None scheduled') + '</b></div>' +
        '<div class="d-kv"><span>Last management review</span><b>' + (lastReview ? fmtDate(lastReview.date) : 'None recorded') + '</b></div>' +
        '<div class="d-kv"><span>Next review due</span><b style="' + (reviewOverdue ? 'color:var(--fail)' : '') + '">' + (lastReview && lastReview.nextDue ? fmtDate(lastReview.nextDue) + (reviewOverdue ? ' ⚑ overdue' : '') : 'Not set') + '</b></div>' +
        '<div class="d-kv"><span>Next ISMS activity</span><b style="' + (calOverdue ? 'color:var(--fail)' : '') + '">' + (upcomingCal ? fmtDate(upcomingCal.nextDue) + ' — ' + esc(upcomingCal.title) + (calOverdue ? ' ⚑' : '') : 'None scheduled') + '</b></div>' +
        '<div class="d-kv"><span>Vendor reviews overdue</span><b style="' + (overdueVendorList.length ? 'color:var(--fail)' : '') + '">' + (overdueVendorList.length ? overdueVendorList.length + ' ⚑ — ' + overdueVendorList.slice(0, 2).map(function (v) { return esc(v.name); }).join(', ') + (overdueVendorList.length > 2 ? ' +' + (overdueVendorList.length - 2) + ' more' : '') : 'None') + '</b></div>';
    }

    /* certification roadmap — primary entitled framework */
    var roadmapCard = document.getElementById('roadmapCard');
    var roadmapEl = document.getElementById('roadmap');
    if (roadmapCard) roadmapCard.style.display = featureOn('featRoadmap') ? '' : 'none';
    if (roadmapEl && featureOn('featRoadmap')) {
      var entitled = entitledFrameworks();
      if (!entitled.length) {
        roadmapEl.innerHTML = '<p style="color:var(--paper-faint);font-size:13px">Enable a framework to see its certification roadmap.</p>';
      } else {
        var primaryFw = entitled.indexOf('iso27001') > -1 ? 'iso27001' : entitled[0];
        var pApp = frameworkAppRows(primaryFw);
        var pImpl = pApp.filter(function (c) { return c.st === 'Implemented'; });
        var implPct = pApp.length ? Math.round(pImpl.length / pApp.length * 100) : 0;
        /* same denominator as Implement (all applicable controls), so
           Evidence can never read higher than Implement — a proper funnel */
        var evidencedCount = pImpl.filter(function (c) { return c.verified || c.evidenceUrl; }).length;
        var evidencedPct = pApp.length ? Math.round(evidencedCount / pApp.length * 100) : 0;
        var certifyPct = (implPct === 100 && evidencedPct === 100) ? 100 : 0;
        var phases = [
          { name: 'Assess', pct: 100 },
          { name: 'Implement', pct: implPct },
          { name: 'Evidence', pct: evidencedPct },
          { name: 'Certify', pct: certifyPct }
        ];
        roadmapEl.innerHTML = '<div class="roadmap-label">' + esc(fwName(primaryFw)) + '</div><div class="roadmap-track">' +
          phases.map(function (p, i) {
            return '<div class="roadmap-phase' + (p.pct === 100 ? ' done' : p.pct > 0 ? ' active' : '') + '"><div class="roadmap-fill" style="width:' + p.pct + '%"></div><span>' + (i + 1) + '. ' + p.name + '</span><b>' + p.pct + '%</b></div>';
          }).join('') + '</div>';
      }
    }

    /* heatmap — colored by the cell's own severity band (fixed RAG scale,
       same meaning everywhere) with fill strength showing risk count,
       not a single hue whose only signal is density */
    var counts = {};
    S.risks.forEach(function (r) { if (r.status === 'Closed') return; var q = residual(r); var k = q.L + '-' + q.I; counts[k] = (counts[k] || 0) + 1; });
    var h = '<div class="lab"></div>';
    for (var L = 1; L <= 5; L++) h += '<div class="lab">L' + L + '</div>';
    for (var I = 5; I >= 1; I--) {
      h += '<div class="lab">I' + I + '</div>';
      for (var L2 = 1; L2 <= 5; L2++) {
        var n = counts[L2 + '-' + I] || 0;
        var sev = band(L2 * I);
        var rgb = SEV_RGB[sev];
        var alpha = n === 0 ? 0.12 : n === 1 ? 0.42 : n === 2 ? 0.62 : 0.82;
        var textColor = n === 0 ? 'var(--paper-faint)' : SEV_TEXT[sev];
        h += '<div class="cell" style="background:rgba(' + rgb + ',' + alpha + ');color:' + textColor + '" title="Likelihood ' + L2 + ' × Impact ' + I + ' — ' + sev + (n ? ' — ' + n + ' risk' + (n > 1 ? 's' : '') : '') + '">' + (n || '') + '</div>';
      }
    }
    document.getElementById('heat').innerHTML = h;
    var legendEl = document.getElementById('heatLegend');
    if (legendEl) {
      legendEl.innerHTML = ['Low', 'Medium', 'High', 'Critical'].map(function (sev) {
        return '<span><i style="background:rgba(' + SEV_RGB[sev] + ',.75)"></i>' + sev + '</span>';
      }).join('');
    }
    /* spark — posture score (gold) + control readiness (light gold), where
       recorded. The svg stretches non-uniformly (preserveAspectRatio="none")
       so text inside it would distort — value/date labels live in the HTML
       caption above it instead. */
    var sparkCapEl = document.getElementById('sparkCaption');
    if (S.scans.length) {
      var n2 = S.scans.length;
      var firstScan = S.scans[0], lastScan = S.scans[n2 - 1];
      if (sparkCapEl) {
        if (n2 > 1) {
          var deltaAll = lastScan.score - firstScan.score;
          sparkCapEl.innerHTML =
            '<span>' + fmtDate(firstScan.date) + ' · <b>' + firstScan.score + '</b></span>' +
            '<span style="color:' + (deltaAll >= 0 ? 'var(--pass)' : 'var(--fail)') + ';font-weight:800">' + (deltaAll > 0 ? '▲' : deltaAll < 0 ? '▼' : '—') + (deltaAll ? Math.abs(deltaAll) : '') + ' over ' + n2 + ' scan' + (n2 > 1 ? 's' : '') + '</span>' +
            '<span>' + fmtDate(lastScan.date) + ' · <b class="gold-t">' + lastScan.score + '</b></span>';
        } else {
          sparkCapEl.innerHTML = '<span>First scan — <b class="gold-t">' + lastScan.score + '/100</b> (' + fmtDate(lastScan.date) + ')</span>';
        }
      }
      var trendFeatOn = featureOn('featTrend');
      var readinessScans = S.scans.filter(function (s) { return typeof s.readiness === 'number'; });
      if (n2 > 1) {
        var pts = S.scans.map(function (s, i) { return [(i / (n2 - 1)) * 292 + 4, 60 - (s.score / 100) * 56]; });
        var line = pts.map(function (p) { return p[0] + ',' + p[1]; }).join(' ');
        var lastP = pts[pts.length - 1], firstP = pts[0];
        var area = '<polygon points="' + line + ' ' + lastP[0] + ',60 ' + firstP[0] + ',60" fill="rgba(169,129,46,.12)"/>';
        var readyLine = '';
        if (trendFeatOn && readinessScans.length > 1) {
          var rPts = S.scans.map(function (s, i) {
            var r = typeof s.readiness === 'number' ? s.readiness : null;
            return r === null ? null : [(i / (n2 - 1)) * 292 + 4, 60 - (r / 100) * 56];
          }).filter(Boolean);
          readyLine = '<polyline points="' + rPts.map(function (p) { return p[0] + ',' + p[1]; }).join(' ') + '" fill="none" stroke="rgba(216,186,120,.55)" stroke-width="1.5" stroke-dasharray="3,3"/>';
        }
        document.getElementById('spark').innerHTML = area + readyLine +
          '<polyline points="' + line + '" fill="none" stroke="#A9812E" stroke-width="2"/>' +
          '<circle cx="' + firstP[0] + '" cy="' + firstP[1] + '" r="3" fill="rgba(216,186,120,.5)"/>' +
          '<circle cx="' + lastP[0] + '" cy="' + lastP[1] + '" r="4" fill="#D8BA78"/>';
        document.getElementById('sparkLegend').style.display = (trendFeatOn && readinessScans.length > 1) ? 'flex' : 'none';
      } else {
        document.getElementById('spark').innerHTML = '<circle cx="150" cy="' + (60 - (lastScan.score / 100) * 56) + '" r="4" fill="#D8BA78"/>';
        document.getElementById('sparkLegend').style.display = 'none';
      }
    } else {
      if (sparkCapEl) sparkCapEl.innerHTML = '<span>No scans yet — run one from the sidebar</span>';
      document.getElementById('spark').innerHTML = '';
    }
    /* feed */
    document.getElementById('feed').innerHTML = S.activity.slice(0, 10).map(function (a) {
      return '<li><time>' + fmtDate(a.t) + '</time>' + a.msg + '</li>';
    }).join('') || '<li style="color:var(--paper-faint)">No activity yet.</li>';
  }

  function renderScanChecks(instant) {
    var el = document.getElementById('checkList');
    var areas = [], byArea = {};
    window.CHECK_DEFS.forEach(function (c) {
      if (!byArea[c.area]) { byArea[c.area] = []; areas.push(c.area); }
      byArea[c.area].push(c);
    });
    el.innerHTML = areas.map(function (area) {
      return '<div class="check-area">' + esc(area) + '</div>' + byArea[area].map(function (c) {
        var r = checkResult(c);
        var cls = r === 'pass' ? 'st-Implemented' : r === 'review' ? 'st-Intreatment' : r === 'fail' ? 'st-Open' : r === 'manual' ? 'st-Proposed' : 'st-Notstarted';
        var lbl = r === 'pass' ? 'Pass' : r === 'review' ? 'Review' : r === 'fail' ? 'Fail' : r === 'manual' ? 'Manual — verify' : 'Not scanned';
        var note = (S.lastNotes && S.lastNotes[c.id]) ? '<div class="src" style="margin-top:2px">' + esc(S.lastNotes[c.id]) + '</div>' : '';
        return '<div class="check-row' + (instant ? ' show' : '') + '"><span class="lbl">' + c.label + note + '</span><span class="chip ' + cls + '">' + lbl + '</span></div>';
      }).join('');
    }).join('');
  }

  /* "Coverage" card — what CAP (see detectAppCapabilities()) found this
     tenant can and can't answer automatically. Available/Not licensed/
     No access per area, each with the same plain-language note
     runPostureChecks() uses for the checks that area gates. */
  function renderCoverage() {
    var el = document.getElementById('coverageRows');
    if (!el) return;
    if (!CAP) {
      el.innerHTML = '<p style="color:var(--paper-faint);font-size:12.5px">Coverage check hasn\'t run yet.</p>';
      return;
    }
    var keys = ['conditionalAccess', 'identityProtection', 'pim', 'intune', 'secureScore'];
    el.innerHTML = keys.map(function (k) {
      var c = CAP[k];
      if (!c) return '';
      var label = c.available ? 'Available' : (c.status === 'noAccess' ? 'No access' : 'Not licensed');
      return '<div class="wiz-cap-row"><div><div class="wiz-cap-label">' + esc(c.label) + ' <span class="src">(' + esc(c.licence) + ')</span></div>' +
        (c.note ? '<div class="wiz-cap-note">' + esc(c.note) + '</div>' : '') + '</div>' +
        '<span class="chip ' + (c.available ? 'st-Implemented' : 'st-Notstarted') + '">' + esc(label) + '</span></div>';
    }).join('');
  }

  /* Hidden diagnostics view — window.CheckpointSelfTest.run() (see
     selftest.js) against demo mode is the only place this ever runs;
     both bootUi() (SELFTEST_MODE) and this function itself refuse
     outside demo, so there's no path where a live tenant's session
     ever executes or displays these checks. Never a substitute for
     ACCEPTANCE.md's manual pass — see this view's own vhead copy. */
  async function renderSelfTest() {
    var rowsEl = document.getElementById('selftestRows');
    var summaryEl = document.getElementById('selftestSummary');
    if (!rowsEl) return;
    if (Store.kind !== 'demo' || typeof window.CheckpointSelfTest === 'undefined') {
      rowsEl.innerHTML = '<tr><td colspan="4" style="color:var(--paper-faint)">Self-test only runs in demo mode.</td></tr>';
      if (summaryEl) summaryEl.textContent = '';
      return;
    }
    if (summaryEl) summaryEl.textContent = 'Running…';
    rowsEl.innerHTML = '';
    var results;
    try { results = await window.CheckpointSelfTest.run(); } catch (e) { warn(e); results = [{ group: 'Self-test', name: 'run() completed without throwing', pass: false, detail: (e && e.message) || String(e) }]; }
    var failCount = results.filter(function (r) { return !r.pass; }).length;
    if (summaryEl) {
      summaryEl.textContent = failCount ? (failCount + ' of ' + results.length + ' check(s) failed') : ('All ' + results.length + ' checks passed');
      summaryEl.style.color = failCount ? 'var(--fail)' : 'var(--pass)';
    }
    rowsEl.innerHTML = results.map(function (r) {
      return '<tr><td><span class="chip ' + (r.pass ? 'st-Implemented' : 'st-Open') + '">' + (r.pass ? 'Pass' : 'Fail') + '</span></td>' +
        '<td>' + esc(r.group) + '</td><td>' + esc(r.name) + '</td><td style="color:var(--paper-faint);font-size:11.5px">' + esc(r.detail || '') + '</td></tr>';
    }).join('');
  }

  /* ================= Partner Console =================
     Partner-only internal view — reachable only once its nav item is
     shown (renderFeatureVisibility() gates that on licence type
     'partner'). Runs in OUR OWN tenant's Checkpoint instance and
     stores its data as SharePoint lists in OUR OWN tenant (store.js's
     PartnerClients/PartnerEntitlements, prefixed 'Checkpoint Partner'
     — see its own comment there) — never a client's. Folds in what
     used to be the separate, localStorage-only Portfolio view (see
     migratePortfolioIfNeeded() below): the client roster, the sync-a-
     client-tenant's-live-summary pattern, all of it now persisted
     here instead of one browser's local storage. */
  var PARTNER_DATA = null; /* { clients: [...], entitlements: [...] } — null until first loaded */

  function partnerModuleChips(moduleIds) {
    if (!moduleIds || !moduleIds.length) return '<span style="color:var(--paper-faint);font-size:11px">None</span>';
    return '<span class="fw-chips">' + moduleIds.map(function (fw) { return '<span>' + esc(fwName(fw)) + '</span>'; }).join('') + '</span>';
  }
  function partnerDaysUntil(dateStr) {
    if (!dateStr) return null;
    return window.CheckpointLib.daysBetweenDateStr(new Date().toISOString().slice(0, 10), dateStr);
  }
  /* 30/60/90-day renewal flag (task spec) — a gradient of urgency
     within the SAME 90-day window the renewals panel covers, not a
     risk-severity judgement, so this deliberately does NOT reuse the
     sev-Critical/High/Medium/Low chip classes elsewhere in this app
     (those mean something specific about risk scoring; reusing them
     here for "months until renewal" would be a false semantic
     borrow) — plain inline colour from the same CSS custom properties
     instead. */
  function partnerRenewalFlag(days) {
    if (days == null) return { color: 'var(--paper-faint)', label: 'No record' };
    if (days < 0) return { color: 'var(--fail)', label: 'Expired ' + Math.abs(days) + 'd ago' };
    if (days <= 30) return { color: 'var(--fail)', label: days + 'd remaining' };
    if (days <= 60) return { color: 'var(--warn)', label: days + 'd remaining' };
    if (days <= 90) return { color: 'var(--gold-light)', label: days + 'd remaining' };
    return { color: 'var(--paper-dim)', label: days + 'd remaining' };
  }
  function partnerLatestEntitlementFor(tenantId) {
    var matches = (PARTNER_DATA.entitlements || []).filter(function (e) { return e.tenantId === tenantId; });
    if (!matches.length) return null;
    return matches.slice().sort(function (a, b) { return (b.issuedAt || '').localeCompare(a.issuedAt || ''); })[0];
  }
  /* RAG health at a glance — adapted from the old Portfolio view's
     statusOf(), same signal (sync error > never synced > not
     onboarded > drift/score thresholds > healthy), reading the new
     PartnerClients snapshot fields instead of a localStorage object. */
  function partnerHealthOf(c) {
    if (c.syncError) return { color: 'var(--fail)', label: 'Sync error' };
    if (!c.lastSynced) return { color: 'var(--paper-faint)', label: 'Not synced yet' };
    if (!c.onboarded) return { color: 'var(--paper-faint)', label: 'Not yet onboarded' };
    if ((c.driftAlerts || 0) >= 1 || (c.score != null && c.score < 40)) return { color: 'var(--fail)', label: 'Needs attention' };
    if (c.score != null && c.score < 70) return { color: 'var(--warn)', label: 'Watch' };
    return { color: 'var(--pass)', label: 'Healthy' };
  }

  /* One-time migration from the old Portfolio view's localStorage —
     'checkpoint-portfolio-v1' held { clients: [{ id, name, tenantId,
     lastSynced, score, readiness, criticalRisks, onboarded, error }] }
     in whichever browser last used it, bookkeeping only, never any
     client's real data. Folds each entry into a real PartnerClients
     row in OUR tenant, then stops using localStorage for this
     entirely — tracked via a Settings flag (this tenant's own
     Settings list, same generic mechanism every other per-tenant
     setting uses) so it only ever runs once per tenant, regardless of
     how many browsers/practitioners open Partner Console afterwards. */
  async function migratePortfolioIfNeeded() {
    if (Store.kind !== 'sharepoint') return;
    if (S.settings && S.settings.portfolioMigratedToPartnerConsole === 'true') return;
    var raw;
    try { raw = localStorage.getItem('checkpoint-portfolio-v1'); } catch (e) { raw = null; }
    var data = null;
    if (raw) { try { data = JSON.parse(raw); } catch (e) { data = null; } }
    var oldClients = (data && data.clients) || [];
    for (var i = 0; i < oldClients.length; i++) {
      var old = oldClients[i];
      var c = {
        name: old.name || old.tenantId, tenantId: old.tenantId,
        status: old.lastSynced ? (old.onboarded === false ? 'Prospect' : 'Active') : 'Prospect',
        contactName: '', contactEmail: '', notes: 'Migrated from the old Portfolio view.',
        modules: [], lastSynced: old.lastSynced || '', lastSyncedBy: '', onboarded: !!old.onboarded,
        score: typeof old.score === 'number' ? old.score : null, lastScanDate: '',
        readinessByFw: typeof old.readiness === 'number' ? { iso27001: old.readiness } : {},
        appVersion: '', driftAlerts: old.criticalRisks || 0, syncError: old.error || ''
      };
      try { await Store.addPartnerClient(c); } catch (e) { warn(e); }
    }
    try { await Store.setSetting('portfolioMigratedToPartnerConsole', 'true'); S.settings.portfolioMigratedToPartnerConsole = 'true'; } catch (e) { warn(e); }
    try { localStorage.removeItem('checkpoint-portfolio-v1'); } catch (e) { /* private browsing etc. — not fatal, the migrated data is what matters */ }
    if (oldClients.length) audit('Portfolio data migrated to Partner Console', 'PartnerClient', '', '', oldClients.length + ' client(s) migrated');
  }

  async function renderPartnerClientRows() {
    var tbody = document.getElementById('partnerClientRows');
    if (!tbody) return;
    var clients = (PARTNER_DATA && PARTNER_DATA.clients) || [];
    if (!clients.length) { tbody.innerHTML = '<tr><td colspan="6" style="color:var(--paper-faint)">No clients yet — use “+ Add client” above.</td></tr>'; return; }
    tbody.innerHTML = clients.map(function (c) {
      var ent = partnerLatestEntitlementFor(c.tenantId);
      var days = ent ? partnerDaysUntil(ent.expiry) : null;
      var flag = partnerRenewalFlag(days);
      var health = partnerHealthOf(c);
      return '<tr>' +
        '<td class="id-t"><button class="lnk" data-action="App.partnerOpenClientDrawer" data-id="' + esc(c._sp) + '" style="font-weight:700;font-size:13px">' + esc(c.name) + '</button>' +
        '<div class="src">' + esc(c.tenantId) + '</div></td>' +
        '<td><select class="mini" data-change-action="App.partnerSetClientStatus" data-id="' + esc(c._sp) + '">' +
        ['Prospect', 'Trial', 'Active', 'Expired', 'Churned'].map(function (s) { return '<option' + (c.status === s ? ' selected' : '') + '>' + s + '</option>'; }).join('') +
        '</select></td>' +
        '<td>' + partnerModuleChips(c.modules) + '</td>' +
        '<td style="color:' + flag.color + ';white-space:nowrap">' + (ent ? esc(fmtDate(ent.expiry)) : 'No record') + (ent ? '<div class="src" style="color:' + flag.color + '">' + esc(flag.label) + '</div>' : '') + '</td>' +
        '<td><i class="dot" style="background:' + health.color + ';margin-right:6px;vertical-align:middle" title="' + esc(health.label) + '"></i>' + (c.lastSynced ? esc(fmtDate(c.lastSynced)) : 'Never') + '</td>' +
        '<td style="white-space:nowrap"><button class="btn sm" data-action="App.partnerSyncClient" data-id="' + esc(c._sp) + '" id="partnerSync-' + esc(c._sp) + '">Sync</button> <button class="btn ghost sm" data-action="App.partnerRemoveClient" data-id="' + esc(c._sp) + '">Remove</button></td>' +
        '</tr>';
    }).join('');
  }

  function renderPartnerRenewals() {
    var el = document.getElementById('partnerRenewalsWrap');
    if (!el) return;
    var clients = (PARTNER_DATA && PARTNER_DATA.clients) || [];
    var rows = clients.map(function (c) {
      var ent = partnerLatestEntitlementFor(c.tenantId);
      if (!ent) return null;
      var days = partnerDaysUntil(ent.expiry);
      if (days == null || days > 90) return null;
      return { client: c, ent: ent, days: days };
    }).filter(Boolean).sort(function (a, b) { return a.days - b.days; });
    if (!rows.length) { el.innerHTML = '<h3 style="margin-bottom:10px">Renewals — next 90 days</h3><div class="card" style="color:var(--paper-dim);font-size:12.5px">Nothing expiring in the next 90 days.</div>'; return; }
    el.innerHTML = '<h3 style="margin-bottom:10px">Renewals — next 90 days (' + rows.length + ')</h3><div class="card" style="padding:0 10px;overflow-x:auto"><table><thead><tr><th scope="col">Client</th><th scope="col">Type</th><th scope="col">Modules</th><th scope="col">Expiry</th><th scope="col">Time left</th></tr></thead><tbody>' +
      rows.map(function (r) {
        var flag = partnerRenewalFlag(r.days);
        return '<tr><td>' + esc(r.client.name) + '</td><td>' + esc(r.ent.type) + '</td><td>' + partnerModuleChips(r.ent.modules) + '</td><td>' + esc(fmtDate(r.ent.expiry)) + '</td><td style="color:' + flag.color + ';font-weight:700">' + esc(flag.label) + '</td></tr>';
      }).join('') + '</tbody></table></div>';
  }

  /* The "upsell view": blank = not licensed at all (an upsell target);
     ● = licensed AND actively enabled in the client's own Entitlements
     list as of last sync; ○ = licensed but not (yet) turned on there
     — worth a check-in call, not necessarily an upsell. Falls back to
     the synced modules themselves (rather than an entitlement record)
     when no PartnerEntitlements row exists yet for that tenant, so a
     client added before this feature — or synced without ever having
     had `--record` run for them — still shows something rather than
     an all-blank row. */
  function renderPartnerMatrix() {
    var el = document.getElementById('partnerMatrixWrap');
    if (!el) return;
    var clients = (PARTNER_DATA && PARTNER_DATA.clients) || [];
    if (!clients.length) { el.innerHTML = '<p style="color:var(--paper-faint);font-size:12.5px;padding:16px">No clients yet.</p>'; return; }
    var fws = window.FRAMEWORK_ORDER;
    el.innerHTML = '<table><thead><tr><th scope="col">Client</th>' + fws.map(function (fw) { return '<th scope="col" style="text-align:center">' + esc(fwName(fw)) + '</th>'; }).join('') + '</tr></thead><tbody>' +
      clients.map(function (c) {
        var ent = partnerLatestEntitlementFor(c.tenantId);
        var licensed = ent ? ent.modules : c.modules;
        return '<tr><td><b>' + esc(c.name) + '</b></td>' + fws.map(function (fw) {
          if (licensed.indexOf(fw) === -1) return '<td style="text-align:center;color:var(--paper-faint)">—</td>';
          var used = c.modules.indexOf(fw) !== -1;
          return used
            ? '<td style="text-align:center;color:var(--pass);font-weight:800" title="Licensed and active in their tenant">●</td>'
            : '<td style="text-align:center;color:var(--warn)" title="Licensed, not yet active in their tenant">○</td>';
        }).join('') + '</tr>';
      }).join('') + '</tbody></table>';
  }

  async function loadPartnerConsoleData(onStatus) {
    PARTNER_DATA = await Store.loadPartnerConsole(onStatus);
  }

  async function renderPartnerConsole() {
    var rowsEl = document.getElementById('partnerClientRows');
    if (!rowsEl) return;
    if (currentEntitlementType() !== 'partner') return; /* belt-and-braces — the nav item is already hidden, but never load/show this data outside a partner session */
    if (!PARTNER_DATA) {
      rowsEl.innerHTML = '<tr><td colspan="6" style="color:var(--paper-faint)">Loading…</td></tr>';
      try {
        await migratePortfolioIfNeeded();
        await loadPartnerConsoleData();
      } catch (e) {
        warn(e);
        rowsEl.innerHTML = '<tr><td colspan="6" style="color:var(--fail)">Could not load Partner Console data: ' + esc(e.message || e) + '</td></tr>';
        return;
      }
    }
    renderPartnerClientRows();
    renderPartnerRenewals();
    renderPartnerMatrix();
  }

  /* Evolves the old Portfolio.fetchSummary() pattern: its own
     throwaway MSAL instance (sessionStorage cache, never the shared
     session — a sync can never overwrite or corrupt whichever tenant
     is currently signed in for the rest of the console), delegated
     sign-in TO THE CLIENT TENANT, reading their own Checkpoint lists —
     but now also Entitlements (which modules they've actually turned
     on) and Settings' lastSeenVersion (a proxy for "what build they
     were last using"), and readiness PER FRAMEWORK rather than
     iso27001 only. Nothing here is written back to the client's
     tenant — read-only Graph calls throughout. */
  async function partnerFetchClientSummary(tenantId) {
    if (!CONFIG.clientId) throw new Error('No app registration configured');
    var msalApp = new msal.PublicClientApplication({
      auth: { clientId: CONFIG.clientId, authority: 'https://login.microsoftonline.com/' + tenantId, redirectUri: location.origin + location.pathname },
      cache: { cacheLocation: 'sessionStorage' }
    });
    await msalApp.initialize();
    var res = await msalApp.loginPopup({ scopes: ['User.Read', 'Sites.Read.All'], prompt: 'select_account' });
    var token = res.accessToken;
    var signedInAs = (res.account && (res.account.username || res.account.name)) || 'Unknown';

    async function g(path) {
      var r = await fetch('https://graph.microsoft.com/v1.0' + path, { headers: { Authorization: 'Bearer ' + token } });
      if (!r.ok) { var e = new Error('Graph ' + r.status); e.status = r.status; throw e; }
      return r.json();
    }

    var out = { name: '', onboarded: false, modules: [], score: null, scanDate: null, readinessByFw: {}, driftAlerts: 0, appVersion: '', signedInAs: signedInAs };
    try { var org = await g('/organization?$select=displayName'); out.name = (org.value && org.value[0] && org.value[0].displayName) || tenantId; } catch (e) { /* keep tenantId as the display name */ }

    try {
      var site = await g('/sites/root?$select=id');
      var siteLists = (await g('/sites/' + site.id + '/lists?$select=id,displayName&$top=200')).value || [];
      function findList(suffix) { return siteLists.find(function (l) { return l.displayName === CONFIG.listPrefix + ' ' + suffix; }); }
      var ctlList = findList('Controls'), entList = findList('Entitlements'), scanList = findList('Scans'), setList = findList('Settings'), alertList = findList('Alerts');

      if (ctlList) {
        out.onboarded = true;
        var ctlItems = (await g('/sites/' + site.id + '/lists/' + ctlList.id + '/items?$expand=fields&$top=400')).value || [];
        var byFw = {};
        ctlItems.forEach(function (i) {
          var f = i.fields, fw = f.Framework || 'iso27001';
          if (!f.Applicable) return;
          (byFw[fw] = byFw[fw] || []).push(f.Status === 'Implemented');
        });
        Object.keys(byFw).forEach(function (fw) {
          var arr = byFw[fw];
          out.readinessByFw[fw] = arr.length ? Math.round(arr.filter(Boolean).length / arr.length * 100) : 0;
        });
      }
      if (entList) {
        var entItems = (await g('/sites/' + site.id + '/lists/' + entList.id + '/items?$expand=fields&$top=200')).value || [];
        out.modules = entItems.filter(function (i) { return i.fields.Enabled; }).map(function (i) { return i.fields.FrameworkId; }).filter(Boolean);
      }
      if (scanList) {
        var scanItems = (await g('/sites/' + site.id + '/lists/' + scanList.id + '/items?$expand=fields&$top=200')).value || [];
        scanItems.sort(function (a, b) { return (a.fields.ScanDate || '').localeCompare(b.fields.ScanDate || ''); });
        var last = scanItems[scanItems.length - 1];
        if (last) { out.score = last.fields.Score || 0; out.scanDate = last.fields.ScanDate || null; }
      }
      if (setList) {
        var setItems = (await g('/sites/' + site.id + '/lists/' + setList.id + '/items?$expand=fields&$top=200')).value || [];
        var verRow = setItems.find(function (i) { return i.fields.SettingKey === 'lastSeenVersion'; });
        out.appVersion = (verRow && verRow.fields.SettingValue) || '';
      }
      if (alertList) {
        var alertItems = (await g('/sites/' + site.id + '/lists/' + alertList.id + '/items?$expand=fields&$top=200')).value || [];
        out.driftAlerts = alertItems.filter(function (i) { return !i.fields.Acknowledged; }).length;
      }
    } catch (e) { /* Checkpoint not provisioned in this tenant yet (or a specific list read failed) — leave out.onboarded reflecting what was actually found */ }

    try { await msalApp.clearCache(); } catch (e) { /* best-effort teardown only */ }
    return out;
  }

  function renderProposed() {
    var w = document.getElementById('proposedWrap');
    if (!S.proposed.length) {
      w.innerHTML = S.lastResults ? '<div class="card" style="color:var(--paper-dim);font-size:13px">No new findings require risk treatment. Existing register covers current posture.</div>' : '';
      return;
    }
    w.innerHTML = '<div class="card"><h3>Proposed for the register — practitioner approval required</h3>' + S.proposed.map(function (p) {
      var t = TPL[p];
      return '<div class="proposed-card"><h4>' + esc(t.risk.title) + '</h4>' +
        '<div class="meta">Inherent <b>' + t.risk.L + ' × ' + t.risk.I + ' — ' + band(t.risk.L * t.risk.I) + '</b> · Controls <b>' + t.risk.controls.join(', ') + '</b> · ' + t.actions.length + ' remediation action' + (t.actions.length > 1 ? 's' : '') + ' will be created and assigned</div>' +
        '<button class="btn sm" data-action="App.approve" data-id="' + p + '">Approve → register</button> ' +
        '<button class="btn ghost sm" data-action="App.dismiss" data-id="' + p + '">Dismiss</button></div>';
    }).join('') + '</div>';
  }

  function renderRisks() {
    var f = window._riskF || 'All';
    document.getElementById('riskFilters').innerHTML = ['All', 'Critical', 'High', 'Medium', 'Low'].map(function (x) {
      return '<button class="f-pill' + (f === x ? ' on' : '') + '" aria-pressed="' + (f === x ? 'true' : 'false') + '" data-action="App.filterRisk" data-id="' + x + '">' + x + '</button>';
    }).join('');
    var rows = S.risks.filter(function (r) {
      if (f === 'All') return true; var q = residual(r); return band(q.L * q.I) === f;
    }).map(function (r) {
      var q = residual(r), ib = band(r.L * r.I), rb = band(q.L * q.I);
      return '<tr data-id="' + r.id + '" data-action="App.openRisk"><td class="id-t"><button class="lnk" data-action="App.openRisk" data-id="' + r.id + '">' + r.id + '</button></td><td style="color:var(--paper)">' + esc(r.title) + '</td><td>' + esc(r.cat) + '</td><td class="src">' + esc(r.src) + '</td>' +
        '<td><span class="chip sev-' + ib + '">' + (r.L * r.I) + ' ' + ib + '</span></td><td><span class="chip sev-' + rb + '">' + (q.L * q.I) + ' ' + rb + '</span></td>' +
        '<td>' + esc(r.owner) + '</td><td><span class="chip st-' + r.status.replace(/ /g, '') + '">' + r.status + '</span></td></tr>';
    }).join('');
    document.getElementById('riskRows').innerHTML = rows || '<tr><td colspan="8" style="color:var(--paper-faint)">No risks in this band. The register builds as scans are approved and workshops are captured.</td></tr>';
  }

  var ACTION_TYPES = ['Action', 'Non-conformity (Major)', 'Non-conformity (Minor)', 'Observation'];
  function typeCls(t) {
    if (t === 'Non-conformity (Major)') return 'sev-Critical';
    if (t === 'Non-conformity (Minor)') return 'sev-Medium';
    if (t === 'Observation') return 'sev-Low';
    return 'st-Notstarted';
  }

  function renderActions() {
    var f = window._actF || 'Open';
    var tf = window._actTypeF || 'All';
    document.getElementById('actFilters').innerHTML = ['Open', 'Overdue', 'Done', 'All'].map(function (x) {
      return '<button class="f-pill' + (f === x ? ' on' : '') + '" aria-pressed="' + (f === x ? 'true' : 'false') + '" data-action="App.filterAct" data-id="' + x + '">' + x + '</button>';
    }).join('');
    document.getElementById('actTypeFilters').innerHTML = ['All'].concat(ACTION_TYPES).map(function (x) {
      return '<button class="f-pill' + (tf === x ? ' on' : '') + '" aria-pressed="' + (tf === x ? 'true' : 'false') + '" data-action="App.filterActType" data-id="' + x + '">' + x + '</button>';
    }).join('');
    var rows = S.actions.filter(function (a) {
      if (tf !== 'All' && (a.type || 'Action') !== tf) return false;
      if (f === 'All') return true; if (f === 'Done') return a.status === 'Done';
      if (f === 'Overdue') return overdue(a); return a.status !== 'Done';
    }).map(function (a) {
      var od = overdue(a);
      var days = overdueDays(a);
      var type = a.type || 'Action';
      var evidenceCell = (a.evidenceUrl && isSafeUrl(a.evidenceUrl))
        ? '<a href="' + esc(a.evidenceUrl) + '" target="_blank" rel="noopener" class="evidence-link">Evidence ↗</a>'
        : '<button class="btn ghost sm" data-action="App.setActionEvidence" data-id="' + a.id + '">Link</button>';
      return '<tr data-id="' + a.id + '"><td class="id-t">' + a.id + '</td><td style="color:var(--paper)">' + esc(a.title) + '</td>' +
        '<td><span class="chip ' + typeCls(type) + '">' + esc(type) + '</span></td>' +
        '<td class="id-t">' + esc(a.risk || '—') + '</td><td class="id-t">' + esc(a.control || '—') + '</td>' +
        '<td><span class="chip sev-' + (a.pr === 'Critical' ? 'Critical' : a.pr) + '">' + a.pr + '</span></td><td>' + esc(a.owner) + '</td>' +
        '<td style="color:' + (od ? 'var(--fail)' : 'inherit') + '">' + fmtDate(a.due) + (od ? ' ⚑ ' + days + 'd' : '') + '</td>' +
        '<td><span class="chip st-' + a.status.replace(/ /g, '') + '">' + a.status + '</span></td>' +
        '<td>' + evidenceCell + '</td>' +
        '<td>' + (a.status !== 'Done' ? '<button class="btn sm" data-action="App.complete" data-id="' + a.id + '">Complete</button>' : '<span class="src">Done ✓</span>') + '</td></tr>';
    }).join('');
    document.getElementById('actRows').innerHTML = rows || '<tr><td colspan="11" style="color:var(--paper-faint)">Nothing here. Actions are created when scan findings are approved, risks are treated, or added manually above.</td></tr>';
  }

  function vendorOverdue(v) { return !!(v.nextReviewDue && v.nextReviewDue < new Date().toISOString().slice(0, 10)); }

  /* Keeps one real Compliance Calendar entry (category "Supplier
     security review") in step with a vendor's own review dates, so the
     calendar/Dashboard governance card need no vendor-specific logic of
     their own — they just see another calendar row. The vendor is the
     source of truth: editing or "Mark reviewed"-ing a vendor pushes its
     dates onto the linked calendar item; completing that calendar row
     from the Compliance calendar view itself does not push back onto
     the vendor (recording a review from the Vendors register, via
     "Mark reviewed", is the supported path so both stay in sync). */
  async function syncVendorCalendar(v) {
    if (!v.nextReviewDue) return;
    var cal = v.calRef && S.calendar.find(function (c) { return c.id === v.calRef; });
    if (cal) {
      cal.nextDue = v.nextReviewDue;
      if (v.lastReviewed) cal.lastCompleted = v.lastReviewed;
      cal.status = 'Active';
      try { await Store.updateCalendarItem(cal); } catch (e) { warn(e); }
      return;
    }
    var maxC = (S.calendar || []).reduce(function (m, c) { var n = parseInt(String(c.id).replace(/\D/g, ''), 10) || 0; return Math.max(m, n); }, 0);
    var newCal = {
      id: 'CAL-' + String(maxC + 1).padStart(3, '0'), title: 'Vendor review — ' + v.name,
      category: 'Supplier security review', freq: 'Annual', nextDue: v.nextReviewDue,
      lastCompleted: v.lastReviewed || '', owner: v.owner, notes: 'Auto-linked to vendor ' + v.id, status: 'Active'
    };
    try {
      await Store.addCalendarItem(newCal);
      v.calRef = newCal.id;
      await Store.updateVendor(v);
    } catch (e) { warn(e); }
  }

  var VENDOR_CRITICALITIES = ['Critical', 'High', 'Medium', 'Low'];
  var VENDOR_REVIEW_STATUSES = ['Not started', 'In progress', 'Reviewed'];

  function renderVendors() {
    var wrap = document.getElementById('vendorRows');
    if (!wrap) return;
    var cf = window._vendorCritF || 'All';
    var sf = window._vendorStatusF || 'All';
    document.getElementById('vendorCritFilters').innerHTML = ['All'].concat(VENDOR_CRITICALITIES).map(function (x) {
      return '<button class="f-pill' + (cf === x ? ' on' : '') + '" aria-pressed="' + (cf === x ? 'true' : 'false') + '" data-action="App.filterVendorCrit" data-id="' + x + '">' + x + '</button>';
    }).join('');
    document.getElementById('vendorStatusFilters').innerHTML = ['All', 'Overdue'].concat(VENDOR_REVIEW_STATUSES).map(function (x) {
      return '<button class="f-pill' + (sf === x ? ' on' : '') + '" aria-pressed="' + (sf === x ? 'true' : 'false') + '" data-action="App.filterVendorStatus" data-id="' + x + '">' + x + '</button>';
    }).join('');
    var vendors = (S.vendors || []).filter(function (v) {
      if (cf !== 'All' && v.criticality !== cf) return false;
      if (sf === 'Overdue') return vendorOverdue(v);
      if (sf !== 'All' && v.reviewStatus !== sf) return false;
      return true;
    });
    wrap.innerHTML = vendors.length ? vendors.map(function (v) {
      var od = vendorOverdue(v);
      var catLine = (v.dataCategories && v.dataCategories.length)
        ? '<div class="src" style="color:var(--gold-light)">' + esc(v.dataCategories.join(' · ')) + '</div>'
        : '<div class="src" style="color:var(--warn)">Data access not classified</div>';
      return '<tr data-id="' + v.id + '" data-action="App.openVendor"><td class="id-t"><button class="lnk" data-action="App.openVendor" data-id="' + v.id + '">' + esc(v.id) + '</button></td><td style="color:var(--paper)">' + esc(v.name) + '<div class="src">' + esc(v.service) + '</div>' + catLine + '</td>' +
        '<td><span class="chip sev-' + v.criticality + '">' + esc(v.criticality) + '</span></td>' +
        '<td><span class="chip st-' + v.reviewStatus.replace(/ /g, '') + '">' + esc(v.reviewStatus) + '</span></td>' +
        '<td style="color:' + (od ? 'var(--fail)' : 'inherit') + '">' + (v.nextReviewDue ? fmtDate(v.nextReviewDue) : '—') + (od ? ' ⚑' : '') + '</td>' +
        '<td class="src">' + esc(v.certifications || '—') + '</td><td>' + esc(v.owner) + '</td>' +
        '<td><span class="chip">' + esc(v.questionnaireStatus || 'Not sent') + '</span></td></tr>';
    }).join('') : '<tr><td colspan="7" style="color:var(--paper-faint)">No vendors match this filter. Add one above.</td></tr>';
  }

  var AI_RISK_TIERS = ['Prohibited', 'High', 'Limited', 'Minimal'];
  var AI_IMPACT_STATUSES = ['Not started', 'In progress', 'Completed'];

  /* Which ISO 42001 controls a given AI system currently evidences —
     computed live from what's actually documented on the record, never
     hand-picked by the practitioner, so it can never drift out of sync
     with the record itself. A.4.2 (resource documentation) is the one
     control every tracked system evidences merely by existing in the
     register at all; everything else requires the specific field that
     backs it to be filled in. */
  function aiControlsFor(sys) {
    var codes = ['A.4.2'];
    if (sys.owner) codes.push('A.3.2');
    if (sys.dataSources) codes.push('A.7.2', 'A.7.3');
    if (sys.humanOversight) codes.push('A.6.2.6', 'A.9.2');
    if (sys.impactAssessmentStatus === 'Completed') codes.push('A.5.2', 'A.5.3', 'A.5.4', 'A.5.5');
    if (sys.vendor) codes.push('A.10.3');
    if (sys.riskTier) codes.push('A.9.3');
    return codes;
  }

  function renderAiSystems() {
    var wrap = document.getElementById('aiRows');
    if (!wrap) return;
    var tf = window._aiTierF || 'All';
    var sf = window._aiStatusF || 'All';
    document.getElementById('aiTierFilters').innerHTML = ['All'].concat(AI_RISK_TIERS).map(function (x) {
      return '<button class="f-pill' + (tf === x ? ' on' : '') + '" aria-pressed="' + (tf === x ? 'true' : 'false') + '" data-action="App.filterAiTier" data-id="' + x + '">' + x + '</button>';
    }).join('');
    document.getElementById('aiStatusFilters').innerHTML = ['All'].concat(AI_IMPACT_STATUSES).map(function (x) {
      return '<button class="f-pill' + (sf === x ? ' on' : '') + '" aria-pressed="' + (sf === x ? 'true' : 'false') + '" data-action="App.filterAiStatus" data-id="' + x + '">' + x + '</button>';
    }).join('');
    var systems = (S.aiSystems || []).filter(function (a) {
      if (tf !== 'All' && a.riskTier !== tf) return false;
      if (sf !== 'All' && a.impactAssessmentStatus !== sf) return false;
      return true;
    });
    wrap.innerHTML = systems.length ? systems.map(function (a) {
      return '<tr data-id="' + a.id + '" data-action="App.openAiSystem"><td class="id-t"><button class="lnk" data-action="App.openAiSystem" data-id="' + a.id + '">' + esc(a.id) + '</button></td><td style="color:var(--paper)">' + esc(a.name) + (a.spId ? '<div class="src">Discovered from Entra enterprise apps</div>' : '') + '</td>' +
        '<td><span class="chip sev-' + a.riskTier + '">' + esc(a.riskTier) + '</span></td>' +
        '<td><span class="chip st-' + a.impactAssessmentStatus.replace(/ /g, '') + '">' + esc(a.impactAssessmentStatus) + '</span></td>' +
        '<td class="src">' + esc(a.vendor || '—') + '</td><td>' + esc(a.owner) + '</td>' +
        '<td>' + (a.lastReviewed ? fmtDate(a.lastReviewed) : '—') + '</td></tr>';
    }).join('') : '<tr><td colspan="7" style="color:var(--paper-faint)">No AI systems tracked yet. Add one above, or run a posture scan to discover candidates from Entra enterprise apps.</td></tr>';

    var candWrap = document.getElementById('aiCandidatesWrap');
    if (candWrap) {
      var candidates = S.aiCandidates || [];
      candWrap.innerHTML = candidates.length
        ? '<div class="card"><h3>Candidate AI systems found — practitioner review required</h3>' + candidates.map(function (c) {
            return '<div class="proposed-card"><h4>' + esc(c.name) + '</h4>' +
              '<div class="meta">Matched keyword <b>"' + esc(c.matchedKeyword) + '"</b>' + (c.highPrivilegeScopes.length ? ' · <b style="color:var(--fail)">' + c.highPrivilegeScopes.length + ' high-privilege scope(s) granted</b> — a risk has been proposed below' : '') + '</div>' +
              '<button class="btn sm" data-action="App.addAiCandidate" data-id="' + esc(c.id) + '">Add to register</button> ' +
              '<button class="btn ghost sm" data-action="App.dismissAiCandidate" data-id="' + esc(c.id) + '">Dismiss</button></div>';
          }).join('') + '</div>'
        : '';
    }
  }

  /* Shared row renderer for one editable Controls record — used by both
     the plain per-framework table and (for essential8's ML1-ML3 child
     rows) the strategy-grouped table, so toggle/status/verify/evidence
     behaviour stays identical everywhere. */
  function renderSoaRow(c) {
    var maps = String(c.map || '').split('·').map(function (m) { return m.trim(); }).filter(Boolean);
    var key = c.fw + '|' + c.id;
    var stale = c.st === 'Implemented' && daysSince(c.verified) > 90;
    var verifiedCell = !c.app ? '—'
      : c.st !== 'Implemented' ? '<span class="src">—</span>'
      : c.verified ? '<span class="' + (stale ? 'verify-stale' : 'verify-ok') + '">' + fmtDate(c.verified) + (stale ? ' ⚑' : '') + '</span>' + (c.verifiedBy ? '<div class="src">by ' + esc(c.verifiedBy) + '</div>' : '') + '<button class="btn ghost sm" style="margin-top:4px" data-action="App.verifyControl" data-id="' + key + '">Re-verify</button>'
      : '<button class="btn sm" data-action="App.verifyControl" data-id="' + key + '">Verify now</button>';
    var isAutoEvidence = c.evidenceUrl && c.verifiedBy === AUTO_EVIDENCE_TAG;
    var evidenceCell = (c.evidenceUrl && isSafeUrl(c.evidenceUrl))
      ? '<a href="' + esc(c.evidenceUrl) + '" target="_blank" rel="noopener" class="evidence-link">Evidence ↗</a>' + (isAutoEvidence ? '<div class="src">Auto-captured ' + fmtDate(c.verified) + '</div>' : '') + '<br><button class="btn ghost sm" style="margin-top:4px" data-action="App.setControlEvidence" data-id="' + key + '">Edit</button>'
      : '<button class="btn ghost sm" data-action="App.setControlEvidence" data-id="' + key + '">Link evidence</button>';
    /* DISP ICT controls carry an ISM chapter reference, looked up
       definitionally (same treatment as maturity level/parent above) —
       shown under the title so an IRAP assessor can trace straight to
       the relevant ISM guideline without a dedicated table column. */
    var ismLine = (c.fw === 'dispirap' && dispIsmChapterOfCode(c.id)) ? '<div class="src" style="margin-top:2px">ISM: ' + esc(dispIsmChapterOfCode(c.id)) + '</div>' : '';
    return '<tr data-id="' + key + '"><td class="id-t"><button class="lnk" data-action="App.openControlGuidance" data-id="' + key + '">' + c.id + '</button></td><td style="color:var(--paper)">' + esc(c.t) + ismLine + (c.just ? '<div class="src" style="margin-top:4px">Justification: ' + esc(c.just) + '</div>' : '') + '</td>' +
      '<td><button class="toggle' + (c.app ? ' on' : '') + '" role="switch" aria-checked="' + (c.app ? 'true' : 'false') + '" aria-label="' + esc(c.id + ' applicable') + '" data-action="App.toggleApp" data-id="' + key + '"></button></td>' +
      '<td>' + (c.app ? '<select class="mini" data-change-action="App.setSt" data-id="' + key + '">' + ['Not started', 'In progress', 'Implemented'].map(function (s) { return '<option' + (c.st === s ? ' selected' : '') + '>' + s + '</option>'; }).join('') + '</select>' : '<span class="chip st-Notstarted">N/A</span>') + '</td>' +
      '<td><div class="fw-chips">' + maps.map(function (m) { return '<span>' + esc(m) + '</span>'; }).join('') + '</div></td><td>' + esc(c.own) + '</td>' +
      '<td>' + verifiedCell + '</td><td>' + evidenceCell + '</td></tr>';
  }

  /* Essential Eight's own definitional level (1-3), looked up from the
     framework registry, not from the per-tenant control row — a child
     control's maturity level is fixed metadata, same treatment as SOC
     2's `cat`. Returns undefined for the 8 parent E8.n rows. */
  function e8LvlOfCode(code) {
    var def = window.FRAMEWORKS.essential8.controls.find(function (c) { return c.code === code; });
    return def && def.lvl;
  }

  /* NIST CSF subcategory's parent category code, looked up from the
     registry (definitional, not persisted to SharePoint — same
     treatment as e8LvlOfCode above). Undefined for a category code. */
  function nistParentOf(code) {
    var def = window.NIST_SUBCATEGORIES.find(function (c) { return c.code === code; });
    return def && def.parent;
  }

  /* DISP membership level ordering, and the same "code -> definitional
     metadata" lookup treatment as e8LvlOfCode/nistParentOf — not
     persisted to SharePoint. */
  var DISP_LEVEL_RANK = { Entry: 0, L1: 1, L2: 2, L3: 3 };
  function dispLvl(s) { return DISP_LEVEL_RANK.hasOwnProperty(s) ? DISP_LEVEL_RANK[s] : DISP_LEVEL_RANK.L1; }
  function dispLvlOfCode(code) {
    var def = window.FRAMEWORKS.dispirap.controls.find(function (c) { return c.code === code; });
    return def && def.membershipLevel;
  }
  function dispIsmChapterOfCode(code) {
    var def = window.FRAMEWORKS.dispirap.controls.find(function (c) { return c.code === code; });
    return def && def.ismChapter;
  }

  /* Whether a control row counts as "in scope" at the client's current
     depth/level setting for the frameworks that have one. Every other
     framework's rows are always in scope. Essential Eight's 8 parent
     rows are summary-only (see renderEssential8Rows) and never
     independently in scope — only their ML children are, up to the
     target level. Single source of truth for readiness math, report
     generation, search indexing and control pickers, so none of them
     can silently disagree with what the SoA itself is showing. */
  function isControlVisible(c) {
    if (c.fw === 'essential8') {
      var lvl = e8LvlOfCode(c.id);
      return !!lvl && lvl <= e8Lvl(S.settings.e8TargetLevel);
    }
    if (c.fw === 'nistcsf') {
      var isSub = !!nistParentOf(c.id);
      var depth = (S.settings && S.settings.nistDepth) || 'category';
      return depth === 'subcategory' ? isSub : !isSub;
    }
    if (c.fw === 'dispirap') {
      var mLvl = dispLvlOfCode(c.id);
      return mLvl !== undefined && dispLvl(mLvl) <= dispLvl(S.settings && S.settings.dispTargetLevel);
    }
    return true;
  }
  function frameworkVisibleRows(fw) {
    return S.controls.filter(function (c) { return c.fw === fw && isControlVisible(c); });
  }
  function frameworkAppRows(fw) {
    return frameworkVisibleRows(fw).filter(function (c) { return c.app; });
  }

  /* A strategy's assessed maturity is the highest level L such that
     every level from 1..L is either Implemented or marked Not
     Applicable — the same "you can't claim ML2 without ML1" logic the
     real Essential Eight assessment methodology uses. A level missing
     from S.controls entirely (not yet reconciled into this tenant)
     stops the chain rather than being skipped, since that's an
     anomalous state, not a deliberate exclusion. */
  function e8AssessedMaturity(parentCode, byChildCode) {
    var lvl = 0;
    for (var l = 1; l <= 3; l++) {
      var c = byChildCode[parentCode + '-ML' + l];
      if (!c) break;
      if (!c.app) continue;
      if (c.st !== 'Implemented') break;
      lvl = l;
    }
    return lvl;
  }

  /* Strategy-grouped table body for essential8: a non-editable header
     row per strategy (name, cross-mapping, assessed maturity chip) then
     the editable ML1..target child rows beneath it, reusing
     renderSoaRow() so behaviour matches every other framework's table. */
  function renderEssential8Rows(rows, target) {
    var byCode = {};
    rows.forEach(function (c) { byCode[c.id] = c; });
    var parents = window.FRAMEWORKS.essential8.controls.filter(function (c) { return !c.lvl; });
    return parents.map(function (p) {
      var maturity = e8AssessedMaturity(p.code, byCode);
      var maps = String(p.map || '').split('·').map(function (m) { return m.trim(); }).filter(Boolean);
      var header = '<tr class="soa-group-row"><td class="id-t">' + p.code + '</td>' +
        '<td style="color:var(--paper)"><b>' + esc(p.t) + '</b></td>' +
        '<td>—</td>' +
        '<td><span class="chip ' + (maturity ? 'st-Implemented' : 'st-Notstarted') + '">' + (maturity ? 'ML' + maturity : 'Not assessed') + '</span></td>' +
        '<td><div class="fw-chips">' + maps.map(function (m) { return '<span>' + esc(m) + '</span>'; }).join('') + '</div></td>' +
        '<td colspan="3"></td></tr>';
      var childRows = [1, 2, 3].filter(function (l) { return l <= target; }).map(function (l) {
        var c = byCode[p.code + '-ML' + l];
        return c ? renderSoaRow(c) : '';
      }).join('');
      return header + childRows;
    }).join('');
  }

  /* A NIST CSF category's status, derived from its subcategory children:
     Implemented only when every applicable child is; In progress if any
     applicable child has started; otherwise Not started. Returns null
     if there's no subcategory data to derive from yet (not seeded, or
     every child marked Not Applicable), so the caller can fall back to
     the category's own persisted status. */
  function nistAssessedStatus(catCode, byChildCode) {
    var children = window.NIST_SUBCATEGORIES.filter(function (s) { return s.parent === catCode; })
      .map(function (s) { return byChildCode[s.code]; }).filter(Boolean);
    var applicable = children.filter(function (c) { return c.app; });
    if (!applicable.length) return null;
    var implN = applicable.filter(function (c) { return c.st === 'Implemented'; }).length;
    if (implN === applicable.length) return 'Implemented';
    if (implN > 0 || applicable.some(function (c) { return c.st === 'In progress'; })) return 'In progress';
    return 'Not started';
  }

  /* Category-grouped table body for nistcsf at subcategory depth: a
     non-editable header row per category (name, cross-mapping, status
     derived from its children) then the editable subcategory rows
     beneath it. `allNistRows` must be the UNFILTERED set of every
     nistcsf control (both categories and subcategories) — the category
     header needs its own row for the not-yet-seeded fallback, which
     frameworkVisibleRows() would exclude at subcategory depth. */
  function renderNistSubcategoryRows(allNistRows) {
    var byCode = {};
    allNistRows.forEach(function (c) { byCode[c.id] = c; });
    return window.FRAMEWORKS.nistcsf.controls.map(function (cat) {
      var catRow = byCode[cat.code];
      var computed = nistAssessedStatus(cat.code, byCode);
      var st = computed || (catRow ? catRow.st : 'Not started');
      var maps = String(cat.map || '').split('·').map(function (m) { return m.trim(); }).filter(Boolean);
      var header = '<tr class="soa-group-row"><td class="id-t">' + cat.code + '</td>' +
        '<td style="color:var(--paper)"><b>' + esc(cat.t) + '</b></td>' +
        '<td>—</td>' +
        '<td><span class="chip ' + (st === 'Implemented' ? 'st-Implemented' : 'st-Notstarted') + '">' + esc(st) + '</span></td>' +
        '<td><div class="fw-chips">' + maps.map(function (m) { return '<span>' + esc(m) + '</span>'; }).join('') + '</div></td>' +
        '<td colspan="3"></td></tr>';
      var childRows = window.NIST_SUBCATEGORIES.filter(function (s) { return s.parent === cat.code; })
        .map(function (s) { var c = byCode[s.code]; return c ? renderSoaRow(c) : ''; }).join('');
      return header + childRows;
    }).join('');
  }

  function renderSoa() {
    var entitled = entitledFrameworks();
    if (!entitled.length) {
      document.getElementById('soaFwTabs').innerHTML = '';
      document.getElementById('soaPct').textContent = '—';
      document.getElementById('soaBarFill').style.width = '0%';
      document.getElementById('soaRows').innerHTML = '<tr><td colspan="6" style="color:var(--paper-faint)">No frameworks purchased yet. Enable one from the <a href="#" data-action="App.go" data-id="frameworks" style="color:var(--gold-light)">Frameworks</a> view.</td></tr>';
      var suggElEmpty = document.getElementById('soaE8Suggestions'); if (suggElEmpty) suggElEmpty.innerHTML = '';
      return;
    }
    if (!window._soaFw || entitled.indexOf(window._soaFw) === -1) window._soaFw = entitled[0];
    var activeFw = window._soaFw;
    var isE8 = activeFw === 'essential8';
    var e8Target = isE8 ? e8Lvl(S.settings.e8TargetLevel) : null;
    var isNistSub = activeFw === 'nistcsf' && ((S.settings && S.settings.nistDepth) || 'category') === 'subcategory';

    document.getElementById('soaFwTabs').innerHTML = entitled.map(function (fw) {
      return '<button class="f-pill' + (fw === activeFw ? ' on' : '') + '" aria-pressed="' + (fw === activeFw ? 'true' : 'false') + '" data-action="App.setSoaFw" data-id="' + fw + '">' + esc(fwName(fw)) + '</button>';
    }).join('');

    /* Category lookup is definitional (from the framework registry), not
       per-tenant state, so it's never persisted to SharePoint — just
       looked up by code at render time. Only frameworks whose controls
       set `cat` (currently SOC 2) get a filter row at all. */
    var catByCode = {};
    (window.FRAMEWORKS[activeFw].controls || []).forEach(function (c) { if (c.cat) catByCode[c.code] = c.cat; });
    var cats = Object.keys(SOA_CAT_LABELS).filter(function (k) {
      return (window.FRAMEWORKS[activeFw].controls || []).some(function (c) { return c.cat === k; });
    });
    var catFiltersEl = document.getElementById('soaCatFilters');
    if (catFiltersEl) {
      if (!cats.length) {
        catFiltersEl.innerHTML = '';
        window._soaCat = 'All';
      } else {
        if (!window._soaCat) window._soaCat = 'All';
        catFiltersEl.innerHTML = ['All'].concat(cats).map(function (k) {
          var label = k === 'All' ? 'All' : SOA_CAT_LABELS[k];
          return '<button class="f-pill' + (window._soaCat === k ? ' on' : '') + '" aria-pressed="' + (window._soaCat === k ? 'true' : 'false') + '" data-action="App.filterSoaCat" data-id="' + k + '">' + esc(label) + '</button>';
        }).join('');
      }
    }

    /* rawRows is every S.controls row for this framework, unfiltered —
       the grouped renderers (essential8, nistcsf subcategory depth) need
       both the parent/category rows AND every level/child to build their
       own header + children structure. app is the depth/level-aware,
       applicable-only set frameworkAppRows() computes — the single
       source of truth for readiness math, shared with the Dashboard,
       reports and search (see isControlVisible() above). */
    var rawRows = S.controls.filter(function (c) { return c.fw === activeFw; });
    var app = frameworkAppRows(activeFw);
    var impl = app.filter(function (c) { return c.st === 'Implemented'; }).length;
    var pct = window.CheckpointLib.readinessPct(app);
    document.getElementById('soaPct').textContent = impl + ' / ' + app.length + ' — ' + pct + '%';
    document.getElementById('soaBarFill').style.width = pct + '%';

    /* Evidence coverage — auto-captured (this scan or a previous one
       populated evidenceUrl itself, tagged via the verifiedBy sentinel
       autoEvidenceCapture() sets), manually linked, or nothing at all.
       Auto-capture never overwrites a manual link, so a control only
       ever shows as "auto-captured" if a practitioner never linked
       anything there themselves. */
    var covEl = document.getElementById('soaEvidenceCoverage');
    if (covEl) {
      var autoN = 0, manualN = 0, noneN = 0;
      app.forEach(function (c) {
        if (!c.evidenceUrl) noneN++;
        else if (c.verifiedBy === AUTO_EVIDENCE_TAG) autoN++;
        else manualN++;
      });
      covEl.innerHTML = '<span><i class="dot" style="background:var(--pass)"></i> ' + autoN + ' auto-captured</span>' +
        '<span><i class="dot" style="background:var(--gold-light)"></i> ' + manualN + ' manually linked</span>' +
        '<span><i class="dot" style="background:var(--fail)"></i> ' + noneN + ' no evidence</span>';
    }

    if (isE8) {
      document.getElementById('soaRows').innerHTML = renderEssential8Rows(rawRows, e8Target);
    } else if (isNistSub) {
      document.getElementById('soaRows').innerHTML = renderNistSubcategoryRows(rawRows);
    } else {
      var visRows = frameworkVisibleRows(activeFw);
      var tableRows = (cats.length && window._soaCat && window._soaCat !== 'All')
        ? visRows.filter(function (c) { return catByCode[c.id] === window._soaCat; })
        : visRows;
      document.getElementById('soaRows').innerHTML = tableRows.map(renderSoaRow).join('');
    }

    /* Scan-derived Essential Eight suggestions — never applied without
       explicit practitioner confirmation, see runScan() and
       App.confirmE8Suggestion(). */
    var suggEl = document.getElementById('soaE8Suggestions');
    if (suggEl) {
      suggEl.innerHTML = (isE8 && S.e8Proposed && S.e8Proposed.length)
        ? '<div class="card" style="margin-bottom:16px"><h3>Suggested from your last scan — confirm before applying</h3>' +
          S.e8Proposed.map(function (p) {
            return '<div class="proposed-card"><h4>' + esc(p.code) + ' — ' + esc(p.from) + ' → ' + esc(p.to) + '</h4>' +
              '<div class="meta">Based on posture check <b>' + esc(p.checkLabel) + '</b></div>' +
              '<button class="btn sm" data-action="App.confirmE8Suggestion" data-id="' + esc(p.code) + '">Confirm</button> ' +
              '<button class="btn ghost sm" data-action="App.dismissE8Suggestion" data-id="' + esc(p.code) + '">Dismiss</button></div>';
          }).join('') + '</div>'
        : '';
    }
  }

  function renderSharedEvidence() {
    var selectEl = document.getElementById('sharedEvidenceControlSelect');
    var resultEl = document.getElementById('sharedEvidenceResult');
    if (!selectEl || !resultEl) return;
    var entitled = entitledFrameworks();
    if (!entitled.length) {
      selectEl.innerHTML = '';
      resultEl.innerHTML = '<p style="color:var(--paper-faint)">No frameworks purchased yet.</p>';
      return;
    }
    var current = window._sharedEvidenceKey;
    selectEl.innerHTML = entitled.map(function (fw) {
      var rows = frameworkVisibleRows(fw);
      return '<optgroup label="' + esc(fwName(fw)) + '">' + rows.map(function (c) {
        var key = c.fw + '|' + c.id;
        return '<option value="' + key + '"' + (key === current ? ' selected' : '') + '>' + esc(c.id) + ' — ' + esc(c.t) + '</option>';
      }).join('') + '</optgroup>';
    }).join('');

    if (!current) {
      var first = frameworkVisibleRows(entitled[0])[0];
      current = window._sharedEvidenceKey = first ? first.fw + '|' + first.id : undefined;
      selectEl.value = current;
    }
    if (!current) { resultEl.innerHTML = ''; return; }

    var parts = current.split('|');
    var start = S.controls.find(function (c) { return c.fw === parts[0] && c.id === parts[1]; });
    if (!start) { resultEl.innerHTML = ''; return; }

    var closure = sharedEvidenceClosure(start);
    var frameworksTouched = {};
    closure.forEach(function (c) { frameworksTouched[c.fw] = true; });
    var fwCount = Object.keys(frameworksTouched).length;
    var byFw = entitled.map(function (fw) { return { fw: fw, rows: closure.filter(function (c) { return c.fw === fw; }) }; }).filter(function (g) { return g.rows.length; });

    var currentUrl = start.evidenceUrl || '';
    resultEl.innerHTML =
      '<div class="grid kpis" style="margin-bottom:18px">' +
      '<div class="card kpi"><div class="kpi-num"><b>1</b></div><span>Artefact</span></div>' +
      '<div class="card kpi"><div class="kpi-num"><b>' + closure.length + '</b></div><span>Control' + (closure.length === 1 ? '' : 's') + ' satisfied</span></div>' +
      '<div class="card kpi"><div class="kpi-num"><b>' + fwCount + '</b></div><span>Framework' + (fwCount === 1 ? '' : 's') + '</span></div>' +
      '</div>' +
      '<div class="card" style="max-width:720px;margin-bottom:16px">' +
      '<div class="d-kv" style="padding:0 0 10px"><span>Evidence URL (SharePoint/OneDrive link)</span></div>' +
      '<input class="mini" id="sharedEvidenceUrlInput" style="width:100%;margin-bottom:12px" value="' + esc(currentUrl) + '" placeholder="https://…">' +
      '<button class="btn sm" data-action="App.applySharedEvidence">Apply to all ' + closure.length + ' control' + (closure.length === 1 ? '' : 's') + '</button>' +
      '</div>' +
      byFw.map(function (g) {
        return '<div class="card" style="margin-bottom:12px"><h3>' + esc(fwName(g.fw)) + '</h3>' +
          g.rows.map(function (c) {
            var has = c.evidenceUrl && isSafeUrl(c.evidenceUrl);
            return '<div class="d-kv"><span>' + esc(c.id) + ' — ' + esc(c.t) + '</span>' +
              (has ? '<a href="' + esc(c.evidenceUrl) + '" target="_blank" rel="noopener" class="evidence-link">Evidence ↗</a>' : '<b style="color:var(--paper-faint)">No evidence yet</b>') +
              '</div>';
          }).join('') + '</div>';
      }).join('');
  }

  function renderTrustCenter() {
    var togEl = document.getElementById('tcTogglesRows');
    if (!togEl) return;
    togEl.innerHTML = TRUST_CENTER_TOGGLES.map(function (t) {
      var on = S.settings[t.key] === 'true';
      return '<div class="card fw-admin-row"><div><b>' + esc(t.label) + '</b><p>' + esc(t.desc) + '</p></div><button class="toggle' + (on ? ' on' : '') + '" role="switch" aria-checked="' + (on ? 'true' : 'false') + '" aria-label="' + esc(t.label) + '" data-action="App.toggleTrustCenterSetting" data-id="' + t.key + '"></button></div>';
    }).join('');
    document.getElementById('tcCompanyName').value = (S.settings && S.settings.trustCenterCompanyName) || '';
    document.getElementById('tcContactEmail').value = (S.settings && S.settings.trustCenterContactEmail) || '';

    var vRows = document.getElementById('tcVendorRows');
    if (vRows) {
      var vendors = S.vendors || [];
      vRows.innerHTML = vendors.length ? vendors.map(function (v) {
        return '<div class="d-kv"><span>' + esc(v.name) + ' <span class="src">— ' + esc(v.service) + '</span></span><button class="toggle' + (v.publicListed ? ' on' : '') + '" role="switch" aria-checked="' + (v.publicListed ? 'true' : 'false') + '" aria-label="' + esc(v.name + ' publicly listed') + '" data-action="App.toggleVendorPublicListed" data-id="' + v.id + '"></button></div>';
      }).join('') : '<p style="color:var(--paper-faint);font-size:12.5px">No vendors in the register yet.</p>';
    }
  }

  function renderAuditorPack() {
    var fwSelect = document.getElementById('apFramework');
    if (!fwSelect) return;
    var entitled = entitledFrameworks();
    fwSelect.innerHTML = entitled.map(function (fw) { return '<option value="' + fw + '">' + esc(fwName(fw)) + '</option>'; }).join('');
  }

  function fmtSize(n) {
    if (!n) return '—';
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return Math.round(n / 1024) + ' KB';
    return (n / (1024 * 1024)).toFixed(1) + ' MB';
  }

  /* A generated policy document's draft/approved state isn't a column
     on the SharePoint file itself — it's derived from the audit log
     (already a durable, versioned SharePoint list) by finding the most
     recent 'Policy template generated' or 'Policy document approved'
     entry for that exact filename. No entry -> not a generated template
     (an ordinary uploaded document), so no chip is shown at all. */
  function templateDraftStatus(filename) {
    var log = S.auditLog || [];
    for (var i = 0; i < log.length; i++) {
      var e = log[i];
      if (e.targetType === 'Document' && e.targetId === filename &&
          (e.action === 'Policy template generated' || e.action === 'Policy document approved')) {
        return e.action === 'Policy document approved' ? 'approved' : 'draft';
      }
    }
    return null;
  }

  function renderTemplatePreview() {
    var sel = document.getElementById('tplSelect');
    var box = document.getElementById('tplPreview');
    if (!sel || !box) return;
    var t = window.POLICY_TEMPLATES.find(function (x) { return x.id === sel.value; });
    if (!t) { box.innerHTML = ''; return; }
    box.innerHTML = '<b style="color:var(--paper)">Purpose:</b> ' + esc(t.purpose) +
      '<br><b style="color:var(--paper)">Helps satisfy:</b> ' + (t.controls.length ? esc(t.controls.join(', ')) : '—');
  }

  function renderTemplatesPicker() {
    var sel = document.getElementById('tplSelect');
    if (!sel) return;
    if (!sel.options.length) {
      sel.innerHTML = window.POLICY_TEMPLATES.map(function (t) { return '<option value="' + esc(t.id) + '">' + esc(t.title) + '</option>'; }).join('');
      var dateInput = document.getElementById('tplReviewDate');
      if (dateInput && !dateInput.value) {
        var d = new Date(); d.setFullYear(d.getFullYear() + 1);
        dateInput.value = d.toISOString().slice(0, 10);
      }
    }
    renderTemplatePreview();
  }

  function renderDocuments() {
    renderTemplatesPicker();
    var rows = document.getElementById('docRows');
    if (!rows) return;
    var catSelect = document.getElementById('docCategory');
    if (catSelect && !catSelect.options.length) {
      catSelect.innerHTML = window.DOC_CATEGORIES.map(function (c) { return '<option>' + esc(c) + '</option>'; }).join('');
    }
    if (Store.kind === 'demo') {
      document.getElementById('docCatFilters').innerHTML = '';
      rows.innerHTML = '<tr><td colspan="5" style="color:var(--paper-faint)">Demo mode has no real tenant to store files in — sign in to a real tenant to use Documents.</td></tr>';
      return;
    }
    rows.innerHTML = '<tr><td colspan="5" style="color:var(--paper-faint)">Loading…</td></tr>';
    Store.listDocuments().then(function (docs) {
      window._docs = docs;
      var cf = window._docCatF || 'All';
      document.getElementById('docCatFilters').innerHTML = ['All'].concat(window.DOC_CATEGORIES).map(function (c) {
        return '<button class="f-pill' + (cf === c ? ' on' : '') + '" aria-pressed="' + (cf === c ? 'true' : 'false') + '" data-action="App.filterDocCat" data-id="' + esc(c) + '">' + esc(c) + '</button>';
      }).join('');
      var filtered = cf === 'All' ? docs : docs.filter(function (d) { return d.category === cf; });
      if (!filtered.length) {
        rows.innerHTML = '<tr><td colspan="5" style="color:var(--paper-faint)">No documents' + (cf === 'All' ? ' yet. Upload the ISMS manual, policies, risk treatment plan or training records above.' : ' in this category yet.') + '</td></tr>';
        return;
      }
      rows.innerHTML = filtered.map(function (d) {
        var draftStatus = templateDraftStatus(d.name);
        var statusCell = draftStatus === 'draft'
          ? '<span class="chip st-Proposed">DRAFT — review &amp; approve</span> <button class="btn ghost sm" style="margin-top:4px" data-action="App.approveTemplate" data-id="' + esc(d.category + '|' + d.name) + '">Mark approved</button>'
          : draftStatus === 'approved' ? '<span class="chip st-Implemented">Approved</span>' : '';
        return '<tr><td style="color:var(--paper)">' + esc(d.name) + '</td><td class="src">' + esc(d.category || '—') + '</td><td>' + fmtDate(d.modified) + '</td><td>' + fmtSize(d.size) + '</td>' +
          '<td>' + statusCell + '<div' + (statusCell ? ' style="margin-top:4px"' : '') + '><a href="' + esc(d.url) + '" target="_blank" rel="noopener" class="evidence-link">Open ↗</a></div></td></tr>';
      }).join('');
    }).catch(function (e) {
      warn(e);
      rows.innerHTML = '<tr><td colspan="5" style="color:var(--paper-faint)">Could not load documents.</td></tr>';
    });
  }

  function renderAudits() {
    var wrap = document.getElementById('auditRows');
    if (!wrap) return;
    var fwSelect = document.getElementById('naAuditFw');
    if (fwSelect && !fwSelect.options.length) {
      fwSelect.innerHTML = window.FRAMEWORK_ORDER.map(function (fw) { return '<option value="' + fw + '">' + esc(fwName(fw)) + '</option>'; }).join('');
    }
    var audits = S.audits || [];
    if (!audits.length) {
      wrap.innerHTML = '<tr><td colspan="7" style="color:var(--paper-faint)">No internal audits scheduled yet. ISO 27001 clause 9.2 expects a recurring internal audit programme, independent of certification audits.</td></tr>';
      return;
    }
    var today = new Date().toISOString().slice(0, 10);
    wrap.innerHTML = audits.slice().reverse().map(function (a) {
      var overdue = a.status === 'Planned' && a.planned && a.planned < today;
      return '<tr><td class="id-t">' + a.id + '</td><td>' + esc(fwName(a.fw)) + '</td><td style="color:var(--paper)">' + esc(a.scope) + '</td><td>' + esc(a.auditor) + '</td>' +
        '<td style="color:' + (overdue ? 'var(--fail)' : 'inherit') + '">' + fmtDate(a.planned) + (overdue ? ' ⚑' : '') + '</td>' +
        '<td><span class="chip ' + (a.status === 'Completed' ? 'st-Implemented' : 'st-Notstarted') + '">' + a.status + '</span></td>' +
        '<td>' + (a.status === 'Planned' ? '<button class="btn sm" data-action="App.completeAudit" data-id="' + a.id + '">Mark complete</button>' : '<button class="btn ghost sm" data-action="App.openAudit" data-id="' + a.id + '">View</button>') + '</td></tr>';
    }).join('');
  }

  function renderReviews() {
    var wrap = document.getElementById('reviewRows');
    if (!wrap) return;
    var reviews = S.reviews || [];
    if (!reviews.length) {
      wrap.innerHTML = '<tr><td colspan="5" style="color:var(--paper-faint)">No management reviews recorded yet. ISO 27001 clause 9.3 expects top management to review the ISMS at planned intervals.</td></tr>';
      return;
    }
    wrap.innerHTML = reviews.slice().reverse().map(function (r) {
      return '<tr><td class="id-t">' + r.id + '</td><td>' + fmtDate(r.date) + '</td><td style="color:var(--paper)">' + esc(r.attendees) + '</td><td>' + (r.nextDue ? fmtDate(r.nextDue) : '—') + '</td>' +
        '<td><button class="btn ghost sm" data-action="App.openReview" data-id="' + r.id + '">View</button></td></tr>';
    }).join('');
  }

  function renderCalendar() {
    var wrap = document.getElementById('calRows');
    if (!wrap) return;
    var catSelect = document.getElementById('naCalCategory');
    if (catSelect && !catSelect.options.length) catSelect.innerHTML = window.CALENDAR_CATEGORIES.map(function (c) { return '<option>' + esc(c) + '</option>'; }).join('');
    var freqSelect = document.getElementById('naCalFreq');
    if (freqSelect && !freqSelect.options.length) freqSelect.innerHTML = window.CALENDAR_FREQUENCIES.map(function (f) { return '<option>' + esc(f) + '</option>'; }).join('');
    var items = (S.calendar || []).filter(function (c) { return c.status !== 'Done'; });
    if (!items.length) {
      wrap.innerHTML = '<tr><td colspan="8" style="color:var(--paper-faint)">No recurring activities tracked yet. Add access control reviews, BCP/DR tests, supplier reviews and more above.</td></tr>';
      return;
    }
    var today = new Date().toISOString().slice(0, 10);
    wrap.innerHTML = items.slice().sort(function (a, b) { return (a.nextDue || '').localeCompare(b.nextDue || ''); }).map(function (c) {
      var isOverdue = c.nextDue && c.nextDue < today;
      return '<tr data-id="' + c.id + '"><td class="id-t">' + c.id + '</td><td style="color:var(--paper)">' + esc(c.title) + (c.notes ? '<div class="src" style="margin-top:4px">' + esc(c.notes) + '</div>' : '') + '</td><td class="src">' + esc(c.category) + '</td><td class="src">' + esc(c.freq) + '</td><td>' + esc(c.owner) + '</td>' +
        '<td style="color:' + (isOverdue ? 'var(--fail)' : 'inherit') + '">' + fmtDate(c.nextDue) + (isOverdue ? ' ⚑' : '') + '</td>' +
        '<td>' + (c.lastCompleted ? fmtDate(c.lastCompleted) : '—') + '</td>' +
        '<td><button class="btn sm" data-action="App.completeCalItem" data-id="' + c.id + '">Complete</button></td></tr>';
    }).join('');
  }

  function renderAuditLog() {
    var wrap = document.getElementById('auditLogRows');
    if (!wrap) return;
    var entries = S.auditLog || [];
    if (!entries.length) {
      wrap.innerHTML = '<tr><td colspan="6" style="color:var(--paper-faint)">No audit log entries yet — this fills in as controls, risks, actions and registers are changed.</td></tr>';
      return;
    }
    wrap.innerHTML = entries.map(function (e) {
      var when = e.entryDateTime ? new Date(e.entryDateTime).toLocaleString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
      return '<tr><td class="src">' + esc(when) + '</td><td>' + esc(e.actor) + '</td><td style="color:var(--paper)">' + esc(e.action) + '</td>' +
        '<td class="id-t">' + esc(e.targetType) + ' ' + esc(e.targetId) + '</td>' +
        '<td class="src">' + esc(e.before || '—') + '</td><td class="src">' + esc(e.after || '—') + '</td></tr>';
    }).join('');
  }

  function renderBoard() {
    var heroEl = document.getElementById('boardHero');
    if (!heroEl) return;
    var last = S.scans[S.scans.length - 1];
    var prevScan = S.scans[S.scans.length - 2];
    var entitled = entitledFrameworks();
    var primaryFw = entitled.indexOf('iso27001') > -1 ? 'iso27001' : entitled[0];
    var pApp = primaryFw ? frameworkAppRows(primaryFw) : [];
    var implCount = pApp.filter(function (c) { return c.st === 'Implemented'; }).length;
    var readyPct = window.CheckpointLib.readinessPct(pApp);
    var crit = S.risks.filter(function (r) { if (r.status === 'Closed') return false; var q = residual(r); return band(q.L * q.I) === 'Critical' || band(q.L * q.I) === 'High'; }).length;
    var od = S.actions.filter(overdue).length;
    var scoreTrend = last && prevScan ? trendBadge(last.score, prevScan.score, true) : '';

    heroEl.innerHTML =
      '<div class="card board-tile"><b>' + (last ? last.score : '—') + '<small>/100</small> ' + scoreTrend + '</b><span>Posture score</span></div>' +
      '<div class="card board-tile"><b>' + readyPct + '<small>%</small></b><span>' + (primaryFw ? esc(fwName(primaryFw)) : 'No framework') + ' readiness</span></div>' +
      '<div class="card board-tile"><b style="color:' + (crit ? 'var(--fail)' : 'var(--gold-light)') + '">' + crit + '</b><span>High / critical risks</span></div>' +
      '<div class="card board-tile"><b style="color:' + (od ? 'var(--fail)' : 'var(--gold-light)') + '">' + od + '</b><span>Overdue actions</span></div>';

    var roadmapEl = document.getElementById('boardRoadmap');
    if (roadmapEl) {
      if (!primaryFw) {
        roadmapEl.innerHTML = '<p style="color:var(--paper-faint);font-size:13px">Enable a framework to see its certification roadmap.</p>';
      } else {
        var evidencedCount = pApp.filter(function (c) { return c.st === 'Implemented' && (c.verified || c.evidenceUrl); }).length;
        var evidencedPct = pApp.length ? Math.round(evidencedCount / pApp.length * 100) : 0;
        var certifyPct = (readyPct === 100 && evidencedPct === 100) ? 100 : 0;
        var phases = [{ name: 'Assess', pct: 100 }, { name: 'Implement', pct: readyPct }, { name: 'Evidence', pct: evidencedPct }, { name: 'Certify', pct: certifyPct }];
        roadmapEl.innerHTML = '<div class="roadmap-track">' + phases.map(function (p, i) {
          return '<div class="roadmap-phase' + (p.pct === 100 ? ' done' : p.pct > 0 ? ' active' : '') + '"><div class="roadmap-fill" style="width:' + p.pct + '%"></div><span>' + (i + 1) + '. ' + p.name + '</span><b>' + p.pct + '%</b></div>';
        }).join('') + '</div>';
      }
    }

    var risksEl = document.getElementById('boardRisks');
    if (risksEl) {
      var topRisks = S.risks.filter(function (r) { return r.status !== 'Closed'; }).slice()
        .sort(function (a, b) { var qa = residual(a), qb = residual(b); return (qb.L * qb.I) - (qa.L * qa.I); }).slice(0, 3);
      risksEl.innerHTML = topRisks.length ? topRisks.map(function (r) {
        var q = residual(r), rb = band(q.L * q.I);
        return '<div class="d-kv"><span>' + esc(r.title) + '</span><b><span class="chip sev-' + rb + '">' + rb + '</span></b></div>';
      }).join('') : '<p style="color:var(--paper-faint);font-size:13px">No open risks.</p>';
    }

    var msEl = document.getElementById('boardMilestones');
    if (msEl) {
      var today = new Date().toISOString().slice(0, 10);
      var nextAudit = (S.audits || []).filter(function (a) { return a.status === 'Planned'; }).sort(function (a, b) { return (a.planned || '').localeCompare(b.planned || ''); })[0];
      var lastReview = (S.reviews || [])[S.reviews.length - 1];
      var upcomingCal = (S.calendar || []).filter(function (c) { return c.status !== 'Done'; }).sort(function (a, b) { return (a.nextDue || '').localeCompare(b.nextDue || ''); })[0];
      msEl.innerHTML =
        '<div class="d-kv"><span>Next internal audit</span><b>' + (nextAudit ? fmtDate(nextAudit.planned) + ' — ' + esc(nextAudit.scope) : 'None scheduled') + '</b></div>' +
        '<div class="d-kv"><span>Next management review</span><b>' + (lastReview && lastReview.nextDue ? fmtDate(lastReview.nextDue) : 'Not set') + '</b></div>' +
        '<div class="d-kv"><span>Next ISMS activity</span><b>' + (upcomingCal ? fmtDate(upcomingCal.nextDue) + ' — ' + esc(upcomingCal.title) : 'None scheduled') + '</b></div>';
    }
  }

  /* ================= global search ================= */
  function buildSearchIndex(q) {
    var out = [];
    S.risks.forEach(function (r) {
      if (r.id.toLowerCase().indexOf(q) > -1 || r.title.toLowerCase().indexOf(q) > -1) {
        out.push({ type: 'Risk', id: r.id, label: r.id + ' — ' + r.title, view: 'risks' });
      }
    });
    S.actions.forEach(function (a) {
      if (a.id.toLowerCase().indexOf(q) > -1 || a.title.toLowerCase().indexOf(q) > -1) {
        out.push({ type: 'Action', id: a.id, label: a.id + ' — ' + a.title, view: 'actions' });
      }
    });
    S.controls.forEach(function (c) {
      /* skip rows the SoA wouldn't currently render for this control's
         framework (an essential8 parent, or a NIST subcategory hidden at
         category depth) — a search hit that can't be scrolled to on the
         resulting screen is worse than no hit at all. */
      if (!isControlVisible(c)) return;
      if (c.id.toLowerCase().indexOf(q) > -1 || c.t.toLowerCase().indexOf(q) > -1) {
        out.push({ type: 'Control', id: c.fw + '|' + c.id, label: c.id + ' — ' + c.t + ' (' + fwName(c.fw) + ')', view: 'soa', fw: c.fw });
      }
    });
    (S.audits || []).forEach(function (a) {
      if (a.id.toLowerCase().indexOf(q) > -1 || (a.scope || '').toLowerCase().indexOf(q) > -1) {
        out.push({ type: 'Audit', id: a.id, label: a.id + ' — ' + a.scope, view: 'audits' });
      }
    });
    (S.reviews || []).forEach(function (r) {
      if (r.id.toLowerCase().indexOf(q) > -1 || (r.attendees || '').toLowerCase().indexOf(q) > -1) {
        out.push({ type: 'Review', id: r.id, label: r.id + ' — ' + fmtDate(r.date) + ' (' + r.attendees + ')', view: 'reviews' });
      }
    });
    (S.calendar || []).forEach(function (c) {
      if (c.id.toLowerCase().indexOf(q) > -1 || c.title.toLowerCase().indexOf(q) > -1 || c.category.toLowerCase().indexOf(q) > -1) {
        out.push({ type: 'Calendar', id: c.id, label: c.id + ' — ' + c.title, view: 'calendar' });
      }
    });
    (S.vendors || []).forEach(function (v) {
      if (v.id.toLowerCase().indexOf(q) > -1 || v.name.toLowerCase().indexOf(q) > -1 || (v.service || '').toLowerCase().indexOf(q) > -1) {
        out.push({ type: 'Vendor', id: v.id, label: v.id + ' — ' + v.name, view: 'vendors' });
      }
    });
    if (S.entitlements && S.entitlements.iso42001) {
      (S.aiSystems || []).forEach(function (a) {
        if (a.id.toLowerCase().indexOf(q) > -1 || a.name.toLowerCase().indexOf(q) > -1 || (a.purpose || '').toLowerCase().indexOf(q) > -1) {
          out.push({ type: 'AISystem', id: a.id, label: a.id + ' — ' + a.name, view: 'aisystems' });
        }
      });
    }
    return out.slice(0, 20);
  }

  function scrollToRow(tbodyId, dataId) {
    setTimeout(function () {
      var row = document.querySelector('#' + tbodyId + ' tr[data-id="' + dataId + '"]');
      if (row) {
        row.scrollIntoView({ behavior: 'smooth', block: 'center' });
        row.classList.add('flash');
        setTimeout(function () { row.classList.remove('flash'); }, 1800);
      }
    }, 80);
  }

  /* ================= AI assistant (ai.js) =================
     app.js's job here is narrow and deliberate: wire ai.js's init()
     once (getToken/audit/getConfig), assemble the caller-side dataBag
     buildContext() serialises FROM (ai.js never reaches into S/Store
     itself — see ai.js's own comment), and render the { text,
     disclaimer } result with the review-before-use label always
     visible. Every actual governance rail (rate limiting, the system
     prompt, the disclaimer, audit logging, no tool-calling) lives in
     ai.js, not here — this file must not reimplement any of them. */
  var AI_CONTEXT_SECTION_LABELS = { scanSummary: 'Latest scan summary', soaSummary: 'Statement of Applicability summary', risks: 'Open risks', actions: 'Open actions', calendar: 'Upcoming calendar items' };

  function aiGetConfig() {
    return {
      endpoint: (S.settings && S.settings.aiEndpoint) || '',
      deployment: (S.settings && S.settings.aiDeployment) || '',
      enabled: !!(S.settings && S.settings.aiEnabled === 'true'),
      apiVersion: '2024-08-01-preview'
    };
  }

  function aiInitOnce() {
    if (typeof window.CheckpointAI === 'undefined') return;
    window.CheckpointAI.init({
      getToken: function () { return Graph.aiToken(); },
      getConfig: aiGetConfig,
      /* Deliberately only {feature, deployment, outcome, timestamp} —
         never prompt/response text (task's hard requirement). "user" is
         attached by audit() itself, same as every other audit entry in
         this app (it reads the signed-in account, not a value passed
         in). */
      audit: function (evt) {
        audit('AI call: ' + evt.feature, 'AiCall', evt.deployment || '', '', 'outcome=' + evt.outcome);
      }
    });
  }

  /* Builds the SAME shape ai.js's buildContext() section formatters
     expect, from whatever's already in S — this is the only place in
     the app that reaches into the live registers for the assistant;
     ai.js's own buildContext() only ever sees what's handed to it here.
     Deterministic ordering (risks/actions sorted worst/soonest first)
     matters because buildContext() truncates by simply taking the
     first N — see ai.js's own comment on why that's the right, and
     only, place truncation happens. */
  function aiBuildDataBag() {
    var last = S.scans[S.scans.length - 1];
    var readinessByFw = {};
    entitledFrameworks().forEach(function (fw) { readinessByFw[fw] = window.CheckpointLib.readinessPct(frameworkAppRows(fw)); });
    var byFramework = {};
    entitledFrameworks().forEach(function (fw) {
      var applicable = frameworkAppRows(fw);
      byFramework[fw] = { implemented: applicable.filter(function (c) { return c.st === 'Implemented'; }).length, total: applicable.length };
    });
    var totalApplicable = Object.keys(byFramework).reduce(function (n, fw) { return n + byFramework[fw].total; }, 0);
    var totalImplemented = Object.keys(byFramework).reduce(function (n, fw) { return n + byFramework[fw].implemented; }, 0);
    var openRisks = (S.risks || []).filter(function (r) { return r.status !== 'Closed'; })
      .slice().sort(function (a, b) { var qa = residual(a), qb = residual(b); return (qb.L * qb.I) - (qa.L * qa.I); })
      .map(function (r) { var q = residual(r); return { id: r.id, title: r.title, band: band(q.L * q.I), status: r.status }; });
    var openActions = (S.actions || []).filter(function (a) { return a.status !== 'Done'; })
      .slice().sort(function (a, b) { return (a.dueDate || '9999').localeCompare(b.dueDate || '9999'); })
      .map(function (a) { return { id: a.id, title: a.title, dueDate: a.dueDate, status: a.status }; });
    var upcomingCal = (S.calendar || []).filter(function (c) { return c.status !== 'Done'; })
      .slice().sort(function (a, b) { return (a.nextDue || '9999').localeCompare(b.nextDue || '9999'); })
      .map(function (c) { return { title: c.title, dueDate: c.nextDue }; });
    return {
      scanSummary: { postureScore: last ? last.score : null, lastScanDate: last ? last.date : null, criticalRisks: S.risks.filter(function (r) { if (r.status === 'Closed') return false; var q = residual(r); return band(q.L * q.I) === 'Critical' || band(q.L * q.I) === 'High'; }).length, readinessByFw: readinessByFw },
      soaSummary: { implemented: totalImplemented, total: totalApplicable, byFramework: byFramework },
      risks: openRisks,
      actions: openActions,
      calendar: upcomingCal
    };
  }

  function aiRenderContextChoices() {
    var el = document.getElementById('aiContextChoices');
    if (!el) return;
    var feature = window._aiFeature || 'chat';
    var allow = (window.CheckpointAI && window.CheckpointAI.FEATURE_CONTEXT_ALLOW[feature]) || [];
    if (!window._aiContextSel) window._aiContextSel = {};
    el.innerHTML = allow.map(function (key) {
      var checked = window._aiContextSel[key] !== false; /* default: everything this feature allows is included */
      return '<div style="display:flex;gap:8px;align-items:center;margin-bottom:6px">' +
        '<button class="toggle' + (checked ? ' on' : '') + '" role="switch" aria-checked="' + (checked ? 'true' : 'false') + '" aria-label="' + esc(AI_CONTEXT_SECTION_LABELS[key] || key) + '" data-action="App.aiToggleContext" data-id="' + key + '"></button>' +
        '<span>' + esc(AI_CONTEXT_SECTION_LABELS[key] || key) + '</span></div>';
    }).join('') || '<span style="font-size:12.5px;color:var(--paper-faint)">No register context is available to this option.</span>';
  }

  /* Friendly "AI not configured" card — never a broken/dead button. Shown
     whenever the 'ai' entitlement is on (the nav item is only visible
     then at all) but Settings isn't fully filled in yet, so a
     practitioner always sees why, and what to do next, instead of a
     silently-disabled Ask button. */
  function renderAiAssistant() {
    var cfg = aiGetConfig();
    document.getElementById('aiEndpointInput').value = cfg.endpoint;
    document.getElementById('aiDeploymentInput').value = cfg.deployment;
    var enabledToggle = document.getElementById('aiEnabledToggle');
    if (enabledToggle) { enabledToggle.classList.toggle('on', cfg.enabled); enabledToggle.setAttribute('aria-checked', cfg.enabled ? 'true' : 'false'); }
    var ready = cfg.enabled && cfg.endpoint && cfg.deployment;
    var notConfiguredEl = document.getElementById('aiNotConfigured');
    var configuredEl = document.getElementById('aiConfigured');
    if (!ready) {
      notConfiguredEl.innerHTML = '<div class="card" style="max-width:640px;color:var(--paper-dim)"><b style="color:var(--paper)">AI assistant not configured yet</b><p style="margin-top:8px;font-size:13px">Set your Azure OpenAI endpoint and deployment name above, tick "Enable the AI assistant", then Save — see <a href="AI-SETUP.md" target="_blank" rel="noopener">AI-SETUP.md</a> for provisioning the resource and the RBAC role assignment this needs.</p></div>';
      notConfiguredEl.style.display = '';
      configuredEl.style.display = 'none';
      return;
    }
    notConfiguredEl.style.display = 'none';
    configuredEl.style.display = '';
    aiRenderContextChoices();
  }

  /* ================= /AI assistant =================*/

  function renderFrameworksAdmin() {
    var wrap = document.getElementById('fwAdminRows');
    if (!wrap) return;

    renderEntitlementCard();

    var onboardedEl = document.getElementById('onboardedNote');
    if (onboardedEl) {
      var od = S.settings && S.settings.onboardedDate;
      onboardedEl.textContent = Store.kind === 'demo'
        ? 'Demo mode has no setup to re-run — sign in to a real tenant to use this.'
        : od ? ('Setup completed ' + fmtDate(od) + '.') : "Setup hasn't been completed yet.";
    }
    /* Demo mode: entitlements stay exactly what they always were — a
       free, self-service toggle, unaffected by this feature (there's
       no real tenant/entitlement file concept to verify against in
       demo). A real tenant's entitlements are now DERIVED from a
       signed file (see reconcileEntitlementsOnLoad()) — no toggle,
       just a status readout, since self-service toggling is exactly
       the honour system this feature replaces. Includes ADDON_MODULES
       (currently just 'ai') alongside the real frameworks — same
       toggle/status UI, since S.entitlements.<id> is checked the exact
       same way regardless of which list an id came from. */
    var ADDON_MODULE_INFO = { ai: { name: 'AI assistant', tag: 'Add-on', blurb: 'A drafting aid (policy language, evidence descriptions, risk notes, report commentary) grounded in your own registers — runs against your own Azure OpenAI resource, never a third party. See the AI assistant nav item once entitled.' } };
    wrap.innerHTML = window.FRAMEWORK_ORDER.concat(window.ADDON_MODULES || []).map(function (fw) {
      var f = window.FRAMEWORKS[fw] || ADDON_MODULE_INFO[fw];
      var on = !!(S.entitlements && S.entitlements[fw]);
      if (Store.kind === 'demo') {
        return '<div class="card fw-admin-row"><div><b>' + esc(f.name) + '</b><span class="fw-admin-tag">' + esc(f.tag) + '</span><p>' + esc(f.blurb) + '</p></div><button class="toggle' + (on ? ' on' : '') + '" role="switch" aria-checked="' + (on ? 'true' : 'false') + '" aria-label="' + esc(f.name) + '" data-action="App.toggleEntitlement" data-id="' + fw + '"></button></div>';
      }
      var statusLabel = fw === 'iso27001' ? 'Included baseline'
        : !on ? 'Not entitled'
        : (ENTITLEMENT_STATE && ENTITLEMENT_STATE.status === 'expired') ? 'Entitled — expired'
        : 'Entitled';
      var statusClass = fw === 'iso27001' || (on && (!ENTITLEMENT_STATE || ENTITLEMENT_STATE.status !== 'expired')) ? 'st-Implemented' : (on ? 'st-Proposed' : 'st-Notstarted');
      return '<div class="card fw-admin-row"><div><b>' + esc(f.name) + '</b><span class="fw-admin-tag">' + esc(f.tag) + '</span><p>' + esc(f.blurb) + '</p></div><span class="chip ' + statusClass + '">' + esc(statusLabel) + '</span></div>';
    }).join('');

    var reportEl = document.getElementById('reportSettingsRow');
    if (reportEl) {
      var classificationCurrent = (S.settings && S.settings.reportClassification) || 'Commercial in Confidence';
      var logoUrl = S.settings && S.settings.clientLogoUrl;
      reportEl.innerHTML = '<h3>Report branding</h3>' +
        '<p style="font-size:12.5px;color:var(--paper-dim);margin:0 0 12px">Cover-page classification marking and client logo for every generated report. Classification defaults to "Commercial in Confidence" — set it to "OFFICIAL: Sensitive" or another marking for a defence/government client.</p>' +
        '<div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-bottom:16px">' +
        '<input class="mini" id="reportClassificationInput" placeholder="Commercial in Confidence" value="' + esc(classificationCurrent) + '" style="flex:1;min-width:220px">' +
        '<button class="btn ghost sm" data-action="App.setReportClassification">Save</button>' +
        '</div>' +
        '<div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap">' +
        (logoUrl ? '<img src="' + esc(logoUrl) + '" alt="Client logo" style="max-height:40px;max-width:160px;object-fit:contain">' : '<span style="font-size:12.5px;color:var(--paper-faint)">No logo set — reports show client name only.</span>') +
        '<input type="file" id="clientLogoFileInput" class="mini" accept="image/*">' +
        '<button class="btn sm" data-action="App.uploadClientLogo">Upload logo</button>' +
        (logoUrl ? '<button class="btn ghost sm" data-action="App.clearClientLogo">Clear</button>' : '') +
        '</div>' +
        '<p class="src" style="margin-top:8px">PNG, JPG or SVG, under 40&nbsp;KB — a small wordmark or icon, not a full-resolution image.</p>';
    }

    var appetiteEl = document.getElementById('riskAppetiteRow');
    if (appetiteEl) {
      var current = (S.settings && S.settings.riskAppetite) || 'Medium';
      appetiteEl.innerHTML = '<div><b>Risk appetite</b><p>Any residual risk scoring above this level is flagged on the Dashboard and in reports as exceeding tolerance.</p></div>' +
        '<select class="mini" data-change-action="App.setRiskAppetite">' +
        ['Low', 'Medium', 'High', 'Critical'].map(function (s) { return '<option' + (current === s ? ' selected' : '') + '>' + s + '</option>'; }).join('') +
        '</select>';
    }

    var cadenceEl = document.getElementById('scanCadenceRow');
    if (cadenceEl) {
      var cadenceCurrent = (S.settings && S.settings.scanCadenceDays) || '30';
      cadenceEl.innerHTML = '<div><b>Posture scan reminder</b><p>The Dashboard flags a scan as overdue after this many days. There\'s no backend to run scans unattended — this is a nudge on load, not a schedule. See SETUP.md for wiring real automation via Power Automate.</p></div>' +
        '<select class="mini" data-change-action="App.setScanCadence">' +
        ['7', '14', '30', '60', '90'].map(function (s) { return '<option' + (cadenceCurrent === s ? ' selected' : '') + '>' + s + '</option>'; }).join('') +
        '</select>';
    }

    var digestEl = document.getElementById('digestRow');
    if (digestEl) {
      var digestOnCurrent = (S.settings && S.settings.digestEnabled) === 'true';
      var digestFreqCurrent = (S.settings && S.settings.digestFrequency) || 'Weekly';
      var digestRecipCurrent = (S.settings && S.settings.digestRecipients) || '';
      var digestLastSentCurrent = S.settings && S.settings.digestLastSent;
      digestEl.innerHTML =
        '<div class="fw-admin-row"><div><b>Email digest</b><p>A periodic summary — overdue actions, upcoming items, drift alerts and readiness — emailed to whoever you list below. There\'s no backend here to send this unattended: it\'s a nudge on load like the scan reminder above, until the scheduled monitor (SETUP.md § Continuous monitoring) is deployed to send it too.</p></div><button class="toggle' + (digestOnCurrent ? ' on' : '') + '" role="switch" aria-checked="' + (digestOnCurrent ? 'true' : 'false') + '" aria-label="Email digest enabled" data-action="App.toggleDigestEnabled"></button></div>' +
        '<div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-top:14px">' +
        '<input class="mini" id="digestRecipientsInput" placeholder="Recipients — comma-separated" value="' + esc(digestRecipCurrent) + '" style="flex:1;min-width:220px">' +
        '<select class="mini" data-change-action="App.setDigestFrequency">' + ['Weekly', 'Monthly'].map(function (f) { return '<option' + (digestFreqCurrent === f ? ' selected' : '') + '>' + f + '</option>'; }).join('') + '</select>' +
        '<button class="btn ghost sm" data-action="App.saveDigestRecipients">Save recipients</button>' +
        '<button class="btn sm" data-action="App.sendDigestNow">Send digest now</button>' +
        '</div>' +
        '<p class="src" style="margin-top:8px">Last sent: ' + (digestLastSentCurrent ? fmtDate(digestLastSentCurrent) : 'Never') + '</p>';
    }

    var e8El = document.getElementById('e8TargetLevelRow');
    if (e8El) {
      var e8Current = (S.settings && S.settings.e8TargetLevel) || 'ML2';
      e8El.innerHTML = '<div><b>Essential Eight target maturity</b><p>The Statement of Applicability shows only the maturity levels up to this target for each strategy, and Essential Eight readiness % is computed against it — not the full ML1-ML3 model. ML2 is the Commonwealth-entity default.</p></div>' +
        '<select class="mini" data-change-action="App.setE8TargetLevel">' +
        ['ML1', 'ML2', 'ML3'].map(function (s) { return '<option' + (e8Current === s ? ' selected' : '') + '>' + s + '</option>'; }).join('') +
        '</select>';
    }

    var nistEl = document.getElementById('nistDepthRow');
    if (nistEl) {
      var nistCurrent = (S.settings && S.settings.nistDepth) || 'category';
      nistEl.innerHTML = '<div><b>NIST CSF depth</b><p>At Category, the Statement of Applicability shows the 22 CSF 2.0 categories, as it always has. At Subcategory it shows all 106 subcategories grouped under their category, with each category\'s status derived from its children. Switching to Subcategory adds those 106 rows to this tenant\'s Controls list the first time — a light-touch client left at Category never gets them.</p></div>' +
        '<select class="mini" data-change-action="App.setNistDepth">' +
        ['category', 'subcategory'].map(function (s) { return '<option value="' + s + '"' + (nistCurrent === s ? ' selected' : '') + '>' + (s === 'category' ? 'Category (22)' : 'Subcategory (106)') + '</option>'; }).join('') +
        '</select>';
    }

    var dispEl = document.getElementById('dispTargetLevelRow');
    if (dispEl) {
      var dispCurrent = (S.settings && S.settings.dispTargetLevel) || 'L1';
      dispEl.innerHTML = '<div><b>DISP target membership level</b><p>The Statement of Applicability shows only DISP/IRAP controls at or below this level, and readiness % is computed against it — the same mechanism as Essential Eight\'s target maturity. Set this to the membership level the client holds or is pursuing.</p></div>' +
        '<select class="mini" data-change-action="App.setDispTargetLevel">' +
        ['Entry', 'L1', 'L2', 'L3'].map(function (s) { return '<option value="' + s + '"' + (dispCurrent === s ? ' selected' : '') + '>' + (s === 'Entry' ? 'Entry level' : 'Level ' + s.slice(1)) + '</option>'; }).join('') +
        '</select>';
    }

    var threshWrap = document.getElementById('thresholdRows');
    if (threshWrap) {
      threshWrap.innerHTML = window.THRESHOLD_DEFS.map(function (t) {
        var current = (S.settings && S.settings[t.key] !== undefined && S.settings[t.key] !== '') ? S.settings[t.key] : t.def;
        return '<div class="card fw-admin-row"><div><b>' + esc(t.label) + '</b><p>' + esc(t.desc) + '</p></div>' +
          '<input class="mini" type="number" min="0" style="width:70px" value="' + esc(current) + '" placeholder="' + esc(t.def) + '" data-change-action="App.setThreshold" data-id="' + t.key + '"></div>';
      }).join('');
    }

    var featWrap = document.getElementById('featureRows');
    if (featWrap) {
      featWrap.innerHTML = window.FEATURE_DEFS.map(function (f) {
        var on = featureOn(f.key);
        return '<div class="card fw-admin-row"><div><b>' + esc(f.label) + '</b><p>' + esc(f.desc) + '</p></div><button class="toggle' + (on ? ' on' : '') + '" role="switch" aria-checked="' + (on ? 'true' : 'false') + '" aria-label="' + esc(f.label) + '" data-action="App.toggleFeature" data-id="' + f.key + '"></button></div>';
      }).join('');
    }
  }

  function renderFeatureVisibility() {
    /* The Partner Console is internal-only UI — gated on licence type
       'partner' (see currentEntitlementType() above), not a per-client
       feature toggle. A 'client'/'demo' session never sees it
       regardless of feature flags. */
    var isPartner = currentEntitlementType() === 'partner';
    var partnerConsoleNav = document.querySelector('.nav-item[data-v="partnerconsole"]');
    if (partnerConsoleNav) {
      partnerConsoleNav.style.display = isPartner ? '' : 'none';
      if (!isPartner && partnerConsoleNav.classList.contains('on')) App.go('dash');
    }
    /* the whole AI Governance module — nav item, register, scan-time
       discovery (see runScan()) — is gated on the iso42001 entitlement,
       not a feature toggle: it's meaningless without that framework.
       Not to be confused with the AI ASSISTANT nav below — that one is
       ai.js's drafting assistant, an unrelated purchasable add-on. */
    var aiGovNav = document.querySelector('.nav-item[data-v="aisystems"]');
    if (aiGovNav) {
      var aiGovOn = !!(S.entitlements && S.entitlements.iso42001);
      aiGovNav.style.display = aiGovOn ? '' : 'none';
      if (!aiGovOn && aiGovNav.classList.contains('on')) App.go('dash');
    }
    /* AI assistant (ai.js) — gated on the 'ai' add-on entitlement (see
       window.ADDON_MODULES in store.js), same nav-hide-and-bounce
       pattern as every other licence-gated nav item on this page. The
       view itself ALSO renders an "AI not configured" card when the
       entitlement is on but Settings' aiEndpoint/aiDeployment/aiEnabled
       aren't set up yet — see renderAiAssistant(). */
    var aiAssistantNav = document.querySelector('.nav-item[data-v="aiassistant"]');
    if (aiAssistantNav) {
      var aiAssistantOn = !!(S.entitlements && S.entitlements.ai);
      aiAssistantNav.style.display = aiAssistantOn ? '' : 'none';
      if (!aiAssistantOn && aiAssistantNav.classList.contains('on')) App.go('dash');
    }
  }

  /* Persistent, unobtrusive banner for a 'demo' (sales trial) licence
     while it's still valid — "on expiry it follows the standard read-
     only degradation" (task spec) is exactly what already happens for
     every type once ENTITLEMENT_STATE.status flips to 'grace'/'expired'
     (see renderEntitlementCard()'s own banner for that) — this banner
     is ADDITIONAL, shown only during the active/'valid' phase, and
     purely informational (no dismiss button — it's meant to stay
     visible for the life of the trial, not be dismissed and forgotten). */
  function renderTrialBanner() {
    var el = document.getElementById('trialBanner');
    if (!el) return;
    var type = currentEntitlementType();
    if (type !== 'demo') { el.style.display = 'none'; return; }
    var daysRemaining;
    if (ENTITLEMENT_STATE && ENTITLEMENT_STATE.status === 'valid') {
      daysRemaining = ENTITLEMENT_STATE.daysRemaining;
    } else if (Store.kind === 'demo') {
      /* No real activation to read a real expiry from — demo mode is
         previewing what the banner LOOKS like (?entType=demo), not a
         real countdown, so this is a representative placeholder
         number, clearly not tied to any actual date. */
      daysRemaining = 12;
    } else {
      el.style.display = 'none';
      return;
    }
    el.style.display = 'flex';
    el.textContent = 'Trial — ' + daysRemaining + (daysRemaining === 1 ? ' day' : ' days') + ' remaining';
  }

  function renderAll() { renderNavCounts(); renderDash(); renderScanChecks(true); renderCoverage(); renderProposed(); renderRisks(); renderActions(); renderVendors(); renderAiSystems(); renderSoa(); renderFrameworksAdmin(); renderFeatureVisibility(); renderTrialBanner(); }

  function renderGaugeFromLast() {
    var last = S.scans[S.scans.length - 1], C = 2 * Math.PI * 52;
    var arc = document.getElementById('gArc');
    arc.style.strokeDasharray = C;
    if (last) {
      arc.style.strokeDashoffset = C * (1 - last.score / 100);
      document.getElementById('gNum').textContent = last.score;
      document.getElementById('gCap').textContent = 'Last scan ' + fmtDate(last.date);
    } else {
      arc.style.strokeDashoffset = C;
      document.getElementById('gNum').textContent = '—';
      document.getElementById('gCap').textContent = 'No scan yet';
    }
  }

  /* ================= app actions ================= */
  window.App = {
    go: function (v) {
      document.querySelectorAll('.view').forEach(function (x) { x.classList.remove('on'); });
      document.getElementById('v-' + v).classList.add('on');
      document.querySelectorAll('.nav-item').forEach(function (n) {
        var active = n.dataset.v === v;
        n.classList.toggle('on', active);
        if (active) n.setAttribute('aria-current', 'page'); else n.removeAttribute('aria-current');
      });
      window.scrollTo(0, 0);
      closeNavUi(); /* no-op on desktop (nav is never .open there) — on mobile, picking a destination should always close the drawer it was picked from */
      if (v === 'documents') renderDocuments();
      if (v === 'audits') renderAudits();
      if (v === 'reviews') renderReviews();
      if (v === 'calendar') renderCalendar();
      if (v === 'auditlog') renderAuditLog();
      if (v === 'board') renderBoard();
      if (v === 'sharedevidence') renderSharedEvidence();
      if (v === 'trustcenter') renderTrustCenter();
      if (v === 'auditorpack') renderAuditorPack();
      if (v === 'scan') renderCoverage();
      if (v === 'selftest') renderSelfTest();
      if (v === 'partnerconsole') renderPartnerConsole();
      if (v === 'aiassistant') renderAiAssistant();
    },

    searchInput: function (q) {
      var wrap = document.getElementById('gsearchResults');
      var input = document.getElementById('gsearchInput');
      var query = (q || '').trim().toLowerCase();
      window._searchHi = -1;
      if (!query) { wrap.style.display = 'none'; wrap.innerHTML = ''; input.setAttribute('aria-expanded', 'false'); input.removeAttribute('aria-activedescendant'); return; }
      var results = buildSearchIndex(query);
      window._searchResults = results;
      wrap.innerHTML = results.length
        ? results.map(function (r, i) { return '<div class="gsearch-row" id="gsearch-opt-' + i + '" role="option" aria-selected="false" data-mousedown-action="App.goToSearchResult" data-id="' + i + '"><span class="gs-type">' + esc(r.type) + '</span><span class="gs-label">' + esc(r.label) + '</span></div>'; }).join('')
        : '<div class="gsearch-empty">No matches for "' + esc(q) + '"</div>';
      wrap.style.display = 'block';
      input.setAttribute('aria-expanded', 'true');
    },

    closeSearch: function () {
      document.getElementById('gsearchResults').style.display = 'none';
      var input = document.getElementById('gsearchInput');
      input.setAttribute('aria-expanded', 'false');
      input.removeAttribute('aria-activedescendant');
      window._searchHi = -1;
    },

    /* Arrow-key navigation through the results list — the rows
       themselves are plain divs (data-mousedown-action, not real
       buttons, so the mousedown-before-blur ordering that lets a mouse
       click register before this input's blur handler closes the
       dropdown still works) and were keyboard-unreachable before this:
       a screen reader or keyboard-only user could type a query but had
       no way to act on a result. aria-activedescendant (on the input,
       which keeps real focus throughout) plus a highlighted .hi class
       is the standard combobox pattern for exactly this, rather than
       moving actual focus into the results list. */
    searchKeyNav: function (dir) {
      var results = window._searchResults || [];
      if (!results.length) return;
      var hi = window._searchHi === undefined ? -1 : window._searchHi;
      hi = Math.max(0, Math.min(results.length - 1, hi + dir));
      window._searchHi = hi;
      var rows = document.querySelectorAll('#gsearchResults .gsearch-row');
      rows.forEach(function (row, i) {
        row.classList.toggle('hi', i === hi);
        row.setAttribute('aria-selected', i === hi ? 'true' : 'false');
      });
      var input = document.getElementById('gsearchInput');
      if (rows[hi]) { input.setAttribute('aria-activedescendant', rows[hi].id); rows[hi].scrollIntoView({ block: 'nearest' }); }
    },

    searchKeySelect: function () {
      var hi = window._searchHi;
      if (hi === undefined || hi < 0) return;
      App.goToSearchResult(hi);
    },

    goToSearchResult: function (i) {
      var r = (window._searchResults || [])[i];
      if (!r) return;
      document.getElementById('gsearchInput').value = '';
      App.closeSearch();
      App.go(r.view);
      if (r.type === 'Risk') { setTimeout(function () { App.openRisk(r.id); }, 60); return; }
      if (r.type === 'Audit') { setTimeout(function () { App.openAudit(r.id); }, 60); return; }
      if (r.type === 'Review') { setTimeout(function () { App.openReview(r.id); }, 60); return; }
      if (r.type === 'Action') {
        window._actF = 'All'; window._actTypeF = 'All';
        renderActions();
        scrollToRow('actRows', r.id);
        return;
      }
      if (r.type === 'Control') {
        App.setSoaFw(r.fw);
        scrollToRow('soaRows', r.id);
        return;
      }
      if (r.type === 'Calendar') {
        scrollToRow('calRows', r.id);
        return;
      }
      if (r.type === 'Vendor') { setTimeout(function () { App.openVendor(r.id); }, 60); return; }
      if (r.type === 'AISystem') { setTimeout(function () { App.openAiSystem(r.id); }, 60); return; }
    },

    runScanFromDash: function () { App.go('scan'); App.runScan(); },

    runScan: async function () {
      var rows = document.querySelectorAll('#checkList .check-row');
      rows.forEach(function (r) { r.classList.remove('show'); });
      document.getElementById('gCap').textContent = Store.kind === 'demo'
        ? 'Scanning demo tenant…' : 'Scanning tenant via Microsoft Graph…';

      var todayIso = new Date().toISOString().slice(0, 10);
      if (Store.kind === 'sharepoint') {
        try {
          var out = await Graph.runPostureChecks(null, S.settings);
          S.lastResults = out.results;
          S.lastNotes = out.notes;
        } catch (e) { warn(e); document.getElementById('gCap').textContent = 'Scan failed'; return; }
        document.getElementById('gCap').textContent = 'Capturing evidence…';
        try { await captureAutoEvidence(out.raw, todayIso); } catch (e) { warn(e); }
        if (S.entitlements.iso42001) {
          try { await discoverAiSystemsFromScan(out.raw); } catch (e) { warn(e); }
        }
      }
      /* demo mode keeps its stored lastResults (with remediation flips via checkResult) */

      renderScanChecks(false);
      var rows2 = document.querySelectorAll('#checkList .check-row');
      rows2.forEach(function (r, i) { setTimeout(function () { r.classList.add('show'); }, 300 + i * 220); });

      var target = score();
      var arc = document.getElementById('gArc'), C = 2 * Math.PI * 52;
      arc.style.strokeDasharray = C; arc.style.strokeDashoffset = C;
      var t0 = null;
      function fr(ts) {
        if (!t0) t0 = ts; var p = Math.min((ts - t0) / 1800, 1), e = 1 - Math.pow(1 - p, 3);
        document.getElementById('gNum').textContent = Math.round(target * e);
        arc.style.strokeDashoffset = C * (1 - (target / 100) * e);
        if (p < 1) requestAnimationFrame(fr); else document.getElementById('gCap').textContent = 'Scan complete — ' + new Date().toLocaleDateString('en-AU');
      }
      requestAnimationFrame(fr);

      /* queue proposals for unhandled fail/review templated checks */
      S.proposed = [];
      window.CHECK_DEFS.forEach(function (c) {
        if (!c.tpl) return;
        var r = checkResult(c);
        if (r === 'pass' || r === null) return;
        if (S.handledTpl.indexOf(c.tpl) > -1) return;
        S.proposed.push(c.tpl);
      });

      /* Essential Eight maturity suggestions — a live check result maps
         to a SUGGESTED SoA status for the essential8 child control at
         the client's current target level; nothing is written until
         App.confirmE8Suggestion() is called from the SoA. Rebuilt fresh
         every scan, same ephemeral-until-actioned lifecycle as
         S.proposed above — a dismissed suggestion can resurface on a
         later scan if the live signal still disagrees with the
         recorded status.
         More than one check can map to the same strategy (mfa-all and
         mfa-priv both speak to E8.7) — grouped by target child control
         first and resolved to the single WORST suggested status among
         its contributing checks, so a passing baseline check can never
         paper over a failing stricter one for the same control. */
      S.e8Proposed = [];
      if (S.entitlements.essential8 && window.CHECK_E8) {
        var e8Target = e8Lvl(S.settings.e8TargetLevel);
        var E8_ST_RANK = { 'Not started': 0, 'In progress': 1, 'Implemented': 2 };
        var byChild = {}; /* childCode -> { suggestedSt, checkLabels: [] } */
        Object.keys(window.CHECK_E8).forEach(function (checkId) {
          var def = window.CHECK_DEFS.find(function (d) { return d.id === checkId; });
          if (!def) return;
          var r = checkResult(def);
          var suggestedSt = r === 'pass' ? 'Implemented' : r === 'review' ? 'In progress' : r === 'fail' ? 'Not started' : null;
          if (!suggestedSt) return;
          window.CHECK_E8[checkId].forEach(function (parentCode) {
            var childCode = parentCode + '-ML' + e8Target;
            var entry = byChild[childCode] || (byChild[childCode] = { suggestedSt: suggestedSt, checkLabels: [] });
            if (E8_ST_RANK[suggestedSt] < E8_ST_RANK[entry.suggestedSt]) entry.suggestedSt = suggestedSt;
            entry.checkLabels.push(def.label);
          });
        });
        Object.keys(byChild).forEach(function (childCode) {
          var entry = byChild[childCode];
          var ctrl = S.controls.find(function (c) { return c.fw === 'essential8' && c.id === childCode; });
          if (!ctrl || !ctrl.app || ctrl.st === entry.suggestedSt) return;
          S.e8Proposed.push({ checkLabel: entry.checkLabels.join(' · '), code: childCode, from: ctrl.st, to: entry.suggestedSt });
        });
      }

      var today = new Date().toISOString().slice(0, 10);
      var lastScan = S.scans[S.scans.length - 1];

      /* snapshot control-implementation readiness (primary framework, for
         the sparkline overlay, plus every entitled framework so its own
         KPI tile can trend), and the risk/overdue counts driving the other
         Dashboard tiles — so every tile can show a real vs-last-scan delta
         instead of a static number */
      var entitledNow = entitledFrameworks();
      var primaryFw = entitledNow.indexOf('iso27001') > -1 ? 'iso27001' : entitledNow[0];
      var readiness = null;
      var readinessByFw = {};
      entitledNow.forEach(function (fw) {
        var rApp = frameworkAppRows(fw);
        readinessByFw[fw] = rApp.length ? Math.round(rApp.filter(function (c) { return c.st === 'Implemented'; }).length / rApp.length * 100) : 0;
      });
      if (primaryFw) readiness = readinessByFw[primaryFw];
      var critNow = S.risks.filter(function (r) { if (r.status === 'Closed') return false; var q = residual(r); return band(q.L * q.I) === 'Critical' || band(q.L * q.I) === 'High'; }).length;
      var odNow = S.actions.filter(overdue).length;

      /* re-snapshot if anything a Dashboard tile trends against has moved,
         not just the score — otherwise completing an action or closing a
         risk between two same-day, same-score scans would leave every
         other tile's trend badge silently stuck */
      if (!lastScan || lastScan.date !== today || lastScan.score !== target ||
          lastScan.critRisks !== critNow || lastScan.overdueActions !== odNow) {
        var detail = JSON.stringify({ results: S.lastResults, notes: S.lastNotes, readiness: readiness, readinessByFw: readinessByFw, critRisks: critNow, overdueActions: odNow, source: 'manual' });
        Store.addScan({ date: today, score: target, detail: detail, readiness: readiness, readinessByFw: readinessByFw, critRisks: critNow, overdueActions: odNow, source: 'manual' }).catch(warn);
      }
      log('Posture scan completed — score <b>' + target + '</b>. ' + (S.proposed.length ? S.proposed.length + ' finding(s) proposed for the risk register.' : 'No new findings.'));
      Store.saveScanState().catch(warn);
      setTimeout(function () {
        renderProposed(); renderNavCounts(); renderDash(); renderSoa();
        if (S.proposed.length) toast('<b>' + S.proposed.length + ' proposed risk' + (S.proposed.length > 1 ? 's' : '') + '</b> awaiting your approval below');
        if (S.e8Proposed.length) toast('<b>' + S.e8Proposed.length + ' Essential Eight suggestion' + (S.e8Proposed.length > 1 ? 's' : '') + '</b> ready to review in the SoA');
      }, 2600);
    },

    approve: async function (tpl) {
      var t = TPL[tpl];
      var maxR = S.risks.reduce(function (m, r) { var n = parseInt(String(r.id).replace(/\D/g, ''), 10) || 0; return Math.max(m, n); }, 0);
      var maxA = S.actions.reduce(function (m, a) { var n = parseInt(String(a.id).replace(/\D/g, ''), 10) || 0; return Math.max(m, n); }, 0);
      var rid = 'R-' + String(maxR + 1).padStart(3, '0');
      var owner = (Graph.getAccount() && Graph.getAccount().name) || 'Practitioner';
      var actIds = t.actions.map(function (_, i) { return 'ACT-' + String(maxA + 1 + i).padStart(3, '0'); });
      busy(true);
      try {
        var newRisk = { id: rid, title: t.risk.title, cat: t.risk.cat, src: 'Posture scan', L: t.risk.L, I: t.risk.I, controls: t.risk.controls, owner: owner, status: 'Open', treat: 'Mitigate', actions: actIds, tpl: tpl };
        await Store.addRisk(newRisk);
        for (var i = 0; i < t.actions.length; i++) {
          var a = t.actions[i];
          await Store.addAction({ id: actIds[i], title: a.t, risk: rid, control: a.control, pr: a.pr, owner: owner, due: daysFrom(a.days), status: 'Open', src: 'Posture scan' });
        }
        S.handledTpl.push(tpl);
        S.proposed = S.proposed.filter(function (p) { return p !== tpl; });
        log('Risk <b>' + rid + '</b> approved into register from posture scan, with ' + actIds.length + ' action(s) assigned.');
        toast('<b>' + rid + '</b> added to risk register · ' + actIds.length + ' action(s) created');
        audit('Risk approved from scan finding', 'Risk', rid, '(proposed finding: ' + tpl + ')', 'Open — ' + actIds.length + ' action(s) created');
      } catch (e) { warn(e); }
      busy(false);
      renderAll();
    },

    dismiss: function (tpl) {
      S.handledTpl.push(tpl);
      S.proposed = S.proposed.filter(function (p) { return p !== tpl; });
      log('Scan finding dismissed by practitioner (' + tpl + ') — recorded with rationale.');
      audit('Scan finding dismissed', 'ScanFinding', tpl, 'Proposed', 'Dismissed');
      renderAll();
    },

    complete: async function (id) {
      var a = S.actions.find(function (x) { return x.id === id; });
      var evVals = await showModal({
        title: 'Complete action',
        fields: [{ id: 'ev', label: 'Evidence note for the audit trail', type: 'textarea', value: 'Configuration export captured to Evidence library', placeholder: 'e.g. CA policy export saved to Evidence/A.8.5' }],
        confirmText: 'Complete'
      });
      if (!evVals) return;
      var ev = evVals.ev;
      var prevStatus = a.status;
      a.status = 'Done'; a.evidence = ev;
      var r = risk(a.risk);
      busy(true);
      try {
        await Store.updateAction(a);
        if (r) {
          var q = residual(r);
          var allDone = r.actions.every(function (x) { var y = S.actions.find(function (z) { return z.id === x; }); return y && y.status === 'Done'; });
          if (allDone && r.status !== 'Closed') { r.status = 'Monitored'; }
          else if (r.status === 'Open') { r.status = 'In treatment'; }
          await Store.updateRisk(r);
          log('Action <b>' + id + '</b> completed. Evidence captured. Risk ' + r.id + ' residual now <b>' + (q.L * q.I) + ' — ' + band(q.L * q.I) + '</b>.');
          toast('Evidence captured · <b>' + r.id + '</b> residual recalculated to ' + (q.L * q.I) + ' (' + band(q.L * q.I) + ')');
        } else {
          log('Action <b>' + id + '</b> completed. Evidence captured.');
          toast('Evidence captured for <b>' + id + '</b>');
        }
        audit('Action completed', 'Action', id, prevStatus, 'Done: ' + ev);
      } catch (e) { warn(e); }
      busy(false);
      renderAll();
    },

    openRisk: function (id) {
      var r = risk(id), q = residual(r);
      var acts = r.actions.map(function (a) { return S.actions.find(function (x) { return x.id === a; }); }).filter(Boolean);
      document.getElementById('drawer').innerHTML =
        '<button class="x" data-action="App.closeDrawer">×</button>' +
        '<div class="id-t">' + r.id + ' · ' + esc(r.cat) + ' · Source: ' + esc(r.src) + '</div><h2>' + esc(r.title) + '</h2>' +
        '<div class="d-sec"><h4>Scoring</h4><div class="score-pair">' +
        '<div class="score-box"><b style="color:var(--paper-dim)">' + (r.L * r.I) + '</b><span>Inherent — ' + band(r.L * r.I) + '</span></div>' +
        '<div class="score-box" style="border-color:rgba(216,186,120,.4)"><b class="gold-t">' + (q.L * q.I) + '</b><span>Residual — ' + band(q.L * q.I) + '</span></div></div>' +
        '<div class="d-kv"><span>Treatment</span><b>' + r.treat + '</b></div><div class="d-kv"><span>Owner</span><b>' + esc(r.owner) + '</b></div><div class="d-kv"><span>Status</span><b>' + r.status + '</b></div></div>' +
        '<div class="d-sec"><h4>Linked controls (SoA)</h4>' + r.controls.map(function (c) {
          /* risk.controls store bare codes (e.g. "A.5.2"), and different
             frameworks legitimately reuse the same Annex A numbering —
             every risk in this app is ISO 27001-anchored, so prefer that
             framework's control to disambiguate. */
          var ctl = S.controls.find(function (x) { return x.id === c && x.fw === 'iso27001'; }) ||
                    S.controls.find(function (x) { return x.id === c; });
          return '<div class="d-kv"><span>' + c + ' — ' + (ctl ? esc(ctl.t) : '') + '</span><b>' + (ctl ? ctl.st : '') + '</b></div>';
        }).join('') + '</div>' +
        '<div class="d-sec"><h4>Treatment actions</h4>' + (acts.length ? acts.map(function (a) {
          return '<div class="d-kv"><span>' + a.id + ' — ' + esc(a.title) + '</span><b><span class="chip st-' + a.status.replace(/ /g, '') + '">' + a.status + '</span></b></div>';
        }).join('') : '<div class="d-kv"><span>None yet</span></div>') + '</div>' +
        '<div class="d-sec"><h4>Audit trail</h4><p style="font-size:12px;color:var(--paper-dim);line-height:1.7">' +
        (Store.kind === 'sharepoint'
          ? 'Every change to this risk is versioned in this tenant\'s SharePoint list history — scoring changes, treatment decisions and evidence links are automatically audit-ready.'
          : 'In a connected tenant, every change is versioned in SharePoint list history — automatically audit-ready.') + '</p></div>';
      openDrawerUi('Risk ' + r.id);
    },

    closeDrawer: function () {
      closeDrawerUi();
    },

    toggleNav: function () {
      var side = document.getElementById('appSide');
      if (side.classList.contains('open')) closeNavUi(); else openNavUi();
    },

    closeNav: function () {
      closeNavUi();
    },

    /* "What's new" — the same shared drawer every other detail view
       uses, populated from window.CHECKPOINT_CHANGELOG (changelog.js).
       Purely informational; never mutates anything, so it's reachable
       from the sidebar version tag regardless of read-only status. */
    openChangelog: function () {
      var list = window.CHECKPOINT_CHANGELOG || [];
      document.getElementById('drawer').innerHTML =
        '<button class="x" data-action="App.closeDrawer">×</button>' +
        '<div class="id-t">CHECKPOINT' + (window.CHECKPOINT_VERSION ? ' · v' + esc(window.CHECKPOINT_VERSION) : '') + '</div><h2>What\'s new</h2>' +
        (list.length ? list.map(function (rel) {
          return '<div class="d-sec"><h4>v' + esc(rel.version) + ' — ' + fmtDate(rel.date) + '</h4><ul style="margin:8px 0 0 18px;font-size:12.5px;color:var(--paper-dim);line-height:1.7">' +
            rel.entries.map(function (e) { return '<li style="margin-bottom:6px">' + esc(e) + '</li>'; }).join('') +
            '</ul></div>';
        }).join('') : '<div class="d-sec"><p style="color:var(--paper-dim);font-size:12.5px">No changelog available.</p></div>');
      openDrawerUi('What\'s new');
    },

    /* Control detail drawer for a SoA row — status/mapping (always) plus,
       when window.GUIDANCE has an entry for this control code, an
       implementation-guidance panel (how to implement, evidence an
       auditor expects, a link to the relevant admin portal, and the
       live scan result for any checks that speak to this control).
       Missing GUIDANCE keys fail soft: no panel, no error. */
    openControlGuidance: function (key) {
      var parts = key.split('|'), c = S.controls.find(function (x) { return x.fw === parts[0] && x.id === parts[1]; });
      if (!c) return;
      var maps = String(c.map || '').split('·').map(function (m) { return m.trim(); }).filter(Boolean);
      var g = window.GUIDANCE && window.GUIDANCE[c.id];
      var guidanceHtml = '';
      if (g) {
        var linkHtml = (g.link && isSafeUrl(g.link))
          ? '<p style="margin-top:8px"><a href="' + esc(g.link) + '" target="_blank" rel="noopener" class="evidence-link">Open admin portal ↗</a></p>' : '';
        var checksHtml = '';
        if (g.checks && g.checks.length) {
          checksHtml = '<div class="d-sec"><h4>Latest scan signal</h4>' + g.checks.map(function (cid) {
            var def = window.CHECK_DEFS.find(function (x) { return x.id === cid; });
            if (!def) return '';
            var r = checkResult(def);
            var cls = r === 'pass' ? 'st-Implemented' : r === 'review' ? 'st-Intreatment' : r === 'fail' ? 'st-Open' : r === 'manual' ? 'st-Proposed' : 'st-Notstarted';
            var lbl = r === 'pass' ? 'Pass' : r === 'review' ? 'Review' : r === 'fail' ? 'Fail' : r === 'manual' ? 'Manual — verify' : 'Not scanned';
            return '<div class="d-kv"><span>' + esc(def.label) + '</span><b><span class="chip ' + cls + '">' + lbl + '</span></b></div>';
          }).join('') + '</div>';
        }
        guidanceHtml = '<div class="d-sec"><h4>How to implement this</h4><p style="font-size:12.5px;color:var(--paper-dim);line-height:1.7">' + esc(g.how) + '</p>' +
          '<p style="margin-top:10px;font-size:12.5px;color:var(--paper-dim)"><b style="color:var(--paper)">Evidence an auditor expects:</b> ' + esc(g.evidence) + '</p>' + linkHtml + '</div>' + checksHtml;
      }
      document.getElementById('drawer').innerHTML =
        '<button class="x" data-action="App.closeDrawer">×</button>' +
        '<div class="id-t">' + esc(c.id) + '</div><h2>' + esc(c.t) + '</h2>' +
        '<div class="d-sec"><h4>Status</h4>' +
        '<div class="d-kv"><span>Applicable</span><b>' + (c.app ? 'Yes' : 'No') + '</b></div>' +
        '<div class="d-kv"><span>Status</span><b>' + (c.app ? c.st : 'N/A') + '</b></div>' +
        '<div class="d-kv"><span>Owner</span><b>' + esc(c.own || '—') + '</b></div>' +
        '<div class="d-kv"><span>Verified</span><b>' + (c.verified ? fmtDate(c.verified) : '—') + '</b></div>' +
        '<div class="d-kv"><span>Evidence</span><b>' + (c.evidenceUrl && isSafeUrl(c.evidenceUrl) ? '<a href="' + esc(c.evidenceUrl) + '" target="_blank" rel="noopener">Link ↗</a>' : '—') + '</b></div></div>' +
        (maps.length ? '<div class="d-sec"><h4>Also satisfies</h4>' + maps.map(function (m) { return '<div class="d-kv"><span>' + esc(m) + '</span></div>'; }).join('') + '</div>' : '') +
        guidanceHtml;
      openDrawerUi('Control ' + c.id);
    },

    filterRisk: function (f) { window._riskF = f; renderRisks(); },
    filterAct: function (f) { window._actF = f; renderActions(); },
    filterActType: function (t) { window._actTypeF = t; renderActions(); },
    filterVendorCrit: function (f) { window._vendorCritF = f; renderVendors(); },
    filterVendorStatus: function (f) { window._vendorStatusF = f; renderVendors(); },
    filterAiTier: function (f) { window._aiTierF = f; renderAiSystems(); },
    filterAiStatus: function (f) { window._aiStatusF = f; renderAiSystems(); },

    toggleAddAction: function () {
      var panel = document.getElementById('addActionPanel');
      var showing = panel.style.display !== 'none';
      panel.style.display = showing ? 'none' : 'block';
      if (!showing) {
        ['naTitle', 'naControl', 'naOwner'].forEach(function (id) { document.getElementById(id).value = ''; });
        document.getElementById('naDue').value = daysFrom(14);
      }
    },

    addManualAction: async function () {
      var title = document.getElementById('naTitle').value.trim();
      if (!title) { toast('Enter a title or finding description first'); return; }
      var maxA = S.actions.reduce(function (m, a) { var n = parseInt(String(a.id).replace(/\D/g, ''), 10) || 0; return Math.max(m, n); }, 0);
      var a = {
        id: 'ACT-' + String(maxA + 1).padStart(3, '0'),
        title: title,
        type: document.getElementById('naType').value,
        risk: '',
        control: document.getElementById('naControl').value.trim(),
        pr: document.getElementById('naPriority').value,
        owner: document.getElementById('naOwner').value.trim() || 'Unassigned',
        due: document.getElementById('naDue').value || daysFrom(14),
        status: 'Open',
        evidenceUrl: '',
        src: document.getElementById('naSource').value
      };
      busy(true);
      try {
        await Store.addAction(a);
        log('<b>' + a.id + '</b> (' + esc(a.type) + ') added from ' + esc(a.src) + ': ' + esc(a.title));
        toast('<b>' + a.id + '</b> added');
        audit('Action added', 'Action', a.id, '', a.type + ': ' + a.title);
      } catch (e) { warn(e); }
      busy(false);
      App.toggleAddAction();
      renderActions(); renderNavCounts();
    },

    /* the vendor form's data-category pills — window._vendorCatSel holds
       the current selection while the form is open; the suggestion line
       recomputes from lib.js's suggestVendorCriticality on every toggle
       so "what data do they touch" visibly drives "how critical are
       they" instead of criticality being an unprompted gut call */
    renderVendorCategoryPicker: function () {
      var wrap = document.getElementById('vDataCategories');
      if (!wrap) return;
      var sel = window._vendorCatSel || [];
      wrap.innerHTML = window.VENDOR_DATA_CATEGORIES.map(function (cat) {
        return '<button type="button" class="f-pill' + (sel.indexOf(cat) > -1 ? ' on' : '') + '" aria-pressed="' + (sel.indexOf(cat) > -1 ? 'true' : 'false') + '" data-action="App.toggleVendorCategory" data-id="' + esc(cat) + '">' + esc(cat) + '</button>';
      }).join('');
      var hint = document.getElementById('vCritSuggestion');
      if (hint) {
        hint.textContent = sel.length
          ? 'Suggested criticality based on data access: ' + window.CheckpointLib.suggestVendorCriticality(sel)
          : '';
      }
    },

    toggleVendorCategory: function (cat) {
      var sel = window._vendorCatSel = window._vendorCatSel || [];
      var i = sel.indexOf(cat);
      if (i > -1) sel.splice(i, 1); else sel.push(cat);
      App.renderVendorCategoryPicker();
    },

    toggleAddVendor: function () {
      var panel = document.getElementById('addVendorPanel');
      var showing = panel.style.display !== 'none';
      panel.style.display = showing ? 'none' : 'block';
      if (!showing) {
        window._editingVendorId = null;
        window._vendorCatSel = [];
        App.renderVendorCategoryPicker();
        document.getElementById('vendorPanelTitle').textContent = 'New vendor';
        ['vName', 'vService', 'vDataAccessed', 'vOwner', 'vCertifications', 'vContactEmail', 'vControls', 'vRiskRefs', 'vNotes'].forEach(function (id) { document.getElementById(id).value = ''; });
        document.getElementById('vCriticality').value = 'Medium';
        document.getElementById('vReviewStatus').value = 'Not started';
        document.getElementById('vNextReviewDue').value = daysFrom(365);
      }
    },

    editVendor: function (id) {
      var v = (S.vendors || []).find(function (x) { return x.id === id; });
      if (!v) return;
      window._editingVendorId = id;
      document.getElementById('vendorPanelTitle').textContent = 'Edit ' + v.id;
      document.getElementById('vName').value = v.name;
      document.getElementById('vService').value = v.service;
      document.getElementById('vDataAccessed').value = v.dataAccessed || '';
      document.getElementById('vCriticality').value = v.criticality;
      document.getElementById('vReviewStatus').value = v.reviewStatus;
      document.getElementById('vNextReviewDue').value = v.nextReviewDue || '';
      document.getElementById('vOwner').value = v.owner;
      document.getElementById('vCertifications').value = v.certifications || '';
      document.getElementById('vContactEmail').value = v.contactEmail || '';
      document.getElementById('vControls').value = (v.controls || []).join(', ');
      document.getElementById('vRiskRefs').value = (v.riskRefs || []).join(', ');
      document.getElementById('vNotes').value = v.notes || '';
      window._vendorCatSel = (v.dataCategories || []).slice();
      App.renderVendorCategoryPicker();
      App.closeDrawer();
      document.getElementById('addVendorPanel').style.display = 'block';
      document.getElementById('addVendorPanel').scrollIntoView({ behavior: 'smooth', block: 'center' });
    },

    saveVendor: async function () {
      var name = document.getElementById('vName').value.trim();
      if (!name) { toast('Enter a vendor name first'); return; }
      var controls = document.getElementById('vControls').value.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
      var riskRefs = document.getElementById('vRiskRefs').value.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
      var nextReviewDue = document.getElementById('vNextReviewDue').value;
      var editingId = window._editingVendorId;

      busy(true);
      try {
        if (editingId) {
          var v = (S.vendors || []).find(function (x) { return x.id === editingId; });
          if (!v) { busy(false); return; }
          var prevStatus = v.reviewStatus, prevDue = v.nextReviewDue;
          v.name = name; v.service = document.getElementById('vService').value.trim();
          v.dataAccessed = document.getElementById('vDataAccessed').value.trim();
          v.criticality = document.getElementById('vCriticality').value;
          v.reviewStatus = document.getElementById('vReviewStatus').value;
          v.nextReviewDue = nextReviewDue;
          v.owner = document.getElementById('vOwner').value.trim() || 'Unassigned';
          v.certifications = document.getElementById('vCertifications').value.trim();
          v.contactEmail = document.getElementById('vContactEmail').value.trim();
          v.controls = controls; v.riskRefs = riskRefs;
          v.dataCategories = (window._vendorCatSel || []).slice();
          v.notes = document.getElementById('vNotes').value.trim();
          await Store.updateVendor(v);
          await syncVendorCalendar(v);
          audit('Vendor updated', 'Vendor', v.id, prevStatus + ' / due ' + (prevDue || 'unset'), v.reviewStatus + ' / due ' + (v.nextReviewDue || 'unset'));
          log('<b>' + v.id + '</b> updated: ' + esc(v.name) + '.');
          toast('<b>' + v.id + '</b> updated');
        } else {
          var maxV = (S.vendors || []).reduce(function (m, x) { var n = parseInt(String(x.id).replace(/\D/g, ''), 10) || 0; return Math.max(m, n); }, 0);
          var nv = {
            id: 'VEN-' + String(maxV + 1).padStart(3, '0'), name: name,
            service: document.getElementById('vService').value.trim(),
            dataAccessed: document.getElementById('vDataAccessed').value.trim(),
            criticality: document.getElementById('vCriticality').value,
            reviewStatus: document.getElementById('vReviewStatus').value,
            lastReviewed: '', nextReviewDue: nextReviewDue,
            owner: document.getElementById('vOwner').value.trim() || 'Unassigned',
            certifications: document.getElementById('vCertifications').value.trim(),
            contactEmail: document.getElementById('vContactEmail').value.trim(),
            controls: controls, riskRefs: riskRefs,
            dataCategories: (window._vendorCatSel || []).slice(),
            notes: document.getElementById('vNotes').value.trim(),
            questionnaireStatus: 'Not sent', questionnaireSentDate: '', calRef: ''
          };
          await Store.addVendor(nv);
          await syncVendorCalendar(nv);
          audit('Vendor added', 'Vendor', nv.id, '', nv.name + ' (' + nv.criticality + ')');
          log('<b>' + nv.id + '</b> added to the vendor register: ' + esc(nv.name) + '.');
          toast('<b>' + nv.id + '</b> added');
        }
      } catch (e) { warn(e); }
      busy(false);
      App.toggleAddVendor();
      renderVendors(); renderNavCounts(); renderCalendar();
    },

    openVendor: function (id) {
      var v = (S.vendors || []).find(function (x) { return x.id === id; });
      if (!v) return;
      var od = vendorOverdue(v);
      var linkedControls = (v.controls || []).map(function (code) {
        var ctl = S.controls.find(function (x) { return x.id === code; });
        return '<div class="d-kv"><span>' + esc(code) + (ctl ? ' — ' + esc(ctl.t) : '') + '</span><b>' + (ctl ? esc(ctl.st) : '') + '</b></div>';
      }).join('') || '<div class="d-kv"><span>No controls linked</span></div>';
      var linkedRisks = (v.riskRefs || []).map(function (rid) {
        var r = risk(rid);
        return '<div class="d-kv"><span>' + esc(rid) + (r ? ' — ' + esc(r.title) : '') + '</span></div>';
      }).join('') || '<div class="d-kv"><span>No risks linked</span></div>';
      document.getElementById('drawer').innerHTML =
        '<button class="x" data-action="App.closeDrawer">×</button>' +
        '<div class="id-t">' + v.id + ' · ' + esc(v.criticality) + ' criticality</div><h2>' + esc(v.name) + '</h2>' +
        '<p style="color:var(--paper-dim);font-size:13px;margin-top:6px">' + esc(v.service) + '</p>' +
        '<div class="d-sec"><h4>Review</h4>' +
        '<div class="d-kv"><span>Status</span><b><span class="chip st-' + v.reviewStatus.replace(/ /g, '') + '">' + esc(v.reviewStatus) + '</span></b></div>' +
        '<div class="d-kv"><span>Last reviewed</span><b>' + (v.lastReviewed ? fmtDate(v.lastReviewed) : 'Never') + '</b></div>' +
        '<div class="d-kv"><span>Next review due</span><b style="' + (od ? 'color:var(--fail)' : '') + '">' + (v.nextReviewDue ? fmtDate(v.nextReviewDue) + (od ? ' ⚑ overdue' : '') : 'Not set') + '</b></div>' +
        '<div class="d-kv"><span>Owner</span><b>' + esc(v.owner) + '</b></div>' +
        '<div class="d-kv"><span>Certifications</span><b>' + esc(v.certifications || '—') + '</b></div>' +
        '<div class="d-kv"><span>Data categories</span><b>' + ((v.dataCategories && v.dataCategories.length)
          ? '<span class="fw-chips">' + v.dataCategories.map(function (c) { return '<span>' + esc(c) + '</span>'; }).join('') + '</span>'
          : '<span style="color:var(--warn)">Not classified — edit this vendor to record what data they access</span>') + '</b></div>' +
        ((v.dataCategories && v.dataCategories.length && window.CheckpointLib.suggestVendorCriticality(v.dataCategories) !== v.criticality)
          ? '<div class="d-kv"><span>Suggested criticality</span><b style="color:var(--gold-light)">' + esc(window.CheckpointLib.suggestVendorCriticality(v.dataCategories)) + ' (currently ' + esc(v.criticality) + ')</b></div>'
          : '') +
        '<div class="d-kv"><span>Data access detail</span><b>' + esc(v.dataAccessed || '—') + '</b></div>' +
        (v.notes ? '<div class="d-kv"><span>Notes</span><b>' + esc(v.notes) + '</b></div>' : '') + '</div>' +
        '<div class="d-sec"><h4>Security questionnaire</h4>' +
        '<div class="d-kv"><span>Status</span><b>' + esc(v.questionnaireStatus || 'Not sent') + '</b></div>' +
        (v.questionnaireSentDate ? '<div class="d-kv"><span>Sent</span><b>' + fmtDate(v.questionnaireSentDate) + '</b></div>' : '') +
        '<div class="d-kv"><span>Contact</span><b>' + esc(v.contactEmail || 'Not set') + '</b></div></div>' +
        '<div class="d-sec"><h4>Linked controls (SoA)</h4>' + linkedControls + '</div>' +
        '<div class="d-sec"><h4>Linked risks</h4>' + linkedRisks + '</div>' +
        '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:16px">' +
        '<button class="btn sm" data-action="App.sendVendorQuestionnaire" data-id="' + v.id + '">Send questionnaire</button>' +
        '<button class="btn sm" data-action="App.markVendorReviewed" data-id="' + v.id + '">Mark reviewed</button>' +
        '<button class="btn ghost sm" data-action="App.editVendor" data-id="' + v.id + '">Edit</button>' +
        '</div>';
      openDrawerUi('Vendor ' + v.name);
    },

    sendVendorQuestionnaire: async function (id) {
      var v = (S.vendors || []).find(function (x) { return x.id === id; });
      if (!v) return;
      if (Store.kind === 'demo') { toast('Sending email isn\'t available in demo mode — sign in to a real tenant to use this.'); return; }
      var toVals = await showModal({
        title: 'Send questionnaire',
        fields: [{ id: 'to', label: 'Send to (email address)', type: 'email', value: v.contactEmail || '', placeholder: 'security@vendor.example' }],
        confirmText: 'Send',
        validate: function (vv) { return isValidEmail(vv.to) ? null : 'Enter a valid email address.'; }
      });
      if (!toVals) return;
      var to = toVals.to;
      busy(true);
      try {
        var clientLabel = document.getElementById('clientName').textContent;
        var body = '<div style="font-family:Arial,sans-serif;color:#222;max-width:600px">' +
          '<h2 style="margin-bottom:4px">Vendor security questionnaire — ' + esc(clientLabel) + '</h2>' +
          '<p>Hello,</p>' +
          '<p>As part of our ongoing supplier security review programme, please complete our vendor security questionnaire for <b>' + esc(v.name) + '</b> (' + esc(v.service) + ').</p>' +
          ((v.dataCategories && v.dataCategories.length)
            ? '<p>Our records indicate your systems access the following categories of our data — please confirm or correct this list in your reply:</p><ul>' + v.dataCategories.map(function (c) { return '<li>' + esc(c) + '</li>'; }).join('') + '</ul>'
            : '<p>Please describe the categories of our data your systems access (e.g. customer PII, financial data, credentials, production system access).</p>') +
          '<p>Please also reply with your current SOC 2 / ISO 27001 (or equivalent) certification status, where our data is stored and processed (regions/sub-processors), and how it is encrypted at rest and in transit.</p>' +
          '<p style="color:#999;font-size:11px;margin-top:24px">Sent from Checkpoint by Compliance365 on behalf of ' + esc(clientLabel) + '.</p>' +
          '</div>';
        await Graph.sendMail(to, 'Security questionnaire — ' + v.name + ' / ' + clientLabel, body);
        var prevStatus = v.questionnaireStatus;
        v.questionnaireStatus = 'Sent';
        v.questionnaireSentDate = new Date().toISOString().slice(0, 10);
        v.contactEmail = v.contactEmail || to;
        await Store.updateVendor(v);
        audit('Vendor questionnaire sent', 'Vendor', v.id, prevStatus || 'Not sent', 'Sent to ' + to);
        log('Security questionnaire sent to <b>' + esc(to) + '</b> for vendor <b>' + esc(v.name) + '</b>.');
        toast('Questionnaire sent to <b>' + esc(to) + '</b>');
      } catch (e) { warn(e); }
      busy(false);
      renderVendors();
      if (document.getElementById('drawer').classList.contains('open')) App.openVendor(id);
    },

    markVendorReviewed: async function (id) {
      var v = (S.vendors || []).find(function (x) { return x.id === id; });
      if (!v) return;
      var dueVals = await showModal({
        title: 'Mark reviewed',
        fields: [{ id: 'nextDue', label: 'Next review due', type: 'date', value: daysFrom(365) }],
        confirmText: 'Mark reviewed'
      });
      if (!dueVals) return;
      var prevStatus = v.reviewStatus, prevDue = v.nextReviewDue;
      v.lastReviewed = new Date().toISOString().slice(0, 10);
      v.nextReviewDue = dueVals.nextDue || daysFrom(365);
      v.reviewStatus = 'Reviewed';
      busy(true);
      try {
        await Store.updateVendor(v);
        await syncVendorCalendar(v);
        audit('Vendor reviewed', 'Vendor', v.id, prevStatus + ' / due ' + (prevDue || 'unset'), 'Reviewed / due ' + v.nextReviewDue);
      } catch (e) { warn(e); }
      busy(false);
      log('<b>' + v.id + '</b> marked reviewed — next review ' + fmtDate(v.nextReviewDue) + '.');
      toast('<b>' + v.id + '</b> marked reviewed');
      renderVendors(); renderNavCounts(); renderCalendar(); renderDash();
      if (document.getElementById('drawer').classList.contains('open')) App.openVendor(id);
    },

    toggleAddAiSystem: function () {
      var panel = document.getElementById('addAiSystemPanel');
      var showing = panel.style.display !== 'none';
      panel.style.display = showing ? 'none' : 'block';
      if (!showing) {
        window._editingAiId = null;
        document.getElementById('aiPanelTitle').textContent = 'New AI system';
        ['aiName', 'aiPurpose', 'aiOwner', 'aiModelType', 'aiVendor', 'aiDataSources', 'aiHumanOversight'].forEach(function (id) { document.getElementById(id).value = ''; });
        document.getElementById('aiRiskTier').value = 'Limited';
        document.getElementById('aiImpactStatus').value = 'Not started';
        document.getElementById('aiLastReviewed').value = '';
      }
    },

    editAiSystem: function (id) {
      var a = (S.aiSystems || []).find(function (x) { return x.id === id; });
      if (!a) return;
      window._editingAiId = id;
      document.getElementById('aiPanelTitle').textContent = 'Edit ' + a.id;
      document.getElementById('aiName').value = a.name;
      document.getElementById('aiPurpose').value = a.purpose || '';
      document.getElementById('aiOwner').value = a.owner;
      document.getElementById('aiRiskTier').value = a.riskTier;
      document.getElementById('aiModelType').value = a.modelType || '';
      document.getElementById('aiVendor').value = a.vendor || '';
      document.getElementById('aiDataSources').value = a.dataSources || '';
      document.getElementById('aiImpactStatus').value = a.impactAssessmentStatus;
      document.getElementById('aiLastReviewed').value = a.lastReviewed || '';
      document.getElementById('aiHumanOversight').value = a.humanOversight || '';
      App.closeDrawer();
      document.getElementById('addAiSystemPanel').style.display = 'block';
      document.getElementById('addAiSystemPanel').scrollIntoView({ behavior: 'smooth', block: 'center' });
    },

    saveAiSystem: async function (prefill) {
      var name = document.getElementById('aiName').value.trim();
      if (!name) { toast('Enter a system name first'); return; }
      var editingId = window._editingAiId;
      busy(true);
      try {
        if (editingId) {
          var a = (S.aiSystems || []).find(function (x) { return x.id === editingId; });
          if (!a) { busy(false); return; }
          var prevStatus = a.impactAssessmentStatus;
          a.name = name; a.purpose = document.getElementById('aiPurpose').value.trim();
          a.owner = document.getElementById('aiOwner').value.trim() || 'Unassigned';
          a.riskTier = document.getElementById('aiRiskTier').value;
          a.modelType = document.getElementById('aiModelType').value.trim();
          a.vendor = document.getElementById('aiVendor').value.trim();
          a.dataSources = document.getElementById('aiDataSources').value.trim();
          a.impactAssessmentStatus = document.getElementById('aiImpactStatus').value;
          a.lastReviewed = document.getElementById('aiLastReviewed').value;
          a.humanOversight = document.getElementById('aiHumanOversight').value.trim();
          await Store.updateAiSystem(a);
          audit('AI system updated', 'AISystem', a.id, prevStatus, a.impactAssessmentStatus);
          log('<b>' + a.id + '</b> updated: ' + esc(a.name) + '.');
          toast('<b>' + a.id + '</b> updated');
        } else {
          var maxA = (S.aiSystems || []).reduce(function (m, x) { var n = parseInt(String(x.id).replace(/\D/g, ''), 10) || 0; return Math.max(m, n); }, 0);
          var na = {
            id: 'AI-' + String(maxA + 1).padStart(3, '0'), name: name,
            purpose: document.getElementById('aiPurpose').value.trim(),
            owner: document.getElementById('aiOwner').value.trim() || 'Unassigned',
            riskTier: document.getElementById('aiRiskTier').value,
            modelType: document.getElementById('aiModelType').value.trim(),
            vendor: document.getElementById('aiVendor').value.trim(),
            dataSources: document.getElementById('aiDataSources').value.trim(),
            impactAssessmentStatus: document.getElementById('aiImpactStatus').value,
            lastReviewed: document.getElementById('aiLastReviewed').value,
            humanOversight: document.getElementById('aiHumanOversight').value.trim(),
            spId: (prefill && prefill.spId) || ''
          };
          await Store.addAiSystem(na);
          audit('AI system added', 'AISystem', na.id, '', na.name + ' (' + na.riskTier + ')');
          log('<b>' + na.id + '</b> added to the AI systems register: ' + esc(na.name) + '.');
          toast('<b>' + na.id + '</b> added');
        }
      } catch (e) { warn(e); }
      busy(false);
      App.toggleAddAiSystem();
      renderAiSystems(); renderNavCounts();
    },

    openAiSystem: function (id) {
      var a = (S.aiSystems || []).find(function (x) { return x.id === id; });
      if (!a) return;
      var linkedControls = aiControlsFor(a).map(function (code) {
        var ctl = S.controls.find(function (x) { return x.fw === 'iso42001' && x.id === code; });
        return '<div class="d-kv"><span>' + esc(code) + (ctl ? ' — ' + esc(ctl.t) : '') + '</span><b>' + (ctl ? esc(ctl.st) : '') + '</b></div>';
      }).join('');
      document.getElementById('drawer').innerHTML =
        '<button class="x" data-action="App.closeDrawer">×</button>' +
        '<div class="id-t">' + a.id + ' · ' + esc(a.riskTier) + ' risk (EU AI Act)</div><h2>' + esc(a.name) + '</h2>' +
        '<p style="color:var(--paper-dim);font-size:13px;margin-top:6px">' + esc(a.purpose) + '</p>' +
        '<div class="d-sec"><h4>Governance</h4>' +
        '<div class="d-kv"><span>Impact assessment</span><b><span class="chip st-' + a.impactAssessmentStatus.replace(/ /g, '') + '">' + esc(a.impactAssessmentStatus) + '</span></b></div>' +
        '<div class="d-kv"><span>Last reviewed</span><b>' + (a.lastReviewed ? fmtDate(a.lastReviewed) : 'Never') + '</b></div>' +
        '<div class="d-kv"><span>Owner</span><b>' + esc(a.owner) + '</b></div>' +
        '<div class="d-kv"><span>Vendor</span><b>' + esc(a.vendor || '—') + '</b></div>' +
        '<div class="d-kv"><span>Model type</span><b>' + esc(a.modelType || '—') + '</b></div>' +
        '<div class="d-kv"><span>Data sources</span><b>' + esc(a.dataSources || '—') + '</b></div>' +
        '<div class="d-kv"><span>Human oversight</span><b>' + esc(a.humanOversight || 'Not documented') + '</b></div></div>' +
        '<div class="d-sec"><h4>ISO 42001 controls evidenced</h4>' + (linkedControls || '<div class="d-kv"><span>None yet — document more fields to evidence more controls</span></div>') + '</div>' +
        '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:16px">' +
        '<button class="btn sm" data-action="App.advanceAiImpactStatus" data-id="' + a.id + '">Advance impact assessment</button>' +
        '<button class="btn ghost sm" data-action="App.editAiSystem" data-id="' + a.id + '">Edit</button>' +
        '</div>';
      openDrawerUi('AI system ' + a.name);
    },

    advanceAiImpactStatus: async function (id) {
      var a = (S.aiSystems || []).find(function (x) { return x.id === id; });
      if (!a) return;
      var idx = AI_IMPACT_STATUSES.indexOf(a.impactAssessmentStatus);
      var next = AI_IMPACT_STATUSES[Math.min(idx + 1, AI_IMPACT_STATUSES.length - 1)];
      if (next === a.impactAssessmentStatus) { toast('Impact assessment is already Completed'); return; }
      var prevStatus = a.impactAssessmentStatus;
      a.impactAssessmentStatus = next;
      a.lastReviewed = new Date().toISOString().slice(0, 10);
      busy(true);
      try {
        await Store.updateAiSystem(a);
        audit('AI system impact assessment advanced', 'AISystem', a.id, prevStatus, next);
      } catch (e) { warn(e); }
      busy(false);
      log('<b>' + a.id + '</b> impact assessment moved to <b>' + esc(next) + '</b>.');
      toast('<b>' + a.id + '</b> — ' + esc(next));
      renderAiSystems();
      if (document.getElementById('drawer').classList.contains('open')) App.openAiSystem(id);
    },

    addAiCandidate: async function (spId) {
      var c = (S.aiCandidates || []).find(function (x) { return x.id === spId; });
      if (!c) return;
      window._editingAiId = null;
      App.toggleAddAiSystem();
      document.getElementById('aiName').value = c.name;
      document.getElementById('aiVendor').value = c.name;
      document.getElementById('aiModelType').value = 'Third-party SaaS (enterprise app grant detected)';
      document.getElementById('aiPurpose').value = 'Detected via OAuth consent grant — confirm actual purpose and update before relying on this record.';
      await App.saveAiSystem({ spId: c.id });
      S.aiCandidates = (S.aiCandidates || []).filter(function (x) { return x.id !== spId; });
      renderAiSystems(); renderNavCounts();
    },

    dismissAiCandidate: function (spId) {
      if (!window._aiDismissedThisSession) window._aiDismissedThisSession = {};
      window._aiDismissedThisSession[spId] = true;
      S.aiCandidates = (S.aiCandidates || []).filter(function (x) { return x.id !== spId; });
      log('AI system candidate dismissed by practitioner.');
      audit('AI system candidate dismissed', 'AISystem', spId, 'Candidate', 'Dismissed');
      renderAiSystems(); renderNavCounts();
    },

    setSoaFw: function (fw) { window._soaFw = fw; window._soaCat = 'All'; renderSoa(); },
    filterSoaCat: function (cat) { window._soaCat = cat; renderSoa(); },

    toggleApp: async function (key) {
      var parts = key.split('|'), c = S.controls.find(function (x) { return x.fw === parts[0] && x.id === parts[1]; });
      if (!c) return;
      var wasApp = c.app;
      c.app = !c.app;
      if (!c.app) { c.st = 'Not applicable'; } else if (c.st === 'Not applicable') { c.st = 'Not started'; }
      try { await Store.updateControl(c); } catch (e) { warn(e); }
      audit('Applicability toggled', 'Control', key, wasApp ? 'Applicable' : 'Not applicable', c.app ? 'Applicable' : 'Not applicable');
      renderSoa(); renderDash();
    },

    setSt: async function (key, v) {
      var parts = key.split('|'), c = S.controls.find(function (x) { return x.fw === parts[0] && x.id === parts[1]; });
      if (!c) return;
      if (v === 'Implemented' && !c.evidenceUrl) {
        var proceed = await showModal({
          title: 'No evidence linked',
          message: 'Marking this Implemented with no linked evidence. Auditors typically require evidence for every implemented control — continue anyway?',
          confirmText: 'Mark Implemented'
        });
        if (!proceed) { renderSoa(); return; } /* reset the <select> back to the real value */
      }
      var prevSt = c.st;
      c.st = v;
      try { await Store.updateControl(c); } catch (e) { warn(e); }
      log('<b>' + c.id + '</b> ' + esc(c.t) + ' → ' + v + '.');
      audit('Control status changed', 'Control', key, prevSt, v);
      renderSoa(); renderDash();
    },

    verifyControl: async function (key) {
      var parts = key.split('|'), c = S.controls.find(function (x) { return x.fw === parts[0] && x.id === parts[1]; });
      if (!c) return;
      if (!c.evidenceUrl) {
        var proceed = await showModal({
          title: 'No evidence linked',
          message: 'This control has no linked evidence. Auditors typically require evidence for every implemented control — verify anyway?',
          confirmText: 'Verify anyway'
        });
        if (!proceed) return;
      }
      var attester = (typeof Graph !== 'undefined' && Graph.getAccount() && Graph.getAccount().name) || 'Practitioner';
      var prevVerified = c.verified;
      c.verified = new Date().toISOString().slice(0, 10);
      c.verifiedBy = attester;
      try { await Store.updateControl(c); } catch (e) { warn(e); }
      log('<b>' + c.id + '</b> re-verified as ' + esc(c.st) + ' by <b>' + esc(attester) + '</b>.');
      toast('<b>' + c.id + '</b> verified by ' + esc(attester));
      audit('Control verified', 'Control', key, prevVerified || 'never verified', c.verified + ' by ' + attester);
      renderSoa();
    },

    setControlEvidence: async function (key) {
      var parts = key.split('|'), c = S.controls.find(function (x) { return x.fw === parts[0] && x.id === parts[1]; });
      if (!c) return;
      var urlVals = await showModal({
        title: 'Link evidence',
        fields: [{ id: 'url', label: 'Evidence URL (SharePoint/OneDrive) — leave blank to clear', value: c.evidenceUrl || '', placeholder: 'https://…' }],
        confirmText: 'Save',
        validate: function (v) { return (!v.url || isSafeUrl(v.url)) ? null : 'Evidence link must start with http:// or https://'; }
      });
      if (!urlVals) return;
      var url = urlVals.url;
      var prevUrl = c.evidenceUrl;
      c.evidenceUrl = url;
      /* a practitioner setting this by hand always wins — clear the
         auto-capture tag so the SoA's evidence coverage indicator
         correctly shows it as manually linked, not auto-captured, the
         moment a human touches it */
      if (url && c.verifiedBy === AUTO_EVIDENCE_TAG) c.verifiedBy = '';
      try { await Store.updateControl(c); } catch (e) { warn(e); }
      audit('Evidence link changed', 'Control', key, prevUrl || '(none)', url || '(none)');
      renderSoa();
    },

    setSharedEvidenceControl: function (key) {
      window._sharedEvidenceKey = key;
      renderSharedEvidence();
    },

    applySharedEvidence: async function () {
      var key = window._sharedEvidenceKey;
      if (!key) return;
      var parts = key.split('|'), start = S.controls.find(function (x) { return x.fw === parts[0] && x.id === parts[1]; });
      if (!start) return;
      var urlInput = document.getElementById('sharedEvidenceUrlInput');
      var url = (urlInput ? urlInput.value : '').trim();
      if (!url) { toast('Enter an evidence URL first'); return; }
      if (!isSafeUrl(url)) { toast('Evidence link must start with http:// or https://'); return; }

      var closure = sharedEvidenceClosure(start);
      var frameworksTouched = {};
      closure.forEach(function (c) { frameworksTouched[c.fw] = true; });
      var fwCount = Object.keys(frameworksTouched).length;
      /* an explicit, visible, one-time bulk action the practitioner
         chose to run — unlike auto-capture's silent "only fill empty
         ones", this deliberately overwrites whatever was there, same as
         picking "Edit" on each row individually would */
      var proceed = await showModal({
        title: 'Apply shared evidence?',
        message: 'Apply this evidence to all ' + closure.length + ' control(s) across ' + fwCount + ' framework(s)? Any existing evidence link on those controls will be replaced.',
        confirmText: 'Apply to all ' + closure.length
      });
      if (!proceed) return;

      var attester = (typeof Graph !== 'undefined' && Graph.getAccount() && Graph.getAccount().name) || 'Practitioner';
      var today = new Date().toISOString().slice(0, 10);
      busy(true);
      for (var i = 0; i < closure.length; i++) {
        var c = closure[i];
        var prevUrl = c.evidenceUrl;
        c.evidenceUrl = url;
        c.verifiedBy = attester;
        c.verified = today;
        try { await Store.updateControl(c); } catch (e) { warn(e); continue; }
        audit('Evidence link changed (shared evidence)', 'Control', c.fw + '|' + c.id, prevUrl || '(none)', url);
      }
      busy(false);
      log('Shared evidence applied to <b>' + closure.length + '</b> control(s) across <b>' + fwCount + '</b> framework(s).');
      toast('Evidence applied to <b>' + closure.length + '</b> control(s)');
      renderSharedEvidence();
      renderSoa();
    },

    toggleTrustCenterSetting: async function (key) {
      var next = S.settings[key] === 'true' ? 'false' : 'true';
      S.settings[key] = next;
      try { await Store.setSetting(key, next); } catch (e) { warn(e); }
      renderTrustCenter();
    },

    saveTrustCenterSettings: async function () {
      var name = document.getElementById('tcCompanyName').value.trim();
      var email = document.getElementById('tcContactEmail').value.trim();
      S.settings.trustCenterCompanyName = name;
      S.settings.trustCenterContactEmail = email;
      busy(true);
      try {
        await Store.setSetting('trustCenterCompanyName', name);
        await Store.setSetting('trustCenterContactEmail', email);
      } catch (e) { warn(e); }
      busy(false);
      toast('Trust Center settings saved');
    },

    toggleVendorPublicListed: async function (id) {
      var v = (S.vendors || []).find(function (x) { return x.id === id; });
      if (!v) return;
      var prev = v.publicListed;
      v.publicListed = !v.publicListed;
      try { await Store.updateVendor(v); } catch (e) { warn(e); }
      audit('Vendor public-listing changed', 'Vendor', id, prev ? 'Listed' : 'Not listed', v.publicListed ? 'Listed' : 'Not listed');
      renderTrustCenter();
    },

    generateTrustCenter: async function () {
      if (Store.kind === 'demo') { toast('Generating and saving files isn\'t available in demo mode — sign in to a real tenant to use this.'); return; }
      busy(true);
      try {
        var clientLabel = document.getElementById('clientName').textContent;
        var companyName = S.settings.trustCenterCompanyName || clientLabel;
        var today = new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' });
        var entitled = entitledFrameworks();

        var certsHtml = '';
        if (S.settings.trustCenterShowCerts === 'true') {
          certsHtml = '<h2>Certifications &amp; frameworks</h2><div class="tc-grid">' + entitled.map(function (fw) {
            var rows = frameworkAppRows(fw);
            var pct = window.CheckpointLib.readinessPct(rows);
            return '<div class="tc-card"><b>' + esc(fwName(fw)) + '</b>' + (S.settings.trustCenterShowSoaPct === 'true' ? '<span>' + pct + '% of applicable controls implemented</span>' : '') + '</div>';
          }).join('') + '</div>';
        }

        var postureHtml = '';
        if (S.settings.trustCenterShowPosture === 'true') {
          var last = S.scans[S.scans.length - 1];
          var postureBand = !last ? 'Not yet assessed' : last.score >= 80 ? 'Strong' : last.score >= 50 ? 'Developing' : 'Needs improvement';
          var autoScans = S.scans.filter(function (s) { return s.source === 'automated'; });
          postureHtml = '<h2>Security posture</h2><p class="tc-p"><b>' + esc(postureBand) + '.</b> ' + (autoScans.length ? 'Posture is continuously monitored with automated daily checks.' : 'Posture is assessed via periodic internal review.') + '</p>';
        }

        var subsHtml = '';
        if (S.settings.trustCenterShowSubProcessors === 'true') {
          var pub = (S.vendors || []).filter(function (v) { return v.publicListed; });
          subsHtml = '<h2>Sub-processors</h2>' + (pub.length
            ? '<table class="tc-table"><tr><th>Name</th><th>Service</th></tr>' + pub.map(function (v) { return '<tr><td>' + esc(v.name) + '</td><td>' + esc(v.service) + '</td></tr>'; }).join('') + '</table>'
            : '<p class="tc-p">No sub-processors currently published.</p>');
        }

        var contactHtml = S.settings.trustCenterContactEmail ? '<h2>Contact</h2><p class="tc-p">Security questions: <a href="mailto:' + esc(S.settings.trustCenterContactEmail) + '">' + esc(S.settings.trustCenterContactEmail) + '</a></p>' : '';

        var html = buildStandaloneHtml({
          title: esc(companyName) + ' — Trust Center',
          bodyHtml: '<div class="tc-mast"><h1>' + esc(companyName) + '</h1><p>Trust Center · generated ' + today + '</p></div>' +
            certsHtml + postureHtml + subsHtml + contactHtml +
            '<div class="tc-foot">This page reflects information as of its generation date (' + today + ') and must be regenerated to stay current. Prepared with Compliance365 Checkpoint.</div>',
          extraCss: STANDALONE_CSS
        });

        var filename = 'trust-center-' + new Date().toISOString().slice(0, 10) + '.html';
        var file = new File([html], filename, { type: 'text/html' });
        var uploaded = await Store.uploadDocument(file, 'Trust Center');
        audit('Trust Center page generated', 'Document', filename, '',
          'certs:' + S.settings.trustCenterShowCerts + ' soaPct:' + S.settings.trustCenterShowSoaPct + ' posture:' + S.settings.trustCenterShowPosture + ' subProcessors:' + S.settings.trustCenterShowSubProcessors);
        log('Trust Center page generated: <b>' + esc(filename) + '</b>.');
        toast('Trust Center page generated');
        document.getElementById('tcResult').innerHTML =
          '<div class="card"><h3>Generated</h3><p style="font-size:13px;color:var(--paper-dim)">Saved to Documents → Trust Center as <b>' + esc(filename) + '</b>.</p>' +
          '<p style="font-size:13px;color:var(--paper-dim);margin-top:8px"><a href="' + esc(uploaded.url) + '" target="_blank" rel="noopener" class="evidence-link">Open the file ↗</a></p>' +
          '<h4 style="margin-top:14px;font-size:13px">Next step — make it public</h4>' +
          '<p style="font-size:12.5px;color:var(--paper-dim)">In SharePoint, open the file, choose <b>Share</b> → <b>People with the link can view</b> → <b>Anyone</b> (or whichever sharing policy this tenant allows), then paste that link on your website. Checkpoint never sets sharing permissions itself — this is a deliberate SharePoint action you take.</p></div>';
      } catch (e) { warn(e); }
      busy(false);
    },

    generateAuditorPack: async function () {
      if (Store.kind === 'demo') { toast('Generating and saving files isn\'t available in demo mode — sign in to a real tenant to use this.'); return; }
      var fw = document.getElementById('apFramework').value;
      if (!fw) { toast('No framework available — enable one from the Frameworks view first'); return; }
      var validityDays = parseInt(document.getElementById('apValidity').value, 10) || 30;
      var scopeNote = document.getElementById('apScopeNote').value.trim();
      busy(true);
      try {
        var clientLabel = document.getElementById('clientName').textContent;
        var todayD = new Date();
        var todayStr = todayD.toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' });
        var validUntil = new Date(todayD.getTime() + validityDays * 86400000).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' });
        var practitioner = (typeof Graph !== 'undefined' && Graph.getAccount() && Graph.getAccount().name) || 'Practitioner';

        var rows = frameworkVisibleRows(fw);
        var soaHtml = '<h2>Statement of Applicability — ' + esc(fwName(fw)) + '</h2><table class="tc-table"><tr><th>Control</th><th>Title</th><th>Applicable</th><th>Status</th><th>Evidence</th></tr>' +
          rows.map(function (c) {
            var ev = (c.evidenceUrl && isSafeUrl(c.evidenceUrl)) ? '<a href="' + esc(c.evidenceUrl) + '">Evidence ↗</a>' : '—';
            return '<tr><td>' + esc(c.id) + '</td><td>' + esc(c.t) + (c.just ? '<div class="tc-src">Exclusion: ' + esc(c.just) + '</div>' : '') + '</td><td>' + (c.app ? 'Yes' : 'No') + '</td><td>' + esc(c.st) + '</td><td>' + ev + '</td></tr>';
          }).join('') + '</table>';

        var docs = await Store.listDocuments().catch(function () { return []; });
        var evidenceDocs = docs.filter(function (d) { return d.category === 'Evidence' || d.category === 'Auto-evidence'; });
        var evidenceHtml = '<h2>Evidence index</h2>' + (evidenceDocs.length
          ? '<table class="tc-table"><tr><th>File</th><th>Category</th><th>Last modified</th></tr>' + evidenceDocs.map(function (d) {
              return '<tr><td><a href="' + esc(d.url) + '">' + esc(d.name) + '</a></td><td>' + esc(d.category || '—') + '</td><td>' + fmtDate(d.modified) + '</td></tr>';
            }).join('') + '</table><p class="tc-p" style="margin-top:8px">Evidence links point to items in this tenant\'s SharePoint — confirm the auditor has been granted access to the Evidence and Auto-evidence folders, or share those files separately.</p>'
          : '<p class="tc-p">No evidence documents recorded yet.</p>');

        var auditLogWindow = (S.auditLog || []).slice(0, 50);
        var auditLogHtml = '<h2>Audit log excerpt (' + auditLogWindow.length + ' most recent entries)</h2>' + (auditLogWindow.length
          ? '<table class="tc-table"><tr><th>When</th><th>Actor</th><th>Action</th><th>Target</th></tr>' + auditLogWindow.map(function (e) {
              var when = e.entryDateTime ? new Date(e.entryDateTime).toLocaleDateString('en-AU') : '—';
              return '<tr><td>' + esc(when) + '</td><td>' + esc(e.actor) + '</td><td>' + esc(e.action) + '</td><td>' + esc(e.targetType) + ' ' + esc(e.targetId) + '</td></tr>';
            }).join('') + '</table>'
          : '<p class="tc-p">No audit log entries recorded yet.</p>');

        var lastReview = (S.reviews || [])[S.reviews.length - 1];
        var reviewHtml = '<h2>Latest management review</h2>' + (lastReview
          ? '<p class="tc-p"><b>' + fmtDate(lastReview.date) + '</b> · Attendees: ' + esc(lastReview.attendees) + '</p><p class="tc-p"><b>Inputs:</b> ' + esc(lastReview.inputs) + '</p><p class="tc-p"><b>Decisions:</b> ' + esc(lastReview.decisions) + '</p>'
          : '<p class="tc-p">No management review recorded yet.</p>');

        var html = buildStandaloneHtml({
          title: esc(clientLabel) + ' — Auditor Pack',
          bodyHtml: '<div class="tc-mast"><h1>' + esc(clientLabel) + ' — Auditor Pack</h1><p>Prepared ' + todayStr + ' by ' + esc(practitioner) + ' · Intended validity until ' + validUntil + '</p></div>' +
            (scopeNote ? '<p class="tc-p"><b>Scope:</b> ' + esc(scopeNote) + '</p>' : '') +
            '<p class="tc-p">This pack was assembled from live Checkpoint registers on the date shown above. Evidence and audit log content reflect the state of the tenant at that time.</p>' +
            soaHtml + evidenceHtml + auditLogHtml + reviewHtml +
            '<div class="tc-foot">Generated by Compliance365 Checkpoint. Access to this file is governed entirely by the SharePoint sharing link it was distributed through — Checkpoint has no visibility into who opens it.</div>',
          extraCss: STANDALONE_CSS
        });

        var filename = 'auditor-pack-' + fw + '-' + new Date().toISOString().slice(0, 10) + '.html';
        var file = new File([html], filename, { type: 'text/html' });
        var uploaded = await Store.uploadDocument(file, 'Auditor Pack');
        audit('Auditor pack generated', 'Document', filename, '', fwName(fw) + ' · valid until ' + validUntil);
        log('Auditor pack generated: <b>' + esc(filename) + '</b>.');
        toast('Auditor pack generated');
        document.getElementById('apResult').innerHTML =
          '<div class="card"><h3>Generated</h3><p style="font-size:13px;color:var(--paper-dim)">Saved to Documents → Auditor Pack as <b>' + esc(filename) + '</b>. Intended to remain valid until <b>' + validUntil + '</b>.</p>' +
          '<p style="font-size:13px;color:var(--paper-dim);margin-top:8px"><a href="' + esc(uploaded.url) + '" target="_blank" rel="noopener" class="evidence-link">Open the file ↗</a></p>' +
          '<h4 style="margin-top:14px;font-size:13px">Next step — share with the auditor</h4>' +
          '<p style="font-size:12.5px;color:var(--paper-dim)">In SharePoint, open the file, choose <b>Share</b>, set <b>Anyone with the link</b> (or <b>Specific people</b> for the auditor\'s email), and set an <b>expiration date</b> — SharePoint enforces that expiry natively; Checkpoint does not track or revoke it. If any evidence files are linked above, share those the same way or grant access to their folders.</p></div>';
      } catch (e) { warn(e); }
      busy(false);
    },

    setActionEvidence: async function (id) {
      var a = S.actions.find(function (x) { return x.id === id; });
      if (!a) return;
      var urlVals = await showModal({
        title: 'Link evidence',
        fields: [{ id: 'url', label: 'Evidence URL (SharePoint/OneDrive) — leave blank to clear', value: a.evidenceUrl || '', placeholder: 'https://…' }],
        confirmText: 'Save',
        validate: function (v) { return (!v.url || isSafeUrl(v.url)) ? null : 'Evidence link must start with http:// or https://'; }
      });
      if (!urlVals) return;
      var url = urlVals.url;
      var prevUrl = a.evidenceUrl;
      a.evidenceUrl = url;
      try { await Store.updateAction(a); } catch (e) { warn(e); }
      audit('Evidence link changed', 'Action', id, prevUrl || '(none)', url || '(none)');
      renderActions();
    },

    uploadDocument: async function () {
      var input = document.getElementById('docFileInput');
      var file = input.files && input.files[0];
      if (!file) { toast('Choose a file first'); return; }
      var category = document.getElementById('docCategory').value || 'Other';
      busy(true);
      try {
        await Store.uploadDocument(file, category);
        log('Document uploaded to <b>' + esc(category) + '</b>: <b>' + esc(file.name) + '</b>.');
        toast('<b>' + esc(file.name) + '</b> uploaded');
        input.value = '';
      } catch (e) { warn(e); }
      busy(false);
      renderDocuments();
    },

    filterDocCat: function (c) { window._docCatF = c; renderDocuments(); },

    previewTemplate: function () { renderTemplatePreview(); },

    /* Personalise the selected POLICY_TEMPLATES entry, open it as a
       print-ready preview (same pattern as App.report()), and — outside
       demo mode — save a copy into Documents under "Policies &
       Procedures" via the existing upload path. The saved copy is
       DRAFT-watermarked; the generation parameters are recorded in the
       audit log so App.approveTemplate() can regenerate a clean copy
       later without needing a second store for draft/approved state. */
    generateTemplate: async function () {
      var sel = document.getElementById('tplSelect');
      var t = sel && window.POLICY_TEMPLATES.find(function (x) { return x.id === sel.value; });
      if (!t) return;
      var owner = (document.getElementById('tplOwner').value || '').trim();
      if (!owner) { toast('Enter a document owner before generating.'); return; }
      var reviewDate = document.getElementById('tplReviewDate').value || '';
      var clientLabel = document.getElementById('clientName').textContent || 'This organisation';
      var generatedDate = new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' });
      var html = buildTemplateHtml(t, { clientLabel: clientLabel, owner: owner, reviewDate: reviewDate, approved: false, generatedDate: generatedDate });
      var filename = t.title + '.html';

      if (!printPreview(t.title, html)) return;

      if (Store.kind === 'demo') {
        toast('Generated for preview — sign in to a real tenant to save it to Documents.');
        return;
      }
      var doc;
      try {
        var file = new File([new Blob([html], { type: 'text/html' })], filename, { type: 'text/html' });
        doc = await Store.uploadDocument(file, 'Policies & Procedures');
      } catch (e) {
        warn(e);
        toast('Generated for preview, but could not save to Documents: ' + esc(e.message || e));
        return;
      }
      audit('Policy template generated', 'Document', filename, '(none)', JSON.stringify({ tplId: t.id, owner: owner, reviewDate: reviewDate, clientLabel: clientLabel }));
      renderDocuments();
      toast('Saved <b>' + esc(filename) + '</b> to Policies &amp; Procedures — marked DRAFT until approved.');

      if (t.controls.length) {
        var link = await showModal({
          title: 'Link as evidence?',
          message: 'Link this document as evidence for ' + t.controls.length + ' control' + (t.controls.length > 1 ? 's' : '') + ' it helps satisfy: ' + t.controls.join(', ') + '?',
          confirmText: 'Link evidence',
          cancelText: 'Not now'
        });
        if (link) {
          t.controls.forEach(function (code) {
            var c = S.controls.find(function (x) { return x.id === code && x.fw === 'iso27001'; }) || S.controls.find(function (x) { return x.id === code; });
            if (!c) return;
            var prevUrl = c.evidenceUrl;
            c.evidenceUrl = doc.url;
            Store.updateControl(c).catch(function (e) { warn(e); });
            audit('Evidence link changed', 'Control', c.fw + '|' + c.id, prevUrl || '(none)', doc.url);
          });
          renderSoa();
          toast('Linked as evidence to ' + t.controls.length + ' control' + (t.controls.length > 1 ? 's' : '') + '.');
        }
      }
    },

    /* Regenerates the same document without the DRAFT watermark and
       re-saves it under the same filename (Graph's small-file upload is
       an upsert-by-path, so this replaces the draft in place). Recovers
       the original owner/review date/client from the 'Policy template
       generated' audit entry — the only durable record of them, per the
       design note above buildTemplateHtml(). */
    approveTemplate: async function (key) {
      var parts = key.split('|'), category = parts[0], name = parts.slice(1).join('|');
      var genEntry = (S.auditLog || []).find(function (e) { return e.targetType === 'Document' && e.targetId === name && e.action === 'Policy template generated'; });
      var params = null;
      try { params = genEntry && JSON.parse(genEntry.after); } catch (e) { params = null; }
      var t = params && window.POLICY_TEMPLATES.find(function (x) { return x.id === params.tplId; });
      if (!t) { toast('Could not recover this document\'s template data — approve it directly in SharePoint if needed.'); return; }
      var ok = await showModal({
        title: 'Mark approved',
        message: 'Mark "' + name + '" as approved? This re-saves it to Documents without the draft watermark.',
        confirmText: 'Approve',
        cancelText: 'Cancel'
      });
      if (!ok) return;
      var generatedDate = new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' });
      var html = buildTemplateHtml(t, { clientLabel: params.clientLabel, owner: params.owner, reviewDate: params.reviewDate, approved: true, generatedDate: generatedDate });
      try {
        var file = new File([new Blob([html], { type: 'text/html' })], name, { type: 'text/html' });
        await Store.uploadDocument(file, category);
      } catch (e) { warn(e); toast('Could not save the approved copy: ' + esc(e.message || e)); return; }
      audit('Policy document approved', 'Document', name, 'Draft', 'Approved');
      renderDocuments();
      toast('<b>' + esc(name) + '</b> marked approved.');
    },

    emailStatusUpdate: async function () {
      if (Store.kind === 'demo') { toast('Sending email isn\'t available in demo mode — sign in to a real tenant to use this.'); return; }
      var toVals = await showModal({
        title: 'Email status update',
        fields: [{ id: 'to', label: 'Send to (comma-separated email addresses)', placeholder: 'ceo@client.example, board@client.example' }],
        confirmText: 'Send',
        validate: function (v) {
          if (!v.to) return 'Enter at least one email address.';
          var bad = v.to.split(',').map(function (s) { return s.trim(); }).filter(Boolean).find(function (addr) { return !isValidEmail(addr); });
          return bad ? ('"' + bad + '" doesn\'t look like a valid email address.') : null;
        }
      });
      if (!toVals) return;
      var to = toVals.to;
      busy(true);
      try {
        var last = S.scans[S.scans.length - 1];
        var entitled = entitledFrameworks();
        var primaryFw = entitled.indexOf('iso27001') > -1 ? 'iso27001' : entitled[0];
        var pApp = primaryFw ? frameworkAppRows(primaryFw) : [];
        var implCount = pApp.filter(function (c) { return c.st === 'Implemented'; }).length;
        var readyPct = window.CheckpointLib.readinessPct(pApp);
        var crit = S.risks.filter(function (r) { if (r.status === 'Closed') return false; var q = residual(r); return band(q.L * q.I) === 'Critical' || band(q.L * q.I) === 'High'; }).length;
        var od = S.actions.filter(overdue).length;
        var topRisks = S.risks.filter(function (r) { return r.status !== 'Closed'; }).slice()
          .sort(function (a, b) { var qa = residual(a), qb = residual(b); return (qb.L * qb.I) - (qa.L * qa.I); }).slice(0, 3);
        var nextAudit = (S.audits || []).filter(function (a) { return a.status === 'Planned'; }).sort(function (a, b) { return (a.planned || '').localeCompare(b.planned || ''); })[0];
        var lastReview = (S.reviews || [])[S.reviews.length - 1];
        var upcomingCal = (S.calendar || []).filter(function (c) { return c.status !== 'Done'; }).sort(function (a, b) { return (a.nextDue || '').localeCompare(b.nextDue || ''); })[0];
        var clientLabel = document.getElementById('clientName').textContent;
        var today = new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' });

        var body = '<div style="font-family:Arial,sans-serif;color:#222;max-width:600px">' +
          '<h2 style="margin-bottom:4px">Checkpoint status update — ' + esc(clientLabel) + '</h2>' +
          '<p style="color:#666;font-size:12px;margin-top:0">' + today + '</p>' +
          '<table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:13px">' +
          '<tr><td style="padding:8px;border:1px solid #ddd"><b>Posture score</b></td><td style="padding:8px;border:1px solid #ddd">' + (last ? last.score + '/100' : 'No scan yet') + '</td></tr>' +
          '<tr><td style="padding:8px;border:1px solid #ddd"><b>' + (primaryFw ? esc(fwName(primaryFw)) : 'Framework') + ' readiness</b></td><td style="padding:8px;border:1px solid #ddd">' + readyPct + '%</td></tr>' +
          '<tr><td style="padding:8px;border:1px solid #ddd"><b>High/critical risks</b></td><td style="padding:8px;border:1px solid #ddd">' + crit + '</td></tr>' +
          '<tr><td style="padding:8px;border:1px solid #ddd"><b>Overdue actions</b></td><td style="padding:8px;border:1px solid #ddd">' + od + '</td></tr>' +
          '</table>' +
          '<h3 style="font-size:14px">Top risks</h3><ul style="font-size:13px">' + (topRisks.length ? topRisks.map(function (r) { var q = residual(r); return '<li>' + esc(r.title) + ' — <b>' + band(q.L * q.I) + '</b></li>'; }).join('') : '<li>No open risks</li>') + '</ul>' +
          '<h3 style="font-size:14px">Upcoming milestones</h3><ul style="font-size:13px">' +
          '<li>Next internal audit: ' + (nextAudit ? fmtDate(nextAudit.planned) + ' — ' + esc(nextAudit.scope) : 'None scheduled') + '</li>' +
          '<li>Next management review: ' + (lastReview && lastReview.nextDue ? fmtDate(lastReview.nextDue) : 'Not set') + '</li>' +
          '<li>Next ISMS activity: ' + (upcomingCal ? fmtDate(upcomingCal.nextDue) + ' — ' + esc(upcomingCal.title) : 'None scheduled') + '</li>' +
          '</ul>' +
          '<p style="color:#999;font-size:11px;margin-top:24px">Sent from Checkpoint by Compliance365.</p>' +
          '</div>';

        await Graph.sendMail(to.trim(), 'Checkpoint status update — ' + clientLabel, body);
        log('Status update emailed to <b>' + esc(to.trim()) + '</b>.');
        toast('Status update sent to <b>' + esc(to.trim()) + '</b>');
      } catch (e) { warn(e); }
      busy(false);
    },

    toggleAddAudit: function () {
      var panel = document.getElementById('addAuditPanel');
      var showing = panel.style.display !== 'none';
      panel.style.display = showing ? 'none' : 'block';
      if (!showing) {
        document.getElementById('naAuditScope').value = '';
        document.getElementById('naAuditAuditor').value = '';
        document.getElementById('naAuditDate').value = daysFrom(30);
      }
    },

    addAudit: async function () {
      var scope = document.getElementById('naAuditScope').value.trim();
      if (!scope) { toast('Enter a scope first'); return; }
      var maxA = (S.audits || []).reduce(function (m, a) { var n = parseInt(String(a.id).replace(/\D/g, ''), 10) || 0; return Math.max(m, n); }, 0);
      var a = {
        id: 'AUD-' + String(maxA + 1).padStart(3, '0'),
        fw: document.getElementById('naAuditFw').value,
        scope: scope,
        auditor: document.getElementById('naAuditAuditor').value.trim() || 'Unassigned',
        planned: document.getElementById('naAuditDate').value || daysFrom(30),
        completed: '', status: 'Planned', summary: '', findingRefs: []
      };
      busy(true);
      try {
        await Store.addAudit(a);
        log('<b>' + a.id + '</b> internal audit scheduled: ' + esc(a.scope) + ' (' + fmtDate(a.planned) + ').');
        toast('<b>' + a.id + '</b> scheduled');
        audit('Internal audit scheduled', 'Audit', a.id, '', a.scope + ' — planned ' + a.planned);
      } catch (e) { warn(e); }
      busy(false);
      App.toggleAddAudit();
      renderAudits(); renderNavCounts();
    },

    completeAudit: async function (id) {
      var a = (S.audits || []).find(function (x) { return x.id === id; });
      if (!a) return;
      var vals = await showModal({
        title: 'Complete internal audit',
        fields: [
          { id: 'summary', label: 'Audit outcome / findings summary', type: 'textarea', value: a.summary || '' },
          { id: 'refs', label: 'Action/finding IDs raised (comma-separated, optional — add them in the Actions register first, source "Internal audit")', value: (a.findingRefs || []).join(', ') }
        ],
        confirmText: 'Complete'
      });
      if (!vals) return;
      var prevStatus = a.status;
      a.summary = vals.summary;
      a.findingRefs = vals.refs ? vals.refs.split(',').map(function (s) { return s.trim(); }).filter(Boolean) : [];
      a.completed = new Date().toISOString().slice(0, 10);
      a.status = 'Completed';
      try { await Store.updateAudit(a); } catch (e) { warn(e); }
      log('<b>' + a.id + '</b> internal audit completed.' + (a.findingRefs.length ? ' Findings: ' + esc(a.findingRefs.join(', ')) + '.' : ''));
      toast('<b>' + a.id + '</b> marked complete');
      audit('Internal audit completed', 'Audit', a.id, prevStatus, 'Completed: ' + a.summary);
      renderAudits(); renderNavCounts(); renderDash();
    },

    openAudit: function (id) {
      var a = (S.audits || []).find(function (x) { return x.id === id; });
      if (!a) return;
      var refActions = (a.findingRefs || []).map(function (ref) { return S.actions.find(function (x) { return x.id === ref; }); }).filter(Boolean);
      document.getElementById('drawer').innerHTML =
        '<button class="x" data-action="App.closeDrawer">×</button>' +
        '<div class="id-t">' + a.id + ' · ' + esc(fwName(a.fw)) + '</div><h2>' + esc(a.scope) + '</h2>' +
        '<div class="d-sec"><h4>Details</h4>' +
        '<div class="d-kv"><span>Auditor</span><b>' + esc(a.auditor) + '</b></div>' +
        '<div class="d-kv"><span>Planned</span><b>' + fmtDate(a.planned) + '</b></div>' +
        '<div class="d-kv"><span>Status</span><b>' + a.status + '</b></div>' +
        (a.completed ? '<div class="d-kv"><span>Completed</span><b>' + fmtDate(a.completed) + '</b></div>' : '') + '</div>' +
        (a.summary ? '<div class="d-sec"><h4>Outcome</h4><p style="font-size:12px;color:var(--paper-dim);line-height:1.7">' + esc(a.summary) + '</p></div>' : '') +
        '<div class="d-sec"><h4>Findings raised</h4>' + (refActions.length ? refActions.map(function (x) {
          return '<div class="d-kv"><span>' + x.id + ' — ' + esc(x.title) + '</span><b><span class="chip ' + typeCls(x.type || 'Action') + '">' + esc(x.type || 'Action') + '</span></b></div>';
        }).join('') : '<div class="d-kv"><span>None</span></div>') + '</div>';
      openDrawerUi('Audit ' + a.id);
    },

    toggleAddReview: function () {
      var panel = document.getElementById('addReviewPanel');
      var showing = panel.style.display !== 'none';
      panel.style.display = showing ? 'none' : 'block';
      if (!showing) {
        document.getElementById('naReviewDate').value = new Date().toISOString().slice(0, 10);
        document.getElementById('naReviewNextDue').value = daysFrom(90);
        document.getElementById('naReviewAttendees').value = '';
        document.getElementById('naReviewDecisions').value = '';
        document.getElementById('naReviewInputs').value = App.snapshotInputs();
      }
    },

    snapshotInputs: function () {
      var last = S.scans[S.scans.length - 1];
      var openActs = S.actions.filter(function (a) { return a.status !== 'Done'; });
      var od = S.actions.filter(overdue).length;
      var crit = S.risks.filter(function (r) { if (r.status === 'Closed') return false; var q = residual(r); return band(q.L * q.I) === 'Critical' || band(q.L * q.I) === 'High'; }).length;
      var openNCs = S.actions.filter(function (a) { return a.status !== 'Done' && a.type && a.type.indexOf('Non-conformity') === 0; }).length;
      var primaryFw = entitledFrameworks().indexOf('iso27001') > -1 ? 'iso27001' : entitledFrameworks()[0];
      var readiness = '';
      if (primaryFw) {
        var pApp = frameworkAppRows(primaryFw);
        var pImpl = pApp.filter(function (c) { return c.st === 'Implemented'; }).length;
        readiness = (pApp.length ? Math.round(pImpl / pApp.length * 100) : 0) + '% ' + fwName(primaryFw) + ' control readiness.';
      }
      var lastAuditRec = (S.audits || []).filter(function (a) { return a.status === 'Completed'; }).sort(function (a, b) { return (b.completed || '').localeCompare(a.completed || ''); })[0];
      return 'Posture score: ' + (last ? last.score + '/100' : 'no scan run') + '. ' +
        openActs.length + ' open action(s), ' + od + ' overdue. ' +
        crit + ' High/Critical residual risk(s) open. ' +
        openNCs + ' open non-conformit' + (openNCs === 1 ? 'y' : 'ies') + '. ' +
        readiness +
        (lastAuditRec ? ' Last internal audit ' + fmtDate(lastAuditRec.completed) + ' (' + esc(lastAuditRec.scope) + ').' : ' No internal audit on record.');
    },

    recordReview: async function () {
      var attendees = document.getElementById('naReviewAttendees').value.trim();
      if (!attendees) { toast('Enter attendees first'); return; }
      var maxR = (S.reviews || []).reduce(function (m, r) { var n = parseInt(String(r.id).replace(/\D/g, ''), 10) || 0; return Math.max(m, n); }, 0);
      var r = {
        id: 'MR-' + String(maxR + 1).padStart(3, '0'),
        date: document.getElementById('naReviewDate').value || new Date().toISOString().slice(0, 10),
        attendees: attendees,
        inputs: document.getElementById('naReviewInputs').value,
        decisions: document.getElementById('naReviewDecisions').value.trim(),
        nextDue: document.getElementById('naReviewNextDue').value || ''
      };
      busy(true);
      try {
        await Store.addReview(r);
        log('<b>' + r.id + '</b> management review recorded (' + fmtDate(r.date) + ').');
        toast('<b>' + r.id + '</b> saved');
        audit('Management review recorded', 'Review', r.id, '', fmtDate(r.date) + ' — ' + r.attendees);
      } catch (e) { warn(e); }
      busy(false);
      App.toggleAddReview();
      renderReviews(); renderNavCounts(); renderDash();
    },

    openReview: function (id) {
      var r = (S.reviews || []).find(function (x) { return x.id === id; });
      if (!r) return;
      document.getElementById('drawer').innerHTML =
        '<button class="x" data-action="App.closeDrawer">×</button>' +
        '<div class="id-t">' + r.id + '</div><h2>Management review — ' + fmtDate(r.date) + '</h2>' +
        '<div class="d-sec"><h4>Attendees</h4><p style="font-size:12px;color:var(--paper-dim)">' + esc(r.attendees) + '</p></div>' +
        '<div class="d-sec"><h4>Inputs at time of review</h4><p style="font-size:12px;color:var(--paper-dim);line-height:1.7">' + esc(r.inputs) + '</p></div>' +
        '<div class="d-sec"><h4>Decisions & actions agreed</h4><p style="font-size:12px;color:var(--paper-dim);line-height:1.7">' + (r.decisions ? esc(r.decisions) : 'None recorded') + '</p></div>' +
        '<div class="d-sec"><h4>Next review due</h4><p style="font-size:12px;color:var(--paper-dim)">' + (r.nextDue ? fmtDate(r.nextDue) : 'Not set') + '</p></div>';
      openDrawerUi('Review ' + r.id);
    },

    toggleAddCalItem: function () {
      var panel = document.getElementById('addCalPanel');
      var showing = panel.style.display !== 'none';
      panel.style.display = showing ? 'none' : 'block';
      if (!showing) {
        document.getElementById('naCalTitle').value = '';
        document.getElementById('naCalOwner').value = '';
        document.getElementById('naCalNextDue').value = daysFrom(30);
      }
    },

    addCalItem: async function () {
      var title = document.getElementById('naCalTitle').value.trim();
      if (!title) { toast('Enter an activity title first'); return; }
      var maxC = (S.calendar || []).reduce(function (m, c) { var n = parseInt(String(c.id).replace(/\D/g, ''), 10) || 0; return Math.max(m, n); }, 0);
      var c = {
        id: 'CAL-' + String(maxC + 1).padStart(3, '0'),
        title: title,
        category: document.getElementById('naCalCategory').value,
        freq: document.getElementById('naCalFreq').value,
        nextDue: document.getElementById('naCalNextDue').value || daysFrom(30),
        lastCompleted: '', owner: document.getElementById('naCalOwner').value.trim() || 'Unassigned',
        notes: '', status: 'Active'
      };
      busy(true);
      try {
        await Store.addCalendarItem(c);
        log('<b>' + c.id + '</b> added to the compliance calendar: ' + esc(c.title) + '.');
        toast('<b>' + c.id + '</b> added');
        audit('Compliance calendar item added', 'Calendar', c.id, '', c.title + ' (' + c.freq + ')');
      } catch (e) { warn(e); }
      busy(false);
      App.toggleAddCalItem();
      renderCalendar(); renderNavCounts();
    },

    completeCalItem: async function (id) {
      var c = (S.calendar || []).find(function (x) { return x.id === id; });
      if (!c) return;
      var prevDue = c.nextDue;
      c.lastCompleted = new Date().toISOString().slice(0, 10);
      var advanceDays = { Annual: 365, Biannual: 182, Quarterly: 91, Monthly: 30 }[c.freq];
      if (advanceDays) {
        c.nextDue = daysFrom(advanceDays);
      } else {
        c.status = 'Done';
      }
      try { await Store.updateCalendarItem(c); } catch (e) { warn(e); }
      log('<b>' + c.id + '</b> completed: ' + esc(c.title) + (advanceDays ? '. Next due ' + fmtDate(c.nextDue) + '.' : ' (one-off — marked done).'));
      toast('<b>' + c.id + '</b> marked complete');
      audit('Compliance calendar item completed', 'Calendar', c.id, 'Due ' + prevDue, advanceDays ? 'Next due ' + c.nextDue : 'Done (one-off)');
      renderCalendar(); renderNavCounts(); renderDash();
    },

    setRiskAppetite: async function (level) {
      S.settings.riskAppetite = level;
      try { await Store.setSetting('riskAppetite', level); } catch (e) { warn(e); }
      log('Risk appetite set to <b>' + esc(level) + '</b>.');
      toast('Risk appetite set to <b>' + esc(level) + '</b>');
      renderDash(); renderFrameworksAdmin();
    },

    setScanCadence: async function (days) {
      S.settings.scanCadenceDays = days;
      try { await Store.setSetting('scanCadenceDays', days); } catch (e) { warn(e); }
      toast('Scan reminder set to every <b>' + esc(days) + '</b> days');
      renderDash();
    },

    toggleDigestEnabled: async function () {
      var next = S.settings.digestEnabled === 'true' ? 'false' : 'true';
      S.settings.digestEnabled = next;
      try { await Store.setSetting('digestEnabled', next); } catch (e) { warn(e); }
      audit('Setting changed', 'Setting', 'digestEnabled', next === 'true' ? 'false' : 'true', next);
      toast('Email digest ' + (next === 'true' ? 'enabled' : 'disabled'));
      renderFrameworksAdmin(); renderDash();
    },

    setDigestFrequency: async function (freq) {
      S.settings.digestFrequency = freq;
      try { await Store.setSetting('digestFrequency', freq); } catch (e) { warn(e); }
      toast('Digest frequency set to <b>' + esc(freq) + '</b>');
      renderDash();
    },

    saveDigestRecipients: async function () {
      var input = document.getElementById('digestRecipientsInput');
      var csv = (input && input.value.trim()) || '';
      if (csv) {
        var bad = csv.split(',').map(function (s) { return s.trim(); }).filter(Boolean).find(function (addr) { return !isValidEmail(addr); });
        if (bad) { toast('"' + esc(bad) + '" doesn\'t look like a valid email address.'); return; }
      }
      S.settings.digestRecipients = csv;
      try { await Store.setSetting('digestRecipients', csv); } catch (e) { warn(e); }
      toast('Digest recipients saved');
    },

    /* Builds and sends the email digest right now, in the same HTML
       style as App.emailStatusUpdate() — a periodic version of that
       one-off status email, using the saved digestRecipients setting
       instead of a prompt each time. Records digestLastSent (the
       due-date engine in renderDash() reads it back) and logs the send
       to the audit trail, same as any other setting/evidence change. */
    sendDigestNow: async function () {
      if (Store.kind === 'demo') { toast('Sending email isn\'t available in demo mode — sign in to a real tenant to use this.'); return; }
      var to = (S.settings && S.settings.digestRecipients) || '';
      if (!to) { toast('Add at least one recipient under Email digest before sending.'); return; }
      busy(true);
      try {
        var today = new Date().toISOString().slice(0, 10);
        var todayLabel = new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' });
        var clientLabel = document.getElementById('clientName').textContent;

        var odActions = S.actions.filter(overdue);
        var dueSoon = S.actions.filter(function (a) { return a.status !== 'Done' && a.due && a.due >= today && a.due <= daysFrom(14); });
        var upcomingCal = (S.calendar || []).filter(function (c) { return c.status !== 'Done'; }).sort(function (a, b) { return (a.nextDue || '').localeCompare(b.nextDue || ''); }).slice(0, 5);
        var openAlerts = (S.alerts || []).filter(function (a) { return !a.ack; });
        var topRisks = S.risks.filter(function (r) { return r.status !== 'Closed'; }).slice()
          .sort(function (a, b) { var qa = residual(a), qb = residual(b); return (qb.L * qb.I) - (qa.L * qa.I); }).slice(0, 3);
        var readinessRows = entitledFrameworks().map(function (fw) {
          var applicable = frameworkAppRows(fw);
          return { fw: fw, pct: window.CheckpointLib.readinessPct(applicable) };
        });

        var body = '<div style="font-family:Arial,sans-serif;color:#222;max-width:600px">' +
          '<h2 style="margin-bottom:4px">Checkpoint compliance digest — ' + esc(clientLabel) + '</h2>' +
          '<p style="color:#666;font-size:12px;margin-top:0">' + todayLabel + '</p>' +
          '<h3 style="font-size:14px">Readiness by framework</h3><table style="width:100%;border-collapse:collapse;margin:8px 0 16px;font-size:13px">' +
          (readinessRows.length ? readinessRows.map(function (r) { return '<tr><td style="padding:8px;border:1px solid #ddd"><b>' + esc(fwName(r.fw)) + '</b></td><td style="padding:8px;border:1px solid #ddd">' + r.pct + '%</td></tr>'; }).join('') : '<tr><td style="padding:8px;border:1px solid #ddd">No frameworks enabled</td></tr>') +
          '</table>' +
          '<h3 style="font-size:14px">Overdue actions (' + odActions.length + ')</h3><ul style="font-size:13px">' +
          (odActions.length ? odActions.slice(0, 10).map(function (a) { return '<li>' + esc(a.id) + ' — ' + esc(a.title) + ' (due ' + fmtDate(a.due) + ')</li>'; }).join('') + (odActions.length > 10 ? '<li>and ' + (odActions.length - 10) + ' more</li>' : '') : '<li>None</li>') + '</ul>' +
          '<h3 style="font-size:14px">Due within 14 days (' + dueSoon.length + ')</h3><ul style="font-size:13px">' +
          (dueSoon.length ? dueSoon.slice(0, 10).map(function (a) { return '<li>' + esc(a.id) + ' — ' + esc(a.title) + ' (due ' + fmtDate(a.due) + ')</li>'; }).join('') : '<li>None</li>') + '</ul>' +
          '<h3 style="font-size:14px">Upcoming calendar items</h3><ul style="font-size:13px">' +
          (upcomingCal.length ? upcomingCal.map(function (c) { return '<li>' + esc(c.title) + ' — ' + fmtDate(c.nextDue) + '</li>'; }).join('') : '<li>None scheduled</li>') + '</ul>' +
          '<h3 style="font-size:14px">Drift alerts (' + openAlerts.length + ')</h3><ul style="font-size:13px">' +
          (openAlerts.length ? openAlerts.map(function (a) { return '<li>' + esc(a.label) + ' — ' + esc(a.prev) + ' → ' + esc(a.next) + '</li>'; }).join('') : '<li>None since the last scan</li>') + '</ul>' +
          '<h3 style="font-size:14px">Top risks</h3><ul style="font-size:13px">' +
          (topRisks.length ? topRisks.map(function (r) { var q = residual(r); return '<li>' + esc(r.title) + ' — <b>' + band(q.L * q.I) + '</b></li>'; }).join('') : '<li>No open risks</li>') + '</ul>' +
          '<p style="color:#999;font-size:11px;margin-top:24px">Sent from Checkpoint by Compliance365.</p>' +
          '</div>';

        await Graph.sendMail(to, 'Checkpoint compliance digest — ' + clientLabel, body);
        var prevSent = S.settings.digestLastSent;
        S.settings.digestLastSent = today;
        await Store.setSetting('digestLastSent', today);
        audit('Compliance digest emailed', 'Setting', 'digestLastSent', prevSent || '(never)', today);
        log('Compliance digest emailed to <b>' + esc(to) + '</b>.');
        toast('Digest sent to <b>' + esc(to) + '</b>');
        renderDash(); renderFrameworksAdmin();
      } catch (e) { warn(e); }
      busy(false);
    },

    setE8TargetLevel: async function (level) {
      S.settings.e8TargetLevel = level;
      try { await Store.setSetting('e8TargetLevel', level); } catch (e) { warn(e); }
      log('Essential Eight target maturity set to <b>' + esc(level) + '</b>.');
      toast('Essential Eight target set to <b>' + esc(level) + '</b>');
      audit('Setting changed', 'Setting', 'e8TargetLevel', '', level);
      renderFrameworksAdmin(); renderSoa(); renderDash();
    },

    setDispTargetLevel: async function (level) {
      S.settings.dispTargetLevel = level;
      try { await Store.setSetting('dispTargetLevel', level); } catch (e) { warn(e); }
      log('DISP target membership level set to <b>' + esc(level) + '</b>.');
      toast('DISP target level set to <b>' + esc(level) + '</b>');
      audit('Setting changed', 'Setting', 'dispTargetLevel', '', level);
      renderFrameworksAdmin(); renderSoa(); renderDash();
    },

    setNistDepth: async function (depth) {
      var prevDepth = (S.settings && S.settings.nistDepth) || 'category';
      if (depth === prevDepth) return;
      busy(true);
      try {
        if (depth === 'subcategory') {
          var added = await Store.ensureNistSubcategories();
          if (added) log('<b>' + added + '</b> NIST CSF subcategory control(s) added to the Controls list.');
        }
        S.settings.nistDepth = depth;
        try { await Store.setSetting('nistDepth', depth); } catch (e) { warn(e); }
        log('NIST CSF depth set to <b>' + esc(depth) + '</b>.');
        toast('NIST CSF depth set to <b>' + esc(depth) + '</b>');
        audit('Setting changed', 'Setting', 'nistDepth', prevDepth, depth);
      } catch (e) { warn(e); toast('Could not switch NIST CSF depth — see console for details'); }
      busy(false);
      renderFrameworksAdmin(); renderSoa(); renderDash(); renderNavCounts();
    },

    confirmE8Suggestion: async function (key) {
      var p = S.e8Proposed.find(function (x) { return x.code === key; });
      if (!p) return;
      var c = S.controls.find(function (x) { return x.fw === 'essential8' && x.id === p.code; });
      if (!c) return;
      var prevSt = c.st;
      c.st = p.to;
      try { await Store.updateControl(c); } catch (e) { warn(e); }
      S.e8Proposed = S.e8Proposed.filter(function (x) { return x !== p; });
      log('<b>' + esc(c.id) + '</b> set to <b>' + esc(p.to) + '</b> — confirmed from posture scan suggestion (' + esc(p.checkLabel) + ').');
      toast('<b>' + esc(c.id) + '</b> → ' + esc(p.to));
      audit('Control status changed', 'Control', 'essential8|' + p.code, prevSt, p.to + ' (scan-suggested, practitioner-confirmed)');
      renderSoa(); renderDash();
    },

    dismissE8Suggestion: function (key) {
      var p = S.e8Proposed.find(function (x) { return x.code === key; });
      if (!p) return;
      S.e8Proposed = S.e8Proposed.filter(function (x) { return x !== p; });
      log('Essential Eight suggestion for <b>' + esc(p.code) + '</b> dismissed by practitioner.');
      renderSoa();
    },

    acknowledgeAlert: async function (id) {
      var a = (S.alerts || []).find(function (x) { return x.id === id; });
      if (!a) return;
      try { await Store.acknowledgeAlert(a); } catch (e) { warn(e); return; }
      toast('Drift alert for <b>' + esc(a.label) + '</b> acknowledged');
      audit('Drift alert acknowledged', 'Alert', a.checkId, a.prev + ' → ' + a.next, 'Acknowledged');
      renderDash();
    },

    setThreshold: async function (key, value) {
      var def = (window.THRESHOLD_DEFS.find(function (t) { return t.key === key; }) || {}).def;
      value = (value !== undefined && value !== null && value !== '' && !isNaN(Number(value))) ? String(Number(value)) : def;
      S.settings[key] = value;
      try { await Store.setSetting(key, value); } catch (e) { warn(e); }
      var label = (window.THRESHOLD_DEFS.find(function (t) { return t.key === key; }) || {}).label || key;
      toast('<b>' + esc(label) + '</b> set to <b>' + esc(value) + '</b>');
      audit('Scan threshold changed', 'Setting', key, '', value);
      renderFrameworksAdmin();
    },

    toggleFeature: async function (key) {
      var next = !featureOn(key);
      var value = next ? 'true' : 'false';
      S.settings[key] = value;
      try { await Store.setSetting(key, value); } catch (e) { warn(e); }
      var label = (window.FEATURE_DEFS.find(function (f) { return f.key === key; }) || {}).label || key;
      toast('<b>' + esc(label) + '</b> ' + (next ? 'enabled' : 'disabled'));
      renderFrameworksAdmin(); renderDash(); renderFeatureVisibility();
    },

    /* Demo mode only — a real tenant's entitlements are derived from a
       signed file (see applyEntitlementFile/reconcileEntitlementsOnLoad
       above); this free self-service toggle is exactly the honour
       system that replaces. Guarded here too, not just by
       renderFrameworksAdmin() no longer rendering the button in live
       mode, in case anything ever calls this directly. */
    toggleEntitlement: async function (fw) {
      if (Store.kind !== 'demo') { toast('Frameworks for a real tenant are set by a signed activation file, not a toggle — see Frameworks below.'); return; }
      var next = !(S.entitlements && S.entitlements[fw]);
      busy(true);
      try {
        await Store.setEntitlement(fw, next);
        log(next ? '<b>' + esc(fwName(fw)) + '</b> activated — control set now available in the Statement of Applicability.'
                  : '<b>' + esc(fwName(fw)) + '</b> deactivated.');
        toast(next ? '<b>' + esc(fwName(fw)) + '</b> enabled' : '<b>' + esc(fwName(fw)) + '</b> disabled');
        audit('Framework entitlement toggled', 'Framework', fw, next ? 'Disabled' : 'Enabled', next ? 'Enabled' : 'Disabled');
      } catch (e) { warn(e); }
      busy(false);
      if (!window._soaFw || !S.entitlements[window._soaFw]) window._soaFw = entitledFrameworks()[0];
      renderFrameworksAdmin(); renderDash(); renderSoa(); renderFeatureVisibility();
    },

    /* Verifies and applies an uploaded/pasted entitlement file (see the
       "signed entitlement files" section above verifyAndApplyEntitlement
       for the full design). Caches the raw file in Settings so
       reconcileEntitlementsOnLoad() can re-verify it on every future
       load without needing a re-upload. */
    applyEntitlementFile: async function () {
      if (Store.kind === 'demo') { toast('Activation files apply to a real tenant only — demo mode uses the free toggle above.'); return; }
      var fileInput = document.getElementById('entFileInput');
      var textInput = document.getElementById('entPasteInput');
      var file = fileInput && fileInput.files && fileInput.files[0];
      var rawText;
      if (file) { rawText = await file.text(); }
      else if (textInput && textInput.value.trim()) { rawText = textInput.value.trim(); }
      else { toast('Choose a file or paste the activation JSON first.'); return; }

      busy(true);
      var tenantInfo = await Graph.tenantInfo();
      var result = await verifyActivationRaw(rawText, tenantIdsFor(tenantInfo));
      if (!result.ok) {
        busy(false);
        toast('<b>Activation rejected:</b> ' + esc(result.reason));
        audit('Activation rejected', 'Activation', 'file', '', result.reason);
        return;
      }
      var wasRenewal = !!(ENTITLEMENT_STATE && ENTITLEMENT_STATE.expiry);
      var prevExpiry = wasRenewal ? ENTITLEMENT_STATE.expiry : '(none)';
      try {
        await Store.setSetting('entitlementFile', result.raw);
        S.settings.entitlementFile = result.raw;
        await applyEntitlementFrameworks(result.evalResult);
      } catch (e) { warn(e); }
      busy(false);
      if (fileInput) fileInput.value = '';
      if (textInput) textInput.value = '';
      ENTITLEMENT_STATE = result.evalResult;
      recomputeReadOnly();
      var statusLabel = result.evalResult.status === 'expired' ? 'expired (renewal needed)' : result.evalResult.status === 'grace' ? 'in grace period' : 'active';
      audit(wasRenewal ? 'Activation renewed' : 'Activation applied', 'Activation', 'file', prevExpiry, statusLabel + ' until ' + result.evalResult.expiry + ': ' + result.evalResult.frameworks.join(', '));
      log((wasRenewal ? 'Activation renewed' : 'Activation applied') + ' — <b>' + esc(statusLabel) + '</b>.');
      toast(result.evalResult.status === 'expired'
        ? 'Activation applied, but it expired ' + esc(fmtDate(result.evalResult.expiry)) + ' — renewal needed.'
        : result.evalResult.status === 'grace'
        ? 'Activation applied — in its grace period until ' + esc(fmtDate(result.evalResult.graceUntil)) + '.'
        : 'Activation verified and applied.');
      if (!window._soaFw || !S.entitlements[window._soaFw]) window._soaFw = entitledFrameworks()[0];
      /* A renewal may have just cleared an expired-forced read-only —
         applyReadOnlyUi() only ever disables, never re-enables, so a
         full renderAll() regenerates every view's markup fresh
         (un-disabled) before it re-applies against whatever READONLY
         is now. */
      renderAll();
    },

    retryActivation: function () { return retryActivationFromGate(); },

    reset: async function () {
      if (Store.kind !== 'demo') { toast('Reset is available in demo mode only — client data is never bulk-deleted from the console.'); return; }
      var ok = await showModal({ title: 'Reset demo data?', message: 'Reset all demo data?', confirmText: 'Reset' });
      if (ok) {
        S = await Store.reset();
        window._riskF = 'All'; window._actF = 'Open'; window._actTypeF = 'All';
        renderAll(); renderGaugeFromLast(); toast('Demo data reset');
      }
    },

    runSelfTest: function () { renderSelfTest(); },

    partnerRefresh: async function () { PARTNER_DATA = null; await renderPartnerConsole(); },

    partnerPromptAddClient: async function () {
      var v = await showModal({
        title: 'Add client',
        fields: [
          { id: 'name', label: 'Client name', placeholder: 'e.g. Meridian Health SaaS' },
          { id: 'tenantId', label: 'Their tenant ID or a verified domain', placeholder: 'e.g. contoso.onmicrosoft.com' },
          { id: 'contactName', label: 'Contact name (optional)' },
          { id: 'contactEmail', label: 'Contact email (optional)', type: 'email' }
        ],
        confirmText: 'Add',
        validate: function (v) {
          if (!v.name) return 'Enter a client name.';
          if (!v.tenantId) return 'Enter their tenant ID or a verified domain.';
          if (v.contactEmail && !isValidEmail(v.contactEmail)) return 'Enter a valid contact email, or leave it blank.';
          return null;
        }
      });
      if (!v) return;
      var c = { name: v.name, tenantId: v.tenantId, status: 'Prospect', contactName: v.contactName || '', contactEmail: v.contactEmail || '', notes: '', modules: [], lastSynced: '', lastSyncedBy: '', onboarded: false, score: null, lastScanDate: '', readinessByFw: {}, appVersion: '', driftAlerts: 0, syncError: '' };
      try { await Store.addPartnerClient(c); } catch (e) { warn(e); toast('Could not add client: ' + esc(e.message || e)); return; }
      PARTNER_DATA.clients.push(c);
      audit('Partner client added', 'PartnerClient', c._sp, '', c.name + ' (' + c.tenantId + ')');
      toast('<b>' + esc(c.name) + '</b> added');
      renderPartnerConsole();
    },

    partnerRemoveClient: async function (id) {
      var c = (PARTNER_DATA.clients || []).find(function (x) { return x._sp === id; });
      if (!c) return;
      var ok = await showModal({ title: 'Remove client?', message: 'Remove ' + c.name + ' from Partner Console? This only removes the roster row and cached snapshot in OUR tenant — nothing in their tenant is affected.', confirmText: 'Remove' });
      if (!ok) return;
      try { await Store.deletePartnerClient(c); } catch (e) { warn(e); toast('Could not remove client: ' + esc(e.message || e)); return; }
      PARTNER_DATA.clients = PARTNER_DATA.clients.filter(function (x) { return x._sp !== id; });
      audit('Partner client removed', 'PartnerClient', id, c.name, '');
      toast('Removed');
      renderPartnerConsole();
    },

    partnerSetClientStatus: async function (id, status) {
      var c = (PARTNER_DATA.clients || []).find(function (x) { return x._sp === id; });
      if (!c) return;
      var before = c.status;
      c.status = status;
      try { await Store.updatePartnerClient(c); } catch (e) { warn(e); c.status = before; toast('Could not save status'); renderPartnerConsole(); return; }
      audit('Partner client status changed', 'PartnerClient', id, before, status);
      renderPartnerConsole();
    },

    partnerEditClient: async function (id) {
      var c = (PARTNER_DATA.clients || []).find(function (x) { return x._sp === id; });
      if (!c) return;
      var v = await showModal({
        title: 'Edit client',
        fields: [
          { id: 'contactName', label: 'Contact name', value: c.contactName },
          { id: 'contactEmail', label: 'Contact email', value: c.contactEmail, type: 'email' },
          { id: 'notes', label: 'Notes', value: c.notes, type: 'textarea' }
        ],
        confirmText: 'Save',
        validate: function (v) { return (v.contactEmail && !isValidEmail(v.contactEmail)) ? 'Enter a valid contact email, or leave it blank.' : null; }
      });
      if (!v) return;
      c.contactName = v.contactName; c.contactEmail = v.contactEmail; c.notes = v.notes;
      try { await Store.updatePartnerClient(c); } catch (e) { warn(e); toast('Could not save'); return; }
      audit('Partner client details edited', 'PartnerClient', id, '', c.contactName);
      closeDrawerUi();
      toast('Saved');
      renderPartnerConsole();
    },

    partnerPromptAddEntitlement: async function () {
      var v = await showModal({
        title: 'Record an entitlement',
        message: 'Use this only if an activation was issued without --record, or automatic recording failed — the CLI prints this same row as JSON for exactly this situation (see tools/ISSUANCE.md).',
        fields: [
          { id: 'tenantId', label: 'Tenant ID or domain' },
          { id: 'type', label: 'Type (client / partner / demo)', value: 'client' },
          { id: 'modules', label: 'Modules (comma-separated)', placeholder: 'iso27001,soc2' },
          { id: 'issuedAt', label: 'Issued', type: 'date' },
          { id: 'expiry', label: 'Expiry', type: 'date' }
        ],
        confirmText: 'Record',
        validate: function (v) {
          if (!v.tenantId) return 'Enter a tenant ID or domain.';
          if (['client', 'partner', 'demo'].indexOf(v.type) === -1) return 'Type must be client, partner or demo.';
          if (!v.expiry) return 'Enter an expiry date.';
          return null;
        }
      });
      if (!v) return;
      var e = { tenantId: v.tenantId, type: v.type, modules: v.modules.split(',').map(function (s) { return s.trim(); }).filter(Boolean), issuedAt: v.issuedAt || new Date().toISOString().slice(0, 10), expiry: v.expiry };
      try { await Store.addPartnerEntitlementRecord(e); } catch (ex) { warn(ex); toast('Could not record entitlement: ' + esc(ex.message || ex)); return; }
      PARTNER_DATA.entitlements.push(e);
      audit('Partner entitlement recorded', 'PartnerEntitlement', e._sp, '', v.tenantId + ' — ' + v.type + ' until ' + v.expiry);
      toast('Entitlement recorded');
      renderPartnerConsole();
    },

    partnerSyncClient: async function (id) {
      if (Store.kind === 'demo') { toast('Sync isn\'t available in demo mode — this previews the console with sample data only.'); return; }
      var c = (PARTNER_DATA.clients || []).find(function (x) { return x._sp === id; });
      if (!c) return;
      var btn = document.getElementById('partnerSync-' + id);
      if (btn) { btn.disabled = true; btn.textContent = 'Syncing…'; }
      try {
        var summary = await partnerFetchClientSummary(c.tenantId);
        c.name = summary.name || c.name;
        c.modules = summary.modules; c.lastSynced = new Date().toISOString(); c.lastSyncedBy = summary.signedInAs;
        c.onboarded = summary.onboarded; c.score = summary.score; c.lastScanDate = summary.scanDate || '';
        c.readinessByFw = summary.readinessByFw; c.appVersion = summary.appVersion; c.driftAlerts = summary.driftAlerts;
        c.syncError = '';
        await Store.updatePartnerClient(c);
        audit('Partner client synced', 'PartnerClient', id, '', (summary.name || c.name) + ' — score ' + summary.score + ', synced by ' + summary.signedInAs);
        toast('Synced <b>' + esc(c.name) + '</b>');
      } catch (e) {
        c.syncError = e.errorCode === 'user_cancelled' ? 'Sign-in cancelled' : ('Sync failed: ' + (e.message || e));
        c.lastSynced = new Date().toISOString();
        try { await Store.updatePartnerClient(c); } catch (e2) { warn(e2); }
        audit('Partner client sync failed', 'PartnerClient', id, '', c.syncError);
        toast('<b>Sync failed:</b> ' + esc(c.syncError));
      }
      renderPartnerConsole();
    },

    partnerOpenClientDrawer: function (id) {
      var c = (PARTNER_DATA.clients || []).find(function (x) { return x._sp === id; });
      if (!c) return;
      var ent = partnerLatestEntitlementFor(c.tenantId);
      var readinessRows = Object.keys(c.readinessByFw || {}).map(function (fw) {
        return '<div class="d-kv"><span>' + esc(fwName(fw)) + '</span><b>' + c.readinessByFw[fw] + '%</b></div>';
      }).join('') || '<div class="d-kv"><span>No synced readiness data yet</span></div>';
      document.getElementById('drawer').innerHTML =
        '<button class="x" data-action="App.closeDrawer">×</button>' +
        '<div class="id-t">' + esc(c.tenantId) + '</div><h2>' + esc(c.name) + '</h2>' +
        '<div class="d-sec"><h4>Licence</h4>' +
        '<div class="d-kv"><span>Status</span><b>' + esc(c.status) + '</b></div>' +
        (ent ? '<div class="d-kv"><span>Type</span><b>' + esc(ent.type) + '</b></div><div class="d-kv"><span>Expiry</span><b>' + fmtDate(ent.expiry) + '</b></div>'
          : '<div class="d-kv"><span>Entitlement record</span><b>None — record one from the console or via the CLI\'s --record flag</b></div>') +
        '<div class="d-kv"><span>Modules licensed</span><b>' + partnerModuleChips(ent ? ent.modules : []) + '</b></div>' +
        '</div>' +
        '<div class="d-sec"><h4>Health (as of last sync)</h4>' +
        '<div class="d-kv"><span>Last synced</span><b>' + (c.lastSynced ? fmtDate(c.lastSynced) : 'Never') + '</b></div>' +
        (c.lastSyncedBy ? '<div class="d-kv"><span>Synced by</span><b>' + esc(c.lastSyncedBy) + '</b></div>' : '') +
        '<div class="d-kv"><span>Last scan</span><b>' + (c.lastScanDate ? fmtDate(c.lastScanDate) : '—') + '</b></div>' +
        '<div class="d-kv"><span>Posture score</span><b>' + (c.score != null ? c.score + '/100' : '—') + '</b></div>' +
        '<div class="d-kv"><span>App version last seen</span><b>' + esc(c.appVersion || '—') + '</b></div>' +
        '<div class="d-kv"><span>Drift alerts outstanding</span><b style="' + (c.driftAlerts ? 'color:var(--fail)' : '') + '">' + c.driftAlerts + '</b></div>' +
        (c.syncError ? '<div class="d-kv"><span>Last sync error</span><b style="color:var(--fail)">' + esc(c.syncError) + '</b></div>' : '') +
        '</div>' +
        '<div class="d-sec"><h4>Readiness by framework</h4>' + readinessRows + '</div>' +
        (c.notes ? '<div class="d-sec"><h4>Notes</h4><p style="font-size:13px;color:var(--paper-dim)">' + esc(c.notes) + '</p></div>' : '') +
        '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:16px">' +
        '<button class="btn sm" data-action="App.partnerSyncClient" data-id="' + esc(c._sp) + '">Sync now</button>' +
        '<button class="btn ghost sm" data-action="App.partnerEditClient" data-id="' + esc(c._sp) + '">Edit</button>' +
        '</div>';
      openDrawerUi(c.name);
    },

    /* Purely a local DOM toggle — no Store write, no re-render. Endpoint/
       deployment/enabled are saved together, atomically, by
       aiSaveConfig() below; persisting (and re-rendering from Settings)
       on every toggle click would wipe out whatever the practitioner
       had already typed into the endpoint/deployment fields but not
       yet saved. */
    aiToggleEnabled: function () {
      var t = document.getElementById('aiEnabledToggle');
      if (!t) return;
      var next = !t.classList.contains('on');
      t.classList.toggle('on', next);
      t.setAttribute('aria-checked', next ? 'true' : 'false');
    },

    aiSaveConfig: async function () {
      var endpoint = document.getElementById('aiEndpointInput').value.trim();
      var deployment = document.getElementById('aiDeploymentInput').value.trim();
      var enabledToggle = document.getElementById('aiEnabledToggle');
      var enabled = !!(enabledToggle && enabledToggle.classList.contains('on'));
      S.settings.aiEndpoint = endpoint;
      S.settings.aiDeployment = deployment;
      S.settings.aiEnabled = enabled ? 'true' : 'false';
      try {
        await Store.setSetting('aiEndpoint', endpoint);
        await Store.setSetting('aiDeployment', deployment);
        await Store.setSetting('aiEnabled', S.settings.aiEnabled);
        audit('AI configuration saved', 'AiConfig', '', '', 'endpoint set: ' + (!!endpoint) + ', deployment set: ' + (!!deployment));
        toast('AI configuration saved');
      } catch (e) { warn(e); toast('Could not save AI configuration'); }
      renderAiAssistant();
    },

    aiTestConnection: async function () {
      var statusEl = document.getElementById('aiConfigStatus');
      if (Store.kind === 'demo') { if (statusEl) statusEl.innerHTML = '<span style="color:var(--paper-faint)">Connection testing isn\'t available in demo mode — this previews the console with sample data only.</span>'; return; }
      if (statusEl) statusEl.textContent = 'Testing…';
      var cfg = aiGetConfig();
      try {
        var result = await window.CheckpointAI.testConnection(cfg);
        if (statusEl) statusEl.innerHTML = result.ok ? '<span style="color:var(--pass)">Connected — the AI assistant can reach this deployment.</span>' : '<span style="color:var(--fail)">' + esc(result.message) + '</span>';
      } catch (e) {
        if (statusEl) statusEl.innerHTML = '<span style="color:var(--fail)">' + esc(e.message || e) + '</span>';
      }
    },

    aiSetFeature: function (val) {
      window._aiFeature = val;
      window._aiContextSel = {}; /* reset to "everything this feature allows" on feature change */
      aiRenderContextChoices();
    },

    aiToggleContext: function (key) {
      if (!window._aiContextSel) window._aiContextSel = {};
      window._aiContextSel[key] = window._aiContextSel[key] === false ? true : false;
      aiRenderContextChoices();
    },

    aiAsk: async function () {
      var promptEl = document.getElementById('aiPrompt');
      var resultEl = document.getElementById('aiResult');
      var askBtn = document.getElementById('aiAskBtn');
      var userText = (promptEl.value || '').trim();
      if (!userText) { toast('Enter a question or request first'); return; }
      if (Store.kind === 'demo') {
        resultEl.innerHTML = '<div class="card" style="max-width:820px;color:var(--paper-faint)">Asking the AI assistant isn\'t available in demo mode (there\'s no real Azure OpenAI resource to reach) — this previews the console\'s layout only.</div>';
        return;
      }
      var feature = window._aiFeature || 'chat';
      var allow = (window.CheckpointAI.FEATURE_CONTEXT_ALLOW[feature] || []);
      var fullBag = aiBuildDataBag();
      var dataBag = {};
      allow.forEach(function (key) {
        var included = !window._aiContextSel || window._aiContextSel[key] !== false;
        if (included) dataBag[key] = fullBag[key];
      });
      askBtn.disabled = true; askBtn.textContent = 'Asking…';
      resultEl.innerHTML = '';
      try {
        var res = await window.CheckpointAI.chat(feature, userText, dataBag);
        resultEl.innerHTML = '<div class="card" style="max-width:820px">' +
          '<div class="chip st-Intreatment" style="margin-bottom:10px">' + esc(window.CheckpointAI.DISCLAIMER) + '</div>' +
          '<div style="white-space:pre-wrap;font-size:13.5px;line-height:1.6">' + esc(res.text) + '</div>' +
          (res.truncatedContext ? '<p class="src" style="margin-top:10px">Some register context was truncated to fit a size budget — the answer may not reflect everything in your registers.</p>' : '') +
          '</div>';
      } catch (e) {
        var friendly = e.code === 'not_configured' ? 'AI is not configured — set it up above.'
          : e.code === 'auth_error' ? 'Not authorised — check the Cognitive Services OpenAI User role assignment (see AI-SETUP.md).'
          : e.code === 'not_found' ? 'Endpoint or deployment name not found — double-check both.'
          : e.code === 'rate_limited' ? 'The AI endpoint is rate-limiting requests — wait a moment and try again.'
          : ('Could not get a response: ' + (e.message || e));
        resultEl.innerHTML = '<div class="card" style="max-width:820px;color:var(--fail)">' + esc(friendly) + '</div>';
      }
      askBtn.disabled = false; askBtn.textContent = 'Ask';
    },

    rerunSetup: async function () {
      if (Store.kind !== 'sharepoint') { toast('Re-run setup applies to a live tenant only.'); return; }
      var ok = await showModal({
        title: 'Re-run setup?',
        message: 'Steps back through the tenant capability check, site selection and framework picks, then re-provisions and re-scans. Nothing already in your risk register, actions or evidence is deleted.',
        confirmText: 'Re-run setup'
      });
      if (!ok) return;
      try { S.settings.onboardedDate = ''; await Store.setSetting('onboardedDate', ''); } catch (e) { warn(e); }
      document.getElementById('appShell').style.display = 'none';
      Wizard.startAt(3);
    },

    signIn: function () {
      /* The old cold start called Graph.signIn() directly from here. It
         now opens the onboarding wizard's welcome step instead — the
         wizard's own step 2 is what actually triggers Graph.signIn(),
         once the consent explainer has been shown. A returning user
         with a live MSAL session never reaches this at all (init()'s
         "returning session" branch below fires before #gate is ever
         shown). */
      Wizard.start();
    },

    signOut: function () { Graph.signOut(); },

    startDemo: async function () {
      Store = window.DemoStore;
      S = await Store.load();
      await detectAppCapabilities();
      await detectAppReadOnly();
      bootUi('Demo mode — sample data, stored only in this browser', S.client);
    },

    report: async function (type) {
      var activeFw = window._soaFw || entitledFrameworks()[0] || 'iso27001';
      var fwLabel = fwName(activeFw);
      var parts = REPORT_BUILDERS[type] && REPORT_BUILDERS[type](activeFw, fwLabel);
      if (!parts) return;

      var today = new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' });
      var clientLabel = document.getElementById('clientName').textContent;
      var practitioner = (typeof Graph !== 'undefined' && Graph.getAccount() && Graph.getAccount().name) || (Store.kind === 'demo' ? 'Demo user' : 'Practitioner');
      var version = await nextReportVersion(type);

      var spec = {
        type: type,
        reportTitle: parts.title,
        framework: fwLabel,
        client: { name: clientLabel, logoUrl: (S.settings && S.settings.clientLogoUrl) || null },
        classification: (S.settings && S.settings.reportClassification) || 'Commercial in Confidence',
        version: version,
        date: today,
        dateIso: new Date().toISOString().slice(0, 10),
        preparedBy: practitioner,
        nextReviewDate: '',
        dashboard: parts.dashboard || null,
        sections: parts.sections || [],
        methodology: buildMethodology(),
        signOff: { preparedBy: practitioner, clientApprover: '' }
      };

      var reportHtml = window.ReportEngine.buildReport(spec);
      if (!reportPreview(spec, reportHtml)) return;
      audit('Report generated', 'Report', type, '', JSON.stringify({ framework: activeFw, version: version }));
      log('Generated report: <b>' + esc(parts.title) + '</b> (v' + version + ').');
      renderDash();
    },

    /* Reports render inside a sandboxed srcdoc iframe that inherits
       index.html's Content-Security-Policy (img-src 'self' data: —
       see SETUP.md's security posture summary), so an externally-
       hosted logo URL (a SharePoint webUrl, say) would silently fail
       CSP and never render. A data: URI is same-origin-equivalent
       under that policy and needs no network fetch at print time
       either, so that's what's actually stored in Settings —
       converted client-side via FileReader, no server round-trip.
       A hard 40 KB file-size cap keeps the resulting base64 string
       (~33% larger) comfortably under the Settings list's multi-line
       text column limit. The original file is also best-effort
       uploaded to Documents ("Branding") for a durable copy of
       record — that upload failing (or being unavailable in demo
       mode) doesn't block the logo from being saved and used. */
    uploadClientLogo: async function () {
      var input = document.getElementById('clientLogoFileInput');
      var file = input && input.files && input.files[0];
      if (!file) { toast('Choose an image file first'); return; }
      if (!/^image\//.test(file.type)) { toast('Choose an image file (PNG, JPG or SVG)'); return; }
      var MAX_BYTES = 40 * 1024;
      if (file.size > MAX_BYTES) { toast('Logo must be under 40 KB — use a small wordmark/icon file, not a full-resolution image.'); return; }
      busy(true);
      var dataUrl;
      try {
        dataUrl = await new Promise(function (resolve, reject) {
          var reader = new FileReader();
          reader.onload = function () { resolve(reader.result); };
          reader.onerror = function () { reject(reader.error || new Error('Could not read file')); };
          reader.readAsDataURL(file);
        });
      } catch (e) { warn(e); busy(false); return; }

      S.settings.clientLogoUrl = dataUrl;
      try { await Store.setSetting('clientLogoUrl', dataUrl); } catch (e) { warn(e); busy(false); return; }
      audit('Client logo uploaded', 'Setting', 'clientLogoUrl', '', file.name);

      if (Store.kind !== 'demo') {
        try { await Store.uploadDocument(file, 'Branding'); } catch (e) { warn(e); /* logo is already saved above — a Documents copy is a nice-to-have, not a blocker */ }
      }
      toast('Client logo saved — it will appear on report cover pages.');
      input.value = '';
      busy(false);
      renderFrameworksAdmin();
    },

    clearClientLogo: async function () {
      S.settings.clientLogoUrl = '';
      try { await Store.setSetting('clientLogoUrl', ''); } catch (e) { warn(e); }
      audit('Client logo cleared', 'Setting', 'clientLogoUrl', '(logo set)', '(cleared)');
      toast('Logo cleared');
      renderFrameworksAdmin();
    },

    setReportClassification: async function () {
      var input = document.getElementById('reportClassificationInput');
      var value = ((input && input.value) || '').trim() || 'Commercial in Confidence';
      S.settings.reportClassification = value;
      try { await Store.setSetting('reportClassification', value); } catch (e) { warn(e); }
      audit('Report classification changed', 'Setting', 'reportClassification', '', value);
      toast('<b>' + esc(value) + '</b> will appear on future reports');
      renderFrameworksAdmin();
    },

    exportCsv: function (key) {
      var reg = EXPORT_REGISTERS.find(function (r) { return r.key === key; });
      if (!reg) return;
      var csv = window.CheckpointLib.toCsv([reg.header].concat(reg.rows()));
      downloadTextFile(reg.filename, 'text/csv;charset=utf-8', csv);
      audit('Register exported (CSV)', 'Export', reg.key, '(none)', reg.filename);
      log('Exported <b>' + esc(reg.label) + '</b> as CSV.');
      toast('<b>' + esc(reg.filename) + '</b> downloaded');
    },

    /* One .zip containing every register's CSV in a single click — the
       full flat-file backup half of the offboarding story. Built
       entirely client-side (CheckpointLib.buildZip(), a dependency-free
       STORE-method writer — no compression library needed for CSVs this
       small) rather than a zip package; falls back to firing the same
       per-register downloads sequentially if zip assembly throws for
       any reason (e.g. an unexpectedly huge register), so an export
       never just silently fails. */
    exportAllZip: async function () {
      try {
        var files = EXPORT_REGISTERS.map(function (reg) {
          return { name: reg.filename, content: window.CheckpointLib.toCsv([reg.header].concat(reg.rows())) };
        });
        var zipBytes = window.CheckpointLib.buildZip(files);
        downloadBlob('checkpoint-export-' + new Date().toISOString().slice(0, 10) + '.zip', new Blob([zipBytes], { type: 'application/zip' }));
        audit('All registers exported (ZIP)', 'Export', 'all', '(none)', files.length + ' files');
        log('Exported all registers as a single ZIP (' + files.length + ' files).');
        toast('Export downloaded — ' + files.length + ' files');
      } catch (e) {
        warn(e);
        toast('ZIP assembly failed — downloading each register separately instead.');
        for (var i = 0; i < EXPORT_REGISTERS.length; i++) { App.exportCsv(EXPORT_REGISTERS[i].key); await new Promise(function (r) { setTimeout(r, 300); }); }
      }
    }
  };

  /* ================= boot ================= */
  function bootUi(modeLabel, clientLabel) {
    document.getElementById('gate').style.display = 'none';
    document.getElementById('wizard').style.display = 'none';
    document.getElementById('notActivated').style.display = 'none';
    document.getElementById('appShell').style.display = 'grid';
    document.getElementById('modeChip').textContent = Store.kind === 'demo' ? 'Demo' : 'Live';
    document.getElementById('modeChip').className = 'chip ' + (Store.kind === 'demo' ? 'st-Intreatment' : 'st-Implemented');
    document.getElementById('clientName').textContent = clientLabel || 'Connected tenant';
    document.getElementById('modeNote').textContent = modeLabel;
    document.getElementById('btnReset').style.display = Store.kind === 'demo' ? '' : 'none';
    document.getElementById('btnSignOut').style.display = Store.kind === 'sharepoint' ? '' : 'none';
    updateRoleChip();
    aiInitOnce();
    window._riskF = 'All'; window._actF = 'Open'; window._actTypeF = 'All';
    renderAll();
    renderGaugeFromLast();
    /* Board is a summary view with nothing editable on it (see its own
       vhead copy) — the natural client-facing landing view for a
       Viewer, instead of the Dashboard practitioners land on by
       default. Only overrides the view on first boot; a Viewer can
       still navigate anywhere else read-only registers/reports remain
       visible. */
    if (READONLY) App.go('board');
    SELFTEST_MODE = Store.kind === 'demo' && /[?&]selftest=1\b/.test(location.search);
    if (SELFTEST_MODE) App.go('selftest');
    applyReadOnlyUi();
    startReadOnlyObserver();
    var versionTag = document.getElementById('versionTag');
    if (versionTag) versionTag.textContent = window.CHECKPOINT_VERSION ? 'Checkpoint v' + window.CHECKPOINT_VERSION : 'Checkpoint';
    checkForNewVersion();
    busy(false);
  }

  /* One-time "what's new" nudge: toasts only when this browser has
     already recorded a DIFFERENT lastSeenVersion — an empty value
     means "never tracked before" (new tenant, or one that onboarded
     before this feature shipped), which deliberately does NOT toast,
     only starts tracking silently from here. window.CHECKPOINT_VERSION
     (version.js) is build-injected from public/checkpoint/VERSION —
     see scripts/hash-checkpoint-assets.mjs — so this can never compare
     against a hand-typed, driftable version string. */
  function checkForNewVersion() {
    var current = window.CHECKPOINT_VERSION;
    if (!current || !S || !S.settings) return;
    var lastSeen = S.settings.lastSeenVersion;
    if (lastSeen && lastSeen !== current) {
      toast('Checkpoint updated to <b>v' + esc(current) + '</b> — <a href="#" data-action="App.openChangelog" style="color:inherit;text-decoration:underline">see what\'s new</a>');
    }
    if (lastSeen !== current) {
      S.settings.lastSeenVersion = current;
      Store.setSetting('lastSeenVersion', current).catch(function (e) { warn(e); });
    }
  }

  /* One capability object per area (conditionalAccess/identityProtection/
     pim/intune/secureScore), each { available, status, label, licence,
     note }. Demo mode never touches Graph, so it gets a fixed object
     matching what the seeded demo lastResults already assumes (every
     area available — the seeded pim/riskyusers results are concrete
     fail/review verdicts, not "manual", so telling a demo viewer those
     areas are unlicensed would contradict the very checklist they're
     looking at). Called once per boot (startLive()/App.startDemo()) —
     Graph.detectCapabilities() itself is what actually caches the real
     probe results for the rest of the session; this just records the
     outcome where app.js's render functions can reach it. */
  async function detectAppCapabilities() {
    if (Store.kind === 'demo') {
      CAP = {
        conditionalAccess: { key: 'conditionalAccess', label: 'Conditional Access', licence: 'Entra ID P1', available: true, status: 'available', note: '' },
        identityProtection: { key: 'identityProtection', label: 'Identity Protection', licence: 'Entra ID P2', available: true, status: 'available', note: '' },
        pim: { key: 'pim', label: 'Privileged Identity Management', licence: 'Entra ID P2 or Microsoft 365 E5', available: true, status: 'available', note: '' },
        intune: { key: 'intune', label: 'Intune device management', licence: 'Intune / Microsoft 365 Business Premium+', available: true, status: 'available', note: '' },
        secureScore: { key: 'secureScore', label: 'Microsoft Secure Score', licence: 'Any Microsoft 365 plan with Secure Score', available: true, status: 'available', note: '' }
      };
      return;
    }
    try { CAP = await Graph.detectCapabilities(); } catch (e) { warn(e); CAP = null; }
  }

  /* Sets READONLY from Graph.detectRole() (see graph.js — reads Entra ID
     group membership, "Checkpoint Viewers"/"Checkpoint Practitioners";
     never found -> full access, fail open, see the READONLY comment
     near the top of this file for why that's safe). Demo mode has no
     real tenant or SharePoint groups to check, so it's driven by a
     ?role=viewer query-string flag instead — a deliberate, harmless way
     to preview the Viewer experience without needing a real tenant set
     up, same spirit as every other demo-mode stand-in in this file. */
  async function detectAppReadOnly() {
    if (Store.kind === 'demo') {
      VIEWER_READONLY = new URLSearchParams(location.search).get('role') === 'viewer';
      recomputeReadOnly();
      return;
    }
    try { VIEWER_READONLY = !!(await Graph.detectRole()).readOnly; } catch (e) { warn(e); VIEWER_READONLY = false; }
    recomputeReadOnly();
  }

  /* Disables (and, for pure "+ Add X" entry points, hides) every
     control whose data-action/data-change-action is in
     MUTATING_ACTIONS/HIDE_ACTIONS, for a read-only session. Re-run on
     every DOM mutation inside #appShell (via startReadOnlyObserver()
     below) rather than threaded into each individual render* function
     — render* functions rebuild their own innerHTML often and
     independently of each other, and a MutationObserver here is a
     single, low-risk place to keep freshly-rendered buttons correctly
     locked without touching every renderer in this file. A no-op when
     READONLY is false, so this costs nothing for a Practitioner
     session. See the READONLY comment near the top of this file: this
     is UX only, never the security boundary. */
  function applyReadOnlyUi() {
    if (!document.body) return;
    document.body.classList.toggle('ro-active', !!READONLY);
    if (!READONLY) return;
    document.querySelectorAll('[data-action], [data-change-action]').forEach(function (el) {
      var raw = el.dataset.action || el.dataset.changeAction || '';
      var name = raw.indexOf('App.') === 0 ? raw.slice(4) : '';
      if (HIDE_ACTIONS.has(name)) {
        el.style.display = 'none';
      } else if (MUTATING_ACTIONS.has(name) && !el.disabled) {
        el.disabled = true;
        el.classList.add('ro-locked');
        el.title = 'Read-only access — ask a practitioner to make this change.';
      }
    });
  }

  var _roObserver = null;
  function startReadOnlyObserver() {
    if (_roObserver || !READONLY) return;
    var target = document.getElementById('appShell') || document.body;
    _roObserver = new MutationObserver(function () {
      clearTimeout(_roObserver._t);
      _roObserver._t = setTimeout(applyReadOnlyUi, 30);
    });
    _roObserver.observe(target, { childList: true, subtree: true });
  }

  /* ================= signed activation files =================
     A valid activation now licenses the WHOLE app for a real tenant —
     not just which framework toggles are on:
       - Provisioning: the onboarding wizard's Activation step (before
         site selection) must verify one before site selection/
         provisioning can proceed; SpStore.ensureLists() independently
         refuses to create a single new SharePoint list unless
         window.CHECKPOINT_ACTIVATION.verified is set (see store.js) —
         belt and braces, since the wizard is only one path to
         `Store.load()` (a returning tenant's self-heal is the other).
       - Operation: re-verified on every load (reconcileEntitlementsOnLoad(),
         called from startLive()) against the cached raw file
         (S.settings.entitlementFile) — the Settings list is a CACHE
         practitioners share, the Ed25519 signature is the truth.
         valid/grace -> normal operation. expired (past its grace
         window) -> READONLY is forced true (see recomputeReadOnly()) —
         every register/dashboard/report stays fully viewable and
         exportable, but every mutating action is disabled, same
         mechanism as a Viewer session. missing/invalid/tenant-mismatch
         -> startLive() never calls bootUi() at all; the caller shows
         the #notActivated screen instead (demo mode + a "paste
         activation" entry point), since at that point we can't trust
         this session is legitimately activated for this tenant.
     A framework is active if, and only if: iso27001 (the included
     baseline, always) or it's named in the frameworks[] array of the
     current activation. The Entitlements SharePoint list remains what
     entitledFrameworks() and every other framework gate in this file
     reads — a CACHE of the verified result, not the source of truth;
     App.toggleEntitlement still exists but only runs in demo mode. */

  /* window.FRAMEWORK's tenant-binding identifiers for the signed-in
     tenant — the Entra tenant GUID plus every verified domain, so an
     activation file's tenantId can be issued as either (see
     tools/ISSUANCE.md). Returns [] if tenant info couldn't be read
     (e.g. Directory.Read.All not yet consented) — an activation can
     never match an empty list, which fails safe (mismatch, not a
     false "valid"). */
  function tenantIdsFor(tenantInfo) {
    if (!tenantInfo) return [];
    return [tenantInfo.id].concat(tenantInfo.verifiedDomains || []).filter(Boolean);
  }

  /* Verifies a raw activation file's JSON text end to end: parse ->
     Ed25519 signature (WebCrypto) -> tenant match -> expiry/grace.
     Never throws — every failure mode returns { ok:false, reason } with
     a message written for a practitioner, not a stack trace. Pure with
     respect to Store/S — callable before either exists (the wizard's
     pre-provisioning Activation step) or after (reconcileEntitlementsOnLoad,
     App.applyEntitlementFile) identically; callers own persisting the
     raw text and applying its frameworks. */
  async function verifyActivationRaw(rawText, acceptTenantIds) {
    var parsed;
    try { parsed = JSON.parse(rawText); } catch (e) {
      return { ok: false, reason: 'This doesn\'t look like a valid activation file (not valid JSON).' };
    }
    if (!parsed || !parsed.payload || !parsed.signature) {
      return { ok: false, reason: 'Missing payload/signature — this doesn\'t look like a Compliance365 activation file.' };
    }
    var sigOk = false;
    try {
      sigOk = await window.CheckpointLib.verifyEntitlementSignature(crypto.subtle, CONFIG.entitlementPublicKey, parsed.payload, parsed.signature);
    } catch (e) {
      return { ok: false, reason: 'Could not verify signature: ' + (e.message || e) };
    }
    if (!sigOk) {
      return { ok: false, reason: 'Signature verification failed — this file may have been altered, or wasn\'t issued by Compliance365.' };
    }
    var today = new Date().toISOString().slice(0, 10);
    var evalResult = window.CheckpointLib.evaluateEntitlement(parsed.payload, acceptTenantIds, today);
    if (evalResult.status === 'mismatch') {
      return { ok: false, reason: 'This activation file is issued for a different tenant.' };
    }
    return { ok: true, raw: rawText, evalResult: evalResult };
  }

  /* Writes S.entitlements/the Entitlements list to match an evaluated
     result — iso27001 always on, every other framework on only if
     named in evalResult.frameworks. Called both right after a fresh
     upload and on every load from the cached file; only touches
     Store.setEntitlement for frameworks that actually changed, same
     restraint the onboarding wizard's own reconciliation uses. */
  async function applyEntitlementFrameworks(evalResult) {
    var granted = {};
    (evalResult.frameworks || []).forEach(function (fw) { granted[fw] = true; });
    /* FRAMEWORK_ORDER (compliance frameworks) + ADDON_MODULES (non-
       framework purchasable capabilities like 'ai') share one grant
       array in the signed activation and one S.entitlements[id] lookup
       — see window.ADDON_MODULES's comment in store.js. */
    var ids = window.FRAMEWORK_ORDER.concat(window.ADDON_MODULES || []);
    for (var i = 0; i < ids.length; i++) {
      var fw = ids[i];
      var shouldBeOn = fw === 'iso27001' || !!granted[fw];
      if (!!(S.entitlements && S.entitlements[fw]) !== shouldBeOn) {
        S.entitlements[fw] = shouldBeOn;
        try { await Store.setEntitlement(fw, shouldBeOn); } catch (e) { warn(e); }
      }
    }
  }

  /* Fetches, verifies and decrypts this tenant's purchased premium
     content packs, then merges each into window.FRAMEWORKS/GUIDANCE/
     NIST_SUBCATEGORIES/CHECK_E8 exactly as if it had shipped statically
     — every downstream reader (allControlSeeds, reconcileControls, SoA,
     reports) only ever looks at those globals and needs no changes.
     Must run BEFORE Store.load()/ensureLists() so seedControls() and
     reconcileControls() see the real control lists, not the empty
     stubs — see the three call sites below (wizard activation step,
     startLive()'s pre-load check, and reconcileEntitlementsOnLoad for
     an already-live tenant applying a fresh file post-load).

     Decrypted content is cached only in PACKS_MERGED/window.FRAMEWORKS
     for the lifetime of this page load — never written to localStorage
     — so a reload always re-verifies from scratch.

     Fail-soft, per module, by design (task's failure-mode spec):
       - manifest fetch fails entirely -> every premium module just
         stays at its empty stub; the app still works with the ISO 27001
         baseline (and, for an already-provisioned tenant, whatever
         Controls rows already exist in SharePoint from a previous,
         successful merge).
       - a specific module's pack fetch fails, its hash doesn't match
         the manifest, its key is wrong/missing, or it's tampered
         (WebCrypto's decrypt throws — wrong key and tampered ciphertext
         are indistinguishable, both correctly treated as "unavailable"),
         or its decrypted shape fails validatePackShape() -> that module
         alone stays at its empty stub with a clear reason, every other
         module still merges normally. */
  async function mergeLicensedPacks(evalResult) {
    var granted = (evalResult && evalResult.frameworks || []).filter(function (fw) { return fw !== 'iso27001'; });
    var moduleKeys = (evalResult && evalResult.moduleKeys) || {};
    var toMerge = granted.filter(function (fw) { return !PACKS_MERGED[fw]; });
    if (!toMerge.length) return;

    var manifest;
    try {
      var manifestResp = await fetch('packs/manifest.json');
      if (!manifestResp.ok) throw new Error('HTTP ' + manifestResp.status);
      manifest = await manifestResp.json();
    } catch (e) {
      warn('mergeLicensedPacks: could not load packs/manifest.json — every premium module stays unavailable this load: ' + (e.message || e));
      return;
    }

    for (var i = 0; i < toMerge.length; i++) {
      var moduleId = toMerge[i];
      try {
        var entry = manifest[moduleId];
        var key = moduleKeys[moduleId];
        if (!entry) throw new Error('no pack published for this module');
        if (!key) throw new Error('this activation carries no content key for this module');

        var packResp = await fetch('packs/' + entry.file);
        if (!packResp.ok) throw new Error('HTTP ' + packResp.status + ' fetching pack file');
        var packText = await packResp.text();

        var actualHash = await window.CheckpointLib.sha256Hex(crypto.subtle, new TextEncoder().encode(packText));
        if (actualHash !== entry.sha256) throw new Error('pack file does not match the published manifest hash — refusing to decrypt');

        var pack = JSON.parse(packText);
        var content = await window.CheckpointLib.decryptPack(crypto.subtle, key, pack);
        var shapeErr = window.CheckpointLib.validatePackShape(moduleId, content);
        if (shapeErr) throw new Error('decrypted content failed validation: ' + shapeErr);

        /* 'ai' is a purchasable add-on, not a compliance framework — its
           pack carries no real control set (content.framework.controls
           is an empty stub only so it satisfies the same
           validatePackShape() every pack goes through), so it merges
           into window.CHECKPOINT_AI_PACK for ai.js to read instead of
           window.FRAMEWORKS[moduleId].controls. Same provenance
           guarantees (hash-checked, key-decrypted) as every other
           module either way. */
        if (moduleId === 'ai') {
          window.CHECKPOINT_AI_PACK = content.extra || {};
          PACKS_MERGED[moduleId] = true;
          continue;
        }

        window.FRAMEWORKS[moduleId].controls = content.framework.controls;
        if (content.guidance) Object.assign(window.GUIDANCE, content.guidance);
        if (moduleId === 'nistcsf' && content.extra && content.extra.subcategories) {
          window.NIST_SUBCATEGORIES.push.apply(window.NIST_SUBCATEGORIES, content.extra.subcategories);
        }
        if (moduleId === 'essential8' && content.extra && content.extra.checkE8) {
          Object.assign(window.CHECK_E8, content.extra.checkE8);
        }
        PACKS_MERGED[moduleId] = true;
      } catch (e) {
        warn('mergeLicensedPacks: "' + moduleId + '" unavailable — treating it as unlicensed for this load: ' + (e.message || e));
      }
    }
  }

  /* Runs once per live-tenant load, right after Store.load() has
     definitely succeeded (so S.settings.entitlementFile reflects
     reality). No-op in demo mode. Returns true if the app should
     proceed to bootUi(), false if startLive() should show the
     #notActivated screen instead. Every distinct outcome is audit-
     logged (missing/rejected/expired) — 'valid'/'grace' are not, to
     avoid an audit-log entry on every single ordinary page load. */
  async function reconcileEntitlementsOnLoad(acceptTenantIds) {
    ENTITLEMENT_STATE = null;
    if (Store.kind === 'demo') { recomputeReadOnly(); return true; }
    var raw = S.settings && S.settings.entitlementFile;
    if (!raw) {
      audit('Activation missing', 'Activation', 'file', '', 'No activation file has ever been applied for this tenant.');
      recomputeReadOnly();
      return false;
    }
    var result = await verifyActivationRaw(raw, acceptTenantIds);
    if (!result.ok) {
      audit('Activation rejected', 'Activation', 'file', '', result.reason);
      recomputeReadOnly();
      return false;
    }
    ENTITLEMENT_STATE = result.evalResult;
    /* Covers the case the pre-load best-effort check in startLive()
       couldn't (no cached activation yet, or one that didn't verify) —
       e.g. the very first activation ever applied to an already-live
       tenant via retryActivationFromGate(). If this newly merges a
       module that wasn't merged before this tenant's lists were loaded,
       reconcileControls() self-heals the missing rows into both
       SharePoint and S.controls right now, same as it already does for
       a brand-new framework added to the app itself. */
    var before = Object.keys(PACKS_MERGED).length;
    await mergeLicensedPacks(result.evalResult);
    if (Object.keys(PACKS_MERGED).length > before) {
      try { await Store.reconcileControls(); } catch (e) { warn(e); }
    }
    await applyEntitlementFrameworks(result.evalResult);
    if (result.evalResult.status === 'expired') {
      audit('Activation expired', 'Activation', 'file', '', 'Expired ' + result.evalResult.expiry + ' — grace ended ' + result.evalResult.graceUntil + '.');
    } else if (result.evalResult.status === 'grace') {
      audit('Activation in grace period', 'Activation', 'file', '', 'Expired ' + result.evalResult.expiry + ' — grace until ' + result.evalResult.graceUntil + '.');
    }
    recomputeReadOnly();
    return true;
  }

  function renderEntitlementCard() {
    var el = document.getElementById('entitlementStatus');
    if (!el) return;
    if (Store.kind === 'demo') {
      el.innerHTML = '<p style="color:var(--paper-faint);font-size:12.5px">Demo mode uses the free toggle above — activation files apply to a real tenant only.</p>';
      return;
    }
    if (!ENTITLEMENT_STATE) {
      el.innerHTML = '<p style="color:var(--paper-faint);font-size:12.5px">No activation on file for this tenant — ISO 27001 is enabled as the included baseline.</p>';
      return;
    }
    var note = '';
    if (ENTITLEMENT_STATE.status === 'expired') {
      note = '<div class="appetite-banner" style="display:block;margin-top:10px"><b>Activation expired ' + fmtDate(ENTITLEMENT_STATE.expiry) + '</b> (grace period ended ' + fmtDate(ENTITLEMENT_STATE.graceUntil) + ') — Checkpoint is read-only until a renewed activation is applied. Every register, dashboard and report stays fully viewable and exportable; nothing can be added, edited or uploaded. Contact Compliance365 to renew.</div>';
    } else if (ENTITLEMENT_STATE.status === 'grace') {
      note = '<div class="appetite-banner" style="display:block;margin-top:10px"><b>Activation expired ' + fmtDate(ENTITLEMENT_STATE.expiry) + '</b> — in its grace period until <b>' + fmtDate(ENTITLEMENT_STATE.graceUntil) + '</b>. Checkpoint keeps working normally until then; renew before that date to avoid going read-only. Contact Compliance365 to renew.</div>';
    }
    el.innerHTML = '<div class="d-kv"><span>Tenant</span><b>' + esc(ENTITLEMENT_STATE.tenantId) + '</b></div>' +
      '<div class="d-kv"><span>Frameworks granted</span><b>' + esc((ENTITLEMENT_STATE.frameworks || []).map(fwName).join(', ') || '—') + '</b></div>' +
      '<div class="d-kv"><span>Issued</span><b>' + fmtDate(ENTITLEMENT_STATE.issuedAt) + '</b></div>' +
      '<div class="d-kv"><span>Expiry</span><b style="' + (ENTITLEMENT_STATE.status === 'valid' ? '' : 'color:var(--fail)') + '">' + fmtDate(ENTITLEMENT_STATE.expiry) + '</b></div>' +
      note;
  }

  /* Every scored:true check whose requiresCapability (if any) is
     satisfied — the same definition of "automatable" the Coverage card
     and Dashboard summary both use, kept in one place. Without a
     capability probe yet (CAP null — Graph call failed) every
     capability-gated check is conservatively counted as NOT automatable
     rather than guessing optimistic. */
  function automatableCheckCount() {
    var scored = window.CHECK_DEFS.filter(function (c) { return c.scored !== false; });
    var automatable = scored.filter(function (c) {
      if (!c.requiresCapability) return true;
      return !!(CAP && CAP[c.requiresCapability] && CAP[c.requiresCapability].available);
    });
    return { automatable: automatable.length, total: window.CHECK_DEFS.length };
  }

  /* Shows the third top-level screen (alongside #gate and #wizard) —
     reached only when a returning, already-onboarded tenant's cached
     activation is missing, doesn't verify, or is bound to a different
     tenant. Never shown to a brand-new tenant (those go through the
     wizard's own Activation step instead) or in demo mode (which
     never checks activation at all). Offers exploring the demo and a
     paste/upload entry point to retry without reloading the page. */
  function showNotActivatedScreen(reason) {
    document.getElementById('gate').style.display = 'none';
    document.getElementById('wizard').style.display = 'none';
    document.getElementById('appShell').style.display = 'none';
    var el = document.getElementById('notActivated');
    el.style.display = 'flex';
    var reasonEl = document.getElementById('notActivatedReason');
    if (reasonEl) reasonEl.textContent = reason || 'No activation file has been applied for this tenant yet.';
  }

  async function startLive() {
    Store = window.SpStore;
    busy(true);
    var status = document.getElementById('busyMsg');
    var tenantInfo = await Graph.tenantInfo();
    var acceptIds = tenantIdsFor(tenantInfo);

    /* Pre-load check, read-only (see readCachedActivation() in
       store.js) — authorises ensureLists() to self-heal a MISSING list
       for an existing tenant (rare: only matters if Checkpoint added a
       new list since this tenant last provisioned). The overwhelming
       common case is a no-op: every list already exists, so
       ensureLists() never even consults window.CHECKPOINT_ACTIVATION. */
    var cached = null;
    try { cached = await Store.readCachedActivation(); } catch (e) { cached = { raw: null }; }
    var preCheck = cached && cached.raw ? await verifyActivationRaw(cached.raw, acceptIds) : null;
    window.CHECKPOINT_ACTIVATION = { verified: !!(preCheck && preCheck.ok) };
    /* Must merge premium packs (if any) before Store.load()'s
       ensureLists()/reconcileControls() runs — see mergeLicensedPacks()'s
       doc comment. Best-effort: preCheck's evalResult is read-only and
       hasn't been re-verified post-load, but merging early is safe —
       reconcileEntitlementsOnLoad() re-verifies properly afterwards and
       any module this pre-check got wrong just stays/returns to its
       empty stub once that definitive check runs. */
    if (preCheck && preCheck.ok) { try { await mergeLicensedPacks(preCheck.evalResult); } catch (e) { warn(e); } }

    try {
      S = await Store.load(function (m) { if (status) status.textContent = m; });
    } catch (e) {
      /* Only reachable if ensureLists() refused to create a list this
         tenant is missing and window.CHECKPOINT_ACTIVATION.verified
         wasn't set above — i.e. this tenant needs an activation file
         before Checkpoint can (re)provision. */
      busy(false);
      showNotActivatedScreen((preCheck && preCheck.reason) || 'This tenant needs a Compliance365 activation file before Checkpoint can set up its records.');
      return;
    }
    S.client = (tenantInfo && tenantInfo.displayName) || (Graph.getAccount() && Graph.getAccount().username) || 'Connected tenant';
    await detectAppCapabilities();
    await detectAppReadOnly();

    /* Definitive, post-load activation check — S.settings.entitlementFile
       is now guaranteed to reflect reality (Store.load() just
       succeeded), unlike the best-effort pre-check above. */
    var proceed = await reconcileEntitlementsOnLoad(acceptIds);
    if (!proceed) {
      busy(false);
      showNotActivatedScreen('This tenant\'s activation is missing or no longer verifies — apply a current Compliance365 activation file to continue, or explore the demo instead.');
      return;
    }
    bootUi('Live — records stored as SharePoint lists in this tenant', S.client);
  }

  /* Verifies and applies a pasted/uploaded activation file from the
     #notActivated screen. If this tenant's lists already loaded
     successfully (the common case — activation was merely missing/
     invalid, not a first-time-provisioning block), persists in place
     and re-evaluates without a full reload. Otherwise (Store.load()
     never succeeded — a first-time-provisioning block) authorises and
     re-runs startLive() from scratch. */
  async function retryActivationFromGate() {
    var fileInput = document.getElementById('naFileInput');
    var textInput = document.getElementById('naPasteInput');
    var file = fileInput && fileInput.files && fileInput.files[0];
    var rawText;
    if (file) { rawText = await file.text(); }
    else if (textInput && textInput.value.trim()) { rawText = textInput.value.trim(); }
    else { toast('Choose a file or paste the activation JSON first.'); return; }

    busy(true);
    var tenantInfo = await Graph.tenantInfo();
    var acceptIds = tenantIdsFor(tenantInfo);
    var result = await verifyActivationRaw(rawText, acceptIds);
    if (!result.ok) {
      busy(false);
      toast('<b>Activation rejected:</b> ' + esc(result.reason));
      if (Store && S) { try { audit('Activation rejected', 'Activation', 'file', '', result.reason); } catch (e) { /* ignore */ } }
      return;
    }
    if (Store && S) {
      try { await Store.setSetting('entitlementFile', rawText); S.settings.entitlementFile = rawText; } catch (e) { warn(e); }
      var proceed = await reconcileEntitlementsOnLoad(acceptIds);
      busy(false);
      if (proceed) { bootUi('Live — records stored as SharePoint lists in this tenant', S.client); }
      else { toast('Still not able to activate — see the message above.'); }
    } else {
      window.CHECKPOINT_ACTIVATION = { verified: true };
      await startLive();
    }
  }

  /* Runs once per signed-in page load: a lightweight, read-only check
     of whether THIS tenant has already completed onboarding, before
     anything gets provisioned. Onboarded -> straight to the dashboard
     (startLive() itself re-verifies activation before showing it), same
     as the app has always behaved. Not onboarded -> the wizard picks up
     at step 3 (capability check); steps 1-2 (welcome, consent) only
     ever show pre-sign-in, from App.signIn() -> Wizard.start(). */
  async function afterSignIn() {
    applyStoredSitePreference();
    busy(true);
    var msg = document.getElementById('busyMsg');
    if (msg) msg.textContent = 'Checking your tenant…';
    var probe;
    try { probe = await window.SpStore.probeOnboardingState(); } catch (e) { probe = { onboarded: false }; }
    if (probe.onboarded) { await startLive(); return; }
    busy(false);
    Wizard.startAt(3);
  }

  /* A chosen non-root SharePoint site path (Wizard step 4) has to be
     remembered for every future load of THIS tenant, in THIS browser —
     CONFIG.site is a single value shared by config.js across every
     tenant this deployment serves, and Store.load() would otherwise
     provision a second, wrong set of lists back at the default root
     site on the next visit. There's nowhere else to persist this
     ahead of the Settings list existing (chosen site -> Settings list
     location is exactly the circular dependency this sidesteps), so
     it's kept in this browser's localStorage, keyed by tenant, and
     re-applied to the shared CONFIG object before every Store call.
     A different browser/device's first live use after onboarding from
     elsewhere would fall back to the config.js default (root) — a
     known limitation of this approach, not a silent failure: root
     always resolves, so nothing breaks, but a client onboarded onto a
     non-root site from a second device needs that path set again. */
  function tenantStorageKey() {
    var acc = Graph.getAccount();
    return (acc && (acc.tenantId || acc.homeAccountId)) || 'default';
  }
  function applyStoredSitePreference() {
    try {
      var v = localStorage.getItem('cpSite:' + tenantStorageKey());
      if (v) window.CHECKPOINT_CONFIG.site = v;
    } catch (e) { /* localStorage unavailable (private browsing etc.) — config.js default applies */ }
  }

  /* ================= onboarding wizard =================
     Replaces the old cold start (sign in -> straight to a freshly
     auto-provisioned tenant) for any tenant that hasn't completed
     setup: a welcome screen, a plain-English consent explainer shown
     BEFORE Graph.signIn() ever runs (read-only scopes only, per the
     incremental-consent model config.js already documents), a
     read-only tenant capability check, site selection with
     validation, framework selection, provisioning (reusing
     Store.load()'s existing onStatus progress messages), and a first
     scan with a results summary. All state lives in the module-level
     `W` variable declared at the top of this file — never written
     anywhere until the single Store.setSetting('onboardedDate', ...)
     call at the end of provisioning; abandoning the wizard mid-way
     (closing the tab) leaves nothing half-saved. Every step is wired
     via data-action/data-change-action, resolved by the exact same
     delegated-listener mechanism the rest of App already uses — nothing
     here is bound with inline on*="" handlers. */
  var WIZARD_STEP_COUNT = 9;

  function showWizardStep(n) {
    W.step = n;
    document.querySelectorAll('.wizard-step').forEach(function (el) { el.classList.remove('on'); });
    var el = document.getElementById('wizStep' + n);
    if (el) el.classList.add('on');
    var dots = document.getElementById('wizardProgress');
    if (dots) {
      var html = '';
      for (var i = 1; i <= WIZARD_STEP_COUNT; i++) {
        html += '<span class="wizard-dot' + (i === n ? ' on' : i < n ? ' done' : '') + '"></span>';
      }
      dots.innerHTML = html;
    }
    window.scrollTo(0, 0);
    /* Moves keyboard/screen-reader focus to the new step on every
       transition (each .wizard-step has tabindex="-1" precisely so it
       can receive focus programmatically without joining the normal
       Tab order) — otherwise focus silently stays on whatever button
       triggered the step change, now detached from the visible step,
       and a screen reader never announces that the content changed. */
    if (el) el.focus();
  }

  var WIZARD_PERM_WHY = {
    'User.Read': 'Your basic profile, so Checkpoint knows who is signed in.',
    'Directory.Read.All': 'Counts Global Administrators and guest users, and reads OAuth app consents — feeds several posture checks.',
    'Policy.Read.All': 'Reads Conditional Access policies, to check MFA coverage and whether legacy authentication is blocked.',
    'SecurityEvents.Read.All': 'Reads your Microsoft Secure Score.',
    'DeviceManagementManagedDevices.Read.All': 'Reads Intune device compliance status.',
    'DeviceManagementConfiguration.Read.All': 'Checks whether Intune compliance policies exist at all.',
    'RoleManagement.Read.Directory': 'Checks whether privileged directory roles use time-bound (PIM-eligible) assignment rather than standing access.',
    'IdentityRiskyUser.Read.All': "Checks for risky sign-ins and risky users — needs Microsoft Entra ID P2, skipped gracefully if you don't have it."
  };
  function renderWizardConsentList() {
    var el = document.getElementById('wizConsentList');
    if (!el) return;
    el.innerHTML = (CONFIG.scopesReadOnly || []).map(function (scope) {
      return '<div class="wiz-perm-row"><span class="wiz-perm-name">' + esc(scope) + '</span><span class="wiz-perm-why">' + esc(WIZARD_PERM_WHY[scope] || 'Used by a posture check.') + '</span></div>';
    }).join('');
  }

  /* Read-only Graph probes only — no SharePoint/Sites.Manage.All scope
     touched here, consistent with "read-only first". Never blocks
     progress on a missing capability, same philosophy runPostureChecks()
     itself now uses: an unavailable capability just means the checks
     depending on it come back a clean 'manual' later, never a hard
     stop. Reuses the exact same Graph.detectCapabilities() the Coverage
     card (Scan view) and Dashboard summary consult after onboarding —
     one probe set, one cache, no separate wizard-only copy to drift out
     of sync with the rest of the app. */
  async function runWizardCapabilityCheck() {
    var listEl = document.getElementById('wizCapabilityList');
    var sumEl = document.getElementById('wizCapabilitySummary');
    var nextBtn = document.getElementById('wizStep3Next');
    if (!listEl || !sumEl || !nextBtn) return;
    var keys = ['conditionalAccess', 'identityProtection', 'pim', 'intune', 'secureScore'];
    listEl.innerHTML = keys.map(function (k) {
      return '<div class="wiz-cap-row" id="wizCap-' + esc(k) + '"><div class="wiz-cap-label">Checking…</div><span class="chip st-Notstarted">…</span></div>';
    }).join('');
    sumEl.textContent = '';
    nextBtn.disabled = true;
    nextBtn.textContent = 'Checking…';

    var cap = await Graph.detectCapabilities();
    CAP = cap;
    keys.forEach(function (k) {
      var c = cap[k];
      var row = document.getElementById('wizCap-' + k);
      if (row && c) {
        row.innerHTML = '<div><div class="wiz-cap-label">' + esc(c.label) + ' <span class="src">(' + esc(c.licence) + ')</span></div>' + (c.note ? '<div class="wiz-cap-note">' + esc(c.note) + '</div>' : '') + '</div>' +
          '<span class="chip ' + (c.available ? 'st-Implemented' : 'st-Notstarted') + '">' + (c.available ? 'Available' : 'Not available') + '</span>';
      }
    });
    var okCount = keys.filter(function (k) { return cap[k] && cap[k].available; }).length;
    var counts = automatableCheckCount();
    sumEl.innerHTML = okCount + ' of ' + keys.length + ' capabilities available in this tenant — ' + counts.automatable + ' of ' + counts.total + ' posture checks will run automatically; the rest show as Manual until that licence or access is in place.';
    nextBtn.disabled = false;
    nextBtn.textContent = 'Continue';
  }

  /* Which frameworks are on the table at all in this wizard run —
     iso27001 (the included baseline, always) plus whatever the
     verified Activation step granted (W.activationGranted, a plain
     object set by Wizard.applyActivation()). A framework NOT in this
     set can't be toggled on here at all: the activation, not a free
     self-service pick, is the source of truth for what a tenant is
     licensed for — same principle the live Frameworks/Settings view
     already enforces post-onboarding. */
  function renderWizardFrameworks() {
    var el = document.getElementById('wizFrameworkRows');
    if (!el) return;
    var granted = W.activationGranted || {};
    el.innerHTML = window.FRAMEWORK_ORDER.map(function (fw) {
      var f = window.FRAMEWORKS[fw];
      var on = !!W.frameworks[fw];
      if (fw === 'iso27001') {
        return '<div class="card wiz-fw-row"><div><b>' + esc(f.name) + '</b><p>' + esc(f.blurb) + '</p></div><span class="chip st-Implemented">Included baseline</span></div>';
      }
      if (!granted[fw]) {
        return '<div class="card wiz-fw-row"><div><b>' + esc(f.name) + '</b><p>' + esc(f.blurb) + '</p></div><span class="chip st-Notstarted">Not in your activation</span></div>';
      }
      return '<div class="card wiz-fw-row"><div><b>' + esc(f.name) + '</b><p>' + esc(f.blurb) + '</p></div><button class="toggle' + (on ? ' on' : '') + '" role="switch" aria-checked="' + (on ? 'true' : 'false') + '" aria-label="' + esc(f.name) + '" data-action="Wizard.toggleFramework" data-id="' + fw + '"></button></div>';
    }).join('');
  }

  /* Verifies a pasted/uploaded activation file for the wizard's
     Activation step (before site selection/provisioning — see the
     "signed activation files" section above verifyActivationRaw()).
     Only 'valid' or 'grace' unlock Continue: an activation that's
     already past its grace window shouldn't be able to bootstrap a
     BRAND NEW tenant (grace exists so an already-operating client
     isn't cut off mid-renewal, not to let a stale file start one). On
     success, seeds W.frameworks/W.activationGranted so the next step's
     framework picker only offers what's actually licensed. */
  async function runWizardActivationCheck() {
    var fileInput = document.getElementById('wizActFileInput');
    var textInput = document.getElementById('wizActPasteInput');
    var statusEl = document.getElementById('wizActStatus');
    var nextBtn = document.getElementById('wizStep4Next');
    var file = fileInput && fileInput.files && fileInput.files[0];
    var rawText;
    if (file) { rawText = await file.text(); }
    else if (textInput && textInput.value.trim()) { rawText = textInput.value.trim(); }
    else { if (statusEl) statusEl.innerHTML = '<span style="color:var(--fail)">Choose a file or paste the activation JSON first.</span>'; return; }

    if (statusEl) statusEl.textContent = 'Verifying…';
    if (nextBtn) nextBtn.disabled = true;
    var tenantInfo = await Graph.tenantInfo();
    var result = await verifyActivationRaw(rawText, tenantIdsFor(tenantInfo));
    if (!result.ok) {
      if (statusEl) statusEl.innerHTML = '<span style="color:var(--fail)">Activation rejected: ' + esc(result.reason) + '</span>';
      if (nextBtn) nextBtn.disabled = true;
      return;
    }
    if (result.evalResult.status === 'expired') {
      if (statusEl) statusEl.innerHTML = '<span style="color:var(--fail)">This activation expired ' + esc(fmtDate(result.evalResult.expiry)) + ' (grace period ended ' + esc(fmtDate(result.evalResult.graceUntil)) + ') — contact Compliance365 for a renewed file.</span>';
      if (nextBtn) nextBtn.disabled = true;
      return;
    }
    W.activationRaw = rawText;
    W.activationEval = result.evalResult;
    W.activationGranted = {};
    (result.evalResult.frameworks || []).forEach(function (fw) { W.activationGranted[fw] = true; });
    W.frameworks = { iso27001: true };
    (result.evalResult.frameworks || []).forEach(function (fw) { W.frameworks[fw] = true; });
    /* Must merge premium packs now, before this tenant's SharePoint
       lists ever get provisioned (runWizardProvisioning()'s Store.load()
       -> ensureLists() -> seedControls() reads window.FRAMEWORKS
       synchronously) — see mergeLicensedPacks()'s doc comment. */
    await mergeLicensedPacks(result.evalResult);
    if (statusEl) {
      statusEl.innerHTML = result.evalResult.status === 'grace'
        ? '<span style="color:var(--gold-light)">Verified — in its grace period until ' + esc(fmtDate(result.evalResult.graceUntil)) + '. Frameworks: ' + esc((result.evalResult.frameworks || []).map(fwName).join(', ') || '—') + '.</span>'
        : '<span style="color:var(--pass)">Verified ✓ — frameworks: ' + esc((result.evalResult.frameworks || []).map(fwName).join(', ') || '—') + ', valid until ' + esc(fmtDate(result.evalResult.expiry)) + '.</span>';
    }
    if (nextBtn) nextBtn.disabled = false;
  }

  /* "Re-run setup" re-enters the wizard on an already-live tenant that
     (almost always) already has a good cached activation — without
     this, every re-run would force pasting the same file in again for
     no reason. No-op for brand-new onboarding (S doesn't exist yet)
     and silently leaves the Activation step blank if the cached file
     no longer verifies or is expired past grace — same as any other
     reject, the practitioner just pastes a current one. */
  async function prefillWizardActivationFromCache() {
    if (!S || !S.settings || !S.settings.entitlementFile || (W && W.activationRaw)) return;
    var tenantInfo = await Graph.tenantInfo();
    var result = await verifyActivationRaw(S.settings.entitlementFile, tenantIdsFor(tenantInfo));
    if (!result.ok || result.evalResult.status === 'expired') return;
    W.activationRaw = S.settings.entitlementFile;
    W.activationEval = result.evalResult;
    W.activationGranted = {};
    (result.evalResult.frameworks || []).forEach(function (fw) { W.activationGranted[fw] = true; });
    W.frameworks = { iso27001: true };
    (result.evalResult.frameworks || []).forEach(function (fw) { W.frameworks[fw] = true; });
    await mergeLicensedPacks(result.evalResult);
    var statusEl = document.getElementById('wizActStatus');
    var nextBtn = document.getElementById('wizStep4Next');
    if (statusEl) statusEl.innerHTML = '<span style="color:var(--pass)">Using the activation already on file for this tenant — frameworks: ' + esc((result.evalResult.frameworks || []).map(fwName).join(', ') || '—') + ', valid until ' + esc(fmtDate(result.evalResult.expiry)) + '. Paste a different file above only to replace it.</span>';
    if (nextBtn) nextBtn.disabled = false;
  }

  /* Step 7 — optional, only reached when W.activationGranted.ai is
     true (see Wizard.next()'s step-6 branch). Pre-fills from whatever
     Settings already has (a "Re-run setup" pass on an already-
     configured tenant), same prefill convention as the Activation
     step. Saving here writes straight to Settings via App.aiSaveConfig
     — the same save path the AI assistant view's own Save button
     uses, so there is exactly one place that actually persists these
     two values. */
  function renderWizardAiStep() {
    var endpointEl = document.getElementById('wizAiEndpoint');
    var deploymentEl = document.getElementById('wizAiDeployment');
    if (endpointEl) endpointEl.value = (S.settings && S.settings.aiEndpoint) || '';
    if (deploymentEl) deploymentEl.value = (S.settings && S.settings.aiDeployment) || '';
    var statusEl = document.getElementById('wizAiStatus');
    if (statusEl) statusEl.textContent = '';
  }

  async function runWizardProvisioning() {
    var msgEl = document.getElementById('wizProvisionMsg');
    try {
      if (W.resolvedSite && W.resolvedSite !== 'root') {
        window.CHECKPOINT_CONFIG.site = W.resolvedSite;
        try { localStorage.setItem('cpSite:' + tenantStorageKey(), W.resolvedSite); } catch (e) { /* private browsing etc. — the choice just won't survive to a future session */ }
      }
      /* Authorises store.js's ensureLists() to create this tenant's
         lists — the Activation step (before site selection) already
         Ed25519-verified W.activationRaw in memory; this is the one
         and only place that verification result gets to matter for
         provisioning. Persisted into the Settings list itself just
         below, right after it exists, so every future load re-verifies
         from the cache instead of trusting this in-memory flag again. */
      window.CHECKPOINT_ACTIVATION = { verified: !!W.activationRaw };
      Store = window.SpStore;
      S = await Store.load(function (m) { if (msgEl) msgEl.textContent = m; });

      if (W.activationRaw) {
        try { await Store.setSetting('entitlementFile', W.activationRaw); S.settings.entitlementFile = W.activationRaw; } catch (e) { warn(e); }
      }

      if (msgEl) msgEl.textContent = 'Applying your framework selection…';
      for (var i = 0; i < window.FRAMEWORK_ORDER.length; i++) {
        var fw = window.FRAMEWORK_ORDER[i];
        var want = !!W.frameworks[fw];
        if (!!S.entitlements[fw] !== want) {
          try { await Store.setEntitlement(fw, want); } catch (e) { warn(e); }
        }
      }
      /* Add-on modules (currently just 'ai') aren't a step-6 pick — they
         come straight from what the activation itself granted
         (W.activationGranted, populated from the Activation step), same
         as iso27001's baseline handling above just doesn't need a want
         check since it's always true. */
      var addons = window.ADDON_MODULES || [];
      for (var j = 0; j < addons.length; j++) {
        var addon = addons[j];
        var wantAddon = !!(W.activationGranted && W.activationGranted[addon]);
        if (!!S.entitlements[addon] !== wantAddon) {
          try { await Store.setEntitlement(addon, wantAddon); } catch (e) { warn(e); }
        }
      }
      /* The optional "Enable AI" step (7) only ever buffers into W —
         Store/S aren't the live tenant's yet at that point in the flow
         (Store only becomes SpStore, and S only gets (re)loaded, right
         above in this same function) — so the actual Settings writes
         happen here, now that both are real. Only runs at all if that
         step was ever shown (W.activationGranted.ai) — Wizard.skipAi()
         leaves W.aiEndpoint/aiDeployment blank and W.aiEnabled false,
         which is a no-op write, harmless but skipped for tidiness. */
      if (W.activationGranted && W.activationGranted.ai) {
        try {
          await Store.setSetting('aiEndpoint', W.aiEndpoint || '');
          await Store.setSetting('aiDeployment', W.aiDeployment || '');
          await Store.setSetting('aiEnabled', W.aiEnabled ? 'true' : 'false');
          S.settings.aiEndpoint = W.aiEndpoint || '';
          S.settings.aiDeployment = W.aiDeployment || '';
          S.settings.aiEnabled = W.aiEnabled ? 'true' : 'false';
        } catch (e) { warn(e); }
      }

      var tenantInfo = await Graph.tenantInfo();
      S.client = (tenantInfo && tenantInfo.displayName) || (Graph.getAccount() && Graph.getAccount().username) || 'Connected tenant';
      ENTITLEMENT_STATE = W.activationEval || null;
      recomputeReadOnly();
      if (W.activationEval) {
        audit('Activation applied', 'Activation', 'file', '(none)', W.activationEval.status + ' until ' + W.activationEval.expiry + ': ' + W.activationEval.frameworks.join(', '));
      }

      if (msgEl) msgEl.textContent = 'Running your first posture scan…';
      await App.runScan();

      if (msgEl) msgEl.textContent = 'Finishing up…';
      var todayIso = new Date().toISOString().slice(0, 10);
      try { await Store.setSetting('onboardedDate', todayIso); S.settings.onboardedDate = todayIso; } catch (e) { warn(e); }

      showWizardStep(9);
      renderWizardResults();
    } catch (e) {
      warn(e);
      if (msgEl) msgEl.innerHTML = 'Something went wrong during setup: ' + esc(e.message || String(e)) + '.<br><button class="btn ghost sm" data-action="Wizard.retryProvisioning" style="margin-top:14px">Try again</button>';
    }
  }

  function renderWizardResults() {
    var finishBtn = document.getElementById('wizFinishBtn');
    if (finishBtn) finishBtn.style.display = '';
    var entitled = entitledFrameworks();
    var primaryFw = entitled.indexOf('iso27001') > -1 ? 'iso27001' : entitled[0];
    var pct = primaryFw ? window.CheckpointLib.readinessPct(frameworkAppRows(primaryFw)) : 0;
    var gaps = primaryFw ? frameworkAppRows(primaryFw).filter(function (c) { return c.st !== 'Implemented'; }).slice(0, 5) : [];
    var nextActions = (S.proposed || []).slice(0, 3).map(function (tpl) { return TPL[tpl] ? TPL[tpl].risk.title : null; }).filter(Boolean);
    var fillers = ['Review your Statement of Applicability and confirm which controls apply to you', 'Invite your team and assign control owners', 'Set your scan reminder cadence in Frameworks & Settings'];
    for (var i = 0; nextActions.length < 3 && i < fillers.length; i++) {
      if (nextActions.indexOf(fillers[i]) === -1) nextActions.push(fillers[i]);
    }

    var el = document.getElementById('wizResultsSummary');
    if (!el) return;
    el.innerHTML =
      '<div class="grid kpis" style="margin-bottom:20px"><div class="card kpi"><div class="kpi-num"><b>' + pct + '<small>%</small></b></div><span>' + (primaryFw ? esc(fwName(primaryFw)) : 'Framework') + ' readiness</span></div></div>' +
      (gaps.length
        ? '<div class="card" style="margin-bottom:16px"><h3 style="margin-bottom:10px">Top gaps</h3>' + gaps.map(function (c) {
            return '<div class="wiz-gap-row"><span class="wiz-gap-title">' + esc(c.id) + ' — ' + esc(c.t) + '</span><span class="chip st-Notstarted">' + esc(c.st) + '</span></div>';
          }).join('') + '</div>'
        : '') +
      '<div class="card"><h3 style="margin-bottom:10px">Suggested next actions</h3><ol style="padding-left:18px;color:var(--paper-dim);font-size:13px;line-height:1.9">' +
      nextActions.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ol></div>';
  }

  window.Wizard = {
    start: function () {
      W = { step: 1, siteType: 'root', sitePath: '', resolvedSite: null, frameworks: { iso27001: true }, activationRaw: null, activationEval: null, activationGranted: {} };
      document.getElementById('gate').style.display = 'none';
      document.getElementById('wizard').style.display = 'flex';
      showWizardStep(1);
    },

    /* Entered directly (no steps 1-2) once already signed in — either
       resuming right after Graph.signIn()'s redirect, or a "Re-run
       setup" call from an already-live session. If this tenant already
       has a still-good cached activation (the "Re-run setup" case —
       first-time onboarding never does, there's nothing cached yet),
       pre-fills the Activation step from it so re-running setup doesn't
       force re-pasting a file that hasn't changed. */
    startAt: function (n) {
      if (!W) W = { step: n, siteType: 'root', sitePath: '', resolvedSite: null, frameworks: { iso27001: true }, activationRaw: null, activationEval: null, activationGranted: {} };
      document.getElementById('gate').style.display = 'none';
      document.getElementById('appShell').style.display = 'none';
      document.getElementById('notActivated').style.display = 'none';
      document.getElementById('wizard').style.display = 'flex';
      showWizardStep(n);
      if (n === 3) runWizardCapabilityCheck();
      prefillWizardActivationFromCache();
    },

    next: function () {
      if (W.step === 1) { showWizardStep(2); renderWizardConsentList(); return; }
      if (W.step === 3) { showWizardStep(4); return; }
      if (W.step === 4) { showWizardStep(5); return; }
      /* The "Enable AI" step is skipped entirely if this activation
         doesn't grant the 'ai' add-on at all — nothing to configure,
         so straight to provisioning, same "don't show a step with
         nothing to do" rule the rest of the wizard already follows. */
      if (W.step === 6) {
        if (W.activationGranted && W.activationGranted.ai) { showWizardStep(7); renderWizardAiStep(); }
        else { showWizardStep(8); runWizardProvisioning(); }
        return;
      }
      if (W.step === 7) { showWizardStep(8); runWizardProvisioning(); return; }
      showWizardStep(Math.min(W.step + 1, WIZARD_STEP_COUNT));
    },

    applyActivation: function () { return runWizardActivationCheck(); },

    back: function () { if (W.step > 1) showWizardStep(W.step - 1); },

    doSignIn: async function () {
      try {
        busy(true);
        await Graph.signIn();
      } catch (e) {
        busy(false);
        if (e.errorCode !== 'user_cancelled') toast('<b>Sign-in failed:</b> ' + esc(e.message || e));
      }
    },

    setSiteType: function (val) {
      W.siteType = val;
      var pathEl = document.getElementById('wizSitePath');
      if (pathEl) pathEl.style.display = val === 'custom' ? '' : 'none';
      var valEl = document.getElementById('wizSiteValidation');
      if (valEl) valEl.textContent = '';
    },
    setSitePathInput: function (val) {
      W.sitePath = val;
      var valEl = document.getElementById('wizSiteValidation');
      if (valEl) valEl.textContent = '';
    },
    validateSite: async function () {
      var valEl = document.getElementById('wizSiteValidation');
      var btn = document.getElementById('wizStep5Next');
      if (W.siteType === 'root') {
        W.resolvedSite = 'root';
        showWizardStep(6); renderWizardFrameworks();
        return;
      }
      var path = (W.sitePath || '').trim();
      if (!path || path.charAt(0) !== '/') {
        if (valEl) valEl.innerHTML = '<span style="color:var(--fail)">Enter a path starting with / — e.g. /sites/compliance</span>';
        return;
      }
      if (btn) { btn.disabled = true; btn.textContent = 'Validating…'; }
      if (valEl) valEl.textContent = '';
      try {
        var site = await window.SpStore.validateSitePath(path);
        if (valEl) valEl.innerHTML = '<span style="color:var(--pass)">Found "' + esc(site.name || path) + '" ✓</span>';
        W.resolvedSite = path;
        if (btn) { btn.disabled = false; btn.textContent = 'Validate & continue'; }
        showWizardStep(6); renderWizardFrameworks();
      } catch (e) {
        if (valEl) valEl.innerHTML = '<span style="color:var(--fail)">Couldn\'t find a site at "' + esc(path) + '" — check the path and try again.</span>';
        if (btn) { btn.disabled = false; btn.textContent = 'Validate & continue'; }
      }
    },

    toggleFramework: function (fw) {
      W.frameworks[fw] = !W.frameworks[fw];
      renderWizardFrameworks();
    },

    retryProvisioning: function () { runWizardProvisioning(); },

    /* Connectivity test only — never writes Settings (Store/S aren't
       live yet at step 7; see runWizardProvisioning()'s own comment).
       Calls aiInitOnce() itself since bootUi() (the normal place that
       happens) hasn't run yet this early in onboarding — Graph.signIn()
       already has, earlier in the wizard, so Graph.aiToken() has a real
       account to acquire a token for. */
    testAi: async function () {
      var endpoint = document.getElementById('wizAiEndpoint').value.trim();
      var deployment = document.getElementById('wizAiDeployment').value.trim();
      var statusEl = document.getElementById('wizAiStatus');
      if (!endpoint || !deployment) { if (statusEl) statusEl.innerHTML = '<span style="color:var(--fail)">Enter both an endpoint and a deployment name first.</span>'; return; }
      if (statusEl) statusEl.textContent = 'Testing…';
      aiInitOnce();
      try {
        var result = await window.CheckpointAI.testConnection({ endpoint: endpoint, deployment: deployment, apiVersion: '2024-08-01-preview' });
        if (statusEl) statusEl.innerHTML = result.ok ? '<span style="color:var(--pass)">Connected.</span>' : '<span style="color:var(--fail)">' + esc(result.message) + '</span>';
      } catch (e) {
        if (statusEl) statusEl.innerHTML = '<span style="color:var(--fail)">' + esc(e.message || e) + '</span>';
      }
    },

    skipAi: function () {
      W.aiEndpoint = ''; W.aiDeployment = ''; W.aiEnabled = false;
      showWizardStep(8); runWizardProvisioning();
    },

    saveAiAndContinue: function () {
      W.aiEndpoint = document.getElementById('wizAiEndpoint').value.trim();
      W.aiDeployment = document.getElementById('wizAiDeployment').value.trim();
      W.aiEnabled = !!(W.aiEndpoint && W.aiDeployment);
      showWizardStep(8); runWizardProvisioning();
    },

    finish: function () {
      document.getElementById('wizard').style.display = 'none';
      bootUi('Live — records stored as SharePoint lists in this tenant', S.client);
    }
  };

  document.querySelectorAll('.nav-item').forEach(function (n) {
    n.addEventListener('click', function () { App.go(n.dataset.v); });
  });

  /* ================= event delegation =================
     No inline on*="" attributes anywhere in this app's markup — needed
     to run script-src without 'unsafe-inline' in the CSP. Dynamically
     rendered rows/cards carry data-action (+ optionally data-id)
     instead of onclick="..."; these listeners resolve the dotted path
     to the same App.foo() functions the markup used to call directly,
     so every render function's call sites are unchanged in spirit —
     only how the call gets wired up changed. */
  function resolvePath(path) {
    var parts = path.split('.'), obj = window;
    for (var i = 0; i < parts.length; i++) { if (!obj) return null; obj = obj[parts[i]]; }
    return typeof obj === 'function' ? obj : null;
  }

  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-action]');
    if (!el) return;
    var fn = resolvePath(el.dataset.action);
    if (!fn) return;
    if (el.tagName === 'A') e.preventDefault();
    /* Defence-in-depth alongside applyReadOnlyUi()'s disabled attribute
       (covers any control the MutationObserver hasn't caught up to
       yet, or an <a> — disabled has no effect on anchors). Still just
       UX: see the READONLY comment near the top of this file. */
    if (READONLY && isMutatingAction(el.dataset.action)) { toast('Read-only access — ask a practitioner to make this change.'); return; }
    fn(el.dataset.id);
  });

  /* mousedown, not click — search results must select before the
     search input's blur handler closes the results dropdown */
  document.addEventListener('mousedown', function (e) {
    var el = e.target.closest('[data-mousedown-action]');
    if (!el) return;
    var fn = resolvePath(el.dataset.mousedownAction);
    if (fn) fn(el.dataset.id);
  });

  document.addEventListener('change', function (e) {
    var el = e.target.closest('[data-change-action]');
    if (!el) return;
    var fn = resolvePath(el.dataset.changeAction);
    if (!fn) return;
    if (READONLY && isMutatingAction(el.dataset.changeAction)) { toast('Read-only access — ask a practitioner to make this change.'); return; }
    if (el.dataset.id !== undefined) fn(el.dataset.id, el.value);
    else fn(el.value);
  });

  var gsearchInput = document.getElementById('gsearchInput');
  if (gsearchInput) {
    gsearchInput.addEventListener('input', function () { App.searchInput(this.value); });
    gsearchInput.addEventListener('focus', function () { App.searchInput(this.value); });
    gsearchInput.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { App.closeSearch(); return; }
      if (e.key === 'ArrowDown') { e.preventDefault(); App.searchKeyNav(1); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); App.searchKeyNav(-1); return; }
      if (e.key === 'Enter') { e.preventDefault(); App.searchKeySelect(); }
    });
    gsearchInput.addEventListener('blur', function () { setTimeout(App.closeSearch, 150); });
  }

  (async function init() {
    var demoParam = /[?&]demo/.test(location.search) || /[?&]selftest=1\b/.test(location.search);
    var hasMsal = typeof msal !== 'undefined';
    var configured = !!CONFIG.clientId && hasMsal;

    if (!configured || demoParam) {
      if (!configured) document.getElementById('gateNote').textContent =
        'No app registration configured yet — demo mode only. See SETUP.md to connect real tenants.';
      if (demoParam) { await App.startDemo(); return; }
    }

    if (configured) {
      var ok = await Graph.init();
      if (ok && Graph.getAccount()) {
        /* signed in already — either a returning session, or Entra
           just redirected back from Wizard.doSignIn(). Either way,
           afterSignIn() decides: onboarded -> straight to the
           dashboard; not yet -> the wizard picks up at step 3. */
        try { await afterSignIn(); return; } catch (e) { console.error(e); busy(false); }
      }
      document.getElementById('btnGateSignIn').style.display = '';
    }
    document.getElementById('gate').style.display = 'flex';
  })();
})();
