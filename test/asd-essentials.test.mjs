// ASD Essentials for enterprise IT (1.182.0): the content pack against
// ASD's chapter and Assessment Workbook, the workbook's scoring rules,
// the sales wiring that replaced the Essential Eight in the price list,
// and rating an action in the demo.
import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
global.window = global.window || {};
const L = require('../public/checkpoint/lib.js');
const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const app = read('../public/checkpoint/app.js');
const PACK_PATH = new URL('../checkpoint-content/asdessentials.json', import.meta.url);
const pack = existsSync(PACK_PATH) ? JSON.parse(readFileSync(PACK_PATH, 'utf8')) : null;

// A small model with the workbook's shape, for the scoring rules.
const model = {
  domains: [
    { id: 'gov', name: 'Governance and culture', phase: 'all', principles: [{ id: 'GOV-01', actions: ['A1'] }, { id: 'GOV-04', actions: ['A2', 'A3'] }] },
    { id: 'idn', name: 'Identity services', phase: 1, principles: [{ id: 'PRO-13', actions: ['A4', 'A5'] }, { id: 'PRO-12', actions: ['A6'] }] },
    { id: 'usr', name: 'User devices', phase: 3, principles: [{ id: 'PRO-04', actions: ['A7'] }] }
  ],
  principles: { 'GOV-01': { name: 'One' }, 'GOV-04': { name: 'Two' }, 'PRO-13': { name: 'Three' }, 'PRO-12': { name: 'Four' }, 'PRO-04': { name: 'Five' } },
  actions: { A1: { text: 'a1' }, A2: { text: 'a2' }, A3: { text: 'a3' }, A4: { text: 'a4' }, A5: { text: 'a5' }, A6: { text: 'a6' }, A7: { text: 'a7' } }
};

describe('scoring, as in ASD’s Assessment Workbook', () => {
  test('a principle takes its lowest action rating; one unrated action leaves it not assessed', () => {
    const s = L.essentialsScore(model, { 'A2|gov': { r: 'FE' }, 'A4|idn': { r: 'FE' }, 'A5|idn': { r: 'PE' }, 'A6|idn': { r: 'NE' } });
    assert.equal(s.principles.gov['GOV-04'], 'NA', 'A3 is unrated');
    assert.equal(s.principles.idn['PRO-13'], 'PE');
    assert.equal(s.principles.idn['PRO-12'], 'NE');
  });
  test('% effective = (fully + half of partially effective principles) / all principles', () => {
    const s = L.essentialsScore(model, { 'A1|gov': { r: 'FE' }, 'A2|gov': { r: 'PE' }, 'A3|gov': { r: 'FE' } });
    const gov = s.domains.find((d) => d.id === 'gov');
    assert.deepEqual(gov.counts, { NA: 0, NE: 0, PE: 1, FE: 1 });
    assert.equal(gov.score, 0.75);
    assert.equal(s.domains.find((d) => d.id === 'idn').score, 0, 'not assessed counts against the score');
    assert.equal(s.cells, 7);
    assert.equal(s.assessed, 3);
  });
  test('an unknown rating counts as not assessed', () => {
    assert.equal(L.essRatingOf({ 'A1|gov': { r: 'Maybe' } }, 'A1', 'gov'), 'NA');
  });
  test('the suggestion from ticked indicators is only ever a suggestion', () => {
    const a = { igp: { NE: ['x', 'y'], PE: ['p'], FE: ['f1', 'f2'] } };
    assert.equal(L.essentialsSuggest(a, {}), null);
    assert.equal(L.essentialsSuggest(a, { NE: [0], FE: [0, 1] }), 'NE');
    assert.equal(L.essentialsSuggest(a, { FE: [0, 1] }), 'FE');
    assert.equal(L.essentialsSuggest(a, { FE: [0] }), 'PE');
    assert.equal(L.essentialsSuggest(a, { PE: [0], FE: [0, 1] }), 'PE');
  });
  test('the next action follows ASD’s order: capability domains, then phase 1, 2, 3', () => {
    const n = L.essentialsNext(model, { 'A1|gov': { r: 'FE' } });
    assert.deepEqual(n.map((x) => x.action + '|' + x.domain), ['A2|gov', 'A3|gov', 'A4|idn', 'A5|idn', 'A6|idn', 'A7|usr']);
  });
  test('scan results become evidence on the mapped cells, never ratings', () => {
    const ev = L.essentialsScanEvidence({ mfa: ['A4|idn', 'A4|usr'], none: ['A1|gov'] }, { mfa: 'pass' }, { mfa: 'MFA enforced' });
    assert.deepEqual(Object.keys(ev).sort(), ['A4|idn', 'A4|usr']);
    assert.equal(ev['A4|idn'][0].result, 'pass');
  });
  test('the export has one row per action and domain, in the workbook’s columns', () => {
    const rows = L.essentialsRows(model, { 'A4|idn': { r: 'PE', why: 'w', ev: 'e', by: 'Sam', on: '2026-10-20' } });
    assert.equal(rows.length, 7);
    const r = rows.find((x) => x.action === 'A4');
    assert.deepEqual([r.domain, r.phase, r.principle, r.rating, r.reasoning, r.evidence], ['Identity services', '1', 'PRO-13 - Three', 'Partially effective', 'w', 'e']);
  });
});

describe('1.183.0: apply to other domains, review dates, heatmap, overview', () => {
  test('the other domains an action applies in', () => {
    const m2 = { domains: [
      { id: 'bnd', name: 'Boundary', phase: 1, principles: [{ id: 'P', actions: ['X', 'Y'] }] },
      { id: 'idn', name: 'Identity', phase: 1, principles: [{ id: 'P', actions: ['X'] }] },
      { id: 'usr', name: 'Users', phase: 3, principles: [{ id: 'Q', actions: ['Y'] }] }] };
    assert.deepEqual(L.essentialsOtherDomains(m2, 'X', 'bnd').map((d) => d.id), ['idn']);
    assert.deepEqual(L.essentialsOtherDomains(m2, 'Y', 'usr').map((d) => d.id), ['bnd']);
  });
  test('a rating is due for review the set number of months after it was made', () => {
    assert.equal(L.essentialsReviewDue({ r: 'PE', on: '2026-01-31' }, 12), '2027-01-31');
    assert.equal(L.essentialsReviewDue({ r: 'FE', on: '2026-03-15' }, 6), '2026-09-15');
    assert.equal(L.essentialsReviewDue({ r: 'NA', on: '2026-03-15' }, 6), '', 'not assessed has nothing to review');
    const stale = L.essentialsStale(model, { 'A1|gov': { r: 'FE', on: '2025-01-01' }, 'A4|idn': { r: 'PE', on: '2026-10-01' } }, '2026-10-26', 12);
    assert.deepEqual(stale.map((x) => x.action + '|' + x.domain + '|' + x.due), ['A1|gov|2026-01-01']);
  });
  test('the heatmap: technical principles by technical domain, null where not applicable', () => {
    const h = L.essentialsHeatmap(model, { 'A4|idn': { r: 'FE' }, 'A5|idn': { r: 'PE' } });
    assert.deepEqual(h.domains.map((d) => d.id), ['idn', 'usr']);
    const pro13 = h.rows.find((r) => r.id === 'PRO-13');
    assert.deepEqual(pro13.cells, { idn: 'PE', usr: null });
    assert.deepEqual(h.capability.map((c) => c.id), ['gov']);
    assert.equal(h.capability[0].principles.length, 2);
  });
  test('the overview: % effective across every principle, gaps and reviews due', () => {
    const o = L.essentialsOverview(model, { 'A1|gov': { r: 'FE', on: '2026-10-01' }, 'A6|idn': { r: 'NE', on: '2024-01-01' }, 'A7|usr': { r: 'PE', on: '2026-10-01' } }, '2026-10-26', 12);
    // 5 principles: GOV-01 FE, PRO-12 NE, PRO-04 PE, the rest not assessed -> (1 + 0.5) / 5
    assert.equal(o.pct, 30);
    assert.equal(o.gaps, 2);
    assert.equal(o.reviewsDue, 1);
    assert.deepEqual(o.domains.map((d) => d.id + ':' + d.pct), ['gov:50', 'idn:0', 'usr:50']);
  });
  test('the partner snapshot carries the Essentials headline', () => {
    const snap = L.buildProgressSnapshot({ pathSteps: [], delivery: { essentials: { pct: 30, assessed: 3, cells: 7, gaps: 2, reviewsDue: 1, domains: [] } } });
    assert.equal(snap.delivery.essentials.pct, 30);
  });
  test('wiring: actions, the calendar, the board slide and the partner console', () => {
    assert.match(app, /essRaiseAction: async function \(key\)/);
    assert.match(app, /category: ESS_CAL_CATEGORY, freq: 'Annual'/);
    assert.match(app, /\]\.concat\(essOn\(\) && essModel\(\) \? \[boardroomSlideEssentials\] : \[\]\)/);
    const owner = read('../public/owner/owner.js');
    assert.match(owner, /anyEss \? '<th scope="col">ASD Essentials<\/th>'/);
  });
});

describe('content pack', { skip: pack ? false : 'checkpoint-content is not checked out' }, () => {
  const m = pack && pack.extra.essentials;
  test('ASD’s structure: 8 domains in phase order, 28 principles, 58 actions, 212 ratings', () => {
    assert.equal(pack.framework.id, 'asdessentials');
    assert.equal(L.validatePackShape('asdessentials', pack), null);
    assert.deepEqual(m.domains.map((d) => d.id + ':' + d.phase), ['gov:all', 'vis:all', 'bnd:1', 'idn:1', 'crt:2', 'prv:2', 'bus:3', 'usr:3']);
    assert.equal(Object.keys(m.principles).length, 28);
    assert.equal(Object.keys(m.actions).length, 58);
    const cells = m.domains.reduce((n, d) => n + d.principles.reduce((k, p) => k + p.actions.length, 0), 0);
    assert.equal(cells, 212);
    // Principle counts per domain, as in the workbook's Domain Summary.
    assert.deepEqual(m.domains.map((d) => d.principles.length), [7, 10, 16, 16, 16, 16, 13, 10]);
  });
  test('every action has its principle, wording and indicators for each rating', () => {
    m.domains.forEach((d) => d.principles.forEach((p) => p.actions.forEach((a) => {
      assert.ok(m.actions[a], a);
      assert.equal(m.actions[a].principle, p.id, a);
      assert.ok(m.principles[p.id].statement, p.id);
    })));
    Object.values(m.actions).forEach((a) => {
      assert.match(a.id, /^IT\.[A-Z]{3}-\d\d\.\d+$/);
      ['NE', 'PE', 'FE'].forEach((k) => assert.ok(a.igp[k].length > 0, a.id + ' ' + k));
    });
  });
  test('the chapter’s wording leads where the workbook differs, and ASD is credited', () => {
    assert.equal(m.actions['IT.GOV-03.1'].text, 'Establish and maintain a risk management methodology and plan that is used to assess and treat cyber security risks.');
    assert.match(m.actions['IT.GOV-03.1'].workbookText, /approved risk management methodology/);
    assert.match(pack.sourceRef.attribution, /Commonwealth of Australia 2026.*CC BY 4\.0/);
  });
  test('scan mappings name real checks and cells that exist', () => {
    const cells = new Set();
    m.domains.forEach((d) => d.principles.forEach((p) => p.actions.forEach((a) => cells.add(a + '|' + d.id))));
    Object.entries(pack.extra.checkEssentials).forEach(([check, list]) => list.forEach((c) => assert.ok(cells.has(c), check + ' -> ' + c)));
  });
  test('the demo slice matches the pack', () => {
    global.window = { CHECKPOINT_CONFIG: {} };
    global.localStorage = { getItem() { return null; }, setItem() {} };
    try { require('../public/checkpoint/store.js'); } catch (e) { /* the store needs a browser past its definitions */ }
    const demo = global.window.DEMO_ESSENTIALS;
    assert.deepEqual(demo.domains, m.domains);
    Object.keys(m.actions).forEach((k) => assert.equal(demo.actions[k].text, m.actions[k].text, k));
    assert.deepEqual(global.window.DEMO_CHECK_ESSENTIALS, pack.extra.checkEssentials);
  });
});

describe('sold in place of the Essential Eight', () => {
  test('the Essential Eight’s Paddle prices now grant asdessentials', async () => {
    const pricing = await import('../src/data/pricing.js');
    assert.equal(pricing.SELF_SERVE.priceIds.asdessentials_micro, 'pri_01kyvvedm0at83vabz57dax7q4');
    assert.equal(pricing.SELF_SERVE.priceIds.essential8_micro, undefined);
    assert.deepEqual(pricing.LISTED_MODULES.map((m) => m.id).includes('essential8'), false);
    assert.equal(pricing.MODULES.find((m) => m.id === 'asdessentials').prices.micro, 7000);
    assert.match(read('../lambda/provision.js'), /'pri_01kyvvedm0at83vabz57dax7q4': \{ moduleId: 'asdessentials', tier: 'micro' \}/);
    assert.match(read('../lambda/webhook.js'), /'pri_01kyvvjpbzmm31ypek8gxgcw0s': 'asdessentials'/);
    assert.match(read('../lambda/sign.js'), /VALID_FRAMEWORKS = \[[^\]]*'asdessentials'/);
    assert.match(read('../tools/issue-entitlement.mjs'), /const ADDON_MODULES = \['ai', 'asdessentials'\];/);
  });
  test('the pack merges into the rating model, not SoA rows', () => {
    assert.match(app, /if \(moduleId === 'asdessentials'\) \{\s*window\.ASD_ESSENTIALS = \(content\.extra \|\| \{\}\)\.essentials/);
  });
});

let chromium = null, skipReason = null;
try { ({ chromium } = await import('playwright')); } catch (e) { skipReason = 'playwright is not installed'; }
const PUBLIC_DIR = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'public');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json' };
let server = null, baseUrl = '', browser = null;
if (!skipReason) {
  server = createServer(async (req, res) => {
    const urlPath = decodeURIComponent(req.url.split('?')[0]);
    let filePath = join(PUBLIC_DIR, urlPath);
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

describe('in the demo', { skip: skipReason || false }, () => {
  test('rate an action: the rating, reasoning and indicators are saved and the domain score moves', async () => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(baseUrl + '/checkpoint/index.html?demo=1', { waitUntil: 'networkidle' });
    await page.waitForSelector('#kpiRow .kpi', { timeout: 10000 });
    await page.click('.nav-item[data-v="essentials"]');
    await page.waitForSelector('#essBody .ess-table');
    assert.match(await page.locator('#essBody').innerText(), /14 of 212 action ratings done/);
    const govBefore = await page.locator('#essBody tr[data-id="gov"]').innerText();
    // Rate the next action (Governance and culture comes first).
    await page.click('#essBody [data-action="App.essNext"]');
    await page.waitForSelector('#drawer.open #essRating');
    assert.match(await page.locator('#drawer .id-t').innerText(), /IT\.GOV-08\.1 · Governance and culture/);
    await page.selectOption('#essRating', 'PE');
    await page.fill('#essWhy', 'A named executive owns AI, but the process is informal.');
    await page.click('#drawer [data-action="App.saveEssentialsRating"]');
    await page.waitForFunction(() => /15 of 212/.test(document.getElementById('essBody').innerText));
    const saved = await page.evaluate(() => JSON.parse(JSON.parse(localStorage.getItem('checkpoint-demo-v8')).settings.essentialsRatings)['IT.GOV-08.1|gov']);
    assert.equal(saved.r, 'PE');
    assert.match(saved.why, /informal/);
    assert.notEqual(await page.locator('#essBody tr[data-id="gov"]').innerText(), govBefore);
    // Indicators suggest a rating for an action that has them.
    await page.click('#essBody tr[data-id="idn"]');
    await page.click('#essBody [data-id="IT.PRO-13.4|idn"]');
    await page.locator('#drawer [data-ess-tick="NE"]').nth(1).check();
    assert.match(await page.locator('#essSugg').innerText(), /Not effective/);
    // Apply the rating to the domains not yet rated, then raise an action.
    await page.locator('#drawer [data-ess-tick="NE"]').nth(1).uncheck();
    await page.click('#drawer [data-action="App.essAlsoUnrated"]');
    const ticked = await page.locator('#drawer [data-ess-also]:checked').count();
    assert.equal(ticked, 4, 'boundary, critical, business and user devices; privileged is already rated');
    await page.click('#drawer [data-action="App.essRaiseAction"]');
    await page.waitForFunction(() => /ACT-\d+ Open/.test(document.getElementById('drawer').innerText));
    const st = await page.evaluate(() => {
      const d = JSON.parse(localStorage.getItem('checkpoint-demo-v8'));
      const r = JSON.parse(d.settings.essentialsRatings);
      const a = d.actions.find((x) => x.id === r['IT.PRO-13.4|idn'].act[0]);
      return { usr: r['IT.PRO-13.4|usr'], prv: r['IT.PRO-13.4|prv'].r, act: a && a.src, pr: a && a.pr };
    });
    assert.equal(st.usr.r, 'PE');
    assert.equal(st.usr.copiedFrom, 'IT.PRO-13.4|idn');
    assert.equal(st.prv, 'PE');
    assert.match(st.act, /^ASD Essentials IT\.PRO-13\.4\|idn: rated partially effective/);
    assert.equal(st.pr, 'Medium');
    await page.click('#drawer [data-action="App.closeDrawer"]');
    // The heatmap, the re-assessment on the calendar, and the dashboard card.
    assert.equal(await page.locator('#essBody .ess-hmt tbody tr').count(), 16);
    await page.click('#essBody [data-action="App.essScheduleReassessment"]');
    await page.waitForFunction(() => /Re-assessment on the compliance calendar: CAL-/.test(document.querySelector('.ess-review').innerText));
    await page.evaluate(() => window.App.go('dash'));
    assert.match(await page.locator('#dashEssentials').innerText(), /% effective overall/);
    assert.deepEqual(errors, []);
    await ctx.close();
  });
});
