// 1.178.0: interview times fitted around people's calendars (free/busy),
// interview notes drafted from a pasted recap, and the GitHub collector's
// A.8.32 change sample.
import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import CheckpointAI from '../public/checkpoint/ai.js';
import { changeSampleCheck, buildGithubResults } from '../public/checkpoint/github/collector/checks.mjs';
import { collectChangeSample, drawSample, ticketRef } from '../public/checkpoint/github/collector/index.mjs';
import { mergeIntoScan } from '../public/checkpoint/github/collector/scan-merge.mjs';

const require = createRequire(import.meta.url);
global.window = global.window || {};
const L = require('../public/checkpoint/lib.js');
const app = readFileSync(new URL('../public/checkpoint/app.js', import.meta.url), 'utf8');
const graph = readFileSync(new URL('../public/checkpoint/graph.js', import.meta.url), 'utf8');
const config = readFileSync(new URL('../public/checkpoint/config.js', import.meta.url), 'utf8');

const AUDIT = { id: 'IA-1', planned: '2026-11-02', scope: 'ISMS' };
const WP = { clauses: [{ id: '5.1', title: 'Leadership', owner: 'Top Boss' }, { id: '6.1', title: 'Risk', owner: 'Rita Risk' }], controls: [{ id: 'A.5.15', title: 'Access', owner: 'Ian IT' }, { id: 'A.8.13', title: 'Backup', owner: 'Ian IT' }] };
const plan = (busy) => L.auditInterviewPlan(AUDIT, WP, { lines: {} }, {}, { today: '2026-10-24', busy, auditor: 'Ann Auditor' });
const at = (p, who) => p.slots.find((s) => s.who === who);
const overlaps = (s, b) => s.date === b.date && s.start < b.end && s.end > b.start;

describe('interviews fitted around calendars', () => {
  test('without busy times the plan is unchanged: back to back', () => {
    const p = plan(null);
    assert.equal(p.fitted, false);
    assert.deepEqual(p.slots.map((s) => s.start), ['09:00', '09:30', '09:45', '10:15', '10:30', '11:15']);
  });
  test('each interview lands when both the person and the auditor are free', () => {
    const busy = {
      'top boss': [{ date: '2026-11-02', start: '09:00', end: '11:00' }],
      'ian it': [{ date: '2026-11-02', start: '09:30', end: '10:30' }],
      'ann auditor': [{ date: '2026-11-02', start: '11:00', end: '11:30' }]
    };
    const p = plan(busy);
    assert.equal(p.fitted, true);
    for (const s of p.slots.filter((x) => x.kind === 'interview')) {
      for (const b of (busy[s.who.toLowerCase()] || []).concat(busy['ann auditor'])) assert.ok(!overlaps(s, b), s.title + ' ' + s.start);
    }
    assert.equal(at(p, 'Rita Risk').start, '09:30', 'whoever is free goes first');
    assert.equal(at(p, 'Ian IT').start, '10:30');
    assert.equal(at(p, 'Top Boss').start, '11:30', 'after the auditor’s own meeting');
    assert.deepEqual(p.conflicts.map((c) => c.title), ['Opening meeting'], 'Top Boss is busy at the opening: named, not hidden');
  });
  test('lunch stays clear, and someone busy all day moves to the next working day', () => {
    const p = plan({ 'rita risk': [{ date: '2026-11-02', start: '00:00', end: '23:59' }], 'ian it': [{ date: '2026-11-02', start: '09:00', end: '12:30' }] });
    const ian = at(p, 'Ian IT');
    assert.ok(ian.start >= '13:15', 'not over lunch: ' + ian.start);
    assert.ok(p.slots.some((s) => s.title === 'Lunch' && s.start === '12:30'));
    assert.equal(at(p, 'Rita Risk').date, '2026-11-03');
    assert.deepEqual(p.days, ['2026-11-02', '2026-11-03']);
  });
  test('Graph free/busy becomes local busy blocks; free time is ignored; overnight items split', () => {
    const b = L.busyFromSchedules([{ who: 'Ian IT', mail: 'ian@x.example' }, { who: 'Nobody', mail: '' }], [
      { scheduleId: 'IAN@x.example', scheduleItems: [
        { status: 'busy', start: { dateTime: '2026-11-02T09:00:00.0000000' }, end: { dateTime: '2026-11-02T10:00:00.0000000' } },
        { status: 'free', start: { dateTime: '2026-11-02T11:00:00' }, end: { dateTime: '2026-11-02T12:00:00' } },
        { status: 'oof', start: { dateTime: '2026-11-02T23:00:00' }, end: { dateTime: '2026-11-03T01:00:00' } }] },
      { scheduleId: 'other@x.example', error: { message: 'not found' } }
    ]);
    const tz = new Date('2026-11-02T09:00:00Z').getTimezoneOffset();
    if (tz === 0) assert.deepEqual(b['ian it'], [{ date: '2026-11-02', start: '09:00', end: '10:00' }, { date: '2026-11-02', start: '23:00', end: '23:59' }, { date: '2026-11-03', start: '00:00', end: '01:00' }]);
    else assert.equal(b['ian it'].length >= 2, true);
    assert.equal(Object.keys(b).length, 1);
  });
  test('wiring: free/busy only, asked for on first use, fitted before invites go', () => {
    assert.match(config, /scopesCalendar: \['Calendars\.ReadBasic'\]/);
    assert.match(graph, /\/me\/calendar\/getSchedule', \{ method: 'POST', scopes: CONFIG\.scopesCalendar/);
    assert.match(app, /var fr = await fitAuditToCalendars\(a, users\);/);
    assert.match(app, /busy: fit && fit\.busy \? fit\.busy : null, auditor: a\.auditor \|\| ''/);
  });
});

describe('interview notes from a pasted recap', () => {
  const lines = [{ id: 'A.5.15', title: 'Access control', questions: ['Show the access policy.'] }, { id: '6.1', title: 'Risk', questions: [] }];
  test('the prompt numbers the lines and forbids invention', () => {
    const p = CheckpointAI.buildAuditInterviewPrompt(lines, 'Ian showed the access review from September.', 'Ian IT');
    assert.match(p, /interview with Ian IT/);
    assert.match(p, /L1: A\.5\.15 Access control \(asked: Show the access policy\.\)/);
    assert.match(p, /Never invent a record, a name or a date/);
    assert.match(p, /RECAP:\nIan showed/);
  });
  test('parsing keeps known lines and results only; UNSURE carries no result', () => {
    const d = CheckpointAI.parseAuditInterviewDraft('Here you go\nL1: C | Ian showed the September access review, signed off.\nL2: unsure | Not discussed in detail.\nL3: Major | invented line\nL1: Whatever | bad result', 2);
    assert.deepEqual(d[0], { s: 'C', note: 'Ian showed the September access review, signed off.' });
    assert.deepEqual(d[1], { s: '', note: 'Not discussed in detail.' });
    assert.equal(d[2], undefined);
    assert.ok(CheckpointAI.FEATURE_CONTEXT_ALLOW.auditInterview && CheckpointAI.FEATURE_CONTEXT_ALLOW.auditInterview.length === 0, 'sees no register');
  });
  test('wiring: drafts wait on the line; accepting records it, nothing auto-records', () => {
    assert.match(app, /a\.results\[l\.key\] = Object\.assign\(\{\}, cur, \{ iv: \{ s: draft\[i\]\.s, note: draft\[i\]\.note, who: who, at: today \} \}\);/);
    assert.match(app, /if \(cur\.r\) return;/);
    assert.match(app, /var iv = \(\(a\.results \|\| \{\}\)\[key\] \|\| \{\}\)\.iv;\n\s*if \(iv && iv\.s\) \{/);
  });
});

describe('the A.8.32 change sample', () => {
  test('ticket references: Jira keys, issue closers, links; standards are not tickets', () => {
    assert.equal(ticketRef('Fix login (PAY-142)'), 'PAY-142');
    assert.equal(ticketRef('Use SHA-256 everywhere'), '');
    assert.equal(ticketRef('Move to SHA-256 for PAY-9'), 'PAY-9');
    assert.equal(ticketRef('Tidy\n\nCloses #12'), '#12');
    assert.equal(ticketRef('see https://acme.atlassian.net/browse/OPS-7 for context').length > 0, true);
    assert.equal(ticketRef('no reference here'), '');
  });
  test('the draw is reproducible within a month and draws all when fewer', () => {
    const pop = Array.from({ length: 40 }, (_, i) => ({ repo: 'r', n: i }));
    assert.deepEqual(drawSample(pop, 5, 'acme|2026-10'), drawSample(pop.slice().reverse(), 5, 'acme|2026-10'));
    assert.notDeepEqual(drawSample(pop, 5, 'acme|2026-10'), drawSample(pop, 5, 'acme|2026-11'));
    assert.equal(drawSample(pop.slice(0, 3), 25, 'x').length, 3);
  });
  const item = (over) => Object.assign({ repo: 'api', n: 1, approvers: ['bob'], checks: 'passed', ref: 'PAY-1' }, over);
  test('verdicts: clean is a pass, one exception in 25 a review, more than one in ten a fail', () => {
    const cs = (items) => ({ population: 60, days: 90, items, size: items.length });
    assert.equal(changeSampleCheck(cs(Array.from({ length: 25 }, (_, i) => item({ n: i })))).result, 'pass');
    const one = Array.from({ length: 25 }, (_, i) => item({ n: i, approvers: i === 0 ? [] : ['bob'] }));
    const r1 = changeSampleCheck(cs(one));
    assert.equal(r1.result, 'review');
    assert.match(r1.note, /1 merged without an independent approval \(api#0\)/);
    const many = Array.from({ length: 10 }, (_, i) => item({ n: i, checks: i < 2 ? 'failed' : 'passed' }));
    assert.equal(changeSampleCheck(cs(many)).result, 'fail');
    assert.equal(changeSampleCheck(null).result, 'manual');
    assert.equal(changeSampleCheck({ population: 0, days: 90, items: [] }).result, 'manual');
    assert.equal(changeSampleCheck(cs([item({ approvers: null })])).result, 'manual', 'reviews unreadable: abstain');
  });
  test('collecting: merged PRs in the window, the author’s own approval does not count, failed checks found', async () => {
    const pulls = [
      { number: 5, title: 'PAY-5 thing', merged_at: '2026-10-20T10:00:00Z', updated_at: '2026-10-20T10:00:00Z', user: { login: 'amy' }, merged_by: { login: 'amy' }, head: { sha: 'h5', ref: 'feat' }, body: '' },
      { number: 4, title: 'closed unmerged', merged_at: null, updated_at: '2026-10-19T10:00:00Z', user: { login: 'amy' }, head: { sha: 'h4' } },
      { number: 3, title: 'old', merged_at: '2026-01-01T10:00:00Z', updated_at: '2026-10-18T10:00:00Z', user: { login: 'amy' }, head: { sha: 'h3' } }
    ];
    const gh = { req: async (url) => {
      if (/\/pulls\?/.test(url)) return { status: 200, body: pulls, link: '' };
      if (/\/pulls\/5\/reviews/.test(url)) return { status: 200, body: [{ user: { login: 'amy' }, state: 'APPROVED' }, { user: { login: 'bob' }, state: 'APPROVED' }, { user: { login: 'bob' }, state: 'DISMISSED' }] };
      if (/check-runs/.test(url)) return { status: 200, body: { check_runs: [{ conclusion: 'success' }, { conclusion: 'failure' }] } };
      if (/\/status$/.test(url)) return { status: 200, body: { statuses: [] } };
      return { status: 404, body: null };
    } };
    const cs = await collectChangeSample(gh, 'acme', [{ name: 'api', defaultBranch: 'main' }], { today: '2026-10-24', days: 90, size: 25 });
    assert.equal(cs.population, 1);
    assert.deepEqual(cs.items[0].approvers, [], 'amy approved her own; bob’s approval was dismissed');
    assert.equal(cs.items[0].checks, 'failed');
    assert.equal(cs.items[0].ref, 'PAY-5');
    assert.match(cs.method, /all of them, as there were 1/);
    const out = buildGithubResults({ changeSample: cs }, { today: '2026-10-24' });
    assert.equal(out.results['gh-change-sample'], 'fail');
    assert.equal(out.changeSample, cs);
  });
  test('the sample is stored with the day’s scan, keeping what was already there', async () => {
    const calls = [];
    const g = async (path, opts = {}) => { if (opts.method) { calls.push(opts.body.fields); return {}; } return { value: [{ id: '1', fields: { ScanDate: '2026-10-24', Detail: JSON.stringify({ results: { 'mfa-all': 'pass' }, notes: {}, source: 'automated', readiness: 40 }) } }] }; };
    await mergeIntoScan(g, 's', 'l', { results: { 'gh-change-sample': 'pass' }, notes: {}, changeSample: { items: [], population: 3 } }, '2026-10-24');
    const d = JSON.parse(calls[0].Detail);
    assert.equal(d.changeSample.population, 3);
    assert.equal(d.readiness, 40, 'the browser scan’s own fields survive the merge');
    assert.equal(d.results['mfa-all'], 'pass');
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
const KEY = 'checkpoint-demo-v8';

describe('in the demo', { skip: skipReason || false }, () => {
  test('change sample panel, and an interview draft waiting on its line then accepted', async () => {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(baseUrl + '/checkpoint/index.html?demo=1', { waitUntil: 'networkidle' });
    await page.evaluate(() => window.App.openChangeSample());
    const drawer = page.locator('#drawer');
    await drawer.locator('h2', { hasText: 'Change sample' }).waitFor();
    const t = await drawer.innerText();
    assert.match(t, /Example data/);
    assert.match(t, /6 of 64 changes merged/i);
    assert.match(t, /2 exceptions/);
    assert.match(t, /billing-api#77[\s\S]*No independent approval/);

    await page.evaluate(() => { window.App.go('audits'); window.App.planAuditProgramme(); });
    const modal = page.locator('#modalBox');
    await modal.getByLabel('Internal auditor', { exact: true }).fill('Compliance365', { timeout: 5000 });
    await modal.getByRole('button', { name: /^Schedule \d+ audit/ }).click();
    const audit = await page.evaluate(() => { const r = Array.from(document.querySelectorAll('#v-audits tr')).find((x) => /Clauses 4-10 \(management system\), pre-certification/.test(x.innerText)); return r && (r.innerText.match(/AUD-\d+/) || [])[0]; });
    assert.ok(audit, 'a planned audit');
    await page.evaluate((id) => window.App.conductAudit(id), audit);
    await page.locator('#drawer .aw-tab', { hasText: 'All' }).click();
    await page.locator('#drawer .aw-line').first().waitFor();
    const key = await page.locator('#drawer .aw-line').first().getAttribute('data-audit-line');
    await page.evaluate(([k, id, key]) => {
      const st = JSON.parse(localStorage.getItem(k));
      const a = st.audits.find((x) => x.id === id);
      a.results = a.results || {};
      a.results[key] = { iv: { s: 'OFI', note: 'Ian showed the review but it was two weeks late.', who: 'Ian IT', at: '2026-10-24' } };
      localStorage.setItem(k, JSON.stringify(st));
    }, [KEY, audit, key]);
    await page.reload({ waitUntil: 'networkidle' });
    await page.evaluate((id) => window.App.conductAudit(id), audit);
    await page.locator('#drawer .aw-tab', { hasText: 'All' }).click();
    const line = page.locator('#drawer .aw-line[data-audit-line="' + key + '"]');
    await line.waitFor();
    await line.locator('.aw-toggle').click();
    assert.match(await line.innerText(), /From the interview with Ian IT[\s\S]*two weeks late/);
    assert.equal(await line.locator('.aw-accept').count(), 1);
    assert.deepEqual(errors, []);
    await page.close();
  });
});
