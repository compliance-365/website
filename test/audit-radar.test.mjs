// Audit radar: the contradictions an auditor looks for, found across
// registers between audits, each with a severity, the clause or control
// it would be raised against and the one fix. Plus re-testing a finding
// when its action closes, and "new since" tracking.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
global.window = global.window || {};
const Lib = require('../public/checkpoint/lib.js');
const app = readFileSync(new URL('../public/checkpoint/app.js', import.meta.url), 'utf8');
const TODAY = '2026-10-24';

const base = {
  fw: 'iso27001',
  controls: [
    { fw: 'iso27001', id: 'A.8.5', t: 'Secure authentication', app: true, st: 'Implemented', evidenceUrl: 'https://x' },
    { fw: 'iso27001', id: 'A.8.24', t: 'Cryptography', app: true, st: 'Implemented', evidenceUrl: '' },
    { fw: 'iso27001', id: 'A.8.9', t: 'Configuration', app: true, st: 'In progress' },
    { fw: 'iso27001', id: 'A.7.4', t: 'Physical monitoring', app: false, st: 'Not applicable' }
  ],
  risks: [
    { id: 'R-001', status: 'Open', treat: 'Treat', controls: ['A.8.9'], actions: [] },
    { id: 'R-002', status: 'Open', treat: 'Treat', controls: ['A.7.4'], actions: [] },
    { id: 'R-003', status: 'Open', treat: 'Treat', controls: ['A.8.5'], actions: [] }
  ],
  actions: [
    { id: 'ACT-001', type: 'Non-conformity (Minor)', status: 'Open', due: '2026-09-01' },
    { id: 'ACT-002', type: 'Non-conformity (Minor)', status: 'Done', control: 'A.8.5', rootCause: 'x', effectivenessReview: 'y', src: 'Internal audit' },
    { id: 'ACT-003', type: 'Non-conformity (Minor)', status: 'Done', rootCause: '' }
  ],
  objectives: [{ id: 'OBJ-1', metric: '', target: '', status: 'In progress' }, { id: 'OBJ-2', metric: 'MFA %', target: '100', due: '2026-06-30', status: 'In progress' }],
  reviews: [{ date: '2026-08-01', decisions: '' }],
  docs: [{ name: 'Access Control Policy.html', status: 'Approved', nextReview: '2026-01-01' }],
  vendors: [{ id: 'V-1', name: 'Payroll Co', criticality: 'High', nextReviewDue: '2026-01-01' }],
  incidents: [{ id: 'INC-1', status: 'Closed', rootCause: '' }],
  lastResults: { 'mfa-all': 'fail' }, checkControls: { 'mfa-all': ['A.8.5'] }, checkLabels: { 'mfa-all': 'MFA enforced' }, scanDate: '2026-10-20',
  aboveAppetite: ['R-003']
};
const r = Lib.auditRadar(base, TODAY);
const ids = r.items.map((x) => x.id);
const item = (id) => r.items.find((x) => x.id === id);

test('a control claimed Implemented but failing its own posture check is a minor, with the check named', () => {
  assert.ok(item('claimed-failing|A.8.5'));
  assert.match(item('claimed-failing|A.8.5').detail, /“MFA enforced” fails on 20 Oct 2026/);
});

test('several records of one kind are one item, not a dump', () => {
  assert.equal(ids.filter((x) => x === 'claimed-no-evidence').length, 1);
  assert.deepEqual(item('claimed-no-evidence').refs, ['A.8.24']);
});

test('risks relying on missing controls: excluded is a minor, not yet built with no plan is an improvement', () => {
  assert.equal(item('risk-excluded|R-002').sev, 'Minor');
  assert.equal(item('risk-unbacked|R-001').sev, 'OFI');
  assert.ok(!ids.includes('risk-unbacked|R-003'), 'a risk whose controls are implemented is fine');
  assert.ok(ids.includes('risk-unaccepted'));
});

test('objectives, management review, corrective action, documents, suppliers and incidents are cross-checked', () => {
  ['objective-unmeasurable', 'objective-overdue', 'mr-no-outputs|2026-08-01', 'nc-overdue', 'nc-unproven', 'docs-overdue', 'supplier-overdue', 'incident-no-cause']
    .forEach((id) => assert.ok(ids.includes(id), id));
  assert.deepEqual(item('nc-unproven').refs, ['ACT-003']);
});

test('a closed finding whose control fails its check again is flagged: the fix has not held', () => {
  assert.ok(item('fix-not-holding'));
  assert.deepEqual(item('fix-not-holding').refs, ['ACT-002']);
});

test('no management review in a year is a major; every item has a fix and items are ordered by severity', () => {
  const r2 = Lib.auditRadar({ fw: 'iso27001' }, TODAY);
  assert.equal(r2.items[0].id, 'mr-none');
  assert.equal(r2.items[0].sev, 'Major');
  r.items.forEach((x) => assert.ok(x.fix && x.fix.action && x.fix.label, x.id));
  const rank = { Major: 0, Minor: 1, OFI: 2 };
  for (let i = 1; i < r.items.length; i++) assert.ok(rank[r.items[i - 1].sev] <= rank[r.items[i].sev]);
});

test('"new since" tracking: first-seen dates carry over, new items get today, gone items count as resolved', () => {
  const t1 = Lib.radarTrack(null, [{ id: 'a' }, { id: 'b' }], '2026-10-01');
  assert.deepEqual(t1.seen, { a: '2026-10-01', b: '2026-10-01' });
  const t2 = Lib.radarTrack(t1, [{ id: 'b' }, { id: 'c' }], '2026-10-24');
  assert.deepEqual(t2.seen, { b: '2026-10-01', c: '2026-10-24' });
  assert.deepEqual(t2.resolved, ['a']);
  assert.equal(t2.added, 1);
  assert.ok(!Lib.radarTrack(t2, [{ id: 'b' }, { id: 'c' }], '2026-10-25').changed, 'nothing to save when nothing changed');
});

test('radar findings reach the matching workpack lines, without duplicating the line-level tests', () => {
  const radar = r.items;
  const wp = { controls: [{ id: 'A.8.9', title: 'Configuration', status: 'In progress', owner: 'IT', flags: [] }], clauses: [{ id: '10.2', title: 'Nonconformity', status: 'Implemented', evidenceUrl: 'https://x' }], followUps: [] };
  const L = Lib.auditAutoTest({ id: 'AUD-1', fw: 'iso27001' }, wp, { radar }, TODAY).lines;
  assert.ok(L['control|A.8.9'].tests.some((t) => t.source === 'Audit radar' && /R-001/.test(t.text)));
  assert.ok(L['clause|10.2'].tests.some((t) => t.source === 'Audit radar' && /ACT-003/.test(t.text)));
  assert.equal(L['clause|10.2'].suggest, 'Minor');
  const wp2 = { controls: [{ id: 'A.8.5', title: 'Auth', status: 'Implemented', owner: 'IT', evidenceUrl: 'https://x', flags: [] }], clauses: [], followUps: [] };
  const L2 = Lib.auditAutoTest({ id: 'AUD-1', fw: 'iso27001' }, wp2, Object.assign({}, base, { radar }), TODAY).lines;
  assert.ok(!L2['control|A.8.5'].tests.some((t) => t.source === 'Audit radar' && /fails its posture check/.test(t.text)), 'the scan test already says it');
});

test('re-testing a finding: passing checks mean effective, any failing check means not yet, none means untested', () => {
  const ev = { lastResults: { 'mfa-all': 'pass', 'mfa-priv': 'fail' }, checkControls: { 'mfa-all': ['A.8.5'], 'mfa-priv': ['A.8.2'] }, checkLabels: { 'mfa-all': 'MFA all' }, scanDate: '2026-10-20' };
  const fixed = Lib.findingRetest({ control: 'A.8.5' }, ev, TODAY);
  assert.equal(fixed.state, 'fixed');
  assert.match(fixed.text, /^Re-tested by Checkpoint on 24 Oct 2026 for A\.8\.5: .*The correction is effective\.$/);
  assert.equal(Lib.findingRetest({ control: 'A.8.2' }, ev, TODAY).state, 'failing');
  assert.equal(Lib.findingRetest({ control: 'A.5.1' }, ev, TODAY).state, 'untested');
  assert.equal(Lib.findingRetest({}, ev, TODAY).state, 'untested');
});

test('the app wires it: radar on the Audits page, re-test in the action drawer and on completion, saved only when it changes', () => {
  assert.match(app, /renderAuditsDashboard\(\);\n\s+renderAuditRadar\(\);/);
  assert.match(app, /retestBlockHtml\(a\) \+/);
  assert.match(app, /still fails its posture check\. Re-run the scan/);
  assert.match(app, /if \(tr\.changed && !READONLY && Store\.kind !== 'demo'\)/);
  assert.match(readFileSync(new URL('../public/checkpoint/index.html', import.meta.url), 'utf8'), /id="auditRadar"/);
});
