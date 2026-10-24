// Each client's internal audit in the owner console: the summary a
// client shares at Sync, the attention flags it raises, and the
// Internal audits section of the Delivery tab.
import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
global.window = global.window || {};
const Lib = require('../public/checkpoint/lib.js');
const app = readFileSync(new URL('../public/checkpoint/app.js', import.meta.url), 'utf8');

const TODAY = '2026-10-06';
const AUDITS = [
  { id: 'IA-001', status: 'Completed', completed: '2026-03-01', results: { a: { r: 'C' }, b: { r: 'Minor' }, c: { r: 'OFI' }, d: { r: 'Major' } } },
  { id: 'IA-003', status: 'Planned', planned: '2027-03-01', scope: 'Later' },
  { id: 'IA-002', status: 'Planned', planned: '2026-10-15', scope: 'Clauses 4 to 10 and Annex A '.repeat(10), notes: 'private auditor notes' }
];
function summary(over) {
  return Lib.auditDeliverySummary(Object.assign({
    audits: AUDITS, today: TODAY,
    lineCounts: { 'IA-002': { total: 40, assessed: 12 } },
    radarItems: [
      { id: 'r1', sev: 'Major', ref: 'A.5.15', title: 'Two leavers still have accounts', detail: 'names here' },
      { id: 'r2', sev: 'Minor', ref: '9.3', title: 'No management review this year' },
      { id: 'r3', sev: 'OFI', ref: 'A.8.8', title: 'Patch evidence is old' },
      { id: 'r4', sev: 'Minor', ref: '7.2', title: 'Training records incomplete' }
    ],
    radarSeen: { r1: '2026-09-01', r2: '2026-02-01', r3: '2026-09-20', r4: '2026-10-01' },
    actions: [
      { src: 'Internal audit IA-001', type: 'Non-conformity (Major)', status: 'Open', due: '2026-09-01' },
      { src: 'Internal audit IA-001', type: 'Non-conformity (Minor)', status: 'In progress', due: '2026-12-01' },
      { src: 'Internal audit IA-001', type: 'Non-conformity (Minor)', status: 'Done', due: '2026-04-01' },
      { src: 'Risk register', type: 'Action', status: 'Open', due: '2026-01-01' }
    ],
    evidenceRequests: { 'A.5.15': { owner: 'Sam', audit: 'IA-002' } },
    invites: {}
  }, over || {}));
}

describe('auditDeliverySummary()', () => {
  test('the next audit, its readiness, the last result, open findings and the radar', () => {
    const s = summary();
    assert.equal(s.next.id, 'IA-002', 'soonest planned audit first');
    assert.equal(s.next.scope.length, 120, 'scope is trimmed');
    assert.deepEqual([s.next.total, s.next.assessed, s.next.evidenceAsked, s.next.invitesSent, s.next.overdue], [40, 12, true, false, false]);
    assert.equal(s.planned, 2);
    assert.deepEqual(s.last, { id: 'IA-001', completed: '2026-03-01', major: 1, minor: 1, ofi: 1, conform: 1 });
    assert.deepEqual(s.findings, { open: 2, overdue: 1, major: 1 });
    assert.deepEqual([s.radar.major, s.radar.minor, s.radar.ofi, s.radar.fresh], [1, 2, 1, 3], 'fresh counts radar items first seen since the last audit');
    assert.equal(s.radar.top.length, 3);
    assert.deepEqual(s.radar.top[0], { sev: 'Major', ref: 'A.5.15', title: 'Two leavers still have accounts' });
  });
  test('shares no notes or evidence', () => {
    const json = JSON.stringify(summary());
    assert.doesNotMatch(json, /private auditor notes|names here|Sam/);
  });
  test('overdue, and no audits at all', () => {
    assert.equal(summary({ today: '2026-10-20' }).next.overdue, true);
    const empty = Lib.auditDeliverySummary({ today: TODAY });
    assert.equal(empty.next, null);
    assert.equal(empty.last, null);
    assert.deepEqual(empty.findings, { open: 0, overdue: 0, major: 0 });
  });
});

function snap(audit, over) {
  return Lib.buildProgressSnapshot({
    today: TODAY,
    pathSteps: [{ label: 'Scope', phase: 'Set up', done: true }, { label: 'Policies', phase: 'Document', done: false }],
    clausesByFw: {}, controlsByFw: {}, docs: [], assets: { total: 0, noOwner: 0 }, risks: [], actions: [], scopeStatement: 'x',
    delivery: Object.assign({ plan: { week: 3, behind: 0, readyBy: '2026-12-20' }, bookings: {}, certs: {}, objectives: [], lastActivity: TODAY, aiUse: 'none', audit: audit }, over || {})
  });
}
const keys = (audit, today) => Lib.clientAttentionFlags({ lastSynced: TODAY, progress: snap(audit) }, today || TODAY).map((f) => f.key);

describe('the snapshot and attention flags', () => {
  test('the snapshot carries the summary, and Checkpoint sends it', () => {
    const s = snap(summary());
    assert.equal(s.delivery.audit.next.id, 'IA-002');
    assert.deepEqual(Lib.parseProgressSnapshot(JSON.stringify(s)), s);
    assert.equal(snap(undefined).delivery.audit, null, 'older clients: nothing to show');
    assert.match(app, /out\.audit = L\.auditDeliverySummary\(/);
  });
  test('evidence not asked two weeks out, invites not sent a week out, overdue', () => {
    assert.ok(keys(summary({ evidenceRequests: {} })).includes('ia-evidence'));
    const f = keys(summary());
    assert.ok(!f.includes('ia-evidence'));
    assert.ok(!f.includes('ia-invites'), '9 days out: invites can wait');
    assert.ok(keys(summary({ today: '2026-10-10' }), '2026-10-10').includes('ia-invites'));
    assert.ok(!keys(summary({ today: '2026-10-10', invites: { 'IA-002': { date: '2026-10-09' } } }), '2026-10-10').includes('ia-invites'));
    const late = keys(summary({ today: '2026-10-20' }), '2026-10-20');
    assert.ok(late.includes('ia-overdue') && !late.includes('ia-invites'));
  });
  test('open majors, past-due findings, the radar, and nothing scheduled', () => {
    const f = keys(summary());
    assert.ok(f.includes('ia-major') && !f.includes('ia-findings'));
    assert.ok(keys(summary({ actions: [{ src: 'Internal audit', type: 'Non-conformity (Minor)', status: 'Open', due: '2026-01-01' }] })).includes('ia-findings'));
    assert.ok(f.includes('radar-major') && !f.includes('radar-new'));
    const flag = Lib.clientAttentionFlags({ lastSynced: TODAY, progress: snap(summary()) }, TODAY).find((x) => x.key === 'radar-major');
    assert.match(flag.text, /1 major issue\(s\), e\.g\. Two leavers still have accounts/);
    assert.ok(keys(summary({ radarItems: [1, 2, 3].map((n) => ({ id: 'm' + n, sev: 'Minor', ref: '7.' + n, title: 't' })), radarSeen: { m1: '2026-09-01', m2: '2026-09-02', m3: '2026-09-03' } })).includes('radar-new'));
    assert.ok(keys(summary({ audits: [AUDITS[0]] })).includes('ia-none'));
    assert.ok(!keys(undefined).some((k) => /^ia-|^radar-/.test(k)), 'no summary, no flags');
  });
});

/* The Internal audits section in a real browser, seeded the same way as
   owner-delivery.test.mjs: the console sits behind a Microsoft sign-in. */
let chromium = null, skipReason = null;
try { ({ chromium } = await import('playwright')); } catch (e) { skipReason = 'playwright is not installed'; }
const PUBLIC_DIR = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'public');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json' };
let server = null, baseUrl = '', browser = null;
if (!skipReason) {
  server = createServer(async (req, res) => {
    const urlPath = decodeURIComponent(req.url.split('?')[0]);
    let filePath = join(PUBLIC_DIR, urlPath);
    let st = await stat(filePath).catch(() => null);
    if (st && st.isDirectory()) { filePath = join(filePath, 'index.html'); st = await stat(filePath).catch(() => null); }
    if (!st) { res.writeHead(404); res.end(); return; }
    let data = await readFile(filePath);
    if (urlPath === '/owner/owner.js') {
      data = String(data).replace('var PARTNER_DATA = null;', 'var PARTNER_DATA = null; window.__ownerTest = { seed: function (d) { PARTNER_DATA = d; renderDashboard(); renderDeliveryBoard(); } };');
    }
    res.writeHead(200, { 'Content-Type': MIME[extname(filePath)] || 'application/octet-stream' });
    res.end(data);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  baseUrl = 'http://127.0.0.1:' + server.address().port;
  try { browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined }); }
  catch (e) { skipReason = 'Chromium not found'; }
}
after(async () => { if (browser) await browser.close(); if (server) server.close(); });

describe('Internal audits in the Delivery tab', { skip: skipReason || false }, () => {
  test('column, KPIs and the portfolio table render, overdue first', async () => {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(baseUrl + '/owner/index.html');
    await page.waitForFunction(() => window.__ownerTest && window.CheckpointLib);
    /* Relative dates: the console compares against the real clock. */
    const day = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
    const ready = summary({ today: day(0), audits: [AUDITS[0], Object.assign({}, AUDITS[2], { planned: day(10), scope: 'Whole ISMS' })] });
    const late = summary({ today: day(0), audits: [Object.assign({}, AUDITS[2], { planned: day(-3), scope: 'Annex A' })], radarItems: [], actions: [] });
    const a = snap(ready, { lastActivity: day(0) }), b = snap(late, { lastActivity: day(0) });
    await page.evaluate(({ a, b, today }) => {
      document.getElementById('appShell').style.display = '';
      window.__ownerTest.seed({
        clients: [
          { _sp: '1', name: 'Acme', tenantId: 't1', status: 'Active', modules: ['iso27001'], lastSynced: today, progress: a, progressHistory: [], readinessByFw: {}, scoreHistory: [] },
          { _sp: '2', name: 'Borealis', tenantId: 't2', status: 'Active', modules: ['iso27001'], lastSynced: today, progress: b, progressHistory: [], readinessByFw: {}, scoreHistory: [] }
        ],
        entitlements: [], prices: [], errorReports: [], health: []
      });
      window.OwnerApp.go('delivery');
    }, { a, b, today: day(0) });
    const table = page.locator('#internalAuditTable');
    await table.waitFor();
    const rows = table.locator('tbody tr');
    assert.equal(await rows.count(), 2);
    assert.match(await rows.first().innerText(), /Borealis[\s\S]*IA-002[\s\S]*overdue[\s\S]*Clear/);
    assert.match(await rows.nth(1).innerText(), /Acme[\s\S]*evidence requested[\s\S]*invites sent[\s\S]*12 of 40 recorded[\s\S]*IA-001[\s\S]*1 major, 1 minor, 1 improve[\s\S]*2 open[\s\S]*A\.5\.15: Two leavers/);
    const wrap = await page.locator('#deliveryBoardWrap').innerText();
    assert.match(wrap, /1\s*Due in the next 30 days/);
    assert.match(wrap, /1\s*Overdue/);
    assert.match(await page.locator('#deliveryTable').innerText(), /IA-002 overdue/);
    assert.deepEqual(errors, []);
    await page.close();
  });
});
