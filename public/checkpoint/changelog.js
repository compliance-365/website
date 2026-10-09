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
    version: '1.141.0',
    date: '2026-10-09',
    entries: [
      'A new Trust Center page for your customers and prospects, designed to look like the trust centres of larger software companies: a branded header with your logo and colours, Request security documents and Contact buttons, and sections for compliance, security practices, programme activity, documents, sub-processors, privacy and an FAQ. It works on phones, prints cleanly and follows the reader\u2019s light or dark setting.',
      'Nothing on it is claimed that your records do not support. A standard shows as Certified only when a current certificate is recorded; otherwise it shows as in progress, with your Stage 1 target. Each security practice is shown only when your controls and posture checks evidence it, the same test a questionnaire answer gets, and gaps are never published.',
      'List the documents customers can see: public ones with a link, sensitive ones (policies, penetration test summary, SOC 2 report) available on request by email to your security contact. One click lists every approved policy.',
      'Preview shows exactly what readers will see, including in demo mode, before you generate the page and decide where to publish it.',
      'Vendor risk: a vendor that has not been sent a security questionnaire now has a Send questionnaire button in the register itself. Before, the button was only inside the vendor\u2019s side panel.'
    ]
  },
  {
    version: '1.140.2',
    date: '2026-10-09',
    entries: [
      'Integrations: "How to set it up" on the Scheduled monitor (Azure) card now opens the step-by-step setup guide in the card itself. Before, it only said the guide was further down the page, below the AWS and GitHub cards.'
    ]
  },
  {
    version: '1.140.1',
    date: '2026-10-09',
    entries: [
      'Fixed: on a tenant set up with an earlier version, saving a vendor could fail with "Field \u2018PublicListed\u2019 is not recognized". Checkpoint now checks every register against the current layout each time it loads and adds any field an older setup is missing, for every register rather than a fixed list.'
    ]
  },
  {
    version: '1.140.0',
    date: '2026-10-09',
    entries: [
      'No more permissions screen at sign-in. Checkpoint now asks Microsoft for whatever your administrator has already approved, in one go, instead of listing each permission. Once your administrator has granted consent, nobody sees the Microsoft permissions screen again, including when Checkpoint adds a new check. Before, Microsoft could show the full screen at every sign-in even though consent had been granted.',
      'Anything your administrator has not approved is listed in Settings \u203a Setup health, with the button to approve it, rather than a permissions screen part-way through your work.',
      'The Microsoft consent screen now shows Compliance365 as a verified publisher.'
    ]
  },
  {
    version: '1.139.0',
    date: '2026-10-09',
    entries: [
      'Guided build: the path to certification as ten stages in the order an ISMS is actually built. Scope and context, leadership, the risk framework, risk assessment, then risk treatment and Annex A together (the Statement of Applicability comes from the risk treatment, not after it), objectives, people and documents, running it, checking it, and improving and certifying.',
      'Each stage says in plain words what it is for and lists what is left, each item with the button that does it. Top management\u2019s decisions are marked, and the stage shows which ISO 27001 clauses it completes. Each clause opens Finish this clause.',
      'The dashboard path card now reads "Stage 4 of 10: Risk assessment", with Continue. Top management sees their decisions for the current stage in Next for you.',
      'New steps the old path did not have: name the ISMS owner and the top management sponsor; agree the risk appetite as a recorded top management decision, with who agreed it and when; approve the risk management framework; give every risk a treatment and an owner; have top management accept or reduce the risks above appetite; and send the approved policies to staff.'
    ]
  },
  {
    version: '1.138.0',
    date: '2026-10-09',
    entries: [
      'Next for you: a card at the top of the dashboard and of My tasks showing the one thing waiting on the person signed in. It says what it is, why it matters in plain words, roughly how long it takes, and has the button that does it. When nothing is waiting it says so, and names the next thing coming up, such as the monthly security review. People with restricted access now land on My tasks, which opens with this card, instead of the Policy attestation page.',
      'A short welcome the first time someone signs in: three screens covering what Checkpoint is, what is expected of them and where their things are. It is worded for top management, the person running the ISMS, view-only users or everyone else. For top management that means the four things ISO 27001 asks of them and roughly how much time a month. How this works, at the bottom of the menu, brings it back.',
      'Every main page now opens with a plain-English line: what the page is, and what you do there. The wording changes for top management and for people who only have their own tasks. The words used on the page (Statement of Applicability, residual risk, nonconformity and so on) are explained underneath.',
      'Who does what: a new page listing everyone with a part in the ISMS. It shows each person\u2019s role (top management, ISMS owner, who runs the security review) and what they are responsible for, taken from the owners recorded on every register. It also flags anything without an owner, and owners who are no longer in the directory. It can be filed as Clause 5.3 evidence in one click.'
    ]
  },
  {
    version: '1.137.0',
    date: '2026-10-08',
    entries: [
      'Set a target Stage 1 date and the path to certification works back from it. Five milestones each have a due date: the ISMS documented, the ISMS operating, internal audit, management review and ready for Stage 1. Each shows what is still to do and how many days it is late. The plan warns when the target has passed, when the work left will not fit, or when the timeline is too short for the records a certification body expects. The partner console shows the target and flags a client whose date is at risk. A Stage 1 already booked on the calendar is used when no target is set.',
      'The certification page shows the gate as a checklist: every check for Stage 1 and Stage 2, passed or not, each with the button that fixes it. Booking unlocks for each stage as soon as its checks pass. Advice the certification body will raise but that does not block booking, such as broken evidence links or under three months of records, is shown separately. The booking dialog shows the same list.',
      'Finish this clause: each clause\u2019s side panel lists what is left, in order, one button each. Checkpoint\u2019s own steps come first, then what only you can record, then naming the owner, linking the evidence and marking it Implemented. The panel updates as each step is done.',
      'Evidence is checked for being the right kind and current, not just linked. Each ISO 27001 clause states what an auditor expects. A policy linked where a record is needed (for example as management review minutes), a draft, a record over a year old or an empty evidence folder is flagged on the clause, in its side panel, as a step to fix and on the certification gate.',
      'Top management interview (Management review page): the eight questions a certification auditor asks top management, each shown beside what the records say, so an answer the register would contradict is caught first. For example, it flags "we accept nothing above medium" when risks above appetite have no recorded acceptance. Answers are saved, can be filed as Clause 5.1 evidence, and are included in the Stage 1 pack.'
    ]
  },
  {
    version: '1.136.0',
    date: '2026-10-08',
    entries: [
      'Weekly backup: the scheduled monitor saves a dated zip of every register, the settings and an index of the evidence into your own SharePoint (Documents › Checkpoint backups), and keeps the newest 13. Secrets such as webhook URLs and API keys are left out. Back up now (Settings › Data) saves one straight away and downloads a copy. The README in each zip says how to restore.',
      'ISMS change log: what changed in the management system since the last management review, in plain words. It covers scope, policies, risks, suppliers, people, assets, incidents, audits and objectives, and leaves housekeeping out. Open it from Management review or Reports. It also fills the "changes" input when the review inputs are drafted (Clause 9.3.2 b), and the month in brief tells the chair how much changed.',
      'Import CSV for vendors and assets as well as risks and actions. If the file\u2019s headings don\u2019t match, you pick which column is which, with a best guess filled in. Before anything is written you see a preview, and rows that are already in the register (or repeated in the file) are held back as possible duplicates unless you tick to include them.',
      'Policy acknowledgement nudges: when a policy is approved, Checkpoint offers to send it to everyone with a one-line "what changed" in the email. Policy attestation lists approved policies whose current version has not been sent, each one click from going out, and so does Do next on the dashboard. The scheduled monitor then emails anyone outstanding once a week, listing every policy they still owe, until everyone has acknowledged. A switch turns the weekly reminders off.',
      'Accessibility and phone use: wide tables that scroll sideways can now be reached and scrolled with the keyboard, and screen readers announce what each one is. On touch screens, links, row checkboxes and section toggles are at least 24 pixels. Every main view was checked at phone width for sideways scrolling and for controls without a name.'
    ]
  },
  {
    version: '1.135.0',
    date: '2026-10-08',
    entries: [
      'Dashboard: four numbers across the top. Readiness for the main certification, ISMS health, days to the next audit and what is waiting on you. Each opens its detail.',
      'Do next: one ranked list of at most five things replaces the separate lists. It covers lapsed requirements, approvals waiting for you, risks above appetite, the actions holding the posture back and the next step on the path. The rest are one click away. The risk appetite banner and the "What an auditor would find first" card are now part of it.',
      'Your path to certification is now one line: progress, the week of the plan, how far behind it is and the next step. The stepper, the dated plan and all the steps open on request.',
      'The readiness strip shows only the frameworks being worked towards (the main one, any with progress, and any set as a target). The others wait behind "Show all frameworks".',
      'The chair sees the month in brief at the top of the dashboard, and people with restricted access see their own tasks.',
      'Operations: the assurance pulse now says what it shows. It reports how many weeks had compliance work, flags a quiet spell and notes when no management review or internal audit happened in the period.',
      'Cross-framework mapping now counts frameworks rather than mapped controls (it showed +18 for 14 frameworks). It names the control, its status and which frameworks it also counts for.',
      'Governance offers the next step where a record is missing, for example planning the next 12 months of internal audits. The activity feed is grouped by day and shows the latest eight, with the rest in the audit log.',
      'New Integrations page under Settings, covering Microsoft 365, the scheduled Azure monitor, AWS and GitHub. Each shows whether it is reporting, when it last reported and how many checks it covers, with step-by-step setup. For AWS that means the read-only IAM policy to copy and the Lambda settings, with your tenant and SharePoint values filled in. The monitor\u2019s setup guide has moved here from the dashboard.'
    ]
  },
  {
    version: '1.134.0',
    date: '2026-10-08',
    entries: [
      'ISMS health: one score out of 100 for how well the security programme is running. It counts recurring requirements that have lapsed, out-of-date evidence, overdue actions and missed security reviews, and names the biggest drag. Each client sends it to the partner console, which shows it in its own column, can sort by it, and flags any client below 60.',
      'Plan the next 12 months of internal audits: the management-system clauses first, then each part of Annex A in order of how much risk and past trouble sits in it, so the riskiest areas are audited soonest. Each audit names the controls to focus on and why, and is booked in Internal audits and on the compliance calendar. Audits already planned are left as they are.',
      'Suppliers renew their own certificates. When a supplier\u2019s certificate or assurance report is due to expire within 30 days, the scheduled function emails their contact a link that needs no account, where they give the new expiry date and a link to the certificate. Their reply waits on the supplier record for you to check and accept; nothing changes until you do. They are asked at most once every 30 days.',
      'Stage 2 dry run: next to the mock audit, a run that samples what a Stage 2 auditor samples. That means leavers, new starters, incidents, document changes, recurring activities, treated risks and corrective actions, and it checks each has its record.',
      'The month in brief: a one-page summary for the chair in plain English, with no clause numbers. It covers what needs their decision, what is going well and the direction of travel. It is emailed to the chair once each month\u2019s meeting is prepared (from the app or the scheduled function), and you can open it or send it again from the review card.'
    ]
  },
  {
    version: '1.133.0',
    date: '2026-10-08',
    entries: [
      'Fewer emails for those who want them. In My tasks, each person can choose to hear about new tasks as they happen or only in the weekly email. On weekly, approval requests, evidence requests, follow-ups after the security review and overdue-action chases are not emailed one by one; they arrive together in the weekly email. Approval requests are now part of the weekly email for everyone. The choice applies only while the weekly email is switched on, so nothing goes missing.',
      'What an auditor would find first: a dashboard card listing the recurring requirements that have lapsed, each with the button that fixes it. It covers the internal audit (at the interval you set), the management review, risks not reviewed for a year, awareness training, posture scans and security reviews, the information security policy\u2019s approval and review, overdue nonconformities, and implemented clauses past their verification date.',
      'Evidence now expires with the activity that produces it. A control whose evidence comes from a recurring activity (for example the quarterly access review or the six-monthly backup restore test) stays current for that interval plus a quarter. The SoA shows "current until" against each evidence folder, the evidence check flags anything out of date, the mock audit raises it as a finding, and the control\u2019s owner is asked for new evidence in My tasks and the weekly email until it is added.',
      'Auditor questions and your answers: a new report with the questions a certification auditor usually asks for every clause from 4.1 to 10.2 and for 16 of the most sampled Annex A controls. Each question is answered from your own records, with what is still missing and whether it is ready. It is in Reports, in the auditor\u2019s guide and in the Stage 1 pack, so the people who will be interviewed can rehearse.',
      'Set up the security review in four steps: who (chair, ISMS owner, facilitator), when, who is invited, then the kick-off agenda prepared and, on SharePoint, sent with its calendar invite. Every new client starts the same way. All the settings remain one click away.'
    ]
  },
  {
    version: '1.132.0',
    date: '2026-10-08',
    entries: [
      'Attendance and quorum for the security review. The minutes record who was absent among the chair, the ISMS owner and the facilitator set in the review settings (a surname is enough). Saving the minutes of a meeting held without the chair or the ISMS owner asks first, then records it as such. The next agenda then asks the meeting to confirm those decisions, and names anyone who missed two meetings in a row. Attendance appears in the minutes email and in the management review inputs.',
      'A risk accepted in the meeting lands on the risk register. When the chair accepts the risk on an action that was overdue at two meetings in a row, the acceptance is recorded on the linked risk (or a risk you pick): who accepted it, the date, the basis and the residual score, exactly as the risk panel records it. A follow-up action to look at the acceptance again is raised for the date you set (six months by default).',
      'Top management record: one document covering the last 12 months. It lists each security review with whether the chair was there and its outcome, the decisions on overdue actions, the residual risks accepted, and the management reviews held. It shows top management taking part (Clauses 5.1 and 9.3), and it is included in the Stage 1 pack.',
      'The year of security reviews in one document: outcomes and attendance, the top management summary, then each meeting\u2019s minutes on its own page. Open it from the review card, print it to PDF for the auditor, or file it as Clause 9.3 evidence in one click.'
    ]
  },
  {
    version: '1.131.0',
    date: '2026-10-08',
    entries: [
      'Meeting outcome in one line. When you record the minutes of a security review, add one sentence on how it went, for example "On track; MFA rollout slipped two weeks". It opens the minutes email and the minutes document, shows against the meeting in the review history, and the year of outcomes is carried into the management review inputs.',
      'A decision becomes an action in one click. While minuting, "+ Decision" under any agenda item raises the action straight away, with an owner picked from the directory and a due date, and shows it under the item. Notes typed so far are kept. You can still type several decisions at once, one per line.',
      'The pre-read is in the calendar invite. The invite now carries the at-a-glance traffic lights and the agenda with its figures, as plain and formatted text, so Outlook and Teams show them without opening the email. This applies to invites sent by the app and by the scheduled function.',
      'Stuck actions go to the chair. An action that was already overdue at the last meeting and is still overdue comes up as "Needs a decision from <chair>". The chair can extend it to a new date, reassign it, or accept the risk and close it with a reason. The decision is recorded on the action, in the minutes and in the audit log, so overdue actions no longer roll on from month to month.',
      'The meeting length now always adds up to the length set (a quarterly meeting showed 46 minutes instead of 45).'
    ]
  },
  {
    version: '1.130.0',
    date: '2026-10-08',
    entries: [
      'A leaner monthly security review. The meeting now runs to 30 minutes and covers what matters: actions, risks, incidents and security posture, then decisions. An item with nothing new is not discussed: it becomes one line under "Nothing to report" (for example "No incidents since 8 Sep 2026"). Certification progress appears only until you are certified. Facts are cut to the top three (oldest overdue actions, top failing checks). Clause references are no longer on the agenda; one footer line on the agenda and minutes says which clauses the meeting evidences. You can set the meeting length (30, 45 or 60 minutes) in the review settings. Quarterly meetings run to 45 minutes and management review meetings to 60.',
      'At a glance: the agenda email, the review panel and the agenda document now start with a one-line red, amber or green status for actions, risks, incidents, posture and certification, so attendees can read it in a minute before the meeting.',
      'Follow-ups between meetings: a week after a meeting, each owner of a decision that is still Open gets one short email listing their actions and due dates. It is sent once per meeting, by the scheduled function or when the app is opened, and recorded in the audit log.'
    ]
  },
  {
    version: '1.129.0',
    date: '2026-10-08',
    entries: [
      'Quarterly management reviews. In the monthly security review settings, choose to hold the Clause 9.3 management review every 3, 6 or 12 months. That meeting carries the management review on its agenda, and recording its minutes also records the management review, with the 9.3.2 inputs pre-filled as they stood and the next one due at the chosen interval. The management review interval in your settings follows, so the Management Review Procedure says the same thing once regenerated.',
      'Editable agenda. Add your own standing items in the settings (for example AI model providers, or contractor access each quarter). For a single meeting, add an item such as any other business, remove one, or move items up and down; the timings follow.',
      'Minutes against each item. Record minutes opens the agenda with a notes box and a decisions box under every item; each decision becomes an action linked to its item. The minutes can be emailed to the attendees, with every action, its owner and due date.',
      'Agenda and minutes documents. Each meeting has an agenda document and, once held, a minutes document with an approval block. In a connected tenant the agenda is filed as Clause 9.1 evidence when it is sent, and the minutes when they are recorded (Clause 9.3 for a management review meeting).',
      'It runs without anyone logging in. When the Azure monitor is deployed it prepares the agenda two working days before, sends it with the calendar invite when set to, and reminds the ISMS owner the day after if the minutes are not recorded. Meeting times follow your time zone, daylight saving included.'
    ]
  },
  {
    version: '1.128.0',
    date: '2026-10-08',
    entries: [
      'Monthly security review, on the Management review page. Set the chair, the ISMS owner, the attendees and a regular slot (for example the second Tuesday at 10:00). Two working days before each meeting Checkpoint prepares a timed agenda, each item answered from live figures: actions from last meeting and what is overdue, the posture score and its change, incidents, risks above appetite, certification readiness, leavers and supplier changes. The kick-off adds terms of reference, roles, scope and a baseline; every third meeting adds access reviews, supplier reviews, objectives and policy acknowledgement; the twelfth adds the Clause 9.3 management review.',
      'The agenda is emailed to the attendees with a calendar invite and the Teams link, automatically if you choose, or from the ISMS owner\u2019s My tasks. Minutes record who was present, the discussion and the decisions; each decision becomes an action with an owner and a due date.',
      'Trends: the monthly review card charts posture score, overdue actions, risks above appetite and incidents meeting by meeting.',
      'The management review\u2019s pre-filled inputs now include what the monthly security reviews held since the last one decided, and how posture, overdue actions, incidents and risks moved across them.'
    ]
  },
  {
    version: '1.127.0',
    date: '2026-10-07',
    entries: [
      'Excluding a control from the Statement of Applicability is now one clear step. The Scope column says In scope or Excluded, and the Status list includes Not applicable. Either way, one dialog asks for the justification an auditor will read (Clause 6.1.3 d), suggests one where your scope answers support it, and warns if the control usually still applies or a risk relies on it. Bulk exclusion asks once for the reason the selected controls share, and now sets their status to N/A. Bringing a control back into scope clears its old justification; the audit log keeps it.',
      'Exclusions suggested from your scope. A new scope question asks whether the organisation has premises of its own. With no premises (or fully remote and unanswered), Checkpoint proposes excluding A.7.1, A.7.2, A.7.3, A.7.4, A.7.6, A.7.11 and A.7.12 with a ready-written justification; with an office but no secure area, A.7.6; with no software development, A.8.25, A.8.28, A.8.31 and A.8.30. Clear desk, off-premises assets, storage media, maintenance and secure disposal are never proposed: they apply to home working.',
      'Exclusion check on the Statement of Applicability: exclusions with no justification, excluded controls an open risk relies on or an open action is implementing, excluded controls with evidence linked, and remote-working controls excluded in a remote or hybrid organisation. The mock audit raises unjustified and relied-on exclusions as minor findings.',
      'Documents follow the exclusions. The ISMS scope lists the Annex A controls excluded and why, and the Physical & Environmental Security Policy drops the secured-area, visitor and tailgating statements once those controls are excluded. Documents written before an exclusion are listed with a Regenerate or Re-approve button.'
    ]
  },
  {
    version: '1.126.0',
    date: '2026-10-07',
    entries: [
      'Retiring an asset now records its disposal (ISO 27001 A.7.14 and A.5.11): the date, the reason, what happened to the data, a link to the wipe report or destruction certificate, and who signed it off. Retired assets have their own filter in the asset register, each with its record, and can be restored. A disposal record with something missing is flagged, and the mock audit samples recent disposals the way an auditor does. Asset disposal records export as a CSV with the other registers.',
      'Assets not found in the last sync are now a short review: confirm each is still in use, or retire it (one at a time or all together).',
      'Each asset opens in a side panel with its details, its disposal record once retired, and its history.',
      'Owners who have left. On the asset and risk registers, this finds owners whose Microsoft 365 account is disabled, across risks, actions, suppliers, assets, requirements, controls, clauses, objectives and activities, and hands everything they owned to someone else in one step. Variants of one name ("R. Morgan", an email address, the full name) are grouped as one person. Owners not in the directory at all are listed separately, since they may be a team. Every change is logged against the record.',
      'Review register. The asset, supplier, legal and risk registers step through every record not reviewed in the last 12 months, oldest first: Keep (records today as the review date), Change, Retire or Close, or Skip. Suppliers follow their own review schedule.',
      'History. Risks, actions, controls, clauses, suppliers, AI systems, incidents, assets and legal requirements now show who changed what and when, from the tamper-evident audit log, in their side panel.'
    ]
  },
  {
    version: '1.125.0',
    date: '2026-10-07',
    entries: [
      'Request approval. A draft document can be sent to the person who should approve it, chosen from Microsoft 365. For the information security policy that is top management (ISO 27001 Clause 5.2), and Checkpoint remembers who that is. The request appears in their My tasks and they are emailed a link; they approve it themselves, and their name, the date and the version are recorded on the document.',
      'Evidence check. On the Statement of Applicability and the management system clauses, Check evidence opens every SharePoint evidence link and reports any that no longer work, any not updated in over a year, and implemented controls or clauses with no evidence at all, each with a Fix button. It also runs automatically before you book a certification audit if it has not run in the last fortnight.',
      'Mock audit, on the Certification page. Checkpoint samples your records the way a certification auditor does (ten controls, three risks, three actions, plus the scope, the information security policy, the latest internal audit, management review and any open major nonconformity) and grades what it finds as major, minor or observation, with a readiness score and a fix for each finding. Run again re-tests the same sample after you fix things; Draw a new sample picks another. No AI add-on needed.',
      'Documents leads with the document control register. Generate a document, Generate full set and Upload are buttons above it, opening their panels below the register, and the policy-versus-practice check sits under the register too.'
    ]
  },
  {
    version: '1.124.0',
    date: '2026-10-07',
    entries: [
      'A simpler menu. The sidebar is now grouped by what people do: My tasks and Dashboard, Risks & actions, Suppliers & assets, Controls, Documents, Audits & reviews, and Settings. The specialist views (Board view, cross-framework mapping, financial risk analysis, threat intelligence, the audit log, reports, the Trust Center, questionnaires, the auditor pack and the AI assistant) sit under More, shown with the Full menu. Show full menu, at the foot of the sidebar, switches between the two and is remembered on this device; every view is still reachable from search.',
      'The Statement of Applicability is one line per control: code, title, applicable, status, frameworks it also satisfies, owner, assurance, verified and evidence. Why a control is included, who verified it, its evidence and evidence folder, and every framework it maps to are in the control\u2019s panel, opened from its code or title. Each theme folds, showing its progress and anything that needs attention, with Expand all and Collapse all; any filter opens every theme. An exclusion without a justification is still flagged on its row.',
      'Management system clauses are one line per clause, with the requirement count on the row. The clause\u2019s panel now also holds its owner, verification, evidence and evidence folder. With more than one management system, each folds.',
      'Settings is in sections (Setup health, Organisation, Automation, Notifications, Thresholds, Features and Advanced) with a search across all of them. A setup problem is pinned above the sections wherever you are.',
      'The Dashboard leads with your path to certification, the next actions and the readiness tiles. Position (fingerprint, journey, residual risk, posture trend) and Operations (automation, drift, assurance pulse, governance, activity) are folded underneath, one click away.'
    ]
  },
  {
    version: '1.123.0',
    date: '2026-10-06',
    entries: [
      'The registers lead with the register. Risks, actions, vendors, assets and legal requirements now open with a compact row of summary tiles and the table straight after; the heatmap and charts are folded underneath, one click away.',
      'Needs tidying, on every register: actions without a due date, risks with no controls or no treatment actions, risks whose treatment is finished and need reassessing, vendors with an expired certification or personal information but no data processing agreement, and records with no owner. Click one to see exactly those records.',
      'Owners come from Microsoft 365. Every owner field offers your directory as you type, and Match owners links existing free-text owners (for example K. Patel) to the right person in one reviewed step, so owner reminders and My tasks reach them.',
      'Risk register: each risk shows its treatment progress (for example 2 of 3 actions done, next due 14 Oct), prompts you to reassess the residual risk once its last action is completed, and can be marked Reviewed, no change in one click. The risk panel shows the findings, vendors and assets connected to it.',
      'Actions register: change the owner, due date and status from the row, group the list by owner or by risk, and upload the evidence file when you complete an action (it is saved to Documents, Evidence).',
      'Vendor register: Find vendors in Microsoft 365 proposes the suppliers behind the third-party applications connected to your tenant. Four tiering questions set a vendor\u2019s criticality; the next review date follows its criticality and is brought forward to its certification expiry; the contract and data processing agreement are recorded; and Critical and High vendors are linked to the third-party business risk.'
    ]
  },
  {
    version: '1.122.0',
    date: '2026-10-06',
    entries: [
      'The Posture scan page is simpler. The top shows your score and its trend, how many checks need attention, need review or are clear (click one to filter the list), how many risks are waiting for approval, and whether every data source is available. Fix these first lists the five most important findings, one click from their detail.',
      'Each check is now one line: its status, its name and the result in a few words. Open it for the full result, how to fix it, the business risk it feeds and the option to record that it is covered another way. Coverage and how the scan works are folded away until you want them.',
      'Business risks. Scan findings and the risks suggested from your scope answers now roll up into at most 14 business risks, written the way an auditor and a certification body expect to read a register: for example, staff accounts taken over through phishing or weak sign-in controls, rather than one risk per setting. Each carries the threat, the consequence, every finding as a vulnerability and every finding\u2019s fix as a treatment action. A full demo scan now proposes 12 risks instead of 36.',
      'The proposals are a short queue: one row per business risk with Approve and Dismiss, opening to show its findings and actions. A finding can still be dismissed on its own, critical risks can be approved in one go, and a finding about a business risk already in the register is added to it rather than creating a second one. A business risk is ready to close once every finding behind it passes.',
      'Risk register: Group into business risks. Risks already raised from scans and scope answers can be merged into their business risk after you review the grouping. Their actions move across, the originals close and show where they went, and the register shrinks to what matters. Risks you entered yourself are never touched.'
    ]
  },
  {
    version: '1.121.0',
    date: '2026-10-06',
    entries: [
      'Your consultant now sees where you are against plan. The progress Checkpoint shares at each sync also carries the week of your plan and any steps behind, the date you will be ready for Stage 1, booked Stage 1 and Stage 2 dates, certificate and next audit dates, how many objectives are at risk, how many people have overdue tasks, and when Checkpoint was last used. Counts and dates only: no records leave your tenant.',
      'Partner console: a new Delivery tab shows every client\u2019s stage, path, Clauses 4-10 and Annex A progress with a trend line across syncs, the plan, booked audits and what needs attention, sortable and filterable to the clients that need attention. The dashboard lists clients off track: stalled for over 14 days, behind plan, Stage 1 or Stage 2 booked but not ready, a certificate expiring without recertification booked, an overdue surveillance audit, or auditor access left open.',
      'Partner console: a status note for each client, in plain English with the next steps, ready to review, copy and send from your own mailbox. Clients certified to ISO 27001 that use AI are flagged as ready for an ISO 42001 conversation.'
    ]
  },
  {
    version: '1.120.0',
    date: '2026-10-06',
    entries: [
      'New: My tasks, at the top of the menu. One page for each person: the actions, scheduled activities, document reviews, objectives at risk, evidence requests, policies to acknowledge and training assigned to them, each with the one button that does it, plus a single progress bar towards certification. Client owners no longer need to learn the rest of Checkpoint, and staff with attestation-only access see it too.',
      'New: auditor access and the Auditor guide. Record the certification auditor’s access window, and Checkpoint explains exactly how to set it up: invite them as a guest and add them to Checkpoint Viewers for read-only access. It can email the auditor their link and puts a reminder to remove access on the calendar for the day the window ends. The auditor lands on the Auditor guide, which lists where each piece of Stage 1 and Stage 2 evidence is, and sees a notice once their window has ended.',
      'Booking the certification audit now checks readiness. Stage 1 can be booked once the scope, mandatory documents, risk assessment and Statement of Applicability are in place. Stage 2 can only be booked after a completed internal audit of Clauses 4-10, a management review held after it, no open major nonconformity and no applicable control still not started. Checkpoint also advises when the ISMS has run for less than about three months. Both bookings go on the compliance calendar.',
      'Actions now read Completed and Closed, matching the compliance calendar: a finished action shows as Completed, and one stopped without being done as Closed. The Actions register can be filtered by either.'
    ]
  },
  {
    version: '1.119.0',
    date: '2026-10-06',
    entries: [
      'New: Application form answers, on the Certification page. It fills in what a certification body’s application asks (BSI’s Certificate Information Form and its equivalents) from your ISMS: legal name, scope statement, people and locations in scope, outsourced suppliers with their certifications, applicable legal and regulatory requirements, how long the ISMS has run, when the audit can be booked, and the consultancy used. The application then matches what the auditor sees at Stage 1.',
      'The ISO/IEC 27006-1 complexity factors that set the audit time (process complexity, type of business, confidentiality, virtual organisation, IT complexity, availability, development, outsourcing and disaster recovery) are each rated from your own records, with the reason. Rating higher than the facts only adds audit days, and the body re-rates at Stage 1. Suppliers that are reviewed and certified are rated as managed outsourcing.',
      'Before you submit lists anything to fix first: unanswered questions, no legal requirement recorded, suppliers not yet reviewed, and Stage 2 booked before the internal audit and management review. Keeping the scope proportionate gives advice on the scope statement, people and locations.'
    ]
  },
  {
    version: '1.118.0',
    date: '2026-10-05',
    entries: [
      'A head start on objectives. Adopting the suggested objectives now ticks a balanced starter set of five, covering confidentiality, integrity and availability, all measured by Checkpoint: multi-factor authentication on every account, security awareness training, high and critical risks treated on time, backup restore tests on schedule, and incidents triaged within a business day. The others stay available to tick, and you can still add your own with + Add objective.',
      'Objectives now record their resources (people, time, budget and tools), as ISO 27001 Clause 6.2 asks. Suggested objectives arrive with theirs filled in; you can set them when adding an objective or change them with Edit. The register flags any objective without resources, and the objectives report and CSV export include them.',
      'Compliance calendar: click anywhere on an activity to open it. Activities can now be Completed or Closed as well as Active or Retired. Anything not Active drops out of what is due, overdue counts, owner reminders and the operating rhythm checks, and Show completed, closed and retired brings those items back into view.'
    ]
  },
  {
    version: '1.117.0',
    date: '2026-10-05',
    entries: [
      'Objectives now serve confidentiality, integrity and availability. The Information Security Policy states the ISMS aim (to protect the confidentiality, integrity and availability of information by identifying, analysing, evaluating and treating risk) and lists the current objectives from the Objectives register, with targets, dates and owners, each marked C, I or A. Regenerate the policy to pick up changed objectives. Suggested objectives now include multi-factor authentication coverage and backup restore tests (both measured by Checkpoint). Any objective aimed at one of your open risks is listed first and names the risk. The register shows what each objective protects.',
      'Owner reminders. Once a week, each person named as an owner is emailed their own list: actions due or overdue, scheduled activities, documents due for review, objectives at risk and evidence requested from them. Owners are matched to Microsoft 365 by exact name or email, and anyone who cannot be matched is reported, never guessed. Turn it on in Settings › Email digest. The scheduled monitor sends it when deployed, otherwise Checkpoint sends it when someone opens it, and nobody is emailed twice.',
      'Evidence requests. From Getting Annex A to 100%, Request from owners emails each control owner the controls waiting on their evidence, what to provide for each, and a link to its evidence folder. Requests show against the control and stay in the owner’s weekly reminder until the evidence arrives.',
      'After certification. Recording a certificate now puts the run-up to the next certification body audit on the compliance calendar: confirm the dates with the body (90 days before), a management review that considers the internal audit results (45 days before), and preparation with the surveillance pack, closed findings and fresh evidence snapshots (14 days before). These steps roll forward to the next audit when one is recorded. Recording a new certificate also offers the internal audit programme for the cycle.',
      'A dated plan for new clients. Your path to certification now shows which week of the plan you are in, what is due this week and what is behind. The first 30 days cover set-up, documents, risks and the Statement of Applicability; a typical organisation is ready for Stage 1 in about 90 days.'
    ]
  },
  {
    version: '1.116.0',
    date: '2026-10-05',
    entries: [
      'Objectives now measure themselves. Each objective Checkpoint suggested reads its own number from your records (posture score, training completion, policy acknowledgement, high-risk treatment, actions closed on time, incident handling, AI impact assessments). The register shows the reading, and the status follows it: On track or At risk, then Achieved or Missed once the date passes. Objectives you wrote yourself stay yours to update.',
      'New in the Statement of Applicability: Getting Annex A to 100%. Every applicable control that is not finished gets one next step, grouped. First come Checkpoint’s own steps: mark the controls the posture scan proves (evidence already captured), generate and approve the documents written for them, and schedule the activities that operate them. Then the scheduled activities to complete, and the controls that need you: failing checks, evidence to link, exclusions to justify and overdue re-verifications. Show lists the controls in each group, each opening its guidance.',
      'Internal audits are now conducted in Checkpoint. Conduct the audit lists every workpack line: open findings to follow up, then clauses, then controls, each with its evidence link and what to look at first. Record a result as you go (conforms, opportunity for improvement, minor or major nonconformity) with a note; each saves immediately. A nonconformity or opportunity raises its finding in the Actions register, linked to the audit and the line. Completing the audit drafts the summary and conclusion from the results, and the workpack becomes the internal audit report.',
      'Management review outputs. The review form has an Actions agreed field: one line per action (what; owner; due date), and each becomes an action in the Actions register, listed in the decisions. Each review now has Minutes (inputs considered, decisions and resources, actions agreed, and an approval block), which can be saved as Clause 9.3 evidence.',
      'Evidence for record-based clauses, filed for you. File register snapshots saves a dated copy of the register that proves each clause into its evidence folder and links it: the risk register (6.1.2, 8.2), the risk treatment plan and Statement of Applicability (6.1.3, 8.3), objectives and their measurement (6.2, 9.1), training records (7.2) and corrective actions (10.2). The internal audit report and management review minutes can be saved as Clause 9.2 and 9.3 evidence the same way.',
      'New: the Stage 1 pack, on the Management system clauses page. One document for the certification body before Stage 1: certification readiness and the mandatory documents, the Statement of Applicability, the risk treatment plan, objectives, the latest internal audit report and the latest management review minutes. It says what is still missing.'
    ]
  },
  {
    version: '1.115.0',
    date: '2026-10-05',
    entries: [
      'New: Getting the clauses to 100%. The Management system clauses page now lists every Clause 4-10 requirement not yet met, grouped by the one step that meets it. Checkpoint’s own steps come first, each with a Do it button: generate the missing documents, approve the drafts, adopt objectives, add opportunities, schedule the internal audit, assign training, send the policy for acknowledgement and schedule the operating rhythm. Next come the meetings Checkpoint prepares for you, then the few decisions only you can make. Each clause’s requirements drawer offers the same steps. The Annex A controls in the Statement of Applicability stay yours.',
      'New: suggested objectives. Checkpoint proposes measurable information security objectives that it can measure from its own records (posture score, training, policy acknowledgement, risk treatment, actions closed on time, incident handling), plus AI and privacy objectives where you hold those frameworks. Name an owner and a date, and Clause 6.2 is met.',
      'New: suggested opportunities. Clause 6.1.1 asks for opportunities as well as risks. Checkpoint now proposes them from your scope & context answers, for example certification opening tenders, reusing evidence for customer questionnaires, using security features already in your Microsoft 365 licence, and adopting AI safely.',
      'New: the pre-certification internal audit. Before you are certified, Schedule the internal audit plans the full audit that Stage 2 expects to see: the management-system clauses, then Annex A, far enough ahead for findings to be closed. Each audit comes with its workpack. After certification, the same step plans the three-year programme.',
      'The management review form now drafts all seven Clause 9.3.2 inputs from your records, not just three. Changes in issues and interested parties, feedback (incidents, audit and certification findings, policy acknowledgement) and improvement opportunities are now included. It also has a Resources field for top management’s decision on people, time, budget and tools (Clauses 5.1 and 7.1). The next review date follows your management review interval.',
      'Every clause requirement is now met by Checkpoint’s records. Clause 5.1 “built into business processes” is met by the approved HR security, supplier security, change management and operational planning documents. Clause 7.5.3 “document lifecycle” is met by the document control procedure and Checkpoint’s controlled, versioned document register.'
    ]
  },
  {
    version: '1.114.0',
    date: '2026-10-05',
    entries: [
      'Documents now state your frequencies, not ours. Policies no longer fix how often things happen (“at least quarterly”); they state the interval you have set, for example “at the interval the organisation has set (currently every six months)”. Recurring activities take their frequency from the compliance calendar, which you can now edit (frequency, owner, title, next date, or retire an activity). Risk review, document review, management review, internal audit and the inactive account period come from Settings → Thresholds and intervals. Change one, regenerate, and the documents follow. Statutory deadlines, such as the Privacy Act’s 30-day breach assessment, stay as the law sets them.',
      'Policies describe what you do. Statements that only apply to some organisations follow your scope & context answers: a fully remote organisation no longer gets office visitor and secure-area rules, outsourced-development rules appear only if you outsource development, and the Secure Development and Remote Working policies are only generated where they apply. Before an operational policy is approved, Checkpoint now asks “Do you do this?” for each statement: untick anything you do not do yet and it is taken out of the document, with an action raised to put it in place. Bulk approval asks you to confirm the documents describe what you do.',
      'New in Documents: Policy vs practice. It lists any document that no longer says what you do (generated before this release, or a frequency you have since changed) and any approved document committing to an activity that is not scheduled or is overdue, each with the button that fixes it: re-approve, regenerate, schedule, or open the calendar.',
      'Each framework now sees its own documents. An ISO 27001 client is offered information security documents only; AI documents belong to ISO 42001, and privacy documents to ISO 27701 or the Privacy Act. The ISO 27001 Legal & Regulatory policy now covers privacy obligations (A.5.34) itself. Documents already generated for a framework you do not hold are labelled in the register so you can mark them Superseded.',
      'Fixed: in a live tenant, editing or completing a compliance calendar item only saved its dates and status. Its notes, including the evidence link recorded when an operating-rhythm activity is completed, are now saved too.'
    ]
  },
  {
    version: '1.113.0',
    date: '2026-10-04',
    entries: [
      'New: the operating rhythm. The Compliance calendar can now schedule the recurring activities an auditor samples to see controls working: access reviews, log and alert reviews, vulnerability reviews, threat intelligence reviews, backup restore tests, asset and supplier reviews, awareness training, an incident response exercise, a continuity test and a legal register review. Each one says what evidence to keep. Complete it with a link to that evidence and the Annex A controls it covers are verified and marked Implemented (or kept In progress if only partly in place). It is also a step on the path to certification.',
      'New: suggested risks beyond Microsoft 365. Your scope & context answers now propose the risks a scan cannot see, such as reliance on an external development partner, source code access, untested backups, lost laptops for remote teams, SaaS suppliers, personal information and AI features, each with its controls and remediation actions. They appear with the scan findings in the Risk register to approve or dismiss, and a dismissal is remembered. The questionnaire now also asks whether software is developed by an external partner.',
      'Policies reviewed for sufficiency. Regenerate these to pick up the changes: Access Control (no longer requires Privileged Identity Management where your licence lacks it; adds joiner-mover-leaver, password and passkey rules, a break-glass account, source code and admin tool access, and segregation of duties; reviews are now quarterly), Secure Development (secure coding standard, repository access, security testing and penetration testing, outsourced development, test data and testing in production), Business Continuity (SaaS and source code backups, restore tests every six months, security during disruption, capacity), Logging (clock synchronisation and a monthly review), Supplier Security, Cloud Services (network security), Data Classification (data loss prevention and masking), Asset Management, Physical Security (organisations without premises), Change Management (security in projects), Control Testing (checking compliance with policies), Threat Intelligence (special interest groups) and Acceptable Use (AI tools). Documents now address 91 of the 93 Annex A controls.'
    ]
  },
  {
    version: '1.112.8',
    date: '2026-10-02',
    entries: [
      'Your own documents now count like Checkpoint’s. When you upload a policy or procedure you wrote yourself, choose which Checkpoint document it is your version of (or set it later under Details). Recording its approval then updates the ISO 27001 clauses and controls exactly as approving Checkpoint’s version would, and offers to mark Checkpoint’s generated copy Superseded, moving any evidence links to your document. Your file is never re-rendered or edited from template text.'
    ]
  },
  {
    version: '1.112.7',
    date: '2026-10-01',
    entries: [
      'The ISO 27001 clause checklist was re-checked line by line against the ISO/IEC 27001:2022 text, and its wording now carries every qualifier the standard states: supporting other managers’ leadership (5.1 h), criteria for performing risk assessments (6.1.2), objectives at relevant functions and levels kept as documented information (6.2), format and media (7.5.2), retrieval, use and legibility (7.5.3), audit planning requirements (9.2), the purpose of management review (9.3), and corrective action proportionate to its effects (10.2). The Objectives & Metrics document states the 6.2 additions too; regenerate it to pick them up.'
    ]
  },
  {
    version: '1.112.6',
    date: '2026-10-01',
    entries: [
      'A control’s detail panel (opened from its code or title in the Statement of Applicability) is now editable: switch Applicable on or off, set the implementation status, verify it, and link or change its evidence, without going back to the table. It also shows why the control is included, and asks for a justification as soon as a control is excluded.'
    ]
  },
  {
    version: '1.112.5',
    date: '2026-10-01',
    entries: [
      'Fixed: opening Checkpoint in the minutes after an update could briefly hide purchased modules (such as ISO 27701, NIST CSF or the AI add-on) until the next reload. The app now always checks for the current module files and retries once if one has just moved or the host has a brief outage.'
    ]
  },
  {
    version: '1.112.4',
    date: '2026-09-30',
    entries: [
      'Every ISO 27001 clause from 4.1 to 10.2 is now covered by a document written to its intent. The Information Security Policy states the Clause 5.2 commitments (a framework for objectives, meeting applicable requirements, continual improvement, communication and availability), top management’s Clause 5.1 leadership and Clause 7.1 resources. The roles register assigns conformity and performance reporting (5.3). The risk framework covers 6.1.1; objectives are communicated and monitored (6.2, 9.1); document control covers format, media, preservation and legibility (7.5); the audit programme, methods and responsibilities are defined (9.2); and continual improvement is stated (10.1).',
      'New document: the Operational Planning & Control Procedure (Clause 8.1): the ISMS processes and their criteria, the records that show they ran, control of planned and unintended changes, and control of externally provided services. It is part of the document set and the Clause 8.1 checklist.'
    ]
  },
  {
    version: '1.112.3',
    date: '2026-09-30',
    entries: [
      'Readiness is now two percentages for ISO 27001, ISO 42001 and ISO 27701: the management system clauses (4–10, the share of clause requirements met) and the Annex A controls (the share implemented). The Dashboard shows a tile for each, and so does your partner’s console.',
      'Approving a document now marks Implemented the controls where the approved document is the control itself: A.5.1 (information security policy), A.5.2 (roles and responsibilities), A.5.10 (acceptable use) and A.5.24 (incident management planning), plus their ISO 27701 and ISO 42001 counterparts. Documents approved before this update count too. Every other control a policy supports stays In progress until scan results or operating records show it working, because that is what an auditor tests.'
    ]
  },
  {
    version: '1.112.2',
    date: '2026-09-30',
    entries: [
      'Setup now offers your organisation’s logo on its last step, so the first policies and reports Checkpoint generates carry it. It can still be changed in Settings → Client branding.'
    ]
  },
  {
    version: '1.112.1',
    date: '2026-09-30',
    entries: [
      'The Risk Management Framework now covers ISO 31000 in full: its principles; the framework (leadership and commitment, integration into change, procurement and product work, and evaluating and improving the framework at management review); and the process, with the sources risks are identified from, what each treatment plan and register entry records, interim measures, and acceptances valid for no more than 12 months. It includes the criteria as tables: consequence by area (financial, legal and regulatory, reputation, customers, information, people), likelihood with indicative frequencies, the risk level matrix, and the response, reporting and approval required at each level. The questionnaire asks for your financial thresholds.',
      'The ISMS Scope Document now covers every Clause 4.3 requirement explicitly: the legal entity, products and services, business functions, people (including how contractors are treated), locations, technology, the Clause 4.1 issues and 4.2 requirements it was based on, the interfaces with other organisations, exclusions, and Clause 4.4. The scope questionnaire asks three new questions (legal name, people, technology; technology starts from your asset register), stray punctuation in answers is tidied, and approving the scope first checks for the contradictions an auditor picks up at stage 1.'
    ]
  },
  {
    version: '1.112.0',
    date: '2026-09-30',
    entries: [
      'Checkpoint now keeps a short progress summary in your own Settings list: steps done on the path to certification, clause requirements met, controls implemented, documents approved, register counts and your scope statement. Your Compliance365 partner sees it when they sync, so they can see where you are and help where you are stuck. It stays in your Microsoft 365 tenant.'
    ]
  },
  {
    version: '1.111.1',
    date: '2026-09-30',
    entries: [
      'Asset register: retiring a synced asset now sticks. Previously the next Sync from Microsoft 365 set any asset it still found back to Active, so retiring a synced app that is not really an asset (sign-in plumbing, for example) was undone.'
    ]
  },
  {
    version: '1.111.0',
    date: '2026-09-30',
    entries: [
      'ISO 27701 now uses the 2025 edition\u2019s Annex A exactly: 78 controls across Table A.1 (31 for PII controllers), Table A.2 (18 for PII processors) and the new Table A.3 (29 shared information security controls). Each A.3 control is mapped to its ISO 27001 counterpart, takes the same posture scan checks, and is linked from the same policy templates, so work done for ISO 27001 counts towards it.',
      'Risks linked to any ISO 27701 control are recognised as privacy risks, and the privacy awareness course now counts towards A.3.17.'
    ]
  },
  {
    version: '1.110.3',
    date: '2026-09-30',
    entries: [
      'Clause 5.1 (leadership communicates why the management system matters) is now checked automatically: it is met when the policy has been approved and at least 90% of staff have acknowledged it through a policy acknowledgement campaign. A leadership message can still be added as extra evidence.'
    ]
  },
  {
    version: '1.110.2',
    date: '2026-09-30',
    entries: [
      'Signing in on a new computer (or as a colleague) now finds your Checkpoint site on its own. Previously only the computer that ran setup remembered which SharePoint site holds your records, so any other computer was sent back through setup and asked for the licence again. Checkpoint now looks for your site in the tenant and opens it directly when there is exactly one.'
    ]
  },
  {
    version: '1.110.1',
    date: '2026-09-30',
    entries: [
      'Risks raised from a posture scan now arrive with the confidentiality, integrity and availability they threaten already set, and scan-raised risks created before this are filled in automatically (never overwriting a classification someone has already set). The AI risk draft also proposes C/I/A for review.'
    ]
  },
  {
    version: '1.110.0',
    date: '2026-09-30',
    entries: [
      'Opportunities: the risk register now has an Opportunities section for uncertainty that could help the organisation (ISO 31000), as ISO 27001 Clause 6.1.1 asks for risks and opportunities. Each is rated by likelihood and benefit, owned, reviewed, and given a response: pursue, share, retain or decline. Opportunities never count towards risk levels, the heatmap or the risk appetite, and they appear in the risk register report. Clause 6.1.1 now checks that opportunities are recorded, owned and reviewed.',
      'Confidentiality, integrity and availability are now three explicit choices when adding or editing a risk, instead of a free-text box. The register\u2019s CIA column shows which each risk threatens.'
    ]
  },
  {
    version: '1.109.0',
    date: '2026-09-30',
    entries: [
      'The risk register now records each risk as an ISO/IEC 27005 risk scenario: the assets affected (from the asset register), the threat or risk source, the vulnerability it exploits and the consequence if it happens, alongside the confidentiality, integrity or availability it threatens. The risk drawer shows the scenario and flags what is missing, and it appears in the risk register report and the risk treatment plan. Risks raised from a failed posture scan check record that check as their vulnerability automatically.',
      'Treatment decisions show their ISO/IEC 27005 names: Treat (risk modification), Tolerate (risk retention), Transfer (risk sharing) and Terminate (risk avoidance). Existing decisions are unchanged.',
      'The Risk Management Framework document now follows the ISO 31000 process step by step (communication and consultation, scope, context and criteria, assessment, treatment, monitoring and review, recording and reporting) and ISO/IEC 27005. It states the exact likelihood and consequence scales, the risk level bands, the acceptance criteria tied to your risk appetite, when assessments must be repeated, and both asset-based and event-based identification. Regenerate and re-approve it to pick up the new wording.'
    ]
  },
  {
    version: '1.108.0',
    date: '2026-09-30',
    entries: [
      'ISO 27701 now follows the 2025 edition: a standalone privacy information management system with its own Clauses 4\u201310, alongside ISO 27001 and ISO 42001 on the clause register. Each clause lists its requirements, including the privacy-specific ones: your role as PII controller or processor, the people the personal information is about, and a privacy risk assessment that considers the risks to them.',
      'Most ISO 27701 requirements tick themselves off from your records: privacy risks in the risk register, the privacy training course, Privacy Policy acknowledgements, privacy law in the legal register, the privacy documents (record of processing activities, rights procedure, DPIA process) and ISO 27701 audits. The Management System Evidence Pack covers ISO 27701 when it is the framework in view.',
      'The scope & context questionnaire asks ISO 27701 clients whether they act as a PII controller, a PII processor, or both. The Annex A privacy controls are unchanged in substance and keep their existing numbering, so nothing you have already recorded moves.'
    ]
  },
  {
    version: '1.107.0',
    date: '2026-09-30',
    entries: [
      'Clause requirements now tick themselves off from your registers. The risk register (owners, ratings, reviews, treatment, owner acceptance), built-in training completion, objectives and KPIs, policy acknowledgements, the legal register, internal audits (including whether an auditor audited a clause they own) and each management review input (9.3) are all read automatically. 65 of 68 ISO 27001 requirements are now checked from Checkpoint\u2019s own records.',
      'ISO 42001 clauses read the AI registers: AI risks in the risk register, the AI system register and its impact assessments, the AI use course, the AI Policy acknowledgement campaign, ISO 42001 audits and the ISO 42001 statement of applicability. 69 of 72 requirements are now checked automatically.',
      'New report: the Management System Evidence Pack (Reports, or Evidence pack on the clause register). Every clause, each requirement, how it is met and the evidence behind it, with everything still open listed first. Built for a Stage 1 audit.'
    ]
  },
  {
    version: '1.106.0',
    date: '2026-09-30',
    entries: [
      'Every management system clause now lists what it actually requires. Open "Requirements" on any clause (Clauses 4\u201310, ISO 27001 and ISO 42001) to see each requirement in plain English, the evidence an auditor expects for it, and whether it is met. Checkpoint ticks off what it can see in your documents, answers and registers; for the rest, you record where the evidence is.',
      'A clause can only be marked Implemented once every requirement is met and evidence is linked to it. The same rule applies when a document is approved, when Checkpoint updates clauses automatically, and when a clause is verified. Clauses already marked Implemented keep their status and show which requirements are still open.',
      'Clause 4 documents no longer fill unanswered questions with generic wording. Anything the organisation has not yet determined (its issues, interested parties, scope, climate change determination) shows as a highlighted "[To be completed]" in the draft, and the document cannot be approved until it is answered in Settings \u2192 Scope & context.',
      'Climate change (ISO/IEC 27001 and ISO/IEC 42001 Amendment 1, 2024): the scope & context questionnaire now also asks whether interested parties have climate-related requirements, and the AI Management System Scope records the climate change determination.'
    ]
  },
  {
    version: '1.105.1',
    date: '2026-09-27',
    entries: [
      'Fixed: setting up a new tenant could stop at the capability check, with Continue stuck on "Checking…". It now shows the summary and continues.'
    ]
  },
  {
    version: '1.105.0',
    date: '2026-09-25',
    entries: [
      'New Setup health (Settings → Setup health): every time someone signs in, Checkpoint checks its own setup. It checks the activation, Microsoft Graph permissions, every SharePoint list and column, the Documents library, framework content, evidence folders, the last scan and which Microsoft 365 capabilities your licensing includes. Each line says OK, Check or Fix.',
      'Problems come with a fix: Repair setup recreates any missing list, column or library, Grant admin consent opens the consent page for a missing permission, and Open licence goes straight to the activation. A banner tells anyone who can fix it when something is broken.',
      'Checkpoint now shares this setup status with Compliance365, so we can spot and fix a problem before you notice it. It sends only OK/Check/Fix per line, the app version and the date of your last scan, never anything from your registers, scan results or documents. Switch it off in Settings → Setup health.'
    ]
  },
  {
    version: '1.104.0',
    date: '2026-09-25',
    entries: [
      'Evidence folders: every applicable control and every clause, in every framework you hold, now has its own folder in the Checkpoint Documents library (Documents › Evidence › framework › control). Checkpoint creates them for you and adds new ones when you license a framework or mark a control applicable.',
      'Add files straight from a control\'s row in the Statement of Applicability, or a clause\'s row in Management system clauses. You can also drop files into the folder from SharePoint, Teams or a synced OneDrive folder. Each row shows how many files its folder holds and the date of the newest, flagged when that is older than your review cadence.',
      'Files in a folder link themselves: when Checkpoint loads and after each scan, a control or clause with files in its folder and no evidence linked is linked to the folder and moves from Not started to In progress. Nothing is ever marked Implemented automatically, and evidence you linked yourself is never replaced.'
    ]
  },
  {
    version: '1.103.0',
    date: '2026-09-25',
    entries: [
      'Internal audit workpack: Workpack on any internal audit builds its checklist for you — every clause and control the audit\'s scope covers, with its status, owner and the evidence already linked, audit prompts for each clause, and blank Result and Notes columns for the auditor. It flags what to look at first: anything not implemented, missing evidence, evidence not re-verified in 12 months, controls treating a high risk or with an open action, and items the auditor owns (clause 9.2.2 — auditors must not audit their own work). Open internal and certification body findings are listed for follow-up.',
      'If an audit\'s scope is free text Checkpoint can\'t map to clauses or controls, it asks once what the audit covers and adds that to the scope, so the Certification view\'s internal audit coverage counts it too.',
      'New Dashboard panel, What Checkpoint did in the last 12 months: posture scans and checks run, policies drafted, automated register updates, scan findings turned into risks and actions, questionnaire answers drafted, supplier questionnaires and reports generated, with a conservative estimate of the hours it replaced. Every assumption is shown, and Copy summary puts it on the clipboard for a renewal or quarterly review.',
      'New guide, POWER-AUTOMATE.md (linked from Settings → Microsoft Teams): four ready-to-build Power Automate flows that read Checkpoint\'s SharePoint lists — owner alerts for high-priority actions, same-day escalation of a suspected privacy breach, a weekly list of what\'s due, and new actions into Planner. No premium licence needed.'
    ]
  },
  {
    version: '1.102.0',
    date: '2026-09-24',
    entries: [
      'New Certification view (Assurance → Certification) for staying certified. Record the certificate — certification body, number, scope, issue and expiry dates — and Checkpoint lays out the three-year cycle: surveillance audits within 12 and 24 months, then recertification before expiry. The next audit and the expiry go on the compliance calendar automatically, and the Dashboard shows the next audit once you are certified.',
      'Record each certification body audit\'s outcome, and raise its findings straight into the Actions register, sourced to that certificate and run through the same corrective-action loop as internal findings.',
      'Internal audit coverage for the cycle: which management-system clauses and Annex A themes this cycle\'s completed internal audits have covered, and one click to schedule a three-year internal audit programme that covers them all before recertification.',
      'New Pre-audit pack report: the certificate and cycle, the certification body\'s findings and where they stand, what changed since the last visit, internal audit coverage, and everything overdue that the auditor will pick up — with recommendations.'
    ]
  },
  {
    version: '1.101.0',
    date: '2026-09-24',
    entries: [
      'Microsoft Teams notifications, set up from Checkpoint (Settings → Microsoft Teams): paste a Teams Workflows webhook URL and the scheduled monitor posts compliance alerts — posture drift, overdue actions, policies past review and the other governance findings — to the channel as they are raised, plus the compliance digest on its schedule. Each post is a card with an Open Checkpoint button. The monitor posts a confirmation when a channel is first connected, and Settings shows it, or the error if a post fails.',
      'Teams posts now use Teams Workflows webhooks. Microsoft retired Office 365 Connectors, including classic Incoming Webhooks, in May 2026, so a webhook.office.com URL no longer delivers — Checkpoint warns if one is pasted.',
      'The compliance digest now lists documents waiting for approval, and can go to Teams without any email set up.'
    ]
  },
  {
    version: '1.100.0',
    date: '2026-09-24',
    entries: [
      'New Asset register (Risk & posture → Asset register) for ISO 27001 A.5.9. Sync from Microsoft 365 brings in Intune devices with their primary user as owner, your Entra enterprise applications, SharePoint sites and the services in your vendor register, and keeps them current on every sync without overwriting the classification, criticality or notes you set. A device that disappears from Intune is flagged, never deleted. Add the information assets themselves — customer data, HR records, source code — by hand, because a device list alone is not an A.5.9 inventory.',
      'New Legal & regulatory register (Assurance) for ISO 27001 A.5.31 and Clause 4.2, with an Australian starting set — the Privacy Act and NDB scheme, ransomware payment reporting under the Cyber Security Act 2024, the Spam Act, record-keeping duties, SOCI and customer contracts — to confirm and assign owners. It is a prompt, not legal advice.',
      'The Statement of Applicability now gives every included control its justification for inclusion, as ISO 27001 6.1.3 d) requires: the risks it treats, the legal and contractual requirements it meets and the posture checks that monitor it. It appears in the SoA view, the SoA report and the CSV export.',
      'The Audit Readiness Report opens with a Stage 1 checklist of the mandatory documented information ISO 27001 requires — scope, policy, risk processes, SoA, risk treatment plan, objectives, competence, monitoring results, internal audit, management review, corrective action — plus the Annex A records an auditor samples first, each marked in place, incomplete or missing from your real data.',
      'Your path to certification gains three steps for ISO 27001 tenants: build the asset register, record legal and contractual requirements, and complete the mandatory documented information.',
      'New framework: Privacy Act (APPs). All 13 Australian Privacy Principles broken into their operative requirements, plus the Notifiable Data Breaches duties, as amended in 2024 — including the automated-decision transparency obligations that apply from 10 December 2026. Cross-mapped to ISO 27001, with scan suggestions from the subject rights, retention, MFA, encryption, DLP and incident checks. Comes with a new Privacy Management Plan template covering APP governance, access and correction timeframes and the 30-day breach assessment.'
    ]
  },
  {
    version: '1.99.0',
    date: '2026-09-24',
    entries: [
      'New Security questionnaires view (Reporting → Security questionnaires). Paste a customer\'s questionnaire or load it as CSV, and each question is matched to your Statement of Applicability, your latest posture scan and answers you have approved before. Every question gets an evidence verdict: Yes, Partial, No, Not applicable or Not evidenced, with the controls and checks behind it one click away. A draft answer is only written where the evidence says yes. Approved answers go into an answer library and are offered again next time, flagged if your evidence has changed since they were approved. Works on every tenant. With the AI add-on, Draft with AI writes the remaining answers from each question\'s own evidence.',
      'Defender depth: the patch check now reads Defender Vulnerability Management directly where advanced hunting is licensed. It fails on critical vulnerabilities with a known exploit that are older than your patch window (Settings → thresholds, default 14 days), in place of the Secure Score estimate. New Endpoint detection & response check: every device Defender knows about, including machines its discovery found that Intune never enrolled, must run a healthy sensor. New Phishing simulation check (Defender for Office 365 Plan 2) for ISO 27001 A.6.3. Both need a one-time consent prompt for two new read-only permissions. Without the licence they show as Manual.',
      'Purview: the encryption check now reads which sensitivity labels actually apply encryption, in place of a Secure Score name match.',
      'Secure development evidence from GitHub. The optional GitHub collector runs as a scheduled workflow in your own GitHub organisation and adds seven checks: reviewed pull requests, required status checks, secret scanning with push protection, open leaked secrets, Dependabot alerts, code scanning and organisation 2FA. These give ISO 27001 A.8.25, A.8.28, A.8.29 and A.8.32 automated evidence for the first time. They stay hidden until the collector first reports. See checkpoint/github/README.md.',
      'SOC 2 and NIST CSF 2.0 scan suggestions now include the new Defender and GitHub checks, for example CC8.1 change management from reviewed pull requests.'
    ]
  },
  {
    version: '1.98.0',
    date: '2026-09-24',
    entries: [
      'A change that fails to save to SharePoint is no longer silent. Every save is retried once if the failure looks temporary; one that still fails puts a standing banner at the top of the app — "N changes have not saved to SharePoint" — with Retry and Details, instead of a toast that disappears while the screen goes on showing the edit as saved. Checkpoint retries automatically every minute and when the connection returns, and warns before the page is closed with unsaved changes.',
      'The Dashboard\'s Getting started card is now "Your path to certification": every step from the scope & context questionnaire to booking the certification audit, in six phases — Set up, Document, Assess, Operate, Check, Certify. The next step is always shown with a button that does it (start the questionnaire, run the scan, generate or approve the document set) or opens where it is done, and each step ticks itself off as the work is recorded.'
    ]
  },
  {
    version: '1.97.0',
    date: '2026-09-24',
    entries: [
      'New Threat Intelligence Procedure in the policy generator (ISO 27001 A.5.7), built around Checkpoint\'s own Threat intel view: defined sources, weekly review, exposure assessment, and every relevant item turned into an action or a risk update.',
      '"Generate full document set" (Settings → Policy template library) generates every document the tenant\'s frameworks need that is not already in Documents, in one go — each saved as a draft and linked to its clauses and controls automatically. Existing documents are never regenerated.',
      '"Approve drafts" approves every generated draft in one sitting, for the meeting where management signs off the policy set: one approver, version and review date, the same per-document approval record as approving one at a time, and segregation of duties applied to each document.',
      'Management system clauses now complete themselves. When a clause\'s approved procedure is linked and its records exist — a completed internal audit in the last year (9.2), a management review with recorded decisions (9.3, 10.1), assessed and treated risks (6.1.2, 6.1.3), objectives on track (6.2), training complete (7.2, 7.3), a current document register (7.5), completed AI impact assessments (ISO 42001 6.1.4) — the clause is marked Implemented and re-verified automatically, and stays verified while those records stay current. When records lapse the clause is never downgraded; its verification simply turns overdue for a person to review.',
      'Generating a document now links it as evidence to the controls it was written for automatically, instead of asking. A control that already has other evidence keeps it.'
    ]
  },
  {
    version: '1.96.0',
    date: '2026-09-24',
    entries: [
      'The Audit Readiness Report now includes the management system clauses: every ISO 27001 clause for ISO 27001 and ISO 27701 reports, and every ISO 42001 clause for the ISO 42001 report, with status, owner, evidence and last verification. It flags clauses marked Implemented with no evidence, and the recommendations name each clause still to implement.',
      'Generating a management-system document now updates the clauses it is written for automatically. Saving the draft links it as evidence and moves the clause to In progress. Approving it marks the clause Implemented where the document itself is what the clause requires — context (4.1/4.2), scope (4.3), policy (5.2), roles (5.3) and communication (7.4). Procedures for processes that must also be carried out, such as internal audit, management review or risk assessment, stay In progress until their records exist. A clause already linked to different evidence, or already Implemented, is never changed.'
    ]
  },
  {
    version: '1.95.0',
    date: '2026-09-24',
    entries: [
      'The scope & context questionnaire now covers ISO 42001 too. For a tenant entitled to ISO 42001 it adds a sixth step that drafts the AI management system\'s Clause 4 content: the AI systems in scope (pre-filled from the AI system register), the organisation\'s role for AI (provider, user or both, from the AI-use answer), the AI-specific issues it faces, and an AIMS scope statement. The AI Management System Scope generates from them instead of asking for bracketed specifics to be filled in by hand.'
    ]
  },
  {
    version: '1.94.0',
    date: '2026-09-24',
    entries: [
      'The organisation profile is now a scope & context questionnaire (Settings → Scope & context). The client answers ten plain-English questions — size, ways of working, who runs their IT, which cloud services they use, what personal information they hold, what customers ask for, how they use AI, organisational change and climate exposure — then confirms what is in scope. Checkpoint drafts the ISO 27001 Clause 4 content from those answers for review: external and internal issues (4.1), what interested parties require (4.2), the climate change determination added by Amendment 1 (2024), interfaces and dependencies (4.3), and a one-sentence scope statement. The ISMS Scope Document and Organisational Context & Interested Parties generate from them.',
      'Re-running the questionnaire updates the drafted text only where nobody has edited it — a practitioner\'s own wording is never overwritten.',
      'Generated documents no longer show a doubled full stop where an answer ends with one and the template adds its own.'
    ]
  },
  {
    version: '1.93.0',
    date: '2026-09-24',
    entries: [
      'The Management system clauses register now covers ISO 42001 as well as ISO 27001. A tenant entitled to ISO 42001 sees its AI management system Clauses 4-10 as a second group, including 6.1.4 and 8.4 (AI system impact assessment), which have no ISO 27001 equivalent. Rows are added to existing tenants automatically and appear as soon as the entitlement is active. The CSV export gains a Framework column.'
    ]
  },
  {
    version: '1.92.0',
    date: '2026-09-24',
    entries: [
      'Eight new management-system procedures in the policy generator, covering the ISO 27001 clauses that an auditor expects to see as a written procedure: Organisational Context & Interested Parties (4.1/4.2), ISMS Change Planning Procedure (6.3), Competence, Training & Awareness Plan (7.2/7.3), Communication Plan (7.4), Document & Records Control Procedure (7.5), Internal Audit Procedure & Programme (9.2), Management Review Procedure (9.3), and Nonconformity & Corrective Action Procedure (10.1/10.2). Each one says how the matching register in Checkpoint is used, so the procedure and its evidence stay consistent.',
      'Four new Annex A policies: Legal, Regulatory & Contractual Requirements (A.5.31-A.5.33), Remote Working & Mobile Device (A.6.7, A.8.1, A.7.9), Information Transfer (A.5.14) and Cloud Services Security (A.5.23). Each can be linked as evidence to those controls once saved.'
    ]
  },
  {
    version: '1.91.0',
    date: '2026-09-24',
    entries: [
      'The Management system clauses register now covers Clause 10 as well: 10.1 Continual improvement and 10.2 Nonconformity and corrective action are rows like any other, added automatically to existing tenants. The 10.2 row shows how many nonconformities in the Actions register still have an open corrective-action loop, so the evidence an auditor asks for is one click away.',
      'Corrective-action references throughout the app now cite ISO 27001:2022 Clause 10.2, not 10.1. The 2022 edition swapped the two: 10.1 is Continual improvement, and 10.2 is Nonconformity and corrective action.'
    ]
  },
  {
    version: '1.90.1',
    date: '2026-09-24',
    entries: [
      'Fixed the "Management system clauses" sidebar badge going stale after changing a clause\'s status, verifying it, or linking evidence — it now updates immediately, matching the "Not started" count on the page itself.'
    ]
  },
  {
    version: '1.90.0',
    date: '2026-09-23',
    entries: [
      'New "Management system clauses" register (Frameworks → Management system clauses) tracking ISO 27001 Clauses 4-9 — the management-system requirements themselves, as distinct from the Annex A controls in the Statement of Applicability. Status, owner, verification and linked evidence per clause, the same actions the SoA offers per control, deliberately without an Applicable toggle: unlike a control, a clause can never be excluded, which is why this is its own register rather than more rows in the SoA.'
    ]
  },
  {
    version: '1.89.0',
    date: '2026-09-23',
    entries: [
      'New "Roles & Responsibilities" document in the policy generator (ISO 27001 Clause 5.3) — assembled automatically from the "Who is responsible" table of every other generated policy, procedure and plan, deduplicated by role name with each responsibility traced back to its source document. Regenerating it always reflects the current state of the policy set, so it never drifts the way a hand-maintained copy would. Limited to the frameworks the tenant is actually entitled to, the same as the generator\'s own template picker.'
    ]
  },
  {
    version: '1.88.0',
    date: '2026-09-23',
    entries: [
      'New Objectives register (Assurance → Objectives register) for ISO 27001 Clause 6.2 — set measurable information security objectives with a metric, a target, an owner and a due date, and track progress against them (Not started / On track / At risk / Achieved / Missed) with dated progress notes, closing the gap between restating policy intent and actually evidencing Clause 6.2/9.1. Summary tiles show what\'s at risk, overdue or achieved; exports to CSV alongside every other register.'
    ]
  },
  {
    version: '1.87.0',
    date: '2026-09-23',
    entries: [
      'Policy documents can now carry a leadership-commitment foreword -- a first-person statement from whoever leads the organisation, rendered as its own "A message from leadership" section right after the document-control block, signed with the SAME Approved by / approval date the document already captures once it\'s approved (no separate signature field to keep in sync). Directly addresses ISO 27001 Clause 5.1\'s expectation that top management demonstrate commitment. Off by default and editable per document -- the Information Security Policy ships with one, and any policy can add its own via the document editor\'s new "A message from leadership" field.'
    ]
  },
  {
    version: '1.86.0',
    date: '2026-09-21',
    entries: [
      'Policy documents now come in three visual layouts -- Standard (this app\'s own brand), Formal (white, serif, no icons -- for regulated or traditional industries), and Minimal (white, restrained, accent used once) -- chosen in Settings → Client branding → "Policy document layout". Applies consistently across the generated HTML view, PDF export, Word export and bulk export (HTML and Word both); already-generated documents keep the look they were generated with.'
    ]
  },
  {
    version: '1.85.0',
    date: '2026-09-21',
    entries: [
      'Vendor risk: "Request self-service link" queues a vendor for the opt-in automated questionnaire path -- if the scheduled monitor (SETUP.md § Continuous monitoring) is deployed with email configured, it emails the vendor contact a no-sign-in link to a short self-service form and their answers land in the register automatically, no transcription needed. Without the monitor deployed, nothing breaks -- the existing manual send/record pair keeps working exactly as before.'
    ]
  },
  {
    version: '1.84.0',
    date: '2026-09-21',
    entries: [
      'Vendor risk: "Send questionnaire" now asks a short, structured set of Security/Privacy/AI questions instead of a free-text paragraph -- and a new "Record answers" action lets you transcribe a vendor\'s reply into the register, so the answers live on the vendor record instead of only in an inbox. The AI section suggests an EU AI Act risk tier once a vendor confirms they use AI, reusing the same classifier the AI systems register already has. Questionnaire status now genuinely reaches "Received", not just "Sent".'
    ]
  },
  {
    version: '1.83.0',
    date: '2026-09-21',
    entries: [
      'Word export is now a real .docx (OOXML), not an HTML document wearing a .doc extension -- opens natively in Word with real styles, not through its compatibility importer. Both the single-document "Word" action and the bulk "Export all policies (ZIP)" produce .docx now; the bulk HTML option is unchanged. Same uncontrolled-copy banner, same content, same audit trail -- just a genuine Word document underneath.'
    ]
  },
  {
    version: '1.82.0',
    date: '2026-09-21',
    entries: [
      'Documents: approved policies now have a "PDF" action alongside "Word" -- opens the same print-ready preview already used when a policy is first generated, so getting a current PDF no longer means regenerating the document. Same uncontrolled-copy banner and audit trail as the Word export.'
    ]
  },
  {
    version: '1.81.1',
    date: '2026-09-20',
    entries: [
      'Clarified the Email digest copy (Settings, and the Dashboard\'s due banner): the scheduled PostureMonitor Azure Function can already send this digest unattended once deployed with NOTIFY_FROM/NOTIFY_TO configured -- both spots now point at azure/README.md\'s "The periodic digest" section directly, instead of vaguely gesturing at "the scheduled monitor". No behaviour change; the due-date arithmetic is now one digestIsDue() function instead of duplicated inline.'
    ]
  },
  {
    version: '1.81.0',
    date: '2026-09-20',
    entries: [
      'The AI tools group collapses from four nav items to one. AI assistant, Questionnaire assistant, Mock auditor and Evidence request simulator now share a single "AI tools" hub with one Azure OpenAI config card at the top and a tab picker beneath it, instead of four separate views each with their own not-configured message and no path back to the config form they all depended on. Configuring the connection once now unlocks all four immediately, wherever you are in the hub -- previously, landing on Questionnaire/Mock auditor/Evidence request simulator before configuring showed a dead-end "configure the AI assistant first" message with only a docs link, not the form itself. Nav item count drops from 29 to 26.'
    ]
  },
  {
    version: '1.80.1',
    date: '2026-09-20',
    entries: [
      'Closed a gap in the restricted Staff view (1.64.0): the Settings gear icon and "Run posture scan" button in the topbar reached the full admin console directly, bypassing the trimmed nav entirely, and Ctrl/Cmd-K opened the full command palette -- including "Run posture scan", every "Add X" command, and a live search index over real risk/action/vendor records -- regardless of whether its topbar trigger was even visible, since the keyboard shortcut is a global listener. Found testing the restricted view at phone width, where the crowded topbar made the leak obvious. All three are now hidden/disabled for a restricted session, same "UX only, not enforcement" posture as everything else that view already trims.'
    ]
  },
  {
    version: '1.80.0',
    date: '2026-09-19',
    entries: [
      'Audit findings are back on a 30-day default, and now have their own setting (auditFindingDueDays) rather than borrowing a severity band. 1.77.0 routed them through the remediation windows for consistency, which moved the default from 30 days to 14 -- tidier, but wrong: a nonconformity answers to the body that raised it, and a certification body typically wants a corrective action plan within 30 days for a major and closure by the next surveillance visit for a minor. Those terms are the CB\'s, not the standard\'s, and not a function of the finding\'s own priority, so a High audit finding and a High posture-scan action can legitimately carry different dates. Same validation as the other windows: a blank, non-numeric, zero or negative value falls back to 30.'
    ]
  },
  {
    version: '1.79.0',
    date: '2026-09-19',
    entries: [
      'Remediation windows are now yours to set. Critical/High/Medium/Low each have a setting (Settings -> thresholds), so an ISMS that commits to different figures says so once instead of overriding every action by hand; the shipped 7/14/30/60 are just the fallback, and a blank, non-numeric, zero or negative value falls back rather than producing an action due before it was raised. ISO prescribes no remediation timeframes at all -- what it asks is that the windows YOU documented are applied and met, which is exactly why these belong in Settings rather than in our source.',
      'Audited the 53 posture-scan finding templates against those bands. Each template carries its own timeframe on purpose -- publishing retention labels across an estate takes longer than switching on a Conditional Access policy -- but six had drifted far enough to invert the bands: two Critical findings given 21 days, and four High findings given 45, while Medium findings elsewhere got 21. A register that hands the more serious finding the later deadline argues against its own prioritisation. Each band now has a ceiling of the next milder band\'s window (Critical 14, High 30, Medium 60, Low 90); a finding may still be faster than its band, never slower than the ceiling, and a test enforces it so the same drift cannot return.'
    ]
  },
  {
    version: '1.78.0',
    date: '2026-09-19',
    entries: [
      'The risk register now does three things its own Risk Management Framework policy template already said it did. Each risk records which of confidentiality, integrity and availability it threatens (ISO 27001 6.1.2 c)1) asks for risks in those terms; Category was a different axis). Each risk records when it was last reviewed and by whom, with open risks past the tenant\'s cadence -- new setting, default 90 days to match the template\'s quarterly commitment -- flagged on the register and its summary tiles, and never-reviewed risks called out as such; clause 8.2 wants assessments at planned intervals and nothing evidenced that before. And residual risk can now be ASSESSED rather than only estimated: the arithmetic estimate (one point off likelihood per completed action) stays the default and is labelled as an estimate, but "Assess residual" records a practitioner\'s own re-evaluation with treatment in place, which is how ISO/IEC 27005 expects residual to be determined, and that takes precedence everywhere the residual is shown. An assessment can be worse than the estimate, which is the case the formula cannot produce. The seven new SharePoint columns self-heal onto already-provisioned tenants on next load -- no re-provisioning, and existing risks read as unclassified/never-reviewed/estimated rather than being back-filled with invented values.'
    ]
  },
  {
    version: '1.77.0',
    date: '2026-09-19',
    entries: [
      'Action due dates now follow the priority instead of a flat default. Every path that raises an action -- the manual add form, treatment actions created with a risk or added to one later, findings raised from an internal audit, and CSV rows imported without a date -- reads one table: Critical 7 days, High 14, Medium 30, Low 60. Changing the priority on the add form moves the date with it. Treatment actions also inherit the priority of the risk they treat, from that risk\'s own L x I band, so a 5 x 5 risk opens a Critical action due in a week rather than the Medium/30 everything used to get regardless of severity. Dates stay editable; posture-scan findings keep the specific timeframe their template carries. These windows are a documented default, not an ISO requirement -- ISO 27001 and 42001 prescribe no remediation timeframes at all, they require that you set your own proportionate to risk and can show you met them -- so override them where your ISMS says otherwise. SETUP.md covers the reasoning.'
    ]
  },
  {
    version: '1.76.1',
    date: '2026-09-15',
    entries: [
      'The CPS 234 demo now covers third parties. Its illustrative control slice took one control from each of the standard\'s nine categories, which left out the related-party and third-party obligations entirely -- a sixth of CPS 234, and one of the things that most distinguishes it. That also had a visible effect: the Supplier Security Policy was the one CPS 234 policy missing from the picker\'s CPS 234 group, because the group lists a document under a framework whose controls it cites and none of the three the policy cites were in the slice. Adding the foundational third-party control fixes both, and the demo register now carries it so the policy can link evidence to it rather than pointing at a row that does not exist.'
    ]
  },
  {
    version: '1.76.0',
    date: '2026-09-15',
    entries: [
      'The policy library now groups by CPS 234 as well as by ISO 27001. A document appears under its usual framework group and again under any framework whose own controls it cites, so the six policies that evidence CPS 234 paragraphs are findable under CPS 234 without disappearing from ISO 27001 -- which matters because a CPS 234 client is nearly always an ISO 27001 client too, and moving them would have emptied that list of its core policies. The same rule fixes two documents that were already in the wrong place: the AI Acceptable Use Policy cites AI controls but never appeared under ISO 42001, and the Privacy Policy cites PIMS controls but never appeared under ISO 27701.'
    ]
  },
  {
    version: '1.75.0',
    date: '2026-09-15',
    entries: [
      'A new Control Testing & Independent Assurance Policy. ISO 27001\'s A.5.35 -- independent review of information security -- had no template behind it, which is a gap in its own right for anyone heading into certification, and it also left six CPS 234 paragraphs with nothing to evidence them. The policy sets out how control effectiveness is tested, that testers must be functionally independent of the function owning the control (a separate reporting line, not a separate employer), how a supplier\'s own test report is assessed before it is relied on, and that a deficiency which cannot be fixed in time is escalated to the Board whatever its severity. Five of the six paragraphs are now covered.',
      'The Incident Response Plan now treats external notification as something you work out before an incident, not during one. It asks for every notification obligation to be listed in the plan in advance with its recipient, its trigger and its deadline, and states that a fixed deadline runs from the point of becoming aware -- not from confirmation or the end of an investigation. A second statement covers the obligation, separate from any incident, to report a material control weakness the organisation does not expect to fix in time; that one is triggered by the weakness rather than by an event, so a plan built entirely around incidents never fires it. The obligations render from your own declared regulatory context, so an APRA-regulated client sees APRA named while an ISO-only client is not made to commit to a prudential deadline that does not apply to it.'
    ]
  },
  {
    version: '1.74.0',
    date: '2026-09-15',
    entries: [
      'CPS 234 clients now get policy templates. Five of the ISO 27001 policies -- Information Security, Incident Response, Supplier Security, Data Classification and Asset Management -- are now offered under a CPS 234 group in the policy picker, and a document generated from one records the specific CPS 234 paragraphs it evidences rather than only the ISO controls. Fourteen of the standard\'s twenty-four paragraphs are covered this way. The rest are left deliberately unmapped: several ask for an activity performed by a named party -- internal audit forming a view, an independent specialist running a test -- and a policy document cannot evidence those. Claiming them would tell an APRA reviewer a paragraph was covered when nothing had been done.',
      'The "link as evidence" prompt no longer counts controls your tenant does not have. A policy template can name controls from several frameworks at once -- the Privacy Policy documents both ISO 27001 and ISO 27701 controls -- and it is offered to anyone holding any one of them. The linking itself was always correct and skipped the rest, but the numbers around it were not: the prompt offered to link six controls and the confirmation said six were linked when only three existed for that tenant. Both now count what will actually be linked.'
    ]
  },
  {
    version: '1.73.1',
    date: '2026-09-14',
    entries: [
      'Every field in Settings now announces its own name to a screen reader. The threshold fields each carried a visible label beside them but were not associated with it, so the browser fell back to the example value shown in the empty field -- which for these is a number. All fifteen announced as their own default: three separate fields called "95", two called "5", two called "30". Anyone working without sight of the screen had no way to tell the MFA coverage threshold from the device encryption one. The same fault, for the same reason, affected the client display name, classification marking, report footer, digest recipients, SOC 2 observation date, evidence URL, monitor Client ID and the copilot box, each of which announced an example rather than a name.'
    ]
  },
  {
    version: '1.73.0',
    date: '2026-09-14',
    entries: [
      'The Owner Console can sync the whole client roster from one button. Syncing was one client at a time, each through its own sign-in, so a partner with a dozen clients had to click Sync a dozen times -- which in practice meant the roster was only ever as current as the last time someone sat and did that. "Sync all" now walks it, reusing a cached sign-in wherever one exists so most clients need no window at all, and taking the least recently synced first so stopping part-way still leaves the roster better off than it was. If the browser blocks a sign-in window -- which it does for any window not opened by a click -- the run pauses and offers to continue rather than stamping the same failure against clients that are perfectly fine. A partial run always says how many were not attempted.',
      'Every link the app renders is now protocol-checked, including advisory links in Threat intel. That was the only one of thirty-three that was not, and while it could not actually carry a dangerous link (the feed builds it from a fixed prefix), a rule like "every rendered link is checked" is only worth having if it holds everywhere without someone having to trace each link back to find the exception.'
    ]
  },
  {
    version: '1.72.0',
    date: '2026-09-14',
    entries: [
      'The Financial risk analysis view no longer freezes on a large risk register. The simulation and its summaries ran synchronously, so opening the view, generating a board report or running a scan stalled the page for as long as they took -- around 400ms on a 40-risk register and over a second on a large one, with no spinner because nothing else could run. Most of that turned out to be not the simulation but the sorting done to summarise it, once per risk. That work is now roughly three times faster and the view is about twice as fast overall; the figures it produces are byte-for-byte identical to before.',
      'The Statement of Applicability now shows what is actually behind the implemented count: how many of those controls are demonstrated by passing scan observations, how many rest on linked evidence, how many on a person\'s verification alone, and how many on nothing at all. "68% implemented" says nothing about how much of it an assessor can inspect, and that breakdown is the first thing they ask for. Each count filters the table like every other number in the view, and the unsupported figure is shown even when it is zero -- a clean result is worth seeing, and hiding it would make it look like the feature was missing.'
    ]
  },
  {
    version: '1.71.0',
    date: '2026-09-14',
    entries: [
      'The Financial risk analysis view now gives the same answer twice. It used to re-seed its simulation from the clock on every render, so the figures moved a little each time you opened it -- and the board report, which seeded separately, disagreed with the screen for a register that had not changed at all. The simulation is now seeded from the risk register\'s own contents, so the numbers move when the risks move and not otherwise. The same register always produces the same board pack.',
      'Replaced the "Worst simulated year" tile with expected shortfall -- the average of the worst 1-in-100 years. The old tile showed the single worst trial, which is a fact about how many times the simulation rolled the dice rather than anything about your risk: it grew every time the trial count did, and moved by roughly a third between two page loads. Expected shortfall answers the same question, settles on a stable figure, and is the measure financial regulators moved to for the same reason.',
      'Each risk\'s loss and frequency assumptions can now be edited. Until now every figure in the view came from one generic table mapping likelihood and impact scores to illustrative dollar ranges -- fine as a starting point, but there was no way to enter a real number where you had one. Any of the six inputs can be set per risk, blank fields keep the default band, and the ranking table marks which risks are running on your own figures rather than the defaults.',
      'Exposure is now tracked over time. Every posture scan records the simulated annual loss alongside the score, and the view charts it -- so you can show a board that remediation moved the number, in money, rather than only that a control went green. This was only worth doing once the simulation stopped drifting between runs: trending a figure that wobbled on every render would have shown noise as progress. Scans from before this release are left out of the line rather than drawn as zero.',
      'Fixed a latent hang: a frequency above roughly 745 events per year would have locked the browser tab in the simulation loop. It was unreachable while the ranges were fixed, and reachable the moment you could type one in, so it is now capped -- with a note if you enter something above it.'
    ]
  },
  {
    version: '1.70.0',
    date: '2026-09-14',
    entries: [
      'Two new device checks read the security state of the endpoint itself, rather than whether a policy about it exists. "Disk encryption enforced across the fleet" reports the proportion of managed devices actually reporting an encrypted disk -- which Intune\'s own compliance figure does not tell you, because a tenant whose compliance policy never required encryption reports 100% compliant with an unencrypted fleet. Devices that do not report an encryption state at all are excluded and counted separately rather than held against you, and the note says how many, so the percentage is never mistaken for whole-fleet coverage. The target and review floor are both configurable in Settings and default to 100% and 95%.',
      '"No jailbroken or rooted mobile devices enrolled" flags enrolled iOS and Android devices reporting as compromised. A rooted phone that Intune reports as compliant is worse than an unmanaged one, because every control the compliance state is asserting can be defeated locally -- the tenant is being told the device is safe precisely when it is not. A fleet with no mobile devices shows as Manual rather than a permanent green tick for a question that does not apply. Neither check needs a new permission: both read fields on the device list the compliance check already fetches.',
      '"No dormant enabled accounts" is the other half of the existing leaver check. That one looks at accounts somebody already disabled and asks whether the rest of the offboarding finished; this finds the accounts nobody disabled at all -- an enabled credential unused for a quarter is an unfinished offboarding, an unowned service account, or a contractor whose engagement ended. Accounts that have never signed in are reported as their own number, because break-glass accounts legitimately sit there. A handful is a Review; dozens is a Fail, because that is not a tenant with many break-glass accounts. The window and threshold are configurable and default to 90 days and 5 accounts.',
      '"MFA registration coverage" reads who can actually complete MFA, as against what Conditional Access requires -- the same configuration-versus-reality pairing as the legacy authentication checks added last release. The two come apart constantly: a tenant with a flawless tenant-wide MFA policy and forty users who have never registered a method has not protected those accounts, it has arranged for them to be locked out, and what usually follows is an exclusion group that quietly undoes the policy. An administrator who cannot complete MFA fails the check outright whatever the overall percentage, because averaging a Global Administrator into a fleet-wide figure is how the most valuable account in the tenant gets rounded away.',
      'All four checks also run in the scheduled monitor, so a laptop enrolling unencrypted or a phone that gets rooted overnight raises a drift alert and an email. None of the four needs a new permission: the two device checks read fields already being fetched, and the two account checks spend the audit-log permission added in 1.69.0. Where a licence or role is genuinely missing they report Manual rather than dragging the score down for a question the tenant was never able to answer.'
    ]
  },
  {
    version: '1.69.0',
    date: '2026-09-13',
    entries: [
      'A posture scan now tells you what moved. Every scan has always recorded how each individual check answered, and the app never read it back -- so a re-scan showed you a score and left you to work out which controls were behind the change. The scan view now opens with what changed since the previous scan, grouped worst first: checks that went backwards, checks that stopped answering, and checks that improved. It covers any downgrade, not just outright failure, so a control slipping from Pass to Review is visible too -- which is exactly the kind of quiet degradation a quarterly review exists to catch. No new permission and no new scan: the evidence was already being recorded.',
      'The scheduled monitor now raises an alert on any control degradation, not only on a check going from Pass to Fail. Pass to Review and Review to Fail previously reached neither the alert queue nor anyone\'s inbox, so a control could walk Pass to Review to Fail across two nightly runs without raising a single alert on either step. Alerts are now coloured by where the check landed, so a slip to Review is not painted the same red as an outright failure. A check that stops answering -- a lapsed licence, a lost role -- is reported separately and never as a regression: it means the signal became unreadable, not that a control changed.',
      'Two new checks read the Entra audit logs rather than the configuration -- the first in Checkpoint to report what a tenant actually did rather than how it is set up. "No legacy authentication observed in sign-in logs" sits alongside the existing legacy-authentication check and answers the question that one cannot: whether any legacy sign-in actually succeeded despite the policy. A Conditional Access policy scoped past one service account still using IMAP leaves the configuration check passing while those sign-ins keep bypassing MFA entirely. Attempts that were blocked show as Review rather than Fail -- a blocked attempt is the control working.',
      '"Privileged role changes reviewed" lists every privileged role change in your review window, with who made it, who received it and when -- the answer to an auditor asking for exactly that, without anyone exporting a spreadsheet the week before. It never fails: somebody being granted a role is not a defect, and what the standards actually require is that the change was authorised, which no API can decide. Self-service PIM activations are excluded, since a user elevating into a role they are already eligible for is the control working as intended. Both checks need the AuditLog.Read.All permission and appear as Manual until it is consented; sign-in logs additionally need Entra ID P1. The review window is configurable in Settings and defaults to 30 days, matching Entra\'s own log retention.'
    ]
  },
  {
    version: '1.68.0',
    date: '2026-09-13',
    entries: [
      'Fixed an accessibility defect worth knowing about: after opening and closing any record\'s detail panel, the panel\'s buttons stayed reachable by keyboard even though it was off screen. Tabbing from the top of the page went through five invisible controls, the last of them Delete -- which would prompt to permanently remove a record the user could not see. The panel now leaves the keyboard order when it closes.',
      'Added a "Skip to content" link. The sidebar has 30 destinations, so anyone navigating by keyboard or screen reader had to tab through all of them to reach the content of the view they were already on, on every view.',
      'Internal audits, Incidents, Management review and the Compliance calendar now open with a summary strip, matching every other register -- audits past their planned date, incidents still open or with a privacy assessment outstanding, days since the last management review, and calendar activities overdue or due within 30 days. The Audit log deliberately has none: it is an append-only record with nothing to triage.',
      'Documents can now be bulk-edited -- tick any number and set their status or owner at once, the two fields ISO 27001 clause 7.5.2 expects every controlled document to carry. Training and Policy attestation deliberately do not offer this: those rows record what another person did (acknowledged a policy, passed a comprehension check), and editing them in bulk would mean marking colleagues as trained on their behalf. Chasing outstanding ones stays where it belongs, as a campaign reminder.'
    ]
  },
  {
    version: '1.67.0',
    date: '2026-09-13',
    entries: [
      'Bulk editing now covers the Actions register and Vendor risk as well as the Statement of Applicability. Tick any number of rows and set status, priority or owner across actions; criticality or owner across vendors; or mark a whole selection of vendors reviewed, which asks for the next review date once rather than once per vendor. Every row still gets its own audit-log entry, because that is what an auditor samples. Viewers see no checkboxes, as with every other editing control.',
      'Column headers now stay put on every screen size, not just on wide desktops. On a narrower screen the register scrolls within its own bounded pane -- the header pinned to the top of it -- rather than the page scrolling sideways; on a wide screen it behaves as before, pinned below the toolbar. The Statement of Applicability\'s control-family headings follow the same rule.',
      'Fixed: on the Actions and Vendor registers, where clicking a row opens its detail panel, ticking a row\'s selection box no longer also opens that panel over the table you are selecting in.'
    ]
  },
  {
    version: '1.66.0',
    date: '2026-09-13',
    entries: [
      'The Statement of Applicability can now be edited in bulk. Tick any number of controls and set their status, or mark them applicable or not applicable, in one go -- walking a framework after a gap analysis no longer means opening ninety dropdowns one at a time. The evidence warning that appears when you mark a control Implemented without linked evidence is asked once for the whole batch, naming how many it applies to, rather than once per control; each control still gets its own audit-log entry, because that is what an auditor samples. Marking controls not applicable reminds you that each one needs a justification (ISO 27001 clause 6.1.3(d)). Viewers see no checkboxes, as with every other editing control.',
      'The accent colour now follows the same rules as the Compliance 365 website. Deep orange remains the brand fill on every button, active filter and rule, but text that used to be painted in it -- card headings, section labels -- now uses the legible end of the orange ramp for whichever background it sits on. As text on the dark theme the old value measured 3.41:1, under the 4.5:1 accessibility minimum, and button labels sat at 4.03:1; both now pass, and a sweep across twelve views finds no remaining text below the minimum in either theme.',
      'The Risk register opens with a summary strip -- open risks, high/critical residual, above risk appetite, and risks with no owner -- matching every other register in the app, and sitting beside the heatmap rather than leaving that half of the page empty. Each tile filters the table below it, and the "above risk appetite" count is now computed in one place shared with the Dashboard banner, so the two can never report different numbers.',
      'Fixed: every view now redraws when you navigate to it. Eight views, the Dashboard and Risk register among them, were never refreshed on navigation and could show figures computed some time earlier -- most visibly, switching to the light theme left the risk heatmap\'s counts nearly invisible until something else happened to redraw them.',
      'Fixed: keyboard focus is visible again on the status dropdowns and other compact inputs, which had lost their focus ring; the on/off switches now have a large enough tap target on touch; and the status dropdowns, framework target-level selects and Settings inputs now announce what they control to a screen reader instead of only their current value.'
    ]
  },
  {
    version: '1.65.0',
    date: '2026-09-13',
    entries: [
      'Column headers now stay put while you scroll a register, and so do the Statement of Applicability\'s family headings -- so you can still tell which column you are reading, and which control family you are in, sixty rows down. Both were written to behave this way and neither ever did: the card wrapping each table was silently acting as a scroll container, which pins a sticky header to something that never moves. Applies on screens 1400px and wider, where no register needs to scroll sideways; narrower screens keep the horizontal scroll they have today.',
      'The Posture scan\'s check list can now be filtered by status -- All, Need attention, To review, Clear -- with a count on each. Triaging 40+ checks across eight categories previously meant opening each category and reading past its passing checks to find the failures. Filtering opens whatever matches, and categories with nothing in them drop out rather than leaving empty sections to click through.',
      'Every summary tile whose figure is a share of something -- framework readiness, implemented-of-applicable, and the register filters on the Statement of Applicability, Vendor risk and AI systems -- now carries a small bar showing that share, so a strip of tiles can be compared at a glance instead of by reading each number. Tiles that are a plain count, with no total to measure against, deliberately do not get one.',
      'The Dashboard\'s posture score now shows the same ring the Posture scan draws, so the headline number reads as a position on a scale rather than a bare figure, and the Dashboard\'s tile strip is split into "Audit readiness" and "Risk & obligations" with the label carried once above each rather than repeated on every tile.'
    ]
  },
  {
    version: '1.64.0',
    date: '2026-09-09',
    entries: [
      'Added a third, automatic role: an employee who signs in but holds no Entra directory role and isn\'t in either of the two existing Checkpoint Practitioners/Viewers groups now sees a trimmed "Staff" view -- just their own outstanding policy acknowledgements and training assignments, nothing else -- instead of the full practitioner console. Before this, every signed-in employee saw the same risk register, vendor list and every other colleague\'s attestation status as the person actually running the compliance programme. No setup required: it needs no new Entra group and no new permission grant, since it reuses the Directory.Read.All scope already consented at sign-in. A tenant that has already set up the Checkpoint Practitioners/Viewers groups keeps exactly today\'s behaviour, unaffected. Previewable in demo mode via ?role=restricted, same as the existing ?role=viewer.'
    ]
  },
  {
    version: '1.63.6',
    date: '2026-09-09',
    entries: [
      'Fixed a live defect: launching a Policy attestation campaign or assigning Training against an Entra group could email -- and create a register row for -- the same person more than once. Microsoft Graph\'s transitiveMembers endpoint (what a group-scoped audience resolves through) can return one person twice when they\'re reachable via more than one nested-group path, and nothing downstream ever checked for that. The audience is now de-duplicated by UPN in the one place both flows share, before any row is written or any email sent.'
    ]
  },
  {
    version: '1.63.5',
    date: '2026-09-09',
    entries: [
      'Policy attestation now opens with a summary strip -- Outstanding / Acknowledged / Exempt -- matching the Statement of Applicability, Training, Documents, Vendors and AI systems registers, which all got one already. Every other register answered "what needs my attention" before the practitioner scrolled to the table; this one didn\'t. Clicking a tile filters the records table below it, using the same definition of each slice as the existing filter pills, so the number on a tile and the rows it opens can never disagree.'
    ]
  },
  {
    version: '1.63.4',
    date: '2026-09-08',
    entries: [
      'Client-side error reporting is now live. A genuine JS crash in the Checkpoint app -- across any client tenant -- now reaches the owner console\'s Errors tab, the only visibility into a bug hitting a signed-in practitioner\'s browser that this app has ever had. Never sends anything from a client\'s own posture, risk or compliance data, only the error itself and the app\'s own state.',
      'Fixed a live defect surfaced while deploying it: the Lambda\'s 3-second default timeout was not enough for its four sequential Graph calls and killed the invocation mid-flight -- the same class of mistake as 1.63.3\'s threat-intel timeout, in a different Lambda. Worse here, since the SharePoint write could still land just after the kill, turning a saved report into a 500 for the caller instead of the graceful drop this endpoint is built around.'
    ]
  },
  {
    version: '1.63.3',
    date: '2026-09-08',
    entries: [
      'Fixed: a partner list added to the owner console after a tenant was already provisioned never got created for that tenant. The console has always self-healed a MISSING COLUMN on an existing list (reconcilePartnerColumns, on every load), but nothing did the equivalent for a whole missing LIST — that only ever happened once, behind the one-time first-run setup gate. Checkpoint Partner ErrorReports was added to the list definitions well after most owner consoles, this one included, had already been provisioned, so lambda/report-error.js had nowhere to write and every report silently failed with {ok:false, dropped:"write failed"}. The owner console now re-runs the same idempotent create-if-missing pass on every load, the same way it already does for columns.'
    ]
  },
  {
    version: '1.63.2',
    date: '2026-09-07',
    entries: [
      'Threat intel (Risk & posture) now serves a live feed: threatIntelUrl points at the deployed lambda/threat-intel.js, so the view shows CISA\'s actively-exploited-vulnerability catalog instead of its "not configured" state. Deploying it surfaced a real bug in its own setup guide, also fixed here: the doc told you to leave the Lambda on AWS\'s 3-second default timeout, which is not enough to fetch and parse CISA\'s catalog from ap-southeast-2 on a cold start and made every cold invocation fail with a bare 500. Both the deploy doc and the Lambda\'s own header comment now call for 10 seconds.'
    ]
  },
  {
    version: '1.63.1',
    date: '2026-09-07',
    entries: [
      'Fixed: the Checkpoint tab icon was drawn rotated a quarter turn. The app redraws its own icon rather than serving the static file, so that the dot can turn red when you have an open Critical residual risk — and that redrawn copy had the gap in the ring pointing upwards instead of to the right, with the gold dot floating outside the ring rather than sitting in the gap, and the whole mark undersized in its square. It now matches the brand mark exactly, and a test keeps the two in step.'
    ]
  },
  {
    version: '1.63.0',
    date: '2026-09-07',
    entries: [
      'Every framework is now switched on in the website demo. SOC 2, Essential Eight, IS18, ISO 42001, ISO 27701, DISP / IRAP, NIST CSF, RFFR and CPS 234 all sit alongside ISO 27001, so anyone trying Checkpoint can see how each one is organised, how the Statement of Applicability handles it, and how controls cross-map between them — instead of being shown a single framework and a list of names. The demo has always carried a small illustrative slice of each of these (roughly ten real controls apiece, never the full published set); they were simply switched off, so nobody could see them.',
      'Essential Eight\'s maturity model now actually demonstrates. Three strategies carry a complete ML1-ML3 ladder rather than a scattered single level each, so the per-strategy assessment — and changing your target level in Frameworks — visibly does something. CPS 234 gained a demo slice covering each of its nine categories; it was the one framework with none, so switching it on would have shown an empty register.',
      'Fixed: switching between frameworks on the Statement of Applicability left the previous framework\'s category filters on screen. SOC 2 is the only framework with categories, so its Common Criteria / Availability / Privacy pills stayed above an Essential Eight or NIST table and filtered it by a category none of those controls carry. Introduced in 1.60.0 and reachable by any tenant holding SOC 2 alongside another framework.'
    ]
  },
  {
    version: '1.62.0',
    date: '2026-09-06',
    entries: [
      'Every summary tile in the app now behaves the same way. Five registers had grown their own copy of the same tile, so tiles that looked identical filtered on one page, highlighted but did nothing on another, and sat completely dead on a third — the Documents register\'s six tiles were inert, and two more on Vendors and AI systems did nothing despite looking exactly like the filters beside them. There is one tile now, built in one place, with one hover.',
      'You can also tell which tiles are clickable without hovering over them. A tile that filters carries a small chevron; a total, or a count of zero, does not — so the difference is visible at a glance instead of being something you find by moving the mouse around. A tile showing zero is drawn as an empty state rather than as a filter that would open an empty table.',
      'The Documents register\'s tiles are now filters, like the Statement of Applicability\'s and Training\'s: click "Review overdue" to see exactly those documents. Vendors gained an "Unclassified" filter so its "Data access not classified" tile — whose own caption says an auditor checks it first — can finally be opened.'
    ]
  },
  {
    version: '1.61.0',
    date: '2026-09-06',
    entries: [
      'Section headings now look the same everywhere. Training, Documents and Policy attestation divided themselves with headings that nothing in the stylesheet actually styled, so they fell back to the browser default — a bold sans-serif, against the serif the Dashboard uses. Same size, different typeface, which reads as a mistake rather than a decision. All eight section headings across the app now share one treatment: a rule, a serif heading, and a line of explanation beside it.',
      'Training now opens like every other register. It has the summary strip the Statement of Applicability, Actions, Vendors, AI systems and Documents all lead with — completed, outstanding, and overdue — where before it opened with the course catalogue, answering "what courses exist" ahead of "who still owes me one". The tiles filter the records table, the same way the Statement of Applicability\'s do, and "Overdue" joins the filter row so the tiles and pills always agree. The assign/export buttons moved up under the introduction, where every other register keeps them.',
      'The course catalogue was laid out on the grid built for numeric summary tiles, whose 175px columns wrapped each course into a column of fragments. It now uses a grid sized for cards.'
    ]
  },
  {
    version: '1.60.0',
    date: '2026-09-06',
    entries: [
      'The Statement of Applicability\'s summary tiles are now its filters. Click "7 overdue for review" and the table below shows exactly those seven controls, with a bar naming what you are looking at and a way back. The same applies to "Implemented", "Exclusions missing justification", and the in progress / not started / excluded counts beside them — so a number you want to act on is one click from the list behind it, instead of something to go hunting for. Clicking the same tile again clears it, and switching framework clears it too.',
      'The number on a tile and the rows it opens now come from one definition rather than being counted separately, so they cannot drift apart. A tile with nothing behind it stays a plain figure rather than a filter that opens an empty table.'
    ]
  },
  {
    version: '1.59.0',
    date: '2026-09-06',
    entries: [
      'The depth introduced in the last release was too subtle to read on most screens, so it is turned up. The gap between the page and a card is 58% larger, shadows are three layers deep instead of two, corners are rounder, and a tile lifts further when you hover it. Cards now read as objects sitting on the page rather than as outlines drawn on it. This is as far as the palette goes: the brand gold is the darkest colour the app uses as text, and one more step of lightness on the card would take it under the 4.5:1 accessibility minimum, so the ceiling is measured rather than chosen.',
      'Fixed: in the light theme, the surface used for toasts and tooltips was darker than the cards it floats above — backwards for something meant to sit closer to you — and dark enough that every status colour on it measured about 4.15:1, under the 4.5:1 minimum for text. Those colours had been tuned against the page background and never re-checked against this one. It is now the same white as a card and separates by its shadow instead, which is how the dark theme already handled it. Worst pair on that surface is now 4.84:1.'
    ]
  },
  {
    version: '1.58.0',
    date: '2026-09-06',
    entries: [
      'Checkpoint now has depth. Cards, tiles and panels sit on the page as objects — a light-catch along the top edge, a soft shadow beneath, and a surface that is genuinely lighter than the ground behind them — rather than being outlined in a hairline and left flat. The three planes were re-cut by perceptual lightness rather than by contrast ratio (the usual measure says almost nothing this close to black): the step from page to card roughly doubled, so cards stop disappearing on a laptop screen under office light. Clickable tiles now lift under the cursor, corners are softer, and the toolbar is frosted glass over the page instead of a near-solid slab. Every text and background pair was re-measured with the app\'s own contrast maths — the tightest is 4.55:1, still clear of the 4.5:1 AA floor — and the light theme gets its own inverted set of shadows rather than the dark theme\'s.',
      'Fixed: charts drawn inside the app were using the report\'s printed-page palette. Those colours are chosen to sit on white paper, and on Checkpoint\'s near-black background two things went wrong with them. Severity fills were too dark to meet the 3:1 minimum for a graphic that carries meaning — "Critical" measured 2.2:1. And "Not applicable", the category meant to recede furthest, is a near-white on paper, so on a dark card it rendered as the brightest band on the bar: the one segment nobody needs to read was the one the eye went to first. In-app charts now use a screen-tuned set built from Checkpoint\'s own status colours, so a bar and the KPI tile beside it finally name the same state in the same colour. Exported PDFs and printed reports are unchanged.'
    ]
  },
  {
    version: '1.57.0',
    date: '2026-09-06',
    entries: [
      'Faster to load: Checkpoint\'s JavaScript is now minified in the deployed build — 2,181 KB down to 1,194 KB, a 45% saving. Nothing about the app changes; it just arrives sooner, which matters most on the corporate networks and VPNs practitioners actually open it over.',
      'The Statement of Applicability\'s summary is three tiles instead of six. Implemented / in progress / not started / excluded are four slices of one distribution that this view already draws twice below — as the status-by-theme bars and, since the last release, on every control-family header — so restating it as four sibling tiles pushed the two figures that are NOT part of it, and that an auditor actually asks about, onto a second half-empty row. The mix now rides along as one quiet line under the implemented count.',
      'Linking evidence is a quiet in-row link rather than a bordered button. With most controls not yet evidenced, that button appeared on nearly every one of 93 rows and outweighed the control titles beside it; it behaves identically, it is simply no longer the loudest thing in the table.'
    ]
  },
  {
    version: '1.56.0',
    date: '2026-09-06',
    entries: [
      'The Statement of Applicability is now grouped by control family. It is the longest view in the app — ISO 27001 alone runs 93 rows — and unbroken they scrolled as one undifferentiated wall with no way to tell where you were. Each family (Organizational, People, Physical and Technological controls for ISO 27001; the category groups for SOC 2) now gets a sticky header carrying its own "8 of 37 implemented" count, so the structure the framework already publishes is visible while you scroll, and each section reports its own progress.',
      'Typography: tracked-out small-caps now marks one thing — a boundary. Nav groups, card titles, section eyebrows and buttons keep it; table headers, KPI captions, form field labels, chart legends and timestamps move to sentence case at a slightly larger size. Previously every label in the app carried the same treatment, which meant none of them ranked and the eye had nothing to sort by. Nothing moved, nothing was renamed — the same words are simply easier to read and now sit in a clear order.'
    ]
  },
  {
    version: '1.55.0',
    date: '2026-09-06',
    entries: [
      'Rebuilt: Cross-framework mapping now answers its own question instead of listing everything. With a single framework enabled nothing can cross-map, and the view used to draw all 93 controls anyway — every "Also satisfies" cell reading "—" under a caption that said "0 with cross-framework value". It now explains why there is nothing to map and points at the frameworks catalogue. With two or more frameworks it leads with just the controls that genuinely earn credit twice, ranked, with the remainder tucked behind a collapsed disclosure: on the demo tenant that is 17 rows to read instead of 93.',
      'The Framework column and the framework filter now appear only when more than one framework is in view — a column repeating a single value down every row is noise, so it is stated once in the caption instead. The "only cross-framework matches" toggle is gone: the view is now organised that way by default.',
      'Status in that table reads as a small coloured dot and a sentence-case label rather than a bordered upper-case chip on every row. A long table of chips turns into a stack of high-contrast boxes competing with the row content; chips stay where a status is the exception rather than the rule.',
      'Fixed: KPI strips across Statement of Applicability, Documents, Actions, Vendors, AI systems, Financial risk analysis and Training were laying six tiles out four-across, orphaning two on a half-empty second row. Six now fit on one row from 1440px up.'
    ]
  },
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
      'Corrective actions for nonconformities now follow the full ISO 27001 Clause 10.2 loop, not just a due date. A nonconformity in the Actions register carries a "Corrective action" record — the immediate correction, the root cause, and (once the corrective action is completed) a verified effectiveness review. Each nonconformity row shows the single next step it owes ("record the correction", "determine the root cause", "review effectiveness"…) until the loop is closed out.',
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
