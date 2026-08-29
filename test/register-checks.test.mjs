// Tests for the four register-derived posture checks — backup, bcp,
// supplier and policy — which were previously scored:false and could
// therefore never be anything but 'manual'.
//
// They score from Checkpoint's OWN registers (Calendar, Documents,
// Vendors) rather than Microsoft Graph. That matters more than it
// sounds: unlike the Defender and Purview reads, these need no Graph
// scope and no premium licence, so they work on every tenant — E3,
// Business Premium, anything.
//
// The rule every one of them obeys, and the reason this was safe to
// turn on for existing tenants:
//
//     AN EMPTY REGISTER IS 'manual', NEVER 'fail'.
//
// Checkpoint cannot distinguish "this organisation does not test its
// backups" from "this organisation tests its backups and records it
// somewhere else". Scoring the second as a failure would be inventing a
// finding on a register an auditor reads. score() excludes 'manual'
// from its denominator, so an honest "we cannot see this" costs a
// tenant nothing.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import CheckpointLib from '../public/checkpoint/lib.js';

const { backupCheckResult, bcpCheckResult, supplierCheckResult, policyCheckResult, recurringActivityState } = CheckpointLib;

const TODAY = '2026-06-15';
const PAST = '2026-01-01';
const FUTURE = '2027-01-01';

const cal = (over) => Object.assign({
  id: 'CAL-1', category: 'Backup restore test', status: 'Active',
  nextDue: FUTURE, lastCompleted: PAST
}, over || {});

const doc = (over) => Object.assign({
  id: 'd1', category: 'Policies & Procedures', status: 'Approved',
  version: '1.0', owner: 'S. Okafor', nextReview: FUTURE
}, over || {});

const vendor = (over) => Object.assign({
  id: 'V-1', name: 'Acme', criticality: 'Critical',
  lastReviewed: PAST, nextReviewDue: FUTURE
}, over || {});

describe('the empty-register rule — every check degrades to manual, never fail', () => {
  test('backup', () => {
    assert.equal(backupCheckResult([], TODAY).result, 'manual');
    assert.equal(backupCheckResult(null, TODAY).result, 'manual');
  });
  test('bcp', () => {
    assert.equal(bcpCheckResult([], [], TODAY).result, 'manual');
    assert.equal(bcpCheckResult(null, null, TODAY).result, 'manual');
  });
  test('supplier', () => {
    assert.equal(supplierCheckResult([], TODAY).result, 'manual');
    assert.equal(supplierCheckResult(null, TODAY).result, 'manual');
  });
  test('policy', () => {
    assert.equal(policyCheckResult([], TODAY).result, 'manual');
    assert.equal(policyCheckResult(null, TODAY).result, 'manual');
  });
  test('a register holding only unrelated rows is still manual for this check', () => {
    // A tenant with an access-control review scheduled but no backup
    // test has said nothing about backups.
    assert.equal(backupCheckResult([cal({ category: 'Access control review' })], TODAY).result, 'manual');
  });
});

describe('backupCheckResult() — A.8.13', () => {
  test('a completed, in-cadence restore test passes', () => {
    assert.equal(backupCheckResult([cal()], TODAY).result, 'pass');
  });
  test('an overdue restore test fails — an untested backup is not a demonstrated one', () => {
    const r = backupCheckResult([cal({ nextDue: PAST })], TODAY);
    assert.equal(r.result, 'fail');
    assert.match(r.note, /overdue/);
  });
  test('scheduled but never completed is a review, not a pass', () => {
    assert.equal(backupCheckResult([cal({ lastCompleted: '' })], TODAY).result, 'review');
  });
  test('retired calendar entries are ignored', () => {
    assert.equal(backupCheckResult([cal({ status: 'Retired', nextDue: PAST })], TODAY).result, 'manual');
  });
});

describe('bcpCheckResult() — A.5.29 / A.5.30', () => {
  const plan = (over) => doc(Object.assign({ tplId: 'bcp-dr-plan' }, over || {}));
  const test1 = (over) => cal(Object.assign({ category: 'BCP/DR test' }, over || {}));

  test('approved current plan plus a completed in-cadence test passes', () => {
    assert.equal(bcpCheckResult([test1()], [plan()], TODAY).result, 'pass');
  });

  test('an overdue failover test fails even when the plan itself is current', () => {
    // The classic finding: a beautifully maintained plan nobody has ever
    // rehearsed.
    const r = bcpCheckResult([test1({ nextDue: PAST })], [plan()], TODAY);
    assert.equal(r.result, 'fail');
    assert.match(r.note, /untested plan is the finding/);
  });

  test('a current plan with no test scheduled at all is a review', () => {
    assert.equal(bcpCheckResult([], [plan()], TODAY).result, 'review');
  });

  test('a draft plan fails — a draft plan is not an operative one', () => {
    assert.equal(bcpCheckResult([], [plan({ status: 'Draft' })], TODAY).result, 'fail');
  });

  test('an approved plan past its review date fails', () => {
    assert.equal(bcpCheckResult([test1()], [plan({ nextReview: PAST })], TODAY).result, 'fail');
  });

  test('superseded plans are ignored, so a replaced plan does not keep passing', () => {
    assert.equal(bcpCheckResult([], [plan({ status: 'Superseded' })], TODAY).result, 'manual');
  });

  test('testing current but no plan document is a review', () => {
    assert.equal(bcpCheckResult([test1()], [], TODAY).result, 'review');
  });
});

describe('supplierCheckResult() — A.5.19 / A.5.20 / A.5.22', () => {
  test('all suppliers reviewed in cadence passes', () => {
    assert.equal(supplierCheckResult([vendor(), vendor({ id: 'V-2', criticality: 'Low' })], TODAY).result, 'pass');
  });

  test('an overdue CRITICAL supplier fails', () => {
    const r = supplierCheckResult([vendor({ nextReviewDue: PAST })], TODAY);
    assert.equal(r.result, 'fail');
    assert.match(r.note, /critical\/high/i);
  });

  test('an overdue LOW-criticality supplier is only a review', () => {
    // Criticality is the point. A check that treats the stationery
    // account like the production data processor trains people to
    // ignore it.
    assert.equal(supplierCheckResult([vendor({ criticality: 'Low', nextReviewDue: PAST })], TODAY).result, 'review');
  });

  test('a never-reviewed critical supplier fails even with no due date set', () => {
    assert.equal(supplierCheckResult([vendor({ lastReviewed: '', nextReviewDue: '' })], TODAY).result, 'fail');
  });

  test('a never-reviewed low-criticality supplier is a review', () => {
    assert.equal(supplierCheckResult([vendor({ criticality: 'Low', lastReviewed: '', nextReviewDue: '' })], TODAY).result, 'review');
  });

  test('one overdue critical supplier outranks many compliant ones', () => {
    const rows = [vendor({ id: 'a' }), vendor({ id: 'b' }), vendor({ id: 'c', nextReviewDue: PAST })];
    assert.equal(supplierCheckResult(rows, TODAY).result, 'fail');
  });
});

describe('policyCheckResult() — A.5.1 / Clause 7.5', () => {
  test('approved, versioned, owned and in cadence passes', () => {
    assert.equal(policyCheckResult([doc()], TODAY).result, 'pass');
  });

  test('controlled documents but none approved fails — an unapproved policy is not issued', () => {
    const r = policyCheckResult([doc({ status: 'Draft' })], TODAY);
    assert.equal(r.result, 'fail');
    assert.match(r.note, /none approved/);
  });

  test('an approved policy past its review date fails', () => {
    assert.equal(policyCheckResult([doc({ nextReview: PAST })], TODAY).result, 'fail');
  });

  test('missing version or owner is a review — each fails Clause 7.5.2 on its face', () => {
    assert.equal(policyCheckResult([doc({ version: '' })], TODAY).result, 'review');
    assert.equal(policyCheckResult([doc({ owner: '' })], TODAY).result, 'review');
  });

  test('an approved policy with no review date at all is a review', () => {
    assert.equal(policyCheckResult([doc({ nextReview: '' })], TODAY).result, 'review');
  });

  test('uncontrolled documents do not count toward the register', () => {
    // An auto-captured evidence export is not a controlled document and
    // must not drag the policy register's numbers around.
    assert.equal(policyCheckResult([doc({ category: 'Auto-evidence', status: '' })], TODAY).result, 'manual');
  });
});

describe('recurringActivityState() — the shared calendar helper', () => {
  test('returns null when nothing of that category is scheduled', () => {
    assert.equal(recurringActivityState([], 'Backup restore test', TODAY), null);
    assert.equal(recurringActivityState(null, 'Backup restore test', TODAY), null);
  });
  test('counts overdue and never-completed independently', () => {
    const st = recurringActivityState([
      cal({ id: '1', nextDue: PAST }),
      cal({ id: '2', lastCompleted: '' }),
      cal({ id: '3' })
    ], 'Backup restore test', TODAY);
    assert.equal(st.total, 3);
    assert.equal(st.overdue, 1);
    assert.equal(st.neverDone, 1);
  });
  test('a null row does not throw', () => {
    assert.equal(recurringActivityState([null, cal()], 'Backup restore test', TODAY).total, 1);
  });
});

// ---------------------------------------------------------------------
// deviceCheckinResult() — Intune check-in staleness (A.8.1).
//
// Distinct from the device COMPLIANCE percentage, and that distinction
// is the whole point: a fleet can read 100% compliant precisely because
// the non-compliant devices stopped checking in and their last-known
// state froze. A device that has not contacted Intune in weeks is not
// receiving policy, configuration or updates, and its compliance state
// is stale evidence rather than current evidence.
//
// Needs no new Graph permission — lastSyncDateTime is added to the
// managedDevices $select the device check already makes.
describe('deviceCheckinResult()', () => {
  const NOW3 = Date.parse('2026-06-15T12:00:00Z');
  const since = (n) => new Date(NOW3 - n * 86400000).toISOString();
  const dev = (over) => Object.assign({ id: 'd1', lastSyncDateTime: since(1) }, over || {});

  test('no devices is a review, not a pass — nothing to report is not evidence', () => {
    assert.equal(CheckpointLib.deviceCheckinResult([], 30, NOW3).result, 'review');
    assert.equal(CheckpointLib.deviceCheckinResult(null, 30, NOW3).result, 'review');
  });

  test('all devices checked in recently passes', () => {
    assert.equal(CheckpointLib.deviceCheckinResult([dev(), dev({ id: 'd2' })], 30, NOW3).result, 'pass');
  });

  test('a device with no sync date at all counts as never, and as stale', () => {
    // Opposite of the missing-date rule elsewhere in this file, and
    // deliberately: an incident with no creation date tells us nothing
    // about its age, but a managed device with no sync date has
    // demonstrably never reported in.
    const r = CheckpointLib.deviceCheckinResult([dev({ lastSyncDateTime: '' })], 30, NOW3);
    assert.equal(r.never, 1);
    assert.equal(r.stale, 1);
  });

  test('scoring is proportional — one stale device in a large fleet is only a review', () => {
    const fleet = Array.from({ length: 50 }, (_, n) => dev({ id: 'd' + n }));
    fleet[0] = dev({ id: 'd0', lastSyncDateTime: since(90) });
    const r = CheckpointLib.deviceCheckinResult(fleet, 30, NOW3);
    assert.equal(r.stale, 1);
    assert.equal(r.result, 'review');
  });

  test('a large proportion stale fails', () => {
    const fleet = Array.from({ length: 10 }, (_, n) => dev({ id: 'd' + n, lastSyncDateTime: since(90) }));
    assert.equal(CheckpointLib.deviceCheckinResult(fleet, 30, NOW3).result, 'fail');
  });

  test('the window is configurable', () => {
    const rows = [dev({ lastSyncDateTime: since(45) })];
    assert.equal(CheckpointLib.deviceCheckinResult(rows, 30, NOW3).stale, 1);
    assert.equal(CheckpointLib.deviceCheckinResult(rows, 60, NOW3).stale, 0);
  });

  test('a missing window falls back to 30 days', () => {
    assert.equal(CheckpointLib.deviceCheckinResult([dev({ lastSyncDateTime: since(45) })], undefined, NOW3).stale, 1);
  });
});
