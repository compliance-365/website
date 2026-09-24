// Tests for the Defender & Purview depth scorers in lib.js — the pure
// functions behind graph.js's direct reads of Defender Vulnerability
// Management and endpoint sensor state (advanced hunting), attack
// simulation training, and sensitivity labels that apply protection.
//
// Each replaces or adds to a signal that was previously inferred from
// Secure Score control NAMES, so the boundaries are worth pinning: a
// CVE wrongly counted as overdue is a control wrongly reported failing.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import CheckpointLib from '../public/checkpoint/lib.js';

const { tvmExposureResult, edrCoverageResult, attackSimulationResult, labelProtectionResult } = CheckpointLib;

const NOW = Date.parse('2026-06-15T12:00:00Z');
const daysAgo = (n) => new Date(NOW - n * 86400000).toISOString();

describe('tvmExposureResult() — exploitable vulnerability age', () => {
  test('no exploitable critical/high CVEs passes', () => {
    const r = tvmExposureResult([], 14, NOW);
    assert.equal(r.result, 'pass');
    assert.equal(r.exploitable, 0);
  });
  test('null input does not throw', () => {
    assert.equal(tvmExposureResult(null, 14, NOW).result, 'pass');
  });
  test('an overdue critical fails', () => {
    const r = tvmExposureResult([{ CveId: 'CVE-1', Severity: 'Critical', Devices: 4, PublishedDate: daysAgo(30) }], 14, NOW);
    assert.equal(r.result, 'fail');
    assert.equal(r.criticalOverdue, 1);
    assert.deepEqual(r.worst, ['CVE-1']);
  });
  test('an overdue high with no overdue critical is a review', () => {
    const r = tvmExposureResult([
      { CveId: 'CVE-2', Severity: 'High', Devices: 1, PublishedDate: daysAgo(30) },
      { CveId: 'CVE-3', Severity: 'Critical', Devices: 1, PublishedDate: daysAgo(3) }
    ], 14, NOW);
    assert.equal(r.result, 'review');
    assert.equal(r.criticalOverdue, 0);
    assert.equal(r.highOverdue, 1);
  });
  test('everything inside the window passes — present is not the same as late', () => {
    const r = tvmExposureResult([{ CveId: 'CVE-4', Severity: 'Critical', Devices: 9, PublishedDate: daysAgo(5) }], 14, NOW);
    assert.equal(r.result, 'pass');
    assert.equal(r.exploitable, 1);
  });
  test('an unparseable published date is never counted as overdue', () => {
    const r = tvmExposureResult([{ CveId: 'CVE-5', Severity: 'Critical', PublishedDate: 'not a date' }], 14, NOW);
    assert.equal(r.result, 'pass');
  });
  test('the window is the tenant setting, not a constant', () => {
    const rows = [{ CveId: 'CVE-6', Severity: 'Critical', PublishedDate: daysAgo(3) }];
    assert.equal(tvmExposureResult(rows, 14, NOW).result, 'pass');
    assert.equal(tvmExposureResult(rows, 2, NOW).result, 'fail');
  });
});

describe('edrCoverageResult() — Defender for Endpoint sensor coverage', () => {
  test('every known device onboarded and healthy passes', () => {
    const r = edrCoverageResult({ Onboarded: 50, CanBeOnboarded: 0, Inactive: 0 }, 90);
    assert.equal(r.result, 'pass');
    assert.equal(r.coveragePct, 100);
  });
  test('a discovered device without a sensor is at best a review', () => {
    const r = edrCoverageResult({ Onboarded: 99, CanBeOnboarded: 1, Inactive: 0 }, 90);
    assert.equal(r.result, 'review');
    assert.equal(r.coveragePct, 99);
  });
  test('an inactive sensor counts against coverage', () => {
    const r = edrCoverageResult({ Onboarded: 10, CanBeOnboarded: 0, Inactive: 2 }, 90);
    assert.equal(r.coveragePct, 80);
    assert.equal(r.result, 'fail');
  });
  test('licensed but nothing onboarded fails — nothing measured is not a pass', () => {
    const r = edrCoverageResult({ Onboarded: 0, CanBeOnboarded: 0, Inactive: 0 }, 90);
    assert.equal(r.result, 'fail');
    assert.equal(r.coveragePct, null);
  });
  test('no row at all is manual', () => {
    assert.equal(edrCoverageResult(null, 90).result, 'manual');
  });
  test('coverage is floored, so 89.99% never rounds up past a 90% floor', () => {
    const r = edrCoverageResult({ Onboarded: 8999, CanBeOnboarded: 1001, Inactive: 0 }, 90);
    assert.equal(r.coveragePct, 89.9);
    assert.equal(r.result, 'fail');
  });
});

describe('attackSimulationResult() — phishing simulation cadence', () => {
  const sim = (over) => Object.assign({ id: 's1', displayName: 'Q2', status: 'succeeded', completionDateTime: daysAgo(30) }, over);
  test('never run is a review, never a fail', () => {
    const r = attackSimulationResult([], 180, 20, NOW);
    assert.equal(r.result, 'review');
    assert.equal(r.completed, 0);
  });
  test('a recent campaign under the compromise threshold passes', () => {
    const r = attackSimulationResult([sim({ report: { overview: { simulationEventsContent: { compromisedRate: 6.5 } } } })], 180, 20, NOW);
    assert.equal(r.result, 'pass');
    assert.equal(r.compromisedRate, 6.5);
  });
  test('a recent campaign over the threshold is a review', () => {
    const r = attackSimulationResult([sim({ report: { overview: { simulationEventsContent: { compromisedRate: 35 } } } })], 180, 20, NOW);
    assert.equal(r.result, 'review');
  });
  test('a campaign older than the cadence is a review', () => {
    const r = attackSimulationResult([sim({ completionDateTime: daysAgo(400) })], 180, 20, NOW);
    assert.equal(r.result, 'review');
    assert.equal(r.daysSince, 400);
  });
  test('the most recent completed campaign is the one scored', () => {
    const r = attackSimulationResult([
      sim({ id: 'old', completionDateTime: daysAgo(300) }),
      sim({ id: 'new', completionDateTime: daysAgo(10) }),
      sim({ id: 'draft', status: 'draft', completionDateTime: null })
    ], 180, 20, NOW);
    assert.equal(r.latestId, 'new');
    assert.equal(r.completed, 2);
  });
  test('a recent campaign with no readable report still passes — the campaign is the evidence', () => {
    assert.equal(attackSimulationResult([sim()], 180, 20, NOW).result, 'pass');
  });
  test('archived campaigns still count as completed', () => {
    assert.equal(attackSimulationResult([sim({ status: 'recentlyArchived' })], 180, 20, NOW).completed, 1);
  });
});

describe('labelProtectionResult() — labels that apply encryption', () => {
  test('a protecting label passes', () => {
    const r = labelProtectionResult([{ id: '1', name: 'Public', hasProtection: false }, { id: '2', name: 'Confidential', hasProtection: true }]);
    assert.equal(r.result, 'pass');
    assert.equal(r.protecting, 1);
    assert.equal(r.total, 2);
  });
  test('protection on a sublabel counts', () => {
    const r = labelProtectionResult([{ id: '1', name: 'Confidential', hasProtection: false, sublabels: [{ id: '1a', name: 'Confidential - Finance', hasProtection: true }] }]);
    assert.equal(r.result, 'pass');
    assert.deepEqual(r.names, ['Confidential - Finance']);
  });
  test('no protecting label is a review, not a fail — encryption may be applied another way', () => {
    assert.equal(labelProtectionResult([{ id: '1', hasProtection: false }]).result, 'review');
    assert.equal(labelProtectionResult([]).result, 'review');
  });
});
