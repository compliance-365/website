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
    var j = await res.json();
    if (!res.ok) {
      var err = new Error((j.error && j.error.message) || ('Graph error ' + res.status));
      err.code = j.error && j.error.code;
      err.status = res.status;
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
      note: 'Secure Score is unavailable — patch, macro, logging, application-control and alerting checks will show as Manual.' }
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
    if (!capabilities.conditionalAccess.available) {
      set('mfa-all', 'manual', capabilities.conditionalAccess.note);
      set('legacy', 'manual', capabilities.conditionalAccess.note);
      set('mfa-priv', 'manual', capabilities.conditionalAccess.note);
    } else {
      try {
        policies = (await g('/identity/conditionalAccess/policies')).value || [];
      } catch (e) {
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
    } else {
      try {
        var devs = await gAll('/deviceManagement/managedDevices?$select=id,deviceName,operatingSystem,complianceState&$top=999');
        raw['device'] = { managedDevices: devs };
        if (!devs.length) {
          set('device', 'review', 'No Intune-managed devices found');
        } else {
          var ok = devs.filter(function (d) { return d.complianceState === 'compliant'; }).length;
          var pct = Math.round(ok / devs.length * 100);
          set('device', pct >= deviceCompliancePassPct ? 'pass' : pct >= deviceComplianceReviewPct ? 'review' : 'fail',
            pct + '% of ' + devs.length + ' devices compliant (target ≥' + deviceCompliancePassPct + '%, review ≥' + deviceComplianceReviewPct + '%)');
        }
      } catch (e) {
        set('device', 'review', 'Could not read Intune devices: ' + e.message);
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
      raw['riskyapps'] = { oauthGrants: grants };
      var highPriv = ['Directory.ReadWrite.All', 'Mail.ReadWrite', 'Mail.Send', 'Files.ReadWrite.All', 'Sites.FullControl.All', 'User.ReadWrite.All'];
      var riskyGrantCount = grants.filter(function (g2) {
        var scopes = (g2.scope || '').split(' ');
        return scopes.some(function (s) { return highPriv.indexOf(s) > -1; });
      }).length;
      set('riskyapps', riskyGrantCount === 0 ? 'pass' : riskyGrantCount <= 3 ? 'review' : 'fail',
        riskyGrantCount + ' app grant(s) with a high-privilege scope (of ' + grants.length + ' total grants)');
    } catch (e) {
      set('riskyapps', 'review', 'Could not read OAuth app grants: ' + e.message);
    }

    /* --- Secure Score driven checks --- */
    var ss = null;
    if (capabilities.secureScore.available) {
      try {
        var scores = await g('/security/secureScores?$top=1');
        ss = (scores.value || [])[0] || null;
      } catch (e) { /* handled below — fromSecureScore() already degrades a null ss to a clean 'manual' with its own specific note per check */ }
    }
    raw['patch'] = raw['macro'] = raw['logging'] = raw['wdac'] = raw['alerts'] = { secureScore: ss };

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
      alerts:  { exact: ['SafeAttachments', 'SafeLinks', 'AntiPhishingPolicy'], contains: ['ThreatProtection'] }
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
    fromSecureScore('patch',   'Verify patch currency in Intune / Defender TVM');
    fromSecureScore('macro',   'Verify Office macro hardening policy');
    fromSecureScore('logging', 'Verify unified audit logging in Purview');
    fromSecureScore('wdac',    'Verify application control (WDAC / App Control for Business)');
    fromSecureScore('alerts',  'Verify Defender/Purview threat protection policies and alert triage cadence');

    /* --- Checks with no Graph signal at all — always "manual", never
       silently marked pass. Recorded here so the stored scan detail is
       self-consistent even though checkResult() also forces this. --- */
    set('dlp',      'manual', 'Sensitivity labels and DLP policy coverage require manual verification in Microsoft Purview');
    set('sharing',  'manual', 'External sharing settings require manual verification in the SharePoint admin center');
    set('backup',   'manual', 'Backup coverage and restore testing require manual verification');
    set('bcp',      'manual', 'Business continuity / disaster recovery plan requires manual verification');
    set('supplier', 'manual', 'Supplier security assessment currency requires manual verification');
    set('policy',   'manual', 'Information security policy publication & review cadence require manual verification');
    set('training', 'manual', 'Security awareness training completion requires manual verification');

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

  async function listDriveFiles(driveId) {
    var provisionOpts = { scopes: CONFIG.scopesProvision };
    var folders = await gAll('/drives/' + driveId + '/root/children?$select=id,name,folder&$top=200', provisionOpts);
    var out = [];
    for (var i = 0; i < folders.length; i++) {
      var f = folders[i];
      if (!f.folder) continue; /* skip any stray root-level file uploaded before categorisation existed */
      var files = await gAll('/drives/' + driveId + '/items/' + f.id + '/children?$select=id,name,size,webUrl,lastModifiedDateTime&$orderby=lastModifiedDateTime desc&$top=200', provisionOpts);
      files.forEach(function (file) {
        if (!file.name) return;
        out.push({ name: file.name, url: file.webUrl, size: file.size || 0, modified: (file.lastModifiedDateTime || '').slice(0, 10), category: f.name });
      });
    }
    return out;
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
    uploadSmallFile: uploadSmallFile, listDriveFiles: listDriveFiles, sendMail: sendMail,
    discoverAiSystems: discoverAiSystems, detectCapabilities: detectCapabilities,
    detectRole: detectRole, aiToken: aiToken, signingToken: signingToken
  };
})();
