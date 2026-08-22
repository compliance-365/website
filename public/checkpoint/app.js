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
      var el;
      if (f.type === 'select') {
        el = document.createElement('select');
        (f.options || []).forEach(function (o) {
          var opt = document.createElement('option');
          var val = (o && typeof o === 'object') ? o.value : o;
          var lab = (o && typeof o === 'object') ? o.label : o;
          opt.value = val;
          opt.textContent = lab;
          if (String(val) === String(f.value)) opt.selected = true;
          el.appendChild(opt);
        });
      } else {
        el = document.createElement(f.type === 'textarea' ? 'textarea' : 'input');
        if (f.type && f.type !== 'textarea') el.type = f.type === 'email' ? 'email' : f.type;
        el.value = f.value || '';
        if (f.placeholder) el.placeholder = f.placeholder;
      }
      el.id = fieldId;
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
    var firstField = box.querySelector('input,textarea,select');
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
     normalizeEntitlementType()/tools/ISSUANCE.md). A live tenant's type
     comes straight from ENTITLEMENT_STATE.type once a signed activation
     verifies. 'partner' has no UI meaning in THIS bundle at all — the
     internal-only console that used to gate on it lives entirely in a
     separate entry point now (its own bundle, its own local-dev bypass);
     a real tenant whose activation happens to carry type:'partner' still
     just gets whatever frameworks[] that file grants, identically to
     'client'. Demo mode has no activation file at all, so it gets a
     SIMULATED type instead — 'client' by default, overridable via
     ?entType=demo purely to preview the trial banner (renderTrialBanner()
     below) without needing a real demo-type activation. Never applies to
     a real (live) tenant — a real client's UI is always driven by their
     own actual verified activation, never a URL parameter. */
  function simulatedEntitlementType() {
    var qp = new URLSearchParams(location.search).get('entType');
    if (qp === 'demo' || qp === 'client') return qp;
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
    },
    'labels': {
      risk: { title: 'Information is not classified or labelled, undermining handling rules and DLP controls that depend on it', cat: 'Data', L: 3, I: 3, controls: ['A.5.12', 'A.5.13'] },
      actions: [{ t: 'Publish a sensitivity label taxonomy in Microsoft Purview and roll it out tenant-wide', pr: 'Medium', days: 30, control: 'A.5.12' }]
    },
    'access-review': {
      risk: { title: 'Access rights are not reviewed at a planned interval, letting stale or excessive grants accumulate unnoticed', cat: 'Access', L: 3, I: 4, controls: ['A.5.18', 'A.8.2'] },
      actions: [{ t: 'Configure a recurring Entra Access Review for privileged roles and sensitive groups', pr: 'High', days: 21, control: 'A.5.18' }]
    },
    'sharing': {
      risk: { title: 'Tenant-wide SharePoint/OneDrive sharing allows anyone-with-a-link access with no sign-in required', cat: 'Data', L: 4, I: 4, controls: ['A.5.14', 'A.8.3'] },
      actions: [{ t: 'Restrict tenant external sharing to authenticated guests only (or disable, per risk appetite)', pr: 'High', days: 14, control: 'A.5.14' }]
    }
  };

  /* The keys of graph.js's CAPABILITY_PROBES, in display order — every
     site that lists capability areas (the Coverage card, the wizard's
     capability-check step, the report Methodology appendix) reads this
     one array rather than each keeping its own copy in sync by hand. */
  var CAPABILITY_KEYS = ['conditionalAccess', 'identityProtection', 'pim', 'intune', 'secureScore', 'sensitivityLabels', 'accessReviews', 'sharePointSettings'];

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
  /* Standalone pages (auditor pack, trust center) now carry the same
     client branding as engine-built reports: the classification marking
     top-right, the client logo (when set) above the h1, the validated
     brand accent on links/rules, and a generated-by footer line. All
     opts are optional — a caller that passes none gets exactly the old
     unbranded page. Fonts stay system-stack: these pages are saved to
     SharePoint and opened outside the app's origin, where the app's
     woff2 files aren't reachable. */
  function buildStandaloneHtml(opts) {
    var accent = /^#[0-9a-fA-F]{6}$/.test(opts.accent || '') ? opts.accent : '#A9812E';
    var classificationBand = opts.classification
      ? '<div style="display:flex;justify-content:flex-end;margin:0 0 18px"><span style="font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:#6b675e;border:1px solid rgba(11,11,12,.3);padding:4px 10px;border-radius:2px">' + esc(opts.classification) + '</span></div>'
      : '';
    var logoBand = (opts.logoUrl && /^data:image\//.test(opts.logoUrl))
      ? '<img src="' + esc(opts.logoUrl) + '" alt="" style="max-height:44px;max-width:180px;object-fit:contain;display:block;margin:0 0 16px">'
      : '';
    var brandFoot = opts.footerLine
      ? '<div class="tc-foot">' + esc(opts.footerLine) + '</div>'
      : '';
    return '<!DOCTYPE html><html><head><meta charset="utf-8"><title>' + opts.title + '</title><style>' +
      'body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;background:#FAF7F1;color:#0B0B0C;margin:0;padding:48px;max-width:820px;margin-left:auto;margin-right:auto;line-height:1.6;font-size:14px}' +
      'h1{font-size:30px;margin:0 0 6px;font-weight:700}' +
      'h2{font-size:19px;margin:32px 0 12px;font-weight:700;border-bottom:2px solid #0B0B0C;padding-bottom:8px}' +
      'p{color:#4b473e}a{color:' + accent + '}' +
      (opts.extraCss || '') +
      '</style></head><body>' + classificationBand + logoBand + opts.bodyHtml + brandFoot + '</body></html>';
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
  var SOA_CAT_LABELS = {
    /* SOC 2 Trust Services categories */
    CC: 'Common Criteria', A: 'Availability', C: 'Confidentiality', PI: 'Processing Integrity', P: 'Privacy',
    /* RFFR (ISM SoA) — the 7 program deeds plus the 22 ISM guideline
       groupings, so the SoA can be filtered one guideline at a time
       across ~1,000 controls (keys match the `cat` field the rffr
       content pack sets on each control). */
    deeds: 'RFFR Obligations', roles: 'Cyber security roles', incidents: 'Cyber security incidents',
    procurement: 'Procurement & outsourcing', documentation: 'Documentation', physical: 'Physical security',
    personnel: 'Personnel security', 'comms-infra': 'Communications infrastructure', 'comms-systems': 'Communications systems',
    mobility: 'Enterprise mobility', evaluated: 'Evaluated products', 'it-equipment': 'IT equipment',
    media: 'Media', hardening: 'System hardening', 'sys-mgmt': 'System management', assurance: 'Security assurance',
    'software-dev': 'Software development', database: 'Database systems', email: 'Email', networking: 'Networking',
    cryptography: 'Cryptography', gateways: 'Gateways', 'data-transfers': 'Data transfers', other: 'Other'
  };

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
    'approve', 'dismiss', 'complete', 'addActionUpdate', 'addManualAction', 'setActionEvidence',
    'editAction', 'deleteAction', 'recordCapa', 'editRisk', 'acceptRisk', 'addTreatmentAction',
    'closeRisk', 'reopenRisk', 'deleteRisk',
    'saveVendor', 'sendVendorQuestionnaire', 'markVendorReviewed', 'toggleVendorPublicListed',
    'saveAiSystem', 'advanceAiImpactStatus', 'addAiCandidate', 'dismissAiCandidate',
    'toggleApp', 'setSt', 'verifyControl', 'setControlEvidence', 'setControlJustification', 'applySharedEvidence',
    'toggleTrustCenterSetting', 'saveTrustCenterSettings', 'generateTrustCenter',
    'generateAuditorPack', 'uploadDocument', 'generateTemplate', 'approveTemplate', 'editDocumentMeta',
    'savePolicyContent', 'savePolicyContentAndRegenerate', 'revertPolicyContent',
    /* 'acknowledgeAttestation' is deliberately absent — see the note on
       that action: it is an employee's own act about themselves, and a
       read-only Viewer who cannot record it cannot comply with the
       policy they have just been sent. Launching and chasing campaigns
       IS a practitioner action, so those two are gated normally. */
    'launchCampaign', 'remindCampaign', 'assignTraining', 'remindTraining', 'assignInductionTraining',
    'emailStatusUpdate', 'addAudit', 'completeAudit', 'raiseAuditFinding', 'recordReview',
    'addIncident', 'updateIncidentDetails', 'recordIncidentAssessment', 'closeIncident',
    'addCalItem', 'completeCalItem', 'setRiskAppetite', 'setScanCadence',
    'toggleDigestEnabled', 'setDigestFrequency', 'saveDigestRecipients', 'sendDigestNow',
    'setDispTargetLevel', 'setNistDepth', 'setSoc2ReportType', 'setSoc2ObservationStart', 'setThreshold', 'toggleFeature', 'toggleLightTheme',
    'toggleEntitlement', 'acknowledgeAlert', 'runScan', 'runScanFromDash', 'setE8TargetLevel',
    'confirmE8Suggestion', 'dismissE8Suggestion', 'confirmIs18Suggestion', 'dismissIs18Suggestion',
    'confirmRffrSuggestion', 'dismissRffrSuggestion', 'confirmIso42001Suggestion', 'dismissIso42001Suggestion',
    'confirmIso27701Suggestion', 'dismissIso27701Suggestion',
    'confirmSoc2Suggestion', 'dismissSoc2Suggestion', 'confirmNistCsfSuggestion', 'dismissNistCsfSuggestion',
    'confirmIso27001Suggestion', 'dismissIso27001Suggestion',
    /* bulk equivalents of the per-row actions above — same writes, same
       gating, so a Viewer can't reach them either */
    'approveAllProposed', 'dismissAllProposed', 'confirmAllSuggestions', 'dismissAllSuggestions',
    'reset', 'rerunSetup',
    'setReportClassification', 'uploadClientLogo', 'clearClientLogo',
    'aiSaveConfig', 'addManualRisk',
    /* Linking an AI-interpreted artefact to a control is a real write to
       the register; interpreting one is not (it produces a draft in
       memory) but is gated too, since a Viewer has nothing to do with
       the result. */
    'aiInterpretEvidence', 'aiLinkInterpreted'
    /* 'report' itself is deliberately NOT in this set — generating a
       report is exactly the kind of thing a read-only Viewer (a board
       member, say) should still be able to do; the version-number
       increment/audit-log entry it writes are already best-effort
       (commitReportVersion() catches its own Store.setSetting failure),
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
    'toggleAddAction', 'toggleAddAudit', 'toggleAddReview', 'toggleAddCalItem', 'toggleAddIncident',
    'toggleAddVendor', 'toggleAddAiSystem', 'toggleAddRisk', 'toggleNewCampaign', 'toggleNewTraining'
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
  var _paletteReturnFocus = null;
  var _paletteKeyHandler = null;
  var _paletteResults = []; /* flat, index-addressable list matching the rendered rows, rebuilt on every renderPalette() call */
  var _paletteHi = -1;
  var _recentCommandIds = []; /* in-memory only — never localStorage, per spec; most-recent first, capped */
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
      header: ['ID', 'Title', 'Type', 'Risk', 'Control', 'Priority', 'Owner', 'Due', 'Status', 'Evidence note', 'Evidence URL'],
      rows: function () {
        /* Evidence note added alongside the URL that was already here —
           a flat export that carries only the link, not the note
           explaining what it shows, makes an auditor click through
           every row to get the context the app already has. */
        return S.actions.map(function (a) { return [a.id, a.title, a.type || 'Action', a.risk, a.control, a.pr, a.owner, a.due, a.status, a.evidence, a.evidenceUrl]; });
      }
    },
    {
      /* The chronological progress log itself — see store.js's
         ActionUpdates DEFS comment for why this is a real register and
         not a field on the action. This is the export an auditor asking
         "show me the history" actually wants: every dated entry, not
         just an action's current status. */
      key: 'actionUpdates', label: 'Action progress log', filename: 'action-updates.csv',
      header: ['ID', 'Action', 'Date', 'Note', 'Status at update', 'Evidence URL', 'Author'],
      rows: function () {
        return (S.actionUpdates || []).map(function (u) { return [u.id, u.action, u.date, u.note, u.status, u.evidenceUrl, u.author]; });
      }
    },
    {
      key: 'controls', label: 'Controls (SoA)', filename: 'controls.csv',
      header: ['Framework', 'Control ID', 'Title', 'Applicable', 'Status', 'Also satisfies', 'Owner', 'Verified date', 'Verified by', 'Evidence URL', 'Justification'],
      /* Unlike every other register above, this one is framework-scoped
         premium content (control titles, not just a client's own risk/
         action text), so it gets the one exception to "always reads
         straight from S, never filtered" in the comment above this
         array: rows for a framework the client isn't currently entitled
         to are excluded. Those rows don't disappear from S.controls just
         because a client downgrades (see the entitlement-filter comment
         in buildSearchIndex() above for why), so without this a
         downgraded or never-fully-licensed client could still export
         another module's full control set in one click. */
      rows: function () {
        return S.controls.filter(function (c) { return S.entitlements && S.entitlements[c.fw]; }).map(function (c) {
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
      key: 'incidents', label: 'Incidents', filename: 'incidents.csv',
      header: ['ID', 'Title', 'Category', 'Severity', 'Detected', 'Occurred', 'Status', 'Privacy breach', 'Assessment due', 'Assessment complete', 'Assessment note', 'Notified regulator', 'Notified individuals', 'Closed'],
      rows: function () {
        return (S.incidents || []).map(function (n) {
          return [n.id, n.title, n.category, n.severity, n.detected, n.occurred, n.status, n.isPrivacyBreach ? 'Yes' : 'No', n.assessmentDueDate, n.assessmentComplete ? 'Yes' : 'No', n.assessmentNote, n.notifiedRegulator ? 'Yes' : 'No', n.notifiedIndividuals ? 'Yes' : 'No', n.closedDate];
        });
      }
    },
    {
      key: 'reviews', label: 'Management reviews', filename: 'reviews.csv',
      header: ['ID', 'Date', 'Attendees', 'Next due', 'Inputs', 'Decisions'],
      rows: function () {
        return (S.reviews || []).map(function (r) { return [r.id, r.date, r.attendees, r.nextDue, reviewInputsToText(r.inputs), r.decisions]; });
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
      header: ['ID', 'Name', 'Service', 'Data categories', 'Criticality', 'Review status', 'Next review due', 'Certifications', 'Cert/report expiry', 'Owner', 'Questionnaire status'],
      rows: function () {
        return (S.vendors || []).map(function (v) {
          return [v.id, v.name, v.service, (v.dataCategories || []).join('; '), v.criticality, v.reviewStatus, v.nextReviewDue, v.certifications, v.certExpiryDate, v.owner, v.questionnaireStatus];
        });
      }
    },
    {
      /* Reads window._docs rather than S — the document library is
         fetched on demand (Store.listDocuments() is async and the other
         registers all come from the single Store.load()). Both export
         entry points refresh it first, so this is never exporting a
         stale or empty snapshot; see App.exportCsv/exportAllZip. */
      key: 'training', label: 'Training completions', filename: 'training-records.csv',
      header: ['Ref', 'Campaign', 'Person', 'Sign-in address', 'Course', 'Version', 'Assigned', 'Due', 'Completed', 'Score', 'Attempts', 'Status', 'Source'],
      rows: function () {
        return (S.training || []).map(function (t) {
          return [t.id, t.campaign, t.userName, t.upn, t.courseTitle, t.courseVersion, t.assigned, t.due, t.completed, t.score, t.attempts, t.status, t.source];
        });
      }
    },
    {
      key: 'attestations', label: 'Policy attestations', filename: 'policy-attestations.csv',
      header: ['Ref', 'Campaign', 'Person', 'Sign-in address', 'Policy', 'Version', 'Assigned', 'Acknowledged', 'Status'],
      rows: function () {
        return (S.attestations || []).map(function (r) {
          return [r.id, r.campaign, r.userName, r.upn, r.docName, r.docVersion, r.assigned, r.acknowledged, r.status];
        });
      }
    },
    {
      key: 'documents', label: 'Document control register', filename: 'document-register.csv',
      header: ['Document', 'Category', 'Owner', 'Version', 'Status', 'Approved by', 'Approval date', 'Next review', 'Review state', 'Classification', 'Frameworks', 'Last modified'],
      rows: function () {
        return (window._docs || []).map(function (d) {
          return [d.name, d.category, d.owner, d.version, docStatusOf(d), d.approvedBy, d.approvalDate,
            d.nextReview, docReviewState(d).state, d.classification, d.frameworks, d.modified];
        });
      }
    }
  ];

  /* The document register is the one export whose source isn't already
     in memory from Store.load(). Refresh it before exporting so a user
     who clicks "Export all" without ever opening Documents doesn't get
     a header-only document-register.csv that reads as "this client has
     no controlled documents". A failure here leaves whatever was
     already cached — an export shouldn't die because one Graph call
     blipped — and the CSV then honestly reflects that cache. */
  async function refreshDocsForExport(key) {
    if (key !== 'documents') return;
    try { window._docs = await Store.listDocuments(); } catch (e) { warn(e); }
  }

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

  /* Thin wrapper around lib.js's pure controlsForCheck() — same
     checkResult()/score() pattern as elsewhere in this file (see that
     comment above). The pure implementation and its test coverage
     (test/lib.test.mjs) are what actually matter; this just supplies
     S/window.CHECK_CONTROLS as context. See lib.js's own doc comment
     for what this function does and the entitlement-gating bug it once
     had — captureAutoEvidence() below is the only caller, and it was
     silently returning nothing for any tenant without iso27001 entitled
     (i.e. every standalone single-module self-serve purchase), not just
     for iso27001's own controls. */
  function controlsForCheck(checkId) {
    return window.CheckpointLib.controlsForCheck(checkId, { checkControls: window.CHECK_CONTROLS, controls: S.controls, entitlements: S.entitlements });
  }

  /* Every control across every ENTITLED framework that shares the same
     real-world evidence as `start` — the Shared evidence view's engine.
     Thin wrapper around lib.js's pure implementation (the traversal, its
     both-directions rationale and its test coverage all live there, see
     test/lib.test.mjs) — same checkResult()/score() pattern as
     elsewhere in this file; this just supplies S as context. */
  function sharedEvidenceClosure(start) {
    return window.CheckpointLib.sharedEvidenceClosure(start, { controls: S.controls, entitlements: S.entitlements });
  }

  /* Controls in OTHER entitled frameworks that are the same real-world
     control as `start` and haven't caught up with it — see lib.js's
     crossFrameworkStatusSuggestions() for the rules. */
  function crossFrameworkSuggestionsFor(start) {
    return window.CheckpointLib.crossFrameworkStatusSuggestions(start, { controls: S.controls, entitlements: S.entitlements });
  }

  /* Offers to carry a control's newly-recorded status across to the
     controls in OTHER entitled frameworks that are the same real-world
     control (lib.js's crossFrameworkStatusSuggestions decides which, and
     refuses to propose anything from a source that isn't Implemented
     WITH evidence). This is where the multi-framework promise on the
     SoA page — "cross-mapped to the others so shared evidence is never
     duplicated" — stops being only about evidence and starts applying
     to the work itself.

     Deliberately a prompt at the moment of the change rather than a
     silent write or another queue to visit later: the practitioner has
     the context in their head right now, and one dialog answering "you
     just did this for ISO 27001 — it's the same control in SOC 2 and
     Essential Eight, apply there too?" is the whole feature. Declining
     costs one click and nothing is written. Never fires for a Viewer,
     and never in the middle of a bulk operation (the callers that run
     in bulk don't call this). */
  async function offerCrossFrameworkPropagation(source) {
    if (READONLY) return 0;
    var proposals = crossFrameworkSuggestionsFor(source);
    if (!proposals.length) return 0;
    var byFw = {};
    proposals.forEach(function (p) { (byFw[p.fw] = byFw[p.fw] || []).push(p.code); });
    var summary = Object.keys(byFw).map(function (fw) { return fwName(fw) + ' ' + byFw[fw].join(', '); }).join(' · ');
    var ok = await showModal({
      title: 'Same control in ' + (Object.keys(byFw).length === 1 ? 'another framework' : Object.keys(byFw).length + ' other frameworks'),
      message: source.id + ' is cross-mapped to ' + proposals.length + ' control' + (proposals.length === 1 ? '' : 's') +
        ' you have bought that are behind it: ' + summary + '. They are the same real-world control, so the evidence you just recorded covers them too. Set them to ' + source.st + ' as well?',
      confirmText: 'Apply to ' + proposals.length,
      cancelText: 'Not now'
    });
    if (!ok) return 0;
    busy(true);
    var applied = 0;
    for (var i = 0; i < proposals.length; i++) {
      var p = proposals[i];
      var target = S.controls.find(function (x) { return x.fw === p.fw && x.id === p.code; });
      if (!target) continue;
      var prev = target.st;
      target.st = p.to;
      /* The evidence link travels with the status — that is the whole
         point of a shared control — but only onto a target with nothing
         of its own already attached. A practitioner's own link is never
         overwritten, same rule captureAutoEvidence() follows. */
      if (!target.evidenceUrl && source.evidenceUrl) target.evidenceUrl = source.evidenceUrl;
      try { await Store.updateControl(target); } catch (e) { warn(e); continue; }
      audit('Control status changed', 'Control', p.fw + '|' + p.code, prev, p.to + ' (cross-framework from ' + p.viaFw + '|' + p.viaCode + ', practitioner-confirmed)');
      applied++;
    }
    busy(false);
    if (applied) {
      log('<b>' + applied + '</b> cross-mapped control(s) set to ' + esc(source.st) + ' from <b>' + esc(source.id) + '</b> — same real-world control in ' + Object.keys(byFw).map(fwName).join(', ') + '.');
      toast('<b>' + applied + '</b> cross-mapped control' + (applied === 1 ? '' : 's') + ' updated');
    }
    renderSoa(); renderDash(); renderNavCounts();
    return applied;
  }

  /* Turns each Graph-backed check's raw signal (graph.js's
     runPostureChecks returns one per check id, see its own comment)
     into a dated, hashed evidence file in the Documents library, and
     refreshes every mapped control this check still owns the evidence
     for — either because nothing was ever linked, or because the last
     link is this same auto-capture from an earlier scan (never a
     control a practitioner has manually linked or verified; that stays
     exactly as they left it, forever). This is what lets an
     automated control's re-verification clock reset itself every scan
     — see controlReviewStatus() in lib.js — instead of a live Graph
     signal still going "overdue for review" 90 days after it last ran.
     Skips any id whose result this scan was 'manual' or absent: `raw`
     can carry a key for a check whose CAPABILITY turned out to be
     unavailable this run (the underlying Graph call was skipped, but
     the key was already assigned before that branch — see graph.js),
     and archiving "no real signal" as if it were dated evidence, or
     stamping a control "verified today" off the back of it, would be
     actively dishonest, not just unhelpful. Never blocks or fails the
     scan itself: every failure here is caught and logged, not
     surfaced to the user as a scan failure, same philosophy as
     audit()/log(). */
  async function captureAutoEvidence(raw, today) {
    if (!raw || Store.kind !== 'sharepoint') return;
    var ids = Object.keys(raw);
    for (var i = 0; i < ids.length; i++) {
      var id = ids[i];
      var result = S.lastResults ? S.lastResults[id] : undefined;
      if (!result || result === 'manual') continue;
      try {
        var def = window.CHECK_DEFS.find(function (c) { return c.id === id; });
        var content = {
          checkId: id,
          label: def ? def.label : id,
          generatedAt: new Date().toISOString(),
          result: result,
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
          if (c.evidenceUrl && c.verifiedBy !== AUTO_EVIDENCE_TAG) continue; /* a human's own link — never touched */
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

  /* Registers Checkpoint's OWN AI assistant feature (ai.js) as an entry
     in this tenant's AI Systems register — the round-2 AI governance
     module's register, same one iso42001 discovery above populates —
     the moment the 'ai' entitlement first turns on. A pre-drafted
     impact assessment is seeded (impactAssessmentStatus 'In progress',
     never 'Completed' — a human still has to actually review and
     confirm it, this is a starting point, not a finished assessment).
     Deduplicated by name, so re-toggling the entitlement off/on in
     demo mode (or reconciling entitlements on every load in a live
     tenant) never creates a second entry. */
  async function ensureAiSelfSystemSeeded() {
    if ((S.aiSystems || []).some(function (a) { return a.name === 'Checkpoint AI Assistant'; })) return;
    var maxA = (S.aiSystems || []).reduce(function (m, x) { var n = parseInt(String(x.id).replace(/\D/g, ''), 10) || 0; return Math.max(m, n); }, 0);
    var na = {
      id: 'AI-' + String(maxA + 1).padStart(3, '0'),
      name: 'Checkpoint AI Assistant',
      purpose: 'Drafting aid for compliance documentation (policy language, evidence descriptions, risk treatment notes, report/questionnaire commentary) grounded in this tenant\'s own compliance register data. Strictly text-in/text-out — no autonomous actions, no Graph access from within an AI call, and it never writes to any register itself.',
      owner: 'Compliance practitioner (this tenant)',
      riskTier: 'Limited',
      modelType: 'Azure OpenAI chat completion (client-configured deployment — see AI-SETUP.md)',
      vendor: 'This tenant\'s own Azure OpenAI resource (Microsoft Azure), never a Compliance365-hosted service',
      dataSources: 'This tenant\'s own compliance registers (scan results, Statement of Applicability, risks, actions, calendar, recent audits) — only the specific data a practitioner opts to include per request, never sent automatically or in bulk.',
      impactAssessmentStatus: 'In progress',
      humanOversight: 'Every response requires explicit practitioner review before anything derived from it is saved — drafts pre-fill the normal Add/Approve/Generate forms, nothing is ever auto-saved. Rate-limited to one request in flight at a time. Every call is audit-logged (who, feature, model deployment, when).',
      lastReviewed: '',
      spId: ''
    };
    try {
      await Store.addAiSystem(na);
      audit('AI system added', 'AISystem', na.id, '', na.name + ' — seeded automatically when the AI assistant entitlement was enabled; impact assessment pre-drafted, awaiting practitioner review.');
    } catch (e) { warn(e); }
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

    /* Returns the template keys to propose rather than pushing them onto
       S.proposed directly: runScan() rebuilds that list from scratch
       after this runs, so anything written to it here was thrown away
       before the practitioner ever saw it. */
    var proposedTpl = [];
    S.aiCandidates.forEach(function (c) {
      if (!c.highPrivilegeScopes.length) return;
      var tplKey = 'ai-risk-' + c.id;
      TPL[tplKey] = {
        risk: {
          title: 'High-privilege OAuth grant to AI application "' + c.name + '" not yet reviewed',
          cat: 'AI Governance', L: 3, I: 4, controls: ['AI.9.2', 'A.5.19']
        },
        actions: [{ t: 'Review and, if appropriate, revoke high-privilege consent for ' + c.name, pr: 'High', days: 21, control: 'AI.9.2' }]
      };
      if (S.handledTpl.indexOf(tplKey) === -1 && proposedTpl.indexOf(tplKey) === -1) proposedTpl.push(tplKey);
    });
    return proposedTpl;
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
  /* kind 'error' styles the toast as a failure and announces it
     assertively. Everything about a default toast reads as
     confirmation, so an error shown in that style is actively
     misleading — several failure paths in this app were doing exactly
     that. Errors also stay on screen roughly twice as long, because a
     message you need to act on should not disappear at the same speed
     as "saved". */
  function toast(msg, kind) {
    var t = document.getElementById('toast');
    var isErr = kind === 'error';
    t.innerHTML = msg;
    t.classList.toggle('err', isErr);
    t.setAttribute('aria-live', isErr ? 'assertive' : 'polite');
    t.setAttribute('role', isErr ? 'alert' : 'status');
    t.classList.add('show');
    clearTimeout(t._h);
    t._h = setTimeout(function () { t.classList.remove('show'); }, isErr ? 7000 : 3400);
  }
  function toastError(msg) { toast(msg, 'error'); }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
  /* AI response text is untrusted the exact same way any other dynamic
     string is — escaped FIRST via esc(), then given minimal paragraph/
     line-break structure (never markdown, never raw HTML) so a
     multi-paragraph draft doesn't render as one unbroken line. Every
     AI feature's rendered output goes through this, never esc() alone
     and never innerHTML with the raw model text. */
  function escAiText(s) { return '<p>' + esc(s).replace(/\n{2,}/g, '</p><p>').replace(/\n/g, '<br>') + '</p>'; }
  /* evidence links render as real <a href> — reject javascript: and other
     non-http(s) schemes so a pasted link can never become an XSS vector */
  function isSafeUrl(u) { return /^https?:\/\//i.test(u); }
  function fmtDate(d) { if (!d) return '—'; return new Date(d + 'T00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }); }
  function overdue(a) { return a.status !== 'Done' && a.due && a.due < new Date().toISOString().slice(0, 10); }

  /* ================= Design system: motion, icons, empty states =================
     A small shared toolkit the polish pass introduced — count-up numbers,
     staggered row reveal, skeleton placeholders, an inline-SVG icon set
     (replacing the old text glyphs — ⚑ ✓ ↗ ▲ ▼ ×), and empty-state
     illustrations. Every animation here checks prefersReducedMotion()
     itself (in addition to the CSS-side @media (prefers-reduced-motion)
     block, which can't stop a running rAF loop on its own) and jumps
     straight to the end state when it's set. */
  function prefersReducedMotion() {
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  /* Animates the leading text node of `el` from 0 to `target` over
     1.2s with an ease-out-cubic curve, preserving any child markup
     already inside `el` (the KPI tiles' trailing <small>%</small>/
     <small>/100</small>) untouched. Skipped entirely — jumps straight
     to the final value — when the target isn't a plain finite number
     (e.g. the posture-score tile's '—' when no scan has run yet) or
     the user prefers reduced motion. */
  function countUp(el, target) {
    var n = typeof target === 'number' ? target : parseFloat(target);
    if (!el || isNaN(n) || !isFinite(n)) return;
    var tail = '';
    for (var i = 0; i < el.childNodes.length; i++) {
      if (el.childNodes[i].nodeType === 1) tail += el.childNodes[i].outerHTML;
    }
    if (prefersReducedMotion()) { el.innerHTML = n + tail; return; }
    var start = null, duration = 1200;
    function frame(ts) {
      if (start === null) start = ts;
      var t = Math.min((ts - start) / duration, 1);
      var eased = 1 - Math.pow(1 - t, 3); /* ease-out cubic */
      el.innerHTML = Math.round(n * eased) + tail;
      if (t < 1) requestAnimationFrame(frame);
      else el.innerHTML = n + tail; /* exact final value — Math.round(n*1) can drift by ±1 on some curves */
    }
    requestAnimationFrame(frame);
  }
  /* Runs countUp() on every [data-count] element under `root` (or the
     whole document) — the KPI-tile-building templates set data-count to
     the raw numeric value alongside the already-formatted display text,
     so this never has to re-parse "45<small>/100</small>" back into a
     number itself. Call once right after the innerHTML that contains
     them is set. */
  function runCountUps(root) {
    (root || document).querySelectorAll('[data-count]').forEach(function (el) {
      countUp(el, el.getAttribute('data-count'));
      el.removeAttribute('data-count');
    });
  }

  /* Single reusable SVG tooltip — bound once per container (the
     Compliance Fingerprint and Certification Journey both call this on
     their own SVG root; a second call on the same container is a
     no-op, same one-time-bind pattern as setupConstellationInteractions()
     elsewhere in this file). Any element inside the container carrying
     a `data-tip` attribute gets a floating tooltip on hover AND
     keyboard focus (interaction.md's own rule: same details reachable
     without a mouse). The tip text is inserted via textContent, never
     innerHTML — report.js's chart functions already escSvgText() it
     before it ever reaches the attribute, and this is the second,
     independent layer of that same "never templated as markup"
     guarantee. */
  var _tipEl = null;
  function ensureTipEl() {
    if (_tipEl) return _tipEl;
    _tipEl = document.createElement('div');
    _tipEl.className = 'svg-tip';
    document.body.appendChild(_tipEl);
    return _tipEl;
  }
  function showTip(text, x, y) {
    var el = ensureTipEl();
    el.textContent = text;
    el.classList.add('on');
    positionTip(x, y);
  }
  function positionTip(x, y) {
    if (!_tipEl) return;
    var pad = 12;
    var rect = _tipEl.getBoundingClientRect();
    var left = Math.min(window.innerWidth - rect.width - pad, x + 14);
    var top = Math.max(pad, y - rect.height - 14);
    _tipEl.style.left = left + 'px';
    _tipEl.style.top = top + 'px';
  }
  function hideTip() {
    if (_tipEl) _tipEl.classList.remove('on');
  }
  var _tipBoundContainers = typeof WeakSet !== 'undefined' ? new WeakSet() : null;
  function initSvgTooltip(container) {
    if (!container || (_tipBoundContainers && _tipBoundContainers.has(container))) return;
    if (_tipBoundContainers) _tipBoundContainers.add(container);
    container.addEventListener('pointermove', function (e) {
      var el = e.target.closest('[data-tip]');
      if (el) showTip(el.getAttribute('data-tip'), e.clientX, e.clientY);
      else hideTip();
    });
    container.addEventListener('pointerleave', hideTip);
    container.addEventListener('focusin', function (e) {
      var el = e.target.closest('[data-tip]');
      if (!el) return;
      var r = el.getBoundingClientRect();
      showTip(el.getAttribute('data-tip'), r.left + r.width / 2, r.top);
    });
    container.addEventListener('focusout', hideTip);
  }

  /* Staggered entrance for a freshly-rendered <tbody> (or any container
     whose direct children are the "rows"): opacity+4px translateY, 30ms
     per row, the WHOLE stagger capped at 400ms regardless of row count
     (so a 200-row table doesn't take 6 seconds to finish revealing —
     rows beyond ~13 all land within the same last 400ms window rather
     than queuing further out). Skips straight to the shown state under
     reduced motion. Safe to call on an empty container. */
  function revealRows(container) {
    if (!container) return;
    var rows = container.children;
    if (!rows.length) return;
    if (prefersReducedMotion()) { for (var j = 0; j < rows.length; j++) rows[j].classList.remove('row-reveal'); return; }
    for (var i = 0; i < rows.length; i++) {
      rows[i].classList.add('row-reveal');
      rows[i].style.transitionDelay = Math.min(i * 30, 400) + 'ms';
    }
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        for (var k = 0; k < rows.length; k++) rows[k].classList.add('show');
      });
    });
  }

  /* Skeleton shimmer rows — used in place of a plain "Loading…" text
     row while an async list is still in flight (Documents, Partner
     Console sync, posture-scan checks). `cols` is the column count for
     a <table> skeleton; omit it for a non-table container (Partner
     Console's client cards etc.), which gets block skeletons instead. */
  function skeletonRows(n, cols) {
    var cells = [];
    for (var c = 0; c < cols; c++) cells.push('<td><div class="skeleton">&nbsp;</div></td>');
    var row = '<tr class="skeleton-row">' + cells.join('') + '</tr>';
    return new Array(n + 1).join(row);
  }
  function skeletonBlocks(n) {
    var out = '';
    for (var i = 0; i < n; i++) out += '<div class="skeleton" style="height:64px;margin-bottom:12px">&nbsp;</div>';
    return out;
  }

  /* Inline-SVG icon set — replaces the old literal text glyphs (⚑ ✓ ↗
     ▲ ▼ ×) with a consistent 14px-grid, 1.5px-stroke mark, matching the
     app's other hand-drawn line icons (the logo mark, empty-state
     illustrations below). Every icon is `currentColor`, so it always
     matches whatever text color it's dropped into — no separate color
     prop needed. Returns an inline <svg>; caller positions/sizes it
     with normal CSS (vertical-align, margin) same as they would any
     inline glyph. */
  var ICONS = {
    flag: '<path d="M3 13V2M3 2h7l-1.5 2.5L10 7H3" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>',
    check: '<path d="M2.5 7.5l3 3 6-6.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>',
    external: '<path d="M6 3H3.5A1.5 1.5 0 0 0 2 4.5v7A1.5 1.5 0 0 0 3.5 13h7a1.5 1.5 0 0 0 1.5-1.5V9M9 2h4v4M12.5 2.5L7 8" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>',
    up: '<path d="M2.5 9.5L7 4l4.5 5.5M7 4.5v9" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>',
    down: '<path d="M2.5 4.5L7 10l4.5-5.5M7 9.5v-9" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>',
    close: '<path d="M3 3l8 8M11 3l-8 8" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>'
  };
  function icon(name, opts) {
    opts = opts || {};
    var size = opts.size || 14;
    var cls = opts.cls ? ' class="' + opts.cls + '"' : '';
    var style = 'display:inline-block;vertical-align:-2px;flex:none' + (opts.style ? ';' + opts.style : '');
    return '<svg' + cls + ' width="' + size + '" height="' + size + '" viewBox="0 0 14 14" style="' + style + '" aria-hidden="true">' + (ICONS[name] || '') + '</svg>';
  }

  /* Empty-state illustration — single gold-accent line mark (one of a
     handful of small hand-drawn shapes, picked per view via `kind`) +
     one sentence + one CTA button, replacing the old plain "No risks
     yet…" text row. `cta` is {label, action, id} building a normal
     data-action button (or omitted for a genuinely non-actionable
     empty state). Returns markup meant to fill an entire <tbody> row
     (colspan) or a standalone card, per `asRow`/`colspan`. */
  var EMPTY_ILLUSTRATIONS = {
    /* a simple shield outline — risks/actions/audits/vendors: "nothing flagged yet" */
    shield: '<path d="M24 6l15 5v11c0 11-7 18-15 21-8-3-15-10-15-21V11z" fill="none" stroke="var(--gold)" stroke-width="1.5" stroke-linejoin="round"/><path d="M17 24l5 5 10-11" fill="none" stroke="var(--gold)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>',
    /* a document/page outline — documents, reviews: "nothing filed yet" */
    doc: '<path d="M14 5h13l7 7v25a2 2 0 0 1-2 2H14a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z" fill="none" stroke="var(--gold)" stroke-width="1.5" stroke-linejoin="round"/><path d="M27 5v7h7" fill="none" stroke="var(--gold)" stroke-width="1.5" stroke-linejoin="round"/><path d="M17 24h14M17 30h14M17 18h7" stroke="var(--gold)" stroke-width="1.5" stroke-linecap="round"/>',
    /* a simple calendar outline — calendar: "nothing scheduled yet" */
    calendar: '<rect x="8" y="10" width="32" height="28" rx="2" fill="none" stroke="var(--gold)" stroke-width="1.5"/><path d="M8 18h32M15 6v8M33 6v8" stroke="var(--gold)" stroke-width="1.5" stroke-linecap="round"/><circle cx="17" cy="26" r="1.6" fill="var(--gold)"/><circle cx="24" cy="26" r="1.6" fill="var(--gold)"/><circle cx="31" cy="26" r="1.6" fill="var(--gold)"/>',
    /* a small building outline — vendors/partner clients: "nobody added yet" */
    building: '<path d="M11 40V10l13-5 13 5v30" fill="none" stroke="var(--gold)" stroke-width="1.5" stroke-linejoin="round"/><path d="M18 40V22h12v18M18 16h.01M24 16h.01M30 16h.01M18 22h.01" stroke="var(--gold)" stroke-width="1.5" stroke-linecap="round"/><path d="M6 40h36" stroke="var(--gold)" stroke-width="1.5" stroke-linecap="round"/>'
  };
  function emptyState(opts) {
    var illo = EMPTY_ILLUSTRATIONS[opts.kind] || EMPTY_ILLUSTRATIONS.shield;
    var ctaHtml = opts.cta ? '<button class="btn sm" data-action="' + opts.cta.action + '"' + (opts.cta.id ? ' data-id="' + esc(opts.cta.id) + '"' : '') + ' style="margin-top:14px">' + esc(opts.cta.label) + '</button>' : '';
    var body = '<div style="text-align:center;padding:' + (opts.compact ? '18px 12px' : '34px 12px') + '"><svg width="48" height="48" viewBox="0 0 48 48" style="margin-bottom:10px" aria-hidden="true">' + illo + '</svg>' +
      '<p style="color:var(--paper-faint);font-size:var(--fs-2);max-width:42ch;margin:0 auto">' + esc(opts.text) + '</p>' + ctaHtml + '</div>';
    if (opts.asRow) return '<tr><td colspan="' + opts.colspan + '">' + body + '</td></tr>';
    return body;
  }

  /* Dynamic favicon — the same ring-and-dot mark as the static
     /assets/favicon.svg, redrawn on a <canvas> so the dot can turn red
     the moment this tenant has an open Critical residual risk, gold
     otherwise. A data: URI works here because the CSP's img-src
     already allows 'self' data: (see index.html's <meta> tag) —
     browsers apply that same directive to <link rel="icon">, so no CSP
     change was needed for this. Cheap enough (one ~64x64 canvas paint)
     to just call again on every renderDash(), the one render every
     risk-count-changing action already funnels through via renderAll(). */
  function updateFavicon() {
    var link = document.getElementById('faviconLink');
    if (!link || typeof document.createElement('canvas').getContext !== 'function') return;
    var hasCritical = (S.risks || []).some(function (r) {
      if (r.status === 'Closed') return false;
      var q = residual(r);
      return band(q.L * q.I) === 'Critical';
    });
    var c = document.createElement('canvas');
    c.width = 64; c.height = 64;
    var ctx = c.getContext('2d');
    ctx.fillStyle = '#0B0B0C';
    ctx.fillRect(0, 0, 64, 64);
    ctx.strokeStyle = '#FAF7F1';
    ctx.lineWidth = 7;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(32, 32, 20, -50 * Math.PI / 180, 230 * Math.PI / 180);
    ctx.stroke();
    ctx.fillStyle = hasCritical ? '#c97a7a' : '#A9812E';
    ctx.beginPath();
    ctx.arc(56, 32, 5.5, 0, Math.PI * 2);
    ctx.fill();
    try { link.href = c.toDataURL('image/png'); } catch (e) { /* canvas tainted or unsupported — static favicon stays as-is */ }
  }

  /* Opens a print-preview popup for any fully-built, self-contained HTML
     document (reports, and generated policy templates) — same sandboxed-
     iframe pattern either way: no allow-scripts, so no script the HTML
     might contain can ever run; the print button lives outside the frame,
     wired with addEventListener, so it works regardless. Returns the
     popup window, or null (after toasting) if the popup was blocked. */
  function printPreview(title, fullHtml) {
    var w = window.open('', '_blank');
    if (!w) { toastError('Popup blocked — allow pop-ups for this site to preview and print.'); return null; }
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
    if (!w) { toastError('Popup blocked — allow pop-ups for this site to preview and export.'); return null; }
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
    var keys = CAPABILITY_KEYS;
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
  /* Split peek/commit so a blocked popup doesn't burn a version
     number: the spec is built with the number the report WILL be, but
     nothing persists until reportPreview() actually opened a window.
     Document-control history stays gapless. */
  function peekReportVersion(type) {
    var key = 'reportVersion_' + type;
    return (parseInt((S.settings && S.settings[key]) || '0', 10) || 0) + 1;
  }
  async function commitReportVersion(type, version) {
    var key = 'reportVersion_' + type;
    S.settings[key] = String(version);
    try { await Store.setSetting(key, String(version)); } catch (e) { warn(e); }
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
  var ACTION_STATUS_LEGEND = [
    { label: 'Done', color: RPAL.good },
    { label: 'In progress', color: RPAL.warn },
    { label: 'Open', color: RPAL.neutral, hatch: true }
  ];

  /* Due-date runway — every open action bucketed by how far past (or
     short of) its due date it is. This is the panel that always carries
     signal: actionPriorityBreakdown() below compares composition, so it
     goes blank-looking the moment every action shares one status (a
     register where nothing has been started yet renders as identical
     full-width bars), whereas "what is blowing up, and when" is
     readable from the first action onward and is the thing a
     practitioner actually acts on.

     Done/Cancelled are excluded — neither is a live commitment. An
     action with no due date is its own bucket rather than being
     silently dropped or lumped in with "later": it's a real gap in the
     register (an auditor will ask when it's due), so it should be
     visible, not hidden. */
  function actionDueRunway() {
    var today = new Date().toISOString().slice(0, 10);
    var live = S.actions.filter(function (a) { return a.status !== 'Done' && a.status !== 'Cancelled'; });
    function daysUntilDue(a) {
      return Math.floor((new Date(a.due) - new Date(today)) / 86400000);
    }
    var noDue = live.filter(function (a) { return !a.due; }).length;
    var withDue = live.filter(function (a) { return a.due; });
    function countWhere(fn) { return withDue.filter(fn).length; }
    return [
      { label: 'Overdue 30+ days', value: countWhere(function (a) { return overdueDays(a) > 30; }), color: RPAL.bad, filter: 'Overdue' },
      { label: 'Overdue 8–30 days', value: countWhere(function (a) { var d = overdueDays(a); return d > 7 && d <= 30; }), color: RPAL.bad, filter: 'Overdue' },
      { label: 'Overdue up to 7 days', value: countWhere(function (a) { var d = overdueDays(a); return d >= 1 && d <= 7; }), color: RPAL.high, filter: 'Overdue' },
      { label: 'Due within 7 days', value: countWhere(function (a) { var d = daysUntilDue(a); return d >= 0 && d <= 7; }), color: RPAL.warn, filter: 'Open' },
      { label: 'Due in 8–30 days', value: countWhere(function (a) { var d = daysUntilDue(a); return d > 7 && d <= 30; }), color: RPAL.gold, filter: 'Open' },
      { label: 'Due beyond 30 days', value: countWhere(function (a) { return daysUntilDue(a) > 30; }), color: RPAL.good, filter: 'Open' },
      { label: 'No due date set', value: noDue, sub: 'an auditor will ask', color: RPAL.neutral, filter: 'Open' }
    ];
  }

  /* One stacked-bar row per priority (most urgent first) — reuses
     stackedBarsChart's existing generic primitive (see its own header
     comment: "the same primitive renders ... an action-throughput-by-
     month bar", already designed with exactly this in mind) rather than
     writing new chart geometry. The question this answers isn't "how
     many actions are open" (the Dashboard KPI already says that) but
     "are the actions that MATTER actually moving, or just piling up
     Open" — cancelled actions are excluded, same reasoning as excluding
     Closed risks from the heat-map: neither is a live position to plot. */
  function actionPriorityBreakdown() {
    return ['Critical', 'High', 'Medium', 'Low'].map(function (p) {
      var rows = S.actions.filter(function (a) { return a.pr === p && a.status !== 'Cancelled'; });
      var done = rows.filter(function (a) { return a.status === 'Done'; }).length;
      var inProgress = rows.filter(function (a) { return a.status === 'In progress'; }).length;
      var open = rows.filter(function (a) { return a.status === 'Open'; }).length;
      return { label: p, values: [done, inProgress, open] };
    });
  }

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
      var tableHtml = '<table class="rpt-table"><thead><tr><th>Control</th><th>Title</th><th>Applicable</th><th>Status</th><th>Also satisfies</th></tr></thead><tbody>' +
        fwControls.map(function (c) { return '<tr><td class="rpt-idc">' + esc(c.id) + '</td><td>' + esc(c.t) + (c.just ? '<div class="rpt-just">Exclusion justification: ' + esc(c.just) + '</div>' : '') + '</td><td>' + (c.app ? 'Yes' : 'No') + '</td><td>' + esc(c.st) + '</td><td>' + esc(c.map) + '</td></tr>'; }).join('') + '</tbody></table>';
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
      var tableHtml = '<table class="rpt-table"><thead><tr><th>ID</th><th>Risk</th><th>Category</th><th>Inherent</th><th>Residual</th><th>Treatment</th><th>Owner</th><th>Status</th></tr></thead><tbody>' +
        S.risks.map(function (r) { var q = residual(r); return '<tr><td class="rpt-idc">' + esc(r.id) + '</td><td>' + esc(r.title) + '</td><td>' + esc(r.cat) + '</td><td>' + (r.L * r.I) + ' — ' + band(r.L * r.I) + '</td><td><b>' + (q.L * q.I) + ' — ' + band(q.L * q.I) + '</b></td><td>' + esc(r.treat) + '</td><td>' + esc(r.owner) + '</td><td>' + esc(r.status) + '</td></tr>'; }).join('') + '</tbody></table>';
      var sevCounts = { Low: 0, Medium: 0, High: 0, Critical: 0 };
      openRisks.forEach(function (r) { var q = residual(r); sevCounts[band(q.L * q.I)]++; });

      /* Financial risk analysis — the same Monte Carlo engine the
         Financial risk analysis view uses (see renderQuantRisk()),
         re-run here rather than reading a cached result, so the report
         reflects whatever's open in the register right now. */
      var qrRisks = quantRiskOpenRisks();
      var financialHtml = '<p class="rpt-plain">No open risks to simulate.</p>';
      var lecChart = null;
      if (qrRisks.length) {
        var qrPortfolio = window.CheckpointLib.simulatePortfolioLosses(qrRisks, QUANT_RISK_TRIALS, Math.floor(Date.now() % 4294967296));
        var qrSummary = window.CheckpointLib.summarizeLossDistribution(qrPortfolio.portfolioTotals);
        var qrCurve = window.CheckpointLib.lossExceedanceCurve(qrPortfolio.portfolioTotals, 40);
        lecChart = RC.lossExceedance(qrCurve, {});
        var qrRanked = qrPortfolio.perRisk.map(function (pr, i) {
          return { id: pr.id, risk: qrRisks[i], summary: window.CheckpointLib.summarizeLossDistribution(pr.losses) };
        }).sort(function (a, b) { return b.summary.p90 - a.summary.p90; }).slice(0, 10);
        financialHtml = '<p class="rpt-intro">Illustrative Monte Carlo simulation (' + QUANT_RISK_TRIALS.toLocaleString() + ' trials) — an order-of-magnitude planning figure derived from each risk\'s residual likelihood/impact score, not a measured or actuarial one. Mean simulated annual loss: <b>' + fmtUsdCompact(qrSummary.mean) + '</b>; a 1-in-10 year (P90): <b>' + fmtUsdCompact(qrSummary.p90) + '</b>; a 1-in-100 year (P99): <b>' + fmtUsdCompact(qrSummary.p99) + '</b>.</p>' +
          '<table class="rpt-table"><thead><tr><th>ID</th><th>Risk</th><th>Mean annual loss</th><th>P90 annual loss</th></tr></thead><tbody>' +
          qrRanked.map(function (r) { return '<tr><td class="rpt-idc">' + esc(r.id) + '</td><td>' + esc(r.risk.title) + '</td><td>' + fmtUsdCompact(r.summary.mean) + '</td><td><b>' + fmtUsdCompact(r.summary.p90) + '</b></td></tr>'; }).join('') + '</tbody></table>';
      }

      var riskCharts = [
        { figure: 1, title: 'Residual risk heatmap', caption: openRisks.length + ' open risk(s) plotted by residual likelihood × impact.', svg: RC.riskHeatmap(openResidualPairs()) },
        { figure: 2, title: 'Severity distribution', caption: crit + ' risk(s) currently score High or Critical residual.', svg: RC.stackedBars([{ label: 'Open risks', values: [sevCounts.Low, sevCounts.Medium, sevCounts.High, sevCounts.Critical] }], SEVERITY_LEGEND) }
      ];
      if (lecChart) riskCharts.push({ figure: 3, title: 'Simulated annual loss — loss exceedance curve', caption: 'Monte Carlo simulation across all open risks; illustrative, not actuarial.', svg: lecChart });

      /* Movement since the last snapshot — reuses the same quarterly
         risk snapshot the Risk Landscape's trails draw from (each scan
         records every open risk's residual L/I; see runScan()). Only
         rendered when a comparable prior snapshot exists, so a
         first-ever report never shows an empty movement section. */
      var movementSection = null;
      var prevSnapScan = riskLandscapeTrailSnapshot();
      if (prevSnapScan && prevSnapScan.riskSnapshot && prevSnapScan.riskSnapshot.length) {
        var prevById = {};
        prevSnapScan.riskSnapshot.forEach(function (p) { prevById[p.id] = p; });
        var moved = [], newRisks = [], closedSince = [];
        openRisks.forEach(function (r) {
          var q = residual(r);
          var prev = prevById[r.id];
          if (!prev) { newRisks.push(r); return; }
          if (prev.L !== q.L || prev.I !== q.I) {
            moved.push({ r: r, from: prev.L * prev.I, to: q.L * q.I });
          }
        });
        prevSnapScan.riskSnapshot.forEach(function (p) {
          if (!S.risks.some(function (r) { return r.id === p.id && r.status !== 'Closed'; })) closedSince.push(p);
        });
        var movedHtml = moved.length
          ? '<table class="rpt-table"><thead><tr><th>ID</th><th>Risk</th><th>Then</th><th>Now</th><th>Direction</th></tr></thead><tbody>' +
            moved.sort(function (a, b) { return (b.to - b.from) - (a.to - a.from); }).map(function (m) {
              var dir = m.to > m.from ? '▲ Worsened' : '▼ Improved';
              return '<tr><td class="rpt-idc">' + esc(m.r.id) + '</td><td>' + esc(m.r.title) + '</td><td>' + m.from + ' — ' + band(m.from) + '</td><td><b>' + m.to + ' — ' + band(m.to) + '</b></td><td>' + dir + '</td></tr>';
            }).join('') + '</tbody></table>'
          : '<p class="rpt-intro">No open risk changed residual severity since the snapshot.</p>';
        var movementIntro = '<p class="rpt-intro">Compared against the posture scan of ' + fmtDate(prevSnapScan.date) + ': ' +
          moved.length + ' risk' + (moved.length === 1 ? '' : 's') + ' moved, ' +
          newRisks.length + ' new, ' + closedSince.length + ' closed since.</p>';
        movementSection = { heading: 'Movement since ' + fmtDate(prevSnapScan.date), html: movementIntro + movedHtml, pageBreak: false };
      }

      return {
        title: 'Risk Register Snapshot',
        /* The risk register spans every framework in scope — a
           framework pill on the cover ("ISO 27001") would misdescribe
           the document. */
        frameworkAgnostic: true,
        dashboard: {
          intro: S.risks.length + ' risks under management. Residual scores computed from completed treatment actions as at report date.',
          charts: riskCharts
        },
        sections: [
          { heading: 'Risk register', html: tableHtml, pageBreak: true }
        ].concat(movementSection ? [movementSection] : []).concat([
          { heading: 'Financial risk analysis (Monte Carlo)', html: financialHtml, pageBreak: true }
        ])
      };
    },

    /* Risk Treatment Plan (ISO 27001 6.1.3 e/f) — the artifact that ties
       each risk to its treatment decision, the controls and actions
       treating it, the residual score, and documented owner acceptance
       for anything left at Medium or above. Everything it needs became
       capturable once risk↔action links, treatment decisions and
       acceptance sign-off landed. */
    rtp: function () {
      var risks = S.risks.slice().sort(function (a, b) { var qa = residual(a), qb = residual(b); return (qb.L * qb.I) - (qa.L * qa.I); });
      var openRisks = risks.filter(function (r) { return r.status !== 'Closed'; });
      var treatCounts = { Mitigate: 0, Accept: 0, Transfer: 0, Avoid: 0 };
      openRisks.forEach(function (r) { if (treatCounts[r.treat] != null) treatCounts[r.treat]++; });
      /* A stale acceptance (its snapshotted score no longer matches
         today's residual) counts here alongside a never-accepted risk —
         the sign-off on file doesn't cover the current number in either
         case, so this callout must not go quiet just because SOME
         acceptance, however outdated, exists on the row. */
      var unaccepted = openRisks.filter(function (r) {
        var q = residual(r);
        if (band(q.L * q.I) === 'Low') return false;
        return !r.acceptedBy || window.CheckpointLib.residualAcceptanceStale(r, q.L * q.I);
      });
      var rows = risks.map(function (r) {
        var q = residual(r);
        var acts = (r.actions || []).map(function (id) { return S.actions.find(function (x) { return x.id === id; }); }).filter(Boolean);
        var actHtml = acts.length ? acts.map(function (a) { return a.id + ' — ' + esc(a.title) + ' <i>(' + a.status + (a.owner ? ', ' + esc(a.owner) : '') + (a.due ? ', due ' + fmtDate(a.due) : '') + ')</i>'; }).join('<br>') : '<i>None</i>';
        var ctlHtml = (r.controls || []).length ? esc(r.controls.join(', ')) : '<i>None linked</i>';
        /* A recorded acceptance whose snapshotted score no longer
           matches today's residual (the risk was re-scored, or a
           reopened treatment action pushed it back up) is flagged
           STALE rather than presented as current sign-off evidence —
           see residualAcceptanceStale()'s comment in lib.js. This is a
           document an auditor reads; an acceptance line that quietly
           covers a different, better number than the one on the same
           row is exactly the kind of inconsistency that gets a
           certification questioned. */
        var stale = window.CheckpointLib.residualAcceptanceStale(r, q.L * q.I);
        var accHtml = r.acceptedBy
          ? esc(r.acceptedBy) + (r.acceptedDate ? ' · ' + fmtDate(r.acceptedDate) : '') + (stale ? '<br><b style="color:#b91c1c">STALE — accepted at ' + r.acceptedScore + ', now ' + (q.L * q.I) + '</b>' : '')
          : (band(q.L * q.I) !== 'Low' && r.status !== 'Closed' ? '<b style="color:#b91c1c">Not accepted</b>' : '—');
        return '<tr><td class="rpt-idc">' + esc(r.id) + '</td><td>' + esc(r.title) + '<div class="rpt-just">' + esc(r.cat) + ' · ' + esc(r.status) + '</div></td><td>' + esc(r.treat) + '</td><td>' + ctlHtml + '</td><td>' + actHtml + '</td><td><b>' + (q.L * q.I) + ' — ' + band(q.L * q.I) + '</b></td><td>' + accHtml + '</td></tr>';
      }).join('');
      var tableHtml = '<table class="rpt-table"><tr><th>ID</th><th>Risk</th><th>Treatment</th><th>Controls</th><th>Treatment actions</th><th>Residual</th><th>Acceptance</th></tr>' + rows + '</table>';
      return {
        title: 'Risk Treatment Plan',
        dashboard: {
          intro: 'The risk treatment plan (ISO 27001 6.1.3 e/f): every risk, its treatment decision, the controls and actions treating it, its residual score, and — for anything left at Medium or above — documented risk-owner acceptance. ' +
            openRisks.length + ' open risk(s): ' + treatCounts.Mitigate + ' mitigate, ' + treatCounts.Accept + ' accept, ' + treatCounts.Transfer + ' transfer, ' + treatCounts.Avoid + ' avoid.' +
            (unaccepted.length ? ' ' + unaccepted.length + ' Medium+ residual risk(s) still lack documented acceptance.' : ' All Medium+ residual risks carry documented acceptance.'),
          charts: [
            { figure: 1, title: 'Residual risk heatmap', caption: openRisks.length + ' open risk(s) by residual likelihood × impact.', svg: RC.riskHeatmap(openResidualPairs()) }
          ]
        },
        sections: [
          { heading: 'Risk treatment plan', html: tableHtml, pageBreak: true }
        ].concat(unaccepted.length ? [{
          heading: 'Residual risks awaiting acceptance (' + unaccepted.length + ')',
          html: '<p class="rpt-plain">These residual risks sit at Medium or above with no CURRENT documented risk-owner acceptance on record — capture (or re-capture) acceptance in the risk drawer before the audit.</p><ul class="rpt-plain">' +
            unaccepted.map(function (r) {
              var q = residual(r);
              var stale = r.acceptedBy && window.CheckpointLib.residualAcceptanceStale(r, q.L * q.I);
              return '<li>' + r.id + ' — ' + esc(r.title) + ' (residual ' + (q.L * q.I) + ', ' + band(q.L * q.I) + ')' +
                (stale ? ' — <b>stale acceptance</b>: ' + esc(r.acceptedBy) + ' accepted at ' + r.acceptedScore : ' — owner: ' + esc(r.owner)) + '</li>';
            }).join('') + '</ul>',
          pageBreak: false
        }] : [])
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
        var themedHtml = '<table class="rpt-table"><thead><tr><th>Theme</th><th>Applicable</th><th>Implemented</th><th>%</th></tr></thead><tbody>' +
          THEMES.map(function (t) {
            var group = fwControls.filter(function (c) { return c.id.indexOf(t[0] + '.') === 0; });
            var gApp = group.filter(function (c) { return c.app; });
            var gImpl = gApp.filter(function (c) { return c.st === 'Implemented'; }).length;
            var gPct = gApp.length ? Math.round(gImpl / gApp.length * 100) : 0;
            return '<tr><td>' + t[1] + '</td><td>' + gApp.length + '</td><td>' + gImpl + '</td><td><b>' + gPct + '%</b></td></tr>';
          }).join('') + '</tbody></table>';
        sections.push({ heading: 'Control implementation by theme', html: themedHtml, pageBreak: true });
      }

      var gapsHtml = notImpl.length
        ? '<table class="rpt-table"><thead><tr><th>Control</th><th>Title</th><th>Status</th></tr></thead><tbody>' +
          notImpl.map(function (c) { return '<tr><td class="rpt-idc">' + esc(c.id) + '</td><td>' + esc(c.t) + '</td><td>' + c.st + '</td></tr>'; }).join('') + '</tbody></table>'
        : '<p class="rpt-intro">None — every applicable control is marked Implemented.</p>';
      sections.push({ heading: 'Open control gaps (' + notImpl.length + ')', html: gapsHtml, pageBreak: sections.length === 0 });

      /* the honesty gap: self-reported "Implemented" with no evidence
         on file is exactly what an auditor will challenge first */
      var unevidenced = app.filter(function (c) { return c.st === 'Implemented' && !c.evidenceUrl; });
      if (unevidenced.length) {
        var unevidencedHtml = '<p class="rpt-intro">Self-reported as Implemented, but no evidence document is linked. This is the first thing a certification auditor will test — attach evidence or downgrade the status before audit.</p><table class="rpt-table"><thead><tr><th>Control</th><th>Title</th></tr></thead><tbody>' +
          unevidenced.map(function (c) { return '<tr><td class="rpt-idc">' + esc(c.id) + '</td><td>' + esc(c.t) + '</td></tr>'; }).join('') + '</tbody></table>';
        sections.push({ heading: 'Implemented without linked evidence (' + unevidenced.length + ')', html: unevidencedHtml, pageBreak: false });
      }

      /* Per-check posture detail — the closest thing to a monitoring-
         test-results appendix: every posture check with its current
         Pass/Review/Fail/Manual outcome, so the auditor sees the
         technical signals behind the headline score, not just the
         score. Only rendered once at least one scan has run. */
      if (lastScan) {
        var CHECK_LABELS = { pass: 'Pass', review: 'Review', fail: 'Fail', manual: 'Manual' };
        var scanDetailHtml = '<p class="rpt-intro">Latest scan ' + fmtDate(lastScan.date) + ' — scored ' + lastScan.score + '/100. Pass/Review/Fail results come from live Microsoft Graph signals where tenant licensing allows; Manual marks checks assessed by the practitioner.</p>' +
          '<table class="rpt-table"><thead><tr><th>Check</th><th>Result</th></tr></thead><tbody>' +
          window.CHECK_DEFS.map(function (c) {
            var r = checkResult(c);
            return '<tr><td>' + esc(c.label) + '</td><td><b>' + esc(CHECK_LABELS[r] || r) + '</b></td></tr>';
          }).join('') + '</tbody></table>';
        sections.push({ heading: 'Posture scan detail', html: scanDetailHtml, pageBreak: true });
      }

      /* the staleness gap — evidence WAS linked at some point, but
         hasn't been re-confirmed within cadence. A posture-scan-backed
         control re-verifies itself every scan (captureAutoEvidence() in
         app.js), so what shows up here in practice is mostly the
         genuinely manual controls — which is the point: this section
         is where "manual review" stops being invisible and becomes a
         concrete, dated punch list. */
      var overdueForReview = app.filter(function (c) { return c.st === 'Implemented' && controlReviewStatus(c).due; });
      if (overdueForReview.length) {
        var overdueHtml = '<p class="rpt-intro">Self-reported as Implemented with evidence on file, but not re-verified within this tenant\'s review cadence (' + ((S.settings && S.settings.controlReviewCadenceDays) || 90) + ' days). A stale attestation reads the same as a false one to an auditor — re-verify or downgrade before audit.</p><table class="rpt-table"><tr><th>Control</th><th>Title</th><th>Last verified</th></tr>' +
          overdueForReview.map(function (c) { return '<tr><td class="rpt-idc">' + c.id + '</td><td>' + esc(c.t) + '</td><td>' + (c.verified ? fmtDate(c.verified) : 'Never') + '</td></tr>'; }).join('') + '</table>';
        sections.push({ heading: 'Overdue for re-verification (' + overdueForReview.length + ')', html: overdueHtml, pageBreak: false });
      }

      var topRisks = openRisks.slice().sort(function (a, b) { var qa = residual(a), qb = residual(b); return (qb.L * qb.I) - (qa.L * qa.I); }).slice(0, 5);
      var riskHtml = '<p class="rpt-intro">' + openRisks.length + ' risk(s) under active management' + (crit ? ', ' + crit + ' scoring High or Critical residual' : '') + '.</p>' +
        (topRisks.length ? '<table class="rpt-table"><thead><tr><th>ID</th><th>Risk</th><th>Residual</th><th>Owner</th><th>Status</th></tr></thead><tbody>' +
          topRisks.map(function (r) { var q = residual(r); return '<tr><td class="rpt-idc">' + esc(r.id) + '</td><td>' + esc(r.title) + '</td><td><b>' + (q.L * q.I) + ' — ' + band(q.L * q.I) + '</b></td><td>' + esc(r.owner) + '</td><td>' + esc(r.status) + '</td></tr>'; }).join('') + '</tbody></table>' : '');
      sections.push({ heading: 'Risk register position', html: riskHtml, pageBreak: false });

      var auditorAskHtml = '<ul class="rpt-plain">' +
        fwControls.filter(function (c) { return !c.app && c.just; }).map(function (c) {
          return '<li>Exclusion justification for ' + esc(c.id) + ' (' + esc(c.t) + ') — recorded: ' + esc(c.just) + '</li>';
        }).join('') +
        '<li>Evidence of management review — generate the Management Review Pack quarterly to satisfy this directly.</li>' +
        (activeFw === 'iso27001' ? '<li>Restore-test evidence for A.8.13 — ' + (S.actions.find(function (a) { return a.control === 'A.8.13' && a.status !== 'Done'; }) ? '⚠ open action outstanding' : '✓ no open actions') + '.</li>' : '') +
        '<li>Residual-risk acceptance sign-off for all risks scoring Medium+ after treatment.</li></ul>';
      sections.push({ heading: 'What the auditor will ask', html: auditorAskHtml, pageBreak: false });

      /* Nonconformities & corrective actions (Clause 10.1) — every NC
         with where its CAPA stands, so an auditor sees the corrective-
         action loop, not just that an NC was logged. */
      /* Actions carry a free-text `control` field (e.g. "A.8.5"), never
         a framework tag, so an NC raised against one framework's
         control cannot be reliably filtered out of another framework's
         report without risking silently DROPPING a real nonconformity
         over an ambiguous or shared code — worse than the problem this
         would fix. Instead of guessing, the heading says plainly that
         this table spans every entitled framework whenever there's more
         than one, same honesty the risk register report already applies
         to itself (its own frameworkAgnostic: true). */
      var allNcs = S.actions.filter(function (a) { return a.type && a.type.indexOf('Non-conformity') === 0; });
      var ncScopeNote = entitledFrameworks().length > 1 ? ' — all frameworks' : '';
      if (allNcs.length) {
        var ncTableHtml = '<table class="rpt-table"><tr><th>ID</th><th>Nonconformity</th><th>Type</th><th>Root cause</th><th>Status</th><th>Corrective action</th></tr>' +
          allNcs.map(function (a) { var st = window.CheckpointLib.capaStatus(a); return '<tr><td class="rpt-idc">' + esc(a.id) + '</td><td>' + esc(a.title) + '</td><td>' + esc(a.type.replace('Non-conformity ', 'NC ')) + '</td><td>' + esc(a.rootCause || '—') + '</td><td>' + esc(a.status) + '</td><td>' + (st.complete ? 'Closed out — effectiveness verified' : esc(st.nextStep)) + '</td></tr>'; }).join('') + '</table>';
        sections.push({ heading: 'Nonconformities & corrective actions (' + allNcs.length + ')' + ncScopeNote, html: ncTableHtml, pageBreak: false });
      }

      var openNCs = S.actions.filter(function (a) { return a.status !== 'Done' && a.type && a.type.indexOf('Non-conformity') === 0; });
      var capaOutstanding = allNcs.filter(function (a) { return !window.CheckpointLib.capaStatus(a).complete; }).length;
      var recs = [];
      if (notImpl.length) recs.push('Close the ' + notImpl.length + ' open control gap' + (notImpl.length > 1 ? 's' : '') + ' listed above before scheduling the certification audit.');
      if (unevidenced.length) recs.push('Attach evidence for the ' + unevidenced.length + ' control' + (unevidenced.length > 1 ? 's' : '') + ' marked Implemented without it — self-reported status alone will not satisfy an auditor.');
      if (openNCs.length) recs.push('Close out the ' + openNCs.length + ' open non-conformit' + (openNCs.length > 1 ? 'ies' : 'y') + ' in the Actions register before the next surveillance audit.');
      if (capaOutstanding) recs.push('Complete the corrective-action loop on ' + capaOutstanding + ' nonconformit' + (capaOutstanding > 1 ? 'ies' : 'y') + ' — root cause and verified effectiveness, not just a fix (Clause 10.1).');
      if (crit) recs.push('Treat the ' + crit + ' open High/Critical residual risk' + (crit > 1 ? 's' : '') + ' — auditors will ask for documented risk-acceptance sign-off on anything left at Medium or above.');
      if (od) recs.push('Clear the ' + od + ' overdue action' + (od > 1 ? 's' : '') + ' — auditors read overdue remediation as a control-effectiveness concern, not just a project-management one.');
      recs.push('Generate the Management Review Pack each quarter to keep the management-review requirement satisfied continuously, not assembled the week before audit.');
      sections.push({ heading: 'Recommendations', html: '<ul class="rpt-plain">' + recs.map(function (r) { return '<li>' + r + '</li>'; }).join('') + '</ul>', pageBreak: false });

      var readyStatusCounts = controlStatusCounts(fwControls);
      var readyEvidence = evidenceCoverageFor(fwControls);
      /* Compliance fingerprint — the exact window.ReportEngine.charts.
         fingerprint() SVG builder the Dashboard's live view uses,
         called here with the print palette (the default — no opts.palette
         override) instead of the dark app one, and interactive:false so
         no data-tip/data-count attributes are emitted into a static PDF. */
      var fpData = window.CheckpointLib.fingerprintFromRows(app.map(function (c) {
        return { theme: window.CheckpointLib.constellationTheme(activeFw, c.id), implemented: c.st === 'Implemented', evidenced: !!(c.evidenceUrl || c.verified) };
      }));
      return {
        title: 'Audit Readiness Report — ' + fwLabel,
        dashboard: {
          intro: '<b>' + readinessBand + '.</b> ' + pct + '% of ' + applicableCount + ' applicable ' + fwLabel + ' controls are implemented (' + impl + '/' + applicableCount + '). ' +
            crit + ' high/critical residual risk' + (crit === 1 ? '' : 's') + ' remain open, with ' + od + ' overdue action' + (od === 1 ? '' : 's') + ' against the remediation plan. Latest posture scan scored ' + (lastScan ? lastScan.score + '/100' : 'not yet run') + '.',
          /* 'ready' gets every chart function — the most detailed report
             type, matching its role as the pre-audit deep dive. */
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
            { figure: 6, title: 'Evidence coverage', caption: readyEvidence.total ? (Math.round((readyEvidence.autoCaptured + readyEvidence.manual) / readyEvidence.total * 100) + '% of implemented controls have linked evidence.') : 'No implemented controls yet.', svg: RC.evidenceGauge(readyEvidence) },
            { figure: 7, title: 'Compliance fingerprint', caption: fpData.total ? (fpData.centerPct + '% overall readiness across ' + fpData.rings.length + ' theme(s), ' + fpData.evidencePct + '% evidence-backed.') : 'No applicable controls yet.', svg: RC.fingerprint(fpData, {}) }
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
      /* The written summary a board actually reads before (or instead
         of) the charts — one paragraph, built from the same numbers the
         charts plot so it can never drift from them. */
      var execTopRisk = topRisks3[0];
      var execIntro = '<b>' + esc(clientDisplayLabel('This organisation')) + ' is ' + pctExec + '% of the way to ' + esc(fwLabel) + ' readiness</b> (' +
        app.filter(function (c) { return c.st === 'Implemented'; }).length + ' of ' + app.length + ' applicable controls implemented). ' +
        (lastSc
          ? 'The latest security posture scan scored <b>' + lastSc.score + '/100</b>' +
            (prevSc ? (lastSc.score > prevSc.score ? ', up from ' + prevSc.score + ' — posture is improving' : lastSc.score < prevSc.score ? ', down from ' + prevSc.score + ' — posture has slipped and the drivers are itemised below' : ', unchanged since the previous scan') : '') + '. '
          : 'No posture scan has been run yet — the first scan will baseline the technical posture behind these figures. ') +
        (critExec
          ? critExec + ' risk' + (critExec === 1 ? '' : 's') + ' currently sit' + (critExec === 1 ? 's' : '') + ' at High or Critical residual severity' +
            (execTopRisk ? ', led by “' + esc(execTopRisk.title) + '”' : '') + '. '
          : 'No open risks currently score High or Critical residual severity. ') +
        'The next milestone on the certification path is <b>' + esc(nextPhase) + '</b>.';
      return {
        title: 'Executive Summary — ' + fwLabel,
        dashboard: {
          intro: execIntro,
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
          { heading: 'Top risks', html: topRisks3.length ? ('<table class="rpt-table"><thead><tr><th>Risk</th><th>Residual</th><th>Owner</th></tr></thead><tbody>' +
            topRisks3.map(function (r) { var q = residual(r); return '<tr><td>' + esc(r.title) + '</td><td><b>' + band(q.L * q.I) + '</b></td><td>' + esc(r.owner) + '</td></tr>'; }).join('') + '</tbody></table>') : '<p class="rpt-intro">No open risks.</p>', pageBreak: false },
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
      var tableHtml = '<table class="rpt-table"><thead><tr><th>ID</th><th>Risk</th><th>Residual</th><th>Owner</th></tr></thead><tbody>' +
        S.risks.slice().sort(function (a, b) { var qa = residual(a), qb = residual(b); return (qb.L * qb.I) - (qa.L * qa.I); }).slice(0, 5).map(function (r) { var q = residual(r); return '<tr><td class="rpt-idc">' + esc(r.id) + '</td><td>' + esc(r.title) + '</td><td><b>' + (q.L * q.I) + ' — ' + band(q.L * q.I) + '</b></td><td>' + esc(r.owner) + '</td></tr>'; }).join('') + '</tbody></table>';
      var throughput = actionThroughputByMonth();
      /* Audit-ready projection drift — every scan that recorded a
         projection (see runScan()'s call to remediationVelocityProjection())
         becomes one point, so the board sees whether the projected date
         is moving closer (team accelerating) or drifting out (stalling),
         not just today's single number. */
      var projectionSeries = S.scans.filter(function (s) { return s.projection; }).map(function (s) {
        return { dateLabel: fmtDate(s.date), status: s.projection.status, weeksNeeded: s.projection.weeksNeeded };
      });
      var mgmtToday = new Date().toISOString().slice(0, 10);
      var mgmtPulse = window.CheckpointLib.weeklyActivityGrid(activityEventsFor(), 26, mgmtToday);
      /* Recommendations derived from the live registers — same
         data-driven approach the Audit Readiness Report already takes,
         never a canned list that could cite a control the client's
         framework doesn't even have. */
      var mgmtRecs = [];
      var mgmtOverdue = S.actions.filter(overdue).length;
      var mgmtNotImpl = app.length - impl;
      var mgmtOpenRisks = S.risks.filter(function (r) { return r.status !== 'Closed'; });
      var mgmtMediumPlus = mgmtOpenRisks.filter(function (r) { var q = residual(r); return (q.L * q.I) >= 5; }).length;
      var mgmtPrevScan = S.scans[S.scans.length - 2];
      if (mgmtOverdue) mgmtRecs.push('Clear the ' + mgmtOverdue + ' overdue action' + (mgmtOverdue > 1 ? 's' : '') + ' — sustained overdue remediation is the first thing the next surveillance audit will probe.');
      if (mgmtNotImpl) mgmtRecs.push('Agree owners and target dates for the ' + mgmtNotImpl + ' applicable control' + (mgmtNotImpl > 1 ? 's' : '') + ' not yet implemented, and minute those commitments as decisions of this review.');
      if (lastS && mgmtPrevScan && lastS.score < mgmtPrevScan.score) mgmtRecs.push('Posture score fell from ' + mgmtPrevScan.score + ' to ' + lastS.score + ' since the previous scan — review the failed checks in the Posture Scan view and assign corrective actions before the next cycle.');
      if (mgmtMediumPlus) mgmtRecs.push('Confirm executive risk-acceptance sign-off for the ' + mgmtMediumPlus + ' open risk' + (mgmtMediumPlus > 1 ? 's' : '') + ' still scoring Medium or above after treatment.');
      /* Same reasoning as the intro above: only ISO 27001 itself numbers
         this as "clause 9.3.2/9.3.3" — every other framework's pack
         still uses this app's one review-input model, just described
         without borrowing a clause number that isn't actually theirs. */
      if (!S.scans.length) mgmtRecs.push('Run the first security posture scan — this review currently has no technical posture input, which ' + (activeFw === 'iso27001' ? 'clause 9.3.2' : 'the review-input structure') + ' expects.');
      mgmtRecs.push('Record the decisions and actions arising from this review in the Management Review register so the ' + (activeFw === 'iso27001' ? 'clause 9.3.3 output trail' : 'review-output trail') + ' stays continuous.');

      /* Clause 9.3.2 review inputs — the latest recorded review's own
         structured inputs if one exists, otherwise the measurable ones
         computed live (so a pack generated before the first review still
         shows the real numbers, and says the rest are captured at the
         review). */
      var latestReview = (S.reviews || []).slice().sort(function (a, b) { return (b.date || '').localeCompare(a.date || ''); })[0];
      var mrParsed = latestReview ? window.CheckpointLib.parseReviewInputs(latestReview.inputs) : App.autoReviewInputs();
      var mrInputsHtml;
      if (mrParsed.legacy) {
        mrInputsHtml = '<p class="rpt-plain">' + esc(mrParsed.legacy) + '</p>';
      } else {
        mrInputsHtml = '<table class="rpt-table"><tr><th>Clause</th><th>Input</th><th>This review</th></tr>' +
          window.CheckpointLib.MR_INPUT_SECTIONS.map(function (s) {
            var val = mrParsed[s.key] || '';
            return '<tr><td class="rpt-idc">' + s.clause + '</td><td>' + esc(s.label) + '</td><td>' + (val ? esc(val) : (latestReview ? '<i>Not recorded</i>' : '<i>To be captured at the review</i>')) + '</td></tr>';
          }).join('') + '</table>' +
          (latestReview ? '<p class="rpt-plain" style="margin-top:6px">From ' + esc(latestReview.id) + ' (' + fmtDate(latestReview.date) + '). Attendees: ' + esc(latestReview.attendees) + '.</p>'
            : '<p class="rpt-plain" style="margin-top:6px">No management review recorded yet — the measurable inputs above are computed live; record a review to capture the full Clause 9.3.2 set.</p>');
      }

      /* Nonconformities & corrective actions (Clause 9.3.2 d / 10.1) —
         every NC with its root cause and where its CAPA stands. Same
         "cannot safely filter free-text control codes by framework"
         reasoning as the ready builder above — the heading states the
         scope instead of guessing at it. */
      var mgmtNcs = S.actions.filter(function (a) { return a.type && a.type.indexOf('Non-conformity') === 0; });
      var mgmtNcScopeNote = entitledFrameworks().length > 1 ? ' (all frameworks)' : '';
      var ncHtml = mgmtNcs.length
        ? '<table class="rpt-table"><tr><th>ID</th><th>Nonconformity</th><th>Type</th><th>Root cause</th><th>Status</th><th>Corrective action</th></tr>' +
          mgmtNcs.map(function (a) { var st = window.CheckpointLib.capaStatus(a); return '<tr><td class="rpt-idc">' + esc(a.id) + '</td><td>' + esc(a.title) + '</td><td>' + esc(a.type.replace('Non-conformity ', 'NC ')) + '</td><td>' + esc(a.rootCause || '—') + '</td><td>' + esc(a.status) + '</td><td>' + (st.complete ? 'Closed out — effectiveness verified' : esc(st.nextStep)) + '</td></tr>'; }).join('') + '</table>'
        : '<p class="rpt-plain">No nonconformities on record.</p>';

      return {
        title: 'Management Review Pack — ' + fwLabel + (activeFw === 'iso27001' ? ' Clause 9.3' : ''),
        dashboard: {
          /* This app captures every management review's inputs against
             ONE structure — ISO 27001 Clause 9.3.2's seven inputs —
             regardless of which framework a given review pack is
             scoped to; there is no separate SOC 2/NIST/etc review-input
             model. Said explicitly only for a non-ISO pack, where
             citing "clause 9.3.2" with no qualification would read as a
             (wrong) claim that the standard being audited has a clause
             9.3.2 of its own. */
          intro: 'Prepared for the quarterly management review.' +
            (activeFw === 'iso27001'
              ? ' Inputs per clause 9.3.2; minutes and decisions to be appended as the record of review.'
              : ' Inputs are captured using this app\'s ISO 27001 Clause 9.3.2-based review-input structure — the same structure every framework\'s management review is recorded against — regardless of the framework this pack is scoped to. Minutes and decisions to be appended as the record of review.'),
          /* trend + action-throughput bar + heatmap + projection drift +
             activity pulse — the inputs a management review actually
             works through: is posture trending the right way, is the
             team clearing its actions, where does residual risk still
             sit, is the audit-ready projection getting closer or
             drifting out, and has assurance work actually been
             happening week to week (not just on paper). */
          charts: [
            { figure: 1, title: 'Posture score trend', caption: lastS ? ('Latest scan: ' + lastS.score + '/100.') : 'No posture scans recorded yet.', svg: RC.trend(scanTrendData(), REPORT_TARGET_SCORE) },
            { figure: 2, title: 'Action throughput by month', caption: doneQ + ' of ' + S.actions.length + ' action(s) completed to date.', svg: RC.stackedBars(throughput, THROUGHPUT_LEGEND) },
            { figure: 3, title: 'Residual risk heatmap', caption: S.risks.filter(function (r) { return r.status !== 'Closed'; }).length + ' open risk(s) plotted by residual likelihood × impact.', svg: RC.riskHeatmap(openResidualPairs()) },
            { figure: 4, title: 'Audit-ready projection drift', caption: 'Weeks-to-ready as projected at each scan, at that scan\'s trailing 8-week remediation velocity.', svg: RC.projectionDrift(projectionSeries) },
            { figure: 5, title: 'Assurance pulse', caption: '26 weeks of scans, evidence, attestations, reviews and audits.', svg: RC.activityGrid(mgmtPulse, {}) }
          ]
        },
        sections: [
          { heading: 'Review inputs', html: mrInputsHtml, pageBreak: true },
          { heading: 'Nonconformities & corrective actions' + mgmtNcScopeNote, html: ncHtml, pageBreak: false },
          { heading: 'Top residual risks', html: tableHtml, pageBreak: true },
          { heading: 'Recommendations', html: '<ul class="rpt-plain">' + mgmtRecs.map(function (r) { return '<li>' + r + '</li>'; }).join('') + '</ul>', pageBreak: false }
        ]
      };
    },

    /* A lightweight, AI-assisted report type — no visual dashboard
       (dashboard: null; report.js's dashboardSection() just omits that
       page when falsy, see its own comment), just the Q&A table from
       the Questionnaire assistant's last run (_questionnaireResult —
       see that feature's own section above). Every export is
       explicitly marked AI-assisted right in the document, same
       "review before use" honesty as everything else this app
       generates with AI help. */
    questionnaire: function () {
      var rows = _questionnaireResult || [];
      var tableHtml = rows.length
        ? '<table class="rpt-table"><thead><tr><th>Question</th><th>Answer</th><th>Confidence</th><th>What to verify</th></tr></thead><tbody>' +
          rows.map(function (qa) { return '<tr><td>' + esc(qa.question) + '</td><td>' + esc(qa.answer) + '</td><td>' + esc(qa.confidence) + '</td><td>' + esc(qa.verify) + '</td></tr>'; }).join('') + '</tbody></table>'
        : '<p class="rpt-plain">No questionnaire has been run yet — use the Questionnaire assistant view, then export from there.</p>';
      return {
        title: 'Questionnaire Responses (AI-assisted draft)',
        frameworkAgnostic: true,
        dashboard: null,
        sections: [
          { heading: 'AI-assisted — review before use', html: '<p class="rpt-plain">Every answer below is an AI-generated draft grounded in this tenant\'s Statement of Applicability and latest scan. Review each answer, and anything listed under "What to verify", before sending this document externally.</p>', pageBreak: false },
          { heading: 'Responses', html: tableHtml, pageBreak: true }
        ]
      };
    },

    /* Evidence Request Simulator — a Prepared-By-Client-style evidence
       request list, framework-specific (unlike questionnaire above),
       so the report cover shows which framework it's for. Ready/Missing
       is exactly what evidenceRequestSimRun() already computed from the
       real register — this builder only renders it, never recomputes
       or re-asks anything. */
    evidencereq: function (activeFw, fwLabel) {
      var rows = _evidenceRequestResult || [];
      var readyCount = rows.filter(function (r) { return r.status === 'ready'; }).length;
      var tableHtml = rows.length
        ? '<table class="rpt-table"><thead><tr><th>Evidence requested</th><th>Related control</th><th>Status</th></tr></thead><tbody>' +
          rows.map(function (r) {
            var ctrl = (r.controlCode && r.controlCode !== 'General') ? esc(r.controlCode) + (r.controlTitle ? ' — ' + esc(r.controlTitle) : '') : 'General';
            return '<tr><td>' + esc(r.item) + '</td><td>' + ctrl + '</td><td>' + (r.status === 'ready' ? 'Ready' : 'Missing') + '</td></tr>';
          }).join('') + '</tbody></table>'
        : '<p class="rpt-plain">No evidence request list has been generated yet — use the Evidence request simulator view, then export from there.</p>';
      return {
        title: 'Evidence Request Simulator — ' + fwLabel + ' (AI-assisted draft)',
        dashboard: null,
        sections: [
          { heading: 'AI-assisted — review before use', html: '<p class="rpt-plain">This evidence request list is an AI-generated draft of what an external auditor would likely ask for, grounded in this tenant\'s own Statement of Applicability. Ready/Missing status is computed directly from this tenant\'s register data — an item marked Missing has no recorded evidence link or verification against its related control. Review before sharing this document externally.</p>', pageBreak: false },
          { heading: 'Evidence requests (' + readyCount + ' of ' + rows.length + ' ready)', html: tableHtml, pageBreak: true }
        ]
      };
    }
  };

  /* Renders a POLICY_TEMPLATES entry into a self-contained HTML document —
     same print-preview/PDF pattern and brand styling as App.report(), plus
     a DRAFT watermark until opts.approved is true. Deterministic given the
     same inputs, so App.approveTemplate() can call it again later with
     approved:true to produce a clean replacement of the same file. */
  /* The fields a practitioner can edit. Everything else about a
     generated document — its title, the controls it maps to, the
     frameworks it serves — stays owned by the shipped template, because
     those are what the SoA and the register key off and a hand-edited
     control code would silently break the mapping. */
  var EDITABLE_POLICY_FIELDS = ['purpose', 'scope', 'whyItMatters', 'inPractice',
    'policyStatements', 'roles', 'exceptions', 'nonCompliance', 'relatedDocuments', 'reviewCadence'];

  /* The content a document should actually be rendered from: the
     shipped template, with any saved edits for THIS document layered
     over it. Every render path goes through here, which is what makes
     an edit survive approval, a version bump, a re-brand, and a future
     improvement to the underlying template. */
  function effectivePolicyContent(t, docName) {
    var draft = docName && (S.policyDrafts || []).find(function (d) { return d.docName === docName; });
    if (!draft || !draft.content) return t;
    var merged = Object.assign({}, t);
    EDITABLE_POLICY_FIELDS.forEach(function (k) {
      if (draft.content[k] !== undefined) merged[k] = draft.content[k];
    });
    return merged;
  }

  function policyDraftFor(docName) {
    return (S.policyDrafts || []).find(function (d) { return d.docName === docName; }) || null;
  }

  function buildTemplateHtml(t, opts) {
    var fontBase = location.href.slice(0, location.href.lastIndexOf('/') + 1);
    /* The document leads with the CLIENT's own branding — it's their
       policy, not Compliance365's. When a client logo is set it sits in
       the masthead; otherwise the client's name stands in its place.
       Compliance365 stays as the tool attribution in the footer. The
       validated brand accent (falling back to the Checkpoint gold)
       colours the rule and section underlines, matching how report.js
       already brands generated reports. */
    var accent = /^#[0-9a-fA-F]{6}$/.test(opts.brandColor || '') ? opts.brandColor : '#A9812E';
    var accentRgb = [1, 3, 5].map(function (i) { return parseInt(accent.slice(i, i + 2), 16); }).join(',');
    /* Section icons — a small, self-contained set (not the live app's
       14px ICONS object, whose currentColor + var(--gold) strokes don't
       apply outside the app's own CSS, and whose handful of glyphs
       don't cover "roles", "review", "exceptions", etc. anyway). Same
       hand-drawn line-icon language as the rest of the product: 20x20
       grid, 1.4px stroke, currentColor so each one picks up whatever
       color its wrapping span sets — here always the brand accent, one
       consistent visual thread from the masthead rule through every
       section heading. Purely decorative wayfinding, not information on
       their own, so callers never rely on them meaning anything by
       themselves — the heading text still says what the section is. */
    var POLICY_ICONS = {
      forYou: '<path d="M10 3a5 5 0 0 0-3 9c.6.5 1 1.2 1 2v.5h4V14c0-.8.4-1.5 1-2a5 5 0 0 0-3-9z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><path d="M8.3 17h3.4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>',
      practice: '<rect x="3.5" y="3.5" width="13" height="13" rx="1.4" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M6.5 10l1.8 1.8L12 8" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>',
      purpose: '<circle cx="10" cy="10" r="7" fill="none" stroke="currentColor" stroke-width="1.4"/><circle cx="10" cy="10" r="3.2" fill="none" stroke="currentColor" stroke-width="1.4"/><circle cx="10" cy="10" r="0.9" fill="currentColor"/>',
      scope: '<path d="M4 7V4h3M13 4h3v3M16 13v3h-3M7 16H4v-3" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>',
      policy: '<path d="M10 3l6 2.2v4.6c0 4.4-2.6 7.2-6 8.4-3.4-1.2-6-4-6-8.4V5.2L10 3z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><path d="M7 10l2 2 4-4.4" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>',
      roles: '<circle cx="7" cy="7" r="2.6" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M2.5 16c0-2.8 2-4.6 4.5-4.6s4.5 1.8 4.5 4.6" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><circle cx="14.5" cy="6" r="2" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M12.6 11.7c.5-.2 1.1-.3 1.9-.3 2.1 0 3.8 1.5 3.8 3.9" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>',
      exceptions: '<path d="M5 18V3M5 3h9l-2 3.2L14 9.4H5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>',
      nonCompliance: '<path d="M10 3.5l8 13.5H2z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><path d="M10 8.5v4M10 15h.01" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>',
      related: '<path d="M6 3h6l3 3v10a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><path d="M12 3v3h3" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><path d="M7.5 12h5M7.5 15h5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>',
      review: '<rect x="3" y="4.5" width="14" height="12" rx="1.4" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M3 8.5h14M7 3v3M13 3v3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><circle cx="7.2" cy="12.2" r="0.8" fill="currentColor"/><circle cx="10" cy="12.2" r="0.8" fill="currentColor"/><circle cx="12.8" cy="12.2" r="0.8" fill="currentColor"/>',
      satisfies: '<path d="M8.5 11.5l3-3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><path d="M11 6.5l1.3-1.3a2.6 2.6 0 0 1 3.7 3.7L14.5 10.3" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><path d="M9 13.5l-1.3 1.3a2.6 2.6 0 0 1-3.7-3.7L5.5 9.7" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>',
      check: '<path d="M4 10.5l3.5 3.5L16 5.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>'
    };
    function secIcon(key) { return '<svg width="18" height="18" viewBox="0 0 20 20" aria-hidden="true">' + (POLICY_ICONS[key] || '') + '</svg>'; }
    function sectionHeading(key, label) { return '<h2><span class="sec-ico">' + secIcon(key) + '</span>' + esc(label) + '</h2>'; }
    var clientMark = (opts.logoUrl && /^data:image\//.test(opts.logoUrl))
      ? '<img src="' + esc(opts.logoUrl) + '" alt="' + esc(opts.clientLabel) + '" style="max-height:46px;max-width:210px;object-fit:contain;display:block">'
      : '<span class="clname">' + esc(opts.clientLabel) + '</span>';
    var head = '<div class="mast"><div class="lk">' + clientMark + '</div><div class="mr">Policy document · Generated ' + esc(opts.generatedDate) + '</div></div>';
    var watermarkHtml = opts.approved ? '' :
      '<div class="wm">DRAFT</div><div class="db">DRAFT — review and approve. Not yet confirmed by a practitioner as ready for use.</div>';
    /* A policy statement is either a plain string (the original shape,
       still produced by the AI tailoring path and stored in older
       audit-log entries) or { rule, because }. Normalising here rather
       than migrating every producer means a tailored draft and a
       rewritten template render through exactly the same code, and an
       old audit-log entry recovered at approval time still works. */
    var statementsHtml = '<div class="stmt-list">' + t.policyStatements.map(function (s, i) {
      var rule = typeof s === 'string' ? s : s.rule;
      var because = typeof s === 'string' ? '' : (s.because || '');
      return '<div class="stmt"><span class="stmt-n">' + (i + 1) + '</span><div class="stmt-body"><p class="stmt-rule">' + esc(rule) + '</p>' + (because ? '<p class="because">' + esc(because) + '</p>' : '') + '</div></div>';
    }).join('') + '</div>';

    /* The staff-facing half. Deliberately the only place in the
       document written in second person: the normative sections below
       stay declarative because an auditor tests them as assertions,
       and a policy whose rules say "you should try to" is unauditable.
       Two registers by design, kept visibly apart — which is what
       reads as professional rather than as inconsistent drafting.
       Every one of these sections is optional, so a template that has
       not been rewritten yet simply renders as it always did. */
    var readerHtml = '';
    if (t.whyItMatters) {
      readerHtml += sectionHeading('forYou', 'What this means for you') +
        '<div class="callout">' + t.whyItMatters.split('\n\n').map(function (p) { return '<p class="intro">' + esc(p) + '</p>'; }).join('') + '</div>';
    }
    if (t.inPractice && t.inPractice.length) {
      readerHtml += sectionHeading('practice', 'In practice') + '<ul class="prac">' +
        t.inPractice.map(function (p) { return '<li><span class="prac-ck">' + secIcon('check') + '</span>' + esc(p) + '</li>'; }).join('') + '</ul>';
    }

    /* The governance apparatus an auditor looks for and staff skip.
       Roles answer "who is accountable", which is the single most
       common thing missing from a small organisation's policy set;
       exceptions and non-compliance are what stop a policy being
       either quietly ignored or unenforceable. */
    var govHtml = '';
    if (t.roles && t.roles.length) {
      govHtml += sectionHeading('roles', 'Who is responsible') + '<table class="roles"><tbody>' +
        t.roles.map(function (r) { return '<tr><th>' + esc(r.role) + '</th><td>' + esc(r.responsibility) + '</td></tr>'; }).join('') +
        '</tbody></table>';
    }
    if (t.exceptions) govHtml += sectionHeading('exceptions', 'Exceptions') + '<p class="intro">' + esc(t.exceptions) + '</p>';
    if (t.nonCompliance) govHtml += sectionHeading('nonCompliance', 'If this policy is not followed') + '<p class="intro">' + esc(t.nonCompliance) + '</p>';
    if (t.relatedDocuments && t.relatedDocuments.length) {
      govHtml += sectionHeading('related', 'Related documents') + '<ul class="prac">' +
        t.relatedDocuments.map(function (d) { return '<li><span class="prac-dot"></span>' + esc(d) + '</li>'; }).join('') + '</ul>';
    }
    var aiNoteHtml = opts.aiAssisted ? '<p class="intro" style="font-style:italic">AI-assisted draft — the purpose/scope/policy text below was tailored with AI assistance from the standard template and reviewed by ' + esc(opts.aiReviewer || 'a practitioner') + ' before generation.</p>' : '';
    /* Document control block — ISO 27001 Clause 7.5.2 a)/b): a
       controlled document has to identify itself (title, date,
       version, author) on its own face, not just in a register
       somewhere else. Version and approver are passed in by the
       approval path so the printed document and the SharePoint
       register can never drift apart; a draft generated before
       approval simply shows the draft version and no approver. */
    var dctlRows = [
      ['Organisation', esc(opts.clientLabel)],
      ['Document owner', esc(opts.owner)],
      ['Version', esc(opts.version || (opts.approved ? '1.0' : '0.1'))],
      ['Status', opts.approved ? 'Approved' : 'Draft'],
      ['Approved by', opts.approved ? esc(opts.approvedBy || '—') : 'Not yet approved'],
      [opts.approved ? 'Approval date' : 'Generated', esc(opts.generatedDate)],
      /* fmtDocDate, not fmtDate: a review date is routinely a year or
         more out, and "25 July" on the face of a controlled document is
         ambiguous between this year and next. */
      ['Next review due', opts.reviewDate ? esc(fmtDocDate(opts.reviewDate)) : '—'],
      ['Classification', esc(opts.classification || 'Internal')]
    ];
    var body = '<table class="dctl"><tbody>' + dctlRows.map(function (r) {
      return '<tr><th>' + r[0] + '</th><td>' + r[1] + '</td></tr>';
    }).join('') + '</tbody></table>' +
      aiNoteHtml +
      /* Order is the whole design: the reader-facing sections come
         first so someone who stops a third of the way down has still
         read the part that changes their behaviour, and the governance
         apparatus sits after the rules where the people who need it
         will look for it. */
      readerHtml +
      sectionHeading('purpose', 'Purpose') + '<p class="intro">' + esc(t.purpose) + '</p>' +
      sectionHeading('scope', 'Scope') + '<p class="intro">' + esc(t.scope) + '</p>' +
      sectionHeading('policy', 'Policy') + statementsHtml +
      govHtml +
      sectionHeading('review', 'Review') + '<p class="intro">' + esc(t.reviewCadence) + '</p>' +
      (t.controls.length ? sectionHeading('satisfies', 'Helps satisfy') + '<div class="chips">' + t.controls.map(function (c) { return '<span class="chip-ctrl">' + esc(c) + '</span>'; }).join('') + '</div>' : '');
    return '<!DOCTYPE html><html><head><style>' +
      "@font-face{font-family:'Fraunces';font-style:normal;font-weight:400 500;src:url('" + fontBase + "fonts/fraunces.woff2') format('woff2')}" +
      "@font-face{font-family:'Manrope';font-style:normal;font-weight:300 800;src:url('" + fontBase + "fonts/manrope.woff2') format('woff2')}" +
      'body{font-family:Manrope,sans-serif;background:#FAF7F1;color:#0B0B0C;padding:48px;max-width:900px;margin:0 auto;font-size:13px;line-height:1.6}' +
      '.mast{display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #0B0B0C;padding-bottom:18px;margin-bottom:8px}' +
      '.lk{display:flex;align-items:center;gap:10px}.clname{font-family:Fraunces,serif;font-weight:500;font-size:22px;letter-spacing:.01em}' +
      '.mr{text-align:right;font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:#6b675e}' +
      'h1{font-family:Fraunces,serif;font-weight:500;font-size:30px;margin:26px 0 4px}' +
      'h2{font-family:Fraunces,serif;font-weight:500;font-size:19px;margin:30px 0 12px;display:flex;align-items:center;gap:9px}' +
      '.sec-ico{display:inline-flex;flex:none;color:' + accent + '}.sec-ico svg{display:block}' +
      '.gr{width:26px;height:1px;background:' + accent + ';margin:14px 0 18px}' +
      '.intro{color:#4b473e;max-width:70ch}' +
      /* The reader-facing "what this means for you" section gets its own
         tinted, left-bordered box — visually distinct from the
         declarative sections around it, the "two registers... kept
         visibly apart" the surrounding comment already describes, now
         carried through in the layout, not just the prose voice. */
      '.callout{background:rgba(' + accentRgb + ',.07);border-left:3px solid ' + accent + ';border-radius:0 6px 6px 0;padding:14px 18px;margin-top:10px}' +
      '.callout .intro{margin:0 0 8px}.callout .intro:last-child{margin-bottom:0}' +
      /* Each policy statement as its own card with a numbered badge,
         rather than a plain <ol> — the thing a reader actually scans
         for ("how many rules, which one applies to me") is easier to
         find as distinct blocks than as a wall of numbered sentences. */
      '.stmt-list{margin-top:14px}' +
      '.stmt{display:flex;gap:14px;padding:14px 16px;margin-bottom:10px;background:rgba(11,11,12,.02);border:1px solid rgba(11,11,12,.08);border-radius:6px}' +
      '.stmt-n{flex:none;width:22px;height:22px;border-radius:50%;background:' + accent + ';color:#fff;font-size:11px;font-weight:700;line-height:22px;text-align:center}' +
      '.stmt-body{flex:1;min-width:0}.stmt-rule{margin:0;font-weight:600}' +
      /* The reason attached to a rule is set apart rather than run into
         it, so the normative sentence still reads as the rule and the
         rationale reads as support for it — not as a qualification
         weakening it. */
      '.because{color:#6b675e;font-style:italic;margin-top:5px;max-width:70ch}' +
      'ul.prac{list-style:none;margin:10px 0 0;padding:0}' +
      'ul.prac li{display:flex;align-items:flex-start;gap:9px;margin-bottom:9px;max-width:78ch}' +
      '.prac-ck{flex:none;width:18px;height:18px;color:#3A7A3A;margin-top:1px}' +
      '.prac-dot{flex:none;width:6px;height:6px;border-radius:50%;background:' + accent + ';margin:6px 1px 0}' +
      '.chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}' +
      '.chip-ctrl{display:inline-block;padding:4px 11px;border-radius:20px;background:rgba(11,11,12,.05);border:1px solid rgba(11,11,12,.14);font-size:11px;font-weight:600;color:#4b473e;letter-spacing:.02em}' +
      '.roles{width:100%;border-collapse:collapse;margin:12px 0 0}' +
      '.roles th{text-align:left;width:210px;padding:8px 14px 8px 0;font-size:12px;font-weight:700;color:#0B0B0C;vertical-align:top}' +
      '.roles td{padding:8px 0;font-size:13px;color:#4b473e}' +
      '.roles tr+tr th,.roles tr+tr td{border-top:1px solid rgba(11,11,12,.09)}' +
      '.dctl{width:100%;border-collapse:collapse;margin:20px 0;border-top:1px solid rgba(11,11,12,.2);border-bottom:1px solid rgba(11,11,12,.2)}' +
      '.dctl th{text-align:left;width:170px;padding:7px 12px 7px 0;font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:#6b675e;font-weight:600;vertical-align:top}' +
      '.dctl td{padding:7px 0;font-size:13px;color:#0B0B0C}' +
      '.dctl tr+tr th,.dctl tr+tr td{border-top:1px solid rgba(11,11,12,.09)}' +
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
  /* The one client-identity resolver every human-facing surface (top
     bar, Boardroom title slide, report covers/headers) reads. The
     Settings override (clientDisplayName) wins over the raw tenant
     label because a consultancy's client artifacts should say "Acme
     Group Pty Ltd", not "acmegrp.onmicrosoft.com" — and #clientName's
     textContent is the already-resolved value, so surfaces that read
     the DOM (boardroom slides, report specs) pick the override up for
     free once bootUi()/renderers use this. */
  function clientDisplayLabel(fallback) {
    var override = (S.settings && (S.settings.clientDisplayName || '').trim()) || '';
    if (override) return override;
    var el = document.getElementById('clientName');
    return (el && el.textContent && el.textContent !== '—' ? el.textContent : '') || fallback || 'Connected tenant';
  }
  /* The validated client brand accent for reports — '' (Checkpoint
     gold) unless a plausible #rrggbb was saved. Validated here as well
     as on save so a hand-edited Settings list row can't inject CSS. */
  function clientBrandColor() {
    var c = (S.settings && S.settings.clientBrandColor) || '';
    return /^#[0-9a-fA-F]{6}$/.test(c) ? c : '';
  }
  /* Paints the top bar's client identity: display-name override (raw
     tenant label preserved in data-tenant/title so it's never lost),
     plus the client logo as a small mark beside the name when one is
     set. Called from bootUi() with the freshly-resolved tenant label,
     and again (no argument — reuses the stashed label) whenever the
     branding settings change, so a rename/logo upload reflects
     immediately without a reload. */
  function applyClientIdentity(rawLabel) {
    var el = document.getElementById('clientName');
    if (!el) return;
    if (rawLabel !== undefined) el.setAttribute('data-tenant', rawLabel || '');
    var tenant = el.getAttribute('data-tenant') || '';
    var override = (S.settings && (S.settings.clientDisplayName || '').trim()) || '';
    var shown = override || tenant || 'Connected tenant';
    el.textContent = shown;
    el.title = override && tenant && override !== tenant ? 'Tenant: ' + tenant : '';
    var logoUrl = (S.settings && S.settings.clientLogoUrl) || '';
    var mark = document.getElementById('clientLogoMark');
    if (logoUrl && /^data:image\//.test(logoUrl)) {
      if (!mark) {
        mark = document.createElement('img');
        mark.id = 'clientLogoMark';
        mark.alt = '';
        mark.style.cssText = 'max-height:18px;max-width:64px;object-fit:contain;vertical-align:middle;margin-right:8px;border-radius:2px';
        el.parentNode.insertBefore(mark, el);
      }
      mark.src = logoUrl;
    } else if (mark) {
      mark.remove();
    }
  }
  /* default to ON if a key isn't present yet (older tenants provisioned
     before this feature existed shouldn't have things silently vanish)  */
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
  /* The two candidate text colors pickReadableRgb() below chooses
     between for a heatmap cell — this app's own paper/ink hex, not
     bare #fff/#000, so heatmap text stays visually consistent with
     every other text color in the app. Theme-invariant on purpose:
     regardless of which theme is active, "near-white" and "near-black"
     are still the two right endpoints to pick between for an arbitrary
     saturated background — it's the currently-showing-through page
     background (themeInkRgb, read fresh per render) that varies. */
  var LIGHT_TEXT_RGB = [250, 247, 241], DARK_TEXT_RGB = [11, 11, 12];
  function currentThemeInkRgb() {
    return document.documentElement.getAttribute('data-theme') === 'light' ? [250, 247, 241] : [11, 11, 12];
  }
  function daysSince(dateStr) {
    if (!dateStr) return Infinity;
    return Math.floor((new Date(new Date().toISOString().slice(0, 10)) - new Date(dateStr)) / 86400000);
  }
  /* Thin wrapper over lib.js's pure controlReviewStatus() — supplies
     today's date and this tenant's own controlReviewCadenceDays
     setting (falls back to the lib function's own 90-day default when
     unset, same "old tenant, new setting key" tolerance every other
     threshold in this app already has). */
  function controlReviewStatus(c) {
    return window.CheckpointLib.controlReviewStatus(c, new Date().toISOString().slice(0, 10), S.settings && S.settings.controlReviewCadenceDays);
  }
  /* generic trend badge vs a previous snapshot. higherIsBetter flips which
     direction counts as "good" (green) — a rising posture score is good, a
     rising risk/overdue count is not. */
  function trendBadge(current, previous, higherIsBetter) {
    if (previous === undefined || previous === null || current === previous) return '';
    var up = current > previous;
    var good = higherIsBetter ? up : !up;
    return '<span class="trend" style="color:' + (good ? 'var(--pass)' : 'var(--fail)') + '">' + icon(up ? 'up' : 'down') + Math.abs(current - previous) + '</span>';
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
      toastError('<b>Audit log entry not recorded:</b> ' + esc(e.message || e));
    });
  }
  function warn(e) { console.error(e); toastError('<b>Sync issue:</b> ' + esc(e.message || e)); }

  /* ================= render ================= */
  function renderNavCounts() {
    document.getElementById('nRisks').textContent = S.risks.filter(function (r) { return r.status !== 'Closed'; }).length;
    document.getElementById('nActions').textContent = S.actions.filter(function (a) { return a.status !== 'Done'; }).length;
    var p = S.proposed.length; var el = document.getElementById('nScan');
    el.textContent = p || ''; el.style.display = p ? 'inline-block' : 'none';

    /* Scan-suggested SoA statuses, summed across every entitled
       framework. Every other register in this sidebar badges what is
       waiting; the SoA — where a single scan can leave twenty-plus
       decisions spread over eight framework tabs — badged nothing at
       all, so the app announced 12 proposed risks and stayed silent
       about the rest. */
    var sugg = totalPendingSuggestions();
    var sEl = document.getElementById('nSoa');
    if (sEl) { sEl.textContent = sugg || ''; sEl.style.display = sugg ? 'inline-block' : 'none'; }

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

    var incSummary = window.CheckpointLib.incidentRegisterSummary(S.incidents || [], new Date().toISOString().slice(0, 10));
    var iEl = document.getElementById('nIncidents');
    if (iEl) { iEl.textContent = incSummary.assessmentOverdue || ''; iEl.style.display = incSummary.assessmentOverdue ? 'inline-block' : 'none'; }

    var aiPending = (S.aiCandidates || []).length;
    var aiEl = document.getElementById('nAiSystems');
    if (aiEl) { aiEl.textContent = aiPending || ''; aiEl.style.display = aiPending ? 'inline-block' : 'none'; }

    /* The attestation badge counts what THIS signed-in person owes, not
       the tenant-wide outstanding total. Everyone who opens Checkpoint
       sees this nav item, most of them employees with one policy to
       read — a badge showing the whole organisation's backlog would be
       noise to them and would hide their own single outstanding item
       in a number they can't act on. The practitioner's tenant-wide
       view is the campaigns table inside. */
    var mine = myOutstandingAttestations().length;
    var atEl = document.getElementById('nAttest');
    if (atEl) { atEl.textContent = mine || ''; atEl.style.display = mine ? 'inline-block' : 'none'; }

    /* Same reasoning as the attestation badge: this counts what THIS
       person owes, not the organisation's backlog. */
    var mineT = myOutstandingTraining().length;
    var tEl = document.getElementById('nTraining');
    if (tEl) { tEl.textContent = mineT || ''; tEl.style.display = mineT ? 'inline-block' : 'none'; }

    /* A collapsed nav group hides its own badges — flag the group's
       summary instead so nothing overdue goes unnoticed just because
       its section happens to be closed. Every badge above already set
       its own visibility this same pass; this just checks what's
       currently showing, not a second data pass. */
    document.querySelectorAll('details.nav-group[data-group]').forEach(function (grp) {
      var alert = Array.prototype.some.call(grp.querySelectorAll('.nav-item .n'), function (badge) {
        return badge.style.display !== 'none' && badge.textContent.trim() !== '';
      });
      var summary = grp.querySelector(':scope > summary');
      if (summary) summary.classList.toggle('has-alert', alert);
    });
  }

  /* Two governance-card rows fed by data the dashboard doesn't own.

     The document register is fetched on demand (it lives in a
     SharePoint library, not the single Store.load()), so this renders
     "Loading…" rather than a confident "None" while that request is in
     flight — a governance card that says "0 overdue" before it has
     looked is worse than one that admits it doesn't know yet.
     loadDocumentRegisterInBackground() below re-renders once it lands. */
  function policyReviewKv() {
    if (!window._docs) {
      return '<div class="d-kv"><span>Policy reviews overdue</span><b style="color:var(--paper-faint)">Loading…</b></div>';
    }
    var s = docRegisterSummary(window._docs);
    var label = s.overdue
      ? s.overdue + ' ' + icon('flag') + ' — ' + s.overdueDocs.slice(0, 2).map(function (d) { return esc(d.name.replace(/\.[a-z]+$/i, '')); }).join(', ') + (s.overdue > 2 ? ' +' + (s.overdue - 2) + ' more' : '')
      : s.due ? s.due + ' due within ' + window.DOC_REVIEW_WARN_DAYS + ' days' : 'None';
    return '<div class="d-kv"><span>Policy reviews overdue</span><b style="' + (s.overdue ? 'color:var(--fail)' : s.due ? 'color:var(--warn)' : '') + '">' + label + '</b></div>';
  }

  function incidentKv() {
    var s = window.CheckpointLib.incidentRegisterSummary(S.incidents || [], new Date().toISOString().slice(0, 10));
    if (!s.total) return '<div class="d-kv"><span>Incident privacy assessments</span><b>No incidents logged</b></div>';
    if (!s.privacyBreaches) return '<div class="d-kv"><span>Incident privacy assessments</span><b>No privacy breaches logged</b></div>';
    var label = s.assessmentOverdue
      ? s.assessmentOverdue + ' ' + icon('flag') + ' overdue — ' + s.overdueList.slice(0, 2).map(function (n) { return esc(n.id); }).join(', ') + (s.overdueList.length > 2 ? ' +' + (s.overdueList.length - 2) + ' more' : '')
      : s.assessmentDue ? s.assessmentDue + ' due within 7 days' : 'All up to date';
    return '<div class="d-kv"><span>Incident privacy assessments</span><b style="' + (s.assessmentOverdue ? 'color:var(--fail)' : s.assessmentDue ? 'color:var(--warn)' : '') + '">' + label + '</b></div>';
  }

  function attestationKv() {
    var campaigns = window.CheckpointLib.attestationCampaigns(S.attestations || []);
    var open = campaigns.filter(function (c) { return !c.complete; });
    if (!campaigns.length) return '<div class="d-kv"><span>Policy attestation</span><b>No campaigns run</b></div>';
    var outstanding = open.reduce(function (n, c) { return n + c.outstanding; }, 0);
    return '<div class="d-kv"><span>Policy attestation</span><b style="' + (outstanding ? 'color:var(--warn)' : '') + '">' +
      (outstanding
        ? outstanding + ' acknowledgement' + (outstanding === 1 ? '' : 's') + ' outstanding across ' + open.length + ' campaign' + (open.length === 1 ? '' : 's')
        : 'All ' + campaigns.length + ' campaign' + (campaigns.length === 1 ? '' : 's') + ' complete') + '</b></div>';
  }

  /* The document register is the one dataset the dashboard needs that
     isn't already in memory after Store.load(). Fetched once per
     session, without blocking the first paint, then the dashboard and
     the nav counts are refreshed. A failure is logged and left alone:
     the governance row stays on "Loading…" rather than asserting a
     number it doesn't have, and opening Documents retries anyway. */
  function loadDocumentRegisterInBackground() {
    if (window._docs) return;
    Store.listDocuments().then(function (docs) {
      window._docs = docs;
      renderDash();
    }).catch(function (e) { console.error(e); });
  }

  /* "Getting started" — a Dashboard checklist for a brand-new tenant,
     entirely derived from real register state, the same way every
     empty-state and KPI tile in this app already is. Deliberately NOT
     a dismissible flag stored anywhere: there is nothing to dismiss —
     each step's own done/not-done state already lives in S (SharePoint,
     shared by every practitioner), so the card just stops rendering
     once every step is genuinely true, and would come back if a
     restored backup ever made one false again. That also means it's
     naturally consistent across sessions and practitioners with zero
     new storage, unlike a per-browser dismiss (e.g. the trial banner).
     window._docs may not be loaded yet on a cold Dashboard render
     (loadDocumentRegisterInBackground() is async) — the document step
     just reads as not-done until it arrives, then this re-renders. */
  function gettingStartedSteps() {
    var entitled = entitledFrameworks();
    var anyControlImplemented = entitled.some(function (fw) {
      return frameworkAppRows(fw).some(function (c) { return c.st === 'Implemented'; });
    });
    var anyDocApproved = (window._docs || []).some(function (d) { return docStatusOf(d) === 'Approved'; });
    var steps = [
      { label: 'Run your first posture scan', why: 'Everything else in Checkpoint is measured against this — controls, risks and readiness all start from a scan.', done: (S.scans || []).length > 0, view: 'scan', cta: 'Run a scan' },
      { label: 'Add or approve your first risk', why: 'Scan findings propose risks for review — approve one, or add your own, to start the register.', done: (S.risks || []).length > 0, view: 'risks', cta: 'Open Risk register' },
      { label: 'Mark your first control Implemented', why: 'The Statement of Applicability is what a certification audit is actually assessed against.', done: anyControlImplemented, view: 'soa', cta: 'Open Statement of Applicability' },
      { label: 'Approve your first policy document', why: 'A controlled document needs an owner and an approval before it counts as evidence.', done: anyDocApproved, view: 'documents', cta: 'Open Documents' }
    ];
    if (S.entitlements && S.entitlements.ai) {
      steps.push({ label: 'Configure the AI assistant', why: 'Point Checkpoint at your own Azure OpenAI resource to unlock drafting help across the app.', done: !!(S.settings && S.settings.aiEnabled === 'true'), view: 'aiassistant', cta: 'Open AI assistant' });
    }
    return steps;
  }

  function renderGettingStarted() {
    var el = document.getElementById('gettingStartedCard');
    if (!el) return;
    var steps = gettingStartedSteps();
    var doneCount = steps.filter(function (s) { return s.done; }).length;
    if (doneCount === steps.length) { el.style.display = 'none'; return; }
    el.style.display = '';
    var firstPending = steps.findIndex(function (s) { return !s.done; });
    var stepperHtml = '<div class="gs-stepper">' +
      steps.map(function (s, i) {
        var state = s.done ? 'done' : (i === firstPending ? 'current' : 'pending');
        var node = '<div class="gs-node ' + state + '"><span class="gs-node-ic">' + (s.done ? icon('check') : (i + 1)) + '</span><span class="gs-node-label">' + esc(s.label) + '</span></div>';
        if (i === steps.length - 1) return node;
        var connCls = (s.done ? 'done' : '') + (i === firstPending - 1 ? ' active' : '');
        return node + '<span class="gs-conn ' + connCls + '"><i></i></span>';
      }).join('') +
      '</div>';
    el.innerHTML = '<h3>Getting started</h3>' +
      '<p style="color:var(--paper-dim);font-size:12.5px;margin:2px 0 14px">' + doneCount + ' of ' + steps.length + ' steps done — this disappears once every step below is complete.</p>' +
      stepperHtml +
      steps.map(function (s) {
        return '<div class="gs-row' + (s.done ? ' done' : '') + '">' +
          '<span class="gs-check">' + (s.done ? icon('check') : '') + '</span>' +
          '<div class="gs-text"><b>' + esc(s.label) + '</b><span>' + esc(s.why) + '</span></div>' +
          (s.done ? '' : '<button class="btn ghost sm" data-action="App.go" data-id="' + s.view + '">' + esc(s.cta) + '</button>') +
          '</div>';
      }).join('');
  }

  /* Residual-risk 5×5 heat-map — extracted from renderDash() so the same
     dark-mode-aware rendering (pickReadableRgb() picking real, AA-contrast
     text per cell rather than a single hardcoded color — see this
     function's own header comment further down for why) can also drive a
     compact copy on the Risk register itself, not just the Dashboard.
     Parameterized by target element ids so two independent copies can
     exist in the DOM at once without colliding. No-ops harmlessly if
     either id isn't present on the current view. */
  /* Every cell is clickable (App.filterRiskByCell, wired via the generic
     [data-action] delegation — nothing extra to bind here) regardless of
     which copy is on screen: the Dashboard's and the Risk register's own
     heatmap share this exact function, so a click on either one drills
     into the SAME filtered Risk register table. window._riskCellFilter
     (read here only to render the active cell's outline — renderRisks()
     owns applying it to the actual row filter) keeps both copies in
     visual sync with whichever cell is currently selected. */
  function renderResidualHeatmapInto(heatId, legendId) {
    var heatEl = document.getElementById(heatId);
    if (!heatEl) return;
    var active = window._riskCellFilter;
    var counts = {};
    S.risks.forEach(function (r) { if (r.status === 'Closed') return; var q = residual(r); var k = q.L + '-' + q.I; counts[k] = (counts[k] || 0) + 1; });
    var themeInkRgb = currentThemeInkRgb();
    var h = '<div class="lab"></div>';
    for (var L = 1; L <= 5; L++) h += '<div class="lab">L' + L + '</div>';
    for (var I = 5; I >= 1; I--) {
      h += '<div class="lab">I' + I + '</div>';
      for (var L2 = 1; L2 <= 5; L2++) {
        var n = counts[L2 + '-' + I] || 0;
        var sev = band(L2 * I);
        var rgb = SEV_RGB[sev];
        var alpha = n === 0 ? 0.12 : n === 1 ? 0.42 : n === 2 ? 0.62 : 0.82;
        var textColor;
        if (n === 0) {
          textColor = 'var(--paper-faint)';
        } else {
          var sevRgb = rgb.split(',').map(Number);
          var cellRgb = window.CheckpointLib.compositeOverBg(sevRgb, alpha, themeInkRgb);
          textColor = 'rgb(' + window.CheckpointLib.pickReadableRgb(cellRgb, LIGHT_TEXT_RGB, DARK_TEXT_RGB).join(',') + ')';
        }
        var isActive = active && active.L === L2 && active.I === I;
        h += '<button type="button" class="cell' + (isActive ? ' on' : '') + '" data-action="App.filterRiskByCell" data-id="' + L2 + '-' + I + '" style="background:rgba(' + rgb + ',' + alpha + ');color:' + textColor + '" title="Likelihood ' + L2 + ' × Impact ' + I + ' — ' + sev + (n ? ' — ' + n + ' risk' + (n > 1 ? 's' : '') : '') + ' — click to filter the risk register" aria-pressed="' + (isActive ? 'true' : 'false') + '">' + (n || '') + '</button>';
      }
    }
    heatEl.innerHTML = h;
    var legendEl = document.getElementById(legendId);
    if (legendEl) {
      legendEl.innerHTML = ['Low', 'Medium', 'High', 'Critical'].map(function (sev) {
        return '<span><i style="background:rgba(' + SEV_RGB[sev] + ',.75)"></i>' + sev + '</span>';
      }).join('');
    }
  }

  function renderDash() {
    renderGettingStarted();
    var openActs = S.actions.filter(function (a) { return a.status !== 'Done'; });
    var odActs = S.actions.filter(function (a) { return overdueDays(a) > 0; });
    var b1 = odActs.filter(function (a) { return overdueDays(a) <= 7; }).length;
    var b2 = odActs.filter(function (a) { var d = overdueDays(a); return d > 7 && d <= 30; }).length;
    var b3 = odActs.filter(function (a) { return overdueDays(a) > 30; }).length;
    var od = odActs.length;
    var crit = S.risks.filter(function (r) { if (r.status === 'Closed') return false; var q = residual(r); return band(q.L * q.I) === 'Critical' || band(q.L * q.I) === 'High'; }).length;
    var last = S.scans[S.scans.length - 1];
    var prevScan = S.scans[S.scans.length - 2];

    /* Overdue for review — every entitled framework's Implemented
       controls, live-computed on every render (not scan-snapshotted
       like the tiles above, since it depends on the clock as much as
       the last scan's data — a control can go overdue on a day nobody
       runs a scan at all). See controlReviewStatus() in lib.js. */
    var overdueControls = entitledFrameworks().reduce(function (sum, fw) {
      return sum + frameworkAppRows(fw).filter(function (c) { return controlReviewStatus(c).due; }).length;
    }, 0);

    /* Excluded controls with no recorded justification — ISO 27001
       clause 6.1.3(d) requires one for every SoA exclusion, and this is
       the one gap that otherwise stays invisible until someone
       generates an Auditor Pack and reads its exclusion summary. Live-
       computed like the tile above, not scan-snapshotted — a
       justification can be added or a control re-scoped any day,
       independent of when a scan last ran. */
    var unjustifiedExclusions = entitledFrameworks().reduce(function (sum, fw) {
      return sum + frameworkVisibleRows(fw).filter(function (c) { return !c.app && !c.just; }).length;
    }, 0);

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
      return '<div class="card kpi" data-action="App.goSoaFw" data-id="' + fw + '"><div class="kpi-num"><b data-count="' + ready + '">' + ready + '<small>%</small></b>' + trendBadge(ready, prevReady, true) + '</div><span>Audit readiness — ' + esc(fwName(fw)) + '</span><div class="sub">' + impl + ' of ' + applicable.length + ' applicable controls implemented</div></div>';
    }).join('');
    document.getElementById('kpiRow').innerHTML = fwTiles +
      '<div class="card kpi" data-action="App.go" data-id="scan"><div class="kpi-num"><b' + (last ? ' data-count="' + last.score + '"' : '') + '>' + (last ? last.score : '—') + (last ? '<small>/100</small>' : '') + '</b>' + scoreTrendHtml + '</div><span>Posture score</span><div class="sub">' + scoreBreakdownHtml + '</div></div>' +
      '<div class="card kpi" data-action="App.goRisksSeverity" data-id="HighCritical"><div class="kpi-num"><b data-count="' + crit + '">' + crit + '</b>' + critTrendHtml + '</div><span>High / critical residual risks</span><div class="sub">' + S.risks.filter(function (r) { return r.status !== 'Closed'; }).length + ' open risks total</div></div>' +
      '<div class="card kpi" data-action="App.goActionsFilter" data-id="Overdue"><div class="kpi-num"><b data-count="' + od + '" style="color:' + (od ? 'var(--fail)' : 'var(--gold-light)') + '">' + od + '</b>' + odTrendHtml + '</div><span>Overdue actions</span><div class="sub">' + (od ? ('0–7d: ' + b1 + ' · 8–30d: ' + b2 + ' · 30+d: ' + b3) : openActs.length + ' open actions') + '</div></div>' +
      '<div class="card kpi" data-action="App.go" data-id="soa"><div class="kpi-num"><b data-count="' + overdueControls + '" style="color:' + (overdueControls ? 'var(--fail)' : 'var(--gold-light)') + '">' + overdueControls + '</b></div><span>Controls overdue for review</span><div class="sub">Implemented, not re-verified within cadence — <a href="#" data-action="App.go" data-id="soa" style="color:inherit;text-decoration:underline">open the SoA →</a></div></div>' +
      '<div class="card kpi" data-action="App.go" data-id="soa"><div class="kpi-num"><b data-count="' + unjustifiedExclusions + '" style="color:' + (unjustifiedExclusions ? 'var(--fail)' : 'var(--gold-light)') + '">' + unjustifiedExclusions + '</b></div><span>Exclusions missing justification</span><div class="sub">Auditors check this first — <a href="#" data-action="App.go" data-id="soa" style="color:inherit;text-decoration:underline">open the SoA →</a></div></div>';
    runCountUps(document.getElementById('kpiRow'));
    updateFavicon();

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
        monitorEl.innerHTML = '<div class="d-kv"><span>Last automated scan</span><b style="' + (autoOnTrack ? '' : 'color:var(--warn)') + '">' + fmtDate(lastAuto.date) + ' (' + sinceAuto + 'd ago)' + (autoOnTrack ? '' : ' ' + icon('flag') + ' overdue') + '</b></div>' +
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
        '<div class="d-kv"><span>Next review due</span><b style="' + (reviewOverdue ? 'color:var(--fail)' : '') + '">' + (lastReview && lastReview.nextDue ? fmtDate(lastReview.nextDue) + (reviewOverdue ? ' ' + icon('flag') + ' overdue' : '') : 'Not set') + '</b></div>' +
        '<div class="d-kv"><span>Next ISMS activity</span><b style="' + (calOverdue ? 'color:var(--fail)' : '') + '">' + (upcomingCal ? fmtDate(upcomingCal.nextDue) + ' — ' + esc(upcomingCal.title) + (calOverdue ? ' ' + icon('flag') : '') : 'None scheduled') + '</b></div>' +
        '<div class="d-kv"><span>Vendor reviews overdue</span><b style="' + (overdueVendorList.length ? 'color:var(--fail)' : '') + '">' + (overdueVendorList.length ? overdueVendorList.length + ' ' + icon('flag') + ' — ' + overdueVendorList.slice(0, 2).map(function (v) { return esc(v.name); }).join(', ') + (overdueVendorList.length > 2 ? ' +' + (overdueVendorList.length - 2) + ' more' : '') : 'None') + '</b></div>' +
        incidentKv() + policyReviewKv() + attestationKv();
    }


    renderResidualHeatmapInto('heat', 'heatLegend');
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
        var area = '<polygon points="' + line + ' ' + lastP[0] + ',60 ' + firstP[0] + ',60" fill="var(--gold)" fill-opacity=".12"/>';
        var readyLine = '';
        if (trendFeatOn && readinessScans.length > 1) {
          var rPts = S.scans.map(function (s, i) {
            var r = typeof s.readiness === 'number' ? s.readiness : null;
            return r === null ? null : [(i / (n2 - 1)) * 292 + 4, 60 - (r / 100) * 56];
          }).filter(Boolean);
          readyLine = '<polyline points="' + rPts.map(function (p) { return p[0] + ',' + p[1]; }).join(' ') + '" fill="none" stroke="var(--gold-light)" stroke-opacity=".55" stroke-width="1.5" stroke-dasharray="3,3"/>';
        }
        document.getElementById('spark').innerHTML = area + readyLine +
          '<polyline points="' + line + '" fill="none" stroke="var(--gold)" stroke-width="2"/>' +
          '<circle cx="' + firstP[0] + '" cy="' + firstP[1] + '" r="3" fill="var(--gold-light)" fill-opacity=".5"/>' +
          '<circle cx="' + lastP[0] + '" cy="' + lastP[1] + '" r="4" fill="var(--gold-light)"/>';
        document.getElementById('sparkLegend').style.display = (trendFeatOn && readinessScans.length > 1) ? 'flex' : 'none';
      } else {
        document.getElementById('spark').innerHTML = '<circle cx="150" cy="' + (60 - (lastScan.score / 100) * 56) + '" r="4" fill="var(--gold-light)"/>';
        document.getElementById('sparkLegend').style.display = 'none';
      }
    } else {
      if (sparkCapEl) sparkCapEl.innerHTML = '<span>No scans yet — run one from the sidebar</span>';
      document.getElementById('spark').innerHTML = '';
    }
    renderActivityFeed();

    renderConstellationThumb();
    renderComplianceFingerprint();
    renderCertificationJourney();
    renderAssurancePulse();
    renderRiskLandscapeCard();
  }

  /* ================= Compliance Fingerprint =================
     A concentric ring gauge — one ring per control theme within
     whichever framework tab is active — reusing the exact same
     window.ReportEngine.charts.fingerprint() SVG builder a report
     cover uses (see report.js's own header comment on that function),
     just with the dark app palette and interactive tooltips/count-up
     turned on. Rings are grouped by constellationTheme() — the same
     per-framework code-pattern theming the Control Constellation
     already uses, so "theme" means the same thing in both views. */
  function fingerprintRowsFor(fw) {
    return frameworkAppRows(fw).map(function (c) {
      return {
        theme: window.CheckpointLib.constellationTheme(fw, c.id),
        implemented: c.st === 'Implemented',
        evidenced: !!(c.evidenceUrl || c.verified)
      };
    });
  }

  function renderComplianceFingerprint() {
    var card = document.getElementById('fpCard');
    if (!card) return;
    var entitled = entitledFrameworks();
    if (!entitled.length) { card.style.display = 'none'; return; }
    card.style.display = '';
    if (!window._fpFw || entitled.indexOf(window._fpFw) === -1) window._fpFw = entitled.indexOf('iso27001') > -1 ? 'iso27001' : entitled[0];
    var activeFw = window._fpFw;

    var tabsEl = document.getElementById('fpTabs');
    if (tabsEl) {
      tabsEl.innerHTML = entitled.map(function (fw) {
        return '<button class="f-pill' + (fw === activeFw ? ' on' : '') + '" aria-pressed="' + (fw === activeFw ? 'true' : 'false') + '" data-action="App.setFingerprintFw" data-id="' + esc(fw) + '">' + esc(fwName(fw)) + '</button>';
      }).join('');
    }

    var data = window.CheckpointLib.fingerprintFromRows(fingerprintRowsFor(activeFw));
    var svgWrap = document.getElementById('fpSvgWrap');
    if (svgWrap) {
      svgWrap.innerHTML = data.total ? window.ReportEngine.charts.fingerprint(data, { interactive: true, palette: 'app' }) : '<p style="color:var(--paper-faint);font-size:12.5px">No applicable controls yet for ' + esc(fwName(activeFw)) + '.</p>';
      initSvgTooltip(svgWrap);
      runCountUps(svgWrap);
    }
    var capEl = document.getElementById('fpCaption');
    if (capEl) capEl.textContent = data.total + ' applicable control' + (data.total === 1 ? '' : 's') + ' across ' + data.rings.length + ' theme' + (data.rings.length === 1 ? '' : 's') + ' · ' + data.evidencePct + '% evidence-backed';
  }

  /* ================= Certification Journey =================
     A horizontal timeline of real milestones for the primary entitled
     framework — never a fabricated date (see
     window.CheckpointLib.remediationVelocityProjection()'s own header
     comment in lib.js for the projection's honesty rules). Replaces
     the old static 4-phase "Assess/Implement/Evidence/Certify" bar;
     kept behind the same featRoadmap feature flag so nothing else
     about how this card is shown/hidden needs to change. */
  function primaryFrameworkImplementedEvents(fw) {
    var appRows = S.controls.filter(function (c) { return c.fw === fw && c.app; });
    var idSet = {};
    appRows.forEach(function (c) { idSet[c.id] = true; });
    var latest = {};
    (S.auditLog || []).forEach(function (e) {
      if (e.targetType !== 'Control' || e.action !== 'Control status changed' || e.after !== 'Implemented') return;
      var id = null;
      if (typeof e.targetId === 'string' && e.targetId.indexOf('|') > -1) {
        var parts = e.targetId.split('|');
        if (parts[0] === fw) id = parts[1];
      } else if (idSet[e.targetId]) {
        id = e.targetId; /* older/demo rows sometimes logged a bare code */
      }
      if (!id || !idSet[id]) return;
      var d = String(e.entryDateTime || '').slice(0, 10);
      if (!d) return;
      if (!latest[id] || d > latest[id]) latest[id] = d;
    });
    /* LastVerified fallback — a control implemented before audit
       logging existed, or edited directly in SharePoint, still counts
       toward velocity if it's Implemented now and was never verified
       via the app's own "Control status changed" log. */
    appRows.forEach(function (c) {
      if (c.st === 'Implemented' && !latest[c.id] && c.verified) latest[c.id] = String(c.verified).slice(0, 10);
    });
    return Object.keys(latest).map(function (id) { return latest[id]; });
  }

  function certificationJourneyData() {
    var entitled = entitledFrameworks();
    var primaryFw = entitled.indexOf('iso27001') > -1 ? 'iso27001' : entitled[0];
    if (!primaryFw) return null;
    var pApp = frameworkAppRows(primaryFw);
    var pImpl = pApp.filter(function (c) { return c.st === 'Implemented'; });
    var evidencedCount = pImpl.filter(function (c) { return c.verified || c.evidenceUrl; }).length;
    var evidencePct = pApp.length ? Math.round(evidencedCount / pApp.length * 100) : 0;
    var todayIso = new Date().toISOString().slice(0, 10);

    var engagementStart = S.scans.length ? S.scans[0].date : null;
    var firstRiskEntry = (S.auditLog || []).filter(function (e) { return e.targetType === 'Risk'; })
      .sort(function (a, b) { return (a.entryDateTime || '').localeCompare(b.entryDateTime || ''); })[0];
    var gapAnalysisDate = firstRiskEntry ? String(firstRiskEntry.entryDateTime || '').slice(0, 10) : null;

    var plannedAudits = (S.audits || []).filter(function (a) { return a.status === 'Planned'; }).sort(function (a, b) { return (a.planned || '').localeCompare(b.planned || ''); });
    var nextAudit = plannedAudits.filter(function (a) { return a.fw === primaryFw; })[0] || plannedAudits[0];
    var nextInternalAuditDate = nextAudit ? nextAudit.planned : null;

    var externalAuditItem = (S.calendar || []).filter(function (c) { return c.status !== 'Done' && /audit/i.test(c.category || ''); })
      .sort(function (a, b) { return (a.nextDue || '').localeCompare(b.nextDue || ''); })[0];
    var externalAuditDate = externalAuditItem ? externalAuditItem.nextDue : null;

    var events = primaryFrameworkImplementedEvents(primaryFw);
    var projection = window.CheckpointLib.remediationVelocityProjection({
      events: events, applicableTotal: pApp.length, implementedNow: pImpl.length, today: todayIso
    });

    var milestones = [
      { key: 'start', label: 'Engagement start', date: engagementStart, kind: 'past' },
      { key: 'gap', label: 'Gap analysis', date: gapAnalysisDate, kind: 'past' },
      { key: 'today', label: 'Evidence today', date: todayIso, kind: 'today', pct: evidencePct },
      { key: 'internal', label: 'Next internal audit', date: nextInternalAuditDate, kind: 'future' },
      { key: 'external', label: 'External audit', date: externalAuditDate, kind: 'future' }
    ];
    if (projection.status === 'projected') {
      milestones.push({ key: 'ready', label: 'Projected audit-ready', date: projection.date, kind: 'projected', offScale: !!projection.clamped });
    }

    return { primaryFw: primaryFw, todayIso: todayIso, evidencePct: evidencePct, projection: projection, milestones: milestones };
  }

  function renderCertificationJourney() {
    var card = document.getElementById('journeyCard');
    if (!card) return;
    var on = featureOn('featRoadmap');
    card.style.display = on ? '' : 'none';
    if (!on) return;
    var svgWrap = document.getElementById('journeySvgWrap');
    var noteEl = document.getElementById('journeyNote');
    var data = certificationJourneyData();
    if (!data) {
      if (svgWrap) svgWrap.innerHTML = '';
      if (noteEl) noteEl.textContent = 'Enable a framework to see its certification journey.';
      return;
    }
    if (svgWrap) {
      svgWrap.innerHTML = window.ReportEngine.charts.journey(data.milestones, { interactive: true, palette: 'app' });
      initSvgTooltip(svgWrap);
    }
    if (noteEl) {
      var p = data.projection;
      var msg = p.status === 'complete'
        ? 'Every applicable control is already implemented.'
        : p.status === 'projected'
          ? 'Projected audit-ready ' + fmtDate(p.date) + ' at current velocity (' + p.velocityPerWeek + ' controls/week over the last 8 weeks).'
          : 'Insufficient remediation history yet to project an audit-ready date.';
      noteEl.innerHTML = '<b>' + esc(fwName(data.primaryFw)) + '</b> — ' + esc(msg);
    }
  }

  /* ================= Assurance Pulse =================
     A 26-week activity contribution strip — reuses the exact same
     window.ReportEngine.charts.activityGrid() the management review
     pack embeds, fed by a flat event list gathered here from every
     register that represents "compliance work happened": posture
     scans, evidence captured/re-verified (audit log), management
     reviews and completed internal audits. */
  function activityEventsFor() {
    var events = [];
    S.scans.forEach(function (s) { if (s.date) events.push({ date: s.date, type: 'scan' }); });
    (S.auditLog || []).forEach(function (e) {
      if (!e || !e.entryDateTime) return;
      var d = String(e.entryDateTime).slice(0, 10);
      if (e.action === 'Evidence link changed' || e.action === 'Evidence link changed (shared evidence)') events.push({ date: d, type: 'evidence' });
      else if (e.action === 'Control verified') events.push({ date: d, type: 'attestation' });
    });
    (S.reviews || []).forEach(function (r) { if (r.date) events.push({ date: r.date, type: 'review' }); });
    (S.audits || []).forEach(function (a) { if (a.status === 'Completed' && a.completed) events.push({ date: a.completed, type: 'audit' }); });
    return events;
  }

  function renderAssurancePulse() {
    var svgWrap = document.getElementById('apSvgWrap');
    if (!svgWrap) return;
    var todayIso = new Date().toISOString().slice(0, 10);
    var grid = window.CheckpointLib.weeklyActivityGrid(activityEventsFor(), 26, todayIso);
    svgWrap.innerHTML = window.ReportEngine.charts.activityGrid(grid, { interactive: true, palette: 'app' });
    initSvgTooltip(svgWrap);
    setupAssurancePulseInteractions(svgWrap);
  }

  var _apBound = typeof WeakSet !== 'undefined' ? new WeakSet() : null;
  function setupAssurancePulseInteractions(svgWrap) {
    if (_apBound && _apBound.has(svgWrap)) return;
    if (_apBound) _apBound.add(svgWrap);
    function pick(el) {
      if (!el) return;
      window._feedWeekFilter = { start: el.dataset.weekStart, end: el.dataset.weekEnd };
      renderActivityFeed();
    }
    svgWrap.addEventListener('click', function (e) { pick(e.target.closest('rect[data-week-start]')); });
    svgWrap.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      var el = e.target.closest('rect[data-week-start]');
      if (el) { e.preventDefault(); pick(el); }
    });
  }

  /* The Dashboard's Activity feed, filterable to a single Assurance
     Pulse week — filtering re-reads S.activity every time rather than
     caching a filtered copy, so it always reflects whatever's
     currently in S.activity. */
  function renderActivityFeed() {
    var feedEl = document.getElementById('feed');
    if (!feedEl) return;
    var chipEl = document.getElementById('feedFilterChip');
    var filter = window._feedWeekFilter;
    var items = S.activity;
    if (filter) {
      items = S.activity.filter(function (a) {
        var d = String(a.t || '').slice(0, 10);
        return d >= filter.start && d <= filter.end;
      });
    }
    feedEl.innerHTML = items.slice(0, 10).map(function (a) {
      return '<li><time>' + fmtDate(a.t) + '</time>' + a.msg + '</li>';
    }).join('') || ('<li style="color:var(--paper-faint)">' + (filter ? 'No activity that week.' : 'No activity yet.') + '</li>');
    if (chipEl) {
      if (filter) {
        chipEl.style.display = '';
        chipEl.innerHTML = '<span class="feed-filter-chip">' + esc(fmtDate(filter.start)) + ' – ' + esc(fmtDate(filter.end)) + '<button type="button" data-action="App.clearFeedWeekFilter" aria-label="Clear week filter">' + icon('close') + '</button></span>';
      } else {
        chipEl.style.display = 'none';
        chipEl.innerHTML = '';
      }
    }
  }

  /* ================= Risk Landscape =================
     An alternative rendering of the risk register, toggled alongside
     the classic 5×5 heatmap (kept as the default — see this feature's
     own instruction that auditors expect the grid). Bubble positions
     come from lib.js's deterministic riskBubbleLayout(); the trail
     endpoint for each bubble is this risk's OWN position at the
     nearest scan roughly a quarter (91 days) ago, computed with the
     exact same riskBubblePoint() so the jitter lines up — see that
     function's own header comment in lib.js. */
  function riskLandscapeTrailSnapshot() {
    var todayMs = Date.now ? Date.now() : Date.parse(new Date().toISOString());
    var targetMs = todayMs - 91 * 86400000;
    var best = null, bestDiff = Infinity;
    S.scans.forEach(function (s) {
      if (!s.riskSnapshot || !s.riskSnapshot.length) return;
      var ms = Date.parse(s.date);
      if (!isFinite(ms) || ms > todayMs) return;
      var diff = Math.abs(ms - targetMs);
      if (diff < bestDiff) { bestDiff = diff; best = s; }
    });
    return best;
  }

  function renderRiskLandscapeCard() {
    var toggleEl = document.getElementById('rlViewToggle');
    var gridWrap = document.getElementById('rlGridWrap');
    var landscapeWrap = document.getElementById('rlLandscapeWrap');
    if (!toggleEl || !gridWrap || !landscapeWrap) return;
    if (!window._riskView) window._riskView = 'grid';
    toggleEl.innerHTML = ['grid', 'landscape'].map(function (v) {
      return '<button class="f-pill' + (window._riskView === v ? ' on' : '') + '" aria-pressed="' + (window._riskView === v ? 'true' : 'false') + '" data-action="App.setRiskView" data-id="' + v + '">' + (v === 'grid' ? '5×5 grid' : 'Landscape') + '</button>';
    }).join('');
    gridWrap.style.display = window._riskView === 'grid' ? '' : 'none';
    landscapeWrap.style.display = window._riskView === 'landscape' ? '' : 'none';
    if (window._riskView !== 'landscape') return;

    var openRisks = S.risks.filter(function (r) { return r.status !== 'Closed'; });
    var riskInputs = openRisks.map(function (r) { var q = residual(r); return { id: r.id, L: q.L, I: q.I }; });
    var layout = window.CheckpointLib.riskBubbleLayout(riskInputs);
    var byId = {};
    openRisks.forEach(function (r) { byId[r.id] = r; });
    layout.bubbles.forEach(function (b) { var r = byId[b.id]; if (r) b.label = b.id + ' — ' + r.title; });

    var prevScan = riskLandscapeTrailSnapshot();
    if (prevScan && prevScan.riskSnapshot) {
      var prevById = {};
      prevScan.riskSnapshot.forEach(function (p) { prevById[p.id] = p; });
      layout.trails = layout.bubbles.map(function (b) {
        var prev = prevById[b.id];
        if (!prev || (prev.L === b.L && prev.I === b.I)) return null;
        var from = window.CheckpointLib.riskBubblePoint(b.id, prev.L, prev.I, { size: layout.size, margin: layout.margin });
        return { fromX: from.x, fromY: from.y, toX: b.x, toY: b.y };
      }).filter(Boolean);
    }

    landscapeWrap.innerHTML = window.ReportEngine.charts.riskLandscape(layout, { interactive: true, palette: 'app' });
    initSvgTooltip(landscapeWrap);
    setupRiskLandscapeInteractions(landscapeWrap);
  }

  var _rlBound = typeof WeakSet !== 'undefined' ? new WeakSet() : null;
  function setupRiskLandscapeInteractions(wrap) {
    if (_rlBound && _rlBound.has(wrap)) return;
    if (_rlBound) _rlBound.add(wrap);
    function pick(el) { if (el && el.dataset.riskId) App.openRisk(el.dataset.riskId); }
    wrap.addEventListener('click', function (e) { pick(e.target.closest('circle[data-risk-id]')); });
    wrap.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      var el = e.target.closest('circle[data-risk-id]');
      if (el) { e.preventDefault(); pick(el); }
    });
  }

  /* ================= Control Constellation =================
     One SVG network of every applicable-or-not-yet-applicable control
     across every entitled framework, plus the cross-framework "Also
     satisfies" relationships between them. Node positions are computed
     once per render by lib.js's constellationLayout() — a deterministic,
     seeded-by-code radial layout, never a physics simulation — so
     re-rendering with the same data always reproduces the same picture.
     Hover/selection state is plain class toggling on the existing DOM
     (no per-frame JS, no redraw loop); the drawer on click is the exact
     same App.openControlGuidance() every other control view already
     uses. window._cx holds the most-recently-built node/edge/position/
     adjacency set — rebuilt at each render entry point (view open, dash
     refresh, filter/lens change), read (not recomputed) by hover. */
  window._cx = null; /* { nodes, edges, positions, adjacency, byKey } */
  window._cxFwFilter = null; /* null = all entitled frameworks shown */
  window._cxLens = false; /* evidence-lens: size nodes by evidence presence */
  window._cxSelected = null; /* pinned "fw|id" key, or null */

  function constellationKey(c) { return c.fw + '|' + c.id; }

  function constellationStatusClass(c) {
    if (!c.app) return 'cx-na';
    if (c.st === 'Implemented') return 'cx-pass';
    if (c.st === 'In progress') return 'cx-warn';
    return 'cx-faint';
  }

  /* Builds (or returns the cached) node/edge/layout/adjacency set for
     every entitled framework's visible controls — "visible", not just
     "applicable", so not-applicable controls still render as their own
     (dashed) nodes rather than vanishing from the picture entirely. */
  function buildConstellation() {
    var entitled = entitledFrameworks();
    var nodes = [];
    entitled.forEach(function (fw) {
      frameworkVisibleRows(fw).forEach(function (c) {
        nodes.push({
          fw: fw, id: c.id, map: c.map, t: c.t, st: c.st, app: c.app,
          own: c.own, evidenceUrl: c.evidenceUrl,
          theme: window.CheckpointLib.constellationTheme(fw, c.id)
        });
      });
    });
    var edges = window.CheckpointLib.constellationEdges(nodes);
    var positions = window.CheckpointLib.constellationLayout(nodes, window.FRAMEWORK_ORDER);
    var byKey = {};
    nodes.forEach(function (n) { byKey[constellationKey(n)] = n; });
    var adjacency = {};
    edges.forEach(function (e) {
      (adjacency[e.a] = adjacency[e.a] || []).push(e.b);
      (adjacency[e.b] = adjacency[e.b] || []).push(e.a);
    });
    window._cx = { nodes: nodes, edges: edges, positions: positions, adjacency: adjacency, byKey: byKey };
    return window._cx;
  }

  /* Shared SVG builder for both the full interactive view and the inert
     Dashboard thumbnail — `opts.interactive` gates the data-action/
     data-node-id attributes, labels and legend-worthy detail that only
     the full view needs; the thumbnail reuses the exact same node set,
     edges and positions so it's a faithful (if tiny) preview, not a
     separate mock. */
  function buildConstellationSvg(cx, opts) {
    opts = opts || {};
    var interactive = !!opts.interactive;
    var fwFilter = opts.fwFilter || null;
    var lens = !!opts.lens;
    var selected = opts.selected || null;
    var evidenceRadii = lens ? { on: 7.5, off: 3.2 } : { on: 5, off: 5 };

    var edgePaths = cx.edges.map(function (e) {
      var pa = cx.positions[e.a], pb = cx.positions[e.b];
      if (!pa || !pb) return '';
      var na = cx.byKey[e.a], nb = cx.byKey[e.b];
      var dimmed = fwFilter && (na.fw !== fwFilter || nb.fw !== fwFilter);
      var d = 'M' + pa.x.toFixed(1) + ',' + pa.y.toFixed(1) + ' Q500,500 ' + pb.x.toFixed(1) + ',' + pb.y.toFixed(1);
      return '<path class="cx-edge' + (dimmed ? ' cx-dim' : '') + '" data-edge-a="' + esc(e.a) + '" data-edge-b="' + esc(e.b) + '" d="' + d + '"/>';
    }).join('');

    var nodeEls = cx.nodes.map(function (n) {
      var key = constellationKey(n);
      var p = cx.positions[key];
      if (!p) return '';
      var statusCls = constellationStatusClass(n);
      var dimmed = fwFilter && n.fw !== fwFilter;
      var r = n.evidenceUrl ? evidenceRadii.on : evidenceRadii.off;
      var isSelected = interactive && selected === key;
      var cls = 'cx-node ' + statusCls + (dimmed ? ' cx-dim' : '') + (isSelected ? ' cx-selected cx-pulse' : '');
      var attrs = interactive
        ? ' data-node-id="' + esc(key) + '" data-action="App.pickConstellationNode" data-id="' + esc(key) + '" role="button" tabindex="0" aria-label="' + esc(n.fw + ' ' + n.id + ' — ' + n.t) + '"'
        : '';
      var circle = '<circle class="' + cls + '" cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) + '" r="' + r + '"' + attrs + '></circle>';
      if (!interactive) return circle;
      var label = '<text class="cx-label" x="' + p.x.toFixed(1) + '" y="' + (p.y - r - 5).toFixed(1) + '" data-label-for="' + esc(key) + '">' + esc(n.id) + '</text>';
      return circle + label;
    }).join('');

    return '<g class="cx-edges">' + edgePaths + '</g><g class="cx-nodes">' + nodeEls + '</g>';
  }

  /* The full, interactive Constellation view. */
  function renderConstellation() {
    var svgEl = document.getElementById('cxSvg');
    if (!svgEl) return;
    var entitled = entitledFrameworks();
    var emptyEl = document.getElementById('cxEmpty');
    if (!entitled.length) {
      svgEl.innerHTML = '';
      if (emptyEl) emptyEl.style.display = 'block';
      var pillsElEmpty = document.getElementById('cxFwPills');
      if (pillsElEmpty) pillsElEmpty.innerHTML = '';
      var countElEmpty = document.getElementById('cxCount');
      if (countElEmpty) countElEmpty.textContent = '';
      return;
    }
    if (emptyEl) emptyEl.style.display = 'none';
    if (window._cxFwFilter && entitled.indexOf(window._cxFwFilter) === -1) window._cxFwFilter = null;

    var cx = buildConstellation();
    if (window._cxSelected && !cx.byKey[window._cxSelected]) window._cxSelected = null;

    var pillsEl = document.getElementById('cxFwPills');
    if (pillsEl) {
      pillsEl.innerHTML = '<button class="f-pill' + (!window._cxFwFilter ? ' on' : '') + '" aria-pressed="' + (!window._cxFwFilter ? 'true' : 'false') + '" data-action="App.filterConstellationFw" data-id="">All frameworks</button>' +
        entitled.map(function (fw) {
          return '<button class="f-pill' + (window._cxFwFilter === fw ? ' on' : '') + '" aria-pressed="' + (window._cxFwFilter === fw ? 'true' : 'false') + '" data-action="App.filterConstellationFw" data-id="' + esc(fw) + '">' + esc(fwName(fw)) + '</button>';
        }).join('');
    }
    var lensEl = document.getElementById('cxLensToggle');
    if (lensEl) {
      lensEl.className = 'toggle' + (window._cxLens ? ' on' : '');
      lensEl.setAttribute('aria-checked', window._cxLens ? 'true' : 'false');
    }
    var countEl = document.getElementById('cxCount');
    if (countEl) countEl.textContent = cx.nodes.length + ' controls across ' + entitled.length + ' framework' + (entitled.length === 1 ? '' : 's') + ' · ' + cx.edges.length + ' cross-framework link' + (cx.edges.length === 1 ? '' : 's');

    svgEl.innerHTML = buildConstellationSvg(cx, { interactive: true, fwFilter: window._cxFwFilter, lens: window._cxLens, selected: window._cxSelected });
    setupConstellationInteractions();
    constellationHover(null);
  }

  /* Small, non-interactive preview embedded in the Dashboard — same
     node/edge/layout data as the full view, just without the click/
     hover attributes or labels, wrapped in a card that links through
     to the full Constellation. */
  function renderConstellationThumb() {
    var card = document.getElementById('cxThumbCard');
    var el = document.getElementById('cxThumbSvg');
    if (!card || !el) return;
    var entitled = entitledFrameworks();
    if (!entitled.length) { card.style.display = 'none'; return; }
    card.style.display = '';
    var cx = buildConstellation();
    el.innerHTML = buildConstellationSvg(cx, { interactive: false });
  }

  /* Delegated hover (mouseover/mouseout bubble; unlike mouseenter/
     mouseleave they work with a single listener on the container) plus
     keyboard-focus equivalents for the same nodes the click handler
     already reaches via [data-action]. Bound once — #cxSvg itself is
     never replaced, only its innerHTML, so the listener survives every
     re-render. */
  function setupConstellationInteractions() {
    if (window._cxBound) return;
    window._cxBound = true;
    var wrap = document.getElementById('cxSvg');
    if (!wrap) return;
    wrap.addEventListener('mouseover', function (e) {
      var el = e.target.closest('circle[data-node-id]');
      if (el) constellationHover(el.dataset.nodeId);
    });
    wrap.addEventListener('mouseout', function (e) {
      var el = e.target.closest('circle[data-node-id]');
      if (!el) return;
      var to = e.relatedTarget && e.relatedTarget.closest && e.relatedTarget.closest('circle[data-node-id]');
      if (!to) constellationHover(null);
    });
    wrap.addEventListener('focusin', function (e) {
      var el = e.target.closest('circle[data-node-id]');
      if (el) constellationHover(el.dataset.nodeId);
    });
    wrap.addEventListener('focusout', function (e) {
      var el = e.target.closest('circle[data-node-id]');
      if (el) constellationHover(null);
    });
    wrap.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      var el = e.target.closest('circle[data-node-id]');
      if (!el) return;
      e.preventDefault();
      App.pickConstellationNode(el.dataset.nodeId);
    });
  }

  /* Highlights `key`'s whole mapped cluster (itself + every direct
     cross-framework edge partner) across every framework sector — or,
     with no active hover, falls back to the pinned selection so a
     click leaves the cluster lit after the mouse moves away. Pure
     class toggling against the already-rendered DOM: no redraw, no
     recomputation of layout or data. */
  function constellationHover(hoverKey) {
    var cx = window._cx;
    var svgEl = document.getElementById('cxSvg');
    if (!cx || !svgEl) return;
    var active = hoverKey || window._cxSelected;
    var clusterSet = {};
    if (active) {
      clusterSet[active] = true;
      (cx.adjacency[active] || []).forEach(function (k) { clusterSet[k] = true; });
    }
    svgEl.querySelectorAll('circle.cx-node').forEach(function (c) {
      c.classList.toggle('cx-hi', !!active && !!clusterSet[c.dataset.nodeId]);
    });
    svgEl.querySelectorAll('text.cx-label').forEach(function (t) {
      t.classList.toggle('cx-show', !!active && !!clusterSet[t.dataset.labelFor]);
    });
    svgEl.querySelectorAll('path.cx-edge').forEach(function (p) {
      var lit = !!active && (p.dataset.edgeA === active || p.dataset.edgeB === active);
      p.classList.toggle('cx-lit', lit);
    });
  }

  function renderScanChecks(instant) {
    var el = document.getElementById('checkList');
    var areas = [], byArea = {};
    window.CHECK_DEFS.forEach(function (c) {
      if (!byArea[c.area]) { byArea[c.area] = []; areas.push(c.area); }
      byArea[c.area].push(c);
    });
    var aiOn = !!(S.entitlements && S.entitlements.ai);
    el.innerHTML = areas.map(function (area) {
      return '<div class="check-area">' + esc(area) + '</div>' + byArea[area].map(function (c) {
        var r = checkResult(c);
        var cls = r === 'pass' ? 'st-Implemented' : r === 'review' ? 'st-Intreatment' : r === 'fail' ? 'st-Open' : r === 'manual' ? 'st-Proposed' : 'st-Notstarted';
        var lbl = r === 'pass' ? 'Pass' : r === 'review' ? 'Review' : r === 'fail' ? 'Fail' : r === 'manual' ? 'Manual — verify' : 'Not scanned';
        var note = (S.lastNotes && S.lastNotes[c.id]) ? '<div class="src" style="margin-top:2px">' + esc(S.lastNotes[c.id]) + '</div>' : '';
        var explainBtn = aiOn ? '<button class="btn ghost sm" data-action="App.explainCheck" data-id="' + esc(c.id) + '">Explain this</button>' : '';
        var cached = _checkExplainCache[c.id];
        var explainBlock = cached ? '<div class="card" style="margin:0 2px 10px;font-size:12.5px"><div class="chip st-Intreatment" style="margin-bottom:6px">' + esc(window.CheckpointAI ? window.CheckpointAI.DISCLAIMER : '') + '</div>' + escAiText(cached) + '</div>' : '';
        return '<div class="check-row-group"><div class="check-row' + (instant ? ' show' : '') + '"><span class="lbl">' + c.label + note + '</span><span class="chip ' + cls + '">' + lbl + '</span>' + explainBtn + '</div><div id="checkExplain-' + esc(c.id) + '">' + explainBlock + '</div></div>';
      }).join('');
    }).join('');
  }

  /* In-memory only, keyed by check id — never persisted, never sent
     anywhere but the model itself. Cleared whenever a new scan
     completes (see runScan()'s scan-completion block) so a stale
     explanation from a PREVIOUS scan's result/note is never shown
     against this scan's fresh result. */
  var _checkExplainCache = {};

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
    var keys = CAPABILITY_KEYS;
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

  /* In-memory only, never persisted: the result of the last AI evidence
     interpretation. Cleared on demand and lost on reload, same as every
     other AI draft in this app — what persists is only what a
     practitioner explicitly linked. */
  var _evidenceInterpretation = null;

  function renderEvidenceInterpretation() {
    var el = document.getElementById('evidenceInterpretResult');
    if (!el) return;
    var d = _evidenceInterpretation;
    if (!d) { el.innerHTML = ''; return; }
    var disclaimer = window.CheckpointAI ? window.CheckpointAI.DISCLAIMER : '';
    var mapped = d.mappings.length
      ? d.mappings.map(function (m) {
          return '<div class="proposed-card"><h4>' + esc(m.code) + ' — ' + esc(m.title) + '</h4>' +
            '<div class="meta">' + esc(m.why || 'No rationale given.') + '</div>' +
            '<div class="meta">Currently <b>' + esc(m.st) + '</b>' + (m.hasEvidence ? ' · evidence already linked' : ' · no evidence linked yet') + '</div>' +
            (READONLY ? '' : '<button class="btn sm" data-action="App.aiLinkInterpreted" data-id="' + esc(m.code) + '">Link as evidence</button>') +
            '</div>';
        }).join('')
      : '<p style="color:var(--paper-dim);font-size:12.5px">No control in ' + esc(fwName(d.fw)) + ' was proposed for this artefact. That is a real answer, not a failure — evidence that maps to nothing you have in scope is evidence for something else.</p>';
    el.innerHTML = '<div class="card" style="margin-top:16px">' +
      '<div class="chip st-Intreatment" style="margin-bottom:8px">' + esc(disclaimer) + '</div>' +
      '<h3>' + esc(d.name) + '</h3>' +
      (d.summary ? '<p class="rpt-intro">' + esc(d.summary) + '</p>' : '') +
      '<div class="d-kv"><span>Period covered</span><b>' + esc(d.period) + '</b></div>' +
      '<div class="d-kv"><span>Proposed for</span><b>' + d.mappings.length + ' ' + esc(fwName(d.fw)) + ' control' + (d.mappings.length === 1 ? '' : 's') + '</b></div>' +
      (d.droppedCount ? '<div class="d-kv"><span>Discarded</span><b>' + d.droppedCount + ' proposed code' + (d.droppedCount === 1 ? '' : 's') + ' that do not exist in your register</b></div>' : '') +
      mapped +
      '<div class="card" style="margin-top:14px;border-color:rgba(224,138,110,.35)"><h4 style="margin-bottom:6px">What this artefact does NOT evidence</h4>' +
      '<p style="font-size:12.5px;color:var(--paper-dim);line-height:1.7">' + esc(d.gaps) + '</p></div>' +
      '<button class="btn ghost sm" style="margin-top:12px" data-action="App.aiClearInterpretation">Clear</button>' +
      '</div>';
  }

  /* In-memory only, keyed by proposed template id — advisory AI
     reasoning shown before Approve, never edits t.risk itself (the
     template stays the single source of truth App.approve() saves
     from) and is never persisted. Cleared along with everything else
     proposed-finding-related once a scan re-proposes/dismisses. */
  var _riskInsightCache = {};

  /* ---- scan-suggested SoA statuses: one registry, three consumers ----
     Every framework whose SoA statuses a posture scan can suggest, mapped
     to its state list and to the App.confirm<X>Suggestion/
     dismiss<X>Suggestion pair that applies one. The SoA strip, the
     framework tab counts and the sidebar badge all read this, so they
     can never disagree about what is pending — the suggestions used to
     be reachable ONLY by clicking through every framework tab in turn,
     with nothing anywhere saying which tabs had anything waiting. */
  var SUGGESTION_SOURCES = {
    essential8: { action: 'E8', key: 'e8Proposed' },
    is18: { action: 'Is18', key: 'is18Proposed' },
    rffr: { action: 'Rffr', key: 'rffrProposed' },
    iso42001: { action: 'Iso42001', key: 'iso42001Proposed' },
    iso27701: { action: 'Iso27701', key: 'iso27701Proposed' },
    soc2: { action: 'Soc2', key: 'soc2Proposed' },
    nistcsf: { action: 'NistCsf', key: 'nistcsfProposed' },
    iso27001: { action: 'Iso27001', key: 'iso27001Proposed' }
  };
  function suggestionSourceFor(fw) {
    var src = SUGGESTION_SOURCES[fw];
    if (!src) return null;
    return { action: src.action, key: src.key, list: S[src.key] || [] };
  }
  function pendingSuggestions(fw) { var s = suggestionSourceFor(fw); return s ? s.list.length : 0; }
  function totalPendingSuggestions() {
    return entitledFrameworks().reduce(function (n, fw) { return n + pendingSuggestions(fw); }, 0);
  }
  /* A suggestion that moves a control BACKWARDS (Implemented -> Not
     started, say) is a materially different act from one that records
     progress: confirming it erases a practitioner's own attestation in
     the register an auditor reads. Both used to render identically —
     same gold primary button, direction legible only in the body text —
     which is exactly how a regression gets applied by muscle memory
     halfway down a list of eleven. */
  var SUGGESTION_ST_RANK = { 'Not started': 0, 'In progress': 1, 'Implemented': 2 };
  function isSuggestionDowngrade(p) {
    var from = SUGGESTION_ST_RANK[p && p.from], to = SUGGESTION_ST_RANK[p && p.to];
    return typeof from === 'number' && typeof to === 'number' && to < from;
  }

  /* Creates the risk + treatment actions for one proposed scan finding
     and records the audit trail — the shared core of App.approve() and
     App.approveAllProposed(), so approving a queue in bulk produces
     exactly what approving each card individually would have. Returns
     { rid, actIds } on success, null if the write failed (already
     warned). Deliberately does NOT toast or re-render: the caller owns
     both, which is what lets the bulk path show one summary instead of
     a dozen toasts that overwrite each other. */
  async function approveProposedTemplate(tpl) {
    var t = TPL[tpl];
    if (!t) return null;
    var maxR = S.risks.reduce(function (m, r) { var n = parseInt(String(r.id).replace(/\D/g, ''), 10) || 0; return Math.max(m, n); }, 0);
    var maxA = S.actions.reduce(function (m, a) { var n = parseInt(String(a.id).replace(/\D/g, ''), 10) || 0; return Math.max(m, n); }, 0);
    var rid = 'R-' + String(maxR + 1).padStart(3, '0');
    var owner = (Graph.getAccount() && Graph.getAccount().name) || 'Practitioner';
    var actIds = t.actions.map(function (_, i) { return 'ACT-' + String(maxA + 1 + i).padStart(3, '0'); });
    try {
      var newRisk = { id: rid, title: t.risk.title, cat: t.risk.cat, src: 'Posture scan', L: t.risk.L, I: t.risk.I, controls: t.risk.controls, owner: owner, status: 'Open', treat: 'Mitigate', actions: actIds, tpl: tpl };
      await Store.addRisk(newRisk);
      for (var i = 0; i < t.actions.length; i++) {
        var a = t.actions[i];
        await Store.addAction({ id: actIds[i], title: a.t, risk: rid, control: a.control, pr: a.pr, owner: owner, due: daysFrom(a.days), status: 'Open', src: 'Posture scan' });
      }
      S.handledTpl.push(tpl);
      S.proposed = S.proposed.filter(function (p) { return p !== tpl; });
      delete _riskInsightCache[tpl];
      log('Risk <b>' + rid + '</b> approved into register from posture scan, with ' + actIds.length + ' action(s) assigned.');
      audit('Risk approved from scan finding', 'Risk', rid, '(proposed finding: ' + tpl + ')', 'Open — ' + actIds.length + ' action(s) created');
      return { rid: rid, actIds: actIds };
    } catch (e) { warn(e); return null; }
  }

  /* Applies one suggested status to its control and records the audit
     entry — the shared core of App.confirm<X>Suggestion() and the
     confirm-all bulk action, so a bulk confirm can never diverge from
     what confirming each row individually would have done. */
  async function applySuggestedStatus(fw, p) {
    var c = S.controls.find(function (x) { return x.fw === fw && x.id === p.code; });
    if (!c) return false;
    var prevSt = c.st;
    c.st = p.to;
    try { await Store.updateControl(c); } catch (e) { warn(e); return false; }
    audit('Control status changed', 'Control', fw + '|' + p.code, prevSt, p.to + ' (scan-suggested, practitioner-confirmed)');
    return true;
  }

  function renderProposed() {
    var w = document.getElementById('proposedWrap');
    if (!S.proposed.length) {
      w.innerHTML = S.lastResults ? '<div class="card" style="color:var(--paper-dim);font-size:13px">No new findings require risk treatment. Existing register covers current posture.</div>' : '';
      return;
    }
    var aiOn = !!(S.entitlements && S.entitlements.ai);
    /* Bulk bar: a single scan can propose a dozen findings, and every one
       of them used to need its own two-button decision with no way to
       clear the queue in one go. */
    var bulkBar = READONLY || S.proposed.length < 2 ? '' :
      '<div class="bulk-bar">' +
        '<span class="bulk-count">' + S.proposed.length + ' awaiting a decision</span>' +
        '<button class="btn sm" data-action="App.approveAllProposed">Approve all ' + S.proposed.length + '</button> ' +
        '<button class="btn ghost sm" data-action="App.dismissAllProposed">Dismiss all</button>' +
      '</div>';
    w.innerHTML = '<div class="card"><h3>Proposed for the register — practitioner approval required</h3>' + bulkBar + S.proposed.map(function (p) {
      var t = TPL[p];
      var insightBtn = aiOn ? '<button class="btn ghost sm" data-action="App.aiInsightProposed" data-id="' + esc(p) + '">AI insight</button> ' : '';
      var cached = _riskInsightCache[p];
      var insightBlock = cached ? '<div class="card" style="margin-top:10px;font-size:12.5px"><div class="chip st-Intreatment" style="margin-bottom:6px">' + esc(window.CheckpointAI ? window.CheckpointAI.DISCLAIMER : '') + '</div>' + escAiText(cached) + '</div>' : '';
      return '<div class="proposed-card"><h4>' + esc(t.risk.title) + '</h4>' +
        '<div class="meta">Inherent <b>' + t.risk.L + ' × ' + t.risk.I + ' — ' + band(t.risk.L * t.risk.I) + '</b> · Controls <b>' + t.risk.controls.join(', ') + '</b> · ' + t.actions.length + ' remediation action' + (t.actions.length > 1 ? 's' : '') + ' will be created and assigned</div>' +
        '<button class="btn sm" data-action="App.approve" data-id="' + p + '">Approve → register</button> ' +
        '<button class="btn ghost sm" data-action="App.dismiss" data-id="' + p + '">Dismiss</button> ' + insightBtn +
        '<div id="riskInsight-' + esc(p) + '">' + insightBlock + '</div></div>';
    }).join('') + '</div>';
  }

  function renderRisks() {
    renderResidualHeatmapInto('riskHeat', 'riskHeatLegend');
    var f = window._riskF || 'All';
    /* 'HighCritical' is a synthetic filter value, never one of the pills'
       own data-id — it exists only so a drill-down link (Dashboard/Board
       view's "High / critical risks" tile) can land here pre-filtered to
       both bands at once, matching what that tile actually counts. Both
       the Critical and High pills show as active for it, and clicking
       either one afterwards narrows to that single band as normal. */
    document.getElementById('riskFilters').innerHTML = ['All', 'Critical', 'High', 'Medium', 'Low'].map(function (x) {
      var on = f === x || (f === 'HighCritical' && (x === 'Critical' || x === 'High'));
      return '<button class="f-pill' + (on ? ' on' : '') + '" aria-pressed="' + (on ? 'true' : 'false') + '" data-action="App.filterRisk" data-id="' + x + '">' + x + '</button>';
    }).join('');
    var cellFilter = window._riskCellFilter;
    var cellChipEl = document.getElementById('riskCellFilterChip');
    if (cellChipEl) {
      cellChipEl.innerHTML = cellFilter
        ? '<span class="feed-filter-chip">Likelihood ' + cellFilter.L + ' × Impact ' + cellFilter.I + ' only<button type="button" data-action="App.clearRiskCellFilter" aria-label="Clear heatmap cell filter">' + icon('close') + '</button></span>'
        : '';
    }
    var rows = S.risks.filter(function (r) {
      var q = residual(r);
      if (cellFilter) return q.L === cellFilter.L && q.I === cellFilter.I;
      if (f === 'All') return true;
      var rb = band(q.L * q.I);
      if (f === 'HighCritical') return rb === 'Critical' || rb === 'High';
      return rb === f;
    }).map(function (r) {
      var q = residual(r), ib = band(r.L * r.I), rb = band(q.L * q.I);
      return '<tr data-id="' + r.id + '" data-action="App.openRisk"><td class="id-t"><button class="lnk" data-action="App.openRisk" data-id="' + r.id + '">' + r.id + '</button></td><td style="color:var(--paper)">' + esc(r.title) + '</td><td>' + esc(r.cat) + '</td><td class="src">' + esc(r.src) + '</td>' +
        '<td><span class="chip sev-' + ib + '">' + (r.L * r.I) + ' ' + ib + '</span></td><td><span class="chip sev-' + rb + '">' + (q.L * q.I) + ' ' + rb + '</span></td>' +
        '<td>' + esc(r.owner) + '</td><td><span class="chip st-' + r.status.replace(/ /g, '') + '">' + r.status + '</span></td></tr>';
    }).join('');
    var riskRowsEl = document.getElementById('riskRows');
    var emptyText = cellFilter ? 'No open risks scored exactly this way. Try a nearby cell, or clear the filter above.' : 'No risks in this band. The register builds as scans are approved and workshops are captured.';
    riskRowsEl.innerHTML = rows || emptyState({ kind: 'shield', asRow: true, colspan: 8, text: emptyText, cta: { label: '+ Add risk', action: 'App.toggleAddRisk' } });
    revealRows(riskRowsEl);
  }

  var ACTION_TYPES = ['Action', 'Non-conformity (Major)', 'Non-conformity (Minor)', 'Observation'];
  function typeCls(t) {
    if (t === 'Non-conformity (Major)') return 'sev-Critical';
    if (t === 'Non-conformity (Minor)') return 'sev-Medium';
    if (t === 'Observation') return 'sev-Low';
    return 'st-Notstarted';
  }
  /* Small CAPA-progress line under a nonconformity's type chip — the
     single next thing owed on the corrective-action loop, or "complete".
     Nothing for a plain Action/Observation. */
  function capaBadge(a) {
    var st = window.CheckpointLib.capaStatus(a);
    if (!st.isNc) return '';
    return st.complete
      ? '<div class="src" style="color:var(--pass);margin-top:3px">CAPA complete ' + icon('check') + '</div>'
      : '<div class="src" style="color:var(--warn);margin-top:3px">CAPA: ' + esc(st.nextStep) + '</div>';
  }

  /* The Actions register's own dashboard strip. Three panels, each
     answering a different question, because no single one of them
     covers the register on its own:
       - KPI tiles: the headline numbers, each a drill-down into the
         table below (same .card.kpi markup and data-action pattern the
         Dashboard's own tiles use — consistent, themed, and clickable
         for free rather than a bespoke widget).
       - Due runway: where the pain is on the calendar. Always readable,
         including on a register where nothing has moved yet.
       - Status by priority: whether the work that matters is actually
         progressing. Goes flat when everything shares one status, which
         is exactly why it isn't the only panel.
     Every count here is derived live from S.actions — nothing cached,
     so it can never disagree with the table underneath it. */
  function renderActionsDashboard() {
    var today = new Date().toISOString().slice(0, 10);
    var live = S.actions.filter(function (a) { return a.status !== 'Done' && a.status !== 'Cancelled'; });
    var od = live.filter(overdue);
    var b1 = od.filter(function (a) { return overdueDays(a) <= 7; }).length;
    var b2 = od.filter(function (a) { var d = overdueDays(a); return d > 7 && d <= 30; }).length;
    var b3 = od.filter(function (a) { return overdueDays(a) > 30; }).length;
    var dueSoon = live.filter(function (a) {
      if (!a.due || a.due < today) return false;
      return Math.floor((new Date(a.due) - new Date(today)) / 86400000) <= 7;
    }).length;
    /* "Recently closed" needs a completion date, and an action only
       carries its due date — so this counts Done actions whose due date
       fell in the last 30 days, and says "due" rather than "closed" in
       the caption so the tile never claims more precision than the data
       actually supports. */
    var closedRecent = S.actions.filter(function (a) {
      if (a.status !== 'Done' || !a.due) return false;
      var d = Math.floor((new Date(today) - new Date(a.due)) / 86400000);
      return d >= 0 && d <= 30;
    }).length;
    var noOwner = live.filter(function (a) { return !a.owner || !String(a.owner).trim() || a.owner === 'Unassigned'; }).length;

    var kpiEl = document.getElementById('actKpiRow');
    if (kpiEl) {
      kpiEl.innerHTML =
        '<div class="card kpi" data-action="App.goActionsFilter" data-id="Open"><div class="kpi-num"><b data-count="' + live.length + '">' + live.length + '</b></div><span>Open actions</span><div class="sub">' + (noOwner ? noOwner + ' with no owner assigned' : 'every one has an owner') + '</div></div>' +
        '<div class="card kpi" data-action="App.goActionsFilter" data-id="Overdue"><div class="kpi-num"><b data-count="' + od.length + '" style="color:' + (od.length ? 'var(--fail)' : 'var(--gold-light)') + '">' + od.length + '</b></div><span>Overdue</span><div class="sub">' + (od.length ? '0–7d: ' + b1 + ' · 8–30d: ' + b2 + ' · 30+d: ' + b3 : 'nothing past its due date') + '</div></div>' +
        '<div class="card kpi" data-action="App.goActionsFilter" data-id="Open"><div class="kpi-num"><b data-count="' + dueSoon + '" style="color:' + (dueSoon ? 'var(--warn)' : 'var(--gold-light)') + '">' + dueSoon + '</b></div><span>Due within 7 days</span><div class="sub">' + (dueSoon ? 'still time to close these cleanly' : 'nothing falling due this week') + '</div></div>' +
        '<div class="card kpi" data-action="App.goActionsFilter" data-id="Done"><div class="kpi-num"><b data-count="' + closedRecent + '">' + closedRecent + '</b></div><span>Completed</span><div class="sub">' + (closedRecent ? 'due in the last 30 days, now done' : 'none due in the last 30 days') + '</div></div>';
      runCountUps(kpiEl);
    }

    var runwayEl = document.getElementById('actRunway');
    if (runwayEl) runwayEl.innerHTML = RC.hbars(actionDueRunway(), { palette: 'app' });

    var breakdownEl = document.getElementById('actBreakdown');
    if (breakdownEl) breakdownEl.innerHTML = RC.stackedBars(actionPriorityBreakdown(), ACTION_STATUS_LEGEND, { palette: 'app', showValues: true, scaleByCount: true });
  }

  function renderActions() {
    renderActionsDashboard();
    var f = window._actF || 'Open';
    var tf = window._actTypeF || 'All';
    document.getElementById('actFilters').innerHTML = ['Open', 'Overdue', 'Done', 'All'].map(function (x) {
      return '<button class="f-pill' + (f === x ? ' on' : '') + '" aria-pressed="' + (f === x ? 'true' : 'false') + '" data-action="App.filterAct" data-id="' + x + '">' + x + '</button>';
    }).join('');
    document.getElementById('actTypeFilters').innerHTML = ['All'].concat(ACTION_TYPES).map(function (x) {
      return '<button class="f-pill' + (tf === x ? ' on' : '') + '" aria-pressed="' + (tf === x ? 'true' : 'false') + '" data-action="App.filterActType" data-id="' + x + '">' + x + '</button>';
    }).join('');
    var updateCounts = {};
    (S.actionUpdates || []).forEach(function (u) { updateCounts[u.action] = (updateCounts[u.action] || 0) + 1; });
    var rows = S.actions.filter(function (a) {
      if (tf !== 'All' && (a.type || 'Action') !== tf) return false;
      if (f === 'All') return true; if (f === 'Done') return a.status === 'Done';
      if (f === 'Overdue') return overdue(a); return a.status !== 'Done';
    }).map(function (a) {
      var od = overdue(a);
      var days = overdueDays(a);
      var type = a.type || 'Action';
      var evidenceCell = (a.evidenceUrl && isSafeUrl(a.evidenceUrl))
        ? '<a href="' + esc(a.evidenceUrl) + '" target="_blank" rel="noopener" class="evidence-link">Evidence ' + icon('external') + '</a>'
        : '<button class="btn ghost sm" data-action="App.setActionEvidence" data-id="' + a.id + '">Link</button>';
      var capa = window.CheckpointLib.capaStatus(a);
      var updCount = updateCounts[a.id] || 0;
      return '<tr data-id="' + a.id + '" data-action="App.openAction"><td class="id-t"><button class="lnk" data-action="App.openAction" data-id="' + a.id + '">' + a.id + '</button>' +
        (updCount ? '<div class="src">' + updCount + ' update' + (updCount > 1 ? 's' : '') + '</div>' : '') +
        '</td><td class="act-title" style="color:var(--paper)">' + esc(a.title) + '</td>' +
        '<td><span class="chip ' + typeCls(type) + '">' + esc(type) + '</span>' + capaBadge(a) + '</td>' +
        '<td class="id-t">' + esc(a.risk || '—') + '</td><td class="id-t">' + esc(a.control || '—') + '</td>' +
        '<td><span class="chip sev-' + (a.pr === 'Critical' ? 'Critical' : a.pr) + '">' + a.pr + '</span></td><td>' + esc(a.owner) + '</td>' +
        '<td style="color:' + (od ? 'var(--fail)' : 'inherit') + '">' + fmtDate(a.due) + (od ? ' ' + icon('flag') + ' ' + days + 'd' : '') + '</td>' +
        '<td><span class="chip st-' + a.status.replace(/ /g, '') + '">' + a.status + '</span></td>' +
        '<td>' + evidenceCell + '</td>' +
        '<td style="white-space:nowrap">' +
        (a.status !== 'Done' ? '<button class="btn sm" data-action="App.complete" data-id="' + a.id + '">Complete</button> ' : '<span class="src" style="margin-right:6px">Done ' + icon('check') + '</span>') +
        (capa.isNc ? '<button class="btn ghost sm" data-action="App.recordCapa" data-id="' + a.id + '">Corrective action</button> ' : '') +
        '<button class="btn ghost sm" data-action="App.editAction" data-id="' + a.id + '">Edit</button> ' +
        '<button class="btn ghost sm" data-action="App.deleteAction" data-id="' + a.id + '">Delete</button>' +
        '</td></tr>';
    }).join('');
    var actRowsEl = document.getElementById('actRows');
    actRowsEl.innerHTML = rows || emptyState({ kind: 'shield', asRow: true, colspan: 11, text: 'Nothing here. Actions are created when scan findings are approved, risks are treated, or added manually above.', cta: { label: '+ Add action / finding', action: 'App.toggleAddAction' } });
    revealRows(actRowsEl);
  }

  /* ── Shared option sets + risk/action lifecycle helpers ──
     Used by the manual create/edit/close flows for risks and actions so
     the automation (residual recalculation, auto-close) keeps working
     whether an action was raised by a scan or by hand. */
  var LIKELIHOOD_OPTS = [{ value: 1, label: '1 — Rare' }, { value: 2, label: '2 — Unlikely' }, { value: 3, label: '3 — Possible' }, { value: 4, label: '4 — Likely' }, { value: 5, label: '5 — Almost certain' }];
  var IMPACT_OPTS = [{ value: 1, label: '1 — Negligible' }, { value: 2, label: '2 — Minor' }, { value: 3, label: '3 — Moderate' }, { value: 4, label: '4 — Major' }, { value: 5, label: '5 — Severe' }];
  var TREATMENT_OPTS = ['Mitigate', 'Accept', 'Transfer', 'Avoid'];
  var RISK_STATUS_OPTS = ['Open', 'In treatment', 'Monitored', 'Closed'];
  var ACTION_STATUS_OPTS = ['Open', 'In progress', 'Done', 'Cancelled'];

  /* Options for a "link to risk" <select> — open risks first, plus the
     currently-linked one even if it's since been closed (so editing an
     action never silently drops a link to a closed risk). */
  function riskLinkOptions(currentId) {
    var opts = [{ value: '', label: '— No linked risk —' }];
    var seen = {};
    (S.risks || []).forEach(function (r) {
      if (r.status === 'Closed' && r.id !== currentId) return;
      seen[r.id] = true;
      opts.push({ value: r.id, label: r.id + ' — ' + (r.title.length > 60 ? r.title.slice(0, 60) + '…' : r.title) });
    });
    if (currentId && !seen[currentId]) {
      var r = (S.risks || []).find(function (x) { return x.id === currentId; });
      if (r) opts.push({ value: r.id, label: r.id + ' — ' + r.title + ' (closed)' });
    }
    return opts;
  }

  function fillSelect(el, options, value) {
    if (!el) return;
    el.innerHTML = options.map(function (o) {
      var val = (o && typeof o === 'object') ? o.value : o;
      var lab = (o && typeof o === 'object') ? o.label : o;
      return '<option value="' + esc(String(val)) + '"' + (String(val) === String(value) ? ' selected' : '') + '>' + esc(String(lab)) + '</option>';
    }).join('');
  }

  /* Recompute a risk's status from its linked actions — the same
     promotion the scan-driven complete() path always did, now shared so
     manual edits/deletes keep a risk's status honest. Never overrides a
     deliberately Closed risk; Done AND Cancelled both count as resolved
     (a cancelled treatment action shouldn't hold a risk open forever). */
  function recomputeRiskStatus(r) {
    if (!r || r.status === 'Closed') return;
    var linked = (r.actions || []).map(function (id) { return S.actions.find(function (a) { return a.id === id; }); }).filter(Boolean);
    if (!linked.length) return;
    var resolved = linked.every(function (a) { return a.status === 'Done' || a.status === 'Cancelled'; });
    r.status = resolved ? 'Monitored' : 'In treatment';
  }

  /* Moves an action's risk link, keeping BOTH sides of the relationship
     in sync (risk.actions ↔ action.risk) and persisting the old risk.
     The caller sets the rest of the action's fields, then recomputes +
     persists the CURRENT linked risk once, after this returns. */
  async function setActionRiskLink(a, newRiskId) {
    var oldRiskId = a.risk || '';
    newRiskId = newRiskId || '';
    if (oldRiskId !== newRiskId && oldRiskId) {
      var oldR = (S.risks || []).find(function (r) { return r.id === oldRiskId; });
      if (oldR && oldR.actions) {
        oldR.actions = oldR.actions.filter(function (x) { return x !== a.id; });
        recomputeRiskStatus(oldR);
        try { await Store.updateRisk(oldR); } catch (e) { warn(e); }
      }
    }
    a.risk = newRiskId;
    if (newRiskId) {
      var newR = (S.risks || []).find(function (r) { return r.id === newRiskId; });
      if (newR) {
        newR.actions = newR.actions || [];
        if (newR.actions.indexOf(a.id) === -1) newR.actions.push(a.id);
      }
    }
  }

  function nextActionUpdateSeq() {
    var max = 0;
    (S.actionUpdates || []).forEach(function (u) {
      var m = /^UPD-(\d+)$/.exec(u.id || '');
      if (m) max = Math.max(max, Number(m[1]));
    });
    return max + 1;
  }

  /* Every progress entry against an action — completing it, recording a
     status change, just adding a note — goes through here, so the
     chronological log (App.openAction()'s drawer, the CSV export) can
     never miss one because a caller wrote to the action directly
     instead. Writes the append-only ActionUpdates row FIRST: if that
     fails, nothing else does either, and the action itself is left
     exactly as it was rather than showing a status the log doesn't back
     up. `status` is optional — a pure progress note with no status
     change is a real, common case (e.g. "still waiting on the vendor")
     and must not force one.

     Returns the update record on success, null on failure (already
     warned) — callers decide what to do next (toast text, whether to
     also touch a linked risk) rather than this doing it uniformly,
     since completing an action's toast differs from a plain note's. */
  async function recordActionUpdate(a, opts) {
    var note = (opts && opts.note || '').trim();
    var evidenceUrl = (opts && opts.evidenceUrl || '').trim();
    var newStatus = opts && opts.status;
    var who = (Graph.getAccount() && Graph.getAccount().name) || (Store.kind === 'demo' ? 'Demo user' : 'Practitioner');
    var today = new Date().toISOString().slice(0, 10);
    var upd = {
      id: 'UPD-' + String(nextActionUpdateSeq()).padStart(4, '0'),
      action: a.id, date: today, note: note, evidenceUrl: evidenceUrl,
      status: newStatus || a.status, author: who
    };
    try {
      await Store.addActionUpdate(upd);
    } catch (e) { warn(e); return null; }

    var prevStatus = a.status;
    if (newStatus && newStatus !== a.status) a.status = newStatus;
    if (evidenceUrl) a.evidenceUrl = evidenceUrl;
    try { await Store.updateAction(a); } catch (e) { warn(e); }
    audit('Action progress recorded', 'Action', a.id, prevStatus, (newStatus && newStatus !== prevStatus ? newStatus + ': ' : '') + (note || '(status change only)'));
    return upd;
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

  /* Same idea as syncVendorCalendar() above, for an approved policy's
     next-review date. Called on approval and whenever the register's
     review date is edited, so the review shows up as a dated ISMS
     activity on the Compliance calendar and the Dashboard's governance
     card without either of them needing document-specific logic.

     Matched by title rather than a stored reference id: the document
     library row has no spare column to hold one, and a policy's
     filename is already the identity everything else in this app keys
     documents on (the audit log, the draft/approved fallback). One
     calendar entry per policy, updated in place, never duplicated. */
  async function syncPolicyReviewCalendar(docName, nextReview, owner) {
    if (!docName || !nextReview) return;
    var title = 'Policy review — ' + docName;
    var cal = (S.calendar || []).find(function (c) { return c.title === title && c.category === 'Policy review'; });
    if (cal) {
      if (cal.nextDue === nextReview && cal.status === 'Active') return;
      cal.nextDue = nextReview;
      cal.status = 'Active';
      try { await Store.updateCalendarItem(cal); } catch (e) { warn(e); }
      return;
    }
    var maxC = (S.calendar || []).reduce(function (m, c) { var n = parseInt(String(c.id).replace(/\D/g, ''), 10) || 0; return Math.max(m, n); }, 0);
    try {
      await Store.addCalendarItem({
        id: 'CAL-' + String(maxC + 1).padStart(3, '0'), title: title,
        category: 'Policy review', freq: 'Annual', nextDue: nextReview,
        lastCompleted: '', owner: owner || '', notes: 'Auto-linked to the document control register', status: 'Active'
      });
    } catch (e) { warn(e); }
  }

  var VENDOR_CRITICALITIES = ['Critical', 'High', 'Medium', 'Low'];
  var VENDOR_REVIEW_STATUSES = ['Not started', 'In progress', 'Reviewed'];
  var VENDOR_STATUS_LEGEND = [
    { label: 'Reviewed', color: RPAL.good },
    { label: 'In progress', color: RPAL.warn },
    { label: 'Not started', color: RPAL.neutral, hatch: true }
  ];

  /* One stacked-bar row per criticality (most sensitive first) — same
     "is the register actually moving, or just sitting there" question
     actionPriorityBreakdown() answers for Actions, applied to vendor
     review status. A Critical vendor still showing Not started is the
     row that matters most, so criticality (not review status) is what
     groups the chart.

     Buckets via an explicit else (a vendor record can carry a
     reviewStatus of 'Overdue' — set directly rather than derived from
     nextReviewDue — which isn't one of VENDOR_REVIEW_STATUSES' three
     values), same defensive reasoning as controlStatusCounts()'s own
     else branch: an unrecognised status must still land somewhere,
     never silently vanish from the chart's total. */
  function vendorCriticalityBreakdown() {
    return VENDOR_CRITICALITIES.map(function (crit) {
      var rows = (S.vendors || []).filter(function (v) { return v.criticality === crit; });
      var reviewed = 0, inProgress = 0, notStarted = 0;
      rows.forEach(function (v) {
        if (v.reviewStatus === 'Reviewed') reviewed++;
        else if (v.reviewStatus === 'In progress') inProgress++;
        else notStarted++;
      });
      return { label: crit, values: [reviewed, inProgress, notStarted] };
    });
  }

  /* Same "KPI tiles + one chart" dashboard pattern as Risk, Actions and
     the SoA — see renderSoaDashboard()'s own header comment. Every count
     here is derived live from S.vendors, so it can never disagree with
     the table underneath it. */
  function renderVendorsDashboard() {
    var kpiEl = document.getElementById('vendorKpiRow');
    if (kpiEl) {
      var vendors = S.vendors || [];
      var od = vendors.filter(vendorOverdue);
      var critHigh = vendors.filter(function (v) { return v.criticality === 'Critical' || v.criticality === 'High'; }).length;
      var unclassified = vendors.filter(function (v) { return !v.dataCategories || !v.dataCategories.length; }).length;
      kpiEl.innerHTML =
        '<div class="card kpi"><div class="kpi-num"><b data-count="' + vendors.length + '">' + vendors.length + '</b></div><span>Total vendors</span></div>' +
        '<div class="card kpi" data-action="App.filterVendorStatus" data-id="Overdue"><div class="kpi-num"><b data-count="' + od.length + '" style="color:' + (od.length ? 'var(--fail)' : 'var(--gold-light)') + '">' + od.length + '</b></div><span>Overdue reviews</span></div>' +
        '<div class="card kpi" data-action="App.filterVendorCrit" data-id="Critical"><div class="kpi-num"><b data-count="' + critHigh + '">' + critHigh + '</b></div><span>Critical / High criticality</span></div>' +
        '<div class="card kpi"><div class="kpi-num"><b data-count="' + unclassified + '" style="color:' + (unclassified ? 'var(--warn)' : 'var(--gold-light)') + '">' + unclassified + '</b></div><span>Data access not classified</span><div class="sub">' + (unclassified ? 'an auditor checks this first' : 'every vendor classified') + '</div></div>';
      runCountUps(kpiEl);
    }
    var chartEl = document.getElementById('vendorReviewChart');
    if (chartEl) chartEl.innerHTML = RC.stackedBars(vendorCriticalityBreakdown(), VENDOR_STATUS_LEGEND, { palette: 'app', showValues: true, scaleByCount: true });
  }

  function renderVendors() {
    var wrap = document.getElementById('vendorRows');
    if (!wrap) return;
    renderVendorsDashboard();
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
        '<td style="color:' + (od ? 'var(--fail)' : 'inherit') + '">' + (v.nextReviewDue ? fmtDate(v.nextReviewDue) : '—') + (od ? ' ' + icon('flag') : '') + '</td>' +
        '<td class="src">' + esc(v.certifications || '—') + '</td><td>' + esc(v.owner) + '</td>' +
        '<td><span class="chip">' + esc(v.questionnaireStatus || 'Not sent') + '</span></td></tr>';
    }).join('') : emptyState({ kind: 'building', asRow: true, colspan: 7, text: 'No vendors match this filter. Add one above.', cta: { label: '+ Add vendor', action: 'App.toggleAddVendor' } });
    revealRows(wrap);
  }

  var AI_RISK_TIERS = ['Prohibited', 'High', 'Limited', 'Minimal'];
  var AI_IMPACT_STATUSES = ['Not started', 'In progress', 'Completed'];
  var AI_IMPACT_LEGEND = [
    { label: 'Completed', color: RPAL.good },
    { label: 'In progress', color: RPAL.warn },
    { label: 'Not started', color: RPAL.neutral, hatch: true }
  ];

  /* One stacked-bar row per risk tier (most sensitive first) — same
     shape as vendorCriticalityBreakdown() above: a Prohibited/High-tier
     system still sitting at Not started is the row an assessor asks
     about first, so risk tier (not assessment status) groups the chart. */
  function aiRiskTierBreakdown() {
    return AI_RISK_TIERS.map(function (tier) {
      var rows = (S.aiSystems || []).filter(function (a) { return a.riskTier === tier; });
      var completed = 0, inProgress = 0, notStarted = 0;
      rows.forEach(function (a) {
        if (a.impactAssessmentStatus === 'Completed') completed++;
        else if (a.impactAssessmentStatus === 'In progress') inProgress++;
        else notStarted++;
      });
      return { label: tier, values: [completed, inProgress, notStarted] };
    });
  }

  /* Same "KPI tiles + one chart" dashboard pattern as Vendors above. */
  function renderAiSystemsDashboard() {
    var kpiEl = document.getElementById('aiKpiRow');
    if (kpiEl) {
      var systems = S.aiSystems || [];
      var highRisk = systems.filter(function (a) { return a.riskTier === 'Prohibited' || a.riskTier === 'High'; }).length;
      var notStarted = systems.filter(function (a) { return a.impactAssessmentStatus === 'Not started'; }).length;
      var completed = systems.filter(function (a) { return a.impactAssessmentStatus === 'Completed'; }).length;
      kpiEl.innerHTML =
        '<div class="card kpi"><div class="kpi-num"><b data-count="' + systems.length + '">' + systems.length + '</b></div><span>Total AI systems</span></div>' +
        '<div class="card kpi" data-action="App.filterAiTier" data-id="High"><div class="kpi-num"><b data-count="' + highRisk + '" style="color:' + (highRisk ? 'var(--fail)' : 'var(--gold-light)') + '">' + highRisk + '</b></div><span>Prohibited / High risk tier</span></div>' +
        '<div class="card kpi" data-action="App.filterAiStatus" data-id="Not started"><div class="kpi-num"><b data-count="' + notStarted + '" style="color:' + (notStarted ? 'var(--warn)' : 'var(--gold-light)') + '">' + notStarted + '</b></div><span>Impact assessment not started</span></div>' +
        '<div class="card kpi" data-action="App.filterAiStatus" data-id="Completed"><div class="kpi-num"><b data-count="' + completed + '">' + completed + '</b></div><span>Impact assessment completed</span></div>';
      runCountUps(kpiEl);
    }
    var chartEl = document.getElementById('aiTierChart');
    if (chartEl) chartEl.innerHTML = RC.stackedBars(aiRiskTierBreakdown(), AI_IMPACT_LEGEND, { palette: 'app', showValues: true, scaleByCount: true });
  }

  /* Which ISO 42001 controls a given AI system currently evidences —
     computed live from what's actually documented on the record, never
     hand-picked by the practitioner, so it can never drift out of sync
     with the record itself. A.4.2 (resource documentation) is the one
     control every tracked system evidences merely by existing in the
     register at all; everything else requires the specific field that
     backs it to be filled in. */
  function aiControlsFor(sys) {
    var codes = ['AI.4.2'];
    if (sys.owner) codes.push('AI.3.2');
    if (sys.dataSources) codes.push('AI.7.2', 'AI.7.3');
    if (sys.humanOversight) codes.push('AI.6.2.6', 'AI.9.2');
    if (sys.impactAssessmentStatus === 'Completed') codes.push('AI.5.2', 'AI.5.3', 'AI.5.4', 'AI.5.5');
    if (sys.vendor) codes.push('AI.10.3');
    if (sys.riskTier) codes.push('AI.9.3');
    return codes;
  }

  /* Reads the EU AI Act questionnaire checkboxes straight from the DOM
     (rather than tracking state separately) so there's exactly one
     source of truth for "what's currently ticked" — the checkboxes
     themselves — same reasoning as aiControlsFor() computing live off
     the record rather than a cached value. */
  function currentAiActAnswers() {
    var answers = {};
    document.querySelectorAll('#aiActQuestions input[type=checkbox]').forEach(function (cb) {
      answers[cb.dataset.qid] = cb.checked;
    });
    return answers;
  }

  var AI_ACT_GROUPS = [
    { tier: 'Prohibited', label: 'Article 5 — prohibited practices (any one bans deployment outright)' },
    { tier: 'High', label: 'Annex III — high-risk categories' },
    { tier: 'Limited', label: 'Article 50 — transparency triggers' }
  ];

  /* Builds the questionnaire checkboxes fresh every time the Add/Edit AI
     system panel opens, grouped by tier, pre-ticked from whatever was
     last saved — then immediately triggers the first suggestion so the
     panel never opens showing stale or blank guidance.

     Each group is a native <details> — collapsed by default, open only
     if it already has a checked answer, so a form for a typical Minimal-
     risk system (the common case: nothing ticked anywhere) shows three
     one-line headers instead of all 19 questions at once. Native <details>
     rather than a hand-rolled toggle: correct ARIA semantics and keyboard
     operability for free, and the open/closed state is real DOM state a
     re-render never has to track or clobber. */
  function renderAiActQuestions(existingAnswers) {
    var wrap = document.getElementById('aiActQuestions');
    if (!wrap) return;
    wrap.innerHTML = AI_ACT_GROUPS.map(function (g) {
      var qs = window.CheckpointLib.AI_ACT_QUESTIONS.filter(function (q) { return q.tier === g.tier; });
      var checkedCount = qs.filter(function (q) { return existingAnswers && existingAnswers[q.id]; }).length;
      return '<details class="aiact-group"' + (checkedCount ? ' open' : '') + ' style="margin-bottom:6px">' +
        '<summary style="cursor:pointer;font-size:11px;font-weight:700;color:var(--paper-dim);text-transform:uppercase;letter-spacing:.03em;padding:4px 0">' +
        esc(g.label) + (checkedCount ? ' <span style="color:var(--gold-light);text-transform:none;letter-spacing:normal">— ' + checkedCount + ' checked</span>' : '') +
        '</summary><div style="padding-top:2px">' +
        qs.map(function (q) {
          var checked = existingAnswers && existingAnswers[q.id] ? ' checked' : '';
          return '<label style="display:flex;gap:8px;align-items:flex-start;font-size:12.5px;color:var(--paper-dim);margin-bottom:4px;cursor:pointer">' +
            '<input type="checkbox" data-change-action="App.recomputeAiActSuggestion" data-qid="' + q.id + '" style="margin-top:2px"' + checked + '>' +
            '<span><b style="color:var(--paper)">' + esc(q.clause) + '</b> — ' + esc(q.label) + '</span></label>';
        }).join('') + '</div></details>';
    }).join('');
    App.recomputeAiActSuggestion();
  }

  function renderAiSystems() {
    var wrap = document.getElementById('aiRows');
    if (!wrap) return;
    renderAiSystemsDashboard();
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
    }).join('') : emptyState({
      kind: 'shield', asRow: true, colspan: 7,
      text: 'No AI systems tracked yet. ISO 42001 expects an inventory of AI systems in scope — add one, or run a posture scan to discover candidates from Entra enterprise apps.',
      cta: { label: '+ Add AI system', action: 'App.toggleAddAiSystem' }
    });

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
    var rv = controlReviewStatus(c);
    var stale = rv.due;
    var verifiedCell = !c.app ? '—'
      : c.st !== 'Implemented' ? '<span class="src">—</span>'
      : c.verified ? '<span class="' + (stale ? 'verify-stale' : 'verify-ok') + '">' + fmtDate(c.verified) + (stale ? ' ' + icon('flag') + ' overdue' : '') + '</span>' + (c.verifiedBy ? '<div class="src">by ' + esc(c.verifiedBy) + '</div>' : '') + '<button class="btn ghost sm" style="margin-top:4px" data-action="App.verifyControl" data-id="' + key + '">Re-verify</button>'
      : '<button class="btn sm" data-action="App.verifyControl" data-id="' + key + '">Verify now</button>';
    var isAutoEvidence = c.evidenceUrl && c.verifiedBy === AUTO_EVIDENCE_TAG;
    var evidenceCell = (c.evidenceUrl && isSafeUrl(c.evidenceUrl))
      ? '<a href="' + esc(c.evidenceUrl) + '" target="_blank" rel="noopener" class="evidence-link">Evidence ' + icon('external') + '</a>' + (isAutoEvidence ? '<div class="src">Auto-captured ' + fmtDate(c.verified) + '</div>' : '') + '<br><button class="btn ghost sm" style="margin-top:4px" data-action="App.setControlEvidence" data-id="' + key + '">Edit</button>'
      : '<button class="btn ghost sm" data-action="App.setControlEvidence" data-id="' + key + '">Link evidence</button>';
    /* DISP ICT controls carry an ISM chapter reference, looked up
       definitionally (same treatment as maturity level/parent above) —
       shown under the title so an IRAP assessor can trace straight to
       the relevant ISM guideline without a dedicated table column. */
    var ismLine = (c.fw === 'dispirap' && dispIsmChapterOfCode(c.id)) ? '<div class="src" style="margin-top:2px">ISM: ' + esc(dispIsmChapterOfCode(c.id)) + '</div>' : '';
    /* An excluded control with no recorded justification is exactly the
       gap a certification auditor tests first (ISO 27001 clause
       6.1.3(d) requires it explicitly) — flagged inline, not just in
       the Auditor Pack's exclusion summary, so it's visible the moment
       a control is marked Not Applicable rather than discovered for
       the first time while generating a report for the auditor. */
    var justificationLine = !c.app
      ? (c.just
          ? '<div class="src" style="margin-top:4px">Justification: ' + esc(c.just) + ' <button class="btn ghost sm" style="margin-left:4px" data-action="App.setControlJustification" data-id="' + key + '">Edit</button></div>'
          : '<div style="margin-top:4px"><span class="verify-stale">' + icon('flag') + ' No justification recorded</span> <button class="btn sm" data-action="App.setControlJustification" data-id="' + key + '">Add justification</button></div>')
      : '';
    return '<tr data-id="' + key + '"><td class="id-t"><button class="lnk" data-action="App.openControlGuidance" data-id="' + key + '">' + c.id + '</button></td><td style="color:var(--paper)">' + esc(c.t) + ismLine + justificationLine + '</td>' +
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

  /* Every recorded scan's OWN dated per-check results, decoded from the
     Detail JSON every Scans list item already carries (see
     store.js's reconcileControls-adjacent scan loader — `detail` is
     preserved on every entry, not just the latest one). This is the
     entire raw material CheckpointLib.operatingEffectiveness() needs;
     nothing about how scans are captured or stored changes to support
     Type II — it was already all there, just never re-read this way.
     Parsed fresh each call rather than cached: cheap (a few dozen scans
     at most for any real tenant) and guarantees it can never go stale
     against S.scans after a new scan lands. */
  function soc2ScanHistory() {
    return (S.scans || []).map(function (s) {
      if (!s.detail) return null;
      try {
        var d = JSON.parse(s.detail);
        return d.results ? { date: s.date, results: d.results } : null;
      } catch (e) { return null; }
    }).filter(Boolean);
  }

  /* Combines every checkId that feeds a given SOC 2 control code (per
     CHECK_SOC2 — a control can have more than one, e.g. CC6.1 from both
     'mfa-all' and 'sharing') into one operating-effectiveness picture:
     the union of every observation date across all of them, and every
     exception any of them ever showed, each tagged with which check and
     its human label. Returns null for a control CHECK_SOC2 doesn't
     cover at all — the caller shows a manual-evidence prompt instead,
     since there's no scan history to summarise for a control with no
     live signal in the first place. */
  function soc2ControlEffectiveness(code, sinceDate) {
    var checkIds = Object.keys(window.CHECK_SOC2 || {}).filter(function (id) {
      return (window.CHECK_SOC2[id] || []).indexOf(code) > -1;
    });
    if (!checkIds.length) return null;
    var history = soc2ScanHistory();
    var byDate = {};
    var exceptions = [];
    var anyObservations = false;
    var anyPassed = false;
    checkIds.forEach(function (id) {
      var eff = window.CheckpointLib.operatingEffectiveness(id, history, sinceDate);
      var def = window.CHECK_DEFS.find(function (d) { return d.id === id; });
      var label = def ? def.label : id;
      if (eff.totalObservations) anyObservations = true;
      if (eff.passCount) anyPassed = true;
      eff.exceptions.forEach(function (ex) {
        exceptions.push({ date: ex.date, result: ex.result, checkLabel: label });
      });
      /* union of observation dates across every contributing check —
         not summed, since two checks observed on the same scan date
         both point at the same real-world observation, not two. */
      history.forEach(function (h) {
        if (h.results[id] !== undefined && (!sinceDate || h.date >= sinceDate)) byDate[h.date] = true;
      });
    });
    var dates = Object.keys(byDate).sort();
    exceptions.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
    /* noExceptionsFound mirrors CheckpointLib.operatingEffectiveness()'s
       own contract exactly: every REAL (non-'manual') observation in
       the window passed, and there was at least one. Aggregating on
       anyObservations alone — as this used to — reported a confident
       "N scans, no exceptions" for a control whose every observation
       came back 'manual', i.e. one with no live signal at all on any
       scan in the window (a tenant with no Secure Score data, say).
       That is an overstatement of audit evidence, in the one view
       written to be read by an auditor. A manual-only window is now
       reported as exactly what it is. */
    return {
      totalObservations: dates.length,
      firstObservedDate: dates.length ? dates[0] : null,
      lastObservedDate: dates.length ? dates[dates.length - 1] : null,
      exceptions: exceptions,
      noExceptionsFound: anyPassed && exceptions.length === 0,
      manualOnly: anyObservations && !anyPassed && exceptions.length === 0
    };
  }

  /* SOC 2 Type II SoA — same rows/columns as the normal table
     (renderSoaRow unchanged underneath every control) with one extra
     row per control summarising operating effectiveness across the
     observation window: which posture scans count as observations,
     whether any of them found an exception, and — for a control with no
     live check behind it at all (most of the COSO governance criteria,
     Processing Integrity, most Privacy) — an explicit prompt that Type
     II evidence for it has to come from somewhere else, since there's
     no scan signal this view could ever summarise. Never silently
     omits a control just because it isn't automatable; the whole point
     is surfacing exactly which controls still carry manual burden for
     this observation period and which don't. */
  function renderSoc2TypeIIRows(rows) {
    var sinceDate = (S.settings && S.settings.soc2ObservationStart) || '';
    return rows.map(function (c) {
      var base = renderSoaRow(c);
      var eff = soc2ControlEffectiveness(c.id, sinceDate);
      var summaryHtml;
      if (!eff) {
        summaryHtml = '<span class="src">No live posture signal for this control — Type II operating-effectiveness evidence has to be gathered and attested manually across the observation period.</span>';
      } else if (!eff.totalObservations) {
        summaryHtml = '<span class="src">' + (sinceDate ? 'No posture scans recorded since ' + fmtDate(sinceDate) + ' yet.' : 'No posture scans recorded yet.') + '</span>';
      } else {
        var windowLabel = eff.firstObservedDate === eff.lastObservedDate ? fmtDate(eff.firstObservedDate) : fmtDate(eff.firstObservedDate) + ' – ' + fmtDate(eff.lastObservedDate);
        if (eff.noExceptionsFound) {
          summaryHtml = '<span class="verify-ok">' + eff.totalObservations + ' scan' + (eff.totalObservations > 1 ? 's' : '') + ', no exceptions</span><div class="src">Observed ' + windowLabel + '</div>';
        } else if (eff.manualOnly) {
          summaryHtml = '<span class="verify-stale">' + eff.totalObservations + ' scan' + (eff.totalObservations > 1 ? 's' : '') + ', no live signal on any of them</span><div class="src">Observed ' + windowLabel + ' — every scan returned "manual" for the check(s) behind this control (the underlying capability wasn\'t readable), so there is no automated operating-effectiveness evidence here. Gather and attest it manually for this period.</div>';
        } else {
          summaryHtml = '<span class="verify-stale">' + eff.exceptions.length + ' exception' + (eff.exceptions.length > 1 ? 's' : '') + ' of ' + eff.totalObservations + ' scan' + (eff.totalObservations > 1 ? 's' : '') + '</span><div class="src">' +
            eff.exceptions.slice(0, 3).map(function (ex) { return fmtDate(ex.date) + ' — ' + esc(ex.checkLabel) + ' (' + ex.result + ')'; }).join('<br>') +
            (eff.exceptions.length > 3 ? '<br>+' + (eff.exceptions.length - 3) + ' more' : '') + '</div>';
        }
      }
      var summaryRow = '<tr class="soa-type2-row"><td></td><td colspan="7"><b>Type II — operating effectiveness:</b> ' + summaryHtml + '</td></tr>';
      return base + summaryRow;
    }).join('');
  }

  /* High-level visual summary for the active SoA framework tab — same
     "KPI tiles + one chart" pattern as the Risk register and Actions
     register dashboards, so a practitioner reads implementation posture
     at a glance instead of scrolling a full control table first. visRows
     is frameworkVisibleRows(fw) (every displayed row, applicable or
     not — needed for the exclusions-justification count and the theme
     chart's Not-applicable segment); app is frameworkAppRows(fw), the
     applicable-only subset readiness math already uses everywhere
     else. */
  function renderSoaDashboard(fw, visRows, app) {
    var kpiEl = document.getElementById('soaKpiRow');
    if (kpiEl) {
      /* controlStatusCounts() buckets anything that isn't literally
         'Implemented'/'In progress' into notStarted via its own "else"
         branch — safer than deriving notStarted by subtracting from
         app.length, which would silently assume every applicable
         control's status is one of exactly those two strings. */
      var counts = controlStatusCounts(visRows);
      var impl = counts.implemented, inProgress = counts.inProgress, notStarted = counts.notStarted, notApplicable = counts.notApplicable;
      var overdue = app.filter(function (c) { return controlReviewStatus(c).due; }).length;
      var unjustified = visRows.filter(function (c) { return !c.app && !c.just; }).length;
      kpiEl.innerHTML =
        '<div class="card kpi"><div class="kpi-num"><b data-count="' + impl + '">' + impl + '</b></div><span>Implemented</span><div class="sub">of ' + app.length + ' applicable controls</div></div>' +
        '<div class="card kpi"><div class="kpi-num"><b data-count="' + inProgress + '" style="color:' + (inProgress ? 'var(--warn)' : 'var(--gold-light)') + '">' + inProgress + '</b></div><span>In progress</span></div>' +
        '<div class="card kpi"><div class="kpi-num"><b data-count="' + notStarted + '">' + notStarted + '</b></div><span>Not started</span></div>' +
        '<div class="card kpi"><div class="kpi-num"><b data-count="' + notApplicable + '">' + notApplicable + '</b></div><span>Excluded (not applicable)</span></div>' +
        '<div class="card kpi"><div class="kpi-num"><b data-count="' + overdue + '" style="color:' + (overdue ? 'var(--fail)' : 'var(--gold-light)') + '">' + overdue + '</b></div><span>Overdue for review</span><div class="sub">not re-verified within cadence</div></div>' +
        '<div class="card kpi"><div class="kpi-num"><b data-count="' + unjustified + '" style="color:' + (unjustified ? 'var(--fail)' : 'var(--gold-light)') + '">' + unjustified + '</b></div><span>Exclusions missing justification</span><div class="sub">an auditor checks this first</div></div>';
      runCountUps(kpiEl);
    }

    var themeEl = document.getElementById('soaThemeChart');
    if (themeEl) themeEl.innerHTML = RC.stackedBars(themeGroupsFor(fw, visRows), CONTROL_STATUS_LEGEND, { palette: 'app', showValues: true, scaleByCount: true });
  }

  function renderSoa() {
    var entitled = entitledFrameworks();
    if (!entitled.length) {
      document.getElementById('soaFwTabs').innerHTML = '';
      document.getElementById('soaPct').textContent = '—';
      document.getElementById('soaBarFill').style.width = '0%';
      document.getElementById('soaRows').innerHTML = '<tr><td colspan="6" style="color:var(--paper-faint)">No frameworks purchased yet. Enable one from the <a href="#" data-action="App.go" data-id="frameworks" style="color:var(--gold-light)">Frameworks</a> view.</td></tr>';
      var suggElEmpty = document.getElementById('soaE8Suggestions'); if (suggElEmpty) suggElEmpty.innerHTML = '';
      var kpiElEmpty = document.getElementById('soaKpiRow'); if (kpiElEmpty) kpiElEmpty.innerHTML = '';
      var themeElEmpty = document.getElementById('soaThemeChart'); if (themeElEmpty) themeElEmpty.innerHTML = '';
      return;
    }
    if (!window._soaFw || entitled.indexOf(window._soaFw) === -1) window._soaFw = entitled[0];
    var activeFw = window._soaFw;
    var isE8 = activeFw === 'essential8';
    var e8Target = isE8 ? e8Lvl(S.settings.e8TargetLevel) : null;
    var isNistSub = activeFw === 'nistcsf' && ((S.settings && S.settings.nistDepth) || 'category') === 'subcategory';
    var isSoc2TypeII = activeFw === 'soc2' && ((S.settings && S.settings.soc2ReportType) || 'Type I') === 'Type II';

    /* Each tab carries its own pending-suggestion count. Without it the
       only way to find out which frameworks had scan suggestions waiting
       was to click every tab in turn — a scan across eight modules can
       leave suggestions sitting behind seven tabs nobody opens. */
    document.getElementById('soaFwTabs').innerHTML = entitled.map(function (fw) {
      var pending = pendingSuggestions(fw);
      return '<button class="f-pill' + (fw === activeFw ? ' on' : '') + '" aria-pressed="' + (fw === activeFw ? 'true' : 'false') + '" data-action="App.setSoaFw" data-id="' + fw + '">' + esc(fwName(fw)) +
        (pending ? '<span class="pill-n" title="' + pending + ' scan suggestion' + (pending > 1 ? 's' : '') + ' awaiting review">' + pending + '</span>' : '') + '</button>';
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
    var visRows = frameworkVisibleRows(activeFw);
    var impl = app.filter(function (c) { return c.st === 'Implemented'; }).length;
    var pct = window.CheckpointLib.readinessPct(app);
    document.getElementById('soaPct').textContent = impl + ' / ' + app.length + ' — ' + pct + '%';
    document.getElementById('soaBarFill').style.width = pct + '%';

    renderSoaDashboard(activeFw, visRows, app);

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
    } else if (isSoc2TypeII) {
      var soc2VisRows = frameworkVisibleRows('soc2');
      document.getElementById('soaRows').innerHTML = renderSoc2TypeIIRows(soc2VisRows);
    } else {
      var tableRows = (cats.length && window._soaCat && window._soaCat !== 'All')
        ? visRows.filter(function (c) { return catByCode[c.id] === window._soaCat; })
        : visRows;
      document.getElementById('soaRows').innerHTML = tableRows.map(renderSoaRow).join('');
    }

    /* Scan-derived suggestions (Essential Eight maturity children, and
       IS18/RFFR/ISO 42001/ISO 27701/SOC 2/NIST CSF/ISO 27001's flat
       controls) — never applied without explicit practitioner
       confirmation, see runScan() and App.confirmE8Suggestion()/
       App.confirmIs18Suggestion()/App.confirmIso42001Suggestion()/
       App.confirmIso27701Suggestion()/App.confirmSoc2Suggestion()/
       App.confirmNistCsfSuggestion()/App.confirmIso27001Suggestion().
       One strip element serves all of them: only the active framework's
       suggestions are ever shown in it. */
    var suggEl = document.getElementById('soaE8Suggestions');
    if (suggEl) {
      var suggSrc = suggestionSourceFor(activeFw);
      var suggList = suggSrc ? suggSrc.list : null;
      var suggAction = suggSrc ? suggSrc.action : null;
      var downgrades = (suggList || []).filter(isSuggestionDowngrade).length;
      /* Bulk bar + an explicit count of how many of these move a control
         backwards, so the shape of the decision is visible before any of
         it is applied rather than discovered one card at a time. */
      var suggBulk = (READONLY || !suggList || suggList.length < 2) ? '' :
        '<div class="bulk-bar">' +
          '<span class="bulk-count">' + suggList.length + ' suggested' +
            (downgrades ? ' · <b class="sugg-down-t">' + downgrades + ' move a control backwards</b>' : '') + '</span>' +
          '<button class="btn sm" data-action="App.confirmAllSuggestions" data-id="' + esc(activeFw) + '">Confirm all ' + suggList.length + '</button> ' +
          '<button class="btn ghost sm" data-action="App.dismissAllSuggestions" data-id="' + esc(activeFw) + '">Dismiss all</button>' +
        '</div>';
      suggEl.innerHTML = (suggList && suggList.length)
        ? '<div class="card" style="margin-bottom:16px"><h3>Suggested from your last scan — confirm before applying</h3>' + suggBulk +
          suggList.map(function (p) {
            var down = isSuggestionDowngrade(p);
            return '<div class="proposed-card' + (down ? ' sugg-down' : '') + '"><h4>' + esc(p.code) + ' — ' + esc(p.from) + ' ' + (down ? '↓' : '→') + ' ' + esc(p.to) + '</h4>' +
              (down ? '<div class="sugg-down-flag">' + icon('flag') + ' Moves this control backwards — confirming removes an implementation status you recorded, because the live signal no longer supports it.</div>' : '') +
              '<div class="meta">Based on posture check <b>' + esc(p.checkLabel) + '</b></div>' +
              '<button class="btn ' + (down ? 'ghost ' : '') + 'sm" data-action="App.confirm' + suggAction + 'Suggestion" data-id="' + esc(p.code) + '">' + (down ? 'Confirm downgrade' : 'Confirm') + '</button> ' +
              '<button class="btn ghost sm" data-action="App.dismiss' + suggAction + 'Suggestion" data-id="' + esc(p.code) + '">Dismiss</button></div>';
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
              (has ? '<a href="' + esc(c.evidenceUrl) + '" target="_blank" rel="noopener" class="evidence-link">Evidence ' + icon('external') + '</a>' : '<b style="color:var(--paper-faint)">No evidence yet</b>') +
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
  /* Indexed rather than scanned. This is called once per document per
     render (from docStatusOf), and the audit log is the largest list in
     the tenant — a scan per row made the Documents view O(documents ×
     log entries), which is fine at 6 documents and a few hundred
     entries and distinctly not fine at 60 and tens of thousands.

     The index is rebuilt whenever the log's length changes, which is
     the only way it grows in this app (entries are unshifted, never
     edited in place), so a stale index is not reachable without also
     changing the length. */
  var _draftStatusIndex = null, _draftStatusIndexLen = -1;
  function templateDraftStatus(filename) {
    var log = S.auditLog || [];
    if (_draftStatusIndex === null || _draftStatusIndexLen !== log.length) {
      _draftStatusIndex = {};
      /* Walk oldest-first so the newest entry for a filename is the one
         that ends up stored — the log is newest-first, and the original
         scan returned the FIRST match, i.e. the most recent. */
      for (var i = log.length - 1; i >= 0; i--) {
        var e = log[i];
        if (e.targetType !== 'Document' || !e.targetId) continue;
        if (e.action === 'Policy template generated') _draftStatusIndex[e.targetId] = 'draft';
        else if (e.action === 'Policy document approved') _draftStatusIndex[e.targetId] = 'approved';
      }
      _draftStatusIndexLen = log.length;
    }
    return _draftStatusIndex[filename] || null;
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

  /* Grouping order for the template picker's <optgroup>s — ISO 27001
     first since almost every document belongs to it, ISO 27701 and
     42001 next as the other two ISO management systems, then the
     non-ISO frameworks. Anything not in this list falls back to being
     grouped by its own id, which never happens today (every current
     framework id is listed) but keeps a future addition from silently
     vanishing instead of just appearing ungrouped. */
  var TEMPLATE_GROUP_ORDER = ['iso27001', 'iso27701', 'iso42001', 'soc2', 'essential8', 'nistcsf', 'dispirap', 'is18'];

  function renderTemplatesPicker() {
    var sel = document.getElementById('tplSelect');
    if (!sel) return;
    if (!sel.options.length) {
      /* Group by framework, filtered to what THIS client is actually
         entitled to — a client licensed only for SOC 2 shouldn't scroll
         past 20 ISO 27001 policies to find the ones that apply to them.
         A document tagged with several frameworks (most infosec
         policies also serve ISO 27701, which extends ISO 27001) is
         listed once, under the first of its tags in TEMPLATE_GROUP_ORDER
         that the client holds — never duplicated across groups. */
      var entitled = entitledFrameworks();
      var groups = {};
      window.POLICY_TEMPLATES.forEach(function (t) {
        var applicable = (t.frameworks || []).filter(function (fw) { return entitled.indexOf(fw) !== -1; });
        if (!applicable.length) return;
        var primary = TEMPLATE_GROUP_ORDER.filter(function (fw) { return applicable.indexOf(fw) !== -1; })[0] || applicable[0];
        (groups[primary] = groups[primary] || []).push(t);
      });
      var groupIds = TEMPLATE_GROUP_ORDER.filter(function (fw) { return groups[fw]; })
        .concat(Object.keys(groups).filter(function (fw) { return TEMPLATE_GROUP_ORDER.indexOf(fw) === -1; }));
      sel.innerHTML = groupIds.map(function (fw) {
        return '<optgroup label="' + esc(fwName(fw)) + '">' +
          groups[fw].map(function (t) { return '<option value="' + esc(t.id) + '">' + esc(t.title) + '</option>'; }).join('') +
          '</optgroup>';
      }).join('');
      var dateInput = document.getElementById('tplReviewDate');
      if (dateInput && !dateInput.value) {
        var d = new Date(); d.setFullYear(d.getFullYear() + 1);
        dateInput.value = d.toISOString().slice(0, 10);
      }
    }
    renderTemplatePreview();
  }

  /* Categories whose contents count as controlled documents even before
     anyone has set a status on them — a policy sitting in "Policies &
     Procedures" with no owner and no version is precisely the register
     gap the summary should be shouting about, whereas an auto-captured
     Conditional Access export is a point-in-time evidence artefact and
     is not under document control at all. */
  var CONTROLLED_DOC_CATEGORIES = ['Policies & Procedures', 'Risk & Treatment'];

  function docRegisterSummary(docs) {
    return window.CheckpointLib.documentRegisterSummary(docs || [], new Date().toISOString().slice(0, 10), {
      controlledCategories: CONTROLLED_DOC_CATEGORIES,
      warnDays: window.DOC_REVIEW_WARN_DAYS
    });
  }

  function docReviewState(d) {
    return window.CheckpointLib.documentReviewState(d, new Date().toISOString().slice(0, 10), window.DOC_REVIEW_WARN_DAYS);
  }

  function isControlledDoc(d) {
    return !!d.status || CONTROLLED_DOC_CATEGORIES.indexOf(d.category) > -1;
  }

  /* Register dates carry the year, unlike the app's usual "12 Aug"
     short form. A review cadence routinely runs a year or more out, and
     "21 May" on a document control register is genuinely ambiguous
     between this year and next — the one place the extra four
     characters are worth the width. */
  function fmtDocDate(d) {
    if (!d) return '—';
    return new Date(d + 'T00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  /* Next-review cell. Reuses the same verify-ok/verify-stale treatment
     the SoA's control re-verification column already uses, so "this
     date has gone past" reads identically wherever it appears. */
  function docReviewCell(d) {
    var rv = docReviewState(d);
    if (rv.state === 'superseded') return '<span class="src">—</span>';
    if (rv.state === 'none') {
      return isControlledDoc(d) ? '<span class="verify-stale">' + icon('flag') + ' not set</span>' : '<span class="src">—</span>';
    }
    if (rv.state === 'overdue') return '<span class="verify-stale">' + fmtDocDate(d.nextReview) + ' ' + icon('flag') + ' ' + Math.abs(rv.days) + 'd overdue</span>';
    if (rv.state === 'due') return '<span class="verify-stale">' + fmtDocDate(d.nextReview) + ' · due in ' + rv.days + 'd</span>';
    return '<span class="verify-ok">' + fmtDocDate(d.nextReview) + '</span>';
  }

  var DOC_STATUS_CLASS = { 'Approved': 'st-Implemented', 'Draft': 'st-Proposed', 'In review': 'st-Intreatment', 'Superseded': 'st-Notstarted' };

  /* Suggested next version at approval time. Pre-1.0 drafts become 1.0
     (the conventional "first issued" version); an already-issued
     document gets its major bumped, since re-approving a controlled
     document is by definition a new issue. Only ever a default in the
     approval dialog — the practitioner can type whatever the client's
     own numbering convention says. */
  function bumpDocVersion(current) {
    var m = /^(\d+)(?:\.(\d+))?/.exec(String(current || ''));
    if (!m) return '1.0';
    var major = Number(m[1]);
    return major < 1 ? '1.0' : (major + 1) + '.0';
  }

  /* A document's status now lives on the library row itself. Older
     documents — generated before the register existed — have no status
     column value, so fall back to deriving it from the audit log
     exactly as this used to, rather than showing them as unregistered.
     Anything with neither is an ordinary upload and gets no chip. */
  function docStatusOf(d) {
    return d.status || (templateDraftStatus(d.name) === 'approved' ? 'Approved' : templateDraftStatus(d.name) === 'draft' ? 'Draft' : '');
  }

  function renderDocRegisterSummary(docs) {
    var el = document.getElementById('docRegisterSummary');
    if (!el) return;
    var s = docRegisterSummary(docs);
    /* One document can be missing several fields at once, so this is a
       count of documents with at least one register gap, not a count of
       gaps — "3 documents need attention" is the actionable number. */
    var gapDocs = s.unversioned || s.unowned || s.noReviewDate
      ? (docs || []).filter(function (d) {
          if (!isControlledDoc(d) || d.status === 'Superseded') return false;
          return !d.version || !d.owner || !d.nextReview;
        }).length
      : 0;
    function tile(value, label, tone) {
      return '<div class="card kpi"><b' + (tone ? ' style="color:var(--' + tone + ')"' : '') + '>' + value + '</b><span>' + label + '</span></div>';
    }
    el.innerHTML =
      tile(s.controlled, 'Controlled documents') +
      tile(s.approved, 'Approved') +
      tile(s.draft + s.inReview, 'Draft / in review', (s.draft + s.inReview) ? 'warn' : '') +
      tile(s.overdue, 'Review overdue', s.overdue ? 'fail' : '') +
      tile(s.due, 'Due within ' + window.DOC_REVIEW_WARN_DAYS + ' days', s.due ? 'warn' : '') +
      tile(gapDocs, 'Incomplete register entry', gapDocs ? 'warn' : '');
  }

  /* ---- policy content editor ----

     Repeating fields (policy statements, roles) are edited as one line
     per item with " :: " between the two halves, rather than as a
     repeater UI. That is a deliberate trade: a textarea is reorderable,
     bulk-editable, pasteable from elsewhere and impossible to get into
     a broken intermediate state, which a row-based repeater of nested
     objects is not. A line with no separator degrades to a rule with no
     reason rather than being dropped. */
  function linesToPairs(text, aKey, bKey) {
    return String(text || '').split('\n').map(function (l) { return l.trim(); }).filter(Boolean)
      .map(function (l) {
        var i = l.indexOf('::');
        var o = {};
        o[aKey] = (i === -1 ? l : l.slice(0, i)).trim();
        o[bKey] = i === -1 ? '' : l.slice(i + 2).trim();
        return o;
      });
  }
  function pairsToLines(list, aKey, bKey) {
    return (list || []).map(function (x) {
      if (typeof x === 'string') return x;
      return x[bKey] ? x[aKey] + ' :: ' + x[bKey] : x[aKey];
    }).join('\n');
  }
  function linesToList(text) {
    return String(text || '').split('\n').map(function (l) { return l.trim(); }).filter(Boolean);
  }

  function editorField(id, label, help, value, rows) {
    return '<div style="margin-bottom:18px">' +
      '<label for="' + id + '" style="display:block;font-size:var(--fs-eyebrow);letter-spacing:.14em;text-transform:uppercase;color:var(--gold-light);font-weight:700;margin-bottom:5px">' + esc(label) + '</label>' +
      (help ? '<div class="src" style="margin-bottom:6px;max-width:80ch">' + help + '</div>' : '') +
      '<textarea id="' + id + '" class="mini" rows="' + (rows || 3) + '" style="width:100%;line-height:1.6;font-family:inherit">' + esc(value || '') + '</textarea>' +
      '</div>';
  }

  function renderPolicyEditor(docName) {
    var box = document.getElementById('policyEditor');
    if (!box) return;
    var doc = (window._docs || []).find(function (d) { return d.name === docName; });
    var tplId = (doc && doc.tplId) || null;
    if (!tplId) {
      var genEntry = (S.auditLog || []).find(function (e) { return e.targetType === 'Document' && e.targetId === docName && e.action === 'Policy template generated'; });
      try { tplId = genEntry && JSON.parse(genEntry.after).tplId; } catch (e) { tplId = null; }
    }
    var t = tplId && window.POLICY_TEMPLATES.find(function (x) { return x.id === tplId; });
    if (!t) { toast('This document was not generated from a template, so its content cannot be edited here — edit it in SharePoint instead.'); return; }
    var c = effectivePolicyContent(t, docName);
    var draft = policyDraftFor(docName);
    window._policyEditorDoc = { docName: docName, tplId: tplId };

    box.innerHTML =
      '<button class="btn ghost sm" data-action="App.closePolicyEditor" style="margin-bottom:18px">← Back to documents</button>' +
      '<div class="vhead"><div class="rule"></div><h1>Edit content — ' + esc(t.title) + '</h1>' +
        '<p>Editing the document\'s content, not its HTML. The file is re-rendered from what you save here, so your changes survive approval, a version bump, a branding change and any future improvement to the underlying template. Title, mapped controls and frameworks stay owned by the template, because the register and the Statement of Applicability key off them.</p></div>' +
      (draft ? '<div class="card" style="margin-bottom:18px;border-left:3px solid var(--gold-light)"><div class="d-kv"><span>Last edited</span><b>' + esc(draft.updatedBy || 'unknown') + ' · ' + fmtDocDate(draft.updatedDate) + '</b></div></div>' : '') +
      '<div class="card">' +
        editorField('peWhy', 'What this means for you', 'The staff-facing opener. Second person. Separate paragraphs with a blank line. Leave empty to omit the section.', c.whyItMatters, 7) +
        editorField('pePractice', 'In practice', 'One concrete situation per line. These are the part people actually remember.', linesToList(c.inPractice).join('\n'), 5) +
        editorField('pePurpose', 'Purpose', 'Why this document exists. Declarative, not second person.', c.purpose, 3) +
        editorField('peScope', 'Scope', 'Who and what it applies to.', c.scope, 3) +
        editorField('peStatements', 'Policy statements', 'One rule per line, in the form <b>rule :: reason</b>. The reason renders in italics beneath the rule. A line with no <b>::</b> becomes a rule with no reason.', pairsToLines(c.policyStatements, 'rule', 'because'), 12) +
        editorField('peRoles', 'Who is responsible', 'One per line, in the form <b>role :: responsibility</b>.', pairsToLines(c.roles, 'role', 'responsibility'), 6) +
        editorField('peExceptions', 'Exceptions', 'How to get an exception, who approves it, and how long it lasts.', c.exceptions, 4) +
        editorField('peNonCompliance', 'If this policy is not followed', 'Consequences — and, where it applies, what is expressly not treated as a breach.', c.nonCompliance, 3) +
        editorField('peRelated', 'Related documents', 'One document title per line.', linesToList(c.relatedDocuments).join('\n'), 4) +
        editorField('peReview', 'Review cadence', 'When this document itself must be revisited.', c.reviewCadence, 2) +
        '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:6px">' +
          '<button class="btn sm" data-action="App.savePolicyContent">Save changes</button>' +
          '<button class="btn ghost sm" data-action="App.savePolicyContentAndRegenerate">Save and regenerate the document</button>' +
          (draft ? '<button class="btn ghost sm" data-action="App.revertPolicyContent">Revert to the shipped template</button>' : '') +
          '<button class="btn ghost sm" data-action="App.closePolicyEditor">Cancel</button>' +
        '</div>' +
      '</div>';

    document.getElementById('documentsMain').style.display = 'none';
    box.style.display = 'block';
    window.scrollTo(0, 0);
  }

  function readPolicyEditor() {
    function v(id) { return (document.getElementById(id).value || '').trim(); }
    return {
      whyItMatters: v('peWhy'),
      inPractice: linesToList(v('pePractice')),
      purpose: v('pePurpose'),
      scope: v('peScope'),
      policyStatements: linesToPairs(v('peStatements'), 'rule', 'because'),
      roles: linesToPairs(v('peRoles'), 'role', 'responsibility'),
      exceptions: v('peExceptions'),
      nonCompliance: v('peNonCompliance'),
      relatedDocuments: linesToList(v('peRelated')),
      reviewCadence: v('peReview')
    };
  }

  async function persistPolicyContent() {
    var meta = window._policyEditorDoc;
    if (!meta) return false;
    var content = readPolicyEditor();
    if (!content.policyStatements.length) { toast('A policy needs at least one statement.'); return false; }
    if (!content.purpose) { toast('Purpose cannot be empty.'); return false; }
    var draft = {
      docName: meta.docName, tplId: meta.tplId, content: content,
      updatedBy: (Graph.getAccount() && Graph.getAccount().name) || 'Practitioner',
      updatedDate: new Date().toISOString().slice(0, 10)
    };
    try { await Store.savePolicyDraft(draft); }
    catch (e) { warn(e); toastError('Could not save: ' + esc(e.message || e)); return false; }
    audit('Policy content edited', 'Document', meta.docName, '(previous content)',
      content.policyStatements.length + ' statements, ' + content.roles.length + ' roles');
    return true;
  }

  /* Re-renders and re-uploads a document from its current effective
     content, preserving its register metadata. Used by "Save and
     regenerate" so an edit reaches the actual file immediately rather
     than waiting for the next approval. */
  async function regeneratePolicyDocument(docName, tplId) {
    if (Store.kind === 'demo') { toast('Demo mode has no tenant to save the file into — the edit is saved and would be applied on generate in a real tenant.'); return; }
    var t = window.POLICY_TEMPLATES.find(function (x) { return x.id === tplId; });
    var doc = (window._docs || []).find(function (d) { return d.name === docName; });
    if (!t || !doc) { toastError('Could not locate the document to regenerate.'); return; }
    var status = docStatusOf(doc);
    var c = effectivePolicyContent(t, docName);
    var html = buildTemplateHtml(c, {
      clientLabel: clientDisplayLabel('This organisation'), owner: doc.owner || '',
      reviewDate: doc.nextReview || '', approved: status === 'Approved',
      generatedDate: new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' }),
      logoUrl: (S.settings && S.settings.clientLogoUrl) || '', brandColor: clientBrandColor() || '',
      version: doc.version || '', approvedBy: doc.approvedBy || '', classification: doc.classification || 'Internal'
    });
    try {
      var file = new File([new Blob([html], { type: 'text/html;charset=utf-8' })], docName, { type: 'text/html;charset=utf-8' });
      await Store.uploadDocument(file, doc.category || 'Policies & Procedures');
    } catch (e) { warn(e); toastError('Content saved, but the document could not be re-rendered: ' + esc(e.message || e)); return; }
    audit('Policy document regenerated', 'Document', docName, '(previous rendering)', 'Re-rendered from edited content');
    renderDocuments();
    toast('<b>' + esc(docName) + '</b> re-rendered from your edited content.');
  }

  function renderDocuments() {
    renderTemplatesPicker();
    var rows = document.getElementById('docRows');
    if (!rows) return;
    var catSelect = document.getElementById('docCategory');
    if (catSelect && !catSelect.options.length) {
      catSelect.innerHTML = window.DOC_CATEGORIES.map(function (c) { return '<option>' + esc(c) + '</option>'; }).join('');
    }
    rows.innerHTML = skeletonRows(4, 6);
    Store.listDocuments().then(function (docs) {
      window._docs = docs;
      renderDocRegisterSummary(docs);
      var cf = window._docCatF || 'All';
      document.getElementById('docCatFilters').innerHTML = ['All'].concat(window.DOC_CATEGORIES).map(function (c) {
        return '<button class="f-pill' + (cf === c ? ' on' : '') + '" aria-pressed="' + (cf === c ? 'true' : 'false') + '" data-action="App.filterDocCat" data-id="' + esc(c) + '">' + esc(c) + '</button>';
      }).join('');
      var filtered = cf === 'All' ? docs : docs.filter(function (d) { return d.category === cf; });
      if (!filtered.length) {
        rows.innerHTML = emptyState({
          kind: 'doc', asRow: true, colspan: 6,
          text: Store.kind === 'demo'
            ? 'No documents in this category in the demo data set.'
            : cf === 'All' ? 'No documents yet. Upload the ISMS manual, policies, risk treatment plan or training records above.' : 'No documents in this category yet.',
          cta: (cf === 'All' && Store.kind !== 'demo') ? { label: 'Upload a document', action: 'App.focusDocUpload' } : null
        });
        return;
      }
      rows.innerHTML = filtered.map(function (d) {
        var status = docStatusOf(d);
        /* No status at all means one of two very different things: an
           evidence artefact that was never meant to be a controlled
           document (fine — "—"), or a policy sitting in a controlled
           category that nobody has registered (a real Clause 7.5.2
           gap, flagged). */
        var controlled = isControlledDoc(d);
        var statusCell = status
          ? '<span class="chip ' + (DOC_STATUS_CLASS[status] || 'st-Proposed') + '">' + esc(status) + '</span>'
          : controlled
            ? '<span class="verify-stale">' + icon('flag') + ' not registered</span>'
            : '<span class="src">—</span>';
        /* Four or five controls per row wrapped onto two lines and made
           the row heights uneven. The filename is now the link to open
           the file — which is where anyone would click anyway — and the
           two editors carry short, distinct labels: "Details" is the
           register entry (owner, version, approval, review date),
           "Edit text" is the document's words. That keeps the cell to
           one line at the widths this table actually renders at. */
        var actions = [];
        if (status === 'Draft' || status === 'In review') {
          actions.push('<button class="btn ghost sm" data-action="App.approveTemplate" data-id="' + esc(d.category + '|' + d.name) + '">Approve</button>');
        }
        actions.push('<button class="btn ghost sm" data-action="App.editDocumentMeta" data-id="' + esc(d.id) + '">Details</button>');
        /* Content editing only makes sense for a document Checkpoint
           generated — an uploaded PDF has no structured content to
           edit. Recognised either by the register's DocTplId or, for
           documents generated before that column existed, by the audit
           log entry the approval path already relies on. */
        if (d.tplId || templateDraftStatus(d.name)) {
          actions.push('<button class="btn ghost sm" data-action="App.editPolicyContent" data-id="' + esc(d.name) + '">Edit text</button>');
          /* Word export is offered on approved documents only. An
             uncontrolled copy of an unapproved draft is the worst
             combination available — a document that has not been
             through approval, circulating outside document control,
             with nothing on its face to say it was superseded. It also
             keeps a draft row's actions to one line. */
          if (status === 'Approved') {
            actions.push('<button class="btn ghost sm" data-action="App.exportPolicyWord" data-id="' + esc(d.name) + '">Word</button>');
          }
        }
        return '<tr>' +
          '<td style="color:var(--paper)">' +
            (d.url
              ? '<a href="' + esc(d.url) + '" target="_blank" rel="noopener" class="evidence-link" style="font-size:inherit">' + esc(d.name) + ' ' + icon('external') + '</a>'
              : esc(d.name)) +
            '<div class="src">' + esc(d.category || '—') + ' · ' + fmtSize(d.size) + ' · modified ' + fmtDate(d.modified) + '</div></td>' +
          '<td>' + (d.owner ? esc(d.owner) : controlled ? '<span class="verify-stale">' + icon('flag') + ' unassigned</span>' : '<span class="src">—</span>') + '</td>' +
          '<td>' + (d.version ? esc(d.version) : '<span class="src">—</span>') + '</td>' +
          '<td>' + statusCell + (d.approvedBy ? '<div class="src">by ' + esc(d.approvedBy) + (d.approvalDate ? ' · ' + fmtDocDate(d.approvalDate) : '') + '</div>' : '') + '</td>' +
          '<td>' + docReviewCell(d) + '</td>' +
          /* nowrap rather than flex-wrap: with wrapping allowed the
             table's auto-layout squeezed this column and let the
             buttons fall onto a second line, giving every row a
             different height. Forbidding the wrap makes the column size
             to its content instead, which is what a table layout is
             for. */
          '<td style="white-space:nowrap;text-align:right">' + actions.join(' ') + '</td></tr>';
      }).join('');
      revealRows(rows);
    }).catch(function (e) {
      warn(e);
      rows.innerHTML = '<tr><td colspan="6" style="color:var(--paper-faint)">Could not load documents.</td></tr>';
    });
  }

  /* ================= policy attestation ================= */

  /* The signed-in identity an attestation row is matched against. Falls
     back to the demo account's UPN so the demo's "My attestations"
     panel is populated rather than mysteriously empty — matching the
     demo seed in store.js. */
  function myUpn() {
    var acct = Graph.getAccount();
    if (acct && (acct.username || acct.upn)) return acct.username || acct.upn;
    return Store.kind === 'demo' ? 'demo@meridianhealth.example' : '';
  }
  function myDisplayName() {
    var acct = Graph.getAccount();
    return (acct && acct.name) || (Store.kind === 'demo' ? 'Demo user' : '');
  }
  function myOutstandingAttestations() {
    return window.CheckpointLib.outstandingAttestationsFor(S.attestations || [], myUpn());
  }

  function renderMyAttestations() {
    var box = document.getElementById('myAttestBody');
    if (!box) return;
    var mine = myOutstandingAttestations();
    var upn = myUpn();
    var done = (S.attestations || []).filter(function (r) {
      return String(r.upn || '').toLowerCase() === String(upn).toLowerCase() && r.status === 'Acknowledged';
    });
    if (!upn) {
      box.innerHTML = '<p style="font-size:13px;color:var(--paper-faint);margin:0">Sign in to see the policies assigned to you.</p>';
      return;
    }
    if (!mine.length) {
      box.innerHTML = '<p style="font-size:13px;color:var(--pass);margin:0">' + icon('check') + ' Nothing outstanding — you have acknowledged every policy assigned to you' +
        (done.length ? ' (' + done.length + ' on record).' : '.') + '</p>';
      return;
    }
    box.innerHTML = '<p style="font-size:12.5px;color:var(--paper-dim);margin:0 0 12px">' + mine.length + ' polic' + (mine.length === 1 ? 'y needs' : 'ies need') +
      ' your acknowledgement. Read each one, then confirm — your name and the date are recorded against that exact version.</p>' +
      mine.map(function (r) {
        return '<div class="d-kv" style="align-items:center;gap:12px;flex-wrap:wrap">' +
          '<span style="flex:1;min-width:220px;color:var(--paper)">' + esc(r.docName) + (r.docVersion ? ' <span class="src">v' + esc(r.docVersion) + '</span>' : '') +
            '<div class="src">Assigned ' + fmtDocDate(r.assigned) + '</div></span>' +
          (r.docUrl ? '<a href="' + esc(r.docUrl) + '" target="_blank" rel="noopener" class="evidence-link">Read the policy ' + icon('external') + '</a>' : '<span class="src">No link recorded</span>') +
          '<button class="btn sm" data-action="App.acknowledgeAttestation" data-id="' + esc(r.id) + '">I have read and understood</button>' +
          '</div>';
      }).join('');
  }

  function renderCampaigns() {
    var rows = document.getElementById('campaignRows');
    if (!rows) return;
    var campaigns = window.CheckpointLib.attestationCampaigns(S.attestations || []);
    if (!campaigns.length) {
      rows.innerHTML = emptyState({
        kind: 'doc', asRow: true, colspan: 6,
        text: 'No attestation campaigns yet. A.5.1 expects policies to be communicated to and acknowledged by relevant personnel — a campaign records who acknowledged what, and when.',
        cta: { label: '+ New campaign', action: 'App.toggleNewCampaign' }
      });
      return;
    }
    rows.innerHTML = campaigns.map(function (c) {
      var tone = c.complete ? 'pass' : c.pct >= 80 ? 'warn' : 'fail';
      return '<tr>' +
        '<td style="color:var(--paper)">' + esc(c.id) + '</td>' +
        '<td>' + esc(c.docName) + (c.docVersion ? '<div class="src">v' + esc(c.docVersion) + '</div>' : '') + '</td>' +
        '<td>' + fmtDocDate(c.launched) + '</td>' +
        '<td><b style="color:var(--' + tone + ')">' + c.pct + '%</b><div class="src">' + c.acknowledged + ' of ' + (c.acknowledged + c.outstanding) + (c.exempt ? ' · ' + c.exempt + ' exempt' : '') + '</div></td>' +
        '<td>' + (c.outstanding ? '<span class="verify-stale">' + c.outstanding + '</span>' : '<span class="verify-ok">0</span>') + '</td>' +
        '<td>' + (c.outstanding ? '<button class="btn ghost sm" data-action="App.remindCampaign" data-id="' + esc(c.id) + '">Send reminder</button>' : '') + '</td>' +
        '</tr>';
    }).join('');
    revealRows(rows);
  }

  var ATTEST_FILTERS = ['All', 'Outstanding', 'Acknowledged', 'Exempt'];

  function renderAttestationRecords() {
    var rows = document.getElementById('attestRows');
    if (!rows) return;
    var f = window._attestF || 'All';
    document.getElementById('attestFilters').innerHTML = ATTEST_FILTERS.map(function (x) {
      return '<button class="f-pill' + (f === x ? ' on' : '') + '" aria-pressed="' + (f === x ? 'true' : 'false') + '" data-action="App.filterAttest" data-id="' + esc(x) + '">' + esc(x) + '</button>';
    }).join('');
    var all = (S.attestations || []).slice().sort(function (a, b) {
      return (b.assigned || '').localeCompare(a.assigned || '') || (a.userName || '').localeCompare(b.userName || '');
    });
    /* "Outstanding" is anything not yet resolved either way — including
       a row with an unrecognised status, which must never disappear
       from a register an auditor is going to count. */
    var list = f === 'All' ? all
      : f === 'Outstanding' ? all.filter(function (r) { return r.status !== 'Acknowledged' && r.status !== 'Exempt'; })
      : all.filter(function (r) { return r.status === f; });
    if (!list.length) {
      rows.innerHTML = '<tr><td colspan="6" style="color:var(--paper-faint)">No attestation records' + (f === 'All' ? ' yet' : ' matching this filter') + '.</td></tr>';
      return;
    }
    rows.innerHTML = list.map(function (r) {
      var chip = r.status === 'Acknowledged' ? '<span class="chip st-Implemented">Acknowledged</span>'
        : r.status === 'Exempt' ? '<span class="chip st-Notstarted">Exempt</span>'
        : '<span class="chip st-Proposed">Outstanding</span>';
      return '<tr>' +
        '<td style="color:var(--paper)">' + esc(r.userName || r.upn) + '<div class="src">' + esc(r.upn) + '</div></td>' +
        '<td>' + esc(r.docName) + '</td>' +
        '<td>' + esc(r.docVersion || '—') + '</td>' +
        '<td>' + fmtDocDate(r.assigned) + '</td>' +
        '<td>' + (r.acknowledged ? fmtDocDate(r.acknowledged) : '<span class="src">—</span>') + '</td>' +
        '<td>' + chip + '</td>' +
        '</tr>';
    }).join('');
    revealRows(rows);
  }

  /* Only documents that are actually approved can be attested to —
     asking staff to acknowledge a draft is meaningless, and an auditor
     reading "47 people acknowledged v0.2 DRAFT" will pull the thread. */
  function approvedPolicyDocs() {
    return (window._docs || []).filter(function (d) {
      return docStatusOf(d) === 'Approved' && CONTROLLED_DOC_CATEGORIES.indexOf(d.category) > -1;
    });
  }

  function renderCampaignDocPicker() {
    var sel = document.getElementById('campaignDoc');
    if (!sel) return;
    var docs = approvedPolicyDocs();
    sel.innerHTML = docs.length
      ? docs.map(function (d) { return '<option value="' + esc(d.id) + '">' + esc(d.name) + (d.version ? ' — v' + esc(d.version) : '') + '</option>'; }).join('')
      : '<option value="">No approved policies yet — approve one in Documents first</option>';
  }

  function renderAttestations() {
    renderMyAttestations();
    renderCampaigns();
    renderAttestationRecords();
    /* The campaign builder needs the document register, which is
       fetched on demand. Load it once so the policy picker is populated
       even for someone who came straight here without opening
       Documents. */
    if (!window._docs) {
      Store.listDocuments().then(function (docs) { window._docs = docs; renderCampaignDocPicker(); }).catch(function (e) { warn(e); });
    } else {
      renderCampaignDocPicker();
    }
  }

  /* ================= training ================= */

  function coursesForTenant() {
    var entitled = entitledFrameworks();
    return (window.TRAINING_COURSES || []).filter(function (c) {
      return (c.frameworks || []).some(function (fw) { return entitled.indexOf(fw) !== -1; });
    });
  }
  function courseById(id) { return (window.TRAINING_COURSES || []).find(function (c) { return c.id === id; }); }

  function myOutstandingTraining() {
    var want = String(myUpn() || '').toLowerCase();
    if (!want) return [];
    return (S.training || []).filter(function (t) {
      return String(t.upn || '').toLowerCase() === want && t.status !== 'Completed' && t.status !== 'Exempt';
    });
  }

  /* Training campaigns reuse the attestation roll-up rather than
     duplicating it — the shape is the same (a set of per-person rows
     with assigned/complete/exempt states), so the two registers report
     progress identically by construction instead of by two similar
     functions drifting apart. Only the field names are mapped. */
  function trainingCampaigns() {
    return window.CheckpointLib.attestationCampaigns((S.training || []).map(function (t) {
      return {
        campaign: t.campaign, docName: t.courseTitle, docVersion: t.courseVersion,
        assigned: t.assigned, acknowledged: t.completed,
        status: t.status === 'Completed' ? 'Acknowledged' : t.status
      };
    }));
  }

  function renderMyTraining() {
    var box = document.getElementById('myTrainingBody');
    if (!box) return;
    var upn = myUpn();
    if (!upn) { box.innerHTML = '<p style="font-size:13px;color:var(--paper-faint);margin:0">Sign in to see the training assigned to you.</p>'; return; }
    var mine = myOutstandingTraining();
    var done = (S.training || []).filter(function (t) {
      return String(t.upn || '').toLowerCase() === String(upn).toLowerCase() && t.status === 'Completed';
    });
    if (!mine.length) {
      box.innerHTML = '<p style="font-size:13px;color:var(--pass);margin:0">' + icon('check') + ' Nothing outstanding — you have completed every course assigned to you' +
        (done.length ? ' (' + done.length + ' on record).' : '.') + '</p>';
      return;
    }
    var today = new Date().toISOString().slice(0, 10);
    box.innerHTML = '<p style="font-size:12.5px;color:var(--paper-dim);margin:0 0 12px">' + mine.length + ' course' + (mine.length === 1 ? '' : 's') +
      ' assigned to you. Each ends in a short comprehension check — you can retake it as many times as you need.</p>' +
      mine.map(function (t) {
        var c = courseById(t.courseId);
        var overdue = t.due && t.due < today;
        return '<div class="d-kv" style="align-items:center;gap:12px;flex-wrap:wrap">' +
          '<span style="flex:1;min-width:220px;color:var(--paper)">' + esc(t.courseTitle) + (t.courseVersion ? ' <span class="src">v' + esc(t.courseVersion) + '</span>' : '') +
            '<div class="src">' + (c ? c.duration + ' min read · ' : '') +
            (t.due ? (overdue ? '<span class="verify-stale">due ' + fmtDocDate(t.due) + ' ' + icon('flag') + ' overdue</span>' : 'due ' + fmtDocDate(t.due)) : 'no due date') +
            (t.attempts ? ' · ' + t.attempts + ' attempt' + (t.attempts === 1 ? '' : 's') + ' so far' : '') + '</div></span>' +
          (c ? '<button class="btn sm" data-action="App.openCourse" data-id="' + esc(t.courseId) + '">' + (t.attempts ? 'Resume' : 'Start course') + '</button>'
             : '<span class="src">Course content unavailable</span>') +
          '</div>';
      }).join('');
  }

  function renderCourseCatalogue() {
    var el = document.getElementById('courseCatalogue');
    if (!el) return;
    var courses = coursesForTenant();
    if (!courses.length) {
      el.innerHTML = '<p style="font-size:12.5px;color:var(--paper-faint)">No courses match this tenant\'s licensed frameworks.</p>';
      return;
    }
    el.innerHTML = courses.map(function (c) {
      var recs = (S.training || []).filter(function (t) { return t.courseId === c.id; });
      var completed = recs.filter(function (t) { return t.status === 'Completed'; }).length;
      return '<div class="card kpi" style="text-align:left">' +
        '<b style="font-size:var(--fs-3);color:var(--paper);display:block;line-height:1.35">' + esc(c.title) + '</b>' +
        '<span style="margin-top:6px">v' + esc(c.version) + ' · ' + c.duration + ' min · ' + c.quiz.length + '-question check</span>' +
        '<div class="src" style="margin-top:8px">' + esc(c.audience) + '</div>' +
        '<div class="src" style="margin-top:4px">' + (recs.length ? completed + ' of ' + recs.length + ' assigned have completed it' : 'Not assigned yet') + '</div>' +
        '<button class="btn ghost sm" style="margin-top:10px" data-action="App.openCourse" data-id="' + esc(c.id) + '">Read course</button>' +
        '</div>';
    }).join('');
  }

  function renderTrainingCampaigns() {
    var rows = document.getElementById('trainingCampaignRows');
    if (!rows) return;
    var campaigns = trainingCampaigns();
    if (!campaigns.length) {
      rows.innerHTML = emptyState({
        kind: 'shield', asRow: true, colspan: 6,
        text: 'No training assigned yet. A.6.3 expects awareness training at induction and on a recurring cadence, with evidence of who completed it.',
        cta: { label: '+ Assign training', action: 'App.toggleNewTraining' }
      });
      return;
    }
    rows.innerHTML = campaigns.map(function (c) {
      var tone = c.complete ? 'pass' : c.pct >= 80 ? 'warn' : 'fail';
      return '<tr>' +
        '<td style="color:var(--paper)">' + esc(c.id) + '</td>' +
        '<td>' + esc(c.docName) + (c.docVersion ? '<div class="src">v' + esc(c.docVersion) + '</div>' : '') + '</td>' +
        '<td>' + fmtDocDate(c.launched) + '</td>' +
        '<td><b style="color:var(--' + tone + ')">' + c.pct + '%</b><div class="src">' + c.acknowledged + ' of ' + (c.acknowledged + c.outstanding) + (c.exempt ? ' · ' + c.exempt + ' exempt' : '') + '</div></td>' +
        '<td>' + (c.outstanding ? '<span class="verify-stale">' + c.outstanding + '</span>' : '<span class="verify-ok">0</span>') + '</td>' +
        '<td>' + (c.outstanding ? '<button class="btn ghost sm" data-action="App.remindTraining" data-id="' + esc(c.id) + '">Send reminder</button>' : '') + '</td>' +
        '</tr>';
    }).join('');
    revealRows(rows);
  }

  var TRAINING_FILTERS = ['All', 'Outstanding', 'Completed', 'Exempt'];

  function renderTrainingRecords() {
    var rows = document.getElementById('trainingRows');
    if (!rows) return;
    var f = window._trainingF || 'All';
    document.getElementById('trainingFilters').innerHTML = TRAINING_FILTERS.map(function (x) {
      return '<button class="f-pill' + (f === x ? ' on' : '') + '" aria-pressed="' + (f === x ? 'true' : 'false') + '" data-action="App.filterTraining" data-id="' + esc(x) + '">' + esc(x) + '</button>';
    }).join('');
    var all = (S.training || []).slice().sort(function (a, b) {
      return (b.assigned || '').localeCompare(a.assigned || '') || (a.userName || '').localeCompare(b.userName || '');
    });
    var list = f === 'All' ? all
      : f === 'Outstanding' ? all.filter(function (t) { return t.status !== 'Completed' && t.status !== 'Exempt'; })
      : all.filter(function (t) { return t.status === f; });
    if (!list.length) {
      rows.innerHTML = '<tr><td colspan="7" style="color:var(--paper-faint)">No training records' + (f === 'All' ? ' yet' : ' matching this filter') + '.</td></tr>';
      return;
    }
    var today = new Date().toISOString().slice(0, 10);
    rows.innerHTML = list.map(function (t) {
      var overdue = t.status !== 'Completed' && t.status !== 'Exempt' && t.due && t.due < today;
      var chip = t.status === 'Completed' ? '<span class="chip st-Implemented">Completed</span>'
        : t.status === 'Exempt' ? '<span class="chip st-Notstarted">Exempt</span>'
        : overdue ? '<span class="chip st-Notstarted">Overdue</span>'
        : '<span class="chip st-Proposed">Assigned</span>';
      return '<tr>' +
        '<td style="color:var(--paper)">' + esc(t.userName || t.upn) + '<div class="src">' + esc(t.upn) + '</div></td>' +
        '<td>' + esc(t.courseTitle) + (t.source === 'induction' ? '<div class="src">induction</div>' : '') + '</td>' +
        '<td>' + esc(t.courseVersion || '—') + '</td>' +
        '<td>' + fmtDocDate(t.assigned) + '</td>' +
        '<td>' + (t.completed ? fmtDocDate(t.completed) : '<span class="src">—</span>') + '</td>' +
        '<td>' + (t.score ? esc(t.score) + (t.attempts > 1 ? '<div class="src">' + t.attempts + ' attempts</div>' : '') : '<span class="src">—</span>') + '</td>' +
        '<td>' + chip + '</td>' +
        '</tr>';
    }).join('');
    revealRows(rows);
  }

  function renderTrainingCoursePicker() {
    var sel = document.getElementById('trainingCourse');
    if (!sel) return;
    var courses = coursesForTenant();
    sel.innerHTML = courses.length
      ? courses.map(function (c) { return '<option value="' + esc(c.id) + '">' + esc(c.title) + ' — v' + esc(c.version) + '</option>'; }).join('')
      : '<option value="">No courses match this tenant\'s licensed frameworks</option>';
    var due = document.getElementById('trainingDue');
    if (due && !due.value) {
      var d = new Date(); d.setDate(d.getDate() + 30);
      due.value = d.toISOString().slice(0, 10);
    }
  }

  /* Writes the 'training' check's result into S.lastResults/lastNotes
     from the Training register. Called at the end of every scan, and
     once after load so a tenant that has not rescanned since assigning
     training still sees a current answer rather than a stale one from
     before the register existed. Never invents a result: with no
     records at all, trainingCheckResult() returns 'manual', which the
     score deliberately excludes. */
  function applyTrainingCheckResult() {
    if (!S.lastResults) return;
    var r = window.CheckpointLib.trainingCheckResult(S.training || [], new Date().toISOString().slice(0, 10));
    S.lastResults.training = r.result;
    S.lastNotes = S.lastNotes || {};
    S.lastNotes.training = r.note;
  }

  function renderTraining() {
    renderMyTraining();
    renderCourseCatalogue();
    renderTrainingCampaigns();
    renderTrainingRecords();
    renderTrainingCoursePicker();
  }

  /* ---- course reader ----
     Renders the whole course as one scrollable read, then the
     comprehension check. Deliberately not paginated module-by-module:
     the content is ~1,800 words, and forcing six "Next" clicks buys
     nothing but a completion metric that looks better than the
     understanding behind it. */
  var CALLOUT_STYLE = {
    do: { border: 'var(--pass)', label: 'Do this' },
    avoid: { border: 'var(--fail)', label: 'Avoid' },
    note: { border: 'var(--gold-light)', label: 'Note' }
  };

  function renderCourseReader(courseId) {
    var c = courseById(courseId);
    var box = document.getElementById('courseReader');
    if (!c || !box) return;
    window._courseState = { id: courseId, answers: {}, submitted: false };
    var mine = (S.training || []).find(function (t) {
      return t.courseId === courseId && String(t.upn || '').toLowerCase() === String(myUpn()).toLowerCase() && t.status !== 'Completed' && t.status !== 'Exempt';
    });

    var body =
      '<button class="btn ghost sm" data-action="App.closeCourse" style="margin-bottom:18px">← Back to training</button>' +
      '<div class="vhead"><div class="rule"></div><h1>' + esc(c.title) + '</h1>' +
        '<p>' + esc(c.purpose) + '</p></div>' +
      '<div class="card" style="margin-bottom:18px">' +
        '<div class="d-kv"><span>Version</span><b>' + esc(c.version) + '</b></div>' +
        '<div class="d-kv"><span>Audience</span><b>' + esc(c.audience) + '</b></div>' +
        '<div class="d-kv"><span>Reading time</span><b>about ' + c.duration + ' minutes</b></div>' +
        '<div class="d-kv"><span>Helps satisfy</span><b>' + esc((c.controls || []).join(', ')) + (c.clauses ? ' · ' + esc(c.clauses) : '') + '</b></div>' +
        (mine ? '' : '<div class="d-kv"><span>Your record</span><b style="color:var(--paper-dim)">Reading only — this course is not currently assigned to you, so completing the check will not create a record.</b></div>') +
      '</div>';

    c.modules.forEach(function (m, i) {
      var co = m.callout && (CALLOUT_STYLE[m.callout.kind] || CALLOUT_STYLE.note);
      body += '<div class="card" style="margin-bottom:16px">' +
        '<h3>' + (i + 1) + '. ' + esc(m.heading) + (m.jurisdiction ? ' <span class="chip st-Proposed">' + esc(m.jurisdiction) + '</span>' : '') + '</h3>' +
        '<p style="font-size:13px;color:var(--paper-dim);margin:0 0 12px;max-width:80ch">' + esc(m.intro) + '</p>' +
        '<ul style="margin:0;padding-left:18px;font-size:13px;line-height:1.75;max-width:80ch">' +
          m.points.map(function (p) { return '<li style="margin-bottom:9px">' + esc(p) + '</li>'; }).join('') +
        '</ul>' +
        (co ? '<div style="margin-top:14px;padding:11px 14px;border-left:3px solid ' + co.border + ';background:rgba(255,255,255,.02)">' +
          '<b style="font-size:var(--fs-eyebrow);letter-spacing:.14em;text-transform:uppercase;color:' + co.border + '">' + co.label + '</b>' +
          '<div style="font-size:13px;margin-top:5px;max-width:80ch">' + esc(m.callout.text) + '</div></div>' : '') +
        '</div>';
    });

    body += '<h2 style="margin:28px 0 6px">Comprehension check</h2>' +
      '<p style="font-size:12.5px;color:var(--paper-dim);margin:0 0 16px;max-width:80ch">' + c.quiz.length + ' questions, ' + c.passMark + ' correct to pass. Wrong answers explain themselves and you can retake it as many times as you like — the point is that it lands, not that anyone fails.</p>' +
      '<div id="courseQuiz"></div>';

    box.innerHTML = body;
    document.getElementById('trainingMain').style.display = 'none';
    box.style.display = 'block';
    renderCourseQuiz();
    window.scrollTo(0, 0);
  }

  function renderCourseQuiz() {
    var st = window._courseState;
    var c = courseById(st.id);
    var wrap = document.getElementById('courseQuiz');
    if (!c || !wrap) return;
    var correct = c.quiz.reduce(function (n, q, i) { return n + (st.answers[i] === q.answer ? 1 : 0); }, 0);
    var answeredAll = c.quiz.every(function (q, i) { return st.answers[i] !== undefined; });

    wrap.innerHTML = c.quiz.map(function (q, i) {
      var chosen = st.answers[i];
      return '<div class="card" style="margin-bottom:14px">' +
        '<b style="display:block;font-size:13.5px;color:var(--paper);margin-bottom:12px;max-width:80ch">' + (i + 1) + '. ' + esc(q.q) + '</b>' +
        q.options.map(function (o, oi) {
          var picked = chosen === oi;
          var tone = '';
          if (st.submitted && picked) tone = oi === q.answer ? 'border-color:var(--pass)' : 'border-color:var(--fail)';
          if (st.submitted && !picked && oi === q.answer) tone = 'border-color:var(--pass);opacity:.75';
          return '<button class="btn ghost sm" style="display:block;width:100%;text-align:left;margin-bottom:7px;white-space:normal;line-height:1.5;' +
            (picked ? 'background:rgba(169,129,46,.14);' : '') + tone + '" ' +
            'data-action="App.answerCourseQuestion" data-id="' + i + ':' + oi + '">' + esc(o) + '</button>';
        }).join('') +
        (st.submitted && chosen !== undefined
          ? '<div style="margin-top:10px;padding:10px 13px;border-left:3px solid ' + (chosen === q.answer ? 'var(--pass)' : 'var(--fail)') + ';font-size:12.5px;max-width:80ch">' +
            '<b style="color:' + (chosen === q.answer ? 'var(--pass)' : 'var(--fail)') + '">' + (chosen === q.answer ? 'Correct. ' : 'Not quite. ') + '</b>' + esc(q.why) + '</div>'
          : '') +
        '</div>';
    }).join('');

    if (!st.submitted) {
      wrap.innerHTML += '<button class="btn" data-action="App.submitCourseQuiz"' + (answeredAll ? '' : ' disabled') + '>' +
        (answeredAll ? 'Submit answers' : 'Answer all ' + c.quiz.length + ' questions to submit') + '</button>';
    } else {
      var passed = correct >= c.passMark;
      wrap.innerHTML += '<div class="card" style="border-left:3px solid var(--' + (passed ? 'pass' : 'warn') + ')">' +
        '<h3 style="margin-top:0;color:var(--' + (passed ? 'pass' : 'warn') + ')">' + correct + ' of ' + c.quiz.length + (passed ? ' — passed' : ' — not passed yet') + '</h3>' +
        '<p style="font-size:13px;color:var(--paper-dim);margin:0 0 12px;max-width:80ch">' +
          (passed
            ? (st.recorded === true ? 'Your completion has been recorded.'
               : st.recorded === 'unassigned' ? 'This course is not currently assigned to you, so no record was created — read it as often as you like.'
               : st.recorded === false ? 'Your completion could NOT be saved. Try submitting again, or tell your ISMS contact.'
               : 'Recording your completion…')
            : 'Review the explanations above and try again — retries are unlimited and only the passing attempt is recorded as completion.') +
        '</p>' +
        '<button class="btn ghost sm" data-action="App.retryCourseQuiz">' + (passed ? 'Retake the check' : 'Try again') + '</button> ' +
        '<button class="btn ghost sm" data-action="App.closeCourse">Back to training</button>' +
        '</div>';
    }
  }

  /* Audience pickers are shared by policy attestation and training —
     same directory, same exclusions, same failure modes — so they take
     the element ids rather than existing twice. */
  async function loadAudienceGroups(selectId) {
    var sel = document.getElementById(selectId);
    if (!sel || sel.options.length) return;
    if (Store.kind === 'demo') { sel.innerHTML = '<option value="">(demo mode — no directory)</option>'; return; }
    sel.innerHTML = '<option value="">Loading groups…</option>';
    try {
      var groups = await Graph.listTenantGroups();
      sel.innerHTML = groups.length
        ? groups.map(function (g) { return '<option value="' + esc(g.id) + '">' + esc(g.name) + '</option>'; }).join('')
        : '<option value="">No groups found</option>';
    } catch (e) {
      warn(e);
      sel.innerHTML = '<option value="">Could not read groups</option>';
    }
  }
  function loadCampaignGroups() { return loadAudienceGroups('campaignGroup'); }
  function loadTrainingGroups() { return loadAudienceGroups('trainingGroup'); }

  async function resolveAudience(modeSelectId, groupSelectId) {
    if (Store.kind === 'demo') return [];
    var mode = document.getElementById(modeSelectId).value;
    if (mode === 'group') {
      var gid = document.getElementById(groupSelectId).value;
      if (!gid) return [];
      return Graph.listGroupMembers(gid);
    }
    return Graph.listTenantUsers();
  }
  function resolveCampaignAudience() { return resolveAudience('campaignAudience', 'campaignGroup'); }

  function nextTrainingCampaignId() {
    var max = 0;
    (S.training || []).forEach(function (t) {
      var m = /^TCAMP-(\d+)$/.exec(t.campaign || '');
      if (m) max = Math.max(max, Number(m[1]));
    });
    return 'TCAMP-' + String(max + 1).padStart(4, '0');
  }
  function nextTrainingSeq() {
    var max = 0;
    (S.training || []).forEach(function (t) {
      var m = /^TRN-(\d+)$/.exec(t.id || '');
      if (m) max = Math.max(max, Number(m[1]));
    });
    return max + 1;
  }

  /* Shared by the manual assignment path and the induction sweep, so a
     record created automatically for a new starter is structurally
     identical to one a practitioner assigned — only `source` differs,
     which is what the records table shows as an "induction" tag. */
  function buildTrainingRows(course, users, campaignId, due, source) {
    var today = new Date().toISOString().slice(0, 10);
    var seq = nextTrainingSeq();
    return users.map(function (u, i) {
      return {
        id: 'TRN-' + String(seq + i).padStart(4, '0'), campaign: campaignId,
        courseId: course.id, courseTitle: course.title, courseVersion: course.version,
        upn: u.upn, userName: u.name, assigned: today, due: due || '', completed: '',
        status: 'Assigned', score: '', attempts: 0, source: source || 'campaign', note: ''
      };
    });
  }

  async function sendTrainingMail(rows, course, kind) {
    var appUrl = location.origin + location.pathname;
    var clientLabel = clientDisplayLabel('your organisation');
    var subject = (kind === 'reminder' ? 'Reminder: please complete ' : 'Training assigned: ') + course.title;
    var ok = 0, failed = 0;
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      var body =
        '<p>Hello ' + esc(r.userName || '') + ',</p>' +
        '<p>' + (kind === 'reminder' ? 'This is a reminder that you have not yet completed' : 'You have been assigned') +
        ' <b>' + esc(course.title) + '</b>' + (course.version ? ' (version ' + esc(course.version) + ')' : '') + ' for ' + esc(clientLabel) + '.' +
        (course.duration ? ' It takes about ' + course.duration + ' minutes and ends in a short comprehension check.' : '') + '</p>' +
        (r.due ? '<p>Please complete it by <b>' + esc(r.due) + '</b>.</p>' : '') +
        '<p>Open Checkpoint and go to <b>Training</b>:<br><a href="' + esc(appUrl) + '">' + esc(appUrl) + '</a></p>' +
        '<p style="color:#666;font-size:12px">Your completion, score and date are recorded so we can evidence that awareness training was delivered and understood.</p>';
      try { await Graph.sendMail(r.upn, subject, body); ok++; } catch (e) { console.error(e); failed++; }
    }
    return { ok: ok, failed: failed };
  }

  /* Campaign and attestation reference numbers continue from whatever
     is already in the register rather than restarting at 1 — the ids
     appear in the audit log and in exported evidence, so a collision
     would make two different campaigns indistinguishable in a year's
     time. Parsed from existing rows because the ids live only in
     SharePoint; there is no counter to read. */
  function nextCampaignId() {
    var max = 0;
    (S.attestations || []).forEach(function (r) {
      var m = /^CAMP-(\d+)$/.exec(r.campaign || '');
      if (m) max = Math.max(max, Number(m[1]));
    });
    return 'CAMP-' + String(max + 1).padStart(4, '0');
  }
  function nextAttestationSeq() {
    var max = 0;
    (S.attestations || []).forEach(function (r) {
      var m = /^ATT-(\d+)$/.exec(r.id || '');
      if (m) max = Math.max(max, Number(m[1]));
    });
    return max + 1;
  }

  /* One email per recipient rather than one email to everyone: the body
     names the individual and, more importantly, a bulk send would
     disclose the full staff list to every recipient. Sent from the
     signed-in practitioner's own mailbox via the existing delegated
     Mail.Send path — no service account, no backend.

     Failures are counted, not thrown: with a few hundred recipients a
     single bad address must not abort the run, and the campaign rows
     are already written either way, so the reminder button remains the
     recovery path. */
  async function sendAttestationMail(rows, doc, kind) {
    var appUrl = location.origin + location.pathname;
    var clientLabel = clientDisplayLabel('your organisation');
    var subject = (kind === 'reminder' ? 'Reminder: please acknowledge ' : 'Please read and acknowledge: ') + doc.name;
    var ok = 0, failed = 0;
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      var body =
        '<p>Hello ' + esc(r.userName || '') + ',</p>' +
        '<p>' + (kind === 'reminder' ? 'This is a reminder that you have not yet acknowledged' : 'You have been asked to read and acknowledge') +
        ' <b>' + esc(doc.name) + '</b>' + (doc.version ? ' (version ' + esc(doc.version) + ')' : '') + ' for ' + esc(clientLabel) + '.</p>' +
        (doc.url ? '<p><a href="' + esc(doc.url) + '">Read the policy</a></p>' : '') +
        '<p>When you have read it, open Checkpoint and confirm on the <b>Policy attestation</b> page:<br>' +
        '<a href="' + esc(appUrl) + '">' + esc(appUrl) + '</a></p>' +
        '<p style="color:#666;font-size:12px">Your name, sign-in address and the date are recorded so we can evidence that the policy was communicated and acknowledged.</p>';
      try { await Graph.sendMail(r.upn, subject, body); ok++; } catch (e) { console.error(e); failed++; }
    }
    return { ok: ok, failed: failed };
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
      wrap.innerHTML = emptyState({ kind: 'shield', asRow: true, colspan: 7, text: 'No internal audits scheduled yet. ISO 27001 clause 9.2 expects a recurring internal audit programme, independent of certification audits.', cta: { label: '+ Schedule audit', action: 'App.toggleAddAudit' } });
      return;
    }
    var today = new Date().toISOString().slice(0, 10);
    wrap.innerHTML = audits.slice().reverse().map(function (a) {
      var overdue = a.status === 'Planned' && a.planned && a.planned < today;
      return '<tr><td class="id-t">' + a.id + '</td><td>' + esc(fwName(a.fw)) + '</td><td style="color:var(--paper)">' + esc(a.scope) + '</td><td>' + esc(a.auditor) + '</td>' +
        '<td style="color:' + (overdue ? 'var(--fail)' : 'inherit') + '">' + fmtDate(a.planned) + (overdue ? ' ' + icon('flag') : '') + '</td>' +
        '<td><span class="chip ' + (a.status === 'Completed' ? 'st-Implemented' : 'st-Notstarted') + '">' + a.status + '</span></td>' +
        '<td style="white-space:nowrap">' + (a.status === 'Planned' ? '<button class="btn sm" data-action="App.completeAudit" data-id="' + a.id + '">Mark complete</button> ' : '') + '<button class="btn ghost sm" data-action="App.openAudit" data-id="' + a.id + '">View</button></td></tr>';
    }).join('');
    revealRows(wrap);
  }

  function incidentAssessmentChip(inc) {
    var a = window.CheckpointLib.incidentAssessmentState(inc, new Date().toISOString().slice(0, 10));
    if (a.state === 'n/a') return '<span style="color:var(--paper-faint)">—</span>';
    if (a.state === 'closed') return '<span class="chip st-Implemented">Assessed</span>';
    if (a.state === 'none') return '<span class="chip st-Notstarted">No due date</span>';
    if (a.state === 'overdue') return '<span class="chip st-Open">' + Math.abs(a.days) + 'd overdue</span>';
    if (a.state === 'due') return '<span class="chip st-Inprogress">Due in ' + a.days + 'd</span>';
    return '<span class="chip st-Notstarted">Due in ' + a.days + 'd</span>';
  }

  function renderIncidents() {
    var wrap = document.getElementById('incidentRows');
    if (!wrap) return;
    var incidents = S.incidents || [];
    if (!incidents.length) {
      wrap.innerHTML = emptyState({ kind: 'shield', asRow: true, colspan: 8, text: 'No incidents logged yet. ISO 27001 A.5.24–A.5.28 expects a planned approach to information security incidents — this register covers everything Microsoft Defender can\'t see, from a lost laptop to a supplier\'s own breach.', cta: { label: '+ Log incident', action: 'App.toggleAddIncident' } });
      return;
    }
    wrap.innerHTML = incidents.slice().reverse().map(function (n) {
      return '<tr><td class="id-t">' + n.id + '</td><td style="color:var(--paper)">' + esc(n.title) + '</td><td>' + esc(n.category) + '</td>' +
        '<td>' + esc(n.severity) + '</td><td>' + fmtDate(n.detected) + '</td>' +
        '<td><span class="chip ' + (n.status === 'Closed' ? 'st-Implemented' : 'st-Notstarted') + '">' + esc(n.status) + '</span></td>' +
        '<td>' + incidentAssessmentChip(n) + '</td>' +
        '<td><button class="btn ghost sm" data-action="App.openIncident" data-id="' + n.id + '">View</button></td></tr>';
    }).join('');
    revealRows(wrap);
  }

  /* Render a review's Clause 9.3.2 inputs (structured JSON, or a legacy
     free-text blob for reviews recorded before the structured form) —
     shared by the drawer and the Management Review Pack report. */
  function reviewInputsHtml(str) {
    var parsed = window.CheckpointLib.parseReviewInputs(str);
    if (parsed.legacy) return '<p style="font-size:12px;color:var(--paper-dim);line-height:1.7">' + esc(parsed.legacy) + '</p>';
    var sections = window.CheckpointLib.MR_INPUT_SECTIONS.filter(function (s) { return parsed[s.key]; });
    if (!sections.length) return '<p style="font-size:12px;color:var(--paper-faint)">No structured inputs recorded.</p>';
    return sections.map(function (s) {
      return '<div style="margin-bottom:10px"><div class="src"><b style="color:var(--paper-dim)">' + esc(s.clause) + '</b> — ' + esc(s.label) + '</div><p style="font-size:12px;color:var(--paper-dim);line-height:1.6;margin:2px 0 0">' + esc(parsed[s.key]) + '</p></div>';
    }).join('');
  }
  function reviewInputsToText(str) {
    var parsed = window.CheckpointLib.parseReviewInputs(str);
    if (parsed.legacy) return parsed.legacy;
    return window.CheckpointLib.MR_INPUT_SECTIONS.filter(function (s) { return parsed[s.key]; })
      .map(function (s) { return s.clause + ': ' + parsed[s.key]; }).join(' | ');
  }

  function renderReviews() {
    var wrap = document.getElementById('reviewRows');
    if (!wrap) return;
    var reviews = S.reviews || [];
    if (!reviews.length) {
      wrap.innerHTML = emptyState({ kind: 'doc', asRow: true, colspan: 5, text: 'No management reviews recorded yet. ISO 27001 clause 9.3 expects top management to review the ISMS at planned intervals.', cta: { label: '+ Record review', action: 'App.toggleAddReview' } });
      return;
    }
    wrap.innerHTML = reviews.slice().reverse().map(function (r) {
      return '<tr><td class="id-t">' + r.id + '</td><td>' + fmtDate(r.date) + '</td><td style="color:var(--paper)">' + esc(r.attendees) + '</td><td>' + (r.nextDue ? fmtDate(r.nextDue) : '—') + '</td>' +
        '<td><button class="btn ghost sm" data-action="App.openReview" data-id="' + r.id + '">View</button></td></tr>';
    }).join('');
    revealRows(wrap);
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
      wrap.innerHTML = emptyState({ kind: 'calendar', asRow: true, colspan: 8, text: 'No recurring activities tracked yet. Add access control reviews, BCP/DR tests, supplier reviews and more above.', cta: { label: '+ Add recurring activity', action: 'App.toggleAddCalItem' } });
      return;
    }
    var today = new Date().toISOString().slice(0, 10);
    wrap.innerHTML = items.slice().sort(function (a, b) { return (a.nextDue || '').localeCompare(b.nextDue || ''); }).map(function (c) {
      var isOverdue = c.nextDue && c.nextDue < today;
      return '<tr data-id="' + c.id + '"><td class="id-t">' + c.id + '</td><td style="color:var(--paper)">' + esc(c.title) + (c.notes ? '<div class="src" style="margin-top:4px">' + esc(c.notes) + '</div>' : '') + '</td><td class="src">' + esc(c.category) + '</td><td class="src">' + esc(c.freq) + '</td><td>' + esc(c.owner) + '</td>' +
        '<td style="color:' + (isOverdue ? 'var(--fail)' : 'inherit') + '">' + fmtDate(c.nextDue) + (isOverdue ? ' ' + icon('flag') : '') + '</td>' +
        '<td>' + (c.lastCompleted ? fmtDate(c.lastCompleted) : '—') + '</td>' +
        '<td><button class="btn sm" data-action="App.completeCalItem" data-id="' + c.id + '">Complete</button></td></tr>';
    }).join('');
    revealRows(wrap);
  }

  function renderAuditLog() {
    var wrap = document.getElementById('auditLogRows');
    if (!wrap) return;
    var entries = S.auditLog || [];
    if (!entries.length) {
      wrap.innerHTML = emptyState({
        kind: 'doc', asRow: true, colspan: 6,
        text: 'No audit log entries yet — this fills in automatically as controls, risks, actions and registers are changed. Nothing to add here yourself.'
      });
      return;
    }
    wrap.innerHTML = entries.map(function (e) {
      var when = e.entryDateTime ? new Date(e.entryDateTime).toLocaleString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
      return '<tr><td class="src">' + esc(when) + '</td><td>' + esc(e.actor) + '</td><td style="color:var(--paper)">' + esc(e.action) + '</td>' +
        '<td class="id-t">' + esc(e.targetType) + ' ' + esc(e.targetId) + '</td>' +
        '<td class="src">' + esc(e.before || '—') + '</td><td class="src">' + esc(e.after || '—') + '</td></tr>';
    }).join('');
  }

  /* ================= Boardroom Mode =================
     A full-screen, auto-cycling slide deck for live QBRs — six slides
     built from the exact same data/chart functions as the Dashboard
     and reports (fingerprint/journey/riskLandscape/trend/stackedBars
     via window.ReportEngine.charts, count-up via runCountUps/
     data-count), never a separate "presentation" data path to keep in
     sync. window._bd holds all live state: { index, timer, remaining,
     paused, active }. Entering requests real Fullscreen
     (Element.requestFullscreen()); if that's denied or unsupported,
     the .boardroom-mode fixed-position overlay (index.html) already
     covers the viewport identically, so the deck looks the same
     either way — that IS the "graceful fallback to a maximised
     overlay" this feature asks for, not a separate code path. */
  var BD_SLIDE_MS = 12000;
  var BD_COUNT = 6;

  function boardroomSlideBuilders() {
    return [
      boardroomSlideFingerprint, boardroomSlideTrend, boardroomSlideJourney,
      boardroomSlideRisks, boardroomSlideActions, boardroomSlideMilestones
    ];
  }

  function boardroomSlideFingerprint() {
    var entitled = entitledFrameworks();
    var primaryFw = entitled.indexOf('iso27001') > -1 ? 'iso27001' : entitled[0];
    var clientLabel = clientDisplayLabel('This tenant');
    if (!primaryFw) return '<h2>' + esc(clientLabel) + '</h2><p class="bd-sub">Enable a framework to see readiness.</p>';
    var data = window.CheckpointLib.fingerprintFromRows(fingerprintRowsFor(primaryFw));
    var svg = data.total ? window.ReportEngine.charts.fingerprint(data, { interactive: true, palette: 'app' }) : '';
    return '<h2>' + esc(clientLabel) + '</h2>' +
      (svg ? '<div class="bd-chart" style="max-width:440px">' + svg + '</div>' : '<p class="bd-sub">No applicable controls yet.</p>') +
      '<p class="bd-sub">' + esc(fwName(primaryFw)) + ' readiness</p>';
  }

  function boardroomSlideTrend() {
    var last = S.scans[S.scans.length - 1];
    var svg = window.ReportEngine.charts.trend(scanTrendData(), REPORT_TARGET_SCORE, { palette: 'app' });
    var numHtml = last
      ? '<div class="bd-num" data-count="' + last.score + '">' + last.score + '<small>/100</small></div>'
      : '<div class="bd-num">—</div>';
    return '<h2>Posture score trend</h2>' + numHtml + '<div class="bd-chart" style="max-width:820px">' + svg + '</div>';
  }

  function boardroomSlideJourney() {
    var data = certificationJourneyData();
    if (!data) return '<h2>Certification journey</h2><p class="bd-sub">Enable a framework to see its certification journey.</p>';
    var svg = window.ReportEngine.charts.journey(data.milestones, { interactive: true, palette: 'app' });
    var p = data.projection;
    var msg = p.status === 'complete'
      ? 'Every applicable control is already implemented.'
      : p.status === 'projected'
        ? 'Projected audit-ready ' + fmtDate(p.date) + ' at current velocity (' + p.velocityPerWeek + ' controls/week).'
        : 'Insufficient remediation history yet to project an audit-ready date.';
    return '<h2>Certification journey — ' + esc(fwName(data.primaryFw)) + '</h2><div class="bd-chart" style="max-width:820px">' + svg + '</div><p class="bd-sub">' + esc(msg) + '</p>';
  }

  function boardroomSlideRisks() {
    var openRisks = S.risks.filter(function (r) { return r.status !== 'Closed'; });
    var top3 = openRisks.slice().sort(function (a, b) { var qa = residual(a), qb = residual(b); return (qb.L * qb.I) - (qa.L * qa.I); }).slice(0, 3);
    if (!top3.length) return '<h2>Top risks</h2><p class="bd-sub">No open risks.</p>';
    var riskInputs = top3.map(function (r) { var q = residual(r); return { id: r.id, L: q.L, I: q.I }; });
    var layout = window.CheckpointLib.riskBubbleLayout(riskInputs, { size: 340 });
    var byId = {};
    top3.forEach(function (r) { byId[r.id] = r; });
    layout.bubbles.forEach(function (b) { var r = byId[b.id]; if (r) b.label = b.id + ' — ' + r.title; });
    var svg = window.ReportEngine.charts.riskLandscape(layout, { interactive: true, palette: 'app' });
    var list = top3.map(function (r) {
      var q = residual(r), rb = band(q.L * q.I);
      return '<div class="d-kv"><span>' + esc(r.title) + '</span><b><span class="chip sev-' + rb + '">' + rb + '</span></b></div>';
    }).join('');
    return '<h2>Top risks</h2><div class="bd-chart" style="max-width:360px">' + svg + '</div><div class="bd-sub" style="text-align:left">' + list + '</div>';
  }

  function boardroomSlideActions() {
    var throughput = actionThroughputByMonth();
    var svg = window.ReportEngine.charts.stackedBars(throughput, THROUGHPUT_LEGEND, { palette: 'app' });
    var od = S.actions.filter(overdue).length;
    return '<h2>Action throughput</h2><div class="bd-chart" style="max-width:820px">' + svg + '</div>' +
      '<div class="bd-num" data-count="' + od + '" style="font-size:6vw;color:' + (od ? 'var(--fail)' : 'var(--gold-light)') + '">' + od + '<small> overdue action' + (od === 1 ? '' : 's') + '</small></div>';
  }

  function boardroomSlideMilestones() {
    var nextAudit = (S.audits || []).filter(function (a) { return a.status === 'Planned'; }).sort(function (a, b) { return (a.planned || '').localeCompare(b.planned || ''); })[0];
    var lastReview = (S.reviews || [])[S.reviews.length - 1];
    var upcomingCal = (S.calendar || []).filter(function (c) { return c.status !== 'Done'; }).sort(function (a, b) { return (a.nextDue || '').localeCompare(b.nextDue || ''); })[0];
    var rows = [
      ['Next internal audit', nextAudit ? fmtDate(nextAudit.planned) + ' — ' + esc(nextAudit.scope) : 'None scheduled'],
      ['Next management review', lastReview && lastReview.nextDue ? fmtDate(lastReview.nextDue) : 'Not set'],
      ['Next ISMS activity', upcomingCal ? fmtDate(upcomingCal.nextDue) + ' — ' + esc(upcomingCal.title) : 'None scheduled']
    ];
    return '<h2>Upcoming milestones</h2><div class="bd-sub" style="text-align:left;max-width:52ch">' +
      rows.map(function (r) { return '<div class="d-kv"><span>' + r[0] + '</span><b>' + r[1] + '</b></div>'; }).join('') + '</div>';
  }

  function boardroomBuildSlide(i) {
    var el = document.getElementById('bdSlide');
    if (!el) return;
    el.innerHTML = boardroomSlideBuilders()[i]();
    initSvgTooltip(el);
    runCountUps(el);
  }

  /* Removing then re-adding 'bd-run' forces the CSS animation to
     restart from 0% (the same "toggle the class off, force a reflow,
     toggle it back on" trick the Constellation's selection pulse
     uses) — needed both on slide advance and on manual nav, so a
     click/arrow-key always gives the full 12s back rather than
     inheriting whatever was left of the previous slide's bar. */
  function boardroomRestartProgressBar() {
    var deck = document.getElementById('boardroomDeck');
    if (!deck) return;
    deck.classList.remove('bd-run');
    void deck.offsetWidth;
    deck.classList.add('bd-run');
  }

  function boardroomScheduleNext(ms) {
    var bd = window._bd;
    if (!bd || prefersReducedMotion()) return;
    clearTimeout(bd.timer);
    bd.startedAt = Date.now();
    bd.remaining = ms;
    bd.timer = setTimeout(function () { boardroomShowSlide(bd.index + 1); }, ms);
  }

  function boardroomPause() {
    var bd = window._bd;
    if (!bd || bd.paused || prefersReducedMotion()) return;
    bd.paused = true;
    clearTimeout(bd.timer);
    bd.remaining = Math.max(0, bd.remaining - (Date.now() - bd.startedAt));
    var deck = document.getElementById('boardroomDeck');
    if (deck) deck.classList.add('bd-paused');
  }

  function boardroomResume() {
    var bd = window._bd;
    if (!bd || !bd.paused || prefersReducedMotion()) return;
    bd.paused = false;
    var deck = document.getElementById('boardroomDeck');
    if (deck) deck.classList.remove('bd-paused');
    boardroomScheduleNext(bd.remaining || BD_SLIDE_MS);
  }

  function boardroomShowSlide(i) {
    var bd = window._bd;
    if (!bd || !bd.active) return;
    bd.index = ((i % BD_COUNT) + BD_COUNT) % BD_COUNT;
    boardroomBuildSlide(bd.index);
    var dotsEl = document.getElementById('bdDots');
    if (dotsEl) {
      Array.prototype.forEach.call(dotsEl.children, function (d, idx) { d.classList.toggle('on', idx === bd.index); d.setAttribute('aria-selected', idx === bd.index ? 'true' : 'false'); });
    }
    if (!prefersReducedMotion()) {
      boardroomRestartProgressBar();
      boardroomScheduleNext(BD_SLIDE_MS);
    }
  }

  /* "Pause on hover" and "cursor auto-hides after 2s" share one timer
     rather than two: the deck fills the entire viewport, so a
     mouseenter/mouseleave pair (the naive way to implement "hover")
     can never fire mouseleave while the presenter's cursor is still
     anywhere on screen — there's nowhere for it to "leave" to. Mouse
     activity instead means "the presenter is actively engaging with
     the deck right now" — pause immediately, then resume (and hide
     the cursor) once they've stopped touching it for 2s. Reduced
     motion never auto-advances in the first place (see
     boardroomShowSlide), so this timer only ever hides the cursor for
     that case — boardroomPause()/Resume() no-op under it already. */
  var _bdIdleTimer = null;
  function boardroomIdleTick() {
    var deck = document.getElementById('boardroomDeck');
    if (!deck) return;
    deck.classList.remove('bd-idle');
    boardroomPause();
    clearTimeout(_bdIdleTimer);
    _bdIdleTimer = setTimeout(function () {
      deck.classList.add('bd-idle');
      boardroomResume();
    }, 2000);
  }

  var _bdChromeBound = false;
  function boardroomBindChromeOnce() {
    if (_bdChromeBound) return;
    _bdChromeBound = true;
    var deck = document.getElementById('boardroomDeck');
    if (!deck) return;
    deck.addEventListener('mousemove', boardroomIdleTick);
  }

  function boardroomEnter() {
    window._bd = { index: 0, timer: null, startedAt: 0, remaining: BD_SLIDE_MS, paused: false, active: true };
    document.body.classList.add('boardroom-mode');
    boardroomBindChromeOnce();
    var dotsEl = document.getElementById('bdDots');
    if (dotsEl) {
      dotsEl.innerHTML = '';
      for (var i = 0; i < BD_COUNT; i++) {
        var dot = document.createElement('button');
        dot.type = 'button';
        dot.className = 'bd-dot' + (i === 0 ? ' on' : '');
        dot.setAttribute('role', 'tab');
        dot.setAttribute('aria-selected', i === 0 ? 'true' : 'false');
        dot.setAttribute('aria-label', 'Slide ' + (i + 1));
        dot.setAttribute('data-action', 'App.boardroomGoTo');
        dot.setAttribute('data-id', String(i));
        dotsEl.appendChild(dot);
      }
    }
    boardroomShowSlide(0);
    boardroomIdleTick();
    var el = document.documentElement;
    if (el.requestFullscreen) {
      el.requestFullscreen().catch(function () { /* denied/unsupported — the CSS overlay is already the fallback */ });
    }
    var exitBtn = document.getElementById('boardroomExitBtn');
    if (exitBtn) exitBtn.focus();
  }

  function boardroomExit() {
    if (window._bd) { clearTimeout(window._bd.timer); window._bd.active = false; }
    clearTimeout(_bdIdleTimer);
    document.body.classList.remove('boardroom-mode');
    var deck = document.getElementById('boardroomDeck');
    if (deck) { deck.classList.remove('bd-idle', 'bd-run', 'bd-paused'); }
    if (document.fullscreenElement) { try { document.exitFullscreen(); } catch (e) { } }
  }

  /* The browser's own fullscreen-exit affordances (native Esc, an OS
     gesture, the browser's own "exit fullscreen" bar) bypass our
     Escape keydown handler entirely — this is what keeps
     window._bd.active honest when that happens, so a stray leftover
     timer can't fire into a deck the presenter already left. */
  document.addEventListener('fullscreenchange', function () {
    if (!document.fullscreenElement && window._bd && window._bd.active) boardroomExit();
  });

  /* ================= Financial risk analysis (Monte Carlo) =================
     Converts the existing ordinal risk register into a simulated
     annual-loss distribution — fully automatic, no separate financial
     data entry: every input is derived from a risk's own residual L/I
     via window.CheckpointLib.riskFinancialInputs()' documented bands.
     Re-runs on every render (view open, or whenever the risk register
     changes and calls this alongside renderRisks()) — 10,000 trials
     across a few dozen risks is well under a millisecond budget worth
     worrying about, so there's no "run simulation" button to click. */
  var QUANT_RISK_TRIALS = 10000;
  function fmtUsdCompact(n) {
    n = Math.max(0, Number(n) || 0);
    if (n >= 1000000) return '$' + (Math.round(n / 100000) / 10) + 'M';
    if (n >= 1000) return '$' + Math.round(n / 1000) + 'K';
    return '$' + Math.round(n);
  }

  function quantRiskOpenRisks() {
    return S.risks.filter(function (r) { return r.status !== 'Closed'; }).map(function (r) {
      var q = residual(r);
      return { id: r.id, title: r.title, L: q.L, I: q.I, band: band(q.L * q.I) };
    });
  }

  function renderQuantRisk() {
    var kpiEl = document.getElementById('qrKpiRow');
    var lecEl = document.getElementById('qrLecWrap');
    var assumptionsEl = document.getElementById('qrAssumptionsWrap');
    var rowsEl = document.getElementById('qrRiskRows');
    if (!kpiEl) return;

    var openRisks = quantRiskOpenRisks();
    if (!openRisks.length) {
      kpiEl.innerHTML = '';
      if (lecEl) lecEl.innerHTML = '<p style="color:var(--paper-faint);font-size:13px">No open risks to simulate.</p>';
      if (rowsEl) rowsEl.innerHTML = '<tr><td colspan="6" style="color:var(--paper-faint)">No open risks.</td></tr>';
      if (assumptionsEl) assumptionsEl.innerHTML = '';
      return;
    }

    /* Seeded fresh each render from the wall clock — real use never
       needs bit-for-bit reproducibility across renders (a new trial
       set every time is exactly what "automatic" means here); the
       ENGINE itself (lib.js) stays a pure, seed-in function so tests
       can pin a seed and get an exact, hand-verifiable result. */
    var seed = Math.floor(Date.now() % 4294967296);
    var portfolio = window.CheckpointLib.simulatePortfolioLosses(openRisks, QUANT_RISK_TRIALS, seed);
    var portfolioSummary = window.CheckpointLib.summarizeLossDistribution(portfolio.portfolioTotals);
    var curve = window.CheckpointLib.lossExceedanceCurve(portfolio.portfolioTotals, 40);

    kpiEl.innerHTML =
      '<div class="card kpi"><div class="kpi-num"><b>' + esc(fmtUsdCompact(portfolioSummary.mean)) + '</b></div><span>Mean annual loss (simulated ALE)</span><div class="sub">' + openRisks.length + ' open risk' + (openRisks.length === 1 ? '' : 's') + ' · ' + QUANT_RISK_TRIALS.toLocaleString() + ' trials</div></div>' +
      '<div class="card kpi"><div class="kpi-num"><b>' + esc(fmtUsdCompact(portfolioSummary.p90)) + '</b></div><span>P90 annual loss</span><div class="sub">1-in-10 years this bad or worse</div></div>' +
      '<div class="card kpi"><div class="kpi-num"><b>' + esc(fmtUsdCompact(portfolioSummary.p99)) + '</b></div><span>P99 annual loss</span><div class="sub">1-in-100 years this bad or worse</div></div>' +
      '<div class="card kpi"><div class="kpi-num"><b>' + esc(fmtUsdCompact(portfolioSummary.max)) + '</b></div><span>Worst simulated year</span><div class="sub">across all ' + QUANT_RISK_TRIALS.toLocaleString() + ' trials</div></div>';

    if (lecEl) {
      lecEl.innerHTML = window.ReportEngine.charts.lossExceedance(curve, { interactive: true, palette: 'app' });
      initSvgTooltip(lecEl);
    }

    if (assumptionsEl) {
      var bands = window.CheckpointLib.RISK_FINANCIAL_BANDS;
      var scoreLabels = { 1: '1 — Rare / Negligible', 2: '2 — Unlikely / Minor', 3: '3 — Possible / Moderate', 4: '4 — Likely / Major', 5: '5 — Almost certain / Severe' };
      assumptionsEl.innerHTML = '<table style="width:100%;font-size:12px"><thead><tr><th style="text-align:left;padding:4px 6px;color:var(--paper-faint);font-weight:600">Score</th><th style="text-align:left;padding:4px 6px;color:var(--paper-faint);font-weight:600">Loss per event</th><th style="text-align:left;padding:4px 6px;color:var(--paper-faint);font-weight:600">Events/year</th></tr></thead><tbody>' +
        [1, 2, 3, 4, 5].map(function (s) {
          var loss = bands.lossUsd[s], freq = bands.eventsPerYear[s];
          return '<tr><td style="padding:4px 6px">' + esc(scoreLabels[s]) + '</td>' +
            '<td style="padding:4px 6px">' + fmtUsdCompact(loss.min) + '–' + fmtUsdCompact(loss.max) + ' (likely ' + fmtUsdCompact(loss.likely) + ')</td>' +
            '<td style="padding:4px 6px">' + freq.min + '–' + freq.max + ' (likely ' + freq.likely + ')</td></tr>';
        }).join('') + '</tbody></table>';
    }

    if (rowsEl) {
      var ranked = portfolio.perRisk.map(function (pr, i) {
        var summary = window.CheckpointLib.summarizeLossDistribution(pr.losses);
        return { id: pr.id, risk: openRisks[i], summary: summary };
      }).sort(function (a, b) { return b.summary.p90 - a.summary.p90; });
      rowsEl.innerHTML = ranked.map(function (r) {
        return '<tr><td class="id-t">' + esc(r.id) + '</td><td>' + esc(r.risk.title) + '</td>' +
          '<td><span class="chip sev-' + r.risk.band + '">' + esc(r.risk.band) + '</span></td>' +
          '<td>' + esc(fmtUsdCompact(r.summary.mean)) + '</td>' +
          '<td><b>' + esc(fmtUsdCompact(r.summary.p90)) + '</b></td>' +
          '<td>' + esc(fmtUsdCompact(r.summary.p99)) + '</td></tr>';
      }).join('');
    }
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
      '<div class="card board-tile" data-action="App.go" data-id="scan"><b' + (last ? ' data-count="' + last.score + '"' : '') + '>' + (last ? last.score : '—') + '<small>/100</small> ' + scoreTrend + '</b><span>Posture score</span></div>' +
      (primaryFw ? '<div class="card board-tile" data-action="App.goSoaFw" data-id="' + primaryFw + '">' : '<div class="card board-tile">') + '<b data-count="' + readyPct + '">' + readyPct + '<small>%</small></b><span>' + (primaryFw ? esc(fwName(primaryFw)) : 'No framework') + ' readiness</span></div>' +
      '<div class="card board-tile" data-action="App.goRisksSeverity" data-id="HighCritical"><b data-count="' + crit + '" style="color:' + (crit ? 'var(--fail)' : 'var(--gold-light)') + '">' + crit + '</b><span>High / critical risks</span></div>' +
      '<div class="card board-tile" data-action="App.goActionsFilter" data-id="Overdue"><b data-count="' + od + '" style="color:' + (od ? 'var(--fail)' : 'var(--gold-light)') + '">' + od + '</b><span>Overdue actions</span></div>';
    runCountUps(heroEl);

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
        return '<div class="d-kv clickable" data-action="App.openRisk" data-id="' + r.id + '"><span>' + esc(r.title) + '</span><b><span class="chip sev-' + rb + '">' + rb + '</span></b></div>';
      }).join('') : '<p style="color:var(--paper-faint);font-size:13px">No open risks.</p>';
    }

    var msEl = document.getElementById('boardMilestones');
    if (msEl) {
      var today = new Date().toISOString().slice(0, 10);
      var nextAudit = (S.audits || []).filter(function (a) { return a.status === 'Planned'; }).sort(function (a, b) { return (a.planned || '').localeCompare(b.planned || ''); })[0];
      var lastReview = (S.reviews || [])[S.reviews.length - 1];
      var upcomingCal = (S.calendar || []).filter(function (c) { return c.status !== 'Done'; }).sort(function (a, b) { return (a.nextDue || '').localeCompare(b.nextDue || ''); })[0];
      msEl.innerHTML =
        '<div class="d-kv clickable" data-action="App.go" data-id="audits"><span>Next internal audit</span><b>' + (nextAudit ? fmtDate(nextAudit.planned) + ' — ' + esc(nextAudit.scope) : 'None scheduled') + '</b></div>' +
        '<div class="d-kv clickable" data-action="App.go" data-id="reviews"><span>Next management review</span><b>' + (lastReview && lastReview.nextDue ? fmtDate(lastReview.nextDue) : 'Not set') + '</b></div>' +
        '<div class="d-kv clickable" data-action="App.go" data-id="calendar"><span>Next ISMS activity</span><b>' + (upcomingCal ? fmtDate(upcomingCal.nextDue) + ' — ' + esc(upcomingCal.title) : 'None scheduled') + '</b></div>';
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
      /* Framework rows persist in S.controls for good — once a
         framework's ever been entitled and its controls seeded into the
         SharePoint list, downgrading only flips S.entitlements[fw] off,
         it never deletes those rows (see reconcileControls()/
         seedControls() in store.js: additive only, no counterpart that
         removes anything). Skip anything not currently entitled, same
         "only show what this client actually holds today" treatment the
         AI Systems block below already gives its own entitlement. */
      if (!S.entitlements || !S.entitlements[c.fw]) return;
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
    /* window._docs is only populated once the Documents view has loaded
       at least once this session (Store.listDocuments() is async — see
       renderDocuments()); searching before that just means no document
       hits yet, same "index only what's actually loaded" limitation
       the rest of this function already has for entitlement-gated data. */
    (window._docs || []).forEach(function (d) {
      if (d.name.toLowerCase().indexOf(q) > -1 || (d.category || '').toLowerCase().indexOf(q) > -1) {
        out.push({ type: 'Document', id: d.name, label: d.name + ' (' + (d.category || 'Other') + ')', view: 'documents', url: d.url });
      }
    });
    return out.slice(0, 20);
  }

  /* ================= Command palette support ================= */

  var VIEW_LABELS = {
    dash: 'Dashboard', board: 'Board view', scan: 'Posture scan', risks: 'Risk register',
    actions: 'Actions register', vendors: 'Vendor risk', aisystems: 'AI systems',
    frameworks: 'Frameworks', soa: 'Statement of Applicability', sharedevidence: 'Shared evidence',
    documents: 'Documents', attestations: 'Policy attestation', training: 'Training', audits: 'Internal audits', reviews: 'Management review',
    calendar: 'Compliance calendar', incidents: 'Incidents', auditlog: 'Audit log', reports: 'Audit reports',
    trustcenter: 'Trust Center', auditorpack: 'Auditor pack', aiassistant: 'AI assistant',
    questionnaire: 'Questionnaire assistant', mockauditor: 'Mock auditor', evidencesim: 'Evidence request simulator'
  };
  var REPORT_LABELS = { soa: 'Statement of Applicability', risk: 'Risk register snapshot', rtp: 'Risk treatment plan', ready: 'Audit readiness report', mgmt: 'Management review pack', exec: 'Executive summary', questionnaire: 'Questionnaire responses', evidencereq: 'Evidence request list' };

  /* A nav item only exists in the DOM (and is only ever shown) once
     it's licence/entitlement-gated on — see renderFeatureVisibility()'s
     many style.display toggles — so "does a visible nav item exist for
     this view" is the same check that view's own nav link already
     uses, reused here rather than re-deriving the same gating rules a
     second time for the palette. */
  function isNavVisible(v) {
    var nav = document.querySelector('.nav-item[data-v="' + v + '"]');
    return !!nav && nav.style.display !== 'none';
  }

  function buildCommands() {
    var out = [];
    out.push({ id: 'cmd-scan', label: 'Run posture scan', run: function () { App.go('scan'); App.runScan(); } });
    Object.keys(REPORT_LABELS).forEach(function (key) {
      out.push({ id: 'cmd-report-' + key, label: 'Generate ' + REPORT_LABELS[key] + ' report', run: function () { App.go('reports'); App.report(key); } });
    });
    /* Same "hidden for a read-only Viewer" rule as the +Add buttons
       these open (see HIDE_ACTIONS) — the palette shouldn't offer a
       shortcut to a form a Viewer can't submit anyway. */
    if (!READONLY) {
      out.push({ id: 'cmd-add-risk', label: 'Add risk', run: function () { App.go('risks'); App.toggleAddRisk(); } });
      out.push({ id: 'cmd-add-action', label: 'Add action', run: function () { App.go('actions'); App.toggleAddAction(); } });
      out.push({ id: 'cmd-add-audit', label: 'Add audit', run: function () { App.go('audits'); App.toggleAddAudit(); } });
      out.push({ id: 'cmd-add-review', label: 'Add review', run: function () { App.go('reviews'); App.toggleAddReview(); } });
      out.push({ id: 'cmd-add-calendar', label: 'Add calendar item', run: function () { App.go('calendar'); App.toggleAddCalItem(); } });
      out.push({ id: 'cmd-add-incident', label: 'Log incident', run: function () { App.go('incidents'); App.toggleAddIncident(); } });
    }
    Object.keys(VIEW_LABELS).forEach(function (v) {
      if (!isNavVisible(v)) return;
      out.push({ id: 'cmd-go-' + v, label: 'Go to ' + VIEW_LABELS[v], run: function () { App.go(v); } });
    });
    EXPORT_REGISTERS.forEach(function (reg) {
      out.push({ id: 'cmd-export-' + reg.key, label: 'Export ' + reg.label + ' CSV', run: function () { App.exportCsv(reg.key); } });
    });
    out.push({ id: 'cmd-theme', label: 'Toggle light theme', run: function () { App.toggleLightTheme(); } });
    out.push({ id: 'cmd-boardroom', label: 'Present (Boardroom mode)', run: function () { App.enterBoardroom(); } });
    return out;
  }

  function recordRecentCommand(id) {
    _recentCommandIds = [id].concat(_recentCommandIds.filter(function (x) { return x !== id; })).slice(0, 5);
  }

  /* Subsequence fuzzy match: every character of `query`, lowercased,
     must appear in `text` in the same order (not necessarily
     contiguous) — the standard "type letters in order" command-palette
     match, e.g. "gnrsk" matches "Generate Risk register snapshot
     report". Returns null on no match, or {score, indices} where a
     higher score means a tighter/earlier match (contiguous runs score
     better than scattered ones, an earlier first match scores better
     than a later one) so results can be ranked, and `indices` are the
     matched character positions for highlightMatch() below. */
  function fuzzyMatch(text, query) {
    if (!query) return { score: 0, indices: [] };
    var t = text.toLowerCase(), q = query.toLowerCase();
    var ti = 0, indices = [];
    for (var qi = 0; qi < q.length; qi++) {
      var found = t.indexOf(q.charAt(qi), ti);
      if (found === -1) return null;
      indices.push(found);
      ti = found + 1;
    }
    var score = -indices[0];
    for (var i = 1; i < indices.length; i++) score += (indices[i] === indices[i - 1] + 1) ? 3 : -(indices[i] - indices[i - 1]);
    return { score: score, indices: indices };
  }

  /* Wraps the matched characters from fuzzyMatch()'s `indices` in
     <mark>, escaping every other character exactly as esc() would —
     never trusts `text` unescaped just because it's wrapping some of
     it in markup. */
  function highlightMatch(text, indices) {
    if (!indices || !indices.length) return esc(text);
    var out = '', last = 0;
    indices.forEach(function (i) {
      out += esc(text.slice(last, i)) + '<mark>' + esc(text.charAt(i)) + '</mark>';
      last = i + 1;
    });
    out += esc(text.slice(last));
    return out;
  }

  function highlightPaletteRow(hi) {
    var rows = document.querySelectorAll('#cmdkResults .gsearch-row');
    rows.forEach(function (row, i) {
      row.classList.toggle('hi', i === hi);
      row.setAttribute('aria-selected', i === hi ? 'true' : 'false');
    });
    var input = document.getElementById('cmdkInput');
    if (rows[hi]) { input.setAttribute('aria-activedescendant', rows[hi].id); rows[hi].scrollIntoView({ block: 'nearest' }); }
    else input.removeAttribute('aria-activedescendant');
  }

  /* Builds the grouped, ranked result set for the current query and
     renders it — empty query shows Recent (if any) + the full command
     list (no records, since an unfiltered record dump of every risk/
     action/control would be noise); a non-empty query fuzzy-matches
     commands and substring-matches records (buildSearchIndex's own
     rule, unchanged) and groups them Commands / Records, matching the
     existing gs-type chip row styling either way. */
  function renderPalette(query) {
    var q = (query || '').trim();
    var commands = buildCommands();
    var groups = [];
    if (!q) {
      var recent = _recentCommandIds.map(function (id) { return commands.find(function (c) { return c.id === id; }); }).filter(Boolean);
      if (recent.length) groups.push({ label: 'Recent', items: recent.map(function (c) { return { kind: 'command', cmd: c, label: c.label, indices: [] }; }) });
      groups.push({ label: 'Commands', items: commands.map(function (c) { return { kind: 'command', cmd: c, label: c.label, indices: [] }; }) });
    } else {
      var ql = q.toLowerCase();
      var cmdMatches = [];
      commands.forEach(function (c) {
        var m = fuzzyMatch(c.label, ql);
        if (m) cmdMatches.push({ kind: 'command', cmd: c, label: c.label, indices: m.indices, score: m.score });
      });
      cmdMatches.sort(function (a, b) { return b.score - a.score; });
      var records = buildSearchIndex(ql).map(function (r) {
        var m = fuzzyMatch(r.label, ql);
        return { kind: 'record', rec: r, label: r.label, indices: m ? m.indices : [] };
      });
      if (cmdMatches.length) groups.push({ label: 'Commands', items: cmdMatches.slice(0, 8) });
      if (records.length) groups.push({ label: 'Records', items: records.slice(0, 12) });
    }

    var flat = [];
    groups.forEach(function (g) { g.items.forEach(function (it) { flat.push(it); }); });
    _paletteResults = flat;
    _paletteHi = flat.length ? 0 : -1;

    var el = document.getElementById('cmdkResults');
    var input = document.getElementById('cmdkInput');
    if (!flat.length) {
      el.innerHTML = '<div class="gsearch-empty">No matches' + (q ? ' for "' + esc(q) + '"' : '') + '.</div>';
      input.setAttribute('aria-expanded', 'false');
      input.removeAttribute('aria-activedescendant');
      return;
    }
    var idx = 0;
    el.innerHTML = groups.map(function (g) {
      if (!g.items.length) return '';
      return '<div class="cmdk-group-label">' + esc(g.label) + '</div>' + g.items.map(function (it) {
        var i = idx++;
        var typeChip = it.kind === 'command' ? 'Command' : it.rec.type;
        return '<div class="gsearch-row" id="cmdk-opt-' + i + '" role="option" aria-selected="false" data-mousedown-action="App.executePaletteItem" data-id="' + i + '">' +
          '<span class="gs-type">' + esc(typeChip) + '</span><span class="gs-label">' + highlightMatch(it.label, it.indices) + '</span></div>';
      }).join('');
    }).join('');
    input.setAttribute('aria-expanded', 'true');
    highlightPaletteRow(0);
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
  var AI_CONTEXT_SECTION_LABELS = { scanSummary: 'Latest scan summary', soaSummary: 'Statement of Applicability summary', risks: 'Open risks', actions: 'Open actions', calendar: 'Upcoming calendar items', auditFindings: 'Recent internal/external audits', controlList: 'Applicable controls list' };

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
    var recentAudits = (S.audits || []).slice()
      .sort(function (a, b) { return (b.completed || b.planned || '').localeCompare(a.completed || a.planned || ''); })
      .map(function (a) { return { id: a.id, fw: fwName(a.fw), status: a.status, summary: a.summary || '' }; });
    return {
      scanSummary: { postureScore: last ? last.score : null, lastScanDate: last ? last.date : null, criticalRisks: S.risks.filter(function (r) { if (r.status === 'Closed') return false; var q = residual(r); return band(q.L * q.I) === 'Critical' || band(q.L * q.I) === 'High'; }).length, readinessByFw: readinessByFw },
      soaSummary: { implemented: totalImplemented, total: totalApplicable, byFramework: byFramework },
      risks: openRisks,
      actions: openActions,
      calendar: upcomingCal,
      auditFindings: recentAudits
    };
  }

  /* "Gaps" context — feeds the Mock Auditor feature (§6). Unevidenced
     implemented controls uses the SAME definition renderSoa()'s own
     evidence-coverage gauge already uses (app.js:1089) — Implemented
     but neither an evidence link nor a verification recorded. Failing
     posture checks is this app's closest concrete analogue to a
     "non-conformity" — there's no separate NC register (see ai
     entitlement task's research), so it's labelled honestly as a
     proxy rather than implying a formal NC tracking feature exists. */
  function aiBuildGapsDataBag() {
    var unevidencedControls = entitledFrameworks().reduce(function (acc, fw) {
      return acc.concat(frameworkAppRows(fw).filter(function (c) { return c.st === 'Implemented' && !c.evidenceUrl && !c.verified; })
        .map(function (c) { return { code: c.id, title: c.t }; }));
    }, []);
    var failingChecks = window.CHECK_DEFS.filter(function (c) { return checkResult(c) === 'fail'; }).map(function (c) { return { label: c.label }; });
    var overdueActionsList = (S.actions || []).filter(overdue).map(function (a) { return { id: a.id, title: a.title, dueDate: a.due }; });
    return { unevidencedControls: unevidencedControls, failingChecks: failingChecks, overdueActions: overdueActionsList };
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

  /* ================= Compliance Copilot (drawer chat panel) =================
     A standalone chat drawer — not tied to any one record, reachable
     from #navCopilot anywhere in the app once entitled. Chat history is
     in-memory only (this array), never persisted, never audited beyond
     what CheckpointAI.chat() already logs (feature/deployment/outcome/
     timestamp, never message text) — a page reload starts a fresh
     conversation. Uses the SAME governance-wrapped chat() as every
     other AI feature; nothing here bypasses the disclaimer, the system
     prompt, or the rate limit. */
  var COPILOT_STARTERS = [
    'What would fail an audit tomorrow?',
    'Which controls have no evidence?',
    'Summarise our posture for the board',
    'What are our top 3 open risks right now?',
    'Which overdue actions need attention first?',
    'What should we prioritise before our next scan?'
  ];
  var _copilotHistory = []; /* [{role:'user'|'ai', text}], in-memory only */

  function renderCopilotMessages() {
    var el = document.getElementById('copilotMessages');
    if (!el) return;
    el.innerHTML = _copilotHistory.map(function (m) {
      if (m.role === 'user') {
        return '<div style="text-align:right;margin-bottom:10px"><div style="display:inline-block;background:var(--gold-light);color:#0B0B0C;padding:8px 12px;border-radius:10px;max-width:85%;font-size:13px;text-align:left">' + esc(m.text) + '</div></div>';
      }
      return '<div style="margin-bottom:14px"><div class="chip st-Intreatment" style="margin-bottom:6px">' + esc(window.CheckpointAI.DISCLAIMER) + '</div>' +
        '<div style="font-size:13px;line-height:1.6">' + escAiText(m.text) + '</div></div>';
    }).join('') || '<p style="color:var(--paper-faint);font-size:12.5px">Ask a question, or pick a starter below.</p>';
    el.scrollTop = el.scrollHeight;
  }

  function renderCopilotDrawer() {
    document.getElementById('drawer').innerHTML =
      '<button class="x" data-action="App.closeDrawer">' + icon('close') + '</button>' +
      '<div class="id-t">Grounded in your own registers · never writes anything</div><h2>Compliance Copilot</h2>' +
      '<div id="copilotMessages" style="max-height:42vh;overflow-y:auto;margin:14px 0"></div>' +
      '<div id="copilotStarters" style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px">' +
      COPILOT_STARTERS.map(function (q) { return '<button class="btn ghost sm" data-action="App.copilotAskStarter" data-id="' + esc(q) + '">' + esc(q) + '</button>'; }).join('') +
      '</div>' +
      '<textarea id="copilotInput" class="mini" style="width:100%;min-height:60px;font-family:Manrope" placeholder="Ask about your compliance state…"></textarea>' +
      '<button class="btn sm" id="copilotSendBtn" data-action="App.copilotSend" style="margin-top:10px">Send</button>';
    renderCopilotMessages();
  }

  /* ================= /Compliance Copilot =================*/

  /* ================= Questionnaire assistant ================= */
  /* Last generated batch — the ONLY place the questionnaire's Q&A
     content lives outside the DOM; REPORT_BUILDERS.questionnaire reads
     it directly (same implicit-shared-state pattern S.lastResults/
     window._soaFw already use for every other report builder). Reset
     to null on a fresh "Get answers" run, so exporting always reflects
     the CURRENT batch, never a stale one from earlier in the session. */
  var _questionnaireResult = null;

  function renderQuestionnaireAssistant() {
    var cfg = aiGetConfig();
    var ready = cfg.enabled && cfg.endpoint && cfg.deployment;
    var notConfiguredEl = document.getElementById('questionnaireNotConfigured');
    var configuredEl = document.getElementById('questionnaireConfigured');
    if (!ready) {
      notConfiguredEl.innerHTML = '<div class="card" style="max-width:640px;color:var(--paper-dim)"><b style="color:var(--paper)">AI assistant not configured yet</b><p style="margin-top:8px;font-size:13px">Configure the AI assistant first — see <a href="AI-SETUP.md" target="_blank" rel="noopener">AI-SETUP.md</a>.</p></div>';
      notConfiguredEl.style.display = '';
      configuredEl.style.display = 'none';
      return;
    }
    notConfiguredEl.style.display = 'none';
    configuredEl.style.display = '';
    renderQuestionnaireResult();
  }

  function renderQuestionnaireResult() {
    var el = document.getElementById('questionnaireResult');
    if (!el) return;
    if (!_questionnaireResult || !_questionnaireResult.length) { el.innerHTML = ''; return; }
    var confChip = function (c) { return c === 'High' ? 'st-Implemented' : c === 'Medium' ? 'st-Intreatment' : 'st-Notstarted'; };
    el.innerHTML = '<div class="card" style="padding:0 10px;overflow-x:auto;margin-bottom:16px"><table><thead><tr><th scope="col">Question</th><th scope="col">Answer</th><th scope="col">Confidence</th><th scope="col">What to verify</th></tr></thead><tbody>' +
      _questionnaireResult.map(function (qa) {
        return '<tr><td>' + esc(qa.question) + '</td><td>' + escAiText(qa.answer) + '</td><td><span class="chip ' + confChip(qa.confidence) + '">' + esc(qa.confidence) + '</span></td><td class="src">' + esc(qa.verify) + '</td></tr>';
      }).join('') + '</tbody></table></div>' +
      '<div class="chip st-Intreatment" style="margin-bottom:10px">' + esc(window.CheckpointAI.DISCLAIMER) + '</div>' +
      '<div><button class="btn ghost sm" data-action="App.report" data-id="questionnaire">Export as report (AI-assisted)</button></div>';
  }

  /* ================= /Questionnaire assistant ================= */

  /* ================= Mock auditor ================= */
  function renderMockAuditor() {
    var cfg = aiGetConfig();
    var ready = cfg.enabled && cfg.endpoint && cfg.deployment;
    var notConfiguredEl = document.getElementById('mockAuditorNotConfigured');
    var configuredEl = document.getElementById('mockAuditorConfigured');
    if (!ready) {
      notConfiguredEl.innerHTML = '<div class="card" style="max-width:640px;color:var(--paper-dim)"><b style="color:var(--paper)">AI assistant not configured yet</b><p style="margin-top:8px;font-size:13px">Configure the AI assistant first — see <a href="AI-SETUP.md" target="_blank" rel="noopener">AI-SETUP.md</a>.</p></div>';
      notConfiguredEl.style.display = '';
      configuredEl.style.display = 'none';
      return;
    }
    notConfiguredEl.style.display = 'none';
    configuredEl.style.display = '';
  }

  function renderMockAuditorResult(qa) {
    var el = document.getElementById('mockAuditorResult');
    if (!el) return;
    if (!qa || !qa.length) { el.innerHTML = ''; return; }
    el.innerHTML = '<div class="chip st-Intreatment" style="margin-bottom:12px">' + esc(window.CheckpointAI.DISCLAIMER) + '</div>' +
      qa.map(function (q, i) {
        return '<div class="card" style="margin-bottom:12px"><div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px"><b>Q' + (i + 1) + '. ' + esc(q.question) + '</b>' + (q.gapFlag ? '<span class="chip st-Open">Gap</span>' : '<span class="chip st-Implemented">Covered</span>') + '</div><div style="margin-top:8px;font-size:13px">' + escAiText(q.answer) + '</div></div>';
      }).join('');
  }

  /* ================= /Mock auditor ================= */

  /* ================= Evidence request simulator ================= */
  /* Last generated batch — same implicit-shared-state pattern
     _questionnaireResult already uses; REPORT_BUILDERS.evidencereq reads
     it directly. Reset only by a fresh "Generate" run, so exporting
     always reflects the current framework's current batch. */
  var _evidenceRequestResult = null;

  /* This tenant's own Implemented controls for `fw`, fed to ai.js as the
     controlList context section — the ONLY control codes the model is
     allowed to reference (see buildEvidenceRequestPrompt()'s comment).
     Scoped to Implemented controls only: a control that isn't yet
     implemented has nothing an auditor would request evidence FOR — that
     belongs in the gap list, not an evidence request. Sorted by code for
     a stable, deterministic truncation if there are more than ai.js's
     MAX_LIST_ITEMS. */
  function aiBuildControlListDataBag(fw) {
    return frameworkAppRows(fw).filter(function (c) { return c.st === 'Implemented'; })
      .map(function (c) { return { code: c.id, title: c.t }; })
      .sort(function (a, b) { return a.code.localeCompare(b.code); });
  }

  function renderEvidenceRequestSim() {
    var cfg = aiGetConfig();
    var ready = cfg.enabled && cfg.endpoint && cfg.deployment;
    var notConfiguredEl = document.getElementById('evidenceSimNotConfigured');
    var configuredEl = document.getElementById('evidenceSimConfigured');
    if (!ready) {
      notConfiguredEl.innerHTML = '<div class="card" style="max-width:640px;color:var(--paper-dim)"><b style="color:var(--paper)">AI assistant not configured yet</b><p style="margin-top:8px;font-size:13px">Configure the AI assistant first — see <a href="AI-SETUP.md" target="_blank" rel="noopener">AI-SETUP.md</a>.</p></div>';
      notConfiguredEl.style.display = '';
      configuredEl.style.display = 'none';
      return;
    }
    notConfiguredEl.style.display = 'none';
    configuredEl.style.display = '';
    var tabsEl = document.getElementById('evidenceSimFwTabs');
    var entitled = entitledFrameworks();
    if (!entitled.length) {
      tabsEl.innerHTML = '<span style="color:var(--paper-faint);font-size:13px">No frameworks purchased yet — enable one from the Frameworks view.</span>';
      document.getElementById('evidenceSimResult').innerHTML = '';
      return;
    }
    if (!window._soaFw || entitled.indexOf(window._soaFw) === -1) window._soaFw = entitled[0];
    var activeFw = window._soaFw;
    tabsEl.innerHTML = entitled.map(function (fw) {
      return '<button class="f-pill' + (fw === activeFw ? ' on' : '') + '" aria-pressed="' + (fw === activeFw ? 'true' : 'false') + '" data-action="App.setEvidenceSimFw" data-id="' + fw + '">' + esc(fwName(fw)) + '</button>';
    }).join('');
    renderEvidenceRequestSimResult();
  }

  function renderEvidenceRequestSimResult() {
    var el = document.getElementById('evidenceSimResult');
    if (!el) return;
    var rows = _evidenceRequestResult || [];
    if (!rows.length) { el.innerHTML = ''; return; }
    var readyCount = rows.filter(function (r) { return r.status === 'ready'; }).length;
    el.innerHTML = '<div class="chip st-Intreatment" style="margin-bottom:12px">' + esc(window.CheckpointAI.DISCLAIMER) + '</div>' +
      '<p style="font-size:13px;color:var(--paper-dim);margin-bottom:12px">' + readyCount + ' of ' + rows.length + ' item(s) have evidence on hand right now.</p>' +
      '<div class="card" style="padding:0 10px;overflow-x:auto;margin-bottom:16px"><table><thead><tr><th scope="col">Evidence requested</th><th scope="col">Related control</th><th scope="col">Status</th></tr></thead><tbody>' +
      rows.map(function (r) {
        var statusChip = r.status === 'ready' ? '<span class="chip st-Implemented">Ready</span>' : '<span class="chip st-Open">Missing</span>';
        var ctrlCell = (r.controlCode && r.controlCode !== 'General')
          ? '<span class="id-t">' + esc(r.controlCode) + '</span>' + (r.controlTitle ? ' — ' + esc(r.controlTitle) : '')
          : '<i style="color:var(--paper-faint)">General</i>';
        var evLink = (r.status === 'ready' && r.evidenceUrl && isSafeUrl(r.evidenceUrl))
          ? '<br><a href="' + esc(r.evidenceUrl) + '" target="_blank" rel="noopener" class="evidence-link">Evidence ' + icon('external') + '</a>'
          : '';
        return '<tr><td>' + esc(r.item) + evLink + '</td><td>' + ctrlCell + '</td><td>' + statusChip + '</td></tr>';
      }).join('') + '</tbody></table></div>' +
      '<div><button class="btn ghost sm" data-action="App.report" data-id="evidencereq">Export as report (AI-assisted)</button></div>';
  }

  /* ================= /Evidence request simulator ================= */

  /* ================= /AI assistant =================*/

  function renderFrameworksAdmin() {
    var wrap = document.getElementById('fwAdminRows');
    if (!wrap) return;

    renderLicensePanel('licensePanel');

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
      var displayNameCurrent = (S.settings && S.settings.clientDisplayName) || '';
      var brandColorCurrent = clientBrandColor();
      var footerTextCurrent = (S.settings && S.settings.reportFooterText) || '';
      var tenantRaw = (document.getElementById('clientName') || { getAttribute: function () { return ''; } }).getAttribute('data-tenant') || '';
      var lbl = 'display:block;font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--paper-faint);font-weight:700;margin:0 0 6px';
      reportEl.innerHTML = '<h3>Client branding</h3>' +
        '<p style="font-size:12.5px;color:var(--paper-dim);margin:0 0 16px">How this client appears across the console, Boardroom Mode and every generated report — display name, logo, accent colour, classification marking and printed footer. Everything here is per-tenant: each client’s Checkpoint carries their own branding.</p>' +

        '<div style="margin-bottom:16px"><span style="' + lbl + '">Client display name</span>' +
        '<div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap">' +
        '<input class="mini" id="clientDisplayNameInput" placeholder="' + esc(tenantRaw || 'e.g. Acme Group Pty Ltd') + '" value="' + esc(displayNameCurrent) + '" style="flex:1;min-width:220px">' +
        '<button class="btn ghost sm" data-action="App.setClientDisplayName">Save</button>' +
        '</div>' +
        '<p class="src" style="margin-top:6px">Shown in the top bar, Boardroom Mode and on reports in place of the raw tenant name' + (tenantRaw ? ' (currently “' + esc(tenantRaw) + '”)' : '') + '. Leave blank to use the tenant name.</p></div>' +

        '<div style="margin-bottom:16px"><span style="' + lbl + '">Client logo</span>' +
        '<div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap">' +
        (logoUrl ? '<img src="' + esc(logoUrl) + '" alt="Client logo" style="max-height:40px;max-width:160px;object-fit:contain;background:#fff;border-radius:4px;padding:4px">' : '<span style="font-size:12.5px;color:var(--paper-faint)">No logo set — reports show the client name only.</span>') +
        '<input type="file" id="clientLogoFileInput" class="mini" accept="image/*">' +
        '<button class="btn sm" data-action="App.uploadClientLogo">Upload logo</button>' +
        (logoUrl ? '<button class="btn ghost sm" data-action="App.clearClientLogo">Clear</button>' : '') +
        '</div>' +
        '<p class="src" style="margin-top:6px">PNG, JPG or SVG, under 40&nbsp;KB — a small wordmark or icon. Appears in the top bar, on report covers and in the running header of every printed page.</p></div>' +

        '<div style="margin-bottom:16px"><span style="' + lbl + '">Report accent colour</span>' +
        '<div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap">' +
        '<input type="color" id="clientBrandColorInput" value="' + esc(brandColorCurrent || '#A9812E') + '" style="width:44px;height:32px;padding:2px;border:1px solid var(--line);border-radius:6px;background:transparent;cursor:pointer">' +
        '<span style="font-size:12.5px;color:var(--paper-dim)">' + (brandColorCurrent ? 'Client colour <b style="font-family:monospace">' + esc(brandColorCurrent) + '</b>' : 'Checkpoint gold (default)') + '</span>' +
        '<button class="btn ghost sm" data-action="App.setClientBrandColor">Save</button>' +
        (brandColorCurrent ? '<button class="btn ghost sm" data-action="App.clearClientBrandColor">Reset to gold</button>' : '') +
        '</div>' +
        '<p class="src" style="margin-top:6px">Recolours report furniture — section rules, KPI figures, the cover framework tag. Charts keep their print-validated palette so a light brand colour can never make one unreadable.</p></div>' +

        '<div style="margin-bottom:16px"><span style="' + lbl + '">Classification marking</span>' +
        '<div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap">' +
        '<input class="mini" id="reportClassificationInput" placeholder="Commercial in Confidence" value="' + esc(classificationCurrent) + '" style="flex:1;min-width:220px">' +
        '<button class="btn ghost sm" data-action="App.setReportClassification">Save</button>' +
        '</div>' +
        '<p class="src" style="margin-top:6px">Carried on the cover and every printed page header. Set to “OFFICIAL: Sensitive” or another marking for a defence/government client.</p></div>' +

        '<div><span style="' + lbl + '">Report footer text</span>' +
        '<div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap">' +
        '<input class="mini" id="reportFooterTextInput" placeholder="Prepared by Compliance365 for ' + esc(displayNameCurrent || tenantRaw || 'the client') + '" value="' + esc(footerTextCurrent) + '" style="flex:1;min-width:220px">' +
        '<button class="btn ghost sm" data-action="App.setReportFooterText">Save</button>' +
        '</div>' +
        '<p class="src" style="margin-top:6px">Optional line printed in the footer of every report page. Leave blank to repeat the classification marking there.</p></div>';
    }

    var themeEl = document.getElementById('themeRow');
    if (themeEl) {
      var isLightNow = document.documentElement.getAttribute('data-theme') === 'light';
      themeEl.innerHTML = '<div><b>Light theme</b><p>Paper surfaces, ink text, the same gold accent — an alternative to the default dark theme. Also available from the command palette.</p></div>' +
        '<button class="toggle' + (isLightNow ? ' on' : '') + '" id="themeToggleBtn" role="switch" aria-checked="' + (isLightNow ? 'true' : 'false') + '" aria-label="Light theme" data-action="App.toggleLightTheme"></button>';
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

    var soc2El = document.getElementById('soc2ReportTypeRow');
    if (soc2El) {
      var soc2TypeCurrent = (S.settings && S.settings.soc2ReportType) || 'Type I';
      var soc2StartCurrent = (S.settings && S.settings.soc2ObservationStart) || '';
      soc2El.innerHTML = '<div class="fw-admin-row"><div><b>SOC 2 report type</b><p>Type I asks whether a control is correctly designed right now — the same point-in-time view every other framework\'s SoA already shows. Type II asks whether it actually operated that way consistently across an observation period, and changes the SOC 2 SoA to show, per automated control, how many posture scans fall in that window and whether any of them found an exception — computed from your existing scan history, not a new signal.</p></div>' +
        '<select class="mini" data-change-action="App.setSoc2ReportType">' +
        ['Type I', 'Type II'].map(function (s) { return '<option value="' + s + '"' + (soc2TypeCurrent === s ? ' selected' : '') + '>' + s + '</option>'; }).join('') +
        '</select></div>' +
        (soc2TypeCurrent === 'Type II' ? '<div class="fw-admin-row" style="margin-top:10px"><div><b>Observation period start</b><p>Posture scans before this date aren\'t counted as Type II observations. Left blank, the operating-effectiveness view falls back to the tenant\'s entire scan history, which almost always overstates the real window — set this to when observation actually began.</p></div>' +
          '<input class="mini" type="date" value="' + esc(soc2StartCurrent) + '" data-change-action="App.setSoc2ObservationStart"></div>' : '');
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
    var aiAssistantOn = !!(S.entitlements && S.entitlements.ai);
    if (aiAssistantNav) {
      aiAssistantNav.style.display = aiAssistantOn ? '' : 'none';
      if (!aiAssistantOn && aiAssistantNav.classList.contains('on')) App.go('dash');
    }
    var copilotNav = document.getElementById('navCopilot');
    if (copilotNav) copilotNav.style.display = aiAssistantOn ? '' : 'none';
    var riskAiDraftRow = document.getElementById('riskAiDraftRow');
    if (riskAiDraftRow) riskAiDraftRow.style.display = aiAssistantOn ? '' : 'none';
    var tplAiTailorRow = document.getElementById('tplAiTailorRow');
    if (tplAiTailorRow) tplAiTailorRow.style.display = aiAssistantOn ? '' : 'none';
    /* Evidence interpretation lives in the Documents view rather than
       behind its own nav item — it belongs next to the library it reads
       artefacts into — so it's hidden the same way the other in-page AI
       surfaces above are. */
    var evidenceInterpretCard = document.getElementById('evidenceInterpretCard');
    if (evidenceInterpretCard) evidenceInterpretCard.style.display = aiAssistantOn ? '' : 'none';
    ['questionnaire', 'mockauditor', 'evidencesim'].forEach(function (v) {
      var nav = document.querySelector('.nav-item[data-v="' + v + '"]');
      if (!nav) return;
      nav.style.display = aiAssistantOn ? '' : 'none';
      if (!aiAssistantOn && nav.classList.contains('on')) App.go('dash');
    });
  }

  /* Persistent, unobtrusive banner for a 'demo' (sales trial) licence
     while it's still valid — "on expiry it follows the standard read-
     only degradation" (task spec) is exactly what already happens for
     every type once ENTITLEMENT_STATE.status flips to 'grace'/'expired'
     (see renderLicensePanel()'s own banner for that) — this banner
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

  function renderAll() { applyTrainingCheckResult(); renderNavCounts(); renderDash(); loadDocumentRegisterInBackground(); renderScanChecks(true); renderCoverage(); renderProposed(); renderRisks(); renderActions(); renderVendors(); renderAiSystems(); renderSoa(); renderFrameworksAdmin(); renderFeatureVisibility(); renderTrialBanner(); }

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
      var activeItem = document.querySelector('.nav-item[data-v="' + v + '"]');
      var activeGroup = activeItem && activeItem.closest('details.nav-group');
      if (activeGroup && !activeGroup.open) activeGroup.open = true; /* reveal the destination, never persisted as a manual choice — see the click-only listener above */
      window.scrollTo(0, 0);
      closeNavUi(); /* no-op on desktop (nav is never .open there) — on mobile, picking a destination should always close the drawer it was picked from */
      if (v === 'documents') renderDocuments();
      if (v === 'attestations') renderAttestations();
      if (v === 'training') renderTraining();
      if (v === 'audits') renderAudits();
      if (v === 'reviews') renderReviews();
      if (v === 'calendar') renderCalendar();
      if (v === 'incidents') renderIncidents();
      if (v === 'auditlog') renderAuditLog();
      if (v === 'board') renderBoard();
      if (v === 'sharedevidence') renderSharedEvidence();
      if (v === 'trustcenter') renderTrustCenter();
      if (v === 'auditorpack') renderAuditorPack();
      if (v === 'scan') renderCoverage();
      if (v === 'selftest') renderSelfTest();
      if (v === 'aiassistant') renderAiAssistant();
      if (v === 'questionnaire') renderQuestionnaireAssistant();
      if (v === 'mockauditor') renderMockAuditor();
      if (v === 'evidencesim') renderEvidenceRequestSim();
      if (v === 'constellation') renderConstellation();
      if (v === 'quantrisk') renderQuantRisk();
    },

    /* ================= Command palette =================
       Promotes the old inline search-dropdown into a centered overlay
       combining buildSearchIndex()'s record search with a static
       command registry (buildCommands() below) — same underlying
       record index and per-type "go there and highlight it" navigation
       the old dropdown used (ported into executePaletteItem), plus
       commands whose handlers just call the existing App.* methods
       nothing new was invented for. See openPalette/closePalette for
       the focus-trap/Escape pattern, shared with the drawer. */
    openPalette: function () {
      var overlay = document.getElementById('cmdkOverlay');
      var box = document.getElementById('cmdk');
      var input = document.getElementById('cmdkInput');
      overlay.classList.add('open');
      box.classList.add('open');
      input.value = '';
      renderPalette('');
      _paletteReturnFocus = document.activeElement;
      if (_paletteKeyHandler) document.removeEventListener('keydown', _paletteKeyHandler);
      _paletteKeyHandler = function (e) {
        if (e.key === 'Escape') { e.preventDefault(); App.closePalette(); return; }
        if (e.key === 'ArrowDown') { e.preventDefault(); App.paletteKeyNav(1); return; }
        if (e.key === 'ArrowUp') { e.preventDefault(); App.paletteKeyNav(-1); return; }
        if (e.key === 'Enter') { e.preventDefault(); App.paletteSelect(); return; }
        trapFocusKeydown(e, box);
      };
      document.addEventListener('keydown', _paletteKeyHandler);
      input.focus();
    },

    closePalette: function () {
      document.getElementById('cmdkOverlay').classList.remove('open');
      document.getElementById('cmdk').classList.remove('open');
      if (_paletteKeyHandler) { document.removeEventListener('keydown', _paletteKeyHandler); _paletteKeyHandler = null; }
      if (_paletteReturnFocus && document.body.contains(_paletteReturnFocus)) _paletteReturnFocus.focus();
      _paletteReturnFocus = null;
    },

    paletteInput: function (q) { renderPalette(q); },

    /* Same aria-activedescendant combobox pattern as the old dropdown
       (see its own removed comment) — real focus stays on #cmdkInput
       throughout, .hi + aria-selected mark the highlighted row. */
    paletteKeyNav: function (dir) {
      var n = _paletteResults.length;
      if (!n) return;
      var hi = _paletteHi === undefined ? -1 : _paletteHi;
      hi = Math.max(0, Math.min(n - 1, hi + dir));
      _paletteHi = hi;
      highlightPaletteRow(hi);
    },

    paletteSelect: function () {
      if (_paletteHi === undefined || _paletteHi < 0) return;
      App.executePaletteItem(_paletteHi);
    },

    executePaletteItem: function (i) {
      var it = _paletteResults[Number(i)];
      if (!it) return;
      App.closePalette();
      if (it.kind === 'command') {
        recordRecentCommand(it.cmd.id);
        it.cmd.run();
        return;
      }
      var r = it.rec;
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
      if (r.type === 'Document' && r.url) { window.open(r.url, '_blank', 'noopener'); return; }
    },

    /* Swaps the color tokens via a data-theme attribute on <html> — every
       component already reads its colors from those tokens, so nothing
       else needs a light-mode rule of its own, EXCEPT the residual risk
       heatmap: its cell text color is precomputed per-cell (see
       pickReadableRgb() in lib.js and renderDash()'s heatmap block)
       rather than a static CSS var(), because the right text color
       depends on that cell's own risk-count alpha, not just the theme —
       so it's the one thing that needs an explicit re-render here.
       Persisted the same way every other per-tenant setting is
       (Store.setSetting) — demo mode already only ever writes that to
       this browser, never a real Settings list, so there's no separate
       "in-memory for demo" branch needed. */
    toggleLightTheme: async function () {
      var isLight = document.documentElement.getAttribute('data-theme') !== 'light';
      applyThemeAttribute(isLight);
      var value = isLight ? 'true' : 'false';
      S.settings.lightTheme = value;
      try { await Store.setSetting('lightTheme', value); } catch (e) { warn(e); }
      var toggleBtn = document.getElementById('themeToggleBtn');
      if (toggleBtn) { toggleBtn.classList.toggle('on', isLight); toggleBtn.setAttribute('aria-checked', isLight ? 'true' : 'false'); }
      renderDash();
    },

    /* Boardroom Mode — see the big comment block above boardroomSlides()
       for the full design. enterBoardroom() is the single entry point
       (the Board view's "Present" button and the command palette both
       call it directly); toggleBoardroomMode() is kept only because
       the command registry/Escape handling has always called it by
       that name — it just dispatches to enter/exit based on current
       state, never a source of truth itself (window._bd.active is). */
    enterBoardroom: async function () {
      if (window._bd && window._bd.active) return;
      boardroomEnter();
    },
    exitBoardroom: function () { boardroomExit(); },
    toggleBoardroomMode: function () {
      if (window._bd && window._bd.active) App.exitBoardroom(); else App.enterBoardroom();
    },
    boardroomNext: function () { boardroomShowSlide((window._bd ? window._bd.index : 0) + 1); },
    boardroomPrev: function () { boardroomShowSlide((window._bd ? window._bd.index : 0) - 1); },
    boardroomGoTo: function (i) { boardroomShowSlide(parseInt(i, 10) || 0); },

    runScanFromDash: function () { App.go('scan'); App.runScan(); },

    runScan: async function () {
      _checkExplainCache = {}; /* a fresh scan means a fresh result/note per check — never show a stale explanation */
      document.getElementById('gCap').textContent = Store.kind === 'demo'
        ? 'Scanning demo tenant…' : 'Scanning tenant via Microsoft Graph…';
      var checkListEl = document.getElementById('checkList');
      if (checkListEl) checkListEl.innerHTML = skeletonBlocks(6);

      var todayIso = new Date().toISOString().slice(0, 10);
      /* AI-governance findings discovered below, held here until the
         proposal list is rebuilt further down. discoverAiSystemsFromScan()
         used to push these straight onto S.proposed — which the
         templated-check block then reset to [], silently throwing every
         one of them away, so an AI finding could never reach the
         approval queue on a live tenant. Collected rather than cleared
         early so a failed Graph scan still returns with the previous
         scan's proposals intact. */
      var aiProposedTpl = [];
      if (Store.kind === 'sharepoint') {
        try {
          var out = await Graph.runPostureChecks(null, S.settings);
          S.lastResults = out.results;
          S.lastNotes = out.notes;
        } catch (e) { warn(e); document.getElementById('gCap').textContent = 'Scan failed'; return; }
        document.getElementById('gCap').textContent = 'Capturing evidence…';
        try { await captureAutoEvidence(out.raw, todayIso); } catch (e) { warn(e); }
        if (S.entitlements.iso42001) {
          try { aiProposedTpl = (await discoverAiSystemsFromScan(out.raw)) || []; } catch (e) { warn(e); }
        }
      }
      /* demo mode keeps its stored lastResults (with remediation flips via checkResult) */

      /* The training check has no Graph signal — it is computed from
         this tenant's own Training register. Applied after the Graph
         checks in both live and demo mode so the two agree, and so the
         score picks it up before the scan is snapshotted below. */
      applyTrainingCheckResult();

      renderScanChecks(false);
      var rows2 = document.querySelectorAll('#checkList .check-row');
      if (prefersReducedMotion()) {
        rows2.forEach(function (r) { r.classList.add('show'); });
      } else {
        rows2.forEach(function (r, i) { setTimeout(function () { r.classList.add('show'); }, Math.min(i * 30, 400)); });
      }

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

      /* queue proposals for unhandled fail/review templated checks, on
         top of whatever AI-system discovery proposed above */
      S.proposed = aiProposedTpl.slice();
      window.CHECK_DEFS.forEach(function (c) {
        if (!c.tpl) return;
        var r = checkResult(c);
        if (r === 'pass' || r === null) return;
        if (S.handledTpl.indexOf(c.tpl) > -1) return;
        if (S.proposed.indexOf(c.tpl) > -1) return;
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

      /* IS18 (QGEA) suggestions — same suggest-only contract as the
         Essential Eight block above, but flat: CHECK_IS18 maps a check
         straight to the IS18 control code(s) it speaks to (no maturity-
         level children to resolve). Same worst-status-wins rule when
         several checks feed one control (e.g. dlp + sharing both speak
         to IS18.3.3), and nothing is written until
         App.confirmIs18Suggestion() is called from the SoA. */
      S.is18Proposed = [];
      if (S.entitlements.is18 && window.CHECK_IS18) {
        var IS18_ST_RANK = { 'Not started': 0, 'In progress': 1, 'Implemented': 2 };
        var byIs18 = {}; /* code -> { suggestedSt, checkLabels: [] } */
        Object.keys(window.CHECK_IS18).forEach(function (checkId) {
          var def = window.CHECK_DEFS.find(function (d) { return d.id === checkId; });
          if (!def) return;
          var r = checkResult(def);
          var suggestedSt = r === 'pass' ? 'Implemented' : r === 'review' ? 'In progress' : r === 'fail' ? 'Not started' : null;
          if (!suggestedSt) return;
          window.CHECK_IS18[checkId].forEach(function (code) {
            var entry = byIs18[code] || (byIs18[code] = { suggestedSt: suggestedSt, checkLabels: [] });
            if (IS18_ST_RANK[suggestedSt] < IS18_ST_RANK[entry.suggestedSt]) entry.suggestedSt = suggestedSt;
            entry.checkLabels.push(def.label);
          });
        });
        Object.keys(byIs18).forEach(function (code) {
          var entry = byIs18[code];
          var ctrl = S.controls.find(function (c) { return c.fw === 'is18' && c.id === code; });
          if (!ctrl || !ctrl.app || ctrl.st === entry.suggestedSt) return;
          S.is18Proposed.push({ checkLabel: entry.checkLabels.join(' · '), code: code, from: ctrl.st, to: entry.suggestedSt });
        });
      }

      /* RFFR (ISM SoA) suggestions — identical flat, suggest-only
         contract to the IS18 block above: CHECK_RFFR maps a Microsoft
         posture check straight to the ISM control identifier(s) its live
         Graph signal evidences, worst-status-wins when several checks
         feed one control, and nothing is written to the SoA until
         App.confirmRffrSuggestion() is called. Only the curated
         ~48-control automatable subset ever appears here; the other ~940
         ISM controls stay self-reported by design. */
      S.rffrProposed = [];
      if (S.entitlements.rffr && window.CHECK_RFFR) {
        var RFFR_ST_RANK = { 'Not started': 0, 'In progress': 1, 'Implemented': 2 };
        var byRffr = {}; /* code -> { suggestedSt, checkLabels: [] } */
        Object.keys(window.CHECK_RFFR).forEach(function (checkId) {
          var def = window.CHECK_DEFS.find(function (d) { return d.id === checkId; });
          if (!def) return;
          var r = checkResult(def);
          var suggestedSt = r === 'pass' ? 'Implemented' : r === 'review' ? 'In progress' : r === 'fail' ? 'Not started' : null;
          if (!suggestedSt) return;
          window.CHECK_RFFR[checkId].forEach(function (code) {
            var entry = byRffr[code] || (byRffr[code] = { suggestedSt: suggestedSt, checkLabels: [] });
            if (RFFR_ST_RANK[suggestedSt] < RFFR_ST_RANK[entry.suggestedSt]) entry.suggestedSt = suggestedSt;
            entry.checkLabels.push(def.label);
          });
        });
        Object.keys(byRffr).forEach(function (code) {
          var entry = byRffr[code];
          var ctrl = S.controls.find(function (c) { return c.fw === 'rffr' && c.id === code; });
          if (!ctrl || !ctrl.app || ctrl.st === entry.suggestedSt) return;
          S.rffrProposed.push({ checkLabel: entry.checkLabels.join(' · '), code: code, from: ctrl.st, to: entry.suggestedSt });
        });
      }

      /* ISO 42001 (AI Management System, Annex A) suggestions — same
         flat, suggest-only contract as the IS18/RFFR blocks above:
         CHECK_ISO42001 maps a Microsoft posture check straight to the
         Annex A control code(s) its live Graph signal evidences,
         worst-status-wins when several checks feed one control, and
         nothing is written to the SoA until
         App.confirmIso42001Suggestion() is called. Only the curated
         technical subset (system/tooling/data access, operation
         monitoring, event logging, incident communication, supplier
         oversight) ever appears here; the governance-heavy Annex A
         controls (policy content, impact assessments, design docs) stay
         self-reported by design — there's no live signal that honestly
         evidences them. */
      S.iso42001Proposed = [];
      if (S.entitlements.iso42001 && window.CHECK_ISO42001) {
        var ISO42001_ST_RANK = { 'Not started': 0, 'In progress': 1, 'Implemented': 2 };
        var byIso42001 = {}; /* code -> { suggestedSt, checkLabels: [] } */
        Object.keys(window.CHECK_ISO42001).forEach(function (checkId) {
          var def = window.CHECK_DEFS.find(function (d) { return d.id === checkId; });
          if (!def) return;
          var r = checkResult(def);
          var suggestedSt = r === 'pass' ? 'Implemented' : r === 'review' ? 'In progress' : r === 'fail' ? 'Not started' : null;
          if (!suggestedSt) return;
          window.CHECK_ISO42001[checkId].forEach(function (code) {
            var entry = byIso42001[code] || (byIso42001[code] = { suggestedSt: suggestedSt, checkLabels: [] });
            if (ISO42001_ST_RANK[suggestedSt] < ISO42001_ST_RANK[entry.suggestedSt]) entry.suggestedSt = suggestedSt;
            entry.checkLabels.push(def.label);
          });
        });
        Object.keys(byIso42001).forEach(function (code) {
          var entry = byIso42001[code];
          var ctrl = S.controls.find(function (c) { return c.fw === 'iso42001' && c.id === code; });
          if (!ctrl || !ctrl.app || ctrl.st === entry.suggestedSt) return;
          S.iso42001Proposed.push({ checkLabel: entry.checkLabels.join(' · '), code: code, from: ctrl.st, to: entry.suggestedSt });
        });
      }

      /* ISO 27701 (PIMS) suggestions — same flat, suggest-only contract
         as the ISO 42001 block above: CHECK_ISO27701 maps a Microsoft
         posture check straight to the P.7.x/P.8.x control code(s) its
         live Graph signal evidences, worst-status-wins when several
         checks feed one control, and nothing is written to the SoA
         until App.confirmIso27701Suggestion() is called. A smaller
         curated subset than ISO 42001's — PIMS is mostly consent,
         data-subject rights and cross-border legal basis, which have no
         live technical signal and stay self-reported by design. */
      S.iso27701Proposed = [];
      if (S.entitlements.iso27701 && window.CHECK_ISO27701) {
        var ISO27701_ST_RANK = { 'Not started': 0, 'In progress': 1, 'Implemented': 2 };
        var byIso27701 = {}; /* code -> { suggestedSt, checkLabels: [] } */
        Object.keys(window.CHECK_ISO27701).forEach(function (checkId) {
          var def = window.CHECK_DEFS.find(function (d) { return d.id === checkId; });
          if (!def) return;
          var r = checkResult(def);
          var suggestedSt = r === 'pass' ? 'Implemented' : r === 'review' ? 'In progress' : r === 'fail' ? 'Not started' : null;
          if (!suggestedSt) return;
          window.CHECK_ISO27701[checkId].forEach(function (code) {
            var entry = byIso27701[code] || (byIso27701[code] = { suggestedSt: suggestedSt, checkLabels: [] });
            if (ISO27701_ST_RANK[suggestedSt] < ISO27701_ST_RANK[entry.suggestedSt]) entry.suggestedSt = suggestedSt;
            entry.checkLabels.push(def.label);
          });
        });
        Object.keys(byIso27701).forEach(function (code) {
          var entry = byIso27701[code];
          var ctrl = S.controls.find(function (c) { return c.fw === 'iso27701' && c.id === code; });
          if (!ctrl || !ctrl.app || ctrl.st === entry.suggestedSt) return;
          S.iso27701Proposed.push({ checkLabel: entry.checkLabels.join(' · '), code: code, from: ctrl.st, to: entry.suggestedSt });
        });
      }

      /* SOC 2 suggestions — same flat, suggest-only contract as the
         blocks above: CHECK_SOC2 maps a Microsoft posture check
         straight to the Trust Services Criteria code(s) its live Graph
         signal evidences, worst-status-wins when several checks feed
         one control, and nothing is written to the SoA until
         App.confirmSoc2Suggestion() is called. The CC6.x/CC7.x access
         and monitoring criteria make this the largest automatable
         subset of any framework; the COSO-derived governance criteria
         and most Privacy/Processing Integrity criteria stay
         self-reported — there's no live signal for board oversight or
         consent records. */
      S.soc2Proposed = [];
      if (S.entitlements.soc2 && window.CHECK_SOC2) {
        var SOC2_ST_RANK = { 'Not started': 0, 'In progress': 1, 'Implemented': 2 };
        var bySoc2 = {}; /* code -> { suggestedSt, checkLabels: [] } */
        Object.keys(window.CHECK_SOC2).forEach(function (checkId) {
          var def = window.CHECK_DEFS.find(function (d) { return d.id === checkId; });
          if (!def) return;
          var r = checkResult(def);
          var suggestedSt = r === 'pass' ? 'Implemented' : r === 'review' ? 'In progress' : r === 'fail' ? 'Not started' : null;
          if (!suggestedSt) return;
          window.CHECK_SOC2[checkId].forEach(function (code) {
            var entry = bySoc2[code] || (bySoc2[code] = { suggestedSt: suggestedSt, checkLabels: [] });
            if (SOC2_ST_RANK[suggestedSt] < SOC2_ST_RANK[entry.suggestedSt]) entry.suggestedSt = suggestedSt;
            entry.checkLabels.push(def.label);
          });
        });
        Object.keys(bySoc2).forEach(function (code) {
          var entry = bySoc2[code];
          var ctrl = S.controls.find(function (c) { return c.fw === 'soc2' && c.id === code; });
          if (!ctrl || !ctrl.app || ctrl.st === entry.suggestedSt) return;
          S.soc2Proposed.push({ checkLabel: entry.checkLabels.join(' · '), code: code, from: ctrl.st, to: entry.suggestedSt });
        });
      }

      /* NIST CSF suggestions — same flat, suggest-only contract as the
         blocks above, targeting the 22 category-level control rows
         (present in a tenant's Controls list at either nistDepth, see
         CHECK_NISTCSF's own comment in store.js). Nothing is written to
         the SoA until App.confirmNistCsfSuggestion() is called. */
      S.nistcsfProposed = [];
      if (S.entitlements.nistcsf && window.CHECK_NISTCSF) {
        var NISTCSF_ST_RANK = { 'Not started': 0, 'In progress': 1, 'Implemented': 2 };
        var byNistCsf = {}; /* code -> { suggestedSt, checkLabels: [] } */
        Object.keys(window.CHECK_NISTCSF).forEach(function (checkId) {
          var def = window.CHECK_DEFS.find(function (d) { return d.id === checkId; });
          if (!def) return;
          var r = checkResult(def);
          var suggestedSt = r === 'pass' ? 'Implemented' : r === 'review' ? 'In progress' : r === 'fail' ? 'Not started' : null;
          if (!suggestedSt) return;
          window.CHECK_NISTCSF[checkId].forEach(function (code) {
            var entry = byNistCsf[code] || (byNistCsf[code] = { suggestedSt: suggestedSt, checkLabels: [] });
            if (NISTCSF_ST_RANK[suggestedSt] < NISTCSF_ST_RANK[entry.suggestedSt]) entry.suggestedSt = suggestedSt;
            entry.checkLabels.push(def.label);
          });
        });
        Object.keys(byNistCsf).forEach(function (code) {
          var entry = byNistCsf[code];
          var ctrl = S.controls.find(function (c) { return c.fw === 'nistcsf' && c.id === code; });
          if (!ctrl || !ctrl.app || ctrl.st === entry.suggestedSt) return;
          S.nistcsfProposed.push({ checkLabel: entry.checkLabels.join(' · '), code: code, from: ctrl.st, to: entry.suggestedSt });
        });
      }

      /* ISO 27001 suggestions — same flat, suggest-only contract as the
         blocks above, but sourced from CHECK_CONTROLS (lib.js/store.js)
         rather than a licensed-pack extra table: ISO 27001 is the base
         framework every tenant is provisioned with by default, and
         CHECK_CONTROLS already exists, unencrypted, as the canonical
         checkId -> ISO 27001 code anchor the OTHER frameworks' evidence
         propagates through (see controlsForCheck() above). Until now
         that table only drove passive evidence-attachment
         (captureAutoEvidence()) — the control's status itself still had
         to be marked Implemented by hand even when the live signal
         already proved it. This closes that gap for ISO 27001 itself,
         the same way the other frameworks now work. 20 checks across 19
         distinct A.5/A.8 codes — the largest distinct-code count of any
         framework, since CHECK_CONTROLS is the anchor every other
         table's coverage was checked against. Nothing is written to the
         SoA until App.confirmIso27001Suggestion() is called. */
      S.iso27001Proposed = [];
      if (S.entitlements.iso27001 && window.CHECK_CONTROLS) {
        var ISO27001_ST_RANK = { 'Not started': 0, 'In progress': 1, 'Implemented': 2 };
        var byIso27001 = {}; /* code -> { suggestedSt, checkLabels: [] } */
        Object.keys(window.CHECK_CONTROLS).forEach(function (checkId) {
          var def = window.CHECK_DEFS.find(function (d) { return d.id === checkId; });
          if (!def) return;
          var r = checkResult(def);
          var suggestedSt = r === 'pass' ? 'Implemented' : r === 'review' ? 'In progress' : r === 'fail' ? 'Not started' : null;
          if (!suggestedSt) return;
          window.CHECK_CONTROLS[checkId].forEach(function (code) {
            var entry = byIso27001[code] || (byIso27001[code] = { suggestedSt: suggestedSt, checkLabels: [] });
            if (ISO27001_ST_RANK[suggestedSt] < ISO27001_ST_RANK[entry.suggestedSt]) entry.suggestedSt = suggestedSt;
            entry.checkLabels.push(def.label);
          });
        });
        Object.keys(byIso27001).forEach(function (code) {
          var entry = byIso27001[code];
          var ctrl = S.controls.find(function (c) { return c.fw === 'iso27001' && c.id === code; });
          if (!ctrl || !ctrl.app || ctrl.st === entry.suggestedSt) return;
          S.iso27001Proposed.push({ checkLabel: entry.checkLabels.join(' · '), code: code, from: ctrl.st, to: entry.suggestedSt });
        });
      }

      var today = new Date().toISOString().slice(0, 10);
      var lastScan = S.scans[S.scans.length - 1];

      /* The per-check results the previous scan actually recorded, so a
         re-scan whose numbers all land identically but whose CHECKS
         moved still gets snapshotted (see scanResultsChanged()'s own
         comment in lib.js). Only consulted when the previous scan
         carries recorded results at all — a seeded/legacy row without
         them must not force a snapshot on every single scan. */
      var prevRecordedResults = null;
      if (lastScan && lastScan.detail) {
        try {
          var prevDetail = JSON.parse(lastScan.detail);
          if (prevDetail && prevDetail.results && Object.keys(prevDetail.results).length) prevRecordedResults = prevDetail.results;
        } catch (e) { /* malformed prior detail — treat as "nothing to compare" */ }
      }
      var checkResultsMoved = window.CheckpointLib.scanResultsChanged(prevRecordedResults, S.lastResults);

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
         other tile's trend badge silently stuck — or if any individual
         check result moved, which the aggregate numbers above can hide
         entirely (one check up, another down, same score) */
      if (!lastScan || lastScan.date !== today || lastScan.score !== target ||
          lastScan.critRisks !== critNow || lastScan.overdueActions !== odNow || checkResultsMoved) {
        /* Recompute the Certification Journey's audit-ready projection at
           every scan and snapshot it alongside readiness/critRisks/etc —
           same "extra field lives in Detail's JSON" pattern (see
           store.js's scan-load parsing) — so the management review
           pack's projection-drift chart has a real point-in-time series
           to plot, not just today's single number. */
        var projFw = primaryFw;
        var projection = null;
        if (projFw) {
          var projApp = frameworkAppRows(projFw);
          var projImpl = projApp.filter(function (c) { return c.st === 'Implemented'; }).length;
          projection = window.CheckpointLib.remediationVelocityProjection({
            events: primaryFrameworkImplementedEvents(projFw), applicableTotal: projApp.length, implementedNow: projImpl, today: today
          });
        }
        /* Snapshot every open risk's residual L/I too — same
           "extra field lives in Detail's JSON" pattern as projection
           above — so the Risk Landscape can draw a trail from each
           risk's position last quarter to where it sits now (see
           riskLandscapeTrails() below), without a schema change. */
        var riskSnapshot = S.risks.filter(function (r) { return r.status !== 'Closed'; }).map(function (r) {
          var q = residual(r);
          return { id: r.id, L: q.L, I: q.I };
        });
        var detail = JSON.stringify({ results: S.lastResults, notes: S.lastNotes, readiness: readiness, readinessByFw: readinessByFw, critRisks: critNow, overdueActions: odNow, source: 'manual', projection: projection, riskSnapshot: riskSnapshot });
        Store.addScan({ date: today, score: target, detail: detail, readiness: readiness, readinessByFw: readinessByFw, critRisks: critNow, overdueActions: odNow, source: 'manual', projection: projection, riskSnapshot: riskSnapshot }).catch(warn);
      }
      log('Posture scan completed — score <b>' + target + '</b>. ' + (S.proposed.length ? S.proposed.length + ' finding(s) proposed for the risk register.' : 'No new findings.'));
      Store.saveScanState().catch(warn);
      setTimeout(function () {
        renderProposed(); renderNavCounts(); renderDash(); renderSoa();
        /* ONE summary, not nine toasts.
           This used to fire a separate toast per framework plus one for
           the proposed risks — all in this same tick, all into the same
           single #toast element, each overwriting the last before a
           frame was ever painted. Only the final message was ever
           visible, and since the proposals toast went first, the single
           most actionable line ("N proposed risks awaiting your
           approval") was the one guaranteed to be destroyed. Measured on
           a demo tenant with five modules on: nine calls, one message
           rendered. */
        var suggTotal = totalPendingSuggestions();
        var suggFws = entitledFrameworks().filter(function (fw) { return pendingSuggestions(fw); });
        var parts = [];
        if (S.proposed.length) parts.push('<b>' + S.proposed.length + ' proposed risk' + (S.proposed.length > 1 ? 's' : '') + '</b> awaiting approval below');
        if (suggTotal) {
          parts.push('<b>' + suggTotal + ' SoA suggestion' + (suggTotal > 1 ? 's' : '') + '</b> across ' +
            (suggFws.length > 1 ? suggFws.length + ' frameworks' : esc(fwName(suggFws[0]))));
        }
        if (parts.length) toast('Scan complete — ' + parts.join(' · '));
      }, 2600);
    },

    approve: async function (tpl) {
      busy(true);
      var res = await approveProposedTemplate(tpl);
      busy(false);
      if (res) toast('<b>' + res.rid + '</b> added to risk register · ' + res.actIds.length + ' action(s) created');
      renderAll();
    },

    /* Bulk approve — one confirmation, one pass, one summary. A scan can
       propose a dozen findings and every one of them used to need its
       own decision; approving twelve meant twelve clicks, twelve
       re-renders and twelve toasts of which only the last was ever
       visible (see the scan-summary note in runScan()). */
    approveAllProposed: async function () {
      var queued = S.proposed.slice();
      if (!queued.length) return;
      var actionCount = queued.reduce(function (n, tpl) { return n + ((TPL[tpl] && TPL[tpl].actions.length) || 0); }, 0);
      var ok = await showModal({
        title: 'Approve all proposed findings',
        message: 'Add all ' + queued.length + ' proposed finding' + (queued.length === 1 ? '' : 's') + ' to the risk register, creating ' + actionCount + ' remediation action' + (actionCount === 1 ? '' : 's') + ' assigned to you? Each one can still be edited or closed afterwards.',
        confirmText: 'Approve all ' + queued.length,
        cancelText: 'Cancel'
      });
      if (!ok) return;
      busy(true);
      var added = 0, actionsMade = 0;
      for (var i = 0; i < queued.length; i++) {
        var res = await approveProposedTemplate(queued[i]);
        if (res) { added++; actionsMade += res.actIds.length; }
      }
      busy(false);
      toast('<b>' + added + ' risk' + (added === 1 ? '' : 's') + '</b> added to the register · ' + actionsMade + ' action' + (actionsMade === 1 ? '' : 's') + ' created');
      renderAll();
    },

    dismissAllProposed: async function () {
      var queued = S.proposed.slice();
      if (!queued.length) return;
      var ok = await showModal({
        title: 'Dismiss all proposed findings',
        message: 'Dismiss all ' + queued.length + ' proposed finding' + (queued.length === 1 ? '' : 's') + '? Each dismissal is recorded in the audit trail, and a finding can be proposed again by a later scan if the underlying check still fails.',
        confirmText: 'Dismiss all ' + queued.length,
        cancelText: 'Cancel'
      });
      if (!ok) return;
      queued.forEach(function (tpl) {
        S.handledTpl.push(tpl);
        delete _riskInsightCache[tpl];
        audit('Scan finding dismissed', 'ScanFinding', tpl, 'Proposed', 'Dismissed (bulk)');
      });
      S.proposed = [];
      log('<b>' + queued.length + '</b> scan finding(s) dismissed by practitioner — recorded with rationale.');
      toast(queued.length + ' finding' + (queued.length === 1 ? '' : 's') + ' dismissed');
      renderAll();
    },

    /* Bulk confirm/dismiss for one framework's scan-suggested SoA
       statuses. The confirmation names how many of them move a control
       BACKWARDS and shows an example, so applying a batch that includes
       regressions is a deliberate act — the whole batch still applies,
       because whether the live signal outranks a recorded attestation is
       the practitioner's call, not this dialog's. */
    confirmAllSuggestions: async function (fw) {
      var src = suggestionSourceFor(fw);
      if (!src || !src.list.length) return;
      var list = src.list.slice();
      var downs = list.filter(isSuggestionDowngrade);
      var ok = await showModal({
        title: 'Confirm all suggestions — ' + fwName(fw),
        /* plain text, no markup — showModal() sets the message with
           textContent, so any tag here would render as literal characters */
        message: 'Apply all ' + list.length + ' suggested status change' + (list.length === 1 ? '' : 's') + ' to the ' + fwName(fw) + ' Statement of Applicability?' +
          (downs.length ? ' ' + downs.length + ' of them move a control BACKWARDS — for example ' + downs[0].code + ' ' + downs[0].from + ' → ' + downs[0].to + ' — because the live posture signal no longer supports the recorded status.' : ''),
        confirmText: 'Confirm all ' + list.length,
        cancelText: 'Cancel'
      });
      if (!ok) return;
      busy(true);
      var applied = 0, appliedCodes = {};
      for (var i = 0; i < list.length; i++) {
        if (await applySuggestedStatus(fw, list[i])) { applied++; appliedCodes[list[i].code] = true; }
      }
      S[src.key] = (S[src.key] || []).filter(function (p) { return !appliedCodes[p.code]; });
      busy(false);
      log('<b>' + applied + '</b> ' + fwName(fw) + ' control status(es) set from posture scan suggestions — practitioner-confirmed in bulk' + (downs.length ? ', including ' + downs.length + ' downgrade(s)' : '') + '.');
      toast('<b>' + applied + '</b> ' + esc(fwName(fw)) + ' control' + (applied === 1 ? '' : 's') + ' updated');
      renderSoa(); renderDash(); renderNavCounts();
    },

    dismissAllSuggestions: async function (fw) {
      var src = suggestionSourceFor(fw);
      if (!src || !src.list.length) return;
      var n = src.list.length;
      var ok = await showModal({
        title: 'Dismiss all suggestions — ' + fwName(fw),
        message: 'Dismiss all ' + n + ' suggested status change' + (n === 1 ? '' : 's') + ' for ' + fwName(fw) + '? Nothing in the SoA changes. A later scan will suggest them again if the live signal still disagrees with what is recorded.',
        confirmText: 'Dismiss all ' + n,
        cancelText: 'Cancel'
      });
      if (!ok) return;
      S[src.key] = [];
      log(n + ' ' + fwName(fw) + ' scan suggestion(s) dismissed by practitioner.');
      toast(n + ' suggestion' + (n === 1 ? '' : 's') + ' dismissed');
      renderSoa(); renderNavCounts();
    },

    dismiss: function (tpl) {
      S.handledTpl.push(tpl);
      S.proposed = S.proposed.filter(function (p) { return p !== tpl; });
      delete _riskInsightCache[tpl];
      log('Scan finding dismissed by practitioner (' + tpl + ') — recorded with rationale.');
      audit('Scan finding dismissed', 'ScanFinding', tpl, 'Proposed', 'Dismissed');
      renderAll();
    },

    complete: async function (id) {
      var a = S.actions.find(function (x) { return x.id === id; });
      if (!a) return;
      var vals = await showModal({
        title: 'Complete action',
        message: 'This is recorded as the final entry in ' + a.id + '\'s progress log — an auditor reading it should see exactly what was done.',
        fields: [
          { id: 'ev', label: 'Evidence note for the audit trail', type: 'textarea', value: 'Configuration export captured to Evidence library', placeholder: 'e.g. CA policy export saved to Evidence/A.8.5' },
          { id: 'url', label: 'Evidence link (optional)', value: a.evidenceUrl || '', placeholder: 'https://…' }
        ],
        confirmText: 'Complete',
        validate: function (v) { return (!v.url || isSafeUrl(v.url)) ? null : 'Evidence link must start with http:// or https://'; }
      });
      if (!vals) return;
      var r = risk(a.risk);
      busy(true);
      var upd = await recordActionUpdate(a, { note: vals.ev, evidenceUrl: vals.url, status: 'Done' });
      if (upd) {
        try {
          if (r) {
            var q = residual(r);
            recomputeRiskStatus(r);
            await Store.updateRisk(r);
            log('Action <b>' + id + '</b> completed. Evidence captured. Risk ' + r.id + ' residual now <b>' + (q.L * q.I) + ' — ' + band(q.L * q.I) + '</b>.');
            toast('Evidence captured · <b>' + r.id + '</b> residual recalculated to ' + (q.L * q.I) + ' (' + band(q.L * q.I) + ')');
          } else {
            log('Action <b>' + id + '</b> completed. Evidence captured.');
            toast('Evidence captured for <b>' + id + '</b>');
          }
        } catch (e) { warn(e); }
      }
      busy(false);
      renderAll();
    },

    /* Records a progress update without necessarily completing the
       action — the primary way to build the story a Risk Treatment
       Plan or an auditor conversation actually needs: what happened,
       when, and (optionally) a status change and its own evidence link.
       Defaults the status field to the action's CURRENT status, so
       "just leave a note, nothing's changed yet" is the path of least
       resistance, not "complete" being the only prompted flow. */
    addActionUpdate: async function (id) {
      var a = S.actions.find(function (x) { return x.id === id; });
      if (!a) return;
      var vals = await showModal({
        title: 'Add progress update — ' + a.id,
        fields: [
          { id: 'note', label: 'What happened', type: 'textarea', value: '', placeholder: 'e.g. Vendor confirmed remediation date of 14 March; following up if it slips.' },
          { id: 'status', label: 'Status', type: 'select', value: a.status, options: ACTION_STATUS_OPTS },
          { id: 'url', label: 'Evidence link for this update (optional)', value: '', placeholder: 'https://…' }
        ],
        confirmText: 'Add update',
        validate: function (v) {
          if (!v.note.trim()) return 'Enter what happened.';
          return (!v.url || isSafeUrl(v.url)) ? null : 'Evidence link must start with http:// or https://';
        }
      });
      if (!vals) return;
      var r = risk(a.risk);
      var prevStatus = a.status;
      busy(true);
      var upd = await recordActionUpdate(a, { note: vals.note, evidenceUrl: vals.url, status: vals.status });
      if (upd) {
        try {
          if (r && vals.status !== prevStatus) { recomputeRiskStatus(r); await Store.updateRisk(r); }
        } catch (e) { warn(e); }
        log('Update recorded for <b>' + a.id + '</b>' + (vals.status !== prevStatus ? ' — status now <b>' + esc(vals.status) + '</b>' : '') + '.');
        toast('Update added to <b>' + a.id + '</b>');
      }
      busy(false);
      renderAll();
      if (document.getElementById('drawer') && document.getElementById('drawer').classList.contains('open')) App.openAction(id);
    },

    /* Action detail drawer — same pattern as openRisk(): header, current
       state, then the full chronological progress log this feature
       exists to produce. Every entry is immutable once written (see
       recordActionUpdate()'s own comment); "Add update"/"Complete" are
       the only ways this list grows. */
    openAction: function (id) {
      var a = S.actions.find(function (x) { return x.id === id; });
      if (!a) return;
      var r = risk(a.risk);
      var updates = (S.actionUpdates || []).filter(function (u) { return u.action === id; }).slice().reverse();
      var capa = window.CheckpointLib.capaStatus(a);
      document.getElementById('drawer').innerHTML =
        '<button class="x" data-action="App.closeDrawer">' + icon('close') + '</button>' +
        '<div class="id-t">' + a.id + ' · ' + esc(a.type || 'Action') + (r ? ' · Treats ' + r.id : '') + '</div><h2>' + esc(a.title) + '</h2>' +
        '<div class="d-kv"><span>Status</span><b><span class="chip st-' + a.status.replace(/ /g, '') + '">' + esc(a.status) + '</span></b></div>' +
        '<div class="d-kv"><span>Priority</span><b>' + esc(a.pr) + '</b></div>' +
        '<div class="d-kv"><span>Owner</span><b>' + esc(a.owner) + '</b></div>' +
        '<div class="d-kv"><span>Due</span><b style="' + (overdue(a) ? 'color:var(--fail)' : '') + '">' + fmtDate(a.due) + (overdue(a) ? ' ' + icon('flag') + ' ' + overdueDays(a) + 'd overdue' : '') + '</b></div>' +
        (a.control ? '<div class="d-kv"><span>Control</span><b>' + esc(a.control) + '</b></div>' : '') +
        '<div class="d-kv"><span>Current evidence link</span><b>' + (a.evidenceUrl && isSafeUrl(a.evidenceUrl) ? '<a href="' + esc(a.evidenceUrl) + '" target="_blank" rel="noopener">Open ' + icon('external') + '</a>' : '—') + '</b></div>' +
        (capa.isNc ? '<div class="src" style="margin-top:4px">' + esc(capa.nextStep) + '</div>' : '') +
        (READONLY ? '' :
          '<div class="d-actions" style="display:flex;flex-wrap:wrap;gap:8px;margin:14px 0">' +
          '<button class="btn sm" data-action="App.addActionUpdate" data-id="' + a.id + '">Add update</button>' +
          (a.status !== 'Done' ? '<button class="btn ghost sm" data-action="App.complete" data-id="' + a.id + '">Complete</button>' : '') +
          (capa.isNc ? '<button class="btn ghost sm" data-action="App.recordCapa" data-id="' + a.id + '">Corrective action</button>' : '') +
          '<button class="btn ghost sm" data-action="App.editAction" data-id="' + a.id + '">Edit</button>' +
          '</div>') +
        '<div class="d-sec"><h4>Progress log' + (updates.length ? ' (' + updates.length + ')' : '') + '</h4>' +
        (updates.length
          ? updates.map(function (u) {
              return '<div class="d-kv" style="align-items:flex-start;padding:8px 0;border-bottom:1px solid var(--line)">' +
                '<span style="min-width:90px">' + fmtDate(u.date) + '<div class="src">' + esc(u.author) + '</div></span>' +
                '<b style="font-weight:400;text-align:left;color:var(--paper)">' + esc(u.note || '(status change only)') +
                (u.status ? '<div class="src" style="margin-top:2px">Status at this update: <b>' + esc(u.status) + '</b></div>' : '') +
                (u.evidenceUrl && isSafeUrl(u.evidenceUrl) ? '<div style="margin-top:2px"><a href="' + esc(u.evidenceUrl) + '" target="_blank" rel="noopener" class="evidence-link">Evidence ' + icon('external') + '</a></div>' : '') +
                '</b></div>';
            }).join('')
          : '<p style="color:var(--paper-dim);font-size:12.5px">No updates recorded yet — use "Add update" to start the progress log an auditor would read.</p>') +
        '</div>';
      openDrawerUi('Action ' + a.id);
    },

    openRisk: function (id) {
      var r = risk(id), q = residual(r);
      var acts = r.actions.map(function (a) { return S.actions.find(function (x) { return x.id === a; }); }).filter(Boolean);
      document.getElementById('drawer').innerHTML =
        '<button class="x" data-action="App.closeDrawer">' + icon('close') + '</button>' +
        '<div class="id-t">' + r.id + ' · ' + esc(r.cat) + ' · Source: ' + esc(r.src) + '</div><h2>' + esc(r.title) + '</h2>' +
        '<div class="d-sec"><h4>Scoring</h4><div class="score-pair">' +
        '<div class="score-box"><b style="color:var(--paper-dim)">' + (r.L * r.I) + '</b><span>Inherent — ' + band(r.L * r.I) + '</span></div>' +
        '<div class="score-box" style="border-color:rgba(216,186,120,.4)"><b class="gold-t">' + (q.L * q.I) + '</b><span>Residual — ' + band(q.L * q.I) + '</span></div></div>' +
        '<div class="d-kv"><span>Treatment</span><b>' + esc(r.treat) + '</b></div><div class="d-kv"><span>Owner</span><b>' + esc(r.owner) + '</b></div><div class="d-kv"><span>Status</span><b>' + r.status + '</b></div>' +
        (r.acceptedBy
          ? '<div class="d-kv"><span>Residual accepted</span><b>' + esc(r.acceptedBy) + (r.acceptedDate ? ' · ' + fmtDate(r.acceptedDate) : '') + '</b></div>' +
            (window.CheckpointLib.residualAcceptanceStale(r, q.L * q.I)
              ? '<div class="src" style="margin-top:4px;color:var(--fail)">' + icon('flag') + ' This sign-off was recorded against a residual score of ' + r.acceptedScore + ' — the current residual score is ' + (q.L * q.I) + '. Re-accept or re-review before relying on it as current evidence.</div>'
              : '') +
            (r.acceptanceNote ? '<div class="src" style="margin-top:4px">' + esc(r.acceptanceNote) + '</div>' : '')
          : (band(q.L * q.I) !== 'Low' ? '<div class="src" style="margin-top:4px;color:var(--warn)">No residual-acceptance sign-off recorded — auditors expect one on any Medium+ residual risk.</div>' : '')) +
        '</div>' +
        '<div class="d-sec"><h4>Linked controls (SoA)</h4>' + (r.controls.length ? r.controls.map(function (c) {
          /* risk.controls store bare codes (e.g. "A.5.2"), and different
             frameworks legitimately reuse the same Annex A numbering —
             every risk in this app is ISO 27001-anchored, so prefer that
             framework's control to disambiguate. */
          var ctl = S.controls.find(function (x) { return x.id === c && x.fw === 'iso27001'; }) ||
                    S.controls.find(function (x) { return x.id === c; });
          return '<div class="d-kv"><span>' + c + ' — ' + (ctl ? esc(ctl.t) : '') + '</span><b>' + (ctl ? ctl.st : '') + '</b></div>';
        }).join('') : '<div class="d-kv"><span>None linked yet</span></div>') + '</div>' +
        '<div class="d-sec"><h4>Treatment actions</h4>' + (acts.length ? acts.map(function (a) {
          return '<div class="d-kv"><span>' + a.id + ' — ' + esc(a.title) + '</span><b><span class="chip st-' + a.status.replace(/ /g, '') + '">' + a.status + '</span></b></div>';
        }).join('') : '<div class="d-kv"><span>None yet</span></div>') + '</div>' +
        '<div class="d-sec"><h4>Audit trail</h4><p style="font-size:12px;color:var(--paper-dim);line-height:1.7">' +
        (Store.kind === 'sharepoint'
          ? 'Every change to this risk is versioned in this tenant\'s SharePoint list history — scoring changes, treatment decisions and evidence links are automatically audit-ready.'
          : 'In a connected tenant, every change is versioned in SharePoint list history — automatically audit-ready.') + '</p></div>' +
        (READONLY ? '' :
          '<div class="d-actions" style="display:flex;flex-wrap:wrap;gap:8px;margin-top:16px">' +
          '<button class="btn sm" data-action="App.editRisk" data-id="' + r.id + '">Edit risk</button>' +
          '<button class="btn ghost sm" data-action="App.addTreatmentAction" data-id="' + r.id + '">Add treatment action</button>' +
          '<button class="btn ghost sm" data-action="App.acceptRisk" data-id="' + r.id + '">Accept residual</button>' +
          (r.status === 'Closed'
            ? '<button class="btn ghost sm" data-action="App.reopenRisk" data-id="' + r.id + '">Reopen</button>'
            : '<button class="btn ghost sm" data-action="App.closeRisk" data-id="' + r.id + '">Close</button>') +
          '<button class="btn ghost sm" data-action="App.deleteRisk" data-id="' + r.id + '">Delete</button>' +
          '</div>');
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
        '<button class="x" data-action="App.closeDrawer">' + icon('close') + '</button>' +
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
          ? '<p style="margin-top:8px"><a href="' + esc(g.link) + '" target="_blank" rel="noopener" class="evidence-link">Open admin portal ' + icon('external') + '</a></p>' : '';
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
        '<button class="x" data-action="App.closeDrawer">' + icon('close') + '</button>' +
        '<div class="id-t">' + esc(c.id) + '</div><h2>' + esc(c.t) + '</h2>' +
        '<div class="d-sec"><h4>Status</h4>' +
        '<div class="d-kv"><span>Applicable</span><b>' + (c.app ? 'Yes' : 'No') + '</b></div>' +
        '<div class="d-kv"><span>Status</span><b>' + (c.app ? c.st : 'N/A') + '</b></div>' +
        '<div class="d-kv"><span>Owner</span><b>' + esc(c.own || '—') + '</b></div>' +
        '<div class="d-kv"><span>Verified</span><b>' + (c.verified ? fmtDate(c.verified) : '—') + '</b></div>' +
        '<div class="d-kv"><span>Evidence</span><b>' + (c.evidenceUrl && isSafeUrl(c.evidenceUrl) ? '<a href="' + esc(c.evidenceUrl) + '" target="_blank" rel="noopener">Link ' + icon('external') + '</a>' : '—') + '</b></div></div>' +
        (maps.length ? '<div class="d-sec"><h4>Also satisfies</h4>' + maps.map(function (m) { return '<div class="d-kv"><span>' + esc(m) + '</span></div>'; }).join('') + '</div>' : '') +
        guidanceHtml;
      openDrawerUi('Control ' + c.id);
    },

    /* Pins `key` ("fw|id") as the Constellation's selected node — the
       cluster stays lit and the pulse restarts (via classList.remove
       then a forced reflow, since re-adding an unchanged class never
       restarts a CSS animation) even if the same node is clicked
       twice — then opens the exact same drawer every other control
       view already uses. */
    pickConstellationNode: function (key) {
      window._cxSelected = key;
      var svgEl = document.getElementById('cxSvg');
      if (svgEl) {
        svgEl.querySelectorAll('circle.cx-node').forEach(function (c) {
          var match = c.dataset.nodeId === key;
          c.classList.toggle('cx-selected', match);
          c.classList.remove('cx-pulse');
          if (match) { void c.offsetWidth; c.classList.add('cx-pulse'); }
        });
      }
      constellationHover(null);
      App.openControlGuidance(key);
    },
    filterConstellationFw: function (fw) { window._cxFwFilter = fw || null; window._cxSelected = null; renderConstellation(); },
    toggleConstellationLens: function () { window._cxLens = !window._cxLens; renderConstellation(); },

    setFingerprintFw: function (fw) { window._fpFw = fw; renderComplianceFingerprint(); },

    setRiskView: function (v) { window._riskView = v; renderRiskLandscapeCard(); },
    clearFeedWeekFilter: function () { window._feedWeekFilter = null; renderActivityFeed(); },

    filterRisk: function (f) { window._riskF = f; window._riskCellFilter = null; renderRisks(); },
    filterAct: function (f) { window._actF = f; renderActions(); },

    /* Heatmap-cell drill-down — a finer lens than the severity pills
       above it (many L×I cells share one severity band), so it's a
       SEPARATE filter state rather than overloading _riskF, and picking
       a severity pill afterward clears it (see filterRisk() above) so
       the two never silently disagree about what's on screen. Works
       identically whichever heatmap the click came from — the
       Dashboard's copy and the Risk register's own share this handler,
       both landing here on the Risk register. */
    filterRiskByCell: function (id) {
      var parts = id.split('-');
      window._riskCellFilter = { L: Number(parts[0]), I: Number(parts[1]) };
      window._riskF = 'All';
      renderRisks();
      App.go('risks');
    },
    clearRiskCellFilter: function () { window._riskCellFilter = null; renderRisks(); },

    /* Drill-down navigation from a stat tile (Dashboard's kpi row, Board
       view's hero tiles) to the register view that stat is counted from,
       pre-filtered so what the practitioner lands on is the same set the
       tile counted — not the register's default view. Each sets the
       relevant filter global(s) before App.go(), which calls that view's
       own render function and picks the global up, same as every other
       filter pill already does. */
    /* risks/actions/soa aren't in App.go()'s per-view render dispatch
       above — they're kept current by their own mutating handlers
       calling render directly (filterRisk/filterAct/setSoaFw all do
       this already), not by App.go() itself, since nothing about them
       changes just by navigating there normally. A drill-down is the
       one case where it DOES change (the filter), so render explicitly
       here too, the same way those handlers do, before switching the
       visible view. */
    goRisksSeverity: function (sev) { window._riskF = sev; window._riskCellFilter = null; renderRisks(); App.go('risks'); },
    goActionsFilter: function (f) { window._actF = f; window._actTypeF = 'All'; renderActions(); App.go('actions'); },
    goSoaFw: function (fw) { window._soaFw = fw; window._soaCat = 'All'; renderSoa(); App.go('soa'); },
    filterActType: function (t) { window._actTypeF = t; renderActions(); },
    filterVendorCrit: function (f) { window._vendorCritF = f; renderVendors(); },
    filterVendorStatus: function (f) { window._vendorStatusF = f; renderVendors(); },
    filterAiTier: function (f) { window._aiTierF = f; renderAiSystems(); },
    filterAiStatus: function (f) { window._aiStatusF = f; renderAiSystems(); },

    toggleAddRisk: function () {
      var panel = document.getElementById('addRiskPanel');
      var showing = panel.style.display !== 'none';
      panel.style.display = showing ? 'none' : 'block';
      if (!showing) {
        ['naRiskDesc', 'nrTitle', 'nrCategory', 'nrOwner', 'nrActions'].forEach(function (id) { document.getElementById(id).value = ''; });
        document.getElementById('nrLikelihood').value = '3';
        document.getElementById('nrImpact').value = '3';
        document.getElementById('nrTreatment').value = 'Mitigate';
        document.getElementById('riskAiDraftStatus').textContent = '';
        window._riskDraftFromAi = false;
      }
    },

    /* Fills the form above from a short practitioner-supplied
       description — never saves anything itself. The practitioner
       still reviews/edits every field and clicks the existing Add
       button, same "draft only, explicit action to persist" rule as
       every other AI feature. Marks window._riskDraftFromAi so
       addManualRisk stamps aiAssisted/aiReviewer on the saved risk AND
       its generated actions. */
    aiDraftRisk: async function () {
      var descEl = document.getElementById('naRiskDesc');
      var statusEl = document.getElementById('riskAiDraftStatus');
      var desc = (descEl.value || '').trim();
      if (!desc) { toast('Briefly describe the finding first'); return; }
      if (!(S.entitlements && S.entitlements.ai)) { toast('AI assistant is not licensed for this tenant.'); return; }
      var cfg = aiGetConfig();
      if (!(cfg.enabled && cfg.endpoint && cfg.deployment)) { statusEl.innerHTML = '<span style="color:var(--paper-dim)">AI assistant not configured — see AI-SETUP.md.</span>'; return; }
      if (Store.kind === 'demo') { statusEl.innerHTML = '<span style="color:var(--paper-faint)">AI draft isn\'t available in demo mode — this previews the form only.</span>'; return; }
      statusEl.textContent = 'Drafting…';
      try {
        var res = await window.CheckpointAI.chat('risk', window.CheckpointAI.buildRiskDraftPrompt(desc), { risks: aiBuildDataBag().risks, scanSummary: aiBuildDataBag().scanSummary });
        var draft = window.CheckpointAI.parseRiskDraft(res.text);
        document.getElementById('nrTitle').value = draft.title || desc;
        document.getElementById('nrLikelihood').value = String(draft.likelihood);
        document.getElementById('nrImpact').value = String(draft.impact);
        document.getElementById('nrActions').value = draft.actions.join('\n');
        window._riskDraftFromAi = true;
        statusEl.innerHTML = '<div class="chip st-Intreatment" style="margin-bottom:4px">' + esc(window.CheckpointAI.DISCLAIMER) + '</div>' +
          (draft.likelihoodReason ? '<div class="src">Likelihood: ' + esc(draft.likelihoodReason) + '</div>' : '') +
          (draft.impactReason ? '<div class="src">Impact: ' + esc(draft.impactReason) + '</div>' : '');
      } catch (e) {
        var friendly = e.code === 'not_configured' ? 'AI is not configured.'
          : e.code === 'auth_error' ? 'Not authorised — check the Cognitive Services OpenAI User role assignment.'
          : e.code === 'rate_limited' ? 'The AI endpoint is rate-limiting requests — try again shortly.'
          : ('Could not draft: ' + (e.message || e));
        statusEl.innerHTML = '<span style="color:var(--fail)">' + esc(friendly) + '</span>';
      }
    },

    addManualRisk: async function () {
      var title = document.getElementById('nrTitle').value.trim();
      if (!title) { toast('Enter a risk statement first'); return; }
      var maxR = S.risks.reduce(function (m, r) { var n = parseInt(String(r.id).replace(/\D/g, ''), 10) || 0; return Math.max(m, n); }, 0);
      var maxA = S.actions.reduce(function (m, a) { var n = parseInt(String(a.id).replace(/\D/g, ''), 10) || 0; return Math.max(m, n); }, 0);
      var rid = 'R-' + String(maxR + 1).padStart(3, '0');
      var owner = document.getElementById('nrOwner').value.trim() || 'Unassigned';
      var actionLines = (document.getElementById('nrActions').value || '').split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
      var actIds = actionLines.map(function (_, i) { return 'ACT-' + String(maxA + 1 + i).padStart(3, '0'); });
      var aiAssisted = !!window._riskDraftFromAi;
      var reviewer = (Graph.getAccount() && Graph.getAccount().name) || (Store.kind === 'demo' ? 'Demo user' : 'Practitioner');
      busy(true);
      try {
        var newRisk = {
          id: rid, title: title, cat: document.getElementById('nrCategory').value.trim() || 'Uncategorised', src: 'Manual entry',
          L: parseInt(document.getElementById('nrLikelihood').value, 10), I: parseInt(document.getElementById('nrImpact').value, 10),
          controls: [], owner: owner, status: 'Open', treat: document.getElementById('nrTreatment').value || 'Mitigate', actions: actIds,
          aiAssisted: aiAssisted, aiReviewer: aiAssisted ? reviewer : ''
        };
        await Store.addRisk(newRisk);
        for (var i = 0; i < actionLines.length; i++) {
          await Store.addAction({ id: actIds[i], title: actionLines[i], risk: rid, control: '', pr: 'Medium', owner: owner, due: daysFrom(30), status: 'Open', src: 'Manual entry', aiAssisted: aiAssisted, aiReviewer: aiAssisted ? reviewer : '' });
        }
        log('<b>' + rid + '</b> added to risk register manually' + (aiAssisted ? ' (AI-drafted, reviewed by ' + esc(reviewer) + ')' : '') + ': ' + esc(title));
        toast('<b>' + rid + '</b> added');
        audit('Risk added manually', 'Risk', rid, '', (aiAssisted ? 'AI-assisted, reviewed by ' + reviewer + ' — ' : '') + title);
      } catch (e) { warn(e); }
      busy(false);
      App.toggleAddRisk();
      renderAll();
    },

    /* ── Manual risk lifecycle (edit / accept / add-action / close / delete) ──
       The scan→approve path already creates fully-linked, auto-scoring
       risks; these let a practitioner create, change and close a risk by
       hand with the same rigour an auditor expects of a live register. */
    editRisk: async function (id) {
      var r = risk(id);
      if (!r) return;
      var v = await showModal({
        title: 'Edit ' + r.id,
        fields: [
          { id: 'title', label: 'Risk statement', type: 'textarea', value: r.title },
          { id: 'cat', label: 'Category', value: r.cat, placeholder: 'e.g. Access control' },
          { id: 'owner', label: 'Risk owner', value: r.owner },
          { id: 'L', label: 'Likelihood', type: 'select', value: r.L, options: LIKELIHOOD_OPTS },
          { id: 'I', label: 'Impact', type: 'select', value: r.I, options: IMPACT_OPTS },
          { id: 'treat', label: 'Treatment decision', type: 'select', value: r.treat, options: TREATMENT_OPTS },
          { id: 'controls', label: 'Linked controls (comma-separated codes)', value: (r.controls || []).join(', '), placeholder: 'e.g. A.5.9, A.8.5' },
          { id: 'status', label: 'Status', type: 'select', value: r.status, options: RISK_STATUS_OPTS }
        ],
        confirmText: 'Save changes',
        validate: function (v) { return v.title ? null : 'Enter a risk statement.'; }
      });
      if (!v) return;
      var before = r.L + '×' + r.I + ' ' + r.status + ' / ' + r.treat;
      busy(true);
      try {
        r.title = v.title; r.cat = v.cat || 'Uncategorised'; r.owner = v.owner || 'Unassigned';
        r.L = parseInt(v.L, 10) || r.L; r.I = parseInt(v.I, 10) || r.I; r.treat = v.treat; r.status = v.status;
        r.controls = v.controls.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
        await Store.updateRisk(r);
        audit('Risk updated', 'Risk', r.id, before, r.L + '×' + r.I + ' ' + r.status + ' / ' + r.treat);
        toast('<b>' + r.id + '</b> updated');
      } catch (e) { warn(e); }
      busy(false);
      closeDrawerUi();
      renderAll();
    },

    /* Residual-risk acceptance sign-off (ISO 27001 6.1.3 / 8.3) — records
       who accepted the residual risk, when, and why. This is exactly the
       artifact an auditor asks for on any risk left at Medium+ after
       treatment; the reports already recommend it, this captures it. */
    acceptRisk: async function (id) {
      var r = risk(id);
      if (!r) return;
      var q = residual(r);
      var who = (Graph.getAccount() && Graph.getAccount().name) || (Store.kind === 'demo' ? 'Demo user' : 'Practitioner');
      var v = await showModal({
        title: 'Accept residual risk — ' + r.id,
        message: 'Residual score ' + (q.L * q.I) + ' (' + band(q.L * q.I) + '). Recording formal acceptance of the residual risk by its owner.',
        fields: [
          { id: 'by', label: 'Accepted by (risk owner / authority)', value: r.acceptedBy || r.owner || who },
          { id: 'date', label: 'Acceptance date', type: 'date', value: r.acceptedDate || new Date().toISOString().slice(0, 10) },
          { id: 'note', label: 'Basis for acceptance', type: 'textarea', value: r.acceptanceNote, placeholder: 'e.g. Residual risk within appetite; compensating controls in place; reviewed at MR-004.' }
        ],
        confirmText: 'Record acceptance',
        validate: function (v) { return v.by ? null : 'Enter who is accepting the risk.'; }
      });
      if (!v) return;
      busy(true);
      try {
        r.acceptedBy = v.by; r.acceptedDate = v.date || new Date().toISOString().slice(0, 10); r.acceptanceNote = v.note;
        /* Snapshot of the residual score AT THE MOMENT of acceptance —
           see residualAcceptanceStale()'s comment in lib.js. Recomputed
           fresh here rather than reusing `q` from above the modal: the
           risk's own L/I can't have moved during the modal (nothing
           else touches this risk while it's open), but this keeps the
           snapshot visibly tied to what's actually being accepted. */
        var acceptedQ = residual(r);
        r.acceptedScore = acceptedQ.L * acceptedQ.I;
        if (r.treat !== 'Accept') r.treat = 'Accept';
        await Store.updateRisk(r);
        audit('Residual risk accepted', 'Risk', r.id, band(q.L * q.I) + ' residual', 'Accepted by ' + v.by + ' on ' + r.acceptedDate);
        toast('Residual risk acceptance recorded for <b>' + r.id + '</b>');
      } catch (e) { warn(e); }
      busy(false);
      closeDrawerUi();
      renderAll();
    },

    /* Add a treatment action straight onto an existing risk — the
       missing counterpart to "link an action to a risk". Fully linked and
       lifecycle-wired, so completing it later recalculates this risk. */
    addTreatmentAction: async function (id) {
      var r = risk(id);
      if (!r) return;
      var v = await showModal({
        title: 'Add treatment action — ' + r.id,
        fields: [
          { id: 'title', label: 'Action', type: 'textarea', placeholder: 'e.g. Enforce phishing-resistant MFA on privileged roles' },
          { id: 'owner', label: 'Owner', value: r.owner },
          { id: 'pr', label: 'Priority', type: 'select', value: 'High', options: ['Critical', 'High', 'Medium', 'Low'] },
          { id: 'due', label: 'Due date', type: 'date', value: daysFrom(30) }
        ],
        confirmText: 'Add action',
        validate: function (v) { return v.title ? null : 'Describe the action.'; }
      });
      if (!v) return;
      var maxA = S.actions.reduce(function (m, a) { var n = parseInt(String(a.id).replace(/\D/g, ''), 10) || 0; return Math.max(m, n); }, 0);
      var a = { id: 'ACT-' + String(maxA + 1).padStart(3, '0'), title: v.title, type: 'Action', risk: r.id, control: '', pr: v.pr, owner: v.owner || 'Unassigned', due: v.due || daysFrom(30), status: 'Open', evidenceUrl: '', src: 'Risk treatment' };
      busy(true);
      try {
        await Store.addAction(a);
        r.actions = r.actions || [];
        if (r.actions.indexOf(a.id) === -1) r.actions.push(a.id);
        recomputeRiskStatus(r);
        await Store.updateRisk(r);
        audit('Treatment action added', 'Action', a.id, '', a.title + ' (risk ' + r.id + ')');
        toast('<b>' + a.id + '</b> added to ' + r.id);
      } catch (e) { warn(e); }
      busy(false);
      closeDrawerUi();
      renderAll();
    },

    closeRisk: async function (id) {
      var r = risk(id);
      if (!r) return;
      var openActs = (r.actions || []).map(function (x) { return S.actions.find(function (a) { return a.id === x; }); }).filter(function (a) { return a && a.status !== 'Done' && a.status !== 'Cancelled'; });
      var msg = 'Close ' + r.id + '? It will drop out of the active register and stop counting toward residual-risk figures.' + (openActs.length ? ' Note: ' + openActs.length + ' linked action(s) are still open.' : '') + (!r.acceptedBy && band(residual(r).L * residual(r).I) !== 'Low' ? ' No residual-acceptance sign-off is on record for this Medium+ risk yet — auditors usually expect one.' : '');
      var ok = await showModal({ title: 'Close risk ' + r.id + '?', message: msg, confirmText: 'Close risk', cancelText: 'Cancel' });
      if (!ok) return;
      busy(true);
      try {
        r.status = 'Closed';
        await Store.updateRisk(r);
        audit('Risk closed', 'Risk', r.id, '', 'Closed');
        toast('<b>' + r.id + '</b> closed');
      } catch (e) { warn(e); }
      busy(false);
      closeDrawerUi();
      renderAll();
    },

    reopenRisk: async function (id) {
      var r = risk(id);
      if (!r) return;
      busy(true);
      try {
        r.status = 'Open';
        recomputeRiskStatus(r);
        await Store.updateRisk(r);
        audit('Risk reopened', 'Risk', r.id, 'Closed', r.status);
        toast('<b>' + r.id + '</b> reopened');
      } catch (e) { warn(e); }
      busy(false);
      closeDrawerUi();
      renderAll();
    },

    deleteRisk: async function (id) {
      var r = risk(id);
      if (!r) return;
      var linked = (r.actions || []).length;
      var ok = await showModal({ title: 'Delete ' + r.id + '?', message: 'Permanently remove this risk?' + (linked ? ' Its ' + linked + ' linked action(s) will be kept but unlinked from any risk.' : '') + ' This can\'t be undone; history remains in the audit log and SharePoint version history.', confirmText: 'Delete', cancelText: 'Keep' });
      if (!ok) return;
      busy(true);
      try {
        var linkedActions = (r.actions || []).map(function (x) { return S.actions.find(function (a) { return a.id === x; }); }).filter(Boolean);
        for (var i = 0; i < linkedActions.length; i++) {
          linkedActions[i].risk = '';
          try { await Store.updateAction(linkedActions[i]); } catch (e) { warn(e); }
        }
        await Store.deleteRisk(r);
        S.risks = S.risks.filter(function (x) { return x.id !== id; });
        audit('Risk deleted', 'Risk', id, r.title, '');
        toast('<b>' + id + '</b> deleted');
      } catch (e) { warn(e); }
      busy(false);
      closeDrawerUi();
      renderAll();
    },

    toggleAddAction: function () {
      var panel = document.getElementById('addActionPanel');
      var showing = panel.style.display !== 'none';
      panel.style.display = showing ? 'none' : 'block';
      if (!showing) {
        ['naTitle', 'naControl', 'naOwner'].forEach(function (id) { document.getElementById(id).value = ''; });
        document.getElementById('naDue').value = daysFrom(14);
        fillSelect(document.getElementById('naRisk'), riskLinkOptions(''), '');
      }
    },

    addManualAction: async function () {
      var title = document.getElementById('naTitle').value.trim();
      if (!title) { toast('Enter a title or finding description first'); return; }
      var maxA = S.actions.reduce(function (m, a) { var n = parseInt(String(a.id).replace(/\D/g, ''), 10) || 0; return Math.max(m, n); }, 0);
      var linkedRisk = document.getElementById('naRisk').value;
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
        /* Wire the bidirectional risk link (and promote the risk's status
           if needed) so a manually-added action is a first-class citizen
           of the residual-recalculation machinery, exactly like a
           scan-generated one. */
        if (linkedRisk) {
          await setActionRiskLink(a, linkedRisk);
          await Store.updateAction(a);
          var lr = risk(a.risk);
          if (lr) { recomputeRiskStatus(lr); await Store.updateRisk(lr); }
        }
        log('<b>' + a.id + '</b> (' + esc(a.type) + ') added from ' + esc(a.src) + ': ' + esc(a.title) + (linkedRisk ? ' — linked to ' + esc(linkedRisk) : ''));
        toast('<b>' + a.id + '</b> added');
        audit('Action added', 'Action', a.id, '', a.type + ': ' + a.title + (linkedRisk ? ' (risk ' + linkedRisk + ')' : ''));
      } catch (e) { warn(e); }
      busy(false);
      App.toggleAddAction();
      renderAll();
    },

    editAction: async function (id) {
      var a = S.actions.find(function (x) { return x.id === id; });
      if (!a) return;
      var v = await showModal({
        title: 'Edit ' + a.id,
        fields: [
          { id: 'title', label: 'Title / finding', type: 'textarea', value: a.title },
          { id: 'type', label: 'Type', type: 'select', value: a.type || 'Action', options: ACTION_TYPES },
          { id: 'risk', label: 'Linked risk', type: 'select', value: a.risk || '', options: riskLinkOptions(a.risk) },
          { id: 'control', label: 'Control code', value: a.control || '', placeholder: 'e.g. A.5.9' },
          { id: 'pr', label: 'Priority', type: 'select', value: a.pr, options: ['Critical', 'High', 'Medium', 'Low'] },
          { id: 'owner', label: 'Owner', value: a.owner },
          { id: 'due', label: 'Due date', type: 'date', value: a.due },
          { id: 'status', label: 'Status', type: 'select', value: a.status, options: ACTION_STATUS_OPTS }
        ],
        confirmText: 'Save changes',
        validate: function (v) { return v.title ? null : 'Enter a title.'; }
      });
      if (!v) return;
      var prevStatus = a.status;
      busy(true);
      try {
        a.title = v.title; a.type = v.type; a.control = v.control;
        a.pr = v.pr; a.owner = v.owner || 'Unassigned'; a.due = v.due || a.due; a.status = v.status;
        await setActionRiskLink(a, v.risk);   /* updates the old risk if the link moved */
        await Store.updateAction(a);
        var r = risk(a.risk);
        if (r) { recomputeRiskStatus(r); await Store.updateRisk(r); }
        audit('Action updated', 'Action', a.id, prevStatus, a.status + ' · ' + a.type + (a.risk ? ' · risk ' + a.risk : '') + (a.pr ? ' · ' + a.pr : ''));
        toast('<b>' + a.id + '</b> updated');
      } catch (e) { warn(e); }
      busy(false);
      renderAll();
    },

    deleteAction: async function (id) {
      var a = S.actions.find(function (x) { return x.id === id; });
      if (!a) return;
      var ok = await showModal({ title: 'Delete ' + a.id + '?', message: 'Permanently remove this action / finding? This can\'t be undone. Its history remains in the audit log and SharePoint version history.', confirmText: 'Delete', cancelText: 'Keep' });
      if (!ok) return;
      busy(true);
      try {
        var r = risk(a.risk);
        await Store.deleteAction(a);
        S.actions = S.actions.filter(function (x) { return x.id !== id; });
        if (r && r.actions) {
          r.actions = r.actions.filter(function (x) { return x !== id; });
          recomputeRiskStatus(r);
          try { await Store.updateRisk(r); } catch (e) { warn(e); }
        }
        audit('Action deleted', 'Action', id, a.type + ': ' + a.title, '');
        toast('<b>' + id + '</b> deleted');
      } catch (e) { warn(e); }
      busy(false);
      renderAll();
    },

    /* Corrective-action record for a nonconformity (ISO 27001 Clause
       10.1): the immediate correction, the root cause, and — after the
       corrective action is completed — verification that it worked.
       capaStatus() (lib.js) tracks which step is owed next; the register
       row shows it. Only meaningful for a Non-conformity finding type. */
    recordCapa: async function (id) {
      var a = S.actions.find(function (x) { return x.id === id; });
      if (!a) return;
      if (!window.CheckpointLib.capaStatus(a).isNc) { toast('Corrective-action records apply to nonconformities — change the type to a Non-conformity first (Edit).'); return; }
      var who = (Graph.getAccount() && Graph.getAccount().name) || (Store.kind === 'demo' ? 'Demo user' : 'Practitioner');
      var v = await showModal({
        title: 'Corrective action — ' + a.id,
        message: 'ISO 27001 Clause 10.1: contain it, find the root cause, act, then verify the fix held. Effectiveness is reviewed after the corrective action itself is completed.',
        fields: [
          { id: 'correction', label: 'Immediate correction / containment', type: 'textarea', value: a.correction, placeholder: 'What was done straight away to control the nonconformity and its consequences.' },
          { id: 'rootCause', label: 'Root cause', type: 'textarea', value: a.rootCause, placeholder: 'Why it happened — the underlying cause, not just the symptom.' },
          { id: 'effectivenessReview', label: 'Effectiveness review (after the corrective action is done)', type: 'textarea', value: a.effectivenessReview, placeholder: 'Evidence the corrective action worked and the nonconformity has not recurred.' },
          { id: 'effectivenessBy', label: 'Effectiveness reviewed by', value: a.effectivenessBy || (a.status === 'Done' ? who : '') },
          { id: 'effectivenessDate', label: 'Effectiveness review date', type: 'date', value: a.effectivenessDate || (a.status === 'Done' ? new Date().toISOString().slice(0, 10) : '') }
        ],
        confirmText: 'Save corrective action'
      });
      if (!v) return;
      busy(true);
      try {
        a.correction = v.correction; a.rootCause = v.rootCause;
        a.effectivenessReview = v.effectivenessReview; a.effectivenessBy = v.effectivenessBy; a.effectivenessDate = v.effectivenessDate;
        await Store.updateAction(a);
        var st = window.CheckpointLib.capaStatus(a);
        audit('Corrective action updated', 'Action', a.id, '', st.complete ? 'CAPA closed out' : ('Next: ' + st.nextStep));
        toast('Corrective action saved for <b>' + a.id + '</b>' + (st.complete ? ' — CAPA complete' : ''));
      } catch (e) { warn(e); }
      busy(false);
      renderAll();
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
        ['vName', 'vService', 'vDataAccessed', 'vOwner', 'vCertifications', 'vCertExpiryDate', 'vContactEmail', 'vControls', 'vRiskRefs', 'vNotes'].forEach(function (id) { document.getElementById(id).value = ''; });
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
      document.getElementById('vCertExpiryDate').value = v.certExpiryDate || '';
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
          v.certExpiryDate = document.getElementById('vCertExpiryDate').value;
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
            certExpiryDate: document.getElementById('vCertExpiryDate').value,
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
        '<button class="x" data-action="App.closeDrawer">' + icon('close') + '</button>' +
        '<div class="id-t">' + v.id + ' · ' + esc(v.criticality) + ' criticality</div><h2>' + esc(v.name) + '</h2>' +
        '<p style="color:var(--paper-dim);font-size:13px;margin-top:6px">' + esc(v.service) + '</p>' +
        '<div class="d-sec"><h4>Review</h4>' +
        '<div class="d-kv"><span>Status</span><b><span class="chip st-' + v.reviewStatus.replace(/ /g, '') + '">' + esc(v.reviewStatus) + '</span></b></div>' +
        '<div class="d-kv"><span>Last reviewed</span><b>' + (v.lastReviewed ? fmtDate(v.lastReviewed) : 'Never') + '</b></div>' +
        '<div class="d-kv"><span>Next review due</span><b style="' + (od ? 'color:var(--fail)' : '') + '">' + (v.nextReviewDue ? fmtDate(v.nextReviewDue) + (od ? ' ' + icon('flag') + ' overdue' : '') : 'Not set') + '</b></div>' +
        '<div class="d-kv"><span>Owner</span><b>' + esc(v.owner) + '</b></div>' +
        '<div class="d-kv"><span>Certifications</span><b>' + esc(v.certifications || '—') + '</b></div>' +
        '<div class="d-kv"><span>Certification/report expiry</span><b style="' + (v.certExpiryDate && v.certExpiryDate < new Date().toISOString().slice(0, 10) ? 'color:var(--fail)' : '') + '">' + (v.certExpiryDate ? fmtDate(v.certExpiryDate) + (v.certExpiryDate < new Date().toISOString().slice(0, 10) ? ' ' + icon('flag') + ' expired' : '') : 'Not set') + '</b></div>' +
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
        var clientLabel = clientDisplayLabel();
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
        document.getElementById('aiImpactStatus').value = 'Not started';
        document.getElementById('aiLastReviewed').value = '';
        renderAiActQuestions({});
      }
    },

    /* Recomputes the suggested EU AI Act tier from whatever's currently
       ticked and writes it into the (still freely editable) risk tier
       select — an override, not a lock; a practitioner who disagrees
       with the screening result can still pick a different tier by
       hand, same as before this existed. */
    recomputeAiActSuggestion: function () {
      var result = window.CheckpointLib.classifyAiActRisk(currentAiActAnswers());
      var sel = document.getElementById('aiRiskTier');
      if (sel) sel.value = result.tier;
      var out = document.getElementById('aiActSuggestion');
      if (!out) return;
      out.innerHTML =
        '<div class="d-kv"><span>Suggested tier</span><b><span class="chip sev-' + result.tier + '">' + esc(result.tier) + '</span></b></div>' +
        (result.reasons.length ? '<div style="font-size:11.5px;color:var(--paper-dim);margin-top:4px">' + result.reasons.map(esc).join('<br>') + '</div>' : '') +
        '<div style="font-size:11px;color:var(--paper-dim);margin-top:6px;font-style:italic">Screening aid based on our reading of the EU AI Act — not legal advice. Confirm borderline or high-stakes classifications with counsel.</div>';
    },

    editAiSystem: function (id) {
      var a = (S.aiSystems || []).find(function (x) { return x.id === id; });
      if (!a) return;
      window._editingAiId = id;
      document.getElementById('aiPanelTitle').textContent = 'Edit ' + a.id;
      document.getElementById('aiName').value = a.name;
      document.getElementById('aiPurpose').value = a.purpose || '';
      document.getElementById('aiOwner').value = a.owner;
      document.getElementById('aiModelType').value = a.modelType || '';
      document.getElementById('aiVendor').value = a.vendor || '';
      document.getElementById('aiDataSources').value = a.dataSources || '';
      document.getElementById('aiImpactStatus').value = a.impactAssessmentStatus;
      document.getElementById('aiLastReviewed').value = a.lastReviewed || '';
      document.getElementById('aiHumanOversight').value = a.humanOversight || '';
      // renderAiActQuestions() recomputes a fresh suggestion from the
      // ticked boxes and writes it into aiRiskTier — set the select
      // back to what was actually SAVED afterward, so re-opening a
      // record a practitioner deliberately overrode doesn't silently
      // snap back to the algorithm's own suggestion.
      renderAiActQuestions(a.aiActAnswers || {});
      document.getElementById('aiRiskTier').value = a.riskTier;
      App.closeDrawer();
      document.getElementById('addAiSystemPanel').style.display = 'block';
      document.getElementById('addAiSystemPanel').scrollIntoView({ behavior: 'smooth', block: 'center' });
    },

    saveAiSystem: async function (prefill) {
      var name = document.getElementById('aiName').value.trim();
      if (!name) { toast('Enter a system name first'); return; }
      var editingId = window._editingAiId;
      var aiActAnswers = currentAiActAnswers();
      busy(true);
      try {
        if (editingId) {
          var a = (S.aiSystems || []).find(function (x) { return x.id === editingId; });
          if (!a) { busy(false); return; }
          var prevStatus = a.impactAssessmentStatus;
          a.name = name; a.purpose = document.getElementById('aiPurpose').value.trim();
          a.owner = document.getElementById('aiOwner').value.trim() || 'Unassigned';
          a.riskTier = document.getElementById('aiRiskTier').value;
          a.aiActAnswers = aiActAnswers;
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
            aiActAnswers: aiActAnswers,
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
      // Recomputed live from the stored answers, same as aiControlsFor()
      // above — if a.riskTier was hand-overridden after answering the
      // questionnaire, this can legitimately disagree with it; framed as
      // "why the tool suggested this" rather than restated as fact, so
      // that disagreement reads as expected, not as a bug.
      var classification = window.CheckpointLib.classifyAiActRisk(a.aiActAnswers || {});
      var aiActSection = (a.aiActAnswers && Object.keys(a.aiActAnswers).some(function (k) { return a.aiActAnswers[k]; }))
        ? '<div class="d-sec"><h4>EU AI Act obligations</h4>' +
          '<div style="font-size:11.5px;color:var(--paper-dim);margin-bottom:6px">Why the tool suggested ' + esc(classification.tier) + ': ' + classification.reasons.map(esc).join('; ') + '</div>' +
          classification.obligations.map(function (o) { return '<div class="d-kv"><span>' + esc(o) + '</span></div>'; }).join('') +
          '<div style="font-size:11px;color:var(--paper-dim);margin-top:6px;font-style:italic">Screening aid, not legal advice — confirm borderline or high-stakes classifications with counsel.</div></div>'
        : '';
      document.getElementById('drawer').innerHTML =
        '<button class="x" data-action="App.closeDrawer">' + icon('close') + '</button>' +
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
        aiActSection +
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

    /* Shares window._soaFw with the SoA view's own framework switcher
       (setSoaFw above) — same tenant-wide "active framework" everything
       else keys off — but re-renders THIS view rather than SoA's. */
    setEvidenceSimFw: function (fw) { window._soaFw = fw; renderEvidenceRequestSim(); },
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
      await offerCrossFrameworkPropagation(c);
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
      /* Same reasoning generateTemplate()'s "Link as evidence?" flow
         already applies: a control that now has real evidence attached
         is visible progress, and leaving it at "Not started" reads as
         stale/wrong on every chart and KPI that reads status. Only
         bumps the untouched default, never overwrites "In progress"/
         "Implemented" set by hand, and only on a real link — clearing
         the field doesn't regress the status. */
      var bumped = false;
      if (url && c.st === 'Not started') {
        var prevSt = c.st;
        c.st = 'In progress';
        audit('Control status changed', 'Control', key, prevSt, 'In progress (evidence linked)');
        bumped = true;
      }
      try { await Store.updateControl(c); } catch (e) { warn(e); }
      audit('Evidence link changed', 'Control', key, prevUrl || '(none)', url || '(none)');
      renderSoa();
      if (bumped) { renderDash(); toast('<b>' + esc(c.id) + '</b> moved to In progress.'); }
      /* Attaching evidence is the other way a control becomes eligible
         to propagate: the common order is "mark Implemented" (warned
         about missing evidence, so nothing propagates yet) and then
         "link evidence" afterwards. Without this the offer would only
         ever appear for practitioners who happened to work in the other
         order. */
      await offerCrossFrameworkPropagation(c);
    },

    /* The one place a practitioner can actually record why a control is
       excluded — ISO 27001 clause 6.1.3(d) requires this for every
       exclusion in the SoA, and the field already existed end to end
       (SharePoint's Justification column, updateControl() writing it,
       every report/export reading it) but had no write path anywhere
       in the UI until this. Available regardless of current
       applicability (not just while Not Applicable) so a justification
       already on record can still be edited or cleared, and so
       re-including a control doesn't strand an old, no-longer-relevant
       reason with no way to remove it. */
    setControlJustification: async function (key) {
      var parts = key.split('|'), c = S.controls.find(function (x) { return x.fw === parts[0] && x.id === parts[1]; });
      if (!c) return;
      var vals = await showModal({
        title: 'Exclusion justification — ' + c.id,
        message: 'Why this control is marked Not Applicable — what an auditor reads in the Statement of Applicability. Leave blank to clear.',
        fields: [{ id: 'just', label: 'Justification', type: 'textarea', value: c.just || '' }],
        confirmText: 'Save'
      });
      if (!vals) return;
      var prevJust = c.just;
      c.just = vals.just.trim();
      try { await Store.updateControl(c); } catch (e) { warn(e); }
      audit('Exclusion justification changed', 'Control', key, prevJust || '(none)', c.just || '(none)');
      /* Also re-renders the Dashboard, not just the SoA — this is what
         moves the "Exclusions missing justification" KPI tile, and
         App.go('dash') itself never re-renders on its own (it only
         toggles view visibility; see its own definition), so without
         this the tile would show a stale count until some unrelated
         action happened to trigger a fresh renderDash() first. Same
         reasoning toggleApp() already applies for the same tile. */
      renderSoa(); renderDash();
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
        var clientLabel = clientDisplayLabel();
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
            ? '<table class="tc-table"><thead><tr><th>Name</th><th>Service</th></tr></thead><tbody>' + pub.map(function (v) { return '<tr><td>' + esc(v.name) + '</td><td>' + esc(v.service) + '</td></tr>'; }).join('') + '</tbody></table>'
            : '<p class="tc-p">No sub-processors currently published.</p>');
        }

        var contactHtml = S.settings.trustCenterContactEmail ? '<h2>Contact</h2><p class="tc-p">Security questions: <a href="mailto:' + esc(S.settings.trustCenterContactEmail) + '">' + esc(S.settings.trustCenterContactEmail) + '</a></p>' : '';

        var html = buildStandaloneHtml({
          title: esc(companyName) + ' — Trust Center',
          /* Public page — client logo + accent yes, classification
             marking deliberately NOT (it's built to be shared). */
          logoUrl: (S.settings && S.settings.clientLogoUrl) || '',
          accent: clientBrandColor(),
          bodyHtml: '<div class="tc-mast"><h1>' + esc(companyName) + '</h1><p>Trust Center · generated ' + today + '</p></div>' +
            certsHtml + postureHtml + subsHtml + contactHtml +
            '<div class="tc-foot">This page reflects information as of its generation date (' + today + ') and must be regenerated to stay current. Prepared with Compliance365 Checkpoint.</div>',
          extraCss: STANDALONE_CSS
        });

        var filename = 'trust-center-' + new Date().toISOString().slice(0, 10) + '.html';
        var file = new File([html], filename, { type: 'text/html;charset=utf-8' });
        var uploaded = await Store.uploadDocument(file, 'Trust Center');
        audit('Trust Center page generated', 'Document', filename, '',
          'certs:' + S.settings.trustCenterShowCerts + ' soaPct:' + S.settings.trustCenterShowSoaPct + ' posture:' + S.settings.trustCenterShowPosture + ' subProcessors:' + S.settings.trustCenterShowSubProcessors);
        log('Trust Center page generated: <b>' + esc(filename) + '</b>.');
        toast('Trust Center page generated');
        document.getElementById('tcResult').innerHTML =
          '<div class="card"><h3>Generated</h3><p style="font-size:13px;color:var(--paper-dim)">Saved to Documents → Trust Center as <b>' + esc(filename) + '</b>.</p>' +
          '<p style="font-size:13px;color:var(--paper-dim);margin-top:8px"><a href="' + esc(uploaded.url) + '" target="_blank" rel="noopener" class="evidence-link">Open the file ' + icon('external') + '</a></p>' +
          '<h4 style="margin-top:14px;font-size:13px">Next step — make it public</h4>' +
          '<p style="font-size:12.5px;color:var(--paper-dim)">In SharePoint, open the file, choose <b>Share</b> → <b>People with the link can view</b> → <b>Anyone</b> (or whichever sharing policy this tenant allows), then paste that link on your website. Checkpoint never sets sharing permissions itself — this is a deliberate SharePoint action you take.</p></div>';
      } catch (e) { warn(e); }
      busy(false);
    },

    generateAuditorPack: async function () {
      if (Store.kind === 'demo') { toast('Generating and saving files isn\'t available in demo mode — sign in to a real tenant to use this.'); return; }
      var fw = document.getElementById('apFramework').value;
      if (!fw) { toast('No framework available — enable one from the Frameworks view first'); return; }
      /* #apFramework's options are already built from entitledFrameworks()
         (see renderAuditorPack()) — this re-checks at the point the file
         actually gets generated and sent to a third party, rather than
         trusting a client-side <select>'s value never gets tampered with
         between render and click. */
      if (!S.entitlements || !S.entitlements[fw]) { toast('That framework isn\'t currently entitled on this tenant.'); return; }
      var validityDays = parseInt(document.getElementById('apValidity').value, 10) || 30;
      var scopeNote = document.getElementById('apScopeNote').value.trim();
      busy(true);
      try {
        var clientLabel = clientDisplayLabel();
        var todayD = new Date();
        var todayStr = todayD.toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' });
        var validUntil = new Date(todayD.getTime() + validityDays * 86400000).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' });
        var practitioner = (typeof Graph !== 'undefined' && Graph.getAccount() && Graph.getAccount().name) || 'Practitioner';

        var rows = frameworkVisibleRows(fw);
        var soaHtml = '<h2>Statement of Applicability — ' + esc(fwName(fw)) + '</h2><table class="tc-table"><thead><tr><th>Control</th><th>Title</th><th>Applicable</th><th>Status</th><th>Evidence</th></tr></thead><tbody>' +
          rows.map(function (c) {
            var ev = (c.evidenceUrl && isSafeUrl(c.evidenceUrl)) ? '<a href="' + esc(c.evidenceUrl) + '">Evidence ' + icon('external') + '</a>' : '—';
            return '<tr><td>' + esc(c.id) + '</td><td>' + esc(c.t) + (c.just ? '<div class="tc-src">Exclusion: ' + esc(c.just) + '</div>' : '') + '</td><td>' + (c.app ? 'Yes' : 'No') + '</td><td>' + esc(c.st) + '</td><td>' + ev + '</td></tr>';
          }).join('') + '</tbody></table>';

        var docs = await Store.listDocuments().catch(function () { return []; });
        var evidenceDocs = docs.filter(function (d) { return d.category === 'Evidence' || d.category === 'Auto-evidence'; });
        var evidenceHtml = '<h2>Evidence index</h2>' + (evidenceDocs.length
          ? '<table class="tc-table"><thead><tr><th>File</th><th>Category</th><th>Last modified</th></tr></thead><tbody>' + evidenceDocs.map(function (d) {
              return '<tr><td><a href="' + esc(d.url) + '">' + esc(d.name) + '</a></td><td>' + esc(d.category || '—') + '</td><td>' + fmtDate(d.modified) + '</td></tr>';
            }).join('') + '</tbody></table><p class="tc-p" style="margin-top:8px">Evidence links point to items in this tenant\'s SharePoint — confirm the auditor has been granted access to the Evidence and Auto-evidence folders, or share those files separately.</p>'
          : '<p class="tc-p">No evidence documents recorded yet.</p>');

        var auditLogWindow = (S.auditLog || []).slice(0, 50);
        var auditLogHtml = '<h2>Audit log excerpt (' + auditLogWindow.length + ' most recent entries)</h2>' + (auditLogWindow.length
          ? '<table class="tc-table"><thead><tr><th>When</th><th>Actor</th><th>Action</th><th>Target</th></tr></thead><tbody>' + auditLogWindow.map(function (e) {
              var when = e.entryDateTime ? new Date(e.entryDateTime).toLocaleDateString('en-AU') : '—';
              return '<tr><td>' + esc(when) + '</td><td>' + esc(e.actor) + '</td><td>' + esc(e.action) + '</td><td>' + esc(e.targetType) + ' ' + esc(e.targetId) + '</td></tr>';
            }).join('') + '</tbody></table>'
          : '<p class="tc-p">No audit log entries recorded yet.</p>');

        var lastReview = (S.reviews || [])[S.reviews.length - 1];
        var reviewHtml = '<h2>Latest management review</h2>' + (lastReview
          ? '<p class="tc-p"><b>' + fmtDate(lastReview.date) + '</b> · Attendees: ' + esc(lastReview.attendees) + '</p><p class="tc-p"><b>Inputs:</b> ' + esc(lastReview.inputs) + '</p><p class="tc-p"><b>Decisions:</b> ' + esc(lastReview.decisions) + '</p>'
          : '<p class="tc-p">No management review recorded yet.</p>');

        /* Exclusion summary — the SoA table above shows justifications
           per-row, but an auditor works from a consolidated exclusions
           list, so give them one directly. */
        var excluded = rows.filter(function (c) { return !c.app; });
        var exclusionsHtml = '<h2>Excluded controls (' + excluded.length + ')</h2>' + (excluded.length
          ? '<table class="tc-table"><thead><tr><th>Control</th><th>Title</th><th>Justification</th></tr></thead><tbody>' +
            excluded.map(function (c) { return '<tr><td>' + esc(c.id) + '</td><td>' + esc(c.t) + '</td><td>' + (c.just ? esc(c.just) : '<b>⚠ No justification recorded</b>') + '</td></tr>'; }).join('') + '</tbody></table>'
          : '<p class="tc-p">None — every control is marked applicable.</p>');

        /* Risk register extract — top of every auditor's ask list and
           previously missing from this pack entirely. */
        var apOpenRisks = S.risks.filter(function (r) { return r.status !== 'Closed'; })
          .sort(function (a, b) { var qa = residual(a), qb = residual(b); return (qb.L * qb.I) - (qa.L * qa.I); });
        var riskExtractHtml = '<h2>Risk register extract (' + apOpenRisks.length + ' open)</h2>' + (apOpenRisks.length
          ? '<table class="tc-table"><thead><tr><th>ID</th><th>Risk</th><th>Residual</th><th>Treatment</th><th>Owner</th></tr></thead><tbody>' +
            apOpenRisks.map(function (r) { var q = residual(r); return '<tr><td>' + esc(r.id) + '</td><td>' + esc(r.title) + '</td><td><b>' + (q.L * q.I) + ' — ' + band(q.L * q.I) + '</b></td><td>' + esc(r.treat) + '</td><td>' + esc(r.owner) + '</td></tr>'; }).join('') + '</tbody></table>'
          : '<p class="tc-p">No open risks.</p>');

        /* Latest posture scan detail — the monitoring-test results an
           auditor asks for alongside the SoA. */
        var apLastScan = S.scans[S.scans.length - 1];
        var apScanHtml = '<h2>Latest posture scan</h2>' + (apLastScan
          ? '<p class="tc-p">Scan of <b>' + fmtDate(apLastScan.date) + '</b> — scored <b>' + apLastScan.score + '/100</b>. Pass/Review/Fail results come from live Microsoft Graph signals where licensing allows; Manual marks practitioner-assessed checks.</p>' +
            '<table class="tc-table"><thead><tr><th>Check</th><th>Result</th></tr></thead><tbody>' +
            window.CHECK_DEFS.map(function (c) {
              var r = checkResult(c);
              var lbl = { pass: 'Pass', review: 'Review', fail: 'Fail', manual: 'Manual' }[r] || r;
              return '<tr><td>' + esc(c.label) + '</td><td><b>' + esc(lbl) + '</b></td></tr>';
            }).join('') + '</tbody></table>'
          : '<p class="tc-p">No posture scan recorded yet.</p>');

        /* Policy & document inventory — everything on file beyond the
           evidence categories the evidence index already lists. */
        var policyDocs = docs.filter(function (d) { return d.category !== 'Evidence' && d.category !== 'Auto-evidence'; });
        var policyHtml = '<h2>Policy &amp; document inventory (' + policyDocs.length + ')</h2>' + (policyDocs.length
          ? '<table class="tc-table"><thead><tr><th>File</th><th>Category</th><th>Last modified</th></tr></thead><tbody>' +
            policyDocs.map(function (d) { return '<tr><td><a href="' + esc(d.url) + '">' + esc(d.name) + '</a></td><td>' + esc(d.category || '—') + '</td><td>' + fmtDate(d.modified) + '</td></tr>'; }).join('') + '</tbody></table>'
          : '<p class="tc-p">No policy documents recorded yet.</p>');

        var html = buildStandaloneHtml({
          title: esc(clientLabel) + ' — Auditor Pack',
          classification: (S.settings && S.settings.reportClassification) || 'Commercial in Confidence',
          logoUrl: (S.settings && S.settings.clientLogoUrl) || '',
          accent: clientBrandColor(),
          bodyHtml: '<div class="tc-mast"><h1>' + esc(clientLabel) + ' — Auditor Pack</h1><p>Prepared ' + todayStr + ' by ' + esc(practitioner) + ' · Intended validity until ' + validUntil + '</p></div>' +
            (scopeNote ? '<p class="tc-p"><b>Scope:</b> ' + esc(scopeNote) + '</p>' : '') +
            '<p class="tc-p">This pack was assembled from live Checkpoint registers on the date shown above. Evidence and audit log content reflect the state of the tenant at that time.</p>' +
            soaHtml + exclusionsHtml + riskExtractHtml + apScanHtml + evidenceHtml + policyHtml + auditLogHtml + reviewHtml +
            '<div class="tc-foot">Generated by Compliance365 Checkpoint. Access to this file is governed entirely by the SharePoint sharing link it was distributed through — Checkpoint has no visibility into who opens it.</div>',
          extraCss: STANDALONE_CSS
        });

        var filename = 'auditor-pack-' + fw + '-' + new Date().toISOString().slice(0, 10) + '.html';
        var file = new File([html], filename, { type: 'text/html;charset=utf-8' });
        var uploaded = await Store.uploadDocument(file, 'Auditor Pack');
        audit('Auditor pack generated', 'Document', filename, '', fwName(fw) + ' · valid until ' + validUntil);
        log('Auditor pack generated: <b>' + esc(filename) + '</b>.');
        toast('Auditor pack generated');
        document.getElementById('apResult').innerHTML =
          '<div class="card"><h3>Generated</h3><p style="font-size:13px;color:var(--paper-dim)">Saved to Documents → Auditor Pack as <b>' + esc(filename) + '</b>. Intended to remain valid until <b>' + validUntil + '</b>.</p>' +
          '<p style="font-size:13px;color:var(--paper-dim);margin-top:8px"><a href="' + esc(uploaded.url) + '" target="_blank" rel="noopener" class="evidence-link">Open the file ' + icon('external') + '</a></p>' +
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

    /* The Documents empty state's CTA — just moves focus/attention to
       the existing upload control rather than duplicating it; there's
       nothing to submit here on its own. */
    focusDocUpload: function () {
      var input = document.getElementById('docFileInput');
      if (input) { input.focus(); input.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'center' }); }
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

    editPolicyContent: function (docName) { renderPolicyEditor(docName); },
    closePolicyEditor: function () {
      var box = document.getElementById('policyEditor');
      box.style.display = 'none';
      box.innerHTML = '';
      document.getElementById('documentsMain').style.display = 'block';
      window._policyEditorDoc = null;
      renderDocuments();
      window.scrollTo(0, 0);
    },
    savePolicyContent: async function () {
      if (!(await persistPolicyContent())) return;
      toast('Content saved. The document is re-rendered from it the next time it is generated or approved.');
      App.closePolicyEditor();
    },
    savePolicyContentAndRegenerate: async function () {
      var meta = window._policyEditorDoc;
      if (!(await persistPolicyContent())) return;
      App.closePolicyEditor();
      await regeneratePolicyDocument(meta.docName, meta.tplId);
    },
    /* Discards the edits and returns the document to the shipped
       template's words. Confirmed rather than immediate, because the
       edits are not recoverable from anywhere else. */
    revertPolicyContent: async function () {
      var meta = window._policyEditorDoc;
      if (!meta) return;
      var ok = await showModal({
        title: 'Revert to the shipped template',
        message: 'Discard the edited content for "' + meta.docName + '" and return it to the standard template wording? This cannot be undone, and the document is not re-rendered until you next generate or approve it.',
        confirmText: 'Discard my edits', cancelText: 'Keep them'
      });
      if (!ok) return;
      try {
        await Store.savePolicyDraft({ docName: meta.docName, tplId: meta.tplId, content: null, updatedBy: '', updatedDate: '' });
      } catch (e) { warn(e); toastError('Could not revert: ' + esc(e.message || e)); return; }
      S.policyDrafts = (S.policyDrafts || []).filter(function (d) { return d.docName !== meta.docName; });
      audit('Policy content reverted', 'Document', meta.docName, '(edited content)', 'Shipped template');
      App.closePolicyEditor();
      toast('Reverted to the shipped template wording.');
    },

    /* One-way export. Word opens an HTML document with a Word MIME
       type and a .doc extension perfectly well, which avoids shipping a
       document-generation library for a feature that is deliberately a
       dead end — anything edited in Word stops being a managed document
       and will not survive the next regeneration. The banner in the
       exported file says so, so a copy that escapes into a shared drive
       still explains itself. */
    exportPolicyWord: async function (docName) {
      var doc = (window._docs || []).find(function (d) { return d.name === docName; });
      var tplId = doc && doc.tplId;
      if (!tplId) {
        var genEntry = (S.auditLog || []).find(function (e) { return e.targetType === 'Document' && e.targetId === docName && e.action === 'Policy template generated'; });
        try { tplId = genEntry && JSON.parse(genEntry.after).tplId; } catch (e) { tplId = null; }
      }
      var t = tplId && window.POLICY_TEMPLATES.find(function (x) { return x.id === tplId; });
      if (!t) { toastError('Could not recover this document\'s content.'); return; }
      var ok = await showModal({
        title: 'Export to Word',
        message: 'This is a one-way export. A copy edited in Word is no longer a managed document — its version, approval and review date stop being tracked, and the changes will not survive the next time this policy is regenerated. To make changes that stick, use Edit content instead.',
        confirmText: 'Export anyway', cancelText: 'Cancel'
      });
      if (!ok) return;
      var c = effectivePolicyContent(t, docName);
      var html = buildTemplateHtml(c, {
        clientLabel: clientDisplayLabel('This organisation'), owner: (doc && doc.owner) || '',
        reviewDate: (doc && doc.nextReview) || '', approved: docStatusOf(doc || {}) === 'Approved',
        generatedDate: new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' }),
        logoUrl: (S.settings && S.settings.clientLogoUrl) || '', brandColor: clientBrandColor() || '',
        version: (doc && doc.version) || '', approvedBy: (doc && doc.approvedBy) || '',
        classification: (doc && doc.classification) || 'Internal'
      }).replace('<body>', '<body><div style="border:2px solid #b91c1c;color:#b91c1c;padding:10px 14px;margin-bottom:22px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.04em">Uncontrolled copy — exported for offline editing. Changes made here are not tracked and will not survive regeneration.</div>');
      downloadBlob(docName.replace(/\.html?$/i, '') + '.doc', new Blob([html], { type: 'application/msword' }));
      audit('Policy exported to Word', 'Document', docName, '(none)', 'Uncontrolled copy');
      toast('Exported as an uncontrolled Word copy.');
    },
    filterAttest: function (f) { window._attestF = f; renderAttestationRecords(); },
    filterTraining: function (f) { window._trainingF = f; renderTrainingRecords(); },

    openCourse: function (courseId) { renderCourseReader(courseId); },
    closeCourse: function () {
      document.getElementById('courseReader').style.display = 'none';
      document.getElementById('courseReader').innerHTML = '';
      document.getElementById('trainingMain').style.display = 'block';
      window._courseState = null;
      renderTraining();
      window.scrollTo(0, 0);
    },
    answerCourseQuestion: function (key) {
      var st = window._courseState;
      if (!st || st.submitted) return; /* answers lock on submit; Try again clears them */
      var parts = key.split(':');
      st.answers[Number(parts[0])] = Number(parts[1]);
      renderCourseQuiz();
    },
    retryCourseQuiz: function () {
      var st = window._courseState;
      if (!st) return;
      st.answers = {}; st.submitted = false; st.recorded = undefined;
      renderCourseQuiz();
      window.scrollTo(0, 0);
    },

    /* Marks the assignment complete on a pass. Deliberately NOT in
       MUTATING_ACTIONS, for the same reason acknowledgeAttestation
       isn't: this is the employee's own record of their own
       completion, and a read-only Viewer who cannot record it is an
       employee who cannot satisfy the training they were assigned.
       Like that action, it only ever touches a row addressed to the
       signed-in UPN.

       Attempts are incremented on every submission, pass or fail, so
       the register shows how hard the course actually was. A failed
       attempt records the attempt but leaves the row outstanding. */
    submitCourseQuiz: async function () {
      var st = window._courseState;
      if (!st || st.submitted) return;
      var c = courseById(st.id);
      if (!c) return;
      st.submitted = true;
      var correct = c.quiz.reduce(function (n, q, i) { return n + (st.answers[i] === q.answer ? 1 : 0); }, 0);
      var passed = correct >= c.passMark;

      var rec = (S.training || []).find(function (t) {
        return t.courseId === st.id && String(t.upn || '').toLowerCase() === String(myUpn()).toLowerCase() &&
          t.status !== 'Completed' && t.status !== 'Exempt';
      });
      if (!rec) { st.recorded = 'unassigned'; renderCourseQuiz(); return; }

      var before = { status: rec.status, completed: rec.completed, score: rec.score, attempts: rec.attempts };
      rec.attempts = (rec.attempts || 0) + 1;
      rec.score = correct + '/' + c.quiz.length;
      if (passed) {
        rec.status = 'Completed';
        rec.completed = new Date().toISOString().slice(0, 10);
        if (!rec.userName) rec.userName = myDisplayName();
      }
      renderCourseQuiz();
      try {
        await Store.updateTrainingRecord(rec);
      } catch (e) {
        rec.status = before.status; rec.completed = before.completed; rec.score = before.score; rec.attempts = before.attempts;
        warn(e);
        st.recorded = false;
        renderCourseQuiz();
        return;
      }
      st.recorded = true;
      if (passed) {
        audit('Training completed', 'Training', rec.id, before.status,
          c.title + ' v' + c.version + ' — ' + rec.score + ' on attempt ' + rec.attempts);
      }
      renderCourseQuiz();
      renderNavCounts();
    },

    toggleNewTraining: function () {
      var p = document.getElementById('newTrainingPanel');
      var show = p.style.display === 'none';
      p.style.display = show ? 'block' : 'none';
      if (show) { renderTrainingCoursePicker(); loadTrainingGroups(); }
    },

    previewTrainingAudience: async function () {
      var mode = document.getElementById('trainingAudience').value;
      document.getElementById('trainingGroup').style.display = mode === 'group' ? '' : 'none';
      var out = document.getElementById('trainingAudiencePreview');
      out.textContent = 'Resolving…';
      try {
        var users = await resolveAudience('trainingAudience', 'trainingGroup');
        window._trainingAudience = users;
        out.innerHTML = users.length
          ? '<b style="color:var(--paper)">' + users.length + ' recipient' + (users.length === 1 ? '' : 's') + '</b> — ' +
            esc(users.slice(0, 6).map(function (u) { return u.name; }).join(', ')) + (users.length > 6 ? ' and ' + (users.length - 6) + ' more' : '')
          : 'No eligible recipients found for this audience.';
      } catch (e) {
        warn(e);
        window._trainingAudience = null;
        out.innerHTML = '<span style="color:var(--fail)">Could not read the directory: ' + esc(e.message || e) + '</span>';
      }
    },

    assignTraining: async function () {
      if (Store.kind === 'demo') { toast('Assigning training needs a real tenant — sign in to use this.'); return; }
      var courseId = document.getElementById('trainingCourse').value;
      var c = courseById(courseId);
      if (!c) { toast('Choose a course first.'); return; }
      var statusEl = document.getElementById('trainingAssignStatus');
      var btn = document.getElementById('assignTrainingBtn');

      var users = window._trainingAudience;
      if (!users) {
        statusEl.textContent = 'Resolving recipients…';
        try { users = await resolveAudience('trainingAudience', 'trainingGroup'); }
        catch (e) { warn(e); statusEl.innerHTML = '<span style="color:var(--fail)">Could not read the directory.</span>'; return; }
      }
      if (!users.length) { toast('That audience has no eligible recipients.'); return; }

      /* Skip anyone who already has this course open. Re-running an
         assignment to catch new starters is a normal thing to do, and
         it must not hand everyone else a duplicate row — which would
         both annoy them and make the completion percentage nonsense. */
      var openAlready = {};
      (S.training || []).forEach(function (t) {
        if (t.courseId === courseId && t.status !== 'Completed' && t.status !== 'Exempt') openAlready[String(t.upn).toLowerCase()] = true;
      });
      var fresh = users.filter(function (u) { return !openAlready[String(u.upn).toLowerCase()]; });
      var skipped = users.length - fresh.length;
      if (!fresh.length) { toast('Everyone in that audience already has this course open — nothing to assign.'); return; }

      var due = document.getElementById('trainingDue').value || '';
      var notify = document.getElementById('trainingNotify').checked;
      var ok = await showModal({
        title: 'Assign training',
        message: 'Assign "' + c.title + '" (v' + c.version + ') to ' + fresh.length + ' ' + (fresh.length === 1 ? 'person' : 'people') +
          (skipped ? ' (' + skipped + ' already have it open and will be skipped)' : '') +
          (notify ? ', and email each of them' : '') + '?',
        confirmText: 'Assign', cancelText: 'Cancel'
      });
      if (!ok) return;

      var campaignId = nextTrainingCampaignId();
      var rows = buildTrainingRows(c, fresh, campaignId, due, 'campaign');

      btn.disabled = true;
      statusEl.textContent = 'Creating ' + rows.length + ' records…';
      try {
        await Store.addTrainingAssignments(rows, function (done, total) {
          statusEl.textContent = 'Creating records… ' + done + ' of ' + total;
        });
      } catch (e) {
        warn(e);
        statusEl.innerHTML = '<span style="color:var(--fail)">Stopped partway: ' + esc(e.message || e) + '. Re-running this assignment will skip whoever already has the course open.</span>';
        btn.disabled = false;
        renderTraining();
        return;
      }

      audit('Training assigned', 'Training', campaignId, '(none)', c.title + ' v' + c.version + ' → ' + rows.length + ' recipients');
      log('Training <b>' + esc(c.title) + '</b> assigned to ' + rows.length + ' people (' + esc(campaignId) + ').');

      if (notify) {
        statusEl.textContent = 'Sending notifications…';
        var sent = await sendTrainingMail(rows, c, 'assigned');
        statusEl.innerHTML = sent.failed
          ? '<span style="color:var(--warn)">Assigned. ' + sent.ok + ' of ' + rows.length + ' notifications sent — the rest can be chased with Send reminder.</span>'
          : '<span style="color:var(--pass)">Assigned and ' + sent.ok + ' notifications sent.</span>';
      } else {
        statusEl.innerHTML = '<span style="color:var(--pass)">Assigned to ' + rows.length + ' people.</span>';
      }
      btn.disabled = false;
      document.getElementById('newTrainingPanel').style.display = 'none';
      renderTraining();
      renderNavCounts();
    },

    /* Assigns every entitled course to anyone in the tenant who has
       never held it — the induction path.

       Deliberately a "who is missing this, ever?" sweep rather than a
       query for accounts created since a date. It needs no new Graph
       call shape, it is idempotent (run it as often as you like), and
       it catches the case a createdDateTime filter would miss entirely:
       someone who has been here two years and was never assigned the
       training in the first place. That person is a bigger audit
       problem than last week's new starter, and a date filter would
       hide them forever. */
    assignInductionTraining: async function () {
      if (Store.kind === 'demo') { toast('Assigning training needs a real tenant — sign in to use this.'); return; }
      var courses = coursesForTenant();
      if (!courses.length) { toast('No courses match this tenant\'s licensed frameworks.'); return; }

      toast('Checking the directory…');
      var users;
      try { users = await Graph.listTenantUsers(); } catch (e) { warn(e); return; }

      var plan = courses.map(function (c) {
        return { course: c, missing: window.CheckpointLib.usersMissingInduction(users, S.training || [], c.id) };
      }).filter(function (x) { return x.missing.length; });

      if (!plan.length) { toast('Everyone in the directory already has a record for every licensed course.'); return; }

      var total = plan.reduce(function (n, x) { return n + x.missing.length; }, 0);
      var ok = await showModal({
        title: 'Catch up new starters',
        message: 'Create ' + total + ' training record' + (total === 1 ? '' : 's') + ' for people who have never been assigned a course:\n\n' +
          plan.map(function (x) { return x.course.title + ' → ' + x.missing.length + ' ' + (x.missing.length === 1 ? 'person' : 'people'); }).join('\n') +
          '\n\nAnyone who has previously held a course is left alone, so this only ever picks up genuine gaps.',
        confirmText: 'Assign', cancelText: 'Cancel'
      });
      if (!ok) return;

      /* 30 days from today is the induction due date — long enough to
         be reasonable for someone still settling in, short enough that
         it does not quietly become a year. */
      var due = new Date(); due.setDate(due.getDate() + 30);
      var dueIso = due.toISOString().slice(0, 10);
      var created = 0;
      for (var i = 0; i < plan.length; i++) {
        var campaignId = nextTrainingCampaignId();
        var rows = buildTrainingRows(plan[i].course, plan[i].missing, campaignId, dueIso, 'induction');
        try {
          await Store.addTrainingAssignments(rows);
          created += rows.length;
          audit('Induction training assigned', 'Training', campaignId, '(none)',
            plan[i].course.title + ' v' + plan[i].course.version + ' → ' + rows.length + ' recipients');
        } catch (e) { warn(e); break; }
      }
      log('Induction sweep created <b>' + created + '</b> training record' + (created === 1 ? '' : 's') + '.');
      renderTraining();
      renderNavCounts();
      toast(created === total
        ? created + ' induction record' + (created === 1 ? '' : 's') + ' created.'
        : created + ' of ' + total + ' created before an error stopped it — run it again to finish.');
    },

    remindTraining: async function (campaignId) {
      if (Store.kind === 'demo') { toast('Sending email isn\'t available in demo mode.'); return; }
      var outstanding = (S.training || []).filter(function (t) {
        return t.campaign === campaignId && t.status !== 'Completed' && t.status !== 'Exempt';
      });
      if (!outstanding.length) { toast('Nothing outstanding on that campaign.'); return; }
      var c = courseById(outstanding[0].courseId) || { title: outstanding[0].courseTitle, version: outstanding[0].courseVersion };
      var ok = await showModal({
        title: 'Send reminder',
        message: 'Email a reminder to the ' + outstanding.length + ' ' + (outstanding.length === 1 ? 'person' : 'people') + ' who have not yet completed ' + c.title + '?',
        confirmText: 'Send', cancelText: 'Cancel'
      });
      if (!ok) return;
      var sent = await sendTrainingMail(outstanding, c, 'reminder');
      audit('Training reminder sent', 'Training', campaignId, '(none)', sent.ok + ' of ' + outstanding.length + ' reminders sent');
      toast(sent.failed
        ? sent.ok + ' of ' + outstanding.length + ' reminders sent — ' + sent.failed + ' failed.'
        : sent.ok + ' reminder' + (sent.ok === 1 ? '' : 's') + ' sent.');
    },

    toggleNewCampaign: function () {
      var p = document.getElementById('newCampaignPanel');
      var show = p.style.display === 'none';
      p.style.display = show ? 'block' : 'none';
      if (show) {
        renderCampaignDocPicker();
        loadCampaignGroups();
      }
    },

    previewCampaignAudience: async function () {
      var mode = document.getElementById('campaignAudience').value;
      var groupSel = document.getElementById('campaignGroup');
      groupSel.style.display = mode === 'group' ? '' : 'none';
      var out = document.getElementById('campaignAudiencePreview');
      out.textContent = 'Resolving…';
      try {
        var users = await resolveCampaignAudience();
        window._campaignAudience = users;
        out.innerHTML = users.length
          ? '<b style="color:var(--paper)">' + users.length + ' recipient' + (users.length === 1 ? '' : 's') + '</b> — ' +
            esc(users.slice(0, 6).map(function (u) { return u.name; }).join(', ')) + (users.length > 6 ? ' and ' + (users.length - 6) + ' more' : '') +
            '<div style="margin-top:4px">Guests, external accounts and disabled accounts are excluded — they cannot attest, and counting them would leave every campaign permanently short.</div>'
          : 'No eligible recipients found for this audience.';
      } catch (e) {
        warn(e);
        window._campaignAudience = null;
        out.innerHTML = '<span style="color:var(--fail)">Could not read the directory: ' + esc(e.message || e) + '</span>';
      }
    },

    /* Creates one Attestations row per recipient, against this exact
       document version, then optionally emails each of them. Rows are
       written before any email goes out: if the mail step fails, the
       campaign still exists and can be chased from the table, whereas
       the reverse would mean staff receiving a policy request with
       nothing recording that they were asked. */
    launchCampaign: async function () {
      if (Store.kind === 'demo') { toast('Launching a campaign needs a real tenant — sign in to use this.'); return; }
      var docId = document.getElementById('campaignDoc').value;
      var doc = (window._docs || []).find(function (d) { return d.id === docId; });
      if (!doc) { toast('Choose an approved policy first.'); return; }
      var statusEl = document.getElementById('campaignLaunchStatus');
      var btn = document.getElementById('launchCampaignBtn');

      var users = window._campaignAudience;
      if (!users) {
        statusEl.textContent = 'Resolving recipients…';
        try { users = await resolveCampaignAudience(); } catch (e) { warn(e); statusEl.innerHTML = '<span style="color:var(--fail)">Could not read the directory.</span>'; return; }
      }
      if (!users.length) { toast('That audience has no eligible recipients.'); return; }

      var notify = document.getElementById('campaignNotify').checked;
      var ok = await showModal({
        title: 'Launch attestation campaign',
        message: 'Assign "' + doc.name + '" (v' + (doc.version || '—') + ') to ' + users.length + ' ' +
          (users.length === 1 ? 'person' : 'people') + (notify ? ', and email each of them a link' : '') + '?',
        confirmText: 'Launch',
        cancelText: 'Cancel'
      });
      if (!ok) return;

      var campaignId = nextCampaignId();
      var today = new Date().toISOString().slice(0, 10);
      var seq = nextAttestationSeq();
      var rows = users.map(function (u, i) {
        return {
          id: 'ATT-' + String(seq + i).padStart(4, '0'), campaign: campaignId,
          docName: doc.name, docVersion: doc.version || '', docUrl: doc.url || '',
          upn: u.upn, userName: u.name, assigned: today, acknowledged: '', status: 'Assigned', note: ''
        };
      });

      btn.disabled = true;
      statusEl.textContent = 'Creating ' + rows.length + ' records…';
      try {
        await Store.addAttestations(rows, function (done, total) {
          statusEl.textContent = 'Creating records… ' + done + ' of ' + total;
        });
      } catch (e) {
        warn(e);
        statusEl.innerHTML = '<span style="color:var(--fail)">Stopped partway: ' + esc(e.message || e) + '. The records already created are listed below and the campaign can be re-run for whoever is missing.</span>';
        btn.disabled = false;
        renderAttestations();
        return;
      }

      audit('Attestation campaign launched', 'Attestation', campaignId, '(none)',
        doc.name + ' v' + (doc.version || '—') + ' → ' + rows.length + ' recipients');
      log('Attestation campaign <b>' + esc(campaignId) + '</b> launched for <b>' + esc(doc.name) + '</b> — ' + rows.length + ' recipients.');

      if (notify) {
        statusEl.textContent = 'Sending notifications…';
        var sent = await sendAttestationMail(rows, doc, 'assigned');
        statusEl.innerHTML = sent.failed
          ? '<span style="color:var(--warn)">Campaign created. ' + sent.ok + ' of ' + rows.length + ' notifications sent — the rest can be chased with Send reminder.</span>'
          : '<span style="color:var(--pass)">Campaign created and ' + sent.ok + ' notifications sent.</span>';
      } else {
        statusEl.innerHTML = '<span style="color:var(--pass)">Campaign created for ' + rows.length + ' recipients.</span>';
      }
      btn.disabled = false;
      document.getElementById('newCampaignPanel').style.display = 'none';
      renderAttestations();
      renderNavCounts();
    },

    remindCampaign: async function (campaignId) {
      if (Store.kind === 'demo') { toast('Sending email isn\'t available in demo mode.'); return; }
      var outstanding = (S.attestations || []).filter(function (r) {
        return r.campaign === campaignId && r.status !== 'Acknowledged' && r.status !== 'Exempt';
      });
      if (!outstanding.length) { toast('Nothing outstanding on that campaign.'); return; }
      var ok = await showModal({
        title: 'Send reminder',
        message: 'Email a reminder to the ' + outstanding.length + ' ' + (outstanding.length === 1 ? 'person' : 'people') + ' who have not yet acknowledged ' + outstanding[0].docName + '?',
        confirmText: 'Send',
        cancelText: 'Cancel'
      });
      if (!ok) return;
      var sent = await sendAttestationMail(outstanding, { name: outstanding[0].docName, version: outstanding[0].docVersion, url: outstanding[0].docUrl }, 'reminder');
      audit('Attestation reminder sent', 'Attestation', campaignId, '(none)', sent.ok + ' of ' + outstanding.length + ' reminders sent');
      toast(sent.failed
        ? sent.ok + ' of ' + outstanding.length + ' reminders sent — ' + sent.failed + ' failed.'
        : sent.ok + ' reminder' + (sent.ok === 1 ? '' : 's') + ' sent.');
    },

    /* Deliberately NOT in MUTATING_ACTIONS. Every other write in this
       app is a practitioner action, disabled for a read-only Viewer.
       Acknowledging a policy is the opposite: it is the employee's own
       act, about themselves, and a Viewer who cannot record it is an
       employee who cannot comply. The write is narrowly scoped — the
       row must already exist, must be addressed to this signed-in UPN,
       and only the acknowledgement fields are touched. */
    acknowledgeAttestation: async function (refId) {
      var r = (S.attestations || []).find(function (x) { return x.id === refId; });
      if (!r) { toastError('That attestation record is no longer available — reload and try again.'); return; }
      if (String(r.upn || '').toLowerCase() !== String(myUpn()).toLowerCase()) {
        toast('That policy is assigned to someone else — you can only acknowledge your own.');
        return;
      }
      var ok = await showModal({
        title: 'Confirm you have read this policy',
        message: 'You are confirming that you have read and understood "' + r.docName + '"' +
          (r.docVersion ? ' (version ' + r.docVersion + ')' : '') +
          '. Your name, sign-in address and today\'s date are recorded against it.',
        confirmText: 'I confirm',
        cancelText: 'Not yet'
      });
      if (!ok) return;
      var before = r.status;
      r.status = 'Acknowledged';
      r.acknowledged = new Date().toISOString().slice(0, 10);
      if (!r.userName) r.userName = myDisplayName();
      try {
        await Store.updateAttestation(r);
      } catch (e) {
        r.status = before; r.acknowledged = '';
        warn(e);
        toastError('Could not record your acknowledgement — it has not been saved.');
        return;
      }
      audit('Policy acknowledged', 'Attestation', r.id, before, 'Acknowledged by ' + (r.userName || r.upn));
      renderAttestations();
      renderNavCounts();
      toast('Recorded — thank you.');
    },

    /* Edit one row of the document control register. Writes straight to
       the SharePoint library's own columns, so the change is visible in
       SharePoint as well as here, and logs a before/after audit entry —
       a change to who owns a policy or when it's next reviewed is
       exactly the kind of thing Clause 7.5.3 expects to be traceable. */
    editDocumentMeta: async function (itemId) {
      var d = (window._docs || []).find(function (x) { return x.id === itemId; });
      if (!d) { toast('Reload the Documents view and try again.'); return; }
      var vals = await showModal({
        title: 'Document details — ' + d.name,
        fields: [
          { id: 'owner', label: 'Document owner (name or role)', value: d.owner, placeholder: 'e.g. ISMS Manager' },
          { id: 'version', label: 'Version', value: d.version, placeholder: 'e.g. 1.0' },
          { id: 'status', label: 'Status', type: 'select', value: docStatusOf(d) || 'Draft', options: window.DOC_STATUSES },
          { id: 'classification', label: 'Classification', type: 'select', value: d.classification || 'Internal', options: window.DOC_CLASSIFICATIONS },
          { id: 'nextReview', label: 'Next review due', type: 'date', value: d.nextReview },
          { id: 'approvedBy', label: 'Approved by (leave blank until approved)', value: d.approvedBy, placeholder: 'e.g. M. Chen (CEO)' },
          { id: 'approvalDate', label: 'Approval date', type: 'date', value: d.approvalDate }
        ],
        confirmText: 'Save',
        validate: function (v) {
          if (v.status === 'Approved' && !v.approvedBy) return 'An approved document needs an approver recorded — Clause 7.5.2 c).';
          if (v.status === 'Approved' && !v.version) return 'An approved document needs a version.';
          return null;
        }
      });
      if (!vals) return;
      var before = [d.owner, d.version, docStatusOf(d), d.nextReview, d.approvedBy].join(' | ');
      try {
        await Store.updateDocumentMeta(itemId, vals);
      } catch (e) { warn(e); toastError('Could not save the document details: ' + esc(e.message || e)); return; }
      Object.keys(vals).forEach(function (k) { d[k] = vals[k]; });
      audit('Document details changed', 'Document', d.name, before,
        [vals.owner, vals.version, vals.status, vals.nextReview, vals.approvedBy].join(' | '));
      if (vals.status !== 'Superseded') await syncPolicyReviewCalendar(d.name, vals.nextReview, vals.owner);
      renderDocuments();
      renderDash();
      toast('Register updated for <b>' + esc(d.name) + '</b>.');
    },

    previewTemplate: function () { renderTemplatePreview(); },

    /* Fills _tailoredTemplates[t.id] from a short client-context prompt
       — never saves or generates anything itself. generateTemplate()
       below picks this up automatically the next time it runs for the
       SAME template id; switching to a different template in the
       dropdown just leaves this one cached, unused, until picked again. */
    tailorTemplateWithAi: async function () {
      var sel = document.getElementById('tplSelect');
      var t = sel && window.POLICY_TEMPLATES.find(function (x) { return x.id === sel.value; });
      var statusEl = document.getElementById('tplAiTailorStatus');
      if (!t) { toast('Choose a template first'); return; }
      var context = (document.getElementById('tplAiContext').value || '').trim();
      if (!context) { toast('Briefly describe this client\'s context first'); return; }
      if (!(S.entitlements && S.entitlements.ai)) { toast('AI assistant is not licensed for this tenant.'); return; }
      var cfg = aiGetConfig();
      if (!(cfg.enabled && cfg.endpoint && cfg.deployment)) { statusEl.innerHTML = '<span style="color:var(--paper-dim)">AI assistant not configured — see AI-SETUP.md.</span>'; return; }
      if (Store.kind === 'demo') { statusEl.innerHTML = '<span style="color:var(--paper-faint)">Tailoring isn\'t available in demo mode — this previews the form only.</span>'; return; }
      statusEl.textContent = 'Tailoring…';
      try {
        var res = await window.CheckpointAI.chat('policy', window.CheckpointAI.buildPolicyTailorPrompt(t, context), { soaSummary: aiBuildDataBag().soaSummary, risks: aiBuildDataBag().risks });
        var tailored = window.CheckpointAI.parsePolicyTailor(res.text, t);
        if (!window._tailoredTemplates) window._tailoredTemplates = {};
        window._tailoredTemplates[t.id] = tailored;
        statusEl.innerHTML = '<div class="chip st-Intreatment" style="margin-bottom:4px">' + esc(window.CheckpointAI.DISCLAIMER) + '</div>' +
          '<span style="color:var(--pass)">Tailored draft ready — click Generate to preview it (marked as AI-assisted).</span>';
      } catch (e) {
        var friendly = e.code === 'not_configured' ? 'AI is not configured.'
          : e.code === 'auth_error' ? 'Not authorised — check the Cognitive Services OpenAI User role assignment.'
          : e.code === 'rate_limited' ? 'The AI endpoint is rate-limiting requests — try again shortly.'
          : ('Could not tailor: ' + (e.message || e));
        statusEl.innerHTML = '<span style="color:var(--fail)">' + esc(friendly) + '</span>';
      }
    },

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
      var clientLabel = clientDisplayLabel('This organisation');
      var generatedDate = new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' });
      /* If "Tailor with AI" produced a draft for THIS template id, it
         replaces purpose/scope/policyStatements only — title, review
         cadence and linked controls stay the original template's, same
         object shape buildTemplateHtml()/approveTemplate() already
         expect, so nothing downstream needs to know the difference. */
      var tailored = window._tailoredTemplates && window._tailoredTemplates[t.id];
      var reviewer = (Graph.getAccount() && Graph.getAccount().name) || (Store.kind === 'demo' ? 'Demo user' : 'Practitioner');
      var base = tailored ? Object.assign({}, t, { purpose: tailored.purpose, scope: tailored.scope, policyStatements: tailored.statements }) : t;
      /* Regenerating a document that has already been edited keeps the
         edits — otherwise "Generate" would quietly reset a policy
         somebody had spent an afternoon on. */
      var effective = effectivePolicyContent(base, t.title + '.html');
      var html = buildTemplateHtml(effective, { clientLabel: clientLabel, owner: owner, reviewDate: reviewDate, approved: false, generatedDate: generatedDate, aiAssisted: !!tailored, aiReviewer: reviewer, logoUrl: (S.settings && S.settings.clientLogoUrl) || '', brandColor: clientBrandColor() || '', version: '0.1', classification: 'Internal' });
      var filename = t.title + '.html';

      if (!printPreview(t.title, html)) return;

      if (Store.kind === 'demo') {
        toast('Generated for preview — sign in to a real tenant to save it to Documents.');
        return;
      }
      var doc;
      try {
        var file = new File([new Blob([html], { type: 'text/html;charset=utf-8' })], filename, { type: 'text/html;charset=utf-8' });
        /* Registers the document as it's saved (Clause 7.5.2) rather
           than leaving it for someone to fill in later: owner and next
           review are the two fields the practitioner has just typed
           into the generator, the frameworks come from the template's
           own tagging, and version 0.1/Draft is the honest starting
           point — approveTemplate() below promotes it to 1.0/Approved
           with a real approver against their name. */
        doc = await Store.uploadDocument(file, 'Policies & Procedures', {
          owner: owner, version: '0.1', status: 'Draft',
          approvedBy: '', approvalDate: '', nextReview: reviewDate,
          /* Internal, not the tenant's report classification: a policy
             is meant to be readable by every employee who has to follow
             it (and, shortly, to be attested by them), which is a
             different audience from a board report. Overridable per
             document via Details. */
          classification: 'Internal', frameworks: (t.frameworks || []).join(','), tplId: t.id
        });
      } catch (e) {
        warn(e);
        toastError('Generated for preview, but could not save to Documents: ' + esc(e.message || e));
        return;
      }
      if (doc.metaError) {
        warn(doc.metaError);
        toastError('Saved <b>' + esc(filename) + '</b>, but its register details could not be written — set them via <b>Details</b> in the register below.');
      }
      audit('Policy template generated', 'Document', filename, '(none)', JSON.stringify({
        tplId: t.id, owner: owner, reviewDate: reviewDate, clientLabel: clientLabel,
        aiAssisted: !!tailored, aiReviewer: tailored ? reviewer : '',
        tailoredPurpose: tailored ? tailored.purpose : undefined, tailoredScope: tailored ? tailored.scope : undefined, tailoredStatements: tailored ? tailored.statements : undefined
      }));
      renderDocuments();
      toast('Saved <b>' + esc(filename) + '</b> to Policies &amp; Procedures — marked DRAFT until approved' + (tailored ? ' (AI-assisted)' : '') + '.');

      if (t.controls.length) {
        var link = await showModal({
          title: 'Link as evidence?',
          message: 'Link this document as evidence for ' + t.controls.length + ' control' + (t.controls.length > 1 ? 's' : '') + ' it helps satisfy: ' + t.controls.join(', ') + '?',
          confirmText: 'Link evidence',
          cancelText: 'Not now'
        });
        if (link) {
          var bumped = 0;
          t.controls.forEach(function (code) {
            var c = S.controls.find(function (x) { return x.id === code && x.fw === 'iso27001'; }) || S.controls.find(function (x) { return x.id === code; });
            if (!c) return;
            var prevUrl = c.evidenceUrl;
            c.evidenceUrl = doc.url;
            var key = c.fw + '|' + c.id;
            /* A policy just written FOR this control is real, visible
               progress — leaving the control sitting at "Not started"
               while it now has linked evidence reads as stale/wrong on
               every chart and KPI that reads status (see the live
               "why does this look uncoloured" reports this session).
               Only bumps a control that's still at the untouched
               default — never overwrites "In progress"/"Implemented"
               someone already set by hand, and never claims
               "Implemented" on the strength of a draft policy alone. */
            if (c.st === 'Not started') {
              var prevSt = c.st;
              c.st = 'In progress';
              audit('Control status changed', 'Control', key, prevSt, 'In progress (policy generated)');
              bumped++;
            }
            Store.updateControl(c).catch(function (e) { warn(e); });
            audit('Evidence link changed', 'Control', key, prevUrl || '(none)', doc.url);
          });
          renderSoa(); renderDash();
          toast('Linked as evidence to ' + t.controls.length + ' control' + (t.controls.length > 1 ? 's' : '') + (bumped ? ', ' + bumped + ' moved to In progress' : '') + '.');
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
      if (!t) { toastError('Could not recover this document\'s template data — approve it directly in SharePoint if needed.'); return; }
      var existing = (window._docs || []).find(function (x) { return x.name === name; }) || {};
      /* Approval is a named act by a named person on a dated version,
         not a checkbox — Clause 7.5.2 c). The approver defaults to the
         signed-in practitioner but is editable, because the person
         clicking is often recording someone else's decision (a CEO's
         sign-off in a management review, say). */
      var vals = await showModal({
        title: 'Approve “' + name + '”',
        message: 'This re-saves the document without the draft watermark and records the approval on the register.',
        fields: [
          { id: 'approvedBy', label: 'Approved by', value: (Graph.getAccount() && Graph.getAccount().name) || '', placeholder: 'e.g. M. Chen (CEO)' },
          { id: 'version', label: 'Version being approved', value: bumpDocVersion(existing.version), placeholder: 'e.g. 1.0' },
          { id: 'nextReview', label: 'Next review due', type: 'date', value: existing.nextReview || params.reviewDate || '' }
        ],
        confirmText: 'Approve',
        cancelText: 'Cancel',
        validate: function (v) {
          if (!v.approvedBy) return 'Record who approved this document.';
          if (!v.version) return 'Record the version being approved.';
          if (!v.nextReview) return 'Set the next review date — an approved policy with no review cadence fails Clause 7.5.2 c).';
          return null;
        }
      });
      if (!vals) return;
      var generatedDate = new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' });
      /* Recovers the SAME AI-tailored purpose/scope/statements this
         draft was generated with (not the original template's), if
         any — otherwise the approved copy would silently revert to
         the untailored text. */
      /* Precedence: shipped template, then the AI-tailored draft this
         document was generated from, then whatever a practitioner has
         since edited. The last of those used NOT to be applied here at
         all — approval re-rendered from the pristine template and
         silently destroyed any edit made since generation. That was a
         defect, not a limitation; effectivePolicyContent() closes it. */
      var tailored = params.aiAssisted ? Object.assign({}, t, { purpose: params.tailoredPurpose, scope: params.tailoredScope, policyStatements: params.tailoredStatements }) : t;
      var effective = effectivePolicyContent(tailored, name);
      /* The approved copy carries the review date just confirmed, not
         the one baked in at generation — otherwise the printed document
         and the register would disagree the moment anyone shifted the
         cadence, which is exactly the kind of mismatch an auditor
         pulls on. */
      var html = buildTemplateHtml(effective, { clientLabel: params.clientLabel, owner: params.owner, reviewDate: vals.nextReview, approved: true, generatedDate: generatedDate, aiAssisted: !!params.aiAssisted, aiReviewer: params.aiReviewer || '', logoUrl: (S.settings && S.settings.clientLogoUrl) || '', brandColor: clientBrandColor() || '', version: vals.version, approvedBy: vals.approvedBy, classification: existing.classification || 'Internal' });
      var approvedDoc;
      try {
        var file = new File([new Blob([html], { type: 'text/html;charset=utf-8' })], name, { type: 'text/html;charset=utf-8' });
        approvedDoc = await Store.uploadDocument(file, category, {
          owner: params.owner, version: vals.version, status: 'Approved',
          approvedBy: vals.approvedBy, approvalDate: new Date().toISOString().slice(0, 10),
          nextReview: vals.nextReview, classification: existing.classification || 'Internal',
          frameworks: (t.frameworks || []).join(','), tplId: t.id
        });
      } catch (e) { warn(e); toastError('Could not save the approved copy: ' + esc(e.message || e)); return; }
      audit('Policy document approved', 'Document', name, 'Draft',
        'Approved v' + vals.version + ' by ' + vals.approvedBy + ' · next review ' + vals.nextReview);
      /* An approved policy's review date becomes a real, dated ISMS
         activity — Clause 7.5.2 c) is a commitment to re-review, and a
         date sitting only on a document is a date nobody is reminded
         about. */
      await syncPolicyReviewCalendar(name, vals.nextReview, params.owner);
      renderDocuments();
      renderDash();
      if (approvedDoc && approvedDoc.metaError) toastError('<b>' + esc(name) + '</b> approved, but its register details could not be written — set them via <b>Details</b>.');
      else toast('<b>' + esc(name) + '</b> approved as v' + esc(vals.version) + '.');
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
        var clientLabel = clientDisplayLabel();
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
          { id: 'refs', label: 'Linked finding IDs (comma-separated — use "Raise finding" on the audit to create these directly)', value: (a.findingRefs || []).join(', ') }
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
        '<button class="x" data-action="App.closeDrawer">' + icon('close') + '</button>' +
        '<div class="id-t">' + a.id + ' · ' + esc(fwName(a.fw)) + '</div><h2>' + esc(a.scope) + '</h2>' +
        '<div class="d-sec"><h4>Details</h4>' +
        '<div class="d-kv"><span>Auditor</span><b>' + esc(a.auditor) + '</b></div>' +
        '<div class="d-kv"><span>Planned</span><b>' + fmtDate(a.planned) + '</b></div>' +
        '<div class="d-kv"><span>Status</span><b>' + a.status + '</b></div>' +
        (a.completed ? '<div class="d-kv"><span>Completed</span><b>' + fmtDate(a.completed) + '</b></div>' : '') + '</div>' +
        (a.summary ? '<div class="d-sec"><h4>Outcome</h4><p style="font-size:12px;color:var(--paper-dim);line-height:1.7">' + esc(a.summary) + '</p></div>' : '') +
        '<div class="d-sec"><h4>Findings raised</h4>' + (refActions.length ? refActions.map(function (x) {
          return '<div class="d-kv"><span>' + x.id + ' — ' + esc(x.title) + '</span><b><span class="chip ' + typeCls(x.type || 'Action') + '">' + esc(x.type || 'Action') + '</span></b></div>';
        }).join('') : '<div class="d-kv"><span>None</span></div>') + '</div>' +
        (READONLY ? '' :
          '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:16px">' +
          '<button class="btn sm" data-action="App.raiseAuditFinding" data-id="' + a.id + '">Raise finding</button>' +
          (a.status === 'Planned' ? '<button class="btn ghost sm" data-action="App.completeAudit" data-id="' + a.id + '">Mark complete</button>' : '') +
          '</div>');
      openDrawerUi('Audit ' + a.id);
    },

    /* Raise a finding straight from an internal audit — creates the
       action/nonconformity in the Actions register, sourced "Internal
       audit" and linked back to this audit's findingRefs, rather than
       the old two-step of creating it separately then typing its ID in.
       Nonconformity types then flow into the CAPA loop (Clause 10.1). */
    raiseAuditFinding: async function (id) {
      var a = (S.audits || []).find(function (x) { return x.id === id; });
      if (!a) return;
      var v = await showModal({
        title: 'Raise finding — ' + a.id,
        message: 'Creates a finding in the Actions register, sourced "Internal audit" and linked to this audit. No need to create it separately first.',
        fields: [
          { id: 'title', label: 'Finding description', type: 'textarea', placeholder: 'What the audit found.' },
          { id: 'type', label: 'Type', type: 'select', value: 'Non-conformity (Minor)', options: ['Non-conformity (Major)', 'Non-conformity (Minor)', 'Observation'] },
          { id: 'control', label: 'Related control (optional)', placeholder: 'e.g. A.8.5' },
          { id: 'risk', label: 'Linked risk (optional)', type: 'select', value: '', options: riskLinkOptions('') },
          { id: 'pr', label: 'Priority', type: 'select', value: 'High', options: ['Critical', 'High', 'Medium', 'Low'] },
          { id: 'owner', label: 'Owner', value: a.auditor || '' },
          { id: 'due', label: 'Due date', type: 'date', value: daysFrom(30) }
        ],
        confirmText: 'Raise finding',
        validate: function (v) { return v.title ? null : 'Describe the finding.'; }
      });
      if (!v) return;
      var maxA = S.actions.reduce(function (m, x) { var n = parseInt(String(x.id).replace(/\D/g, ''), 10) || 0; return Math.max(m, n); }, 0);
      var act = { id: 'ACT-' + String(maxA + 1).padStart(3, '0'), title: v.title, type: v.type, risk: '', control: v.control || '', pr: v.pr, owner: v.owner || 'Unassigned', due: v.due || daysFrom(30), status: 'Open', evidenceUrl: '', src: 'Internal audit' };
      busy(true);
      try {
        await Store.addAction(act);
        if (v.risk) {
          await setActionRiskLink(act, v.risk);
          await Store.updateAction(act);
          var lr = risk(act.risk);
          if (lr) { recomputeRiskStatus(lr); await Store.updateRisk(lr); }
        }
        a.findingRefs = (a.findingRefs || []).concat([act.id]);
        await Store.updateAudit(a);
        audit('Audit finding raised', 'Action', act.id, '', v.type + ' from ' + a.id + ': ' + v.title);
        toast('<b>' + act.id + '</b> (' + esc(v.type) + ') raised from ' + a.id);
      } catch (e) { warn(e); }
      busy(false);
      renderAll();
      App.openAudit(id);
    },

    toggleAddIncident: function () {
      var panel = document.getElementById('addIncidentPanel');
      var showing = panel.style.display !== 'none';
      panel.style.display = showing ? 'none' : 'block';
      if (!showing) {
        document.getElementById('naIncTitle').value = '';
        document.getElementById('naIncSeverity').value = 'Medium';
        document.getElementById('naIncDetected').value = new Date().toISOString().slice(0, 10);
        document.getElementById('naIncOccurred').value = new Date().toISOString().slice(0, 10);
        document.getElementById('naIncReportedBy').value = '';
        document.getElementById('naIncPrivacy').value = '';
        document.getElementById('naIncDescription').value = '';
      }
    },

    addIncident: async function () {
      var title = document.getElementById('naIncTitle').value.trim();
      if (!title) { toast('Describe what happened first'); return; }
      var maxN = (S.incidents || []).reduce(function (m, n) { var x = parseInt(String(n.id).replace(/\D/g, ''), 10) || 0; return Math.max(m, x); }, 0);
      var detected = document.getElementById('naIncDetected').value || new Date().toISOString().slice(0, 10);
      var isPrivacyBreach = document.getElementById('naIncPrivacy').value === 'yes';
      var n = {
        id: 'INC-' + String(maxN + 1).padStart(4, '0'),
        title: title,
        category: document.getElementById('naIncCategory').value,
        severity: document.getElementById('naIncSeverity').value,
        detected: detected,
        occurred: document.getElementById('naIncOccurred').value || detected,
        reportedBy: document.getElementById('naIncReportedBy').value.trim() || 'Unknown',
        discoveredVia: document.getElementById('naIncDiscoveredVia').value,
        description: document.getElementById('naIncDescription').value.trim(),
        affectedSystems: '', status: 'Open', containmentActions: '', rootCause: '', lessonsLearned: '',
        actionRefs: [], evidenceUrl: '',
        isPrivacyBreach: isPrivacyBreach,
        assessmentDueDate: isPrivacyBreach ? window.CheckpointLib.addDaysToDateStr(detected, 30) : '',
        assessmentNote: '', assessmentComplete: false, notifiedRegulator: false, notifiedRegulatorDate: '',
        notifiedIndividuals: false, notifiedIndividualsDate: '', closedDate: ''
      };
      busy(true);
      try {
        await Store.addIncident(n);
        log('<b>' + n.id + '</b> incident logged: ' + esc(n.title) + '.' + (isPrivacyBreach ? ' Flagged as a possible privacy breach — assessment due ' + fmtDate(n.assessmentDueDate) + '.' : ''));
        toast('<b>' + n.id + '</b> logged');
        audit('Incident logged', 'Incident', n.id, '', n.title);
      } catch (e) { warn(e); }
      busy(false);
      App.toggleAddIncident();
      renderIncidents(); renderNavCounts(); renderDash();
    },

    openIncident: function (id) {
      var n = (S.incidents || []).find(function (x) { return x.id === id; });
      if (!n) return;
      var a = window.CheckpointLib.incidentAssessmentState(n, new Date().toISOString().slice(0, 10));
      document.getElementById('drawer').innerHTML =
        '<button class="x" data-action="App.closeDrawer">' + icon('close') + '</button>' +
        '<div class="id-t">' + n.id + ' · ' + esc(n.category) + '</div><h2>' + esc(n.title) + '</h2>' +
        '<div class="d-sec"><h4>Details</h4>' +
        '<div class="d-kv"><span>Severity</span><b>' + esc(n.severity) + '</b></div>' +
        '<div class="d-kv"><span>Status</span><b>' + esc(n.status) + '</b></div>' +
        '<div class="d-kv"><span>Detected</span><b>' + fmtDate(n.detected) + '</b></div>' +
        '<div class="d-kv"><span>Occurred</span><b>' + fmtDate(n.occurred) + '</b></div>' +
        '<div class="d-kv"><span>Reported by</span><b>' + esc(n.reportedBy) + '</b></div>' +
        '<div class="d-kv"><span>Discovered via</span><b>' + esc(n.discoveredVia) + '</b></div>' +
        (n.closedDate ? '<div class="d-kv"><span>Closed</span><b>' + fmtDate(n.closedDate) + '</b></div>' : '') + '</div>' +
        (n.description ? '<div class="d-sec"><h4>What happened</h4><p style="font-size:12px;color:var(--paper-dim);line-height:1.7">' + esc(n.description) + '</p></div>' : '') +
        (n.affectedSystems ? '<div class="d-sec"><h4>Affected systems / data</h4><p style="font-size:12px;color:var(--paper-dim);line-height:1.7">' + esc(n.affectedSystems) + '</p></div>' : '') +
        (n.containmentActions ? '<div class="d-sec"><h4>Containment actions</h4><p style="font-size:12px;color:var(--paper-dim);line-height:1.7">' + esc(n.containmentActions) + '</p></div>' : '') +
        (n.rootCause ? '<div class="d-sec"><h4>Root cause</h4><p style="font-size:12px;color:var(--paper-dim);line-height:1.7">' + esc(n.rootCause) + '</p></div>' : '') +
        (n.lessonsLearned ? '<div class="d-sec"><h4>Lessons learned</h4><p style="font-size:12px;color:var(--paper-dim);line-height:1.7">' + esc(n.lessonsLearned) + '</p></div>' : '') +
        (n.actionRefs && n.actionRefs.length ? '<div class="d-sec"><h4>Linked actions</h4>' + n.actionRefs.map(function (ref) {
          var act = S.actions.find(function (x) { return x.id === ref; });
          return '<div class="d-kv"><span>' + ref + (act ? ' — ' + esc(act.title) : '') + '</span></div>';
        }).join('') + '</div>' : '') +
        (n.isPrivacyBreach ? '<div class="d-sec"><h4>Privacy-breach assessment</h4>' +
          '<div class="d-kv"><span>Status</span><b>' + incidentAssessmentChip(n) + '</b></div>' +
          (n.assessmentDueDate ? '<div class="d-kv"><span>Assessment due</span><b>' + fmtDate(n.assessmentDueDate) + '</b></div>' : '') +
          (n.assessmentNote ? '<div class="d-kv"><span>Assessment note</span><b style="text-align:left;max-width:60%">' + esc(n.assessmentNote) + '</b></div>' : '') +
          '<div class="d-kv"><span>Regulator notified</span><b>' + (n.notifiedRegulator ? 'Yes — ' + fmtDate(n.notifiedRegulatorDate) : 'No') + '</b></div>' +
          '<div class="d-kv"><span>Individuals notified</span><b>' + (n.notifiedIndividuals ? 'Yes — ' + fmtDate(n.notifiedIndividualsDate) : 'No') + '</b></div>' +
          '</div>' : '') +
        (READONLY ? '' :
          '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:16px">' +
          '<button class="btn sm" data-action="App.updateIncidentDetails" data-id="' + n.id + '">Update details</button>' +
          (n.isPrivacyBreach ? '<button class="btn ghost sm" data-action="App.recordIncidentAssessment" data-id="' + n.id + '">Record assessment</button>' : '') +
          (n.status !== 'Closed' ? '<button class="btn ghost sm" data-action="App.closeIncident" data-id="' + n.id + '">Close incident</button>' : '') +
          '</div>');
      openDrawerUi('Incident ' + n.id);
    },

    updateIncidentDetails: async function (id) {
      var n = (S.incidents || []).find(function (x) { return x.id === id; });
      if (!n) return;
      var v = await showModal({
        title: 'Update incident — ' + n.id,
        fields: [
          { id: 'status', label: 'Status', type: 'select', value: n.status, options: ['Open', 'Investigating', 'Contained', 'Closed'] },
          { id: 'affectedSystems', label: 'Affected systems / data', type: 'textarea', value: n.affectedSystems || '' },
          { id: 'containmentActions', label: 'Containment actions', type: 'textarea', value: n.containmentActions || '' },
          { id: 'rootCause', label: 'Root cause', type: 'textarea', value: n.rootCause || '' },
          { id: 'lessonsLearned', label: 'Lessons learned', type: 'textarea', value: n.lessonsLearned || '' },
          { id: 'actionRefs', label: 'Linked action IDs (comma-separated)', value: (n.actionRefs || []).join(', ') },
          { id: 'evidenceUrl', label: 'Evidence URL', value: n.evidenceUrl || '' }
        ],
        confirmText: 'Save'
      });
      if (!v) return;
      var prevStatus = n.status;
      n.status = v.status;
      n.affectedSystems = v.affectedSystems;
      n.containmentActions = v.containmentActions;
      n.rootCause = v.rootCause;
      n.lessonsLearned = v.lessonsLearned;
      n.actionRefs = v.actionRefs ? v.actionRefs.split(',').map(function (s) { return s.trim(); }).filter(Boolean) : [];
      n.evidenceUrl = v.evidenceUrl;
      try { await Store.updateIncident(n); } catch (e) { warn(e); }
      log('<b>' + n.id + '</b> incident updated.');
      toast('<b>' + n.id + '</b> updated');
      audit('Incident updated', 'Incident', n.id, prevStatus, v.status);
      renderIncidents(); renderNavCounts(); renderDash();
      App.openIncident(id);
    },

    recordIncidentAssessment: async function (id) {
      var n = (S.incidents || []).find(function (x) { return x.id === id; });
      if (!n) return;
      var v = await showModal({
        title: 'Record privacy-breach assessment — ' + n.id,
        message: 'Marking the assessment complete (even "assessed, no notification required") clears it from the overdue list — it does not require notifying anyone.',
        fields: [
          { id: 'assessmentNote', label: 'Assessment note', type: 'textarea', value: n.assessmentNote || '', placeholder: 'What was assessed and the outcome, or progress so far' },
          { id: 'assessmentComplete', label: 'Assessment complete?', type: 'select', value: n.assessmentComplete ? 'yes' : 'no', options: [{ value: 'no', label: 'No — still in progress' }, { value: 'yes', label: 'Yes — assessment complete' }] },
          { id: 'notifiedRegulator', label: 'Regulator notified?', type: 'select', value: n.notifiedRegulator ? 'yes' : 'no', options: [{ value: 'no', label: 'No' }, { value: 'yes', label: 'Yes' }] },
          { id: 'notifiedIndividuals', label: 'Affected individuals notified?', type: 'select', value: n.notifiedIndividuals ? 'yes' : 'no', options: [{ value: 'no', label: 'No' }, { value: 'yes', label: 'Yes' }] }
        ],
        confirmText: 'Save assessment'
      });
      if (!v) return;
      var today = new Date().toISOString().slice(0, 10);
      n.assessmentNote = v.assessmentNote;
      n.assessmentComplete = v.assessmentComplete === 'yes';
      var wasNotifiedRegulator = n.notifiedRegulator;
      var wasNotifiedIndividuals = n.notifiedIndividuals;
      n.notifiedRegulator = v.notifiedRegulator === 'yes';
      n.notifiedIndividuals = v.notifiedIndividuals === 'yes';
      if (n.notifiedRegulator) n.assessmentComplete = true;
      if (n.notifiedIndividuals) n.assessmentComplete = true;
      if (n.notifiedRegulator && !wasNotifiedRegulator) n.notifiedRegulatorDate = today;
      if (n.notifiedIndividuals && !wasNotifiedIndividuals) n.notifiedIndividualsDate = today;
      try { await Store.updateIncident(n); } catch (e) { warn(e); }
      log('<b>' + n.id + '</b> privacy-breach assessment recorded.');
      toast('<b>' + n.id + '</b> assessment recorded');
      audit('Incident assessment recorded', 'Incident', n.id, '', v.assessmentNote);
      renderIncidents(); renderNavCounts(); renderDash();
      App.openIncident(id);
    },

    closeIncident: async function (id) {
      var n = (S.incidents || []).find(function (x) { return x.id === id; });
      if (!n) return;
      if (n.isPrivacyBreach && !n.assessmentNote && !n.notifiedRegulator && !n.notifiedIndividuals) {
        var proceed = await showModal({ title: 'Close ' + n.id, message: 'This incident is flagged as a possible privacy breach with no assessment recorded yet. Close it anyway?', confirmText: 'Close anyway' });
        if (!proceed) return;
      }
      var prevStatus = n.status;
      n.status = 'Closed';
      n.closedDate = new Date().toISOString().slice(0, 10);
      try { await Store.updateIncident(n); } catch (e) { warn(e); }
      log('<b>' + n.id + '</b> incident closed.');
      toast('<b>' + n.id + '</b> closed');
      audit('Incident closed', 'Incident', n.id, prevStatus, 'Closed');
      renderIncidents(); renderNavCounts(); renderDash();
      App.closeDrawer();
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
        var auto = App.autoReviewInputs();
        var autoKeys = { priorActions: 1, performance: 1, riskStatus: 1 };
        document.getElementById('naReviewInputSections').innerHTML = window.CheckpointLib.MR_INPUT_SECTIONS.map(function (s) {
          var isAuto = !!autoKeys[s.key];
          return '<div style="margin-top:14px">' +
            '<label for="naMR_' + s.key + '" style="display:block;font-size:11px;letter-spacing:.06em;color:var(--paper-faint)"><b style="color:var(--paper-dim)">' + s.clause + '</b> — ' + esc(s.label) + (isAuto ? ' <span style="color:var(--gold-light)">(pre-filled — edit as needed)</span>' : '') + '</label>' +
            '<textarea class="mini" id="naMR_' + s.key + '" rows="' + (isAuto ? 3 : 2) + '" style="width:100%;margin-top:6px;resize:vertical">' + esc(auto[s.key] || '') + '</textarea>' +
            '</div>';
        }).join('');
      }
    },

    /* The Clause 9.3.2 inputs Checkpoint can measure from live data —
       prior-review actions (a), security performance (d) and risk-
       treatment status (f). The qualitative inputs (b, c, e, g) are the
       practitioner's to add; the form leaves those blank rather than
       inventing them. */
    autoReviewInputs: function () {
      var last = S.scans[S.scans.length - 1];
      var openActs = S.actions.filter(function (a) { return a.status !== 'Done' && a.status !== 'Cancelled'; });
      var od = S.actions.filter(overdue).length;
      var crit = S.risks.filter(function (r) { if (r.status === 'Closed') return false; var q = residual(r); return band(q.L * q.I) === 'Critical' || band(q.L * q.I) === 'High'; }).length;
      var openRisks = S.risks.filter(function (r) { return r.status !== 'Closed'; });
      var ncs = S.actions.filter(function (a) { return a.type && a.type.indexOf('Non-conformity') === 0; });
      var openNCs = ncs.filter(function (a) { return a.status !== 'Done'; });
      var capaOutstanding = ncs.filter(function (a) { return !window.CheckpointLib.capaStatus(a).complete; }).length;
      var primaryFw = entitledFrameworks().indexOf('iso27001') > -1 ? 'iso27001' : entitledFrameworks()[0];
      var readiness = '';
      if (primaryFw) {
        var pApp = frameworkAppRows(primaryFw);
        var pImpl = pApp.filter(function (c) { return c.st === 'Implemented'; }).length;
        readiness = (pApp.length ? Math.round(pImpl / pApp.length * 100) : 0) + '% ' + fwName(primaryFw) + ' control readiness';
      }
      var lastAuditRec = (S.audits || []).filter(function (a) { return a.status === 'Completed'; }).sort(function (a, b) { return (b.completed || '').localeCompare(a.completed || ''); })[0];
      var prevReview = (S.reviews || []).slice().sort(function (a, b) { return (b.date || '').localeCompare(a.date || ''); })[0];
      var accepted = openRisks.filter(function (r) { return r.acceptedBy; }).length;
      return {
        priorActions: (prevReview ? 'Previous review ' + prevReview.id + ' (' + fmtDate(prevReview.date) + '). ' : 'No previous management review on record. ') +
          openActs.length + ' action(s) currently open, ' + od + ' overdue.',
        performance: 'Posture score ' + (last ? last.score + '/100' : 'no scan run') + '. ' + (readiness ? readiness + '. ' : '') +
          openNCs.length + ' open nonconformit' + (openNCs.length === 1 ? 'y' : 'ies') + ' of ' + ncs.length + ' raised' + (capaOutstanding ? ' (' + capaOutstanding + ' with corrective action still outstanding)' : '') + '. ' +
          (lastAuditRec ? 'Last internal audit ' + fmtDate(lastAuditRec.completed) + ' (' + lastAuditRec.scope + ').' : 'No internal audit on record.'),
        riskStatus: openRisks.length + ' risk(s) under management, ' + crit + ' at High/Critical residual. ' +
          accepted + ' residual risk(s) with documented owner acceptance.'
      };
    },

    recordReview: async function () {
      var attendees = document.getElementById('naReviewAttendees').value.trim();
      if (!attendees) { toast('Enter attendees first'); return; }
      var inputsObj = {};
      window.CheckpointLib.MR_INPUT_SECTIONS.forEach(function (s) {
        var el = document.getElementById('naMR_' + s.key);
        if (el) inputsObj[s.key] = el.value.trim();
      });
      var maxR = (S.reviews || []).reduce(function (m, r) { var n = parseInt(String(r.id).replace(/\D/g, ''), 10) || 0; return Math.max(m, n); }, 0);
      var r = {
        id: 'MR-' + String(maxR + 1).padStart(3, '0'),
        date: document.getElementById('naReviewDate').value || new Date().toISOString().slice(0, 10),
        attendees: attendees,
        inputs: window.CheckpointLib.serializeReviewInputs(inputsObj),
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
        '<button class="x" data-action="App.closeDrawer">' + icon('close') + '</button>' +
        '<div class="id-t">' + r.id + '</div><h2>Management review — ' + fmtDate(r.date) + '</h2>' +
        '<div class="d-sec"><h4>Attendees</h4><p style="font-size:12px;color:var(--paper-dim)">' + esc(r.attendees) + '</p></div>' +
        '<div class="d-sec"><h4>Inputs at time of review (Clause 9.3.2)</h4>' + reviewInputsHtml(r.inputs) + '</div>' +
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
        var clientLabel = clientDisplayLabel();

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

    setSoc2ReportType: async function (type) {
      var prevType = (S.settings && S.settings.soc2ReportType) || 'Type I';
      if (type === prevType) return;
      S.settings.soc2ReportType = type;
      try { await Store.setSetting('soc2ReportType', type); } catch (e) { warn(e); }
      log('SOC 2 report type set to <b>' + esc(type) + '</b>.');
      toast('SOC 2 report type set to <b>' + esc(type) + '</b>');
      audit('Setting changed', 'Setting', 'soc2ReportType', prevType, type);
      renderFrameworksAdmin(); renderSoa(); renderDash();
    },

    setSoc2ObservationStart: async function (dateStr) {
      var prevDate = (S.settings && S.settings.soc2ObservationStart) || '';
      if (dateStr === prevDate) return;
      S.settings.soc2ObservationStart = dateStr;
      try { await Store.setSetting('soc2ObservationStart', dateStr); } catch (e) { warn(e); }
      log('SOC 2 Type II observation start set to <b>' + (dateStr ? esc(fmtDate(dateStr)) : 'unset') + '</b>.');
      toast('Observation start ' + (dateStr ? 'set to ' + esc(fmtDate(dateStr)) : 'cleared'));
      audit('Setting changed', 'Setting', 'soc2ObservationStart', prevDate, dateStr);
      renderFrameworksAdmin(); renderSoa();
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
      } catch (e) { warn(e); toastError('Could not switch NIST CSF depth — see console for details'); }
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

    /* IS18 (QGEA) scan suggestions — same confirm/dismiss contract as
       the Essential Eight pair above, against the flat is18 codes. */
    confirmIs18Suggestion: async function (key) {
      var p = S.is18Proposed.find(function (x) { return x.code === key; });
      if (!p) return;
      var c = S.controls.find(function (x) { return x.fw === 'is18' && x.id === p.code; });
      if (!c) return;
      var prevSt = c.st;
      c.st = p.to;
      try { await Store.updateControl(c); } catch (e) { warn(e); }
      S.is18Proposed = S.is18Proposed.filter(function (x) { return x !== p; });
      log('<b>' + esc(c.id) + '</b> set to <b>' + esc(p.to) + '</b> — confirmed from posture scan suggestion (' + esc(p.checkLabel) + ').');
      toast('<b>' + esc(c.id) + '</b> → ' + esc(p.to));
      audit('Control status changed', 'Control', 'is18|' + p.code, prevSt, p.to + ' (scan-suggested, practitioner-confirmed)');
      renderSoa(); renderDash();
    },

    dismissIs18Suggestion: function (key) {
      var p = S.is18Proposed.find(function (x) { return x.code === key; });
      if (!p) return;
      S.is18Proposed = S.is18Proposed.filter(function (x) { return x !== p; });
      log('IS18 suggestion for <b>' + esc(p.code) + '</b> dismissed by practitioner.');
      renderSoa();
    },

    /* RFFR (ISM SoA) suggestion confirm/dismiss — same flat, one-control
       contract as the IS18 pair above, against the rffr framework's ISM
       codes. */
    confirmRffrSuggestion: async function (key) {
      var p = S.rffrProposed.find(function (x) { return x.code === key; });
      if (!p) return;
      var c = S.controls.find(function (x) { return x.fw === 'rffr' && x.id === p.code; });
      if (!c) return;
      var prevSt = c.st;
      c.st = p.to;
      try { await Store.updateControl(c); } catch (e) { warn(e); }
      S.rffrProposed = S.rffrProposed.filter(function (x) { return x !== p; });
      log('<b>' + esc(c.id) + '</b> set to <b>' + esc(p.to) + '</b> — confirmed from posture scan suggestion (' + esc(p.checkLabel) + ').');
      toast('<b>' + esc(c.id) + '</b> → ' + esc(p.to));
      audit('Control status changed', 'Control', 'rffr|' + p.code, prevSt, p.to + ' (scan-suggested, practitioner-confirmed)');
      renderSoa(); renderDash();
    },

    dismissRffrSuggestion: function (key) {
      var p = S.rffrProposed.find(function (x) { return x.code === key; });
      if (!p) return;
      S.rffrProposed = S.rffrProposed.filter(function (x) { return x !== p; });
      log('RFFR (ISM) suggestion for <b>' + esc(p.code) + '</b> dismissed by practitioner.');
      renderSoa();
    },

    /* ISO 42001 (AI Management System) suggestion confirm/dismiss — same
       flat, one-control contract as the IS18/RFFR pairs above, against
       the iso42001 framework's Annex A codes. */
    confirmIso42001Suggestion: async function (key) {
      var p = S.iso42001Proposed.find(function (x) { return x.code === key; });
      if (!p) return;
      var c = S.controls.find(function (x) { return x.fw === 'iso42001' && x.id === p.code; });
      if (!c) return;
      var prevSt = c.st;
      c.st = p.to;
      try { await Store.updateControl(c); } catch (e) { warn(e); }
      S.iso42001Proposed = S.iso42001Proposed.filter(function (x) { return x !== p; });
      log('<b>' + esc(c.id) + '</b> set to <b>' + esc(p.to) + '</b> — confirmed from posture scan suggestion (' + esc(p.checkLabel) + ').');
      toast('<b>' + esc(c.id) + '</b> → ' + esc(p.to));
      audit('Control status changed', 'Control', 'iso42001|' + p.code, prevSt, p.to + ' (scan-suggested, practitioner-confirmed)');
      renderSoa(); renderDash();
    },

    dismissIso42001Suggestion: function (key) {
      var p = S.iso42001Proposed.find(function (x) { return x.code === key; });
      if (!p) return;
      S.iso42001Proposed = S.iso42001Proposed.filter(function (x) { return x !== p; });
      log('ISO 42001 suggestion for <b>' + esc(p.code) + '</b> dismissed by practitioner.');
      renderSoa();
    },

    /* ISO 27701 (PIMS) suggestion confirm/dismiss — same flat,
       one-control contract as the ISO 42001 pair above, against the
       iso27701 framework's P.7.x/P.8.x codes. */
    confirmIso27701Suggestion: async function (key) {
      var p = S.iso27701Proposed.find(function (x) { return x.code === key; });
      if (!p) return;
      var c = S.controls.find(function (x) { return x.fw === 'iso27701' && x.id === p.code; });
      if (!c) return;
      var prevSt = c.st;
      c.st = p.to;
      try { await Store.updateControl(c); } catch (e) { warn(e); }
      S.iso27701Proposed = S.iso27701Proposed.filter(function (x) { return x !== p; });
      log('<b>' + esc(c.id) + '</b> set to <b>' + esc(p.to) + '</b> — confirmed from posture scan suggestion (' + esc(p.checkLabel) + ').');
      toast('<b>' + esc(c.id) + '</b> → ' + esc(p.to));
      audit('Control status changed', 'Control', 'iso27701|' + p.code, prevSt, p.to + ' (scan-suggested, practitioner-confirmed)');
      renderSoa(); renderDash();
    },

    dismissIso27701Suggestion: function (key) {
      var p = S.iso27701Proposed.find(function (x) { return x.code === key; });
      if (!p) return;
      S.iso27701Proposed = S.iso27701Proposed.filter(function (x) { return x !== p; });
      log('ISO 27701 suggestion for <b>' + esc(p.code) + '</b> dismissed by practitioner.');
      renderSoa();
    },

    /* SOC 2 suggestion confirm/dismiss — same flat, one-control contract
       as the pairs above, against the soc2 framework's Trust Services
       Criteria codes. */
    confirmSoc2Suggestion: async function (key) {
      var p = S.soc2Proposed.find(function (x) { return x.code === key; });
      if (!p) return;
      var c = S.controls.find(function (x) { return x.fw === 'soc2' && x.id === p.code; });
      if (!c) return;
      var prevSt = c.st;
      c.st = p.to;
      try { await Store.updateControl(c); } catch (e) { warn(e); }
      S.soc2Proposed = S.soc2Proposed.filter(function (x) { return x !== p; });
      log('<b>' + esc(c.id) + '</b> set to <b>' + esc(p.to) + '</b> — confirmed from posture scan suggestion (' + esc(p.checkLabel) + ').');
      toast('<b>' + esc(c.id) + '</b> → ' + esc(p.to));
      audit('Control status changed', 'Control', 'soc2|' + p.code, prevSt, p.to + ' (scan-suggested, practitioner-confirmed)');
      renderSoa(); renderDash();
    },

    dismissSoc2Suggestion: function (key) {
      var p = S.soc2Proposed.find(function (x) { return x.code === key; });
      if (!p) return;
      S.soc2Proposed = S.soc2Proposed.filter(function (x) { return x !== p; });
      log('SOC 2 suggestion for <b>' + esc(p.code) + '</b> dismissed by practitioner.');
      renderSoa();
    },

    /* NIST CSF suggestion confirm/dismiss — same flat, one-control
       contract as the pairs above, against the nistcsf framework's
       category codes. */
    confirmNistCsfSuggestion: async function (key) {
      var p = S.nistcsfProposed.find(function (x) { return x.code === key; });
      if (!p) return;
      var c = S.controls.find(function (x) { return x.fw === 'nistcsf' && x.id === p.code; });
      if (!c) return;
      var prevSt = c.st;
      c.st = p.to;
      try { await Store.updateControl(c); } catch (e) { warn(e); }
      S.nistcsfProposed = S.nistcsfProposed.filter(function (x) { return x !== p; });
      log('<b>' + esc(c.id) + '</b> set to <b>' + esc(p.to) + '</b> — confirmed from posture scan suggestion (' + esc(p.checkLabel) + ').');
      toast('<b>' + esc(c.id) + '</b> → ' + esc(p.to));
      audit('Control status changed', 'Control', 'nistcsf|' + p.code, prevSt, p.to + ' (scan-suggested, practitioner-confirmed)');
      renderSoa(); renderDash();
    },

    dismissNistCsfSuggestion: function (key) {
      var p = S.nistcsfProposed.find(function (x) { return x.code === key; });
      if (!p) return;
      S.nistcsfProposed = S.nistcsfProposed.filter(function (x) { return x !== p; });
      log('NIST CSF suggestion for <b>' + esc(p.code) + '</b> dismissed by practitioner.');
      renderSoa();
    },

    /* ISO 27001 suggestion confirm/dismiss — same flat, one-control
       contract as the pairs above, against the iso27001 framework's
       A.5/A.8 codes, sourced from CHECK_CONTROLS rather than a
       licensed-pack table (see the runScan() comment above). */
    confirmIso27001Suggestion: async function (key) {
      var p = S.iso27001Proposed.find(function (x) { return x.code === key; });
      if (!p) return;
      var c = S.controls.find(function (x) { return x.fw === 'iso27001' && x.id === p.code; });
      if (!c) return;
      var prevSt = c.st;
      c.st = p.to;
      try { await Store.updateControl(c); } catch (e) { warn(e); }
      S.iso27001Proposed = S.iso27001Proposed.filter(function (x) { return x !== p; });
      log('<b>' + esc(c.id) + '</b> set to <b>' + esc(p.to) + '</b> — confirmed from posture scan suggestion (' + esc(p.checkLabel) + ').');
      toast('<b>' + esc(c.id) + '</b> → ' + esc(p.to));
      audit('Control status changed', 'Control', 'iso27001|' + p.code, prevSt, p.to + ' (scan-suggested, practitioner-confirmed)');
      renderSoa(); renderDash();
    },

    dismissIso27001Suggestion: function (key) {
      var p = S.iso27001Proposed.find(function (x) { return x.code === key; });
      if (!p) return;
      S.iso27001Proposed = S.iso27001Proposed.filter(function (x) { return x !== p; });
      log('ISO 27001 suggestion for <b>' + esc(p.code) + '</b> dismissed by practitioner.');
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
        if (fw === 'ai' && next) { try { await ensureAiSelfSystemSeeded(); } catch (e) { warn(e); } }
      } catch (e) { warn(e); }
      busy(false);
      if (!window._soaFw || !S.entitlements[window._soaFw]) window._soaFw = entitledFrameworks()[0];
      renderFrameworksAdmin(); renderDash(); renderSoa(); renderFeatureVisibility(); renderScanChecks(true); renderProposed(); renderAiSystems();
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

      /* Durable local persistence FIRST, before any network write
         (req 1) — this browser now holds proof of a verified activation
         regardless of what happens to the SharePoint write below, and
         regardless of whether this tab/session survives to see it
         succeed. */
      if (writeLocalActivation(result.raw)) clearPersistenceFailure('local');
      else reportPersistenceFailure('local', 'This browser\'s storage could not be written (private browsing, or storage is full).');

      var tenantOk = false;
      try {
        await Store.setSetting('entitlementFile', result.raw);
        S.settings.entitlementFile = result.raw;
        tenantOk = true;
        clearPersistenceFailure('tenant');
      } catch (e) {
        reportPersistenceFailure('tenant', describeGraphError(e));
      }
      try { await applyEntitlementFrameworks(result.evalResult); } catch (e) { warn(e); }
      busy(false);
      if (fileInput) fileInput.value = '';
      if (textInput) textInput.value = '';
      ENTITLEMENT_STATE = result.evalResult;
      recomputeReadOnly();
      var statusLabel = result.evalResult.status === 'expired' ? 'expired (renewal needed)' : result.evalResult.status === 'grace' ? 'in grace period' : 'active';
      audit(wasRenewal ? 'Activation renewed' : 'Activation applied', 'Activation', 'file', prevExpiry,
        statusLabel + ' until ' + result.evalResult.expiry + ': ' + result.evalResult.frameworks.join(', ') +
        (tenantOk ? '' : ' (tenant Settings list write failed — saved to this browser only, see Licence panel)'));
      log((wasRenewal ? 'Activation renewed' : 'Activation applied') + ' — <b>' + esc(statusLabel) + '</b>.');
      /* Only claim success if the tenant write actually landed —
         reportPersistenceFailure() above already toasted the specific
         write failure otherwise (req 5: never a silent/false success). */
      if (tenantOk) {
        toast(result.evalResult.status === 'expired'
          ? 'Activation applied, but it expired ' + esc(fmtDate(result.evalResult.expiry)) + ' — renewal needed.'
          : result.evalResult.status === 'grace'
          ? 'Activation applied — in its grace period until ' + esc(fmtDate(result.evalResult.graceUntil)) + '.'
          : 'Activation verified and applied.');
      }
      if (!window._soaFw || !S.entitlements[window._soaFw]) window._soaFw = entitledFrameworks()[0];
      /* A renewal may have just cleared an expired-forced read-only —
         applyReadOnlyUi() only ever disables, never re-enables, so a
         full renderAll() regenerates every view's markup fresh
         (un-disabled) before it re-applies against whatever READONLY
         is now. */
      renderAll();
      renderLicensePanel('licensePanel');
    },

    retryActivation: function () { return retryActivationFromGate(); },

    /* Licence panel's "Retry" button on a standing persistence warning —
       just re-attempts the SharePoint mirror for whatever ENTITLEMENT_STATE
       already verified successfully; no re-verification needed since
       nothing about the file itself was in question. */
    retryLicensePersistence: async function () {
      if (!ENTITLEMENT_STATE) { toast('No verified activation to retry.'); return; }
      var localRaw = readLocalActivation();
      if (!localRaw) { toast('This browser has no locally-saved activation to retry.'); return; }
      if (Store && Store.kind === 'sharepoint' && S) {
        try {
          await Store.setSetting('entitlementFile', localRaw);
          S.settings.entitlementFile = localRaw;
          clearPersistenceFailure('tenant');
          toast('Saved to the tenant\'s Settings list.');
        } catch (e) {
          reportPersistenceFailure('tenant', describeGraphError(e));
        }
      }
      if (writeLocalActivation(localRaw)) clearPersistenceFailure('local');
      else reportPersistenceFailure('local', 'This browser\'s storage could not be written (private browsing, or storage is full).');
      renderLicensePanel('licensePanel');
    },

    /* "Remove licence from this browser" — clears ONLY this browser's
       localStorage cache (req 6). Never touches the tenant's own
       Settings list or its data; the next load simply re-resolves from
       whatever the tenant list still has (or shows #notActivated if it
       has nothing either). Mostly useful for testing/support ("start
       this browser clean") or when a browser was used for the wrong
       tenant's activation by mistake. */
    removeLocalLicense: function () {
      removeLocalActivation();
      clearPersistenceFailure('local');
      audit('Activation removed', 'Activation', 'file', ENTITLEMENT_STATE ? ENTITLEMENT_STATE.expiry : '', 'Removed from this browser\'s local storage only — the tenant\'s own Settings list (if any) is unaffected.');
      toast('Licence removed from this browser. The tenant\'s own copy (if any) is unaffected.');
      renderLicensePanel('licensePanel');
    },

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
      } catch (e) { warn(e); toastError('Could not save AI configuration'); }
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
          '<div style="font-size:13.5px;line-height:1.6">' + escAiText(res.text) + '</div>' +
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

    /* Explains a single posture check row in plain language — cached
       in memory per check id for this scan (see _checkExplainCache),
       so re-rendering the Coverage/Scan view (e.g. switching tabs)
       doesn't re-call the model for a check already explained this
       session. A fresh scan clears the cache (App.runScan above). */
    explainCheck: async function (id) {
      var c = window.CHECK_DEFS.find(function (x) { return x.id === id; });
      if (!c) return;
      if (!(S.entitlements && S.entitlements.ai)) return;
      var cfg = aiGetConfig();
      var target = document.getElementById('checkExplain-' + id);
      if (!target) return;
      if (!(cfg.enabled && cfg.endpoint && cfg.deployment)) {
        target.innerHTML = '<div class="card" style="margin:0 2px 10px;font-size:12.5px;color:var(--paper-dim)">AI assistant not configured — see <a href="AI-SETUP.md" target="_blank" rel="noopener">AI-SETUP.md</a>.</div>';
        return;
      }
      if (Store.kind === 'demo') {
        target.innerHTML = '<div class="card" style="margin:0 2px 10px;font-size:12.5px;color:var(--paper-faint)">Explanations aren\'t available in demo mode — this previews the layout only.</div>';
        return;
      }
      var r = checkResult(c);
      var resultLabel = r === 'pass' ? 'Pass' : r === 'review' ? 'Review' : r === 'fail' ? 'Fail' : r === 'manual' ? 'Manual — verify' : 'Not scanned';
      var tpl = c.tpl && TPL[c.tpl];
      var relatedControls = tpl ? tpl.risk.controls.map(function (code) { var ctl = S.controls.find(function (x) { return x.id === code; }); return { code: code, title: ctl ? ctl.t : '' }; }) : [];
      var checkDetail = { area: c.area, label: c.label, result: resultLabel, note: (S.lastNotes && S.lastNotes[c.id]) || '', relatedControls: relatedControls };
      target.innerHTML = '<div class="card" style="margin:0 2px 10px;font-size:12.5px;color:var(--paper-dim)">Asking…</div>';
      try {
        var res = await window.CheckpointAI.chat('explain', 'Explain this posture check finding in plain language for a non-technical stakeholder, and suggest concrete remediation steps.', { checkDetail: checkDetail, scanSummary: aiBuildDataBag().scanSummary });
        _checkExplainCache[id] = res.text;
        target.innerHTML = '<div class="card" style="margin:0 2px 10px;font-size:12.5px"><div class="chip st-Intreatment" style="margin-bottom:6px">' + esc(window.CheckpointAI.DISCLAIMER) + '</div>' + escAiText(res.text) + '</div>';
      } catch (e) {
        var friendly = e.code === 'not_configured' ? 'AI is not configured.'
          : e.code === 'auth_error' ? 'Not authorised — check the Cognitive Services OpenAI User role assignment (see AI-SETUP.md).'
          : e.code === 'rate_limited' ? 'The AI endpoint is rate-limiting requests — try again shortly.'
          : ('Could not get an explanation: ' + (e.message || e));
        target.innerHTML = '<div class="card" style="margin:0 2px 10px;font-size:12.5px;color:var(--fail)">' + esc(friendly) + '</div>';
      }
    },

    /* Advisory only — never edits the proposed template or pre-fills
       anything the Approve button reads from; a practitioner still
       approves (or dismisses) the SAME t.risk data this always showed.
       Cached per template id for as long as it stays proposed. */
    aiInsightProposed: async function (tpl) {
      var t = TPL[tpl];
      if (!t) return;
      var target = document.getElementById('riskInsight-' + tpl);
      if (!target || !(S.entitlements && S.entitlements.ai)) return;
      var cfg = aiGetConfig();
      if (!(cfg.enabled && cfg.endpoint && cfg.deployment)) { target.innerHTML = '<div class="card" style="margin-top:10px;font-size:12.5px;color:var(--paper-dim)">AI assistant not configured — see AI-SETUP.md.</div>'; return; }
      if (Store.kind === 'demo') { target.innerHTML = '<div class="card" style="margin-top:10px;font-size:12.5px;color:var(--paper-faint)">AI insight isn\'t available in demo mode — this previews the layout only.</div>'; return; }
      target.innerHTML = '<div class="card" style="margin-top:10px;font-size:12.5px;color:var(--paper-dim)">Asking…</div>';
      try {
        var prompt = 'Review this proposed risk register entry and give a short second opinion: is the suggested likelihood/impact reasonable for this tenant\'s context, and are the proposed treatment actions the right priorities? Risk: "' + t.risk.title + '" (likelihood ' + t.risk.L + ', impact ' + t.risk.I + '). Proposed actions: ' + t.actions.map(function (a) { return a.t; }).join('; ') + '.';
        var res = await window.CheckpointAI.chat('risk', prompt, { risks: aiBuildDataBag().risks, scanSummary: aiBuildDataBag().scanSummary });
        _riskInsightCache[tpl] = res.text;
        target.innerHTML = '<div class="card" style="margin-top:10px;font-size:12.5px"><div class="chip st-Intreatment" style="margin-bottom:6px">' + esc(window.CheckpointAI.DISCLAIMER) + '</div>' + escAiText(res.text) + '</div>';
      } catch (e) {
        var friendly = e.code === 'not_configured' ? 'AI is not configured.'
          : e.code === 'auth_error' ? 'Not authorised — check the Cognitive Services OpenAI User role assignment.'
          : e.code === 'rate_limited' ? 'The AI endpoint is rate-limiting requests — try again shortly.'
          : ('Could not get insight: ' + (e.message || e));
        target.innerHTML = '<div class="card" style="margin-top:10px;font-size:12.5px;color:var(--fail)">' + esc(friendly) + '</div>';
      }
    },

    questionnaireAsk: async function () {
      var input = document.getElementById('questionnaireInput');
      var resultEl = document.getElementById('questionnaireResult');
      var btn = document.getElementById('questionnaireAskBtn');
      var questions = (input.value || '').split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
      if (!questions.length) { toast('Paste at least one question first'); return; }
      if (Store.kind === 'demo') {
        resultEl.innerHTML = '<div class="card" style="max-width:820px;color:var(--paper-faint)">The questionnaire assistant isn\'t available in demo mode — this previews the panel\'s layout only.</div>';
        return;
      }
      btn.disabled = true; btn.textContent = 'Answering…';
      resultEl.innerHTML = '';
      try {
        var bag = aiBuildDataBag();
        var res = await window.CheckpointAI.chat('questionnaire', window.CheckpointAI.buildQuestionnairePrompt(questions), { soaSummary: bag.soaSummary, scanSummary: bag.scanSummary });
        _questionnaireResult = window.CheckpointAI.parseQuestionnaireAnswers(res.text, questions);
        renderQuestionnaireResult();
        audit('Questionnaire assistant run', 'Questionnaire', '', '', questions.length + ' question(s) answered');
      } catch (e) {
        var friendly = e.code === 'not_configured' ? 'AI is not configured.'
          : e.code === 'auth_error' ? 'Not authorised — check the Cognitive Services OpenAI User role assignment.'
          : e.code === 'rate_limited' ? 'The AI endpoint is rate-limiting requests — try again shortly.'
          : ('Could not get answers: ' + (e.message || e));
        resultEl.innerHTML = '<div class="card" style="max-width:820px;color:var(--fail)">' + esc(friendly) + '</div>';
      }
      btn.disabled = false; btn.textContent = 'Get answers';
    },

    mockAuditorRun: async function () {
      var resultEl = document.getElementById('mockAuditorResult');
      var btn = document.getElementById('mockAuditorRunBtn');
      if (Store.kind === 'demo') {
        resultEl.innerHTML = '<div class="card" style="max-width:820px;color:var(--paper-faint)">The mock auditor isn\'t available in demo mode — this previews the panel\'s layout only.</div>';
        return;
      }
      btn.disabled = true; btn.textContent = 'Generating…';
      resultEl.innerHTML = '';
      try {
        var gaps = aiBuildGapsDataBag();
        var bag = aiBuildDataBag();
        var res = await window.CheckpointAI.chat('mockAudit', window.CheckpointAI.buildMockAuditPrompt(), { soaSummary: bag.soaSummary, scanSummary: bag.scanSummary, risks: bag.risks, actions: bag.actions, gaps: gaps });
        var qa = window.CheckpointAI.parseMockAuditQA(res.text);
        renderMockAuditorResult(qa);
        audit('Mock auditor interview generated', 'MockAudit', '', '', qa.length + ' question(s) generated, ' + qa.filter(function (q) { return q.gapFlag; }).length + ' flagged as a gap');
      } catch (e) {
        var friendly = e.code === 'not_configured' ? 'AI is not configured.'
          : e.code === 'auth_error' ? 'Not authorised — check the Cognitive Services OpenAI User role assignment.'
          : e.code === 'rate_limited' ? 'The AI endpoint is rate-limiting requests — try again shortly.'
          : ('Could not generate the mock interview: ' + (e.message || e));
        resultEl.innerHTML = '<div class="card" style="max-width:820px;color:var(--fail)">' + esc(friendly) + '</div>';
      }
      btn.disabled = false; btn.textContent = 'Generate mock interview';
    },

    evidenceRequestSimRun: async function () {
      var resultEl = document.getElementById('evidenceSimResult');
      var btn = document.getElementById('evidenceSimRunBtn');
      if (Store.kind === 'demo') {
        resultEl.innerHTML = '<div class="card" style="max-width:820px;color:var(--paper-faint)">The evidence request simulator isn\'t available in demo mode — this previews the panel\'s layout only.</div>';
        return;
      }
      var entitled = entitledFrameworks();
      if (!entitled.length) return;
      if (!window._soaFw || entitled.indexOf(window._soaFw) === -1) window._soaFw = entitled[0];
      var activeFw = window._soaFw;
      var fwLabel = fwName(activeFw);
      btn.disabled = true; btn.textContent = 'Generating…';
      resultEl.innerHTML = '';
      try {
        var bag = aiBuildDataBag();
        var gaps = aiBuildGapsDataBag();
        var controlList = aiBuildControlListDataBag(activeFw);
        var res = await window.CheckpointAI.chat('evidenceRequestSim', window.CheckpointAI.buildEvidenceRequestPrompt(fwLabel), { soaSummary: bag.soaSummary, scanSummary: bag.scanSummary, risks: bag.risks, actions: bag.actions, gaps: gaps, controlList: controlList });
        var items = window.CheckpointAI.parseEvidenceRequestList(res.text);
        /* Deterministic ready/missing classification, computed HERE from
           this tenant's real register data — never left to the model.
           An item's control code is looked up against this framework's
           actual controls; "ready" requires both an Implemented status
           AND a real evidence link/verification — the exact inverse of
           aiBuildGapsDataBag()'s own "unevidenced control" definition.
           A code that doesn't match anything real (including the
           model's own "General" fallback, or an invented code) always
           renders missing rather than being guessed ready. */
        var rows = frameworkAppRows(activeFw);
        var byCode = {};
        rows.forEach(function (c) { byCode[c.id] = c; });
        _evidenceRequestResult = items.map(function (it) {
          var c = byCode[it.controlCode];
          var hasEvidence = !!(c && c.st === 'Implemented' && (c.evidenceUrl || c.verified));
          return { item: it.item, controlCode: it.controlCode, controlTitle: c ? c.t : '', status: hasEvidence ? 'ready' : 'missing', evidenceUrl: c ? c.evidenceUrl : '' };
        });
        renderEvidenceRequestSimResult();
        audit('Evidence request list generated', 'EvidenceRequestSim', fwLabel, '', _evidenceRequestResult.length + ' item(s), ' + _evidenceRequestResult.filter(function (r) { return r.status === 'ready'; }).length + ' ready');
      } catch (e) {
        var friendly = e.code === 'not_configured' ? 'AI is not configured.'
          : e.code === 'auth_error' ? 'Not authorised — check the Cognitive Services OpenAI User role assignment.'
          : e.code === 'rate_limited' ? 'The AI endpoint is rate-limiting requests — try again shortly.'
          : ('Could not generate the evidence request list: ' + (e.message || e));
        resultEl.innerHTML = '<div class="card" style="max-width:820px;color:var(--fail)">' + esc(friendly) + '</div>';
      }
      btn.disabled = false; btn.textContent = 'Generate evidence request list';
    },

    /* Evidence interpretation — reads an artefact the client already has
       (a supplier's SOC 2 report, a penetration test, a backup job
       export, an access review sign-off) and proposes which of THIS
       tenant's controls it evidences, what period it covers, and what
       it does not cover.

       Text in, proposals out. The artefact's text is either read
       directly from a text-shaped file the browser can decode, or
       pasted by the practitioner — deliberately not a claim to parse
       PDFs, which this dependency-free bundle cannot do and should not
       pretend to. Every proposed control code is resolved against the
       real register here before it is shown; a code the model invented
       simply doesn't render. Nothing is linked until the practitioner
       clicks Link on a specific row. */
    aiInterpretEvidence: async function () {
      if (!(S.entitlements && S.entitlements.ai)) return;
      var entitled = entitledFrameworks();
      if (!entitled.length) { toast('Enable a framework first — there are no controls to map evidence onto.'); return; }
      var activeFw = (window._soaFw && entitled.indexOf(window._soaFw) > -1) ? window._soaFw : entitled[0];
      var vals = await showModal({
        title: 'Interpret evidence with AI',
        message: 'Paste the text of the artefact — a supplier assurance report, penetration test summary, access review sign-off, backup job report. PDFs cannot be read here: copy the relevant text out of it. The text is sent to this tenant\'s own Azure OpenAI resource and nothing is written to any register without your confirmation.',
        fields: [
          { id: 'name', label: 'Artefact name', value: '', placeholder: 'e.g. Northwind Cloud Hosting — SOC 2 Type II FY26' },
          { id: 'text', label: 'Artefact text', type: 'textarea', value: '', placeholder: 'Paste the report text or the relevant extract…' }
        ],
        confirmText: 'Interpret',
        validate: function (v) { return (v.text && v.text.trim().length >= 80) ? null : 'Paste at least a paragraph — there is nothing to interpret in a line or two.'; }
      });
      if (!vals) return;
      busy(true);
      try {
        var bag = aiBuildDataBag();
        var controlList = aiBuildControlListDataBag(activeFw);
        var res = await window.CheckpointAI.chat(
          'evidenceInterpret',
          window.CheckpointAI.buildEvidenceInterpretPrompt(vals.name || 'Untitled artefact', vals.text),
          { controlList: controlList, soaSummary: bag.soaSummary }
        );
        var parsed = window.CheckpointAI.parseEvidenceInterpretation(res.text);
        /* Resolve every proposed code against the REAL register — the
           model's output is a suggestion about this tenant's controls,
           never a source of truth about which controls exist. */
        var rows = frameworkAppRows(activeFw);
        var byCode = {};
        rows.forEach(function (c) { byCode[c.id] = c; });
        _evidenceInterpretation = {
          fw: activeFw,
          name: vals.name || 'Untitled artefact',
          summary: parsed.summary,
          period: parsed.period,
          gaps: parsed.gaps,
          mappings: parsed.mappings.filter(function (m) { return byCode[m.code]; }).map(function (m) {
            return { code: m.code, why: m.why, title: byCode[m.code].t, st: byCode[m.code].st, hasEvidence: !!byCode[m.code].evidenceUrl };
          }),
          droppedCount: parsed.mappings.filter(function (m) { return !byCode[m.code]; }).length
        };
        audit('Evidence interpreted with AI', 'Document', _evidenceInterpretation.name, '', _evidenceInterpretation.mappings.length + ' control(s) proposed for ' + fwName(activeFw));
      } catch (e) {
        var friendly = e.code === 'not_configured' ? 'AI is not configured for this tenant.'
          : e.code === 'auth_error' ? 'Not authorised — check the Cognitive Services OpenAI User role assignment.'
          : e.code === 'rate_limited' ? 'The AI endpoint is rate-limiting requests — try again shortly.'
          : ('Could not interpret this evidence: ' + (e.message || e));
        toastError(esc(friendly));
      }
      busy(false);
      renderEvidenceInterpretation();
    },

    /* Links the interpreted artefact to one proposed control. The URL is
       asked for here rather than assumed, because the text was pasted —
       the app never saw the file, so it cannot know where it lives. */
    aiLinkInterpreted: async function (code) {
      if (!_evidenceInterpretation) return;
      var m = _evidenceInterpretation.mappings.find(function (x) { return x.code === code; });
      if (!m) return;
      var c = S.controls.find(function (x) { return x.fw === _evidenceInterpretation.fw && x.id === code; });
      if (!c) return;
      var vals = await showModal({
        title: 'Link ' + code + ' to this evidence',
        message: m.title + '\n\nWhere is "' + _evidenceInterpretation.name + '" stored? Paste its SharePoint/OneDrive link. Upload it to the Documents library first if it is not already there.',
        fields: [{ id: 'url', label: 'Evidence URL', value: c.evidenceUrl || '', placeholder: 'https://…' }],
        confirmText: 'Link evidence',
        validate: function (v) { return isSafeUrl(v.url) ? null : 'Evidence link must start with http:// or https://'; }
      });
      if (!vals) return;
      var prevUrl = c.evidenceUrl;
      c.evidenceUrl = vals.url;
      if (c.verifiedBy === AUTO_EVIDENCE_TAG) c.verifiedBy = '';
      var bumped = false;
      if (c.st === 'Not started') { c.st = 'In progress'; bumped = true; }
      try { await Store.updateControl(c); } catch (e) { warn(e); }
      audit('Evidence link changed', 'Control', c.fw + '|' + c.id, prevUrl || '(none)', vals.url + ' (AI-interpreted artefact: ' + _evidenceInterpretation.name + ', practitioner-confirmed)');
      if (bumped) audit('Control status changed', 'Control', c.fw + '|' + c.id, 'Not started', 'In progress (evidence linked)');
      m.hasEvidence = true; m.st = c.st;
      log('<b>' + esc(c.id) + '</b> linked to evidence from <b>' + esc(_evidenceInterpretation.name) + '</b>' + (bumped ? ', moved to In progress' : '') + '.');
      toast('<b>' + esc(code) + '</b> linked' + (bumped ? ' · moved to In progress' : ''));
      renderEvidenceInterpretation(); renderSoa(); renderDash();
      await offerCrossFrameworkPropagation(c);
    },

    aiClearInterpretation: function () {
      _evidenceInterpretation = null;
      renderEvidenceInterpretation();
    },

    openCopilot: function () {
      if (!(S.entitlements && S.entitlements.ai)) return; /* nav item is hidden too; defensive only */
      renderCopilotDrawer();
      openDrawerUi('Compliance Copilot');
    },

    copilotAskStarter: function (q) {
      var input = document.getElementById('copilotInput');
      if (input) input.value = q;
      App.copilotSend();
    },

    copilotSend: async function () {
      var input = document.getElementById('copilotInput');
      var text = (input.value || '').trim();
      if (!text) return;
      var cfg = aiGetConfig();
      if (!(cfg.enabled && cfg.endpoint && cfg.deployment)) { toast('AI assistant not configured — see AI-SETUP.md.'); return; }
      input.value = '';
      _copilotHistory.push({ role: 'user', text: text });
      renderCopilotMessages();
      if (Store.kind === 'demo') {
        _copilotHistory.push({ role: 'ai', text: 'The Compliance Copilot isn\'t available in demo mode — there\'s no real Azure OpenAI resource to reach. This previews the panel\'s layout only.' });
        renderCopilotMessages();
        return;
      }
      var sendBtn = document.getElementById('copilotSendBtn');
      if (sendBtn) { sendBtn.disabled = true; sendBtn.textContent = 'Thinking…'; }
      try {
        var res = await window.CheckpointAI.chat('chat', text, aiBuildDataBag());
        _copilotHistory.push({ role: 'ai', text: res.text });
      } catch (e) {
        var friendly = e.code === 'not_configured' ? 'AI is not configured — set it up from the AI assistant view.'
          : e.code === 'auth_error' ? 'Not authorised — check the Cognitive Services OpenAI User role assignment (see AI-SETUP.md).'
          : e.code === 'not_found' ? 'Endpoint or deployment name not found — double-check both.'
          : e.code === 'rate_limited' ? 'The AI endpoint is rate-limiting requests — wait a moment and try again.'
          : ('Could not get a response: ' + (e.message || e));
        _copilotHistory.push({ role: 'ai', text: friendly });
      }
      if (sendBtn) { sendBtn.disabled = false; sendBtn.textContent = 'Send'; }
      renderCopilotMessages();
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
      var entitledNow = entitledFrameworks();
      var activeFw = (window._soaFw && entitledNow.indexOf(window._soaFw) > -1) ? window._soaFw : (entitledNow[0] || 'iso27001');
      /* Re-check at the point a framework-scoped report is actually
         generated, the same defense-in-depth generateAuditorPack()
         already applies before it hands a document to a third party —
         window._soaFw tracking a framework this tenant no longer holds
         (a licence change with no intervening renderSoa() call) must
         never produce a report full of a framework's own data that
         isn't entitled. A frameworkAgnostic report (risk register) has
         no single framework to check against, so this only applies to
         the rest. */
      var builder = REPORT_BUILDERS[type];
      if (!builder) return;
      var parts = builder(activeFw, fwName(activeFw));
      if (!parts) return;
      if (!parts.frameworkAgnostic && (!S.entitlements || !S.entitlements[activeFw])) {
        toast('That framework isn\'t currently entitled on this tenant.');
        return;
      }
      var fwLabel = fwName(activeFw);

      var today = new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' });
      var clientLabel = clientDisplayLabel();
      var practitioner = (typeof Graph !== 'undefined' && Graph.getAccount() && Graph.getAccount().name) || (Store.kind === 'demo' ? 'Demo user' : 'Practitioner');
      var version = peekReportVersion(type);

      var spec = {
        type: type,
        reportTitle: parts.title,
        framework: parts.frameworkAgnostic ? '' : fwLabel,
        client: { name: clientLabel, logoUrl: (S.settings && S.settings.clientLogoUrl) || null, brandColor: clientBrandColor() || null },
        classification: (S.settings && S.settings.reportClassification) || 'Commercial in Confidence',
        footerText: (S.settings && (S.settings.reportFooterText || '').trim()) || '',
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
      await commitReportVersion(type, version);
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
      applyClientIdentity();
      toast('Client logo saved — it appears in the top bar, on report covers and in every printed page header.');
      input.value = '';
      busy(false);
      renderFrameworksAdmin();
    },

    clearClientLogo: async function () {
      S.settings.clientLogoUrl = '';
      try { await Store.setSetting('clientLogoUrl', ''); } catch (e) { warn(e); }
      audit('Client logo cleared', 'Setting', 'clientLogoUrl', '(logo set)', '(cleared)');
      applyClientIdentity();
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

    setClientDisplayName: async function () {
      var input = document.getElementById('clientDisplayNameInput');
      var value = ((input && input.value) || '').trim();
      S.settings.clientDisplayName = value;
      try { await Store.setSetting('clientDisplayName', value); } catch (e) { warn(e); }
      audit('Client display name changed', 'Setting', 'clientDisplayName', '', value || '(cleared — tenant name)');
      applyClientIdentity();
      toast(value ? 'Client shown as <b>' + esc(value) + '</b> across the console and reports' : 'Display name cleared — using the tenant name');
      renderFrameworksAdmin();
    },

    setClientBrandColor: async function () {
      var input = document.getElementById('clientBrandColorInput');
      var value = ((input && input.value) || '').trim();
      if (!/^#[0-9a-fA-F]{6}$/.test(value)) { toast('Pick a colour first'); return; }
      S.settings.clientBrandColor = value;
      try { await Store.setSetting('clientBrandColor', value); } catch (e) { warn(e); }
      audit('Client brand colour changed', 'Setting', 'clientBrandColor', '', value);
      toast('Report accent set to <b style="color:' + value + '">' + esc(value) + '</b>');
      renderFrameworksAdmin();
    },

    clearClientBrandColor: async function () {
      S.settings.clientBrandColor = '';
      try { await Store.setSetting('clientBrandColor', ''); } catch (e) { warn(e); }
      audit('Client brand colour cleared', 'Setting', 'clientBrandColor', '(set)', '(Checkpoint gold)');
      toast('Report accent reset to Checkpoint gold');
      renderFrameworksAdmin();
    },

    setReportFooterText: async function () {
      var input = document.getElementById('reportFooterTextInput');
      var value = ((input && input.value) || '').trim();
      S.settings.reportFooterText = value;
      try { await Store.setSetting('reportFooterText', value); } catch (e) { warn(e); }
      audit('Report footer text changed', 'Setting', 'reportFooterText', '', value || '(cleared — classification)');
      toast(value ? 'Footer text saved — it appears on every printed report page' : 'Footer cleared — reports repeat the classification marking there');
      renderFrameworksAdmin();
    },

    exportCsv: async function (key) {
      var reg = EXPORT_REGISTERS.find(function (r) { return r.key === key; });
      if (!reg) return;
      await refreshDocsForExport(key);
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
        await refreshDocsForExport('documents');
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
        toastError('ZIP assembly failed — downloading each register separately instead.');
        for (var i = 0; i < EXPORT_REGISTERS.length; i++) { App.exportCsv(EXPORT_REGISTERS[i].key); await new Promise(function (r) { setTimeout(r, 300); }); }
      }
    }
  };

  /* ================= boot ================= */
  /* Applies (or removes) the light-theme attribute plus its one
     non-CSS-token side effect (the browser-chrome theme-color meta
     tag) — shared by the boot-time restore above and
     App.toggleLightTheme below, so there's exactly one place that
     knows what "turning the theme on" actually touches. */
  function applyThemeAttribute(isLight) {
    var root = document.documentElement;
    if (isLight) root.setAttribute('data-theme', 'light'); else root.removeAttribute('data-theme');
    var themeColorMeta = document.querySelector('meta[name="theme-color"]');
    if (themeColorMeta) themeColorMeta.setAttribute('content', isLight ? '#FAF7F1' : '#0B0B0C');
  }

  function bootUi(modeLabel, clientLabel) {
    /* Restore the persisted theme before anything else paints — the
       earliest point this can happen, since S.settings.lightTheme only
       exists once Store.load() (an async SharePoint/localStorage read)
       has resolved; there's no synchronous "before first paint" hook
       available for a value that can live in a remote Settings list. */
    applyThemeAttribute((S.settings && S.settings.lightTheme) === 'true');
    document.getElementById('gate').style.display = 'none';
    document.getElementById('wizard').style.display = 'none';
    document.getElementById('notActivated').style.display = 'none';
    document.getElementById('appShell').style.display = 'grid';
    document.getElementById('modeChip').textContent = Store.kind === 'demo' ? 'Demo' : 'Live';
    document.getElementById('modeChip').className = 'chip ' + (Store.kind === 'demo' ? 'st-Intreatment' : 'st-Implemented');
    applyClientIdentity(clientLabel);
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
        secureScore: { key: 'secureScore', label: 'Microsoft Secure Score', licence: 'Any Microsoft 365 plan with Secure Score', available: true, status: 'available', note: '' },
        sensitivityLabels: { key: 'sensitivityLabels', label: 'Microsoft Purview sensitivity labels', licence: 'Microsoft Purview Information Protection (Microsoft 365 E5, or E3 + a compliance add-on)', available: true, status: 'available', note: '' },
        accessReviews: { key: 'accessReviews', label: 'Microsoft Entra Access Reviews', licence: 'Microsoft Entra ID Governance (Entra ID P2, or the Governance add-on)', available: true, status: 'available', note: '' },
        sharePointSettings: { key: 'sharePointSettings', label: 'SharePoint tenant sharing settings', licence: 'The signed-in user must hold the SharePoint Administrator (or Global Administrator) role', available: true, status: 'available', note: '' }
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
     not just which framework toggles are on. There are TWO independent
     stores for the verified raw file, not one:
       - localStorage, THIS BROWSER only, keyed by tenant
         (activationStorageKey()) — written immediately on every
         successful verify, before any network call. This is what makes
         provisioning (and recovery from a broken tenant cache) possible
         using nothing but in-memory/browser state — see
         resolveBestActivation() below.
       - the tenant's own "Checkpoint Settings" SharePoint list
         (S.settings.entitlementFile) — shared by every colleague/browser
         signed into this tenant, written once SharePoint access exists.
     Neither is "the" source of truth by itself — the Ed25519 signature
     is. Every load re-verifies whichever candidate(s) exist and, if more
     than one verifies, prefers the one with the latest issuedAt
     (reconcileActivationSources() in lib.js), then mirrors that winner
     into whichever store was stale or missing (mirrorActivationStores()
     below). A stored "isActivated"/verified flag is never trusted on its
     own past the moment it was computed — every read re-verifies the
     raw bytes.
       - Provisioning: the onboarding wizard's Activation step (before
         site selection) must verify one before site selection/
         provisioning can proceed; SpStore.ensureLists() independently
         refuses to create a single new SharePoint list unless
         window.CHECKPOINT_ACTIVATION.verified is set (see store.js) —
         belt and braces, since the wizard is only one path to
         `Store.load()` (a returning tenant's self-heal is the other).
         That flag is satisfied by EITHER store verifying — a brand-new
         tenant's Settings list obviously can't exist yet, so this never
         depends on SharePoint state existing first.
       - Operation: re-verified on every load (reconcileEntitlementsOnLoad(),
         called from startLive()) against whichever of localStorage/the
         cached Settings-list raw file exist — the stores are a CACHE,
         the Ed25519 signature is the truth.
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
     App.toggleEntitlement still exists but only runs in demo mode.
     The Licence panel (Frameworks view — see renderLicensePanel())
     shows exactly what's held right now: type,
     modules, issuedAt, expiry, bound tenant, verification status, and
     which store(s) it's actually sitting in — the tool that would have
     caught a silently-dropped write in seconds instead of on the next
     confused reload. */

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
    /* An empty acceptTenantIds means Graph.tenantInfo() couldn't read
       this tenant's own identity just now (throttled, transient network
       error, Directory.Read.All not yet consented) — NOT that this file
       is actually for a different tenant. evaluateEntitlement() would
       report 'mismatch' either way (an empty list can never match), but
       telling a practitioner "issued for a different tenant" in that
       case is actively misleading — it sends them to re-request a file
       that was never the problem. Distinguish the two explicitly. */
    var ids = Array.isArray(acceptTenantIds) ? acceptTenantIds : (acceptTenantIds ? [acceptTenantIds] : []);
    if (!ids.filter(Boolean).length) {
      return {
        ok: false,
        reason: 'Could not confirm this tenant\'s identity via Microsoft Graph just now — this may be a transient error, or Directory.Read.All hasn\'t finished consenting. Try again in a moment before assuming this file is wrong.',
        tenantLookupFailed: true
      };
    }
    var today = new Date().toISOString().slice(0, 10);
    var evalResult = window.CheckpointLib.evaluateEntitlement(parsed.payload, ids, today);
    if (evalResult.status === 'mismatch') {
      return { ok: false, reason: 'This activation file is issued for a different tenant.' };
    }
    return { ok: true, raw: rawText, evalResult: evalResult };
  }

  /* ---- localStorage side of the two-store design (see the comment
     block above) — this browser's own durable cache of the last
     verified activation for whichever tenant is currently signed in.
     Keyed the same way applyStoredSitePreference()'s cpSite: key is
     (tenantStorageKey(), defined further down with the site-preference
     code) so multiple tenants signed into the same browser never
     collide. Every read/write is wrapped — private browsing or a full
     quota can make localStorage throw or silently no-op; callers treat
     a failed write as a real failure (see LICENSE_PERSIST_WARNING
     below), never as "fine, it just didn't happen." */
  function activationStorageKey() {
    return 'cpActivation:v1:' + tenantStorageKey();
  }
  function readLocalActivation() {
    try { return localStorage.getItem(activationStorageKey()); } catch (e) { return null; }
  }
  function writeLocalActivation(rawText) {
    try { localStorage.setItem(activationStorageKey(), rawText); return true; }
    catch (e) { console.error(e); return false; }
  }
  function removeLocalActivation() {
    try { localStorage.removeItem(activationStorageKey()); return true; }
    catch (e) { console.error(e); return false; }
  }

  /* The Paddle subscription id(s) backing a self-serve activation —
     PLURAL: a tenant can accumulate more than one over time. /start's
     checkout is an anonymous Paddle overlay with no way to attach a
     purchase to an existing subscription, so a customer buying a second
     module in a later, separate checkout session gets a brand new
     subscription id, not a line item added to the first. Every refresh
     sends the FULL accumulated list to the provisioning Lambda, which
     resolves each one against Paddle and returns ONE signed file
     covering the union of everything still active/trialing — see
     lambda/provision.js's mergeResolvedSubscriptions(). Before this,
     only the single most-recently-seen subscription id was ever tracked,
     so a second purchase could silently drop the first module's
     entitlement (or vice versa, depending on refresh timing) the next
     time the app refreshed.
     Kept in localStorage (per tenant) as the always-available bridge,
     and mirrored into the Settings list (paddleSubscriptionIds) once
     that exists so a second device can refresh too — comma-joined, same
     convention as every other multi-value Settings field in this app
     (e.g. an activation payload's Modules column). readPaddleSubs()
     prefers the durable Settings copy, falls back to this browser's
     local one, and also reads the old singular paddleSubscriptionId
     setting a tenant activated before this change may still have. */
  function paddleSubStorageKey() { return 'cpPaddleSub:v1:' + tenantStorageKey(); }
  function parsePaddleSubs(raw) { return String(raw || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean); }
  function addPaddleSubLocal(id) {
    if (!id) return;
    try {
      var ids = parsePaddleSubs(localStorage.getItem(paddleSubStorageKey()));
      if (ids.indexOf(id) === -1) ids.push(id);
      localStorage.setItem(paddleSubStorageKey(), ids.join(','));
    } catch (e) { /* storage disabled */ }
  }
  function readPaddleSubs() {
    var fromSettings = S && S.settings && (S.settings.paddleSubscriptionIds || S.settings.paddleSubscriptionId);
    if (fromSettings) return parsePaddleSubs(fromSettings);
    try { return parsePaddleSubs(localStorage.getItem(paddleSubStorageKey())); } catch (e) { return []; }
  }

  /* Loud-failure state for Finding 5 (audit brief): a failed persistence
     write is never just a toast that's gone in 3.4 seconds. This flag
     stays set — surfaced by renderLicensePanel() as a standing banner,
     not just the one-off toast — until either a later write succeeds or
     the practitioner manually retries from the Licence panel. Cleared
     proactively whenever a write to that same store succeeds. */
  /* A bare Graph error message ("Invalid request") is often too
     generic to diagnose on its own — code and requestId (see graph.js's
     g()) are the two things actually worth reporting back to Microsoft
     support or digging into further, so surface them here rather than
     just the top-level message every prior version of this banner
     showed. */
  function describeGraphError(e) {
    var parts = [(e && e.message) || String(e)];
    if (e && e.code) parts.push('code: ' + e.code);
    if (e && e.requestId) parts.push('request-id: ' + e.requestId);
    if (e && e.rawBody) parts.push('raw: ' + e.rawBody);
    return parts.join(' — ');
  }

  var LICENSE_PERSIST_WARNING = null; /* null, or { store: 'local'|'tenant', message } */
  function reportPersistenceFailure(store, message) {
    LICENSE_PERSIST_WARNING = { store: store, message: message };
    toastError('<b>Could not save your licence' + (store === 'local' ? ' to this browser' : ' to this tenant\'s Settings list') + ':</b> ' + esc(message) + ' — it is NOT durably saved' + (store === 'tenant' ? ' for your colleagues' : ' in this browser') + ' yet. See the Licence panel.');
    renderLicensePanel();
  }
  function clearPersistenceFailure(store) {
    if (LICENSE_PERSIST_WARNING && LICENSE_PERSIST_WARNING.store === store) LICENSE_PERSIST_WARNING = null;
  }

  /* Verifies every available activation candidate (this browser's
     localStorage, and — if passed — the tenant's cached Settings-list
     raw text) and picks the one that should govern this session, via
     lib.js's reconcileActivationSources() (pure: only compares issuedAt
     among candidates that already verified). This is the single place
     "what activation does this session actually have" gets decided —
     used both before Store.load() (authorizing provisioning with only
     in-memory/localStorage state, no SharePoint dependency) and after
     (the definitive post-load check). Never trusts either store's mere
     presence, only a candidate whose signature+tenant+expiry re-verify. */
  async function resolveBestActivation(acceptTenantIds, tenantRaw) {
    var localRaw = readLocalActivation();
    var candidates = [];
    if (localRaw) candidates.push({ source: 'local', raw: localRaw });
    if (tenantRaw) candidates.push({ source: 'tenant', raw: tenantRaw });
    var checked = [];
    for (var i = 0; i < candidates.length; i++) {
      var result = await verifyActivationRaw(candidates[i].raw, acceptTenantIds);
      checked.push({ source: candidates[i].source, raw: candidates[i].raw, ok: result.ok, evalResult: result.evalResult, reason: result.reason });
    }
    var reconciled = window.CheckpointLib.reconcileActivationSources(checked);
    return { winner: reconciled.winner, staleSources: reconciled.staleSources, checked: checked, hadAnyCandidate: candidates.length > 0 };
  }

  /* Brings BOTH stores into line with the winning raw text whenever
     either one currently holds something different — i.e. finding #2's
     fix: a locally-verified activation the tenant's Settings list
     doesn't have yet (never existed, or a prior write silently failed)
     gets pushed there the moment SharePoint access exists; a
     tenant-list activation newer than this browser's cache gets pulled
     down into localStorage; and a CORRUPTED/invalid copy sitting in
     either store (which resolveBestActivation()'s reconciliation never
     marks "stale" — that label only covers candidates that themselves
     verified) gets overwritten too, since any store whose raw text
     simply isn't the winner's needs fixing regardless of why it
     differs. Every write is loud on failure
     (reportPersistenceFailure(), Finding 5) — never a silent catch. A
     no-op, safely, on the tenant leg when Store/S isn't live yet. */
  async function mirrorActivationStores(resolved) {
    if (!resolved || !resolved.winner) return;
    var winner = resolved.winner;
    if (readLocalActivation() !== winner.raw) {
      if (writeLocalActivation(winner.raw)) clearPersistenceFailure('local');
      else reportPersistenceFailure('local', 'This browser\'s storage could not be written (private browsing, or storage is full).');
    } else {
      clearPersistenceFailure('local');
    }
    var tenantHasStore = !!(Store && Store.kind === 'sharepoint' && S);
    if (tenantHasStore) {
      if ((S.settings && S.settings.entitlementFile) !== winner.raw) {
        try {
          await Store.setSetting('entitlementFile', winner.raw);
          S.settings.entitlementFile = winner.raw;
          clearPersistenceFailure('tenant');
        } catch (e) {
          reportPersistenceFailure('tenant', describeGraphError(e));
        }
      } else {
        clearPersistenceFailure('tenant');
      }
    }
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
        if (fw === 'ai' && shouldBeOn) { try { await ensureAiSelfSystemSeeded(); } catch (e) { warn(e); } }
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
        var content;
        try {
          content = await window.CheckpointLib.decryptPack(crypto.subtle, key, pack);
        } catch (decryptErr) {
          /* The manifest hash check immediately above already passed, so
             the pack file itself is intact and is exactly what was
             published — which leaves the KEY as the only thing that can
             make AES-GCM's authentication tag fail here. Worth saying
             plainly: WebCrypto's own message for this is "The operation
             failed for an operation-specific reason", which tells a
             practitioner (or whoever they forward it to) nothing at all,
             and the actual cause is a specific, fixable deployment
             mismatch — the module keys used to ENCRYPT the packs at
             build time (the MODULE_KEYS_JSON repo secret) have to be the
             same set embedded into this tenant's activation file when it
             was signed (the provisioning Lambda's own MODULE_KEYS_JSON
             env var, or tools/module-keys.json for a hand-issued one).
             Rotate one without the other and every premium module fails
             exactly here, on a pack that is otherwise perfectly valid. */
          throw new Error('this activation\'s content key does not match the published pack — the module keys used to build the packs and the ones embedded in this activation are from different sets. Re-issue the activation, or rebuild the packs, so both use the same module keys.');
        }
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
        if (moduleId === 'is18' && content.extra && content.extra.checkIs18) {
          Object.assign(window.CHECK_IS18, content.extra.checkIs18);
        }
        if (moduleId === 'rffr' && content.extra && content.extra.checkRffr) {
          Object.assign(window.CHECK_RFFR, content.extra.checkRffr);
        }
        if (moduleId === 'iso42001' && content.extra && content.extra.checkIso42001) {
          Object.assign(window.CHECK_ISO42001, content.extra.checkIso42001);
        }
        if (moduleId === 'iso27701' && content.extra && content.extra.checkIso27701) {
          Object.assign(window.CHECK_ISO27701, content.extra.checkIso27701);
        }
        if (moduleId === 'soc2' && content.extra && content.extra.checkSoc2) {
          Object.assign(window.CHECK_SOC2, content.extra.checkSoc2);
        }
        if (moduleId === 'nistcsf' && content.extra && content.extra.checkNistCsf) {
          Object.assign(window.CHECK_NISTCSF, content.extra.checkNistCsf);
        }
        PACKS_MERGED[moduleId] = true;
      } catch (e) {
        warn('mergeLicensedPacks: "' + moduleId + '" unavailable — treating it as unlicensed for this load: ' + (e.message || e));
      }
    }
  }

  /* Keeps a self-serve customer's entitlement current with their Paddle
     subscription. Neither the provisioning Lambda nor the webhook can
     push into the customer's tenant, so the customer's app pulls instead:
     given the stored Paddle subscription id, it re-calls the provisioning
     Lambda, which returns a freshly-signed file reflecting Paddle's
     current truth (trialing→7-day demo, active→12-month client, cancelled
     →the Lambda 400s and we keep the existing file to lapse naturally).
     Strictly best-effort: any failure — no subscription id, endpoint not
     configured, network down, Paddle says cancelled, signature/tenant
     mismatch — is swallowed, leaving whatever's already stored so the
     normal resolve/grace/expiry path still runs. It can only ever REPLACE
     the stored file with a newer validly-signed one for THIS tenant;
     it can never lock a working tenant out. */
  async function refreshSelfServeEntitlementOnLoad(acceptTenantIds) {
    if (!CONFIG.selfServeActivateUrl) return;
    var subIds = readPaddleSubs();
    if (!subIds.length) return;
    var tenantId = (acceptTenantIds && acceptTenantIds[0]) || null;
    if (!tenantId) return;
    try {
      var res = await fetch(CONFIG.selfServeActivateUrl, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscriptionIds: subIds, tenantId: tenantId })
      });
      /* Only a total failure (every known subscription cancelled/paused/
         deleted) reaches a non-OK response — the Lambda resolves each id
         independently and merges whatever's still grantable, so one
         lapsed subscription among several others doesn't 400 the whole
         refresh; it's just excluded from the merged frameworks, same as
         it letting a solo subscription lapse naturally always did. */
      if (!res.ok) return;
      var data = await res.json().catch(function () { return {}; });
      if (!data.activationFile) return;
      var check = await verifyActivationRaw(data.activationFile, acceptTenantIds);
      if (!check.ok) return; // never overwrite a good file with one that doesn't verify
      var mergedSubIds = (data.subscriptionIds && data.subscriptionIds.length) ? data.subscriptionIds : subIds;
      var mergedSubIdsJoined = mergedSubIds.join(',');
      var currentSubIdsJoined = (S.settings && (S.settings.paddleSubscriptionIds || S.settings.paddleSubscriptionId)) || '';
      var fileUnchanged = data.activationFile === (S.settings && S.settings.entitlementFile);
      var subListUnchanged = mergedSubIdsJoined === currentSubIdsJoined;
      if (fileUnchanged && subListUnchanged) return;
      if (!fileUnchanged) {
        writeLocalActivation(data.activationFile);
        try { await Store.setSetting('entitlementFile', data.activationFile); S.settings.entitlementFile = data.activationFile; } catch (e) { /* Settings write failed — local copy still updated, resolve picks it up */ }
      }
      if (!subListUnchanged) {
        mergedSubIds.forEach(addPaddleSubLocal);
        try { await Store.setSetting('paddleSubscriptionIds', mergedSubIdsJoined); S.settings.paddleSubscriptionIds = mergedSubIdsJoined; } catch (e) { /* non-fatal */ }
      }
      if (!fileUnchanged) audit('Entitlement refreshed', 'Activation', 'file', '', 'Re-pulled from ' + mergedSubIds.length + ' self-serve subscription(s) — reflects the current Paddle subscription state.');
    } catch (e) { /* network/parse — keep existing file, non-fatal */ }
  }

  /* Runs once per live-tenant load, right after Store.load() has
     definitely succeeded (so S.settings.entitlementFile reflects
     reality, if it's ever been written). No-op in demo mode. Returns
     true if the app should proceed to bootUi(), false if startLive()
     should show the #notActivated screen instead.

     Resolves BOTH stores — this browser's localStorage and the
     tenant's cached Settings-list raw file — via resolveBestActivation(),
     not just the tenant list alone: this is what fixes the original
     bug where a tenant's cached file could be missing/stale (a prior
     write silently failed, or the Settings list itself needed
     recreating) even though a colleague/this same browser had already
     verified a good one. Mirrors the winner into whichever store was
     stale (mirrorActivationStores()) so both converge instead of
     drifting apart. Every distinct outcome is audit-logged
     (missing/rejected/expired/synced) — 'valid'/'grace' with nothing to
     reconcile are not, to avoid an audit-log entry on every single
     ordinary page load. */
  async function reconcileEntitlementsOnLoad(acceptTenantIds) {
    ENTITLEMENT_STATE = null;
    if (Store.kind === 'demo') { recomputeReadOnly(); return true; }
    /* Self-serve customers: re-pull a current signed file from the
       provisioning Lambda before resolving, so a trial that converted to
       paid (or was cancelled) is reflected. Best-effort and non-blocking
       for access — on any failure we simply keep whatever's already
       stored and let the normal resolve/grace/expiry logic below run. */
    await refreshSelfServeEntitlementOnLoad(acceptTenantIds);
    var tenantRaw = S.settings && S.settings.entitlementFile;
    var resolved = await resolveBestActivation(acceptTenantIds, tenantRaw);
    if (!resolved.winner) {
      if (resolved.hadAnyCandidate) {
        var worst = resolved.checked[0];
        audit('Activation rejected', 'Activation', 'file', '', worst.reason);
      } else {
        audit('Activation missing', 'Activation', 'file', '', 'No activation file has ever been applied for this tenant, in this tenant\'s Settings list or this browser.');
      }
      recomputeReadOnly();
      renderLicensePanel();
      return false;
    }
    var wasAlreadyInTenantList = tenantRaw && tenantRaw === resolved.winner.raw;
    await mirrorActivationStores(resolved);
    if (!wasAlreadyInTenantList && resolved.winner.source === 'local') {
      audit('Activation synced', 'Activation', 'file', '', 'Restored from this browser\'s local storage into the tenant\'s Settings list — the tenant\'s own copy was missing or out of date.');
    }
    var result = resolved.winner;
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
    renderLicensePanel();
    return true;
  }

  /* The Licence panel — Frameworks & Settings view (#licensePanel)
     calls this with its own container id (a separate, internal-only
     console has its own equivalent panel/container, in its own
     bundle). Shows exactly what the app currently holds
     for THIS tenant: type, modules, issuedAt, expiry, the tenant it's
     bound to, verification status, and — the thing that would have
     caught the original silently-forgotten-activation bug in seconds —
     WHERE it is actually stored right now (local browser / tenant
     Settings list / both), read fresh from both stores every render,
     never from a cached flag. A standing warning banner
     (LICENSE_PERSIST_WARNING) stays visible here until a write actually
     succeeds — never just a toast that's faded by the time anyone looks
     back at this panel. */
  function renderLicensePanel(elId) {
    var el = document.getElementById(elId || 'licensePanel');
    if (!el) return;
    if (Store.kind === 'demo') {
      el.innerHTML = '<p style="color:var(--paper-faint);font-size:12.5px">Demo mode uses the free toggle above — activation files apply to a real tenant only.</p>';
      return;
    }
    var localRaw = readLocalActivation();
    var tenantRaw = (S && S.settings && S.settings.entitlementFile) || '';
    var inLocal = !!localRaw, inTenant = !!tenantRaw, same = inLocal && inTenant && localRaw === tenantRaw;
    var where = !inLocal && !inTenant ? 'Not stored anywhere yet'
      : (inLocal && inTenant) ? (same ? 'This browser + tenant Settings list (in sync)' : 'This browser AND tenant Settings list — <b style="color:var(--warn)">they differ</b>, will reconcile on next successful load')
      : inLocal ? 'This browser only — <b style="color:var(--warn)">not yet saved to the tenant</b>, colleagues won\'t see it until it syncs'
      : 'Tenant Settings list only — not yet cached in this browser';
    var warnBanner = '';
    if (LICENSE_PERSIST_WARNING) {
      warnBanner = '<div class="appetite-banner" style="display:block;margin-bottom:10px"><b>Persistence problem:</b> could not save to ' +
        (LICENSE_PERSIST_WARNING.store === 'local' ? 'this browser\'s storage' : 'the tenant\'s Settings list') + ' — ' + esc(LICENSE_PERSIST_WARNING.message) +
        '. <button class="btn ghost sm" data-action="App.retryLicensePersistence" style="margin-left:6px">Retry</button></div>';
    }
    if (!ENTITLEMENT_STATE) {
      el.innerHTML = warnBanner + '<p style="color:var(--paper-faint);font-size:12.5px">No activation currently held for this tenant — ISO 27001 is enabled as the included baseline. Stored: ' + where + '.</p>' +
        (inLocal || inTenant ? '<button class="btn ghost sm" data-action="App.removeLocalLicense" style="margin-top:8px">Remove licence from this browser</button>' : '');
      return;
    }
    var note = '';
    if (ENTITLEMENT_STATE.status === 'expired') {
      note = '<div class="appetite-banner" style="display:block;margin-top:10px"><b>Activation expired ' + fmtDate(ENTITLEMENT_STATE.expiry) + '</b> (grace period ended ' + fmtDate(ENTITLEMENT_STATE.graceUntil) + ') — Checkpoint is read-only until a renewed activation is applied. Every register, dashboard and report stays fully viewable and exportable; nothing can be added, edited or uploaded. Contact Compliance365 to renew.</div>';
    } else if (ENTITLEMENT_STATE.status === 'grace') {
      note = '<div class="appetite-banner" style="display:block;margin-top:10px"><b>Activation expired ' + fmtDate(ENTITLEMENT_STATE.expiry) + '</b> — in its grace period until <b>' + fmtDate(ENTITLEMENT_STATE.graceUntil) + '</b>. Checkpoint keeps working normally until then; renew before that date to avoid going read-only. Contact Compliance365 to renew.</div>';
    }
    el.innerHTML = warnBanner +
      '<div class="d-kv"><span>Type</span><b>' + esc(ENTITLEMENT_STATE.type) + '</b></div>' +
      '<div class="d-kv"><span>Tenant</span><b>' + esc(ENTITLEMENT_STATE.tenantId) + '</b></div>' +
      '<div class="d-kv"><span>Frameworks granted</span><b>' + esc((ENTITLEMENT_STATE.frameworks || []).map(fwName).join(', ') || '—') + '</b></div>' +
      '<div class="d-kv"><span>Issued</span><b>' + fmtDate(ENTITLEMENT_STATE.issuedAt) + '</b></div>' +
      '<div class="d-kv"><span>Expiry</span><b style="' + (ENTITLEMENT_STATE.status === 'valid' ? '' : 'color:var(--fail)') + '">' + fmtDate(ENTITLEMENT_STATE.expiry) + '</b></div>' +
      '<div class="d-kv"><span>Verification</span><b>' + esc(ENTITLEMENT_STATE.status) + '</b></div>' +
      '<div class="d-kv"><span>Stored</span><b>' + where + '</b></div>' +
      note +
      '<button class="btn ghost sm" data-action="App.removeLocalLicense" style="margin-top:10px">Remove licence from this browser</button>';
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

  /* Distinct from showNotActivatedScreen() above — see the HTML
     comment on #accessRevoked for why this needs its own screen rather
     than reusing that one (no "paste a new file" affordance; a valid
     file doesn't help here). */
  function showAccessRevokedScreen(reason) {
    document.getElementById('gate').style.display = 'none';
    document.getElementById('wizard').style.display = 'none';
    document.getElementById('appShell').style.display = 'none';
    document.getElementById('notActivated').style.display = 'none';
    var el = document.getElementById('accessRevoked');
    el.style.display = 'flex';
    var reasonEl = document.getElementById('accessRevokedReason');
    if (reasonEl) reasonEl.textContent = reason || 'Contact your Compliance365 representative if you believe this is a mistake.';
  }

  /* Owner-initiated revocation check — see lambda/provision.js's
     checkTenantBlocked() and the owner console's "Revoke access"
     action. Runs for EVERY live tenant on load, self-serve or
     manually-issued (manually-issued clients have no OTHER revocation
     path at all — their signed file is otherwise valid until its own
     expiry, full stop). Deliberately independent of the activation
     file's own signature/expiry validity: a revoked tenant might still
     be holding a perfectly-valid, unexpired file.
     Fails OPEN on any network/parse error or when self-serve isn't
     configured at all — a Lambda hiccup, or a deployment with no
     provisioning Lambda wired up, must never brick a paying customer's
     access. Only an explicit blocked:true response ever gates
     anything. */
  async function checkAccessRevoked(tenantId) {
    if (!CONFIG.selfServeActivateUrl || !tenantId) return { blocked: false };
    try {
      var res = await fetch(CONFIG.selfServeActivateUrl, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ checkRevocation: true, tenantId: tenantId })
      });
      if (!res.ok) return { blocked: false };
      var data = await res.json().catch(function () { return {}; });
      return { blocked: !!data.blocked, reason: data.reason || '' };
    } catch (e) { return { blocked: false }; }
  }

  async function startLive() {
    Store = window.SpStore;
    busy(true);
    var status = document.getElementById('busyMsg');
    var tenantInfo = await Graph.tenantInfo();

    /* Deliberately generic to the client — revocation.reason is the
       owner's own internal note (see the "Revoke access" modal's field
       label: "not shown to the client") and S/Store.appendAudit() both
       need Store.load() to have already run, which hasn't happened yet
       at this point, so this can't write to the tenant's own audit log
       either; the owner console's "Revoke access" action already
       records who/when/why on ITS OWN audit log. */
    var revocation = await checkAccessRevoked(tenantInfo && tenantInfo.id);
    if (revocation.blocked) {
      busy(false);
      showAccessRevokedScreen();
      return;
    }
    var acceptIds = tenantIdsFor(tenantInfo);

    /* Pre-load check — authorises ensureLists() to (re)create a MISSING
       list (first-ever provisioning, or self-heal for an existing
       tenant that's missing a list a newer Checkpoint version added).
       Resolves from BOTH stores (this browser's localStorage AND the
       tenant's cached Settings-list raw file, via
       readCachedActivation() in store.js), not the tenant list alone —
       this is the fix for the original bootstrap bug: even if the
       tenant's own cache is empty/unreadable/stale (a prior write
       silently failed, or the Settings list itself doesn't exist yet),
       a verified copy sitting in THIS browser's localStorage is enough
       to authorise provisioning on its own. The overwhelming common
       case is a no-op: every list already exists, so ensureLists()
       never even consults window.CHECKPOINT_ACTIVATION. */
    var cached = null;
    try { cached = await Store.readCachedActivation(); } catch (e) { cached = { raw: null }; }
    var preCheck = await resolveBestActivation(acceptIds, cached && cached.raw);
    window.CHECKPOINT_ACTIVATION = { verified: !!preCheck.winner };
    /* Must merge premium packs (if any) before Store.load()'s
       ensureLists()/reconcileControls() runs — see mergeLicensedPacks()'s
       doc comment. Best-effort: preCheck's evalResult is read-only and
       hasn't been re-verified post-load, but merging early is safe —
       reconcileEntitlementsOnLoad() re-verifies properly afterwards and
       any module this pre-check got wrong just stays/returns to its
       empty stub once that definitive check runs. */
    if (preCheck.winner) { try { await mergeLicensedPacks(preCheck.winner.evalResult); } catch (e) { warn(e); } }

    try {
      S = await Store.load(function (m) { if (status) status.textContent = m; });
    } catch (e) {
      /* Only reachable if ensureLists() refused to create a list this
         tenant is missing and window.CHECKPOINT_ACTIVATION.verified
         wasn't set above — i.e. neither this browser's localStorage nor
         the tenant's Settings list holds anything that currently
         verifies, so this tenant needs an activation file before
         Checkpoint can (re)provision. */
      busy(false);
      var preCheckReason = preCheck.checked.length ? preCheck.checked[0].reason : null;
      showNotActivatedScreen(preCheckReason || 'This tenant needs a Compliance365 activation file before Checkpoint can set up its records.');
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
     never succeeded — a first-time-provisioning block, or a returning
     tenant whose cached activation couldn't be read at the same moment
     a list needed self-healing) re-runs startLive() from scratch.

     CRITICAL ORDERING (this is the fix for the original self-defeating
     retry loop): the freshly-verified file is written to THIS BROWSER's
     localStorage immediately, before anything else — including before
     startLive() is (re-)called. Previously, the "Store/S don't exist
     yet" branch set window.CHECKPOINT_ACTIVATION.verified = true
     in-memory and called startLive() again, but startLive()'s own first
     act was to recompute that same flag from the (unchanged, still
     empty/invalid) tenant cache alone — silently clobbering the correct
     value and leaving the user stuck on this exact screen forever, no
     matter how many times they pasted a genuinely valid file. Now,
     startLive()'s pre-check (resolveBestActivation()) always consults
     localStorage too, so it finds the copy just written here and
     authorises provisioning correctly — no clobbering, no loop. */
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

    /* Same check startLive() does, and for the same reason it has to be
       repeated here rather than relying on that one call: this function
       is also reachable via the "Store && S already loaded" branch
       below, which calls reconcileEntitlementsOnLoad() -> bootUi()
       directly, entirely bypassing startLive() (and therefore its own
       revocation check) — e.g. a tenant that landed on #notActivated
       because its activation expired, but whose SharePoint lists were
       already loaded earlier this session. A revoked tenant pasting any
       validly-signed file here must not be able to boot straight past
       the block. */
    var revocation = await checkAccessRevoked(tenantInfo && tenantInfo.id);
    if (revocation.blocked) {
      busy(false);
      showAccessRevokedScreen();
      return;
    }

    var acceptIds = tenantIdsFor(tenantInfo);
    var result = await verifyActivationRaw(rawText, acceptIds);
    if (!result.ok) {
      busy(false);
      toast('<b>Activation rejected:</b> ' + esc(result.reason));
      if (Store && S) { try { audit('Activation rejected', 'Activation', 'file', '', result.reason); } catch (e) { /* ignore */ } }
      return;
    }

    /* Durable local persistence FIRST (req 1/3) — see the doc comment
       above for exactly why this ordering is what breaks the loop. */
    if (writeLocalActivation(result.raw)) clearPersistenceFailure('local');
    else reportPersistenceFailure('local', 'This browser\'s storage could not be written (private browsing, or storage is full).');

    if (Store && S) {
      try {
        await Store.setSetting('entitlementFile', rawText);
        S.settings.entitlementFile = rawText;
        clearPersistenceFailure('tenant');
      } catch (e) {
        reportPersistenceFailure('tenant', describeGraphError(e));
      }
      var proceed = await reconcileEntitlementsOnLoad(acceptIds);
      busy(false);
      if (proceed) { bootUi('Live — records stored as SharePoint lists in this tenant', S.client); }
      else { toast('Still not able to activate — see the message above.'); }
    } else {
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

    /* Self-serve activation is checked FIRST — before the onboarded
       short-circuit below — because a just-completed Paddle purchase must
       be honoured whether or not this tenant is already onboarded. An
       existing client buying an additional framework is, by definition,
       already onboarded; short-circuiting to the live app before applying
       their new entitlement would silently drop the purchase they just
       paid for. The check is gated on ?activate=1 (only ever set by
       /start's own successUrl) plus a transaction id, so it never fires
       for a normal returning sign-in. */
    if (CONFIG.selfServeActivateUrl && /[?&]activate=1\b/.test(location.search)) {
      var handled = await attemptSelfServeActivation();
      if (handled) return;
    }

    var probe;
    try { probe = await window.SpStore.probeOnboardingState(); } catch (e) { probe = { onboarded: false }; }
    if (probe.onboarded) { await startLive(); return; }

    busy(false);
    Wizard.startAt(3);
  }

  /* Confirms a just-completed Paddle checkout and auto-fills the
     activation step — see config.js's selfServeActivateUrl and
     lambda/provision.js. Deliberately thin: this function's only job is
     to get the SIGNED FILE from the Lambda and hand it to
     runWizardActivationCheck(), the exact same verify-and-apply path a
     manually pasted file goes through. The Lambda never receives a
     Graph token and never touches this tenant's SharePoint directly —
     it only talks to Paddle (to confirm what was actually purchased)
     and to OUR OWN tenant (to record the new client on the owner
     roster). Returns true if it left the UI in a state the caller
     should NOT also call Wizard.startAt(3) for (i.e. the wizard is
     already showing something — success or a clear error); false if
     nothing useful was found and the caller should fall back to the
     normal manual step 3 entirely (e.g. no transaction id in the URL
     at all, so this isn't a self-serve arrival). */
  async function attemptSelfServeActivation() {
    var txnId = new URLSearchParams(location.search).get('_ptxn');
    if (!txnId) { try { txnId = sessionStorage.getItem('c365_ptxn'); } catch (e) { /* storage disabled */ } }
    if (!txnId) return false;
    try { sessionStorage.removeItem('c365_ptxn'); } catch (e) { /* ignore */ }

    var tenantInfo;
    try { tenantInfo = await Graph.tenantInfo(); } catch (e) { tenantInfo = null; }
    if (!tenantInfo || !tenantInfo.id) return false;

    document.getElementById('gate').style.display = 'none';
    document.getElementById('wizard').style.display = 'flex';
    if (!W) W = { step: 4, siteType: 'custom', sitePath: '', resolvedSite: null, frameworks: { iso27001: true }, activationRaw: null, activationEval: null, activationGranted: {} };
    showWizardStep(4);
    var statusEl = document.getElementById('wizActStatus');
    if (statusEl) statusEl.textContent = 'Confirming your purchase…';

    try {
      /* knownSubscriptionIds: whatever this browser already remembers
         from an earlier purchase (localStorage only — S/Store isn't
         loaded yet at this point, a brand-new tenant hasn't provisioned
         anything). Sent so an already-onboarded client's SECOND (or
         third...) module purchase merges with what they already have
         right away, rather than the new activation file only reflecting
         this one transaction and dropping everything bought earlier —
         see lambda/provision.js's mergeResolvedSubscriptions(). */
      var res = await fetch(CONFIG.selfServeActivateUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transactionId: txnId, tenantId: tenantInfo.id, knownSubscriptionIds: readPaddleSubs() })
      });
      var data = await res.json().catch(function () { return {}; });
      if (!res.ok || !data.activationFile) {
        if (statusEl) statusEl.innerHTML = '<span style="color:var(--fail)">' + esc(data.error || 'Could not confirm your purchase automatically.') + ' Paste the activation file below once you receive it by email, or contact us.</span>';
        busy(false);
        return true; // stayed at step 4 with a clear message — manual paste is still right there as a fallback
      }
      /* Remember every Paddle subscription this (merged) activation
         came from, so the app can re-pull a fresh signed file on future
         loads without a checkout transaction id — that's how a
         trial→paid conversion (7-day demo → 12-month client licence)
         actually reaches the customer's tenant, since neither the
         provisioning Lambda nor the webhook can push into it. See
         refreshSelfServeEntitlementOnLoad(). */
      (data.subscriptionIds || []).forEach(addPaddleSubLocal);
      var textInput = document.getElementById('wizActPasteInput');
      if (textInput) textInput.value = data.activationFile;
      busy(false);
      await runWizardActivationCheck();
      return true;
    } catch (e) {
      if (statusEl) statusEl.innerHTML = '<span style="color:var(--fail)">Could not reach the activation service. Paste the activation file below once you receive it by email, or contact us.</span>';
      busy(false);
      return true;
    }
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

  /* Nav group collapse state — a practitioner's own expand/collapse
     choice, once made, overrides the HTML-authored defaults (Risk &
     posture and Frameworks open, everything else closed) for good, same
     per-tenant storage convention as the site preference above. Only
     ever written from a genuine click on a group's <summary> (wired
     near the other document-level listeners below) — App.go()'s
     auto-open of the active view's group sets .open directly and
     deliberately doesn't go through that click handler, so navigating
     around the app never overwrites a deliberate collapse. */
  function navGroupStorageKey() { return 'cpNavOpen:v1:' + tenantStorageKey(); }
  function loadNavGroupState() {
    try { return JSON.parse(localStorage.getItem(navGroupStorageKey()) || '{}'); } catch (e) { return {}; }
  }
  function saveNavGroupState(state) {
    try { localStorage.setItem(navGroupStorageKey(), JSON.stringify(state)); } catch (e) { /* private browsing etc. — the choice just won't survive to a future session */ }
  }
  function applyNavGroupState() {
    var state = loadNavGroupState();
    document.querySelectorAll('details.nav-group[data-group]').forEach(function (details) {
      var groupId = details.dataset.group;
      if (Object.prototype.hasOwnProperty.call(state, groupId)) details.open = !!state[groupId];
    });
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
  var WIZARD_STEP_COUNT = 10;

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
    var keys = CAPABILITY_KEYS;
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
    /* Durable local persistence as soon as the file itself verifies
       (signature + tenant match) — req 1/3 — regardless of whether its
       expiry status ends up letting the wizard proceed below. This is
       what lets provisioning gate-open on nothing but in-memory/
       localStorage state (no SharePoint dependency yet), and what lets
       a later "re-run setup"/resumed wizard pick this up automatically
       even if the browser tab was closed before provisioning finished
       (see prefillWizardActivationFromCache()). */
    if (writeLocalActivation(rawText)) clearPersistenceFailure('local');
    else reportPersistenceFailure('local', 'This browser\'s storage could not be written (private browsing, or storage is full).');

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
        : '<span style="color:var(--pass)">Verified ' + icon('check') + ' — frameworks: ' + esc((result.evalResult.frameworks || []).map(fwName).join(', ') || '—') + ', valid until ' + esc(fmtDate(result.evalResult.expiry)) + '.</span>';
    }
    if (nextBtn) nextBtn.disabled = false;
  }

  /* "Re-run setup" re-enters the wizard on an already-live tenant that
     (almost always) already has a good cached activation — without
     this, every re-run would force pasting the same file in again for
     no reason. Also covers resuming a wizard that was abandoned after
     verifying an activation but before provisioning finished (S doesn't
     exist yet in that case, but this browser's localStorage does — see
     runWizardActivationCheck()'s immediate local write): checks BOTH
     stores via resolveBestActivation(), not just the tenant Settings
     list, so a first-time-onboarding resume doesn't force re-pasting
     the same file either. Silently leaves the Activation step blank if
     nothing verifies or the best candidate is expired past grace — same
     as any other reject, the practitioner just pastes a current one. */
  async function prefillWizardActivationFromCache() {
    if (W && W.activationRaw) return;
    var tenantRaw = (S && S.settings && S.settings.entitlementFile) || null;
    var localRaw = readLocalActivation();
    if (!tenantRaw && !localRaw) return;
    var tenantInfo = await Graph.tenantInfo();
    var resolved = await resolveBestActivation(tenantIdsFor(tenantInfo), tenantRaw);
    if (!resolved.winner || resolved.winner.evalResult.status === 'expired') return;
    var result = resolved.winner;
    W.activationRaw = result.raw;
    W.activationEval = result.evalResult;
    W.activationGranted = {};
    (result.evalResult.frameworks || []).forEach(function (fw) { W.activationGranted[fw] = true; });
    W.frameworks = { iso27001: true };
    (result.evalResult.frameworks || []).forEach(function (fw) { W.frameworks[fw] = true; });
    await mergeLicensedPacks(result.evalResult);
    var statusEl = document.getElementById('wizActStatus');
    var nextBtn = document.getElementById('wizStep4Next');
    if (statusEl) statusEl.innerHTML = '<span style="color:var(--pass)">Using the activation already on file' + (result.source === 'local' ? ' in this browser' : ' for this tenant') + ' — frameworks: ' + esc((result.evalResult.frameworks || []).map(fwName).join(', ') || '—') + ', valid until ' + esc(fmtDate(result.evalResult.expiry)) + '. Paste a different file above only to replace it.</span>';
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
         Ed25519-verified W.activationRaw in memory (and already wrote it
         to this browser's localStorage — runWizardActivationCheck()) —
         this in-memory flag is what actually gates the SharePoint list
         creation below; no SharePoint state needs to exist first.
         Mirrored into the Settings list itself just below, right after
         it exists, so every future load (from any browser signed into
         this tenant) re-verifies from a shared cache instead of relying
         on this browser's localStorage alone. */
      window.CHECKPOINT_ACTIVATION = { verified: !!W.activationRaw };
      Store = window.SpStore;
      S = await Store.load(function (m) { if (msgEl) msgEl.textContent = m; });

      if (W.activationRaw) {
        if (writeLocalActivation(W.activationRaw)) clearPersistenceFailure('local');
        else reportPersistenceFailure('local', 'This browser\'s storage could not be written (private browsing, or storage is full).');
        try {
          await Store.setSetting('entitlementFile', W.activationRaw);
          S.settings.entitlementFile = W.activationRaw;
          clearPersistenceFailure('tenant');
        } catch (e) {
          reportPersistenceFailure('tenant', describeGraphError(e));
        }
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
    var nextBtn = document.getElementById('wizStep9NextBtn');
    if (nextBtn) nextBtn.style.display = '';
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

  /* Step 10 — "Who can use Checkpoint?" (see SETUP.md §5a for the full
     manual setup this links to). Graph has no v1.0 endpoint to create,
     or even read the membership of, a classic SharePoint site group —
     that's SharePoint's own permission model (site groups, role
     definitions), only exposed via the SharePoint REST API
     (`_api/web/sitegroups`) or its own admin UI, never Graph
     (graph.microsoft.com). Rather than request a second permission
     scope against a second API surface just to deep-link into a
     specific not-yet-created group's membership page, this resolves
     ONE link — this tenant's own "Advanced permissions settings" page,
     using the exact same host-then-site Graph lookup store.js's own
     site-provisioning code already uses (`Graph.g('/sites/root?
     $select=webUrl')`, then the resolved custom path if one was
     chosen in step 5) — where BOTH groups get created and managed;
     SharePoint doesn't have a separate page per group before it
     exists. The two group names/permission levels below are the exact
     copy-paste values SETUP.md §5a's manual steps use, so getting them
     right doesn't depend on remembering that document. Never requests
     Sites.Manage.All or any group-write permission beyond what site
     provisioning already consented to earlier in this same wizard. */
  async function renderWizardTeamAccessStep() {
    var el = document.getElementById('wizTeamAccessLink');
    if (!el) return;
    el.textContent = 'Resolving your SharePoint site link…';
    try {
      var host = (await Graph.g('/sites/root?$select=webUrl')).webUrl.replace(/^https:\/\//, '').split('/')[0];
      var siteUrl = (!W.resolvedSite || W.resolvedSite === 'root') ? 'https://' + host : (await Graph.g('/sites/' + host + ':' + W.resolvedSite + '?$select=webUrl')).webUrl;
      var permsUrl = siteUrl + '/_layouts/15/user.aspx';
      el.innerHTML = '<a class="btn ghost sm" href="' + esc(permsUrl) + '" target="_blank" rel="noopener noreferrer">Open Site permissions ' + icon('external') + '</a>';
    } catch (e) {
      el.innerHTML = '<span style="color:var(--paper-dim)">Could not resolve your site link automatically — open your SharePoint site → gear icon (Settings) → Site permissions → Advanced permissions settings.</span>';
    }
  }

  window.Wizard = {
    start: function () {
      W = { step: 1, siteType: 'custom', sitePath: '', resolvedSite: null, frameworks: { iso27001: true }, activationRaw: null, activationEval: null, activationGranted: {} };
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
      if (!W) W = { step: n, siteType: 'custom', sitePath: '', resolvedSite: null, frameworks: { iso27001: true }, activationRaw: null, activationEval: null, activationGranted: {} };
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
      if (W.step === 9) { showWizardStep(10); renderWizardTeamAccessStep(); return; }
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
        if (e.errorCode !== 'user_cancelled') toastError('<b>Sign-in failed:</b> ' + esc(e.message || e));
      }
    },

    setSiteType: function (val) {
      W.siteType = val;
      var pathEl = document.getElementById('wizSitePath');
      if (pathEl) pathEl.style.display = val === 'custom' ? '' : 'none';
      /* One element serves as both the validation result and the
         advisory note, so it is cleared first and then repopulated —
         setting the note before the clear silently wiped it. */
      var valEl = document.getElementById('wizSiteValidation');
      if (!valEl) return;
      valEl.textContent = '';
      /* Choosing root is a deliberate choice against the
         recommendation, so say what it means at the moment it is made
         rather than leaving it to the documentation. */
      if (val === 'root') {
        valEl.innerHTML = '<span style="color:var(--warn)">Your records will live in your organisation\'s default SharePoint site. If that is your intranet home, check its permissions first — anyone who can read that site will be able to read your registers.</span>';
      }
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
        if (valEl) valEl.innerHTML = '<span style="color:var(--pass)">Found "' + esc(site.name || path) + '" ' + icon('check') + '</span>';
        W.resolvedSite = path;
        if (btn) { btn.disabled = false; btn.textContent = 'Validate & continue'; }
        showWizardStep(6); renderWizardFrameworks();
      } catch (e) {
        if (valEl) valEl.innerHTML = '<span style="color:var(--fail)">No site found at "' + esc(path) + '". If you haven\'t created it yet, make a new SharePoint site (a Team site is fine), then come back and enter its path. Otherwise check the spelling — it should look like /sites/compliance.</span>';
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

    finish: async function () {
      /* Same check startLive()/retryActivationFromGate() do — rare here
         (a brand-new tenant would need to already be on the owner's
         blocklist before finishing its very first onboarding), but
         cheap, and every path that reaches bootUi() for a live tenant
         should honour a revocation consistently. */
      var tenantInfo = await Graph.tenantInfo().catch(function () { return null; });
      var revocation = await checkAccessRevoked(tenantInfo && tenantInfo.id);
      if (revocation.blocked) {
        document.getElementById('wizard').style.display = 'none';
        showAccessRevokedScreen();
        return;
      }
      document.getElementById('wizard').style.display = 'none';
      bootUi('Live — records stored as SharePoint lists in this tenant', S.client);
    }
  };

  document.querySelectorAll('.nav-item').forEach(function (n) {
    /* A .nav-item styled trigger that opens a drawer instead of a view
       (e.g. #navCopilot, wired purely via data-action + the delegated
       [data-action] click listener below) has no data-v at all —
       App.go(undefined) would throw on the null view lookup, so skip
       navigation entirely for those and let the delegated handler do
       its own thing. */
    if (!n.dataset.v) return;
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

  /* Half the App actions are async, and an async function that rejects
     returns a rejected promise rather than throwing at the call site.
     Calling one bare — `fn(id)` — meant any unexpected error inside it
     (a null dereference, a Graph call nobody wrapped) produced an
     "Uncaught (in promise)" line in the console and absolutely nothing
     in the interface: the user clicks a button and it silently does
     nothing, which is the worst failure mode available to us.

     runAction() closes that. Each action still handles its own EXPECTED
     failures with a specific message; this is the backstop for the
     unexpected ones, and it says so rather than pretending the click
     was ignored. Synchronous throws are caught by the same path. */
  function runAction(fn, arg, arg2) {
    try {
      var out = arg2 === undefined ? fn(arg) : fn(arg, arg2);
      if (out && typeof out.catch === 'function') {
        out.catch(function (err) {
          console.error(err);
          toastError('<b>Something went wrong:</b> ' + esc((err && err.message) || String(err)));
        });
      }
    } catch (err) {
      console.error(err);
      toastError('<b>Something went wrong:</b> ' + esc((err && err.message) || String(err)));
    }
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
    runAction(fn, el.dataset.id);
  });

  /* mousedown, not click — search results must select before the
     search input's blur handler closes the results dropdown */
  document.addEventListener('mousedown', function (e) {
    var el = e.target.closest('[data-mousedown-action]');
    if (!el) return;
    var fn = resolvePath(el.dataset.mousedownAction);
    if (fn) runAction(fn, el.dataset.id);
  });

  document.addEventListener('change', function (e) {
    var el = e.target.closest('[data-change-action]');
    if (!el) return;
    var fn = resolvePath(el.dataset.changeAction);
    if (!fn) return;
    if (READONLY && isMutatingAction(el.dataset.changeAction)) { toast('Read-only access — ask a practitioner to make this change.'); return; }
    if (el.dataset.id !== undefined) runAction(fn, el.dataset.id, el.value);
    else runAction(fn, el.value);
  });

  /* Applies whatever nav group collapse state this practitioner already
     chose (runs before sign-in/demo mode is even picked, so it covers
     both paths identically — the nav's DOM exists from page load,
     unlike the rest of the app which only renders after boot). Each
     group's own click — not the 'toggle' event, which also fires for
     App.go()'s programmatic auto-open below — is what persists a
     choice, so navigating around never overwrites a deliberate
     collapse with the fact that a view was merely visited. */
  applyNavGroupState();
  document.querySelectorAll('details.nav-group[data-group] > summary').forEach(function (summary) {
    summary.addEventListener('click', function () {
      var details = summary.parentElement;
      setTimeout(function () {
        var state = loadNavGroupState();
        state[details.dataset.group] = details.open;
        saveNavGroupState(state);
      }, 0);
    });
  });

  /* The topbar search box is now purely a trigger (readonly,
     data-action="App.openPalette" — handled by the generic
     [data-action] click delegation above) for the command palette
     below; it no longer has its own dropdown/keyboard wiring. */
  var cmdkInputEl = document.getElementById('cmdkInput');
  if (cmdkInputEl) {
    cmdkInputEl.addEventListener('input', function () { App.paletteInput(this.value); });
  }

  /* Ctrl/Cmd-K opens the palette from anywhere in the app — the one
     global keyboard shortcut this app defines, so it deliberately
     doesn't check e.target (a text input capturing "k" isn't a
     realistic conflict for a Ctrl/Cmd-chorded shortcut the way a bare
     "k" would be). Escape/arrow keys drive Boardroom Mode too, the
     other "always listening" keys in the app, since its own
     sidebar/topbar (the normal way to navigate away) is hidden by
     design while it's on. */
  document.addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
      e.preventDefault();
      App.openPalette();
      return;
    }
    if (document.body.classList.contains('boardroom-mode')) {
      if (e.key === 'Escape') { App.exitBoardroom(); return; }
      if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); App.boardroomNext(); return; }
      if (e.key === 'ArrowLeft') { e.preventDefault(); App.boardroomPrev(); return; }
    }
  });

  (async function init() {
    /* Stash Paddle's transaction id the instant we see it, BEFORE any
       MSAL sign-in redirect can navigate the page and drop the query
       string. A returning customer usually isn't signed in when Paddle
       sends them to /checkpoint/?activate=1&_ptxn=txn_..., so the id has
       to survive the round-trip through Microsoft login — sessionStorage
       does that reliably where a URL param may not. attemptSelfServeActivation()
       reads from here as a fallback and clears it once consumed. */
    try {
      var _ptxnNow = new URLSearchParams(location.search).get('_ptxn');
      if (_ptxnNow) sessionStorage.setItem('c365_ptxn', _ptxnNow);
    } catch (e) { /* private browsing / storage disabled — URL param path still works */ }

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
