# Self-serve trials & checkout — setup guide

This is the one-time infrastructure setup that turns the `/pricing` and
`/start` pages from "book a call to activate" into a fully automatic
self-serve flow: a customer picks their frameworks, pays with a card,
starts a 7-day free trial, and Checkpoint provisions inside their own
Microsoft 365 tenant — with **zero manual work from you**, and their
client record appearing on the owner console roster automatically.

**Current status:** Paddle sandbox account created, all 6 self-serve
framework products/prices created (ISO 27001, ISO 27701, ISO 42001,
SOC 2, Essential Eight, NIST CSF × Micro/Growth), sandbox token wired into
`src/data/pricing.js`, checkout verified end-to-end against a stubbed
Paddle.js. The provisioning Lambda (`lambda/provision.js`) is written and
its signing logic verified to produce byte-identical signatures to
`app.js`'s own verifier — but it hasn't been deployed or exercised against
a real Paddle sandbox call yet (see `lambda/DEPLOY-PROVISION.md` step 8).
Still to do: the AI assistant add-on price, deploying the Lambda, and the
Azure app registration it needs.

Until the Lambda is deployed and `config.js`'s `selfServeActivateUrl` is
set, the pages degrade gracefully: `/pricing` and `/start` work fully
(browse prices, build a quote, real Paddle checkout even starts), but the
Checkpoint app just shows the normal manual-activation wizard step instead
of auto-filling it — so it's safe to have shipped ahead of the Lambda.

---

## The flow, end to end (as actually built)

```
  Customer                Paddle              Provisioning Lambda         Checkpoint app          Owner console
     │                      │                        │                    (customer's browser)          │
  /pricing → build quote    │                        │                          │                        │
     │                      │                        │                          │                        │
  /start → "Start free      │                        │                          │                        │
   trial with a card" ────► Checkout overlay          │                          │                        │
     │                   (card + 7-day trial)         │                          │                        │
     │ ◄──── redirect: /checkpoint/?activate=1&_ptxn=txn_... ────────────────────┘                        │
     │                                                                            │                        │
     │                                          Sign in with Microsoft (MSAL) ────┤                        │
     │                                                                            │                        │
     │                          POST {transactionId, tenantId} ──────────────────►│  (attemptSelfServeActivation)
     │                      ◄── verify subscription is active/trialing ───────────┤                        │
     │                          + sign entitlement (same Ed25519 key as the CLI)  │                        │
     │                          + record on OUR OWN roster ─────────────────────────────────────────────► PartnerClients/
     │                      ◄── { activationFile: "..." } ─────────────────────── │                        PartnerEntitlements
     │                                                                            │
     │                                          runWizardActivationCheck()        │
     │                                          — the SAME verify+apply path      │
     │                                          a manually-pasted file goes       │
     │                                          through. Writes into THIS        │
     │                                          tenant's own SharePoint using     │
     │                                          the customer's own delegated      │
     │                                          Graph token — never the Lambda.  │
     │                                                                            │
  Day 8: Paddle auto-charges (or customer cancels → nothing charged)
     │
  [Not yet built] Paddle webhook → re-confirm/re-issue on renewal, or let a cancelled trial lapse naturally.
```

**The key design decision, and why:** the Lambda never touches the
customer's SharePoint directly, and never receives their Graph token. It
only talks to (a) Paddle, to find out authoritatively what was actually
purchased, and (b) *our own* tenant, to record the new client on the
roster. The signed activation file it returns gets applied by the
Checkpoint app itself, through `runWizardActivationCheck()` — the exact
same code path a manually pasted file already goes through, with all its
existing list-provisioning/column-widening logic already built and
tested. This avoids a second, unaudited "write to SharePoint" 
implementation living in the Lambda.

---

## 1. Paddle (done)

All 6 framework products/prices exist in sandbox, each AUD/yearly with a
7-day trial. Still needed: a Price for the AI assistant add-on (see
`src/pages/pricing.astro` — new product, not a variant of an existing
one, since it's cross-cutting rather than tied to one framework).

`src/data/pricing.js`'s `SELF_SERVE.priceIds` is the published mapping —
keep it and the Lambda's `PRICE_TO_MODULE` (in `lambda/provision.js`) in
sync by hand whenever a price changes; they're deliberately duplicated
rather than shared, since the Lambda ships as a single pasteable file
with no build step (see that file's header comment for why).

## 2. The Ed25519 signing key + module keys (env vars, not Secrets Manager)

Following this project's existing Lambda convention (`lambda/chat.js`'s
`ANTHROPIC_API_KEY`), the private key and module keys are Lambda
**environment variables**, not AWS Secrets Manager — simpler to set up for
a solo operator, same trust boundary (only you can read Lambda env vars
in your own AWS account), no extra IAM policy to get right.

- `ENTITLEMENT_PRIVATE_KEY_JWK` — the exact contents of
  `entitlement-private.json`.
- `MODULE_KEYS_JSON` — the exact contents of `tools/module-keys.json`.

Full steps: `lambda/DEPLOY-PROVISION.md`.

## 3. Azure app registration (writes to OUR OWN roster only)

A **separate** app registration from the Checkpoint app's own client id —
this one is app-only (client-credentials), because the Lambda runs
unattended and never has a signed-in user. It needs an Application-level
`Sites.Selected` (recommended, least-privilege) or `Sites.ReadWrite.All`
Graph permission on **our own** tenant only. Full steps in
`lambda/DEPLOY-PROVISION.md` §4.

This is unrelated to, and much narrower than, the customer-tenant
question I originally raised here ("should the Lambda write into a
stranger's tenant unattended?") — that question no longer applies, since
the Lambda never touches a customer's tenant at all. The only "write
unattended" step left is onto our own roster, which is exactly what
`issue-entitlement.mjs --record` already does today, just automated.

## 4. The provisioning Lambda

Written: `lambda/provision.js`. Verified independently of any live Paddle
call: its `canonicalJson`/`signEntitlementPayload` copy produces
byte-identical Ed25519 signatures to `public/checkpoint/lib.js`'s own
version, confirmed by generating a throwaway keypair and signing the same
fixture payload both ways — `app.js`'s `verifyEntitlementSignature()`
accepted the Lambda-produced signature. That was the one piece that
absolutely had to match; everything else is ordinary REST calls.

**Not yet verified against a real Paddle sandbox call**: the exact shape
of Paddle's `/subscriptions/{id}` response (`current_billing_period`,
`next_billed_at`, `items[].price.id`, `status` values) — written from
Paddle's documented API, but Paddle has changed response shapes before
and this hasn't been exercised live. `resolvePurchase()` in the Lambda
has a comment flagging this; check it against a real response during
sandbox testing (`lambda/DEPLOY-PROVISION.md` step 8) before relying on
it for a real charge.

### Subscription lifecycle — the webhook + the app-pull (built)

The parts that happen *after* the initial signup — a trial converting to a
paid 12-month licence on the day-8 charge, and cancellations — are handled
by two complementary pieces, because neither the provisioning Lambda nor
the webhook can push into a customer's tenant:

- **The app-pull** (built into `public/checkpoint/app.js`,
  `refreshSelfServeEntitlementOnLoad`): the customer's own Checkpoint app
  re-pulls a fresh signed file from the provisioning Lambda on load, using
  EVERY Paddle subscription id it's ever stored for this tenant — not just
  the first. `/start`'s checkout is an anonymous Paddle overlay with no way
  to attach a purchase to an existing subscription, so a customer buying a
  second module in a later, separate checkout gets a brand new subscription
  id rather than a line item added to the first; the app tracks the full
  list (`readPaddleSubs()`/`addPaddleSubLocal()`) and the Lambda resolves
  and merges all of them (`mergeResolvedSubscriptions()` — union of
  frameworks, latest expiry, 'client' if any subscription is active) into
  one signed file, so an earlier purchase is never silently dropped by a
  later one. This is what actually keeps the *customer's* access current —
  trialing→7-day demo, active→12-month client, cancelled→that one
  subscription's frameworks quietly drop out of the merge (the others keep
  refreshing normally) and the previously-granted access for it lapses at
  its own expiry (never yanked mid-term, matching `ISSUANCE.md` §5).
  Strictly best-effort: it can only ever replace the stored file with a
  newer validly-signed one for the same tenant, never lock a tenant out.
  Requires no deployment — it ships with the app.

- **The webhook** (`lambda/webhook.js`, deploy per `DEPLOY-WEBHOOK.md`):
  keeps the *owner roster* in sync in near-real-time (Trial→Active→Churned,
  PaddleStatus, expiry), so you see conversions and cancellations on the
  Dashboard without waiting for the customer to next open the app. It maps
  each event to a tenant via the `SubscriptionId` column the provisioning
  Lambda now writes on the entitlement row. Verifies Paddle's signature on
  every request (rejects forgeries with 403). Deploy this once; it's the
  only remaining piece of infrastructure.

### Owner-initiated access revocation (built)

Cancelling a client's subscription in Paddle stops the *next* renewal, but
by design still honours whatever's already been paid for (never yanked
mid-term, `ISSUANCE.md` §5) — the right behaviour for an ordinary
cancellation, not for fraud/abuse/non-payment-for-cause, where you want
access gone *now*. There was no way to do that at all before this: the
owner console's `ManualStatus` field is a renewal-pipeline label, not an
access control, and a manually-issued (non-self-serve) client had no
revocation path whatsoever short of getting into their tenant and
overwriting the file yourself.

- **Owner console**: a client's detail drawer has a **Revoke access**
  button (asks for a reason, kept on your own roster only — never shown
  to the client) and, once revoked, a **Restore access** button in its
  place. Writes `Blocked`/`BlockedAt`/`BlockedReason` on that client's
  `PartnerClients` row — self-heals onto an existing owner console via
  `PARTNER_COLUMN_RECONCILE`, no re-provisioning needed.
- **The provisioning Lambda** (`lambda/provision.js`) handles a second,
  unrelated request shape from the same endpoint —
  `{ checkRevocation: true, tenantId }` — that just reads that flag back
  (`checkTenantBlocked()`), no Paddle call, no signing.
- **The Checkpoint app**: every live tenant (self-serve *and*
  manually-issued — this is the only revocation path the latter has at
  all) calls this on load, at every point that can reach the live app
  (`startLive()`, `retryActivationFromGate()`, `Wizard.finish()` —
  `checkAccessRevoked()`'s doc comment explains why there are three call
  sites, not one), and shows a distinct "access revoked" screen instead
  of the app if blocked — deliberately independent of whatever the
  signed activation file itself says, since a revoked tenant might still
  be holding a perfectly-valid, unexpired one. Fails **open** on any
  network error or when self-serve isn't configured — a Lambda hiccup
  must never brick a paying customer's access; only an explicit
  `blocked:true` response ever gates anything.

Deployment: this reuses the *same* provisioning Lambda the multi-subscription
merge fix already needs redeployed — one deployment covers both.

### Owner notification on new signup (built, opt-in)

Nothing told you a stranger had just paid and signed up — you'd only find
out by checking the Dashboard yourself. The provisioning Lambda now sends
itself (well, you) an email the moment a **fresh** self-serve checkout
completes and activates, so you hear about it in real time instead of
finding it later.

- **Only fires on a genuine fresh checkout** (`transactionId` present) —
  never on the routine on-load refresh every live self-serve tenant
  triggers on every page load, and never on a revocation check. Getting
  this gate wrong would turn every customer opening the app into an
  email; there's a static-text test guarding it
  (`test/provision-merge.test.mjs`).
- **Opt-in, zero setup by default**: controlled by one new Lambda env var,
  `OWNER_NOTIFY_EMAIL` — unset (the default) means the feature does
  nothing at all, no behaviour change. Set it to a real mailbox in your
  own tenant (e.g. `hello@compliance365.com.au`) to turn it on.
- **Best-effort, never blocks the customer**: the send is wrapped in its
  own try/catch — if it fails (bad mailbox, missing permission,
  transient Graph error) the customer's own activation still succeeds;
  you just don't get the email that time.
- **Reuses the same app registration** as the roster-writing permission
  in §3 above — no new app, no new secret. It needs one additional
  Application-level Graph permission granted, with admin consent:

  1. Azure Portal → **App registrations** → the same app used for the
     owner-roster `Sites.Selected`/`Sites.ReadWrite.All` permission → **API
     permissions** → **Add a permission** → **Microsoft Graph** →
     **Application permissions** → search for and add **`Mail.Send`**.
  2. Click **Grant admin consent for [your tenant]** — this permission
     lets the app send mail as *any* mailbox in the tenant, which is why
     it needs its own explicit consent even though the app already has
     other Graph permissions.
  3. Redeploy `lambda/provision.js` (this is the same file the
     multi-subscription merge and revocation fixes already need
     redeployed — one deployment covers all three) and set
     `OWNER_NOTIFY_EMAIL` on the Lambda's environment variables.

  The mailbox in `OWNER_NOTIFY_EMAIL` is used as both the sender and the
  recipient — Graph's app-only `/users/{mailbox}/sendMail` sends *as*
  that mailbox, so the simplest setup points it at your own inbox and it
  emails itself.

## 5. Front end (done)

- `src/data/pricing.js`'s `SELF_SERVE.paddleToken`/`priceIds` are set —
  `/start` shows a real Paddle checkout for any fully-priced selection,
  and safely falls back to "book a call" for anything not yet priced
  (verified: a selection mixing a priced module with the still-unpriced
  AI add-on correctly falls back rather than silently checking out
  without it).
- Paddle.js is loaded (and CSP-allowlisted) on `/start`, gated on
  `isSelfServeLive()`.
- `public/checkpoint/config.js`'s `selfServeActivateUrl` is the one field
  left empty — set it once the Lambda is deployed (step 7 in
  `lambda/DEPLOY-PROVISION.md`), and `app.js`'s
  `attemptSelfServeActivation()` starts running for real.

## 6. The `?activate=1` return (done)

`public/checkpoint/app.js`'s `afterSignIn()` now checks for
`selfServeActivateUrl` configured + `?activate=1` in the URL, and if so
calls `attemptSelfServeActivation()` — which reads Paddle's `_ptxn` query
param, POSTs `{transactionId, tenantId}` to the Lambda, and feeds the
returned signed file into `runWizardActivationCheck()`. Anyone arriving
without that query param (every existing manual/consulting-issued client)
is completely unaffected — falls through to `Wizard.startAt(3)` exactly
as before.

---

## What's automatic vs. one-time, at a glance

| | One-time setup | Per customer (automatic) |
|---|---|---|
| Paddle account + prices (incl. AI add-on) | ✅ done | — |
| Signing key + module keys as Lambda env vars | ✅ done | — |
| Azure app registration (owner roster only) | ✅ done | — |
| Provisioning Lambda deployed | ✅ done, verified live | — |
| Paddle webhook Lambda deployed | ⬜ deploy per `DEPLOY-WEBHOOK.md` | — |
| Customer picks plan & pays | — | ✅ verified live |
| Entitlement signed | — | ✅ verified (valid against prod public key) |
| Written into their own tenant | — | ✅ app.js, reusing existing wizard logic |
| Client appears on owner roster/Dashboard | — | ✅ verified live |
| Trial → paid conversion (customer access) | — | ✅ app-pull on load |
| Trial → paid / cancelled (owner roster) | — | ✅ webhook (once deployed) |
| `Mail.Send` permission grant + `OWNER_NOTIFY_EMAIL` env var | ⬜ optional, see §3 | — |
| Owner notified of new signup | — | ✅ once opted in above |

Every column-2 checked row is what a customer triggers themselves — no
CLI, no emailed file, no manual roster entry. That is the whole point of
the build.
