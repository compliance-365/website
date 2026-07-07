# Checkpoint — Setup Guide

Checkpoint is a single-page compliance console with **no backend**. It signs
users in with Microsoft Entra, reads tenant posture via Microsoft Graph, and
stores every register (risks, actions, SoA, scans, activity) as **SharePoint
lists inside the client's own tenant**. You register the app once in *your*
tenant as a multi-tenant application; each client admin consents once, and
Checkpoint works in their tenant from your hosted URL.

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
| `Sites.Manage.All` | Create + write the Checkpoint SharePoint lists | Yes |

> If you already registered the app with the original 6 permissions,
> add the 3 new ones above in Entra and click **Grant admin consent**
> again — existing client tenants will need the same re-consent (send
> the admin-consent URL from §5 again; it's safe to re-run).

Add each under **API permissions → Add a permission → Microsoft Graph →
Delegated permissions**. Everything except `Sites.Manage.All` is read-only.

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
4. On first load Checkpoint provisions six SharePoint lists on the
   configured site and seeds every registered framework's control set:
   - `Checkpoint Risks`
   - `Checkpoint Actions`
   - `Checkpoint Controls` (tagged per framework — see §7)
   - `Checkpoint Scans`
   - `Checkpoint Activity`
   - `Checkpoint Entitlements` (which frameworks are switched on for this client)
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

- No backend, no database, no telemetry. Static files only.
- All Graph calls originate in the user's browser with their own token.
- Read-only scopes for all posture checks.
- The only write scope is SharePoint lists, in the client's tenant.
- Registers inherit the client's own SharePoint security, retention,
  versioning and audit history.
- Sign-out clears MSAL tokens from browser storage.

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
  (34 — the full mandatory Common Criteria series), ISO 27701 (30,
  controller + processor), DISP/IRAP (28), NIST CSF (22, the full 2.0
  category set), Essential Eight (8, inherently complete). 254 controls
  total, cross-mapped to each other.
- **Risk appetite thresholds**: set a tolerance (Frameworks view) —
  residual risks scoring above it surface as a Dashboard breach banner.
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
  ("Checkpoint Documents") provisioned per tenant alongside the five
  registers, for the ISMS manual, policies, risk treatment plan and
  training records. Upload (up to Graph's 4 MB simple-upload ceiling)
  or list files from the new Documents view; larger files are uploaded
  directly in SharePoint and linked as evidence instead. Files inherit
  the client's own SharePoint permissions, retention and versioning —
  nothing is duplicated outside their tenant.
- **Non-conformities in the Actions register**: actions/findings now
  carry a type — Action, Non-conformity (Major), Non-conformity (Minor),
  or Observation — filterable in the register, with a manual "+ Add
  action / finding" form for capturing external/surveillance audit
  findings that didn't originate from a scan or risk. The Audit
  Readiness report calls out any open non-conformities as a standing
  recommendation.

## 9. What to build next (roadmap candidates)

- Full 93-control equivalents for the frameworks still at representative
  scope where relevant (SOC 2's optional Availability/Confidentiality/
  Privacy criteria, DISP/IRAP's full ISM control set).
- A lightweight client/entitlements registry in *your* tenant, so you can
  see at a glance who's onboarded and what they've purchased without
  opening each client tenant individually (the Portfolio view's local
  client list is a step toward this, but it's browser-local, not shared
  across your team).
- Evidence library: a SharePoint document library per engagement, rather
  than pasted URLs.
- Scheduled scans via a Power Automate flow hitting the same lists.
- Teams tab packaging (the app is iframe-ready; add a Teams manifest).
