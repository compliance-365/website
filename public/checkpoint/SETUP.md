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
has a security issue.

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
2. Click **Sign in with Microsoft** and sign in with an **admin** account in
   your tenant.
3. First sign-in shows the consent prompt listing the permissions above —
   accept (tick "Consent on behalf of your organization" if offered).
4. On first load Checkpoint provisions SharePoint lists (plus one
   document library) on the configured site and seeds every registered
   framework's control set:
   - `Checkpoint Risks`
   - `Checkpoint Actions` (also holds non-conformities & observations — see §8)
   - `Checkpoint Controls` (tagged per framework — see §7)
   - `Checkpoint Scans`
   - `Checkpoint Activity`
   - `Checkpoint Entitlements` (which frameworks are switched on for this client)
   - `Checkpoint Settings` (risk appetite, feature toggles, scan cadence, posture-scan thresholds — see §9)
   - `Checkpoint Audits` (internal audit programme — see §8)
   - `Checkpoint Reviews` (management review records — see §8)
   - `Checkpoint Calendar` (recurring ISMS activities — see §8)
   - `Checkpoint AuditLog` (append-only audit trail — see §8)
   - `Checkpoint Alerts` (drift alerts from the optional continuous monitor — see §9)
   - `Checkpoint Vendors` (third-party vendor risk register — see §8)
   - `Checkpoint AISystems` (AI Governance / ISO 42001 register — see §8, only used while iso42001 is entitled)
   - `Checkpoint Documents` (a document library, not a list — real file storage)
   ISO 27001 is enabled by default; other frameworks (ISO 42001, etc.) are
   seeded but switched off until the client purchases them — see §7.
5. Run a posture scan. Real results come from your Conditional Access
   policies, Global Admin count, Intune compliance and Secure Score.
   Approve a finding and watch the risk + actions appear — then check the
   SharePoint lists: the items are there, versioned by SharePoint itself.

---

## 5. Onboard a client tenant

Two paths:

**A. Let consent happen at first sign-in.** Send the client admin to the
app URL; the consent prompt appears automatically on first sign-in.

**B. Pre-consent with an admin-consent URL** (cleaner for engagements):

```
https://login.microsoftonline.com/organizations/adminconsent
  ?client_id=YOUR-CLIENT-ID
  &redirect_uri=https://www.compliance365.com.au/checkpoint/
```

The client's Global Admin opens that link, consents once for their whole
tenant, and every user you nominate can then use Checkpoint against their
tenant (subject to their own Graph permissions — posture checks need
security-reader-level rights; list writes need access to the chosen
SharePoint site).

Each client's data provisions into **their** SharePoint on first run.
Nothing multi-tenant is shared: your hosted URL is just static files.

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
  the tab closes, not just on explicit sign-out. The Portfolio feature's
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

---

## 7. Selling additional frameworks (ISO 42001, SOC 2, etc.)

Checkpoint ships with two frameworks already built — **ISO 27001** and
**ISO 42001** — as a working example of the pattern. Every client tenant
gets both frameworks' control sets provisioned automatically, but only
ISO 27001 is switched on by default. When a client purchases a second
framework:

1. Sign in to their tenant (or have them sign in with you screen-sharing).
2. Open the **Frameworks** view in the sidebar.
3. Flip the toggle for the framework they've bought.

That's the entire process — no redeploy, no config file, no script. The
framework's Statement of Applicability tab appears immediately, a new
readiness KPI appears on the Dashboard, and its own audit reports become
available. Turning a framework off never deletes its data — it just
stops appearing.

### Adding a brand-new framework to the registry (e.g. SOC 2)

This is a one-time change *you* make in the codebase, not something a
client does per engagement:

1. In `store.js`, add a new entry to `window.FRAMEWORKS` with an `id`,
   `name`, `tag`, `blurb`, and a `controls` array (`code`, `t` title,
   `app` default-applicable, `map` cross-framework references). **Every
   control `code` must be unique across the whole registry** — it doubles
   as the lookup key risks reference.
2. Add the new framework's id to `window.FRAMEWORK_ORDER`.
3. Deploy. Existing client tenants self-heal: the next time each one
   loads Checkpoint, `reconcileControls()` in `store.js` notices the new
   framework's control rows are missing from their `Checkpoint Controls`
   list and adds them automatically (switched off, ready to be enabled
   from the Frameworks view when purchased).
4. Extend `CHECK_DEFS` and the `TPL` proposed-risk templates in `app.js`
   only if the new framework has its own Graph-verifiable posture checks
   (most frameworks, like ISO 42001, are process/governance controls
   assessed manually via the SoA rather than scanned).

## 8. Enterprise features (all shipped)

- **Full framework control sets**: ISO 27001 (93), ISO 42001 (39), SOC 2
  (51 — the full mandatory Common Criteria series plus Availability,
  Confidentiality, Processing Integrity and Privacy), ISO 27701 (51 — the
  full Annex A/B PII controller and processor control sets, 2019
  edition), DISP/IRAP (34 — organised by DISP membership level, see
  below), NIST CSF (22 categories seeded by default, optionally 106
  subcategories on top — see below), Essential Eight (32 — 8 strategies
  × the ACSC Essential Eight Maturity Model's 3 maturity levels, see
  below). 322 controls seeded by default, cross-mapped to each other.
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
  admin privileges, backups) — always as a confirm-or-dismiss suggestion
  in the SoA, never applied automatically.
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
- **Portfolio view**: a practitioner-side view across every client
  tenant. Deliberately isolated from the main session — each sync opens
  its own throwaway MSAL instance scoped to that client's tenant
  (sessionStorage cache, torn down after use) so it can never corrupt
  whichever tenant is currently signed in for the rest of the console.
  The client list itself is bookkeeping in your own browser only;
  nothing is stored centrally.
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
  linked ISO 42001 controls (Annex A.5 impact assessment, A.6 life
  cycle, and others) are computed live from which fields are actually
  documented on that record (`aiControlsFor()` in app.js) — never a
  manually-picked list that can drift out of sync with the record
  itself. **Automated discovery**: every live scan (while iso42001 is
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
  PR/push, alongside `lib.test.mjs` — every control code unique (with
  one documented, explicitly-allowlisted exception, see below), every
  `map` reference resolving to a real control or a genuine external
  citation (via `parseMapTokens()`), no empty titles/codes,
  `FRAMEWORK_ORDER` and `FRAMEWORKS` agreeing with each other, and each
  framework's own category/level/depth fields internally consistent
  (SOC 2's `cat`, Essential Eight's `lvl`, NIST CSF's subcategory
  `parent`, DISP's `domain`/`membershipLevel`/`ismChapter`). This is the
  regression net for every future task that edits the registry — it
  would have caught the two real bugs found while writing it (below)
  immediately instead of relying on someone noticing a broken "Also
  satisfies" chip or a control that never appears in the SoA. **Known,
  documented exception**: ISO 27001 and ISO 42001 both use their own
  standard's real Annex A numbering with no per-framework prefix (e.g.
  `A.5.2` exists in both), so those 13 specific codes collide — flagged
  as out-of-scope across the sessions that built every other framework
  addition (each of which independently avoided the same mistake).
  Fixing it means renaming one framework's codes, which — since codes
  are risk-register lookup keys a real client tenant may already
  reference — needs an explicit decision and migration path, not a
  silent rename bundled into a test PR; the allowlist in
  `framework-registry.test.mjs` names the exact 13 codes and is itself
  tested so it can't silently drift to hide a *different*, new
  collision. **Two real bugs fixed while building this test**:
  `parseMapTokens()` didn't handle this codebase's own "same-framework
  shorthand" convention (`"ISO27001 A.5.29 · A.5.30"` — the second code
  has no prefix) and silently dropped those references as unresolvable;
  and 11 of ISO 27001's controls cited NIST CSF 1.1-era category codes
  (`PR.AC`, `PR.IP`, `PR.PT`, `RS.RP`, bare `GV`) that don't exist in
  this app's CSF 2.0 `nistcsf` registry — both fixed as part of this
  change (see git history for the exact `map` field corrections).
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
  so the right direction always reads as good. Portfolio client cards
  get the same trend arrows plus a Healthy/Watch/Needs-attention/Not-synced
  status dot, so a practitioner managing many clients can scan for who
  needs attention without opening every card.
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
- A lightweight client/entitlements registry in *your* tenant, so you can
  see at a glance who's onboarded and what they've purchased without
  opening each client tenant individually (the Portfolio view's local
  client list is a step toward this, but it's browser-local, not shared
  across your team).
- Teams tab packaging (the app is iframe-ready; add a Teams manifest).
- **Key Vault-backed secrets for the continuous monitor**: §9's Azure
  Function template stores its client secret as a plain app setting to
  keep the one-click deploy path dependency-free; wiring a managed
  identity + Key Vault reference is a natural hardening step for a
  client with an existing Key Vault.
