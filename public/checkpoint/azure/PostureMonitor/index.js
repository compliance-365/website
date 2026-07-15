/* Checkpoint — scheduled posture monitor.
 *
 * Runs entirely inside the CLIENT tenant (this Function App is deployed
 * into their Azure subscription, not Compliance365's). It authenticates
 * to Microsoft Graph with application (client-credentials) permissions —
 * no user is present for a timer trigger — re-runs the same posture
 * checks the interactive browser app runs, writes a Scan record to the
 * "Checkpoint Scans" SharePoint list, and appends a row to "Checkpoint
 * Alerts" for every check that scored 'pass' on the previous scan and
 * 'fail' on this one.
 *
 * This intentionally mirrors public/checkpoint/graph.js's
 * runPostureChecks() and public/checkpoint/store.js's CHECK_DEFS/
 * threshold-settings logic. There is no shared module between the
 * browser bundle and this Function (different runtimes, different auth
 * models) — if you change one, change the other and note it in both
 * places. See ../README.md for the app-role justification for every
 * permission this identity holds.
 */

const GRAPH = 'https://graph.microsoft.com/v1.0';

/* Most of CHECK_DEFS's scored:true entries in store.js — the
   scored:false checks (backup, bcp, supplier, policy, training) have
   no Graph signal at all and are deliberately left out of both files.
   Two scored:true, capability-backed checks are ALSO deliberately not
   mirrored here, both for the same shape of reason — an app-only,
   client-credentials identity can't reuse the delegated call the
   interactive browser app makes:
     - 'labels': its signal comes from /me/security/informationProtection/
       sensitivityLabels (graph.js), which needs a signed-in user.
       The app-permission alternative (/security/informationProtection/
       sensitivityLabels + InformationProtectionPolicy.Read.All) is
       described in real-world reports as inconsistent under app-only
       auth.
     - 'sharing': /admin/sharepoint/settings requires the CALLING
       IDENTITY to hold the SharePoint Administrator role — a
       delegated-user role assignment that has no clean equivalent for
       a client-credentials service principal.
   Rather than ship an unattended timer trigger against an endpoint
   nobody's confident works unattended, both stay interactive-app-only
   for now; this Function reports them as absent from Detail, same as
   any other check it doesn't run. */
const SCORED_CHECK_IDS = [
  'mfa-all', 'mfa-priv', 'legacy', 'admins', 'pim', 'guests', 'riskyusers', 'access-review',
  'device', 'compliance-policy', 'patch', 'wdac', 'macro', 'riskyapps', 'dlp', 'encryption',
  'logging', 'alerts'
];
const CHECK_LABELS = {
  'mfa-all': 'MFA enforced — all users',
  'mfa-priv': 'Phishing-resistant MFA — privileged roles',
  'legacy': 'Legacy authentication blocked',
  'admins': 'Global admin count within threshold',
  'pim': 'Privileged roles use eligible (PIM) assignment',
  'guests': 'External guest user count within threshold',
  'riskyusers': 'Risky sign-ins & risky users addressed',
  'access-review': 'Periodic access-rights review configured',
  'device': 'Device compliance policies enforced',
  'compliance-policy': 'Compliance policies configured for the device fleet',
  'patch': 'OS & application patch currency',
  'wdac': 'Application control (WDAC) deployed',
  'macro': 'Office macro settings hardened',
  'riskyapps': 'No high-privilege, unreviewed OAuth app grants',
  'dlp': 'Data loss prevention policy coverage',
  'encryption': 'Sensitive content encryption in use',
  'logging': 'Unified audit logging enabled',
  'alerts': 'Security alerts triaged & threat protection enabled'
};

async function getAppToken(context) {
  const tenantId = process.env.TENANT_ID;
  const url = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    client_id: process.env.CLIENT_ID,
    client_secret: process.env.CLIENT_SECRET,
    scope: 'https://graph.microsoft.com/.default',
    grant_type: 'client_credentials'
  });
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
  if (!res.ok) throw new Error('Token request failed: ' + res.status + ' ' + await res.text());
  return (await res.json()).access_token;
}

function graphClient(token) {
  async function g(path, opts) {
    opts = opts || {};
    const res = await fetch(path.indexOf('http') === 0 ? path : GRAPH + path, {
      method: opts.method || 'GET',
      headers: Object.assign({ Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, opts.headers || {}),
      body: opts.body ? JSON.stringify(opts.body) : undefined
    });
    if (!res.ok) { const e = new Error('Graph ' + res.status + ' on ' + path + ': ' + await res.text()); e.status = res.status; throw e; }
    if (res.status === 204) return null;
    return res.json();
  }
  async function gAll(path) {
    let out = [], next = path;
    while (next) {
      const page = await g(next);
      out = out.concat(page.value || []);
      next = page['@odata.nextLink'] || null;
    }
    return out;
  }
  return { g, gAll };
}

async function resolveSiteId(g) {
  const hostname = process.env.SP_HOSTNAME;
  const sitePath = process.env.SP_SITE_PATH || '';
  if (!hostname) return (await g('/sites/root?$select=id')).id;
  const path = sitePath ? `/sites/${hostname}:${sitePath}?$select=id` : `/sites/${hostname}?$select=id`;
  return (await g(path)).id;
}

async function resolveLists(g, siteId) {
  const prefix = process.env.LIST_PREFIX || 'Checkpoint';
  const lists = await g(`/sites/${siteId}/lists?$select=id,displayName&$top=200`);
  const byName = {};
  (lists.value || []).forEach(l => { byName[l.displayName] = l.id; });
  const need = ['Scans', 'Alerts', 'Settings'];
  const ids = {};
  need.forEach(n => {
    const full = prefix + ' ' + n;
    if (!byName[full]) throw new Error(`List "${full}" not found — has the browser app been run at least once to provision the Checkpoint lists in this site?`);
    ids[n] = byName[full];
  });
  return ids;
}

async function readSettings(g, siteId, settingsListId) {
  const items = await g(`/sites/${siteId}/lists/${settingsListId}/items?$expand=fields&$top=999`);
  const settings = {};
  (items.value || []).forEach(i => { if (i.fields && i.fields.SettingKey) settings[i.fields.SettingKey] = i.fields.SettingValue; });
  return settings;
}

function numSetting(settings, key, def) {
  const v = settings[key];
  const n = (v !== undefined && v !== null && v !== '') ? Number(v) : NaN;
  return isNaN(n) ? def : n;
}

/* Mirrors graph.js's runPostureChecks() — see that file for the
   line-by-line rationale behind each check; comments here are kept
   short since the full reasoning lives there. */
async function runPostureChecks(g, gAll, settings) {
  const results = {}, notes = {};
  function set(id, r, n) { results[id] = r; notes[id] = n || ''; }

  const maxGlobalAdmins = numSetting(settings, 'maxGlobalAdmins', 4);
  const maxGuests = numSetting(settings, 'maxGuests', 25);
  const maxPermanentPrivileged = numSetting(settings, 'maxPermanentPrivileged', 0);
  const deviceCompliancePassPct = numSetting(settings, 'deviceCompliancePassPct', 95);
  const deviceComplianceReviewPct = numSetting(settings, 'deviceComplianceReviewPct', 80);
  const riskyUsersReviewMax = numSetting(settings, 'riskyUsersReviewMax', 3);

  let policies = [];
  try { policies = (await g('/identity/conditionalAccess/policies')).value || []; }
  catch (e) { set('mfa-all', 'review', 'Could not read Conditional Access policies: ' + e.message); }
  const enabled = policies.filter(p => p.state === 'enabled');

  if (policies.length || results['mfa-all'] === undefined) {
    const mfaPolicy = enabled.find(p => {
      const grants = (p.grantControls && p.grantControls.builtInControls) || [];
      const users = (p.conditions && p.conditions.users && p.conditions.users.includeUsers) || [];
      const hasStrength = p.grantControls && p.grantControls.authenticationStrength;
      return (grants.indexOf('mfa') > -1 || hasStrength) && users.indexOf('All') > -1;
    });
    if (!mfaPolicy) {
      set('mfa-all', 'fail', 'No enabled CA policy requires MFA for all users');
    } else {
      const mfaCond = (mfaPolicy.conditions && mfaPolicy.conditions.users) || {};
      const exTotal = (mfaCond.excludeUsers || []).length + (mfaCond.excludeGroups || []).length + (mfaCond.excludeRoles || []).length;
      set('mfa-all', exTotal > 0 ? 'review' : 'pass',
        exTotal > 0 ? 'MFA required for All users, but ' + exTotal + ' principal(s)/group(s)/role(s) excluded — verify break-glass only' : 'Tenant-wide MFA policy found with no exclusions');
    }

    const legacy = enabled.some(p => {
      const apps = (p.conditions && p.conditions.clientAppTypes) || [];
      const grants = (p.grantControls && p.grantControls.builtInControls) || [];
      return grants.indexOf('block') > -1 && (apps.indexOf('exchangeActiveSync') > -1 || apps.indexOf('other') > -1);
    });
    set('legacy', legacy ? 'pass' : 'fail', legacy ? 'Legacy authentication is blocked by CA policy' : 'No CA policy blocks legacy authentication');

    const priv = enabled.some(p => {
      const roles = (p.conditions && p.conditions.users && p.conditions.users.includeRoles) || [];
      const strength = p.grantControls && p.grantControls.authenticationStrength;
      const grants = (p.grantControls && p.grantControls.builtInControls) || [];
      return roles.length > 0 && (strength || grants.indexOf('mfa') > -1);
    });
    const privStrong = enabled.some(p => {
      const roles = (p.conditions && p.conditions.users && p.conditions.users.includeRoles) || [];
      return roles.length > 0 && p.grantControls && p.grantControls.authenticationStrength;
    });
    set('mfa-priv', privStrong ? 'pass' : priv ? 'review' : 'fail',
      privStrong ? 'Authentication-strength policy covers privileged roles' : priv ? 'Privileged roles require MFA, but not a phishing-resistant method' : 'No CA policy targets privileged directory roles');
  }

  try {
    const role = await g("/directoryRoles(roleTemplateId='62e90394-69f5-4237-9190-012177145e10')/members?$select=id");
    const n = (role.value || []).length;
    set('admins', n <= maxGlobalAdmins ? 'pass' : n <= maxGlobalAdmins * 2 ? 'review' : 'fail',
      n + ' Global Administrator' + (n === 1 ? '' : 's') + ' (target ≤' + maxGlobalAdmins + ' — Microsoft recommends 2–4 emergency-access/Global Admin accounts)');
  } catch (e) { set('admins', 'review', 'Could not read directory roles: ' + e.message); }

  try {
    const PIM_PASS = maxPermanentPrivileged, PIM_REVIEW = maxPermanentPrivileged + 3;
    const permInstances = await gAll('/roleManagement/directory/roleAssignmentScheduleInstances?$select=id,assignmentType&$top=999');
    const eligInstances = await gAll('/roleManagement/directory/roleEligibilityScheduleInstances?$select=id&$top=999');
    const permanentCount = permInstances.filter(i => i.assignmentType === 'Assigned').length;
    const eligibleCount = eligInstances.length;
    const total = permanentCount + eligibleCount;
    if (total === 0) set('pim', 'review', 'No privileged role assignments found — could not determine PIM usage');
    else set('pim', permanentCount <= PIM_PASS ? 'pass' : permanentCount <= PIM_REVIEW ? 'review' : 'fail',
      eligibleCount + ' of ' + total + ' privileged assignment(s) are eligible (PIM); ' + permanentCount + ' remain permanent (target ≤' + maxPermanentPrivileged + ' permanent)');
  } catch (e) { set('pim', 'review', 'PIM not licensed or not readable: ' + e.message); }

  try {
    const guests = await gAll("/users?$filter=userType eq 'Guest'&$select=id&$top=999");
    const gn = guests.length;
    set('guests', gn <= maxGuests ? 'pass' : gn <= maxGuests * 3 ? 'review' : 'fail', gn + ' guest user' + (gn === 1 ? '' : 's') + ' in the directory (target ≤' + maxGuests + ')');
  } catch (e) { set('guests', 'review', 'Could not read guest users: ' + e.message); }

  try {
    const risky = await gAll("/identityProtection/riskyUsers?$filter=riskState eq 'atRisk'&$select=id&$top=999");
    const rn = risky.length;
    set('riskyusers', rn === 0 ? 'pass' : rn <= riskyUsersReviewMax ? 'review' : 'fail', rn + ' risky user(s) currently flagged and unresolved (review threshold: ' + riskyUsersReviewMax + ')');
  } catch (e) { set('riskyusers', 'review', 'Identity Protection not licensed or not readable: ' + e.message); }

  try {
    const devs = await gAll('/deviceManagement/managedDevices?$select=complianceState&$top=999');
    if (!devs.length) set('device', 'review', 'No Intune-managed devices found');
    else {
      const ok = devs.filter(d => d.complianceState === 'compliant').length;
      const pct = Math.round(ok / devs.length * 100);
      set('device', pct >= deviceCompliancePassPct ? 'pass' : pct >= deviceComplianceReviewPct ? 'review' : 'fail', pct + '% of ' + devs.length + ' devices compliant');
    }
  } catch (e) { set('device', 'review', 'Could not read Intune devices: ' + e.message); }

  try {
    const pols = await g('/deviceManagement/deviceCompliancePolicies?$select=id&$top=1');
    const n = (pols.value || []).length;
    set('compliance-policy', n > 0 ? 'pass' : 'fail', n > 0 ? n + ' compliance polic' + (n === 1 ? 'y' : 'ies') + ' configured (showing first page)' : 'No Intune device compliance policies found');
  } catch (e) { set('compliance-policy', 'review', 'Could not read Intune compliance policies: ' + e.message); }

  try {
    const grants = await gAll('/oauth2PermissionGrants?$select=scope&$top=999');
    const highPriv = ['Directory.ReadWrite.All', 'Mail.ReadWrite', 'Mail.Send', 'Files.ReadWrite.All', 'Sites.FullControl.All', 'User.ReadWrite.All'];
    const riskyCount = grants.filter(g2 => (g2.scope || '').split(' ').some(s => highPriv.indexOf(s) > -1)).length;
    set('riskyapps', riskyCount === 0 ? 'pass' : riskyCount <= 3 ? 'review' : 'fail', riskyCount + ' app grant(s) with a high-privilege scope (of ' + grants.length + ' total grants)');
  } catch (e) { set('riskyapps', 'review', 'Could not read OAuth app grants: ' + e.message); }

  try {
    const reviews = await gAll('/identityGovernance/accessReviews/definitions?$select=id&$top=999');
    set('access-review', reviews.length ? 'pass' : 'fail',
      reviews.length ? reviews.length + ' access review definition(s) configured — verify at least one has completed a full review cycle recently'
        : 'No Entra Access Reviews configured — access rights are not being reviewed at a planned interval');
  } catch (e) { set('access-review', 'review', 'Access Reviews not licensed or not readable: ' + e.message); }

  let ss = null;
  try { const scores = await g('/security/secureScores?$top=1'); ss = (scores.value || [])[0] || null; } catch (e) { /* handled below */ }
  const ssMap = {
    patch: { exact: ['SecurityUpdates'], contains: ['TVM'] },
    macro: { exact: ['OfficeMacros', 'BlockMacros'], contains: ['macro'] },
    logging: { exact: ['AuditLog', 'UnifiedAuditLog'], contains: [] },
    wdac: { exact: ['ApplicationControl'], contains: ['WDAC', 'ASRRules'] },
    alerts: { exact: ['SafeAttachments', 'SafeLinks', 'AntiPhishingPolicy'], contains: ['ThreatProtection'] },
    /* No verified exact controlName identifiers for these two — see
       graph.js's ssMap comment (this Function mirrors it verbatim). */
    dlp: { exact: [], contains: ['dlp', 'data loss prevention', 'sensitivity label', 'information protection'] },
    encryption: { exact: [], contains: ['encrypt', 'rights management', 'irm', 'byok'] }
  };
  function fromSecureScore(id, manualNote) {
    if (!ss || !ss.controlScores) { set(id, 'manual', manualNote); return; }
    const m = ssMap[id] || { exact: [], contains: [] };
    const exactHits = ss.controlScores.filter(c => m.exact.some(k => (c.controlName || '').toLowerCase() === k.toLowerCase()));
    const hits = exactHits.length ? exactHits : ss.controlScores.filter(c => {
      const name = (c.controlName || '') + ' ' + (c.controlCategory || '');
      return m.contains.some(k => name.toLowerCase().indexOf(k.toLowerCase()) > -1);
    });
    if (!hits.length) { set(id, 'manual', manualNote); return; }
    const pct = hits.reduce((s, c) => { const max = c.controlMaximumScore || c.maxScore || 0; const cur = typeof c.score === 'number' ? c.score : 0; return s + (max ? cur / max : 0); }, 0) / hits.length * 100;
    const matchKind = exactHits.length ? 'exact controlName' : 'best-effort substring';
    set(id, pct >= 85 ? 'pass' : pct >= 45 ? 'review' : 'fail', Math.round(pct) + '% on ' + hits.length + ' related Secure Score control' + (hits.length > 1 ? 's' : '') + ' (' + matchKind + ' match — verify in portal)');
  }
  fromSecureScore('patch', 'Verify patch currency in Intune / Defender TVM');
  fromSecureScore('macro', 'Verify Office macro hardening policy');
  fromSecureScore('logging', 'Verify unified audit logging in Purview');
  fromSecureScore('wdac', 'Verify application control (WDAC / App Control for Business)');
  fromSecureScore('alerts', 'Verify Defender/Purview threat protection policies and alert triage cadence');
  fromSecureScore('dlp', 'Verify Data Loss Prevention policy coverage in Microsoft Purview');
  fromSecureScore('encryption', 'Verify encryption of sensitive content (Purview Message Encryption / sensitivity-label encryption)');

  return { results, notes };
}

function computeScore(results) {
  const measured = SCORED_CHECK_IDS.map(id => results[id]).filter(r => r !== undefined && r !== 'manual');
  if (!measured.length) return 100;
  const pts = measured.reduce((s, r) => s + (r === 'pass' ? 1 : r === 'review' ? 0.5 : 0), 0);
  return Math.max(5, Math.round(pts / measured.length * 100));
}

module.exports = async function (context, myTimer) {
  const today = new Date().toISOString().slice(0, 10);
  try {
    const token = await getAppToken(context);
    const { g, gAll } = graphClient(token);
    const siteId = await resolveSiteId(g);
    const lists = await resolveLists(g, siteId);

    const settings = await readSettings(g, siteId, lists.Settings);
    const { results, notes } = await runPostureChecks(g, gAll, settings);
    const score = computeScore(results);

    /* previous scan, for drift detection — same "read everything, sort
       client-side" approach the browser app uses, since this list is
       small and SharePoint's $orderby on a custom text column is
       inconsistent across tenants */
    const prevScans = await g(`/sites/${siteId}/lists/${lists.Scans}/items?$expand=fields&$top=999`);
    const sorted = (prevScans.value || []).slice().sort((a, b) => (a.fields.ScanDate || '').localeCompare(b.fields.ScanDate || ''));
    const prev = sorted[sorted.length - 1];
    let prevResults = {};
    if (prev && prev.fields.Detail) { try { prevResults = JSON.parse(prev.fields.Detail).results || {}; } catch (e) { /* ignore malformed prior detail */ } }

    let alertsWritten = 0;
    for (const id of SCORED_CHECK_IDS) {
      if (prevResults[id] === 'pass' && results[id] === 'fail') {
        await g(`/sites/${siteId}/lists/${lists.Alerts}/items`, {
          method: 'POST',
          body: { fields: {
            Title: 'Drift: ' + (CHECK_LABELS[id] || id),
            CheckId: id,
            CheckLabel: CHECK_LABELS[id] || id,
            PreviousStatus: 'pass',
            NewStatus: 'fail',
            Note: notes[id] || '',
            DetectedDate: today,
            Acknowledged: false
          } }
        });
        alertsWritten++;
      }
    }

    await g(`/sites/${siteId}/lists/${lists.Scans}/items`, {
      method: 'POST',
      body: { fields: {
        Title: 'Scan ' + today,
        ScanDate: today,
        Score: score,
        Detail: JSON.stringify({ results, notes, source: 'automated' })
      } }
    });

    context.log(`Checkpoint posture monitor: scored ${score}, ${alertsWritten} drift alert(s) written.`);
  } catch (e) {
    context.log.error('Checkpoint posture monitor failed: ' + (e && e.message ? e.message : e));
    throw e; /* surface as a failed function execution so Azure Monitor/alerting can catch it */
  }
};
