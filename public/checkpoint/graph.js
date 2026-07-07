/* ============================================================
   Checkpoint — Microsoft Graph layer
   MSAL.js auth + read-only posture checks against the tenant.
   ============================================================ */
window.Graph = (function () {
  var CONFIG = window.CHECKPOINT_CONFIG;
  var msalApp = null, account = null;

  async function init() {
    if (!CONFIG.clientId) return false;
    msalApp = new msal.PublicClientApplication({
      auth: {
        clientId: CONFIG.clientId,
        authority: CONFIG.authority,
        redirectUri: location.origin + location.pathname
      },
      cache: { cacheLocation: 'localStorage' }
    });
    await msalApp.initialize();
    var accs = msalApp.getAllAccounts();
    if (accs.length) account = accs[0];
    return true;
  }

  async function signIn() {
    var res = await msalApp.loginPopup({ scopes: CONFIG.scopes, prompt: 'select_account' });
    account = res.account;
    return account;
  }

  function signOut() {
    var acc = account; account = null;
    return msalApp.logoutPopup({ account: acc });
  }

  function getAccount() { return account; }

  async function token() {
    try {
      return (await msalApp.acquireTokenSilent({ scopes: CONFIG.scopes, account: account })).accessToken;
    } catch (e) {
      var res = await msalApp.acquireTokenPopup({ scopes: CONFIG.scopes });
      account = res.account;
      return res.accessToken;
    }
  }

  /* Minimal Graph fetch. path is relative to v1.0 unless it starts with http. */
  async function g(path, opts) {
    opts = opts || {};
    var t = await token();
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
  async function gAll(path) {
    var out = [], url = path;
    while (url) {
      var j = await g(url);
      out = out.concat(j.value || []);
      url = j['@odata.nextLink'] || null;
    }
    return out;
  }

  /* ==========================================================
     Posture checks — each returns 'pass' | 'review' | 'fail' | 'manual'
     plus a human note. Checks Graph attempted but couldn't conclusively
     resolve return 'review'; checks with no Graph signal at all
     (CHECK_DEFS scored:false) return 'manual'. Neither is ever silently
     marked pass.
     ========================================================== */
  async function runPostureChecks(progress) {
    var results = {}, notes = {};
    function set(id, r, n) { results[id] = r; notes[id] = n || ''; if (progress) progress(id, r, n); }

    /* --- Conditional Access driven checks --- */
    var policies = [];
    try {
      policies = (await g('/identity/conditionalAccess/policies')).value || [];
    } catch (e) {
      set('mfa-all', 'review', 'Could not read Conditional Access policies: ' + e.message);
    }
    var enabled = policies.filter(function (p) { return p.state === 'enabled'; });

    if (policies.length || results['mfa-all'] === undefined) {
      var mfaAll = enabled.some(function (p) {
        var grants = (p.grantControls && p.grantControls.builtInControls) || [];
        var users = (p.conditions && p.conditions.users && p.conditions.users.includeUsers) || [];
        var hasStrength = p.grantControls && p.grantControls.authenticationStrength;
        return (grants.indexOf('mfa') > -1 || hasStrength) && users.indexOf('All') > -1;
      });
      set('mfa-all', mfaAll ? 'pass' : 'fail',
        mfaAll ? 'Tenant-wide MFA policy found' : 'No enabled CA policy requires MFA for all users');

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
      var role = await g("/directoryRoles(roleTemplateId='62e90394-69f5-4237-9190-012177145e10')/members?$select=id");
      gaMembers = role.value || [];
      var n = gaMembers.length;
      set('admins', n <= 4 ? 'pass' : n <= 8 ? 'review' : 'fail', n + ' Global Administrator' + (n === 1 ? '' : 's'));
    } catch (e) {
      set('admins', 'review', 'Could not read directory roles: ' + e.message);
    }

    /* --- PIM: are privileged roles permanent or time-bound/eligible? --- */
    try {
      var eligible = await g('/roleManagement/directory/roleEligibilityScheduleInstances?$select=id&$top=1');
      var eligibleCount = (eligible.value || []).length;
      if (eligibleCount > 0) {
        set('pim', 'pass', eligibleCount + ' eligible (PIM) role assignment(s) found');
      } else if (gaMembers.length) {
        set('pim', 'fail', 'No eligible (PIM) role assignments found — privileged roles appear to be permanent');
      } else {
        set('pim', 'review', 'Could not determine PIM usage');
      }
    } catch (e) {
      set('pim', 'review', 'PIM not licensed or not readable: ' + e.message);
    }

    /* --- Guest / external user count --- */
    try {
      var guests = await gAll("/users?$filter=userType eq 'Guest'&$select=id&$top=999");
      var gn = guests.length;
      set('guests', gn <= 25 ? 'pass' : gn <= 75 ? 'review' : 'fail', gn + ' guest user' + (gn === 1 ? '' : 's') + ' in the directory');
    } catch (e) {
      set('guests', 'review', 'Could not read guest users: ' + e.message);
    }

    /* --- Risky users (Identity Protection — requires AAD Premium P2) --- */
    try {
      var risky = await gAll("/identityProtection/riskyUsers?$filter=riskState eq 'atRisk'&$select=id&$top=999");
      var rn = risky.length;
      set('riskyusers', rn === 0 ? 'pass' : rn <= 3 ? 'review' : 'fail', rn + ' risky user(s) currently flagged and unresolved');
    } catch (e) {
      set('riskyusers', 'review', 'Identity Protection not licensed or not readable: ' + e.message);
    }

    /* --- Intune device compliance --- */
    try {
      var devs = await gAll('/deviceManagement/managedDevices?$select=complianceState&$top=999');
      if (!devs.length) {
        set('device', 'review', 'No Intune-managed devices found');
      } else {
        var ok = devs.filter(function (d) { return d.complianceState === 'compliant'; }).length;
        var pct = Math.round(ok / devs.length * 100);
        set('device', pct >= 95 ? 'pass' : pct >= 80 ? 'review' : 'fail',
          pct + '% of ' + devs.length + ' devices compliant');
      }
    } catch (e) {
      set('device', 'review', 'Could not read Intune devices: ' + e.message);
    }

    /* --- Device compliance policies configured at all --- */
    try {
      var pols = await g('/deviceManagement/deviceCompliancePolicies?$select=id&$top=1');
      var polCount = (pols.value || []).length;
      set('compliance-policy', polCount > 0 ? 'pass' : 'fail', polCount > 0 ? polCount + ' compliance polic' + (polCount === 1 ? 'y' : 'ies') + ' configured (showing first page)' : 'No Intune device compliance policies found');
    } catch (e) {
      set('compliance-policy', 'review', 'Could not read Intune compliance policies: ' + e.message);
    }

    /* --- Risky OAuth app grants (high-privilege scopes) --- */
    try {
      var grants = await gAll('/oauth2PermissionGrants?$select=scope&$top=999');
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
    try {
      var scores = await g('/security/secureScores?$top=1');
      ss = (scores.value || [])[0] || null;
    } catch (e) { /* handled below */ }

    /* Map Secure Score control names → our check ids (best-effort). */
    var ssMap = {
      patch:   ['SecurityUpdates', 'TVM'],
      macro:   ['OfficeMacros', 'BlockMacros', 'macro'],
      logging: ['AuditLog', 'UnifiedAuditLog'],
      wdac:    ['ApplicationControl', 'WDAC', 'ASRRules'],
      alerts:  ['SafeAttachments', 'SafeLinks', 'AntiPhishingPolicy', 'ThreatProtection']
    };
    function fromSecureScore(id, manualNote) {
      if (!ss || !ss.controlScores) { set(id, 'review', manualNote); return; }
      var keys = ssMap[id] || [];
      var hits = ss.controlScores.filter(function (c) {
        var name = (c.controlName || '') + ' ' + (c.controlCategory || '');
        return keys.some(function (k) { return name.toLowerCase().indexOf(k.toLowerCase()) > -1; });
      });
      if (!hits.length) { set(id, 'review', manualNote); return; }
      var pct = hits.reduce(function (s, c) {
        var max = c.controlMaximumScore || c.maxScore || 0;
        var cur = typeof c.score === 'number' ? c.score : 0;
        return s + (max ? cur / max : 0);
      }, 0) / hits.length * 100;
      set(id, pct >= 85 ? 'pass' : pct >= 45 ? 'review' : 'fail',
        Math.round(pct) + '% on ' + hits.length + ' related Secure Score control' + (hits.length > 1 ? 's' : ''));
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

    return { results: results, notes: notes, secureScore: ss ? { current: ss.currentScore, max: ss.maxScore } : null };
  }

  /* Tenant display name for the topbar */
  async function tenantName() {
    try {
      var org = await g('/organization?$select=displayName');
      return (org.value && org.value[0] && org.value[0].displayName) || '';
    } catch (e) { return ''; }
  }

  var MAX_SIMPLE_UPLOAD = 4 * 1024 * 1024; /* Graph's simple-PUT upload ceiling */

  /* Real document storage for evidence/policies — a small file (<=4MB,
     which covers the vast majority of policy/evidence documents) goes
     straight up via a single PUT. Larger files are rejected with a
     clear message rather than silently failing or half-uploading. */
  async function uploadSmallFile(driveId, filename, file) {
    if (file.size > MAX_SIMPLE_UPLOAD) {
      throw new Error('File is larger than 4 MB — upload it directly in SharePoint, then paste its link as evidence instead.');
    }
    var t = await token();
    var url = 'https://graph.microsoft.com/v1.0/drives/' + driveId + '/root:/' + encodeURIComponent(filename) + ':/content';
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
    var out = [], url = '/drives/' + driveId + '/root/children?$select=id,name,size,webUrl,lastModifiedDateTime&$orderby=lastModifiedDateTime desc&$top=200';
    return (await gAll(url));
  }

  return {
    init: init, signIn: signIn, signOut: signOut, getAccount: getAccount,
    g: g, gAll: gAll, runPostureChecks: runPostureChecks, tenantName: tenantName,
    uploadSmallFile: uploadSmallFile, listDriveFiles: listDriveFiles
  };
})();
