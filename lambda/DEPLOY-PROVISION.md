# Deploy the Self-Serve Provisioning Lambda

This is the one-time setup that makes trial/subscription signups on
`/start` fully automatic — the customer signs in with Microsoft, and
Checkpoint activates itself, no CLI, no emailed file, no manual owner
console entry.

## What you need
- Paddle account with the framework prices already created (done)
- Your existing `entitlement-private.json` and `tools/module-keys.json`
- Access to AWS Console
- Access to Azure Portal (App registrations) for Compliance365's own tenant

## 1. Create the Lambda function
1. AWS Console → Lambda → Create function
2. Name: `compliance365-provision`
3. Runtime: **Node.js 20.x**
4. Create function

## 2. Upload the code
1. Upload `provision.js` from this folder as `index.mjs` (or zip and upload)
2. Runtime settings → Handler: `index.handler`

## 3. Set environment variables
Lambda → Configuration → Environment variables → Edit. Add all of:

| Key | Value |
|---|---|
| `PADDLE_API_KEY` | Paddle → Developer Tools → Authentication → **API keys** (not the client-side token) |
| `PADDLE_ENV` | `sandbox` while testing, `production` once live |
| `ENTITLEMENT_PRIVATE_KEY_JWK` | The exact contents of `entitlement-private.json`, as one line |
| `MODULE_KEYS_JSON` | The exact contents of `tools/module-keys.json`, as one line |
| `OWNER_TENANT_ID` | Compliance365's own Entra tenant id or verified domain |
| `OWNER_APP_CLIENT_ID` | See step 4 below |
| `OWNER_APP_CLIENT_SECRET` | See step 4 below |

## 4. Azure app registration (writes to OUR OWN roster only)

This is a **separate, new** app registration from the Checkpoint app's own
client id — this one authenticates as itself (client-credentials/app-only),
not as a signed-in user, because the Lambda runs unattended.

1. Azure Portal → Entra ID → App registrations → New registration.
   Name: "Compliance365 Provisioning Service". Single tenant.
2. API permissions → Add a permission → Microsoft Graph → **Application
   permissions** → `Sites.Selected` (recommended — least privilege, see
   below) or `Sites.ReadWrite.All` (simpler, but tenant-wide). Grant admin
   consent.
3. If you used `Sites.Selected`: you still need to explicitly grant this
   app access to the specific SharePoint site the owner console's lists
   live in. From another authenticated context (e.g. Graph Explorer as a
   site admin), `POST /sites/{site-id}/permissions` with this app's id
   and `write` role. This confines the Lambda to that one site instead of
   every SharePoint site in your tenant.
4. Certificates & secrets → New client secret. Copy the **value**
   immediately (shown once) → `OWNER_APP_CLIENT_SECRET`.
5. Overview page → Application (client) ID → `OWNER_APP_CLIENT_ID`.
   Directory (tenant) ID → `OWNER_TENANT_ID`.

## 5. Add an API Gateway trigger
1. Lambda → Add trigger → API Gateway → **HTTP API**
2. Security: Open (CORS handled in code)
3. Route: `POST /provision`

## 6. Enable CORS on the route
1. API Gateway → your API → Routes → the POST route → CORS
2. Allow origin: `https://www.compliance365.com.au`
3. Allow headers: `content-type`
4. Allow methods: `POST, OPTIONS`

## 7. Wire the front end
Copy the invoke URL (looks like
`https://xxxxxxxxxx.execute-api.ap-southeast-2.amazonaws.com/provision`)
into **`public/checkpoint/config.js`**:

```js
selfServeActivateUrl: 'https://xxxxxxxxxx.execute-api.ap-southeast-2.amazonaws.com/provision',
```

That's the only front-end change needed — `app.js`'s
`attemptSelfServeActivation()` is already wired to call it whenever
`selfServeActivateUrl` is non-empty and a customer arrives at
`/checkpoint/?activate=1` with Paddle's own `?_ptxn=...` transaction id.

## 8. Test end to end (sandbox)
1. Go to `/pricing`, build a plan, go to `/start`, click "Start free
   trial with a card," complete Paddle's **sandbox** checkout with a
   Paddle test card.
2. You should land on `/checkpoint/?activate=1&_ptxn=...`, be prompted to
   sign in with Microsoft, and see "Confirming your purchase…" — then
   either move straight past the activation step, or show a clear error
   if something's misconfigured.
3. **Before trusting this in anger**, confirm the exact Paddle
   subscription/transaction response shape matches what `provision.js`'s
   `resolvePurchase()` expects (`current_billing_period`, `next_billed_at`,
   `items[].price.id`, `status` values) against a real Paddle sandbox
   call — this was written from Paddle's documented API shape but hasn't
   been exercised against a live response. Log the raw `sub` object
   temporarily if anything doesn't line up.
4. Check the owner console's roster/Dashboard — the new client should
   have appeared automatically.

## 9. Go live
Once sandbox testing looks right: switch `PADDLE_ENV` to `production`,
swap `SELF_SERVE.paddleToken`/`paddleEnv` in `src/data/pricing.js` to your
live Paddle credentials and price ids (Paddle sandbox and production
catalogues are entirely separate — you'll need to recreate the 12+
prices there too), and you're taking real self-serve signups.

## Cost estimate
Same ballpark as the chat/subscribe Lambdas — Lambda and API Gateway's
free tiers cover any realistic trial-signup volume for a while; the only
real cost driver is Paddle's own transaction fee on actual charges.
