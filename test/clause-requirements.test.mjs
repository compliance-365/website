// Clause requirement checklists: every management-system clause broken
// into what it actually requires, each met by Checkpoint's own records
// or by a named confirmation of where the evidence is, and a clause can
// only be Implemented when all are met and evidence is linked. Also the
// "[To be completed]" markers that replace generic wording for the
// Clause 4 determinations, and the climate change amendment.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
global.window = global.window || {};
window.CHECKPOINT_CONFIG = window.CHECKPOINT_CONFIG || { scopesProvision: [] };
const Lib = require('../public/checkpoint/lib.js');
window.CheckpointLib = Lib;
require('../public/checkpoint/store.js');
require('../public/checkpoint/templates.js');
const { CLAUSE_DEFS, ORG_PROFILE_FIELDS, ORG_CONTEXT_QUESTIONS, POLICY_TEMPLATES } = window;
const { clauseRequirementsFor, clauseChecklist, clauseImplementGate, parseClauseConfirmations,
  pendingMarker, pendingMarkersIn, buildOrgContextDraft, MANDATORY_DOCS, CLAUSE_REQUIREMENTS, CLAUSE_REQUIREMENTS_42 } = Lib;

const tplIds = new Set(POLICY_TEMPLATES.map((t) => t.id));
const mdRefs = new Set(MANDATORY_DOCS.map((m) => m.ref));
const profileKeys = new Set(ORG_PROFILE_FIELDS.map((f) => f.key).concat(ORG_CONTEXT_QUESTIONS.map((q) => q.key)));
const RECORDS = Lib.CLAUSE_RECORD_KINDS;

describe('clause requirement definitions', () => {
  test('every clause of every framework has at least one requirement', () => {
    CLAUSE_DEFS.forEach((d) => {
      assert.ok(clauseRequirementsFor(d.fw, d.code).length > 0, `${d.fw} ${d.code} has no requirements`);
    });
  });

  test('requirement ids are unique within a clause, and every one says what evidence is expected', () => {
    CLAUSE_DEFS.forEach((d) => {
      const reqs = clauseRequirementsFor(d.fw, d.code);
      assert.equal(new Set(reqs.map((r) => r.id)).size, reqs.length, `${d.fw} ${d.code} duplicate ids`);
      reqs.forEach((r) => {
        assert.ok(r.text && r.text.length > 20, `${d.fw} ${d.code}/${r.id} text`);
        assert.ok(r.evidence && r.evidence.length > 15, `${d.fw} ${d.code}/${r.id} evidence`);
      });
    });
  });

  test('every automatic source points at something that exists', () => {
    const all = Object.assign({}, CLAUSE_REQUIREMENTS, CLAUSE_REQUIREMENTS_42);
    Object.keys(all).forEach((code) => all[code].forEach((r) => {
      [r.auto, r.auto42].filter(Boolean).forEach((src) => {
        (src.docs || (src.doc ? [src.doc] : [])).forEach((id) => assert.ok(tplIds.has(id), `${code}/${r.id}: no template ${id}`));
        (src.profile || []).forEach((k) => assert.ok(profileKeys.has(k), `${code}/${r.id}: no profile key ${k}`));
        if (src.md) assert.ok(mdRefs.has(src.md), `${code}/${r.id}: no Stage 1 item ${src.md}`);
        [].concat(src.record || []).forEach((k) => assert.ok(RECORDS.includes(k), `${code}/${r.id}: unknown record ${k}`));
      });
    }));
  });

  test('every clause a document claims to implement can be met by that document', () => {
    Object.entries(window.CLAUSE_DOCUMENT_MAP).forEach(([tpl, maps]) => maps.forEach((m) => {
      const reqs = clauseRequirementsFor(m.fw, m.code);
      assert.ok(reqs.length, `${m.fw} ${m.code} (from ${tpl}) has no requirements`);
    }));
  });

  test('the climate change amendment is in Clauses 4.1 and 4.2 for both management systems', () => {
    ['iso27001', 'iso42001'].forEach((fw) => {
      assert.ok(clauseRequirementsFor(fw, '4.1').some((r) => r.id === 'climate'), fw + ' 4.1');
      assert.ok(clauseRequirementsFor(fw, '4.2').some((r) => r.id === 'climate-reqs'), fw + ' 4.2');
    });
  });

  test('ISO 42001-only requirements stay out of ISO 27001', () => {
    assert.ok(clauseRequirementsFor('iso42001', '4.1').some((r) => r.id === 'ai-role'));
    assert.ok(!clauseRequirementsFor('iso27001', '4.1').some((r) => r.id === 'ai-role'));
    assert.ok(clauseRequirementsFor('iso42001', '6.1.4').length > 0);
    assert.equal(clauseRequirementsFor('iso27001', '6.1.4').length, 0);
  });
});

describe('clauseChecklist()', () => {
  const answered = { orgExternalIssues: 'x', orgInternalIssues: 'y', orgClimate: 'Climate change has been determined…' };

  test('an approved context document plus the answers meets 4.1\'s issues and climate requirements', () => {
    const cl = clauseChecklist({ fw: 'iso27001', code: '4.1', docs: [{ tplId: 'context-interested-parties', status: 'Approved' }], settings: answered, md: [] });
    const byId = Object.fromEntries(cl.items.map((i) => [i.id, i]));
    assert.equal(byId.issues.status, 'met');
    assert.equal(byId.climate.status, 'met');
    assert.equal(byId.current.status, 'open', 'no management review yet');
    assert.equal(cl.complete, false);
  });

  test('a draft document is only partly met', () => {
    const cl = clauseChecklist({ fw: 'iso27001', code: '4.1', docs: [{ tplId: 'context-interested-parties', status: 'Draft' }], settings: answered, md: [] });
    assert.equal(cl.items.find((i) => i.id === 'issues').status, 'partial');
  });

  test('an unanswered climate determination is not met, even with the document approved', () => {
    const cl = clauseChecklist({ fw: 'iso27001', code: '4.1', docs: [{ tplId: 'context-interested-parties', status: 'Approved' }], settings: { orgExternalIssues: 'x', orgInternalIssues: 'y' }, md: [] });
    assert.equal(cl.items.find((i) => i.id === 'climate').status, 'open');
  });

  test('a confirmation with a note meets a requirement Checkpoint cannot see', () => {
    const cl = clauseChecklist({ fw: 'iso27001', code: '5.1', docs: [], settings: {}, md: [],
      confirmed: { integration: { by: 'M. Chen', date: '2026-09-30', note: 'Onboarding checklist v3 includes security induction' } } });
    const i = cl.items.find((x) => x.id === 'integration');
    assert.equal(i.status, 'met');
    assert.equal(i.how, 'confirmed');
    assert.equal(i.by, 'M. Chen');
  });

  test('a confirmation without a note does not count', () => {
    const cl = clauseChecklist({ fw: 'iso27001', code: '5.1', confirmed: { integration: { by: 'x', note: '  ' } } });
    assert.notEqual(cl.items.find((x) => x.id === 'integration').status, 'met');
  });

  test('risk rules: owners, ratings and the owner\'s acceptance of residual risk', () => {
    const risks = [{ status: 'Open', owner: 'A', L: 3, I: 4, acceptedBy: 'A' }, { status: 'Open', owner: '', L: 0, I: 2 }, { status: 'Closed' }];
    const cl = clauseChecklist({ fw: 'iso27001', code: '6.1.2', risks, md: [], docs: [] });
    assert.equal(cl.items.find((i) => i.id === 'identify').status, 'partial');
    assert.equal(cl.items.find((i) => i.id === 'analyse').status, 'partial');
    const t = clauseChecklist({ fw: 'iso27001', code: '6.1.3', risks, md: [], docs: [] });
    assert.equal(t.items.find((i) => i.id === 'owners').status, 'partial');
  });

  test('10.2 with no nonconformities recorded needs a confirmation, never an automatic pass', () => {
    const cl = clauseChecklist({ fw: 'iso27001', code: '10.2', actions: [], md: [] });
    ['react', 'cause', 'effective'].forEach((id) => assert.equal(cl.items.find((i) => i.id === id).status, 'open'));
  });

  test('10.2 is met by complete corrective-action records', () => {
    const nc = { type: 'Non-conformity (minor)', correction: 'fixed', rootCause: 'no check', status: 'Done', effectivenessReview: 'no recurrence' };
    const cl = clauseChecklist({ fw: 'iso27001', code: '10.2', actions: [nc], md: [{ ref: '10.2', status: 'done', note: '' }] });
    assert.equal(cl.complete, true);
  });

  test('ISO 42001 requirements without an ISO 42001 source must be confirmed', () => {
    const cl = clauseChecklist({ fw: 'iso42001', code: '9.2', md: [{ ref: '9.2', status: 'done', note: '' }], audits: [{}] });
    cl.items.forEach((i) => assert.equal(i.status, 'open', i.id + ' should not borrow ISO 27001 records'));
  });
});

describe('clauseImplementGate()', () => {
  const complete = { items: [{ id: 'a', status: 'met' }], met: 1, total: 1, complete: true };
  test('passes only with every requirement met and evidence linked', () => {
    assert.equal(clauseImplementGate(complete, { evidenceUrl: 'https://x' }).ok, true);
    assert.equal(clauseImplementGate(complete, { evidenceUrl: '' }).ok, false);
    const open = { items: [{ id: 'a', status: 'met' }, { id: 'b', status: 'partial', text: 'b' }], met: 1, total: 2 };
    const g = clauseImplementGate(open, { evidenceUrl: 'https://x' });
    assert.equal(g.ok, false);
    assert.deepEqual(g.open.map((i) => i.id), ['b']);
    assert.match(g.reasons[0], /1 of 2 requirements not yet met/);
  });
});

describe('parseClauseConfirmations()', () => {
  test('bad or empty JSON is an empty object, never a throw', () => {
    assert.deepEqual(parseClauseConfirmations(''), {});
    assert.deepEqual(parseClauseConfirmations('not json'), {});
    assert.deepEqual(parseClauseConfirmations('[1]'), {});
    assert.deepEqual(parseClauseConfirmations('{"a":{"note":"n"}}'), { a: { note: 'n' } });
  });
});

describe('"[To be completed]" markers', () => {
  test('markers are found in text and in nested content, once each', () => {
    const m = pendingMarker('External issues (Clause 4.1)');
    assert.deepEqual(pendingMarkersIn('a ' + m + ' b ' + m), ['External issues (Clause 4.1)']);
    assert.deepEqual(pendingMarkersIn({ policyStatements: [{ rule: m }] }), ['External issues (Clause 4.1)']);
    assert.deepEqual(pendingMarkersIn('nothing here'), []);
  });

  test('every Clause 4 determination used by a document is required, so it can never default to a claim', () => {
    ['orgExternalIssues', 'orgInternalIssues', 'orgPartyRequirements', 'orgClimate', 'orgInterestedParties',
      'orgRegulatory', 'orgInterfaces', 'orgScopeStatement', 'orgBusinessUnits', 'orgLocations', 'orgServices',
      'orgLegalName', 'orgPeople', 'orgTechnology'].forEach((k) => {
      assert.equal(ORG_PROFILE_FIELDS.find((f) => f.key === k).required, true, k);
    });
    assert.ok(!ORG_PROFILE_FIELDS.find((f) => f.key === 'orgExclusions').required, 'no exclusions is a valid answer');
  });

  test('app.js renders a blank required field as a marker and refuses to approve a document carrying one', () => {
    const app = readFileSync(new URL('../public/checkpoint/app.js', import.meta.url), 'utf8');
    assert.match(app, /f\.required \? window\.CheckpointLib\.pendingMarker\(f\.label\) : f\.fallback/);
    assert.match(app, /if \(pending\.length\) throw new Error\('still to be completed: '/);
    assert.match(app, /title: 'Not ready to approve'/);
  });
});

describe('the clause gate is enforced in the app', () => {
  const app = readFileSync(new URL('../public/checkpoint/app.js', import.meta.url), 'utf8');
  test('manual status change, document approval, automation and verification all go through it', () => {
    assert.match(app, /is not ready to be Implemented/);
    assert.match(app, /if \(u\.set\.st === 'Implemented' && !clauseGateFor\(c\)\.ok\)/);
    assert.match(app, /updates = updates\.filter\(function \(u\) \{ return clauseGateFor\(Object\.assign\(\{\}, u\.clause, u\.set\), ctx\)\.ok; \}\)/);
    assert.match(app, /cannot be verified yet/);
  });
  test('confirmations are saved on the Clauses list', () => {
    const store = readFileSync(new URL('../public/checkpoint/store.js', import.meta.url), 'utf8');
    assert.match(store, /\{ name: 'Requirements', text: \{ allowMultipleLines: true \} \}/);
    assert.match(store, /Clauses: \['Requirements'\]/);
    assert.match(store, /Requirements: JSON\.stringify\(c\.reqs \|\| \{\}\)/);
  });
});

describe('climate change amendment in the drafts and documents', () => {
  test('the climate-related requirements question drafts into the determination and the requirements', () => {
    const yes = buildOrgContextDraft({ climate: 'relevant', climateReqs: 'yes' }, {}, '');
    assert.match(yes.climate, /determined to be a relevant issue/);
    assert.match(yes.climate, /Some interested parties have climate-related requirements/);
    assert.match(yes.partyRequirements, /climate-related requirements/);
    const no = buildOrgContextDraft({ climate: 'not-relevant', climateReqs: 'no' }, {}, '');
    assert.match(no.climate, /No interested party has been identified with climate-related requirements/);
    assert.equal(buildOrgContextDraft({}, {}, '').climate, '');
  });
  test('the AI Management System Scope carries the climate determination too', () => {
    const aims = POLICY_TEMPLATES.find((t) => t.id === 'aims-scope');
    assert.ok(aims.policyStatements.some((s) => /\{\{climate\}\}/.test(s.rule)));
  });
});

describe('register rules added for full automation', () => {
  const today = '2026-09-30';
  const rec = (kind, s) => Lib.clauseRecordStatus(kind, Object.assign({ today }, s));

  test('ISO 42001 risk rules read only the AI risks', () => {
    const risks = [
      { status: 'Open', cat: 'Supplier', owner: '', L: 0, I: 0 },
      { status: 'Open', cat: 'AI Governance', owner: 'A', L: 3, I: 3, treat: 'Treat', lastReviewed: '2026-06-01', acceptedBy: 'A' }
    ];
    assert.equal(rec('riskOwners', { fw: 'iso42001', risks }).st, 'done');
    assert.equal(rec('riskOwners', { fw: 'iso27001', risks }).st, 'partial');
    assert.equal(rec('riskReviewed', { fw: 'iso42001', risks }).st, 'done');
    assert.equal(rec('riskOwners', { fw: 'iso42001', risks: [{ status: 'Open', cat: 'Supplier', owner: 'x' }] }).st, 'missing');
    assert.ok(Lib.isAiRisk({ controls: ['AI.6.2.4'] }));
  });

  test('training uses the built-in courses, and ISO 42001 only the AI use course', () => {
    const training = [
      { courseId: 'security-awareness', status: 'Completed' },
      { courseId: 'ai-use-oversight', status: 'Assigned', due: '2026-01-01' }
    ];
    assert.equal(rec('trainingCurrent', { fw: 'iso42001', training }).st, 'partial');
    assert.equal(rec('trainingCurrent', { fw: 'iso27001', training: [training[0]] }).st, 'done');
    assert.equal(rec('trainingCurrent', { fw: 'iso27001', training: [] }).st, 'missing');
  });

  test('KPIs: objectives on track plus a posture scan within 90 days', () => {
    const objectives = [{ metric: 'MFA %', target: '100', owner: 'A', due: '2026-12-31', status: 'On track' }];
    assert.equal(rec('kpis', { objectives, scans: [{ date: '2026-09-01' }] }).st, 'done');
    assert.equal(rec('kpis', { objectives, scans: [{ date: '2026-01-01' }] }).st, 'partial');
    assert.equal(rec('kpis', { objectives: [], scans: [] }).st, 'missing');
  });

  test('management review inputs are checked against every 9.3 section', () => {
    const all = Object.fromEntries(Lib.MR_INPUT_SECTIONS.map((x) => [x.key, 'covered']));
    assert.equal(rec('mrInputs', { reviews: [{ date: '2026-08-01', inputs: JSON.stringify(all), decisions: 'd' }] }).st, 'done');
    const some = rec('mrInputs', { reviews: [{ date: '2026-08-01', inputs: JSON.stringify({ issues: 'x' }), decisions: 'd' }] });
    assert.equal(some.st, 'partial');
    assert.match(some.note, /6 of 7 required inputs not recorded/);
    assert.equal(rec('mrInputs', { reviews: [{ date: '2026-08-01', inputs: 'free text', decisions: 'd' }] }).st, 'partial');
    assert.equal(rec('mrInputs', { reviews: [{ date: '2024-01-01', inputs: JSON.stringify(all) }] }).st, 'missing');
    assert.equal(rec('improvement', { reviews: [{ date: '2026-08-01', inputs: JSON.stringify({ improvement: 'x' }), decisions: 'Invest in X' }] }).st, 'done');
    assert.equal(rec('mrResources', { reviews: [{ date: '2026-08-01', inputs: '{}', decisions: 'Approved budget for a part-time ISMS manager' }] }).st, 'done');
  });

  test('audit impartiality: an auditor who owns a clause in scope is flagged', () => {
    const audits = [{ id: 'AUD-1', status: 'Completed', completed: '2026-08-01', scope: 'Clauses 4-10', auditor: 'K. Patel', summary: 's' }];
    const clauses = [{ fw: 'iso27001', id: '6.1.2', own: 'K. Patel' }];
    const r = rec('auditImpartial', { audits, clauses });
    assert.equal(r.st, 'partial');
    assert.match(r.note, /owns Clause 6\.1\.2/);
    assert.equal(rec('auditImpartial', { audits, clauses: [{ fw: 'iso27001', id: '6.1.2', own: 'S. Okafor' }] }).st, 'done');
    assert.equal(rec('auditDone', { fw: 'iso42001', audits }).st, 'missing', 'an ISO 27001 audit is not an ISO 42001 audit');
  });

  test('policy acknowledgement, legal traceability and the AI registers', () => {
    const att = (n, st) => Array.from({ length: n }, () => ({ campaign: 'C1', docName: 'Information Security Policy.html', status: st }));
    assert.equal(rec('policyAcknowledged', { attestations: att(9, 'Acknowledged').concat(att(1, 'Assigned')) }).st, 'done');
    assert.equal(rec('policyAcknowledged', { attestations: att(5, 'Acknowledged').concat(att(5, 'Assigned')) }).st, 'partial');
    assert.equal(rec('policyAcknowledged', { fw: 'iso42001', attestations: att(9, 'Acknowledged') }).st, 'missing', 'ISO 42001 needs the AI Policy');
    assert.equal(rec('legalTraced', { legal: [{ applies: 'Yes', controls: ['A.5.31'] }, { applies: 'To confirm' }] }).st, 'done');
    assert.equal(rec('legalTraced', { legal: [{ applies: 'Yes', controls: [] }] }).st, 'partial');
    const ai = [{ owner: 'A', purpose: 'p', lastReviewed: '2026-05-01', impactAssessmentStatus: 'Completed' }];
    assert.equal(rec('aiRegister', { aiSystems: ai }).st, 'done');
    assert.equal(rec('aiImpact', { aiSystems: ai.concat([{ impactAssessmentStatus: 'In progress' }]) }).st, 'partial');
  });

  test('every clause requirement is automated: Checkpoint delivers Clauses 4-10', () => {
    ['iso27001', 'iso42001', 'iso27701'].forEach((fw) => {
      const manual = [];
      CLAUSE_DEFS.filter((d) => d.fw === fw).forEach((d) => clauseRequirementsFor(fw, d.code).forEach((r) => { if (!r.auto) manual.push(d.code + '/' + r.id); }));
      assert.deepEqual(manual, [], fw);
    });
  });
});

describe('management system evidence pack', () => {
  const app = readFileSync(new URL('../public/checkpoint/app.js', import.meta.url), 'utf8');
  const html = readFileSync(new URL('../public/checkpoint/index.html', import.meta.url), 'utf8');
  test('is a report builder reachable from Reports and the clause register', () => {
    assert.match(app, /clauses: function \(activeFw\) \{/);
    assert.match(app, /title: 'Management System Evidence Pack — ' \+ label/);
    assert.equal((html.match(/data-action="App\.report" data-id="clauses"/g) || []).length, 2);
  });
});

describe('ISO/IEC 27701:2025 as a standalone privacy information management system', () => {
  const today = '2026-09-30';
  const rec = (kind, x) => Lib.clauseRecordStatus(kind, Object.assign({ today, fw: 'iso27701' }, x));

  test('it has its own Clauses 4-10, the same codes as ISO 27001', () => {
    const codes = (fw) => CLAUSE_DEFS.filter((d) => d.fw === fw).map((d) => d.code);
    assert.deepEqual(codes('iso27701'), codes('iso27001'));
    assert.match(CLAUSE_DEFS.find((d) => d.fw === 'iso27701' && d.code === '6.1.2').t, /Privacy risk assessment/);
  });

  test('PIMS-only requirements: role, PII principals and PII processing in scope', () => {
    assert.ok(clauseRequirementsFor('iso27701', '4.1').some((r) => r.id === 'pii-role'));
    assert.ok(clauseRequirementsFor('iso27701', '4.2').some((r) => r.id === 'pii-principals'));
    assert.ok(clauseRequirementsFor('iso27701', '4.3').some((r) => r.id === 'pii-scope'));
    ['iso27001', 'iso42001'].forEach((fw) => assert.ok(!clauseRequirementsFor(fw, '4.1').some((r) => r.id === 'pii-role'), fw));
    assert.match(clauseRequirementsFor('iso27701', '6.1.2').find((r) => r.id === 'criteria').text, /risks to PII principals/);
    assert.match(clauseRequirementsFor('iso27701', '6.1.3').find((r) => r.id === 'soa').text, /Table A\.1/);
    assert.deepEqual(clauseRequirementsFor('iso27701', '5.2')[0].auto, { docs: ['privacy-policy-skeleton'] });
  });

  test('shared ISO 27001 sources carry over, scoped to privacy', () => {
    assert.deepEqual(clauseRequirementsFor('iso27701', '8.2')[0].auto, { record: ['riskReviewed'] });
    assert.deepEqual(clauseRequirementsFor('iso27701', '4.4')[0].auto, { record: ['pimsCore'] });
    assert.deepEqual(clauseRequirementsFor('iso27701', '9.3').find((r) => r.id === 'held').auto, { md: '9.3' });
  });

  test('privacy rules read privacy risks, the privacy course, the Privacy Policy and ISO 27701 audits', () => {
    const risks = [{ status: 'Open', cat: 'Supplier', owner: '' }, { status: 'Open', cat: 'Privacy', owner: 'A' }, { status: 'Open', controls: ['A.1.2.6'], owner: 'B' }];
    const r = rec('riskOwners', { risks });
    assert.equal(r.st, 'done');
    assert.match(r.note, /2 privacy risk/);
    assert.equal(rec('trainingCurrent', { training: [{ courseId: 'privacy-awareness', status: 'Completed' }, { courseId: 'security-awareness', status: 'Assigned', due: '2026-01-01' }] }).st, 'done');
    const att = [{ campaign: 'P', docName: 'Privacy Policy.html', status: 'Acknowledged' }];
    assert.equal(rec('policyAcknowledged', { attestations: att }).st, 'done');
    assert.equal(rec('auditDone', { audits: [{ fw: 'iso27001', status: 'Completed', completed: '2026-08-01' }] }).st, 'missing');
    assert.equal(rec('auditDone', { audits: [{ fw: 'iso27701', status: 'Completed', completed: '2026-08-01' }] }).st, 'done');
    assert.equal(Lib.clauseRecordStatus('auditDone', { today, fw: 'iso27001', audits: [{ fw: 'iso27701', status: 'Completed', completed: '2026-08-01' }] }).st, 'missing', 'an ISO 27701 audit is not an ISO 27001 audit');
  });

  test('privacy law in the legal register, and the PIMS core', () => {
    assert.equal(rec('legalPrivacy', { legal: [{ applies: 'Yes', title: 'Privacy Act 1988 (Cth)' }] }).st, 'done');
    assert.equal(rec('legalPrivacy', { legal: [{ applies: 'Yes', title: 'Corporations Act 2001' }] }).st, 'missing');
    const docs = ['privacy-policy-skeleton', 'ropa-data-handling-procedure', 'pii-principal-rights-procedure', 'privacy-impact-assessment-process'].map((tplId) => ({ tplId, status: 'Approved' }));
    assert.equal(rec('pimsCore', { docs, soaByFw: { iso27701: { applicable: 49 } } }).st, 'done');
    assert.equal(rec('pimsCore', { docs: docs.slice(1), soaByFw: {} }).st, 'partial');
  });

  test('the role question is asked only of ISO 27701 tenants, and audits read their own clauses', () => {
    const q = ORG_CONTEXT_QUESTIONS.find((x) => x.id === 'piiRole');
    assert.equal(q.fw, 'iso27701');
    assert.equal(q.key, 'orgPiiRole');
    const app = readFileSync(new URL('../public/checkpoint/app.js', import.meta.url), 'utf8');
    assert.match(app, /filter\(function \(q\) \{ return !q\.fw \|\| entitledForQs\.indexOf\(q\.fw\) !== -1; \}\)/);
    assert.match(app, /activeFw === 'iso42001' \|\| activeFw === 'iso27701' \? activeFw : 'iso27001'/);
    const wp = Lib.auditWorkpack({ fw: 'iso27701', scope: 'Clauses 4-10' }, { clauses: [{ fw: 'iso27701', id: '4.1', st: 'Implemented', t: 'x' }, { fw: 'iso27001', id: '4.1', st: 'Implemented', t: 'y' }] }, today);
    assert.deepEqual(wp.clauses.map((c) => c.title), ['x']);
  });
});

describe('Clause 5.1 communication is evidenced by the approved, acknowledged policy', () => {
  test('each framework checks its own policy and the acknowledgement campaign', () => {
    const want = { iso27001: 'infosec-policy', iso42001: 'ai-policy' };
    ['iso27001', 'iso42001', 'iso27701'].forEach((fw) => {
      const r = Lib.clauseRequirementsFor(fw, '5.1').find((x) => x.id === 'communicates');
      assert.ok(r.auto, fw + ' is automated');
      assert.ok([].concat(r.auto.record || []).includes('policyAcknowledged'), fw + ' needs staff acknowledgement');
      if (want[fw]) assert.equal(r.auto.doc, want[fw], fw);
    });
  });
});
