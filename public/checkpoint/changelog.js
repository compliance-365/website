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
    version: '1.20.0',
    date: '2026-07-12',
    entries: [
      'Light "paper" theme, properly finished: a Settings toggle (Frameworks & Settings → Light theme) and the command palette both switch it, and the choice now persists to this tenant\'s Settings the same way every other preference does — demo mode already only ever saved that to this browser, so there\'s no separate code path needed.',
      'Every chart on the Dashboard (Compliance Fingerprint, Certification Journey, Assurance Pulse, Risk Landscape, the posture-score sparkline) now reads its colours from CSS custom properties instead of baked-in hex, so they re-theme instantly when the theme flips — no re-render needed. Audited and fixed every other hardcoded colour we could find in the live app\'s own markup along the way (the brand mark, the posture gauge, the light/dark toggle switch itself).',
      'Fixed a real contrast bug in the residual risk heatmap: its cell text used one fixed colour per severity, which measured as low as 1.96:1 for some risk-count/theme combinations — well under the WCAG AA minimum. Text colour is now computed from the cell\'s actual rendered colour, correct at every alpha level in both themes.',
      'Verified every status colour (pass/warn/fail, plus a new dedicated "critical" tone distinct from "high") against both theme backgrounds and retuned the ones that failed 4.5:1 on paper — same hue family, just legible. Reports keep their own fixed print palette regardless of which theme the app is in, as before.'
    ]
  },
  {
    version: '1.19.0',
    date: '2026-07-12',
    entries: [
      'Boardroom Mode, rebuilt: "Present" on the Board view (or the command palette) now opens a full-screen, auto-cycling six-slide deck for live QBRs — client fingerprint, posture trend, certification journey, top risks, action throughput and upcoming milestones — built from the exact same chart functions as the Dashboard and reports.',
      'Real fullscreen where the browser allows it, with an identical-looking maximised overlay as the fallback. 12-second auto-advance with a thin gold progress line; arrow keys, click, or the dot rail to navigate; Esc (or the exit button) to leave. Numbers count up fresh on every slide, and the cursor fades out after a couple of seconds of stillness — which also pauses the deck, since that\'s when a hand actually reaches for the mouse.',
      'Reduced-motion turns all of that off in favour of static slides and manual navigation only — no auto-advance, no count-ups.'
    ]
  },
  {
    version: '1.18.0',
    date: '2026-07-12',
    entries: [
      'New Assurance Pulse on the Dashboard: a 26-week activity strip — scans, evidence captured, attestations, reviews and audits — with a 4-step gold intensity ramp. Click any week to filter the Activity feed to it; the same chart now appears in the Management Review Pack.',
      'New Risk Landscape: an alternative view of the risk register — every open risk as a bubble on a likelihood × impact field, sized by residual score and coloured by band, with a thin gold trail showing how it\'s moved since roughly last quarter. Toggle between it and the classic 5×5 grid (the grid stays the default — auditors expect it). Click a bubble to open the same risk drawer as everywhere else.',
      'Both handle the edges honestly: 0 activity or 0 risks render a clean empty state, and a risk register over 50 open risks keeps the most severe ones as individual bubbles and rolls the rest into a single "+N" badge rather than drawing an unreadable pile.'
    ]
  },
  {
    version: '1.17.0',
    date: '2026-07-12',
    entries: [
      'New Compliance Fingerprint on the Dashboard: a radial gauge with one ring per control theme, arc length showing implementation %, an inner evidence-coverage ring, and a count-up centre readiness number. Switch frameworks with the tabs above it. The same visual now appears on report covers, and as a compact 60px glyph next to each client in the Partner Console.',
      'New Certification Journey, replacing the old static roadmap bar: a horizontal timeline built from your own real dates — engagement start, gap analysis, today\'s evidence coverage, next internal/external audit — plus a projected audit-ready date computed from your last 8 weeks of remediation velocity. If there isn\'t enough history yet, it says so honestly instead of guessing a date.',
      'The audit-ready projection is now recomputed and saved with every posture scan, so the Management Review Pack can chart whether it\'s trending closer or drifting out over time (new "Audit-ready projection drift" figure).',
      'Both new visuals share one tooltip on hover or keyboard focus, and follow your reduced-motion setting.'
    ]
  },
  {
    version: '1.16.0',
    date: '2026-07-12',
    entries: [
      'New Control Constellation: an interactive map of every applicable control across your entitled frameworks, arranged one arc per framework and grouped by theme, with the registry\'s own cross-framework mappings drawn as curved lines between them.',
      'Hover any control to see its whole mapped cluster light up across frameworks; click to pin it and open full detail (status, owner, evidence) in the same drawer used everywhere else. Filter by framework, or toggle "Size by evidence" to see at a glance which controls still need proof attached.',
      'A small live preview now sits on the Dashboard, linking straight through to the full view.'
    ]
  },
  {
    version: '1.15.0',
    date: '2026-07-12',
    entries: [
      'The topbar search is now a command palette (Ctrl/Cmd-K, or click the search box) — fuzzy-search risks, actions, controls, audits, reviews, calendar items and documents, or run a command: run a scan, generate any report, add a risk/action/audit/review/calendar item, jump to any view, export a register as CSV.',
      'Keyboard-first: arrow keys navigate, Enter runs the highlighted result, Esc closes, and matched characters are highlighted as you type. Recently-used commands appear first (remembered for this browser session only).',
      'New "Toggle light theme" and "Boardroom mode" commands — boardroom mode hides the sidebar/topbar and enlarges the Board view for presenting on a screen.'
    ]
  },
  {
    version: '1.14.0',
    date: '2026-07-12',
    entries: [
      'Design-system polish pass — same ink/charcoal/gold visual identity, tightened throughout: a canonical easing curve, a three-layer elevation scale, and a strict 11/13/15/20/26/34px type scale everywhere (with two documented exceptions: chip/label micro-type, and the posture-scan gauge/Board-view hero numbers).',
      'Every interactive element (buttons, nav items, filter pills, toggles, table rows, links, selects) now has a distinct hover, keyboard-focus, pressed and disabled state.',
      'KPI numbers count up on view entry, table rows reveal with a subtle stagger, and async lists (Documents, Partner Console sync, posture-scan checks) show a shimmer placeholder instead of plain "Loading…" text — all of it disabled for anyone with reduced-motion turned on.',
      'Empty tables (risks, actions, documents, audits, reviews, calendar, vendors, Partner Console) now show a small illustration, one sentence, and a button straight to the relevant "add" action instead of a bare line of text.',
      'Themed scrollbars, a consistent inline-icon set replacing the old text glyphs (flags, checkmarks, external-link arrows, trend arrows, close buttons), more breathing room in cards and section spacing, and a favicon that turns its gold dot red while this tenant has an open Critical residual risk.'
    ]
  },
  {
    version: '1.13.0',
    date: '2026-07-10',
    entries: [
      'New Compliance Copilot: a chat drawer grounded in your own scan results, SoA readiness, risks, actions, calendar and recent audits, with six starter questions. Chat history stays in the browser\'s memory only.',
      'New "Explain this" button on every posture check row — a plain-language explanation and remediation steps for that specific finding, cached per scan.',
      '"AI insight" on scan-proposed findings and a new "AI draft" button in the Risk register\'s Add-risk form draft a risk statement, likelihood/impact reasoning and treatment actions into the form for you to review and save — nothing is ever auto-saved.',
      '"Tailor with AI" in the template library drafts a client-context-tailored purpose/scope/policy text, which flows into the same DRAFT-watermarked document flow as any other generated policy.',
      'New Questionnaire assistant: paste questionnaire questions and get draft answers grounded in your SoA and latest scan, each with a confidence level and what to verify — exportable as its own AI-assisted report.',
      'New Mock auditor: generates 10 interview questions targeting your current gaps (unevidenced controls, failing checks, overdue actions) with honest model answers, including where the real answer is "we have a gap".',
      'Every AI-drafted risk/action/document that gets saved now records aiAssisted: true and who reviewed it. The AI assistant feature itself is registered in your AI Systems register, with a pre-drafted impact assessment, the first time it\'s enabled.'
    ]
  },
  {
    version: '1.12.0',
    date: '2026-07-10',
    entries: [
      'New AI assistant (purchasable add-on): a drafting aid — policy language, evidence descriptions, risk treatment notes, report commentary — grounded in your own registers. Runs against your own Azure OpenAI resource in your own tenant via Entra ID auth only; no API key ever touches the browser.',
      'Every response is labelled "AI-assisted draft — review before use", cites which register data it used, and is generated by a strictly text-in/text-out model with no Graph access and no tool/function calling.',
      'Only the register data you explicitly tick to include is ever sent, capped and truncated to a size budget with truncation always noted; every call is rate-limited to one at a time and audit-logged (who, feature, model deployment, when — never the prompt or response text).',
      'An optional "Enable AI" step in the onboarding wizard, and an "AI assistant not configured yet" card (never a broken button) until an endpoint, deployment and the entitlement are all in place — see AI-SETUP.md for provisioning the Azure OpenAI resource and the RBAC role assignment it needs.'
    ]
  },
  {
    version: '1.11.0',
    date: '2026-07-10',
    entries: [
      'New Partner Console: a client roster (status, licensed modules, colour-coded 30/60/90-day renewal flags, last-sync health), a licensed-vs-active module matrix, a renewals-next-90-days panel, and a per-client health drawer (last scan, posture score, readiness per framework, drift alerts) — all stored as SharePoint lists in our own tenant, gated on a \'partner\'-type activation.',
      'Syncing a client signs the practitioner into that client\'s own tenant separately (an isolated MSAL instance, never the shared session) and reads their live Checkpoint summary read-only — nothing is written back to their tenant.',
      'The old browser-local Portfolio view is folded into the Partner Console; any existing Portfolio client list is migrated in automatically on first load, then the app stops using localStorage for it.',
      'tools/issue-entitlement.mjs: an optional --record flag signs the practitioner in via device-code auth and appends the issuance to the Partner Console\'s register automatically; falls back to printing the row as JSON for manual entry if that fails.'
    ]
  },
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
