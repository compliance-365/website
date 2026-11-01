// Automated decisions checker: the APP 1.7-1.9 test is three parts, all
// required, and "computer program" is wider than AI. A system is only in
// the draft wording when it is caught.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assess, draftPolicy, daysUntilDeadline, DEADLINE } from '../src/data/automated-decisions.js';

const sys = (o) => ({ id: 'x', name: 'Recruitment screening', role: 'solely', significant: 'yes', info: ['Employment history'], ...o });

test('caught only when all three parts are true', () => {
  assert.equal(assess(sys()).caught, true);
  assert.equal(assess(sys({ role: 'assists' })).caught, true);
  assert.equal(assess(sys({ role: 'minor' })).caught, false);
  assert.equal(assess(sys({ significant: 'no' })).caught, false);
  assert.equal(assess(sys({ info: [] })).caught, false);
});

test('"not sure" about significance is treated as caught, flagged uncertain', () => {
  const a = assess(sys({ significant: 'unsure' }));
  assert.equal(a.caught, true);
  assert.equal(a.certain, false);
});

test('draft wording splits solely-made and assisted decisions, lists info kinds once', () => {
  const d = draftPolicy([
    sys(),
    sys({ id: 'y', name: 'Credit, payment terms or account approval', role: 'assists', info: ['Financial and credit information', 'Employment history'] }),
    sys({ id: 'z', name: 'Fraud or risk flags', significant: 'no' }),
  ]);
  assert.match(d, /made solely by a computer program: recruitment screening\./);
  assert.match(d, /substantially and directly helps us make: credit, payment terms or account approval\./);
  assert.match(d, /employment history and financial and credit information\./);
  assert.doesNotMatch(d, /fraud/i, 'a system that is not caught is not described');
  assert.match(d, /rule-based/, 'wording does not imply AI only');
  assert.equal(draftPolicy([sys({ role: 'minor' })]), null);
});

test('deadline is 10 December 2026', () => {
  assert.equal(DEADLINE, '2026-12-10');
  assert.equal(daysUntilDeadline(new Date(2026, 10, 1)), 39);
  assert.equal(daysUntilDeadline(new Date(2026, 11, 10)), 0);
});
