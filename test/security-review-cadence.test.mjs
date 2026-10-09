// Security review, second round: quarterly management reviews, an
// editable agenda, minutes against each item, documents filed as
// evidence, and the scheduled function doing the same unattended.
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
const Az = require('../public/checkpoint/azure/lib/securityReview.js');
const libSrc = readFileSync(new URL('../public/checkpoint/lib.js', import.meta.url), 'utf8');
const app = readFileSync(new URL('../public/checkpoint/app.js', import.meta.url), 'utf8');
const setup = { chair: 'Ekin', owner: 'Cem', facilitator: 'Matt', week: 2, weekday: 2, time: '10:00' };

describe('the scheduled function shares the browser’s logic', () => {
  test('every shared function is identical to lib.js', () => {
    const shared = Object.keys(Az).filter((k) => typeof Az[k] === 'function' && k !== 'DONE_ACTION');
    assert.ok(shared.length >= 11);
    for (const k of shared) assert.equal(String(Az[k]), String(Lib[k]), k + ' differs between lib.js and azure/lib/securityReview.js');
    for (const k of ['SECURITY_REVIEW_AGENDA', 'SECURITY_REVIEW_QUARTERLY', 'SECURITY_REVIEW_KICKOFF', 'SECURITY_REVIEW_KIND_LABEL']) assert.deepEqual(Az[k], Lib[k], k);
    assert.ok(libSrc.includes(String(Az.DONE_ACTION)), 'DONE_ACTION matches');
  });
});

describe('quarterly management review', () => {
  test('every third meeting is the management review when set to quarterly', () => {
    const a = Lib.securityReviewAgenda({ ...setup, mrEvery: 3 }, 3, null);
    assert.equal(a.kind, 'mr');
    assert.equal(a.label, 'Management review (Clause 9.3)');
    assert.ok(a.items.some((i) => i.key === 'mr') && a.items.some((i) => i.key === 'access'));
    assert.equal(Lib.securityReviewAgenda({ ...setup, mrEvery: 12 }, 3, null).kind, 'quarterly');
  });
  test('saving the setup keeps the documented interval in step, and an MR meeting records a Clause 9.3 review', () => {
    assert.match(app, /Store\.setSetting\('managementReviewMonths', String\(next\.mrEvery\)\)/);
    assert.match(app, /if \(a\.kind === 'mr'\) \{[\s\S]*Store\.addReview\(mr\)/);
  });
});

describe('editable agenda', () => {
  test('standing items parse from lines, and quarterly ones wait for the quarter', () => {
    const items = Lib.parseSecurityReviewItems('AI model providers | 5 | owner\nContractor access | 7 | chair | quarterly\n\n | 3');
    assert.deepEqual(items.map((i) => [i.title, i.min, i.lead, i.every]), [['AI model providers', 5, 'owner', 'monthly'], ['Contractor access', 7, 'chair', 'quarterly']]);
    assert.equal(Lib.securityReviewItemsText(items), 'AI model providers | 5 | owner\nContractor access | 7 | chair | quarterly');
    const s = { ...setup, customItems: items };
    assert.ok(Lib.securityReviewAgenda(s, 2, null).items.some((i) => i.title === 'AI model providers'));
    assert.ok(!Lib.securityReviewAgenda(s, 2, null).items.some((i) => i.title === 'Contractor access'));
    assert.ok(Lib.securityReviewAgenda(s, 3, null).items.some((i) => i.title === 'Contractor access' && i.lead === 'Ekin'));
  });
  test('a meeting’s own items, removals and order; decisions always close', () => {
    const rec = { extra: [{ key: 'x1', title: 'AOB: pen test scope', min: 10, by: 'Cem' }], skip: ['posture'], order: ['risks', 'x1', 'actions'] };
    const a = Lib.securityReviewAgenda(setup, 2, null, rec);
    assert.deepEqual(a.items.slice(0, 3).map((i) => i.key), ['risks', 'x1', 'actions']);
    assert.ok(!a.items.some((i) => i.key === 'posture'));
    assert.equal(a.items.at(-1).key, 'decisions');
    assert.equal(a.items[1].min, 10, 'an item added for the meeting keeps its own time');
    assert.equal(a.items[1].added, 'Cem');
  });
});

describe('minutes and invites', () => {
  test('the minutes email puts notes and decisions under their item, escaped', () => {
    const a = Lib.securityReviewAgenda(setup, 2, null);
    const h = Lib.securityReviewMinutesHtml(a, { present: 'Ekin, <Cem>', itemNotes: { posture: 'Up <b>7</b>' }, decisionItem: { 'ACT-9': 'risks' } }, [{ id: 'ACT-9', title: 'Enforce MFA', owner: 'Cem', due: '2026-11-30' }], { org: 'MineGuard', date: '13 Oct', appUrl: 'https://x' });
    assert.ok(h.includes('Ekin, &lt;Cem&gt;') && h.includes('Up &lt;b&gt;7&lt;/b&gt;'));
    assert.match(h, /<h3[^>]*>Risks<\/h3>[\s\S]*ACT-9<\/b> Enforce MFA/);
    assert.ok(!/<h3[^>]*>Incidents/.test(h), 'items with nothing recorded are left out');
  });
  test('meeting times are set in the client’s time zone, daylight saving included', () => {
    assert.equal(Lib.wallTimeToUtc('2026-10-13', '10:00', 'Australia/Sydney'), '2026-10-12T23:00:00.000Z');
    assert.equal(Lib.wallTimeToUtc('2026-07-14', '10:00', 'Australia/Sydney'), '2026-07-14T00:00:00.000Z');
    assert.equal(Lib.wallTimeToUtc('2026-10-13', '10:00', 'Australia/Perth'), '2026-10-13T02:00:00.000Z');
    assert.equal(Lib.wallTimeToUtc('2026-10-13', '10:00', ''), '2026-10-13T10:00:00.000Z');
  });
  test('what is due: prepare and send two working days before, remind the day after', () => {
    const s = { ...setup, autoSend: 'true' };
    assert.deepEqual(Object.entries(Lib.securityReviewDue(s, [], '2026-10-08')).filter(([k]) => ['prepare', 'send', 'remindMinutes'].includes(k)).map(([, v]) => v), [false, false, false]);
    const d = Lib.securityReviewDue(s, [], '2026-10-09');
    assert.deepEqual([d.n, d.date, d.prepare, d.send], [1, '2026-10-13', true, true]);
    const open = [{ id: 'SR-001', n: 1, date: '2026-10-13', status: 'Sent' }];
    assert.equal(Lib.securityReviewDue(s, open, '2026-10-12').send, false, 'already sent');
    assert.equal(Lib.securityReviewDue(s, open, '2026-10-14').remindMinutes, true);
    assert.equal(Lib.securityReviewDue(s, [{ ...open[0], minutesReminded: '2026-10-14' }], '2026-10-15').remindMinutes, false);
    assert.equal(Lib.securityReviewDue({ ...s, autoSend: 'false' }, [], '2026-10-09').send, false);
  });
});

describe('the scheduled function', () => {
  const { runSecurityReview } = require('../public/checkpoint/azure/PostureMonitor/index.js').__test;
  const fakes = (lists) => {
    const calls = [];
    const g = async (path, opts) => {
      calls.push({ path, opts });
      if (/\/lists\/settings\/items\?/.test(path)) return { value: [{ id: '7', fields: { SettingKey: 'securityReviews' } }] };
      return {};
    };
    const gAll = async (path) => { const m = /lists\/([^/]+)\/items/.exec(path); return (lists[m && m[1]] || []).map((fields) => ({ fields })); };
    return { calls, g, gAll };
  };
  const ctx = { log: Object.assign(() => {}, { error: () => {} }) };
  const settings = { clientDisplayName: 'MineGuard', securityReviewSetup: JSON.stringify({ ...setup, emails: 'ekin@mg.example, cem@mg.example', ownerEmail: 'cem@mg.example', autoSend: 'true', timeZone: 'Australia/Sydney' }), securityReviews: '[]' };
  const optional = { Actions: 'acts', Incidents: 'inc', Risks: 'risks', Vendors: null, Calendar: null, Objectives: null, Controls: null, Documents: null };
  const data = { acts: [{ RefId: 'ACT-1', Title: 'Enforce MFA', Owner: 'Cem', DueDate: '2026-09-01', Status: 'Open' }], inc: [{ RefId: 'INC-1', Title: 'Lost laptop', Severity: 'Medium', DetectedDate: '2026-10-01', Status: 'Open' }], risks: [{ Status: 'Open' }, { Status: 'Closed' }] };
  test('prepares and sends the agenda with an invite, and records it', async () => {
    process.env.NOTIFY_FROM = 'checkpoint@mg.example';
    const f = fakes(data);
    const done = await runSecurityReview(f.g, f.gAll, ctx, 'site', { Settings: 'settings' }, optional, settings, '2026-10-09', 62);
    assert.deepEqual(done, ['prepared SR-001', 'sent SR-001']);
    const mail = f.calls.find((c) => /sendMail/.test(c.path));
    const msg = mail.opts.body.message;
    assert.deepEqual(msg.toRecipients.map((r) => r.emailAddress.address), ['ekin@mg.example', 'cem@mg.example']);
    assert.match(msg.body.content, /Kick-off[\s\S]*At a glance[\s\S]*Actions[\s\S]*1 overdue, oldest ACT-1 \(Cem\)[\s\S]*1 action overdue[\s\S]*INC-1 Lost laptop[\s\S]*Posture score 62\/100[\s\S]*on 9 Oct 2026/);
    assert.ok(!/9\.3\.2|A\.5\.24/.test(msg.body.content), 'no clause references in the email');
    assert.match(Buffer.from(msg.attachments[0].contentBytes, 'base64').toString(), /DTSTART:20261012T230000Z/);
    const saved = f.calls.find((c) => c.opts && c.opts.method === 'PATCH');
    const recs = JSON.parse(saved.opts.body.SettingValue);
    assert.equal(recs[0].status, 'Sent');
    assert.equal(recs[0].pack.risks.open, 1);
    assert.equal(recs[0].pack.risks.aboveAppetite, null);
  });
  test('reminds the ISMS owner to record the minutes, once', async () => {
    const f = fakes(data);
    const s2 = { ...settings, securityReviews: JSON.stringify([{ id: 'SR-001', n: 1, date: '2026-10-13', time: '10:00', status: 'Sent', pack: null }]) };
    const done = await runSecurityReview(f.g, f.gAll, ctx, 'site', { Settings: 'settings' }, optional, s2, '2026-10-14', 62);
    assert.deepEqual(done, ['minutes reminder SR-001']);
    const mail = f.calls.find((c) => /sendMail/.test(c.path));
    assert.equal(mail.opts.body.message.toRecipients[0].emailAddress.address, 'cem@mg.example');
    assert.match(mail.opts.body.message.subject, /Record the minutes: MineGuard leadership security meeting 1/);
  });
  test('does nothing on other days or without a setup', async () => {
    const f = fakes(data);
    assert.deepEqual(await runSecurityReview(f.g, f.gAll, ctx, 'site', { Settings: 'settings' }, optional, settings, '2026-10-05', 62), []);
    assert.deepEqual(await runSecurityReview(f.g, f.gAll, ctx, 'site', { Settings: 'settings' }, optional, {}, '2026-10-09', 62), []);
    assert.equal(f.calls.length, 0);
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
  test('quarterly management review: edit the agenda, minute it, and it is recorded as a Clause 9.3 review', async () => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(baseUrl + '/checkpoint/index.html?demo=1', { waitUntil: 'networkidle' });
    await page.evaluate(() => window.App.go('reviews'));
    await page.click('#secReviewCard button[data-action="App.setupSecurityReview"]');
    await page.waitForSelector('#modalBox select');
    await page.locator('#modalBox select').nth(3).selectOption('3');
    await page.locator('#modalBox textarea').fill('AI model providers and data use | 5 | owner');
    await page.locator('#modalBox .m-btns .btn:not(.ghost)').click();
    await page.waitForTimeout(300);
    assert.match(await page.locator('#secReviewCard').innerText(), /Meeting 3[\s\S]*Management review \(Clause 9\.3\)[\s\S]*every 3 months/);
    await page.click('#secReviewCard button[data-action="App.openSecurityReview"]');
    await page.click('#drawer button[data-action="App.prepareSecurityReview"]');
    await page.waitForSelector('#drawer button[data-action="App.srAddItem"]');
    assert.match(await page.locator('#drawer').innerText(), /AI model providers and data use/);
    await page.click('#drawer button[data-action="App.srAddItem"]');
    await page.fill('#modalBox input', 'AOB: penetration test scope');
    await page.locator('#modalBox .m-btns .btn:not(.ghost)').click();
    await page.waitForTimeout(300);
    await page.click('#drawer button[data-action="App.srSkipItem"][data-id="SR-003|posture"]');
    await page.waitForTimeout(200);
    let drawer = await page.locator('#drawer').innerText();
    assert.match(drawer, /AOB: penetration test scope/);
    assert.ok(!/Security posture/.test(drawer.split("Agenda")[1] || ""));
    // Twice: the demo has an action stuck since the last meeting, so
    // "Needs a decision" sits between Actions and Risks.
    await page.click('#drawer button[data-action="App.srMoveItem"][data-id="SR-003|risks|up"]');
    await page.waitForTimeout(200);
    await page.click('#drawer button[data-action="App.srMoveItem"][data-id="SR-003|risks|up"]');
    await page.waitForTimeout(200);
    const order = await page.$$eval('#drawer .sr-item b', (els) => els.map((e) => e.textContent));
    assert.ok(order.indexOf('Risks') < order.indexOf('Actions'));
    const popup = context.waitForEvent('page');
    await page.click('#drawer button[data-action="App.secReviewDoc"]');
    const doc = await popup;
    await doc.waitForLoadState();
    await doc.waitForTimeout(300);
    assert.ok((await doc.content()).includes('Leadership security meeting 3 agenda'));
    await doc.close();
    await page.click('#drawer button[data-action="App.recordSecurityReview"]');
    await page.waitForSelector('#drawer #srNote-mr');
    await page.fill('#drawer #srNote-mr', 'ISMS remains suitable. Budget approved for the penetration test.');
    await page.fill('#drawer #srDec-mr', 'Commission external penetration test - Sam Okafor - 2027-01-31');
    // The management review meeting needs the chair's conclusion first.
    await page.click('#drawer button[data-action="App.saveSecurityReviewMinutes"]');
    await page.waitForTimeout(300);
    assert.equal(await page.evaluate(() => window.CheckpointLib && document.querySelectorAll('#drawer #srMRc_suitable').length), 1, 'not saved without a conclusion');
    await page.selectOption('#drawer #srMRc_suitable', 'yes');
    await page.selectOption('#drawer #srMRc_adequate', 'partly');
    await page.selectOption('#drawer #srMRc_effective', 'yes');
    await page.click('#drawer button[data-action="App.saveSecurityReviewMinutes"]');
    await page.waitForTimeout(300);
    assert.equal(await page.locator('#drawer #srMRc_suitable').count(), 1, 'partly needs a reason');
    await page.fill('#drawer #srMRcc_adequate', 'Penetration testing was not funded until today');
    await page.click('#drawer button[data-action="App.saveSecurityReviewMinutes"]');
    await page.waitForTimeout(600);
    drawer = await page.locator('#drawer').innerText();
    assert.match(drawer, /Conclusion:\s*Adequate: partly[\s\S]*Penetration testing was not funded/);
    assert.match(drawer, /recorded as management review MR-002/i);
    assert.match(drawer, /Is the ISMS suitable, adequate and effective\?[\s\S]*Budget approved[\s\S]*Commission external penetration test/);
    await page.evaluate(() => window.App.closeDrawer());
    assert.match(await page.locator('#reviewRows').innerText(), /MR-002[\s\S]*Concerns[\s\S]*Awaiting sign-off/i);
    assert.deepEqual(errors, []);
    await context.close();
  });
});
