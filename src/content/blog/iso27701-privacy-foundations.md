---
title: "ISO 27701 in Australia: Building a PIMS That Satisfies the Privacy Act"
seoTitle: "ISO 27701 in Australia: Building a PIMS"
description: "Extending ISO 27001 into a Privacy Information Management System under Australian law — the 13 APPs, ROPA, DPIAs and the Notifiable Data Breaches scheme."
date: 2025-10-02
lastModified: 2026-05-24
author: "Compliance365"
tags: ["ISO 27701", "Privacy", "PIMS", "Australia", "Privacy Act"]
image: "/assets/blog-iso27701.svg"
---

ISO 27701 extends your ISO 27001 ISMS into a **Privacy Information Management System (PIMS)**. For Australian organisations, it does something more specific: it gives you a structured, auditable framework for demonstrating compliance with the *Privacy Act 1988* and its 13 Australian Privacy Principles — without building a separate compliance programme from scratch.

This guide is practical. It covers what auditors check, how to build your PIMS inside Microsoft 365, and why combined ISO 27001 + ISO 27701 certification is the most cost-effective privacy assurance path for Australian mid-market organisations.

---

## What ISO 27701 Actually Is

ISO 27701 is not a standalone standard. It is an **extension** to ISO 27001 — published as a Privacy Information Management System specification that layers onto your existing ISMS.

That matters for implementation. You don't build a PIMS separately. You extend your existing risk assessment, control set, and evidence structure to cover privacy-specific requirements. Organisations pursuing both certifications from a single engagement typically reach dual certification for 30–40% less than running sequential separate programmes.

The standard distinguishes between two roles:
- **PII Controller** — decides the purpose and means of processing personal information (most Australian businesses)
- **PII Processor** — processes personal data on behalf of a controller (SaaS providers, managed service providers, IT outsourcers)

Your obligations under ISO 27701 differ slightly depending on which role applies — or whether you act as both.

---

## ISO 27701 and the Australian Privacy Act 1988

The Australian Privacy Act 1988 applies to APP entities — organisations with annual turnover above $3 million, health service providers, and a range of others regardless of turnover. The Act's 13 **Australian Privacy Principles** (APPs) govern how personal information is collected, used, disclosed, and stored.

ISO 27701 maps directly to these obligations. The table below shows the core alignment:

| Australian Privacy Principle | ISO 27701 Coverage |
|---|---|
| APP 1 — Open and transparent management | Privacy policy, PIMS governance, PII controller controls |
| APP 3 — Collection of solicited personal information | Purpose limitation, data minimisation controls |
| APP 5 — Notification of collection | Notice at collection point, transparency documentation |
| APP 6 — Use or disclosure | Processing records, legitimate basis documentation |
| APP 8 — Cross-border disclosure | Third-party transfers, sub-processor agreements |
| APP 11 — Security of personal information | ISO 27001 security controls, extended to PII |
| APP 12 — Access to personal information | Subject access request workflow |
| APP 13 — Correction of personal information | Data accuracy and correction process |

You will also need to overlay the **Notifiable Data Breaches (NDB) scheme** — covered below.

ISO 27701 does not make you automatically compliant with the Privacy Act. What it gives you is a documented, independently audited framework that demonstrates your organisation takes privacy management seriously — which is what regulators and customers increasingly expect.

---

## Building Your Record of Processing Activities (ROPA)

The ROPA is the centrepiece of your PIMS. It documents every processing activity involving personal information: what data, why, on what legal basis, where it lives, who can access it, how long it's retained, and which third parties it flows to.

For Australian organisations, the ROPA should capture:

**For each processing activity:**
- Processing purpose and legal basis (consent, contractual necessity, legitimate interests)
- Categories of personal information (general PII, sensitive information under the Privacy Act, health information)
- Data subjects (customers, employees, contractors, website visitors)
- Retention period and deletion trigger
- Storage location and jurisdiction (critical for APP 8 cross-border considerations)
- Processors and sub-processors with DPA/contractual status
- Security controls applied

**Australian-specific additions:**
- Whether the processing involves health information (additional obligations under APP 3(4), APP 6(2)(c))
- Whether the activity triggers the NDB scheme on breach
- Whether overseas recipients are involved and what the APP 8 basis is

**Building the ROPA in Microsoft 365:** The most practical implementation uses a SharePoint List with one row per processing activity and columns for each field above. Power Automate alerts when entries reach their review date, and all changes are versioned automatically. Auditors can be given read access to a SharePoint view filtered to the evidence they need — no email attachments, no PDF snapshots.

---

## When You Need a Data Protection Impact Assessment

A DPIA (also called a Privacy Impact Assessment in Australian regulatory guidance) is required for high-risk processing. Under ISO 27701 and good privacy practice, you should run a DPIA when processing involves:

- **Large-scale processing** of sensitive information (health data, financial data, biometrics)
- **AI or automated decision-making** that produces legal or significant effects on individuals
- **Systematic monitoring** of individuals (employee monitoring, CCTV, behavioural tracking)
- **Cross-border transfers** of personal data to countries without equivalent privacy protections
- **New technology** where the privacy risk is not yet well understood

A DPIA does not need to be a lengthy document. A practical DPIA covers:

1. **Context** — what the processing activity is and who it affects
2. **Necessity and proportionality** — is this the minimum data required for the purpose?
3. **Risk identification** — what could go wrong, how likely, how severe?
4. **Mitigating controls** — what controls reduce the residual risk to acceptable?
5. **Sign-off** — documented approval by the appropriate authority (typically an executive or DPO equivalent)

In Microsoft 365, DPIAs live in SharePoint with an approval workflow. A Power Automate flow routes the DPIA to the relevant approver and timestamps the sign-off — producing the audit trail auditors expect.

---

## Subject Access Requests Under Australian Law

Under APP 12, individuals have the right to request access to their personal information. Under APP 13, they have the right to request correction of inaccurate or out-of-date information. The Privacy Act gives you 30 days to respond (extendable in some circumstances).

Your PIMS needs a documented Subject Rights Request (SRR) process that covers:
- How requests are received (web form, email, phone)
- Identity verification before disclosure
- How PII is located across systems (this is where a good ROPA pays dividends — you know exactly where data lives)
- How the response is prepared and sent
- Record of the request and outcome for accountability

A SharePoint List with one row per request, tracked through statuses (Received → Verified → Located → Responded → Closed), works well. Power Automate can calculate the 30-day deadline and alert the owner at day 20 and day 28.

---

## The Notifiable Data Breaches Scheme

Under Part IIIC of the Privacy Act, APP entities must notify the OAIC and affected individuals when an "eligible data breach" occurs — one that is likely to result in serious harm to any of the individuals whose personal information was involved.

Your PIMS must include:
- A **data breach response procedure** that distinguishes eligible from non-eligible breaches
- A **risk assessment process** for determining whether serious harm is likely
- A **72-hour internal escalation trigger** (the OAIC expects prompt assessment, even though the formal notification timeframe is 30 days for eligible breaches)
- **Notification templates** for both OAIC (Form NDB1) and affected individuals
- A **breach register** recording all incidents assessed, the outcome, and any notifications made

The breach register integrates naturally with your ISO 27001 incident register. Most organisations add a "Privacy Breach" category to their existing incident type taxonomy and extend the register with the NDB-specific fields (eligible breach assessment, OAIC notification date, individual notification date).

---

## Controls Implementation in Microsoft 365

ISO 27701 Annex B maps the privacy-specific controls. For Australian organisations running Microsoft 365, most controls are available natively:

**Microsoft Purview:**
- **Data Loss Prevention (DLP)**: policies that identify and restrict transmission of health information, TFNs, credit card numbers — mapped to APP 11 and APP 6
- **Information Protection labels**: classify documents containing PII and apply protection automatically
- **Retention policies**: enforce APP 11.2 destruction requirements — data deleted when retention period expires, not left indefinitely
- **Communication Compliance**: monitor for inadvertent PII disclosure in email and Teams

**Microsoft Entra ID:**
- **Conditional Access**: restrict access to PII processing systems to compliant, managed devices
- **Privileged Identity Management (PIM)**: just-in-time access for administrators — reduces the blast radius of a breach
- **Access Reviews**: quarterly review of who can access systems containing personal information

**SharePoint / Microsoft Lists:**
- ROPA, DPIA register, SRR tracker, breach register — all versioned, all auditable
- Power Automate for review reminders, escalation workflows, and evidence snapshots

---

## What Auditors Check at a ISO 27701 Stage 2 Audit

When your certification auditor arrives for Stage 2, they will sample across these areas:

1. **ROPA completeness** — Is every significant processing activity documented? Are reviews evidenced?
2. **DPIA coverage** — Are DPIAs present for high-risk activities? Are they approved and acted on?
3. **Subject rights request handling** — Can you show an end-to-end SRR from receipt to response? Are response times within the legal limit?
4. **Breach response** — Is there a tested procedure? Is there a breach register with assessed incidents?
5. **Third-party management** — Are DPAs / SCCs in place with all sub-processors? Is there evidence of oversight?
6. **Policy and training** — Is there a privacy policy? Is staff training evidenced and current?
7. **Control operation** — Sample of DLP alerts actioned, access reviews completed, Purview retention policies applied

All of these can be evidenced from SharePoint. Auditors don't need to be given SharePoint admin access — a read-only view scoped to the relevant evidence folders is sufficient.

---

## Combined ISO 27001 + ISO 27701 Certification

The most common engagement shape for Australian mid-market organisations — particularly in healthcare, financial services, and SaaS — is combined ISO 27001 + ISO 27701 certification from a single evidence set.

The economics are straightforward: your ISMS already covers most of what the PIMS requires (risk assessment, controls, management review, internal audit, corrective actions). The privacy extension adds the ROPA, DPIAs, SRR process, and breach procedure — but doesn't require a parallel governance structure.

Certification audits can be conducted simultaneously by a single certification body, with a combined Stage 1 and Stage 2. For most organisations 50–200 staff, combined certification adds 20–25% to the ISO 27001 engagement scope — not 100%.

---

## Bottom Line

ISO 27701 is the right framework for Australian organisations that need to demonstrate Privacy Act compliance to customers, procurement panels, or regulators. It works best as an overlay on your existing ISMS — not a separate programme. With Microsoft 365, most of the evidence infrastructure is already in place. The gap is usually documentation, ROPA structure, and a handful of privacy-specific workflows.

A 30-minute call will tell you exactly what your PIMS gap looks like and what combined certification would cost for your organisation.
