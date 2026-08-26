/**
 * Compliance365 — Microsoft Marketplace SaaS fulfillment
 *
 * The Microsoft-Marketplace counterpart to lambda/provision.js. Where
 * that one confirms a Paddle purchase and hands back a signed
 * activation, this does the same for a customer who bought Checkpoint
 * through Microsoft Marketplace. Everything downstream is identical:
 * the same Ed25519 key signs the same payload shape, the same
 * PartnerClients/PartnerEntitlements roster records it, and the
 * customer's app verifies it with the same code it already runs. This
 * is a payment-provider adapter, not a second product.
 *
 * Three entry points, distinguished by the request shape:
 *
 *   1. LANDING PAGE (POST { marketplaceToken, tenantId } + Bearer):
 *      Microsoft redirects a buyer to our landing page with an opaque
 *      token. We resolve that token with Microsoft, activate the
 *      subscription, sign an activation for the caller's tenant, and
 *      record it on the roster.
 *
 *   2. WEBHOOK (POST { id, action, subscriptionId, ... }):
 *      Microsoft calls this for every lifecycle event — Unsubscribe,
 *      ChangePlan, Suspend, Reinstate, Renew.
 *
 *   3. REFRESH (POST { refresh: true, tenantId } + Bearer):
 *      The customer's app re-pulls a current signed file on load, the
 *      same pull-based pattern provision.js uses, because neither this
 *      Lambda nor Microsoft can push into the customer's tenant.
 *
 * SECURITY — two things this file will not do:
 *
 *   It never trusts a webhook payload. Microsoft's own guidance is that
 *   the POST body is not authenticated; the operation must be re-read
 *   from the Fulfillment API before acting on it. A forged POST claiming
 *   "Unsubscribe" for someone else's subscription would otherwise
 *   revoke a paying customer. See verifyOperation() below.
 *
 *   It never trusts body.tenantId. Same fix, same reasoning as
 *   provision.js's resolveCallerTenantId(): the caller presents their
 *   own Graph token and we ask Microsoft Graph which tenant it belongs
 *   to. A signed activation is only ever issued for a tenant the caller
 *   demonstrably holds.
 *
 * PLANS — one Marketplace plan per framework, so a plan id IS a
 * framework id (iso27001, soc2, cps234...). That is deliberate: it
 * keeps this a lookup rather than a translation table, and it matches
 * how Paddle already issues a separate subscription per module which
 * mergeResolvedSubscriptions() then merges. See PLAN_TO_FRAMEWORK.
 *
 * Deploy steps and the Entra app registration this needs are in
 * lambda/DEPLOY-MARKETPLACE.md.
 *
 * Environment variables required:
 *   MARKETPLACE_TENANT_ID       Our own Entra tenant id.
 *   MARKETPLACE_CLIENT_ID       App registration used to call the SaaS
 *                               Fulfillment API. MUST be a confidential
 *                               client, separate from the public client
 *                               the browser app uses — this one holds a
 *                               secret and is never handed to a customer.
 *   MARKETPLACE_CLIENT_SECRET   That registration's secret.
 *   ENTITLEMENT_PRIVATE_KEY_JWK Same signing key as provision.js.
 *   MODULE_KEYS_JSON            Same content-pack keys as provision.js.
 *   OWNER_TENANT_ID             Our tenant, for the roster writes.
 *   OWNER_APP_CLIENT_ID         Roster app registration (app-only).
 *   OWNER_APP_CLIENT_SECRET     That registration's secret.
 *
 * Optional:
 *   MARKETPLACE_API_BASE        Override the Fulfillment API host. Set
 *                               this to the local SaaS API Emulator's
 *                               URL to exercise the whole flow without a
 *                               live offer — see DEPLOY-MARKETPLACE.md.
 *   OWNER_NOTIFY_EMAIL          Same opt-in signup notification as
 *                               provision.js.
 *
 * Dependencies: none — native fetch + crypto.webcrypto on Node 20,
 * same no-dependencies convention as every other Lambda here.
 */

import { webcrypto } from 'node:crypto';

/* A Marketplace plan id IS a framework id. Listed explicitly rather
   than accepted blindly so an unrecognised plan fails loudly instead of
   silently signing an activation for a framework that does not exist —
   which the customer's app would then reject, leaving them paid-up and
   locked out with no clear reason. Keep in step with
   window.FRAMEWORK_ORDER in public/checkpoint/store.js. */
const PLAN_TO_FRAMEWORK = {
  iso27001: 'iso27001', soc2: 'soc2', essential8: 'essential8',
  is18: 'is18', iso42001: 'iso42001', iso27701: 'iso27701',
  dispirap: 'dispirap', nistcsf: 'nistcsf', rffr: 'rffr', cps234: 'cps234',
  ai: 'ai'
};

const GRACE_DAYS = 14; // same standard as provision.js / issue-entitlement.mjs

/* The Fulfillment API's own resource id. Constant across tenants — this
   is Microsoft's marketplace resource, not anything of ours. */
const MARKETPLACE_RESOURCE = '20e940b3-4c77-48b9-9f0f-d82d6f4c1f3b';
const API_VERSION = '2018-08-31';
function apiBase() {
  return process.env.MARKETPLACE_API_BASE || 'https://marketplaceapi.microsoft.com/api/saas';
}

/* Subscription states Microsoft can report. Only these two grant
   access: everything else (Unsubscribed, Suspended, NotStarted) means
   the customer should not be entitled right now. Listed as an
   allowlist rather than a denylist so a state Microsoft adds later
   fails closed instead of silently granting. */
const GRANTABLE_STATES = ['Subscribed', 'PendingFulfillmentStart'];

/* ============== canonicalJson / Ed25519 signing ==============
   Byte-identical copies of provision.js's, which are themselves copies
   of public/checkpoint/lib.js's. Signing and verifying MUST serialise
   the same bytes for the same payload or every signature this produces
   would fail the app's own verifyEntitlementSignature(). Copied rather
   than imported for the same single-pasteable-file reason as every
   other Lambda here. */
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

/* ============== Marketplace Fulfillment API ============== */
async function marketplaceToken() {
  const res = await fetch('https://login.microsoftonline.com/' + process.env.MARKETPLACE_TENANT_ID + '/oauth2/v2.0/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: process.env.MARKETPLACE_CLIENT_ID,
      client_secret: process.env.MARKETPLACE_CLIENT_SECRET,
      resource: MARKETPLACE_RESOURCE,
      scope: MARKETPLACE_RESOURCE + '/.default'
    })
  });
  const tok = await res.json();
  if (!res.ok) throw new Error('Marketplace auth failed: ' + (tok.error_description || tok.error));
  return tok.access_token;
}

async function marketplaceFetch(path, opts = {}) {
  const token = opts.token || await marketplaceToken();
  const sep = path.includes('?') ? '&' : '?';
  const res = await fetch(apiBase() + path + sep + 'api-version=' + API_VERSION, {
    method: opts.method || 'GET',
    headers: Object.assign(
      { Authorization: 'Bearer ' + token, 'x-ms-marketplace-session-mode': 'None' },
      opts.body ? { 'Content-Type': 'application/json' } : {}
    ),
    body: opts.body ? JSON.stringify(opts.body) : undefined
  });
  if (!res.ok) throw new Error('Marketplace ' + res.status + ': ' + (await res.text()));
  if (res.status === 204 || res.status === 202) return null;
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

/* ============== Entitlement payload ============== */
function subscriptionToPurchase(sub) {
  const planId = sub && (sub.planId || (sub.beneficiary && sub.beneficiary.planId));
  const framework = PLAN_TO_FRAMEWORK[planId];
  if (!framework) {
    throw new Error('Plan "' + planId + '" is not in PLAN_TO_FRAMEWORK — is it out of step with the offer\'s plans?');
  }
  if (!GRANTABLE_STATES.includes(sub.saasSubscriptionStatus)) {
    throw new Error('Subscription status is "' + sub.saasSubscriptionStatus + '" — not currently entitled.');
  }
  /* A Marketplace subscription in free trial is a demo licence, exactly
     as a Paddle 'trialing' subscription is. Anything else that reaches
     here is a paying client. */
  const type = sub.isFreeTrial ? 'demo' : 'client';
  const expiry = String(sub.term && (sub.term.endDate || sub.term.termEnd) || '').slice(0, 10);
  if (!expiry) throw new Error('Could not determine an expiry date from the subscription term.');
  return {
    subscriptionId: sub.id,
    status: sub.saasSubscriptionStatus,
    frameworks: [framework],
    type,
    expiry,
    customerEmail: (sub.beneficiary && sub.beneficiary.emailId) || (sub.purchaser && sub.purchaser.emailId) || '',
    planId
  };
}

/* Union across every Marketplace subscription this tenant holds. A
   customer buying a second framework gets a SECOND subscription (one
   plan per framework), so entitlement is the merge of all of them —
   the same reasoning, and the same shape, as provision.js's
   mergeResolvedSubscriptions(). Exported for unit testing: this is the
   one piece with no network dependency. */
export function mergeMarketplaceSubscriptions(results) {
  if (!results || !results.length) return null;
  const frameworks = Array.from(new Set(results.reduce((acc, r) => acc.concat(r.frameworks), [])));
  /* 'client' if ANY subscription is paid — a customer with one module
     converted and another still in trial is a paying client overall,
     not knocked back to demo. */
  const type = results.some((r) => r.type === 'client') ? 'client' : 'demo';
  /* Latest expiry: access runs to whichever subscription has the most
     runway, not the first to lapse. */
  const expiry = results.map((r) => r.expiry).sort().slice(-1)[0];
  const customerEmail = (results.find((r) => r.customerEmail) || {}).customerEmail || '';
  return { results, subscriptionIds: results.map((r) => r.subscriptionId), frameworks, type, expiry, customerEmail };
}

async function buildSignedActivation(tenantId, purchase) {
  const privJwk = JSON.parse(process.env.ENTITLEMENT_PRIVATE_KEY_JWK);
  const moduleKeysAll = JSON.parse(process.env.MODULE_KEYS_JSON || '{}');
  const privateKey = await webcrypto.subtle.importKey('jwk', privJwk, { name: 'Ed25519' }, false, ['sign']);
  const moduleKeys = {};
  purchase.frameworks.filter((f) => f !== 'iso27001').forEach((f) => {
    if (moduleKeysAll[f]) moduleKeys[f] = moduleKeysAll[f];
  });
  const payload = {
    tenantId,
    type: purchase.type,
    frameworks: purchase.frameworks,
    issuedAt: new Date().toISOString().slice(0, 10),
    expiry: purchase.expiry,
    graceDays: GRACE_DAYS,
    moduleKeys
  };
  return { payload, signature: await signEntitlementPayload(privateKey, payload) };
}

/* ============== Caller tenant resolution ==============
   Identical in purpose and reasoning to provision.js's — see its
   comment for the full story on why body.tenantId is never trusted. */
export class AuthError extends Error {}
async function defaultGraphFetch(url, bearerToken) {
  const res = await fetch(url, { headers: { Authorization: 'Bearer ' + bearerToken } });
  if (!res.ok) throw new Error('Graph ' + res.status + ': ' + (await res.text()));
  return res.json();
}
export async function resolveCallerTenantId(bearerToken, graphFetch) {
  const fetchImpl = graphFetch || defaultGraphFetch;
  let org;
  try {
    org = await fetchImpl('https://graph.microsoft.com/v1.0/organization?$select=id', bearerToken);
  } catch (e) {
    throw new AuthError('Could not verify your Microsoft 365 sign-in (' + (e && e.message) + '). Sign in again and retry.');
  }
  const id = org && Array.isArray(org.value) && org.value[0] && org.value[0].id;
  if (!id) throw new AuthError('Your Microsoft 365 sign-in did not resolve to a tenant. Sign in again and retry.');
  return id;
}

/* ============== Owner-tenant roster (app-only) ============== */
async function getOwnerGraphToken() {
  const res = await fetch('https://login.microsoftonline.com/' + process.env.OWNER_TENANT_ID + '/oauth2/v2.0/token', {
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
  if (res.status === 204 || res.status === 202) return null;
  return res.json();
}

/* Same roster shape provision.js writes, so the owner console shows a
   Marketplace client identically to a Paddle one — one
   PartnerEntitlements row per subscription, keyed on SubscriptionId so
   repeat calls update rather than pile up duplicates. Source records
   which channel it came through, since that is the one thing that
   genuinely differs and the owner needs it for reconciliation. */
async function recordOnOwnerRoster(payload, purchase) {
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
  const customerEmail = purchase.customerEmail || '';
  if (!existingClient) {
    await ownerGraph(token, '/sites/' + site.id + '/lists/' + clientsList.id + '/items', {
      method: 'POST',
      body: { fields: { Title: payload.tenantId, ClientName: customerEmail || payload.tenantId, TenantId: payload.tenantId, Status: payload.type === 'demo' ? 'Trial' : 'Active', ContactEmail: customerEmail } }
    });
  } else if (payload.type === 'client' && existingClient.fields.Status !== 'Active') {
    await ownerGraph(token, '/sites/' + site.id + '/lists/' + clientsList.id + '/items/' + existingClient.id + '/fields', {
      method: 'PATCH', body: { Status: 'Active' }
    });
  }

  const existingEnts = await ownerGraph(token, '/sites/' + site.id + '/lists/' + entsList.id + '/items?$expand=fields&$top=500');
  for (const r of purchase.results || []) {
    const entFields = {
      Title: payload.tenantId, TenantId: payload.tenantId, Type: r.type,
      Modules: r.frameworks.join(','), IssuedAt: payload.issuedAt, Expiry: r.expiry,
      SubscriptionId: r.subscriptionId, PaddleStatus: 'marketplace:' + r.status
    };
    const existingEnt = existingEnts.value.find((i) => i.fields.SubscriptionId === r.subscriptionId);
    if (existingEnt) {
      await ownerGraph(token, '/sites/' + site.id + '/lists/' + entsList.id + '/items/' + existingEnt.id + '/fields', { method: 'PATCH', body: entFields });
    } else {
      await ownerGraph(token, '/sites/' + site.id + '/lists/' + entsList.id + '/items', { method: 'POST', body: { fields: entFields } });
    }
  }
}

/* ============== Webhook verification ==============
   THE thing this file must not get wrong. Microsoft's webhook POST is
   NOT authenticated — anyone who learns the endpoint URL can send one.
   Acting on the body directly would let a stranger POST
   {action:'Unsubscribe', subscriptionId:'<someone else's>'} and revoke
   a paying customer's access.

   So the body is treated purely as a HINT that something happened. The
   authoritative version is re-read from the Fulfillment API using our
   own credentials, and every field we act on comes from THAT response,
   never from the request. If the operation does not exist, or its
   subscription does not match what the body claimed, the request is
   refused.

   Exported so the comparison logic is unit-testable with an injectable
   fetch, without a live subscription. */
export async function verifyOperation(body, fetchOperation) {
  if (!body || !body.id || !body.subscriptionId) {
    throw new Error('Webhook payload is missing an operation id or subscription id.');
  }
  const op = await fetchOperation(body.subscriptionId, body.id);
  if (!op) throw new Error('Operation ' + body.id + ' does not exist — refusing to act on an unverified webhook.');
  /* The operation Microsoft returns must be for the subscription the
     body claimed. A mismatch means the payload was fabricated or
     tampered with. */
  if (String(op.subscriptionId) !== String(body.subscriptionId)) {
    throw new Error('Operation ' + body.id + ' belongs to a different subscription — refusing.');
  }
  return op;
}

/* ============== Handler ============== */
export const handler = async (event) => {
  const origin = event.headers?.origin || event.headers?.Origin || '';
  const allowed = ['https://www.compliance365.com.au', 'http://localhost:4321', 'http://localhost:3000'];
  const corsHeaders = {
    'Access-Control-Allow-Origin': allowed.includes(origin) ? origin : allowed[0],
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json'
  };
  if (event.requestContext?.http?.method === 'OPTIONS' || event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders, body: '' };
  }

  try {
    const body = JSON.parse(event.body || '{}');

    /* ---- Webhook: Microsoft calling us ---- */
    if (body.action && body.subscriptionId) {
      const token = await marketplaceToken();
      const op = await verifyOperation(body, (subId, opId) =>
        marketplaceFetch('/subscriptions/' + encodeURIComponent(subId) + '/operations/' + encodeURIComponent(opId), { token }));

      /* Acknowledge. Microsoft retries an unacknowledged operation, and
         an unacknowledged ChangePlan leaves the subscription wedged. */
      await marketplaceFetch('/subscriptions/' + encodeURIComponent(op.subscriptionId) + '/operations/' + encodeURIComponent(op.id), {
        method: 'PATCH', token, body: { status: 'Success' }
      });

      /* The roster is updated from the subscription's CURRENT state, not
         from the action name — the same "re-derive, don't infer"
         discipline the rest of this file uses. The customer's own
         entitlement stays current by pull, exactly as it does for
         Paddle: neither we nor Microsoft can push into their tenant. */
      try {
        const sub = await marketplaceFetch('/subscriptions/' + encodeURIComponent(op.subscriptionId), { token });
        const purchase = mergeMarketplaceSubscriptions([subscriptionToPurchase(sub)]);
        if (purchase) {
          await recordOnOwnerRoster({ tenantId: sub.beneficiary?.tenantId || '', type: purchase.type, issuedAt: new Date().toISOString().slice(0, 10) }, purchase);
        }
      } catch (e) {
        /* A lapsed/unsubscribed subscription throws here by design —
           the operation is still acknowledged above, which is what
           Microsoft needs. Log rather than fail the webhook. */
        console.error('Webhook roster update skipped: ' + (e && e.message));
      }
      return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ ok: true }) };
    }

    /* ---- Landing page / refresh: the customer calling us ---- */
    const authHeader = event.headers?.authorization || event.headers?.Authorization || '';
    const bearerToken = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (!bearerToken) {
      return { statusCode: 401, headers: corsHeaders, body: JSON.stringify({ error: 'Sign in required — no Microsoft 365 credential was sent with this request.' }) };
    }
    let callerTenantId;
    try {
      callerTenantId = await resolveCallerTenantId(bearerToken);
    } catch (e) {
      if (e instanceof AuthError) return { statusCode: 401, headers: corsHeaders, body: JSON.stringify({ error: e.message }) };
      throw e;
    }

    const token = await marketplaceToken();
    let subscriptionIds = Array.isArray(body.subscriptionIds) ? body.subscriptionIds.map(String).filter(Boolean) : [];

    if (body.marketplaceToken) {
      /* Fresh purchase: resolve the opaque landing-page token into a
         real subscription, then activate it. */
      const resolved = await marketplaceFetch('/subscriptions/resolve', {
        method: 'POST', token,
        body: {}
      });
      if (!resolved || !resolved.id) throw new Error('Could not resolve the marketplace token — it may have expired. Return to Microsoft Marketplace and retry.');
      const purchase = subscriptionToPurchase(resolved);
      await marketplaceFetch('/subscriptions/' + encodeURIComponent(resolved.id) + '/activate', {
        method: 'POST', token, body: { planId: purchase.planId, quantity: resolved.quantity }
      });
      subscriptionIds = Array.from(new Set([resolved.id, ...subscriptionIds]));
    }

    if (!subscriptionIds.length) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'A marketplaceToken or at least one subscriptionId is required.' }) };
    }

    /* Resolve every subscription independently, skipping any that no
       longer grants — one lapsed module must never take down the
       customer's other entitlements. Same tolerance as
       resolveManySubscriptions() in provision.js. */
    const results = [];
    for (const id of subscriptionIds) {
      try {
        results.push(subscriptionToPurchase(await marketplaceFetch('/subscriptions/' + encodeURIComponent(id), { token })));
      } catch (e) { console.error('skipping subscription ' + id + ': ' + (e && e.message)); }
    }
    const purchase = mergeMarketplaceSubscriptions(results);
    if (!purchase) throw new Error('None of the provided subscription(s) are currently entitled.');

    const file = await buildSignedActivation(callerTenantId, purchase);
    try { await recordOnOwnerRoster(file.payload, purchase); }
    catch (rosterErr) { console.error('Could not record on owner roster:', rosterErr); }

    return {
      statusCode: 200, headers: corsHeaders,
      body: JSON.stringify({ ok: true, subscriptionIds: purchase.subscriptionIds, activationFile: JSON.stringify(file, null, 2) })
    };
  } catch (err) {
    console.error('Marketplace fulfillment error:', err);
    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: err.message || 'Could not confirm your Marketplace purchase.' }) };
  }
};
