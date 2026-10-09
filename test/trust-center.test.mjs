// The Trust Center: a public page built only from the client's own
// records. Nothing is claimed that the records do not support.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const L = require('../public/checkpoint/lib.js');
const today = '2026-10-09';
const ctx = (over) => Object.assign({
  controls: [{ id: 'A.8.5', t: 'Secure authentication', app: true, st: 'Implemented' }, { id: 'A.5.17', t: 'Authentication information', app: true, st: 'Implemented' },
    { id: 'A.8.13', t: 'Information backup', app: true, st: 'In progress' }],
  results: { 'mfa-all': 'pass', 'mfa-priv': 'pass' }
}, over || {});
const base = (over) => Object.assign({ today, company: 'MineGuard', contactEmail: 'security@mineguard-ai.com', show: { subprocessors: true, faq: true, pct: true }, ctx: ctx() }, over || {});

describe('trust center model', () => {
  test('a certification is claimed only when a current certificate is recorded', () => {
    const fws = [{ fw: 'iso27001', name: 'ISO 27001', pct: 62, pursued: true }, { fw: 'iso42001', name: 'ISO 42001', pct: 10, pursued: true }];
    const held = L.trustCenterModel(base({ frameworks: fws, certs: { iso27001: { body: 'BSI', number: 'IS 123', issued: '2026-01-10', expires: '2029-01-09' } }, stage1Target: '2027-02-01' }));
    assert.equal(held.frameworks[0].status, 'certified');
    assert.equal(held.frameworks[0].body, 'BSI');
    assert.equal(held.frameworks[1].status, 'progress');
    assert.equal(held.frameworks[1].target, '2027-02-01');
    assert.equal(held.frameworks[1].pct, 10);
    const expired = L.trustCenterModel(base({ frameworks: fws.slice(0, 1), certs: { iso27001: { issued: '2022-01-01', expires: '2025-01-01' } } }));
    assert.equal(expired.frameworks[0].status, 'progress', 'an expired certificate is not claimed');
    const none = L.trustCenterModel(base({ frameworks: fws.slice(0, 1), stage1Target: '2026-01-01' }));
    assert.equal(none.frameworks[0].target, '', 'a target date already passed is not shown');
  });
  test('only evidenced practices are published, grouped by area; gaps are left out', () => {
    const m = L.trustCenterModel(base());
    const idt = m.areas.find((a) => a.key === 'identity');
    assert.ok(idt, 'identity area present');
    const mfa = idt.items.find((x) => x.topic === 'Multi-factor authentication');
    assert.ok(mfa && mfa.checked, 'MFA shown and marked as automatically verified');
    assert.match(mfa.statement, /Multi-factor authentication is required/);
    assert.ok(!m.areas.some((a) => a.items.some((x) => x.topic === 'Backup & restore')), 'backup in progress is not claimed');
    const failing = L.trustCenterModel(base({ ctx: ctx({ results: { 'mfa-all': 'fail' } }) }));
    assert.ok(!failing.areas.some((a) => a.items.some((x) => x.topic === 'Multi-factor authentication')), 'a failing check withdraws the claim');
  });
  test('documents, sub-processors, FAQ and activity', () => {
    const m = L.trustCenterModel(base({
      documents: [{ name: 'Information Security Policy', access: 'request' }, { name: 'ISO certificate', access: 'public', url: 'https://x.example/cert.pdf' }, { name: 'Bad', access: 'public', url: 'javascript:alert(1)' }, { name: 'information security policy' }],
      vendors: [{ name: 'Microsoft', service: 'Cloud', dataCategories: ['Customer PII', 'Public / non-sensitive only'], publicListed: true }, { name: 'Hidden', publicListed: false }],
      answers: [{ question: 'Do you encrypt data?', answer: 'Yes, AES-256.', verdict: 'Yes', approvedDate: '2026-09-01', timesUsed: 3 }, { question: 'Pen test?', answer: 'Planned', verdict: 'Partial', approvedDate: '2026-09-01' }],
      activity: { monitoring: true, internalAudit: '2026-06-01', managementReview: '2024-01-01', pentest: '2027-01-01' }
    }));
    assert.deepEqual(m.documents.map((d) => d.name + ':' + d.access), ['Information Security Policy:request', 'ISO certificate:public', 'Bad:request']);
    assert.equal(m.documents[2].url, '', 'an unsafe link is never published');
    assert.deepEqual(m.subprocessors, [{ name: 'Microsoft', service: 'Cloud', data: 'Customer PII' }]);
    assert.deepEqual(m.faq.map((f) => f.q), ['Do you encrypt data?'], 'only approved answers with a Yes verdict');
    assert.deepEqual(m.activity.map((a) => a.label), ['Security configuration checked automatically', 'Internal audit of the security programme'], 'stale and future dates are left out');
    const off = L.trustCenterModel(base({ show: {}, vendors: [{ name: 'Microsoft', publicListed: true }], answers: [{ question: 'Q', answer: 'A', verdict: 'Yes', approvedDate: '2026-09-01' }] }));
    assert.equal(off.subprocessors.length, 0, 'sub-processors are off unless switched on');
    assert.equal(off.faq.length, 0, 'the FAQ is off unless switched on');
  });
});

describe('trust center page', () => {
  test('self-contained, escaped, with request links to the security contact', () => {
    const m = L.trustCenterModel(base({ company: 'Acme <script>', frameworks: [{ fw: 'iso27001', name: 'ISO 27001', pct: 50, pursued: true }], documents: [{ name: 'SOC 2 report' }], dataLocation: 'Australia' }));
    const html = L.trustCenterHtml(m);
    assert.match(html, /^<!DOCTYPE html>/);
    assert.ok(!/<script/i.test(html), 'no script, and the company name is escaped');
    assert.ok(!/src="http|href="http:\/\/|@import|<link /i.test(html), 'no external requests');
    assert.match(html, /Acme &lt;script&gt; Trust Center/);
    assert.match(html, /Request security documents/);
    assert.match(html, /mailto:security@mineguard-ai\.com\?subject=/);
    assert.match(html, /Certification in progress/);
    assert.match(html, /SOC 2 report[\s\S]*Request/);
    assert.match(html, /Customer information is stored in <b>Australia<\/b>/);
    assert.match(html, /Multi-factor authentication[\s\S]*Verified automatically/);
    assert.match(html, /prefers-color-scheme:dark/);
    assert.match(html, /@media print/);
  });
  test('nothing to show still produces a sensible page', () => {
    const html = L.trustCenterHtml(L.trustCenterModel({ today, company: 'X', show: { certs: false, programme: false, documents: false, activity: false } }));
    assert.match(html, /available on request/);
  });
});

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after } from 'node:test';

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
  test('settings, documents and a preview of the page', async () => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(baseUrl + '/checkpoint/index.html?demo=1', { waitUntil: 'networkidle' });
    await page.evaluate(() => window.App.go('trustcenter'));
    await page.waitForSelector('#tcTogglesRows .fw-admin-row');
    assert.equal(await page.locator('#tcTogglesRows .fw-admin-row').count(), 8);
    assert.match(await page.locator('#tcDocRows').innerText(), /Penetration test summary 2026[\s\S]*on request/);
    await page.click('[data-action="App.previewTrustCenter"]');
    await page.waitForSelector('#tcPreview');
    const html = await page.evaluate(() => document.getElementById('tcPreview').srcdoc);
    assert.match(html, /Meridian Health/);
    assert.match(html, /Request security documents/);
    assert.match(html, /Certification in progress/);
    assert.match(html, /Northwind Cloud Hosting/, 'the vendors switched on are listed as sub-processors');
    assert.match(html, /Penetration test summary 2026/);
    assert.match(html, /Australia/);
    assert.equal(await page.evaluate(() => document.getElementById('tcPreview').getAttribute('sandbox')), '', 'the preview runs sandboxed');
    assert.deepEqual(errors, []);
    await page.close();
  });
});
