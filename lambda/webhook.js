/**
 * Compliance365 — Paddle webhook handler (subscription lifecycle → owner roster)
 *
 * Keeps the owner console's roster in sync with Paddle in near-real-time
 * as a self-serve subscription moves through its lifecycle: trial → paid,
 * cancellation, payment failure. It ONLY updates OUR OWN roster
 * (PartnerClients / PartnerEntitlements in our tenant) — it never touches
 * a customer's tenant.
 *
 * Important architectural note: this webhook does NOT keep the customer's
 * own entitlement file current. It can't — like the provisioning Lambda,
 * it holds only our tenant's credentials, not the customer's. The
 * customer's entitlement stays current a different way: their Checkpoint
 * app re-pulls a fresh signed file from lambda/provision.js on load (given
 * the stored Paddle subscription id), so trialing→demo and active→client
 * are always reflected from Paddle's own truth. This webhook is purely for
 * the owner's real-time visibility, so a conversion or cancellation shows
 * on the roster/Dashboard without waiting for the customer to next open the
 * app. Both derive from the same Paddle state; neither is authoritative
 * over the other.
 *
 * Deploy: separate Lambda function (Node.js 20.x), its own API Gateway
 * POST route, pointed at by a Paddle "Notification destination". See
 * lambda/DEPLOY-WEBHOOK.md for the full walkthrough.
 *
 * Environment variables:
 *   PADDLE_WEBHOOK_SECRET   The signing secret Paddle shows when you create
 *                           the notification destination (Paddle → Developer
 *                           Tools → Notifications). Used to verify every
 *                           request genuinely came from Paddle — without
 *                           this, anyone who finds the URL could forge
 *                           subscription events.
 *   OWNER_TENANT_ID         Compliance365's own Entra tenant id (roster lives here).
 *   OWNER_APP_CLIENT_ID     The same app registration provision.js uses to
 *                           write the roster (app-only, Sites.Selected on our site).
 *   OWNER_APP_CLIENT_SECRET That app registration's client secret.
 *
 * Dependencies: none — native fetch + node:crypto, same single-file
 * convention as lambda/chat.js / provision.js.
 */

import crypto from 'node:crypto';

/* Same price→module map as provision.js and src/data/pricing.js — keep in
   sync by hand when a price changes (single-file Lambda, no build step). */
const PRICE_TO_MODULE = {
  'pri_01kyvv172apb8wfj72y06vh8gh': 'iso27001', 'pri_01kyvv4ah3nrwpx8bgdhzxqbh3': 'iso27001',
  'pri_01kyvvt4z6xymmk3327byyj60z': 'iso27701', 'pri_01kyvvvthspye2gcc2k4c8mkrz': 'iso27701',
  'pri_01kyvvngp1t2w23csct3jthk9p': 'iso42001', 'pri_01kyvvqgapg42pkc7frxd3nqy5': 'iso42001',
  'pri_01kyvvafz0rjmx93fknmh5shqe': 'soc2', 'pri_01kyvvbwjk49d86sv92paytdrk': 'soc2',
  'pri_01kyvvedm0at83vabz57dax7q4': 'essential8', 'pri_01kyvvjpbzmm31ypek8gxgcw0s': 'essential8',
  'pri_01kyvvxxq9bxpacjnav5d3j7ec': 'nistcsf', 'pri_01kyvvzxfr78bx69grc818jt99': 'nistcsf',
  'pri_01kyvw1edqna8qn220c4rpkafg': 'ai'
};

/* ============== Paddle signature verification ==============
   Paddle-Signature header looks like "ts=1700000000;h1=<hex>". The
   signed payload is `${ts}:${rawRequestBody}`, HMAC-SHA256 with the
   destination's secret. Reject anything that doesn't match — this is the
   only thing stopping a forged POST from mutating the roster. */
const MAX_SIGNATURE_AGE_SECONDS = 300; // 5 minutes

function verifyPaddleSignature(rawBody, signatureHeader, secret) {
  if (!signatureHeader || !secret) return false;
  const parts = {};
  signatureHeader.split(';').forEach((kv) => {
    const i = kv.indexOf('=');
    if (i > 0) parts[kv.slice(0, i).trim()] = kv.slice(i + 1).trim();
  });
  if (!parts.ts || !parts.h1) return false;

  // Replay window. The timestamp is inside the signed payload, so it cannot be
  // edited without breaking the HMAC — but without checking it, a request
  // captured once stays valid forever. That matters here because these events
  // mutate the roster: replaying an old `subscription.activated` after a
  // genuine cancellation would put a cancelled client back to active. Bounded
  // both ways so a far-future timestamp is rejected too.
  const ts = Number(parts.ts);
  if (!Number.isFinite(ts)) return false;
  const ageSeconds = Math.abs(Math.floor(Date.now() / 1000) - ts);
  if (ageSeconds > MAX_SIGNATURE_AGE_SECONDS) {
    console.error('Paddle webhook: signature timestamp outside the replay window (' + ageSeconds + 's)');
    return false;
  }

  const computed = crypto.createHmac('sha256', secret).update(parts.ts + ':' + rawBody).digest('hex');
  const a = Buffer.from(computed);
  const b = Buffer.from(parts.h1);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/* ============== Owner-tenant Graph (app-only) ============== */
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
  if (res.status === 204) return null;
  return res.json();
}

/* Applies a subscription-lifecycle event to the roster. `sub` is the
   event's data object (a Paddle subscription). Finds the entitlement row
   by SubscriptionId (written by provision.js) and updates status/type/
   expiry to match; flips the client's roster Status too. Idempotent —
   safe to receive the same event twice, which Paddle can do. */
async function applyToRoster(sub) {
  const subscriptionId = sub.id;
  const status = sub.status; // active | trialing | canceled | past_due | paused
  if (!subscriptionId) return { skipped: 'no subscription id on event' };

  const token = await getOwnerGraphToken();
  const site = await ownerGraph(token, '/sites/root?$select=id');
  const lists = await ownerGraph(token, '/sites/' + site.id + '/lists?$select=id,displayName&$top=200');
  const clientsList = lists.value.find((l) => l.displayName === 'Checkpoint Partner PartnerClients');
  const entsList = lists.value.find((l) => l.displayName === 'Checkpoint Partner PartnerEntitlements');
  if (!clientsList || !entsList) throw new Error('Partner lists not found in owner tenant.');

  const ents = await ownerGraph(token, '/sites/' + site.id + '/lists/' + entsList.id + '/items?$expand=fields&$top=500');
  const entItem = ents.value.find((i) => i.fields.SubscriptionId === subscriptionId);
  if (!entItem) {
    // No entitlement recorded for this subscription yet — the customer
    // likely hasn't completed activation (provision.js writes the row).
    // Nothing to update; the app-pull will create it when they activate.
    return { skipped: 'no entitlement row for subscription ' + subscriptionId };
  }
  const tenantId = entItem.fields.TenantId;

  // Recompute type/expiry from the event's own subscription data — same
  // rules as provision.js's resolveSubscription().
  const items = Array.isArray(sub.items) ? sub.items : [];
  const frameworks = Array.from(new Set(items.map((it) => PRICE_TO_MODULE[it.price && it.price.id]).filter(Boolean)));
  const type = status === 'trialing' ? 'demo' : (status === 'active' ? 'client' : entItem.fields.Type);
  const expirySource = (sub.current_billing_period && sub.current_billing_period.ends_at) || sub.next_billed_at || '';
  const expiry = expirySource ? expirySource.slice(0, 10) : entItem.fields.Expiry;

  const entPatch = { PaddleStatus: status };
  if (status === 'active' || status === 'trialing') {
    entPatch.Type = type;
    if (frameworks.length) entPatch.Modules = frameworks.join(',');
    if (expiry) entPatch.Expiry = expiry;
  }
  // On cancellation we deliberately leave Type/Expiry untouched — access
  // runs to the end of what was paid for, never yanked mid-term (same rule
  // as ISSUANCE.md §5). Only PaddleStatus reflects the cancellation.
  await ownerGraph(token, '/sites/' + site.id + '/lists/' + entsList.id + '/items/' + entItem.id + '/fields', {
    method: 'PATCH', body: entPatch
  });

  // Mirror onto the client's roster Status for at-a-glance visibility.
  const clientStatus = status === 'active' ? 'Active'
    : status === 'trialing' ? 'Trial'
    : status === 'canceled' ? 'Churned'
    : status === 'past_due' ? 'Expired'
    : null;
  if (clientStatus) {
    const clients = await ownerGraph(token, '/sites/' + site.id + '/lists/' + clientsList.id + '/items?$expand=fields&$top=500');
    const clientItem = clients.value.find((i) => i.fields.TenantId === tenantId);
    if (clientItem && clientItem.fields.Status !== clientStatus) {
      await ownerGraph(token, '/sites/' + site.id + '/lists/' + clientsList.id + '/items/' + clientItem.id + '/fields', {
        method: 'PATCH', body: { Status: clientStatus }
      });
    }
  }
  return { updated: tenantId, status };
}

/* ============== Handler ============== */
export const handler = async (event) => {
  // API Gateway may base64-encode the body; the RAW bytes are what Paddle
  // signed, so decode without reserialising.
  const rawBody = event.isBase64Encoded ? Buffer.from(event.body || '', 'base64').toString('utf8') : (event.body || '');
  const headers = event.headers || {};
  const signature = headers['paddle-signature'] || headers['Paddle-Signature'] || '';

  if (!verifyPaddleSignature(rawBody, signature, process.env.PADDLE_WEBHOOK_SECRET)) {
    console.error('Paddle webhook: signature verification failed');
    return { statusCode: 403, body: JSON.stringify({ error: 'invalid signature' }) };
  }

  let evt;
  try { evt = JSON.parse(rawBody); } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: 'invalid JSON' }) };
  }

  try {
    const type = evt.event_type || '';
    // Only subscription lifecycle events carry a subscription in data.
    if (type.startsWith('subscription.') && evt.data) {
      const result = await applyToRoster(evt.data);
      console.log('Paddle webhook ' + type + ':', JSON.stringify(result));
    } else {
      console.log('Paddle webhook ignored event_type:', type);
    }
  } catch (err) {
    // Roster sync is best-effort — the customer's own entitlement is kept
    // current by the app-pull regardless. Log loudly, but return 200 so
    // Paddle doesn't retry-storm on a persistent roster-side problem.
    console.error('Paddle webhook processing error:', err);
  }

  return { statusCode: 200, body: JSON.stringify({ ok: true }) };
};
