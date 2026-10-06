// The partner's owner console shows how far a client has got: the
// client's Checkpoint saves a progress snapshot to its own Settings list
// and the console's Sync reads it. Clauses 4-10 and Annex A are separate
// measures, as an auditor tests them.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
global.window = global.window || {};
const Lib = require('../public/checkpoint/lib.js');
const app = readFileSync(new URL('../public/checkpoint/app.js', import.meta.url), 'utf8');
const owner = readFileSync(new URL('../public/owner/owner.js', import.meta.url), 'utf8');

describe('buildProgressSnapshot()', () => {
  const snap = Lib.buildProgressSnapshot({
    today: '2026-09-30',
    pathSteps: [{ label: 'Scope', phase: 'Set up', done: true }, { label: 'Scan', phase: 'Set up', done: false }, { label: 'Docs', phase: 'Document', done: false }],
    clausesByFw: { iso27001: [{ status: 'Implemented', met: 3, total: 3 }, { status: 'Not started', met: 1, total: 4 }] },
    controlsByFw: { iso27001: [{ app: true, st: 'Implemented' }, { app: true, st: 'Planned' }, { app: true, st: 'Not started' }, { app: false, st: 'Not applicable' }] },
    docs: [{ status: 'Approved' }, { status: 'Draft' }],
    assets: { total: 17, noOwner: 5 },
    risks: [{ status: 'Open' }, { status: 'Closed' }],
    actions: [{ status: 'Open', due: '2026-09-01' }, { status: 'Done', due: '2026-09-01' }, { status: 'Open', due: '2026-12-01' }],
    scopeStatement: 'All MineGuard operations'
  });
  test('path: done, total, the next step and per-phase counts', () => {
    assert.deepEqual(snap.path.next, { label: 'Scan', phase: 'Set up' });
    assert.equal(snap.path.done, 1);
    assert.deepEqual(snap.path.phases, [{ phase: 'Set up', done: 1, total: 2 }, { phase: 'Document', done: 0, total: 1 }]);
  });
  test('clauses and Annex A are separate measures', () => {
    assert.deepEqual(snap.clauses.iso27001, { clauses: 2, implemented: 1, complete: 1, reqMet: 4, reqTotal: 7, pct: 57 });
    assert.deepEqual(snap.annexA.iso27001, { applicable: 3, implemented: 1, inProgress: 1, notStarted: 1, pct: 33 });
  });
  test('documents, registers and the scope statement', () => {
    assert.deepEqual(snap.docs, { generated: 2, approved: 1 });
    assert.deepEqual(snap.registers, { assets: 17, assetsNoOwner: 5, openRisks: 1, overdueActions: 1 });
    assert.equal(snap.scope.statement, 'All MineGuard operations');
    assert.equal(Lib.buildProgressSnapshot({ scopeStatement: 'x'.repeat(5000) }).scope.statement.length, 2000);
  });
  test('parse round-trips and rejects anything malformed', () => {
    assert.deepEqual(Lib.parseProgressSnapshot(JSON.stringify(snap)), snap);
    assert.equal(Lib.parseProgressSnapshot('not json'), null);
    assert.equal(Lib.parseProgressSnapshot(JSON.stringify({ v: 99, path: {} })), null);
    assert.equal(Lib.parseProgressSnapshot(''), null);
  });
});

describe('the client saves it, the console syncs and shows it', () => {
  test('saved to the Settings list, debounced, only when it changes, never from demo or read-only', () => {
    assert.match(app, /if \(!Store \|\| Store\.kind !== 'sharepoint' \|\| READONLY \|\| !S\) return;\n    clearTimeout\(_progressTimer\);/);
    assert.match(app, /if \(prev\) \{ delete prev\.at; if \(JSON\.stringify\(prev\) === body\) return; \}/);
    assert.match(app, /await Store\.setSetting\('progressSnapshot', raw\);/);
    assert.match(app, /renderTrialBanner\(\); scheduleProgressSnapshot\(\); \}/);
  });
  test('Sync reads it and keeps the last good one; the roster stores it', () => {
    assert.match(owner, /i\.fields\.SettingKey === 'progressSnapshot'/);
    assert.match(owner, /if \(summary\.progress\) \{\n\s+c\.progress = summary\.progress;/);
    assert.match(owner, /\{ name: 'Progress', text: \{ allowMultipleLines: true \} \}/);
    assert.match(owner, /'BlockedReason', 'Progress', 'ProgressHistory'\]/);
    assert.match(owner, /Progress: c\.progress \? JSON\.stringify\(c\.progress\) : ''/);
  });
  test('the client panel shows it', () => {
    assert.match(owner, /setupSection\(c\) \+\n\s+progressSection\(c\) \+/);
    assert.match(owner, /clauses 4–10/);
  });
});

describe('clauses and Annex A as two percentages', () => {
  test('clauseReadiness(): requirements met over total, 100 only when all are met', () => {
    assert.deepEqual(Lib.clauseReadiness([{ met: 3, total: 3 }, { met: 1, total: 4 }]), { met: 4, total: 7, pct: 57 });
    assert.equal(Lib.clauseReadiness([{ met: 199, total: 200 }]).pct, 99);
    assert.equal(Lib.clauseReadiness([{ met: 2, total: 2 }]).pct, 100);
    assert.deepEqual(Lib.clauseReadiness([]), { met: 0, total: 0, pct: 0 });
  });
  test('the snapshot carries the clause percentage', () => {
    const s = Lib.buildProgressSnapshot({ clausesByFw: { iso27001: [{ status: 'Implemented', met: 3, total: 3 }, { status: 'Not started', met: 1, total: 4 }] } });
    assert.equal(s.clauses.iso27001.pct, 57);
  });
  test('the dashboard shows a clause tile beside each ISO framework’s Annex A tile', () => {
    assert.match(app, /var MS_CLAUSE_FWS = \['iso27001', 'iso42001', 'iso27701'\];/);
    assert.match(app, /' clauses 4–10<\/span><div class="sub">' \+ cr\.met \+ ' of ' \+ cr\.total \+ ' clause requirements met<\/div>'/);
    assert.match(app, /\(isMs \? ' Annex A controls' : ''\)/);
  });
  test('the console shows both percentages', () => {
    assert.match(owner, /<h4>Readiness<\/h4>/);
    assert.match(owner, /' clauses 4–10<\/span><b>' \+ clausePct\[fw\]\.pct \+ '%<\/b>/);
    assert.match(owner, /' Annex A controls', esc\(x\.pct \+ '% · '/);
  });
});
