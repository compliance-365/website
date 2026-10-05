// The certification workflow Checkpoint runs end to end (1.116.0):
// objectives that measure themselves, one next step per Annex A control,
// internal audits conducted in the app, management review actions and
// minutes, register snapshots filed as clause evidence, and the Stage 1
// pack for the certification body.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const L = require('../public/checkpoint/lib.js');
const app = readFileSync(new URL('../public/checkpoint/app.js', import.meta.url), 'utf8');
const store = readFileSync(new URL('../public/checkpoint/store.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../public/checkpoint/index.html', import.meta.url), 'utf8');
const today = '2026-10-05';

describe('objectives measure themselves', () => {
  const posture = { metric: 'Checkpoint posture score', due: '2027-10-01' };
  test('a suggested objective reads its number and its status follows', () => {
    assert.equal(L.measureObjective(posture, { scans: [{ score: 70 }, { score: 84 }] }, today).status, 'On track');
    assert.equal(L.measureObjective(posture, { scans: [{ score: 61 }] }, today).status, 'At risk');
  });
  test('after the due date it is Achieved or Missed', () => {
    const past = Object.assign({}, posture, { due: '2026-09-01' });
    assert.equal(L.measureObjective(past, { scans: [{ score: 90 }] }, today).status, 'Achieved');
    assert.equal(L.measureObjective(past, { scans: [{ score: 50 }] }, today).status, 'Missed');
  });
  test('the client\'s own objectives and missing data are left alone', () => {
    assert.equal(L.measureObjective({ metric: 'Customer NPS', target: '50' }, {}, today), null);
    assert.equal(L.measureObjective(posture, { scans: [] }, today), null);
  });
  test('training, actions and AI impact are measured from the registers', () => {
    const tr = L.measureObjective({ metric: 'Staff with current security awareness training' }, { training: [{ status: 'Completed' }, { status: 'Completed' }, { status: 'Assigned', due: '2027-01-01' }] }, today);
    assert.equal(tr.value, 67);
    const ac = L.measureObjective({ metric: 'Actions closed by their due date' }, { actions: [{ due: '2026-09-01', status: 'Done' }, { due: '2026-09-02', status: 'Open' }, { due: '2027-01-01', status: 'Open' }] }, today);
    assert.equal(ac.value, 50);
    const ai = L.measureObjective({ metric: 'AI systems with a completed impact assessment, reviewed within 12 months' }, { aiSystems: [{ impactAssessmentStatus: 'Completed', lastReviewed: '2026-06-01' }] }, today);
    assert.equal(ai.met, true);
  });
  test('every suggested objective can be measured or is deliberately left to its owner', () => {
    L.SUGGESTED_OBJECTIVES.forEach((o) => assert.doesNotThrow(() => L.measureObjective({ metric: o.metric }, {}, today), o.key));
  });
  test('the app syncs status and shows the reading', () => {
    assert.ok(app.includes('syncObjectiveMeasures();'));
    assert.ok(app.includes('Measured by Checkpoint: '));
  });
});

describe('Annex A plan', () => {
  const ctl = (id, extra) => Object.assign({ fw: 'iso27001', id, app: true, st: 'Not started' }, extra);
  const base = { fw: 'iso27001', today, templates: [], checkControls: { mfa: ['A.8.5'], legacy: ['A.8.5'], backup: ['A.8.13'] } };
  const plan = (controls, d) => L.annexAPlan(controls, Object.assign({}, base, d));
  test('an exclusion with no justification needs one; with one it is done', () => {
    assert.equal(plan([ctl('A.7.6', { app: false })])[0].step, 'justify');
    assert.equal(plan([ctl('A.7.6', { app: false, just: 'No premises' })]).length, 0);
  });
  test('a control every posture check proves, with evidence, is Checkpoint\'s to mark', () => {
    const p = plan([ctl('A.8.5', { evidenceUrl: 'https://x/ev.json' })], { lastResults: { mfa: 'pass', legacy: 'pass' } });
    assert.equal(p[0].step, 'scan');
    assert.equal(L.ANNEX_STEPS.scan.by, 'checkpoint');
  });
  test('a failing check sends the client to the scan', () => {
    assert.equal(plan([ctl('A.8.5')], { lastResults: { mfa: 'pass', legacy: 'fail' } })[0].step, 'scanFix');
  });
  test('an unapproved document, then the operating rhythm, then evidence', () => {
    const t = [{ id: 'access-control-policy', title: 'Access Control Policy', controls: ['A.5.15'], frameworks: ['iso27001'] }];
    assert.equal(plan([ctl('A.5.15')], { templates: t })[0].step, 'doc');
    assert.equal(plan([ctl('A.5.15')], { templates: t, docs: [{ tplId: 'access-control-policy', status: 'Approved' }] })[0].step, 'rhythm');
    const cal = [{ title: 'Access review', category: 'Access control review', status: 'Active' }];
    assert.equal(plan([ctl('A.5.15')], { templates: t, docs: [{ tplId: 'access-control-policy', status: 'Approved' }], calendar: cal })[0].step, 'rhythmRun');
    cal[0].lastCompleted = '2026-09-01';
    assert.equal(plan([ctl('A.5.15')], { templates: t, docs: [{ tplId: 'access-control-policy', status: 'Approved' }], calendar: cal })[0].step, 'evidence');
  });
  test('an Implemented control needs evidence, then only a re-verification when due', () => {
    assert.equal(plan([ctl('A.5.1', { st: 'Implemented' })])[0].step, 'evidence');
    assert.equal(plan([ctl('A.5.1', { st: 'Implemented', evidenceUrl: 'u', verified: '2025-01-01' })])[0].step, 'reverify');
    assert.equal(plan([ctl('A.5.1', { st: 'Implemented', evidenceUrl: 'u', verified: '2026-09-30' })]).length, 0);
  });
  test('groups put Checkpoint\'s steps first, and every step has an app action', () => {
    const g = L.annexAPlanGroups(plan([ctl('A.7.6', { app: false }), ctl('A.8.5', { evidenceUrl: 'e' })], { lastResults: { mfa: 'pass', legacy: 'pass' } }));
    assert.equal(g[0].step, 'scan');
    Object.values(L.ANNEX_STEPS).forEach((f) => assert.match(app, new RegExp('\\n    ' + f.action.replace('App.', '') + ': (async )?function'), f.action));
  });
  test('the SoA shows the panel', () => {
    assert.ok(html.includes('id="soaAnnexPlan"'));
  });
});

describe('internal audit in Checkpoint', () => {
  const wp = { followUps: [{ id: 'ACT-1', title: 'Old NC' }], clauses: [{ id: '4.1', title: 'Context', flags: [] }], controls: [{ id: 'A.5.15', title: 'Access', flags: ['No evidence linked'] }] };
  test('lines in audit order with stable keys', () => {
    assert.deepEqual(L.auditWorkpackLines(wp).map((l) => l.key), ['follow|ACT-1', 'clause|4.1', 'control|A.5.15']);
  });
  test('the summary counts results and draws the conclusion', () => {
    const lines = L.auditWorkpackLines(wp);
    const s = L.auditResultsSummary(lines, { 'follow|ACT-1': { r: 'C' }, 'clause|4.1': { r: 'Minor', ref: 'ACT-9' } });
    assert.equal(s.assessed, 2); assert.equal(s.Minor, 1); assert.deepEqual(s.refs, ['ACT-9']); assert.deepEqual(s.unassessed, ['control|A.5.15']);
    assert.match(s.conclusion, /except for 1 minor/);
    assert.match(L.auditResultsSummary(lines, { 'clause|4.1': { r: 'Major' } }).conclusion, /does not conform/);
  });
  test('results survive a reload: stored in the Audits list and reconciled on older tenants', () => {
    assert.deepEqual(L.parseAuditResults('{"clause|4.1":{"r":"C"}}'), { 'clause|4.1': { r: 'C' } });
    assert.deepEqual(L.parseAuditResults('nonsense'), {});
    assert.ok(store.includes("{ name: 'Results', text: { allowMultipleLines: true } }"));
    assert.ok(store.includes("Audits: ['Results']"));
    assert.ok(store.includes('Results: JSON.stringify(a.results || {})'));
  });
});

describe('management review outputs', () => {
  test('agreed actions parse into what, owner and due date', () => {
    const a = L.parseReviewActionLines('- Run a phishing simulation; IT Manager; 2026-12-01\nBudget for a penetration test | CFO | 15/11/2026\nReview the scope', today);
    assert.deepEqual(a[0], { title: 'Run a phishing simulation', owner: 'IT Manager', due: '2026-12-01' });
    assert.equal(a[1].due, '2026-11-15');
    assert.deepEqual(a[2], { title: 'Review the scope', owner: '', due: '2027-01-03' });
  });
  test('a number in the action is not mistaken for a date', () => {
    assert.equal(L.parseReviewActionLines('Hire 2 analysts; HR', today)[0].title, 'Hire 2 analysts');
  });
  test('the form, the minutes and the evidence filing are wired', () => {
    assert.ok(html.includes('id="naReviewActions"'));
    assert.ok(app.includes("'Actions: ' + raised.join(', ')"));
    ['minutes:', 'objectives:', 'training:', 'capa:', 'stage1:'].forEach((k) => assert.ok(app.includes('\n    ' + k + ' function'), k));
  });
});

describe('clause evidence snapshots', () => {
  test('every snapshot is a report Checkpoint builds', () => {
    Object.values(L.CLAUSE_SNAPSHOTS).flat().forEach((t) => assert.ok(new RegExp('\\n    ' + t + ': function').test(app), t));
  });
  test('the record-based clauses are covered', () => {
    ['6.1.2', '6.1.3', '6.2', '7.2', '8.2', '8.3', '9.1', '10.2'].forEach((c) => assert.ok(L.CLAUSE_SNAPSHOTS[c], c));
  });
});
