---
title: "Three Frameworks in 10 Weeks — Health SaaS Unlocks Enterprise Health System Contracts"
summary: "A health SaaS provider needed Essential Eight ML2, ISO 27701, and ISO 42001 to qualify for enterprise health system procurement. We delivered all three as an integrated management system in 10 weeks — built entirely inside Microsoft 365."
date: 2026-01-15
sector: Healthcare
services: ["Essential Eight", "ISO 27701", "ISO 42001"]
tags: ["Essential Eight", "ISO 27701", "ISO 42001", "Healthcare", "SaaS", "AI Governance"]
timeline: "10 weeks"
outcomes:
  - "3 frameworks in 10 weeks"
  - "Essential Eight ML2 achieved"
  - "ISO 27701 + ISO 42001 certified"
  - "2 health system contracts unlocked"
seo:
  description: "How a health SaaS provider achieved Essential Eight ML2, ISO 27701 privacy certification, and ISO 42001 AI governance in 10 weeks — unlocking two state health system enterprise contracts."
  keywords: ["ISO 27701 healthcare australia", "essential eight health saas", "ISO 42001 health AI governance", "health sector compliance australia"]
---

## The situation

A Sydney-based health SaaS company — 38 staff — had built a clinical workflow platform used by allied health providers and specialist practices across NSW and Victoria. Their platform handled patient clinical records, appointment data, and increasingly, AI-assisted clinical documentation features powered by Azure OpenAI.

Two state health system procurement panels had reached out with interest. Both had the same requirement: a security and privacy compliance package that included Essential Eight ML2 (for cyber security baseline), ISO 27701 certification (for patient data privacy management), and a demonstrable AI governance framework given the AI-assisted clinical features.

The sticking point: these were three separate frameworks, and the client's previous compliance advisor had quoted them as three separate engagements — a total of $280k and an estimated 14 months. Both procurement panels had indicated they wanted compliance documentation within 90 days or they would proceed with an alternate supplier.

## Why three frameworks — and why together

Health data is among the most sensitive personal information regulated under the Australian Privacy Act 1988 and the My Health Records Act. For a SaaS provider handling clinical data:

**Essential Eight (ML2)** was required because both health systems specified it as their minimum supplier security baseline — a result of the healthcare sector's exposure in the ACSC's annual threat report and high-profile ransomware incidents at health providers in 2022 and 2023.

**ISO 27701** — the privacy extension to ISO 27001 — was required to demonstrate that the client had a formally documented Privacy Information Management System (PIMS) covering patient data collection, use, retention, and subject rights handling. ISO 27701 is increasingly required by health system procurement because it provides independent certification evidence that the vendor's privacy programme meets the standards the health system needs for their own regulatory obligations.

**ISO 42001** — the AI Management System standard — was required specifically because the platform's AI-assisted clinical documentation features involved AI processing patient clinical notes. Both health systems' procurement panels had added AI governance requirements to their supplier frameworks following the Department of Health's AI in Healthcare guidance in 2025.

The key insight: these three frameworks share a substantial evidence base. Essential Eight technical controls underpin the ISO 27701 access control and security requirements. The ISO 27701 data classification and processing records feed directly into the ISO 42001 AI system inventory and data governance requirements. Building them as an integrated management system rather than three separate programmes reduced the evidence collection burden by approximately 50%.

## What we built

The engagement was structured across four workstreams running in parallel.

### Workstream 1: Essential Eight ML2 (Weeks 1–8)

The platform ran on Azure and Microsoft 365 E5. The initial assessment found the client at approximately ML1 across most controls — reasonable configuration hygiene but limited formal governance and evidence capture.

**Technical uplifts delivered:**
- Conditional Access policies tightened — MFA enforced for all users, phishing-resistant methods (FIDO2) configured for admin accounts
- Intune compliance baselines deployed with non-compliant device remediation workflow
- Application control (WDAC) policies deployed via Intune with ring-based rollout — pilot → staff → all devices over four weeks
- Office macro restrictions enforced via Intune ADMX profiles for all users
- ASR rules configured through Defender for Endpoint — browser hardening and script-block logging enabled
- PIM (Privileged Identity Management) deployed for all Azure and M365 admin roles
- AvePoint Cloud Backup deployed for M365 workloads — meeting the third-party backup requirement with 4h RPO, documented restoration procedure, and a tested restoration completed in Week 9

**ML2 evidence pack:** Assembled at each milestone, indexed against ASD criteria. QA reviewed before submission.

### Workstream 2: ISO 27701 Privacy Management System (Weeks 1–9)

ISO 27701 builds on an ISO 27001 foundation. Given the client didn't hold ISO 27001, we built the ISMS layer concurrently with the privacy layer, scoped to the clinical data processing activities.

**Key deliverables:**
- Record of Processing Activities (RoPA) covering 11 processing purposes — clinical records, appointment data, billing, AI feature processing, and data sharing with referring practitioners
- Privacy notices reviewed and updated for the platform's patient-facing and practitioner-facing interfaces
- Data subject rights process documented and tested — access, correction, and deletion request workflows mapped to Purview Subject Rights Requests
- Data Processing Agreements reviewed and updated for all third-party sub-processors (Azure, AvePoint, Twilio for appointment reminders)
- DPIA conducted for the AI-assisted clinical documentation feature — the highest-risk processing activity — with mitigations documented and accepted by the client's Medical Director
- Retention and deletion schedules established for all clinical data categories

### Workstream 3: ISO 42001 AI Management System (Weeks 4–10)

The AI governance work centred on the platform's Azure OpenAI integration — a feature that summarised clinical consultation notes using GPT-4 with clinical prompting guardrails.

**AI system inventory:** Three AI systems identified — the clinical documentation assistant (Azure OpenAI), appointment scheduling optimisation (internal ML model), and a diagnostic code suggestion feature (third-party API).

**Risk and impact assessments:** Conducted for each AI system, covering accuracy risk, bias risk, privacy impact, clinician over-reliance risk, and data retention. The clinical documentation assistant received a High risk rating; controls included mandatory clinician review before any AI-generated note entered the patient record, session logging to Purview, and a monthly accuracy audit process.

**AI policy and governance:** AI Management Policy published, AI Risk Owner assigned (CTO), human-oversight requirements documented per system, and a quarterly AI system review cycle established.

### Workstream 4: Integrated evidence architecture (Weeks 1–10)

All three frameworks were built on a shared SharePoint-based management system — a single risk register, a shared document control system, and a unified internal audit programme covering all three frameworks simultaneously. This eliminated the duplication that would have occurred running three separate programmes sequentially.

## The outcome

At Week 10:
- Essential Eight ML2 assessment completed — all eight controls at ML2, ASD-mapped evidence pack delivered
- ISO 27701 certification audit passed (first-time, zero major nonconformities)
- ISO 42001 certification audit passed (first-time, one minor observation — closed within the audit window)

Both health system procurement submissions were made in Week 11, including the certification certificates, Essential Eight evidence pack, and AI governance documentation.

Both contracts were signed within six weeks of submission.

> "We'd been quoted 14 months and $280k to do three separate programmes. Compliance365 delivered all three as one integrated system in 10 weeks. The approach made sense technically — the frameworks genuinely share a lot of ground — and the outcome was exactly what the procurement panels needed. Both contracts signed."
>
> *— CTO, Health SaaS Provider*

## Key numbers

| | |
|---|---|
| **Timeline** | 10 weeks |
| **Staff size** | 38 |
| **Environment** | Microsoft 365 E5, Azure, Azure OpenAI |
| **Frameworks delivered** | Essential Eight ML2 + ISO 27701 + ISO 42001 |
| **New tools required** | 1 (AvePoint Cloud Backup — Required for E8 Regular Backups) |
| **Certification results** | First-time pass on both ISO audits |
| **Contracts unlocked** | 2 state health system enterprise contracts |
| **Cost vs. separate programmes** | ~55% reduction |
