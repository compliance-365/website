// CSV import (lib.js). This is the only feature in Checkpoint that
// bulk-writes into a client's real compliance register, so the tests
// lean hard on the two failure modes that matter:
//
//   silently WRONG — a row parsed into the wrong fields, or a bad row
//   accepted, which fills a risk register with junk nobody notices; and
//   silently DROPPED — a valid row skipped, which is worse than an
//   error, because the practitioner believes the import worked.
//
// Everything here is pure: planCsvImport() reports, it never writes.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import CheckpointLib from '../public/checkpoint/lib.js';

const { parseCsv, toCsv, normaliseHeader, planCsvImport } = CheckpointLib;

describe('parseCsv() — the exact inverse of toCsv()', () => {
  test('round-trips embedded commas, quotes and newlines', () => {
    const rows = [['id', 'title'], ['R-1', 'Supplier access, unreviewed'], ['R-2', 'He said "no"'], ['R-3', 'line one\nline two']];
    assert.deepEqual(parseCsv(toCsv(rows)), rows);
  });

  test('handles CRLF and LF line endings alike', () => {
    assert.deepEqual(parseCsv('a,b\r\nc,d'), [['a', 'b'], ['c', 'd']]);
    assert.deepEqual(parseCsv('a,b\nc,d'), [['a', 'b'], ['c', 'd']]);
  });

  test('strips the BOM Excel writes on "Save as CSV UTF-8"', () => {
    // Left in place this corrupts the FIRST header name, which then
    // matches no known column and silently drops that entire column.
    assert.deepEqual(parseCsv('﻿id,title\nR-1,x'), [['id', 'title'], ['R-1', 'x']]);
  });

  test('a trailing newline does not manufacture a phantom empty row', () => {
    assert.deepEqual(parseCsv('a,b\nc,d\n'), [['a', 'b'], ['c', 'd']]);
  });

  test('empty fields are preserved rather than collapsed', () => {
    assert.deepEqual(parseCsv('a,,c'), [['a', '', 'c']]);
    assert.deepEqual(parseCsv('a,"",c'), [['a', '', 'c']]);
  });

  test('an empty input yields no rows rather than one blank row', () => {
    assert.deepEqual(parseCsv(''), []);
    assert.deepEqual(parseCsv(null), []);
  });
});

describe('normaliseHeader() — forgiving on presentation, strict on meaning', () => {
  test('case, spacing and punctuation are ignored', () => {
    ['Due date', 'due_date', 'DUE DATE', 'due-date'].forEach(h => assert.equal(normaliseHeader(h), 'duedate'));
  });
});

const spec = {
  label: 'Risks',
  columns: [
    { key: 'title', aliases: ['risk'], required: true },
    { key: 'owner' },
    { key: 'likelihood', validate: (v) => (/^[1-5]$/.test(v) ? null : 'likelihood must be 1-5') },
    { key: 'impact', validate: (v) => (/^[1-5]$/.test(v) ? null : 'impact must be 1-5') }
  ]
};

describe('planCsvImport() — reports a plan, never writes', () => {
  test('classifies valid rows as ready and keeps their values in the right fields', () => {
    const csv = toCsv([['Title', 'Owner', 'Likelihood', 'Impact'], ['Supplier access', 'K. Patel', '4', '5']]);
    const plan = planCsvImport(csv, spec);
    assert.equal(plan.error, undefined);
    assert.equal(plan.ready.length, 1);
    assert.equal(plan.skipped.length, 0);
    assert.deepEqual(plan.ready[0].rec, { title: 'Supplier access', owner: 'K. Patel', likelihood: '4', impact: '5' });
  });

  test('a header alias matches, so an exported file and a hand-made one both work', () => {
    const plan = planCsvImport(toCsv([['Risk'], ['Something bad']]), spec);
    assert.equal(plan.ready.length, 1);
    assert.equal(plan.ready[0].rec.title, 'Something bad');
  });

  test('a missing REQUIRED column fails the whole file rather than importing blanks', () => {
    const plan = planCsvImport(toCsv([['Owner'], ['K. Patel']]), spec);
    assert.match(plan.error, /missing required column/i);
    assert.equal(plan.ready.length, 0);
  });

  test('an invalid value skips only its own row, and says why and where', () => {
    const csv = toCsv([['Title', 'Likelihood'], ['Good row', '3'], ['Bad row', '9']]);
    const plan = planCsvImport(csv, spec);
    assert.equal(plan.ready.length, 1, 'the valid row still imports');
    assert.equal(plan.skipped.length, 1);
    assert.match(plan.skipped[0].reason, /likelihood must be 1-5/);
    assert.equal(plan.skipped[0].line, 3, 'reports the line number a human sees in Excel');
  });

  test('a row missing a required value is skipped, not imported blank', () => {
    const plan = planCsvImport(toCsv([['Title', 'Owner'], ['', 'K. Patel']]), spec);
    assert.equal(plan.ready.length, 0);
    assert.match(plan.skipped[0].reason, /title is required/);
  });

  test('unknown columns are reported, never silently guessed at', () => {
    const plan = planCsvImport(toCsv([['Title', 'Wingspan'], ['x', '2m']]), spec);
    assert.deepEqual(plan.unknownColumns, ['Wingspan']);
    assert.equal(plan.ready.length, 1, 'an unknown column does not block the import');
    assert.equal(plan.ready[0].rec.Wingspan, undefined, 'and its data is not smuggled in');
  });

  test('entirely blank lines are ignored rather than counted as rows', () => {
    const plan = planCsvImport('Title\nGood\n\n\n', spec);
    assert.equal(plan.totalRows, 1);
    assert.equal(plan.ready.length, 1);
  });

  test('an empty file reports an error rather than a successful zero-row import', () => {
    assert.match(planCsvImport('', spec).error, /empty/i);
  });

  test('optional fields left blank are allowed through as empty', () => {
    const plan = planCsvImport(toCsv([['Title', 'Owner'], ['x', '']]), spec);
    assert.equal(plan.ready.length, 1);
    assert.equal(plan.ready[0].rec.owner, '');
  });

  test('values with embedded commas survive into the right field', () => {
    const plan = planCsvImport(toCsv([['Title', 'Owner'], ['Access, unreviewed', 'K. Patel']]), spec);
    assert.equal(plan.ready[0].rec.title, 'Access, unreviewed');
    assert.equal(plan.ready[0].rec.owner, 'K. Patel');
  });
});
