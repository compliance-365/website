---
title: "ISO 27001 in 12 Weeks — Seed-to-Series-A FinTech Closes Two Enterprise Deals"
summary: "A Brisbane-based B2B payments fintech was losing enterprise deals at the security questionnaire stage. We built a certified ISMS inside Microsoft 365 in 12 weeks. Two contracts signed within 30 days of certification."
date: 2025-11-01
sector: Financial Services
services: ["ISO 27001"]
tags: ["ISO 27001", "FinTech", "Enterprise Sales", "Microsoft 365"]
timeline: "12 weeks"
outcomes:
  - "Certified in 12 weeks"
  - "2 enterprise deals closed post-cert"
  - "0 new tools required"
  - "100% first-time pass"
seo:
  description: "How a Brisbane B2B payments fintech achieved ISO 27001 certification in 12 weeks using Microsoft 365 — and closed two blocked enterprise deals immediately after."
  keywords: ["ISO 27001 fintech australia", "ISO 27001 12 weeks", "ISO 27001 microsoft 365"]
---

## The situation

A Brisbane-based B2B payments fintech — 28 staff, seed-funded, in the process of closing a Series A — had a problem that was directly costing them revenue.

Two enterprise customers: a large superannuation fund and a mid-market retail group. Both had agreed in principle to sign contracts worth a combined $600k ARR. Both were stalled at the security questionnaire stage. Both required ISO 27001 certification as a condition of proceeding.

The founding team had built a solid product on Azure and Microsoft 365, and they had reasonable security hygiene — MFA enforced, endpoint management in Intune, some policy documentation. But they had no ISMS, no documented risk register, no Annex A control set, and no audit trail.

Their previous quote for ISO 27001 from a Big Four firm: $180k and 9 months. At seed stage, that was a deal-breaker.

## What we found

The initial assessment revealed a pattern we see frequently with M365-native SaaS companies: the security controls were largely in place, but the governance layer — the documented policies, risk treatments, procedures, and evidence capture — was missing.

Specifically:

- **Conditional Access and MFA** were configured and working, but not documented as a formal access control policy
- **Intune** was managing endpoints, but there was no asset register, no documented baseline, and no compliance reporting cadence
- **Defender for Cloud Apps** was licensed but unconfigured — a significant gap for a payments business handling sensitive financial data
- **Purview** had basic labels published but no classification policy and no DLP rules
- **Backup coverage** was partial — M365 workloads covered, but Azure databases had no documented backup schedule, no tested restoration procedure, and no RPO/RTO targets
- Risk register: a shared Google Doc with 12 rows. Not linked to Annex A controls, no residual risk ratings, no treatment owners.

The positive finding: approximately 70% of Annex A controls were already technically satisfied through existing M365 configuration. The work was governance uplift, not platform build.

## What we built

The engagement ran across three parallel workstreams over 12 weeks.

### ISMS foundation (Weeks 1–4)

We established the management system architecture inside SharePoint and Planner:

- **ISMS Scope document** defining the certification boundary — the B2B payments platform, supporting Azure infrastructure, and the Brisbane office
- **Information Security Policy** and 22 supporting policies covering access control, incident response, business continuity, supplier security, and acceptable use
- **Risk register** rebuilt from scratch in SharePoint Lists with Annex A mapping, likelihood/impact scoring, residual risk ratings, and treatment owners assigned to specific team members
- **Statement of Applicability** mapping all 93 ISO 27001:2022 Annex A controls to the client's control evidence, with justified exclusions for controls outside scope

### Technical control uplift (Weeks 2–8)

Where technical gaps existed, we configured the controls directly inside the existing M365 and Azure environment:

- Defender for Cloud Apps policies for shadow IT discovery, DLP for financial data, and session controls for high-risk applications
- Purview DLP policies covering payment data egress across Exchange and Teams
- Intune compliance baselines formalised with reporting dashboards and non-compliant device remediation workflow
- Azure Backup configured for all production databases with documented RPO (4h) and RTO (8h) targets and a quarterly restoration test scheduled
- Privileged Identity Management enabled for Azure and M365 admin roles — JIT elevation replacing five standing Global Admin accounts

### Audit preparation (Weeks 8–12)

- Internal audit conducted against all Annex A controls — 14 minor observations raised, all closed before Stage 2
- Management review meeting documented and minuted
- Stage 1 audit completed in Week 10 — zero major nonconformities, two minor observations (both closed within 48 hours)
- Stage 2 audit completed in Week 12 — **first-time pass, zero major nonconformities**

## The outcome

Certification issued on Day 84 of the engagement.

Within 30 days of receiving their certificate, both stalled enterprise deals were restarted and contracts were signed. The combined ARR of those two contracts was $620k — exceeding the full cost of the engagement within the first month of certification.

The team also reported an immediate secondary benefit: the ISO 27001 certification replaced approximately 60% of the security questionnaire workload from enterprise procurement teams, who now accept the certificate as a pre-qualification.

> "We'd been told ISO 27001 was a 9-month, $180k project. Compliance365 did it in 12 weeks for a fraction of that. More importantly, the two deals we'd been waiting on for 5 months were signed within a month of getting the certificate. The ROI was immediate and obvious."
>
> *— CEO, B2B Payments FinTech*

## Key numbers

| | |
|---|---|
| **Timeline** | 12 weeks from kickoff to certification |
| **Staff size** | 28 |
| **Environment** | Microsoft 365 E5, Azure |
| **Annex A controls implemented** | 93 (ISO 27001:2022) |
| **New tools required** | 0 |
| **Stage 2 result** | First-time pass, 0 major NCs |
| **Contracts unlocked** | 2 (combined $620k ARR) |
