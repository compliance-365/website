// Training in three formats, with question banks, the client's own
// details, per-question effectiveness and monthly refreshers.
import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const L = require('../public/checkpoint/lib.js');
globalThis.window = globalThis.window || {};
require('../public/checkpoint/courses.js');
const { TRAINING_COURSES, TRAINING_REFRESHERS, TRAINING_ART } = globalThis.window;

describe('the courses', () => {
  test('every lesson has an illustration, three take-aways and a scenario with one right answer', () => {
    TRAINING_COURSES.forEach((c) => c.modules.forEach((m, i) => {
      assert.ok(TRAINING_ART[m.art], `${c.id} lesson ${i} has no illustration`);
      assert.equal(m.key.length, 3, `${c.id} lesson ${i} needs three take-aways`);
      assert.ok(m.scenario && m.scenario.setup, `${c.id} lesson ${i} has no scenario`);
      assert.equal(m.scenario.choices.filter((x) => x.ok).length, 1, `${c.id} lesson ${i} scenario needs exactly one right answer`);
      m.scenario.choices.forEach((x) => assert.ok(x.why, `${c.id} lesson ${i} choice "${x.t}" does not explain itself`));
    }));
  });
  test('a bank of at least ten questions per course, each with a stable id', () => {
    const ids = new Set();
    TRAINING_COURSES.forEach((c) => {
      assert.ok(c.quiz.length >= 10, `${c.id} has only ${c.quiz.length} questions`);
      c.quiz.forEach((q) => { assert.ok(q.id && !ids.has(q.id), `duplicate or missing id ${q.id}`); ids.add(q.id); });
    });
  });
  test('every course has a quick version and a toolbox talk that fits its time', () => {
    TRAINING_COURSES.forEach((c) => {
      assert.ok(c.essentials && c.essentials.duration <= 5 && c.essentials.passMark <= c.essentials.quizDraw, `${c.id} quick version`);
      assert.ok(c.talk && c.talk.segments.length >= 3 && c.talk.opener && c.talk.close, `${c.id} toolbox talk`);
      const mins = 2 + c.talk.segments.reduce((n, s) => n + s.minutes, 0);
      assert.ok(mins <= c.talk.minutes + 1, `${c.id} talk runs ${mins} minutes against ${c.talk.minutes}`);
    });
  });
  test('client details use known placeholders only', () => {
    TRAINING_COURSES.forEach((c) => c.modules.forEach((m) => (m.local || []).forEach((t) => {
      (t.match(/\{\{(\w+)\}\}/g) || []).forEach((tok) => assert.ok(['{{org}}', '{{reportTo}}', '{{privacyTo}}', '{{aiTools}}'].includes(tok), `${c.id}: unknown ${tok}`));
    })));
  });
  test('twelve refreshers, each one habit and one answerable question', () => {
    assert.equal(TRAINING_REFRESHERS.length, 12);
    TRAINING_REFRESHERS.forEach((r) => {
      assert.ok(TRAINING_ART[r.art], `${r.id} has no illustration`);
      assert.ok(r.points.length >= 3 && r.action, `${r.id} content`);
      assert.ok(r.check.answer >= 0 && r.check.answer < r.check.options.length && r.check.why, `${r.id} check`);
    });
  });
});

describe('question banks', () => {
  const bank = TRAINING_COURSES[0].quiz;
  test('a draw is a fixed-size mix, its answers shuffled but still correct', () => {
    const d = L.drawQuiz(bank, 5, 'seed-1');
    assert.equal(d.length, 5);
    d.forEach((q) => {
      const orig = bank.find((b) => b.id === q.id);
      assert.equal(q.options[q.answer], orig.options[orig.answer], `${q.id}: the right answer moved with its text`);
      assert.deepEqual([...q.options].sort(), [...orig.options].sort());
    });
  });
  test('the same attempt redraws identically; a new attempt usually differs', () => {
    assert.deepEqual(L.drawQuiz(bank, 5, 'a'), L.drawQuiz(bank, 5, 'a'));
    const sets = new Set(['a', 'b', 'c', 'd', 'e'].map((s) => L.drawQuiz(bank, 5, s).map((q) => q.id).join()));
    assert.ok(sets.size > 1, 'five attempts all drew the same questions');
  });
  test('the right answer is not always in the same place', () => {
    const spots = new Set();
    for (let i = 0; i < 20; i++) L.drawQuiz(bank, 5, 's' + i).forEach((q) => spots.add(q.answer));
    assert.ok(spots.size >= 3);
  });
});

describe('client details', () => {
  test('filled from the profile; a line whose detail is not set is left out', () => {
    assert.equal(L.fillCourseText('Report to {{reportTo}}.', { reportTo: 'security@acme.example' }), 'Report to security@acme.example.');
    assert.equal(L.fillCourseText('Report to {{reportTo}}.', { reportTo: '  ' }), null);
    assert.equal(L.fillCourseText('Report to {{reportTo}}.', {}), null);
  });
});

describe('is the training working', () => {
  const records = [
    { quizLog: '2026-05-01:sa-06-,sa-02+\n2026-05-01:sa-06+,sa-02-' },
    { quizLog: '2026-05-03:sa-06-,sa-02+' },
    { quizLog: '2026-05-04:sa-06-,sa-01+' }
  ];
  test('per-question miss rates, worst first, with the question text', () => {
    const s = L.trainingQuestionStats(records, TRAINING_COURSES, { minAsked: 3 });
    assert.equal(s[0].id, 'sa-06');
    assert.equal(s[0].asked, 4);
    assert.equal(s[0].missed, 3);
    assert.equal(s[0].rate, 75);
    assert.match(s[0].q, /strongest sign/);
    assert.ok(!s.some((x) => x.id === 'sa-01'), 'asked once: not ranked');
  });
  test('the quiz log line round-trips', () => {
    const line = L.quizLogLine('2026-10-15', [{ id: 'sa-01', ok: true }, { id: 'pa-03', ok: false }]);
    assert.equal(line, '2026-10-15:sa-01+,pa-03-');
    assert.deepEqual(L.parseQuizLog(line)[0].results, [{ id: 'sa-01', ok: true }, { id: 'pa-03', ok: false }]);
  });
  test('the leadership meeting hears about it', () => {
    const pack = L.buildSecurityReviewPack({ today: '2026-10-15', trainingGaps: ['75% miss "Which of these is the strongest sign..." (Security Awareness): cover it in the next refresher'] });
    const people = L.securityReviewAgenda({ chair: 'A', owner: 'B' }, 1, pack).items.find((i) => i.key === 'people');
    assert.ok(people.facts.some((f) => /^Training: 75% miss/.test(f)));
  });
});

describe('monthly refreshers', () => {
  test('a year covers every topic once', () => {
    const seen = new Set();
    for (let m = 1; m <= 12; m++) seen.add(L.refresherForMonth(TRAINING_REFRESHERS, `2027-${String(m).padStart(2, '0')}-10`).id);
    assert.equal(seen.size, 12);
  });
  test('this month\'s signal: our own recent incidents, and exploited flaws in what we use', () => {
    const sig = L.refresherSignal(
      [{ title: 'Laptop left on a train', detected: '2026-10-01', lessonsLearned: 'Remote wipe worked within 25 minutes. Encryption was on.' }, { title: 'Old', detected: '2026-01-01' }],
      [{ product: 'FortiOS SSL-VPN', matchedStack: true, dateAdded: '2026-10-05' }, { product: 'Unrelated', dateAdded: '2026-10-05' }],
      '2026-10-15');
    assert.equal(sig.length, 2);
    assert.match(sig[0], /^Here recently: Laptop left on a train\. Since then: Remote wipe worked within 25 minutes\.$/);
    assert.match(sig[1], /FortiOS SSL-VPN, which we use/);
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
  test('a lesson at a time, a scenario, a passed check recorded with its answers, and a toolbox talk', async () => {
    const context = await browser.newContext({ viewport: { width: 1300, height: 900 } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(baseUrl + '/checkpoint/index.html?demo=1', { waitUntil: 'networkidle' });
    await page.evaluate(() => window.App.go('training'));
    await page.waitForSelector('#trainingExtras .tr-card');
    const extras = await page.locator('#trainingExtras').innerText();
    assert.match(extras, /3-minute refresher/i);
    assert.match(extras, /security@meridianhealth\.example/);
    assert.match(extras, /What people get wrong[\s\S]*60%[\s\S]*strongest sign/);

    // The demo user's assigned course, read in full.
    await page.click('#courseCatalogue [data-action="App.openCourse"][data-id="ai-use-oversight"]');
    await page.waitForSelector('.tr-lesson');
    assert.equal(await page.locator('.tr-key').count(), 3);
    assert.equal(await page.locator('.tr-lesson svg.tr-art').count(), 1);
    await page.click('.tr-scenario .tr-choice >> nth=1');
    assert.match(await page.locator('.tr-why').innerText(), /^Yes\./);
    await page.click('.tr-nav .btn:not(.ghost)');
    assert.match(await page.locator('.tr-local').innerText(), /Microsoft 365 Copilot/, 'the approved AI tools appear in lesson 2');
    for (let i = 0; i < 4; i++) await page.click('.tr-nav .btn:not(.ghost)');
    await page.waitForSelector('#courseQuiz .tr-q');
    assert.equal(await page.locator('#courseQuiz .tr-q').count(), 5);
    // Answer correctly from the draw itself.
    const answers = await page.evaluate(() => window._courseState.drawn.map((q) => q.answer));
    for (let i = 0; i < answers.length; i++) await page.click(`#courseQuiz [data-id="${i}:${answers[i]}"]`);
    await page.click('[data-action="App.submitCourseQuiz"]');
    await page.waitForTimeout(300);
    assert.match(await page.locator('.tr-result').innerText(), /5 of 5: passed[\s\S]*recorded/);
    const mine = await page.evaluate(() => JSON.parse(localStorage.getItem('checkpoint-demo-v8')).training.find((t) => t.id === 'TRN-0008'));
    assert.equal(mine.status, 'Completed');
    assert.equal(mine.method, 'Online');
    assert.match(mine.quizLog, /^\d{4}-\d{2}-\d{2}:(ai-\d\d\+,?){5}$/, 'every answer is logged by question');
    await page.click('[data-action="App.closeCourse"] >> nth=0');

    // The quick version: take-aways and scenarios, no detail, three questions.
    await page.click('#courseCatalogue [data-action="App.openCourseQuick"][data-id="privacy-awareness"]');
    await page.waitForSelector('.tr-lesson');
    assert.equal(await page.locator('.tr-more').count(), 0);
    await page.click('[data-action="App.courseStep"][data-id="5"]');
    assert.equal(await page.locator('#courseQuiz .tr-q').count(), 3);
    await page.click('[data-action="App.closeCourse"] >> nth=0');

    // Toolbox talk pack opens as a printable report with a sign-on sheet.
    const popup = context.waitForEvent('page');
    await page.click('#courseCatalogue [data-action="App.courseTalkPack"][data-id="security-awareness"]');
    const doc = await popup;
    await doc.waitForLoadState();
    await doc.waitForTimeout(300);
    const html = await doc.content();
    assert.ok(html.includes('Toolbox talk: Security Awareness'));
    assert.ok(/Talking points[\s\S]*Ask the group[\s\S]*Attendance/.test(html));
    assert.ok(html.includes('security@meridianhealth.example'), 'the reporting contact is in the pack');
    assert.ok(!/<h2>Methodology<\/h2>/.test(html), 'no scan methodology in a toolbox talk');
    assert.ok(!/Here: Here/.test(html));
    await doc.close();
    assert.deepEqual(errors, []);
    await context.close();
  });

  test('recording a toolbox talk completes the attendees who had the course assigned', async () => {
    const page = await browser.newPage({ viewport: { width: 1300, height: 900 } });
    await page.goto(baseUrl + '/checkpoint/index.html?demo=1', { waitUntil: 'networkidle' });
    await page.evaluate(() => window.App.go('training'));
    await page.waitForSelector('#courseCatalogue .tr-course');
    await page.click('#courseCatalogue [data-action="App.recordToolboxTalk"][data-id="ai-use-oversight"]');
    await page.waitForSelector('#modalBox textarea');
    await page.fill('#modalBox textarea', 'S. Okafor\nmchen@meridianhealth.example\nK. Patel\nVisitor Person');
    await page.locator('#modalBox .m-btns .btn:not(.ghost)').click();
    await page.waitForTimeout(400);
    const toast = await page.locator('body').innerText();
    assert.match(toast, /2 marked complete by toolbox talk\. Already complete: K\. Patel\. Not assigned this course: Visitor Person/);
    const recs = await page.evaluate(() => JSON.parse(localStorage.getItem('checkpoint-demo-v8')).training.filter((t) => t.courseId === 'ai-use-oversight' && t.method === 'Toolbox talk'));
    assert.deepEqual(recs.map((t) => t.userName).sort(), ['M. Chen', 'S. Okafor']);
    assert.match(recs[0].note, /Toolbox talk on \d{4}-\d{2}-\d{2}, facilitated by /);
    await page.close();
  });
});
