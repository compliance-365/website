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
  'pri_01ky2560831rv9zzdmcxjgv82f': { moduleId: 'iso27001', tier: 'micro' },
  'pri_01ky254skh5vtwkj34b9eczb1a': { moduleId: 'iso27001', tier: 'growth' },
  'pri_01ky24ktbrq0gy7bm2mk72k8sa': { moduleId: 'iso27701', tier: 'micro' },
  'pri_01ky24f8vydtar052488baj4rh': { moduleId: 'iso27701', tier: 'growth' },
  'pri_01ky24a5ey37g7sty7b99ehp5x': { moduleId: 'iso42001', tier: 'micro' },
  'pri_01ky244htj7qexa370250f3hfp': { moduleId: 'iso42001', tier: 'growth' },
  'pri_01ky253bfd3xtnd81y4sv7vw4x': { moduleId: 'soc2', tier: 'micro' },
  'pri_01ky251skf7qxjdtbnqxgw8thd': { moduleId: 'soc2', tier: 'growth' },
  'pri_01ky250323b6yve29w3fpm6eby': { moduleId: 'essential8', tier: 'micro' },
  'pri_01ky24yrnfzjqtzfc8zhdwv1vk': { moduleId: 'essential8', tier: 'growth' },
  'pri_01ky24x1mc2tgaf5dp9e6qv74b': { moduleId: 'nistcsf', tier: 'micro' },
  'pri_01ky24vq2nyh4y9hd2kth79fdf': { moduleId: 'nistcsf', tier: 'growth' },
  'pri_01ky25w0y4m7zeas4p5ksvwex3': { moduleId: 'ai', tier: null }
};

const GRACE_DAYS = 14; // same standard as tools/issue-entitlement.mjs

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

/* Looks up the subscription behind a checkout transaction and returns
   the authoritative frameworks/tier/expiry/type — NEVER derived from
   anything the browser sent. `status` of 'trialing' or 'active' are
   both fine to grant on (a customer mid-trial is meant to have access);
   anything else (paused/canceled/past_due) is refused.
   NOTE: verify the exact field paths below (current_billing_period,
   trial_dates etc.) against a real response from your Paddle sandbox
   before relying on this in anger — Paddle's Billing API has changed
   this shape before, and it hasn't been exercised against a live
   sandbox call from this environment. */
async function resolvePurchase(transactionId) {
  const txn = await paddleFetch('/transactions/' + encodeURIComponent(transactionId));
  const subscriptionId = txn.data && txn.data.subscription_id;
  if (!subscriptionId) throw new Error('Transaction has no subscription — not a subscription checkout?');

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

  return { frameworks, type, expiry, customerEmail: (s.customer && s.customer.email) || '' };
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
  if (res.status === 204) return null;
  return res.json();
}

/* Records this issuance on the owner console's own roster — find-or-
   create the PartnerClients row by tenantId (a brand-new self-serve
   signup has none yet; a trial-to-paid conversion re-issuing already
   does), then always add a fresh PartnerEntitlements row, same field
   shape as tools/issue-entitlement.mjs's recordEntitlementIssuance(). */
async function recordOnOwnerRoster(payload, customerEmail) {
  const token = await getOwnerGraphToken();
  const site = await ownerGraph(token, '/sites/root?$select=id');

  const lists = await ownerGraph(token, '/sites/' + site.id + '/lists?$select=id,displayName&$top=200');
  const clientsList = lists.value.find((l) => l.displayName === 'Checkpoint Partner PartnerClients');
  const entsList = lists.value.find((l) => l.displayName === 'Checkpoint Partner PartnerEntitlements');
  if (!clientsList || !entsList) {
    throw new Error('Partner lists not found — open the owner console at least once first (it provisions these automatically).');
  }

  const existingClients = await ownerGraph(token, '/sites/' + site.id + '/lists/' + clientsList.id + '/items?$expand=fields&$top=500');
  const existing = existingClients.value.find((i) => i.fields.TenantId === payload.tenantId);

  if (!existing) {
    await ownerGraph(token, '/sites/' + site.id + '/lists/' + clientsList.id + '/items', {
      method: 'POST',
      body: { fields: { Title: payload.tenantId, ClientName: customerEmail || payload.tenantId, TenantId: payload.tenantId, Status: payload.type === 'demo' ? 'Trial' : 'Active', ContactEmail: customerEmail || '' } }
    });
  } else if (payload.type === 'client' && existing.fields.Status !== 'Active') {
    // Trial converted to paid — flip the roster status to match.
    await ownerGraph(token, '/sites/' + site.id + '/lists/' + clientsList.id + '/items/' + existing.id + '/fields', {
      method: 'PATCH', body: { Status: 'Active' }
    });
  }

  await ownerGraph(token, '/sites/' + site.id + '/lists/' + entsList.id + '/items', {
    method: 'POST',
    body: { fields: {
      Title: payload.tenantId, TenantId: payload.tenantId, Type: payload.type,
      Modules: payload.frameworks.join(','), IssuedAt: payload.issuedAt, Expiry: payload.expiry
    } }
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

  try {
    const body = JSON.parse(event.body || '{}');
    const transactionId = (body.transactionId || '').trim();
    const tenantId = (body.tenantId || '').trim();

    if (!transactionId || !tenantId) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'transactionId and tenantId are both required.' }) };
    }

    const purchase = await resolvePurchase(transactionId);
    const file = await buildSignedActivation(tenantId, purchase);

    try {
      await recordOnOwnerRoster(file.payload, purchase.customerEmail);
    } catch (rosterErr) {
      // The customer's own activation is the important thing to hand
      // back — a roster-recording failure shouldn't block that. Log it
      // loudly (CloudWatch) so it doesn't go unnoticed, same trade-off
      // issue-entitlement.mjs's --record makes (falls back to printing
      // the row for manual entry rather than failing the whole issuance).
      console.error('Could not record on owner roster:', rosterErr);
    }

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ ok: true, activationFile: JSON.stringify(file, null, 2) })
    };
  } catch (err) {
    console.error('Provision handler error:', err);
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({ error: err.message || 'Could not confirm your purchase.' })
    };
  }
};
