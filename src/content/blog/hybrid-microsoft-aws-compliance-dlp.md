---
title: "DLP in Purview vs Macie: Compliance When Your Product Isn't in Microsoft 365"
seoTitle: "Compliance When Your Product Runs in AWS"
description: "How the Statement of Applicability, evidence and control mapping work when staff use Microsoft 365 but your product runs in AWS — DLP as the example."
date: 2026-07-28
author: "Compliance365"
tags: ["ISO 27001", "AWS", "Microsoft 365", "Statement of Applicability", "DLP", "Cloud Security", "Australia"]
image: "/assets/blog-hybrid-m365-aws-compliance.svg"
---

<div style="background:#f9fafb;border-radius:12px;padding:24px 28px;margin:24px 0;box-shadow:0 2px 8px rgba(15,23,42,0.04)">
  <p>Almost every piece of compliance guidance out there — ours included, most of the time — quietly assumes one thing: that your organisation's data protection controls live in Microsoft 365. Purview DLP, Conditional Access, Defender. Tidy, tool-native, easy to point an auditor at.</p>
  <p>Real SaaS and technology companies are rarely that tidy. Staff use Microsoft 365 for email, identity and collaboration — but the <strong>product</strong>, the thing that actually generates revenue and holds customer data, runs in AWS, or GCP, or a mix. When that's the case, "just check Purview" stops being an answer.</p>
  <p>This is the exact situation we work through with clients regularly, and the fix isn't a different framework or a bigger platform — it's understanding what your Statement of Applicability is actually for.</p>
</div>

<hr style="margin:36px 0;border:0;border-top:1px solid #e5e7eb" />

<h2 style="color:#111827;font-size:1.6rem;font-weight:800;margin-top:2rem"><span style="display:inline-flex;align-items:center;justify-content:center;min-width:1.6em;height:1.6em;padding:0 .2em;border-radius:6px;background:#A9812E;color:var(--on-gold);font-size:0.62em;font-weight:800;vertical-align:middle;margin-right:10px;font-family:Manrope,system-ui,sans-serif;">1</span> A control asks "what", never "which vendor"</h2>

<p>Take a typical ISO 27001 Annex A control: data loss prevention exists to stop sensitive data leaving the organisation without authorisation. Nowhere does the control — or the auditor assessing it — say that has to be Microsoft Purview. It's a requirement, not a product name. Any organisation still describing its whole control environment in Microsoft-specific tool names is really describing whichever tenant its compliance advisor happened to be most familiar with, not what the standard actually asks for.</p>

<p>Once you separate the requirement from the tool, the fix for a hybrid environment stops being complicated: the requirement stays exactly the same, and you simply record which tool satisfies it <em>for that part of the business</em>.</p>

<h2 style="color:#111827;font-size:1.6rem;font-weight:800;margin-top:2rem"><span style="display:inline-flex;align-items:center;justify-content:center;min-width:1.6em;height:1.6em;padding:0 .2em;border-radius:6px;background:#A9812E;color:var(--on-gold);font-size:0.62em;font-weight:800;vertical-align:middle;margin-right:10px;font-family:Manrope,system-ui,sans-serif;">2</span> The worked example: DLP in two clouds at once</h2>

<div style="background:#f9fafb;border-radius:12px;padding:16px 20px;margin-top:12px">
  <table style="width:100%;border-collapse:collapse;font-size:0.96rem">
    <thead style="background:#f3f4f6">
      <tr>
        <th style="text-align:left;padding:10px;border-bottom:2px solid #e5e7eb">Layer</th>
        <th style="text-align:left;padding:10px;border-bottom:2px solid #e5e7eb">Where it runs</th>
        <th style="text-align:left;padding:10px;border-bottom:2px solid #e5e7eb">DLP tool</th>
        <th style="text-align:left;padding:10px;border-bottom:2px solid #e5e7eb">Evidence source</th>
      </tr>
    </thead>
    <tbody>
      <tr><td style="padding:10px;border-bottom:1px solid #eef2ff">Corporate IT</td><td style="padding:10px;border-bottom:1px solid #eef2ff">Staff email, SharePoint, endpoints</td><td style="padding:10px;border-bottom:1px solid #eef2ff">Microsoft Purview DLP</td><td style="padding:10px;border-bottom:1px solid #eef2ff">Automated — read directly via Graph API</td></tr>
      <tr><td style="padding:10px">Product infrastructure</td><td style="padding:10px">Customer data, S3, application workloads</td><td style="padding:10px">AWS Macie</td><td style="padding:10px">Manual — findings export, sensitive-data discovery job config</td></tr>
    </tbody>
  </table>
</div>

<p style="margin-top:12px;color:#4b5563">Same control. Same Statement of Applicability line. Two tools, because two different parts of the business run on two different platforms — and that's the normal, expected shape of a real SaaS company, not an exception to explain away.</p>

<h2 style="color:#111827;font-size:1.6rem;font-weight:800;margin-top:2rem"><span style="display:inline-flex;align-items:center;justify-content:center;min-width:1.6em;height:1.6em;padding:0 .2em;border-radius:6px;background:#A9812E;color:var(--on-gold);font-size:0.62em;font-weight:800;vertical-align:middle;margin-right:10px;font-family:Manrope,system-ui,sans-serif;">3</span> Three things to actually do about it</h2>

<ul>
  <li><strong>Say it out loud in the Justification field.</strong> Don't leave an auditor to guess why a "Microsoft-flavoured" control reads oddly for an AWS-hosted product. One sentence — "DLP implemented via AWS Macie for the product's data workloads; Purview covers corporate IT" — closes the question before it's asked.</li>
  <li><strong>Accept that product-infrastructure controls will mostly be manual, and that's fine.</strong> An automated posture scan against Microsoft Graph can't see into an AWS account it was never designed to read — that's expected, not a gap. The correct state for that control is "Manual, evidence attached", not a red fail and not a fabricated automated pass.</li>
  <li><strong>Attach the evidence the tool actually produces.</strong> A Macie findings export, an IAM access review, a CloudTrail/GuardDuty summary — whatever the AWS-native equivalent is, it satisfies the control exactly as well as a Purview screenshot would. An auditor cares that the control operates and is evidenced, not which vendor's logo is on the screenshot.</li>
</ul>

<div style="background:#f0fdfa;border-left:4px solid #10b981;padding:16px;border-radius:10px;margin:24px 0">
  <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true" style="vertical-align:-2px;margin-right:5px;color:#10b981"><use href="#ic-target"/></svg> <strong>The pattern generalises.</strong> This isn't just a DLP story. Identity and access, logging, encryption at rest, network segmentation, vulnerability management — any control your advisor has only ever described in Microsoft terms needs the same treatment the moment part of your estate lives somewhere else. Work through the Statement of Applicability once with that lens, control by control, rather than discovering each gap individually when an auditor asks about it.
</div>

<h2 style="color:#111827;font-size:1.3rem;font-weight:800;margin-top:2rem">Why this matters beyond the audit</h2>

<ul>
  <li><strong>Board and customer confidence:</strong> shows security governance actually reflects how the business runs, not a simplified fiction.</li>
  <li><strong>Faster certification:</strong> nothing stalls an audit like a control that doesn't match reality — this heads it off entirely.</li>
  <li><strong>No lock-in pressure:</strong> your compliance posture never becomes a reason you can't run infrastructure where it makes the most technical or commercial sense.</li>
</ul>

<h2 style="color:#111827;font-size:1.3rem;font-weight:800;margin-top:2rem">Next steps</h2>

<p>If your organisation runs Microsoft 365 for the business and something else — AWS, GCP, or both — for the product, and you want a Statement of Applicability that actually reflects that:</p>

<ul>
  <li>Explore our <a href="/services/iso27001">ISO 27001 services</a></li>
  <li>Read <a href="/resources/inside-statement-of-applicability">Inside the Statement of Applicability</a> for how SoA mapping works in general</li>
  <li>Book a <a href="/book/">15-minute intro call</a> to talk through your specific environment</li>
</ul>

<!--
SEO Highlights
Primary: hybrid cloud compliance, AWS Macie DLP, Microsoft Purview vs AWS Macie, ISO 27001 multi-cloud
Supporting: Statement of Applicability AWS, compliance for SaaS on AWS, DLP evidence AWS, non-Microsoft compliance evidence
Intent: "ISO 27001 for AWS", "DLP AWS Macie compliance", "compliance when not using Microsoft 365 for product"
-->
