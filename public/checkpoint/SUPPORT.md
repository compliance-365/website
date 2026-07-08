# Checkpoint — Support & Security Notification Policy

This is the client-facing companion to `SETUP.md` (setup/operation) and
`RELEASE.md` (Compliance365's internal build/hosting-integrity
practices). This file answers the two questions every client of a
security tool should be able to get a straight answer to: **what
happens when something breaks, and what happens if Checkpoint itself
has a security problem.**

---

## 1. Support channels

| Channel | Use for |
|---|---|
| `info@compliance365.com.au` | General questions, bugs, feature requests |
| Your engagement's named contact | Anything tied to an active certification engagement |

Because Checkpoint has no backend (see `SETUP.md` §1 and §6), Compliance365
generally **cannot see your data to diagnose an issue** — there's no
server-side log of what happened in your tenant. Support requests
should include as much detail as you can: which view, what you
expected vs what you saw, and a browser console screenshot if you can
get one. If a deeper look is genuinely needed, that's a Consultant
Access session — see below — never something Compliance365 can do
without your explicit action.

## 2. Response targets

| Severity | What this looks like | Target first response |
|---|---|---|
| **Critical** | You suspect Checkpoint is exposing your data to anyone who shouldn't see it, or a security flaw in Checkpoint itself | Same business day |
| **High** | A core feature (posture scan, a register, evidence capture) is broken or giving wrong results | 1 business day |
| **Normal** | A non-blocking bug or a feature request | 3 business days |

These are response times, not resolution times — resolution depends on
what's actually wrong.

## 3. If Checkpoint itself has a security issue

This is the process, stated plainly rather than buried in a contract:

1. **We find out** — through our own testing, your report, or a
   third-party disclosure.
2. **We triage same-day** for anything that could affect data
   confidentiality: could it expose one tenant's data to another, or
   to the public internet?
3. **We tell you.** Because Checkpoint has no backend, we usually can't
   tell *which* tenants are affected without you — so for anything
   above a minor issue, we notify every licensed client, not just the
   one who happened to report it. Silently patching and saying nothing
   isn't something we consider acceptable for a compliance/security
   tool.
4. **We fix it once, for everyone.** Checkpoint ships from a single
   hosted URL (`compliance365.com.au/checkpoint/`) that updates
   automatically — there's no separate version running in your tenant
   to patch, and nothing for you to install. The moment a fix is
   deployed, every client is running it.
5. **We follow up** with a written summary of what happened, whether
   any data was actually at risk, and what changed — the same
   discipline our internal hosting-compromise runbook (`RELEASE.md` §4)
   holds us to, made readable for a client rather than an engineer.

## 4. How updates reach you

- The app itself (`app.js`, `store.js`, etc.) is served from our hosted
  URL and updates automatically. You never install anything, and
  you're never running a stale version.
- New SharePoint lists or columns (e.g. a new register in a future
  release) provision themselves into your tenant automatically, the
  next time an admin loads Checkpoint — following the same incremental
  consent flow you already use. **Your existing data is never altered
  by an update.**
- If you've deployed the optional continuous-monitoring Azure Function
  (`azure/README.md`), that runs in *your* Azure subscription and is
  **not** auto-updated — you control when to redeploy it.
- Any change to what Microsoft Graph permissions Checkpoint requests
  will always be called out explicitly, not folded into a generic
  release note — permission changes are the one kind of update we
  think deserves your specific attention every time.

## 5. What's out of scope for support

- Your own Microsoft 365 tenant configuration or licensing (e.g. why
  MFA isn't enforced tenant-wide) — that's a compliance *finding*
  Checkpoint surfaces for you to action, not a Checkpoint defect.
- Certification decisions — those are made by your independent,
  accredited certification body based on their own audit, not by
  Compliance365 or Checkpoint.
- Browsers other than current versions of Chrome, Edge, Firefox and
  Safari.

## 6. Consultant access, if we ever need to look at your tenant directly

Any time a Compliance365 practitioner needs to sign into your tenant
directly (an onboarding session, or diagnosing something that genuinely
needs first-hand access), it happens **only at your invitation**, using
credentials your own administrators grant, and only for the access you
grant. Compliance365 has no standing access to any client tenant by
default — see your engagement's Consultant Access Terms for the full
detail.
