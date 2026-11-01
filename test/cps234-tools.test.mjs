// CPS 234 self-assessment and notification calculator. The facts pinned
// here are the expensive ones to get wrong: 24 requirements from ¶13 to
// ¶36, and two DIFFERENT notification clocks (72 elapsed hours vs 10
// business days, the day of awareness not counted).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { QUESTIONS, DOMAINS, score } from '../src/data/cps234-self-assessment.js';
import { deadlines, easterSunday, ymd } from '../src/data/apra-notification-clock.js';

test('one question per paragraph, 13 to 36, no gaps or extras', () => {
  assert.deepEqual(QUESTIONS.map((q) => q.p), Array.from({ length: 24 }, (_, i) => i + 13));
  assert.equal(DOMAINS.length, 9);
});

test('domains match the CPS 234 service page paragraph ranges', () => {
  const page = readFileSync(new URL('../src/pages/services/cps234.astro', import.meta.url), 'utf8');
  for (const d of DOMAINS) {
    const ps = d.questions.map((q) => q.p);
    const range = ps.length === 1 ? `¶${ps[0]}` : `¶${ps[0]}–${ps[ps.length - 1]}`;
    assert.ok(page.includes(`n: '${d.name}', p: '${range}'`), `${d.name} ${range}`);
  }
});

test('notification questions carry the right clock', () => {
  assert.match(QUESTIONS.find((q) => q.p === 35).q, /72 hours/);
  assert.match(QUESTIONS.find((q) => q.p === 36).q, /10 business days/);
  assert.doesNotMatch(QUESTIONS.find((q) => q.p === 36).q, /72/);
});

test('scoring: all yes is 100, all no is 0, partly is half, gaps ordered', () => {
  const all = (v) => Object.fromEntries(QUESTIONS.map((q) => [q.p, v]));
  assert.equal(score(all('yes')).pct, 100);
  assert.equal(score(all('yes')).band.id, 'strong');
  assert.equal(score(all('no')).pct, 0);
  assert.equal(score(all('partly')).pct, 50);
  assert.equal(score(all('unsure')).gaps.length, 24);
  const r = score({ 13: 'partly', 36: 'no', 20: 'yes' });
  assert.equal(r.answered, 3);
  assert.equal(r.complete, false);
  assert.deepEqual(r.gaps.map((g) => g.p), [36, 13], '"No" before "Partly"');
  assert.match(r.gaps[0].callout, /No incident|no incident/i);
});

test('Easter dates', () => {
  assert.equal(ymd(easterSunday(2026)), '2026-04-05');
  assert.equal(ymd(easterSunday(2027)), '2027-03-28');
  assert.equal(ymd(easterSunday(2025)), '2025-04-20');
});

test('72 hours is elapsed time, weekends included', () => {
  const aware = new Date(2026, 10, 6, 15, 30); // Fri 6 Nov 2026, 3:30pm
  const r = deadlines(aware);
  assert.equal(r.incident.getTime() - aware.getTime(), 72 * 3600 * 1000);
});

test('10 business days: awareness day not counted, weekends skipped', () => {
  // Aware Monday 2 Nov 2026 -> 10th business day is Monday 16 Nov.
  assert.equal(deadlines(new Date(2026, 10, 2, 9, 0)).weaknessDate, '2026-11-16');
  // Aware Saturday 7 Nov -> Mon 9 is day 1 -> Fri 20 Nov is day 10.
  assert.equal(deadlines(new Date(2026, 10, 7, 9, 0)).weaknessDate, '2026-11-20');
  const r = deadlines(new Date(2026, 10, 2, 9, 0));
  assert.equal(r.businessDays.length, 10);
  assert.equal(r.weakness.getHours(), 23);
});

test('national holidays are listed, and only skipped when asked', () => {
  // Aware Mon 21 Dec 2026: Christmas (Fri) and Boxing Day (Sat) fall in the window.
  const off = deadlines(new Date(2026, 11, 21, 9, 0));
  const on = deadlines(new Date(2026, 11, 21, 9, 0), { skipNationalHolidays: true });
  assert.ok(off.holidaysInWindow.some((h) => h.name === 'Christmas Day'));
  assert.equal(off.weaknessDate, '2027-01-04', 'conservative: Christmas counted');
  assert.equal(on.weaknessDate, '2027-01-06', 'Christmas and New Year skipped');
  assert.ok(on.weaknessDate > off.weaknessDate, 'skipping holidays can only push the deadline later');
});
