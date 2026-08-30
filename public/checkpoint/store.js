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
      { code: 'A.5.5',  t: 'Contact with authorities',                                       app: true, map: 'DISP.30' },
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
      { code: 'A.5.19', t: 'Information security in supplier relationships',                  app: true, map: 'SOC2 CC9.2 · DISP.26' },
      { code: 'A.5.20', t: 'Addressing information security within supplier agreements',      app: true, map: 'SOC2 CC9.2' },
      { code: 'A.5.21', t: 'Managing information security in the ICT supply chain',           app: true, map: 'DISP.26' },
      { code: 'A.5.22', t: 'Monitoring, review and change management of supplier services',   app: true, map: 'SOC2 CC9.2' },
      { code: 'A.5.23', t: 'Information security for use of cloud services',                  app: true, map: 'SOC2 CC6.7 · NIST PR.DS' },
      { code: 'A.5.24', t: 'Information security incident management planning & preparation', app: true, map: 'NIST RS.MA' },
      { code: 'A.5.25', t: 'Assessment and decision on information security events',          app: true, map: 'NIST DE.AE' },
      { code: 'A.5.26', t: 'Response to information security incidents',                      app: true, map: 'NIST RS.CO · DISP.34' },
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
      { code: 'A.7.1',  t: 'Physical security perimeters',                                    app: true, map: 'DISP.12' },
      { code: 'A.7.2',  t: 'Physical entry',                                                  app: true, map: 'DISP.15' },
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
  is18: {
    id: "is18", name: "IS18 (QGEA)", tag: "Qld Government",
    blurb: "Queensland Government Information security policy (IS18:2018) under the QGEA — the ISMS-aligned-to-ISO-27001 backbone, Essential Eight uplift and reporting, QGISCF information classification, incident reporting to the Cyber Security Unit, and the accountable officer's annual return, organised as one register so an agency (or a supplier to one) prepares everything for the 30 September attestation in a single place. Cross-mapped to ISO 27001 and Essential Eight so nothing is done twice.",
    /* Full control set ships as an encrypted content pack (checkpoint-content/is18.json -> dist/checkpoint/packs/) -- merged in at runtime by mergeLicensedPacks() in app.js the moment a verified activation licenses this module. Empty here (rather than absent) so every place that reads window.FRAMEWORKS[fw].controls before a pack ever loads (or when it's unlicensed) gets a safe, empty array instead of a crash. */
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
  },
  cps234: {
    id: "cps234", name: "CPS 234", tag: "APRA Regulated",
    blurb: "APRA Prudential Standard CPS 234 Information Security — all 24 requirements (paragraphs 13-36) across roles and responsibilities, information security capability, policy framework, asset identification and classification, implementation of controls, incident management, testing control effectiveness, internal audit, and APRA notification. Mandatory for every APRA-regulated entity: banks, insurers, superannuation funds and their service providers. Cross-mapped to ISO 27001 and NIST CSF so the prudential obligation and the certification are prepared once, not twice.",
    /* Full control set ships as an encrypted content pack (checkpoint-content/cps234.json -> dist/checkpoint/packs/) -- merged in at runtime by mergeLicensedPacks() in app.js the moment a verified activation licenses this module. Empty here (rather than absent) so every place that reads window.FRAMEWORKS[fw].controls before a pack ever loads (or when it's unlicensed) gets a safe, empty array instead of a crash. */
    controls: []
  },
  rffr: {
    id: "rffr", name: "RFFR (ISM SoA)", tag: "Cth Employment",
    blurb: "Right Fit For Risk — the DEWR cyber-security accreditation for Employment Services providers, delivered as one Statement of Applicability: the 7 program-deed obligations plus all 989 Australian Government ISM (June 2026) controls applicable to Non-Classified and OFFICIAL: Sensitive information, cross-mapped to the ISO 27001 ISMS backbone and Essential Eight so the certification, the E8 uplift and the RFFR SoA are prepared once, not three times. RFFR Core Expectations are flagged for milestone prioritisation.",
    /* Full control set ships as an encrypted content pack (checkpoint-content/rffr.json -> dist/checkpoint/packs/) -- merged in at runtime by mergeLicensedPacks() in app.js the moment a verified activation licenses this module. Empty here (rather than absent) so every place that reads window.FRAMEWORKS[fw].controls before a pack ever loads (or when it's unlicensed) gets a safe, empty array instead of a crash. */
    controls: []
  }
};
/* Sidebar / tab display order. Add new framework ids here. */
window.FRAMEWORK_ORDER = ['iso27001', 'soc2', 'essential8', 'is18', 'iso42001', 'iso27701', 'dispirap', 'nistcsf', 'rffr', 'cps234'];

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
    { fw: "essential8", code: "E8.2", t: "Patch applications", app: true, map: "ISO27001 A.8.8 · SOC2 CC7.1" },
    { fw: "essential8", code: "E8.2-ML2", t: "Weekly scans; extreme-risk patches applied within 48 hours across internet-facing and office apps", app: true, map: "", lvl: 2 },
    { fw: "essential8", code: "E8.3", t: "Configure Microsoft Office macro settings", app: true, map: "ISO27001 A.8.7" },
    { fw: "essential8", code: "E8.3-ML2", t: "Macros restricted to vetted, centrally-managed locations or signed by a trusted publisher", app: true, map: "", lvl: 2 },
    { fw: "essential8", code: "E8.4", t: "User application hardening", app: true, map: "ISO27001 A.8.7 · SOC2 CC6.6" },
    { fw: "essential8", code: "E8.4-ML1", t: "Browsers do not process Java or web advertisements from the internet; Internet Explorer 11 disabled or removed", app: true, map: "", lvl: 1 },
    { fw: "essential8", code: "E8.5", t: "Restrict administrative privileges", app: true, map: "ISO27001 A.8.2 · SOC2 CC6.3" },
    { fw: "essential8", code: "E8.5-ML1", t: "Privileged access validated on request; privileged accounts blocked from email and web browsing", app: true, map: "", lvl: 1 },
    { fw: "essential8", code: "E8.6", t: "Patch operating systems", app: true, map: "ISO27001 A.8.8 · NIST ID.RA" },
    { fw: "essential8", code: "E8.7", t: "Multi-factor authentication", app: true, map: "ISO27001 A.8.5 · SOC2 CC6.1" },
    { fw: "essential8", code: "E8.7-ML3", t: "Phishing-resistant MFA enforced for every user on every system, including data repositories; MFA events centrally logged and analysed", app: true, map: "", lvl: 3 },
    { fw: "essential8", code: "E8.8", t: "Regular backups", app: true, map: "ISO27001 A.8.13 · SOC2 A1.2" },
    { fw: "essential8", code: "E8.8-ML3", t: "Restoration exercised as part of disaster-recovery testing; only dedicated backup admins can modify or delete backups", app: true, map: "", lvl: 3 }
  ],
  is18: [
    { fw: "is18", code: "IS18.1.1", t: "ISMS established and maintained, aligned to ISO 27001, covering the agency's information assets and services", app: true, map: "ISO27001 A.5.1 · A.5.35" },
    { fw: "is18", code: "IS18.1.2", t: "Information security policy and risk appetite endorsed by the accountable officer (Director-General or delegate)", app: true, map: "ISO27001 A.5.1 · A.5.4" },
    { fw: "is18", code: "IS18.3.1", t: "Information assets classified under the Queensland Government Information Security Classification Framework (OFFICIAL / SENSITIVE / PROTECTED), with a maintained information asset register", app: true, map: "ISO27001 A.5.9 · A.5.12" },
    { fw: "is18", code: "IS18.3.3", t: "Handling, storage, transfer and sharing controls match each asset's classification, including data loss prevention and external-sharing governance", app: true, map: "ISO27001 A.5.10 · A.5.14" },
    { fw: "is18", code: "IS18.4.1", t: "Essential Eight — application control implemented to the agency's endorsed target maturity level", app: true, map: "ISO27001 A.8.19" },
    { fw: "is18", code: "IS18.4.7", t: "Essential Eight — multi-factor authentication enforced for users, privileged roles and remote access", app: true, map: "ISO27001 A.8.5" },
    { fw: "is18", code: "IS18.4.9", t: "Essential Eight maturity self-assessed at least annually against endorsed target levels, and reported in the agency's annual return", app: true, map: "ISO27001 A.5.36" },
    { fw: "is18", code: "IS18.5.3", t: "Significant information security incidents reported to the Queensland Government Cyber Security Unit within required timeframes, with lessons learned fed back into controls", app: true, map: "ISO27001 A.5.25 · A.6.8" },
    { fw: "is18", code: "IS18.7.1", t: "Annual information security return prepared and submitted by 30 September, signed by the accountable officer", app: true, map: "ISO27001 A.5.36" }
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
  ],
  rffr: [
    { fw: "rffr", code: "RFFR-D1", t: "Prior to offering employment, and on-going requirements to maintain employment, the individual's identity is proven", app: true, map: "ISO27001 A.6.1 · A.5.31", cat: "deeds" },
    { fw: "rffr", code: "ISM-1997", t: "The board of directors or executive committee defines clear roles and responsibilities for cyber security", app: true, map: "", cat: "roles" },
    { fw: "rffr", code: "ISM-0576", t: "A cyber security incident management policy, and associated cyber security incident response plan, is developed", app: true, map: "", cat: "incidents" },
    { fw: "rffr", code: "ISM-0252", t: "Cyber security awareness training is undertaken annually by all personnel", app: true, map: "", cat: "personnel" },
    { fw: "rffr", code: "ISM-1973", t: "Non-classified systems are secured in suitably secure facilities", app: true, map: "", cat: "physical" },
    { fw: "rffr", code: "ISM-1504", t: "Multi-factor authentication is used to authenticate users to their organisation's online services", app: true, map: "ISO27001 A.5.15 · A.8.5 · E8.7", cat: "hardening" },
    { fw: "rffr", code: "ISM-0843", t: "Application control is implemented on workstations", app: true, map: "ISO27001 A.8.19 · A.8.7 · E8.1", cat: "hardening" },
    { fw: "rffr", code: "ISM-1876", t: "Patches, updates or other vendor mitigations for vulnerabilities in online services are applied within 48 hours", app: true, map: "ISO27001 A.8.8 · E8.2 · E8.6", cat: "sys-mgmt" },
    { fw: "rffr", code: "ISM-1405", t: "A centralised event logging facility is implemented", app: true, map: "ISO27001 A.8.15", cat: "assurance" }
  ]
};

/* Same "small, deliberately-partial illustrative slice, never the full
   paid registry" treatment as DEMO_FRAMEWORK_SEEDS above, but for NIST
   CSF's 106 subcategories specifically — 3 real subcategories each
   under 3 of the categories already in DEMO_FRAMEWORK_SEEDS.nistcsf, so
   switching a demo tenant's nistDepth to 'subcategory' has something
   genuine to show instead of an empty table. Public-domain NIST text
   (same basis as the full NIST_SUBCATEGORIES comment below), not paid
   content, so copying it here verbatim is fine. */
window.DEMO_NIST_SUBCATEGORIES = [
  { code: "PR.AA-01", t: "Identities and credentials for authorised users, services and hardware managed", parent: "PR.AA" },
  { code: "PR.AA-02", t: "Identities proofed and bound to credentials based on the context of interactions", parent: "PR.AA" },
  { code: "PR.AA-03", t: "Users, services and hardware authenticated", parent: "PR.AA" },
  { code: "PR.DS-01", t: "Confidentiality, integrity and availability of data-at-rest protected", parent: "PR.DS" },
  { code: "PR.DS-02", t: "Confidentiality, integrity and availability of data-in-transit protected", parent: "PR.DS" },
  { code: "PR.DS-10", t: "Confidentiality, integrity and availability of data-in-use protected", parent: "PR.DS" },
  { code: "DE.CM-01", t: "Networks and network services monitored to find potentially adverse events", parent: "DE.CM" },
  { code: "DE.CM-02", t: "The physical environment monitored to find potentially adverse events", parent: "DE.CM" },
  { code: "DE.CM-03", t: "Personnel activity and technology usage monitored to find potentially adverse events", parent: "DE.CM" }
];

/* Same illustrative-slice treatment again, this time for the posture-
   scan -> SoA-status-suggestion automation (CHECK_E8/CHECK_IS18/etc. in
   the real, licensed pack): a handful of genuinely accurate checkId ->
   code mappings per premium framework, reusing the exact technical
   pairing the real content packs use (verified against
   checkpoint-content/*.json — not fabricated), restricted to checkIds
   whose result in the demo's own lastResults seed is 'pass' or
   'review' (never 'fail' or 'manual') and codes that are actually
   present in DEMO_FRAMEWORK_SEEDS above. 'fail' is deliberately
   excluded here even where the real pack's mapping includes it: every
   demo-seeded premium control starts at 'Not started', which is also
   what a 'fail' result suggests, so pairing one in would silently
   suppress the demo suggestion entirely (App.runScan() only ever
   proposes a status that differs from the control's current one) —
   not wrong, just pointless to include for this illustrative purpose.
   Without this, a prospect who runs a scan in demo mode sees the
   suggestion automation fire for ISO 27001 only (its CHECK_CONTROLS
   table is always populated, not pack-gated) and never for any premium
   module they might be evaluating buying — this is what fixes that.
   DISP/IRAP has no entry: the real product has no scan automation for
   it either (self-reported by design, see the DISP disclaimer above
   window.FRAMEWORKS.dispirap). */
window.DEMO_CHECK_SEEDS = {
  essential8: { macro: ['E8.3'], 'mfa-all': ['E8.7'], patch: ['E8.6'] },
  is18: { 'mfa-all': ['IS18.4.7'], dlp: ['IS18.3.3'] },
  iso42001: { riskyapps: ['AI.4.4'] },
  iso27701: { dlp: ['P.7.4.9'] },
  soc2: { riskyusers: ['CC7.3'], alerts: ['CC7.3'] },
  nistcsf: { 'mfa-all': ['PR.AA'], device: ['PR.DS'], alerts: ['DE.CM'] },
  rffr: { 'mfa-all': ['ISM-1504'], patch: ['ISM-1876'] }
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
   "X of 25 checks automatable" line in app.js) to know which checks a
   missing licence/permission affects, without re-deriving graph.js's own
   control flow. graph.js's runPostureChecks() independently consults
   Graph.detectCapabilities() to decide whether to skip each of these
   checks' real network call — this field doesn't drive that decision,
   it mirrors it for display; keep both in sync by hand if either
   changes (eight capability areas, seventeen checks between them — small
   enough that a single source of truth isn't worth the indirection). */
window.CHECK_DEFS = [
  /* Identity (10) */
  { id: 'mfa-all',    area: 'Identity', label: 'MFA enforced — all users',                    tpl: null,        scored: true, requiresCapability: 'conditionalAccess' },
  { id: 'mfa-priv',   area: 'Identity', label: 'Phishing-resistant MFA — privileged roles',    tpl: 'mfa-priv',  scored: true, requiresCapability: 'conditionalAccess' },
  { id: 'legacy',     area: 'Identity', label: 'Legacy authentication blocked',                tpl: 'legacy',    scored: true, requiresCapability: 'conditionalAccess' },
  /* ca-device / ca-risk read fields of the SAME Conditional Access
     policy response mfa-all/legacy/mfa-priv already fetch — no new
     Graph call, no new scope. Mined, not added. */
  { id: 'ca-device',  area: 'Identity', label: 'Cloud app access requires a managed device',   tpl: 'ca-device', scored: true, requiresCapability: 'conditionalAccess' },
  { id: 'ca-risk',    area: 'Identity', label: 'Risk-based Conditional Access enforced',       tpl: 'ca-risk',   scored: true, requiresCapability: 'identityProtection' },
  { id: 'admins',     area: 'Identity', label: 'Global admin count within threshold',          tpl: 'admins',    scored: true },
  { id: 'pim',        area: 'Identity', label: 'Privileged roles use eligible (PIM) assignment', tpl: 'pim',     scored: true, requiresCapability: 'pim' },
  { id: 'guests',     area: 'Identity', label: 'External guest user count within threshold',   tpl: null,        scored: true },
  { id: 'riskyusers', area: 'Identity', label: 'Risky sign-ins & risky users addressed',       tpl: 'riskyusers', scored: true, requiresCapability: 'identityProtection' },
  { id: 'access-review', area: 'Identity', label: 'Periodic access-rights review configured',  tpl: 'access-review', scored: true, requiresCapability: 'accessReviews' },
  /* Leaver hygiene. No capability gate: it reads plain directory data
     under scopes every tenant already granted, so unlike most of the
     newer checks this one works at every licence level. */
  { id: 'leaver',     area: 'Identity', label: 'Departed accounts fully offboarded',           tpl: 'leaver',    scored: true },
  /* Devices (3) */
  { id: 'device',     area: 'Devices',  label: 'Device compliance policies enforced',          tpl: null,        scored: true, requiresCapability: 'intune' },
  { id: 'compliance-policy', area: 'Devices', label: 'Compliance policies configured for the device fleet', tpl: null, scored: true, requiresCapability: 'intune' },
  { id: 'device-checkin', area: 'Devices', label: 'Managed devices checking in with Intune', tpl: 'device-checkin', scored: true, requiresCapability: 'intune' },
  { id: 'device-config', area: 'Devices', label: 'Device configuration profiles deployed', tpl: null, scored: true, requiresCapability: 'intune' },
  { id: 'patch',      area: 'Devices',  label: 'OS & application patch currency',              tpl: 'patch',     scored: true, requiresCapability: 'secureScore' },
  /* Apps & Data (7) */
  { id: 'wdac',       area: 'Apps & Data', label: 'Application control (WDAC) deployed',       tpl: 'wdac',      scored: true, requiresCapability: 'secureScore' },
  { id: 'macro',      area: 'Apps & Data', label: 'Office macro settings hardened',            tpl: null,        scored: true, requiresCapability: 'secureScore' },
  { id: 'riskyapps',  area: 'Apps & Data', label: 'No high-privilege, unreviewed OAuth app grants', tpl: 'riskyapps', scored: true },
  { id: 'labels',     area: 'Apps & Data', label: 'Sensitivity labels published & enabled',     tpl: 'labels',    scored: true, requiresCapability: 'sensitivityLabels' },
  { id: 'dlp',        area: 'Apps & Data', label: 'Data loss prevention policy coverage',       tpl: null,        scored: true, requiresCapability: 'secureScore' },
  { id: 'encryption', area: 'Apps & Data', label: 'Sensitive content encryption in use',        tpl: null,        scored: true, requiresCapability: 'secureScore' },
  { id: 'sharing',    area: 'Apps & Data', label: 'External sharing restricted (SharePoint/OneDrive)', tpl: 'sharing', scored: true, requiresCapability: 'sharePointSettings' },
  /* Monitoring (2) */
  { id: 'logging',    area: 'Monitoring', label: 'Unified audit logging enabled',              tpl: null,        scored: true, requiresCapability: 'secureScore' },
  { id: 'alerts',     area: 'Monitoring', label: 'Security alerts triaged & threat protection enabled', tpl: null, scored: true, requiresCapability: 'secureScore' },
  /* Reads the Defender XDR incident queue directly, unlike 'alerts'
     above which is still inferred from Secure Score control names. That
     makes this the first check able to support 'demonstrated' assurance
     on the incident-response controls — a real record with real
     timestamps, rather than a score about a product. */
  { id: 'xdr-incidents', area: 'Monitoring', label: 'Security incidents triaged within cadence', tpl: 'xdr-incidents', scored: true, requiresCapability: 'defenderXdr' },
  /* Privacy (2). The first automated signal Checkpoint has ever had for
     ISO 27701 / Privacy Act obligations — everything privacy-related was
     previously self-reported. Both are separately licensed, so most
     tenants will see Manual rather than a failure, which is the correct
     answer for a capability they do not hold. */
  { id: 'privacy-srr', area: 'Privacy', label: 'Subject rights requests answered within statutory deadline', tpl: 'privacy-srr', scored: true, requiresCapability: 'priva' },
  { id: 'retention',   area: 'Privacy', label: 'Retention & disposal labels published', tpl: 'retention', scored: true, requiresCapability: 'recordsManagement' },
  /* Continuity & Supplier (3) */
  { id: 'backup',     area: 'Continuity', label: 'Backup coverage & restore testing',          tpl: 'backup',    scored: true },
  { id: 'bcp',        area: 'Continuity', label: 'Business continuity / disaster recovery plan documented & tested', tpl: 'bcp', scored: true },
  { id: 'supplier',   area: 'Supplier',   label: 'Supplier security assessments current',      tpl: 'supplier',  scored: true },
  /* Governance (2) */
  { id: 'policy',     area: 'Governance', label: 'Information security policy published & reviewed', tpl: 'policy', scored: true },
  /* scored:true since the Training register exists — app.js's
     applyTrainingCheckResult() computes this from real completion data
     at scan time rather than from a Graph signal (there isn't one).
     With no training records at all it still resolves to 'manual', so
     a client tracking awareness training in a separate LMS is never
     scored down for leaving no trace here. */
  { id: 'training',   area: 'Governance', label: 'Security awareness training completion',     tpl: null,        scored: true },
  /* Cloud (AWS) (10) — populated only by the optional AWS collector
     (public/checkpoint/aws/), a Lambda a client deploys into their OWN
     AWS account. Every other check here reads Microsoft Graph, which
     meant a client whose product runs on AWS had a console that could
     see the corporate tenant and not the production environment.

     A tenant with no AWS collector deployed simply never has results
     for these ids, and CheckpointLib.checkResult() resolves an absent
     result to 'manual' -- excluded from the score denominator, exactly
     like a licence-gated Microsoft check. They are gated in the UI on
     `requiresCapability: 'aws'`, which app.js derives from whether any
     aws-* result has ever been seen, so a Microsoft-only tenant sees
     the console it saw before this existed. */
  { id: 'aws-root-mfa',       area: 'Cloud (AWS)', label: 'AWS root account protected by MFA',                 tpl: null, scored: true, requiresCapability: 'aws' },
  { id: 'aws-user-mfa',       area: 'Cloud (AWS)', label: 'MFA enforced for AWS console users',                tpl: null, scored: true, requiresCapability: 'aws' },
  { id: 'aws-key-age',        area: 'Cloud (AWS)', label: 'IAM access keys rotated within policy',             tpl: null, scored: true, requiresCapability: 'aws' },
  { id: 'aws-cloudtrail',     area: 'Cloud (AWS)', label: 'CloudTrail enabled and multi-region',               tpl: null, scored: true, requiresCapability: 'aws' },
  { id: 'aws-config',         area: 'Cloud (AWS)', label: 'AWS Config recording resource state',               tpl: null, scored: true, requiresCapability: 'aws' },
  { id: 'aws-guardduty',      area: 'Cloud (AWS)', label: 'GuardDuty threat detection enabled',                tpl: null, scored: true, requiresCapability: 'aws' },
  { id: 'aws-s3-public',      area: 'Cloud (AWS)', label: 'S3 public access blocked account-wide',             tpl: null, scored: true, requiresCapability: 'aws' },
  { id: 'aws-ebs-encryption', area: 'Cloud (AWS)', label: 'EBS volumes encrypted by default',                  tpl: null, scored: true, requiresCapability: 'aws' },
  { id: 'aws-rds-encryption', area: 'Cloud (AWS)', label: 'RDS instances encrypted at rest',                   tpl: null, scored: true, requiresCapability: 'aws' },
  { id: 'aws-sg-open',        area: 'Cloud (AWS)', label: 'No security group exposes admin ports to the internet', tpl: null, scored: true, requiresCapability: 'aws' }
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
  { key: 'riskyUsersReviewMax', label: 'Max risky users (review)', desc: 'Zero flagged risky users is a pass; at or under this many is a review; more is a fail.', def: '3' },
  { key: 'deviceStaleDays', label: 'Device check-in staleness (days)', desc: 'A managed device that has not contacted Intune within this many days is treated as unmanaged — it is not receiving policy or updates, and its last reported compliance state is stale evidence.', def: '30' },
  { key: 'incidentTriageDays', label: 'Incident triage window (days)', desc: 'A high-severity Defender XDR incident still active beyond this many days fails the incident-triage check. Set this to whatever your own incident response plan commits to — the default of 5 days is a starting point, not a standard.', def: '5' },
  { key: 'controlReviewCadenceDays', label: 'Control re-verification cadence (days)', desc: 'An Implemented control not re-verified within this many days shows as overdue for review on the Statement of Applicability, the Dashboard and the Audit Readiness Report. A posture-scan-backed control re-verifies itself automatically on every scan (see captureAutoEvidence() in app.js) — this cadence mainly governs the manually-attested ones.', def: '90' }
];
window.DEFAULT_SETTINGS = {
  riskAppetite: 'Medium',
  /* Segregation of duties (ISO 27001 A.5.3) — 'true'|'false'. When on,
     Checkpoint refuses to let the same person both originate and
     authorise a policy approval or a residual-risk acceptance.
     Defaults OFF deliberately: Checkpoint's typical operator is a
     one- or two-person consultancy where the practitioner legitimately
     is the only person in the tenant, and defaulting this on would
     lock them out of approving anything on day one. A self-approval is
     RECORDED either way (see segregationNote() in app.js) — the
     setting only decides whether it is also refused. */
  sodEnforced: 'false',
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
  /* SOC 2 report type ('Type I'|'Type II') — the AICPA distinction
     between design effectiveness (a control is suitably designed AS OF
     a point in time — what every other framework's SoA already shows)
     and operating effectiveness (the control actually operated that
     way CONSISTENTLY across a defined observation period, typically
     3-12 months). Type I is every tenant's default, matching how the
     rest of this app already works — nothing changes for a Type I
     tenant. Type II changes the SOC 2 SoA view (see
     renderSoc2TypeIIRows() in app.js) to show, per automated control,
     how many posture scans fall inside the observation window and
     whether every one of them passed — computed from data every scan
     already records (each Scans list item's Detail JSON keeps its own
     dated results, not just the latest one — see CheckpointLib.
     operatingEffectiveness() in lib.js), not a new signal this app
     didn't already have. */
  soc2ReportType: 'Type I',
  /* ISO date string marking when Type II observation began, or '' if
     unset — every posture scan on or after this date counts as an
     observation for soc2ReportType's operating-effectiveness view.
     Meaningless while soc2ReportType is 'Type I'. Left blank, the
     effectiveness view falls back to the tenant's entire scan history,
     which almost always overstates the real observation window — set
     this explicitly once observation actually starts. */
  soc2ObservationStart: '',
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
  incidentTriageDays: '5',
  deviceStaleDays: '30',
  controlReviewCadenceDays: '90',
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
  /* Organisation profile — the Clause 4.2/4.3 facts generated policy
     documents fill themselves in from (see ORG_PROFILE_FIELDS in
     templates.js and resolveOrgTokens() in app.js). Empty by default:
     every token falls back to the generic wording the templates
     carried before, so a tenant that never opens the wizard is
     unaffected. Ordinary Settings rows, so no list schema changes and
     nothing for COLUMN_RECONCILE to heal. */
  orgIndustry: '',
  orgBusinessUnits: '',
  orgLocations: '',
  orgServices: '',
  orgInterestedParties: '',
  orgRegulatory: '',
  orgExclusions: '',
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

/* ============================================================
   Document control register — ISO 27001 Clause 7.5.2/7.5.3
   ------------------------------------------------------------
   Documented information has to be identifiable, versioned,
   reviewed, approved before issue, and re-approved on a defined
   cadence. Checkpoint used to store files in a bare SharePoint
   document library and derive a document's draft/approved state
   from the audit log — enough to watermark a generated policy,
   but not a register: no owner, no version, no review date, and
   nothing an auditor could be shown as "here is our controlled
   document list".

   These columns are added to the Checkpoint Documents LIBRARY
   itself rather than to a parallel list keyed by filename. Two
   reasons: the metadata travels with the file (rename or move it
   in SharePoint and nothing de-syncs), and the register is then
   natively visible in SharePoint's own UI — a client can sort and
   filter it there, or hand an auditor a link, without Checkpoint
   in the loop at all.

   Every name is Doc*-prefixed to stay clear of the columns
   SharePoint already defines on a document library (Title, Author,
   Modified, Version-history and friends) — a collision there
   fails the column POST with a generic error rather than anything
   diagnosable.
   ============================================================ */
window.DOC_META_COLUMNS = [
  { name: 'DocOwner', text: {} },
  { name: 'DocVersion', text: {} },
  { name: 'DocStatus', text: {} },
  { name: 'DocApprovedBy', text: {} },
  { name: 'DocApprovalDate', text: {} },
  { name: 'DocNextReview', text: {} },
  { name: 'DocClassification', text: {} },
  { name: 'DocFrameworks', text: {} },
  /* Set only on a document Checkpoint generated from POLICY_TEMPLATES —
     lets the approval path and the attestation campaign builder recover
     which template (and therefore which controls) a file came from
     without parsing the audit log. Blank for an ordinary upload. */
  { name: 'DocTplId', text: {} }
];

/* Lifecycle states. "Superseded" exists so a replaced policy can be kept
   for the retention period (auditors ask for the previous version) while
   dropping out of the live register's review and attestation counts. */
window.DOC_STATUSES = ['Draft', 'In review', 'Approved', 'Superseded'];
window.DOC_CLASSIFICATIONS = ['Public', 'Internal', 'Confidential', 'Commercial in Confidence'];

/* How long before a document's next-review date it starts showing as
   "due" rather than simply current. Overdue is anything past the date. */
window.DOC_REVIEW_WARN_DAYS = 30;

/* Canonical check id → ISO 27001 control code(s) it satisfies evidence
   for. ISO 27001 is the mapping anchor because every other framework's
   control rows already carry an "also satisfies ISO27001 <code>" (or
   the reverse) cross-reference in their own `map` field — app.js's
   auto-evidence step resolves those at scan time to also fill matching
   controls in every other entitled framework, rather than duplicating
   a full per-framework table here. Where a check also has a TPL entry
   in app.js (the risk-proposal template), the codes intentionally match
   — same real-world control, same evidence.

   Does double duty as ISO 27001's OWN status-suggestion source too
   (runScan()'s S.iso27001Proposed block / App.confirmIso27001Suggestion())
   — the same flat, suggest-only contract every other framework's
   CHECK_<FRAMEWORK> table uses, just unencrypted since ISO 27001 is the
   base framework every tenant is provisioned with by default rather
   than a licensed add-on. Every key here is scored:true (see the
   scored:false warning above CHECK_ISO42001) — 20 checks across 19
   distinct A.5/A.8 codes, out of 93 total. The rest of ISO 27001's
   controls (physical security, organisational/HR process, most of the
   A.5 governance series) have no live Graph signal and stay
   self-reported. */
window.CHECK_CONTROLS = {
  'mfa-all': ['A.5.15', 'A.8.5'],
  'mfa-priv': ['A.8.2', 'A.8.5'],
  'legacy': ['A.8.5', 'A.5.15'],
  'ca-device': ['A.8.1', 'A.5.15'],
  'ca-risk': ['A.8.5', 'A.5.15'],
  'admins': ['A.8.2'],
  'pim': ['A.8.2', 'A.5.18'],
  'guests': ['A.5.16'],
  'riskyusers': ['A.5.25', 'A.5.26'],
  'device': ['A.8.1'],
  'leaver': ['A.5.11', 'A.5.18', 'A.6.5'],
  'device-checkin': ['A.8.1'],
  'device-config': ['A.8.9'],
  'compliance-policy': ['A.8.1'],
  'patch': ['A.8.8'],
  'wdac': ['A.8.7', 'A.8.19'],
  'macro': ['A.8.7'],
  'riskyapps': ['A.5.21', 'A.8.3'],
  'logging': ['A.8.15'],
  'alerts': ['A.8.16'],
  'labels': ['A.5.12', 'A.5.13'],
  'dlp': ['A.8.12'],
  'encryption': ['A.8.24'],
  'access-review': ['A.5.18', 'A.8.2'],
  'sharing': ['A.5.14', 'A.8.3'],
  /* Same two controls 'riskyusers' maps to, deliberately: both are
     evidence about assessment and response, and checkIdsByControl()
     already unions several checks onto one control. Not mapped to
     A.5.27 (learning from incidents) — post-incident review is a
     document, not something an open-incident age can demonstrate, and
     claiming it here would be exactly the kind of unearned coverage the
     assurance ranking exists to prevent. */
  'xdr-incidents': ['A.5.25', 'A.5.26'],
  /* Register-derived checks (see lib.js's backupCheckResult and
     friends). These map to controls that previously had NO automated
     signal at all — the checks existed but were scored:false, so the
     controls could only ever be asserted. They can now reach
     'demonstrated' from Checkpoint's own registers, with no Graph scope
     and no licence gate, which is why these four matter more than their
     size suggests: they work on every tenant, not just E5 ones. */
  'backup': ['A.8.13'],
  'bcp': ['A.5.29', 'A.5.30'],
  'supplier': ['A.5.19', 'A.5.20', 'A.5.22'],
  'policy': ['A.5.1'],
  /* Privacy. A.5.34 covers privacy and PII protection; A.5.33/A.8.10 are
     the records-protection and information-deletion pair that retention
     labels actually implement. These were entirely self-reported before
     — Checkpoint had no automated privacy signal of any kind. */
  'privacy-srr': ['A.5.34'],
  'retention': ['A.5.33', 'A.8.10']
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
     suggest, rather than crashing on a missing lookup. E8.8 (Regular
     backups) was dropped from the source table: it was sourced from
     'backup', a scored:false CHECK_DEFS entry checkResult() always
     returns 'manual' for (see the warning above CHECK_ISO42001) — that
     entry could never have fired. No live Graph signal for backup
     verification exists in Checkpoint's current scope, so E8.8 stays
     self-reported until that changes. */
};

/* Posture check id -> IS18 (QGEA) control code(s) it speaks to — the
   same suggest-only contract as CHECK_E8 above, but flat: IS18 controls
   have no per-maturity-level children, so a check maps straight to the
   control code(s) whose SoA status it can suggest. Ships as part of the
   encrypted is18 content pack (checkpoint-content/is18.json,
   extra.checkIs18); empty until a verified activation licenses is18.
   IS18.4.8 (backup-related) was dropped for the same 'backup'/
   scored:false reason as CHECK_E8's E8.8 above. IS18.6.1/IS18.6.2
   (supplier controls) were re-sourced from 'guests' instead of
   'supplier' (also scored:false, also dead) — external guest accounts
   are a reasonable evidentiary proxy for third-party access, the same
   substitution used elsewhere for supplier-adjacent controls. */
window.CHECK_IS18 = {};

/* Posture check id -> RFFR/ISM control identifier(s) it speaks to — the
   same flat, suggest-only contract as CHECK_IS18 above. Ships as part of
   the encrypted rffr content pack (checkpoint-content/rffr.json,
   extra.checkRffr); empty until a verified activation licenses rffr. A
   curated, high-precision subset of the 989 ISM controls (identity,
   hardening, logging, cryptography) where a live Microsoft Graph signal
   genuinely maps to the ISM control text — the rest of the SoA stays
   self-reported, never silently marked from a scan. Backup-related ISM
   controls were dropped from this table: they were sourced from
   'backup', a scored:false CHECK_DEFS entry that checkResult() always
   returns 'manual' for (see the warning above CHECK_ISO42001) — those
   four entries could never have fired. There's no live Graph signal for
   backup verification in Checkpoint's current scope, so those controls
   stay self-reported until that changes. */
window.CHECK_RFFR = {};

/* IMPORTANT constraint on every CHECK_ISO42001/CHECK_ISO27701/CHECK_SOC2/
   CHECK_NISTCSF table below: lib.js's checkResult() returns 'manual'
   UNCONDITIONALLY for any CHECK_DEFS entry with scored:false — before it
   ever looks at a real Graph result. That means 'backup', 'bcp',
   'supplier' and 'policy' (all scored:false) can NEVER produce a
   suggestion, no matter what a tenant's actual environment looks like —
   using one of those four as a table key is silent dead code, not a
   working-but-untested mapping. ('training' is the one exception:
   scored:true, with applyTrainingCheckResult() computing a real result
   from completion data — see its own CHECK_DEFS comment above.) Every
   table below was built keying only on scored:true checks for exactly
   this reason; if you add a new mapping, keying on backup/bcp/supplier/
   policy will pass code review and tests but never fire in production. */

/* Posture check id -> ISO 42001 (Annex A, 2023) control code(s) it
   speaks to — the same flat, suggest-only contract as CHECK_IS18/
   CHECK_RFFR above. Ships as part of the encrypted iso42001 content pack
   (checkpoint-content/iso42001.json, extra.checkIso42001); empty until a
   verified activation licenses iso42001. Deliberately covers only the
   Annex A controls with a genuine technical signal — access to and
   monitoring of the systems/tooling/data an AI system depends on
   (A.4.2–A.4.6), operation monitoring and event logging (A.6.2.6,
   A.6.2.8), incident communication (A.8.4) and third-party oversight
   (A.10.3, fed by 'guests' only — 'supplier' would be the more direct
   fit but is scored:false, see note above). The governance-heavy
   controls (AI policy content, impact assessment write-ups, design
   documentation) have no live Graph signal and stay self-reported by
   design — same honesty bar as CHECK_RFFR's ~48-of-989 curated subset.
   20 checks across the same 10 distinct codes. */
window.CHECK_ISO42001 = {};

/* Posture check id -> ISO 27701 (PIMS, 2019 edition) control code(s) it
   speaks to — same flat, suggest-only contract as CHECK_ISO42001 above.
   Ships as part of the encrypted iso27701 content pack
   (checkpoint-content/iso27701.json, extra.checkIso27701); empty until a
   verified activation licenses iso27701. ISO 27701's own P.7.x/P.8.x
   control set is deliberately the privacy-specific layer on top of an
   ISMS — consent, data-subject rights, cross-border transfer, processor
   contracts — so unlike ISO 42001's Annex A, most of it is legal/process
   and genuinely has no live Graph signal. The honest automatable subset:
   data-in-transit protection for PII (P.7.4.9, P.8.4.3), logging of
   third-party PII disclosures (P.7.5.3, P.7.5.4, P.8.5.3), processor
   due-diligence evidence via external access (P.7.2.6), and PII
   classification records (P.7.2.8, via 'labels' — the same
   correspondence ISO 27001's own A.5.12 already carries in its map
   field). P.8.5.6/P.8.5.7 (subcontractor disclosure/authorisation to
   the customer) would need 'supplier', which is scored:false — dropped
   rather than left as dead weight. Consent records, DSAR handling,
   retention schedules and cross-border legal basis stay self-reported.
   6 checks across 7 distinct codes. */
window.CHECK_ISO27701 = {};

/* Posture check id -> SOC 2 Trust Services Criteria control code(s) it
   speaks to — same flat, suggest-only contract as CHECK_ISO42001/
   CHECK_ISO27701 above. Ships as part of the encrypted soc2 content
   pack (checkpoint-content/soc2.json, extra.checkSoc2); empty until a
   verified activation licenses soc2. The Common Criteria's CC6.x
   (logical access) and CC7.x (monitoring, vulnerability & incident
   response) series is exactly the same territory the other frameworks'
   checks already evidence, so this is the largest automatable subset
   of any framework so far — 19 checks across 13 distinct codes,
   cross-checked for consistency against the existing ISO27001-anchored
   "SOC2 CCn.n" cross-references those same ISO27001 controls already
   carry in their own `map` field above. CC9.2 (vendor/business-partner
   risk) is fed by 'guests' rather than the more obvious 'supplier',
   which is scored:false. The COSO-derived governance criteria (CC1.1-
   CC5.x board oversight, risk philosophy, fraud consideration — CC1.4
   is the one exception, fed by 'training'), availability criteria that
   would need 'backup'/'bcp' (both scored:false), and Processing
   Integrity / most Privacy criteria (consent and disclosure records)
   have no live Graph signal and stay self-reported. */
window.CHECK_SOC2 = {};

/* Posture check id -> NIST CSF 2.0 category code(s) it speaks to —
   same flat, suggest-only contract as the others above. Ships as part
   of the encrypted nistcsf content pack (checkpoint-content/
   nistcsf.json, extra.checkNistCsf); empty until a verified activation
   licenses nistcsf. Targets the 22 category-level control rows, which
   exist in a tenant's Controls list regardless of the nistDepth
   setting (subcategory rows are ADDED alongside them, never replace
   them — see ensureNistSubcategories()/App.setNistDepth in app.js), so
   a suggestion here works the same whether a tenant is at Category or
   Subcategory depth. NIST CSF's categories are broad enough that a
   larger fraction catch a live signal than SOC 2 or ISO 42001's more
   granular controls even after dropping GV.PO/RC.RP (would need
   'policy'/'backup', both scored:false) — 18 checks across 8 of the 22
   categories, including GV.SC (supply-chain risk) fed by 'guests'
   rather than the more obvious 'supplier'. */
window.CHECK_NISTCSF = {};

/* Posture check -> CPS 234 requirement. Ships EMPTY, same as every
   other premium framework's lookup: the real mapping lives only in the
   cps234 content pack and is merged in by mergeLicensedPacks() once a
   verified activation licenses the module. */
window.CHECK_CPS234 = {};

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
      /* The oldest scan carries a riskSnapshot (residual L/I as of that
         date, slightly worse than today's residuals) so the demo shows
         the Risk Landscape's movement trails and the Risk Register
         Snapshot report's "movement since" section — the same shape
         runScan() records on every real scan. */
      scans: [{ date: daysFrom(-42), score: 41, readiness: 12, source: 'manual', riskSnapshot: [
        { id: 'R-001', L: 5, I: 4 }, { id: 'R-002', L: 4, I: 5 }, { id: 'R-003', L: 4, I: 3 }, { id: 'R-004', L: 3, I: 4 }, { id: 'R-005', L: 3, I: 4 }
      ] }, { date: daysFrom(-21), score: 48, readiness: 15, source: 'manual' }, { date: daysFrom(-1), score: 45, readiness: 15, source: 'automated' }],
      alerts: [
        { id: 'ALT-001', checkId: 'wdac', label: 'Application control (WDAC) deployed', prev: 'pass', next: 'fail', note: '0% on 1 related Secure Score control (exact controlName match — verify in portal)', detected: daysFrom(-1), ack: false }
      ],
      lastResults: {
        'mfa-all': 'pass', 'mfa-priv': 'review', 'legacy': 'fail', 'ca-device': 'review', 'ca-risk': 'fail', 'admins': 'review', 'pim': 'fail', 'guests': 'pass', 'riskyusers': 'review', 'access-review': 'fail', 'leaver': 'fail',
        'device': 'pass', 'compliance-policy': 'pass', 'device-checkin': 'review', 'device-config': 'pass', 'patch': 'review',
        'wdac': 'fail', 'macro': 'pass', 'riskyapps': 'review', 'labels': 'review', 'dlp': 'review', 'encryption': 'manual', 'sharing': 'fail',
        'logging': 'pass', 'alerts': 'review', 'xdr-incidents': 'fail',
        'privacy-srr': 'fail', 'retention': 'review'
      },
      lastNotes: {
        'admins': '6 Global Administrators', 'device': '97% of 214 devices compliant',
        'ca-device': 'Device compliance is required by at least one Conditional Access policy, but not for all cloud apps',
        'ca-risk': 'No Conditional Access policy enforces sign-in-risk or user-risk based access controls',
        'guests': '14 guest users in the directory', 'riskyusers': '2 risky user(s) currently flagged and unresolved',
        'compliance-policy': '3 compliance policies configured', 'device-checkin': '14 of 214 device(s) have not checked in for over 30 days (2 never have) — their compliance state is stale evidence', 'device-config': '11 device configuration profiles deployed (showing first page)', 'riskyapps': '2 app grant(s) with a high-privilege scope (of 31 total grants)',
        'labels': '3 sensitivity label(s) exist but none are enabled/published',
        'access-review': 'No Entra Access Reviews configured — access rights are not being reviewed at a planned interval',
        'leaver': '9 disabled account(s); 1 STILL HOLD a privileged directory role; 4 still hold a paid licence — confirm each is a deliberate retention rather than an unfinished offboarding',
        'sharing': 'External sharing is set to "externalUserAndGuestSharing" — anyone with a link can access shared content without signing in',
        'xdr-incidents': '7 active incident(s), 3 high severity; 2 open beyond the 5-day triage window; 1 high-severity unassigned',
        'privacy-srr': '3 open request(s); 1 PAST their statutory due date; 1 due within 7 days',
        'retention': '4 of 4 retention label(s) published, none with an end-of-retention action — retained content is never disposed of'
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
        { id: 'ACT-007', title: 'Surveillance audit finding: asset inventory missing 12 cloud-only devices', risk: '', control: 'A.5.9', pr: 'High', owner: 'K. Patel', due: daysFrom(10), status: 'Open', src: 'External audit', evidenceUrl: '', type: 'Non-conformity (Minor)' },
        { id: 'ACT-011', title: 'Add a send-delay + recipient-domain warning for external mail (INC-0003 corrective action)', risk: '', control: 'A.5.14', pr: 'High', owner: 'S. Okafor', due: daysFrom(14), status: 'Open', src: 'Incident', evidenceUrl: '', type: 'Action' }
      ],
      /* Illustrative progress history for the two demo actions already
         sitting at 'In progress', so a prospect exploring the demo sees
         the feature actually working, not an empty state. */
      actionUpdates: [
        { id: 'UPD-0001', action: 'ACT-001', date: daysFrom(-18), note: 'Drafted the updated security schedule and sent to Legal for review before it goes to suppliers.', evidenceUrl: '', status: 'In progress', author: 'K. Patel' },
        { id: 'UPD-0002', action: 'ACT-001', date: daysFrom(-4), note: 'Legal review complete, minor wording changes only. Sent to the first 4 of 10 suppliers this week; remainder scheduled next week.', evidenceUrl: '', status: 'In progress', author: 'K. Patel' },
        { id: 'UPD-0003', action: 'ACT-004', date: daysFrom(-25), note: 'Selected Attack Simulation Training in Defender for the phishing programme. First campaign scheduled.', evidenceUrl: '', status: 'In progress', author: 'M. Chen' },
        { id: 'UPD-0004', action: 'ACT-004', date: daysFrom(-8), note: 'First simulation sent to all staff — 22% click rate. Awareness module assigned to everyone who clicked; second simulation planned in 6 weeks to measure improvement.', evidenceUrl: '', status: 'In progress', author: 'M. Chen' }
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
      entitlements: { iso27001: true, soc2: false, essential8: false, is18: false, iso42001: false, iso27701: false, dispirap: false, nistcsf: false, rffr: false, ai: false },
      settings: Object.assign({}, window.DEFAULT_SETTINGS),
      proposed: [],
      /* One list per framework whose SoA statuses runScan() can suggest.
         All of them are seeded, not just the first three that shipped:
         renderSoa() reads S.<fw>Proposed for the active framework tab
         and App.confirm<Fw>Suggestion()/dismiss<Fw>Suggestion() call
         .find()/.filter() straight on it, so a framework missing from
         here is one undefined dereference away from a thrown handler
         the moment the shapes of those two call sites change. */
      e8Proposed: [],
      is18Proposed: [],
      rffrProposed: [],
      iso42001Proposed: [],
      iso27701Proposed: [],
      soc2Proposed: [],
      nistcsfProposed: [],
      iso27001Proposed: [],
      handledTpl: [],
      aiCandidates: [],
      audits: [
        { id: 'AUD-001', fw: 'iso27001', scope: 'Access control & supplier management (Annex A.5, A.8)', auditor: 'S. Okafor (internal)', planned: daysFrom(-35), completed: daysFrom(-33), status: 'Completed', summary: 'One minor non-conformity raised (asset inventory gaps in cloud-only devices). Programme otherwise operating effectively.', findingRefs: ['ACT-007'] },
        { id: 'AUD-002', fw: 'iso42001', scope: 'AI system risk management process', auditor: 'External — Vantage Assurance', planned: daysFrom(25), completed: '', status: 'Planned', summary: '', findingRefs: [] }
      ],
      /* Four incidents chosen to show what the register is actually for:
         one Defender-detected technical incident (logged here too, not
         a duplicate console), one purely physical/human incident
         Defender could never see, one privacy breach mid-assessment
         within its 30-day window, and one whose assessment window has
         already passed — so the overdue flag has something real to
         show rather than only ever rendering "0 overdue" in a demo. */
      incidents: [
        { id: 'INC-0001', title: 'Phishing email led to one compromised mailbox', category: 'Security', severity: 'High', detected: daysFrom(-58), occurred: daysFrom(-58), reportedBy: 'Automated — Microsoft Defender', discoveredVia: 'Defender alert', description: 'Defender flagged anomalous mailbox rule creation and impossible-travel sign-in on a finance team account within minutes of a phishing click.', affectedSystems: 'One user mailbox (Microsoft 365); no evidence of lateral movement', status: 'Closed', containmentActions: 'Password reset, all sessions revoked, malicious inbox rule removed, conditional access re-verified within 40 minutes of the alert.', rootCause: 'User clicked a credential-harvesting link in a well-crafted invoice-themed email; MFA was satisfied via a real-time relay (adversary-in-the-middle).', lessonsLearned: 'Phishing-resistant MFA (passkeys) rolled out to the finance team; this scenario is now covered explicitly in the Security Awareness course.', actionRefs: [], evidenceUrl: '', isPrivacyBreach: false, assessmentDueDate: '', assessmentNote: '', assessmentComplete: false, notifiedRegulator: false, notifiedRegulatorDate: '', notifiedIndividuals: false, notifiedIndividualsDate: '', closedDate: daysFrom(-55) },
        { id: 'INC-0002', title: 'Laptop left on a train', category: 'Physical', severity: 'Medium', detected: daysFrom(-21), occurred: daysFrom(-21), reportedBy: 'K. Patel', discoveredVia: 'Staff report', description: 'An employee reported their work laptop left on a train during the evening commute. Reported within the hour.', affectedSystems: 'One managed laptop, BitLocker-encrypted', status: 'Closed', containmentActions: 'Device remotely wiped via Intune within 25 minutes of the report; encryption confirmed active at time of loss.', rootCause: 'Momentary lapse — device left on a seat while exiting.', lessonsLearned: 'Confirmed as a non-notifiable event given full-disk encryption; added as a worked example in Security Awareness (\"lost or stolen device\" section).', actionRefs: [], evidenceUrl: '', isPrivacyBreach: true, assessmentDueDate: daysFrom(-11), assessmentNote: 'Assessed: encryption was active and unbroken, so no unauthorised access occurred. Not an eligible data breach under the Privacy Act — no notification required. Assessment completed within the 30-day window.', assessmentComplete: true, notifiedRegulator: false, notifiedRegulatorDate: '', notifiedIndividuals: false, notifiedIndividualsDate: '', closedDate: daysFrom(-18) },
        { id: 'INC-0003', title: 'Customer list emailed to the wrong external recipient', category: 'Privacy', severity: 'High', detected: daysFrom(-9), occurred: daysFrom(-9), reportedBy: 'S. Okafor', discoveredVia: 'Staff report', description: 'A spreadsheet of customer names, emails and account tiers was sent to an incorrect external address due to Outlook autocomplete.', affectedSystems: 'Customer contact data — approximately 340 records', status: 'Investigating', containmentActions: 'Requested recall and deletion confirmation from the recipient; recipient has confirmed deletion in writing.', rootCause: 'Autocomplete selected a similarly-named external contact; no verification step before sending.', lessonsLearned: '', actionRefs: ['ACT-011'], evidenceUrl: '', isPrivacyBreach: true, assessmentDueDate: daysFrom(21), assessmentNote: 'Assessment in progress — evaluating likelihood of serious harm given the recipient\'s written deletion confirmation.', assessmentComplete: false, notifiedRegulator: false, notifiedRegulatorDate: '', notifiedIndividuals: false, notifiedIndividualsDate: '', closedDate: '' },
        { id: 'INC-0004', title: 'Supplier notified us of their own data breach', category: 'Third party', severity: 'Medium', detected: daysFrom(-42), occurred: daysFrom(-50), reportedBy: 'M. Chen', discoveredVia: 'Vendor notification', description: 'Northwind Cloud Hosting notified us of unauthorised access to a staging environment that held a de-identified export of production data.', affectedSystems: 'De-identified data export held by a supplier (Northwind Cloud Hosting — see Vendor risk)', status: 'Open', containmentActions: 'Requested the supplier\'s incident report and evidence of de-identification; pending their response.', rootCause: '', lessonsLearned: '', actionRefs: [], evidenceUrl: '', isPrivacyBreach: true, assessmentDueDate: daysFrom(-12), assessmentNote: '', assessmentComplete: false, notifiedRegulator: false, notifiedRegulatorDate: '', notifiedIndividuals: false, notifiedIndividualsDate: '', closedDate: '' }
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
        { id: 'VEN-001', name: 'Northwind Cloud Hosting', service: 'Primary IaaS hosting for production workloads', dataAccessed: 'Full production database access; encrypted at rest', criticality: 'Critical', reviewStatus: 'Overdue', lastReviewed: daysFrom(-383), nextReviewDue: daysFrom(-18), certifications: 'SOC2, ISO27001', certExpiryDate: daysFrom(-12), owner: 'K. Patel', notes: 'Renewal negotiation in progress', contactEmail: 'security@northwindhosting.example', controls: ['A.5.19', 'A.5.20'], riskRefs: ['R-001'], questionnaireStatus: 'Sent', questionnaireSentDate: daysFrom(-40), calRef: 'CAL-008', publicListed: true, dataCategories: ['Health information', 'Customer PII', 'Production system access'] },
        { id: 'VEN-002', name: 'Aria Payments Gateway', service: 'Card payment processing', dataAccessed: 'Tokenised payment references only — no raw PAN stored', criticality: 'High', reviewStatus: 'Reviewed', lastReviewed: daysFrom(-305), nextReviewDue: daysFrom(60), certifications: 'SOC2, PCI DSS', certExpiryDate: daysFrom(200), owner: 'S. Okafor', notes: '', contactEmail: 'compliance@ariapayments.example', controls: ['A.5.21', 'CC9.2'], riskRefs: [], questionnaireStatus: 'Received', questionnaireSentDate: daysFrom(-320), calRef: 'CAL-009', publicListed: true, dataCategories: ['Financial / payment data'] },
        { id: 'VEN-003', name: 'Lumen Legal Advisory', service: 'Outside counsel — contract review', dataAccessed: 'Contract drafts, no client PII', criticality: 'Low', reviewStatus: 'Not started', lastReviewed: '', nextReviewDue: daysFrom(150), certifications: '', owner: 'Legal', notes: '', contactEmail: '', controls: ['A.5.22'], riskRefs: [], questionnaireStatus: 'Not sent', questionnaireSentDate: '', calRef: '', publicListed: false, dataCategories: ['Company confidential'] }
      ],
      aiSystems: [
        { id: 'AI-001', name: 'Microsoft 365 Copilot', purpose: 'Drafting and summarisation assistance across Word, Outlook and Teams for all staff', owner: 'K. Patel', dataSources: 'Microsoft Graph-connected tenant content (email, documents, chats) staff already have access to', modelType: 'Foundation model (hosted, Microsoft-operated)', vendor: 'Microsoft', riskTier: 'Limited', aiActAnswers: { directInteraction: true }, impactAssessmentStatus: 'Completed', humanOversight: 'All outputs are drafts reviewed and edited by the staff member before use; no autonomous action is taken.', lastReviewed: daysFrom(-40), spId: '' },
        { id: 'AI-002', name: 'Clinical Triage Assistant', purpose: 'Suggests a triage priority for inbound patient support tickets based on submitted symptoms text', owner: 'S. Okafor', dataSources: 'Patient-submitted support ticket text (may include health information)', modelType: 'Fine-tuned classifier, hosted on Azure OpenAI', vendor: 'OpenAI (via Azure)', riskTier: 'High', impactAssessmentStatus: 'In progress', humanOversight: 'A human triage nurse confirms every priority suggestion before a ticket is actioned — the model never re-prioritises a ticket unattended.', lastReviewed: daysFrom(-10), spId: '' },
        { id: 'AI-003', name: 'Marketing Copy Generator', purpose: 'Drafts first-pass marketing copy for the website and email campaigns', owner: 'M. Chen', dataSources: 'Public product descriptions and brand style guide only — no customer or patient data', modelType: 'Third-party SaaS (Anthropic Claude via vendor API)', vendor: 'Jasper AI', riskTier: 'Minimal', impactAssessmentStatus: 'Not started', humanOversight: '', lastReviewed: '', spId: '' }
      ],
      /* One disposition, deliberately: the demo tenant runs CrowdStrike
         rather than Microsoft Defender, so the 'alerts' check (seeded
         'review' in lastResults above) reads as a pass sourced from an
         alternative tool instead of a permanent amber mark. It carries a
         live ReviewDue so the expiry behaviour is visible in the demo
         too — see lib.js's checkResult(). */
      checkDispositions: [
        { checkId: 'alerts', disposition: 'alternative', tool: 'CrowdStrike Falcon', justification: 'Endpoint detection, alert triage and 24/7 SOC monitoring are delivered by CrowdStrike Falcon Complete rather than Microsoft Defender. Monthly SOC reports and the triage runbook are held in Documents.', evidenceUrl: '', owner: 'S. Okafor', lastVerified: daysFrom(-40), reviewDue: daysFrom(140) }
      ],
      /* Demo-only document-control register. Real tenants read this
         from the SharePoint library's own columns (DOC_META_COLUMNS);
         demo mode has no tenant to store files in, so these rows exist
         purely so the register — and the review-due/overdue states an
         auditor cares about — can actually be shown. url is empty
         because there is no real file behind any of them; the
         Documents view renders no "Open" link in that case. */
      documents: [
        { id: 'demo-doc-1', name: 'Information Security Policy.html', url: '', size: 48210, modified: daysFrom(-210), category: 'Policies & Procedures',
          owner: 'S. Okafor', version: '2.1', status: 'Approved', approvedBy: 'M. Chen (CEO)', approvalDate: daysFrom(-210), nextReview: daysFrom(-24), classification: 'Internal', frameworks: 'iso27001,iso27701,soc2', tplId: 'infosec-policy' },
        { id: 'demo-doc-2', name: 'Access Control Policy.html', url: '', size: 39804, modified: daysFrom(-120), category: 'Policies & Procedures',
          owner: 'K. Patel', version: '1.3', status: 'Approved', approvedBy: 'M. Chen (CEO)', approvalDate: daysFrom(-120), nextReview: daysFrom(18), classification: 'Internal', frameworks: 'iso27001,soc2,essential8', tplId: 'access-control-policy' },
        { id: 'demo-doc-3', name: 'Incident Response Plan.html', url: '', size: 52117, modified: daysFrom(-64), category: 'Policies & Procedures',
          owner: 'S. Okafor', version: '3.0', status: 'Approved', approvedBy: 'M. Chen (CEO)', approvalDate: daysFrom(-64), nextReview: daysFrom(300), classification: 'Confidential', frameworks: 'iso27001,nistcsf', tplId: 'incident-response-plan' },
        { id: 'demo-doc-4', name: 'AI Policy.html', url: '', size: 44092, modified: daysFrom(-9), category: 'Policies & Procedures',
          owner: 'K. Patel', version: '0.2', status: 'Draft', approvedBy: '', approvalDate: '', nextReview: daysFrom(356), classification: 'Internal', frameworks: 'iso42001', tplId: 'ai-policy' },
        { id: 'demo-doc-5', name: 'ISMS Scope Document.html', url: '', size: 21440, modified: daysFrom(-45), category: 'Policies & Procedures',
          owner: 'S. Okafor', version: '1.0', status: 'In review', approvedBy: '', approvalDate: '', nextReview: daysFrom(320), classification: 'Internal', frameworks: 'iso27001', tplId: 'isms-scope' },
        { id: 'demo-doc-6', name: 'Conditional Access policy export.json', url: '', size: 8830, modified: daysFrom(-21), category: 'Auto-evidence',
          owner: '', version: '', status: '', approvedBy: '', approvalDate: '', nextReview: '', classification: '', frameworks: '', tplId: '' }
      ],
      /* Training completions: the annual security course fully closed
         out, and a live AI course part-way through — including the
         demo user's own outstanding row, so the "My training" panel an
         employee actually sees has something in it. Scores vary because
         a register where everyone scored 5/5 first time looks seeded,
         and because attempt counts are part of what the record is for. */
      policyDrafts: [], /* backfilled below for returning demo sessions from before this collection existed */
      training: [
        { id: 'TRN-0001', campaign: 'TCAMP-0001', courseId: 'security-awareness', courseTitle: 'Security Awareness', courseVersion: '1.0', upn: 'sokafor@meridianhealth.example', userName: 'S. Okafor', assigned: daysFrom(-150), due: daysFrom(-120), completed: daysFrom(-148), status: 'Completed', score: '5/5', attempts: 1, source: 'campaign', note: '' },
        { id: 'TRN-0002', campaign: 'TCAMP-0001', courseId: 'security-awareness', courseTitle: 'Security Awareness', courseVersion: '1.0', upn: 'kpatel@meridianhealth.example', userName: 'K. Patel', assigned: daysFrom(-150), due: daysFrom(-120), completed: daysFrom(-141), status: 'Completed', score: '4/5', attempts: 2, source: 'campaign', note: '' },
        { id: 'TRN-0003', campaign: 'TCAMP-0001', courseId: 'security-awareness', courseTitle: 'Security Awareness', courseVersion: '1.0', upn: 'mchen@meridianhealth.example', userName: 'M. Chen', assigned: daysFrom(-150), due: daysFrom(-120), completed: daysFrom(-133), status: 'Completed', score: '5/5', attempts: 1, source: 'campaign', note: '' },
        { id: 'TRN-0004', campaign: 'TCAMP-0001', courseId: 'security-awareness', courseTitle: 'Security Awareness', courseVersion: '1.0', upn: 'demo@meridianhealth.example', userName: 'Demo user', assigned: daysFrom(-150), due: daysFrom(-120), completed: daysFrom(-150), status: 'Completed', score: '5/5', attempts: 1, source: 'campaign', note: '' },
        { id: 'TRN-0005', campaign: 'TCAMP-0002', courseId: 'ai-use-oversight', courseTitle: 'Using AI Safely and Responsibly', courseVersion: '1.0', upn: 'kpatel@meridianhealth.example', userName: 'K. Patel', assigned: daysFrom(-10), due: daysFrom(20), completed: daysFrom(-6), status: 'Completed', score: '4/5', attempts: 1, source: 'campaign', note: '' },
        { id: 'TRN-0006', campaign: 'TCAMP-0002', courseId: 'ai-use-oversight', courseTitle: 'Using AI Safely and Responsibly', courseVersion: '1.0', upn: 'sokafor@meridianhealth.example', userName: 'S. Okafor', assigned: daysFrom(-10), due: daysFrom(20), completed: '', status: 'Assigned', score: '', attempts: 0, source: 'campaign', note: '' },
        { id: 'TRN-0007', campaign: 'TCAMP-0002', courseId: 'ai-use-oversight', courseTitle: 'Using AI Safely and Responsibly', courseVersion: '1.0', upn: 'mchen@meridianhealth.example', userName: 'M. Chen', assigned: daysFrom(-10), due: daysFrom(20), completed: '', status: 'Assigned', score: '', attempts: 0, source: 'campaign', note: '' },
        { id: 'TRN-0008', campaign: 'TCAMP-0002', courseId: 'ai-use-oversight', courseTitle: 'Using AI Safely and Responsibly', courseVersion: '1.0', upn: 'demo@meridianhealth.example', userName: 'Demo user', assigned: daysFrom(-10), due: daysFrom(20), completed: '', status: 'Assigned', score: '', attempts: 0, source: 'campaign', note: '' }
      ],
      /* Two attestation campaigns: one closed out at 100% (what "good"
         looks like to an auditor) and one live and part-complete, so
         the chase list has something in it. The signed-in demo user's
         own outstanding row is deliberately included — otherwise the
         "My attestations" panel, the half an employee actually sees,
         would render empty in every demo. */
      attestations: [
        { id: 'ATT-0001', campaign: 'CAMP-0001', docName: 'Information Security Policy.html', docVersion: '2.1', docUrl: '', upn: 'sokafor@meridianhealth.example', userName: 'S. Okafor', assigned: daysFrom(-200), acknowledged: daysFrom(-199), status: 'Acknowledged', note: '' },
        { id: 'ATT-0002', campaign: 'CAMP-0001', docName: 'Information Security Policy.html', docVersion: '2.1', docUrl: '', upn: 'kpatel@meridianhealth.example', userName: 'K. Patel', assigned: daysFrom(-200), acknowledged: daysFrom(-197), status: 'Acknowledged', note: '' },
        { id: 'ATT-0003', campaign: 'CAMP-0001', docName: 'Information Security Policy.html', docVersion: '2.1', docUrl: '', upn: 'mchen@meridianhealth.example', userName: 'M. Chen', assigned: daysFrom(-200), acknowledged: daysFrom(-200), status: 'Acknowledged', note: '' },
        { id: 'ATT-0004', campaign: 'CAMP-0002', docName: 'Access Control Policy.html', docVersion: '1.3', docUrl: '', upn: 'sokafor@meridianhealth.example', userName: 'S. Okafor', assigned: daysFrom(-14), acknowledged: daysFrom(-13), status: 'Acknowledged', note: '' },
        { id: 'ATT-0005', campaign: 'CAMP-0002', docName: 'Access Control Policy.html', docVersion: '1.3', docUrl: '', upn: 'kpatel@meridianhealth.example', userName: 'K. Patel', assigned: daysFrom(-14), acknowledged: '', status: 'Assigned', note: '' },
        { id: 'ATT-0006', campaign: 'CAMP-0002', docName: 'Access Control Policy.html', docVersion: '1.3', docUrl: '', upn: 'mchen@meridianhealth.example', userName: 'M. Chen', assigned: daysFrom(-14), acknowledged: '', status: 'Assigned', note: '' },
        { id: 'ATT-0007', campaign: 'CAMP-0002', docName: 'Access Control Policy.html', docVersion: '1.3', docUrl: '', upn: 'demo@meridianhealth.example', userName: 'Demo user', assigned: daysFrom(-14), acknowledged: '', status: 'Assigned', note: '' }
      ],
      auditLog: [
        { actor: 'S. Okafor', actorId: 'demo-user', action: 'Control status changed', targetType: 'Control', targetId: 'A.5.15', before: 'In progress', after: 'Implemented', entryDateTime: new Date(Date.now() - 24 * 86400000).toISOString() },
        { actor: 'K. Patel', actorId: 'demo-user', action: 'Risk approved into register', targetType: 'Risk', targetId: 'R-002', before: '', after: 'In treatment', entryDateTime: new Date(Date.now() - 30 * 86400000).toISOString() }
      ],
      activity: [
        { t: daysFrom(-21), msg: 'Posture scan completed — score <b>48</b>. 2 findings mapped to existing risks.' },
        { t: daysFrom(-24), msg: '<b>A.5.15 Access control</b> marked Implemented. Evidence captured: CA policy export.' },
        { t: daysFrom(-30), msg: 'Risk <b>R-002</b> accepted into register from continuity workshop.' }
      ]
    };
  }

  function persist() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { } }

  /* Demo mode never runs mergeLicensedPacks() (there's no activation to
     verify), so window.FRAMEWORKS[fw].controls, window.GUIDANCE,
     window.NIST_SUBCATEGORIES and every window.CHECK_<FW> automation
     table stay the empty stubs they start as — even after a demo
     tenant's own S.controls gets its illustrative DEMO_FRAMEWORK_SEEDS
     rows. Several render/filter functions in app.js (e8LvlOfCode(),
     dispLvlOfCode(), renderEssential8Rows(), renderNistSubcategoryRows(),
     the SOC 2 category-pill filter, every runScan() suggestion block)
     correctly assume those shared tables are populated — true for a
     real tenant, false for demo — which is what made Essential Eight's
     and DISP/IRAP's SoA render as completely empty, NIST CSF's
     subcategory depth toggle add nothing, every premium framework's
     guidance drawer show blank, and scan-suggested SoA statuses appear
     for ISO 27001 only, never any premium module, in demo mode. Fixes
     all of it at the source: populates those same shared tables with
     the same small illustrative slices already used for S.controls,
     the moment a demo tenant loads. Guarded so it only ever fills an
     empty stub — never overwrites real merged pack content. */
  function populateDemoDefinitionalRegistries() {
    Object.keys(window.DEMO_FRAMEWORK_SEEDS || {}).forEach(function (fw) {
      if (window.FRAMEWORKS[fw] && !window.FRAMEWORKS[fw].controls.length) {
        window.FRAMEWORKS[fw].controls = window.DEMO_FRAMEWORK_SEEDS[fw];
      }
    });
    if (!window.NIST_SUBCATEGORIES.length) {
      window.NIST_SUBCATEGORIES.push.apply(window.NIST_SUBCATEGORIES, window.DEMO_NIST_SUBCATEGORIES || []);
    }
    var CHECK_TABLE_BY_FW = { essential8: window.CHECK_E8, is18: window.CHECK_IS18, rffr: window.CHECK_RFFR, iso42001: window.CHECK_ISO42001, iso27701: window.CHECK_ISO27701, soc2: window.CHECK_SOC2, nistcsf: window.CHECK_NISTCSF };
    Object.keys(window.DEMO_CHECK_SEEDS || {}).forEach(function (fw) {
      var table = CHECK_TABLE_BY_FW[fw];
      if (table && !Object.keys(table).length) Object.assign(table, window.DEMO_CHECK_SEEDS[fw]);
    });
    /* Placeholder guidance — deliberately NOT the real paid "how to
       implement" text (that stays licensed-pack-only, same as
       everywhere else in this app), but honest about what's missing and
       still shows the real "Latest scan signal" derived from
       DEMO_CHECK_SEEDS above, so the live automation is visible even
       where the full write-up isn't. */
    var allSeedRows = [].concat.apply([], Object.keys(window.DEMO_FRAMEWORK_SEEDS || {}).map(function (fw) { return window.DEMO_FRAMEWORK_SEEDS[fw].map(function (c) { return { fw: fw, code: c.code }; }); }));
    (window.DEMO_NIST_SUBCATEGORIES || []).forEach(function (s) { allSeedRows.push({ fw: 'nistcsf', code: s.code }); });
    allSeedRows.forEach(function (row) {
      if (window.GUIDANCE[row.code]) return;
      var checksForCode = [];
      var checkTable = window.DEMO_CHECK_SEEDS[row.fw];
      if (checkTable) {
        Object.keys(checkTable).forEach(function (checkId) {
          if (checkTable[checkId].indexOf(row.code) !== -1) checksForCode.push(checkId);
        });
      }
      window.GUIDANCE[row.code] = {
        how: 'Full step-by-step implementation guidance for every control ships with a licensed activation for this framework. This demo shows the Statement of Applicability structure, cross-framework mapping, and (where a live signal exists, below) posture-scan automation only.',
        evidence: 'Evidence guidance is part of the same licensed content — available the moment this framework is activated on a real tenant.',
        checks: checksForCode
      };
    });
  }

  return {
    kind: 'demo',
    load: async function () {
      try { var d = localStorage.getItem(KEY); S = d ? JSON.parse(d) : seed(); } catch (e) { S = seed(); }
      /* Backfill any collection the seed has gained since this browser
         last stored its demo state — a returning demo user shouldn't
         see an empty new view (and shouldn't have the rest of their
         poking-about wiped by a KEY bump just to get one added key).
         Only ever ADDS missing top-level keys; anything already stored
         is left exactly as the user left it. */
      var fresh = seed();
      Object.keys(fresh).forEach(function (k) { if (S[k] === undefined) S[k] = fresh[k]; });
      populateDemoDefinitionalRegistries();
      return S;
    },
    addRisk: async function (r) { S.risks.push(r); persist(); },
    updateRisk: async function () { persist(); },
    deleteRisk: async function (r) { S.risks = S.risks.filter(function (x) { return x !== r && x._sp !== r._sp && x.id !== r.id; }); persist(); },
    addAction: async function (a) { S.actions.push(a); persist(); },
    updateAction: async function () { persist(); },
    deleteAction: async function (a) { S.actions = S.actions.filter(function (x) { return x !== a && x._sp !== a._sp && x.id !== a.id; }); persist(); },
    /* Append-only — no update/delete counterpart, same immutability the
       audit log already relies on. */
    addActionUpdate: async function (u) { S.actionUpdates.push(u); persist(); },
    updateControl: async function () { persist(); },
    addScan: async function (sc) { S.scans.push(sc); persist(); },
    saveScanState: async function () { persist(); },
    acknowledgeAlert: async function (a) { a.ack = true; persist(); },
    addVendor: async function (v) { S.vendors.push(v); persist(); },
    updateVendor: async function () { persist(); },
    addAiSystem: async function (a) { S.aiSystems.push(a); persist(); },
    updateAiSystem: async function () { persist(); },
    /* Upsert by checkId — a check has at most one disposition, and
       re-dispositioning it is an edit of that row, never a second row.
       Two rows for one check would make checkResult()'s lookup
       order-dependent, which is exactly the kind of silent
       inconsistency a posture score must not have. */
    setCheckDisposition: async function (d) {
      S.checkDispositions = S.checkDispositions || [];
      var existing = S.checkDispositions.find(function (x) { return x.checkId === d.checkId; });
      if (existing) Object.assign(existing, d);
      else S.checkDispositions.push(d);
      persist();
    },
    clearCheckDisposition: async function (checkId) {
      S.checkDispositions = (S.checkDispositions || []).filter(function (x) { return x.checkId !== checkId; });
      persist();
    },
    /* app.js already unshifts to S.activity — the store only persists */
    logActivity: async function () { persist(); },
    setEntitlement: async function (fw, enabled) { S.entitlements[fw] = enabled; persist(); },
    setSetting: async function (key, value) { S.settings[key] = value; persist(); },
    listDocuments: async function () { return (S.documents || []).slice(); },
    uploadDocument: async function () { throw new Error("Demo mode has no real tenant to store files in — sign in to a real tenant to use Documents."); },
    /* Editing the register itself DOES work in demo mode — unlike
       uploading, it needs no file storage, and the register is one of
       the things a demo most needs to show working. */
    updateDocumentMeta: async function (itemId, meta) {
      var d = (S.documents || []).find(function (x) { return x.id === itemId; });
      if (!d) throw new Error('Document not found.');
      Object.keys(meta).forEach(function (k) { if (meta[k] !== undefined) d[k] = meta[k]; });
      persist();
    },
    /* Upsert by DocName — a policy has exactly one current edited
       version, and re-saving must replace it rather than accumulate
       revisions the renderer would then have to choose between. The
       audit log is where the history of who changed what lives. */
    savePolicyDraft: async function (draft) {
      var existing = (S.policyDrafts || []).find(function (d) { return d.docName === draft.docName; });
      var fields = {
        Title: draft.docName, DocName: draft.docName, TplId: draft.tplId || '',
        Content: JSON.stringify(draft.content), UpdatedBy: draft.updatedBy || '', UpdatedDate: draft.updatedDate || ''
      };
      if (existing) {
        await patchItem('PolicyDrafts', existing._sp, fields);
        Object.assign(existing, draft);
      } else {
        draft._sp = await addItem('PolicyDrafts', fields);
        S.policyDrafts.push(draft);
      }
    },
    savePolicyDraft: async function (draft) {
      S.policyDrafts = S.policyDrafts || [];
      var existing = S.policyDrafts.find(function (d) { return d.docName === draft.docName; });
      if (existing) Object.assign(existing, draft); else S.policyDrafts.push(draft);
      persist();
    },
    addTrainingAssignments: async function (rows, onProgress) {
      rows.forEach(function (t, i) { S.training.push(t); if (onProgress) onProgress(i + 1, rows.length); });
      persist();
    },
    updateTrainingRecord: async function () { persist(); },
    addAttestations: async function (rows, onProgress) {
      rows.forEach(function (a, i) { S.attestations.push(a); if (onProgress) onProgress(i + 1, rows.length); });
      persist();
    },
    updateAttestation: async function () { persist(); },
    addAudit: async function (a) { S.audits.push(a); persist(); },
    addIncident: async function (n) { S.incidents.push(n); persist(); },
    updateIncident: async function () { persist(); },
    updateAudit: async function () { persist(); },
    addReview: async function (r) { S.reviews.push(r); persist(); },
    addCalendarItem: async function (c) { S.calendar.push(c); persist(); },
    updateCalendarItem: async function () { persist(); },
    appendAudit: async function (entry) {
      try {
        var prev = (S.auditLog && S.auditLog[0] && S.auditLog[0].entryHash) || '';
        entry.prevHash = prev;
        entry.entryHash = await window.CheckpointLib.auditEntryHash(crypto.subtle, entry, prev);
      } catch (e) { entry.prevHash = ''; entry.entryHash = ''; }
      S.auditLog.unshift(entry); persist();
    },
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
      { name: 'Treatment', text: {} }, { name: 'ActionRefs', text: {} }, { name: 'TplId', text: {} },
      /* Residual-risk acceptance sign-off (ISO 27001 6.1.3 / 8.3) — who
         formally accepted the residual risk, when, and any note. Set from
         the risk drawer's "Accept residual" action; blank until then.
         New columns → added to already-provisioned tenants' Risks list by
         reconcileColumns() below, same self-heal idea as the SettingValue
         widening, so no re-provisioning is needed. */
      { name: 'AcceptedBy', text: {} }, { name: 'AcceptedDate', text: {} }, { name: 'AcceptanceNote', text: { allowMultipleLines: true } },
      /* The residual score (L*I) at the MOMENT acceptance was recorded —
         compared against the CURRENT residual score by
         CheckpointLib.residualAcceptanceStale() every time the
         acceptance is displayed, so an acceptance that no longer
         matches today's residual (the risk was re-scored, or a
         previously-Done treatment action was reopened) is shown as
         stale rather than presented as if it still covers the current
         number. Nullable: risks accepted before this field existed have
         no snapshot and read as not-stale, never as always-stale. */
      { name: 'AcceptedScore', number: {} },
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
      /* Corrective-action (CAPA) fields, ISO 27001 Clause 10.1 — only
         populated for Non-conformity finding types (see capaStatus() in
         lib.js). Added to existing tenants' Actions list by
         reconcileColumns() below, so no re-provisioning is needed. */
      { name: 'Correction', text: { allowMultipleLines: true } }, { name: 'RootCause', text: { allowMultipleLines: true } },
      { name: 'EffectivenessReview', text: { allowMultipleLines: true } }, { name: 'EffectivenessDate', text: {} }, { name: 'EffectivenessBy', text: {} },
      { name: 'AiAssisted', boolean: {} }, { name: 'AiReviewer', text: {} },
      /* Optional address for the person named in Owner, so the scheduled
         monitor can chase them directly instead of only telling the ISMS
         manager. Deliberately separate from Owner rather than replacing
         it: an owner is often a team or an external party with no mailbox
         in this tenant, and a free-text owner has to keep working. */
      { name: 'OwnerEmail', text: {} }
    ],
    /* Chronological, append-only progress log — one row per dated update
       against an action, each with its own note, its own optional
       evidence link, and the action's status as of that entry. This is
       the "show an auditor progress" register: the Actions list itself
       only ever holds the CURRENT status and the LATEST evidence link —
       a single-slot field that a second update silently overwrites, no
       different from any other "last write wins" column. An auditor
       asking "walk me through how this got remediated" needs the story,
       not just the ending.

       Deliberately its own list rather than a JSON blob on the action
       (the pattern used for a scan's Detail or a review's Inputs) —
       every other genuinely GROWING, append-over-time history in this
       app (AuditLog, Training, Attestations) already gets its own list;
       the JSON-blob pattern here is only ever used for a single owner's
       structured content replaced wholesale on edit, never an
       indefinitely-growing log several different people add to over an
       action's lifetime. Rows are never edited or deleted once written
       — same immutability the audit log already relies on for its own
       credibility; a correction is a new row, not a rewritten one. */
    ActionUpdates: [
      { name: 'RefId', text: {} }, { name: 'ActionRef', text: {} }, { name: 'UpdateDate', text: {} },
      { name: 'Note', text: { allowMultipleLines: true } }, { name: 'EvidenceUrl', text: {} },
      { name: 'Status', text: {} }, { name: 'Author', text: {} }
    ],
    Controls: [
      { name: 'Code', text: {} }, { name: 'Framework', text: {} }, { name: 'Applicable', boolean: {} }, { name: 'Status', text: {} },
      { name: 'Owner', text: {} }, { name: 'MapsTo', text: {} }, { name: 'Justification', text: { allowMultipleLines: true } },
      { name: 'LastVerified', text: {} }, { name: 'EvidenceUrl', text: {} }, { name: 'VerifiedBy', text: {} }
    ],
    Scans: [
      { name: 'ScanDate', text: {} }, { name: 'Score', number: {} }, { name: 'Detail', text: { allowMultipleLines: true } }
    ],
    /* Per-check disposition — how THIS tenant satisfies a posture check
       that Checkpoint cannot verify for itself.

       Checkpoint scores the Microsoft stack. A tenant meeting the same
       control with something else (CrowdStrike rather than Defender,
       OneTrust rather than Priva) would otherwise fail that check
       forever, with no way to say so — the score would punish them for
       a control they actually hold, and the risk proposal would come
       back on every single scan. This list is how they say so.

       A check with no row here is 'microsoft': scanned normally, scored
       normally. That's the default and the overwhelming majority.

       Deliberately NOT merged into the Settings key/value list: these
       rows carry an owner, a justification and a review date, they are
       read per-check on every score computation, and an auditor will
       want to enumerate them as a set. That's a register, not a
       setting. Same reasoning that gave Vendors and AISystems their own
       lists rather than a JSON blob.

       ReviewDue is what stops this becoming a blindfold. An override
       with no expiry is a permanent hole in the posture score that
       nobody revisits — see lib.js's checkResult(), which lapses the
       override once ReviewDue passes and lets the real scan result
       through again. */
    CheckDispositions: [
      { name: 'CheckId', text: {} }, { name: 'Disposition', text: {} }, { name: 'AlternativeTool', text: {} },
      { name: 'Justification', text: { allowMultipleLines: true } }, { name: 'EvidenceUrl', text: {} },
      { name: 'Owner', text: {} }, { name: 'LastVerified', text: {} }, { name: 'ReviewDue', text: {} }
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
    /* Incident register — ISO 27001 A.5.24-A.5.28 (planning & preparation,
       assessment, response, learning, evidence). Deliberately not
       limited to security incidents Microsoft Defender already detects
       — the register exists precisely for what Defender cannot see: a
       misdirected email, a lost laptop, a supplier's own breach
       notification, a physical break-in. A Defender-detected incident
       can be logged here too (DiscoveredVia records that), so this is
       the one place an auditor is shown everything, not a duplicate of
       Defender's own console.

       The notifiable-breach fields exist because a security incident
       and a reportable privacy breach are frequently the same event
       assessed two different ways — IsPrivacyBreach/AssessmentDueDate/
       NotifiedRegulator/NotifiedIndividuals let one incident carry both
       assessments rather than forcing a second record. AssessmentDueDate
       is computed client-side as DetectedDate + 30 days, mirroring the
       Privacy Act 1988's assessment clock covered in the privacy
       training course — not a legal deadline for every jurisdiction,
       but a sane default that is always visible and never silently
       missed. */
    Incidents: [
      { name: 'RefId', text: {} }, { name: 'Title', text: {} },
      { name: 'Category', text: {} }, { name: 'Severity', text: {} },
      { name: 'DetectedDate', text: {} }, { name: 'OccurredDate', text: {} },
      { name: 'ReportedBy', text: {} }, { name: 'DiscoveredVia', text: {} },
      { name: 'Description', text: { allowMultipleLines: true } },
      { name: 'AffectedSystems', text: { allowMultipleLines: true } },
      { name: 'Status', text: {} },
      { name: 'ContainmentActions', text: { allowMultipleLines: true } },
      { name: 'RootCause', text: { allowMultipleLines: true } },
      { name: 'LessonsLearned', text: { allowMultipleLines: true } },
      { name: 'ActionRefs', text: {} }, { name: 'EvidenceUrl', text: {} },
      { name: 'IsPrivacyBreach', boolean: {} },
      { name: 'AssessmentDueDate', text: {} }, { name: 'AssessmentNote', text: { allowMultipleLines: true } },
      { name: 'AssessmentComplete', boolean: {} },
      { name: 'NotifiedRegulator', boolean: {} }, { name: 'NotifiedRegulatorDate', text: {} },
      { name: 'NotifiedIndividuals', boolean: {} }, { name: 'NotifiedIndividualsDate', text: {} },
      { name: 'ClosedDate', text: {} }
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
      { name: 'EntryDateTime', text: {} },
      /* Integrity chain (CheckpointLib.auditEntryHash) -- each entry
         carries the hash of the one before it, so an entry edited or
         removed after the fact breaks every hash that follows. Entries
         written before this existed simply have neither field and are
         reported as "unchained", never as altered. */
      { name: 'EntryHash', text: {} }, { name: 'PrevHash', text: {} }
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
      { name: 'DataCategories', text: {} }, { name: 'CertExpiryDate', text: {} }
    ],
    /* AI Governance (ISO 42001) — only shown/populated while iso42001 is
       entitled (app.js gates the nav item, the register view, and the
       scan-time discovery step on that same flag). SpId links a row
       back to the Entra service principal automated discovery found it
       from; empty for a manually-added system. */
    /* Per-employee policy attestation (A.5.1 "policies … communicated to
       and acknowledged by relevant personnel", A.6.3, and SOC 2 CC1.4 /
       CC2.2). One row per person per campaign — an auditor samples
       individuals, not aggregates, so the evidence has to be
       row-per-person with a real date against a real UPN.

       DocVersion is denormalised onto the row deliberately: an
       acknowledgement is of a SPECIFIC version of a document. Reissue
       the policy at v2.0 and the v1.3 acknowledgements stay true
       statements about v1.3 rather than silently re-pointing at text
       nobody agreed to.

       Written by ordinary employees, not just practitioners (see
       App.acknowledgeAttestation) — the one list in this schema that
       needs Contribute for the wider staff population. SETUP.md's
       attestation section covers the permission grant. */
    Attestations: [
      { name: 'RefId', text: {} }, { name: 'Campaign', text: {} },
      { name: 'DocName', text: {} }, { name: 'DocVersion', text: {} }, { name: 'DocUrl', text: {} },
      { name: 'UserUpn', text: {} }, { name: 'UserName', text: {} },
      { name: 'AssignedDate', text: {} }, { name: 'AcknowledgedDate', text: {} },
      { name: 'Status', text: {} }, { name: 'Note', text: { allowMultipleLines: true } }
    ],
    /* Awareness & competence training completion (A.6.3, ISO 27001
       Clause 7.2/7.3, SOC 2 CC1.4, NIST PR.AT — and ISO 42001's own
       7.2/7.3 for the AI course).

       Kept separate from Attestations rather than folded into it with a
       "kind" column, because the evidence genuinely differs: an
       attestation says a named person agreed to a named version of a
       document, and a training record says a named person demonstrated
       comprehension, with a score and an attempt count. Overloading one
       list's DocName/DocVersion to mean "course" would make both harder
       to read in SharePoint and at audit. The two share their CODE —
       audience resolution, campaign roll-up, reminders — not their
       schema.

       Score/Attempts are stored because a course everybody passes
       first time and a course everybody needs four attempts at are
       telling you different things about the course, and that is worth
       knowing before an auditor asks why comprehension is low.

       Written by ordinary employees, same as Attestations — see
       SETUP.md §5b for the permission grant. */
    Training: [
      { name: 'RefId', text: {} }, { name: 'Campaign', text: {} },
      { name: 'CourseId', text: {} }, { name: 'CourseTitle', text: {} }, { name: 'CourseVersion', text: {} },
      { name: 'UserUpn', text: {} }, { name: 'UserName', text: {} },
      { name: 'AssignedDate', text: {} }, { name: 'DueDate', text: {} }, { name: 'CompletedDate', text: {} },
      { name: 'Status', text: {} }, { name: 'Score', text: {} }, { name: 'Attempts', number: {} },
      { name: 'Source', text: {} }, { name: 'Note', text: { allowMultipleLines: true } }
    ],
    /* Edited policy content — the source of truth for a generated
       document's words, once anyone has changed them.

       A generated policy is a RENDERING of structured content, so the
       editable thing is the content, not the HTML file. Keeping the
       edits here means the document can be regenerated at any time —
       on approval, after a version bump, after a branding change, or
       after the shipped template itself improves — without losing what
       the practitioner wrote. Editing the HTML in SharePoint instead
       would be destroyed by the very next regeneration, which is
       exactly the defect this list closes.

       Content is one JSON blob rather than a column per field because
       the shape is nested (statements carry a rule and a reason, roles
       carry a role and a responsibility) and because the template
       schema will keep growing — a column per field would need a
       schema migration every time it did.

       Keyed by DocName, the filename, which is already the identity
       every other part of this app uses for a generated document. */
    PolicyDrafts: [
      { name: 'DocName', text: {} }, { name: 'TplId', text: {} },
      { name: 'Content', text: { allowMultipleLines: true } },
      { name: 'UpdatedBy', text: {} }, { name: 'UpdatedDate', text: {} }
    ],
    AISystems: [
      { name: 'RefId', text: {} }, { name: 'Purpose', text: { allowMultipleLines: true } },
      { name: 'Owner', text: {} }, { name: 'DataSources', text: { allowMultipleLines: true } },
      { name: 'ModelType', text: {} }, { name: 'Vendor', text: {} }, { name: 'RiskTier', text: {} },
      { name: 'ImpactAssessmentStatus', text: {} }, { name: 'HumanOversight', text: { allowMultipleLines: true } },
      { name: 'LastReviewed', text: {} }, { name: 'SpId', text: {} },
      // JSON-serialised { [questionId]: bool } from the EU AI Act
      // questionnaire — same "one text column, JSON blob" shape as
      // PolicyDrafts' Content column, for the same reason: the question
      // set can grow (the Act itself is still being amended) without a
      // schema migration every time it does.
      { name: 'AiActAnswers', text: { allowMultipleLines: true } }
    ]
  };

  /* A second, internal-only console's own data used to be provisioned
     and read from here too — moved entirely to a separate directory's
     own bundle (a distinct entry point, loaded by nothing under this
     directory) so this client-facing bundle ships none of that code.
     That bundle talks to Graph directly (window.Graph.g()/gAll(), the
     same primitives this file itself is built on) rather than sharing
     this closure's private state. */

  function listName(k) { return CONFIG.listPrefix + ' ' + k; }

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
     that happens at all; ensureLists() never even looks at the flag.
     app.js's resolveBestActivation() treats this raw text as only ONE
     of two independent candidates (the other being this browser's own
     localStorage) — if this returns { raw: null } (Settings list
     missing, unreadable, or never written), a verified local copy is
     still enough on its own to authorise provisioning below; neither
     store depends on the other existing first. */
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

    /* self-heal: a tenant provisioned before a COLUMN was added to a
       list's schema (e.g. the Risks acceptance sign-off fields) has that
       column missing — patching it would fail with a generic "Invalid
       request", same class of problem as the SettingValue widening.
       Add whatever's missing rather than requiring re-provisioning. */
    await reconcileColumns(onStatus);

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

    /* Document-control columns (Clause 7.5.2/7.5.3). Deliberately not
       allowed to fail the load: a tenant whose library predates these
       columns, or whose admin has locked the library's schema, still
       gets a fully working Documents view — just without the register
       fields, which listDocuments() below degrades to blank rather
       than erroring on. */
    try { await ensureDocColumns(onStatus); } catch (e) { /* best-effort — see note above */ }
  }

  /* Same self-heal idea as reconcileColumns(), but for the document
     library, which isn't in DEFS (it's created as a documentLibrary
     template, not a genericList) and so isn't covered by that loop. */
  async function ensureDocColumns(onStatus) {
    if (!docLibraryId) return;
    var cols;
    try { cols = await Graph.gAll('/sites/' + siteId + '/lists/' + docLibraryId + '/columns?$select=name', provisionOpts); }
    catch (e) { return; /* can't read the schema — leave it; reads degrade to blank metadata */ }
    var have = {};
    cols.forEach(function (c) { have[c.name] = true; });
    var missing = window.DOC_META_COLUMNS.filter(function (d) { return !have[d.name]; });
    if (!missing.length) return;
    assertActivationAuthorizesProvisioning(listName('Documents'));
    for (var i = 0; i < missing.length; i++) {
      if (onStatus) onStatus('Adding “' + missing[i].name + '” to ' + listName('Documents') + '…');
      try {
        await Graph.g('/sites/' + siteId + '/lists/' + docLibraryId + '/columns', { method: 'POST', body: missing[i], scopes: CONFIG.scopesProvision });
      } catch (e) { /* best-effort — a genuine failure surfaces when a write to that field later fails */ }
    }
  }

  /* camelCase register fields (what app.js and the rest of this file
     speak) → the Doc*-prefixed SharePoint column names. Only keys
     actually present on `meta` are sent, so a partial update — say,
     approving a document — patches exactly those fields and leaves the
     rest of the row alone rather than blanking them. */
  var DOC_FIELD_MAP = {
    owner: 'DocOwner', version: 'DocVersion', status: 'DocStatus',
    approvedBy: 'DocApprovedBy', approvalDate: 'DocApprovalDate',
    nextReview: 'DocNextReview', classification: 'DocClassification',
    frameworks: 'DocFrameworks', tplId: 'DocTplId'
  };
  function docFieldsFrom(meta) {
    var out = {};
    for (var k in DOC_FIELD_MAP) {
      if (meta[k] !== undefined) out[DOC_FIELD_MAP[k]] = meta[k] == null ? '' : String(meta[k]);
    }
    return out;
  }
  function docMetaFrom(fields) {
    var out = {};
    for (var k in DOC_FIELD_MAP) out[k] = (fields && fields[DOC_FIELD_MAP[k]]) || '';
    return out;
  }

  /* Lists whose schema has grown columns since early tenants were
     provisioned. Each column named here is added to an existing list if
     it's missing — see reconcileColumns() below. Add a list/column here
     whenever a new column is introduced to DEFS, so already-provisioned
     tenants pick it up without re-provisioning. */
  var COLUMN_RECONCILE = {
    Risks: ['AcceptedBy', 'AcceptedDate', 'AcceptanceNote', 'AcceptedScore'],
    Actions: ['Correction', 'RootCause', 'EffectivenessReview', 'EffectivenessDate', 'EffectivenessBy', 'OwnerEmail'],
    /* LastVerified/EvidenceUrl/VerifiedBy are in Controls' DEFS (below)
       but were never added here — a tenant provisioned before all three
       existed has a Controls list missing whichever one(s) came later,
       so every updateControl() patch that touches them throws "Field
       '<name>' is not recognized" instead of saving. Confirmed live: a
       user's real tenant hit exactly this on LastVerified. */
    Controls: ['LastVerified', 'EvidenceUrl', 'VerifiedBy'],
    /* Same bug, caught before it shipped rather than live: AiActAnswers
       was added to AISystems' DEFS for the EU AI Act classifier without
       remembering this table too. Any tenant with an AI Systems
       register already provisioned before that feature landed would
       hit the identical "Field 'AiActAnswers' is not recognized" error
       the next time they saved an AI system. */
    AISystems: ['AiActAnswers'],
    AuditLog: ['EntryHash', 'PrevHash'],
    /* CertExpiryDate added for the Azure Function's vendor cert/report
       expiry sweep — a tenant provisioned before it existed has a
       Vendors list missing it, same "Field not recognized" failure
       class as the others in this map. */
    Vendors: ['CertExpiryDate']
  };
  async function reconcileColumns(onStatus) {
    for (var k in COLUMN_RECONCILE) {
      if (!lists[k]) continue;
      var want = COLUMN_RECONCILE[k];
      var cols;
      try { cols = await Graph.gAll('/sites/' + siteId + '/lists/' + lists[k] + '/columns?$select=name', provisionOpts); }
      catch (e) { continue; /* can't read columns — leave it; a later write to a missing field surfaces the real error */ }
      var have = {};
      cols.forEach(function (c) { have[c.name] = true; });
      var missing = want.filter(function (n) { return !have[n]; });
      if (!missing.length) continue;
      /* Deliberately NOT gated on assertActivationAuthorizesProvisioning()
         — that check exists for actual list CREATION (a not-yet-confirmed-
         real tenant getting a brand-new list), and widening a column
         doesn't carry that risk: `lists[k]` is only ever populated a few
         lines above by ensureLists() finding this EXACT list already
         exists in the tenant, in THIS SAME session. Gating here directly
         contradicted this function's own header comment ("Deliberately
         does NOT gate reading/self-healing lists that already exist") —
         a tenant whose activation happened not to be re-verified yet at
         the moment reconcileColumns() ran would throw here, abort the
         whole loop (every other list's missing columns too, not just
         this one), and never self-heal AT ALL, on any future load either,
         if that tenant's activation-verification path was ever
         consistently slow/failing — reproducing the exact "Field
         '<name>' is not recognized" error indefinitely despite the
         column now being listed in COLUMN_RECONCILE. */
      for (var i = 0; i < missing.length; i++) {
        var def = DEFS[k].find(function (d) { return d.name === missing[i]; });
        if (!def) continue;
        if (onStatus) onStatus('Adding “' + missing[i] + '” to ' + listName(k) + '…');
        try {
          await Graph.g('/sites/' + siteId + '/lists/' + lists[k] + '/columns', { method: 'POST', body: def, scopes: CONFIG.scopesProvision });
        } catch (e) { /* best-effort — a genuine failure surfaces when a write to that field later fails */ }
      }
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

  /* Shared by addIncident/updateIncident — the incident record has
     twenty-odd fields spanning the base report, containment/CAPA and
     the privacy-breach assessment, and duplicating that mapping across
     an add and an update function (the pattern every other list in
     this file uses) is exactly where the two would eventually drift.
     One function, both callers. */
  function incidentFields(n) {
    return {
      Title: n.id, RefId: n.id, Category: n.category || 'Other', Severity: n.severity || 'Medium',
      DetectedDate: n.detected || '', OccurredDate: n.occurred || '', ReportedBy: n.reportedBy || '', DiscoveredVia: n.discoveredVia || '',
      Description: n.description || '', AffectedSystems: n.affectedSystems || '', Status: n.status || 'Open',
      ContainmentActions: n.containmentActions || '', RootCause: n.rootCause || '', LessonsLearned: n.lessonsLearned || '',
      ActionRefs: csv(n.actionRefs), EvidenceUrl: n.evidenceUrl || '',
      IsPrivacyBreach: !!n.isPrivacyBreach, AssessmentDueDate: n.assessmentDueDate || '', AssessmentNote: n.assessmentNote || '',
      AssessmentComplete: !!n.assessmentComplete,
      NotifiedRegulator: !!n.notifiedRegulator, NotifiedRegulatorDate: n.notifiedRegulatorDate || '',
      NotifiedIndividuals: !!n.notifiedIndividuals, NotifiedIndividualsDate: n.notifiedIndividualsDate || '',
      ClosedDate: n.closedDate || ''
    };
  }

  /* Self-heals a text column a tenant provisioned before this list's
     schema moved to allowMultipleLines (see the Settings list's own
     comment above) — SharePoint's default single-line text caps at 255
     characters, too small for entitlementFile's signed JSON (now with
     every entitled module's key embedded) or a clientLogoUrl data: URI.
     Returns false (nothing to heal) if the column is already wide or
     wasn't found — the caller then re-throws the original error rather
     than retrying pointlessly.

     Confirmed against a real tenant: Graph's columns PATCH endpoint
     does not reliably support changing an existing text column's
     allowMultipleLines in place — it 400s. The only Graph-supported way
     to widen it is delete + recreate, which drops every row's existing
     value for this column, not just the row currently being written
     (this is a shared list-wide column, and other Settings rows may
     already have real values in it). So: read every row's current
     value first, delete + recreate the column, then write each value
     back. Bounded and cheap — a Settings list is a small key/value
     store, never a large register. */
  async function widenTextColumnIfNarrow(listKey, columnName) {
    var listId = lists[listKey];
    var cols = await Graph.gAll('/sites/' + siteId + '/lists/' + listId + '/columns?$select=id,name,text', { scopes: CONFIG.scopesProvision });
    var col = cols.find(function (c) { return c.name === columnName; });
    if (!col || (col.text && col.text.allowMultipleLines)) return false;
    var rows = await Graph.gAll('/sites/' + siteId + '/lists/' + listId + '/items?$expand=fields&$top=200', { scopes: CONFIG.scopesProvision });
    var preserved = rows
      .map(function (r) { return { id: r.id, value: r.fields[columnName] }; })
      .filter(function (p) { return p.value !== undefined && p.value !== null && p.value !== ''; });
    await Graph.g('/sites/' + siteId + '/lists/' + listId + '/columns/' + col.id, { method: 'DELETE', scopes: CONFIG.scopesProvision });
    await Graph.g('/sites/' + siteId + '/lists/' + listId + '/columns', {
      method: 'POST', body: { name: columnName, text: { allowMultipleLines: true } }, scopes: CONFIG.scopesProvision
    });
    for (var i = 0; i < preserved.length; i++) {
      var restoreBody = {}; restoreBody[columnName] = preserved[i].value;
      try {
        await Graph.g('/sites/' + siteId + '/lists/' + listId + '/items/' + preserved[i].id + '/fields', { method: 'PATCH', body: restoreBody, scopes: CONFIG.scopesProvision });
      } catch (e) { /* best-effort restore — one stale row isn't worth failing the whole heal for */ }
    }
    return true;
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
      var actUpdItems = await items('ActionUpdates');
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
      var attItems = await items('Attestations');
      var trnItems = await items('Training');
      var draftItems = await items('PolicyDrafts');
      var incItems = await items('Incidents');
      var dispItems = await items('CheckDispositions');

      S = {
        mode: 'live',
        client: '',
        risks: riskItems.map(function (i) {
          var f = i.fields;
          return { _sp: i.id, id: f.RefId, title: f.Title, cat: f.Category || '', src: f.Source || '', L: f.Likelihood || 1, I: f.Impact || 1, controls: uncsv(f.Controls), owner: f.Owner || '', status: f.Status || 'Open', treat: f.Treatment || 'Mitigate', actions: uncsv(f.ActionRefs), tpl: f.TplId || undefined, aiAssisted: !!f.AiAssisted, aiReviewer: f.AiReviewer || '', acceptedBy: f.AcceptedBy || '', acceptedDate: f.AcceptedDate || '', acceptanceNote: f.AcceptanceNote || '', acceptedScore: (typeof f.AcceptedScore === 'number' ? f.AcceptedScore : null) };
        }),
        actions: actItems.map(function (i) {
          var f = i.fields;
          return { _sp: i.id, id: f.RefId, title: f.Title, risk: f.RiskRef || '', control: f.Control || '', pr: f.Priority || 'Medium', owner: f.Owner || '', due: f.DueDate || '', status: f.Status || 'Open', evidence: f.Evidence || '', src: f.Source || '', evidenceUrl: f.EvidenceUrl || '', type: f.FindingType || 'Action', correction: f.Correction || '', rootCause: f.RootCause || '', effectivenessReview: f.EffectivenessReview || '', effectivenessDate: f.EffectivenessDate || '', effectivenessBy: f.EffectivenessBy || '', aiAssisted: !!f.AiAssisted, aiReviewer: f.AiReviewer || '', ownerEmail: f.OwnerEmail || '' };
        }),
        /* Sorted oldest-first here, same as every other dated register
           this store loads (Calendar, Reviews) — callers building a
           newest-first timeline (the action drawer) reverse it there,
           so the canonical order in S stays consistent no matter which
           view reads it. */
        actionUpdates: actUpdItems.map(function (i) {
          var f = i.fields;
          return { _sp: i.id, id: f.RefId, action: f.ActionRef || '', date: f.UpdateDate || '', note: f.Note || '', evidenceUrl: f.EvidenceUrl || '', status: f.Status || '', author: f.Author || '' };
        }).sort(function (a, b) { return (a.date || '').localeCompare(b.date || ''); }),
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
        incidents: incItems.map(function (i) {
          var f = i.fields;
          return {
            _sp: i.id, id: f.RefId, title: f.Title, category: f.Category || 'Other', severity: f.Severity || 'Medium',
            detected: f.DetectedDate || '', occurred: f.OccurredDate || '', reportedBy: f.ReportedBy || '', discoveredVia: f.DiscoveredVia || '',
            description: f.Description || '', affectedSystems: f.AffectedSystems || '', status: f.Status || 'Open',
            containmentActions: f.ContainmentActions || '', rootCause: f.RootCause || '', lessonsLearned: f.LessonsLearned || '',
            actionRefs: uncsv(f.ActionRefs), evidenceUrl: f.EvidenceUrl || '',
            isPrivacyBreach: !!f.IsPrivacyBreach, assessmentDueDate: f.AssessmentDueDate || '', assessmentNote: f.AssessmentNote || '',
            assessmentComplete: !!f.AssessmentComplete,
            notifiedRegulator: !!f.NotifiedRegulator, notifiedRegulatorDate: f.NotifiedRegulatorDate || '',
            notifiedIndividuals: !!f.NotifiedIndividuals, notifiedIndividualsDate: f.NotifiedIndividualsDate || '',
            closedDate: f.ClosedDate || ''
          };
        }).sort(function (a, b) { return (b.detected || '').localeCompare(a.detected || ''); }),
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
          return { _sp: i.id, actor: f.Actor || '', actorId: f.ActorId || '', action: f.Action || '', targetType: f.TargetType || '', targetId: f.TargetId || '', before: f.Before || '', after: f.After || '', entryDateTime: f.EntryDateTime || (i.createdDateTime || ''), entryHash: f.EntryHash || '', prevHash: f.PrevHash || '' };
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
            calRef: f.CalRef || '', publicListed: !!f.PublicListed, dataCategories: uncsv(f.DataCategories),
            certExpiryDate: f.CertExpiryDate || ''
          };
        }).sort(function (a, b) { return (a.id || '').localeCompare(b.id || ''); }),
        aiSystems: aiItems.map(function (i) {
          var f = i.fields;
          var aiActAnswers;
          try { aiActAnswers = JSON.parse(f.AiActAnswers || '{}'); } catch (e) { aiActAnswers = {}; }
          return {
            _sp: i.id, id: f.RefId, name: f.Title, purpose: f.Purpose || '', owner: f.Owner || '',
            dataSources: f.DataSources || '', modelType: f.ModelType || '', vendor: f.Vendor || '',
            riskTier: f.RiskTier || 'Minimal', impactAssessmentStatus: f.ImpactAssessmentStatus || 'Not started',
            humanOversight: f.HumanOversight || '', lastReviewed: f.LastReviewed || '', spId: f.SpId || '',
            aiActAnswers: aiActAnswers
          };
        }).sort(function (a, b) { return (a.id || '').localeCompare(b.id || ''); }),
        checkDispositions: dispItems.map(function (i) {
          var f = i.fields;
          return {
            _sp: i.id, checkId: f.CheckId || '', disposition: f.Disposition || '', tool: f.AlternativeTool || '',
            justification: f.Justification || '', evidenceUrl: f.EvidenceUrl || '', owner: f.Owner || '',
            lastVerified: f.LastVerified || '', reviewDue: f.ReviewDue || ''
          };
        }),
        policyDrafts: draftItems.map(function (i) {
          var f = i.fields;
          var content = null;
          try { content = JSON.parse(f.Content || 'null'); } catch (e) { content = null; }
          return { _sp: i.id, docName: f.DocName || '', tplId: f.TplId || '', content: content, updatedBy: f.UpdatedBy || '', updatedDate: f.UpdatedDate || '' };
        }).filter(function (d) { return d.docName && d.content; }),
        training: trnItems.map(function (i) {
          var f = i.fields;
          return {
            _sp: i.id, id: f.RefId, campaign: f.Campaign || '', courseId: f.CourseId || '',
            courseTitle: f.CourseTitle || '', courseVersion: f.CourseVersion || '',
            upn: f.UserUpn || '', userName: f.UserName || '',
            assigned: f.AssignedDate || '', due: f.DueDate || '', completed: f.CompletedDate || '',
            status: f.Status || 'Assigned', score: f.Score || '', attempts: f.Attempts || 0,
            source: f.Source || 'campaign', note: f.Note || ''
          };
        }),
        attestations: attItems.map(function (i) {
          var f = i.fields;
          return {
            _sp: i.id, id: f.RefId, campaign: f.Campaign || '', docName: f.DocName || '',
            docVersion: f.DocVersion || '', docUrl: f.DocUrl || '',
            upn: f.UserUpn || '', userName: f.UserName || '',
            assigned: f.AssignedDate || '', acknowledged: f.AcknowledgedDate || '',
            status: f.Status || 'Assigned', note: f.Note || ''
          };
        }),
        lastResults: null, lastNotes: {},
        /* every suggestion list runScan() can populate — see the demo
           seed's own comment above for why all of them are seeded */
        proposed: [], e8Proposed: [], is18Proposed: [], rffrProposed: [],
        iso42001Proposed: [], iso27701Proposed: [], soc2Proposed: [],
        nistcsfProposed: [], iso27001Proposed: [],
        handledTpl: [], aiCandidates: []
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
    /* Patches every field the risk drawer's edit/accept/close actions can
       change — Title/Category/Source/Controls added here (previously only
       Status/L/I/ActionRefs/Owner/Treatment were persisted), plus the
       acceptance sign-off fields. */
    updateRisk: async function (r) {
      await patchItem('Risks', r._sp, {
        Title: r.title, Category: r.cat, Source: r.src, Status: r.status, Likelihood: r.L, Impact: r.I,
        Controls: csv(r.controls), ActionRefs: csv(r.actions), Owner: r.owner, Treatment: r.treat,
        AcceptedBy: r.acceptedBy || '', AcceptedDate: r.acceptedDate || '', AcceptanceNote: r.acceptanceNote || '',
        AcceptedScore: (typeof r.acceptedScore === 'number' ? r.acceptedScore : null),
        AiAssisted: !!r.aiAssisted, AiReviewer: r.aiReviewer || ''
      });
    },
    deleteRisk: async function (r) {
      await Graph.g('/sites/' + siteId + '/lists/' + lists.Risks + '/items/' + r._sp, { method: 'DELETE', scopes: CONFIG.scopesProvision });
    },
    addAction: async function (a) {
      a._sp = await addItem('Actions', {
        Title: a.title, RefId: a.id, RiskRef: a.risk, Control: a.control, Priority: a.pr,
        Owner: a.owner, DueDate: a.due, Status: a.status, Evidence: a.evidence || '', Source: a.src,
        FindingType: a.type || 'Action',
        Correction: a.correction || '', RootCause: a.rootCause || '', EffectivenessReview: a.effectivenessReview || '', EffectivenessDate: a.effectivenessDate || '', EffectivenessBy: a.effectivenessBy || '',
        AiAssisted: !!a.aiAssisted, AiReviewer: a.aiReviewer || '', OwnerEmail: a.ownerEmail || ''
      });
      S.actions.push(a);
    },
    /* Title/RiskRef/Control/Priority/Source added here — previously an
       action's risk link, control, priority and title could not be
       changed after creation (only status/evidence/owner/due/type).
       CAPA fields (Correction/RootCause/Effectiveness*) persisted for
       nonconformities — see capaStatus() in lib.js. */
    updateAction: async function (a) {
      await patchItem('Actions', a._sp, {
        Title: a.title, RiskRef: a.risk || '', Control: a.control || '', Priority: a.pr,
        Status: a.status, Evidence: a.evidence || '', Owner: a.owner, DueDate: a.due, Source: a.src || '',
        EvidenceUrl: a.evidenceUrl || '', FindingType: a.type || 'Action',
        Correction: a.correction || '', RootCause: a.rootCause || '', EffectivenessReview: a.effectivenessReview || '', EffectivenessDate: a.effectivenessDate || '', EffectivenessBy: a.effectivenessBy || '',
        AiAssisted: !!a.aiAssisted, AiReviewer: a.aiReviewer || '', OwnerEmail: a.ownerEmail || ''
      });
    },
    deleteAction: async function (a) {
      await Graph.g('/sites/' + siteId + '/lists/' + lists.Actions + '/items/' + a._sp, { method: 'DELETE', scopes: CONFIG.scopesProvision });
    },
    /* Append-only — no update/delete counterpart, same immutability the
       audit log already relies on for its own credibility. */
    addActionUpdate: async function (u) {
      u._sp = await addItem('ActionUpdates', {
        Title: u.id, RefId: u.id, ActionRef: u.action, UpdateDate: u.date,
        Note: u.note || '', EvidenceUrl: u.evidenceUrl || '', Status: u.status || '', Author: u.author || ''
      });
      S.actionUpdates.push(u);
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
        CalRef: v.calRef || '', PublicListed: !!v.publicListed, DataCategories: csv(v.dataCategories),
        CertExpiryDate: v.certExpiryDate || ''
      });
      S.vendors.push(v);
    },
    updateVendor: async function (v) {
      await patchItem('Vendors', v._sp, {
        Title: v.name, Service: v.service, DataAccessed: v.dataAccessed || '', Criticality: v.criticality,
        ReviewStatus: v.reviewStatus, LastReviewed: v.lastReviewed || '', NextReviewDue: v.nextReviewDue || '',
        Certifications: v.certifications || '', Owner: v.owner, Notes: v.notes || '', ContactEmail: v.contactEmail || '',
        Controls: csv(v.controls), RiskRefs: csv(v.riskRefs), QuestionnaireStatus: v.questionnaireStatus || 'Not sent',
        QuestionnaireSentDate: v.questionnaireSentDate || '', CalRef: v.calRef || '', PublicListed: !!v.publicListed, DataCategories: csv(v.dataCategories),
        CertExpiryDate: v.certExpiryDate || ''
      });
    },
    addAiSystem: async function (a) {
      a._sp = await addItem('AISystems', {
        Title: a.name, RefId: a.id, Purpose: a.purpose || '', Owner: a.owner, DataSources: a.dataSources || '',
        ModelType: a.modelType || '', Vendor: a.vendor || '', RiskTier: a.riskTier,
        ImpactAssessmentStatus: a.impactAssessmentStatus, HumanOversight: a.humanOversight || '',
        LastReviewed: a.lastReviewed || '', SpId: a.spId || '', AiActAnswers: JSON.stringify(a.aiActAnswers || {})
      });
      S.aiSystems.push(a);
    },
    updateAiSystem: async function (a) {
      await patchItem('AISystems', a._sp, {
        Title: a.name, Purpose: a.purpose || '', Owner: a.owner, DataSources: a.dataSources || '',
        ModelType: a.modelType || '', Vendor: a.vendor || '', RiskTier: a.riskTier,
        ImpactAssessmentStatus: a.impactAssessmentStatus, HumanOversight: a.humanOversight || '',
        LastReviewed: a.lastReviewed || '', SpId: a.spId || '', AiActAnswers: JSON.stringify(a.aiActAnswers || {})
      });
    },
    /* Upsert by checkId — see the demo store's copy of this method for
       why a check may only ever hold one disposition row. */
    setCheckDisposition: async function (d) {
      S.checkDispositions = S.checkDispositions || [];
      var fields = {
        Title: d.checkId, CheckId: d.checkId, Disposition: d.disposition, AlternativeTool: d.tool || '',
        Justification: d.justification || '', EvidenceUrl: d.evidenceUrl || '', Owner: d.owner || '',
        LastVerified: d.lastVerified || '', ReviewDue: d.reviewDue || ''
      };
      var existing = S.checkDispositions.find(function (x) { return x.checkId === d.checkId; });
      if (existing) {
        await patchItem('CheckDispositions', existing._sp, fields);
        Object.assign(existing, d);
      } else {
        d._sp = await addItem('CheckDispositions', fields);
        S.checkDispositions.push(d);
      }
    },
    /* Deleted outright rather than flagged inactive: absence of a row IS
       the 'microsoft' default, so a cleared disposition and a check that
       never had one must be indistinguishable to checkResult(). The
       AuditLog carries the history of who set and cleared it. */
    clearCheckDisposition: async function (checkId) {
      var existing = (S.checkDispositions || []).find(function (x) { return x.checkId === checkId; });
      if (!existing) return;
      await Graph.g('/sites/' + siteId + '/lists/' + lists.CheckDispositions + '/items/' + existing._sp, { method: 'DELETE', scopes: CONFIG.scopesProvision });
      S.checkDispositions = S.checkDispositions.filter(function (x) { return x.checkId !== checkId; });
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
      async function write() {
        if (settingsRowId[key]) { await patchItem('Settings', settingsRowId[key], { SettingValue: value }); return; }
        settingsRowId[key] = await addItem('Settings', { Title: key, SettingKey: key, SettingValue: value });
      }
      try {
        await write();
      } catch (e) {
        /* One self-heal attempt (see widenTextColumnIfNarrow() above),
           then one retry. If the column was already wide, widening
           failed, or the retry still fails, the ORIGINAL error
           propagates unchanged — a genuine permissions/network failure
           is never masked as if it had silently self-corrected. */
        var healed = false;
        try { healed = await widenTextColumnIfNarrow('Settings', 'SettingValue'); } catch (e2) { /* best-effort only */ }
        if (!healed) throw e;
        await write();
      }
    },
    listDocuments: async function () {
      if (!docDriveId) return [];
      var files = await Graph.listDriveFiles(docDriveId);
      return files.map(function (f) {
        var d = docMetaFrom(f.fields);
        d.id = f.id; d.name = f.name; d.url = f.url; d.size = f.size;
        d.modified = f.modified; d.category = f.category;
        return d;
      });
    },
    /* meta (optional) is a partial document-control record — see
       DOC_FIELD_MAP. The file is uploaded first and the register fields
       patched second, so a metadata failure never loses the upload: the
       returned object carries `metaError` instead, and the caller
       decides how loudly to say "saved, but its details didn't stick". */
    uploadDocument: async function (file, category, meta) {
      if (!docDriveId) throw new Error('Document library is still provisioning — try again in a moment.');
      var item = await Graph.uploadSmallFile(docDriveId, category || 'Other', file.name, file);
      var doc = { id: item.id, name: item.name, url: item.webUrl };
      if (meta) {
        try { await Graph.setDriveItemFields(docDriveId, item.id, docFieldsFrom(meta)); }
        catch (e) { doc.metaError = e.message || String(e); }
      }
      return doc;
    },
    updateDocumentMeta: async function (itemId, meta) {
      if (!docDriveId) throw new Error('Document library is still provisioning — try again in a moment.');
      await Graph.setDriveItemFields(docDriveId, itemId, docFieldsFrom(meta));
    },
    /* Bulk-created one row per recipient when a campaign is launched.
       Rows are added sequentially rather than in a $batch: a campaign
       across a few hundred staff is a one-off action with a progress
       indicator, and a partial failure that leaves the rows already
       written in place is far better than a batch that half-applies
       with no record of which half. onProgress lets the caller show
       how far it got. */
    addAttestations: async function (rows, onProgress) {
      for (var i = 0; i < rows.length; i++) {
        var a = rows[i];
        a._sp = await addItem('Attestations', {
          Title: a.id, RefId: a.id, Campaign: a.campaign, DocName: a.docName,
          DocVersion: a.docVersion || '', DocUrl: a.docUrl || '',
          UserUpn: a.upn, UserName: a.userName || '',
          AssignedDate: a.assigned, AcknowledgedDate: a.acknowledged || '',
          Status: a.status || 'Assigned', Note: a.note || ''
        });
        S.attestations.push(a);
        if (onProgress) onProgress(i + 1, rows.length);
      }
    },
    updateAttestation: async function (a) {
      await patchItem('Attestations', a._sp, {
        AcknowledgedDate: a.acknowledged || '', Status: a.status || 'Assigned', Note: a.note || ''
      });
    },
    addTrainingAssignments: async function (rows, onProgress) {
      for (var i = 0; i < rows.length; i++) {
        var t = rows[i];
        t._sp = await addItem('Training', {
          Title: t.id, RefId: t.id, Campaign: t.campaign,
          CourseId: t.courseId, CourseTitle: t.courseTitle, CourseVersion: t.courseVersion,
          UserUpn: t.upn, UserName: t.userName || '',
          AssignedDate: t.assigned, DueDate: t.due || '', CompletedDate: t.completed || '',
          Status: t.status || 'Assigned', Score: t.score || '', Attempts: t.attempts || 0,
          Source: t.source || 'campaign', Note: t.note || ''
        });
        S.training.push(t);
        if (onProgress) onProgress(i + 1, rows.length);
      }
    },
    updateTrainingRecord: async function (t) {
      await patchItem('Training', t._sp, {
        CompletedDate: t.completed || '', Status: t.status || 'Assigned',
        Score: t.score || '', Attempts: t.attempts || 0, Note: t.note || ''
      });
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
    addIncident: async function (n) {
      n._sp = await addItem('Incidents', incidentFields(n));
      S.incidents.push(n);
    },
    updateIncident: async function (n) {
      await patchItem('Incidents', n._sp, incidentFields(n));
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
      /* Chain to the newest entry we currently hold. S.auditLog is
         newest-first, so [0] is the predecessor. A hashing failure must
         never block the audit write itself -- an unchained entry is a
         gap in the proof, a missing entry is a gap in the record, and
         the second is far worse. */
      try {
        var prev = (S.auditLog && S.auditLog[0] && S.auditLog[0].entryHash) || '';
        entry.prevHash = prev;
        entry.entryHash = await window.CheckpointLib.auditEntryHash(crypto.subtle, entry, prev);
      } catch (e) { entry.prevHash = ''; entry.entryHash = ''; }
      entry._sp = await addItem('AuditLog', {
        Title: entry.action, Actor: entry.actor, ActorId: entry.actorId, Action: entry.action,
        TargetType: entry.targetType, TargetId: entry.targetId, Before: entry.before || '',
        After: entry.after || '', EntryDateTime: entry.entryDateTime,
        EntryHash: entry.entryHash || '', PrevHash: entry.prevHash || ''
      });
      S.auditLog.unshift(entry);
    },
    ensureNistSubcategories: ensureNistSubcategories,
    reconcileControls: reconcileControls,
    probeOnboardingState: probeOnboardingState,
    readCachedActivation: readCachedActivation,
    validateSitePath: validateSitePath,
    reset: null /* never bulk-delete client data from the console */
  };
})();
