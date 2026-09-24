// The management system clauses register (window.CLAUSE_DEFS) carries
// both ISO 27001's and ISO 42001's Clauses 4-10. The two standards share
// the Harmonized Structure numbering, so "4.1" exists twice and every
// lookup has to be by framework AND code — these tests pin that the
// definitions stay unambiguous on that key and complete per framework.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
global.window = global.window || {};
window.CHECKPOINT_CONFIG = window.CHECKPOINT_CONFIG || { scopesProvision: [] };
require('../public/checkpoint/store.js');

const DEFS = window.CLAUSE_DEFS;
const codesFor = (fw) => DEFS.filter((c) => c.fw === fw).map((c) => c.code);

describe('CLAUSE_DEFS', () => {
  test('fw|code is unique — the key every clause action resolves by', () => {
    const keys = DEFS.map((c) => c.fw + '|' + c.code);
    assert.equal(keys.length, new Set(keys).size, 'duplicate fw|code in CLAUSE_DEFS');
  });

  test('codes do collide across frameworks, which is why code alone is never a key', () => {
    const shared = codesFor('iso27001').filter((c) => codesFor('iso42001').includes(c));
    assert.ok(shared.includes('4.1') && shared.includes('10.2'));
  });

  test('every framework is a real framework id', () => {
    DEFS.forEach((c) => assert.ok(window.FRAMEWORK_ORDER.includes(c.fw), `${c.fw} is not in FRAMEWORK_ORDER`));
  });

  test('both management systems run Clause 4 through Clause 10', () => {
    ['iso27001', 'iso42001'].forEach((fw) => {
      const tops = new Set(codesFor(fw).map((c) => c.split('.')[0]));
      ['4', '5', '6', '7', '8', '9', '10'].forEach((n) => assert.ok(tops.has(n), `${fw} has no Clause ${n} row`));
    });
  });

  test('ISO 42001 carries its AI system impact assessment requirements, which ISO 27001 has no equivalent of', () => {
    assert.ok(codesFor('iso42001').includes('6.1.4'));
    assert.ok(codesFor('iso42001').includes('8.4'));
    assert.ok(!codesFor('iso27001').includes('6.1.4'));
  });

  test('Clause 10 rows point at where their evidence lives', () => {
    DEFS.filter((c) => /^10\./.test(c.code)).forEach((c) => {
      assert.ok(c.hint && c.hint.trim(), `${c.fw} ${c.code} has no hint`);
    });
  });
});

describe('CLAUSE_DOCUMENT_MAP and clauseUpdatesForDocument()', () => {
  require('../public/checkpoint/templates.js');
  const { clauseUpdatesForDocument } = require('../public/checkpoint/lib.js');
  const MAP = window.CLAUSE_DOCUMENT_MAP;
  const URL = 'https://tenant.sharepoint.com/Docs/ISMS%20Scope%20Document.html';
  const row = (fw, id, extra) => Object.assign({ fw, id, st: 'Not started', evidenceUrl: '' }, extra || {});

  test('every mapped template exists and every mapped clause is a real fw|code', () => {
    const ids = new Set(window.POLICY_TEMPLATES.map((t) => t.id));
    const keys = new Set(DEFS.map((c) => c.fw + '|' + c.code));
    Object.entries(MAP).forEach(([tpl, list]) => {
      assert.ok(ids.has(tpl), `CLAUSE_DOCUMENT_MAP names template "${tpl}", which does not exist`);
      list.forEach((m) => assert.ok(keys.has(m.fw + '|' + m.code), `${tpl} maps to ${m.fw} ${m.code}, which is not in CLAUSE_DEFS`));
    });
  });

  test('a mapped template is offered to a tenant that has the clause framework', () => {
    Object.entries(MAP).forEach(([tpl, list]) => {
      const t = window.POLICY_TEMPLATES.find((x) => x.id === tpl);
      list.forEach((m) => assert.ok(t.frameworks.includes(m.fw), `${tpl} maps to ${m.fw} clauses but is not tagged ${m.fw}`));
    });
  });

  test('a generated draft links evidence and moves Not started to In progress — never to Implemented', () => {
    const clauses = [row('iso27001', '4.3')];
    const u = clauseUpdatesForDocument(MAP['isms-scope'], clauses, URL, 'generated');
    assert.deepEqual(u.map((x) => x.set), [{ evidenceUrl: URL, st: 'In progress' }]);
  });

  test('approval marks Implemented only where the document itself satisfies the clause', () => {
    const scope = clauseUpdatesForDocument(MAP['isms-scope'], [row('iso27001', '4.3', { st: 'In progress', evidenceUrl: URL })], URL, 'approved');
    assert.deepEqual(scope.map((x) => x.set), [{ st: 'Implemented' }]);
    const audit = clauseUpdatesForDocument(MAP['internal-audit-procedure'], [row('iso27001', '9.2', { st: 'In progress', evidenceUrl: URL })], URL, 'approved');
    assert.deepEqual(audit, [], 'an approved audit procedure is not proof audits have been run');
  });

  test('never overwrites a different evidence link, and never changes an Implemented clause\'s status', () => {
    const other = clauseUpdatesForDocument(MAP['isms-scope'], [row('iso27001', '4.3', { evidenceUrl: 'https://elsewhere/scope.pdf' })], URL, 'approved');
    assert.deepEqual(other, []);
    const done = clauseUpdatesForDocument(MAP['isms-scope'], [row('iso27001', '4.3', { st: 'Implemented', evidenceUrl: 'https://elsewhere/x.pdf' })], URL, 'approved');
    assert.deepEqual(done, []);
    const unevidenced = clauseUpdatesForDocument(MAP['isms-scope'], [row('iso27001', '4.3', { st: 'Implemented' })], URL, 'generated');
    assert.deepEqual(unevidenced.map((x) => x.set), [{ evidenceUrl: URL }], 'an Implemented clause with no evidence gains the link and keeps its status');
  });

  test('resolves by framework — an ISO 42001 document never updates the ISO 27001 row with the same number', () => {
    const clauses = [row('iso27001', '4.3'), row('iso42001', '4.3')];
    const u = clauseUpdatesForDocument(MAP['aims-scope'], clauses, URL, 'generated');
    assert.ok(u.every((x) => x.clause.fw === 'iso42001'));
  });
});

describe('clause automation from approved documents and records', () => {
  const { clauseOperatingEvidence, clauseAutomationUpdates } = require('../public/checkpoint/lib.js');
  const MAP = window.CLAUSE_DOCUMENT_MAP;
  const TODAY = '2026-09-24';
  const AUDIT_URL = 'https://t/Internal%20Audit.html';
  const SCOPE_URL = 'https://t/ISMS%20Scope.html';
  const approvedDoc = (url, tplId, extra) => Object.assign({ url, tplId, name: tplId + '.html', status: 'Approved', nextReview: '2027-09-01', owner: 'ISMS manager', version: '1.0', category: 'Policies & Procedures' }, extra || {});
  const clause = (fw, id, extra) => Object.assign({ fw, id, st: 'In progress', evidenceUrl: '', verified: '' }, extra || {});
  const completedAudit = { fw: 'iso27001', status: 'Completed', completed: '2026-06-01' };

  test('9.2 is met by a completed internal audit within the year, and not by a planned one', () => {
    assert.equal(clauseOperatingEvidence('iso27001', '9.2', { audits: [completedAudit] }, TODAY).met, true);
    assert.equal(clauseOperatingEvidence('iso27001', '9.2', { audits: [{ fw: 'iso27001', status: 'Planned', planned: '2026-10-01' }] }, TODAY).met, false);
  });

  test('an ISO 42001 audit does not satisfy ISO 27001 9.2, and vice versa', () => {
    assert.equal(clauseOperatingEvidence('iso27001', '9.2', { audits: [{ fw: 'iso42001', status: 'Completed', completed: '2026-06-01' }] }, TODAY).met, false);
    assert.equal(clauseOperatingEvidence('iso42001', '9.2', { audits: [completedAudit] }, TODAY).met, false);
  });

  test('9.3 and 10.1 need a management review with recorded decisions in the last 12 months', () => {
    assert.equal(clauseOperatingEvidence('iso27001', '9.3', { reviews: [{ date: '2026-03-01', decisions: 'Approved budget' }] }, TODAY).met, true);
    assert.equal(clauseOperatingEvidence('iso27001', '9.3', { reviews: [{ date: '2026-03-01', decisions: '' }] }, TODAY).met, false);
    assert.equal(clauseOperatingEvidence('iso27001', '10.1', { reviews: [{ date: '2025-01-01', decisions: 'x' }] }, TODAY).met, false);
  });

  test('10.2 fails only on a nonconformity past due with its corrective-action loop open', () => {
    const late = { type: 'Non-conformity (minor)', status: 'Open', due: '2026-09-01' };
    assert.equal(clauseOperatingEvidence('iso27001', '10.2', { actions: [late] }, TODAY).met, false);
    assert.equal(clauseOperatingEvidence('iso27001', '10.2', { actions: [] }, TODAY).met, true);
  });

  test('6.1.4 needs a completed impact assessment for every registered AI system', () => {
    assert.equal(clauseOperatingEvidence('iso42001', '6.1.4', { aiSystems: [{ impactAssessmentStatus: 'Completed' }, { impactAssessmentStatus: 'In progress' }] }, TODAY).met, false);
    assert.equal(clauseOperatingEvidence('iso42001', '6.1.4', { aiSystems: [{ impactAssessmentStatus: 'Completed' }] }, TODAY).met, true);
  });

  test('a clause with no records rule is never met automatically', () => {
    assert.equal(clauseOperatingEvidence('iso27001', '6.3', {}, TODAY).met, false);
    assert.equal(clauseOperatingEvidence('iso27001', '5.1', {}, TODAY).met, false);
  });

  test('approved audit procedure + completed audit marks 9.2 Implemented and verifies it today', () => {
    const c = clause('iso27001', '9.2', { evidenceUrl: AUDIT_URL });
    const u = clauseAutomationUpdates(MAP, [c], [approvedDoc(AUDIT_URL, 'internal-audit-procedure')], { audits: [completedAudit] }, TODAY);
    assert.deepEqual(u.map((x) => x.set), [{ st: 'Implemented', verified: TODAY, verifiedBy: 'Checkpoint (automated)' }]);
  });

  test('a draft procedure, or no audit yet, changes nothing', () => {
    const c = clause('iso27001', '9.2', { evidenceUrl: AUDIT_URL });
    assert.deepEqual(clauseAutomationUpdates(MAP, [c], [approvedDoc(AUDIT_URL, 'internal-audit-procedure', { status: 'Draft' })], { audits: [completedAudit] }, TODAY), []);
    assert.deepEqual(clauseAutomationUpdates(MAP, [c], [approvedDoc(AUDIT_URL, 'internal-audit-procedure')], { audits: [] }, TODAY), []);
  });

  test('a document past its review date stops re-verifying the clause', () => {
    const c = clause('iso27001', '4.3', { st: 'Implemented', evidenceUrl: SCOPE_URL, verified: '2026-01-01' });
    assert.deepEqual(clauseAutomationUpdates(MAP, [c], [approvedDoc(SCOPE_URL, 'isms-scope', { nextReview: '2026-08-01' })], {}, TODAY), []);
  });

  test('an Implemented clause already verified today produces no write — the automation is idempotent', () => {
    const c = clause('iso27001', '4.3', { st: 'Implemented', evidenceUrl: SCOPE_URL, verified: TODAY });
    assert.deepEqual(clauseAutomationUpdates(MAP, [c], [approvedDoc(SCOPE_URL, 'isms-scope')], {}, TODAY), []);
  });

  test('evidence that is not the mapped template is ignored, even if approved', () => {
    const c = clause('iso27001', '4.3', { evidenceUrl: SCOPE_URL });
    assert.deepEqual(clauseAutomationUpdates(MAP, [c], [approvedDoc(SCOPE_URL, 'access-control-policy')], {}, TODAY), []);
  });
});
