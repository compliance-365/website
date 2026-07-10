// Zero-dependency tests for public/checkpoint/lib.js — the pure
// scoring/threshold logic that used to live only inside app.js's IIFE.
// Uses Node's built-in test runner and assert module; no framework, no
// devDependency to install or keep patched.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import CheckpointLib from '../public/checkpoint/lib.js';

const { band, residual, checkResult, score, readinessPct, suggestVendorCriticality, toCsv, buildZip,
  canonicalJson, verifyEntitlementSignature, signEntitlementPayload, evaluateEntitlement, addDaysToDateStr,
  daysBetweenDateStr, normalizeEntitlementType, isDevBypassActive,
  sha256Hex, encryptPack, decryptPack, validatePackShape } = CheckpointLib;

function randomKey() {
  return Buffer.from(webcrypto.getRandomValues(new Uint8Array(32))).toString('base64');
}

describe('band()', () => {
  test('Low for scores under 5', () => {
    assert.equal(band(1), 'Low');
    assert.equal(band(4), 'Low');
  });
  test('Medium for 5-9', () => {
    assert.equal(band(5), 'Medium');
    assert.equal(band(9), 'Medium');
  });
  test('High for 10-14', () => {
    assert.equal(band(10), 'High');
    assert.equal(band(14), 'High');
  });
  test('Critical for 15+', () => {
    assert.equal(band(15), 'Critical');
    assert.equal(band(25), 'Critical');
  });
});

describe('residual()', () => {
  test('no actions done -> inherent L/I unchanged', () => {
    const r = { L: 4, I: 4, actions: ['ACT-001', 'ACT-002'] };
    const actions = [{ id: 'ACT-001', status: 'Open' }, { id: 'ACT-002', status: 'In progress' }];
    assert.deepEqual(residual(r, actions), { L: 4, I: 4 });
  });
  test('each completed action reduces L by 1, floor 1', () => {
    const r = { L: 3, I: 5, actions: ['ACT-001', 'ACT-002', 'ACT-003'] };
    const actions = [
      { id: 'ACT-001', status: 'Done' }, { id: 'ACT-002', status: 'Done' }, { id: 'ACT-003', status: 'Open' }
    ];
    // 2 of 3 done -> L drops by 2 (floor 1), I unchanged since not ALL are done
    assert.deepEqual(residual(r, actions), { L: 1, I: 5 });
  });
  test('L never drops below 1 even with many completed actions', () => {
    const r = { L: 2, I: 3, actions: ['ACT-001', 'ACT-002', 'ACT-003', 'ACT-004'] };
    const actions = ['ACT-001', 'ACT-002', 'ACT-003', 'ACT-004'].map(id => ({ id, status: 'Done' }));
    // all 4 done -> L would be 2-4=-2, floored to 1; I drops by 1 since ALL actions done
    assert.deepEqual(residual(r, actions), { L: 1, I: 2 });
  });
  test('I only drops once every linked action is Done, floor 1', () => {
    const r = { L: 5, I: 1, actions: ['ACT-001'] };
    const actions = [{ id: 'ACT-001', status: 'Done' }];
    // I=1-1=0 floored to 1
    assert.deepEqual(residual(r, actions), { L: 4, I: 1 });
  });
  test('a risk with no linked actions never gets the all-done impact reduction', () => {
    const r = { L: 3, I: 4, actions: [] };
    assert.deepEqual(residual(r, []), { L: 3, I: 4 });
  });
});

describe('checkResult()', () => {
  test('scored:false always returns manual, regardless of scan state', () => {
    assert.equal(checkResult({ id: 'dlp', scored: false }, { lastResults: null }), 'manual');
    assert.equal(checkResult({ id: 'dlp', scored: false }, { lastResults: { dlp: 'fail' } }), 'manual');
  });
  test('no scan has ever run -> null', () => {
    assert.equal(checkResult({ id: 'mfa-all', scored: true }, { lastResults: null }), null);
  });
  test('returns the raw scan result once a scan has run', () => {
    const ctx = { lastResults: { 'mfa-all': 'review' } };
    assert.equal(checkResult({ id: 'mfa-all', scored: true }, ctx), 'review');
  });
  test('demo mode: a templated check flips to pass once every linked remediation action is Done', () => {
    const ctx = {
      lastResults: { legacy: 'fail' },
      isDemo: true,
      risks: [{ id: 'R-010', tpl: 'legacy', actions: ['ACT-050', 'ACT-051'] }],
      actions: [{ id: 'ACT-050', status: 'Done' }, { id: 'ACT-051', status: 'Done' }]
    };
    assert.equal(checkResult({ id: 'legacy', scored: true, tpl: 'legacy' }, ctx), 'pass');
  });
  test('demo mode: stays at the raw result if not every linked action is Done yet', () => {
    const ctx = {
      lastResults: { legacy: 'fail' },
      isDemo: true,
      risks: [{ id: 'R-010', tpl: 'legacy', actions: ['ACT-050', 'ACT-051'] }],
      actions: [{ id: 'ACT-050', status: 'Done' }, { id: 'ACT-051', status: 'Open' }]
    };
    assert.equal(checkResult({ id: 'legacy', scored: true, tpl: 'legacy' }, ctx), 'fail');
  });
  test('live mode never applies the demo remediation flip, even with matching data', () => {
    const ctx = {
      lastResults: { legacy: 'fail' },
      isDemo: false,
      risks: [{ id: 'R-010', tpl: 'legacy', actions: ['ACT-050'] }],
      actions: [{ id: 'ACT-050', status: 'Done' }]
    };
    assert.equal(checkResult({ id: 'legacy', scored: true, tpl: 'legacy' }, ctx), 'fail');
  });
});

describe('score()', () => {
  const CHECK_DEFS = [
    { id: 'a', scored: true }, { id: 'b', scored: true }, { id: 'c', scored: true },
    { id: 'd', scored: false } // never counted
  ];
  test('no scan yet -> floors at 5 (app.js only ever calls score() right after a scan populates lastResults, so this path is unreachable in practice, but the function itself treats an unscanned check as 0 points, not as excluded)', () => {
    assert.equal(score(CHECK_DEFS, { lastResults: null }), 5);
  });
  test('all pass -> 100', () => {
    const ctx = { lastResults: { a: 'pass', b: 'pass', c: 'pass' } };
    assert.equal(score(CHECK_DEFS, ctx), 100);
  });
  test('mixed pass/review/fail computes the weighted average, floored at 5', () => {
    // a=pass(1), b=review(0.5), c=fail(0) -> 1.5/3 = 50%
    const ctx = { lastResults: { a: 'pass', b: 'review', c: 'fail' } };
    assert.equal(score(CHECK_DEFS, ctx), 50);
  });
  test('all fail floors at 5, never 0', () => {
    const ctx = { lastResults: { a: 'fail', b: 'fail', c: 'fail' } };
    assert.equal(score(CHECK_DEFS, ctx), 5);
  });
  test('a scored:true check that resolves to manual this scan is excluded from the denominator, not counted as 0', () => {
    // a=pass(1), b=manual(excluded), c=pass(1) -> 2/2 = 100%, not 2/3
    const ctx = { lastResults: { a: 'pass', b: 'manual', c: 'pass' } };
    assert.equal(score(CHECK_DEFS, ctx), 100);
  });
  test('scored:false checks never enter the calculation at all', () => {
    const withManualCheck = [{ id: 'a', scored: true }, { id: 'd', scored: false }];
    const ctx = { lastResults: { a: 'pass' } };
    assert.equal(score(withManualCheck, ctx), 100);
  });
  test('accepts a checkResultFn override instead of a ctx (used by app.js)', () => {
    const fn = (c) => (c.id === 'a' ? 'pass' : c.id === 'b' ? 'fail' : 'manual');
    // a=pass(1), b=fail(0) -> 1/2 = 50%; c is scored:true but resolves 'manual' via fn -> excluded
    assert.equal(score(CHECK_DEFS, null, fn), 50);
  });
});

describe('readinessPct()', () => {
  test('0% when nothing is applicable', () => {
    assert.equal(readinessPct([{ app: false, st: 'Not started' }]), 0);
  });
  test('0% when applicable controls exist but none are implemented', () => {
    assert.equal(readinessPct([{ app: true, st: 'Not started' }, { app: true, st: 'In progress' }]), 0);
  });
  test('100% when every applicable control is implemented', () => {
    assert.equal(readinessPct([{ app: true, st: 'Implemented' }, { app: true, st: 'Implemented' }]), 100);
  });
  test('rounds to the nearest whole percent', () => {
    // 1 of 3 implemented = 33.33% -> rounds to 33
    const controls = [
      { app: true, st: 'Implemented' }, { app: true, st: 'Not started' }, { app: true, st: 'Not started' }
    ];
    assert.equal(readinessPct(controls), 33);
  });
  test('non-applicable controls never count toward the denominator', () => {
    const controls = [
      { app: true, st: 'Implemented' }, { app: false, st: 'Not started' }, { app: false, st: 'Not started' }
    ];
    assert.equal(readinessPct(controls), 100);
  });
  test('empty controls array -> 0, not NaN or a thrown error', () => {
    assert.equal(readinessPct([]), 0);
  });
});

describe('suggestVendorCriticality()', () => {
  test('health information, credentials, or production access -> Critical', () => {
    assert.equal(suggestVendorCriticality(['Health information']), 'Critical');
    assert.equal(suggestVendorCriticality(['Credentials & secrets']), 'Critical');
    assert.equal(suggestVendorCriticality(['Production system access']), 'Critical');
  });
  test('customer PII or financial data -> High', () => {
    assert.equal(suggestVendorCriticality(['Customer PII']), 'High');
    assert.equal(suggestVendorCriticality(['Financial / payment data']), 'High');
  });
  test('employee data or company confidential -> Medium', () => {
    assert.equal(suggestVendorCriticality(['Employee data']), 'Medium');
    assert.equal(suggestVendorCriticality(['Company confidential']), 'Medium');
  });
  test('public-only or nothing selected -> Low', () => {
    assert.equal(suggestVendorCriticality(['Public / non-sensitive only']), 'Low');
    assert.equal(suggestVendorCriticality([]), 'Low');
    assert.equal(suggestVendorCriticality(undefined), 'Low');
  });
  test('highest-sensitivity category wins when several are ticked', () => {
    assert.equal(suggestVendorCriticality(['Company confidential', 'Customer PII', 'Health information']), 'Critical');
    assert.equal(suggestVendorCriticality(['Public / non-sensitive only', 'Financial / payment data']), 'High');
  });
});

describe('toCsv()', () => {
  test('plain cells join with commas, rows with CRLF', () => {
    assert.equal(toCsv([['ID', 'Title'], ['R-1', 'Legacy auth']]), 'ID,Title\r\nR-1,Legacy auth');
  });
  test('quotes a cell containing a comma', () => {
    assert.equal(toCsv([['a,b', 'c']]), '"a,b",c');
  });
  test('quotes a cell containing a double quote, doubling it', () => {
    assert.equal(toCsv([['say "hi"']]), '"say ""hi"""');
  });
  test('quotes a cell containing a newline', () => {
    assert.equal(toCsv([['line1\nline2']]), '"line1\nline2"');
  });
  test('null/undefined cells become empty strings, not "null"/"undefined"', () => {
    assert.equal(toCsv([[null, undefined, 0, false]]), ',,0,false');
  });
});

describe('buildZip()', () => {
  function readU16(b, o) { return b[o] | (b[o + 1] << 8); }
  function readU32(b, o) { return (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0; }
  function parseStoreZip(bytes) {
    var out = [], o = 0, dec = new TextDecoder();
    while (o < bytes.length && readU32(bytes, o) === 0x04034b50) {
      var compSize = readU32(bytes, o + 18);
      var nameLen = readU16(bytes, o + 26);
      var extraLen = readU16(bytes, o + 28);
      var nameStart = o + 30;
      var dataStart = nameStart + nameLen + extraLen;
      out.push({ name: dec.decode(bytes.slice(nameStart, nameStart + nameLen)), content: dec.decode(bytes.slice(dataStart, dataStart + compSize)) });
      o = dataStart + compSize;
    }
    return out;
  }

  test('round-trips file names and content exactly', () => {
    var files = [{ name: 'risks.csv', content: 'ID,Title\r\nR-1,Test\r\n' }, { name: 'actions.csv', content: 'ID,Title\r\nA-1,Another, with a comma\r\n' }];
    var zip = buildZip(files, new Date('2026-01-15T10:30:00'));
    assert.equal(zip[0], 0x50); assert.equal(zip[1], 0x4B); assert.equal(zip[2], 0x03); assert.equal(zip[3], 0x04);
    assert.deepEqual(parseStoreZip(zip), files);
  });
  test('ends with a valid end-of-central-directory record listing every entry', () => {
    var zip = buildZip([{ name: 'a.csv', content: 'x' }, { name: 'b.csv', content: 'y' }, { name: 'c.csv', content: 'z' }]);
    var eocdSig = readU32(zip, zip.length - 22);
    assert.equal(eocdSig, 0x06054b50);
    assert.equal(readU16(zip, zip.length - 22 + 10), 3); // total entries
  });
  test('empty file list still produces a valid (empty) archive', () => {
    var zip = buildZip([]);
    assert.deepEqual(parseStoreZip(zip), []);
    assert.equal(readU32(zip, zip.length - 22), 0x06054b50);
  });
});

describe('canonicalJson()', () => {
  test('key order never affects the output', () => {
    assert.equal(canonicalJson({ b: 1, a: 2 }), canonicalJson({ a: 2, b: 1 }));
  });
  test('nested objects and arrays are sorted too', () => {
    assert.equal(
      canonicalJson({ z: { y: 1, x: 2 }, a: [3, 2, 1] }),
      '{"a":[3,2,1],"z":{"x":2,"y":1}}'
    );
  });
  test('arrays preserve element order (only object keys are sorted)', () => {
    assert.equal(canonicalJson({ frameworks: ['soc2', 'iso27001'] }), '{"frameworks":["soc2","iso27001"]}');
  });
});

describe('entitlement signing/verification (Ed25519 via node:crypto webcrypto)', () => {
  async function keypair() {
    return webcrypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
  }
  async function pubKeyBase64(publicKey) {
    var raw = new Uint8Array(await webcrypto.subtle.exportKey('raw', publicKey));
    return CheckpointLib.bytesToBase64(raw);
  }

  test('a correctly-signed payload verifies', async () => {
    var kp = await keypair();
    var payload = { tenantId: 't-1', frameworks: ['iso27001', 'soc2'], issuedAt: '2026-01-01', expiry: '2027-01-01' };
    var sig = await signEntitlementPayload(webcrypto.subtle, kp.privateKey, payload);
    var pub = await pubKeyBase64(kp.publicKey);
    assert.equal(await verifyEntitlementSignature(webcrypto.subtle, pub, payload, sig), true);
  });

  test('a tampered payload fails verification', async () => {
    var kp = await keypair();
    var payload = { tenantId: 't-1', frameworks: ['iso27001'], issuedAt: '2026-01-01', expiry: '2027-01-01' };
    var sig = await signEntitlementPayload(webcrypto.subtle, kp.privateKey, payload);
    var pub = await pubKeyBase64(kp.publicKey);
    var tampered = Object.assign({}, payload, { frameworks: ['iso27001', 'soc2'] });
    assert.equal(await verifyEntitlementSignature(webcrypto.subtle, pub, tampered, sig), false);
  });

  test('a signature from a different key fails verification', async () => {
    var kp1 = await keypair();
    var kp2 = await keypair();
    var payload = { tenantId: 't-1', frameworks: ['iso27001'], issuedAt: '2026-01-01', expiry: '2027-01-01' };
    var sig = await signEntitlementPayload(webcrypto.subtle, kp1.privateKey, payload);
    var wrongPub = await pubKeyBase64(kp2.publicKey);
    assert.equal(await verifyEntitlementSignature(webcrypto.subtle, wrongPub, payload, sig), false);
  });

  test('re-ordered object keys still verify (canonicalJson makes signing order-independent)', async () => {
    var kp = await keypair();
    var payload = { tenantId: 't-1', frameworks: ['iso27001'], issuedAt: '2026-01-01', expiry: '2027-01-01' };
    var sig = await signEntitlementPayload(webcrypto.subtle, kp.privateKey, payload);
    var pub = await pubKeyBase64(kp.publicKey);
    var reordered = { expiry: payload.expiry, frameworks: payload.frameworks, issuedAt: payload.issuedAt, tenantId: payload.tenantId };
    assert.equal(await verifyEntitlementSignature(webcrypto.subtle, pub, reordered, sig), true);
  });

  test('a directly-tampered signature string (flipped byte) fails verification', async () => {
    var kp = await keypair();
    var payload = { tenantId: 't-1', frameworks: ['iso27001'], issuedAt: '2026-01-01', expiry: '2027-01-01' };
    var sig = await signEntitlementPayload(webcrypto.subtle, kp.privateKey, payload);
    var pub = await pubKeyBase64(kp.publicKey);
    var sigBytes = Buffer.from(sig, 'base64');
    sigBytes[0] = sigBytes[0] ^ 0xff; // flip every bit of the first byte
    var tamperedSig = sigBytes.toString('base64');
    assert.equal(await verifyEntitlementSignature(webcrypto.subtle, pub, payload, tamperedSig), false);
  });
});

/* End-to-end activation pipeline — signing + signature verification +
   evaluateEntitlement()'s business rules together, the same sequence
   app.js's verifyActivationRaw() runs on an uploaded/cached activation
   file. Covers every state the task requires test coverage for: valid,
   tampered payload, tampered signature, wrong tenant, expired, in-grace. */
describe('full activation pipeline (sign -> verify -> evaluate)', () => {
  async function issue(payload, privateKey) {
    return { payload: payload, signature: await signEntitlementPayload(webcrypto.subtle, privateKey, payload) };
  }
  async function verifyFile(file, pub) {
    var sigOk = await verifyEntitlementSignature(webcrypto.subtle, pub, file.payload, file.signature);
    return { sigOk: sigOk };
  }

  test('valid: correct signature, matching tenant, not expired', async () => {
    var kp = await webcrypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
    var pub = CheckpointLib.bytesToBase64(new Uint8Array(await webcrypto.subtle.exportKey('raw', kp.publicKey)));
    var file = await issue({ tenantId: 't-1', frameworks: ['iso27001', 'soc2'], issuedAt: '2026-01-01', expiry: '2027-01-01' }, kp.privateKey);
    var v = await verifyFile(file, pub);
    assert.equal(v.sigOk, true);
    var evalResult = evaluateEntitlement(file.payload, 't-1', '2026-06-01');
    assert.equal(evalResult.status, 'valid');
  });

  test('tampered payload: signature no longer verifies even though tenant/expiry would otherwise pass', async () => {
    var kp = await webcrypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
    var pub = CheckpointLib.bytesToBase64(new Uint8Array(await webcrypto.subtle.exportKey('raw', kp.publicKey)));
    var file = await issue({ tenantId: 't-1', frameworks: ['iso27001'], issuedAt: '2026-01-01', expiry: '2027-01-01' }, kp.privateKey);
    file.payload.frameworks.push('essential8'); // tamper after signing
    var v = await verifyFile(file, pub);
    assert.equal(v.sigOk, false);
  });

  test('tampered signature: valid payload, corrupted signature bytes', async () => {
    var kp = await webcrypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
    var pub = CheckpointLib.bytesToBase64(new Uint8Array(await webcrypto.subtle.exportKey('raw', kp.publicKey)));
    var file = await issue({ tenantId: 't-1', frameworks: ['iso27001'], issuedAt: '2026-01-01', expiry: '2027-01-01' }, kp.privateKey);
    file.signature = file.signature.slice(0, -4) + (file.signature.slice(-4) === 'AAAA' ? 'BBBB' : 'AAAA');
    var v = await verifyFile(file, pub);
    assert.equal(v.sigOk, false);
  });

  test('wrong tenant: signature verifies, but tenant does not match any accepted id', async () => {
    var kp = await webcrypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
    var pub = CheckpointLib.bytesToBase64(new Uint8Array(await webcrypto.subtle.exportKey('raw', kp.publicKey)));
    var file = await issue({ tenantId: 'acme-corp-tenant-id', frameworks: ['iso27001'], issuedAt: '2026-01-01', expiry: '2027-01-01' }, kp.privateKey);
    var v = await verifyFile(file, pub);
    assert.equal(v.sigOk, true);
    var evalResult = evaluateEntitlement(file.payload, ['some-other-tenant-id', 'someother.com'], '2026-06-01');
    assert.equal(evalResult.status, 'mismatch');
    assert.deepEqual(evalResult.frameworks, []);
  });

  test('expired: signature verifies, tenant matches, past grace', async () => {
    var kp = await webcrypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
    var pub = CheckpointLib.bytesToBase64(new Uint8Array(await webcrypto.subtle.exportKey('raw', kp.publicKey)));
    var file = await issue({ tenantId: 't-1', frameworks: ['iso27001', 'soc2'], issuedAt: '2025-01-01', expiry: '2026-01-01', graceDays: 14 }, kp.privateKey);
    var v = await verifyFile(file, pub);
    assert.equal(v.sigOk, true);
    var evalResult = evaluateEntitlement(file.payload, 't-1', '2026-03-01');
    assert.equal(evalResult.status, 'expired');
    assert.deepEqual(evalResult.frameworks, ['iso27001', 'soc2']);
  });

  test('in-grace: signature verifies, tenant matches, past expiry but within graceDays', async () => {
    var kp = await webcrypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
    var pub = CheckpointLib.bytesToBase64(new Uint8Array(await webcrypto.subtle.exportKey('raw', kp.publicKey)));
    var file = await issue({ tenantId: 't-1', frameworks: ['iso27001'], issuedAt: '2025-01-01', expiry: '2026-01-01', graceDays: 14 }, kp.privateKey);
    var v = await verifyFile(file, pub);
    assert.equal(v.sigOk, true);
    var evalResult = evaluateEntitlement(file.payload, 't-1', '2026-01-10');
    assert.equal(evalResult.status, 'grace');
    assert.deepEqual(evalResult.frameworks, ['iso27001']);
    assert.equal(evalResult.graceUntil, '2026-01-15');
  });
});

describe('evaluateEntitlement()', () => {
  test('matching tenant, not yet expired -> valid', () => {
    var r = evaluateEntitlement({ tenantId: 't-1', frameworks: ['iso27001', 'soc2'], expiry: '2027-01-01' }, 't-1', '2026-06-01');
    assert.equal(r.status, 'valid');
    assert.deepEqual(r.frameworks, ['iso27001', 'soc2']);
  });
  test('matching tenant, past expiry -> expired, frameworks still returned', () => {
    var r = evaluateEntitlement({ tenantId: 't-1', frameworks: ['iso27001', 'soc2'], expiry: '2025-01-01' }, 't-1', '2026-06-01');
    assert.equal(r.status, 'expired');
    assert.deepEqual(r.frameworks, ['iso27001', 'soc2']);
  });
  test('expiry exactly today counts as still valid (< not <=)', () => {
    var r = evaluateEntitlement({ tenantId: 't-1', frameworks: ['iso27001'], expiry: '2026-06-01' }, 't-1', '2026-06-01');
    assert.equal(r.status, 'valid');
  });
  test('different tenant -> mismatch, no frameworks granted', () => {
    var r = evaluateEntitlement({ tenantId: 't-1', frameworks: ['iso27001', 'soc2'], expiry: '2027-01-01' }, 't-2', '2026-06-01');
    assert.equal(r.status, 'mismatch');
    assert.deepEqual(r.frameworks, []);
  });
  test('missing/empty payload -> mismatch, never throws', () => {
    assert.equal(evaluateEntitlement(null, 't-1', '2026-06-01').status, 'mismatch');
    assert.equal(evaluateEntitlement({}, 't-1', '2026-06-01').status, 'mismatch');
  });

  describe('tenant binding — GUID or verified domain, multiple acceptable ids', () => {
    test('matches a GUID', () => {
      var r = evaluateEntitlement({ tenantId: 'guid-123', frameworks: ['iso27001'], expiry: '2027-01-01' }, ['guid-123', 'contoso.com'], '2026-06-01');
      assert.equal(r.status, 'valid');
    });
    test('matches a verified domain instead of the GUID', () => {
      var r = evaluateEntitlement({ tenantId: 'contoso.com', frameworks: ['iso27001'], expiry: '2027-01-01' }, ['guid-123', 'contoso.com', 'contoso.onmicrosoft.com'], '2026-06-01');
      assert.equal(r.status, 'valid');
    });
    test('matching is case-insensitive', () => {
      var r = evaluateEntitlement({ tenantId: 'Contoso.COM', frameworks: ['iso27001'], expiry: '2027-01-01' }, ['contoso.com'], '2026-06-01');
      assert.equal(r.status, 'valid');
    });
    test('a single string (not an array) still works, for backward compatibility', () => {
      var r = evaluateEntitlement({ tenantId: 't-1', frameworks: ['iso27001'], expiry: '2027-01-01' }, 't-1', '2026-06-01');
      assert.equal(r.status, 'valid');
    });
    test('none of the acceptable ids match -> mismatch', () => {
      var r = evaluateEntitlement({ tenantId: 'someone-elses-tenant', frameworks: ['iso27001'], expiry: '2027-01-01' }, ['guid-123', 'contoso.com'], '2026-06-01');
      assert.equal(r.status, 'mismatch');
    });
  });

  describe('grace period', () => {
    test('default graceDays is 14 when the payload omits it', () => {
      // expiry 2026-06-01, now 10 days later -> still within the default 14-day grace
      var r = evaluateEntitlement({ tenantId: 't-1', frameworks: ['iso27001'], expiry: '2026-06-01' }, 't-1', '2026-06-11');
      assert.equal(r.status, 'grace');
      assert.equal(r.graceDays, 14);
      assert.equal(r.graceUntil, '2026-06-15');
    });
    test('still within an explicit graceDays -> grace, frameworks still returned', () => {
      var r = evaluateEntitlement({ tenantId: 't-1', frameworks: ['iso27001', 'soc2'], expiry: '2026-06-01', graceDays: 30 }, 't-1', '2026-06-20');
      assert.equal(r.status, 'grace');
      assert.deepEqual(r.frameworks, ['iso27001', 'soc2']);
      assert.equal(r.graceUntil, '2026-07-01');
    });
    test('exactly on the grace boundary still counts as grace (<=, not <)', () => {
      var r = evaluateEntitlement({ tenantId: 't-1', frameworks: ['iso27001'], expiry: '2026-06-01', graceDays: 14 }, 't-1', '2026-06-15');
      assert.equal(r.status, 'grace');
    });
    test('one day past the grace boundary -> expired', () => {
      var r = evaluateEntitlement({ tenantId: 't-1', frameworks: ['iso27001'], expiry: '2026-06-01', graceDays: 14 }, 't-1', '2026-06-16');
      assert.equal(r.status, 'expired');
    });
    test('graceDays: 0 means expiry day itself is the last valid day, no grace at all', () => {
      var r = evaluateEntitlement({ tenantId: 't-1', frameworks: ['iso27001'], expiry: '2026-06-01', graceDays: 0 }, 't-1', '2026-06-02');
      assert.equal(r.status, 'expired');
    });
    test('not yet expired -> valid regardless of graceDays', () => {
      var r = evaluateEntitlement({ tenantId: 't-1', frameworks: ['iso27001'], expiry: '2027-01-01', graceDays: 0 }, 't-1', '2026-06-01');
      assert.equal(r.status, 'valid');
      assert.equal(r.graceUntil, null);
    });
  });
});

describe('evaluateEntitlement() — licence type (client/partner/demo)', () => {
  test('a payload with no type field at all normalises to \'client\' — backward compatibility with every file issued before this field existed', () => {
    var r = evaluateEntitlement({ tenantId: 't-1', frameworks: ['iso27001'], expiry: '2027-01-01' }, 't-1', '2026-06-01');
    assert.equal(r.type, 'client');
  });
  test('type: \'client\' passes through', () => {
    var r = evaluateEntitlement({ tenantId: 't-1', type: 'client', frameworks: ['iso27001'], expiry: '2027-01-01' }, 't-1', '2026-06-01');
    assert.equal(r.type, 'client');
  });
  test('type: \'partner\' passes through, with every framework the payload lists', () => {
    var r = evaluateEntitlement({ tenantId: 't-1', type: 'partner', frameworks: ['iso27001', 'soc2', 'essential8'], expiry: '2030-01-01' }, 't-1', '2026-06-01');
    assert.equal(r.type, 'partner');
    assert.equal(r.status, 'valid');
    assert.deepEqual(r.frameworks, ['iso27001', 'soc2', 'essential8']);
  });
  test('type: \'demo\' passes through, and follows the exact same expiry/grace logic as any other type — no special leniency', () => {
    var valid = evaluateEntitlement({ tenantId: 't-1', type: 'demo', frameworks: ['iso27001'], expiry: '2026-07-20' }, 't-1', '2026-07-10');
    assert.equal(valid.type, 'demo');
    assert.equal(valid.status, 'valid');
    var expired = evaluateEntitlement({ tenantId: 't-1', type: 'demo', frameworks: ['iso27001'], expiry: '2026-01-01', graceDays: 0 }, 't-1', '2026-07-10');
    assert.equal(expired.type, 'demo');
    assert.equal(expired.status, 'expired');
  });
  test('an unrecognised type value normalises to \'client\' rather than being trusted verbatim', () => {
    var r = evaluateEntitlement({ tenantId: 't-1', type: 'super-admin', frameworks: ['iso27001'], expiry: '2027-01-01' }, 't-1', '2026-06-01');
    assert.equal(r.type, 'client');
  });
  test('type is still reported (normalised) even on a tenant mismatch', () => {
    var r = evaluateEntitlement({ tenantId: 't-1', type: 'partner', frameworks: ['iso27001'], expiry: '2027-01-01' }, 't-2', '2026-06-01');
    assert.equal(r.status, 'mismatch');
    assert.equal(r.type, 'partner');
  });

  describe('daysRemaining — the demo trial banner\'s countdown', () => {
    test('positive while not yet expired', () => {
      var r = evaluateEntitlement({ tenantId: 't-1', type: 'demo', frameworks: ['iso27001'], expiry: '2026-07-20' }, 't-1', '2026-07-10');
      assert.equal(r.daysRemaining, 10);
    });
    test('zero on the expiry day itself', () => {
      var r = evaluateEntitlement({ tenantId: 't-1', type: 'demo', frameworks: ['iso27001'], expiry: '2026-07-10' }, 't-1', '2026-07-10');
      assert.equal(r.daysRemaining, 0);
    });
    test('negative once past expiry', () => {
      var r = evaluateEntitlement({ tenantId: 't-1', type: 'demo', frameworks: ['iso27001'], expiry: '2026-07-01', graceDays: 30 }, 't-1', '2026-07-10');
      assert.equal(r.daysRemaining, -9);
    });
    test('null when the payload has no expiry at all', () => {
      var r = evaluateEntitlement({ tenantId: 't-1', type: 'demo', frameworks: ['iso27001'] }, 't-1', '2026-07-10');
      assert.equal(r.daysRemaining, null);
    });
  });
});

describe('normalizeEntitlementType()', () => {
  test('passes through the three known types unchanged', () => {
    assert.equal(normalizeEntitlementType('client'), 'client');
    assert.equal(normalizeEntitlementType('partner'), 'partner');
    assert.equal(normalizeEntitlementType('demo'), 'demo');
  });
  test('defaults anything else (including undefined) to \'client\'', () => {
    assert.equal(normalizeEntitlementType(undefined), 'client');
    assert.equal(normalizeEntitlementType(null), 'client');
    assert.equal(normalizeEntitlementType(''), 'client');
    assert.equal(normalizeEntitlementType('Partner'), 'client'); // case-sensitive on purpose — issued files always use the exact lowercase literal
  });
});

describe('daysBetweenDateStr()', () => {
  test('positive when "to" is after "from"', () => {
    assert.equal(daysBetweenDateStr('2026-07-01', '2026-07-11'), 10);
  });
  test('negative when "to" is before "from"', () => {
    assert.equal(daysBetweenDateStr('2026-07-11', '2026-07-01'), -10);
  });
  test('zero for the same date', () => {
    assert.equal(daysBetweenDateStr('2026-07-01', '2026-07-01'), 0);
  });
  test('rolls over a year boundary correctly', () => {
    assert.equal(daysBetweenDateStr('2026-12-28', '2027-01-07'), 10);
  });
});

describe('isDevBypassActive() — the localhost guard behind the local-development bypass', () => {
  test('true only when the flag is strictly true AND the hostname is localhost or 127.0.0.1', () => {
    assert.equal(isDevBypassActive(true, 'localhost'), true);
    assert.equal(isDevBypassActive(true, '127.0.0.1'), true);
  });
  test('false for a real hostname, even with the flag on — this is what a real deployment relies on', () => {
    assert.equal(isDevBypassActive(true, 'checkpoint.compliance365.com.au'), false);
  });
  test('false when the flag is off, even on localhost — what a production build shipped-and-somehow-served-locally still refuses', () => {
    assert.equal(isDevBypassActive(false, 'localhost'), false);
  });
  test('false for falsy/non-boolean flag values, not just false', () => {
    assert.equal(isDevBypassActive(undefined, 'localhost'), false);
    assert.equal(isDevBypassActive('true', 'localhost'), false);
    assert.equal(isDevBypassActive(1, 'localhost'), false);
  });
});

describe('addDaysToDateStr()', () => {
  test('adds days within the same month', () => {
    assert.equal(addDaysToDateStr('2026-06-01', 10), '2026-06-11');
  });
  test('rolls over a month boundary', () => {
    assert.equal(addDaysToDateStr('2026-06-25', 10), '2026-07-05');
  });
  test('rolls over a year boundary', () => {
    assert.equal(addDaysToDateStr('2026-12-28', 10), '2027-01-07');
  });
  test('zero days returns the same date', () => {
    assert.equal(addDaysToDateStr('2026-06-01', 0), '2026-06-01');
  });
});

describe('evaluateEntitlement() — moduleKeys pass-through', () => {
  test('moduleKeys from the payload are returned verbatim', () => {
    var r = evaluateEntitlement({ tenantId: 't-1', frameworks: ['iso27001', 'soc2'], expiry: '2027-01-01', moduleKeys: { soc2: 'abc123' } }, 't-1', '2026-06-01');
    assert.deepEqual(r.moduleKeys, { soc2: 'abc123' });
  });
  test('a payload with no moduleKeys field returns {}, not undefined', () => {
    var r = evaluateEntitlement({ tenantId: 't-1', frameworks: ['iso27001'], expiry: '2027-01-01' }, 't-1', '2026-06-01');
    assert.deepEqual(r.moduleKeys, {});
  });
});

// Content-pack crypto (public/checkpoint/lib.js's encryptPack/decryptPack/
// sha256Hex/validatePackShape) — the client-side half of "move premium
// content out of the shipped bundle into encrypted content packs".
// scripts/build-content-packs.mjs uses the exact same encryptPack()
// implementation to build the real packs; app.js's mergeLicensedPacks()
// uses the exact same decryptPack()/validatePackShape() to consume them.
describe('content-pack crypto (encryptPack/decryptPack/sha256Hex/validatePackShape)', () => {
  var samplePlaintext = { moduleId: 'soc2', version: 1, framework: { id: 'soc2', name: 'SOC 2', tag: 'Trust', blurb: '...', controls: [{ code: 'CC1.1', t: 'Sample control', app: true, map: '', cat: 'CC' }] }, guidance: { 'CC1.1': { steps: ['do the thing'] } }, extra: {} };

  test('decrypt round-trip: encrypting then decrypting with the same key reproduces the exact plaintext', async () => {
    var key = randomKey();
    var pack = await encryptPack(webcrypto.subtle, key, 'soc2', 1, samplePlaintext);
    assert.equal(pack.moduleId, 'soc2');
    assert.equal(pack.version, 1);
    var decrypted = await decryptPack(webcrypto.subtle, key, pack);
    assert.deepEqual(decrypted, samplePlaintext);
  });

  test('a tampered ciphertext is rejected (AES-GCM auth tag fails to verify)', async () => {
    var key = randomKey();
    var pack = await encryptPack(webcrypto.subtle, key, 'soc2', 1, samplePlaintext);
    var ctBytes = Buffer.from(pack.ciphertext, 'base64');
    ctBytes[0] ^= 0xff; // flip a bit — anywhere in ciphertext or its trailing auth tag
    var tampered = Object.assign({}, pack, { ciphertext: ctBytes.toString('base64') });
    await assert.rejects(() => decryptPack(webcrypto.subtle, key, tampered));
  });

  test('the wrong key is rejected — indistinguishable from a tampered pack, both correctly treated as "module unavailable"', async () => {
    var pack = await encryptPack(webcrypto.subtle, randomKey(), 'soc2', 1, samplePlaintext);
    await assert.rejects(() => decryptPack(webcrypto.subtle, randomKey(), pack));
  });

  test('sha256Hex produces a 64-character lowercase hex digest, stable for the same bytes', async () => {
    var bytes = new TextEncoder().encode('hello content pack');
    var h1 = await sha256Hex(webcrypto.subtle, bytes);
    var h2 = await sha256Hex(webcrypto.subtle, bytes);
    assert.match(h1, /^[0-9a-f]{64}$/);
    assert.equal(h1, h2);
  });

  test('sha256Hex changes if a single byte of the pack changes (defense-in-depth alongside AES-GCM\'s own auth tag)', async () => {
    var a = new TextEncoder().encode('{"moduleId":"soc2"}');
    var b = new TextEncoder().encode('{"moduleId":"soc3"}');
    assert.notEqual(await sha256Hex(webcrypto.subtle, a), await sha256Hex(webcrypto.subtle, b));
  });

  test('validatePackShape accepts well-formed decrypted content', () => {
    assert.equal(validatePackShape('soc2', samplePlaintext), null);
  });
  test('validatePackShape rejects a framework.id that doesn\'t match the requested module (wrong pack served for this moduleId)', () => {
    assert.ok(validatePackShape('essential8', samplePlaintext));
  });
  test('validatePackShape rejects missing/non-array controls', () => {
    assert.ok(validatePackShape('soc2', { framework: { id: 'soc2', controls: 'not-an-array' } }));
    assert.ok(validatePackShape('soc2', { framework: { id: 'soc2' } }));
  });
  test('validatePackShape rejects a non-object guidance field', () => {
    assert.ok(validatePackShape('soc2', { framework: { id: 'soc2', controls: [] }, guidance: 'nope' }));
  });
  test('validatePackShape rejects null/non-object content entirely', () => {
    assert.ok(validatePackShape('soc2', null));
    assert.ok(validatePackShape('soc2', 'a string'));
  });
});
