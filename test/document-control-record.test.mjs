// Document control from Checkpoint's own record (1.147.0): the history
// table lists each draft, revision and approval from the audit log, the
// approval date is the date approval was given (not the export date),
// and the signature cell says how the approval was made.
import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const L = require('../public/checkpoint/lib.js');

const DOC = 'Information Security Policy.html';
const at = (d) => d + 'T02:00:00Z';
const LOG = [
  { targetType: 'Document', targetId: DOC, action: 'Policy template generated', actor: 'Cem Caglar', entryDateTime: at('2026-09-01') },
  { targetType: 'Document', targetId: DOC, action: 'Policy content edited', actor: 'Cem Caglar', entryDateTime: at('2026-09-02') },
  { targetType: 'Document', targetId: DOC, action: 'Policy content edited', actor: 'Matt Nicholas', entryDateTime: at('2026-09-03') },
  { targetType: 'Document', targetId: DOC, action: 'Policy document approved', actor: 'Ekin Yilmaz', after: 'Approved v1.0 by Ekin Yilmaz · next review 2027-09-04', entryDateTime: at('2026-09-04') },
  { targetType: 'Document', targetId: 'Other.html', action: 'Policy document approved', actor: 'X', after: 'Approved v9.0 by X · next review 2027-01-01', entryDateTime: at('2026-09-05') },
  { targetType: 'Document', targetId: DOC, action: 'Policy content edited', actor: 'Cem Caglar', entryDateTime: at('2026-09-20') },
  { targetType: 'Document', targetId: DOC, action: 'Policy document approved', actor: 'Cem Caglar', after: 'Approved v1.1 by E. Yilmaz (CEO) · next review 2027-09-21 · segregation noted', entryDateTime: at('2026-09-21') },
];

describe('documentHistory()', () => {
  test('lists generation, collapsed revisions and approvals in order, for this document only', () => {
    const rows = L.documentHistory(LOG, DOC);
    assert.deepEqual(rows.map((r) => [r.version, r.date, r.description, r.by]), [
      ['0.1', '2026-09-01', 'Draft generated', 'Cem Caglar'],
      ['Draft', '2026-09-03', 'Content revised (2 changes)', 'Cem Caglar, Matt Nicholas'],
      ['1.0', '2026-09-04', 'Approved for use', 'Ekin Yilmaz'],
      ['Draft', '2026-09-20', 'Content revised', 'Cem Caglar'],
      ['1.1', '2026-09-21', 'Reviewed and re-approved', 'E. Yilmaz (CEO)'],
    ]);
  });
  test('an approval being saved now is appended as the last row', () => {
    const rows = L.documentHistory(LOG, DOC, { version: '1.2', date: '2026-10-10', by: 'Ekin Yilmaz' });
    assert.deepEqual(rows[rows.length - 1], { version: '1.2', date: '2026-10-10', description: 'Reviewed and re-approved', by: 'Ekin Yilmaz' });
  });
  test('keeps the most recent rows when there are many', () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ targetType: 'Document', targetId: DOC, action: 'Policy document approved', actor: 'A', after: 'Approved v1.' + i + ' by A', entryDateTime: new Date(Date.UTC(2026, 0, 1 + i)).toISOString() }));
    const rows = L.documentHistory(many, DOC);
    assert.equal(rows.length, 10);
    assert.equal(rows[9].version, '1.29');
  });
  test('no entries gives no rows (the builder then shows the single current row)', () => {
    assert.deepEqual(L.documentHistory([], DOC), []);
    assert.deepEqual(L.documentHistory(null, DOC), []);
  });
});

describe('approval record and signature', () => {
  test('the latest approval of this document, with who recorded it', () => {
    assert.deepEqual(L.documentApprovalRecord(LOG, DOC), { version: '1.1', approvedBy: 'E. Yilmaz (CEO)', recordedBy: 'Cem Caglar', date: '2026-09-21' });
    assert.equal(L.documentApprovalRecord(LOG, 'Missing.html'), null);
  });
  test('names match on surname and first initial, ignoring titles in brackets', () => {
    assert.ok(L.samePersonName('Ekin Yilmaz', 'E. Yilmaz (CEO)'));
    assert.ok(L.samePersonName('ekin yilmaz', 'Ekin Yilmaz'));
    assert.ok(!L.samePersonName('Ekin Yilmaz', 'Cem Caglar'));
    assert.ok(!L.samePersonName('Ekin Yilmaz', 'Ayse Yilmaz'));
    assert.ok(!L.samePersonName('', 'Ekin'));
  });
  test('approved by the signed-in approver reads as an electronic approval', () => {
    assert.equal(L.approvalSignatureText({ approvedBy: 'E. Yilmaz (CEO)', recordedBy: 'Ekin Yilmaz' }, '4 September 2026'),
      'Approved electronically in Checkpoint by Ekin Yilmaz on 4 September 2026');
  });
  test('entered by someone else reads as a recorded approval naming who recorded it', () => {
    assert.equal(L.approvalSignatureText({ approvedBy: 'E. Yilmaz (CEO)', recordedBy: 'Cem Caglar' }, '21 September 2026'),
      'Approval recorded in Checkpoint by Cem Caglar on 21 September 2026');
    assert.equal(L.approvalSignatureText({ approvedBy: 'E. Yilmaz', recordedBy: '' }, ''), 'Approval recorded in Checkpoint');
    assert.equal(L.approvalSignatureText(null, 'x'), '');
  });
});

describe('Word export', () => {
  const t = { title: 'Information Security Policy', purpose: 'P.', scope: 'S.', policyStatements: ['Rule.'], roles: [{ role: 'Owner', responsibility: 'x' }] };
  const base = { clientLabel: 'MineGuard', owner: 'Cem Caglar', reviewDate: '21 September 2027', approved: true, generatedDate: '10 October 2026', version: '1.1', approvedBy: 'E. Yilmaz (CEO)', classification: 'Internal', layout: 'enterprise' };
  function docXml(opts) {
    const bytes = L.buildPolicyDocx(t, opts);
    // Stored (uncompressed) zip: the document part is readable as text.
    const s = Buffer.from(bytes).toString('utf8');
    return s.slice(s.indexOf('<w:document'), s.indexOf('</w:document>') + 13);
  }
  test('history rows, the approval date given and the signature text all reach the document', () => {
    const xml = docXml(Object.assign({}, base, {
      approvalDateText: '21 September 2026',
      history: [{ version: '0.1', dateText: '1 September 2026', description: 'Draft generated', by: 'Cem Caglar' }, { version: '1.1', dateText: '21 September 2026', description: 'Reviewed and re-approved', by: 'E. Yilmaz (CEO)' }],
      approvalSignature: 'Approval recorded in Checkpoint by Cem Caglar on 21 September 2026',
    }));
    assert.match(xml, /Draft generated/);
    assert.match(xml, /Reviewed and re-approved/);
    assert.match(xml, /Approval recorded in Checkpoint by Cem Caglar on 21 September 2026/);
    const ctl = xml.slice(xml.indexOf('DOCUMENT CONTROL'));
    assert.match(ctl, /Approval date<\/w:t>[\s\S]*?21 September 2026/, 'approval date is the date approval was given');
    assert.doesNotMatch(xml.slice(0, xml.indexOf('CONTENTS')), /10 October 2026/, 'the export date is not presented as the approval date');
  });
  test('the standard layout also shows the approval date given, not the export date', () => {
    const xml = docXml(Object.assign({}, base, { layout: 'standard', approvalDateText: '21 September 2026' }));
    assert.match(xml, /Approval date<\/w:t>[\s\S]{0,400}21 September 2026/);
  });
});

/* The rendered HTML, built through the app's own docControlFor(). */
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
    let body = await readFile(filePath);
    if (filePath.endsWith('/checkpoint/app.js')) body = Buffer.from(String(body).replace('  function buildTemplateHtml(t, opts) {', '  window.__bt = function () { return buildTemplateHtml.apply(null, arguments); }; window.__dcf = function () { return docControlFor.apply(null, arguments); }; window.__S = function () { return S; };\n  function buildTemplateHtml(t, opts) {'));
    res.writeHead(200, { 'Content-Type': MIME[extname(filePath)] || 'application/octet-stream' });
    res.end(body);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  baseUrl = 'http://127.0.0.1:' + server.address().port;
  try { browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined }); }
  catch (e) { skipReason = 'Chromium not found'; }
}
after(async () => { if (browser) await browser.close(); if (server) server.close(); });

describe('in the browser', { skip: skipReason || false }, () => {
  test('an approved policy shows its history, the approval date given and the signature', async () => {
    const page = await browser.newPage();
    await page.goto(baseUrl + '/checkpoint/index.html?demo=1', { waitUntil: 'networkidle' });
    const html = await page.evaluate(({ log, doc }) => {
      window.__S().auditLog = log.concat(window.__S().auditLog || []);
      const t = window.POLICY_TEMPLATES.find((x) => x.id === 'infosec-policy');
      const reg = { name: doc, status: 'Approved', version: '1.1', approvedBy: 'E. Yilmaz (CEO)', approvalDate: '2026-09-21', owner: 'Cem Caglar' };
      return window.__bt(t, Object.assign({ clientLabel: 'MineGuard', owner: 'Cem Caglar', reviewDate: '2027-09-21', approved: true, generatedDate: '10 October 2026', version: '1.1', approvedBy: 'E. Yilmaz (CEO)', classification: 'Internal', layout: 'enterprise' }, window.__dcf(doc, reg)));
    }, { log: LOG, doc: DOC });
    const doc = await browser.newPage();
    await doc.setContent(html);
    const r = await doc.evaluate(() => ({
      history: [...document.querySelectorAll('.front-x table.rec')[0].querySelectorAll('tbody tr')].map((tr) => [...tr.cells].map((c) => c.textContent.trim())),
      approval: [...document.querySelectorAll('.front-x table.rec')[1].querySelectorAll('tbody tr')][1].textContent,
      ctl: document.querySelector('.dctl').textContent,
      cover: document.querySelector('.cover').textContent,
    }));
    assert.equal(r.history.length, 5);
    assert.deepEqual(r.history[0], ['0.1', '1 September 2026', 'Draft generated', 'Cem Caglar']);
    assert.deepEqual(r.history[4], ['1.1', '21 September 2026', 'Reviewed and re-approved', 'E. Yilmaz (CEO)']);
    assert.match(r.approval, /21 September 2026/);
    assert.match(r.approval, /Approval recorded in Checkpoint by Cem Caglar on 21 September 2026/);
    assert.match(r.ctl, /Approval date21 September 2026/);
    assert.match(r.cover, /Effective21 September 2026/);
    assert.doesNotMatch(r.ctl + r.cover, /10 October 2026/);
  });

  test('a register version with no matching audit entry falls back to the register, never another version’s signature', async () => {
    const page = await browser.newPage();
    await page.goto(baseUrl + '/checkpoint/index.html?demo=1', { waitUntil: 'networkidle' });
    const dc = await page.evaluate(({ log, doc }) => {
      window.__S().auditLog = log;
      return window.__dcf(doc, { name: doc, status: 'Approved', version: '2.0', approvedBy: 'Ekin Yilmaz', approvalDate: '2026-10-01' });
    }, { log: LOG, doc: DOC });
    assert.equal(dc.approvalSignature, 'Approval recorded in Checkpoint on 1 October 2026');
    assert.equal(dc.approvalDateText, '1 October 2026');
  });

  test('a draft has history but no approval date or signature', async () => {
    const page = await browser.newPage();
    await page.goto(baseUrl + '/checkpoint/index.html?demo=1', { waitUntil: 'networkidle' });
    const dc = await page.evaluate(({ log, doc }) => {
      window.__S().auditLog = log.slice(0, 3);
      return window.__dcf(doc, { name: doc, status: 'Draft', version: '0.1' });
    }, { log: LOG, doc: DOC });
    assert.equal(dc.history.length, 2);
    assert.equal(dc.approvalSignature, '');
    assert.equal(dc.approvalDate, '');
  });
});
