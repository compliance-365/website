// ISO 42001's Annex A controls need their own evidence: their maps to
// ISO 27001 are related requirements (the AI policy beside the
// information security policy), not the same control. A status or an
// evidence link never crosses into or out of them, and evidence copied
// across before this rule existed is found and can be removed.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
global.window = global.window || {};
const L = require('../public/checkpoint/lib.js');
const app = readFileSync(new URL('../public/checkpoint/app.js', import.meta.url), 'utf8');

const ISP = 'https://t.sharepoint.com/Documents/Information%20Security%20Policy.docx';
const controls = () => [
  { fw: 'iso27001', id: 'A.5.1', app: true, st: 'Implemented', evidenceUrl: ISP },
  { fw: 'iso42001', id: 'AI.2.2', app: true, st: 'Not started', map: 'ISO27001 A.5.1 · EU AI Act Art.9' },
  { fw: 'iso42001', id: 'AI.2.3', app: true, st: 'Implemented', evidenceUrl: ISP, map: 'ISO27001 A.5.1' },
  { fw: 'iso42001', id: 'AI.3.2', app: true, st: 'Implemented', evidenceUrl: 'https://t.sharepoint.com/AI%20roles.docx', map: 'ISO27001 A.5.2' },
  { fw: 'soc2', id: 'CC1.1', app: true, st: 'Not started', map: 'ISO27001 A.5.1' }
];
const ctx = (c) => ({ controls: c, entitlements: { iso27001: true, iso42001: true, soc2: true } });

describe('ISO 42001 controls keep their own evidence', () => {
  test('an ISO 27001 control no longer proposes its status to ISO 42001; other frameworks still get it', () => {
    const c = controls();
    const out = L.crossFrameworkStatusSuggestions(c[0], ctx(c)).map((x) => x.fw + '|' + x.code);
    assert.deepEqual(out, ['soc2|CC1.1']);
  });
  test('an ISO 42001 control proposes nothing to other frameworks', () => {
    const c = controls();
    assert.deepEqual(L.crossFrameworkStatusSuggestions(c[3], ctx(c)), []);
  });
  test('evidence already copied across is found; a control with its own evidence is not', () => {
    const found = L.copiedAcrossEvidence(controls()).map((x) => x.control.id + '<-' + x.from.id);
    assert.deepEqual(found, ['AI.2.3<-A.5.1']);
  });
  test('the SoA offers to remove it, putting the status back from the audit log', () => {
    assert.match(app, /function copiedEvidenceNotice\(fw\)/);
    assert.match(app, /removeCopiedEvidence: async function \(\)/);
    assert.match(app, /\/cross-framework\/\.test\(e\.after \|\| ''\)/);
    assert.match(app, /'removeCopiedEvidence', /, 'gated for viewers');
  });
});
