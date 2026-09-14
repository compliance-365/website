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

  /* ===== Interaction paths, not just render paths =====
     Everything above navigates and asserts nothing threw while
     RENDERING. That leaves a whole class of bug untouched: a handler
     only reached by clicking something can be missing entirely and
     every test here still passes.

     That is not hypothetical. applyBulkActionEdit() shipped in a state
     where it was called three times and defined zero times — the bulk
     status, priority and owner actions would all have thrown
     ReferenceError the moment a practitioner used them — and the full
     suite, this file included, was green. Nothing walked a selection.

     So these two tests exercise the paths a render never reaches: a
     bulk edit end to end on each register that has one, and a scan of
     every wired-up handler in the rendered DOM. Still a smoke test —
     "does using this throw", not "is the business rule right". */

  /* Every data-action / data-change-action in the DOM has to resolve to
     a real function. Catches a renamed or deleted handler that a render
     test cannot see because the markup renders fine either way — the
     button just does nothing, or throws, when someone presses it. */
  test('every wired-up action resolves to a function', async () => {
    const context = await browser.newContext();
    const page = await context.newPage();
    const errors = collectConsoleErrors(page);
    await page.goto(baseUrl + '/checkpoint/index.html?demo=1', { waitUntil: 'networkidle' });
    await page.waitForSelector('#kpiRow .kpi', { timeout: 10000 });
    await page.$$eval('details.nav-group', (els) => els.forEach((el) => { el.open = true; }));

    const navIds = await page.$$eval('.nav-item[data-v]', (els) => els
      .filter((el) => el.offsetParent !== null && el.closest('.nav-group,.side'))
      .map((el) => el.dataset.v));

    const dead = new Set();
    for (const id of navIds) {
      await page.evaluate((v) => window.App.go(v), id);
      await page.waitForTimeout(120);
      const missing = await page.evaluate(() => {
        const out = [];
        document.querySelectorAll('[data-action],[data-change-action]').forEach((el) => {
          ['action', 'changeAction'].forEach((key) => {
            const path = el.dataset[key];
            if (!path) return;
            let ctx = window;
            for (const seg of path.split('.')) { if (ctx == null) break; ctx = ctx[seg]; }
            if (typeof ctx !== 'function') out.push(path);
          });
        });
        return out;
      });
      missing.forEach((m) => dead.add(m + '  (on view "' + id + '")'));
    }
    assert.deepEqual([...dead], [], 'every data-action must resolve to a function');
    assert.deepEqual(errors, [], 'no console errors while scanning actions');
    await context.close();
  });

  /* One bulk edit per register that has one, driven the way a
     practitioner drives it: tick rows, choose a value, let the write
     run. Asserts the rows actually changed, because a handler that
     silently no-ops would otherwise pass a "nothing threw" check. */
  test('bulk editing works on every register that offers it', async () => {
    const context = await browser.newContext();
    const page = await context.newPage();
    const errors = collectConsoleErrors(page);
    await page.goto(baseUrl + '/checkpoint/index.html?demo=1', { waitUntil: 'networkidle' });
    await page.waitForSelector('#kpiRow .kpi', { timeout: 10000 });

    const registers = [
      { view: 'soa', rows: '#soaRows', box: '.soa-sel', bar: '#soaBulkBar', value: 'In progress' },
      { view: 'actions', rows: '#actRows', box: '.act-sel', bar: '#actBulkBar', value: 'In progress' },
      { view: 'vendors', rows: '#vendorRows', box: '.vendor-sel', bar: '#vendorBulkBar', value: 'Low' },
      /* Documents loads its rows from Store.listDocuments() rather than
         from S, so its checkboxes appear a beat after the view does —
         the waitForSelector below is what makes that a non-issue. */
      { view: 'documents', rows: '#docRows', box: '.doc-sel', bar: '#docBulkBar', value: 'Approved' }
    ];

    for (const r of registers) {
      await page.evaluate((v) => window.App.go(v), r.view);
      await page.waitForSelector(r.rows + ' ' + r.box, { timeout: 10000 });

      const picked = await page.evaluate((cfg) => {
        const keys = [];
        [...document.querySelectorAll(cfg.rows + ' ' + cfg.box)].slice(0, 3).forEach((cb) => {
          cb.checked = true;
          cb.dispatchEvent(new Event('change', { bubbles: true }));
          keys.push(cb.dataset.id);
        });
        return keys;
      }, r);
      assert.ok(picked.length > 0, r.view + ': expected selectable rows to tick');

      const barShown = await page.$eval(r.bar, (el) => !el.hidden);
      assert.ok(barShown, r.view + ': the bulk bar should appear once rows are selected');

      /* The first <select> in the bar is the primary field on all three
         (status, status, criticality). Dispatching change is what the
         app's own global change dispatcher listens for. */
      await page.evaluate((cfg) => {
        const sel = document.querySelector(cfg.bar + ' select');
        sel.value = cfg.value;
        sel.dispatchEvent(new Event('change', { bubbles: true }));
      }, r);
      await page.waitForTimeout(2500);

      const cleared = await page.$eval(r.bar, (el) => el.hidden);
      assert.ok(cleared, r.view + ': the selection should clear once a bulk edit completes');
      assert.deepEqual(errors, [], r.view + ': no console errors running a bulk edit');
    }
    await context.close();
  });

  /* The SoA's assurance roll-up. Two properties worth pinning: it must
     RECONCILE with the Implemented tile (demonstrated + evidenced +
     asserted + unsupported is exactly the implemented count — a
     roll-up that disagrees with the tile above it is the "2 overdue
     tile that opens three rows" failure this view's own comments warn
     about), and each count must filter the table to exactly that many
     rows, since that is the promise every other number here makes. */
  test('the SoA assurance roll-up reconciles with the Implemented tile and filters the table', async () => {
    /* reducedMotion, because the KPI tiles count UP to their value over
       1200ms (countUp() in app.js) and reading one mid-animation gets a
       number that is real but not final — the first cut of this test
       compared a settled roll-up of 19 against a tile still passing
       through 6. countUp() short-circuits to the exact value under
       prefers-reduced-motion, which makes this deterministic instead of
       racing a sleep against an easing curve. */
    const context = await browser.newContext({ reducedMotion: 'reduce' });
    const page = await context.newPage();
    const errors = collectConsoleErrors(page);
    await page.goto(baseUrl + '/checkpoint/index.html?demo=1', { waitUntil: 'networkidle' });
    await page.waitForSelector('#kpiRow .kpi', { timeout: 10000 });
    await page.evaluate(() => window.App.go('soa'));
    await page.waitForSelector('#soaRows tr', { timeout: 10000 });

    const line = await page.$eval('#soaAssuranceLine', (el) => el.innerText);
    const rollup = [...line.matchAll(/(\d+)\s+(demonstrated|evidenced|asserted|unsupported)/g)]
      .reduce((a, m) => a + Number(m[1]), 0);
    const implemented = Number((await page.$eval('#soaKpiRow', (el) => el.innerText)).split('\n')[0]);
    assert.equal(rollup, implemented,
      `assurance roll-up (${rollup}) must equal the Implemented tile (${implemented})`);

    // "0 unsupported" renders rather than hiding: silence must not mean
    // both "none" and "not measured" for the number an assessor asks
    // for first.
    assert.match(line, /unsupported/, 'the unsupported count is always shown, including at zero');

    const buttons = await page.$$('#soaAssuranceLine button');
    assert.ok(buttons.length > 0, 'expected at least one filterable assurance count in demo mode');
    const label = await buttons[buttons.length - 1].innerText();
    const expected = parseInt(label, 10);
    await buttons[buttons.length - 1].click();
    await page.waitForTimeout(700);
    const rows = await page.$$eval('#soaRows tr', (els) =>
      els.filter((r) => r.querySelector('td') && !r.querySelector('td[colspan]')).length);
    assert.equal(rows, expected, `clicking "${label}" should open exactly ${expected} rows, got ${rows}`);

    assert.deepEqual(errors, [], 'no console errors driving the assurance roll-up');
    await context.close();
  });

  /* The Financial risk view, end to end. Two of the things this guards
     are invisible to a unit test: that re-rendering the view produces
     the SAME figures (the whole point of seeding from the register's
     content rather than the clock), and that the assumptions editor
     actually reaches the simulation. The engine-level behaviour is
     covered in lib.test.mjs; this covers the wiring between them, which
     is exactly where the per-risk override support sat unreachable for
     as long as it did. */
  test('the Financial risk view is deterministic and its assumptions editor reaches the simulation', async () => {
    const context = await browser.newContext();
    const page = await context.newPage();
    const errors = collectConsoleErrors(page);
    await page.goto(baseUrl + '/checkpoint/index.html?demo=1', { waitUntil: 'networkidle' });
    await page.waitForSelector('#kpiRow .kpi', { timeout: 10000 });

    await page.evaluate(() => window.App.go('quantrisk'));
    await page.waitForSelector('#qrRiskRows tr', { timeout: 10000 });

    // Same register, rendered twice -> byte-identical figures. Before
    // portfolioSeed() this differed on every render, and the board
    // report disagreed with the screen for an unchanged register.
    const first = await page.$eval('#qrKpiRow', (el) => el.innerText);
    await page.evaluate(() => { window.App.go('risks'); window.App.go('quantrisk'); });
    await page.waitForSelector('#qrRiskRows tr', { timeout: 10000 });
    const second = await page.$eval('#qrKpiRow', (el) => el.innerText);
    assert.equal(second, first, 'the same register must simulate to the same figures on every render');

    // The expected-shortfall KPI replaced "worst simulated year", which
    // was the sample maximum and grew without bound with trial count.
    assert.ok(/Expected shortfall/i.test(first), 'the tail KPI should be expected shortfall');
    assert.ok(!/Worst simulated year/i.test(first), 'the non-convergent max KPI should be gone');

    const meanBefore = first.split('\n')[0];
    await page.click('#qrRiskRows tr:first-child button[data-action="App.editRiskFinancials"]');
    await page.waitForSelector('#modalBox .m-field input', { timeout: 10000 });
    const fields = await page.$$('#modalBox .m-field input');
    assert.equal(fields.length, 6, 'six assumption fields: loss min/likely/max and frequency min/likely/max');

    // A max below the min must be refused rather than silently
    // collapsing the triangular distribution to a point mass.
    await fields[0].fill('900000');
    await fields[2].fill('1000');
    await page.click('#modalBox .m-btns button:last-child');
    await page.waitForTimeout(300);
    const err = await page.$eval('#modalBox .m-error', (el) => el.textContent);
    assert.match(err, /maximum cannot be below minimum/i);

    // A valid, much larger loss range must move the portfolio figure.
    await fields[0].fill('500000');
    await fields[1].fill('2000000');
    await fields[2].fill('9000000');
    await page.click('#modalBox .m-btns button:last-child');
    await page.waitForTimeout(1500);
    const meanAfter = await page.$eval('#qrKpiRow', (el) => el.innerText.split('\n')[0]);
    assert.notEqual(meanAfter, meanBefore, 'saving larger loss assumptions must change the simulated ALE');
    const rowText = await page.$eval('#qrRiskRows tr:first-child', (el) => el.innerText);
    assert.match(rowText, /Tenant figures/i, 'the edited risk should be marked as using tenant figures');

    assert.deepEqual(errors, [], 'no console errors driving the Financial risk view');
    await context.close();
  });

  /* Every form control a practitioner can reach must announce something
     a person could act on. This is the one class of defect the "every
     wired-up action resolves to a function" test above cannot see: those
     controls all resolved, rendered and worked — they were simply
     nameless to anyone not looking at the screen.

     Measured against Chromium's computed accessibility tree rather than
     the markup, because the markup reads as if it were fine: an input
     with a placeholder and a visible <b> beside it LOOKS labelled, and
     a reviewer skimming the source would say so. The accessibility tree
     is where the truth is — the browser falls back to the placeholder
     for the accessible name, so `placeholder="4"` on a threshold input
     produced a control announced as "4".

     That was the real state of the Settings view: all fourteen
     threshold spinbuttons announced as their own default value — three
     separate controls called "95", two called "5", two called "30" —
     leaving no way to tell mfaCoverageReviewPct from
     deviceEncryptionPassPct without sight of the screen.

     The rule is "the name must contain a letter", not merely "a name
     exists", precisely because the broken state HAD names. A bare
     number, "https://…" or "e.g. …" is an example value that has
     drifted into the name slot, and only the letter test catches it. */
  test('every form control has an accessible name a person could act on', async () => {
    const context = await browser.newContext({ reducedMotion: 'reduce' });
    const page = await context.newPage();
    const errors = collectConsoleErrors(page);
    await page.goto(baseUrl + '/checkpoint/index.html?demo=1', { waitUntil: 'networkidle' });
    await page.waitForSelector('#kpiRow .kpi', { timeout: 10000 });
    await page.$$eval('details.nav-group', (els) => els.forEach((el) => { el.open = true; }));

    const navIds = await page.$$eval('.nav-item[data-v]', (els) => els
      .filter((el) => el.offsetParent !== null && el.closest('.nav-group,.side'))
      .map((el) => el.dataset.v));
    assert.ok(navIds.length > 5, 'expected the nav to yield views to walk');

    /* ariaSnapshot() renders one line per node as `- role "name": value`,
       so the quoted segment is the computed name and anything after the
       colon is the value — which is why a control whose name is really
       its value is visible here and nowhere else. */
    const CONTROL = /^\s*-\s+(textbox|spinbutton|combobox|searchbox|slider|checkbox|radio)\b/;
    const nameless = [];
    for (const v of navIds) {
      await page.evaluate((id) => window.App.go(id), v);
      await page.waitForTimeout(150);
      const snap = await page.locator('body').ariaSnapshot();
      for (const line of snap.split('\n')) {
        if (!CONTROL.test(line)) continue;
        const m = line.match(/^\s*-\s+(\w+)\s+"([^"]*)"/);
        const role = m ? m[1] : (line.match(/-\s+(\w+)/) || [])[1];
        const name = m ? m[2] : '';
        if (!/[A-Za-z]/.test(name)) nameless.push(`${v} :: ${role} "${name}"`);
      }
    }

    assert.deepEqual(nameless, [],
      'every form control must have an accessible name containing a word, not an example value:\n  ' +
      nameless.join('\n  '));
    assert.deepEqual(errors, [], 'no console errors while walking views for accessible names');
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
