// Setup health: Checkpoint checking its own setup on every sign-in, and
// reporting the status (flags only) to the owner console. The rules are
// pure (lib.js); the Lambda's health branch is exercised for what it
// will and will not accept from an unauthenticated client.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import Lib from '../public/checkpoint/lib.js';
import { shapeHealth } from '../lambda/report-error.js';

const { setupHealthChecks, setupHealthSummary, scopesFromAccessToken, matchHealthReport, computeClientHealth, SETUP_CHECK_IDS } = Lib;
const TODAY = '2026-09-25';

function healthy() {
  return {
    activation: { status: 'valid', expiry: '2027-06-30' },
    permissions: { granted: ['User.Read', 'Sites.Manage.All', 'Mail.Send'], required: ['User.Read', 'Sites.Manage.All'], optional: ['Mail.Send'] },
    lists: { total: 40, missing: [], columnsMissing: [] },
    library: { present: true, driveReady: true, columnsMissing: [] },
    packs: { licensed: ['soc2'], errors: {} },
    evidence: { checked: true, planned: 120, found: 120, errors: [] },
    scan: { lastDate: '2026-09-20', cadenceDays: '30' },
    capabilities: { unavailable: [] }
  };
}
const byId = (checks) => Object.fromEntries(checks.map((c) => [c.id, c]));

describe('setupHealthChecks()', () => {
  test('a correctly set-up tenant passes every check, in a fixed order', () => {
    const checks = setupHealthChecks(healthy(), TODAY);
    assert.deepEqual(checks.map((c) => c.id), SETUP_CHECK_IDS);
    assert.ok(checks.every((c) => c.status === 'pass'), JSON.stringify(checks.filter((c) => c.status !== 'pass')));
    assert.equal(setupHealthSummary(checks).status, 'healthy');
  });

  test('facts that could not be read are info, never a guessed pass or fail', () => {
    const checks = setupHealthChecks({}, TODAY);
    assert.ok(checks.every((c) => c.status === 'info'));
    assert.equal(setupHealthSummary(checks).status, 'healthy');
    const noScopes = byId(setupHealthChecks(Object.assign(healthy(), { permissions: { granted: null, required: ['x'] } }), TODAY));
    assert.equal(noScopes.permissions.status, 'info');
  });

  test('a missing required permission fails with the consent fix; a missing email permission only warns', () => {
    const i = healthy();
    i.permissions.granted = ['User.Read'];
    const c = byId(setupHealthChecks(i, TODAY)).permissions;
    assert.equal(c.status, 'fail');
    assert.equal(c.fix, 'openAdminConsent');
    assert.match(c.detail, /Sites\.Manage\.All/);
    const j = healthy();
    j.permissions.granted = ['user.read', 'sites.manage.all'];
    assert.equal(byId(setupHealthChecks(j, TODAY)).permissions.status, 'warn', 'case-insensitive, and Mail.Send is optional');
  });

  test('a long list of missing permissions is shortened', () => {
    const i = healthy();
    i.permissions = { granted: [], required: Array.from({ length: 10 }, (_, n) => 'P' + n + '.Read.All'), optional: [] };
    assert.match(byId(setupHealthChecks(i, TODAY)).permissions.detail, /and 4 more/);
  });

  test('missing lists or columns fail with the repair fix', () => {
    const i = healthy();
    i.lists = { total: 40, missing: ['Checkpoint Assets'], columnsMissing: [{ list: 'Checkpoint Risks', columns: ['Cia', 'ResidualL'] }] };
    const c = byId(setupHealthChecks(i, TODAY)).lists;
    assert.equal(c.status, 'fail');
    assert.equal(c.fix, 'repairSetup');
    assert.match(c.detail, /1 list missing \(Checkpoint Assets\); 2 columns missing across 1 list/);
    i.lists = { error: 'Access denied' };
    assert.equal(byId(setupHealthChecks(i, TODAY)).lists.status, 'fail');
  });

  test('the Documents library', () => {
    const i = healthy();
    i.library = { present: false };
    assert.equal(byId(setupHealthChecks(i, TODAY)).library.status, 'fail');
    i.library = { present: true, driveReady: true, columnsMissing: ['DocOwner'] };
    assert.equal(byId(setupHealthChecks(i, TODAY)).library.status, 'warn');
  });

  test('activation: expired fails, grace and near-expiry warn', () => {
    const i = healthy();
    i.activation = { status: 'expired', expiry: '2026-08-01' };
    assert.equal(byId(setupHealthChecks(i, TODAY)).activation.status, 'fail');
    i.activation = { status: 'grace', expiry: '2026-09-20', graceUntil: '2026-10-04' };
    assert.equal(byId(setupHealthChecks(i, TODAY)).activation.status, 'warn');
    i.activation = { status: 'valid', expiry: '2026-10-10' };
    assert.equal(byId(setupHealthChecks(i, TODAY)).activation.status, 'warn');
  });

  test('a licensed framework whose content failed to load fails', () => {
    const i = healthy();
    i.packs.errors = { soc2: 'key mismatch' };
    const c = byId(setupHealthChecks(i, TODAY)).packs;
    assert.equal(c.status, 'fail');
    assert.match(c.detail, /soc2 \(key mismatch\)/);
  });

  test('evidence folders, scans and capabilities never fail the setup', () => {
    const i = healthy();
    i.evidence = { checked: true, planned: 120, found: 100, errors: [] };
    i.scan = { lastDate: '2026-07-01', cadenceDays: '30' };
    i.capabilities = { unavailable: ['PIM', 'Priva'] };
    const c = byId(setupHealthChecks(i, TODAY));
    assert.equal(c.evidence.status, 'warn');
    assert.equal(c.scan.status, 'warn');
    assert.equal(c.capabilities.status, 'info');
    assert.equal(setupHealthSummary(Object.values(c)).status, 'warning');
    i.scan = { lastDate: '' };
    assert.equal(byId(setupHealthChecks(i, TODAY)).scan.fix, 'runScan');
  });

  test('dates can be formatted for display without changing the rules', () => {
    const i = healthy();
    i.fmtDate = (d) => 'D(' + d + ')';
    assert.match(byId(setupHealthChecks(i, TODAY)).activation.detail, /D\(2027-06-30\)/);
  });
});

describe('setupHealthSummary()', () => {
  test('failing beats warning, and the headline names the checks', () => {
    const s = setupHealthSummary([{ id: 'lists', label: 'SharePoint lists', status: 'fail' }, { id: 'scan', label: 'Posture scan', status: 'warn' }]);
    assert.equal(s.status, 'failing');
    assert.equal(s.headline, 'SharePoint lists');
    assert.deepEqual(s.flags, { lists: 'fail', scan: 'warn' });
  });
});

describe('scopesFromAccessToken()', () => {
  test('reads the scp claim of a JWT and rejects anything else', () => {
    const payload = Buffer.from(JSON.stringify({ scp: 'User.Read Sites.Manage.All' })).toString('base64url');
    assert.deepEqual(scopesFromAccessToken('h.' + payload + '.s'), ['User.Read', 'Sites.Manage.All']);
    assert.equal(scopesFromAccessToken('not-a-token'), null);
    assert.equal(scopesFromAccessToken(''), null);
    assert.equal(scopesFromAccessToken('h.' + Buffer.from('{"roles":[]}').toString('base64url') + '.s'), null);
  });
});

describe('matchHealthReport()', () => {
  const reports = [
    { tenantId: 'aaaaaaaa-0000-0000-0000-000000000001', domains: ['mineguard-ai.com', 'mineguard.onmicrosoft.com'], reportedAt: '2026-09-25T09:00:00Z', status: 'healthy' },
    { tenantId: 'aaaaaaaa-0000-0000-0000-000000000001', domains: [], reportedAt: '2026-09-24T09:00:00Z', status: 'failing' },
    { tenantId: 'bbbbbbbb-0000-0000-0000-000000000002', domains: ['other.com'], reportedAt: '2026-09-25T09:00:00Z', status: 'warning' }
  ];
  test('matches a roster row by GUID or by any verified domain, newest report wins', () => {
    assert.equal(matchHealthReport({ tenantId: 'AAAAAAAA-0000-0000-0000-000000000001' }, reports).status, 'healthy');
    assert.equal(matchHealthReport({ tenantId: 'MineGuard-AI.com' }, reports).status, 'healthy');
    assert.equal(matchHealthReport({ tenantId: 'nobody.com' }, reports), null);
    assert.equal(matchHealthReport({ tenantId: '' }, reports), null);
  });
});

describe('computeClientHealth() with setup reports', () => {
  const base = { lastSynced: '2026-09-20', lastScanDate: '2026-09-20', score: 80 };
  test('unchanged when no report exists', () => {
    assert.deepEqual(computeClientHealth(base, TODAY), { color: 'green', reason: 'Healthy' });
    assert.equal(computeClientHealth({}, TODAY).color, 'unknown');
  });
  test('a failing setup is red, a warning is amber', () => {
    assert.equal(computeClientHealth(Object.assign({ setupStatus: 'failing', setupReason: 'SharePoint lists', lastSeen: '2026-09-25T00:00:00Z' }, base), TODAY).color, 'red');
    assert.equal(computeClientHealth(Object.assign({ setupStatus: 'warning', lastSeen: '2026-09-25T00:00:00Z' }, base), TODAY).color, 'amber');
  });
  test('a report alone is enough to know something about a never-synced client', () => {
    const h = computeClientHealth({ setupStatus: 'healthy', lastSeen: '2026-09-25T00:00:00Z', lastScanDate: '2026-09-22' }, TODAY);
    assert.equal(h.color, 'green');
  });
  test('a client that has not opened Checkpoint in 30+ days is amber', () => {
    assert.equal(computeClientHealth(Object.assign({ setupStatus: 'healthy', lastSeen: '2026-07-01T00:00:00Z' }, base), TODAY).reason, 'Checkpoint not opened in 30+ days');
  });
});

describe('Lambda shapeHealth(): what an unauthenticated client can write', () => {
  const good = {
    type: 'health', tenantId: 'E335E243-0417-4EAC-B2D6-8F894891DA33', status: 'warning', clientName: 'Acme',
    flags: { lists: 'pass', scan: 'warn', injected: 'fail', packs: '<script>' },
    details: Array.from({ length: 15 }, (_, i) => 'd' + i), lastScanDate: '2026-09-20',
    frameworks: ['iso27001', 'soc2', 'bad id!'], domains: ['acme.com', 'not a domain', 'acme.onmicrosoft.com']
  };
  test('keeps only known check ids and statuses, lowercases the tenant, caps lists', () => {
    const h = shapeHealth(good);
    assert.equal(h.tenantId, 'e335e243-0417-4eac-b2d6-8f894891da33');
    assert.deepEqual(h.flags, { lists: 'pass', scan: 'warn' });
    assert.equal(h.details.length, 10);
    assert.deepEqual(h.frameworks, ['iso27001', 'soc2']);
    assert.deepEqual(h.domains, ['acme.com', 'acme.onmicrosoft.com']);
  });
  test('rejects a report without a GUID tenant or a known status', () => {
    assert.equal(shapeHealth(Object.assign({}, good, { tenantId: 'acme.com' })), null);
    assert.equal(shapeHealth(Object.assign({}, good, { status: 'great' })), null);
    assert.equal(shapeHealth(null), null);
  });
  test('a malformed scan date is dropped', () => {
    assert.equal(shapeHealth(Object.assign({}, good, { lastScanDate: 'yesterday' })).lastScanDate, '');
  });
});

describe('wiring', () => {
  const app = readFileSync(new URL('../public/checkpoint/app.js', import.meta.url), 'utf8');
  const html = readFileSync(new URL('../public/checkpoint/index.html', import.meta.url), 'utf8');
  const owner = readFileSync(new URL('../public/owner/owner.js', import.meta.url), 'utf8');
  const store = readFileSync(new URL('../public/checkpoint/store.js', import.meta.url), 'utf8');
  test('the Settings panel and the banner exist', () => {
    assert.match(html, /id="setupHealthRow"/);
    assert.match(html, /id="setupHealthBanner"/);
  });
  test('the report carries status only: no score, results, registers or documents', () => {
    const fn = app.slice(app.indexOf('function reportSetupHealth('), app.indexOf('var SETUP_FIX_LABELS'));
    const keys = [...fn.matchAll(/\n\s{8}(\w+):/g)].map((m) => m[1]);
    assert.deepEqual(keys.sort(), ['appVersion', 'clientName', 'details', 'domains', 'flags', 'frameworks', 'headline', 'lastScanDate', 'status', 'tenantId', 'type'].sort());
    assert.match(fn, /shareSetupHealth === 'false'\) return;/, 'the client can switch it off');
  });
  test('the owner console provisions and reads the Health list', () => {
    assert.match(owner, /\n    Health: \[/);
    assert.match(owner, /health: healthItems\.map\(mapHealthReport\)/);
  });
  test('the store exposes the read-only check and the repair', () => {
    assert.match(store, /checkSetup: checkSetup, repairSetup: repairSetup,/);
  });
  test('the sharing toggle is blocked for read-only sessions', () => {
    assert.match(app, /'toggleShareSetupHealth',/);
  });
});
