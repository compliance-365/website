// Every ISO/IEC 27001 Clause 4-10 requirement is covered by the document
// mapped to it, in wording an auditor can test. Each check names the
// clause and the phrase that carries its intent.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
global.window = global.window || {};
const Lib = require('../public/checkpoint/lib.js');
require('../public/checkpoint/templates.js');
const T = (id) => {
  const t = window.POLICY_TEMPLATES.find((x) => x.id === id);
  return JSON.stringify(t);
};
const map = window.CLAUSE_DOCUMENT_MAP;

test('every ISO 27001 clause 4.1-10.2 has at least one mapped document', () => {
  const mapped = new Set(Object.values(map).flat().filter((m) => m.fw === 'iso27001').map((m) => m.code));
  ['4.1', '4.2', '4.3', '5.1', '5.2', '5.3', '6.1.1', '6.1.2', '6.1.3', '6.2', '6.3', '7.1', '7.2', '7.3', '7.4', '7.5.2', '7.5.3',
    '8.1', '8.2', '8.3', '9.1', '9.2', '9.3', '10.1', '10.2'].forEach((c) => assert.ok(mapped.has(c), 'clause ' + c + ' has no document'));
});

test('5.1 and 5.2: leadership and the policy commitments', () => {
  const p = T('infosec-policy');
  ['framework for setting information security objectives', 'commits to satisfying the requirements', 'commits to the continual improvement',
    'integrates the ISMS requirements into the organisation’s processes', 'supports other managers', 'communicated within the organisation',
    'made available to interested parties'].forEach((x) => assert.ok(p.includes(x), x));
  assert.ok(!p.includes('Microsoft 365 tenant'));
});

test('5.3, 6.1.1, 6.1.3 d), 6.2, 7.1', () => {
  assert.ok(T('roles-responsibilities').includes('ensuring the ISMS conforms to ISO/IEC 27001, and for reporting on its performance to top management'));
  assert.ok(T('infosec-policy').includes('reports on its performance to top management'));
  assert.ok(T('risk-management-framework').includes('(Clause 6.1.1)'));
  assert.ok(T('risk-management-framework').includes('and whether it is implemented'));
  assert.ok(T('infosec-objectives-metrics').includes('are communicated to the people responsible'));
  assert.ok(T('infosec-policy').includes('Clause 7.1'));
});

test('7.5, 8.1, 9.1, 9.2, 10.1', () => {
  assert.ok(T('document-control-procedure').includes('legibility'));
  const o = T('operational-planning-control');
  ['criteria', 'unintended changes', 'Externally provided processes', 'confidence that the processes have been carried out as planned'].forEach((x) => assert.ok(o.includes(x), x));
  assert.deepEqual(map['operational-planning-control'], [{ fw: 'iso27001', code: '8.1', implements: false }]);
  assert.ok(Lib.clauseRequirementsFor('iso27001', '8.1').find((r) => r.id === 'operate').auto.docs.includes('operational-planning-control'));
  assert.ok(T('infosec-objectives-metrics').includes('valid, comparable and reproducible'));
  assert.ok(T('internal-audit-procedure').includes('frequency, methods, responsibilities, planning requirements and reporting'));
  assert.ok(T('nonconformity-corrective-action').includes('suitability, adequacy and effectiveness'));
});

/* Checked line by line against the ISO/IEC 27001:2022 text: the
   checklist wording for each clause carries the qualifiers the standard
   states (functions and levels, media, planning requirements,
   proportionate correction, ...), not a paraphrase that drops them. */
test('checklist wording keeps the standard’s qualifiers', () => {
  const req = (code, id) => Lib.clauseRequirementsFor('iso27001', code).find((r) => r.id === id).text;
  assert.match(req('5.1', 'outcomes'), /other managers to show leadership/);
  assert.match(req('6.1.2', 'criteria'), /criteria for performing assessments/);
  assert.match(req('6.2', 'objectives'), /relevant functions and levels.*documented information/);
  assert.match(req('7.5.2', 'identify'), /format and media.*suitability and adequacy/);
  assert.match(req('7.5.3', 'lifecycle'), /retrieval and use.*legibility.*external origin/);
  assert.match(req('9.2', 'programme'), /planning requirements/);
  assert.match(req('9.3', 'held'), /suitable, adequate and effective/);
  assert.match(req('10.2', 'effective'), /proportionate to the effects/);
  assert.ok(T('infosec-objectives-metrics').includes('relevant functions and levels'));
});
