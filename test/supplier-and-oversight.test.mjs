// Oversight for every client: an ISMS health score on the partner
// console, a risk-weighted internal audit plan, suppliers renewing
// their certificates through their own link, a Stage 2 sampling dry
// run, and a plain-English month for top management.
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
const VR = require('../public/checkpoint/azure/lib/vendorRenewal.js');
const monitor = require('../public/checkpoint/azure/PostureMonitor/index.js').__test;
const owner = readFileSync(new URL('../public/owner/owner.js', import.meta.url), 'utf8');
const today = '2026-10-08';

describe('ISMS health score', () => {
  test('100 less capped points for what has lapsed, worst first', () => {
    const h = L.ismsHealthScore({ gaps: [{ severity: 'fail' }, { severity: 'warn' }], staleEvidence: 3, overdueActions: 2, openActions: 8, missedReviews: 1 });
    assert.equal(h.score, 59);
    assert.equal(h.band, 'watch');
    assert.deepEqual(h.factors.map((f) => f.label), ['2 lapsed requirements', '1 security review missed', '2 overdue actions', '3 controls with out-of-date evidence']);
    assert.equal(L.ismsHealthScore({}).score, 100);
    assert.equal(L.ismsHealthScore({ gaps: Array(9).fill({ severity: 'fail' }) }).score, 60, 'one factor alone cannot sink it');
  });
  test('missed security reviews: unminuted meetings, and a long gap', () => {
    const setup = { chair: 'A' };
    assert.equal(L.securityReviewsMissed([{ status: 'Sent', date: '2026-09-20' }], setup, today), 1);
    assert.equal(L.securityReviewsMissed([{ status: 'Sent', date: '2026-10-05' }], setup, today), 0, 'a week to record the minutes');
    assert.equal(L.securityReviewsMissed([{ status: 'Held', date: '2026-07-01' }], setup, today), 3);
    assert.equal(L.securityReviewsMissed([], null, today), 0);
  });
  test('it travels in the snapshot and raises a flag on the console', () => {
    const snap = L.buildProgressSnapshot({ today, delivery: { health: { score: 38, band: 'poor', factors: [{ label: '4 lapsed requirements', points: 40 }] } } });
    assert.equal(snap.delivery.health.score, 38);
    const flags = L.clientAttentionFlags({ progress: snap, lastSynced: today }, today);
    assert.ok(flags.some((f) => f.key === 'health' && f.level === 'red' && /ISMS health 38\/100: 4 lapsed requirements/.test(f.text)));
    assert.match(owner, /<th scope="col">ISMS health<\/th>/);
    assert.match(owner, /opt\('health', 'Lowest ISMS health first'/);
  });
});

describe('risk-weighted internal audit plan', () => {
  const controls = ['A.5.1', 'A.5.15', 'A.5.19', 'A.6.3', 'A.7.1', 'A.8.5', 'A.8.13', 'A.8.99'].map((id) => ({ id, t: id, app: id !== 'A.8.99' }));
  const plan = L.riskWeightedAuditPlan({ start: today, controls, risks: [{ id: 'R-1', controls: ['A.8.13'], score: 15 }, { id: 'R-2', controls: ['A.5.19'], score: 6 }, { id: 'R-3', controls: ['A.5.1'], score: 25, status: 'Closed' }], findings: [{ control: 'A.8.5', id: 'ACT-7' }] });
  test('clauses first, then the riskiest theme, within 12 months', () => {
    assert.deepEqual(plan.map((p) => [p.planned, p.scope]), [
      ['2026-11-08', 'Clauses 4-10 (management system)'],
      ['2027-02-08', 'Annex A.8 (technological controls): focus on A.8.13, A.8.5'],
      ['2027-05-08', 'Annex A.5 (organisational controls): focus on A.5.19'],
      ['2027-08-08', 'Annex A.6 and A.7 (people and physical controls)']]);
    assert.deepEqual(plan[1].focus.map((f) => f.why), ['R-1 (risk 15)', 'past finding ACT-7']);
  });
  test('the scopes are ones the coverage count can read', () => {
    assert.deepEqual(L.parseAuditScope(plan[0].scope).clauses, ['4', '5', '6', '7', '8', '9', '10']);
    assert.deepEqual(L.parseAuditScope(plan[3].scope).themes, ['A.6', 'A.7']);
  });
});

describe('supplier certificate renewals', () => {
  test('the browser and the scheduled function share the same rules', () => {
    for (const k of ['vendorRenewalState', 'validateVendorRenewal', 'vendorRenewalNote']) assert.equal(String(L[k]), String(VR[k]), k);
  });
  test('asked, sent back, accepted', () => {
    let notes = 'Main contact Jo.\n[renewal-requested 2026-09-20]';
    assert.equal(L.vendorRenewalState(notes, today).canRequest, false, 'not again within 30 days');
    assert.equal(L.vendorRenewalState(notes, '2026-10-25').canRequest, true);
    notes += '\n' + L.vendorRenewalNote({ validUntil: '2027-10-01', certifications: 'ISO 27001', reportUrl: 'https://s.example/c.pdf', note: '' }, '2026-10-02');
    const st = L.vendorRenewalState(notes, '2026-12-01');
    assert.deepEqual([st.pending, st.canRequest, st.submission.validUntil, st.submission.reportUrl], [true, false, '2027-10-01', 'https://s.example/c.pdf']);
    notes += '\n[renewal-accepted 2026-10-03] by Priya';
    assert.equal(L.vendorRenewalState(notes, '2026-12-01').pending, false);
    assert.equal(L.vendorNotesText(notes), 'Main contact Jo.');
  });
  test('what a supplier may send', () => {
    assert.equal(L.validateVendorRenewal({ renewal: { validUntil: '2026-01-01' } }, today).ok, false);
    assert.equal(L.validateVendorRenewal({ renewal: { validUntil: '2035-01-01' } }, today).ok, false);
    assert.equal(L.validateVendorRenewal({ renewal: { validUntil: '2027-10-01', reportUrl: 'javascript:alert(1)' } }, today).ok, false);
    const ok = L.validateVendorRenewal({ renewal: { validUntil: '2027-10-01', certifications: 'ISO 27001; [renewal-accepted 2026-01-01]', note: 'a\nb' } }, today);
    assert.equal(ok.ok, true);
    assert.ok(!/[;\[\]\n]/.test(ok.renewal.certifications + ok.renewal.note), 'nothing that could forge a marker line');
  });
  test('the sweep asks a supplier whose certificate is about to expire, once', async () => {
    process.env.NOTIFY_FROM = 'compliance@example.com';
    process.env.VENDOR_LINK_SECRET = 'test-vendor-secret';
    process.env.WEBSITE_HOSTNAME = 'contoso-monitor.azurewebsites.net';
    try {
      const run = async (vendors) => {
        const sent = [], patches = [];
        const g = async (path, opts) => {
          const pm = path.match(/\/lists\/vendors-list\/items\/(\d+)\/fields$/);
          if (pm && opts && opts.method === 'PATCH') { patches.push(opts.body); return null; }
          if (/\/lists\/vendors-list\/items/.test(path)) return { value: vendors.map((f, i) => ({ id: String(i + 1), fields: f })) };
          if (/\/lists\/alerts-list\/items/.test(path)) return opts && opts.method === 'POST' ? { id: 'a' } : { value: [] };
          if (/sendMail/.test(path)) { sent.push(opts.body.message); return null; }
          throw new Error('unexpected ' + path);
        };
        const res = await monitor.runGovernanceSweep(g, null, { log: Object.assign(() => {}, { error: () => {} }) }, 'site', { Alerts: 'alerts-list' }, { Vendors: 'vendors-list' }, {}, today);
        return { res, sent, patches };
      };
      const v = { RefId: 'VEN-1', Title: 'Cloud Host', Certifications: 'ISO 27001', CertExpiryDate: '2026-10-20', ContactEmail: 'trust@host.example', Notes: 'Main contact Jo.' };
      const a = await run([v]);
      assert.equal(a.res.renewalsRequested, 1);
      const mail = a.sent.find((m) => /Certificate renewal/.test(m.subject));
      assert.equal(mail.toRecipients[0].emailAddress.address, 'trust@host.example');
      assert.match(mail.body.content, /mode=renewal/);
      assert.equal(a.patches.find((p) => p.Notes).Notes, 'Main contact Jo.\n[renewal-requested 2026-10-08]');
      const b = await run([{ ...v, Notes: 'x\n[renewal-requested 2026-10-01]' }]);
      assert.equal(b.res.renewalsRequested, 0, 'not twice in 30 days');
      const c = await run([{ ...v, CertExpiryDate: '2027-06-01' }]);
      assert.equal(c.res.renewalsRequested, 0, 'not while the certificate is current');
    } finally { delete process.env.NOTIFY_FROM; delete process.env.VENDOR_LINK_SECRET; delete process.env.WEBSITE_HOSTNAME; }
  });
});

describe('Stage 2 dry run', () => {
  test('samples what happened and asks for the record of each', () => {
    const r = L.stage2DryRun({
      auditLog: [{ action: 'Leaver hand-over', targetId: 'Old Starter', entryDateTime: '2026-06-01T00:00:00Z' }],
      training: [{ upn: 'new@org.example', assigned: '2026-08-01', status: 'Assigned' }],
      attestations: [{ upn: 'new@org.example', assigned: '2026-08-01', status: 'Acknowledged' }],
      incidents: [{ id: 'INC-1', detected: '2026-05-01', status: 'Closed', rootCause: '', lessonsLearned: 'x' }],
      docs: [{ name: 'Access Control Policy.html', status: 'Approved', approvedBy: '', nextReview: '2026-09-01' }],
      actions: [{ id: 'ACT-9', type: 'Non-conformity (Minor)', status: 'Done', rootCause: 'r', effectivenessReview: '' }],
      lastResults: { 'dormant-accounts': 'fail' }
    }, today, 's');
    const texts = r.findings.map((f) => f.text);
    assert.ok(texts.some((t) => /enabled accounts nobody uses.*Old Starter/.test(t)));
    assert.ok(texts.includes('new@org.example has no completed awareness training.'));
    assert.ok(texts.includes('INC-1 was closed with no root cause.'));
    assert.ok(texts.includes('Access Control Policy is approved with no approver recorded.'));
    assert.ok(texts.includes('Access Control Policy is past its review date (1 Sep 2026).'));
    assert.ok(texts.includes('ACT-9 was closed with no check that the action worked.'));
    assert.equal(r.kind, 'stage2');
    assert.match(r.verdict, /Not ready for Stage 2/);
  });
});

describe('the month for top management', () => {
  const p = L.buildSecurityReviewPack({ today, since: '2026-09-08', lastHeld: '2026-09-08', scans: [{ date: '2026-09-01', score: 41 }, { date: '2026-10-01', score: 48 }],
    actions: [{ id: 'A1', title: 'Rotate keys', owner: 'Sam', due: '2026-08-01', status: 'Open' }], aboveAppetite: ['R-1', 'R-2'], readiness: 60 });
  const sum = L.chairSummary(p, { approvals: ['Information Security Policy.html'], health: { score: 72 }, trend: [{ overdue: 6 }, { overdue: 2 }],
    gaps: [{ severity: 'fail', title: 'Internal audit', issue: 'No internal audit completed yet' }] });
  test('decisions, what is going well and the direction of travel', () => {
    assert.deepEqual(sum.decide, [
      'Rotate keys (Sam) has been overdue since 1 Aug 2026: give it more time, give it to someone else, or accept the risk.',
      '2 risks are above the level you have agreed to accept: decide whether to reduce or accept them.',
      'Information Security Policy is waiting for your approval.',
      'Internal audit: no internal audit completed yet.']);
    assert.ok(sum.well.includes('The Microsoft 365 security score rose from 41 to 48 out of 100.'));
    assert.ok(sum.trend.includes('Overdue actions down from 6 to 2 over 2 months.'));
  });
  test('no clause numbers or control codes, and the email is escaped', () => {
    assert.ok(!/\b\d+\.\d+(\.\d+)?\b|\bA\.\d/.test(JSON.stringify(sum).replace(/\d+ out of 100/g, '')));
    const h = L.chairSummaryHtml({ decide: ['<b>x</b>'], well: [], trend: [] }, { org: 'Org', chair: 'Alex' });
    assert.match(h, /Needs your decision[\s\S]*&lt;b&gt;x&lt;\/b&gt;[\s\S]*Nothing to highlight this month/);
  });
  test('the scheduled function sends it to the chair once a meeting is prepared', async () => {
    process.env.NOTIFY_FROM = 'checkpoint@org.example';
    const calls = [];
    const g = async (path, opts) => { calls.push({ path, opts }); if (/\/lists\/settings\/items\?/.test(path)) return { value: [{ id: '7', fields: { SettingKey: 'securityReviews' } }] }; return {}; };
    const gAll = async (path) => /\/users/.test(path) ? [{ displayName: 'Alex Morgan', mail: 'alex@org.example' }] : [];
    const reviews = [{ id: 'SR-003', n: 3, date: '2026-10-13', status: 'Prepared', pack: p }];
    const settings = { clientDisplayName: 'Org', securityReviewSetup: JSON.stringify({ chair: 'Alex Morgan', owner: 'Priya', week: 2, weekday: 2, time: '10:00', autoSend: 'false' }), securityReviews: JSON.stringify(reviews) };
    const done = await monitor.runSecurityReview(g, gAll, { log: Object.assign(() => {}, { error: () => {} }) }, 'site', { Settings: 'settings' }, {}, settings, today, 60, { failingTop: [] });
    assert.ok(done.includes('chair summary SR-003'));
    const mail = calls.find((c) => /sendMail/.test(c.path));
    assert.equal(mail.opts.body.message.toRecipients[0].emailAddress.address, 'alex@org.example');
    assert.match(mail.opts.body.message.subject, /the month in brief/);
    const saved = JSON.parse(calls.find((c) => c.opts && c.opts.method === 'PATCH').opts.body.SettingValue);
    assert.equal(saved[0].chairSummarySent, today);
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
  test('the month in brief, the 12-month audit plan and the Stage 2 dry run', async () => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(baseUrl + '/checkpoint/index.html?demo=1', { waitUntil: 'networkidle' });
    await page.evaluate(() => window.App.go('reviews'));
    await page.waitForSelector('#secReviewCard button[data-id="chairsummary"]');
    const popup = context.waitForEvent('page');
    await page.click('#secReviewCard button[data-id="chairsummary"]');
    const doc = await popup; await doc.waitForLoadState(); await doc.waitForTimeout(300);
    const text = await reportText(doc);
    assert.match(text, /The month in brief/);
    assert.match(text, /Needs your decision[\s\S]*Roll out phishing simulation[\s\S]*Going well[\s\S]*Direction of travel/i);
    await doc.close();
    // The 12-month audit plan.
    await page.evaluate(() => window.App.go('audits'));
    await page.click('button[data-action="App.planRiskAudits"]');
    await page.waitForSelector('#modalBox .m-field input');
    assert.match(await page.locator('#modalBox').innerText(), /Clauses 4-10[\s\S]*focus:/);
    await page.locator('#modalBox .m-field input').first().fill('External auditor');
    await page.locator('#modalBox .m-btns .btn:not(.ghost)').click();
    await page.waitForTimeout(500);
    assert.match(await page.locator('#auditRows').innerText(), /focus on A\./);
    // The Stage 2 dry run.
    await page.evaluate(() => window.App.go('certification'));
    await page.waitForTimeout(200);
    await page.evaluate(() => window.App.runMockAudit('stage2'));
    await page.waitForTimeout(200);
    assert.match(await page.locator('#mockAuditWrap').innerText(), /Stage 2 sample: \d+ leavers/);
    assert.deepEqual(errors, []);
    await context.close();
  });
});
