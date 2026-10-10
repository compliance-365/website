// Actions worked as tickets in Planner, Jira or ServiceNow (1.148.0).
// A flow records each ticket's status in the TicketLinks list; Checkpoint
// shows it and offers to complete the action when the ticket is finished,
// through its own audited path. Nonconformities are never closed from a
// ticket: they need a corrective action record.
import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const L = require('../public/checkpoint/lib.js');

describe('ticket status and system', () => {
  test('statuses from Planner, Jira and ServiceNow map to done, cancelled or open', () => {
    for (const s of ['Done', 'Resolved', 'Closed', 'Closed Complete', 'Completed', '100', '100%']) assert.equal(L.ticketStatusCategory(s), 'done', s);
    for (const s of ["Won't do", "Won't fix", 'Cancelled', 'Canceled', 'Closed Incomplete', 'Rejected', 'Duplicate']) assert.equal(L.ticketStatusCategory(s), 'cancelled', s);
    for (const s of ['To Do', 'In Progress', 'New', '50%', 'Awaiting customer', '', null, undefined]) assert.equal(L.ticketStatusCategory(s), 'open', String(s));
  });
  test('the system is recognised from the ticket link', () => {
    assert.equal(L.ticketSystemFromUrl('https://acme.atlassian.net/browse/SEC-12'), 'Jira');
    assert.equal(L.ticketSystemFromUrl('https://acme.service-now.com/nav_to.do?uri=incident.do'), 'ServiceNow');
    assert.equal(L.ticketSystemFromUrl('https://tasks.office.com/acme/Home/Task/abc'), 'Planner');
    assert.equal(L.ticketSystemFromUrl('https://dev.azure.com/acme/sec/_workitems/edit/4'), 'Azure DevOps');
    assert.equal(L.ticketSystemFromUrl('https://example.com/t/1'), 'Other');
  });
});

describe('ticketSyncProposals()', () => {
  const actions = [
    { id: 'ACT-1', status: 'Open' }, { id: 'ACT-2', status: 'In progress' }, { id: 'ACT-3', status: 'Open' },
    { id: 'ACT-4', status: 'Done' }, { id: 'ACT-5', status: 'Done' }, { id: 'ACT-6', status: 'Open' },
  ];
  const links = [
    { action: 'ACT-1', system: 'Jira', key: 'SEC-1', status: 'In Progress', updated: '2026-10-01T00:00:00Z' },
    { action: 'ACT-1', system: 'Jira', key: 'SEC-1', status: 'Done', updated: '2026-10-05T00:00:00Z' },
    { action: 'ACT-2', system: 'ServiceNow', key: 'INC001', status: 'Closed Incomplete', updated: '2026-10-05' },
    { action: 'ACT-3', system: 'Planner', key: 'T', status: '50%', updated: '2026-10-05' },
    { action: 'ACT-4', system: 'Jira', key: 'SEC-4', status: 'In Progress', updated: '2026-10-08' },
    { action: 'ACT-5', system: 'Jira', key: 'SEC-5', status: 'In Progress', updated: '2026-09-01' },
  ];
  const r = L.ticketSyncProposals(actions, links, { 'ACT-4': '2026-10-02', 'ACT-5': '2026-10-02' });
  test('the newest link counts; finished tickets propose completing or closing the open action', () => {
    assert.deepEqual(r.close.map((p) => [p.action.id, p.to, p.link.key]), [['ACT-1', 'Done', 'SEC-1'], ['ACT-2', 'Cancelled', 'INC001']]);
  });
  test('a completed action whose ticket was reopened afterwards is flagged; one updated before completion is not', () => {
    assert.deepEqual(r.reopened.map((p) => p.action.id), ['ACT-4']);
  });
  test('no links, no proposals', () => {
    assert.deepEqual(L.ticketSyncProposals(actions, [], {}), { close: [], reopened: [] });
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

const demoState = (page) => page.evaluate(() => {
  const k = Object.keys(localStorage).find((x) => (localStorage.getItem(x) || '').indexOf('ticketLinks') !== -1);
  return JSON.parse(localStorage.getItem(k));
});

describe('in the browser', { skip: skipReason || false }, () => {
  test('a finished Jira ticket completes its action, with the ticket in the progress log, the evidence and the audit log', async () => {
    const page = await browser.newPage();
    await page.goto(baseUrl + '/checkpoint/index.html?demo=1', { waitUntil: 'networkidle' });
    await page.evaluate(() => App.go('actions'));
    assert.match(await page.textContent('#actTickets'), /1 linked ticket is finished[\s\S]*ACT-003[\s\S]*Jira SEC-41/);
    assert.match(await page.textContent('#actRows'), /Planner Phishing programme/, 'the row shows its ticket');
    await page.evaluate(() => App.applyTicketSync('ACT-003'));
    const S = await demoState(page);
    const a = S.actions.find((x) => x.id === 'ACT-003');
    assert.equal(a.status, 'Done');
    assert.equal(a.evidenceUrl, 'https://meridianhealth.atlassian.net/browse/SEC-41');
    assert.ok(S.actionUpdates.some((u) => u.action === 'ACT-003' && u.note === 'Completed: Jira SEC-41 is Done.' && u.status === 'Done'));
    assert.ok(S.auditLog.some((e) => e.targetId === 'ACT-003' && /Done: Completed: Jira SEC-41/.test(e.after)));
    assert.equal((await page.textContent('#actTickets')).trim(), '', 'nothing left to propose');
    await page.close();
  });

  test('a nonconformity with a finished ticket is routed to its corrective action, never closed from the ticket', async () => {
    const page = await browser.newPage();
    await page.goto(baseUrl + '/checkpoint/index.html?demo=1', { waitUntil: 'networkidle' });
    await page.evaluate(() => {
      const k = Object.keys(localStorage).find((x) => (localStorage.getItem(x) || '').indexOf('ticketLinks') !== -1);
      const S = JSON.parse(localStorage.getItem(k));
      S.actions.find((x) => x.id === 'ACT-005').type = 'Non-conformity (Major)';
      S.ticketLinks.push({ id: 'TL-9', action: 'ACT-005', system: 'ServiceNow', key: 'INC0010', url: 'https://acme.service-now.com/x', status: 'Resolved', updated: new Date().toISOString() });
      localStorage.setItem(k, JSON.stringify(S));
    });
    await page.reload({ waitUntil: 'networkidle' });
    await page.evaluate(() => App.go('actions'));
    const html = await page.innerHTML('#actTickets');
    assert.match(html, /data-action="App.recordCapa" data-id="ACT-005"/);
    assert.match(html, /Update all 2|data-id="ACT-003"/);
    await page.evaluate(() => App.applyTicketSync('*'));
    const S = await demoState(page);
    assert.notEqual(S.actions.find((x) => x.id === 'ACT-005').status, 'Done');
    await page.close();
  });

  test('a ticket can be linked by hand from its URL, and the change is audited', async () => {
    const page = await browser.newPage();
    await page.goto(baseUrl + '/checkpoint/index.html?demo=1', { waitUntil: 'networkidle' });
    await page.evaluate(() => App.go('actions'));
    const p = page.evaluate(() => App.linkTicket('ACT-006'));
    await page.waitForSelector('#modalBox .m-field input');
    const inputs = page.locator('#modalBox .m-field input');
    await inputs.nth(0).fill('https://acme.atlassian.net/browse/SEC-77');
    await inputs.nth(2).fill('In Progress');
    await page.locator('#modalBox .m-btns .btn:not(.ghost)').click();
    await p;
    const S = await demoState(page);
    const l = S.ticketLinks.find((x) => x.action === 'ACT-006');
    assert.deepEqual([l.system, l.key, l.status], ['Jira', 'SEC-77', 'In Progress']);
    assert.ok(S.auditLog.some((e) => e.action === 'Ticket linked' && e.targetId === 'ACT-006' && /Jira SEC-77/.test(e.after)));
    await page.close();
  });
});
