// Clause autopilot: Checkpoint delivers Clauses 4-10 itself. Every unmet
// clause requirement maps to the one step that meets it, Checkpoint's own
// steps first, and the suggested objectives, opportunities and the
// pre-certification audit are the records those steps produce.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const L = require('../public/checkpoint/lib.js');
const app = readFileSync(new URL('../public/checkpoint/app.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../public/checkpoint/index.html', import.meta.url), 'utf8');

const base = { fw: 'iso27001', today: '2026-10-05', docs: [], settings: {}, md: [] };

describe('requirement fixes', () => {
  test('a missing document is fixed by generating it, a missing record by its register step', () => {
    const cl = L.clauseChecklist(Object.assign({}, base, { code: '6.2' }));
    const fixes = cl.items.flatMap((i) => L.clauseRequirementFixes(i, { docs: [], titles: { 'infosec-objectives-metrics': 'Objectives' } }));
    assert.ok(fixes.some((f) => f.action === 'App.fixGenerateDocument' && f.arg === 'infosec-objectives-metrics'));
    assert.ok(fixes.some((f) => f.action === 'App.adoptSuggestedObjectives'));
  });

  test('a met requirement has no fix', () => {
    assert.deepEqual(L.clauseRequirementFixes({ status: 'met', gaps: [{ kind: 'record', id: 'risks' }] }, {}), []);
  });

  test('every record kind a requirement reads has a fix', () => {
    const kinds = new Set();
    ['iso27001', 'iso42001', 'iso27701'].forEach((fw) => Object.keys(L.CLAUSE_REQUIREMENTS).forEach((code) =>
      L.clauseRequirementsFor(fw, code).forEach((r) => [].concat((r.auto && r.auto.record) || []).forEach((k) => kinds.add(k)))));
    kinds.forEach((k) => {
      const f = L.clauseRequirementFixes({ status: 'open', gaps: [{ kind: 'record', id: k }] }, {});
      assert.ok(f.length && f[0].action, 'no fix for ' + k);
    });
  });

  test('every fix action exists in the app', () => {
    const actions = new Set(Object.values(L.CLAUSE_RECORD_FIXES).map((f) => f.action).concat(['App.fixGenerateDocument', 'App.orgProfileWizard']));
    actions.forEach((a) => assert.match(app, new RegExp('\\n    ' + a.replace('App.', '') + ': (async )?function'), a));
  });

  test('Annex A stays with the organisation', () => {
    assert.equal(L.CLAUSE_RECORD_FIXES.soa.by, 'you');
  });

  test('documents collapse into one generate step and one approve step', () => {
    const lists = ['4.1', '4.3', '5.2', '6.1.2', '7.5.1'].map((code) => Object.assign(L.clauseChecklist(Object.assign({}, base, { code, docs: [{ tplId: 'isms-scope', status: 'Draft' }] })), { label: 'Clause ' + code }));
    const plan = L.clauseAutopilot(lists, { docs: [{ tplId: 'isms-scope', status: 'Draft' }], titles: {} });
    assert.ok(!plan.some((p) => p.fix.action === 'App.fixGenerateDocument'));
    const gen = plan.find((p) => p.fix.action === 'App.generateDocumentSet');
    const appr = plan.find((p) => p.fix.action === 'App.approveDraftSet');
    assert.ok(gen && gen.fix.docs.length > 1 && !gen.fix.docs.includes('isms-scope'));
    assert.ok(appr && appr.fix.docs.includes('isms-scope'));
  });

  test('a Stage 1 item whose record is in place does not ask for the record again', () => {
    const md = L.mandatoryDocumentation({ today: '2026-10-05', docs: [], objectives: [{ title: 'x', metric: 'm', target: 't', owner: 'o', due: '2027-01-01' }] });
    const cl = L.clauseChecklist(Object.assign({}, base, { code: '5.1', md, objectives: [{ title: 'x', metric: 'm', target: 't', owner: 'o', due: '2027-01-01' }] }));
    const dir = cl.items.find((i) => i.id === 'direction');
    const fixes = L.clauseRequirementFixes(dir, { docs: [] });
    assert.ok(!fixes.some((f) => f.action === 'App.adoptSuggestedObjectives'));
    assert.ok(fixes.some((f) => f.arg === 'infosec-objectives-metrics'));
  });

  test('the autopilot groups requirements by fix, Checkpoint first', () => {
    const lists = ['4.1', '5.1', '6.1.1', '6.2', '9.2', '9.3'].map((code) => Object.assign(L.clauseChecklist(Object.assign({}, base, { code })), { label: 'Clause ' + code }));
    const plan = L.clauseAutopilot(lists, { docs: [] });
    assert.ok(plan.length);
    const order = { checkpoint: 0, meeting: 1, you: 2 };
    for (let i = 1; i < plan.length; i++) assert.ok(order[plan[i - 1].fix.by] <= order[plan[i].fix.by]);
    const keys = plan.map((p) => p.fix.key);
    assert.equal(new Set(keys).size, keys.length, 'one row per fix');
    const mr = plan.find((p) => p.fix.action === 'App.startManagementReview');
    assert.ok(mr && mr.reqs.length > 1, 'one management review meets several requirements');
  });
});

describe('suggested objectives', () => {
  test('measurable, for the frameworks held, and not duplicated', () => {
    const s = L.suggestedObjectives(['iso27001'], []);
    assert.ok(s.length >= 5);
    s.forEach((o) => { assert.ok(o.metric && o.target); assert.ok(o.fws.includes('iso27001')); });
    assert.equal(L.suggestedObjectives(['iso27001'], [{ title: s[0].title.toUpperCase() }]).length, s.length - 1);
    assert.ok(L.suggestedObjectives(['iso42001'], []).every((o) => o.fws.includes('iso42001')));
  });
});

describe('suggested opportunities', () => {
  test('drawn from the scope & context answers', () => {
    const none = L.contextOpportunitySuggestions({}, []).map((x) => x.key);
    assert.ok(none.includes('opp-certification'));
    assert.ok(!none.includes('opp-ai'));
    const ai = L.contextOpportunitySuggestions({ orgAiUse: 'tools', orgCustomerDemand: 'often' }, []).map((x) => x.key);
    assert.ok(ai.includes('opp-ai') && ai.includes('opp-questionnaires'));
  });
  test('one already in the register is not suggested again', () => {
    const keys = L.contextOpportunitySuggestions({}, [{ tpl: 'opp-certification' }]).map((x) => x.key);
    assert.ok(!keys.includes('opp-certification'));
  });
});

describe('pre-certification internal audit', () => {
  test('management-system clauses and Annex A, each parseable as audit scope', () => {
    const p = L.preCertificationAudits('2026-10-05', 'iso27001', []);
    assert.equal(p.length, 2);
    assert.deepEqual(L.parseAuditScope(p[0].scope).clauses, ['4', '5', '6', '7', '8', '9', '10']);
    assert.ok(L.parseAuditScope(p[1].scope).allControls);
    assert.ok(p[0].planned > '2026-10-05' && p[1].planned > p[0].planned);
  });
  test('not scheduled twice', () => {
    const p = L.preCertificationAudits('2026-10-05', 'iso27001', []);
    assert.equal(L.preCertificationAudits('2026-10-05', 'iso27001', p).length, 0);
  });
});

describe('management review', () => {
  test('the form drafts every Clause 9.3.2 input and records resources', () => {
    ['issues:', 'interestedParties:', 'feedback:', 'improvement:', 'priorActions:', 'performance:', 'riskStatus:'].forEach((k) => assert.ok(app.includes('        ' + k), k));
    assert.ok(html.includes('id="naReviewResources"'));
    assert.ok(app.includes("'Resources: ' + res"));
    assert.ok(L.clauseRecordStatus('mrResources', { fw: 'iso27001', today: '2026-10-05', reviews: [{ date: '2026-09-01', decisions: 'Resources: current resources are sufficient', inputs: '{}' }] }).st === 'done');
  });
});
