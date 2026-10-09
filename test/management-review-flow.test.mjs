// Run a management review: four steps over a saved draft, the Clause 9.3
// conclusion (suitable, adequate, effective), structured outputs, actions
// raised, chair sign-off and the next review booked.
import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const L = require('../public/checkpoint/lib.js');
const all = (v) => Object.fromEntries(L.MR_INPUT_SECTIONS.map((x) => [x.key, { verdict: v }]));
const yes = { suitable: { answer: 'yes' }, adequate: { answer: 'yes' }, effective: { answer: 'yes' } };

describe('management review record', () => {
  test('readiness lists exactly what is missing', () => {
    assert.equal(L.mrReadiness({}).length, 4);
    const ready = { chair: 'Mei Chen', attendees: 'Mei Chen, Sam', inputNotes: all('noted'), conclusion: yes, actions: [] };
    assert.deepEqual(L.mrReadiness(ready), []);
    const partly = Object.assign({}, ready, { conclusion: Object.assign({}, yes, { effective: { answer: 'partly' } }) });
    assert.match(L.mrReadiness(partly)[0], /not fully effective/, 'a "partly" needs a reason');
    const needs = Object.assign({}, ready, { inputNotes: Object.assign(all('noted'), { improvement: { verdict: 'action' } }) });
    assert.match(L.mrReadiness(needs)[0], /actions agreed/);
    assert.match(L.mrReadiness(Object.assign({}, needs, { actions: [{ title: 'Do it' }] }))[0], /due date/);
  });
  test('conclusion label and the plain-text decisions', () => {
    assert.equal(L.mrConclusionLabel({ conclusion: yes }).state, 'ok');
    assert.equal(L.mrConclusionLabel({}).state, 'none');
    const rec = { conclusion: Object.assign({}, yes, { adequate: { answer: 'no', comment: 'Need a second admin' } }), improvements: 'MFA for finance', changes: 'None', resources: 'Hire a contractor' };
    assert.deepEqual(L.mrConclusionLabel(rec), { state: 'concerns', text: 'Adequate: no' });
    assert.equal(L.mrDecisionsText(rec, ['ACT-009']), 'Conclusion: Adequate: no.\nAdequate: Need a second admin\nImprovement: MFA for finance\nChanges to the ISMS: None\nResources: Hire a contractor\nActions: ACT-009');
  });
  test('the previous review’s actions, by recorded id or source', () => {
    const acts = [{ id: 'ACT-001', src: 'Management review MR-001' }, { id: 'ACT-002', src: 'x' }, { id: 'ACT-003', src: 'y' }];
    assert.deepEqual(L.mrPriorActions(acts, { id: 'MR-001', record: JSON.stringify({ actionIds: ['ACT-003'] }) }).map((a) => a.id), ['ACT-001', 'ACT-003']);
    assert.deepEqual(L.mrPriorActions(acts, { id: 'MR-009', decisions: 'Actions: ACT-002' }).map((a) => a.id), ['ACT-002']);
    assert.deepEqual(L.mrPriorActions(acts, null), []);
    assert.deepEqual(L.parseReviewRecord('not json'), {});
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
  test('four steps, a draft that survives closing, save, list, minutes and calendar', async () => {
    const page = await browser.newPage({ viewport: { width: 1300, height: 950 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(baseUrl + '/checkpoint/index.html?demo=1', { waitUntil: 'networkidle' });
    await page.evaluate(() => window.App.go('reviews'));
    await page.click('#v-reviews [data-action="App.toggleAddReview"]');
    await page.waitForSelector('#naReviewChair');
    assert.equal(await page.locator('.mr-step').count(), 4);
    await page.fill('#naReviewChair', 'Mei Chen');
    await page.dispatchEvent('#naReviewChair', 'change');
    // Step 2: verdicts and a note.
    await page.click('.mr-nav [data-action="App.mrStep"][data-id="2"]');
    assert.ok(await page.locator('#naMR_issues').isVisible());
    for (const k of ['priorActions', 'issues', 'interestedParties', 'performance', 'feedback', 'riskStatus']) await page.click(`[data-action="App.mrVerdict"][data-id="${k}|noted"]`);
    await page.click('[data-action="App.mrVerdict"][data-id="improvement|action"]');
    await page.fill('#naMRn_improvement', 'Roll out phishing-resistant MFA to finance');
    await page.dispatchEvent('#naMRn_improvement', 'change');
    // Close and reopen: the draft comes back.
    await page.evaluate(() => window.App.mrSaveDraft());
    await page.click('#v-reviews [data-action="App.toggleAddReview"]');
    assert.match(await page.locator('#v-reviews [data-action="App.toggleAddReview"]').innerText(), /Continue the review in progress/i);
    await page.click('#v-reviews [data-action="App.toggleAddReview"]');
    assert.equal(await page.locator('#naReviewChair').inputValue(), 'Mei Chen');
    // Step 3: the action-needed input became a suggested action.
    await page.click('.mr-step[data-id="3"]');
    assert.equal(await page.locator('#naMRa_0').inputValue(), 'Roll out phishing-resistant MFA to finance');
    for (const k of ['suitable', 'adequate', 'effective']) await page.selectOption('#naMRc_' + k, 'yes');
    await page.fill('#naReviewResources', 'Current resources are sufficient.');
    await page.dispatchEvent('#naReviewResources', 'change');
    // Step 4: ready, then save.
    await page.click('.mr-step[data-id="4"]');
    assert.match(await page.locator('#addReviewPanel').innerText(), /Ready to save[\s\S]*Suitable, adequate and effective/i);
    await page.click('[data-action="App.mrSave"]');
    await page.waitForSelector('#drawer .d-sec');
    const drawer = await page.locator('#drawer').innerText();
    assert.match(drawer, /Chair[\s\S]*Mei Chen[\s\S]*Suitable[\s\S]*Yes[\s\S]*Awaiting sign-off/i);
    await page.evaluate(() => window.App.closeDrawer());
    const row = page.locator('#reviewRows tr', { hasText: 'MR-002' });
    assert.match(await row.innerText(), /Mei Chen[\s\S]*Suitable, adequate, effective[\s\S]*1 raised[\s\S]*Awaiting sign-off/i);
    // The next review is on the compliance calendar, and the action exists.
    await page.evaluate(() => window.App.go('calendar'));
    assert.match(await page.locator('#v-calendar').innerText(), /Management review/);
    await page.evaluate(() => window.App.go('actions'));
    assert.match(await page.locator('#v-actions').innerText(), /phishing-resistant MFA/);
    // Sign off from the review.
    await page.evaluate(() => { window.App.go('reviews'); window.App.openReview('MR-002'); });
    await page.click('#drawer [data-action="App.signOffReview"]');
    await page.click('#modalBox .m-btns .btn:not(.ghost)');
    await page.waitForTimeout(300);
    assert.match(await page.locator('#drawer').innerText(), /Signed off by Demo user/i);
    assert.deepEqual(errors, []);
    await page.close();
  });
});
