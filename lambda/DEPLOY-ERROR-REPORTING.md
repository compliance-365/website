# Deploying the client-side error-reporting Lambda

`lambda/report-error.js` receives error reports from the Checkpoint
browser app — `window.onerror`/`unhandledrejection`, plus the ~140
existing "something went wrong" catch blocks that already route through
`warn()` in app.js — and writes them to a `Checkpoint Partner
ErrorReports` list in Compliance365's own SharePoint, alongside the
other Partner* rosters. This is the only piece of visibility
Compliance365 has into a signed-in practitioner hitting a genuine bug in
a client tenant's browser, since nothing else in the app reports
failures back here.

This is a low-risk, low-stakes endpoint compared to `provision.js`/
`marketplace-fulfillment.js` — it never signs anything, never grants
access, and the worst outcome of it misbehaving is a dropped error
report, not a security or billing incident. Deploy is correspondingly
simple.

## 1. Reuse the existing owner-roster app registration

This Lambda writes to the SAME `Checkpoint Partner ErrorReports` list
the owner console's own PARTNER_DEFS provisions, using the SAME
app-only credential `recordOnOwnerRoster()` in `provision.js` already
uses. **Do not create a new app registration** — if you haven't set one
up yet, follow `DEPLOY-PROVISION.md` §4 first (Application
`Sites.Selected` or `Sites.ReadWrite.All`, admin-consented, on OUR OWN
tenant) and reuse its `OWNER_APP_CLIENT_ID`/`OWNER_APP_CLIENT_SECRET`
here.

## 2. Environment variables

| Variable | Value |
|---|---|
| `OWNER_TENANT_ID` | Compliance365's own Entra tenant id |
| `OWNER_APP_CLIENT_ID` | The existing owner-roster app registration |
| `OWNER_APP_CLIENT_SECRET` | Its secret |
| `OWNER_NOTIFY_EMAIL` | Optional. A mailbox in your own tenant; turns on email alerts (§9) |

## 3. Deploy

1. New Lambda function, Node.js 20.x runtime.
2. Paste `report-error.js` as `index.mjs` (or zip and upload).
3. Handler: `index.handler`.
4. Set the environment variables above.
5. API Gateway HTTP API trigger, `POST /report-error`.
6. CORS on the route: Allow-Origin `https://www.compliance365.com.au`,
   Allow-Methods `POST, OPTIONS`, Allow-Headers `Content-Type`.
   See [CORS.md](CORS.md): the Lambda's own CORS headers stop applying the
   moment the gateway handles CORS. Verify with `npm run check:cors`.
7. **Configuration → General configuration → Edit → Timeout: 15 sec** (10 is enough without email alerts).
   Do not leave this at AWS's 3-second default: this makes four
   sequential round trips (token, site, list-resolve, item POST)
   against Graph, and that chain does not reliably finish inside 3
   seconds from `ap-southeast-2` — CloudWatch shows `Duration: 3000.00
   ms` with no error logged, i.e. the invocation was killed mid-flight,
   not a caught failure. Worse, the in-flight write can still land in
   SharePoint just after the Lambda is killed, so the caller gets a
   raw `500` for a report that actually saved — the opposite of the
   graceful-drop behaviour this file is built around (see §6 below).


## 4. Provision the SharePoint list

Open the owner console (`/owner/`) at least once after this deploy —
its `provisionPartnerLists()` creates `Checkpoint Partner ErrorReports`
automatically, the same create-if-missing pass every other Partner*
list already goes through. Nothing else to run by hand.

## 5. Point the app at it

Fill in `errorReportUrl` in `public/checkpoint/config.js` with this
route's invoke URL (an `https://*.execute-api.<region>.amazonaws.com/...`
address — already covered by the CSP's existing `connect-src` entry for
that domain pattern, so no CSP change needed). Leave it blank and this
feature is simply never attempted, exactly like every other optional
endpoint in this repo — the app degrades to no error reporting at all,
not a broken feature.

## 6. What this endpoint deliberately does NOT do

- **No authentication.** Same posture as a standard error-telemetry
  ingest endpoint (Sentry/Bugsnag-style: a public project key, not
  per-request auth) — the value of catching a real crash outweighs the
  low-severity abuse risk of someone spamming fake reports, which the
  built-in rate limiter (20 requests/IP/minute) bounds. It never grants
  access to anything and never returns anything to the caller beyond
  `{ok:true|false}`.
- **No retries, no 5xx on failure.** Every failure path — rate-limited,
  malformed body, a SharePoint write that throws — returns `200` with
  `{ok:false, dropped:"..."}`, never an error status. The browser's own
  reporting call is fire-and-forget with no retry logic of its own;
  returning a 5xx here would only risk the CloudWatch logs filling with
  errors ABOUT the error reporter, which defeats the point.
- **No client tenant data, ever.** Every field this Lambda accepts is
  already scoped by app.js's `reportError()` to error text/stack, the
  app's own state (view, version), and the browser's own info — never a
  Graph token, never anything from a risk register or posture scan. This
  Lambda additionally truncates and coerces every field to a string
  before writing anywhere, so even a buggy or malicious caller can't
  smuggle an oversized or malformed payload into the roster.

## 7. Verify

1. In a browser console on the live app, run:
   ```js
   fetch(window.CHECKPOINT_CONFIG.errorReportUrl, {
     method: 'POST', headers: { 'Content-Type': 'application/json' },
     body: JSON.stringify({ message: 'Manual test', source: 'manual-verify' })
   }).then(r => r.json()).then(console.log);
   ```
   Expect `{ok: true}`.
2. Open the owner console's **Errors** tab and confirm the test row
   appears within a few seconds, with the message "Manual test".
3. Acknowledge it from the row's "Acknowledge" button, or open its
   detail drawer to confirm the full context/stack render correctly.

## 8. Setup health reports (Checkpoint 1.105+)

The same endpoint also accepts setup-health reports: `{ type: 'health', ... }`
bodies sent by each client's Checkpoint when its Setup health status changes,
or at most every 12 hours (`reportSetupHealth()` in `public/checkpoint/app.js`).

- **Deploy:** paste the updated `report-error.js` over the existing function.
  No new env vars, route, CORS or timeout change.
- **Storage:** one row per client tenant in **Checkpoint Partner Health**,
  replaced by each new report. The owner console creates that list the next
  time it loads.
- **What is accepted:** only known check ids and statuses, a GUID tenant id,
  the tenant's verified domains (so roster rows entered by domain still match),
  up to 10 one-line problem descriptions, the app version and the last scan
  date. Anything else in the body is dropped (`shapeHealth()`).
- **Where it shows:** the roster's *Last sync / health* column, the health dot,
  and a *Setup health* section in each client's drawer.
- **Opt-out:** a client can switch reporting off in Settings → Setup health.

Verify with:
```js
fetch(window.CHECKPOINT_CONFIG.errorReportUrl, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ type: 'health', tenantId: '00000000-0000-0000-0000-000000000001',
    status: 'warning', headline: 'Posture scan', flags: { scan: 'warn' }, clientName: 'Manual test' })
}).then(r => r.json()).then(console.log);
```
Expect `{ok: true}` and a *Manual test* row in the Health list. Delete that row
afterwards.

## 9. Email alerts (optional)

Set `OWNER_NOTIFY_EMAIL` and the Lambda emails that address:

- **Each new error from a signed-in client.** Subject `Checkpoint error: <client>: <error>`, with the tenant, version, screen, source and the first lines of the stack.
- **A client's setup health turning failing.** Subject `Checkpoint setup failing: <client>`, with the details. Sent once when it turns failing, not on every report while it stays failing.

Limits, because this endpoint is public:

- Errors from the public demo (no signed-in tenant) are saved to the list but not emailed.
- The same error from the same client is emailed at most once every 6 hours.
- At most 10 alert emails an hour per Lambda container.

The owner console's lists stay the full record.

Setup:

1. On the same owner app registration, add **Microsoft Graph → Application → Mail.Send** and grant admin consent. If signup emails from `provision.js` already work, this is already done.
2. Set `OWNER_NOTIFY_EMAIL` on this Lambda (the same address as `provision.js` is fine). The email is sent from and to that mailbox.
3. Raise the timeout to 15 seconds (§3 step 7).
4. Redeploy `report-error.js`.

To test it, sign in to Checkpoint in a real tenant and run `throw new Error('alert test')` in the browser console. The email arrives within a minute. If it doesn't, CloudWatch logs `alert email failed` with Graph's reason.

To turn the alerts off, remove `OWNER_NOTIFY_EMAIL`.
