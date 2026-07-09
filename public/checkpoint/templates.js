/* ============================================================
   Checkpoint — Policy Template Library
   window.POLICY_TEMPLATES: ten starter policy/plan documents, written
   for a Microsoft 365 environment, in our own words — no standard
   text, no vendor boilerplate copied in. Each entry:
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
  }
];
