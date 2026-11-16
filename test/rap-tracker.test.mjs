/* RAP Tracker prototype (public/rap/): deliverables from the template,
   key dates, the dashboard summary, the progress report and the
   SharePoint field mapping. */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const L = require('../public/rap/rap-lib.js');
const html = readFileSync(new URL('../public/rap/index.html', import.meta.url), 'utf8');

describe('template', () => {
  test('every row names a real area, at least one RAP type and when it is due', () => {
    for (const t of L.TEMPLATE) {
      assert.ok(L.AREAS.includes(t.area), t.deliverable);
      assert.ok(t.types.length && t.types.every((k) => L.RAP_TYPES[k]), t.deliverable);
      assert.ok(t.due || t.annual || t.endOffset, t.deliverable);
    }
  });
  test('higher RAP types carry more deliverables, never fewer', () => {
    const n = (k) => L.TEMPLATE.filter((t) => t.types.includes(k)).length;
    assert.ok(n('reflect') < n('innovate') && n('innovate') < n('stretch') && n('stretch') <= n('elevate'));
  });
});

describe('buildDeliverables', () => {
  const rows = L.buildDeliverables('innovate', '2026-03-01', '2028-03-01');
  test('annual deliverables repeat once a year inside the term', () => {
    const nrw = rows.filter((r) => r.deliverable.startsWith('Circulate Reconciliation Australia'));
    assert.deepEqual(nrw.map((r) => r.due), ['2026-06-03', '2027-06-03']);
    assert.match(nrw[0].deliverable, /\(2026\)$/);
  });
  test('one-off deliverables fall the stated months after the start, the renewal six months before the end', () => {
    assert.equal(rows.find((r) => r.deliverable.startsWith('Form a RWG')).due, '2026-04-01');
    assert.equal(rows.find((r) => r.deliverable.startsWith('Begin developing our next RAP')).due, '2027-09-01');
  });
  test('sorted by due date, numbered, unowned and not started', () => {
    assert.deepEqual(rows.map((r) => r.due), rows.map((r) => r.due).slice().sort());
    assert.equal(new Set(rows.map((r) => r.ref)).size, rows.length);
    assert.ok(rows.every((r) => r.status === 'Not started' && r.owner === ''));
  });
  test('a Reflect RAP leaves out the Stretch targets', () => {
    assert.ok(!L.buildDeliverables('reflect', '2026-01-01', '2027-07-01').some((r) => /measurable target/.test(r.deliverable)));
  });
});

describe('dates', () => {
  test('month arithmetic keeps the last day of a short month', () => {
    assert.equal(L.addMonths('2026-01-31', 1), '2026-02-28');
    assert.equal(L.defaultEnd('innovate', '2026-03-01'), '2028-03-01');
  });
  test('NRW is 27 May to 3 June; NAIDOC starts on the first Sunday in July and is marked an estimate', () => {
    assert.deepEqual(L.eventDates('nrw', 2027), { start: '2027-05-27', end: '2027-06-03', estimate: false });
    const n = L.eventDates('naidoc', 2026);
    assert.equal(new Date(n.start + 'T00:00:00Z').getUTCDay(), 0);
    assert.equal(n.start.slice(0, 7), '2026-07');
    assert.equal(n.estimate, true);
  });
  test('key dates cover the term, the renewal point and custom dates, in order', () => {
    const k = L.keyDates({ start: '2026-03-01', end: '2027-03-01' }, [{ id: 'x', title: 'Board briefing', date: '2026-08-01' }]);
    assert.deepEqual(k.map((d) => d.date), k.map((d) => d.date).slice().sort());
    assert.ok(k.some((d) => d.kind === 'end' && d.date === '2027-03-01'));
    assert.ok(k.some((d) => d.kind === 'renewal' && d.date === '2026-09-01'));
    assert.ok(k.some((d) => d.title === 'Board briefing'));
  });
});

describe('summary and report', () => {
  const d = [
    { ref: 'D-1', area: 'Relationships', deliverable: 'A', due: '2026-01-01', status: 'Complete', owner: 'X', completed: '2026-01-01' },
    { ref: 'D-2', area: 'Respect', deliverable: 'B', due: '2026-02-01', status: 'In progress', owner: '' },
    { ref: 'D-3', area: 'Respect', deliverable: 'C', due: '2026-03-20', status: 'Not started', owner: 'Y' },
    { ref: 'D-4', area: 'Governance', deliverable: 'D', due: '2026-02-01', status: 'Deferred', owner: '' }
  ];
  test('counts overdue, due within 30 days and unowned; deferred is left out of the percentage', () => {
    const s = L.summary(d, '2026-03-01');
    assert.deepEqual(s.overdue.map((x) => x.ref), ['D-2']);
    assert.deepEqual(s.dueSoon.map((x) => x.ref), ['D-3']);
    assert.deepEqual(s.noOwner.map((x) => x.ref), ['D-2']);
    assert.equal(s.pct, 33);
  });
  test('the progress report says what is overdue and flags fewer than four meetings a year', () => {
    const r = L.progressReport({ name: 'Acme Innovate RAP', type: 'innovate', start: '2025-06-01', end: '2027-06-01' }, d, [{ date: '2026-02-01' }], '2026-03-01');
    const text = r.flatMap((s) => s.lines).join('\n');
    assert.match(text, /Acme Innovate RAP is an Innovate RAP running from 2025-06-01 to 2027-06-01\./);
    assert.match(text, /D-2: B Due 2026-02-01, no owner\./);
    assert.match(text, /1 meeting held in the last 12 months, below the four a year/);
  });
});

describe('SharePoint mapping', () => {
  test('a deliverable round-trips through list fields, dates as ISO text', () => {
    const rec = { deliverable: 'Hold an NRW event', ref: 'D-007', area: 'Relationships', action: 'Build relationships', due: '2026-06-03', role: 'Comms', owner: 'J', status: 'In progress', completed: '', notes: 'n', evidence: 'https://x' };
    const f = L.toFields('deliverables', rec);
    assert.equal(f.Title, 'Hold an NRW event');
    assert.equal(f.DueDate, '2026-06-03');
    assert.deepEqual(L.fromFields('deliverables', f, 12), Object.assign({ id: '12' }, rec));
  });
  test('the RAP type is stored by name and read back as its key', () => {
    assert.equal(L.toFields('plans', { type: 'stretch' }).RapType, 'Stretch');
    assert.equal(L.fromFields('plans', { RapType: 'Stretch' }, 1).type, 'stretch');
  });
  test('every mapped field is a column the app creates (or Title)', () => {
    for (const kind of Object.keys(L.MAP)) {
      const cols = new Set(L.LISTS[kind].columns.map((c) => c.name).concat('Title'));
      for (const field of Object.values(L.MAP[kind])) assert.ok(cols.has(field), kind + '.' + field);
    }
  });
  test('reads a site address, and refuses anything that is not SharePoint', () => {
    assert.deepEqual(L.siteRef('https://compliance365562.sharepoint.com/sites/RAPHub/Lists/RAP%20Tracker/AllItems.aspx'), { host: 'compliance365562.sharepoint.com', path: '/sites/RAPHub' });
    assert.equal(L.siteRef('https://example.com/sites/x'), null);
  });
});

describe('page', () => {
  test('kept out of search, no third-party scripts, Checkpoint\'s sign-in settings by absolute path', () => {
    assert.match(html, /<meta name="robots" content="noindex,nofollow">/);
    assert.match(html, /script-src 'self';/);
    assert.match(html, /<script src="\/checkpoint\/config\.js"><\/script>/);
    assert.match(html, /the sample deliverables follow the structure of Reconciliation Australia's RAP templates but are not their wording/i);
  });
});
