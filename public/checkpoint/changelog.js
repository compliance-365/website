/* Checkpoint's "What's new" changelog — window.CHECKPOINT_CHANGELOG,
   newest first. Each entry: { version, date (YYYY-MM-DD), entries: [...] }.
   Grouped into meaningful releases rather than one line per commit —
   dozens of individual commits land between these entries; this file
   is curated by hand to say what changed for a practitioner using the
   app, not a raw commit log. Read by app.js: the sidebar footer shows
   window.CHECKPOINT_VERSION (version.js) as the current version, and a
   one-time toast/panel appears when Settings' lastSeenVersion is older
   than CHANGELOG[0].version — see the "what's new" section in app.js. */
window.CHECKPOINT_CHANGELOG = [
  {
    version: '1.10.0',
    date: '2026-07-10',
    entries: [
      'Trial tenants now see a "Trial — N days remaining" banner while a sales-trial activation is active, then the same standard read-only behaviour as any other tenant once it lapses.'
    ]
  },
  {
    version: '1.9.1',
    date: '2026-07-10',
    entries: [
      'Fixed: the sidebar navigation was unusable on mobile — it now opens as a proper slide-in drawer (hamburger button, backdrop, Escape/tap-outside to close) below 860px wide, instead of collapsing into a broken, nearly full-screen-tall strip.',
      'Every register table now scrolls within its own card on a narrow screen rather than widening the whole page, and "+ Add" forms drop to a single column on mobile.'
    ]
  },
  {
    version: '1.9.0',
    date: '2026-07-10',
    entries: [
      'ACCEPTANCE.md: a scripted, click-by-click pre-pilot test plan covering onboarding through recertification, plus negative tests for a wrong-tenant or expired activation, the Viewer role, and under-licensed tenant coverage messaging.',
      'A hidden self-test diagnostics view (?selftest=1, demo mode only) regression-checks registry integrity, scoring math, entitlement verification and the report charts between releases — now wired into CI too.'
    ]
  },
  {
    version: '1.8.0',
    date: '2026-07-10',
    entries: [
      'Every report now opens with a visual dashboard page: a readiness donut, posture score trend, control status by theme/category, a residual-risk heatmap, an evidence-coverage gauge and a KPI strip — pure inline SVG, no charting library.',
      'The Audit Readiness Report shows all six charts; the Executive Summary gets a board-ready one-page KPI/donut/trend/heatmap view; Management Review adds an action-throughput-by-month chart.',
      'Charts degrade honestly with sparse data — an "insufficient history" placeholder instead of a broken axis for a brand-new tenant with no scans or risks yet.'
    ]
  },
  {
    version: '1.7.0',
    date: '2026-07-10',
    entries: [
      'Every audit report now runs through one shared report engine: a cover page, document control table, table of contents, executive dashboard, methodology appendix and sign-off block on all five report types.',
      'Cover pages carry a configurable classification marking (defaults to "Commercial in Confidence"; set it to "OFFICIAL: Sensitive" for a defence client) and an optional client logo, set from Frameworks & Settings.',
      'Reports now print correctly as multi-page PDFs — repeating header/footer with page numbers, tables that never split mid-row, and an "Export PDF" button that names the saved file after the client, report and date.',
      'Report versions auto-increment per report type per client, and every report generation is written to the audit log.'
    ]
  },
  {
    version: '1.6.0',
    date: '2026-07-09',
    entries: [
      'Every premium framework (SOC 2, ISO 27701, ISO 42001, Essential Eight, DISP/IRAP, NIST CSF) now ships as an encrypted content pack rather than in the app bundle — an unlicensed copy of Checkpoint has zero paid content, not just a disabled toggle.',
      'A licensed tenant\'s activation file carries the decryption key for exactly its purchased modules; packs are fetched, verified and decrypted entirely in the browser and never written to storage.',
      'Demo mode now shows a small illustrative slice of every premium framework\'s real controls, so a prospect can explore each framework\'s structure without the app ever shipping the full paid registry.'
    ]
  },
  {
    version: '1.5.0',
    date: '2026-07-09',
    entries: [
      'Signed entitlement files replace the old self-service framework toggle for real tenants — Compliance365 issues an Ed25519-signed file per client, verified entirely in the browser.',
      'CSV export on every register, plus a one-click "export all" zip — a portable flat-file copy alongside the client\'s own SharePoint lists.',
      'A lightweight Practitioner/Viewer role model: read-only sessions land on the Board view with every mutating control disabled, enforced by the client\'s own SharePoint permissions.',
      'Opt-in email digests — overdue actions, upcoming items, drift alerts and readiness, sent on demand or nudged from the Dashboard when one is due.',
      'A policy template library in Documents — ten starter policies, personalised and generated as a draft document with one-click evidence linking.',
      'An implementation guidance panel on every Statement of Applicability control — how to implement it, what an auditor expects, a link to the relevant admin portal.',
      'A capability detection pass so posture checks are honest about what\'s licensed in this tenant, instead of surfacing a raw permissions error.',
      'A first-run onboarding wizard replaces the old cold start for new tenants.'
    ]
  },
  {
    version: '1.4.0',
    date: '2026-07-09',
    entries: [
      'SOC 2 expanded to the full 2017 (2022) Trust Services Criteria, ISO 27701 to the full Annex A/B control set.',
      'Essential Eight rebuilt around the ACSC maturity-level model (ML1-ML3 per strategy).',
      'DISP/IRAP rebuilt as a membership-level model; NIST CSF gained an optional 106-subcategory depth on top of the default 22 categories.'
    ]
  },
  {
    version: '1.3.0',
    date: '2026-07-08',
    entries: [
      'Trust Center and Auditor Pack — both generated in-tenant, no backend.',
      'AI Governance module (ISO 42001), Vendor risk register, and Shared evidence view.',
      'Live scans now auto-capture timestamped, hashed evidence.',
      'Optional continuous posture monitoring via an Azure Function, for tenants that want scans to keep running unattended.',
      'Security hardening: fixed two stored-XSS issues, vendored MSAL locally, added a Content-Security-Policy, moved to sessionStorage + redirect auth, incremental consent so sign-in only ever asks for what a feature actually needs when it\'s first used.',
      'An append-only audit log.'
    ]
  },
  {
    version: '1.2.0',
    date: '2026-07-08',
    entries: [
      'Board view — a live, presentation-ready summary for stakeholders.',
      'Compliance calendar for recurring ISMS activities, global search across every register, and email status updates via Graph.'
    ]
  },
  {
    version: '1.1.0',
    date: '2026-07-07',
    entries: [
      'All seven frameworks now available (ISO 27001, ISO 42001, SOC 2, ISO 27701, Essential Eight, DISP/IRAP, NIST CSF), each with a full control set.',
      'Posture scan expanded from 10 to 22 checks spanning every framework area; audit readiness report expanded to match.',
      'Internal audit programme, management review register, a document library, and a scan-cadence reminder.',
      'Per-client configurable posture-check thresholds, and a Features panel to switch optional Dashboard/workflow additions on or off.'
    ]
  },
  {
    version: '1.0.0',
    date: '2026-07-06',
    entries: [
      'Checkpoint launches: a deployable compliance console that runs entirely inside a client\'s own Microsoft 365 tenant, no backend of its own.',
      'ISO 27001 and ISO 42001 (entitlement-gated) at launch.'
    ]
  }
];
