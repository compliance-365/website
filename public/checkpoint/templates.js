/* ============================================================
   Checkpoint — Policy Template Library
   window.POLICY_TEMPLATES: twenty-one starter policy/plan/ISMS
   documents, written for a Microsoft 365 environment, in our own
   words — no standard text, no vendor boilerplate copied in. They
   cover two things:
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
       controls          // control codes this document helps satisfy —
                          // ISO 27001 Annex A ('A.x.x'), ISO 42001 ('AI.x.x')
                          // or ISO 27701 ('P.x.x.x') codes that exist in
                          // S.controls (see store.js's per-framework
                          // control lists). Used by App.generateTemplate()
                          // to offer linking the generated document as
                          // evidence to those exact controls once saved.
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
    policyStatements: [
      'Information security is managed as a continuous programme, with a named executive sponsor accountable for the management system as a whole.',
      'Risks to information are identified, assessed and treated through a documented risk register, reviewed at least quarterly.',
      'Every employee and contractor completes security awareness training before being granted system access, with refresher training at least annually.',
      'Access to systems and data follows the principle of least privilege, granted per role and reviewed on a regular cycle.',
      'Security incidents are reported through the defined incident response process the moment they are suspected — reporting early is never penalised.',
      'This policy, and every subordinate policy it references, is reviewed by management at least annually, or sooner after a material change to the business or its risk profile.'
    ],
    reviewCadence: 'Annually, or immediately following a material change to the organisation’s structure, technology estate or risk profile — whichever comes first.',
    controls: ['A.5.1', 'A.5.4']
  },
  {
    id: 'acceptable-use-policy',
    title: 'Acceptable Use Policy',
    purpose: 'This policy sets out the acceptable use of the organisation’s devices, accounts, email, internet access and Microsoft 365 services, so that everyone understands what is — and isn’t — permitted use of the organisation’s technology.',
    scope: 'Applies to everyone issued an organisation device, account or Microsoft 365 licence, including remote and hybrid workers, and to any personal device used to access company data.',
    policyStatements: [
      'Company devices and accounts are provided for business purposes; incidental personal use is permitted provided it does not interfere with work, consume excessive resources, or breach this policy.',
      'Users must not share account credentials, disable multi-factor authentication, or attempt to bypass a security control configured on their device or account.',
      'Company data is stored only in approved Microsoft 365 locations — OneDrive, SharePoint, Teams — never copied to personal cloud storage, USB drives or personal email.',
      'Installing unapproved software or browser extensions, or connecting an unmanaged device to company systems, requires prior approval from IT.',
      'Using company systems to access, store or transmit unlawful, discriminatory or offensive material is prohibited.',
      'Remote working takes place over a secured connection, with the device locked whenever unattended, in line with the organisation’s remote working guidance.'
    ],
    reviewCadence: 'Annually, or when the organisation’s Microsoft 365 device or access policies change materially.',
    controls: ['A.5.10', 'A.6.7']
  },
  {
    id: 'access-control-policy',
    title: 'Access Control Policy',
    purpose: 'This policy establishes how access to the organisation’s systems and information is requested, granted, reviewed and revoked, so that people only ever hold the access their role genuinely requires.',
    scope: 'Applies to every user, administrative and service account across the organisation’s Microsoft 365 tenant and any connected systems.',
    policyStatements: [
      'Access is granted on the principle of least privilege and need-to-know, requested and approved before provisioning — never after.',
      'Privileged (administrative) roles are assigned through Microsoft Entra Privileged Identity Management with time-bound activation, not standing admin rights.',
      'Multi-factor authentication is required on every account, with no standing exceptions for legacy or service accounts capable of supporting it.',
      'Access rights are formally reviewed at least every six months, and immediately on role change or termination.',
      'Shared or generic accounts are not used for individual access; every action taken on a system must be attributable to a named person.',
      'Guest access to Microsoft 365 resources is time-limited, reviewed periodically, and removed the moment it is no longer required.'
    ],
    reviewCadence: 'Every six months, alongside the scheduled access review, or sooner following a significant access-related incident.',
    controls: ['A.5.15', 'A.5.16', 'A.5.18']
  },
  {
    id: 'incident-response-plan',
    title: 'Incident Response Plan',
    purpose: 'This plan defines how the organisation detects, responds to and recovers from information security incidents, so that impact is contained quickly and consistently, regardless of who is on shift when it happens.',
    scope: 'Covers any suspected or confirmed security incident affecting the organisation’s systems, data or Microsoft 365 tenant, including breaches, malware, unauthorised access and data loss.',
    policyStatements: [
      'Any employee who suspects a security incident reports it immediately to the designated incident contact — early, uncertain reports are always welcome.',
      'A named incident response lead triages, classifies severity and coordinates the response for every reported incident.',
      'Containment actions — disabling a compromised account, isolating a device — are taken the moment an incident is confirmed, ahead of full root-cause analysis.',
      'Incidents involving personal data are assessed against notification obligations, such as the Notifiable Data Breaches scheme, within the required timeframe.',
      'Every incident is documented in full — timeline, actions taken, root cause and lessons learned — and closed out with any resulting corrective actions tracked to completion.',
      'The incident response plan is tested at least annually through a tabletop exercise, and updated with what that exercise reveals.'
    ],
    reviewCadence: 'Annually, and after every incident classified as major, incorporating the lessons learned from it.',
    controls: ['A.5.24', 'A.5.25', 'A.5.26']
  },
  {
    id: 'bcp-dr-plan',
    title: 'Business Continuity & Disaster Recovery Plan',
    purpose: 'This plan sets out how the organisation maintains and recovers its critical business functions and IT services following a disruptive event, minimising downtime and data loss.',
    scope: 'Covers every business-critical process, application and piece of infrastructure the organisation depends on, including Microsoft 365 services and any on-premises or third-party hosted systems.',
    policyStatements: [
      'Critical business functions and their recovery time and recovery point objectives are documented and reviewed at least annually.',
      'Backups of business-critical data are taken on a defined schedule, stored separately from production, and restore-tested at least annually.',
      'The disaster recovery plan names who activates it, who sits on the response team, and the order in which services are restored.',
      'Dependencies on Microsoft 365 and other cloud services are documented alongside the provider’s own resilience commitments and the organisation’s fallback options.',
      'The business continuity plan is exercised at least annually, and any gap the exercise surfaces is tracked through to closure.',
      'Contact details for the response team, key suppliers and stakeholders are kept current and reachable even if primary systems are unavailable.'
    ],
    reviewCadence: 'Annually, and after any exercise or real invocation that surfaces a material gap.',
    controls: ['A.5.29', 'A.5.30', 'A.8.14']
  },
  {
    id: 'supplier-security-policy',
    title: 'Supplier Security Policy',
    purpose: 'This policy sets the minimum security expectations the organisation places on suppliers and third parties who access its systems, data or Microsoft 365 environment, so third-party risk is managed consistently rather than case by case.',
    scope: 'Applies to every supplier, contractor or third-party service provider with access to the organisation’s information, systems or premises, including cloud and SaaS providers.',
    policyStatements: [
      'Suppliers are assessed for security risk before onboarding, proportionate to the sensitivity of the data or access they will be given.',
      'Security requirements — data handling, breach notification, right-to-audit — are written into supplier contracts and agreements before access is granted, not after.',
      'Supplier access to systems and data follows the same least-privilege principle as internal access, and is removed promptly at contract end.',
      'Critical suppliers are reviewed periodically against their ongoing security posture — certifications, incident history and any subcontracting arrangements.',
      'Any security incident at a supplier that could affect the organisation’s data is reported without undue delay, per the contracted notification terms.',
      'The vendor risk register maintained in this console is treated as the authoritative record of supplier criticality and review status.'
    ],
    reviewCadence: 'Annually for standard suppliers; more frequently for any supplier assessed as Critical or High risk.',
    controls: ['A.5.19', 'A.5.20', 'A.5.22']
  },
  {
    id: 'data-classification-policy',
    title: 'Data Classification & Handling Policy',
    purpose: 'This policy defines how information at the organisation is classified by sensitivity, and how each classification must be labelled, stored, shared and disposed of.',
    scope: 'Applies to all information created, received or held by the organisation, in any format, across Microsoft 365 and any other system it is stored in.',
    policyStatements: [
      'Information is classified into defined tiers — for example Public, Internal, Confidential, Highly Confidential — based on the impact of unauthorised disclosure.',
      'Classification labels are applied using Microsoft Purview sensitivity labels wherever practical, so protection travels with the document rather than staying tied to its location.',
      'Confidential and above information is not shared externally without an approved mechanism — expiring links, encryption — matching its classification.',
      'Physical and digital records are disposed of securely once their retention period expires, using a method appropriate to their classification.',
      'Anyone handling Confidential or Highly Confidential information completes classification-specific training before being granted access to it.',
      'Mislabelled or misclassified information, once identified, is relabelled, and any resulting exposure is assessed and reported as a potential incident.'
    ],
    reviewCadence: 'Annually, or when a new category of sensitive information is introduced into the business.',
    controls: ['A.5.12', 'A.5.13', 'A.5.14']
  },
  {
    id: 'secure-development-policy',
    title: 'Secure Development Policy',
    purpose: 'This policy sets out the security requirements the organisation applies when developing, testing or modifying software and systems, so security is built in from the start rather than retrofitted afterwards.',
    scope: 'Applies to all in-house and outsourced software development, including internal tools, customer-facing applications, and any automation built on Microsoft 365 or Power Platform.',
    policyStatements: [
      'Development, test and production environments are kept separate, and production data is never used in test or development without explicit approval and masking.',
      'Code changes are peer-reviewed and pass automated security checks before being merged and deployed.',
      'Dependencies and third-party libraries are tracked and kept patched against known vulnerabilities.',
      'Security requirements are considered at design time for any new feature that handles sensitive data or authentication.',
      'Source code and secrets — API keys, connection strings — are never committed to a public or unauthorised repository; secrets are held in a managed secrets store.',
      'Applications are tested for common vulnerability classes before release, with any finding rated High or above tracked to remediation before go-live.'
    ],
    reviewCadence: 'Annually, or when the development toolchain or hosting environment changes materially.',
    controls: ['A.8.25', 'A.8.28', 'A.8.31']
  },
  {
    id: 'ai-acceptable-use-policy',
    title: 'AI Acceptable Use Policy',
    purpose: 'This policy sets out how employees may use AI tools — including Microsoft Copilot and any third-party generative AI service — in the course of their work, balancing the productivity these tools offer against data protection and accuracy risk.',
    scope: 'Applies to every employee and contractor using an AI tool, whether organisation-provisioned or brought in independently, on any organisation device, account or data.',
    policyStatements: [
      'Only AI tools approved by IT/security may be used with company data; personal or unapproved AI accounts must never be given access to company information.',
      'Confidential or Highly Confidential information is not entered into an AI tool unless that tool has been specifically assessed and approved for that classification.',
      'Output from an AI tool is treated as a draft, not a final answer — a human reviews and verifies AI-generated content before it is relied on, sent externally, or used in a decision.',
      'Using an AI tool for a decision that materially affects an individual — hiring, performance, credit — requires documented human review and sign-off.',
      'Any AI system the organisation builds or deploys itself is assessed for its intended purpose, data sources and potential impact before release, consistent with the organisation’s AI governance programme.',
      'Employees report any AI tool behaving unexpectedly, producing harmful output, or that they suspect has been fed sensitive data inappropriately.'
    ],
    reviewCadence: 'Annually, or sooner given how quickly AI tooling and organisational usage of it are evolving.',
    controls: ['AI.2.2', 'AI.3.2']
  },
  {
    id: 'privacy-policy-skeleton',
    title: 'Privacy Policy (Skeleton)',
    purpose: 'This document outlines how the organisation collects, uses, discloses and protects personal information, in line with its obligations under applicable privacy law and its own privacy commitments. It is a starting skeleton, not a finished policy — it must be completed with the organisation’s specific data-handling practices before publication.',
    scope: 'Applies to personal information the organisation collects from customers, employees, job applicants and any other individual, across every system and process that handles it, including Microsoft 365.',
    policyStatements: [
      'Personal information is only collected for a clearly identified, lawful purpose, and only the information reasonably necessary for that purpose is collected.',
      'Individuals are told, at or before the point of collection, what personal information is collected, why, and how to contact the organisation about it.',
      'Personal information is not used or disclosed for a purpose other than the one it was collected for, without consent or another lawful basis.',
      'Individuals may request access to, correction of, or deletion of their personal information, and requests are actioned within the timeframe required by applicable law.',
      'Personal information is retained only for as long as necessary for the purpose it was collected, then securely destroyed or de-identified.',
      'Any suspected or confirmed breach involving personal information is assessed against notification obligations without delay.',
      'Placeholder — this is a skeleton: insert the organisation’s specific data categories, third-party disclosures, and any jurisdiction-specific requirements (for example the Australian Privacy Principles or GDPR) before publishing.'
    ],
    reviewCadence: 'Annually, or whenever privacy law or the organisation’s data handling practices change materially.',
    controls: ['A.5.34', 'P.7.2.2']
  },
  {
    id: 'cryptography-policy',
    title: 'Cryptography Policy',
    purpose: 'This policy sets out how the organisation uses cryptography to protect the confidentiality and integrity of its information, and how the keys and certificates that make that protection possible are managed through their life.',
    scope: 'Applies to all organisation information that requires cryptographic protection in transit or at rest, and to every key, certificate and secret used to provide it, across Microsoft 365 and any connected system.',
    policyStatements: [
      'Information in transit over untrusted networks is protected with current, strong TLS; deprecated protocols and cipher suites are disabled wherever the organisation controls the configuration.',
      'Information at rest is encrypted using the platform’s own encryption — Microsoft 365 service encryption, BitLocker on managed devices — with sensitive workloads confirmed as covered rather than assumed.',
      'Sensitive information shared externally is protected with an approved mechanism appropriate to its classification — Microsoft Purview encryption, or expiring, permissioned links — never sent unprotected.',
      'Cryptographic keys, certificates and secrets are inventoried, stored in a managed store such as Azure Key Vault rather than in code or documents, rotated on a defined schedule, and revoked immediately if compromise is suspected.',
      'Only current, industry-accepted algorithms and key lengths are used; algorithms known to be weak or deprecated are not used for new protection and are phased out of existing use.',
      'The loss, exposure or suspected compromise of any key, certificate or secret is treated and reported as a security incident.'
    ],
    reviewCadence: 'Annually, or sooner if a cryptographic weakness is disclosed that affects the algorithms or protocols the organisation relies on.',
    controls: ['A.8.24']
  },
  {
    id: 'logging-monitoring-policy',
    title: 'Logging & Monitoring Policy',
    purpose: 'This policy defines what security-relevant activity the organisation records, how those records are protected and monitored, and how they support the detection of and response to security events.',
    scope: 'Applies to all organisation systems and Microsoft 365 services that generate security-relevant logs, and to everyone responsible for reviewing them.',
    policyStatements: [
      'Security-relevant events — sign-ins, administrative actions, access and permission changes, and data-access events for sensitive information — are logged across the Microsoft 365 estate using Entra ID sign-in and audit logs, the Purview audit log, and Microsoft Defender.',
      'Logs are retained for a defined minimum period appropriate to the organisation’s needs and obligations, and are protected against alteration and unauthorised deletion.',
      'Logs are monitored for anomalies and high-risk events, with alerts on the events that matter routed to a named owner rather than left for no one to read.',
      'System and service clocks are synchronised to a single reliable time source, so that timestamps across different logs can be correlated during an investigation.',
      'Access to logs is limited to authorised personnel, and access to and review of the logs is itself recorded.',
      'An alert or log entry indicating a possible security incident is handled through the organisation’s incident response process.'
    ],
    reviewCadence: 'Annually, or when the organisation’s logging tooling, retention obligations or monitored event set changes materially.',
    controls: ['A.8.15', 'A.8.16', 'A.8.17']
  },
  {
    id: 'vulnerability-patch-policy',
    title: 'Vulnerability & Patch Management Policy',
    purpose: 'This policy sets out how the organisation finds, prioritises and fixes technical vulnerabilities, and keeps its systems on a secure, supported and consistently configured baseline.',
    scope: 'Applies to all organisation-managed devices, Microsoft 365 services, applications and infrastructure the organisation is responsible for maintaining.',
    policyStatements: [
      'Technical vulnerabilities are identified on an ongoing basis, using Microsoft Defender vulnerability management and relevant vendor and authority advisories, rather than only during periodic assessments.',
      'Identified vulnerabilities are risk-rated, and remediation timeframes are set by severity — critical vulnerabilities addressed fastest — with progress tracked to closure.',
      'Security updates for operating systems and applications are deployed on a defined cadence through managed tooling such as Microsoft Intune, with critical updates expedited outside the normal cycle.',
      'A secure baseline configuration is defined for devices and key services; configuration drift away from that baseline is detected and corrected.',
      'Software and systems that are no longer supported by the vendor are identified and either replaced, upgraded, or isolated and compensated for, rather than left in service unmanaged.',
      'Any decision not to remediate a vulnerability within its timeframe is documented, risk-accepted by a named owner, time-bound, and revisited.'
    ],
    reviewCadence: 'Annually, or when the organisation’s patching tooling, device management approach or risk tolerance changes.',
    controls: ['A.8.8', 'A.8.9']
  },
  {
    id: 'malware-protection-policy',
    title: 'Malware & Endpoint Protection Policy',
    purpose: 'This policy sets out how the organisation protects its devices, accounts and Microsoft 365 services against malware, phishing and other malicious activity.',
    scope: 'Applies to every organisation-managed device and Microsoft 365 account, and to the email and collaboration services the organisation operates.',
    policyStatements: [
      'Endpoint protection — Microsoft Defender — is enabled on all managed devices, kept current, and configured so that users cannot disable it.',
      'Real-time protection, cloud-delivered protection and automatic remediation are enabled, so that detections are acted on without waiting for manual intervention.',
      'Email and collaboration services are protected against malware and phishing using Microsoft Defender for Office 365 capabilities such as Safe Attachments and Safe Links.',
      'Malware detections generate alerts and, where the situation warrants, are handled through the organisation’s incident response process.',
      'Employees are trained to recognise and report phishing and suspicious files, and must never disable a security protection on their device or account to get something to work.',
      'The use of removable media is restricted in line with the Acceptable Use Policy, and permitted media is scanned before its contents are trusted.'
    ],
    reviewCadence: 'Annually, or when the organisation’s endpoint or email security tooling changes materially.',
    controls: ['A.8.7']
  },
  {
    id: 'hr-security-policy',
    title: 'Human Resources Security Policy',
    purpose: 'This policy sets out the information security responsibilities that apply across the employment life cycle — before, during and after employment — so that security is a condition of holding access, not an afterthought.',
    scope: 'Applies to all employees and contractors of the organisation, from pre-employment screening through to the return of access and assets on departure.',
    policyStatements: [
      'Background and reference checks proportionate to the role and its access are carried out before employment begins, within the limits of applicable law.',
      'Terms of employment and contractor agreements set out the individual’s information security responsibilities and reference the organisation’s acceptable use expectations.',
      'Confidentiality or non-disclosure obligations are agreed before access to sensitive information is granted, and continue to apply after the individual leaves.',
      'Security responsibilities are communicated at onboarding, and role-appropriate security awareness training is assigned before or as system access is granted.',
      'Access is provisioned when someone joins, adjusted when their role changes, and fully revoked when they leave — coordinated with the Access Control Policy so nothing is missed at any of those points.',
      'Breaches of the organisation’s security policies are handled through a defined and consistently applied disciplinary process.'
    ],
    reviewCadence: 'Annually, or when the organisation’s employment, onboarding or offboarding processes change materially.',
    controls: ['A.6.1', 'A.6.2', 'A.6.4', 'A.6.5', 'A.6.6']
  },
  {
    id: 'asset-management-policy',
    title: 'Asset Management Policy',
    purpose: 'This policy sets out how the organisation identifies, owns and looks after the devices, software, cloud services and information it depends on, so that nothing important is unaccounted for or unprotected.',
    scope: 'Applies to all organisation hardware, software, cloud and SaaS services, and information assets, wherever they are held.',
    policyStatements: [
      'An inventory of hardware, software and cloud services is maintained and kept current, drawing on Microsoft Intune and the organisation’s own asset and vendor records rather than memory.',
      'Every significant asset has a named owner accountable for its protection, its classification, and its eventual secure disposal or return.',
      'Information assets are classified and handled in line with the Data Classification & Handling Policy.',
      'Devices are enrolled in management (Microsoft Intune) before they are allowed to access company data, and unmanaged devices are restricted accordingly.',
      'When someone leaves or changes role, the company assets and access they held are returned or revoked, and devices are securely wiped or reallocated.',
      'Lost or stolen devices are reported immediately and, where the capability exists, remotely wiped.'
    ],
    reviewCadence: 'Annually, or when the organisation’s device management or asset tracking approach changes materially.',
    controls: ['A.5.9', 'A.5.11']
  },
  {
    id: 'change-management-policy',
    title: 'Change Management Policy',
    purpose: 'This policy sets out how the organisation controls changes to its systems and Microsoft 365 configuration, so that changes deliver what they intend without quietly undermining security.',
    scope: 'Applies to changes to production systems, Microsoft 365 tenant and security configuration, applications and infrastructure the organisation is responsible for.',
    policyStatements: [
      'Significant changes are requested, assessed for their security and risk impact, and approved before they are made — never implemented first and reviewed later.',
      'Changes are tested before they reach production wherever that is practical, and a way to roll the change back is identified before it goes ahead.',
      'Emergency changes follow an expedited path when genuinely necessary, but are documented and reviewed after the fact rather than skipped.',
      'Security-relevant configuration changes to Microsoft 365 — Conditional Access, tenant-wide settings, privileged role assignments — are reviewed by a second person before or promptly after they take effect.',
      'A record is kept for each change, linking it to its request, its approval and its outcome.',
      'A change that materially affects the organisation’s risk triggers a review of the controls and documentation it touches.'
    ],
    reviewCadence: 'Annually, or when the organisation’s change or release process changes materially.',
    controls: ['A.8.32']
  },
  {
    id: 'physical-security-policy',
    title: 'Physical & Environmental Security Policy',
    purpose: 'This policy sets out how the organisation protects its premises, equipment and information from physical threats — theft, damage, unauthorised access and environmental hazards — including in remote and home-working settings.',
    scope: 'Applies to the organisation’s offices and equipment, and to any location, including home offices, where company equipment or information is used.',
    policyStatements: [
      'Access to offices, and to any area holding sensitive information or equipment, is controlled and limited to people who are authorised to be there.',
      'Visitors are signed in, escorted where appropriate, and not left unattended in areas holding sensitive information or equipment.',
      'Equipment is protected against theft, damage and environmental hazards, and equipment critical to operations has appropriate power and environmental protection.',
      'A clear desk and clear screen practice applies: sensitive material is not left visible or unattended, and screens lock automatically when a device is left unattended.',
      'Home and remote workspaces keep company equipment and information secure from household members, visitors and public view, in line with the organisation’s remote working guidance.',
      'Equipment and storage media are securely sanitised before reuse or disposal, so that information cannot be recovered from them.'
    ],
    reviewCadence: 'Annually, or after any change to the organisation’s premises, or a physical security incident.',
    controls: ['A.7.1', 'A.7.2', 'A.7.4', 'A.7.7']
  },
  {
    id: 'isms-scope',
    title: 'ISMS Scope Document',
    purpose: 'This document defines the scope and boundaries of the organisation’s information security management system (ISMS) — the parts of the business, the locations, the information and the technology it covers, and anything deliberately excluded. It satisfies the ISO/IEC 27001 Clause 4.3 requirement to determine and document the scope of the ISMS.',
    scope: 'This document describes the ISMS itself: what it does and does not cover. It is a starting draft — the bracketed specifics must be completed with the organisation’s actual business units, locations and services before approval.',
    policyStatements: [
      'The ISMS covers the organisation’s information and the systems that process it, centred on its Microsoft 365 tenant — to be completed with the specific business units, teams, locations and services in scope.',
      'The needs and requirements of interested parties — customers, regulators, employees and key suppliers — have been identified (Clauses 4.1 and 4.2) and inform the boundaries set here.',
      'The scope includes the organisation’s people, its processes, and the technology it controls; reliance on Microsoft 365 and other third-party services is in scope for oversight and managed through the Supplier Security Policy, even though those providers’ internal operations are not the organisation’s to run.',
      'Any part of the organisation, or any interface or dependency, excluded from the scope is stated explicitly with a justification, and no exclusion leaves a real information risk unmanaged.',
      'This scope is documented, approved by management, and maintained as controlled documented information available to those who need it.',
      'The scope is reviewed at least annually and whenever the organisation’s structure, locations, services, technology estate or risk profile changes materially.'
    ],
    reviewCadence: 'Annually, or on any material change to the organisation’s structure, locations, services or risk profile.',
    controls: []
  },
  {
    id: 'risk-management-framework',
    title: 'Risk Management Framework',
    purpose: 'This document defines how the organisation identifies, analyses, evaluates and treats information security risk consistently and repeatably, so that two people assessing the same risk reach comparable results. It satisfies the ISO/IEC 27001 Clause 6.1.2 (risk assessment) and Clause 6.1.3 (risk treatment) requirements.',
    scope: 'Applies to all information security risks to assets within the ISMS scope, and to everyone who identifies, owns or treats those risks. The organisation’s live risk register and Risk Treatment Plan are maintained in this console.',
    policyStatements: [
      'Risks are identified in terms of their effect on the confidentiality, integrity and availability of information assets within scope, and recorded in the risk register maintained in this console.',
      'Each risk is analysed for likelihood and impact using defined, consistent scales (for example 1–5 for each), and the two combine into an overall risk level — so risks are prioritised on evidence, not instinct.',
      'Risks are evaluated against documented risk acceptance criteria: a defined threshold above which a risk must be treated rather than simply accepted.',
      'Every risk has a named risk owner, accountable for the treatment decision and for the residual risk that remains after it.',
      'Risks above the acceptance threshold are treated by one of the recognised options — modifying the risk with controls, avoiding the activity, sharing the risk (for example through insurance or contract), or, only with documented management sign-off, accepting it.',
      'Treatment decisions and the controls selected are recorded in the Risk Treatment Plan, and reconciled against ISO 27001 Annex A in the Statement of Applicability, with any excluded Annex A control justified.',
      'Residual risk is reviewed at least quarterly and after any material change, and the framework itself is revisited if the organisation’s risk appetite or method changes.'
    ],
    reviewCadence: 'Annually, or when the organisation’s risk appetite, scales or assessment method change materially.',
    controls: []
  },
  {
    id: 'infosec-objectives-metrics',
    title: 'Information Security Objectives & Metrics',
    purpose: 'This document sets the measurable information security objectives the organisation is working towards, and the metrics it uses to monitor, measure and evaluate how well the ISMS is performing. It satisfies the ISO/IEC 27001 Clause 6.2 (objectives) and Clause 9.1 (monitoring, measurement, analysis and evaluation) requirements.',
    scope: 'Applies to the information security management system and the objectives set for it. Many of the metrics below are computed live by this console; the specific objectives and targets must be set by the organisation.',
    policyStatements: [
      'Information security objectives are set that are measurable, consistent with the information security policy, and aligned to the organisation’s highest-priority risks.',
      'Each objective records what will be achieved, what resource it needs, who is responsible, when it is due, and how the result will be evaluated.',
      'Performance is measured using defined metrics — for example: percentage of accounts with multi-factor authentication enabled; mean time to remediate critical vulnerabilities; overdue high-risk remediation actions; phishing-simulation failure rate; percentage of staff completing security training on time; and the number of corrective actions open past their due date.',
      'Metrics are produced on a defined cadence — this console computes many of them live, including the posture score, framework readiness percentage, drift alerts and overdue actions — and are reviewed by the person accountable for the ISMS.',
      'Results are compared against the objectives and their thresholds; where a metric shows the ISMS underperforming, a corrective action is raised and tracked to closure.',
      'Objectives and metrics are a standing input to the management review, and are revised when an objective is met, ceases to be relevant, or the organisation’s risk profile changes.'
    ],
    reviewCadence: 'At least annually, and at each management review, or when an objective is met or superseded.',
    controls: []
  }
];
