// The security questionnaire responder (lib.js assessQuestion() and
// friends) — answers a customer's security questionnaire from what the
// tenant can actually show, with no AI involved.
//
// What is worth pinning is the honesty rule, because this output leaves
// the building: a draft sentence claiming a control is in place is only
// ever produced when the evidence says so. Mixed or failing evidence
// must yield a verdict and the facts, never a reassuring sentence.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import CheckpointLib from '../public/checkpoint/lib.js';

const { assessQuestion, matchQuestionTopics, questionSimilarity, parseQuestionnaireInput, QUESTION_TOPICS } = CheckpointLib;

const ctl = (id, st, over) => Object.assign({ id, t: 'Control ' + id, app: true, st }, over);
const base = {
  controls: [ctl('A.8.5', 'Implemented'), ctl('A.5.17', 'Implemented'), ctl('A.8.13', 'In progress'), ctl('A.7.1', 'Not started'), ctl('A.7.2', 'Not started'), ctl('A.8.25', 'Implemented', { app: false }), ctl('A.8.28', 'Implemented', { app: false }), ctl('A.8.29', 'Implemented', { app: false })],
  results: { 'mfa-all': 'pass', 'mfa-priv': 'pass', backup: 'fail', 'gh-branch-review': 'manual' },
  notes: { backup: 'No restore test in the last 12 months' },
  checkLabels: { 'mfa-all': 'MFA enforced — all users', backup: 'Backup coverage & restore testing' },
  scanDate: '2026-09-20', registers: { risks: 4, aiSystems: 0 }, library: []
};

describe('matchQuestionTopics()', () => {
  test('recognises common phrasings', () => {
    const keys = (q) => matchQuestionTopics(q).map(t => t.key);
    assert.ok(keys('Do you enforce MFA for remote access?').includes('mfa'));
    assert.ok(keys('Is two-factor authentication required?').includes('mfa'));
    assert.ok(keys('Is data encrypted at rest?').includes('encryptrest'));
    assert.ok(keys('Do you perform annual penetration tests?').includes('pentest'));
    assert.ok(keys('Describe your SDLC and code review process').includes('sdlc'));
    assert.ok(keys('Do you use sub-processors?').includes('vendor'));
    assert.ok(keys('Are third-party libraries scanned?').includes('dependencies'));
    assert.ok(!keys('Are third-party libraries scanned?').includes('vendor'), 'libraries are not suppliers');
    assert.ok(!keys('Do you hold a SOC 2 report?').includes('logging'), '"SOC 2" is not a security operations centre');
  });
  test('an unrelated question matches nothing', () => {
    assert.deepEqual(matchQuestionTopics('What is your company registration number?'), []);
  });
  test('every topic has a sentence and at least one evidence source or a caution', () => {
    QUESTION_TOPICS.forEach(t => {
      assert.ok(t.yes && t.yes.endsWith('.'), t.key);
      assert.ok(t.controls.length || t.checks.length || t.register, t.key + ' has no evidence source');
    });
  });
  test('no topic sentence claims a certification or names a product', () => {
    QUESTION_TOPICS.forEach(t => {
      assert.ok(!/certified|certification (is|was) (achieved|held)|\b(microsoft|entra|intune|defender|github|aws|azure)\b/i.test(t.yes), t.key + ': ' + t.yes);
    });
  });
});

describe('assessQuestion() — verdicts', () => {
  test('implemented controls with passing checks is a Yes with a drafted answer', () => {
    const r = assessQuestion('Do you enforce multi-factor authentication for all users?', base);
    assert.equal(r.verdict, 'Yes');
    assert.equal(r.source, 'evidence');
    assert.equal(r.confidence, 'High');
    assert.match(r.draft, /Multi-factor authentication is required/);
    assert.ok(r.evidence.some(e => /MFA enforced — all users.*pass.*2026-09-20/.test(e)));
  });
  test('mixed evidence is Partial and NEVER gets a drafted claim', () => {
    const r = assessQuestion('Are backups tested regularly?', base);
    assert.equal(r.verdict, 'Partial');
    assert.equal(r.draft, '');
    assert.deepEqual(r.failing, ['Backup coverage & restore testing']);
    assert.ok(r.evidence.some(e => /No restore test/.test(e)), 'the failing note is surfaced for the reviewer');
  });
  test('nothing started is a No, with no draft', () => {
    const r = assessQuestion('Describe physical security at your offices', base);
    assert.equal(r.verdict, 'No');
    assert.equal(r.draft, '');
  });
  test('controls marked not applicable in the SoA read as Not applicable, not Yes', () => {
    const r = assessQuestion('Do you follow a secure development lifecycle?', base);
    assert.equal(r.verdict, 'Not applicable');
    assert.equal(r.draft, '');
  });
  test('a manual (unmeasured) check is not evidence either way', () => {
    const r = assessQuestion('Do you follow a secure development lifecycle?', base);
    assert.equal(r.checks.length, 0);
  });
  test('no topic, or no signal, is Not evidenced', () => {
    assert.equal(assessQuestion('What is your ABN?', base).verdict, 'Not evidenced');
    assert.equal(assessQuestion('Is data encrypted at rest?', base).verdict, 'Not evidenced', 'A.8.24 is not in this SoA');
  });
  test('register-backed topics use the register count', () => {
    assert.equal(assessQuestion('Do you perform risk assessments?', base).verdict, 'Yes');
    assert.equal(assessQuestion('Do you use artificial intelligence?', base).verdict, 'No');
  });
  test('cautions travel with the answer for facts only the practitioner can state', () => {
    const r = assessQuestion('Are you ISO 27001 certified?', base);
    assert.ok(r.cautions.some(c => /Certification/.test(c)));
  });
});

describe('assessQuestion() — the answer library', () => {
  const lib = [{ id: 'ANS-001', question: 'Do you enforce MFA for all users?', answer: 'Yes — MFA via Entra Conditional Access for every user.', verdict: 'Yes' }];
  test('a close match reuses the approved answer', () => {
    const r = assessQuestion('Do you enforce MFA for all of your users?', Object.assign({}, base, { library: lib }));
    assert.equal(r.source, 'library');
    assert.equal(r.libraryId, 'ANS-001');
    assert.equal(r.draft, lib[0].answer);
    assert.equal(r.evidenceChanged, false);
  });
  test('a reused answer whose evidence has since changed is flagged', () => {
    const ctx = Object.assign({}, base, { library: lib, results: Object.assign({}, base.results, { 'mfa-all': 'fail' }) });
    const r = assessQuestion('Do you enforce MFA for all users?', ctx);
    assert.equal(r.source, 'library');
    assert.equal(r.evidenceChanged, true);
    assert.notEqual(r.confidence, 'High');
  });
  test('an unrelated library entry is not reused', () => {
    const r = assessQuestion('Are backups tested regularly?', Object.assign({}, base, { library: lib }));
    assert.equal(r.source, 'none');
  });
  test('questionSimilarity is symmetric and bounded', () => {
    const a = 'Do you encrypt laptops?', b = 'Are laptops encrypted?';
    assert.equal(questionSimilarity(a, b), questionSimilarity(b, a));
    assert.ok(questionSimilarity(a, b) > 0.6);
    assert.equal(questionSimilarity('', b), 0);
  });
});

describe('parseQuestionnaireInput()', () => {
  test('one question per line, numbering stripped', () => {
    assert.deepEqual(parseQuestionnaireInput('1. Do you use MFA?\nQ2) Are backups tested?\n\n- Is data encrypted?\nA.2.1 - Do you train staff?'),
      ['Do you use MFA?', 'Are backups tested?', 'Is data encrypted?', 'Do you train staff?']);
  });
  test('CSV with a named Question column, quoted commas kept', () => {
    assert.deepEqual(parseQuestionnaireInput('ID,Question,Response\n1,"Do you use MFA, everywhere?",\n2,Are backups tested?,'),
      ['Do you use MFA, everywhere?', 'Are backups tested?']);
  });
  test('CSV without a named column takes the longest text column', () => {
    assert.deepEqual(parseQuestionnaireInput('Ref,Text\nC1,Do you perform penetration testing annually?\nC2,Is there an incident response plan?'),
      ['Do you perform penetration testing annually?', 'Is there an incident response plan?']);
  });
  test('empty input', () => {
    assert.deepEqual(parseQuestionnaireInput(''), []);
  });
});
