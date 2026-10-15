// ISO 42001 improvements: the structured AI impact assessment (A.5.2 to
// A.5.5, shaped by ISO/IEC 42005:2025), EU AI Act application dates and
// Article 4, Australia's Guidance for AI Adoption crosswalk, and ISO
// 42001 scan suggestions that can only ever be partial.
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
const full = {
  assessedBy: 'K', assessedOn: '2026-10-01', nextDue: '2027-10-01', triggers: ['model', 'annual'],
  entries: [
    { party: 'Patients', scope: 'individual', area: 'safety', harm: 'Missed urgent case', L: 3, I: 5, mitigation: 'Nurse confirms', rL: 2, rI: 4 },
    { party: 'Community', scope: 'environment', area: 'environment', harm: 'Energy use', L: 2, I: 1, mitigation: '', rL: 2, rI: 1 }
  ],
  decision: 'Proceed with conditions', decisionBy: 'K. Patel'
};

describe('impact assessment status is derived, never typed', () => {
  test('nothing recorded is Not started', () => {
    assert.equal(L.aiImpactSummary({}, TODAY).status, 'Not started');
    assert.equal(L.aiImpactSummary({ impactAssessment: { entries: [] } }, TODAY).status, 'Not started');
  });
  test('people and society covered, harms mitigated and re-rated, decision signed: Completed, and all four A.5 controls', () => {
    const s = L.aiImpactSummary({ impactAssessment: full }, TODAY);
    assert.equal(s.status, 'Completed', s.gaps.join('; '));
    assert.deepEqual(s.controls, ['AI.5.2', 'AI.5.3', 'AI.5.4', 'AI.5.5']);
  });
  test('people only: In progress, and A.5.5 is not claimed', () => {
    const s = L.aiImpactSummary({ impactAssessment: { ...full, entries: [full.entries[0]] } }, TODAY);
    assert.equal(s.status, 'In progress');
    assert.ok(s.gaps.some((g) => /A\.5\.5/.test(g)));
    assert.ok(!s.controls.includes('AI.5.5'));
  });
  test('a medium or high harm with no mitigation holds it open', () => {
    const e = { ...full.entries[0], mitigation: '' };
    const s = L.aiImpactSummary({ impactAssessment: { ...full, entries: [e, full.entries[1]] } }, TODAY);
    assert.equal(s.status, 'In progress');
    assert.equal(s.unmitigated, 1);
  });
  test('no signed decision holds it open', () => {
    assert.equal(L.aiImpactSummary({ impactAssessment: { ...full, decisionBy: '' } }, TODAY).status, 'In progress');
  });
  test('an overdue reassessment reopens a completed assessment', () => {
    const s = L.aiImpactSummary({ impactAssessment: { ...full, nextDue: '2026-09-01' } }, TODAY);
    assert.equal(s.status, 'In progress');
    assert.ok(s.overdue);
  });
  test('scores and bands', () => {
    assert.equal(L.aiImpactScore(3, 5), 15);
    assert.equal(L.aiImpactBand(15), 'High');
    assert.equal(L.aiImpactBand(8), 'Medium');
    assert.equal(L.aiImpactBand(0), 'Not rated');
  });
});

describe('EU AI Act: Article 4 and when each tier applies', () => {
  test('AI literacy applies to every tier, as a duty to take measures', () => {
    ['Minimal', 'Limited', 'High'].forEach((t) => assert.equal(L.aiActTimeline(t, TODAY)[0].key, 'literacy'));
    assert.match(L.AI_ACT_LITERACY, /take measures to support/i);
  });
  test('high-risk Annex III obligations are dated 2 December 2027 and not yet applying', () => {
    const h = L.aiActTimeline('High', TODAY).find((x) => x.key === 'High');
    assert.equal(h.date, '2027-12-02');
    assert.equal(h.applies, false);
  });
  test('transparency duties applied from 2 August 2026', () => {
    const t = L.aiActTimeline('Limited', TODAY).find((x) => x.key === 'Limited');
    assert.equal(t.date, '2026-08-02');
    assert.equal(t.applies, true);
  });
  test('general-purpose AI obligations are dated 2025, not 2026', () => {
    assert.equal(L.AI_ACT_APPLIES.gpai.date, '2025-08-02');
  });
});

describe('Australia: Guidance for AI Adoption crosswalk', () => {
  test('six practices, each mapped to ISO 42001', () => {
    assert.equal(L.AU_AI_PRACTICES.length, 6);
    L.AU_AI_PRACTICES.forEach((p) => assert.ok(p.iso.length >= 2, p.key));
  });
  test('coverage is computed from the register, not claimed', () => {
    const sys = [{ owner: 'K', intendedUse: 'x', humanOversight: 'y', impactAssessment: full }, { owner: 'Unassigned' }];
    const c = Object.fromEntries(L.auAiPracticeCoverage(sys, [], 0, TODAY).map((p) => [p.key, p]));
    assert.equal(c.accountable.level, 'partly');
    assert.equal(c.impacts.pct, 50);
    assert.equal(c.risks.level, 'none');
    assert.equal(L.auAiPracticeCoverage([], [], 0, TODAY).every((p) => p.level === 'none'), true);
  });
});

describe('flat partial suggestions (ISO 42001)', () => {
  test('a pass on a partial mapping suggests In progress, never Implemented', () => {
    const s = L.flatSuggestions({}, { logging: ['AI.6.2.8'] }, { logging: 'pass' }, { logging: 'Audit log' });
    assert.equal(s['AI.6.2.8'].st, 'In progress');
  });
  test('a fail still suggests Not started, and the worst wins', () => {
    const s = L.flatSuggestions({}, { logging: ['AI.6.2.6'], alerts: ['AI.6.2.6'] }, { logging: 'pass', alerts: 'fail' }, {});
    assert.equal(s['AI.6.2.6'].st, 'Not started');
    assert.equal(s['AI.6.2.6'].labels.length, 2);
  });
  test('a full mapping still allows Implemented', () => {
    assert.equal(L.flatSuggestions({ x: ['C1'] }, {}, { x: 'pass' }, {}).C1.st, 'Implemented');
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
  test('assess a system, add a societal impact, raise a risk and save', async () => {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(baseUrl + '/checkpoint/index.html?demo=1', { waitUntil: 'networkidle' });
    await page.evaluate(() => window.App.go('aisystems'));
    assert.match(await page.locator('#aiAuPractices').innerText(), /Guidance for AI Adoption/i);
    await page.evaluate(() => window.App.openAiSystem('AI-002'));
    const drawer = await page.locator('#drawer').innerText();
    assert.match(drawer, /Article 4/);
    assert.match(drawer, /Intended use/);
    await page.click('#drawer [data-action="App.openAiImpact"]');
    await page.click('#drawer [data-action="App.aiIaAddRow"]');
    await page.selectOption('#aiIa_scope_2', 'society');
    await page.fill('#aiIa_party_2', 'Local health services');
    await page.fill('#aiIa_harm_2', 'Over-triage shifts demand onto emergency departments');
    await page.selectOption('#aiIa_L_2', '2');
    await page.selectOption('#aiIa_I_2', '2');
    await page.fill('#aiIa_mitigation_1', 'Language check routes non-English tickets to a nurse first');
    await page.selectOption('#aiIa_rL_1', '2');
    await page.selectOption('#aiIa_rI_1', '3');
    await page.click('#drawer [data-action="App.aiIaRaiseRisk"][data-id="0"]');
    assert.match(await page.locator('#drawer').innerText(), /In the risk register as R-/);
    await page.click('#drawer [data-action="App.saveAiImpact"]');
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('checkpoint-demo-v8')).aiSystems.find((a) => a.id === 'AI-002'));
    assert.equal(saved.impactAssessment.entries.length, 3);
    assert.ok(saved.impactAssessment.entries[0].risk, 'the raised risk is linked');
    assert.equal(saved.impactAssessmentStatus, 'In progress', 'no decision yet');
    assert.deepEqual(errors, []);
    await page.close();
  });
});
