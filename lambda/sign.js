/**
 * Compliance365 — Owner-console entitlement signing Lambda
 *
 * The optional "small signing endpoint" tools/ISSUANCE.md already
 * describes and public/owner/owner.js's partnerSignViaEndpoint()
 * already calls (CONFIG.signingEndpoint.url) — this is that endpoint,
 * built. It lets a practitioner click "Sign automatically via endpoint"
 * in the owner console's New client form instead of running
 * issue-entitlement.mjs locally with the private key file on disk.
 *
 * ISSUANCE.md originally sketched this as an Azure Function, because
 * the auth model (an Entra app registration exposing an API scope,
 * admin-consented once to the owner console's own app registration, in
 * OUR tenant only) is an Entra concept. But the Entra app registration
 * is just identity metadata — it defines and protects a scope; nothing
 * requires the code that VALIDATES a token for that scope to run on
 * Azure. This is that same design, hosted here instead, on the same AWS
 * account as the self-serve provisioning Lambda (lambda/provision.js) —
 * one platform to operate rather than two.
 *
 * What makes a caller trusted is identical either way: a valid Entra
 * access token, issued to a specific tenant (OUR OWN — checked against
 * OWNER_TENANT_ID, not just "any Microsoft account"), for a specific
 * scope on a specific app registration (SIGN_APP_AUDIENCE) that only
 * Compliance365's own owner-console app has ever been consented to
 * request. A client's browser — signed into THEIR tenant, using
 * Checkpoint's separate, different app registration — has no path to
 * ever acquire a token this Lambda would accept, at any layer: wrong
 * tenant, wrong app, no consent grant. This Lambda verifies that token
 * itself (JWT signature against Entra's own published keys, plus
 * issuer/audience/tenant/scope claims) rather than trusting anything
 * the caller merely asserts.
 *
 * Deploy steps: see lambda/DEPLOY-SIGN.md for the full walkthrough,
 * including the one-time Entra app registration and scope exposure this
 * needs (a five-minute Entra step, no Azure Function/Key Vault
 * required) and the API Gateway route.
 *
 * Environment variables required:
 *   ENTITLEMENT_PRIVATE_KEY_JWK
 *                          The exact JSON contents of
 *                          entitlement-private.json, as a single-line
 *                          JSON string. Same key the CLI and the
 *                          self-serve provisioning Lambda both sign
 *                          with — one key for the whole product.
 *   MODULE_KEYS_JSON        The exact JSON contents of
 *                          tools/module-keys.json, as a single-line
 *                          JSON string.
 *   OWNER_TENANT_ID         Compliance365's own Entra tenant id — the
 *                          ONLY tenant a caller's token may have been
 *                          issued from. This is the check that makes
 *                          "our tenant only" real rather than aspirational.
 *   SIGN_APP_AUDIENCE       The App ID URI (e.g.
 *                          api://<sign-app-registration-id>) exposed on
 *                          the Entra app registration created for this
 *                          endpoint — see DEPLOY-SIGN.md §1. Tokens for
 *                          any other audience are rejected.
 *   SIGN_APP_SCOPE_NAME     (optional, default "Sign.Entitlement") the
 *                          scope name exposed on that app registration —
 *                          rejects a token that has the right audience
 *                          but wasn't granted this specific scope.
 *
 * Everything else — GRACE_DAYS, FRAMEWORK_BUNDLES, canonicalJson,
 * signEntitlementPayload — is copied verbatim from
 * tools/issue-entitlement.mjs / lambda/provision.js so this Lambda
 * signs byte-identical payloads to every other issuance path. Keep in
 * sync if any of those ever change; see provision.js's own note on why
 * this is copied rather than imported (a single-file Lambda has no
 * shared module to import from).
 */
import { webcrypto, createPublicKey, verify as cryptoVerify } from 'node:crypto';

const GRACE_DAYS = 14; // same standard as tools/issue-entitlement.mjs
const FRAMEWORK_BUNDLES = { is18: ['iso27001', 'essential8'] }; // IS18 = ISO 27001-aligned ISMS + Essential Eight uplift
const VALID_FRAMEWORKS = ['iso27001', 'soc2', 'essential8', 'iso42001', 'iso27701', 'dispirap', 'nistcsf', 'is18', 'ai'];
const ENTITLEMENT_TYPES = ['client', 'partner', 'demo'];

/* ============== canonicalJson / Ed25519 signing ==============
   Exact copy of public/checkpoint/lib.js's canonicalJson() and
   signEntitlementPayload() — see lambda/provision.js's identical note.
   Signing and verifying MUST serialise identical bytes for the same
   payload, or every signature this Lambda produces would fail app.js's
   own verifyEntitlementSignature(). */
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

/* ============== Entra token verification ==============
   No npm dependency (this ships as a single pasteable file, same as
   every other Lambda in this folder) — RS256 JWT verification using
   only Node's built-in crypto, which supports importing an RSA public
   key directly from its JWK form since Node 16.

   Deliberately checks FOUR things, not just "is this signature valid":
   signature (it's really from Microsoft), issuer+tid (it's from OUR
   tenant, not any tenant that happens to trust this multi-tenant app
   shape), audience (it was actually meant for THIS endpoint, not some
   other Entra-protected resource), and scope (the caller was granted
   the specific permission this endpoint requires, not just signed in).
   A token that's genuinely from Microsoft but fails any one of those is
   rejected — "valid JWT" alone proves nothing about authorization. */
let jwksCache = null; // { tid, keys, fetchedAt } — Lambda execution environments are reused across invocations
async function getSigningKey(tid, kid) {
  const fresh = jwksCache && jwksCache.tid === tid && (Date.now() - jwksCache.fetchedAt) < 60 * 60 * 1000;
  if (!fresh) {
    const res = await fetch('https://login.microsoftonline.com/' + encodeURIComponent(tid) + '/discovery/v2.0/keys');
    if (!res.ok) throw new Error('Could not fetch Entra signing keys: HTTP ' + res.status);
    const body = await res.json();
    jwksCache = { tid, keys: body.keys || [], fetchedAt: Date.now() };
  }
  const jwk = jwksCache.keys.find((k) => k.kid === kid);
  if (!jwk) throw new Error('Token key id not found in this tenant\'s current signing keys — possibly stale or from a different tenant.');
  return createPublicKey({ key: { kty: jwk.kty, n: jwk.n, e: jwk.e }, format: 'jwk' });
}

function b64urlToBuffer(s) { return Buffer.from(s, 'base64url'); }
function decodeJwtPart(s) { return JSON.parse(b64urlToBuffer(s).toString('utf8')); }

async function verifyCallerToken(authHeader) {
  const m = /^Bearer\s+(.+)$/i.exec(authHeader || '');
  if (!m) throw new Error('Missing bearer token.');
  const parts = m[1].split('.');
  if (parts.length !== 3) throw new Error('Not a valid JWT.');
  const [headerB64, payloadB64, sigB64] = parts;
  const header = decodeJwtPart(headerB64);
  const claims = decodeJwtPart(payloadB64);

  if (header.alg !== 'RS256') throw new Error('Unexpected token algorithm: ' + header.alg);

  const now = Math.floor(Date.now() / 1000);
  const skew = 120; // seconds, tolerate ordinary clock drift
  if (typeof claims.exp === 'number' && claims.exp + skew < now) throw new Error('Token has expired.');
  if (typeof claims.nbf === 'number' && claims.nbf - skew > now) throw new Error('Token is not yet valid.');

  const ownerTenantId = process.env.OWNER_TENANT_ID;
  if (!ownerTenantId) throw new Error('OWNER_TENANT_ID is not configured on this Lambda.');
  if (claims.tid !== ownerTenantId) throw new Error('Token was issued by a different tenant — refusing.');
  if (claims.iss !== 'https://login.microsoftonline.com/' + ownerTenantId + '/v2.0') {
    throw new Error('Unexpected token issuer.');
  }

  const expectedAudience = process.env.SIGN_APP_AUDIENCE;
  if (!expectedAudience) throw new Error('SIGN_APP_AUDIENCE is not configured on this Lambda.');
  if (claims.aud !== expectedAudience) throw new Error('Token was not issued for this endpoint.');

  const expectedScope = process.env.SIGN_APP_SCOPE_NAME || 'Sign.Entitlement';
  const grantedScopes = String(claims.scp || '').split(/\s+/).filter(Boolean);
  if (!grantedScopes.includes(expectedScope)) throw new Error('Token does not carry the required "' + expectedScope + '" scope.');

  const publicKey = await getSigningKey(claims.tid, header.kid);
  const signingInput = Buffer.from(headerB64 + '.' + payloadB64);
  const signature = b64urlToBuffer(sigB64);
  const ok = cryptoVerify('RSA-SHA256', signingInput, publicKey, signature);
  if (!ok) throw new Error('Token signature does not verify.');

  return claims;
}

/* ============== Entitlement payload ==============
   Same shape and same bundle-expansion behaviour as
   tools/issue-entitlement.mjs's `issue` command, so a file signed here
   is indistinguishable from one signed by hand — the whole point of
   this endpoint is to be a faster path to the SAME result, never a
   different one. */
async function buildSignedActivation(tenantId, frameworks, type, expiry) {
  if (!tenantId) throw new Error('tenantId is required.');
  if (ENTITLEMENT_TYPES.indexOf(type) === -1) throw new Error('type must be one of: ' + ENTITLEMENT_TYPES.join(', '));
  if (type === 'partner') throw new Error('This endpoint does not issue partner-type files — use the CLI with --i-know for that, deliberately out of band from routine client issuance.');
  if (!expiry || !/^\d{4}-\d{2}-\d{2}$/.test(expiry)) throw new Error('expiry is required, format YYYY-MM-DD.');

  let resolvedFrameworks;
  if (type === 'demo') {
    resolvedFrameworks = VALID_FRAMEWORKS.slice(); // demo grants everything, same as the CLI's --type demo
  } else {
    const requested = Array.isArray(frameworks) ? frameworks : [];
    if (!requested.length) throw new Error('frameworks is required for a client-type activation.');
    const bad = requested.filter((f) => VALID_FRAMEWORKS.indexOf(f) === -1);
    if (bad.length) throw new Error('Unknown framework id(s): ' + bad.join(', '));
    const expanded = new Set(requested);
    Object.keys(FRAMEWORK_BUNDLES).forEach((bundleId) => {
      if (expanded.has(bundleId)) FRAMEWORK_BUNDLES[bundleId].forEach((dep) => expanded.add(dep));
    });
    resolvedFrameworks = Array.from(expanded).sort();
  }

  const privJwk = JSON.parse(process.env.ENTITLEMENT_PRIVATE_KEY_JWK);
  const moduleKeysAll = JSON.parse(process.env.MODULE_KEYS_JSON || '{}');
  const privateKey = await webcrypto.subtle.importKey('jwk', privJwk, { name: 'Ed25519' }, false, ['sign']);

  const premiumRequested = resolvedFrameworks.filter((f) => f !== 'iso27001');
  const moduleKeys = {};
  const missingKeys = [];
  premiumRequested.forEach((f) => { if (moduleKeysAll[f]) moduleKeys[f] = moduleKeysAll[f]; else missingKeys.push(f); });
  if (missingKeys.length) {
    throw new Error('Module key(s) missing for: ' + missingKeys.join(', ') + ' — run "keygen-modules" and redeploy this Lambda\'s MODULE_KEYS_JSON before issuing these frameworks.');
  }

  const payload = {
    tenantId,
    type,
    frameworks: resolvedFrameworks,
    issuedAt: new Date().toISOString().slice(0, 10),
    expiry,
    graceDays: GRACE_DAYS,
    moduleKeys
  };
  const signature = await signEntitlementPayload(privateKey, payload);
  return { payload, signature };
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
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json'
  };

  if (event.requestContext?.http?.method === 'OPTIONS' || event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders, body: '' };
  }

  try {
    const authHeader = event.headers?.authorization || event.headers?.Authorization;
    await verifyCallerToken(authHeader);

    const body = JSON.parse(event.body || '{}');
    const file = await buildSignedActivation(
      String(body.tenantId || '').trim(),
      body.frameworks,
      body.type || 'client',
      String(body.expiry || '').trim()
    );

    // Matches exactly what owner.js's partnerSignViaEndpoint() expects
    // back — {payload, signature} — which it then independently
    // verifies against config.js's own public key before ever trusting
    // it, same as a pasted activation file.
    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify(file) };
  } catch (err) {
    console.error('Sign handler error:', err);
    // Deliberately generic on auth failures — "Missing bearer token" vs
    // "Token signature does not verify" vs "wrong tenant" all collapse
    // to the same message client-side, so a probing caller learns
    // nothing about which check they failed. The real reason is still
    // in CloudWatch for you to read.
    const authFailure = /token|bearer|tenant|scope|audience|issuer/i.test(err.message || '');
    return {
      statusCode: authFailure ? 401 : 400,
      headers: corsHeaders,
      body: JSON.stringify({ error: authFailure ? 'Not authorized to use this endpoint.' : (err.message || 'Could not sign this activation.') })
    };
  }
};
