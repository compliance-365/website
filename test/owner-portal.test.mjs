// Fixture-based tests for the owner console's pure analytics functions
// (public/checkpoint/lib.js) — revenue math over PartnerEntitlements x
// PartnerPrices, and the "next best module" cross-mapped-readiness
// computation. Both are dual-exported (browser + Node) exactly like
// every other pure function in lib.js, so they're testable here without
// booting owner.js or touching Graph/SharePoint at all.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import CheckpointLib from '../public/checkpoint/lib.js';

const {
  latestEntitlementsByTenant, computePartnerRevenue, computeNextBestModule, computeClientHealth,
  buildClientIssuancePlan, findDuplicateTenantClient, isValidTenantIdentifier, addMonthsToDateStr,
  computeClientChecklist, entitlementAnnualValue
} = CheckpointLib;

describe('entitlementAnnualValue() — per-client cost view', () => {
  test('sums the list price of every module in the entitlement', () => {
    assert.equal(entitlementAnnualValue(['iso27001', 'soc2'], { iso27001: 0, soc2: 5000 }), 5000);
  });
  test('a module with no price on file counts as $0, never throws', () => {
    assert.equal(entitlementAnnualValue(['nistcsf'], {}), 0);
  });
  test('no modules -> $0', () => {
    assert.equal(entitlementAnnualValue([], { soc2: 5000 }), 0);
    assert.equal(entitlementAnnualValue(null, { soc2: 5000 }), 0);
  });
});

describe('latestEntitlementsByTenant()', () => {
  test('picks the entitlement with the latest issuedAt per tenant', () => {
    var old = { tenantId: 't-1', issuedAt: '2024-01-01', modules: ['iso27001'] };
    var renewed = { tenantId: 't-1', issuedAt: '2025-06-01', modules: ['iso27001', 'soc2'] };
    var result = latestEntitlementsByTenant([old, renewed]);
    assert.equal(result['t-1'], renewed);
  });

  test('order of input does not affect the outcome', () => {
    var old = { tenantId: 't-1', issuedAt: '2024-01-01' };
    var renewed = { tenantId: 't-1', issuedAt: '2025-06-01' };
    assert.equal(latestEntitlementsByTenant([renewed, old])['t-1'], renewed);
    assert.equal(latestEntitlementsByTenant([old, renewed])['t-1'], renewed);
  });

  test('entries without a tenantId are ignored, never crash', () => {
    var result = latestEntitlementsByTenant([{ issuedAt: '2025-01-01' }, null, undefined]);
    assert.deepEqual(Object.keys(result), []);
  });
});

describe('computePartnerRevenue() — fixture-based', () => {
  var today = '2026-01-01';
  var prices = { iso27001: 0, soc2: 5000, essential8: 3000, iso42001: 8000 };

  var entitlements = [
    // Tenant A: comfortably committed (expiry >16 months out)
    { tenantId: 'a', type: 'client', modules: ['iso27001', 'soc2'], issuedAt: '2025-01-01', expiry: '2027-06-01' },
    // Tenant B: expiring in 59 days, not yet renewed — at risk this
    // year, but NOT in the 30-day cash-flow figure
    { tenantId: 'b', type: 'client', modules: ['iso27001', 'essential8'], issuedAt: '2025-01-01', expiry: '2026-03-01' },
    // Tenant C: expiring in 19 days, not yet renewed — at risk AND in
    // the 30-day figure
    { tenantId: 'c', type: 'client', modules: ['soc2'], issuedAt: '2025-01-01', expiry: '2026-01-20' },
    // Tenant D: expiring in 14 days, but ALREADY renewed (renewedBy
    // set) — must count as committed, not as at-risk/30-day cash flow
    { tenantId: 'd', type: 'client', modules: ['soc2', 'essential8'], issuedAt: '2025-01-01', expiry: '2026-01-15', renewedBy: 'sp-999' },
    // Tenant E: already expired before `today` — excluded entirely
    { tenantId: 'e', type: 'client', modules: ['soc2'], issuedAt: '2024-06-01', expiry: '2025-06-01' },
    // Tenant F: an active sales trial — pipeline only, never booked revenue
    { tenantId: 'f', type: 'demo', modules: ['soc2', 'iso42001'], issuedAt: '2025-12-01', expiry: '2026-02-01' },
    // Tenant G: Compliance365's own partner-type activation — never revenue
    { tenantId: 'g', type: 'partner', modules: ['soc2', 'essential8', 'iso42001'], issuedAt: '2025-01-01', expiry: '2030-01-01' }
  ];

  var revenue = computePartnerRevenue(entitlements, prices, today);

  test('activeAnnualRevenue sums only active, latest, client-type entitlements (A+B+C+D)', () => {
    assert.equal(revenue.activeAnnualRevenue, 5000 + 3000 + 5000 + 8000);
  });

  test('expired entitlements are excluded entirely, not just from the "active" bucket', () => {
    // Tenant E's $5,000 must not appear anywhere.
    assert.equal(revenue.activeAnnualRevenue, 21000);
  });

  test('demo (trial) and partner entitlements never contribute to activeAnnualRevenue', () => {
    assert.equal(revenue.activeAnnualRevenue, 21000); // no $13,000 (F) or $16,000 (G) mixed in
  });

  test('revenueByModule breaks the same active revenue down per module', () => {
    assert.deepEqual(revenue.revenueByModule, { iso27001: 0, soc2: 15000, essential8: 6000 });
  });

  test('committedNext12Months + expiringUnrenewed always equals activeAnnualRevenue', () => {
    assert.equal(revenue.committedNext12Months + revenue.expiringUnrenewed, revenue.activeAnnualRevenue);
  });

  test('committedNext12Months: far-out expiry (A) + already-renewed-despite-soon-expiry (D)', () => {
    assert.equal(revenue.committedNext12Months, 5000 + 8000);
  });

  test('expiringUnrenewed: soon-expiring, nothing recorded against them yet (B + C)', () => {
    assert.equal(revenue.expiringUnrenewed, 3000 + 5000);
  });

  test('expiringIn30Days (the cash-flow number): only C — B is 59 days out, D is already renewed', () => {
    assert.equal(revenue.expiringIn30Days, 5000);
  });

  test('trialPipelineValue: only the active demo entitlement (F), kept separate from booked revenue', () => {
    assert.equal(revenue.trialPipelineValue, 5000 + 8000);
  });

  test('a missing PartnerPrices entry contributes $0, never throws', () => {
    var r = computePartnerRevenue(
      [{ tenantId: 'x', type: 'client', modules: ['nistcsf'], issuedAt: '2025-01-01', expiry: '2027-01-01' }],
      {}, // no prices on file at all
      today
    );
    assert.equal(r.activeAnnualRevenue, 0);
    assert.deepEqual(r.revenueByModule, { nistcsf: 0 });
  });

  test('only the LATEST entitlement per tenant counts — an old, unexpired-looking prior issuance never double-counts', () => {
    var withHistory = entitlements.concat([
      // An older issuance for tenant A with a nearer expiry and fewer
      // modules — must be completely superseded by A's real (later
      // issuedAt) entitlement above, not summed alongside it.
      { tenantId: 'a', type: 'client', modules: ['soc2', 'essential8', 'iso42001'], issuedAt: '2023-01-01', expiry: '2026-01-10' }
    ]);
    var r = computePartnerRevenue(withHistory, prices, today);
    assert.equal(r.activeAnnualRevenue, revenue.activeAnnualRevenue, 'adding a superseded old row must not change the total');
  });
});

describe('computeNextBestModule() — fixture-based', () => {
  test('recommends the unlicensed framework with the highest cross-mapped readiness among already-implemented controls', () => {
    var controlRows = [
      // soc2: 3 of 3 cross-mapped tokens come from Implemented iso27001 controls -> 100%
      { applicable: true, status: 'Implemented', mapsTo: 'SOC2 CC6.1' },
      { applicable: true, status: 'Implemented', mapsTo: 'SOC2 CC6.2' },
      { applicable: true, status: 'Implemented', mapsTo: 'SOC2 CC6.1 · E8.7' }, // also contributes 1 essential8 token
      // nistcsf: 1 of 3 implemented -> 33%
      { applicable: true, status: 'Not started', mapsTo: 'NIST ID.RA' },
      { applicable: true, status: 'Implemented', mapsTo: 'NIST DE.CM' },
      { applicable: true, status: 'Not started', mapsTo: 'NIST GV.OC' }
    ];
    var result = computeNextBestModule(controlRows, ['iso27001']);
    assert.deepEqual(result, { moduleId: 'soc2', pct: 100, sampleSize: 3 });
  });

  test('a target framework below the minimum sample size is never recommended, even at 100%', () => {
    var controlRows = [
      { applicable: true, status: 'Implemented', mapsTo: 'E8.1' } // essential8: 1/1 = 100%, but sample of 1
    ];
    assert.equal(computeNextBestModule(controlRows, ['iso27001']), null);
  });

  test('an already-licensed target framework is never recommended, no matter how ready the client looks for it', () => {
    var controlRows = [
      { applicable: true, status: 'Implemented', mapsTo: 'SOC2 CC6.1' },
      { applicable: true, status: 'Implemented', mapsTo: 'SOC2 CC6.2' },
      { applicable: true, status: 'Implemented', mapsTo: 'SOC2 CC6.3' }
    ];
    assert.equal(computeNextBestModule(controlRows, ['iso27001', 'soc2']), null);
  });

  test('a non-applicable control never contributes, even with a mapped, implemented status', () => {
    var controlRows = [
      { applicable: false, status: 'Implemented', mapsTo: 'SOC2 CC1.1' },
      { applicable: false, status: 'Implemented', mapsTo: 'SOC2 CC1.2' },
      { applicable: false, status: 'Implemented', mapsTo: 'SOC2 CC1.3' }
    ];
    assert.equal(computeNextBestModule(controlRows, ['iso27001']), null);
  });

  test('ties on percentage break on larger sample size, then deterministically (alphabetical) on a dead tie', () => {
    var controlRows = [
      { applicable: true, status: 'Implemented', mapsTo: 'DISP.1' },
      { applicable: true, status: 'Not started', mapsTo: 'DISP.2' }, // dispirap: 1/2 = 50%
      { applicable: true, status: 'Implemented', mapsTo: 'E8.1' },
      { applicable: true, status: 'Not started', mapsTo: 'E8.2' } // essential8: 1/2 = 50%
    ];
    var result = computeNextBestModule(controlRows, ['iso27001'], 2);
    assert.equal(result.pct, 50);
    assert.equal(result.moduleId, 'dispirap', '"dispirap" sorts before "essential8" — the deterministic tie-break');
  });

  test('no controls at all -> null, never a crash', () => {
    assert.equal(computeNextBestModule([], ['iso27001']), null);
    assert.equal(computeNextBestModule(null, []), null);
  });
});

describe('computeClientHealth() — fixture-based', () => {
  var today = '2026-01-01';

  test('never synced -> "unknown", not a fabricated colour', () => {
    var r = computeClientHealth({ lastSynced: '' }, today);
    assert.equal(r.color, 'unknown');
  });

  test('a sync error is red regardless of any other signal', () => {
    var r = computeClientHealth({ lastSynced: '2026-01-01T00:00:00Z', syncError: 'HTTP 403', score: 95, driftAlerts: 0 }, today);
    assert.equal(r.color, 'red');
  });

  test('an expired activation is red', () => {
    var r = computeClientHealth({ lastSynced: '2026-01-01T00:00:00Z', entitlementStatus: 'expired', lastScanDate: '2026-01-01', score: 90 }, today);
    assert.equal(r.color, 'red');
  });

  test('dormant (no scan in 30+ days) is amber even with a good score', () => {
    var r = computeClientHealth({ lastSynced: '2026-01-01T00:00:00Z', lastScanDate: '2025-11-01', score: 95, driftAlerts: 0 }, today);
    assert.equal(r.color, 'amber');
  });

  test('recently active, healthy score, no near-term renewal risk -> green', () => {
    var r = computeClientHealth({
      lastSynced: '2026-01-01T00:00:00Z', lastScanDate: '2025-12-20', score: 88, driftAlerts: 0,
      entitlementStatus: 'valid', entitlementExpiry: '2026-12-01', manualStatus: ''
    }, today);
    assert.equal(r.color, 'green');
  });

  test('renewal due within 30 days and not yet renewed is red even if everything else looks healthy', () => {
    var r = computeClientHealth({
      lastSynced: '2026-01-01T00:00:00Z', lastScanDate: '2025-12-28', score: 92, driftAlerts: 0,
      entitlementStatus: 'valid', entitlementExpiry: '2026-01-20', manualStatus: ''
    }, today);
    assert.equal(r.color, 'red');
  });

  test('a "Renewed" manual status suppresses the imminent-renewal red/amber rules', () => {
    var r = computeClientHealth({
      lastSynced: '2026-01-01T00:00:00Z', lastScanDate: '2025-12-28', score: 92, driftAlerts: 0,
      entitlementStatus: 'valid', entitlementExpiry: '2026-01-10', manualStatus: 'Renewed'
    }, today);
    assert.equal(r.color, 'green');
  });
});

describe('isValidTenantIdentifier() — form-level sanity check, not live verification', () => {
  test('accepts a well-formed Entra tenant GUID', () => {
    assert.equal(isValidTenantIdentifier('3fa85f64-5717-4562-b3fc-2c963f66afa6'), true);
  });
  test('accepts a GUID in upper case', () => {
    assert.equal(isValidTenantIdentifier('3FA85F64-5717-4562-B3FC-2C963F66AFA6'), true);
  });
  test('accepts a verified-domain-shaped string', () => {
    assert.equal(isValidTenantIdentifier('contoso.onmicrosoft.com'), true);
    assert.equal(isValidTenantIdentifier('contoso.com'), true);
  });
  test('rejects an empty or missing value', () => {
    assert.equal(isValidTenantIdentifier(''), false);
    assert.equal(isValidTenantIdentifier(null), false);
    assert.equal(isValidTenantIdentifier(undefined), false);
  });
  test('rejects a plainly malformed value', () => {
    assert.equal(isValidTenantIdentifier('not a tenant'), false);
    assert.equal(isValidTenantIdentifier('acme'), false);
    assert.equal(isValidTenantIdentifier('almost-a-guid-1234'), false);
  });
});

describe('findDuplicateTenantClient() — duplicate-tenant warning', () => {
  var clients = [
    { _sp: '1', name: 'Acme', tenantId: 'acme.onmicrosoft.com' },
    { _sp: '2', name: 'Meridian', tenantId: '3fa85f64-5717-4562-b3fc-2c963f66afa6' }
  ];
  test('matches case-insensitively', () => {
    var hit = findDuplicateTenantClient('ACME.onmicrosoft.com', clients);
    assert.equal(hit && hit._sp, '1');
  });
  test('matches with surrounding whitespace trimmed', () => {
    var hit = findDuplicateTenantClient('  acme.onmicrosoft.com  ', clients);
    assert.equal(hit && hit._sp, '1');
  });
  test('matches a GUID tenant the same way', () => {
    var hit = findDuplicateTenantClient('3FA85F64-5717-4562-B3FC-2C963F66AFA6', clients);
    assert.equal(hit && hit._sp, '2');
  });
  test('returns null for a genuinely new tenant', () => {
    assert.equal(findDuplicateTenantClient('newclient.onmicrosoft.com', clients), null);
  });
  test('returns null for an empty tenantId, never throws', () => {
    assert.equal(findDuplicateTenantClient('', clients), null);
    assert.equal(findDuplicateTenantClient(null, []), null);
    assert.equal(findDuplicateTenantClient('x', null), null);
  });
});

describe('addMonthsToDateStr()', () => {
  test('adds whole months within the same year', () => {
    assert.equal(addMonthsToDateStr('2026-01-15', 3), '2026-04-15');
  });
  test('rolls over the year boundary', () => {
    assert.equal(addMonthsToDateStr('2026-11-01', 3), '2027-02-01');
  });
  test('supports the three issuance terms this form offers', () => {
    assert.equal(addMonthsToDateStr('2026-07-13', 12), '2027-07-13');
    assert.equal(addMonthsToDateStr('2026-07-13', 24), '2028-07-13');
    assert.equal(addMonthsToDateStr('2026-07-13', 36), '2029-07-13');
  });
});

describe('buildClientIssuancePlan() — entitlement-generation payloads', () => {
  var today = '2026-07-13';

  test('client type: builds a 12-month plan with a client-type CLI command and no --type flag', () => {
    var plan = buildClientIssuancePlan({ tenantId: 'acme.onmicrosoft.com', modules: ['soc2', 'iso27001'], termMonths: 12, type: 'client' }, today);
    assert.equal(plan.type, 'client');
    assert.deepEqual(plan.modules, ['iso27001', 'soc2'], 'modules are sorted deterministically');
    assert.equal(plan.issuedAt, today);
    assert.equal(plan.expiry, '2027-07-13');
    assert.match(plan.command, /--tenant acme\.onmicrosoft\.com/);
    assert.match(plan.command, /--frameworks iso27001,soc2/);
    assert.match(plan.command, /--expiry 2027-07-13/);
    assert.doesNotMatch(plan.command, /--type/);
    assert.match(plan.command, /--record/);
    assert.equal(plan.entitlementRecord.tenantId, 'acme.onmicrosoft.com');
    assert.equal(plan.entitlementRecord.renewsEntitlementId, '');
  });

  test('trial type: maps the form\'s "trial" to the payload/CLI\'s "demo" type', () => {
    var plan = buildClientIssuancePlan({ tenantId: 'prospect.onmicrosoft.com', modules: ['iso27001'], termMonths: 12, type: 'trial' }, today);
    assert.equal(plan.type, 'demo');
    assert.match(plan.command, /--type demo/);
    assert.equal(plan.entitlementRecord.type, 'demo');
  });

  test('renewal: carries the superseded entitlement id through to entitlementRecord.renewsEntitlementId', () => {
    var plan = buildClientIssuancePlan({ tenantId: 'acme.onmicrosoft.com', modules: ['soc2'], termMonths: 24, type: 'client', renewsEntitlementId: 'sp-42' }, today);
    assert.equal(plan.termMonths, 24);
    assert.equal(plan.expiry, '2028-07-13');
    assert.equal(plan.entitlementRecord.renewsEntitlementId, 'sp-42');
  });

  test('outFile sanitises the tenant identifier into a safe filename', () => {
    var plan = buildClientIssuancePlan({ tenantId: 'Acme Corp/../weird id', modules: [], termMonths: 12, type: 'client' }, today);
    assert.doesNotMatch(plan.outFile, /[^a-z0-9.-]/i);
    assert.match(plan.outFile, /-activation\.json$/);
  });

  test('an empty modules list produces a valid (if empty) --frameworks flag, never throws', () => {
    var plan = buildClientIssuancePlan({ tenantId: 'acme.onmicrosoft.com', modules: [], termMonths: 12, type: 'client' }, today);
    assert.match(plan.command, /--frameworks (\s|--expiry)/);
  });
});

describe('computeClientChecklist() — progress-checklist state transitions', () => {
  test('a brand-new prospect: nothing done yet', () => {
    var stages = computeClientChecklist({});
    assert.deepEqual(stages.map(function (s) { return s.done; }), [false, false, false, false]);
  });

  test('pack sent only', () => {
    var stages = computeClientChecklist({ packSentAt: '2026-07-01' });
    assert.equal(stages[0].done, true);
    assert.equal(stages[0].at, '2026-07-01');
    assert.deepEqual(stages.slice(1).map(function (s) { return s.done; }), [false, false, false]);
  });

  test('pack sent, then activated (onboarded true from a sync)', () => {
    var stages = computeClientChecklist({ packSentAt: '2026-07-01', onboarded: true, lastSynced: '2026-07-05T00:00:00Z' });
    assert.equal(stages[0].done, true);
    assert.equal(stages[1].done, true);
    assert.equal(stages[1].at, '2026-07-05T00:00:00Z');
    assert.equal(stages[2].done, false, 'no scan yet');
  });

  test('fully progressed: pack sent, activated, first scan, synced', () => {
    var stages = computeClientChecklist({
      packSentAt: '2026-07-01', onboarded: true, lastScanDate: '2026-07-06', lastSynced: '2026-07-06T00:00:00Z'
    });
    assert.deepEqual(stages.map(function (s) { return s.done; }), [true, true, true, true]);
  });

  test('activated without ever having received a pack from this console is still honest, not contradictory', () => {
    // e.g. a client who pasted an old activation file directly.
    var stages = computeClientChecklist({ onboarded: true, lastScanDate: '2026-07-06', lastSynced: '2026-07-06T00:00:00Z' });
    assert.equal(stages[0].done, false);
    assert.equal(stages[1].done, true);
  });

  test('missing/undefined input never throws', () => {
    assert.equal(computeClientChecklist(null).length, 4);
    assert.equal(computeClientChecklist(undefined).length, 4);
  });
});
