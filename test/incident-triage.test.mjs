// Tests for incidentTriageResult() — the scoring behind the
// 'xdr-incidents' posture check, which reads the Microsoft Defender XDR
// incident queue via Graph's /security/incidents (GA on v1.0).
//
// This is the first Checkpoint check that scores from real incident
// records rather than inferring from Microsoft Secure Score, which is
// what lets the ISO 27001 A.5.25/A.5.26 controls it maps to reach
// 'demonstrated' assurance instead of being capped at a practitioner's
// assertion. That makes the scoring boundaries worth pinning: an
// incident wrongly counted as overdue is a control wrongly reported as
// failing, on a register an auditor reads.
//
// The Graph query itself (filter, $select, paging) lives in graph.js and
// is not covered here — these tests are about what the numbers mean.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import CheckpointLib from '../public/checkpoint/lib.js';

const { incidentTriageResult } = CheckpointLib;

// A fixed "now" so nothing here depends on the wall clock.
const NOW = Date.parse('2026-06-15T12:00:00Z');
const daysAgo = (n) => new Date(NOW - n * 86400000).toISOString();

function inc(over) {
  return Object.assign({
    id: 'inc-1', status: 'active', severity: 'high',
    createdDateTime: daysAgo(1), assignedTo: 'soc@example.com'
  }, over || {});
}

describe('incidentTriageResult() — outcome', () => {
  test('an empty queue passes: nothing to triage is not a failure', () => {
    const r = incidentTriageResult([], 5, NOW);
    assert.equal(r.result, 'pass');
    assert.equal(r.active, 0);
  });

  test('null/undefined input does not throw', () => {
    assert.equal(incidentTriageResult(null, 5, NOW).result, 'pass');
    assert.equal(incidentTriageResult(undefined, 5, NOW).result, 'pass');
  });

  test('a recent, assigned high-severity incident passes — it is being worked', () => {
    const r = incidentTriageResult([inc({ createdDateTime: daysAgo(1) })], 5, NOW);
    assert.equal(r.result, 'pass');
    assert.equal(r.highOpen, 1);
    assert.equal(r.overdue, 0);
  });

  test('a high-severity incident past the triage window fails', () => {
    const r = incidentTriageResult([inc({ createdDateTime: daysAgo(9) })], 5, NOW);
    assert.equal(r.result, 'fail');
    assert.equal(r.overdue, 1);
  });

  test('an unassigned high-severity incident is a review even inside the window', () => {
    // Nobody owning it is how it becomes overdue in the first place.
    const r = incidentTriageResult([inc({ createdDateTime: daysAgo(1), assignedTo: null })], 5, NOW);
    assert.equal(r.result, 'review');
    assert.equal(r.unassigned, 1);
  });

  test('overdue outranks unassigned — the worse finding wins', () => {
    const r = incidentTriageResult([inc({ createdDateTime: daysAgo(9), assignedTo: null })], 5, NOW);
    assert.equal(r.result, 'fail');
  });

  test('volume alone never fails: many recent assigned incidents still pass', () => {
    // Detection working is not a compliance failure. Only unworked
    // incidents are.
    const many = Array.from({ length: 40 }, (_, n) => inc({ id: 'inc-' + n, createdDateTime: daysAgo(1) }));
    const r = incidentTriageResult(many, 5, NOW);
    assert.equal(r.result, 'pass');
    assert.equal(r.active, 40);
  });
});

describe('incidentTriageResult() — what counts', () => {
  test('resolved incidents are excluded even if the caller passes them in', () => {
    const r = incidentTriageResult([
      inc({ status: 'resolved', createdDateTime: daysAgo(400) }),
      inc({ status: 'redirected', createdDateTime: daysAgo(400) })
    ], 5, NOW);
    assert.equal(r.active, 0);
    assert.equal(r.result, 'pass');
  });

  test('only high severity drives the outcome; lower severities are counted but do not fail', () => {
    const r = incidentTriageResult([
      inc({ severity: 'medium', createdDateTime: daysAgo(90) }),
      inc({ severity: 'low', createdDateTime: daysAgo(90) }),
      inc({ severity: 'informational', createdDateTime: daysAgo(90) })
    ], 5, NOW);
    assert.equal(r.active, 3);
    assert.equal(r.highOpen, 0);
    assert.equal(r.result, 'pass');
  });

  test('an unparseable createdDateTime is never counted as overdue', () => {
    // We cannot tell how old it is. Inventing a fail out of missing data
    // is how a posture score loses its credibility.
    ['', null, undefined, 'not-a-date'].forEach((v) => {
      const r = incidentTriageResult([inc({ createdDateTime: v })], 5, NOW);
      assert.equal(r.overdue, 0, `createdDateTime ${JSON.stringify(v)} must not count as overdue`);
    });
  });

  test('a null entry in the array does not throw', () => {
    const r = incidentTriageResult([null, undefined, inc()], 5, NOW);
    assert.equal(r.active, 1);
  });
});

describe('incidentTriageResult() — the triage window', () => {
  test('the boundary is strictly greater-than, so exactly at the window is not yet overdue', () => {
    assert.equal(incidentTriageResult([inc({ createdDateTime: daysAgo(5) })], 5, NOW).overdue, 0);
    assert.equal(incidentTriageResult([inc({ createdDateTime: daysAgo(5.0001) })], 5, NOW).overdue, 1);
  });

  test('the window is configurable — the same incident passes or fails on the tenant threshold', () => {
    const seven = [inc({ createdDateTime: daysAgo(7) })];
    assert.equal(incidentTriageResult(seven, 5, NOW).result, 'fail');
    assert.equal(incidentTriageResult(seven, 14, NOW).result, 'pass');
  });

  test('a zero-day window is honoured rather than treated as unset', () => {
    // An organisation committing to same-day triage is entitled to be
    // measured against that; 0 must not silently fall back to a default.
    assert.equal(incidentTriageResult([inc({ createdDateTime: daysAgo(0.5) })], 0, NOW).result, 'fail');
  });

  test('a missing or nonsensical window falls back to the 5-day default', () => {
    assert.equal(incidentTriageResult([inc({ createdDateTime: daysAgo(9) })], undefined, NOW).result, 'fail');
    assert.equal(incidentTriageResult([inc({ createdDateTime: daysAgo(1) })], undefined, NOW).result, 'pass');
  });
});

// ---------------------------------------------------------------------
// alertTriageResult() — the sibling that scores the Defender XDR ALERT
// queue, used by the 'alerts' check when Defender XDR is available (it
// falls back to the Secure Score proxy when it is not, so no tenant
// loses the coverage it had).
//
// Alerts are deliberately NOT scored like incidents. An incident groups
// related alerts and is meant to be worked; alerts are high-volume and
// mostly auto-resolve, so scoring on "any unresolved alert" would give a
// permanently red check that everyone learns to ignore. What matters is
// alerts nobody has looked at — status 'newAlert' means untouched.
describe('alertTriageResult()', () => {
  const NOW2 = Date.parse('2026-06-15T12:00:00Z');
  const ago = (n) => new Date(NOW2 - n * 86400000).toISOString();
  const alert = (over) => Object.assign({
    id: 'a1', status: 'newAlert', severity: 'high', createdDateTime: ago(1)
  }, over || {});

  test('an empty queue passes', () => {
    assert.equal(CheckpointLib.alertTriageResult([], 5, NOW2).result, 'pass');
    assert.equal(CheckpointLib.alertTriageResult(null, 5, NOW2).result, 'pass');
  });

  test('resolved alerts are excluded entirely', () => {
    const r = CheckpointLib.alertTriageResult([alert({ status: 'resolved', createdDateTime: ago(90) })], 5, NOW2);
    assert.equal(r.open, 0);
    assert.equal(r.result, 'pass');
  });

  test('a high-severity alert nobody has opened is a review while still inside the window', () => {
    assert.equal(CheckpointLib.alertTriageResult([alert()], 5, NOW2).result, 'review');
  });

  test('a high-severity alert untouched beyond the window fails', () => {
    const r = CheckpointLib.alertTriageResult([alert({ createdDateTime: ago(9) })], 5, NOW2);
    assert.equal(r.result, 'fail');
    assert.equal(r.stale, 1);
  });

  test('inProgress means someone is on it — never stale, however old', () => {
    // The signal is "nobody has looked at this", not "this is taking a
    // while". A long investigation is not a triage failure.
    const r = CheckpointLib.alertTriageResult([alert({ status: 'inProgress', createdDateTime: ago(90) })], 5, NOW2);
    assert.equal(r.open, 1);
    assert.equal(r.stale, 0);
    assert.equal(r.result, 'pass');
  });

  test('lower-severity untouched alerts do not drive the outcome', () => {
    const rows = ['medium', 'low', 'informational'].map((s, i) => alert({ id: 's' + i, severity: s, createdDateTime: ago(90) }));
    const r = CheckpointLib.alertTriageResult(rows, 5, NOW2);
    assert.equal(r.open, 3);
    assert.equal(r.highUntouched, 0);
    assert.equal(r.result, 'pass');
  });

  test('an unparseable createdDateTime is never counted stale', () => {
    assert.equal(CheckpointLib.alertTriageResult([alert({ createdDateTime: 'nope' })], 5, NOW2).stale, 0);
  });

  test('volume of untouched low-severity noise never fails the check', () => {
    const many = Array.from({ length: 200 }, (_, n) => alert({ id: 'n' + n, severity: 'low', createdDateTime: ago(60) }));
    assert.equal(CheckpointLib.alertTriageResult(many, 5, NOW2).result, 'pass');
  });
});
