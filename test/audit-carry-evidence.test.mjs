// Making the internal audit lighter for both sides: lines unchanged since
// the last audit carry forward for re-confirming, owners are asked for
// missing evidence a week before the audit, and a client with no audits
// gets one clear first step instead of a page of zeros.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
global.window = global.window || {};
const Lib = require('../public/checkpoint/lib.js');
const app = readFileSync(new URL('../public/checkpoint/app.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../public/checkpoint/index.html', import.meta.url), 'utf8');
const TODAY = '2026-10-24';

const lines = [
  { key: 'control|A.8.5', kind: 'control', id: 'A.8.5', evidenceUrl: 'https://x/mfa' },
  { key: 'control|A.8.15', kind: 'control', id: 'A.8.15', evidenceUrl: 'https://x/log-new' },
  { key: 'control|A.8.9', kind: 'control', id: 'A.8.9', evidenceUrl: '' },
  { key: 'control|A.5.1', kind: 'control', id: 'A.5.1', evidenceUrl: 'https://x/pol' },
  { key: 'clause|9.3', kind: 'clause', id: '9.3', evidenceUrl: 'https://x/mr' },
  { key: 'follow|ACT-1', kind: 'follow', id: 'ACT-1' }
];
const audits = [
  { id: 'AUD-001', fw: 'iso27001', status: 'Completed', completed: '2025-11-20', results: {
    'control|A.8.5': { r: 'C', ev: 'https://x/mfa' },
    'control|A.8.15': { r: 'C', ev: 'https://x/log-old' },
    'control|A.8.9': { r: 'Minor' },
    'control|A.5.1': { r: 'C' },
    'clause|9.3': { r: 'C' },
    'follow|ACT-1': { r: 'C' } } },
  { id: 'AUD-000', fw: 'iso27001', status: 'Completed', completed: '2024-11-20', results: { 'control|A.8.9': { r: 'C' } } }
];
const auto = { lines: {
  'control|A.8.5': { suggest: 'C', tests: [{ sev: 'pass', text: 'ok', source: 'Posture scan' }] },
  'control|A.5.1': { suggest: 'Minor', tests: [{ sev: 'Minor', text: 'policy check fails', source: 'Posture scan' }] },
  'clause|9.3': { suggest: '', tests: [] } } };
const now = { id: 'AUD-002', fw: 'iso27001', status: 'Planned', planned: '2026-11-23', results: {} };
const cf = Lib.auditCarryForward(now, lines, auto, audits);

test('a line that conformed last time, with the same evidence and nothing failing now, carries forward', () => {
  assert.ok(cf['control|A.8.5']);
  assert.match(cf['control|A.8.5'].note, /^Unchanged since AUD-001 \(20 Nov 2025\), where it conformed; the evidence is the same record, and Checkpoint’s tests still pass\. Re-confirmed\.$/);
  assert.ok(cf['clause|9.3'], 'no tests, nothing failing: still offered, with the wording saying so');
  assert.match(cf['clause|9.3'].note, /nothing Checkpoint tests on it has failed since/);
});

test('it never carries when the evidence changed, a test fails now, the last result was not Conforms, or it is a follow-up', () => {
  assert.ok(!cf['control|A.8.15'], 'evidence changed');
  assert.ok(!cf['control|A.5.1'], 'a test fails today');
  assert.ok(!cf['control|A.8.9'], 'the latest audit that covered it found a nonconformity, even though an older one conformed');
  assert.ok(!cf['follow|ACT-1'], 'follow-ups are about open findings');
});

test('only completed audits of the same framework count, never the audit itself', () => {
  assert.deepEqual(Lib.auditCarryForward(now, lines, auto, [Object.assign({}, audits[0], { fw: 'iso42001' })]), {});
  assert.deepEqual(Lib.auditCarryForward(now, lines, auto, [Object.assign({}, audits[0], { status: 'Planned' })]), {});
  assert.deepEqual(Lib.auditCarryForward(Object.assign({}, now, { id: 'AUD-001' }), lines, auto, [audits[0]]), {});
});

test('evidence asks: missing, out of date or overdue for re-verification, unless recorded or carried forward', () => {
  const wp = {
    clauses: [{ id: '9.3', title: 'Management review', owner: 'CEO', evidenceUrl: '', flags: ['No evidence linked'] }],
    controls: [
      { id: 'A.8.5', title: 'Auth', owner: 'IT', evidenceUrl: 'https://x', flags: [] },
      { id: 'A.8.9', title: 'Config', owner: 'IT', evidenceUrl: '', flags: ['No evidence linked'] },
      { id: 'A.8.15', title: 'Logging', owner: 'IT', evidenceUrl: 'https://x/l', flags: [] },
      { id: 'A.8.16', title: 'Monitoring', owner: 'IT', evidenceUrl: 'https://x/m', flags: ['Verification overdue'] },
      { id: 'A.8.24', title: 'Crypto', owner: 'IT', evidenceUrl: '', flags: [] }
    ]
  };
  const auto2 = { lines: { 'control|A.8.15': { tests: [{ sev: 'Minor', source: 'Evidence check', text: 'stale' }] } } };
  const a = Object.assign({}, now, { results: { 'control|A.8.24': { r: 'OFI' } } });
  const r = Lib.auditEvidenceAsks(a, wp, auto2, { 'clause|9.3': { from: 'AUD-001' } }, TODAY);
  assert.deepEqual(r.items.map((x) => x.id + ':' + x.gap), ['A.8.9:none', 'A.8.15:stale', 'A.8.16:reverify']);
  assert.equal(r.due, '2026-11-16', 'a week before the audit');
  assert.equal(Lib.auditEvidenceAsks(Object.assign({}, now, { planned: '2026-10-28' }), wp, auto2, {}, TODAY).due, '2026-10-27', 'never sooner than three days away');
  assert.equal(Lib.auditEvidenceAsks(Object.assign({}, now, { planned: '' }), wp, auto2, {}, TODAY).due, '2026-10-31');
});

test('the owner email says what it is for and by when; the old request email is unchanged', () => {
  const entry = { owner: 'IT Manager', controls: [{ id: 'A.8.9', title: 'Config', evidence: 'An export' }] };
  const audit = Lib.evidenceRequestHtml(entry, 'Acme', '', { auditDate: '2026-11-23', due: '2026-11-16' });
  assert.match(audit, /the internal audit is on 23 Nov 2026\. You own 1 item the auditor will look at\. Please add the evidence described below by <b>16 Nov 2026<\/b>/);
  assert.match(Lib.evidenceRequestHtml(entry, 'Acme', ''), /need evidence for the certification audit/);
});

test('the app: re-confirm per line and in bulk, requests recorded against the audit, evidence remembered with each result', () => {
  assert.match(app, /'Re-confirm' : 'Accept'/);
  assert.match(app, /unchanged since the last audit\)/);
  assert.match(app, /requestAuditEvidence: async function/);
  assert.match(app, /due: asks\.due, audit: a\.id/);
  assert.match(app, /if \(ln && ln\.kind !== 'follow'\) r\.ev = ln\.evidenceUrl \|\| '';/);
  assert.match(app, /Unchanged since ' \+ esc\(r\.auto\.carried\)/);
});

test('a client with no audits sees one clear first step, not four zeros', () => {
  assert.match(html, /id="auditStart"/);
  assert.match(html, /id="auditTable"/);
  assert.match(app, /if \(!audits\.length\) \{ el\.innerHTML = ''; el\.style\.display = 'none'; return; \}/);
  assert.match(app, /Set up your internal audit programme/);
  assert.match(app, /data-action="App\.planAuditProgramme">Plan the audit programme/);
});
