// Register lifecycle: asset retirement and disposal records, owners who
// have left, the annual register review, and each record's history.
import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const Lib = require('../public/checkpoint/lib.js');
const app = readFileSync(new URL('../public/checkpoint/app.js', import.meta.url), 'utf8');
const store = readFileSync(new URL('../public/checkpoint/store.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../public/checkpoint/index.html', import.meta.url), 'utf8');
const TODAY = '2026-10-07';

describe('asset retirement', () => {
  const full = { date: '2026-09-01', reason: 'Replaced', method: 'Destroyed (certificate)', evidenceUrl: 'https://x/cert.pdf', by: 'S. Okafor' };
  test('a complete disposal record has no gaps', () => {
    assert.deepEqual(Lib.retirementGaps({ type: 'Device', retirement: full }), []);
  });
  test('each missing part is named', () => {
    assert.deepEqual(Lib.retirementGaps({ type: 'Device' }), ['no retirement date', 'no reason', 'no disposal method', 'not signed off']);
    assert.deepEqual(Lib.retirementGaps({ type: 'Device', retirement: { ...full, evidenceUrl: ' ' } }), ['no wipe or destruction evidence']);
  });
  test('a method that needs no proof needs no evidence; "Other" needs no method', () => {
    assert.deepEqual(Lib.retirementGaps({ type: 'Device', retirement: { ...full, method: 'Wiped and reissued', evidenceUrl: '' } }), []);
    assert.deepEqual(Lib.retirementGaps({ type: 'Other', retirement: { ...full, method: '' } }), []);
  });
  test('retired assets are listed newest first with recent and incomplete counts', () => {
    const r = Lib.retiredAssets([
      { id: 'A1', status: 'Retired', type: 'Device', retirement: { ...full, date: '2025-01-01' } },
      { id: 'A2', status: 'Retired', type: 'Device', retirement: full },
      { id: 'A3', status: 'Retired', type: 'Device' },
      { id: 'A4', status: 'Active', type: 'Device' }
    ], TODAY, 365);
    assert.deepEqual(r.rows.map((x) => x.asset.id), ['A2', 'A1', 'A3']);
    assert.equal(r.total, 3);
    assert.equal(r.recent, 1);
    assert.equal(r.withGaps, 1);
  });
  test('the stored record parses, and junk does not throw', () => {
    assert.deepEqual(Lib.parseRetirement(JSON.stringify(full)), full);
    assert.equal(Lib.parseRetirement('not json'), null);
    assert.equal(Lib.parseRetirement(''), null);
  });
  test('the summary counts retired assets, and the tidy line flags missing and incomplete', () => {
    assert.equal(Lib.assetRegisterSummary([{ type: 'Device', status: 'Retired' }, { type: 'Device', owner: 'a' }], TODAY).retired, 1);
    const keys = Lib.registerTidy('assets', [{ id: 'X', owner: 'a', classification: 'Internal', status: 'Not found in last sync' }, { id: 'Y', status: 'Retired', type: 'Device' }], {}).map((i) => i.key);
    assert.deepEqual(keys, ['notFound', 'retiredGaps']);
  });
  test('the mock audit samples recent disposals and raises an incomplete record as minor', () => {
    const m = Lib.mockAudit({ assets: [{ id: 'AST-9', name: 'Laptop', type: 'Device', status: 'Retired', retirement: { date: '2026-09-01', reason: 'Replaced' } }] }, TODAY, 'seed');
    const f = m.findings.find((x) => x.ref === 'AST-9');
    assert.ok(f && f.severity === 'Minor' && /A\.7\.14/.test(f.text), JSON.stringify(m.findings));
    assert.deepEqual(m.sample.assets, ['AST-9']);
  });
  test('the store keeps the record in a reconciled Retirement column', () => {
    assert.match(store, /\{ name: 'Retirement', text: \{ allowMultipleLines: true \} \}/);
    assert.match(store, /Retirement: a\.retirement \? JSON\.stringify\(a\.retirement\) : ''/);
    assert.match(store, /retirement: window\.CheckpointLib\.parseRetirement\(f\.Retirement\)/);
    assert.match(store, /Assets: \['Retirement'\]/);
  });
});

describe('owners who have left', () => {
  const active = [{ name: 'Kim Patel', displayName: 'Kim Patel', mail: 'k.patel@x' }];
  const disabled = [{ name: 'Riley Morgan', displayName: 'Riley Morgan', mail: 'r.morgan@x' }];
  test('a disabled account is "left"; an active match or a team is skipped; an unknown person is offered softly', () => {
    const out = Lib.departedOwners([
      { kind: 'risk', id: 'R-1', owner: 'R. Morgan' },
      { kind: 'asset', id: 'A-1', owner: 'r.morgan@x' },
      { kind: 'asset', id: 'A-2', owner: 'Riley Morgan' },
      { kind: 'risk', id: 'R-2', owner: 'K. Patel' },
      { kind: 'legal', id: 'L-1', owner: 'Legal' },
      { kind: 'legal', id: 'L-2', owner: 'Finance team' },
      { kind: 'vendor', id: 'V-1', owner: 'Pat Nobody' }
    ], active, disabled);
    assert.deepEqual(out.map((g) => [g.owner, g.status, g.items.length]), [['Riley Morgan', 'left', 3], ['Pat Nobody', 'not found', 1]]);
    assert.deepEqual(out[0].aliases, ['R. Morgan', 'r.morgan@x', 'Riley Morgan']);
  });
  test('without a directory nothing is guessed', () => {
    assert.deepEqual(Lib.departedOwners([{ kind: 'risk', id: 'R', owner: 'Someone' }], [], []), []);
  });
});

describe('annual register review', () => {
  test('stale and never-reviewed records across the four registers, oldest first', () => {
    const q = Lib.registerReviewQueue({
      assets: [{ id: 'A1', name: 'a', lastReviewed: '2025-01-01' }, { id: 'A2', name: 'b', lastReviewed: '2026-09-01' }, { id: 'A3', name: 'c', status: 'Retired' }],
      vendors: [{ id: 'V1', name: 'v', criticality: 'High', lastReviewed: '2024-01-01' }],
      legal: [{ id: 'L1', title: 'l', applies: 'No' }, { id: 'L2', title: 'm', applies: 'Yes' }],
      risks: [{ id: 'R1', title: 'r', status: 'Closed' }, { id: 'R2', title: 's', status: 'Open', lastReviewed: '2025-06-01' }]
    }, TODAY, 365);
    assert.deepEqual(q.items.map((x) => x.id), ['L2', 'V1', 'A1', 'R2']);
    assert.deepEqual(q.byKind, { legal: 1, vendor: 1, asset: 1, risk: 1 });
  });
});

describe('record history', () => {
  test('entries for the record under any of its ids, newest first, with a limit', () => {
    const log = [
      { targetType: 'Control', targetId: 'A.5.15', action: 'old', entryDateTime: '2026-01-01T00:00:00Z' },
      { targetType: 'Control', targetId: 'iso27001|A.5.15', action: 'new', entryDateTime: '2026-05-01T00:00:00Z' },
      { targetType: 'Control', targetId: 'iso27001|A.5.16', action: 'other', entryDateTime: '2026-06-01T00:00:00Z' },
      { targetType: 'Risk', targetId: 'A.5.15', action: 'wrong type', entryDateTime: '2026-06-01T00:00:00Z' }
    ];
    assert.deepEqual(Lib.recordHistory(log, 'Control', ['iso27001|A.5.15', 'A.5.15']).map((e) => e.action), ['new', 'old']);
    assert.equal(Lib.recordHistory(log, 'Control', ['iso27001|A.5.15', 'A.5.15'], 1).length, 1);
  });
});

describe('markup', () => {
  test('registers carry Review register and Owners who have left', () => {
    for (const k of ['asset', 'risk', 'vendor', 'legal']) assert.match(html, new RegExp('data-action="App.openRegisterReview" data-id="' + k + '"'));
    assert.equal((html.match(/data-action="App.openLeavers"/g) || []).length, 2);
    assert.match(html, /<div id="assetMissingQueue"><\/div>/);
  });
  test('the drawers show history and the risk drawer no longer only describes it', () => {
    for (const t of ["'Risk', [r.id]", "'Action', [a.id]", "'Vendor', [v.id]", "'AISystem', [a.id]", "'Incident', [n.id]", "'Clause', [clauseLabel(c)]"]) assert.ok(app.includes('recordHistoryHtml(' + t), t);
    assert.ok(!app.includes('<h4>Audit trail</h4>'));
  });
  test('writing handlers are read-only aware and retiring is not a plain status change', () => {
    for (const a of ['retireAsset', 'keepAsset', 'restoreAsset', 'handOver', 'registerReviewKeep']) assert.match(app, new RegExp("'" + a + "'"));
    assert.match(app, /options: a\.status === 'Retired' \? \['Retired', 'Active'\] : \['Active', 'Not found in last sync'\]/);
    assert.match(app, /key: 'disposals', label: 'Asset disposal records'/);
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
  test('retire a missing device, see it under Retired, read its history', async () => {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(baseUrl + '/checkpoint/index.html?demo=1', { waitUntil: 'networkidle' });
    await page.evaluate(() => window.App.go('assets'));
    await page.waitForSelector('#assetMissingQueue .asset-queue');
    assert.match(await page.locator('#assetFilter').innerText(), /Retired 1/);
    await page.click('#assetRows button[data-action="App.openAsset"][data-id="AST-007"]');
    await page.click('#drawer button[data-action="App.retireAsset"]');
    await page.fill('#modalBox input[placeholder="https://"]', 'https://meridianhealth.sharepoint.com/wipe-0098.pdf');
    await page.locator('#modalBox .m-btns .btn:not(.ghost)').click();
    await page.waitForTimeout(300);
    assert.match(await page.locator('#drawer').innerText(), /Disposal record/i, 'the panel refreshes after retiring');
    await page.evaluate(() => window.App.closeDrawer());
    await page.click('#assetFilter [data-id="retired"]');
    const txt = await page.locator('#assetRows').innerText();
    assert.match(txt, /AST-007[\s\S]*Retired/);
    assert.match(txt, /AST-010[\s\S]*signed off by S\. Okafor/);
    assert.equal(await page.locator('#assetMissingQueue .asset-queue').count(), 0, 'nothing left not found');
    await page.click('#assetRows button[data-action="App.openAsset"][data-id="AST-007"]');
    assert.match(await page.locator('#drawer').innerText(), /Disposal record[\s\S]*Evidence[\s\S]*Open[\s\S]*Asset retired/i);
    await page.evaluate(() => window.App.closeDrawer());
    assert.deepEqual(errors, []);
    await page.close();
  });

  test('hand over a leaver, then walk the register review', async () => {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(baseUrl + '/checkpoint/index.html?demo=1', { waitUntil: 'networkidle' });
    await page.evaluate(() => window.App.go('assets'));
    await page.click('#v-assets button[data-action="App.openLeavers"]');
    await page.waitForSelector('#drawer .d-sec.leaver');
    assert.match(await page.locator('#drawer').innerText(), /Riley Morgan[\s\S]*Account disabled[\s\S]*AST-009/i);
    await page.fill('#leaverTo-0', 'Mei Chen');
    await page.click('#drawer button[data-action="App.handOver"][data-id="0"]');
    await page.locator('#modalBox .m-btns .btn:not(.ghost)').click();
    await page.waitForTimeout(300);
    assert.equal(await page.evaluate(() => window.App && document.querySelector('#assetRows').innerText.includes('Mei Chen')), true);
    await page.evaluate(() => window.App.closeDrawer());
    await page.click('#v-assets button[data-action="App.openRegisterReview"]');
    await page.waitForSelector('#drawer .rr-card');
    const first = await page.locator('#drawer .rr-card .src').first().innerText();
    await page.click('#drawer button[data-action="App.registerReviewKeep"]');
    await page.waitForTimeout(200);
    const next = await page.locator('#drawer').innerText();
    assert.match(next, /1 reviewed this session/);
    assert.ok(!next.includes(first), 'moved on from ' + first);
    await page.evaluate(() => window.App.closeDrawer());
    await page.evaluate(() => window.App.openHistory('Legal|LEG-001'));
    assert.match(await page.locator('#drawer').innerText(), /History/i);
    await page.evaluate(() => window.App.closeDrawer());
    await page.evaluate(() => window.App.go('risks'));
    await page.evaluate(() => window.App.openRisk('R-002'));
    assert.match(await page.locator('#drawer').innerText(), /History[\s\S]*Risk approved into register/i);
    assert.deepEqual(errors, []);
    await page.close();
  });
});
