/**
 * framework-overlap-controls.js
 * ==============================
 * Canonical control-domain crosswalk for the Framework Overlap Calculator
 * (/framework-overlap-calculator/).
 *
 * Shape mirrors the `frameworks: { slug: "clause ref" }` tagging pattern
 * already used by src/pages/posture-scan/index.astro's CONTROLS array —
 * extended from that page's 4 frameworks (e8, iso27001, iso27701, iso42001)
 * to all 9 frameworks Compliance365 delivers.
 *
 * No single existing dataset in this repo tags controls across all 9
 * frameworks, so this file is newly authored — but every reference below is
 * grounded in real structure already present in the codebase or publicly
 * documented:
 *  - ISO 27001:2022 Annex A clause numbers (A.5–A.8), and the 93/49/38
 *    control counts already cited in
 *    src/pages/resources/inside-statement-of-applicability.astro.
 *  - ISO 27701 Annex A/B clause numbers (7.x / 8.x), same page.
 *  - ISO 42001 Annex A clause numbers (A.2–A.10).
 *  - The ACSC Essential Eight's 8 named mitigation strategies.
 *  - AICPA SOC 2 Trust Services Criteria (CC1–CC9).
 *  - NIST CSF 2.0's 6 functions and real category codes (GV/ID/PR/DE/RS/RC).
 *  - The ISM guideline categories already present in
 *    src/data/rffr-controls.json (`cat` field) — DISP, IS18 and RFFR are all
 *    ISM-based programs, so they reuse those same category labels here.
 *
 * This is a control-DOMAIN level crosswalk (one row per practice area, e.g.
 * "Multi-factor authentication"), not a clause-by-clause legal mapping — the
 * same level of precision as the existing "180 → 80" Integrated SoA figures
 * elsewhere on the site. Treat counts as indicative, not an audit opinion.
 */

export const FRAMEWORKS = {
  iso27001: { label: 'ISO 27001', short: '27001', servicesUrl: '/services/iso27001/' },
  soc2:     { label: 'SOC 2',     short: 'SOC 2', servicesUrl: '/services/soc2/' },
  essential8: { label: 'Essential Eight', short: 'E8', servicesUrl: '/services/essential-eight/' },
  iso42001: { label: 'ISO 42001', short: '42001', servicesUrl: '/services/iso42001/' },
  iso27701: { label: 'ISO 27701', short: '27701', servicesUrl: '/services/iso27701/' },
  disp:     { label: 'DISP / IRAP', short: 'DISP', servicesUrl: '/services/disp-ism-irap/' },
  is18:     { label: 'IS18',     short: 'IS18', servicesUrl: '/services/is18/' },
  rffr:     { label: 'RFFR',     short: 'RFFR', servicesUrl: '/services/rffr/' },
  nistcsf:  { label: 'NIST CSF', short: 'NIST', servicesUrl: '/services/nist-csf/' },
};

export const CONTROL_DOMAINS = [
  // ── Governance & risk ──────────────────────────────────────────
  { id: 'gov-policy', title: 'Information security policy framework', category: 'Governance & risk',
    frameworks: { iso27001: 'A.5.1', iso27701: '5.1 (inherited)', iso42001: 'A.2.2', soc2: 'CC1.1', disp: 'ISM: documentation', is18: 'ISMS policy', rffr: 'ISM: documentation', nistcsf: 'GV.PO' } },
  { id: 'gov-risk-method', title: 'Risk assessment & treatment methodology', category: 'Governance & risk',
    frameworks: { iso27001: '6.1.2 / 6.1.3', iso27701: '6.1.2 (inherited)', iso42001: 'A.5.2', soc2: 'CC3.1–CC3.2', disp: 'ISM: assurance', is18: 'ISMS risk process', rffr: 'ISM: assurance', nistcsf: 'ID.RA' } },
  { id: 'gov-soa', title: 'Statement of Applicability / control selection', category: 'Governance & risk',
    frameworks: { iso27001: '6.1.3(d)', iso27701: '6.1.3 (inherited)', iso42001: '6.1.3(d)', is18: 'Integrated SoA', rffr: 'ISM SoA (989 controls)' } },
  { id: 'gov-audit', title: 'Internal audit programme', category: 'Governance & risk',
    frameworks: { iso27001: '9.2', iso27701: '9.2 (inherited)', iso42001: '9.2', soc2: 'CC4.1', disp: 'ISM: assurance', is18: 'ISMS internal audit', rffr: 'ISM: assurance', nistcsf: 'GV.OV' } },
  { id: 'gov-mgmt-review', title: 'Management review', category: 'Governance & risk',
    frameworks: { iso27001: '9.3', iso27701: '9.3 (inherited)', iso42001: '9.3', soc2: 'CC1.2', disp: 'ISM: roles', is18: 'ISMS management review', rffr: 'ISM: roles', nistcsf: 'GV.OV' } },
  { id: 'gov-roles', title: 'Security, privacy & AI governance roles', category: 'Governance & risk',
    frameworks: { iso27001: 'A.5.2', iso27701: '5.2 (inherited)', iso42001: 'A.3.2', soc2: 'CC1.3', disp: 'ISM: roles', is18: 'Accountable officer', rffr: 'ISM: roles', nistcsf: 'GV.RR' } },
  { id: 'gov-legal', title: 'Legal & regulatory compliance register', category: 'Governance & risk',
    frameworks: { iso27001: 'A.5.31', iso27701: '5.31 / Privacy Act', iso42001: 'A.2.4', soc2: 'CC1.1', disp: 'ISM: documentation', is18: 'ISMS compliance register', rffr: 'ISM: documentation', nistcsf: 'GV.OC' } },
  { id: 'gov-improve', title: 'Continual improvement & corrective action', category: 'Governance & risk',
    frameworks: { iso27001: '10.1 / 10.2', iso27701: '10.2 (inherited)', iso42001: '10.2', soc2: 'CC4.2', disp: 'ISM: assurance', is18: 'ISMS corrective action', rffr: 'ISM: assurance', nistcsf: 'GV.OV' } },

  // ── Access & identity ──────────────────────────────────────────
  { id: 'acc-mfa', title: 'Multi-factor authentication', category: 'Access & identity',
    frameworks: { iso27001: 'A.8.5', iso27701: '8.5 (inherited)', essential8: 'MFA (strategy 7)', soc2: 'CC6.1', disp: 'ISM: access', is18: 'E8 uplift', rffr: 'ISM (mfa-all)', nistcsf: 'PR.AA-02' } },
  { id: 'acc-priv', title: 'Restrict & review privileged access', category: 'Access & identity',
    frameworks: { iso27001: 'A.8.2', iso27701: '8.2 (inherited)', essential8: 'Restrict admin privileges (strategy 5)', soc2: 'CC6.3', disp: 'ISM: access', is18: 'E8 uplift', rffr: 'ISM (admins)', nistcsf: 'PR.AA-05' } },
  { id: 'acc-review', title: 'Access reviews & de-provisioning', category: 'Access & identity',
    frameworks: { iso27001: 'A.5.18', iso27701: '5.18 (inherited)', soc2: 'CC6.2', disp: 'ISM: access', is18: 'ISMS access review', rffr: 'ISM (access-review)', nistcsf: 'PR.AA-01' } },
  { id: 'acc-identity', title: 'Identity & directory governance', category: 'Access & identity',
    frameworks: { iso27001: 'A.8.5', iso27701: '8.5 (inherited)', soc2: 'CC6.1', disp: 'ISM: access', is18: 'ISMS identity mgmt', rffr: 'ISM: access', nistcsf: 'PR.AA' } },

  // ── Asset, data & cryptography ─────────────────────────────────
  { id: 'data-asset', title: 'Asset inventory & ownership', category: 'Asset, data & cryptography',
    frameworks: { iso27001: 'A.5.9', iso27701: '5.9 (inherited)', soc2: 'CC6.1', disp: 'ISM: hardening', is18: 'ISMS asset register', rffr: 'ISM: hardening', nistcsf: 'ID.AM' } },
  { id: 'data-classification', title: 'Data classification & protective markings', category: 'Asset, data & cryptography',
    frameworks: { iso27001: 'A.5.12', iso27701: '5.12 (inherited)', soc2: 'Confidentiality criteria', disp: 'ISM: media / PSPF markings', is18: 'QGISCF classification', rffr: 'ISM: media', nistcsf: 'ID.AM' } },
  { id: 'data-encryption', title: 'Encryption at rest & in transit', category: 'Asset, data & cryptography',
    frameworks: { iso27001: 'A.8.24', iso27701: '8.24 (inherited)', soc2: 'CC6.7', disp: 'ISM: cryptography', is18: 'ISM-approved crypto', rffr: 'ISM (encryption)', nistcsf: 'PR.DS' } },
  { id: 'data-disposal', title: 'Retention & secure disposal / media sanitisation', category: 'Asset, data & cryptography',
    frameworks: { iso27001: 'A.8.10', iso27701: '8.10 (inherited)', soc2: 'CC6.5', disp: 'ISM: media', is18: 'ISM: media', rffr: 'ISM: media', nistcsf: 'PR.DS' } },
  { id: 'data-backup', title: 'Backup & recovery testing', category: 'Asset, data & cryptography',
    frameworks: { iso27001: 'A.8.13', iso27701: '8.13 (inherited)', essential8: 'Regular backups (strategy 8)', soc2: 'A1.2', disp: 'ISM: sys-mgmt', is18: 'E8 uplift', rffr: 'ISM (backup)', nistcsf: 'PR.DS / RC.RP' } },

  // ── Technical operations ───────────────────────────────────────
  { id: 'ops-patch-apps', title: 'Patch management — applications', category: 'Technical operations',
    frameworks: { iso27001: 'A.8.8', iso27701: '8.8 (inherited)', essential8: 'Patch applications (strategy 2)', soc2: 'CC7.1', disp: 'ISM: hardening', is18: 'E8 uplift', rffr: 'ISM (patch)', nistcsf: 'PR.PS' } },
  { id: 'ops-patch-os', title: 'Patch management — operating systems', category: 'Technical operations',
    frameworks: { iso27001: 'A.8.8', iso27701: '8.8 (inherited)', essential8: 'Patch operating systems (strategy 6)', soc2: 'CC7.1', disp: 'ISM: hardening', is18: 'E8 uplift', rffr: 'ISM (patch)', nistcsf: 'PR.PS' } },
  { id: 'ops-appcontrol', title: 'Application control / allowlisting', category: 'Technical operations',
    frameworks: { iso27001: 'A.8.19', iso27701: '8.19 (inherited)', essential8: 'Application control (strategy 1)', disp: 'ISM: hardening', is18: 'E8 uplift', rffr: 'ISM (wdac)', nistcsf: 'PR.PS' } },
  { id: 'ops-macro', title: 'Microsoft Office macro hardening', category: 'Technical operations',
    frameworks: { iso27001: 'A.8.19', iso27701: '8.19 (inherited)', essential8: 'Configure Office macro settings (strategy 3)', disp: 'ISM: hardening', is18: 'E8 uplift', rffr: 'ISM (macro)', nistcsf: 'PR.PS' } },
  { id: 'ops-userhardening', title: 'User application hardening (browser/PDF)', category: 'Technical operations',
    frameworks: { iso27001: 'A.8.9', iso27701: '8.9 (inherited)', essential8: 'User application hardening (strategy 4)', disp: 'ISM: hardening', is18: 'E8 uplift', rffr: 'ISM: hardening', nistcsf: 'PR.PS' } },
  { id: 'ops-device', title: 'Device compliance & mobile device management', category: 'Technical operations',
    frameworks: { iso27001: 'A.8.1', iso27701: '8.1 (inherited)', soc2: 'CC6.6', disp: 'ISM: mobility', is18: 'ISMS device mgmt', rffr: 'ISM (device)', nistcsf: 'PR.PS' } },
  { id: 'ops-network', title: 'Network segmentation & gateway controls', category: 'Technical operations',
    frameworks: { iso27001: 'A.8.20–A.8.22', iso27701: '8.20 (inherited)', soc2: 'CC6.6', disp: 'ISM: gateways / networking', is18: 'ISMS network controls', rffr: 'ISM: gateways', nistcsf: 'PR.IR' } },
  { id: 'ops-hardening', title: 'Secure configuration / system hardening baseline', category: 'Technical operations',
    frameworks: { iso27001: 'A.8.9', iso27701: '8.9 (inherited)', soc2: 'CC6.6', disp: 'ISM: hardening', is18: 'ISMS hardening baseline', rffr: 'ISM: hardening', nistcsf: 'PR.PS' } },
  { id: 'ops-vuln', title: 'Vulnerability scanning & management', category: 'Technical operations',
    frameworks: { iso27001: 'A.8.8', iso27701: '8.8 (inherited)', soc2: 'CC7.1', disp: 'ISM: hardening', is18: 'ISMS vuln management', rffr: 'ISM (patch)', nistcsf: 'ID.RA' } },
  { id: 'ops-logging', title: 'Logging & centralised monitoring', category: 'Technical operations',
    frameworks: { iso27001: 'A.8.15', iso27701: '8.15 (inherited)', soc2: 'CC7.2', disp: 'ISM: comms-systems', is18: 'ISMS logging', rffr: 'ISM (logging)', nistcsf: 'DE.CM' } },
  { id: 'ops-malware', title: 'Malware / endpoint protection', category: 'Technical operations',
    frameworks: { iso27001: 'A.8.7', iso27701: '8.7 (inherited)', soc2: 'CC6.8', disp: 'ISM: hardening', is18: 'ISMS endpoint protection', rffr: 'ISM (alerts)', nistcsf: 'DE.CM' } },
  { id: 'ops-sdlc', title: 'Secure software development lifecycle', category: 'Technical operations',
    frameworks: { iso27001: 'A.8.25–A.8.29', iso27701: '8.25 (inherited)', soc2: 'CC8.1', disp: 'ISM: software-dev', is18: 'ISMS SDLC', rffr: 'ISM: software-dev', nistcsf: 'PR.PS' } },
  { id: 'ops-change', title: 'Change management', category: 'Technical operations',
    frameworks: { iso27001: 'A.8.32', iso27701: '8.32 (inherited)', soc2: 'CC8.1', disp: 'ISM: sys-mgmt', is18: 'ISMS change mgmt', rffr: 'ISM: sys-mgmt', nistcsf: 'PR.PS' } },
  { id: 'ops-email', title: 'Email security & anti-phishing controls', category: 'Technical operations',
    frameworks: { iso27001: 'A.8.23', iso27701: '8.23 (inherited)', soc2: 'CC6.6', disp: 'ISM: email', is18: 'ISMS email security', rffr: 'ISM: email', nistcsf: 'PR.PS' } },

  // ── Personnel & physical ───────────────────────────────────────
  { id: 'people-screening', title: 'Personnel screening & background checks', category: 'Personnel & physical',
    frameworks: { iso27001: 'A.6.1', iso27701: '6.1 (inherited)', soc2: 'CC1.4', disp: 'Security clearances', is18: 'ISMS personnel security', rffr: 'ISM: personnel (RFFR-D1/D2)', nistcsf: 'GV.RR' } },
  { id: 'people-training', title: 'Security awareness training', category: 'Personnel & physical',
    frameworks: { iso27001: 'A.6.3', iso27701: '6.3 (inherited)', iso42001: 'A.4.3 (AI literacy)', soc2: 'CC1.4', disp: 'ISM: personnel', is18: 'ISMS awareness training', rffr: 'ISM: personnel', nistcsf: 'PR.AT' } },
  { id: 'people-physical', title: 'Physical & environmental security', category: 'Personnel & physical',
    frameworks: { iso27001: 'A.7', iso27701: 'A.7 (inherited)', soc2: 'CC6.4', disp: 'Facility security clearance', is18: 'ISMS physical security', rffr: 'ISM: physical', nistcsf: 'PR.AA' } },
  { id: 'people-media', title: 'Removable media & equipment control', category: 'Personnel & physical',
    frameworks: { iso27001: 'A.7.10', iso27701: 'A.7.10 (inherited)', disp: 'ISM: IT equipment / media', is18: 'ISM: media', rffr: 'ISM: it-equipment', nistcsf: 'PR.DS' } },

  // ── Supplier & third-party ──────────────────────────────────────
  { id: 'supplier-risk', title: 'Supplier & third-party risk management', category: 'Supplier & third-party',
    frameworks: { iso27001: 'A.5.19–A.5.22', iso27701: '5.19 (inherited)', iso42001: 'A.10.2', soc2: 'CC9.2', disp: 'ISM: procurement', is18: 'ISMS supplier mgmt', rffr: 'ISM: procurement', nistcsf: 'GV.SC' } },
  { id: 'supplier-cloud', title: 'Cloud / outsourced service provider assurance', category: 'Supplier & third-party',
    frameworks: { iso27001: 'A.5.23', iso27701: '5.23 (inherited)', soc2: 'CC9.2', disp: 'ISM: procurement', is18: 'ISMS cloud assurance', rffr: 'ISM: procurement', nistcsf: 'GV.SC' } },
  { id: 'supplier-foreign', title: 'Foreign ownership & procurement security reporting', category: 'Supplier & third-party',
    frameworks: { disp: 'DISP membership obligation' } },

  // ── Incident & continuity ───────────────────────────────────────
  { id: 'incident-plan', title: 'Incident detection & response plan', category: 'Incident & continuity',
    frameworks: { iso27001: 'A.5.24–A.5.26', iso27701: '5.24 (inherited)', iso42001: 'A.6.2.6', soc2: 'CC7.3–CC7.4', disp: 'ISM: incidents', is18: 'ISMS incident response', rffr: 'ISM: incidents', nistcsf: 'RS.MA' } },
  { id: 'incident-reporting', title: 'Incident reporting to regulator / authority', category: 'Incident & continuity',
    frameworks: { iso27001: 'A.5.26', iso27701: 'Privacy Act NDB scheme', disp: 'ISM: report to ASD', is18: 'CSU incident reporting', rffr: 'ISM: incidents / DEWR reporting', nistcsf: 'RS.CO' } },
  { id: 'incident-bcp', title: 'Business continuity & disaster recovery', category: 'Incident & continuity',
    frameworks: { iso27001: 'A.5.29–A.5.30', iso27701: '5.29 (inherited)', soc2: 'A1.1–A1.3', disp: 'ISM: sys-mgmt', is18: 'ISMS BCP/DR', rffr: 'ISM: sys-mgmt', nistcsf: 'RC.RP' } },
  { id: 'incident-forensics', title: 'Evidence collection & forensic readiness', category: 'Incident & continuity',
    frameworks: { iso27001: 'A.5.28', iso27701: '5.28 (inherited)', soc2: 'CC7.4', disp: 'ISM: incidents', is18: 'ISMS forensic readiness', rffr: 'ISM: incidents', nistcsf: 'RS.AN' } },

  // ── Privacy-specific (ISO 27701) ────────────────────────────────
  { id: 'privacy-ropa', title: 'Register of processing activities (ROPA)', category: 'Privacy (ISO 27701)',
    frameworks: { iso27701: '7.2' } },
  { id: 'privacy-dpia', title: 'Privacy / data protection impact assessments', category: 'Privacy (ISO 27701)',
    frameworks: { iso27701: '7.2.5' } },
  { id: 'privacy-dsr', title: 'Data subject rights handling', category: 'Privacy (ISO 27701)',
    frameworks: { iso27701: '7.3' } },
  { id: 'privacy-consent', title: 'Consent management', category: 'Privacy (ISO 27701)',
    frameworks: { iso27701: '7.2.8' } },
  { id: 'privacy-by-design', title: 'Privacy by design & default', category: 'Privacy (ISO 27701)',
    frameworks: { iso27701: '7.3.5' } },
  { id: 'privacy-transfer', title: 'Cross-border data transfer safeguards', category: 'Privacy (ISO 27701)',
    frameworks: { iso27701: '7.5' } },

  // ── AI-specific (ISO 42001) ──────────────────────────────────────
  { id: 'ai-inventory', title: 'AI system inventory / model register', category: 'AI governance (ISO 42001)',
    frameworks: { iso42001: 'A.6.1' } },
  { id: 'ai-risk', title: 'AI risk & impact assessment', category: 'AI governance (ISO 42001)',
    frameworks: { iso42001: 'A.5.2 / A.5.4' } },
  { id: 'ai-oversight', title: 'Human oversight of AI decisions', category: 'AI governance (ISO 42001)',
    frameworks: { iso42001: 'A.9.2' } },
  { id: 'ai-monitoring', title: 'AI monitoring, drift & performance review', category: 'AI governance (ISO 42001)',
    frameworks: { iso42001: 'A.6.2.4' } },
  { id: 'ai-data-quality', title: 'Data quality & bias management for training data', category: 'AI governance (ISO 42001)',
    frameworks: { iso42001: 'A.7.4' } },
  { id: 'ai-responsible-use', title: 'Responsible / transparent AI use policy', category: 'AI governance (ISO 42001)',
    frameworks: { iso42001: 'A.2.2 / A.8' } },

  // ── Program-specific compliance & reporting ─────────────────────
  { id: 'report-annual', title: 'Annual compliance attestation / accountable officer sign-off', category: 'Program-specific reporting',
    frameworks: { is18: 'Annual return (30 Sept)', rffr: 'Deed reporting' } },
  { id: 'report-irap', title: 'IRAP assessment readiness', category: 'Program-specific reporting',
    frameworks: { disp: 'IRAP assessment' } },
  { id: 'report-rffr-core', title: 'RFFR Core Expectations attestation', category: 'Program-specific reporting',
    frameworks: { rffr: 'RFFR Core Expectations' } },
];

export const FRAMEWORK_SLUGS = Object.keys(FRAMEWORKS);
