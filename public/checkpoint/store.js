/* ============================================================
   Checkpoint — data layer
   Two interchangeable stores:
     DemoStore — localStorage, seeded demo data (no sign-in)
     SpStore   — SharePoint lists in the signed-in client tenant,
                 provisioned on first run via Microsoft Graph
   Both expose the same async interface used by app.js.
   ============================================================ */

/* ============================================================
   Framework registry — each entry is a purchasable module.
   Add a new framework by adding a key here (+ its control set)
   and adding its id to FRAMEWORK_ORDER. Nothing else in the app
   needs to change — the sidebar, SoA and reports all read from
   this registry plus each client's Entitlements list.
   ============================================================ */
window.FRAMEWORKS = {
  iso27001: {
    id: 'iso27001', name: 'ISO 27001', tag: 'Security',
    blurb: 'Information security management system — Annex A controls (2022 revision). Starter subset shown below; extend to the full 93 by adding rows to the Controls list.',
    /* 16-control starter subset of Annex A */
    controls: [
      { code: 'A.5.1',  t: 'Policies for information security',                 app: true, map: 'SOC2 CC1.1 · NIST GV' },
      { code: 'A.5.9',  t: 'Inventory of information & assets',                 app: true, map: 'SOC2 CC6.1 · NIST ID.AM' },
      { code: 'A.5.15', t: 'Access control',                                    app: true, map: 'SOC2 CC6.1 · NIST PR.AC' },
      { code: 'A.5.19', t: 'Information security in supplier relationships',    app: true, map: 'SOC2 CC9.2 · NIST GV.SC' },
      { code: 'A.5.23', t: 'Information security for cloud services',           app: true, map: 'SOC2 CC6.7 · NIST PR.DS' },
      { code: 'A.5.30', t: 'ICT readiness for business continuity',             app: true, map: 'SOC2 A1.2 · NIST RC' },
      { code: 'A.6.3',  t: 'Security awareness & training',                     app: true, map: 'SOC2 CC1.4 · NIST PR.AT' },
      { code: 'A.8.2',  t: 'Privileged access rights',                          app: true, map: 'SOC2 CC6.3 · E8 Admin priv · NIST PR.AC' },
      { code: 'A.8.5',  t: 'Secure authentication',                             app: true, map: 'SOC2 CC6.1 · E8 MFA · NIST PR.AC' },
      { code: 'A.8.7',  t: 'Protection against malware',                        app: true, map: 'SOC2 CC6.8 · E8 App control · NIST DE.CM' },
      { code: 'A.8.8',  t: 'Management of technical vulnerabilities',           app: true, map: 'SOC2 CC7.1 · E8 Patch apps · NIST ID.RA' },
      { code: 'A.8.13', t: 'Information backup',                                app: true, map: 'SOC2 A1.2 · E8 Backups · NIST PR.IP' },
      { code: 'A.8.15', t: 'Logging',                                           app: true, map: 'SOC2 CC7.2 · NIST DE.AE' },
      { code: 'A.8.19', t: 'Installation of software on operational systems',   app: true, map: 'SOC2 CC6.8 · E8 App control' },
      { code: 'A.8.24', t: 'Use of cryptography',                               app: true, map: 'SOC2 CC6.7 · NIST PR.DS' },
      { code: 'A.8.28', t: 'Secure coding',                                     app: true, map: 'SOC2 CC8.1' }
    ]
  },
  iso42001: {
    id: 'iso42001', name: 'ISO 42001', tag: 'AI Governance',
    blurb: 'AI management system — Annex A controls (2023). Early-mover certification enterprise AI buyers are starting to demand. Starter subset shown below; extend to the full control set as engagements progress.',
    controls: [
      { code: 'A.2.2',  t: 'Policy for responsible development & use of AI',            app: true, map: 'ISO27001 A.5.1 · EU AI Act Art.9' },
      { code: 'A.2.4',  t: 'Alignment of AI policy with other organisational policies', app: true, map: 'ISO27001 A.5.1' },
      { code: 'A.3.2',  t: 'AI roles and responsibilities',                            app: true, map: 'ISO27001 A.5.2' },
      { code: 'A.4.2',  t: 'Resourcing of AI systems (data, tooling, people)',          app: true, map: 'ISO27001 A.5.9' },
      { code: 'A.4.4',  t: 'Reporting of concerns about AI system behaviour',           app: true, map: 'ISO27001 A.6.8' },
      { code: 'A.5.2',  t: 'AI system impact assessment — individuals & groups',        app: true, map: 'EU AI Act Art.27' },
      { code: 'A.5.4',  t: 'AI system impact assessment — society & environment',       app: true, map: 'EU AI Act Art.27' },
      { code: 'A.6.2',  t: 'Objectives for responsible AI development',                 app: true, map: 'ISO27001 A.5.1' },
      { code: 'A.6.2.3',t: 'AI system life cycle documentation',                       app: true, map: 'SOC2 CC8.1' },
      { code: 'A.6.2.6',t: 'Verification and validation of the AI system',             app: true, map: 'SOC2 CC8.1' },
      { code: 'A.7.2',  t: 'Data quality for AI systems',                              app: true, map: 'ISO27701 P.7.4.4' },
      { code: 'A.7.4',  t: 'Data provenance',                                          app: true, map: 'ISO27701 P.7.4.1' },
      { code: 'A.8.3',  t: 'System documentation & information for AI users',          app: true, map: 'ISO27001 A.5.9' },
      { code: 'A.9.2',  t: 'Allocation of responsibilities for AI system use',          app: true, map: 'ISO27001 A.5.2' },
      { code: 'A.9.3',  t: 'Human oversight of AI systems',                            app: true, map: 'EU AI Act Art.14' },
      { code: 'A.10.2', t: 'Responsibilities shared with AI providers & customers',     app: true, map: 'ISO27001 A.5.19' }
    ]
  },
  soc2: {
    id: 'soc2', name: 'SOC 2', tag: 'Trust',
    blurb: 'Trust Services Criteria (Security/Common Criteria series) — the certification US and global enterprise buyers require before signing SaaS contracts. Starter subset shown below; extend to the full criteria set as engagements progress.',
    controls: [
      { code: 'CC1.1', t: 'Commitment to integrity and ethical values',            app: true, map: 'ISO27001 A.5.1 · NIST GV' },
      { code: 'CC1.4', t: 'Commitment to competence',                              app: true, map: 'ISO27001 A.6.3 · NIST PR.AT' },
      { code: 'CC2.1', t: 'Communication of internal control information',        app: true, map: 'ISO27001 A.5.1' },
      { code: 'CC3.1', t: 'Objectives specified for risk identification',         app: true, map: 'ISO27001 A.5.1 · NIST ID.RA' },
      { code: 'CC4.1', t: 'Monitoring activities and evaluations',                app: true, map: 'ISO27001 A.8.15 · NIST DE.CM' },
      { code: 'CC5.2', t: 'Control activities for technology',                    app: true, map: 'ISO27001 A.8.7' },
      { code: 'CC6.1', t: 'Logical access security software & infrastructure',    app: true, map: 'ISO27001 A.5.15 · E8 MFA · NIST PR.AC' },
      { code: 'CC6.2', t: 'Controls prior to issuing system credentials',         app: true, map: 'ISO27001 A.5.15' },
      { code: 'CC6.3', t: 'Access removal on role change or termination',        app: true, map: 'ISO27001 A.8.2 · NIST PR.AC' },
      { code: 'CC6.6', t: 'Logical access boundary protections',                 app: true, map: 'ISO27001 A.8.7 · E8 App control' },
      { code: 'CC6.7', t: 'Restrict transmission and movement of data',          app: true, map: 'ISO27001 A.5.23 · A.8.24 · NIST PR.DS' },
      { code: 'CC6.8', t: 'Prevent and detect unauthorised or malicious software', app: true, map: 'ISO27001 A.8.7 · E8 App control · NIST DE.CM' },
      { code: 'CC7.1', t: 'Vulnerability detection procedures',                  app: true, map: 'ISO27001 A.8.8 · E8 Patch apps · NIST ID.RA' },
      { code: 'CC7.2', t: 'Security event monitoring',                          app: true, map: 'ISO27001 A.8.15 · NIST DE.AE' },
      { code: 'CC8.1', t: 'Change management process',                          app: true, map: 'ISO27001 A.8.28 · ISO42001 A.6.2.3' },
      { code: 'CC9.2', t: 'Vendor and business partner risk management',         app: true, map: 'ISO27001 A.5.19 · DISP Supply chain' }
    ]
  },
  essential8: {
    id: 'essential8', name: 'Essential Eight', tag: 'Cyber Controls',
    blurb: "ASD's eight mitigation strategies, assessed and uplifted to Maturity Level Two — mandatory for Commonwealth entities and increasingly required across government supply chains.",
    controls: [
      { code: 'E8.1', t: 'Application control',                     app: true, map: 'ISO27001 A.8.19 · SOC2 CC6.8' },
      { code: 'E8.2', t: 'Patch applications',                       app: true, map: 'ISO27001 A.8.8 · SOC2 CC7.1' },
      { code: 'E8.3', t: 'Configure Microsoft Office macro settings', app: true, map: 'ISO27001 A.8.7' },
      { code: 'E8.4', t: 'User application hardening',               app: true, map: 'ISO27001 A.8.7 · SOC2 CC6.6' },
      { code: 'E8.5', t: 'Restrict administrative privileges',       app: true, map: 'ISO27001 A.8.2 · SOC2 CC6.3' },
      { code: 'E8.6', t: 'Patch operating systems',                  app: true, map: 'ISO27001 A.8.8 · NIST ID.RA' },
      { code: 'E8.7', t: 'Multi-factor authentication',              app: true, map: 'ISO27001 A.8.5 · SOC2 CC6.1' },
      { code: 'E8.8', t: 'Regular backups',                          app: true, map: 'ISO27001 A.8.13 · SOC2 A1.2' }
    ]
  },
  iso27701: {
    id: 'iso27701', name: 'ISO 27701', tag: 'Privacy',
    blurb: 'Privacy Information Management System — extends ISO 27001 into privacy for organisations handling sensitive personal data under the Privacy Act, GDPR or health regulation. Starter subset shown below (clauses 6-8); extend to the full control set as engagements progress.',
    controls: [
      { code: 'P.6.2.1', t: 'Policies for information security addressing privacy',   app: true, map: 'ISO27001 A.5.1' },
      { code: 'P.7.2.1', t: 'Identify and document purpose for PII processing',       app: true, map: 'ISO42001 A.5.2' },
      { code: 'P.7.2.2', t: 'Identify lawful basis for PII processing',               app: true, map: 'DISP Classified handling' },
      { code: 'P.7.2.6', t: 'Contracts with PII processors',                          app: true, map: 'ISO27001 A.5.19' },
      { code: 'P.7.2.8', t: 'Records related to processing of PII',                   app: true, map: 'ISO27001 A.8.15' },
      { code: 'P.7.3.1', t: 'Determine and fulfil obligations to PII principals',     app: true, map: 'ISO42001 A.9.2' },
      { code: 'P.7.3.2', t: 'Provide information to PII principals',                 app: true, map: 'ISO42001 A.8.3' },
      { code: 'P.7.3.9', t: 'Providing a copy of PII processed',                     app: true, map: 'NIST GV' },
      { code: 'P.7.4.1', t: 'Limit collection to what is adequate and relevant',      app: true, map: 'ISO42001 A.7.2' },
      { code: 'P.7.4.4', t: 'Ensure quality of PII throughout its lifecycle',         app: true, map: 'ISO42001 A.7.4' },
      { code: 'P.7.4.7', t: 'Secure erasure of temporary files',                     app: true, map: 'ISO27001 A.8.24' },
      { code: 'P.7.4.9', t: 'De-identification and deletion at end of processing',   app: true, map: 'ISO27001 A.8.13' },
      { code: 'P.7.5.1', t: 'Basis for PII transfer between jurisdictions',          app: true, map: 'DISP FOCI register' },
      { code: 'P.8.2.2', t: 'Contracts with PII controllers (processor)',            app: true, map: 'ISO27001 A.5.19' },
      { code: 'P.8.4.2', t: 'Temporary file handling (processor)',                   app: true, map: 'ISO27001 A.8.24' },
      { code: 'P.8.5.1', t: 'Basis for PII transfer between jurisdictions (processor)', app: true, map: 'ISO27001 A.5.23' }
    ]
  },
  dispirap: {
    id: 'dispirap', name: 'DISP / IRAP', tag: 'Defence',
    blurb: 'Defence Industry Security Programme, Information Security Manual and IRAP assessment readiness — for firms entering defence panels and government contracts. Starter subset shown below; extend to the full requirement set as engagements progress.',
    controls: [
      { code: 'DISP.1',  t: 'DISP membership eligibility criteria maintained',            app: true, map: 'ISO27001 A.5.1' },
      { code: 'DISP.2',  t: 'Chief Security Officer appointed',                          app: true, map: 'ISO27001 A.5.1' },
      { code: 'DISP.3',  t: 'Security governance framework documented',                  app: true, map: 'ISO27001 A.5.1 · NIST GV' },
      { code: 'DISP.4',  t: 'Personnel security clearances managed',                     app: true, map: 'ISO27001 A.6.3' },
      { code: 'DISP.5',  t: 'Ongoing personnel suitability assessments',                 app: true, map: 'ISO27001 A.6.3 · SOC2 CC1.4' },
      { code: 'DISP.6',  t: 'Physical security zones established',                       app: true, map: 'ISO27001 A.5.1' },
      { code: 'DISP.7',  t: 'ICT systems accreditation (IRAP assessment)',               app: true, map: 'NIST PR.PT' },
      { code: 'DISP.8',  t: 'System security plan maintained',                          app: true, map: 'ISO27001 A.8.15' },
      { code: 'DISP.9',  t: 'Essential Eight maturity uplift (ML2 target)',              app: true, map: 'E8 all strategies' },
      { code: 'DISP.10', t: 'Incident reporting to Defence',                            app: true, map: 'NIST RS.CO' },
      { code: 'DISP.11', t: 'Foreign ownership, control & influence (FOCI) register',   app: true, map: 'ISO27701 P.7.5.1' },
      { code: 'DISP.12', t: 'Supply chain security assurance',                          app: true, map: 'SOC2 CC9.2 · ISO27001 A.5.19' },
      { code: 'DISP.13', t: 'Classified information handling procedures',               app: true, map: 'ISO27701 P.7.2.2' },
      { code: 'DISP.14', t: 'Security awareness training (DISP-specific)',              app: true, map: 'ISO27001 A.6.3 · NIST PR.AT' },
      { code: 'DISP.15', t: 'Annual DISP compliance report',                            app: true, map: 'SOC2 CC4.1' },
      { code: 'DISP.16', t: 'IRAP assessor engagement & remediation tracking',          app: true, map: 'ISO27001 A.8.8' }
    ]
  },
  nistcsf: {
    id: 'nistcsf', name: 'NIST CSF', tag: 'Risk Framework',
    blurb: 'Risk framework favoured by boards and US-aligned partners, mapped to ISO 27001 and Essential Eight so nothing is done twice. Starter subset of Govern/Identify/Protect/Detect/Respond/Recover categories shown below.',
    controls: [
      { code: 'GV',     t: 'Govern — cybersecurity risk management strategy & policy', app: true, map: 'ISO27001 A.5.1 · DISP Governance' },
      { code: 'ID.AM',  t: 'Identify — asset management',                              app: true, map: 'ISO27001 A.5.9' },
      { code: 'ID.RA',  t: 'Identify — risk assessment',                               app: true, map: 'ISO27001 A.8.8 · E8 Patch apps' },
      { code: 'PR.AC',  t: 'Protect — identity management, authentication & access control', app: true, map: 'ISO27001 A.5.15 · SOC2 CC6.1' },
      { code: 'PR.AT',  t: 'Protect — awareness and training',                         app: true, map: 'ISO27001 A.6.3 · SOC2 CC1.4' },
      { code: 'PR.DS',  t: 'Protect — data security',                                  app: true, map: 'ISO27001 A.8.24 · SOC2 CC6.7' },
      { code: 'PR.IP',  t: 'Protect — information protection processes & procedures',  app: true, map: 'ISO27001 A.8.13 · E8 Backups' },
      { code: 'PR.PT',  t: 'Protect — protective technology',                          app: true, map: 'DISP ICT accreditation' },
      { code: 'DE.AE',  t: 'Detect — anomalies and events',                            app: true, map: 'ISO27001 A.8.15 · SOC2 CC7.2' },
      { code: 'DE.CM',  t: 'Detect — continuous monitoring',                          app: true, map: 'ISO27001 A.8.7 · E8 App control' },
      { code: 'DE.DP',  t: 'Detect — detection processes',                            app: true, map: 'SOC2 CC4.1' },
      { code: 'RS.RP',  t: 'Respond — response planning',                             app: true, map: 'DISP Incident reporting' },
      { code: 'RS.CO',  t: 'Respond — response communications',                       app: true, map: 'DISP Incident reporting' },
      { code: 'RS.AN',  t: 'Respond — response analysis',                             app: true, map: 'ISO27001 A.8.8' },
      { code: 'RC.RP',  t: 'Recover — recovery planning',                             app: true, map: 'ISO27001 A.5.30 · SOC2 A1.2' },
      { code: 'RC.CO',  t: 'Recover — recovery communications',                       app: true, map: 'ISO27001 A.5.30' }
    ]
  }
};
/* Sidebar / tab display order. Add new framework ids here. */
window.FRAMEWORK_ORDER = ['iso27001', 'soc2', 'essential8', 'iso42001', 'iso27701', 'dispirap', 'nistcsf'];

/* Flattened { fw, code, t, app, map } rows across every registered
   framework — used to seed the Controls list on first provisioning.
   Control codes must be unique across the WHOLE registry (not just
   within one framework) — they double as lookup keys for risks. */
function allControlSeeds() {
  var out = [];
  window.FRAMEWORK_ORDER.forEach(function (fw) {
    window.FRAMEWORKS[fw].controls.forEach(function (c) {
      out.push({ fw: fw, code: c.code, t: c.t, app: c.app, map: c.map });
    });
  });
  return out;
}
window.allControlSeeds = allControlSeeds;

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
  var KEY = 'checkpoint-demo-v2'; /* bumped: v1 predates multi-framework entitlements */
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
      controls: allControlSeeds().map(function (c, i) {
        if (c.fw === 'iso27001') {
          var demoSt = ['Implemented', 'In progress', 'Implemented', 'In progress', 'In progress', 'Not started', 'In progress', 'In progress', 'In progress', 'In progress', 'In progress', 'In progress', 'Implemented', 'Not started', 'Not started', 'Not applicable'];
          var demoOwn = ['M. Chen', 'K. Patel', 'S. Okafor', 'K. Patel', 'K. Patel', 'S. Okafor', 'M. Chen', 'S. Okafor', 'S. Okafor', 'S. Okafor', 'S. Okafor', 'S. Okafor', 'S. Okafor', 'S. Okafor', 'S. Okafor', '—'];
          var j = window.FRAMEWORKS.iso27001.controls.findIndex(function (x) { return x.code === c.code; });
          return {
            id: c.code, fw: c.fw, t: c.t, app: c.code !== 'A.8.28', st: demoSt[j],
            own: demoOwn[j], map: c.map,
            just: c.code === 'A.8.28' ? 'No in-house development; SaaS product engineering handled under supplier controls A.5.19–A.5.23.' : ''
          };
        }
        /* iso42001 not yet purchased in the demo — controls exist but untouched */
        return { id: c.code, fw: c.fw, t: c.t, app: c.app, st: 'Not started', own: '', map: c.map, just: '' };
      }),
      entitlements: { iso27001: true, soc2: false, essential8: false, iso42001: false, iso27701: false, dispirap: false, nistcsf: false },
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
    setEntitlement: async function (fw, enabled) { S.entitlements[fw] = enabled; persist(); },
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
      { name: 'Code', text: {} }, { name: 'Framework', text: {} }, { name: 'Applicable', boolean: {} }, { name: 'Status', text: {} },
      { name: 'Owner', text: {} }, { name: 'MapsTo', text: {} }, { name: 'Justification', text: { allowMultipleLines: true } }
    ],
    Scans: [
      { name: 'ScanDate', text: {} }, { name: 'Score', number: {} }, { name: 'Detail', text: { allowMultipleLines: true } }
    ],
    Activity: [
      { name: 'Message', text: { allowMultipleLines: true } }, { name: 'EntryDate', text: {} }
    ],
    Entitlements: [
      { name: 'FrameworkId', text: {} }, { name: 'Enabled', boolean: {} }
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
      if (k === 'Entitlements') await seedEntitlements(onStatus);
    }
    /* self-heal: a tenant provisioned before a new framework was added to
       the registry has a Controls list missing that framework's rows —
       add whatever's missing rather than requiring re-provisioning. */
    await reconcileControls(onStatus);
  }

  async function reconcileControls(onStatus) {
    var have = {};
    (await items('Controls')).forEach(function (i) {
      var f = i.fields;
      have[(f.Framework || 'iso27001') + '|' + f.Code] = true;
    });
    var missing = allControlSeeds().filter(function (c) { return !have[c.fw + '|' + c.code]; });
    if (!missing.length) return;
    if (onStatus) onStatus('Adding ' + missing.length + ' new framework control(s)…');
    for (var i = 0; i < missing.length; i++) {
      var c = missing[i];
      await addItem('Controls', { Title: c.t, Code: c.code, Framework: c.fw, Applicable: c.app, Status: 'Not started', Owner: '', MapsTo: c.map, Justification: '' });
    }
  }

  async function seedControls(onStatus) {
    if (onStatus) onStatus('Seeding framework control sets…');
    var seeds = allControlSeeds();
    for (var i = 0; i < seeds.length; i++) {
      var c = seeds[i];
      await addItem('Controls', {
        Title: c.t, Code: c.code, Framework: c.fw, Applicable: c.app, Status: 'Not started', Owner: '', MapsTo: c.map, Justification: ''
      });
    }
  }

  var entRowId = {}; /* fw -> SharePoint item id, for setEntitlement patches */
  async function seedEntitlements(onStatus) {
    if (onStatus) onStatus('Setting up framework entitlements…');
    for (var i = 0; i < window.FRAMEWORK_ORDER.length; i++) {
      var fw = window.FRAMEWORK_ORDER[i];
      var enabled = fw === 'iso27001'; /* ISO 27001 ships enabled by default; others activate on purchase */
      var id = await addItem('Entitlements', { Title: window.FRAMEWORKS[fw].name, FrameworkId: fw, Enabled: enabled });
      entRowId[fw] = id;
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
      var entItems = await items('Entitlements');

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
          return { _sp: i.id, id: f.Code, fw: f.Framework || 'iso27001', t: f.Title, app: !!f.Applicable, st: f.Status || 'Not started', own: f.Owner || '', map: f.MapsTo || '', just: f.Justification || '' };
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

      S.entitlements = {};
      entRowId = {};
      entItems.forEach(function (i) {
        var f = i.fields;
        if (!f.FrameworkId) return;
        S.entitlements[f.FrameworkId] = !!f.Enabled;
        entRowId[f.FrameworkId] = i.id;
      });
      /* frameworks added to the registry after this tenant was provisioned
         won't have a row yet — default them to disabled, not missing */
      window.FRAMEWORK_ORDER.forEach(function (fw) {
        if (!(fw in S.entitlements)) S.entitlements[fw] = false;
      });
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
    setEntitlement: async function (fw, enabled) {
      S.entitlements[fw] = enabled;
      if (entRowId[fw]) {
        await patchItem('Entitlements', entRowId[fw], { Enabled: enabled });
      } else {
        entRowId[fw] = await addItem('Entitlements', { Title: (window.FRAMEWORKS[fw] || {}).name || fw, FrameworkId: fw, Enabled: enabled });
      }
    },
    reset: null /* never bulk-delete client data from the console */
  };
})();
