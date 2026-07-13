// Tests for the two-store activation persistence design (localStorage +
// tenant Settings-list cache) added to fix the "forgotten activation" bug
// documented in OWNER-AUDIT.md. app.js itself isn't importable under Node
// (it's a browser-only IIFE tied to window/document), so these tests cover
// the PURE decision logic the fix actually depends on:
//   - lib.js's reconcileActivationSources() — which of several already-
//     verified candidates wins, and which stores are stale.
//   - the full sign -> verify -> evaluate pipeline (reused from
//     lib.test.mjs's pattern) feeding that decision, including a tampered
//     blob rejected after being read back out of "storage."
// A tiny in-memory object stands in for localStorage across simulated
// reloads/restarts — from the pure-logic side, "the page reloaded" and
// "the browser restarted" are indistinguishable (both are just "read back
// whatever a previous call wrote"), so one fake covers both scenarios.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import CheckpointLib from '../public/checkpoint/lib.js';

const { verifyEntitlementSignature, signEntitlementPayload, evaluateEntitlement, reconcileActivationSources } = CheckpointLib;

function makeFakeBrowserStorage() {
  var data = {};
  return {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null; },
    setItem: function (k, v) { data[k] = String(v); },
    removeItem: function (k) { delete data[k]; }
  };
}

async function issue(payload, privateKey) {
  return { payload: payload, signature: await signEntitlementPayload(webcrypto.subtle, privateKey, payload) };
}
function rawOf(file) { return JSON.stringify(file); }

/* Stand-in for app.js's verifyActivationRaw() — same three steps (parse,
   Ed25519 signature, tenant match via evaluateEntitlement), built only
   from the same pure lib.js primitives app.js itself calls. */
async function verifyRaw(rawText, acceptTenantIds, pub, today) {
  var parsed;
  try { parsed = JSON.parse(rawText); } catch (e) { return { ok: false, reason: 'not JSON' }; }
  if (!parsed || !parsed.payload || !parsed.signature) return { ok: false, reason: 'missing payload/signature' };
  var sigOk = await verifyEntitlementSignature(webcrypto.subtle, pub, parsed.payload, parsed.signature);
  if (!sigOk) return { ok: false, reason: 'signature verification failed' };
  var evalResult = evaluateEntitlement(parsed.payload, acceptTenantIds, today);
  if (evalResult.status === 'mismatch') return { ok: false, reason: 'wrong tenant' };
  return { ok: true, raw: rawText, evalResult: evalResult };
}

describe('reconcileActivationSources() — picking a winner among verified candidates', () => {
  test('no candidates at all -> no winner, nothing stale', () => {
    var r = reconcileActivationSources([]);
    assert.equal(r.winner, null);
    assert.deepEqual(r.staleSources, []);
  });

  test('only a failed candidate -> no winner (never trusts an unverified store)', () => {
    var r = reconcileActivationSources([{ source: 'tenant', raw: 'garbage', ok: false }]);
    assert.equal(r.winner, null);
  });

  test('exactly one verified candidate wins trivially', () => {
    var r = reconcileActivationSources([{ source: 'local', raw: 'A', ok: true, evalResult: { issuedAt: '2026-01-01' } }]);
    assert.equal(r.winner.source, 'local');
    assert.deepEqual(r.staleSources, []);
  });

  test('two verified candidates: the later issuedAt wins, the older is reported stale', () => {
    var older = { source: 'local', raw: 'OLD', ok: true, evalResult: { issuedAt: '2026-01-01' } };
    var newer = { source: 'tenant', raw: 'NEW', ok: true, evalResult: { issuedAt: '2026-06-01' } };
    var r = reconcileActivationSources([older, newer]);
    assert.equal(r.winner.source, 'tenant');
    assert.equal(r.winner.raw, 'NEW');
    assert.deepEqual(r.staleSources, ['local']);
  });

  test('order of candidates passed in does not affect the outcome', () => {
    var older = { source: 'local', raw: 'OLD', ok: true, evalResult: { issuedAt: '2026-01-01' } };
    var newer = { source: 'tenant', raw: 'NEW', ok: true, evalResult: { issuedAt: '2026-06-01' } };
    var r = reconcileActivationSources([newer, older]);
    assert.equal(r.winner.raw, 'NEW');
  });

  test('byte-identical raw text across both stores is never reported stale', () => {
    var a = { source: 'local', raw: 'SAME', ok: true, evalResult: { issuedAt: '2026-01-01' } };
    var b = { source: 'tenant', raw: 'SAME', ok: true, evalResult: { issuedAt: '2026-01-01' } };
    var r = reconcileActivationSources([a, b]);
    assert.deepEqual(r.staleSources, []);
  });
});

describe('reload persistence (localStorage)', () => {
  test('an activation verified and written this session is still there, unchanged, on a simulated reload', async () => {
    var kp = await webcrypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
    var pub = CheckpointLib.bytesToBase64(new Uint8Array(await webcrypto.subtle.exportKey('raw', kp.publicKey)));
    var file = await issue({ tenantId: 't-1', frameworks: ['iso27001', 'soc2'], issuedAt: '2026-01-01', expiry: '2027-01-01' }, kp.privateKey);
    var raw = rawOf(file);

    var browser = makeFakeBrowserStorage();
    browser.setItem('cpActivation:v1:t-1', raw); // "on successful verification, store immediately"

    // --- simulated reload: fresh read, fresh re-verify, nothing cached trusted ---
    var readBack = browser.getItem('cpActivation:v1:t-1');
    var result = await verifyRaw(readBack, 't-1', pub, '2026-06-01');
    assert.equal(result.ok, true);
    assert.equal(result.evalResult.status, 'valid');
  });
});

describe('browser-restart persistence (localStorage)', () => {
  test('localStorage (unlike sessionStorage) survives a simulated full browser restart', async () => {
    var kp = await webcrypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
    var pub = CheckpointLib.bytesToBase64(new Uint8Array(await webcrypto.subtle.exportKey('raw', kp.publicKey)));
    var file = await issue({ tenantId: 't-1', frameworks: ['iso27001'], issuedAt: '2026-01-01', expiry: '2027-01-01' }, kp.privateKey);
    var raw = rawOf(file);

    var browser = makeFakeBrowserStorage();
    browser.setItem('cpActivation:v1:t-1', raw);

    // Nothing about a "restart" changes what's in localStorage (that's
    // the whole point vs. sessionStorage) — the persisted object is
    // simply handed to a fresh verification pass exactly as-is.
    var afterRestart = browser.getItem('cpActivation:v1:t-1');
    assert.equal(afterRestart, raw);
    var result = await verifyRaw(afterRestart, ['t-1'], pub, '2026-06-01');
    assert.equal(result.ok, true);
  });

  test('a DIFFERENT tenant signed into the same browser does not see this tenant\'s cached activation (separate storage keys)', async () => {
    var kp = await webcrypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
    var file = await issue({ tenantId: 't-1', frameworks: ['iso27001'], issuedAt: '2026-01-01', expiry: '2027-01-01' }, kp.privateKey);
    var browser = makeFakeBrowserStorage();
    browser.setItem('cpActivation:v1:t-1', rawOf(file));
    assert.equal(browser.getItem('cpActivation:v1:t-2'), null);
  });
});

describe('unprovisioned-tenant bootstrap', () => {
  test('a locally-verified activation alone is enough to produce a winner with no tenant-store candidate at all', async () => {
    var kp = await webcrypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
    var pub = CheckpointLib.bytesToBase64(new Uint8Array(await webcrypto.subtle.exportKey('raw', kp.publicKey)));
    var file = await issue({ tenantId: 'brand-new-tenant', frameworks: ['iso27001', 'soc2'], issuedAt: '2026-01-01', expiry: '2027-01-01' }, kp.privateKey);
    var raw = rawOf(file);

    // No SharePoint Settings list exists yet for this tenant — simulated
    // by simply never producing a 'tenant' candidate at all.
    var localResult = await verifyRaw(raw, 'brand-new-tenant', pub, '2026-06-01');
    var reconciled = reconcileActivationSources([
      { source: 'local', raw: raw, ok: localResult.ok, evalResult: localResult.evalResult }
    ]);
    assert.ok(reconciled.winner, 'a local-only candidate must be enough to authorise provisioning');
    assert.equal(reconciled.winner.source, 'local');
    // This is exactly the boolean app.js's ensureLists()/
    // assertActivationAuthorizesProvisioning() gates list creation on —
    // no dependency on any SharePoint state existing yet.
    var authorizesProvisioning = !!reconciled.winner;
    assert.equal(authorizesProvisioning, true);
  });

  test('an unrecoverable tenant-store AND an unrecoverable local store together correctly produce no winner', async () => {
    var reconciled = reconcileActivationSources([
      { source: 'local', raw: 'corrupt-local', ok: false },
      { source: 'tenant', raw: 'corrupt-tenant', ok: false }
    ]);
    assert.equal(reconciled.winner, null);
  });
});

describe('domain-vs-GUID tenant matching, both directions', () => {
  test('payload issued against a GUID matches a tenant reporting [GUID, verified domains...]', () => {
    var r = evaluateEntitlement(
      { tenantId: 'a1b2c3d4-guid', frameworks: ['iso27001'], expiry: '2027-01-01' },
      ['a1b2c3d4-guid', 'contoso.com', 'contoso.onmicrosoft.com'],
      '2026-06-01'
    );
    assert.equal(r.status, 'valid');
  });

  test('payload issued against a verified domain matches a tenant reporting [GUID, verified domains...]', () => {
    var r = evaluateEntitlement(
      { tenantId: 'contoso.com', frameworks: ['iso27001'], expiry: '2027-01-01' },
      ['a1b2c3d4-guid', 'contoso.com', 'contoso.onmicrosoft.com'],
      '2026-06-01'
    );
    assert.equal(r.status, 'valid');
  });

  test('domain match is case-insensitive in both directions', () => {
    var r1 = evaluateEntitlement({ tenantId: 'Contoso.COM', frameworks: ['iso27001'], expiry: '2027-01-01' }, ['contoso.com'], '2026-06-01');
    assert.equal(r1.status, 'valid');
    var r2 = evaluateEntitlement({ tenantId: 'contoso.com', frameworks: ['iso27001'], expiry: '2027-01-01' }, ['CONTOSO.COM'], '2026-06-01');
    assert.equal(r2.status, 'valid');
  });

  test('neither a GUID nor any verified domain matches -> mismatch, not a false valid', () => {
    var r = evaluateEntitlement(
      { tenantId: 'someone-elses-guid', frameworks: ['iso27001'], expiry: '2027-01-01' },
      ['a1b2c3d4-guid', 'contoso.com'],
      '2026-06-01'
    );
    assert.equal(r.status, 'mismatch');
  });

  test('an empty acceptTenantIds list (tenant-identity lookup failed) never matches, regardless of the real tenant', () => {
    var r = evaluateEntitlement({ tenantId: 'contoso.com', frameworks: ['iso27001'], expiry: '2027-01-01' }, [], '2026-06-01');
    assert.equal(r.status, 'mismatch');
  });
});

describe('tampered blob rejected after storage', () => {
  test('a signed blob written to storage, then corrupted at rest, fails verification on the next read', async () => {
    var kp = await webcrypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
    var pub = CheckpointLib.bytesToBase64(new Uint8Array(await webcrypto.subtle.exportKey('raw', kp.publicKey)));
    var file = await issue({ tenantId: 't-1', frameworks: ['iso27001', 'soc2'], issuedAt: '2026-01-01', expiry: '2027-01-01' }, kp.privateKey);
    var raw = rawOf(file);

    var browser = makeFakeBrowserStorage();
    browser.setItem('cpActivation:v1:t-1', raw);

    // Verifies fine as originally stored.
    var before = await verifyRaw(browser.getItem('cpActivation:v1:t-1'), 't-1', pub, '2026-06-01');
    assert.equal(before.ok, true);

    // Simulate tampering with the bytes at rest (e.g. a corrupted write,
    // or someone editing the stored value directly) — flip one character
    // inside the payload JSON, re-store it, read it back.
    var tamperedRaw = raw.replace('"soc2"', '"essential8"');
    assert.notEqual(tamperedRaw, raw, 'the tamper actually needs to change something');
    browser.setItem('cpActivation:v1:t-1', tamperedRaw);

    var after = await verifyRaw(browser.getItem('cpActivation:v1:t-1'), 't-1', pub, '2026-06-01');
    assert.equal(after.ok, false);
    assert.match(after.reason, /signature/i);
  });

  test('a tampered candidate never wins reconciliation even against a genuinely older, but valid, competitor', async () => {
    var kp = await webcrypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
    var pub = CheckpointLib.bytesToBase64(new Uint8Array(await webcrypto.subtle.exportKey('raw', kp.publicKey)));
    var goodOld = await issue({ tenantId: 't-1', frameworks: ['iso27001'], issuedAt: '2025-01-01', expiry: '2027-01-01' }, kp.privateKey);
    var goodOldRaw = rawOf(goodOld);
    var tamperedNewRaw = rawOf(goodOld).replace('2025-01-01', '2026-06-01'); // forged "later" issuedAt, breaks signature

    var oldResult = await verifyRaw(goodOldRaw, 't-1', pub, '2026-06-01');
    var tamperedResult = await verifyRaw(tamperedNewRaw, 't-1', pub, '2026-06-01');
    assert.equal(oldResult.ok, true);
    assert.equal(tamperedResult.ok, false);

    var reconciled = reconcileActivationSources([
      { source: 'local', raw: goodOldRaw, ok: oldResult.ok, evalResult: oldResult.evalResult },
      { source: 'tenant', raw: tamperedNewRaw, ok: tamperedResult.ok, evalResult: tamperedResult.evalResult }
    ]);
    assert.equal(reconciled.winner.source, 'local');
    assert.equal(reconciled.winner.raw, goodOldRaw);
  });
});

describe('expired-in-grace behaviour, combined with reconciliation', () => {
  test('a candidate in its grace period still wins over a non-existent competitor and stays usable (not expired)', async () => {
    var kp = await webcrypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
    var pub = CheckpointLib.bytesToBase64(new Uint8Array(await webcrypto.subtle.exportKey('raw', kp.publicKey)));
    var file = await issue({ tenantId: 't-1', frameworks: ['iso27001', 'soc2'], issuedAt: '2025-01-01', expiry: '2026-06-01', graceDays: 14 }, kp.privateKey);
    var raw = rawOf(file);
    var result = await verifyRaw(raw, 't-1', pub, '2026-06-10'); // 9 days past expiry, within 14-day grace
    assert.equal(result.ok, true);
    assert.equal(result.evalResult.status, 'grace');
    var reconciled = reconcileActivationSources([{ source: 'local', raw: raw, ok: result.ok, evalResult: result.evalResult }]);
    assert.equal(reconciled.winner.evalResult.status, 'grace');
  });

  test('past the grace window, the candidate still verifies (ok:true) but reports status "expired" — reconciliation still picks it (READONLY, not "missing")', async () => {
    var kp = await webcrypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
    var pub = CheckpointLib.bytesToBase64(new Uint8Array(await webcrypto.subtle.exportKey('raw', kp.publicKey)));
    var file = await issue({ tenantId: 't-1', frameworks: ['iso27001'], issuedAt: '2025-01-01', expiry: '2026-06-01', graceDays: 14 }, kp.privateKey);
    var raw = rawOf(file);
    var result = await verifyRaw(raw, 't-1', pub, '2026-06-20'); // past the 14-day grace window
    assert.equal(result.ok, true);
    assert.equal(result.evalResult.status, 'expired');
    var reconciled = reconcileActivationSources([{ source: 'tenant', raw: raw, ok: result.ok, evalResult: result.evalResult }]);
    assert.ok(reconciled.winner, 'an expired-but-signed activation is still a winner — the app forces read-only, it never treats this as "missing"');
    assert.equal(reconciled.winner.evalResult.status, 'expired');
  });

  test('a fresh renewal (later issuedAt, valid) wins over a stale expired candidate from the other store', async () => {
    var kp = await webcrypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
    var pub = CheckpointLib.bytesToBase64(new Uint8Array(await webcrypto.subtle.exportKey('raw', kp.publicKey)));
    var expiredFile = await issue({ tenantId: 't-1', frameworks: ['iso27001'], issuedAt: '2025-01-01', expiry: '2026-01-01', graceDays: 14 }, kp.privateKey);
    var renewedFile = await issue({ tenantId: 't-1', frameworks: ['iso27001', 'soc2'], issuedAt: '2026-05-01', expiry: '2027-05-01' }, kp.privateKey);
    var today = '2026-06-01';
    var expiredResult = await verifyRaw(rawOf(expiredFile), 't-1', pub, today);
    var renewedResult = await verifyRaw(rawOf(renewedFile), 't-1', pub, today);
    var reconciled = reconcileActivationSources([
      { source: 'local', raw: rawOf(expiredFile), ok: expiredResult.ok, evalResult: expiredResult.evalResult },
      { source: 'tenant', raw: rawOf(renewedFile), ok: renewedResult.ok, evalResult: renewedResult.evalResult }
    ]);
    assert.equal(reconciled.winner.source, 'tenant');
    assert.equal(reconciled.winner.evalResult.status, 'valid');
    assert.deepEqual(reconciled.staleSources, ['local']);
  });
});
