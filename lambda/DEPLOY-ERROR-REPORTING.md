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

## 3. Deploy

1. New Lambda function, Node.js 20.x runtime.
2. Paste `report-error.js` as `index.mjs` (or zip and upload).
3. Handler: `index.handler`.
4. Set the environment variables above.
5. API Gateway HTTP API trigger, `POST /report-error`.
6. CORS on the route: Allow-Origin `https://www.compliance365.com.au`,
   Allow-Methods `POST, OPTIONS`, Allow-Headers `Content-Type`.
7. Leave the timeout at AWS's 3-second default — unlike
   `marketplace-fulfillment.js`, this makes at most three sequential
   Graph calls (token, site, list-resolve-and-write) against
   Compliance365's own tenant, not a chain of external API calls, and a
   report that can't be written in 3 seconds is dropped rather than
   retried regardless (see §5 below).

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
