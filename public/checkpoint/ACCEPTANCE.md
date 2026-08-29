# Checkpoint — pre-pilot acceptance test plan

A scripted, click-by-click manual test plan for a fresh tenant, run before handing Checkpoint to a real pilot client. Pairs with the automated self-test (`?selftest=1` in demo mode — see §10) but is not replaced by it: nothing here can be exercised without a real Microsoft 365 tenant, a real sign-in, and a real (or deliberately broken) activation file.

## How to use this document

- Run top to bottom, in order — later stages assume earlier ones completed successfully (e.g. Assess needs a scan to have run before Plan has anything to approve).
- Each step lists an exact **Click**, the **Expect**ed result, and a Pass/Fail box. Tick exactly one.
- If a step fails, stop, note it, and don't mark later steps that depend on it — record them as **Blocked**, not Fail.
- This is written against the SPA at `/checkpoint/index.html` (or your deployed equivalent). Every button/field/label quoted below is the literal on-screen text — if what you see differs, that's itself a fail, note the discrepancy.
- The eight stage names below (Onboard, Assess, Plan, Implement, Evidence, Operate, Audit, Review/Recertify) are **this document's own organising structure, not existing Checkpoint UI copy** — the app has no "stages" concept in its own navigation. Each stage maps to the nearest real feature area; see the mapping table below.

| Stage | Checkpoint feature area exercised |
|---|---|
| 1. Onboard | The onboarding wizard (8 steps) |
| 2. Assess | Posture scan view + Coverage card |
| 3. Plan | Risk register + Actions register (approving scan findings) |
| 4. Implement | Statement of Applicability + Frameworks |
| 5. Evidence | Documents + Shared evidence + evidence linking |
| 6. Operate | Dashboard + Compliance calendar + Vendor risk + AI systems |
| 7. Audit | Internal audits + Audit reports + Auditor pack |
| 8. Review/Recertify | Management review + Audit log |

## 0. Prerequisites — prepare before starting

- [ ] A fresh Microsoft 365 tenant (or a dedicated test tenant) that Checkpoint has **never been provisioned into before** — no `Checkpoint *` SharePoint lists should exist yet. If unsure, check the root site's Site Contents.
- [ ] Global Administrator (or equivalent — Application Administrator + SharePoint Administrator) credentials for that tenant, to grant admin consent during sign-in.
- [ ] Checkpoint's Entra app registration already exists and `public/checkpoint/config.js`'s `clientId` points to it (see SETUP.md §2–3). If `clientId` is empty, the app runs demo-mode-only and stages 1–8 below (which require a real tenant) cannot run at all — stop and fix this first.
- [ ] `config.js`'s `entitlementPublicKey` is set to Compliance365's real (or your test) Ed25519 public key — not the shipped placeholder. Confirm via `node tools/issue-entitlement.mjs verify --file <any file> --pubkey <the configured key>` failing only on tenant mismatch/expiry, not on "Signature verification failed."
- [ ] Three activation files, issued with `node tools/issue-entitlement.mjs issue` (see `tools/ISSUANCE.md` for the full command):
  1. **valid.json** — `--tenant` set to the test tenant's real Entra tenant ID or a verified domain, `--frameworks iso27001,soc2` (or whatever this pilot purchased), `--expiry` at least 90 days out, default `--grace-days`.
  2. **wrong-tenant.json** — identical to valid.json except `--tenant` set to some *other* tenant ID/domain (not the test tenant's).
  3. **expired.json** — identical to valid.json except `--expiry` set to a date in the past **and** `--grace-days 0`, so it's expired past its grace period, not just in grace.
- [ ] A private/incognito browser window (or a browser profile with no prior Checkpoint session) for a clean first run.
- [ ] Optional, for §9's Business Premium negative test only: a second test tenant licensed at Microsoft 365 Business Premium (no Entra ID P1/P2), or a way to temporarily unassign those licences in the primary test tenant for one pass.

---

## 1. Onboard

Exercises the 8-step onboarding wizard for a brand-new tenant.

**1.1 — Reach the sign-in gate**
- Click: open `/checkpoint/index.html` in the clean browser window.
- Expect: the gate screen loads with an **"Explore the demo"** button and (once `Graph.init()` resolves) a **"Sign in with Microsoft"** button.
- [ ] Pass  [ ] Fail

**1.2 — Start sign-in**
- Click: **"Sign in with Microsoft"**.
- Expect: the wizard opens at **Step 1 — "Let's get your tenant set up."**
- [ ] Pass  [ ] Fail

**1.3 — Step 1: Welcome**
- Click: **"Get started"**.
- Expect: advances to **Step 2 — "Before you sign in"**, listing each Graph permission Checkpoint will request with a plain-English reason for each.
- [ ] Pass  [ ] Fail

**1.4 — Step 2: Consent explainer → actual sign-in**
- Click: **"Continue to sign-in"**.
- Expect: a Microsoft sign-in popup/redirect appears. Sign in with the Global Admin account and **grant admin consent** when prompted for the listed read-only permissions (User.Read, Directory.Read.All, Policy.Read.All, SecurityEvents.Read.All, DeviceManagementManagedDevices.Read.All, DeviceManagementConfiguration.Read.All, RoleManagement.Read.Directory, IdentityRiskyUser.Read.All).
- [ ] Pass  [ ] Fail

**1.5 — Step 3: Tenant capability check**
- Expect: lands on **"Checking what your tenant can tell us"** automatically (a brand-new tenant skips straight here per `afterSignIn()`'s probe — steps 1–2 only ever show pre-sign-in). A capability list populates; the **"Continue"** button (`#wizStep3Next`) is disabled until the check finishes, then enables.
- Click: **"Continue"** once enabled.
- [ ] Pass  [ ] Fail

**1.6 — Step 4: Activation**
- Click: use the file picker to upload **valid.json** (or paste its contents into the textarea below it).
- Click: **"Verify"**.
- Expect: status area shows **"Verified ✓ — frameworks: <your purchased frameworks>, valid until <date>."** in the pass colour. The **"Continue"** button enables.
- Click: **"Continue"**.
- [ ] Pass  [ ] Fail

**1.7 — Step 5: Site selection**
- Expect: **"Where should your records live?"** with "Tenant root site (recommended)" pre-selected.
- Click: leave the default selected, then **"Validate & continue"**.
- Expect: no validation error; advances to Step 6.
- [ ] Pass  [ ] Fail

**1.8 — Step 6: Framework selection**
- Expect: every framework named in valid.json's `--frameworks` appears pre-checked (plus ISO 27001, always on); anything not purchased is absent or disabled.
- Click: **"Continue"**.
- [ ] Pass  [ ] Fail

**1.9 — Step 7: Provisioning**
- Expect: a spinner with live status text (e.g. "Creating list…", "Seeding framework control sets…") runs to completion with no error. This step creates the `Checkpoint *` SharePoint lists — confirm in a separate tab that Site Contents now shows them.
- [ ] Pass  [ ] Fail

**1.10 — Step 8: Results → dashboard**
- Expect: "Setup complete" with a results summary (readiness %, top gaps, suggested next actions).
- Click: **"Go to dashboard"**.
- Expect: lands on the Dashboard (`v-dash`), sidebar shows **"Live"** mode chip and the tenant's real display name.
- [ ] Pass  [ ] Fail

---

## 2. Assess

Exercises the posture scan and its capability-coverage honesty.

**2.1 — Open Posture scan**
- Click: sidebar → **"Posture scan"**.
- Expect: a Coverage card lists the 11 Graph capability probes (Conditional Access, Identity Protection, PIM, Intune device management, Microsoft Secure Score, Purview sensitivity labels, Entra Access Reviews, SharePoint tenant sharing settings, Microsoft Defender XDR incidents, Microsoft Priva subject rights requests, Microsoft Purview retention labels), each labelled **Available**, **Not licensed**, or **No access**, matching what this tenant's actual licensing and admin roles support.
- [ ] Pass  [ ] Fail

**2.2 — Run a scan**
- Click: **"Run scan now"** (or the top-bar **"Run posture scan"** button from any view).
- Expect: scan completes; a score (0–100) appears on the Dashboard; the check list below the Coverage card shows each of the 30 non-AWS checks as Pass / Review / Fail / **"Manual — verify"**, never silently blank.
- [ ] Pass  [ ] Fail

**2.3 — Manual fallback is honest, not optimistic**
- Expect: any check whose `requiresCapability` probe came back **Not licensed** or **No access** in 2.1 shows **"Manual — verify"**, not a guessed Pass. Cross-check at least one (e.g. if PIM is unlicensed, the privileged-role-assignment check should read Manual).
- [ ] Pass  [ ] Fail

**2.4 — Register-derived checks read the real registers**

These four score from Checkpoint's own registers rather than Graph, so
they are the one group that **cannot** be verified in demo mode — demo
and live do not share a state shape for the document library. Verify on
a real tenant specifically.

- Expect, on a freshly provisioned tenant with empty registers: **Backup coverage & restore testing**, **Business continuity**, **Supplier security assessments** and **Information security policy published** all read **"Manual — verify"**, never Fail. An empty register is not a finding.
- [ ] Pass  [ ] Fail

**2.5 — Populate a register, rescan, and watch a check turn over**
- Click: **Compliance calendar** → add an entry with category **"Backup restore test"**, a `Next due` date in the past, and no `Last completed`. Return to Posture scan and click **"Run scan now"**.
- Expect: **Backup coverage & restore testing** now reads **Fail**, with a note naming the overdue test. Change the date to the future and set a `Last completed` date, rescan, and it reads **Pass**.
- [ ] Pass  [ ] Fail

**2.6 — Policy check reflects the document register (live-only path)**
- Click: **Documents** → confirm at least one policy is present and **Approved** with a version, an owner and a future review date.
- Expect: **Information security policy published & reviewed** reads **Pass**. Set that document's review date into the past and rescan — it reads **Fail** naming the overdue document.
- Note: this specifically exercises the `window._docs` path, which demo mode does not use. If it reads "Manual — verify" while approved documents plainly exist in the register, that is a **Fail** — it means the check is looking at the wrong source.
- [ ] Pass  [ ] Fail

**2.7 — "Not via Microsoft?" disposition**
- Click: any failing check → **"Not via Microsoft?"** → set Coverage to **"Covered by another tool"**, name a tool, enter a justification, leave the default review date, **Save**.
- Expect: the check now reads **"Covered — <tool>"** with the note *"Not scored from Microsoft signal · review due …"*, the posture score rises, and the previously proposed risk for that check no longer appears under proposals.
- [ ] Pass  [ ] Fail

**2.8 — Disposition expiry**
- Click: the same check → **"Edit coverage"** → set the review date to yesterday → **Save**.
- Expect: the check reverts to its real scan result (Fail/Review) and the score drops back. An expired override must not keep passing.
- [ ] Pass  [ ] Fail

**2.9 — Disposition cannot manufacture "Demonstrated" assurance**
- Click: **Statement of Applicability** → find a control the dispositioned check maps to, with Status **Implemented**.
- Expect: its assurance reads **Evidenced** (if an evidence link is attached) or **Asserted** — never **Demonstrated**. Checkpoint did not observe the control; it was told about it.
- [ ] Pass  [ ] Fail

---

## 3. Plan

Exercises turning a scan finding into a tracked risk + remediation actions.

**3.1 — A finding proposes a risk**
- Expect: below the Coverage card, a **"Proposed for the register — practitioner approval required"** card lists at least one finding from the 2.2 scan (skip this stage if the scan came back clean — re-run 2.2 against a tenant with at least one Fail/Review result, or accept a genuinely clean result as a pass here).
- [ ] Pass  [ ] Fail  [ ] N/A — scan was fully clean

**3.2 — Approve a finding**
- Click: **"Approve → register"** on one proposed finding.
- Expect: toast/confirmation; the finding's risk now appears in **Risk register** (sidebar) with inherent L×I and a band (Low/Medium/High/Critical); its remediation action(s) appear in **Actions register**, each linked to the same risk ID and a control code.
- [ ] Pass  [ ] Fail

**3.3 — Dismiss a finding**
- Click: **"Dismiss"** on a different proposed finding (if more than one exists).
- Expect: it disappears from the proposed list and does **not** appear in the Risk register; Audit log (stage 8) later shows a **"Scan finding dismissed"** entry for it.
- [ ] Pass  [ ] Fail  [ ] N/A — only one finding existed

**3.4 — Complete an action, watch residual risk drop**
- Click: Actions register → find the action created in 3.2 → **"Complete"**.
- Expect: a modal asks for an evidence note; on confirm, the action's status becomes Done, and the linked risk's **Residual** score in the Risk register visibly drops (recalculated automatically, per the register's own description).
- [ ] Pass  [ ] Fail

---

## 4. Implement

Exercises the Statement of Applicability and framework administration.

**4.1 — Open the SoA**
- Click: sidebar → **"Statement of Applicability"**.
- Expect: one tab per entitled framework; the currently-selected framework's full control set renders with Applicable/Status/Also-satisfies/Owner/Verified/Evidence columns.
- [ ] Pass  [ ] Fail

**4.2 — Change a control's status**
- Click: on any applicable control's Status dropdown → select **"In progress"**, then on another → **"Implemented"**.
- Expect: the change persists (reload the view or press F5 — status must survive a reload, since it's written to the tenant's SharePoint Controls list, not just kept in memory).
- [ ] Pass  [ ] Fail

**4.3 — Mark a control not applicable**
- Click: toggle a control's Applicable switch off.
- Expect: its Status column shows an **"N/A"** chip and it drops out of the readiness percentage's denominator (compare the SoA's implementation % before/after).
- [ ] Pass  [ ] Fail

**4.4 — Frameworks view reflects entitlement**
- Click: sidebar → **"Frameworks"**.
- Expect: every framework named in valid.json shows **"Entitled"**; ISO 27001 always shows **"Included baseline"**; anything not purchased shows **"Not entitled"**. No toggle switches are present for a live tenant (that honour-system toggle only exists in demo mode) — confirm framework state can only change by applying a different activation file.
- [ ] Pass  [ ] Fail

---

## 5. Evidence

Exercises linking evidence to a control and the shared-evidence cross-framework view.

**5.1 — Link evidence manually**
- Click: SoA → a control marked Implemented with no evidence yet → **"Link evidence"**.
- Expect: a **"Link evidence"** modal opens asking for a URL; enter any `https://` SharePoint/OneDrive-style link → confirm.
- Expect: the control now shows an **"Evidence ↗"** link and an **"Edit"** button.
- [ ] Pass  [ ] Fail

**5.2 — Verify a control**
- Click: the same control → **"Verify now"**.
- Expect: a verified-date stamp appears with the signed-in user's name; re-visiting later shows **"Re-verify"** instead, and a stale (90+ day) verification would flag visibly (not practically testable same-day — just confirm the "Re-verify" button now exists).
- [ ] Pass  [ ] Fail

**5.3 — Shared evidence cross-reference**
- Click: sidebar → **"Shared evidence"** → pick the control from 5.1 in the dropdown.
- Expect: shows every framework/control this same evidence also satisfies (via the SoA's "Also satisfies" cross-mapping), not just the one you started from.
- [ ] Pass  [ ] Fail

**5.4 — Upload a document**
- Click: sidebar → **"Documents"** → choose a small test file, pick a category → **"Upload"**.
- Expect: file appears in the table below with correct name/category/modified date; visible in the tenant's real SharePoint document library too (spot-check in a separate tab).
- [ ] Pass  [ ] Fail

---

## 6. Operate

Exercises day-to-day use: Dashboard, calendar, vendor risk, AI systems.

**6.1 — Dashboard reflects live state**
- Click: sidebar → **"Dashboard"**.
- Expect: posture score, readiness %, open risk count and overdue action count all match what stages 2–4 actually produced — no stale/cached numbers.
- [ ] Pass  [ ] Fail

**6.2 — Compliance calendar**
- Click: sidebar → **"Compliance calendar"** → **"+ Add activity"** → fill required fields → save.
- Expect: new recurring activity appears in the calendar list with its next-due date.
- [ ] Pass  [ ] Fail

**6.3 — Vendor risk**
- Click: sidebar → **"Vendor risk"** → add a vendor with at least one data category selected.
- Expect: a suggested criticality appears based on the data categories chosen; vendor is saved and listed.
- [ ] Pass  [ ] Fail  [ ] N/A — not entitled/enabled for this pilot

**6.4 — AI systems** (only if ISO 42001 is entitled)
- Click: sidebar → **"AI systems"** → add a system.
- Expect: it's saved with an impact-assessment status of "Not started"; nav badge count updates.
- [ ] Pass  [ ] Fail  [ ] N/A — ISO 42001 not entitled for this pilot

---

## 7. Audit

Exercises internal audit scheduling, report generation, and export.

**7.1 — Schedule an internal audit**
- Click: sidebar → **"Internal audits"** → **"+ Schedule audit"** → fill scope/framework/auditor/date → **"Schedule"**.
- Expect: appears in the audits table with status "Planned".
- [ ] Pass  [ ] Fail

**7.2 — Generate every report type**
- Click: sidebar → **"Audit reports"**.
- For each of the 5 cards — Statement of Applicability, Risk register snapshot, Audit readiness report, Management review pack, Executive summary — click **"Generate"**.
- Expect each time: a popup opens showing the full report (cover page, document control table, table of contents, a visual dashboard page with charts, the report's own sections, methodology appendix, sign-off block). No blank sections, no `undefined`/`NaN` visible anywhere.
- [ ] Pass  [ ] Fail — SoA
- [ ] Pass  [ ] Fail — Risk register snapshot
- [ ] Pass  [ ] Fail — Audit readiness report
- [ ] Pass  [ ] Fail — Management review pack
- [ ] Pass  [ ] Fail — Executive summary

**7.3 — Export PDF**
- Click: on any open report popup, **"EXPORT PDF"**.
- Expect: the browser's print/save dialog opens with a suggested filename of the form `<Client> - <Report title> - <YYYY-MM-DD>`; save as PDF and confirm the saved file is a real multi-page PDF with a repeating header/footer and page numbers.
- [ ] Pass  [ ] Fail

**7.4 — Auditor pack**
- Click: sidebar → **"Auditor pack"** → **"Generate Auditor pack"**.
- Expect: a bundle/summary is generated without error, saved to Documents (or downloaded, per current implementation).
- [ ] Pass  [ ] Fail

**7.5 — CSV export escaping**
- Click: any register view (e.g. Risk register) → **"Export CSV"**.
- Expect: file downloads; open it — any risk/action title containing a comma, quote, or the client's own punctuation renders as one correct cell, not split across columns.
- [ ] Pass  [ ] Fail

---

## 8. Review/Recertify

Exercises management review and the audit trail.

**8.1 — Record a management review**
- Click: sidebar → **"Management review"** → **"+ Record review"** → fill attendees/inputs/decisions → save.
- Expect: a new review row appears, snapshotting current posture/risk/action state at that moment.
- [ ] Pass  [ ] Fail

**8.2 — Audit log completeness**
- Click: sidebar → **"Audit log"**.
- Expect: every mutating action taken in stages 1–8 so far (activation applied, control status changes, risk approved/dismissed, evidence linked, control verified, document uploaded, audit scheduled, review recorded) has a corresponding entry with actor, action, target, before/after — spot-check at least 5 entries against what you actually did.
- [ ] Pass  [ ] Fail

**8.3 — Re-run setup is non-destructive**
- Click: **"Frameworks"** → **"Re-run setup"** → confirm.
- Expect: steps back through capability check/site selection/framework picks and re-provisions; afterwards, every risk/action/control/document created in earlier stages is still present, untouched.
- [ ] Pass  [ ] Fail

---

## 9. Negative tests

These must all fail *correctly* — a clean rejection with a clear message, never a silent success, a crash, or a vague error.

**9.0 — Incremental consent for the newer scopes**
- Setup: an account that signed in to Checkpoint **before** the Defender XDR / Priva / retention scopes were added.
- Click: sign in again.
- Expect: Entra prompts **once** for the additional permissions (`SecurityIncident.Read.All`, `SecurityAlert.Read.All`, `SubjectRightsRequest.Read.All`, `RecordsManagement.Read.All`), and everything previously granted keeps working. This must be an incremental prompt, never a re-consent to the whole set and never a hard failure.
- [ ] Pass  [ ] Fail

**9.0b — Unlicensed capability degrades, never fails**
- Setup: a tenant with **no** Defender XDR, Priva or Purview records management (Business Premium is ideal).
- Expect: the Coverage card shows those three probes as **Not licensed**, and the checks that depend on them (**Security incidents triaged**, **Subject rights requests**, **Retention & disposal labels**) read **"Manual — verify"**. The posture score must be computed over the remaining checks only — an unlicensed capability must never reduce the score.
- Cross-check: note the score, then compare against a manual count of Pass/Review/Fail rows. Manual rows must be excluded from the denominator entirely.
- [ ] Pass  [ ] Fail

**9.1 — Wrong-tenant activation (wizard)**
- Setup: use a **second, never-onboarded** test tenant (or reset the first back to unprovisioned, if your test plan allows).
- Click: at wizard Step 4, upload **wrong-tenant.json** → **"Verify"**.
- Expect: status shows **"Activation rejected: This activation file is issued for a different tenant."** in the fail colour. **"Continue"** stays disabled. No SharePoint lists are created (provisioning is blocked without a verified activation).
- [ ] Pass  [ ] Fail

**9.2 — Wrong-tenant activation (already-live tenant)**
- Click: on the already-onboarded tenant from stage 1, go to **Frameworks** → upload **wrong-tenant.json** → **"Verify & apply"**.
- Expect: toast **"Activation rejected: This activation file is issued for a different tenant."** The tenant's existing entitlement/data is completely unaffected.
- [ ] Pass  [ ] Fail

**9.3 — Expired activation (already-live tenant)**
- Click: **Frameworks** → upload **expired.json** → **"Verify & apply"**.
- Expect: toast **"Activation applied, but it expired <date> — renewal needed."** Reload the app: every register/dashboard/report is still fully viewable and exportable, but every mutating control (status changes, add/edit/complete, uploads, provisioning) is now disabled; the role chip reads **"Activation expired — read only"**.
- [ ] Pass  [ ] Fail

**9.4 — Recovering from an expired activation**
- Click: while still read-only from 9.3, go to **Frameworks** → upload **valid.json** → **"Verify & apply"**.
- Expect: toast confirms the activation is verified and applied (not blocked by the read-only state — renewing must always be possible). Read-only banner clears; mutating controls re-enable.
- [ ] Pass  [ ] Fail

**9.5 — Returning tenant with a since-invalidated cached activation**
- Setup: simulate by corrupting the stored activation (or by rotating the signing key and not reissuing — see `tools/ISSUANCE.md` §2) then reloading.
- Expect: lands on the **"This tenant isn't activated"** screen (not the dashboard), with reason text explaining the activation is missing or no longer verifies, a file/paste retry box, a **"Verify & retry"** button, and an **"Explore the demo instead"** escape hatch.
- [ ] Pass  [ ] Fail

**9.6 — Viewer role cannot write via the UI**
- Setup: in **demo mode**, open `/checkpoint/index.html?demo&role=viewer` (or, for a real tenant, sign in as an account Checkpoint's role detection resolves to Viewer — see SETUP.md §5a).
- Expect: role chip reads **"Viewer — read only"**. Lands on **Board view**, not Dashboard.
- Click: navigate to Risk register / Actions register / SoA and attempt any mutating control (e.g. a control's Status dropdown, "Complete" on an action, "Link evidence").
- Expect: the control is disabled (greyed out, not clickable) with a tooltip **"Read-only access — ask a practitioner to make this change."** If you force a click via devtools/accessibility tools bypassing the disabled attribute, the dispatch-level guard still blocks it and shows a toast with the identical message — the UI-level disable is not the only enforcement.
- [ ] Pass  [ ] Fail

**9.7 — Viewer role: registers and reports remain fully readable**
- Expect: with the same Viewer session from 9.6, every register, the Dashboard/Board view, and every report in Audit reports remains fully visible and exportable (CSV export, PDF export) — read-only means no writes, not no access.
- [ ] Pass  [ ] Fail

**9.8 — Business Premium tenant: honest capability-coverage messaging**
- Setup: sign into (or license-downgrade) a tenant on Microsoft 365 Business Premium only — no Entra ID P1/P2.
- Click: **Posture scan**.
- Expect: Coverage card shows **Conditional Access**, **Identity Protection**, and **PIM** as **"Not licensed"** or **"No access"** (Business Premium includes neither Entra P1 nor P2); **Intune device management** and **Microsoft Secure Score** show **"Available"** (both included in Business Premium).
- Click: **"Run scan now"**.
- Expect: every check that depends on an unlicensed capability (MFA enforcement, legacy-auth blocking, privileged-role/PIM assignment, risky-user handling) shows **"Manual — verify"**, never a guessed Pass or a silent Fail. Checks depending only on Intune/Secure Score (device compliance, patch currency, macro hardening, logging, alerting) score normally.
- [ ] Pass  [ ] Fail

---

## 10. Automated self-test cross-check

Not a replacement for anything above — a fast sanity check that this build's pure logic hasn't regressed.

- [ ] Open `/checkpoint/index.html?selftest=1` in a private window. Confirm demo mode starts automatically and lands directly on a **"Self-test"** view (no manual navigation needed — there is no visible sidebar item for it in normal use).
- [ ] Confirm the summary line reads **"All N checks passed"** in the pass colour, with zero rows showing **Fail**.
- [ ] If any row shows Fail, do **not** proceed with this build's pilot rollout — file it and re-run this whole acceptance pass once fixed.
- [ ] Confirm `npm test` (this repo's CI unit tests) also passes clean, including `test/selftest.test.mjs` — the same checks, run headlessly.

---

## Sign-off

| | |
|---|---|
| Tenant tested | |
| Build/version (sidebar footer, "Checkpoint vX.Y.Z") | |
| Tester name | |
| Date | |
| Overall result | [ ] Pass — ready for pilot &nbsp; [ ] Pass with noted exceptions &nbsp; [ ] Fail — not ready |
| Exceptions / follow-ups | |
