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
const RECORDS = ['risks', 'riskOwners', 'riskRated', 'riskAccepted', 'objectivePlans', 'auditsPlanned', 'mandatoryAll', 'capaCorrection', 'capaRootCause', 'capaEffective'];

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
        if (src.record) assert.ok(RECORDS.includes(src.record), `${code}/${r.id}: unknown record ${src.record}`);
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
      'orgRegulatory', 'orgInterfaces', 'orgScopeStatement', 'orgBusinessUnits', 'orgLocations', 'orgServices'].forEach((k) => {
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
    assert.match(app, /updates = updates\.filter\(function \(u\) \{ return clauseGateFor\(Object\.assign\(\{\}, u\.clause, u\.set\), md\)\.ok; \}\)/);
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
