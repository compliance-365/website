/* Bringing an existing ISMS across: the Statement of Applicability
   import (lib planSoaImport) and the Dashboard checklist for an
   organisation that is already certified (lib ismsTransferSteps). */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import Lib from '../public/checkpoint/lib.js';

const app = readFileSync(new URL('../public/checkpoint/app.js', import.meta.url), 'utf8');
const store = readFileSync(new URL('../public/checkpoint/store.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../public/checkpoint/index.html', import.meta.url), 'utf8');

const controls = () => [
  { fw: 'iso27001', id: 'A.5.1', app: true, st: 'Not started', own: '', just: '', evidenceUrl: '' },
  { fw: 'iso27001', id: 'A.5.15', app: true, st: 'Not started', own: '' },
  { fw: 'iso27001', id: 'A.7.4', app: true, st: 'In progress', own: 'Facilities' },
  { fw: 'iso27001', id: 'A.8.2', app: true, st: 'Implemented', own: 'IT' },
  { fw: 'soc2', id: 'A.5.1', app: true, st: 'Not started' }
];
const csv = (rows) => rows.map((r) => r.join(',')).join('\n');

describe('SoA import', () => {
  test('updates only the fields the file carries, and only where they differ', () => {
    const p = Lib.planSoaImport(csv([
      ['Control', 'Applicable', 'Justification', 'Implementation status', 'Control owner', 'Evidence'],
      ['A.5.1', 'Yes', 'Sets direction for R-001', 'Implemented', 'ISMS Manager', 'https://x.sharepoint.com/policy.pdf'],
      ['A.8.2', 'Yes', '', 'Implemented', 'IT', '']
    ]), controls(), 'iso27001');
    assert.equal(p.error, undefined);
    assert.deepEqual(p.changes.map((c) => [c.control.id, c.set]), [['A.5.1', { st: 'Implemented', incl: 'Sets direction for R-001', own: 'ISMS Manager', evidenceUrl: 'https://x.sharepoint.com/policy.pdf' }]]);
    assert.equal(p.unchanged, 1);
    assert.equal(p.changes[0].control.fw, 'iso27001', 'never a same-numbered control of another framework');
  });
  test('an excluded row records the exclusion reason, separate from the inclusion reason', () => {
    const p = Lib.planSoaImport(csv([['Ref', 'Applicability', 'Reason'], ['A.7.4', 'No', 'No premises: fully remote'], ['A.5.15', 'N/A', '']]), controls(), 'iso27001');
    assert.deepEqual(p.changes.map((c) => [c.control.id, c.set]), [
      ['A.7.4', { app: false, st: 'Not applicable', just: 'No premises: fully remote' }],
      ['A.5.15', { app: false, st: 'Not applicable' }]]);
    assert.deepEqual(p.excludedNoReason, ['A.5.15'], 'an exclusion without a reason is flagged, as an auditor would');
  });
  test('reads the code however the spreadsheet writes it, and reports what it cannot place', () => {
    const p = Lib.planSoaImport(csv([['Control', 'Status'], ['a.5.1', 'Done'], ['5.15 Access control', 'Partially implemented'], ['A.9.2.1', 'Implemented'], ['A.5.1', 'Planned']]), controls(), 'iso27001');
    assert.deepEqual(p.changes.map((c) => [c.control.id, c.set.st]), [['A.5.1', 'Implemented'], ['A.5.15', 'In progress']]);
    assert.deepEqual(p.unknown.map((u) => u.code), ['A.9.2.1'], 'a 2013 code is not guessed onto a 2022 control');
    assert.match(p.skipped[0].reason, /A\.5\.1 repeats line 2/);
    assert.equal(Lib.soaControlFor('A.5.15', controls(), 'iso27001').id, 'A.5.15', 'A.5.1 never claims A.5.15');
  });
  test('a status or applicability it does not understand is skipped, not guessed', () => {
    const p = Lib.planSoaImport(csv([['Control', 'Applicable', 'Status'], ['A.5.1', 'Maybe', ''], ['A.8.2', 'Yes', 'Sort of']]), controls(), 'iso27001');
    assert.equal(p.changes.length, 0);
    assert.equal(p.skipped.length, 2);
  });
  test('evidence that is not a https link is left out and counted', () => {
    const p = Lib.planSoaImport(csv([['Control', 'Evidence'], ['A.5.1', 'SharePoint folder'], ['A.5.15', 'http://x/y']]), controls(), 'iso27001');
    assert.equal(p.changes.length, 0);
    assert.equal(p.evidenceNotLink, 2);
  });
  test('a missing control column is an error the app turns into a column picker', () => {
    const p = Lib.planSoaImport(csv([['Name', 'Status'], ['Policies', 'Implemented']]), controls(), 'iso27001');
    assert.deepEqual(p.missingRequired, ['Control']);
  });
  test('a recorded inclusion reason leads the justification for inclusion', () => {
    assert.deepEqual(Lib.soaInclusionReasons({ id: 'A.5.1', app: true, incl: 'Contract with Acme' }, {}), ['Recorded: Contract with Acme']);
    assert.match(Lib.soaInclusionReasons({ id: 'A.5.1', app: true, just: 'old exclusion reason' }, {})[0], /^Baseline/, 'the exclusion Justification is still never cited');
  });
});

describe('existing ISMS checklist', () => {
  test('each step is done from the tenant\'s own data', () => {
    const none = Lib.ismsTransferSteps({});
    assert.deepEqual(none.map((s) => s.id), ['cert', 'soa', 'risks', 'vendors', 'actions', 'docs', 'scan']);
    assert.ok(none.every((s) => !s.done && s.action && s.cta));
    const all = Lib.ismsTransferSteps({ certIssued: true, soaImported: true, risks: 3, vendors: 2, actions: 1, approvedDocs: 4, scans: 1 });
    assert.ok(all.every((s) => s.done));
  });
});

describe('wiring', () => {
  test('the SoA screen offers the import, gated for viewers', () => {
    assert.match(html, /data-action="App\.importSoa">Import SoA — this framework<\/button>/);
    assert.match(app, /'importCsv', 'importSoa', 'setIsmsStart',/);
    assert.match(app, /var EXPORT_ACTIONS = \[[^\]]*'App\.importSoa'\]/);
  });
  test('the inclusion reason has its own column, reconciled onto existing tenants', () => {
    assert.match(store, /\{ name: 'InclusionNote', text: \{ allowMultipleLines: true \} \}/);
    assert.match(store, /Controls: \[[^\]]*'VerifiedBy', 'InclusionNote'\]/);
    assert.match(store, /InclusionNote: c\.incl \|\| ''/);
  });
  test('the Dashboard asks once, and an existing ISMS skips the build-from-scratch path', () => {
    assert.match(html, /id="ismsTransferCard"/);
    assert.match(app, /if \(ismsStart\(\) === 'existing'\) \{ el\.style\.display = 'none'; return; \}/);
    assert.match(app, /if \(mode === 'new' \|\| mode === 'done' \|\| \(!mode && certified\)\)/);
  });
});
