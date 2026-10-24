// Internal audit auto-tests: before the auditor opens a workpack line,
// Checkpoint tests it against the scan results, evidence, operating
// records and clause checklists it already holds, and suggests a result
// with a drafted finding. Suggestions only: the auditor decides.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
global.window = global.window || {};
const Lib = require('../public/checkpoint/lib.js');
const app = readFileSync(new URL('../public/checkpoint/app.js', import.meta.url), 'utf8');
const TODAY = '2026-10-24';

const audit = { id: 'AUD-007', fw: 'iso27001', scope: 'Clauses 4-10 and Annex A.8 (technological controls)', auditor: 'Compliance365' };
const wp = {
  controls: [
    { id: 'A.8.5', title: 'Secure authentication', status: 'Implemented', owner: 'IT Manager', evidenceUrl: 'https://x/ev', flags: [] },
    { id: 'A.8.15', title: 'Logging', status: 'Implemented', owner: 'IT Manager', evidenceUrl: 'https://x/log', flags: [] },
    { id: 'A.8.24', title: 'Use of cryptography', status: 'Implemented', owner: '', evidenceUrl: '', flags: [] },
    { id: 'A.8.9', title: 'Configuration management', status: 'Implemented', owner: 'IT Manager', evidenceUrl: 'https://x/cfg', flags: [] }
  ],
  clauses: [
    { id: '9.3.2', title: 'Management review inputs', status: 'In progress', evidenceUrl: '' },
    { id: '6.2', title: 'Objectives', status: 'Implemented', evidenceUrl: 'https://x/obj' },
    { id: '5.2', title: 'Policy', status: 'Implemented', evidenceUrl: 'https://x/pol' }
  ],
  followUps: [{ id: 'ACT-010', title: 'Enforce MFA', type: 'Non-conformity (Minor)', due: '2026-09-01', src: 'Internal audit' }]
};
const ev = {
  lastResults: { 'mfa-all': 'fail', 'device-encryption': 'pass' },
  lastNotes: { 'mfa-all': '3 users without MFA.' },
  checkControls: { 'mfa-all': ['A.5.15', 'A.8.5'], 'device-encryption': ['A.8.24', 'A.8.1'] },
  checkLabels: { 'mfa-all': 'MFA enforced — all users', 'device-encryption': 'Devices encrypted' },
  scanDate: '2026-10-20',
  calendar: [{ id: 'CAL-1', title: 'Security log and alert review', category: 'Log and alert review', freq: 'Monthly', lastCompleted: '2026-10-01', nextDue: '2026-11-01', notes: '[rhythm:log-review] Last evidence: https://x/logrev', status: 'Active' }],
  clauseChecklists: {
    '9.3.2': { items: [{ id: 'a', text: 'Status of actions from previous reviews', status: 'open' }, { id: 'b', text: 'Changes in issues', status: 'open' }], met: 0, total: 2, complete: false },
    '6.2': { items: [{ id: 'a', text: 'Objectives set', status: 'met', how: 'auto' }, { id: 'b', text: 'Objectives measured', status: 'partial', note: '2 of 4 measured' }], met: 1, total: 2, complete: false },
    '5.2': { items: [{ id: 'a', text: 'Policy approved', status: 'met', how: 'auto' }], met: 1, total: 1, complete: true }
  },
  actions: [{ id: 'ACT-010', control: 'A.8.5', status: 'Open', type: 'Non-conformity (Minor)', due: '2026-09-01' }]
};

const r = Lib.auditAutoTest(audit, wp, ev, TODAY);
const L = r.lines;

test('a failing posture check on a control marked Implemented suggests a minor nonconformity, with a drafted finding', () => {
  assert.equal(L['control|A.8.5'].suggest, 'Minor');
  assert.match(L['control|A.8.5'].draft, /A\.8\.5 is marked Implemented, but the posture check “MFA enforced — all users” failed on .*3 users without MFA/);
});

test('Conforms is suggested only on an independent passing test, never on the Implemented claim alone', () => {
  assert.equal(L['control|A.8.15'].suggest, 'C', 'the log review was done with evidence');
  assert.match(L['control|A.8.15'].draft, /^Conforms\. “Security log and alert review” done on/);
  assert.equal(L['control|A.8.9'].suggest, '', 'Implemented with evidence, but nothing tested it');
  assert.equal(L['control|A.8.9'].tests.length, 0);
});

test('a passing scan does not hide missing evidence or a missing owner', () => {
  const t = L['control|A.8.24'];
  assert.equal(t.suggest, 'Minor');
  assert.ok(t.tests.some((x) => x.sev === 'pass' && /Devices encrypted/.test(x.text)));
  assert.ok(t.tests.some((x) => /no evidence linked/.test(x.text)));
  assert.ok(t.tests.some((x) => x.sev === 'OFI' && /no owner/.test(x.text)));
});

test('clause lines: none of the requirements met is a major, some unmet a minor, partly met an OFI, all met conforms', () => {
  assert.equal(L['clause|9.3.2'].suggest, 'Major');
  assert.match(L['clause|9.3.2'].draft, /None of Clause 9\.3\.2’s 2 requirements is met/);
  assert.equal(L['clause|6.2'].suggest, 'OFI');
  assert.equal(L['clause|5.2'].suggest, 'C');
  assert.match(L['clause|5.2'].draft, /The Clause 5\.2 requirement is met, shown by Checkpoint’s records/);
});

test('a clause met only on the organisation\'s own confirmation is a claim to check, not a Conforms', () => {
  const ev4 = Object.assign({}, ev, { clauseChecklists: { '5.2': { items: [{ id: 'a', text: 'Policy approved', status: 'met', how: 'confirmed' }], met: 1, total: 1, complete: true } } });
  const t = Lib.auditAutoTest(audit, wp, ev4, TODAY).lines['clause|5.2'];
  assert.equal(t.suggest, '');
  assert.equal(t.tests[0].sev, 'info');
});

test('a follow-up past due, whose control still fails the scan, is flagged as not resolved', () => {
  const t = L['follow|ACT-010'];
  assert.equal(t.suggest, 'Minor');
  assert.ok(t.tests.some((x) => /still fails/.test(x.text)));
});

test('a policy vs practice gap lands only on the controls of the activity it is about', () => {
  const ev3 = Object.assign({}, ev, { policyGaps: [{ name: 'Logging and Monitoring Policy.html', kind: 'unscheduled', key: 'log-review' }] });
  const wp3 = Object.assign({}, wp, { controls: wp.controls.concat([{ id: 'A.8.16', title: 'Monitoring', status: 'Implemented', owner: 'IT', evidenceUrl: 'https://x', flags: [] }]) });
  const out = Lib.auditAutoTest(audit, wp3, ev3, TODAY).lines;
  assert.ok(out['control|A.8.16'].tests.some((x) => x.source === 'Policy vs practice' && x.sev === 'Minor'));
  assert.ok(out['control|A.8.15'].tests.some((x) => x.source === 'Policy vs practice'));
  assert.ok(!out['control|A.8.9'].tests.some((x) => x.source === 'Policy vs practice'), 'not on unrelated controls');
});

test('the summary counts suggestions and untested lines', () => {
  assert.equal(r.total, 8);
  assert.equal(r.counts.none, 1);
  assert.equal(r.tested, 7);
});

test('the sample is drawn from the records, the same every time for the same audit, and says how it was drawn', () => {
  const ev2 = Object.assign({}, ev, { auditLog: [1, 2, 3, 4, 5].map((n) => ({ action: 'Leaver hand-over: user' + n, targetId: 'user' + n + '@x', entryDateTime: '2026-0' + n + '-10T00:00:00Z' })) });
  const wp2 = Object.assign({}, wp, { controls: [{ id: 'A.5.18', title: 'Access rights', status: 'Implemented', owner: 'IT', evidenceUrl: 'https://x', flags: [] }] });
  const a = Lib.auditAutoTest(audit, wp2, ev2, TODAY).lines['control|A.5.18'];
  const b = Lib.auditAutoTest(audit, wp2, ev2, TODAY).lines['control|A.5.18'];
  assert.equal(a.sample.ids.length, 3);
  assert.deepEqual(a.sample.ids, b.sample.ids);
  assert.match(a.sample.method, /seeded by audit AUD-007/);
  const c = Lib.auditAutoTest(Object.assign({}, audit, { id: 'AUD-008' }), wp2, ev2, TODAY).lines['control|A.5.18'];
  assert.ok(c.sample, 'another audit draws its own sample');
});

test('long findings get a short title that fits SharePoint, with the full text kept as detail', () => {
  const long = 'First sentence about the gap. ' + 'More detail follows here. '.repeat(20);
  const s = Lib.shortFinding(long, 200);
  assert.ok(s.length <= 200);
  assert.equal(s.slice(0, 30), 'First sentence about the gap. ');
  assert.match(app, /detail: String\(r\.note \|\| ''\)\.length > 200 \? r\.note : ''/);
  assert.match(app, /evidence: preset\.detail \|\| ''/);
});

test('the auditor stays in charge: accepting is a click per line, and only Conforms can be accepted in bulk', () => {
  assert.match(app, /acceptAuditSuggestion: async function/);
  assert.match(app, /if \(t\.suggest !== 'C' \|\| \(a\.results\[key\] \|\| \{\}\)\.r\) return;/);
  assert.match(app, /Clause 9\.2 needs the auditor\\u2019s judgement/);
});

test('a result the auditor changes, or a finding they cancel, is no longer reported as Checkpoint\'s', () => {
  assert.match(app, /if \(r\.auto && r\.auto\.suggest !== value\) delete r\.auto;/);
  assert.match(app, /else \{ delete r\.r; delete r\.auto; \}/);
});
