/**
 * framework-by-sector.js
 * ======================
 * Which frameworks buyers in each sector usually ask for, shown on
 * /framework-by-sector/. Drawn from the per-city "Which framework does
 * your buyer actually ask for?" sections (src/pages/locations/*.astro)
 * and the service pages, so the matrix and those pages say the same
 * thing. 'core' = usually required or asked for first; 'often' =
 * commonly asked for alongside it.
 */

export const FRAMEWORKS = [
  { id: 'iso27001', name: 'ISO 27001', href: 'services/iso27001/' },
  { id: 'soc2', name: 'SOC 2', href: 'services/soc2/' },
  { id: 'e8', name: 'Essential Eight', href: 'services/essential-eight/' },
  { id: 'iso27701', name: 'ISO 27701', href: 'services/iso27701/' },
  { id: 'iso42001', name: 'ISO 42001', href: 'services/iso42001/' },
  { id: 'disp', name: 'DISP / ISM / IRAP', href: 'services/disp-ism-irap/' },
  { id: 'is18', name: 'IS18', href: 'services/is18/' },
  { id: 'rffr', name: 'RFFR', href: 'services/rffr/' },
  { id: 'cps234', name: 'CPS 234', href: 'services/cps234/' },
  { id: 'nist', name: 'NIST CSF', href: 'services/nist-csf/' },
];

export const SECTORS = [
  { id: 'saas', name: 'SaaS selling to enterprise', who: 'Enterprise procurement and security review teams, in Australia and the US',
    why: 'Security questionnaires stall deals until there is a certificate or a report to hand over. Australian buyers lean to ISO 27001, US buyers to SOC 2, and one control set can produce both.',
    cells: { iso27001: 'core', soc2: 'core', iso42001: 'often', nist: 'often' } },
  { id: 'ai', name: 'AI products and AI features', who: 'Enterprise buyers, hospitals and government purchasers adding AI questions to vendor reviews',
    why: 'AI governance questions are now standard in vendor questionnaires. ISO 42001 answers them on top of an ISO 27001 base, and ISO 27701 covers the personal information the models use.',
    cells: { iso42001: 'core', iso27001: 'core', iso27701: 'often' } },
  { id: 'health', name: 'Healthcare and health technology', who: 'State health departments, private hospital groups and health insurers',
    why: 'Health information is sensitive information under the Privacy Act. ISO 27701 documents privacy handling on the same evidence as the ISMS, and AI triage or clinical tools add ISO 42001.',
    cells: { iso27001: 'core', iso27701: 'core', e8: 'often', iso42001: 'often' } },
  { id: 'cth', name: 'Federal government agencies and suppliers', who: 'Commonwealth agencies, and the panels and primes buying for them',
    why: 'Essential Eight maturity is the baseline the government measures itself against, and systems handling government data are assessed against the ISM, often through an IRAP assessment.',
    cells: { e8: 'core', disp: 'core', iso27001: 'often' } },
  { id: 'qld', name: 'Queensland Government agencies and suppliers', who: 'Queensland Government agencies under the QGEA',
    why: 'Agencies run IS18, which is an ISO 27001-aligned ISMS plus Essential Eight. Suppliers are asked for an equivalent posture, and ISO 27001 is the accepted way to show it.',
    cells: { is18: 'core', iso27001: 'core', e8: 'core' } },
  { id: 'defence', name: 'Defence primes and sub-contractors', who: 'Defence, and the primes that flow requirements down to their supply chain',
    why: 'DISP membership is the entry ticket. Its conditions reference the ISM, and Essential Eight Maturity Level 2 is the practical baseline underneath.',
    cells: { disp: 'core', e8: 'core', iso27001: 'often' } },
  { id: 'employment', name: 'Employment services providers', who: 'The Department of Employment and Workplace Relations (DEWR)',
    why: 'Right Fit For Risk accreditation is a contract condition. It is an ISM-based Statement of Applicability built on an ISO 27001-aligned ISMS, with Essential Eight uplift.',
    cells: { rffr: 'core', iso27001: 'core', e8: 'often' } },
  { id: 'apra', name: 'Banking, insurance and super, and their providers', who: 'APRA, and APRA-regulated entities assessing their service providers',
    why: 'CPS 234 binds regulated entities directly and reaches their providers through third-party assessments. ISO 27001 or SOC 2 is how a provider evidences its controls.',
    cells: { cps234: 'core', iso27001: 'often', soc2: 'often' } },
  { id: 'us', name: 'US-owned or US-facing organisations', who: 'US parents, investors and cyber insurers',
    why: 'NIST CSF is the common US vocabulary for describing cyber maturity. It is a profile, not a certificate, and maps onto ISO 27001 work you may already have.',
    cells: { nist: 'core', iso27001: 'often', soc2: 'often' } },
];
