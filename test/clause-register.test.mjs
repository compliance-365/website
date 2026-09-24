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

  test('never overwrites a different evidence link, and never touches an Implemented clause', () => {
    const other = clauseUpdatesForDocument(MAP['isms-scope'], [row('iso27001', '4.3', { evidenceUrl: 'https://elsewhere/scope.pdf' })], URL, 'approved');
    assert.deepEqual(other, []);
    const done = clauseUpdatesForDocument(MAP['isms-scope'], [row('iso27001', '4.3', { st: 'Implemented' })], URL, 'approved');
    assert.deepEqual(done, []);
  });

  test('resolves by framework — an ISO 42001 document never updates the ISO 27001 row with the same number', () => {
    const clauses = [row('iso27001', '4.3'), row('iso42001', '4.3')];
    const u = clauseUpdatesForDocument(MAP['aims-scope'], clauses, URL, 'generated');
    assert.ok(u.every((x) => x.clause.fw === 'iso42001'));
  });
});
