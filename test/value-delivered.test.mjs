// valueDelivered() in lib.js — the "what Checkpoint did for you" panel.
// Its hours estimate is shown to clients at renewal, so the counting
// rules (scans at most once a week, only automated status changes,
// period filtering) are pinned here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { valueDelivered, VALUE_HOURS } = require('../public/checkpoint/lib.js');

const log = (action, date, extra = {}) => ({ action, entryDateTime: date + 'T09:00:00Z', ...extra });

test('scans count once per week however often they run', () => {
  const scans = ['2026-09-07', '2026-09-08', '2026-09-09', '2026-09-15'].map((date) => ({ date, detail: JSON.stringify({ results: { a: 1, b: 2 } }) }));
  const v = valueDelivered({ scans }, '');
  const item = v.items.find((i) => i.key === 'scans');
  assert.equal(item.count, 4);
  assert.equal(item.detail, '8 checks run, in 2 weeks');
  assert.equal(item.hours, 2 * VALUE_HOURS.scanWeek);
});

test('only automated control and clause changes count, not manual edits', () => {
  const auditLog = [
    log('Control status changed', '2026-09-01', { after: 'Implemented (policy approved)' }),
    log('Clause status changed', '2026-09-01', { after: 'Implemented (automated: Approved ISMS Scope)' }),
    log('Control status changed', '2026-09-01', { after: 'Implemented (scan-suggested, practitioner-confirmed)' }),
    log('Control status changed', '2026-09-01', { after: 'Implemented' })
  ];
  assert.equal(valueDelivered({ auditLog }, '').items.find((i) => i.key === 'status').count, 3);
});

test('reads answer counts, weights reports by type, and filters by period', () => {
  const auditLog = [
    log('Questionnaire assistant run', '2026-09-01', { after: '40 question(s) answered' }),
    log('Questionnaire answers drafted with AI', '2026-09-02', { after: '10 drafted, 2 failed' }),
    log('Report generated', '2026-09-03', { targetId: 'workpack' }),
    log('Report generated', '2026-09-03', { targetId: 'exec' }),
    log('Policy template generated', '2025-01-01')
  ];
  const v = valueDelivered({ auditLog }, '2026-01-01');
  assert.equal(v.items.find((i) => i.key === 'questionnaires').count, 50);
  assert.equal(v.items.find((i) => i.key === 'reports').hours, VALUE_HOURS.workpack + VALUE_HOURS.report);
  assert.equal(v.items.find((i) => i.key === 'documents'), undefined, 'out-of-period entry ignored, empty lines dropped');
  assert.equal(v.hours, Math.round(50 * VALUE_HOURS.questionnaireAnswer + VALUE_HOURS.workpack + VALUE_HOURS.report));
});

test('nothing done yields no lines and zero hours', () => {
  assert.deepEqual(valueDelivered({}, '2026-01-01'), { items: [], hours: 0, since: '2026-01-01' });
});
