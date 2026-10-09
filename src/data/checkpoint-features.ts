// Feature pages under /checkpoint-console/features/. Every claim here is
// checked against the code in public/checkpoint/ (and POWER-AUTOMATE.md
// for the ticket flows); test/feature-pages.test.mjs pins the ones that
// are easiest to get wrong. `demoView` opens the demo on that screen
// (?demo=1&view=…, see app.js).

export interface FeatureSection { h: string; p?: string[]; list?: string[] }
export interface Feature {
  slug: string;
  name: string;
  title: string;
  description: string;
  lead: string;
  demoView: string;
  demoLabel: string;
  sections: FeatureSection[];
  faq: { q: string; a: string }[];
}

export const features: Feature[] = [
  {
    slug: 'ticket-sync',
    name: 'Ticket sync',
    title: 'Sync Checkpoint Actions with Planner, Jira and ServiceNow | Compliance365',
    description: 'Work Checkpoint actions as tickets in Planner, Jira or ServiceNow. Finished tickets close the action, with the ticket as evidence. No new permissions, no backend.',
    lead: 'Your engineers work in their ticketing tool. Checkpoint keeps the compliance record. Ticket sync joins the two, so a finished ticket closes the action it came from, with the ticket as the evidence.',
    demoView: 'actions',
    demoLabel: 'See linked tickets in the demo',
    sections: [
      {
        h: 'How it works',
        list: [
          'A Power Automate flow in your own tenant opens a ticket in Planner, Jira or ServiceNow for each new action, and records the link in a SharePoint list Checkpoint creates.',
          'A second, scheduled flow keeps each ticket’s status current. It works the same way for every tool and needs no webhook from it.',
          'Each action shows its ticket and status. When tickets are finished, the Actions register lists them, and one click completes each action, with the ticket recorded in its progress log and in the audit log.',
          'A cancelled ticket offers to close the action instead. A ticket reopened after its action was completed is flagged.',
          'No flow? Open an action and paste the ticket’s link and status by hand.',
        ],
      },
      {
        h: 'What it will not do',
        p: [
          'A nonconformity is never closed from a ticket. Checkpoint opens its corrective action record instead, because ISO 27001 Clause 10.2 still needs the root cause and a check that the fix worked, and a ticket status cannot supply either.',
          'Nothing changes an action without a person confirming it. The flow writes only to the ticket links list; Checkpoint reads it and proposes, and you decide.',
        ],
      },
      {
        h: 'What it needs',
        list: [
          'Power Automate in your Microsoft 365 tenant, with the connector for your tool. Planner uses a standard connector. ServiceNow uses a premium connector. Check your plan for the Jira connector.',
          'No new Microsoft permissions for Checkpoint, and no Compliance365 server. The flows run in your tenant, under your account.',
          'Step-by-step flow instructions come with Checkpoint.',
        ],
      },
    ],
    faq: [
      { q: 'Which ticketing tools are supported?', a: 'Planner, Jira and ServiceNow, through their Power Automate connectors. Any tool with a connector that can create a record and read its status can follow the same pattern.' },
      { q: 'Does Checkpoint connect to Jira or ServiceNow directly?', a: 'No. Your own Power Automate flow talks to the ticketing tool and writes the link and status to a SharePoint list in your tenant. Checkpoint only reads that list.' },
      { q: 'Can a ticket close a nonconformity?', a: 'No. A nonconformity needs its root cause and an effectiveness review recorded, so Checkpoint opens its corrective action record instead of closing it.' },
    ],
  },
  {
    slug: 'excel-word-exports',
    name: 'Excel and Word exports',
    title: 'Excel and Word Exports of Your SoA and Risk Register | Compliance365',
    description: 'Export Checkpoint registers to Excel with filterable headers, or the SoA, risk and asset registers to Word as controlled documents. Every export is audit-logged.',
    lead: 'Auditors, boards and customers still ask for files. Checkpoint exports its registers to Excel for analysis, and the Statement of Applicability, risk register and asset register to Word as controlled documents.',
    demoView: 'soa',
    demoLabel: 'Try the exports in the demo',
    sections: [
      {
        h: 'Excel',
        list: [
          'Risks, actions, controls (the Statement of Applicability), assets, suppliers, legal requirements and documents each export to a workbook.',
          'Settings exports every register into one workbook, a sheet per register.',
          'The header row is bold, frozen and filterable, and columns are sized to their content.',
          'Every value is written as text, so a cell that starts with "=" stays text and never runs as a formula.',
        ],
      },
      {
        h: 'Word',
        list: [
          'The Statement of Applicability (for the framework you have open), the risk register and the asset register.',
          'Landscape pages with a document control block, the table header repeated on every page, rows that do not split across pages, and "Page X of Y" in the footer.',
          'Built from the live register when you click, so it matches what Checkpoint shows.',
        ],
      },
      {
        h: 'Recorded',
        p: ['Every export is written to Checkpoint’s audit log with who exported what and when, so you can show an auditor which version of the register went to whom.'],
      },
    ],
    faq: [
      { q: 'Which registers export to Word?', a: 'The Statement of Applicability, the risk register and the asset register. Every main register exports to Excel.' },
      { q: 'Do the files need a Compliance365 service to create?', a: 'No. Checkpoint builds them in your browser and saves them to your device. Nothing is sent to Compliance365.' },
      { q: 'Can a formula in a register cell run when the workbook opens?', a: 'No. Values are written as text, so a value beginning with "=" is shown, not calculated.' },
    ],
  },
  {
    slug: 'approvals',
    name: 'Review and approval',
    title: 'Document Review and Approval Workflow for ISO 27001 | Compliance365',
    description: 'Drafts checked by a second person, approved by a third, and both names on the signed document. Risk acceptance recorded by the person accountable.',
    lead: 'In a larger organisation the person who writes a policy should not be the only one who checks it, and the person who accepts a risk should be the one accountable for it. Checkpoint records both, in your tenant.',
    demoView: 'documents',
    demoLabel: 'See the documents register in the demo',
    sections: [
      {
        h: 'Review before approval',
        list: [
          'In Settings → Approvals, choose which drafts need a second person’s review: none, the information security policy, every policy, or every generated document.',
          'The reviewer is asked through My tasks and, in your tenant, by email. They record "Reviewed" or "Changes requested" with comments.',
          'The person who prepared the draft cannot review it, and the reviewer cannot approve it.',
          'Any edit after the review ends it, so what is approved is what was reviewed.',
          'The review appears in the document history and on the sign-off table of the printed and Word copies, with the approver.',
        ],
      },
      {
        h: 'Risk acceptance by the person accountable',
        p: [
          'With the second setting on, accepting a residual risk sends a request to the person accepting it. They record the decision signed in as themselves, and the audit log shows who asked and who accepted.',
          'Segregation of duties (ISO 27001 A.5.3) can also be enforced, so nobody approves a document or accepts a risk they raised.',
        ],
      },
      {
        h: 'Proportionate',
        p: ['Both settings are off by default. A small organisation with one or two people running Checkpoint keeps a single approval step; a larger one turns on the steps it needs.'],
      },
    ],
    faq: [
      { q: 'Who can review a document?', a: 'Anyone except the person who prepared it. The reviewer then cannot be the approver, so a reviewed document involves at least three people when the setting is on.' },
      { q: 'What happens if the document is edited after it is reviewed?', a: 'The review no longer applies, and the document needs reviewing again before it can be approved.' },
      { q: 'Is the review recorded?', a: 'Yes. It is in Checkpoint’s audit log, the document history and the sign-off table of the approved document.' },
    ],
  },
];
