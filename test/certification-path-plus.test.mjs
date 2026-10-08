// A plan worked back from the Stage 1 date, the certification gate as a
// checklist, "Finish this clause", evidence that fits the requirement, and
// the top management readiness interview.
import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const L = require('../public/checkpoint/lib.js');

describe('plan worked back from the Stage 1 target', () => {
  const steps = [{ id: 'scope', label: 'Scope', done: true }, { id: 'docs', label: 'Docs', done: false }, { id: 'audit', label: 'Audit', done: false }, { id: 'review', label: 'Review', done: false }, { id: 'book', label: 'Book', done: false }];
  test('without a target the standard 90 days; with one, every date scales to end on it', () => {
    const std = L.onboardingSchedule(steps, '2026-09-01', '2026-10-08');
    assert.equal(std.target, '');
    assert.equal(std.steps.find((s) => s.id === 'book').target, '2026-11-30');
    const p = L.onboardingSchedule(steps, '2026-09-01', '2026-10-08', '2027-03-01');
    assert.equal(p.target, '2027-03-01');
    assert.equal(p.steps.find((s) => s.id === 'book').target, '2027-03-01');
    assert.ok(p.steps.find((s) => s.id === 'audit').target > std.steps.find((s) => s.id === 'audit').target, 'a later target gives each step more time');
  });
  test('milestones say what is done, what is late and by how much', () => {
    const p = L.onboardingSchedule(steps, '2026-09-01', '2026-10-08', '2027-03-01');
    const m = L.certificationMilestones(p, '2026-10-08');
    assert.deepEqual(m.milestones.map((x) => x.key), ['documented', 'audit', 'review', 'stage1']);
    const doc = m.milestones[0];
    assert.equal(doc.lateDays, 23);
    assert.deepEqual(doc.open, ['Docs']);
    assert.equal(m.atRisk, true, 'a late milestone puts the target at risk');
    assert.equal(m.daysToTarget, 144);
  });
  test('it warns when the target has passed, is too close, or is too tight to begin with', () => {
    const passed = L.certificationMilestones(L.onboardingSchedule(steps, '2026-09-01', '2026-12-01', '2026-11-20'), '2026-12-01');
    assert.match(passed.warnings[0], /has passed with 4 step\(s\) still open/);
    const tight = L.certificationMilestones(L.onboardingSchedule(steps, '2026-10-01', '2026-10-08', '2026-11-15'), '2026-10-08');
    assert.ok(tight.warnings.some((w) => /Less than two months/.test(w)));
    assert.ok(tight.warnings.some((w) => /will slip/.test(w)) === false || tight.atRisk);
  });
  test('the partner console flags a target at risk', () => {
    const flags = L.clientAttentionFlags({ lastSynced: '2026-10-07', progress: { delivery: { plan: { week: 6, behind: 0, target: '2026-11-01', atRisk: true, milestonesLate: ['The ISMS documented'] } } } }, '2026-10-08');
    const f = flags.find((x) => x.key === 'target');
    assert.equal(f.level, 'red');
    assert.match(f.text, /Stage 1 target 2026-11-01 at risk: The ISMS documented late/);
  });
});

describe('certification gate checklist', () => {
  const base = { today: '2026-10-08', onboardedDate: '2026-09-01', scopeStatement: 'Our SaaS platform', risks: [{ status: 'Open', treat: 'Mitigate', owner: 'A' }], soa: { applicable: 93 }, md: [{ ref: '4.3', item: 'ISMS scope', status: 'done' }] };
  test('every check is listed, passed or not, with where to fix it', () => {
    const r = L.certificationBookingReadiness(Object.assign({}, base, { evidenceIssues: 2, clauseEvidenceWrong: ['9.3'] }));
    assert.equal(r.stage1.ok, true, 'advice never blocks Stage 1');
    const byLabel = Object.fromEntries(r.checks.map((c) => [c.label, c]));
    assert.equal(byLabel['ISMS scope statement written'].ok, true);
    assert.equal(byLabel['Evidence links checked and working'].blocking, false);
    assert.equal(byLabel['Clause evidence is the right kind and current'].ok, false);
    assert.match(byLabel['Clause evidence is the right kind and current'].detail, /Clause 9\.3/);
    assert.equal(byLabel['Internal audit of Clauses 4 to 10 completed'].fix.id, 'audits');
    assert.equal(byLabel['About three months of records of the ISMS operating'].ok, false);
    assert.equal(byLabel['About three months of records of the ISMS operating'].blocking, false);
  });
  test('what blocks booking is unchanged', () => {
    const r = L.certificationBookingReadiness(Object.assign({}, base, { scopeStatement: '' }));
    assert.deepEqual(r.stage1.missing, ['the ISMS scope statement (scope & context questionnaire)']);
    assert.ok(r.stage2.missing.includes('a completed internal audit of Clauses 4-10'));
  });
});

describe('finish this clause', () => {
  const cl = { items: [
    { id: 'a', text: 'Requirement A', status: 'open', gaps: [{ kind: 'doc', id: 'infosec-objectives-metrics', st: 'missing' }] },
    { id: 'b', text: 'Requirement B', status: 'open', gaps: [] },
    { id: 'c', text: 'Requirement C', status: 'met' }
  ] };
  test('Checkpoint’s steps first, then what only you can record, owner, evidence, then Implemented', () => {
    const f = L.clauseFinishSteps(cl, { id: '6.2', st: 'In progress' }, 'iso27001|6.2', { titles: { 'infosec-objectives-metrics': 'Objectives plan' }, docs: [] });
    assert.deepEqual(f.steps.map((s) => s.key), ['doc:infosec-objectives-metrics', 'confirm:b', 'owner', 'evidence', 'implement']);
    assert.equal(f.steps[0].label, 'Generate and approve the Objectives plan');
    assert.equal(f.steps[1].arg, 'iso27001|6.2#b');
    assert.equal(f.steps[4].action, 'App.markClauseImplemented');
  });
  test('wrong evidence becomes a step; a finished clause has none', () => {
    const fit = { level: 'fail', issues: ['The linked file is a policy.'], expects: 'minutes' };
    const f = L.clauseFinishSteps({ items: [] }, { id: '9.3', own: 'Sam', evidenceUrl: 'https://x', st: 'In progress' }, 'k', { evidenceFit: fit });
    assert.deepEqual(f.steps.map((s) => s.key), ['evidence', 'implement']);
    assert.match(f.steps[0].label, /Replace the evidence/);
    assert.equal(L.clauseFinishSteps({ items: [] }, { id: '9.3', own: 'Sam', evidenceUrl: 'https://x', st: 'Implemented' }, 'k', {}).done, true);
  });
});

describe('evidence that fits the requirement', () => {
  const today = '2026-10-08';
  test('a policy where a record is needed, a draft, and an old record all fail', () => {
    const pol = { name: 'Information Security Policy.html', category: 'Policies & Procedures', status: 'Approved' };
    assert.equal(L.clauseEvidenceFit('9.3', { url: 'u', doc: pol }, today).level, 'fail');
    assert.equal(L.clauseEvidenceFit('5.2', { url: 'u', doc: pol }, today).level, 'ok');
    assert.match(L.clauseEvidenceFit('5.2', { url: 'u', doc: Object.assign({}, pol, { status: 'Draft' }) }, today).issues[0], /draft, not approved/);
    const old = L.clauseEvidenceFit('9.2', { url: 'u', folder: { names: ['Internal audit report.html'], latest: '2025-06-01', count: 1 } }, today);
    assert.equal(old.level, 'fail');
    assert.match(old.issues[0], /over 12 months old/);
  });
  test('a current record passes; a misnamed one is a warning; an outside link cannot be checked; an empty folder fails', () => {
    assert.equal(L.clauseEvidenceFit('9.2', { url: 'u', folder: { names: ['Internal audit report 2026.html'], latest: '2026-09-01', count: 1 } }, today).level, 'ok');
    assert.equal(L.clauseEvidenceFit('9.2', { url: 'u', folder: { names: ['notes.docx'], latest: '2026-09-01', count: 1 } }, today).level, 'warn');
    assert.equal(L.clauseEvidenceFit('9.2', { url: 'https://elsewhere' }, today).level, 'unknown');
    assert.equal(L.clauseEvidenceFit('9.2', { url: 'u', folder: { names: [], count: 0 } }, today).level, 'fail');
    assert.equal(L.clauseEvidenceFit('9.2', {}, today).level, 'none');
    assert.equal(L.clauseEvidenceFit('A.5.1', { url: 'u' }, today).level, 'ok', 'only clauses with an expectation are judged');
  });
});

describe('top management interview', () => {
  test('each question shows what the records say; gaps and blanks are flagged', () => {
    const iv = L.topManagementInterview({ today: '2026-10-08', policyApproved: true, objectives: [{ title: 'MFA', status: 'On track' }], appetite: 'Medium', aboveAppetite: 2, ismsOwner: 'Sam', lastReview: '2026-09-01', incidents: 1, correctiveWithCause: 1, changes: 4, resourcesStated: true },
      { policy: 'Protect customer data', risk: 'We accept nothing above medium' });
    assert.equal(iv.total, 8);
    assert.equal(iv.answered, 2);
    const risk = iv.rows.find((r) => r.id === 'risk');
    assert.equal(risk.recordsOk, false);
    assert.equal(risk.flagged, true, 'the register contradicts this answer');
    assert.match(risk.records, /2 risks are above the Medium appetite/);
    const pol = iv.rows.find((r) => r.id === 'policy');
    assert.equal(pol.flagged, false);
    assert.equal(iv.rows.find((r) => r.id === 'review').recordsOk, true);
  });
  test('an old management review and no owner are gaps', () => {
    const iv = L.topManagementInterview({ today: '2026-10-08', lastReview: '2025-01-01' }, {});
    assert.equal(iv.rows.find((r) => r.id === 'review').recordsOk, false);
    assert.equal(iv.rows.find((r) => r.id === 'roles').recordsOk, false);
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

async function reportText(doc) {
  const parts = [];
  for (const f of doc.frames()) parts.push(await f.evaluate(() => document.body ? document.body.innerText : ''));
  return parts.join('\n');
}
const confirm = (page) => page.click('#modalBox .m-btns .btn:not(.ghost)');

describe('in the browser', { skip: skipReason || false }, () => {
  test('target date, milestones, gate, finish this clause and the interview', async () => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(baseUrl + '/checkpoint/index.html?demo=1', { waitUntil: 'networkidle' });
    // Target date: the path works back from it.
    const target = await page.evaluate(() => { const d = new Date(); d.setUTCDate(d.getUTCDate() + 120); return d.toISOString().slice(0, 10); });
    await page.evaluate(() => { window.App.setStage1Target(); });
    await page.fill('#modalBox input[type=date]', target);
    await confirm(page);
    await page.waitForTimeout(300);
    assert.match(await page.locator('#gettingStartedCard .gs-compact').innerText(), /Stage 1 target/);
    await page.evaluate(() => { document.querySelector('#gettingStartedCard details.gs-detail').open = true; });
    const ms = await page.locator('#gettingStartedCard .gs-ms').innerText();
    assert.match(ms, /Working back from Stage 1 on[\s\S]*The ISMS documented[\s\S]*Internal audit completed[\s\S]*Management review held[\s\S]*Ready for Stage 1/);
    // Gate checklist on the certification page, with fix buttons.
    await page.evaluate(() => window.App.go('certification'));
    const gate = page.locator('#certCards .gate').first();
    assert.match(await gate.innerText(), /Stage 1[\s\S]*ISMS scope statement written[\s\S]*Stage 2[\s\S]*Internal audit of Clauses 4 to 10/);
    assert.ok(await gate.locator('button[data-action]').count() > 0, 'each failing check has its fix');
    // Finish this clause in the clause's side panel.
    await page.evaluate(() => window.App.finishClause('iso27001|4.1'));
    const fin = await page.locator('#clauseFinish').innerText();
    assert.match(fin, /Finish this clause: \d+ steps? left[\s\S]*Do this now/i);
    assert.match(await page.locator('#drawer').innerText(), /Right evidence, and current[\s\S]*An auditor expects the context of the organisation/);
    await page.keyboard.press('Escape');
    // The interview: records shown, answers saved, report shows both.
    await page.evaluate(() => { window.App.topMgmtInterview(); });
    await page.waitForSelector('#modalBox.open');
    assert.match(await page.locator('#modalBox').innerText(), /What the records say[\s\S]*6\.1/);
    const areas = page.locator('#modalBox textarea');
    await areas.nth(0).fill('Keep customer data safe so customers keep trusting us');
    await confirm(page);
    await page.waitForSelector('#modalBox.open');
    assert.match(await page.locator('#modalBox').innerText(), /1 of 8 answered/);
    await page.click('#modalBox .m-btns .btn.ghost');
    const popup = context.waitForEvent('page');
    await page.evaluate(() => window.App.report('tminterview'));
    const doc = await popup; await doc.waitForLoadState(); await doc.waitForTimeout(300);
    assert.match(await reportText(doc), /Top management interview[\s\S]*The records say[\s\S]*Keep customer data safe/i);
    await doc.close();
    assert.deepEqual(errors, []);
    await context.close();
  });
});
