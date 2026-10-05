/* Policy content review (1.113.0): statements an auditor expects to find
   in the document set, placed in the policy they belong to, and each
   policy tagged with the Annex A controls its text addresses. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
global.window = global.window || {};
require('../public/checkpoint/templates.js');
const T = (id) => window.POLICY_TEMPLATES.find((t) => t.id === id);
const text = (id) => T(id).policyStatements.map((s) => s.rule).join(' ');

test('access control does not assume a licence the client may not hold', () => {
  assert.match(text('access-control-policy'), /Privileged Identity Management where the licence includes it/);
  assert.match(text('access-control-policy'), /break-glass/);
  assert.match(text('access-control-policy'), /phishing-resistant/);
  assert.match(text('access-control-policy'), /at least quarterly/);
});

test('statements land in the policy they belong to', () => {
  const expect = {
    'secure-development-policy': [/Outsourced development is governed/, /penetration test/, /masked or de-identified/, /OWASP/],
    'logging-monitoring-policy': [/authoritative time source/, /reviewed at least monthly/],
    'bcp-dr-plan': [/not treated as a backup/, /at least every six months/, /capacity of critical services/],
    'supplier-security-policy': [/subcontractors and subprocessors/],
    'cloud-services-policy': [/management interfaces are not publicly exposed/],
    'threat-intelligence-procedure': [/special interest groups/],
    'physical-security-policy': [/no premises of its own/],
    'control-testing-policy': [/Managers regularly check/],
    'change-management-policy': [/built into project management/],
    'asset-management-policy': [/before it leaves for repair/]
  };
  for (const [id, res] of Object.entries(expect)) res.forEach((re) => assert.match(text(id), re, id));
});

test('every statement keeps the rule-and-reason structure', () => {
  window.POLICY_TEMPLATES.forEach((t) => t.policyStatements.forEach((s) => {
    assert.ok(s.rule && (s.rule.length > 20 || /^\{\{\w+\}\}$/.test(s.rule)), t.id); // a whole-statement token is filled from the questionnaire
    assert.ok(s.because && s.because.length > 20, t.id + ': ' + s.rule.slice(0, 40));
  }));
});

test('the document set addresses all but the facility-only Annex A controls', () => {
  const cited = new Set();
  window.POLICY_TEMPLATES.forEach((t) => (t.controls || []).forEach((c) => cited.add(c)));
  const missing = [];
  for (const [g, n] of [[5, 37], [6, 8], [7, 14], [8, 34]]) for (let i = 1; i <= n; i++) if (!cited.has(`A.${g}.${i}`)) missing.push(`A.${g}.${i}`);
  assert.deepEqual(missing, ['A.7.6', 'A.7.12']);
});
