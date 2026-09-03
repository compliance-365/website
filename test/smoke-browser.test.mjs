// Browser smoke test for the Checkpoint SPA — the one thing the rest of
// this test suite can't catch. Every other file here tests pure logic
// (lib.js, the Azure Function, the Lambdas); none of them boot an actual
// browser, so a thrown exception in a render path — the kind that breaks
// a whole view for every user — could pass all of them cleanly. This
// session alone found one such bug by hand (a Dashboard panel that
// collapsed its own <details> sections on every keystroke) that a test
// like this would have caught automatically instead.
//
// Runs entirely against demo mode (?demo=1) — no MSAL, no real tenant,
// no network beyond a static file server this file spins up itself
// against public/. Deliberately scoped as a SMOKE test, not a
// functional one: "did this render without throwing," not "is every
// business rule correct" — that's what the ~1000 pure-function tests
// elsewhere in this suite are for.
//
// Skips cleanly (not a failure) if Playwright/Chromium isn't available
// locally — e.g. a contributor who hasn't run
// `npx playwright install chromium`. CI always has it (see
// .github/workflows/test.yml's dedicated install step), so it always
// runs there, which is the actual point of this file.
import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const PUBLIC_DIR = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'public');
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.ico': 'image/x-icon'
};

let chromium = null, skipReason = null;
try {
  ({ chromium } = await import('playwright'));
} catch (e) {
  skipReason = 'playwright is not installed locally — run `npm install` (CI installs it automatically)';
}

let server = null, baseUrl = '', browser = null;
if (!skipReason) {
  server = createServer(async (req, res) => {
    try {
      const urlPath = decodeURIComponent(req.url.split('?')[0]);
      let filePath = join(PUBLIC_DIR, urlPath);
      let st = await stat(filePath).catch(() => null);
      if (st && st.isDirectory()) { filePath = join(filePath, 'index.html'); st = await stat(filePath).catch(() => null); }
      if (!st) { res.writeHead(404); res.end('Not found'); return; }
      const data = await readFile(filePath);
      res.writeHead(200, { 'Content-Type': MIME[extname(filePath)] || 'application/octet-stream' });
      res.end(data);
    } catch (e) {
      res.writeHead(500); res.end('Server error: ' + (e && e.message));
    }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  baseUrl = 'http://127.0.0.1:' + server.address().port;
  try {
    // PLAYWRIGHT_CHROMIUM_EXECUTABLE is a local-dev-only escape hatch for
    // environments with a pre-provisioned, non-default browser path;
    // unset (the normal case, including CI after `playwright install`),
    // this lets Playwright find the browser itself.
    browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined });
  } catch (e) {
    skipReason = 'Chromium browser binary not found — run `npx playwright install chromium` (' + String(e && e.message || e).split('\n')[0] + ')';
  }
}

function collectConsoleErrors(page) {
  const errors = [];
  page.on('pageerror', (err) => errors.push(String(err)));
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    var text = msg.text();
    // favicon.ico is served with a plain 404 by the smoke server (no
    // icon file at all) — not a real app bug, and not worth every dev-
    // mode nav-view test having to special-case it individually.
    if (/favicon/i.test(text)) return;
    errors.push(text);
  });
  return errors;
}

describe('Checkpoint — browser smoke test (demo mode)', { skip: skipReason || undefined }, () => {
  after(async () => {
    if (browser) await browser.close();
    if (server) await new Promise((resolve) => server.close(resolve));
  });

  test('the Dashboard loads with no console errors and its KPI row renders', async () => {
    const context = await browser.newContext();
    const page = await context.newPage();
    const errors = collectConsoleErrors(page);
    await page.goto(baseUrl + '/checkpoint/index.html?demo=1', { waitUntil: 'networkidle' });
    await page.waitForSelector('#kpiRow .kpi', { timeout: 10000 });
    const kpiCount = await page.$$eval('#kpiRow .kpi', (els) => els.length);
    assert.ok(kpiCount > 0, 'expected at least one KPI tile to render on the Dashboard');
    assert.deepEqual(errors, [], 'no console errors loading the Dashboard');
    await context.close();
  });

  test('every visible nav view renders without a console error', async () => {
    const context = await browser.newContext();
    const page = await context.newPage();
    const errors = collectConsoleErrors(page);
    await page.goto(baseUrl + '/checkpoint/index.html?demo=1', { waitUntil: 'networkidle' });

    // Most of the sidebar lives inside collapsible <details> groups
    // (only "Risk & posture" and "Frameworks" default open — see
    // index.html's own comment on that), and a child of a closed
    // <details> in this Chromium build still reports a non-null
    // offsetParent/a normal bounding rect despite not truly being
    // clickable — Playwright's own actionability check (correctly)
    // refuses it. Force every group open first, matching what a
    // thorough manual pass would do, rather than trying to filter by
    // visibility with DOM APIs that don't agree with Playwright here.
    await page.$$eval('details.nav-group', (els) => els.forEach((el) => { el.open = true; }));

    // Only nav items actually present in demo mode — some are gated by
    // entitlement and this test should adapt to whatever demo mode
    // currently ships, not hardcode a list that goes stale.
    const navIds = await page.$$eval('.nav-item[data-v]', (els) =>
      els.filter((el) => el.offsetParent !== null).map((el) => el.dataset.v)
    );
    assert.ok(navIds.length >= 10, 'expected most of the app\'s nav to be visible in demo mode, got: ' + navIds.join(', '));

    for (const id of navIds) {
      errors.length = 0;
      await page.click('.nav-item[data-v="' + id + '"]');
      await page.waitForTimeout(250);
      const activeSection = await page.$('#v-' + id + '.view.on');
      assert.ok(activeSection, 'clicking nav item "' + id + '" should show its #v-' + id + ' section');
      assert.deepEqual(errors, [], 'no console errors navigating to "' + id + '"');
    }
    await context.close();
  });

  test('running a demo scan completes and updates the posture score', async () => {
    const context = await browser.newContext();
    const page = await context.newPage();
    const errors = collectConsoleErrors(page);
    await page.goto(baseUrl + '/checkpoint/index.html?demo=1', { waitUntil: 'networkidle' });
    await page.click('.nav-item[data-v="scan"]');
    await page.waitForTimeout(400);
    await page.click('[data-action="App.runScan"]');
    await page.waitForFunction(
      () => { var el = document.getElementById('gNum'); return el && el.textContent.trim() !== '—' && el.textContent.trim() !== ''; },
      { timeout: 15000 }
    );
    const scoreText = await page.$eval('#gNum', (el) => el.textContent.trim());
    assert.match(scoreText, /^\d+$/, 'posture score gauge should show a number after a scan, got "' + scoreText + '"');
    assert.deepEqual(errors, [], 'no console errors running a demo scan');
    await context.close();
  });

  test('the Dashboard\'s "Next 3 actions" card and continuous-monitoring panel render without error', async () => {
    const context = await browser.newContext();
    const page = await context.newPage();
    const errors = collectConsoleErrors(page);
    await page.goto(baseUrl + '/checkpoint/index.html?demo=1', { waitUntil: 'networkidle' });
    await page.waitForSelector('#kpiRow .kpi', { timeout: 10000 });
    // Either element existing and non-crashing is the bar here — content
    // correctness (ranking, wording) is nextBestActions()'s own unit
    // tests' job, not this smoke test's.
    const nextActionsExists = await page.$('#nextActionsCard');
    const monitorExists = await page.$('#monitorStatus, #monitorSetupPanel');
    assert.ok(nextActionsExists, '#nextActionsCard should exist in the Dashboard DOM');
    assert.ok(monitorExists, 'a continuous-monitoring panel should exist in the Dashboard DOM');
    assert.deepEqual(errors, [], 'no console errors rendering the Dashboard\'s extra panels');
    await context.close();
  });
});

/* A failed chromium.launch() (the skip path above) can leave Playwright's
   own internal driver connection open, keeping Node's event loop alive
   indefinitely even once every test here has finished — a contributor
   running `npm test` locally without `npx playwright install chromium`
   would see their terminal hang forever instead of a clean skip. Real CI
   never takes this path (Chromium is always installed there via the
   workflow's dedicated install step), so this only ever fires locally.
   setImmediate lets node:test's own runner finish processing/reporting
   the registered skip before this forces the process closed. */
if (skipReason) {
  setImmediate(() => process.exit(process.exitCode ?? 0));
}
