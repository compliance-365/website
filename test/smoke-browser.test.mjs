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

  /* The control drawer (opened from an SoA row) edits the control in
     place: applicability, status, verification and evidence, and the
     drawer re-renders with the saved value rather than going stale. */
  test('the control drawer edits applicability and status in place', async () => {
    const context = await browser.newContext({ reducedMotion: 'reduce' });
    const page = await context.newPage();
    const errors = collectConsoleErrors(page);
    await page.goto(baseUrl + '/checkpoint/index.html?demo=1', { waitUntil: 'networkidle' });
    await page.waitForSelector('#kpiRow .kpi', { timeout: 10000 });
    await page.evaluate(() => window.App.go('soa'));
    await page.waitForSelector('#soaRows tr', { timeout: 10000 });

    const key = await page.$eval('#soaRows tr[data-id] button[data-action="App.openControlGuidance"]', (b) => b.dataset.id);
    await page.evaluate((k) => window.App.openControlGuidance(k), key);
    const drawerToggle = '#drawer button[data-action="App.toggleApp"]';
    await page.waitForSelector(drawerToggle);

    // Set the status from the drawer's own select.
    const before = await page.$eval(drawerToggle, (b) => b.getAttribute('aria-checked'));
    if (before !== 'true') { await page.click(drawerToggle); await page.waitForTimeout(200); }
    await page.selectOption('#drawer select[data-change-action="App.setSt"]', 'In progress');
    await page.waitForTimeout(200);
    assert.equal(await page.$eval('#drawer select[data-change-action="App.setSt"]', (s) => s.value), 'In progress');
    assert.ok(await page.$('#drawer button[data-action="App.setControlEvidence"]'), 'evidence can be linked from the drawer');

    // Exclude it: one dialog asks for the justification, then the drawer re-renders excluded.
    await page.click(drawerToggle);
    await page.waitForSelector('#modalBox textarea');
    await page.fill('#modalBox textarea', 'Not relevant to this organisation in the demo.');
    await page.locator('#modalBox .m-btns .btn:not(.ghost)').click();
    await page.waitForTimeout(300);
    assert.equal(await page.$eval(drawerToggle, (b) => b.getAttribute('aria-checked')), 'false');
    assert.ok(await page.$('#drawer button[data-action="App.setControlJustification"]'), 'an excluded control can edit its justification');
    assert.equal(await page.$('#drawer select[data-change-action="App.setSt"]'), null, 'no status select while excluded');
    const row = await page.$eval('#soaRows tr[data-id="' + key + '"] button[data-action="App.toggleApp"]', (b) => b.getAttribute('aria-checked'));
    assert.equal(row, 'false', 'the SoA row behind the drawer shows the same value');

    assert.deepEqual(errors, [], 'no console errors editing a control from its drawer');
    await context.close();
  });

  /* An uploaded file declared as the organisation's own version of a
     Checkpoint document: recorded in the register, labelled in the row,
     and never offered the generated-document text editor. */
  test('an uploaded document can be declared our version of a Checkpoint document', async () => {
    const context = await browser.newContext({ reducedMotion: 'reduce' });
    const page = await context.newPage();
    const errors = collectConsoleErrors(page);
    await page.goto(baseUrl + '/checkpoint/index.html?demo=1', { waitUntil: 'networkidle' });
    await page.waitForSelector('#kpiRow .kpi', { timeout: 10000 });
    await page.evaluate(() => window.App.go('documents'));
    await page.waitForSelector('#docRows tr[data-id="demo-doc-6"]', { timeout: 10000 });
    assert.ok(await page.$('#docReplaces option[value="infosec-policy"]'), 'upload offers the Checkpoint documents to replace');

    // Not awaited inside the page: the handler resolves only when the dialog closes.
    await page.evaluate(() => { window.App.editDocumentMeta('demo-doc-6'); });
    const modal = page.locator('#modalBox');
    await modal.getByLabel('This is our version of (a Checkpoint document)', { exact: true }).selectOption('infosec-policy', { timeout: 5000 });
    await modal.getByRole('button', { name: 'Save', exact: true }).click({ timeout: 5000 });
    const row = '#docRows tr[data-id="demo-doc-6"]';
    await page.waitForFunction((sel) => /Our version of: Information Security Policy/.test((document.querySelector(sel) || {}).innerText || ''), row, { timeout: 5000 });
    assert.equal(await page.$(row + ' button[data-action="App.editPolicyContent"]'), null, 'no template text editor for our own document');

    assert.deepEqual(errors, [], 'no console errors declaring an own document');
    await context.close();
  });

  /* Clause autopilot: the clauses page lists what is left on Clauses
     4-10 with Checkpoint's own steps first; running them produces the
     records, the management review form drafts every input, and the
     requirements drawer offers the same steps. */
  test('the clause autopilot runs Checkpoint\'s steps and drafts the management review', async () => {
    const context = await browser.newContext({ reducedMotion: 'reduce' });
    const page = await context.newPage();
    const errors = collectConsoleErrors(page);
    await page.goto(baseUrl + '/checkpoint/index.html?demo=1', { waitUntil: 'networkidle' });
    await page.waitForSelector('#kpiRow .kpi', { timeout: 10000 });
    await page.evaluate(() => window.App.go('clauses'));
    await page.waitForSelector('#clauseAutopilot', { timeout: 5000 });
    const panel = await page.locator('#clauseAutopilot').innerText();
    assert.match(panel, /clause requirements met|Every clause requirement is met/);

    const modal = page.locator('#modalBox');
    await page.evaluate(() => { window.App.adoptSuggestedObjectives(); });
    await modal.getByLabel('Owner', { exact: true }).fill('ISMS Manager', { timeout: 5000 });
    await modal.getByRole('button', { name: 'Adopt', exact: true }).click();
    await page.waitForFunction(() => /Only the right people can sign in to our systems/.test(document.getElementById('v-objectives').innerText), null, { timeout: 5000 });

    await page.evaluate(() => { window.App.planAuditProgramme(); });
    await modal.getByLabel('Internal auditor', { exact: true }).fill('Compliance365', { timeout: 5000 });
    await modal.getByRole('button', { name: /^Schedule \d+ audit/ }).click();
    await page.waitForFunction(() => /pre-certification internal audit/.test(document.getElementById('v-audits').innerText), null, { timeout: 5000 });

    await page.evaluate(() => window.App.startManagementReview());
    await page.waitForSelector('#addReviewPanel #naMR_issues', { state: 'attached', timeout: 5000 });
    for (const k of ['priorActions', 'issues', 'interestedParties', 'performance', 'feedback', 'riskStatus', 'improvement']) {
      assert.ok((await page.$eval('#naMR_' + k, (el) => el.value)).length > 10, k + ' is drafted');
    }
    await page.evaluate(() => window.App.mrStep(3));
    assert.ok(await page.locator('#naReviewResources').isVisible());

    await page.evaluate(() => { window.App.go('clauses'); window.App.openClauseRequirements('iso27001|9.3'); });
    await page.waitForSelector('#drawer .d-sec', { timeout: 5000 });
    assert.deepEqual(errors, [], 'no console errors running the clause autopilot');
    await context.close();
  });

  /* The certification workflow end to end in demo: objectives measured,
     the Annex A plan, an internal audit conducted in the app with a
     finding raised from a line, a management review whose agreed
     actions land in the Actions register, and the Stage 1 pack. */
  test('objectives, Annex A plan, in-app audit, review actions and the Stage 1 pack', async () => {
    const context = await browser.newContext({ reducedMotion: 'reduce' });
    const page = await context.newPage();
    const errors = collectConsoleErrors(page);
    await page.goto(baseUrl + '/checkpoint/index.html?demo=1', { waitUntil: 'networkidle' });
    await page.waitForSelector('#kpiRow .kpi', { timeout: 10000 });
    const modal = page.locator('#modalBox');

    await page.evaluate(() => { window.App.adoptSuggestedObjectives(); });
    await modal.getByLabel('Owner', { exact: true }).fill('ISMS Manager', { timeout: 5000 });
    await modal.getByRole('button', { name: 'Adopt', exact: true }).click();
    await page.evaluate(() => window.App.go('objectives'));
    await page.waitForFunction(() => /Measured by Checkpoint: /.test(document.getElementById('objRows').innerText), null, { timeout: 5000 });

    await page.evaluate(() => window.App.go('soa'));
    await page.waitForFunction(() => /Getting Annex A to 100%|Every applicable control/i.test(document.getElementById('soaAnnexPlan').innerText), null, { timeout: 5000 });

    await page.evaluate(() => { window.App.planAuditProgramme(); });
    await modal.getByLabel('Internal auditor', { exact: true }).fill('Compliance365', { timeout: 5000 });
    await modal.getByRole('button', { name: /^Schedule \d+ audit/ }).click();
    const audId = await page.evaluate(() => { const r = Array.from(document.querySelectorAll('#v-audits tr')).find((x) => /Clauses 4-10 \(management system\), pre-certification/.test(x.innerText)); return r && (r.innerText.match(/AUD-\d+/) || [])[0]; });
    assert.ok(audId, 'the pre-certification audit is listed');
    await page.evaluate((id) => window.App.conductAudit(id), audId);
    const selects = page.locator('#drawer select[data-change-action="App.setAuditResult"]');
    await selects.first().waitFor({ timeout: 5000 });
    await selects.nth(0).selectOption('C');
    await page.waitForFunction(() => /1 of \d+ audited/.test(document.getElementById('auditProgress').innerText), null, { timeout: 5000 });
    await page.locator('#drawer select[data-change-action="App.setAuditResult"]').nth(1).selectOption('Minor');
    await modal.getByLabel('Finding description', { exact: true }).fill('Interested parties not reviewed since last year', { timeout: 5000 });
    await modal.getByRole('button', { name: 'Raise finding', exact: true }).click();
    await page.waitForFunction(() => /ACT-\d+/.test(document.getElementById('drawer').innerText) && /2 of \d+ audited/.test(document.getElementById('auditProgress').innerText), null, { timeout: 5000 });
    await page.evaluate((id) => { window.App.completeAudit(id); }, audId);
    await modal.getByRole('button', { name: 'Complete', exact: true }).click({ timeout: 5000 });

    await page.evaluate(() => window.App.startManagementReview());
    await page.waitForSelector('#naReviewChair', { timeout: 5000 });
    await page.evaluate(() => {
      const A = window.App;
      A.mrField('chair', 'Managing Director');
      A.mrField('attendees', 'Managing Director, ISMS Manager');
      ['priorActions', 'issues', 'interestedParties', 'performance', 'feedback', 'riskStatus', 'improvement'].forEach((k) => A.mrVerdict(k + '|noted'));
      ['suitable', 'adequate', 'effective'].forEach((k) => A.mrField('conclusion.' + k + '.answer', 'yes'));
      A.mrField('improvements', 'Continue the certification plan.');
      A.mrField('resources', 'Current resources are sufficient.');
      A.mrStep(3);
      A.mrAddAction();
      A.mrField('actions.0.title', 'Run a phishing simulation');
      A.mrField('actions.0.owner', 'IT Manager');
      A.mrField('actions.0.due', '2026-12-01');
      A.mrStep(4);
    });
    assert.match(await page.locator('#addReviewPanel').innerText(), /Ready to save/);
    await page.evaluate(() => window.App.mrSave());
    await page.evaluate(() => window.App.go('actions'));
    await page.waitForFunction(() => /Run a phishing simulation/.test(document.getElementById('v-actions').innerText), null, { timeout: 5000 });

    const popup = page.waitForEvent('popup', { timeout: 10000 });
    await page.evaluate(() => { window.App.stage1Pack(); });
    const pack = await popup;
    await pack.waitForLoadState('domcontentloaded');
    await pack.waitForFunction(() => /Stage 1 certification pack/.test(document.documentElement.innerHTML), null, { timeout: 10000 });
    const packHtml = await pack.content();
    assert.match(packHtml, /Internal audit report|Internal audit AUD-/);
    assert.match(packHtml, /Management review/);

    assert.deepEqual(errors, [], 'no console errors in the certification workflow');
    await context.close();
  });

  /* 1.117.0 in demo: the dated plan on the dashboard, objectives tied to
     C/I/A and stated in the policy, owner reminders in Settings, and the
     evidence request offered from the Annex A plan. */
  test('dated plan, C/I/A objectives in the policy, owner reminders and evidence requests', async () => {
    const context = await browser.newContext({ reducedMotion: 'reduce' });
    const page = await context.newPage();
    const errors = collectConsoleErrors(page);
    await page.goto(baseUrl + '/checkpoint/index.html?demo=1', { waitUntil: 'networkidle' });
    await page.waitForSelector('#kpiRow .kpi', { timeout: 10000 });
    const card = await page.$eval('#gettingStartedCard', (el) => el.innerText).catch(() => '');
    if (card) assert.match(card, /week \d+ of your plan/i);

    const modal = page.locator('#modalBox');
    await page.evaluate(() => { window.App.adoptSuggestedObjectives(); });
    await modal.getByLabel('Owner', { exact: true }).fill('ISMS Manager', { timeout: 5000 });
    assert.match(await modal.innerText(), /\[C\]|\[A, I\]|\[C, I\]/);
    await modal.getByRole('button', { name: 'Adopt', exact: true }).click();
    await page.evaluate(() => window.App.go('objectives'));
    await page.waitForFunction(() => /Protects: /.test(document.getElementById('objRows').innerText), null, { timeout: 5000 });

    await page.evaluate(() => window.App.go('documents'));
    await page.evaluate(() => window.App.openDocTool('docGenerate'));
    await page.selectOption('#tplSelect', 'infosec-policy');
    await page.waitForTimeout(300);
    const preview = await page.$eval('#tplPreview', (el) => el.innerText);
    assert.ok(!/\{\{register:/.test(preview), 'the objectives token is resolved, never shown');

    await page.evaluate(() => { window.App.go('settings'); window.App.settingsSection('notifications'); });
    await page.waitForFunction(() => /Owner reminders/.test(document.body.innerText), null, { timeout: 5000 });

    await page.evaluate(() => window.App.go('soa'));
    await page.waitForSelector('#soaAnnexPlan', { timeout: 5000 });
    const req = page.locator('#soaAnnexPlan button[data-action="App.requestAnnexEvidence"]').first();
    if (await req.count()) { await req.click(); await page.waitForTimeout(300); }

    assert.deepEqual(errors, [], 'no console errors in the 1.117.0 flows');
    await context.close();
  });

  /* 1.118.0: the five starter objectives come pre-ticked with their
     resources; a calendar row opens on click and can be closed. */
  test('starter objectives with resources, and calendar rows that open and close', async () => {
    const context = await browser.newContext({ reducedMotion: 'reduce' });
    const page = await context.newPage();
    const errors = collectConsoleErrors(page);
    await page.goto(baseUrl + '/checkpoint/index.html?demo=1', { waitUntil: 'networkidle' });
    await page.waitForSelector('#kpiRow .kpi', { timeout: 10000 });
    const modal = page.locator('#modalBox');
    await page.evaluate(() => { window.App.adoptSuggestedObjectives(); });
    await modal.getByLabel('Owner', { exact: true }).fill('ISMS Manager', { timeout: 5000 });
    const ticked = await modal.locator('input[type=checkbox]:checked').count();
    assert.ok(ticked >= 5 && ticked < await modal.locator('input[type=checkbox]').count(), 'the starter set is ticked, the rest left optional');
    await modal.getByRole('button', { name: 'Adopt', exact: true }).click();
    await page.evaluate(() => window.App.go('objectives'));
    await page.waitForFunction(() => /Resources: /.test(document.getElementById('objRows').innerText), null, { timeout: 5000 });

    await page.evaluate(() => window.App.go('calendar'));
    const row = page.locator('#calRows tr[data-action="App.editCalItem"]').first();
    await row.waitFor({ timeout: 5000 });
    await row.locator('td').nth(1).click();
    const status = modal.getByLabel('Status', { exact: true });
    await status.selectOption('Closed', { timeout: 5000 });
    await modal.getByRole('button', { name: /^Save/ }).click();
    await page.waitForSelector('#calShowFinished button', { timeout: 5000 });

    assert.deepEqual(errors, [], 'no console errors');
    await context.close();
  });

  /* 1.119.0: certification application answers open from the
     Certification page and include the 27006 complexity factors. */
  test('certification application answers', async () => {
    const context = await browser.newContext({ reducedMotion: 'reduce' });
    const page = await context.newPage();
    const errors = collectConsoleErrors(page);
    await page.goto(baseUrl + '/checkpoint/index.html?demo=1', { waitUntil: 'networkidle' });
    await page.waitForSelector('#kpiRow .kpi', { timeout: 10000 });
    await page.evaluate(() => window.App.go('certification'));
    const popup = page.waitForEvent('popup', { timeout: 10000 });
    await page.locator('button[data-action="App.certApplication"]').first().click();
    const rpt = await popup;
    await rpt.waitForFunction(() => /Complexity factors/.test(document.documentElement.innerHTML), null, { timeout: 10000 });
    const html = await rpt.content();
    assert.match(html, /Keeping the scope proportionate/);
    assert.match(html, /IT infrastructure complexity/);
    assert.deepEqual(errors, [], 'no console errors');
    await context.close();
  });

  /* 1.120.0: My tasks (demo "viewing as"), the booking gate refusing
     Stage 2, auditor access and the auditor's landing, and action
     statuses that read Completed. */
  test('My tasks, booking gate, auditor access and action statuses', async () => {
    const context = await browser.newContext({ reducedMotion: 'reduce' });
    const page = await context.newPage();
    const errors = collectConsoleErrors(page);
    await page.goto(baseUrl + '/checkpoint/index.html?demo=1', { waitUntil: 'networkidle' });
    await page.waitForSelector('#kpiRow .kpi', { timeout: 10000 });
    const modal = page.locator('#modalBox');

    await page.evaluate(() => window.App.go('mytasks'));
    await page.waitForSelector('#myTasksBody', { timeout: 5000 });
    const picker = page.locator('#myTasksBody select[data-change-action="App.setMyTasksAs"]');
    await picker.waitFor({ timeout: 5000 });
    await picker.selectOption({ index: 1 });
    await page.waitForFunction(() => /task/.test(document.getElementById('myTasksBody').innerText) && document.querySelectorAll('#myTasksBody .btn').length > 0, null, { timeout: 5000 });
    assert.match(await page.locator('#myTasksBody').innerText(), /Progress towards certification/i);

    await page.evaluate(() => { window.App.bookCertificationAudit('iso27001'); });
    await modal.getByLabel('Stage 2 date', { exact: true }).fill('2027-03-01', { timeout: 5000 });
    await modal.getByRole('button', { name: 'Book', exact: true }).click();
    await page.waitForFunction(() => /Stage 2 cannot be booked yet/.test(document.getElementById('modalBox').innerText), null, { timeout: 5000 });
    await modal.getByRole('button', { name: /Cancel/ }).click();

    await page.evaluate(() => window.App.go('auditor'));
    await page.evaluate(() => { window.App.grantAuditorAccess(); });
    await modal.getByLabel('Auditor name', { exact: true }).fill('Alex Auditor', { timeout: 5000 });
    await modal.getByLabel('Auditor email', { exact: true }).fill('alex@bsi.example');
    await modal.getByRole('button', { name: 'Record access', exact: true }).click();
    await page.waitForFunction(() => /Checkpoint Viewers group/.test(document.getElementById('modalBox').innerText), null, { timeout: 5000 });
    await modal.getByRole('button', { name: 'Done', exact: true }).click();
    await page.waitForFunction(() => /alex@bsi\.example/.test(document.getElementById('auditorBody').innerText), null, { timeout: 5000 });

    await page.evaluate(() => window.App.go('actions'));
    await page.locator('#actFilters button[data-id="Done"]').click();
    assert.equal((await page.locator('#actFilters button[data-id="Done"]').innerText()).trim().toLowerCase(), 'completed');

    const page2 = await context.newPage();
    await page2.goto(baseUrl + '/checkpoint/index.html?demo=1&auditor=alex@bsi.example', { waitUntil: 'networkidle' });
    await page2.waitForFunction(() => document.getElementById('v-auditor').classList.contains('on') && /Welcome, Alex Auditor/.test(document.getElementById('auditorBody').innerText), null, { timeout: 10000 });

    assert.deepEqual(errors, [], 'no console errors');
    await context.close();
  });

  /* The operating rhythm end to end: schedule the recommended recurring
     activities, complete one with its evidence, and see the control it
     covers verified and Implemented. */
  test('scheduling the operating rhythm and completing an activity verifies its controls', async () => {
    const context = await browser.newContext({ reducedMotion: 'reduce' });
    const page = await context.newPage();
    const errors = collectConsoleErrors(page);
    await page.goto(baseUrl + '/checkpoint/index.html?demo=1', { waitUntil: 'networkidle' });
    await page.waitForSelector('#kpiRow .kpi', { timeout: 10000 });
    await page.evaluate(() => window.App.go('calendar'));
    await page.waitForSelector('#calRhythmCard button[data-action="App.setupOperatingRhythm"]', { timeout: 5000 });

    const modal = page.locator('#modalBox');
    // Not awaited inside the page: the handler resolves only when the dialog closes.
    await page.evaluate(() => { window.App.setupOperatingRhythm(); });
    await modal.getByRole('button', { name: /^Schedule \d+ activit/ }).click({ timeout: 5000 });
    const row = page.locator('#calRows tr', { hasText: 'Security log and alert review' });
    await row.waitFor({ timeout: 5000 });
    assert.equal(await page.locator('#calRhythmCard').isVisible(), false, 'the prompt goes once everything is scheduled');

    await row.locator('button[data-action="App.completeCalItem"]').click();
    await modal.getByLabel('Link to the evidence (SharePoint or OneDrive)', { exact: true }).fill('https://contoso.sharepoint.com/evidence/log-review.pdf', { timeout: 5000 });
    await modal.getByRole('button', { name: 'Complete', exact: true }).click({ timeout: 5000 });
    await page.waitForFunction(() => /Last evidence/.test((Array.from(document.querySelectorAll('#calRows tr')).find((r) => /Security log and alert review/.test(r.innerText)) || {}).innerText || ''), null, { timeout: 5000 });

    await page.evaluate(() => { window.App.go('soa'); window.App.openControlGuidance('iso27001|A.8.15'); });
    await page.waitForSelector('#drawer select[data-change-action="App.setSt"]', { timeout: 5000 });
    assert.equal(await page.$eval('#drawer select[data-change-action="App.setSt"]', (el) => el.value), 'Implemented');

    assert.deepEqual(errors, [], 'no console errors running the operating rhythm');
    await context.close();
  });

  /* Document what you do: a calendar frequency is the organisation's to
     change, documents generated before that are flagged, and approving
     an operational policy confirms each statement first. Unticking one
     removes it from the document. */
  test('frequencies are editable, drift is flagged, and approval confirms each statement', async () => {
    const context = await browser.newContext({ reducedMotion: 'reduce' });
    const page = await context.newPage();
    const errors = collectConsoleErrors(page);
    await page.goto(baseUrl + '/checkpoint/index.html?demo=1', { waitUntil: 'networkidle' });
    await page.waitForSelector('#kpiRow .kpi', { timeout: 10000 });
    const modal = page.locator('#modalBox');

    await page.evaluate(() => window.App.go('calendar'));
    const row = page.locator('#calRows tr').first();
    await row.waitFor({ timeout: 5000 });
    const id = await row.getAttribute('data-id');
    // Not awaited inside the page: the handler resolves only when the dialog closes.
    await page.evaluate((x) => { window.App.editCalItem(x); }, id);
    await modal.getByLabel('Frequency', { exact: true }).selectOption('Monthly', { timeout: 5000 });
    await modal.getByRole('button', { name: 'Save', exact: true }).click({ timeout: 5000 });
    await page.waitForFunction((x) => /Monthly/.test((document.querySelector('#calRows tr[data-id="' + x + '"]') || {}).innerText || ''), id, { timeout: 5000 });

    await page.evaluate(() => window.App.go('documents'));
    await page.waitForSelector('#docPracticeCard h3', { timeout: 5000 });
    assert.match(await page.locator('#docPracticeCard').innerText(), /Access Control Policy/);

    const openConfirm = () => page.evaluate(() => { window.App.approveTemplate('Policies & Procedures|Access Control Policy.html'); });
    await openConfirm();
    await modal.getByText('Do you do this?').waitFor({ timeout: 5000 });
    const boxes = modal.locator('input[type="checkbox"]');
    const before = await boxes.count();
    assert.match(await modal.innerText(), /currently/, 'statements show the organisation’s own frequencies');
    await boxes.nth(0).uncheck();
    await modal.getByRole('button', { name: 'Continue to approval' }).click();
    assert.match(await modal.innerText(), /Confirm that the ticked statements/, 'the attestation is required');
    await boxes.nth(before - 1).check();
    await modal.getByRole('button', { name: 'Continue to approval' }).click();
    await modal.getByText(/^Approve “/).waitFor({ timeout: 5000 });
    await modal.getByRole('button', { name: 'Cancel', exact: true }).click();

    await openConfirm();
    // Editing the document made this account its author, so the
    // segregation-of-duties warning comes first now; record anyway.
    const recordAnyway = modal.getByRole('button', { name: 'Record anyway' });
    if (await recordAnyway.isVisible({ timeout: 1500 }).catch(() => false)) await recordAnyway.click();
    await modal.getByText('Do you do this?').waitFor({ timeout: 5000 });
    assert.equal(await modal.locator('input[type="checkbox"]').count(), before - 1, 'the unticked statement is no longer in the document');
    await modal.getByRole('button', { name: 'Cancel', exact: true }).click();

    assert.deepEqual(errors, [], 'no console errors');
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

  /* The policy picker lists a template under its primary framework group
     AND under any entitled framework whose own control codes it cites.
     The second half is what this guards: it replaced a flat "listed
     once, never duplicated across groups", and the tempting way to add
     a CPS 234 group is to move those documents into it instead — which
     would empty an ISO 27001 client's list of its core policies, since
     a CPS 234 client is nearly always an ISO 27001 client too.

     So the assertion is deliberately that the SAME template appears in
     both groups, not merely that a CPS 234 group exists. A revert to
     "list once", or a switch from duplicating to relocating, both leave
     a CPS 234 group standing and both fail here.

     Counts are not asserted. Demo mode carries only a sample of each
     framework's control list (its cps234 set omits the codes the
     Supplier Security Policy cites), so the group is smaller here than
     in a licensed tenant — real behaviour, thin demo data, and pinning
     a number would encode the sample rather than the rule. */
  test('a policy serving two frameworks is listed under both, not moved between them', async () => {
    const context = await browser.newContext({ reducedMotion: 'reduce' });
    const page = await context.newPage();
    const errors = collectConsoleErrors(page);
    await page.goto(baseUrl + '/checkpoint/index.html?demo=1', { waitUntil: 'networkidle' });
    await page.waitForSelector('#kpiRow .kpi', { timeout: 10000 });
    await page.evaluate(() => window.App.go('documents'));
    // optgroup is never 'visible' to Playwright — wait for it in the DOM.
    await page.waitForSelector('#tplSelect optgroup', { state: 'attached', timeout: 10000 });

    const groups = await page.$$eval('#tplSelect optgroup', (els) => {
      const out = {};
      els.forEach((g) => { out[g.label] = [...g.querySelectorAll('option')].map((o) => o.value); });
      return out;
    });

    const cps = Object.keys(groups).find((k) => /CPS\s*234/i.test(k));
    assert.ok(cps, `expected a CPS 234 group in the picker, got: ${Object.keys(groups).join(', ')}`);

    const iso = Object.keys(groups).find((k) => /ISO\s*27001/i.test(k));
    assert.ok(iso, 'expected an ISO 27001 group in the picker');

    assert.ok(groups[cps].includes('infosec-policy'),
      'the Information Security Policy cites CPS 234 paragraphs, so it belongs in the CPS 234 group');
    assert.ok(groups[iso].includes('infosec-policy'),
      'the Information Security Policy must STAY in ISO 27001 — appearing in CPS 234 adds a listing, it does not move one');

    // Selecting the duplicated entry still resolves to one template.
    await page.evaluate(() => window.App.openDocTool('docGenerate'));
    await page.selectOption('#tplSelect', 'infosec-policy');
    await page.waitForTimeout(200);
    const preview = await page.$eval('#tplPreview', (el) => el.innerText);
    assert.match(preview, /Purpose:/, 'selecting a duplicated option should still render its preview');

    assert.deepEqual(errors, [], 'no console errors rendering the template picker');
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

  /* The threat-intel stack picker shipped for months unable to select
     'microsoft' or 'browser' at all — no checkbox named either tag,
     though the feed Lambda emits both (11 and 2 of 40 items in a live
     feed measured 2026-09-15). Ticking one of the options that DID
     exist usually matched nothing, so the list re-rendered identically
     and the whole panel read as broken.

     test/threat-intel-vocabulary.test.mjs holds the three files to one
     shared vocabulary, which is the durable guard. This one is the far
     end of the same wire: that a real click in a real browser visibly
     reorders the list, and that when it cannot, the panel says so
     instead of going quiet. Demo mode's four fixed items make both
     outcomes exact rather than dependent on what CISA published today. */
  test('ticking a tech-stack option visibly re-sorts the threat intel list', async () => {
    const context = await browser.newContext();
    const page = await context.newPage();
    const errors = collectConsoleErrors(page);
    await page.goto(baseUrl + '/checkpoint/index.html?demo=1', { waitUntil: 'networkidle' });
    await page.$$eval('details.nav-group', (els) => els.forEach((el) => { el.open = true; }));
    // Threat intel is in the Full menu.
    await page.click('#navModeBtn');
    await page.$$eval('details.nav-group', (els) => els.forEach((el) => { el.open = true; }));
    await page.click('.nav-item[data-v="threatintel"]');
    await page.waitForSelector('#tiListWrap .card b', { timeout: 10000 });

    const firstVendor = () => page.$eval('#tiListWrap .card b', (el) => el.textContent.trim());

    // The regression itself: 'microsoft' is emitted by the feed and is
    // the one thing every Checkpoint tenant runs, yet had no checkbox.
    const msBox = '[data-change-action="App.toggleThreatIntelStack"][data-id="microsoft-estate"]';
    assert.ok(await page.$(msBox), 'expected a tech-stack option selecting the "microsoft" tag');
    assert.ok(await page.$('[data-change-action="App.toggleThreatIntelStack"][data-id="browser"]'),
      'expected a tech-stack option selecting the "browser" tag');

    // Demo mode's only Microsoft item is also its OLDEST, so date order
    // alone can never put it first — if it moves up, the stack sort did it.
    const before = await firstVendor();
    assert.ok(!/Microsoft/i.test(before), 'expected the Microsoft item not to lead before any stack is declared, got: ' + before);

    await page.check(msBox);
    await page.waitForFunction((prev) => {
      const el = document.querySelector('#tiListWrap .card b');
      return el && el.textContent.trim() !== prev;
    }, before, { timeout: 5000 });
    const after = await firstVendor();
    assert.match(after, /Microsoft/i, 'ticking the Microsoft option should sort its advisory to the top, got: ' + after);

    assert.deepEqual(errors, [], 'no console errors re-sorting the threat intel list');
    await context.close();
  });

  test('a tech-stack option that matches nothing says so rather than looking inert', async () => {
    const context = await browser.newContext();
    const page = await context.newPage();
    const errors = collectConsoleErrors(page);
    await page.goto(baseUrl + '/checkpoint/index.html?demo=1', { waitUntil: 'networkidle' });
    await page.$$eval('details.nav-group', (els) => els.forEach((el) => { el.open = true; }));
    // Threat intel is in the Full menu.
    await page.click('#navModeBtn');
    await page.$$eval('details.nav-group', (els) => els.forEach((el) => { el.open = true; }));
    await page.click('.nav-item[data-v="threatintel"]');
    await page.waitForSelector('#tiListWrap .card', { timeout: 10000 });

    /* Nothing in demo mode is tagged 'ics-ot', so the list cannot
       change — exactly the case that was reported as broken. The panel
       must account for it in words. */
    await page.check('[data-change-action="App.toggleThreatIntelStack"][data-id="ics-ot"]');
    await page.waitForFunction(
      () => /technology you have ticked/.test(document.getElementById('tiListWrap').textContent),
      null, { timeout: 5000 });
    const text = await page.$eval('#tiListWrap', (el) => el.textContent);
    assert.match(text, /technology you have ticked/,
      'a zero-match selection should be stated, not rendered as an unchanged list');

    assert.deepEqual(errors, [], 'no console errors on a zero-match selection');
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
