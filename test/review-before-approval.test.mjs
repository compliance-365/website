// The approval matrix: a second person's review between a draft and its
// approval, and risk acceptance recorded by the person accountable.
import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
globalThis.window = globalThis.window || {};
const Lib = require('../public/checkpoint/lib.js');
const html = readFileSync(new URL('../public/checkpoint/index.html', import.meta.url), 'utf8');
const store = readFileSync(new URL('../public/checkpoint/store.js', import.meta.url), 'utf8');

const D = 'Access Control Policy.html';
const e = (action, after, at, actor) => ({ targetType: 'Document', targetId: D, action, after: after || '', entryDateTime: at, actor: actor || 'Sam Okafor' });

describe('review state from the audit log', () => {
  test('a review stands until the document changes or is approved', () => {
    const log = [
      e('Policy template generated', '{}', '2026-10-01T01:00:00Z'),
      e('Document reviewed', Lib.docReviewAfter('Reviewed', 'Cem Caglar', 'Fine'), '2026-10-02T01:00:00Z', 'Cem Caglar')
    ];
    const st = Lib.docSignoffReviewState(log, D);
    assert.equal(st.current.reviewer, 'Cem Caglar');
    assert.equal(st.current.outcome, 'Reviewed');
    assert.equal(st.current.comment, 'Fine');
    assert.equal(st.atApproval, null);
    const edited = log.concat([e('Policy content edited', '', '2026-10-03T01:00:00Z')]);
    assert.equal(Lib.docSignoffReviewState(edited, D).current, null, 'an edit after the review ends it');
    const approved = log.concat([e('Policy document approved', 'Approved v1.0 by Ekin Yilmaz · next review 2027-10-01', '2026-10-04T01:00:00Z')]);
    const a = Lib.docSignoffReviewState(approved, D);
    assert.equal(a.current, null);
    assert.equal(a.atApproval.reviewer, 'Cem Caglar', 'the approval rests on the review');
  });
  test('changes requested is recorded, with the comment, and does not clear the gate', () => {
    const log = [e('Document reviewed', Lib.docReviewAfter('Changes requested', 'Cem Caglar', 'Quarterly, not annual · please'), '2026-10-02T01:00:00Z')];
    const r = Lib.docSignoffReviewState(log, D).current;
    assert.equal(r.outcome, 'Changes requested');
    assert.equal(r.comment, 'Quarterly, not annual · please');
    assert.match(Lib.reviewGateReason({ needed: true, review: r }), /asked for changes: Quarterly/);
  });
  test('history shows the review between the draft and the approval', () => {
    const log = [
      e('Policy template generated', '{}', '2026-10-01T01:00:00Z'),
      e('Document reviewed', Lib.docReviewAfter('Reviewed', 'Cem Caglar'), '2026-10-02T01:00:00Z'),
      e('Policy document approved', 'Approved v1.0 by Ekin Yilmaz · next review 2027-10-01', '2026-10-04T01:00:00Z')
    ];
    assert.deepEqual(Lib.documentHistory(log, D).map((r) => [r.version, r.description, r.by]), [
      ['0.1', 'Draft generated', 'Sam Okafor'], ['Draft', 'Reviewed', 'Cem Caglar'], ['1.0', 'Approved for use', 'Ekin Yilmaz']
    ]);
  });
});

describe('the matrix and its gates', () => {
  test('which documents need a review', () => {
    const isp = { name: 'Information Security Policy.html' }, acp = { name: D }, proc = { name: 'Incident Response Procedure.html', docKind: 'Procedure' };
    assert.deepEqual([isp, acp, proc].map((d) => Lib.docNeedsReview('', d)), [false, false, false]);
    assert.deepEqual([isp, acp, proc].map((d) => Lib.docNeedsReview('isp', d)), [true, false, false]);
    assert.deepEqual([isp, acp, proc].map((d) => Lib.docNeedsReview('policies', d)), [true, true, false]);
    assert.deepEqual([isp, acp, proc].map((d) => Lib.docNeedsReview('all', d)), [true, true, true]);
  });
  test('three different people: preparer, reviewer, approver', () => {
    const r = { outcome: 'Reviewed', reviewer: 'Cem Caglar' };
    assert.equal(Lib.reviewGateReason({ needed: false }), '');
    assert.match(Lib.reviewGateReason({ needed: true, review: null }), /needs a review/);
    assert.equal(Lib.reviewGateReason({ needed: true, review: r, approver: 'Ekin Yilmaz' }), '');
    assert.match(Lib.reviewGateReason({ needed: true, review: r, approver: 'C. Caglar (ISMS owner)' }), /someone else must approve/);
    assert.match(Lib.reviewerConflictReason('Sam Okafor', 'S. Okafor'), /prepared this document/);
    assert.equal(Lib.reviewerConflictReason('Cem Caglar', 'Sam Okafor'), '');
  });
  test('the reviewer is on the HTML and Word sign-off tables', () => {
    assert.match(readFileSync(new URL('../public/checkpoint/lib.js', import.meta.url), 'utf8'), /opts\.reviewedBy \? \[\['Reviewed by', opts\.reviewedBy/);
    assert.match(readFileSync(new URL('../public/checkpoint/app.js', import.meta.url), 'utf8'), /opts\.reviewedBy \? '<tr><td>Reviewed by<\/td>/);
  });
  test('settings default off, and both rows are in Settings', () => {
    assert.match(store, /docReviewLevel: '',/);
    assert.match(store, /riskAcceptSecond: 'false',/);
    assert.match(html, /id="approvalMatrixRow"/);
    assert.match(html, /id="riskAcceptSecondRow"/);
  });
});

let chromium = null, skipReason = null;
try { ({ chromium } = await import('playwright')); } catch (err) { skipReason = 'playwright is not installed'; }
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
  catch (err) { skipReason = 'Chromium not found'; }
}
after(async () => { if (browser) await browser.close(); if (server) server.close(); });
const KEY = 'checkpoint-demo-v8';
const confirmBtn = '#modalBox .m-btns .btn:not(.ghost)';

describe('in the browser', { skip: skipReason || false }, () => {
  test('a policy is reviewed by a second person before approval', async () => {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [];
    page.on('pageerror', (x) => errors.push(String(x)));
    await page.goto(baseUrl + '/checkpoint/index.html?demo=1', { waitUntil: 'networkidle' });
    await page.evaluate(() => window.App.setDocReviewLevel('policies'));
    await page.evaluate(() => window.App.go('documents'));
    const id = 'Policies & Procedures|AI Policy.html';
    const ask = page.locator('#docRows [data-action="App.requestReview"][data-id="' + id + '"]');
    await ask.waitFor();
    assert.equal(await page.locator('#docRows [data-action="App.requestApproval"][data-id="' + id + '"]').count(), 0, 'approval is not offered before the review');
    await page.locator('#docRows [data-action="App.approveTemplate"][data-id="' + id + '"]').click();
    await page.waitForSelector('#modalBox h3');
    assert.equal(await page.locator('#modalBox h3').innerText(), 'Review needed first');
    await page.locator(confirmBtn).click();
    await page.waitForFunction(() => /Ask for a review/.test(document.querySelector('#modalBox h3') && document.querySelector('#modalBox h3').innerText));
    await page.locator('#modalBox .m-field input').first().fill('Mei Chen');
    await page.locator(confirmBtn).click();
    await page.waitForFunction((k) => /"kind":"review"/.test((JSON.parse(localStorage.getItem(k)).settings || {}).approvalRequests || ''), KEY);
    assert.match(await page.locator('#docRows').innerText(), /Review: Mei Chen/);

    await page.evaluate(() => { window.App.go('mytasks'); window.App.setMyTasksAs('Mei Chen'); });
    const task = page.locator('#myTasksBody [data-action="App.reviewRequested"]');
    await task.waitFor();
    await task.click();
    await page.waitForFunction(() => /^Check “AI Policy\.html”/.test(document.querySelector('#modalBox h3') && document.querySelector('#modalBox h3').innerText));
    await page.locator('#modalBox textarea').fill('Matches what we do.');
    await page.locator(confirmBtn).click();
    await page.waitForFunction(() => /Send it for approval/.test(document.querySelector('#modalBox h3') && document.querySelector('#modalBox h3').innerText));
    await page.locator('#modalBox .m-btns .btn.ghost').click();
    const s = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)), KEY);
    const entry = s.auditLog.find((x) => x.action === 'Document reviewed');
    assert.equal(entry.after, 'Reviewed by Mei Chen · Matches what we do.');
    assert.equal(JSON.parse(s.settings.approvalRequests).filter((r) => r.kind === 'review').length, 0, 'the review request is closed');
    await page.evaluate(() => { window.App.setMyTasksAs(''); window.App.go('documents'); });
    await page.locator('#docRows [data-action="App.requestApproval"][data-id="' + id + '"]').waitFor();
    assert.deepEqual(errors, []);
    await page.close();
  });

  test('risk acceptance goes to the person accountable, who records it', async () => {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [];
    page.on('pageerror', (x) => errors.push(String(x)));
    await page.goto(baseUrl + '/checkpoint/index.html?demo=1', { waitUntil: 'networkidle' });
    await page.evaluate(() => window.App.toggleRiskAcceptSecond());
    const rid = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)).risks[0].id, KEY);
    page.evaluate((r) => window.App.acceptRisk(r), rid);
    await page.waitForFunction(() => /^Ask for acceptance/.test(document.querySelector('#modalBox h3') && document.querySelector('#modalBox h3').innerText));
    await page.locator('#modalBox .m-field input').first().fill('Mei Chen');
    await page.locator(confirmBtn).click();
    await page.waitForFunction((k) => /Mei Chen/.test((JSON.parse(localStorage.getItem(k)).settings || {}).riskAcceptRequests || ''), KEY);
    await page.evaluate(() => { window.App.go('mytasks'); window.App.setMyTasksAs('Mei Chen'); });
    const task = page.locator('#myTasksBody [data-action="App.acceptRequestedRisk"]');
    await task.waitFor();
    await task.click();
    await page.waitForFunction(() => /^(Accept residual risk|You are authorising)/.test(document.querySelector('#modalBox h3') && document.querySelector('#modalBox h3').innerText));
    if (/^You are authorising/.test(await page.locator('#modalBox h3').innerText())) {
      await page.locator(confirmBtn).click();
      await page.waitForFunction(() => /^Accept residual risk/.test(document.querySelector('#modalBox h3') && document.querySelector('#modalBox h3').innerText));
    }
    assert.equal(await page.locator('#modalBox .m-field input[type="text"]').count(), 0, 'no free-text "Accepted by": it is the signed-in person');
    await page.locator(confirmBtn).click();
    await page.waitForFunction((a) => { const s = JSON.parse(localStorage.getItem(a[0])); return s.risks.find((r) => r.id === a[1]).acceptedBy === 'Mei Chen'; }, [KEY, rid]);
    const s = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)), KEY);
    assert.match(s.auditLog.find((x) => x.action === 'Residual risk accepted').after, /^Accepted by Mei Chen on .*; asked for by .+, recorded by the person accepting/);
    assert.equal(JSON.parse(s.settings.riskAcceptRequests).length, 0);
    assert.deepEqual(errors, []);
    await page.close();
  });
});
