// 1.119.0: the certification body's application form answered from the
// ISMS, with the ISO/IEC 27006-1 complexity factors rated from the
// organisation's own records, and advice that keeps the scope tight.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const L = require('../public/checkpoint/lib.js');
const app = readFileSync(new URL('../public/checkpoint/app.js', import.meta.url), 'utf8');
const today = '2026-10-06';
const mineguard = {
  orgLegalName: 'MineGuard Solutions Pty Ltd', orgServices: 'Incident AI; SHMS AI; Critical Risk AI',
  orgScopeStatement: 'The design, development, operation and support of MineGuard AI SaaS products', orgPeople: '4: two directors and two contractors',
  orgLocations: 'Head office, Virginia QLD (staff work remotely)', orgCloud: 'saas', orgDevelops: 'outsourced', orgPersonalData: 'customers',
  orgWorkModel: 'remote', orgCustomerDemand: 'contract', orgIndustry: 'Mining safety software'
};
const vendors = [
  { name: 'Microsoft Azure / 365', criticality: 'Critical', certifications: 'ISO 27001', lastReviewed: '2026-09-01' },
  { name: 'Supabase', criticality: 'Critical', certifications: 'SOC 2 Type II', lastReviewed: '2026-09-15' }
];
const factor = (r, name) => r.factors.find((f) => f.factor === name);

describe('complexity factors are rated from the facts', () => {
  const r = L.certApplicationAnswers({ profile: mineguard, vendors, legal: [{ title: 'Privacy Act 1988', applies: 'Yes' }], today, onboardedDate: '2026-08-01', consultant: 'Compliance365', readyDate: '2026-11-20' });
  test('a small cloud SaaS company is not rated at the top of every factor', () => {
    assert.equal(factor(r, 'Complexity of processes').level, 1);
    assert.equal(factor(r, 'Information confidentiality').level, 2);
    assert.equal(factor(r, 'IT infrastructure complexity').level, 1);
    assert.equal(factor(r, 'Virtual organisation').level, 1);
  });
  test('the facts that do add time are stated honestly', () => {
    assert.equal(factor(r, 'Development').level, 3, 'software is the product');
    assert.equal(factor(r, 'Type of business').level, 2);
  });
  test('managed, certified suppliers are rated as managed outsourcing', () => {
    assert.equal(factor(r, 'Outsourcing and third parties').level, 1);
    const unreviewed = L.certApplicationAnswers({ profile: mineguard, vendors: [vendors[0], { name: 'Wasabi', criticality: 'High', certifications: '' }], today });
    assert.equal(factor(unreviewed, 'Outsourcing and third parties').level, 2);
    assert.match(factor(unreviewed, 'Outsourcing and third parties').why, /Wasabi/);
    const none = L.certApplicationAnswers({ profile: mineguard, vendors: [], today });
    assert.equal(factor(none, 'Outsourcing and third parties').level, 3);
    assert.ok(none.warnings.some((w) => /supplier register/.test(w)));
  });
  test('sensitive information and regulated sectors still rate high', () => {
    const health = L.certApplicationAnswers({ profile: Object.assign({}, mineguard, { orgPersonalData: 'sensitive', orgIndustry: 'Health services' }), vendors, today });
    assert.equal(factor(health, 'Information confidentiality').level, 3);
    assert.equal(factor(health, 'Type of business').level, 3);
  });
  test('every factor has an answer and a reason', () => {
    assert.equal(r.factors.length, 10);
    r.factors.forEach((f) => { assert.ok(f.answer && f.why, f.factor); assert.ok(f.level >= 1 && f.level <= 3); });
  });
});

describe('application answers and what to fix first', () => {
  test('answers come from the ISMS', () => {
    const r = L.certApplicationAnswers({ profile: mineguard, vendors, legal: [{ title: 'Privacy Act 1988', applies: 'Yes' }], today, onboardedDate: '2026-08-01', consultant: 'Compliance365', readyDate: '2026-11-20' });
    const a = Object.fromEntries(r.answers.map((x) => [x.q, x.a]));
    assert.equal(a['Company name to appear on the certificate'], 'MineGuard Solutions Pty Ltd');
    assert.match(a['Specific legal or regulatory requirements applicable to the scope?'], /^Yes: Privacy Act/);
    assert.match(a['Outsourced activities and suppliers'], /Supabase.*SOC 2/);
    assert.match(a['When are you planning the certification audit?'], /Stage 1 from 2026-11-20/);
  });
  test('missing answers, no legal requirements and no internal audit are flagged', () => {
    const r = L.certApplicationAnswers({ profile: {}, vendors, legal: [], today });
    assert.ok(r.warnings.some((w) => /legal or regulatory requirement/.test(w)));
    assert.ok(r.warnings.some((w) => /Stage 2 needs a completed internal audit/.test(w)));
    assert.ok(r.warnings.some((w) => /Company name/.test(w)));
  });
});

describe('scope advice', () => {
  test('flags business operations in the scope and explains contractors', () => {
    const adv = L.scopeAdvice({ orgScopeStatement: 'Products, together with supporting cloud infrastructure, information security, customer support and business operations.', orgDevelops: 'outsourced' });
    assert.ok(adv.some((x) => /general business operations/.test(x)));
    assert.ok(adv.some((x) => /Individual contractors who work as part of your own team are counted/.test(x)));
    assert.ok(adv.some((x) => /head office as the one location/.test(x)));
  });
  test('the report is on the certification page', () => {
    assert.ok(app.includes('certapp: function'));
    assert.ok(app.includes('data-action="App.certApplication"'));
  });
});
