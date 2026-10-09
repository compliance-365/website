// Guidance for people who are not compliance specialists: the next thing
// for you, the first-time welcome, "what is this page", and who does what.
import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const L = require('../public/checkpoint/lib.js');

describe('next for you', () => {
  test('the most urgent item, with why it matters and roughly how long', () => {
    const n = L.nextForYou([{ kind: 'Approve document', ref: 'k', title: 'Information Security Policy.html', overdue: true }, { kind: 'Training', title: 'Basics' }]);
    assert.equal(n.title, 'Approve Information Security Policy');
    assert.match(n.why, /Top management approves each policy/);
    assert.equal(n.minutes, 10);
    assert.equal(n.overdue, true);
    assert.equal(n.more, 1);
  });
  test('every kind of task has plain-English guidance', () => {
    for (const kind of ['Approve document', 'Acknowledge policy', 'Training', 'Security review', 'Action', 'Activity', 'Evidence requested', 'Document review', 'Objective at risk']) {
      const n = L.nextForYou([{ kind, title: 'X' }]);
      assert.ok(n.why.length > 20, kind);
      assert.ok(n.minutes > 0, kind);
    }
    assert.match(L.nextForYou([{ kind: 'Security review', title: 'Record the minutes of SR-3' }]).why, /Record what the meeting decided/);
  });
  test('nothing waiting: says so, and names the next thing coming up', () => {
    const n = L.nextForYou([], { upcoming: [{ label: 'Access review', date: '2026-12-01' }, { label: 'the monthly security review', date: '2026-11-04' }] });
    assert.equal(n.none, true);
    assert.deepEqual(n.next, { label: 'the monthly security review', date: '2026-11-04' });
    assert.equal(L.nextForYou([]).next, null);
  });
});

describe('first-time welcome', () => {
  test('three screens, worded for who you are', () => {
    const top = L.welcomeScreens('top', { org: 'MineGuard', owner: 'Cem' });
    assert.deepEqual(top.map((s) => s.title), ['Welcome to Checkpoint', 'What is expected of you', 'Where your things are']);
    assert.match(top[0].lines.join(' '), /MineGuard’s information security management system/);
    assert.match(top[1].lines.join(' '), /Approve the policies[\s\S]*risk the business is willing to accept[\s\S]*monthly security review[\s\S]*about an hour a month[\s\S]*Cem/);
    assert.match(L.welcomeScreens('staff')[1].lines.join(' '), /acknowledge the policies[\s\S]*training/);
    assert.match(L.welcomeScreens('viewer')[1].lines.join(' '), /view-only/);
    assert.match(L.welcomeScreens('practitioner')[1].lines.join(' '), /Do next/);
    assert.match(top[2].lines.join(' '), /Next for you[\s\S]*My tasks[\s\S]*How this works/);
  });
});

describe('what is this page', () => {
  test('the main pages each say what they are and what you do there, by role', () => {
    for (const v of ['dash', 'mytasks', 'scan', 'risks', 'actions', 'vendors', 'assets', 'soa', 'clauses', 'documents', 'attestations', 'training', 'certification', 'audits', 'incidents', 'reviews', 'objectives', 'legal', 'calendar', 'reports', 'settings', 'integrations', 'whodoes']) {
      const g = L.pageGuide(v, 'practitioner');
      assert.ok(g && g.what && g.you, v);
    }
    assert.match(L.pageGuide('risks', 'top').you, /above the appetite need your decision/);
    assert.equal(L.pageGuide('risks', 'staff').you, L.pageGuide('risks').you, 'a role with no wording of its own gets the general line');
    assert.equal(L.pageGuide('nope'), null);
  });
  test('jargon on a page is explained', () => {
    const terms = L.pageGuide('soa').terms.map((t) => t.term);
    assert.deepEqual(terms, ['Statement of Applicability', 'Annex A', 'Control', 'Evidence']);
    assert.match(L.GLOSSARY['Residual risk'], /left after the controls/);
    for (const v of Object.keys(L.PAGE_GUIDE)) for (const t of L.PAGE_GUIDE[v].terms) assert.ok(L.GLOSSARY[t], v + ': ' + t);
  });
});

describe('who does what', () => {
  test('roles and responsibilities from the owners on each register', () => {
    const w = L.whoDoesWhat({
      roles: [{ name: 'Ekin', role: 'Top management' }, { name: 'Cem', role: 'ISMS owner' }, { name: 'Compliance365', role: 'Runs the security review' }],
      areas: {
        risks: [{ owner: 'Cem' }, { owner: 'Cem' }, { owner: 'Unassigned' }],
        actions: [{ owner: 'Cem', overdue: true }, { owner: 'Ann' }, { owner: 'Bob', open: false }],
        controls: [{ owner: '' }, { owner: 'Ann' }]
      },
      known: ['cem', 'ekin']
    });
    assert.deepEqual(w.people.map((p) => p.name), ['Cem', 'Compliance365', 'Ekin', 'Ann']);
    const cem = w.people[0];
    assert.equal(L.whoAreaText(cem.areas), '2 risks, 1 open action');
    assert.equal(cem.overdue, 1);
    assert.deepEqual(w.unowned, { risks: 1, controls: 1 });
    assert.equal(w.people.find((p) => p.name === 'Ann').unknown, true, 'an owner not in the directory may have left');
    assert.equal(w.people.find((p) => p.name === 'Compliance365').unknown, false, 'a meeting role naming a firm is not flagged');
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
  test('welcome, page guide, next for you and who does what', async () => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(baseUrl + '/checkpoint/index.html?demo=1&welcome=1', { waitUntil: 'networkidle' });
    await page.waitForSelector('#modalBox.open');
    assert.match(await page.locator('#modalBox h3').innerText(), /Welcome to Checkpoint \(1 of 3\)/);
    await page.click('#modalBox .m-btns .btn:not(.ghost)');
    await page.waitForTimeout(150);
    assert.match(await page.locator('#modalBox h3').innerText(), /What is expected of you \(2 of 3\)/);
    await page.click('#modalBox .m-btns .btn.ghost');
    await page.waitForTimeout(150);
    assert.ok(await page.evaluate(() => Object.keys(localStorage).some((k) => k.indexOf('cpWelcomeSeen') === 0)), 'remembered once seen');
    assert.equal(await page.locator('.nav-help').count(), 1, 'How this works brings it back');
    // Every page says what it is.
    assert.match(await page.locator('#v-dash .page-guide').innerText(), /What this page is:[\s\S]*What you do here:/);
    await page.evaluate(() => window.App.go('soa'));
    await page.locator('#v-soa .pg-terms summary').click();
    assert.match(await page.locator('#v-soa .pg-terms').innerText(), /Statement of Applicability[\s\S]*Annex A/);
    // Next for you, at the top of My tasks.
    await page.evaluate(() => window.App.go('mytasks'));
    assert.match(await page.locator('#myNextForYou').innerText(), /Next for you/i);
    // Who does what.
    await page.evaluate(() => window.App.go('whodoes'));
    await page.waitForTimeout(400);
    const who = await page.locator('#whoDoesBody').innerText();
    assert.match(who, /Top management \(chairs the security review\)/);
    assert.match(who, /ISMS owner/);
    assert.deepEqual(errors, []);
    await page.close();
  });
  test('someone with restricted access lands on My tasks with the next thing to do', async () => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(baseUrl + '/checkpoint/index.html?demo=1&role=restricted', { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);
    assert.equal(await page.locator('#v-mytasks').evaluate((el) => el.classList.contains('on')), true);
    assert.match(await page.locator('#myNextForYou').innerText(), /Next for you[\s\S]*minutes/i);
    assert.deepEqual(errors, []);
    await page.close();
  });
});
