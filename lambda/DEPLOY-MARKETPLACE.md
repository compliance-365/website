# Deploying the Microsoft Marketplace fulfillment Lambda

`lambda/marketplace-fulfillment.js` is the Microsoft-Marketplace
counterpart to `lambda/provision.js`. It is a payment-provider adapter,
not a second product: the same Ed25519 key signs the same payload
shape, the same `PartnerClients`/`PartnerEntitlements` roster records
it, and the customer's app verifies it with the code it already runs.

Read `lambda/DEPLOY-PROVISION.md` first — the owner-tenant app
registration and the entitlement signing key are shared, and this
document assumes they already exist.

## 1. The Entra app registration (new — do not reuse an existing one)

Create a **new** app registration for the Fulfillment API.

**Do not reuse `e335e243-…`, the Checkpoint client app.** That one is a
public client with no secret, which is correct for a browser SPA and is
handed out to every customer tenant. The Fulfillment API needs a
*confidential* client with a secret for server-to-server calls. Putting
a secret on the public app would be wrong on both security and
credential-lifecycle grounds.

1. Entra → App registrations → New registration. Single tenant (ours).
2. Certificates & secrets → New client secret. Record it.
3. Note the Application (client) ID and your tenant ID.

This registration needs **no API permissions**. The Fulfillment API
authorises on the app identity registered against the offer, not on a
delegated scope — you associate this app ID with the offer in Partner
Center's Technical configuration step.

## 2. Environment variables

| Variable | Value |
|---|---|
| `MARKETPLACE_TENANT_ID` | Our own Entra tenant id |
| `MARKETPLACE_CLIENT_ID` | The app registration from step 1 |
| `MARKETPLACE_CLIENT_SECRET` | Its client secret |
| `ENTITLEMENT_PRIVATE_KEY_JWK` | Same signing key as `provision.js` |
| `MODULE_KEYS_JSON` | Same content-pack keys as `provision.js` |
| `OWNER_TENANT_ID` | Our tenant, for roster writes |
| `OWNER_APP_CLIENT_ID` | Roster app registration (app-only) |
| `OWNER_APP_CLIENT_SECRET` | Its secret |
| `MARKETPLACE_API_BASE` | *Optional.* Override the API host — point it at the local emulator to test (see §5) |

## 3. Deploy

1. New Lambda function, Node.js 20.x runtime.
2. Paste this file as `index.mjs` (or zip and upload).
3. Set the environment variables above.
4. API Gateway HTTP trigger, `POST /marketplace`.
5. CORS: Allow-Origin `https://www.compliance365.com.au`,
   Allow-Methods `POST, OPTIONS`, Allow-Headers `Content-Type,
   Authorization`. The `Authorization` header matters — the landing
   page sends the caller's Graph token, and without it every real
   request fails the browser's preflight before reaching the Lambda.

## 4. Partner Center — Technical configuration

On the offer's **Technical configuration** page:

- **Landing page URL** — where Microsoft sends the buyer after
  purchase, with a `token` query parameter.
- **Connection webhook** — the invoke URL from step 3.
- **Microsoft Entra tenant ID** — our tenant.
- **Microsoft Entra application ID** — the app from step 1.

## 5. Test against the emulator BEFORE going live

Microsoft publishes an official
[SaaS API Emulator](https://github.com/microsoft/Commercial-Marketplace-SaaS-API-Emulator).
Run it, point `MARKETPLACE_API_BASE` at it, and you can exercise
resolve → activate → webhook end to end without a live offer or a real
charge. Do this first; it is far cheaper than discovering a fulfillment
bug against a paying customer.

Four things to confirm:

1. **Resolve and activate.** A simulated purchase returns a signed
   activation file, and the app accepts it.
2. **A second plan merges rather than replaces.** Buy a second
   framework and confirm the returned activation carries *both* — one
   plan per framework means a second purchase creates a second
   subscription, and dropping either loses paid-for access.
3. **The webhook refuses forged payloads.** POST an operation id that
   does not exist, and one that belongs to a different subscription.
   Both must be refused. This is the check that stops a stranger who
   learns the endpoint URL from revoking a paying customer — Microsoft's
   webhook POST is not authenticated, so the body is only ever a hint
   and the operation is re-read from the API before anything happens.
4. **A mismatched tenant is refused.** Replay a landing-page request
   with a valid `Authorization` header but a different `tenantId` in the
   body. It must not sign an activation for a tenant the caller does not
   hold — same guarantee, and same reasoning, as `provision.js`.

## 6. Plans

One Marketplace plan per framework, with **plan IDs matching the
framework ids exactly** (`iso27001`, `soc2`, `cps234`, …). That keeps
`PLAN_TO_FRAMEWORK` a lookup rather than a translation table.

Plan IDs are permanent once published. An unrecognised plan id fails
loudly rather than signing an activation for a framework that does not
exist — which the customer's app would then reject, leaving them
paid-up and locked out with no clear reason.

**One behaviour to be deliberate about:** Marketplace surfaces *Change
plan* prominently, and it switches rather than adds. A customer on
`iso27001` who wants `soc2` may hit it expecting to add and instead
lose `iso27001`. The webhook handles this by re-deriving entitlement
from the subscription's current state rather than inferring from the
action name, but name the plans after the framework (never
"Starter"/"Pro") so switching looks obviously wrong to the customer.
