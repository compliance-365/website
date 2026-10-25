// Checkpoint 1.181.0: the look of the app. Content starts higher (the
// page intro folds after the first visit), one next step on the
// Dashboard, the SoA leads with its framework switcher, export buttons
// sit in one menu, sentence case, consistent dates, a one-row top bar
// and stacked register cards on phones, and a calmer My tasks.
import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const app = readFileSync(new URL('../public/checkpoint/app.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../public/checkpoint/styles.css', import.meta.url), 'utf8');
const html = readFileSync(new URL('../public/checkpoint/index.html', import.meta.url), 'utf8');

describe('source', () => {
  test('buttons and chips are sentence case', () => {
    const btn = /\n\.btn\{[^}]*\}/.exec(css)[0];
    const chip = /\n\.chip\{[^}]*\}/.exec(css)[0];
    assert.doesNotMatch(btn, /uppercase/);
    assert.doesNotMatch(chip, /uppercase/);
  });
  test('the risk register shows review dates like every other screen', () => {
    const fn = /function riskReviewChip\(r\) \{[\s\S]*?\n  \}/.exec(app)[0];
    assert.doesNotMatch(fn, /esc\(r\.lastReviewed\)/);
    assert.match(fn, /fmtDate\(r\.lastReviewed\)/);
  });
  test('the SoA framework switcher comes before the evidence check and exclusions', () => {
    const soa = html.slice(html.indexOf('id="v-soa"'));
    assert.ok(soa.indexOf('id="soaFwTabs"') < soa.indexOf('App.exportCsv'));
    assert.ok(soa.indexOf('id="soaFwTabs"') < soa.indexOf('id="soaEvidenceCheck"'));
    assert.match(soa, /<div class="soa-strip">\s*<div id="soaEvidenceCheck"><\/div>\s*<div id="soaExclusions"><\/div>\s*<\/div>/);
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
    res.writeHead(200, { 'Content-Type': MIME[extname(filePath)] || 'application/octet-stream' });
    res.end(await readFile(filePath));
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  baseUrl = 'http://127.0.0.1:' + server.address().port;
  try { browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined }); }
  catch (e) { skipReason = 'Chromium not found'; }
}
after(async () => { if (browser) await browser.close(); if (server) server.close(); });

async function open(viewport, seen) {
  const ctx = await browser.newContext({ viewport });
  if (seen) await ctx.addInitScript((v) => localStorage.setItem('cpGuideSeen', JSON.stringify(v)), seen);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(baseUrl + '/checkpoint/index.html?demo=1', { waitUntil: 'networkidle' });
  await page.waitForSelector('#kpiRow .kpi', { timeout: 10000 });
  return { ctx, page, errors };
}

describe('in the demo', { skip: skipReason || false }, () => {
  test('desktop: folded intro, one next step on the Dashboard, Export menu, dates, My tasks', async () => {
    const { ctx, page, errors } = await open({ width: 1440, height: 900 }, ['dash', 'risks', 'mytasks']);
    // A page seen before: the intro paragraph is hidden and lives in About this page.
    assert.equal(await page.locator('#v-dash .vhead > p').isVisible(), false);
    assert.match(await page.locator('#v-dash .pg-about').evaluate((d) => d.textContent), /Live assurance position/);
    // The Dashboard has no Next step bar; Do next is the one list. The path card has one button.
    assert.equal(await page.locator('#v-dash .next-step-bar').count(), 0);
    assert.equal(await page.locator('#guidedSetup .gs-actions .btn, .gs-compact .gs-actions .btn').count(), 1);

    await page.evaluate(() => window.App.go('risks'));
    // Export, Excel, Word and Import share one menu that opens and closes.
    const menu = page.locator('#v-risks details.btn-menu').first();
    assert.equal(await menu.locator('.btn-menu-list [data-action^="App.export"], .btn-menu-list [data-action="App.importCsv"]').count(), 4);
    assert.equal(await page.locator('#v-risks button[data-action="App.exportCsv"]').isVisible(), false);
    await menu.locator('summary').click();
    assert.equal(await page.locator('#v-risks button[data-action="App.exportCsv"]').isVisible(), true);
    await page.locator('#v-risks h1').click();
    assert.equal(await menu.evaluate((d) => d.open), false);
    // Review dates read like the rest of the app, not 2026-10-05.
    assert.doesNotMatch(await page.locator('#riskRows').innerText(), /\b20\d\d-\d\d-\d\d\b/);

    // My tasks: settings in a menu; tasks grouped.
    await page.evaluate(() => { window.App.go('mytasks'); window.App.setMyTasksAs('K. Patel'); });
    assert.equal(await page.locator('#myTasksBody select[data-change-action="App.setMyTasksAs"]').isVisible(), false);
    assert.match(await page.locator('#myTasksBody .my-settings summary').innerText(), /Viewing as K\. Patel/);
    const groups = await page.$$eval('#myTasksBody .my-group', (els) => els.map((e) => e.firstChild.textContent.trim()));
    assert.ok(groups.length > 0);
    assert.deepEqual(groups, ['Overdue', 'This week', 'Later'].filter((g) => groups.includes(g)), 'in order');
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  test('phone: one-row top bar and register rows as cards', async () => {
    const { ctx, page, errors } = await open({ width: 390, height: 844 });
    const h = await page.locator('.top').evaluate((e) => e.getBoundingClientRect().height);
    assert.ok(h <= 70, 'top bar is one row, was ' + h + 'px');
    assert.equal(await page.locator('#btnScanTop').isVisible(), false);
    await page.click('#btnTopMore');
    assert.equal(await page.locator('#btnScanTop').isVisible(), true);
    await page.click('#btnTopMore');
    await page.evaluate(() => window.App.go('risks'));
    await page.waitForSelector('#riskRows td[data-label="Owner"]');
    const td = page.locator('#riskRows tr').first().locator('td[data-label="Owner"]');
    assert.equal(await td.evaluate((e) => getComputedStyle(e).display), 'flex');
    assert.equal(await page.locator('#v-risks table.stack-tbl thead').evaluate((e) => e.getBoundingClientRect().height <= 1), true);
    assert.deepEqual(errors, []);
    await ctx.close();
  });
});
