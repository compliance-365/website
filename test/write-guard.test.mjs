// CheckpointLib.createWriteGuard() — the seam that stops SharePoint
// write failures being silent (see app.js "Unsaved changes"). Every
// store write goes through it: transient failures retry once, anything
// still failing is queued (one entry per record) and re-thrown, and a
// later success clears it.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createWriteGuard } = require('../public/checkpoint/lib.js');

function fakeStore(behaviour) {
  const calls = [];
  return {
    calls,
    updateRisk(r) { calls.push(['updateRisk', r.id]); return behaviour(calls.length, r); },
    load() { calls.push(['load']); return 'loaded'; }
  };
}
const httpError = (status) => Object.assign(new Error('HTTP ' + status), { status });

describe('createWriteGuard()', () => {
  test('a successful write passes through untouched and queues nothing', async () => {
    const g = createWriteGuard({ methods: ['updateRisk'], retryDelayMs: 0 });
    const s = g.wrap(fakeStore(() => 'ok'));
    assert.equal(await s.updateRisk({ id: 'R-1' }), 'ok');
    assert.equal(g.count(), 0);
  });

  test('a transient failure is retried once and succeeds without queueing', async () => {
    const g = createWriteGuard({ methods: ['updateRisk'], retryDelayMs: 0 });
    const s = g.wrap(fakeStore((n) => { if (n === 1) throw httpError(503); return 'ok'; }));
    assert.equal(await s.updateRisk({ id: 'R-1' }), 'ok');
    assert.equal(s.calls.length, 2);
    assert.equal(g.count(), 0);
  });

  test('a network failure with no status counts as transient', async () => {
    const g = createWriteGuard({ methods: ['updateRisk'], retryDelayMs: 0 });
    const s = g.wrap(fakeStore((n) => { if (n === 1) throw new TypeError('Failed to fetch'); return 'ok'; }));
    await s.updateRisk({ id: 'R-1' });
    assert.equal(s.calls.length, 2);
  });

  test('a permanent failure is not retried, is queued, and is re-thrown to the caller', async () => {
    let changes = 0;
    const g = createWriteGuard({ methods: ['updateRisk'], retryDelayMs: 0, onChange: () => changes++ });
    const s = g.wrap(fakeStore(() => { throw httpError(403); }));
    await assert.rejects(() => s.updateRisk({ id: 'R-1', _sp: '17' }), /HTTP 403/);
    assert.equal(s.calls.length, 1, 'a 403 will not succeed on retry, so it is not retried');
    assert.equal(g.count(), 1);
    assert.equal(g.pending()[0].label, 'risk R-1');
    assert.ok(changes >= 1, 'onChange fired so the banner can render');
  });

  test('repeated failures on the same record keep one queue entry', async () => {
    const g = createWriteGuard({ methods: ['updateRisk'], retryDelayMs: 0 });
    const s = g.wrap(fakeStore(() => { throw httpError(400); }));
    const r = { id: 'R-1', _sp: '17' };
    await assert.rejects(() => s.updateRisk(r));
    await assert.rejects(() => s.updateRisk(r));
    assert.equal(g.count(), 1);
    await assert.rejects(() => s.updateRisk({ id: 'R-2', _sp: '18' }));
    assert.equal(g.count(), 2);
  });

  test('a later successful save of the same record clears its entry', async () => {
    let fail = true;
    const g = createWriteGuard({ methods: ['updateRisk'], retryDelayMs: 0 });
    const s = g.wrap(fakeStore(() => { if (fail) throw httpError(400); return 'ok'; }));
    const r = { id: 'R-1', _sp: '17' };
    await assert.rejects(() => s.updateRisk(r));
    fail = false;
    await s.updateRisk(r);
    assert.equal(g.count(), 0);
  });

  test('retryAll() re-sends the record as it is NOW, and clears what succeeds', async () => {
    let fail = true;
    const sent = [];
    const g = createWriteGuard({ methods: ['updateRisk'], retryDelayMs: 0 });
    const s = g.wrap({ updateRisk(r) { sent.push(r.status); if (fail) throw httpError(500); return 'ok'; } });
    const r = { id: 'R-1', _sp: '17', status: 'Open' };
    await assert.rejects(() => s.updateRisk(r));
    r.status = 'Closed';           // user keeps editing while it is failing
    fail = false;
    assert.equal(await g.retryAll(), 0);
    assert.equal(sent[sent.length - 1], 'Closed', 'the retry sends the current state, which is what the screen shows');
  });

  test('retryAll() keeps what still fails, with the newest error', async () => {
    const g = createWriteGuard({ methods: ['updateRisk'], retryDelayMs: 0 });
    let n = 0;
    const s = g.wrap({ updateRisk() { n++; throw httpError(n < 3 ? 400 : 409); } });
    await assert.rejects(() => s.updateRisk({ id: 'R-1', _sp: '1' }));
    assert.equal(await g.retryAll(), 1);
    assert.match(g.pending()[0].error, /409|400/);
  });

  test('non-write methods are left alone, and wrapping twice is harmless', async () => {
    const g = createWriteGuard({ methods: ['updateRisk'], retryDelayMs: 0 });
    const store = fakeStore(() => 'ok');
    const load = store.load;
    g.wrap(store); g.wrap(store);
    assert.equal(store.load, load);
    await store.updateRisk({ id: 'R-1' });
    assert.equal(store.calls.length, 1, 'a double wrap would have called through twice');
  });
});
