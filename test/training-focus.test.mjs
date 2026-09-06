// Tests for lib.js's trainingFocusRows()/trainingSummary() — the slices
// behind the Training register's summary tiles and its filter pills.
//
// Same contract as soaFocusRows(): the number on a tile is the length of
// the list that tile opens, and the pill row selects the same slice, so
// all three come from one definition. What's worth pinning here is the
// definition of "outstanding" and "overdue", because both are what an
// auditor asks the training register for and both have an edge that is
// easy to get wrong: a record with an unexpected status, and a record
// with no due date.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import L from '../public/checkpoint/lib.js';

const TODAY = '2026-09-06';
const OPTS = { today: TODAY };

const RECORDS = [
  { upn: 'done', status: 'Completed', due: '2026-01-01' },      // completed, and past due — still not overdue
  { upn: 'open-late', status: 'Assigned', due: '2026-01-01' },
  { upn: 'open-soon', status: 'Assigned', due: '2027-01-01' },
  { upn: 'open-nodue', status: 'Assigned' },                     // outstanding, but nothing was promised
  { upn: 'exempt', status: 'Exempt', due: '2026-01-01' },
  { upn: 'weird', status: '', due: '2026-01-01' }                // empty/legacy status
];

const ids = (key, rows = RECORDS, opts = OPTS) => L.trainingFocusRows(key, rows, opts).map((r) => r.upn);

describe('trainingFocusRows() — the register\'s slices', () => {
  test('All returns everything', () => {
    assert.equal(ids('All').length, RECORDS.length);
  });

  test('Completed is only the passed assignments', () => {
    assert.deepEqual(ids('Completed'), ['done']);
  });

  test('Exempt is counted separately and is not outstanding', () => {
    assert.deepEqual(ids('Exempt'), ['exempt']);
    assert.ok(!ids('Outstanding').includes('exempt'), 'an accepted exemption is not work');
  });

  test('Outstanding is anything neither completed nor exempt', () => {
    // Deliberately not "status === 'Assigned'": a record with an empty or
    // legacy status is still someone who owes you a course, and testing
    // for the positive string would drop it out of the register's summary
    // entirely while it still counted toward the total.
    assert.deepEqual(ids('Outstanding'), ['open-late', 'open-soon', 'open-nodue', 'weird']);
  });

  test('Overdue is the outstanding subset past its due date', () => {
    assert.deepEqual(ids('Overdue'), ['open-late', 'weird']);
  });

  test('a completed record past its due date is NOT overdue', () => {
    // It was done. Counting it would inflate the one number an auditor
    // reads as "people who have not done their training".
    assert.ok(!ids('Overdue').includes('done'));
  });

  test('an outstanding record with no due date is never overdue', () => {
    assert.ok(ids('Outstanding').includes('open-nodue'));
    assert.ok(!ids('Overdue').includes('open-nodue'), 'nothing was promised, so nothing is late');
  });

  test('Overdue is always a subset of Outstanding', () => {
    const outstanding = new Set(ids('Outstanding'));
    for (const id of ids('Overdue')) assert.ok(outstanding.has(id), id + ' is overdue but not outstanding');
  });

  test('Completed / Outstanding / Exempt partition the register exactly', () => {
    const union = [...ids('Completed'), ...ids('Outstanding'), ...ids('Exempt')].sort();
    assert.deepEqual(union, RECORDS.map((r) => r.upn).sort());
    assert.equal(new Set(union).size, union.length, 'no record is in two slices');
  });

  test('an unknown key returns nothing rather than everything', () => {
    assert.deepEqual(L.trainingFocusRows('bogus', RECORDS, OPTS), []);
    assert.deepEqual(L.trainingFocusRows(undefined, RECORDS, OPTS), []);
  });

  test('missing records, and holes in them, are tolerated', () => {
    assert.deepEqual(L.trainingFocusRows('All', null, OPTS), []);
    assert.deepEqual(L.trainingFocusRows('All', undefined, OPTS), []);
    assert.doesNotThrow(() => L.trainingFocusRows('Overdue', [null, undefined, { upn: 'x', due: '2020-01-01' }], OPTS));
  });

  test('with no `today` supplied nothing is reported overdue', () => {
    // Better to under-report than to call every dated record late because
    // the caller forgot to pass a date.
    assert.deepEqual(L.trainingFocusRows('Overdue', RECORDS, {}), []);
  });

  test('the input array is never mutated or reordered', () => {
    const before = JSON.stringify(RECORDS);
    ['All', 'Completed', 'Outstanding', 'Overdue', 'Exempt'].forEach((k) => ids(k));
    assert.equal(JSON.stringify(RECORDS), before);
  });
});

describe('trainingSummary() — the numbers on the tiles', () => {
  test('reports each slice\'s size', () => {
    assert.deepEqual(L.trainingSummary(RECORDS, OPTS),
      { total: 6, completed: 1, outstanding: 4, overdue: 2, exempt: 1 });
  });

  test('each figure equals the length of the list its tile opens', () => {
    // This is the whole promise the tiles make; assert it directly rather
    // than trusting that the two call sites stay in step.
    const s = L.trainingSummary(RECORDS, OPTS);
    assert.equal(s.completed, ids('Completed').length);
    assert.equal(s.outstanding, ids('Outstanding').length);
    assert.equal(s.overdue, ids('Overdue').length);
    assert.equal(s.exempt, ids('Exempt').length);
    assert.equal(s.total, ids('All').length);
  });

  test('completed + outstanding + exempt accounts for every record', () => {
    const s = L.trainingSummary(RECORDS, OPTS);
    assert.equal(s.completed + s.outstanding + s.exempt, s.total);
  });

  test('an empty register reports zeroes, not NaN', () => {
    assert.deepEqual(L.trainingSummary([], OPTS),
      { total: 0, completed: 0, outstanding: 0, overdue: 0, exempt: 0 });
    assert.deepEqual(L.trainingSummary(null, OPTS),
      { total: 0, completed: 0, outstanding: 0, overdue: 0, exempt: 0 });
  });
});
