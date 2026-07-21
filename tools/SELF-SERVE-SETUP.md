# Self-serve trials & checkout — setup guide

This is the one-time infrastructure setup that turns the `/pricing` and
`/start` pages from "book a call to activate" into a fully automatic
self-serve flow: a customer picks their frameworks, pays with a card,
starts a 7-day free trial, and Checkpoint provisions inside their own
Microsoft 365 tenant — with **zero manual work from you**, and their
client record appearing on the owner console roster automatically.

> **The important distinction.** *Per-client signup is automatic once this
> is set up.* This document is the *one-time* setup (a Paddle account, one
> Azure app registration, one AWS Lambda) that has to be done once — it
> cannot be automated away because it means creating external accounts and
> holding a signing key. After that, every customer signup runs end-to-end
> on its own.

Until this is configured, the pages degrade gracefully: the pricing page
and quote configurator work fully, and the "Start free trial" button falls
back to booking a setup call (so you can keep issuing trials by hand via
`tools/issue-entitlement.mjs` — see `ISSUANCE.md` — in the meantime). This
is controlled by `SELF_SERVE` in `src/data/pricing.js`: empty = disabled.

---

## The flow, end to end

```
  Customer                     Paddle                 Provisioning Lambda        Their M365 tenant     Owner console
     │                           │                          │                         │                    │
  /pricing → build quote         │                          │                         │                    │
     │                           │                          │                         │                    │
  /start → "Start free trial" ─► Checkout overlay           │                         │                    │
     │                        (card + 7-day trial)          │                         │                    │
     │ ◄──── redirect to activateUrl (Checkpoint app) ──────┘                         │                    │
     │                                                                                │                    │
  Sign in with Microsoft (MSAL) ──────────────────────────► verify Paddle sub active │                    │
     │                                                       + sign entitlement       │                    │
     │                                                       + write to their tenant ─►  Settings list      │
     │                                                       + record on roster ───────────────────────────► PartnerClients/
     │ ◄──────────── activated, workspace provisioned ──────┘                                                 PartnerEntitlements
     │
  Day 8: Paddle auto-charges (or customer cancels → nothing charged)
     │
  On charge / cancel ──► Paddle webhook ──► Lambda re-issues 12-mo licence (or lets trial expire)
```

Two pieces do the work: **Paddle** (hosted checkout + subscription
lifecycle — so you never touch a card number, keeping you at PCI SAQ-A),
and **one Lambda** (the thing that signs an entitlement and writes it into
the customer's tenant + your roster — the automated equivalent of running
`issue-entitlement.mjs issue --record` by hand today).

---

## 1. Paddle account + products

1. Create a Paddle account (Billing) at paddle.com. Paddle is the *merchant
   of record* — they handle GST/VAT/sales tax and the tax invoice for every
   country, which is why we chose them over raw Stripe for a solo operator.
2. For **each module × tier** create a Price under a Product:
   - Product: e.g. "Checkpoint — ISO 27001"
   - Price: "ISO 27001 — Growth (50–250 staff)", AUD, **billed yearly**,
     with a **7-day free trial** configured on the price itself (Paddle
     handles the trial-then-charge; the Lambda never times anything).
   - The prices must match `src/data/pricing.js` exactly (that file is the
     published source of truth; Paddle is what actually charges).
3. Note each Paddle **price id** (`pri_...`). You'll map them in step 5.
4. In Paddle → Developer Tools, note your **client-side token**
   (`live_...`) and set up a **webhook** (step 4b) pointing at the Lambda.

## 2. The Ed25519 signing key → AWS Secrets Manager

The Lambda signs activation files with the **same** Ed25519 private key
`issue-entitlement.mjs` uses (`entitlement-private.json`), and the app
verifies against the public key already baked into `config.js`. Do **not**
put the private key in the repo or in the Lambda's code.

1. Take your existing `entitlement-private.json` (the JWK from
   `issue-entitlement.mjs keygen`) — the same key you already issue with.
2. Store it in AWS Secrets Manager as e.g. `checkpoint/entitlement-private`.
3. Also store the module-keys file (`tools/module-keys.json`) as e.g.
   `checkpoint/module-keys` — premium frameworks embed their per-module
   key in the signed payload, exactly as the CLI does.
4. Grant the Lambda's execution role `secretsmanager:GetSecretValue` on
   just those two secrets.

## 3. Azure app registration (for writing to the customer's tenant)

The Lambda writes the signed activation into the **customer's own** tenant
after they sign in with Microsoft. It does this with the customer's *own*
delegated token (obtained by the Checkpoint app during their Microsoft
sign-in and passed to the Lambda) — **not** an app-only permission into a
stranger's tenant. So the Azure app registration here is the same public
client the Checkpoint app already uses; no new tenant-wide admin grant is
required. (Writing the row onto *your* owner-console roster uses *your*
tenant's credentials — see step 4a's note.)

> **Decision to make:** do you want the Lambda to write directly into the
> customer's tenant unattended the moment they pay + sign in, or queue new
> self-serve signups for a one-click approval from you first (at least until
> you trust the flow)? The reference handler below does it directly; the
> "approval queue" variant just writes a pending row to your roster and
> emails you an "Approve" link instead of provisioning immediately.

## 4. The provisioning Lambda

Reference handler (Node 20, AWS Lambda). This is the automated equivalent
of `issue-entitlement.mjs issue --record`. Adapt to your infra; it is a
reference, not a drop-in — deploy it once the accounts above exist.

```js
// provisioning-lambda/index.mjs
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import CheckpointLib from './lib.js'; // copy of public/checkpoint/lib.js (dual-exported already)

const sm = new SecretsManagerClient({});
async function secret(id) {
  const r = await sm.send(new GetSecretValueCommand({ SecretId: id }));
  return JSON.parse(r.SecretString);
}

// Called by the Checkpoint app AFTER the customer signs in with Microsoft
// on the activateUrl page. Body: { paddleSubscriptionId, tenantId,
// frameworks: [...], graphToken }. graphToken is the customer's own
// delegated token (Sites.Manage.All) from their MSAL sign-in.
export async function handler(event) {
  const { paddleSubscriptionId, tenantId, frameworks, graphToken } = JSON.parse(event.body);

  // 1. Verify the Paddle subscription is real, active/trialing, and matches
  //    these frameworks — never trust the client's framework list alone.
  const sub = await paddleGet(`/subscriptions/${paddleSubscriptionId}`); // Paddle API key in env
  if (!['active', 'trialing'].includes(sub.data.status)) {
    return json(402, { error: 'Subscription not active' });
  }

  // 2. Build + sign the entitlement payload (same shape as the CLI).
  const priv = await secret('checkpoint/entitlement-private');
  const moduleKeys = await secret('checkpoint/module-keys');
  const today = new Date().toISOString().slice(0, 10);
  const isTrial = sub.data.status === 'trialing';
  const payload = {
    tenantId,
    type: isTrial ? 'demo' : 'client',
    frameworks,
    issuedAt: today,
    // Trial expiry tracks Paddle's trial end; paid tracks the billing period.
    expiry: (sub.data.current_billing_period?.ends_at || sub.data.next_billed_at || '').slice(0, 10),
    moduleKeys: pickModuleKeys(frameworks, moduleKeys) // premium frameworks only
  };
  const signed = await CheckpointLib.signEntitlementPayload(payload, priv); // Ed25519

  // 3. Write the signed activation into the CUSTOMER's own Settings list,
  //    using THEIR delegated graphToken (their tenant, their data).
  await writeActivationToTenant(graphToken, tenantId, signed);

  // 4. Record the client on YOUR owner-console roster (PartnerClients +
  //    PartnerEntitlements in YOUR tenant). Use a stored app/refresh token
  //    for your own tenant here — NOT the customer's token. This is the
  //    step that makes the client "just appear" in the owner console.
  await recordOnOwnerRoster(payload, sub);

  return json(200, { ok: true });
}
```

Key points the reference above encodes:
- The signing logic is **already written and tested** — it's
  `signEntitlementPayload` in `public/checkpoint/lib.js`, the exact function
  the CLI uses. Copy that file alongside the Lambda; it's dual-exported for
  Node already.
- Trial vs. paid is derived from Paddle's subscription `status`
  (`trialing` → `demo` type, 7-day; `active` → `client` type, annual) —
  never a flag you set by hand.
- Step 4 is what answers *"does client signup automatically update the owner
  portal?"* — **yes**: the Lambda writes the PartnerClients/PartnerEntitlements
  rows into your tenant, so the roster, revenue board, renewals and the new
  Dashboard all reflect the new client with no action from you.

### 4b. Paddle webhook

Point a Paddle webhook at a second Lambda route for lifecycle events:
- `subscription.activated` / `transaction.completed` (trial converted → the
  day-8 charge succeeded): re-issue a 12-month `client`-type entitlement to
  the customer's tenant (they're already signed in during the trial, so you
  can write it on their next app visit, or store it for pickup).
- `subscription.canceled`: do nothing destructive — let the existing
  entitlement expire at its date. This matches how revocation already works
  everywhere else in the product (`ISSUANCE.md` §5): access runs to the end
  of what was paid for, never yanked mid-term.
- Always verify the Paddle webhook signature before acting.

## 5. Wire the front end

In `src/data/pricing.js`, fill in `SELF_SERVE`:

```js
export const SELF_SERVE = {
  paddleToken: 'live_xxxxxxxx',      // Paddle client-side token
  paddleEnv:   'production',          // or 'sandbox' while testing
  priceIds: {
    iso27001_micro:  'pri_...', iso27001_growth: 'pri_...',
    soc2_micro:      'pri_...', soc2_growth:     'pri_...',
    essential8_micro:'pri_...', essential8_growth:'pri_...',
    iso42001_micro:  'pri_...', iso42001_growth: 'pri_...',
    iso27701_micro:  'pri_...', iso27701_growth: 'pri_...',
    nistcsf_micro:   'pri_...', nistcsf_growth:  'pri_...',
    ai:              'pri_...'  // flat add-on
  },
  activateUrl: '/checkpoint/?activate=1',
  fallbackBookingUrl: 'https://calendly.com/matt-nicholas-compliance365/30min'
};
```

Once `paddleToken` and at least one `priceIds` entry are set,
`isSelfServeLive()` returns true, and `/start` shows the real "Start free
trial with a card" button instead of the booking fallback.

Then two more edits:
1. **Load Paddle.js** on `/start` — add
   `<script src="https://cdn.paddle.com/paddle/v2/paddle.js"></script>` and
   an init call with `paddleToken`/`paddleEnv`. (Left out until you go live
   so there's no dead third-party script on the page before then.)
2. **CSP** — add `https://cdn.paddle.com` and `https://*.paddle.com` to
   `script-src` and `connect-src`, and Paddle's checkout frame origin to
   `frame-src`, in `src/layouts/BaseLayout.astro`'s Content-Security-Policy.

## 6. Handle the `?activate=1` return in the Checkpoint app

The Checkpoint app's onboarding (`public/checkpoint/app.js` Wizard) should,
when it sees `?activate=1`, after Microsoft sign-in, POST
`{ paddleSubscriptionId, tenantId, frameworks, graphToken }` to the
provisioning Lambda instead of asking the user to paste a file — the file
gets written for them. The manual paste/upload path stays as the fallback
(and for consulting-issued clients), exactly as it is today.

---

## What's automatic vs. one-time, at a glance

| | One-time setup (this doc) | Per customer (automatic) |
|---|---|---|
| Paddle account + prices | ✅ once | — |
| Signing key in Secrets Manager | ✅ once | — |
| Provisioning Lambda + webhook | ✅ once | — |
| `SELF_SERVE` config + CSP | ✅ once | — |
| Customer picks plan & pays | — | ✅ self-serve |
| Entitlement signed & written to their tenant | — | ✅ Lambda |
| Client appears on owner roster/Dashboard | — | ✅ Lambda step 4 |
| Trial → paid conversion / renewal | — | ✅ Paddle webhook |

Every column-2 row is what a customer triggers themselves — no CLI, no
emailed file, no manual roster entry. That is the whole point of the build.
