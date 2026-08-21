---
title: "ISO 42001 (AI Governance): A Simple, Business-Ready Playbook"
seoTitle: "ISO 42001 AI Governance: A Business Playbook"
description: "A practical guide to implementing ISO 42001 AI governance using tools you already have — Microsoft 365, SharePoint and simple workflows."
date: 2025-10-17
author: "Compliance365"
tags: ["ISO 42001", "AI Governance", "Risk", "Microsoft 365", "AIMS", "Artificial Intelligence"]
image: "/assets/blog-iso42001-v2.svg"
lastModified: 2026-08-21
---

<div style="background:#f9fafb;border-radius:12px;padding:24px 28px;margin:24px 0;box-shadow:0 2px 8px rgba(0,0,0,0.04)">
  <p><strong>ISO 42001</strong> is the world’s first AI management standard. Think of it as the AI version of ISO 27001 — focused not on technology, but on <strong>trust, control, and responsible use</strong>.</p>

  <p>It helps organisations answer the questions that boards, customers, and regulators now ask:</p>

  <p style="font-size:1.05rem"><em>“What AI tools do we use?” “Who is responsible?” “Where does our data go?” “What could go wrong?” “How do we stay in control?”</em></p>

  <p>This article explains how any organisation can become <strong>ISO 42001-ready in weeks</strong> using Microsoft 365, SharePoint, and simple workflows — without a third-party platform.</p>
</div>

<hr style="margin:36px 0;border:0;border-top:1px solid #e5e7eb" />

<h2 style="color:#111827;font-size:1.6rem;font-weight:800;margin-top:2rem"><span style="display:inline-flex;align-items:center;justify-content:center;min-width:1.6em;height:1.6em;padding:0 .2em;border-radius:6px;background:#A9812E;color:#fff;font-size:0.62em;font-weight:800;vertical-align:middle;margin-right:10px;font-family:Manrope,system-ui,sans-serif;">1</span> Build a simple, living register of all AI tools</h2>

<p>Most organisations don’t actually know:</p>

<ul>
  <li>What AI is being used</li>
  <li>Who approved it</li>
  <li>What data it touches</li>
  <li>How risky it is</li>
</ul>

<p>ISO 42001 starts by fixing that with an <strong>AI Register</strong> — your single source of truth.</p>

<div style="background:#f9fafb;border-radius:12px;padding:16px 20px;margin-top:12px">
  <table style="width:100%;border-collapse:collapse;font-size:0.96rem">
    <thead style="background:#f3f4f6">
      <tr>
        <th style="text-align:left;padding:10px;border-bottom:2px solid #e5e7eb">Field</th>
        <th style="text-align:left;padding:10px;border-bottom:2px solid #e5e7eb">What this means</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb"><strong>AI tool / model name</strong></td>
        <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb">The name of the AI tool, model, or feature in use.</td>
      </tr>
      <tr>
        <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb"><strong>Business purpose</strong></td>
        <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb">What it’s used for in the business (e.g. support, summarising, triage).</td>
      </tr>
      <tr>
        <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb"><strong>Type of data involved</strong></td>
        <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb">Whether it touches customer data, internal docs, personal data, etc.</td>
      </tr>
      <tr>
        <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb"><strong>Business owner / accountable person</strong></td>
        <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb">Who is responsible for how this AI is used and kept under control.</td>
      </tr>
      <tr>
        <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb"><strong>Key risks</strong></td>
        <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb">Main things that could go wrong (e.g. data leakage, bias, wrong advice).</td>
      </tr>
      <tr>
        <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb"><strong>Controls / guardrails</strong></td>
        <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb">How those risks are managed (approvals, access limits, training, policies).</td>
      </tr>
      <tr>
        <td style="padding:8px 10px"><strong>Date of last review</strong></td>
        <td style="padding:8px 10px">When this AI use case was last checked and signed off.</td>
      </tr>
    </tbody>
  </table>
</div>

<p><strong>In practice:</strong> A basic SharePoint list or Power Apps form that supports versioning, is easy for teams to update, and can be exported monthly for audit evidence.</p>

<blockquote style="background:#eef2ff;border-left:4px solid #4f46e5;padding:12px 18px;border-radius:8px">
  <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true" style="vertical-align:-2px;margin-right:5px;color:#4f46e5"><use href="#ic-insight"/></svg> <strong>Tip:</strong> Keep the register simple. It’s a governance tool, not a technical inventory.
</blockquote>

<hr style="margin:36px 0;border:0;border-top:1px solid #e5e7eb" />

<h2 style="color:#111827;font-size:1.6rem;font-weight:800;margin-top:2rem"><span style="display:inline-flex;align-items:center;justify-content:center;min-width:1.6em;height:1.6em;padding:0 .2em;border-radius:6px;background:#A9812E;color:#fff;font-size:0.62em;font-weight:800;vertical-align:middle;margin-right:10px;font-family:Manrope,system-ui,sans-serif;">2</span> Use a clear, business-friendly AI risk process</h2>

<p>ISO 42001 does not require complex risk mathematics or data science. It expects you to:</p>

<ul>
  <li>Understand where AI could cause harm or confusion</li>
  <li>Decide what safeguards you will put in place</li>
  <li>Review those decisions regularly</li>
</ul>

<p>A simple approach that works across most organisations uses four risk areas:</p>

<div style="background:#f9fafb;border-radius:12px;padding:16px 20px;margin-top:12px">
  <table style="width:100%;border-collapse:collapse;font-size:0.96rem">
    <thead style="background:#f3f4f6">
      <tr>
        <th style="text-align:left;padding:10px;border-bottom:2px solid #e5e7eb">Risk Area</th>
        <th style="text-align:left;padding:10px;border-bottom:2px solid #e5e7eb">What This Means</th>
        <th style="text-align:left;padding:10px;border-bottom:2px solid #e5e7eb">Example Controls</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb"><strong>Data Exposure</strong></td>
        <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb">Could information be leaked, misused, or sent somewhere unintended?</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb">Approved data sources, access controls, data-loss prevention rules</td>
      </tr>
      <tr>
        <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb"><strong>Fairness &amp; Bias</strong></td>
        <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb">Could the AI treat people unfairly or reinforce bias?</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb">Human review, diverse test scenarios, clear escalation rules</td>
      </tr>
      <tr>
        <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb"><strong>Accuracy &amp; Reliability</strong></td>
        <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb">Could the AI produce misleading, incomplete, or confusing results?</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb">Validation checks, human approval, fallback to manual processes</td>
      </tr>
      <tr>
        <td style="padding:8px 10px"><strong>Legal &amp; Ethical</strong></td>
        <td style="padding:8px 10px">Is this use of AI consistent with law, policy, and company values?</td>
        <td style="padding:8px 10px">Privacy review, acceptable use policy, clear limits on use</td>
      </tr>
    </tbody>
  </table>
</div>

<blockquote style="background:#ecfdf5;border-left:4px solid #10b981;padding:12px 18px;margin-top:14px;border-radius:8px">
  <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true" style="vertical-align:-2px;margin-right:5px;color:#10b981"><use href="#ic-check-seal"/></svg> <strong>Outcome:</strong> A practical risk record for every AI tool — understandable by any manager and easy to review quarterly.
</blockquote>

<hr style="margin:36px 0;border:0;border-top:1px solid #e5e7eb" />

<h2 style="color:#111827;font-size:1.6rem;font-weight:800;margin-top:2rem"><span style="display:inline-flex;align-items:center;justify-content:center;min-width:1.6em;height:1.6em;padding:0 .2em;border-radius:6px;background:#A9812E;color:#fff;font-size:0.62em;font-weight:800;vertical-align:middle;margin-right:10px;font-family:Manrope,system-ui,sans-serif;">3</span> Make sure humans stay in control</h2>

<p>ISO 42001 expects you to show where AI is allowed to act on its own and where humans must approve decisions. The principle is simple: <strong>no unsupervised AI for high-impact decisions</strong>.</p>

<p>For each AI use case, decide:</p>
<ul>
  <li>Can this run fully automated?</li>
  <li>Does a human need to review and approve the output?</li>
  <li>How is that approval recorded?</li>
</ul>

<div style="background:#f9fafb;border-radius:12px;padding:16px 20px;margin-top:12px">
  <table style="width:100%;border-collapse:collapse;font-size:0.96rem">
    <thead style="background:#f3f4f6">
      <tr>
        <th style="text-align:left;padding:10px;border-bottom:2px solid #e5e7eb">Scenario</th>
        <th style="text-align:left;padding:10px;border-bottom:2px solid #e5e7eb">Human Oversight?</th>
        <th style="text-align:left;padding:10px;border-bottom:2px solid #e5e7eb">Reason</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb">AI drafts internal marketing copy</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb">Optional</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb">Low impact and easily corrected</td>
      </tr>
      <tr>
        <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb">AI responds directly to customers</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb">Yes</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb">Reputation, accuracy, and tone risk</td>
      </tr>
      <tr>
        <td style="padding:8px 10px">AI recommends financial or safety-related decisions</td>
        <td style="padding:8px 10px">Yes</td>
        <td style="padding:8px 10px">High business, legal, and human impact</td>
      </tr>
    </tbody>
  </table>
</div>

<p><strong>How to track approvals:</strong> Use Microsoft Teams Approvals or Power Automate approval flows and store results in SharePoint. This automatically creates audit-ready evidence.</p>

<blockquote style="background:#fef3c7;border-left:4px solid #f59e0b;padding:12px 18px;border-radius:8px">
  <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true" style="vertical-align:-2px;margin-right:5px;color:#f59e0b"><use href="#ic-compass"/></svg> <strong>Goal:</strong> Clear records showing who approved what — and why.
</blockquote>

<hr style="margin:36px 0;border:0;border-top:1px solid #e5e7eb" />

<h2 style="color:#111827;font-size:1.6rem;font-weight:800;margin-top:2rem"><span style="display:inline-flex;align-items:center;justify-content:center;min-width:1.6em;height:1.6em;padding:0 .2em;border-radius:6px;background:#A9812E;color:#fff;font-size:0.62em;font-weight:800;vertical-align:middle;margin-right:10px;font-family:Manrope,system-ui,sans-serif;">4</span> Monitor AI behaviour and issues</h2>

<p>AI governance is ongoing, not a one-off exercise. ISO 42001 expects you to monitor how AI is used and how it behaves over time.</p>

<p><strong>A simple monitoring plan might include:</strong></p>
<ul>
  <li>Reviewing usage logs for unusual patterns</li>
  <li>Collecting user feedback on AI behaviour</li>
  <li>Investigating unexpected or harmful outputs</li>
  <li>Routing serious issues through your existing incident process</li>
  <li>Maintaining a “kill switch” so risky tools can be switched off quickly</li>
</ul>

<div style="background:#f9fafb;border-radius:12px;padding:16px 20px;margin-top:12px">
  <strong>Useful KPIs to track:</strong>
  <ul style="margin:8px 0 0 20px">
    <li>Number of approved AI tools in use</li>
    <li>Percentage of tools with up-to-date risk assessments</li>
    <li>Number of AI-related incidents logged</li>
    <li>Average time to resolve AI-related issues</li>
  </ul>
</div>

<hr style="margin:36px 0;border:0;border-top:1px solid #e5e7eb" />

<h2 style="color:#111827;font-size:1.6rem;font-weight:800;margin-top:2rem"><span style="display:inline-flex;align-items:center;justify-content:center;min-width:1.6em;height:1.6em;padding:0 .2em;border-radius:6px;background:#A9812E;color:#fff;font-size:0.62em;font-weight:800;vertical-align:middle;margin-right:10px;font-family:Manrope,system-ui,sans-serif;">5</span> Automate evidence using Microsoft 365</h2>

<p>ISO 42001 does not require you to create endless manual documents. Most evidence can be generated automatically from tools you already use.</p>

<ul>
  <li><strong>SharePoint:</strong> Version history shows when registers, policies, and assessments were updated.</li>
  <li><strong>Teams Approvals:</strong> Proves human oversight for key decisions.</li>
  <li><strong>Power Automate:</strong> Schedules monthly exports of AI registers, approvals, and logs into evidence libraries.</li>
  <li><strong>Entra ID:</strong> Provides access logs and role reviews to support “least privilege”.</li>
  <li><strong>Defender for Cloud Apps:</strong> Can alert on unapproved AI tools or risky SaaS usage.</li>
</ul>

<blockquote style="background:#ecfdf5;border-left:4px solid #10b981;padding:12px 18px;border-radius:8px;margin-top:14px">
  <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true" style="vertical-align:-2px;margin-right:5px;color:#10b981"><use href="#ic-insight"/></svg> <strong>Result:</strong> Over 80% of required audit evidence can be automated using your existing Microsoft 365 environment.
</blockquote>

<hr style="margin:36px 0;border:0;border-top:1px solid #e5e7eb" />

<h2 style="color:#111827;font-size:1.6rem;font-weight:800;margin-top:2rem"><span style="display:inline-flex;align-items:center;justify-content:center;min-width:1.6em;height:1.6em;padding:0 .2em;border-radius:6px;background:#A9812E;color:#fff;font-size:0.62em;font-weight:800;vertical-align:middle;margin-right:10px;font-family:Manrope,system-ui,sans-serif;">6</span> Be transparent — internally and externally</h2>

<p>Transparency builds trust and reduces confusion for staff, customers, and regulators.</p>

<p><strong>Examples of good transparency:</strong></p>
<ul>
  <li>Plain-language “AI Use Statements” describing what each tool does and where it is used</li>
  <li>Intranet pages that explain how AI fits into business processes</li>
  <li>Short training modules on safe and responsible AI use</li>
  <li>Public contact details or feedback channels for high-impact AI systems</li>
</ul>

<blockquote style="background:#eef2ff;border-left:4px solid #4f46e5;padding:12px 18px;border-radius:8px">
  <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true" style="vertical-align:-2px;margin-right:5px;color:#4f46e5"><use href="#ic-chat"/></svg> <strong>Reminder:</strong> Transparency doesn’t require exposing the code — it’s about clarity of purpose, control, and accountability.
</blockquote>

<hr style="margin:36px 0;border:0;border-top:1px solid #e5e7eb" />

<h2 style="color:#111827;font-size:1.6rem;font-weight:800;margin-top:2rem"><span style="display:inline-flex;align-items:center;justify-content:center;min-width:1.6em;height:1.6em;padding:0 .2em;border-radius:6px;background:#A9812E;color:#fff;font-size:0.62em;font-weight:800;vertical-align:middle;margin-right:10px;font-family:Manrope,system-ui,sans-serif;">7</span> A realistic 12-week roadmap to ISO 42001 readiness</h2>

<p>You don’t need a 12-month program to get started. Many organisations can become ISO 42001-ready in around three months.</p>

<div style="background:#f9fafb;border-radius:12px;padding:16px 20px;margin-top:12px">
  <strong>Example roadmap:</strong>
  <ul style="margin:8px 0 0 20px">
    <li><strong>Weeks 1–2:</strong> Define AI policy, roles, and an AI governance group.</li>
    <li><strong>Weeks 3–6:</strong> Build the AI Register and introduce a simple AI risk assessment process.</li>
    <li><strong>Weeks 7–10:</strong> Implement human oversight, monitoring, and automated evidence capture.</li>
    <li><strong>Weeks 11–12:</strong> Conduct a readiness review, close gaps, and finalise key AIMS documentation.</li>
  </ul>
</div>

<p style="margin-top:12px;color:#4b5563">
Most of the work involves organising information, clarifying responsibilities, and using existing tools more effectively — not buying new platforms.
</p>

<hr style="margin:36px 0;border:0;border-top:1px solid #e5e7eb" />

<h2 style="color:#111827;font-size:1.6rem;font-weight:800;margin-top:2rem">Why this matters</h2>

<p>The honest version, with real numbers rather than vague reassurance: <strong>88% of organisations now use AI in at least one business function, but only 8% have a comprehensive governance framework</strong>. IBM's breach data puts a sharper edge on that gap — 63% of breached organisations either have no AI governance policy, or one that's still being written. That's the population most companies are sitting in right now, whether or not anyone's said so out loud.</p>

<p style="color:#4b5563">Worth being precise about Australia specifically, since it changes what "regulatory readiness" actually means here: the government's National AI Plan (December 2025) confirmed there will be <strong>no standalone AI Act</strong> — AI is governed through existing law, sector regulators (APRA, ASIC, the OAIC) and the National AI Centre's voluntary guidance instead. So this isn't about a law that's coming for you. It's that enterprise procurement, insurers, and EU-domiciled customers are already asking for exactly this evidence today, law or no law — and vendor questionnaires (CAIQ, SIG Lite) now carry a dedicated AI section that checks alignment to ISO 42001 by name.</p>

<ul>
  <li><strong>Board confidence:</strong> Demonstrates that AI is being managed, not left to chance — and that you're not part of the 92% still figuring it out.</li>
  <li><strong>Customer trust:</strong> Helps you answer AI-related questions in RFPs and due diligence with evidence, not assurances.</li>
  <li><strong>Procurement readiness:</strong> Positions you for the AI section that's already in your buyers' questionnaires — not a hypothetical future law.</li>
  <li><strong>Operational clarity:</strong> Reduces confusion, duplication, and AI "shadow IT".</li>
</ul>

<div style="background:#f0fdfa;border-left:4px solid #10b981;padding:16px;border-radius:10px;margin:24px 0">
  <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true" style="vertical-align:-2px;margin-right:5px;color:#10b981"><use href="#ic-target"/></svg> <strong>Bottom line:</strong> ISO 42001 isn't a technical audit — it's a trust framework. If your organisation uses AI today, this is the simplest way to stay in control and show responsible governance to customers, insurers, and your own team, regardless of what any regulator ends up requiring.
</div>

<h2 style="color:#111827;font-size:1.3rem;font-weight:800;margin-top:2rem">Next steps</h2>

<p>If you want help standing up an AI governance framework or becoming ISO 42001-ready:</p>

<ul>
  <li>Explore our <a href="/services/iso42001">ISO 42001 services</a></li>
  <li>Try the <a href="/checklist/iso42001">ISO 42001 readiness checklist</a></li>
  <li>Book a <a href="/book/">15-minute intro call</a> to map your path to certification</li>
</ul>

<!--
SEO Highlights
Primary: ISO 42001 AI governance, ISO 42001 readiness, AI management system AIMS, responsible AI framework
Supporting: AI register, AI risk assessment, Microsoft 365 evidence for ISO 42001, AI governance Australia
Intent: “How to prepare for ISO 42001”, “AI governance framework for business”, “Audit-ready AI in Microsoft 365”
-->
