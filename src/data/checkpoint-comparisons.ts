// Comparison pages under /checkpoint-console/compare/<slug>/.
//
// Rules for anything said about another product:
//   - only what the vendor's own website (or Microsoft Learn) says, linked
//     in `sources`, and dated by CHECKED below;
//   - where we could not confirm something, say so ("check with …"),
//     never guess;
//   - say plainly when the other product is the better fit.
// Re-check every row before changing CHECKED.

import { MODULES, ENTERPRISE, fmtAud } from './pricing.js';

const fromPrice = (id: string) => fmtAud(MODULES.find((m) => m.id === id)!.prices.micro);

export const CHECKED = 'October 2026';

export interface CompareRow { topic: string; them: string; us: string }
export interface Comparison {
  slug: string;
  name: string;              // "GRC platforms"
  title: string;
  description: string;
  h1: string;
  lead: string;
  rows: CompareRow[];
  chooseThem: string[];
  chooseUs: string[];
  sources: { label: string; url: string }[];
  faq: { q: string; a: string }[];
}

const US = {
  records: 'SharePoint lists in your own Microsoft 365 tenant. Compliance365 has no database holding your registers.',
  pricing: `Published: from ${fromPrice('iso27001')} a year per framework (AUD, ex GST), SOC 2 from ${fromPrice('soc2')}. Enterprise from ${fmtAud(ENTERPRISE.startingPrice)}.`,
  trial: 'A public demo of the real console with sample data, no sign-up, and a 7-day free trial.',
  m365: '52 checks read from Microsoft Graph with delegated, read-only permissions.',
  au: 'Essential Eight, IS18, RFFR, CPS 234, DISP / IRAP and the Privacy Act, alongside ISO 27001, SOC 2, ISO 42001, ISO 27701 and NIST CSF.',
  people: 'Run it yourself, or get it at no extra cost in a fixed-price Compliance365 consulting engagement.',
};

export const comparisons: Comparison[] = [
  {
    slug: 'grc-platforms',
    name: 'GRC platforms',
    title: 'Checkpoint vs GRC Platforms for Microsoft 365 in Australia | Checkpoint',
    description: 'Checkpoint compared with third-party GRC and compliance automation platforms, for Australian organisations on Microsoft 365: where records live, pricing, frameworks and consulting.',
    h1: 'Checkpoint vs third-party GRC platforms',
    lead: 'Third-party GRC and compliance automation platforms run your compliance programme in the vendor’s own cloud, usually with a large catalogue of integrations. Checkpoint is built for organisations that run on Microsoft 365 and want their compliance records to stay in their own tenant. Here is how the approaches differ. Products vary, so check the details with any platform you are considering.',
    rows: [
      { topic: 'Where your records live', them: 'In the vendor’s cloud platform. Hosting regions vary; ask where your data will be held.', us: US.records },
      { topic: 'Pricing', them: 'Often not published, with tiers quoted after a demo. Ask for the price over a full three-year certification cycle.', us: US.pricing },
      { topic: 'Trying it', them: 'Usually a demo with the vendor’s sales team.', us: US.trial },
      { topic: 'Evidence from your systems', them: 'Often a large catalogue of integrations across cloud, identity, HR and developer tools.', us: US.m365 + ' Optional collectors for AWS (10 checks) and GitHub (8 checks). Fewer integrations than the larger platforms beyond these.' },
      { topic: 'Australian frameworks', them: 'Varies by platform. Check the current framework list for Essential Eight, IS18, RFFR, CPS 234 and DISP / IRAP.', us: US.au },
      { topic: 'People', them: 'Software. Your consultant and auditor are engaged separately.', us: US.people },
    ],
    chooseThem: [
      'Your evidence lives across many SaaS and cloud tools beyond Microsoft 365, and you want one platform that connects to all of them.',
      'You are not on Microsoft 365. Checkpoint stores its records there, so it needs a Microsoft 365 tenant.',
      'You need frameworks Checkpoint does not cover, such as HIPAA.',
    ],
    chooseUs: [
      'You run on Microsoft 365 and want risks, controls, evidence and the audit log to stay in your own tenant.',
      'You need Australian frameworks such as Essential Eight, IS18, RFFR or CPS 234.',
      'You want to see the price before talking to sales, in Australian dollars.',
      'You want an Australian consultant who can take you through certification with the same tool.',
    ],
    sources: [],
    faq: [
      { q: 'Is Checkpoint a GRC platform?', a: 'It does the same job of running the compliance programme and collecting evidence. The difference is where it runs: Checkpoint is a web app that stores everything in your own Microsoft 365, not in a vendor database.' },
      { q: 'Can I move from another GRC platform to Checkpoint?', a: 'Yes. Checkpoint imports registers from Excel or CSV with a mapping and duplicate check, so risks, assets and suppliers come across without retyping.' },
      { q: 'What if we are not on Microsoft 365?', a: 'Checkpoint needs Microsoft 365, because that is where it stores your records. If you are not on Microsoft 365, a third-party GRC platform is the better fit.' },
    ],
  },
  {
    slug: 'microsoft-purview-compliance-manager',
    name: 'Microsoft Purview Compliance Manager',
    title: 'Checkpoint vs Microsoft Purview Compliance Manager',
    description: 'How Checkpoint and Microsoft Purview Compliance Manager differ for ISO 27001 and Essential Eight: templates and licensing, the management system, and audit packs.',
    h1: 'Checkpoint vs Microsoft Purview Compliance Manager',
    lead: 'Compliance Manager is part of Microsoft Purview and scores your tenant against regulation templates. Checkpoint runs the whole management system that a certification audit looks at. Many organisations use both. Here is how they differ.',
    rows: [
      { topic: 'What it is', them: 'An assessment tool in the Microsoft Purview portal: regulation templates, a compliance score and improvement actions.', us: 'A compliance console that runs the management system: risk register, Statement of Applicability, clauses, internal audit, management review, policies and audit packs.' },
      { topic: 'Licensing', them: 'Most regulation templates are premium and need a licence. Microsoft 365 E5 / A5 / G5 include three premium templates. Microsoft offers a 90-day premium trial.', us: US.pricing },
      { topic: 'ISO 27001 and Essential Eight', them: 'Premium templates are available for ISO/IEC 27001 and for Essential Eight at each maturity level.', us: 'All 93 ISO 27001 Annex A controls with Clauses 4–10, and Essential Eight assessed per strategy against your target maturity level.' },
      { topic: 'Where records live', them: 'In your Microsoft Purview tenant.', us: US.records },
      { topic: 'Certification audit', them: 'Tracks improvement actions against a template. It does not keep the risk register, Statement of Applicability, internal audit or management review records an ISO auditor asks for.', us: 'Produces them, and gives your auditor time-boxed, read-only access.' },
    ],
    chooseThem: [
      'You only need a technical score against a regulation, not a certifiable management system.',
      'You already have E5 and the template you need is one of your three included ones.',
    ],
    chooseUs: [
      'You are going for ISO 27001, ISO 42001 or ISO 27701 certification and need the full management system.',
      'You want risks, policies and audits in the same place as the technical evidence.',
    ],
    sources: [
      { label: 'Microsoft Learn: Compliance Manager FAQ (licensing and premium templates)', url: 'https://learn.microsoft.com/en-us/purview/compliance-manager-faq' },
      { label: 'Microsoft Learn: Compliance Manager regulations list', url: 'https://learn.microsoft.com/en-us/purview/compliance-manager-regulations-list' },
      { label: 'Microsoft Learn: Free trial of premium assessments', url: 'https://learn.microsoft.com/en-us/purview/purview-compliance-manager-assessments-trial' },
    ],
    faq: [
      { q: 'Can we use both?', a: 'Yes. Compliance Manager scores your tenant’s settings; Checkpoint runs the management system around them. Checkpoint reads its evidence straight from Microsoft Graph, so it does not depend on Compliance Manager.' },
      { q: 'Does Checkpoint need Microsoft 365 E5?', a: 'No. It checks which features your licences include, and a check that needs a licence you do not have shows as a manual check.' },
    ],
  },
  {
    slug: 'spreadsheets',
    name: 'spreadsheets',
    title: 'ISO 27001 in Spreadsheets vs Compliance Software | Checkpoint',
    description: 'Running ISO 27001 or Essential Eight in Excel works until the audit. What spreadsheets miss, and what Checkpoint adds while keeping records in your own Microsoft 365.',
    h1: 'Checkpoint vs running it in spreadsheets',
    lead: 'Plenty of organisations get certified with Excel and SharePoint folders. It works, until evidence goes stale, a control owner leaves, or the auditor asks who approved what and when. Checkpoint keeps the same records in the same place, your Microsoft 365, and does the chasing.',
    rows: [
      { topic: 'Where records live', them: 'Excel workbooks in SharePoint or OneDrive.', us: 'SharePoint lists in the same tenant, with every change in an audit log.' },
      { topic: 'Technical evidence', them: 'Screenshots, refreshed by hand before each audit.', us: US.m365 + ' Every scan is kept as dated evidence.' },
      { topic: 'Keeping it current', them: 'Someone remembers to check.', us: 'Owner reminders, evidence expiry dates and a weekly digest.' },
      { topic: 'Sign-off', them: 'An email or a signature on a PDF.', us: 'Recorded review and approval, with names and dates on the exported document.' },
      { topic: 'Cost', them: 'No licence, but the hours add up.', us: US.pricing },
    ],
    chooseThem: [
      'You have one small scope, a person with time to keep it current, and no customer asking for evidence between audits.',
    ],
    chooseUs: [
      'More than one person owns controls, or you are adding a second framework.',
      'Customers send security questionnaires and you answer the same questions each time.',
      'You want to keep using Excel and Word for exports, without them being the system of record.',
    ],
    sources: [],
    faq: [
      { q: 'Can we import our existing spreadsheets?', a: 'Yes. Checkpoint imports risks, assets, suppliers and other registers from Excel or CSV, with a column mapping, a preview and a duplicate check.' },
      { q: 'Can we still get Excel and Word out?', a: 'Yes. Registers export to Excel, and the Statement of Applicability, risk register and asset register export to Word as controlled documents.' },
    ],
  },
];
