/* The ISMS operating rhythm (recurring activities that evidence Annex A
   controls operating) and the risks suggested from the scope & context
   answers. */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import Lib from '../public/checkpoint/lib.js';

const require = createRequire(import.meta.url);
global.window = global.window || {};
window.CHECKPOINT_CONFIG = window.CHECKPOINT_CONFIG || { scopesProvision: [] };
require('../public/checkpoint/store.js');
const ANNEX_A = new Set();
for (const [t, n] of [[5, 37], [6, 8], [7, 14], [8, 34]]) for (let i = 1; i <= n; i++) ANNEX_A.add(`A.${t}.${i}`);
const app = readFileSync(new URL('../public/checkpoint/app.js', import.meta.url), 'utf8');
const today = '2026-10-04';

describe('operating rhythm', () => {
  test('every activity names real Annex A controls, a calendar category and the evidence to keep', () => {
    assert.ok(Lib.OPERATING_RHYTHM.length >= 10);
    for (const r of Lib.OPERATING_RHYTHM) {
      assert.ok(r.controls.length && r.controls.every((c) => ANNEX_A.has(c)), r.key);
      assert.ok(window.CALENDAR_CATEGORIES.includes(r.category), r.key + ' category');
      assert.ok(window.CALENDAR_FREQUENCIES.includes(r.freq), r.key + ' freq');
      assert.ok(r.evidence.length > 40, r.key + ' evidence');
    }
  });

  test('plans only what is missing, and never duplicates a category already scheduled', () => {
    const all = Lib.planOperatingRhythm([], today);
    assert.equal(all.length, Lib.OPERATING_RHYTHM.length);
    assert.ok(all.every((p) => p.nextDue > today && /^\[rhythm:[a-z-]+\]/.test(p.notes)));
    const some = Lib.planOperatingRhythm([{ category: 'Backup restore test', status: 'Active', notes: '' }, { category: 'Other', notes: '[rhythm:log-review]', status: 'Active' }], today);
    assert.ok(!some.find((p) => p.key === 'backup-restore'), 'hand-added restore test counts');
    assert.ok(!some.find((p) => p.key === 'log-review'), 'marker counts');
    assert.equal(some.length, all.length - 2);
    assert.equal(Lib.planOperatingRhythm([{ category: 'Backup restore test', status: 'Retired' }], today).length, all.length, 'a retired item does not count');
  });

  test('completing with evidence verifies the linked applicable controls; without evidence nothing changes', () => {
    const def = Lib.rhythmDef('access-review');
    const controls = [
      { fw: 'iso27001', id: 'A.5.15', app: true, st: 'Not started' },
      { fw: 'iso27001', id: 'A.5.18', app: true, st: 'In progress', evidenceUrl: 'https://x/policy' },
      { fw: 'iso27001', id: 'A.8.2', app: false, st: 'Not applicable' },
      { fw: 'soc2', id: 'A.5.15', app: true, st: 'Not started' }];
    const prog = Lib.rhythmCompletionUpdates(def, controls, 'https://x/review', today, 'Ekin', false);
    assert.deepEqual(prog.map((u) => [u.control.id, u.set.st, u.set.evidenceUrl]), [['A.5.15', 'In progress', 'https://x/review'], ['A.5.18', undefined, undefined]]);
    assert.ok(prog.every((u) => u.set.verified === today && u.set.verifiedBy === 'Ekin'));
    const impl = Lib.rhythmCompletionUpdates(def, controls, 'https://x/review', today, 'Ekin', true);
    assert.deepEqual(impl.map((u) => u.set.st), ['Implemented', 'Implemented']);
    assert.deepEqual(Lib.rhythmCompletionUpdates(def, controls, '', today, 'Ekin', true), []);
  });

  test('notes keep the guidance readable and the last evidence recoverable', () => {
    const notes = '[rhythm:log-review] Evidence: keep the review. Last evidence: https://x/y (2026-10-04)';
    assert.equal(Lib.rhythmNotesText(notes), 'Evidence: keep the review.');
    assert.equal(Lib.rhythmLastEvidence(notes), 'https://x/y');
    assert.equal(Lib.rhythmKeyOf({ notes }), 'log-review');
  });

  test('a hand-added item in a rhythm category captures evidence the same way', () => {
    assert.equal(Lib.rhythmDefFor({ category: 'Access control review', notes: '' }).key, 'access-review');
    assert.equal(Lib.rhythmDefFor({ category: 'Policy review', notes: '' }), null);
  });

  test('is a certification path step for ISO 27001 tenants', () => {
    const steps = (cal) => Lib.certificationPathSteps({ entitled: ['iso27001'], calendar: cal, today });
    assert.equal(steps([]).find((s) => s.id === 'rhythm').done, false);
    const full = Lib.planOperatingRhythm([], today).map((p) => ({ category: p.category, notes: p.notes, status: 'Active' }));
    assert.equal(steps(full).find((s) => s.id === 'rhythm').done, true);
  });

  test('the app schedules it, and completion asks for evidence and updates the controls', () => {
    assert.match(app, /setupOperatingRhythm: async function \(\)/);
    assert.match(app, /'addCalItem', 'completeCalItem', 'setupOperatingRhythm'/);
    assert.match(app, /rhythmCompletionUpdates\(rdef, S\.controls, evidenceUrl, c\.lastCompleted, attester, markImplemented\)/);
    assert.match(app, /rhythm: \{ action: 'App\.setupOperatingRhythm'/);
  });
});

describe('risks suggested from the scope & context answers', () => {
  const mineguard = { orgSize: 'micro', orgWorkModel: 'remote', orgItModel: 'inhouse', orgCloud: 'saas', orgDevelops: 'outsourced', orgPersonalData: 'customers', orgAiUse: 'builds', orgChange: 'growing', orgCustomerDemand: 'contract' };

  test('every template is well formed: Annex A controls, canonical C/I/A, scores and actions on its own controls', () => {
    for (const c of Lib.CONTEXT_RISKS) {
      assert.match(c.key, /^ctx-/);
      assert.ok(c.risk.controls.every((x) => ANNEX_A.has(x)), c.key);
      assert.deepEqual(c.risk.cia, ['C', 'I', 'A'].filter((x) => c.risk.cia.includes(x)), c.key + ' cia order');
      assert.ok(c.risk.L >= 1 && c.risk.L <= 5 && c.risk.I >= 1 && c.risk.I <= 5);
      assert.ok(c.actions.length && c.actions.every((a) => a.days > 0 && ['Critical', 'High', 'Medium', 'Low'].includes(a.pr) && ANNEX_A.has(a.control)), c.key);
    }
  });

  test('nothing is suggested before the questionnaire is answered', () => {
    assert.deepEqual(Lib.contextRiskSuggestions({}, [], []), []);
  });

  test('answers drive the suggestions, with a reason for each', () => {
    const keys = Lib.contextRiskSuggestions(mineguard, [], []).map((s) => s.key);
    ['ctx-outsourced-dev', 'ctx-source-code', 'ctx-release-testing', 'ctx-lost-device', 'ctx-key-person', 'ctx-saas-supplier', 'ctx-privacy-breach', 'ctx-ai-product', 'ctx-contract-obligations', 'ctx-backup', 'ctx-bec']
      .forEach((k) => assert.ok(keys.includes(k), k));
    assert.ok(!keys.includes('ctx-msp-access'), 'in-house IT');
    assert.ok(!keys.includes('ctx-cloud-misconfig'), 'no IaaS');
    const office = Lib.contextRiskSuggestions({ orgWorkModel: 'office', orgDevelops: 'no' }, [], []).map((s) => s.key);
    assert.ok(!office.includes('ctx-lost-device') && !office.includes('ctx-source-code'));
    assert.ok(Lib.contextRiskSuggestions(mineguard, [], []).every((s) => s.why.length > 10));
  });

  test('a suggestion in the register or dismissed is not suggested again', () => {
    const keys = Lib.contextRiskSuggestions(mineguard, [{ tpl: 'ctx-bec' }], ['ctx-backup']).map((s) => s.key);
    assert.ok(!keys.includes('ctx-bec') && !keys.includes('ctx-backup'));
  });

  test('the app proposes them through the scan queue and remembers dismissals', () => {
    assert.match(app, /refreshContextProposals\(\); renderNavCounts\(\);/);
    assert.match(app, /Store\.setSetting\('dismissedContextRisks'/);
    assert.match(app, /var src = t\.ctx \? 'Scope & context' : 'Posture scan';/);
  });

  test('the questionnaire distinguishes outsourced development', () => {
    require('../public/checkpoint/templates.js');
    const q = window.ORG_CONTEXT_QUESTIONS.find((x) => x.id === 'develops');
    assert.deepEqual(q.options.map((o) => o.value), ['no', 'yes', 'outsourced']);
    const draft = Lib.buildOrgContextDraft ? Lib.buildOrgContextDraft({ develops: 'outsourced' }, null) : null;
    if (draft) assert.match(JSON.stringify(draft), /external development partner/);
  });
});
