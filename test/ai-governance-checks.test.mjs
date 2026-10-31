/* The ISO 42001 posture checks: 'ai-inventory' (AI apps connected to
   Microsoft 365 are in the AI systems register) and 'ai-impact' (every
   AI system has a current, completed impact assessment). Both run only
   with the ISO 42001 module. */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import Lib from '../public/checkpoint/lib.js';

const require = createRequire(import.meta.url);
global.window = global.window || {};
window.CHECKPOINT_CONFIG = window.CHECKPOINT_CONFIG || { scopesProvision: [] };
require('../public/checkpoint/store.js');
const app = readFileSync(new URL('../public/checkpoint/app.js', import.meta.url), 'utf8');
const today = '2026-10-31';

describe('ai-inventory', () => {
  const found = [{ id: 'sp-1', name: 'ChatGPT' }, { id: 'sp-2', name: 'Claude' }, { id: 'sp-3', name: 'Jasper AI' }];
  test('passes when nothing is found or everything found is recorded', () => {
    assert.equal(Lib.aiInventoryCheckResult([], [], {}).result, 'pass');
    const reg = [{ name: 'Something else', spId: 'sp-1' }, { name: 'claude' }, { name: 'Jasper  AI' }];
    const r = Lib.aiInventoryCheckResult(found, reg, {});
    assert.equal(r.result, 'pass', 'matched by service principal id, or by name ignoring case and punctuation');
    assert.match(r.note, /All 3 AI app/);
  });
  test('names what is missing, and is never a fail (name matching cannot prove completeness)', () => {
    const r = Lib.aiInventoryCheckResult(found, [{ name: 'ChatGPT' }], {});
    assert.equal(r.result, 'review');
    assert.match(r.note, /2 of 3 AI app\(s\).*Claude, Jasper AI\.$/);
    assert.equal(Lib.aiInventoryCheckResult(found, [], {}).result, 'review');
  });
  test('an app the practitioner dismissed as not AI is left out', () => {
    assert.equal(Lib.aiInventoryCheckResult(found, [{ name: 'ChatGPT' }], { 'sp-2': true, 'sp-3': true }).result, 'pass');
  });
});

describe('ai-impact', () => {
  const sys = (o) => Object.assign({ name: 'S', riskTier: 'Minimal', impactAssessmentStatus: 'Completed', lastReviewed: '2026-06-01' }, o);
  test('an empty register is not measured', () => {
    assert.equal(Lib.aiImpactCheckResult([], today).result, 'manual');
  });
  test('passes when every assessment is completed and within its review date', () => {
    assert.equal(Lib.aiImpactCheckResult([sys({}), sys({ impactAssessment: { nextDue: '2027-01-01' }, lastReviewed: '' })], today).result, 'pass');
  });
  test('an incomplete or overdue assessment is a review; on a high-risk system a fail', () => {
    assert.equal(Lib.aiImpactCheckResult([sys({ impactAssessmentStatus: 'In progress' })], today).result, 'review');
    assert.equal(Lib.aiImpactCheckResult([sys({ lastReviewed: '2025-10-01' })], today).result, 'review', 'a year after the last review');
    assert.equal(Lib.aiImpactCheckResult([sys({ impactAssessment: { nextDue: '2026-10-30' } })], today).result, 'review', 'the assessment\'s own next-due date');
    const r = Lib.aiImpactCheckResult([sys({ name: 'Triage', riskTier: 'High', impactAssessmentStatus: 'Not started' }), sys({ impactAssessmentStatus: 'In progress' })], today);
    assert.equal(r.result, 'fail');
    assert.match(r.note, /1 high-risk AI system\(s\).*Triage\.$/);
  });
});

describe('wiring', () => {
  test('both checks are defined for the ISO 42001 module only', () => {
    const defs = window.CHECK_DEFS.filter((c) => c.requiresModule === 'iso42001').map((c) => c.id);
    assert.deepEqual(defs, ['ai-inventory', 'ai-impact']);
  });
  test('without the module they are hidden and outside the score', () => {
    assert.match(app, /if \(c\.requiresModule\) return !!\(S\.entitlements && S\.entitlements\[c\.requiresModule\]\);/);
    assert.match(app, /out\['ai-impact'\] = aiOn \? L\.aiImpactCheckResult\(S\.aiSystems \|\| \[\], today\) : aiOff;/);
    assert.match(app, /if \(!aiOn\) out\['ai-inventory'\] = aiOff;/);
    assert.equal(Lib.score([{ id: 'x', scored: true }], { lastResults: { x: 'manual' } }), 100, 'manual never counts against the score');
  });
  test('the scan keeps its AI app discovery for the check, and register edits recompute it', () => {
    assert.match(app, /S\.aiFound = candidates;/);
    assert.match(app, /function renderAiSystems\(\) \{[\s\S]{0,200}applyRegisterCheckResults\(\);/);
  });
});
