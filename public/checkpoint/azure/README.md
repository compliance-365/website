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
| `Policy.Read.All` | Read | `mfa-all`, `mfa-priv`, `legacy`, `ca-device`, `ca-risk`, `ca-sif`, `ca-tou`, `ca-cas` | Reads Conditional Access policies only. No narrower Graph permission exists for CA policies. The five checks added later all mine fields off the same policy array `mfa-all`/`legacy`/`mfa-priv` already fetch — no second call, no broader grant. |
| `RoleManagement.Read.Directory` | Read | `admins`, `pim`, `leaver`, `sod` | Reads directory role membership and PIM eligibility/assignment schedule instances. Doesn't grant any ability to *change* role assignments — that would be `RoleManagement.ReadWrite.Directory`, not requested. `leaver`/`sod` reuse the same `/directoryRoles` + per-role `/members` reads this permission already authorized for `admins`. |
| `User.Read.All` | Read | `guests`, `leaver` | Lists guest ( `userType eq 'Guest'` ) accounts, and (for `leaver`) every user's `accountEnabled`/`assignedLicenses`. Directory-wide by necessity (guests aren't scoped to a single group), but read-only — no profile or password write capability. |
| `Directory.Read.All` | Read | `riskyapps`, `oauth-consent` | The only Graph permission that authorizes application-level enumeration of `oauth2PermissionGrants` (existing OAuth consent grants). It's a superset of `User.Read.All` above — listed as its own row for clarity, but the two together don't add any write capability beyond either alone. `oauth-consent` reads the SAME grants array as `riskyapps`, just scoring a field (`consentType`) nothing previously read. |
| `IdentityRiskyUser.Read.All` | Read | `riskyusers` | Scoped specifically to Identity Protection's risky-user signal — doesn't grant sign-in log or broader security-event access. |
| `AccessReview.Read.All` | Read | `access-review` | Confirms Entra Access Reviews are configured — read-only, no ability to create, complete or decide a review. |
| `DeviceManagementManagedDevices.Read.All` | Read | `device`, `device-checkin` | Reads Intune device compliance state (and, for `device-checkin`, `lastSyncDateTime` off the SAME response) only — not device configuration, not the ability to retire/wipe a device (that's `DeviceManagementManagedDevices.PrivilegedOperations.All`, nowhere near requested). |
| `DeviceManagementConfiguration.Read.All` | Read | `compliance-policy`, `device-config` | Confirms compliance policies and classic device configuration profiles exist — read-only, no ability to author or assign either. |
| `SecurityEvents.Read.All` | Read | `patch`, `macro`, `logging`, `wdac`, `alerts`, `dlp`, `encryption` | Reads Microsoft Secure Score control scores — the same heuristic, best-effort mapping the interactive app uses, clearly labelled as such in both places. `dlp`/`encryption` have no verified exact Secure Score control-name match (see the code comment) and run on a lower-confidence substring fallback only. |
| `Sites.Selected` | Read **and write** | Writing `Checkpoint Scans` / `Checkpoint Alerts`, reading `Checkpoint Settings`, `Calendar`, `Documents`, `Vendors`, `Audits`, `Incidents` (`backup`, `bcp`, `supplier`, `policy`, `audit-review`, `incident-lessons`) | The **only** write-capable permission this identity holds, and it's the narrowest SharePoint permission Graph offers: with `Sites.Selected`, the app has **zero** access to **any** SharePoint site until a tenant admin explicitly grants it a role on one specific site (step 3 below). Compare to `Sites.ReadWrite.All`, which would hand this Function write access to **every** SharePoint site in the tenant — never requested here. The six register-derived checks read more lists on that SAME one site already granted — no new site, no new permission, no new admin consent. |
| `SecurityIncident.Read.All` | Read | `xdr-incidents` | Reads the Defender XDR incident queue only — Checkpoint reports on incidents and never assigns, classifies or resolves one; that's the SOC's job in Defender. Same scope the interactive app's delegated `SecurityIncident.Read.All` grant already backs. |
| `SubjectRightsRequest.Read.All` | Read | `privacy-srr` | Reads Microsoft Priva subject rights requests only — no ability to create, action or close one. Scored against each request's own recorded `dueDateTime` rather than assuming a jurisdiction. |
| `LifecycleWorkflows.Read.All` | Read | `lifecycle-workflows` | Confirms Entra ID Governance's Lifecycle Workflows exist and are enabled — read-only visibility, never provisions a workflow on the tenant's behalf. |

No permission above grants the ability to change a Conditional Access
policy, role assignment, device compliance policy, or user account —
only to read those signals and to write to the two SharePoint lists this
same monitor owns.

Sixteen of the checks above (`ca-device`, `ca-risk`, `ca-sif`, `ca-tou`,
`ca-cas`, `oauth-consent`, `leaver`, `sod`, `device-checkin`,
`device-config`, `backup`, `bcp`, `supplier`, `policy`, `audit-review`,
`incident-lessons`) were added without touching the original permission
list at all — each either mines a field off a Graph response this
Function was already fetching for another check, or makes a small number
of new calls under a permission already granted. `xdr-incidents`,
`privacy-srr` and `lifecycle-workflows` each needed a genuinely new
permission and a fresh admin-consent decision — a real tradeoff (broader
app-only, unattended access is a bigger ask than the same data via a
delegated session, even inside the client's own tenant), which is why
this was a deliberate, separate change rather than bundled into the
batch above.

**`retention` can never move here, whatever the permission decision.**
Its Graph permission, `RecordsManagement.Read.All`, has no Application
permission type at all in Entra ID — delegated only, a Microsoft
platform limitation rather than a scoping choice. This is not new
information: `config.js`'s own comment on this scope, and `graph.js`'s
capability note for `recordsManagement`, both said so before this
Function's second permission batch was even considered.

Two interactive-app checks are deliberately **not** mirrored here, for
the same reason as `retention` — no clean app-only equivalent exists:

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

All three stay interactive-only permanently; every other scored check
runs here.

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

The Checkpoint browser app's Dashboard has a guided version of steps
1–4 (Continuous monitoring card, once no automated scan has been
recorded yet) that fills in `tenantId`, `spHostname`, `spSitePath` and
`listPrefix` from this tenant's own live data, builds the exact step 3
Sites.Selected request below with the resolved site ID substituted in,
and tracks which of the six steps is done. This section is the
underlying reference it's built from — use whichever is more
convenient; both stay in sync by hand (`MONITOR_APP_PERMISSIONS` in
lib.js mirrors the table in §2 above).

[![Deploy to Azure](https://aka.ms/deploytoazurebutton)](https://portal.azure.com/#create/Microsoft.Template/uri/https%3A%2F%2Fraw.githubusercontent.com%2Fcompliance-365%2Fwebsite%2Fmain%2Fpublic%2Fcheckpoint%2Fazure%2Fazuredeploy.json)

Fill in the parameters from steps 1–3 (`tenantId`, `clientId`,
`clientSecret`, `spHostname`, `spSitePath`, `listPrefix` — the last two
must match `config.js` exactly). The Azure Portal's button above has no
supported way to pre-fill these from a URL — only default values from
the template itself — so they still need pasting in by hand here or in
the in-app panel. This provisions:

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

### Keeping the client secret out of app settings

The template takes the secret **either** way, and the Function App now
always gets a system-assigned managed identity so the Key Vault path
works without any post-deployment surgery:

| Parameter | Result |
|---|---|
| `clientSecret` | The value is stored directly as the `CLIENT_SECRET` app setting. Simplest, and fine for a trial — but the secret then sits in plain text in the Function App's configuration for as long as it lives there. |
| `clientSecretKeyVaultSecretUri` | `CLIENT_SECRET` becomes `@Microsoft.KeyVault(SecretUri=…)`, resolved at runtime by the managed identity. **No secret value is stored in app settings, or passed through this template at all.** |

Supplying the Key Vault URI takes precedence, so leave `clientSecret`
blank when you use it. Recommended for anything beyond a trial:

1. Put the secret in a vault:
   ```bash
   az keyvault secret set --vault-name <vault> \
     --name checkpoint-monitor-secret --value "<the client secret>"
   ```
2. Deploy with `clientSecretKeyVaultSecretUri` set to the returned `id`
   (e.g. `https://<vault>.vault.azure.net/secrets/checkpoint-monitor-secret`)
   and `clientSecret` left blank.
3. Grant the Function App's identity read access to that secret:
   ```bash
   az keyvault set-policy --name <vault> \
     --object-id $(az functionapp identity show -g <rg> -n <app> --query principalId -o tsv) \
     --secret-permissions get
   ```
   (On an RBAC-enabled vault, assign **Key Vault Secrets User** to that
   principal instead.)

Rotating the secret afterwards is then a vault operation — the Function
App picks up the new value without redeploying or editing app settings.

To move an **existing** deployment across, set the same reference on the
app it already has and grant the identity as above:

```bash
az functionapp config appsettings set -g <rg> -n <app> --settings \
  "CLIENT_SECRET=@Microsoft.KeyVault(SecretUri=https://<vault>.vault.azure.net/secrets/checkpoint-monitor-secret)"
```

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

The same run also scores the **security awareness training** check from
the `Checkpoint Training` list. It is the one scored check with no Graph
signal behind it, and it is computed here with exactly the thresholds
and rules the browser app uses (`CheckpointLib.trainingCheckResult()` —
Exempt records leave the denominator, any overdue incomplete assignment
caps the result at `fail`, and no records at all resolves to `manual`,
never a failure). Without it the unattended score and the interactive
score were computed over different denominators, so the two disagreed on
the same tenant and the Dashboard sparkline showed drift that never
happened. A tenant with no `Checkpoint Training` list simply has the
check absent from the run, same as any other check that couldn't be
measured.

Findings are written to the same `Checkpoint Alerts` list the posture
drift detection uses, so the Dashboard surfaces them with no extra
configuration. **Alerts are deduplicated against the list itself**: a
policy that has been overdue for three weeks produces one alert somebody
still has to acknowledge, not twenty-one identical ones.

This needs **no additional Graph permission** — `Sites.Selected` on the
Checkpoint site already covers reading the library and the lists. All
three lists (`Documents`, `Attestations`, `Training`) are resolved
leniently: a tenant on an older Checkpoint version that has none of them
simply gets its posture scan as before, and a
governance-sweep failure is logged without failing the execution, so a
recorded posture scan is never reported as a failed run because the
document register was briefly unreadable.

The sweep also chases the work itself, not just the paperwork:

- **Overdue remediation actions**, one alert per action (keyed by its
  RefId, so it is raised once and acknowledged once rather than
  re-raised every night).
- **Controls overdue for re-verification** against the tenant's own
  `controlReviewCadenceDays` — one rolled-up alert naming the oldest
  few, because a mature tenant carries dozens and thirty individually
  un-actionable alerts is how an alert list gets ignored.
- **Privacy-breach assessment deadlines**, raised seven days *before*
  the date as well as after. Confirm your own jurisdiction's deadline:
  the date Checkpoint tracks is a configured default, not legal advice.
- **Overdue actions are chased with the owner, not just about them.**
  When an action carries an `OwnerEmail`, the owner is emailed directly
  the run the alert is first raised — once, not once a night, because
  the chase list is filtered to findings that survived alert dedup.
  `Owner` on its own is free text (a team, an external contractor) with
  nothing safe to resolve to an address, so an action without
  `OwnerEmail` raises the same ISMS-manager alert as before and chases
  nobody; a compliance nudge sent to a guessed address is worse than
  one not sent. Needs `NOTIFY_FROM` (below); without it the sweep still
  writes every alert and simply sends nothing. With `EVIDENCE_LINK_SECRET`
  set (it is, automatically — see below), the chase email also carries a
  personal, no-sign-in link the owner can use to record progress
  directly — see "Owner-driven evidence" below.
- **Vendor reassessment and certification/report expiry**, one alert per
  vendor per check (not rolled up — unlike stale controls, a tenant
  usually only has a handful of vendors, and *which* vendor is the
  entire point of the alert), warned 30 days ahead as well as after:
  the vendor's own `NextReviewDue`, and — if the tenant has recorded one
  — `CertExpiryDate` for whatever evidence the vendor register relies on
  (a SOC 2 report, an ISO 27001 certificate). `CertExpiryDate` is
  optional per vendor; a vendor with nothing recorded there raises
  nothing for it.

### Owner-driven evidence — no sign-in required

Everyone in the client's directory already has, in principle, everything
Entra needs to sign into the full Checkpoint app — but that's the wrong
shape of fix for "let the action owner report progress themselves."
Signing them in means consenting the same broad, sensitive scopes
(Conditional Access, PIM, Secure Score, directory roles) this whole
Function's own permission table above exists to keep narrow, on top of a
per-tenant licensing model built around one practitioner seat, not every
employee. SharePoint lists also don't give row-level write security for
free — nothing stops a second signed-in user editing someone else's
action.

Instead, the overdue-owner chase email (above) carries a personal link
to a lightweight, static page — `evidence.html`, hosted on
Compliance365's own public site, **not** this Function App — scoped to
exactly the one action it was sent about. No MSAL sign-in, no Graph
scope consent: a short-lived, HMAC-signed token (`EVIDENCE_LINK_SECRET`,
an app setting **auto-generated at deploy time** — nothing to configure)
naming that one action item id is the entire authorisation boundary.
`EvidenceSubmit`, a second HTTP-triggered function in this same Function
App, verifies the token, reads the action's title/due date/priority for
the page to display, and — on submission — writes exactly like a
practitioner's own "Complete action" flow in the browser app: an
append-only `Checkpoint ActionUpdates` row, plus the action's own
`Status`/`EvidenceUrl` fields patched to match. The `Author` field and
the email's own "no sign-in needed" framing keep the provenance visible
in the audit trail — this was never meant to look indistinguishable from
a practitioner-authored update.

Deliberately narrower than the browser app's own action editing: an
owner can report **In progress** or **Done**, with a note and/or an
evidence link, and nothing else — never reopen a finding, never cancel
one, never touch title/owner/priority/due date/control. The
practitioner who put this owner's email on the action already
authorised them to report on **that** action; nothing here can reach
any other row, on this action's list or any other.

Needs no new Graph permission at all — it reuses this identity's
existing `Sites.Selected` write access on the one site Checkpoint
already owns. `EVIDENCE_LINK_SECRET` is generated once, automatically,
from `guid(resourceGroup().id, functionAppName, 'evidenceLinkSecret')`
in `azuredeploy.json`/`main.bicep`; the Function App's CORS setting
(also part of that template) allows exactly one origin —
`https://www.compliance365.com.au`, where `evidence.html` is served
from — never `*`. A tenant that deployed this Function before
`EVIDENCE_LINK_SECRET` existed simply gets the old plain "Open
Checkpoint" chase text until redeployed; nothing breaks, and no link is
ever emitted broken.

### The periodic digest

If the tenant has turned the digest on in Checkpoint (Frameworks &
Settings → Email digest), this Function sends it — the browser app
cannot, since a closed tab sends no mail. It reads the same four
Settings keys the app writes (`digestEnabled`, `digestFrequency`,
`digestRecipients`, `digestLastSent`), composes the digest from data the
run has already read, and stamps `digestLastSent` **only after a
successful send**, so a failed send retries on the next run rather than
silently skipping a period. It needs `NOTIFY_FROM` set (below) — an
app-only identity has no mailbox of its own to send from.

### Optional: email notification

Off by default. To have new findings emailed as they're raised — both
pass → fail posture drift and governance-sweep items, each as its own
message — and to enable the digest above, set two app settings on the
Function App:

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

### Optional: Microsoft Teams notification

Also off by default, and independent of the email setting above — a
tenant can turn on either, both, or neither. Posts the same governance-
sweep and drift-alert notifications to a Teams channel, as a plain-text
summary rather than the HTML built for email:

| Setting | Value |
| --- | --- |
| `TEAMS_WEBHOOK_URL` | An [Incoming Webhook](https://learn.microsoft.com/microsoftteams/platform/webhooks-and-connectors/how-to/add-incoming-webhook) URL for the channel that should receive alerts |

This needs no Graph permission at all — it's a plain HTTPS POST to a
URL whose secrecy is the only auth, so it works even on a tenant that
never grants `Mail.Send`. Leave the setting unset and nothing is posted.
Like the mail path, a webhook failure never rolls back an alert already
written to SharePoint.

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
identically if you'd rather not use the CLI.) This deploys **both**
functions in this folder — the timer-triggered `PostureMonitor` and the
HTTP-triggered `EvidenceSubmit` (see "Owner-driven evidence" above) —
in one push; there's nothing to deploy separately.

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
- To check the owner-driven evidence link specifically: add an
  `OwnerEmail` to an overdue action, wait for (or trigger) a run, and
  confirm the chase email lands with a "Record progress or attach
  evidence" link rather than plain "Open Checkpoint" text — the
  difference between `EVIDENCE_LINK_SECRET` being set (it is,
  automatically, from the deploy above) and not.

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
- **Invalidate every outstanding evidence link at once**: change the
  `EVIDENCE_LINK_SECRET` app setting to any new value (Portal →
  Configuration, or `az functionapp config appsettings set`). Every
  token minted under the old secret stops verifying immediately;
  links emailed after the change use the new one. There's normally no
  need to do this — links expire on their own after 30 days — but it's
  there for the rare "an email account was compromised" case.
