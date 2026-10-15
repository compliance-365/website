// The leadership meeting runs facts first (incidents, posture), then
// judgement (risks, actions, decisions), suggests its one-line outcome,
// shows how last meeting's decisions stand, and can draft minutes from
// a pasted Teams recap.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Lib = require('../public/checkpoint/lib.js');
const AI = require('../public/checkpoint/ai.js');

describe('agenda order', () => {
  test('facts, then judgement, then follow-through', () => {
    const keys = Lib.SECURITY_REVIEW_AGENDA.map((i) => i.key);
    assert.deepEqual(keys.slice(0, 5), ['incidents', 'posture', 'risks', 'actions', 'escalations']);
    assert.equal(keys[keys.length - 1], 'decisions');
  });
});

describe('suggested outcome', () => {
  test('counts what the meeting decided', () => {
    const s = Lib.securityReviewOutcomeDraft({
      escalations: { 'ACT-1': { choice: 'close' }, 'ACT-2': { choice: 'close' }, 'ACT-3': { choice: 'extend' } },
      riskDecisions: { 'R-1': { choice: 'accept' }, 'R-2': { choice: 'treat' } },
      newActions: ['Enforce MFA for contractors', 'Renew cyber insurance.', 'Test backups']
    });
    assert.equal(s, '3 overdue actions: 2 closed, 1 extended; 1 risk accepted; 1 risk treated; 3 new actions: Enforce MFA for contractors; Renew cyber insurance and 1 more');
  });
  test('nothing decided reads as reviewed', () => {
    assert.equal(Lib.securityReviewOutcomeDraft({}), 'Reviewed; no change needed');
  });
  test('never longer than the outcome box allows', () => {
    const s = Lib.securityReviewOutcomeDraft({ newActions: ['x'.repeat(150), 'y'.repeat(150)] });
    assert.ok(s.length <= 200);
  });
});

describe('since last meeting', () => {
  const meetings = [
    { id: 'SR-1', n: 1, status: 'Held', date: '2026-09-10', outcome: 'On track', actions: ['ACT-1', 'ACT-2', 'ACT-3', 'ACT-9'] },
    { id: 'SR-0', n: 0, status: 'Held', date: '2026-08-10', actions: [] },
    { id: 'SR-2', n: 2, status: 'Scheduled', date: '2026-10-16' }
  ];
  const actions = [
    { id: 'ACT-1', title: 'Enforce MFA', owner: 'Sam', status: 'Done', due: '2026-10-01' },
    { id: 'ACT-2', title: 'Renew insurance', owner: 'Cem', status: 'Open', due: '2026-10-01' },
    { id: 'ACT-3', title: 'Test backups', owner: 'Cem', status: 'Open', due: '2026-11-30' }
  ];
  test('the latest held meeting before this one, and how each decision stands', () => {
    const r = Lib.securityReviewSinceLast(meetings, meetings[2], actions, '2026-10-14');
    assert.equal(r.id, 'SR-1');
    assert.equal(r.outcome, 'On track');
    assert.deepEqual(r.items.map((x) => x.state), ['done', 'overdue', 'open']);
    assert.equal(r.done, 1);
    assert.equal(r.overdue, 1);
  });
  test('the first meeting has nothing before it', () => {
    assert.equal(Lib.securityReviewSinceLast([meetings[2]], meetings[2], actions, '2026-10-14'), null);
  });
});

describe('minutes drafted from a pasted recap', () => {
  const items = [{ key: 'incidents', title: 'Incidents' }, { key: 'risks', title: 'Risks' }];
  test('the prompt carries the agenda and the recap, and forbids inventing', () => {
    const p = AI.buildMinutesDraftPrompt(items, 'Cem said the insurance renewal is late.');
    assert.match(p, /incidents/);
    assert.match(p, /risks/);
    assert.match(p, /insurance renewal is late/);
    assert.match(p, /DECISION/);
  });
  test('only known items are read back; decisions keep owner and date', () => {
    const r = AI.parseMinutesDraft('ITEM risks: Insurance renewal late.\nDECISION risks: Renew cyber insurance - Cem - 2026-11-30\nITEM bogus: ignore me', ['incidents', 'risks']);
    assert.deepEqual(r.notes, { risks: 'Insurance renewal late.' });
    assert.deepEqual(r.decisions, { risks: ['Renew cyber insurance - Cem - 2026-11-30'] });
  });
  test('drafts go under what was already typed, as Decision: lines the minutes already understand', () => {
    const draft = AI.parseMinutesDraft('ITEM risks: Insurance renewal late.\nDECISION risks: Renew cyber insurance - Cem - 2026-11-30', ['incidents', 'risks']);
    const m = AI.mergeMinutesDraft({ risks: 'Discussed at length.\n', incidents: 'None.' }, draft, ['incidents', 'risks']);
    assert.equal(m.filled, 1);
    assert.equal(m.notes.incidents, 'None.');
    assert.equal(m.notes.risks, 'Discussed at length.\nInsurance renewal late.\nDecision: Renew cyber insurance - Cem - 2026-11-30');
    const split = Lib.splitMinuteText(m.notes.risks, '2026-10-16');
    assert.deepEqual(split.decisions, [{ title: 'Renew cyber insurance', owner: 'Cem', due: '2026-11-30' }]);
  });
  test('the minutes feature sends no register data', () => {
    assert.deepEqual(AI.FEATURE_CONTEXT_ALLOW ? AI.FEATURE_CONTEXT_ALLOW.minutes : [], []);
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
  test('since last meeting, a suggested outcome, and the recap paste is held back in the demo', async () => {
    const page = await browser.newPage({ viewport: { width: 1300, height: 950 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(baseUrl + '/checkpoint/index.html?demo=1', { waitUntil: 'networkidle' });
    await page.evaluate(() => window.App.go('reviews'));
    await page.click('#secReviewCard button[data-action="App.openSecurityReview"]');
    await page.waitForSelector('#drawer .sr-since');
    assert.match(await page.locator('#drawer .sr-since').innerText(), /Since last meeting[\s\S]*Meeting \d/i);
    if (await page.locator('#drawer button[data-action="App.prepareSecurityReview"]').count()) await page.click('#drawer button[data-action="App.prepareSecurityReview"]');
    await page.click('#drawer button[data-action="App.recordSecurityReview"]');
    await page.waitForSelector('#drawer button[data-action="App.srSuggestOutcome"]');
    await page.click('#drawer .sr-m[data-key="actions"] .sr-m-head');
    await page.fill('#drawer #srNote-actions', 'Decision: Enforce MFA for contractors - Sam Okafor - 2026-11-30');
    await page.click('#drawer button[data-action="App.srSuggestOutcome"]');
    assert.equal(await page.inputValue('#srOutcome'), '1 new action: Enforce MFA for contractors');
    assert.equal(await page.inputValue('#drawer #srNote-actions'), 'Decision: Enforce MFA for contractors - Sam Okafor - 2026-11-30', 'what was typed is kept');
    await page.click('#drawer button[data-action="App.srPasteRecap"]');
    await page.waitForTimeout(300);
    assert.match(await page.locator('body').innerText(), /not (licensed|set up|available in the demo)/i);
    assert.equal(await page.inputValue('#drawer #srNote-actions'), 'Decision: Enforce MFA for contractors - Sam Okafor - 2026-11-30');
    assert.deepEqual(errors, []);
    await page.close();
  });
});
