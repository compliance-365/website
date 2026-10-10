---
title: "ISM September 2026: AI Agents, App Consent and Threat Hunting — What Changed"
seoTitle: "ISM September 2026 Changes: What to Do Now"
description: "The September 2026 ISM treats AI agents as identities, stops staff approving third-party apps and sets threat hunting every three months. What to change in Microsoft 365."
date: 2026-10-10
author: "Compliance365"
tags: ["ISM", "DISP", "IRAP", "AI Governance", "Microsoft 365", "Australia"]
image: "/assets/illus-disp-ism-irap.svg"
---

<div style="background:#FAF7F1;border-radius:12px;padding:22px 26px;margin:24px 0;box-shadow:0 2px 8px rgba(0,0,0,0.04)">
  <p>ASD's September 2026 release of the Information Security Manual (ISM) is one of the larger updates in recent years. Commentary counts 44 new controls, two rescinded and more than a hundred amended.</p>
  <p>Three themes matter most for organisations running Microsoft 365: identities that aren't people (including AI agents), who may approve third-party apps, and how often you look for attackers already inside. This post covers what changed and what to do about it.</p>
</div>

<hr style="margin:36px 0;border:0;border-top:1px solid #DDD8CF" />

## Who this affects

The ISM is written for Australian Government entities, but its reach is wider. It is the control set behind IRAP assessments, DISP membership and many government and defence supply-chain contracts. If a contract, panel or assessor refers to "the ISM", it means the current release, so these changes will start appearing in questionnaires and assessments.

## 1. Users can no longer approve third-party apps

A new control recommends that staff be **prevented from granting consent to third-party OAuth applications**. Only an authorised administrator should grant that consent. A second new control says those consents and their permissions should be **reviewed at least every six months**, with unused apps and excessive permissions revoked.

This closes a common gap. In many Microsoft 365 tenants, any user can click "Accept" on an app that asks to read their mail or files. That's how consent-phishing attacks get a foothold without stealing a password.

**In Microsoft 365:**

- In Entra ID, set user consent for applications to **not allowed**, and turn on the **admin consent workflow** so staff can still request an app and an administrator decides.
- Export the list of enterprise applications and their granted permissions, remove what nobody uses, and diarise the review every six months. Keep the export as your evidence.

The same release also says the **OAuth device code flow** should be disabled unless it is needed, and restricted to authorised accounts and managed devices where it is. A Conditional Access policy that blocks the device code authentication flow does this.

## 2. Applications, workloads and AI agents are identities too

The release extends identity controls to things that aren't people:

- Applications and workloads should prefer **short-lived, dynamically issued credentials** over long-lived static ones.
- Any static credentials that remain should be held in a **secrets management solution**, not in scripts, config files or spreadsheets.
- Each **AI agent** should have its own identity, and agents should be recorded in a **register**. Commentary on the new controls lists what the register holds: a unique identifier, the agent's owner and business purpose, the identities and credentials it uses, and the tools, permissions and data it can reach.
- Agentic AI applications should be limited to the **minimum tools and permissions** they need.

**In practice:**

- Use managed identities where Azure supports them, and Azure Key Vault (or your existing vault) for the secrets that remain.
- Don't let an agent borrow a person's account. Give it its own identity, so its actions are logged as its own and its access can be removed without touching anyone's login.
- Start the agent register now, even if it has two rows. It is the same discipline as an asset register, and if you are working towards ISO 42001 it doubles as part of your AI system inventory.

This builds on the June 2026 release, which added controls for AI systems and AI-assisted development.

## 3. Threat hunting at least every three months

The release says **threat hunting should be conducted at least every three months**, informed by current threat intelligence. Threat hunting means actively looking for signs an attacker is already in your environment, rather than waiting for an alert.

For a smaller organisation this doesn't need a dedicated team. A quarterly, documented hunt works: pick current threat intelligence (an ASD advisory, say), run the matching queries in Microsoft Defender or Sentinel, and record what you looked for, what you found and what you did. The record is what an assessor will ask for.

## What to do this quarter

1. **Turn off user consent** for third-party apps and turn on the admin consent workflow.
2. **Review existing app consents**, revoke what isn't needed, and book the next review in six months.
3. **Block device code flow** unless you have a documented need for it.
4. **Find static secrets** in scripts and automation, and move them to a vault.
5. **Start an AI agent register** and give each agent its own identity.
6. **Schedule a quarterly threat hunt** and decide where its record lives.

Check the exact wording of each control in the ISM itself before you update your Statement of Applicability. The ASD changes document below lists every new and amended control.

If you are preparing for an IRAP assessment or DISP membership and want a second pair of eyes on these changes, see our [DISP, ISM and IRAP service](/services/disp-ism-irap/). [Checkpoint](/checkpoint-console/) keeps the registers, reviews and evidence these controls ask for in your own Microsoft 365.

<hr style="margin:36px 0;border:0;border-top:1px solid #DDD8CF" />

**Sources**

- ASD, [Information Security Manual: September 2026 changes](https://www.cyber.gov.au/sites/default/files/2026-08/ISM%20September%202026%20changes%20%28September%202026%29.pdf) (admin-only app consent, six-monthly consent review, device code flow, threat hunting every three months)
- Cybernion, [ISM September 2026 changes explained](https://cybernion.com.au/insights/ism-september-2026-changes/) (control counts, short-lived credentials, secrets management)
- Sorami, [ISM AI agent controls: September 2026](https://www.sorami.com.au/guides/asd-ism-september-2026-ai-agent-controls/) (agent identity, register contents, least privilege)
- TERESEC, [ISM September 2026: what changed](https://teresec.com.au/blog/2026-09-17-ism-september-2026-update)

*Last reviewed 10 October 2026.*
