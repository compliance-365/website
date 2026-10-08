// In the meeting: an outcome in one line, a decision raised as an action
// in one click, the pre-read inside the calendar invite, and actions
// overdue at two meetings running put to the chair.
import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const Lib = require('../public/checkpoint/lib.js');
const setup = { chair: 'Ekin', owner: 'Cem', week: 2, weekday: 2, time: '10:00' };
const acts = [
  { id: 'A1', title: 'Rotate keys', owner: 'Cem', due: '2026-08-20', status: 'Open' },
  { id: 'A2', title: 'Patch VPN', owner: 'Ade', due: '2026-09-20', status: 'In progress' },
  { id: 'A3', title: 'Done long ago', owner: 'Cem', due: '2026-08-01', status: 'Done' }
];

describe('actions stuck across two meetings', () => {
  const pack = Lib.buildSecurityReviewPack({ today: '2026-10-08', since: '2026-09-08', lastHeld: '2026-09-08', actions: acts });
  test('only those already overdue at the last meeting, still open', () => {
    assert.deepEqual(pack.actions.stuck.map((a) => a.id), ['A1']);
    assert.deepEqual(Lib.buildSecurityReviewPack({ today: '2026-10-08', actions: acts }).actions.stuck, [], 'no meeting held yet: nothing to escalate');
  });
  test('a "Needs a decision from <chair>" item with three choices, after Actions', () => {
    const a = Lib.securityReviewAgenda(setup, 2, pack);
    const i = a.items.findIndex((x) => x.key === 'escalations');
    assert.equal(a.items[i].title, 'Needs a decision from Ekin');
    assert.equal(a.items[i - 1].key, 'actions');
    assert.deepEqual(a.items[i].facts, ['A1 Rotate keys (Cem), overdue since 20 Aug 2026: extend, reassign or accept the risk']);
    assert.match(a.items[i - 1].facts[0], /2 actions overdue \(1 for a decision below\), the others:/);
    assert.deepEqual(a.items[i - 1].facts.slice(1), ['A2 Patch VPN (Ade)'], 'not listed twice');
    assert.equal(a.minutes, 30);
  });
  test('no stuck actions, no item and no line', () => {
    const a = Lib.securityReviewAgenda(setup, 2, Lib.buildSecurityReviewPack({ today: '2026-10-08', lastHeld: '2026-09-08', actions: [acts[1]] }));
    assert.ok(!a.items.some((x) => x.key === 'escalations'));
    assert.ok(!a.quiet.some((q) => /decision/i.test(q)));
    assert.ok(!Lib.securityReviewAgenda(setup, 2, null).items.some((x) => x.key === 'escalations'));
  });
  test('the decisions read back in one line each', () => {
    assert.deepEqual(Lib.securityReviewEscalationLines({ escalations: {
      A1: { choice: 'extend', title: 'Rotate keys', due: '2026-11-30', by: 'Ekin' },
      A2: { choice: 'reassign', title: 'Patch VPN', owner: 'Cem', due: '2026-11-15', by: 'Ekin' },
      A4: { choice: 'accept', title: 'Old laptop', reason: 'retired in December', by: 'Ekin' } } }), [
      'A1 Rotate keys: extended to 30 Nov 2026, by Ekin',
      'A2 Patch VPN: reassigned to Cem, due 15 Nov 2026, by Ekin',
      'A4 Old laptop: risk accepted (retired in December), by Ekin']);
  });
  test('the scheduled function finds them too', () => {
    const src = require('node:fs').readFileSync(new URL('../public/checkpoint/azure/PostureMonitor/index.js', import.meta.url), 'utf8');
    assert.match(src, /lastHeld: held \? held\.date : ''/);
    assert.match(src, /stuck: extra && extra\.lastHeld \? overdue\.filter\(a => a\.due < extra\.lastHeld\)/);
  });
});

describe('the outcome in one line', () => {
  const reviews = [
    { id: 'SR-001', n: 1, date: '2026-08-11', status: 'Held', outcome: 'Baseline agreed', actions: [] },
    { id: 'SR-002', n: 2, date: '2026-09-08', status: 'Held', actions: ['A1'] },
    { id: 'SR-003', n: 3, date: '2026-10-13', status: 'Held', outcome: 'On track; MFA rollout slipped two weeks', actions: [] }
  ];
  test('the year summary lists them for the management review', () => {
    const y = Lib.securityReviewYearSummary(reviews, '2026-01-01');
    assert.equal(y.outcomeText, '11 Aug 2026: Baseline agreed; 13 Oct 2026: On track; MFA rollout slipped two weeks');
  });
  test('it opens the minutes email, escaped', () => {
    const a = Lib.securityReviewAgenda(setup, 3, null);
    const h = Lib.securityReviewMinutesHtml(a, { present: 'Ekin', outcome: 'Fine <b>so far</b>' }, [], { org: 'MineGuard', date: '13 Oct' });
    assert.match(h, /Present: Ekin<\/p><p[^>]*><b>Outcome:<\/b> Fine &lt;b&gt;so far&lt;\/b&gt;<\/p>/);
  });
});

describe('the pre-read in the calendar invite', () => {
  const pack = Lib.buildSecurityReviewPack({ today: '2026-10-08', since: '2026-09-08', lastHeld: '2026-09-08', actions: acts, scans: [{ date: '2026-09-01', score: 60 }, { date: '2026-10-01', score: 52 }] });
  const a = Lib.securityReviewAgenda(setup, 2, pack);
  const st = Lib.securityReviewStatus(pack);
  const text = Lib.securityReviewInviteText(a, st, { teamsLink: 'https://teams.microsoft.com/l/x', appUrl: 'https://app.example/' });
  test('plain text: traffic lights, then the timed agenda with its figures', () => {
    assert.match(text, /^AT A GLANCE\n. Actions: 2 overdue, oldest A1 \(Cem\) \(Watch\)/);
    assert.match(text, /AGENDA \(30 minutes\)\n0:00  Actions \(Cem\)\n      - 2 actions overdue/);
    assert.match(text, /Needs a decision from Ekin \(Ekin\)/);
    assert.match(text, /Join on Teams: https:\/\/teams\.microsoft\.com\/l\/x/);
  });
  test('the invite carries text and formatted versions, folded at 75 octets', () => {
    const html = Lib.securityReviewEmailHtml(a, { org: 'MineGuard', date: '13 Oct' }, st);
    const ics = Lib.securityReviewIcs({ uid: 'u', startUtc: '2026-10-12T23:00:00.000Z', endUtc: '2026-10-12T23:30:00.000Z', summary: 'MineGuard security review 2', description: text, html });
    const lines = ics.split('\r\n');
    assert.ok(lines.every((l) => Buffer.byteLength(l, 'utf8') <= 75), 'no line over 75 octets');
    const unfolded = ics.replace(/\r\n /g, '');
    assert.match(unfolded, /\nDESCRIPTION:AT A GLANCE\\n/);
    assert.match(unfolded, /\nX-ALT-DESC;FMTTYPE=text\/html:<div[^\r]*At a glance/);
    assert.ok(!/[^\\][,;]/.test(unfolded.split('\r\n').find((l) => l.startsWith('DESCRIPTION:')).slice(12)), 'commas and semicolons escaped');
  });
  test('the browser and the scheduled function both use it', () => {
    const fs = require('node:fs');
    const app = fs.readFileSync(new URL('../public/checkpoint/app.js', import.meta.url), 'utf8');
    const az = fs.readFileSync(new URL('../public/checkpoint/azure/PostureMonitor/index.js', import.meta.url), 'utf8');
    assert.match(app, /description: window\.CheckpointLib\.securityReviewInviteText\(/);
    assert.match(az, /description: SR\.securityReviewInviteText\(agenda, status, meta\), html,/);
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
  test('outcome, a decision in one click, and the chair deciding a stuck action', async () => {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(baseUrl + '/checkpoint/index.html?demo=1', { waitUntil: 'networkidle' });
    await page.evaluate(() => window.App.go('reviews'));
    await page.waitForSelector('#secReviewCard .sr-card');
    await page.click('#secReviewCard button[data-action="App.openSecurityReview"]');
    await page.waitForSelector('#drawer .sr-item');
    await page.click('#drawer button[data-action="App.prepareSecurityReview"]');
    await page.waitForSelector('#drawer button[data-action="App.recordSecurityReview"]');
    assert.match(await page.locator('#drawer').innerText(), /Needs a decision from Mei Chen[\s\S]*ACT-004 Roll out phishing simulation/);
    await page.click('#drawer button[data-action="App.recordSecurityReview"]');
    await page.waitForSelector('#drawer #srOutcome');
    await page.fill('#drawer #srOutcome', 'On track; phishing programme slipped');
    await page.fill('#drawer #srNote-risks', 'Supplier clauses still the top risk.');
    // + Decision raises the action straight away; the typed notes survive.
    await page.click('#drawer button[data-action="App.srAddDecision"][data-id$="|risks"]');
    await page.waitForSelector('#modalBox .m-field input');
    const f = page.locator('#modalBox .m-field input');
    await f.nth(0).fill('Send the security schedule to the remaining suppliers');
    await f.nth(1).fill('K. Patel');
    await f.nth(2).fill('2026-11-30');
    await page.locator('#modalBox .m-btns .btn:not(.ghost)').click();
    await page.waitForTimeout(400);
    assert.equal(await page.inputValue('#drawer #srOutcome'), 'On track; phishing programme slipped');
    assert.equal(await page.inputValue('#drawer #srNote-risks'), 'Supplier clauses still the top risk.');
    assert.match(await page.locator('#drawer').innerText(), /Send the security schedule to the remaining suppliers[\s\S]*K\. Patel/);
    // The chair extends the stuck action.
    await page.click('#drawer button[data-action="App.srEscalate"][data-id$="|ACT-004|extend"]');
    await page.waitForSelector('#modalBox .m-field input');
    await page.locator('#modalBox .m-field input').first().fill('2026-12-15');
    await page.locator('#modalBox .m-btns .btn:not(.ghost)').click();
    await page.waitForTimeout(400);
    assert.match(await page.locator('#drawer').innerText(), /extended to 15 Dec 2026, by Mei Chen/);
    await page.click('#drawer button[data-action="App.saveSecurityReviewMinutes"]');
    await page.waitForTimeout(600);
    const drawer = await page.locator('#drawer').innerText();
    assert.match(drawer, /Outcome: On track; phishing programme slipped/);
    assert.match(drawer, /Supplier clauses still the top risk/);
    assert.match(drawer, /Send the security schedule to the remaining suppliers/);
    assert.match(await page.locator('#secReviewCard').innerText(), /On track; phishing programme slipped · 1 decision/);
    await page.evaluate(() => window.App.closeDrawer());
    await page.evaluate(() => window.App.go('actions'));
    await page.waitForTimeout(300);
    assert.match(await page.locator('body').innerText(), /Send the security schedule to the remaining suppliers/);
    assert.deepEqual(errors, []);
    await page.close();
  });
});
