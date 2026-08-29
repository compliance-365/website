// Tests for the two privacy checks — subject rights requests (Microsoft
// Priva) and retention/disposal labels (Microsoft Purview records
// management).
//
// These are the first automated privacy signals Checkpoint has ever had.
// Everything ISO 27701 and Privacy Act related was previously
// self-reported, which meant those controls could only ever be
// 'asserted'.
//
// Both surfaces are GA on Graph v1.0. Note that subject rights requests
// live under /security/subjectRightsRequests — the older /privacy node
// is deprecated and stopped returning data in March 2025, which is a
// nasty failure mode: it returns an empty collection rather than an
// error, so a tenant with real overdue requests would read as "no
// requests" and quietly score a pass.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import CheckpointLib from '../public/checkpoint/lib.js';

const { subjectRightsResult, retentionLabelResult } = CheckpointLib;

const TODAY = '2026-06-15';

const srr = (over) => Object.assign({
  id: 'sr1', status: 'active', dueDateTime: '2026-07-30T00:00:00Z'
}, over || {});

const label = (over) => Object.assign({
  id: 'l1', displayName: 'Financial records — 7 years',
  labelStatus: 'published', actionAfterRetentionPeriod: 'delete'
}, over || {});

describe('subjectRightsResult() — APP 12 / GDPR Art. 12', () => {
  test('an empty queue PASSES rather than degrading to manual', () => {
    // Deliberately different from the register-derived checks. An empty
    // Priva queue is a real answer from a system the tenant
    // demonstrably has — the capability probe succeeded — so "no
    // outstanding requests" is genuinely compliant. An empty Checkpoint
    // register tells you nothing by comparison.
    assert.equal(subjectRightsResult([], TODAY).result, 'pass');
    assert.equal(subjectRightsResult(null, TODAY).result, 'pass');
  });

  test('an open request comfortably inside its deadline passes', () => {
    assert.equal(subjectRightsResult([srr()], TODAY).result, 'pass');
  });

  test('a request past its due date FAILS — this is a live breach, not housekeeping', () => {
    const r = subjectRightsResult([srr({ dueDateTime: '2026-05-01T00:00:00Z' })], TODAY);
    assert.equal(r.result, 'fail');
    assert.equal(r.overdue, 1);
  });

  test('a request due within 7 days is a review — warn before the statutory deadline, not after', () => {
    const r = subjectRightsResult([srr({ dueDateTime: '2026-06-19T00:00:00Z' })], TODAY);
    assert.equal(r.result, 'review');
    assert.equal(r.dueSoon, 1);
  });

  test('closed requests are excluded regardless of how long ago they were due', () => {
    assert.equal(subjectRightsResult([
      srr({ status: 'closed', dueDateTime: '2020-01-01T00:00:00Z' }),
      srr({ status: 'Closed', dueDateTime: '2020-01-01T00:00:00Z' })
    ], TODAY).result, 'pass');
  });

  test('overdue outranks due-soon', () => {
    const r = subjectRightsResult([
      srr({ id: 'a', dueDateTime: '2026-05-01T00:00:00Z' }),
      srr({ id: 'b', dueDateTime: '2026-06-18T00:00:00Z' })
    ], TODAY);
    assert.equal(r.result, 'fail');
  });

  test('a request with no due date at all is counted open but never overdue', () => {
    // We cannot invent a deadline we were not given.
    const r = subjectRightsResult([srr({ dueDateTime: '' })], TODAY);
    assert.equal(r.open, 1);
    assert.equal(r.overdue, 0);
    assert.equal(r.result, 'pass');
  });

  test('the boundary: due today is not yet overdue', () => {
    assert.equal(subjectRightsResult([srr({ dueDateTime: TODAY + 'T00:00:00Z' })], TODAY).overdue, 0);
  });

  test('a null entry does not throw', () => {
    assert.equal(subjectRightsResult([null, srr()], TODAY).open, 1);
  });
});

describe('retentionLabelResult() — A.5.33 / A.8.10 / APP 11.2', () => {
  test('no labels at all FAILS — retention is not optional under the standard or the Act', () => {
    // Unlike the register checks there is no "maybe they do it
    // elsewhere": Purview records management IS where this is done in a
    // Microsoft tenant, and the capability probe already confirmed they
    // have it.
    assert.equal(retentionLabelResult([]).result, 'fail');
    assert.equal(retentionLabelResult(null).result, 'fail');
  });

  test('published labels with an end-of-retention action pass', () => {
    assert.equal(retentionLabelResult([label()]).result, 'pass');
  });

  test('labels that exist but were never published fail — an unpublished label applies to nothing', () => {
    assert.equal(retentionLabelResult([label({ labelStatus: 'draft' })]).result, 'fail');
  });

  test('published labels with NO end-of-retention action are a review', () => {
    // Retention with no disposal keeps content forever, which fails the
    // deletion half of A.8.10 just as surely as no labels fails the
    // retention half.
    const r = retentionLabelResult([label({ actionAfterRetentionPeriod: 'none' })]);
    assert.equal(r.result, 'review');
    assert.equal(r.withDisposition, 0);
  });

  test('a missing labelStatus is treated as published rather than invented as a failure', () => {
    // Graph exposes this inconsistently across tenants; absence is not
    // evidence of a draft.
    assert.equal(retentionLabelResult([label({ labelStatus: undefined })]).result, 'pass');
    assert.equal(retentionLabelResult([label({ labelStatus: null })]).result, 'pass');
  });

  test('counts are reported alongside the outcome', () => {
    const r = retentionLabelResult([
      label({ id: 'a' }),
      label({ id: 'b', actionAfterRetentionPeriod: 'none' }),
      label({ id: 'c', labelStatus: 'draft' })
    ]);
    assert.equal(r.total, 3);
    assert.equal(r.published, 2);
    assert.equal(r.withDisposition, 2);
    assert.equal(r.result, 'pass');
  });

  test('a null entry does not throw', () => {
    assert.equal(retentionLabelResult([null, label()]).total, 1);
  });
});
