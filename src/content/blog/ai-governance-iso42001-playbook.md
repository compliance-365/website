---
title: "ISO 42001 (AI): A Simple Playbook to Get Audit-Ready"
description: "Stand up an AI management system (AIMS) with model inventory, risk controls, and human oversight — using tools you already own."
date: 2025-10-02
author: "Compliance365"
tags: ["ISO 42001", "AI Governance", "Risk", "Microsoft 365"]
image: "/assets/blog-iso42001.svg"
---

ISO 42001 gives you a **management system for AI** — policies, roles, risk, and monitoring.  
Here’s a lean approach that works for startups and enterprises alike.

## 1) Build a living model inventory
Track **every model** in one list:
- Business purpose, owners, data sources, training set origin
- Model type (LLM, classical ML), deployment surface (app, bot, workflow)
- Risks: safety, bias, privacy, security, legal
- Controls: prompts/guardrails, evaluation, red-team notes
- Status + change history

> Keep it in SharePoint with required columns; export to PDF monthly for evidence.

## 2) Right-size the risk process
For each model:
- **Threats**: jailbreaking, data leakage, bias, hallucination risk, prompt-injection.
- **Controls**: content filters, retrieval isolation, data masking, rate-limits, human-in-the-loop.
- **Testing**: pre-release eval set, abuse cases, red-team results.
- **Decision**: go / no-go with accountable approver.

## 3) Human oversight is a must
Define when **humans have to review** outputs (e.g., safety or financial impact).  
Log approvals in Teams/Approvals and store snapshots in SharePoint.

## 4) Operational monitoring
- Usage metrics & drift indicators
- Incident route for harmful outputs
- Periodic re-evaluation cadence
- Clear rollback/disable procedure

## 5) Evidence with Microsoft 365
- **Power Automate** pulls monthly snapshots: inventories, evaluation results, approvals
- **SharePoint** stores artefacts with retention & versioning
- **Purview** applies sensitivity/retention labels to AI artefacts
- **Entra ID** reports prove role-based access and reviews

**Result:** An AIMS that’s lightweight, auditable, and practical — ready for ISO 42001 certification or vendor questionnaires.
