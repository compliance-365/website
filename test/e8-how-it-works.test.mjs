// Essential Eight "How this works" panel: per strategy, whether the scan
// can suggest a status, what each feeding check says now, and what no
// scan can see.
import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const L = require('../public/checkpoint/lib.js');
const STRATS = ['E8.1', 'E8.2', 'E8.3', 'E8.4', 'E8.5', 'E8.6', 'E8.7', 'E8.8'].map((code) => ({ code, t: code }));

describe('which strategies the scan can speak to', () => {
  const map = { 'mfa-all': ['E8.7'], 'mfa-priv': ['E8.7'], wdac: ['E8.1'], patch: ['E8.2', 'E8.6'] };
  const defs = [{ id: 'mfa-all', label: 'MFA all' }, { id: 'mfa-priv', label: 'MFA admins' }, { id: 'wdac', label: 'WDAC' }, { id: 'patch', label: 'Patch' }];
  const rows = L.e8Automation(STRATS, map, defs, { 'mfa-all': 'pass', 'mfa-priv': 'fail', wdac: 'manual', patch: 'review' });
  const by = Object.fromEntries(rows.map((r) => [r.code, r]));
  test('a strategy with a scored check is scan-suggested, worst result wins', () => {
    assert.equal(by['E8.7'].mode, 'scan');
    assert.equal(by['E8.7'].worst, 'fail');
    assert.deepEqual(by['E8.7'].checks.map((c) => c.label), ['MFA all', 'MFA admins']);
  });
  test('a mapped check that came back Manual — verify is flagged, not shown as automated', () => {
    assert.equal(by['E8.1'].mode, 'unread');
    assert.equal(by['E8.1'].worst, null);
  });
  test('one check can feed two strategies', () => {
    assert.equal(by['E8.2'].worst, 'review');
    assert.equal(by['E8.6'].worst, 'review');
  });
  test('user application hardening and backups are self-assessed, with the reason', () => {
    ['E8.4', 'E8.8'].forEach((c) => {
      assert.equal(by[c].mode, 'self');
      assert.ok(by[c].manualWhy.length > 20, c);
    });
  });
  test('every strategy says what the scan cannot see', () => {
    rows.forEach((r) => assert.ok(r.limits.length > 40, r.code));
  });
  test('no content pack yet: everything is self-assessed', () => {
    assert.ok(L.e8Automation(STRATS, null, [], null).every((r) => r.mode === 'self'));
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
  test('the SoA shows the panel for Essential Eight only, and it opens', async () => {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(baseUrl + '/checkpoint/index.html?demo=1', { waitUntil: 'networkidle' });
    await page.evaluate(() => window.App.go('soa'));
    await page.evaluate(() => window.App.setSoaFw('iso27001'));
    assert.equal((await page.locator('#soaE8How').innerText()).trim(), '');
    await page.evaluate(() => window.App.setSoaFw('essential8'));
    assert.match(await page.locator('#soaE8How').innerText(), /How Essential Eight works here/i);
    await page.click('#soaE8How [data-action="App.toggleE8How"]');
    const txt = await page.locator('#soaE8How').innerText();
    assert.match(txt, /Pick your target/i);
    assert.match(txt, /E8\.8\s+Regular backups/i);
    assert.match(txt, /The scan can.t see/i);
    assert.equal(await page.locator('#soaE8How .e8-how-row').count(), 8);
    assert.deepEqual(errors, []);
    await page.close();
  });
});
