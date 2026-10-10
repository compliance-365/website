// Requests from the certification auditor: logged and answered by the
// practitioner, read by the auditor in the Auditor guide, and in the
// owner's My tasks until answered.
import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
globalThis.window = globalThis.window || {};
const Lib = require('../public/checkpoint/lib.js');
const store = readFileSync(new URL('../public/checkpoint/store.js', import.meta.url), 'utf8');

describe('auditRequestView', () => {
  const v = Lib.auditRequestView([
    { id: 'AR-1', status: 'Open', due: '2026-10-01', requested: '2026-09-28' },
    { id: 'AR-2', status: 'Answered', requested: '2026-09-29' },
    { id: 'AR-3', status: 'Open', due: '2026-10-20', requested: '2026-10-08' },
    { id: 'AR-4', status: 'Closed', requested: '2026-09-01' }
  ], '2026-10-09');
  test('states, order and counts', () => {
    assert.deepEqual(v.rows.map((r) => [r.id, r.state]), [['AR-1', 'overdue'], ['AR-3', 'open'], ['AR-2', 'answered'], ['AR-4', 'closed']]);
    assert.deepEqual(v.counts, { open: 1, overdue: 1, answered: 1, closed: 1 });
    assert.equal(v.waiting, 2);
  });
  test('the list is a SharePoint list in the tenant', () => {
    assert.match(store, /AuditRequests: \[\s*\{ name: 'RefId'/);
  });
});

let chromium = null, skipReason = null;
try { ({ chromium } = await import('playwright')); } catch (e) { skipReason = 'playwright is not installed'; }
const PUBLIC_DIR = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'public');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json' };
let server = null, baseUrl = '', browser = null;
if (!skipReason) {
  server = createServer(async (req, res) => {
    let filePath = join(PUBLIC_DIR, decodeURIComponent(req.url.split('?')[0]));
    let st = await stat(filePath).catch(() => null);
    if (st && st.isDirectory()) { filePath = join(filePath, 'index.html'); st = await stat(filePath).catch(() => null); }
    if (!st) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': MIME[extname(filePath)] || 'application/octet-stream' });
    res.end(await readFile(filePath));
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  baseUrl = 'http://127.0.0.1:' + server.address().port;
  try { browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined }); }
  catch (e) { skipReason = 'Chromium not found'; }
}
after(async () => { if (browser) await browser.close(); if (server) server.close(); });
const KEY = 'checkpoint-demo-v8';
const confirmBtn = '#modalBox .m-btns .btn:not(.ghost)';

describe('in the browser', { skip: skipReason || false }, () => {
  test('log, answer and see a request; the auditor reads it without buttons', async () => {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(baseUrl + '/checkpoint/index.html?demo=1&view=auditor', { waitUntil: 'networkidle' });
    await page.waitForSelector('#auditRequests');
    assert.match(await page.locator('#auditRequests').innerText(), /2 waiting, 1 overdue · 1 answered · 0 closed/);
    await page.click('#auditRequests [data-action="App.addAuditRequest"]');
    await page.locator('#modalBox .m-field input').first().fill('Internal audit report');
    await page.locator(confirmBtn).click();
    await page.waitForFunction(() => /AR-004/.test(document.getElementById('auditRequests').innerText));
    await page.click('#auditRequests [data-action="App.answerAuditRequest"][data-id="AR-004"]');
    await page.locator('#modalBox textarea').fill('The 2026 internal audit report, in Documents.');
    await page.locator(confirmBtn).click();
    await page.waitForFunction(() => /Answer \(.*\): The 2026 internal audit report/.test(document.getElementById('auditRequests').innerText));
    const s = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)), KEY);
    assert.equal(s.auditRequests.find((r) => r.id === 'AR-004').status, 'Answered');
    assert.ok(s.auditLog.some((e) => e.action === 'Audit request answered' && e.targetId === 'AR-004'));
    await page.evaluate(() => { window.App.go('mytasks'); window.App.setMyTasksAs('K. Patel'); });
    await page.locator('#myTasksBody [data-action="App.answerAuditRequest"][data-id="AR-003"]').waitFor();
    await page.close();

    const viewer = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    viewer.on('pageerror', (e) => errors.push(String(e)));
    await viewer.goto(baseUrl + '/checkpoint/index.html?demo=1&role=viewer', { waitUntil: 'networkidle' });
    await viewer.evaluate(() => window.App.go('auditor'));
    await viewer.waitForSelector('#auditRequests');
    assert.match(await viewer.locator('#auditRequests').innerText(), /Access review records/);
    assert.equal(await viewer.locator('#auditRequests button').count(), 0, 'read-only: no buttons');
    await viewer.close();
    assert.deepEqual(errors, []);
  });
});
