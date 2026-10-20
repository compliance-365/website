/* Paid-search landing pages (/lp/<slug>/).

   One entry per Google Ads campaign. These pages are noindex and left out
   of the sitemap: the service pages under /services/ are the ones that
   rank organically, and these exist only to convert ad clicks. Every
   number here is taken from the matching service page's FAQ — change it
   there first, then here, so the ad and the site never disagree. */

export const BOOKING_URL = 'https://outlook.office.com/book/Compliance3652@compliance365.com.au/?ismsaljsauthenabled';

export const AD_LANDING_PAGES = [
  {
    slug: 'iso27001',
    framework: 'ISO 27001',
    title: 'ISO 27001 Consultants Australia — Fixed Price | Compliance365',
    description: 'Fixed-price ISO 27001 certification inside your Microsoft 365. Audit-ready in 10–14 weeks, 100% first-time pass rate. Free 30-minute scoping call.',
    eyebrow: 'ISO 27001 certification · Australia',
    h1: 'ISO 27001 certified in 10–14 weeks. <em>Fixed price.</em>',
    lead: 'Senior consultants build your ISMS inside the Microsoft 365 you already pay for — no Vanta, Drata or extra GRC licence. We take you from gap assessment to certificate, and we have not had a client fail their certification audit.',
    trust: ['10–14 weeks to audit-ready', 'Fixed price from $25k', '100% first-time pass rate', '$0 third-party platform fees'],
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
      headline: '$25k – $130k fixed price',
      detail: 'Scaled by staff numbers and scope, from under 50 staff to 500+. Includes gap assessment, ISMS build, controls, evidence pack, internal audit and certification audit support. Certification body fees (typically $8k–$25k) are paid directly to your auditor.',
    },
    caseStudy: { slug: 'fintech-startup', label: 'FinTech startup: ISO 27001 certified in 12 weeks' },
    faqs: [
      { q: 'How long does ISO 27001 certification take?', a: 'For most Australian organisations with 50–500 staff, 10–14 weeks from kickoff to certificate. Smaller, focused scopes can finish in 8 weeks; enterprise environments typically take 14–20.' },
      { q: 'Do we need to buy a GRC platform?', a: 'No. We deliver inside your existing Microsoft 365 on Checkpoint, our own console, which is included in the engagement and runs in your tenant.' },
      { q: 'How much of our team’s time does it take?', a: 'Your nominated internal contact typically spends 2–4 hours a week during implementation.' },
      { q: 'Can we add SOC 2 or Essential Eight at the same time?', a: 'Yes. One set of controls and evidence can cover ISO 27001, SOC 2 Type II and Essential Eight ML2, typically 30–40% cheaper than doing each separately.' },
    ],
    servicePage: 'services/iso27001/',
  },
  {
    slug: 'iso42001',
    framework: 'ISO 42001',
    title: 'ISO 42001 AI Governance Consultants Australia | Compliance365',
    description: 'Fixed-price ISO 42001 AI management system in 8–12 weeks, built inside your Microsoft 365. Ready for enterprise AI questionnaires and the EU AI Act.',
    eyebrow: 'ISO 42001 AI governance · Australia',
    h1: 'AI governance your customers will accept. <em>In 8–12 weeks.</em>',
    lead: 'Enterprise procurement teams and cyber insurers now ask how you govern AI, including Copilot, ChatGPT and the models in your product. We build an ISO 42001 AI management system inside your Microsoft 365 that answers them, at a fixed price.',
    trust: ['8–12 weeks', 'Fixed price from $18k', '30–40% less if you hold ISO 27001', 'Certification optional'],
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
      headline: '$18k – $100k fixed price',
      detail: 'Scaled by staff numbers and the AI systems in scope. Organisations already certified to ISO 27001 typically pay 30–40% less because the management system is shared. Certification body fees, if you certify, are paid directly to your auditor.',
    },
    caseStudy: { slug: 'healthtech-integrated-isms-aims-pims', label: 'Healthcare technology: ISO 42001 added to an existing ISMS' },
    faqs: [
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
    title: 'Essential Eight Assessment & ML2 Uplift Australia | Compliance365',
    description: 'Fixed-price Essential Eight assessment in 2–3 weeks, and ML2 uplift in 12–16 weeks using the Microsoft 365 tools you already own.',
    eyebrow: 'Essential Eight · Maturity Level 2',
    h1: 'Essential Eight ML2, <em>evidenced for your insurer and your customers.</em>',
    lead: 'Know your real maturity in 2–3 weeks, then reach Maturity Level 2 in 12–16 weeks. On Microsoft 365 E5, roughly 80–85% of the ML2 technical controls are already in licences you pay for. We configure them, roll them out safely and assemble the evidence.',
    trust: ['Assessment in 2–3 weeks', 'Assessment from $8k', 'ML2 uplift in 12–16 weeks', 'ASD-mapped evidence'],
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
      headline: 'Assessment $8k – $18k · ML2 uplift $22k – $120k',
      detail: 'Both fixed price, scaled by staff numbers and estate. Combined Essential Eight and ISO 27001 engagements typically cost 30–40% less than running them separately.',
    },
    caseStudy: { slug: 'health-saas-iso27701', label: 'Health SaaS: zero to Essential Eight ML2 in 10 weeks' },
    faqs: [
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
      headline: 'Scoped and fixed-price',
      detail: 'Government work is scoped to your agency or contract, the systems in scope and the assurance you need before anything is quoted. The scoping call is free.',
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
