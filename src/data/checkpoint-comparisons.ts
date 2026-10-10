// Comparison pages under /checkpoint-console/compare/<slug>/.
//
// Rules for anything said about another product:
//   - only what the vendor's own website (or Microsoft Learn) says, linked
//     in `sources`, and dated by CHECKED below;
//   - where we could not confirm something, say so ("check with …"),
//     never guess;
//   - say plainly when the other product is the better fit.
// Re-check every row before changing CHECKED.

export const CHECKED = 'October 2026';

export interface CompareRow { topic: string; them: string; us: string }
export interface Comparison {
  slug: string;
  name: string;              // "Vanta"
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
  pricing: 'Published: from $7,000 a year per framework (AUD, ex GST), SOC 2 from $8,999. Enterprise from $14,999.',
  trial: 'A public demo of the real console with sample data, no sign-up, and a 7-day free trial.',
  m365: '49 checks read from Microsoft Graph with delegated, read-only permissions.',
  au: 'Essential Eight, IS18, RFFR, CPS 234, DISP / IRAP and the Privacy Act, alongside ISO 27001, SOC 2, ISO 42001, ISO 27701 and NIST CSF.',
  people: 'Run it yourself, or get it at no extra cost in a fixed-price Compliance365 consulting engagement.',
};

export const comparisons: Comparison[] = [
  {
    slug: 'vanta-alternative',
    name: 'Vanta',
    title: 'Vanta Alternative for Microsoft 365 in Australia | Checkpoint',
    description: 'Checkpoint vs Vanta for Australian organisations on Microsoft 365: where your records live, published AUD pricing, Essential Eight and consulting support.',
    h1: 'Checkpoint vs Vanta',
    lead: 'Vanta is a widely used compliance automation platform with a large integration catalogue. Checkpoint is built for organisations that run on Microsoft 365 and want their compliance records to stay in their own tenant. Here is how they differ, from each vendor’s own published information.',
    rows: [
      { topic: 'Where your records live', them: 'In Vanta’s cloud platform. Vanta announced a Sydney data centre on AWS for ANZ customers in October 2024.', us: US.records },
      { topic: 'Pricing', them: 'Not published. The pricing page lists Essentials, Plus, Professional and Enterprise tiers and asks you to request a demo for a quote.', us: US.pricing },
      { topic: 'Trying it', them: 'Request a demo. Check with Vanta for current trial terms.', us: US.trial },
      { topic: 'Evidence from your systems', them: 'A large catalogue of integrations across cloud, identity, HR and developer tools.', us: US.m365 + ' Optional collectors for AWS (10 checks) and GitHub (7 checks). Fewer integrations than Vanta beyond these.' },
      { topic: 'Australian frameworks', them: 'Vanta lists Essential Eight (maturity levels 1–3) and CPS 234 among its frameworks.', us: US.au },
      { topic: 'People', them: 'Software. Your auditor is engaged separately.', us: US.people },
    ],
    chooseThem: [
      'Your evidence lives across many SaaS and cloud tools beyond Microsoft 365, and you want one platform that connects to all of them.',
      'You are happy for compliance records to sit in a vendor’s platform.',
    ],
    chooseUs: [
      'You run on Microsoft 365 and want risks, controls, evidence and the audit log to stay in your own tenant.',
      'You want to see the price before talking to sales, in Australian dollars.',
      'You want an Australian consultant who can take you through certification with the same tool.',
    ],
    sources: [
      { label: 'Vanta: Plans and pricing', url: 'https://www.vanta.com/pricing' },
      { label: 'Vanta: Accelerating ANZ momentum with a new Australian data centre', url: 'https://www.vanta.com/resources/accelerating-anz-momentum' },
      { label: 'Vanta: Essential Eight compliance automation', url: 'https://www.vanta.com/products/essential-eight' },
    ],
    faq: [
      { q: 'Does Vanta support Essential Eight?', a: 'Yes, Vanta lists Essential Eight maturity levels 1–3 on its website. Checkpoint does too, and also covers IS18, RFFR, CPS 234 and DISP / IRAP.' },
      { q: 'Can I move from Vanta to Checkpoint?', a: 'Yes. Checkpoint imports registers from Excel or CSV with a mapping and duplicate check, so risks, assets and suppliers come across without retyping.' },
      { q: 'Is Checkpoint cheaper than Vanta?', a: 'Vanta does not publish prices, so we cannot compare like for like. Checkpoint’s prices are on our pricing page: from $7,000 a year per framework, AUD.' },
    ],
  },
  {
    slug: 'drata-alternative',
    name: 'Drata',
    title: 'Drata Alternative for Microsoft 365 in Australia | Checkpoint',
    description: 'Checkpoint vs Drata for Australian organisations on Microsoft 365: records in your own tenant, published AUD pricing, Australian frameworks and consulting.',
    h1: 'Checkpoint vs Drata',
    lead: 'Drata is a compliance automation platform with plans for growing and enterprise organisations. Checkpoint keeps your compliance records in your own Microsoft 365 tenant, publishes its prices in Australian dollars, and covers the Australian frameworks. Here is how they differ, from each vendor’s own published information.',
    rows: [
      { topic: 'Where your records live', them: 'In Drata’s cloud platform. We could not find a published hosting region on Drata’s website; check with Drata.', us: US.records },
      { topic: 'Pricing', them: 'Not published. Plans are Foundation, Advanced and Enterprise; Foundation is listed for up to 50 staff and one pre-mapped framework.', us: US.pricing },
      { topic: 'Trying it', them: 'Request a demo.', us: US.trial },
      { topic: 'Evidence from your systems', them: 'A broad set of integrations across cloud, identity, HR and developer tools.', us: US.m365 + ' Optional collectors for AWS (10 checks) and GitHub (7 checks). Fewer integrations than Drata beyond these.' },
      { topic: 'Australian frameworks', them: 'Check Drata’s current framework list for Essential Eight, CPS 234 and IS18.', us: US.au },
      { topic: 'People', them: 'Software. Your auditor is engaged separately.', us: US.people },
    ],
    chooseThem: [
      'You need integrations with many tools outside Microsoft 365.',
      'You also need US frameworks such as HIPAA, which Drata lists and Checkpoint does not cover.',
    ],
    chooseUs: [
      'You run on Microsoft 365 and want your records in your own tenant, not a vendor’s.',
      'You need Australian frameworks such as Essential Eight, IS18, RFFR or CPS 234.',
      'You want published prices and the option of a consultant using the same tool.',
    ],
    sources: [
      { label: 'Drata: Plans', url: 'https://drata.com/plans' },
    ],
    faq: [
      { q: 'Is Checkpoint a GRC platform like Drata?', a: 'It does the same job of running the compliance programme and collecting evidence. The difference is where it runs: Checkpoint is a web app that stores everything in your own Microsoft 365, not in a vendor database.' },
      { q: 'Does Checkpoint work for SOC 2?', a: 'Yes. It carries the full Trust Services Criteria and prepares the evidence a CPA firm tests.' },
      { q: 'What if we are not on Microsoft 365?', a: 'Checkpoint needs Microsoft 365, because that is where it stores your records. If you are not on Microsoft 365, a platform like Drata is the better fit.' },
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
