# Checkpoint — Setup Guide

Checkpoint is a single-page compliance console with **no backend**. It signs
users in with Microsoft Entra, reads tenant posture via Microsoft Graph, and
stores every register (risks, actions, SoA, scans, activity) as **SharePoint
lists inside the client's own tenant**. You register the app once in *your*
tenant as a multi-tenant application; each client admin consents once, and
Checkpoint works in their tenant from your hosted URL. An entirely optional
add-on (§9) can deploy a small scheduled compute component into the
*client's own* Azure subscription for unattended daily scans — everything
else in this guide describes the default, backend-free tool.

This guide covers app registration, permissions and day-to-day operation.
`RELEASE.md` covers how a release is built and shipped, and the internal
hosting-compromise runbook. `SUPPORT.md` is the client-facing companion to
both — response times, and exactly what happens if Checkpoint itself ever
has a security issue. `ACCEPTANCE.md` is the scripted, click-by-click manual
test plan to run against a fresh tenant before handing Checkpoint to a real
pilot client — every lifecycle stage plus the negative tests (wrong-tenant/
expired activation, Viewer role, under-licensed tenant coverage messaging)
that a happy-path walkthrough alone would never catch. It's paired with a
hidden self-test diagnostics view (`?selftest=1`, demo mode only) that
regression-checks the pure-logic pieces between releases — see
`ACCEPTANCE.md`'s own §10 for the distinction. `AI-SETUP.md` covers the
optional AI assistant add-on (a separate purchasable entitlement module)
end to end — provisioning the client's own Azure OpenAI resource, the
RBAC role assignment it needs, and the data-flow/governance guarantees.

---

## 1. Try it right now (no setup)

Demo mode needs nothing:

```
https://www.compliance365.com.au/checkpoint/?demo=1
```

Sample data, stored only in the browser. Use it to explore every view,
run the simulated scan, approve findings, complete actions, and generate
all four reports.

---

## 2. Register the app in Microsoft Entra (once, in YOUR tenant)

1. Go to **entra.microsoft.com** → Identity → Applications →
   **App registrations** → **New registration**.
2. Name: `Compliance365 Checkpoint`
3. Supported account types:
   **Accounts in any organizational directory (Any Microsoft Entra ID tenant — Multitenant)**
4. Redirect URI: choose platform **Single-page application (SPA)** and enter:
   - `https://www.compliance365.com.au/checkpoint/`
   - Add `http://localhost:8080/checkpoint/` too if you want local testing.
5. Register, then copy the **Application (client) ID**.

### API permissions (all *Delegated*, Microsoft Graph)

Register all of these in Entra up front — but Checkpoint only *asks the
user's browser to consent* to them in three stages, not all at sign-in
(incremental consent, least-privilege by default):

**Stage 1 — requested at sign-in:**

| Permission | Why | Admin consent |
|---|---|---|
| `User.Read` | Signed-in user profile | No |
| `Directory.Read.All` | Global Administrator count, guest user count, OAuth app grants | Yes |
| `Policy.Read.All` | Read Conditional Access policies (MFA / legacy auth checks) | Yes |
| `SecurityEvents.Read.All` | Read Microsoft Secure Score | Yes |
| `DeviceManagementManagedDevices.Read.All` | Intune device compliance | Yes |
| `DeviceManagementConfiguration.Read.All` | Whether Intune compliance policies exist at all | Yes |
| `RoleManagement.Read.Directory` | Whether privileged roles use PIM-eligible assignment | Yes |
| `IdentityRiskyUser.Read.All` | Risky sign-ins / risky users (requires Entra ID P2) | Yes |
| `SensitivityLabels.Read.All` | Read published Purview sensitivity labels (classification/labelling check; requires Purview Information Protection) | Yes |
| `AccessReview.Read.All` | Whether periodic Entra Access Reviews are configured (access-rights review check; requires Entra ID Governance) | Yes |
| `SharePointTenantSettings.Read.All` | Tenant-wide external sharing setting (external-sharing check; the signed-in user must hold the SharePoint Administrator or Global Administrator role) | Yes |

**Stage 2 — requested the first time registers are loaded/created**
(`Store.load()`, i.e. the first time anyone opens Checkpoint in this
tenant, or the first time after a fresh sign-in each session):

| Permission | Why | Admin consent |
|---|---|---|
| `Sites.Manage.All` | Create + read/write the Checkpoint SharePoint lists | Yes |

**Stage 3 — requested the first time "Email status update" (Board
view) is clicked:**

| Permission | Why | Admin consent |
|---|---|---|
| `Mail.Send` | Sends the status email as the signed-in user, never a service account | Yes |

Each stage is a separate consent prompt the first time it's needed —
after that, it's silent (MSAL caches the grant per account, same as any
other scope). A client who never uses the email button never sees that
prompt at all.

> If you already registered the app with an earlier permission set,
> add whatever's missing above in Entra and click **Grant admin consent**
> for the app once — that pre-grants all three stages so no client sees
> a mid-session consent popup; existing client tenants will need the
> same re-consent (send the admin-consent URL from §5 again; it's safe
> to re-run). If you'd rather let each stage prompt naturally instead,
> that's fine too — Checkpoint handles both.

Add each under **API permissions → Add a permission → Microsoft Graph →
Delegated permissions**. Everything except `Sites.Manage.All` and
`Mail.Send` is read-only.

> Note: because these require admin consent, only an admin (or a tenant
> where an admin has consented) can complete sign-in. That is the intended
> onboarding gate.

---

## 3. Configure and deploy

1. Edit `public/checkpoint/config.js`:
   ```js
   clientId: 'PASTE-YOUR-APPLICATION-CLIENT-ID-HERE',
   ```
2. Optional settings in the same file:
   - `authority` — lock to a single tenant ID during testing, or leave as
     `organizations` for multi-tenant.
   - `site` — `'root'` stores lists on the tenant root SharePoint site, or
     set a path like `'/sites/compliance'`.
   - `listPrefix` — prefix for the five lists Checkpoint provisions.
3. Commit + deploy the site. Checkpoint is served at `/checkpoint/`.

---

## 4. Test in your own tenant

1. Open `https://www.compliance365.com.au/checkpoint/`
2. Click **Sign in with Microsoft** — this opens the **onboarding wizard**
   (see §4a below) rather than signing in immediately. Its first two
   screens (welcome, consent explainer) are pre-sign-in; "Continue to
   sign-in" is what actually triggers Entra's sign-in screen.
3. First sign-in shows the consent prompt listing the read-only
   permissions the wizard's step 2 already explained — accept (tick
   "Consent on behalf of your organization" if offered).
4. The wizard resumes at its tenant capability check, then site
   selection, framework selection, provisioning and a first scan —
   see §4a for the full flow. Provisioning creates SharePoint lists
   (plus one document library) on whichever site the wizard's site step
   resolved to, and seeds every registered framework's control set:
   - `Checkpoint Risks`
   - `Checkpoint Actions` (also holds non-conformities & observations — see §8)
   - `Checkpoint ActionUpdates` (append-only, dated progress log against
     each action — see §8; the Actions list itself only ever holds an
     action's CURRENT status and latest evidence link, this is the
     history behind it)
   - `Checkpoint Controls` (tagged per framework — see §7)
   - `Checkpoint Scans`
   - `Checkpoint Activity`
   - `Checkpoint Entitlements` (which frameworks are switched on for this client)
   - `Checkpoint Settings` (risk appetite, feature toggles, scan cadence, posture-scan thresholds, `onboardedDate` — see §9)
   - `Checkpoint Audits` (internal audit programme — see §8)
   - `Checkpoint Reviews` (management review records — see §8)
   - `Checkpoint Calendar` (recurring ISMS activities — see §8)
   - `Checkpoint Incidents` (incident register, A.5.24–A.5.28, including privacy-breach assessment tracking — see §8)
   - `Checkpoint AuditLog` (append-only audit trail — see §8)
   - `Checkpoint Alerts` (drift alerts from the optional continuous monitor — see §9)
   - `Checkpoint Vendors` (third-party vendor risk register — see §8)
   - `Checkpoint AISystems` (AI Governance / ISO 42001 register — see §8, only used while iso42001 is entitled)
   - `Checkpoint CheckDispositions` (how this tenant covers a posture
     check Checkpoint can't see — an alternative tool, or not applicable;
     see §8's "Checks covered outside Microsoft")
   - `Checkpoint Documents` (a document library, not a list — real file storage)
   ISO 27001 is entitled by default going into the wizard's framework
   step; every other framework's control set is seeded either way, just
   switched off until turned on there (or later, from Frameworks) — see §7.
5. The wizard's own first scan (step 7) uses real results from your
   Conditional Access policies, Global Admin count, Intune compliance
   and Secure Score, and ends on a readiness/gaps/next-actions summary
   before handing off to the dashboard. Approve a finding there and
   watch the risk + actions appear — then check the SharePoint lists:
   the items are there, versioned by SharePoint itself.

### 4a. The onboarding wizard

A brand-new tenant (no `onboardedDate` in its `Checkpoint Settings` list
yet) goes through a 7-step full-screen wizard instead of the old
"sign in and everything's silently provisioned" cold start:

1. **Welcome** — what Checkpoint does, the data-residency promise, in
   plain language. Pre-sign-in.
2. **Consent explainer** — every scope in `CONFIG.scopesReadOnly`,
   listed with a plain-English reason, shown *before* `Graph.signIn()`
   is ever called — the incremental-consent model made visible rather
   than just documented. "Continue to sign-in" is what actually
   triggers the Entra redirect.
3. **Tenant capability check** — a handful of read-only Graph calls
   (Conditional Access, Global Admin membership, Secure Score, Intune,
   PIM, risky users, Purview sensitivity labels, Entra Access Reviews,
   SharePoint tenant sharing settings) run immediately after sign-in,
   before anything is written anywhere, with a pass/fail-per-capability
   list and a coverage summary. A missing *optional* capability (PIM,
   risky users, sensitivity labels, access reviews, SharePoint sharing
   settings — all need licensing or a specific admin role this tenant's
   signed-in user might not have) never blocks progress, consistent
   with how `runPostureChecks` already degrades
   those same checks to "review" rather than a hard failure.
4. **Site selection** — root site by default, or a `/sites/...` path,
   validated (`SpStore.validateSitePath()`) *before* anything is
   provisioned there. The resolved path is written to
   `window.CHECKPOINT_CONFIG.site` for the rest of the session and
   cached in this browser's `localStorage` (keyed by tenant ID) so
   every future load resolves the same site — see the comment above
   `applyStoredSitePreference()` in app.js for the known limitation
   (a different browser/device defaults back to root until told
   otherwise).
5. **Framework selection** — which purchased frameworks to entitle now;
   every framework's control set is seeded regardless (§7), this just
   sets the starting entitlement state `Store.setEntitlement()` would
   otherwise leave at "ISO 27001 only".
6. **Provisioning** — `Store.load()` runs for real here, reusing its
   existing `onStatus` progress messages (the same ones the old
   full-screen busy overlay showed), displayed inside this step instead.
7. **First scan + results** — `App.runScan()` runs automatically, then
   a summary (primary framework readiness %, top 5 open control gaps,
   3 suggested next actions drawn from whatever the scan proposed) with
   a "Continue" button.
8. **Who can use Checkpoint?** — the wizard's last step, entirely
   optional/skippable: explains the Practitioner/Viewer roles (§5a) in
   plain language and resolves a deep link straight to this tenant's own
   SharePoint "Site permissions" page (`{siteUrl}/_layouts/15/
   user.aspx`, resolved via the same host-then-site Graph lookup
   provisioning already uses — no new permission requested) — where both
   groups get created and their membership managed. `onboardedDate` was
   already written before step 7, so leaving mid-way through this step
   never re-triggers provisioning on the next load; "Go to dashboard"
   lives here now.

All wizard state (`W` in app.js) lives in memory only — nothing about
*progress through the wizard* is persisted anywhere; the only write
that survives a reload is the final `onboardedDate` setting.
`SpStore.probeOnboardingState()` is what a returning sign-in checks
first — a read-only lookup of that one setting, before any
provisioning — so an already-onboarded tenant goes straight to the
dashboard and never sees the wizard again. **Re-run setup** (Frameworks
& Settings view) clears `onboardedDate` and re-enters the wizard at
step 3 (capability check) — safe to run any time; it re-provisions
(idempotently) and re-scans but never deletes anything already in the
registers.

---

## 5. Onboard a client tenant

Two paths:

**A. Let consent happen at first sign-in.** Send the client admin to the
app URL; the consent prompt appears automatically on first sign-in.

**B. Pre-consent with an admin-consent URL** (cleaner for engagements) —
the owner console builds this per client automatically (see below), but
by hand it's:

```
https://login.microsoftonline.com/organizations/adminconsent
  ?client_id=e335e243-0417-4eac-b2d6-8f894891da33
  &redirect_uri=https://www.compliance365.com.au/checkpoint/
```

`/organizations/` in the path means "whichever tenant the signer is in
right now" — fine for a one-off, but risky for a consultant or MSP
routinely signed into several tenants, since the wrong one can consent
without any warning. Replace `organizations` with the client's own
tenant ID or verified domain to pin it:

```
https://login.microsoftonline.com/<client-tenant-id-or-domain>/adminconsent
  ?client_id=e335e243-0417-4eac-b2d6-8f894891da33
  &redirect_uri=https://www.compliance365.com.au/checkpoint/
```

The owner console generates this pinned link automatically — from a
client's drawer (**Admin consent link**) once they have a tenant ID on
file, or live as you type one into the **New client** form's tenant
field, before a roster row even exists. Both have a **Copy link**
button, so there's no hand-editing and no risk of pasting the wrong GUID.

The client's Global Admin opens that link, consents once for their whole
tenant, and every user you nominate can then use Checkpoint against their
tenant (subject to their own Graph permissions — posture checks need
security-reader-level rights; list writes need access to the chosen
SharePoint site).

Each client's data provisions into **their** SharePoint on first run.
Nothing multi-tenant is shared: your hosted URL is just static files.

### 5a. Two-role model — Practitioners vs. Viewers (optional, manual setup)

Checkpoint supports two roles per client tenant: **Practitioners** (full
edit access — everything in this app) and **Viewers** (read-only — the
client's own stakeholders, if you want to give them direct access to the
Dashboard/Board view/SoA/registers/reports instead of emailing status
updates and PDFs).

**This is a manual setup step, not something Checkpoint provisions for
you.** Microsoft Graph's v1.0 API has no endpoint to create a classic
SharePoint site group or bind it to a list/library permission level —
that's SharePoint's own permission model (site groups, role definitions,
role assignments), exposed only through the SharePoint REST API
(`_api/web/sitegroups`, a different resource/audience than
`graph.microsoft.com`) or the SharePoint admin UI, not Graph. Rather than
add a second authentication flow against a second API surface for a
"lightweight" feature, or claim a capability Graph doesn't actually have,
this is done once per client in the SharePoint UI:

1. Open the client's SharePoint site (the one Checkpoint provisioned into
   — root site by default, or the site path chosen during onboarding) →
   **Settings (gear icon) → Site permissions → Advanced permissions
   settings**.
2. **Create group** → name it exactly `Checkpoint Practitioners` → grant
   it the **Edit** permission level (or **Contribute**, if you want them
   unable to change the site's own structure) on every `Checkpoint *`
   list and the `Checkpoint Documents` library this app provisioned
   (Risks, Actions, Controls, Scans, Activity, Entitlements, Settings,
   Audits, Reviews, Calendar, AuditLog, Alerts, Vendors, AISystems,
   Attestations, Training, PolicyDrafts, Documents).
3. **Create group** → name it exactly `Checkpoint Viewers` → grant it the
   **Read** permission level on the same lists/library — never Edit or
   Contribute.
4. Add the client's own practitioner and viewer users to the matching
   group. Add yourself (the delivering practitioner) to `Checkpoint
   Practitioners` too, on every client tenant you manage.
5. The group names must match exactly (`Checkpoint Practitioners`,
   `Checkpoint Viewers`) — the app looks up the signed-in user's group
   membership by display name (`Graph.detectRole()`, graph.js) to decide
   which of the two experiences to show.

If neither group exists yet (a fresh tenant, or you've chosen not to set
this up), Checkpoint shows everyone the full Practitioner experience —
this is a deliberate fail-open default at the **UI** layer (see below),
not a security gap: nobody's SharePoint write access changes based on
whether these groups exist.

**Detection, not enforcement — read this before touching the readOnly
code path.** `Graph.detectRole()` (graph.js) and the `READONLY` flag it
sets (app.js) are UX only. They decide which buttons this browser tab
shows as clickable — nothing more. **The actual enforcement is, and must
always be, the SharePoint list/library permissions set up in steps 2–3
above.** Every mutating call this app makes still goes through
`Graph.g()`/`Store.updateX()` straight to SharePoint, which checks its
own permissions on every single call regardless of what this flag says.
If `READONLY` is ever wrong — a stale cache, a bug in this detection
code, a user disabling JavaScript or editing the page's DOM directly, a
signed-in Viewer opening the browser console and calling
`Store.updateControl(...)` by hand — the worst case is a confusing UI
state, never a data write a Viewer wasn't actually permitted to make,
because SharePoint's own permission check is what's actually stopping
it. Do not remove the SharePoint-side group permissions and rely on this
flag instead of them; do not treat a passing UI test as proof a Viewer
can't write.

What a Viewer sees: the Dashboard, Board view (their default landing
view instead of the Dashboard practitioners get), Statement of
Applicability, every register, and every generated report — all fully
visible, exactly as a Practitioner sees them. Every control that adds,
edits, toggles, verifies, uploads, approves, dismisses, or emails
something is disabled (and a handful of standalone "+ Add" entry-point
buttons are hidden outright, since there's nothing useful behind a
disabled submit button at the end of an otherwise-empty form) — clicking
one directly (bypassing the disabled attribute, e.g. via devtools)
toasts "Read-only access — ask a practitioner to make this change." and
does nothing further; it never reaches a `Store.*` call. `MUTATING_ACTIONS`
(app.js) is the explicit, hand-maintained list of which `App.xxx` action
names are gated — kept as an explicit list rather than a naming-
convention regex, since a few `toggleAdd*` actions only show/hide a
form panel and don't themselves write anything.

**Previewing the Viewer experience without real SharePoint groups:**
append `&role=viewer` to the demo URL — `?demo=1&role=viewer` — which
drives the same `READONLY` flag from a query-string flag instead of a
live group-membership check, purely so you can show a client (or QA the
UI) what their Viewer session looks like without needing a real tenant
and real SharePoint groups set up first. This has no effect outside
demo mode.

### 5b. Policy attestation — the one list ordinary staff need to write to

Everything else in Checkpoint is written by Practitioners. Policy
attestation is different by design: it records that *each employee* has
read a specific version of a specific policy (ISO 27001 A.5.1 — policies
"communicated to and acknowledged by relevant personnel" — plus A.6.3,
SOC 2 CC1.4/CC2.2). An auditor samples individuals, so the evidence has
to be a row per person with that person's own acknowledgement against
it, not a practitioner ticking a box on their behalf.

The same is true of awareness training (§5c): a completion record is
that person's own record of their own competence, so they have to be
able to write it.

That means the wider staff population needs **Contribute** on
`Checkpoint Attestations` and `Checkpoint Training`, and **Read** on
`Checkpoint Documents` so they can open the policy they are being asked
to acknowledge. Nothing else.

1. In the same **Advanced permissions settings** screen as §5a, **Create
   group** → name it `Checkpoint Staff` → add everyone who will be
   included in attestation campaigns (or, more practically, add the
   tenant's existing "All Staff" security group to it).
2. Break inheritance on `Checkpoint Attestations` and
   `Checkpoint Training`, and grant `Checkpoint Staff` **Contribute** on
   both.
3. Grant `Checkpoint Staff` **Read** on `Checkpoint Documents`.
4. Grant nothing else. A member of `Checkpoint Staff` who is not also a
   Practitioner or Viewer sees the app, can acknowledge their own
   policies, and every other register fails to load for them — which is
   the intended outcome, not a bug.

Two consequences worth being explicit about with a client:

- **The app itself does not enforce this split.** `READONLY` disables
  practitioner buttons in the UI, and `App.acknowledgeAttestation`
  refuses to write a row addressed to anyone but the signed-in UPN — but
  SharePoint's own list permissions are the actual security boundary, as
  everywhere else in Checkpoint. Set them.
- **Acknowledgement is version-specific.** A row records agreement to,
  say, v1.3. Reissue that policy as v2.0 and you run a fresh campaign;
  the v1.3 rows stay as true statements about v1.3 rather than silently
  re-pointing at text nobody agreed to.

### 5c. Awareness training

The Training view ships three written courses — Security Awareness,
Privacy & Personal Information, and Using AI Safely and Responsibly —
each about fifteen minutes with a five-question comprehension check.
They are filtered to the frameworks the tenant is licensed for.

Three things worth knowing before you deliver this to a client:

- **Completion means passing the check, not opening the page.** A.6.3
  and Clause 7.2/7.3 ask for awareness and competence to be
  demonstrated. Retries are unlimited and wrong answers explain
  themselves — the goal is that the point lands, not that anyone fails
  — but the record carries the score and the attempt count, because a
  course everybody needs four attempts at is telling you something.
- **The `training` posture check is now real.** It was previously
  `scored: false` with no signal at all. It is computed from the
  Training register at scan time, and with *no* records it still
  resolves to `manual` — a client running awareness training in a
  separate LMS is never scored down for leaving no trace in Checkpoint.
  Any overdue incomplete assignment caps the check at `fail` regardless
  of the completion percentage.
- **Phishing simulation is deliberately not duplicated.** Microsoft
  Defender for Office 365 P2 ships Attack Simulation Training and many
  clients already pay for it; `guidance.js`'s A.6.3 entry points there
  on purpose. This catalogue covers the knowledge half of A.6.3, which
  simulation does not.

**"Catch up new starters"** assigns every licensed course to anyone in
the directory who has never held it. It is a "who is missing this,
ever?" sweep rather than a query for recently-created accounts — which
means it is idempotent, and it catches the person who has been there two
years and was never assigned the training at all. That person is a
bigger audit problem than last week's new starter, and a date filter
would hide them permanently.

**Jurisdiction:** the privacy course's final module covers the Privacy
Act 1988, the Australian Privacy Principles and the Notifiable Data
Breaches scheme. It is flagged `jurisdiction: 'AU'` in `courses.js` and
tagged in the reader, so for a client outside Australia you know exactly
which module to replace without reading the whole course to find it.

### 5d. Editing a generated policy

A generated policy is a **rendering** of structured content, not a
hand-written HTML file. The editable thing is therefore the content, and
**Edit content** in the Documents view edits exactly that: the
reader-facing opener, the practical examples, each rule and its reason,
roles, exceptions, non-compliance and related documents. Edits are saved
to the `Checkpoint PolicyDrafts` list and the file is re-rendered from
them.

That is what makes an edit survive approval, a version bump, a branding
change, and a future improvement to the shipped template. Title, mapped
controls and frameworks stay owned by the template, because the register
and the Statement of Applicability key off them.

**This closed a real defect.** Approval used to re-render from the
pristine template, so any edit made to the draft HTML in SharePoint
between generating and approving was silently destroyed. Every render
path now goes through the same effective-content resolver, so that
cannot happen — but it also means SharePoint is no longer the place to
edit a generated policy. Use **Edit content**.

Repeating fields are edited as one line per item with ` :: ` separating
the two halves — `rule :: reason`, `role :: responsibility`. That is a
deliberate choice over a row-based repeater: a textarea is reorderable,
bulk-editable, pasteable from a draft written elsewhere, and cannot get
into a broken intermediate state. A line with no `::` degrades to a rule
with no reason rather than being dropped.

**Word export** is offered and is explicitly one-way. Word opens the
exported `.doc` fine, but a copy edited there is no longer a managed
document — version, approval and review date stop being tracked, and the
changes will not survive regeneration. The exported file carries an
"uncontrolled copy" banner so a copy that escapes into a shared drive
still explains itself. The confirmation dialog says the same thing
before the download starts.

Campaign audiences are read from Entra via the `Directory.Read.All` scope
the app already holds from sign-in, so no new consent is triggered.
Guests, external (`#EXT#`) accounts and disabled accounts are excluded
from every audience: they cannot attest, and counting them would leave
every campaign permanently short of 100%.

---

## 6. Security posture summary (for client due-diligence)

- No backend, no database, no telemetry. Static files only, by default —
  the only exception is the optional §9 continuous-monitoring add-on,
  which a client explicitly opts into deploying into their own Azure
  subscription; it is not part of the app you host.
- All Graph calls originate in the user's browser with their own token,
  except from that same optional add-on, which uses its own separate,
  narrowly-scoped application permissions (§9) — never the interactive
  session's delegated token.
- **Incremental consent**: sign-in only ever requests the read-only
  posture-check scopes. `Sites.Manage.All` (SharePoint lists, in the
  client's tenant) is requested separately the first time registers
  are loaded, and `Mail.Send` (the Board view's "Email status update"
  button, sent as the signed-in user) only the first time that button
  is used — see §2.
- Registers inherit the client's own SharePoint security, retention,
  versioning and audit history.
- Sign-out clears MSAL tokens from browser storage.
- **Redirect-flow auth, sessionStorage cache**: sign-in uses MSAL's
  full-page redirect flow (not a popup), and tokens/account state live
  in `sessionStorage`, not `localStorage` — cleared automatically when
  the tab closes, not just on explicit sign-out. The Partner Console's
  isolated per-client-sync MSAL instance already worked this way; the
  main session now matches it.
  **UX difference this introduces**: clicking "Sign in" navigates the
  whole tab to Entra's sign-in page and back, instead of opening a
  popup — a brief full-page transition rather than a popup window. Any
  in-progress Graph call that unexpectedly needs interactive
  re-authentication (an expired/invalid session mid-action) will also
  redirect the whole page away, meaning whatever the user was doing
  gets interrupted rather than resumed after a popup closes — this is
  rare in practice (silent token refresh handles the normal case) but
  is a real, occasional difference from the popup flow's behaviour.
  Session state now also does not persist across a full browser
  restart or tab close — each new tab/session requires signing in
  again, which is the deliberate trade for not leaving tokens sitting
  in `localStorage` indefinitely.
- **No third-party CDN dependency**: MSAL.js is vendored locally
  (`public/checkpoint/msal-browser.min.js`, pinned to an exact upstream
  version), and both fonts (Fraunces, Manrope) are self-hosted
  (`public/checkpoint/fonts/`) — nothing the app depends on to render or
  authenticate is fetched from any third party except Microsoft's own
  endpoints (Graph, Entra sign-in). Bump the vendored MSAL file
  deliberately on upgrade: download the exact npm tarball for the target
  version, extract `package/lib/msal-browser.min.js`, replace the file,
  update its version string and SRI hash in `index.html` — see
  `RELEASE.md` §2. Checkpoint's own five scripts (`config.js`/`graph.js`/
  `store.js`/`lib.js`/`app.js`) need no manual cache-buster at all: the
  build pipeline content-hashes them and regenerates their SRI hashes
  automatically (`RELEASE.md` §1).
- A `Content-Security-Policy` meta tag restricts script/connect/style/font
  origins to exactly what the app calls (self, Google Fonts, Graph,
  Entra sign-in) — a compromised/injected script can't phone home
  anywhere else, and no script can load from any origin but this one.
- Evidence links (control/action evidence URLs) are restricted to
  `http://`/`https://` at both save-time and render-time — a
  `javascript:` URI or similar can never be persisted or rendered as a
  clickable link.
- The shared HTML-escaping helper used throughout the UI escapes `&`,
  `<`, `>`, `"` and `'` — safe wherever its output lands inside an
  HTML attribute (e.g. `href="..."`), not just inside element text.
- **No lock-in, offboarding is trivial**: every register (Risks,
  Actions, Controls/SoA, Internal audits, Management review, Compliance
  calendar, Audit log, Vendors) already lives in the client's own
  SharePoint lists — nothing proprietary, nothing this app holds that
  they don't already have. On top of that, every register also has an
  "Export CSV" button (top of its own view) that builds a flat,
  Excel-ready CSV entirely in the browser — a `Blob` download, no
  server round-trip, no data leaving the tab except to the client's own
  disk. "Export all (zip)" (Frameworks/Settings → Data export) bundles
  every register's CSV into one `.zip`, built with a small
  dependency-free STORE-method ZIP writer
  (`CheckpointLib.buildZip()`) rather than a package — no npm zip
  library needed for files this size. If a client ever stops using
  Checkpoint (or you stop delivering to them), they keep both: the
  SharePoint lists themselves (unaffected — this app never owned that
  data, it only ever read/wrote a client's own tenant), and, if they
  want a portable snapshot for an offline archive or handing to an
  auditor, a one-click flat-file copy of everything. Every export —
  single-register or the full zip — is logged to the audit log
  (`'Register exported (CSV)'` / `'All registers exported (ZIP)'`), same
  as any other tracked action in this app, and works identically for a
  Viewer as for a Practitioner (§5a) — exporting never writes to a
  register, so it isn't part of the read-only gating.

- **Onboarding: CSV import (Risks and Actions)**: the mirror of the
  export above, and the answer to "we already have a risk register in a
  spreadsheet". The "Import CSV" button next to Export on the Risks and
  Actions views reads a file entirely in the browser, matches its
  headers (case, spacing and punctuation are ignored, and common
  aliases — `Risk`/`Title`/`Description`, `L`/`Likelihood`, `Due
  date`/`Due` — all resolve), validates every row against the app's own
  vocabularies, and then shows exactly what it will do before writing
  anything. Three deliberate constraints make this safe to point at a
  live register:
    - **Add only.** Import never updates or overwrites. Any `ID` column
      in the file is ignored and fresh sequential IDs are assigned, so a
      re-import duplicates visibly rather than silently rewriting
      records someone has since edited. (The highest existing ID is read
      once, before the batch — reading it per row double-counts, because
      each write raises the max the next read sees.)
    - **A bad row skips itself, not the file.** Invalid rows are listed
      individually in the preview with the line number as Excel shows
      it and the reason, and the valid rows still import.
    - **Nothing writes before a human confirms.** Parse → validate →
      preview → confirm → write, with each write individually caught so
      one SharePoint rejection doesn't cost the rest of the batch. The
      audit entry (`'Register imported (CSV)'`) records what actually
      happened, including partial failures.
  Only Risks and Actions are importable: they are the registers an
  organisation actually arrives holding, whereas the audit log, calendar
  and controls are generated by Checkpoint itself and a bulk write into
  them would be forging a record rather than migrating one. Imported
  actions deliberately accept no `Risk` column — that link drives
  residual re-scoring and risk closure, and a link to an ID that doesn't
  exist in the tenant would leave a risk permanently un-closable, so
  linking happens in the UI where the picker can only offer real risks.
  Unlike export, import **is** gated as a mutating action (§5a): a
  Viewer can't run it.
  The parse/validate half lives in `lib.js`
  (`parseCsv()`/`planCsvImport()`, covered by `test/csv-import.test.mjs`)
  and is pure — it reports a plan and never writes.

- **Segregation of duties (A.5.3)**: ISO 27001 A.5.3 asks that
  conflicting duties be separated so no one person can both perform and
  authorise the same act. The two places that matters in Checkpoint are
  approving a policy document and accepting a residual risk — in both, a
  practitioner is recording a decision that is supposed to have been
  made by someone with the authority to make it. Before either, the app
  compares the signed-in account against the record's originator (the
  earliest audit-log entry for that target — the log is the right source
  because it is hash-chained and never rewritten, and taking the
  *earliest* entry means new creation paths added later are covered
  without this needing to know their names).
    - Identity matches on the Entra account id first. Display name is a
      fallback only where one side has no id (demo mode, or entries
      predating `actorId`), and the audit note says which of the two it
      was, because a name match is weaker evidence.
    - Two different account ids are **never** a conflict even if the
      display names match — two real people called J. Smith is not a
      segregation failure, and false conflicts are what train people to
      click through the warning.
    - A record with no recorded originator (imported, or created before
      this was tracked) is not a conflict.
    - The comparison is against the **signed-in account**, not the
      free-text "Approved by"/"Accepted by" field. That field is often a
      third party whose decision is being transcribed (a CEO's sign-off
      recorded in a management review), and treating a transcription as
      a conflict would be wrong. What A.5.3 is about here is whether the
      person operating the app can wave through their own work.
  The `sodEnforced` setting (Settings → Automation & cadence) decides
  what happens on a conflict: off (the default) warns and continues, on
  refuses. It defaults **off** deliberately — Checkpoint's typical
  operator is a one- or two-person consultancy where the practitioner
  legitimately is the only person in the tenant, and defaulting it on
  would lock them out of approving anything on day one. Either way the
  self-approval is written into the audit entry's `after` field, so it
  is covered by the hash chain and an auditor asking "did anyone approve
  their own work?" gets an answer from the log rather than from whatever
  the setting happened to be at the time. The comparison itself is pure
  and lives in `lib.js` (`evaluateSegregation()`, covered by
  `test/segregation.test.mjs`).
  As with the Viewer role (§5a), this is UX and record-keeping, **not**
  enforcement: SharePoint list permissions are the only real boundary.
  A determined practitioner can still approve their own work by turning
  the setting off — but not without that being visible in the log.

---

## 7. Selling additional frameworks (ISO 42001, SOC 2, etc.)

A valid, current **activation** now licenses the WHOLE app for a real
tenant — not just which framework toggles are on. Checkpoint refuses
to provision a brand-new tenant at all without one, and an already-
provisioned tenant goes read-only once its activation expires past a
grace period, without one. ISO 27001 is the one exception: it's the
included baseline, always on regardless of activation state, same as
this app's provisioning default has always been. Every other framework
is licensed by an activation's `frameworks[]` list.

Once a framework is licensed, its Statement of Applicability tab
appears immediately, a new readiness KPI appears on the Dashboard, and
its own audit reports become available. Losing licensing (expiry, or a
reissued file that no longer names it) never deletes a framework's
data — it just stops appearing as licensed; see §7a's "graceful
states" for exactly what a client sees in each case.

### 7a. Signed activation files — issuing, verifying, and what each state means

**Why not just a toggle?** The old version of this feature was an
honour-system toggle any signed-in user could flip themselves — nothing
stopped a client (or a curious employee) from turning on a framework
they hadn't purchased, and nothing stopped a client from continuing to
use Checkpoint at all once their engagement ended. A signed activation
file closes both: only Compliance365 holds the private key that can
produce a file Checkpoint will accept, the file is scoped to one
specific tenant, and it gates the whole app, not just a UI toggle.

**Design.** An activation file is a small JSON document:
```json
{
  "payload": { "tenantId": "...", "type": "client", "frameworks": ["iso27001","soc2"], "issuedAt": "2026-07-09", "expiry": "2027-07-09", "graceDays": 14 },
  "signature": "base64 Ed25519 signature over the payload"
}
```
`tenantId` is either the client's Entra tenant ID (a GUID) or one of
their verified domains — Checkpoint fetches the signed-in tenant's own
GUID *and* every verified domain (`Graph.tenantInfo()`, one
`/organization` call, `$select=id,displayName,verifiedDomains`) and
accepts a match against any of them (case-insensitive). `graceDays`
(default 14 if the field is omitted, matching `evaluateEntitlement()`'s
own default) is how many days past `expiry` Checkpoint keeps operating
normally before forcing read-only.

`type` is `'client'` (the default — including for every file issued
before this field existed, via `evaluateEntitlement()`'s
`normalizeEntitlementType()`), `'partner'` (every framework unlocked,
plus access to the separate owner console — see §7b below; meant for
Compliance365's own tenant only) or `'demo'` (the same
"everything unlocked" grant, but for a prospect tenant during a sales
trial — shows a persistent "Trial — N days remaining" banner while
valid, then the exact same read-only degradation as any other type on
expiry, no special leniency). See `tools/ISSUANCE.md` §8 for the CLI
flags, the `--i-know` guard on `partner`, and the trial-to-client
conversion flow.

**Previewing the trial banner locally, without a real activation
file**: demo mode reads `?entType=client|demo` to simulate either
experience (the trial banner or not) — never a real tenant, only ever
demo mode. `entType=partner` does nothing here any more — the owner
console it used to unlock lives in a separate app now (§7b) with its
own local-dev bypass, since this client bundle has no partner-only UI
left to preview.

### 7b. The owner console — a separate app, not a feature of this one

Everything that used to be an internal-only "Partner Console" tab in
THIS app — the client roster, renewal tracking, module-licensing
matrix, per-client sync — is a **separate static page and JS bundle**:
`public/owner/index.html` + `public/owner/owner.js`, served at `/owner/`.
This client-facing bundle (`app.js`, `index.html`, everything under
`public/checkpoint/` except the handful of files listed below) contains
none of that code, none of those SharePoint list definitions, and no
route to reach it — grep the built `dist/checkpoint/*.js` for
`partner`/`Partner` yourself; the only hits left are the licence
`type` enum (`'client'|'partner'|'demo'`, needed so this app can still
correctly show "Type: partner" in its own Licence panel if this
tenant's own activation happens to be partner-type) and unrelated
English usage, never Partner Console feature code.

The owner console shares several files with this app — **the same
physical file**, not a duplicate, referenced by a relative
`../checkpoint/...` path: `config.js`, `version.js`, `graph.js`,
`lib.js`, `devflag.js`, `msal-browser.min.js` and `styles.css`.
`scripts/hash-checkpoint-assets.mjs` content-hashes each of these once
and rewrites BOTH `index.html`'s script/link tags to the same hashed
name — see that script's own comment for exactly which files are
shared vs. bundle-only. `store.js`/`ai.js`/`report.js`/`guidance.js`/
`templates.js`/`changelog.js`/`selftest.js` are never loaded by the
owner console at all; it talks to Microsoft Graph directly
(`window.Graph.g()`/`gAll()`) for its own "Checkpoint Partner ..."
lists rather than sharing `store.js`'s private state.

**Access gate**: identical trust model to this app — the owner console
only ever renders once a Compliance365 activation for THIS tenant
verifies AND its `type` is `'partner'`; anyone else who finds `/owner/`
sees nothing but its own activation screen (no hint about whether some
OTHER activation type is on file). Same dual-store persistence
(localStorage + this tenant's `Checkpoint Settings` list, if it exists)
and Licence panel design as this app's own §7a.

**Deployment note — Entra redirect URI**: MSAL's redirect URI is
computed from the current page's own URL (`graph.js`'s
`init()`/`signIn()`), so this tenant's Entra app registration needs
BOTH `.../checkpoint/` and `.../owner/` listed as allowed SPA redirect
URIs, not just the former — add the second one when this ships.

**Local-dev preview without a real partner activation**: same
`devflag.js`/`CHECKPOINT_DEV_BYPASS` flag as before (see `lib.js`'s
`isDevBypassActive()` — both a truthy flag AND a localhost-family
hostname required), just consumed by `owner.js` now instead of
`app.js`. Ships `true` in source, forced to `false` in every built
`dist/` by `scripts/hash-checkpoint-assets.mjs`'s
`enforceDevBypassOff()` (asserted, not assumed) — see that script's
own comment, and `test/dev-bypass.test.mjs`, for why this is enforced
at build time rather than left to code review.

**Provisioning**: the owner console's own one-click setup screen
creates four SharePoint lists in Compliance365's own tenant —
`Checkpoint Partner PartnerClients`, `PartnerEntitlements`,
`PartnerPrices` and its own `AuditLog` (distinct from this tenant's
regular `Checkpoint AuditLog`, if it also runs this client app on
itself) — reusing the exact same idempotent create-if-missing shape
this app's own `ensureLists()` uses, just against that list prefix.
It also migrates the one genuine legacy artifact left to migrate: a
`checkpoint-portfolio-v1` localStorage relic from before the Partner
Console existed at all, in whichever single browser last used that
old standalone view.

**Insight views**: the owner console's tab bar has, alongside the
client roster, four views built from that same roster/entitlement data
plus `PartnerPrices` — see `tools/ISSUANCE.md`'s "Pricing and the four
owner-console insight views" section for the full detail. In brief: a
**Revenue board** (active annualised revenue, revenue by module,
committed-next-12-months vs. expiring-unrenewed, trial pipeline value —
all pure functions of `PartnerEntitlements × PartnerPrices`, see
`computePartnerRevenue()` in `lib.js`); a **Renewals runway** (a 12-month
expiry timeline with 90/60/30-day colour bands, an owner-set
`ManualStatus` per entitlement, an "expiring in 30 days" total, and a
"prepare renewal" action that pre-fills the `issue-entitlement.mjs`
command with the client's existing terms — it never signs anything
itself); a **Module adoption matrix** (licensed+active / licensed+dormant
[no scan activity in 30+ days] / not-licensed per client × module, plus
a "next best module" upsell hint computed per client from their own
last-synced control rows via `computeNextBestModule()`); and a **Client
health strip** (a worst-first R/A/G rollup per client —
`computeClientHealth()` — feeding a one-line summary card at the top of
the console). Every number on every view is labelled with its source
and an "as at" timestamp; a client with no `LastSynced` date shows
"never synced" rather than a guessed figure.

**New client**: a seventh tab turns "we just closed a deal" into one
form instead of a CLI session — client/contact details, a priced module
checklist with a running total, term (12/24/36 months) and type (client/
trial), format-checked and duplicate-warned against the existing roster.
"Generate" builds the exact `issue-entitlement.mjs` command (this
console never holds the private key — see ISSUANCE.md), with an
optional signing-endpoint fast path if one's configured
(`CONFIG.signingEndpoint`); "Record entitlement" writes the roster row
(Prospect -> Active) and the entitlement itself. "Prepare renewal" (the
Renewals runway) opens this exact same form, pre-filled. "Send welcome
pack" composes an editable, report-styled onboarding email with a
quick-start guide attached from the practitioner's own mailbox, and
starts the client's four-stage progress checklist (pack sent -> activated
-> first scan -> synced, each stage after the first derived from what a
later sync finds — never hand-set) shown in their drawer. Full detail,
including the signing-endpoint trade-off, in ISSUANCE.md.

The signature is Ed25519, produced by `tools/issue-entitlement.mjs`
(Node, using `node:crypto`'s WebCrypto implementation) over a
deterministic (sorted-keys) JSON encoding of `payload`
(`CheckpointLib.canonicalJson()`). Checkpoint verifies the exact same
way in the browser, via `crypto.subtle` — `verifyEntitlementSignature()`
in `public/checkpoint/lib.js`, the one file both the CLI and the app
import, so "what gets signed" and "what gets checked" can never drift
apart. The public key that verifies every file lives in
`config.js`'s `entitlementPublicKey` (base64, 32 raw bytes) — safe to
ship in a public, client-side file, since a public key can only verify
signatures, never produce them.

**Issuing, renewing, key handling and revocation's real limits**: see
[`tools/ISSUANCE.md`](../../tools/ISSUANCE.md) — the full runbook,
including the client-facing email template that goes out with every
file. In short:
```
node tools/issue-entitlement.mjs keygen        # once, ever, for the whole product
node tools/issue-entitlement.mjs issue \
  --tenant <their Entra tenant ID or a verified domain> \
  --frameworks iso27001,soc2,essential8 \
  --expiry 2027-07-09 --grace-days 14 \
  --key entitlement-private.json --out acme-corp-activation.json
```
Send the resulting file to the client's practitioner — for a **brand-
new tenant**, they paste/upload it in the onboarding wizard's
**Activation** step (before site selection — nothing is provisioned
until it verifies); for an **existing tenant** (a renewal, or a
correction), they use the **Frameworks** view's Entitlement file card.
`node tools/issue-entitlement.mjs verify --file FILE.json --pubkey
BASE64` runs the same check locally before you send a file, catching a
typo'd tenant ID or an inverted expiry before it reaches the client.

**Two independent stores, reconciled — not one.** The verified raw
activation file is cached in TWO places, never just one:
- **This browser's `localStorage`** (`cpActivation:v1:<tenant>`),
  written the instant a file verifies — before any network call at
  all. This is what lets provisioning gate open using nothing but
  in-memory/local state (see below), and what a "re-run setup"/resumed
  wizard reads back even if the browser tab was closed mid-onboarding.
- **The tenant's own `Checkpoint Settings` SharePoint list**
  (`entitlementFile` key) — shared by every colleague/browser signed
  into this tenant.

Neither is "the" source of truth — the Ed25519 signature is. On every
load, `app.js`'s `resolveBestActivation()` re-verifies whichever of the
two exist and, if both verify, prefers the one with the later
`issuedAt` (`lib.js`'s `reconcileActivationSources()`), then mirrors
that winner into whichever store was missing, stale, or corrupted
(`mirrorActivationStores()`) — so a browser and a tenant's shared cache
converge instead of silently drifting apart. A stored "is this
activated" flag is never trusted on its own past the moment it was
computed; only the re-verified raw bytes count.

**Where activation gates each thing:**
- **Provisioning** — `store.js`'s `ensureLists()` refuses to `POST` a
  new SharePoint list unless `window.CHECKPOINT_ACTIVATION.verified`
  is set in memory (`assertActivationAuthorizesProvisioning()`), which
  `resolveBestActivation()` sets from EITHER store verifying — a
  brand-new tenant's Settings list obviously can't exist yet, so this
  never depends on any SharePoint state existing first. It does NOT
  gate reading/self-healing lists that already exist — a
  fully-provisioned, already-active tenant reloading the app keeps
  working even before this session has re-verified anything. Only
  actual list creation — true first-run provisioning (the wizard's
  Activation step verifies and caches locally before site
  selection/provisioning), or a rare self-heal adding a list a newer
  Checkpoint version introduced to an existing tenant — needs it.
- **Ongoing operation** — re-verified on every load
  (`reconcileEntitlementsOnLoad()`, called from `startLive()`) against
  whichever of localStorage/the tenant's cached Settings-list raw file
  exist; the signature is the truth, re-checked fresh each time, never
  trusted forever.
- **Persistence failures are loud, never silent.** A failed write to
  either store shows a specific toast naming which store failed and
  why, AND sets a standing warning that stays visible in the **Licence
  panel** (Frameworks view — the owner console, §7b, has its
  own equivalent panel for its own tenant's licence) until a later
  write succeeds or the practitioner retries from there — never a
  generic "sync issue" toast that's gone in 3.4 seconds while the app
  quietly reports success anyway. The Licence panel shows exactly
  what's held right now — type, modules, issued
  date, expiry, bound tenant, verification status, and WHERE it's
  actually stored (this browser / the tenant's Settings list / both) —
  plus a "remove licence from this browser" action that only ever
  touches the local cache, never the tenant's own copy.

**Graceful states**, all handled client-side without contacting
Compliance365:
- **Valid**: normal operation.
- **Grace** (past `expiry`, within `graceDays`): Checkpoint keeps
  operating exactly as normal — nothing is disabled — with a countdown
  banner in the Frameworks view ("in its grace period until …").
  Logged to the audit log (`'Activation in grace period'`) so there's
  a record of when the countdown started.
- **Expired** (past the grace cutoff): the app loads — **reading is
  never blocked, it's the client's own data in their own tenant** —
  but every mutating action (scan runs, add/edit/complete/approve/
  toggle/upload, provisioning) is disabled, via the exact same
  `READONLY`/`MUTATING_ACTIONS` mechanism the Practitioner/Viewer role
  model (§5a) already uses; the role chip reads "Activation expired —
  read only" instead of "Viewer — read only" so it's clear which
  reason applies. Every register, dashboard and report stays fully
  viewable and exportable. `App.applyEntitlementFile` is deliberately
  **exempt** from this read-only gate — otherwise an expired tenant
  could never renew through the UI at all, a permanent deadlock.
- **Missing / invalid / tenant mismatch**: only reached when NEITHER
  store has anything that verifies. `startLive()` never calls
  `bootUi()` — the practitioner instead sees a dedicated screen
  (`#notActivated`) explaining why, with a paste/upload box to retry
  immediately and an "Explore the demo instead" link. Pasting a
  genuinely valid file there writes it to localStorage immediately,
  before anything else, so a retry always sticks on the very next
  attempt even if the tenant's own Settings list can't be read or
  written to right then. This is stricter than "expired": at this
  point Checkpoint can't establish that this session is legitimately
  activated for this tenant at all, so no live tenant data is shown,
  even though (for an already-provisioned tenant) it may already be
  loaded in memory this session.
- A signature-tampered or otherwise corrupted cached file fails the
  same way as "missing" — fails safe, never silently trusted — and, if
  the OTHER store still has something that verifies, that copy wins
  and the corrupted one is overwritten with it.
- A failed Graph call to read this tenant's own identity
  (`/organization`) is reported distinctly from a genuine mismatch —
  "could not confirm this tenant's identity, try again" rather than
  "issued for a different tenant" — since an empty tenant-id list can
  never match anything and shouldn't be blamed on the file itself.
- Every activation event — applied, renewed, synced (a locally-verified
  copy restored into a tenant's Settings list, or vice versa), removed
  (from this browser only), in grace, expired, rejected (with the
  specific reason) — is logged to the audit log, same as any other
  tracked change in this app. "Renewed" vs. "applied" is detected
  automatically (a prior activation was already on file).

The `Checkpoint Entitlements` SharePoint list is unchanged in shape —
it's still just `FrameworkId`/`Enabled` rows, and `entitledFrameworks()`
and every other framework gate in `app.js` still just reads it. What
changed is *who's allowed to write to it*: it's now a cache of
whatever the last-verified activation resolved to, re-verified against
the cached raw file on every load — not something a signed-in user can
edit directly any more (`App.toggleEntitlement` still exists but only
ever runs in demo mode). **Demo mode is entirely unaffected** — it has
no real tenant or activation file to verify against, and never calls
`ensureLists()`'s guarded path at all, so it keeps the original free-
toggle behaviour exactly as it always worked, for exploring the app
without needing to issue yourself a file first.

**A note on tenants provisioned before this upgrade shipped**: this
tightens the rules — a tenant that was already live under the old
"framework toggles only" entitlement model, with no activation file on
record, now falls into the "missing" state above the next time it
loads, and needs a real activation file applied before anyone can use
it again (their existing data is untouched and safe throughout; they
just can't see it until reactivated). Issue and send that tenant a
proper activation file before or immediately after deploying this
change, so nobody hits a surprise lockout.

### 7b. Encrypted content packs — keeping paid content out of the shipped bundle

Every framework except `iso27001` (the included baseline) is **premium
content that never ships in the app bundle at all** — not just gated
behind a toggle, genuinely absent from the JavaScript a browser
downloads. An unlicensed copy of Checkpoint (a public clone of this
repo, a competitor's browser dev tools, anyone poking at the deployed
site) sees `window.FRAMEWORKS.soc2 = { id, name, tag, blurb, controls:
[] }` — real display metadata, zero real controls — for every premium
module, and empty `window.NIST_SUBCATEGORIES`/`window.CHECK_E8`. The
real ~1,265 controls across all eight premium packs (RFFR's 996-control
ISM mapping is most of that), their 317 guidance entries, and the 106
NIST subcategories only ever exist in memory, in a browser that just
decrypted them with a key that arrived inside a genuine, Ed25519-signed
activation file for that specific tenant.

**Build-time**: the real content lives as plaintext JSON in
`checkpoint-content/*.json` (one file per module — outside `public/`,
so Astro's build never copies it into `dist/`, and it's `.gitignore`-safe
to keep locally without it ever reaching a public deploy by accident —
though unlike the private signing key, these source files themselves
usually **are** committed, since the pack build re-encrypts them fresh
every time; only `tools/module-keys.json`, the AES keys, are secret).
`scripts/build-content-packs.mjs` (a `postbuild` step) reads each
source file, AES-256-GCM encrypts it with that module's key
(`tools/module-keys.json` — see `tools/ISSUANCE.md` §7 for generating
and rotating these), and writes `dist/checkpoint/packs/<moduleId>.<hash>.pack.json`
plus `dist/checkpoint/packs/manifest.json` (`{moduleId: {version, file,
sha256}}`). Those pack files are ciphertext — safe to host publicly
alongside the rest of the app; without the matching key a pack decrypts
to nothing meaningful (or, for a tampered/wrong-key pack, WebCrypto's
`decrypt()` simply throws — the two failure modes are indistinguishable
by design, and both are treated identically as "module unavailable").
A checkout with no `checkpoint-content/` or no `tools/module-keys.json`
still builds and runs fine — it just ships the shell + ISO 27001 only,
exactly the behaviour a fresh clone of this repo should have.

**Runtime**: `app.js`'s `mergeLicensedPacks(evalResult)` — called before
`Store.load()` in every path that can provision or self-heal a tenant's
SharePoint lists (the wizard's Activation step, `startLive()`'s
pre-load check, and again post-load in `reconcileEntitlementsOnLoad()`
for a freshly-applied file on an already-live tenant) — fetches
`packs/manifest.json`, and for every module the current activation's
`evalResult.moduleKeys` actually carries a key for: fetches that pack
file, re-hashes it and checks the result against the manifest's
`sha256` (defense-in-depth alongside AES-GCM's own authentication tag,
independent of it), decrypts it with `CheckpointLib.decryptPack()`,
validates its shape (`validatePackShape()` — the decrypted
`framework.id` must match the module it claims to be, `controls` must
be an array), then merges `content.framework.controls` into
`window.FRAMEWORKS[moduleId]`, `content.guidance` into
`window.GUIDANCE` (`Object.assign` — `soc2` and `is18` currently ship
guidance entries), and `content.extra.subcategories`/
`content.extra.checkE8`/`content.extra.checkIs18` into
`window.NIST_SUBCATEGORIES`/`window.CHECK_E8`/`window.CHECK_IS18` for
`nistcsf`/`essential8`/`is18` respectively. Every downstream reader —
`allControlSeeds()`, `reconcileControls()`, the SoA, every report —
only ever reads those same globals and needed **no changes** to work
with merged pack content exactly as it used to work with statically-
shipped content.

Decrypted content is cached only in those in-memory globals for the
lifetime of the page load (`PACKS_MERGED` in `app.js` just tracks which
modules this load has already merged, to avoid re-fetching if
`mergeLicensedPacks()` is called from more than one hook point in the
same load) — **never written to `localStorage`**, so every reload
starts from ciphertext and re-verifies from scratch, the same trust
model as the activation file itself.

**Failure modes are per-module and fail soft**: the manifest fetch
failing entirely leaves every premium module at its empty stub — the
app still works fully on the ISO 27001 baseline (and, for an already-
provisioned tenant, whatever Controls rows already exist in SharePoint
from a previous successful merge — those are the tenant's own data and
stay readable regardless). A single module's pack fetch failing, its
hash not matching the manifest, its key being wrong or absent from the
activation, or its decrypted content failing shape validation, all
leave *that module alone* at its empty stub with a warning logged —
every other, correctly-keyed module still merges normally.

**Honest limit, same class as §7a's revocation section**: the module
key lives inside the same signed payload as everything else in the
activation file, not behind some second, independently-derived layer —
deliberately, since any secret this client-side app could derive to
build a second layer would be equally derivable by an attacker reading
the same public `app.js`. The real protection boundary this design
draws is "a public, unlicensed copy of the app/repo has zero premium
content, ever" — it does **not** claim to stop a legitimate customer
who deliberately extracts their own tenant's module key from their own
activation file. That's an accepted trade-off, not an oversight — see
`tools/ISSUANCE.md` §7 for what rotating a compromised module key
actually does about it.

### Adding a brand-new framework to the registry (e.g. SOC 2)

This is a one-time change *you* make in the codebase, not something a
client does per engagement. ISO 27001 is the one framework that still
lives directly in `store.js`; every other framework is premium content
and belongs in a `checkpoint-content/*.json` pack source file instead
(§7b) — the steps below describe that path; only step 1 differs for
`iso27001` itself.

1. Create `checkpoint-content/<moduleId>.json`: `{ moduleId, version: 1,
   framework: { id, name, tag, blurb, controls: [...] }, guidance: {...},
   extra: {...} }`. Each control needs `code` (unique across the WHOLE
   registry — it doubles as the lookup key risks reference), `t` title,
   `app` default-applicable, `map` cross-framework references. `guidance`
   and `extra` (`subcategories` for a NIST-CSF-shaped framework,
   `checkE8` for an Essential-Eight-shaped one) are optional, empty
   objects if unused. In `store.js`, add the matching **empty stub**:
   `{ id, name, tag, blurb, controls: [] }` to `window.FRAMEWORKS` (the
   stub's metadata is what an unlicensed session ever sees — see §7b).
2. Generate a module key for it (`node tools/issue-entitlement.mjs
   keygen-modules --modules <moduleId>` — see `tools/ISSUANCE.md` §7)
   and rebuild (`npm run build`) so `build-content-packs.mjs` produces
   its pack file and adds it to the manifest.
3. Add the new framework's id to `window.FRAMEWORK_ORDER`.
4. Deploy, and start issuing activation files that name it (§7a/§7's
   `--frameworks`/`--module-keys`). Existing client tenants self-heal:
   the next time a licensed tenant's activation merges that module's
   pack, `reconcileControls()` in `store.js` notices the new framework's
   control rows are missing from their `Checkpoint Controls` list and
   adds them automatically (switched off, ready to be enabled from the
   Frameworks view).
5. Extend `CHECK_DEFS` and the `TPL` proposed-risk templates in `app.js`
   only if the new framework has its own Graph-verifiable posture checks.
   Most frameworks are largely process/governance controls assessed
   manually via the SoA rather than scanned — but where a genuine subset
   of a framework's controls does have a live technical signal (see
   `CHECK_E8`/`CHECK_IS18`/`CHECK_RFFR`/`CHECK_ISO42001`/`CHECK_ISO27701`/
   `CHECK_SOC2`/`CHECK_NISTCSF` in store.js), add a flat `checkId ->
   control code(s)` table to that module's `extra` in
   `checkpoint-content/<module>.json` instead of a new `CHECK_DEFS`
   entry — the existing scan already produces the signal, this just
   tells the SoA which control(s) it speaks to.

## 8. Enterprise features (all shipped)

- **Full framework control sets**: ISO 27001 (93), ISO 42001 (38), SOC 2
  (61 — the full mandatory Common Criteria series plus Availability,
  Confidentiality, Processing Integrity and Privacy), ISO 27701 (50 — the
  full Annex A/B PII controller and processor control sets, 2019
  edition), DISP/IRAP (34 — organised by DISP membership level, see
  below), NIST CSF (22 categories seeded by default, optionally 106
  subcategories on top — see below), Essential Eight (32 — 8 strategies
  × the ACSC Essential Eight Maturity Model's 3 maturity levels, see
  below). 330 controls seeded by default, cross-mapped to each other.
- **Essential Eight maturity model**: each of the 8 strategies (E8.1-E8.8)
  carries three child controls, `E8.n-ML1`/`ML2`/`ML3`, summarising what
  the ACSC Essential Eight Maturity Model expects at each level —
  originally paraphrased from that published Commonwealth model
  (CC BY 4.0), not copied verbatim; confirm current wording against
  cyber.gov.au before a real assessment. A per-client `e8TargetLevel`
  setting (Frameworks view, default ML2) scopes the Statement of
  Applicability to just that many levels per strategy and computes
  Essential Eight readiness % against the target rather than the full
  model. The SoA groups rows under each strategy with an assessed
  maturity chip — the highest level where every level up to it is
  Implemented or Not Applicable, the same "no ML2 without ML1" logic the
  real methodology uses. A posture scan also proposes maturity-level
  status changes for the checks that speak to Essential Eight
  (`CHECK_E8` in store.js — MFA, patching, macros, application control,
  admin privileges) — always as a confirm-or-dismiss suggestion in the
  SoA, never applied automatically.
- **A constraint that shapes every table below**: `checkResult()`
  (lib.js) returns `'manual'` unconditionally for any `CHECK_DEFS` entry
  with `scored:false` — before it ever looks at a real result. `backup`,
  `bcp`, `supplier` and `policy` are all `scored:false`, so a suggestion
  table keyed on any of them is dead code: it will never fire, for any
  tenant. (`training` is the one exception — `scored:true`, with
  `applyTrainingCheckResult()` computing a real result from completion
  data.) This constraint was discovered auditing the ISO 42001/ISO
  27701/SOC 2/NIST CSF tables below, at which point `CHECK_E8` and
  `CHECK_IS18` — both pre-existing, shipped since before that audit —
  turned out to have the same issue (`backup` in both, `supplier` in
  `CHECK_IS18`): those entries never fired either. Fixed the same way:
  dropped where no live alternative exists (E8.8, IS18.4.8, and four
  RFFR ISM backup controls — genuinely no Graph signal for backup
  verification exists in Checkpoint's current scope), substituted
  `guests` where a defensible one does (IS18.6.1/IS18.6.2, supplier
  controls). Every count in this document only includes checks that can
  actually fire.
- **ISO 27001 automated subset**: until now, `CHECK_CONTROLS` (lib.js/
  store.js — the canonical checkId -> ISO 27001 code table every OTHER
  framework's evidence propagates through) only drove passive
  evidence-attachment; a control's status still had to be marked
  Implemented by hand even when the live signal already proved it. A
  posture scan now proposes ISO 27001's own SoA status too, same
  confirm-or-dismiss contract as every other framework
  (`App.confirmIso27001Suggestion()`). 20 checks across 19 distinct
  A.5/A.8 codes out of 93 total — the largest distinct-code count of
  any framework, since this table is the anchor every other one's
  coverage was checked against. Unencrypted (not shipped via a licensed
  content pack) since ISO 27001 is the base framework every tenant is
  provisioned with by default.
- **ISO 42001 (AI Management System) automated Annex A subset**: a
  posture scan proposes status changes for the Annex A controls with a
  genuine live Graph signal (`checkIso42001` in `checkpoint-content/
  iso42001.json`'s `extra` — access to and monitoring of the systems,
  tooling and data an AI system depends on (AI.4.2-AI.4.6), AI system
  operation monitoring and event logging (AI.6.2.6, AI.6.2.8), incident
  communication (AI.8.4) and third-party oversight (AI.10.3, via
  `guests`)), same confirm-or-dismiss contract as Essential Eight above.
  21 checks across 10 distinct codes (added `macro` — Office macro
  settings hardened, secureScore — alongside `wdac` on AI.4.4/AI.4.2;
  same endpoint-hardening reasoning already applied to `wdac`). The
  governance-heavy Annex A controls — AI policy content, impact
  assessment write-ups, design and use-case documentation — have no
  live signal and stay self-reported by design.

  **Where the automation ceiling actually is**: audited every one of
  `CHECK_DEFS`' 25 checks against `checkIso42001` while looking for more
  wins. Of the 21 checks capable of ever firing (`scored:true`), `macro`
  above was the only one not yet mapped to an ISO 42001 control — every
  other live signal was already wired in. The remaining ~27 uncovered
  Annex A controls (AI policy, impact assessment, design/development
  documentation, most of the data-lifecycle and use-case controls) don't
  have an existing Graph signal to remap at all; genuinely automating
  more of them means building entirely new checks (new Graph calls, new
  scoring thresholds), not just wiring an existing one to a new code.
  That's a materially bigger project than this one-line addition and
  hasn't been scoped yet.
- **ISO 27701 (PIMS) automated subset**: same confirm-or-dismiss
  contract again (`CHECK_ISO27701` in store.js), but a smaller one —
  ISO 27701's own P.7.x/P.8.x controls are the privacy-specific layer
  on top of an ISMS (consent, data-subject rights, cross-border
  transfer, processor contracts), so most of it is genuinely legal/
  process rather than technical. 6 checks across 7 distinct codes:
  data-in-transit protection for PII (P.7.4.9, P.8.4.3), logging of
  third-party PII disclosures (P.7.5.3, P.7.5.4, P.8.5.3), processor
  due diligence via external access (P.7.2.6), and PII classification
  records (P.7.2.8).
- **SOC 2 automated subset**: the largest automated subset of any
  framework (`CHECK_SOC2` in store.js — 19 checks across 13 Trust
  Services Criteria codes), because the Common Criteria's CC6.x
  (logical access) and CC7.x (monitoring, vulnerability and incident
  response) series sits in exactly the same territory Checkpoint's
  posture checks already evidence elsewhere. Cross-checked for
  consistency against the existing ISO27001-anchored "SOC2 CCn.n"
  cross-references those same ISO27001 controls already carry. The
  COSO-derived governance criteria (board oversight, risk philosophy),
  availability criteria, and most Processing Integrity / Privacy
  criteria (consent, disclosure records) have no live signal and stay
  self-reported.
- **NIST CSF automated subset**: same confirm-or-dismiss contract again
  (`CHECK_NISTCSF` in store.js — 18 checks across 8 of the 22
  categories), targeting the category-level control rows that exist in
  a tenant's Controls list at either `nistDepth` setting. NIST CSF's
  categories are broad enough that a larger fraction catch a live
  signal than SOC 2 or ISO 42001's more granular controls.
- **SOC 2 Type I vs Type II**: a per-client `soc2ReportType` setting
  (Frameworks view, `Type I` default or `Type II`) plus an optional
  `soc2ObservationStart` date. Type I is the point-in-time design-
  effectiveness view every other framework's SoA already shows — nothing
  changes for a Type I tenant. Type II asks whether a control actually
  *operated* that way consistently across an observation period (the
  AICPA's real distinction), which the SOC 2 SoA now answers directly
  for every control `CHECK_SOC2` automates: `renderSoc2TypeIIRows()` in
  app.js appends a summary row under each control showing how many
  posture scans fall inside the observation window and whether any of
  them found an exception, with dates. This is computed entirely from
  data every scan already records — each Scans list item's Detail JSON
  keeps its own dated per-check results, not just the latest one (see
  `soc2ScanHistory()` in app.js) — nothing about scan capture or storage
  changed to support this. The aggregation across multiple checks
  feeding one control (`soc2ControlEffectiveness()`) and the render
  layer live in app.js; the actual per-check window math
  (`CheckpointLib.operatingEffectiveness()`) is pure and unit-tested in
  lib.js/test/lib.test.mjs, same split as `checkResult()`/`score()`.
  Controls with no live check behind them (most of the COSO governance
  criteria, Processing Integrity, most Privacy) get an explicit "gather
  this manually" prompt instead of silently showing nothing — the point
  is surfacing exactly which controls still carry manual burden for the
  observation period and which don't, never hiding the gap. Deliberately
  reports raw scan counts and exception dates, never a canned "this is
  sufficient Type II evidence" verdict — sample-size and coverage
  adequacy over an observation period is an auditor's judgement call,
  not something this app presumes to make for them.
- **NIST CSF subcategory depth**: a per-client `nistDepth` setting
  (Frameworks view, `category` default or `subcategory`) controls
  whether the Statement of Applicability shows the 22 CSF 2.0 categories
  (as it always has) or all 106 subcategories (`GV.OC-01` etc., public
  domain text from NIST CSF 2.0, February 2024 — kept concise here, not
  copied verbatim; a few categories have intentionally non-contiguous
  subcategory numbering carried over from CSF 1.1, confirm the exact set
  against nist.gov/cyberframework before a real assessment) grouped
  under their category, with each category's status derived from its
  children (Implemented only when every applicable child is). The 106
  subcategory rows are **not** seeded into a tenant's Controls list by
  default — `window.NIST_SUBCATEGORIES` in store.js stays outside
  `allControlSeeds()` deliberately — they're lazily added the first time
  a client's `nistDepth` is switched to `subcategory`
  (`ensureNistSubcategories()` in both stores), so a light-touch client
  working at category depth never has its Controls list flooded with
  106 rows it didn't ask for. Readiness %, the Dashboard's NIST CSF KPI
  tile, report generation and global search all resolve against the
  active depth via one shared `frameworkVisibleRows()`/`frameworkAppRows()`
  pair in app.js, so none of them can drift out of sync with what the
  SoA itself is showing — the same mechanism also closes an equivalent
  gap for Essential Eight's target-level scoping.
- **DISP membership-level model** — ⚠ human DISP/defence SME review
  required before this framework is sold; see the disclaimer comment
  above `window.FRAMEWORKS.dispirap` in store.js. The 34 controls are
  organised under the four DISP security domains (Governance, Personnel,
  Physical, ICT & Cyber) with a `domain` field, and each carries a
  `membershipLevel` (`Entry`/`L1`/`L2`/`L3`) reflecting the DISP
  membership tier the obligation first applies at. A per-client
  `dispTargetLevel` setting (Frameworks view, default L1) scopes the
  Statement of Applicability and DISP/IRAP readiness % to that level and
  below — the same `frameworkVisibleRows()`/`frameworkAppRows()`
  mechanism Essential Eight and NIST CSF use, so no separate SoA
  grouping code was needed for this one. ICT & Cyber controls carry an
  `ismChapter` reference (a best-effort ASD Information Security Manual
  guideline name, shown under the control's title in the SoA) so an
  IRAP-facing client can trace a DISP obligation straight to the
  relevant ISM guideline. The 6 controls added in this pass
  (`DISP.29`-`DISP.34`) cover CSO/security-officer training, notifiable-
  change reporting, an insider-threat awareness program, contact-
  reporting obligations, a physical security risk assessment, and ICT
  security incident detection/reporting — all flagged in the task that
  added them as real, previously-missing DISP obligations. All 28
  pre-existing control codes were kept stable (several other frameworks'
  controls cross-map to specific `DISP.n` codes by string), even where a
  title was reworded to correct a mismatch against the real obligation.
- **Risk appetite thresholds**: set a tolerance (Frameworks view) —
  residual risks scoring above it surface as a Dashboard breach banner.
- **Configurable posture-scan thresholds**: the Frameworks view has a
  "Scan thresholds" section for tuning `runPostureChecks` per client —
  max Global Administrators (default 4, per Microsoft's 2–4
  emergency-access account guidance), max guest users (25), max
  permanent (non-PIM) privileged role assignments (0 — Microsoft
  recommends eligible-only), device compliance pass/review % (95/80),
  and the risky-users review threshold (3). Each is stored in the
  `Checkpoint Settings` list and falls back to its documented default if
  absent, so a tenant provisioned before this feature keeps behaving
  exactly as it did before.
- **Overdue action aging**: 0–7 / 8–30 / 30+ day buckets, not a flat count.
- **Control re-verification**: a "last verified" date per control, with
  a one-click re-verify action; stale (90+ day) verifications flag
  visibly in the Statement of Applicability.
- **Evidence linking**: a SharePoint/OneDrive URL per control and per
  action, shown as a clickable link once set.
- **Trend charting**: the Dashboard sparkline now plots control-readiness
  history alongside posture score, sourced from a readiness snapshot
  taken on every scan.
- **Certification roadmap**: a live Assess → Implement → Evidence →
  Certify progress bar on the Dashboard, computed from real control data.
- **Executive summary report**: a one-page board-ready PDF — score with
  trend arrow, implementation %, critical risk count, next milestone,
  top 3 risks.
- **Owner console** (`public/owner/`, served at `/owner/` — a separate
  app from this one, see §7b): an internal-only, partner-entitlement-
  gated view across every client tenant a practitioner manages —
  client roster, entitlement expiry with 30/60/90-day renewal flags, a
  licensed-vs-active module matrix (the upsell view), and a per-client
  health drawer (last scan, posture score, readiness per framework,
  drift alerts). The roster and sync snapshots are stored as SharePoint
  lists in OUR OWN tenant (`Checkpoint Partner PartnerClients`/
  `PartnerEntitlements`/`PartnerPrices`/`AuditLog`), never a client's.
  Syncing a client is deliberately isolated from the owner console's
  own session — each sync opens its own throwaway MSAL instance scoped
  to that client's tenant (sessionStorage cache, torn down after use)
  so it can never corrupt whichever tenant is currently signed in for
  the rest of the console, and only ever reads that client's own
  Checkpoint summary.
- **Continuous monitoring (optional)**: an Azure Function App, deployed
  into the client's own subscription with its own narrowly-scoped
  application Graph permissions, re-runs posture checks daily with no
  one signed in and flags pass→fail drift as a Dashboard alert. See §9
  and `azure/README.md`. Entirely additive — the interactive app's
  delegated permission model is unchanged either way.
- **Attestation enforcement**: marking a control Implemented with no
  evidence linked prompts a confirmation ("auditors typically require
  evidence for every implemented control — continue anyway?") instead of
  silently accepting the status change. Re-verifying a control records
  who attested it (the signed-in user's name) and when, shown against
  each control in the Statement of Applicability. The Audit Readiness
  report now lists every control self-reported as Implemented with no
  evidence attached as its own flagged section — the first thing a real
  auditor will test.
- **Document library**: a real SharePoint document library
  ("Checkpoint Documents") provisioned per tenant alongside the
  registers, for the ISMS manual, policies, risk treatment plan and
  training records. Files are organised into fixed category folders
  (Policies & Procedures, Evidence, Audit reports, Risk & Treatment,
  Training records, Auto-evidence, Trust Center, Auditor Pack, Other —
  `DOC_CATEGORIES` in store.js), created automatically on first use of
  each category. Upload (up to Graph's 4 MB simple-upload ceiling) or browse
  by category from the Documents view; larger files are uploaded
  directly in SharePoint and linked as evidence instead. Files inherit
  the client's own SharePoint permissions, retention and versioning —
  nothing is duplicated outside their tenant.
- **Auto-captured evidence**: every live scan exports the raw Graph
  signal behind each check (Conditional Access policy JSON, Global
  Admin membership, PIM permanent/eligible assignments, guest user list,
  risky users, Intune device compliance, compliance policies, OAuth
  grants, Secure Score snapshot) as a dated JSON file into the
  `Documents` view's new "Auto-evidence" category, and records a SHA-256
  hash of each file in the append-only Audit log (§8) — timestamped,
  tamper-evident proof of exactly what Graph returned on that date, not
  just the pass/fail conclusion drawn from it. Each file is mapped
  (`CHECK_CONTROLS` in store.js, plus every entitled framework's own
  cross-mapping) to the ISO 27001 control(s) — and, where entitled,
  their cross-mapped equivalents in other frameworks — it evidences; if
  that control has **no** evidence link at all yet, the file's link is
  filled in automatically and tagged "Auto-captured" with the scan date.
  A manually-linked evidence URL, or an earlier auto-capture, is never
  overwritten — and editing a control's evidence by hand (the existing
  "Edit"/"Link evidence" action) always wins, clearing the auto-capture
  tag immediately. The Statement of Applicability shows an evidence
  coverage summary (auto-captured / manually linked / none) per
  framework, and each auto-captured row is marked as such next to its
  evidence link.
- **Shared evidence view**: pick any control across any purchased
  framework and see every OTHER control — in every purchased framework —
  that the same real-world evidence would also satisfy, following the
  same "Also satisfies" cross-mappings the Statement of Applicability
  already shows (traversed in both directions and transitively, since
  the seed mappings aren't always symmetric one hop at a time — e.g.
  ISO 27001 A.5.15 only lists SOC 2 CC6.1 directly, but CC6.1's own
  mapping reaches Essential Eight and NIST controls A.5.15 never
  mentions). Shows a headline "1 artefact → N controls satisfied across
  M frameworks" and a single "Apply to all" action that links one
  evidence URL to every control in that set in one go — unlike
  auto-capture, this is an explicit, visible, practitioner-initiated bulk
  edit, so (after a confirmation showing exactly how many controls and
  frameworks are affected) it does overwrite whatever was linked before,
  the same as editing each row by hand would. Every write still goes
  through `Store.updateControl` and is recorded in the audit log, one
  entry per control.
- **Vendor risk module**: a "Vendor risk" register (third-party
  suppliers with access to systems or data) — name, service, criticality,
  review status, certifications, and links to both the supplier-related
  controls (A.5.19–A.5.23, CC9.2, DISP.26) and the risk register, shown
  together in each vendor's detail view. **Data-access classification**:
  each vendor records *what data it can touch* by ticking categories
  from a fixed taxonomy (`VENDOR_DATA_CATEGORIES` in store.js — health
  information, customer PII, financial/payment data, credentials &
  secrets, production system access, employee data, company
  confidential, public-only), with a free-text detail field for
  specifics. The categories drive a **suggested criticality**
  (`suggestVendorCriticality()` in lib.js, unit-tested) shown live in
  the form and flagged in the detail drawer whenever it disagrees with
  the criticality actually set — a suggestion the practitioner can
  always override, never an automatic change. Unclassified vendors are
  visibly flagged in the register so "we never asked what data they
  hold" can't hide. "Send questionnaire" reuses `Graph.sendMail` (the
  same delegated `Mail.Send` scope, requested incrementally on first
  use, as the Board view's "Email status update") to email a vendor
  contact — the email lists the recorded data categories and asks the
  vendor to confirm or correct them — and records
  Sent/Received status and date on the vendor record — Checkpoint tracks
  the questionnaire's status, not its content; there's no inbox to read
  a reply from. Each vendor's next-review date drives one real
  Compliance Calendar entry (category "Supplier security review") kept
  in sync automatically as the vendor's dates change — the vendor
  register is the source of truth for that sync, so record a completed
  review via the vendor's own "Mark reviewed" action, not by completing
  the calendar row directly. Overdue vendor reviews surface on the
  Dashboard governance card and as a nav badge, and every vendor
  add/edit/questionnaire/review action is written through `Store`'s
  vendor methods and recorded in the audit log, same as every other
  register.
- **AI Governance module (ISO 42001)**: an "AI systems" register — name,
  purpose, owner, data sources, model type, vendor, EU AI Act risk tier
  (Prohibited/High/Limited/Minimal), impact assessment status, human
  oversight arrangements, last reviewed — gated entirely behind the
  iso42001 entitlement: the nav item, the register view, and the
  scan-time discovery step below all disappear the moment ISO 42001 is
  switched off, same as toggling any other framework. Each system's
  linked ISO 42001 controls (Annex AI.5 impact assessment, AI.6 life
  cycle, and others) are computed live from which fields are actually
  documented on that record (`aiControlsFor()` in app.js) — never a
  manually-picked list that can drift out of sync with the record
  itself. **Bug fixed while auditing the framework content for
  accuracy**: `aiControlsFor()` still returned the pre-rename bare
  `A.x.y` codes after ISO 42001's own Annex A numbering was given the
  `AI.` prefix (see the dangling `A.9.2`/`AI.9.2` fix elsewhere in this
  doc, from the same rename). Some of those bare codes coincidentally
  collided with real ISO 27001 codes and the rest matched nothing, so
  `openAiSystem()`'s `S.controls.find(fw === 'iso42001' && …)` silently
  matched zero of them — the drawer's "ISO 42001 controls evidenced"
  panel showed dangling, title-less codes for every AI system instead
  of the real linked control. Fixed by prefixing every code
  `aiControlsFor()` returns with `AI.`.

  **Automated discovery**: every live scan (while iso42001 is
  entitled) reuses the OAuth grants the riskyapps posture check already
  fetched that scan and cross-references the tenant's enterprise apps
  (`Graph.discoverAiSystems`) against a known-AI-product keyword list
  (Copilot, OpenAI/ChatGPT, Anthropic/Claude, Google Gemini, and other
  common AI SaaS) — no extra Graph permission needed, since reading
  enterprise apps is already covered by `Directory.Read.All` in
  `scopesReadOnly`. Matches surface as candidate AI systems on the AI
  systems view for practitioner review (add to register or dismiss,
  never auto-added), and a candidate with a high-privilege OAuth scope
  granted is also proposed as a risk through the exact same
  proposed-finding pipeline every other scan finding uses — no separate
  approval UI.

  **EU AI Act risk classification (built)**: the risk tier field used to
  be a bare dropdown — the practitioner guessed. `classifyAiActRisk()`
  in `lib.js` (shared with the test suite and, via a plain `<script
  src>`, with the free public classifier on the marketing site — see
  below) now computes it from a 19-question checklist tied one-for-one
  to a published clause: Article 5(1)(a-h)'s eight prohibited practices,
  Annex III(1-8)'s eight high-risk categories, Article 50(1-3)'s three
  transparency triggers. Tier is the single highest severity matched
  (Prohibited beats High beats Limited beats Minimal); a Prohibited
  match short-circuits everything else, since there's nothing to add
  once a system can't lawfully be deployed at all, but High and Limited
  obligations *stack* — a high-risk system that also talks directly to
  users still owes Article 50 transparency on top of its Annex III
  checklist, not instead of it. Deliberately a screening aid, not a
  legal engine: every question flags a published criterion and leaves
  the Act's own fact-specific carve-outs (narrow law-enforcement or
  medical exceptions to the Article 5 bans, for instance) to counsel
  rather than guessing at them — the UI says so, twice.

  The questionnaire renders live in the Add/Edit AI system panel
  (`renderAiActQuestions()`/`recomputeAiActSuggestion()` in app.js),
  auto-fills the risk tier select as boxes are ticked, but never locks
  it — a practitioner who disagrees can still override by hand, and
  re-opening an overridden record shows the saved override, not a
  silent snap-back to the algorithm's own suggestion (`editAiSystem()`
  restores `a.riskTier` *after* `renderAiActQuestions()` runs, for
  exactly this reason). Answers persist as one JSON-blob SharePoint
  column (`AISystems.AiActAnswers`, self-heals onto existing tenants the
  same way every other column here does — no migration needed for
  systems added before this shipped, they just show as unclassified
  until edited). The AI system drawer shows the live-recomputed reasons
  and obligations under "EU AI Act obligations" — framed as "why the
  tool suggested this," since a hand-overridden tier can legitimately
  disagree with a fresh recompute of the same stored answers, and that's
  expected, not a bug.

  **The same engine is public** — `src/components/EuAiActClassifier.astro`
  loads `/checkpoint/lib.js` as a plain script (same tag `index.html`
  itself uses) and renders the identical 19-question checklist as a
  free, no-sign-up tool, embedded on the ISO 42001 service page and the
  ISO 42001/NIST AI RMF/EU AI Act crosswalk resource. One source of
  truth by construction — the public tool and the in-app one cannot
  drift apart, because they're loading the same file, not two
  hand-maintained copies of the same 19 questions.
- **In-app modals, not native prompt()/confirm()**: every confirmation
  and text-entry dialog in the app (evidence URLs, portfolio add-client,
  email recipients, reset/verify confirmations) is a custom modal
  matching the drawer/toast styling — built with `createElement`/
  `addEventListener` only, never inline handlers, so nothing rendered
  into a modal can execute as script. Inputs are validated before
  accepting (URLs via the existing `isSafeUrl`, emails via a simple
  pattern), with an inline error shown in place rather than a toast
  after the fact. Esc cancels, Enter confirms (single-field forms) —
  same keyboard flow `prompt()`/`confirm()` had, just themed and
  validated. See `showModal()` in app.js.
- **Test suite for the credibility-critical logic**: `residual()`,
  `band()`, `score()`, `checkResult()`, the readiness-percentage math and
  `parseMapTokens()` (the "Also satisfies" cross-mapping parser) were
  extracted from app.js's IIFE into `public/checkpoint/lib.js` — a
  small, dependency-free module with no reference to `S`/`Store`/the
  DOM, so it can be unit-tested directly. `npm test` runs
  `test/lib.test.mjs` via Node's built-in test runner (`node:test` —
  zero devDependencies to install), and `.github/workflows/test.yml`
  runs the same suite on every PR and push to `main`. app.js calls into
  `window.CheckpointLib` for all of this now rather than duplicating the
  logic; behaviour is unchanged, only where the logic lives.
- **Framework registry test suite**: `test/framework-registry.test.mjs`
  validates the whole `window.FRAMEWORKS` registry structurally on every
  PR/push, alongside `lib.test.mjs` — every control code unique across
  the whole registry (no exceptions), every `map` reference resolving to
  a real control or a genuine external citation (via `parseMapTokens()`),
  no empty titles/codes, `FRAMEWORK_ORDER` and `FRAMEWORKS` agreeing with
  each other, and each framework's own category/level/depth fields
  internally consistent (SOC 2's `cat`, Essential Eight's `lvl`, NIST
  CSF's subcategory `parent`, DISP's `domain`/`membershipLevel`/
  `ismChapter`). This is the regression net for every future task that
  edits the registry — it would have caught the three real bugs found
  while building it (below) immediately, instead of relying on someone
  noticing a broken "Also satisfies" chip or a control that never
  appears in the SoA. **Three real bugs fixed while building this
  test**: ISO 27001 and ISO 42001 both used their own standard's real
  Annex A numbering with no per-framework prefix (e.g. `A.5.2` existed
  in both) — 13 codes collided; fixed by renaming ISO 42001's 38 codes
  to an `AI.` prefix (`A.2.2` → `AI.2.2`) rather than touching ISO
  27001, since ISO 27001 is the far more heavily deployed framework and
  a rename risks orphaning a live client tenant's existing evidence
  links/risk references — every `ISO42001 A.x` cross-reference elsewhere
  in the registry was updated to match. `parseMapTokens()` (moved into
  `lib.js`, shared/tested, app.js now delegates to it) didn't handle
  this codebase's own "same-framework shorthand" convention
  (`"ISO27001 A.5.29 · A.5.30"` — the second code has no prefix) and
  silently dropped those references as unresolvable. And 11 of ISO
  27001's controls cited NIST CSF 1.1-era category codes (`PR.AC`,
  `PR.IP`, `PR.PT`, `RS.RP`, bare `GV`) that don't exist in this app's
  CSF 2.0 `nistcsf` registry — retitled to the correct 2.0 equivalents.
- **Trust Center**: generates a single, fully self-contained, public
  read-only HTML page — certifications/frameworks held, SoA
  implementation %, a qualitative posture rating (never the raw numeric
  score), and an opt-in sub-processor list — into a new "Trust Center"
  Documents category. Every section is a practitioner-controlled toggle
  (Frameworks view-style switches, off by default for the sub-processor
  list specifically, since that's the most sensitive item), and
  sub-processors are opted in individually per vendor from the Vendor
  risk register. **Checkpoint never makes anything public itself** — the
  generated file depends on nothing outside itself (system fonts only,
  no reference to this app's own CSS/JS, since it's opened completely
  outside Checkpoint) and is saved to this tenant's own Documents
  library; turning it into an actual public page is a deliberate
  SharePoint sharing action ("Anyone with the link can view") the
  practitioner takes afterward, with on-screen instructions for exactly
  that step. Generating the page is recorded in the audit log.
- **Auditor pack**: assembles the current Statement of Applicability for
  a chosen framework, an evidence index (from the Documents library),
  the most recent audit log entries, and the latest management review
  record into one self-contained HTML file — enough for an external
  auditor to review via a SharePoint sharing link without ever needing a
  Checkpoint licence. The practitioner picks an intended validity window
  (14/30/60/90 days), shown on the pack's cover page — **the actual
  time-boxing and access control are SharePoint's own sharing-link
  expiry and permissions**, set when the practitioner creates that link
  afterward, not anything Checkpoint enforces or can revoke. The pack
  explicitly flags that its evidence links only work if the auditor also
  has access to the underlying Evidence/Auto-evidence folders. Generating
  a pack is recorded in the audit log; **once shared, Checkpoint has no
  visibility into who opens the link or when** — access logging beyond
  the generation event isn't possible without a backend, which this app
  deliberately doesn't have.
- **Non-conformities in the Actions register**: actions/findings now
  carry a type — Action, Non-conformity (Major), Non-conformity (Minor),
  or Observation — filterable in the register, with a manual "+ Add
  action / finding" form for capturing external/surveillance audit
  findings that didn't originate from a scan or risk. The Audit
  Readiness report calls out any open non-conformities as a standing
  recommendation.
- **Action progress log**: a new "Checkpoint ActionUpdates" register —
  every dated, attributed progress note against an action, with its own
  optional evidence link and the action's status as of that entry.
  Previously an action carried exactly one evidence field, silently
  overwritten every time it was touched, so an auditor asking "walk me
  through how this got remediated" had nothing but the current status
  and whatever note happened to be entered last. "Add update" (available
  from the action's drawer — click its ID in the register) records a
  note without necessarily changing status, so "still waiting on the
  vendor" has somewhere to live; "Complete" now asks for both a note and
  an evidence link and writes the closing entry in the same log. Entries
  are append-only — a correction is a new entry, never a rewrite, same
  immutability the audit log already relies on for its own credibility.
  The register row shows an update count so the history is visible
  before opening the drawer, and the whole log exports as its own CSV
  ("Export progress log CSV" on the Actions view) alongside the
  register's own export.
- **Internal audit programme** (ISO 27001 clause 9.2): a new "Checkpoint
  Audits" register — schedule an audit per framework with a scope,
  auditor and planned date, then mark it complete with an outcome
  summary and any finding IDs raised (created first in the Actions
  register, source "Internal audit"). Overdue planned audits badge the
  nav item and surface on the Dashboard's new Governance card alongside
  the last/next audit dates.
- **Management review register** (ISO 27001 clause 9.3): a new
  "Checkpoint Reviews" register that is a minuted record, not just a
  generated report. Recording a review auto-snapshots the live inputs
  (posture score, open/overdue actions, high/critical risks, open
  non-conformities, control readiness %, last internal audit) into a
  read-only inputs field, then captures attendees, decisions/actions
  agreed, and the next review due date. The existing "Management Review
  Pack" report (§ Audit reports) is still there for preparing the
  meeting — this register is the evidence that the meeting happened.
- **Scan cadence reminder**: a configurable interval (Frameworks view,
  default 30 days) after which the Dashboard flags the posture scan as
  overdue with a direct link to run it. This is a nudge on page load,
  not unattended automation — see the roadmap note below on what real
  scheduling would require.
- **Trend indicators everywhere**: every Dashboard KPI tile (posture
  score, high/critical risks, overdue actions, each framework's
  readiness %) shows a ▲/▼ delta vs the last scan snapshot, colour-coded
  so the right direction always reads as good. The Partner Console's
  client rows get a Healthy/Watch/Needs-attention/Not-synced status
  dot, so a practitioner managing many clients can scan for who needs
  attention without opening every row.
- **Global search**: a top-bar search box across risks, actions,
  controls, internal audits and management reviews — jumps straight to
  the right record (opening its drawer, or navigating + highlighting
  the row) instead of clicking through views by hand.
- **Compliance calendar**: a new "Checkpoint Calendar" register for
  every *other* recurring ISMS activity — access control reviews,
  BCP/DR tests, backup restore tests, supplier security reviews, policy
  reviews, security awareness training refreshes, the external
  certification body's surveillance-audit cycle, and certificate
  expiry. Completing a recurring item auto-advances its next-due date
  by its frequency; one-off items (like a cert expiry) just mark done.
  Deliberately separate from the Internal Audits and Management Review
  registers, which already own their own flows.
- **Incident register** (ISO 27001 A.5.24–A.5.28): a new "Checkpoint
  Incidents" register for information security incidents Microsoft
  Defender can't see — a lost laptop, a misdirected email, a supplier's
  own breach — as well as Defender-detected ones logged here for a single
  auditor-facing record (set "Discovered via" to Defender alert). Log an
  incident, track containment, root cause and lessons learned, and link
  it to actions raised in the Actions register. Incidents involving
  personal information are flagged for a privacy-breach assessment
  tracked against a default 30-day clock (in line with the Privacy Act
  1988 Notifiable Data Breaches scheme — a sane default, not jurisdiction-
  specific legal advice), with a Dashboard Governance card row and a nav
  badge for overdue assessments.
- **Board view**: a live, always-current, read-only summary — four
  large stat tiles, the certification roadmap, top 3 risks and upcoming
  milestones — meant to be pulled up on a screen in a meeting instead of
  screen-sharing the full console. Unlike the Executive Summary report,
  nothing here is generated-once; it's exactly the current state,
  whenever you open it.
- **Email status update**: a button (Board view) that sends the same
  summary as a real email via Microsoft Graph (`Mail.Send`), from the
  signed-in user's own mailbox — no backend, no service account, no new
  architecture. Not available in demo mode (there's no real mailbox to
  send from).
- **Append-only audit log**: a new "Checkpoint AuditLog" register and a
  read-only "Audit log" view, distinct from the Dashboard's
  plain-English Activity feed. Every compliance-relevant mutation
  records who (actor name + Entra `homeAccountId`), what, the target,
  and a before/after value: control status changes, applicability
  toggles, control verification, evidence link changes (control and
  action), risk approval/dismissal from scan findings, action
  add/complete, internal audit schedule/complete, management review
  recording, compliance calendar add/complete, and framework
  entitlement toggles. Evidence for ISO 27001 A.8.15 (logging) and
  SOC 2 CC7.2. A logging failure never blocks the action it's
  recording — it surfaces a non-blocking toast instead. Note: Microsoft
  Graph's List API (v1.0) doesn't expose a versioning toggle in the
  List resource schema, so "enable major-version history" on this list
  is a one-time manual step per tenant (SharePoint site → the
  `Checkpoint AuditLog` list → List Settings → Versioning Settings →
  turn on major versioning) if you want SharePoint's own version
  history as a second, independent copy of the trail — Checkpoint's own
  list is append-only by convention (nothing in the app ever deletes
  or edits an entry), not enforced at the SharePoint permission level.
- **Capability detection**: not every tenant has every premium licence
  or admin role a posture check depends on (Entra ID P2, PIM, Intune,
  Secure Score, Purview Information Protection, Entra ID Governance,
  the SharePoint Administrator role), and the app is honest about that
  rather than a check silently surfacing a raw Graph error.
  `Graph.detectCapabilities()` (graph.js) probes eight areas with the
  cheapest possible call each ($top=1, response discarded) —
  Conditional Access (Entra ID P1), Identity Protection (Entra ID P2),
  PIM, Intune, Secure Score, Purview sensitivity labels, Entra Access
  Reviews, SharePoint tenant sharing settings — the moment a live
  tenant boots (`detectAppCapabilities()` in app.js, called from both
  `startLive()` and `App.startDemo()`), cached for the rest of that
  page load. `runPostureChecks()` consults the same result before
  attempting each of the 17 checks one of those eight areas gates
  (`CHECK_DEFS`' `requiresCapability` field in store.js names which) —
  an unavailable capability skips the real call entirely and returns a
  clean `'manual'` result with a plain-language note instead of a raw
  error, which `score()` (lib.js) already excludes from the readiness
  denominator the same way any other manual check is excluded, so a
  tenant is never penalised for a licence or role it doesn't have. The
  other 8 scored checks (Global Admin count, guests, OAuth grants, and
  the 5 already-`scored:false` manual-only checks) have no capability
  dependency and are unaffected. A "Coverage" card on the Posture scan
  view shows each area as Available/Not licensed/No access with that
  same note; the Dashboard shows "X of 25 checks automatable in this
  tenant" via the same `automatableCheckCount()` helper. The onboarding
  wizard's step 3 (§4a) uses this exact same probe/cache — no separate
  wizard-only capability check to keep in sync.
- **Implementation guidance**: every SoA row's control code is a click
  target (`App.openControlGuidance`, app.js), opening the same shared
  drawer used elsewhere in the app with a Status section, an "Also
  satisfies" cross-mapping, and — when one exists — a guidance panel
  from `guidance.js`. That file defines `window.GUIDANCE`, a plain
  object keyed by control code (`{ how, evidence, link, checks }`),
  covering all 93 ISO 27001:2022 Annex A controls and all 33 SOC 2
  Common Criteria, written in our own words rather than lifted from any
  standard or vendor text. `how` is 2–4 sentences of practical
  Microsoft 365 guidance, `evidence` is what an auditor typically wants
  to see, `link` is a stable admin-portal or Learn URL (opened
  `target="_blank" rel="noopener"`, gated by the same `isSafeUrl()`
  guard as every other link in the app), and `checks` cross-references
  `CHECK_DEFS` ids so the drawer can show that control's latest scan
  result inline. `checks` values were derived from the existing
  `CHECK_CONTROLS` map (store.js) rather than a second hand-maintained
  list, so the two never drift apart. A missing key — any framework
  guidance.js doesn't cover yet (Essential Eight, ISO 27701, ISO 42001,
  DISP/ISM, NIST CSF), or a future new control — fails soft: the Status
  and Also-satisfies sections still render, no panel, no error. The
  admin-portal links point at well-known, stable home pages (Entra,
  Intune, Defender, Purview, the M365 admin center, Azure Portal, and
  cyber.gov.au for physical-security controls) rather than deep-linked
  sub-blades, since those are more prone to breaking as Microsoft
  reshuffles portal navigation — worth a spot-check against your own
  tenant before relying on them with a client. `guidance.js` is loaded
  and content-hashed/SRI-signed the same way as the other checkpoint
  scripts (`scripts/hash-checkpoint-assets.mjs`).
- **Policy template library**: the Documents view has a "Policy
  template library" card above the upload panel, backed by
  `templates.js` (`window.POLICY_TEMPLATES`) — ten starter documents
  written for a Microsoft 365 environment, in our own words, each with
  a `title`, `purpose`, `scope`, an array of individual `policyStatements`,
  a `reviewCadence`, and the control codes it helps satisfy: Information
  Security Policy, Acceptable Use Policy, Access Control Policy, Incident
  Response Plan, Business Continuity & Disaster Recovery Plan, Supplier
  Security Policy, Data Classification & Handling Policy, Secure
  Development Policy, AI Acceptable Use Policy, and a Privacy Policy
  skeleton. Picking a template, an owner and a review date and clicking
  Generate builds a personalised, print-ready document (organisation
  name auto-filled from `#clientName`) via `buildTemplateHtml()` +
  `printPreview()` — the same sandboxed-iframe print/PDF pattern as
  `App.report()`, refactored out into a shared helper both now call.
  Outside demo mode it also saves a copy into Documents under "Policies
  & Procedures" via the existing `Store.uploadDocument()` path, then
  offers (via a confirm modal) to link that document as evidence to the
  controls the template declares, reusing the exact same
  `Store.updateControl()` + `audit()` calls as `App.setControlEvidence()`.
  Generated documents carry a visible "DRAFT — review and approve"
  watermark and a red banner baked into the document itself. There's no
  separate SharePoint column tracking draft/approved state — a
  document's status is derived from the audit log (already a durable,
  versioned SharePoint list): the most recent `'Policy template
  generated'` or `'Policy document approved'` entry for that exact
  filename. The Documents table shows a DRAFT chip and a "Mark
  approved" button on any row whose derived status is still draft;
  approving re-derives the same document from the parameters recorded
  in the generation audit entry (`{tplId, owner, reviewDate,
  clientLabel}`, JSON-encoded in `after`) with `approved:true`, and
  re-uploads it under the same filename — Graph's small-file upload is
  an upsert-by-path, so this replaces the draft in place rather than
  creating a duplicate. `templates.js` is loaded and content-hashed/
  SRI-signed the same way as the other checkpoint scripts.
- **Print treatment for generated documents**: policies, the Trust
  Center page and the Auditor Pack are the artefacts that actually get
  printed and handed to a board or an assessor, and they previously
  carried no print CSS at all. `standalonePrintCss()` /
  `standaloneRunningMarks()` in app.js add an A4 `@page`, break-inside
  protection so a policy statement or a roles row is never split across
  a page turn, and a running header/footer repeated on every printed
  page carrying the classification marking, the document title, its
  version and owner, and `DRAFT — NOT APPROVED` in red while
  unapproved.

  Three of those were correctness problems rather than polish. The
  classification marking rendered once, at the top of page one, so
  printed page 7 of an "OFFICIAL: Sensitive" policy carried no marking
  — which the PSPF expects on every page, for exactly the government
  and Defence clients this is sold to. Nothing identified the document
  on any page but the first, so a loose printed page was
  unattributable. And the DRAFT indicator used `position:fixed` /
  `position:sticky`, neither of which repeats per printed page in
  Chrome, so an unapproved policy printed as DRAFT on page one and as
  an apparently final document on every page after it.

  The running header/footer technique — `position:fixed` offset into
  the `@page` margin band — is the one report.js already uses in
  production, since Chrome and Edge implement no `@page` margin boxes.
  Reused deliberately rather than invented again. Page numbers are
  deliberately absent: Chrome exposes no page counter to HTML content,
  and a footer reading "Page 1" on all eight pages is worse than one
  that does not pretend to number them.
- **AWS posture collector** (optional, `public/checkpoint/aws/`): a
  Lambda a client deploys into their **own** AWS account that runs ten
  AWS posture checks and writes them into their **own** SharePoint —
  the same arrangement as the Azure monitor, so adding AWS coverage
  puts no backend into the architecture. It exists because every other
  check reads Microsoft Graph, which meant a client whose product runs
  on AWS had a console that could see the corporate tenant and not
  production.

  It **merges into** the day's existing scan row rather than writing
  its own, and recomputes the score over the union — an AWS-only row
  would blank every Microsoft result for that day and vice versa.
  Drift alerting is identical to the Microsoft path.

  A tenant with no collector deployed is unaffected: the ten
  `Cloud (AWS)` checks are never populated, `checkResult()` resolves an
  absent result to *not measured*, and `relevantCheckDefs()` drops them
  from both the Posture scan view and the Dashboard coverage
  denominator. That last point is deliberate — a licence-gated
  Microsoft capability (Intune, PIM) stays **in** the denominator
  because it is a real gap the client could close on the tenant they
  already have, whereas a client who runs no AWS is not ten checks
  short of anything, and "21 of 35" would invent a shortfall. The
  checks appear on their own the first time a collector run lands;
  there is no setting to switch on.
- **Audit-log integrity chain**: every `Checkpoint AuditLog` entry
  carries `EntryHash` (a SHA-256 of its own canonical content bound to
  its predecessor) and `PrevHash`, so the log is a chain rather than a
  bag of independent rows. Editing or deleting a historical entry
  breaks every hash after it. "Verify integrity" in the Audit log view
  recomputes the chain in-browser and reports four states separately,
  because they mean very different things to an assessor: *chained*
  (verified), *unchained* (written before this existed — reported, not
  treated as tampering), *altered* (content no longer matches its
  stored hash), and *broken* (an entry names a predecessor no earlier
  entry produced — the shape a deleted row leaves). Concurrent appends
  by two practitioners are classified as a *fork* rather than as
  tampering, since that is ordinary multi-user behaviour.

  Stated honestly in the UI: this proves the log is *internally
  consistent*. It cannot on its own catch someone who recomputes the
  entire chain — exporting the log and keeping that copy outside the
  tenant is what closes that gap, because a rewritten chain no longer
  matches the copy an auditor already holds. Verification is
  deliberately **not** audited and not in `MUTATING_ACTIONS`: it writes
  nothing, so a read-only Viewer or a visiting auditor can run it, and
  the act of verifying never changes the log being verified. Hashing
  failures never block the audit write itself — an unchained entry is
  a gap in the proof, a missing entry is a gap in the record, and the
  second is worse.
- **Organisation profile** (Settings → "Organisation
  profile"): the Clause 4.2/4.3 facts no template can know — industry,
  business units, locations, services, interested parties, regulatory
  obligations and deliberate scope exclusions. Templates write these
  as `{{token}}` (see `window.ORG_PROFILE_FIELDS` in `templates.js`)
  and `resolveOrgTokens()` in `app.js` substitutes them at every
  render, so the ISMS Scope Document generates already filled in
  rather than carrying "to be completed with the organisation's actual
  business units" as a to-do inside the document. Stored as ordinary
  Settings rows (`orgIndustry`, `orgBusinessUnits`, …), so there is no
  new list, no schema migration and nothing for `COLUMN_RECONCILE` to
  heal on an existing tenant.

  `App.orgProfileWizard()` collects it in two steps: industry first,
  because that seeds the interested-parties and regulatory fields from
  `window.INDUSTRY_PROFILES` (ten Australian-market presets — health,
  finance, government, defence, critical infrastructure and so on)
  rather than presenting a blank form. Those presets are a starting
  point the practitioner edits, not an assertion that a given law
  binds a given client; the wizard says so on the same screen.
  Re-running it keeps existing answers unless the industry itself
  changed, so fixing a typo in "locations" never silently discards an
  edited interested-parties list.

  Every field is optional. An unanswered token falls back to the
  generic wording the template carried before profiles existed, so a
  tenant that never opens the wizard generates exactly the document it
  always did — and an unknown token (a typo in a template) resolves to
  empty rather than leaking a literal `{{token}}` into an approved
  policy. `test/content-library.test.mjs` guards both halves: every
  token a template uses must be a defined field, and every field must
  carry a fallback. The wizard is offered once, automatically, the
  first time a profile-dependent document is generated on a tenant —
  templates with no tokens (most of the Annex A policies are genuinely
  universal) never trigger it.
- **Email digest**: opt-in, off by default (Frameworks/Settings view,
  "Email digest" card). Four Settings-list keys —
  `digestEnabled` ('false'), `digestRecipients` (comma-separated,
  same format `App.emailStatusUpdate()` already collects ad hoc),
  `digestFrequency` ('Weekly' or 'Monthly'), and `digestLastSent` (an
  ISO date, `''` for never — same "empty string means never" convention
  as `onboardedDate`). Sending — `App.sendDigestNow()` — reuses
  `Graph.sendMail()` (`Mail.Send`, the same incremental-consent scope
  `App.emailStatusUpdate()` already triggers the first time it's used;
  no separate consent flow was needed) and the same inline-styled HTML
  email pattern, with a fuller digest: overdue actions, actions due
  within 14 days, upcoming calendar items, open drift alerts, readiness
  % per entitled framework, and the top 3 risks by residual score —
  every value passed through `esc()`. A browser tab can't send mail
  while it's closed, so in the app itself this is a nudge on load, not a
  schedule, and the UI says so plainly: `renderDash()` shows a due
  banner (`#digestDueBanner`, same treatment as the existing scan-due
  banner) computed from `digestEnabled`/`digestFrequency`/
  `digestLastSent` via the same `daysSince()` arithmetic the scan
  reminder uses, with a "send it now" link.

  **The scheduled Azure Function (§9) sends it unattended** — see
  `azure/README.md` § The periodic digest. It reads the same four
  Settings keys, evaluates the same cadence, and composes the digest
  from data its nightly run has already gathered, so the digest costs no
  extra Graph calls. It needs `NOTIFY_FROM` configured (an app-only
  identity has no mailbox of its own) and stamps `digestLastSent` only
  after a successful send, so a failed send retries on the next run
  rather than silently skipping a period. Until that Function is
  deployed, the browser banner remains the only reminder and a
  practitioner still has to click "Send now".

  Every send updates `digestLastSent` and logs a `'Compliance digest
  emailed'` audit entry, same as any other tracked action in this app.
- **Versioning and "what's new"**: `public/checkpoint/VERSION` is the
  single source of truth for Checkpoint's own version number (distinct
  from `package.json`'s version, which is the whole marketing site's) —
  a plain text file, e.g. `1.5.0`. `public/checkpoint/version.js` ships
  a placeholder (`window.CHECKPOINT_VERSION = '__CHECKPOINT_VERSION__'`)
  that `scripts/hash-checkpoint-assets.mjs` substitutes with `VERSION`'s
  contents at build time, before that file gets its usual content-hash/
  SRI treatment — the build throws if `VERSION` is missing/empty or the
  placeholder isn't found, so the shipped app can never silently carry
  a stale or missing version number. Bump `VERSION` on every notable
  release; nothing else needs editing to make the new number show up.
  `public/checkpoint/changelog.js` (`window.CHECKPOINT_CHANGELOG`) is a
  hand-curated array of `{version, date, entries}`, newest first — one
  entry per meaningful release, not per commit. The sidebar footer
  shows the current version and opens the full changelog (the same
  shared drawer every other detail view uses) when clicked. On boot,
  `checkForNewVersion()` (app.js) compares Settings' `lastSeenVersion`
  against `window.CHECKPOINT_VERSION`: a returning session on an older
  version gets a one-time toast pointing at the changelog; a brand-new
  tenant (`lastSeenVersion` still `''`, meaning never tracked) is never
  toasted — it just starts tracking silently, so nobody sees an
  "updated!" notice for the very first version they've ever used. Works
  identically in demo mode (its own local `lastSeenVersion`, no
  server round-trip either way).

### 8a. Accessibility (WCAG 2.1 AA pass)

Same visual language throughout — no redesign — but every interactive
element in the main app shell is now keyboard-operable with visible
focus and the ARIA a screen reader needs. Full list of changes:

- **Contrast**: `--paper-faint` (used for helper/muted text) measured
  3.37:1 against `--ink`, below the 4.5:1 AA minimum for body text —
  bumped from `rgba(250,247,241,.38)` to `.5`, now 5.06:1 (verified via
  the standard WCAG relative-luminance formula). `--paper-dim` (.62)
  was already comfortably passing at 7.3:1 and is unchanged, as are
  every accent colour (`--gold`, `--gold-light`, `--pass`, `--fail`)
  used as text against the dark backgrounds — all ≥5.5:1.
- **Visible focus**: one consistent `:focus-visible` treatment (a
  2px gold-light outline) added for every native interactive element
  site-wide — most custom components here (`.toggle`, `.nav-item`,
  `.f-pill`) have `border:none`, so the browser's default focus
  indicator was inconsistent or hard to see against them. Only shows
  for keyboard/programmatic focus, never a mouse click. The drawer,
  modal box and wizard-step containers receive **programmatic** focus
  on open/step-change (so a screen reader announces the new content)
  but suppress the ring on themselves specifically — they already have
  strong visual chrome, and a box around the whole panel would be
  noise; every real control inside still gets the ring.
- **Toggle switches** (control-applicable, Trust Center settings,
  vendor public-listing, framework entitlement in demo mode, email
  digest, feature flags, the onboarding wizard's framework picker — 7
  generation sites): each now carries `role="switch"`,
  `aria-checked="true"/"false"`, and a descriptive `aria-label` — they
  were plain, unlabelled `<button>`s with only a visual on/off state
  before.
- **Filter pills** (Risks, Actions ×2, Vendors ×2, AI systems ×2, SoA
  framework tabs, SoA category, Documents, the vendor data-category
  picker — 11 generation sites): each pill now carries
  `aria-pressed="true"/"false"`; every pill row's container has
  `role="group"` and a descriptive `aria-label` in `index.html`.
- **Sidebar navigation**: `<nav aria-label="Main">`; `App.go()` sets
  `aria-current="page"` on the active nav item and clears it from the
  rest (including the initially-static Dashboard button in the source
  markup).
- **Data tables**: every `<th>` across all 10 tables (Risks, Actions,
  Vendors, AI systems, SoA, Documents, Audits, Reviews, Calendar, Audit
  log — 73 header cells total) now has `scope="col"`.
- **Risk/Vendor/AI-system rows**: previously a whole `<tr
  data-action="...">` with no keyboard path at all — a `<tr>` can't
  receive focus, so these were mouse-only. Added a real `<button
  class="lnk">` in the ID cell (the same pattern the Statement of
  Applicability's control-code cell already used), keyboard-operable
  via Tab/Enter, while the existing whole-row mouse click still works
  unchanged.
- **Drawer** (`#drawer`): now `role="dialog" aria-modal="true"` with a
  real accessible name (`aria-label`, set per view — "Risk R-001",
  "Vendor Acme Corp", "What's new", etc.). All seven `App.open*()`
  detail views and `closeDrawer` were refactored onto two new shared
  helpers, `openDrawerUi(label)`/`closeDrawerUi()`, rather than each
  reimplementing the same behaviour: focus moves to the first
  focusable element on open, Tab/Shift+Tab are trapped inside the
  drawer while it's open, Escape closes it, and focus returns to
  whatever triggered it on close. One implementation to keep correct
  instead of seven that could individually drift.
- **Modal** (`showModal()`, `app.js`): `aria-labelledby`/
  `aria-describedby` now point at the actual generated title/message
  elements (previously the static `role="dialog" aria-modal="true"`
  markup had nothing dynamic wiring an accessible name); every
  generated field's `<label>` now has a matching `for`/`id` pair
  (previously unassociated); the validation error message is
  `role="alert"`; Tab/Shift+Tab are trapped inside the box (reusing the
  same `trapFocusKeydown()` helper the drawer uses); focus now returns
  to whatever triggered the modal when it closes. Escape-to-close and
  Enter-to-confirm already existed and are unchanged.
- **Toast** (`#toast`): `role="status" aria-live="polite"` — a screen
  reader now announces every toast automatically; no JS change needed
  beyond the static attributes, since `aria-live` watches the region
  for content changes on its own.
- **Onboarding wizard**: every `.wizard-step` container gained
  `tabindex="-1"`; `showWizardStep()` now moves focus into the new step
  on every transition, so a screen reader announces the step change
  and keyboard focus starts somewhere sensible — previously it silently
  stayed on whatever button had just been clicked, now detached from
  the visible step.
- **Global search** (`#gsearchInput`/`#gsearchResults`): converted to
  the standard ARIA combobox/listbox pattern —
  `role="combobox"`/`aria-expanded`/`aria-controls`/`aria-autocomplete`
  on the input, `role="listbox"` on the results container,
  `role="option"`/`aria-selected` per result. Added ArrowUp/ArrowDown to
  move a highlighted result (`aria-activedescendant` tracks it on the
  input, which keeps real focus throughout) and Enter to select it —
  previously a result was reachable by mouse click only, with no
  keyboard path to act on a search result at all.
- **Incidental fix**: `.nav-scroll` had no CSS rule at all, so a long
  enough nav-item list silently overflowed the sidebar's fixed `100vh`
  height with no way to scroll down to reach it — including, it turned
  out, the sidebar footer and the new version tag (§8 above). Added
  `flex:1;min-height:0;overflow-y:auto` so the nav list scrolls
  independently and the footer stays reachable, by keyboard or mouse,
  regardless of how many nav items exist.

### 8b. Report engine — buildReport(spec), paged-media print CSS, and headless-Chromium reuse

All five report types (Statement of Applicability, Risk Register
Snapshot, Audit Readiness, Executive Summary, Management Review Pack)
move through one shared engine — `public/checkpoint/report.js`'s
`window.ReportEngine.buildReport(spec)` — instead of each type
assembling its own ad hoc HTML string. `spec` is a plain data object
app.js builds per report type (see `REPORT_BUILDERS` in app.js): a
title, framework, client (name + optional logo), classification
marking, an auto-incrementing version, an executive-dashboard KPI
block, an array of content sections, and methodology/sign-off data.
`buildReport()` assembles the standard structure every report shares —
cover page, document control table, table of contents (anchor-linked
to every section), the executive dashboard, the report's own content
sections, a methodology appendix, and a sign-off block — and returns
one self-contained HTML document. Every data value is escaped exactly
as it always was (the same `esc()`/`band()`/`residual()` calls, just
reorganised into the engine's section shape) — report.js itself only
escapes the handful of raw cover-page fields (client name,
classification, prepared-by, dates) it's handed directly.

**Cover page**: client name, an optional client logo (Settings key
`clientLogoUrl`), report title, framework, report date, prepared-by,
an auto-incremented version number (`reportVersion_<type>`, one
Settings key per report type per client — same generic Settings
key/value mechanism every other per-tenant setting already uses), and
a classification marking (Settings key `reportClassification`,
defaults to "Commercial in Confidence"; set it to "OFFICIAL: Sensitive"
or any other marking for a defence/government client from the
Settings view's "Client branding" card).

**Client branding (beyond the cover)**: the same Settings card also
sets `clientDisplayName` (overrides the raw tenant name everywhere a
human sees the client identity — the console top bar, Boardroom Mode,
report covers and running headers; the tenant name is preserved in a
tooltip), `clientBrandColor` (a `#rrggbb` accent applied to report
furniture — section rules, KPI figures, the cover framework tag —
validated on save, at spec-build, AND inside the engine, so a
hand-edited Settings row can never inject CSS; charts always keep the
print-validated palette so a low-contrast brand colour can't make one
unreadable), and `reportFooterText` (a free line for every printed
footer, e.g. "Prepared by Compliance365 for Acme Group"; blank falls
back to the classification marking, which always also appears in the
running header). The client logo additionally renders in the running
header of every printed page and beside the client name in the app's
top bar. The auditor pack and Trust Center standalone pages take the
same logo/accent; the classification band goes on the auditor pack
only — the Trust Center is built to be public. **The client
logo is stored as a `data:` URI, not a plain link** — reports render
inside a sandboxed `srcdoc` iframe that inherits index.html's CSP
(`img-src 'self' data:`; see §6), so an externally-hosted URL (a
SharePoint `webUrl`, say) would silently fail to load under that
policy. `App.uploadClientLogo()` reads the chosen file client-side via
`FileReader`, enforces a 40 KB cap (keeps the base64 string well under
the Settings list's text-column limit — see the `allowMultipleLines`
comment on the `Settings` list definition in store.js), and best-effort
also uploads the original file to Documents ("Branding" category) for
a durable copy of record; that second upload failing (or being
unavailable in demo mode) never blocks the logo from being saved and
used, since the Settings write already succeeded by that point.

**Paged-media print CSS**: `@page { size: A4; margin: ... }` reserves
blank margin space on every printed page; the running header (client
logo + name + report title, classification) and footer (document title
+ version, footer text or classification, generated date) use
`position: fixed` with a negative offset into that
margin band, rather than CSS Paged Media's `@page` margin boxes —
neither Chrome nor Edge implements those at all, while a `position:
fixed` element genuinely does repeat on every physical page when
printed in both (they share the same rendering engine). The footer's
left slot carries the document identity (title + version) rather than
a page number: a CSS counter on a fixed element resolves once at its
DOM position, so it printed the same (wrong) number on every page —
an accurate identity beats an inaccurate count until reports move to
a real pagination engine (headless Chromium, below). On screen, the
identical markup renders once, inline, at the top/bottom of a normal
scrollable document — the same popup preview also serves as Checkpoint's
on-screen "view mode", no separate code path. Every "page" (cover,
document control, TOC, dashboard, each major content section,
methodology, sign-off) gets `page-break-before: always` and increments
the same CSS counter the footer reads — an honest approximation
counting the report's own deliberate page divisions, not necessarily
the exact physical page a long table happens to overflow onto if it
runs longer than one printed page; `tr`/stat-card blocks get
`break-inside: avoid` so a table row is never split across a page
break. Verified against real print/PDF rendering in headless Chromium
(Playwright) for all five report types: cover/document-control/TOC/
dashboard/methodology/sign-off all present, TOC anchors all resolve,
`position: fixed` and the page counter both take effect under
`@media print`, and `page.pdf()` produces a genuine multi-page PDF —
Chrome and Edge share the same Blink/print engine, so this exercises
what both actually render.

**Export**: the "Export PDF" button (`reportPreview()` in app.js, a
sibling of `printPreview()` used for policy templates/Trust Center/
Auditor Pack) sets `document.title` on both the popup window and the
iframe's own document to `"<Client> - <Report> - <YYYY-MM-DD>"` before
calling `print()` — Chrome/Edge's Save-as-PDF dialog uses that title to
suggest a filename, and it has to be set on the iframe's document
specifically since `print()` is invoked on `iframe.contentWindow`, not
the popup window.

**Methodology appendix**: which Graph capability signals informed the
report (Conditional Access / Identity Protection / PIM / Intune /
Secure Score / Purview sensitivity labels / Entra Access Reviews /
SharePoint tenant sharing settings — the same `CAP` result the
Coverage card already surfaces, each flagged available or not for this
tenant), the most recent scan timestamps,
"X of 25 checks automatable in this tenant"
(`automatableCheckCount()`, already used by the Coverage card), and a
fixed explanation of how results are scored — Pass/Review/Fail/Manual,
and the distinction between evidence-linked and self-reported SoA
status. Every report generation is logged to the audit log (`'Report
generated'`, type/framework/version in the structured fields).

**Future pixel-perfect rendering**: `buildReport()`'s output is plain,
self-contained HTML/CSS with no dependency on the browser DOM being
interactive (report.js doesn't touch `window`/`document` beyond reading
`location.href` for the font path) — the same HTML this engine
produces client-side could later be rendered server-side via headless
Chromium (e.g. `page.pdf()`, exactly as this feature's own
verification above already exercises) from the client-tenant Function
app introduced in §9, for a pixel-perfect PDF generated on a schedule
rather than by a practitioner clicking "Export PDF." Nothing in
report.js or the per-type spec builders would need to change to
support that — only the render step (browser print dialog vs.
`page.pdf()`) differs.

### 8c. Visual dashboard — reusable chart functions (pure inline SVG)

Every report's dashboard page (right after the cover/document control/
TOC, before the report's own content sections — the same slot the
KPI-only dashboard always occupied) now carries real charts, not just
number tiles. Six reusable chart functions live in `report.js` —
`window.ReportEngine.charts.{donut, trend, stackedBars, riskHeatmap,
evidenceGauge, kpiStrip}` — each a pure `data in -> SVG string out`
function with no dependency on the DOM, a canvas, or any charting
library. `app.js` turns live tenant state into the plain data objects
each one expects (`REPORT_BUILDERS`'s helpers: `controlStatusCounts()`,
`themeGroupsFor()`, `evidenceCoverageFor()`, `scanTrendData()`,
`openResidualPairs()`, `actionThroughputByMonth()`) and composes a
per-report-type subset into `spec.dashboard.charts` — an ordered array
of `{ figure, title, caption, svg }`, each rendered as a card with a
figure number, a title, the chart, and a one-line takeaway caption.

**Composition per report type** (task spec, unchanged since): `ready`
gets all six (KPI strip, donut, trend, stacked bars by theme, risk
heatmap, evidence gauge — the deep-dive pre-audit report); `exec` gets
KPI strip + donut + trend + a top-risk heatmap on its one dashboard
page (the five-minute board version); `mgmt` gets trend + an
action-throughput-by-month bar + heatmap (posture direction, is the
team clearing its actions, where residual risk sits); `soa` gets donut
+ stacked bars for the framework currently open in the Statement of
Applicability; `risk` gets the heatmap + a severity distribution bar.

**The stacked-bars function is deliberately generic**, not hardcoded to
control status — it takes `(rows, legendDefs)` where each row supplies
`values` in the same order as the caller's own `legendDefs` (label +
color + optional hatch). The same function renders "control status by
theme/category" (ISO 27001's A.5-A.8 themes, SOC 2's CC/A/C/PI/P
categories inferred from the code prefix, Essential Eight's per-
strategy grouping — anything else falls back to one group covering the
whole framework), a risk severity distribution (one row, Low/Medium/
High/Critical segments), and the mgmt report's action-throughput bar
(Done/Open segments per month) — three different meanings, one
primitive, per the task's "reusable chart function" requirement.

**Palette**: validated against the dataviz skill's computable checks
(`scripts/validate_palette.js` — OKLCH lightness band, chroma floor,
Machado CVD-simulation ΔE between adjacent hues, contrast vs. the white
print surface) rather than picked by eye. Two neutral tones (Not
started / manual evidence) deliberately do NOT try to pass as
categorical hues — a true gray fails the chroma-floor check by
definition — so they're differentiated by a diagonal hatch texture
(`url(#rpt-hatch)`, an SVG `<pattern>`) instead of hue, always paired
with a direct legend label, never color alone. Risk severity reuses a
green→amber→orange→red RAG scale (not a single-hue sequential ramp,
despite severity being ordinal data — a deliberate choice to match the
live Dashboard heatmap's own established RAG convention, which client
stakeholders already read as "green is safe, red is not").

**Graceful degradation with sparse data**: every chart function checks
its own input and renders an honest dashed-border placeholder message
("No posture scans recorded yet — history builds as scans run.", "No
open risks recorded yet.", etc.) rather than a broken/empty axis — zero
scans, a single scan (no division-by-zero: the trend line's `x = i /
(n-1)` formula special-cases `n === 1` to a single centred point
instead), and zero risks are all exercised by
`test/report-charts.test.mjs`'s snapshot suite.

**Security**: every chart function is dependency-free inline SVG built
by string concatenation, not `innerHTML`'d from unescaped input — every
numeric value goes through `fx()` (coerced to a finite `Number`, so it
can never carry a quote/tag) and every text label goes through
`escSvgText()` (the same 5-entity escape `esc()` uses), including
inside SVG *attributes* like `aria-label`, not just text nodes — a real
bug caught during this feature's own test-writing: `kpiStrip()`'s
`aria-label` summary was built from raw `item.label`/`item.value` with
no escaping at all, fixed before merge (see the "escapes every caller-
supplied text label" describe block in `test/report-charts.test.mjs`).

**Tests**: `test/report-charts.test.mjs` snapshot-tests all six
functions against fixed fixture data (exact string equality — safe
since no chart function calls `Date.now()`/`Math.random()`, so output
is a pure function of input) plus dedicated escaping/injection-safety
tests. Verified end to end with headless Chromium (Playwright): all
five report types render the exact chart composition above, with zero
console/page errors, across a demo tenant with every framework
entitled.

### Checks covered outside Microsoft

Checkpoint scores the Microsoft stack. Plenty of tenants meet the same
control with something else — CrowdStrike rather than Defender, OneTrust
rather than Priva — and without a way to say so, those checks fail
forever: the posture score punishes a control the client actually holds,
and the same risk is re-proposed on every single scan until people learn
to ignore the proposals entirely.

Every check on the **Posture scan** view therefore carries a **"Not via
Microsoft?"** button. It records one of three dispositions:

| Disposition | Effect on the check | Effect on the score |
|---|---|---|
| **Microsoft** (default) | Scanned and scored normally | Counted |
| **Covered by another tool** | Reads "Covered — *tool*" | Counted as a pass |
| **Not applicable** | Reads "Not applicable" | Removed from the denominator |

Both non-default dispositions require a justification and a **review
date**, and neither suppresses the proposed risk quietly — the scan view
states plainly that the check is not scored from Microsoft signal.

Three things are deliberate about how this works:

- **It expires.** Once the review date passes the override lapses on its
  own and the real scan result comes back, so the check starts failing
  again until someone confirms the alternative control is still in place.
  An override with no expiry is a permanent blind spot in the posture
  score that nobody ever revisits, and an auditor will find it long
  before the client does.
- **It cannot reach "Demonstrated" assurance.** A dispositioned check is
  dropped from the observation set behind the SoA's assurance column
  entirely — not counted as a passing observation, and not counted as an
  exception either. The control falls back to whatever human evidence
  supports it: *Evidenced* with an artefact attached, *Asserted* without.
  Checkpoint observed nothing here and must never imply that it did.
- **It is a register, not a setting.** Each row carries an owner, a
  justification and a review date, and an auditor will want to enumerate
  them as a set — which is why they live in their own
  `Checkpoint CheckDispositions` list rather than as key/value settings.

**Tests**: `test/check-dispositions.test.mjs` covers the disposition
lookup (including lapse-on-review-date and the rejection of unrecognised
values written by hand into SharePoint), `checkResult()`'s precedence
against `scored:false`, the pre-scan state and the demo remediation flip,
and `score()`'s pass-versus-excluded-from-denominator arithmetic.

## 9. Continuous monitoring (optional)

By default Checkpoint is an interactive tool — a practitioner runs a
posture scan from the sidebar, and nothing runs while the tab is closed.
`azure/` in this same folder adds an **optional** Azure Function App,
deployed into the **client's own** Azure subscription, that re-runs the
same posture checks daily with no one signed in, using Microsoft Graph
**application** permissions (client credentials — a timer trigger has no
user to act as). It writes a normal `Checkpoint Scans` row on every run
and a `Checkpoint Alerts` row whenever a check that scored **pass** on
the previous scan scores **fail** on this one.

It scores the same checks the interactive app does, including the
awareness-training check computed from the `Checkpoint Training` list
(the one scored check with no Graph signal behind it), so an automated
scan and a browser scan of the same tenant land on the same number —
the two used to be computed over different denominators and disagreed.
Two checks stay interactive-only for auth reasons documented in
`azure/PostureMonitor/index.js`: `labels` and `sharing`.

Full deploy steps (app registration, the exact application permissions
and why each is the least-privilege choice for its check, the
`Sites.Selected` one-site grant, the "Deploy to Azure" button, and how to
push the function code) are in
[`azure/README.md`](./azure/README.md).

This is entirely additive:

- The interactive app's delegated, incremental-consent permission model
  (§2, §6) is completely unchanged — the monitor is a **separate** app
  registration with its **own**, narrower, additional grants.
- Skip this section entirely and Checkpoint works exactly as it did
  before — an on-demand tool, nothing missing.
- The Dashboard's "Continuous monitoring" panel shows the last
  automated run and cadence, and lists any open drift alerts with a
  one-click Acknowledge action, once deployed.

## 10. What to build next (roadmap candidates)

- **Permission-enforced append-only audit log**: today the
  `Checkpoint AuditLog` list is append-only only by convention — the
  app never edits or deletes entries, but anyone with direct edit
  rights on that SharePoint list still could. Tightening the list's
  own permissions (break inheritance, grant the compliance team
  Contribute-without-Delete, or move to a retention-labelled/immutable
  storage option) would close that gap properly; not done here because
  it's a per-tenant SharePoint admin action, not something Checkpoint's
  own provisioning call can set via Graph.
- Full 93-control equivalents for the frameworks still at representative
  scope where relevant (SOC 2's optional Availability/Confidentiality/
  Privacy criteria, DISP/IRAP's full ISM control set). Deliberately
  deprioritised while ISO 27001, ISO 42001 and ISO 27701 carry full
  control sets — those three are what client engagements are using
  today.
- Teams tab packaging (the app is iframe-ready; add a Teams manifest).
- **Key Vault-backed secrets for the continuous monitor**: §9's Azure
  Function template stores its client secret as a plain app setting to
  keep the one-click deploy path dependency-free; wiring a managed
  identity + Key Vault reference is a natural hardening step for a
  client with an existing Key Vault.
