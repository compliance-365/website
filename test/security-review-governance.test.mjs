// Governance around the security review, for every client: attendance
// and quorum, absences raised at the next meeting, a residual risk
// accepted in the meeting landing on the risk register, the top
// management record and the year of reviews in one document.
import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const Lib = require('../public/checkpoint/lib.js');
const setup = { chair: 'Alex Morgan', owner: 'Priya Shah', facilitator: 'Jo Lee', week: 2, weekday: 2, time: '10:00' };

describe('attendance and quorum', () => {
  test('the roles set are expected; a surname is enough', () => {
    const a = Lib.securityReviewAttendance('Morgan, Priya Shah', setup);
    assert.deepEqual(a.expected.map((e) => [e.role, e.present]), [['Chair', true], ['ISMS owner', true], ['Facilitator', false]]);
    assert.deepEqual(a.absent, ['Jo Lee (facilitator)']);
    assert.equal(a.quorum, true, 'quorum needs the chair and the ISMS owner, not the facilitator');
    assert.equal(Lib.securityReviewAttendance('Priya Shah, Jo Lee', setup).quorum, false);
    assert.equal(Lib.securityReviewAttendance('Morganson', { chair: 'Alex Morgan', owner: 'Alex Morgan' }).quorum, false, 'no partial-word matches');
  });
  test('someone missing two meetings running, and a meeting without quorum, go on the next agenda', () => {
    const reviews = [
      { status: 'Held', date: '2026-08-11', present: 'Priya Shah, Jo Lee' },
      { status: 'Held', date: '2026-09-08', present: 'Priya Shah' },
      { status: 'Prepared', date: '2026-10-13' }];
    const ab = Lib.securityReviewAbsences(reviews, setup);
    assert.deepEqual(ab, { missedTwice: ['Alex Morgan (chair)'], lastQuorum: false });
    const p = Lib.buildSecurityReviewPack({ today: '2026-10-08', absences: ab });
    const dec = Lib.securityReviewAgenda(setup, 3, p).items.find((i) => i.key === 'decisions');
    assert.deepEqual(dec.facts.slice(0, 2), ['The last meeting was held without the chair or the ISMS owner: confirm its decisions', 'Attendance: Alex Morgan (chair) missed the last two meetings']);
    assert.deepEqual(Lib.securityReviewAbsences([], setup), { missedTwice: [], lastQuorum: true });
  });
  test('the minutes email names who was absent', () => {
    const h = Lib.securityReviewMinutesHtml(Lib.securityReviewAgenda(setup, 2, null), { present: 'Priya Shah', attendance: { absent: ['Alex Morgan (chair)'], quorum: false } }, [], { org: 'Org', date: '8 Sep' });
    assert.match(h, /Absent: Alex Morgan \(chair\)[^<]*<b[^>]*>held without the chair or the ISMS owner<\/b>/);
  });
});

describe('the top management record', () => {
  const reviews = [
    { id: 'SR-001', n: 1, date: '2025-09-01', status: 'Held', present: 'Alex Morgan, Priya Shah' },
    { id: 'SR-002', n: 2, date: '2026-08-11', status: 'Held', present: 'Alex Morgan, Priya Shah', outcome: 'On track', actions: ['A1'] },
    { id: 'SR-003', n: 3, date: '2026-09-08', status: 'Held', present: 'Priya Shah', actions: [],
      escalations: { A9: { choice: 'accept', title: 'Old kit', risk: 'R-4', reason: 'replaced in Q1', reviewBy: '2027-03-08', by: 'Alex Morgan' } } }];
  const t = Lib.topManagementRecord({ since: '2025-10-08', setup, reviews,
    risks: [{ id: 'R-4', title: 'Old kit', acceptedBy: 'Alex Morgan', acceptedDate: '2026-09-08', acceptanceNote: 'n', acceptedScore: 6 }, { id: 'R-5', acceptedBy: 'X', acceptedDate: '2024-01-01' }],
    managementReviews: [{ id: 'MR-1', date: '2026-08-11', attendees: 'Alex Morgan' }] });
  test('meetings in the period, who chaired, what was decided', () => {
    assert.deepEqual(t.meetings.map((m) => [m.id, m.chairPresent, m.quorum]), [['SR-002', true, true], ['SR-003', false, false]]);
    assert.deepEqual(t.meetings[1].escalations, ['A9 Old kit: risk accepted on R-4 (replaced in Q1), look again by 8 Mar 2027, by Alex Morgan']);
    assert.deepEqual(t.accepted.map((r) => r.id), ['R-4']);
    assert.equal(t.summary, '2 leadership security meetings held, 1 chaired by Alex Morgan; 1 decision on overdue actions; 1 residual risk accepted; 1 management review.');
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

// The report window holds the document in a frame: read every frame's text.
async function reportText(doc) {
  const parts = [];
  for (const f of doc.frames()) parts.push(await f.evaluate(() => document.body ? document.body.innerText : ''));
  return parts.join('\n');
}

describe('in the browser', { skip: skipReason || false }, () => {
  test('quorum warning, a risk accepted in the meeting, and the two documents', async () => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(baseUrl + '/checkpoint/index.html?demo=1', { waitUntil: 'networkidle' });
    await page.evaluate(() => window.App.go('reviews'));
    await page.waitForSelector('#secReviewCard .sr-card');
    await page.click('#secReviewCard button[data-action="App.openSecurityReview"]');
    await page.click('#drawer button[data-action="App.prepareSecurityReview"]');
    await page.waitForSelector('#drawer button[data-action="App.recordSecurityReview"]');
    await page.click('#drawer button[data-action="App.recordSecurityReview"]');
    await page.waitForSelector('#drawer #srOutcome');
    // The chair accepts the risk on the stuck action, against its risk.
    await page.click('#drawer button[data-action="App.srEscalate"][data-id$="|ACT-004|accept"]');
    await page.waitForSelector('#modalBox textarea');
    await page.locator('#modalBox textarea').fill('Awareness covered by onboarding training until the programme starts');
    assert.equal(await page.locator('#modalBox select').inputValue(), 'R-003');
    await page.locator('#modalBox .m-btns .btn:not(.ghost)').click();
    await page.waitForTimeout(400);
    assert.match(await page.locator('#drawer').innerText(), /risk accepted on R-003/);
    // Held without the chair: a warning, then recorded as such.
    await page.fill('#drawer #srPresent', 'Sam Okafor');
    await page.fill('#drawer #srOutcome', 'Phishing programme deferred');
    await page.click('#drawer button[data-action="App.saveSecurityReviewMinutes"]');
    await page.waitForSelector('#modalBox .m-btns');
    assert.match(await page.locator('#modalBox').innerText(), /Not in the attendance: Mei Chen \(chair\)/);
    await page.locator('#modalBox .m-btns .btn:not(.ghost)').click();
    await page.waitForTimeout(600);
    assert.match(await page.locator('#drawer').innerText(), /Outcome: Phishing programme deferred/);
    // The risk register carries the acceptance, with a date to look again.
    await page.evaluate(() => window.App.closeDrawer());
    await page.evaluate(() => window.App.go('risks'));
    await page.evaluate(() => window.App.openRisk('R-003'));
    await page.waitForTimeout(300);
    assert.match(await page.locator('#drawer').innerText(), /Mei Chen/);
    await page.evaluate(() => window.App.closeDrawer());
    await page.evaluate(() => window.App.go('actions'));
    await page.waitForTimeout(200);
    assert.match(await page.locator('body').innerText(), /Look again at the accepted risk R-003/);
    // The top management record and the year of reviews.
    await page.evaluate(() => window.App.go('reviews'));
    await page.waitForSelector('#secReviewCard button[data-action="App.secTopMgmtDoc"]');
    let popup = context.waitForEvent('page');
    await page.click('#secReviewCard button[data-action="App.secTopMgmtDoc"]');
    let doc = await popup; await doc.waitForLoadState(); await doc.waitForTimeout(300);
    let text = await reportText(doc);
    assert.match(text, /Top management record/);
    assert.match(text, /ACT-004 Roll out phishing simulation[^\n]*risk accepted on R-003/);
    assert.match(text, /Held without Mei Chen \(chair\)/i);
    await doc.close();
    popup = context.waitForEvent('page');
    await page.click('#secReviewCard button[data-action="App.secYearDoc"]');
    doc = await popup; await doc.waitForLoadState(); await doc.waitForTimeout(300);
    text = await reportText(doc);
    assert.match(text, /Security reviews: the year/);
    assert.match(text, /SR-003[\s\S]*Outcome: Phishing programme deferred/);
    assert.match(text, /held with the chair and the ISMS owner present/);
    await doc.close();
    // The next meeting asks to confirm the decisions taken without quorum.
    await page.click('#secReviewCard button[data-action="App.openSecurityReview"]');
    await page.waitForSelector('#drawer .sr-item');
    assert.match(await page.locator('#drawer').innerText(), /The last meeting was held without the chair or the ISMS owner/);
    assert.deepEqual(errors, []);
    await context.close();
  });
});
