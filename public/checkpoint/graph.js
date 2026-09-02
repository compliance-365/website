/* ============================================================
   Checkpoint — Microsoft Graph layer
   MSAL.js auth + read-only posture checks against the tenant.
   ============================================================ */
window.Graph = (function () {
  var CONFIG = window.CHECKPOINT_CONFIG;
  var msalApp = null, account = null;

  /* Redirect flow, not popup: tokens/account state live only in
     sessionStorage (cleared when the tab closes, not just on sign-out),
     and no popup window is ever opened. The tradeoff — see SETUP.md and
     the note above signIn()/token() below — is that both loginRedirect
     and the acquireTokenRedirect fallback navigate the whole page away;
     nothing after those calls executes in the current page load. The
     app picks the session back up via handleRedirectPromise() in init(),
     which every page load (including the one after a redirect) calls
     before deciding whether to show the sign-in gate or go live. */
  async function init() {
    if (!CONFIG.clientId) return false;
    msalApp = new msal.PublicClientApplication({
      auth: {
        clientId: CONFIG.clientId,
        authority: CONFIG.authority,
        redirectUri: location.origin + location.pathname
      },
      cache: { cacheLocation: 'sessionStorage', storeAuthStateInCookie: false }
    });
    await msalApp.initialize();
    var redirectResult = await msalApp.handleRedirectPromise();
    if (redirectResult && redirectResult.account) {
      account = redirectResult.account;
    } else {
      var accs = msalApp.getAllAccounts();
      if (accs.length) account = accs[0];
    }
    return true;
  }

  /* Navigates the page to Entra's sign-in screen — does not return in the
     usual sense. Whatever follows this call in app.js's App.signIn() only
     runs if the browser hasn't started unloading yet, so don't rely on it;
     the actual "now sign the user in" continuation happens in init()
     above, on the page load Entra redirects back to. */
  /* Sign-in only ever asks for the read-only scopes — incremental
     consent (see token()/g() below) requests Sites.Manage.All and
     Mail.Send later, the first time something actually needs them. */
  async function signIn() {
    await msalApp.loginRedirect({ scopes: CONFIG.scopesReadOnly, prompt: 'select_account' });
  }

  function signOut() {
    var acc = account; account = null;
    return msalApp.logoutRedirect({ account: acc });
  }

  function getAccount() { return account; }

  /* scopes defaults to the read-only set already granted at sign-in.
     Callers that need SharePoint (scopesProvision) or mail (scopesMail)
     pass those explicitly — the first time either is requested for an
     account that hasn't consented to it yet, acquireTokenSilent throws
     and the redirect fallback below triggers Entra's incremental-consent
     prompt for just that scope. Once granted, it's silent from then on,
     same as any other MSAL-cached scope. */
  async function token(scopes) {
    scopes = scopes || CONFIG.scopesReadOnly;
    try {
      return (await msalApp.acquireTokenSilent({ scopes: scopes, account: account })).accessToken;
    } catch (e) {
      /* full-page redirect — the caller's promise chain is abandoned when
         the browser navigates away, same caveat as signIn() above */
      await msalApp.acquireTokenRedirect({ scopes: scopes });
    }
  }

  /* Incremental-consent token for the client's OWN Azure OpenAI resource
     (CONFIG.scopesAi, https://cognitiveservices.azure.com/.default) —
     requested the first time the AI assistant is actually used, exactly
     like scopesProvision/scopesMail above. Entra ID bearer auth only;
     ai.js never sees or sends an API key. This is the ONLY way ai.js
     acquires a token — it has no MSAL instance of its own. */
  async function aiToken() { return token(CONFIG.scopesAi); }

  /* Bearer token for OUR OWN provisioning Lambda's caller-tenant check
     (lambda/provision.js's resolveCallerTenantId()) — the same
     scopesReadOnly token already granted at sign-in, exposed here so
     app.js can forward it as an Authorization header on the self-serve
     activation calls without reaching into this closure's private
     token() itself. Named for the scope it carries, same convention as
     aiToken()/signingToken() below. */
  async function readOnlyToken() { return token(CONFIG.scopesReadOnly); }

  /* Incremental-consent token for OUR OWN optional signing endpoint
     (CONFIG.scopesSigning) — a small Azure Function in OUR tenant that
     holds the Ed25519 private key in Key Vault and signs an entitlement
     server-side, so the key itself never has to touch this browser. Only
     ever requested by the owner console's "New client" form, and only
     when CONFIG.signingEndpoint.url is actually configured (empty by
     default — see tools/ISSUANCE.md's "signing endpoint" section for the
     trade-off against the always-available CLI-copy path). Entra ID
     bearer auth against that Function's own app registration, scoped so
     only identities in OUR tenant can call it — never a client's. */
  async function signingToken() { return token(CONFIG.scopesSigning); }

  /* Minimal Graph fetch. path is relative to v1.0 unless it starts with
     http. opts.scopes overrides the default read-only token scope —
     pass CONFIG.scopesProvision for SharePoint calls, CONFIG.scopesMail
     for sendMail. */
  async function g(path, opts) {
    opts = opts || {};
    var t = await token(opts.scopes);
    var url = path.indexOf('http') === 0 ? path : 'https://graph.microsoft.com/v1.0' + path;
    var res = await fetch(url, {
      method: opts.method || 'GET',
      headers: Object.assign(
        { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' },
        opts.headers || {}
      ),
      body: opts.body ? JSON.stringify(opts.body) : undefined
    });
    if (res.status === 204) return null;
    /* Graph's error responses are normally JSON ({error:{code,message,
       innerError}}), but a malformed/oversized request can be rejected
       by a layer in front of Graph that returns an empty or HTML body
       instead — res.json() throwing there used to surface as a raw
       "Unexpected token" SyntaxError, hiding the real HTTP status
       behind a confusing parse error. Read the raw text first so a
       parse failure still reports the status/statusText, and the raw
       body (truncated) for anyone diagnosing it afterwards. */
    var text = await res.text();
    var j = null;
    try { j = text ? JSON.parse(text) : null; } catch (e) { /* handled below via the res.ok branch */ }
    if (!res.ok) {
      var errInfo = j && j.error;
      var err = new Error((errInfo && errInfo.message) || ('Graph error ' + res.status + ' ' + res.statusText));
      err.code = errInfo && errInfo.code;
      err.status = res.status;
      /* innerError commonly carries a request-id/date Microsoft support
         can correlate against server-side logs — the top-level message
         alone (e.g. a bare "Invalid request") is often too generic to
         diagnose from on its own. */
      err.requestId = errInfo && errInfo.innerError && (errInfo.innerError['request-id'] || errInfo.innerError.requestId);
      if (!j) err.rawBody = text ? text.slice(0, 500) : '(empty response body)';
      throw err;
    }
    return j;
  }

  /* Page through a collection */
  async function gAll(path, opts) {
    var out = [], url = path;
    while (url) {
      var j = await g(url, opts);
      out = out.concat(j.value || []);
      url = j['@odata.nextLink'] || null;
    }
    return out;
  }

  /* ==========================================================
     Capability detection — so the app is honest about what it can
     check in THIS tenant, rather than a posture check silently
     surfacing a raw Graph error as if it were a finding. Each probe is
     the cheapest possible call for that area ($top=1, response body
     discarded) — this is deliberately a separate, reusable concept
     from the real posture-check calls in runPostureChecks() below,
     even though a couple of them (Conditional Access, Secure Score)
     end up making an equivalent call twice in one scan when the
     capability IS available. That small duplication buys a single,
     well-tested "is this readable in this tenant" layer every caller
     (the Coverage card, the Dashboard summary, runPostureChecks
     itself) can share, instead of each reimplementing its own
     try/catch-and-guess.
     Cached for the lifetime of this page load ("per session" in the
     SPA sense — a fresh page load re-probes, same as every other piece
     of live tenant state this app holds only in memory). Call with
     force:true to re-probe (e.g. a manual "recheck" action). */
  var capabilitiesCache = null;
  var CAPABILITY_PROBES = [
    { key: 'conditionalAccess', label: 'Conditional Access', licence: 'Entra ID P1', path: '/identity/conditionalAccess/policies?$top=1',
      note: 'Conditional Access requires Entra ID P1 — MFA, legacy-authentication and privileged-role sign-in checks will show as Manual.' },
    { key: 'identityProtection', label: 'Identity Protection', licence: 'Entra ID P2', path: '/identityProtection/riskyUsers?$top=1',
      note: 'Identity Protection requires Entra ID P2 — the risky-user check will show as Manual.' },
    { key: 'pim', label: 'Privileged Identity Management', licence: 'Entra ID P2 or Microsoft 365 E5', path: '/roleManagement/directory/roleEligibilityScheduleInstances?$top=1',
      note: 'PIM requires Entra ID P2 (or Microsoft 365 E5) — the privileged-role-assignment check will show as Manual.' },
    { key: 'intune', label: 'Intune device management', licence: 'Intune / Microsoft 365 Business Premium+', path: '/deviceManagement/managedDevices?$top=1',
      note: 'No accessible Intune device data — device compliance checks will show as Manual.' },
    { key: 'secureScore', label: 'Microsoft Secure Score', licence: 'Any Microsoft 365 plan with Secure Score', path: '/security/secureScores?$top=1',
      note: 'Secure Score is unavailable — patch, macro, logging, application-control, DLP, encryption and alerting checks will show as Manual.' },
    { key: 'sensitivityLabels', label: 'Microsoft Purview sensitivity labels', licence: 'Microsoft Purview Information Protection (Microsoft 365 E5, or E3 + a compliance add-on)', path: '/me/security/informationProtection/sensitivityLabels?$top=1',
      note: 'Sensitivity labels are unavailable — the classification/labelling check will show as Manual.' },
    { key: 'accessReviews', label: 'Microsoft Entra Access Reviews', licence: 'Microsoft Entra ID Governance (Entra ID P2, or the Governance add-on)', path: '/identityGovernance/accessReviews/definitions?$top=1',
      note: 'Access Reviews requires Entra ID Governance — the periodic access-rights-review check will show as Manual.' },
    { key: 'sharePointSettings', label: 'SharePoint tenant sharing settings', licence: 'The signed-in user must hold the SharePoint Administrator (or Global Administrator) role', path: '/admin/sharepoint/settings?$select=sharingCapability',
      note: 'Reading tenant-wide SharePoint sharing settings needs the SharePoint Administrator role specifically — the external-sharing check will show as Manual for a Security Reader-level scan account.' },
    /* Microsoft Graph's /security/incidents is GA on v1.0 (it is the
       Defender XDR incident queue, not the older legacy alerts API).
       A tenant without a Defender XDR plan has no incident queue to
       read at all, so this probe distinguishes "no Defender" from
       "Defender, and genuinely nothing open" — which are the same empty
       array on the wire but opposite compliance answers. */
    { key: 'defenderXdr', label: 'Microsoft Defender XDR incidents', licence: 'A Microsoft Defender XDR plan (Defender for Office/Endpoint/Identity, or Microsoft 365 E5)', path: '/security/incidents?$top=1',
      note: 'No readable Defender XDR incident queue — the incident-triage check will show as Manual. If incidents are handled in another product, record that on the check itself rather than leaving it unanswered.' },
    /* Priva subject rights requests. NOTE the /security path: the older
       /privacy/subjectRightsRequests node is deprecated and stopped
       returning data in March 2025, so anything still pointing there
       reads as an empty tenant rather than erroring — which would look
       exactly like "no requests" and quietly score a pass. */
    { key: 'priva', label: 'Microsoft Priva subject rights requests', licence: 'Microsoft Priva (Subject Rights Requests)', path: '/security/subjectRightsRequests?$top=1',
      note: 'No readable subject rights request queue — the privacy-request check will show as Manual. If data subject requests are tracked in another system, record that on the check itself.' },
    { key: 'recordsManagement', label: 'Microsoft Purview retention labels', licence: 'Microsoft Purview records management (Microsoft 365 E5, or E3 + a compliance add-on)', path: '/security/labels/retentionLabels?$top=1',
      note: 'No readable retention labels — the retention/disposal check will show as Manual. Delegated access only: this endpoint has no application-permission equivalent, so an unattended scan cannot answer it either.' },
    /* Entra ID Governance's Lifecycle Workflows — GA on v1.0. Reading
       this also needs the signed-in user to hold Global Reader,
       Lifecycle Workflows Administrator, or Global Administrator
       specifically (Global Administrator is a superset of Global
       Reader for this API, so the common "admin runs the scan" case is
       unaffected); a Security Reader-level scan account sees Manual
       here, same shape as the SharePoint settings probe above. */
    { key: 'lifecycleWorkflows', label: 'Entra ID Governance Lifecycle Workflows', licence: 'Microsoft Entra ID Governance (Entra ID P2 + the Governance add-on, or Microsoft Entra Suite)', path: '/identityGovernance/lifecycleWorkflows/workflows?$top=1',
      note: 'Lifecycle Workflows requires Entra ID Governance — the joiner/leaver automation check will show as Manual.' }
  ];
  async function detectCapabilities(force) {
    if (capabilitiesCache && !force) return capabilitiesCache;
    var out = {};
    for (var i = 0; i < CAPABILITY_PROBES.length; i++) {
      var p = CAPABILITY_PROBES[i];
      try {
        await g(p.path);
        out[p.key] = { key: p.key, label: p.label, licence: p.licence, available: true, status: 'available', note: '' };
      } catch (e) {
        /* Graph's error shape for "this doesn't exist for this tenant"
           varies by endpoint — a 401/403 most often means the SIGNED-IN
           ACCOUNT lacks the role/access (a non-admin, or a genuinely
           unlicensed feature returning a permission-flavoured error),
           while other statuses (400/404/501-shaped) more often mean the
           underlying SERVICE isn't licensed at all. Either way it's
           surfaced as "not available" — the distinction only changes
           the status label, never whether dependent checks get skipped. */
        var status = (e.status === 401 || e.status === 403) ? 'noAccess' : 'notLicensed';
        out[p.key] = { key: p.key, label: p.label, licence: p.licence, available: false, status: status, note: p.note, error: e.message };
      }
    }
    capabilitiesCache = out;
    return out;
  }

  /* ==========================================================
     Two-role model — detects whether the signed-in user is a member of
     the "Checkpoint Viewers" or "Checkpoint Practitioners" SharePoint
     group set up for this tenant (see SETUP.md — Graph has no v1.0
     endpoint to CREATE or list-scope-assign classic SharePoint site
     groups, so that setup step is manual; this probe only reads Entra
     ID group membership, which Graph does support, via the same
     Directory.Read.All scope already consented at sign-in — no
     incremental consent needed). A cheap, read-only call, same shape as
     detectCapabilities() above: try, cache, fail soft.

     SECURITY NOTE — read this before changing anything downstream of
     this function: the result here NEVER grants or restricts access to
     anything. It only tells app.js which buttons to disable for a
     nicer Viewer experience. The actual enforcement is, and must always
     be, each SharePoint list's own permissions — set by the manual
     steps in SETUP.md, checked by SharePoint itself on every read/write
     Graph call this app makes. If this probe fails, returns stale data,
     or is bypassed entirely (e.g. by calling a Store method directly
     from the console), a genuine Viewer's write attempts still fail at
     SharePoint, because SharePoint — not this flag — is what's actually
     protecting the data. Never remove SharePoint-side permissions and
     rely on this flag instead. */
  var roleCache = null;
  async function detectRole(force) {
    if (roleCache && !force) return roleCache;
    try {
      var groups = await gAll('/me/transitiveMemberOf/microsoft.graph.group?$select=displayName');
      var names = groups.map(function (grp) { return grp.displayName; });
      var isViewer = names.indexOf('Checkpoint Viewers') > -1;
      var isPractitioner = names.indexOf('Checkpoint Practitioners') > -1;
      roleCache = { readOnly: isViewer && !isPractitioner, detected: isViewer || isPractitioner };
    } catch (e) {
      /* Directory.Read.All is already consented (it's in scopesReadOnly,
         requested at sign-in), so a failure here is almost always "this
         tenant hasn't set up the two Checkpoint groups yet" rather than
         a real permission problem — fail OPEN (full access) at this UI
         layer. Safe to fail open: see the note above, this flag only
         ever hides/disables buttons, it grants nothing. */
      roleCache = { readOnly: false, detected: false, error: e.message };
    }
    return roleCache;
  }

  /* ==========================================================
     Posture checks — each returns 'pass' | 'review' | 'fail' | 'manual'
     plus a human note. Checks Graph attempted but couldn't conclusively
     resolve return 'review'; checks with no Graph signal at all
     (CHECK_DEFS scored:false) return 'manual'. Neither is ever silently
     marked pass.
     ========================================================== */
  async function runPostureChecks(progress, settings) {
    var results = {}, notes = {};
    /* The raw Graph response(s) behind each check, for Evidence auto-
       capture (app.js's runScan) to export as dated JSON files — kept
       separate from results/notes so nothing about the pass/review/
       fail/manual contract changes. Several check ids intentionally
       share the same underlying array (e.g. mfa-all/mfa-priv/legacy all
       evaluate the same Conditional Access policy list) — that's the
       real signal for all three, not a duplication bug. */
    var raw = {};
    function set(id, r, n) { results[id] = r; notes[id] = n || ''; if (progress) progress(id, r, n); }

    /* Per-client thresholds (see THRESHOLD_DEFS in store.js for the UI and
       rationale text) — a value missing from settings (older tenant, demo
       mode) falls back to the same default this check always used. */
    settings = settings || {};
    function num(key, def) {
      var v = settings[key];
      var n = (v !== undefined && v !== null && v !== '') ? Number(v) : NaN;
      return isNaN(n) ? def : n;
    }
    var maxGlobalAdmins = num('maxGlobalAdmins', 4);
    var maxGuests = num('maxGuests', 25);
    var maxPermanentPrivileged = num('maxPermanentPrivileged', 0);
    var deviceCompliancePassPct = num('deviceCompliancePassPct', 95);
    var deviceComplianceReviewPct = num('deviceComplianceReviewPct', 80);
    var riskyUsersReviewMax = num('riskyUsersReviewMax', 3);
    var incidentTriageDays = num('incidentTriageDays', 5);
    var deviceStaleDays = num('deviceStaleDays', 30);

    /* Consulted below so a licence/permission gap this tenant genuinely
       has (no Entra ID P2, no Intune, etc.) shows up as a clean,
       friendly 'manual' result — same contract as any other
       unautomatable check — instead of a raw Graph error surfacing as
       if it were a posture finding. Checks with no dependency here
       (admins, guests, riskyapps — all basic Directory.Read.All reads)
       are unaffected and keep trying/catching exactly as before. */
    var capabilities = await detectCapabilities();

    /* --- Conditional Access driven checks --- */
    var policies = [];
    var caFetchFailed = false;
    if (!capabilities.conditionalAccess.available) {
      set('mfa-all', 'manual', capabilities.conditionalAccess.note);
      set('legacy', 'manual', capabilities.conditionalAccess.note);
      set('mfa-priv', 'manual', capabilities.conditionalAccess.note);
      set('ca-device', 'manual', capabilities.conditionalAccess.note);
      set('ca-sif', 'manual', capabilities.conditionalAccess.note);
      set('ca-tou', 'manual', capabilities.conditionalAccess.note);
      set('ca-cas', 'manual', capabilities.conditionalAccess.note);
    } else {
      try {
        policies = (await g('/identity/conditionalAccess/policies')).value || [];
      } catch (e) {
        caFetchFailed = true;
        set('mfa-all', 'review', 'Could not read Conditional Access policies: ' + e.message);
      }
    }
    var enabled = policies.filter(function (p) { return p.state === 'enabled'; });
    raw['mfa-all'] = raw['mfa-priv'] = raw['legacy'] = { conditionalAccessPolicies: policies };

    if (capabilities.conditionalAccess.available && (policies.length || results['mfa-all'] === undefined)) {
      var mfaPolicy = enabled.find(function (p) {
        var grants = (p.grantControls && p.grantControls.builtInControls) || [];
        var users = (p.conditions && p.conditions.users && p.conditions.users.includeUsers) || [];
        var hasStrength = p.grantControls && p.grantControls.authenticationStrength;
        return (grants.indexOf('mfa') > -1 || hasStrength) && users.indexOf('All') > -1;
      });
      if (!mfaPolicy) {
        set('mfa-all', 'fail', 'No enabled CA policy requires MFA for all users');
      } else {
        var mfaCond = (mfaPolicy.conditions && mfaPolicy.conditions.users) || {};
        var exUsers = (mfaCond.excludeUsers || []).length;
        var exGroups = (mfaCond.excludeGroups || []).length;
        var exRoles = (mfaCond.excludeRoles || []).length;
        var exTotal = exUsers + exGroups + exRoles;
        if (exTotal > 0) {
          set('mfa-all', 'review', 'MFA required for All users, but ' + exTotal + ' principal(s)/group(s)/role(s) excluded — verify break-glass only');
        } else {
          set('mfa-all', 'pass', 'Tenant-wide MFA policy found with no exclusions');
        }
      }

      var legacy = enabled.some(function (p) {
        var apps = (p.conditions && p.conditions.clientAppTypes) || [];
        var grants = (p.grantControls && p.grantControls.builtInControls) || [];
        return grants.indexOf('block') > -1 &&
          (apps.indexOf('exchangeActiveSync') > -1 || apps.indexOf('other') > -1);
      });
      set('legacy', legacy ? 'pass' : 'fail',
        legacy ? 'Legacy authentication is blocked by CA policy' : 'No CA policy blocks legacy authentication');

      var priv = enabled.some(function (p) {
        var roles = (p.conditions && p.conditions.users && p.conditions.users.includeRoles) || [];
        var strength = p.grantControls && p.grantControls.authenticationStrength;
        var grants = (p.grantControls && p.grantControls.builtInControls) || [];
        return roles.length > 0 && (strength || grants.indexOf('mfa') > -1);
      });
      /* authenticationStrength = genuinely phishing-resistant; plain MFA on roles = review */
      var privStrong = enabled.some(function (p) {
        var roles = (p.conditions && p.conditions.users && p.conditions.users.includeRoles) || [];
        return roles.length > 0 && p.grantControls && p.grantControls.authenticationStrength;
      });
      set('mfa-priv', privStrong ? 'pass' : priv ? 'review' : 'fail',
        privStrong ? 'Authentication-strength policy covers privileged roles'
          : priv ? 'Privileged roles require MFA, but not a phishing-resistant method'
          : 'No CA policy targets privileged directory roles');

      /* ca-device mines the SAME policy array above for a signal nothing
         was reading: whether cloud app access is gated on a compliant
         or hybrid-joined device. No new call, no new scope. */
      raw['ca-device'] = { conditionalAccessPolicies: policies };
      var caDevice = window.CheckpointLib.caDeviceComplianceResult(policies);
      set('ca-device', caDevice.result, caDevice.note);

      /* ca-sif and ca-tou mine sessionControls.signInFrequency and
         grantControls.termsOfUse off the same policy array — two more
         fields nothing was reading. No new call, no new scope. */
      raw['ca-sif'] = { conditionalAccessPolicies: policies };
      var caSif = window.CheckpointLib.caSignInFrequencyResult(policies);
      set('ca-sif', caSif.result, caSif.note);

      raw['ca-tou'] = { conditionalAccessPolicies: policies };
      var caTou = window.CheckpointLib.caTermsOfUseResult(policies);
      set('ca-tou', caTou.result, caTou.note);

      /* ca-cas (A.5.23 — cloud service governance) mines a fourth field
         off the same policy array: sessionControls.cloudAppSecurity. No
         new call, no new scope. */
      raw['ca-cas'] = { conditionalAccessPolicies: policies };
      var caCas = window.CheckpointLib.caCloudAppSecurityResult(policies);
      set('ca-cas', caCas.result, caCas.note);
    }

    /* ca-risk reads the same policy array for Entra ID Protection's
       risk-based conditions (signInRiskLevels/userRiskLevels) — an
       Entra ID P2 feature, so it's gated on identityProtection the same
       way 'riskyusers' already is: a tenant without the licence gets
       'manual', never an invented failure. */
    if (!capabilities.identityProtection.available) {
      set('ca-risk', 'manual', capabilities.identityProtection.note);
    } else if (!capabilities.conditionalAccess.available) {
      set('ca-risk', 'manual', capabilities.conditionalAccess.note);
    } else if (caFetchFailed) {
      /* The CA policy fetch above failed (mfa-all landed on 'review'
         from that catch) — an empty policies array here means "we
         don't know", not "no risk-based policy exists". */
      set('ca-risk', 'review', 'Could not read Conditional Access policies for risk-based analysis');
    } else {
      raw['ca-risk'] = { conditionalAccessPolicies: policies };
      var caRisk = window.CheckpointLib.caRiskBasedResult(policies);
      set('ca-risk', caRisk.result, caRisk.note);
    }

    /* --- Global admin count --- */
    var gaMembers = [];
    try {
      var role = await g("/directoryRoles(roleTemplateId='62e90394-69f5-4237-9190-012177145e10')/members?$select=id,displayName,userPrincipalName");
      gaMembers = role.value || [];
      raw['admins'] = { globalAdministrators: gaMembers };
      var n = gaMembers.length;
      set('admins', n <= maxGlobalAdmins ? 'pass' : n <= maxGlobalAdmins * 2 ? 'review' : 'fail',
        n + ' Global Administrator' + (n === 1 ? '' : 's') + ' (target ≤' + maxGlobalAdmins + ' — Microsoft recommends 2–4 emergency-access/Global Admin accounts)');
    } catch (e) {
      set('admins', 'review', 'Could not read directory roles: ' + e.message);
    }

    /* --- PIM: permanent vs eligible privileged role assignments.
       roleAssignmentScheduleInstances covers every currently-active
       assignment, whether it's a standing permanent grant
       (assignmentType 'Assigned') or a temporary activation from an
       eligible assignment (assignmentType 'Activated') — only the
       former counts as "permanent" here. Configurable thresholds below:
       a handful of permanent privileged assignments is normal (service
       accounts, break-glass), a large number suggests PIM isn't
       actually being used for day-to-day privileged access. */
    if (!capabilities.pim.available) {
      set('pim', 'manual', capabilities.pim.note);
    } else {
      try {
        var PIM_PASS_THRESHOLD = maxPermanentPrivileged, PIM_REVIEW_THRESHOLD = maxPermanentPrivileged + 3;
        var permInstances = await gAll('/roleManagement/directory/roleAssignmentScheduleInstances?$select=id,assignmentType&$top=999');
        var eligInstances = await gAll('/roleManagement/directory/roleEligibilityScheduleInstances?$select=id&$top=999');
        raw['pim'] = { permanentAssignments: permInstances, eligibleAssignments: eligInstances };
        var permanentCount = permInstances.filter(function (i) { return i.assignmentType === 'Assigned'; }).length;
        var eligibleCount = eligInstances.length;
        var totalPrivileged = permanentCount + eligibleCount;
        if (totalPrivileged === 0) {
          set('pim', 'review', 'No privileged role assignments found — could not determine PIM usage');
        } else {
          var pimStatus = permanentCount <= PIM_PASS_THRESHOLD ? 'pass' : permanentCount <= PIM_REVIEW_THRESHOLD ? 'review' : 'fail';
          set('pim', pimStatus, eligibleCount + ' of ' + totalPrivileged + ' privileged assignment(s) are eligible (PIM); ' + permanentCount + ' remain permanent (target ≤' + maxPermanentPrivileged + ' permanent — Microsoft recommends privileged roles be eligible via PIM rather than standing assignments)');
        }
      } catch (e) {
        set('pim', 'review', 'PIM not licensed or not readable: ' + e.message);
      }
    }

    /* --- Guest / external user count --- */
    try {
      var guests = await gAll("/users?$filter=userType eq 'Guest'&$select=id,displayName,userPrincipalName,mail,createdDateTime&$top=999");
      raw['guests'] = { guestUsers: guests };
      var gn = guests.length;
      set('guests', gn <= maxGuests ? 'pass' : gn <= maxGuests * 3 ? 'review' : 'fail',
        gn + ' guest user' + (gn === 1 ? '' : 's') + ' in the directory (target ≤' + maxGuests + ')');
    } catch (e) {
      set('guests', 'review', 'Could not read guest users: ' + e.message);
    }

    /* --- Leaver hygiene (A.5.11 / A.6.5 / A.5.18) ---

       No new scope and no new licence: Directory.Read.All and
       RoleManagement.Read.Directory are both already granted at sign-in,
       and both endpoint shapes below are ones this file already calls
       elsewhere (the guest check reads /users with a $select, the admin
       check reads /directoryRoles/{...}/members).

       Role membership is gathered per activated role rather than via
       $expand, because the per-role members call is the shape already
       proven to work here. Activated directory roles are typically a few
       dozen at most, and a role whose members cannot be read is skipped
       rather than failing the whole check — a partial privileged set can
       only ever under-report, never invent a finding. */
    /* roleMembersByUser is gathered once here and reused by BOTH the
       leaver check below (flattened to a privileged/not-privileged set,
       its own long-standing shape) and the segregation-of-duties check
       right after it (which needs the per-role names a flat set can't
       give it) — same directory-role/members calls either way, so this
       computes it once rather than twice. */
    var roleMembersByUser = {};
    try {
      var allUsers = await gAll('/users?$select=id,displayName,userPrincipalName,accountEnabled,userType,assignedLicenses&$top=999');
      var privilegedIds = {};
      try {
        var roles = await gAll('/directoryRoles?$select=id,displayName');
        for (var ri = 0; ri < roles.length; ri++) {
          try {
            var mem = await gAll('/directoryRoles/' + roles[ri].id + '/members?$select=id,displayName,userPrincipalName&$top=999');
            for (var mi = 0; mi < mem.length; mi++) {
              if (!mem[mi].id) continue;
              privilegedIds[mem[mi].id] = true;
              var entry = roleMembersByUser[mem[mi].id] || (roleMembersByUser[mem[mi].id] = { name: mem[mi].displayName || mem[mi].userPrincipalName || mem[mi].id, roles: [] });
              entry.roles.push(roles[ri].displayName);
            }
          } catch (e) { /* skip this role — see note above on under-reporting */ }
        }
      } catch (e) { /* no role data at all: the licence half of the check still stands */ }

      var lh = window.CheckpointLib.leaverHygieneResult(allUsers, privilegedIds);
      raw['leaver'] = { disabled: lh.disabled, licensed: lh.licensed, privileged: lh.privileged };
      set('leaver', lh.result,
        lh.disabled === 0
          ? 'No disabled member accounts in the directory'
          : lh.disabled + ' disabled account(s)' +
            (lh.privileged ? '; ' + lh.privileged + ' STILL HOLD a privileged directory role' : '') +
            (lh.licensed ? '; ' + lh.licensed + ' still hold a paid licence — confirm each is a deliberate retention rather than an unfinished offboarding' : '') +
            (!lh.privileged && !lh.licensed ? ', none retaining licences or privileged roles' : ''));
    } catch (e) {
      set('leaver', 'review', 'Could not read directory accounts: ' + e.message);
    }

    /* --- Segregation of duties (A.5.3) — Privileged Role Administrator
       held alongside any other privileged role. Same roleMembersByUser
       gathered just above for the leaver check; 'manual' rather than a
       guessed pass if that gathering came back empty (no role data
       readable at all, not "checked and found clean"). */
    if (!Object.keys(roleMembersByUser).length) {
      set('sod', 'manual', 'Could not read directory role membership — see the leaver check above for the same underlying read.');
    } else {
      var sod = window.CheckpointLib.segregationOfDutiesResult(roleMembersByUser);
      raw['sod'] = { offenders: sod.offenders };
      set('sod', sod.result, sod.note);
    }

    /* --- Risky users (Identity Protection — requires AAD Premium P2) --- */
    if (!capabilities.identityProtection.available) {
      set('riskyusers', 'manual', capabilities.identityProtection.note);
    } else {
      try {
        var risky = await gAll("/identityProtection/riskyUsers?$filter=riskState eq 'atRisk'&$select=id,userDisplayName,riskLevel,riskState,riskLastUpdatedDateTime&$top=999");
        raw['riskyusers'] = { riskyUsers: risky };
        var rn = risky.length;
        set('riskyusers', rn === 0 ? 'pass' : rn <= riskyUsersReviewMax ? 'review' : 'fail',
          rn + ' risky user(s) currently flagged and unresolved (review threshold: ' + riskyUsersReviewMax + ')');
      } catch (e) {
        set('riskyusers', 'review', 'Identity Protection not licensed or not readable: ' + e.message);
      }
    }

    /* --- Intune device compliance --- */
    if (!capabilities.intune.available) {
      set('device', 'manual', capabilities.intune.note);
      set('compliance-policy', 'manual', capabilities.intune.note);
      set('device-config', 'manual', capabilities.intune.note);
      set('device-checkin', 'manual', capabilities.intune.note);
    } else {
      try {
        /* lastSyncDateTime is added to the existing $select rather than
           fetched separately — same call, same permission, one more
           field, and it powers the device-checkin check below. */
        var devs = await gAll('/deviceManagement/managedDevices?$select=id,deviceName,operatingSystem,complianceState,lastSyncDateTime&$top=999');
        raw['device'] = { managedDevices: devs };
        if (!devs.length) {
          set('device', 'review', 'No Intune-managed devices found');
          set('device-checkin', 'review', 'No Intune-managed devices found');
        } else {
          var ok = devs.filter(function (d) { return d.complianceState === 'compliant'; }).length;
          var pct = Math.round(ok / devs.length * 100);
          set('device', pct >= deviceCompliancePassPct ? 'pass' : pct >= deviceComplianceReviewPct ? 'review' : 'fail',
            pct + '% of ' + devs.length + ' devices compliant (target ≥' + deviceCompliancePassPct + '%, review ≥' + deviceComplianceReviewPct + '%)');

          /* A device that has not contacted Intune in weeks is not
             managed in any meaningful sense — it is not receiving
             policy, configuration or updates, and its last reported
             compliance state is stale evidence rather than current
             evidence. That is a distinct finding from "reported
             non-compliant", which is why it is its own check: a fleet
             can read 100% compliant precisely BECAUSE the
             non-compliant devices stopped checking in. */
          var dc = window.CheckpointLib.deviceCheckinResult(devs, deviceStaleDays, Date.now());
          raw['device-checkin'] = { total: dc.total, stale: dc.stale, never: dc.never, staleDays: deviceStaleDays };
          set('device-checkin', dc.result,
            dc.stale || dc.never
              ? dc.stale + ' of ' + dc.total + ' device(s) have not checked in for over ' + deviceStaleDays + ' days' +
                (dc.never ? ' (' + dc.never + ' never have)' : '') + ' — their compliance state is stale evidence'
              : 'All ' + dc.total + ' managed device(s) checked in within ' + deviceStaleDays + ' days');
        }
      } catch (e) {
        set('device', 'review', 'Could not read Intune devices: ' + e.message);
        set('device-checkin', 'review', 'Could not read Intune devices: ' + e.message);
      }

      /* --- Device configuration profiles (A.8.9 configuration management)

         Uses DeviceManagementConfiguration.Read.All, which this app has
         requested at sign-in since long before tonight but never
         actually spent — a granted permission doing nothing.

         IMPORTANT: this check can pass or stay manual, but it can never
         FAIL on an empty result, and that is not timidity. Modern Intune
         tenants increasingly configure everything through the Settings
         Catalog (/deviceManagement/configurationPolicies), which is
         still BETA-only on Graph and therefore off-limits here. A
         Settings-Catalog-only tenant is thoroughly configured and would
         return zero classic profiles, so scoring absence as a failure
         would be a false accusation against exactly the tenants doing
         it the newer way. Absence means "cannot see", which is
         'manual'. */
      try {
        var cfgs = await g('/deviceManagement/deviceConfigurations?$select=id,displayName&$top=50');
        var cfgCount = (cfgs.value || []).length;
        raw['device-config'] = { profiles: cfgCount };
        set('device-config', cfgCount > 0 ? 'pass' : 'manual',
          cfgCount > 0
            ? cfgCount + ' device configuration profile' + (cfgCount === 1 ? '' : 's') + ' deployed (showing first page)'
            : 'No classic device configuration profiles found. Graph v1.0 cannot read Settings Catalog policies, so this is "not visible" rather than "not configured" — record how devices are configured if it is done that way.');
      } catch (e) {
        set('device-config', 'review', 'Could not read Intune device configuration profiles: ' + e.message);
      }

      try {
        var pols = await g('/deviceManagement/deviceCompliancePolicies?$select=id,displayName&$top=50');
        raw['compliance-policy'] = { compliancePolicies: pols.value || [] };
        var polCount = (pols.value || []).length;
        set('compliance-policy', polCount > 0 ? 'pass' : 'fail', polCount > 0 ? polCount + ' compliance polic' + (polCount === 1 ? 'y' : 'ies') + ' configured (showing first page)' : 'No Intune device compliance policies found');
      } catch (e) {
        set('compliance-policy', 'review', 'Could not read Intune compliance policies: ' + e.message);
      }
    }

    /* --- Risky OAuth app grants (high-privilege scopes) --- */
    try {
      var grants = await gAll('/oauth2PermissionGrants?$select=clientId,resourceId,scope,consentType&$top=999');
      var highPriv = ['Directory.ReadWrite.All', 'Mail.ReadWrite', 'Mail.Send', 'Files.ReadWrite.All', 'Sites.FullControl.All', 'User.ReadWrite.All'];
      var riskyGrants = grants.filter(function (g2) {
        var scopes = (g2.scope || '').split(' ');
        return scopes.some(function (s) { return highPriv.indexOf(s) > -1; });
      });
      var riskyGrantCount = riskyGrants.length;

      /* Resolve the app NAME behind each risky grant — otherwise a
         finding names nothing but a clientId GUID, which is useless to
         whoever has to act on it. Only the risky subset is resolved
         (a handful of grants, not all of them: most tenants have dozens
         of low-privilege consents nobody needs named), one direct
         GET /servicePrincipals/{id} per distinct clientId under the
         Directory.Read.All this app already holds — no new scope, no
         batch $filter query (and its ConsistencyLevel header
         requirements) to get wrong. A failed lookup is skipped, never
         invented: an unresolved app shows its id, not a guessed name. */
      var appNames = {};
      var riskyClientIds = riskyGrants.map(function (g2) { return g2.clientId; })
        .filter(function (id, i, arr) { return id && arr.indexOf(id) === i; });
      for (var ci = 0; ci < riskyClientIds.length; ci++) {
        try {
          var sp = await g('/servicePrincipals/' + riskyClientIds[ci] + '?$select=id,displayName,verifiedPublisher');
          var desc = window.CheckpointLib.describeServicePrincipal(sp);
          if (desc) appNames[riskyClientIds[ci]] = desc;
        } catch (e) { /* skip this app — under-report, never invent */ }
      }
      var namesFor = function (list) {
        return list.map(function (g2) { return appNames[g2.clientId]; }).filter(Boolean)
          .filter(function (n, i, arr) { return arr.indexOf(n) === i; });
      };

      raw['riskyapps'] = { oauthGrants: grants, appNames: appNames };
      var riskyNames = namesFor(riskyGrants);
      set('riskyapps', riskyGrantCount === 0 ? 'pass' : riskyGrantCount <= 3 ? 'review' : 'fail',
        riskyGrantCount + ' app grant(s) with a high-privilege scope (of ' + grants.length + ' total grants)' +
        (riskyNames.length ? ': ' + riskyNames.join(', ') : ''));

      /* oauth-consent mines consentType from the SAME grants array above
         — already selected, never scored. See lib.js for why a
         user-consented high-privilege grant is a distinct, worse
         signal than an admin-consented one. */
      raw['oauth-consent'] = { oauthGrants: grants, appNames: appNames };
      var consentRisk = window.CheckpointLib.oauthConsentRiskResult(grants);
      var userConsentedNames = namesFor(riskyGrants.filter(function (g2) { return g2.consentType === 'Principal'; }));
      set('oauth-consent', consentRisk.result,
        consentRisk.userConsented === 0
          ? 'No high-privilege OAuth grant was consented to by an end user without admin review'
          : consentRisk.userConsented + ' high-privilege OAuth grant(s) consented to directly by an end user, with no admin review (' + consentRisk.adminConsented + ' other high-privilege grant(s) were admin-consented)' +
            (userConsentedNames.length ? ': ' + userConsentedNames.join(', ') : ''));
    } catch (e) {
      set('riskyapps', 'review', 'Could not read OAuth app grants: ' + e.message);
      set('oauth-consent', 'review', 'Could not read OAuth app grants: ' + e.message);
    }

    /* --- Sensitivity labels (Microsoft Purview Information Protection) —
       classification & labelling evidence (ISO 27001 A.5.12/A.5.13).
       /me/... (delegated, SensitivityLabels.Read.All) returns the labels
       available to the signed-in admin, which for a tenant-wide
       label policy is the same set every user sees — the closest
       delegated-only equivalent to an org-wide label list Graph
       currently exposes (the app-permission-only /security/
       informationProtection/sensitivityLabels needs client-credentials
       auth this app never uses — see SETUP.md, delegated-only by
       design). isEnabled distinguishes a published label from one
       still in draft. */
    if (!capabilities.sensitivityLabels.available) {
      set('labels', 'manual', capabilities.sensitivityLabels.note);
    } else {
      try {
        var labels = await gAll('/me/security/informationProtection/sensitivityLabels?$select=id,name,isEnabled');
        raw['labels'] = { sensitivityLabels: labels };
        var activeLabels = labels.filter(function (l) { return l.isEnabled !== false; });
        if (!labels.length) {
          set('labels', 'fail', 'No sensitivity labels published — information is not being classified or labelled');
        } else if (!activeLabels.length) {
          set('labels', 'review', labels.length + ' sensitivity label(s) exist but none are enabled/published');
        } else {
          set('labels', 'pass', activeLabels.length + ' active sensitivity label(s) published (of ' + labels.length + ' total)');
        }
      } catch (e) {
        set('labels', 'review', 'Could not read sensitivity labels: ' + e.message);
      }
    }

    /* --- Entra Access Reviews — periodic access-rights review (ISO
       27001 A.5.18/A.8.2). Existence of at least one configured review
       is the signal, same "configuration exists" bar the
       compliance-policy check already uses — it doesn't confirm a
       cycle has actually completed, hence 'pass' rather than a
       stronger claim; a practitioner can verify recency from the
       Entra admin center link this check's note effectively points at
       (SETUP.md). */
    if (!capabilities.accessReviews.available) {
      set('access-review', 'manual', capabilities.accessReviews.note);
    } else {
      try {
        var reviews = await gAll('/identityGovernance/accessReviews/definitions?$select=id,displayName,status');
        raw['access-review'] = { accessReviewDefinitions: reviews };
        set('access-review', reviews.length ? 'pass' : 'fail',
          reviews.length ? reviews.length + ' access review definition(s) configured — verify at least one has completed a full review cycle recently'
            : 'No Entra Access Reviews configured — access rights are not being reviewed at a planned interval');
      } catch (e) {
        set('access-review', 'review', 'Could not read Access Reviews: ' + e.message);
      }
    }

    /* --- Lifecycle Workflows (Entra ID Governance) — joiner/leaver
       automation, ISO 27001 A.5.11/A.5.18/A.6.5, the same controls the
       leaver check reads Directory.Read.All for. This is the
       technically-enforced counterpart: leaver checks whether departed
       accounts were actually disabled and de-privileged; this checks
       whether that offboarding (and onboarding) is automated at all,
       rather than left to whoever remembers on the day. */
    if (!capabilities.lifecycleWorkflows.available) {
      set('lifecycle-workflows', 'manual', capabilities.lifecycleWorkflows.note);
    } else {
      try {
        var workflows = await gAll('/identityGovernance/lifecycleWorkflows/workflows?$select=id,displayName,isEnabled,category');
        raw['lifecycle-workflows'] = { workflows: workflows };
        var lw = window.CheckpointLib.lifecycleWorkflowsResult(workflows);
        set('lifecycle-workflows', lw.result,
          lw.total === 0
            ? 'No Lifecycle Workflows configured — joiner/leaver processing is not automated'
            : lw.enabled + ' of ' + lw.total + ' workflow(s) enabled — joiner ' + (lw.joiner ? 'automated' : 'not automated') +
              ', leaver ' + (lw.leaver ? 'automated' : 'not automated') + ', mover ' + (lw.mover ? 'automated' : 'not automated'));
      } catch (e) {
        set('lifecycle-workflows', 'review', 'Could not read Lifecycle Workflows: ' + e.message);
      }
    }

    /* --- External sharing (SharePoint/OneDrive tenant setting) — ISO
       27001 A.5.14/A.8.3. sharingCapability is the single tenant-wide
       control that decides whether a share link can go to literally
       anyone with no sign-in ('externalUserAndGuestSharing', the
       least restrictive) down to no external sharing at all
       ('disabled', the most restrictive) — a direct, unambiguous
       signal, unlike the DLP/encryption best-effort checks above. */
    if (!capabilities.sharePointSettings.available) {
      set('sharing', 'manual', capabilities.sharePointSettings.note);
    } else {
      try {
        var spSettings = await g('/admin/sharepoint/settings?$select=sharingCapability');
        raw['sharing'] = { sharingCapability: spSettings.sharingCapability };
        var cap = spSettings.sharingCapability;
        if (cap === 'disabled' || cap === 'existingExternalUserSharingOnly') {
          set('sharing', 'pass', 'External sharing is set to "' + cap + '" — no new external sharing without sign-in');
        } else if (cap === 'externalUserSharingOnly') {
          set('sharing', 'review', 'External sharing is set to "externalUserSharingOnly" — new guests can be invited, but must sign in or verify');
        } else {
          set('sharing', 'fail', 'External sharing is set to "' + (cap || 'unknown') + '" — anyone with a link can access shared content without signing in');
        }
      } catch (e) {
        set('sharing', 'review', 'Could not read SharePoint tenant sharing settings: ' + e.message);
      }
    }

    /* --- Secure Score driven checks --- */
    var ss = null;
    if (capabilities.secureScore.available) {
      try {
        var scores = await g('/security/secureScores?$top=1');
        ss = (scores.value || [])[0] || null;
      } catch (e) { /* handled below — fromSecureScore() already degrades a null ss to a clean 'manual' with its own specific note per check */ }
    }
    raw['patch'] = raw['macro'] = raw['logging'] = raw['wdac'] = raw['alerts'] = raw['dlp'] = raw['encryption'] = { secureScore: ss };

    /* Map our check ids → Secure Score control names (best-effort — these
       are still just name-based matches, never a guarantee the mapped
       control actually covers the same thing we mean by the check).
       'exact' = stable controlName identifiers, matched case-insensitively
       but as a whole value, not a substring — the confident case.
       'contains' = substring fallback for tenants/API versions where the
       exact identifier doesn't appear; lower confidence, same disclaimer
       either way. */
    var ssMap = {
      patch:   { exact: ['SecurityUpdates'],                                    contains: ['TVM'] },
      macro:   { exact: ['OfficeMacros', 'BlockMacros'],                        contains: ['macro'] },
      logging: { exact: ['AuditLog', 'UnifiedAuditLog'],                        contains: [] },
      wdac:    { exact: ['ApplicationControl'],                                 contains: ['WDAC', 'ASRRules'] },
      alerts:  { exact: ['SafeAttachments', 'SafeLinks', 'AntiPhishingPolicy'], contains: ['ThreatProtection'] },
      /* No verified exact controlName identifiers for these two (unlike
         the entries above) — Microsoft doesn't publish a stable list of
         Secure Score control names, and DLP/encryption coverage isn't
         exposed via any other Graph endpoint this app could call
         instead (see the comment on the old hardcoded 'dlp'/'labels'
         checks this replaced). 'exact' deliberately stays empty rather
         than guessing a wrong identifier and silently never matching —
         these two checks run purely on the substring fallback, so
         treat a pass/fail here as a weaker signal than the exact-match
         checks above and always verify in the Purview portal. */
      dlp:        { exact: [], contains: ['dlp', 'data loss prevention', 'sensitivity label', 'information protection'] },
      encryption: { exact: [], contains: ['encrypt', 'rights management', 'irm', 'byok'] }
    };
    function fromSecureScore(id, manualNote) {
      if (!ss || !ss.controlScores) { set(id, 'manual', manualNote); return; }
      var m = ssMap[id] || { exact: [], contains: [] };
      var exactHits = ss.controlScores.filter(function (c) {
        return m.exact.some(function (k) { return (c.controlName || '').toLowerCase() === k.toLowerCase(); });
      });
      var hits = exactHits.length ? exactHits : ss.controlScores.filter(function (c) {
        var name = (c.controlName || '') + ' ' + (c.controlCategory || '');
        return m.contains.some(function (k) { return name.toLowerCase().indexOf(k.toLowerCase()) > -1; });
      });
      /* no confident match at all — say so, don't guess a pass/fail */
      if (!hits.length) { set(id, 'manual', manualNote); return; }
      var pct = hits.reduce(function (s, c) {
        var max = c.controlMaximumScore || c.maxScore || 0;
        var cur = typeof c.score === 'number' ? c.score : 0;
        return s + (max ? cur / max : 0);
      }, 0) / hits.length * 100;
      var matchKind = exactHits.length ? 'exact controlName' : 'best-effort substring';
      set(id, pct >= 85 ? 'pass' : pct >= 45 ? 'review' : 'fail',
        Math.round(pct) + '% on ' + hits.length + ' related Secure Score control' + (hits.length > 1 ? 's' : '') +
        ' (' + matchKind + ' match on Secure Score control names — verify in portal)');
    }
    fromSecureScore('patch',      'Verify patch currency in Intune / Defender TVM');
    fromSecureScore('macro',      'Verify Office macro hardening policy');
    fromSecureScore('logging',    'Verify unified audit logging in Purview');
    fromSecureScore('wdac',       'Verify application control (WDAC / App Control for Business)');
    /* 'alerts' prefers a DIRECT read of the Defender XDR alert queue and
       only falls back to the Secure Score proxy below when Defender XDR
       is not available to this tenant.

       Direct-read-with-proxy-fallback rather than a straight
       replacement, deliberately: a tenant without Defender XDR keeps
       exactly the signal it had, so nobody loses coverage, while a
       licensed tenant stops being scored on a name match against
       Secure Score control identifiers and starts being scored on
       whether alerts are actually being worked. Same check, better
       evidence where the evidence exists. */
    var alertsScored = false;
    if (capabilities.defenderXdr.available) {
      try {
        var alertRows = await gAll("/security/alerts_v2?$filter=status eq 'newAlert' or status eq 'inProgress'&$select=id,severity,status,createdDateTime,assignedTo,serviceSource&$top=999");
        var at = window.CheckpointLib.alertTriageResult(alertRows, incidentTriageDays, Date.now());
        raw['alerts'] = { open: at.open, highUntouched: at.highUntouched, stale: at.stale, triageDays: incidentTriageDays, source: 'defenderXdr' };
        set('alerts', at.result, at.open === 0
          ? 'No open Defender XDR alerts awaiting triage'
          : at.open + ' open alert(s), ' + at.highUntouched + ' high severity never opened' +
            (at.stale ? '; ' + at.stale + ' untouched beyond the ' + incidentTriageDays + '-day triage window' : ''));
        alertsScored = true;
      } catch (e) {
        /* Fall through to the Secure Score proxy rather than failing the
           check — an unreadable alert queue is not evidence of anything. */
      }
    }
    if (!alertsScored) fromSecureScore('alerts', 'Verify Defender/Purview threat protection policies and alert triage cadence');
    fromSecureScore('dlp',        'Verify Data Loss Prevention policy coverage in Microsoft Purview');
    fromSecureScore('encryption', 'Verify encryption of sensitive content (Purview Message Encryption / sensitivity-label encryption)');

    /* --- Defender XDR incident triage ---

       The first check in Checkpoint that reads real incident records
       rather than inferring from a score. That matters for assurance:
       ISO 27001 A.5.26 and CPS 234's notification obligations are about
       whether incidents are actually RESPONDED TO, and until now the
       only signal for that was a practitioner ticking a box.

       Scored on the age of unresolved high-severity incidents, not on
       incident COUNT. A tenant with many incidents is not less compliant
       than one with none — often the opposite, since it means detection
       is working. What an auditor asks is whether the serious ones get
       worked within a defined timeframe, which is what this measures.

       Deliberately reads only 'active' incidents. A resolved incident is
       evidence the process works; a redirected one has been merged into
       another incident and would double-count. */
    if (!capabilities.defenderXdr.available) {
      set('xdr-incidents', 'manual', capabilities.defenderXdr.note);
    } else {
      try {
        var incidents = await gAll("/security/incidents?$filter=status eq 'active'&$select=id,severity,status,createdDateTime,assignedTo,classification&$top=999");
        /* Scoring lives in lib.js's incidentTriageResult() so it is unit
           testable without a Graph call; this function keeps the query
           and the human-readable note.

           index.html loads lib.js BEFORE graph.js precisely so this and
           the other CheckpointLib call sites in this file are safe at
           any point in the lifecycle, not just at scan time. */
        var tri = window.CheckpointLib.incidentTriageResult(incidents, incidentTriageDays, Date.now());
        raw['xdr-incidents'] = { active: tri.active, highOpen: tri.highOpen, overdue: tri.overdue, unassigned: tri.unassigned, triageDays: incidentTriageDays };
        var incidentNote = tri.active === 0
          ? 'No active incidents in the Defender XDR queue'
          : tri.active + ' active incident(s), ' + tri.highOpen + ' high severity' +
            (tri.overdue ? '; ' + tri.overdue + ' open beyond the ' + incidentTriageDays + '-day triage window' : '') +
            (tri.unassigned ? '; ' + tri.unassigned + ' high-severity unassigned' : '');
        set('xdr-incidents', tri.result, incidentNote);
      } catch (e) {
        set('xdr-incidents', 'review', 'Defender XDR incidents not readable: ' + e.message);
      }
    }

    /* --- Privacy: subject rights requests (Microsoft Priva) --- */
    if (!capabilities.priva.available) {
      set('privacy-srr', 'manual', capabilities.priva.note);
    } else {
      try {
        var srrs = await gAll('/security/subjectRightsRequests?$select=id,status,dueDateTime,createdDateTime,type&$top=999');
        var sr = window.CheckpointLib.subjectRightsResult(srrs, new Date().toISOString().slice(0, 10));
        raw['privacy-srr'] = sr;
        set('privacy-srr', sr.result, sr.open === 0
          ? 'No open subject rights requests'
          : sr.open + ' open request(s)' +
            (sr.overdue ? '; ' + sr.overdue + ' PAST their statutory due date' : '') +
            (sr.dueSoon ? '; ' + sr.dueSoon + ' due within 7 days' : ''));
      } catch (e) {
        set('privacy-srr', 'review', 'Subject rights requests not readable: ' + e.message);
      }
    }

    /* --- Privacy: retention & disposal (Microsoft Purview) --- */
    if (!capabilities.recordsManagement.available) {
      set('retention', 'manual', capabilities.recordsManagement.note);
    } else {
      try {
        var labels = await gAll('/security/labels/retentionLabels?$select=id,displayName,labelStatus,retentionDuration,actionAfterRetentionPeriod&$top=999');
        var rl = window.CheckpointLib.retentionLabelResult(labels);
        raw['retention'] = rl;
        set('retention', rl.result, rl.total === 0
          ? 'No retention labels configured — content is retained and deleted by nothing but habit'
          : rl.published + ' of ' + rl.total + ' retention label(s) published' +
            (rl.withDisposition ? ', ' + rl.withDisposition + ' with an end-of-retention action' : ', none with an end-of-retention action — retained content is never disposed of'));
      } catch (e) {
        set('retention', 'review', 'Retention labels not readable: ' + e.message);
      }
    }

    /* --- Checks with no MICROSOFT GRAPH signal ---

       These five are not unautomatable — they are scored from
       Checkpoint's own registers instead (Calendar, Documents, Vendors
       and Training), by app.js's applyTrainingCheckResult() and
       applyRegisterCheckResults() immediately after this function
       returns. See lib.js's backupCheckResult() and friends for the
       reasoning; the short version is that the evidence an auditor
       wants for "are backups tested" is a restore-test record, which is
       a Calendar row rather than anything Graph can answer.

       They are seeded 'manual' here anyway, deliberately, for two
       reasons. A stored scan detail stays self-consistent if it is ever
       read without the client-side pass having run; and 'manual' is the
       right answer for a tenant whose registers are empty, which is
       exactly what those functions return in that case. Never seeded
       'pass' — silence is not evidence. --- */
    set('backup',   'manual', 'Backup restore testing is scored from the Checkpoint calendar');
    set('bcp',      'manual', 'Continuity plan and failover testing are scored from the Checkpoint document register and calendar');
    set('supplier', 'manual', 'Supplier assessment currency is scored from the Checkpoint vendor register');
    set('policy',   'manual', 'Policy publication and review cadence are scored from the Checkpoint document register');
    set('training', 'manual', 'Security awareness training completion is scored from the Checkpoint training register');
    set('audit-review',     'manual', 'Independent review currency is scored from the Checkpoint audit programme');
    set('incident-lessons', 'manual', 'Post-incident write-up completeness is scored from the Checkpoint incident register');

    return { results: results, notes: notes, raw: raw, secureScore: ss ? { current: ss.currentScore, max: ss.maxScore } : null };
  }

  /* Signed-in tenant's identity — id (Entra tenant GUID), displayName,
     and verifiedDomains (every domain name this tenant has verified
     ownership of, e.g. 'contoso.com', 'contoso.onmicrosoft.com') — one
     Graph round trip both tenantName() (display only) and the
     activation system's tenant-binding check (app.js's
     tenantIdsFor()) build on, since an activation file's tenantId can
     legitimately be either the GUID or a verified domain. */
  var tenantInfoCache = null;
  async function tenantInfo(force) {
    if (tenantInfoCache && !force) return tenantInfoCache;
    try {
      var org = await g('/organization?$select=id,displayName,verifiedDomains');
      var o = org.value && org.value[0];
      tenantInfoCache = o ? {
        id: o.id, displayName: o.displayName || '',
        verifiedDomains: (o.verifiedDomains || []).map(function (v) { return v.name; }).filter(Boolean)
      } : null;
    } catch (e) { tenantInfoCache = null; }
    return tenantInfoCache;
  }

  /* Tenant display name for the topbar */
  async function tenantName() {
    var info = await tenantInfo();
    return (info && info.displayName) || '';
  }

  var MAX_SIMPLE_UPLOAD = 4 * 1024 * 1024; /* Graph's simple-PUT upload ceiling */
  var folderIdCache = {}; /* driveId|category -> folder item id, per session */

  /* Category folders keep evidence organised without practitioners
     inventing ad hoc structures per client. Created lazily on first
     upload into that category, then cached for the session. */
  async function ensureFolder(driveId, folderName) {
    var cacheKey = driveId + '|' + folderName;
    if (folderIdCache[cacheKey]) return folderIdCache[cacheKey];
    try {
      var existing = await g('/drives/' + driveId + '/root:/' + encodeURIComponent(folderName), { scopes: CONFIG.scopesProvision });
      folderIdCache[cacheKey] = existing.id;
      return existing.id;
    } catch (e) {
      if (e.status !== 404) throw e;
      var created = await g('/drives/' + driveId + '/root/children', {
        method: 'POST',
        body: { name: folderName, folder: {}, '@microsoft.graph.conflictBehavior': 'rename' },
        scopes: CONFIG.scopesProvision
      });
      folderIdCache[cacheKey] = created.id;
      return created.id;
    }
  }

  /* Real document storage for evidence/policies — a small file (<=4MB,
     which covers the vast majority of policy/evidence documents) goes
     straight up via a single PUT. Larger files are rejected with a
     clear message rather than silently failing or half-uploading. */
  async function uploadSmallFile(driveId, category, filename, file) {
    if (file.size > MAX_SIMPLE_UPLOAD) {
      throw new Error('File is larger than 4 MB — upload it directly in SharePoint, then paste its link as evidence instead.');
    }
    var folderId = await ensureFolder(driveId, category);
    var t = await token(CONFIG.scopesProvision);
    var url = 'https://graph.microsoft.com/v1.0/drives/' + driveId + '/items/' + folderId + ':/' + encodeURIComponent(filename) + ':/content';
    var res = await fetch(url, {
      method: 'PUT',
      headers: { Authorization: 'Bearer ' + t, 'Content-Type': file.type || 'application/octet-stream' },
      body: file
    });
    var j = await res.json().catch(function () { return {}; });
    if (!res.ok) throw new Error((j.error && j.error.message) || ('Upload failed: ' + res.status));
    return j;
  }

  /* Each returned file carries its underlying SharePoint list item's
     custom fields as `fields` — that's where the document-control
     register (DocOwner/DocVersion/DocStatus/... — see store.js's
     DOC_META_COLUMNS) lives. The $expand is attempted first and the
     plain query is used as a fallback, because a library whose
     register columns were never provisioned (an older tenant, or one
     whose admin locked the schema) can reject the expand outright;
     degrading to blank metadata is strictly better than an empty
     Documents view. */
  async function listDriveFiles(driveId) {
    var provisionOpts = { scopes: CONFIG.scopesProvision };
    var folders = await gAll('/drives/' + driveId + '/root/children?$select=id,name,folder&$top=200', provisionOpts);
    var out = [];
    var select = '$select=id,name,size,webUrl,lastModifiedDateTime';
    for (var i = 0; i < folders.length; i++) {
      var f = folders[i];
      if (!f.folder) continue; /* skip any stray root-level file uploaded before categorisation existed */
      var base = '/drives/' + driveId + '/items/' + f.id + '/children?' + select;
      var files;
      try {
        files = await gAll(base + ',listItem&$expand=listItem($expand=fields)&$orderby=lastModifiedDateTime desc&$top=200', provisionOpts);
      } catch (e) {
        files = await gAll(base + '&$orderby=lastModifiedDateTime desc&$top=200', provisionOpts);
      }
      /* eslint-disable-next-line no-loop-func */
      files.forEach(function (file) {
        if (!file.name) return;
        out.push({
          id: file.id, name: file.name, url: file.webUrl, size: file.size || 0,
          modified: (file.lastModifiedDateTime || '').slice(0, 10), category: f.name,
          fields: (file.listItem && file.listItem.fields) || {}
        });
      });
    }
    return out;
  }

  /* ============================================================
     Attestation audiences — who a policy has to be acknowledged by.
     Both read-only, both covered by the Directory.Read.All scope the
     app already requests at sign-in, so neither triggers a fresh
     consent prompt.
     ============================================================ */

  /* Enabled member accounts with a mailbox-shaped UPN. Guests
     (userType Guest) are excluded: an external collaborator is not
     "relevant personnel" under A.5.1, and including them would inflate
     every campaign's denominator with people who will never respond.
     Disabled accounts are excluded for the same reason — a leaver
     can't attest, and counting them makes a complete campaign look
     permanently incomplete. */
  async function listTenantUsers() {
    var opts = { scopes: CONFIG.scopesReadOnly };
    var users = await gAll('/users?$select=id,displayName,userPrincipalName,accountEnabled,userType,mail,jobTitle&$top=999', opts);
    return users
      .filter(function (u) { return u.accountEnabled !== false && u.userType !== 'Guest' && u.userPrincipalName; })
      .filter(function (u) { return u.userPrincipalName.indexOf('#EXT#') === -1; })
      .map(function (u) {
        return { id: u.id, name: u.displayName || u.userPrincipalName, upn: u.userPrincipalName, mail: u.mail || u.userPrincipalName, jobTitle: u.jobTitle || '' };
      })
      .sort(function (a, b) { return a.name.localeCompare(b.name); });
  }

  async function listTenantGroups() {
    var opts = { scopes: CONFIG.scopesReadOnly };
    var groups = await gAll('/groups?$select=id,displayName,mailNickname&$top=999', opts);
    return groups
      .map(function (g) { return { id: g.id, name: g.displayName || g.mailNickname || g.id }; })
      .sort(function (a, b) { return a.name.localeCompare(b.name); });
  }

  /* Transitive members so a campaign aimed at "All Staff" still reaches
     everyone when that group is built from nested department groups —
     the common shape in any tenant past a few dozen people, and a
     silent under-count is exactly the failure an attestation register
     must not have. */
  async function listGroupMembers(groupId) {
    var opts = { scopes: CONFIG.scopesReadOnly };
    var members = await gAll('/groups/' + groupId + '/transitiveMembers/microsoft.graph.user?$select=id,displayName,userPrincipalName,accountEnabled,userType,mail,jobTitle&$top=999', opts);
    return members
      .filter(function (u) { return u.accountEnabled !== false && u.userType !== 'Guest' && u.userPrincipalName; })
      .filter(function (u) { return u.userPrincipalName.indexOf('#EXT#') === -1; })
      .map(function (u) {
        return { id: u.id, name: u.displayName || u.userPrincipalName, upn: u.userPrincipalName, mail: u.mail || u.userPrincipalName, jobTitle: u.jobTitle || '' };
      })
      .sort(function (a, b) { return a.name.localeCompare(b.name); });
  }

  /* Writes custom columns onto the SharePoint list item behind a drive
     item — the document-control register's only write path. PATCH is a
     merge, so only the keys passed are touched. */
  async function setDriveItemFields(driveId, itemId, fields) {
    return g('/drives/' + driveId + '/items/' + itemId + '/listItem/fields', {
      method: 'PATCH', body: fields, scopes: CONFIG.scopesProvision
    });
  }

  /* Encodes a sharing URL (any SharePoint/OneDrive webUrl) into the
     token Graph's /shares API expects — documented, GA on v1.0:
     base64, converted to unpadded base64url, prefixed "u!". Lets a
     caller resolve a webUrl straight to a DriveItem without ever
     having stored that item's id — see fetchSharedItemField() below,
     which is exactly why this exists: Controls only ever persisted
     evidenceUrl (the webUrl captureAutoEvidence() got back from the
     upload), never the underlying driveItem id. */
  function encodeSharingUrl(url) {
    var b64 = btoa(unescape(encodeURIComponent(url)));
    var b64url = b64.replace(/=+$/, '').replace(/\//g, '_').replace(/\+/g, '-');
    return 'u!' + b64url;
  }

  /* Reads one custom SharePoint column back off the list item behind a
     webUrl — used by app.js's viewEvidence() to read the JSON
     Store.uploadDocument()'s meta param wrote alongside the
     auto-evidence file itself (see docFieldsFrom() in store.js).
     Deliberately NOT /driveItem/content: confirmed against a real
     tenant, that endpoint redirects to a storage URL that does not
     grant CORS to this app's origin, so a browser fetch() of it fails
     with an opaque network error ("Load failed"/"Failed to fetch")
     before any HTTP response is even seen — a structural limitation of
     reading file BYTES client-side via Graph, not something a retry or
     a header fixes. The driveItem's own JSON representation (this
     call) is a normal Graph resource with no such redirect, same as
     every other Graph call this app already makes successfully. */
  async function fetchSharedItemField(url, fieldName) {
    var j = await g('/shares/' + encodeSharingUrl(url) + '/driveItem?$expand=listItem($expand=fields)', { scopes: CONFIG.scopesProvision });
    var value = j.listItem && j.listItem.fields && j.listItem.fields[fieldName];
    if (!value) throw new Error('No ' + fieldName + ' recorded on this item — it may predate this feature.');
    return value;
  }

  /* Resolves a webUrl (any evidence link this app itself generated —
     a policy document, an uploaded file) to its @microsoft.graph.
     downloadUrl: confirmed via Microsoft's own Graph documentation, a
     short-lived, PRE-AUTHENTICATED URL — once Graph hands it back, no
     further sign-in is required to open it, unlike the document's own
     webUrl. That distinction is the whole point of using this: opening
     a bare SharePoint webUrl in a brand-new tab makes the browser do a
     fresh Microsoft sign-in handshake with SharePoint, and confirmed
     live, Safari's cross-site cookie blocking can strand that handshake
     on a blank page. A downloadUrl has no such handshake to strand —
     it serves the file directly. Callers fall back to the original
     webUrl on any failure (a non-Microsoft URL a human pasted in, a
     document this Graph session can't reach, ...), same as today. */
  async function fetchDownloadUrl(url) {
    var j = await g('/shares/' + encodeSharingUrl(url) + '/driveItem?$select=id,@microsoft.graph.downloadUrl', { scopes: CONFIG.scopesProvision });
    var downloadUrl = j['@microsoft.graph.downloadUrl'];
    if (!downloadUrl) throw new Error('Could not resolve a direct link for this file.');
    return downloadUrl;
  }

  /* Status update email — sent as the signed-in user, via their own
     delegated token. No backend, no service account: Graph's sendMail
     returns 202 with no body, so this uses its own fetch rather than
     g() (which expects a JSON body on success). */
  /* attachments (optional): an array of Graph fileAttachment objects
     ({'@odata.type':'#microsoft.graph.fileAttachment', name,
     contentType, contentBytes}) — used by the owner console's welcome-
     pack send (a quick-start guide, and a signed activation file when
     one was produced via the signing endpoint). Every existing caller
     (status-update email, digest, questionnaire send) passes 3 args and
     is unaffected — attachments is simply omitted from the request body
     when not given. */
  async function sendMail(toCsv, subject, htmlBody, attachments) {
    var recipients = toCsv.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
    if (!recipients.length) throw new Error('Enter at least one recipient email address.');
    var t = await token(CONFIG.scopesMail);
    var message = {
      subject: subject,
      body: { contentType: 'HTML', content: htmlBody },
      toRecipients: recipients.map(function (addr) { return { emailAddress: { address: addr } }; })
    };
    if (attachments && attachments.length) message.attachments = attachments;
    var res = await fetch('https://graph.microsoft.com/v1.0/me/sendMail', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: message, saveToSentItems: true })
    });
    if (!res.ok) {
      var j = await res.json().catch(function () { return {}; });
      throw new Error((j.error && j.error.message) || ('Send failed: ' + res.status));
    }
  }

  /* AI Governance discovery (only called while iso42001 is entitled —
     see app.js). Matches enterprise app (service principal) display
     names against known AI product/vendor keywords, reusing the same
     oauth2PermissionGrants data the riskyapps posture check already
     fetched that scan (passed in, not re-fetched) — the only new Graph
     call here is /servicePrincipals, covered by the same Directory.
     Read.All already in scopesReadOnly. Aggregates every grant per app
     so a high-privilege scope on ANY grant to that app is caught, not
     just whichever grant happened to be checked first. */
  var AI_KEYWORDS = [
    'copilot', 'openai', 'chatgpt', 'gpt-4', 'gpt-3', 'anthropic', 'claude',
    'gemini', 'bard', 'vertex ai', 'google ai', 'jasper', 'writer.com',
    'perplexity', 'midjourney', 'stability ai', 'stable diffusion',
    'hugging face', 'cohere', 'ai21', 'replicate', 'runwayml', 'synthesia',
    'elevenlabs', 'character.ai', 'you.com', 'poe', 'azure openai'
  ];
  var HIGH_PRIV_SCOPES = ['Directory.ReadWrite.All', 'Mail.ReadWrite', 'Mail.Send', 'Files.ReadWrite.All', 'Sites.FullControl.All', 'User.ReadWrite.All'];
  async function discoverAiSystems(oauthGrants) {
    var sps = await gAll('/servicePrincipals?$select=id,appId,displayName&$top=999');
    var byId = {};
    sps.forEach(function (sp) { byId[sp.id] = sp; });
    var byClient = {};
    (oauthGrants || []).forEach(function (g) {
      if (!byClient[g.clientId]) byClient[g.clientId] = [];
      byClient[g.clientId].push(g);
    });
    var candidates = [];
    Object.keys(byClient).forEach(function (clientId) {
      var sp = byId[clientId];
      if (!sp || !sp.displayName) return;
      var name = sp.displayName.toLowerCase();
      var matched = AI_KEYWORDS.find(function (k) { return name.indexOf(k) > -1; });
      if (!matched) return;
      var allScopes = [];
      byClient[clientId].forEach(function (g) { allScopes = allScopes.concat((g.scope || '').split(' ').filter(Boolean)); });
      var highPrivScopes = allScopes.filter(function (s) { return HIGH_PRIV_SCOPES.indexOf(s) > -1; });
      candidates.push({ id: sp.id, appId: sp.appId, name: sp.displayName, matchedKeyword: matched, scopes: allScopes, highPrivilegeScopes: highPrivScopes });
    });
    return candidates;
  }

  return {
    init: init, signIn: signIn, signOut: signOut, getAccount: getAccount,
    g: g, gAll: gAll, runPostureChecks: runPostureChecks, tenantName: tenantName, tenantInfo: tenantInfo,
    uploadSmallFile: uploadSmallFile, listDriveFiles: listDriveFiles,
    setDriveItemFields: setDriveItemFields, fetchSharedItemField: fetchSharedItemField, fetchDownloadUrl: fetchDownloadUrl, sendMail: sendMail,
    listTenantUsers: listTenantUsers, listTenantGroups: listTenantGroups, listGroupMembers: listGroupMembers,
    discoverAiSystems: discoverAiSystems, detectCapabilities: detectCapabilities,
    detectRole: detectRole, aiToken: aiToken, signingToken: signingToken, readOnlyToken: readOnlyToken
  };
})();
