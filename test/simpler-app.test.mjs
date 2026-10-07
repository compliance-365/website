// A simpler app: a Simple/Full menu, the SoA and clauses as one line per
// row with the detail in the side panel, Settings in sections with
// search, and a shorter Dashboard.
import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const html = readFileSync(new URL('../public/checkpoint/index.html', import.meta.url), 'utf8');
const app = readFileSync(new URL('../public/checkpoint/app.js', import.meta.url), 'utf8');

describe('markup', () => {
  test('the menu has eight groups, with the specialist views in More and marked for the Full menu', () => {
    for (const g of ['Risks &amp; actions', 'Suppliers &amp; assets', 'Controls', 'Documents', 'Audits &amp; reviews', 'More']) assert.match(html, new RegExp('<summary class="nav-label">' + g + '</summary>'));
    assert.match(html, /<details class="nav-group nav-full" data-group="more">/);
    for (const v of ['board', 'constellation', 'quantrisk', 'threatintel', 'auditlog', 'reports', 'trustcenter', 'questionnaires', 'auditorpack']) {
      const more = html.slice(html.indexOf('data-group="more"'), html.indexOf('</details>', html.indexOf('data-group="more"')));
      assert.ok(more.includes('data-v="' + v + '"'), v + ' is under More');
    }
    assert.match(html, /<button class="nav-item nav-full" data-v="frameworks">/);
    assert.match(html, /id="navModeBtn" data-action="App.toggleNavMode"/);
  });
  test('Settings has seven sections', () => {
    for (const k of ['health', 'organisation', 'automation', 'notifications', 'thresholds', 'features', 'advanced']) assert.match(html, new RegExp('<div class="set-sec" data-sec="' + k + '">'));
    const notif = html.slice(html.indexOf('data-sec="notifications"'), html.indexOf('data-sec="thresholds"'));
    assert.ok(notif.includes('id="digestRow"') && notif.includes('id="teamsRow"'));
  });
  test('Dashboard secondary sections and the SoA theme chart are folded', () => {
    assert.match(html, /<details class="dash-more" id="dashPosition">/);
    assert.match(html, /<details class="dash-more" id="dashOperations">/);
    assert.match(html, /<details class="card reg-charts" id="soaCharts">/);
  });
  test('the SoA row keeps the exclusion flag; the panel keeps the evidence folder', () => {
    assert.match(app, /No justification recorded<\/span> <button class="lnk src" data-action="App.setControlJustification"/);
    assert.match(app, /'<div class="d-kv"><span>Evidence folder<\/span>/);
    assert.match(app, /function clauseRecordHtml\(c, key\)/);
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

describe('in the browser', { skip: skipReason || false }, () => {
  test('Simple menu by default, Full on request and remembered', async () => {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(baseUrl + '/checkpoint/index.html?demo=1', { waitUntil: 'networkidle' });
    const visible = () => page.$$eval('.nav-item[data-v]', (els) => els.filter((e) => e.offsetParent !== null).map((e) => e.dataset.v));
    let v = await visible();
    assert.ok(!v.includes('threatintel') && !v.includes('board') && !v.includes('frameworks'), 'specialist views hidden');
    assert.ok(v.includes('soa') && v.includes('risks') && v.includes('settings'));
    await page.evaluate(() => window.App.go('board'));
    assert.ok(await page.$('#v-board.view.on'), 'a hidden view is still reachable');
    await page.click('#navModeBtn');
    await page.$$eval('details.nav-group', (els) => els.forEach((el) => { el.open = true; }));
    v = await visible();
    assert.ok(v.includes('threatintel') && v.includes('frameworks'));
    await page.reload({ waitUntil: 'networkidle' });
    assert.equal(await page.evaluate(() => document.body.classList.contains('nav-simple')), false, 'Full is remembered');
    assert.deepEqual(errors, []);
    await page.close();
  });

  test('SoA, clauses, Settings and Dashboard are short', async () => {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(baseUrl + '/checkpoint/index.html?demo=1', { waitUntil: 'networkidle' });
    const height = (v) => page.evaluate((v) => { window.App.go(v); return new Promise((r) => setTimeout(() => r(document.getElementById('v-' + v).scrollHeight), 400)); }, v);
    const soa = await height('soa');
    assert.ok(soa < 4500, 'SoA height ' + soa);
    const fams = await page.locator('#soaRows .soa-fam-toggle').count();
    assert.ok(fams >= 4);
    const before = await page.locator('#soaRows tr.soa-row').count();
    await page.click('#soaRows [data-action="App.setAllSoaFamilies"][data-id="1"]');
    const after = await page.locator('#soaRows tr.soa-row').count();
    assert.ok(after > before, 'expand all shows every control (' + before + ' → ' + after + ')');
    await page.locator('#soaRows tr.soa-row button[data-action="App.openControlGuidance"]').first().click();
    assert.match(await page.locator('#drawer').innerText(), /Evidence folder/);
    await page.evaluate(() => window.App.closeDrawer());
    const clauses = await height('clauses');
    assert.ok(clauses < 6000, 'clauses height ' + clauses);
    await page.locator('#clauseRows tr.clause-row button[data-action="App.openClauseRequirements"]').first().click();
    assert.match(await page.locator('#drawer').innerText(), /Record[\s\S]*Owner[\s\S]*Evidence folder/i);
    await page.evaluate(() => window.App.closeDrawer());
    const settings = await height('settings');
    assert.ok(settings < 2500, 'settings height ' + settings);
    await page.fill('#settingsSearch', 'Teams');
    assert.equal(await page.locator('.set-sec[data-sec="notifications"]').isVisible(), true);
    assert.equal(await page.locator('.set-sec[data-sec="thresholds"]').isVisible(), false);
    await page.fill('#settingsSearch', '');
    await page.click('#settingsTabs [data-id="advanced"]');
    assert.equal(await page.locator('.set-sec[data-sec="advanced"]').isVisible(), true);
    assert.equal(await page.locator('.set-sec[data-sec="health"]').isVisible(), false);
    const dash = await height('dash');
    assert.ok(dash < 3000, 'dashboard height ' + dash);
    await page.click('#dashPosition > summary');
    await page.waitForTimeout(300);
    assert.equal(await page.locator('#journeyCard').isVisible(), true);
    assert.deepEqual(errors, []);
    await page.close();
  });
});
