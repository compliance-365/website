/* ============================================================
   Checkpoint — implementation guidance layer (ISO 27001 baseline)
   ------------------------------------------------------------
   This file ships in the app bundle and covers ISO 27001 Annex A only
   (93 controls) — the included baseline framework. SOC 2's Common
   Criteria guidance (33 entries) moved into the encrypted soc2 content
   pack (checkpoint-content/soc2.json's `guidance` field) as part of
   splitting premium content out of the shipped bundle — see
   scripts/build-content-packs.mjs and app.js's mergeLicensedPacks().
   A licensed tenant's pack merges its guidance entries straight into
   this same window.GUIDANCE object at runtime (Object.assign), so
   nothing downstream of this file needs to know or care whether a
   given key arrived from here or from a decrypted pack.

   window.GUIDANCE, keyed by control code, each entry:
     { how: '...', evidence: '...', link: '...', checks: [...] }
   - how: 2-4 sentences of practical guidance for implementing this
     control in a Microsoft 365 environment.
   - evidence: what an auditor typically accepts as evidence.
   - link: a deep link to the relevant Microsoft admin portal or a
     Microsoft Learn page.
   - checks: related window.CHECK_DEFS ids, where the posture scan can
     speak to this control directly — cross-referenced from the
     existing window.CHECK_CONTROLS map in store.js so the two never
     disagree about which checks feed which control. Most controls
     have no automatable signal at all and carry an empty array — that
     is expected, not a gap, per the same "manual is not a failure"
     philosophy the rest of Checkpoint already uses.

   Every "how"/"evidence" sentence here is written originally for this
   product — no text is copied from ISO/IEC 27001, the AICPA Trust
   Services Criteria, or any vendor's documentation. Where a sentence
   happens to describe the same practical action a standard's official
   wording also describes, that's necessarily true of any correct
   implementation guidance for the same control; the wording itself is
   ours.

   LINK VERIFICATION NOTE: links point either to a stable, well-known
   Microsoft admin portal home page (entra.microsoft.com,
   intune.microsoft.com, security.microsoft.com, purview.microsoft.com,
   admin.microsoft.com, portal.azure.com — all high-confidence, rarely
   change) or a Microsoft Learn documentation page. This file was
   authored without live browsing access to verify every individual
   Learn URL resolves to the expected page — Microsoft does restructure
   documentation paths periodically. Spot-check the Learn links (a
   handful, not the admin-portal home links) before relying on this in
   front of a client, and route around any that have moved.

   Not every control in the registry has an entry — every premium
   framework beyond soc2 (essential8, iso42001, iso27701, dispirap,
   nistcsf) has no GUIDANCE entries yet at all, in this file or a pack.
   A missing key must fail soft either way: the SoA drawer simply omits
   the guidance panel, no error.
   ============================================================ */
window.GUIDANCE = {

  /* ================= ISO 27001 — A.5 Organizational (37) ================= */

  'A.5.1': {
    how: "Publish a single, version-controlled information security policy set (acceptable use, access, incident response and so on) in a Purview or SharePoint policy library with a named owner and a review date. Review it at least annually or after a material change — a new framework, an incident, a restructure — and record when that happened. Make it genuinely discoverable (an intranet link, an onboarding step), not just filed away.",
    evidence: "The current dated policy document with a named approver, a review history showing at least one prior review, and confirmation staff can actually locate it.",
    link: "https://purview.microsoft.com",
    checks: []
  },
  'A.5.2': {
    how: "Document who owns each ISMS responsibility — ISMS manager, control owners, incident responder — in an org chart or RACI matrix, and mirror that in Entra role assignments so accountability is enforced through real access, not just written down. Update it the day a role changes hands, not at the next audit.",
    evidence: "A responsibilities document naming individuals, cross-checked against the Entra role holders for those same people.",
    link: "https://entra.microsoft.com",
    checks: []
  },
  'A.5.3': {
    how: "Identify duties that conflict if held by one person — who can both approve and process a payment, or both request and grant access — and separate them with Entra role-based access and approval workflows. Where a small team genuinely can't separate a pair of duties, document a compensating control (peer review, logging) instead; auditors accept a documented compensating control where true segregation isn't practical.",
    evidence: "A segregation-of-duties analysis for key processes, current Entra role assignments matching it, and evidence of any compensating controls used.",
    link: "https://entra.microsoft.com",
    checks: []
  },
  'A.5.4': {
    how: "Have management formally communicate security expectations — a signed acknowledgement at onboarding, a periodic reminder from leadership, security objectives referenced in performance reviews. The point is a record showing this actually reached staff, not just that a policy exists somewhere.",
    evidence: "Signed acknowledgements, a leadership communication, or performance-review extracts referencing security responsibilities.",
    link: "https://purview.microsoft.com",
    checks: []
  },
  'A.5.5': {
    how: "Keep a short, current reference sheet of the authorities relevant to an incident — the Australian Cyber Security Centre (via cyber.gov.au), your industry regulator, the OAIC for a notifiable data breach — and reference it directly from your incident response plan so nobody is hunting for a phone number mid-incident.",
    evidence: "The current authority contact list, dated, and referenced from the incident response plan.",
    link: "https://www.cyber.gov.au",
    checks: []
  },
  'A.5.6': {
    how: "Join at least one relevant threat-intelligence or peer community — the ACSC partner program, an information-sharing group for your sector, a vendor security bulletin list — and keep a record of membership. Even minimal participation satisfies this control; the point is a channel exists for early warning.",
    evidence: "Membership confirmation, a subscription record, or attendance evidence for a relevant briefing.",
    link: "https://www.cyber.gov.au",
    checks: []
  },
  'A.5.7': {
    how: "Subscribe to Microsoft 365 Defender's threat analytics and Microsoft Security Response Center bulletins, and assign someone to review them on a set cadence — weekly is typical for most SMEs. Record how intelligence that's actually relevant to your stack turns into an action (a policy change, a patch), not just a read-and-forget email.",
    evidence: "Threat-analytics review notes, or a log of at least one intelligence-driven action taken.",
    link: "https://security.microsoft.com",
    checks: []
  },
  'A.5.8': {
    how: "Add a security checkpoint to your project or change template — a short risk assessment before a new system or major change goes live, signed off by someone with security authority. For most Microsoft 365-based projects this can be a single gate in your existing project tracker rather than a separate process.",
    evidence: "Completed security-checkpoint records for a sample of recent projects, showing the assessment and sign-off.",
    link: "https://purview.microsoft.com",
    checks: []
  },
  'A.5.9': {
    how: "Maintain an asset register covering technical assets (Intune-managed devices, key applications, SharePoint sites) and information assets (what data lives where), each with a named owner. Purview's Data Map and Intune's device inventory cover the technical half largely automatically — the information half still needs a light manual register kept current.",
    evidence: "The current asset register with owners assigned, cross-checked against Intune's device list and Purview's Data Map.",
    link: "https://purview.microsoft.com",
    checks: []
  },
  'A.5.10': {
    how: "Publish an acceptable-use policy covering email, internet, cloud storage and BYOD if permitted, and require acknowledgement at onboarding. Back it with a technical control (a DLP policy, Conditional Access app restrictions) rather than relying on the policy being read and remembered.",
    evidence: "The published policy, onboarding acknowledgement records, and evidence of at least one supporting technical control.",
    link: "https://purview.microsoft.com",
    checks: []
  },
  'A.5.11': {
    how: "Add an asset-return step to your offboarding checklist — laptop, access card, security tokens — and confirm it by retiring or wiping the device in Intune the same day access is revoked. Keep a signed checklist per departing employee.",
    evidence: "Completed offboarding checklists showing asset return, matched against Intune device-retirement timestamps.",
    link: "https://intune.microsoft.com",
    checks: []
  },
  'A.5.12': {
    how: "Define a small classification scheme — Public / Internal / Confidential / Highly Confidential is typical — and implement it as Purview sensitivity labels, applied by default where practical and by users otherwise. Train staff on what each label actually means for how they can share that content.",
    evidence: "The published classification scheme, the corresponding sensitivity labels in Purview, and label-usage reporting showing real adoption.",
    link: "https://purview.microsoft.com",
    checks: []
  },
  'A.5.13': {
    how: "Configure Purview sensitivity labels to apply a visible marking (a header, footer or watermark) for sensitive classifications, and set a default label for new SharePoint/OneDrive documents so labelling doesn't depend on a user remembering to apply it.",
    evidence: "The label configuration showing visual markings, and a sample of documents carrying the correct label.",
    link: "https://purview.microsoft.com",
    checks: []
  },
  'A.5.14': {
    how: "Control how information leaves the tenant with Purview DLP policies across email and endpoints, Conditional Access restricting unmanaged-device access to sensitive apps, and a documented secure-transfer method — Purview Message Encryption is a straightforward option — for anything shared externally.",
    evidence: "The DLP policy configuration, a Conditional Access policy restricting unmanaged access, and a documented secure-transfer method for external sharing.",
    link: "https://purview.microsoft.com",
    checks: []
  },
  'A.5.15': {
    how: "Base access on least privilege and role, enforced through Entra groups and Conditional Access — require MFA for every user at minimum, restrict access by device compliance or location where the risk warrants it, and review access rights on a set cadence using Entra Access Reviews. Checkpoint's own posture scan checks the MFA and legacy-authentication pieces of this directly on every run.",
    evidence: "The exported Conditional Access policy set, an access-review record, and Checkpoint's own MFA/legacy-authentication scan results.",
    link: "https://entra.microsoft.com",
    checks: ["mfa-all", "legacy"]
  },
  'A.5.16': {
    how: "Use Entra ID as the single identity source for every system that supports it — no local or shadow accounts — with one identity per person, deactivated promptly on departure. Keep guest accounts to a genuine business need and review them periodically; Checkpoint's guest-count check flags when that count drifts beyond your set threshold.",
    evidence: "Entra's user and guest list, an offboarding record showing prompt deactivation, and Checkpoint's guest-count scan result.",
    link: "https://entra.microsoft.com",
    checks: ["guests"]
  },
  'A.5.17': {
    how: "Enforce a real authentication policy through Entra — a sensible password policy or, better, passwordless/FIDO2 where feasible, banned-password lists, and MFA as the actual control rather than password complexity alone. Never share credentials for any account; use PIM or a password vault where an account genuinely must be shared.",
    evidence: "The Entra authentication methods policy configuration and an MFA registration/coverage report.",
    link: "https://entra.microsoft.com",
    checks: []
  },
  'A.5.18': {
    how: "Grant access through group-based role assignment rather than one-off individual grants, require approval for privileged role activation through Entra PIM, and run a periodic access review to catch rights that should have been revoked but weren't. Checkpoint's PIM check verifies privileged roles are held as eligible assignments, not standing access.",
    evidence: "The Entra PIM configuration, an access-review report, and Checkpoint's PIM scan result.",
    link: "https://entra.microsoft.com",
    checks: ["pim"]
  },
  'A.5.19': {
    how: "Keep a vendor risk register recording what data each supplier can access and their own security posture — Checkpoint's Vendor register is built for exactly this — and require a security review before onboarding any supplier that touches your data. Set a minimum security bar in the supplier contract itself, not just in your own process.",
    evidence: "The vendor risk register with data-access classification recorded, and a pre-onboarding security review for a sample supplier.",
    link: "https://purview.microsoft.com",
    checks: []
  },
  'A.5.20': {
    how: "Include specific security clauses in supplier agreements — data handling, breach notification timeframes, right-to-audit, subcontractor disclosure — rather than a generic confidentiality clause. Use a standard security schedule template so this doesn't get negotiated away deal by deal.",
    evidence: "A supplier contract or security schedule containing the specific clauses, for a sample of active suppliers.",
    link: "https://purview.microsoft.com",
    checks: []
  },
  'A.5.21': {
    how: "Review third-party application access into your tenant regularly — Entra's enterprise app and OAuth consent list is the source of truth — and revoke anything with high-privilege scopes that isn't clearly justified. Checkpoint's posture scan already flags risky OAuth grants on every run, so this becomes a triage task rather than a from-scratch audit.",
    evidence: "The Entra enterprise applications list with a documented review, and Checkpoint's risky-app scan result showing findings actioned.",
    link: "https://entra.microsoft.com",
    checks: ["riskyapps"]
  },
  'A.5.22': {
    how: "Set a review cadence for existing supplier relationships — annual is typical for critical suppliers — checking their certifications are still current and their access is still appropriate. Checkpoint's Vendor register tracks next-review dates and flags overdue ones on the Dashboard.",
    evidence: "Vendor review records showing the review actually happened on schedule, visible in the vendor register's review-status field.",
    link: "https://purview.microsoft.com",
    checks: []
  },
  'A.5.23': {
    how: "Govern which cloud services staff can use with Conditional Access app restrictions and, if licensed, Defender for Cloud Apps' app governance and shadow-IT discovery. Require new cloud services to go through the same supplier-review process as any other vendor before adoption.",
    evidence: "The Conditional Access app-restriction policy and, where used, a Defender for Cloud Apps discovery report.",
    link: "https://security.microsoft.com",
    checks: []
  },
  'A.5.24': {
    how: "Document an incident response plan covering roles, escalation, containment and notification obligations, and rehearse it at least once a year with a tabletop exercise. Keep the plan itself in a location that's still reachable if the primary tenant is compromised.",
    evidence: "The current incident response plan and a record of at least one rehearsal or tabletop exercise.",
    link: "https://security.microsoft.com",
    checks: []
  },
  'A.5.25': {
    how: "Triage security events consistently — Microsoft 365 Defender's incident queue is the natural home for this — with a documented severity scale so 'is this actually an incident' is answered the same way every time, not by whoever happens to notice first.",
    evidence: "Defender incident/alert triage records showing a consistent severity assessment applied.",
    link: "https://security.microsoft.com",
    checks: ["riskyusers"]
  },
  'A.5.26': {
    how: "Run incident response through to resolution with a documented playbook per major incident type (compromised account, ransomware, data exposure), using Microsoft 365 Defender's automated investigation and response where licensed, and record what happened in the Actions register once resolved.",
    evidence: "A completed incident record showing response actions taken and closure, and the corresponding Defender incident log.",
    link: "https://security.microsoft.com",
    checks: ["riskyusers"]
  },
  'A.5.27': {
    how: "Hold a short post-incident review after any real incident — what happened, what worked, what to change — and turn the findings into concrete actions in your register rather than a report nobody reads again. This is the difference between having an incident process and actually improving it.",
    evidence: "A post-incident review record with at least one resulting action item tracked to completion.",
    link: "https://security.microsoft.com",
    checks: []
  },
  'A.5.28': {
    how: "Define how evidence gets preserved during an incident — Purview's audit log and eDiscovery hold capabilities can freeze relevant data before it's altered — and document the chain of custody for anything that might support a legal or disciplinary process.",
    evidence: "A documented evidence-collection procedure and, for a real incident, the preserved evidence with a chain-of-custody record.",
    link: "https://purview.microsoft.com",
    checks: []
  },
  'A.5.29': {
    how: "Define which security controls must keep operating during a disruption (access control and logging shouldn't lapse just because a disaster recovery plan is in effect) and build that into your business continuity plan explicitly, rather than assuming security is someone else's problem during an outage.",
    evidence: "The business continuity plan showing security controls are explicitly addressed for a disruption scenario.",
    link: "https://admin.microsoft.com",
    checks: []
  },
  'A.5.30': {
    how: "Confirm your ICT recovery capability actually meets your continuity requirements — Microsoft 365's own service resilience covers the platform, but your own backup/restore capability for mailbox, SharePoint and Teams data (a third-party or Microsoft 365 Backup solution) needs its own tested recovery point and time objectives.",
    evidence: "A documented recovery time/point objective for ICT systems and a record of at least one restore test.",
    link: "https://admin.microsoft.com",
    checks: []
  },
  'A.5.31': {
    how: "Maintain a register of the legal, regulatory and contractual requirements that actually apply to you (Privacy Act 1988, sector-specific regulation, client contract terms) and review it when your business or the law changes. This underpins several other controls, so keep it current rather than a one-off exercise.",
    evidence: "The legal/regulatory requirements register, dated, with evidence of periodic review.",
    link: "https://purview.microsoft.com",
    checks: []
  },
  'A.5.32': {
    how: "Identify intellectual property that needs protecting (source code, designs, client deliverables) and apply access restrictions and, where appropriate, sensitivity labels to it specifically — IP protection is really A.5.12/A.5.15 applied to a specific asset class, not a separate technical control.",
    evidence: "A record identifying key IP assets and the access/labelling controls applied to them.",
    link: "https://purview.microsoft.com",
    checks: []
  },
  'A.5.33': {
    how: "Define retention periods for the records you're legally or contractually required to keep, and implement them with Purview retention labels and policies so records aren't deleted early or kept indefinitely by default. Review the retention schedule when a new regulatory obligation applies.",
    evidence: "The retention schedule and the corresponding Purview retention labels/policies configured to match it.",
    link: "https://purview.microsoft.com",
    checks: []
  },
  'A.5.34': {
    how: "Assess privacy impact before processing new categories of personal information — Purview's Privacy Risk Management can help identify overshared personal data in the tenant — and align your approach with the Privacy Act 1988's Australian Privacy Principles where personal information of Australian individuals is involved.",
    evidence: "A privacy impact assessment for a new or significant processing activity, and, where used, a Purview Privacy Risk Management report.",
    link: "https://purview.microsoft.com",
    checks: []
  },
  'A.5.35': {
    how: "Have someone independent of day-to-day operations — an internal audit function, an external consultant, or at minimum a peer from another team — review the ISMS at least annually and record findings. Checkpoint's own internal audit programme and management review registers are built to hold exactly this evidence.",
    evidence: "An independent review record with findings, and any resulting actions tracked to completion.",
    link: "https://purview.microsoft.com",
    checks: []
  },
  'A.5.36': {
    how: "Check that your actual practice matches your documented policies on a periodic basis — a control self-assessment or Purview Compliance Manager's improvement-action tracking both work — and record any gap found along with the remediation.",
    evidence: "A compliance self-assessment record and evidence that identified gaps were tracked to closure.",
    link: "https://purview.microsoft.com",
    checks: []
  },
  'A.5.37': {
    how: "Document the operating procedures that matter — how backups are verified, how a privileged account is provisioned, how an incident is escalated — so the process survives a key person leaving. A short runbook per procedure, kept current, is more useful than an exhaustive manual nobody updates.",
    evidence: "A set of documented operating procedures for key processes, each with a last-reviewed date.",
    link: "https://purview.microsoft.com",
    checks: []
  },

  /* ================= ISO 27001 — A.6 People (8) ================= */

  'A.6.1': {
    how: "Screen new hires appropriately to the role's sensitivity — reference checks as a baseline, a police check or working-with-children check where the role warrants it — and keep the screening record on file before day one for any role with privileged access.",
    evidence: "Completed screening records for a sample of recent hires, matched against role sensitivity.",
    link: "https://purview.microsoft.com",
    checks: []
  },
  'A.6.2': {
    how: "Include security and confidentiality obligations explicitly in employment contracts and onboarding documentation, not buried in a general handbook, so expectations are set — and enforceable — from day one.",
    evidence: "A sample employment contract or onboarding pack showing security obligations stated explicitly.",
    link: "https://purview.microsoft.com",
    checks: []
  },
  'A.6.3': {
    how: "Deliver security awareness training at induction and refresh it at least annually — Microsoft Defender's Attack Simulation Training runs realistic phishing simulations with built-in training assignment for anyone who falls for one, which is a strong, low-effort way to satisfy this control with real data behind it.",
    evidence: "Training completion records for staff, and, where used, Attack Simulation Training campaign results.",
    link: "https://security.microsoft.com",
    checks: []
  },
  'A.6.4': {
    how: "Have a documented disciplinary process for security policy violations, proportionate to the severity, and make sure staff know it exists — this is usually already covered by an HR policy, so the control is often just about explicitly cross-referencing security violations in it.",
    evidence: "The HR disciplinary policy showing security violations are explicitly in scope.",
    link: "https://purview.microsoft.com",
    checks: []
  },
  'A.6.5': {
    how: "Run a consistent offboarding checklist covering access revocation, asset return and any post-employment obligations (confidentiality survives termination), and complete it on the departure date, not whenever HR gets to it. Disable the Entra account immediately; delete it only after any legal hold requirements are satisfied.",
    evidence: "Completed offboarding checklists showing same-day access revocation, matched against Entra account disable timestamps.",
    link: "https://entra.microsoft.com",
    checks: []
  },
  'A.6.6': {
    how: "Require a signed confidentiality or non-disclosure agreement from every employee and relevant contractor before they get access to sensitive information, filed and retrievable — not just referenced as 'standard practice'.",
    evidence: "Signed NDAs on file for a sample of employees and contractors with access to sensitive data.",
    link: "https://purview.microsoft.com",
    checks: []
  },
  'A.6.7': {
    how: "Set explicit expectations for remote working — secure home network practices, device requirements, use of a company VPN or Conditional Access-based Zero Trust access instead — and enforce device compliance through Intune so a remote device meets the same bar as an office one before it can reach sensitive data.",
    evidence: "The remote-working policy and an Intune device compliance policy applied to remote-eligible devices.",
    link: "https://intune.microsoft.com",
    checks: []
  },
  'A.6.8': {
    how: "Give staff a clear, low-friction way to report a suspected security event — a dedicated mailbox or Teams channel monitored during business hours is usually enough for an SME — and make sure the reporting path is communicated at induction and reinforced periodically.",
    evidence: "The documented reporting channel and evidence it's communicated to staff (an induction reference, an intranet page).",
    link: "https://security.microsoft.com",
    checks: []
  },

  /* ================= ISO 27001 — A.7 Physical (14) ================= */

  'A.7.1': {
    how: "Define physical security perimeters for any space holding sensitive information or equipment (server rooms, secure filing) with locked doors and controlled entry. For a fully cloud-based SME with no server room, this control is often satisfied by documenting that no such perimeter is required and relying on your Microsoft 365/Azure provider's own physical security instead.",
    evidence: "A site security assessment, or a documented rationale for why a physical perimeter isn't applicable to your environment.",
    link: "https://www.cyber.gov.au",
    checks: []
  },
  'A.7.2': {
    how: "Control entry to any sensitive physical space with a mechanism appropriate to the risk — swipe access, a visitor sign-in log, or simply a locked door with key control for a small office. Log who has access and review it periodically.",
    evidence: "An access-control or visitor log, and a current list of who holds keys/swipe access.",
    link: "https://www.cyber.gov.au",
    checks: []
  },
  'A.7.3': {
    how: "Secure offices and facilities appropriate to what they hold — lockable doors, restricted access to areas with sensitive paperwork or equipment, positioning of screens away from public view. Document the assessment even if the conclusion is 'standard office security is sufficient'.",
    evidence: "A facility security assessment or walkthrough record.",
    link: "https://www.cyber.gov.au",
    checks: []
  },
  'A.7.4': {
    how: "Monitor physical premises appropriate to the risk — CCTV, alarm systems, or simply staff awareness for a low-risk small office — and keep monitoring records for a defined retention period in case they're needed after an incident.",
    evidence: "Evidence of the monitoring control in place (system configuration, footage retention policy) or a documented rationale for why none is needed.",
    link: "https://www.cyber.gov.au",
    checks: []
  },
  'A.7.5': {
    how: "Assess physical and environmental threats relevant to your premises — fire, flood, power failure — and put reasonable mitigations in place (fire suppression, UPS for critical equipment). For a fully cloud-hosted SME this is largely inherited from Microsoft's own data centre controls; document that inheritance explicitly.",
    evidence: "An environmental risk assessment for your premises, or documentation of inherited controls from your cloud provider.",
    link: "https://www.cyber.gov.au",
    checks: []
  },
  'A.7.6': {
    how: "Define rules for working in any designated secure area — no unauthorised photography, visitor escort requirements, clear desk enforcement — appropriate to what's handled there. Most SMEs without a dedicated secure area can scope this control down accordingly and document why.",
    evidence: "The secure-area working rules, where applicable, or a documented scoping rationale.",
    link: "https://www.cyber.gov.au",
    checks: []
  },
  'A.7.7': {
    how: "Set and enforce a clear desk and clear screen policy — sensitive paperwork locked away when unattended, screens set to auto-lock after a short idle period. Enforce the screen-lock piece technically through Intune device configuration rather than relying on policy alone.",
    evidence: "The clear desk/screen policy and an Intune configuration profile enforcing automatic screen lock.",
    link: "https://intune.microsoft.com",
    checks: []
  },
  'A.7.8': {
    how: "Site equipment to reduce physical risk — servers away from flood-prone areas, screens positioned away from public sightlines — and protect it appropriately for its sensitivity. Document the reasoning even where the answer is straightforward.",
    evidence: "An equipment siting assessment or walkthrough note.",
    link: "https://intune.microsoft.com",
    checks: []
  },
  'A.7.9': {
    how: "Set requirements for equipment used off-premises — laptops must be encrypted and enrolled in Intune before leaving the office, personal devices accessing company data need a minimum compliance bar enforced through Conditional Access.",
    evidence: "An Intune compliance policy applied to mobile/off-site devices, and BitLocker/device-encryption status reporting.",
    link: "https://intune.microsoft.com",
    checks: []
  },
  'A.7.10': {
    how: "Control storage media (USB drives, external disks) — restrict or disable removable media via Intune device configuration where it isn't needed for business, and require encryption for any media that is approved. Purview DLP can additionally block sensitive data being copied to removable media.",
    evidence: "The Intune removable-media configuration and, where used, the corresponding DLP policy.",
    link: "https://intune.microsoft.com",
    checks: []
  },
  'A.7.11': {
    how: "Ensure supporting utilities (power, network connectivity) have reasonable resilience for your risk level — a UPS for critical on-premises equipment, a backup internet connection if continuity depends on it. Fully cloud-based SMEs largely inherit this from their cloud provider for anything hosted there.",
    evidence: "Documentation of the resilience measures in place, or the inherited-control rationale for cloud-hosted services.",
    link: "https://www.cyber.gov.au",
    checks: []
  },
  'A.7.12': {
    how: "Protect network cabling from damage or interception where it carries sensitive traffic — appropriate routing and physical protection for on-premises cabling. Most SMEs on a standard office fit-out can document this as adequately handled by the building's existing infrastructure.",
    evidence: "A cabling security assessment or a documented rationale where the building's standard infrastructure is deemed sufficient.",
    link: "https://www.cyber.gov.au",
    checks: []
  },
  'A.7.13': {
    how: "Maintain equipment according to manufacturer specifications and keep maintenance records, particularly for anything supporting a security function (UPS, environmental controls). For cloud-hosted infrastructure this is inherited from the provider.",
    evidence: "Maintenance records for on-premises equipment, or the inherited-control documentation for cloud-hosted infrastructure.",
    link: "https://www.cyber.gov.au",
    checks: []
  },
  'A.7.14': {
    how: "Securely wipe or destroy equipment before disposal or reuse — Intune can remotely wipe a managed device before decommissioning, and a certified destruction service should handle anything holding data that can't be reliably wiped (failed drives, old servers). Keep a disposal certificate as evidence.",
    evidence: "Intune wipe confirmation for decommissioned devices, and destruction certificates for physically destroyed media.",
    link: "https://intune.microsoft.com",
    checks: []
  },

  /* ================= ISO 27001 — A.8 Technological (34) ================= */

  'A.8.1': {
    how: "Enrol every endpoint accessing company data into Intune, apply a compliance policy (encryption, OS version, security baseline) and block access from non-compliant devices through Conditional Access. Checkpoint's device-compliance and compliance-policy checks read this configuration directly on every scan.",
    evidence: "The Intune compliance policy configuration, device compliance reporting, and Checkpoint's device/compliance-policy scan results.",
    link: "https://intune.microsoft.com",
    checks: ["device", "compliance-policy"]
  },
  'A.8.2': {
    how: "Restrict privileged access to what's needed and time-bound it through Entra PIM rather than standing permanent role assignments. Keep the number of permanent Global Administrators to the minimum practical (Microsoft's own guidance is 2-4 for emergency access) — Checkpoint's admin-count and PIM checks both watch this directly.",
    evidence: "The Entra PIM configuration, current Global Administrator membership, and Checkpoint's admins/PIM scan results.",
    link: "https://entra.microsoft.com",
    checks: ["mfa-priv", "admins", "pim"]
  },
  'A.8.3': {
    how: "Restrict access to information based on the access-control policy actually enforced through Entra and application-level permissions (SharePoint site permissions, Teams membership) — not a written rule that isn't backed by a technical control. Review third-party app access regularly since an over-permissioned OAuth grant is a common way this control quietly fails.",
    evidence: "The access-control policy, corresponding SharePoint/Teams permission configuration, and Checkpoint's risky-app scan result.",
    link: "https://entra.microsoft.com",
    checks: ["riskyapps"]
  },
  'A.8.4': {
    how: "Restrict source code access to the developers and systems that need it — Azure DevOps or GitHub repository permissions, branch protection rules, and no shared credentials for source control. Log and review access to production-facing repositories periodically.",
    evidence: "Repository access-control configuration and a periodic access review record.",
    link: "https://portal.azure.com",
    checks: []
  },
  'A.8.5': {
    how: "Require MFA for every user without exception, block legacy authentication protocols that can't enforce MFA, and use phishing-resistant methods (FIDO2, certificate-based auth, or at minimum authenticator-app push with number matching) for privileged roles specifically. This is the single control Checkpoint's posture scan checks most directly — mfa-all, mfa-priv and legacy all read your live Conditional Access configuration.",
    evidence: "The Conditional Access policy set enforcing MFA and blocking legacy auth, and Checkpoint's mfa-all/mfa-priv/legacy scan results.",
    link: "https://entra.microsoft.com",
    checks: ["mfa-all", "mfa-priv", "legacy"]
  },
  'A.8.6': {
    how: "Monitor capacity for systems you're directly responsible for (on-premises servers, Azure resources) with alerting before thresholds are hit, and plan ahead for growth. For fully cloud-hosted Microsoft 365 services, capacity management is largely Microsoft's responsibility — document that scoping decision.",
    evidence: "Capacity monitoring/alerting configuration for owned infrastructure, or the documented scoping rationale for inherited services.",
    link: "https://portal.azure.com",
    checks: []
  },
  'A.8.7': {
    how: "Enable Microsoft Defender's anti-malware protection across endpoints and email, keep signatures updating automatically, and harden Office macro settings tenant-wide (block macros from the internet by default, allow only from trusted locations). Checkpoint's wdac and macro checks read your live Secure Score signal for both of these.",
    evidence: "Defender configuration showing real-time protection enabled, the Office macro-hardening policy, and Checkpoint's wdac/macro scan results.",
    link: "https://security.microsoft.com",
    checks: ["wdac", "macro"]
  },
  'A.8.8': {
    how: "Patch operating systems and applications on a defined cadence, tightened for anything internet-facing, using Intune update rings or your existing patch management tooling. Checkpoint's patch check reads your Secure Score signal for patch currency on every scan, so gaps here surface automatically.",
    evidence: "The Intune update-ring configuration, a patch compliance report, and Checkpoint's patch scan result.",
    link: "https://intune.microsoft.com",
    checks: ["patch"]
  },
  'A.8.9': {
    how: "Define and enforce secure configuration baselines for devices and key services — Intune security baselines are a fast way to apply Microsoft-recommended hardening across the fleet — and track configuration drift rather than assuming a one-time setup stays correct.",
    evidence: "The Intune security baseline assignment and a compliance/drift report against it.",
    link: "https://intune.microsoft.com",
    checks: []
  },
  'A.8.10': {
    how: "Ensure information is actually deleted when it's no longer needed — Purview retention policies can auto-delete at the end of a retention period, and Intune can remotely wipe a device. Don't rely on 'we'll get to it eventually'; set an automated end state for data that has a defined lifecycle.",
    evidence: "Purview retention/deletion policy configuration and Intune wipe confirmations for decommissioned devices.",
    link: "https://purview.microsoft.com",
    checks: []
  },
  'A.8.11': {
    how: "Mask or redact sensitive data fields in non-production environments (test/dev databases shouldn't hold real customer data unmasked) — this is more relevant to organisations running their own applications than pure SaaS consumers, and can be scoped down accordingly where it doesn't apply.",
    evidence: "A data-masking configuration for non-production environments, or a documented scoping rationale where not applicable.",
    link: "https://purview.microsoft.com",
    checks: []
  },
  'A.8.12': {
    how: "Configure Purview Data Loss Prevention policies to detect and block sensitive information (credit card numbers, health records, custom sensitive-info types relevant to your business) leaving the tenant through email, Teams or endpoint copy actions.",
    evidence: "The DLP policy configuration and incident reports showing the policy actually triggering on real activity.",
    link: "https://purview.microsoft.com",
    checks: []
  },
  'A.8.13': {
    how: "Back up business-critical data — Exchange, SharePoint and Teams content isn't fully covered by Microsoft's own retention by default, so a dedicated backup solution (Microsoft 365 Backup or a third party) is usually needed — and actually test a restore periodically rather than trusting the backup job succeeded.",
    evidence: "The backup solution's configuration and a documented restore test with its outcome.",
    link: "https://admin.microsoft.com",
    checks: []
  },
  'A.8.14': {
    how: "Build redundancy into information-processing facilities proportionate to your availability requirements — Microsoft 365's own service architecture provides substantial redundancy for the platform itself; document what you inherit versus what you're responsible for (e.g. your own line-of-business application hosting).",
    evidence: "Documentation of the redundancy architecture in place, distinguishing inherited platform redundancy from owned infrastructure.",
    link: "https://admin.microsoft.com",
    checks: []
  },
  'A.8.15': {
    how: "Enable unified audit logging across Microsoft 365 and set a retention period appropriate to your investigative and compliance needs. Checkpoint's logging check verifies this is switched on via your Secure Score signal — an unlicensed or disabled audit log is one of the most common gaps found in a first scan.",
    evidence: "Purview audit log configuration showing logging enabled and the retention period set, plus Checkpoint's logging scan result.",
    link: "https://purview.microsoft.com",
    checks: ["logging"]
  },
  'A.8.16': {
    how: "Actively monitor security alerts rather than just collecting logs — Microsoft 365 Defender's alert and incident queue needs an assigned owner checking it regularly, with a documented triage process. Checkpoint's alerts check looks at whether threat-protection monitoring is genuinely in place via Secure Score.",
    evidence: "Defender alert triage records showing regular review, and Checkpoint's alerts scan result.",
    link: "https://security.microsoft.com",
    checks: ["alerts"]
  },
  'A.8.17': {
    how: "Confirm systems use a consistent, accurate time source (NTP) so that logs from different systems can be correlated during an investigation — this is on by default for Microsoft 365 and Azure-hosted infrastructure and mainly needs verifying for any on-premises systems you still operate.",
    evidence: "Confirmation of time synchronisation configuration for any owned on-premises infrastructure.",
    link: "https://portal.azure.com",
    checks: []
  },
  'A.8.18': {
    how: "Restrict and log the use of privileged utility programs that can override normal system or application controls (PowerShell with elevated rights, database admin tools) to the specific people and situations that need them, ideally through Entra PIM's just-in-time activation rather than standing access.",
    evidence: "Access-control configuration restricting privileged utility use, and PIM activation logs for the relevant role.",
    link: "https://entra.microsoft.com",
    checks: []
  },
  'A.8.19': {
    how: "Control what software can run on managed devices with application control — Windows Defender Application Control (WDAC) or AppLocker deployed via Intune, restricting installation to an approved list. Checkpoint's wdac check reads whether this is genuinely in place via your Secure Score signal.",
    evidence: "The Intune application-control policy deployment and Checkpoint's wdac scan result.",
    link: "https://intune.microsoft.com",
    checks: ["wdac"]
  },
  'A.8.20': {
    how: "Protect network boundaries and internal segments appropriate to your architecture — for a Microsoft 365-centric SME this is largely Conditional Access acting as the real network boundary (identity as the new perimeter), supplemented by Azure Network Security Groups for any Azure-hosted infrastructure.",
    evidence: "The Conditional Access policy set and, where applicable, Azure NSG configuration.",
    link: "https://entra.microsoft.com",
    checks: []
  },
  'A.8.21': {
    how: "Secure network services with appropriate authentication and encryption (no anonymous or unencrypted service access), and review exposed network services periodically for anything that shouldn't still be reachable.",
    evidence: "A network service inventory with the security configuration for each, and a periodic review record.",
    link: "https://portal.azure.com",
    checks: []
  },
  'A.8.22': {
    how: "Segment networks so a compromise in one area doesn't automatically reach everything else — Azure Virtual Network segmentation with Network Security Groups for cloud-hosted infrastructure, and VLAN segmentation for anything still on-premises.",
    evidence: "The network segmentation architecture diagram and corresponding NSG/VLAN configuration.",
    link: "https://portal.azure.com",
    checks: []
  },
  'A.8.23': {
    how: "Filter web access to block known-malicious and inappropriate destinations — Microsoft Defender for Endpoint's web content filtering, or an equivalent secure web gateway, applied consistently across managed devices rather than left to individual browser settings.",
    evidence: "The web-filtering policy configuration and a report showing it's actively applied to the managed device fleet.",
    link: "https://security.microsoft.com",
    checks: []
  },
  'A.8.24': {
    how: "Use encryption appropriate to the sensitivity of the data — BitLocker for device encryption (enforced via Intune), TLS for data in transit, and Azure Key Vault for managing any application-level encryption keys and certificates rather than storing them in code or config files.",
    evidence: "Intune BitLocker enforcement reporting and Azure Key Vault configuration for managed keys/certificates.",
    link: "https://portal.azure.com",
    checks: []
  },
  'A.8.25': {
    how: "Follow a defined secure development life cycle for any software you build — security requirements gathered up front, code review before merge, security testing before release — rather than security being an afterthought. Organisations with no in-house development can scope this control as not applicable and record why.",
    evidence: "The documented SDLC process and evidence it's followed for a sample of recent releases, or a not-applicable justification.",
    link: "https://portal.azure.com",
    checks: []
  },
  'A.8.26': {
    how: "Define security requirements (authentication, authorisation, input validation, logging) as part of application requirements gathering, not bolted on afterward, for any application you build or commission.",
    evidence: "Application security requirements documentation for a recent build or procurement.",
    link: "https://portal.azure.com",
    checks: []
  },
  'A.8.27': {
    how: "Apply secure-by-design architecture principles (least privilege, defence in depth, secure defaults) when designing new systems, and document key architectural security decisions so they survive a team change rather than living only in one person's head.",
    evidence: "Architecture documentation showing security principles were considered for a recent system design.",
    link: "https://portal.azure.com",
    checks: []
  },
  'A.8.28': {
    how: "Follow secure coding practices (input validation, parameterised queries, dependency scanning for known vulnerabilities) and enforce them through code review and automated tooling in your CI/CD pipeline rather than relying on individual developer discipline alone.",
    evidence: "Coding standards documentation and CI/CD pipeline configuration showing automated security scanning.",
    link: "https://portal.azure.com",
    checks: []
  },
  'A.8.29': {
    how: "Test security specifically before release — static/dynamic application security testing, dependency vulnerability scanning, and penetration testing for higher-risk applications — rather than treating functional testing as sufficient coverage for security.",
    evidence: "Security testing results for a recent release, and evidence any findings were remediated before go-live.",
    link: "https://portal.azure.com",
    checks: []
  },
  'A.8.30': {
    how: "Apply the same security requirements to outsourced development as you would to in-house work — a documented security requirement in the development contract, code review or acceptance testing before deployment, and the same vulnerability management obligations.",
    evidence: "The outsourced development contract's security clauses and evidence of security review before accepting delivered code.",
    link: "https://portal.azure.com",
    checks: []
  },
  'A.8.31': {
    how: "Keep development, test and production environments genuinely separate — different Azure subscriptions or resource groups, no production data in test without masking, and restricted access between environments so a test-environment compromise can't reach production.",
    evidence: "The environment separation architecture and access-control configuration confirming isolation.",
    link: "https://portal.azure.com",
    checks: []
  },
  'A.8.32': {
    how: "Run changes through a documented change management process — request, risk assessment, approval, testing, rollback plan — proportionate to the change's risk. A lightweight ticket-based workflow with a required approval step satisfies this for most SMEs; the point is changes aren't made ad hoc to production.",
    evidence: "Change records for a sample of recent changes showing the approval and testing steps were followed.",
    link: "https://admin.microsoft.com",
    checks: []
  },
  'A.8.33': {
    how: "Protect test data the same way you'd protect the production data it's derived from — mask or synthesise sensitive fields before use in testing, and apply the same access restrictions to test environments containing real data as you would in production.",
    evidence: "The test data handling procedure and, where real data is used in test, evidence of masking or equivalent protection.",
    link: "https://purview.microsoft.com",
    checks: []
  },
  'A.8.34': {
    how: "Plan audit and technical testing activities (vulnerability scans, penetration tests, compliance audits) to minimise disruption to production systems — scheduled maintenance windows, read-only access where possible, and advance notice to the teams responsible for the systems being tested.",
    evidence: "A documented audit/testing plan showing disruption-minimisation measures, for a recent audit or test.",
    link: "https://portal.azure.com",
    checks: []
  },
};
