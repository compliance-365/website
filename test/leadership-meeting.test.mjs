// One leadership security meeting: the monthly meeting and the Clause 9.3
// management review are the same series. Yearly topics join the meeting
// they fall due at (or sooner when their register changes), a coverage
// panel shows Clause 9.3.2 a to g over the year, decisions are taken
// inline (close / extend / reassign an action, accept / treat a risk),
// and the management review meeting records the chair's conclusion.
import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const L = require('../public/checkpoint/lib.js');
const Az = require('../public/checkpoint/azure/lib/securityReview.js');
const setup = { chair: 'Ekin', owner: 'Cem', mrEvery: 12 };
const pack = (extra) => L.buildSecurityReviewPack(Object.assign({ today: '2026-10-09' }, extra || {}));

describe('yearly topics', () => {
  test('due a year after they were last covered, or when their register changed', () => {
    const held = [{ id: 'SR-012', n: 12, status: 'Held', date: '2025-10-14', covered: ['actions', 'risks', 'context', 'issues', 'audits', 'resources', 'mr'] }];
    assert.deepEqual(L.securityReviewPeriodic(held, [], '2026-09-01', 12).map((x) => x.key), [], 'not yet: under 350 days');
    const due = L.securityReviewPeriodic(held, [], '2026-10-09', 12);
    assert.deepEqual(due.map((x) => x.key), ['context', 'issues', 'audits', 'resources']);
    assert.match(due[0].reason, /Last reviewed 14 Oct 2025: due once a year/);
    const changed = L.securityReviewPeriodic(held, [], '2026-03-01', 12, { context: { date: '2026-02-20', what: 'The interested parties register changed' } }, { context: ['5 interested parties'] });
    assert.deepEqual(changed.map((x) => x.key), ['context']);
    assert.match(changed[0].reason, /The interested parties register changed on 20 Feb 2026, last reviewed 14 Oct 2025/);
    assert.deepEqual(changed[0].facts, ['5 interested parties']);
  });
  test('a management review recorded on its own covers every topic', () => {
    assert.deepEqual(L.securityReviewPeriodic([], [{ id: 'MR-001', date: '2026-06-01' }], '2026-10-09', 12), []);
  });
  test('on the agenda with their own time; never-covered topics wait for the management review meeting', () => {
    const never = L.securityReviewPeriodic([], [], '2026-10-09', 12);
    assert.ok(never.every((x) => x.never));
    const monthly = L.securityReviewAgenda(setup, 5, pack({ periodic: never }));
    assert.ok(!monthly.items.some((i) => i.key === 'context'), 'not piled onto a monthly meeting');
    const mr = L.securityReviewAgenda(setup, 12, pack({ periodic: never }));
    const keys = mr.items.map((i) => i.key);
    for (const k of ['context', 'issues', 'audits', 'resources', 'mr']) assert.ok(keys.includes(k), k);
    assert.equal(mr.items.find((i) => i.key === 'context').min, 8, 'yearly topics keep their own time');
    assert.equal(mr.items.find((i) => i.key === 'mr').title, 'Is the ISMS suitable, adequate and effective?');
    assert.equal(keys.at(-1), 'decisions');
    const plain = L.securityReviewAgenda(setup, 12, pack());
    assert.equal(mr.minutes - plain.minutes, 25, 'the meeting grows by the yearly topics, the rest is not squeezed');
    const changed = [{ key: 'context', reason: 'The legal register changed on 1 Oct 2026', never: false, facts: ['3 legal requirements apply'] }];
    const m = L.securityReviewAgenda(setup, 5, pack({ periodic: changed }));
    assert.deepEqual(m.items.find((i) => i.key === 'context').facts, ['The legal register changed on 1 Oct 2026', '3 legal requirements apply']);
    assert.ok(Array.isArray(m.quietKeys) && m.quietKeys.includes('incidents'));
  });
  test('the kick-off never carries them', () => {
    assert.ok(!L.securityReviewAgenda(setup, 1, pack({ periodic: [{ key: 'context', reason: 'x', never: false }] })).items.some((i) => i.key === 'context'));
  });
});

describe('Clause 9.3.2 coverage', () => {
  test('a to g from the meetings held, and the conclusion', () => {
    const held = [
      { id: 'SR-002', n: 2, status: 'Held', date: '2026-02-10', covered: ['actions', 'risks', 'incidents', 'posture', 'decisions'] },
      { id: 'SR-006', n: 6, status: 'Held', date: '2026-06-09', covered: ['actions', 'risks', 'incidents', 'posture', 'objectives', 'context', 'decisions'] }
    ];
    const c = L.securityReviewCoverage(held, [], '2026-10-09', 12);
    const by = Object.fromEntries(c.rows.map((r) => [r.letter, r]));
    assert.ok(by.a.ok && by.c.ok && by.e.ok && by.f.ok && by.g.ok);
    assert.equal(by.b.ok, false, 'issues not covered yet');
    assert.deepEqual(by.d.missing, ['audits'], 'performance needs audit results too');
    assert.equal(c.conclusion.ok, false);
    assert.equal(c.complete, false);
    const full = L.securityReviewCoverage(held.concat([{ id: 'SR-012', n: 12, status: 'Held', date: '2026-10-06', covered: ['issues', 'audits', 'mr'] }]), [], '2026-10-09', 12);
    assert.equal(full.complete, true);
    assert.equal(full.conclusion.ref, 'SR-012');
  });
  test('meetings recorded before this release count their standing items', () => {
    assert.deepEqual(L.securityReviewCovered({ n: 2 }, 12), ['actions', 'risks', 'incidents', 'posture', 'decisions']);
    assert.ok(L.securityReviewCovered({ n: 12 }, 12).includes('context'), 'an old management review meeting covered every input');
    const c = L.securityReviewCoverage([{ id: 'SR-012', n: 12, status: 'Held', date: '2026-01-13' }], [], '2026-10-09', 12);
    assert.equal(c.complete, true);
  });
  test('the scheduled function decides the same way', () => {
    for (const k of ['securityReviewCovered', 'securityReviewLastCovered', 'securityReviewPeriodic', 'securityReviewCoverage']) assert.equal(String(Az[k]), String(L[k]), k);
    assert.deepEqual(Az.SECURITY_REVIEW_PERIODIC, L.SECURITY_REVIEW_PERIODIC);
    assert.deepEqual(Az.SECURITY_REVIEW_COVERAGE, L.SECURITY_REVIEW_COVERAGE);
  });
});

describe('inline decisions', () => {
  test('actions due in the next two weeks are on the agenda; a closed action reads as closed', () => {
    const p = pack({ actions: [{ id: 'ACT-001', title: 'Rotate keys', owner: 'Cem', due: '2026-10-15', status: 'Open' }, { id: 'ACT-002', title: 'Later', due: '2026-12-01', status: 'Open' }] });
    assert.deepEqual(p.actions.dueSoon.map((a) => a.id), ['ACT-001']);
    assert.match(L.securityReviewFacts('actions', p).join('\n'), /1 action due in the next two weeks: ACT-001 \(Cem\)/);
    assert.equal(L.securityReviewEscalationLines({ escalations: { 'ACT-001': { choice: 'close', title: 'Rotate keys', reason: 'Done in September', by: 'Ekin' } } })[0], 'ACT-001 Rotate keys: closed (Done in September), by Ekin');
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
  test('the meeting leads the page; close an action and accept a risk while minuting', async () => {
    const page = await browser.newPage({ viewport: { width: 1300, height: 950 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(baseUrl + '/checkpoint/index.html?demo=1', { waitUntil: 'networkidle' });
    await page.evaluate(() => window.App.go('reviews'));
    await page.waitForSelector('#secReviewCard .sr-card');
    const first = await page.evaluate(() => {
      const card = document.getElementById('secReviewCard'), btn = document.querySelector('#v-reviews [data-action="App.toggleAddReview"]');
      return !!(card.compareDocumentPosition(btn) & Node.DOCUMENT_POSITION_FOLLOWING);
    });
    assert.ok(first, 'the meeting comes before the separate-review button');
    const card = await page.locator('#secReviewCard').innerText();
    assert.match(card, /Leadership security meeting/i);
    assert.match(card, /Clause 9\.3 coverage, last 12 months/i);
    assert.equal(await page.locator('#secReviewCard .sr-cov-cell').count(), 8, 'a to g and the conclusion');
    assert.equal((await page.locator('#v-reviews [data-action="App.toggleAddReview"]').textContent()).trim(), 'Record a review held outside the meeting');

    await page.click('#secReviewCard button[data-action="App.openSecurityReview"]');
    if (await page.locator('#drawer button[data-action="App.prepareSecurityReview"]').count()) await page.click('#drawer button[data-action="App.prepareSecurityReview"]');
    await page.waitForSelector('#drawer button[data-action="App.recordSecurityReview"]');
    await page.click('#drawer button[data-action="App.recordSecurityReview"]');
    await page.waitForSelector('#drawer [data-action="App.srEscalate"][data-id$="|close"]');

    const closeBtn = page.locator('#drawer [data-action="App.srEscalate"][data-id$="|close"]').first();
    const aid = (await closeBtn.getAttribute('data-id')).split('|')[1];
    await closeBtn.click();
    await page.waitForSelector('#modalBox input');
    await page.fill('#modalBox input', 'Finished last week');
    await page.locator('#modalBox .m-btns .btn:not(.ghost)').click();
    await page.waitForTimeout(300);
    assert.match(await page.locator('#drawer').innerText(), /closed \(Finished last week\)/i);

    const acceptBtn = page.locator('#drawer [data-action="App.srRiskDecision"][data-id$="|accept"]').first();
    const rid = (await acceptBtn.getAttribute('data-id')).split('|')[1];
    await acceptBtn.click();
    await page.waitForSelector('#modalBox textarea');
    await page.fill('#modalBox textarea', 'Cost of treatment outweighs the exposure');
    await page.locator('#modalBox .m-btns .btn:not(.ghost)').click();
    await page.waitForTimeout(300);
    assert.match(await page.locator('#drawer').innerText(), /Accepted by [^\n]*: Cost of treatment outweighs the exposure/);
    assert.equal(await page.locator('#drawer [data-action="App.srRiskDecision"][data-id*="|' + rid + '|"]').count(), 0, 'decided once');

    await page.click('#drawer button[data-action="App.saveSecurityReviewMinutes"]');
    await page.waitForTimeout(600);
    const held = await page.locator('#drawer').innerText();
    assert.match(held, /closed \(Finished last week\)/, 'the decision stays in the minutes');
    assert.match(held, /Accepted by/);
    const popup = page.context().waitForEvent('page');
    await page.click('#drawer button[data-action="App.secReviewMinutesDoc"]');
    const doc = await popup;
    await doc.waitForLoadState();
    await doc.waitForTimeout(300);
    const minutes = await doc.content();
    assert.match(minutes, /closed \(Finished last week\)/, 'the minutes document carries the inline decisions');
    assert.match(minutes, new RegExp(rid + ': Accepted by'));
    await doc.close();
    await page.evaluate(() => window.App.closeDrawer());
    await page.evaluate((id) => window.App.openAction(id), aid);
    assert.match(await page.locator('#drawer').innerText(), /Status\s*Closed/i);
    await page.evaluate(() => window.App.closeDrawer());
    await page.evaluate((id) => window.App.openRisk(id), rid);
    assert.match(await page.locator('#drawer').innerText(), /Cost of treatment outweighs the exposure/);
    assert.deepEqual(errors, []);
    await page.close();
  });
});
