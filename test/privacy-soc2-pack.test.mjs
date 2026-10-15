// ISO 27701 privacy registers (records of processing with consent,
// transfers, retention and a PIA; requests from individuals) and the
// SOC 2 report pack (period evidence, subservice organisations, CUECs,
// system description, bridge letter).
import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const L = require('../public/checkpoint/lib.js');
const TODAY = '2026-10-15';
const base = { role: 'Controller', purpose: 'Pay staff', lawfulBasis: 'Legal obligation', individuals: 'Staff', dataCategories: 'Bank details', retention: '7 years', owner: 'K', lastReviewed: '2026-09-01' };

describe('records of processing', () => {
  test('a complete controller record evidences purpose, basis, records and retention, with nothing missing', () => {
    const r = L.ropaReview(base, [], TODAY);
    assert.deepEqual(r.gaps, []);
    assert.deepEqual(r.controls, ['A.1.2.2', 'A.1.2.3', 'A.1.2.9', 'A.1.4.8']);
  });
  test('consent as the basis needs how it is obtained, recorded and withdrawn', () => {
    const r = L.ropaReview({ ...base, lawfulBasis: 'Consent', consent: { how: 'form', where: 'CRM' } }, [], TODAY);
    assert.ok(r.controls.includes('A.1.2.4') && r.controls.includes('A.1.2.5'));
    assert.ok(r.gaps.some((g) => /withdraw/.test(g)));
  });
  test('an overseas transfer needs a recorded basis, and expects a PIA', () => {
    const r = L.ropaReview({ ...base, transfers: 'United States' }, [], TODAY);
    assert.ok(r.gaps.some((g) => /basis for the transfer/.test(g)));
    assert.equal(r.pia.status, 'Needed');
  });
  test('a supplier recipient without a DPA in the supplier register is a gap', () => {
    const r = L.ropaReview({ ...base, recipients: ['VEN-1'] }, [{ id: 'VEN-1', dpa: false }], TODAY);
    assert.ok(r.gaps.some((g) => /data processing agreement/.test(g)));
    assert.ok(!r.controls.includes('A.1.2.7'));
    assert.ok(L.ropaReview({ ...base, recipients: ['VEN-1'] }, [{ id: 'VEN-1', dpa: true }], TODAY).controls.includes('A.1.2.7'));
  });
  test('a processor record evidences the A.2 table instead', () => {
    const r = L.ropaReview({ ...base, role: 'Processor' }, [], TODAY);
    assert.ok(r.controls.includes('A.2.2.7') && !r.controls.includes('A.1.2.9'));
  });
  test('not reviewed in twelve months is a gap', () => {
    assert.ok(L.ropaReview({ ...base, lastReviewed: '2025-01-01' }, [], TODAY).gaps.some((g) => /12 months/.test(g)));
  });
});

describe('privacy impact assessment', () => {
  const pia = { entries: [{ area: 'security', risk: 'Seen by the wrong staff', L: 3, I: 4, mitigation: 'Role-based access', rL: 2, rI: 2 }], decision: 'Proceed', decisionBy: 'K', nextDue: '2027-10-01' };
  test('sensitive information expects a PIA', () => {
    assert.deepEqual(L.piaReasons({ sensitive: true }), ['Sensitive information']);
    assert.equal(L.piaSummary({ ...base, sensitive: true }, TODAY).status, 'Needed');
    assert.equal(L.piaSummary(base, TODAY).status, 'Not needed');
  });
  test('rated, mitigated, re-rated and decided: Completed, and A.1.2.6 is evidenced', () => {
    assert.equal(L.piaSummary({ ...base, sensitive: true, pia }, TODAY).status, 'Completed');
    assert.ok(L.ropaReview({ ...base, sensitive: true, pia }, [], TODAY).controls.includes('A.1.2.6'));
  });
  test('no decision holds it open', () => {
    assert.equal(L.piaSummary({ ...base, pia: { ...pia, decisionBy: '' } }, TODAY).status, 'In progress');
  });
});

describe('requests from individuals', () => {
  const reqs = [
    { id: 'P1', type: 'Access', received: '2026-09-01', due: '2026-10-01', status: 'Completed', closed: '2026-09-20', identityVerified: true },
    { id: 'P2', type: 'Correction', received: '2026-09-05', due: '2026-10-05', status: 'In progress', identityVerified: false },
    { id: 'P3', type: 'Complaint', received: '2026-10-10', due: '2026-11-09', status: 'Open' }
  ];
  test('overdue, open, average time to close, and unverified identity (complaints excepted)', () => {
    const s = L.privacyRequestSummary(reqs, TODAY);
    assert.equal(s.open, 2);
    assert.equal(s.overdue, 1);
    assert.deepEqual(s.overdueIds, ['P2']);
    assert.equal(s.avgDays, 19);
    assert.equal(s.unverified, 1);
  });
  test('default response period is 30 days', () => assert.equal(L.PRIVACY_REQUEST_DAYS, 30));
});

describe('SOC 2 report pack', () => {
  test('evidence by month counts scan readings from full and partial maps, and verification dates', () => {
    const c = L.soc2PeriodCoverage([{ id: 'CC6.1', app: true }, { id: 'CC1.1', app: true, verified: '2026-09-03' }, { id: 'CC2.1', app: true }],
      [{ date: '2026-08-10', results: { 'mfa-all': 'pass' } }], { full: {}, partial: { 'mfa-all': ['CC6.1'] } }, '2026-08-01', TODAY);
    assert.deepEqual(c.months.map((m) => m.month), ['2026-08', '2026-09', '2026-10']);
    assert.equal(c.months[0].covered, 1);
    assert.equal(c.months[1].covered, 1);
    assert.deepEqual(c.never, ['CC2.1']);
  });
  test('a manual scan reading is not evidence', () => {
    const c = L.soc2PeriodCoverage([{ id: 'CC6.1', app: true }], [{ date: '2026-08-10', results: { 'mfa-all': 'manual' } }], { partial: { 'mfa-all': ['CC6.1'] } }, '2026-08-01', TODAY);
    assert.deepEqual(c.never, ['CC6.1']);
  });
  test('a carved-out subservice organisation needs CSOCs and an assurance report', () => {
    const r = L.soc2SubserviceReview([{ id: 'V1', name: 'Host', subservice: 'Carved out', certifications: '' }, { id: 'V2', name: 'Other' }], TODAY);
    assert.equal(r.length, 1);
    assert.equal(r[0].gaps.length, 2);
    assert.equal(L.soc2SubserviceReview([{ id: 'V1', name: 'Host', subservice: 'Carved out', csocs: 'Physical security', certifications: 'SOC 2 Type II' }], TODAY)[0].gaps.length, 0);
  });
  test('pack status lists the four deliverables', () => {
    const s = L.soc2PackStatus({ services: 'x', commitments: 'y', cuecs: ['a'], subservice: [], coverage: null });
    assert.deepEqual(s.map((x) => x.key), ['description', 'subservice', 'cuecs', 'period']);
    assert.equal(s[0].ok, true);
    assert.equal(s[1].ok, false);
  });
  test('typical CUECs are there to start from', () => assert.ok(L.SOC2_CUEC_STARTERS.length >= 5));
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
  test('privacy registers: list, open a record, complete its PIA, log a request', async () => {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(baseUrl + '/checkpoint/index.html?demo=1', { waitUntil: 'networkidle' });
    await page.evaluate(() => window.App.go('privacy'));
    assert.equal(await page.locator('#ropaRows tr').count(), 3);
    await page.evaluate(() => window.App.openRopa('PA-003'));
    assert.match(await page.locator('#drawer').innerText(), /no way to withdraw/i);
    await page.click('#drawer [data-action="App.openPia"]');
    await page.fill('#pia_risk_0', 'Collected without people knowing it is sent overseas');
    await page.selectOption('#pia_L_0', '2'); await page.selectOption('#pia_I_0', '2');
    await page.selectOption('#piaDecision', 'Proceed');
    await page.fill('#piaDecisionBy', 'M. Chen');
    await page.click('#drawer [data-action="App.savePia"]');
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('checkpoint-demo-v8')).ropa.find((r) => r.id === 'PA-003'));
    assert.equal(saved.pia.entries.length, 1, 'empty rows are dropped');
    assert.equal(saved.pia.decision, 'Proceed');
    await page.evaluate(() => window.App.addPrivacyRequest());
    await page.locator('#modalBox input').first().fill('CASE-77');
    await page.click('#modalBox .btn:not(.ghost)');
    await page.waitForTimeout(200);
    const reqs = await page.evaluate(() => JSON.parse(localStorage.getItem('checkpoint-demo-v8')).privacyRequests);
    const added = reqs.find((r) => r.ref === 'CASE-77');
    assert.ok(added && added.due, 'a due date is set by default');
    assert.deepEqual(errors, []);
    await page.close();
  });
  test('SOC 2 pack shows on the SOC 2 tab only, with the carved-out supplier', async () => {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(baseUrl + '/checkpoint/index.html?demo=1', { waitUntil: 'networkidle' });
    await page.evaluate(() => { window.App.go('soa'); window.App.setSoaFw('iso27001'); });
    assert.equal((await page.locator('#soaSoc2Pack').innerText()).trim(), '');
    await page.evaluate(() => window.App.setSoaFw('soc2'));
    const txt = await page.locator('#soaSoc2Pack').innerText();
    assert.match(txt, /SOC 2 report pack/i);
    assert.match(txt, /Northwind Cloud Hosting/);
    assert.match(txt, /Evidence by month/i);
    assert.deepEqual(errors, []);
    await page.close();
  });
});
