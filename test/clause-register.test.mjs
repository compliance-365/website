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
