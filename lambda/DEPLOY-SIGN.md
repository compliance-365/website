# Deploy the owner-console signing Lambda

This is the one-time setup that makes **New client → Sign automatically
via endpoint** in the owner console actually work, instead of showing
"No signing endpoint configured". Once done, issuing a client's
activation is one click in the owner console — no terminal, no Node
install, no handling `entitlement-private.json` on your own machine for
routine issuances.

**This is entirely optional.** The CLI path (`node
tools/issue-entitlement.mjs issue ...`, copy the command the owner
console already generates) keeps working exactly as before — see
`tools/ISSUANCE.md` for the trade-off between the two. Skipping this
deployment changes nothing about how Checkpoint works for clients.

## What you need
- Your existing `entitlement-private.json` and `tools/module-keys.json`
- Access to the AWS Console (the same account `compliance365-provision`
  already runs in)
- Access to the Microsoft Entra admin centre for **Compliance365's own
  tenant** — not a client's

## Why this doesn't need an Azure Function

`tools/ISSUANCE.md` originally sketched this as an Azure Function,
because the thing that makes a caller trusted — an Entra access token,
issued by our own tenant, for a specific scope on a specific app
registration — is an Entra concept. But an Entra app registration is
just identity metadata: it defines and protects a scope. Nothing about
validating that token requires the code doing the validating to run on
Azure. `lambda/sign.js` validates it directly (JWT signature against
Entra's own published keys, plus issuer/tenant/audience/scope checks) —
so this deploys onto the exact same AWS account and pattern as
`compliance365-provision`, one platform to operate instead of two.

## 1. Register the Entra app for this endpoint (5 minutes, no cost)

In **Compliance365's own tenant** (not a client's):

1. Entra admin centre → **App registrations → New registration**.
   Name: `Checkpoint Signing Endpoint`. Single tenant (Compliance365
   only — this must never be multi-tenant).
2. **Expose an API** → **Add a scope**.
   - Application ID URI: accept the default (`api://<the-app's-client-id>`)
     — copy this whole string, it's `SIGN_APP_AUDIENCE` below.
   - Scope name: `Sign.Entitlement`
   - Who can consent: **Admins only**
   - Add the scope.
3. Still on this app: **Overview** → copy the **Directory (tenant) ID**
   → this is `OWNER_TENANT_ID` below (it should already match whatever
   tenant your owner console itself signs into).
4. **API permissions** on the owner console's *own* app registration
   (the `clientId` already in `public/checkpoint/config.js`) →
   **Add a permission → APIs my organization uses** → find
   `Checkpoint Signing Endpoint` → **Delegated permissions** →
   check `Sign.Entitlement` → **Add permissions** →
   **Grant admin consent for [your tenant]**.

That consent grant is the entire access-control boundary: only
Compliance365's own owner-console app, signed into Compliance365's own
tenant, has ever been authorized to request a token for this scope. A
client's browser — a different app registration, signed into a
different tenant — has no path to it at any layer.

## 2. Create the Lambda

1. AWS Console → Lambda → **Create function**
2. Name: `compliance365-sign`
3. Runtime: **Node.js 20.x**
4. Create function, then upload `lambda/sign.js` from this repo as
   `index.mjs` (or zip and upload)
5. Runtime settings → Handler: `index.handler`
6. **Configuration → General configuration → Edit** → Timeout: 10
   seconds is plenty (this makes at most one outbound call, to fetch
   Entra's signing keys, cached after the first invocation)

## 3. Set environment variables

Lambda → Configuration → Environment variables → Edit:

| Key | Value |
|---|---|
| `ENTITLEMENT_PRIVATE_KEY_JWK` | The exact contents of `entitlement-private.json`, as one line |
| `MODULE_KEYS_JSON` | The exact contents of `tools/module-keys.json`, as one line |
| `OWNER_TENANT_ID` | From step 1.3 |
| `SIGN_APP_AUDIENCE` | From step 1.2 (the `api://...` Application ID URI) |
| `SIGN_APP_SCOPE_NAME` | Optional — only set this if you named the scope something other than `Sign.Entitlement` in step 1.2 |

Same private key as the CLI and `compliance365-provision` — one key for
the whole product, whichever path issues the file.

## 4. Add an API Gateway trigger

Same shape as `compliance365-provision` — see
`lambda/DEPLOY-PROVISION.md` §5 if you need the click-by-click, in
short:

1. Add trigger → API Gateway → Create a new HTTP API
2. Route: `POST /sign`
3. Note the **Invoke URL** it gives you

## 5. Point the owner console at it

In `public/checkpoint/config.js`:

```js
signingEndpoint: {
  url: 'https://<your-invoke-url>/sign',
  scope: 'api://<sign-app-client-id>/Sign.Entitlement'   // SIGN_APP_AUDIENCE + '/' + the scope name from step 1.2
},
scopesSigning: ['api://<sign-app-client-id>/Sign.Entitlement'],   // same value — this is what Graph.signingToken() requests
```

Rebuild and redeploy the site. The next time you open **New client** in
the owner console, generate a plan, and it'll show **"Sign automatically
via endpoint"** instead of just the CLI command.

## 6. Verify it end to end

1. Owner console → **New client** → fill in a real or test tenant →
   **Generate**.
2. Click **Sign automatically via endpoint**.
3. It should say "Signed successfully" within a couple of seconds, and
   a **Download signed activation file** link appears.
4. Open that file and confirm it's the JSON shape you'd expect
   (`{ "payload": {...}, "signature": "..." }`) — the owner console has
   already independently verified its signature against your public key
   before showing you this, so if it got this far, it's genuinely valid.

If it fails with "Not authorized to use this endpoint" — the four things
that message can mean (deliberately collapsed into one message for
anyone probing the endpoint; check CloudWatch logs for the Lambda for
the real reason) are: the admin consent in step 1.4 wasn't granted, the
`SIGN_APP_AUDIENCE`/`scopesSigning` values don't match between
`config.js` and the Lambda's environment variables, the token expired
between generating and clicking (just retry), or `OWNER_TENANT_ID`
doesn't match the tenant your owner console session is actually signed
into.

## Rotating or revoking access

- **Revoke one practitioner's ability to sign** — remove them from
  whatever Entra role/group has access to the owner console app
  registration itself. This endpoint has no separate user list; access
  follows the owner console's own.
- **Kill this path entirely without losing the CLI path** — delete the
  admin consent grant from step 1.4, or set `signingEndpoint.url` back
  to `''` in `config.js` and redeploy. Nothing else changes.
- **The private key was exposed** — same rotation procedure as
  `tools/ISSUANCE.md` §2 covers for the CLI: `keygen --force`, update
  `entitlementPublicKey`, reissue every active client, **and** update
  this Lambda's `ENTITLEMENT_PRIVATE_KEY_JWK` environment variable to
  match.
