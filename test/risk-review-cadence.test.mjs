// riskReviewStatus() — whether an open risk has gone past the tenant's
// own review cadence.
//
// ISO/IEC 27001 clause 8.2 requires risk assessments at planned intervals
// or on significant change, and Checkpoint's own Risk Management
// Framework policy template commits in writing to reviewing residual risk
// "at least quarterly and after any material change". The app could
// evidence neither: the Risks list had no field recording when a risk was
// last looked at, so a register full of risks nobody had revisited in two
// years was indistinguishable from one reviewed last week.
//
// Controls, vendors and documents all already had a review cadence. Risks
// — the register the whole ISMS hangs off — did not.
//
// This deliberately mirrors controlReviewStatus() rather than
// documentReviewState(): a risk has no natural per-item next-review date
// the way a controlled document does, so it is "last reviewed plus the
// tenant's cadence", one setting for the register.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import CheckpointLib from '../public/checkpoint/lib.js';

const { riskReviewStatus } = CheckpointLib;
const TODAY = '2026-09-19';
const risk = over => Object.assign({ status: 'Open', actions: [] }, over || {});

describe('riskReviewStatus()', () => {
  test('a risk reviewed today is not due', () => {
    const s = riskReviewStatus(risk({ lastReviewed: TODAY }), TODAY, 90);
    assert.deepEqual(s, { due: false, neverReviewed: false, daysOverdue: 0 });
  });

  test('inside the cadence is not due', () => {
    // 89 days before 2026-09-19.
    const s = riskReviewStatus(risk({ lastReviewed: '2026-06-22' }), TODAY, 90);
    assert.equal(s.due, false);
    assert.equal(s.daysOverdue, 0);
  });

  test('exactly on the cadence is not yet due', () => {
    // 90 days exactly — the cadence is "review within 90 days", so day 90
    // is the last compliant day, not the first overdue one.
    const s = riskReviewStatus(risk({ lastReviewed: '2026-06-21' }), TODAY, 90);
    assert.equal(s.due, false, '90 days exactly should not yet be overdue');
  });

  test('one day past the cadence is due, and says by how much', () => {
    const s = riskReviewStatus(risk({ lastReviewed: '2026-06-20' }), TODAY, 90);
    assert.deepEqual(s, { due: true, neverReviewed: false, daysOverdue: 1 });
  });

  test('a risk never reviewed is due, and says so rather than guessing a day count', () => {
    // The UI needs to print "Never", not a number derived from nothing —
    // same convention controlReviewStatus() uses for a never-verified
    // control. daysOverdue is null precisely so a caller cannot render it
    // as "0d over" and imply the risk is fine.
    const s = riskReviewStatus(risk({}), TODAY, 90);
    assert.deepEqual(s, { due: true, neverReviewed: true, daysOverdue: null });
  });

  test('a closed risk is never chased, however long ago it was reviewed', () => {
    const s = riskReviewStatus(risk({ status: 'Closed', lastReviewed: '2020-01-01' }), TODAY, 90);
    assert.deepEqual(s, { due: false, neverReviewed: false, daysOverdue: 0 });
  });

  test('a closed risk that was never reviewed is still not chased', () => {
    assert.equal(riskReviewStatus(risk({ status: 'Closed' }), TODAY, 90).due, false);
  });

  test('the cadence is the tenant\'s own, not a hard-coded quarter', () => {
    const r = risk({ lastReviewed: '2026-08-20' }); // 30 days ago
    assert.equal(riskReviewStatus(r, TODAY, 90).due, false, 'inside a 90-day cadence');
    assert.equal(riskReviewStatus(r, TODAY, 14).due, true, 'outside a 14-day cadence');
    assert.equal(riskReviewStatus(r, TODAY, 14).daysOverdue, 16);
  });

  test('a missing or unparseable cadence falls back to 90 rather than to zero', () => {
    // Falling back to 0 would mark the entire register overdue the moment
    // a tenant's Settings list predated this key — the "old tenant, new
    // setting" tolerance every other threshold in this app already has.
    const r = risk({ lastReviewed: '2026-08-20' }); // 30 days ago
    for (const cadence of [undefined, null, '', 'quarterly', NaN]) {
      assert.equal(riskReviewStatus(r, TODAY, cadence).due, false,
        `cadence ${JSON.stringify(cadence)} should fall back to 90 days`);
    }
  });

  test('a null/undefined risk does not throw', () => {
    // Called from render paths over arrays that can carry holes.
    assert.equal(riskReviewStatus(null, TODAY, 90).due, true);
    assert.equal(riskReviewStatus(undefined, TODAY, 90).neverReviewed, true);
  });
});
