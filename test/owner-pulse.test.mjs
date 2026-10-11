// lambda/owner-pulse.js: the Monday summary picks out trials ending,
// lapsed trials, renewals, quiet clients, setup problems and errors from
// the owner console's lists; the daily watchdog checks each endpoint
// without side effects and emails only on failure.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildWeekly, weeklyEmail, watchdogEmail, runChecks, CHECKS } from '../lambda/owner-pulse.js';

const NOW = Date.parse('2026-10-11T22:00:00Z'); // Monday 12 October, 8am Brisbane
const d = (days) => new Date(NOW + days * 864e5).toISOString().slice(0, 10);
const T = (n) => n + '1111111-2222-3333-4444-555555555555';

const data = {
  clients: [
    { TenantId: T('a'), ClientName: 'MineGuard', ContactName: 'Ekin', ContactEmail: 'ekin@mineguard.com.au', Status: 'Trial' },
    { TenantId: T('b'), ClientName: 'Acme', Status: 'Active' },
    { TenantId: T('c'), ClientName: 'Quiet Co', Status: 'Active' },
    { TenantId: T('d'), ClientName: 'Lapsed Ltd', Status: 'Trial' },
    { TenantId: T('e'), ClientName: 'Blocked Pty', Status: 'Active', Blocked: true }
  ],
  entitlements: [
    { TenantId: T('a'), Type: 'demo', IssuedAt: d(-3), Expiry: d(5) },
    { TenantId: T('b'), Type: 'client', IssuedAt: d(-300), Expiry: d(20) },
    { TenantId: T('b'), Type: 'client', IssuedAt: d(-700), Expiry: d(-300) },
    { TenantId: T('c'), Type: 'client', IssuedAt: d(-100), Expiry: d(200) },
    { TenantId: T('d'), Type: 'demo', IssuedAt: d(-40), Expiry: d(-2) },
    { TenantId: T('e'), Type: 'demo', IssuedAt: d(-5), Expiry: d(2) }
  ],
  health: [
    { TenantId: T('a'), Status: 'failing', Headline: 'Lists missing', ReportedAt: d(-1) + 'T01:00:00Z' },
    { TenantId: T('b'), Status: 'healthy', ReportedAt: d(-2) + 'T01:00:00Z' },
    { TenantId: T('c'), Status: 'warning', Headline: 'No scan in 30 days', ReportedAt: d(-20) + 'T01:00:00Z' }
  ],
  errors: [
    { TenantId: T('a'), Message: 'Graph 403', ReportedAt: d(-1) + 'T01:00:00Z' },
    { TenantId: T('a'), Message: 'Graph 403', ReportedAt: d(-2) + 'T01:00:00Z' },
    { TenantId: T('b'), Message: 'Old one', ReportedAt: d(-30) + 'T01:00:00Z' },
    { TenantId: '', Message: 'demo error', ReportedAt: d(-1) + 'T01:00:00Z' }
  ]
};

describe('the weekly summary', () => {
  const w = buildWeekly(data, NOW);
  test('trials ending, lapsed trials and renewals due, ignoring blocked clients and old licences', () => {
    assert.deepEqual(w.trialsEnding.map((x) => [x.name, x.days]), [['MineGuard', 5]]);
    assert.deepEqual(w.trialsLapsed.map((x) => [x.name, x.days]), [['Lapsed Ltd', 2]]);
    assert.deepEqual(w.renewals.map((x) => [x.name, x.days]), [['Acme', 20]]);
  });
  test('licensed clients quiet for 14+ days', () => {
    assert.deepEqual(w.quiet.map((x) => [x.name, x.idle]), [['Quiet Co', 20]]);
  });
  test('setup problems (failing first) and this week\'s errors from signed-in clients only', () => {
    assert.deepEqual(w.setup.map((x) => [x.name, x.status]), [['MineGuard', 'failing'], ['Quiet Co', 'warning']]);
    assert.equal(w.errorCount, 2);
    assert.deepEqual(w.errorsByClient.map((g) => [g.name, g.count, g.top[0]]), [['MineGuard', 2, ['Graph 403', 2]]]);
  });
  test('new this week, and the count of things that need you', () => {
    assert.deepEqual(w.newSignups.map((x) => [x.name, x.trial]), [['MineGuard', true]], 'blocked clients are left out');
    assert.equal(w.needs, 5); // 1 ending + 1 lapsed + 1 renewal + 1 failing setup + 1 quiet
    assert.equal(w.active, 4);
  });
  test('the email: headline, sections, contact links, escaping, owner console button', () => {
    const m = weeklyEmail(w, [{ id: 'site', name: 'Website', means: 'x', ok: true, detail: 'OK' }], NOW, 'Australia/Brisbane');
    assert.equal(m.subject, 'Checkpoint weekly: 5 things need you this week');
    assert.match(m.html, /Monday 12 October 2026/);
    assert.match(m.html, /Trials ending this week[\s\S]*MineGuard<\/b>: trial ends in 5 days · <a href="mailto:ekin@mineguard\.com\.au">Ekin<\/a>/);
    assert.match(m.html, /Gone quiet[\s\S]*last opened 20 days ago/);
    assert.match(m.html, /Graph 403 \(×2\)/);
    assert.match(m.html, /compliance365\.com\.au\/owner\//);
    const evil = weeklyEmail(buildWeekly({ clients: [{ TenantId: T('a'), ClientName: '<img src=x>' }], entitlements: [{ TenantId: T('a'), Type: 'demo', Expiry: d(1) }] }, NOW), [], NOW);
    assert.ok(!/<img/.test(evil.html));
  });
  test('an all-quiet week still sends a short email; a failing check leads it', () => {
    const quiet = weeklyEmail(buildWeekly({}, NOW), [], NOW);
    assert.equal(quiet.subject, 'Checkpoint weekly: all quiet this week');
    assert.match(quiet.html, /Nothing to do/);
    const bad = weeklyEmail(buildWeekly({}, NOW), [{ id: 'subscribe', name: 'Sign-ups', means: 'Sign-ups are failing.', ok: false, detail: 'HTTP 502' }], NOW);
    assert.match(bad.subject, /1 thing needs you/);
    assert.match(bad.html, /Something is not working[\s\S]*Sign-ups/);
  });
});

describe('the watchdog', () => {
  const respond = (map) => async (url, opts) => {
    const r = map(url, opts);
    if (r instanceof Error) throw r;
    return { status: r[0], text: async () => r[1] || '' };
  };
  const healthy = (url, opts) => {
    if (/www\.compliance365\.com\.au\/checkpoint\//.test(url)) return [200, '<html>Checkpoint'];
    if (/www\.compliance365\.com\.au\/$/.test(url)) return [200, '<html>Compliance365'];
    if (/contact-us/.test(url)) return [200];
    if (/subscribe/.test(url)) return [400, '{"error":"Valid email required"}'];
    if (/provision/.test(url)) return [200, '{"ok":true,"blocked":false}'];
    if (/Checkpoint-Error/.test(url)) return [200, '{"ok":false,"dropped":"invalid health report"}'];
    return [404];
  };
  test('all healthy: every check passes and no email', async () => {
    process.env.OWNER_TENANT_ID = 'contoso.onmicrosoft.com';
    const r = await runChecks(respond(healthy));
    assert.ok(r.every((c) => c.ok), JSON.stringify(r.filter((c) => !c.ok)));
    assert.equal(r.length, 6);
    assert.equal(watchdogEmail(r), null);
  });
  test('the probes have no side effects: no email address, no real health report, a revocation check only', () => {
    const sub = CHECKS.find((c) => c.id === 'subscribe');
    assert.deepEqual(sub.body, {});
    assert.deepEqual(CHECKS.find((c) => c.id === 'errors').body, { type: 'health' });
    process.env.OWNER_TENANT_ID = 'contoso.onmicrosoft.com';
    assert.deepEqual(CHECKS.find((c) => c.id === 'provision').body(), { checkRevocation: true, tenantId: 'contoso.onmicrosoft.com' });
    assert.equal(CHECKS.find((c) => c.id === 'contact').method, 'OPTIONS');
  });
  test('a failure or a timeout is reported in plain English', async () => {
    const r = await runChecks(respond((url, o) => (/subscribe/.test(url) ? [502, 'Bad gateway'] : /provision/.test(url) ? Object.assign(new Error('x'), { name: 'TimeoutError' }) : healthy(url, o))));
    const m = watchdogEmail(r);
    assert.match(m.subject, /^Compliance365 watchdog: Sign-ups .*, Checkout activation are not working$/);
    assert.match(m.html, /HTTP 502/);
    assert.match(m.html, /timed out after 15 seconds/);
    assert.match(m.html, /may not get Checkpoint activated/);
  });
  test('the endpoints match the ones the site and Checkpoint use', () => {
    const cfg = readFileSync(new URL('../public/checkpoint/config.js', import.meta.url), 'utf8');
    for (const id of ['contact', 'provision', 'errors']) assert.ok(cfg.includes(CHECKS.find((c) => c.id === id).url), id);
    const base = readFileSync(new URL('../src/layouts/BaseLayout.astro', import.meta.url), 'utf8');
    assert.ok(base.includes(CHECKS.find((c) => c.id === 'subscribe').url));
  });
});
