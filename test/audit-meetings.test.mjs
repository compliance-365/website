// The audit day, prepared by Checkpoint: who to interview, when and what
// to ask (with calendar invites), the opening and closing meeting packs,
// a single next step on every audit, and what happens on completion.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
global.window = global.window || {};
const Lib = require('../public/checkpoint/lib.js');
const app = readFileSync(new URL('../public/checkpoint/app.js', import.meta.url), 'utf8');
const TODAY = '2026-10-24';

const wp = {
  clauses: [{ id: '5.1', title: 'Leadership', owner: 'CEO' }, { id: '9.3', title: 'Management review', owner: 'CEO' }, { id: '6.2', title: 'Objectives', owner: 'ISMS Manager' }],
  controls: [
    { id: 'A.8.5', title: 'Secure authentication', owner: 'IT Manager' },
    { id: 'A.8.9', title: 'Configuration', owner: 'IT Manager' },
    { id: 'A.8.15', title: 'Logging', owner: 'IT Manager' },
    { id: 'A.5.9', title: 'Assets', owner: '' }
  ],
  followUps: [{ id: 'ACT-9', title: 'Enforce MFA', type: 'Non-conformity (Minor)' }]
};
const auto = { lines: {
  'control|A.8.5': { suggest: 'Minor', tests: [{ sev: 'Minor', text: 'MFA check fails.', source: 'Posture scan' }], sample: { ids: ['u1', 'u2'], method: 'x' } },
  'control|A.8.15': { suggest: 'C', tests: [{ sev: 'pass', text: 'ok', source: 'x' }] },
  'clause|6.2': { suggest: 'OFI', tests: [{ sev: 'info', text: 'claimed', source: 'x' }] } } };
const audit = { id: 'AUD-3', planned: '2026-11-23', results: { 'control|A.8.9': { r: 'C' } } };
const plan = Lib.auditInterviewPlan(audit, wp, auto, { 'clause|9.3': { from: 'AUD-1' } }, { today: TODAY, actions: [{ id: 'ACT-9', owner: 'IT Manager' }], guidance: { 'A.8.5': { evidence: 'Conditional Access export.' } } });
const interviews = plan.slots.filter((s) => s.kind === 'interview');

test('only lines that still need a person are scheduled', () => {
  const ids = interviews.flatMap((s) => s.lines.map((l) => l.id));
  assert.deepEqual(ids.sort(), ['5.1', '6.2', 'A.5.9', 'A.8.5', 'ACT-9'].sort());
  assert.ok(!ids.includes('A.8.9'), 'recorded'); assert.ok(!ids.includes('9.3'), 'carried forward'); assert.ok(!ids.includes('A.8.15'), 'expected to conform');
});

test('the day: opening meeting, top management first, then the busiest, auditor prep, closing meeting', () => {
  assert.deepEqual(plan.slots.map((s) => s.kind), ['opening', 'interview', 'interview', 'interview', 'interview', 'prep', 'closing']);
  assert.equal(plan.slots[0].date, '2026-11-23'); assert.equal(plan.slots[0].start, '09:00');
  assert.equal(interviews[0].who, 'CEO');
  assert.equal(interviews[1].who, 'IT Manager');
  assert.equal(interviews[1].minutes, 30, '10 + 5 per line (3 lines) = 25, rounded up to 30');
  assert.ok(interviews.some((s) => s.who === 'ISMS manager (no owner recorded)'));
  for (let i = 1; i < plan.slots.length; i++) assert.equal(plan.slots[i].start, plan.slots[i - 1].end, 'back to back on one day');
});

test('questions come from what failed, the clause prompt, the evidence needed and the sample', () => {
  const it = interviews.find((s) => s.who === 'IT Manager');
  const q = it.lines.find((l) => l.id === 'A.8.5').questions;
  assert.match(q[0], /^Checkpoint found: MFA check fails\. What is the position now/);
  assert.ok(q.includes('Show me: Conditional Access export.'));
  assert.ok(q.includes('Show the records for the sample: u1, u2.'));
  assert.match(it.lines.find((l) => l.id === 'ACT-9').questions.join(' '), /What was done about ACT-9/);
  assert.match(interviews[0].lines.find((l) => l.id === '5.1').questions[0], /top management/i);
});

test('lunch comes before anything that would run past 12:30, including the closing meeting', () => {
  const four = { clauses: [], followUps: [], controls: Array.from({ length: 28 }, (_, i) => ({ id: 'A.8.' + i, title: 'c', owner: 'O' + (i % 4) })) };
  const p = Lib.auditInterviewPlan({ id: 'X', planned: '2026-11-23' }, four, { lines: {} }, {}, { today: TODAY });
  const lunch = p.slots.find((s) => s.kind === 'break');
  assert.ok(lunch, 'lunch is scheduled');
  p.slots.filter((s) => s.kind !== 'break').forEach((s) => assert.ok(s.end <= '12:30' || s.start >= lunch.end, s.kind + ' ' + s.start + '-' + s.end));
});

test('a long plan breaks for lunch and runs into the next working day, never a weekend', () => {
  const many = { clauses: [], followUps: [], controls: Array.from({ length: 60 }, (_, i) => ({ id: 'A.8.' + i, title: 'c' + i, owner: 'Owner ' + (i % 12) })) };
  const p = Lib.auditInterviewPlan({ id: 'AUD-4', planned: '2026-11-27', results: {} }, many, { lines: {} }, {}, { today: TODAY });
  assert.ok(p.slots.some((s) => s.kind === 'break'));
  assert.deepEqual(p.days, ['2026-11-27', '2026-11-30'], 'Friday, then Monday');
  p.slots.forEach((s) => assert.ok(s.end <= '17:00', s.date + ' ' + s.end));
  assert.equal(p.slots[p.slots.length - 1].kind, 'closing');
});

test('a past or missing date plans for the next working day', () => {
  assert.equal(Lib.auditInterviewPlan({ id: 'A', planned: '2026-01-01' }, wp, auto, {}, { today: TODAY }).days[0], '2026-10-26');
});

test('calendar invites: one event per meeting, each person only their own interview, questions in the description', () => {
  const all = Lib.auditInterviewIcs(plan, { id: 'AUD-3', scope: 'Clauses 4-10' });
  assert.equal((all.match(/BEGIN:VEVENT/g) || []).length, 6, 'opening, 4 interviews, closing; no lunch or prep');
  const mine = Lib.auditInterviewIcs(plan, { id: 'AUD-3', scope: 'Clauses 4-10' }, 'IT Manager');
  assert.equal((mine.match(/BEGIN:VEVENT/g) || []).length, 3);
  assert.match(mine, /DTSTART:20261123T\d{4}00\r\n/);
  assert.match(mine.replace(/\r\n /g, ''), /SUMMARY:AUD-3 Interview: IT Manager/);
  assert.match(mine.replace(/\r\n /g, ''), /Checkpoint found: MFA check fails\./);
  mine.split('\r\n').forEach((l) => assert.ok(l.length <= 75, 'folded'));
});

test('closing summary: conclusion, findings worst first with owner and due date, what worked, next steps', () => {
  const lines = [
    { key: 'control|A.8.5', kind: 'control', id: 'A.8.5', title: 'Auth' }, { key: 'control|A.8.9', kind: 'control', id: 'A.8.9', title: 'Config' },
    { key: 'clause|9.3', kind: 'clause', id: '9.3', title: 'MR' }, { key: 'clause|6.2', kind: 'clause', id: '6.2', title: 'Obj' }, { key: 'control|A.5.9', kind: 'control', id: 'A.5.9', title: 'Assets' }
  ];
  const a = { id: 'AUD-3', results: {
    'control|A.8.5': { r: 'Minor', ref: 'ACT-20', note: 'MFA gap' }, 'clause|6.2': { r: 'OFI', ref: 'ACT-21' }, 'control|A.5.9': { r: 'Major', ref: 'ACT-22' },
    'control|A.8.9': { r: 'C', auto: { suggest: 'C' } }, 'clause|9.3': { r: 'C', auto: { suggest: 'C', carried: 'AUD-1' } } } };
  const c = Lib.auditClosingSummary(a, lines, [{ id: 'ACT-20', owner: 'IT Manager', due: '2026-12-20' }], TODAY);
  assert.deepEqual(c.findings.map((f) => f.result), ['Major', 'Minor', 'OFI']);
  assert.equal(c.findings[1].owner, 'IT Manager'); assert.equal(c.findings[1].due, '2026-12-20');
  assert.deepEqual(c.tested, ['A.8.9']); assert.deepEqual(c.carried, ['9.3']);
  assert.match(c.conclusion, /does not conform: 1 major/);
  const partial = Lib.auditClosingSummary({ results: { 'control|A.8.9': { r: 'C' } } }, lines, [], TODAY);
  assert.match(partial.conclusion, /, for the 1 of 5 items audited\.$/, 'a conclusion only speaks for what was audited');
  assert.match(c.next[0], /Correct the 1 major nonconformity/);
  assert.ok(c.next.some((x) => /Clause 9\.3\.2 c/.test(x)));
});

test('the app: plan, invites, closing pack, next step, filing and summary on completion', () => {
  ['auditPlan: function ()', 'auditClosing: function ()', 'sendAuditInvites: async function', 'function auditNextStep(', 'async function afterAuditCompleted(', "fileReportAsEvidence('auditClosing', clause"].forEach((s) => assert.ok(app.includes(s), s));
  assert.match(app, /await afterAuditCompleted\(a\);/);
  assert.match(app, /'acceptAuditSuggestion', 'acceptAuditConforms', 'requestAuditEvidence', 'sendAuditInvites', 'useRetestAsEffectiveness'/);
  assert.match(app, /contentType: 'text\/calendar', contentBytes:/);
});
