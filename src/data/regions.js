/**
 * regions.js
 * ==========
 * Copy for the international country pages on www.compliance365.io
 * (src/pages/[region]/index.astro). Services listed here are only ones
 * the site already offers and delivers remotely: ISO 27001, ISO 27701,
 * ISO 42001, SOC 2 readiness, Cyber Essentials readiness, and the
 * Checkpoint software. Local laws and schemes appear as context ("what
 * buyers here ask for" and how the ISO work maps onto them), never as a
 * service we certify against.
 *
 * Each region page links to the existing .com.au service pages.
 * US spelling on the US page, British spelling on the UK and UAE pages.
 */

export const REGION_COPY = {
  us: {
    title: 'SOC 2 & ISO 27001 for US Companies | Compliance365',
    description: 'SOC 2 readiness, ISO 27001 and ISO 42001 for US companies, delivered remotely inside your own Microsoft 365. Fixed price, no GRC platform licence.',
    eyebrow: 'United States · Delivered remotely',
    h1: 'SOC 2, ISO 27001 and AI governance,',
    h1em: 'inside the Microsoft 365 you already run.',
    lead: 'We get US companies through SOC 2 and ISO 27001 without another platform to buy: the controls, the evidence and the reports live in your own Microsoft 365 tenant, on Checkpoint, our compliance software.',
    asks: [
      { h: 'SOC 2 from enterprise buyers', p: 'US enterprise security reviews usually ask for a SOC 2 report. We get you ready for Type I and the Type II observation period. The report itself is issued by an independent CPA firm, which you engage directly.' },
      { h: 'ISO 27001 from global customers', p: 'Customers outside the US, and many inside it, ask for ISO 27001 instead. One control set can evidence both, so the second costs a fraction of the first.' },
      { h: 'AI governance in vendor questionnaires', p: 'Questionnaires now ask how you govern AI features and the data behind them. ISO 42001 gives you a certifiable answer on top of the same management system.' },
      { h: 'NIST CSF as the common language', p: 'Boards, investors and cyber insurers often describe maturity in NIST CSF terms. It is a profile, not a certificate, and maps onto ISO 27001 work you already have.' },
    ],
    services: [
      { name: 'SOC 2 readiness', href: 'services/soc2/', p: 'Scope, controls and evidence for Type I and Type II, coordinated with your CPA firm.' },
      { name: 'ISO 27001', href: 'services/iso27001/', p: 'A certifiable information security management system, built in your tenant.' },
      { name: 'ISO 42001', href: 'services/iso42001/', p: 'AI management system: inventory, impact assessments and oversight.' },
      { name: 'ISO 27701', href: 'services/iso27701/', p: 'Privacy management on the same evidence base as your ISMS.' },
    ],
  },
  uk: {
    title: 'ISO 27001 & Cyber Essentials in the UK | Compliance365',
    description: 'ISO 27001, Cyber Essentials readiness and ISO 27701 for UK organisations, delivered remotely inside your own Microsoft 365. Fixed price, no GRC licence.',
    eyebrow: 'United Kingdom · Delivered remotely',
    h1: 'ISO 27001 and Cyber Essentials,',
    h1em: 'evidenced from your own Microsoft 365.',
    lead: 'We prepare UK organisations for ISO 27001 and Cyber Essentials using the Microsoft 365 you already run. Controls, evidence and audit reports stay in your tenant, on Checkpoint, our compliance software.',
    asks: [
      { h: 'Cyber Essentials for public sector work', p: 'The NCSC-backed scheme is required for many UK government contracts. We prepare you from your live Microsoft 365 configuration; certification is issued by an IASME-licensed Certification Body you choose.' },
      { h: 'ISO 27001 from enterprise and public sector buyers', p: 'Larger customers ask for ISO 27001, and public sector buyers on frameworks such as G-Cloud often look for it. The Cyber Essentials controls are largely covered by the same work, so one programme serves both.' },
      { h: 'UK GDPR and the Data Protection Act 2018', p: 'ISO 27701 documents how you handle personal data, on the same evidence as the ISMS, and maps closely onto UK GDPR accountability requirements.' },
      { h: 'AI governance in procurement', p: 'Buyers increasingly ask how AI features are governed. ISO 42001 gives you a certifiable answer that sits on the same management system.' },
    ],
    services: [
      { name: 'ISO 27001', href: 'services/iso27001/', p: 'A certifiable information security management system, built in your tenant.' },
      { name: 'Cyber Essentials readiness', href: 'resources/cyber-essentials-readiness/', p: 'Readiness evidenced from your Microsoft 365 configuration, for Cyber Essentials or Plus.' },
      { name: 'ISO 27701', href: 'services/iso27701/', p: 'Privacy information management aligned to UK GDPR.' },
      { name: 'ISO 42001', href: 'services/iso42001/', p: 'AI management system: inventory, impact assessments and oversight.' },
    ],
  },
  ae: {
    title: 'ISO 27001 & ISO 42001 in the UAE | Compliance365',
    description: 'ISO 27001, ISO 27701 and ISO 42001 for UAE organisations, delivered remotely in your own Microsoft 365, with your data kept in your tenant. Fixed price.',
    eyebrow: 'United Arab Emirates · Delivered remotely',
    h1: 'ISO 27001, privacy and AI governance,',
    h1em: 'with your data kept in your own tenant.',
    lead: 'We build ISO 27001, ISO 27701 and ISO 42001 programmes for UAE organisations inside the Microsoft 365 you already run. Registers and evidence never leave your tenant, which matters when buyers ask where your compliance data lives.',
    asks: [
      { h: 'ISO 27001 in government and enterprise tenders', p: 'ISO 27001 certification is a common requirement in UAE procurement, and the most widely recognised way to evidence an information security programme to buyers in the region.' },
      { h: 'Local information security rules', p: 'Dubai’s DESC Information Security Regulation and the UAE Information Assurance Standard apply to government entities and their suppliers. Much of what they ask for overlaps with an ISO 27001 management system, which is the foundation we build.' },
      { h: 'Data protection: PDPL, DIFC and ADGM', p: 'The federal Personal Data Protection Law and the DIFC and ADGM data protection regimes all expect documented, accountable handling of personal data. ISO 27701 provides that on the same evidence as the ISMS.' },
      { h: 'AI governance', p: 'As AI adoption grows, buyers ask how it is governed. ISO 42001 is the certifiable management system standard for AI, built on the same foundation.' },
    ],
    services: [
      { name: 'ISO 27001', href: 'services/iso27001/', p: 'A certifiable information security management system, built in your tenant.' },
      { name: 'ISO 27701', href: 'services/iso27701/', p: 'Privacy information management on the same evidence base.' },
      { name: 'ISO 42001', href: 'services/iso42001/', p: 'AI management system: inventory, impact assessments and oversight.' },
      { name: 'Integrated ISO 27001 + 27701 + 42001', href: 'services/integrated-iso/', p: 'All three as one management system, with one internal audit.' },
    ],
  },
};

export const HOW = [
  { h: 'Remote by design', p: 'Workshops run over Microsoft Teams and the evidence is collected from your tenant, so there is no travel and no site visit to schedule.' },
  { h: 'In your Microsoft 365', p: 'Registers are SharePoint lists in your own tenant and posture checks read your live configuration. No third-party GRC platform holds your data.' },
  { h: 'Senior and fixed price', p: 'A senior practitioner from start to finish, on a fixed price agreed before we start, paid in milestones as the work is delivered.' },
];
