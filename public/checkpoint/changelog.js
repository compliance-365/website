/* Checkpoint's "What's new" changelog — window.CHECKPOINT_CHANGELOG,
   newest first. Each entry: { version, date (YYYY-MM-DD), entries: [...] }.
   Grouped into meaningful releases rather than one line per commit —
   dozens of individual commits land between these entries; this file
   is curated by hand to say what changed for a practitioner using the
   app, not a raw commit log. Read by app.js: the sidebar footer shows
   window.CHECKPOINT_VERSION (version.js, build-injected from
   public/checkpoint/VERSION) as the current version, and a one-time
   toast fires whenever that differs from Settings' lastSeenVersion —
   see checkForNewVersion() in app.js. This file's own version field is
   for display only; keep it and VERSION in step by hand on every
   release, since nothing enforces that automatically. */
window.CHECKPOINT_CHANGELOG = [
  {
    version: '1.54.0',
    date: '2026-09-05',
    entries: [
      'Redesigned: the Dashboard now has a hierarchy. It used to open with six equal-weight KPI tiles — the posture score rendered at exactly the same size as "exclusions missing justification" — followed by three screens of identically-styled cards with nothing marking one as more important than the next. The posture score is now a hero tile at the top, sitting beside "Next 3 actions", so the two questions this view is actually opened to answer are both above the fold; the remaining KPIs sit below it as a single compact strip.',
      'Everything below is grouped under two labelled sections: "Position" (compliance fingerprint, certification journey, residual risk, posture trend) and "Operations" (continuous monitoring, assurance pulse, cross-framework mapping, governance, activity). Three low-density full-width strips are now paired into two-column rows.',
      'Fixed: the "High / critical residual risks" tile stayed gold no matter how many were open, so the worst number on the strip read as the calmest one. It now uses the same alert colour the overdue-actions, overdue-reviews and missing-justification tiles already did.'
    ]
  },
  {
    version: '1.53.0',
    date: '2026-09-05',
    entries: [
      'Redesigned: "Control Constellation" is now "Cross-framework mapping" (Risk & posture). The old radial network graph looked distinctive but hid its entire point — which controls also satisfy another framework — behind hovering individual unlabeled dots one at a time, and showed zero visible links at all for a tenant with only one framework entitled. It\'s now a plain, ranked table: every control across your entitled frameworks, sorted so the highest-leverage not-yet-implemented work (controls that satisfy the most other frameworks) surfaces at the top with no interaction required, with an "Also satisfies" column naming exactly what else each one evidences. Click a control\'s title to open the same guidance drawer every other control view already uses.',
      'The Dashboard\'s Constellation preview is similarly replaced with a short list of the highest-leverage controls still to do, rather than a tiny inert copy of the old graph.'
    ]
  },
  {
    version: '1.52.0',
    date: '2026-09-05',
    entries: [
      'New: Threat intel (Risk & posture). A filtered, tagged slice of CISA\'s Known Exploited Vulnerabilities catalog — narrowed to vendors an ordinary Microsoft 365-centric IT estate is actually likely to run, so it stays a few-second scan rather than an unreadable feed of thousands of entries. Re-sorted in your browser against this organisation\'s declared industry and a short, self-ticked technology checklist, so the entries most likely to matter surface first. Off by default until the feed endpoint is deployed and configured (see lambda/DEPLOY-THREAT-INTEL.md); nothing about a tenant\'s industry or stack is ever sent anywhere — the re-sorting happens entirely client-side.',
      'Demo mode shows a small sample of real, historical advisories (clearly labelled) rather than a live feed, so the view previews meaningfully without a network call.'
    ]
  },
  {
    version: '1.51.0',
    date: '2026-09-03',
    entries: [
      'Reliability: every Microsoft Graph call — interactive scans, SharePoint writes, and the scheduled monitor\'s own unattended runs — now retries automatically when Graph throttles it (429) or is briefly unavailable (503/504), honouring the server\'s own Retry-After header. A busy posture scan on a large tenant used to be exactly the workload most likely to get throttled, which previously surfaced as checks silently degrading to "Manual" or the whole scan failing outright.',
      'New (internal): client-side error reporting. When something genuinely goes wrong in the browser app, a short, anonymised report — the error and its context, never any tenant posture/risk/compliance data — now reaches Compliance365, visible in the owner console\'s new Errors tab. Off by default until the reporting endpoint is deployed and configured (see lambda/DEPLOY-ERROR-REPORTING.md); nothing changes for a tenant that hasn\'t enabled it.'
    ]
  },
  {
    version: '1.50.0',
    date: '2026-09-03',
    entries: [
      'New: owner-driven evidence, for tenants running the optional scheduled monitor. When the monitor emails an overdue action\'s owner (Owner email field on the action), the email now carries a personal link that lets them record progress or attach evidence directly — no Checkpoint sign-in, no Microsoft 365 permission consent. Everyone in a tenant could technically sign into the full app via Entra, but that would mean handing out the same broad, sensitive Graph scopes this whole tool works hard to keep narrow, on top of a licensing model built around one practitioner seat. A short-lived, signed link scoped to exactly one action gets the same outcome — the owner reports on their own work directly — without any of that.',
      'The link is deliberately narrow: an owner can mark their action "In progress" or "Done" with a note and/or an evidence link, and nothing else — never reopen or cancel a finding, never touch its title, owner, priority, due date or control. A submission is recorded exactly like a practitioner\'s own "Complete action" flow, with its provenance clearly marked in the audit trail.',
      'Needs no new Microsoft Graph permission and no new admin consent — it reuses the monitor\'s existing SharePoint write access. Nothing to configure: the link-signing key generates itself at deployment.'
    ]
  },
  {
    version: '1.49.0',
    date: '2026-09-03',
    entries: [
      'New: the Posture scan view now proposes closing findings whose underlying check has since started passing, right below where it proposes new ones. A risk raised from an earlier scan — say, a failed backup-restore test — that now scores pass gets a "Ready to close" card naming the check and every still-open action it will mark done; approving closes both in one step, with the usual evidence-log entry against each action. Nothing closes on its own — this only surfaces the candidates, same as every other write in Checkpoint.',
      '"Not yet" dismisses a proposal without closing anything, and won\'t re-nag on the next scan — but only for as long as the check keeps passing. If it ever regresses back to fail or review, the dismissal is cleared automatically, since a "not yet" about the current pass state shouldn\'t silently cover some different, later pass state.'
    ]
  },
  {
    version: '1.48.0',
    date: '2026-09-03',
    entries: [
      'New: an in-app guided setup for the continuous-monitoring Azure Function, replacing the Dashboard\'s old "see SETUP.md" pointer. The panel fills in what Checkpoint already knows — tenant ID, SharePoint hostname, site path, list prefix, and the resolved Graph site ID — and builds the exact Sites.Selected grant request a tenant admin runs once from Graph Explorer, with a copy button on every value. The thirteen application permissions to add are listed with a copy-all button instead of a markdown table to retype by hand.',
      'The six deployment steps are tracked as a checklist that remembers your progress in this browser, so leaving and coming back doesn\'t lose your place. The last step — verify — ticks itself the moment an automated scan is actually recorded, since that\'s the one step Checkpoint can observe directly rather than take your word for.',
      'This does not add a true one-click deploy: the Azure Portal\'s "Deploy to Azure" button has no supported way to pre-fill individual parameter values from a URL, only a much heavier marketplace-style package could do that, and Checkpoint never sees the client secret you create in step 1 regardless. What changed is real friction removed, not a shortcut around Azure\'s own deployment form.'
    ]
  },
  {
    version: '1.47.0',
    date: '2026-09-03',
    entries: [
      'New: "Next 3 actions" card on the Dashboard. Every other view leaves the same question unanswered once your action register has a dozen open items — which ones actually matter right now. This ranks your open actions by whether they clear a check that is currently failing or flagged for review, ahead of priority label or due date alone, and says so in plain language rather than a projected score.'
    ]
  },
  {
    version: '1.46.0',
    date: '2026-09-02',
    entries: [
      'New: three more automated posture checks, all mining data the app already fetches for other checks — no new Graph scope, no licence gate. A.5.3 (segregation of duties) flags an Entra ID Privileged Role Administrator who also holds another directory role — the one conflict that is a risk regardless of how the rest of a tenant\'s roles are organised. A.5.23 (cloud service governance) reads whether a Conditional Access policy applies Defender for Cloud Apps session control.',
      'A.5.35 (independent review), A.5.27 (learning from incidents) and A.5.28 (evidence collection) are now scored for real from Checkpoint\'s own Audits and Incidents registers, joining backup/BCP/supplier/policy as checks that work on every tenant with no licence gate at all. A completed internal audit within cadence, and a closed incident with a recorded root cause and lessons learned, are exactly the evidence these controls ask for.',
      'The ten AWS posture checks (the optional collector a client deploys into their own AWS account) are now mapped to the ISO 27001 controls they demonstrate, so a tenant running it sees those checks count toward Statement of Applicability coverage instead of sitting unmapped.',
      'Risk treatment renamed to ISO 27005\'s four Ts — Treat, Tolerate, Transfer, Terminate — replacing Mitigate/Accept/Transfer/Avoid, each option with a short worked example (Transfer\'s covers handing risk to a third party). Existing risk records saved under the old names still display correctly; every new save uses the new terms.',
      'The Actions register\'s priority-breakdown chart is colour-coded by criticality, including the bar itself for a priority that is entirely still Open, not just its label.',
      'The Actions register table is trimmed to fit a normal screen without horizontal scrolling — each row keeps only the Complete action inline; Edit and Delete moved into the drawer, alongside everything else a row\'s buttons used to duplicate.'
    ]
  },
  {
    version: '1.45.0',
    date: '2026-08-30',
    entries: [
      'New: "Departed accounts fully offboarded" — the first automated signal for the joiner-mover-leaver controls (A.5.11, A.5.18, A.6.5), which were entirely self-reported before. Checkpoint has no HR feed and cannot know who left, but it can see the end state of an offboarding, and the two halves of that state say very different things.',
      'A disabled account still holding a privileged directory role fails. There is no legitimate reason to leave a departed administrator\'s role assignment in place — re-enabling the account restores that privilege instantly, and the assignment itself is what an auditor tests.',
      'A disabled account still holding a paid licence is flagged for review, never failed. Plenty of organisations deliberately keep a leaver licensed for a retention period — legal hold, or handing the mailbox to a manager — and that is good practice, not a gap. Microsoft does not record when an account was disabled, so a deliberate 30-day retention and a two-year-old forgotten offboarding look identical from the outside. Reporting either as a failure would be guessing, so you get the list to confirm instead.',
      'Needs no new permission and no premium licence — it reads plain directory data under scopes every tenant already granted, so unlike the Defender and Purview checks this one works at every licence level.'
    ]
  },
  {
    version: '1.44.0',
    date: '2026-08-29',
    entries: [
      'New: privacy checks. Subject rights requests (Microsoft Priva) and retention & disposal labels (Microsoft Purview) are now scanned. Every privacy obligation in Checkpoint was previously self-reported, so ISO 27701 and Privacy Act controls could only ever be asserted — these are the first automated privacy signals the tool has had.',
      'Subject rights requests is the one check here with a statutory clock: the Privacy Act gives 30 days to respond, GDPR gives a month. Priva records a due date per request, so the check scores against your own recorded deadline rather than assuming a jurisdiction. A request past its due date fails — that is a live breach, not housekeeping — and one due within seven days shows as a review, so the warning arrives before the deadline rather than after it.',
      'Retention is scored on whether labels are published and actually dispose of anything. Labels with no end-of-retention action show as a review: retention with no disposal keeps content forever, which fails the deletion half of A.8.10 and APP 11.2 just as surely as having no labels at all fails the retention half.',
      'The alerts check now reads the Defender XDR alert queue directly where Defender XDR is present, instead of matching names against Secure Score. It falls back to the old signal where it is not, so no tenant loses coverage. Alerts are scored on ones nobody has opened rather than on volume — a busy queue that is being worked is not a compliance failure.',
      'Both privacy checks need their own licence (Priva, and Purview records management), so most tenants will see Manual rather than a failure. Manual is excluded from your score, so a capability you do not hold never counts against you.',
      'New: "Managed devices checking in with Intune". A device that has not contacted Intune in a month is not receiving policy, configuration or updates, and its last reported compliance state is stale evidence rather than current evidence. Deliberately separate from the compliance percentage, because a fleet can read 100% compliant precisely because the non-compliant devices stopped checking in. Needs no new permission — it reads a field the device scan already returns.',
      'New: "Device configuration profiles deployed", covering ISO 27001 A.8.9 configuration management — a control that had no automated signal at all before. It uses a permission Checkpoint has always asked for at sign-in but never actually spent. It can pass or stay Manual but never fails on an empty result: modern tenants increasingly configure everything through the Settings Catalog, which Graph only exposes in beta, so no profiles means "cannot see" rather than "not configured".'
    ]
  },
  {
    version: '1.43.0',
    date: '2026-08-29',
    entries: [
      'Four checks that could never be anything but "Manual" now score for real: backup restore testing, business continuity, supplier assessments, and policy publication. They read your own Checkpoint registers — the calendar, the document register and the vendor register — rather than Microsoft Graph.',
      'That means no new permissions and no premium licence. Unlike the Defender and Purview checks, these work on every tenant, and they cover four ISO 27001 controls (A.8.13, A.5.29/A.5.30, A.5.19/A.5.20/A.5.22, A.5.1) that previously had no automated signal at all — so they could only ever be asserted, never demonstrated.',
      'Backup is scored on whether restore tests actually happen on schedule, not on whether backups are switched on. An untested backup is the most common finding in that control, and "configured" has never been the same thing as "recoverable". Continuity works the same way and needs both halves: an approved, in-date plan AND a completed failover test. A beautifully maintained plan nobody has ever rehearsed still fails.',
      'Suppliers are scored by criticality. An overdue review of a critical supplier holding production data fails; an overdue review of the stationery account is a review. A check that treats those identically just teaches people to ignore it.',
      'An empty register reads as Manual, never as a failure — and Manual is excluded from your score entirely. If you keep restore-test evidence or your policy set somewhere other than Checkpoint, nothing here counts against you, and you can say so explicitly with the "Not via Microsoft?" button.'
    ]
  },
  {
    version: '1.42.0',
    date: '2026-08-29',
    entries: [
      'New posture check: "Security incidents triaged within cadence", reading the Microsoft Defender XDR incident queue directly. Until now the closest thing was an alerts check inferred from Secure Score — a score about a product, not a record of what actually happened. This reads real incidents with real timestamps.',
      'It scores the age of unresolved high-severity incidents, never the incident count. A tenant with plenty of incidents is not less compliant than one with none — often the reverse, since it means detection is working and people are looking. What an auditor asks is whether the serious ones get worked within a timeframe you have committed to, so that is what is measured. An unassigned high-severity incident is flagged for review even inside the window, because nobody owning it is how it becomes overdue.',
      'The triage window is a setting (default 5 days) — set it to whatever your own incident response plan commits to rather than treating the default as a standard.',
      'Because it reads real records, this is the first check able to support "Demonstrated" assurance on ISO 27001 A.5.25 and A.5.26 rather than capping them at a practitioner\'s assertion. Tenants without a Defender XDR plan see it as Manual and lose nothing — an unmeasured check is excluded from the posture score entirely — and anyone handling incidents in another product can say so with the "Not via Microsoft?" button added last release.'
    ]
  },
  {
    version: '1.41.0',
    date: '2026-08-29',
    entries: [
      'New: record how a check is covered when it is not covered by Microsoft. Checkpoint scores the Microsoft stack, so a tenant running CrowdStrike instead of Defender, or OneTrust instead of Priva, used to fail those checks forever — the score punished a control they actually held, and the same risk was re-proposed on every scan until people learned to ignore the proposals. Every check on the Posture scan now has a "Not via Microsoft?" button.',
      'Mark a check as covered by another tool and it scores as a pass, named after the tool on the scan view so it never reads as something Checkpoint verified itself. Mark it not applicable and it drops out of the score entirely rather than counting against you. Either way the proposed risk stops coming back.',
      'Both require a justification and a review date, and the override expires on that date by itself — the real scan result comes back and the check starts failing again until someone confirms the alternative control is still in place. An override with no expiry is a permanent blind spot that nobody revisits, and an auditor will find it before you do.',
      'A check covered this way can never reach "Demonstrated" assurance on the controls it maps to. It is dropped from the observation set entirely — not counted as a passing observation, and not counted as an exception either, so a CrowdStrike tenant is not marked down for Defender signal they deliberately do not use. The control falls back to Evidenced or Asserted, depending on the evidence attached.'
    ]
  },
  {
    version: '1.40.0',
    date: '2026-07-27',
    entries: [
      'New: Incident register (ISO 27001 A.5.24–A.5.28). Log anything from a phishing click to a laptop left on a train — the incidents Microsoft Defender never sees. A Defender-detected incident can be logged here too, so this is the single record shown to an auditor. Track containment, root cause, lessons learned, and link straight to actions raised from it.',
      'Incidents involving personal information start a privacy-breach assessment, tracked against a default 30-day clock in line with the Privacy Act 1988 Notifiable Data Breaches scheme — check your own jurisdiction\'s actual deadline; this is a sane default, not legal advice. Recording an assessment note (even "assessed, no notification required") completes the assessment; it does not require notifying anyone.',
      'The Dashboard\'s Governance card and the Incidents nav badge both surface overdue assessments, and the register exports as its own CSV alongside the other registers.'
    ]
  },
  {
    version: '1.39.0',
    date: '2026-07-25',
    entries: [
      'The whole policy library rewritten. Every document now opens with "What this means for you" and "In practice" — plain language, addressed to the person who has to follow it — and closes with who is responsible, how to get an exception, what happens if it is not followed, and related documents. Average length went from about 230 words to about 800, and it is still a five-minute read, because the ordering means a reader who stops a third of the way down has already read the part that changes their behaviour.',
      'Every rule now carries its reason. A rule without one reads as arbitrary, gets followed literally, and gets abandoned the moment it is inconvenient. The reason renders beneath the rule in italics, so the rule still reads as the rule.',
      'Second person is confined to the two reader-facing sections; every policy statement stays declarative, because an auditor tests those as assertions. Two registers by design, kept visibly apart.',
      'New: Edit content. A generated policy is a rendering of structured content, so you now edit the content — opener, examples, each rule and its reason, roles, exceptions — and the document is re-rendered from it. Edits survive approval, a version bump, a re-brand, and any future improvement to the shipped template. Revert returns a document to the standard wording.',
      'Fixed: approving a policy used to re-render it from the original template, silently destroying any edit made to the draft since it was generated. Every render path now goes through the same content resolver, so that cannot happen.',
      'Word export added for anyone who insists, and labelled honestly: it is one-way, the exported file carries an "uncontrolled copy" banner, and changes made in Word will not survive regeneration.'
    ]
  },
  {
    version: '1.38.0',
    date: '2026-07-25',
    entries: [
      'New: Training. Three written courses — Security Awareness, Privacy & Personal Information, and Using AI Safely and Responsibly — each about fifteen minutes with a five-question comprehension check, filtered to the frameworks this tenant is licensed for. Completion is recorded per person against the course version, with the score and attempt count, and exports as one artefact for A.6.3.',
      'Completion means passing the check, not opening the page — clause 7.2/7.3 asks for competence to be demonstrated. Retries are unlimited and wrong answers explain themselves; the point is that it lands, not that anyone fails.',
      'The "Security awareness training completion" posture check is now real. It was previously unscored with no signal behind it at all; it now reads the training register at scan time. With no records it still reports as manual rather than failing, so a client running awareness training in a separate LMS is never scored down for it — and any overdue assignment caps the check at fail however high the completion percentage.',
      '"Catch up new starters" assigns every licensed course to anyone in the directory who has never held it. It is a gap sweep rather than a new-accounts query, so it is safe to run repeatedly and it also finds the person who has been here two years and was never assigned anything.',
      'Phishing simulation is deliberately not duplicated — Microsoft Defender\'s Attack Simulation Training does that job, and the A.6.3 guidance still points there. These courses cover the knowledge half, which simulation does not.'
    ]
  },
  {
    version: '1.37.0',
    date: '2026-07-25',
    entries: [
      'Documents is now a document control register (ISO 27001 clause 7.5.2/7.5.3). Every controlled document carries an owner, a version, an approval — who approved it, on what date — a classification and a next-review date, with due and overdue reviews flagged the same way the SoA flags a control that needs re-verifying. These are real SharePoint columns on the library, so the same register is visible, sortable and shareable in SharePoint without Checkpoint in the loop, and they are added to existing tenants\' libraries automatically on next load.',
      'Generating a policy now registers it as it saves — owner and review date from the generator, frameworks from the template, v0.1 Draft — and approving it is a named act by a named person on a dated version rather than a checkbox. The printed document carries the same document control block, so the file and the register can no longer disagree, and an approved policy\'s review date becomes a real dated entry on the Compliance calendar.',
      'New: Policy attestation (A.5.1, A.6.3, SOC 2 CC1.4/CC2.2). Assign an approved policy to everyone, or to an Entra group, and Checkpoint creates one record per person against that exact version — optionally emailing each of them a link. Employees see only their own outstanding policies and confirm they have read each one; their name, sign-in address and date are recorded. Campaign progress, a chase list, reminder emails and a per-person CSV export come with it. Guests, external and disabled accounts are excluded from every audience, since counting people who cannot respond would hold a campaign below 100% forever.',
      'The scheduled monitor (optional, §9) now sweeps governance as well as posture: policy reviews that are overdue, falling due within 30 days, or have no review date set at all, plus attestation campaigns still incomplete three weeks after launch. Findings land in the same alerts list the Dashboard already shows, deduplicated so a policy overdue for three weeks raises one alert rather than twenty-one, with optional email notification.',
      'The Dashboard\'s governance card gained two lines that were previously invisible until someone went looking: policy reviews overdue, and outstanding policy acknowledgements.'
    ]
  },
  {
    version: '1.36.0',
    date: '2026-07-19',
    entries: [
      'Client branding, end to end: Frameworks & Settings → Client branding now sets a display name (so every artifact reads "Acme Group Pty Ltd", not the raw tenant name), a logo, a report accent colour, the classification marking, and a printed footer line — applied across the console top bar, Boardroom Mode, report covers, and the running header of every printed report page. Charts keep their print-validated palette regardless of brand colour, so a light brand tone can never make one unreadable.',
      'Framework registries re-verified line-by-line against the published standards: ISO 27701 retitled to the 2019 numbering (and an invented control removed), ISO 42001 now matches Annex A\'s 38 controls exactly (including the previously missing event-log control), SOC 2 carries the complete 18-criteria Privacy series (61 total), Essential Eight wording aligned to the November 2023 model, and every cross-framework mapping — 354 of them — mechanically verified with zero broken links.',
      'Reports got deeper: the Executive Summary opens with a written narrative built from the same numbers the charts plot; Management Review recommendations are derived from this tenant\'s live registers instead of canned text; the Audit Readiness Report adds a per-check posture scan appendix; and the Risk Register Snapshot adds movement-since-last-snapshot analysis.',
      'The auditor pack now contains what auditors actually ask for: a consolidated exclusion-justification summary, a risk register extract, the latest scan\'s per-check results, and a policy inventory — plus the client\'s own branding and classification marking.',
      'Report plumbing fixes: column headers repeat when long tables cross printed pages, the misleading per-page number (which printed the same value on every page) is replaced with the document\'s title and version, version numbers no longer burn when a popup is blocked, and framework-agnostic reports no longer carry a framework tag on the cover.'
    ]
  },
  {
    version: '1.35.0',
    date: '2026-07-16',
    entries: [
      'New framework module: IS18 (QGEA) — the Queensland Government Information security policy (IS18:2018), built as what the policy actually is: an ISO 27001-aligned ISMS plus Essential Eight uplift, plus the Queensland-specific obligations neither of those carries on its own. 32 controls across governance/ISMS, risk, QGISCF information classification, the eight E8 strategies with annual maturity reporting, incident reporting to the Cyber Security Unit (including the Information Privacy Act\'s mandatory data-breach notification scheme), supplier/shared-service security, and the accountable officer\'s 30 September annual return. Every control ships with implementation guidance and evidence expectations, cross-mapped to ISO 27001 and Essential Eight so shared work is done once.',
      'IS18 gets the same scan-to-SoA suggestions Essential Eight has — 19 posture checks (MFA, application control, patching, macros, admin privileges, backups, sensitivity labels, DLP, external sharing, encryption, logging/alerting, access reviews, supplier and training signals) map to IS18 controls, each suggestion confirmed or dismissed by a practitioner before anything is written.',
      'An IS18 activation is issued as a bundle: the issuance CLI automatically includes ISO 27001 and Essential Eight in the signed file, so an agency opens a working register on day one rather than a wall of cross-references into unlicensed modules.',
      'Owner console: client sync now works for tenants whose Checkpoint lists live on a non-root SharePoint site — record the site path (e.g. /sites/compliance) on the client\'s roster row via Edit; blank still means the tenant root site.'
    ]
  },
  {
    version: '1.34.2',
    date: '2026-07-15',
    entries: [
      'The owner console\'s "could not save to the tenant\'s Settings list" failure (code: invalidRequest) traced to a real gap in its self-heal: it only widened the SettingKey/SettingValue columns if they existed but were too narrow, never if they were missing from that list entirely — which a Settings list provisioned by an older app version, or set up by hand, can genuinely have. It now creates either column outright if missing, matching the client app\'s own schema, before retrying the save once.'
    ]
  },
  {
    version: '1.34.1',
    date: '2026-07-15',
    entries: [
      'The "could not save to the tenant\'s Settings list" persistence banner now shows Microsoft\'s actual error code and request-id instead of just the generic top-level message (a bare "Invalid request" wasn\'t enough to diagnose on its own). Also fixed a related rough edge: a malformed response with a non-JSON error body used to surface as a confusing "Unexpected token" parse error instead of the real HTTP status.'
    ]
  },
  {
    version: '1.34.0',
    date: '2026-07-15',
    entries: [
      'Every Implemented control now has a re-verification cadence, not just an evidence link — the Statement of Applicability already flagged a stale "Verified" date, but the 90-day threshold was hardcoded and invisible outside that one column. It\'s now a configurable setting (Frameworks & Settings — "Control re-verification cadence"), a Dashboard KPI ("Controls overdue for review"), and a new Audit Readiness Report section listing exactly which controls need re-attention before an auditor asks.',
      'Automated posture checks now keep their own evidence current: a control whose evidence was auto-captured from a scan re-verifies itself on every subsequent scan that check still passes/reviews/fails on, instead of going stale 90 days after the first capture despite the underlying signal being re-confirmed on every run since. A check that comes back "Manual" (no real signal this run) no longer gets treated as if it verified anything. Net effect: the review-due list now surfaces almost entirely the genuinely manual controls — automated ones take care of themselves.'
    ]
  },
  {
    version: '1.33.0',
    date: '2026-07-15',
    entries: [
      'External sharing (ISO 27001 A.5.14/A.8.3) is now an automated posture check — it reads your tenant-wide SharePoint/OneDrive sharing setting directly and fails if links work for anyone without signing in. This was the last "Apps & Data" check that had no Graph signal at all. Requires a new Entra app permission (`SharePointTenantSettings.Read.All`) and the signed-in scan account to hold the SharePoint Administrator (or Global Administrator) role specifically — narrower than the Security Reader level every other check tolerates, so it\'s expected to show Manual for a lower-privileged scan account.'
    ]
  },
  {
    version: '1.32.0',
    date: '2026-07-15',
    entries: [
      'The posture scan grew four checks: classification/labelling now reads your published Microsoft Purview sensitivity labels directly, and a new check confirms Entra Access Reviews are configured for periodic access-rights review (ISO 27001 A.5.18/A.8.2). DLP policy coverage and content encryption also moved from always-manual to a best-effort read against Microsoft Secure Score — lower-confidence than the exact-match checks elsewhere (there\'s no direct Graph API for DLP policy configuration today), so treat a Pass there as a hint to verify in Purview, not a substitute for checking yourself. 25 checks now run in total, up from 22 — Setup requires two new Entra app permissions (`SensitivityLabels.Read.All`, `AccessReview.Read.All`) added to the app registration; see SETUP.md.'
    ]
  },
  {
    version: '1.31.0',
    date: '2026-07-15',
    entries: [
      'The client drawer\'s onboarding checklist gained a fifth stage: "Roles configured". Unlike the other stages (which the console works out for itself from a sync), this one can\'t be — the Practitioner/Viewer SharePoint groups it\'s tracking live inside the client\'s own tenant, which this console has no permission to read. "Mark roles configured" next to Send welcome pack records a plain, undoable confirmation once you\'ve actually checked, so onboarding a new client no longer has a step that\'s easy to forget just because nothing can verify it happened.'
    ]
  },
  {
    version: '1.30.0',
    date: '2026-07-14',
    entries: [
      'The owner console\'s Client costs view gained payment tracking: mark an entitlement "Invoiced" with a due date, and "Overdue" is worked out automatically from that date rather than being a separate status you have to remember to update — mark it "Paid" yourself once you see it land (there\'s no accounting-tool integration; this is a deliberate "mark it when you see it" workflow, same as everything else the owner console tracks by hand). A new "Overdue payments" total sits alongside the annual-cost KPI, and an overdue payment now turns a client red on the Client health strip.'
    ]
  },
  {
    version: '1.29.0',
    date: '2026-07-14',
    entries: [
      'The owner console gained a Client costs view: every client on the roster with the frameworks they\'re subscribed to, the annual cost that works out to, and the licensing scope on file for them (headcount, locations, and free-text scope notes for anything else relevant to what they\'re licensed for) — sorted by annual cost, highest first, with a total across all clients.',
      'Licensing scope (headcount, locations, scope notes) is now captured on every client — editable from "Edit client" in the roster or the client drawer — and shown in the drawer alongside the licence and health details already there.'
    ]
  },
  {
    version: '1.28.0',
    date: '2026-07-14',
    entries: [
      'You can now raise a finding straight from an internal audit — one "Raise finding" button creates the non-conformity or observation in the Actions register, sourced "Internal audit" and linked back to the audit, instead of the old two-step of creating it separately and typing in its ID. Nonconformities raised this way flow straight into the corrective-action loop.',
      'New Risk Treatment Plan report (ISO 27001 6.1.3): every risk mapped to its treatment decision, the controls and actions treating it, its residual score, and documented risk-owner acceptance — with a dedicated call-out of any Medium-or-above residual risk still lacking acceptance. It\'s the artifact an auditor cross-checks against the Statement of Applicability, and everything it needs became capturable once risk/action links, treatment decisions and acceptance sign-off were in place.'
    ]
  },
  {
    version: '1.27.0',
    date: '2026-07-14',
    entries: [
      'Corrective actions for nonconformities now follow the full ISO 27001 Clause 10.1 loop, not just a due date. A nonconformity in the Actions register carries a "Corrective action" record — the immediate correction, the root cause, and (once the corrective action is completed) a verified effectiveness review. Each nonconformity row shows the single next step it owes ("record the correction", "determine the root cause", "review effectiveness"…) until the loop is closed out.',
      'The Audit Readiness Report and Management Review Pack now include a nonconformities & corrective-actions section — each one with its root cause and where its CAPA stands — so an auditor sees the corrective-action loop, not just that a nonconformity was logged.',
      'The management review now captures its inputs structured against the seven Clause 9.3.2 sub-clauses (a–g) — prior-review actions, changes in issues, interested-party changes and feedback, security performance, risk-treatment status, and improvement opportunities — instead of one free-text box. The measurable ones (performance, risk status, prior actions) are pre-filled from live data; the qualitative ones are prompted for rather than invented. The Management Review Pack renders each input against its clause, and reviews recorded before this change still display correctly.'
    ]
  },
  {
    version: '1.26.0',
    date: '2026-07-14',
    entries: [
      'Risks and actions are now fully editable and closable by hand, not just create-then-auto-transition. Every risk has an Edit / Add treatment action / Accept residual / Close (or Reopen) / Delete drawer, and every action has Edit and Delete alongside Complete — so you can reassign an owner, fix a due date, re-score a risk, change a treatment decision or close something off at any time, with each change written to the audit log and versioned in SharePoint.',
      'Manually-added actions can now be linked to the risk they treat (a new field on the Add-action form, and editable afterwards). This was the missing piece that kept a hand-raised action from updating its risk: a linked action now recalculates that risk\'s residual score and moves it toward closure exactly like a scan-generated one.',
      'Residual-risk acceptance sign-off (ISO 27001 6.1.3 / 8.3): record who formally accepted a residual risk, when, and on what basis — the artifact an auditor asks for on any Medium-or-above risk left after treatment. The risk drawer now flags any Medium+ residual risk that has no acceptance on record yet.',
      'The Add-risk form now captures the treatment decision (Mitigate / Accept / Transfer / Avoid) explicitly, rather than defaulting silently to Mitigate.',
      'Under the hood: a tenant provisioned by an older version automatically gains any newly-added list columns on next load (the same self-healing approach as the recent Settings-column fix), so none of the above needs a re-provisioning step.'
    ]
  },
  {
    version: '1.25.1',
    date: '2026-07-13',
    entries: [
      'Fixed a persistence failure on tenants whose "Checkpoint Settings" list was provisioned by an older version of the app: its SettingValue column was still SharePoint\'s default single-line text (255-character cap), too small for a signed activation file with several modules\' keys embedded — most visibly a partner-type file granting every module. The app now detects this and widens the column automatically, then retries, the first time it happens; no manual SharePoint edit needed.'
    ]
  },
  {
    version: '1.25.0',
    date: '2026-07-13',
    entries: [
      'The owner console gained a "New client" flow: one form for post-purchase setup (client/contact details, a priced module checklist with a running total, term and client/trial type) that generates the exact issuance command to run — this app never holds the signing key, in this console or anywhere else — with an optional automatic-signing fast path for tenants that have set one up. Recording writes the client roster row and entitlement in one step, and "prepare renewal" now opens this same form, pre-filled, instead of a separate dialog.',
      '"Send welcome pack" composes an editable onboarding email — a report-styled quick-start guide attached, sent from the practitioner\'s own mailbox — and starts a four-stage progress checklist per client (pack sent, activated, first scan, synced) visible in their drawer; every stage past the first is derived from what a later sync actually finds, never hand-set.',
      'The onboarding wizard has a new, entirely optional last step: "Who can use Checkpoint?", explaining the Practitioner/Viewer roles and linking straight to this tenant\'s own SharePoint permissions page where both are set up — no new permission requested to build that link.'
    ]
  },
  {
    version: '1.24.0',
    date: '2026-07-13',
    entries: [
      'The owner console at /owner/ gained four insight views built entirely from the client roster and licensing data already recorded there: a Revenue board (active annualised revenue, revenue by module, committed-next-12-months vs. expiring-unrenewed, trial pipeline value), a Renewals runway (a 12-month expiry timeline with 90/60/30-day colour bands, a per-renewal status you set, an "expiring in 30 days" cash-flow figure, and a "prepare renewal" action that pre-fills the issuance command with the client\'s existing terms), a Module adoption matrix (licensed-and-active vs. licensed-but-dormant vs. not-licensed per client and module, plus a "next best module" upsell hint computed from that client\'s own last-scan cross-framework readiness), and a Client health strip (a worst-first R/A/G summary per client feeding a one-line "N clients red, N renewals due worth $X" card at the top of the console).',
      'Every figure on these views states its source and an "as at" time next to it, and a client that has never synced shows plainly as "never synced" rather than a fabricated health colour or score.',
      'A new owner-only Prices tab records each module\'s annual list price (used to compute the revenue and pipeline figures above) — this pricing data lives only in our own tenant and is never sent to or visible from a client tenant.'
    ]
  },
  {
    version: '1.23.0',
    date: '2026-07-13',
    entries: [
      'The Partner Console has moved out of this app entirely, into its own internal-only console at /owner/ — this bundle now ships zero owner/partner-console code, strings, or SharePoint list definitions. Nothing in the client experience changes: no nav item, no feature to lose, since it was never client-facing to begin with.',
      'The new owner console reuses the same sign-in, activation persistence and Licence panel design as this app (same dual-store, same reconciliation, same loud-failure behaviour).',
      'The Partner Console\'s old SharePoint lists ("Checkpoint Partner PartnerClients"/"PartnerEntitlements") are unaffected — the owner console reads and writes the exact same lists, so nothing needs migrating on the SharePoint side. A one-time local browser-storage migration (a "checkpoint-portfolio-v1" relic from long before the Partner Console existed) now runs from the owner console instead of here.'
    ]
  },
  {
    version: '1.22.0',
    date: '2026-07-13',
    entries: [
      'Activation persistence fixed: a verified licence file is now saved to this browser\'s local storage immediately on verification, in addition to the tenant\'s own Settings list — previously a failed (and silently swallowed) write to SharePoint could leave a "successfully applied" activation completely unsaved, only to vanish on the next reload. Both copies are now re-verified (signature, tenant, expiry) on every load and reconciled automatically, the newer one always winning.',
      'New Licence panel (Frameworks & Settings) shows exactly what\'s currently held — type, modules, issued date, expiry, the tenant it\'s bound to, verification status, and precisely WHERE it\'s stored (this browser / the tenant\'s Settings list / both) — plus a "remove licence from this browser" action.',
      'A failed save to either store now shows a specific, named warning and a standing banner in the Licence panel with a Retry button — never a generic "sync issue" toast that fades before anyone notices, and never a false "verified and applied" success message.',
      'Fixed a bootstrap edge case where a returning tenant whose cached activation couldn\'t be read (at the same moment a list needed recreating) could get stuck on the "not activated" screen even after pasting a genuinely valid file — the paste now sticks immediately.',
      'A transient failure to read this tenant\'s own identity from Microsoft Graph is no longer reported as "issued for a different tenant" — it now says so explicitly and suggests trying again, rather than pointing at the activation file itself.',
      'Every activation apply/renew/removal is now written to the audit log, including when a locally-verified copy has to be restored into a tenant\'s Settings list because the tenant\'s own copy was missing or stale.'
    ]
  },
  {
    version: '1.21.0',
    date: '2026-07-12',
    entries: [
      'New Financial risk analysis: every open risk\'s existing likelihood/impact score is now automatically run through a 10,000-trial Monte Carlo simulation — no separate financial data entry — producing a simulated annual loss distribution, a loss exceedance curve, and P90/P99 "1-in-10-year"/"1-in-100-year" figures. Runs fresh on every visit; nothing to configure or trigger by hand.',
      'The same risks are re-ranked by simulated financial exposure (P90 annual loss) alongside the register\'s usual ordinal ranking — the two don\'t always agree, and seeing where they diverge is often the more useful signal.',
      'The Risk register report now includes this as an additional section and figure, generated from the same engine as the in-app view.',
      'The loss-magnitude and event-frequency ranges behind the simulation are shown in full next to every result — illustrative planning assumptions, not measured data, and said so explicitly throughout.'
    ]
  },
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
