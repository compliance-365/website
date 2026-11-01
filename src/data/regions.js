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
 * Each region page links to the existing .com.au service pages. Guide
 * hrefs starting with / are pages on .io itself (src/data/site.js INTL_GUIDES).
 * US spelling on the US page, British spelling on the UK and UAE pages.
 */

export const REGION_COPY = {
  /* US and UK copy tuned to Search Console queries (3 months to
     1 Nov 2026): US impressions came from ISO 42001 on Microsoft, ISO
     27001 SoA how-tos and automating Azure/AVD compliance checks, not
     SOC 2; UK impressions from automating Cyber Essentials in Microsoft
     365 and "ISO 27001 vs 27701". */
  us: {
    title: 'ISO 42001, 27001 & SOC 2 on Microsoft 365 | Compliance365',
    description: 'Implement ISO 42001 and ISO 27001 on Microsoft 365, and get SOC 2 ready, without a GRC platform. Delivered remotely for US companies, at a fixed price.',
    eyebrow: 'United States · Delivered remotely',
    h1: 'ISO 42001, ISO 27001 and SOC 2,',
    h1em: 'implemented on the Microsoft 365 you already run.',
    lead: 'We implement AI governance and information security for US companies inside their own Microsoft 365 tenant: the controls, the evidence and the reports live in SharePoint, on Checkpoint, our compliance software. No GRC platform to buy.',
    asks: [
      { h: 'ISO 42001, implemented on Microsoft', p: 'Your AI inventory, impact assessments and oversight records sit next to the Microsoft 365, Entra and Defender data they describe, so the AI management system is evidenced from the tenant rather than rebuilt in a separate tool.' },
      { h: 'An ISO 27001 Statement of Applicability you can defend', p: 'Every Annex A control with its justification, owner, status and a link to its evidence, with the technical controls checked against your live tenant configuration.' },
      { h: 'SOC 2 from enterprise buyers', p: 'US enterprise security reviews usually ask for a SOC 2 report. We get you ready for Type I and the Type II observation period. The report itself is issued by an independent CPA firm, which you engage directly.' },
      { h: 'Compliance checks that run themselves', p: 'Posture checks read your Microsoft 365 and Azure configuration, and an optional scheduled monitor flags drift, so evidence stays current between audits instead of being gathered the week before.' },
    ],
    services: [
      { name: 'ISO 42001', href: 'services/iso42001/', p: 'AI management system: inventory, impact assessments and oversight.' },
      { name: 'ISO 27001', href: 'services/iso27001/', p: 'A certifiable information security management system, built in your tenant.' },
      { name: 'SOC 2 readiness', href: 'services/soc2/', p: 'Scope, controls and evidence for Type I and Type II, coordinated with your CPA firm.' },
      { name: 'ISO 27701', href: 'services/iso27701/', p: 'Privacy management on the same evidence base as your ISMS.' },
    ],
    guides: [
      { name: 'ISO 42001 on Microsoft 365 and Azure', href: '/us/iso-42001-microsoft/' },
      { name: 'Inside a Statement of Applicability', href: 'resources/inside-statement-of-applicability/' },
      { name: 'Automating compliance in Microsoft 365, Azure and AWS', href: 'resources/automating-compliance/' },
      { name: 'ISO 42001 vs NIST AI RMF vs the EU AI Act', href: 'resources/iso42001-vs-nist-ai-rmf-eu-ai-act/' },
    ],
  },
  uk: {
    title: 'Automate Cyber Essentials & ISO 27001 on Microsoft 365',
    description: 'Cyber Essentials readiness and ISO 27001 automated from your own Microsoft 365, plus ISO 27701 for UK GDPR. Delivered remotely, at a fixed price.',
    eyebrow: 'United Kingdom · Delivered remotely',
    h1: 'Cyber Essentials and ISO 27001,',
    h1em: 'checked automatically in your own Microsoft 365.',
    lead: 'Most Cyber Essentials and ISO 27001 controls are settings in Microsoft 365. We check them against your live tenant, fix what fails, and keep the evidence in your SharePoint, on Checkpoint, our compliance software.',
    asks: [
      { h: 'Cyber Essentials, checked from your tenant', p: 'Posture checks read your Microsoft 365 and Intune configuration against the scheme\u2019s technical controls, so you know what passes before you submit. Certification is issued by an IASME-licensed Certification Body you choose.' },
      { h: 'ISO 27001 from enterprise and public sector buyers', p: 'Larger customers ask for ISO 27001, and public sector buyers on frameworks such as G-Cloud often look for it. The Cyber Essentials controls are largely covered by the same work, so one programme serves both.' },
      { h: 'ISO 27001 or ISO 27701?', p: 'ISO 27001 is the information security management system. ISO 27701 adds privacy management on top, and can be certified on its own since its 2025 edition. Most organisations build ISO 27701 on an ISO 27001 ISMS, because the management system and many records are shared, and together they cover UK GDPR accountability.' },
      { h: 'AI governance in procurement', p: 'Buyers increasingly ask how AI features are governed. ISO 42001 gives you a certifiable answer that sits on the same management system.' },
    ],
    services: [
      { name: 'Cyber Essentials readiness', href: 'resources/cyber-essentials-readiness/', p: 'Readiness evidenced from your Microsoft 365 configuration, for Cyber Essentials or Plus.' },
      { name: 'ISO 27001', href: 'services/iso27001/', p: 'A certifiable information security management system, built in your tenant.' },
      { name: 'ISO 27701', href: 'services/iso27701/', p: 'Privacy information management aligned to UK GDPR.' },
      { name: 'ISO 42001', href: 'services/iso42001/', p: 'AI management system: inventory, impact assessments and oversight.' },
    ],
    guides: [
      { name: 'Cyber Essentials on Microsoft 365, control by control', href: '/uk/cyber-essentials-microsoft-365/' },
      { name: 'Free Cyber Essentials readiness checker', href: '/uk/cyber-essentials-checker/' },
      { name: 'ISO 27001 vs ISO 27701: the difference', href: 'blog/iso-27001-vs-iso-27701-australia/' },
      { name: 'Free readiness checklists', href: 'checklist/' },
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
