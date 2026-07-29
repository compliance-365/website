# Deploy the Paddle Webhook Lambda

This keeps your owner-console roster in sync with Paddle in near-real-time
as self-serve subscriptions convert (trial→paid), cancel, or fail payment.
It's the companion to the provisioning Lambda — see `SELF-SERVE-SETUP.md`
for how the whole flow fits together.

> **What this does and doesn't do.** This webhook only updates *your* roster
> (PartnerClients / PartnerEntitlements). It does **not** extend a customer's
> access on conversion — it can't reach their tenant. The customer's own
> entitlement is kept current by their Checkpoint app re-pulling a fresh
> signed file from the provisioning Lambda on load (using the stored Paddle
> subscription id). Both derive from the same Paddle truth.

## What you need
- The provisioning Lambda already deployed (`DEPLOY-PROVISION.md`) — this
  reuses the same owner Azure app registration.
- Access to AWS Console and your Paddle dashboard.

## 1. Create the Lambda function
1. AWS Console → Lambda → Create function
2. Name: `compliance365-paddle-webhook`
3. Runtime: **Node.js 20.x** → Create
4. Paste `webhook.js` as **`index.mjs`**, Handler `index.handler`, and
   **click Deploy** (the step that's easy to miss — inline edits aren't
   live until Deploy).
5. **Configuration → General configuration → Timeout: 30 sec** (it makes
   several Graph calls; the 3-second default will time out).

## 2. Environment variables
Configuration → Environment variables → Edit:

| Key | Value |
|---|---|
| `PADDLE_WEBHOOK_SECRET` | The signing secret from step 4 below (fill in after creating the destination) |
| `OWNER_TENANT_ID` | Same value as the provisioning Lambda |
| `OWNER_APP_CLIENT_ID` | Same as the provisioning Lambda (`f1f1f26d-…`) |
| `OWNER_APP_CLIENT_SECRET` | Same as the provisioning Lambda |

(No signing key or module keys here — this Lambda never issues
entitlements, it only updates the roster.)

## 3. API Gateway trigger
1. Lambda → Add trigger → API Gateway → **HTTP API** → Security **Open**
   → route `POST /compliance365-paddle-webhook` (or accept the default)
2. Copy the invoke URL — you'll paste it into Paddle next.
3. CORS isn't needed here (Paddle calls server-to-server, not a browser),
   so you can skip the CORS step entirely.

## 4. Create the Paddle notification destination
1. Paddle dashboard (sandbox first) → **Developer Tools → Notifications**
   → **New destination**
2. Type: **Webhook**. URL: the API Gateway invoke URL from step 3.
3. Select events to send — at minimum:
   - `subscription.activated`
   - `subscription.updated`
   - `subscription.canceled`
   - `subscription.past_due` (if available)
4. Save. Paddle shows a **secret key** for this destination — copy it into
   the Lambda's `PADDLE_WEBHOOK_SECRET` env var (step 2) and save the Lambda.

## 5. Test it
1. In Paddle → Notifications → your destination, use **"Send simulated
   event"** (or trigger a real sandbox subscription change) for
   `subscription.activated`.
2. Check the Lambda's **CloudWatch logs**: you should see
   `Paddle webhook subscription.activated: {"updated":"<tenant>","status":"active"}`
   for a subscription that has an entitlement row, or
   `{"skipped":"no entitlement row for subscription …"}` for a simulated
   event whose subscription id you've never provisioned (expected).
3. A forged/badly-signed request returns **403** and logs
   `signature verification failed` — confirm by POSTing junk to the URL
   with `curl`; it should 403.
4. For a real end-to-end: in Paddle, advance a sandbox trial to paid (or
   cancel one) and confirm the **owner console roster** flips
   Trial→Active (or →Churned) within a few seconds.

## 6. Go live
When you switch the rest of self-serve to production (`SELF-SERVE-SETUP.md`
§ go-live): create a **production** notification destination in Paddle,
put its secret in this Lambda's `PADDLE_WEBHOOK_SECRET`, and point it at
the same (or a production) API Gateway URL. Sandbox and production
destinations are separate, each with their own secret.

---

## The mapping, in one line
The webhook finds which tenant an event belongs to by looking up the
`PartnerEntitlements` row whose `SubscriptionId` matches the event's
subscription — a column the provisioning Lambda writes when it first
records the client. If no row matches (e.g. a simulated event, or a
subscription that never completed activation), the webhook safely skips it.
