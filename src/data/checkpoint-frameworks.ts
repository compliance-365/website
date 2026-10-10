// Framework pages under /checkpoint-console/<slug>/ — one per self-serve
// module, aimed at the "<framework> software / tool" searches the
// consulting pages do not answer. Every claim is checked against
// public/checkpoint/ (store.js FRAMEWORKS and CHECK_DEFS, changelog.js);
// prices come from src/data/pricing.js, never typed here.
// test/checkpoint-seo-pages.test.mjs pins the counts most likely to drift.

export interface FrameworkPage {
  slug: string;
  moduleId: string;          // pricing.js MODULES id
  name: string;              // "ISO 27001"
  title: string;             // <title>, 60 chars or so
  description: string;       // meta description
  h1: string;
  lead: string;
  servicePath: string;       // consulting page for the same framework
  demoView: string;          // data-v in public/checkpoint/index.html
  demoLabel: string;
  covers: string[];          // what Checkpoint holds for this framework
  scan: string;              // what the Microsoft 365 scan contributes
  faq: { q: string; a: string }[];
}

export const frameworkPages: FrameworkPage[] = [
  {
    slug: 'iso-27001-software',
    moduleId: 'iso27001',
    name: 'ISO 27001',
    title: 'ISO 27001 Compliance Software for Microsoft 365 | Checkpoint',
    description: 'ISO 27001 software that runs in your own Microsoft 365 tenant: all 93 Annex A controls, Clauses 4–10, risk register, SoA and audit packs. From $7,000 a year, AUD.',
    h1: 'ISO 27001 software that runs in your own Microsoft 365',
    lead: 'Checkpoint holds your whole ISO 27001 management system, from the risk register to the Statement of Applicability, as SharePoint lists in your own tenant. It reads your Microsoft 365 security settings to evidence the technical controls, and it gets you to the Stage 1 and Stage 2 audits with the packs your certifier asks for.',
    servicePath: 'services/iso27001/',
    demoView: 'soa',
    demoLabel: 'Open the Statement of Applicability in the demo',
    covers: [
      'All 93 Annex A controls of ISO/IEC 27001:2022, across the Organizational, People, Physical and Technological themes, in a Statement of Applicability with an inclusion or exclusion justification for each.',
      'Clauses 4–10 as requirement checklists, each needing evidence before it can be marked met.',
      'A risk register aligned to ISO 31000 and ISO 27005, with treatment actions, owners and residual-risk acceptance.',
      'Internal audit, management review, objectives, incidents, suppliers, assets and the legal and regulatory register.',
      'Policies drafted for your organisation, approved with a recorded sign-off and exported to Word.',
      'A Stage 1 readiness pack, a Stage 2 sampling dry run and time-boxed, read-only access for your auditor.',
    ],
    scan: 'The Microsoft 365 scan runs 49 checks across identity, devices, apps and data, monitoring, privacy, continuity, suppliers and governance, and suggests the status of the Annex A controls they evidence. Every scan is kept as dated evidence.',
    faq: [
      { q: 'Does Checkpoint certify us to ISO 27001?', a: 'No. Certification comes from an accredited certification body. Checkpoint runs the management system and prepares the evidence and packs that body audits.' },
      { q: 'Which version of ISO 27001 does it use?', a: 'ISO/IEC 27001:2022, with its 93 Annex A controls.' },
      { q: 'Where is our data stored?', a: 'In SharePoint lists in your own Microsoft 365 tenant. Compliance365 has no database holding your registers.' },
      { q: 'Can we do it ourselves, or do we need a consultant?', a: 'Either. Self-serve is priced per framework with a 7-day free trial, and Checkpoint is included at no extra cost in a Compliance365 consulting engagement.' },
    ],
  },
  {
    slug: 'essential-eight-software',
    moduleId: 'essential8',
    name: 'Essential Eight',
    title: 'Essential Eight Compliance Software for Microsoft 365 | Checkpoint',
    description: 'Essential Eight software for Microsoft 365: each strategy assessed against ML1–ML3, measured from your tenant, with the uplift plan and evidence. From $7,000 a year, AUD.',
    h1: 'Essential Eight software, measured from your Microsoft 365',
    lead: 'Checkpoint assesses each of the eight mitigation strategies against the maturity level you are targeting, reads the settings Microsoft 365 already holds, and turns the gaps into an uplift plan with owners and evidence.',
    servicePath: 'services/essential-eight/',
    demoView: 'scan',
    demoLabel: 'Run the posture scan in the demo',
    covers: [
      'The eight strategies, assessed against the ACSC Essential Eight Maturity Model level by level (ML1 to ML3), against the target level you set, rather than as a flat checklist.',
      'Wording aligned to the November 2023 maturity model.',
      'Cross-mapping to ISO 27001, so a control you evidence once counts for both.',
      'An uplift plan of actions, owners and due dates, with evidence attached when each is done.',
    ],
    scan: 'The scan reads what Microsoft 365 can show for the strategies: multi-factor authentication, application control (WDAC), Office macro settings, operating system and application patching, administrative privileges (global admin count and PIM), and backups. Strategies Microsoft 365 cannot show are marked for a manual check, never guessed.',
    faq: [
      { q: 'Which maturity level should we target?', a: 'Most Australian organisations target Maturity Level Two. It is required for non-corporate Commonwealth entities and increasingly asked for in government supply chains. Checkpoint lets you set the target per organisation.' },
      { q: 'Does Checkpoint fix the settings for us?', a: 'No. It reads your settings and never changes them. Each gap becomes an action with the steps to fix it.' },
      { q: 'Do we need Microsoft 365 E5?', a: 'No. Checkpoint checks which Microsoft 365 features your licences include. A check that needs a licence you do not have shows as a manual check instead of failing.' },
    ],
  },
  {
    slug: 'soc-2-software',
    moduleId: 'soc2',
    name: 'SOC 2',
    title: 'SOC 2 Compliance Software for Australian SaaS | Checkpoint',
    description: 'SOC 2 readiness software for Australian SaaS on Microsoft 365: all Trust Services Criteria, live evidence, a Trust Center and questionnaire answers. From $8,999 a year, AUD.',
    h1: 'SOC 2 software for Australian SaaS on Microsoft 365',
    lead: 'Checkpoint carries the full set of Trust Services Criteria, evidences the security criteria from your Microsoft 365 tenant, and gives your sales team a Trust Center and ready answers to security questionnaires while you prepare for the audit.',
    servicePath: 'services/soc2/',
    demoView: 'trustcenter',
    demoLabel: 'See the Trust Center in the demo',
    covers: [
      'The Trust Services Criteria (2017, revised 2022): the Common Criteria plus Availability, Confidentiality, Processing Integrity and the full Privacy series.',
      'Cross-mapping to ISO 27001, so one programme can serve both.',
      'A Trust Center page and answers to customer security questionnaires, built from your own evidence.',
      'Risk register, policies, suppliers, incidents and access reviews in the same console.',
    ],
    scan: 'The Microsoft 365 scan evidences the access, change, monitoring and incident criteria from your tenant. Optional collectors add AWS (10 checks) and GitHub (7 checks), for SaaS teams that build there.',
    faq: [
      { q: 'Does Checkpoint issue the SOC 2 report?', a: 'No. A SOC 2 report is issued by a licensed CPA firm. Checkpoint prepares the controls and evidence the auditor tests.' },
      { q: 'Type I or Type II?', a: 'Both. Type II needs evidence across an observation period, and Checkpoint records the observation dates and keeps evidence dated throughout.' },
      { q: 'We host on AWS. Does that matter?', a: 'The optional AWS collector runs in your own AWS account and reports 10 checks to Checkpoint. Records still stay in your Microsoft 365 tenant.' },
    ],
  },
  {
    slug: 'iso-42001-software',
    moduleId: 'iso42001',
    name: 'ISO 42001',
    title: 'ISO 42001 AI Governance Software for Microsoft 365 | Checkpoint',
    description: 'ISO 42001 software for AI governance: the AI management system, Annex A controls, an AI systems register and impact assessments, in your own tenant. From $7,000 a year.',
    h1: 'ISO 42001 software for AI governance',
    lead: 'Checkpoint runs an ISO/IEC 42001 AI management system alongside your ISO 27001 one: an AI systems register, impact assessments and the Annex A controls, with the same risk register, audits and management reviews.',
    servicePath: 'services/iso42001/',
    demoView: 'aisystems',
    demoLabel: 'Open the AI systems register in the demo',
    covers: [
      'The ISO/IEC 42001:2023 Annex A control set: policies, resourcing, impact assessment, life cycle, data, disclosure, use and third-party relationships.',
      'Clauses 4–10 as requirement checklists, on the same clause register as ISO 27001.',
      'An AI systems register and an AI impact assessment procedure.',
      'AI-specific policies, kept separate from your information security documents.',
    ],
    scan: 'The scan flags high-privilege app grants in Microsoft Entra that nobody has reviewed, a common route for unapproved AI tools to reach your data.',
    faq: [
      { q: 'Do we need ISO 27001 first?', a: 'No, but most organisations pair them. Checkpoint runs both on one clause register and one risk register, so shared work is done once.' },
      { q: 'Is ISO 42001 certifiable?', a: 'Yes. ISO/IEC 42001 is a certifiable management system standard, audited by an accredited certification body.' },
      { q: 'Does it cover the EU AI Act?', a: 'Checkpoint does not run the EU AI Act as a framework. ISO 42001 is commonly used as the management system behind AI Act obligations; the free EU AI Act classifier on our ISO 42001 page helps you check where a system may fall.' },
    ],
  },
  {
    slug: 'iso-27701-privacy-software',
    moduleId: 'iso27701',
    name: 'ISO 27701',
    title: 'ISO 27701 Privacy Software for Microsoft 365 | Checkpoint',
    description: 'ISO 27701:2025 privacy software: a standalone PIMS with all 78 Annex A controls, Clauses 4–10 and Privacy Act mapping, in your own Microsoft 365. From $7,000 a year.',
    h1: 'ISO 27701 privacy software, in your own tenant',
    lead: 'Checkpoint runs ISO/IEC 27701:2025 as a privacy information management system in its own right, certifiable alone or alongside ISO 27001, with the personal information records kept where they already are: in your Microsoft 365.',
    servicePath: 'services/iso27701/',
    demoView: 'clauses',
    demoLabel: 'Open the clause register in the demo',
    covers: [
      'ISO/IEC 27701:2025 Clauses 4–10 plus all 78 Annex A controls: 31 for PII controllers, 18 for PII processors and 29 shared security controls, each mapped to its ISO 27001 counterpart.',
      'Privacy documents kept separate from your information security ones.',
      'The Australian Privacy Principles and Notifiable Data Breaches duties are also available as their own framework, mapped to ISO 27001.',
      'Breach notification drafts for the OAIC and affected individuals, from the incident record.',
    ],
    scan: 'The scan checks that subject rights requests are answered within the statutory deadline (with Microsoft Priva), and that retention and disposal labels are published.',
    faq: [
      { q: 'Can ISO 27701 be certified on its own now?', a: 'Yes. The 2025 edition is a standalone management system standard. Earlier editions could only be certified as an extension of ISO 27001.' },
      { q: 'Does it cover the Australian Privacy Act?', a: 'Checkpoint carries the Privacy Act (the 13 APPs and the Notifiable Data Breaches scheme, as amended in 2024) as a separate framework, mapped to ISO 27001. Ask us about adding it.' },
      { q: 'Where is personal information stored?', a: 'Checkpoint stores its registers as SharePoint lists in your tenant. It does not copy personal information to Compliance365.' },
    ],
  },
  {
    slug: 'nist-csf-software',
    moduleId: 'nistcsf',
    name: 'NIST CSF',
    title: 'NIST CSF 2.0 Compliance Software for Microsoft 365 | Checkpoint',
    description: 'NIST CSF 2.0 software for Microsoft 365: all 22 categories, optional subcategory depth, current and target profiles, mapped to ISO 27001. From $7,000 a year, AUD.',
    h1: 'NIST CSF 2.0 software, measured from your Microsoft 365',
    lead: 'Checkpoint runs the NIST Cybersecurity Framework 2.0 across Govern, Identify, Protect, Detect, Respond and Recover, measures what it can from your Microsoft 365 tenant, and maps the work to ISO 27001 and Essential Eight so nothing is done twice.',
    servicePath: 'services/nist-csf/',
    demoView: 'soa',
    demoLabel: 'Open the controls in the demo',
    covers: [
      'All 22 categories of NIST CSF 2.0 across its six functions.',
      'An optional switch to subcategory depth (106 subcategories) when you need it, without flooding a light-touch programme.',
      'Cross-mapping to ISO 27001 and Essential Eight.',
      'Board reporting: a posture trend, top risks and progress, from the same live records.',
    ],
    scan: 'The Microsoft 365 scan evidences Protect and Detect categories such as identity and access, data security, and continuous monitoring.',
    faq: [
      { q: 'Is NIST CSF a certification?', a: 'No. NIST CSF is a framework you assess yourself against; there is no certificate. Many boards use it to track cyber risk, and it pairs well with ISO 27001 if you later certify.' },
      { q: 'Version 1.1 or 2.0?', a: 'Version 2.0 (February 2024), including the Govern function.' },
      { q: 'Category or subcategory level?', a: 'Category level by default. Switch to subcategories in Settings when you need the detail.' },
    ],
  },
];
