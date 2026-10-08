// Monthly security review: the agenda generated from live figures, sent
// before the meeting, minutes and decisions recorded, rolled into the
// Clause 9.3 management review.
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
const html = readFileSync(new URL('../public/checkpoint/index.html', import.meta.url), 'utf8');
const setup = { chair: 'Ekin', owner: 'Cem', facilitator: 'Matt', week: 2, weekday: 2, time: '10:00' };

describe('schedule', () => {
  test('meeting kinds over a year', () => {
    assert.deepEqual([1, 2, 3, 4, 6, 9, 12, 13, 24].map(Lib.securityReviewKind), ['kickoff', 'monthly', 'quarterly', 'monthly', 'quarterly', 'quarterly', 'annual', 'monthly', 'annual']);
  });
  test('the nth weekday of the month, the last one, and the next date', () => {
    assert.equal(Lib.securityReviewDayIn(2026, 9, setup), '2026-10-13');
    assert.equal(Lib.securityReviewDayIn(2026, 11, { week: 'last', weekday: 5 }), '2026-12-25');
    assert.equal(Lib.nextSecurityReviewDate(setup, '2026-10-13'), '2026-10-13');
    assert.equal(Lib.nextSecurityReviewDate(setup, '2026-10-14'), '2026-11-10');
    assert.equal(Lib.nextSecurityReviewDate(setup, '2026-12-20'), '2027-01-12');
  });
  test('two working days before skips the weekend', () => {
    assert.equal(Lib.workingDaysBefore('2026-10-13', 2), '2026-10-09');
    assert.equal(Lib.workingDaysBefore('2026-10-12', 2), '2026-10-08');
  });
});

describe('pack and agenda', () => {
  const pack = Lib.buildSecurityReviewPack({
    today: '2026-10-08', since: '2026-09-08',
    scans: [{ date: '2026-09-01', score: 41 }, { date: '2026-10-01', score: 48 }],
    actions: [{ id: 'ACT-1', title: 'Enforce MFA', owner: 'Cem', due: '2026-09-30', status: 'Open' }, { id: 'ACT-2', title: 'Done thing', status: 'Done' }],
    prevActionIds: ['ACT-1', 'ACT-2'],
    incidents: [{ id: 'INC-1', title: 'Lost laptop', severity: 'Medium', detected: '2026-09-20', status: 'Open' }, { id: 'INC-0', title: 'Old', detected: '2026-01-01', status: 'Closed' }],
    risks: [{ id: 'R-1', status: 'Open' }, { id: 'R-2', status: 'Closed' }], aboveAppetite: ['R-1'],
    auditLog: [{ targetType: 'Risk', action: 'Risk approved into register', entryDateTime: '2026-09-10T00:00:00Z' }, { targetType: 'Owner', action: 'Leaver hand-over', entryDateTime: '2026-09-15T00:00:00Z' }],
    vendors: [{ name: 'Azure', certExpiryDate: '2026-11-01' }], docs: [{ status: 'Draft' }, { status: 'Approved' }], readiness: 34
  });
  test('the pack carries the month’s figures', () => {
    assert.equal(pack.posture.score, 48);
    assert.equal(pack.posture.prev, 41);
    assert.deepEqual([pack.actions.open, pack.actions.overdue], [1, 1]);
    assert.equal(pack.actions.prior.length, 2);
    assert.equal(pack.incidents.count, 1);
    assert.deepEqual([pack.risks.open, pack.risks.aboveAppetite, pack.risks.added], [1, 1, 1]);
    assert.equal(pack.people.handovers, 1);
    assert.deepEqual(pack.people.certsExpiring, ['Azure']);
    assert.equal(pack.certification.docsAwaiting, 1);
  });
  test('the agenda is timed, led by named people, and answered from the pack', () => {
    const a = Lib.securityReviewAgenda(setup, 2, pack);
    assert.equal(a.minutes, 60);
    assert.deepEqual(a.items.map((i) => i.start), ['0:00', '0:05', '0:15', '0:25', '0:35', '0:45', '0:50', '0:55']);
    assert.equal(a.items[0].lead, 'Cem');
    assert.match(a.items[0].facts.join(' '), /1 of 2 actions from last meeting done[\s\S]*Overdue: ACT-1 Enforce MFA \(Cem\)/);
    assert.match(a.items[1].facts[0], /Posture score 48\/100 \(\+7 since 8 Sep 2026\)/);
    assert.match(a.items[2].facts.join(' '), /1 incident logged[\s\S]*INC-1 Lost laptop \(Medium\)/);
  });
  test('kick-off is 90 minutes, quarterly 75, annual adds the management review', () => {
    assert.equal(Lib.securityReviewAgenda(setup, 1, pack).minutes, 90);
    assert.equal(Lib.securityReviewAgenda(setup, 3, pack).minutes, 75);
    const y = Lib.securityReviewAgenda(setup, 12, pack);
    assert.equal(y.minutes, 90);
    assert.ok(y.items.some((i) => i.key === 'mr'));
    assert.equal(y.items.at(-1).key, 'decisions');
  });
  test('the email escapes everything and only links https', () => {
    const a = Lib.securityReviewAgenda(setup, 2, Lib.buildSecurityReviewPack({ today: '2026-10-08', incidents: [{ id: 'I<1>', title: '<script>x</script>', detected: '2026-10-01' }] }));
    const h = Lib.securityReviewEmailHtml(a, { org: 'Mine<Guard>', date: '13 Oct', teamsLink: 'javascript:alert(1)', appUrl: 'https://x' });
    assert.ok(!h.includes('<script>'));
    assert.ok(h.includes('Mine&lt;Guard&gt;'));
    assert.ok(!h.includes('javascript:'));
    assert.match(Lib.securityReviewEmailHtml(a, { teamsLink: 'https://teams.microsoft.com/l/x' }), /Join on Teams/);
  });
  test('the calendar invite', () => {
    const ics = Lib.securityReviewIcs({ uid: 'u1', startUtc: '2026-10-12T23:00:00.000Z', endUtc: '2026-10-13T00:00:00.000Z', summary: 'Review, 2', description: 'a\nb' });
    assert.match(ics, /^BEGIN:VCALENDAR\r\n/);
    assert.match(ics, /DTSTART:20261012T230000Z\r\nDTEND:20261013T000000Z/);
    assert.match(ics, /SUMMARY:Review\\, 2/);
    assert.match(ics, /DESCRIPTION:a\\nb/);
  });
});

describe('trend and the annual review', () => {
  const reviews = [
    { n: 1, date: '2026-08-11', status: 'Held', actions: ['A1'], pack: { posture: { score: 41 }, actions: { overdue: 6 }, risks: { aboveAppetite: 4 }, incidents: { count: 2 } } },
    { n: 2, date: '2026-09-08', status: 'Held', actions: ['A2', 'A3'], pack: { posture: { score: 48 }, actions: { overdue: 4 }, risks: { aboveAppetite: 3 }, incidents: { count: 1 } } },
    { n: 3, date: '2026-10-13', status: 'Prepared', pack: { posture: { score: 50 } } }
  ];
  test('month by month from the packs', () => {
    assert.deepEqual(Lib.securityReviewTrend(reviews).map((t) => t.score), [41, 48, 50]);
  });
  test('the year summary feeds Clause 9.3.2', () => {
    const y = Lib.securityReviewYearSummary(reviews, '2026-01-01');
    assert.equal(y.held, 2);
    assert.equal(y.decisions, 3);
    assert.match(y.text, /2 monthly security reviews held since 11 Aug 2026, with 3 decisions/);
    assert.equal(y.performance, 'posture score 41 to 48; overdue actions 6 to 4; incidents a month 2 to 1');
    assert.equal(y.risk, 'risks above appetite 4 to 3');
    assert.equal(Lib.securityReviewYearSummary([], '2026-01-01'), null);
  });
  test('the management review pre-fill uses it, and My tasks carries the pack', () => {
    assert.match(app, /var ys = window\.CheckpointLib\.securityReviewYearSummary\(secReviews\(\), since\);/);
    assert.match(app, /items = items\.concat\(secReviewTasksFor\(me\)\);/);
    assert.match(app, /autoSecurityReview\(\)\.catch\(warn\);/);
    assert.match(html, /<div id="secReviewCard"><\/div>/);
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
  test('prepare, send, record minutes; the decision becomes an action', async () => {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(baseUrl + '/checkpoint/index.html?demo=1', { waitUntil: 'networkidle' });
    await page.evaluate(() => window.App.go('reviews'));
    await page.waitForSelector('#secReviewCard .sr-card');
    const card = await page.locator('#secReviewCard').innerText();
    assert.match(card, /Meeting 3/);
    assert.match(card, /Posture score/i, 'the trend shows');
    await page.click('#secReviewCard button[data-action="App.openSecurityReview"]');
    await page.waitForSelector('#drawer .sr-item');
    assert.match(await page.locator('#drawer').innerText(), /Access review results/, 'meeting 3 carries the quarterly items');
    await page.click('#drawer button[data-action="App.prepareSecurityReview"]');
    await page.waitForSelector('#drawer button[data-action="App.sendSecurityReview"]');
    await page.click('#drawer button[data-action="App.sendSecurityReview"]');
    await page.locator('#modalBox .m-btns .btn:not(.ghost)').click();
    await page.waitForTimeout(300);
    assert.match(await page.locator('#secReviewCard').innerText(), /Agenda sent/);
    await page.click('#drawer button[data-action="App.recordSecurityReview"]');
    await page.waitForSelector('#modalBox textarea');
    await page.locator('#modalBox textarea').nth(1).fill('Enforce MFA for contractors - Sam Okafor - 2026-11-30');
    await page.locator('#modalBox .m-btns .btn:not(.ghost)').click();
    await page.waitForTimeout(500);
    const drawer = await page.locator('#drawer').innerText();
    assert.match(drawer, /Decisions[\s\S]*Enforce MFA for contractors[\s\S]*Sam Okafor/i);
    assert.ok(await page.evaluate(() => window.App && document.body.innerText !== ''));
    assert.match(await page.locator('#secReviewCard').innerText(), /Meeting 4/, 'the next meeting comes up');
    await page.evaluate(() => window.App.closeDrawer());
    await page.click('[data-action="App.toggleAddReview"]');
    await page.waitForTimeout(300);
    assert.match(await page.inputValue('#naMR_priorActions'), /monthly security review held since [\s\S]*1 decision recorded/);
    assert.deepEqual(errors, []);
    await page.close();
  });
});
