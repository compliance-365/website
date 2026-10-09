// Threat intel as an A.5.7 / A.8.8 workflow: each advisory gets a
// priority and a recorded assessment, and the page says what is left.
import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const L = require('../public/checkpoint/lib.js');
const today = '2026-10-09';
const feed = [
  { cveId: 'CVE-A', vendor: 'Microsoft', product: 'Exchange', dateAdded: '2026-09-01', dueDate: '2026-09-22', tags: ['microsoft'] },
  { cveId: 'CVE-B', vendor: 'Citrix', product: 'NetScaler', dateAdded: '2026-08-01', dueDate: '2026-12-01', knownRansomwareUse: true, tags: ['network-edge'] },
  { cveId: 'CVE-C', vendor: 'Fortinet', product: 'FortiOS', dateAdded: '2026-10-01', dueDate: '2026-10-22', tags: ['network-edge'] }
];
const ranked = (stack) => L.rankThreatIntelItems(feed, { stackTags: stack || ['microsoft'] });

describe('threat intel triage', () => {
  test('priority: ransomware is critical, a stack match is high, the rest is monitor', () => {
    const v = L.threatIntelTriage(ranked(), {}, today);
    const p = Object.fromEntries(v.items.map((i) => [i.cveId, i.priority]));
    assert.deepEqual(p, { 'CVE-A': 'High', 'CVE-B': 'Critical', 'CVE-C': 'Monitor' });
    assert.deepEqual(v.items.map((i) => i.cveId), ['CVE-B', 'CVE-A', 'CVE-C'], 'critical first, then high');
  });
  test('past CISA fix-by only when relevant and still not assessed', () => {
    const v = L.threatIntelTriage(ranked(), {}, today);
    assert.equal(v.items.find((i) => i.cveId === 'CVE-A').pastDue, true);
    assert.equal(v.counts.pastDue, 1);
    const done = L.threatIntelTriage(ranked(), { 'CVE-A': { status: 'patched', by: 'Sam', date: today } }, today);
    assert.equal(done.items.find((i) => i.cveId === 'CVE-A').pastDue, false);
  });
  test('assessments are joined, counted, sorted last; unknown statuses are ignored', () => {
    const v = L.threatIntelTriage(ranked(), { 'CVE-B': { status: 'affected', note: 'We run NetScaler', by: 'Sam', date: today, actionId: 'ACT-009' }, 'CVE-C': { status: 'bogus' } }, today);
    assert.deepEqual(v.counts, { total: 3, relevant: 1, ransomware: 1, awaiting: 2, affected: 1, assessed: 1, pastDue: 1 });
    assert.equal(v.items[v.items.length - 1].cveId, 'CVE-B', 'assessed items move to the bottom');
    assert.equal(v.items.find((i) => i.cveId === 'CVE-B').assessment.label, 'Affects us');
    assert.equal(v.items.find((i) => i.cveId === 'CVE-C').assessment, null);
  });
  test('filters', () => {
    const v = L.threatIntelTriage(ranked(), { 'CVE-C': { status: 'na', by: 'Sam', date: today } }, today);
    assert.deepEqual(L.threatIntelFilter(v.items, 'relevant').map((i) => i.cveId), ['CVE-A']);
    assert.deepEqual(L.threatIntelFilter(v.items, 'ransomware').map((i) => i.cveId), ['CVE-B']);
    assert.deepEqual(L.threatIntelFilter(v.items, 'assessed').map((i) => i.cveId), ['CVE-C']);
    assert.equal(L.threatIntelFilter(v.items, 'awaiting').length, 2);
    assert.equal(L.threatIntelFilter(v.items, 'all').length, 3);
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
  test('summary, filters, assess raises an action, and the record is recorded', async () => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(baseUrl + '/checkpoint/index.html?demo=1', { waitUntil: 'networkidle' });
    await page.evaluate(() => window.App.go('threatintel'));
    await page.waitForSelector('#tiListWrap .ti-row');
    assert.match(await page.locator('#tiKpiRow').innerText(), /Advisories[\s\S]*Relevant to you[\s\S]*Known ransomware use[\s\S]*Awaiting assessment[\s\S]*Affecting us/i);
    assert.match(await page.locator('#tiListWrap .ti-row').first().innerText(), /CRITICAL/i, 'critical first');
    assert.match(await page.locator('#tiListWrap').innerText(), /Not applicable[\s\S]*Sam Okafor/i, 'the seeded assessment shows who decided');
    await page.click('#tiListWrap .f-pill[data-id="ransomware"]');
    assert.equal(await page.locator('#tiListWrap .ti-row').count(), 2);
    await page.click('#tiListWrap .f-pill[data-id="all"]');
    await page.click('#tiListWrap .ti-row >> nth=0 >> [data-action="App.assessThreat"]');
    await page.waitForSelector('#modalBox.open');
    await page.click('#modalBox .m-btns .btn:not(.ghost)');
    await page.waitForTimeout(400);
    const txt = await page.locator('#tiListWrap').innerText();
    assert.match(txt, /Affects us\s+ACT-\d+/i);
    const actId = txt.match(/Affects us\s+(ACT-\d+)/i)[1];
    await page.evaluate(() => window.App.go('actions'));
    await page.waitForTimeout(300);
    assert.match(await page.locator('#v-actions').innerText(), new RegExp(actId + '[\\s\\S]*Remediate CVE-'), 'the remediation action is in the Actions register');
    assert.deepEqual(errors, []);
    await page.close();
  });
});
