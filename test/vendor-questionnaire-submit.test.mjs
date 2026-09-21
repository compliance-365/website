// Tests for azure/VendorQuestionnaireSubmit/index.js's pure validation
// logic — the gate between whatever a vendor contact typed into the
// no-sign-in questionnaire form and a write into the client's Vendors
// SharePoint list. Deliberately narrow: only known question ids are
// accepted (never an arbitrary field a tampered request tries to smuggle
// in), yesno answers are constrained to Yes/No/Unknown, text is capped.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { validateSubmission, QUESTION_TYPES, MAX_TEXT_LENGTH } =
  require('../public/checkpoint/azure/VendorQuestionnaireSubmit/index.js').__test;

describe('validateSubmission()', () => {
  test('accepts a well-formed mix of yesno and text answers', () => {
    const r = validateSubmission({ answers: { encryption: 'Yes', dataLocation: 'Australia' } });
    assert.equal(r.ok, true);
    assert.deepEqual(r.answers, { encryption: 'Yes', dataLocation: 'Australia' });
  });

  test('rejects a missing or non-object answers field', () => {
    assert.equal(validateSubmission({}).ok, false);
    assert.equal(validateSubmission({ answers: 'Yes' }).ok, false);
    assert.equal(validateSubmission({ answers: ['Yes'] }).ok, false, 'an array is not an answers object');
    assert.equal(validateSubmission(undefined).ok, false);
  });

  test('rejects an unknown question id outright — never writes an arbitrary field a tampered request smuggled in', () => {
    const r = validateSubmission({ answers: { encryption: 'Yes', notARealQuestion: 'x' } });
    assert.equal(r.ok, false);
    assert.match(r.error, /unknown question/);
  });

  test('rejects a yesno answer outside Yes/No/Unknown', () => {
    assert.equal(validateSubmission({ answers: { encryption: 'yes' } }).ok, false, 'case-sensitive');
    assert.equal(validateSubmission({ answers: { encryption: 'Maybe' } }).ok, false);
    assert.equal(validateSubmission({ answers: { encryption: true } }).ok, false, 'a boolean is not one of the three accepted strings');
  });

  test('rejects a non-string value for a text question', () => {
    assert.equal(validateSubmission({ answers: { dataLocation: 123 } }).ok, false);
  });

  test('rejects a text answer over the length cap', () => {
    const r = validateSubmission({ answers: { dataLocation: 'x'.repeat(MAX_TEXT_LENGTH + 1) } });
    assert.equal(r.ok, false);
    assert.match(r.error, /too long/);
  });

  test('trims whitespace on text answers', () => {
    const r = validateSubmission({ answers: { dataLocation: '  Australia  ' } });
    assert.equal(r.answers.dataLocation, 'Australia');
  });

  test('blank, null or undefined answers are silently dropped, not rejected — nothing here is "required"', () => {
    const r = validateSubmission({ answers: { encryption: 'Yes', mfa: '', incidentResponse: null, dataLocation: undefined } });
    assert.equal(r.ok, true);
    assert.deepEqual(r.answers, { encryption: 'Yes' });
  });

  test('rejects a submission where every answer was blank — nothing worth recording', () => {
    const r = validateSubmission({ answers: { mfa: '', dataLocation: '' } });
    assert.equal(r.ok, false);
    assert.match(r.error, /answer at least one/);
  });

  test('every AI follow-up id is a known question — the form can submit them without the gate question also being present', () => {
    const r = validateSubmission({ answers: { directInteraction: 'Yes', essentialServicesAccess: 'No', syntheticContent: 'Unknown' } });
    assert.equal(r.ok, true, 'validation does not enforce the dependsOn relationship — that is a UI hint only, same as the browser app\'s own recordVendorQuestionnaire()');
  });

  test('QUESTION_TYPES covers all three sections (security, privacy, AI) with the expected question count', () => {
    const ids = Object.keys(QUESTION_TYPES);
    assert.ok(ids.includes('encryption') && ids.includes('dataLocation') && ids.includes('usesAi'));
    assert.ok(ids.length >= 12 && ids.length <= 15, `expected a short questionnaire, found ${ids.length} question ids`);
  });
});
