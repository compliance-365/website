---
title: "Introducing Checkpoint — the Compliance Console That Never Leaves Your Tenant"
seoTitle: "Introducing Checkpoint — In-Tenant Compliance"
description: "The compliance console we build every engagement on. Every record stored as SharePoint lists in your own tenant — no backend, no third-party platform."
date: 2026-07-09
author: "Compliance365"
tags: ["Checkpoint","ISO 27001","SOC 2","Essential Eight","AI Governance","Risk","Microsoft 365"]
image: "/assets/blog-checkpoint-console-launch.svg"
---

<div style="background:#f9fafb;border-radius:12px;padding:22px 26px;margin:24px 0;box-shadow:0 2px 8px rgba(0,0,0,0.04)">
  <p>Most third-party compliance and GRC platforms ask for the same thing before they're useful: a copy of your riskiest data. Your risk register. Your audit findings. Your control gaps. Uploaded into someone else's SaaS, sitting in someone else's database, subject to someone else's breach notification process — and gone from your view the day you stop paying the licence.</p>
  <p>We built <strong>Checkpoint</strong> because that trade-off shouldn't be necessary. It's a compliance console that runs entirely against your own Microsoft 365 tenant — every register is a SharePoint list you already own, and every posture check reads your live Entra, Intune and Defender signals over Microsoft Graph. Nothing is copied anywhere. There is no backend to breach, because there is no backend.</p>
</div>

<hr style="margin:36px 0;border:0;border-top:1px solid #e5e7eb" />

<h2 style="margin-top:2.2rem;color:#111827;font-size:1.6rem;font-weight:800">
Why we built it
</h2>

<p>Every certification engagement we run hits the same friction point. A client is already paying for Microsoft 365 — Entra ID, SharePoint, Defender, Purview — tools that already hold most of the evidence an auditor wants. And yet the standard advice is to buy a separate third-party GRC platform, re-enter the same risks and controls into a second system, and hope the two never drift apart.</p>

<p>That second system usually wants your data too: risk descriptions, control statuses, sometimes screenshots of your actual security configuration. For organisations pursuing ISO 27001 or SOC 2 specifically <em>because</em> they take data handling seriously, shipping that data offsite to prove it always felt backwards.</p>

<p>Checkpoint is our answer: keep the register where the data already lives.</p>

<hr style="margin:36px 0;border:0;border-top:1px solid #e5e7eb" />

<h2 style="margin-top:2.2rem;color:#111827;font-size:1.6rem;font-weight:800">
What's actually inside
</h2>

<div style="background:#f9fafb;border-radius:12px;padding:16px 20px;margin-top:12px">
  <table style="width:100%;border-collapse:collapse;margin:6px 0 0;font-size:0.96rem">
    <thead style="background:#f3f4f6">
      <tr>
        <th style="text-align:left;padding:10px;border-bottom:2px solid #e5e7eb">Module</th>
        <th style="text-align:left;padding:10px;border-bottom:2px solid #e5e7eb">What it does</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb"><strong>Posture scan</strong></td>
        <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb">22 automated checks against your live tenant — MFA coverage, Conditional Access, PIM usage, guest accounts, device compliance, risky OAuth grants, Secure Score — with an optional scheduled monitor that flags drift daily.</td>
      </tr>
      <tr>
        <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb"><strong>Statement of Applicability</strong></td>
        <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb">A living, per-framework control set — applicability, status, ownership, verification date, evidence link — the document your auditor opens first.</td>
      </tr>
      <tr>
        <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb"><strong>Risk &amp; actions register</strong></td>
        <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb">Scan findings propose risks; approving one creates treatment actions; completing actions recalculates residual risk automatically.</td>
      </tr>
      <tr>
        <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb"><strong>Vendor risk register</strong></td>
        <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb">Records exactly what data each vendor can access and suggests a criticality tier from it — see below.</td>
      </tr>
      <tr>
        <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb"><strong>AI governance</strong></td>
        <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb">An ISO 42001-aligned AI systems register with EU AI Act risk tiers, plus discovery that spots Copilot and other AI apps already consented to in your tenant.</td>
      </tr>
      <tr>
        <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb"><strong>Governance rhythm</strong></td>
        <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb">Internal audit programme, management review records, a compliance calendar and an append-only audit log — clauses 9.2 and 9.3 satisfied continuously, not assembled the week before audit.</td>
      </tr>
      <tr>
        <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb"><strong>Reporting</strong></td>
        <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb">SoA export, audit readiness report, board view, and a time-boxed Auditor Pack your certifier can open without needing a licence.</td>
      </tr>
    </tbody>
  </table>
</div>

<p style="margin-top:16px">Nine frameworks are cross-mapped so the same piece of evidence — an MFA enforcement screenshot, a signed policy — satisfies every framework it's relevant to, once: ISO 27001, SOC 2, Essential Eight, ISO 42001, ISO 27701, DISP/IRAP, IS18 (QGEA), RFFR and NIST CSF.</p>

<hr style="margin:36px 0;border:0;border-top:1px solid #e5e7eb" />

<h2 style="margin-top:2.2rem;color:#111827;font-size:1.6rem;font-weight:800">
The part we think matters most: vendor risk that asks the right question
</h2>

<p>Most vendor risk registers stop at "how critical is this vendor?" — a single dropdown, usually a guess, usually never revisited. That's the wrong first question. The right first question is <strong>what data can this vendor actually touch?</strong> Criticality should follow from that, not substitute for it.</p>

<p>Checkpoint's vendor register asks you to classify what each vendor has access to — health information, customer PII, financial data, credentials and secrets, production systems, employee data, company-confidential material — and suggests a criticality tier from that classification, live, as you tick boxes. A vendor with production system access gets flagged Critical whether or not anyone remembered to think of it that way. The suggestion is never applied automatically; you can always override it. But it means a vendor register actually reflects blast radius instead of a gut feeling from onboarding day.</p>

<blockquote style="background:#FBF0DD;border-left:4px solid #A9812E;padding:12px 18px;border-radius:8px;margin-top:14px">
  <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true" style="vertical-align:-2px;margin-right:5px;color:#A9812E"><use href="#ic-insight"/></svg> The same classification feeds the vendor questionnaire Checkpoint drafts for you — it asks specifically about the data categories you've flagged, storage location and encryption, instead of a generic one-size-fits-all form.
</blockquote>

<hr style="margin:36px 0;border:0;border-top:1px solid #e5e7eb" />

<h2 style="margin-top:2.2rem;color:#111827;font-size:1.6rem;font-weight:800">
How the "no backend" part actually works
</h2>

<p>This is the claim that gets the most scepticism, so it's worth being precise about it:</p>

<ul>
  <li><strong>Sign-in is your own Microsoft account</strong>, via MSAL's redirect flow — Checkpoint never sees or stores your credentials.</li>
  <li><strong>Posture checks are read-only Microsoft Graph calls</strong> made directly from your browser to Microsoft's own API. Write access to SharePoint is a separate consent step, requested only when a register first needs it.</li>
  <li><strong>Every register is a SharePoint list</strong> provisioned into your tenant — risks, actions, controls, evidence index, audit log, vendor register. They inherit your existing permissions, retention policy and version history. Offboarding costs nothing, because the data was always yours.</li>
  <li><strong>The app itself is a static site</strong> with no server-side component: no database to breach, no API that holds a copy of your risk register, nothing to subpoena that isn't already inside your own tenant.</li>
  <li>It ships with a strict Content-Security-Policy, no CDN dependencies at runtime, and content-hashed assets with Subresource Integrity — so what your browser executes is verifiably what we built, every time.</li>
</ul>

<p>The practical result: if you ever stop using Checkpoint, nothing needs to be exported, migrated or deleted from a third-party system, because there never was one. Your risk register was a SharePoint list before Checkpoint touched it, and it still is.</p>

<hr style="margin:36px 0;border:0;border-top:1px solid #e5e7eb" />

<h2 style="margin-top:2.2rem;color:#111827;font-size:1.6rem;font-weight:800">
Who it's for
</h2>

<p>Checkpoint is built for organisations already running on Microsoft 365 who are pursuing — or maintaining — ISO 27001, SOC 2, Essential Eight, ISO 42001, ISO 27701, DISP/IRAP, IS18, RFFR or NIST CSF alignment, and for the consultants who run those engagements for them. It doesn't replace an accredited certification body's audit; it replaces the spreadsheet, the disconnected GRC platform, and the week of evidence-gathering panic before a surveillance audit.</p>

<hr style="margin:36px 0;border:0;border-top:1px solid #e5e7eb" />

<h2 style="margin-top:2.2rem;color:#111827;font-size:1.6rem;font-weight:800">
Try it
</h2>

<p>The demo runs entirely in your browser against sample data — no sign-up, nothing installed, nothing sent anywhere. Or book a 30-minute walkthrough and we'll run a real, read-only posture scan against your own tenant, so you leave with your actual gaps rather than a sales deck.</p>

<div class="card" style="margin-top:24px; display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap;">
  <p class="muted" style="margin:0">See Checkpoint against your own tenant, or explore the live demo first.</p>
  <a class="btn btn-primary" href="/checkpoint-console/">Explore Checkpoint</a>
</div>
