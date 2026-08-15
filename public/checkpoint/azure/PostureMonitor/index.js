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
   scored:false checks (backup, bcp, supplier, policy) have no Graph
   signal at all and are deliberately left out of both files.

   'training' is the one scored:true check with no Graph signal: it is
   computed from the tenant's own Checkpoint Training list, which this
   Function reads too (see runTrainingCheck() below). It used to be
   listed with the scored:false checks and skipped here — which meant
   the unattended score and the interactive one were computed over
   different denominators, so every automated scan landed at a
   different number from a browser scan of the identical tenant and
   the Dashboard sparkline showed drift that never happened.
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
  'logging', 'alerts', 'training'
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
  'alerts': 'Security alerts triaged & threat protection enabled',
  'training': 'Security awareness training completion'
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

/* Lists the governance sweep uses, resolved WITHOUT throwing. Unlike
   Scans/Alerts/Settings — whose absence means the browser app was never
   run and the whole timer trigger is pointless — the document register
   and the Attestations list only exist on tenants running a Checkpoint
   version that has them. An older tenant should keep getting its
   posture scan, not a hard failure every night. */
async function resolveOptionalLists(g, siteId) {
  const prefix = process.env.LIST_PREFIX || 'Checkpoint';
  const lists = await g(`/sites/${siteId}/lists?$select=id,displayName&$top=200`);
  const byName = {};
  (lists.value || []).forEach(l => { byName[l.displayName] = l.id; });
  return {
    Documents: byName[prefix + ' Documents'] || null,
    Attestations: byName[prefix + ' Attestations'] || null,
    Training: byName[prefix + ' Training'] || null
  };
}

/* The 'training' posture check — the one scored:true check with no
   Graph signal behind it. Mirrors CheckpointLib.trainingCheckResult()
   (public/checkpoint/lib.js) exactly, including its thresholds and its
   two deliberate rules: Exempt records leave the denominator, and any
   overdue incomplete assignment caps the result at 'fail' regardless
   of the completion percentage. No training records at all resolves to
   'manual', never 'fail' — a client running awareness training in a
   separate LMS is doing the control properly while leaving no trace
   here, and "we couldn't measure it" must never be scored as "it
   failed" (same rule computeScore() applies below).

   Returns null when this tenant has no Training list at all (an older
   Checkpoint version), so the check is simply absent from the run
   rather than reported as an unmeasured failure. If you change the
   thresholds or the rules here, change lib.js too — same
   mirror-by-hand contract as runPostureChecks() above. */
const TRAINING_PASS_PCT = 90;
const TRAINING_REVIEW_PCT = 70;

async function runTrainingCheck(g, context, siteId, trainingListId, today) {
  if (!trainingListId) return null;
  let rows = [];
  try {
    const items = await g(`/sites/${siteId}/lists/${trainingListId}/items?$expand=fields&$top=999`);
    rows = (items.value || []).map(i => i.fields || {});
  } catch (e) {
    context.log.error('Checkpoint posture monitor: could not read the training register: ' + (e && e.message ? e.message : e));
    return null;
  }
  const list = rows.filter(r => r.Status !== 'Exempt');
  if (!list.length) {
    return { result: 'manual', note: 'No training records in Checkpoint — assign a course here, or keep completion evidence in whatever system you use.' };
  }
  const completed = list.filter(r => r.Status === 'Completed').length;
  const overdue = list.filter(r => r.Status !== 'Completed' && r.DueDate && r.DueDate < today).length;
  const pct = Math.round((completed / list.length) * 100);
  let result = pct >= TRAINING_PASS_PCT ? 'pass' : pct >= TRAINING_REVIEW_PCT ? 'review' : 'fail';
  if (overdue) result = 'fail';
  return {
    result,
    note: completed + ' of ' + list.length + ' assigned training records complete (' + pct + '%)' +
      (overdue ? ' — ' + overdue + ' past their due date' : '') + '.'
  };
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

/* ============================================================
   Governance sweep — policy review dates and attestation campaigns.

   The posture checks above answer "is the tenant configured safely
   today". This answers the other half of an audit: "is the management
   system actually being operated on its own cadence" — ISO 27001
   Clause 7.5.2 c) (documented information reviewed and re-approved),
   A.5.1 (policies communicated and acknowledged).

   Both are date-driven, which is exactly the kind of thing nobody
   notices until an auditor does, and exactly what an unattended timer
   is for. Findings are written to the same Checkpoint Alerts list the
   drift detection uses, so the Dashboard surfaces them with no new UI.
   ============================================================ */

const DOC_REVIEW_WARN_DAYS = 30;      /* mirrors store.js's DOC_REVIEW_WARN_DAYS */
const CAMPAIGN_STALL_DAYS = 21;       /* a campaign still incomplete this long after launch is stalled */
const CONTROLLED_DOC_CATEGORIES = ['Policies & Procedures', 'Risk & Treatment'];

function daysBetween(fromIso, toIso) {
  return Math.round((new Date(toIso + 'T00:00:00Z') - new Date(fromIso + 'T00:00:00Z')) / 86400000);
}

/* Every file in the Documents library, with its register columns and
   its containing folder (the folder name IS the category, matching how
   the browser app organises the library). */
async function readDocumentRegister(g, gAll, siteId, documentsListId) {
  const drive = await g(`/sites/${siteId}/lists/${documentsListId}?$expand=drive`);
  const driveId = drive.drive && drive.drive.id;
  if (!driveId) return [];
  const folders = await gAll(`/drives/${driveId}/root/children?$select=id,name,folder&$top=200`);
  const out = [];
  for (const f of folders) {
    if (!f.folder) continue;
    let files;
    try {
      files = await gAll(`/drives/${driveId}/items/${f.id}/children?$select=id,name,webUrl,listItem&$expand=listItem($expand=fields)&$top=200`);
    } catch (e) {
      continue; /* a library without the register columns can't be swept — skip, don't fail the run */
    }
    for (const file of files) {
      const fl = (file.listItem && file.listItem.fields) || {};
      out.push({
        name: file.name, url: file.webUrl, category: f.name,
        owner: fl.DocOwner || '', version: fl.DocVersion || '', status: fl.DocStatus || '',
        nextReview: fl.DocNextReview || ''
      });
    }
  }
  return out;
}

/* Existing unacknowledged alerts, keyed by CheckId — the dedupe source.
   Using the Alerts list itself rather than diffing against the previous
   scan means a policy that has been overdue for three weeks produces
   ONE alert someone still has to acknowledge, not twenty-one identical
   ones that train everybody to ignore the list. */
async function openAlertKeys(g, siteId, alertsListId) {
  const items = await g(`/sites/${siteId}/lists/${alertsListId}/items?$expand=fields&$top=999`);
  const keys = new Set();
  (items.value || []).forEach(i => {
    const f = i.fields || {};
    if (f.CheckId && !f.Acknowledged) keys.add(f.CheckId);
  });
  return keys;
}

async function writeAlert(g, siteId, alertsListId, alert) {
  await g(`/sites/${siteId}/lists/${alertsListId}/items`, {
    method: 'POST',
    body: { fields: {
      Title: alert.label,
      CheckId: alert.checkId,
      CheckLabel: alert.label,
      PreviousStatus: alert.prev,
      NewStatus: alert.next,
      Note: alert.note,
      DetectedDate: alert.date,
      Acknowledged: false
    } }
  });
}

/* Optional notification email. Requires BOTH the Mail.Send application
   permission and a NOTIFY_FROM mailbox to send as — an app-only
   identity has no mailbox of its own. Left entirely off unless
   configured, so the default deployment needs no mail permission at
   all; see ../README.md. Never throws: an alert that was written to
   SharePoint must not be rolled back by a mail failure. */
async function notify(g, context, subject, htmlBody) {
  const from = process.env.NOTIFY_FROM;
  const to = process.env.NOTIFY_TO;
  if (!from || !to) return false;
  try {
    await g(`/users/${encodeURIComponent(from)}/sendMail`, {
      method: 'POST',
      body: {
        message: {
          subject: subject,
          body: { contentType: 'HTML', content: htmlBody },
          toRecipients: to.split(',').map(a => ({ emailAddress: { address: a.trim() } })).filter(r => r.emailAddress.address)
        },
        saveToSentItems: false
      }
    });
    return true;
  } catch (e) {
    context.log.error('Checkpoint governance sweep: notification email failed: ' + (e && e.message ? e.message : e));
    return false;
  }
}

async function runGovernanceSweep(g, gAll, context, siteId, lists, optional, today) {
  const findings = [];

  if (optional.Documents) {
    let docs = [];
    try { docs = await readDocumentRegister(g, gAll, siteId, optional.Documents); }
    catch (e) { context.log.error('Checkpoint governance sweep: could not read the document register: ' + e.message); }

    for (const d of docs) {
      const controlled = !!d.status || CONTROLLED_DOC_CATEGORIES.indexOf(d.category) > -1;
      if (!controlled || d.status === 'Superseded') continue;

      /* A controlled policy with no review date at all is its own
         finding — Clause 7.5.2 c) is not satisfied by a document
         nobody has committed to re-reviewing. Reported once, at the
         same severity as an overdue one, because in practice it is
         indistinguishable from "never reviewed". */
      if (!d.nextReview) {
        findings.push({
          checkId: 'doc-noreview:' + d.name,
          label: 'No review date set: ' + d.name,
          prev: 'controlled document', next: 'no review cadence',
          note: 'This document is under document control but has no next-review date. ISO 27001 clause 7.5.2 c) expects documented information to be reviewed and re-approved on a defined cadence.' + (d.owner ? ' Owner: ' + d.owner + '.' : ' No owner is recorded either.'),
          date: today
        });
        continue;
      }

      const days = daysBetween(today, d.nextReview);
      if (days < 0) {
        findings.push({
          checkId: 'doc-overdue:' + d.name,
          label: 'Policy review overdue: ' + d.name,
          prev: 'review due ' + d.nextReview, next: Math.abs(days) + ' days overdue',
          note: 'Review was due ' + d.nextReview + '.' + (d.owner ? ' Owner: ' + d.owner + '.' : ' No owner recorded.') + (d.version ? ' Current version ' + d.version + '.' : ''),
          date: today
        });
      } else if (days <= DOC_REVIEW_WARN_DAYS) {
        findings.push({
          checkId: 'doc-due:' + d.name,
          label: 'Policy review due in ' + days + ' days: ' + d.name,
          prev: 'current', next: 'due ' + d.nextReview,
          note: (d.owner ? 'Owner: ' + d.owner + '. ' : '') + 'Re-review and re-approve before ' + d.nextReview + ' to keep the register clean.',
          date: today
        });
      }
    }
  }

  if (optional.Attestations) {
    let rows = [];
    try {
      const items = await g(`/sites/${siteId}/lists/${optional.Attestations}/items?$expand=fields&$top=999`);
      rows = (items.value || []).map(i => i.fields || {});
    } catch (e) { context.log.error('Checkpoint governance sweep: could not read attestations: ' + e.message); }

    const byCampaign = {};
    rows.forEach(r => {
      const key = r.Campaign || '(none)';
      const c = byCampaign[key] || (byCampaign[key] = { id: key, doc: r.DocName || '', launched: '', outstanding: 0, acknowledged: 0 });
      if (r.Status === 'Acknowledged') c.acknowledged++;
      else if (r.Status !== 'Exempt') c.outstanding++;
      if (r.AssignedDate && (!c.launched || r.AssignedDate < c.launched)) c.launched = r.AssignedDate;
    });

    Object.keys(byCampaign).forEach(k => {
      const c = byCampaign[k];
      if (!c.outstanding || !c.launched) return;
      const age = daysBetween(c.launched, today);
      if (age < CAMPAIGN_STALL_DAYS) return;
      findings.push({
        checkId: 'attest-stalled:' + c.id,
        label: 'Attestation campaign stalled: ' + (c.doc || c.id),
        prev: 'launched ' + c.launched, next: c.outstanding + ' still outstanding after ' + age + ' days',
        note: c.acknowledged + ' of ' + (c.acknowledged + c.outstanding) + ' people have acknowledged ' + (c.doc || c.id) + '. ISO 27001 A.5.1 expects policies to be acknowledged by relevant personnel — chase the remainder from the Policy attestation view.',
        date: today
      });
    });
  }

  if (!findings.length) return 0;

  const alreadyOpen = await openAlertKeys(g, siteId, lists.Alerts);
  const fresh = findings.filter(f => !alreadyOpen.has(f.checkId));
  for (const f of fresh) await writeAlert(g, siteId, lists.Alerts, f);

  if (fresh.length) {
    await notify(g, context,
      'Checkpoint: ' + fresh.length + ' governance item' + (fresh.length === 1 ? '' : 's') + ' need attention',
      '<p>The Checkpoint scheduled monitor raised the following on ' + today + ':</p><ul>' +
        fresh.map(f => '<li><b>' + f.label + '</b><br>' + f.note + '</li>').join('') +
        '</ul><p>Open Checkpoint to acknowledge or action these.</p>');
  }
  return fresh.length;
}

module.exports = async function (context, myTimer) {
  const today = new Date().toISOString().slice(0, 10);
  try {
    const token = await getAppToken(context);
    const { g, gAll } = graphClient(token);
    const siteId = await resolveSiteId(g);
    const lists = await resolveLists(g, siteId);

    const settings = await readSettings(g, siteId, lists.Settings);
    /* Resolved once, up front, and shared by the training check and the
       governance sweep below — both need the same lenient lookup, and
       resolving it here means the training result lands in `results`
       before the score is computed and the scan row written. Failure to
       resolve is logged, never thrown: these lists are optional, and a
       posture scan must still run and be recorded for a tenant whose
       list collection was momentarily unreadable. */
    let optional = { Documents: null, Attestations: null, Training: null };
    try {
      optional = await resolveOptionalLists(g, siteId);
    } catch (e) {
      context.log.error('Checkpoint posture monitor: could not resolve the optional lists — training check and governance sweep skipped this run: ' + (e && e.message ? e.message : e));
    }
    const { results, notes } = await runPostureChecks(g, gAll, settings);

    const training = await runTrainingCheck(g, context, siteId, optional.Training, today);
    if (training) { results.training = training.result; notes.training = training.note; }

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

    const drifted = [];
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
        drifted.push({ label: CHECK_LABELS[id] || id, note: notes[id] || '' });
      }
    }
    const alertsWritten = drifted.length;

    /* Drift is emailed on the same NOTIFY_FROM/NOTIFY_TO settings the
       governance sweep uses. It previously wasn't — only the sweep's
       findings were — which left the monitor's single most urgent
       signal (a security control that was passing and is now failing)
       sitting silently in a SharePoint list until somebody happened to
       open the Dashboard, while a policy review due in 30 days did
       reach their inbox. Sent before the scan row is written, so a
       failure recording the scan can't cost the operator the warning;
       notify() never throws. */
    if (drifted.length) {
      await notify(g, context,
        'Checkpoint: ' + drifted.length + ' control' + (drifted.length === 1 ? '' : 's') + ' drifted from pass to fail',
        '<p>The Checkpoint scheduled monitor detected the following on ' + today + ' (tenant posture score ' + score + '/100):</p><ul>' +
          drifted.map(d => '<li><b>' + d.label + '</b>' + (d.note ? '<br>' + d.note : '') + '</li>').join('') +
          '</ul><p>Open Checkpoint to acknowledge or action these.</p>');
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

    /* Governance sweep runs after the scan is recorded, and its own
       failures are caught here rather than allowed to propagate: a
       posture scan that completed and was written must not be reported
       as a failed execution because the document register was
       momentarily unreadable. */
    let governanceAlerts = 0;
    try {
      governanceAlerts = await runGovernanceSweep(g, gAll, context, siteId, lists, optional, today);
    } catch (e) {
      context.log.error('Checkpoint governance sweep failed (posture scan was still recorded): ' + (e && e.message ? e.message : e));
    }

    context.log(`Checkpoint posture monitor: scored ${score}, ${alertsWritten} drift alert(s) and ${governanceAlerts} governance alert(s) written.`);
  } catch (e) {
    context.log.error('Checkpoint posture monitor failed: ' + (e && e.message ? e.message : e));
    throw e; /* surface as a failed function execution so Azure Monitor/alerting can catch it */
  }
};
