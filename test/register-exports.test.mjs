// Registers as Excel workbooks and controlled Word documents (1.148.0).
import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const L = require('../public/checkpoint/lib.js');

function parts(bytes) {
  const u16 = (o) => bytes[o] | (bytes[o + 1] << 8);
  const u32 = (o) => (bytes[o] | (bytes[o + 1] << 8) | (bytes[o + 2] << 16) | (bytes[o + 3] << 24)) >>> 0;
  const out = {}; let o = 0;
  while (o < bytes.length && u32(o) === 0x04034b50) {
    const size = u32(o + 18), nl = u16(o + 26), xl = u16(o + 28), ds = o + 30 + nl + xl;
    out[new TextDecoder().decode(bytes.slice(o + 30, o + 30 + nl))] = new TextDecoder().decode(bytes.slice(ds, ds + size));
    o = ds + size;
  }
  return out;
}

describe('buildXlsx()', () => {
  const p = parts(L.buildXlsx([
    { name: 'Risks', header: ['ID', 'Risk', 'Score'], rows: [['R-001', 'Supplier <breach> & "x"', 12], ['R-002', '=HYPERLINK("http://evil")', 4.5]] },
    { name: 'Statement of Applicability: ISO/IEC 27001 [2022] with a very long name', header: ['Control'], rows: [['A.5.1']] },
    { name: 'Risks', header: ['ID'], rows: [] },
  ], { title: 'T' }));
  test('a workbook with one sheet per register, styles and content types', () => {
    for (const n of ['[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml', 'xl/_rels/workbook.xml.rels', 'xl/styles.xml', 'xl/worksheets/sheet1.xml', 'xl/worksheets/sheet2.xml', 'xl/worksheets/sheet3.xml', 'docProps/core.xml']) assert.ok(p[n], n);
    assert.equal((p['[Content_Types].xml'].match(/worksheet\+xml/g) || []).length, 3);
  });
  test('sheet names are valid and unique (31 characters, no []:*?/\\)', () => {
    const names = [...p['xl/workbook.xml'].matchAll(/<sheet name="([^"]*)"/g)].map((m) => m[1]);
    assert.equal(names[0], 'Risks');
    assert.ok(names[1].length <= 31 && !/[\[\]:*?\/\\]/.test(names[1]), names[1]);
    assert.equal(names[2], 'Risks (2)');
  });
  test('header is frozen and filtered; text is escaped and never a formula; numbers stay numbers', () => {
    const s = p['xl/worksheets/sheet1.xml'];
    assert.match(s, /<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"\/>/);
    assert.match(s, /<autoFilter ref="A1:C3"\/>/);
    assert.match(s, /Supplier &lt;breach&gt; &amp; &quot;x&quot;/);
    assert.doesNotMatch(s, /<f>/, 'no formula cells');
    assert.match(s, /t="inlineStr"><is><t xml:space="preserve">=HYPERLINK/);
    assert.match(s, /<c r="C2" s="2"><v>12<\/v><\/c>/);
    assert.match(p['xl/workbook.xml'], /_xlnm\._FilterDatabase/);
  });
});

describe('buildRegisterDocx()', () => {
  const rows = Array.from({ length: 30 }, (_, i) => ['A.5.' + (i + 1), 'Title ' + i + ' & <x>', 'Yes', 'Implemented', 'Because\nreason']);
  const p = parts(L.buildRegisterDocx({ title: 'Statement of Applicability', subtitle: 'ISO 27001', clientLabel: 'MineGuard', classification: 'Internal', date: '10 October 2026', preparedBy: 'Matt', summary: [['Applicable', '30 of 30']] },
    [{ h: 'Control', w: 1 }, { h: 'Title', w: 3 }, { h: 'Applies', w: 1 }, { h: 'Status', w: 1 }, { h: 'Justification', w: 3 }], rows));
  const doc = p['word/document.xml'];
  test('landscape A4 with a footer that numbers pages', () => {
    assert.match(doc, /<w:pgSz w:w="16838" w:h="11906" w:orient="landscape"\/>/);
    assert.match(doc, /<w:footerReference w:type="default" r:id="rId2"\/>/);
    assert.match(p['word/footer1.xml'], /NUMPAGES/);
    assert.match(p['word/footer1.xml'], /INTERNAL · MineGuard[\s\S]*Statement of Applicability · as at 10 October 2026/);
  });
  test('the header row repeats on every page and rows do not split', () => {
    assert.equal((doc.match(/<w:tblHeader\/>/g) || []).length, 1);
    assert.equal((doc.match(/<w:cantSplit\/>/g) || []).length, 31);
  });
  test('document control, every row, escaped text and line breaks as paragraphs', () => {
    assert.match(doc, /Prepared by[\s\S]*Matt[\s\S]*Entries[\s\S]*>30</);
    assert.match(doc, /Applicable[\s\S]*30 of 30/);
    assert.match(doc, /Title 29 &amp; &lt;x&gt;/);
    assert.match(doc, />Because<\/w:t><\/w:r><\/w:p><w:p>[\s\S]{0,120}>reason</);
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
  async function download(page, fn) {
    const [d] = await Promise.all([page.waitForEvent('download'), page.evaluate(fn)]);
    const chunks = []; for await (const c of await d.createReadStream()) chunks.push(c);
    return { name: d.suggestedFilename(), bytes: new Uint8Array(Buffer.concat(chunks)) };
  }
  test('the SoA, risk register and asset register download as Word and Excel', async () => {
    const page = await browser.newPage({ acceptDownloads: true });
    await page.goto(baseUrl + '/checkpoint/index.html?demo=1', { waitUntil: 'networkidle' });
    const soa = await download(page, () => App.exportRegisterWord('controls'));
    assert.match(soa.name, /^Statement of Applicability - .+\.docx$/);
    const sd = parts(soa.bytes)['word/document.xml'];
    assert.match(sd, /A\.5\.1/);
    assert.match(sd, /Meridian/);
    const risks = await download(page, () => App.exportRegisterWord('risks'));
    assert.equal(risks.name, 'Risk register.docx');
    assert.match(parts(risks.bytes)['word/document.xml'], /R-001/);
    const assets = await download(page, () => App.exportRegisterWord('assets'));
    assert.equal(assets.name, 'Asset register.docx');
    const xl = await download(page, () => App.exportXlsx('risks'));
    assert.equal(xl.name, 'risks.xlsx');
    assert.match(parts(xl.bytes)['xl/worksheets/sheet1.xml'], /R-001/);
    const all = await download(page, () => App.exportAllXlsx());
    assert.match(all.name, /^checkpoint-registers-\d{4}-\d{2}-\d{2}\.xlsx$/);
    assert.ok(Object.keys(parts(all.bytes)).filter((n) => /^xl\/worksheets\//.test(n)).length >= 15);
    const S = await page.evaluate(() => { const k = Object.keys(localStorage).find((x) => (localStorage.getItem(x) || '').indexOf('auditLog') !== -1); return JSON.parse(localStorage.getItem(k)); });
    assert.ok(S.auditLog.some((e) => e.action === 'Register exported (Word)' && e.targetId === 'controls'));
    assert.ok(S.auditLog.some((e) => e.action === 'Register exported (Excel)' && e.targetId === 'all'));
    await page.close();
  });
});
