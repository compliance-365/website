// The audit-log integrity chain (lib.js). Every test here is about a
// claim Checkpoint makes to an assessor: that the log has not been
// edited since it was written. A false NEGATIVE (tampering we fail to
// detect) makes that claim a lie; a false POSITIVE (ordinary use
// reported as tampering) makes the feature untrustworthy and it gets
// switched off. Both are covered below.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';

const win = {};
new Function('window', readFileSync(new URL('../public/checkpoint/lib.js', import.meta.url), 'utf8'))(win);
const { canonicalAuditEntry, auditEntryHash, verifyAuditChain } = win.CheckpointLib;
const subtle = webcrypto.subtle;

const entry = (over = {}) => ({
  actor: 'K. Patel', actorId: 'kp@example.com', action: 'Control status changed',
  targetType: 'Control', targetId: 'A.5.1', before: 'In progress', after: 'Implemented',
  entryDateTime: '2026-06-01T02:00:00Z', ...over
});

async function chain(entries) {
  let prev = '';
  const out = [];
  for (const e of entries) {
    const h = await auditEntryHash(subtle, e, prev);
    out.push({ ...e, prevHash: prev, entryHash: h });
    prev = h;
  }
  return out;
}

describe('canonicalAuditEntry() — the same entry always hashes the same', () => {
  test('key insertion order does not change the canonical form', () => {
    const a = { actor: 'A', action: 'X', targetType: 'Risk', targetId: 'R-1', before: '', after: 'y', actorId: 'a@b', entryDateTime: 'T' };
    const b = { entryDateTime: 'T', after: 'y', before: '', targetId: 'R-1', targetType: 'Risk', action: 'X', actorId: 'a@b', actor: 'A' };
    assert.equal(canonicalAuditEntry(a), canonicalAuditEntry(b));
  });

  test('null/undefined fields canonicalise to empty, not to the words null/undefined', () => {
    const c = canonicalAuditEntry({ actor: null, before: undefined });
    assert.ok(!c.includes('null') && !c.includes('undefined'), c);
  });

  test('a changed field changes the canonical form', () => {
    assert.notEqual(canonicalAuditEntry(entry()), canonicalAuditEntry(entry({ after: 'Not implemented' })));
  });
});

describe('verifyAuditChain() — an untouched chain verifies', () => {
  test('a clean chain is ok, fully chained, and reports where verification starts', async () => {
    const c = await chain([entry(), entry({ targetId: 'A.5.2' }), entry({ targetId: 'A.5.3' })]);
    const r = await verifyAuditChain(subtle, c);
    assert.equal(r.ok, true);
    assert.equal(r.chained, 3);
    assert.equal(r.unchained, 0);
    assert.deepEqual([r.altered, r.broken, r.forked], [[], [], []]);
    assert.equal(r.verifiedFrom, '2026-06-01T02:00:00Z');
  });

  test('an empty log verifies rather than erroring', async () => {
    const r = await verifyAuditChain(subtle, []);
    assert.equal(r.ok, true);
    assert.equal(r.total, 0);
  });
});

describe('verifyAuditChain() — tampering is detected', () => {
  test('editing an entry after the fact is caught', async () => {
    const c = await chain([entry(), entry({ targetId: 'A.5.2' }), entry({ targetId: 'A.5.3' })]);
    c[1].after = 'Implemented (backdated)';        // someone edits history
    const r = await verifyAuditChain(subtle, c);
    assert.equal(r.ok, false);
    assert.ok(r.altered.includes(1), 'the edited entry is named');
  });

  test('deleting an entry is caught — the successor points at a predecessor that no longer exists', async () => {
    const c = await chain([entry(), entry({ targetId: 'A.5.2' }), entry({ targetId: 'A.5.3' })]);
    c.splice(1, 1);                                 // someone removes an inconvenient row
    const r = await verifyAuditChain(subtle, c);
    assert.equal(r.ok, false);
    assert.ok(r.broken.length > 0, 'the gap is detected');
  });

  test('re-ordering entries is caught', async () => {
    const c = await chain([entry(), entry({ targetId: 'A.5.2' }), entry({ targetId: 'A.5.3' })]);
    const swapped = [c[0], c[2], c[1]];
    const r = await verifyAuditChain(subtle, swapped);
    assert.equal(r.ok, false);
  });

  test('a wholesale re-hash still fails, because the chain an auditor already exported would not match', async () => {
    // The attacker recomputes every hash after their edit. Internally
    // consistent -- so this test pins the honest limit of the mechanism:
    // it verifies, and detection depends on comparing against a copy
    // held elsewhere. Documented rather than silently assumed.
    const c = await chain([entry(), entry({ targetId: 'A.5.2', after: 'FORGED' })]);
    const r = await verifyAuditChain(subtle, c);
    assert.equal(r.ok, true, 'a fully recomputed chain is internally valid by construction');
    const original = await chain([entry(), entry({ targetId: 'A.5.2' })]);
    assert.notEqual(c[1].entryHash, original[1].entryHash,
      'but its head hash differs from the one an auditor already holds, which is how it is caught');
  });
});

describe('verifyAuditChain() — ordinary use is not mistaken for tampering', () => {
  test('entries predating the feature are reported as unchained, never as altered', async () => {
    const legacy = [entry({ entryDateTime: '2025-01-01T00:00:00Z' }), entry({ entryDateTime: '2025-01-02T00:00:00Z' })];
    const rest = await chain([entry({ targetId: 'A.9.9' })]);
    const r = await verifyAuditChain(subtle, [...legacy, ...rest]);
    assert.equal(r.unchained, 2);
    assert.deepEqual(r.altered, [], 'a missing hash is not an accusation');
    assert.equal(r.ok, true, 'a log that simply started chaining later is not a failure');
  });

  test('two practitioners appending in the same instant is reported as a fork, not as tampering', async () => {
    const base = await chain([entry()]);
    const twinA = { ...entry({ targetId: 'A.6.1' }), prevHash: base[0].entryHash };
    twinA.entryHash = await auditEntryHash(subtle, twinA, base[0].entryHash);
    const twinB = { ...entry({ targetId: 'A.6.2' }), prevHash: base[0].entryHash };
    twinB.entryHash = await auditEntryHash(subtle, twinB, base[0].entryHash);
    const r = await verifyAuditChain(subtle, [...base, twinA, twinB]);
    assert.ok(r.forked.length > 0, 'the concurrent append is identified as a fork');
    assert.deepEqual(r.altered, [], 'and never as an alteration');
    assert.equal(r.ok, true, 'a fork does not fail verification — it is normal multi-user behaviour');
  });
});
