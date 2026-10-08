// Excluding Annex A controls: one step with a justification, suggestions
// from the scope answers, a consistency check, and documents that follow.
import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const Lib = require('../public/checkpoint/lib.js');
const app = readFileSync(new URL('../public/checkpoint/app.js', import.meta.url), 'utf8');
const templates = readFileSync(new URL('../public/checkpoint/templates.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../public/checkpoint/index.html', import.meta.url), 'utf8');
const ctl = (id, app = true, extra = {}) => ({ fw: 'iso27001', id, t: id + ' title', app, ...extra });

describe('suggested exclusions', () => {
  const controls = ['A.7.1', 'A.7.2', 'A.7.3', 'A.7.4', 'A.7.6', 'A.7.7', 'A.7.11', 'A.7.12', 'A.8.25', 'A.8.28', 'A.8.30', 'A.8.31'].map((id) => ctl(id));
  test('no premises proposes the seven physical controls, never clear desk', () => {
    const g = Lib.suggestedExclusions({ orgPremises: 'none' }, controls);
    assert.deepEqual(g.map((x) => x.key), ['no-premises']);
    assert.deepEqual(g[0].controls.map((c) => c.id), ['A.7.1', 'A.7.2', 'A.7.3', 'A.7.4', 'A.7.6', 'A.7.11', 'A.7.12']);
    assert.match(g[0].justification, /no premises[\s\S]*A\.5\.19/);
  });
  test('fully remote with premises unanswered still proposes, and says to confirm', () => {
    const g = Lib.suggestedExclusions({ orgWorkModel: 'remote' }, controls);
    assert.match(g[0].why, /Confirm there is no office/);
    assert.deepEqual(Lib.suggestedExclusions({ orgWorkModel: 'remote', orgPremises: 'onsite' }, controls), []);
  });
  test('an office without secure areas proposes A.7.6 only', () => {
    assert.deepEqual(Lib.suggestedExclusions({ orgPremises: 'office' }, controls).map((g) => g.controls.map((c) => c.id)), [['A.7.6']]);
  });
  test('no development proposes the development controls and outsourced development', () => {
    const g = Lib.suggestedExclusions({ orgDevelops: 'no' }, controls);
    assert.deepEqual(g.map((x) => [x.key, x.controls.map((c) => c.id)]), [['no-development', ['A.8.25', 'A.8.28', 'A.8.31']], ['no-outsourced-development', ['A.8.30']]]);
  });
  test('already excluded controls and dismissed groups drop out', () => {
    const some = controls.map((c) => (c.id === 'A.7.1' ? { ...c, app: false } : c));
    assert.ok(!Lib.suggestedExclusions({ orgPremises: 'none' }, some)[0].controls.some((c) => c.id === 'A.7.1'));
    assert.deepEqual(Lib.suggestedExclusions({ orgPremises: 'none' }, controls, ['no-premises']), []);
  });
  test('the suggested justification for one control', () => {
    assert.match(Lib.suggestedJustification(ctl('A.7.2'), { orgPremises: 'none' }), /no premises/);
    assert.equal(Lib.suggestedJustification(ctl('A.7.7'), { orgPremises: 'none' }), '');
  });
});

describe('exclusion check', () => {
  test('unjustified, relied on by a risk, still being implemented, applies to remote working, evidence linked', () => {
    const out = Lib.exclusionConflicts({
      controls: [ctl('A.7.2', false), ctl('A.7.7', false, { just: 'x' }), ctl('A.7.4', false, { just: 'y', evidenceUrl: 'https://e' }), ctl('A.7.1', false, { just: 'z' })],
      risks: [{ id: 'R-1', controls: ['A.7.2'], status: 'Open' }, { id: 'R-2', controls: ['A.7.1'], status: 'Closed' }],
      actions: [{ id: 'ACT-1', control: 'A.7.4', status: 'Open' }, { id: 'ACT-2', control: 'A.7.1', status: 'Done' }],
      profile: { orgWorkModel: 'remote' }
    });
    assert.deepEqual(out.map((x) => [x.id, x.kind, x.severity]), [
      ['A.7.2', 'unjustified', 'Minor'], ['A.7.2', 'risk', 'Minor'],
      ['A.7.7', 'remote', 'Observation'], ['A.7.4', 'action', 'Observation'], ['A.7.4', 'evidence', 'Observation']
    ]);
  });
  test('in an office-based organisation, excluding clear desk is not flagged as remote', () => {
    assert.deepEqual(Lib.exclusionConflicts({ controls: [ctl('A.7.7', false, { just: 'x' })], profile: { orgWorkModel: 'office', orgPremises: 'onsite' } }), []);
  });
  test('the mock audit raises unjustified and relied-on exclusions as minor', () => {
    const m = Lib.mockAudit({ controls: [ctl('A.7.2', false)], risks: [{ id: 'R-1', title: 'x', controls: ['A.7.2'], status: 'Open', L: 1, I: 1 }] }, '2026-10-07', 's');
    const ex = m.findings.filter((f) => f.area === 'Exclusion');
    assert.equal(ex.length, 2);
    assert.ok(ex.every((f) => f.severity === 'Minor'));
  });
});

describe('documents', () => {
  test('the scope document lists exclusions grouped by justification', () => {
    assert.equal(Lib.exclusionsStatement([ctl('A.7.7')]), 'none — every Annex A control is applicable.');
    assert.equal(Lib.exclusionsStatement([ctl('A.7.1', false, { just: 'No premises.' }), ctl('A.7.2', false, { just: 'No premises.' }), ctl('A.8.30', false, { just: 'Not outsourced' })]), 'A.7.1, A.7.2: No premises; A.8.30: Not outsourced.');
    assert.match(Lib.exclusionsStatement([ctl('A.7.2', false)]), /\[To be completed: exclusion justification/);
    assert.match(templates, /\{\{register:exclusions\}\}/);
    assert.match(app, /'\{\{register:exclusions\}\}'/);
  });
  test('a statement is dropped once every control it puts into practice is excluded', () => {
    const st = { whenApplicable: ['A.7.1', 'A.7.2'], rule: 'r' };
    assert.equal(Lib.statementApplies(st, { __excluded: { 'A.7.1': true } }), true);
    assert.equal(Lib.statementApplies(st, { __excluded: { 'A.7.1': true, 'A.7.2': true } }), false);
    assert.equal(Lib.statementApplies(st, {}), true);
    assert.match(templates, /whenApplicable: \['A\.7\.2'\],\n        rule: 'Visitors to secured areas/);
  });
  test('the premises question is asked', () => {
    assert.match(templates, /key: 'orgPremises', label: 'Does the organisation have premises of its own\?'/);
  });
});

describe('markup', () => {
  test('the SoA says Scope, offers Not applicable as a status, and has the exclusions card', () => {
    assert.match(html, /<th scope="col">Scope<\/th><th scope="col">Status<\/th>/);
    assert.match(html, /<div id="soaExclusions"><\/div>/);
    assert.match(app, /var SOA_STATUSES = \['Not started', 'In progress', 'Implemented', 'Not applicable'\];/);
    assert.match(app, /if \(v === 'Not applicable'\) \{ await excludeControls\(\[c\]\);/);
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
  test('answer "no premises", accept the suggestion, then bring one back into scope', async () => {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(baseUrl + '/checkpoint/index.html?demo=1', { waitUntil: 'networkidle' });
    await page.evaluate(() => window.App.go('soa'));
    await page.waitForSelector('#soaExclusions .excl-q');
    const before = +(/(\d+) controls? excluded/.exec(await page.locator('#soaExclusions summary').innerText()) || [0, 0])[1];
    await page.click('#soaExclusions button[data-action="App.setPremises"][data-id="none"]');
    await page.waitForSelector('#soaExclusions .excl-sugg');
    await page.click('#soaExclusions button[data-action="App.applyExclusionSuggestion"][data-id="no-premises"]');
    await page.waitForSelector('#modalBox textarea');
    assert.match(await page.inputValue('#modalBox textarea'), /no premises/);
    await page.locator('#modalBox .m-btns .btn:not(.ghost)').click();
    await page.waitForTimeout(400);
    const card = await page.locator('#soaExclusions').innerText();
    assert.match(card, new RegExp((before + 7) + ' controls excluded'));
    assert.ok(!/Suggested: exclude/.test(card), 'the suggestion is used up');
    // The row shows it as Excluded with its reason; clicking brings it back.
    await page.evaluate(() => window.App.setAllSoaFamilies('1'));
    await page.waitForTimeout(300);
    const pill = '#soaRows tr[data-id="iso27001|A.7.12"] button[data-action="App.toggleApp"]';
    assert.equal((await page.locator(pill).innerText()).trim().toLowerCase(), 'excluded');
    assert.match(await page.locator('#soaRows tr[data-id="iso27001|A.7.12"]').innerText(), /Excluded: The organisation has no premises/);
    await page.click(pill);
    await page.waitForTimeout(300);
    assert.equal((await page.locator(pill).innerText()).trim().toLowerCase(), 'in scope');
    // Choosing "Not applicable" as a status asks for the reason too.
    await page.selectOption('#soaRows tr[data-id="iso27001|A.7.12"] select[data-change-action="App.setSt"]', 'Not applicable');
    await page.waitForSelector('#modalBox textarea');
    await page.locator('#modalBox .m-btns .btn.ghost').click();
    await page.waitForTimeout(300);
    assert.equal((await page.locator(pill).innerText()).trim().toLowerCase(), 'in scope', 'cancelling keeps it in scope');
    assert.deepEqual(errors, []);
    await page.close();
  });
});
