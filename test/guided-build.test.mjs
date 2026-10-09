// The guided build: the path to certification in the order an ISMS is
// actually built, with Annex A chosen during risk treatment.
import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const L = require('../public/checkpoint/lib.js');

const extra = (over) => Object.assign({
  roles: { label: 'Name the ISMS owner', done: false }, appetite: { label: 'Agree appetite', done: false },
  riskmethod: { label: 'Approve method', done: false }, treated: { label: 'Treat', done: false },
  accepted: { label: 'Accept', done: false }, ack: { label: 'Send policies', done: false }
}, over || {});

describe('guided build', () => {
  test('ten stages in implementation order; Annex A in risk treatment, checking last', () => {
    const g = L.guidedBuild(L.certificationPathSteps({ entitled: ['iso27001'], today: '2026-10-09' }), extra());
    assert.deepEqual(g.stages.map((s) => s.key), ['context', 'leadership', 'riskframe', 'assess', 'treat', 'objectives', 'support', 'operate', 'check', 'certify']);
    const treat = g.stages.find((s) => s.key === 'treat');
    assert.ok(treat.items.some((i) => i.id === 'soa'), 'the Statement of Applicability comes from risk treatment');
    assert.deepEqual(treat.clauses, ['6.1.3', '8.3']);
    assert.ok(g.stages.findIndex((s) => s.key === 'treat') < g.stages.findIndex((s) => s.key === 'check'));
    assert.deepEqual(g.stages.map((s) => s.n), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    assert.equal(g.current, 0);
  });
  test('top management decisions are marked; the current stage is the first not finished', () => {
    const steps = L.certificationPathSteps({ entitled: ['iso27001'], scopeStatement: 'Our SaaS', today: '2026-10-09', legal: { ready: true } });
    const g = L.guidedBuild(steps, extra());
    assert.equal(g.stages[0].done, true, 'scope answered and legal register ready');
    assert.equal(g.current, 1);
    const top = g.stages.flatMap((s) => s.items).filter((i) => i.top).map((i) => i.id);
    assert.deepEqual(top.sort(), ['accepted', 'appetite', 'approve', 'objectives', 'review', 'roles']);
    assert.ok(g.pct > 0 && g.pct < 100);
  });
  test('items with nothing behind them are left out (ISO 42001 only for clients who have it)', () => {
    const only27 = L.guidedBuild(L.certificationPathSteps({ entitled: ['iso27001'], today: '2026-10-09' }), extra());
    assert.ok(!only27.stages.find((s) => s.key === 'operate').items.some((i) => i.id === 'ai'));
    const both = L.guidedBuild(L.certificationPathSteps({ entitled: ['iso27001', 'iso42001'], today: '2026-10-09' }), extra());
    assert.ok(both.stages.find((s) => s.key === 'operate').items.some((i) => i.id === 'ai'));
  });
  test('a decision for top management gets its own plain-English line in Next for you', () => {
    const n = L.nextForYou([{ kind: 'Decision', ref: 'appetite', title: 'Agree how much risk the business will accept' }]);
    assert.match(n.why, /only top management can make/);
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
  test('the path card continues into the build; stages, clauses and the appetite decision', async () => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(baseUrl + '/checkpoint/index.html?demo=1', { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);
    assert.match(await page.locator('#gettingStartedCard .gs-compact').innerText(), /Stage \d+ of 10: [\s\S]*Week \d+ of your plan[\s\S]*Next:/);
    await page.click('#gettingStartedCard [data-action="App.openBuild"]');
    await page.waitForSelector('#buildBody .gb-panel');
    assert.equal(await page.locator('#buildBody .gb-stage').count(), 10);
    assert.match(await page.locator('.gb-panel').innerText(), /Stage \d+ of 10[\s\S]*This stage completes ISO 27001 clause/i);
    // Stage 3: the risk framework, a top management decision.
    await page.click('.gb-stage >> nth=2');
    const panel = page.locator('.gb-panel');
    assert.match(await panel.innerText(), /Risk framework[\s\S]*Agree how much risk the business will accept[\s\S]*Top management decides/i);
    await page.click('.gb-panel [data-action="App.agreeRiskAppetite"]');
    await page.waitForSelector('#modalBox.open');
    await page.fill('#modalBox input[list]', 'Mei Chen');
    await page.click('#modalBox .m-btns .btn:not(.ghost)');
    await page.waitForTimeout(300);
    assert.equal(await page.locator('.gb-panel .gb-items li.done').filter({ hasText: 'Agree how much risk' }).count(), 1);
    // A clause chip opens Finish this clause.
    await page.click('.gb-panel .gb-clause >> nth=0');
    await page.waitForSelector('#clauseFinish');
    // Next stage button moves on.
    await page.keyboard.press('Escape');
    await page.click('.gb-nav [data-action="App.openBuild"]:has-text("Next")');
    assert.match(await page.locator('.gb-panel h2').innerText(), /Risk assessment/);
    assert.deepEqual(errors, []);
    await page.close();
  });
});
