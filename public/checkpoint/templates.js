/* ============================================================
   Checkpoint — Policy Template Library
   window.POLICY_TEMPLATES: starter policy/plan/management-system
   documents, written in our own words — no standard text, no vendor
   boilerplate copied in. The information-security documents assume a
   Microsoft 365 environment; the AI-management documents are platform-
   neutral (AI governance is about the organisation's own AI systems,
   built or procured, not a single vendor). The library covers:
     A. ISO 27001 — the Annex A control policies and the ISMS clause
        documents (see the two-part breakdown below); and
     B. ISO 42001 — the AI Management System (AIMS) set: the AI Policy,
        AIMS Scope (Clause 4.3), AI Risk Management Framework (6.1.2/
        6.1.3), AI System Impact Assessment Process, AI System Lifecycle
        Policy, AI Data Governance Policy, AI Transparency & Information
        Policy, and AI Objectives & Metrics — plus the existing AI
        Acceptable Use Policy. AI-clause documents (AIMS Scope, AI Risk
        Framework) carry empty `controls` for the same reason the ISO
        27001 clause documents do; the AI Annex A documents map to the
        AI.x.x controls; and
   C. ISO 27701 — the PIMS (privacy information management) documents
        beyond what it inherits from ISO 27001: Record of Processing
        Activities & Data Handling Procedure, PII Principal Rights
        Procedure, Consent Management Procedure, Data Protection Impact
        Assessment Process, International PII Transfer Policy, and PII
        Processor Obligations Policy (Clause 8 — only relevant when the
        organisation processes PII on behalf of a customer, e.g. as a
        SaaS vendor, rather than only as controller of its own data).
        Several of these are also tagged 'iso42001', not by assumption
        but because store.js's own control map cross-references them
        (e.g. P.7.2.5 Privacy impact assessment maps to AI.5.2 AI system
        impact assessment) — the same underlying discipline serves both
        frameworks' risk-to-individuals concern.
   The ISO 27001 portion covers two things:
     1. The policy-shaped controls across ISO 27001:2022 Annex A that a
        typical cloud-based organisation needs documented (governance,
        access, cryptography, logging, vulnerability & patch, malware,
        HR, assets, change, physical, supplier, classification,
        development, continuity, incident response) plus AI use and
        privacy; and
     2. The management-system clause documents ISO 27001 requires as
        documented information but that aren't Annex A controls — the
        ISMS Scope (clause 4.3), the Risk Management Framework (clauses
        6.1.2/6.1.3) and the Information Security Objectives & Metrics
        (clauses 6.2/9.1). These carry an empty `controls` array because
        the frameworks model Annex A controls, not clauses — the clause
        each satisfies is named in its own purpose instead. (The other
        clause artefacts — Statement of Applicability, Risk Treatment
        Plan, Management Review, Internal Audit — are generated as
        reports/features elsewhere in Checkpoint, not as templates here.)
   Each entry:
     {
       id,               // stable key, used as the SharePoint filename stem
       title,            // document title
       purpose,          // 2-4 sentence "why this document exists"
       scope,            // 2-4 sentence "who/what this applies to"
       policyStatements, // the actual policy — an array of individual
                          // statements, rendered as a numbered list
       reviewCadence,    // when the document itself must be revisited
       controls,         // control codes this document helps satisfy —
                          // ISO 27001 Annex A ('A.x.x'), ISO 42001 ('AI.x.x')
                          // or ISO 27701 ('P.x.x.x') codes that exist in
                          // S.controls (see store.js's per-framework
                          // control lists). Used by App.generateTemplate()
                          // to offer linking the generated document as
                          // evidence to those exact controls once saved.
       frameworks        // which entitled frameworks make this document
                          // relevant, used to group/filter the template
                          // picker to what a client is actually licensed
                          // for (renderTemplatesPicker() in app.js).
                          // Assigned from real evidence, not guesswork:
                          // the framework(s) whose code system a doc's
                          // own `controls` use, plus any framework store.js's
                          // control `map:` field cross-references for
                          // those exact codes (e.g. a control mapped
                          // "SOC2 CC6.1" earns 'soc2'). ISO 27701 is
                          // included on every non-AI, non-privacy-only
                          // document because 27701 extends ISO 27001 and
                          // needs the same base ISMS documents. A doc can
                          // belong to several frameworks; the picker
                          // shows it once, under the first of its tagged
                          // frameworks in FRAMEWORK_ORDER that the client
                          // is entitled to.
     }
   Deliberately generic on organisation specifics ("the organisation")
   rather than a {TOKEN} mail-merge — personalisation happens through the
   generated document's own header (organisation name, document owner,
   review date), not by rewriting the policy text itself. A generated
   document is a genuinely useful first draft, not a finished, board-
   approved policy — every template ends with the same expectation: a
   practitioner reviews and tailors it before relying on it, which is
   exactly what the DRAFT watermark on the generated document exists to
   flag until someone does. */

window.POLICY_TEMPLATES = [
  {
    id: 'infosec-policy',
    title: 'Information Security Policy',
    purpose: 'This policy sets out the organisation’s commitment to protecting the confidentiality, integrity and availability of the information it holds, and establishes the framework of subordinate policies, roles and controls used to manage information security risk.',
    scope: 'Applies to every employee, contractor and third party who accesses the organisation’s systems, data or Microsoft 365 tenant, and to every information asset the organisation owns, processes or is otherwise responsible for.',
    whyItMatters: 'This is the policy the others hang off, so most of what it asks of you is indirect. The part that is not: the organisation has decided to treat security as something managed deliberately rather than left to individual judgement, which means when you are unsure, there is a documented answer and a named person to ask rather than a guess you have to defend later.\n\nIt also commits the organisation in the other direction. Security measures have to be proportionate to real risk, and you are entitled to ask why a control exists and to have that answered. A control nobody can explain is a control worth challenging.',
    inPractice: [
      'You are asked to do something that seems to conflict with a security requirement. Raise it rather than quietly working around it — the exception route below exists precisely for this, and a documented exception is safer for everyone than an undocumented workaround.',
      'You spot a security problem outside your own area. Report it anyway. Nobody is expected to know whose responsibility something is before flagging it.',
      'A new project or tool is being considered. Security is expected to be part of that conversation from the start, not a sign-off at the end — bringing it up early is cheaper for everyone than retrofitting.'
    ],
    policyStatements: [
      {
        rule: 'Information security is managed as a continuous programme, with a named executive sponsor accountable for the management system as a whole.',
        because: 'Without a single accountable owner, security decisions default to whoever happens to notice, and gaps between teams stay unowned indefinitely.'
      },
      {
        rule: 'Risks to information are identified, assessed and treated through a documented risk register, reviewed at least quarterly.',
        because: 'A register that is written once and never revisited describes the organisation as it was, not as it is, and is worse than none because it looks like control.'
      },
      {
        rule: 'Every employee and contractor completes security awareness training before being granted system access, with refresher training at least annually.',
        because: 'Most successful attacks arrive through a person, so awareness is a control in its own right rather than an administrative formality.'
      },
      {
        rule: 'Access to systems and data follows the principle of least privilege, granted per role and reviewed on a regular cycle.',
        because: 'It bounds the damage from any single compromised account, and access accumulates silently through role changes unless something forces a review.'
      },
      {
        rule: 'Security incidents are reported through the defined incident response process the moment they are suspected — reporting early is never penalised.',
        because: 'The gap between an incident and a near-miss is almost always how quickly someone spoke up, and a culture that punishes reports simply stops receiving them.'
      },
      {
        rule: 'This policy, and every subordinate policy it references, is reviewed by management at least annually, or sooner after a material change to the business or its risk profile.',
        because: 'A policy describing an organisation that no longer exists cannot direct behaviour, and stale documented information is a finding in its own right.'
      }
    ],
    roles: [
      {
        role: 'Executive sponsor',
        responsibility: 'Owns the management system, approves this policy and the risk appetite, and provides the resources the programme needs.'
      },
      {
        role: 'ISMS manager',
        responsibility: 'Runs the programme day to day: risk register, internal audit schedule, corrective actions, and the review cycle for every subordinate policy.'
      },
      {
        role: 'System and information owners',
        responsibility: 'Accountable for the security of the systems and information in their area, including access decisions and evidence that controls are operating.'
      },
      {
        role: 'All personnel',
        responsibility: 'Follow this policy and its subordinate policies, complete assigned training, and report suspected incidents promptly.'
      }
    ],
    exceptions: 'Any exception must be requested in writing before the fact, describe the business reason and the compensating controls, and be approved by the ISMS manager with the executive sponsor informed. Exceptions are time-limited, recorded on the risk register, and reviewed at expiry rather than rolling over automatically.',
    nonCompliance: 'Deliberate or repeated disregard of this policy is handled through the organisation\'s disciplinary process, proportionate to the circumstances and the harm caused. Reporting a genuine mistake, a near-miss or a false alarm is expressly not treated as a breach of this policy — that is the behaviour the organisation wants.',
    relatedDocuments: [
      'Acceptable Use Policy',
      'Access Control Policy',
      'Incident Response Plan',
      'Risk Management Framework',
      'ISMS Scope Document'
    ],
    reviewCadence: 'Annually, or immediately following a material change to the organisation’s structure, technology estate or risk profile — whichever comes first.',
    /* A.5.2 added alongside A.5.1/A.5.4 — this is the one template
       whose generated document actually contains a named roles/
       responsibilities section (see the `roles` array above), so
       linking it as A.5.2's evidence too is earned, not claimed: any
       OTHER policy template with no roles section stays unmapped. */
    controls: ['A.5.1', 'A.5.2', 'A.5.4'],
    frameworks: ['iso27001', 'iso27701', 'soc2', 'nistcsf']
  },
  {
    id: 'acceptable-use-policy',
    title: 'Acceptable Use Policy',
    purpose: 'This policy sets out the acceptable use of the organisation’s devices, accounts, email, internet access and Microsoft 365 services, so that everyone understands what is — and isn’t — permitted use of the organisation’s technology.',
    scope: 'Applies to everyone issued an organisation device, account or Microsoft 365 licence, including remote and hybrid workers, and to any personal device used to access company data.',
    whyItMatters: 'This policy is mostly about keeping the line between "your device and accounts" and "the organisation\'s data" somewhere you can actually see it. That protects you as much as the organisation: where the boundary is clear, ordinary personal use is genuinely fine and nobody is examining your browsing.\n\nThe practical benefit is that following it removes ambiguity if something goes wrong. Work data in approved systems can be recovered, investigated and defended. The same data in a personal account cannot, and the person who put it there is the one who has to explain it.',
    inPractice: [
      'You want to finish something at the weekend and think about emailing a file to your personal account. Use the approved remote access instead — the file in a personal mailbox is outside every protection the organisation has and outside its ability to retrieve it.',
      'You need a tool the organisation does not have. Ask before signing up, especially with a corporate card. Approval is usually quick; unpicking a supplier relationship formed after the data has already gone is not.',
      'Reasonable personal use of your work device is fine. Installing unapproved software on it is not, because that is the route by which most endpoint compromises actually begin.'
    ],
    policyStatements: [
      {
        rule: 'Organisational systems and accounts are provided for business use; incidental personal use is permitted where it does not interfere with work, consume significant resources, or introduce risk.',
        because: 'A blanket ban on personal use is universally ignored, which teaches people that the policy as a whole is optional.'
      },
      {
        rule: 'Organisational data is stored and shared only in approved systems, never in personal cloud storage, personal email, or unmanaged removable media.',
        because: 'Only approved systems carry the organisation\'s access controls, logging and retention — and only they can be searched or purged when that is legally required.'
      },
      {
        rule: 'Software, browser extensions and online services are installed or adopted only where approved; new tools handling organisational data are assessed before use, not after.',
        because: 'An unassessed service is an undisclosed supplier relationship, and browser extensions in particular hold broad access to everything the browser can see.'
      },
      {
        rule: 'Credentials are never shared, and no one shares an account with another person.',
        because: 'A shared login makes every action unattributable, which removes both the deterrent and the ability to show that a specific person did not do something.'
      },
      {
        rule: 'Devices are locked when unattended, kept current with organisational updates, and reported immediately if lost or stolen.',
        because: 'A remote wipe is only useful in the window before someone else has had time with the device.'
      },
      {
        rule: 'Users must not attempt to bypass, disable or test security controls without explicit authorisation.',
        because: 'Well-intentioned testing is indistinguishable from an attack in the logs, and consumes the response capacity a real incident would need.'
      }
    ],
    roles: [
      {
        role: 'All personnel',
        responsibility: 'Follow this policy on every device and account used for work, including personally-owned devices where these are permitted.'
      },
      {
        role: 'Line managers',
        responsibility: 'Ensure their teams have the tools they need through approved routes, so unapproved ones are not the path of least resistance.'
      },
      {
        role: 'IT / ISMS manager',
        responsibility: 'Maintains the approved software and service list, and assesses new requests within a reasonable time.'
      }
    ],
    exceptions: 'Requests for software or services outside the approved list are made to the ISMS manager before adoption, with a note of what data the tool would touch. Approved exceptions are added to the supplier and asset records rather than tracked informally.',
    nonCompliance: 'Breaches are handled through the disciplinary process, proportionate to the circumstances. Disclosing an unapproved tool already in use is treated as putting things right, not as an offence — the register needs to be honest more than it needs to be flattering.',
    relatedDocuments: [
      'Information Security Policy',
      'Data Classification & Handling Policy',
      'AI Acceptable Use Policy',
      'Asset Management Policy'
    ],
    reviewCadence: 'Annually, or when the organisation’s Microsoft 365 device or access policies change materially.',
    controls: ['A.5.10', 'A.6.7'],
    frameworks: ['iso27001', 'iso27701']
  },
  {
    id: 'access-control-policy',
    title: 'Access Control Policy',
    purpose: 'This policy establishes how access to the organisation’s systems and information is requested, granted, reviewed and revoked, so that people only ever hold the access their role genuinely requires.',
    scope: 'Applies to every user, administrative and service account across the organisation’s Microsoft 365 tenant and any connected systems.',
    whyItMatters: 'This policy limits what any single account can reach, including yours. If your credentials are ever captured — a convincing sign-in page is all it takes — the damage is bounded by the access that account held. Holding less access is not a judgement about how far you are trusted; it is what keeps a single mistake small.\n\nNamed accounts work in your favour as well. Where a login is shared, nobody can establish who did what; where it is yours alone, the record can show what you did and what you did not. Access reviews work in both directions — they remove access you no longer need, and they restore access you lost in a role change and have been working around ever since.',
    inPractice: [
      'A senior colleague asks to borrow your login for the afternoon. Decline, and ask for access to be granted to them directly — it takes minutes, and it keeps your name off actions that were not yours.',
      'You move teams and keep your previous team\'s access in case it is needed. This is exactly the accumulation the policy exists to prevent; flag it so it can be removed.',
      'You need administrative rights for a one-off task. Activate them for the period you need rather than holding them permanently.',
      'You are asked to approve someone\'s access request. Approve the access the role needs, not the access they asked for — those are frequently different, and you are the control.'
    ],
    policyStatements: [
      {
        rule: 'Access is granted on the principle of least privilege and need-to-know, requested and approved before provisioning — never after.',
        because: 'Access granted first and reviewed later is almost never reviewed, and retrospective approval records a decision that was not actually made.'
      },
      {
        rule: 'Privileged (administrative) roles are assigned through Microsoft Entra Privileged Identity Management with time-bound activation, not standing admin rights.',
        because: 'A standing administrative account is valuable to an attacker continuously; an activated one is valuable only during the window it is in use.'
      },
      {
        rule: 'Multi-factor authentication is required on every account, with no standing exceptions for legacy or service accounts capable of supporting it.',
        because: 'A password alone is one leaked breach corpus away from being public, and exceptions are precisely where attackers look first.'
      },
      {
        rule: 'Access rights are formally reviewed at least every six months, and immediately on role change or termination.',
        because: 'Entitlements accumulate silently as people move around, and a leaver\'s live account is the single most exploitable artefact an organisation leaves lying about.'
      },
      {
        rule: 'Shared or generic accounts are not used for individual access; every action taken on a system must be attributable to a named person.',
        because: 'Attribution is what makes logging useful — and it is what allows someone to demonstrate that an action was not theirs.'
      },
      {
        rule: 'Guest access to Microsoft 365 resources is time-limited, reviewed periodically, and removed the moment it is no longer required.',
        because: 'Guest access outlives the project that justified it by default, leaving external parties holding access nobody remembers granting.'
      }
    ],
    roles: [
      {
        role: 'System owners',
        responsibility: 'Approve access requests for their systems, and complete the six-monthly review of who currently holds access.'
      },
      {
        role: 'IT / administrators',
        responsibility: 'Provision and revoke access only against an approved request, and maintain the privileged access configuration.'
      },
      {
        role: 'Line managers',
        responsibility: 'Initiate access changes on joining, role change and leaving — the same day, in the leaver case.'
      },
      {
        role: 'All personnel',
        responsibility: 'Use only their own accounts, and report access they hold but no longer need.'
      }
    ],
    exceptions: 'Where a system genuinely cannot support multi-factor authentication or named accounts, the exception is documented with compensating controls (such as network restriction, additional monitoring, or credential rotation), approved by the ISMS manager, recorded on the risk register, and reviewed at least annually.',
    nonCompliance: 'Sharing credentials, retaining access after being asked to relinquish it, or bypassing the approval process is handled through the disciplinary process. Reporting that you hold access you should not is not a breach — it is the review working.',
    relatedDocuments: [
      'Information Security Policy',
      'Human Resources Security Policy',
      'Cryptography Policy',
      'Logging & Monitoring Policy'
    ],
    reviewCadence: 'Every six months, alongside the scheduled access review, or sooner following a significant access-related incident.',
    controls: ['A.5.15', 'A.5.16', 'A.5.18'],
    frameworks: ['iso27001', 'iso27701', 'soc2', 'nistcsf']
  },
  {
    id: 'incident-response-plan',
    title: 'Incident Response Plan',
    purpose: 'This plan defines how the organisation detects, responds to and recovers from information security incidents, so that impact is contained quickly and consistently, regardless of who is on shift when it happens.',
    scope: 'Covers any suspected or confirmed security incident affecting the organisation’s systems, data or Microsoft 365 tenant, including breaches, malware, unauthorised access and data loss.',
    whyItMatters: 'The single most valuable thing in this plan is the reporting step, and it is the one that depends entirely on you. Almost every incident that stayed small did so because somebody said something quickly, and almost every one that did not was known about by somebody who waited.\n\nYou are not expected to diagnose anything. You are not expected to be sure. Deciding whether something is serious is somebody else\'s job, and they would far rather assess ten false alarms than miss the one that mattered. Reporting a mistake you made yourself is explicitly protected — the first hour is usually when a compromise can still be contained completely, and that hour is worth more than any explanation offered afterwards.',
    inPractice: [
      'You clicked a link and entered your password, and realised twenty minutes later. Report it now. That is usually well inside the window where resetting the password and revoking sessions ends the whole thing.',
      'You sent a file to the wrong external recipient. Report it and preserve the evidence — do not delete the sent message, because it is what the assessment is based on.',
      'Something feels off but you cannot say why, and you do not want to waste anyone\'s time. Report it anyway. Pattern-spotting across several vague reports is how real intrusions get found.',
      'It is Friday evening. Report it anyway rather than letting a weekend pass on a suspected compromise.'
    ],
    policyStatements: [
      {
        rule: 'All suspected security incidents are reported immediately through the defined channel, regardless of certainty or perceived severity.',
        because: 'Triage requires the report to exist; a threshold applied by the person who noticed filters out precisely the ambiguous cases that matter most.'
      },
      {
        rule: 'Incidents are triaged and categorised by severity on receipt, with a defined owner assigned to each.',
        because: 'An incident without a named owner is an incident everyone assumes someone else is handling.'
      },
      {
        rule: 'Containment takes priority over investigation: affected accounts are disabled, sessions revoked and access removed before root cause is established.',
        because: 'Every minute spent understanding an active compromise before stopping it is a minute the attacker keeps using.'
      },
      {
        rule: 'Evidence is preserved before remediation where practicable — logs, messages and affected files are captured rather than deleted.',
        because: 'Remediation routinely destroys the only record of what happened, and both the assessment and any notification obligation depend on it.'
      },
      {
        rule: 'Incidents meeting the defined threshold are escalated to management, and where personal information is involved, assessed against the applicable breach-notification obligations without delay.',
        because: 'Notification clocks start at suspicion rather than confirmation, so time spent deciding whether to start the assessment is time already on the clock.'
      },
      {
        rule: 'Every incident is reviewed after closure, with lessons recorded and corrective actions raised where a control failed.',
        because: 'An incident that produces no change is one the organisation has paid for and learned nothing from.'
      }
    ],
    roles: [
      {
        role: 'All personnel',
        responsibility: 'Report suspected incidents immediately, preserve evidence, and do not communicate externally about an incident before the response is coordinated.'
      },
      {
        role: 'Incident owner',
        responsibility: 'Runs the response for a given incident: containment, investigation, recovery, and the post-incident review.'
      },
      {
        role: 'ISMS manager',
        responsibility: 'Maintains this plan, triages incoming reports, assesses breach-notification obligations, and tracks corrective actions to closure.'
      },
      {
        role: 'Executive sponsor',
        responsibility: 'Decides on external communication, regulatory notification and any material business decision arising from an incident.'
      }
    ],
    exceptions: 'There are no exceptions to the reporting requirement. Where containment would cause greater harm than the incident itself — for example taking a safety-critical system offline — the incident owner may defer containment with the executive sponsor\'s agreement, recording the decision and its reasoning at the time.',
    nonCompliance: 'Concealing or delaying the report of a known incident is treated as a serious matter, precisely because early reporting is the control this plan depends on. Making the mistake that caused the incident is not: reporting your own error promptly is the outcome this plan is designed to produce.',
    relatedDocuments: [
      'Information Security Policy',
      'Business Continuity & Disaster Recovery Plan',
      'Logging & Monitoring Policy',
      'Privacy Policy'
    ],
    reviewCadence: 'Annually, and after every incident classified as major, incorporating the lessons learned from it.',
    /* A.5.27/A.5.28/A.6.8 added — each has its own explicit statement
       here: "All suspected security incidents are reported immediately
       through the defined channel" is A.6.8 (event reporting), "Evidence
       is preserved before remediation... logs, messages and affected
       files are captured rather than deleted" is A.5.28 (collection of
       evidence), and "Every incident is reviewed after closure, with
       lessons recorded and corrective actions raised" is A.5.27
       (learning from incidents). */
    controls: ['A.5.24', 'A.5.25', 'A.5.26', 'A.5.27', 'A.5.28', 'A.6.8'],
    frameworks: ['iso27001', 'iso27701', 'nistcsf', 'dispirap']
  },
  {
    id: 'bcp-dr-plan',
    title: 'Business Continuity & Disaster Recovery Plan',
    purpose: 'This plan sets out how the organisation maintains and recovers its critical business functions and IT services following a disruptive event, minimising downtime and data loss.',
    scope: 'Covers every business-critical process, application and piece of infrastructure the organisation depends on, including Microsoft 365 services and any on-premises or third-party hosted systems.',
    whyItMatters: 'This plan exists so that when something significant fails, the decisions have already been made and nobody is improvising under pressure. If you have a role in recovery you should know it before the day, and if you do not, the useful thing is knowing where to look for instructions and who is coordinating.\n\nThe testing requirement is the part that matters most and gets skipped most. An untested recovery plan is a document that describes what somebody hoped would work, and the failures it hides are usually mundane — the backup that never included the right database, the credentials nobody outside one person holds.',
    inPractice: [
      'A system you depend on is down and you do not know if it is a general outage. Say so early rather than waiting to see; several people reporting the same thing is how the scale of an event becomes clear.',
      'You are asked to take part in a recovery test. Treat it as real, including the parts that are inconvenient — a test where everyone helps it succeed tells you nothing.',
      'You maintain a workaround that only you know about. Write it down. Continuity planning fails on undocumented knowledge held by whoever is on leave that week.'
    ],
    policyStatements: [
      {
        rule: 'Critical business processes and the systems supporting them are identified, with a recovery time objective and recovery point objective agreed for each.',
        because: 'Without agreed targets, recovery priorities are decided during the incident by whoever is loudest, and everything is claimed as critical.'
      },
      {
        rule: 'Backups are taken on a defined schedule, held with at least one copy isolated from the production environment, and encrypted at rest.',
        because: 'Ransomware deliberately targets reachable backups, so a backup an attacker can also reach is not a backup.'
      },
      {
        rule: 'Backup restoration is tested at least quarterly, and the test result recorded.',
        because: 'Backup jobs report success on backups that cannot actually be restored, and restoration is the only step that proves otherwise.'
      },
      {
        rule: 'The continuity and recovery plan is exercised at least annually, including the communication and decision-making steps, not only the technical restore.',
        because: 'Most recovery failures are coordination failures rather than technical ones, and only an exercise that includes people surfaces them.'
      },
      {
        rule: 'Emergency contact details, escalation paths and recovery instructions are maintained somewhere accessible when primary systems are unavailable.',
        because: 'A recovery plan stored only in the system that is down is not available at the moment it is needed.'
      },
      {
        rule: 'Recovery dependencies on third parties are documented, with the supplier\'s own commitments and contact routes recorded alongside.',
        because: 'Recovery targets that assume a supplier will respond faster than their contract requires are aspirations, not plans.'
      }
    ],
    roles: [
      {
        role: 'Executive sponsor',
        responsibility: 'Declares a continuity event, approves recovery priorities where they conflict, and owns external communication.'
      },
      {
        role: 'Recovery coordinator',
        responsibility: 'Runs the recovery: sequencing, status, and the decision log that records what was done and why.'
      },
      {
        role: 'System owners',
        responsibility: 'Maintain recovery procedures for their systems, and take part in scheduled restore and failover tests.'
      },
      {
        role: 'All personnel',
        responsibility: 'Follow instructions issued during a continuity event, and know how to reach the coordinator when normal systems are unavailable.'
      }
    ],
    exceptions: 'Where a system cannot meet its recovery objective with current arrangements, the shortfall is recorded on the risk register with its business impact and either accepted formally or funded for remediation. An objective nobody can meet is not left standing on paper as though it were achievable.',
    nonCompliance: 'Failure to participate in scheduled testing, or to maintain recovery documentation for a system you own, is addressed with the system owner and escalated to the executive sponsor where it persists.',
    relatedDocuments: [
      'Incident Response Plan',
      'Information Security Policy',
      'Supplier Security Policy',
      'Asset Management Policy'
    ],
    reviewCadence: 'Annually, and after any exercise or real invocation that surfaces a material gap.',
    controls: ['A.5.29', 'A.5.30', 'A.8.14'],
    frameworks: ['iso27001', 'iso27701', 'soc2', 'nistcsf']
  },
  {
    id: 'supplier-security-policy',
    title: 'Supplier Security Policy',
    purpose: 'This policy sets the minimum security expectations the organisation places on suppliers and third parties who access its systems, data or Microsoft 365 environment, so third-party risk is managed consistently rather than case by case.',
    scope: 'Applies to every supplier, contractor or third-party service provider with access to the organisation’s information, systems or premises, including cloud and SaaS providers.',
    whyItMatters: 'Most of the organisation\'s data risk now sits with suppliers rather than inside its own walls, and most supplier relationships begin with somebody adopting a tool that solves a real problem. This policy exists to make that route fast rather than to block it — an assessment before the data goes is quick, and unpicking a relationship after it has is not.\n\nWhat it means for you day to day is small: raise a new tool before loading real data into it, and tell someone if a supplier reports a problem. Accountability for data does not transfer to the supplier, so a supplier\'s breach is our breach to assess as well as theirs.',
    inPractice: [
      'You find a tool that would genuinely save your team time. Raise it before signing up, particularly before paying with a corporate card — a low-risk tool touching no personal data is usually approved quickly.',
      'A supplier emails to say they have had a security incident affecting customer data. Escalate immediately rather than waiting for their investigation to conclude; our own assessment clock may already be running.',
      'A supplier asks for access to a system so they can help troubleshoot. Named, time-limited access through the normal process — not a shared login, and not left in place afterwards.'
    ],
    policyStatements: [
      {
        rule: 'Suppliers with access to organisational data or systems are risk-assessed before onboarding, proportionate to the sensitivity of the data and the criticality of the service.',
        because: 'The assessment can influence the contract only while the contract is still being negotiated.'
      },
      {
        rule: 'Security and, where relevant, data protection obligations are set out in the contract before any data is shared.',
        because: 'Without contractual obligations there is no basis to require anything of the supplier, including telling us when something goes wrong.'
      },
      {
        rule: 'A register of suppliers is maintained, recording what data each can access, their criticality, and the date of their last review.',
        because: 'An organisation that cannot list who holds its data cannot assess the impact of any supplier breach, or answer the question at audit.'
      },
      {
        rule: 'Critical and high-criticality suppliers are reviewed at least annually, including any certifications, assurance reports or questionnaire responses they provide.',
        because: 'A supplier\'s security posture at onboarding says nothing about their posture three years and one acquisition later.'
      },
      {
        rule: 'Suppliers are required to notify the organisation of security incidents affecting its data without undue delay.',
        because: 'Our own notification obligations can be triggered by their breach, and we cannot meet a deadline we learn about late.'
      },
      {
        rule: 'On termination, supplier access is revoked and the return or deletion of organisational data is confirmed.',
        because: 'Access and data both persist by default after a relationship ends unless someone explicitly closes them out.'
      }
    ],
    roles: [
      {
        role: 'Relationship owner',
        responsibility: 'Named for each supplier; owns the annual review, the accuracy of the register entry, and escalating supplier incidents.'
      },
      {
        role: 'ISMS manager',
        responsibility: 'Sets the assessment approach, reviews high-criticality assessments, and maintains the supplier register.'
      },
      {
        role: 'Anyone adopting a tool or service',
        responsibility: 'Raises it before organisational data is placed in it, including free and trial services.'
      }
    ],
    exceptions: 'Urgent adoption ahead of full assessment requires the ISMS manager\'s approval, is limited to non-sensitive data, and carries a deadline for completing the assessment. The exception is recorded on the risk register rather than agreed informally.',
    nonCompliance: 'Placing organisational data with an unassessed supplier is a breach of this policy. Disclosing a tool already in use so it can be assessed is not — the register needs to be accurate more than it needs to be clean.',
    relatedDocuments: [
      'Information Security Policy',
      'Data Classification & Handling Policy',
      'Acceptable Use Policy',
      'Business Continuity & Disaster Recovery Plan'
    ],
    reviewCadence: 'Annually for standard suppliers; more frequently for any supplier assessed as Critical or High risk.',
    controls: ['A.5.19', 'A.5.20', 'A.5.22'],
    frameworks: ['iso27001', 'iso27701', 'soc2', 'dispirap']
  },
  {
    id: 'data-classification-policy',
    title: 'Data Classification & Handling Policy',
    purpose: 'This policy defines how information at the organisation is classified by sensitivity, and how each classification must be labelled, stored, shared and disposed of.',
    scope: 'Applies to all information created, received or held by the organisation, in any format, across Microsoft 365 and any other system it is stored in.',
    whyItMatters: 'Classification is how the organisation avoids two equally bad outcomes: treating everything as highly sensitive, which makes ordinary work slow enough that people route around it, and treating nothing as sensitive, which is how data ends up somewhere it should not be.\n\nFor you it comes down to a judgement you already make informally — how much would it matter if this got out — made explicit and consistent. Where labels are in use they are worth applying, because the label carries protection with the file long after you have stopped thinking about it: encryption, sharing limits and retention apply automatically wherever the file travels.',
    inPractice: [
      'You are about to share a document externally. Check the classification first — that is the moment the label is designed for, and the moment misdirected sharing usually happens.',
      'You are unsure between two classifications. Choose the higher one and ask; over-protecting a document is a nuisance, under-protecting it can be a notifiable breach.',
      'You need to send sensitive information to a client. Use the approved sharing route with specific recipients and an expiry, rather than an attachment that will sit in a mailbox indefinitely.'
    ],
    policyStatements: [
      {
        rule: 'All information is classified according to the organisation\'s classification scheme, based on the impact of its unauthorised disclosure, modification or loss.',
        because: 'Protection proportionate to impact is the only way to apply strong controls where they matter without applying them everywhere, which is unaffordable and unfollowed.'
      },
      {
        rule: 'Classification is applied at creation by the person creating the information, and reviewed when its sensitivity materially changes.',
        because: 'Nobody is better placed to judge sensitivity than the author, and retrospective classification of an existing estate rarely happens.'
      },
      {
        rule: 'Handling rules — storage, sharing, transmission, retention and disposal — are defined for each classification level and applied accordingly.',
        because: 'A classification with no handling consequence is a label, not a control.'
      },
      {
        rule: 'Where sensitivity labels are available in Microsoft 365, they are used to enforce protection technically rather than relying on user behaviour alone.',
        because: 'Technical enforcement travels with the file and keeps working after the author has forgotten it exists.'
      },
      {
        rule: 'Information is retained only as long as there is a business or legal requirement, then securely deleted or de-identified.',
        because: 'Data held past its purpose carries all of the breach risk and none of the value, and is disclosable in a breach regardless.'
      },
      {
        rule: 'Physical and electronic disposal uses methods appropriate to the classification, with secure destruction for anything above the lowest level.',
        because: 'Discarded media and paper are among the least defended and most easily obtained sources of organisational data.'
      }
    ],
    roles: [
      {
        role: 'Information owners',
        responsibility: 'Define the classification of the information in their area and approve exceptions to its handling rules.'
      },
      {
        role: 'All personnel',
        responsibility: 'Classify information they create, apply the handling rules for its level, and apply labels where these are in use.'
      },
      {
        role: 'ISMS manager',
        responsibility: 'Maintains the classification scheme and its handling rules, and monitors that labelling is actually being applied.'
      }
    ],
    exceptions: 'Where a handling rule prevents a legitimate business activity, the information owner may approve a documented, time-limited alternative with compensating controls. Reclassifying information downwards to avoid a handling rule requires the information owner\'s explicit approval and a recorded reason.',
    nonCompliance: 'Deliberately mishandling classified information, or reclassifying it to avoid controls, is addressed through the disciplinary process. Misjudging a classification in good faith is not — that is what the review and the ask-if-unsure route are for.',
    relatedDocuments: [
      'Acceptable Use Policy',
      'Access Control Policy',
      'Cryptography Policy',
      'Record of Processing Activities & Data Handling Procedure'
    ],
    reviewCadence: 'Annually, or when a new category of sensitive information is introduced into the business.',
    controls: ['A.5.12', 'A.5.13', 'A.5.14'],
    frameworks: ['iso27001', 'iso27701', 'soc2']
  },
  {
    id: 'secure-development-policy',
    title: 'Secure Development Policy',
    purpose: 'This policy sets out the security requirements the organisation applies when developing, testing or modifying software and systems, so security is built in from the start rather than retrofitted afterwards.',
    scope: 'Applies to all in-house and outsourced software development, including internal tools, customer-facing applications, and any automation built on Microsoft 365 or Power Platform.',
    whyItMatters: 'Security defects are ordinary defects with a worse discovery process: instead of a user reporting them, someone exploits them. Everything in this policy is aimed at finding them at the point where fixing them is routine, which is during development rather than after disclosure.\n\nIf you write or review code, the practical effect is that security is part of the definition of done rather than a separate gate at the end. That is faster, not slower — a design flaw caught in review costs a conversation, and the same flaw caught in production costs an incident.',
    inPractice: [
      'A dependency update fails your build and the deadline is close. Do not pin to the vulnerable version and move on — raise it, because that pin will outlive everyone\'s memory of why it is there.',
      'You need production-like data to test with. Use synthetic or de-identified data; copying live customer data into a test environment moves it somewhere with weaker controls and no retention.',
      'A secret needs to be available to the application. Use the secrets store, never source control — and if one has already been committed, say so, because rotating it is the fix and deleting the commit is not.'
    ],
    policyStatements: [
      {
        rule: 'Security requirements are defined at design time, and significant changes are threat-modelled before implementation.',
        because: 'Design flaws cannot be patched out later without rework, unlike implementation bugs.'
      },
      {
        rule: 'All code is peer-reviewed before merge, with the review explicitly covering security-relevant changes such as authentication, authorisation and data handling.',
        because: 'A second reader catches the assumptions the author could not see, which is exactly where authorisation bugs live.'
      },
      {
        rule: 'Secrets, credentials and keys are never committed to source control; they are held in an approved secrets store and rotated on a defined schedule.',
        because: 'Repository history is effectively permanent, so a committed secret must be treated as disclosed even after it is deleted.'
      },
      {
        rule: 'Dependencies are inventoried and scanned for known vulnerabilities, with a defined timeframe for remediating findings by severity.',
        because: 'Most of the code in a modern application is somebody else\'s, and its vulnerabilities become ours on the day they are published.'
      },
      {
        rule: 'Development, test and production environments are separated, and production data is not used in lower environments without de-identification.',
        because: 'Lower environments are consistently less protected and more widely accessible, so live data placed there quietly increases exposure.'
      },
      {
        rule: 'Changes are deployed through a controlled pipeline with an auditable record of what was released, by whom, and when.',
        because: 'Recovering from a bad release requires knowing exactly what changed, and attributing a change is a control in its own right.'
      }
    ],
    roles: [
      {
        role: 'Engineering lead',
        responsibility: 'Owns the secure development practices for their team, including review standards and the remediation timeframes actually being met.'
      },
      {
        role: 'Developers',
        responsibility: 'Follow secure coding practices, participate in review, and raise security concerns rather than working around them.'
      },
      {
        role: 'ISMS manager',
        responsibility: 'Agrees the remediation timeframes by severity, and reviews that scanning and review evidence exists.'
      }
    ],
    exceptions: 'Deploying with a known unremediated vulnerability requires documented approval from the engineering lead, a compensating control or mitigation, and a remediation date. The exception goes on the risk register; it is not carried informally in a backlog ticket.',
    nonCompliance: 'Bypassing review or deployment controls is addressed with the individual and their lead. Disclosing a committed secret or an introduced vulnerability is treated as putting it right — rotation and remediation are the response, not blame.',
    relatedDocuments: [
      'Change Management Policy',
      'Vulnerability & Patch Management Policy',
      'Cryptography Policy',
      'Information Security Policy'
    ],
    reviewCadence: 'Annually, or when the development toolchain or hosting environment changes materially.',
    /* A.8.26/A.8.27/A.8.33 added — each has its own explicit statement
       here, not just a family resemblance to A.8.25/A.8.28/A.8.31:
       "Security requirements are defined at design time" is A.8.26,
       "significant changes are threat-modelled before implementation"
       is A.8.27, and "production data is not used in lower environments
       without de-identification" is A.8.33 (test information). */
    controls: ['A.8.25', 'A.8.26', 'A.8.27', 'A.8.28', 'A.8.31', 'A.8.33'],
    frameworks: ['iso27001', 'iso27701', 'iso42001', 'soc2']
  },
  {
    id: 'ai-acceptable-use-policy',
    title: 'AI Acceptable Use Policy',
    purpose: 'This policy sets out how employees may use AI tools — including Microsoft Copilot and any third-party generative AI service — in the course of their work, balancing the productivity these tools offer against data protection and accuracy risk.',
    scope: 'Applies to every employee and contractor using an AI tool, whether organisation-provisioned or brought in independently, on any organisation device, account or data.',
    whyItMatters: 'AI tools are genuinely useful and the organisation is not trying to discourage them. What it needs is to know which ones are in use and what data goes into them, because it stays accountable for both regardless of which tool produced the output.\n\nTwo things are worth internalising. Anything you put into an unapproved AI service should be treated as disclosed — you cannot retrieve it, and you frequently cannot establish whether it was retained or used for training. And output you accept becomes your work: "the model produced it" is not a position anyone can defend to a client or a regulator, so the verification step is protecting you as much as anyone.',
    inPractice: [
      'You want to summarise a long document quickly. Check whether the tool is approved before uploading it — uploading the whole file submits everything in it, including attachments, comments and tracked changes you were not thinking about.',
      'An AI assistant gives you a confident answer with figures and sources. Verify them before they leave you; fabricated citations are produced in exactly the same fluent, correctly-formatted style as real ones.',
      'A tool you already use quietly switches on an AI feature — a meeting note-taker, a summariser. Raise it, because the original approval did not cover a system now processing conversations.'
    ],
    policyStatements: [
      {
        rule: 'Only approved AI tools are used for work, and new AI tools or newly-enabled AI features are raised for assessment before organisational data is placed in them.',
        because: 'The organisation cannot assess, secure or answer for a system it does not know exists, and AI features increasingly arrive switched on inside already-approved products.'
      },
      {
        rule: 'Personal information, confidential information, credentials and unreleased commercial information are not entered into AI tools that have not been assessed and contracted for that purpose.',
        because: 'Submission to an external service is a disclosure to that service, and consumer tiers commonly retain input or use it for training.'
      },
      {
        rule: 'AI output is verified before it is relied on, published, or used to support a decision — the user remains the author and is accountable for the result.',
        because: 'Models produce plausible text rather than true text, and state fabricated facts in the same confident tone as established ones.'
      },
      {
        rule: 'AI is not used as the sole basis for a decision that materially affects an individual; a person with authority to reach a different conclusion reviews it.',
        because: 'Accountability for an outcome cannot be delegated to a system, and a review nobody has time to perform properly is not a review.'
      },
      {
        rule: 'Where AI has materially contributed to work provided to a client or published externally, that is disclosed where the client or the context requires it.',
        because: 'Undisclosed AI involvement damages trust disproportionately when it is discovered rather than declared.'
      },
      {
        rule: 'AI tools in use are recorded in the organisation\'s AI system register, with their purpose, the data they touch and their owner.',
        because: 'The register is what makes every other control here enforceable, and it is the first thing an assessor asks to see.'
      }
    ],
    roles: [
      {
        role: 'AI system owner',
        responsibility: 'Named for each approved tool; owns its register entry, its purpose and data scope, and its periodic review.'
      },
      {
        role: 'All personnel',
        responsibility: 'Use approved tools only, verify output before relying on it, and disclose AI tools or features already in use so they can be assessed.'
      },
      {
        role: 'ISMS manager',
        responsibility: 'Assesses new AI tools, maintains the register, and determines when an impact assessment is required.'
      }
    ],
    exceptions: 'Evaluating an unapproved tool is permitted using synthetic or public data only, with no organisational data of any kind, and is raised before any move to real use. Any other exception requires the ISMS manager\'s written approval and a record on the risk register.',
    nonCompliance: 'Entering confidential or personal information into an unapproved AI service is a breach of this policy and may also be a data breach requiring assessment. Disclosing a tool already in use is expressly not a breach — an honest register is worth more than a flattering one.',
    relatedDocuments: [
      'Acceptable Use Policy',
      'Data Classification & Handling Policy',
      'AI Policy',
      'AI System Impact Assessment Process'
    ],
    reviewCadence: 'Annually, or sooner given how quickly AI tooling and organisational usage of it are evolving.',
    controls: ['AI.2.2', 'AI.3.2'],
    frameworks: ['iso27001', 'iso27701', 'iso42001']
  },
  {
    id: 'privacy-policy-skeleton',
    /* Titled as the document the client will actually publish, not as
       what it is on the shelf. The title renders on the face of the
       generated file and becomes its SharePoint filename, so a
       "(Skeleton)" suffix would be renamed by every client on first
       use — and the register, attestation records and audit log all key
       off that filename. Its unfinished state is carried by the DRAFT
       watermark, the purpose below, and the explicit placeholder
       statement, which is where that warning belongs. The id stays
       privacy-policy-skeleton: that is the stable key. */
    title: 'Privacy Policy',
    purpose: 'This document outlines how the organisation collects, uses, discloses and protects personal information, in line with its obligations under applicable privacy law and its own privacy commitments. It is a starting skeleton, not a finished policy — it must be completed with the organisation’s specific data-handling practices before publication.',
    scope: 'Applies to personal information the organisation collects from customers, employees, job applicants and any other individual, across every system and process that handles it, including Microsoft 365.',
    whyItMatters: 'This is the organisation\'s external statement about how it handles personal information, so unlike most policies here its audience is customers and the public. That makes accuracy the whole point: a privacy statement describing practices the organisation does not actually follow is worse than a vague one, because it is a representation regulators and customers can hold it to.\n\nIf you work with personal information, the useful thing is knowing that this document is a promise made on your behalf, and that changes to what you collect or who you share it with need to be reflected here.',
    inPractice: [
      'A new integration or supplier will receive customer personal information. Check whether this statement still describes reality, and flag it if not.',
      'A customer asks what the organisation does with their data. Point them here rather than improvising — informal answers create expectations the organisation may not meet.',
      'You are drafting a new collection form. Only collect fields there is a purpose for, and make sure the purpose is one this statement covers.'
    ],
    policyStatements: [
      {
        rule: 'Personal information is only collected for a clearly identified, lawful purpose, and only the information reasonably necessary for that purpose is collected.',
        because: 'Every field collected is one to secure, retain, disclose in a breach and account for later; "it might be useful" is not a purpose.'
      },
      {
        rule: 'Individuals are told, at or before the point of collection, what personal information is collected, why, and how to contact the organisation about it.',
        because: 'Transparency at collection is what makes every later use defensible, and it cannot be applied retrospectively.'
      },
      {
        rule: 'Personal information is not used or disclosed for a purpose other than the one it was collected for, without consent or another lawful basis.',
        because: 'Purpose creep is the most common privacy failure, and it happens gradually through reasonable-seeming individual decisions.'
      },
      {
        rule: 'Individuals may request access to, correction of, or deletion of their personal information, and requests are actioned within the timeframe required by applicable law.',
        because: 'These rights carry statutory deadlines that begin when the request is made, however informally it arrives.'
      },
      {
        rule: 'Personal information is retained only for as long as necessary for the purpose it was collected, then securely destroyed or de-identified.',
        because: 'Data held past its purpose carries all of the breach exposure and none of the value.'
      },
      {
        rule: 'Any suspected or confirmed breach involving personal information is assessed against notification obligations without delay.',
        because: 'Assessment clocks run from suspicion, not confirmation, so time spent deciding whether to start is time already spent.'
      },
      {
        rule: 'The privacy obligations this organisation operates under include: {{regulatory}}. The specific personal-information categories collected, and every third party they are disclosed to, must be listed here before this policy is published externally.',
        because: 'A published privacy statement is a representation the organisation can be held to, so a generic one is a promise nobody has checked it keeps.'
      }
    ],
    roles: [
      {
        role: 'Privacy contact / officer',
        responsibility: 'Owns this statement, keeps it accurate as practices change, and handles individuals\' rights requests and complaints.'
      },
      {
        role: 'Process and system owners',
        responsibility: 'Tell the privacy contact when what they collect, how they use it, or who they share it with changes.'
      },
      {
        role: 'All personnel',
        responsibility: 'Handle personal information consistently with what this statement says, and recognise and pass on rights requests promptly.'
      }
    ],
    exceptions: 'This is an external statement rather than an internal control, so it has no exception route. Where practice and statement diverge, the statement is corrected — practice is not exempted from it.',
    nonCompliance: 'Handling personal information inconsistently with this statement may constitute a regulatory breach as well as a policy breach, and is escalated to the privacy contact immediately.',
    relatedDocuments: [
      'Record of Processing Activities & Data Handling Procedure',
      'PII Principal Rights Procedure',
      'Data Classification & Handling Policy',
      'Incident Response Plan'
    ],
    reviewCadence: 'Annually, or whenever privacy law or the organisation’s data handling practices change materially.',
    controls: ['A.5.34', 'P.7.2.2'],
    frameworks: ['iso27001', 'iso27701']
  },
  {
    id: 'cryptography-policy',
    title: 'Cryptography Policy',
    purpose: 'This policy sets out how the organisation uses cryptography to protect the confidentiality and integrity of its information, and how the keys and certificates that make that protection possible are managed through their life.',
    scope: 'Applies to all organisation information that requires cryptographic protection in transit or at rest, and to every key, certificate and secret used to provide it, across Microsoft 365 and any connected system.',
    whyItMatters: 'Encryption is the control that still works after every other one has failed. If a laptop is stolen, a backup is copied, or a mailbox is exported, encryption is what determines whether that is an inconvenience or a notifiable breach.\n\nFor most people the practical effect is invisible, which is the intent — device encryption and encrypted connections should not require you to do anything. The two places it becomes visible are when you are asked not to disable something, and when you are tempted to move data through an unencrypted route because it is quicker. Both are worth the friction.',
    inPractice: [
      'You need to send sensitive information to someone outside the organisation. Use the approved encrypted route rather than a plain attachment — an emailed file is stored unencrypted in however many mailboxes it passes through.',
      'A device prompts you about encryption or a certificate warning appears on a network. Stop and report it rather than clicking through; a certificate warning is exactly what an interception attempt looks like.',
      'You are handling a key, certificate or connection string. It belongs in the approved secrets store, never in a document, a chat message or source control.'
    ],
    policyStatements: [
      {
        rule: 'Information classified above the lowest level is encrypted at rest and in transit using current, industry-accepted algorithms and key lengths.',
        because: 'Encryption is the last control standing when physical or access controls fail, and it is what determines whether a loss is reportable.'
      },
      {
        rule: 'All organisational endpoints and removable media use full-disk encryption.',
        because: 'A lost unencrypted device is a disclosure of everything on it; an encrypted one is usually a hardware replacement.'
      },
      {
        rule: 'Cryptographic keys, certificates and secrets are generated, stored and rotated through approved key management, never held in documents, code or messages.',
        because: 'A key held somewhere convenient is a key held somewhere copyable, and its exposure invalidates the encryption it protects.'
      },
      {
        rule: 'Deprecated protocols and algorithms are disabled, and the estate is reviewed against current guidance at least annually.',
        because: 'Cryptography degrades over time as attacks improve, so a configuration that was strong at deployment silently becomes weak.'
      },
      {
        rule: 'Certificate expiry is monitored and renewal planned ahead of time.',
        because: 'An expired certificate is an outage that also trains users to click through security warnings.'
      },
      {
        rule: 'Where encryption is used to protect personal information, the arrangement is recorded so it can be relied on when assessing a breach.',
        because: 'Effective encryption can be the difference between a breach that must be notified and one that need not be, but only if it can be evidenced.'
      }
    ],
    roles: [
      {
        role: 'IT / platform owner',
        responsibility: 'Implements and maintains encryption across the estate, monitors certificate expiry, and runs the annual algorithm review.'
      },
      {
        role: 'Developers',
        responsibility: 'Use approved libraries and the secrets store; never implement bespoke cryptography.'
      },
      {
        role: 'All personnel',
        responsibility: 'Use approved encrypted routes for sensitive information and never disable device encryption.'
      }
    ],
    exceptions: 'A legacy system unable to support current encryption standards requires a documented exception with compensating controls — network isolation, restricted access, or additional monitoring — approved by the ISMS manager, recorded on the risk register and reviewed at least annually against a plan to retire or upgrade it.',
    nonCompliance: 'Disabling encryption, or moving sensitive information through an unencrypted route to save time, is addressed through the disciplinary process where deliberate.',
    relatedDocuments: [
      'Data Classification & Handling Policy',
      'Access Control Policy',
      'Secure Development Policy',
      'Asset Management Policy'
    ],
    reviewCadence: 'Annually, or sooner if a cryptographic weakness is disclosed that affects the algorithms or protocols the organisation relies on.',
    controls: ['A.8.24'],
    frameworks: ['iso27001', 'iso27701', 'soc2', 'nistcsf']
  },
  {
    id: 'logging-monitoring-policy',
    title: 'Logging & Monitoring Policy',
    purpose: 'This policy defines what security-relevant activity the organisation records, how those records are protected and monitored, and how they support the detection of and response to security events.',
    scope: 'Applies to all organisation systems and Microsoft 365 services that generate security-relevant logs, and to everyone responsible for reviewing them.',
    whyItMatters: 'Logging is what makes it possible to answer the questions that matter after an incident: what happened, how far it went, and — often most importantly — what was not affected. Without it, the honest answer to "was customer data accessed?" is "we cannot tell", and that answer is treated as a yes.\n\nLogs also protect individuals. Where activity is attributable, the record can establish that a particular person did not do something. Monitoring here is aimed at systems and security events, not at watching how people spend their day.',
    inPractice: [
      'You are asked to preserve evidence during an incident. Do not delete the message, file or log entry — remediation routinely destroys the only record of what happened.',
      'You notice an alert that looks like a false positive. Say so rather than silently ignoring it; tuning noise out is how the real alerts stay visible.',
      'You are setting up a new system. Ask what it logs and where those logs go before it goes live, because retrofitting logging after an incident is too late to help with that incident.'
    ],
    policyStatements: [
      {
        rule: 'Security-relevant events — authentication, privilege use, configuration change and data access — are logged across systems holding or processing organisational information.',
        because: 'These four categories are what an investigation actually reconstructs an incident from; anything not logged is unknowable afterwards.'
      },
      {
        rule: 'Logs are retained for a defined period appropriate to the system and any legal or contractual requirement, and protected against alteration and deletion.',
        because: 'Intrusions are frequently discovered months after the fact, and a log an attacker can edit proves nothing.'
      },
      {
        rule: 'Unified audit logging is enabled across the Microsoft 365 tenant and is not disabled without documented approval.',
        because: 'It is off or partial by default in some configurations, and its absence is only discovered at the point it is needed.'
      },
      {
        rule: 'Alerts are configured for defined high-risk events and are triaged within a defined timeframe, with the outcome recorded.',
        because: 'An alert nobody acts on is worse than no alert, because it creates a documented record that the organisation was told and did nothing.'
      },
      {
        rule: 'Administrator and privileged activity is logged and reviewed independently of the administrators themselves.',
        because: 'Self-review by the people with the most capability to cause or conceal harm is not a control.'
      },
      {
        rule: 'Monitoring is directed at systems and security events; it is not used for general surveillance of individuals, and any monitoring of personal data respects the applicable privacy obligations.',
        because: 'Monitoring that exceeds its stated purpose is both a privacy problem and the fastest way to lose the goodwill the reporting culture depends on.'
      }
    ],
    roles: [
      {
        role: 'IT / platform owner',
        responsibility: 'Configures logging and alerting, maintains retention, and ensures logs are protected from tampering.'
      },
      {
        role: 'ISMS manager',
        responsibility: 'Defines which events are alertable and the triage timeframe, and reviews privileged-activity logs independently.'
      },
      {
        role: 'System owners',
        responsibility: 'Confirm that systems in their area log the required events before those systems go live.'
      }
    ],
    exceptions: 'Where a system cannot produce the required logs, the gap is documented with compensating controls and recorded on the risk register. Disabling unified audit logging, even temporarily, requires the ISMS manager\'s written approval with a defined end date.',
    nonCompliance: 'Disabling logging, altering log data, or failing to triage alerts within the agreed timeframe is addressed with the system owner and escalated where it persists.',
    relatedDocuments: [
      'Incident Response Plan',
      'Access Control Policy',
      'Information Security Policy',
      'Cryptography Policy'
    ],
    reviewCadence: 'Annually, or when the organisation’s logging tooling, retention obligations or monitored event set changes materially.',
    controls: ['A.8.15', 'A.8.16', 'A.8.17'],
    frameworks: ['iso27001', 'iso27701', 'soc2', 'nistcsf']
  },
  {
    id: 'vulnerability-patch-policy',
    title: 'Vulnerability & Patch Management Policy',
    purpose: 'This policy sets out how the organisation finds, prioritises and fixes technical vulnerabilities, and keeps its systems on a secure, supported and consistently configured baseline.',
    scope: 'Applies to all organisation-managed devices, Microsoft 365 services, applications and infrastructure the organisation is responsible for maintaining.',
    whyItMatters: 'Almost every intrusion that does not start with a person starts with an unpatched system. Patching is unglamorous, endlessly deferrable, and the highest-value routine work the organisation does.\n\nFor most people this means one thing: let updates install. The prompt you keep dismissing is usually the fix for something already being exploited elsewhere, and the window between a patch being published and being attacked is now measured in days.',
    inPractice: [
      'Your device asks to restart for updates and you keep deferring it. Restart it — the patch is not applied until you do, so a downloaded update sitting unapplied protects nothing.',
      'You are running software the organisation no longer supports because it is the only thing that does a job. Say so; an unsupported application receiving no security fixes is a risk that needs recording, not hiding.',
      'A supplier tells you a vulnerability affects a product you use. Pass it on rather than assuming IT already knows.'
    ],
    policyStatements: [
      {
        rule: 'Operating systems, applications and firmware are kept on supported versions and patched on a defined schedule.',
        because: 'An unsupported version receives no security fixes at all, so its known vulnerabilities are permanent.'
      },
      {
        rule: 'Vulnerabilities are remediated within timeframes set by severity, with critical vulnerabilities in internet-facing systems treated as urgent.',
        because: 'Exploitation of a published critical vulnerability typically begins within days, and internet-facing systems are found by automated scanning almost immediately.'
      },
      {
        rule: 'The estate is scanned or assessed for known vulnerabilities on a recurring basis, with results tracked to closure.',
        because: 'A finding that is identified but not tracked is indistinguishable from one that was never found, except that the organisation is now on record as having known.'
      },
      {
        rule: 'Patches are applied through managed deployment rather than left to individual users where the platform allows it.',
        because: 'Voluntary patching produces a long tail of unpatched devices, and one is enough.'
      },
      {
        rule: 'Emergency patches for actively exploited vulnerabilities may bypass the normal change window, with the change recorded retrospectively.',
        because: 'The normal change process is designed for planned risk, and applying it unchanged to active exploitation costs more than it protects.'
      },
      {
        rule: 'Systems that cannot be patched are isolated, compensated for, and scheduled for replacement.',
        because: 'An unpatchable system does not stop being exploitable because patching it is inconvenient.'
      }
    ],
    roles: [
      {
        role: 'IT / platform owner',
        responsibility: 'Runs patch deployment and vulnerability scanning, and reports remediation against the agreed timeframes.'
      },
      {
        role: 'System owners',
        responsibility: 'Own remediation for their systems, including approving emergency patching and planning replacement of unpatchable systems.'
      },
      {
        role: 'All personnel',
        responsibility: 'Allow updates to install and restart devices when prompted; report software that is no longer supported.'
      }
    ],
    exceptions: 'Deferring a patch beyond its severity timeframe requires documented approval from the system owner with a compensating control and a remediation date, recorded on the risk register. Unsupported software remaining in use requires the same, plus a replacement plan.',
    nonCompliance: 'Persistently deferring updates or disabling managed patching is addressed with the individual and their manager. Systems repeatedly outside remediation timeframes are escalated to the executive sponsor as a risk decision rather than a technical one.',
    relatedDocuments: [
      'Malware & Endpoint Protection Policy',
      'Change Management Policy',
      'Asset Management Policy',
      'Secure Development Policy'
    ],
    reviewCadence: 'Annually, or when the organisation’s patching tooling, device management approach or risk tolerance changes.',
    controls: ['A.8.8', 'A.8.9'],
    frameworks: ['iso27001', 'iso27701', 'soc2', 'essential8', 'nistcsf']
  },
  {
    id: 'malware-protection-policy',
    title: 'Malware & Endpoint Protection Policy',
    purpose: 'This policy sets out how the organisation protects its devices, accounts and Microsoft 365 services against malware, phishing and other malicious activity.',
    scope: 'Applies to every organisation-managed device and Microsoft 365 account, and to the email and collaboration services the organisation operates.',
    whyItMatters: 'Endpoint protection is the control that catches what gets past everything else, and it works best when it is left alone. Most of what it asks of you is passive — do not disable it, do not install unapproved software, do not run things from untrusted sources.\n\nThe one active part is telling someone when it fires. An alert on your device is information about an attempt that may also be reaching other people, and it is far more useful the same hour than in a monthly report.',
    inPractice: [
      'A security warning appears and you are fairly sure it is a false positive. Report it anyway — determining that is quick, and being wrong is expensive.',
      'You need a utility to do something quickly and find one online. Do not run it; unapproved downloads are one of the most reliable ways an endpoint gets compromised.',
      'A document asks you to enable macros or enable editing to see the content. That prompt is the attack, not an obstacle to the content.'
    ],
    policyStatements: [
      {
        rule: 'Endpoint protection is deployed on all organisational devices, kept current, and configured so that users cannot disable it.',
        because: 'Protection a user can turn off is protection that will be turned off during exactly the task that most needed it.'
      },
      {
        rule: 'Application control is used where the platform supports it, so that only approved software executes.',
        because: 'Preventing unapproved code from running stops entire classes of attack that detection-based controls only catch after execution.'
      },
      {
        rule: 'Office macros from the internet are blocked, with exceptions granted only where there is a genuine business need and the source is trusted.',
        because: 'Macro-enabled documents remain one of the most durable initial-access techniques precisely because the prompt looks routine.'
      },
      {
        rule: 'Malware detections are logged, triaged and investigated rather than only cleaned.',
        because: 'A detection is evidence of an attempt that reached the endpoint, which says something about the controls in front of it.'
      },
      {
        rule: 'Web and email filtering is applied to reduce exposure to known-malicious content before it reaches the user.',
        because: 'Removing the message is more reliable than expecting every recipient to make the right judgement every time.'
      },
      {
        rule: 'Removable media use is restricted and, where permitted, scanned.',
        because: 'Removable media bypasses network-level controls entirely by design.'
      }
    ],
    roles: [
      {
        role: 'IT / platform owner',
        responsibility: 'Deploys and maintains endpoint protection, application control and filtering, and triages detections.'
      },
      {
        role: 'All personnel',
        responsibility: 'Leave protection enabled, install only approved software, and report alerts and suspicious content promptly.'
      },
      {
        role: 'ISMS manager',
        responsibility: 'Reviews detection trends for patterns indicating a broader campaign or a control gap.'
      }
    ],
    exceptions: 'A business need for macros, removable media or specific software is requested through the ISMS manager, granted narrowly to the users and sources that need it, time-limited, and reviewed at expiry.',
    nonCompliance: 'Disabling endpoint protection or circumventing application control is treated seriously, because it removes the control that catches what everything else missed.',
    relatedDocuments: [
      'Acceptable Use Policy',
      'Vulnerability & Patch Management Policy',
      'Incident Response Plan',
      'Asset Management Policy'
    ],
    reviewCadence: 'Annually, or when the organisation’s endpoint or email security tooling changes materially.',
    controls: ['A.8.7'],
    frameworks: ['iso27001', 'iso27701', 'soc2', 'essential8', 'nistcsf']
  },
  {
    id: 'hr-security-policy',
    title: 'Human Resources Security Policy',
    purpose: 'This policy sets out the information security responsibilities that apply across the employment life cycle — before, during and after employment — so that security is a condition of holding access, not an afterthought.',
    scope: 'Applies to all employees and contractors of the organisation, from pre-employment screening through to the return of access and assets on departure.',
    whyItMatters: 'Most of this policy applies at three moments: when you join, when your role changes, and when you leave. It exists because those transitions are where access, equipment and obligations quietly fall out of step with reality.\n\nThe part that persists is confidentiality, and it outlasts employment. The part worth knowing is that the disciplinary process referenced here is aimed at deliberate or repeated disregard, not at honest mistakes — the organisation would far rather hear about an error than discover it.',
    inPractice: [
      'You change roles and your old access is still working. Flag it. Retaining it "just in case" is the accumulation that access reviews exist to catch.',
      'A colleague is leaving. Their access should end on their last working day, not whenever someone gets to it — if you manage them, that is yours to initiate.',
      'You are asked for organisational information after leaving, or by someone who has left. Confidentiality obligations continue; route it through a current contact rather than answering directly.'
    ],
    policyStatements: [
      {
        rule: 'Background verification proportionate to the role is completed before access to organisational information is granted.',
        because: 'Checks completed after access has been granted cannot influence the decision they exist to inform.'
      },
      {
        rule: 'Employment terms and contractor agreements set out information security responsibilities and confidentiality obligations that survive termination.',
        because: 'Without a contractual basis there is no enforceable obligation, and the risk from a departing individual persists well beyond their last day.'
      },
      {
        rule: 'Security awareness training is completed at induction, before or immediately on being granted access, and refreshed at least annually.',
        because: 'The riskiest period is the first weeks, when someone has access, does not yet know the norms, and is inclined to say yes to requests.'
      },
      {
        rule: 'A defined process governs role change and termination: access is amended or revoked, assets returned, and obligations reconfirmed.',
        because: 'Leavers and movers are the most common source of orphaned access, and orphaned access is unattributable by definition.'
      },
      {
        rule: 'On termination, access is revoked no later than the end of the individual\'s last working day, and immediately where the departure is involuntary.',
        because: 'The window between departure and revocation is the period of highest motive and unchanged capability.'
      },
      {
        rule: 'A disciplinary process applies to deliberate or repeated breaches of information security policy, applied proportionately and consistently.',
        because: 'A policy with no consequence for deliberate disregard is advisory, and inconsistent application is worse than none.'
      }
    ],
    roles: [
      {
        role: 'HR',
        responsibility: 'Runs pre-employment verification, ensures agreements carry the security and confidentiality terms, and notifies IT of joiners, movers and leavers in time to act.'
      },
      {
        role: 'Line managers',
        responsibility: 'Initiate access changes on role change and departure, confirm asset return, and ensure induction training is completed.'
      },
      {
        role: 'ISMS manager',
        responsibility: 'Owns the awareness training programme and evidence of completion.'
      },
      {
        role: 'All personnel',
        responsibility: 'Complete assigned training, return assets, and observe confidentiality obligations during and after employment.'
      }
    ],
    exceptions: 'Granting access before verification completes requires the ISMS manager\'s approval, is limited to what the role minimally requires, and carries a deadline for completing the check. Extending access beyond a departure date requires documented approval and an end date.',
    nonCompliance: 'Deliberate or repeated breaches are handled through the disciplinary process, proportionate to the circumstances and harm. Honest mistakes reported promptly are not treated as disciplinary matters.',
    relatedDocuments: [
      'Access Control Policy',
      'Acceptable Use Policy',
      'Asset Management Policy',
      'Information Security Policy'
    ],
    reviewCadence: 'Annually, or when the organisation’s employment, onboarding or offboarding processes change materially.',
    /* A.6.3 added — this document's own policyStatements commit to
       "Security awareness training... completed at induction... and
       refreshed at least annually", which is A.6.3 verbatim. */
    controls: ['A.6.1', 'A.6.2', 'A.6.3', 'A.6.4', 'A.6.5', 'A.6.6'],
    frameworks: ['iso27001', 'iso27701', 'soc2', 'dispirap']
  },
  {
    id: 'asset-management-policy',
    title: 'Asset Management Policy',
    purpose: 'This policy sets out how the organisation identifies, owns and looks after the devices, software, cloud services and information it depends on, so that nothing important is unaccounted for or unprotected.',
    scope: 'Applies to all organisation hardware, software, cloud and SaaS services, and information assets, wherever they are held.',
    whyItMatters: 'You cannot protect what nobody has written down. The asset inventory is the unglamorous foundation the rest of the programme sits on — patching, access reviews, incident scoping and breach assessment all begin by asking what exists and who owns it.\n\nFor you it is mostly about the equipment you hold and the data you create. Tell someone when you receive or return a device, and do not create long-lived copies of information in places nobody is tracking.',
    inPractice: [
      'You are issued a laptop or phone. Confirm it is recorded against you — the inventory is how it gets wiped remotely if it is later lost.',
      'You export a report to a spreadsheet for a one-off piece of analysis. That copy is now an information asset nobody is tracking; delete it when you are done rather than leaving it in your own storage.',
      'You are leaving or changing role. Return equipment through the process rather than passing it directly to a colleague, so the record follows the device.'
    ],
    policyStatements: [
      {
        rule: 'An inventory of information assets and the hardware, systems and services processing them is maintained and kept current.',
        because: 'Every downstream control depends on knowing what exists; an asset missing from the inventory is unpatched, unreviewed and unscoped in an incident.'
      },
      {
        rule: 'Every asset has a named owner accountable for its classification, protection and lifecycle.',
        because: 'Unowned assets are the ones that go unpatched and unreviewed, because responsibility for them is genuinely nobody\'s.'
      },
      {
        rule: 'Assets are classified in line with the classification scheme, and handled according to that classification.',
        because: 'Protection has to be proportionate to what the asset holds, and that requires knowing what it holds.'
      },
      {
        rule: 'Assets issued to individuals are recorded against them, and returned on termination or role change.',
        because: 'An unreturned device holds organisational data indefinitely, outside every control, and its absence is only noticed when it matters.'
      },
      {
        rule: 'Assets are securely wiped or destroyed at end of life, using a method appropriate to the classification of the data they held.',
        because: 'Decommissioned equipment is among the easiest routes to organisational data, and reformatting is not erasure.'
      },
      {
        rule: 'Cloud services and data stores are inventoried alongside physical assets.',
        because: 'Most organisational data now sits in services rather than on devices, and an inventory covering only hardware describes a minority of the estate.'
      }
    ],
    roles: [
      {
        role: 'Asset owners',
        responsibility: 'Accountable for classification, protection and lifecycle of the assets in their area, including cloud services.'
      },
      {
        role: 'IT',
        responsibility: 'Maintains the inventory, issues and recovers equipment, and performs secure wipe or destruction at end of life.'
      },
      {
        role: 'All personnel',
        responsibility: 'Look after issued assets, report loss immediately, return them when required, and avoid creating untracked copies of organisational data.'
      }
    ],
    exceptions: 'Personally-owned devices used for work are permitted only where the organisation\'s mobile management and separation requirements are met, and are recorded in the inventory as such. Any other exception requires the ISMS manager\'s approval.',
    nonCompliance: 'Failure to return assets, or repeated failure to maintain inventory accuracy for owned assets, is addressed with the individual and their manager.',
    relatedDocuments: [
      'Data Classification & Handling Policy',
      'Acceptable Use Policy',
      'Human Resources Security Policy',
      'Cryptography Policy'
    ],
    reviewCadence: 'Annually, or when the organisation’s device management or asset tracking approach changes materially.',
    controls: ['A.5.9', 'A.5.11'],
    frameworks: ['iso27001', 'iso27701', 'soc2', 'nistcsf']
  },
  {
    id: 'change-management-policy',
    title: 'Change Management Policy',
    purpose: 'This policy sets out how the organisation controls changes to its systems and Microsoft 365 configuration, so that changes deliver what they intend without quietly undermining security.',
    scope: 'Applies to changes to production systems, Microsoft 365 tenant and security configuration, applications and infrastructure the organisation is responsible for.',
    whyItMatters: 'Change control has a bad reputation because it is often implemented as a queue. The point is narrower than that: know what changed, be able to undo it, and do not let one person make an unreviewed change to something everyone depends on.\n\nThat pays back mostly during incidents. The first useful question when something breaks is almost always "what changed?", and an accurate answer turns hours of investigation into minutes.',
    inPractice: [
      'You make a small configuration change to fix something urgently. Record it afterwards even though it worked — the record is what makes the next outage diagnosable.',
      'You are reviewing someone\'s change. Ask how it gets rolled back. A change with no rollback is a change that commits the organisation to living with whatever it does.',
      'A change looks routine but touches authentication, permissions or anything internet-facing. Treat it as significant regardless of how small the diff is.'
    ],
    policyStatements: [
      {
        rule: 'Changes to production systems are requested, assessed for risk and impact, and approved before implementation.',
        because: 'Unassessed change is the most common cause of self-inflicted outage, and the assessment is where the security implications surface.'
      },
      {
        rule: 'Every change is recorded with what changed, who made it, when, and how to reverse it.',
        because: 'The first question in any incident is what changed, and reconstructing that after the fact is slow and unreliable.'
      },
      {
        rule: 'Significant changes are tested before deployment, and security implications are considered as part of the assessment.',
        because: 'Security consequences of a change are rarely obvious from the change itself, particularly for permissions and network configuration.'
      },
      {
        rule: 'Emergency changes may be implemented ahead of approval where needed to restore service or contain an incident, and are recorded and reviewed retrospectively without exception.',
        because: 'A process that cannot accommodate emergencies is bypassed during them, and then bypassed generally.'
      },
      {
        rule: 'Segregation is maintained between the person requesting a change and the person approving it, wherever the size of the organisation allows.',
        because: 'Self-approval removes the only independent check on both intent and error.'
      },
      {
        rule: 'Changes are reviewed after implementation for unintended effects, particularly on access and data flows.',
        because: 'Permission and data-flow side effects rarely announce themselves and are typically found much later, by someone else.'
      }
    ],
    roles: [
      {
        role: 'Change requester',
        responsibility: 'Describes the change, its risk and its rollback, and implements only after approval except in a genuine emergency.'
      },
      {
        role: 'Change approver',
        responsibility: 'Assesses risk and security impact, and is a different person from the requester wherever practicable.'
      },
      {
        role: 'System owners',
        responsibility: 'Own the change record for their systems and the post-implementation review.'
      }
    ],
    exceptions: 'Emergency changes are the standing exception and are governed by the statement above: implement, then record and review. Any standing exemption for a class of routine low-risk change requires the ISMS manager\'s approval and a defined boundary for what qualifies.',
    nonCompliance: 'Making unrecorded production changes, or approving one\'s own change where segregation was practicable, is addressed with the individual and their lead.',
    relatedDocuments: [
      'Secure Development Policy',
      'Vulnerability & Patch Management Policy',
      'Logging & Monitoring Policy',
      'Business Continuity & Disaster Recovery Plan'
    ],
    reviewCadence: 'Annually, or when the organisation’s change or release process changes materially.',
    controls: ['A.8.32'],
    frameworks: ['iso27001', 'iso27701', 'soc2', 'iso42001']
  },
  {
    id: 'physical-security-policy',
    title: 'Physical & Environmental Security Policy',
    purpose: 'This policy sets out how the organisation protects its premises, equipment and information from physical threats — theft, damage, unauthorised access and environmental hazards — including in remote and home-working settings.',
    scope: 'Applies to the organisation’s offices and equipment, and to any location, including home offices, where company equipment or information is used.',
    whyItMatters: 'Physical security tends to feel disproportionate in a small or largely remote organisation, and the honest position is that it should be proportionate — the controls here scale to the risk rather than assuming a data centre.\n\nWhat is not optional is the human part, and it is genuinely awkward: challenging someone you do not recognise, or declining to hold a door. Tailgating works because it exploits politeness, and an organisation where nobody will ask has no physical control at all regardless of what it has installed.',
    inPractice: [
      'Someone follows you through a secured door without badging. Ask who they are visiting and direct them to reception. It is uncomfortable once and routine after that.',
      'You are working in a cafe or on a train. Assume the screen is readable by the person behind you, and take calls about sensitive matters where they cannot be overheard.',
      'You print something sensitive. Collect it immediately — an unattended printer tray is an unsupervised copy of whatever was on it.'
    ],
    policyStatements: [
      {
        rule: 'Areas holding sensitive information or equipment are secured, with access restricted to those who need it.',
        because: 'Physical access usually defeats logical controls entirely, given time alone with a device.'
      },
      {
        rule: 'Visitors to secured areas are identified, recorded and accompanied.',
        because: 'An unaccompanied visitor is indistinguishable from an intruder, and the record is what makes an incident reconstructable.'
      },
      {
        rule: 'Personnel challenge or report unrecognised individuals in secured areas, and do not allow others to follow them through access-controlled doors.',
        because: 'Tailgating relies on social pressure, so the control only exists if challenging is expected and supported.'
      },
      {
        rule: 'A clear desk and clear screen standard applies to sensitive information, including in home and shared workspaces.',
        because: 'Home and shared workspaces have the same exposure and none of the physical controls of an office.'
      },
      {
        rule: 'Equipment is protected against environmental risk appropriate to its criticality, including power, temperature and water.',
        because: 'Environmental failure causes at least as much unplanned downtime as attack, and is more predictable.'
      },
      {
        rule: 'Devices are not left unattended in public places or vehicles, and are reported immediately if lost or stolen.',
        because: 'Opportunistic theft is the most common way an organisational device is lost, and remote wipe depends on prompt reporting.'
      }
    ],
    roles: [
      {
        role: 'Facilities / office manager',
        responsibility: 'Maintains physical access controls, the visitor process and environmental protections at each location.'
      },
      {
        role: 'Line managers',
        responsibility: 'Ensure their teams understand the clear desk and screen standard, including for remote working.'
      },
      {
        role: 'All personnel',
        responsibility: 'Challenge or report unrecognised individuals, secure their workspace, and report lost or stolen equipment immediately.'
      }
    ],
    exceptions: 'Where a location cannot support a control — a shared or serviced office, for example — the ISMS manager records the limitation with compensating controls such as device encryption, screen privacy or restrictions on what may be handled there.',
    nonCompliance: 'Propping secured doors, allowing tailgating, or repeatedly leaving sensitive material unattended is addressed with the individual and their manager.',
    relatedDocuments: [
      'Asset Management Policy',
      'Acceptable Use Policy',
      'Data Classification & Handling Policy',
      'Business Continuity & Disaster Recovery Plan'
    ],
    reviewCadence: 'Annually, or after any change to the organisation’s premises, or a physical security incident.',
    /* A.7.5 added — "Equipment is protected against environmental risk
       appropriate to its criticality, including power, temperature and
       water" is A.7.5's own definition (protecting against physical and
       environmental threats), not just a paraphrase of A.7.1/A.7.2/A.7.7. */
    controls: ['A.7.1', 'A.7.2', 'A.7.4', 'A.7.5', 'A.7.7'],
    frameworks: ['iso27001', 'iso27701', 'dispirap']
  },
  {
    id: 'isms-scope',
    title: 'ISMS Scope Document',
    purpose: 'This document defines the scope and boundaries of the organisation’s information security management system (ISMS) — the parts of the business, the locations, the information and the technology it covers, and anything deliberately excluded. It satisfies the ISO/IEC 27001 Clause 4.3 requirement to determine and document the scope of the ISMS.',
    scope: 'This document describes the ISMS itself: what it does and does not cover — the business units, locations and services in scope, and anything deliberately excluded.',
    policyStatements: [
      {
        rule: 'The ISMS covers the organisation’s information and the systems that process it, centred on its Microsoft 365 tenant. In scope are the following business units and teams: {{businessUnits}}.',
        because: 'A scope stated only in general terms cannot be audited, and cannot tell anyone whether a given system is inside it.'
      },
      {
        rule: 'The ISMS covers work carried out at {{locations}}, in support of {{services}}.',
        because: 'Scope is bounded by where work happens and what the organisation delivers, not by which systems happen to be easiest to assess.'
      },
      {
        rule: 'The needs and requirements of interested parties — {{interestedParties}} — have been identified (Clauses 4.1 and 4.2) and inform the boundaries set here.',
        because: 'A scope drawn without reference to who depends on the organisation tends to exclude precisely what they care about.'
      },
      {
        rule: 'The obligations the organisation must satisfy within this scope include: {{regulatory}}.',
        because: 'Clause 4.2 asks not just who the interested parties are but what they require — an obligation nobody has written down is one nobody is demonstrably meeting.'
      },
      {
        rule: 'The scope includes the organisation’s people, its processes, and the technology it controls; reliance on Microsoft 365 and other third-party services is in scope for oversight and managed through the Supplier Security Policy, even though those providers’ internal operations are not the organisation’s to run.',
        because: 'Accountability for outsourced processing stays with the organisation, so excluding suppliers from scope excludes most of the actual risk.'
      },
      {
        rule: 'Excluded from the scope: {{exclusions}}. Any exclusion is stated explicitly with a justification, and no exclusion leaves a real information risk unmanaged.',
        because: 'An unstated exclusion is indistinguishable from an oversight, and an unjustified one is a finding.'
      },
      {
        rule: 'This scope is documented, approved by management, and maintained as controlled documented information available to those who need it.',
        because: 'Clause 4.3 requires the scope to be available as documented information; an approved scope nobody can find does not satisfy it.'
      },
      {
        rule: 'The scope is reviewed at least annually and whenever the organisation’s structure, locations, services, technology estate or risk profile changes materially.',
        because: 'Organisations change faster than their documentation, and a scope describing last year\'s business quietly excludes this year\'s systems.'
      }
    ],
    roles: [
      {
        role: 'Executive sponsor',
        responsibility: 'Approves the scope and any change to it, and confirms the resources needed to operate the management system within it.'
      },
      {
        role: 'ISMS manager',
        responsibility: 'Maintains this document, reviews the scope at least annually and after any material business change, and ensures interfaces and dependencies stay accurate.'
      },
      {
        role: 'System and process owners',
        responsibility: 'Notify the ISMS manager when a system, location, service or supplier relationship inside the scope changes materially.'
      }
    ],
    exceptions: 'Exclusions from scope are stated explicitly in this document with their justification, rather than left implicit. An exclusion that cannot be justified on a defensible basis is not an exclusion; it is a gap, and it belongs on the risk register instead.',
    nonCompliance: 'Operating a system or process that should be within scope outside the management system is a management-system nonconformity, raised as a corrective action under Clause 10.1.',
    relatedDocuments: [
      'Information Security Policy',
      'Risk Management Framework',
      'Statement of Applicability',
      'Information Security Objectives & Metrics'
    ],
    reviewCadence: 'Annually, or on any material change to the organisation’s structure, locations, services or risk profile.',
    controls: [],
    frameworks: ['iso27001', 'iso27701']
  },
  {
    id: 'risk-management-framework',
    title: 'Risk Management Framework',
    purpose: 'This document defines how the organisation identifies, analyses, evaluates and treats information security risk consistently and repeatably, so that two people assessing the same risk reach comparable results. It satisfies the ISO/IEC 27001 Clause 6.1.2 (risk assessment) and Clause 6.1.3 (risk treatment) requirements.',
    scope: 'Applies to all information security risks to assets within the ISMS scope, and to everyone who identifies, owns or treats those risks. The organisation’s live risk register and Risk Treatment Plan are maintained in this console.',
    policyStatements: [
      {
        rule: 'Risks are identified in terms of their effect on the confidentiality, integrity and availability of information assets within scope, and recorded in the risk register maintained in this console.',
        because: 'Naming the effect rather than the threat keeps the register focused on consequences the organisation can actually treat.'
      },
      {
        rule: 'Each risk is analysed for likelihood and impact using defined, consistent scales (for example 1–5 for each), and the two combine into an overall risk level — so risks are prioritised on evidence, not instinct.',
        because: 'Without consistent scales, two assessors rate the same risk differently and the register cannot be used to prioritise anything.'
      },
      {
        rule: 'Risks are evaluated against documented risk acceptance criteria: a defined threshold above which a risk must be treated rather than simply accepted.',
        because: 'Without a stated threshold, acceptance is decided case by case under pressure, which is how significant risks get accepted quietly.'
      },
      {
        rule: 'Every risk has a named risk owner, accountable for the treatment decision and for the residual risk that remains after it.',
        because: 'A risk owned by a committee or a department is owned by nobody, and will still be open at the next review.'
      },
      {
        rule: 'Risks above the acceptance threshold are treated by one of the four recognised options — Treat (reduce it with controls), Terminate (stop or change the activity), Transfer (shift it to a third party, for example through insurance or an outsourced provider), or, only with documented management sign-off, Tolerate (accept the residual risk).',
        because: 'Naming the four options prevents "we are monitoring it" being recorded as though it were a treatment.'
      },
      {
        rule: 'Treatment decisions and the controls selected are recorded in the Risk Treatment Plan, and reconciled against ISO 27001 Annex A in the Statement of Applicability, with any excluded Annex A control justified.',
        because: 'The SoA is the document an auditor reconciles everything else against, and an unjustified exclusion is the fastest finding available to them.'
      },
      {
        rule: 'Residual risk is reviewed at least quarterly and after any material change, and the framework itself is revisited if the organisation’s risk appetite or method changes.',
        because: 'Residual risk moves as controls degrade and the business changes, so a residual rating is only true on the day it was set.'
      }
    ],
    roles: [
      {
        role: 'Executive sponsor',
        responsibility: 'Sets and approves the risk appetite, and formally accepts residual risks that exceed it.'
      },
      {
        role: 'ISMS manager',
        responsibility: 'Owns this framework and the risk register, facilitates assessment, and reports risk status to management review.'
      },
      {
        role: 'Risk owners',
        responsibility: 'Named for each risk; accountable for its assessment remaining current and for delivering its treatment.'
      },
      {
        role: 'All personnel',
        responsibility: 'Raise risks they become aware of, rather than assuming they are already known.'
      }
    ],
    exceptions: 'Accepting a residual risk above appetite is not an exception to this framework — it is a decision the framework provides for, and it requires the executive sponsor\'s recorded acceptance with a named accepter, a date and a review point. Risks are never closed by lapse of time.',
    nonCompliance: 'Operating a system or process with a known unassessed risk, or treating a risk without recording the decision, is a management-system nonconformity raised as a corrective action.',
    relatedDocuments: [
      'Information Security Policy',
      'Statement of Applicability',
      'ISMS Scope Document',
      'Information Security Objectives & Metrics'
    ],
    reviewCadence: 'Annually, or when the organisation’s risk appetite, scales or assessment method change materially.',
    controls: [],
    frameworks: ['iso27001', 'iso27701']
  },
  {
    id: 'infosec-objectives-metrics',
    title: 'Information Security Objectives & Metrics',
    purpose: 'This document sets the measurable information security objectives the organisation is working towards, and the metrics it uses to monitor, measure and evaluate how well the ISMS is performing. It satisfies the ISO/IEC 27001 Clause 6.2 (objectives) and Clause 9.1 (monitoring, measurement, analysis and evaluation) requirements.',
    scope: 'Applies to the information security management system and the objectives set for it. Many of the metrics below are computed live by this console; the specific objectives and targets must be set by the organisation.',
    policyStatements: [
      {
        rule: 'Information security objectives are set that are measurable, consistent with the information security policy, and aligned to the organisation’s highest-priority risks.',
        because: 'An objective that is not measurable cannot be shown to have been met, which is what Clause 6.2 actually asks for.'
      },
      {
        rule: 'Each objective records what will be achieved, what resource it needs, who is responsible, when it is due, and how the result will be evaluated.',
        because: 'These five are exactly what Clause 6.2 enumerates, and an objective missing the resource or the owner is an aspiration.'
      },
      {
        rule: 'Performance is measured using defined metrics — for example: percentage of accounts with multi-factor authentication enabled; mean time to remediate critical vulnerabilities; overdue high-risk remediation actions; phishing-simulation failure rate; percentage of staff completing security training on time; and the number of corrective actions open past their due date.',
        because: 'Metrics chosen after the results are known are chosen to flatter; defining them in advance is what makes them evidence.'
      },
      {
        rule: 'Metrics are produced on a defined cadence — this console computes many of them live, including the posture score, framework readiness percentage, drift alerts and overdue actions — and are reviewed by the person accountable for the ISMS.',
        because: 'A metric produced but never read tells nobody anything, and Clause 9.1 asks for evaluation rather than collection.'
      },
      {
        rule: 'Results are compared against the objectives and their thresholds; where a metric shows the ISMS underperforming, a corrective action is raised and tracked to closure.',
        because: 'Measurement without a consequence is reporting, not management, and an unmet threshold with no action is a documented decision to do nothing.'
      },
      {
        rule: 'Objectives and metrics are a standing input to the management review, and are revised when an objective is met, ceases to be relevant, or the organisation’s risk profile changes.',
        because: 'Objectives that outlive their relevance crowd out the ones that matter and make the whole set easy to ignore.'
      }
    ],
    roles: [
      {
        role: 'Executive sponsor',
        responsibility: 'Approves the objectives and the resources to pursue them, and reviews performance against them at management review.'
      },
      {
        role: 'ISMS manager',
        responsibility: 'Maintains this document, collects the measurements, and reports trends rather than single points.'
      },
      {
        role: 'Objective owners',
        responsibility: 'Named for each objective; accountable for the plan to achieve it and for the accuracy of its measurement.'
      }
    ],
    exceptions: 'An objective that turns out to be unachievable or no longer relevant is formally revised or retired at management review, with the reason recorded. It is not quietly dropped, and it is not left standing as an unmet target nobody intends to pursue.',
    nonCompliance: 'Reporting a measurement known to be inaccurate, or an objective going unmeasured for a full review cycle, is a management-system nonconformity raised as a corrective action.',
    relatedDocuments: [
      'Information Security Policy',
      'Risk Management Framework',
      'ISMS Scope Document'
    ],
    reviewCadence: 'At least annually, and at each management review, or when an objective is met or superseded.',
    controls: [],
    frameworks: ['iso27001', 'iso27701']
  },
  {
    id: 'ai-policy',
    title: 'AI Policy',
    purpose: 'This policy sets out the organisation’s commitment to developing, procuring and using artificial intelligence responsibly, and establishes the objectives, roles and controls used to govern AI across its life cycle. It is the top-level policy of the organisation’s AI management system (AIMS), consistent with ISO/IEC 42001. It is distinct from the AI Acceptable Use Policy, which governs how employees use AI tools day to day.',
    scope: 'Applies to every AI system the organisation develops, deploys, procures or operates, and to everyone involved in governing, building or using those systems.',
    whyItMatters: 'This policy commits the organisation to using AI in ways it could defend publicly, which is a higher bar than using it legally. The practical consequence for you is that AI decisions affecting people are expected to be explainable and challengeable, and that you are entitled to ask how a system reached a conclusion before acting on it.\n\nThe part worth remembering is the reporting channel. If an AI system behaves in a way that looks unfair, unsafe or simply wrong, raising it is expected and protected. Those reports are the main way problems in AI systems are found at all — the systems do not report themselves, and the people affected by them are usually not in the room.',
    inPractice: [
      'An AI system produces an output that looks wrong or unfair for a particular person or group. Raise it, even as a single example — a pattern is only ever visible once someone reports the first instance.',
      'You are asked to adopt an AI system that will influence decisions about people. Ask whether an impact assessment has been done before it goes live, not after.',
      'You are unsure whether something counts as an AI system. Raise it anyway; the register is easier to trim than to reconstruct.'
    ],
    policyStatements: [
      {
        rule: 'The organisation is committed to developing and using AI in a way that is lawful, ethical, transparent and accountable, and that respects the rights and safety of the individuals affected by it.',
        because: 'AI failures damage the people subject to a system rather than the organisation running it, so lawfulness alone is not a sufficient standard.'
      },
      {
        rule: 'AI governance is aligned with the organisation’s other policies — information security, privacy, data governance and risk — so AI is not managed in isolation from the rest of the business.',
        because: 'A separate AI governance track duplicates effort and produces two answers to the same question about the same data.'
      },
      {
        rule: 'Accountability for the AI management system sits with a named executive sponsor; roles and responsibilities for AI governance, development and oversight are defined and assigned.',
        because: 'Accountability for an AI outcome cannot be delegated to the system or its vendor, so it has to rest with a named person.'
      },
      {
        rule: 'Every AI system is assessed for its potential impact on individuals, groups and society before deployment, proportionate to its risk — see the AI System Impact Assessment Process.',
        because: 'Impact assessed after deployment describes harm that has already happened to real people.'
      },
      {
        rule: 'Concerns about an AI system — unexpected behaviour, potential harm, bias or misuse — can be raised through a defined reporting channel, and raising them is never penalised.',
        because: 'AI systems do not report their own failures, and the people best placed to notice are the ones using them daily.'
      },
      {
        rule: 'This policy is reviewed by management at least annually, and sooner in response to significant changes in the organisation’s AI use, the regulatory landscape, or AI technology itself.',
        because: 'Both the technology and the law around it are moving faster than an annual cycle assumes.'
      }
    ],
    roles: [
      {
        role: 'Executive sponsor',
        responsibility: 'Accountable for the AI management system, approves this policy and the AI risk appetite, and owns decisions on high-impact systems.'
      },
      {
        role: 'AI system owners',
        responsibility: 'Named for each system; accountable for its impact assessment, its documentation, its oversight arrangements and its ongoing monitoring.'
      },
      {
        role: 'ISMS / AIMS manager',
        responsibility: 'Maintains the AI system register and the risk register, and determines when an impact assessment is required.'
      },
      {
        role: 'All personnel',
        responsibility: 'Use AI within this policy, apply meaningful oversight to outputs they act on, and raise concerns through the defined channel.'
      }
    ],
    exceptions: 'Deploying an AI system before its impact assessment is complete requires the executive sponsor\'s written approval, is limited to a defined trial scope that excludes decisions affecting individuals, and carries a completion deadline. The exception is recorded on the AI risk register.',
    nonCompliance: 'Deploying or using an AI system outside this policy is addressed through the disciplinary process where deliberate. Raising a concern about an AI system, including one you introduced, is expressly protected.',
    relatedDocuments: [
      'AI Acceptable Use Policy',
      'AI System Impact Assessment Process',
      'AI Management System Scope',
      'AI Risk Management Framework'
    ],
    reviewCadence: 'Annually, or sooner following a material change to the organisation’s AI use, applicable AI regulation, or the technology itself.',
    controls: ['AI.2.2', 'AI.2.3', 'AI.2.4', 'AI.3.2', 'AI.3.3'],
    frameworks: ['iso42001']
  },
  {
    id: 'aims-scope',
    title: 'AI Management System Scope',
    purpose: 'This document defines the scope and boundaries of the organisation’s AI management system (AIMS) — which AI systems, activities, functions and locations it covers, and anything excluded. It satisfies the ISO/IEC 42001 Clause 4.3 requirement to determine and document the scope of the AIMS.',
    scope: 'This document describes the AIMS itself. It is a starting draft — the bracketed specifics must be completed with the organisation’s actual AI systems and activities before approval.',
    policyStatements: [
      {
        rule: 'The AIMS covers the AI systems the organisation develops, deploys, procures or operates — to be completed with the specific systems, use cases, teams and locations in scope.',
        because: 'A scope that does not name systems cannot answer whether a given tool is governed, which is the only question anyone asks of it.'
      },
      {
        rule: 'The organisation’s role for each AI system in scope — as a provider, a deployer/user, or both — is identified, because different obligations follow from each role.',
        because: 'Provider and deployer obligations differ substantially under both ISO 42001 and emerging AI regulation, and the wrong assumption misses whole duties.'
      },
      {
        rule: 'The needs and expectations of interested parties affected by the organisation’s AI — customers, individuals subject to AI-driven decisions, regulators and employees — have been considered in setting this scope.',
        because: 'The people most affected by an AI system are rarely the people who chose it, so their interests only enter the scope deliberately.'
      },
      {
        rule: 'Dependencies on third-party AI systems, models and providers are in scope for oversight and governed through supplier arrangements, even where the organisation does not build the model itself.',
        because: 'Most organisations consume AI rather than build it, so a scope covering only in-house development covers almost nothing.'
      },
      {
        rule: 'Any AI system or activity excluded from the scope is stated explicitly with a justification, and no exclusion leaves a material AI risk ungoverned.',
        because: 'An unstated exclusion cannot be reviewed, and shadow AI is exactly what accumulates in the space it leaves.'
      },
      {
        rule: 'The scope is documented, approved by management, and reviewed when the organisation’s AI use, systems or risk profile change materially.',
        because: 'AI adoption moves faster than any other technology change, so an annual-only review is behind almost immediately.'
      }
    ],
    roles: [
      {
        role: 'Executive sponsor',
        responsibility: 'Approves the AIMS scope and any change to it.'
      },
      {
        role: 'AIMS manager',
        responsibility: 'Maintains this document and the AI system register it depends on, and reviews scope as AI use changes.'
      },
      {
        role: 'AI system owners',
        responsibility: 'Notify the AIMS manager when a system in their area changes purpose, data or role.'
      }
    ],
    exceptions: 'Exclusions are stated in this document with justification rather than left implicit. An AI system excluded because it is low-impact is reassessed if its use changes — exclusion is a decision with a review date, not a permanent status.',
    nonCompliance: 'Operating an AI system that should be within scope outside the management system is a management-system nonconformity, raised as a corrective action.',
    relatedDocuments: [
      'AI Policy',
      'AI Risk Management Framework',
      'AI System Impact Assessment Process',
      'Supplier Security Policy'
    ],
    reviewCadence: 'Annually, or on any material change to the organisation’s AI systems, use cases or role (provider/deployer).',
    controls: [],
    frameworks: ['iso42001']
  },
  {
    id: 'ai-risk-framework',
    title: 'AI Risk Management Framework',
    purpose: 'This document defines how the organisation identifies, analyses, evaluates and treats risks arising from its AI systems — including risks to individuals, groups and society, not only to the organisation itself. It satisfies the ISO/IEC 42001 Clause 6.1.2 (risk assessment) and Clause 6.1.3 (risk treatment) requirements.',
    scope: 'Applies to all risks arising from AI systems within the AIMS scope, across their life cycle, and to everyone who identifies, owns or treats those risks.',
    policyStatements: [
      {
        rule: 'AI risks are identified across the AI life cycle and — unlike ordinary information security risk — expressly include potential harm to individuals, groups, society and the environment, not just to the organisation.',
        because: 'This is the defining difference between AI risk and security risk, and a framework that omits it simply reproduces the security register.'
      },
      {
        rule: 'Each risk is analysed for likelihood and severity of consequence using defined, consistent scales, so AI risks are prioritised on evidence rather than instinct.',
        because: 'AI risk discussion tends toward the speculative, and consistent scales are what keep it anchored to consequence.'
      },
      {
        rule: 'Risks are evaluated against documented risk acceptance criteria, with a defined threshold above which a risk must be treated before the AI system proceeds.',
        because: 'Without a threshold set in advance, the decision to proceed is made under delivery pressure by the people most invested in proceeding.'
      },
      {
        rule: 'Every AI risk has a named owner accountable for the treatment decision and for the residual risk that remains.',
        because: 'Accountability for an AI outcome cannot sit with the system, the vendor or the model.'
      },
      {
        rule: 'Risks above the threshold are treated by modifying the system or its controls, avoiding a use case, sharing the risk, or — only with documented management sign-off — accepting it; the AI System Impact Assessment feeds directly into this.',
        because: 'Declining a use case is a legitimate treatment for AI risk and is frequently the correct one, so it has to be named as an option.'
      },
      {
        rule: 'Residual AI risk is reviewed at least quarterly and after any material change to a system, its data, its use or its operating context.',
        because: 'Model behaviour drifts with changing inputs, so an AI risk assessment decays even when nobody changes the system.'
      }
    ],
    roles: [
      {
        role: 'Executive sponsor',
        responsibility: 'Sets the AI risk appetite and formally accepts residual AI risk above it.'
      },
      {
        role: 'AIMS manager',
        responsibility: 'Owns this framework and the AI risk register, and reports AI risk status to management review.'
      },
      {
        role: 'AI risk owners',
        responsibility: 'Named per risk; accountable for keeping the assessment current and delivering the treatment.'
      }
    ],
    exceptions: 'Proceeding with an AI system carrying untreated risk above the threshold requires the executive sponsor\'s recorded acceptance, naming the accepter, the date, the affected parties and a review point. Risk to individuals is never accepted implicitly by proceeding.',
    nonCompliance: 'Deploying an AI system with a known untreated risk above threshold, without recorded acceptance, is a management-system nonconformity raised as a corrective action.',
    relatedDocuments: [
      'AI Policy',
      'AI System Impact Assessment Process',
      'Risk Management Framework',
      'AI System Lifecycle Policy'
    ],
    reviewCadence: 'Annually, or when the organisation’s AI risk appetite, scales or method change materially.',
    controls: [],
    frameworks: ['iso42001']
  },
  {
    id: 'ai-impact-assessment',
    title: 'AI System Impact Assessment Process',
    purpose: 'This document defines how and when the organisation assesses the potential impacts of an AI system — on individuals, groups, society and the environment — before and during its use. The AI system impact assessment is a defining requirement of ISO/IEC 42001 and satisfies its Annex A controls for assessing AI system impacts.',
    scope: 'Applies to every AI system within the AIMS scope, proportionate to its potential for harm, across its life cycle.',
    whyItMatters: 'An impact assessment is where somebody asks, before deployment rather than after, what happens to a real person if the system gets it wrong. If you own or are adopting an AI system, this is the process that stands between a reasonable idea and an avoidable harm.\n\nIt is deliberately proportionate. A summarisation tool with no bearing on anyone\'s outcomes needs a short assessment; something influencing whether a person receives a service needs a real one. The question to hold throughout is not whether the system is accurate on average, but who is affected when it is not, and whether they would ever know.',
    inPractice: [
      'You are scoping an AI system. Start the assessment during design, not before launch — the mitigations it identifies are usually design changes, and by launch they are rework.',
      'The system will influence a decision about a person. Establish who reviews it, whether they can realistically reach a different conclusion, and how the person contests it. If you cannot answer all three, the assessment is not finished.',
      'A system already in use changes purpose or data source. That is a material change and triggers a reassessment, even though nothing about the model itself changed.'
    ],
    policyStatements: [
      {
        rule: 'An impact assessment is carried out for each AI system before it is deployed, and revisited when the system, its data, or its intended use changes materially.',
        because: 'An assessment after deployment documents harm rather than preventing it.'
      },
      {
        rule: 'The assessment considers the system’s intended purpose, the individuals and groups it affects, and the ways it could cause harm — including unfair bias, inaccurate or unsafe outputs, loss of privacy, and lack of transparency or recourse.',
        because: 'Naming the harm categories explicitly prevents an assessment quietly narrowing to the ones the team already thought about.'
      },
      {
        rule: 'Impacts on individuals and groups are assessed specifically, including whether the AI makes or materially influences decisions affecting people, and whether meaningful human oversight is in place.',
        because: 'Oversight that exists on paper but not in the workload is the single most common failure in AI governance.'
      },
      {
        rule: 'Broader societal and environmental impacts — including effects on vulnerable groups and the resource cost of the system — are considered proportionate to the system’s scale and use.',
        because: 'ISO 42001 requires consideration beyond the organisation\'s own interests, and average performance routinely conceals poor performance for specific groups.'
      },
      {
        rule: 'Each assessment is documented, records the mitigations put in place, and results in a clear decision to proceed, proceed with conditions, or not proceed.',
        because: 'An assessment with no decision recorded is a discussion, and "proceed with conditions" is the outcome that most often gets lost.'
      },
      {
        rule: 'Impact assessments feed the AI risk register and are an input to management review; higher-impact systems are reassessed on a defined cycle.',
        because: 'An assessment filed and never revisited describes the system as launched rather than as it now operates.'
      }
    ],
    roles: [
      {
        role: 'AI system owner',
        responsibility: 'Completes the assessment, implements the mitigations, and records the proceed decision.'
      },
      {
        role: 'AIMS manager',
        responsibility: 'Determines when an assessment is required and at what depth, and reviews completed assessments for higher-impact systems.'
      },
      {
        role: 'Privacy contact',
        responsibility: 'Coordinates with the DPIA process where personal information is involved, so the two assessments are one piece of work seen through two lenses.'
      },
      {
        role: 'Executive sponsor',
        responsibility: 'Decides on systems assessed as high-impact, including whether they proceed at all.'
      }
    ],
    exceptions: 'A limited trial may proceed ahead of a completed assessment where it excludes decisions affecting individuals and uses no personal information, with the executive sponsor\'s approval and a completion deadline. There is no exception for a system that makes or influences decisions about people.',
    nonCompliance: 'Deploying an in-scope AI system without an assessment is a management-system nonconformity, raised as a corrective action and reported at management review.',
    relatedDocuments: [
      'AI Policy',
      'AI Risk Management Framework',
      'Data Protection Impact Assessment (DPIA) Process',
      'AI System Lifecycle Policy'
    ],
    reviewCadence: 'The process is reviewed annually; individual assessments are revisited whenever the AI system, its data or its use changes materially.',
    controls: ['AI.5.2', 'AI.5.3', 'AI.5.4', 'AI.5.5'],
    frameworks: ['iso42001']
  },
  {
    id: 'ai-lifecycle-policy',
    title: 'AI System Lifecycle Policy',
    purpose: 'This policy sets out the requirements the organisation applies across the life cycle of an AI system — from design and development through verification, deployment, operation and monitoring — so that responsibility and quality are built in at every stage. It satisfies the ISO/IEC 42001 Annex A controls for the AI system life cycle.',
    scope: 'Applies to every AI system the organisation designs, develops, deploys or operates, whether built in-house or materially configured from a third-party model.',
    whyItMatters: 'This policy applies the same discipline to AI systems that the organisation applies to any other production system — requirements before build, testing before release, monitoring after — with two additions that matter specifically for AI: you have to be able to withdraw it, and you have to keep watching it.\n\nThat second point is the one that catches people. Conventional software behaves the same way in year two as on release day. An AI system\'s behaviour drifts as the world its inputs come from changes, so "it was tested and it worked" has a shelf life.',
    inPractice: [
      'You are building or configuring an AI system. Write down its intended purpose and its known limitations at the start — that document is what the reviewers, the operators and your successor rely on.',
      'You are about to release. Confirm there is a way to withdraw or roll back the system quickly, and that someone knows how.',
      'A system has been running well for months. Check the monitoring is still being looked at — drift is gradual and nobody notices the day it starts.'
    ],
    policyStatements: [
      {
        rule: 'Objectives and requirements for each AI system — its intended purpose, performance expectations and constraints — are defined and documented before development begins.',
        because: 'Without a stated purpose there is nothing to validate against, and scope expands into uses nobody assessed.'
      },
      {
        rule: 'AI systems are designed and developed through a responsible, documented process, with design decisions, the data used, and known limitations recorded.',
        because: 'Limitations that live only in the builder\'s head leave with them, and operators then rely on the system beyond what it can do.'
      },
      {
        rule: 'AI systems are verified and validated against their requirements before deployment, including testing for accuracy, robustness and — where relevant — bias, with results recorded.',
        because: 'Aggregate accuracy conceals uneven performance across groups, which is precisely the failure that causes harm to people.'
      },
      {
        rule: 'Deployment is controlled: a system is released only once its impact assessment, verification and approvals are complete, and a way to withdraw or roll it back is available.',
        because: 'The ability to stop a system quickly is the last line of defence when a harm appears that testing did not predict.'
      },
      {
        rule: 'Deployed AI systems are monitored in operation for performance drift, unexpected behaviour and emerging harms, and event logs are retained to support investigation and accountability.',
        because: 'AI behaviour changes as its inputs change even when the system does not, so testing at release does not stay true.'
      },
      {
        rule: 'Technical documentation for each AI system is maintained and kept current through its life, so the system stays understandable to those who operate and oversee it.',
        because: 'Oversight of a system nobody understands is nominal, and understanding decays fastest exactly where it matters most.'
      }
    ],
    roles: [
      {
        role: 'AI system owner',
        responsibility: 'Owns the system through its life: requirements, documentation, validation evidence, monitoring and eventual retirement.'
      },
      {
        role: 'Development team',
        responsibility: 'Follows the documented process, records design decisions and limitations, and produces validation evidence.'
      },
      {
        role: 'AIMS manager',
        responsibility: 'Confirms that impact assessment, validation and approvals are complete before release.'
      }
    ],
    exceptions: 'Releasing without complete validation evidence requires the AI system owner and executive sponsor to record what was not tested, why, and the compensating monitoring in place — with a deadline for completing it. Releasing without a rollback route is not permitted.',
    nonCompliance: 'Deploying outside this process, or allowing monitoring to lapse on a deployed system, is a management-system nonconformity raised as a corrective action.',
    relatedDocuments: [
      'AI Policy',
      'AI System Impact Assessment Process',
      'AI Data Governance Policy',
      'Change Management Policy'
    ],
    reviewCadence: 'Annually, or when the organisation’s AI development or deployment practices change materially.',
    controls: ['AI.6.1.3', 'AI.6.2.2', 'AI.6.2.4', 'AI.6.2.5', 'AI.6.2.6', 'AI.6.2.8'],
    frameworks: ['iso42001']
  },
  {
    id: 'ai-data-governance-policy',
    title: 'AI Data Governance Policy',
    purpose: 'This policy sets out how the organisation governs the data used to develop, train, tune and operate its AI systems, so that data is appropriate, lawful, of adequate quality, and traceable. It satisfies the ISO/IEC 42001 Annex A controls for data resources and data for AI systems.',
    scope: 'Applies to all data used to develop, enhance or operate AI systems within the AIMS scope, including training, tuning, testing and input data.',
    whyItMatters: 'An AI system is mostly its data, and almost every property people worry about in AI — accuracy, bias, privacy — is inherited from what it was trained or grounded on. Governing the data is therefore the highest-leverage thing available, and it is much easier to do at the point data is acquired than to reconstruct afterwards.\n\nIf you supply or prepare data for an AI system, the questions that matter are: are we allowed to use this for this purpose, does it represent the people it will be applied to, and can we say where it came from.',
    inPractice: [
      'You have a dataset that would improve a model. Check the basis for using it for that purpose before it is loaded — data lawfully collected for one purpose is not automatically available for another.',
      'You are preparing training or evaluation data. Record what you removed, relabelled or filtered; those choices shape the system\'s behaviour and are invisible afterwards.',
      'A dataset under-represents a group the system will be applied to. Say so before deployment rather than discovering it through complaints.'
    ],
    policyStatements: [
      {
        rule: 'The data used for each AI system is documented — its sources, categories, and the purpose it serves in the system.',
        because: 'Undocumented training data makes every later question about bias, privacy or provenance unanswerable.'
      },
      {
        rule: 'Data is acquired lawfully and ethically, with the right to use it for the intended AI purpose confirmed, including any personal-information obligations under the organisation’s Privacy Policy.',
        because: 'Data collected lawfully for one purpose is not automatically available for AI development, and consent rarely covers it.'
      },
      {
        rule: 'Data used to develop or evaluate AI systems is assessed for quality — accuracy, completeness, relevance and representativeness — appropriate to the system’s purpose and risk.',
        because: 'Representativeness is the property that determines whether the system works for everyone it is applied to, and it is the one most often skipped.'
      },
      {
        rule: 'The provenance of data is recorded, so that where data came from and how it has been transformed can be traced.',
        because: 'When a system behaves unexpectedly, provenance is what makes the cause findable rather than guessable.'
      },
      {
        rule: 'Data is prepared — cleaned, labelled, and where appropriate minimised or de-identified — in a documented way, so that preparation choices affecting the system’s behaviour are visible.',
        because: 'Preparation decisions embed assumptions into the system as firmly as the model architecture does, and leave no trace unless recorded.'
      },
      {
        rule: 'Data governance for AI is aligned with the organisation’s Data Classification & Handling and Privacy policies, not managed separately from them.',
        because: 'Personal information does not lose its protections by being used to train something.'
      }
    ],
    roles: [
      {
        role: 'AI system owner',
        responsibility: 'Accountable for the data used by their system: its basis for use, its quality assessment and its documentation.'
      },
      {
        role: 'Data preparers',
        responsibility: 'Record preparation and labelling decisions, and raise representativeness concerns before deployment.'
      },
      {
        role: 'Privacy contact',
        responsibility: 'Confirms the basis for using personal information for an AI purpose, and whether a DPIA is required.'
      }
    ],
    exceptions: 'Using personal information for AI development beyond its original collection purpose requires the privacy contact\'s assessment and, where required, a DPIA — it is not something a project can decide for itself.',
    nonCompliance: 'Using data in an AI system without an established basis, or without documenting its source, is a management-system nonconformity and may also be a privacy breach requiring assessment.',
    relatedDocuments: [
      'AI System Lifecycle Policy',
      'Data Classification & Handling Policy',
      'Record of Processing Activities & Data Handling Procedure',
      'Data Protection Impact Assessment (DPIA) Process'
    ],
    reviewCadence: 'Annually, or when the organisation’s AI data sources or handling practices change materially.',
    controls: ['AI.4.3', 'AI.7.2', 'AI.7.3', 'AI.7.4', 'AI.7.5', 'AI.7.6'],
    frameworks: ['iso42001']
  },
  {
    id: 'ai-transparency-policy',
    title: 'AI Transparency & Information Policy',
    purpose: 'This policy sets out what the organisation tells the people affected by its AI systems, and what information it provides to users and other interested parties, so that AI is used transparently and its outputs can be understood and challenged. It satisfies the ISO/IEC 42001 Annex A controls for information for interested parties.',
    scope: 'Applies to every AI system within the AIMS scope that interacts with, makes decisions about, or produces output relied on by people inside or outside the organisation.',
    whyItMatters: 'Transparency is what gives a person affected by an AI system somewhere to go. Being told "the system decided" with no explanation and no route to a human is the outcome this policy exists to prevent, and it is the thing that turns an ordinary error into a complaint or a regulatory matter.\n\nFor you the practical points are small but specific: do not let people believe they are talking to a person when they are not, and know how someone contests an outcome before you put a system in front of them.',
    inPractice: [
      'You are deploying a chatbot or automated responder. Make it clear it is automated, at the start rather than in a footer.',
      'A customer asks why a decision went the way it did. Do not improvise an explanation of the model — use the defined route, because a wrong explanation is worse than a delayed one.',
      'An AI system behaves in a way that could have harmed someone. Report it through the incident process; AI incidents follow the same route as security incidents.'
    ],
    policyStatements: [
      {
        rule: 'People are informed when they are interacting with an AI system rather than a human and, where an AI system materially affects them, are told in plain terms what it does.',
        because: 'Discovering undisclosed automation after the fact damages trust far more than the automation itself ever would.'
      },
      {
        rule: 'Users of an AI system are given the information they need to use it appropriately — its intended purpose, its limitations, and the level of human oversight that applies.',
        because: 'Misuse of AI systems is usually a documentation failure rather than a user failure.'
      },
      {
        rule: 'Where an AI system makes or influences a decision affecting an individual, there is a defined way for that person to seek an explanation or to challenge the outcome.',
        because: 'Recourse is what makes an automated decision acceptable, and increasingly what makes it lawful.'
      },
      {
        rule: 'Information provided to users and interested parties is accurate and kept current as the AI system changes.',
        because: 'Documentation describing a previous version of a system misleads more effectively than none, because it is trusted.'
      },
      {
        rule: 'Significant AI incidents — harmful, unsafe or seriously unexpected behaviour — are communicated to affected parties and, where required, reported externally, in line with the incident response process.',
        because: 'AI incidents affect the people subject to the system, who will not learn of them any other way.'
      },
      {
        rule: 'Any external reporting obligations that apply to the organisation’s AI systems are identified and met.',
        because: 'AI-specific reporting duties are emerging quickly and are easy to miss because they sit outside established compliance calendars.'
      }
    ],
    roles: [
      {
        role: 'AI system owner',
        responsibility: 'Maintains user-facing information about the system, and the explanation and challenge route for affected individuals.'
      },
      {
        role: 'AIMS manager',
        responsibility: 'Identifies applicable external reporting obligations and confirms they are met.'
      },
      {
        role: 'All personnel',
        responsibility: 'Do not represent AI output as human, and route explanation requests through the defined channel.'
      }
    ],
    exceptions: 'Withholding detail about how a system works may be justified where disclosure would enable the system to be gamed or would reveal genuinely confidential information — but never to the point of removing the individual\'s route to an explanation and a human review. Any such limitation is approved by the executive sponsor and recorded.',
    nonCompliance: 'Presenting AI output as human, or deploying a system affecting individuals with no route to challenge it, is a management-system nonconformity and is escalated to the executive sponsor.',
    relatedDocuments: [
      'AI Policy',
      'AI System Impact Assessment Process',
      'Incident Response Plan',
      'PII Principal Rights Procedure'
    ],
    reviewCadence: 'Annually, or when the organisation’s AI systems or the transparency obligations that apply to them change.',
    controls: ['AI.8.2', 'AI.8.3', 'AI.8.4', 'AI.8.5'],
    frameworks: ['iso42001']
  },
  {
    id: 'ai-objectives-metrics',
    title: 'AI Objectives & Metrics',
    purpose: 'This document sets the measurable objectives the organisation pursues for the responsible development and use of AI, and the metrics used to monitor how well the AI management system is performing. It satisfies the ISO/IEC 42001 Clause 6.2 (objectives) and Clause 9.1 (monitoring and measurement) requirements, together with its Annex A objectives controls.',
    scope: 'Applies to the AI management system and the objectives set for it. The specific objectives and targets must be set by the organisation.',
    policyStatements: [
      {
        rule: 'Objectives for the responsible development and use of AI are set that are measurable, consistent with the AI Policy, and aligned to the organisation’s highest AI risks.',
        because: 'An unmeasurable AI objective cannot be shown to have been met, which is what Clause 6.2 asks for.'
      },
      {
        rule: 'Each objective records what will be achieved, who is responsible, when it is due, and how the result will be evaluated.',
        because: 'An objective without an owner and an evaluation method is a statement of intent.'
      },
      {
        rule: 'Performance is measured using defined metrics — for example: the proportion of in-scope AI systems with a completed impact assessment; the number of AI systems in operation without current documentation; AI-related concerns raised and their resolution time; and monitoring alerts for model drift or unexpected behaviour.',
        because: 'These measure whether governance is actually operating, which is different from measuring whether the models perform well.'
      },
      {
        rule: 'Metrics are produced on a defined cadence and reviewed by the person accountable for the AIMS.',
        because: 'A metric collected but unread satisfies nothing, and Clause 9.1 asks for evaluation rather than collection.'
      },
      {
        rule: 'Where a metric shows the AIMS underperforming — for example an AI system running without an impact assessment — a corrective action is raised and tracked to closure.',
        because: 'A known governance gap with no action attached is a documented decision to tolerate it.'
      },
      {
        rule: 'Objectives and metrics are a standing input to management review, and are revised when met, superseded, or when the organisation’s AI use or risk profile changes.',
        because: 'AI use changes quickly, so objectives set against last year\'s estate measure the wrong things.'
      }
    ],
    roles: [
      {
        role: 'Executive sponsor',
        responsibility: 'Approves the AI objectives and reviews performance against them at management review.'
      },
      {
        role: 'AIMS manager',
        responsibility: 'Maintains this document, collects the measurements and reports trends.'
      },
      {
        role: 'Objective owners',
        responsibility: 'Named per objective; accountable for the plan and the accuracy of its measurement.'
      }
    ],
    exceptions: 'An objective that becomes unachievable or irrelevant is formally revised or retired at management review with the reason recorded, rather than quietly dropped or left standing unmet.',
    nonCompliance: 'An objective going unmeasured for a full review cycle, or a reported measurement known to be inaccurate, is a management-system nonconformity raised as a corrective action.',
    relatedDocuments: [
      'AI Policy',
      'AI Risk Management Framework',
      'AI Management System Scope',
      'Information Security Objectives & Metrics'
    ],
    reviewCadence: 'At least annually, and at each management review, or when an objective is met or superseded.',
    controls: ['AI.6.1.2', 'AI.9.3'],
    frameworks: ['iso42001']
  },
  {
    id: 'ropa-data-handling-procedure',
    title: 'Record of Processing Activities & Data Handling Procedure',
    purpose: 'This document sets out how the organisation identifies and documents its purposes for processing personal information (PII), and the data-minimisation, accuracy and retention discipline that applies once it is collected. The Record of Processing Activities (RoPA) it establishes is the foundational register of ISO/IEC 27701 — almost every other privacy control depends on it existing and being current.',
    scope: 'Applies to all personal information the organisation processes as controller, across every system and process that handles it, including Microsoft 365.',
    whyItMatters: 'The record of processing is the map everything else in privacy depends on. Answering a rights request, assessing a breach, or telling a customer where their data goes all start with knowing what processing exists — and an organisation that cannot answer that is slow at exactly the moments where speed is a legal obligation.\n\nWhat it asks of you is narrow: if you start doing something new with personal information, or start using a new system that holds it, say so. New processing that nobody records is the main way the map goes out of date.',
    inPractice: [
      'You start using a new system, spreadsheet or supplier that holds personal information. Tell the privacy contact so the record is updated — this is the single most common gap.',
      'You are asked to use existing customer data for something new. Check the recorded purpose first; a different purpose usually needs a fresh basis.',
      'You export personal information for a piece of analysis. Delete the export when you are done — a copy nobody is tracking is outside retention and invisible in a breach.'
    ],
    policyStatements: [
      {
        rule: 'Every processing activity involving personal information is identified and documented in the RoPA — its purpose, the categories of PII and individuals involved, and the lawful basis relied on — maintained as a controlled register in this console.',
        because: 'The record is the only artefact that can answer a regulator, a customer or a breach assessment about what the organisation actually does with personal data.'
      },
      {
        rule: 'Purposes are specific enough to test against (“payroll administration”, not “business operations”), because every downstream privacy control keys off the stated purpose.',
        because: 'A vague purpose permits anything, which means it constrains nothing and cannot be assessed.'
      },
      {
        rule: 'Collection is limited to what is adequate and relevant to the stated purpose, and processing does not extend beyond that purpose without a fresh lawful basis or consent.',
        because: 'Purpose creep happens through a series of individually reasonable decisions, none of which anyone would defend as a whole.'
      },
      {
        rule: 'Personal information is kept accurate and up to date, with a way for individuals and internal processes to flag and correct inaccuracies.',
        because: 'Decisions made on inaccurate personal information harm the individual concerned and are difficult to unwind.'
      },
      {
        rule: 'Retention periods are defined per category of personal information and enforced — PII is de-identified or disposed of once its purpose is fulfilled, and temporary files created while processing it are cleared within a defined period.',
        because: 'Retention is where most organisations quietly fail: data accumulates by default and nothing prompts its removal.'
      },
      {
        rule: 'Personal information and the media holding it are disposed of securely at the end of retention, and PII sent over data networks is protected so it reaches only its intended destination.',
        because: 'Disposal and transmission are the two points where data leaves the organisation\'s controlled environment.'
      },
      {
        rule: 'Contracts with any processor engaged to handle personal information on the organisation’s behalf include appropriate data protection terms, and responsibilities are documented explicitly where PII is jointly controlled with another party.',
        because: 'Accountability does not transfer with the data, so an undocumented arrangement leaves the organisation answerable for something it cannot direct.'
      },
      {
        rule: 'The RoPA is reviewed at least annually, and updated whenever a new processing activity, system or PII category is introduced.',
        because: 'A record that lags reality is worse than none, because it is relied on during a breach assessment when there is no time to verify it.'
      }
    ],
    roles: [
      {
        role: 'Privacy contact / officer',
        responsibility: 'Owns the RoPA, runs the annual review, and assesses new processing activities as they are raised.'
      },
      {
        role: 'Process and system owners',
        responsibility: 'Notify the privacy contact of new or changed processing, and own retention enforcement in their systems.'
      },
      {
        role: 'All personnel',
        responsibility: 'Collect only what is needed, use it for the recorded purpose, and avoid creating untracked copies.'
      }
    ],
    exceptions: 'Retaining personal information beyond its defined period requires a documented reason — a legal hold or a live dispute, for example — recorded against the retention schedule with a review date, rather than an indefinite extension.',
    nonCompliance: 'Processing personal information outside a recorded purpose, or without a lawful basis, may be a regulatory breach as well as a policy breach and is escalated to the privacy contact immediately.',
    relatedDocuments: [
      'Privacy Policy',
      'PII Principal Rights Procedure',
      'Data Classification & Handling Policy',
      'International PII Transfer Policy'
    ],
    reviewCadence: 'Annually, or whenever a new processing activity, system or category of personal information is introduced.',
    controls: ['P.7.2.1', 'P.7.2.2', 'P.7.2.6', 'P.7.2.7', 'P.7.2.8', 'P.7.4.1', 'P.7.4.2', 'P.7.4.3', 'P.7.4.4', 'P.7.4.5', 'P.7.4.6', 'P.7.4.7', 'P.7.4.8', 'P.7.4.9'],
    frameworks: ['iso27701', 'iso42001']
  },
  {
    id: 'pii-principal-rights-procedure',
    title: 'PII Principal Rights Procedure',
    purpose: 'This procedure sets out how the organisation meets the rights of the individuals (“PII principals”) whose personal information it holds — being told what is collected and why, accessing, correcting or erasing their information, objecting to its use, and understanding decisions made about them by automated means.',
    scope: 'Applies to every request an individual makes about their own personal information, and to every system holding personal information the request could touch.',
    whyItMatters: 'People have rights over their own information, and those rights come with deadlines that start the moment the request is made — not when it reaches the right person, and not when it arrives in the right format.\n\nThat is why the most important thing here applies to everyone rather than just the privacy team: recognise a request and pass it on the same day. A request does not have to be formal, use the right words, or come through the right channel to be valid. It can arrive in a support chat or on a phone call, and it counts.',
    inPractice: [
      'A customer mentions in passing that they want to know what you hold about them. That is an access request. Pass it on the same day rather than answering informally.',
      'Someone asks to be deleted. Do not action it yourself in the one system you can see — deletion has to reach every system, and partial deletion is worse than none because it looks complete.',
      'Someone withdraws consent to marketing. Route it properly, because withdrawal has to reach every system relying on that consent, not just the one they mentioned it in.'
    ],
    policyStatements: [
      {
        rule: 'Individuals are told, at or before collection, what personal information is being collected, why, and how to exercise their rights over it.',
        because: 'Rights nobody has been told about are rights nobody can use, and transparency at collection cannot be applied retrospectively.'
      },
      {
        rule: 'A single, well-publicised channel exists for individuals to make a privacy request, and every request is logged, acknowledged, and actioned within the timeframe applicable under the relevant privacy law.',
        because: 'Statutory deadlines run from receipt, so a request sitting unrouted in a personal mailbox is already consuming the clock.'
      },
      {
        rule: 'Access requests are fulfilled by providing the individual a copy of the personal information the organisation holds about them, in an understandable form.',
        because: 'A response the individual cannot interpret does not discharge the obligation.'
      },
      {
        rule: 'Correction and erasure requests are actioned across every system holding the information, and any third party the information was previously disclosed to is notified of the correction, deletion or restriction, where required.',
        because: 'Partial deletion leaves the data in circulation while creating a record suggesting it was handled.'
      },
      {
        rule: 'Individuals are given a clear way to withdraw or change previously given consent, and to object to processing carried out on another lawful basis; an objection is honoured unless the organisation has an overriding lawful ground to continue.',
        because: 'Consent that cannot practically be withdrawn was never freely given.'
      },
      {
        rule: 'Where a decision about an individual is made solely by automated means and significantly affects them, the individual is told this is happening and given meaningful information about the logic involved.',
        because: 'Automated decisions without explanation or recourse are the specific harm both privacy and AI regulation target.'
      },
      {
        rule: 'Every request and its outcome is recorded, so the organisation can demonstrate it consistently meets its obligations to PII principals, not just occasionally.',
        because: 'Compliance is demonstrated by the pattern across all requests, which only a record can show.'
      }
    ],
    roles: [
      {
        role: 'Privacy contact / officer',
        responsibility: 'Owns the request channel, logs and acknowledges requests, coordinates fulfilment across systems, and tracks the deadline.'
      },
      {
        role: 'System owners',
        responsibility: 'Locate, extract, correct or delete personal information in their systems when asked, within the time the privacy contact specifies.'
      },
      {
        role: 'All personnel',
        responsibility: 'Recognise a rights request however informally it arrives, and pass it to the privacy contact the same day.'
      }
    ],
    exceptions: 'Refusing or partially fulfilling a request — where an exemption applies, or where fulfilling it would disclose another individual\'s information — is decided by the privacy contact, recorded with its reasoning, and communicated to the individual with their route to complain.',
    nonCompliance: 'Failing to pass on a request, or actioning one partially without coordination, risks a regulatory breach and is escalated to the privacy contact immediately.',
    relatedDocuments: [
      'Privacy Policy',
      'Consent Management Procedure',
      'Record of Processing Activities & Data Handling Procedure',
      'AI Transparency & Information Policy'
    ],
    reviewCadence: 'Annually, or whenever the organisation’s systems or the privacy law governing individual rights change materially.',
    controls: ['P.7.3.1', 'P.7.3.2', 'P.7.3.3', 'P.7.3.4', 'P.7.3.5', 'P.7.3.6', 'P.7.3.7', 'P.7.3.8', 'P.7.3.9', 'P.7.3.10'],
    frameworks: ['iso27701', 'iso42001']
  },
  {
    id: 'consent-management-procedure',
    title: 'Consent Management Procedure',
    purpose: 'This procedure sets out when the organisation relies on consent as its lawful basis for processing personal information, how that consent is obtained and recorded, and how an individual can withdraw it.',
    scope: 'Applies to every processing activity where consent is the lawful basis relied on, including marketing communications, cookies and any optional data collection.',
    whyItMatters: 'Consent is only one of several lawful bases, and it is the most fragile: it has to be freely given, it can be withdrawn at any time, and if it was not properly obtained then everything relying on it is unsupported.\n\nThe practical implication is that consent should be used where it genuinely is a choice, and not stretched to cover things the person had no real option about. If you are building a form or a sign-up flow, that distinction is decided by you at design time.',
    inPractice: [
      'You are designing a sign-up form. Do not pre-tick the marketing box, and do not bundle marketing consent into accepting the terms — neither produces valid consent.',
      'Someone asks to stop receiving something. Treat it as a withdrawal and route it, rather than removing them from one list you happen to control.',
      'You are unsure whether consent is the right basis. Ask — often it is not, and using a more appropriate basis is both more robust and less work.'
    ],
    policyStatements: [
      {
        rule: 'Consent is used as the lawful basis only where it is the appropriate mechanism — genuinely optional, specific, and not a condition of receiving an unrelated service.',
        because: 'Consent that cannot realistically be refused is not consent, and everything relying on it is unsupported.'
      },
      {
        rule: 'Before consent is sought, the individual is told what they are consenting to, in plain language, separate from other terms they may be agreeing to at the same time.',
        because: 'Consent bundled into general terms cannot be shown to be specific or informed.'
      },
      {
        rule: 'Consent is obtained through a clear, affirmative action — silence, pre-ticked boxes or inactivity are never treated as consent.',
        because: 'A pre-ticked box records the absence of an objection, which is a different thing from agreement.'
      },
      {
        rule: 'Each instance of consent is recorded — what was consented to, when, and how — so the organisation can demonstrate consent was actually given, not just assumed.',
        because: 'The burden of demonstrating consent falls on the organisation, and an unrecorded consent cannot be evidenced.'
      },
      {
        rule: 'Individuals are given a way to withdraw consent that is as easy as the way they gave it, and withdrawal is actioned promptly across every system relying on that consent.',
        because: 'Withdrawal that is harder than granting undermines the validity of the original consent.'
      },
      {
        rule: 'Where consent is the basis for a particular use of personal information, processing for that use stops once consent is withdrawn, without affecting processing that relies on a different, valid lawful basis.',
        because: 'Conflating the two either over-deletes data the organisation must keep, or ignores a withdrawal that should have taken effect.'
      }
    ],
    roles: [
      {
        role: 'Privacy contact / officer',
        responsibility: 'Decides whether consent is the appropriate basis, approves consent wording, and owns the consent record.'
      },
      {
        role: 'Process and system owners',
        responsibility: 'Implement consent capture and withdrawal in their systems, and action withdrawals promptly.'
      },
      {
        role: 'All personnel',
        responsibility: 'Route withdrawal requests properly rather than handling them locally.'
      }
    ],
    exceptions: 'Continuing to process after a withdrawal is permitted only where a different, valid lawful basis genuinely applies — identified and recorded by the privacy contact at the time, not asserted afterwards.',
    nonCompliance: 'Processing on the basis of consent that was not validly obtained, or continuing after withdrawal without another basis, may be a regulatory breach and is escalated immediately.',
    relatedDocuments: [
      'Privacy Policy',
      'PII Principal Rights Procedure',
      'Record of Processing Activities & Data Handling Procedure'
    ],
    reviewCadence: 'Annually, or when the organisation introduces a new consent-based processing activity or its consent mechanism changes.',
    controls: ['P.7.2.3', 'P.7.2.4', 'P.7.3.4'],
    frameworks: ['iso27701']
  },
  {
    id: 'privacy-impact-assessment-process',
    title: 'Data Protection Impact Assessment (DPIA) Process',
    purpose: 'This document defines when and how the organisation assesses the privacy risk of a new or changed processing activity before it proceeds, so that privacy risks to individuals are identified and mitigated at design time rather than discovered afterwards.',
    scope: 'Applies to any new system, project or change that involves processing personal information, assessed proportionately to its privacy risk.',
    whyItMatters: 'A DPIA is the mechanism for thinking about risk to people before a project creates it, rather than after. It is not paperwork attached to a decision already taken — its value is entirely in being done early enough that the answer can still be "not like that".\n\nIf you are scoping something that involves personal information at scale, sensitive categories, or monitoring, this is the step that most affects whether the project causes harm later.',
    inPractice: [
      'You are planning something involving personal information at scale, sensitive categories, or monitoring of people. Raise a DPIA at design, not before launch.',
      'The assessment identifies a risk you cannot mitigate. That is a legitimate outcome — "do not proceed" and "proceed differently" are real answers, and finding that out early is the point.',
      'The project also involves an AI system. Say so, so the DPIA and the AI impact assessment are done as one piece of work rather than twice.'
    ],
    policyStatements: [
      {
        rule: 'A Data Protection Impact Assessment (DPIA) is triggered for any processing activity likely to result in higher privacy risk — for example large-scale processing, sensitive information categories, or systematic monitoring — before that processing begins.',
        because: 'The assessment can only influence design while the design is still open.'
      },
      {
        rule: 'The assessment describes the processing, its purpose and lawful basis, and evaluates its necessity and proportionality against that purpose.',
        because: 'Necessity and proportionality are where most higher-risk processing genuinely fails, and they are skipped if not asked explicitly.'
      },
      {
        rule: 'Risks to individuals — from unauthorised access to loss of control over their own information — are identified and rated, using the same likelihood/consequence approach as the organisation’s general risk assessment.',
        because: 'The relevant risk is to the individual, not to the organisation, and using one method keeps the ratings comparable.'
      },
      {
        rule: 'Mitigations are identified for each material risk, and the assessment records a clear decision to proceed, proceed with conditions, or not proceed, made by an accountable owner.',
        because: 'An assessment with no recorded decision leaves the project to proceed by default, which is the outcome it exists to prevent.'
      },
      {
        rule: 'Where an AI system is involved, the DPIA is coordinated with the AI System Impact Assessment Process rather than duplicating it — one assessment, viewed through both lenses.',
        because: 'Two overlapping assessments produce two partial answers and neither team reads the other\'s.'
      },
      {
        rule: 'Completed assessments are retained as evidence, and a DPIA is revisited when the processing activity it covers changes materially.',
        because: 'An assessment describes the processing as designed, which stops being true as soon as it changes.'
      }
    ],
    roles: [
      {
        role: 'Privacy contact / officer',
        responsibility: 'Determines when a DPIA is required, facilitates it, and reviews the outcome before processing begins.'
      },
      {
        role: 'Project / processing owner',
        responsibility: 'Completes the assessment, implements the mitigations, and records the decision.'
      },
      {
        role: 'Executive sponsor',
        responsibility: 'Decides where a DPIA identifies high residual risk that cannot be mitigated.'
      }
    ],
    exceptions: 'There is no exception to completing a DPIA before higher-risk processing begins. Where a regulator must be consulted because high residual risk remains, that consultation happens before processing rather than alongside it.',
    nonCompliance: 'Beginning higher-risk processing without a completed DPIA is a regulatory exposure as well as a policy breach, and is escalated to the privacy contact and executive sponsor.',
    relatedDocuments: [
      'Record of Processing Activities & Data Handling Procedure',
      'AI System Impact Assessment Process',
      'Risk Management Framework',
      'Privacy Policy'
    ],
    reviewCadence: 'The process is reviewed annually; individual assessments are revisited whenever the processing activity they cover changes materially.',
    controls: ['P.7.2.5'],
    frameworks: ['iso27701', 'iso42001']
  },
  {
    id: 'international-transfer-policy',
    title: 'International PII Transfer Policy',
    purpose: 'This policy sets out how the organisation manages personal information that is transferred, stored or accessed across national borders, so that transfers have a lawful basis and are visible rather than an unplanned side effect of using cloud services.',
    scope: 'Applies to any personal information transferred outside the jurisdiction in which it was originally collected, including transfers arising from Microsoft 365 or other cloud services’ hosting locations.',
    whyItMatters: 'Most cross-border transfers are not deliberate decisions to send data overseas — they are the by-product of choosing a tool. A SaaS product hosted in another region is an overseas disclosure whether or not anyone thought of it that way.\n\nThat is why this policy matters to anyone adopting tools rather than only to the privacy team: the transfer happens at the moment of adoption, and the obligations attach then. In most cases the organisation stays accountable for what the overseas recipient does with the data.',
    inPractice: [
      'You are evaluating a new SaaS tool. Find out where it stores data before loading personal information into it — the hosting region is part of the assessment, not a detail.',
      'A supplier changes their hosting region or adds a subprocessor overseas. Pass it on; it changes the transfer position even though nothing on our side changed.',
      'You are asked to send personal information to an overseas office or partner. Check the basis first rather than after it has been sent.'
    ],
    policyStatements: [
      {
        rule: 'A lawful basis for each cross-border transfer of personal information is identified before the transfer takes place — for example an adequacy mechanism, standard contractual clauses, or the individual’s informed consent.',
        because: 'The basis must exist before the transfer; establishing one afterwards does not make the transfer lawful in the meantime.'
      },
      {
        rule: 'A current list of the countries and organisations personal information may be transferred to is maintained, including transfers arising from the hosting locations of Microsoft 365 and any other cloud or SaaS providers used.',
        because: 'Most transfers arise from hosting decisions rather than deliberate sends, so a list covering only intentional transfers misses the majority.'
      },
      {
        rule: 'Recipients of transferred personal information are assessed for the privacy protections they apply, proportionate to the sensitivity of the information involved.',
        because: 'The obligation follows the data, so the recipient\'s practices become the organisation\'s exposure.'
      },
      {
        rule: 'Disclosures of personal information to third parties, including cross-border recipients, are logged — the recipient, the information disclosed, and the legal basis for the disclosure.',
        because: 'Individuals can ask who their information has been disclosed to, and the answer has to come from a record rather than a recollection.'
      },
      {
        rule: 'Where applicable law requires it — such as the Australian Privacy Principles’ requirements on overseas disclosure — the organisation takes reasonable steps to ensure an overseas recipient does not breach the individual’s privacy protections.',
        because: 'Under APP 8 the organisation generally remains accountable for the overseas recipient\'s handling, so the steps taken are what limit its liability.'
      },
      {
        rule: 'The list of transfer destinations and their basis is reviewed at least annually, and whenever a new cloud service, supplier or hosting location is introduced.',
        because: 'Providers change hosting regions and add subprocessors without the customer deciding anything.'
      }
    ],
    roles: [
      {
        role: 'Privacy contact / officer',
        responsibility: 'Determines the basis for each transfer, maintains the destination list, and runs the annual review.'
      },
      {
        role: 'Relationship / system owners',
        responsibility: 'Report hosting locations and subprocessor changes for the services they own.'
      },
      {
        role: 'Anyone adopting a tool',
        responsibility: 'Establishes where the service stores data before placing personal information in it.'
      }
    ],
    exceptions: 'A transfer without an established basis is not permitted. Where a service\'s hosting arrangements cannot be determined, the service is not used for personal information until they can.',
    nonCompliance: 'Transferring personal information overseas without an identified basis may be a regulatory breach and is escalated to the privacy contact immediately.',
    relatedDocuments: [
      'Record of Processing Activities & Data Handling Procedure',
      'Supplier Security Policy',
      'Privacy Policy',
      'PII Processor Obligations Policy'
    ],
    reviewCadence: 'Annually, or whenever a new cross-border processing arrangement, supplier or hosting location is introduced.',
    controls: ['P.7.5.1', 'P.7.5.2', 'P.7.5.3', 'P.7.5.4'],
    frameworks: ['iso27701']
  },
  {
    id: 'pii-processor-obligations-policy',
    title: 'PII Processor Obligations Policy',
    purpose: 'This policy applies only where the organisation processes personal information on behalf of a customer — for example as a SaaS or service provider — rather than as controller of its own data. It sets out the additional obligations ISO/IEC 27701 Clause 8 places on an organisation acting as a PII processor.',
    scope: 'Applies to every engagement where the organisation processes personal information on a customer’s instructions, and to the systems and subcontractors involved in that processing.',
    whyItMatters: 'This policy applies where the organisation handles personal information on a customer\'s behalf rather than for its own purposes — as a service provider. In that role the rules are different and, in some respects, stricter: the data is not ours to make decisions about.\n\nThe practical test is simple. If a use is not covered by the customer\'s instructions or the contract, the answer is no until the customer says otherwise — including uses that would obviously benefit them.',
    inPractice: [
      'Someone suggests using customer data to improve the product, train a model, or build a case study. Check the contract first; a benefit to the customer is not the same as an instruction from them.',
      'You want to bring in a new subcontractor who would touch customer data. That needs the customer\'s prior authorisation, not just an internal approval.',
      'A customer instruction looks like it might breach data protection law. Say so before carrying it out — that notification is itself an obligation.'
    ],
    policyStatements: [
      {
        rule: 'Personal information is processed only on the customer’s documented instructions and only for the purposes agreed in the customer contract — never repurposed for the organisation’s own marketing or advertising without the customer’s explicit instruction.',
        because: 'As processor the organisation has no independent purpose of its own, so any use outside instructions is unauthorised however reasonable it seems.'
      },
      {
        rule: 'If an instruction from the customer would require processing that infringes applicable data protection law, the customer is notified before that instruction is carried out.',
        because: 'Following an unlawful instruction does not transfer liability, and the notification is a distinct obligation in its own right.'
      },
      {
        rule: 'The customer agreement sets out both parties’ obligations for the personal information being processed, and records of processing carried out on the customer’s behalf are maintained and available to the customer.',
        because: 'The customer is accountable to the individuals and cannot discharge that without a record of what was done on their behalf.'
      },
      {
        rule: 'Subcontractors engaged to process personal information on the customer’s behalf are disclosed to the customer, and a new subcontractor is engaged only with the customer’s prior authorisation — with the customer able to object to a proposed change.',
        because: 'Undisclosed subprocessing removes the customer\'s ability to assess their own supply chain, which they remain accountable for.'
      },
      {
        rule: 'Personal information processed on the customer’s behalf is disposed of, returned or transferred securely at the end of the engagement, using a policy disclosed to the customer in advance.',
        because: 'Retention past the engagement is processing without instruction, and the customer needs to know the arrangement before it applies.'
      },
      {
        rule: 'Legally binding requests to disclose personal information processed on a customer’s behalf are notified to the customer where permitted, and any disclosure legally required is recorded and limited to what the law requires.',
        because: 'The customer may have grounds to challenge a request the processor cannot, and over-disclosure is not protected by the compulsion.'
      },
      {
        rule: 'Cross-border transfers of personal information processed on a customer’s behalf follow the same lawful-basis and destination-list discipline as the organisation’s own transfers, disclosed to the customer.',
        because: 'The customer inherits the transfer exposure and cannot assess it without knowing where the data goes.'
      }
    ],
    roles: [
      {
        role: 'Privacy contact / officer',
        responsibility: 'Owns processor obligations, the subprocessor disclosure list, and the response to legally binding disclosure requests.'
      },
      {
        role: 'Account / relationship owners',
        responsibility: 'Ensure customer instructions are documented, and raise any proposed use not covered by the contract.'
      },
      {
        role: 'Product and engineering',
        responsibility: 'Do not use customer personal information for development, training or analytics without a documented instruction permitting it.'
      }
    ],
    exceptions: 'Any use of customer personal information beyond documented instructions requires the customer\'s explicit written instruction. Internal convenience, product improvement and anonymisation intentions are not exceptions to this.',
    nonCompliance: 'Processing customer personal information outside instructions is a contractual and potentially regulatory breach, escalated immediately to the privacy contact and the account owner.',
    relatedDocuments: [
      'Record of Processing Activities & Data Handling Procedure',
      'International PII Transfer Policy',
      'Supplier Security Policy',
      'AI Data Governance Policy'
    ],
    reviewCadence: 'Annually, or whenever the organisation takes on a new processor engagement or subcontractor arrangement.',
    controls: ['P.8.2.1', 'P.8.2.2', 'P.8.2.3', 'P.8.2.4', 'P.8.2.5', 'P.8.2.6', 'P.8.3.1', 'P.8.4.1', 'P.8.4.2', 'P.8.4.3', 'P.8.5.1', 'P.8.5.2', 'P.8.5.3', 'P.8.5.4', 'P.8.5.5', 'P.8.5.6', 'P.8.5.7', 'P.8.5.8'],
    frameworks: ['iso27701', 'iso42001']
  }
];

/* ============================================================
   Organisation profile — the facts a generated document needs
   that no template can know.

   Every template above is deliberately generic ("the organisation").
   That is right for the parts of a policy that are genuinely
   universal, and wrong for the handful of places ISO 27001 expects
   an organisation to be specific: Clause 4.3's scope boundaries,
   Clause 4.2's interested parties, and the regulatory obligations
   that sit behind both. Those places used to carry wording like
   "to be completed with the specific business units, teams,
   locations and services in scope" — a to-do item shipped inside a
   document, which a practitioner then had to retype into every
   other document that referenced the same facts.

   ORG_PROFILE_FIELDS defines those facts once. They are stored as
   ordinary Settings rows (SettingKey/SettingValue), so this needs
   no new SharePoint list and no schema migration — a tenant
   provisioned before this existed picks it up with no
   re-provisioning, same as any other setting.

   `token` is what a template writes as {{token}}; resolveOrgTokens()
   in app.js substitutes it. A field left blank falls back to its
   `fallback` text — the original generic wording — so an
   unanswered profile degrades to exactly the document Checkpoint
   generated before this feature existed, never to an empty gap or
   a literal "{{token}}" leaking into an approved policy. */
window.ORG_PROFILE_FIELDS = [
  {
    key: 'orgIndustry', token: 'industry', label: 'Industry',
    type: 'select',
    hint: 'Drives the suggested interested parties and regulatory obligations below.',
    fallback: 'the organisation’s sector'
  },
  {
    key: 'orgBusinessUnits', token: 'businessUnits', label: 'Business units and teams in scope',
    type: 'textarea',
    hint: 'The parts of the business the ISMS covers — e.g. "Engineering, Customer Support, Finance". Clause 4.3.',
    fallback: 'all of them — no business unit or team is excluded'
  },
  {
    key: 'orgLocations', token: 'locations', label: 'Locations in scope',
    type: 'textarea',
    hint: 'Offices, sites or "remote-first" — wherever work in scope actually happens.',
    fallback: 'all locations from which the organisation operates'
  },
  {
    key: 'orgServices', token: 'services', label: 'Products or services in scope',
    type: 'textarea',
    hint: 'What the organisation actually delivers to its customers.',
    fallback: 'the services the organisation delivers'
  },
  {
    key: 'orgInterestedParties', token: 'interestedParties', label: 'Interested parties',
    type: 'textarea',
    hint: 'Who depends on the organisation, or has a say in how it handles information. Clause 4.2. Pre-filled from your industry — edit freely.',
    fallback: 'customers, regulators, employees and key suppliers'
  },
  {
    key: 'orgRegulatory', token: 'regulatory', label: 'Regulatory and contractual obligations',
    type: 'textarea',
    hint: 'The laws, standards and contract terms that bind this organisation. Pre-filled from your industry — edit freely.',
    fallback: 'applicable Australian privacy law and its customer contracts'
  },
  {
    key: 'orgExclusions', token: 'exclusions', label: 'Deliberate exclusions from scope',
    type: 'textarea',
    hint: 'Anything explicitly outside the ISMS, and why. Leave blank if nothing is excluded — that is a valid and common answer.',
    fallback: 'nothing — the ISMS covers the whole of the organisation described above'
  }
];

/* Australian-market industry presets. These pre-fill the two fields
   practitioners most often stall on — interested parties (Clause
   4.2) and regulatory obligations — with the ones that actually
   apply to that sector here, rather than a generic list.

   Everything here is a STARTING POINT the practitioner edits, not
   an assertion that a given law binds a given client: whether the
   Privacy Act's small-business exemption applies, whether an entity
   is APRA-regulated, and whether a system is SOCI-critical are all
   organisation-specific determinations no preset can make. The
   wizard says so on the same screen. */
window.INDUSTRY_PROFILES = [
  {
    id: 'saas', label: 'Technology / SaaS',
    interestedParties: 'Enterprise and SMB customers, prospective customers’ procurement and security teams, investors, employees, cloud and sub-processor suppliers, and the regulators of the markets the product is sold into.',
    regulatory: 'Privacy Act 1988 (Cth) and the Australian Privacy Principles; the Notifiable Data Breaches scheme; customer contractual security schedules and DPAs; where customers are overseas, GDPR or equivalent obligations flowed down by contract.'
  },
  {
    id: 'healthcare', label: 'Healthcare / Medical',
    interestedParties: 'Patients and their families, treating clinicians and referrers, Medicare and private health insurers, the Australian Digital Health Agency, state health departments, employees, and clinical-system and pathology suppliers.',
    regulatory: 'Privacy Act 1988 (Cth) — noting health information is sensitive information and the small-business exemption does not apply to health service providers; My Health Records Act 2012; state health records legislation; the Notifiable Data Breaches scheme.'
  },
  {
    id: 'finserv', label: 'Financial services',
    interestedParties: 'Retail and wholesale customers, APRA and ASIC, AUSTRAC, the board and risk committee, employees, outsourced service providers and material service providers, and scheme or clearing counterparties.',
    regulatory: 'APRA CPS 234 (Information Security) and CPS 230 (Operational Risk Management) where APRA-regulated; AFSL obligations; AML/CTF Act 2006 and AUSTRAC reporting; Privacy Act 1988 (Cth); the Notifiable Data Breaches scheme.'
  },
  {
    id: 'government', label: 'Government / public sector',
    interestedParties: 'Citizens and service recipients, the responsible minister and department, the relevant Auditor-General, other agencies sharing data, employees, and contracted service providers.',
    regulatory: 'The Protective Security Policy Framework (PSPF) and the ISM where applicable; state equivalents such as Queensland’s IS18 or the NSW Cyber Security Policy; Privacy Act 1988 (Cth) or the state privacy act that applies; public-records and archives legislation.'
  },
  {
    id: 'defence', label: 'Defence industry',
    interestedParties: 'The Department of Defence and its Defence Industry Security Office, prime contractors and their supply chains, security-cleared personnel, the Australian Signals Directorate, and subcontractors handling controlled information.',
    regulatory: 'Defence Industry Security Program (DISP) membership conditions; the Information Security Manual (ISM); the Defence Security Principles Framework; export-control obligations under the Defence Trade Controls Act 2012; Privacy Act 1988 (Cth).'
  },
  {
    id: 'education', label: 'Education / training',
    interestedParties: 'Students and, where students are minors, their parents or guardians; academic and professional staff; accrediting and regulatory bodies such as TEQSA or ASQA; funding departments; alumni; and learning-platform suppliers.',
    regulatory: 'Privacy Act 1988 (Cth) or the applicable state privacy act; the ESOS Act and National Code where international students are enrolled; state child-safety and working-with-children obligations; the Notifiable Data Breaches scheme.'
  },
  {
    id: 'critical-infra', label: 'Critical infrastructure / utilities',
    interestedParties: 'End consumers and connected communities, the Cyber and Infrastructure Security Centre, sector regulators, state emergency and essential-services bodies, employees, and operational-technology and maintenance suppliers.',
    regulatory: 'Security of Critical Infrastructure Act 2018 (SOCI) — including the critical infrastructure risk management program and mandatory cyber incident reporting obligations where the entity is a responsible entity; sector-specific licence conditions; Privacy Act 1988 (Cth).'
  },
  {
    id: 'proserv', label: 'Professional services',
    interestedParties: 'Clients and their own regulators, professional and registration bodies, insurers, employees and contractors, and the platform and hosting suppliers that hold client material.',
    regulatory: 'Privacy Act 1988 (Cth); professional confidentiality and, where legal services are provided, legal professional privilege obligations; client contractual security and confidentiality terms; the Notifiable Data Breaches scheme.'
  },
  {
    id: 'notforprofit', label: 'Not-for-profit / community',
    interestedParties: 'Service recipients and their families, donors and members, the ACNC, grant-funding bodies and government departments, volunteers and employees, and service-delivery partners.',
    regulatory: 'Privacy Act 1988 (Cth) where it applies; ACNC governance standards; grant and funding-agreement security conditions; state child-safety obligations where services are delivered to minors.'
  },
  {
    id: 'other', label: 'Other / general',
    interestedParties: 'Customers, regulators, employees, shareholders or owners, and key suppliers.',
    regulatory: 'Privacy Act 1988 (Cth) and the Notifiable Data Breaches scheme where applicable, and the organisation’s customer contractual obligations.'
  }
];
