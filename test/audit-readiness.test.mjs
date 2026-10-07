// Getting ready for the certification auditor: policy approval by the
// right person, an evidence check, a mock audit that needs no AI, and
// the Documents register first.
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
const Lib = require('../public/checkpoint/lib.js');
const html = readFileSync(new URL('../public/checkpoint/index.html', import.meta.url), 'utf8');
const graph = readFileSync(new URL('../public/checkpoint/graph.js', import.meta.url), 'utf8');
const TODAY = '2026-10-07';
const SP = 'https://contoso.sharepoint.com/sites/isms/Shared%20Documents/';

describe('evidence check', () => {
  const targets = Lib.evidenceTargets({
    controls: [
      { fw: 'iso27001', id: 'A.5.1', t: 'Policies', app: true, st: 'Implemented', evidenceUrl: SP + 'policy.docx' },
      { fw: 'iso27001', id: 'A.5.2', t: 'Roles', app: true, st: 'Implemented', evidenceUrl: '' },
      { fw: 'iso27001', id: 'A.5.3', t: 'SoD', app: true, st: 'In progress', evidenceUrl: '' },
      { fw: 'iso27001', id: 'A.5.4', t: 'Mgmt', app: true, st: 'Implemented', evidenceUrl: SP + 'old.pdf' },
      { fw: 'iso27001', id: 'A.7.1', t: 'Perimeter', app: false, st: 'Not started', evidenceUrl: '' }
    ],
    clauses: [{ fw: 'iso27001', id: '4.3', t: 'Scope', st: 'Implemented', evidenceUrl: 'https://example.com/elsewhere' }],
    actions: [{ id: 'ACT-1', title: 'Fix', status: 'Done', evidenceUrl: SP + 'gone.png' }, { id: 'ACT-2', status: 'Done' }, { id: 'ACT-3', status: 'Open', evidenceUrl: SP + 'x' }]
  });
  test('targets: applicable controls, clauses and completed actions', () => {
    assert.deepEqual(targets.map((t) => t.key), ['iso27001|A.5.1', 'iso27001|A.5.2', 'iso27001|A.5.3', 'iso27001|A.5.4', 'iso27001|4.3', 'ACT-1', 'ACT-2']);
  });
  test('issues: link gone, out of date, implemented with none; unprobed links are not judged', () => {
    const probes = {};
    probes[SP + 'policy.docx'] = { ok: true, modified: '2026-09-01T00:00:00Z' };
    probes[SP + 'old.pdf'] = { ok: true, modified: '2025-01-01T00:00:00Z' };
    probes[SP + 'gone.png'] = { ok: false };
    const issues = Lib.evidenceCheckIssues(targets, probes, TODAY, 365);
    assert.deepEqual(issues.map((i) => [i.key, i.issue]), [['iso27001|A.5.2', 'none'], ['iso27001|A.5.4', 'stale'], ['ACT-1', 'missing']]);
    assert.equal(issues[1].modified, '2025-01-01');
  });
  test('only SharePoint links are probed; Graph reads them read-only', () => {
    assert.equal(Lib.isSharePointUrl(SP + 'a'), true);
    assert.equal(Lib.isSharePointUrl('https://contoso-my.sharepoint.com/personal/x'), true);
    assert.equal(Lib.isSharePointUrl('https://evil.com/contoso.sharepoint.com/'), false);
    assert.match(graph, /async function probeEvidence\(url\)/);
    assert.match(graph, /\/driveItem\?\$select=id,lastModifiedDateTime/);
  });
});

describe('mock audit', () => {
  const base = {
    scopeStatement: 'The ISMS supporting the platform.',
    docs: [{ name: 'Information Security Policy.html', status: 'Approved' }],
    audits: [{ id: 'AUD-1', status: 'Completed', completed: '2026-08-01' }],
    reviews: [{ date: '2026-09-01', decisions: 'Approved the plan' }],
    controls: [], risks: [], actions: []
  };
  test('a complete management system with nothing sampled has no findings', () => {
    const m = Lib.mockAudit(base, TODAY, 's');
    assert.deepEqual(m.counts, { Major: 0, Minor: 0, Observation: 0 });
    assert.equal(m.score, 100);
  });
  test('missing scope, unapproved policy, no internal audit and no review are majors', () => {
    const m = Lib.mockAudit({ docs: [{ name: 'Information Security Policy.html', status: 'Draft' }] }, TODAY, 's');
    assert.deepEqual(m.findings.map((f) => f.ref), ['4.3', '5.2', '9.2', '9.3']);
    assert.equal(m.counts.Major, 4);
    assert.match(m.verdict, /^Not ready/);
    assert.equal(m.score, 0);
  });
  test('a review before the latest audit, and review with no outputs', () => {
    assert.ok(Lib.mockAudit(Object.assign({}, base, { reviews: [{ date: '2026-07-01', decisions: 'x' }] }), TODAY, 's').findings.some((f) => f.ref === '9.3.2'));
    assert.ok(Lib.mockAudit(Object.assign({}, base, { reviews: [{ date: '2026-09-01' }] }), TODAY, 's').findings.some((f) => f.ref === '9.3.3' && f.severity === 'Minor'));
  });
  test('sampled controls, risks and actions are tested the way an auditor tests them', () => {
    const m = Lib.mockAudit(Object.assign({}, base, {
      controls: [{ fw: 'iso27001', id: 'A.5.2', t: 'Roles', app: true, st: 'Implemented' }, { fw: 'iso27001', id: 'A.5.3', t: 'SoD', app: true, st: 'In progress', own: 'Kim' }],
      risks: [{ id: 'R-1', status: 'Open', treat: 'Treat', owner: '' }],
      actions: [{ id: 'ACT-1', type: 'Non-conformity (Minor)', status: 'Open' }],
      aboveAppetite: ['R-1']
    }), TODAY, 's');
    const got = m.findings.map((f) => [f.severity, f.ref]);
    for (const want of [['Minor', 'A.5.2'], ['Observation', 'A.5.2'], ['Observation', 'A.5.3'], ['Minor', 'R-1'], ['Minor', 'ACT-1']]) {
      assert.ok(got.some((g) => g[0] === want[0] && g[1] === want[1]), JSON.stringify(want) + ' in ' + JSON.stringify(got));
    }
    assert.ok(m.findings.every((f, i, a) => i === 0 || ['Major', 'Minor', 'Observation'].indexOf(a[i - 1].severity) <= ['Major', 'Minor', 'Observation'].indexOf(f.severity)), 'most severe first');
    assert.deepEqual(m.sample.risks, ['R-1']);
  });
  test('the same seed draws the same sample; a different seed can differ', () => {
    const controls = Array.from({ length: 40 }, (_, i) => ({ fw: 'iso27001', id: 'A.' + i, app: true, st: 'Implemented', evidenceUrl: 'x', own: 'o' }));
    const a = Lib.mockAudit(Object.assign({}, base, { controls }), TODAY, 'one').sample.controls;
    assert.deepEqual(Lib.mockAudit(Object.assign({}, base, { controls }), TODAY, 'one').sample.controls, a);
    assert.equal(a.length, 7);
    assert.notDeepEqual(Lib.mockAudit(Object.assign({}, base, { controls }), TODAY, 'two').sample.controls, a);
  });
});

describe('markup', () => {
  test('Documents: the register comes first; the tools are folded panels opened from the toolbar', () => {
    const sec = html.slice(html.indexOf('<section class="view" id="v-documents">'), html.indexOf('</section>', html.indexOf('<section class="view" id="v-documents">')));
    assert.ok(sec.indexOf('id="docRows"') < sec.indexOf('<details class="card reg-charts" id="docGenerate">'));
    assert.ok(sec.indexOf('id="docRows"') < sec.indexOf('<details class="card reg-charts" id="docUpload">'));
    assert.match(sec, /data-action="App.openDocTool" data-id="docGenerate">\+ Generate a document/);
    assert.match(html, /<div id="mockAuditWrap"><\/div>/);
    assert.match(html, /<div id="soaEvidenceCheck"><\/div>/);
    assert.match(html, /<div id="clauseEvidenceCheck"><\/div>/);
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
const KEY = 'checkpoint-demo-v8';

describe('in the browser', { skip: skipReason || false }, () => {
  test('approval request reaches the approver\'s My tasks and opens the approval', async () => {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(baseUrl + '/checkpoint/index.html?demo=1', { waitUntil: 'networkidle' });
    await page.evaluate(() => window.App.go('documents'));
    const btn = page.locator('#docRows [data-action="App.requestApproval"][data-id="Policies & Procedures|AI Policy.html"]');
    await btn.waitFor();
    const top = await page.evaluate(() => document.getElementById('docRows').getBoundingClientRect().top + window.scrollY);
    assert.ok(top < 800, 'the register starts on the first screen: ' + top);
    await btn.click();
    await page.locator('#modalBox input').first().fill('Mei Chen');
    await page.locator('#modalBox button', { hasText: 'Send request' }).click();
    await page.waitForFunction((k) => /Mei Chen/.test((JSON.parse(localStorage.getItem(k)).settings || {}).approvalRequests || ''), KEY);
    assert.match(await page.locator('#docRows').innerText(), /Awaiting Mei Chen/);
    const s = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)).settings, KEY);
    assert.equal(s.topManagementApprover, 'Mei Chen');
    const req = JSON.parse(s.approvalRequests)[0];
    assert.equal(req.approverEmail, 'm.chen@meridianhealth.example');
    await page.evaluate(() => { window.App.go('mytasks'); window.App.setMyTasksAs('Mei Chen'); });
    const task = page.locator('#myTasksBody [data-action="App.approveRequested"]');
    await task.waitFor();
    await task.click();
    await page.waitForSelector('#modalBox h3');
    const title = await page.locator('#modalBox h3').innerText();
    assert.match(title, /^(Approve “AI Policy\.html”|Not ready to approve|Check|You are authorising your own work)/, "the approval path opens");
    if (/^Approve/.test(title)) assert.equal(await page.locator('#modalBox input').first().inputValue(), 'Mei Chen');
    assert.deepEqual(errors, []);
    await page.close();
  });

  test('evidence check card and mock audit render, run and offer fixes', async () => {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(baseUrl + '/checkpoint/index.html?demo=1', { waitUntil: 'networkidle' });
    await page.evaluate(() => window.App.go('soa'));
    await page.waitForSelector('#soaEvidenceCheck .ev-check');
    assert.match(await page.locator('#soaEvidenceCheck').innerText(), /Not checked yet/);
    await page.click('#soaEvidenceCheck [data-action="App.checkEvidence"]');
    await page.waitForFunction(() => /Checked /.test(document.getElementById('soaEvidenceCheck').innerText));
    assert.match(await page.locator('#soaEvidenceCheck').innerText(), /implemented with no evidence|every evidence link works/);
    await page.evaluate(() => window.App.go('certification'));
    await page.click('#mockAuditWrap [data-action="App.runMockAudit"]');
    await page.waitForSelector('#mockAuditWrap .mock-score');
    const txt = await page.locator('#mockAuditWrap').innerText();
    assert.match(txt, /\d+ major · \d+ minor · \d+ observation/);
    assert.match(txt, /Sampled controls/);
    const saved = await page.evaluate((k) => JSON.parse(JSON.parse(localStorage.getItem(k)).settings.mockAuditLast), KEY);
    assert.equal(typeof saved.score, 'number');
    assert.deepEqual(errors, []);
    await page.close();
  });
});
