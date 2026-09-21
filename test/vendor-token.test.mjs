// Tests for azure/lib/vendorToken.js — the whole authorisation boundary
// behind the vendor self-service questionnaire links PostureMonitor
// emails once a practitioner requests one. No MSAL sign-in, no Graph
// scope consent stands between a vendor contact and the
// VendorQuestionnaireSubmit endpoint: this token is the entire gate.
// Deliberately the same shape of test file as evidence-token.test.mjs —
// this is the sibling token module, same reasoning for why getting its
// signature/expiry checks wrong is a real security bug.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { mintVendorToken, verifyVendorToken } = require('../public/checkpoint/azure/lib/vendorToken.js');

const SECRET = 'test-vendor-secret-do-not-use-in-prod';

describe('mintVendorToken() / verifyVendorToken() — round trip', () => {
  test('a freshly minted token verifies and recovers the same vendor item id', () => {
    const token = mintVendorToken('7', SECRET, 14);
    const result = verifyVendorToken(token, SECRET);
    assert.equal(result.valid, true);
    assert.equal(result.vendorItemId, '7');
  });

  test('a numeric vendor item id round-trips as a string', () => {
    const token = mintVendorToken(7, SECRET, 14);
    const result = verifyVendorToken(token, SECRET);
    assert.equal(result.vendorItemId, '7');
  });

  test('mintVendorToken throws on a missing vendor item id or secret — these are programmer errors, not user input', () => {
    assert.throws(() => mintVendorToken('', SECRET, 14));
    assert.throws(() => mintVendorToken('7', '', 14));
  });
});

describe('verifyVendorToken() — tampering and forgery', () => {
  test('a token signed with a different secret is rejected', () => {
    const token = mintVendorToken('7', SECRET, 14);
    assert.equal(verifyVendorToken(token, 'a-different-secret').valid, false);
  });

  test('flipping one character in the payload invalidates the signature', () => {
    const token = mintVendorToken('7', SECRET, 14);
    const [payload, sig] = token.split('.');
    const tampered = (payload[0] === 'a' ? 'b' : 'a') + payload.slice(1) + '.' + sig;
    assert.equal(verifyVendorToken(tampered, SECRET).valid, false);
  });

  test('flipping one character in the signature invalidates it', () => {
    const token = mintVendorToken('7', SECRET, 14);
    const [payload, sig] = token.split('.');
    const tampered = payload + '.' + (sig[0] === 'a' ? 'b' : 'a') + sig.slice(1);
    assert.equal(verifyVendorToken(tampered, SECRET).valid, false);
  });

  test('a token minted for one vendor item id cannot be edited to point at another', () => {
    const token = mintVendorToken('7', SECRET, 14);
    const forged = mintVendorToken('8', SECRET, 14);
    const [, sig] = token.split('.');
    const [forgedPayload] = forged.split('.');
    assert.equal(verifyVendorToken(forgedPayload + '.' + sig, SECRET).valid, false);
  });

  test('garbage, empty, or malformed tokens are rejected without throwing', () => {
    assert.equal(verifyVendorToken('', SECRET).valid, false);
    assert.equal(verifyVendorToken('not-a-token', SECRET).valid, false);
    assert.equal(verifyVendorToken('a.b.c', SECRET).valid, false);
    assert.equal(verifyVendorToken(null, SECRET).valid, false);
    assert.equal(verifyVendorToken(undefined, SECRET).valid, false);
  });

  test('a token with no secret configured is always rejected, never silently accepted', () => {
    const token = mintVendorToken('7', SECRET, 14);
    assert.equal(verifyVendorToken(token, '').valid, false);
    assert.equal(verifyVendorToken(token, undefined).valid, false);
  });

  test('an evidence-style payload (aid instead of vid) is rejected — the two token kinds must never be interchangeable', () => {
    const crypto = require('crypto');
    function b64url(buf) { return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
    const exp = Math.floor(Date.now() / 1000) + 86400;
    const payload = b64url(Buffer.from(JSON.stringify({ v: 1, aid: '7', exp })));
    const sig = b64url(crypto.createHmac('sha256', SECRET).update(payload).digest());
    assert.equal(verifyVendorToken(payload + '.' + sig, SECRET).valid, false);
  });
});

describe('verifyVendorToken() — expiry', () => {
  test('a token minted with a negative TTL is already expired', () => {
    const token = mintVendorToken('7', SECRET, -1);
    const result = verifyVendorToken(token, SECRET);
    assert.equal(result.valid, false);
    assert.equal(result.reason, 'expired');
  });

  test('an unspecified TTL defaults to a real window (14 days), not zero', () => {
    const token = mintVendorToken('7', SECRET);
    assert.equal(verifyVendorToken(token, SECRET).valid, true);
  });
});
