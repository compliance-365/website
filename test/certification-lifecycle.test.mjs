// The certification lifecycle — certificationCycle(),
// internalAuditCoverage() and internalAuditProgramme() in lib.js. These
// decide which certification body audit is next and by when, and whether
// the internal audits in a cycle covered the whole ISMS, so the date
// maths and the scope parsing are pinned here.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { certificationCycle, internalAuditCoverage, internalAuditProgramme, addMonthsIso } = require('../public/checkpoint/lib.js');

describe('addMonthsIso()', () => {
  test('clamps to the end of a shorter month instead of rolling over', () => {
    assert.equal(addMonthsIso('2024-01-31', 1), '2024-02-29');
    assert.equal(addMonthsIso('2025-08-31', 1), '2025-09-30');
    assert.equal(addMonthsIso('2025-11-15', 36), '2028-11-15');
  });
});

describe('certificationCycle()', () => {
  const cert = { issued: '2025-11-15' };

  test('schedules surveillance at 12 and 24 months and recertification by expiry (3 years by default)', () => {
    const c = certificationCycle(cert, '2026-01-01');
    assert.deepEqual(c.milestones.map((m) => [m.key, m.dueBy]), [['s1', '2026-11-15'], ['s2', '2027-11-15'], ['recert', '2028-11-15']]);
    assert.equal(c.expires, '2028-11-15');
    assert.equal(c.next.key, 's1');
  });

  test('an explicit expiry date wins for the recertification deadline', () => {
    assert.equal(certificationCycle({ issued: '2025-11-15', expires: '2028-10-01' }, '2026-01-01').milestones[2].dueBy, '2028-10-01');
  });

  test('states: upcoming, due-soon within 90 days, overdue after the due date, done once recorded', () => {
    assert.equal(certificationCycle(cert, '2026-01-01').next.state, 'upcoming');
    assert.equal(certificationCycle(cert, '2026-09-01').next.state, 'due-soon');
    assert.equal(certificationCycle(cert, '2026-12-01').next.state, 'overdue');
    const done = certificationCycle({ issued: '2025-11-15', audits: { s1: { date: '2026-10-20', result: 'Certification maintained' } } }, '2026-12-01');
    assert.equal(done.milestones[0].state, 'done');
    assert.equal(done.next.key, 's2', 'the next audit moves on once the first is recorded');
  });

  test('no issue date means nothing is scheduled rather than a guessed cycle', () => {
    const c = certificationCycle({}, '2026-01-01');
    assert.ok(c.milestones.every((m) => m.dueBy === ''));
  });
});

describe('internalAuditCoverage()', () => {
  const done = (scope, extra) => Object.assign({ status: 'Completed', completed: '2026-03-01', fw: 'iso27001', scope }, extra || {});

  test('reads clause ranges and Annex A themes from scope text', () => {
    const c = internalAuditCoverage([done('Clauses 4-6 and access control (Annex A.5, A.8.15)')], 'iso27001', '2025-11-15');
    assert.deepEqual(c.missing, ['Clause 7', 'Clause 8', 'Clause 9', 'Clause 10', 'Annex A.6', 'Annex A.7']);
  });

  test('"full ISMS" covers every clause; bare "Annex A" covers every theme', () => {
    assert.deepEqual(internalAuditCoverage([done('Full ISMS audit and Annex A')], 'iso27001', '').missing, []);
  });

  test('planned audits, audits before the cycle, and other frameworks do not count', () => {
    const audits = [
      done('Clauses 4-10', { status: 'Planned', completed: '' }),
      done('Clauses 4-10', { completed: '2025-01-01' }),
      done('Clauses 4-10', { fw: 'iso42001' })
    ];
    assert.equal(internalAuditCoverage(audits, 'iso27001', '2025-11-15').pct, 0);
  });

  test('unrecognised wording is not guessed at', () => {
    assert.equal(internalAuditCoverage([done('Access control and supplier management')], 'iso27001', '').pct, 0);
  });
});

describe('internalAuditProgramme()', () => {
  test('every scope it plans is one internalAuditCoverage() reads as full coverage', () => {
    const plan = internalAuditProgramme({ issued: '2025-11-15' });
    assert.equal(plan.length, 6);
    const asCompleted = plan.map((p) => ({ status: 'Completed', completed: p.planned, fw: 'iso27001', scope: p.scope }));
    assert.deepEqual(internalAuditCoverage(asCompleted, 'iso27001', '2025-11-15').missing, []);
  });

  test('each audit sits two months before the certification body visit it prepares for', () => {
    const plan = internalAuditProgramme({ issued: '2025-11-15' });
    assert.deepEqual([...new Set(plan.map((p) => p.planned))], ['2026-09-15', '2027-09-15', '2028-06-15']);
  });
});
