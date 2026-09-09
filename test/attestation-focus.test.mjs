// Tests for lib.js's attestationFocusRows()/attestationSummary() — the
// slices behind the Policy attestation register's summary tiles and its
// filter pills.
//
// Same contract as trainingFocusRows()/trainingSummary(): the number on a
// tile is the length of the list that tile opens, and the pill row selects
// the same slice, so all three come from one definition. Unlike Training,
// there is no due-date field on an attestation record, so there is no
// Overdue slice — Outstanding / Acknowledged / Exempt is the complete
// partition, and what's worth pinning here is that an unrecognised status
// stays counted as Outstanding rather than quietly disappearing.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import L from '../public/checkpoint/lib.js';

const RECORDS = [
  { upn: 'acked-1', status: 'Acknowledged' },
  { upn: 'acked-2', status: 'Acknowledged' },
  { upn: 'assigned', status: 'Assigned' },
  { upn: 'exempt', status: 'Exempt' },
  { upn: 'weird', status: '' }        // empty/legacy status
];

const ids = (key, rows = RECORDS) => L.attestationFocusRows(key, rows).map((r) => r.upn);

describe('attestationFocusRows() — the register\'s slices', () => {
  test('All returns everything', () => {
    assert.equal(ids('All').length, RECORDS.length);
  });

  test('Acknowledged is only the resolved-positive rows', () => {
    assert.deepEqual(ids('Acknowledged'), ['acked-1', 'acked-2']);
  });

  test('Exempt is counted separately and is not outstanding', () => {
    assert.deepEqual(ids('Exempt'), ['exempt']);
    assert.ok(!ids('Outstanding').includes('exempt'), 'an accepted exemption is not work');
  });

  test('Outstanding is anything neither acknowledged nor exempt', () => {
    // Deliberately not "status === 'Assigned'": a row with an empty or
    // unrecognised status is still someone who owes an acknowledgement,
    // and testing for the positive string would drop it out of the
    // register's own summary while it still counted toward the total.
    assert.deepEqual(ids('Outstanding'), ['assigned', 'weird']);
  });

  test('Acknowledged / Outstanding / Exempt partition the register exactly', () => {
    const union = [...ids('Acknowledged'), ...ids('Outstanding'), ...ids('Exempt')].sort();
    assert.deepEqual(union, RECORDS.map((r) => r.upn).sort());
    assert.equal(new Set(union).size, union.length, 'no record is in two slices');
  });

  test('an unknown key returns nothing rather than everything', () => {
    assert.deepEqual(L.attestationFocusRows('bogus', RECORDS), []);
    assert.deepEqual(L.attestationFocusRows(undefined, RECORDS), []);
  });

  test('missing records, and holes in them, are tolerated', () => {
    assert.deepEqual(L.attestationFocusRows('All', null), []);
    assert.deepEqual(L.attestationFocusRows('All', undefined), []);
    assert.doesNotThrow(() => L.attestationFocusRows('Outstanding', [null, undefined, { upn: 'x' }]));
  });

  test('the input array is never mutated or reordered', () => {
    const before = JSON.stringify(RECORDS);
    ['All', 'Acknowledged', 'Outstanding', 'Exempt'].forEach((k) => ids(k));
    assert.equal(JSON.stringify(RECORDS), before);
  });
});

describe('attestationSummary() — the numbers on the tiles', () => {
  test('reports each slice\'s size', () => {
    assert.deepEqual(L.attestationSummary(RECORDS),
      { total: 5, outstanding: 2, acknowledged: 2, exempt: 1 });
  });

  test('each figure equals the length of the list its tile opens', () => {
    // This is the whole promise the tiles make; assert it directly rather
    // than trusting that the two call sites stay in step.
    const s = L.attestationSummary(RECORDS);
    assert.equal(s.outstanding, ids('Outstanding').length);
    assert.equal(s.acknowledged, ids('Acknowledged').length);
    assert.equal(s.exempt, ids('Exempt').length);
    assert.equal(s.total, ids('All').length);
  });

  test('outstanding + acknowledged + exempt accounts for every record', () => {
    const s = L.attestationSummary(RECORDS);
    assert.equal(s.outstanding + s.acknowledged + s.exempt, s.total);
  });

  test('an empty register reports zeroes, not NaN', () => {
    assert.deepEqual(L.attestationSummary([]),
      { total: 0, outstanding: 0, acknowledged: 0, exempt: 0 });
    assert.deepEqual(L.attestationSummary(null),
      { total: 0, outstanding: 0, acknowledged: 0, exempt: 0 });
  });
});
