# Checkpoint — continuous posture monitor

An optional Azure Function App, deployed into the **client's own** Azure
subscription, that re-runs Checkpoint's posture checks on a schedule —
daily by default — with no browser tab open and no user signed in. It
writes a new row to the `Checkpoint Scans` list on every run (same as an
interactive scan) and a row to a new `Checkpoint Alerts` list whenever a
check that scored **pass** on the previous scan scores **fail** on this
one. The Checkpoint browser app reads both lists — the Dashboard's
"Continuous monitoring" panel shows the last automated run and cadence,
and highlights open alerts.

This is entirely optional. Without it, Checkpoint works exactly as
before: an on-demand tool a practitioner runs interactively. Deploying
this just adds a second, unattended way of keeping the same data current.

## Architecture

```
┌─────────────────────────────┐        ┌──────────────────────────────┐
│  Client's Azure subscription │        │  Client's Microsoft 365 tenant│
│                              │        │                                │
│  Function App (timer, daily)│──Graph──▶  Conditional Access, Entra ID, │
│   app-only (client-creds)   │  app-  │  Intune, Secure Score, ...     │
│   Graph auth                │  only  │                                │
│         │                   │  perms │                                │
│         └────────Graph write────────▶  SharePoint: Checkpoint Scans,  │
│                              │        │  Checkpoint Alerts lists        │
└─────────────────────────────┘        └──────────────────────────────┘
                                                       ▲
                                                       │ delegated, read-mostly
                                                       │ (unchanged)
                                              ┌──────────────────┐
                                              │ Browser (MSAL)   │
                                              │ Checkpoint SPA   │
                                              └──────────────────┘
```

Compliance365 never runs, sees, or has credentials to this Function —
it lives entirely in the client's tenant and subscription, same as every
other piece of Checkpoint's data.

**The interactive app's permission model is unchanged.** The browser
app still authenticates via delegated MSAL redirect flow, still requests
scopes incrementally (`scopesReadOnly` at sign-in, `scopesProvision` /
`scopesMail` only when actually needed — see the main SETUP.md), and is
still entirely read-only against Microsoft Graph except for the
SharePoint lists it owns. This monitor is a **separate app registration**
with its **own, narrower, additional** set of application permissions,
opt-in by deploying this template. Skipping this deployment leaves the
interactive app's footprint exactly as it was.

## 1. Register the monitor's app registration

In the client's Entra tenant (**not** Compliance365's):

1. **Entra admin center → App registrations → New registration.**
   Name: `Checkpoint Posture Monitor` (or similar). Single tenant.
2. **Certificates & secrets → New client secret.** Copy the secret
   **value** immediately — it's shown once. This is `clientSecret`
   below.
3. Copy the **Application (client) ID** and **Directory (tenant) ID**
   from the Overview page — `clientId` / `tenantId` below.
4. **API permissions → Add a permission → Microsoft Graph →
   Application permissions**, add every permission in the table below,
   then **Grant admin consent** for the tenant. Application permissions
   always require an admin to consent — there is no user present to
   prompt.

## 2. App roles requested, and why each one is the least-privilege choice

Every permission below is **Application** (app-only), because a timer
trigger has no signed-in user to act as. Each is chosen to be the
narrowest Graph permission that satisfies the specific check(s) it backs
— not a broader "just in case" grant.

| Permission | Read/Write | Backs these checks | Why this one, not something broader |
|---|---|---|---|
| `Policy.Read.All` | Read | `mfa-all`, `mfa-priv`, `legacy` | Reads Conditional Access policies only. No narrower Graph permission exists for CA policies. |
| `RoleManagement.Read.Directory` | Read | `admins`, `pim` | Reads directory role membership and PIM eligibility/assignment schedule instances. Doesn't grant any ability to *change* role assignments — that would be `RoleManagement.ReadWrite.Directory`, not requested. |
| `User.Read.All` | Read | `guests` | Lists guest ( `userType eq 'Guest'` ) accounts. Directory-wide by necessity (guests aren't scoped to a single group), but read-only — no profile or password write capability. |
| `Directory.Read.All` | Read | `riskyapps` | The only Graph permission that authorizes application-level enumeration of `oauth2PermissionGrants` (existing OAuth consent grants). It's a superset of `User.Read.All` above — listed as its own row for clarity, but the two together don't add any write capability beyond either alone. |
| `IdentityRiskyUser.Read.All` | Read | `riskyusers` | Scoped specifically to Identity Protection's risky-user signal — doesn't grant sign-in log or broader security-event access. |
| `AccessReview.Read.All` | Read | `access-review` | Confirms Entra Access Reviews are configured — read-only, no ability to create, complete or decide a review. |
| `DeviceManagementManagedDevices.Read.All` | Read | `device` | Reads Intune device compliance state only — not device configuration, not the ability to retire/wipe a device (that's `DeviceManagementManagedDevices.PrivilegedOperations.All`, nowhere near requested). |
| `DeviceManagementConfiguration.Read.All` | Read | `compliance-policy` | Confirms compliance policies exist — read-only, no ability to author or assign policies. |
| `SecurityEvents.Read.All` | Read | `patch`, `macro`, `logging`, `wdac`, `alerts`, `dlp`, `encryption` | Reads Microsoft Secure Score control scores — the same heuristic, best-effort mapping the interactive app uses, clearly labelled as such in both places. `dlp`/`encryption` have no verified exact Secure Score control-name match (see the code comment) and run on a lower-confidence substring fallback only. |
| `Sites.Selected` | Read **and write** | Writing `Checkpoint Scans` / `Checkpoint Alerts`, reading `Checkpoint Settings` | The **only** write-capable permission this identity holds, and it's the narrowest SharePoint permission Graph offers: with `Sites.Selected`, the app has **zero** access to **any** SharePoint site until a tenant admin explicitly grants it a role on one specific site (step 3 below). Compare to `Sites.ReadWrite.All`, which would hand this Function write access to **every** SharePoint site in the tenant — never requested here. |

No permission above grants the ability to change a Conditional Access
policy, role assignment, device compliance policy, or user account —
only to read those signals and to write to the two SharePoint lists this
same monitor owns.

Two interactive-app checks are deliberately **not** mirrored here:

- The sensitivity-labels/classification check (`labels`) reads
  `/me/security/informationProtection/sensitivityLabels`, which needs a
  signed-in user — there's no `/me`-free equivalent this Function's
  app-only auth can reuse without a different endpoint and permission
  that real-world reports describe as inconsistent under client
  credentials.
- The external-sharing check (`sharing`) reads
  `/admin/sharepoint/settings`, which requires the *calling identity*
  to hold the SharePoint Administrator role — a delegated-user role
  assignment with no clean equivalent for a client-credentials service
  principal.

Rather than add a permission for an unattended check nobody's watching
if it silently misbehaves, both stay interactive-only for now; every
other scored check runs here.

## 3. Grant `Sites.Selected` access to exactly one site

`Sites.Selected` alone grants nothing — a tenant admin must explicitly
authorize this app on the specific site Checkpoint uses (the same site
`CHECKPOINT_CONFIG.site` points to in `config.js`). Run this **once**,
as a Global/SharePoint admin, e.g. from
[Graph Explorer](https://developer.microsoft.com/graph/graph-explorer)
signed in with an admin account:

```http
POST https://graph.microsoft.com/v1.0/sites/{siteId}/permissions
Content-Type: application/json

{
  "roles": ["write"],
  "grantedToIdentities": [{
    "application": { "id": "<clientId from step 1>", "displayName": "Checkpoint Posture Monitor" }
  }]
}
```

(`GET /sites/{hostname}:/sites/{sitePath}?$select=id` first, if you
don't already have the site's id — the interactive app's browser
console logs it on first sign-in, or read it from SharePoint's site
settings.) This grant is scoped to that one site only, is independent of
the app registration's Graph API permissions list, and can be revoked at
any time with `DELETE /sites/{siteId}/permissions/{permissionId}`
without touching anything else this app can do.

## 4. Deploy the infrastructure

[![Deploy to Azure](https://aka.ms/deploytoazurebutton)](https://portal.azure.com/#create/Microsoft.Template/uri/https%3A%2F%2Fraw.githubusercontent.com%2Fcompliance-365%2Fwebsite%2Fmain%2Fpublic%2Fcheckpoint%2Fazure%2Fazuredeploy.json)

Fill in the parameters from steps 1–3 (`tenantId`, `clientId`,
`clientSecret`, `spHostname`, `spSitePath`, `listPrefix` — the last two
must match `config.js` exactly). This provisions:

- a Storage Account (required by Azure Functions itself, not part of
  the posture-check data path),
- a Consumption (`Y1`) Linux hosting plan — near-zero cost for one
  short daily execution,
- Application Insights, for run history and failure alerting,
- the Function App itself, with every setting above wired in as an
  app setting.

`main.bicep` is the human-readable source; `azuredeploy.json` (compiled
by hand from it, since this repo has no Bicep CLI in its pipeline — keep
both in sync if you edit either) is what the button above deploys.

For production, move `CLIENT_SECRET` out of the plain app setting the
template creates and into a Key Vault reference
(`@Microsoft.KeyVault(SecretUri=...)`) once the Function App's managed
identity has been granted `get` on that secret — the template doesn't
do this automatically to keep the one-click path dependency-free.

## 4a. Governance sweep — policy reviews and attestation campaigns

Alongside the posture checks, each run sweeps two date-driven things the
posture checks can't see, because they live in Checkpoint's own
SharePoint data rather than in Entra or Intune:

- **Policy review dates.** Any controlled document in the
  `Checkpoint Documents` library that is past its `DocNextReview` date,
  falls due within 30 days, or — the one people miss — is under document
  control with *no* review date at all. ISO 27001 clause 7.5.2 c).
- **Stalled attestation campaigns.** Any campaign in
  `Checkpoint Attestations` still incomplete 21 days after launch, with
  the acknowledged/outstanding split. ISO 27001 A.5.1.

Findings are written to the same `Checkpoint Alerts` list the posture
drift detection uses, so the Dashboard surfaces them with no extra
configuration. **Alerts are deduplicated against the list itself**: a
policy that has been overdue for three weeks produces one alert somebody
still has to acknowledge, not twenty-one identical ones.

This needs **no additional Graph permission** — `Sites.Selected` on the
Checkpoint site already covers reading the library and the list. Both
lists are resolved leniently: a tenant on an older Checkpoint version
that has neither simply gets its posture scan as before, and a
governance-sweep failure is logged without failing the execution, so a
recorded posture scan is never reported as a failed run because the
document register was briefly unreadable.

### Optional: email notification

Off by default. To have new governance findings emailed as they're
raised, set two app settings on the Function App:

| Setting | Value |
| --- | --- |
| `NOTIFY_FROM` | A mailbox in the client's tenant to send **as** (an app-only identity has no mailbox of its own) |
| `NOTIFY_TO` | Comma-separated recipients — typically the ISMS manager |

This is the **only** part of this Function that needs the `Mail.Send`
application permission, and it should be scoped with an [application
access policy](https://learn.microsoft.com/graph/auth-limit-mailbox-access)
restricting the app to just the `NOTIFY_FROM` mailbox — otherwise
`Mail.Send` lets it send as anyone in the tenant. Leave both settings
unset and no mail permission is required at all.

A mail failure never rolls back an alert that was already written to
SharePoint; it's logged and the run continues.

## 5. Deploy the function code

The template above provisions infrastructure only — Azure Resource
Manager has no path for pushing application code. From this
`azure/` folder, with the
[Azure Functions Core Tools](https://learn.microsoft.com/azure/azure-functions/functions-run-local)
installed and signed in (`az login`):

```bash
cd public/checkpoint/azure
func azure functionapp publish <functionAppName>
```

(The VS Code Azure Functions extension's "Deploy to Function App" works
identically if you'd rather not use the CLI.)

## 6. Verify

- **Azure Portal → your Function App → Functions → PostureMonitor →
  Code + Test → Test/Run** triggers an out-of-schedule execution —
  use this once after deploying instead of waiting for the next
  scheduled run.
- Check **Monitor** on that same blade for the execution log; a
  successful run logs `Checkpoint posture monitor: scored N, M drift
  alert(s) and K governance alert(s) written.`
- In the Checkpoint browser app, the Dashboard's "Continuous
  monitoring" panel should now show "Last automated scan: today".
- The `Checkpoint Scans` and `Checkpoint Alerts` SharePoint lists gain
  a new row each run — inspect them directly in SharePoint if you want
  to confirm without opening the app.

## Changing or disabling it

- **Change cadence**: edit the `SCAN_CRON` app setting on the Function
  App (NCRONTAB, seconds precision, UTC) — no redeploy needed. This is
  independent of the browser app's "Posture scan reminder" setting,
  which only controls the Dashboard's overdue-nudge banner, not any
  real schedule.
- **Change thresholds**: the monitor reads the exact same
  `Checkpoint Settings` list the browser app's "Scan thresholds"
  section writes to (`maxGlobalAdmins`, `maxGuests`,
  `maxPermanentPrivileged`, `deviceCompliancePassPct`,
  `deviceComplianceReviewPct`, `riskyUsersReviewMax`) — change them
  from the browser app and the next scheduled run picks them up.
- **Disable**: stop the Function App (Portal → Overview → Stop), or
  delete the resource group this template created. Nothing else in
  Checkpoint depends on it — the app degrades gracefully back to
  interactive-only scanning, same as before this was deployed.
- **Revoke access entirely**: delete the app registration in Entra
  (step 1) and the site permission grant (step 3). The Function App
  will then fail its daily run with an auth error until redeployed with
  a new registration.
