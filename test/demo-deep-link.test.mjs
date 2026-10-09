// The website's feature pages open the demo on the screen they describe:
// ?demo=1&view=<menu item>. Anything else lands on the dashboard.
import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

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

async function landing(query) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(baseUrl + '/checkpoint/index.html?demo=1' + query, { waitUntil: 'networkidle' });
  const on = await page.evaluate(() => (document.querySelector('.view.on') || {}).id);
  await page.close();
  assert.deepEqual(errors, []);
  return on;
}

describe('demo deep links', { skip: skipReason || false }, () => {
  test('a menu view opens directly', async () => {
    assert.equal(await landing('&view=documents'), 'v-documents');
    assert.equal(await landing('&view=actions'), 'v-actions');
  });
  test('an unknown or hidden view falls back to the dashboard', async () => {
    assert.equal(await landing('&view=nope'), 'v-dash');
    assert.equal(await landing('&view=selftest'), 'v-dash');
    assert.equal(await landing('&view=%22%3E%3Cimg'), 'v-dash');
  });
});
