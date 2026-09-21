/* Signs and verifies the short-lived, per-vendor tokens behind the
 * "vendor self-service questionnaire" links this Function App emails
 * once a practitioner requests one from the browser app (see
 * VendorQuestionnaireSubmit/index.js and PostureMonitor's
 * sendVendorQuestionnaireLinks()). A vendor contact clicking the link
 * gets a scoped form for exactly ONE vendor, with no MSAL sign-in and
 * no Graph scope consent — the token itself is the entire authorisation
 * boundary, so it deliberately carries nothing but what's needed to
 * identify that one vendor, plus an expiry.
 *
 * Deliberately its own module with its own secret (VENDOR_LINK_SECRET),
 * not a reuse of evidenceToken.js/EVIDENCE_LINK_SECRET — a fresh key per
 * new trust boundary is the convention evidenceToken.js's own header
 * comment already documents (see DEPLOY-SIGN.md), and reusing one HMAC
 * key across two unrelated capabilities ("may report progress on one
 * action" vs. "may answer one vendor's security questionnaire") would
 * make a leaked token from one readable as though it were the other's,
 * even though nothing here would actually accept it — better that the
 * two never share a key at all.
 *
 * Structurally identical to evidenceToken.js otherwise: same HMAC-SHA256
 * scheme, same base64url encoding, same never-throws verify contract.
 * See that file's header for the full reasoning (single Function mints
 * and verifies every token, so a shared symmetric secret is simpler and
 * just as safe as asymmetric signing would be here).
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

/* vendorItemId: the SharePoint list item id (numeric string) of the
   Vendor — NOT its human RefId (e.g. "VEN-002"), for the same reason
   evidenceToken.js uses the action's item id: it's what a Graph
   GET/PATCH against /items/{id} actually needs, and unlike RefId it's
   guaranteed unique and immutable for the row's lifetime.
   ttlDays: 14, shorter than the evidence link's 30 — a vendor
   questionnaire is a one-off ask with no due-date urgency implied by
   the register the way an overdue action has, so there's less reason
   to keep a stale link alive for a month; a vendor who hasn't answered
   in two weeks gets a fresh request, not a link quietly still working
   from a forgotten email. */
function mintVendorToken(vendorItemId, secret, ttlDays) {
  if (!vendorItemId || !secret) throw new Error('mintVendorToken requires a vendor item id and a secret');
  var days = ttlDays === undefined ? 14 : ttlDays;
  var exp = Math.floor(Date.now() / 1000) + Math.round(days * 86400);
  var payloadB64 = base64url(Buffer.from(JSON.stringify({ v: 1, vid: String(vendorItemId), exp: exp })));
  return payloadB64 + '.' + sign(payloadB64, secret);
}

/* Returns { valid: true, vendorItemId } or { valid: false, reason }.
   Never throws — a malformed, tampered, or expired token is exactly as
   ordinary here as a wrong password, not an exceptional condition. */
function verifyVendorToken(token, secret) {
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
  if (!payload || payload.v !== 1 || !payload.vid) return { valid: false, reason: 'malformed token' };
  if (typeof payload.exp !== 'number' || Math.floor(Date.now() / 1000) > payload.exp) return { valid: false, reason: 'expired' };
  return { valid: true, vendorItemId: payload.vid };
}

module.exports = { mintVendorToken, verifyVendorToken };
