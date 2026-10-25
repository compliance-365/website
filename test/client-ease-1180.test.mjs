// 1.180.0: phishing simulation follow-up, group access in the access
// review, integrated audits across ISO standards, and the partner's
// monthly portfolio report.
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
const L = require('../public/checkpoint/lib.js');
const app = readFileSync(new URL('../public/checkpoint/app.js', import.meta.url), 'utf8');
const graph = readFileSync(new URL('../public/checkpoint/graph.js', import.meta.url), 'utf8');
const owner = readFileSync(new URL('../public/owner/owner.js', import.meta.url), 'utf8');

describe('phishing simulation follow-up', () => {
  const res = { sim: { id: 's1', name: 'Q3', completed: '2026-09-10' }, users: [
    { name: 'A', email: 'a@x', compromised: true }, { name: 'B', email: 'b@x', compromised: true },
    { name: 'C', email: 'c@x', compromised: true }, { name: 'D', email: 'd@x', reported: true }, { name: 'E', email: 'e@x' }] };
  test('counts, rate, and who still needs the refresher', () => {
    const f = L.phishFollowUp(res, [
      { courseId: 'security-awareness', upn: 'B@x', status: 'Assigned' },
      { courseId: 'security-awareness', upn: 'c@x', status: 'Completed', completed: '2026-03-01' }
    ], 'security-awareness');
    assert.deepEqual([f.total, f.compromised, f.reported, f.pct], [5, 3, 1, 60]);
    assert.deepEqual(f.toAssign.map((u) => u.upn), ['a@x', 'c@x'], 'B has it open; C completed it before the simulation');
  });
  test('read-only Graph call for the per-person report', () => {
    assert.match(graph, /\/report\/simulationUsers'/);
    assert.match(app, /buildTrainingRows\(c, f\.toAssign, campaign, v\.due \|\| daysFrom\(14\), 'phishing'\)/);
  });
});

describe('group access in the access review', () => {
  const inv = { signInKnown: true, users: [
    { upn: 'old@x', name: 'Old', type: 'Member', enabled: true, created: '2024-01-01', lastSignIn: '2026-01-01', roles: [] },
    { upn: 'ok@x', name: 'Ok', type: 'Member', enabled: true, created: '2024-01-01', lastSignIn: '2026-10-20', roles: [] }] };
  const groups = [{ id: 'g1', name: 'Finance', owners: [{ name: 'Fi Owner', mail: 'fi@x' }], members: [{ upn: 'old@x', name: 'Old' }, { upn: 'ok@x', name: 'Ok' }, { upn: 'g_p.com#EXT#@x', name: 'Guest', type: 'Guest' }] },
    { id: 'g2', name: 'No owner', owners: [], members: [{ upn: 'ok@x', name: 'Ok' }] }];
  const rec = L.accessReviewBuild(inv, { today: '2026-10-25', owner: { name: 'Matt', mail: 'm@x' }, groups });
  test('each membership is a line for the group owner, or the review owner', () => {
    const g = rec.items.filter((i) => i.k === 'group');
    assert.equal(g.length, 4);
    assert.deepEqual(g.filter((i) => i.g === 'g1').map((i) => i.u + ':' + i.s + ':' + i.rv), ['old@x:remove:fi@x', 'ok@x:keep:fi@x', 'g_p.com#EXT#@x:check:fi@x']);
    assert.equal(g.find((i) => i.g === 'g2').rv, 'm@x');
    assert.equal(L.accessReviewProgress(rec).byKind.group, 4);
  });
  test('a decision on a membership touches that line only; the action names the group', () => {
    const d = L.accessReviewDecide(rec, ['old@x::g1'], 'remove', 'Fi', '2026-10-25');
    assert.equal(d.changed, 1);
    const acts = L.accessReviewActions(d.rec, '2026-10-25');
    assert.equal(acts.length, 1);
    assert.match(acts[0].title, /remove from the group Finance$/);
    assert.equal(acts[0].upn, 'old@x::g1');
  });
  test('wiring: owners and members read-only; the decision id keeps the group', () => {
    assert.match(graph, /\/owners\/microsoft\.graph\.user\?\$select=/);
    assert.match(app, /var cut = String\(id\)\.lastIndexOf\('\|'\)/);
  });
});

describe('integrated audits and the portfolio report', () => {
  test('shared clause results are carried to sibling audits, never over a recorded one', () => {
    assert.match(app, /function shareIntegratedResult\(a, key\)/);
    assert.match(app, /window\.CheckpointLib\.LINKED_CLAUSES\.indexOf\(id\) === -1/);
    assert.match(app, /if \(\(b\.results\[key\] \|\| \{\}\)\.r\) continue;/);
  });
  test('the monthly report drafts each note as an email the partner opens, nothing sent', () => {
    assert.match(owner, /function portfolioReportHtml\(rows, today\)/);
    assert.match(owner, /'mailto:' \+ encodeURIComponent\(r\.c\.contactEmail\)/);
  });
});

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
    if (urlPath === '/owner/owner.js') data = String(data).replace('var PARTNER_DATA = null;', 'var PARTNER_DATA = null; window.__ownerTest = { seed: function (d) { PARTNER_DATA = d; renderDashboard(); renderDeliveryBoard(); } };');
    res.writeHead(200, { 'Content-Type': MIME[extname(filePath)] || 'application/octet-stream' });
    res.end(data);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  baseUrl = 'http://127.0.0.1:' + server.address().port;
  try { browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined }); }
  catch (e) { skipReason = 'Chromium not found'; }
}
after(async () => { if (browser) await browser.close(); if (server) server.close(); });
const KEY = 'checkpoint-demo-v8';

describe('in the demo', { skip: skipReason || false }, () => {
  test('phishing follow-up assigns the refresher to the two compromised; groups join the access review; an integrated audit is planned', async () => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(baseUrl + '/checkpoint/index.html?demo=1', { waitUntil: 'networkidle' });
    await page.evaluate(() => window.App.go('training'));
    const pop = ctx.waitForEvent('page').catch(() => null);
    await page.locator('#v-training button', { hasText: 'Follow up a phishing simulation' }).click();
    const box = page.locator('#modalBox');
    await box.locator('text=2 of 8 people were compromised').waitFor();
    await box.locator('button', { hasText: 'Assign and file' }).click();
    await page.waitForFunction((k) => /demo-sim-q3/.test(JSON.parse(localStorage.getItem(k)).settings.phishFollowUps || ''), KEY);
    const rows = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)).training.filter((t) => t.source === 'phishing').map((t) => t.userName), KEY);
    assert.deepEqual(rows.sort(), ['Alex Nguyen', 'Kate O’Brien'].sort());
    await pop;

    await page.evaluate(() => window.App.openAccessReview());
    await page.locator('#drawer button', { hasText: 'Choose groups' }).click();
    await box.locator('textarea').fill('Finance team\nClinical records access');
    await box.locator('button', { hasText: 'Save' }).click();
    await page.locator('#drawer', { hasText: 'Groups reviewed too: Finance team, Clinical records access' }).waitFor();
    await page.locator('#drawer button', { hasText: 'Start the access review' }).click();
    await box.locator('button', { hasText: 'Build the review' }).click();
    await page.locator('#drawer', { hasText: '5 group memberships' }).waitFor();
    const rec = await page.evaluate((k) => JSON.parse(JSON.parse(localStorage.getItem(k)).settings.accessReviews).pop(), KEY);
    assert.ok(Object.keys(rec.reviewers).includes('j.chen@meridianhealth.example'), 'the Finance group owner reviews it');
    await page.evaluate(() => window.App.decideAccess('a.nguyen@meridianhealth.example::g-finance|remove'));
    await page.waitForFunction((k) => JSON.parse(JSON.parse(localStorage.getItem(k)).settings.accessReviews).pop().items.some((i) => i.g === 'g-finance' && i.d === 'remove'), KEY);

    await page.evaluate(() => { window.App.closeDrawer && window.App.closeDrawer(); window.App.go('audits'); window.App.planAuditProgramme(); });
    await box.getByLabel('Internal auditor', { exact: true }).fill('Compliance365', { timeout: 5000 });
    await box.getByRole('button', { name: /^Schedule \d+ audit/ }).click();
    const aud = await page.evaluate(() => { const r = Array.from(document.querySelectorAll('#v-audits tr')).find((x) => /Clauses 4-10 \(management system\), pre-certification/.test(x.innerText)); return r && (r.innerText.match(/AUD-\d+/) || [])[0]; });
    await page.evaluate((id) => window.App.conductAudit(id), aud);
    await page.locator('#drawer button', { hasText: /together$/ }).first().click();
    await box.locator('button', { hasText: /^Plan/ }).click();
    await page.waitForFunction((k) => (JSON.parse(localStorage.getItem(k)).settings.integratedAudits || '').length > 4, KEY);
    const groups = await page.evaluate((k) => JSON.parse(JSON.parse(localStorage.getItem(k)).settings.integratedAudits), KEY);
    assert.ok(groups[0].includes(aud) && groups[0].length >= 2);
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  test('the monthly portfolio report opens with KPIs, clients and drafted notes', async () => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(baseUrl + '/owner/index.html');
    await page.waitForFunction(() => window.__ownerTest && window.CheckpointLib);
    const snap = (await page.evaluate(() => window.CheckpointLib.buildProgressSnapshot({ today: new Date().toISOString().slice(0, 10), pathSteps: [{ label: 'a', phase: 'p', done: true }, { label: 'b', phase: 'p', done: false }], clausesByFw: {}, controlsByFw: {}, docs: [], assets: { total: 0, noOwner: 0 }, risks: [], actions: [], scopeStatement: 'x', delivery: { plan: { week: 3, behind: 2, readyBy: '2027-01-01' }, bookings: {}, certs: {}, objectives: [], lastActivity: new Date().toISOString().slice(0, 10), aiUse: 'none' } })));
    await page.evaluate((snap) => {
      document.getElementById('appShell').style.display = '';
      window.__ownerTest.seed({ clients: [{ _sp: '1', name: 'Acme', tenantId: 't1', status: 'Active', modules: ['iso27001'], lastSynced: new Date().toISOString().slice(0, 10), progress: snap, progressHistory: [], readinessByFw: {}, scoreHistory: [], contactName: 'Ann', contactEmail: 'ann@acme.example' }], entitlements: [], prices: [], errorReports: [], health: [] });
      window.OwnerApp.go('delivery');
    }, snap);
    const [rep] = await Promise.all([ctx.waitForEvent('page'), page.locator('button', { hasText: 'Monthly report' }).click()]);
    await rep.waitForLoadState();
    const t = await rep.locator('body').innerText();
    assert.match(t, /Portfolio report:/);
    assert.match(t, /1\s*Active clients/);
    assert.match(t, /Acme[\s\S]*2 step\(s\) behind plan/);
    assert.match(t, /Status notes to send[\s\S]*Hi Ann/);
    assert.equal(await rep.locator('a[href^="mailto:ann%40acme.example"]').count(), 1);
    assert.deepEqual(errors, []);
    await ctx.close();
  });
});
