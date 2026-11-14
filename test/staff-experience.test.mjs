// The everyday staff member (1.193.0). "Start" on a training task opens
// the course itself rather than the Training page in front of it; staff
// do not see the certification build, other people's quiz results or
// the course catalogue; and My tasks lists what they have already done.
// Runs in the demo as a staff member (?role=restricted).
import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const app = readFileSync(new URL('../public/checkpoint/app.js', import.meta.url), 'utf8');

test('a training task\'s button opens its course, and says Resume once started', () => {
  assert.match(app, /kind: 'Training', ref: t\.id, arg: t\.courseId/);
  assert.match(app, /if \(i\.kind === 'Training'\) return i\.arg \? b\('App\.startMyCourse', i\.arg, i\.started \? 'Resume' : 'Start'\)/);
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

describe('in the demo, as a staff member', { skip: skipReason || false }, () => {
  test('My tasks: no certification progress, a Done list, and Start opens the course', async () => {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(baseUrl + '/checkpoint/?demo=1&role=restricted');
    await page.waitForSelector('#v-mytasks.on #myTasksBody .card');
    const body = await page.locator('#myTasksBody').innerText();
    assert.doesNotMatch(body, /Progress towards certification/);
    assert.match(body, /Training passed/i);
    assert.doesNotMatch(body, /Policy\.html/, 'file extensions are dropped from policy names');
    await page.locator('#myTasksBody button[data-action="App.startMyCourse"]').first().click();
    await page.waitForSelector('#courseReader', { state: 'visible' });
    assert.equal(await page.evaluate(() => document.querySelector('.view.on').id), 'v-training');
    await page.goBack();
    assert.equal(await page.evaluate(() => document.querySelector('.view.on').id), 'v-mytasks', 'Back returns to My tasks');
    assert.deepEqual(errors, []);
    await page.close();
  });

  test('Training: plain-English opening, no other people\'s results, no catalogue', async () => {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.goto(baseUrl + '/checkpoint/?demo=1&role=restricted');
    await page.waitForSelector('#v-mytasks.on #myTasksBody .card');
    await page.evaluate(() => window.App.go('training'));
    await page.waitForSelector('#myTrainingBody');
    const intro = await page.locator('#trainingMain .vhead > p').innerText();
    assert.match(intro, /^Your security training\./);
    assert.doesNotMatch(intro, /ISO 27001/);
    assert.equal(await page.locator('#trainingExtras').getByText('What people get wrong').count(), 0);
    assert.equal(await page.locator('#courseCatalogueWrap').isVisible(), false);
    await page.close();
  });

  test('a practitioner still sees all of it', async () => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.goto(baseUrl + '/checkpoint/?demo=1');
    await page.waitForSelector('#appShell');
    await page.evaluate(() => window.App.go('training'));
    await page.waitForSelector('#courseCatalogue .card');
    assert.match(await page.locator('#trainingMain .vhead > p').innerText(), /ISO 27001/);
    assert.equal(await page.locator('#trainingExtras').getByText('What people get wrong').count(), 1);
    await page.evaluate(() => window.App.go('mytasks'));
    assert.match(await page.locator('#myTasksBody').innerText(), /Progress towards certification/);
    await page.close();
  });
});
