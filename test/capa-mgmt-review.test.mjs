// Fixture-based tests for the corrective-action (ISO 27001 Clause 10.1)
// and management-review-input (Clause 9.3.2) pure logic in lib.js.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import CheckpointLib from '../public/checkpoint/lib.js';

const { capaStatus, MR_INPUT_SECTIONS, parseReviewInputs, serializeReviewInputs } = CheckpointLib;

describe('capaStatus() — corrective-action rigour (Clause 10.1)', () => {
  test('a plain Action is never subject to CAPA and is trivially complete', () => {
    const r = capaStatus({ type: 'Action', status: 'Open' });
    assert.equal(r.isNc, false);
    assert.equal(r.complete, true);
    assert.equal(r.nextStep, '');
  });

  test('a fresh Major nonconformity owes the immediate correction first', () => {
    const r = capaStatus({ type: 'Non-conformity (Major)', status: 'Open' });
    assert.equal(r.isNc, true);
    assert.equal(r.complete, false);
    assert.equal(r.nextStep, 'Record the immediate correction');
  });

  test('the CAPA loop advances in order: correction → root cause → complete → effectiveness', () => {
    const base = { type: 'Non-conformity (Minor)', status: 'Open' };
    assert.equal(capaStatus({ ...base, correction: 'Disabled the account' }).nextStep, 'Determine and record the root cause');
    assert.equal(capaStatus({ ...base, correction: 'x', rootCause: 'No joiner-mover-leaver process' }).nextStep, 'Complete the corrective action');
    assert.equal(capaStatus({ ...base, correction: 'x', rootCause: 'y', status: 'Done' }).nextStep, 'Review effectiveness of the corrective action');
  });

  test('a fully-worked NC (correction, root cause, done, effectiveness reviewed) is complete', () => {
    const r = capaStatus({ type: 'Non-conformity (Major)', status: 'Done', correction: 'Contained', rootCause: 'Process gap', effectivenessReview: 'No recurrence over two scans' });
    assert.equal(r.complete, true);
    assert.equal(r.nextStep, '');
    assert.equal(r.effectivenessReviewed, true);
  });

  test('effectiveness reviewed but not yet Done does not count as complete', () => {
    // guards against marking a CAPA closed before the corrective action itself is done
    const r = capaStatus({ type: 'Non-conformity (Minor)', status: 'In progress', correction: 'x', rootCause: 'y', effectivenessReview: 'premature' });
    assert.equal(r.complete, false);
    assert.equal(r.nextStep, 'Complete the corrective action');
  });

  test('null / missing input never throws', () => {
    assert.equal(capaStatus(null).complete, true);
    assert.equal(capaStatus(undefined).isNc, false);
  });
});

describe('management-review inputs (Clause 9.3.2)', () => {
  test('all seven 9.3.2 inputs are represented, each with a clause tag', () => {
    const clauses = MR_INPUT_SECTIONS.map((s) => s.clause);
    assert.deepEqual(clauses, ['9.3.2 a', '9.3.2 b', '9.3.2 c', '9.3.2 d', '9.3.2 e', '9.3.2 f', '9.3.2 g']);
    MR_INPUT_SECTIONS.forEach((s) => { assert.ok(s.key && s.label, 'each section has a key and label'); });
  });

  test('serialize → parse round-trips the structured inputs', () => {
    const obj = { priorActions: 'All closed', issues: 'New SaaS vendor', performance: '2 NCs, 1 open', riskStatus: '3 High risks', improvement: 'Automate access reviews' };
    const round = parseReviewInputs(serializeReviewInputs(obj));
    assert.equal(round.priorActions, 'All closed');
    assert.equal(round.improvement, 'Automate access reviews');
    assert.equal(round.performance, '2 NCs, 1 open');
  });

  test('serialize drops empty/whitespace-only sections, keeping the record clean', () => {
    const s = serializeReviewInputs({ priorActions: 'x', issues: '   ', feedback: '' });
    const parsed = JSON.parse(s);
    assert.equal(parsed.priorActions, 'x');
    assert.ok(!('issues' in parsed));
    assert.ok(!('feedback' in parsed));
  });

  test('a legacy free-text review (not JSON) is surfaced as { legacy }, not lost', () => {
    const r = parseReviewInputs('Posture score 82/100. 3 open actions.');
    assert.equal(r.legacy, 'Posture score 82/100. 3 open actions.');
    assert.ok(!r.priorActions);
  });

  test('empty / missing inputs parse to an empty object', () => {
    assert.deepEqual(parseReviewInputs(''), {});
    assert.deepEqual(parseReviewInputs(null), {});
  });
});
