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
| `Directory.Read.All` | Count Global Administrators | Yes |
| `Policy.Read.All` | Read Conditional Access policies (MFA / legacy auth checks) | Yes |
| `SecurityEvents.Read.All` | Read Microsoft Secure Score | Yes |
| `DeviceManagementManagedDevices.Read.All` | Intune device compliance | Yes |
| `Sites.Manage.All` | Create + write the Checkpoint SharePoint lists | Yes |

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
4. On first load Checkpoint provisions five SharePoint lists on the
   configured site and seeds the ISO 27001 control set:
   - `Checkpoint Risks`
   - `Checkpoint Actions`
   - `Checkpoint Controls`
   - `Checkpoint Scans`
   - `Checkpoint Activity`
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

## 7. What to build next (roadmap candidates)

- Full 93-control Annex A set (extend `CONTROL_SEED` in `store.js` or add
  rows directly to the `Checkpoint Controls` list — the app reads whatever
  is in the list).
- Evidence library: a SharePoint document library per engagement, with
  evidence links on completed actions.
- Scheduled scans via a Power Automate flow hitting the same lists.
- Multi-client switcher for practitioners (guest access into client
  tenants keeps residency intact).
- Teams tab packaging (the app is iframe-ready; add a Teams manifest).
