# Deploying the owner pulse (weekly summary + daily watchdog)

`lambda/owner-pulse.js` sends you two kinds of email:

- **Every Monday at 8am**, a summary of every Checkpoint client:
  - trials ending this week, and trials that ended without buying;
  - paid licences due for renewal in the next 30 days;
  - licensed clients who haven't opened Checkpoint for 14 days or more;
  - setup problems;
  - errors from the last 7 days;
  - new sign-ups.

  It is sent even in an all-quiet week, so you know it is still running.
- **Every morning at 7am**, a watchdog email, **only if something is broken**. It checks the website, the Checkpoint app, the contact form, sign-ups, checkout activation and error reporting.

It reads the owner console's own SharePoint lists and never writes to them. It uses the same app registration and mailbox as the error alerts (`DEPLOY-ERROR-REPORTING.md` §9), so if those work, the permissions are already in place.

## 1. Create the function

1. AWS Lambda → **Create function** → Author from scratch.
   - Name: `compliance365-owner-pulse`
   - Runtime: Node.js 20.x or later
   - Region: ap-southeast-2 (Sydney)
2. **Code** tab: open `index.mjs`, replace its contents with `lambda/owner-pulse.js`, then click **Deploy**.
3. **Configuration → General configuration → Edit**: Timeout **1 min**, Memory **256 MB**.
4. **Configuration → Environment variables**: copy these four from `Compliance365-Checkpoint-Error`:

| Variable | Value |
|---|---|
| `OWNER_TENANT_ID` | Same as the error Lambda |
| `OWNER_APP_CLIENT_ID` | Same as the error Lambda |
| `OWNER_APP_CLIENT_SECRET` | Same as the error Lambda |
| `OWNER_NOTIFY_EMAIL` | Same as the error Lambda (where the emails go) |
| `ALERT_TIMEZONE` | Optional. Default `Australia/Brisbane` |

No API Gateway trigger is needed. Nothing on the website calls this function.

## 2. Test it

On the **Test** tab:
1. Create an event with the JSON `{ "job": "weekly" }` and click **Test**. The weekly email should arrive within a minute.
2. Then test `{ "job": "watchdog" }`. It returns `failing: []` and sends nothing when all is well.

## 3. Schedule it

Amazon EventBridge → **Scheduler → Schedules → Create schedule**, twice:

| Name | Schedule | Time zone | Target input |
|---|---|---|---|
| `owner-pulse-weekly` | Recurring, cron `0 8 ? * MON *` | Australia/Brisbane | `{ "job": "weekly" }` |
| `owner-pulse-watchdog` | Recurring, cron `0 7 * * ? *` | Australia/Brisbane | `{ "job": "watchdog" }` |

For each one:
- **Flexible time window:** Off.
- **Target:** AWS Lambda → Invoke → `compliance365-owner-pulse`, with the input above.
- **Permissions:** let Scheduler create a new role.

## What the watchdog checks, and how

Each check proves the code behind an endpoint is running, without creating anything. Nothing is emailed, saved or added to HubSpot.

| Check | How | If it fails |
|---|---|---|
| Website | Loads the home page | Visitors can't reach the site |
| Checkpoint app | Loads `/checkpoint/` | Clients and trials can't open Checkpoint |
| Contact form | The browser's pre-send (CORS) check only | Enquiries may not be reaching you |
| Sign-ups | Sends an empty sign-up, which is rejected before anything is sent | Sign-ups and HubSpot copies are failing |
| Checkout activation | Asks whether your own tenant is blocked | New purchases and trials may not activate |
| Error reporting | Sends an invalid health report, which is dropped unsaved | Client errors aren't reaching you |

**Limit:** the contact form's Lambda isn't in this repo, and a real test message would land in your inbox. So the watchdog only confirms that the contact route answers. It can't tell whether the Lambda behind it can still send email. The sign-up check covers part of this, because sign-ups are emailed through the same contact Lambda.

## Cost

About 35 invocations a month, each lasting a few seconds. That is well within the Lambda and EventBridge free tiers.
