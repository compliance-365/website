/* ============================================================
   Checkpoint — data layer
   Two interchangeable stores:
     DemoStore — localStorage, seeded demo data (no sign-in)
     SpStore   — SharePoint lists in the signed-in client tenant,
                 provisioned on first run via Microsoft Graph
   Both expose the same async interface used by app.js.
   ============================================================ */

/* ISO 27001:2022 Annex A starter control set (16-control subset;
   extend to the full 93 by adding rows here or in the SP list). */
window.CONTROL_SEED = [
  { code: 'A.5.1',  t: 'Policies for information security',                 app: true,  st: 'Not started', own: '', map: 'SOC2 CC1.1 · NIST GV' },
  { code: 'A.5.9',  t: 'Inventory of information & assets',                 app: true,  st: 'Not started', own: '', map: 'SOC2 CC6.1 · NIST ID.AM' },
  { code: 'A.5.15', t: 'Access control',                                    app: true,  st: 'Not started', own: '', map: 'SOC2 CC6.1 · NIST PR.AC' },
  { code: 'A.5.19', t: 'Information security in supplier relationships',    app: true,  st: 'Not started', own: '', map: 'SOC2 CC9.2 · NIST GV.SC' },
  { code: 'A.5.23', t: 'Information security for cloud services',           app: true,  st: 'Not started', own: '', map: 'SOC2 CC6.7 · NIST PR.DS' },
  { code: 'A.5.30', t: 'ICT readiness for business continuity',             app: true,  st: 'Not started', own: '', map: 'SOC2 A1.2 · NIST RC' },
  { code: 'A.6.3',  t: 'Security awareness & training',                     app: true,  st: 'Not started', own: '', map: 'SOC2 CC1.4 · NIST PR.AT' },
  { code: 'A.8.2',  t: 'Privileged access rights',                          app: true,  st: 'Not started', own: '', map: 'SOC2 CC6.3 · E8 Admin priv · NIST PR.AC' },
  { code: 'A.8.5',  t: 'Secure authentication',                             app: true,  st: 'Not started', own: '', map: 'SOC2 CC6.1 · E8 MFA · NIST PR.AC' },
  { code: 'A.8.7',  t: 'Protection against malware',                        app: true,  st: 'Not started', own: '', map: 'SOC2 CC6.8 · E8 App control · NIST DE.CM' },
  { code: 'A.8.8',  t: 'Management of technical vulnerabilities',           app: true,  st: 'Not started', own: '', map: 'SOC2 CC7.1 · E8 Patch apps · NIST ID.RA' },
  { code: 'A.8.13', t: 'Information backup',                                app: true,  st: 'Not started', own: '', map: 'SOC2 A1.2 · E8 Backups · NIST PR.IP' },
  { code: 'A.8.15', t: 'Logging',                                           app: true,  st: 'Not started', own: '', map: 'SOC2 CC7.2 · NIST DE.AE' },
  { code: 'A.8.19', t: 'Installation of software on operational systems',   app: true,  st: 'Not started', own: '', map: 'SOC2 CC6.8 · E8 App control' },
  { code: 'A.8.24', t: 'Use of cryptography',                               app: true,  st: 'Not started', own: '', map: 'SOC2 CC6.7 · NIST PR.DS' },
  { code: 'A.8.28', t: 'Secure coding',                                     app: true,  st: 'Not started', own: '', map: 'SOC2 CC8.1' }
];

/* The ten posture checks Checkpoint runs. tpl links a failed/review
   check to a proposed risk + remediation actions in TPL (app.js). */
window.CHECK_DEFS = [
  { id: 'mfa-all',  area: 'Identity', label: 'MFA enforced — all users',                  tpl: null },
  { id: 'mfa-priv', area: 'Identity', label: 'Phishing-resistant MFA — privileged roles', tpl: 'mfa-priv' },
  { id: 'legacy',   area: 'Identity', label: 'Legacy authentication blocked',             tpl: 'legacy' },
  { id: 'admins',   area: 'Identity', label: 'Global admin count within threshold',       tpl: 'admins' },
  { id: 'device',   area: 'Devices',  label: 'Device compliance policies enforced',       tpl: null },
  { id: 'patch',    area: 'Devices',  label: 'OS & application patch currency',           tpl: 'patch' },
  { id: 'wdac',     area: 'Devices',  label: 'Application control (WDAC) deployed',       tpl: 'wdac' },
  { id: 'macro',    area: 'Apps',     label: 'Office macro settings hardened',            tpl: null },
  { id: 'logging',  area: 'Data',     label: 'Unified audit logging enabled',             tpl: null },
  { id: 'backup',   area: 'Data',     label: 'Backup coverage & restore testing',         tpl: 'backup' }
];

/* ================= Demo store ================= */
window.DemoStore = (function () {
  var KEY = 'checkpoint-demo-v1';
  var S = null;

  function daysFrom(n) { var d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); }

  function seed() {
    return {
      mode: 'demo',
      client: 'Meridian Health SaaS — demo tenant',
      scans: [{ date: daysFrom(-42), score: 41 }, { date: daysFrom(-21), score: 48 }],
      lastResults: { 'mfa-all': 'pass', 'mfa-priv': 'review', 'legacy': 'fail', 'admins': 'review', 'device': 'pass', 'patch': 'review', 'wdac': 'fail', 'macro': 'pass', 'logging': 'pass', 'backup': 'review' },
      lastNotes: { 'admins': '6 Global Administrators', 'device': '97% of 214 devices compliant' },
      risks: [
        { id: 'R-001', title: 'Supplier access to production data lacks contractual security clauses', cat: 'Supplier', src: 'Gap analysis', L: 4, I: 4, controls: ['A.5.19'], owner: 'K. Patel', status: 'In treatment', treat: 'Mitigate', actions: ['ACT-001', 'ACT-002'] },
        { id: 'R-002', title: 'No tested restore path for SharePoint business-critical libraries', cat: 'Data', src: 'Workshop', L: 3, I: 5, controls: ['A.8.13'], owner: 'S. Okafor', status: 'In treatment', treat: 'Mitigate', actions: ['ACT-003'] },
        { id: 'R-003', title: 'Staff unable to recognise credential-phishing attempts', cat: 'People', src: 'Gap analysis', L: 4, I: 3, controls: ['A.6.3'], owner: 'M. Chen', status: 'Monitored', treat: 'Mitigate', actions: ['ACT-004'] },
        { id: 'R-004', title: 'Shadow cloud services holding client data outside the tenant', cat: 'Data', src: 'Workshop', L: 3, I: 4, controls: ['A.5.23', 'A.5.9'], owner: 'K. Patel', status: 'Open', treat: 'Mitigate', actions: ['ACT-005'] },
        { id: 'R-005', title: 'Cryptographic key handling undocumented for client-facing APIs', cat: 'Ops', src: 'Gap analysis', L: 2, I: 4, controls: ['A.8.24'], owner: 'S. Okafor', status: 'Open', treat: 'Mitigate', actions: ['ACT-006'] }
      ],
      actions: [
        { id: 'ACT-001', title: 'Issue updated security schedule to top-10 suppliers', risk: 'R-001', control: 'A.5.19', pr: 'High', owner: 'K. Patel', due: daysFrom(-6), status: 'In progress', src: 'Gap analysis' },
        { id: 'ACT-002', title: 'Add supplier security clauses to procurement template', risk: 'R-001', control: 'A.5.19', pr: 'Medium', owner: 'Legal', due: daysFrom(14), status: 'Open', src: 'Gap analysis' },
        { id: 'ACT-003', title: 'Quarterly restore test — SharePoint critical libraries', risk: 'R-002', control: 'A.8.13', pr: 'High', owner: 'S. Okafor', due: daysFrom(7), status: 'Open', src: 'Workshop' },
        { id: 'ACT-004', title: 'Roll out phishing simulation & awareness programme', risk: 'R-003', control: 'A.6.3', pr: 'Medium', owner: 'M. Chen', due: daysFrom(-2), status: 'In progress', src: 'Gap analysis' },
        { id: 'ACT-005', title: 'Discover & sanction cloud apps via Defender for Cloud Apps', risk: 'R-004', control: 'A.5.23', pr: 'High', owner: 'K. Patel', due: daysFrom(21), status: 'Open', src: 'Workshop' },
        { id: 'ACT-006', title: 'Document key management procedure for API certificates', risk: 'R-005', control: 'A.8.24', pr: 'Low', owner: 'S. Okafor', due: daysFrom(30), status: 'Open', src: 'Gap analysis' }
      ],
      controls: window.CONTROL_SEED.map(function (c, i) {
        var demoSt = ['Implemented', 'In progress', 'Implemented', 'In progress', 'In progress', 'Not started', 'In progress', 'In progress', 'In progress', 'In progress', 'In progress', 'In progress', 'Implemented', 'Not started', 'Not started', 'Not applicable'][i];
        return {
          id: c.code, t: c.t, app: i !== 15, st: demoSt,
          own: ['M. Chen', 'K. Patel', 'S. Okafor', 'K. Patel', 'K. Patel', 'S. Okafor', 'M. Chen', 'S. Okafor', 'S. Okafor', 'S. Okafor', 'S. Okafor', 'S. Okafor', 'S. Okafor', 'S. Okafor', 'S. Okafor', '—'][i],
          map: c.map,
          just: i === 15 ? 'No in-house development; SaaS product engineering handled under supplier controls A.5.19–A.5.23.' : ''
        };
      }),
      proposed: [],
      handledTpl: [],
      activity: [
        { t: daysFrom(-21), msg: 'Posture scan completed — score <b>48</b>. 2 findings mapped to existing risks.' },
        { t: daysFrom(-24), msg: '<b>A.5.15 Access control</b> marked Implemented. Evidence captured: CA policy export.' },
        { t: daysFrom(-30), msg: 'Risk <b>R-002</b> accepted into register from continuity workshop.' }
      ]
    };
  }

  function persist() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { } }

  return {
    kind: 'demo',
    load: async function () {
      try { var d = localStorage.getItem(KEY); S = d ? JSON.parse(d) : seed(); } catch (e) { S = seed(); }
      return S;
    },
    addRisk: async function (r) { S.risks.push(r); persist(); },
    updateRisk: async function () { persist(); },
    addAction: async function (a) { S.actions.push(a); persist(); },
    updateAction: async function () { persist(); },
    updateControl: async function () { persist(); },
    addScan: async function (sc) { S.scans.push(sc); persist(); },
    saveScanState: async function () { persist(); },
    /* app.js already unshifts to S.activity — the store only persists */
    logActivity: async function () { persist(); },
    reset: async function () { localStorage.removeItem(KEY); S = seed(); return S; }
  };
})();

/* ================= SharePoint store ================= */
window.SpStore = (function () {
  var CONFIG = window.CHECKPOINT_CONFIG;
  var siteId = null, lists = {};   /* name → listId */
  var S = null;

  var DEFS = {
    Risks: [
      { name: 'RefId', text: {} }, { name: 'Category', text: {} }, { name: 'Source', text: {} },
      { name: 'Likelihood', number: {} }, { name: 'Impact', number: {} },
      { name: 'Controls', text: {} }, { name: 'Owner', text: {} }, { name: 'Status', text: {} },
      { name: 'Treatment', text: {} }, { name: 'ActionRefs', text: {} }, { name: 'TplId', text: {} }
    ],
    Actions: [
      { name: 'RefId', text: {} }, { name: 'RiskRef', text: {} }, { name: 'Control', text: {} },
      { name: 'Priority', text: {} }, { name: 'Owner', text: {} }, { name: 'DueDate', text: {} },
      { name: 'Status', text: {} }, { name: 'Evidence', text: { allowMultipleLines: true } }, { name: 'Source', text: {} }
    ],
    Controls: [
      { name: 'Code', text: {} }, { name: 'Applicable', boolean: {} }, { name: 'Status', text: {} },
      { name: 'Owner', text: {} }, { name: 'MapsTo', text: {} }, { name: 'Justification', text: { allowMultipleLines: true } }
    ],
    Scans: [
      { name: 'ScanDate', text: {} }, { name: 'Score', number: {} }, { name: 'Detail', text: { allowMultipleLines: true } }
    ],
    Activity: [
      { name: 'Message', text: { allowMultipleLines: true } }, { name: 'EntryDate', text: {} }
    ]
  };

  function listName(k) { return CONFIG.listPrefix + ' ' + k; }

  async function resolveSite() {
    if (CONFIG.site === 'root') {
      siteId = (await Graph.g('/sites/root?$select=id')).id;
    } else {
      var host = (await Graph.g('/sites/root?$select=siteCollection,webUrl')).webUrl.replace(/^https:\/\//, '').split('/')[0];
      siteId = (await Graph.g('/sites/' + host + ':' + CONFIG.site + '?$select=id')).id;
    }
  }

  async function ensureLists(onStatus) {
    var existing = await Graph.gAll('/sites/' + siteId + '/lists?$select=id,displayName&$top=200');
    for (var k in DEFS) {
      var name = listName(k);
      var found = existing.find(function (l) { return l.displayName === name; });
      if (found) { lists[k] = found.id; continue; }
      if (onStatus) onStatus('Creating list “' + name + '”…');
      var created = await Graph.g('/sites/' + siteId + '/lists', {
        method: 'POST',
        body: { displayName: name, columns: DEFS[k], list: { template: 'genericList' } }
      });
      lists[k] = created.id;
      if (k === 'Controls') await seedControls(onStatus);
    }
  }

  async function seedControls(onStatus) {
    if (onStatus) onStatus('Seeding ISO 27001 control set…');
    for (var i = 0; i < window.CONTROL_SEED.length; i++) {
      var c = window.CONTROL_SEED[i];
      await addItem('Controls', {
        Title: c.t, Code: c.code, Applicable: c.app, Status: c.st, Owner: c.own, MapsTo: c.map, Justification: ''
      });
    }
  }

  async function addItem(k, fields) {
    var j = await Graph.g('/sites/' + siteId + '/lists/' + lists[k] + '/items', {
      method: 'POST', body: { fields: fields }
    });
    return j.id;
  }
  async function patchItem(k, itemId, fields) {
    await Graph.g('/sites/' + siteId + '/lists/' + lists[k] + '/items/' + itemId + '/fields', {
      method: 'PATCH', body: fields
    });
  }
  async function items(k) {
    return Graph.gAll('/sites/' + siteId + '/lists/' + lists[k] + '/items?$expand=fields&$top=200');
  }

  function csv(a) { return (a || []).join(','); }
  function uncsv(s) { return s ? String(s).split(',').map(function (x) { return x.trim(); }).filter(Boolean) : []; }

  return {
    kind: 'sharepoint',
    load: async function (onStatus) {
      if (onStatus) onStatus('Locating SharePoint site…');
      await resolveSite();
      await ensureLists(onStatus);
      if (onStatus) onStatus('Loading registers…');

      var riskItems = await items('Risks');
      var actItems = await items('Actions');
      var ctlItems = await items('Controls');
      var scanItems = await items('Scans');
      var actvItems = await items('Activity');

      S = {
        mode: 'live',
        client: '',
        risks: riskItems.map(function (i) {
          var f = i.fields;
          return { _sp: i.id, id: f.RefId, title: f.Title, cat: f.Category || '', src: f.Source || '', L: f.Likelihood || 1, I: f.Impact || 1, controls: uncsv(f.Controls), owner: f.Owner || '', status: f.Status || 'Open', treat: f.Treatment || 'Mitigate', actions: uncsv(f.ActionRefs), tpl: f.TplId || undefined };
        }),
        actions: actItems.map(function (i) {
          var f = i.fields;
          return { _sp: i.id, id: f.RefId, title: f.Title, risk: f.RiskRef || '', control: f.Control || '', pr: f.Priority || 'Medium', owner: f.Owner || '', due: f.DueDate || '', status: f.Status || 'Open', evidence: f.Evidence || '', src: f.Source || '' };
        }),
        controls: ctlItems.map(function (i) {
          var f = i.fields;
          return { _sp: i.id, id: f.Code, t: f.Title, app: !!f.Applicable, st: f.Status || 'Not started', own: f.Owner || '', map: f.MapsTo || '', just: f.Justification || '' };
        }).sort(function (a, b) { return a.id.localeCompare(b.id, undefined, { numeric: true }); }),
        scans: scanItems.map(function (i) {
          var f = i.fields;
          return { _sp: i.id, date: f.ScanDate, score: f.Score || 0, detail: f.Detail || '' };
        }).sort(function (a, b) { return (a.date || '').localeCompare(b.date || ''); }),
        activity: actvItems.map(function (i) {
          var f = i.fields;
          return { _sp: i.id, t: f.EntryDate || (i.createdDateTime || '').slice(0, 10), msg: f.Message || '' };
        }).sort(function (a, b) { return (b.t || '').localeCompare(a.t || ''); }),
        lastResults: null, lastNotes: {},
        proposed: [], handledTpl: []
      };
      /* restore last scan detail (results + handled templates) */
      var last = S.scans[S.scans.length - 1];
      if (last && last.detail) {
        try {
          var d = JSON.parse(last.detail);
          S.lastResults = d.results || null;
          S.lastNotes = d.notes || {};
        } catch (e) { }
      }
      S.handledTpl = S.risks.filter(function (r) { return r.tpl; }).map(function (r) { return r.tpl; });
      return S;
    },
    addRisk: async function (r) {
      r._sp = await addItem('Risks', {
        Title: r.title, RefId: r.id, Category: r.cat, Source: r.src, Likelihood: r.L, Impact: r.I,
        Controls: csv(r.controls), Owner: r.owner, Status: r.status, Treatment: r.treat,
        ActionRefs: csv(r.actions), TplId: r.tpl || ''
      });
      S.risks.push(r);
    },
    updateRisk: async function (r) {
      await patchItem('Risks', r._sp, { Status: r.status, Likelihood: r.L, Impact: r.I, ActionRefs: csv(r.actions), Owner: r.owner, Treatment: r.treat });
    },
    addAction: async function (a) {
      a._sp = await addItem('Actions', {
        Title: a.title, RefId: a.id, RiskRef: a.risk, Control: a.control, Priority: a.pr,
        Owner: a.owner, DueDate: a.due, Status: a.status, Evidence: a.evidence || '', Source: a.src
      });
      S.actions.push(a);
    },
    updateAction: async function (a) {
      await patchItem('Actions', a._sp, { Status: a.status, Evidence: a.evidence || '', Owner: a.owner, DueDate: a.due });
    },
    updateControl: async function (c) {
      await patchItem('Controls', c._sp, { Applicable: c.app, Status: c.st, Owner: c.own, Justification: c.just || '' });
    },
    addScan: async function (sc) {
      sc._sp = await addItem('Scans', { Title: 'Scan ' + sc.date, ScanDate: sc.date, Score: sc.score, Detail: sc.detail || '' });
      S.scans.push(sc);
    },
    saveScanState: async function () { /* live state derives from lists; nothing extra */ },
    /* app.js already unshifts to S.activity — the store only writes the item */
    logActivity: async function (msg) {
      var t = new Date().toISOString().slice(0, 10);
      await addItem('Activity', { Title: 'Entry', Message: msg, EntryDate: t });
    },
    reset: null /* never bulk-delete client data from the console */
  };
})();
