// Business risks: scan findings and scope suggestions roll up into at
// most 15 business risks, the way an auditor reads a register, and the
// posture scan page is one line per check with the detail on demand.
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
const app = readFileSync(new URL('../public/checkpoint/app.js', import.meta.url), 'utf8');
const store = readFileSync(new URL('../public/checkpoint/store.js', import.meta.url), 'utf8');
const libSrc = readFileSync(new URL('../public/checkpoint/lib.js', import.meta.url), 'utf8');

/* The scan's own templates, read from app.js. */
function scanTemplates() {
  const i = app.indexOf('  var TPL = {');
  let d = 0, j = i + 12;
  for (; j < app.length; j++) { if (app[j] === '{') d++; else if (app[j] === '}') { d--; if (d === 0) break; } }
  return (0, eval)('(' + app.slice(i + 12, j + 1) + ')');
}
const TPL = scanTemplates();
const CTX = [...libSrc.matchAll(/key: '(ctx-[a-z-]+)'/g)].map((m) => m[1]);

describe('the business risk catalogue', () => {
  test('at most 15 business risks, each with a title, C/I/A, controls, threat and consequence', () => {
    assert.ok(Lib.BUSINESS_RISKS.length <= 15);
    const keys = new Set();
    Lib.BUSINESS_RISKS.forEach((b) => {
      assert.ok(!keys.has(b.key)); keys.add(b.key);
      assert.ok(b.title && b.cat && b.cia.length && b.controls.length && b.threat && b.consequence, b.key);
    });
  });
  test('every scan finding and every scope suggestion maps to one', () => {
    const unmapped = Object.keys(TPL).concat(CTX).filter((k) => !Lib.businessRiskKeyFor(k));
    assert.deepEqual(unmapped, []);
    Object.values(Lib.BUSINESS_RISK_OF).forEach((k) => assert.ok(Lib.businessRiskDef(k), k));
    assert.equal(Lib.businessRiskKeyFor('ai-risk-abc123'), 'biz-ai');
    assert.equal(Lib.businessRiskKeyFor('something-new'), null);
  });
  test('a full demo scan\'s findings become 12 business risks, not 40', () => {
    assert.equal(Lib.groupProposals(Object.keys(TPL), TPL, []).length, 12);
  });
});

describe('groupProposals()', () => {
  const g = Lib.groupProposals(['legacy', 'legacy-auth-observed', 'admins', 'unknown-x'], Object.assign({ 'unknown-x': { risk: { title: 'Odd', L: 1, I: 1, controls: ['A.1'] }, actions: [{ t: 'Do it' }] } }, TPL), []);
  test('findings about the same issue become one risk, worst rating, most severe first', () => {
    assert.deepEqual(g.map((x) => x.key), ['biz-account-takeover', 'biz-privileged-access', 'unknown-x']);
    const at = g[0];
    assert.deepEqual(at.tpls, ['legacy', 'legacy-auth-observed']);
    assert.equal(at.L * at.I, 25);
    assert.equal(at.title, Lib.businessRiskDef('biz-account-takeover').title);
    assert.ok(at.controls.includes('A.8.5') && at.controls.includes('A.8.15') && at.controls.includes('A.5.17'));
    assert.equal(at.actions.length, 4, 'every finding\'s actions, once each');
  });
  test('an unmapped finding stays on its own', () => {
    assert.equal(g[2].biz, null);
    assert.equal(g[2].title, 'Odd');
  });
  test('duplicate action wording is merged', () => {
    const t = { a: { risk: { title: 'A', L: 2, I: 2, controls: [] }, actions: [{ t: 'Fix X' }] }, b: { risk: { title: 'B', L: 3, I: 3, controls: [] }, actions: [{ t: 'fix x' }, { t: 'Fix Y' }] } };
    Lib.BUSINESS_RISK_OF.a = 'biz-people'; Lib.BUSINESS_RISK_OF.b = 'biz-people';
    try { assert.deepEqual(Lib.groupProposals(['a', 'b'], t, [])[0].actions.map((x) => x.t), ['Fix X', 'Fix Y']); }
    finally { delete Lib.BUSINESS_RISK_OF.a; delete Lib.BUSINESS_RISK_OF.b; }
  });
  test('when the business risk is already in the register, the findings are added to it', () => {
    const r = { id: 'R-007', tpl: 'biz-account-takeover', status: 'Open', L: 3, I: 4 };
    assert.equal(Lib.groupProposals(['mfa-registration'], TPL, [r])[0].target, r);
    assert.equal(Lib.groupProposals(['mfa-registration'], TPL, [Object.assign({}, r, { status: 'Closed' })])[0].target, null);
  });
});

describe('existing risks', () => {
  const risks = [
    { id: 'R-001', title: 'Manual risk', status: 'Open', L: 3, I: 3 },
    { id: 'R-002', title: 'Legacy auth', tpl: 'legacy', status: 'Open', L: 5, I: 4, owner: 'Kim', actions: ['ACT-1'], controls: ['A.8.5'], cia: ['C'] },
    { id: 'R-003', title: 'MFA reg', tpl: 'mfa-registration', status: 'In treatment', L: 3, I: 4, actions: ['ACT-2'], controls: [] },
    { id: 'R-004', title: 'Backups', tpl: 'backup', status: 'Open', L: 3, I: 5, actions: [] },
    { id: 'R-005', title: 'Closed', tpl: 'admins', status: 'Closed', L: 5, I: 5 },
    { id: 'R-006', title: 'Recovery', tpl: 'biz-recovery', findings: ['bcp'], status: 'Open', L: 2, I: 4 }
  ];
  test('groupExistingRisks(): technical risks by business risk; manual, closed and business risks untouched', () => {
    const g = Lib.groupExistingRisks(risks);
    assert.deepEqual(g.map((x) => [x.key, x.risks.map((r) => r.id), x.target && x.target.id]), [
      ['biz-account-takeover', ['R-002', 'R-003'], null],
      ['biz-recovery', ['R-004'], 'R-006']
    ]);
    assert.deepEqual(g[0].actions, ['ACT-1', 'ACT-2']);
    assert.equal(g[0].owner, 'Kim');
    assert.deepEqual(g[0].findings, ['legacy', 'mfa-registration']);
  });
  test('registerSizeAfterGrouping(): 5 open risks become 3', () => {
    assert.deepEqual(Lib.registerSizeAfterGrouping(risks), { now: 5, after: 3 });
  });
  test('riskFindings() and isBusinessRisk()', () => {
    assert.deepEqual(Lib.riskFindings(risks[1]), ['legacy']);
    assert.deepEqual(Lib.riskFindings(risks[5]), ['bcp']);
    assert.deepEqual(Lib.riskFindings({ tpl: 'biz-ai' }), []);
    assert.equal(Lib.isBusinessRisk(risks[5]), true);
    assert.equal(Lib.isBusinessRisk(risks[1]), false);
  });
  test('ready to close only when every finding of a business risk passes', () => {
    const r = { id: 'R-9', tpl: 'biz-account-takeover', findings: ['legacy', 'mfa-registration'], status: 'Open', actions: [] };
    assert.equal(Lib.resolvableFindings([r], [], { legacy: 'pass', 'mfa-registration': 'fail' }).length, 0);
    assert.equal(Lib.resolvableFindings([r], [], { legacy: 'pass', 'mfa-registration': 'pass' }).length, 1);
    assert.equal(Lib.resolvableFindings([{ id: 'R-1', tpl: 'legacy', status: 'Open' }], [], { legacy: 'pass' }).length, 1, 'a single-finding risk still closes as before');
    assert.equal(Lib.resolvableFindings([{ id: 'R-2', tpl: 'biz-ai', status: 'Open' }], [], {}).length, 0);
  });
  test('a scope suggestion already covered by a business risk is not suggested again', () => {
    const sugg = (rs) => Lib.contextRiskSuggestions({ orgSize: 'small' }, rs, []).map((c) => c.key);
    assert.ok(sugg([]).includes('ctx-bec'));
    assert.ok(!sugg([{ tpl: 'biz-account-takeover', findings: ['ctx-bec'], status: 'Open' }]).includes('ctx-bec'));
  });
});

describe('scan page helpers', () => {
  test('checkHeadline(): the first clause, no dangling bracket, cut at a word', () => {
    assert.equal(Lib.checkHeadline('17 of 186 enabled account(s) have not signed in for over 90 days (2 never have — break-glass accounts sit here'), '17 of 186 enabled account(s) have not signed in for over 90 days');
    assert.equal(Lib.checkHeadline('6 Global Administrators. Keep it under 5.'), '6 Global Administrators');
    assert.equal(Lib.checkHeadline(''), '');
    const long = Lib.checkHeadline('word '.repeat(40), 30);
    assert.ok(long.length <= 30 && long.endsWith('…'));
  });
  test('scanFixFirst(): failures before reviews, most severe first, five at most', () => {
    const list = Lib.scanFixFirst([
      { id: 'a', label: 'A', rag: 'amber', score: 25 }, { id: 'b', label: 'B', rag: 'red', score: 9 },
      { id: 'c', label: 'C', rag: 'red', score: 20 }, { id: 'd', label: 'D', rag: 'green', score: 25 }
    ]);
    assert.deepEqual(list.map((x) => x.id), ['c', 'b', 'a']);
    assert.equal(Lib.scanFixFirst(Array.from({ length: 9 }, (_, i) => ({ id: 'x' + i, label: 'x', rag: 'red' }))).length, 5);
  });
});

describe('storage', () => {
  test('a Findings column on Risks, reconciled, read and written; handled findings include a business risk\'s', () => {
    assert.match(store, /\{ name: 'Findings', text: \{ allowMultipleLines: true \} \}/);
    assert.match(store, /'Consequence', 'RiskType', 'Findings'\]/);
    assert.match(store, /findings: uncsv\(f\.Findings\) \};/);
    assert.match(store, /TplId: r\.tpl \|\| '', Findings: csv\(r\.findings \|\| \[\]\)/);
    assert.match(store, /\(r\.findings \|\| \[\]\)\.forEach\(function \(f\) \{ S\.handledTpl\.push\(f\); \}\);/);
  });
  test('the new write actions are blocked in read-only mode', () => {
    assert.match(app, /'approveCriticalProposed', 'dismissGroup', 'groupExistingRisks'/);
  });
});

/* Browser: the scan page and the grouping, in demo mode. */
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
  test('scan page: summary, fix first, one-line checks that open, grouped proposals that approve', async () => {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(baseUrl + '/checkpoint/index.html?demo=1', { waitUntil: 'networkidle' });
    await page.click('.nav-item[data-v="scan"]');
    await page.evaluate(() => window.App.runScan());
    await page.waitForSelector('#scanFixFirst .fix-row', { timeout: 15000 });
    await page.waitForSelector('#proposedWrap .prop-row', { timeout: 15000 });
    assert.equal(await page.locator('#scanTiles .scan-tile').count(), 4);
    assert.equal(await page.locator('#scanFixFirst .fix-row').count(), 5);
    const groups = await page.locator('#proposedWrap .prop-row').count();
    assert.ok(groups > 0 && groups <= 15, 'grouped: ' + groups);
    assert.equal(await page.locator('#nScan').innerText(), String(groups));
    assert.equal(await page.locator('#checkList .chk-detail').count(), 0, 'checks start as one line each');
    await page.locator('#scanFixFirst .fix-row').first().click();
    await page.waitForSelector('#checkList .chk-detail');
    assert.match(await page.locator('#checkList .chk-detail').first().innerText(), /How to fix/i);
    await page.click('#scanTiles .scan-tile[data-id="red"]');
    const shown = await page.locator('#checkList .check-row-group').count();
    assert.ok(shown > 0 && shown < 49, 'filtered to failing checks: ' + shown);
    assert.equal(await page.locator('#coverageBody').isHidden(), true, 'coverage starts folded');
    await page.click('#coverageToggle');
    assert.equal(await page.locator('#coverageBody').isVisible(), true);
    const key = await page.locator('#proposedWrap .prop-row').first().getAttribute('data-group');
    await page.locator('#proposedWrap .prop-row').first().locator('.prop-main').click();
    assert.match(await page.locator('#proposedWrap .prop-row.open').innerText(), /Treatment actions/);
    await page.locator('#proposedWrap .prop-row').first().locator('[data-action="App.approve"]').click();
    await page.waitForFunction((n) => document.querySelectorAll('#proposedWrap .prop-row').length === n - 1, groups);
    const saved = await page.evaluate((k) => {
      const s = JSON.parse(localStorage.getItem('checkpoint-demo-v8'));
      return s.risks.filter((r) => r.tpl === k).map((r) => ({ findings: r.findings.length, actions: r.actions.length, threat: !!r.threat }));
    }, key);
    assert.equal(saved.length, 1);
    assert.ok(saved[0].findings > 1 && saved[0].actions > 1 && saved[0].threat);
    assert.deepEqual(errors, []);
    await page.close();
  });

  test('risk register: technical risks group into business risks, originals closed', async () => {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(baseUrl + '/checkpoint/index.html?demo=1', { waitUntil: 'networkidle' });
    await page.evaluate(() => {
      const k = 'checkpoint-demo-v8';
      const s = JSON.parse(localStorage.getItem(k));
      s.risks.push(
        { id: 'R-101', title: 'Legacy auth', tpl: 'legacy', src: 'Posture scan', cat: 'Access', L: 5, I: 4, controls: ['A.8.5'], owner: 'K. Patel', status: 'Open', treat: 'Treat', actions: [], cia: ['C'] },
        { id: 'R-102', title: 'MFA registration', tpl: 'mfa-registration', src: 'Posture scan', cat: 'Access', L: 3, I: 4, controls: ['A.5.17'], owner: 'S. Okafor', status: 'Open', treat: 'Treat', actions: [], cia: ['C'] }
      );
      localStorage.setItem(k, JSON.stringify(s));
    });
    await page.reload({ waitUntil: 'networkidle' });
    await page.click('.nav-item[data-v="risks"]');
    await page.waitForSelector('#riskGroupingWrap [data-action="App.groupExistingRisks"]');
    assert.match(await page.locator('#riskGroupingWrap').innerText(), /2 technical risks[\s\S]*1 business risk/);
    await page.click('#riskGroupingWrap [data-id="*"]');
    await page.locator('#modalBox button', { hasText: /^Group 2$/ }).click();
    await page.waitForFunction(() => !document.querySelector('#riskGroupingWrap [data-action="App.groupExistingRisks"]'));
    const s = await page.evaluate(() => JSON.parse(localStorage.getItem('checkpoint-demo-v8')));
    const biz = s.risks.find((r) => r.tpl === 'biz-account-takeover');
    assert.ok(biz, 'business risk created');
    assert.deepEqual(biz.findings, ['legacy', 'mfa-registration']);
    assert.equal(biz.L * biz.I, 20);
    assert.equal(biz.owner, 'K. Patel');
    assert.deepEqual(s.risks.filter((r) => r.id === 'R-101' || r.id === 'R-102').map((r) => r.status), ['Closed', 'Closed']);
    assert.deepEqual(errors, []);
    await page.close();
  });
});
