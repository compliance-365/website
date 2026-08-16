/**
 * Compliance365 — Self-serve trial/subscription provisioning Lambda
 *
 * Called once, right after a customer signs in with Microsoft on
 * /checkpoint/?activate=1 (see public/checkpoint/app.js's
 * attemptSelfServeActivation()), immediately after completing a Paddle
 * checkout on /start. Its ONLY job is:
 *
 *   1. Confirm with Paddle (server-side, authoritative) what was
 *      actually purchased — never trust anything the browser claims
 *      about frameworks/tier, since that's tamperable query-string data.
 *   2. Build and Ed25519-sign the exact same activation payload shape
 *      tools/issue-entitlement.mjs produces by hand today.
 *   3. Record the new client on OUR OWN owner-console roster
 *      (PartnerClients + PartnerEntitlements — the same lists the
 *      Partner Console reads), so it "just appears" there.
 *   4. Return the signed file to the browser as JSON text.
 *
 * A second, unrelated request shape ({ checkRevocation: true, tenantId })
 * is also handled here — every LIVE Checkpoint tenant (not just self-serve
 * ones) calls this on load to check whether the owner console has flagged
 * it Blocked, independent of whatever activation file it's already
 * holding. See checkTenantBlocked() below and app.js's
 * checkAccessRevoked(). Kept in this same Lambda rather than a separate
 * one purely to avoid a second deployment — it shares nothing with the
 * purchase flow except the owner-tenant Graph token helpers.
 *
 * It deliberately does NOT write anything into the customer's own
 * SharePoint. The browser already has everything needed to do that
 * itself — the exact same runWizardActivationCheck() code path a
 * manually-pasted file goes through (list provisioning, column
 * widening, etc. all already built and tested there) — so this Lambda
 * never needs a Graph token for the customer's tenant at all, and never
 * duplicates that provisioning logic. See SELF-SERVE-SETUP.md for the
 * full flow and one-time setup.
 *
 * Deploy steps:
 *   1. Create a new Lambda function (Node.js 20.x runtime)
 *   2. Paste this file as index.mjs (or zip and upload)
 *   3. Set the environment variables listed below
 *   4. Add an API Gateway HTTP trigger: POST /provision
 *   5. Enable CORS: Allow-Origin https://www.compliance365.com.au,
 *      Allow-Methods POST/OPTIONS, Allow-Headers Content-Type
 *   6. Copy the invoke URL into public/checkpoint/config.js's
 *      selfServeActivateUrl, and into src/data/pricing.js's
 *      SELF_SERVE.activateUrl's origin if it ever changes from
 *      /checkpoint/ on the same domain.
 *
 * See lambda/DEPLOY-PROVISION.md for the full walkthrough including the
 * one-time Azure app registration this needs to write to OUR OWN roster.
 *
 * Environment variables required:
 *   PADDLE_API_KEY          Paddle API key (Developer Tools → Authentication
 *                            → API keys) — server-side secret, never the
 *                            client-side token used in the browser.
 *   PADDLE_ENV               'sandbox' or 'production' — picks which Paddle
 *                            API host to call.
 *   ENTITLEMENT_PRIVATE_KEY_JWK
 *                            The exact JSON contents of entitlement-private.json
 *                            (tools/issue-entitlement.mjs keygen's output),
 *                            as a single-line JSON string.
 *   MODULE_KEYS_JSON          The exact JSON contents of tools/module-keys.json,
 *                            as a single-line JSON string. Premium frameworks
 *                            (everything except iso27001) embed their key
 *                            from here in the signed payload, same as the CLI.
 *   OWNER_TENANT_ID           Compliance365's own Entra tenant id (or verified
 *                            domain) — where the roster lives.
 *   OWNER_APP_CLIENT_ID       App registration (client-credentials / app-only)
 *                            used ONLY to write to OUR OWN roster.
 *   OWNER_APP_CLIENT_SECRET   That app registration's client secret.
 *
 * Optional:
 *   OWNER_NOTIFY_EMAIL        A real mailbox in the owner tenant (e.g.
 *                            hello@compliance365.com.au). When set, an
 *                            email is sent to (and from) this address the
 *                            moment a FRESH self-serve checkout completes
 *                            and activates — not on every routine refresh.
 *                            Unset = feature is off, no behaviour change.
 *                            Needs one more permission on the SAME app
 *                            registration: Mail.Send (Application),
 *                            admin-consented — see SELF-SERVE-SETUP.md.
 *
 * Dependencies: none — uses the native fetch + crypto.webcrypto available
 * in Node 20, same "no dependencies" convention as chat.js/subscribe.js.
 */

import { webcrypto } from 'node:crypto';

/* Reverse of src/data/pricing.js's SELF_SERVE.priceIds — MUST be kept in
   sync by hand whenever a price is added/changed/removed there. This
   duplication (rather than importing pricing.js directly) is deliberate:
   this Lambda ships as a single pasteable file with zero build step,
   same as chat.js/subscribe.js, and pricing.js is an Astro-project ES
   module that assumes a bundler. */
const PRICE_TO_MODULE = {
  'pri_01kyvv172apb8wfj72y06vh8gh': { moduleId: 'iso27001', tier: 'micro' },
  'pri_01kyvv4ah3nrwpx8bgdhzxqbh3': { moduleId: 'iso27001', tier: 'growth' },
  'pri_01kyvvt4z6xymmk3327byyj60z': { moduleId: 'iso27701', tier: 'micro' },
  'pri_01kyvvvthspye2gcc2k4c8mkrz': { moduleId: 'iso27701', tier: 'growth' },
  'pri_01kyvvngp1t2w23csct3jthk9p': { moduleId: 'iso42001', tier: 'micro' },
  'pri_01kyvvqgapg42pkc7frxd3nqy5': { moduleId: 'iso42001', tier: 'growth' },
  'pri_01kyvvafz0rjmx93fknmh5shqe': { moduleId: 'soc2', tier: 'micro' },
  'pri_01kyvvbwjk49d86sv92paytdrk': { moduleId: 'soc2', tier: 'growth' },
  'pri_01kyvvedm0at83vabz57dax7q4': { moduleId: 'essential8', tier: 'micro' },
  'pri_01kyvvjpbzmm31ypek8gxgcw0s': { moduleId: 'essential8', tier: 'growth' },
  'pri_01kyvvxxq9bxpacjnav5d3j7ec': { moduleId: 'nistcsf', tier: 'micro' },
  'pri_01kyvvzxfr78bx69grc818jt99': { moduleId: 'nistcsf', tier: 'growth' },
  'pri_01kyvw1edqna8qn220c4rpkafg': { moduleId: 'ai', tier: null }
};

const GRACE_DAYS = 14; // same standard as tools/issue-entitlement.mjs

/* Exact copy of public/checkpoint/lib.js's isValidTenantIdentifier() —
   same single-file-Lambda copy-not-import reason as canonicalJson()
   below. Accepts either a real Entra tenant GUID or a verified-domain
   string; rejects free-text junk. This does NOT verify the caller
   actually controls the tenant named — Paddle proves a real purchase
   happened, not who it belongs to, and there is currently no
   server-side proof binding the two together (tracked separately) — it
   only stops obviously-malformed values from being signed and written
   into the owner's own roster. */
export function isValidTenantIdentifier(s) {
  if (!s) return false;
  const v = String(s).trim();
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)) return true;
  return /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/i.test(v);
}

/* Same sliding-window per-IP limiter as chat.js/explain.js — see those
   files' own comments on its limits (resets per cold start, per-
   container under concurrency, so this is a blunt-abuse deterrent, not
   a hard cap; the real backstop is an API Gateway throttle configured
   in the AWS console, same as those two). Two separate buckets, not
   one: `provision` is the expensive path (a Paddle API call plus an
   Ed25519 sign plus several Graph writes to the owner's own roster) and
   should stay tight; `revocation` is called by EVERY live tenant on
   EVERY page load (see checkTenantBlocked()'s own comment) and a normal
   user with several tabs open, or a flaky connection retrying, must
   never be mistaken for abuse. */
const RATE_WINDOW_MS = 60_000;
const RATE_MAX_PROVISION = 10;
const RATE_MAX_REVOCATION = 60;
const rateBuckets = { provision: new Map(), revocation: new Map() };
function rateLimited(kind, ip) {
  const bucket = rateBuckets[kind];
  const max = kind === 'provision' ? RATE_MAX_PROVISION : RATE_MAX_REVOCATION;
  const now = Date.now();
  const hits = (bucket.get(ip) || []).filter((t) => now - t < RATE_WINDOW_MS);
  if (hits.length >= max) { bucket.set(ip, hits); return true; }
  hits.push(now);
  bucket.set(ip, hits);
  if (bucket.size > 5000) bucket.clear(); // cap memory on hot containers
  return false;
}

/* ============== canonicalJson / Ed25519 signing ==============
   Exact copies of public/checkpoint/lib.js's canonicalJson(),
   base64ToBytes/bytesToBase64 and signEntitlementPayload() — signing
   and verifying MUST serialise identical bytes for the same payload, or
   every signature this Lambda produces would fail app.js's own
   verifyEntitlementSignature(). Copied rather than imported for the
   same single-file-Lambda reason as PRICE_TO_MODULE above; keep in sync
   if lib.js's versions ever change (they haven't needed to since this
   was written — this is float/whitespace-free deterministic JSON over
   a fixed, simple shape, not a general-purpose serialiser). */
function canonicalJson(v) {
  if (Array.isArray(v)) return '[' + v.map(canonicalJson).join(',') + ']';
  if (v && typeof v === 'object') {
    return '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + canonicalJson(v[k])).join(',') + '}';
  }
  return JSON.stringify(v);
}
function bytesToBase64(bytes) { return Buffer.from(bytes).toString('base64'); }
async function signEntitlementPayload(privateKey, payload) {
  const data = new TextEncoder().encode(canonicalJson(payload));
  const sig = await webcrypto.subtle.sign('Ed25519', privateKey, data);
  return bytesToBase64(new Uint8Array(sig));
}

/* ============== Paddle ============== */
function paddleBase() {
  return process.env.PADDLE_ENV === 'production' ? 'https://api.paddle.com' : 'https://sandbox-api.paddle.com';
}
async function paddleFetch(path) {
  const res = await fetch(paddleBase() + path, {
    headers: { Authorization: 'Bearer ' + process.env.PADDLE_API_KEY }
  });
  if (!res.ok) throw new Error('Paddle ' + res.status + ': ' + (await res.text()));
  return res.json();
}

/* Reads a Paddle subscription and derives the authoritative
   frameworks/tier/expiry/type — NEVER from anything the browser sent.
   `status` of 'trialing' or 'active' are both grantable (a customer
   mid-trial is meant to have access); anything else (paused/canceled/
   past_due) is refused. Verified against a real Paddle sandbox response:
   status→type (trialing=demo, active=client), items[].price.id→module,
   and the trialing/active billing-period fields for expiry all parse
   correctly. */
async function resolveSubscription(subscriptionId) {
  const sub = await paddleFetch('/subscriptions/' + encodeURIComponent(subscriptionId));
  const s = sub.data;
  if (!s || !['trialing', 'active'].includes(s.status)) {
    throw new Error('Subscription status is "' + (s && s.status) + '" — not currently entitled.');
  }

  const items = Array.isArray(s.items) ? s.items : [];
  const mapped = items
    .map((it) => PRICE_TO_MODULE[it.price && it.price.id])
    .filter(Boolean);
  if (!mapped.length) {
    throw new Error('None of this subscription\'s prices are in PRICE_TO_MODULE — is it out of sync with pricing.js?');
  }
  const frameworks = Array.from(new Set(mapped.map((m) => m.moduleId)));

  const type = s.status === 'trialing' ? 'demo' : 'client';
  const expirySource = s.status === 'trialing'
    ? (s.next_billed_at || (s.current_billing_period && s.current_billing_period.ends_at))
    : (s.current_billing_period && s.current_billing_period.ends_at);
  const expiry = (expirySource || '').slice(0, 10);
  if (!expiry) throw new Error('Could not determine an expiry date from the subscription.');

  return { subscriptionId, status: s.status, frameworks, type, expiry, customerEmail: (s.customer && s.customer.email) || '' };
}

/* Returns just the subscription id behind a checkout transaction id —
   the entry point for a fresh checkout. Deliberately doesn't resolve it
   any further itself: the caller merges this id with whatever
   subscriptions the tenant already had (a customer buying a second
   module later gets a NEW, separate Paddle subscription — /start's
   anonymous overlay checkout has no way to attach a purchase to an
   existing one — so every subscription this tenant has ever completed
   needs resolving together, not just the one just bought). */
async function subscriptionIdFromTransaction(transactionId) {
  const txn = await paddleFetch('/transactions/' + encodeURIComponent(transactionId));
  const subscriptionId = txn.data && txn.data.subscription_id;
  if (!subscriptionId) throw new Error('Transaction has no subscription — not a subscription checkout?');
  return subscriptionId;
}

/* Pure merge over already-resolved subscriptions — no Paddle/network
   dependency, so this is the one piece of this Lambda's logic that's
   actually unit-testable (see test/provision-merge.test.mjs). Takes the
   union of every resolved subscription's frameworks (a customer's total
   access is everything any of their subscriptions currently grants, not
   just the most recent one), the LATEST expiry among them (access
   should run to whichever subscription still has the most runway, not
   the earliest one to lapse), and 'client' if ANY subscription is
   'active' — a customer with one module already converted to paid and
   another still mid-trial should be treated as a paying client
   overall, not knocked back to 'demo'. Returns null for an empty input
   (every id failed to resolve, or none were grantable) so the caller
   can respond with a clear error instead of building a payload with no
   frameworks in it. */
export function mergeResolvedSubscriptions(results) {
  if (!results || !results.length) return null;
  const frameworks = Array.from(new Set(results.reduce((acc, r) => acc.concat(r.frameworks), [])));
  const type = results.some((r) => r.status === 'active') ? 'client' : 'demo';
  const expiry = results.map((r) => r.expiry).sort().slice(-1)[0];
  const customerEmail = (results.find((r) => r.customerEmail) || {}).customerEmail || '';
  return { results, subscriptionIds: results.map((r) => r.subscriptionId), frameworks, type, expiry, customerEmail };
}

/* Resolves every subscription id in the list independently against
   Paddle, skipping (not failing on) any that no longer resolve to
   something grantable — deleted, typo'd, or genuinely
   cancelled/paused/past_due, which resolveSubscription() already
   throws on. A customer's OTHER subscriptions are still real and
   should still be honoured even if one has lapsed, so one bad id must
   never take down the whole refresh. */
async function resolveManySubscriptions(subscriptionIds) {
  const results = [];
  for (const id of subscriptionIds) {
    try { results.push(await resolveSubscription(id)); }
    catch (e) { console.error('resolveManySubscriptions: skipping ' + id + ': ' + (e && e.message)); }
  }
  return mergeResolvedSubscriptions(results);
}

/* ============== Entitlement payload ============== */
async function buildSignedActivation(tenantId, purchase) {
  const privJwk = JSON.parse(process.env.ENTITLEMENT_PRIVATE_KEY_JWK);
  const moduleKeysAll = JSON.parse(process.env.MODULE_KEYS_JSON || '{}');
  const privateKey = await webcrypto.subtle.importKey('jwk', privJwk, { name: 'Ed25519' }, false, ['sign']);

  const premiumRequested = purchase.frameworks.filter((f) => f !== 'iso27001');
  const moduleKeys = {};
  premiumRequested.forEach((f) => { if (moduleKeysAll[f]) moduleKeys[f] = moduleKeysAll[f]; });

  const payload = {
    tenantId,
    type: purchase.type,
    frameworks: purchase.frameworks,
    issuedAt: new Date().toISOString().slice(0, 10),
    expiry: purchase.expiry,
    graceDays: GRACE_DAYS,
    moduleKeys
  };
  const signature = await signEntitlementPayload(privateKey, payload);
  return { payload, signature };
}

/* ============== Owner-tenant Graph (app-only, client-credentials) ==============
   Writes to OUR OWN roster only — never the customer's tenant. Requires
   a one-time Azure app registration with an Application (not delegated)
   Sites.Selected or Sites.ReadWrite.All permission, admin-consented, on
   OUR tenant. See SELF-SERVE-SETUP.md §3. */
async function getOwnerGraphToken() {
  const tenant = process.env.OWNER_TENANT_ID;
  const res = await fetch('https://login.microsoftonline.com/' + tenant + '/oauth2/v2.0/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: process.env.OWNER_APP_CLIENT_ID,
      client_secret: process.env.OWNER_APP_CLIENT_SECRET,
      scope: 'https://graph.microsoft.com/.default'
    })
  });
  const tok = await res.json();
  if (!res.ok) throw new Error('Owner Graph auth failed: ' + (tok.error_description || tok.error));
  return tok.access_token;
}
async function ownerGraph(token, path, opts = {}) {
  const res = await fetch('https://graph.microsoft.com/v1.0' + path, {
    method: opts.method || 'GET',
    headers: Object.assign({ Authorization: 'Bearer ' + token }, opts.body ? { 'Content-Type': 'application/json' } : {}),
    body: opts.body ? JSON.stringify(opts.body) : undefined
  });
  if (!res.ok) throw new Error('Graph ' + res.status + ': ' + (await res.text()));
  // 204 (e.g. DELETE, PATCH) and 202 (e.g. /sendMail — accepted for
  // delivery, no response body) both mean success with nothing to
  // parse; res.json() on an empty body throws, so both need this same
  // treatment, not just 204.
  if (res.status === 204 || res.status === 202) return null;
  return res.json();
}

/* Records this issuance on the owner console's own roster.
   - PartnerClients: find-or-create by tenantId; flip Trial→Active when a
     trial converts to paid.
   - PartnerEntitlements: UPSERT by SubscriptionId, one row PER Paddle
     subscription (not one row for the tenant's whole merged access) —
     purchase.results carries every subscription this call resolved, and
     each gets its own row with ITS OWN modules/status/expiry, exactly
     as if each had been issued separately. This is deliberate, not
     merged like the signed activation payload is: lambda/webhook.js's
     subscription-lifecycle handler looks up a roster row by a single
     SubscriptionId from a Paddle event and expects to find exactly the
     row for THAT subscription — collapsing to one merged row per tenant
     would break that lookup the moment a tenant has more than one
     subscription. It also keeps revenue reporting accurate: each
     subscription is its own line of recurring revenue with its own
     billing cycle, so the roster should show them separately even
     though the customer's app sees one combined entitlement. The app
     re-calls this Lambda on load to keep entitlement current (see
     attemptSelfServeActivation / the refresh path), so a blind insert
     would pile up a duplicate row on every visit — keyed on
     SubscriptionId, repeat calls update the one row each subscription
     already has instead. */
async function recordOnOwnerRoster(payload, purchase) {
  const customerEmail = purchase.customerEmail || '';
  const token = await getOwnerGraphToken();
  const site = await ownerGraph(token, '/sites/root?$select=id');

  const lists = await ownerGraph(token, '/sites/' + site.id + '/lists?$select=id,displayName&$top=200');
  const clientsList = lists.value.find((l) => l.displayName === 'Checkpoint Partner PartnerClients');
  const entsList = lists.value.find((l) => l.displayName === 'Checkpoint Partner PartnerEntitlements');
  if (!clientsList || !entsList) {
    throw new Error('Partner lists not found — open the owner console at least once first (it provisions these automatically).');
  }

  const existingClients = await ownerGraph(token, '/sites/' + site.id + '/lists/' + clientsList.id + '/items?$expand=fields&$top=500');
  const existingClient = existingClients.value.find((i) => i.fields.TenantId === payload.tenantId);
  if (!existingClient) {
    await ownerGraph(token, '/sites/' + site.id + '/lists/' + clientsList.id + '/items', {
      method: 'POST',
      body: { fields: { Title: payload.tenantId, ClientName: customerEmail || payload.tenantId, TenantId: payload.tenantId, Status: payload.type === 'demo' ? 'Trial' : 'Active', ContactEmail: customerEmail || '' } }
    });
  } else if (payload.type === 'client' && existingClient.fields.Status !== 'Active') {
    await ownerGraph(token, '/sites/' + site.id + '/lists/' + clientsList.id + '/items/' + existingClient.id + '/fields', {
      method: 'PATCH', body: { Status: 'Active' }
    });
  }

  const existingEnts = await ownerGraph(token, '/sites/' + site.id + '/lists/' + entsList.id + '/items?$expand=fields&$top=500');
  for (const r of purchase.results || []) {
    const entFields = {
      Title: payload.tenantId, TenantId: payload.tenantId, Type: r.status === 'trialing' ? 'demo' : 'client',
      Modules: r.frameworks.join(','), IssuedAt: payload.issuedAt, Expiry: r.expiry,
      SubscriptionId: r.subscriptionId, PaddleStatus: r.status
    };
    const existingEnt = existingEnts.value.find((i) => i.fields.SubscriptionId === r.subscriptionId);
    if (existingEnt) {
      await ownerGraph(token, '/sites/' + site.id + '/lists/' + entsList.id + '/items/' + existingEnt.id + '/fields', {
        method: 'PATCH', body: entFields
      });
    } else {
      await ownerGraph(token, '/sites/' + site.id + '/lists/' + entsList.id + '/items', {
        method: 'POST', body: { fields: entFields }
      });
    }
  }
}

/* Owner-initiated access revocation — reads the Blocked flag the owner
   console's "Revoke access" action sets on PartnerClients, deliberately
   independent of anything Paddle or a signed activation file says. This
   is what the Checkpoint app's checkAccessRevoked() calls on every
   live-tenant load (not just self-serve ones — this is the one path
   that also covers manually-issued/consulting clients, who have no
   other revocation mechanism at all). No PartnerClients row for this
   tenant, or the roster not existing yet, is never treated as blocked —
   only an explicit Blocked=true row counts. */
async function checkTenantBlocked(tenantId) {
  const token = await getOwnerGraphToken();
  const site = await ownerGraph(token, '/sites/root?$select=id');
  const lists = await ownerGraph(token, '/sites/' + site.id + '/lists?$select=id,displayName&$top=200');
  const clientsList = lists.value.find((l) => l.displayName === 'Checkpoint Partner PartnerClients');
  if (!clientsList) return { blocked: false, reason: '' };
  const clients = await ownerGraph(token, '/sites/' + site.id + '/lists/' + clientsList.id + '/items?$expand=fields&$top=500');
  const client = clients.value.find((i) => i.fields.TenantId === tenantId);
  return { blocked: !!(client && client.fields.Blocked), reason: (client && client.fields.BlockedReason) || '' };
}

/* ============== New-signup notification (optional) ============== */
/* Sends the owner an email the moment a fresh self-serve checkout
   completes and successfully activates — the "someone real just signed
   up" moment, not every routine refresh (every OTHER live tenant also
   calls this Lambda, on every page load, to keep its entitlement
   current; only a genuine new transactionId means a checkout just
   happened, see the handler's own comment on that distinction).
   App-only Mail.Send (not the delegated Graph.sendMail the owner
   console's welcome-pack email uses — there's no interactive owner
   session here to delegate from) against the SAME app registration
   already used to write the roster, so the only new setup is one more
   Graph API permission grant — see SELF-SERVE-SETUP.md. Silent no-op
   (not an error) when OWNER_NOTIFY_EMAIL isn't set, so this stays
   entirely opt-in; best-effort and non-blocking either way, same
   trade-off recordOnOwnerRoster() already makes — a notification
   failing must never stop the customer's own activation from being
   handed back. */
async function notifyOwnerOfSignup(payload, purchase) {
  const mailbox = process.env.OWNER_NOTIFY_EMAIL;
  if (!mailbox) return;
  const token = await getOwnerGraphToken();
  const moduleNames = payload.frameworks.filter((f) => f !== 'iso27001').join(', ') || 'ISO 27001 only';
  const kind = payload.type === 'demo' ? 'Trial signup' : 'Paid signup';
  const subject = kind + ': ' + (purchase.customerEmail || payload.tenantId);
  const lines = [
    kind + ' via the self-serve checkout on the website.',
    '',
    'Customer email: ' + (purchase.customerEmail || '(not provided by Paddle)'),
    'Tenant id: ' + payload.tenantId,
    'Modules: ' + moduleNames,
    'Type: ' + payload.type + (payload.type === 'demo' ? ' (7-day trial)' : ''),
    'Expiry: ' + payload.expiry,
    'Paddle subscription id(s): ' + purchase.subscriptionIds.join(', '),
    '',
    'This client now appears on the owner console roster.'
  ];
  await ownerGraph(token, '/users/' + encodeURIComponent(mailbox) + '/sendMail', {
    method: 'POST',
    body: {
      message: {
        subject,
        body: { contentType: 'text', content: lines.join('\n') },
        toRecipients: [{ emailAddress: { address: mailbox } }]
      },
      saveToSentItems: false
    }
  });
}

/* ============== Failed-signup notification (optional) ============== */
/* The mirror image of notifyOwnerOfSignup() above. A FRESH checkout (a
   real transactionId) can still fail after Paddle has taken the
   customer's money — Paddle's API rejecting the lookup, the subscription
   not (yet) active/trialing, a signing failure — and without this the
   customer just sees an error on their screen while the owner never
   learns a payment attempt happened at all. Same opt-in gate, same
   app-only Mail.Send, same non-negotiable trade-off: this must never
   throw past its own try/catch in the handler's outer catch block, or a
   notification failure would just replace one silent failure with
   another. */
async function notifyOwnerOfFailedSignup(tenantId, transactionId, errorMessage) {
  const mailbox = process.env.OWNER_NOTIFY_EMAIL;
  if (!mailbox) return;
  const token = await getOwnerGraphToken();
  const subject = 'Signup FAILED: ' + (tenantId || transactionId);
  const lines = [
    'A self-serve checkout on the website reached the activation step and failed.',
    '',
    'Tenant id: ' + (tenantId || '(not provided)'),
    'Paddle transaction id: ' + transactionId,
    'Error: ' + (errorMessage || '(no message)'),
    '',
    'The customer saw an error instead of their app activating. Check ' +
      'CloudWatch logs for the compliance365-provision Lambda around this ' +
      'time for the full stack trace, and check Paddle to see whether ' +
      'they were actually charged.'
  ];
  await ownerGraph(token, '/users/' + encodeURIComponent(mailbox) + '/sendMail', {
    method: 'POST',
    body: {
      message: {
        subject,
        body: { contentType: 'text', content: lines.join('\n') },
        toRecipients: [{ emailAddress: { address: mailbox } }]
      },
      saveToSentItems: false
    }
  });
}

/* ============== Handler ============== */
export const handler = async (event) => {
  const origin = event.headers?.origin || event.headers?.Origin || '';
  const allowed = [
    'https://www.compliance365.com.au',
    'http://localhost:4321',
    'http://localhost:3000'
  ];
  const corsHeaders = {
    'Access-Control-Allow-Origin': allowed.includes(origin) ? origin : allowed[0],
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  if (event.requestContext?.http?.method === 'OPTIONS' || event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders, body: '' };
  }

  const ip = event.requestContext?.http?.sourceIp || event.requestContext?.identity?.sourceIp || 'unknown';

  // Set as soon as a fresh checkout's transactionId is parsed below, so
  // the outer catch can still tell the owner about a failed PAYMENT
  // attempt even though the failure happened before activation — the
  // customer's browser and the owner's inbox are the only two places
  // this can ever surface, since CloudWatch is invisible to the owner
  // day-to-day.
  let signupAttempt = null;

  try {
    const body = JSON.parse(event.body || '{}');

    // Revocation check — a distinct, lightweight request shape from the
    // purchase/refresh flow below: no Paddle call, no signing, just "is
    // this tenant on the owner's blocklist right now." Called by every
    // live Checkpoint tenant on load (see app.js's checkAccessRevoked()),
    // not only self-serve ones, since this is the only revocation path
    // manually-issued/consulting clients have at all.
    if (body.checkRevocation) {
      const tenantId = (body.tenantId || '').trim();
      if (!tenantId) {
        return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'tenantId is required.' }) };
      }
      if (!isValidTenantIdentifier(tenantId)) {
        return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'tenantId is not a recognised tenant identifier.' }) };
      }
      if (rateLimited('revocation', ip)) {
        return { statusCode: 429, headers: corsHeaders, body: JSON.stringify({ error: 'Too many requests.' }) };
      }
      const status = await checkTenantBlocked(tenantId);
      /* status.reason is the owner's own internal note on the "Revoke
         access" action (e.g. "fraud suspected", "non-payment") —
         deliberately never returned to the caller. app.js's own
         checkAccessRevoked() never surfaces it to the client either
         (every showAccessRevokedScreen() call site passes no reason),
         but that was previously enforced only by the client choosing
         not to display a value the server had already sent it — any
         direct caller of this endpoint (or a browser devtools Network
         tab) could read it regardless, for ANY tenantId, with nothing
         else required. The confidentiality boundary belongs here, not
         in what the client happens to render. */
      return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ ok: true, blocked: status.blocked }) };
    }

    if (rateLimited('provision', ip)) {
      return { statusCode: 429, headers: corsHeaders, body: JSON.stringify({ error: 'Too many requests — try again in a minute.' }) };
    }

    const transactionId = (body.transactionId || '').trim();
    // subscriptionId: single-id refresh, kept for back-compat with any
    // client that hasn't picked up the multi-subscription app update yet.
    // subscriptionIds: the current refresh shape — every subscription
    // this tenant has ever completed self-serve checkout for.
    // knownSubscriptionIds: sent alongside a fresh transactionId so a
    // RETURNING customer's Nth purchase merges with their history
    // immediately, not just on the next page load's refresh.
    const subscriptionId = (body.subscriptionId || '').trim();
    const subscriptionIdsBody = Array.isArray(body.subscriptionIds) ? body.subscriptionIds.map((s) => String(s || '').trim()).filter(Boolean) : [];
    const knownSubscriptionIds = Array.isArray(body.knownSubscriptionIds) ? body.knownSubscriptionIds.map((s) => String(s || '').trim()).filter(Boolean) : [];
    const tenantId = (body.tenantId || '').trim();
    if (transactionId) signupAttempt = { tenantId, transactionId };

    if ((!transactionId && !subscriptionId && !subscriptionIdsBody.length) || !tenantId) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'tenantId plus one of transactionId, subscriptionId or subscriptionIds is required.' }) };
    }
    if (!isValidTenantIdentifier(tenantId)) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'tenantId is not a recognised tenant identifier.' }) };
    }

    let purchase;
    if (transactionId) {
      // Fresh checkout: resolve the subscription behind it, merged with
      // whatever subscriptions the browser already knew about — a
      // returning customer's second purchase must not silently drop
      // their first (see mergeResolvedSubscriptions()'s comment).
      const newSubId = await subscriptionIdFromTransaction(transactionId);
      const allIds = Array.from(new Set([newSubId, ...knownSubscriptionIds]));
      purchase = await resolveManySubscriptions(allIds);
    } else {
      const allIds = subscriptionIdsBody.length ? subscriptionIdsBody : [subscriptionId];
      purchase = await resolveManySubscriptions(allIds);
    }
    if (!purchase) {
      throw new Error('None of the provided subscription(s) are currently active or trialing.');
    }

    const file = await buildSignedActivation(tenantId, purchase);

    try {
      await recordOnOwnerRoster(file.payload, purchase);
    } catch (rosterErr) {
      // The customer's own activation is the important thing to hand
      // back — a roster-recording failure shouldn't block that. Log it
      // loudly (CloudWatch) so it doesn't go unnoticed, same trade-off
      // issue-entitlement.mjs's --record makes (falls back to printing
      // the row for manual entry rather than failing the whole issuance).
      console.error('Could not record on owner roster:', rosterErr);
    }

    // Only a fresh checkout (a real transactionId) means someone just
    // signed up — every OTHER call to this Lambda is an existing tenant's
    // routine on-load refresh (see refreshSelfServeEntitlementOnLoad() in
    // app.js), which happens on every single page load for every live
    // self-serve customer and would otherwise flood the inbox.
    if (transactionId) {
      try {
        await notifyOwnerOfSignup(file.payload, purchase);
      } catch (notifyErr) {
        console.error('Could not send new-signup notification:', notifyErr);
      }
    }

    return {
      statusCode: 200,
      headers: corsHeaders,
      // subscriptionIds (every id this activation covers) is handed
      // back so the app can store the FULL list and later refresh with
      // all of them, not just the one just bought.
      body: JSON.stringify({ ok: true, subscriptionIds: purchase.subscriptionIds, activationFile: JSON.stringify(file, null, 2) })
    };
  } catch (err) {
    console.error('Provision handler error:', err);
    if (signupAttempt) {
      try {
        await notifyOwnerOfFailedSignup(signupAttempt.tenantId, signupAttempt.transactionId, err.message);
      } catch (notifyErr) {
        console.error('Could not send failed-signup notification:', notifyErr);
      }
    }
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({ error: err.message || 'Could not confirm your purchase.' })
    };
  }
};
