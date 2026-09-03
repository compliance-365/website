/* Signs and verifies the short-lived, per-action tokens behind the
 * "owner-driven evidence" links this Function App emails to an
 * overdue action's OwnerEmail (see PostureMonitor's runGovernanceSweep()
 * and the EvidenceSubmit function). An owner clicking the link gets a
 * scoped form for exactly ONE action, with no MSAL sign-in and no Graph
 * scope consent — the token itself is the entire authorisation boundary,
 * so it deliberately carries nothing but what's needed to identify that
 * one action, plus an expiry.
 *
 * HMAC-SHA256 with a symmetric secret (EVIDENCE_LINK_SECRET, an app
 * setting auto-generated at deploy time — see azuredeploy.json), not the
 * Ed25519 signing lib.js/lambda/*.js use for entitlement files. Those
 * sign once, centrally (a Compliance365-held private key), and verify in
 * many browsers that must never hold that key — asymmetric signing is
 * the point. Here the SAME Function mints and verifies every token, so
 * there is only ever one party that needs the secret; a shared HMAC key
 * is simpler and just as safe for that shape of problem, and reusing the
 * entitlement key pair would conflate two unrelated trust boundaries
 * ("licensed to use the whole app" vs. "may post evidence to one
 * action") — see DEPLOY-SIGN.md's own convention of a fresh key per new
 * trust boundary.
 *
 * Deliberately excludes the site id: this Function always operates
 * against ITS OWN configured site (SP_HOSTNAME/SP_SITE_PATH env vars,
 * resolved fresh on every run by resolveSiteId()), so a token can never
 * be used to point the Function at a different site even if tampered
 * with — there is simply nowhere in the payload for an attacker to put
 * one.
 */

const crypto = require('crypto');

function base64url(buf) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function base64urlToBuffer(str) {
  const pad = str.length % 4 === 0 ? '' : '='.repeat(4 - (str.length % 4));
  return Buffer.from(str.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64');
}

function sign(payloadB64, secret) {
  return base64url(crypto.createHmac('sha256', secret).update(payloadB64).digest());
}

/* actionItemId: the SharePoint list item id (numeric string) of the
   Action — NOT its human RefId (e.g. "ACT-003"), since the item id is
   what a Graph PATCH/GET against /items/{id} actually needs, and unlike
   RefId it's guaranteed unique and immutable for the row's lifetime.
   ttlDays: how long the link stays valid — the owner may not act on it
   the moment it lands, and this Function only ever chases an owner once
   per alert (never nightly), so this needs real headroom; 30 days
   matches the typical action due-date window this link already implies
   urgency around. */
function mintEvidenceToken(actionItemId, secret, ttlDays) {
  if (!actionItemId || !secret) throw new Error('mintEvidenceToken requires an action item id and a secret');
  var days = ttlDays === undefined ? 30 : ttlDays;
  var exp = Math.floor(Date.now() / 1000) + Math.round(days * 86400);
  var payloadB64 = base64url(Buffer.from(JSON.stringify({ v: 1, aid: String(actionItemId), exp: exp })));
  return payloadB64 + '.' + sign(payloadB64, secret);
}

/* Returns { valid: true, actionItemId } or { valid: false, reason }.
   Never throws — a malformed, tampered, or expired token is exactly as
   ordinary here as a wrong password, not an exceptional condition. */
function verifyEvidenceToken(token, secret) {
  if (!token || typeof token !== 'string' || !secret) return { valid: false, reason: 'missing token' };
  var parts = token.split('.');
  if (parts.length !== 2) return { valid: false, reason: 'malformed token' };
  var payloadB64 = parts[0], sigB64 = parts[1];
  var expectedSig;
  try { expectedSig = sign(payloadB64, secret); } catch (e) { return { valid: false, reason: 'malformed token' }; }
  var a = base64urlToBuffer(sigB64), b = base64urlToBuffer(expectedSig);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return { valid: false, reason: 'invalid signature' };
  var payload;
  try { payload = JSON.parse(base64urlToBuffer(payloadB64).toString('utf8')); } catch (e) { return { valid: false, reason: 'malformed token' }; }
  if (!payload || payload.v !== 1 || !payload.aid) return { valid: false, reason: 'malformed token' };
  if (typeof payload.exp !== 'number' || Math.floor(Date.now() / 1000) > payload.exp) return { valid: false, reason: 'expired' };
  return { valid: true, actionItemId: payload.aid };
}

module.exports = { mintEvidenceToken, verifyEvidenceToken };
