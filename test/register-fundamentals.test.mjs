// Register fundamentals: tables first, owners from the Microsoft 365
// directory, treatment progress, inline action edits, vendor discovery
// and tiering, and a "needs tidying" line on every register.
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
const store = readFileSync(new URL('../public/checkpoint/store.js', import.meta.url), 'utf8');
const graph = readFileSync(new URL('../public/checkpoint/graph.js', import.meta.url), 'utf8');
const TODAY = '2026-10-06';

describe('risk treatment', () => {
  const actions = [
    { id: 'A1', risk: 'R-1', status: 'Done' }, { id: 'A2', risk: 'R-1', status: 'Open', due: '2026-10-01' },
    { id: 'A3', risk: 'R-1', status: 'Open', due: '2026-11-01' }, { id: 'A4', risk: 'R-2', status: 'Cancelled' }
  ];
  test('progress: done of total, next due, overdue', () => {
    assert.deepEqual(Lib.riskTreatmentProgress({ id: 'R-1', actions: ['A1', 'A2', 'A3'] }, actions, TODAY), { total: 3, done: 1, open: 2, nextDue: '2026-10-01', overdue: 1 });
    assert.equal(Lib.riskTreatmentProgress({ id: 'R-9' }, actions, TODAY).total, 0);
  });
  test('reassess when every action is finished and the residual is an estimate or older than the last completion', () => {
    const r2 = { id: 'R-2', status: 'Open', actions: ['A4'] };
    assert.equal(Lib.riskNeedsReassessment(r2, actions, []), true);
    assert.equal(Lib.riskNeedsReassessment(Object.assign({ resL: 1, resI: 2, resDate: '2026-10-05' }, r2), actions, [{ action: 'A4', status: 'Cancelled', date: '2026-10-01' }]), false);
    assert.equal(Lib.riskNeedsReassessment(Object.assign({ resL: 1, resI: 2, resDate: '2026-09-05' }, r2), actions, [{ action: 'A4', status: 'Cancelled', date: '2026-10-01T09:00:00Z' }]), true);
    assert.equal(Lib.riskNeedsReassessment({ id: 'R-1', status: 'Open', actions: ['A1', 'A2'] }, actions, []), false, 'still open actions');
    assert.equal(Lib.riskNeedsReassessment(Object.assign({}, r2, { status: 'Closed' }), actions, []), false);
  });
});

describe('needs tidying', () => {
  const users = [{ displayName: 'Kim Patel', name: 'Kim Patel', mail: 'kim@x.com' }];
  test('risks: no owner, no controls, treated with no actions, to reassess, owner not linked', () => {
    const items = Lib.registerTidy('risks', [
      { id: 'R-1', status: 'Open', owner: '', controls: ['A.1'], treat: 'Treat', actions: ['A1'] },
      { id: 'R-2', status: 'Open', owner: 'Kim Patel', controls: [], treat: 'Tolerate' },
      { id: 'R-3', status: 'Open', owner: 'K. Patel', controls: ['A.1'], treat: 'Treat' },
      { id: 'R-4', status: 'Closed', owner: '' }
    ], { actions: [{ id: 'A1', risk: 'R-1', status: 'Done' }], today: TODAY, users });
    assert.deepEqual(items.map((i) => [i.key, i.ids]), [['noOwner', ['R-1']], ['noControls', ['R-2']], ['noActions', ['R-3']], ['reassess', ['R-1']], ['unknownOwner', ['R-3']]]);
    assert.equal(items[0].label, '1 risk without an owner');
  });
  test('actions, vendors, assets and legal', () => {
    assert.deepEqual(Lib.registerTidy('actions', [{ id: 'A', status: 'Open', owner: 'x' }, { id: 'B', status: 'Done' }], { today: TODAY }).map((i) => i.key), ['noDue', 'unlinked']);
    const v = Lib.registerTidy('vendors', [
      { id: 'V1', owner: 'x', nextReviewDue: '2027-01-01', certExpiryDate: '2026-01-01', dataCategories: ['Customer PII'] },
      { id: 'V2', owner: 'x', nextReviewDue: '2027-01-01', dataCategories: ['Customer PII'], dpa: true }
    ], { today: TODAY });
    assert.deepEqual(v.map((i) => [i.key, i.ids]), [['certExpired', ['V1']], ['noDpa', ['V1']]]);
    assert.deepEqual(Lib.registerTidy('assets', [{ id: 'AS1', owner: '', classification: '' }, { id: 'AS2', owner: 'y', classification: 'Internal', status: 'Retired' }], {}).map((i) => i.key), ['noOwner', 'noClass']);
    assert.deepEqual(Lib.registerTidy('legal', [{ id: 'L1', applies: 'Yes', owner: '', controls: [] }, { id: 'L2', applies: 'No' }], {}).map((i) => i.key), ['noOwner', 'noControls']);
    assert.deepEqual(Lib.registerTidy('legal', [], {}), []);
  });
  test('without the directory, owners are not judged', () => {
    assert.ok(!Lib.registerTidy('risks', [{ id: 'R', status: 'Open', owner: 'Anyone', controls: ['A'], treat: 'Tolerate' }], {}).length);
  });
});

describe('owners', () => {
  const users = [{ displayName: 'Kim Patel', name: 'Kim Patel', mail: 'kim@x.com' }, { displayName: 'Sam Okafor', name: 'Sam Okafor', mail: 'sam@x.com' }, { displayName: 'Sam Oliver', name: 'Sam Oliver', mail: 'so@x.com' }];
  test('exact name or email, then initial and surname when only one person fits', () => {
    const m = Lib.matchOwners(['K. Patel', 'kim@x.com', 'S. Okafor', 'Legal', 'K. Patel', ''], users);
    assert.deepEqual(m.matched.map((x) => [x.owner, x.user.name]), [['K. Patel', 'Kim Patel'], ['kim@x.com', 'Kim Patel'], ['S. Okafor', 'Sam Okafor']]);
    assert.deepEqual(m.unmatched, ['Legal']);
    assert.equal(Lib.fuzzyOwnerMatch('S. O', users), null, 'ambiguous: two people');
  });
});

describe('vendors', () => {
  test('tiering sets criticality', () => {
    assert.equal(Lib.vendorCriticalityFromTier({ prod: true, personal: true }), 'Critical');
    assert.equal(Lib.vendorCriticalityFromTier({ personal: true, confidential: true, hard: true }), 'Critical');
    assert.equal(Lib.vendorCriticalityFromTier({ prod: true }), 'High');
    assert.equal(Lib.vendorCriticalityFromTier({ personal: true, hard: true }), 'High');
    assert.equal(Lib.vendorCriticalityFromTier({ hard: true }), 'Medium');
    assert.equal(Lib.vendorCriticalityFromTier({}), 'Low');
  });
  test('next review from criticality, brought forward to the certification expiry', () => {
    assert.equal(Lib.vendorNextReview({ criticality: 'High', lastReviewed: '2026-01-10' }, TODAY), '2027-01-10');
    assert.equal(Lib.vendorNextReview({ criticality: 'Low' }, TODAY), '2029-10-06');
    assert.equal(Lib.vendorNextReview({ criticality: 'High', lastReviewed: '2026-01-10', certExpiryDate: '2026-12-01' }, TODAY), '2026-12-01');
  });
  test('personal information needs a data processing agreement', () => {
    assert.equal(Lib.vendorHandlesPersonalData({ dataCategories: ['Health information'] }), true);
    assert.equal(Lib.vendorHandlesPersonalData({ tier: { personal: true } }), true);
    assert.equal(Lib.vendorHandlesPersonalData({ dataCategories: ['Company confidential'] }), false);
  });
  test('discovered apps become one candidate per publisher, skipping known and set-aside suppliers', () => {
    const c = Lib.vendorCandidates([
      { name: 'Jira', publisher: 'Atlassian Pty Ltd' }, { name: 'Confluence', publisher: 'Atlassian Pty Ltd' },
      { name: 'Zoom' }, { name: 'Xero', publisher: 'Xero' }, { name: 'Slack', publisher: 'Slack' }, { name: 'Northwind Console', publisher: 'Northwind Cloud Hosting' }
    ], [{ name: 'Zoom Video Communications' }, { name: 'Northwind Cloud Hosting' }], ['Slack']);
    assert.deepEqual(c.map((x) => [x.name, x.apps]), [['Atlassian Pty Ltd', ['Jira', 'Confluence']], ['Xero', ['Xero']]]);
  });
  test('stored: tier, contract, DPA and apps on the Vendors list; discovery reads enterprise apps', () => {
    assert.match(store, /\{ name: 'Tier', text: \{\} \}, \{ name: 'ContractInPlace', boolean: \{\} \}, \{ name: 'DpaInPlace', boolean: \{\} \}/);
    assert.match(store, /Vendors: \['CertExpiryDate', 'QuestionnaireAnswers', 'QuestionnaireReceivedDate', 'Tier', 'ContractInPlace', 'DpaInPlace', 'Apps'\]/);
    assert.equal((store.match(/ContractInPlace: !!v\.contract, DpaInPlace: !!v\.dpa, Apps: csv\(v\.apps \|\| \[\]\)/g) || []).length, 2);
    assert.match(graph, /async function discoverVendorApps\(\)/);
    assert.match(graph, /discoverVendorApps: discoverVendorApps/);
  });
});

describe('layout', () => {
  test('the table comes before the charts, which are folded', () => {
    for (const [table, charts] of [['riskRows', 'riskCharts'], ['actRows', 'actCharts'], ['vendorRows', 'vendorCharts']]) {
      assert.ok(html.indexOf('id="' + table + '"') < html.indexOf('id="' + charts + '"'), table);
      assert.match(html, new RegExp('<details class="card reg-charts" id="' + charts + '">'));
    }
    for (const t of ['riskTidy', 'actTidy', 'vendorTidy', 'assetTidy', 'legalTidy']) assert.match(html, new RegExp('id="' + t + '"'));
    assert.match(html, /<datalist id="peopleList"><\/datalist>/);
  });
});

/* Browser. */
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
const saved = (page) => page.evaluate((k) => JSON.parse(localStorage.getItem(k)), KEY);

describe('in the browser', { skip: skipReason || false }, () => {
  test('risks: treatment column, tidy line, owners matched to the directory', async () => {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(baseUrl + '/checkpoint/index.html?demo=1', { waitUntil: 'networkidle' });
    await page.click('.nav-item[data-v="risks"]');
    await page.waitForSelector('#riskRows .treat-cell');
    assert.ok(await page.locator('#riskRows tr').first().locator('.treat-cell').count());
    await page.waitForSelector('#riskTidy .tidy-item');
    assert.match(await page.locator('#riskTidy').innerText(), /owners to link to Microsoft 365/);
    assert.ok((await page.locator('#riskRows table, #v-risks table').first().boundingBox()).y < 900, 'the table starts on the first screen');
    await page.locator('#riskTidy .tidy-item', { hasText: /link to Microsoft 365/ }).click();
    await page.waitForSelector('#modalBox');
    assert.match(await page.locator('#modalBox').innerText(), /K\. Patel → Kim Patel/);
    await page.locator('#modalBox button', { hasText: 'Update owners' }).click();
    await page.waitForFunction((k) => JSON.parse(localStorage.getItem(k)).risks.some((r) => r.owner === 'Kim Patel'), KEY);
    const s = await saved(page);
    assert.ok(s.risks.every((r) => !/^[A-Z]\. /.test(r.owner)), 'initials replaced: ' + s.risks.map((r) => r.owner));
    assert.ok(s.actions.filter((a) => a.owner === 'Kim Patel').every((a) => a.ownerEmail === 'k.patel@meridianhealth.example'));
    assert.deepEqual(errors, []);
    await page.close();
  });

  test('actions: inline owner and due date, group by owner, tidy filter', async () => {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(baseUrl + '/checkpoint/index.html?demo=1', { waitUntil: 'networkidle' });
    await page.click('.nav-item[data-v="actions"]');
    const owner = page.locator('#actRows input[data-id="ACT-001|owner"]');
    await owner.fill('Sam Okafor');
    await owner.dispatchEvent('change');
    await page.waitForTimeout(300);
    let s = await saved(page);
    let a = s.actions.find((x) => x.id === 'ACT-001');
    assert.equal(a.owner, 'Sam Okafor');
    assert.equal(a.ownerEmail, 's.okafor@meridianhealth.example');
    const due = page.locator('#actRows input[data-id="ACT-001|due"]');
    await due.fill('2026-12-24');
    await due.dispatchEvent('change');
    await page.waitForTimeout(300);
    s = await saved(page);
    assert.equal(s.actions.find((x) => x.id === 'ACT-001').due, '2026-12-24');
    await page.click('#actGroupBy [data-id="owner"]');
    assert.ok(await page.locator('#actRows .grp-row').count() >= 2);
    const wide = await page.evaluate(() => { const t = document.querySelector('#v-actions table'); return t.scrollWidth - t.parentElement.clientWidth; });
    assert.ok(wide <= 24, 'actions table fits the page: overflow ' + wide);
    assert.deepEqual(errors, []);
    await page.close();
  });

  test('vendors: discovery, tiering sets criticality, DPA and review date saved', async () => {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(baseUrl + '/checkpoint/index.html?demo=1', { waitUntil: 'networkidle' });
    await page.click('.nav-item[data-v="vendors"]');
    assert.match(await page.locator('#vendorTidy').innerText(), /certification has expired[\s\S]*no data processing agreement/);
    await page.click('[data-action="App.discoverVendors"]');
    await page.waitForSelector('#vendorDiscoverWrap .prop-row');
    const found = await page.locator('#vendorDiscoverWrap').innerText();
    assert.match(found, /Atlassian/);
    assert.doesNotMatch(found, /Northwind/, 'already in the register');
    await page.click('#vendorDiscoverWrap [data-action="App.addDiscoveredVendor"][data-id="atlassian"]');
    assert.equal(await page.inputValue('#vName'), 'Atlassian');
    await page.check('#vTierProd');
    await page.check('#vTierConfidential');
    assert.equal(await page.inputValue('#vCriticality'), 'Critical');
    await page.check('#vContract');
    await page.click('[data-action="App.saveVendor"]');
    await page.waitForTimeout(400);
    const s = await saved(page);
    const v = s.vendors.find((x) => x.name === 'Atlassian');
    assert.ok(v, 'saved');
    assert.deepEqual(v.apps, ['Jira Cloud', 'Confluence']);
    assert.equal(v.criticality, 'Critical');
    assert.deepEqual(v.tier, { prod: true, confidential: true });
    assert.equal(v.contract, true);
    assert.equal(v.dpa, false);
    assert.match(v.nextReviewDue, /^\d{4}-\d{2}-\d{2}$/);
    assert.doesNotMatch(await page.locator('#vendorDiscoverWrap').innerText(), /Atlassian/);
    assert.deepEqual(errors, []);
    await page.close();
  });
});
