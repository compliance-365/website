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
     Posture checks — each returns 'pass' | 'review' | 'fail'
     plus a human note. Checks that Graph cannot verify return
     'review' with a "verify manually" note; they are never
     silently marked pass.
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
    try {
      var role = await g("/directoryRoles(roleTemplateId='62e90394-69f5-4237-9190-012177145e10')/members?$select=id");
      var n = (role.value || []).length;
      set('admins', n <= 4 ? 'pass' : n <= 8 ? 'review' : 'fail', n + ' Global Administrator' + (n === 1 ? '' : 's'));
    } catch (e) {
      set('admins', 'review', 'Could not read directory roles: ' + e.message);
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
      backup:  []
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
    set('backup', 'review', 'Backup coverage and restore testing require manual verification');

    return { results: results, notes: notes, secureScore: ss ? { current: ss.currentScore, max: ss.maxScore } : null };
  }

  /* Tenant display name for the topbar */
  async function tenantName() {
    try {
      var org = await g('/organization?$select=displayName');
      return (org.value && org.value[0] && org.value[0].displayName) || '';
    } catch (e) { return ''; }
  }

  return {
    init: init, signIn: signIn, signOut: signOut, getAccount: getAccount,
    g: g, gAll: gAll, runPostureChecks: runPostureChecks, tenantName: tenantName
  };
})();
