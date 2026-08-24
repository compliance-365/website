// Control assurance — the level-3-to-4 distinction.
//
// "Implemented" in a Statement of Applicability is an ASSERTION.
// operatingEffectiveness() already answers "did this check pass over
// this window" per CHECK; this layer answers "how much do we actually
// know that this CONTROL works, and on what basis" — the question APRA
// CPS 234's testing-effectiveness requirement asks directly.
//
// The failure mode that matters most is OVERSTATING assurance: calling
// a control demonstrated when the live signal disagrees, or letting an
// unsupported tick-box claim read the same as six months of passing
// automated observations. Every test below is pointed at that.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import CheckpointLib from '../public/checkpoint/lib.js';

const { controlAssurance, assuranceSummary } = CheckpointLib;

const TODAY = '2026-08-24';
function eff(o = {}) {
  return Object.assign({ totalObservations: 0, passCount: 0, manualCount: 0, exceptions: [], lastObservedDate: null }, o);
}
function ctl(o = {}) {
  return Object.assign({ st: 'Implemented', applicable: true, evidenceUrl: '', lastVerified: '' }, o);
}

describe('controlAssurance() — ranking the basis for a claim', () => {
  test('passing automated observations with no exceptions is the strongest basis', () => {
    const a = controlAssurance({
      control: ctl({ lastVerified: TODAY }),
      effectiveness: eff({ totalObservations: 12, passCount: 12, lastObservedDate: TODAY }),
      today: TODAY, cadenceDays: 365
    });
    assert.equal(a.level, 'demonstrated');
    assert.match(a.basis, /12 automated observations passed/);
  });

  test('an evidence link outranks a bare human attestation', () => {
    const a = controlAssurance({ control: ctl({ evidenceUrl: 'https://sp/doc', lastVerified: TODAY }), today: TODAY });
    assert.equal(a.level, 'evidenced');
  });

  test('a human attestation with no evidence is only asserted', () => {
    const a = controlAssurance({ control: ctl({ lastVerified: TODAY }), today: TODAY });
    assert.equal(a.level, 'asserted');
  });

  test('implemented with nothing at all behind it is unsupported — the weakest claim, named as such', () => {
    const a = controlAssurance({ control: ctl(), today: TODAY });
    assert.equal(a.level, 'unsupported');
    assert.match(a.basis, /no evidence, no verification and no automated signal/);
  });

  test('the strongest available basis wins rather than double-counting', () => {
    // Both automated passes AND an evidence link: reported once, as the
    // strongest, not inflated into some combined score.
    const a = controlAssurance({
      control: ctl({ evidenceUrl: 'https://sp/doc', lastVerified: TODAY }),
      effectiveness: eff({ totalObservations: 5, passCount: 5 }),
      today: TODAY
    });
    assert.equal(a.level, 'demonstrated');
  });
});

describe('controlAssurance() — refusing to overstate', () => {
  test('automated exceptions block "demonstrated" even when observations exist', () => {
    // The paperwork says implemented; the live signal disagrees. This
    // must never read as demonstrated.
    const a = controlAssurance({
      control: ctl({ evidenceUrl: 'https://sp/doc', lastVerified: TODAY }),
      effectiveness: eff({ totalObservations: 10, passCount: 8, exceptions: [{ date: '2026-08-01', result: 'fail' }, { date: '2026-08-10', result: 'review' }] }),
      today: TODAY
    });
    assert.equal(a.level, 'evidenced', 'falls back to the next-strongest basis');
    assert.equal(a.exceptionCount, 2);
    assert.match(a.basis, /2 exceptions/, 'and the contradiction is stated, not hidden');
  });

  test('observations that exist but never passed do not count as demonstrated', () => {
    const a = controlAssurance({
      control: ctl({ lastVerified: TODAY }),
      effectiveness: eff({ totalObservations: 4, passCount: 0, exceptions: [{ date: '2026-08-01', result: 'fail' }] }),
      today: TODAY
    });
    assert.equal(a.level, 'asserted');
  });

  test('a manual-only observation history is not a demonstration', () => {
    // 'manual' means no live signal existed that scan date — an
    // observation that the check ran, not evidence the control worked.
    const a = controlAssurance({
      control: ctl({ lastVerified: TODAY }),
      effectiveness: eff({ totalObservations: 6, passCount: 0, manualCount: 6 }),
      today: TODAY
    });
    assert.equal(a.level, 'asserted');
  });
});

describe('controlAssurance() — staleness is reported alongside, not folded in', () => {
  test('verification older than the cadence is flagged stale', () => {
    const a = controlAssurance({ control: ctl({ evidenceUrl: 'x', lastVerified: '2025-01-01' }), today: TODAY, cadenceDays: 365 });
    assert.equal(a.stale, true);
    assert.ok(a.staleDays > 365);
    assert.equal(a.level, 'evidenced', 'staleness does not silently downgrade the basis');
  });

  test('never verified reads as stale with null days — not zero', () => {
    // "never verified" and "verified today" must not be confusable.
    const a = controlAssurance({ control: ctl({ evidenceUrl: 'x' }), today: TODAY });
    assert.equal(a.staleDays, null);
    assert.equal(a.stale, true);
  });

  test('recent verification inside cadence is not stale', () => {
    const a = controlAssurance({ control: ctl({ evidenceUrl: 'x', lastVerified: '2026-08-01' }), today: TODAY, cadenceDays: 365 });
    assert.equal(a.stale, false);
    assert.equal(a.staleDays, 23);
  });

  test('excluded and not-implemented controls are never flagged stale', () => {
    // Chasing a re-verification date on a control that is out of scope,
    // or not yet built, is noise that buries the real findings.
    assert.equal(controlAssurance({ control: ctl({ applicable: false }), today: TODAY }).stale, false);
    assert.equal(controlAssurance({ control: ctl({ st: 'Not started' }), today: TODAY }).stale, false);
  });
});

describe('controlAssurance() — scope states', () => {
  test('an excluded control is excluded, not a gap', () => {
    const a = controlAssurance({ control: ctl({ applicable: false }), today: TODAY });
    assert.equal(a.level, 'excluded');
  });

  test('a control not yet implemented is reported as such, not as unsupported', () => {
    const a = controlAssurance({ control: ctl({ st: 'In progress' }), today: TODAY });
    assert.equal(a.level, 'not-implemented');
  });

  test('missing input does not throw', () => {
    assert.equal(controlAssurance().level, 'not-implemented');
    assert.equal(controlAssurance({}).level, 'not-implemented');
  });
});

describe('assuranceSummary() — the number a board paper needs', () => {
  const rows = [
    { level: 'demonstrated', stale: false, exceptionCount: 0 },
    { level: 'demonstrated', stale: false, exceptionCount: 0 },
    { level: 'evidenced', stale: true, exceptionCount: 1 },
    { level: 'asserted', stale: false, exceptionCount: 0 },
    { level: 'unsupported', stale: true, exceptionCount: 0 },
    { level: 'not-implemented', stale: false, exceptionCount: 0 },
    { level: 'excluded', stale: false, exceptionCount: 0 }
  ];

  test('counts each level, and excludes out-of-scope controls from the applicable base', () => {
    const s = assuranceSummary(rows);
    assert.equal(s.demonstrated, 2);
    assert.equal(s.evidenced, 1);
    assert.equal(s.asserted, 1);
    assert.equal(s.unsupported, 1);
    assert.equal(s.notImplemented, 1);
    assert.equal(s.excluded, 1);
    assert.equal(s.applicable, 6, 'excluded controls are not gaps and are not in the base');
  });

  test('surfaces stale and exception counts separately from level', () => {
    const s = assuranceSummary(rows);
    assert.equal(s.stale, 2);
    assert.equal(s.withExceptions, 1);
  });

  test('an empty or missing list yields zeroes rather than throwing', () => {
    assert.equal(assuranceSummary([]).applicable, 0);
    assert.equal(assuranceSummary().applicable, 0);
  });
});
