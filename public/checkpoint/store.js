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
    blurb: 'Information security management system — the full 93-control Annex A (2022 revision), across Organizational, People, Physical and Technological themes.',
    controls: [
      /* A.5 — Organizational controls (37) */
      { code: 'A.5.1',  t: 'Policies for information security',                              app: true, map: 'SOC2 CC1.1 · NIST GV.PO' },
      { code: 'A.5.2',  t: 'Information security roles and responsibilities',                app: true, map: 'ISO42001 AI.3.2 · NIST GV.RR' },
      { code: 'A.5.3',  t: 'Segregation of duties',                                          app: true, map: 'SOC2 CC5.2' },
      { code: 'A.5.4',  t: 'Management responsibilities',                                    app: true, map: 'SOC2 CC1.1' },
      { code: 'A.5.5',  t: 'Contact with authorities',                                       app: true, map: 'DISP.1' },
      { code: 'A.5.6',  t: 'Contact with special interest groups',                           app: true, map: '' },
      { code: 'A.5.7',  t: 'Threat intelligence',                                            app: true, map: 'NIST ID.RA' },
      { code: 'A.5.8',  t: 'Information security in project management',                     app: true, map: 'SOC2 CC2.1' },
      { code: 'A.5.9',  t: 'Inventory of information and other associated assets',           app: true, map: 'SOC2 CC6.1 · NIST ID.AM' },
      { code: 'A.5.10', t: 'Acceptable use of information and other associated assets',      app: true, map: '' },
      { code: 'A.5.11', t: 'Return of assets',                                               app: true, map: '' },
      { code: 'A.5.12', t: 'Classification of information',                                  app: true, map: 'ISO27701 P.7.2.8' },
      { code: 'A.5.13', t: 'Labelling of information',                                        app: true, map: '' },
      { code: 'A.5.14', t: 'Information transfer',                                            app: true, map: 'SOC2 CC6.7' },
      { code: 'A.5.15', t: 'Access control',                                                  app: true, map: 'SOC2 CC6.1 · NIST PR.AA' },
      { code: 'A.5.16', t: 'Identity management',                                             app: true, map: 'SOC2 CC6.2 · NIST PR.AA' },
      { code: 'A.5.17', t: 'Authentication information',                                      app: true, map: 'SOC2 CC6.1 · E8.7' },
      { code: 'A.5.18', t: 'Access rights',                                                   app: true, map: 'SOC2 CC6.3' },
      { code: 'A.5.19', t: 'Information security in supplier relationships',                  app: true, map: 'SOC2 CC9.2 · DISP.12' },
      { code: 'A.5.20', t: 'Addressing information security within supplier agreements',      app: true, map: 'SOC2 CC9.2' },
      { code: 'A.5.21', t: 'Managing information security in the ICT supply chain',           app: true, map: 'DISP.12' },
      { code: 'A.5.22', t: 'Monitoring, review and change management of supplier services',   app: true, map: 'SOC2 CC9.2' },
      { code: 'A.5.23', t: 'Information security for use of cloud services',                  app: true, map: 'SOC2 CC6.7 · NIST PR.DS' },
      { code: 'A.5.24', t: 'Information security incident management planning & preparation', app: true, map: 'NIST RS.MA' },
      { code: 'A.5.25', t: 'Assessment and decision on information security events',          app: true, map: 'NIST DE.AE' },
      { code: 'A.5.26', t: 'Response to information security incidents',                      app: true, map: 'NIST RS.CO · DISP.10' },
      { code: 'A.5.27', t: 'Learning from information security incidents',                    app: true, map: 'NIST RC.CO' },
      { code: 'A.5.28', t: 'Collection of evidence',                                          app: true, map: '' },
      { code: 'A.5.29', t: 'Information security during disruption',                          app: true, map: 'NIST RC.RP' },
      { code: 'A.5.30', t: 'ICT readiness for business continuity',                           app: true, map: 'SOC2 A1.2 · NIST RC.RP' },
      { code: 'A.5.31', t: 'Legal, statutory, regulatory and contractual requirements',       app: true, map: 'ISO27701 P.7.2.2' },
      { code: 'A.5.32', t: 'Intellectual property rights',                                    app: true, map: '' },
      { code: 'A.5.33', t: 'Protection of records',                                           app: true, map: 'ISO27701 P.7.2.8' },
      { code: 'A.5.34', t: 'Privacy and protection of PII',                                   app: true, map: 'ISO27701 P.6.2.1' },
      { code: 'A.5.35', t: 'Independent review of information security',                      app: true, map: 'SOC2 CC4.1' },
      { code: 'A.5.36', t: 'Compliance with policies, rules and standards',                   app: true, map: 'SOC2 CC4.1' },
      { code: 'A.5.37', t: 'Documented operating procedures',                                 app: true, map: 'SOC2 CC5.2' },
      /* A.6 — People controls (8) */
      { code: 'A.6.1',  t: 'Screening',                                                       app: true, map: 'DISP.4' },
      { code: 'A.6.2',  t: 'Terms and conditions of employment',                              app: true, map: '' },
      { code: 'A.6.3',  t: 'Information security awareness, education and training',          app: true, map: 'SOC2 CC1.4 · NIST PR.AT' },
      { code: 'A.6.4',  t: 'Disciplinary process',                                            app: true, map: '' },
      { code: 'A.6.5',  t: 'Responsibilities after termination or change of employment',      app: true, map: 'SOC2 CC6.3' },
      { code: 'A.6.6',  t: 'Confidentiality or non-disclosure agreements',                    app: true, map: 'DISP.4' },
      { code: 'A.6.7',  t: 'Remote working',                                                  app: true, map: '' },
      { code: 'A.6.8',  t: 'Information security event reporting',                            app: true, map: 'ISO42001 AI.4.4' },
      /* A.7 — Physical controls (14) */
      { code: 'A.7.1',  t: 'Physical security perimeters',                                    app: true, map: 'DISP.6' },
      { code: 'A.7.2',  t: 'Physical entry',                                                  app: true, map: 'DISP.6' },
      { code: 'A.7.3',  t: 'Securing offices, rooms and facilities',                          app: true, map: '' },
      { code: 'A.7.4',  t: 'Physical security monitoring',                                    app: true, map: '' },
      { code: 'A.7.5',  t: 'Protecting against physical and environmental threats',           app: true, map: '' },
      { code: 'A.7.6',  t: 'Working in secure areas',                                         app: true, map: 'DISP.13' },
      { code: 'A.7.7',  t: 'Clear desk and clear screen',                                     app: true, map: '' },
      { code: 'A.7.8',  t: 'Equipment siting and protection',                                 app: true, map: '' },
      { code: 'A.7.9',  t: 'Security of assets off-premises',                                 app: true, map: '' },
      { code: 'A.7.10', t: 'Storage media',                                                   app: true, map: 'SOC2 CC6.7' },
      { code: 'A.7.11', t: 'Supporting utilities',                                            app: true, map: '' },
      { code: 'A.7.12', t: 'Cabling security',                                                app: true, map: '' },
      { code: 'A.7.13', t: 'Equipment maintenance',                                           app: true, map: '' },
      { code: 'A.7.14', t: 'Secure disposal or re-use of equipment',                          app: true, map: 'ISO27701 P.7.4.9' },
      /* A.8 — Technological controls (34) */
      { code: 'A.8.1',  t: 'User endpoint devices',                                           app: true, map: 'NIST PR.DS' },
      { code: 'A.8.2',  t: 'Privileged access rights',                                        app: true, map: 'SOC2 CC6.3 · E8.5 · NIST PR.AA' },
      { code: 'A.8.3',  t: 'Information access restriction',                                  app: true, map: 'SOC2 CC6.1' },
      { code: 'A.8.4',  t: 'Access to source code',                                            app: true, map: 'SOC2 CC8.1' },
      { code: 'A.8.5',  t: 'Secure authentication',                                            app: true, map: 'SOC2 CC6.1 · E8.7 · NIST PR.AA' },
      { code: 'A.8.6',  t: 'Capacity management',                                             app: true, map: '' },
      { code: 'A.8.7',  t: 'Protection against malware',                                      app: true, map: 'SOC2 CC6.8 · E8.1 · NIST DE.CM' },
      { code: 'A.8.8',  t: 'Management of technical vulnerabilities',                         app: true, map: 'SOC2 CC7.1 · E8.2 · NIST ID.RA' },
      { code: 'A.8.9',  t: 'Configuration management',                                        app: true, map: 'SOC2 CC5.2' },
      { code: 'A.8.10', t: 'Information deletion',                                            app: true, map: 'ISO27701 P.7.4.9' },
      { code: 'A.8.11', t: 'Data masking',                                                     app: true, map: 'ISO27701 P.7.4.4' },
      { code: 'A.8.12', t: 'Data leakage prevention',                                          app: true, map: 'NIST PR.DS' },
      { code: 'A.8.13', t: 'Information backup',                                              app: true, map: 'SOC2 A1.2 · E8.8 · NIST PR.DS' },
      { code: 'A.8.14', t: 'Redundancy of information processing facilities',                 app: true, map: 'NIST PR.IR' },
      { code: 'A.8.15', t: 'Logging',                                                         app: true, map: 'SOC2 CC7.2 · NIST DE.AE' },
      { code: 'A.8.16', t: 'Monitoring activities',                                           app: true, map: 'SOC2 CC4.1 · NIST DE.CM' },
      { code: 'A.8.17', t: 'Clock synchronization',                                           app: true, map: '' },
      { code: 'A.8.18', t: 'Use of privileged utility programs',                              app: true, map: 'SOC2 CC6.3' },
      { code: 'A.8.19', t: 'Installation of software on operational systems',                 app: true, map: 'SOC2 CC6.8 · E8.1' },
      { code: 'A.8.20', t: 'Networks security',                                               app: true, map: 'NIST PR.IR' },
      { code: 'A.8.21', t: 'Security of network services',                                    app: true, map: '' },
      { code: 'A.8.22', t: 'Segregation of networks',                                         app: true, map: 'NIST PR.IR' },
      { code: 'A.8.23', t: 'Web filtering',                                                   app: true, map: '' },
      { code: 'A.8.24', t: 'Use of cryptography',                                             app: true, map: 'SOC2 CC6.7 · NIST PR.DS' },
      { code: 'A.8.25', t: 'Secure development life cycle',                                   app: true, map: 'ISO42001 AI.6.2.3' },
      { code: 'A.8.26', t: 'Application security requirements',                               app: true, map: 'SOC2 CC8.1' },
      { code: 'A.8.27', t: 'Secure system architecture and engineering principles',           app: true, map: '' },
      { code: 'A.8.28', t: 'Secure coding',                                                   app: true, map: 'SOC2 CC8.1' },
      { code: 'A.8.29', t: 'Security testing in development and acceptance',                  app: true, map: 'ISO42001 AI.6.2.6' },
      { code: 'A.8.30', t: 'Outsourced development',                                          app: true, map: 'SOC2 CC9.2' },
      { code: 'A.8.31', t: 'Separation of development, test and production environments',     app: true, map: '' },
      { code: 'A.8.32', t: 'Change management',                                               app: true, map: 'SOC2 CC8.1 · ISO42001 AI.6.2.3' },
      { code: 'A.8.33', t: 'Test information',                                                app: true, map: '' },
      { code: 'A.8.34', t: 'Protection of information systems during audit testing',          app: true, map: 'DISP.16' }
    ]
  },
  soc2: {
    id: "soc2", name: "SOC 2", tag: "Trust",
    blurb: "Trust Services Criteria (2017, revised 2022) — the full mandatory Common Criteria (Security) series plus Availability, Confidentiality, Processing Integrity and Privacy, across control environment, communication, risk assessment, monitoring, control activities, access controls, system operations, change management and the four optional categories. The certification US and global enterprise buyers require before signing SaaS contracts.",
    /* Full control set ships as an encrypted content pack (checkpoint-content/soc2.json -> dist/checkpoint/packs/) -- merged in at runtime by mergeLicensedPacks() in app.js the moment a verified activation licenses this module. Empty here (rather than absent) so every place that reads window.FRAMEWORKS[fw].controls before a pack ever loads (or when it's unlicensed) gets a safe, empty array instead of a crash. */
    controls: []
  },
  essential8: {
    id: "essential8", name: "Essential Eight", tag: "Cyber Controls",
    blurb: "ASD's eight mitigation strategies, assessed against the ACSC Essential Eight Maturity Model's three maturity levels (ML1-ML3) per strategy rather than as a flat checklist — set the client's target level in Settings. Maturity Level Two is mandatory for Commonwealth entities and increasingly required across government supply chains.",
    /* Full control set ships as an encrypted content pack (checkpoint-content/essential8.json -> dist/checkpoint/packs/) -- merged in at runtime by mergeLicensedPacks() in app.js the moment a verified activation licenses this module. Empty here (rather than absent) so every place that reads window.FRAMEWORKS[fw].controls before a pack ever loads (or when it's unlicensed) gets a safe, empty array instead of a crash. */
    controls: []
  },
  iso42001: {
    id: "iso42001", name: "ISO 42001", tag: "AI Governance",
    blurb: "AI management system — the full Annex A control set (2023), across policies, resourcing, impact assessment, life cycle, data, disclosure, use and third-party relationships. Early-mover certification enterprise AI buyers are starting to demand.",
    /* Full control set ships as an encrypted content pack (checkpoint-content/iso42001.json -> dist/checkpoint/packs/) -- merged in at runtime by mergeLicensedPacks() in app.js the moment a verified activation licenses this module. Empty here (rather than absent) so every place that reads window.FRAMEWORKS[fw].controls before a pack ever loads (or when it's unlicensed) gets a safe, empty array instead of a crash. */
    controls: []
  },
  iso27701: {
    id: "iso27701", name: "ISO 27701", tag: "Privacy",
    blurb: "Privacy Information Management System — extends ISO 27001 into privacy for organisations handling sensitive personal data under the Privacy Act, GDPR or health regulation. Full Annex A (31 PII controller controls) and Annex B (18 PII processor controls), 2019 edition.",
    /* Full control set ships as an encrypted content pack (checkpoint-content/iso27701.json -> dist/checkpoint/packs/) -- merged in at runtime by mergeLicensedPacks() in app.js the moment a verified activation licenses this module. Empty here (rather than absent) so every place that reads window.FRAMEWORKS[fw].controls before a pack ever loads (or when it's unlicensed) gets a safe, empty array instead of a crash. */
    controls: []
  },
  dispirap: {
    id: "dispirap", name: "DISP / IRAP", tag: "Defence",
    blurb: "Defence Industry Security Program (DISP) membership obligations across the four security domains — Governance, Personnel, Physical and ICT/Cyber — organised by membership level (Entry, Level 1, Level 2, Level 3) so a client only sees what applies to the level they hold or are pursuing. ICT controls carry an ISM chapter reference for IRAP-facing engagements.",
    /* Full control set ships as an encrypted content pack (checkpoint-content/dispirap.json -> dist/checkpoint/packs/) -- merged in at runtime by mergeLicensedPacks() in app.js the moment a verified activation licenses this module. Empty here (rather than absent) so every place that reads window.FRAMEWORKS[fw].controls before a pack ever loads (or when it's unlicensed) gets a safe, empty array instead of a crash. */
    controls: []
  },
  nistcsf: {
    id: "nistcsf", name: "NIST CSF", tag: "Risk Framework",
    blurb: "Cybersecurity Framework 2.0 — the full set of 22 categories across Govern, Identify, Protect, Detect, Respond and Recover. Favoured by boards and US-aligned partners, mapped to ISO 27001 and Essential Eight so nothing is done twice.",
    /* Full control set ships as an encrypted content pack (checkpoint-content/nistcsf.json -> dist/checkpoint/packs/) -- merged in at runtime by mergeLicensedPacks() in app.js the moment a verified activation licenses this module. Empty here (rather than absent) so every place that reads window.FRAMEWORKS[fw].controls before a pack ever loads (or when it's unlicensed) gets a safe, empty array instead of a crash. */
    controls: []
  }
};
/* Sidebar / tab display order. Add new framework ids here. */
window.FRAMEWORK_ORDER = ['iso27001', 'soc2', 'essential8', 'iso42001', 'iso27701', 'dispirap', 'nistcsf'];

/* Purchasable add-on capabilities that are NOT compliance frameworks —
   they never appear in the sidebar's framework list, the Statement of
   Applicability, or a report, so they deliberately live in their own
   list rather than FRAMEWORK_ORDER. Granted/revoked through the exact
   same entitlement mechanism as a framework (an id in the signed
   activation's `frameworks` array — see tools/issue-entitlement.mjs's
   GRANTABLE_IDS — and, for 'ai', a content-pack module key the same
   way soc2/essential8/etc. get one), just checked as
   S.entitlements.<id> instead of gating a framework's control set.
   'ai' ships a small encrypted pack (checkpoint-content/ai.json) whose
   payload isn't a framework/control set at all — see
   mergeLicensedPacks()'s 'ai' branch in app.js. */
window.ADDON_MODULES = ['ai'];
/* Display name for an add-on module id, for anywhere that currently
   calls fwName(id) / expects a human label — e.g. toggleEntitlement()'s
   toast in app.js. Frameworks use window.FRAMEWORKS[fw].name; add-ons
   aren't in that dict at all (see ADDON_MODULES's comment above), so
   they get their own tiny lookup instead. */
window.ADDON_MODULE_NAMES = { ai: 'AI assistant' };

/* Flattened { fw, code, t, app, map } rows across every registered
   framework — used to seed the Controls list on first provisioning.
   Control codes must be unique across the WHOLE registry (not just
   within one framework) — they double as lookup keys for risks. */
function allControlSeeds() {
  var out = [];
  window.FRAMEWORK_ORDER.forEach(function (fw) {
    window.FRAMEWORKS[fw].controls.forEach(function (c) {
      out.push({ fw: fw, code: c.code, t: c.t, app: c.app, map: c.map, cat: c.cat, lvl: c.lvl, domain: c.domain, membershipLevel: c.membershipLevel, ismChapter: c.ismChapter });
    });
  });
  return out;
}
window.allControlSeeds = allControlSeeds;

/* A small, deliberately-partial illustrative slice (~10 real controls
   each, out of each framework's full 22-51) for the 6 premium
   frameworks, used ONLY to seed demo mode's example tenant — never the
   full paid registry, which ships only as an encrypted content pack
   (checkpoint-content/*.json) to a genuinely licensed real tenant. This
   is what lets a prospect explore every framework's structure and the
   app's UI in demo mode without this file (which DOES ship in the
   bundle) containing the complete premium content an unlicensed copy
   of the app shouldn't have. Same seed-row shape as allControlSeeds()'s
   output, so DemoStore's seed() can treat them identically. */
window.DEMO_FRAMEWORK_SEEDS = {
  soc2: [
    { fw: "soc2", code: "CC1.1", t: "Commitment to integrity and ethical values", app: true, map: "ISO27001 A.5.1 · NIST GV.PO", cat: "CC" },
    { fw: "soc2", code: "CC2.1", t: "Communication of internal control information", app: true, map: "ISO27001 A.5.1", cat: "CC" },
    { fw: "soc2", code: "CC3.4", t: "Identification and assessment of changes", app: true, map: "ISO27001 A.8.32", cat: "CC" },
    { fw: "soc2", code: "CC5.3", t: "Deployment through policies and procedures", app: true, map: "ISO27001 A.5.37", cat: "CC" },
    { fw: "soc2", code: "CC6.6", t: "Logical access boundary protections", app: true, map: "ISO27001 A.8.7 · E8.1", cat: "CC" },
    { fw: "soc2", code: "CC7.3", t: "Evaluation of security incidents", app: true, map: "ISO27001 A.5.25", cat: "CC" },
    { fw: "soc2", code: "A1.1", t: "Capacity monitoring and forecasting against current and projected demand", app: true, map: "ISO27001 A.8.6", cat: "A" },
    { fw: "soc2", code: "PI1.1", t: "Data quality requirements defined for processing inputs", app: true, map: "ISO42001 AI.7.4", cat: "PI" },
    { fw: "soc2", code: "P2.1", t: "Choice and consent obtained for collection and use of personal information", app: true, map: "ISO27701 P.7.2.3 · P.7.2.4", cat: "P" },
    { fw: "soc2", code: "P8.1", t: "Ongoing monitoring and enforcement of privacy commitments, including complaint handling", app: true, map: "ISO27001 A.5.35", cat: "P" }
  ],
  essential8: [
    { fw: "essential8", code: "E8.1", t: "Application control", app: true, map: "ISO27001 A.8.19 · SOC2 CC6.8" },
    { fw: "essential8", code: "E8.1-ML3", t: "Coverage extended to all servers with hash/publisher rules; execution logs centrally analysed", app: true, map: "", lvl: 3 },
    { fw: "essential8", code: "E8.2-ML2", t: "Weekly scans; extreme-risk patches applied within 48 hours across internet-facing and office apps", app: true, map: "", lvl: 2 },
    { fw: "essential8", code: "E8.3-ML2", t: "Macros restricted to vetted, centrally-managed locations or signed by a trusted publisher", app: true, map: "", lvl: 2 },
    { fw: "essential8", code: "E8.4-ML1", t: "Browsers block Flash, ads and Java content served from the internet", app: true, map: "", lvl: 1 },
    { fw: "essential8", code: "E8.5-ML1", t: "Privileged access validated on request; privileged accounts blocked from email and web browsing", app: true, map: "", lvl: 1 },
    { fw: "essential8", code: "E8.6", t: "Patch operating systems", app: true, map: "ISO27001 A.8.8 · NIST ID.RA" },
    { fw: "essential8", code: "E8.7", t: "Multi-factor authentication", app: true, map: "ISO27001 A.8.5 · SOC2 CC6.1" },
    { fw: "essential8", code: "E8.7-ML3", t: "Phishing-resistant MFA enforced for every user on every system; MFA logs centrally analysed", app: true, map: "", lvl: 3 },
    { fw: "essential8", code: "E8.8-ML3", t: "Restoration exercised as part of disaster-recovery testing; only dedicated backup admins can modify or delete backups", app: true, map: "", lvl: 3 }
  ],
  iso42001: [
    { fw: "iso42001", code: "AI.2.2", t: "Policy for responsible development & use of AI", app: true, map: "ISO27001 A.5.1 · EU AI Act Art.9" },
    { fw: "iso42001", code: "AI.3.3", t: "Reporting of concerns about AI systems", app: true, map: "ISO27001 A.6.8" },
    { fw: "iso42001", code: "AI.4.4", t: "Tooling resources", app: true, map: "" },
    { fw: "iso42001", code: "AI.5.3", t: "Documentation of AI system impact assessment", app: true, map: "" },
    { fw: "iso42001", code: "AI.6.1.3", t: "Processes for responsible design and development", app: true, map: "ISO27001 A.8.25" },
    { fw: "iso42001", code: "AI.6.2.5", t: "AI system deployment", app: true, map: "" },
    { fw: "iso42001", code: "AI.7.3", t: "Acquisition of data", app: true, map: "" },
    { fw: "iso42001", code: "AI.8.2", t: "System documentation & information for AI users", app: true, map: "ISO27001 A.5.9" },
    { fw: "iso42001", code: "AI.9.2", t: "Processes for responsible use of AI systems", app: true, map: "ISO27001 A.5.2" },
    { fw: "iso42001", code: "AI.10.4", t: "Customers", app: true, map: "" }
  ],
  iso27701: [
    { fw: "iso27701", code: "P.6.2.1", t: "Policies for information security addressing privacy", app: true, map: "ISO27001 A.5.1" },
    { fw: "iso27701", code: "P.7.2.5", t: "Privacy impact assessment", app: true, map: "ISO42001 AI.5.2" },
    { fw: "iso27701", code: "P.7.3.3", t: "Information for decisions on automated processing", app: true, map: "ISO42001 AI.9.3" },
    { fw: "iso27701", code: "P.7.3.8", t: "Respond to PII principal requests within a defined timeframe", app: true, map: "" },
    { fw: "iso27701", code: "P.7.4.4", t: "PII minimisation objectives", app: true, map: "ISO42001 AI.7.4" },
    { fw: "iso27701", code: "P.7.4.9", t: "De-identification and deletion at end of processing", app: true, map: "ISO27001 A.8.13" },
    { fw: "iso27701", code: "P.8.2.2", t: "Organization's purposes for processing PII", app: true, map: "ISO27001 A.5.19" },
    { fw: "iso27701", code: "P.8.3.1", t: "Determine and fulfil obligations to PII principals (processor)", app: true, map: "ISO42001 AI.9.2" },
    { fw: "iso27701", code: "P.8.5.2", t: "Maintain a list of countries and organisations PII may be transferred to, on the customer's behalf", app: true, map: "ISO27001 A.5.31" },
    { fw: "iso27701", code: "P.8.5.8", t: "Notify the customer of, and allow objection to, any change of subcontractor processing PII", app: true, map: "ISO27001 A.5.22" }
  ],
  dispirap: [
    { fw: "dispirap", code: "DISP.1", t: "Membership eligibility criteria maintained (Australian entity, ownership/control disclosed, no adverse security information)", app: true, map: "ISO27001 A.5.1", domain: "Governance", membershipLevel: "Entry" },
    { fw: "dispirap", code: "DISP.4", t: "Personnel security policy mandating screening, vetting and confidentiality agreements established", app: true, map: "ISO27001 A.6.1 · A.6.6", domain: "Governance", membershipLevel: "Entry" },
    { fw: "dispirap", code: "DISP.26", t: "Supply chain and subcontractor security risk assessed", app: true, map: "SOC2 CC9.2 · ISO27001 A.5.19", domain: "Governance", membershipLevel: "L1" },
    { fw: "dispirap", code: "DISP.30", t: "Notifiable changes (ownership, CSO, address, adverse security information) reported to Defence within required timeframe", app: true, map: "ISO27001 A.5.5", domain: "Governance", membershipLevel: "Entry" },
    { fw: "dispirap", code: "DISP.9", t: "Confidentiality / non-disclosure agreements executed for personnel with access to Defence information", app: true, map: "ISO27001 A.6.6", domain: "Personnel", membershipLevel: "Entry" },
    { fw: "dispirap", code: "DISP.32", t: "Contact reporting obligations communicated to and actioned by cleared personnel (unauthorised contact / elicitation attempts)", app: true, map: "ISO27001 A.5.5", domain: "Personnel", membershipLevel: "L1" },
    { fw: "dispirap", code: "DISP.15", t: "Visitor and access control at facilities holding classified material", app: true, map: "ISO27001 A.7.2", domain: "Physical", membershipLevel: "L1" },
    { fw: "dispirap", code: "DISP.17", t: "System security plan maintained per the ISM", app: true, map: "ISO27001 A.8.15", domain: "ICT", membershipLevel: "L1", ismChapter: "Guidelines for Cyber Security Documentation" },
    { fw: "dispirap", code: "DISP.21", t: "Cross-domain solution controls where systems of different classifications are connected", app: true, map: "ISO27001 A.8.22", domain: "ICT", membershipLevel: "L3", ismChapter: "Guidelines for Gateways" },
    { fw: "dispirap", code: "DISP.34", t: "ICT security incident detection and reporting per the ISM", app: true, map: "ISO27001 A.5.24 · NIST RS.CO", domain: "ICT", membershipLevel: "L1", ismChapter: "Guidelines for Cyber Security Incidents" }
  ],
  nistcsf: [
    { fw: "nistcsf", code: "GV.OC", t: "Organizational context", app: true, map: "ISO27001 A.5.1 · DISP.3" },
    { fw: "nistcsf", code: "GV.RR", t: "Roles, responsibilities and authorities", app: true, map: "ISO27001 A.5.2 · SOC2 CC1.3" },
    { fw: "nistcsf", code: "GV.OV", t: "Oversight", app: true, map: "SOC2 CC1.2" },
    { fw: "nistcsf", code: "ID.RA", t: "Risk assessment", app: true, map: "ISO27001 A.8.8 · E8.2" },
    { fw: "nistcsf", code: "PR.AA", t: "Identity management, authentication & access control", app: true, map: "ISO27001 A.5.15 · SOC2 CC6.1" },
    { fw: "nistcsf", code: "PR.DS", t: "Data security", app: true, map: "ISO27001 A.8.24 · SOC2 CC6.7" },
    { fw: "nistcsf", code: "DE.CM", t: "Continuous monitoring", app: true, map: "ISO27001 A.8.16 · E8.1" },
    { fw: "nistcsf", code: "RS.MA", t: "Incident management", app: true, map: "ISO27001 A.5.24 · SOC2 CC7.4" },
    { fw: "nistcsf", code: "RS.CO", t: "Incident response reporting & communication", app: true, map: "DISP.27" },
    { fw: "nistcsf", code: "RC.CO", t: "Incident recovery communication", app: true, map: "ISO27001 A.5.30 · A.5.27" }
  ]
};

/* NIST CSF 2.0 subcategories (106) — public domain, so full text is
   permitted, but kept concise here rather than copied verbatim.
   Deliberately NOT part of window.FRAMEWORKS.nistcsf.controls (which
   stays the 22-category set that feeds allControlSeeds() and therefore
   automatic provisioning for every nistcsf-entitled tenant) — these are
   lazily seeded into a tenant's Controls list only when its nistDepth
   setting is switched to 'subcategory' (see ensureNistSubcategories()
   in both stores below and App.setNistDepth in app.js), so a
   light-touch client working at category depth is never flooded with
   106 rows it never asked for.
   `parent` is definitional metadata (which category a subcategory rolls
   up to) — the same "not persisted to SharePoint, looked up from this
   registry at render/report time" treatment as SOC 2's `cat` and
   Essential Eight's `lvl`.
   NUMBERING NOTE — human review needed before this is relied on for a
   real assessment. Subcategory identifiers are reconstructed from
   general knowledge of the published NIST CSF 2.0 (February 2024), not
   the document itself. Several categories intentionally have
   non-contiguous numbering (PR.DS, DE.CM, DE.AE, RS.AN, RS.CO — CSF 1.1
   subcategory IDs that were retained keep their original number; the
   ones merged or retired in between were not renumbered) — that's
   expected, not a gap in this list, but confirm the exact set against
   nist.gov/cyberframework before relying on it for a real assessment. */
window.NIST_SUBCATEGORIES = [
  /* Full 106-subcategory set ships as part of the encrypted nistcsf
     content pack (checkpoint-content/nistcsf.json, extra.subcategories)
     — merged in here at runtime by mergeLicensedPacks() in app.js once
     a verified activation licenses nistcsf. Empty until then, same
     fail-safe-empty-array treatment as the premium FRAMEWORKS stubs
     above. */
];

/* Flattened seed rows for NIST_SUBCATEGORIES, same shape as
   allControlSeeds()'s output — used only by ensureNistSubcategories()
   below, never by the automatic-provisioning path. */
function nistSubcategorySeeds() {
  return window.NIST_SUBCATEGORIES.map(function (c) { return { fw: 'nistcsf', code: c.code, t: c.t, app: true, map: '', parent: c.parent }; });
}
window.nistSubcategorySeeds = nistSubcategorySeeds;

/* Posture checks Checkpoint runs, grouped by area so the scan visibly
   covers every part of the frameworks — not just identity/device basics.
   tpl links a failed/review check to a proposed risk + remediation
   actions in TPL (app.js). scored:false checks have no Graph signal at
   all (e.g. policy sign-off, training completion) — they always show
   "Manual — verify" and are excluded from the numeric posture score so
   honest manual flags never drag the score down artificially.
   requiresCapability names one of graph.js's CAPABILITY_PROBES keys —
   declarative metadata for the UI (the Coverage card and the Dashboard's
   "X of 22 checks automatable" line in app.js) to know which checks a
   missing licence/permission affects, without re-deriving graph.js's own
   control flow. graph.js's runPostureChecks() independently consults
   Graph.detectCapabilities() to decide whether to skip each of these
   checks' real network call — this field doesn't drive that decision,
   it mirrors it for display; keep both in sync by hand if either
   changes (five capability areas, twelve checks between them — small
   enough that a single source of truth isn't worth the indirection). */
window.CHECK_DEFS = [
  /* Identity (7) */
  { id: 'mfa-all',    area: 'Identity', label: 'MFA enforced — all users',                    tpl: null,        scored: true, requiresCapability: 'conditionalAccess' },
  { id: 'mfa-priv',   area: 'Identity', label: 'Phishing-resistant MFA — privileged roles',    tpl: 'mfa-priv',  scored: true, requiresCapability: 'conditionalAccess' },
  { id: 'legacy',     area: 'Identity', label: 'Legacy authentication blocked',                tpl: 'legacy',    scored: true, requiresCapability: 'conditionalAccess' },
  { id: 'admins',     area: 'Identity', label: 'Global admin count within threshold',          tpl: 'admins',    scored: true },
  { id: 'pim',        area: 'Identity', label: 'Privileged roles use eligible (PIM) assignment', tpl: 'pim',     scored: true, requiresCapability: 'pim' },
  { id: 'guests',     area: 'Identity', label: 'External guest user count within threshold',   tpl: null,        scored: true },
  { id: 'riskyusers', area: 'Identity', label: 'Risky sign-ins & risky users addressed',       tpl: 'riskyusers', scored: true, requiresCapability: 'identityProtection' },
  /* Devices (3) */
  { id: 'device',     area: 'Devices',  label: 'Device compliance policies enforced',          tpl: null,        scored: true, requiresCapability: 'intune' },
  { id: 'compliance-policy', area: 'Devices', label: 'Compliance policies configured for the device fleet', tpl: null, scored: true, requiresCapability: 'intune' },
  { id: 'patch',      area: 'Devices',  label: 'OS & application patch currency',              tpl: 'patch',     scored: true, requiresCapability: 'secureScore' },
  /* Apps & Data (5) */
  { id: 'wdac',       area: 'Apps & Data', label: 'Application control (WDAC) deployed',       tpl: 'wdac',      scored: true, requiresCapability: 'secureScore' },
  { id: 'macro',      area: 'Apps & Data', label: 'Office macro settings hardened',            tpl: null,        scored: true, requiresCapability: 'secureScore' },
  { id: 'riskyapps',  area: 'Apps & Data', label: 'No high-privilege, unreviewed OAuth app grants', tpl: 'riskyapps', scored: true },
  { id: 'dlp',        area: 'Apps & Data', label: 'Sensitivity labels & DLP policies published', tpl: null,      scored: false },
  { id: 'sharing',    area: 'Apps & Data', label: 'External sharing restricted (SharePoint/OneDrive)', tpl: null, scored: false },
  /* Monitoring (2) */
  { id: 'logging',    area: 'Monitoring', label: 'Unified audit logging enabled',              tpl: null,        scored: true, requiresCapability: 'secureScore' },
  { id: 'alerts',     area: 'Monitoring', label: 'Security alerts triaged & threat protection enabled', tpl: null, scored: true, requiresCapability: 'secureScore' },
  /* Continuity & Supplier (3) */
  { id: 'backup',     area: 'Continuity', label: 'Backup coverage & restore testing',          tpl: 'backup',    scored: false },
  { id: 'bcp',        area: 'Continuity', label: 'Business continuity / disaster recovery plan documented & tested', tpl: null, scored: false },
  { id: 'supplier',   area: 'Supplier',   label: 'Supplier security assessments current',      tpl: null,        scored: false },
  /* Governance (2) */
  { id: 'policy',     area: 'Governance', label: 'Information security policy published & reviewed', tpl: null,  scored: false },
  { id: 'training',   area: 'Governance', label: 'Security awareness training completion',     tpl: null,        scored: false }
];

/* Optional dashboard/workflow features — practitioners can switch these
   off per client from the Features view without losing any data.
   Shared by both stores so there is one source of truth for defaults. */
window.FEATURE_DEFS = [
  { key: 'featRoadmap',  label: 'Certification roadmap',       desc: 'Show the Assess → Implement → Evidence → Certify progress bar on the Dashboard.' },
  { key: 'featTrend',    label: 'Control readiness trend',     desc: 'Overlay control-readiness history on the posture score sparkline.' },
  { key: 'featAppetite', label: 'Risk appetite banner',        desc: 'Show a Dashboard banner when residual risks exceed your set appetite.' }
];
/* Posture-scan thresholds — configurable per client so a check written
   against Microsoft's general guidance can still be tuned to a client's
   actual environment. Every value is read with a hard-coded fallback in
   graph.js's runPostureChecks, so a tenant whose Settings list predates
   one of these keys keeps behaving exactly as it did before. */
window.THRESHOLD_DEFS = [
  { key: 'maxGlobalAdmins', label: 'Max Global Administrators (pass)', desc: "Microsoft recommends 2–4 emergency-access/Global Admin accounts. At or under this many is a pass; the review threshold is double this value.", def: '4' },
  { key: 'maxGuests', label: 'Max guest users (pass)', desc: 'At or under this many external guest accounts is a pass; the review threshold is triple this value.', def: '25' },
  { key: 'maxPermanentPrivileged', label: 'Max permanent privileged assignments (pass)', desc: 'Microsoft recommends privileged directory roles be eligible via PIM rather than standing assignments — 0 standing assignments is the target. The review threshold allows 3 more than this value (e.g. break-glass accounts).', def: '0' },
  { key: 'deviceCompliancePassPct', label: 'Device compliance pass %', desc: 'Percentage of Intune-managed devices reporting compliant, at or above which the check passes.', def: '95' },
  { key: 'deviceComplianceReviewPct', label: 'Device compliance review %', desc: 'Below the pass % but at or above this value is a review; below this is a fail.', def: '80' },
  { key: 'riskyUsersReviewMax', label: 'Max risky users (review)', desc: 'Zero flagged risky users is a pass; at or under this many is a review; more is a fail.', def: '3' }
];
window.DEFAULT_SETTINGS = {
  riskAppetite: 'Medium',
  scanCadenceDays: '30',
  /* Light "paper" theme — 'true'|'false'. Read once at boot (bootUi()
     in app.js, before the first render) to set the data-theme
     attribute without a flash of the wrong theme; toggled via the
     Settings row or the command palette (App.toggleLightTheme). */
  lightTheme: 'false',
  /* Essential Eight target maturity level ('ML1'|'ML2'|'ML3'). The SoA
     shows only strategy levels up to this target, and readiness % for
     essential8 is computed against it rather than the whole model. */
  e8TargetLevel: 'ML2',
  /* NIST CSF depth ('category'|'subcategory'). At 'category' the SoA
     shows the 22 categories as always. At 'subcategory' it shows the
     106 subcategories grouped under their category, lazily seeded into
     the tenant's Controls list the first time this switches on — see
     ensureNistSubcategories() and App.setNistDepth. */
  nistDepth: 'category',
  /* DISP target membership level ('Entry'|'L1'|'L2'|'L3'). The SoA shows
     only controls at or below this level, and DISP/IRAP readiness % is
     computed against it — same mechanism as e8TargetLevel. Defaults to
     L1 rather than Entry since most engagements at this stage are
     already handling PROTECTED information, not just pursuing bare
     eligibility. */
  dispTargetLevel: 'L1',
  /* Set once, at the end of the first-run onboarding wizard (see
     Wizard in app.js) — an ISO date string, or '' for a tenant that
     hasn't completed it yet. SpStore.probeOnboardingState() reads this
     (via a lightweight, read-only lookup, before any provisioning) to
     decide whether a signed-in session goes straight to the dashboard
     or into the wizard. "Re-run setup" (Frameworks view) clears it. */
  onboardedDate: '',
  featRoadmap: 'true',
  featTrend: 'true',
  featAppetite: 'true',
  maxGlobalAdmins: '4',
  maxGuests: '25',
  maxPermanentPrivileged: '0',
  deviceCompliancePassPct: '95',
  deviceComplianceReviewPct: '80',
  riskyUsersReviewMax: '3',
  /* Trust Center — what a generated public page is allowed to show.
     Off by default wherever disclosure is the more sensitive choice
     (sub-processors); on by default for what trust pages conventionally
     always show. The practitioner controls all of this from the Trust
     Center view before ever generating a page. */
  trustCenterShowCerts: 'true',
  trustCenterShowSoaPct: 'true',
  trustCenterShowSubProcessors: 'false',
  trustCenterShowPosture: 'true',
  trustCenterCompanyName: '',
  trustCenterContactEmail: '',
  /* Email digest — opt-in, off by default. digestRecipients is a
     comma-separated list, same format App.emailStatusUpdate already
     collects ad hoc; digestFrequency is 'Weekly' or 'Monthly', used to
     compute whether a digest is due (see the digest-due banner in
     renderDash()) against digestLastSent, an ISO date string set the
     moment App.sendDigestNow() last completed a send — same "'' means
     never" convention as onboardedDate above. There's no backend here
     to send this unattended; it's a nudge on load, exactly like the
     scan-cadence reminder, until the scheduled Function/Logic App
     (SETUP.md § Continuous monitoring) is deployed to send it too. */
  digestEnabled: 'false',
  digestRecipients: '',
  digestFrequency: 'Weekly',
  digestLastSent: '',
  /* Cache of the last-verified signed entitlement file — the raw
     {payload, signature} JSON exactly as uploaded, re-verified and
     re-evaluated (expiry checked against "today") on every load rather
     than trusted at face value forever, so an expiry date is honoured
     even if nobody re-opens the Frameworks view. '' means no
     entitlement file has ever been applied to this tenant — in which
     case the Entitlements list's own provisioning default (iso27001
     only) stands untouched; see reconcileEntitlementsOnLoad() in
     app.js. The Entitlements list itself remains a derived CACHE of
     whatever this resolves to on each load, never the source of truth
     — see the comment there for the full design. */
  entitlementFile: '',
  /* Last app version this tenant's browser has seen the "what's new"
     toast for (see checkForNewVersion() in app.js) — compared against
     window.CHECKPOINT_VERSION (version.js) on every load. '' means
     never tracked (a brand-new tenant, or one onboarded before this
     feature existed) — deliberately does NOT toast in that case, only
     silently starts tracking from here, so a first-time user never
     sees an "updated!" toast for a version that's simply the first one
     they've ever used. */
  lastSeenVersion: '',
  /* Cover-page classification marking every generated report carries —
     see App.setReportClassification() and report.js's buildReport().
     clientLogoUrl deliberately has NO default entry here: '' and
     "never set" are the same state (no logo shown), so there's nothing
     to seed — see App.uploadClientLogo()'s data: URI note in SETUP.md
     §8b for why it's stored that way rather than as a plain link.
     reportVersion_<type> keys are likewise never pre-seeded — they
     spring into existence the first time each report type is
     generated (see nextReportVersion() in app.js). */
  reportClassification: 'Commercial in Confidence',
  /* Client branding beyond the logo/classification pair above.
     clientDisplayName overrides the raw tenant display name wherever
     the client identity is shown to a human — the app's top bar, the
     Boardroom title slide, report covers and running headers — for the
     common consultancy case where the Entra tenant is named something
     like "acmegrp.onmicrosoft.com" but every artifact should read
     "Acme Group Pty Ltd". '' means "use the tenant name unchanged".
     clientBrandColor is a #rrggbb hex accent applied to generated
     reports (section rules, KPI figures, cover framework tag) in place
     of Checkpoint's gold — charts keep the print-validated palette
     regardless, so a low-contrast brand colour can never make a chart
     unreadable. '' means Checkpoint gold. Validated on save
     (App.setClientBrandColor) AND re-validated at spec-build time, so
     a hand-edited Settings row can't inject CSS.
     reportFooterText is a free-text line for the printed footer of
     every report page — "Prepared by Compliance365 for Acme Group",
     say. '' falls back to the classification marking (which always
     also appears in the running header, so it's never lost). */
  clientDisplayName: '',
  clientBrandColor: '',
  reportFooterText: '',
  /* AI assistant (ai.js) — all three empty/off by default, so the
     capability card always renders "AI not configured" until a
     practitioner deliberately sets these (Settings, or the wizard's
     optional "Enable AI" step). aiEndpoint/aiDeployment name the
     CLIENT'S OWN Azure OpenAI resource in THEIR tenant — never a
     Compliance365-hosted endpoint, never an API key. Meaningless
     without the 'ai' entitlement module regardless of these values —
     see applyEntitlementFrameworks()/window.ADDON_MODULES in app.js. */
  aiEnabled: 'false',
  aiEndpoint: '',
  aiDeployment: ''
};

/* Document library folders — a fixed set so evidence stays organised
   without practitioners inventing ad hoc structures per client. */
window.DOC_CATEGORIES = ['Policies & Procedures', 'Evidence', 'Audit reports', 'Risk & Treatment', 'Training records', 'Auto-evidence', 'Trust Center', 'Auditor Pack', 'Branding', 'Other'];

/* Canonical check id → ISO 27001 control code(s) it satisfies evidence
   for. ISO 27001 is the mapping anchor because every other framework's
   control rows already carry an "also satisfies ISO27001 <code>" (or
   the reverse) cross-reference in their own `map` field — app.js's
   auto-evidence step resolves those at scan time to also fill matching
   controls in every other entitled framework, rather than duplicating
   a full per-framework table here. Where a check also has a TPL entry
   in app.js (the risk-proposal template), the codes intentionally match
   — same real-world control, same evidence. */
window.CHECK_CONTROLS = {
  'mfa-all': ['A.5.15', 'A.8.5'],
  'mfa-priv': ['A.8.2', 'A.8.5'],
  'legacy': ['A.8.5', 'A.5.15'],
  'admins': ['A.8.2'],
  'pim': ['A.8.2', 'A.5.18'],
  'guests': ['A.5.16'],
  'riskyusers': ['A.5.25', 'A.5.26'],
  'device': ['A.8.1'],
  'compliance-policy': ['A.8.1'],
  'patch': ['A.8.8'],
  'wdac': ['A.8.7', 'A.8.19'],
  'macro': ['A.8.7'],
  'riskyapps': ['A.5.21', 'A.8.3'],
  'logging': ['A.8.15'],
  'alerts': ['A.8.16']
};

/* Posture check id -> Essential Eight strategy code(s) it speaks to.
   Used only to build scan-time SUGGESTIONS (see runScan() in app.js) for
   the essential8 child control at the client's current e8TargetLevel —
   never to write an SoA status directly. A practitioner must confirm
   (or dismiss) every suggestion before anything is saved. */
window.CHECK_E8 = {
  /* Ships as part of the encrypted essential8 content pack
     (checkpoint-content/essential8.json, extra.checkE8) — merged in
     here at runtime once a verified activation licenses essential8.
     Empty until then: scan-time E8 suggestions simply find nothing to
     suggest, rather than crashing on a missing lookup. */
};

/* Recurring ISMS activities the calendar tracks — distinct from the
   Internal Audits and Management Review registers, which already have
   their own dedicated flows. */
window.CALENDAR_CATEGORIES = ['Access control review', 'BCP/DR test', 'Backup restore test', 'Supplier security review', 'Policy review', 'Security awareness training', 'External surveillance audit', 'Certificate expiry', 'Other'];
window.CALENDAR_FREQUENCIES = ['Annual', 'Biannual', 'Quarterly', 'Monthly', 'One-off'];

/* Vendor data-access classification — a fixed taxonomy so "what data
   does this vendor touch?" is answered by ticking categories, not by
   whatever free text someone remembered to write. Order matters: it's
   the display order in the form, roughly most- to least-sensitive.
   suggestVendorCriticality() in lib.js maps these to a suggested
   criticality; the free-text detail field stays for specifics. */
window.VENDOR_DATA_CATEGORIES = [
  'Health information',
  'Customer PII',
  'Financial / payment data',
  'Credentials & secrets',
  'Production system access',
  'Employee data',
  'Company confidential',
  'Public / non-sensitive only'
];

/* ================= Demo store ================= */
window.DemoStore = (function () {
  var KEY = 'checkpoint-demo-v5'; /* bumped: v4 predates the audit log */
  var S = null;

  function daysFrom(n) { var d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); }

  function seed() {
    return {
      mode: 'demo',
      client: 'Meridian Health SaaS — demo tenant',
      scans: [{ date: daysFrom(-42), score: 41, readiness: 12, source: 'manual' }, { date: daysFrom(-21), score: 48, readiness: 15, source: 'manual' }, { date: daysFrom(-1), score: 45, readiness: 15, source: 'automated' }],
      alerts: [
        { id: 'ALT-001', checkId: 'wdac', label: 'Application control (WDAC) deployed', prev: 'pass', next: 'fail', note: '0% on 1 related Secure Score control (exact controlName match — verify in portal)', detected: daysFrom(-1), ack: false }
      ],
      lastResults: {
        'mfa-all': 'pass', 'mfa-priv': 'review', 'legacy': 'fail', 'admins': 'review', 'pim': 'fail', 'guests': 'pass', 'riskyusers': 'review',
        'device': 'pass', 'compliance-policy': 'pass', 'patch': 'review',
        'wdac': 'fail', 'macro': 'pass', 'riskyapps': 'review',
        'logging': 'pass', 'alerts': 'review'
      },
      lastNotes: {
        'admins': '6 Global Administrators', 'device': '97% of 214 devices compliant',
        'guests': '14 guest users in the directory', 'riskyusers': '2 risky user(s) currently flagged and unresolved',
        'compliance-policy': '3 compliance policies configured', 'riskyapps': '2 app grant(s) with a high-privilege scope (of 31 total grants)'
      },
      risks: [
        { id: 'R-001', title: 'Supplier access to production data lacks contractual security clauses', cat: 'Supplier', src: 'Gap analysis', L: 4, I: 4, controls: ['A.5.19'], owner: 'K. Patel', status: 'In treatment', treat: 'Mitigate', actions: ['ACT-001', 'ACT-002'] },
        { id: 'R-002', title: 'No tested restore path for SharePoint business-critical libraries', cat: 'Data', src: 'Workshop', L: 3, I: 5, controls: ['A.8.13'], owner: 'S. Okafor', status: 'In treatment', treat: 'Mitigate', actions: ['ACT-003'] },
        { id: 'R-003', title: 'Staff unable to recognise credential-phishing attempts', cat: 'People', src: 'Gap analysis', L: 4, I: 3, controls: ['A.6.3'], owner: 'M. Chen', status: 'Monitored', treat: 'Mitigate', actions: ['ACT-004'] },
        { id: 'R-004', title: 'Shadow cloud services holding client data outside the tenant', cat: 'Data', src: 'Workshop', L: 3, I: 4, controls: ['A.5.23', 'A.5.9'], owner: 'K. Patel', status: 'Open', treat: 'Mitigate', actions: ['ACT-005'] },
        { id: 'R-005', title: 'Cryptographic key handling undocumented for client-facing APIs', cat: 'Ops', src: 'Gap analysis', L: 2, I: 4, controls: ['A.8.24'], owner: 'S. Okafor', status: 'Open', treat: 'Mitigate', actions: ['ACT-006'] }
      ],
      actions: [
        { id: 'ACT-001', title: 'Issue updated security schedule to top-10 suppliers', risk: 'R-001', control: 'A.5.19', pr: 'High', owner: 'K. Patel', due: daysFrom(-6), status: 'In progress', src: 'Gap analysis', evidenceUrl: '', type: 'Action' },
        { id: 'ACT-002', title: 'Add supplier security clauses to procurement template', risk: 'R-001', control: 'A.5.19', pr: 'Medium', owner: 'Legal', due: daysFrom(14), status: 'Open', src: 'Gap analysis', evidenceUrl: '', type: 'Action' },
        { id: 'ACT-003', title: 'Quarterly restore test — SharePoint critical libraries', risk: 'R-002', control: 'A.8.13', pr: 'High', owner: 'S. Okafor', due: daysFrom(7), status: 'Open', src: 'Workshop', evidenceUrl: '', type: 'Action' },
        { id: 'ACT-004', title: 'Roll out phishing simulation & awareness programme', risk: 'R-003', control: 'A.6.3', pr: 'Medium', owner: 'M. Chen', due: daysFrom(-2), status: 'In progress', src: 'Gap analysis', evidenceUrl: '', type: 'Action' },
        { id: 'ACT-005', title: 'Discover & sanction cloud apps via Defender for Cloud Apps', risk: 'R-004', control: 'A.5.23', pr: 'High', owner: 'K. Patel', due: daysFrom(21), status: 'Open', src: 'Workshop', evidenceUrl: '', type: 'Action' },
        { id: 'ACT-006', title: 'Document key management procedure for API certificates', risk: 'R-005', control: 'A.8.24', pr: 'Low', owner: 'S. Okafor', due: daysFrom(30), status: 'Open', src: 'Gap analysis', evidenceUrl: '', type: 'Action' },
        { id: 'ACT-007', title: 'Surveillance audit finding: asset inventory missing 12 cloud-only devices', risk: '', control: 'A.5.9', pr: 'High', owner: 'K. Patel', due: daysFrom(10), status: 'Open', src: 'External audit', evidenceUrl: '', type: 'Non-conformity (Minor)' }
      ],
      controls: (function () {
        var owners = ['M. Chen', 'K. Patel', 'S. Okafor'];
        var i27001 = 0; /* index within iso27001 only, so the demo status pattern is stable regardless of other frameworks' control counts */
        /* iso27001's real seed rows (allControlSeeds() only ever returns
           these now — the 6 premium frameworks' window.FRAMEWORKS
           entries are empty stubs, per the content-pack split) PLUS the
           small illustrative slice from window.DEMO_FRAMEWORK_SEEDS for
           every premium framework, flattened to the exact same row
           shape — demo mode is the one place both are meant to coexist,
           so a prospect can explore every framework's structure without
           this file shipping the full paid registries. */
        var demoSeeds = allControlSeeds().concat(
          Object.keys(window.DEMO_FRAMEWORK_SEEDS || {}).reduce(function (acc, fw) {
            return acc.concat(window.DEMO_FRAMEWORK_SEEDS[fw]);
          }, [])
        );
        return demoSeeds.map(function (c) {
          if (c.fw === 'iso27001') {
            var i = i27001++;
            if (c.code === 'A.8.28') {
              /* SaaS company demo narrative: no in-house development */
              return { id: c.code, fw: c.fw, t: c.t, app: false, st: 'Not applicable', own: '—', map: c.map,
                just: 'No in-house development; SaaS product engineering handled under supplier controls A.5.19–A.5.23.', verified: '', evidenceUrl: '', verifiedBy: '' };
            }
            var st = i % 5 === 0 ? 'Implemented' : i % 5 === 3 ? 'Not started' : 'In progress';
            /* a mix of recently-verified and stale (>90 day) controls, to demonstrate re-attestation aging */
            var verified = st === 'Implemented' ? daysFrom(i % 3 === 0 ? -120 : -30) : '';
            var evidenceUrl = st === 'Implemented' && i % 4 === 0 ? 'https://meridianhealthsaas.sharepoint.com/sites/compliance/Evidence/' + c.code + '.pdf' : '';
            var verifiedBy = st === 'Implemented' ? owners[i % owners.length] : '';
            return { id: c.code, fw: c.fw, t: c.t, app: true, st: st, own: owners[i % owners.length], map: c.map, just: '', verified: verified, evidenceUrl: evidenceUrl, verifiedBy: verifiedBy };
          }
          /* other frameworks not yet purchased in the demo — controls exist but untouched */
          return { id: c.code, fw: c.fw, t: c.t, app: c.app, st: 'Not started', own: '', map: c.map, just: '', verified: '', evidenceUrl: '', verifiedBy: '' };
        });
      })(),
      entitlements: { iso27001: true, soc2: false, essential8: false, iso42001: false, iso27701: false, dispirap: false, nistcsf: false, ai: false },
      settings: Object.assign({}, window.DEFAULT_SETTINGS),
      proposed: [],
      e8Proposed: [],
      handledTpl: [],
      aiCandidates: [],
      audits: [
        { id: 'AUD-001', fw: 'iso27001', scope: 'Access control & supplier management (Annex A.5, A.8)', auditor: 'S. Okafor (internal)', planned: daysFrom(-35), completed: daysFrom(-33), status: 'Completed', summary: 'One minor non-conformity raised (asset inventory gaps in cloud-only devices). Programme otherwise operating effectively.', findingRefs: ['ACT-007'] },
        { id: 'AUD-002', fw: 'iso42001', scope: 'AI system risk management process', auditor: 'External — Vantage Assurance', planned: daysFrom(25), completed: '', status: 'Planned', summary: '', findingRefs: [] }
      ],
      reviews: [
        { id: 'MR-001', date: daysFrom(-30), attendees: 'M. Chen (CEO), K. Patel (Head of Eng), S. Okafor (ISMS Manager)', inputs: 'Posture score 48/100 (up from 41). 5 open risks, 2 High/Critical residual. 7 open actions, some overdue. 1 open non-conformity from AUD-001. ISO 27001 readiness 34%.', decisions: 'Approved additional contractor time for supplier security remediation (R-001). Agreed to bring forward the ISO 42001 internal audit to Q3. No change to risk appetite.', nextDue: daysFrom(60) }
      ],
      calendar: [
        { id: 'CAL-001', title: 'Access control review — all systems', category: 'Access control review', freq: 'Annual', nextDue: daysFrom(45), lastCompleted: daysFrom(-320), owner: 'K. Patel', notes: '', status: 'Active' },
        { id: 'CAL-002', title: 'BCP/DR failover test', category: 'BCP/DR test', freq: 'Annual', nextDue: daysFrom(-5), lastCompleted: daysFrom(-370), owner: 'S. Okafor', notes: '', status: 'Active' },
        { id: 'CAL-003', title: 'Quarterly backup restore test', category: 'Backup restore test', freq: 'Quarterly', nextDue: daysFrom(12), lastCompleted: daysFrom(-79), owner: 'S. Okafor', notes: '', status: 'Active' },
        { id: 'CAL-004', title: 'Top-10 supplier security review', category: 'Supplier security review', freq: 'Annual', nextDue: daysFrom(90), lastCompleted: daysFrom(-275), owner: 'K. Patel', notes: '', status: 'Active' },
        { id: 'CAL-005', title: 'Security awareness training refresh', category: 'Security awareness training', freq: 'Annual', nextDue: daysFrom(30), lastCompleted: daysFrom(-335), owner: 'M. Chen', notes: '', status: 'Active' },
        { id: 'CAL-006', title: 'ISO 27001 surveillance audit', category: 'External surveillance audit', freq: 'Annual', nextDue: daysFrom(120), lastCompleted: '', owner: 'S. Okafor', notes: 'Certification body: Vantage Assurance', status: 'Active' },
        { id: 'CAL-007', title: 'ISO 27001 certificate expiry', category: 'Certificate expiry', freq: 'One-off', nextDue: daysFrom(400), lastCompleted: '', owner: 'S. Okafor', notes: '3-year cycle from initial certification', status: 'Active' },
        { id: 'CAL-008', title: 'Vendor review — Northwind Cloud Hosting', category: 'Supplier security review', freq: 'Annual', nextDue: daysFrom(-18), lastCompleted: daysFrom(-383), owner: 'K. Patel', notes: 'Auto-linked to vendor VEN-001', status: 'Active' },
        { id: 'CAL-009', title: 'Vendor review — Aria Payments Gateway', category: 'Supplier security review', freq: 'Annual', nextDue: daysFrom(60), lastCompleted: daysFrom(-305), owner: 'S. Okafor', notes: 'Auto-linked to vendor VEN-002', status: 'Active' }
      ],
      vendors: [
        { id: 'VEN-001', name: 'Northwind Cloud Hosting', service: 'Primary IaaS hosting for production workloads', dataAccessed: 'Full production database access; encrypted at rest', criticality: 'Critical', reviewStatus: 'Overdue', lastReviewed: daysFrom(-383), nextReviewDue: daysFrom(-18), certifications: 'SOC2, ISO27001', owner: 'K. Patel', notes: 'Renewal negotiation in progress', contactEmail: 'security@northwindhosting.example', controls: ['A.5.19', 'A.5.20'], riskRefs: ['R-001'], questionnaireStatus: 'Sent', questionnaireSentDate: daysFrom(-40), calRef: 'CAL-008', publicListed: true, dataCategories: ['Health information', 'Customer PII', 'Production system access'] },
        { id: 'VEN-002', name: 'Aria Payments Gateway', service: 'Card payment processing', dataAccessed: 'Tokenised payment references only — no raw PAN stored', criticality: 'High', reviewStatus: 'Reviewed', lastReviewed: daysFrom(-305), nextReviewDue: daysFrom(60), certifications: 'SOC2, PCI DSS', owner: 'S. Okafor', notes: '', contactEmail: 'compliance@ariapayments.example', controls: ['A.5.21', 'CC9.2'], riskRefs: [], questionnaireStatus: 'Received', questionnaireSentDate: daysFrom(-320), calRef: 'CAL-009', publicListed: true, dataCategories: ['Financial / payment data'] },
        { id: 'VEN-003', name: 'Lumen Legal Advisory', service: 'Outside counsel — contract review', dataAccessed: 'Contract drafts, no client PII', criticality: 'Low', reviewStatus: 'Not started', lastReviewed: '', nextReviewDue: daysFrom(150), certifications: '', owner: 'Legal', notes: '', contactEmail: '', controls: ['A.5.22'], riskRefs: [], questionnaireStatus: 'Not sent', questionnaireSentDate: '', calRef: '', publicListed: false, dataCategories: ['Company confidential'] }
      ],
      aiSystems: [
        { id: 'AI-001', name: 'Microsoft 365 Copilot', purpose: 'Drafting and summarisation assistance across Word, Outlook and Teams for all staff', owner: 'K. Patel', dataSources: 'Microsoft Graph-connected tenant content (email, documents, chats) staff already have access to', modelType: 'Foundation model (hosted, Microsoft-operated)', vendor: 'Microsoft', riskTier: 'Limited', impactAssessmentStatus: 'Completed', humanOversight: 'All outputs are drafts reviewed and edited by the staff member before use; no autonomous action is taken.', lastReviewed: daysFrom(-40), spId: '' },
        { id: 'AI-002', name: 'Clinical Triage Assistant', purpose: 'Suggests a triage priority for inbound patient support tickets based on submitted symptoms text', owner: 'S. Okafor', dataSources: 'Patient-submitted support ticket text (may include health information)', modelType: 'Fine-tuned classifier, hosted on Azure OpenAI', vendor: 'OpenAI (via Azure)', riskTier: 'High', impactAssessmentStatus: 'In progress', humanOversight: 'A human triage nurse confirms every priority suggestion before a ticket is actioned — the model never re-prioritises a ticket unattended.', lastReviewed: daysFrom(-10), spId: '' },
        { id: 'AI-003', name: 'Marketing Copy Generator', purpose: 'Drafts first-pass marketing copy for the website and email campaigns', owner: 'M. Chen', dataSources: 'Public product descriptions and brand style guide only — no customer or patient data', modelType: 'Third-party SaaS (Anthropic Claude via vendor API)', vendor: 'Jasper AI', riskTier: 'Minimal', impactAssessmentStatus: 'Not started', humanOversight: '', lastReviewed: '', spId: '' }
      ],
      auditLog: [
        { actor: 'S. Okafor', actorId: 'demo-user', action: 'Control status changed', targetType: 'Control', targetId: 'A.5.15', before: 'In progress', after: 'Implemented', entryDateTime: new Date(Date.now() - 24 * 86400000).toISOString() },
        { actor: 'K. Patel', actorId: 'demo-user', action: 'Risk approved into register', targetType: 'Risk', targetId: 'R-002', before: '', after: 'In treatment', entryDateTime: new Date(Date.now() - 30 * 86400000).toISOString() }
      ],
      /* Partner Console preview data — only ever seen via ?entType=partner
         (or the localhost dev bypass), never part of the ordinary demo
         narrative. Same shape mapPartnerClient()/mapPartnerEntitlement()
         produce for a real tenant, so renderPartnerConsole() in app.js
         never needs to know which store it's talking to. */
      partnerClients: [
        { _sp: 'pc-demo-1', name: 'Meridian Health SaaS', tenantId: 'meridianhealthsaas.onmicrosoft.com', status: 'Active', contactName: 'M. Chen', contactEmail: 'm.chen@meridianhealthsaas.example', notes: 'Renewed annually each July.', modules: ['iso27001', 'soc2'], lastSynced: daysFrom(-2), lastSyncedBy: 'you@compliance365.com.au', onboarded: true, score: 45, lastScanDate: daysFrom(-1), readinessByFw: { iso27001: 21, soc2: 40 }, appVersion: '1.10.0', driftAlerts: 1, syncError: '' },
        { _sp: 'pc-demo-2', name: 'Northshore Fintech', tenantId: 'northshorefintech.onmicrosoft.com', status: 'Trial', contactName: 'R. Alvarez', contactEmail: 'r.alvarez@northshorefintech.example', notes: 'Trial started for the SOC 2 push.', modules: ['iso27001', 'soc2', 'essential8'], lastSynced: daysFrom(-9), lastSyncedBy: 'you@compliance365.com.au', onboarded: true, score: 62, lastScanDate: daysFrom(-9), readinessByFw: { iso27001: 55, soc2: 30, essential8: 48 }, appVersion: '1.9.1', driftAlerts: 0, syncError: '' },
        { _sp: 'pc-demo-3', name: 'Aldergate Legal', tenantId: 'aldergatelegal.onmicrosoft.com', status: 'Prospect', contactName: 'P. Nguyen', contactEmail: 'p.nguyen@aldergatelegal.example', notes: 'Scoping call booked.', modules: [], lastSynced: '', lastSyncedBy: '', onboarded: false, score: null, lastScanDate: '', readinessByFw: {}, appVersion: '', driftAlerts: 0, syncError: '' }
      ],
      partnerEntitlements: [
        { _sp: 'pe-demo-1', tenantId: 'meridianhealthsaas.onmicrosoft.com', type: 'client', modules: ['iso27001', 'soc2'], issuedAt: daysFrom(-350), expiry: daysFrom(15), hash: 'demo-hash-1' },
        { _sp: 'pe-demo-2', tenantId: 'northshorefintech.onmicrosoft.com', type: 'demo', modules: ['iso27001', 'soc2', 'essential8', 'iso42001', 'iso27701', 'dispirap', 'nistcsf'], issuedAt: daysFrom(-9), expiry: daysFrom(21), hash: 'demo-hash-2' }
      ],
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
    acknowledgeAlert: async function (a) { a.ack = true; persist(); },
    addVendor: async function (v) { S.vendors.push(v); persist(); },
    updateVendor: async function () { persist(); },
    addAiSystem: async function (a) { S.aiSystems.push(a); persist(); },
    updateAiSystem: async function () { persist(); },
    /* app.js already unshifts to S.activity — the store only persists */
    logActivity: async function () { persist(); },
    setEntitlement: async function (fw, enabled) { S.entitlements[fw] = enabled; persist(); },
    setSetting: async function (key, value) { S.settings[key] = value; persist(); },
    listDocuments: async function () { return []; },
    uploadDocument: async function () { throw new Error("Demo mode has no real tenant to store files in — sign in to a real tenant to use Documents."); },
    addAudit: async function (a) { S.audits.push(a); persist(); },
    updateAudit: async function () { persist(); },
    addReview: async function (r) { S.reviews.push(r); persist(); },
    addCalendarItem: async function (c) { S.calendar.push(c); persist(); },
    updateCalendarItem: async function () { persist(); },
    appendAudit: async function (entry) { S.auditLog.unshift(entry); persist(); },
    /* Lazy-seeds the 106 NIST CSF subcategory rows into S.controls the
       first time a client switches nistDepth to 'subcategory' — never
       seeded up front, so a category-depth client's Controls list stays
       at 22 nistcsf rows. Idempotent: only adds rows genuinely missing. */
    ensureNistSubcategories: async function () {
      var have = {};
      S.controls.forEach(function (c) { if (c.fw === 'nistcsf') have[c.id] = true; });
      var missing = window.nistSubcategorySeeds().filter(function (c) { return !have[c.code]; });
      if (!missing.length) return 0;
      missing.forEach(function (c) {
        S.controls.push({ id: c.code, fw: 'nistcsf', t: c.t, app: true, st: 'Not started', own: '', map: c.map, just: '', verified: '', evidenceUrl: '', verifiedBy: '' });
      });
      persist();
      return missing.length;
    },
    reset: async function () { localStorage.removeItem(KEY); S = seed(); return S; },

    /* Partner Console preview in demo mode — no real SharePoint to
       provision, so this just serves/mutates the seeded arrays above
       exactly like every other Demo*() pair in this file (the caller
       already mutated the object in place before add/update persist
       it). onStatus is accepted and ignored, matching load()'s own
       signature elsewhere. */
    /* Returns COPIES of the arrays, not the live S.partnerClients/
       S.partnerEntitlements references — app.js's PARTNER_DATA is its
       own cache that it pushes/filters independently of these, same as
       every other add/update/delete pair here only touches S (for
       persistence) and leaves the caller's own list management to the
       caller. Returning live references here would double-insert every
       add (both this store's own push AND app.js's). */
    loadPartnerConsole: async function () {
      if (!S.partnerClients) S.partnerClients = [];
      if (!S.partnerEntitlements) S.partnerEntitlements = [];
      return { clients: S.partnerClients.slice(), entitlements: S.partnerEntitlements.slice() };
    },
    addPartnerClient: async function (c) { c._sp = 'pc-demo-' + Date.now(); S.partnerClients.push(c); persist(); },
    updatePartnerClient: async function () { persist(); },
    deletePartnerClient: async function (c) { S.partnerClients = S.partnerClients.filter(function (x) { return x._sp !== c._sp; }); persist(); },
    addPartnerEntitlementRecord: async function (e) { e._sp = 'pe-demo-' + Date.now(); S.partnerEntitlements.push(e); persist(); }
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
      { name: 'Treatment', text: {} }, { name: 'ActionRefs', text: {} }, { name: 'TplId', text: {} },
      /* Set only when this risk's statement/L-I/treatment came from an
         AI draft the practitioner reviewed and approved through the
         normal Add/Approve path — never set automatically, never
         implies the AI wrote it unreviewed. AiReviewer is who approved
         it (same "who" the audit log already records for the add/
         approve action itself). */
      { name: 'AiAssisted', boolean: {} }, { name: 'AiReviewer', text: {} }
    ],
    Actions: [
      { name: 'RefId', text: {} }, { name: 'RiskRef', text: {} }, { name: 'Control', text: {} },
      { name: 'Priority', text: {} }, { name: 'Owner', text: {} }, { name: 'DueDate', text: {} },
      { name: 'Status', text: {} }, { name: 'Evidence', text: { allowMultipleLines: true } }, { name: 'Source', text: {} },
      { name: 'EvidenceUrl', text: {} }, { name: 'FindingType', text: {} },
      { name: 'AiAssisted', boolean: {} }, { name: 'AiReviewer', text: {} }
    ],
    Controls: [
      { name: 'Code', text: {} }, { name: 'Framework', text: {} }, { name: 'Applicable', boolean: {} }, { name: 'Status', text: {} },
      { name: 'Owner', text: {} }, { name: 'MapsTo', text: {} }, { name: 'Justification', text: { allowMultipleLines: true } },
      { name: 'LastVerified', text: {} }, { name: 'EvidenceUrl', text: {} }, { name: 'VerifiedBy', text: {} }
    ],
    Scans: [
      { name: 'ScanDate', text: {} }, { name: 'Score', number: {} }, { name: 'Detail', text: { allowMultipleLines: true } }
    ],
    Activity: [
      { name: 'Message', text: { allowMultipleLines: true } }, { name: 'EntryDate', text: {} }
    ],
    Entitlements: [
      { name: 'FrameworkId', text: {} }, { name: 'Enabled', boolean: {} }
    ],
    Settings: [
      /* allowMultipleLines: SharePoint's default single-line text column
         caps at 255 characters — too small for entitlementFile's signed
         JSON (now including per-module content-pack keys) or
         clientLogoUrl's data: URI (a small logo, base64-encoded — see
         App.uploadClientLogo() in app.js for why it has to be a data:
         URI rather than a plain link). Multiple-lines-of-text columns
         support tens of thousands of characters instead. */
      { name: 'SettingKey', text: {} }, { name: 'SettingValue', text: { allowMultipleLines: true } }
    ],
    Audits: [
      { name: 'RefId', text: {} }, { name: 'Framework', text: {} }, { name: 'Scope', text: {} },
      { name: 'Auditor', text: {} }, { name: 'PlannedDate', text: {} }, { name: 'CompletedDate', text: {} },
      { name: 'Status', text: {} }, { name: 'Summary', text: { allowMultipleLines: true } }, { name: 'FindingRefs', text: {} }
    ],
    Reviews: [
      { name: 'RefId', text: {} }, { name: 'ReviewDate', text: {} }, { name: 'Attendees', text: {} },
      { name: 'Inputs', text: { allowMultipleLines: true } }, { name: 'Decisions', text: { allowMultipleLines: true } },
      { name: 'NextDue', text: {} }
    ],
    Calendar: [
      { name: 'RefId', text: {} }, { name: 'Category', text: {} }, { name: 'Frequency', text: {} },
      { name: 'NextDue', text: {} }, { name: 'LastCompleted', text: {} }, { name: 'Owner', text: {} },
      { name: 'Notes', text: { allowMultipleLines: true } }, { name: 'Status', text: {} }
    ],
    AuditLog: [
      { name: 'Actor', text: {} }, { name: 'ActorId', text: {} }, { name: 'Action', text: {} },
      { name: 'TargetType', text: {} }, { name: 'TargetId', text: {} },
      { name: 'Before', text: { allowMultipleLines: true } }, { name: 'After', text: { allowMultipleLines: true } },
      { name: 'EntryDateTime', text: {} }
    ],
    /* Written by the browser (Acknowledged only) and by the scheduled
       Azure Function/Logic App monitor (everything else) — see
       azure/README.md. A row here means a check that scored 'pass' on
       the previous scan scored 'fail' on this one; anything less sharp
       (e.g. pass -> review) stays visible on the normal scan checklist
       without paging anyone. */
    Alerts: [
      { name: 'CheckId', text: {} }, { name: 'CheckLabel', text: {} },
      { name: 'PreviousStatus', text: {} }, { name: 'NewStatus', text: {} },
      { name: 'Note', text: { allowMultipleLines: true } }, { name: 'DetectedDate', text: {} },
      { name: 'Acknowledged', boolean: {} }
    ],
    Vendors: [
      { name: 'RefId', text: {} }, { name: 'Service', text: {} },
      { name: 'DataAccessed', text: { allowMultipleLines: true } },
      { name: 'Criticality', text: {} }, { name: 'ReviewStatus', text: {} },
      { name: 'LastReviewed', text: {} }, { name: 'NextReviewDue', text: {} },
      { name: 'Certifications', text: {} }, { name: 'Owner', text: {} },
      { name: 'Notes', text: { allowMultipleLines: true } }, { name: 'ContactEmail', text: {} },
      { name: 'Controls', text: {} }, { name: 'RiskRefs', text: {} },
      { name: 'QuestionnaireStatus', text: {} }, { name: 'QuestionnaireSentDate', text: {} },
      { name: 'CalRef', text: {} }, { name: 'PublicListed', boolean: {} },
      { name: 'DataCategories', text: {} }
    ],
    /* AI Governance (ISO 42001) — only shown/populated while iso42001 is
       entitled (app.js gates the nav item, the register view, and the
       scan-time discovery step on that same flag). SpId links a row
       back to the Entra service principal automated discovery found it
       from; empty for a manually-added system. */
    AISystems: [
      { name: 'RefId', text: {} }, { name: 'Purpose', text: { allowMultipleLines: true } },
      { name: 'Owner', text: {} }, { name: 'DataSources', text: { allowMultipleLines: true } },
      { name: 'ModelType', text: {} }, { name: 'Vendor', text: {} }, { name: 'RiskTier', text: {} },
      { name: 'ImpactAssessmentStatus', text: {} }, { name: 'HumanOversight', text: { allowMultipleLines: true } },
      { name: 'LastReviewed', text: {} }, { name: 'SpId', text: {} }
    ]
  };

  /* Partner Console's own data — provisioned in a SEPARATE list prefix
     ('Checkpoint Partner ...', see partnerListName() below), and only
     ever provisioned at all when this tenant's own activation is
     type:'partner' (app.js's ensurePartnerConsoleData() is the only
     caller of ensurePartnerLists() below, gated on
     currentEntitlementType() === 'partner'). This is OUR data, in OUR
     tenant — never a client's; a client tenant's Checkpoint instance
     never has these lists at all.
     PartnerClients doubles as both the client roster (ClientName,
     TenantId, Status, ContactName, ContactEmail, Notes — the task's
     own field list) AND the last-sync snapshot summary (everything
     else below) — "store the SNAPSHOT SUMMARY ONLY in PartnerClients"
     means exactly that: no second list for sync results, just more
     columns on this one. */
  var PARTNER_DEFS = {
    PartnerClients: [
      { name: 'ClientName', text: {} }, { name: 'TenantId', text: {} }, { name: 'Status', text: {} },
      { name: 'ContactName', text: {} }, { name: 'ContactEmail', text: {} }, { name: 'Notes', text: { allowMultipleLines: true } },
      /* --- everything from here down is sync-snapshot data only, written by partnerSyncClient() in app.js --- */
      { name: 'Modules', text: {} } /* CSV of framework ids enabled in the CLIENT's own Entitlements list, as of last sync */,
      { name: 'LastSynced', text: {} }, { name: 'LastSyncedBy', text: {} } /* the signed-in identity used for that sync, e.g. jane@compliance365.com.au */,
      { name: 'Onboarded', boolean: {} }, { name: 'PostureScore', number: {} }, { name: 'LastScanDate', text: {} },
      { name: 'Readiness', text: { allowMultipleLines: true } } /* JSON: { [frameworkId]: pct }, per-framework readiness at last sync */,
      { name: 'AppVersion', text: {} } /* the client's own lastSeenVersion Settings value — a proxy for "what Checkpoint build they were last using", not necessarily what's currently deployed */,
      { name: 'DriftAlerts', number: {} } /* unacknowledged Alerts count at last sync */,
      { name: 'SyncError', text: { allowMultipleLines: true } }
    ],
    PartnerEntitlements: [
      { name: 'TenantId', text: {} }, { name: 'Type', text: {} }, { name: 'Modules', text: {} },
      { name: 'IssuedAt', text: {} }, { name: 'Expiry', text: {} }, { name: 'EntitlementHash', text: {} }
    ]
  };

  function listName(k) { return CONFIG.listPrefix + ' ' + k; }
  function partnerListName(k) { return 'Checkpoint Partner ' + k; }

  var provisionOpts = { scopes: window.CHECKPOINT_CONFIG.scopesProvision };

  async function resolveSite() {
    if (CONFIG.site === 'root') {
      siteId = (await Graph.g('/sites/root?$select=id', provisionOpts)).id;
    } else {
      var host = (await Graph.g('/sites/root?$select=siteCollection,webUrl', provisionOpts)).webUrl.replace(/^https:\/\//, '').split('/')[0];
      siteId = (await Graph.g('/sites/' + host + ':' + CONFIG.site + '?$select=id', provisionOpts)).id;
    }
  }

  /* Read-only — resolves the configured site and looks for an existing
     "Checkpoint Settings" list without creating anything (unlike
     ensureLists/seedControls). Used by the onboarding wizard to decide,
     right after sign-in, whether this tenant has already completed
     setup — before ever provisioning a single list. Any failure (site
     doesn't resolve, list doesn't exist yet, no onboardedDate row) is
     treated as "not onboarded", the safe default: worst case, an
     already-onboarded tenant sees the wizard again, re-probes at step 3
     and lands straight back on the dashboard once site+frameworks are
     confirmed — no data is ever duplicated or lost, since every write
     downstream of this is the same idempotent self-heal path
     (reconcileControls, seedEntitlements, etc.) the app already relies
     on elsewhere. */
  async function probeOnboardingState() {
    try {
      await resolveSite();
      var existing = await Graph.gAll('/sites/' + siteId + '/lists?$select=id,displayName&$top=200', provisionOpts);
      var settingsList = existing.find(function (l) { return l.displayName === listName('Settings'); });
      if (!settingsList) return { onboarded: false };
      lists.Settings = settingsList.id;
      var rows = await items('Settings');
      var row = rows.find(function (i) { return i.fields.SettingKey === 'onboardedDate'; });
      return { onboarded: !!(row && row.fields.SettingValue) };
    } catch (e) {
      return { onboarded: false };
    }
  }

  /* Read-only sibling of probeOnboardingState() — resolves the site and
     reads the Settings list's cached activation blob (if any) WITHOUT
     provisioning anything. Used by app.js at the very top of every live
     load, before Store.load() runs, so it can Ed25519-verify the cached
     activation and set window.CHECKPOINT_ACTIVATION *before*
     ensureLists() might need that flag to self-heal a missing list —
     for the overwhelmingly common case (a fully up to date tenant, no
     list actually missing) this is the only activation-related read
     that happens at all; ensureLists() never even looks at the flag. */
  async function readCachedActivation() {
    try {
      await resolveSite();
      var existing = await Graph.gAll('/sites/' + siteId + '/lists?$select=id,displayName&$top=200', provisionOpts);
      var settingsList = existing.find(function (l) { return l.displayName === listName('Settings'); });
      if (!settingsList) return { raw: null };
      lists.Settings = settingsList.id;
      var rows = await items('Settings');
      var row = rows.find(function (i) { return i.fields.SettingKey === 'entitlementFile'; });
      return { raw: (row && row.fields.SettingValue) || null };
    } catch (e) {
      return { raw: null };
    }
  }

  /* Validates a candidate '/sites/...' path resolves to a real site,
     WITHOUT committing to it — the wizard's site-selection step calls
     this before setting CONFIG.site, so a typo'd path never reaches
     resolveSite()/ensureLists() and never creates anything at the
     wrong location. Same call shape resolveSite() itself uses for a
     non-root path; throws (site not found / no access) exactly like
     any other failed Graph.g() call, left for the caller to catch. */
  async function validateSitePath(path) {
    var host = (await Graph.g('/sites/root?$select=siteCollection,webUrl', provisionOpts)).webUrl.replace(/^https:\/\//, '').split('/')[0];
    var site = await Graph.g('/sites/' + host + ':' + path + '?$select=id,displayName,webUrl', provisionOpts);
    return { id: site.id, name: site.displayName, url: site.webUrl };
  }

  var docLibraryId = null, docDriveId = null;

  /* Refuses to create a single new SharePoint list unless a verified
     activation for THIS tenant is in memory (window.CHECKPOINT_ACTIVATION,
     set by app.js after Ed25519-verifying an activation file's signature
     and tenant binding — see app.js's "signed activation" section for
     the full design). Deliberately does NOT gate reading/self-healing
     lists that already exist — a fully-provisioned, already-active
     tenant reloading the app must keep working even before this
     session has re-verified anything, since re-verification itself
     needs to read the cached activation out of the Settings list this
     same function is responsible for not blocking. Only actual list
     CREATION — true first-run provisioning, or a self-heal adding a
     list a newer Checkpoint version introduced — requires the
     in-memory flag, which is why the check sits here (immediately
     before the one line that issues a creating POST) rather than at
     the top of this function or of Store.load(). */
  function assertActivationAuthorizesProvisioning(name) {
    if (!window.CHECKPOINT_ACTIVATION || !window.CHECKPOINT_ACTIVATION.verified) {
      throw new Error('Provisioning is blocked: "' + name + '" doesn\'t exist yet in this tenant, and creating it requires a verified Compliance365 activation — see the Frameworks/Settings view.');
    }
  }

  async function ensureLists(onStatus) {
    var existing = await Graph.gAll('/sites/' + siteId + '/lists?$select=id,displayName&$top=200', provisionOpts);
    for (var k in DEFS) {
      var name = listName(k);
      var found = existing.find(function (l) { return l.displayName === name; });
      if (found) { lists[k] = found.id; continue; }
      assertActivationAuthorizesProvisioning(name);
      if (onStatus) onStatus('Creating list “' + name + '”…');
      var created = await Graph.g('/sites/' + siteId + '/lists', {
        method: 'POST',
        body: { displayName: name, columns: DEFS[k], list: { template: 'genericList' } },
        scopes: CONFIG.scopesProvision
      });
      lists[k] = created.id;
      if (k === 'Controls') await seedControls(onStatus);
      if (k === 'Entitlements') await seedEntitlements(onStatus);
      if (k === 'Settings') await seedSettings(onStatus);
    }
    /* self-heal: a tenant provisioned before a new framework was added to
       the registry has a Controls list missing that framework's rows —
       add whatever's missing rather than requiring re-provisioning. */
    await reconcileControls(onStatus);

    /* document library — real evidence storage (ISMS manual, policies,
       risk treatment plan, training records), not just pasted URLs */
    var docName = listName('Documents');
    var foundDoc = existing.find(function (l) { return l.displayName === docName; });
    if (foundDoc) {
      docLibraryId = foundDoc.id;
    } else {
      assertActivationAuthorizesProvisioning(docName);
      if (onStatus) onStatus('Creating document library “' + docName + '”…');
      var createdDoc = await Graph.g('/sites/' + siteId + '/lists', {
        method: 'POST',
        body: { displayName: docName, list: { template: 'documentLibrary' } },
        scopes: CONFIG.scopesProvision
      });
      docLibraryId = createdDoc.id;
    }
    try {
      var docList = await Graph.g('/sites/' + siteId + '/lists/' + docLibraryId + '?$expand=drive', provisionOpts);
      docDriveId = docList.drive && docList.drive.id;
    } catch (e) { /* drive not exposed yet on very first provisioning run — retried on next load */ }
  }

  /* Separate from ensureLists() above (which runs on EVERY tenant's
     Store.load(), regardless of licence type) — this only ever runs
     when app.js has already confirmed currentEntitlementType() ===
     'partner' for THIS tenant, since PartnerClients/PartnerEntitlements
     are meaningless (and shouldn't exist at all) for a normal client
     tenant. Same idempotent create-if-missing shape as ensureLists(),
     against a resolved siteId — assumes resolveSite() already ran as
     part of the normal Store.load() this always follows. Re-fetches
     the site's list of lists rather than reusing ensureLists()'s own
     `existing` (out of scope here, and a second read is cheap — this
     only ever runs when the practitioner opens Partner Console, not on
     every load). */
  async function ensurePartnerLists(onStatus) {
    var existing = await Graph.gAll('/sites/' + siteId + '/lists?$select=id,displayName&$top=200', provisionOpts);
    for (var k in PARTNER_DEFS) {
      var name = partnerListName(k);
      var found = existing.find(function (l) { return l.displayName === name; });
      if (found) { lists[k] = found.id; continue; }
      assertActivationAuthorizesProvisioning(name);
      if (onStatus) onStatus('Creating list “' + name + '”…');
      var created = await Graph.g('/sites/' + siteId + '/lists', {
        method: 'POST',
        body: { displayName: name, columns: PARTNER_DEFS[k], list: { template: 'genericList' } },
        scopes: CONFIG.scopesProvision
      });
      lists[k] = created.id;
    }
  }

  /* Called both from ensureLists() (S doesn't exist yet — the added
     rows are picked up moments later when load() fetches items('Controls')
     fresh) and, post-load, right after a newly-applied activation just
     merged a premium content pack into window.FRAMEWORKS (S already
     exists — see app.js's mergeLicensedPacks()/reconcileEntitlementsOnLoad).
     In that second case there'd be no later items('Controls') re-fetch
     to pick the new rows up implicitly, so this also appends them to
     S.controls directly, same as ensureNistSubcategories() does. */
  async function reconcileControls(onStatus) {
    var have = {};
    (await items('Controls')).forEach(function (i) {
      var f = i.fields;
      have[(f.Framework || 'iso27001') + '|' + f.Code] = true;
    });
    var missing = allControlSeeds().filter(function (c) { return !have[c.fw + '|' + c.code]; });
    if (!missing.length) return 0;
    if (onStatus) onStatus('Adding ' + missing.length + ' new framework control(s)…');
    for (var i = 0; i < missing.length; i++) {
      var c = missing[i];
      var id = await addItem('Controls', { Title: c.t, Code: c.code, Framework: c.fw, Applicable: c.app, Status: 'Not started', Owner: '', MapsTo: c.map, Justification: '' });
      if (S && S.controls) S.controls.push({ _sp: id, id: c.code, fw: c.fw, t: c.t, app: c.app, st: 'Not started', own: '', map: c.map, just: '', verified: '', evidenceUrl: '', verifiedBy: '' });
    }
    return missing.length;
  }

  /* Lazy-seeds the 106 NIST CSF subcategory rows into this tenant's
     Controls list — and into in-memory S.controls — the first time its
     nistDepth setting is switched to 'subcategory'. Never runs as part
     of ensureLists()/reconcileControls(), so a tenant working at
     category depth never sees these 106 rows appear on its own; only an
     explicit App.setNistDepth('subcategory') call triggers it.
     Idempotent: diffs against what's already there and only adds what's
     genuinely missing, same pattern as reconcileControls(). */
  async function ensureNistSubcategories(onStatus) {
    var have = {};
    (S.controls || []).forEach(function (c) { if (c.fw === 'nistcsf') have[c.id] = true; });
    var missing = window.nistSubcategorySeeds().filter(function (c) { return !have[c.code]; });
    if (!missing.length) return 0;
    if (onStatus) onStatus('Adding ' + missing.length + ' NIST CSF subcategory control(s)…');
    for (var i = 0; i < missing.length; i++) {
      var c = missing[i];
      var id = await addItem('Controls', { Title: c.t, Code: c.code, Framework: c.fw, Applicable: c.app, Status: 'Not started', Owner: '', MapsTo: c.map, Justification: '' });
      S.controls.push({ _sp: id, id: c.code, fw: c.fw, t: c.t, app: c.app, st: 'Not started', own: '', map: c.map, just: '', verified: '', evidenceUrl: '', verifiedBy: '' });
    }
    return missing.length;
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

  var settingsRowId = {}; /* key -> SharePoint item id */
  async function seedSettings(onStatus) {
    if (onStatus) onStatus('Setting up default risk appetite & features…');
    var DEFAULT_SETTINGS = window.DEFAULT_SETTINGS;
    for (var key in DEFAULT_SETTINGS) {
      var id = await addItem('Settings', { Title: key, SettingKey: key, SettingValue: DEFAULT_SETTINGS[key] });
      settingsRowId[key] = id;
    }
  }

  async function addItem(k, fields) {
    var j = await Graph.g('/sites/' + siteId + '/lists/' + lists[k] + '/items', {
      method: 'POST', body: { fields: fields }, scopes: CONFIG.scopesProvision
    });
    return j.id;
  }
  async function patchItem(k, itemId, fields) {
    await Graph.g('/sites/' + siteId + '/lists/' + lists[k] + '/items/' + itemId + '/fields', {
      method: 'PATCH', body: fields, scopes: CONFIG.scopesProvision
    });
  }
  async function items(k) {
    return Graph.gAll('/sites/' + siteId + '/lists/' + lists[k] + '/items?$expand=fields&$top=200', provisionOpts);
  }

  function csv(a) { return (a || []).join(','); }
  function uncsv(s) { return s ? String(s).split(',').map(function (x) { return x.trim(); }).filter(Boolean) : []; }

  function mapPartnerClient(i) {
    var f = i.fields;
    var readiness = {};
    try { readiness = JSON.parse(f.Readiness || '{}'); } catch (e) { }
    return {
      _sp: i.id, name: f.ClientName || f.Title || '', tenantId: f.TenantId || '', status: f.Status || 'Prospect',
      contactName: f.ContactName || '', contactEmail: f.ContactEmail || '', notes: f.Notes || '',
      modules: uncsv(f.Modules), lastSynced: f.LastSynced || '', lastSyncedBy: f.LastSyncedBy || '',
      onboarded: !!f.Onboarded, score: typeof f.PostureScore === 'number' ? f.PostureScore : null,
      lastScanDate: f.LastScanDate || '', readinessByFw: readiness, appVersion: f.AppVersion || '',
      driftAlerts: typeof f.DriftAlerts === 'number' ? f.DriftAlerts : 0, syncError: f.SyncError || ''
    };
  }
  function mapPartnerEntitlement(i) {
    var f = i.fields;
    return { _sp: i.id, tenantId: f.TenantId || '', type: f.Type || 'client', modules: uncsv(f.Modules), issuedAt: f.IssuedAt || '', expiry: f.Expiry || '', hash: f.EntitlementHash || '' };
  }

  return {
    kind: 'sharepoint',
    load: async function (onStatus) {
      if (onStatus) onStatus('Requesting permission to store your compliance registers in this tenant’s SharePoint…');
      await resolveSite();
      await ensureLists(onStatus);
      if (onStatus) onStatus('Loading registers…');

      var riskItems = await items('Risks');
      var actItems = await items('Actions');
      var ctlItems = await items('Controls');
      var scanItems = await items('Scans');
      var actvItems = await items('Activity');
      var entItems = await items('Entitlements');
      var setItems = await items('Settings');
      var audItems = await items('Audits');
      var revItems = await items('Reviews');
      var calItems = await items('Calendar');
      var logItems = await items('AuditLog');
      var alertItems = await items('Alerts');
      var vendorItems = await items('Vendors');
      var aiItems = await items('AISystems');

      S = {
        mode: 'live',
        client: '',
        risks: riskItems.map(function (i) {
          var f = i.fields;
          return { _sp: i.id, id: f.RefId, title: f.Title, cat: f.Category || '', src: f.Source || '', L: f.Likelihood || 1, I: f.Impact || 1, controls: uncsv(f.Controls), owner: f.Owner || '', status: f.Status || 'Open', treat: f.Treatment || 'Mitigate', actions: uncsv(f.ActionRefs), tpl: f.TplId || undefined, aiAssisted: !!f.AiAssisted, aiReviewer: f.AiReviewer || '' };
        }),
        actions: actItems.map(function (i) {
          var f = i.fields;
          return { _sp: i.id, id: f.RefId, title: f.Title, risk: f.RiskRef || '', control: f.Control || '', pr: f.Priority || 'Medium', owner: f.Owner || '', due: f.DueDate || '', status: f.Status || 'Open', evidence: f.Evidence || '', src: f.Source || '', evidenceUrl: f.EvidenceUrl || '', type: f.FindingType || 'Action', aiAssisted: !!f.AiAssisted, aiReviewer: f.AiReviewer || '' };
        }),
        controls: ctlItems.map(function (i) {
          var f = i.fields;
          return { _sp: i.id, id: f.Code, fw: f.Framework || 'iso27001', t: f.Title, app: !!f.Applicable, st: f.Status || 'Not started', own: f.Owner || '', map: f.MapsTo || '', just: f.Justification || '', verified: f.LastVerified || '', evidenceUrl: f.EvidenceUrl || '', verifiedBy: f.VerifiedBy || '' };
        }).sort(function (a, b) { return a.id.localeCompare(b.id, undefined, { numeric: true }); }),
        scans: scanItems.map(function (i) {
          var f = i.fields;
          var readiness, readinessByFw, critRisks, overdueActions, source, projection, riskSnapshot;
          try {
            var dd = JSON.parse(f.Detail || '{}');
            if (typeof dd.readiness === 'number') readiness = dd.readiness;
            if (dd.readinessByFw) readinessByFw = dd.readinessByFw;
            if (typeof dd.critRisks === 'number') critRisks = dd.critRisks;
            if (typeof dd.overdueActions === 'number') overdueActions = dd.overdueActions;
            source = dd.source;
            /* the Certification Journey's audit-ready projection, recomputed
               and snapshotted into every scan (see app.js's runScan()) —
               same "extra field lives inside Detail's JSON, not a new
               SharePoint column" pattern as readiness/critRisks/
               overdueActions above, so the management review pack's
               projection-drift chart has a real series to read back
               without a schema change. */
            if (dd.projection && typeof dd.projection === 'object') projection = dd.projection;
            /* the Risk Landscape's "previous quarter" trail source —
               each open risk's residual L/I as of this scan. */
            if (Array.isArray(dd.riskSnapshot)) riskSnapshot = dd.riskSnapshot;
          } catch (e) { }
          /* a scan from before this field existed, or one the browser
             wrote before this change, is a manual run */
          return { _sp: i.id, date: f.ScanDate, score: f.Score || 0, detail: f.Detail || '', readiness: readiness, readinessByFw: readinessByFw, critRisks: critRisks, overdueActions: overdueActions, source: source || 'manual', projection: projection, riskSnapshot: riskSnapshot };
        }).sort(function (a, b) { return (a.date || '').localeCompare(b.date || ''); }),
        activity: actvItems.map(function (i) {
          var f = i.fields;
          return { _sp: i.id, t: f.EntryDate || (i.createdDateTime || '').slice(0, 10), msg: f.Message || '' };
        }).sort(function (a, b) { return (b.t || '').localeCompare(a.t || ''); }),
        audits: audItems.map(function (i) {
          var f = i.fields;
          return { _sp: i.id, id: f.RefId, fw: f.Framework || '', scope: f.Scope || '', auditor: f.Auditor || '', planned: f.PlannedDate || '', completed: f.CompletedDate || '', status: f.Status || 'Planned', summary: f.Summary || '', findingRefs: uncsv(f.FindingRefs) };
        }).sort(function (a, b) { return (a.planned || '').localeCompare(b.planned || ''); }),
        reviews: revItems.map(function (i) {
          var f = i.fields;
          return { _sp: i.id, id: f.RefId, date: f.ReviewDate || '', attendees: f.Attendees || '', inputs: f.Inputs || '', decisions: f.Decisions || '', nextDue: f.NextDue || '' };
        }).sort(function (a, b) { return (a.date || '').localeCompare(b.date || ''); }),
        calendar: calItems.map(function (i) {
          var f = i.fields;
          return { _sp: i.id, id: f.RefId, title: f.Title, category: f.Category || 'Other', freq: f.Frequency || 'Annual', nextDue: f.NextDue || '', lastCompleted: f.LastCompleted || '', owner: f.Owner || '', notes: f.Notes || '', status: f.Status || 'Active' };
        }).sort(function (a, b) { return (a.nextDue || '').localeCompare(b.nextDue || ''); }),
        auditLog: logItems.map(function (i) {
          var f = i.fields;
          return { _sp: i.id, actor: f.Actor || '', actorId: f.ActorId || '', action: f.Action || '', targetType: f.TargetType || '', targetId: f.TargetId || '', before: f.Before || '', after: f.After || '', entryDateTime: f.EntryDateTime || (i.createdDateTime || '') };
        }).sort(function (a, b) { return (b.entryDateTime || '').localeCompare(a.entryDateTime || ''); }),
        alerts: alertItems.map(function (i) {
          var f = i.fields;
          return { _sp: i.id, id: 'ALT-' + i.id, checkId: f.CheckId || '', label: f.CheckLabel || f.CheckId || '', prev: f.PreviousStatus || '', next: f.NewStatus || '', note: f.Note || '', detected: f.DetectedDate || (i.createdDateTime || '').slice(0, 10), ack: !!f.Acknowledged };
        }).sort(function (a, b) { return (b.detected || '').localeCompare(a.detected || ''); }),
        vendors: vendorItems.map(function (i) {
          var f = i.fields;
          return {
            _sp: i.id, id: f.RefId, name: f.Title, service: f.Service || '', dataAccessed: f.DataAccessed || '',
            criticality: f.Criticality || 'Medium', reviewStatus: f.ReviewStatus || 'Not started',
            lastReviewed: f.LastReviewed || '', nextReviewDue: f.NextReviewDue || '',
            certifications: f.Certifications || '', owner: f.Owner || '', notes: f.Notes || '',
            contactEmail: f.ContactEmail || '', controls: uncsv(f.Controls), riskRefs: uncsv(f.RiskRefs),
            questionnaireStatus: f.QuestionnaireStatus || 'Not sent', questionnaireSentDate: f.QuestionnaireSentDate || '',
            calRef: f.CalRef || '', publicListed: !!f.PublicListed, dataCategories: uncsv(f.DataCategories)
          };
        }).sort(function (a, b) { return (a.id || '').localeCompare(b.id || ''); }),
        aiSystems: aiItems.map(function (i) {
          var f = i.fields;
          return {
            _sp: i.id, id: f.RefId, name: f.Title, purpose: f.Purpose || '', owner: f.Owner || '',
            dataSources: f.DataSources || '', modelType: f.ModelType || '', vendor: f.Vendor || '',
            riskTier: f.RiskTier || 'Minimal', impactAssessmentStatus: f.ImpactAssessmentStatus || 'Not started',
            humanOversight: f.HumanOversight || '', lastReviewed: f.LastReviewed || '', spId: f.SpId || ''
          };
        }).sort(function (a, b) { return (a.id || '').localeCompare(b.id || ''); }),
        lastResults: null, lastNotes: {},
        proposed: [], e8Proposed: [], handledTpl: [], aiCandidates: []
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

      S.settings = Object.assign({}, window.DEFAULT_SETTINGS);
      settingsRowId = {};
      setItems.forEach(function (i) {
        var f = i.fields;
        if (!f.SettingKey) return;
        S.settings[f.SettingKey] = f.SettingValue;
        settingsRowId[f.SettingKey] = i.id;
      });
      return S;
    },
    addRisk: async function (r) {
      r._sp = await addItem('Risks', {
        Title: r.title, RefId: r.id, Category: r.cat, Source: r.src, Likelihood: r.L, Impact: r.I,
        Controls: csv(r.controls), Owner: r.owner, Status: r.status, Treatment: r.treat,
        ActionRefs: csv(r.actions), TplId: r.tpl || '', AiAssisted: !!r.aiAssisted, AiReviewer: r.aiReviewer || ''
      });
      S.risks.push(r);
    },
    updateRisk: async function (r) {
      await patchItem('Risks', r._sp, { Status: r.status, Likelihood: r.L, Impact: r.I, ActionRefs: csv(r.actions), Owner: r.owner, Treatment: r.treat, AiAssisted: !!r.aiAssisted, AiReviewer: r.aiReviewer || '' });
    },
    addAction: async function (a) {
      a._sp = await addItem('Actions', {
        Title: a.title, RefId: a.id, RiskRef: a.risk, Control: a.control, Priority: a.pr,
        Owner: a.owner, DueDate: a.due, Status: a.status, Evidence: a.evidence || '', Source: a.src,
        FindingType: a.type || 'Action', AiAssisted: !!a.aiAssisted, AiReviewer: a.aiReviewer || ''
      });
      S.actions.push(a);
    },
    updateAction: async function (a) {
      await patchItem('Actions', a._sp, { Status: a.status, Evidence: a.evidence || '', Owner: a.owner, DueDate: a.due, EvidenceUrl: a.evidenceUrl || '', FindingType: a.type || 'Action', AiAssisted: !!a.aiAssisted, AiReviewer: a.aiReviewer || '' });
    },
    updateControl: async function (c) {
      await patchItem('Controls', c._sp, { Applicable: c.app, Status: c.st, Owner: c.own, Justification: c.just || '', LastVerified: c.verified || '', EvidenceUrl: c.evidenceUrl || '', VerifiedBy: c.verifiedBy || '' });
    },
    addScan: async function (sc) {
      sc._sp = await addItem('Scans', { Title: 'Scan ' + sc.date, ScanDate: sc.date, Score: sc.score, Detail: sc.detail || '' });
      S.scans.push(sc);
    },
    saveScanState: async function () { /* live state derives from lists; nothing extra */ },
    /* the Alerts list itself is written by the scheduled monitor
       (application permissions, outside this browser session) — the
       browser only ever flips its own Acknowledged flag */
    acknowledgeAlert: async function (a) {
      await patchItem('Alerts', a._sp, { Acknowledged: true });
      a.ack = true;
    },
    addVendor: async function (v) {
      v._sp = await addItem('Vendors', {
        Title: v.name, RefId: v.id, Service: v.service, DataAccessed: v.dataAccessed || '',
        Criticality: v.criticality, ReviewStatus: v.reviewStatus, LastReviewed: v.lastReviewed || '',
        NextReviewDue: v.nextReviewDue || '', Certifications: v.certifications || '', Owner: v.owner,
        Notes: v.notes || '', ContactEmail: v.contactEmail || '', Controls: csv(v.controls), RiskRefs: csv(v.riskRefs),
        QuestionnaireStatus: v.questionnaireStatus || 'Not sent', QuestionnaireSentDate: v.questionnaireSentDate || '',
        CalRef: v.calRef || '', PublicListed: !!v.publicListed, DataCategories: csv(v.dataCategories)
      });
      S.vendors.push(v);
    },
    updateVendor: async function (v) {
      await patchItem('Vendors', v._sp, {
        Title: v.name, Service: v.service, DataAccessed: v.dataAccessed || '', Criticality: v.criticality,
        ReviewStatus: v.reviewStatus, LastReviewed: v.lastReviewed || '', NextReviewDue: v.nextReviewDue || '',
        Certifications: v.certifications || '', Owner: v.owner, Notes: v.notes || '', ContactEmail: v.contactEmail || '',
        Controls: csv(v.controls), RiskRefs: csv(v.riskRefs), QuestionnaireStatus: v.questionnaireStatus || 'Not sent',
        QuestionnaireSentDate: v.questionnaireSentDate || '', CalRef: v.calRef || '', PublicListed: !!v.publicListed, DataCategories: csv(v.dataCategories)
      });
    },
    addAiSystem: async function (a) {
      a._sp = await addItem('AISystems', {
        Title: a.name, RefId: a.id, Purpose: a.purpose || '', Owner: a.owner, DataSources: a.dataSources || '',
        ModelType: a.modelType || '', Vendor: a.vendor || '', RiskTier: a.riskTier,
        ImpactAssessmentStatus: a.impactAssessmentStatus, HumanOversight: a.humanOversight || '',
        LastReviewed: a.lastReviewed || '', SpId: a.spId || ''
      });
      S.aiSystems.push(a);
    },
    updateAiSystem: async function (a) {
      await patchItem('AISystems', a._sp, {
        Title: a.name, Purpose: a.purpose || '', Owner: a.owner, DataSources: a.dataSources || '',
        ModelType: a.modelType || '', Vendor: a.vendor || '', RiskTier: a.riskTier,
        ImpactAssessmentStatus: a.impactAssessmentStatus, HumanOversight: a.humanOversight || '',
        LastReviewed: a.lastReviewed || '', SpId: a.spId || ''
      });
    },
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
    setSetting: async function (key, value) {
      S.settings[key] = value;
      if (settingsRowId[key]) {
        await patchItem('Settings', settingsRowId[key], { SettingValue: value });
      } else {
        settingsRowId[key] = await addItem('Settings', { Title: key, SettingKey: key, SettingValue: value });
      }
    },
    listDocuments: async function () {
      if (!docDriveId) return [];
      return Graph.listDriveFiles(docDriveId);
    },
    uploadDocument: async function (file, category) {
      if (!docDriveId) throw new Error('Document library is still provisioning — try again in a moment.');
      var item = await Graph.uploadSmallFile(docDriveId, category || 'Other', file.name, file);
      return { name: item.name, url: item.webUrl };
    },
    addAudit: async function (a) {
      a._sp = await addItem('Audits', {
        Title: a.id, RefId: a.id, Framework: a.fw, Scope: a.scope, Auditor: a.auditor,
        PlannedDate: a.planned, CompletedDate: a.completed || '', Status: a.status,
        Summary: a.summary || '', FindingRefs: csv(a.findingRefs)
      });
      S.audits.push(a);
    },
    updateAudit: async function (a) {
      await patchItem('Audits', a._sp, { CompletedDate: a.completed || '', Status: a.status, Summary: a.summary || '', FindingRefs: csv(a.findingRefs) });
    },
    addReview: async function (r) {
      r._sp = await addItem('Reviews', {
        Title: r.id, RefId: r.id, ReviewDate: r.date, Attendees: r.attendees,
        Inputs: r.inputs, Decisions: r.decisions, NextDue: r.nextDue || ''
      });
      S.reviews.push(r);
    },
    addCalendarItem: async function (c) {
      c._sp = await addItem('Calendar', {
        Title: c.title, RefId: c.id, Category: c.category, Frequency: c.freq,
        NextDue: c.nextDue || '', LastCompleted: c.lastCompleted || '', Owner: c.owner,
        Notes: c.notes || '', Status: c.status || 'Active'
      });
      S.calendar.push(c);
    },
    updateCalendarItem: async function (c) {
      await patchItem('Calendar', c._sp, { NextDue: c.nextDue || '', LastCompleted: c.lastCompleted || '', Status: c.status || 'Active' });
    },
    appendAudit: async function (entry) {
      entry._sp = await addItem('AuditLog', {
        Title: entry.action, Actor: entry.actor, ActorId: entry.actorId, Action: entry.action,
        TargetType: entry.targetType, TargetId: entry.targetId, Before: entry.before || '',
        After: entry.after || '', EntryDateTime: entry.entryDateTime
      });
      S.auditLog.unshift(entry);
    },
    ensureNistSubcategories: ensureNistSubcategories,
    reconcileControls: reconcileControls,
    probeOnboardingState: probeOnboardingState,
    readCachedActivation: readCachedActivation,
    validateSitePath: validateSitePath,
    reset: null, /* never bulk-delete client data from the console */

    /* Partner Console — OUR OWN tenant's data, never a client's (see
       PARTNER_DEFS's own comment above). Only ever called when
       currentEntitlementType() === 'partner'; provisions the two
       lists on first call, a no-op find-by-name on every one after. */
    loadPartnerConsole: async function (onStatus) {
      await ensurePartnerLists(onStatus);
      var clientItems = await items('PartnerClients');
      var entItems = await items('PartnerEntitlements');
      return { clients: clientItems.map(mapPartnerClient), entitlements: entItems.map(mapPartnerEntitlement) };
    },
    /* addPartnerClient/updatePartnerClient both take the FULL domain-
       shaped client object (camelCase — same shape mapPartnerClient()
       above produces) and mutate `c._sp` in place on add, same
       convention as addVendor()/updateVendor() elsewhere in this
       file — the caller (app.js) always already holds the object it
       wants persisted, never just a bag of raw SharePoint field names. */
    addPartnerClient: async function (c) {
      c._sp = await addItem('PartnerClients', {
        Title: c.name, ClientName: c.name, TenantId: c.tenantId, Status: c.status || 'Prospect',
        ContactName: c.contactName || '', ContactEmail: c.contactEmail || '', Notes: c.notes || ''
      });
    },
    updatePartnerClient: async function (c) {
      await patchItem('PartnerClients', c._sp, {
        Title: c.name, ClientName: c.name, TenantId: c.tenantId, Status: c.status || 'Prospect',
        ContactName: c.contactName || '', ContactEmail: c.contactEmail || '', Notes: c.notes || '',
        Modules: csv(c.modules), LastSynced: c.lastSynced || '', LastSyncedBy: c.lastSyncedBy || '',
        Onboarded: !!c.onboarded, PostureScore: c.score, LastScanDate: c.lastScanDate || '',
        Readiness: JSON.stringify(c.readinessByFw || {}), AppVersion: c.appVersion || '',
        DriftAlerts: c.driftAlerts || 0, SyncError: c.syncError || ''
      });
    },
    deletePartnerClient: async function (c) {
      await Graph.g('/sites/' + siteId + '/lists/' + lists.PartnerClients + '/items/' + c._sp, { method: 'DELETE', scopes: CONFIG.scopesProvision });
    },
    addPartnerEntitlementRecord: async function (e) {
      e._sp = await addItem('PartnerEntitlements', {
        Title: e.tenantId, TenantId: e.tenantId, Type: e.type, Modules: csv(e.modules), IssuedAt: e.issuedAt, Expiry: e.expiry, EntitlementHash: e.hash || ''
      });
    }
  };
})();
