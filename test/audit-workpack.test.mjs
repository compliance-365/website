// The internal audit workpack — parseAuditScope() and auditWorkpack() in
// lib.js. The workpack decides which clauses and controls an internal
// auditor is handed and which are flagged to look at first, so scope
// parsing and the flags are pinned here.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { parseAuditScope, auditWorkpack, CLAUSE_AUDIT_PROMPTS } = require('../public/checkpoint/lib.js');

describe('parseAuditScope()', () => {
  test('reads clause ranges, single clauses and Annex A themes', () => {
    const s = parseAuditScope('Clauses 4-6 and clause 9, Annex A.5 and A.8');
    assert.deepEqual(s.clauses, ['4', '5', '6', '9']);
    assert.deepEqual(s.themes, ['A.5', 'A.8']);
    assert.equal(s.allControls, false);
  });

  test('a bare "Annex A" means every theme; "full ISMS" means every clause but no controls', () => {
    assert.deepEqual(parseAuditScope('Annex A controls').themes, ['A.5', 'A.6', 'A.7', 'A.8']);
    assert.equal(parseAuditScope('Annex A controls').allControls, true);
    const full = parseAuditScope('Full ISMS');
    assert.deepEqual(full.clauses, ['4', '5', '6', '7', '8', '9', '10']);
    assert.deepEqual(full.themes, []);
  });

  test('wording it cannot read covers nothing', () => {
    const s = parseAuditScope('HR onboarding walkthrough');
    assert.deepEqual(s.clauses, []);
    assert.deepEqual(s.themes, []);
    assert.equal(s.allControls, false);
  });

  test('reads the scopes internalAuditProgramme() writes', () => {
    assert.deepEqual(parseAuditScope('Clauses 4-10 (management system), year 1 of the certification cycle').clauses.length, 7);
    assert.deepEqual(parseAuditScope('Annex A.6 and A.7 (people and physical controls), year 2 of the certification cycle').themes, ['A.6', 'A.7']);
  });

  test('every Harmonized Structure clause has an audit prompt', () => {
    ['4', '5', '6', '7', '8', '9', '10'].forEach((n) => assert.ok(CLAUSE_AUDIT_PROMPTS[n], 'clause ' + n));
  });
});

describe('auditWorkpack()', () => {
  const today = '2026-09-24';
  const data = {
    clauses: [
      { id: '4.1', fw: 'iso27001', t: 'Context', st: 'Implemented', evidenceUrl: 'https://x/4.1', verified: '2026-06-01' },
      { id: '6.1.2', fw: 'iso27001', t: 'Risk assessment', st: 'In progress', evidenceUrl: '' },
      { id: '9.2', fw: 'iso27001', t: 'Internal audit', st: 'Implemented', evidenceUrl: 'https://x/9.2', verified: '2025-01-01' },
      { id: '4.1', fw: 'iso42001', t: 'Context (AI)', st: 'Implemented', evidenceUrl: 'https://x/ai' }
    ],
    controls: [
      { id: 'A.5.1', fw: 'iso27001', t: 'Policies', app: true, st: 'Implemented', evidenceUrl: 'https://x/a51', verified: '2026-09-01' },
      { id: 'A.5.19', fw: 'iso27001', t: 'Supplier security', app: true, st: 'Implemented', evidenceUrl: 'https://x/a519', verified: '2026-09-01' },
      { id: 'A.5.7', fw: 'iso27001', t: 'Threat intelligence', app: true, st: 'Not started', evidenceUrl: '' },
      { id: 'A.5.30', fw: 'iso27001', t: 'ICT readiness', app: false, st: 'Not started' },
      { id: 'A.8.5', fw: 'iso27001', t: 'Secure authentication', app: true, st: 'Implemented', evidenceUrl: 'https://x/a85', verified: '2026-09-01' }
    ],
    risks: [{ id: 'R-001', L: 4, I: 4, status: 'Open', controls: ['A.5.19'], actions: [] }],
    actions: [
      { id: 'ACT-001', control: 'A.5.1', status: 'Open', src: 'Posture scan', title: 'x' },
      { id: 'ACT-002', status: 'Open', src: 'Internal audit', title: 'Missing supplier reviews', type: 'Non-conformity (Minor)', due: '2026-10-01' },
      { id: 'ACT-003', status: 'Open', src: 'Certification audit (ISO 27001)', title: 'CB minor', type: 'Non-conformity (Minor)' },
      { id: 'ACT-004', status: 'Done', src: 'Internal audit', title: 'Closed finding' },
      { id: 'ACT-005', status: 'Cancelled', control: 'A.5.19', src: 'Posture scan', title: 'Cancelled' }
    ],
    audits: [
      { id: 'AUD-001', fw: 'iso27001', status: 'Completed', completed: '2025-10-01', scope: 'Clauses 4-10', summary: 'Two minors.' },
      { id: 'AUD-002', fw: 'iso27001', status: 'Completed', completed: '2026-03-01', scope: 'Annex A.8', summary: 'Clean.' }
    ]
  };

  test('includes only the in-scope clauses of the audited framework, with flags', () => {
    const wp = auditWorkpack({ id: 'AUD-003', fw: 'iso27001', scope: 'Clauses 4-6 and Annex A.5' }, data, today);
    assert.deepEqual(wp.clauses.map((c) => c.id), ['4.1', '6.1.2']);
    assert.deepEqual(wp.clauses[0].flags, []);
    assert.deepEqual(wp.clauses[1].flags, ['Not implemented', 'No evidence linked']);
    assert.deepEqual(wp.prompts.map((p) => p.clause), ['4', '5', '6']);
  });

  test('flags evidence not re-verified in twelve months', () => {
    const wp = auditWorkpack({ id: 'AUD-003', fw: 'iso27001', scope: 'Clause 9' }, data, today);
    assert.deepEqual(wp.clauses[0].flags, ['Evidence not re-verified in 12 months']);
  });

  test('includes applicable controls in the themes, flagged ones first', () => {
    const wp = auditWorkpack({ id: 'AUD-003', fw: 'iso27001', scope: 'Annex A.5' }, data, today);
    const ids = wp.controls.map((c) => c.id);
    assert.ok(!ids.includes('A.5.30'), 'excluded control left out');
    assert.ok(!ids.includes('A.8.5'), 'other theme left out');
    assert.deepEqual(new Set(ids), new Set(['A.5.1', 'A.5.19', 'A.5.7']));
    const byId = Object.fromEntries(wp.controls.map((c) => [c.id, c]));
    assert.deepEqual(byId['A.5.7'].flags, ['Not implemented', 'No evidence linked']);
    assert.deepEqual(byId['A.5.19'].flags, ['Treats a high risk'], 'cancelled action not counted');
    assert.deepEqual(byId['A.5.1'].flags, ['Open action ACT-001']);
    assert.equal(wp.controls[wp.controls.length - 1].priority, true);
  });

  test('lists open audit findings to verify, and the latest previous audit', () => {
    const wp = auditWorkpack({ id: 'AUD-003', fw: 'iso27001', scope: 'Clauses 4-10' }, data, today);
    assert.deepEqual(wp.followUps.map((f) => f.id), ['ACT-002', 'ACT-003']);
    assert.equal(wp.previous.id, 'AUD-002');
  });

  test('flags items the auditor owns (clause 9.2.2: auditors do not audit their own work)', () => {
    const own = { ...data, clauses: [{ id: '5.2', fw: 'iso27001', t: 'Policy', st: 'Implemented', evidenceUrl: 'https://x', own: 'K. Patel' }] };
    const wp = auditWorkpack({ id: 'AUD-003', fw: 'iso27001', scope: 'Clause 5', auditor: 'k. patel' }, own, today);
    assert.deepEqual(wp.clauses[0].flags, ['Auditor owns this \u2014 needs another auditor']);
    const unassigned = auditWorkpack({ id: 'AUD-003', fw: 'iso27001', scope: 'Clause 5', auditor: 'Unassigned' }, { ...own, clauses: [{ ...own.clauses[0], own: 'Unassigned' }] }, today);
    assert.deepEqual(unassigned.clauses[0].flags, []);
  });

  test('ISO 42001 audits use the AIMS clauses; a scope it cannot read is reported as unreadable', () => {
    const wp = auditWorkpack({ id: 'AUD-004', fw: 'iso42001', scope: 'Clause 4' }, data, today);
    assert.deepEqual(wp.clauses.map((c) => c.title), ['Context (AI)']);
    assert.equal(auditWorkpack({ id: 'AUD-005', fw: 'iso27001', scope: 'Walkthrough' }, data, today).readable, false);
  });
});
