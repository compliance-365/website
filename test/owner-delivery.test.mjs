// The owner console's view of delivery across the portfolio: where each
// client is against plan, what needs the partner's attention, the trend
// across syncs, a status note for the client, and the ISO 42001
// conversation once a client is certified to ISO 27001 and uses AI.
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
const owner = readFileSync(new URL('../public/owner/owner.js', import.meta.url), 'utf8');
const ownerHtml = readFileSync(new URL('../public/owner/index.html', import.meta.url), 'utf8');

const TODAY = '2026-10-06';
function snap(over) {
  const base = Lib.buildProgressSnapshot({
    today: TODAY,
    pathSteps: [{ label: 'Scope', phase: 'Set up', done: true }, { label: 'Write the policies', phase: 'Document', done: false }],
    clausesByFw: { iso27001: [{ status: 'Implemented', met: 3, total: 4 }] },
    controlsByFw: { iso27001: [{ app: true, st: 'Implemented' }, { app: true, st: 'Not started' }] },
    docs: [], assets: { total: 3, noOwner: 0 }, risks: [], actions: [], scopeStatement: 'x',
    delivery: Object.assign({ plan: { week: 3, behind: 0, readyBy: '2026-12-20' }, bookings: {}, certs: {}, objectives: [{ status: 'On track' }], lastActivity: TODAY, aiUse: 'none' }, over || {})
  });
  return base;
}

describe('the snapshot carries delivery facts', () => {
  test('plan, bookings, certificates, objective counts, activity and AI use', () => {
    const s = snap({ objectives: [{ status: 'At risk' }, { status: 'Missed' }, { status: 'Achieved' }], ownersOverdue: 2, stage2Ready: true, auditorOverdue: 1 });
    assert.deepEqual(s.delivery.objectives, { total: 3, atRisk: 2 });
    assert.equal(s.delivery.plan.week, 3);
    assert.equal(s.delivery.ownersOverdue, 2);
    assert.equal(s.delivery.stage2Ready, true);
    assert.equal(s.delivery.auditorOverdue, 1);
    assert.equal(s.v, 1, 'old consoles still read it: the new fields are optional');
    assert.equal(Lib.buildProgressSnapshot({}).delivery, null);
    assert.deepEqual(Lib.parseProgressSnapshot(JSON.stringify(s)), s);
  });
  test('Checkpoint sends them with every snapshot', () => {
    assert.match(app, /delivery: progressDelivery\(today\)/);
    assert.match(app, /\/cert:iso27001:\(stage\[12\]\)\//);
    assert.match(app, /out\.aiUse = orgProfileValue\('orgAiUse'\) \|\| '';/);
    assert.match(app, /var r = bookingReadinessFor\('iso27001'\); out\.stage1Ready = r\.stage1\.ok; out\.stage2Ready = r\.stage2\.ok;/);
  });
});

describe('mergeProgressHistory()', () => {
  test('adds a point only when a headline number moves, and caps at 26', () => {
    let r = Lib.mergeProgressHistory([], snap(), '2026-09-01');
    assert.deepEqual(r.history, [{ d: '2026-09-01', path: 50, clauses: 75, annexA: 50 }]);
    r = Lib.mergeProgressHistory(r.history, snap(), '2026-09-08');
    assert.equal(r.history.length, 1, 'same numbers: no new point');
    assert.equal(r.changedAt, '2026-09-01');
    const long = Array.from({ length: 30 }, (_, i) => ({ d: '2026-01-' + String(i + 1).padStart(2, '0'), path: i, clauses: 0, annexA: 0 }));
    r = Lib.mergeProgressHistory(long, snap(), TODAY);
    assert.equal(r.history.length, 26);
    assert.equal(r.changedAt, TODAY);
  });
  test('no snapshot leaves the history as it was', () => {
    assert.deepEqual(Lib.mergeProgressHistory([{ d: 'a', path: 1 }], null, TODAY).history, [{ d: 'a', path: 1 }]);
  });
});

describe('clientAttentionFlags()', () => {
  const keys = (c) => Lib.clientAttentionFlags(c, TODAY).map((f) => f.key);
  test('a client on plan and recently synced has nothing flagged', () => {
    assert.deepEqual(keys({ progress: snap(), progressHistory: [{ d: '2026-10-01', path: 50 }], lastSynced: '2026-10-05T01:00:00Z' }), []);
  });
  test('never synced, stale sync, stalled progress and nobody working', () => {
    assert.deepEqual(keys({}), ['nosync']);
    const k = keys({ progress: snap({ lastActivity: '2026-09-01' }), progressHistory: [{ d: '2026-08-20', path: 50 }], lastSynced: '2026-09-10' });
    assert.ok(k.includes('stale-sync') && k.includes('stalled') && k.includes('inactive'));
    const stalled = Lib.clientAttentionFlags({ progress: snap(), progressHistory: [{ d: '2026-08-20', path: 50 }], lastSynced: TODAY }, TODAY).find((f) => f.key === 'stalled');
    assert.equal(stalled.level, 'red', 'more than 30 days is red');
  });
  test('behind plan, Stage 1 soon and not ready, Stage 2 booked and not ready', () => {
    const f = Lib.clientAttentionFlags({ lastSynced: TODAY, progress: snap({ plan: { week: 6, behind: 4 }, bookings: { stage1: '2026-10-20', stage2: '2026-12-01' } }) }, TODAY);
    assert.deepEqual(f.map((x) => x.key), ['behind', 'stage2', 'stage1']);
    assert.equal(f[0].level, 'red');
    assert.match(f[1].text, /Stage 2 booked for 2026-12-01 but not yet ready/);
    assert.deepEqual(keys({ lastSynced: TODAY, progress: snap({ bookings: { stage1: '2026-10-20', stage2: '2026-12-01' }, stage1Ready: true, stage2Ready: true }) }), []);
  });
  test('certificate expiring without recertification booked, an overdue surveillance audit, and auditor access left open', () => {
    const f = keys({ lastSynced: TODAY, progress: snap({ certs: { iso27001: { issued: '2023-11-01', expires: '2026-11-01', nextAudit: 'Recertification audit', nextDue: '2026-11-01', booked: false } }, auditorOverdue: 1 }) });
    assert.ok(f.includes('expiry-iso27001') && f.includes('auditor'));
    assert.ok(!keys({ lastSynced: TODAY, progress: snap({ certs: { iso27001: { issued: '2023-11-01', expires: '2026-11-01', nextAudit: 'Recertification audit', nextDue: '2026-11-01', booked: true } } }) }).includes('expiry-iso27001'));
    assert.ok(keys({ lastSynced: TODAY, progress: snap({ certs: { iso27001: { issued: '2025-06-01', expires: '2028-06-01', nextAudit: 'Surveillance audit 1', nextDue: '2026-06-01' } } }) }).includes('overdue-iso27001'));
  });
  test('ISO 42001: certified to 27001, uses AI, not already licensed', () => {
    const certs = { iso27001: { issued: '2026-09-01', expires: '2029-09-01', nextAudit: 'Surveillance audit 1', nextDue: '2027-09-01' } };
    const f = Lib.clientAttentionFlags({ lastSynced: TODAY, modules: ['iso27001'], progress: snap({ certs, aiUse: 'builds' }) }, TODAY);
    assert.deepEqual(f.map((x) => [x.key, x.level]), [['iso42001', 'info']]);
    assert.match(f[0].text, /builds AI into its products: ready for an ISO 42001 conversation/);
    assert.deepEqual(keys({ lastSynced: TODAY, modules: ['iso27001', 'iso42001'], progress: snap({ certs, aiUse: 'builds' }) }), [], 'already licensed');
    assert.deepEqual(keys({ lastSynced: TODAY, modules: ['iso27001'], progress: snap({ certs, aiUse: 'none' }) }), [], 'no AI use');
    assert.deepEqual(keys({ lastSynced: TODAY, modules: ['iso27001'], progress: snap({ aiUse: 'builds' }) }), [], 'not yet certified');
  });
  test('stage: Certified, the next step\'s phase, or Not started', () => {
    assert.equal(Lib.clientStage(null), 'Not started');
    assert.equal(Lib.clientStage(snap()), 'Document');
    assert.equal(Lib.clientStage(snap({ certs: { iso27001: { issued: '2026-01-01' } } })), 'Certified');
  });
});

describe('clientStatusNote()', () => {
  test('plain English, dated, the next steps, and no upsell', () => {
    const n = Lib.clientStatusNote({ name: 'MineGuard', contactName: 'Ekin Eraydin', progress: snap({ plan: { week: 6, behind: 2, readyBy: '2026-12-20' }, bookings: { stage1: '2026-12-01' }, ownersOverdue: 1, aiUse: 'builds' }) }, TODAY);
    assert.match(n, /^Hi Ekin,/);
    assert.match(n, /1 of 2 steps on the path to certification are done\. On the current plan you will be ready for Stage 1 by 20 Dec 2026\./);
    assert.match(n, /Management system \(Clauses 4-10\): 75%\. Controls \(Annex A\): 1 of 2 in place\./);
    assert.match(n, /Audits booked: Stage 1 on 1 Dec 2026\./);
    assert.match(n, /- Write the policies\n- Catch up on 2 step\(s\) that are behind plan\n- 1 person\(s\) have overdue tasks/);
    assert.doesNotMatch(n, /42001|upsell|licen[cs]e/i);
  });
  test('certified, and before any progress has arrived', () => {
    const n = Lib.clientStatusNote({ name: 'X', progress: snap({ certs: { iso27001: { issued: '2026-01-01', expires: '2029-01-01', nextAudit: 'Surveillance audit 1', nextDue: '2027-01-01' } } }) }, TODAY);
    assert.match(n, /You are certified\. The next audit is the surveillance audit 1, due by 1 Jan 2027\./);
    assert.match(Lib.clientStatusNote({ name: 'X' }, TODAY), /^Hi there,\n\nWe have not yet received progress from Checkpoint/);
  });
});

describe('the console', () => {
  test('a Delivery tab, flags on the dashboard and in the drawer, history stored at sync, status note copy only', () => {
    assert.match(ownerHtml, /<button class="owner-tab" data-ov="delivery">Delivery<\/button>/);
    assert.match(ownerHtml, /<section class="view" id="ov-delivery">/);
    assert.match(owner, /renderDashboard\(\);\n\s+renderDeliveryBoard\(\);/);
    assert.match(owner, /Delivery: clients off track/);
    assert.match(owner, /\{ name: 'ProgressHistory', text: \{ allowMultipleLines: true \} \}/);
    assert.match(owner, /ProgressHistory: JSON\.stringify\(c\.progressHistory \|\| \[\]\)/);
    assert.match(owner, /c\.progressHistory = window\.CheckpointLib\.mergeProgressHistory\(c\.progressHistory, summary\.progress,/);
    assert.match(owner, /'<div class="d-sec"><h4>Needs attention<\/h4>' \+ flagList\(fl\)/);
    assert.match(owner, /partnerStatusNote: async function \(id\)/);
    assert.match(owner, /Nothing is sent from here\./);
  });
});

/* Renders the Delivery tab and the dashboard in a real browser from
   seeded data: the console sits behind a Microsoft sign-in, so the test
   serves owner.js with a hook that sets PARTNER_DATA and renders. */
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

describe('Delivery tab in the browser', { skip: skipReason || false }, () => {
  test('board, filter, dashboard flags, drawer and status note render without errors', async () => {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(baseUrl + '/owner/index.html');
    await page.waitForFunction(() => window.__ownerTest && window.CheckpointLib);
    const certified = snap({ certs: { iso27001: { issued: '2026-09-01', expires: '2029-09-01', nextAudit: 'Surveillance audit 1', nextDue: '2027-09-01' } }, aiUse: 'tools' });
    const behind = snap({ plan: { week: 8, behind: 5, readyBy: '2026-11-01' }, bookings: { stage2: '2026-10-20' } });
    await page.evaluate(({ certified, behind, today }) => {
      document.getElementById('appShell').style.display = '';
      window.__ownerTest.seed({
        clients: [
          { _sp: '1', name: 'Acme', tenantId: 't1', status: 'Active', modules: ['iso27001'], lastSynced: today, progress: certified, progressHistory: [{ d: '2026-08-01', path: 20, clauses: 10, annexA: 5 }, { d: '2026-09-01', path: 100, clauses: 100, annexA: 90 }], readinessByFw: {}, scoreHistory: [] },
          { _sp: '2', name: 'MineGuard', tenantId: 't2', status: 'Active', modules: ['iso27001'], lastSynced: today, progress: behind, progressHistory: [], readinessByFw: {}, scoreHistory: [], contactName: 'Ekin Eraydin', contactEmail: 'ekin@example.com' }
        ],
        entitlements: [], prices: [], errorReports: [], health: []
      });
      window.OwnerApp.go('delivery');
    }, { certified, behind, today: new Date().toISOString().slice(0, 10) });
    const board = page.locator('#deliveryTable');
    await board.waitFor();
    assert.equal(await board.locator('tbody tr').count(), 2);
    assert.match(await board.locator('tbody tr').first().innerText(), /MineGuard[\s\S]*5 step\(s\) behind plan/);
    assert.match(await page.locator('#deliveryBoardWrap').innerText(), /ISO 42001 OPPORTUNITIES|ISO 42001 opportunities/i);
    await page.selectOption('#deliveryFilter', 'upsell');
    assert.equal(await page.locator('#deliveryTable tbody tr').count(), 1);
    assert.match(await page.locator('#deliveryTable').innerText(), /Acme[\s\S]*ready for an ISO 42001 conversation/);
    assert.match(await page.locator('#ownerDashboardWrap').innerText(), /Delivery: clients off track[\s\S]*MineGuard/i);
    await page.evaluate(() => window.OwnerApp.partnerOpenClientDrawer('2'));
    assert.match(await page.locator('#drawer').innerText(), /Needs attention[\s\S]*Stage 2 booked/i);
    await page.evaluate(() => { window.OwnerApp.partnerStatusNote('2'); });
    const note = page.locator('#modalBox textarea');
    await note.waitFor();
    assert.match(await note.inputValue(), /^Hi Ekin,/);
    assert.deepEqual(errors, []);
    await page.close();
  });
});
