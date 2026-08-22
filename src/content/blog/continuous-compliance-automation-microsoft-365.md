---
title: "Continuous Compliance Is Not a Slogan — Here's What It Actually Looks Like Inside Microsoft 365"
seoTitle: "Continuous Compliance Inside Microsoft 365"
description: "Most 'continuous compliance' claims are marketing. Here's the literal mechanism — scheduled scans, drift alerts, and automated chasing, inside your own tenant."
date: 2026-08-22
author: "Compliance365"
tags: ["Automation", "Microsoft 365", "ISMS", "Governance", "Continuous Monitoring"]
---

<div style="background:#f9fafb;border-radius:12px;padding:22px 26px;margin:24px 0;box-shadow:0 2px 8px rgba(0,0,0,0.04)">
  <p>"Continuous compliance" gets used by almost every GRC vendor as a slogan and almost none as a literal description. Most compliance programs are still, mechanically, a point-in-time exercise — a scramble every 12 months to reconstruct evidence nobody kept current in between.</p>
  <p>This post skips the marketing framing and describes the actual mechanism: what runs unattended, on what schedule, where the data goes, and who gets told what — inside <a href="https://www.compliance365.com.au/checkpoint-console/">Checkpoint</a>, running entirely in your own Microsoft 365 tenant.</p>
</div>

<hr style="margin:36px 0;border:0;border-top:1px solid #e5e7eb" />

## The default state most organisations are actually in

A control gets marked "Implemented" at certification time, evidence gets attached, and then — nothing checks it again until the next audit cycle. A vendor's SOC 2 report expires quietly. An overdue remediation action sits in a spreadsheet with an owner's name against it that nobody follows up. None of this is negligence; it's just what happens when the only thing driving a re-check is a human remembering to look.

Auditors read this pattern correctly: a control that hasn't been re-verified in fourteen months reads the same as one that was never properly implemented, regardless of what actually happened in between.

## What actually runs on a schedule

An optional Azure Function — deployed into **your own** Azure subscription, not ours — re-runs the same posture checks the interactive app runs, daily, with no browser open and no user signed in:

<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px;margin:24px 0;">
  <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px;">
    <div style="margin-bottom:8px;color:#A9812E;"><svg viewBox="0 0 16 16" width="22" height="22" aria-hidden="true"><use href="#ic-pulse"/></svg></div>
    <strong style="display:block;margin-bottom:4px;color:#0f172a;">Daily posture re-scan</strong>
    <p style="margin:0;font-size:0.875rem;color:#64748b;">Reads live Entra, Intune and Defender signals and writes a new scored scan record — the same evidence trail as a manual scan, on autopilot.</p>
  </div>
  <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px;">
    <div style="margin-bottom:8px;color:#A9812E;"><svg viewBox="0 0 16 16" width="22" height="22" aria-hidden="true"><use href="#ic-warning"/></svg></div>
    <strong style="display:block;margin-bottom:4px;color:#0f172a;">Drift alerts</strong>
    <p style="margin:0;font-size:0.875rem;color:#64748b;">A check that scored pass yesterday and fails today raises an alert the moment it happens — not at next quarter's review.</p>
  </div>
  <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px;">
    <div style="margin-bottom:8px;color:#A9812E;"><svg viewBox="0 0 16 16" width="22" height="22" aria-hidden="true"><use href="#ic-clock"/></svg></div>
    <strong style="display:block;margin-bottom:4px;color:#0f172a;">Overdue-work chasing</strong>
    <p style="margin:0;font-size:0.875rem;color:#64748b;">Overdue remediation actions, controls due for re-verification, stalled policy attestation campaigns — each raised as its own alert, once, until acknowledged.</p>
  </div>
  <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px;">
    <div style="margin-bottom:8px;color:#A9812E;"><svg viewBox="0 0 16 16" width="22" height="22" aria-hidden="true"><use href="#ic-briefcase"/></svg></div>
    <strong style="display:block;margin-bottom:4px;color:#0f172a;">Vendor review chasing</strong>
    <p style="margin:0;font-size:0.875rem;color:#64748b;">A vendor's reassessment due date, or the expiry of the SOC 2 report / certificate you're relying on for them, gets chased the same way — 30 days ahead, and again if it's missed.</p>
  </div>
</div>

Findings land in the same alerts register the interactive app already shows on the Dashboard — and, as of this week, can also post straight into a Microsoft Teams channel, so the people who need to see it see it where they're already working, not in an inbox they check once a day.

## Where the evidence actually goes

Every one of those scheduled scans writes to the same SharePoint lists your interactive sessions write to — in your own tenant, not ours. There's no separate "automation database" to reconcile against your manual records, because there's only ever one record. Evidence behind each check is hashed (SHA-256) at the moment it's captured, so what an auditor is shown a year later is provably the same thing the scan actually saw, not a document that could have been edited in between.

## What this replaces

<div style="background:#eff6ff;border-left:4px solid #1e40af;border-radius:0 8px 8px 0;padding:16px 20px;margin:24px 0;">
<strong style="display:block;font-size:0.75rem;text-transform:uppercase;letter-spacing:1px;color:#1e40af;margin-bottom:8px;">The honest comparison</strong>
Without this, "continuous compliance" means a practitioner opening a browser tab periodically and hoping they remember everything that's drifted since the last time. With it, drift gets reported the day it happens, overdue work gets chased without anyone having to remember to chase it, and the evidence an auditor eventually asks for was already filed, dated, and hashed — months before the audit, not the week before it.
</div>

The one thing this deliberately doesn't do is write anything on your behalf. Every alert is a nudge to a human, not an automated remediation — a control gets marked Implemented, an action gets closed, a policy gets approved, only when a practitioner actually does it. The automation's job is making sure nothing sits silently overdue, not taking the decision out of anyone's hands.

## Where to start

This is entirely optional and additive — Checkpoint works exactly the same without it, as an on-demand tool a practitioner runs interactively. Turning it on just adds the unattended half. If you're already running Checkpoint, it's a short deployment guide away. If you're not yet, [book a free 30-minute call](https://www.compliance365.com.au/book) and we'll show you the whole thing running against a demo tenant.

<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:20px 24px;margin:32px 0;">
<strong style="display:block;margin-bottom:8px;color:#0f172a;">About Compliance365</strong>
<p style="margin:0;color:#64748b;font-size:0.9rem;">We deliver ISO 27001, Essential Eight, SOC 2, ISO 42001 and ISO 27701 for Australian mid-market organisations — fixed-price, inside your existing Microsoft 365 environment, with audit-ready evidence at every step. <a href="https://www.compliance365.com.au/services" style="color:#1e40af;font-weight:600;">Explore our services →</a></p>
</div>
