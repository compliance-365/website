// 1.120.0: My tasks for client owners, auditor access, the Stage 1 /
// Stage 2 booking gate, and action statuses that read Completed / Closed.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const L = require('../public/checkpoint/lib.js');
const app = readFileSync(new URL('../public/checkpoint/app.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../public/checkpoint/index.html', import.meta.url), 'utf8');
const today = '2026-10-06';

describe('booking gate', () => {
  const ready1 = { scopeStatement: 'Scope', md: [{ ref: '4.3', item: 'ISMS scope', status: 'done' }], risks: [{ treat: 'Treat', owner: 'A', status: 'Open' }], soa: { applicable: 90, notStarted: 0, unjustified: 0 }, today };
  test('Stage 1 needs the documented ISMS', () => {
    const r = L.certificationBookingReadiness({ today, md: [{ ref: '5.2', item: 'Information security policy', status: 'missing' }], risks: [], soa: {} });
    assert.equal(r.stage1.ok, false);
    assert.ok(r.stage1.missing.some((m) => /scope statement/.test(m)));
    assert.ok(r.stage1.missing.some((m) => /5.2 Information security policy/.test(m)));
    assert.ok(r.stage1.missing.some((m) => /risk assessment/.test(m)));
    assert.equal(L.certificationBookingReadiness(ready1).stage1.ok, true);
  });
  test('Stage 2 waits for a full internal audit and a management review after it', () => {
    let r = L.certificationBookingReadiness(ready1);
    assert.equal(r.stage2.ok, false);
    assert.ok(r.stage2.missing.some((m) => /internal audit of Clauses 4-10/.test(m)));
    const audits = [{ status: 'Completed', completed: '2026-09-01', scope: 'Clauses 4-10 (management system), pre-certification internal audit' }];
    r = L.certificationBookingReadiness(Object.assign({}, ready1, { audits, reviews: [{ date: '2026-08-01', decisions: 'x' }] }));
    assert.ok(r.stage2.missing.some((m) => /after the internal audit of 2026-09-01/.test(m)), 'a review before the audit does not count');
    r = L.certificationBookingReadiness(Object.assign({}, ready1, { audits, reviews: [{ date: '2026-09-15', decisions: 'x' }] }));
    assert.equal(r.stage2.ok, true);
  });
  test('an open major nonconformity or unstarted control blocks Stage 2', () => {
    const base = Object.assign({}, ready1, { audits: [{ status: 'Completed', completed: '2026-09-01', scope: 'Clauses 4-10' }], reviews: [{ date: '2026-09-15', decisions: 'x' }] });
    assert.equal(L.certificationBookingReadiness(Object.assign({}, base, { actions: [{ id: 'ACT-9', type: 'Non-conformity (Major)', status: 'Open' }] })).stage2.ok, false);
    assert.equal(L.certificationBookingReadiness(Object.assign({}, base, { actions: [{ id: 'ACT-9', type: 'Non-conformity (Major)', status: 'Done' }] })).stage2.ok, true);
    assert.equal(L.certificationBookingReadiness(Object.assign({}, base, { soa: { applicable: 90, notStarted: 2 } })).stage2.ok, false);
  });
  test('a young ISMS gets advice, not a block', () => {
    const r = L.certificationBookingReadiness(Object.assign({}, ready1, { onboardedDate: '2026-09-01' }));
    assert.ok(r.advice.length && /three months/.test(r.advice[0]));
  });
  test('the path step and the certification page book through the gate', () => {
    assert.ok(app.includes("book: { action: 'App.bookCertificationAudit', id: 'iso27001'"));
    assert.ok(app.includes("if (x.s2 && !r.stage2.ok) return 'Stage 2 cannot be booked yet: '"));
  });
});

describe('auditor access', () => {
  const entries = [
    { name: 'A. Auditor', email: 'auditor@bsi.example', from: '2026-10-01', to: '2026-10-20' },
    { name: 'Old', email: 'old@bsi.example', from: '2026-01-01', to: '2026-02-01' },
    { name: 'Gone', email: 'gone@bsi.example', to: '2026-02-01', removed: '2026-02-02' },
    { name: 'Next', email: 'next@bsi.example', from: '2026-11-01', to: '2026-11-10' }
  ];
  test('each window has a state, and expired ones need removing', () => {
    const s = L.auditorAccessState(entries, '', today);
    assert.deepEqual(s.list.map((a) => a.state), ['active', 'expired', 'removed', 'upcoming']);
    assert.deepEqual(s.overdueRemoval.map((a) => a.email), ['old@bsi.example']);
    assert.equal(s.me, null);
  });
  test('the signed-in auditor is recognised by email, case-insensitively', () => {
    assert.equal(L.auditorAccessState(entries, 'AUDITOR@bsi.example', today).me.state, 'active');
    assert.equal(L.auditorAccessState(entries, 'old@bsi.example', today).me.state, 'expired');
  });
  test('the guide, access recording and removal reminder are wired', () => {
    assert.ok(html.includes('id="v-auditor"') && html.includes('data-v="auditor"'));
    assert.ok(app.includes("title: 'Remove auditor access: '"));
    assert.ok(app.includes('Add the guest to the Checkpoint Viewers group'));
  });
});

describe('My tasks and action statuses', () => {
  test('My tasks is first in the menu and kept for staff-only sessions', () => {
    assert.ok(html.indexOf('data-v="mytasks"') < html.indexOf('data-v="dash"'));
    assert.ok(app.includes('var RESTRICTED_NAV_KEEP = { mytasks: true, attestations: true, training: true };'));
    ['App.openAction', 'App.completeCalItem', 'App.editObjective', 'App.addControlEvidenceFiles', 'App.acknowledgeAttestation'].forEach((a) => assert.ok(app.includes("b('" + a + "'"), a));
  });
  test('actions read Completed and Closed, stored values unchanged', () => {
    assert.ok(app.includes("var ACTION_STATUS_LABELS = { Done: 'Completed', Cancelled: 'Closed' };"));
    assert.ok(app.includes("options: ACTION_STATUS_SELECT"));
    assert.ok(app.includes("['Open', 'Overdue', 'Done', 'Cancelled', 'All']"));
  });
});
