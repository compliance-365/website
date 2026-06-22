---
title: "SOC 2 Type II + ISO 27001 in 14 Weeks — Network Provider Wins US Enterprise Contracts"
summary: "A Melbourne-based network infrastructure provider needed SOC 2 Type II for US enterprise customers and ISO 27001 for Australian enterprise procurement. We delivered both certifications from a single evidence set in 14 weeks."
date: 2025-10-15
sector: Technology
services: ["SOC 2 Type II", "ISO 27001"]
tags: ["SOC 2", "ISO 27001", "Network Infrastructure", "Enterprise", "Microsoft 365"]
timeline: "14 weeks"
outcomes:
  - "SOC 2 Type II + ISO 27001 in 14 weeks"
  - "Single evidence set for both frameworks"
  - "3 US enterprise contracts unblocked"
  - "40% cost saving vs. sequential"
seo:
  description: "How a Melbourne network infrastructure provider achieved SOC 2 Type II and ISO 27001 simultaneously in 14 weeks — unlocking both US and Australian enterprise procurement from a single evidence set."
  keywords: ["SOC 2 ISO 27001 australia", "SOC 2 type II australian company", "ISO 27001 SOC 2 combined", "network provider compliance"]
---

## The situation

A Melbourne-based network infrastructure and managed connectivity provider — 62 staff — had built a significant business serving mid-market Australian enterprises. In 2024 they began pursuing US expansion, targeting mid-market US enterprises in financial services and professional services sectors.

The US pipeline moved fast — but hit a wall at security review. Three US enterprise deals (combined first-year contract value of approximately USD $1.8M) were all stalled waiting for SOC 2 Type II. US enterprise procurement teams, particularly in financial services, treat SOC 2 Type II as a minimum baseline that replaces lengthy vendor security questionnaires.

At the same time, their Australian enterprise pipeline had its own compliance demand: ISO 27001 was appearing increasingly in Australian enterprise RFTs and panel qualification requirements. Two significant Australian contracts were also progressing but had ISO 27001 as a qualification criterion.

The client initially approached the two certifications as separate projects — their advisors had quoted SOC 2 and ISO 27001 as sequential engagements, with a combined timeline of 18+ months and a cost north of $200k.

## Why combined delivery makes sense

SOC 2 and ISO 27001 share a significant control overlap — approximately 65–70% of the underlying security controls are required by both frameworks. The difference is primarily in structure and evidence format:

- **ISO 27001** is a management system standard — it requires an ISMS with a risk-based control selection process, an Annex A control set, documented policies, and a formal audit by an accredited certification body
- **SOC 2** is a reporting framework — it requires a CPA-firm audit across five Trust Service Criteria (Security, Availability, Confidentiality, Processing Integrity, Privacy), with the audit covering a defined observation period (typically 6–12 months for Type II)

The key insight: if you build the controls and evidence correctly for ISO 27001, the same evidence satisfies the majority of SOC 2's requirements. The additional SOC 2 work — primarily structuring evidence for the TSC format, working with the CPA auditor, and ensuring the observation period is covered — is marginal compared to the full control-building effort.

Running them sequentially means building the same controls twice and paying for two rounds of evidence assembly. Running them together means building once and certifying twice.

## What we built

The 14-week engagement was structured across three phases.

### Phase 1: Assessment and design (Weeks 1–3)

Current-state assessment across all ISO 27001 Annex A controls and SOC 2 Trust Service Criteria. The network provider had strong operational security — their managed services background meant they had real security discipline. The gaps were primarily in governance documentation and formal evidence capture, not in technical controls.

**Key gaps identified:**
- No formal ISMS scope, policy hierarchy, or management review process
- No risk register — risks were managed informally by the technical leadership team
- Change management existed operationally but wasn't documented to the standard ISO 27001 requires
- Vendor risk management: suppliers and sub-processors were vetted informally with no documented assessment process
- Availability monitoring was mature (NOC with 24/7 monitoring) but not formally documented as a control aligned to SOC 2 Availability criteria
- No formal user access review cycle — accounts were provisioned and deprovisioned, but no periodic review process

### Phase 2: Build (Weeks 4–10)

**ISMS build (ISO 27001 foundation):**
- ISMS Scope document, Information Security Policy, and 26 supporting policies
- Risk register built in SharePoint Lists covering information assets, threat catalogue, likelihood/impact ratings, and treatment plans linked to Annex A controls
- Statement of Applicability covering all 93 ISO 27001:2022 Annex A controls
- Supplier assessment process and standard DPA template for sub-processors
- Quarterly access review process implemented via Entra ID Access Reviews

**SOC 2 Trust Service Criteria mapping:**
- Security (CC) — mapped to ISO 27001 Annex A controls, all with M365 evidence sources
- Availability (A) — NOC processes documented formally; uptime SLAs evidenced against monitoring dashboards; incident response procedures updated
- Confidentiality (C) — Purview sensitivity labels deployed and DLP policies configured for confidential customer data
- Processing Integrity (PI) — change management process documented and linked to ServiceNow change records as evidence

**Technical control uplifts (M365-native):**
- Entra ID PIM deployed for all admin roles — JIT elevation replacing eight standing admin accounts
- Intune compliance policies formalised with reporting dashboards and a documented non-compliance workflow
- Purview DLP policies covering customer network configuration data across Exchange and Teams
- Microsoft Sentinel deployed for log centralisation, with SIEM alert rules covering the SOC 2 monitoring requirements
- Azure Backup tested restoration completed with documented RPO (1h) and RTO (4h) targets

### Phase 3: Audit preparation and certification (Weeks 11–14)

**ISO 27001:**
- Internal audit conducted — 11 observations, all closed before Stage 1
- Stage 1 audit (Week 12): zero major nonconformities
- Stage 2 audit (Week 14): **first-time pass, zero major nonconformities, one minor observation** (evidence reference formatting — closed same day)

**SOC 2 Type II:**
The SOC 2 observation period began at engagement kickoff (Week 1). The CPA firm conducted their Type II audit in Weeks 12–14, covering the 12-week observation period.

- SOC 2 Type II report issued: **no exceptions noted across Security, Availability, and Confidentiality criteria**
- Processing Integrity: one exception noted for a change management gap in Week 2 (before the formal process was deployed) — documented as a finding with remediation evidence

## The outcome

Both certificates in hand by Week 14.

The three US enterprise deals — which had been stalled for an average of seven months — were all restarted within two weeks of the SOC 2 report being issued. Two contracts were signed within 45 days. The third required additional security review at the US client's CISO level; that process was completed at Week 22 and the contract was signed.

On the Australian side, both ISO 27001-gated Australian enterprise contracts progressed through procurement after certification and were signed within 60 days.

Total combined first-year contract value unlocked: AUD $4.2M (across Australian and US contracts).

The combined engagement cost approximately 40% less than the sequential approach would have — the single evidence set eliminated duplication across both policy development and audit coordination.

> "We'd been told to do SOC 2 first, then ISO 27001 — 18 months of work. Compliance365 showed us they share most of the same control base and delivered both in 14 weeks. The US deals had been stuck for months. Within six weeks of the SOC 2 report, two of them were signed."
>
> *— CEO, Network Infrastructure Provider*

## Key numbers

| | |
|---|---|
| **Timeline** | 14 weeks |
| **Staff size** | 62 |
| **Environment** | Microsoft 365 E5, Azure, AWS (for some customer workloads) |
| **Frameworks delivered** | ISO 27001:2022 + SOC 2 Type II (Security, Availability, Confidentiality) |
| **New tools required** | 0 (Microsoft Sentinel, already licensed under E5) |
| **ISO 27001 Stage 2 result** | First-time pass, 1 minor observation |
| **SOC 2 Type II result** | No exceptions (Security + Availability + Confidentiality) |
| **Cost vs. sequential** | ~40% reduction |
| **Contracts unlocked** | AUD $4.2M combined first-year value |
