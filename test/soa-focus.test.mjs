// Tests for lib.js's soaFocusRows() — the slices behind the Statement of
// Applicability's summary tiles.
//
// The contract worth protecting is narrow and specific: the number ON a
// tile is the length of the row set that tile OPENS. app.js gets that for
// free by calling this function for both, so what these tests guard is the
// definition of each slice — particularly which base set it filters, since
// "implemented / in progress / not started / overdue" are statements about
// APPLICABLE controls while "excluded" and "exclusions missing
// justification" are by definition about the ones that are not. Filtering
// the wrong base is how a tile ends up promising 2 and delivering 3.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import L from '../public/checkpoint/lib.js';

const TODAY = '2026-09-06';
const OPTS = { today: TODAY, cadenceDays: 90 };

/* One row per interesting case, so every assertion below can name the id
   it expects rather than a count that could be right by accident. */
const ROWS = [
  { id: 'fresh', app: true, st: 'Implemented', verified: '2026-08-01' },   // verified inside cadence
  { id: 'stale', app: true, st: 'Implemented', verified: '2026-01-01' },   // verified, but overdue
  { id: 'never', app: true, st: 'Implemented' },                            // implemented, never verified
  { id: 'wip', app: true, st: 'In progress' },
  { id: 'todo', app: true, st: 'Not started' },
  { id: 'blank', app: true, st: '' },                                       // unexpected/legacy status
  { id: 'excl-ok', app: false, just: 'Physical site controls sit with the landlord' },
  { id: 'excl-bare', app: false, just: '' }
];

const ids = (key, rows = ROWS, opts = OPTS) => L.soaFocusRows(key, rows, opts).map((r) => r.id);

describe('soaFocusRows() — status slices count applicable controls only', () => {
  test('implemented', () => {
    assert.deepEqual(ids('implemented'), ['fresh', 'stale', 'never']);
  });

  test('in progress', () => {
    assert.deepEqual(ids('inprogress'), ['wip']);
  });

  test('not started catches any applicable control that is neither of the other two', () => {
    // 'blank' has no status at all. It must land somewhere, or a control
    // disappears from every slice while still counting toward the total —
    // mirrors controlStatusCounts()'s own else-branch.
    assert.deepEqual(ids('notstarted'), ['todo', 'blank']);
  });

  test('the three status slices partition the applicable rows exactly', () => {
    const applicable = ROWS.filter((r) => r.app).map((r) => r.id).sort();
    const union = [...ids('implemented'), ...ids('inprogress'), ...ids('notstarted')].sort();
    assert.deepEqual(union, applicable, 'every applicable control is in exactly one status slice');
    assert.equal(new Set(union).size, union.length, 'and in only one');
  });

  test('an excluded control never appears in a status slice', () => {
    for (const key of ['implemented', 'inprogress', 'notstarted', 'overdue']) {
      assert.ok(!ids(key).some((id) => id.startsWith('excl-')), key + ' must not include excluded controls');
    }
  });
});

describe('soaFocusRows() — exclusion slices count the NON-applicable rows', () => {
  test('excluded is every control marked not applicable', () => {
    assert.deepEqual(ids('excluded'), ['excl-ok', 'excl-bare']);
  });

  test('unjustified is the subset with no justification recorded', () => {
    assert.deepEqual(ids('unjustified'), ['excl-bare']);
  });

  test('a justified exclusion is excluded but not unjustified', () => {
    assert.ok(ids('excluded').includes('excl-ok'));
    assert.ok(!ids('unjustified').includes('excl-ok'));
  });
});

describe('soaFocusRows() — overdue follows controlReviewStatus()', () => {
  test('an implemented control past cadence, or never verified, is overdue', () => {
    assert.deepEqual(ids('overdue'), ['stale', 'never']);
  });

  test('cadence is honoured, not hard-coded', () => {
    // 'stale' was verified 2026-01-01; at a 1000-day cadence nothing is due.
    assert.deepEqual(ids('overdue', ROWS, { today: TODAY, cadenceDays: 1000 }), ['never']);
  });

  test('only implemented controls can be overdue for review', () => {
    // Nothing is being re-verified on a control that was never claimed done.
    assert.ok(!ids('overdue').includes('wip'));
    assert.ok(!ids('overdue').includes('todo'));
  });
});

describe('soaFocusRows() — defensive edges', () => {
  test('an unknown key returns nothing rather than everything', () => {
    // The failure mode this prevents: a typo'd key silently filtering to
    // the full set, so the table looks unfiltered while the bar above it
    // claims a filter is on.
    assert.deepEqual(L.soaFocusRows('bogus', ROWS, OPTS), []);
    assert.deepEqual(L.soaFocusRows('', ROWS, OPTS), []);
    assert.deepEqual(L.soaFocusRows(undefined, ROWS, OPTS), []);
  });

  test('a missing or non-array row set is tolerated', () => {
    assert.deepEqual(L.soaFocusRows('implemented', null, OPTS), []);
    assert.deepEqual(L.soaFocusRows('implemented', undefined, OPTS), []);
    assert.deepEqual(L.soaFocusRows('implemented', 'nope', OPTS), []);
  });

  test('null entries inside the row set do not throw', () => {
    assert.doesNotThrow(() => L.soaFocusRows('excluded', [null, undefined, { id: 'x', app: false }], OPTS));
    assert.deepEqual(L.soaFocusRows('excluded', [null, { id: 'x', app: false }], OPTS).map((r) => r.id), ['x']);
  });

  test('the input array is never mutated', () => {
    const before = JSON.stringify(ROWS);
    ['implemented', 'inprogress', 'notstarted', 'excluded', 'unjustified', 'overdue'].forEach((k) => ids(k));
    assert.equal(JSON.stringify(ROWS), before);
  });
});

describe('soaFocusLabel()', () => {
  test('every slice key has a human label for the filter bar', () => {
    for (const key of ['implemented', 'inprogress', 'notstarted', 'excluded', 'overdue', 'unjustified']) {
      assert.ok(L.soaFocusLabel(key).length > 0, key + ' needs a label');
    }
  });

  test('an unknown key yields an empty label, not "undefined" on screen', () => {
    assert.equal(L.soaFocusLabel('bogus'), '');
    assert.equal(L.soaFocusLabel(), '');
  });
});
