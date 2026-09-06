// Tests for lib.js's documentFocusRows() — the documents behind each tile
// of the register summary.
//
// The contract is the same one soaFocusRows() and trainingFocusRows() hold:
// the number on a tile is the length of the list that tile opens. Here that
// is enforced by construction — documentFocusRows() re-walks
// documentRegisterSummary()'s own branches in the same order — so the most
// valuable assertion in this file is the cross-check at the bottom, which
// pins every slice against the summary that produces the tile's number.
//
// The two early returns are the interesting part. A document that is not
// controlled is in no slice at all, and a Superseded one counts toward
// `controlled` but is excluded from every review and completeness slice:
// it has been withdrawn, so chasing its review date would be noise on a
// register an auditor reads.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import L from '../public/checkpoint/lib.js';

const TODAY = '2026-09-06';
const OPTS = { controlledCategories: ['Policies & Procedures', 'ISMS'], warnDays: 30 };

const DOCS = [
  { name: 'current', status: 'Approved', category: 'Policies & Procedures', version: '1.0', owner: 'K', nextReview: '2027-01-01' },
  { name: 'late', status: 'Approved', category: 'Policies & Procedures', version: '2.0', owner: 'K', nextReview: '2026-01-01' },
  { name: 'soon', status: 'Approved', category: 'Policies & Procedures', version: '1.1', owner: 'K', nextReview: '2026-09-20' },
  { name: 'draft', status: 'Draft', category: 'Policies & Procedures' },
  { name: 'inreview', status: 'In review', category: 'ISMS', version: '0.9', owner: 'S', nextReview: '2027-06-01' },
  { name: 'withdrawn', status: 'Superseded', category: 'Policies & Procedures', nextReview: '2020-01-01' },
  { name: 'evidence', category: 'Evidence' },
  { name: 'uncategorised-controlled', category: 'ISMS' }
];

const names = (key, docs = DOCS) => L.documentFocusRows(key, docs, TODAY, OPTS).map((d) => d.name);

describe('documentFocusRows() — what counts as controlled', () => {
  test('a document in a controlled category, or carrying a status, is controlled', () => {
    assert.deepEqual(names('controlled'),
      ['current', 'late', 'soon', 'draft', 'inreview', 'withdrawn', 'uncategorised-controlled']);
  });

  test('an uncontrolled artefact is in no slice at all', () => {
    // An evidence export is a point-in-time file, not a controlled
    // document. It must not appear anywhere in this register's slices,
    // or the register starts chasing review dates for screenshots.
    for (const key of ['controlled', 'approved', 'draft', 'overdue', 'due', 'incomplete']) {
      assert.ok(!names(key).includes('evidence'), 'evidence leaked into ' + key);
    }
  });
});

describe('documentFocusRows() — status slices', () => {
  test('approved', () => {
    assert.deepEqual(names('approved'), ['current', 'late', 'soon']);
  });

  test('draft folds Draft and In review together, matching its tile', () => {
    assert.deepEqual(names('draft'), ['draft', 'inreview']);
  });
});

describe('documentFocusRows() — a withdrawn document is counted but not chased', () => {
  test('Superseded still counts as controlled', () => {
    assert.ok(names('controlled').includes('withdrawn'));
  });

  test('but is in no review or completeness slice', () => {
    // Its nextReview is years past; without the early return it would
    // show up as overdue for ever.
    for (const key of ['overdue', 'due', 'incomplete']) {
      assert.ok(!names(key).includes('withdrawn'), 'withdrawn leaked into ' + key);
    }
  });
});

describe('documentFocusRows() — review slices', () => {
  test('overdue is past its next-review date', () => {
    assert.deepEqual(names('overdue'), ['late']);
  });

  test('due is inside the warning window but not yet past', () => {
    assert.deepEqual(names('soon' === 'soon' ? 'due' : 'due'), ['soon']);
  });

  test('overdue and due never overlap', () => {
    const due = new Set(names('due'));
    for (const n of names('overdue')) assert.ok(!due.has(n), n + ' is both overdue and due');
  });

  test('the warning window is honoured, not hard-coded', () => {
    // With a 1-day window, "soon" (14 days out) is no longer due.
    const tight = L.documentFocusRows('due', DOCS, TODAY, { ...OPTS, warnDays: 1 }).map((d) => d.name);
    assert.deepEqual(tight, []);
  });
});

describe('documentFocusRows() — incomplete register entries', () => {
  test('a document missing a version, an owner or a review date is incomplete', () => {
    assert.deepEqual(names('incomplete'), ['draft', 'uncategorised-controlled']);
  });

  test('a fully registered document is not', () => {
    assert.ok(!names('incomplete').includes('current'));
  });
});

describe('documentFocusRows() — defensive edges', () => {
  test('an unknown key returns nothing rather than everything', () => {
    assert.deepEqual(L.documentFocusRows('bogus', DOCS, TODAY, OPTS), []);
    assert.deepEqual(L.documentFocusRows(undefined, DOCS, TODAY, OPTS), []);
  });

  test('missing docs, and holes in them, are tolerated', () => {
    assert.deepEqual(L.documentFocusRows('controlled', null, TODAY, OPTS), []);
    assert.doesNotThrow(() => L.documentFocusRows('controlled', [null, undefined], TODAY, OPTS));
  });

  test('with no controlled categories only documents carrying a status count', () => {
    const out = L.documentFocusRows('controlled', DOCS, TODAY, { warnDays: 30 }).map((d) => d.name);
    assert.deepEqual(out, ['current', 'late', 'soon', 'draft', 'inreview', 'withdrawn']);
  });
});

describe('every slice agrees with the summary that supplies its tile number', () => {
  // This is the whole promise the tiles make. documentRegisterSummary()
  // produces the figure; documentFocusRows() produces the rows behind it.
  // If these ever diverge, a tile says 3 and opens 4.
  const s = L.documentRegisterSummary(DOCS, TODAY, OPTS);
  const pairs = [
    ['controlled', s.controlled],
    ['approved', s.approved],
    ['draft', s.draft + s.inReview],
    ['overdue', s.overdue],
    ['due', s.due]
  ];
  for (const [key, expected] of pairs) {
    test(key + ' tile shows ' + expected + ', and opens that many rows', () => {
      assert.equal(L.documentFocusRows(key, DOCS, TODAY, OPTS).length, expected);
    });
  }
});

describe('documentFocusLabel()', () => {
  test('every slice has a label for the filter bar', () => {
    for (const key of ['controlled', 'approved', 'draft', 'overdue', 'due', 'incomplete']) {
      assert.ok(L.documentFocusLabel(key).length > 0, key + ' needs a label');
    }
  });

  test('an unknown key yields an empty label, not "undefined" on screen', () => {
    assert.equal(L.documentFocusLabel('bogus'), '');
    assert.equal(L.documentFocusLabel(), '');
  });
});
