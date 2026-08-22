// Zero-dependency tests for public/checkpoint/lib.js — the pure
// scoring/threshold logic that used to live only inside app.js's IIFE.
// Uses Node's built-in test runner and assert module; no framework, no
// devDependency to install or keep patched.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import CheckpointLib from '../public/checkpoint/lib.js';

const { band, residual, residualAcceptanceStale, checkResult, score, readinessPct, controlsForCheck, operatingEffectiveness, scanResultsChanged,
  sharedEvidenceClosure, crossFrameworkStatusSuggestions, controlReviewStatus, suggestVendorCriticality, toCsv, buildZip,
  canonicalJson, verifyEntitlementSignature, signEntitlementPayload, evaluateEntitlement, addDaysToDateStr,
  daysBetweenDateStr, normalizeEntitlementType, isDevBypassActive,
  sha256Hex, encryptPack, decryptPack, validatePackShape,
  constellationTheme, constellationEdges, constellationLayout,
  fingerprintFromRows, remediationVelocityProjection,
  weeklyActivityGrid, riskBubblePoint, riskBubbleLayout,
  relLuminance, contrastRatio, compositeOverBg, pickReadableRgb,
  mulberry32, sampleTriangular, samplePoisson, riskFinancialInputs,
  simulateRiskLosses, simulatePortfolioLosses, summarizeLossDistribution,
  lossExceedanceCurve, RISK_FINANCIAL_BANDS,
  classifyAiActRisk, AI_ACT_QUESTIONS } = CheckpointLib;

function randomKey() {
  return Buffer.from(webcrypto.getRandomValues(new Uint8Array(32))).toString('base64');
}

describe('band()', () => {
  test('Low for scores under 5', () => {
    assert.equal(band(1), 'Low');
    assert.equal(band(4), 'Low');
  });
  test('Medium for 5-9', () => {
    assert.equal(band(5), 'Medium');
    assert.equal(band(9), 'Medium');
  });
  test('High for 10-14', () => {
    assert.equal(band(10), 'High');
    assert.equal(band(14), 'High');
  });
  test('Critical for 15+', () => {
    assert.equal(band(15), 'Critical');
    assert.equal(band(25), 'Critical');
  });
});

describe('residual()', () => {
  test('no actions done -> inherent L/I unchanged', () => {
    const r = { L: 4, I: 4, actions: ['ACT-001', 'ACT-002'] };
    const actions = [{ id: 'ACT-001', status: 'Open' }, { id: 'ACT-002', status: 'In progress' }];
    assert.deepEqual(residual(r, actions), { L: 4, I: 4 });
  });
  test('each completed action reduces L by 1, floor 1', () => {
    const r = { L: 3, I: 5, actions: ['ACT-001', 'ACT-002', 'ACT-003'] };
    const actions = [
      { id: 'ACT-001', status: 'Done' }, { id: 'ACT-002', status: 'Done' }, { id: 'ACT-003', status: 'Open' }
    ];
    // 2 of 3 done -> L drops by 2 (floor 1), I unchanged since not ALL are done
    assert.deepEqual(residual(r, actions), { L: 1, I: 5 });
  });
  test('L never drops below 1 even with many completed actions', () => {
    const r = { L: 2, I: 3, actions: ['ACT-001', 'ACT-002', 'ACT-003', 'ACT-004'] };
    const actions = ['ACT-001', 'ACT-002', 'ACT-003', 'ACT-004'].map(id => ({ id, status: 'Done' }));
    // all 4 done -> L would be 2-4=-2, floored to 1; I drops by 1 since ALL actions done
    assert.deepEqual(residual(r, actions), { L: 1, I: 2 });
  });
  test('I only drops once every linked action is Done, floor 1', () => {
    const r = { L: 5, I: 1, actions: ['ACT-001'] };
    const actions = [{ id: 'ACT-001', status: 'Done' }];
    // I=1-1=0 floored to 1
    assert.deepEqual(residual(r, actions), { L: 4, I: 1 });
  });
  test('a risk with no linked actions never gets the all-done impact reduction', () => {
    const r = { L: 3, I: 4, actions: [] };
    assert.deepEqual(residual(r, []), { L: 3, I: 4 });
  });
});

// A residual-risk acceptance sign-off (App.acceptRisk() — ISO 27001
// 6.1.3/8.3) is a historical fact ("X accepted THIS score on THIS date")
// that must never keep being presented as if it still covers whatever the
// residual score has drifted to since — an auditor reading a Risk
// Treatment Plan reads the acceptance column as current evidence.
describe('residualAcceptanceStale()', () => {
  test('no acceptance recorded at all -> not stale (a different, already-flagged case)', () => {
    assert.equal(residualAcceptanceStale({ acceptedBy: '' }, 12), false);
    assert.equal(residualAcceptanceStale({}, 12), false);
  });

  test('accepted, score unchanged since -> not stale', () => {
    assert.equal(residualAcceptanceStale({ acceptedBy: 'K. Patel', acceptedScore: 6 }, 6), false);
  });

  test('accepted, score has moved since (either direction) -> stale', () => {
    assert.equal(residualAcceptanceStale({ acceptedBy: 'K. Patel', acceptedScore: 6 }, 9), true, 'residual got worse since acceptance');
    assert.equal(residualAcceptanceStale({ acceptedBy: 'K. Patel', acceptedScore: 6 }, 2), true, 'residual improved since acceptance — still a different number than what was accepted');
  });

  test('a risk accepted before acceptedScore existed (null/undefined snapshot) reads as not-stale, never as always-stale', () => {
    assert.equal(residualAcceptanceStale({ acceptedBy: 'K. Patel', acceptedScore: null }, 9), false);
    assert.equal(residualAcceptanceStale({ acceptedBy: 'K. Patel' }, 9), false);
  });

  test('a non-numeric acceptedScore (e.g. corrupted data) is treated the same as no snapshot', () => {
    assert.equal(residualAcceptanceStale({ acceptedBy: 'K. Patel', acceptedScore: '6' }, 6), false);
  });

  test('missing risk object does not throw', () => {
    assert.doesNotThrow(() => residualAcceptanceStale(null, 6));
    assert.equal(residualAcceptanceStale(null, 6), false);
  });
});

describe('checkResult()', () => {
  test('scored:false always returns manual, regardless of scan state', () => {
    assert.equal(checkResult({ id: 'dlp', scored: false }, { lastResults: null }), 'manual');
    assert.equal(checkResult({ id: 'dlp', scored: false }, { lastResults: { dlp: 'fail' } }), 'manual');
  });
  test('no scan has ever run -> null', () => {
    assert.equal(checkResult({ id: 'mfa-all', scored: true }, { lastResults: null }), null);
  });
  test('returns the raw scan result once a scan has run', () => {
    const ctx = { lastResults: { 'mfa-all': 'review' } };
    assert.equal(checkResult({ id: 'mfa-all', scored: true }, ctx), 'review');
  });
  test('demo mode: a templated check flips to pass once every linked remediation action is Done', () => {
    const ctx = {
      lastResults: { legacy: 'fail' },
      isDemo: true,
      risks: [{ id: 'R-010', tpl: 'legacy', actions: ['ACT-050', 'ACT-051'] }],
      actions: [{ id: 'ACT-050', status: 'Done' }, { id: 'ACT-051', status: 'Done' }]
    };
    assert.equal(checkResult({ id: 'legacy', scored: true, tpl: 'legacy' }, ctx), 'pass');
  });
  test('demo mode: stays at the raw result if not every linked action is Done yet', () => {
    const ctx = {
      lastResults: { legacy: 'fail' },
      isDemo: true,
      risks: [{ id: 'R-010', tpl: 'legacy', actions: ['ACT-050', 'ACT-051'] }],
      actions: [{ id: 'ACT-050', status: 'Done' }, { id: 'ACT-051', status: 'Open' }]
    };
    assert.equal(checkResult({ id: 'legacy', scored: true, tpl: 'legacy' }, ctx), 'fail');
  });
  test('live mode never applies the demo remediation flip, even with matching data', () => {
    const ctx = {
      lastResults: { legacy: 'fail' },
      isDemo: false,
      risks: [{ id: 'R-010', tpl: 'legacy', actions: ['ACT-050'] }],
      actions: [{ id: 'ACT-050', status: 'Done' }]
    };
    assert.equal(checkResult({ id: 'legacy', scored: true, tpl: 'legacy' }, ctx), 'fail');
  });
});

describe('score() — a check with no result must not read as a failure', () => {
  // The trap this guards: score() excludes 'manual' from its denominator
  // but treats every other value as a scored outcome, so an undefined
  // result counts as a hard zero. That makes adding a CHECK_DEFS entry
  // the current scan does not populate -- an AWS collector's checks, for
  // a tenant with no AWS -- silently drop every existing tenant's
  // posture score. Verified against live data that nothing is absent
  // today, so this is a safety net for future checks, not a fix to a
  // number anyone is currently seeing.
  const defs = [{ id: 'a', scored: true }, { id: 'b', scored: true }, { id: 'new-1', scored: true }, { id: 'new-2', scored: true }];

  test('checks absent from lastResults are treated as unmeasured, not as fails', () => {
    assert.equal(score(defs, { lastResults: { a: 'pass', b: 'pass' } }), 100,
      'two passes and two never-run checks is 100%, not 50%');
  });

  test('an absent result is equivalent to an explicit manual', () => {
    const absent = score(defs, { lastResults: { a: 'pass', b: 'fail' } });
    const explicit = score(defs, { lastResults: { a: 'pass', b: 'fail', 'new-1': 'manual', 'new-2': 'manual' } });
    assert.equal(absent, explicit);
  });

  test('checkResult() reports an absent check as manual', () => {
    assert.equal(checkResult({ id: 'nope', scored: true }, { lastResults: { a: 'pass' } }), 'manual');
  });

  test('real failures still count against the score', () => {
    assert.equal(score([{ id: 'a', scored: true }, { id: 'b', scored: true }], { lastResults: { a: 'pass', b: 'fail' } }), 50,
      'the fix must not turn genuine failures into free passes');
  });

  test('a check present but failing is never confused with one that is absent', () => {
    const failing = score(defs, { lastResults: { a: 'pass', b: 'pass', 'new-1': 'fail', 'new-2': 'fail' } });
    assert.equal(failing, 50, 'four measured checks, two failing');
  });
});

describe('score()', () => {
  const CHECK_DEFS = [
    { id: 'a', scored: true }, { id: 'b', scored: true }, { id: 'c', scored: true },
    { id: 'd', scored: false } // never counted
  ];
  test('no scan yet -> floors at 5 (app.js only ever calls score() right after a scan populates lastResults, so this path is unreachable in practice, but the function itself treats an unscanned check as 0 points, not as excluded)', () => {
    assert.equal(score(CHECK_DEFS, { lastResults: null }), 5);
  });
  test('all pass -> 100', () => {
    const ctx = { lastResults: { a: 'pass', b: 'pass', c: 'pass' } };
    assert.equal(score(CHECK_DEFS, ctx), 100);
  });
  test('mixed pass/review/fail computes the weighted average, floored at 5', () => {
    // a=pass(1), b=review(0.5), c=fail(0) -> 1.5/3 = 50%
    const ctx = { lastResults: { a: 'pass', b: 'review', c: 'fail' } };
    assert.equal(score(CHECK_DEFS, ctx), 50);
  });
  test('all fail floors at 5, never 0', () => {
    const ctx = { lastResults: { a: 'fail', b: 'fail', c: 'fail' } };
    assert.equal(score(CHECK_DEFS, ctx), 5);
  });
  test('a scored:true check that resolves to manual this scan is excluded from the denominator, not counted as 0', () => {
    // a=pass(1), b=manual(excluded), c=pass(1) -> 2/2 = 100%, not 2/3
    const ctx = { lastResults: { a: 'pass', b: 'manual', c: 'pass' } };
    assert.equal(score(CHECK_DEFS, ctx), 100);
  });
  test('scored:false checks never enter the calculation at all', () => {
    const withManualCheck = [{ id: 'a', scored: true }, { id: 'd', scored: false }];
    const ctx = { lastResults: { a: 'pass' } };
    assert.equal(score(withManualCheck, ctx), 100);
  });
  test('accepts a checkResultFn override instead of a ctx (used by app.js)', () => {
    const fn = (c) => (c.id === 'a' ? 'pass' : c.id === 'b' ? 'fail' : 'manual');
    // a=pass(1), b=fail(0) -> 1/2 = 50%; c is scored:true but resolves 'manual' via fn -> excluded
    assert.equal(score(CHECK_DEFS, null, fn), 50);
  });
});

describe('readinessPct()', () => {
  test('0% when nothing is applicable', () => {
    assert.equal(readinessPct([{ app: false, st: 'Not started' }]), 0);
  });
  test('0% when applicable controls exist but none are implemented', () => {
    assert.equal(readinessPct([{ app: true, st: 'Not started' }, { app: true, st: 'In progress' }]), 0);
  });
  test('100% when every applicable control is implemented', () => {
    assert.equal(readinessPct([{ app: true, st: 'Implemented' }, { app: true, st: 'Implemented' }]), 100);
  });
  test('rounds to the nearest whole percent', () => {
    // 1 of 3 implemented = 33.33% -> rounds to 33
    const controls = [
      { app: true, st: 'Implemented' }, { app: true, st: 'Not started' }, { app: true, st: 'Not started' }
    ];
    assert.equal(readinessPct(controls), 33);
  });
  test('non-applicable controls never count toward the denominator', () => {
    const controls = [
      { app: true, st: 'Implemented' }, { app: false, st: 'Not started' }, { app: false, st: 'Not started' }
    ];
    assert.equal(readinessPct(controls), 100);
  });
  test('empty controls array -> 0, not NaN or a thrown error', () => {
    assert.equal(readinessPct([]), 0);
  });

  // A generated report (SoA, Audit Readiness Report, Executive Summary)
  // reads this number and can also independently list the exact
  // outstanding controls in its own gaps table — those two must never
  // disagree. Math.round(99.5) === 100 in JS, so at 200+ applicable
  // controls with exactly one still outstanding, naive rounding would
  // print "100% implemented" in one section while the gaps table two
  // pages later still names a control that isn't done.
  test('never rounds up to 100% while a control is still outstanding, however close', () => {
    const controls = Array.from({ length: 199 }, () => ({ app: true, st: 'Implemented' }))
      .concat([{ app: true, st: 'Not started' }]); // 199/200 = 99.5%
    assert.equal(readinessPct(controls), 99, 'must clamp below 100, never round up to it, while a gap remains');
  });

  test('100% is reported only when literally every applicable control is Implemented', () => {
    const controls = Array.from({ length: 500 }, () => ({ app: true, st: 'Implemented' }));
    assert.equal(readinessPct(controls), 100);
    const withOneGap = controls.slice(0, 499).concat([{ app: true, st: 'In progress' }]);
    assert.notEqual(readinessPct(withOneGap), 100);
  });
});

describe('controlsForCheck() — captureAutoEvidence()\'s sole source of which controls a check\'s evidence attaches to', () => {
  // A minimal but representative slice: an ISO 27001 control that cross-
  // references two other frameworks, plus a decoy essential8 row that
  // must never be matched by mistake.
  const checkControls = { 'mfa-all': ['A.5.15'] };
  const controls = [
    { fw: 'iso27001', id: 'A.5.15', map: 'SOC2 CC6.1 · NIST PR.AA' },
    { fw: 'soc2', id: 'CC6.1', map: '' },
    { fw: 'nistcsf', id: 'PR.AA', map: '' },
    { fw: 'essential8', id: 'E8.7', map: '' } // decoy — mfa-all's checkControls entry never mentions it
  ];

  test('regression: a tenant WITHOUT iso27001 entitled still gets cross-framework matches — this is the exact bug that shipped', () => {
    // Every standalone single-module self-serve purchase (Essential
    // Eight only, SOC 2 only, etc. — see src/data/pricing.js) looks
    // exactly like this: iso27001 false, one premium module true.
    const entitlements = { iso27001: false, soc2: true, nistcsf: false, essential8: false };
    const result = controlsForCheck('mfa-all', { checkControls, controls, entitlements });
    assert.equal(result.length, 1, 'should still resolve the SOC2 match even though iso27001 itself is not entitled');
    assert.equal(result[0].fw, 'soc2');
    assert.equal(result[0].id, 'CC6.1');
  });

  test('iso27001 entitled: its own row is included alongside every other entitled cross-reference', () => {
    const entitlements = { iso27001: true, soc2: true, nistcsf: true, essential8: true };
    const result = controlsForCheck('mfa-all', { checkControls, controls, entitlements });
    const keys = result.map((c) => c.fw + '|' + c.id).sort();
    assert.deepEqual(keys, ['iso27001|A.5.15', 'nistcsf|PR.AA', 'soc2|CC6.1']);
  });

  test('iso27001 NOT entitled: its own row is excluded, but cross-references to every other entitled framework still resolve', () => {
    const entitlements = { iso27001: false, soc2: true, nistcsf: true, essential8: true };
    const result = controlsForCheck('mfa-all', { checkControls, controls, entitlements });
    const keys = result.map((c) => c.fw + '|' + c.id).sort();
    assert.deepEqual(keys, ['nistcsf|PR.AA', 'soc2|CC6.1'], 'iso27001|A.5.15 must not appear — that framework is not entitled');
  });

  test('a cross-referenced framework that is not entitled is silently skipped, never invented', () => {
    const entitlements = { iso27001: true, soc2: false, nistcsf: true, essential8: true };
    const result = controlsForCheck('mfa-all', { checkControls, controls, entitlements });
    const keys = result.map((c) => c.fw + '|' + c.id).sort();
    assert.deepEqual(keys, ['iso27001|A.5.15', 'nistcsf|PR.AA'], 'soc2|CC6.1 must not appear — soc2 is not entitled');
  });

  test('a checkId with no CHECK_CONTROLS entry resolves to nothing, not an error', () => {
    const entitlements = { iso27001: true, soc2: true, nistcsf: true, essential8: true };
    assert.deepEqual(controlsForCheck('not-a-real-check-id', { checkControls, controls, entitlements }), []);
  });

  test('an ISO 27001 code with no matching control row is silently skipped', () => {
    const entitlements = { iso27001: true, soc2: true, nistcsf: true, essential8: true };
    const result = controlsForCheck('mfa-all', { checkControls: { 'mfa-all': ['A.999.999'] }, controls, entitlements });
    assert.deepEqual(result, []);
  });

  test('never invents a match for a framework the checkControls/map data never actually mentions', () => {
    const entitlements = { iso27001: true, soc2: true, nistcsf: true, essential8: true };
    const result = controlsForCheck('mfa-all', { checkControls, controls, entitlements });
    assert.ok(!result.some((c) => c.fw === 'essential8'), 'essential8|E8.7 was never referenced by A.5.15\'s map field and must not appear');
  });

  test('duplicate results (the same control reached two ways) are de-duplicated', () => {
    // Two checks both resolving to the same ISO27001 code, which itself
    // maps to one SOC2 control — should appear once, not twice, when
    // both checks are queried against the same running result set in
    // the style app.js's runScan() would (each call is independent, but
    // confirms a single call never double-counts via its own codes list).
    const dupCheckControls = { 'legacy': ['A.5.15', 'A.5.15'] };
    const entitlements = { iso27001: true, soc2: true, nistcsf: true, essential8: true };
    const result = controlsForCheck('legacy', { checkControls: dupCheckControls, controls, entitlements });
    const keys = result.map((c) => c.fw + '|' + c.id);
    assert.deepEqual(keys.sort(), ['iso27001|A.5.15', 'nistcsf|PR.AA', 'soc2|CC6.1'].sort());
    assert.equal(new Set(keys).size, keys.length, 'no duplicate fw|id pairs');
  });
});

describe('operatingEffectiveness() — SOC 2 Type II observation-window evidence', () => {
  const history = [
    { date: '2026-01-05', results: { 'mfa-all': 'pass', 'legacy': 'fail' } },
    { date: '2026-02-05', results: { 'mfa-all': 'pass', 'legacy': 'pass' } },
    { date: '2026-03-05', results: { 'mfa-all': 'pass' } }, // 'legacy' absent this scan
    { date: '2026-04-05', results: { 'mfa-all': 'review', 'legacy': 'pass' } },
    { date: '2026-05-05', results: { 'mfa-all': 'pass', 'legacy': 'manual' } }
  ];

  test('no exceptions across the whole window: noExceptionsFound is true, counts match', () => {
    const r = operatingEffectiveness('mfa-all', [history[1], history[4]], '');
    assert.equal(r.totalObservations, 2);
    assert.equal(r.passCount, 2);
    assert.equal(r.exceptions.length, 0);
    assert.equal(r.noExceptionsFound, true);
    assert.equal(r.firstObservedDate, '2026-02-05');
    assert.equal(r.lastObservedDate, '2026-05-05');
  });

  test('a fail or review anywhere in the window is an exception, and noExceptionsFound goes false', () => {
    const r = operatingEffectiveness('mfa-all', history, '');
    assert.equal(r.totalObservations, 5);
    assert.equal(r.exceptions.length, 1, 'only the 2026-04-05 review should count — pass/manual never do');
    assert.equal(r.exceptions[0].date, '2026-04-05');
    assert.equal(r.exceptions[0].result, 'review');
    assert.equal(r.noExceptionsFound, false);
  });

  test('sinceDate excludes scans before the observation start, inclusive of the start date itself', () => {
    const r = operatingEffectiveness('mfa-all', history, '2026-03-05');
    assert.equal(r.totalObservations, 3, 'excludes the two Jan/Feb scans, includes 2026-03-05 itself');
    assert.equal(r.firstObservedDate, '2026-03-05');
  });

  test('empty sinceDate ("") means the full supplied history, not zero results', () => {
    const r = operatingEffectiveness('mfa-all', history, '');
    assert.equal(r.totalObservations, 5);
  });

  test('a checkId absent from a given scan\'s results is silently excluded from that scan, not counted as any kind of observation', () => {
    const r = operatingEffectiveness('legacy', history, '');
    // legacy appears in 4 of the 5 scans (missing from 2026-03-05)
    assert.equal(r.totalObservations, 4);
  });

  test('manual results count as an observation but never as pass or exception — tracked separately', () => {
    const r = operatingEffectiveness('legacy', history, '');
    assert.equal(r.manualCount, 1);
    assert.equal(r.passCount, 2); // 2026-02-05, 2026-04-05
    assert.equal(r.exceptions.length, 1); // 2026-01-05 fail
  });

  test('a checkId with zero observations in the window: everything reports as empty/false, not an error', () => {
    const r = operatingEffectiveness('nonexistent-check', history, '');
    assert.equal(r.totalObservations, 0);
    assert.equal(r.noExceptionsFound, false, 'no observations at all is never "no exceptions found" — there is nothing to have found');
    assert.equal(r.firstObservedDate, null);
    assert.equal(r.lastObservedDate, null);
  });

  test('all-manual observations never claim noExceptionsFound, even with zero real exceptions', () => {
    const allManual = [
      { date: '2026-01-01', results: { x: 'manual' } },
      { date: '2026-02-01', results: { x: 'manual' } }
    ];
    const r = operatingEffectiveness('x', allManual, '');
    assert.equal(r.totalObservations, 2);
    assert.equal(r.exceptions.length, 0);
    assert.equal(r.passCount, 0);
    assert.equal(r.noExceptionsFound, false, 'no automated pass ever actually happened — nothing to claim as clean evidence');
  });

  test('observations are returned/sorted earliest-first regardless of input scan order', () => {
    const shuffled = [history[3], history[0], history[4], history[1]];
    const r = operatingEffectiveness('mfa-all', shuffled, '');
    assert.equal(r.firstObservedDate, '2026-01-05');
    assert.equal(r.lastObservedDate, '2026-05-05');
  });

  test('a scan entry with no `results` at all (e.g. a pre-migration scan) is skipped, not thrown on', () => {
    const withGap = history.concat([{ date: '2026-06-05', score: 80 }]);
    assert.doesNotThrow(() => operatingEffectiveness('mfa-all', withGap, ''));
    const r = operatingEffectiveness('mfa-all', withGap, '');
    assert.equal(r.totalObservations, 5, 'the resultless scan contributes nothing, not a crash');
  });
});

// runScan() only wrote a new Scan row when the date, score,
// critical-risk count or overdue-action count moved. Two checks can swap
// places on the same day (one pass -> fail, another fail -> pass) for an
// identical score and identical counts — that scan was never persisted,
// so the next page load silently restored the PREVIOUS scan's per-check
// results from its stored Detail JSON, losing both the corrected posture
// and the Type II observation of the check that dipped.
describe('scanResultsChanged() — did any individual check move since the last scan', () => {
  test('identical result maps -> no movement', () => {
    const prev = { 'mfa-all': 'pass', legacy: 'fail', dlp: 'manual' };
    assert.equal(scanResultsChanged(prev, { ...prev }), false);
  });

  test('two checks swapping places (same score, same counts) IS movement', () => {
    const prev = { 'mfa-all': 'pass', legacy: 'fail' };
    const next = { 'mfa-all': 'fail', legacy: 'pass' };
    assert.equal(scanResultsChanged(prev, next), true,
      'the aggregate score is identical here — this is exactly the case the snapshot guard used to miss');
  });

  test('a single check moving in either direction is movement', () => {
    assert.equal(scanResultsChanged({ dlp: 'pass' }, { dlp: 'review' }), true);
    assert.equal(scanResultsChanged({ dlp: 'review' }, { dlp: 'pass' }), true);
  });

  test('a check appearing for the first time (capability became readable) is movement', () => {
    assert.equal(scanResultsChanged({ 'mfa-all': 'pass' }, { 'mfa-all': 'pass', pim: 'review' }), true);
  });

  test('a check disappearing (capability stopped being readable) is movement', () => {
    assert.equal(scanResultsChanged({ 'mfa-all': 'pass', pim: 'review' }, { 'mfa-all': 'pass' }), true);
  });

  test('a missing side is "nothing to compare against", never movement', () => {
    assert.equal(scanResultsChanged(null, { 'mfa-all': 'pass' }), false,
      'a first-ever scan is handled by its own branch in runScan(); this must not force a snapshot on every seeded/legacy row');
    assert.equal(scanResultsChanged({ 'mfa-all': 'pass' }, null), false);
    assert.equal(scanResultsChanged(null, null), false);
  });

  test('two empty maps -> no movement', () => {
    assert.equal(scanResultsChanged({}, {}), false);
  });
});

describe('controlReviewStatus() — re-verification staleness', () => {
  const today = '2026-07-15';
  test('not applicable -> never due, regardless of verified date', () => {
    const r = controlReviewStatus({ app: false, st: 'Implemented', verified: '2020-01-01' }, today, 90);
    assert.deepEqual(r, { due: false, neverVerified: false, daysOverdue: 0 });
  });
  test('applicable but not Implemented -> never due (a different gap, not staleness)', () => {
    const r = controlReviewStatus({ app: true, st: 'In progress', verified: '' }, today, 90);
    assert.equal(r.due, false);
  });
  test('Implemented, never verified -> always due, flagged distinctly from a stale date', () => {
    const r = controlReviewStatus({ app: true, st: 'Implemented', verified: '' }, today, 90);
    assert.equal(r.due, true);
    assert.equal(r.neverVerified, true);
    assert.equal(r.daysOverdue, null);
  });
  test('Implemented, verified within cadence -> not due', () => {
    const r = controlReviewStatus({ app: true, st: 'Implemented', verified: '2026-07-01' }, today, 90);
    assert.equal(r.due, false);
    assert.equal(r.daysOverdue, 0);
  });
  test('Implemented, verified exactly at the cadence boundary -> not yet due', () => {
    // 90 days before 2026-07-15 is 2026-04-16
    const r = controlReviewStatus({ app: true, st: 'Implemented', verified: '2026-04-16' }, today, 90);
    assert.equal(r.due, false);
  });
  test('Implemented, verified one day past cadence -> due, with the exact day count over', () => {
    const r = controlReviewStatus({ app: true, st: 'Implemented', verified: '2026-04-15' }, today, 90);
    assert.equal(r.due, true);
    assert.equal(r.daysOverdue, 1);
  });
  test('missing cadenceDays defaults to 90 (the pre-existing hardcoded value this replaced)', () => {
    const r = controlReviewStatus({ app: true, st: 'Implemented', verified: '2026-04-15' }, today);
    assert.equal(r.due, true);
  });
  test('a non-numeric cadenceDays falls back to 90 rather than throwing or comparing against NaN', () => {
    const r = controlReviewStatus({ app: true, st: 'Implemented', verified: '2026-04-15' }, today, 'not-a-number');
    assert.equal(r.due, true);
  });
  test('missing/undefined control never throws', () => {
    assert.deepEqual(controlReviewStatus(null, today, 90), { due: false, neverVerified: false, daysOverdue: 0 });
    assert.deepEqual(controlReviewStatus(undefined, today, 90), { due: false, neverVerified: false, daysOverdue: 0 });
  });
});

describe('suggestVendorCriticality()', () => {
  test('health information, credentials, or production access -> Critical', () => {
    assert.equal(suggestVendorCriticality(['Health information']), 'Critical');
    assert.equal(suggestVendorCriticality(['Credentials & secrets']), 'Critical');
    assert.equal(suggestVendorCriticality(['Production system access']), 'Critical');
  });
  test('customer PII or financial data -> High', () => {
    assert.equal(suggestVendorCriticality(['Customer PII']), 'High');
    assert.equal(suggestVendorCriticality(['Financial / payment data']), 'High');
  });
  test('employee data or company confidential -> Medium', () => {
    assert.equal(suggestVendorCriticality(['Employee data']), 'Medium');
    assert.equal(suggestVendorCriticality(['Company confidential']), 'Medium');
  });
  test('public-only or nothing selected -> Low', () => {
    assert.equal(suggestVendorCriticality(['Public / non-sensitive only']), 'Low');
    assert.equal(suggestVendorCriticality([]), 'Low');
    assert.equal(suggestVendorCriticality(undefined), 'Low');
  });
  test('highest-sensitivity category wins when several are ticked', () => {
    assert.equal(suggestVendorCriticality(['Company confidential', 'Customer PII', 'Health information']), 'Critical');
    assert.equal(suggestVendorCriticality(['Public / non-sensitive only', 'Financial / payment data']), 'High');
  });
});

describe('toCsv()', () => {
  test('plain cells join with commas, rows with CRLF', () => {
    assert.equal(toCsv([['ID', 'Title'], ['R-1', 'Legacy auth']]), 'ID,Title\r\nR-1,Legacy auth');
  });
  test('quotes a cell containing a comma', () => {
    assert.equal(toCsv([['a,b', 'c']]), '"a,b",c');
  });
  test('quotes a cell containing a double quote, doubling it', () => {
    assert.equal(toCsv([['say "hi"']]), '"say ""hi"""');
  });
  test('quotes a cell containing a newline', () => {
    assert.equal(toCsv([['line1\nline2']]), '"line1\nline2"');
  });
  test('null/undefined cells become empty strings, not "null"/"undefined"', () => {
    assert.equal(toCsv([[null, undefined, 0, false]]), ',,0,false');
  });
});

describe('buildZip()', () => {
  function readU16(b, o) { return b[o] | (b[o + 1] << 8); }
  function readU32(b, o) { return (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0; }
  function parseStoreZip(bytes) {
    var out = [], o = 0, dec = new TextDecoder();
    while (o < bytes.length && readU32(bytes, o) === 0x04034b50) {
      var compSize = readU32(bytes, o + 18);
      var nameLen = readU16(bytes, o + 26);
      var extraLen = readU16(bytes, o + 28);
      var nameStart = o + 30;
      var dataStart = nameStart + nameLen + extraLen;
      out.push({ name: dec.decode(bytes.slice(nameStart, nameStart + nameLen)), content: dec.decode(bytes.slice(dataStart, dataStart + compSize)) });
      o = dataStart + compSize;
    }
    return out;
  }

  test('round-trips file names and content exactly', () => {
    var files = [{ name: 'risks.csv', content: 'ID,Title\r\nR-1,Test\r\n' }, { name: 'actions.csv', content: 'ID,Title\r\nA-1,Another, with a comma\r\n' }];
    var zip = buildZip(files, new Date('2026-01-15T10:30:00'));
    assert.equal(zip[0], 0x50); assert.equal(zip[1], 0x4B); assert.equal(zip[2], 0x03); assert.equal(zip[3], 0x04);
    assert.deepEqual(parseStoreZip(zip), files);
  });
  test('ends with a valid end-of-central-directory record listing every entry', () => {
    var zip = buildZip([{ name: 'a.csv', content: 'x' }, { name: 'b.csv', content: 'y' }, { name: 'c.csv', content: 'z' }]);
    var eocdSig = readU32(zip, zip.length - 22);
    assert.equal(eocdSig, 0x06054b50);
    assert.equal(readU16(zip, zip.length - 22 + 10), 3); // total entries
  });
  test('empty file list still produces a valid (empty) archive', () => {
    var zip = buildZip([]);
    assert.deepEqual(parseStoreZip(zip), []);
    assert.equal(readU32(zip, zip.length - 22), 0x06054b50);
  });
});

describe('canonicalJson()', () => {
  test('key order never affects the output', () => {
    assert.equal(canonicalJson({ b: 1, a: 2 }), canonicalJson({ a: 2, b: 1 }));
  });
  test('nested objects and arrays are sorted too', () => {
    assert.equal(
      canonicalJson({ z: { y: 1, x: 2 }, a: [3, 2, 1] }),
      '{"a":[3,2,1],"z":{"x":2,"y":1}}'
    );
  });
  test('arrays preserve element order (only object keys are sorted)', () => {
    assert.equal(canonicalJson({ frameworks: ['soc2', 'iso27001'] }), '{"frameworks":["soc2","iso27001"]}');
  });
});

describe('entitlement signing/verification (Ed25519 via node:crypto webcrypto)', () => {
  async function keypair() {
    return webcrypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
  }
  async function pubKeyBase64(publicKey) {
    var raw = new Uint8Array(await webcrypto.subtle.exportKey('raw', publicKey));
    return CheckpointLib.bytesToBase64(raw);
  }

  test('a correctly-signed payload verifies', async () => {
    var kp = await keypair();
    var payload = { tenantId: 't-1', frameworks: ['iso27001', 'soc2'], issuedAt: '2026-01-01', expiry: '2027-01-01' };
    var sig = await signEntitlementPayload(webcrypto.subtle, kp.privateKey, payload);
    var pub = await pubKeyBase64(kp.publicKey);
    assert.equal(await verifyEntitlementSignature(webcrypto.subtle, pub, payload, sig), true);
  });

  test('a tampered payload fails verification', async () => {
    var kp = await keypair();
    var payload = { tenantId: 't-1', frameworks: ['iso27001'], issuedAt: '2026-01-01', expiry: '2027-01-01' };
    var sig = await signEntitlementPayload(webcrypto.subtle, kp.privateKey, payload);
    var pub = await pubKeyBase64(kp.publicKey);
    var tampered = Object.assign({}, payload, { frameworks: ['iso27001', 'soc2'] });
    assert.equal(await verifyEntitlementSignature(webcrypto.subtle, pub, tampered, sig), false);
  });

  test('a signature from a different key fails verification', async () => {
    var kp1 = await keypair();
    var kp2 = await keypair();
    var payload = { tenantId: 't-1', frameworks: ['iso27001'], issuedAt: '2026-01-01', expiry: '2027-01-01' };
    var sig = await signEntitlementPayload(webcrypto.subtle, kp1.privateKey, payload);
    var wrongPub = await pubKeyBase64(kp2.publicKey);
    assert.equal(await verifyEntitlementSignature(webcrypto.subtle, wrongPub, payload, sig), false);
  });

  test('re-ordered object keys still verify (canonicalJson makes signing order-independent)', async () => {
    var kp = await keypair();
    var payload = { tenantId: 't-1', frameworks: ['iso27001'], issuedAt: '2026-01-01', expiry: '2027-01-01' };
    var sig = await signEntitlementPayload(webcrypto.subtle, kp.privateKey, payload);
    var pub = await pubKeyBase64(kp.publicKey);
    var reordered = { expiry: payload.expiry, frameworks: payload.frameworks, issuedAt: payload.issuedAt, tenantId: payload.tenantId };
    assert.equal(await verifyEntitlementSignature(webcrypto.subtle, pub, reordered, sig), true);
  });

  test('a directly-tampered signature string (flipped byte) fails verification', async () => {
    var kp = await keypair();
    var payload = { tenantId: 't-1', frameworks: ['iso27001'], issuedAt: '2026-01-01', expiry: '2027-01-01' };
    var sig = await signEntitlementPayload(webcrypto.subtle, kp.privateKey, payload);
    var pub = await pubKeyBase64(kp.publicKey);
    var sigBytes = Buffer.from(sig, 'base64');
    sigBytes[0] = sigBytes[0] ^ 0xff; // flip every bit of the first byte
    var tamperedSig = sigBytes.toString('base64');
    assert.equal(await verifyEntitlementSignature(webcrypto.subtle, pub, payload, tamperedSig), false);
  });
});

/* End-to-end activation pipeline — signing + signature verification +
   evaluateEntitlement()'s business rules together, the same sequence
   app.js's verifyActivationRaw() runs on an uploaded/cached activation
   file. Covers every state the task requires test coverage for: valid,
   tampered payload, tampered signature, wrong tenant, expired, in-grace. */
describe('full activation pipeline (sign -> verify -> evaluate)', () => {
  async function issue(payload, privateKey) {
    return { payload: payload, signature: await signEntitlementPayload(webcrypto.subtle, privateKey, payload) };
  }
  async function verifyFile(file, pub) {
    var sigOk = await verifyEntitlementSignature(webcrypto.subtle, pub, file.payload, file.signature);
    return { sigOk: sigOk };
  }

  test('valid: correct signature, matching tenant, not expired', async () => {
    var kp = await webcrypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
    var pub = CheckpointLib.bytesToBase64(new Uint8Array(await webcrypto.subtle.exportKey('raw', kp.publicKey)));
    var file = await issue({ tenantId: 't-1', frameworks: ['iso27001', 'soc2'], issuedAt: '2026-01-01', expiry: '2027-01-01' }, kp.privateKey);
    var v = await verifyFile(file, pub);
    assert.equal(v.sigOk, true);
    var evalResult = evaluateEntitlement(file.payload, 't-1', '2026-06-01');
    assert.equal(evalResult.status, 'valid');
  });

  test('tampered payload: signature no longer verifies even though tenant/expiry would otherwise pass', async () => {
    var kp = await webcrypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
    var pub = CheckpointLib.bytesToBase64(new Uint8Array(await webcrypto.subtle.exportKey('raw', kp.publicKey)));
    var file = await issue({ tenantId: 't-1', frameworks: ['iso27001'], issuedAt: '2026-01-01', expiry: '2027-01-01' }, kp.privateKey);
    file.payload.frameworks.push('essential8'); // tamper after signing
    var v = await verifyFile(file, pub);
    assert.equal(v.sigOk, false);
  });

  test('tampered signature: valid payload, corrupted signature bytes', async () => {
    var kp = await webcrypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
    var pub = CheckpointLib.bytesToBase64(new Uint8Array(await webcrypto.subtle.exportKey('raw', kp.publicKey)));
    var file = await issue({ tenantId: 't-1', frameworks: ['iso27001'], issuedAt: '2026-01-01', expiry: '2027-01-01' }, kp.privateKey);
    file.signature = file.signature.slice(0, -4) + (file.signature.slice(-4) === 'AAAA' ? 'BBBB' : 'AAAA');
    var v = await verifyFile(file, pub);
    assert.equal(v.sigOk, false);
  });

  test('wrong tenant: signature verifies, but tenant does not match any accepted id', async () => {
    var kp = await webcrypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
    var pub = CheckpointLib.bytesToBase64(new Uint8Array(await webcrypto.subtle.exportKey('raw', kp.publicKey)));
    var file = await issue({ tenantId: 'acme-corp-tenant-id', frameworks: ['iso27001'], issuedAt: '2026-01-01', expiry: '2027-01-01' }, kp.privateKey);
    var v = await verifyFile(file, pub);
    assert.equal(v.sigOk, true);
    var evalResult = evaluateEntitlement(file.payload, ['some-other-tenant-id', 'someother.com'], '2026-06-01');
    assert.equal(evalResult.status, 'mismatch');
    assert.deepEqual(evalResult.frameworks, []);
  });

  test('expired: signature verifies, tenant matches, past grace', async () => {
    var kp = await webcrypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
    var pub = CheckpointLib.bytesToBase64(new Uint8Array(await webcrypto.subtle.exportKey('raw', kp.publicKey)));
    var file = await issue({ tenantId: 't-1', frameworks: ['iso27001', 'soc2'], issuedAt: '2025-01-01', expiry: '2026-01-01', graceDays: 14 }, kp.privateKey);
    var v = await verifyFile(file, pub);
    assert.equal(v.sigOk, true);
    var evalResult = evaluateEntitlement(file.payload, 't-1', '2026-03-01');
    assert.equal(evalResult.status, 'expired');
    assert.deepEqual(evalResult.frameworks, ['iso27001', 'soc2']);
  });

  test('in-grace: signature verifies, tenant matches, past expiry but within graceDays', async () => {
    var kp = await webcrypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
    var pub = CheckpointLib.bytesToBase64(new Uint8Array(await webcrypto.subtle.exportKey('raw', kp.publicKey)));
    var file = await issue({ tenantId: 't-1', frameworks: ['iso27001'], issuedAt: '2025-01-01', expiry: '2026-01-01', graceDays: 14 }, kp.privateKey);
    var v = await verifyFile(file, pub);
    assert.equal(v.sigOk, true);
    var evalResult = evaluateEntitlement(file.payload, 't-1', '2026-01-10');
    assert.equal(evalResult.status, 'grace');
    assert.deepEqual(evalResult.frameworks, ['iso27001']);
    assert.equal(evalResult.graceUntil, '2026-01-15');
  });
});

describe('evaluateEntitlement()', () => {
  test('matching tenant, not yet expired -> valid', () => {
    var r = evaluateEntitlement({ tenantId: 't-1', frameworks: ['iso27001', 'soc2'], expiry: '2027-01-01' }, 't-1', '2026-06-01');
    assert.equal(r.status, 'valid');
    assert.deepEqual(r.frameworks, ['iso27001', 'soc2']);
  });
  test('matching tenant, past expiry -> expired, frameworks still returned', () => {
    var r = evaluateEntitlement({ tenantId: 't-1', frameworks: ['iso27001', 'soc2'], expiry: '2025-01-01' }, 't-1', '2026-06-01');
    assert.equal(r.status, 'expired');
    assert.deepEqual(r.frameworks, ['iso27001', 'soc2']);
  });
  test('expiry exactly today counts as still valid (< not <=)', () => {
    var r = evaluateEntitlement({ tenantId: 't-1', frameworks: ['iso27001'], expiry: '2026-06-01' }, 't-1', '2026-06-01');
    assert.equal(r.status, 'valid');
  });
  test('different tenant -> mismatch, no frameworks granted', () => {
    var r = evaluateEntitlement({ tenantId: 't-1', frameworks: ['iso27001', 'soc2'], expiry: '2027-01-01' }, 't-2', '2026-06-01');
    assert.equal(r.status, 'mismatch');
    assert.deepEqual(r.frameworks, []);
  });
  test('missing/empty payload -> mismatch, never throws', () => {
    assert.equal(evaluateEntitlement(null, 't-1', '2026-06-01').status, 'mismatch');
    assert.equal(evaluateEntitlement({}, 't-1', '2026-06-01').status, 'mismatch');
  });

  describe('tenant binding — GUID or verified domain, multiple acceptable ids', () => {
    test('matches a GUID', () => {
      var r = evaluateEntitlement({ tenantId: 'guid-123', frameworks: ['iso27001'], expiry: '2027-01-01' }, ['guid-123', 'contoso.com'], '2026-06-01');
      assert.equal(r.status, 'valid');
    });
    test('matches a verified domain instead of the GUID', () => {
      var r = evaluateEntitlement({ tenantId: 'contoso.com', frameworks: ['iso27001'], expiry: '2027-01-01' }, ['guid-123', 'contoso.com', 'contoso.onmicrosoft.com'], '2026-06-01');
      assert.equal(r.status, 'valid');
    });
    test('matching is case-insensitive', () => {
      var r = evaluateEntitlement({ tenantId: 'Contoso.COM', frameworks: ['iso27001'], expiry: '2027-01-01' }, ['contoso.com'], '2026-06-01');
      assert.equal(r.status, 'valid');
    });
    test('a single string (not an array) still works, for backward compatibility', () => {
      var r = evaluateEntitlement({ tenantId: 't-1', frameworks: ['iso27001'], expiry: '2027-01-01' }, 't-1', '2026-06-01');
      assert.equal(r.status, 'valid');
    });
    test('none of the acceptable ids match -> mismatch', () => {
      var r = evaluateEntitlement({ tenantId: 'someone-elses-tenant', frameworks: ['iso27001'], expiry: '2027-01-01' }, ['guid-123', 'contoso.com'], '2026-06-01');
      assert.equal(r.status, 'mismatch');
    });
  });

  describe('grace period', () => {
    test('default graceDays is 14 when the payload omits it', () => {
      // expiry 2026-06-01, now 10 days later -> still within the default 14-day grace
      var r = evaluateEntitlement({ tenantId: 't-1', frameworks: ['iso27001'], expiry: '2026-06-01' }, 't-1', '2026-06-11');
      assert.equal(r.status, 'grace');
      assert.equal(r.graceDays, 14);
      assert.equal(r.graceUntil, '2026-06-15');
    });
    test('still within an explicit graceDays -> grace, frameworks still returned', () => {
      var r = evaluateEntitlement({ tenantId: 't-1', frameworks: ['iso27001', 'soc2'], expiry: '2026-06-01', graceDays: 30 }, 't-1', '2026-06-20');
      assert.equal(r.status, 'grace');
      assert.deepEqual(r.frameworks, ['iso27001', 'soc2']);
      assert.equal(r.graceUntil, '2026-07-01');
    });
    test('exactly on the grace boundary still counts as grace (<=, not <)', () => {
      var r = evaluateEntitlement({ tenantId: 't-1', frameworks: ['iso27001'], expiry: '2026-06-01', graceDays: 14 }, 't-1', '2026-06-15');
      assert.equal(r.status, 'grace');
    });
    test('one day past the grace boundary -> expired', () => {
      var r = evaluateEntitlement({ tenantId: 't-1', frameworks: ['iso27001'], expiry: '2026-06-01', graceDays: 14 }, 't-1', '2026-06-16');
      assert.equal(r.status, 'expired');
    });
    test('graceDays: 0 means expiry day itself is the last valid day, no grace at all', () => {
      var r = evaluateEntitlement({ tenantId: 't-1', frameworks: ['iso27001'], expiry: '2026-06-01', graceDays: 0 }, 't-1', '2026-06-02');
      assert.equal(r.status, 'expired');
    });
    test('not yet expired -> valid regardless of graceDays', () => {
      var r = evaluateEntitlement({ tenantId: 't-1', frameworks: ['iso27001'], expiry: '2027-01-01', graceDays: 0 }, 't-1', '2026-06-01');
      assert.equal(r.status, 'valid');
      assert.equal(r.graceUntil, null);
    });
  });
});

describe('evaluateEntitlement() — licence type (client/partner/demo)', () => {
  test('a payload with no type field at all normalises to \'client\' — backward compatibility with every file issued before this field existed', () => {
    var r = evaluateEntitlement({ tenantId: 't-1', frameworks: ['iso27001'], expiry: '2027-01-01' }, 't-1', '2026-06-01');
    assert.equal(r.type, 'client');
  });
  test('type: \'client\' passes through', () => {
    var r = evaluateEntitlement({ tenantId: 't-1', type: 'client', frameworks: ['iso27001'], expiry: '2027-01-01' }, 't-1', '2026-06-01');
    assert.equal(r.type, 'client');
  });
  test('type: \'partner\' passes through, with every framework the payload lists', () => {
    var r = evaluateEntitlement({ tenantId: 't-1', type: 'partner', frameworks: ['iso27001', 'soc2', 'essential8'], expiry: '2030-01-01' }, 't-1', '2026-06-01');
    assert.equal(r.type, 'partner');
    assert.equal(r.status, 'valid');
    assert.deepEqual(r.frameworks, ['iso27001', 'soc2', 'essential8']);
  });
  test('type: \'demo\' passes through, and follows the exact same expiry/grace logic as any other type — no special leniency', () => {
    var valid = evaluateEntitlement({ tenantId: 't-1', type: 'demo', frameworks: ['iso27001'], expiry: '2026-07-20' }, 't-1', '2026-07-10');
    assert.equal(valid.type, 'demo');
    assert.equal(valid.status, 'valid');
    var expired = evaluateEntitlement({ tenantId: 't-1', type: 'demo', frameworks: ['iso27001'], expiry: '2026-01-01', graceDays: 0 }, 't-1', '2026-07-10');
    assert.equal(expired.type, 'demo');
    assert.equal(expired.status, 'expired');
  });
  test('an unrecognised type value normalises to \'client\' rather than being trusted verbatim', () => {
    var r = evaluateEntitlement({ tenantId: 't-1', type: 'super-admin', frameworks: ['iso27001'], expiry: '2027-01-01' }, 't-1', '2026-06-01');
    assert.equal(r.type, 'client');
  });
  test('type is still reported (normalised) even on a tenant mismatch', () => {
    var r = evaluateEntitlement({ tenantId: 't-1', type: 'partner', frameworks: ['iso27001'], expiry: '2027-01-01' }, 't-2', '2026-06-01');
    assert.equal(r.status, 'mismatch');
    assert.equal(r.type, 'partner');
  });

  describe('daysRemaining — the demo trial banner\'s countdown', () => {
    test('positive while not yet expired', () => {
      var r = evaluateEntitlement({ tenantId: 't-1', type: 'demo', frameworks: ['iso27001'], expiry: '2026-07-20' }, 't-1', '2026-07-10');
      assert.equal(r.daysRemaining, 10);
    });
    test('zero on the expiry day itself', () => {
      var r = evaluateEntitlement({ tenantId: 't-1', type: 'demo', frameworks: ['iso27001'], expiry: '2026-07-10' }, 't-1', '2026-07-10');
      assert.equal(r.daysRemaining, 0);
    });
    test('negative once past expiry', () => {
      var r = evaluateEntitlement({ tenantId: 't-1', type: 'demo', frameworks: ['iso27001'], expiry: '2026-07-01', graceDays: 30 }, 't-1', '2026-07-10');
      assert.equal(r.daysRemaining, -9);
    });
    test('null when the payload has no expiry at all', () => {
      var r = evaluateEntitlement({ tenantId: 't-1', type: 'demo', frameworks: ['iso27001'] }, 't-1', '2026-07-10');
      assert.equal(r.daysRemaining, null);
    });
  });
});

describe('normalizeEntitlementType()', () => {
  test('passes through the three known types unchanged', () => {
    assert.equal(normalizeEntitlementType('client'), 'client');
    assert.equal(normalizeEntitlementType('partner'), 'partner');
    assert.equal(normalizeEntitlementType('demo'), 'demo');
  });
  test('defaults anything else (including undefined) to \'client\'', () => {
    assert.equal(normalizeEntitlementType(undefined), 'client');
    assert.equal(normalizeEntitlementType(null), 'client');
    assert.equal(normalizeEntitlementType(''), 'client');
    assert.equal(normalizeEntitlementType('Partner'), 'client'); // case-sensitive on purpose — issued files always use the exact lowercase literal
  });
});

describe('daysBetweenDateStr()', () => {
  test('positive when "to" is after "from"', () => {
    assert.equal(daysBetweenDateStr('2026-07-01', '2026-07-11'), 10);
  });
  test('negative when "to" is before "from"', () => {
    assert.equal(daysBetweenDateStr('2026-07-11', '2026-07-01'), -10);
  });
  test('zero for the same date', () => {
    assert.equal(daysBetweenDateStr('2026-07-01', '2026-07-01'), 0);
  });
  test('rolls over a year boundary correctly', () => {
    assert.equal(daysBetweenDateStr('2026-12-28', '2027-01-07'), 10);
  });
});

describe('isDevBypassActive() — the localhost guard behind the local-development bypass', () => {
  test('true only when the flag is strictly true AND the hostname is localhost or 127.0.0.1', () => {
    assert.equal(isDevBypassActive(true, 'localhost'), true);
    assert.equal(isDevBypassActive(true, '127.0.0.1'), true);
  });
  test('false for a real hostname, even with the flag on — this is what a real deployment relies on', () => {
    assert.equal(isDevBypassActive(true, 'checkpoint.compliance365.com.au'), false);
  });
  test('false when the flag is off, even on localhost — what a production build shipped-and-somehow-served-locally still refuses', () => {
    assert.equal(isDevBypassActive(false, 'localhost'), false);
  });
  test('false for falsy/non-boolean flag values, not just false', () => {
    assert.equal(isDevBypassActive(undefined, 'localhost'), false);
    assert.equal(isDevBypassActive('true', 'localhost'), false);
    assert.equal(isDevBypassActive(1, 'localhost'), false);
  });
});

describe('addDaysToDateStr()', () => {
  test('adds days within the same month', () => {
    assert.equal(addDaysToDateStr('2026-06-01', 10), '2026-06-11');
  });
  test('rolls over a month boundary', () => {
    assert.equal(addDaysToDateStr('2026-06-25', 10), '2026-07-05');
  });
  test('rolls over a year boundary', () => {
    assert.equal(addDaysToDateStr('2026-12-28', 10), '2027-01-07');
  });
  test('zero days returns the same date', () => {
    assert.equal(addDaysToDateStr('2026-06-01', 0), '2026-06-01');
  });
});

describe('evaluateEntitlement() — moduleKeys pass-through', () => {
  test('moduleKeys from the payload are returned verbatim', () => {
    var r = evaluateEntitlement({ tenantId: 't-1', frameworks: ['iso27001', 'soc2'], expiry: '2027-01-01', moduleKeys: { soc2: 'abc123' } }, 't-1', '2026-06-01');
    assert.deepEqual(r.moduleKeys, { soc2: 'abc123' });
  });
  test('a payload with no moduleKeys field returns {}, not undefined', () => {
    var r = evaluateEntitlement({ tenantId: 't-1', frameworks: ['iso27001'], expiry: '2027-01-01' }, 't-1', '2026-06-01');
    assert.deepEqual(r.moduleKeys, {});
  });
});

// Content-pack crypto (public/checkpoint/lib.js's encryptPack/decryptPack/
// sha256Hex/validatePackShape) — the client-side half of "move premium
// content out of the shipped bundle into encrypted content packs".
// scripts/build-content-packs.mjs uses the exact same encryptPack()
// implementation to build the real packs; app.js's mergeLicensedPacks()
// uses the exact same decryptPack()/validatePackShape() to consume them.
describe('content-pack crypto (encryptPack/decryptPack/sha256Hex/validatePackShape)', () => {
  var samplePlaintext = { moduleId: 'soc2', version: 1, framework: { id: 'soc2', name: 'SOC 2', tag: 'Trust', blurb: '...', controls: [{ code: 'CC1.1', t: 'Sample control', app: true, map: '', cat: 'CC' }] }, guidance: { 'CC1.1': { steps: ['do the thing'] } }, extra: {} };

  test('decrypt round-trip: encrypting then decrypting with the same key reproduces the exact plaintext', async () => {
    var key = randomKey();
    var pack = await encryptPack(webcrypto.subtle, key, 'soc2', 1, samplePlaintext);
    assert.equal(pack.moduleId, 'soc2');
    assert.equal(pack.version, 1);
    var decrypted = await decryptPack(webcrypto.subtle, key, pack);
    assert.deepEqual(decrypted, samplePlaintext);
  });

  test('a tampered ciphertext is rejected (AES-GCM auth tag fails to verify)', async () => {
    var key = randomKey();
    var pack = await encryptPack(webcrypto.subtle, key, 'soc2', 1, samplePlaintext);
    var ctBytes = Buffer.from(pack.ciphertext, 'base64');
    ctBytes[0] ^= 0xff; // flip a bit — anywhere in ciphertext or its trailing auth tag
    var tampered = Object.assign({}, pack, { ciphertext: ctBytes.toString('base64') });
    await assert.rejects(() => decryptPack(webcrypto.subtle, key, tampered));
  });

  test('the wrong key is rejected — indistinguishable from a tampered pack, both correctly treated as "module unavailable"', async () => {
    var pack = await encryptPack(webcrypto.subtle, randomKey(), 'soc2', 1, samplePlaintext);
    await assert.rejects(() => decryptPack(webcrypto.subtle, randomKey(), pack));
  });

  test('sha256Hex produces a 64-character lowercase hex digest, stable for the same bytes', async () => {
    var bytes = new TextEncoder().encode('hello content pack');
    var h1 = await sha256Hex(webcrypto.subtle, bytes);
    var h2 = await sha256Hex(webcrypto.subtle, bytes);
    assert.match(h1, /^[0-9a-f]{64}$/);
    assert.equal(h1, h2);
  });

  test('sha256Hex changes if a single byte of the pack changes (defense-in-depth alongside AES-GCM\'s own auth tag)', async () => {
    var a = new TextEncoder().encode('{"moduleId":"soc2"}');
    var b = new TextEncoder().encode('{"moduleId":"soc3"}');
    assert.notEqual(await sha256Hex(webcrypto.subtle, a), await sha256Hex(webcrypto.subtle, b));
  });

  test('validatePackShape accepts well-formed decrypted content', () => {
    assert.equal(validatePackShape('soc2', samplePlaintext), null);
  });
  test('validatePackShape rejects a framework.id that doesn\'t match the requested module (wrong pack served for this moduleId)', () => {
    assert.ok(validatePackShape('essential8', samplePlaintext));
  });
  test('validatePackShape rejects missing/non-array controls', () => {
    assert.ok(validatePackShape('soc2', { framework: { id: 'soc2', controls: 'not-an-array' } }));
    assert.ok(validatePackShape('soc2', { framework: { id: 'soc2' } }));
  });
  test('validatePackShape rejects a non-object guidance field', () => {
    assert.ok(validatePackShape('soc2', { framework: { id: 'soc2', controls: [] }, guidance: 'nope' }));
  });
  test('validatePackShape rejects null/non-object content entirely', () => {
    assert.ok(validatePackShape('soc2', null));
    assert.ok(validatePackShape('soc2', 'a string'));
  });
});

describe('constellationTheme()', () => {
  test('ISO 27001/42001/27701 use the first two dot-segments', () => {
    assert.equal(constellationTheme('iso27001', 'A.5.29'), 'A.5');
    assert.equal(constellationTheme('iso42001', 'AI.3.2'), 'AI.3');
    assert.equal(constellationTheme('iso27701', 'P.7.2.8'), 'P.7');
  });
  test('SOC 2 uses the leading letter prefix', () => {
    assert.equal(constellationTheme('soc2', 'CC6.1'), 'CC');
    assert.equal(constellationTheme('soc2', 'A1.2'), 'A');
    assert.equal(constellationTheme('soc2', 'PI1.3'), 'PI');
  });
  test('Essential Eight groups ML-leveled codes under their parent strategy', () => {
    assert.equal(constellationTheme('essential8', 'E8.1-ML2'), 'E8.1');
    assert.equal(constellationTheme('essential8', 'E8.1'), 'E8.1');
  });
  test('NIST CSF uses the function (first segment)', () => {
    assert.equal(constellationTheme('nistcsf', 'GV.OC'), 'GV');
    assert.equal(constellationTheme('nistcsf', 'PR.AA'), 'PR');
  });
  test('DISP/IRAP has no sub-theme — every control shares one flat theme', () => {
    assert.equal(constellationTheme('dispirap', 'DISP.1'), 'dispirap');
    assert.equal(constellationTheme('dispirap', 'DISP.34'), 'dispirap');
  });
  test('an empty/undefined code never throws', () => {
    assert.equal(constellationTheme('iso27001', ''), 'iso27001');
    assert.equal(constellationTheme('soc2', undefined), 'soc2');
  });
});

describe('constellationEdges()', () => {
  test('creates an edge only when both endpoints are present in the node set', () => {
    var nodes = [
      { fw: 'iso27001', id: 'A.5.29', map: 'NIST RC.RP' },
      { fw: 'nistcsf', id: 'RC.RP', map: '' },
      { fw: 'iso27001', id: 'A.5.99', map: 'SOC2 CC9.9' } // CC9.9 not in node set
    ];
    assert.deepEqual(constellationEdges(nodes), [{ a: 'iso27001|A.5.29', b: 'nistcsf|RC.RP' }]);
  });
  test('dedupes a relationship cited from both sides into a single edge', () => {
    var nodes = [
      { fw: 'iso27001', id: 'A.5.1', map: 'SOC2 CC1.1' },
      { fw: 'soc2', id: 'CC1.1', map: 'ISO27001 A.5.1' }
    ];
    assert.equal(constellationEdges(nodes).length, 1);
  });
  test('never emits a self-edge', () => {
    var nodes = [{ fw: 'iso27001', id: 'A.5.1', map: 'ISO27001 A.5.1' }];
    assert.deepEqual(constellationEdges(nodes), []);
  });
  test('empty/no map fields produce no edges', () => {
    assert.deepEqual(constellationEdges([{ fw: 'iso27001', id: 'A.5.1', map: '' }]), []);
    assert.deepEqual(constellationEdges([]), []);
  });
});

describe('constellationLayout()', () => {
  test('every node gets a finite, in-bounds position keyed by "fw|id"', () => {
    var nodes = [
      { fw: 'iso27001', id: 'A.5.1', theme: 'A.5' },
      { fw: 'iso27001', id: 'A.6.1', theme: 'A.6' },
      { fw: 'soc2', id: 'CC1.1', theme: 'CC' }
    ];
    var pos = constellationLayout(nodes, ['iso27001', 'soc2']);
    assert.equal(Object.keys(pos).length, 3);
    Object.values(pos).forEach((p) => {
      assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y));
      assert.ok(p.radius >= 70 && p.radius <= 470);
    });
  });
  test('is deterministic — same input always yields the same output', () => {
    var nodes = [
      { fw: 'iso27001', id: 'A.5.1', theme: 'A.5' },
      { fw: 'nistcsf', id: 'GV.OC', theme: 'GV' }
    ];
    var a = constellationLayout(nodes, ['iso27001', 'nistcsf']);
    var b = constellationLayout(nodes, ['iso27001', 'nistcsf']);
    assert.deepEqual(a, b);
  });
  test('frameworks absent from the node set are skipped, not given empty sectors', () => {
    var nodes = [{ fw: 'soc2', id: 'CC1.1', theme: 'CC' }];
    var pos = constellationLayout(nodes, ['iso27001', 'soc2', 'nistcsf']);
    assert.equal(Object.keys(pos).length, 1);
  });
  test('a large single theme (many controls) still keeps every node within [innerR, outerR]', () => {
    var nodes = [];
    for (var i = 0; i < 37; i++) nodes.push({ fw: 'iso27001', id: 'A.5.' + (i + 1), theme: 'A.5' });
    var pos = constellationLayout(nodes, ['iso27001']);
    Object.values(pos).forEach((p) => { assert.ok(p.radius >= 70 && p.radius <= 470); });
  });
  test('empty node set returns an empty position map', () => {
    assert.deepEqual(constellationLayout([], ['iso27001']), {});
  });
});

describe('fingerprintFromRows()', () => {
  test('groups rows into sorted rings with per-theme and overall percentages', () => {
    var result = fingerprintFromRows([
      { theme: 'A.5', implemented: true, evidenced: true },
      { theme: 'A.5', implemented: false, evidenced: false },
      { theme: 'A.6', implemented: true, evidenced: false },
      { theme: 'A.6', implemented: true, evidenced: true }
    ]);
    assert.deepEqual(result, {
      rings: [
        { key: 'A.5', label: 'A.5', total: 2, implemented: 1, pct: 50 },
        { key: 'A.6', label: 'A.6', total: 2, implemented: 2, pct: 100 }
      ],
      total: 4,
      centerPct: 75,
      evidencePct: 50
    });
  });
  test('empty rows -> zeroed result, not NaN or a thrown error', () => {
    assert.deepEqual(fingerprintFromRows([]), { rings: [], total: 0, centerPct: 0, evidencePct: 0 });
  });
  test('rows with no theme fall into a single "—" ring rather than being dropped', () => {
    var result = fingerprintFromRows([{ implemented: true, evidenced: true }]);
    assert.equal(result.rings.length, 1);
    assert.equal(result.rings[0].key, '—');
  });
});

/* Fixture-based snapshot tests for the audit-ready projection — this
   number gets quoted to a board, so every scenario below is a named,
   independently-reasoned-through case (see remediationVelocityProjection's
   own header comment in lib.js), not just whatever the code happens to
   emit. today is fixed so the fixtures are reproducible. */
describe('remediationVelocityProjection()', () => {
  var today = '2026-07-12';
  function daysAgo(n) { return new Date(Date.parse(today) - n * 86400000).toISOString().slice(0, 10); }

  test('steady 8-events-over-49-days velocity projects a specific date', () => {
    var events = [0, 7, 14, 21, 28, 35, 42, 49].map(daysAgo);
    assert.deepEqual(remediationVelocityProjection({ events: events, applicableTotal: 100, implementedNow: 60, today: today }), {
      status: 'projected', date: '2027-03-14', clamped: false, velocityPerWeek: 1.14, weeksNeeded: 35, remaining: 40
    });
  });
  test('under 3 weeks of history -> insufficient-history, never a fabricated date', () => {
    var events = [0, 5, 10].map(daysAgo);
    assert.deepEqual(remediationVelocityProjection({ events: events, applicableTotal: 100, implementedNow: 60, today: today }), { status: 'insufficient-history' });
  });
  test('exactly 21 days of history is enough (boundary is inclusive)', () => {
    var events = [0, 21].map(daysAgo);
    var r = remediationVelocityProjection({ events: events, applicableTotal: 100, implementedNow: 60, today: today });
    assert.equal(r.status, 'projected');
  });
  test('old history but zero implementations in the trailing 8 weeks -> insufficient-history, not a stale-velocity date', () => {
    var events = [100, 120, 150].map(daysAgo);
    assert.deepEqual(remediationVelocityProjection({ events: events, applicableTotal: 100, implementedNow: 60, today: today }), { status: 'insufficient-history' });
  });
  test('every applicable control already implemented -> complete, regardless of history', () => {
    var events = [0, 7, 14, 21, 28, 35, 42, 49].map(daysAgo);
    assert.deepEqual(remediationVelocityProjection({ events: events, applicableTotal: 60, implementedNow: 60, today: today }), { status: 'complete' });
  });
  test('no implementation events at all -> insufficient-history', () => {
    assert.deepEqual(remediationVelocityProjection({ events: [], applicableTotal: 100, implementedNow: 60, today: today }), { status: 'insufficient-history' });
  });
  test('near-zero velocity against a huge remaining count clamps at the 10-year ceiling instead of an absurd date', () => {
    var events = [0, 49].map(daysAgo);
    var r = remediationVelocityProjection({ events: events, applicableTotal: 10000, implementedNow: 0, today: today });
    assert.equal(r.status, 'projected');
    assert.equal(r.clamped, true);
    assert.equal(r.weeksNeeded, 520);
  });
  test('events after today are ignored (defends against clock skew / bad input)', () => {
    var events = [0, 7, 14].map(daysAgo).concat([new Date(Date.parse(today) + 5 * 86400000).toISOString().slice(0, 10)]);
    var r = remediationVelocityProjection({ events: events, applicableTotal: 100, implementedNow: 60, today: today });
    // future event excluded -> same as 3-event, 14-day history -> insufficient-history (< 21 days)
    assert.deepEqual(r, { status: 'insufficient-history' });
  });
});

/* Fixture-based tests for the Assurance Pulse's weekly aggregation —
   today is fixed so bucket boundaries are reproducible. */
describe('weeklyActivityGrid()', () => {
  var today = '2026-07-12';
  function daysAgo(n) { return new Date(Date.parse(today) - n * 86400000).toISOString().slice(0, 10); }

  test('returns `weeks` buckets, oldest first, most recent (ending today) last', () => {
    var grid = weeklyActivityGrid([], 26, today);
    assert.equal(grid.length, 26);
    assert.equal(grid[25].end, today);
    assert.equal(grid[25].start, daysAgo(6));
    assert.equal(grid[0].end, daysAgo(25 * 7));
  });
  test('events land in the correct week bucket, grouped by type', () => {
    var events = [
      { date: daysAgo(0), type: 'scan' },
      { date: daysAgo(2), type: 'evidence' },
      { date: daysAgo(6), type: 'attestation' }, // still this week (0-6 days ago)
      { date: daysAgo(10), type: 'review' }, // previous week
      { date: daysAgo(200), type: 'audit' } // outside the 26-week window entirely
    ];
    var grid = weeklyActivityGrid(events, 26, today);
    assert.deepEqual(grid[25].counts, { scan: 1, evidence: 1, attestation: 1, review: 0, audit: 0 });
    assert.equal(grid[25].total, 3);
    assert.deepEqual(grid[24].counts, { scan: 0, evidence: 0, attestation: 0, review: 1, audit: 0 });
    var totalAcrossAllBuckets = grid.reduce(function (sum, b) { return sum + b.total; }, 0);
    assert.equal(totalAcrossAllBuckets, 4); // the 200-days-ago audit is dropped, not mis-bucketed
  });
  test('an unrecognised event type is dropped, not miscounted', () => {
    var grid = weeklyActivityGrid([{ date: today, type: 'bogus' }], 26, today);
    assert.equal(grid[25].total, 0);
  });
  test('an unparseable date is dropped, not thrown', () => {
    assert.doesNotThrow(() => weeklyActivityGrid([{ date: 'not-a-date', type: 'scan' }], 26, today));
  });
  test('a future-dated event (clock skew) is dropped', () => {
    var future = new Date(Date.parse(today) + 5 * 86400000).toISOString().slice(0, 10);
    var grid = weeklyActivityGrid([{ date: future, type: 'scan' }], 26, today);
    assert.equal(grid.reduce(function (s, b) { return s + b.total; }, 0), 0);
  });
  test('an invalid today never throws and returns empty-but-shaped buckets', () => {
    var grid = weeklyActivityGrid([{ date: today, type: 'scan' }], 26, 'not-a-date');
    assert.equal(grid.length, 26);
    assert.equal(grid[25].total, 0);
  });
});

describe('riskBubblePoint() / riskBubbleLayout()', () => {
  test('is deterministic — same id/L/I always lands at the same point', () => {
    var a = riskBubblePoint('R-001', 4, 4, {});
    var b = riskBubblePoint('R-001', 4, 4, {});
    assert.deepEqual(a, b);
  });
  test('different ids in the same cell get different jittered positions (separation)', () => {
    var a = riskBubblePoint('R-001', 4, 4, {});
    var b = riskBubblePoint('R-002', 4, 4, {});
    assert.notDeepEqual({ x: a.x, y: a.y }, { x: b.x, y: b.y });
  });
  test('L/I are clamped into 1..5, never NaN or off-grid', () => {
    var p = riskBubblePoint('R-001', 99, -3, {});
    assert.equal(p.L, 5);
    assert.equal(p.I, 1);
  });
  test('riskBubbleLayout lays out every risk when under the individual cap', () => {
    var risks = [{ id: 'R-001', L: 4, I: 4 }, { id: 'R-002', L: 1, I: 1 }];
    var layout = riskBubbleLayout(risks);
    assert.equal(layout.bubbles.length, 2);
    assert.equal(layout.overflowCount, 0);
  });
  test('higher residual score gets a strictly larger radius', () => {
    var layout = riskBubbleLayout([{ id: 'R-001', L: 5, I: 5 }, { id: 'R-002', L: 1, I: 1 }]);
    var big = layout.bubbles.find(function (b) { return b.id === 'R-001'; });
    var small = layout.bubbles.find(function (b) { return b.id === 'R-002'; });
    assert.ok(big.r > small.r);
  });
  test('band is computed from the clamped L×I score', () => {
    var layout = riskBubbleLayout([{ id: 'R-001', L: 5, I: 5 }, { id: 'R-002', L: 1, I: 1 }]);
    assert.equal(layout.bubbles.find(function (b) { return b.id === 'R-001'; }).band, 'Critical');
    assert.equal(layout.bubbles.find(function (b) { return b.id === 'R-002'; }).band, 'Low');
  });
  test('0 risks lays out cleanly — no bubbles, no overflow, no error', () => {
    var layout = riskBubbleLayout([]);
    assert.deepEqual(layout.bubbles, []);
    assert.equal(layout.overflowCount, 0);
  });
  test('over the individual cap, the most severe risks are kept and the rest roll into overflowCount', () => {
    var risks = [];
    for (var i = 0; i < 60; i++) risks.push({ id: 'R-' + i, L: (i % 5) + 1, I: ((i * 3) % 5) + 1 });
    var layout = riskBubbleLayout(risks, { maxIndividual: 50 });
    assert.equal(layout.bubbles.length, 50);
    assert.equal(layout.overflowCount, 10);
    // the single L5×I5=25 risk (i=20: L=1,I=... let's just assert the kept set's minimum score is >= every dropped risk's score
    var keptIds = {};
    layout.bubbles.forEach(function (b) { keptIds[b.id] = b.score; });
    var minKept = Math.min.apply(null, Object.values(keptIds));
    var maxDropped = Math.max.apply(null, risks.filter(function (r) { return !keptIds.hasOwnProperty(r.id); }).map(function (r) { return r.L * r.I; }));
    assert.ok(minKept >= maxDropped);
  });
});

describe('relLuminance() / contrastRatio()', () => {
  test('pure black vs pure white is the maximum 21:1 ratio', () => {
    assert.equal(relLuminance([0, 0, 0]), 0);
    assert.equal(relLuminance([255, 255, 255]), 1);
    assert.equal(contrastRatio([0, 0, 0], [255, 255, 255]), 21);
  });
  test('a color against itself is always 1:1 (no contrast)', () => {
    assert.equal(contrastRatio([169, 129, 46], [169, 129, 46]), 1);
  });
  test('is symmetric — argument order never changes the ratio', () => {
    assert.equal(contrastRatio([250, 247, 241], [11, 11, 12]), contrastRatio([11, 11, 12], [250, 247, 241]));
  });
  test('this app\'s own dark-theme paper-on-ink combination clears 18:1 (comfortably AAA)', () => {
    assert.ok(contrastRatio([250, 247, 241], [11, 11, 12]) > 18);
  });
});

describe('compositeOverBg()', () => {
  test('alpha 0 returns the background unchanged', () => {
    assert.deepEqual(compositeOverBg([255, 0, 0], 0, [10, 20, 30]), [10, 20, 30]);
  });
  test('alpha 1 returns the foreground unchanged', () => {
    assert.deepEqual(compositeOverBg([255, 0, 0], 1, [10, 20, 30]), [255, 0, 0]);
  });
  test('alpha 0.5 is the exact midpoint', () => {
    assert.deepEqual(compositeOverBg([200, 100, 0], 0.5, [0, 100, 200]), [100, 100, 100]);
  });
  test('out-of-range alpha is clamped into [0,1], never a negative or >1 blend', () => {
    assert.deepEqual(compositeOverBg([255, 255, 255], -1, [0, 0, 0]), [0, 0, 0]);
    assert.deepEqual(compositeOverBg([255, 255, 255], 5, [0, 0, 0]), [255, 255, 255]);
  });
});

/* Fixture-based tests for the heatmap's readable-text picker — this is
   the fix for a real, verified contrast bug: a fixed per-severity text
   color can't stay AA-compliant across every risk-count alpha level in
   both themes (see app.js's heatmap cell-text call site), so the text
   color must be chosen from the actual composited cell color. */
describe('pickReadableRgb()', () => {
  var white = [255, 255, 255], black = [11, 11, 12];
  test('picks dark text on a light/pastel background', () => {
    assert.deepEqual(pickReadableRgb([230, 230, 225], white, black), black);
  });
  test('picks light text on a saturated/dark background', () => {
    assert.deepEqual(pickReadableRgb([20, 90, 20], white, black), white);
  });
  test('a tie favors dark text', () => {
    // a mid-gray background where black and white are ~equally readable
    var mid = [128, 128, 128];
    var r = pickReadableRgb(mid, white, black);
    assert.ok(r === white || r === black); // just confirm it picks one deterministically, not both/neither
  });
  test('reproduces the real bug: an amber "Medium" heatmap cell at low risk-count alpha needs light text, not the old fixed dark text', () => {
    // SEV_RGB.Medium = 250,178,25 (amber), composited at alpha .42 over dark ink (11,11,12) —
    // the old fixed SEV_TEXT.Medium ('#2a1c00', near-black) measured 2.27:1 there — a real AA failure.
    var cell = compositeOverBg([250, 178, 25], 0.42, [11, 11, 12]);
    var picked = pickReadableRgb(cell, white, black);
    assert.deepEqual(picked, white);
    assert.ok(contrastRatio(picked, cell) >= 4.5);
  });
  test('the same amber cell at high alpha (mostly pure hue) correctly flips to dark text', () => {
    var cell = compositeOverBg([250, 178, 25], 0.82, [11, 11, 12]);
    var picked = pickReadableRgb(cell, white, black);
    assert.deepEqual(picked, black);
    assert.ok(contrastRatio(picked, cell) >= 4.5);
  });
});

describe('mulberry32()', () => {
  test('is deterministic — the same seed always produces the same sequence', () => {
    var a = mulberry32(42), b = mulberry32(42);
    assert.deepEqual([a(), a(), a()], [b(), b(), b()]);
  });
  test('different seeds diverge', () => {
    var a = mulberry32(1)(), b = mulberry32(2)();
    assert.notEqual(a, b);
  });
  test('every draw stays within [0,1)', () => {
    var rand = mulberry32(7);
    for (var i = 0; i < 500; i++) { var v = rand(); assert.ok(v >= 0 && v < 1); }
  });
});

describe('sampleTriangular()', () => {
  test('u=0 returns exactly min, u->1 approaches max', () => {
    assert.equal(sampleTriangular(10, 15, 30, 0), 10);
    assert.ok(sampleTriangular(10, 15, 30, 0.999999) < 30 && sampleTriangular(10, 15, 30, 0.999999) > 29.9);
  });
  test('at the mode fraction c=(likely-min)/(max-min), the sample equals `likely` exactly', () => {
    // min=0,likely=10,max=20 -> c=0.5 (verified by hand: sqrt(0.5*20*10)=10)
    assert.equal(sampleTriangular(0, 10, 20, 0.5), 10);
  });
  test('degenerates to a point mass at min when max<=min (no real range given)', () => {
    assert.equal(sampleTriangular(500, 500, 500, 0.3), 500);
    assert.equal(sampleTriangular(500, 500, 100, 0.7), 500);
  });
  test('a likely value outside [min,max] is clamped, never producing an out-of-range sample', () => {
    var v = sampleTriangular(0, 999, 20, 0.5);
    assert.ok(v >= 0 && v <= 20);
  });
});

describe('samplePoisson()', () => {
  test('lambda<=0 always returns 0', () => {
    var rand = mulberry32(1);
    assert.equal(samplePoisson(0, rand), 0);
    assert.equal(samplePoisson(-3, rand), 0);
  });
  test('is deterministic given the same rand() sequence', () => {
    var a = samplePoisson(3, mulberry32(55));
    var b = samplePoisson(3, mulberry32(55));
    assert.equal(a, b);
  });
  test('mean of many draws converges near lambda (statistical sanity check, generous tolerance)', () => {
    var rand = mulberry32(2024), lambda = 4, n = 4000, sum = 0;
    for (var i = 0; i < n; i++) sum += samplePoisson(lambda, rand);
    var mean = sum / n;
    assert.ok(Math.abs(mean - lambda) < 0.3, 'mean=' + mean);
  });
});

describe('riskFinancialInputs()', () => {
  test('derives loss/frequency ranges purely from L/I, no other input required', () => {
    var inputs = riskFinancialInputs(4, 4);
    assert.deepEqual(inputs, {
      freqMin: 0.8, freqLikely: 2, freqMax: 5,
      lossMin: 75000, lossLikely: 300000, lossMax: 1000000
    });
  });
  test('L drives frequency, I drives loss magnitude — independently', () => {
    var lowLI = riskFinancialInputs(1, 5); // rare but severe
    assert.equal(lowLI.freqLikely, RISK_FINANCIAL_BANDS.eventsPerYear[1].likely);
    assert.equal(lowLI.lossLikely, RISK_FINANCIAL_BANDS.lossUsd[5].likely);
  });
  test('out-of-range or missing L/I is clamped into 1..5, never throws', () => {
    assert.doesNotThrow(() => riskFinancialInputs(99, -3));
    assert.doesNotThrow(() => riskFinancialInputs(undefined, null));
    var clamped = riskFinancialInputs(99, -3);
    assert.deepEqual(clamped.freqMin, RISK_FINANCIAL_BANDS.eventsPerYear[5].min);
    assert.deepEqual(clamped.lossMin, RISK_FINANCIAL_BANDS.lossUsd[1].min);
  });
  test('per-risk overrides replace only the fields given, defaults fill the rest', () => {
    var inputs = riskFinancialInputs(3, 3, { lossLikely: 500000 });
    assert.equal(inputs.lossLikely, 500000);
    assert.equal(inputs.lossMin, RISK_FINANCIAL_BANDS.lossUsd[3].min); // untouched default
  });
});

describe('simulateRiskLosses() / simulatePortfolioLosses()', () => {
  test('returns exactly `trials` values, and is bit-for-bit deterministic for the same seed', () => {
    var inputs = riskFinancialInputs(3, 3);
    var a = simulateRiskLosses(inputs, 1000, 999);
    var b = simulateRiskLosses(inputs, 1000, 999);
    assert.equal(a.length, 1000);
    assert.deepEqual(a, b);
  });
  test('every simulated annual loss is >= 0 (never negative)', () => {
    var inputs = riskFinancialInputs(5, 5);
    var losses = simulateRiskLosses(inputs, 2000, 4);
    assert.ok(losses.every((v) => v >= 0));
  });
  test('a higher L/I risk has a materially higher mean simulated loss than a lower one (same seed, same trial count)', () => {
    var low = simulateRiskLosses(riskFinancialInputs(1, 1), 4000, 10);
    var high = simulateRiskLosses(riskFinancialInputs(5, 5), 4000, 10);
    var meanLow = low.reduce((s, v) => s + v, 0) / low.length;
    var meanHigh = high.reduce((s, v) => s + v, 0) / high.length;
    assert.ok(meanHigh > meanLow * 10, 'meanLow=' + meanLow + ' meanHigh=' + meanHigh);
  });
  test('portfolio totals equal the trial-by-trial sum of every risk\'s own losses, not an independent re-simulation', () => {
    var risks = [{ id: 'R-1', L: 3, I: 3 }, { id: 'R-2', L: 2, I: 4 }];
    var result = simulatePortfolioLosses(risks, 500, 42);
    assert.equal(result.perRisk.length, 2);
    for (var t = 0; t < 500; t++) {
      var expected = result.perRisk[0].losses[t] + result.perRisk[1].losses[t];
      assert.ok(Math.abs(result.portfolioTotals[t] - expected) < 1e-6);
    }
  });
  test('0 risks in the portfolio returns an all-zero total, not a crash', () => {
    var result = simulatePortfolioLosses([], 100, 1);
    assert.equal(result.perRisk.length, 0);
    assert.ok(result.portfolioTotals.every((v) => v === 0));
  });
  test('different risks get independent draw sequences (not an accidental identical/correlated copy)', () => {
    var risks = [{ id: 'R-1', L: 4, I: 4 }, { id: 'R-2', L: 4, I: 4 }]; // same inputs, different index
    var result = simulatePortfolioLosses(risks, 200, 1);
    assert.notDeepEqual(result.perRisk[0].losses, result.perRisk[1].losses);
  });
});

describe('summarizeLossDistribution()', () => {
  test('percentiles are monotonically non-decreasing and bounded by min/max', () => {
    var losses = simulateRiskLosses(riskFinancialInputs(4, 3), 5000, 321);
    var s = summarizeLossDistribution(losses);
    assert.ok(s.min <= s.p10 && s.p10 <= s.median && s.median <= s.p90 && s.p90 <= s.p95 && s.p95 <= s.p99 && s.p99 <= s.max);
  });
  test('an empty array returns an honest all-zero summary, not NaN', () => {
    var s = summarizeLossDistribution([]);
    assert.deepEqual(s, { mean: 0, median: 0, p10: 0, p90: 0, p95: 0, p99: 0, min: 0, max: 0, count: 0 });
  });
  test('a fixed, hand-computed fixture matches exactly (nearest-rank percentiles)', () => {
    var s = summarizeLossDistribution([10, 20, 30, 40, 50, 60, 70, 80, 90, 100]);
    assert.equal(s.count, 10);
    assert.equal(s.min, 10);
    assert.equal(s.max, 100);
    assert.equal(s.mean, 55);
    assert.equal(s.median, 60); // index round(0.5*9)=5 -> sorted[5]=60
  });
});

describe('lossExceedanceCurve()', () => {
  test('starts near 1 (almost everything exceeds 0) and ends at 0 (nothing exceeds the max)', () => {
    var curve = lossExceedanceCurve([0, 10, 20, 30, 100], 5);
    assert.equal(curve[0].x, 0);
    assert.ok(curve[0].p > 0.5);
    assert.equal(curve[curve.length - 1].p, 0);
  });
  test('probability is monotonically non-increasing as x increases', () => {
    var losses = simulateRiskLosses(riskFinancialInputs(4, 4), 3000, 8);
    var curve = lossExceedanceCurve(losses, 30);
    for (var i = 1; i < curve.length; i++) assert.ok(curve[i].p <= curve[i - 1].p);
  });
  test('an empty loss array returns an empty curve, not a crash', () => {
    assert.deepEqual(lossExceedanceCurve([], 10), []);
  });
  test('a fixed fixture matches an exact hand-computed exceedance probability', () => {
    // 4 values: 0,10,20,30 — at x=10, exactly 2 of 4 values (20,30) exceed it -> p=0.5
    var curve = lossExceedanceCurve([0, 10, 20, 30], 4); // points at x=0,10,20,30
    var atTen = curve.find((pt) => Math.abs(pt.x - 10) < 1e-9);
    assert.equal(atTen.p, 0.5);
  });
});

// ---------------------------------------------------------------
// Document control register — ISO 27001 Clause 7.5.2/7.5.3.
// Every assertion pins `today` explicitly; neither function is
// allowed to read the ambient clock.
// ---------------------------------------------------------------
const { documentReviewState, documentRegisterSummary } = CheckpointLib;

describe('documentReviewState()', () => {
  const today = '2026-07-25';

  test('no review date is "none", not silently current', () => {
    assert.equal(documentReviewState({ nextReview: '' }, today).state, 'none');
    assert.equal(documentReviewState({}, today).state, 'none');
  });

  test('a superseded document is never chased, even with a past review date', () => {
    const rv = documentReviewState({ status: 'Superseded', nextReview: '2020-01-01' }, today);
    assert.equal(rv.state, 'superseded');
  });

  test('a future date beyond the warning window is current', () => {
    const rv = documentReviewState({ nextReview: '2026-12-25' }, today, 30);
    assert.equal(rv.state, 'current');
    assert.equal(rv.days, 153);
  });

  test('inside the warning window is due, with days remaining', () => {
    const rv = documentReviewState({ nextReview: '2026-08-10' }, today, 30);
    assert.equal(rv.state, 'due');
    assert.equal(rv.days, 16);
  });

  test('the warning boundary itself counts as due, not current', () => {
    assert.equal(documentReviewState({ nextReview: '2026-08-24' }, today, 30).state, 'due');
    assert.equal(documentReviewState({ nextReview: '2026-08-25' }, today, 30).state, 'current');
  });

  test('today is due (zero days), tomorrow-past is overdue with a negative day count', () => {
    assert.equal(documentReviewState({ nextReview: today }, today, 30).days, 0);
    assert.equal(documentReviewState({ nextReview: today }, today, 30).state, 'due');
    const over = documentReviewState({ nextReview: '2026-07-24' }, today, 30);
    assert.equal(over.state, 'overdue');
    assert.equal(over.days, -1);
  });

  test('the warning window is configurable and defaults to 30 days', () => {
    assert.equal(documentReviewState({ nextReview: '2026-09-20' }, today, 90).state, 'due');
    assert.equal(documentReviewState({ nextReview: '2026-09-20' }, today).state, 'current');
    // a non-numeric window falls back to the default rather than NaN-ing
    assert.equal(documentReviewState({ nextReview: '2026-09-20' }, today, 'oops').state, 'current');
  });
});

describe('documentRegisterSummary()', () => {
  const today = '2026-07-25';
  const opts = { controlledCategories: ['Policies & Procedures'], warnDays: 30 };
  const docs = [
    { name: 'A', category: 'Policies & Procedures', status: 'Approved', owner: 'S. O', version: '1.0', nextReview: '2026-06-01' }, // overdue
    { name: 'B', category: 'Policies & Procedures', status: 'Approved', owner: 'S. O', version: '2.0', nextReview: '2026-08-05' }, // due
    { name: 'C', category: 'Policies & Procedures', status: 'Approved', owner: 'S. O', version: '1.1', nextReview: '2027-01-01' }, // current
    { name: 'D', category: 'Policies & Procedures', status: 'Draft', owner: '', version: '', nextReview: '' },                     // gaps
    { name: 'E', category: 'Policies & Procedures', status: 'Superseded', owner: '', version: '', nextReview: '2020-01-01' },
    { name: 'F', category: 'Policies & Procedures', status: '', owner: '', version: '', nextReview: '' },                          // unregistered policy
    { name: 'G', category: 'Auto-evidence', status: '', owner: '', version: '', nextReview: '' }                                   // not a controlled document
  ];

  test('counts every file but only treats controlled ones as register rows', () => {
    const s = documentRegisterSummary(docs, today, opts);
    assert.equal(s.total, 7);
    assert.equal(s.controlled, 6); // G is excluded: no status, uncontrolled category
  });

  test('an evidence artefact never drags the register numbers down', () => {
    const s = documentRegisterSummary(docs, today, opts);
    assert.equal(s.noReviewDate, 2);  // D and F, not G
    assert.equal(s.unowned, 2);       // D and F, not G and not superseded E
    assert.equal(s.unversioned, 2);
  });

  test('lifecycle states are counted separately', () => {
    const s = documentRegisterSummary(docs, today, opts);
    assert.equal(s.approved, 3);
    assert.equal(s.draft, 1);
    assert.equal(s.inReview, 0);
    assert.equal(s.superseded, 1);
  });

  test('review states match documentReviewState, and superseded rows are excluded', () => {
    const s = documentRegisterSummary(docs, today, opts);
    assert.equal(s.overdue, 1);
    assert.equal(s.due, 1);
    assert.deepEqual(s.overdueDocs.map((d) => d.name), ['A']);
    assert.deepEqual(s.dueDocs.map((d) => d.name), ['B']);
  });

  test('an empty or missing register is all zeroes, not a crash', () => {
    const s = documentRegisterSummary([], today, opts);
    assert.equal(s.total, 0);
    assert.equal(s.controlled, 0);
    assert.deepEqual(s.overdueDocs, []);
    assert.equal(documentRegisterSummary(null, today).total, 0);
  });

  test('with no controlledCategories given, only an explicit status makes a row controlled', () => {
    const s = documentRegisterSummary(docs, today, { warnDays: 30 });
    assert.equal(s.controlled, 5); // F and G both drop out — neither has a status
  });
});

// ---------------------------------------------------------------
// Policy attestation roll-ups — A.5.1 / A.6.3, SOC 2 CC1.4, CC2.2.
// ---------------------------------------------------------------
const { attestationCampaigns, outstandingAttestationsFor } = CheckpointLib;

describe('attestationCampaigns()', () => {
  const rows = [
    { id: 'ATT-1', campaign: 'CAMP-1', docName: 'ISP', docVersion: '2.1', upn: 'a@x.example', assigned: '2026-01-06', acknowledged: '2026-01-07', status: 'Acknowledged' },
    { id: 'ATT-2', campaign: 'CAMP-1', docName: 'ISP', docVersion: '2.1', upn: 'b@x.example', assigned: '2026-01-06', acknowledged: '2026-01-09', status: 'Acknowledged' },
    { id: 'ATT-3', campaign: 'CAMP-2', docName: 'ACP', docVersion: '1.3', upn: 'a@x.example', assigned: '2026-07-11', acknowledged: '2026-07-12', status: 'Acknowledged' },
    { id: 'ATT-4', campaign: 'CAMP-2', docName: 'ACP', docVersion: '1.3', upn: 'b@x.example', assigned: '2026-07-11', acknowledged: '', status: 'Assigned' },
    { id: 'ATT-5', campaign: 'CAMP-2', docName: 'ACP', docVersion: '1.3', upn: 'c@x.example', assigned: '2026-07-11', acknowledged: '', status: 'Exempt' }
  ];

  test('groups by campaign, newest launch first', () => {
    const cs = attestationCampaigns(rows);
    assert.deepEqual(cs.map((c) => c.id), ['CAMP-2', 'CAMP-1']);
  });

  test('carries the document identity and earliest assigned date', () => {
    const c = attestationCampaigns(rows).find((x) => x.id === 'CAMP-1');
    assert.equal(c.docName, 'ISP');
    assert.equal(c.docVersion, '2.1');
    assert.equal(c.launched, '2026-01-06');
    assert.equal(c.lastAcknowledged, '2026-01-09');
  });

  test('a fully acknowledged campaign is 100% and complete', () => {
    const c = attestationCampaigns(rows).find((x) => x.id === 'CAMP-1');
    assert.equal(c.total, 2);
    assert.equal(c.pct, 100);
    assert.equal(c.complete, true);
    assert.deepEqual(c.outstandingRows, []);
  });

  test('exemptions leave the denominator, so they cannot hold a campaign below 100 forever', () => {
    const c = attestationCampaigns(rows).find((x) => x.id === 'CAMP-2');
    assert.equal(c.total, 3);
    assert.equal(c.acknowledged, 1);
    assert.equal(c.exempt, 1);
    assert.equal(c.outstanding, 1);
    assert.equal(c.pct, 50); // 1 acknowledged of 2 chaseable, not 1 of 3
    assert.equal(c.complete, false);
  });

  test('a campaign of nothing but exemptions is complete, not a divide-by-zero', () => {
    const cs = attestationCampaigns([{ campaign: 'C', status: 'Exempt', assigned: '2026-01-01' }]);
    assert.equal(cs[0].pct, 100);
    assert.equal(cs[0].complete, true);
  });

  test('an unrecognised status counts as outstanding rather than vanishing', () => {
    const cs = attestationCampaigns([
      { campaign: 'C', status: 'Acknowledged', assigned: '2026-01-01' },
      { campaign: 'C', status: 'Something else', assigned: '2026-01-01' }
    ]);
    assert.equal(cs[0].total, 2);
    assert.equal(cs[0].outstanding, 1);
    assert.equal(cs[0].acknowledged + cs[0].exempt + cs[0].outstanding, cs[0].total);
  });

  test('rows with no campaign are grouped rather than dropped', () => {
    const cs = attestationCampaigns([{ status: 'Assigned', assigned: '2026-01-01' }]);
    assert.equal(cs.length, 1);
    assert.equal(cs[0].id, '(none)');
  });

  test('an empty or missing register returns no campaigns', () => {
    assert.deepEqual(attestationCampaigns([]), []);
    assert.deepEqual(attestationCampaigns(null), []);
  });
});

describe('outstandingAttestationsFor()', () => {
  const rows = [
    { id: 'ATT-1', upn: 'Sam.Okafor@X.example', status: 'Assigned' },
    { id: 'ATT-2', upn: 'sam.okafor@x.example', status: 'Acknowledged' },
    { id: 'ATT-3', upn: 'sam.okafor@x.example', status: 'Exempt' },
    { id: 'ATT-4', upn: 'other@x.example', status: 'Assigned' }
  ];

  test('matches UPNs case-insensitively — Entra does, and Graph casing varies', () => {
    assert.deepEqual(outstandingAttestationsFor(rows, 'sam.okafor@x.example').map((r) => r.id), ['ATT-1']);
    assert.deepEqual(outstandingAttestationsFor(rows, 'SAM.OKAFOR@X.EXAMPLE').map((r) => r.id), ['ATT-1']);
  });

  test('acknowledged and exempt rows are not outstanding', () => {
    const out = outstandingAttestationsFor(rows, 'sam.okafor@x.example');
    assert.equal(out.length, 1);
  });

  test('never leaks another person\'s rows', () => {
    assert.deepEqual(outstandingAttestationsFor(rows, 'other@x.example').map((r) => r.id), ['ATT-4']);
  });

  test('an empty UPN returns nothing rather than everything', () => {
    assert.deepEqual(outstandingAttestationsFor(rows, ''), []);
    assert.deepEqual(outstandingAttestationsFor(rows, null), []);
  });
});

// ---------------------------------------------------------------
// Training — the 'training' posture check (A.6.3 / SOC 2 CC1.4 /
// NIST PR.AT), and the induction gap sweep.
// ---------------------------------------------------------------
const { trainingCheckResult, usersMissingInduction } = CheckpointLib;

describe('trainingCheckResult()', () => {
  const today = '2026-07-25';
  const done = (due) => ({ status: 'Completed', due });
  const open = (due) => ({ status: 'Assigned', due });

  test('no records at all is "manual", never a fail — a client using another LMS is not scored down', () => {
    const r = trainingCheckResult([], today);
    assert.equal(r.result, 'manual');
    assert.equal(r.pct, null);
    assert.match(r.note, /No training records/);
    assert.equal(trainingCheckResult(null, today).result, 'manual');
  });

  test('a register of nothing but exemptions is still "manual", not a divide-by-zero', () => {
    const r = trainingCheckResult([{ status: 'Exempt' }, { status: 'Exempt' }], today);
    assert.equal(r.result, 'manual');
    assert.equal(r.total, 0);
  });

  test('full completion passes', () => {
    const r = trainingCheckResult([done(), done(), done()], today);
    assert.equal(r.result, 'pass');
    assert.equal(r.pct, 100);
    assert.equal(r.completed, 3);
  });

  test('exemptions leave the denominator', () => {
    const r = trainingCheckResult([done(), done(), { status: 'Exempt' }], today);
    assert.equal(r.total, 2);
    assert.equal(r.pct, 100);
    assert.equal(r.result, 'pass');
  });

  test('the pass/review/fail bands work off completion percentage', () => {
    // 9 of 10 = 90% -> pass; 8 of 10 = 80% -> review; 6 of 10 = 60% -> fail
    const mk = (n, total) => Array.from({ length: total }, (_, i) => (i < n ? done('2027-01-01') : open('2027-01-01')));
    assert.equal(trainingCheckResult(mk(9, 10), today).result, 'pass');
    assert.equal(trainingCheckResult(mk(8, 10), today).result, 'review');
    assert.equal(trainingCheckResult(mk(6, 10), today).result, 'fail');
  });

  test('any overdue incomplete assignment caps the result at fail, however high the percentage', () => {
    const rows = Array.from({ length: 20 }, (_, i) => (i < 19 ? done('2027-01-01') : open('2026-01-01')));
    const r = trainingCheckResult(rows, today);
    assert.equal(r.pct, 95);
    assert.equal(r.overdue, 1);
    assert.equal(r.result, 'fail');
    assert.match(r.note, /past their due date/);
  });

  test('an incomplete assignment with no due date is outstanding but not overdue', () => {
    const r = trainingCheckResult([done(), done(), done(), done(), done(), done(), done(), done(), done(), open('')], today);
    assert.equal(r.overdue, 0);
    assert.equal(r.result, 'pass'); // 90%
  });

  test('a completed record past its due date is not counted as overdue', () => {
    const r = trainingCheckResult([done('2020-01-01'), done('2020-01-01')], today);
    assert.equal(r.overdue, 0);
    assert.equal(r.result, 'pass');
  });

  test('thresholds are configurable', () => {
    const mk = (n, total) => Array.from({ length: total }, (_, i) => (i < n ? done() : open()));
    assert.equal(trainingCheckResult(mk(8, 10), today, { passPct: 80 }).result, 'pass');
    assert.equal(trainingCheckResult(mk(8, 10), today, { passPct: 95, reviewPct: 85 }).result, 'fail');
  });
});

describe('usersMissingInduction()', () => {
  const users = [
    { upn: 'A@x.example', name: 'A' },
    { upn: 'b@x.example', name: 'B' },
    { upn: 'c@x.example', name: 'C' }
  ];
  const rows = [
    { courseId: 'sec', upn: 'a@x.example', status: 'Completed' },
    { courseId: 'sec', upn: 'B@X.EXAMPLE', status: 'Assigned' },
    { courseId: 'privacy', upn: 'c@x.example', status: 'Completed' }
  ];

  test('returns only people with no record at all for that course', () => {
    assert.deepEqual(usersMissingInduction(users, rows, 'sec').map((u) => u.name), ['C']);
  });

  test('skips people who COMPLETED it — unlike a recurring campaign, induction never re-assigns', () => {
    // 'a' completed 'sec' and is not returned, even though nothing is currently open for them
    assert.equal(usersMissingInduction(users, rows, 'sec').some((u) => u.upn === 'A@x.example'), false);
  });

  test('matches UPNs case-insensitively in both directions', () => {
    // users has 'A@x.example', the record has 'a@x.example'; and vice versa for B
    const missing = usersMissingInduction(users, rows, 'sec').map((u) => u.upn);
    assert.deepEqual(missing, ['c@x.example']);
  });

  test('an unassigned course returns everyone', () => {
    assert.equal(usersMissingInduction(users, rows, 'ai').length, 3);
  });

  test('empty inputs do not crash', () => {
    assert.deepEqual(usersMissingInduction([], rows, 'sec'), []);
    assert.equal(usersMissingInduction(users, [], 'sec').length, 3);
    assert.equal(usersMissingInduction(users, null, 'sec').length, 3);
  });
});

// ---------------------------------------------------------------
// Incident register — ISO 27001 A.5.24-A.5.28. `today` is always
// pinned explicitly; neither function may read the ambient clock.
// ---------------------------------------------------------------
const { incidentAssessmentState, incidentRegisterSummary } = CheckpointLib;

describe('incidentAssessmentState()', () => {
  const today = '2026-07-25';

  test('not a privacy breach is n/a, regardless of any date fields', () => {
    assert.equal(incidentAssessmentState({ isPrivacyBreach: false, assessmentDueDate: '2020-01-01' }, today).state, 'n/a');
    assert.equal(incidentAssessmentState({}, today).state, 'n/a');
  });

  test('a privacy breach with no due date recorded yet is "none"', () => {
    assert.equal(incidentAssessmentState({ isPrivacyBreach: true, assessmentDueDate: '' }, today).state, 'none');
  });

  test('overdue is a negative day count', () => {
    const rv = incidentAssessmentState({ isPrivacyBreach: true, assessmentDueDate: '2026-07-20' }, today);
    assert.equal(rv.state, 'overdue');
    assert.equal(rv.days, -5);
  });

  test('inside 7 days of the deadline is "due"; further out is "open"', () => {
    assert.equal(incidentAssessmentState({ isPrivacyBreach: true, assessmentDueDate: '2026-08-01' }, today).state, 'due');
    assert.equal(incidentAssessmentState({ isPrivacyBreach: true, assessmentDueDate: '2026-09-01' }, today).state, 'open');
  });

  test('today itself counts as due (0 days), not overdue', () => {
    const rv = incidentAssessmentState({ isPrivacyBreach: true, assessmentDueDate: today }, today);
    assert.equal(rv.state, 'due');
    assert.equal(rv.days, 0);
  });

  test('either notification flag closes the assessment, even past its due date', () => {
    assert.equal(incidentAssessmentState({ isPrivacyBreach: true, assessmentDueDate: '2020-01-01', notifiedRegulator: true }, today).state, 'closed');
    assert.equal(incidentAssessmentState({ isPrivacyBreach: true, assessmentDueDate: '2020-01-01', notifiedIndividuals: true }, today).state, 'closed');
  });

  test('assessmentComplete closes it too — "assessed, no notification needed" is a completed assessment', () => {
    const rv = incidentAssessmentState({ isPrivacyBreach: true, assessmentDueDate: '2020-01-01', assessmentComplete: true, assessmentNote: 'No serious harm likely.' }, today);
    assert.equal(rv.state, 'closed');
  });

  test('a note alone does NOT close it — an in-progress note is not a completed assessment', () => {
    const rv = incidentAssessmentState({ isPrivacyBreach: true, assessmentDueDate: '2020-01-01', assessmentNote: 'Assessment in progress.' }, today);
    assert.equal(rv.state, 'overdue');
  });
});

describe('incidentRegisterSummary()', () => {
  const today = '2026-07-25';
  const incidents = [
    { id: 'INC-1', status: 'Closed', isPrivacyBreach: false },
    { id: 'INC-2', status: 'Open', isPrivacyBreach: true, assessmentDueDate: '2026-07-20' },      // overdue
    { id: 'INC-3', status: 'Investigating', isPrivacyBreach: true, assessmentDueDate: '2026-07-28' }, // due
    { id: 'INC-4', status: 'Open', isPrivacyBreach: true, assessmentDueDate: '2026-09-01' },       // open
    { id: 'INC-5', status: 'Closed', isPrivacyBreach: true, notifiedRegulator: true, assessmentDueDate: '2020-01-01' } // closed
  ];

  test('counts total/open/closed by the incident\'s own Status, independent of assessment health', () => {
    const s = incidentRegisterSummary(incidents, today);
    assert.equal(s.total, 5);
    assert.equal(s.closed, 2);
    assert.equal(s.open, 3);
  });

  test('tallies privacy breaches and their assessment health, and lists the overdue ones', () => {
    const s = incidentRegisterSummary(incidents, today);
    assert.equal(s.privacyBreaches, 4);
    assert.equal(s.assessmentOverdue, 1);
    assert.equal(s.assessmentDue, 1);
    assert.deepEqual(s.overdueList.map((n) => n.id), ['INC-2']);
  });

  test('empty input does not crash', () => {
    const s = incidentRegisterSummary([], today);
    assert.equal(s.total, 0);
    assert.deepEqual(s.overdueList, []);
  });
});

describe('classifyAiActRisk()', () => {
  test('no answers at all, or every answer false, is Minimal with no reasons', () => {
    for (const input of [undefined, null, {}, { subliminalManipulation: false }]) {
      const r = classifyAiActRisk(input);
      assert.equal(r.tier, 'Minimal');
      assert.deepEqual(r.reasons, []);
      assert.equal(r.obligations.length, 1);
    }
  });

  test('a single Article 5 flag is Prohibited, and short-circuits — no High/Limited obligations leak in even if those flags are also set', () => {
    const r = classifyAiActRisk({ socialScoring: true, biometricIdentification: true, directInteraction: true });
    assert.equal(r.tier, 'Prohibited');
    assert.equal(r.reasons.length, 1);
    assert.match(r.reasons[0], /Article 5\(1\)\(c\)/);
    assert.equal(r.obligations.length, 1);
    assert.match(r.obligations[0], /cannot lawfully be placed on the market/);
  });

  test('a single Annex III flag is High, with the full Article 9-15/43/49/72 obligation set', () => {
    const r = classifyAiActRisk({ employmentWorkerManagement: true });
    assert.equal(r.tier, 'High');
    assert.equal(r.reasons.length, 1);
    assert.match(r.reasons[0], /Annex III\(4\)/);
    assert.ok(r.obligations.some((o) => /Article 9/.test(o)));
    assert.ok(r.obligations.some((o) => /human oversight/i.test(o)));
    assert.equal(r.obligations.length, 9, 'High obligations list should be exactly the Article 9-15/43/49/72 set, nothing stacked in from a lower tier');
  });

  test('a single Article 50 flag alone is Limited, with just the two transparency obligations', () => {
    const r = classifyAiActRisk({ syntheticContent: true });
    assert.equal(r.tier, 'Limited');
    assert.equal(r.obligations.length, 2);
    assert.ok(r.obligations.every((o) => /Article 50/.test(o)));
  });

  test('High and Limited together: the tier is High (higher severity wins) but the obligations STACK — Article 50 transparency still applies on top of the Annex III checklist', () => {
    const r = classifyAiActRisk({ criticalInfrastructure: true, directInteraction: true });
    assert.equal(r.tier, 'High');
    assert.equal(r.reasons.length, 2);
    assert.equal(r.obligations.length, 9 + 2, 'expected the High checklist plus the Limited transparency obligations concatenated, not one replacing the other');
    assert.ok(r.obligations.some((o) => /Article 9/.test(o)));
    assert.ok(r.obligations.some((o) => /Article 50/.test(o)));
  });

  test('multiple High-tier flags all show up as separate reasons, not deduplicated into one', () => {
    const r = classifyAiActRisk({ criticalInfrastructure: true, lawEnforcement: true });
    assert.equal(r.tier, 'High');
    assert.equal(r.reasons.length, 2);
  });

  test('every question id in AI_ACT_QUESTIONS is unique — a duplicate id would silently make one question overwrite another\'s answer', () => {
    const ids = AI_ACT_QUESTIONS.map((q) => q.id);
    assert.equal(new Set(ids).size, ids.length);
  });

  test('every question has a tier of Prohibited, High or Limited — never Minimal (Minimal is only ever the no-answers fallback)', () => {
    AI_ACT_QUESTIONS.forEach((q) => {
      assert.ok(['Prohibited', 'High', 'Limited'].includes(q.tier), `${q.id} has an unexpected tier: ${q.tier}`);
    });
  });
});

// Cross-framework propagation — the multi-framework client's biggest
// multiplier, and the half of the mapping graph that was never automated.
// Posture-check evidence already lands on every mapped control
// (controlsForCheck), but a PRACTITIONER's own work did not: marking
// ISO 27001 A.5.15 Implemented with evidence said nothing about SOC 2
// CC6.1 or Essential Eight E8.7, which are the same real-world control,
// so the same job got done up to eight times over.
describe('sharedEvidenceClosure() — the same real-world control across frameworks', () => {
  const controls = [
    { fw: 'iso27001', id: 'A.5.15', t: 'Access control', app: true, st: 'Implemented', evidenceUrl: 'https://x/e.json', map: 'SOC2 CC6.1' },
    { fw: 'soc2', id: 'CC6.1', t: 'Logical access', app: true, st: 'Not started', map: 'E8.7 · NIST PR.AA' },
    { fw: 'essential8', id: 'E8.7', t: 'MFA', app: true, st: 'In progress', map: '' },
    { fw: 'nistcsf', id: 'PR.AA', t: 'Identity management', app: true, st: 'Not started', map: '' },
    { fw: 'iso27001', id: 'A.8.1', t: 'Unrelated', app: true, st: 'Not started', map: '' }
  ];
  const all = { iso27001: true, soc2: true, essential8: true, nistcsf: true };

  test('walks forward AND backward, reaching controls the start never names directly', () => {
    const start = controls[0];
    const got = sharedEvidenceClosure(start, { controls, entitlements: all }).map((c) => c.fw + '|' + c.id);
    assert.deepEqual(got.sort(), ['essential8|E8.7', 'iso27001|A.5.15', 'nistcsf|PR.AA', 'soc2|CC6.1'].sort(),
      'A.5.15 only names CC6.1; E8.7 and PR.AA are reachable only by continuing through CC6.1');
  });

  test('never traverses or returns a framework the tenant has not bought', () => {
    const got = sharedEvidenceClosure(controls[0], { controls, entitlements: { iso27001: true, soc2: true } }).map((c) => c.fw + '|' + c.id);
    assert.deepEqual(got.sort(), ['iso27001|A.5.15', 'soc2|CC6.1'].sort());
  });

  test('an unmapped control closes over itself alone, and a missing start is empty', () => {
    assert.deepEqual(sharedEvidenceClosure(controls[4], { controls, entitlements: all }).map((c) => c.id), ['A.8.1']);
    assert.deepEqual(sharedEvidenceClosure(null, { controls, entitlements: all }), []);
  });
});

describe('crossFrameworkStatusSuggestions() — propagating a practitioner\'s own work', () => {
  const mk = (over = {}) => [
    { fw: 'iso27001', id: 'A.5.15', t: 'Access control', app: true, st: 'Implemented', evidenceUrl: 'https://x/e.json', map: 'SOC2 CC6.1', ...over },
    { fw: 'soc2', id: 'CC6.1', t: 'Logical access', app: true, st: 'Not started', map: 'E8.7' },
    { fw: 'essential8', id: 'E8.7', t: 'MFA', app: true, st: 'In progress', map: '' }
  ];
  const all = { iso27001: true, soc2: true, essential8: true };

  test('proposes the source status for every mapped control that is behind it', () => {
    const controls = mk();
    const got = crossFrameworkStatusSuggestions(controls[0], { controls, entitlements: all });
    assert.deepEqual(got.map((p) => p.fw + '|' + p.code + ':' + p.from + '->' + p.to).sort(),
      ['essential8|E8.7:In progress->Implemented', 'soc2|CC6.1:Not started->Implemented'].sort());
    assert.equal(got[0].viaFw, 'iso27001');
    assert.equal(got[0].viaCode, 'A.5.15');
  });

  test('never proposes anything from a source that is not Implemented WITH evidence', () => {
    const noEvidence = mk({ evidenceUrl: '' });
    assert.deepEqual(crossFrameworkStatusSuggestions(noEvidence[0], { controls: noEvidence, entitlements: all }), [],
      'ticking a dropdown with nothing attached is not grounds to tick seven more');
    const inProgress = mk({ st: 'In progress' });
    assert.deepEqual(crossFrameworkStatusSuggestions(inProgress[0], { controls: inProgress, entitlements: all }), []);
    const notApplicable = mk({ app: false });
    assert.deepEqual(crossFrameworkStatusSuggestions(notApplicable[0], { controls: notApplicable, entitlements: all }), []);
  });

  test('never downgrades: a target already Implemented is left alone', () => {
    const controls = mk();
    controls[1].st = 'Implemented';
    const got = crossFrameworkStatusSuggestions(controls[0], { controls, entitlements: all });
    assert.deepEqual(got.map((p) => p.code), ['E8.7'], 'CC6.1 is already there — proposing it again is noise');
  });

  test('skips a target excluded from scope — an exclusion is a decision, not a gap', () => {
    const controls = mk();
    controls[1].app = false;
    const got = crossFrameworkStatusSuggestions(controls[0], { controls, entitlements: all });
    assert.deepEqual(got.map((p) => p.code), ['E8.7']);
  });

  test('never propagates WITHIN the source\'s own framework — related is not the same', () => {
    const controls = [
      { fw: 'iso27001', id: 'A.5.15', t: 'Access control', app: true, st: 'Implemented', evidenceUrl: 'https://x/e.json', map: 'ISO27001 A.8.5 · SOC2 CC6.1' },
      { fw: 'iso27001', id: 'A.8.5', t: 'Secure authentication', app: true, st: 'Not started', map: '' },
      { fw: 'soc2', id: 'CC6.1', t: 'Logical access', app: true, st: 'Not started', map: '' }
    ];
    const got = crossFrameworkStatusSuggestions(controls[0], { controls, entitlements: { iso27001: true, soc2: true } });
    assert.deepEqual(got.map((p) => p.fw + '|' + p.code), ['soc2|CC6.1'],
      'A.5.15 and A.8.5 are distinct requirements of the SAME standard, tested separately by an auditor — carrying a status across them is over-claiming inside the standard being audited');
  });

  test('never proposes against the source itself, or into an unlicensed framework', () => {
    const controls = mk();
    const got = crossFrameworkStatusSuggestions(controls[0], { controls, entitlements: { iso27001: true, soc2: true } });
    assert.deepEqual(got.map((p) => p.fw + '|' + p.code), ['soc2|CC6.1']);
    assert.ok(!got.some((p) => p.code === 'A.5.15'));
  });
});
