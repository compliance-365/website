---
title: "Your Enterprise Customer's Security Questionnaire Now Asks About AI — Are You Ready?"
seoTitle: "The AI Section in Vendor Security Questionnaires"
description: "Enterprise buyers now ask about AI governance. What they're asking, why most SaaS vendors can't answer yet, and how ISO 42001 gets you a ready answer."
date: 2026-07-28
author: "Compliance365"
tags: ["ISO 42001", "AI Governance", "Enterprise Sales", "Vendor Risk", "SOC 2", "Australia"]
image: "/assets/blog-ai-vendor-questionnaire.svg"
---

<div style="background:#f9fafb;border-radius:12px;padding:24px 28px;margin:24px 0;box-shadow:0 2px 8px rgba(15,23,42,0.04)">
  <p>If you sell software to enterprise customers, you already know the drill: a security questionnaire lands in your inbox before the contract does. What's changed in the last year is <strong>what's on it</strong>.</p>
  <p>Buried among the usual encryption, access control and business continuity questions, there's now a new section — <strong>AI governance</strong>. What AI do you use in your product? Whose data does it touch? Who reviews its output? What happens if it gets something wrong?</p>
  <p>Most vendors have a strong product and a strong answer to everything else on the form. This section is the one that stalls the deal.</p>
</div>

<hr style="margin:36px 0;border:0;border-top:1px solid #e5e7eb" />

<h2 style="color:#111827;font-size:1.6rem;font-weight:800;margin-top:2rem"><span style="display:inline-flex;align-items:center;justify-content:center;min-width:1.6em;height:1.6em;padding:0 .2em;border-radius:6px;background:#A9812E;color:#fff;font-size:0.62em;font-weight:800;vertical-align:middle;margin-right:10px;font-family:Manrope,system-ui,sans-serif;">1</span> Why this happened so fast</h2>

<p>Enterprise procurement and GRC teams didn't add an AI section because it's trendy — they added it because <strong>their own customers, regulators and boards started asking them</strong>. A large enterprise buying your SaaS product is, from their risk team's point of view, extending their own AI supply chain into your codebase. If your product embeds a language model, calls a third-party AI API, or uses AI to make any decision that touches their data, that's now their problem too — and they know it.</p>

<p>The EU AI Act's extraterritorial reach, ISO 42001 becoming an actual, auditable standard rather than a set of AI ethics principles, and a run of very public "the AI feature did something nobody signed off on" stories have all pushed this from "nice to ask" to "standard line item" in about eighteen months.</p>

<h2 style="color:#111827;font-size:1.6rem;font-weight:800;margin-top:2rem"><span style="display:inline-flex;align-items:center;justify-content:center;min-width:1.6em;height:1.6em;padding:0 .2em;border-radius:6px;background:#A9812E;color:#fff;font-size:0.62em;font-weight:800;vertical-align:middle;margin-right:10px;font-family:Manrope,system-ui,sans-serif;">2</span> What's actually being asked</h2>

<p>Strip away the varying wording and almost every enterprise AI questionnaire section is asking the same five things:</p>

<div style="background:#f9fafb;border-radius:12px;padding:16px 20px;margin-top:12px">
  <table style="width:100%;border-collapse:collapse;font-size:0.96rem">
    <thead style="background:#f3f4f6">
      <tr>
        <th style="text-align:left;padding:10px;border-bottom:2px solid #e5e7eb">They ask</th>
        <th style="text-align:left;padding:10px;border-bottom:2px solid #e5e7eb">What they're really checking</th>
      </tr>
    </thead>
    <tbody>
      <tr><td style="padding:10px;border-bottom:1px solid #eef2ff">"What AI/ML capabilities does your product use?"</td><td style="padding:10px;border-bottom:1px solid #eef2ff">Do you even know your own AI footprint — internal features and embedded third-party models?</td></tr>
      <tr><td style="padding:10px;border-bottom:1px solid #eef2ff">"Whose data trains or is processed by these models?"</td><td style="padding:10px;border-bottom:1px solid #eef2ff">Could our data end up training a model we never approved, or leak to a third party?</td></tr>
      <tr><td style="padding:10px;border-bottom:1px solid #eef2ff">"Is there human review before an AI decision affects a customer?"</td><td style="padding:10px;border-bottom:1px solid #eef2ff">Is there a human-in-the-loop control, or does the model just act unsupervised?</td></tr>
      <tr><td style="padding:10px;border-bottom:1px solid #eef2ff">"How do you assess and mitigate AI risk?"</td><td style="padding:10px;border-bottom:1px solid #eef2ff">Is there an actual risk process, or is this the first time anyone's written it down?</td></tr>
      <tr><td style="padding:10px">"Do you hold ISO 42001, or an equivalent AI governance certification?"</td><td style="padding:10px">Can we skip re-verifying all of the above ourselves, because a third party already did?</td></tr>
    </tbody>
  </table>
</div>

<p style="margin-top:12px;color:#4b5563">That last question is the one that matters most commercially. Answered "yes, and here's the certificate," the rest of the section closes in one line. Answered with four paragraphs of prose written on the spot by whoever picked up the questionnaire, it turns into a follow-up call, a security review, and weeks added to the deal cycle — if it doesn't quietly become the reason the deal goes to a competitor instead.</p>

<h2 style="color:#111827;font-size:1.6rem;font-weight:800;margin-top:2rem"><span style="display:inline-flex;align-items:center;justify-content:center;min-width:1.6em;height:1.6em;padding:0 .2em;border-radius:6px;background:#A9812E;color:#fff;font-size:0.62em;font-weight:800;vertical-align:middle;margin-right:10px;font-family:Manrope,system-ui,sans-serif;">3</span> ISO 42001 is built to answer exactly this</h2>

<p>ISO 42001 is the world's first certifiable AI management system standard — the AI equivalent of what ISO 27001 did for information security. It doesn't ask you to prove your AI is perfect. It asks you to prove it's <strong>governed</strong>: that you know what AI you're running, who's accountable for it, what could go wrong, and how you'd catch it.</p>

<p>Practically, that's four things a vendor questionnaire is fishing for anyway:</p>

<ul>
  <li><strong>An AI system register</strong> — every AI capability in your product (and every third-party model you call), what data it touches, who owns it, and its risk rating.</li>
  <li><strong>Human-in-the-loop controls</strong> — documented review gates wherever an AI output reaches a customer or makes a decision on their behalf.</li>
  <li><strong>An AI risk assessment process</strong> — not a one-off exercise, a live process that runs every time a new model or feature is added.</li>
  <li><strong>Evidence, not assurances</strong> — an auditor's sign-off that this is actually happening, not a policy document nobody's followed since it was written.</li>
</ul>

<div style="background:#f0fdfa;border-left:4px solid #10b981;padding:16px;border-radius:10px;margin:24px 0">
  <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true" style="vertical-align:-2px;margin-right:5px;color:#10b981"><use href="#ic-target"/></svg> <strong>The shift to notice:</strong> this used to be a differentiator — something you'd mention to stand out. It's rapidly becoming table stakes, the same way SOC 2 went from "nice to have" to "can't get in the door without it" for enterprise SaaS a few years ago. The vendors who get ahead of it now are the ones who won't be scrambling when it's no longer optional.
</div>

<h2 style="color:#111827;font-size:1.6rem;font-weight:800;margin-top:2rem">Why this doesn't need to be its own project</h2>

<p>If you're already running ISO 27001, most of the scaffolding ISO 42001 needs already exists — a risk register, a management review cycle, an internal audit programme, evidence retention. ISO 42001 extends that same machinery to your AI systems specifically, rather than starting from nothing. Built inside Microsoft 365 (SharePoint as the register, evidence captured as it's generated rather than assembled after the fact), most organisations get to AI-readiness in 6–10 weeks — faster again if it's layered onto an existing ISMS.</p>

<h2 style="color:#111827;font-size:1.3rem;font-weight:800;margin-top:2rem">Next steps</h2>

<p>If an enterprise deal is currently stalled on an AI governance question, or you'd rather have the answer ready before it's asked:</p>

<ul>
  <li>Need an answer this quarter, not an 8–14 week programme? See our <a href="/resources/ai-vendor-risk-assessment">AI vendor risk assessment</a> — a faster, scoped alternative that upgrades into full certification later</li>
  <li>Explore our <a href="/services/iso42001">ISO 42001 services</a></li>
  <li>Try the <a href="/checklist/iso42001">ISO 42001 readiness checklist</a></li>
  <li>Book a <a href="/book/">15-minute intro call</a> to map your path to certification</li>
</ul>

<!--
SEO Highlights
Primary: AI vendor risk assessment, ISO 42001 certification, enterprise security questionnaire AI, AI governance for SaaS
Supporting: AI vendor questionnaire, AI risk assessment, human-in-the-loop controls, AI system register, ISO 42001 Australia
Intent: "security questionnaire AI questions", "how to answer AI governance questionnaire", "ISO 42001 for SaaS vendors"
-->
