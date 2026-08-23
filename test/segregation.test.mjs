// Segregation of duties (ISO 27001 A.5.3).
//
// The failure mode that matters is a FALSE conflict, not a missed one:
// this sits in front of two things a practitioner must be able to do,
// and an app that cries "you're approving your own work" at two
// different people trains them to click through the warning — at which
// point it stops being a control at all.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import CheckpointLib from '../public/checkpoint/lib.js';

const { evaluateSegregation } = CheckpointLib;

describe('evaluateSegregation()', () => {
  test('the same account raising and authorising is a conflict, matched on id', () => {
    const r = evaluateSegregation({
      authorId: 'acct-1', authorName: 'K. Patel',
      approverId: 'acct-1', approverName: 'K. Patel'
    });
    assert.equal(r.conflict, true);
    assert.equal(r.matchedOn, 'id', 'an id match is the strong evidence and must be reported as such');
    assert.match(r.reason, /signed-in account/i);
  });

  test('account ids are compared case-insensitively', () => {
    assert.equal(evaluateSegregation({ authorId: 'ACCT-1', approverId: 'acct-1' }).conflict, true);
  });

  test('two different accounts are never a conflict, even sharing a display name', () => {
    // Two real people called J. Smith is not a segregation failure, and
    // treating it as one is the false positive that erodes the control.
    const r = evaluateSegregation({
      authorId: 'acct-1', authorName: 'J. Smith',
      approverId: 'acct-2', approverName: 'J. Smith'
    });
    assert.equal(r.conflict, false);
  });

  test('falls back to display name only when an id is missing on one side', () => {
    // Entries predating actorId, and demo mode, have no account id.
    const r = evaluateSegregation({ authorName: 'K. Patel', approverName: 'K. Patel' });
    assert.equal(r.conflict, true);
    assert.equal(r.matchedOn, 'name', 'a name match is weaker evidence and must be distinguishable in the record');
  });

  test('name matching ignores case and surrounding whitespace', () => {
    assert.equal(evaluateSegregation({ authorName: '  K. Patel ', approverName: 'k. patel' }).conflict, true);
  });

  test('different names with no ids are not a conflict', () => {
    assert.equal(evaluateSegregation({ authorName: 'K. Patel', approverName: 'S. Okafor' }).conflict, false);
  });

  test('no recorded originator is not a conflict', () => {
    // An imported record, or one created before this was tracked.
    // Claiming a conflict here would warn on records nobody raised.
    const r = evaluateSegregation({ approverId: 'acct-1', approverName: 'K. Patel' });
    assert.equal(r.conflict, false);
    assert.equal(r.reason, '');
  });

  test('missing input entirely is not a conflict', () => {
    assert.equal(evaluateSegregation().conflict, false);
    assert.equal(evaluateSegregation({}).conflict, false);
  });

  test('an empty-string id does not match another empty-string id', () => {
    // Two records with no id recorded are not thereby "the same person".
    assert.equal(evaluateSegregation({ authorId: '', approverId: '', authorName: 'A', approverName: 'B' }).conflict, false);
  });
});
