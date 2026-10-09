// The Enterprise policy layout (default from 1.146.0): a cover, a
// document control page with history and approval, a numbered contents
// list, numbered sections and clauses, and print margin boxes with
// "Page X of Y". The other three layouts render as before: the new
// front matter is in their markup but hidden.
import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

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
    // Expose the document builder to the test page only.
    if (filePath.endsWith('/checkpoint/app.js')) body = Buffer.from(String(body).replace('  function buildTemplateHtml(t, opts) {', '  window.__bt = function () { return buildTemplateHtml.apply(null, arguments); }; window.__epc = function () { return effectivePolicyContent.apply(null, arguments); }; window.__layout = function () { return policyTemplateLayout(); };\n  function buildTemplateHtml(t, opts) {'));
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
  test('enterprise is the default, with front matter, numbering and page numbers', async () => {
    const page = await browser.newPage();
    await page.goto(baseUrl + '/checkpoint/index.html?demo=1', { waitUntil: 'networkidle' });
    assert.equal(await page.evaluate(() => window.__layout()), 'enterprise');
    const build = (layout, approved) => page.evaluate(({ layout, approved }) => {
      const t = window.POLICY_TEMPLATES.find((x) => x.id === 'infosec-policy');
      return window.__bt(window.__epc(t, t.title + '.html'), { clientLabel: 'Acme "Group"', owner: 'Cem', reviewDate: '2027-10-09', approved, generatedDate: '9 October 2026', version: approved ? '1.0' : '', approvedBy: approved ? 'Ekin' : '', classification: 'Internal', layout });
    }, { layout, approved });
    const html = await build('enterprise', true);
    assert.match(html, /@bottom-center\{content:"Page " counter\(page\) " of " counter\(pages\)/);
    assert.match(html, /@bottom-left\{content:"Acme \\"Group\\""/, 'strings in CSS are escaped');
    const hostile = await page.evaluate(() => {
      const t = window.POLICY_TEMPLATES.find((x) => x.id === 'infosec-policy');
      return window.__bt(window.__epc(t, t.title + '.html'), { clientLabel: 'Evil</style><script>alert(1)</script>', owner: 'Cem', reviewDate: '2027-10-09', approved: true, generatedDate: '9 October 2026', version: '1.0', approvedBy: 'Ekin', classification: 'Internal', layout: 'enterprise' });
    });
    const styles = hostile.match(/<style[^>]*>[\s\S]*?<\/style>/g).join('');
    assert.doesNotMatch(styles, /<script/, 'a client name cannot close the style element');
    assert.match(styles, /Evil\\3c \/style>/);
    const doc = await browser.newPage();
    await doc.setContent(html);
    const r = await doc.evaluate(() => {
      const vis = (sel) => { const el = document.querySelector(sel); return !!el && getComputedStyle(el).display !== 'none'; };
      const h2 = [...document.querySelectorAll('h2')];
      const toc = [...document.querySelectorAll('.toc li')].map((li) => li.textContent.trim());
      const firstStmt = document.querySelector('.stmt-n');
      return { cover: vis('.cover'), toc: vis('.toc'), front: vis('.front-x'), mast: vis('.mast'), h2: h2.length, tocCount: toc.length, firstToc: toc[0],
        coverText: document.querySelector('.cover').innerText, history: document.querySelector('.front-x').innerText,
        stmtLabel: getComputedStyle(firstStmt, '::before').content, ids: h2.every((h, i) => h.id === 's' + (i + 1)) };
    });
    assert.ok(r.cover && r.toc && r.front && !r.mast);
    assert.equal(r.tocCount, r.h2, 'one contents entry per section');
    assert.ok(r.ids);
    assert.match(r.firstToc, /^1\s*A message from leadership/);
    assert.match(r.coverText, /Information Security Policy[\s\S]*Version\s*1\.0[\s\S]*Approved by\s*Ekin/i);
    assert.match(r.history, /Document history[\s\S]*1\.0[\s\S]*Approved for use[\s\S]*Approval[\s\S]*Document owner[\s\S]*Cem/i);
    assert.match(r.stmtLabel, /counter\(sec\)/);
    const draft = await build('enterprise', false);
    assert.match(draft, /DRAFT — NOT APPROVED/);
    assert.match(draft, /Pending approval/);
    for (const layout of ['standard', 'formal', 'minimal']) {
      await doc.setContent(await build(layout, true));
      const hidden = await doc.evaluate(() => ['.cover', '.toc', '.front-x'].every((s) => getComputedStyle(document.querySelector(s)).display === 'none') && getComputedStyle(document.querySelector('.mast')).display !== 'none');
      assert.ok(hidden, layout + ' renders as before');
    }
    await page.close(); await doc.close();
  });
});
