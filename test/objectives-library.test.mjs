// The objectives register: a library to choose from, tagged by what each
// objective protects (confidentiality, integrity, availability), plus
// objectives the client writes themselves with their own tags.
import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const L = require('../public/checkpoint/lib.js');

describe('the library', () => {
  const lib = L.objectiveLibrary(['iso27001'], []);
  test('at least twenty objectives, with every one of C, I and A well covered', () => {
    assert.ok(lib.length >= 20, `only ${lib.length}`);
    ['C', 'I', 'A'].forEach((x) => assert.ok(lib.filter((o) => o.cia.includes(x)).length >= 8, `too few for ${x}`));
  });
  test('each objective protects one, two or all three, and is measurable', () => {
    lib.forEach((o) => {
      assert.ok(o.cia.length >= 1 && o.cia.length <= 3 && o.cia.every((x) => ['C', 'I', 'A'].includes(x)), o.key);
      assert.ok(o.title && o.metric && o.target && o.resources, `${o.key} needs a metric, target and resources (Clause 6.2)`);
    });
    assert.ok(lib.some((o) => o.cia.length === 1) && lib.some((o) => o.cia.length === 3));
  });
  test('Checkpoint-measured objectives come first and are marked', () => {
    assert.equal(lib[0].measured, true);
    assert.ok(lib.some((o) => o.measured === false));
    const titles = new Set(lib.map((o) => o.title.toLowerCase()));
    assert.equal(titles.size, lib.length, 'no duplicate titles');
  });
  test('only the client\'s frameworks, and nothing already in the register', () => {
    assert.ok(!lib.some((o) => o.key === 'lib-pia'), 'privacy objectives need a privacy framework');
    assert.ok(L.objectiveLibrary(['iso27001', 'privacyact'], []).some((o) => o.key === 'lib-pia'));
    const fewer = L.objectiveLibrary(['iso27001'], [{ title: 'Software is kept patched' }]);
    assert.equal(fewer.length, lib.length - 1);
  });
});

describe('what an objective protects', () => {
  test('its own tags first, in C, I, A order', () => {
    assert.deepEqual(L.objectiveCia({ cia: ['A', 'C'] }), ['C', 'A']);
  });
  test('else the library\'s, matched by metric, so older objectives still show', () => {
    assert.deepEqual(L.objectiveCia({ metric: 'Accounts protected by multi-factor authentication' }), ['C']);
    assert.deepEqual(L.objectiveCia({ metric: 'Monthly uptime of customer-facing services' }), ['A']);
  });
  test('a client\'s own objective with no tags protects nothing yet', () => {
    assert.deepEqual(L.objectiveCia({ title: 'Something of ours', metric: 'Our own measure' }), []);
  });
  test('coverage counts live objectives only', () => {
    assert.deepEqual(L.objectiveCiaCoverage([{ cia: ['C', 'I'] }, { cia: ['A'], status: 'Achieved' }, { cia: ['C'] }]), { C: 2, I: 1, A: 0 });
  });
  test('the policy statement carries the client\'s own tags', () => {
    assert.match(L.objectivesStatement([{ title: 'Our own', target: 'Yes', cia: ['I', 'A'] }]), /Our own \(Yes\) \[I, A\]/);
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
  test('choose from the library by C, I or A, and write your own with tags', async () => {
    const page = await browser.newPage({ viewport: { width: 1300, height: 900 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(baseUrl + '/checkpoint/index.html?demo=1', { waitUntil: 'networkidle' });
    await page.evaluate(() => window.App.go('objectives'));
    await page.click('#v-objectives [data-action="App.toggleObjectiveLibrary"]');
    await page.waitForSelector('#objLibraryPanel .obj-lib-card');
    await page.click('#objLibraryPanel [data-action="App.objLibFilter"][data-id="A"]');
    const cards = page.locator('#objLibraryPanel .obj-lib-card');
    const n = await cards.count();
    assert.ok(n >= 5);
    for (let i = 0; i < n; i++) assert.match(await cards.nth(i).innerText(), /\bA\b/, 'the Availability filter shows only A objectives');
    const pickTitle = (await cards.nth(0).locator('b').first().innerText()).trim();
    await cards.nth(0).click();
    await page.fill('#objLibOwner', 'ISMS Manager');
    await page.click('#objLibraryPanel [data-action="App.addLibraryObjectives"]');
    await page.waitForTimeout(300);
    const rows = await page.locator('#objRows').innerText();
    assert.ok(rows.includes(pickTitle), 'the chosen objective is in the register');
    assert.match(rows, /Availability/);

    await page.click('#v-objectives [data-action="App.toggleAddObjective"]');
    await page.fill('#naObjTitle', 'Reduce unplanned downtime of the site radio network');
    await page.fill('#naObjMetric', 'Unplanned outages per quarter');
    await page.fill('#naObjTarget', 'No more than one');
    await page.check('#naObjI');
    await page.check('#naObjA');
    await page.click('[data-action="App.addManualObjective"]');
    await page.waitForTimeout(300);
    const own = page.locator('#objRows tr', { hasText: 'site radio network' });
    assert.match(await own.innerText(), /Integrity, Availability/);
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('checkpoint-demo-v8')).objectives.find((o) => /radio network/.test(o.title)));
    assert.deepEqual(saved.cia, ['I', 'A']);
    assert.match(await page.locator('#objKpiRow').innerText(), /What the objectives protect/);
    assert.deepEqual(errors, []);
    await page.close();
  });
});
