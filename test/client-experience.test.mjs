// Less noise and fewer surprises for every client: a weekly digest for
// those who want one, lapsed clause obligations on the dashboard,
// evidence that expires with the activity that produces it, the
// auditor's questions answered from the records, and the security
// review set up in four steps.
import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const L = require('../public/checkpoint/lib.js');
const A = require('../public/checkpoint/azure/lib/ownerDigest.js');
const monitor = require('../public/checkpoint/azure/PostureMonitor/index.js').__test;
const app = readFileSync(new URL('../public/checkpoint/app.js', import.meta.url), 'utf8');
const today = '2026-10-08';

describe('weekly digest instead of instant emails', () => {
  test('weekly only when asked for, and only while the digest is on', () => {
    const prefs = { 'priya shah': 'weekly', 'alex@org.example': 'weekly' };
    assert.equal(L.notifyPref(prefs, 'Priya Shah', '', true), 'weekly');
    assert.equal(L.notifyPref(prefs, 'Someone', 'ALEX@org.example', true), 'weekly');
    assert.equal(L.notifyPref(prefs, 'Priya Shah', '', false), 'immediate', 'digest off: nothing would reach them');
    assert.equal(L.notifyPref({}, 'Priya Shah', '', true), 'immediate');
    assert.equal(String(A.notifyPref), String(L.notifyPref));
  });
  test('approval requests are in the digest, the same in the browser and the scheduled function', () => {
    const d = { approvals: [{ name: 'Information Security Policy', approver: 'Alex Morgan', approverEmail: 'alex@org.example', requested: '2026-10-01' }] };
    const l = L.ownerWorkItems(d, today);
    assert.deepEqual(l, A.ownerWorkItems(d, today));
    assert.deepEqual(l[0].items.map((i) => [i.kind, i.title]), [['Approval requested', 'Information Security Policy']]);
    assert.match(L.ownerDigestHtml(l[0], 'Org', ''), /Requested 2026-10-01/);
    assert.equal(String(A.ownerDigestHtml), String(L.ownerDigestHtml));
  });
  test('the instant emails check the preference', () => {
    assert.match(app, /var digestOnly = weeklyOnly\(req\.approver, req\.approverEmail\);/);
    assert.match(app, /if \(weeklyOnly\(send\[i\]\.o\.owner, send\[i\]\.to\)\) \{/);
    assert.match(app, /if \(!to \|\| weeklyOnly\(o\.owner, to\)\) continue;/);
  });
  test('the scheduled function skips the follow-up for a weekly-only owner but still records it', async () => {
    process.env.NOTIFY_FROM = 'checkpoint@org.example';
    const calls = [];
    const g = async (path, opts) => { calls.push({ path, opts }); if (/\/lists\/settings\/items\?/.test(path)) return { value: [{ id: '7', fields: { SettingKey: 'securityReviews' } }] }; return {}; };
    const rows = { acts: [{ RefId: 'A1', Title: 'Rotate keys', Owner: 'Priya Shah', OwnerEmail: 'priya@org.example', Status: 'Open', DueDate: '2026-11-30' }] };
    const gAll = async (path) => { const m = /lists\/([^/]+)\/items/.exec(path); return m ? (rows[m[1]] || []).map((fields) => ({ fields })) : []; };
    const ctx = { log: Object.assign(() => {}, { error: () => {} }) };
    const reviews = [{ id: 'SR-002', n: 2, date: '2026-10-01', status: 'Held', actions: ['A1'] }];
    const settings = { ownerDigestEnabled: 'true', notifyPrefs: JSON.stringify({ 'priya shah': 'weekly' }),
      securityReviewSetup: JSON.stringify({ chair: 'Alex', owner: 'Priya Shah', week: 2, weekday: 2, time: '10:00', emails: 'a@org.example', autoSend: 'false' }), securityReviews: JSON.stringify(reviews) };
    const done = await monitor.runSecurityReview(g, gAll, ctx, 'site', { Settings: 'settings' }, { Actions: 'acts' }, settings, '2026-10-08', 60, { failingTop: [] });
    assert.deepEqual(done, ['follow-ups SR-002 (0)']);
    assert.ok(!calls.some((c) => /sendMail/.test(c.path)));
  });
  test('the weekly digest from the scheduled function carries approval requests', async () => {
    process.env.NOTIFY_FROM = 'checkpoint@org.example';
    const sent = [];
    const g = async (path, opts) => { if (/sendMail/.test(path)) sent.push(opts.body.message); return { value: [] }; };
    const gAll = async () => [];
    const ctx = { log: Object.assign(() => {}, { error: () => {} }) };
    const n = await monitor.sendOwnerReminders(g, gAll, ctx, 'site', { Settings: 'settings' }, {}, { ownerDigestEnabled: 'true',
      approvalRequests: JSON.stringify([{ name: 'Access Control Policy', approver: 'Alex Morgan', approverEmail: 'alex@org.example', requested: '2026-10-02' }]) }, today);
    assert.equal(n, 1);
    assert.equal(sent[0].toRecipients[0].emailAddress.address, 'alex@org.example');
    assert.match(sent[0].body.content, /Approval requested[\s\S]*Access Control Policy/);
  });
});

describe('what an auditor would find first', () => {
  const base = { today, audits: [{ status: 'Completed', completed: '2026-03-01' }], managementReviews: [{ date: '2026-04-01' }],
    risks: [{ status: 'Open', lastReviewed: '2026-08-01' }], training: [{ status: 'Completed', completed: '2026-06-01' }], scans: [{ date: '2026-10-01' }],
    docs: [{ name: 'Information Security Policy', status: 'Approved', nextReview: '2027-01-01' }], actions: [] };
  test('nothing when every recurring obligation is on time', () => {
    assert.deepEqual(L.clauseCadenceGaps(base), []);
  });
  test('each lapsed obligation, the most serious first, with the step that fixes it', () => {
    const g = L.clauseCadenceGaps({ ...base, audits: [{ status: 'Completed', completed: '2025-08-01' }], scans: [{ date: '2026-07-01' }],
      actions: [{ type: 'Non-conformity (Minor)', status: 'Open', due: '2026-09-01' }], docs: [{ name: 'Information Security Policy', status: 'Draft' }],
      securityReviewOn: true, securityReviews: [{ status: 'Held', date: '2026-07-14' }], clausesOverdue: ['9.1 Monitoring'] });
    assert.deepEqual(g.map((x) => [x.clause, x.severity, x.view]), [
      ['9.2', 'fail', 'audits'], ['5.2', 'fail', 'documents'], ['10.2', 'fail', 'actions'],
      ['9.1', 'warn', 'scan'], ['9.1', 'warn', 'reviews'], ['', 'warn', 'clauses']]);
    assert.equal(g[0].issue, 'Overdue: last completed 1 Aug 2025, due every 12 months');
    assert.equal(g[1].issue, 'Not approved by top management');
  });
  test('the interval set for the management review is the one checked', () => {
    assert.equal(L.clauseCadenceGaps({ ...base, mrMonths: 3 })[0].issue, 'Overdue: last held 1 Apr 2026, due every 3 months');
  });
  test('it sits on the dashboard', () => {
    assert.match(app, /function renderDash\(\) \{\n    renderCertDashCard\(\);\n    renderClauseGaps\(\);/);
  });
});

describe('evidence that expires with the activity that produces it', () => {
  test('the activity\u2019s own frequency, plus a quarter for running late', () => {
    assert.deepEqual(L.evidenceValidity('A.8.13', []), { days: 229, freq: 'Biannual', activity: 'Backup restore test' });
    assert.equal(L.evidenceValidity('A.8.13', [{ category: 'Backup restore test', freq: 'Quarterly', status: 'Active' }]).days, 115);
    assert.equal(L.evidenceValidity('A.8.13', [{ category: 'Backup restore test', freq: 'Quarterly', status: 'Retired' }]).days, 229, 'a retired activity does not count');
    assert.equal(L.evidenceValidity('A.5.1', []), null, 'no activity: the review cadence applies');
  });
  test('the evidence check uses it, and says until when evidence was current', () => {
    const targets = [{ kind: 'control', key: 'iso27001|A.8.13', label: 'A.8.13 Backup', url: 'https://x.sharepoint.com/a', implemented: true },
      { kind: 'control', key: 'iso27001|A.5.1', label: 'A.5.1 Policies', url: 'https://x.sharepoint.com/b', implemented: true }];
    const probes = { 'https://x.sharepoint.com/a': { ok: true, modified: '2026-01-01' }, 'https://x.sharepoint.com/b': { ok: true, modified: '2026-01-01' } };
    const issues = L.evidenceCheckIssues(targets, probes, today, 365, (t) => L.evidenceValidity(t.key.split('|').pop(), []));
    assert.deepEqual(issues.map((x) => [x.key, x.validUntil, x.freq]), [['iso27001|A.8.13', '2026-08-18', 'Biannual']]);
    assert.equal(L.evidenceCheckIssues(targets, probes, today, 365).length, 0, 'without it: the old one-year rule');
  });
  test('out-of-date evidence is a mock audit finding', () => {
    const controls = [{ fw: 'iso27001', id: 'A.8.13', t: 'Backup', app: true, st: 'Implemented', evidenceUrl: 'https://x', own: 'Priya' }];
    const m = L.mockAudit({ controls, expiredEvidence: { 'iso27001|A.8.13': { modified: '2026-01-01', validUntil: '2026-08-18', freq: 'Biannual' } } }, today, 's');
    assert.ok(m.findings.some((f) => /A\.8\.13 evidence is out of date: last changed 1 Jan 2026, current only until 18 Aug 2026 for a biannual activity/.test(f.text)));
  });
  test('the owner is asked for it again, and the request clears when new evidence arrives', () => {
    assert.match(app, /req\[x\.key\] = \{ owner: c\.own, email: '', date: today, reason: 'out of date' \};/);
    assert.match(app, /if \(rq\[label\]\) \{\n          delete rq\[label\];/);
  });
});

describe('the auditor\u2019s questions, answered from the records', () => {
  test('every clause from 4.1 to 10.2 has questions', () => {
    ['4.1', '4.2', '4.3', '4.4', '5.1', '5.2', '5.3', '6.1.1', '6.1.2', '6.1.3', '6.2', '6.3', '7.1', '7.2', '7.3', '7.4', '7.5', '8.1', '8.2', '8.3', '9.1', '9.2', '9.3', '10.1', '10.2']
      .forEach((c) => assert.ok(L.AUDITOR_QUESTIONS[c] && L.AUDITOR_QUESTIONS[c].length, c));
  });
  test('what can be shown, what is missing, and whether it is ready', () => {
    const b = L.auditorQuestionBank({ today,
      clauses: [{ code: '9.2', title: 'Internal audit', evidenceUrl: 'https://x', checklist: { items: [{ text: 'Programme planned', status: 'met', note: 'AUD-001' }, { text: 'Results reported', status: 'open', note: 'No report' }] } },
        { code: '99', title: 'Not a clause', checklist: { items: [] } }],
      controls: [{ id: 'A.8.13', title: 'Backup', status: 'Implemented', owner: 'Priya', evidenceUrl: 'https://x', applicable: true, currentUntil: '2026-08-18' },
        { id: 'A.6.1', title: 'Screening', applicable: false, justification: 'No staff' }] });
    assert.deepEqual(b.clauses.map((c) => [c.ref, c.holds, c.gaps, c.ready]), [['9.2', ['Programme planned: AUD-001'], ['Results reported (No report)'], false]]);
    assert.deepEqual(b.controls.map((c) => [c.ref, c.gaps, c.ready]), [['A.8.13', ['Evidence out of date since 18 Aug 2026'], false], ['A.6.1', [], true]]);
    assert.equal(b.controls[1].holds[0], 'Excluded from the Statement of Applicability: No staff');
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
  test('dashboard gaps, the email preference, the question bank and the four-step setup', async () => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(baseUrl + '/checkpoint/index.html?demo=1', { waitUntil: 'networkidle' });
    await page.waitForSelector('#clauseGapsCard .cg-row');
    const gaps = await page.locator('#clauseGapsCard').innerText();
    assert.match(gaps, /What an auditor would find first/i);
    await page.locator('#clauseGapsCard .cg-row button').first().click();
    await page.waitForTimeout(200);
    assert.ok(!(await page.locator('#v-dash').evaluate((e) => e.classList.contains('on'))), 'the fix button opens the page that fixes it');
    // My tasks: the email preference (weekly needs the digest on).
    await page.evaluate(() => window.App.go('mytasks'));
    await page.waitForSelector('#myTasksBody .my-notify select');
    assert.equal(await page.locator('#myTasksBody .my-notify option[value="weekly"]').isDisabled(), true);
    // The auditor question bank.
    let popup = context.waitForEvent('page');
    await page.evaluate(() => window.App.report('auditqs'));
    const doc = await popup; await doc.waitForLoadState(); await doc.waitForTimeout(300);
    const text = await reportText(doc);
    assert.match(text, /Auditor questions and your answers/);
    assert.match(text, /Show me the last management review/);
    assert.match(text, /Show me a backup being restored/);
    await doc.close();
    // The four-step setup ends with the kick-off prepared.
    await page.evaluate(() => window.App.go('reviews'));
    await page.evaluate(() => { window.App.securityReviewWalkthrough(); });
    for (let step = 1; step <= 3; step++) {
      await page.waitForFunction((n) => (document.querySelector('#modalBox') || {}).innerText && document.querySelector('#modalBox').innerText.includes(n + ' of 4'), step);
      await page.locator('#modalBox .m-btns .btn:not(.ghost)').click();
    }
    await page.waitForFunction(() => document.querySelector('#modalBox') && document.querySelector('#modalBox').innerText.includes('4 of 4'));
    assert.match(await page.locator('#modalBox').innerText(), /The kick-off is on/);
    await page.locator('#modalBox .m-btns .btn:not(.ghost)').click();
    await page.waitForSelector('#drawer .sr-item');
    assert.match(await page.locator('#drawer').innerText(), /Security review \d/);
    assert.deepEqual(errors, []);
    await context.close();
  });
});
