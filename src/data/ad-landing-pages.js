/* Paid-search landing pages (/lp/<slug>/).

   One entry per Google Ads campaign. These pages are noindex and left out
   of the sitemap: the service pages under /services/ are the ones that
   rank organically, and these exist only to convert ad clicks. Every
   number here is taken from the matching service page's FAQ — change it
   there first, then here, so the ad and the site never disagree.

   Checkpoint licence prices and the consulting day rate are read from
   pricing.js (the same source as /pricing/), never typed in here. Each
   page with a `module` shows all three ways to buy: Checkpoint on its
   own, Checkpoint plus consulting days, and the fixed-price engagement,
   so a small team clicking an ad sees the entry price, not only the
   fully managed one. */

import { MODULES, CONSULTING_DAY_RATE, TRIAL_DAYS, fmtAud } from './pricing.js';

const licenceFrom = (id) => fmtAud(MODULES.find((m) => m.id === id).prices.micro);
export { CONSULTING_DAY_RATE, TRIAL_DAYS, fmtAud, licenceFrom };

export const BOOKING_URL = 'https://outlook.office.com/book/Compliance3652@compliance365.com.au/?ismsaljsauthenabled';

export const AD_LANDING_PAGES = [
  {
    slug: 'iso27001',
    framework: 'ISO 27001',
    module: 'iso27001',
    title: 'ISO 27001 Consultants Australia — Fixed Price | Compliance365',
    description: `ISO 27001 inside your Microsoft 365: run it yourself on Checkpoint from ${licenceFrom('iso27001')} a year, or let us deliver it at a fixed price. 100% first-time pass rate.`,
    eyebrow: 'ISO 27001 certification · Australia',
    h1: 'ISO 27001 certified in 10–14 weeks. <em>Fixed price.</em>',
    lead: 'Your ISMS, built inside the Microsoft 365 you already pay for — no Vanta, Drata or extra GRC licence. Run it yourself on Checkpoint, our compliance software, add expert days where you want them, or have our senior consultants deliver it for a fixed price. We have not had a client fail their certification audit.',
    trust: [`Starting from ${licenceFrom('iso27001')} a year`, '10–14 weeks to audit-ready', '100% first-time pass rate', '$0 third-party platform fees'],
    outcomes: [
      { h: 'Win the tender that asked for it', p: 'Enterprise and government buyers increasingly require ISO 27001 before they will sign. Get the certificate on a date you can commit to in your bid.' },
      { h: 'No new tool to buy or learn', p: 'Evidence lives in SharePoint; controls are enforced with Entra, Intune, Defender and Purview. Your team keeps working where it already works.' },
      { h: 'Cheaper every year after', p: 'Because evidence is maintained continuously, surveillance audits in years 2 and 3 take hours of preparation, not weeks.' },
    ],
    steps: [
      { h: 'Gap assessment', p: 'Where you are against ISO 27001 and Annex A, and a fixed quote for the rest.' },
      { h: 'ISMS build', p: 'Scope, risk assessment, Statement of Applicability and policies — written for your organisation.' },
      { h: 'Controls & evidence', p: 'Controls implemented in Microsoft 365 and evidence collected as you go.' },
      { h: 'Internal audit & certification', p: 'A dress rehearsal two weeks before the external audit, then support through Stage 1 and Stage 2.' },
    ],
    price: {
      managed: '$25k',
      managedDetail: 'For under 50 staff, scaled by staff numbers and scope. Includes gap assessment, ISMS build, controls, evidence pack, internal audit and certification audit support.',
      note: 'Certification body fees (typically $8k–$25k) are paid directly to your auditor whichever option you choose.',
    },
    caseStudy: { slug: 'fintech-startup', label: 'FinTech startup: ISO 27001 certified in 12 weeks' },
    faqs: [
      { q: 'How long does ISO 27001 certification take?', a: 'For most Australian organisations with 50–500 staff, 10–14 weeks from kickoff to certificate. Smaller, focused scopes can finish in 8 weeks; enterprise environments typically take 14–20.' },
      { q: 'Can we do it ourselves?', a: `Yes. Checkpoint, our compliance software, runs inside your own Microsoft 365 and guides your team through the ISMS build, evidence and audit preparation. It is ${licenceFrom('iso27001')} a year for under 50 staff, with a ${TRIAL_DAYS}-day free trial. We usually recommend adding 2–4 consulting days for the risk workshop and internal audit.` },
      { q: 'Do we need to buy a GRC platform?', a: 'No. Everything runs inside your existing Microsoft 365 on Checkpoint, our own console, which is included in every fixed-price engagement and runs in your tenant.' },
      { q: 'How much of our team’s time does it take?', a: 'Your nominated internal contact typically spends 2–4 hours a week during implementation.' },
      { q: 'Can we add SOC 2 or Essential Eight at the same time?', a: 'Yes. One set of controls and evidence can cover ISO 27001, SOC 2 Type II and Essential Eight ML2, typically 30–40% cheaper than doing each separately.' },
    ],
    servicePage: 'services/iso27001/',
  },
  {
    slug: 'iso42001',
    framework: 'ISO 42001',
    module: 'iso42001',
    title: 'ISO 42001 AI Governance Consultants Australia | Compliance365',
    description: `ISO 42001 AI management system inside your Microsoft 365: on Checkpoint from ${licenceFrom('iso42001')} a year, or delivered at a fixed price in 8–12 weeks.`,
    eyebrow: 'ISO 42001 AI governance · Australia',
    h1: 'AI governance your customers will accept. <em>In 8–12 weeks.</em>',
    lead: 'Enterprise procurement teams and cyber insurers now ask how you govern AI, including Copilot, ChatGPT and the models in your product. An ISO 42001 AI management system inside your Microsoft 365 answers them. Run it yourself on Checkpoint, or have us build it for a fixed price.',
    trust: [`Starting from ${licenceFrom('iso42001')} a year`, '8–12 weeks', '30–40% less if you hold ISO 27001', 'Certification optional'],
    outcomes: [
      { h: 'Answer AI questionnaires with evidence', p: 'An AI inventory, risk and impact assessments, and human oversight records you can hand to a buyer instead of a promise.' },
      { h: 'Find the AI you didn’t know you had', p: 'A structured inventory of every AI system in use, including third-party tools and shadow AI, tiered by actual risk.' },
      { h: 'Ready for the EU AI Act', p: 'If you sell to EU customers, ISO 42001 is the fastest way to show readiness before high-risk obligations apply in December 2027.' },
    ],
    steps: [
      { h: 'AI inventory', p: 'Every AI system you build, buy or embed, with an owner and a risk tier.' },
      { h: 'Risk & impact assessment', p: 'Proportionate to the real risk of each use case, not a blanket template.' },
      { h: 'Policy & oversight', p: 'AI policy, roles, human oversight and monitoring built in SharePoint, Purview and Power Automate.' },
      { h: 'Internal audit or certification', p: 'Run it as internal governance, or take it to an accredited certification body.' },
    ],
    price: {
      managed: '$18k',
      managedDetail: 'For under 50 staff, scaled by staff numbers and the AI systems in scope. Typically 30–40% less if you already hold ISO 27001, because the management system is shared.',
      note: 'Certification body fees, if you choose to certify, are paid directly to your auditor.',
    },
    caseStudy: { slug: 'healthtech-integrated-isms-aims-pims', label: 'Healthcare technology: ISO 42001 added to an existing ISMS' },
    faqs: [
      { q: 'Can we do it ourselves?', a: `Yes. Checkpoint guides your team through the AI inventory, risk assessments and policies inside your own Microsoft 365. It is ${licenceFrom('iso42001')} a year for under 50 staff, with a ${TRIAL_DAYS}-day free trial, and you can book expert days for the impact workshop.` },
      { q: 'Do we need formal certification?', a: 'No. ISO 42001 can run as an internal governance framework and still satisfy enterprise procurement. We build whichever path fits.' },
      { q: 'Does it cover tools like Microsoft Copilot and OpenAI?', a: 'Yes. It applies to AI you develop, AI you buy, and AI embedded in your products. Your vendor owns the model; you own the use case and its oversight.' },
      { q: 'Do we need a new AI governance platform?', a: 'No. We implement it inside your existing Microsoft 365, on Checkpoint, our own console, included in the engagement.' },
      { q: 'Can it sit alongside ISO 27001 and ISO 27701?', a: 'Yes. All three share the same structure, so policy, risk, evidence and audit are shared. Combined engagements are typically 30–40% cheaper.' },
    ],
    servicePage: 'services/iso42001/',
  },
  {
    slug: 'essential-eight',
    framework: 'Essential Eight',
    module: 'essential8',
    title: 'Essential Eight Assessment & ML2 Uplift Australia | Compliance365',
    description: `Essential Eight on the Microsoft 365 tools you already own: track maturity on Checkpoint from ${licenceFrom('essential8')} a year, or a fixed-price assessment in 2–3 weeks.`,
    eyebrow: 'Essential Eight · Maturity Level 2',
    h1: 'Essential Eight ML2, <em>evidenced for your insurer and your customers.</em>',
    lead: 'Know your real maturity in 2–3 weeks, then reach Maturity Level 2 in 12–16 weeks. On Microsoft 365 E5, roughly 80–85% of the ML2 technical controls are already in licences you pay for. We configure them, roll them out safely and assemble the evidence.',
    trust: [`Starting from ${licenceFrom('essential8')} a year`, 'Assessment in 2–3 weeks', 'ML2 uplift in 12–16 weeks', 'ASD-mapped evidence'],
    outcomes: [
      { h: 'Meet insurer and tender requirements', p: 'ML2 is increasingly a condition of cyber cover and a line item in government and enterprise procurement questionnaires.' },
      { h: 'Use what you already license', p: 'Intune, Defender for Endpoint, Entra ID P2 and Defender Vulnerability Management cover most of ML2 on E5.' },
      { h: 'Evidence that survives scrutiny', p: 'Every evidence pack is mapped to ASD’s ML2 criteria and reviewed internally before sign-off.' },
    ],
    steps: [
      { h: 'Assessment', p: 'Maturity against all eight strategies, with an ASD-mapped report and a prioritised roadmap.' },
      { h: 'Configuration uplift', p: 'Controls configured in Microsoft 365 to your target maturity level.' },
      { h: 'Ring-based rollout', p: 'Changes tested on a pilot group before broad deployment, so nothing breaks.' },
      { h: 'Evidence pack', p: 'Drift detection and an evidence pack ready for an assessor, insurer or customer.' },
    ],
    price: {
      managed: '$22k',
      managedDetail: 'ML2 uplift for under 50 staff, scaled by staff numbers and estate. A standalone assessment with an ASD-mapped report and roadmap starts from $8k.',
      note: 'Combined Essential Eight and ISO 27001 engagements typically cost 30–40% less than running them separately.',
    },
    caseStudy: { slug: 'health-saas-iso27701', label: 'Health SaaS: zero to Essential Eight ML2 in 10 weeks' },
    faqs: [
      { q: 'Can we track it ourselves?', a: `Yes. Checkpoint scans your Microsoft 365 tenant against the Essential Eight and keeps the evidence up to date. It is ${licenceFrom('essential8')} a year for under 50 staff, with a ${TRIAL_DAYS}-day free trial.` },
      { q: 'What maturity level should we target?', a: 'ML2 is ASD’s recommended baseline for most organisations and the level insurers and procurement panels usually ask for. ML3 suits high-risk, Commonwealth and defence-adjacent environments.' },
      { q: 'Is the Essential Eight mandatory?', a: 'It is mandatory for non-corporate Commonwealth entities under the PSPF. For private organisations it is not law, but insurers, government buyers and enterprise customers increasingly require it.' },
      { q: 'Do we need new tools?', a: 'On Microsoft 365 E5, usually only third-party Microsoft 365 backup. On E3, some extra licensing may be needed depending on scope; the assessment tells you exactly what.' },
      { q: 'What about ASD’s new “Essentials” series?', a: 'ASD has said existing Essential Eight investment carries over. We track the transition so your programme doesn’t need rework.' },
    ],
    servicePage: 'services/essential-eight/',
  },
  {
    slug: 'is18',
    framework: 'IS18',
    title: 'IS18 Compliance for Queensland Government & Suppliers | Compliance365',
    description: 'IS18 gap assessment in 3–4 weeks for Queensland Government agencies and their ICT suppliers. ISO 27001-aligned ISMS, Essential Eight and the annual return.',
    eyebrow: 'IS18 · Queensland Government',
    h1: 'IS18 for Queensland agencies and suppliers. <em>Gap assessment in 3–4 weeks.</em>',
    lead: 'IS18 requires an ISO 27001-aligned ISMS, Essential Eight maturity reporting, QGISCF classification and an annual return by 30 September, and suppliers inherit those obligations through contracts and panels. We are a Brisbane-based team, and the data stays in your own Microsoft 365 tenant.',
    trust: ['Brisbane-based', 'Gap assessment in 3–4 weeks', 'Full programme 8–16 weeks', 'Data stays in your tenant'],
    outcomes: [
      { h: 'A defensible annual return', p: 'Registers that already show your posture, so the 30 September return is a report, not a scramble.' },
      { h: 'Reuse what you have', p: 'A genuine ISO 27001 programme covers roughly 60–70% of IS18. We map it across so only the Queensland-specific work gets done.' },
      { h: 'Supplier-ready evidence', p: 'Suppliers handling OFFICIAL: Sensitive or PROTECTED information get the IS18 compliance statement and evidence that contracts and panels ask for.' },
    ],
    steps: [
      { h: 'Gap assessment', p: 'Every IS18 pillar assessed, with a costed remediation roadmap, in 3–4 weeks.' },
      { h: 'ISMS & classification', p: 'ISO 27001-aligned ISMS documentation and QGISCF information classification.' },
      { h: 'Essential Eight uplift', p: 'Each strategy assessed and uplifted toward your endorsed target, typically ML2.' },
      { h: 'Annual return', p: 'An evidence-backed annual information security return for the accountable officer to sign.' },
    ],
    price: {
      scoped: true,
      managed: 'Scoped and fixed-price',
      managedDetail: 'Government work is scoped to your agency or contract, the systems in scope and the assurance you need before anything is quoted. The scoping call is free.',
    },
    caseStudy: { slug: 'gov-qld-is18', label: 'Queensland Government agency: IS18 assurance report in 4 weeks, readiness 48% → 82%' },
    faqs: [
      { q: 'Does IS18 apply to suppliers, or only agencies?', a: 'Both. It binds Queensland Government departments directly and reaches ICT suppliers through contract schedules, standing offers and panel requirements.' },
      { q: 'Where does our data go?', a: 'Nowhere but your own Microsoft 365 tenant. Our Checkpoint console has no backend or vendor database; every register is a SharePoint list you own.' },
      { q: 'We already have ISO 27001. How much is left?', a: 'Roughly 30–40%: QGISCF classification, Essential Eight maturity reporting, incident reporting to the Cyber Security Unit, breach notification and the annual return.' },
      { q: 'How long does a full programme take?', a: 'Typically 8–16 weeks depending on current maturity and estate size. Organisations with an existing ISO 27001 or ASD-aligned programme move faster.' },
    ],
    servicePage: 'services/is18/',
  },
];
