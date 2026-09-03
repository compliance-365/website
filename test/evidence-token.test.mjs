// Tests for azure/lib/evidenceToken.js — the whole authorisation
// boundary behind the owner-driven evidence links the scheduled monitor
// emails to an overdue action's OwnerEmail. No MSAL sign-in, no Graph
// scope consent stands between an owner and the evidence-submission
// endpoint: this token is the entire gate, so its signature and expiry
// checks getting it wrong is a real security bug, not a cosmetic one.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { mintEvidenceToken, verifyEvidenceToken } = require('../public/checkpoint/azure/lib/evidenceToken.js');

const SECRET = 'test-secret-do-not-use-in-prod';

describe('mintEvidenceToken() / verifyEvidenceToken() — round trip', () => {
  test('a freshly minted token verifies and recovers the same action item id', () => {
    const token = mintEvidenceToken('42', SECRET, 30);
    const result = verifyEvidenceToken(token, SECRET);
    assert.equal(result.valid, true);
    assert.equal(result.actionItemId, '42');
  });

  test('a numeric action item id round-trips as a string', () => {
    const token = mintEvidenceToken(42, SECRET, 30);
    const result = verifyEvidenceToken(token, SECRET);
    assert.equal(result.actionItemId, '42');
  });

  test('mintEvidenceToken throws on a missing action item id or secret — these are programmer errors, not user input', () => {
    assert.throws(() => mintEvidenceToken('', SECRET, 30));
    assert.throws(() => mintEvidenceToken('42', '', 30));
  });
});

describe('verifyEvidenceToken() — tampering and forgery', () => {
  test('a token signed with a different secret is rejected', () => {
    const token = mintEvidenceToken('42', SECRET, 30);
    const result = verifyEvidenceToken(token, 'a-different-secret');
    assert.equal(result.valid, false);
  });

  test('flipping one character in the payload invalidates the signature', () => {
    const token = mintEvidenceToken('42', SECRET, 30);
    const [payload, sig] = token.split('.');
    const tampered = (payload[0] === 'a' ? 'b' : 'a') + payload.slice(1) + '.' + sig;
    assert.equal(verifyEvidenceToken(tampered, SECRET).valid, false);
  });

  test('flipping one character in the signature invalidates it', () => {
    const token = mintEvidenceToken('42', SECRET, 30);
    const [payload, sig] = token.split('.');
    const tampered = payload + '.' + (sig[0] === 'a' ? 'b' : 'a') + sig.slice(1);
    assert.equal(verifyEvidenceToken(tampered, SECRET).valid, false);
  });

  test('a token minted for one action item id cannot be edited to point at another', () => {
    const token = mintEvidenceToken('42', SECRET, 30);
    const forged = mintEvidenceToken('43', SECRET, 30);
    // swapping in the forged payload with the original signature must fail
    const [, sig] = token.split('.');
    const [forgedPayload] = forged.split('.');
    assert.equal(verifyEvidenceToken(forgedPayload + '.' + sig, SECRET).valid, false);
  });

  test('garbage, empty, or malformed tokens are rejected without throwing', () => {
    assert.equal(verifyEvidenceToken('', SECRET).valid, false);
    assert.equal(verifyEvidenceToken('not-a-token', SECRET).valid, false);
    assert.equal(verifyEvidenceToken('a.b.c', SECRET).valid, false);
    assert.equal(verifyEvidenceToken(null, SECRET).valid, false);
    assert.equal(verifyEvidenceToken(undefined, SECRET).valid, false);
    assert.equal(verifyEvidenceToken('YWJj.ZGVm', SECRET).valid, false, 'well-formed base64 but not real JSON/HMAC');
  });

  test('a token with no secret configured is always rejected, never silently accepted', () => {
    const token = mintEvidenceToken('42', SECRET, 30);
    assert.equal(verifyEvidenceToken(token, '').valid, false);
    assert.equal(verifyEvidenceToken(token, undefined).valid, false);
  });
});

describe('verifyEvidenceToken() — expiry', () => {
  test('a token minted with a negative TTL is already expired', () => {
    const token = mintEvidenceToken('42', SECRET, -1);
    const result = verifyEvidenceToken(token, SECRET);
    assert.equal(result.valid, false);
    assert.equal(result.reason, 'expired');
  });

  test('an unspecified TTL defaults to a real window (30 days), not zero', () => {
    const token = mintEvidenceToken('42', SECRET);
    assert.equal(verifyEvidenceToken(token, SECRET).valid, true);
  });

  test('a hand-forged token with exp far in the past is rejected even with a correct signature', () => {
    const crypto = require('crypto');
    function b64url(buf) { return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
    const payload = b64url(Buffer.from(JSON.stringify({ v: 1, aid: '42', exp: 1000 })));
    const sig = b64url(crypto.createHmac('sha256', SECRET).update(payload).digest());
    const result = verifyEvidenceToken(payload + '.' + sig, SECRET);
    assert.equal(result.valid, false);
    assert.equal(result.reason, 'expired');
  });
});
