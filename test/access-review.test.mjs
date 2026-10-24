// The quarterly access review and account check (A.5.18, A.8.2, A.6.5)
// and backup restore tests (A.8.13): the logic, the radar, and the
// whole flow in the demo.
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
const L = require('../public/checkpoint/lib.js');
const app = readFileSync(new URL('../public/checkpoint/app.js', import.meta.url), 'utf8');
const graph = readFileSync(new URL('../public/checkpoint/graph.js', import.meta.url), 'utf8');

const TODAY = '2026-10-24';
const INV = {
  signInKnown: true, rolesKnown: true,
  users: [
    { upn: 'old.admin@x.example', name: 'Old Admin', type: 'Member', enabled: true, created: '2024-01-01', lastSignIn: '2026-05-01', roles: ['Global Administrator'] },
    { upn: 'admin@x.example', name: 'Active Admin', type: 'Member', enabled: true, created: '2024-01-01', lastSignIn: '2026-10-20', roles: ['Global Administrator'] },
    { upn: 'gone@x.example', name: 'Gone Admin', type: 'Member', enabled: false, created: '2024-01-01', lastSignIn: '2026-01-01', roles: ['Exchange Administrator'] },
    { upn: 'lic@x.example', name: 'Licensed Leaver', type: 'Member', enabled: false, licensed: 2, roles: [] },
    { upn: 'guest#EXT#@x.example', name: 'Old Guest', type: 'Guest', enabled: true, created: '2026-01-01', lastSignIn: '', roles: [] },
    { upn: 'newguest#EXT#@x.example', name: 'New Guest', type: 'Guest', enabled: true, created: '2026-10-01', lastSignIn: '', roles: [] },
    { upn: 'ghost@x.example', name: 'Never Used', type: 'Member', enabled: true, created: '2026-06-01', lastSignIn: '', roles: [], manager: { name: 'Mia Boss', mail: 'mia@x.example' } },
    { upn: 'stale@x.example', name: 'Stale Staff', type: 'Member', enabled: true, created: '2024-01-01', lastSignIn: '2026-06-01', roles: [], manager: { name: 'Mia Boss', mail: 'mia@x.example' } },
    { upn: 'busy@x.example', name: 'Busy Staff', type: 'Member', enabled: true, created: '2024-01-01', lastSignIn: '2026-10-23', roles: [], manager: { name: 'Mia Boss', mail: 'mia@x.example' } },
    { upn: 'orphan@x.example', name: 'No Manager', type: 'Member', enabled: true, created: '2024-01-01', lastSignIn: '2026-10-23', roles: [] }
  ]
};
const OWNER = { name: 'Matt Owner', mail: 'matt@x.example' };

describe('accountFindings()', () => {
  test('flags unused admins, leftover roles and licences, unused guests and staff', () => {
    const f = L.accountFindings(INV, TODAY);
    const by = Object.fromEntries(f.map((x) => [x.upn, x.key]));
    assert.equal(by['old.admin@x.example'], 'stale-admin');
    assert.equal(by['gone@x.example'], 'disabled-role');
    assert.equal(by['lic@x.example'], 'disabled-licensed');
    assert.equal(by['guest#EXT#@x.example'], 'stale-guest');
    assert.equal(by['ghost@x.example'], 'never-signed-in');
    assert.equal(by['stale@x.example'], 'stale-member');
    for (const ok of ['admin@x.example', 'newguest#EXT#@x.example', 'busy@x.example', 'orphan@x.example']) assert.equal(by[ok], undefined, ok + ' is fine');
    assert.deepEqual(f.slice(0, 2).map((x) => x.sev), ['Major', 'Major'], 'majors first');
  });
  test('without sign-in data, only the checks that do not need it run', () => {
    const f = L.accountFindings(Object.assign({}, INV, { signInKnown: false }), TODAY);
    assert.deepEqual(f.map((x) => x.key).sort(), ['disabled-licensed', 'disabled-role']);
  });
  test('an expected account is not flagged until its review date', () => {
    const ex = { 'old.admin@x.example': { reason: 'Break-glass', until: '2027-01-01' } };
    assert.ok(!L.accountFindings(INV, TODAY, ex).some((x) => x.upn === 'old.admin@x.example'));
    assert.ok(L.accountFindings(INV, '2027-02-01', ex).some((x) => x.upn === 'old.admin@x.example'), 'lapses after the date');
  });
});

describe('the access review', () => {
  const rec = L.accessReviewBuild(INV, { today: TODAY, owner: OWNER, cal: 'CAL-007' });
  test('every enabled account plus disabled admins, each with a suggestion and a reviewer', () => {
    const us = rec.items.map((i) => i.u);
    assert.ok(us.includes('gone@x.example'), 'a disabled account still holding a role is reviewed');
    assert.ok(!us.includes('lic@x.example'), 'a disabled account with only a licence is not access');
    assert.equal(rec.items.length, 9);
    const it = Object.fromEntries(rec.items.map((i) => [i.u, i]));
    assert.equal(it['old.admin@x.example'].s, 'remove');
    assert.equal(it['ghost@x.example'].s, 'check');
    assert.equal(it['busy@x.example'].s, 'keep');
    assert.equal(it['old.admin@x.example'].rv, 'matt@x.example', 'admins to the owner');
    assert.equal(it['guest#EXT#@x.example'].rv, 'matt@x.example', 'guests to the owner');
    assert.equal(it['stale@x.example'].rv, 'mia@x.example', 'staff to their manager');
    assert.equal(it['orphan@x.example'].rv, 'matt@x.example', 'no manager: the owner');
    assert.deepEqual(Object.keys(rec.reviewers).sort(), ['matt@x.example', 'mia@x.example']);
    assert.equal(rec.items[0].k, 'admin', 'admins first');
    assert.equal(rec.due, '2026-11-07');
    assert.equal(rec.cal, 'CAL-007');
  });
  test('decisions: one account, suggestions per reviewer (checks left for a person), all kept', () => {
    let r = L.accessReviewDecide(rec, { reviewer: 'mia@x.example' }, '', 'Mia Boss', TODAY, 'suggested');
    assert.equal(r.changed, 2, 'stale removed, busy kept; never-used left to check');
    const it = Object.fromEntries(r.rec.items.map((i) => [i.u, i]));
    assert.equal(it['stale@x.example'].d, 'remove');
    assert.equal(it['busy@x.example'].d, 'keep');
    assert.equal(it['ghost@x.example'].d, '');
    r = L.accessReviewDecide(r.rec, ['ghost@x.example'], 'remove', 'Mia Boss', TODAY);
    r = L.accessReviewDecide(r.rec, { reviewer: 'matt@x.example' }, 'keep', 'Matt Owner', TODAY);
    const p = L.accessReviewProgress(r.rec);
    assert.equal(p.done, true);
    assert.equal(p.remove, 2);
    assert.equal(rec.items.every((i) => !i.d), true, 'the original record is not changed');
    const acts = L.accessReviewActions(r.rec, TODAY);
    assert.deepEqual(acts.map((a) => a.upn).sort(), ['ghost@x.example', 'stale@x.example']);
    assert.match(acts[0].title, /^Remove access: .*disable the account$/);
    assert.equal(acts[0].due, '2026-10-31');
    assert.equal(L.accessReviewActions(Object.assign({}, r.rec, { actioned: { 'ghost@x.example': 'ACT-9', 'stale@x.example': 'ACT-10' } }), TODAY).length, 0, 'no duplicates');
  });
  test('the reviewer email lists only their accounts, escaped, with the suggestion', () => {
    const r2 = JSON.parse(JSON.stringify(rec));
    r2.items.find((i) => i.u === 'stale@x.example').n = '<b>Stale</b>';
    const m = L.accessReviewEmail(r2, 'mia@x.example', { org: 'Acme', appUrl: 'https://app.example/checkpoint/' });
    assert.equal(m.to, 'mia@x.example');
    assert.equal(m.count, 3);
    assert.match(m.subject, /^Access review: please confirm 3 accounts by 7 Nov 2026$/);
    assert.match(m.html, /&lt;b&gt;Stale&lt;\/b&gt;/);
    assert.doesNotMatch(m.html, /old\.admin/);
    assert.match(m.html, /Reply to this email with any account that should be removed/);
  });
  test('finished, filed reviews shrink to counts after the latest two', () => {
    const done = (id) => Object.assign(JSON.parse(JSON.stringify(rec)), { id, status: 'done', filed: true });
    const out = L.compactAccessReviews([done('A'), done('B'), done('C')]);
    assert.equal(out[0].items, undefined);
    assert.equal(out[0].summary.total, 9);
    assert.ok(out[1].items && out[2].items);
  });
});

describe('restore tests', () => {
  test('pass, partial (too slow or partly back) and fail; an old backup is a note, not a failure', () => {
    assert.equal(L.restoreTestAssess({ intact: 'yes', minutes: 30, rtoH: 4, date: TODAY, from: '2026-10-23' }).result, 'pass');
    const slow = L.restoreTestAssess({ intact: 'yes', minutes: 600, rtoH: 8 });
    assert.equal(slow.result, 'partial');
    assert.match(slow.issues[0], /took 10 hours, longer than its recovery time objective of 8 hours/);
    assert.equal(L.restoreTestAssess({ intact: 'partly', minutes: 10 }).result, 'partial');
    assert.equal(L.restoreTestAssess({ intact: 'no', minutes: 10 }).result, 'fail');
    const old = L.restoreTestAssess({ intact: 'yes', minutes: 10, rpoH: 24, date: TODAY, from: '2026-10-14' });
    assert.equal(old.result, 'pass');
    assert.match(old.notes[0], /was 10 days old/);
  });
  test('coverage and what to test next', () => {
    const sets = L.parseRestoreSets('Mail | 24 | 24\nFiles | 8 | 12\n\nFinance DB|4|1');
    assert.deepEqual(sets[2], { name: 'Finance DB', rtoH: 4, rpoH: 1 });
    assert.equal(L.restoreSetsText(sets).split('\n')[1], 'Files | 8 | 12');
    const cov = L.restoreCoverage(sets, [{ set: 'Mail', date: '2026-06-01', result: 'pass' }, { set: 'Files', date: '2025-01-01', result: 'fail' }], TODAY);
    assert.equal(cov.tested, 1);
    assert.deepEqual(cov.untested, ['Files', 'Finance DB']);
    assert.deepEqual(cov.failing, ['Files']);
    assert.equal(cov.next.name, 'Finance DB', 'never tested first');
  });
});

describe('the audit radar', () => {
  test('raises account findings and restore gaps', () => {
    const r = L.auditRadar({ accountFindings: L.accountFindings(INV, TODAY), restore: { sets: L.parseRestoreSets('Mail|24|24\nFiles|8|8'), tests: [{ set: 'Mail', date: '2026-09-01', result: 'fail' }] } }, TODAY);
    const ids = r.items.map((x) => x.id);
    for (const id of ['accounts-disabled-role', 'accounts-stale-admin', 'accounts-stale-guest', 'accounts-stale-member', 'accounts-disabled-licensed', 'restore-failing', 'restore-untested']) assert.ok(ids.includes(id), id);
    const sm = r.items.find((x) => x.id === 'accounts-stale-member');
    assert.match(sm.title, /^2 staff accounts are enabled but unused$/);
    assert.equal(sm.fix.action, 'App.openAccessReview');
    assert.ok(!L.auditRadar({}, TODAY).items.some((x) => /^accounts-|^restore-/.test(x.id)), 'nothing without data');
  });
});

describe('wiring', () => {
  test('read-only Graph inventory with graceful fallbacks', () => {
    assert.match(graph, /async function accountInventory\(\)/);
    assert.match(graph, /signInActivity&\$top=999/);
    assert.match(graph, /catch \(e\) \{ signInKnown = false;/);
    assert.match(graph, /roleManagement\/directory\/roleAssignments/);
    assert.doesNotMatch(graph.slice(graph.indexOf('async function accountInventory'), graph.indexOf('async function getSchedules')), /method: '(POST|PATCH|DELETE)'/);
  });
  test('the calendar activities open the new flows; writes are gated for viewers', () => {
    assert.match(app, /if \(rdef && rdef\.key === 'access-review'\) \{ App\.openAccessReview\(\); return; \}/);
    assert.match(app, /if \(rdef && rdef\.key === 'backup-restore'\) \{ App\.recordRestoreTest\(id\); return; \}/);
    for (const a of ['startAccessReview', 'decideAccess', 'finishAccessReview', 'sendAccessReview', 'recordRestoreTest', 'expectAccount']) assert.match(app, new RegExp("'" + a + "'"), a);
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
const KEY = 'checkpoint-demo-v8';
const settings = (page) => page.evaluate((k) => JSON.parse(localStorage.getItem(k)).settings, KEY);

describe('in the demo', { skip: skipReason || false }, () => {
  test('access review: check, start, decide, finish with actions', async () => {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(baseUrl + '/checkpoint/index.html?demo=1', { waitUntil: 'networkidle' });
    await page.evaluate(() => window.App.go('calendar'));
    await page.locator('#v-calendar button', { hasText: 'Access review' }).click();
    const drawer = page.locator('#drawer');
    await drawer.locator('h2', { hasText: 'Access review' }).waitFor();
    const text = await drawer.innerText();
    assert.match(text, /Checked .*: 9 accounts/);
    assert.match(text, /Riley Morgan[\s\S]*Disabled but still holds an admin role/);
    assert.match(text, /Pat \(Contoso Consulting\)[\s\S]*Guest not used in 90 days/);
    const scan = JSON.parse((await settings(page)).accountScan);
    assert.ok(scan.findings.some((f) => f.key === 'stale-admin' && f.name === 'Meridian Admin'));

    await drawer.locator('button', { hasText: 'Start the access review' }).click();
    await page.locator('#modalBox button', { hasText: 'Build the review' }).click();
    await drawer.locator('h4', { hasText: /^Review AR-/ }).waitFor();
    let rec = JSON.parse((await settings(page)).accessReviews).pop();
    assert.equal(rec.items.length, 9, 'the eight enabled accounts plus the disabled admin');
    assert.ok(Object.keys(rec.reviewers).includes('j.chen@meridianhealth.example'), 'staff go to their manager');

    const rows = await drawer.locator('.ar-table tr').count();
    assert.ok(rows > 5);
    for (const k of Object.keys(rec.reviewers)) await page.evaluate((k) => window.App.acceptAccessSuggestions(k), k);
    await page.evaluate(() => window.App.decideAccess('training@meridianhealth.example|remove'));
    await page.waitForFunction((k) => JSON.parse(JSON.parse(localStorage.getItem(k)).settings.accessReviews).pop().items.every((i) => i.d), KEY);
    assert.match(await drawer.innerText(), /9 of 9\s*decided/);

    const actionsBefore = await page.evaluate(() => window.S ? window.S.actions.length : null);
    await drawer.locator('button', { hasText: 'Finish the review' }).click();
    await page.locator('#modalBox button', { hasText: 'Finish and file' }).click();
    await page.waitForFunction((k) => JSON.parse(JSON.parse(localStorage.getItem(k)).settings.accessReviews).pop().status === 'done', KEY);
    rec = JSON.parse((await settings(page)).accessReviews).pop();
    const removed = rec.items.filter((i) => i.d === 'remove').map((i) => i.u).sort();
    assert.deepEqual(removed, ['a.nguyen@meridianhealth.example', 'admin@meridianhealth.example', 'consultant_partner.example#EXT#@meridianhealth.example', 'r.morgan@meridianhealth.example', 'training@meridianhealth.example']);
    assert.equal(Object.keys(rec.actioned).length, 5);
    const acts = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)).actions.filter((a) => a.src === 'Access review'), KEY);
    assert.equal(acts.length, 5);
    assert.ok(acts.some((a) => /Remove access: Riley Morgan .*remove SharePoint Administrator/.test(a.title) && a.control === 'A.8.2' && a.pr === 'High'));
    assert.match(await drawer.innerText(), /Start the access review[\s\S]*Last review AR-.*9 accounts, 5 marked for removal/i);
    assert.deepEqual(errors, []);
    await page.close();
  });

  test('restore test: record a slow restore, raise an action, show it in the history', async () => {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(baseUrl + '/checkpoint/index.html?demo=1', { waitUntil: 'networkidle' });
    await page.evaluate(() => window.App.openRestoreTests());
    const drawer = page.locator('#drawer');
    await drawer.locator('h2', { hasText: 'Restore tests' }).waitFor();
    assert.match(await drawer.innerText(), /0 of 3 tested in the last year[\s\S]*Microsoft 365 mailboxes[\s\S]*Test next/i);
    await drawer.locator('button', { hasText: 'Record a restore test' }).click();
    const box = page.locator('#modalBox');
    await box.locator('textarea').first().fill('The Finance SharePoint site, from the backup service, to a test site');
    await box.locator('input[type="number"]').fill('1800');
    await box.locator('button', { hasText: 'Save and file' }).click();
    await page.waitForFunction((k) => (JSON.parse(localStorage.getItem(k)).settings.restoreTests || '').indexOf('RT-001') !== -1, KEY);
    const t = JSON.parse((await settings(page)).restoreTests)[0];
    assert.equal(t.set, 'Microsoft 365 mailboxes');
    assert.equal(t.result, 'partial');
    assert.match(t.issues[0], /took 30 hours, longer than its recovery time objective of 24 hours/);
    assert.ok(t.action);
    const act = await page.evaluate(([k, id]) => JSON.parse(localStorage.getItem(k)).actions.find((a) => a.id === id), [KEY, t.action]);
    assert.equal(act.control, 'A.8.13');
    await drawer.locator('h2', { hasText: 'Restore tests' }).waitFor();
    assert.match(await drawer.innerText(), /1 of 3 tested in the last year[\s\S]*Passed with issues/i);
    assert.deepEqual(errors, []);
    await page.close();
  });
});
