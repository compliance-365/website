// A dashboard that reads in one pass, an Operations section that says
// what its charts mean, and an Integrations page for every evidence
// source (Microsoft 365, the scheduled monitor, AWS, GitHub).
import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const L = require('../public/checkpoint/lib.js');

describe('Do next', () => {
  test('one ranked list of at most five, across every source', () => {
    const list = L.dashDoNext({
      nextStep: { label: 'Answer the scope questionnaire', why: 'w', action: 'App.go', id: 'x', button: 'Start' },
      gaps: [{ severity: 'fail', clause: '9.2', title: 'Internal audit', issue: 'Overdue', view: 'audits', fix: 'Plan' }, { severity: 'warn', clause: '9.1', title: 'Monitoring', issue: 'No scan', view: 'scan', fix: 'Run' }],
      approvals: [{ name: 'Information Security Policy.html', key: 'doc|Information Security Policy.html' }],
      aboveAppetite: ['R-1', 'R-2'],
      actions: [{ title: 'Fix MFA', reason: 'Clears a failing check', id: 'ACT-1', tier: 2 }, { title: 'Tidy', reason: '', id: 'ACT-2', tier: 0 }]
    });
    assert.deepEqual(list.map((x) => x.kind + ':' + x.title), [
      'Requirement:Clause 9.2 Internal audit', 'Approval:Approve Information Security Policy', 'Risk:2 risks are above your risk appetite',
      'Action:Fix MFA', 'Next step:Answer the scope questionnaire']);
    assert.equal(L.dashDoNext({ actions: [{ title: 'a', tier: 0 }, { title: 'a', tier: 0 }] }).length, 1, 'no duplicates');
  });
});

describe('readiness strip', () => {
  test('only the frameworks being worked towards, the primary one always', () => {
    assert.deepEqual(L.pursuedFrameworks(['iso27001', 'soc2', 'iso42001', 'essential8'], { iso42001: { clausePct: 57 }, essential8: { pct: 0 } }), ['iso27001', 'iso42001']);
    assert.deepEqual(L.pursuedFrameworks(['soc2', 'essential8'], {}, ['essential8']), ['essential8']);
    assert.deepEqual(L.pursuedFrameworks(['soc2', 'essential8'], {}), ['soc2'], 'never an empty strip');
  });
});

describe('assurance pulse in words', () => {
  const w = (total, counts) => ({ total, counts: counts || {} });
  test('active weeks, a current quiet spell, the longest gap and what is missing', () => {
    const p = L.pulseSummary([w(1, { scan: 1 }), w(0), w(0), w(0), w(0), w(3, { scan: 2, evidence: 1 }), w(0), w(0)]);
    assert.equal(p.activeWeeks, 2);
    assert.equal(p.quietNow, 2);
    assert.equal(p.longestQuiet, 4);
    assert.deepEqual(p.text, ['Compliance work happened in 2 of the last 8 weeks.', 'Nothing recorded for the last 2 weeks: an auditor looks for steady activity, not bursts.', 'Most of it: posture scans (3).', 'No management reviews or internal audits in this period.']);
    assert.match(L.pulseSummary([w(0), w(0), w(0), w(0), w(1, { review: 1, audit: 1 })]).text[1], /longest quiet spell was 4 weeks/);
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
  test('headline, Do next, compact path, framework strip, Operations and Integrations', async () => {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(baseUrl + '/checkpoint/index.html?demo=1', { waitUntil: 'networkidle' });
    await page.waitForSelector('#dashHeadline .dh-tile');
    const head = await page.locator('#dashHeadline').innerText();
    assert.match(head, /Ready for ISO 27001[\s\S]*ISMS health[\s\S]*Next audit[\s\S]*Waiting on you/i);
    assert.match(await page.locator('#nextActionsCard').innerText(), /Do next/i);
    assert.ok(await page.locator('#nextActionsList > .dn-row').count() <= 5, 'five at most before "more"');
    assert.equal(await page.locator('#appetiteBanner').isVisible(), false, 'folded into Do next');
    // The path is one line until opened.
    assert.match(await page.locator('#gettingStartedCard').innerText(), /Week \d+ of your plan[\s\S]*Next:/);
    assert.equal(await page.locator('#gettingStartedCard .gs-stepper').isVisible(), false);
    // Frameworks not started wait behind a toggle.
    const before = await page.locator('#kpiRow .kpi').count();
    await page.click('#kpiRowMore button');
    assert.ok(await page.locator('#kpiRow .kpi').count() > before);
    // Operations: the pulse in words, the drift card points to Integrations.
    await page.evaluate(() => { document.getElementById('dashOperations').open = true; });
    await page.waitForTimeout(300);
    assert.match(await page.locator('#apSummary').innerText(), /Compliance work happened in \d+ of the last 26 weeks/);
    assert.ok(!/\+1[0-9] frameworks/.test(await page.locator('#cxThumbList').innerText()), 'counts frameworks, not mapped controls');
    // Integrations.
    await page.evaluate(() => window.App.go('integrations'));
    await page.waitForSelector('#integrationsBody .integ-card');
    const integ = await page.locator('#integrationsBody').innerText();
    assert.match(integ, /Microsoft 365[\s\S]*Scheduled monitor[\s\S]*AWS[\s\S]*Not set up[\s\S]*GitHub/i);
    assert.match(integ, /cloudtrail:DescribeTrails/);
    assert.match(integ, /SP_HOSTNAME/);
    // The scheduled monitor's setup guide is inside its own card, not a separate card further down.
    // The demo has an automated scan, so its card says it is reporting.
    const azureCard = page.locator('#integrationsBody .integ-card').filter({ hasText: 'Scheduled monitor (Azure)' });
    await azureCard.locator('summary').click();
    assert.match(await azureCard.innerText(), /Reporting: an automated scan was recorded/);
    assert.doesNotMatch(await azureCard.innerText(), /guide is below this list/);
    assert.equal(await page.locator('#integMonitorSetup').count(), 0);
    assert.deepEqual(errors, []);
    await page.close();
  });
});

test('when the monitor is not reporting, How to set it up holds the step-by-step guide', async () => {
  const src = await (await import('node:fs/promises')).readFile(new URL('../public/checkpoint/app.js', import.meta.url), 'utf8');
  assert.match(src, /body: lastAuto \? '<p class="src">Reporting: an automated scan was recorded on ' \+ fmtDate\(lastAuto\) \+ '\. Deployment steps are in azure\/README\.md\.<\/p>' : '<div id="monitorSetupPanel"><\/div>'/);
  assert.match(src, /if \(!lastAuto\) renderMonitorSetupPanel\(\);/);
});
