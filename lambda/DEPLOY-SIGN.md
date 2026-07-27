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
2a. **Manifest** (left nav) → find `"accessTokenAcceptedVersion"` → set it
   to `2` → Save. Left at its default (`null`, which behaves as v1), Entra
   issues v1-format access tokens for this app's scopes — no `scp` claim,
   and a `sts.windows.net` issuer — and `lambda/sign.js`'s verification
   (which expects v2.0 tokens) rejects every one of them with "Unexpected
   token issuer."
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

1. Add trigger → API Gateway → Create a new HTTP API (or REST API — the
   Lambda console's quick-create wizard also offers a route matching the
   function's own name, e.g. `/default/compliance365-sign`, which works
   identically to a hand-picked `POST /sign` route; only the URL differs)
2. Note the **Invoke URL** it gives you
3. **This trigger's own CORS config starts empty ("No Origins are
   allowed") — `lambda/sign.js`'s own CORS headers never get a chance to
   apply, because the API answers the browser's preflight `OPTIONS`
   request itself before the request reaches the Lambda.** Open the API
   in the API Gateway console → **CORS** (HTTP API) or select the
   resource → **Actions → Enable CORS** (REST API), and set:
   - Access-Control-Allow-Origin: `https://www.compliance365.com.au`,
     `http://localhost:4321`, `http://localhost:3000`
   - Access-Control-Allow-Headers: `content-type`, `authorization`
   - Access-Control-Allow-Methods: `POST`, `OPTIONS`
   - Access-Control-Allow-Credentials: **No**
   Save. On a REST API this also needs **Actions → Deploy API** to the
   stage afterwards, or the change never goes live.

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

If the browser console shows a CORS error ("Origin ... is not allowed by
Access-Control-Allow-Origin") rather than reaching the Lambda at all —
that's step 4.3 above not done yet, not an Entra problem.

If it fails with "Not authorized to use this endpoint" — the request did
reach the Lambda; check CloudWatch logs for that invocation for a
`Sign handler error: ...` line, which gives the real reason (deliberately
collapsed to one generic message for anyone probing the endpoint from
outside). In order of how these actually show up during a first deploy:

1. `"Unexpected token issuer."` — step 2a above (`accessTokenAcceptedVersion`)
   wasn't set to `2` on the signing app registration, so Entra issued a
   v1-format token.
2. `"Token was not issued for this endpoint."` — usually NOT a real
   mismatch: when the Application ID URI is left at its default
   `api://<clientId>` form, Entra's v2.0 tokens carry `aud` as the bare
   client ID GUID rather than the full URI. `lambda/sign.js` already
   accepts either form, so if you're still seeing this on a current copy
   of the file, check for a genuine typo/whitespace difference between
   `SIGN_APP_AUDIENCE` and `config.js`'s `signingEndpoint.scope` instead.
3. `"Token does not carry the required ... scope."` — the admin consent
   in step 1.4 wasn't granted, or was granted before a later change to
   the scope name.
4. `"Token was issued by a different tenant — refusing."` /
   `"Unexpected token issuer."` (tenant, not version, form) —
   `OWNER_TENANT_ID` doesn't match the tenant your owner console session
   is actually signed into.
5. Token simply expired between generating and clicking — retry.

A stale cached token in the browser (MSAL caches per-scope) can make a
now-fixed setup keep failing with the old error — clear site data or use
a private window to force a fresh token after changing any Entra setting.

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
