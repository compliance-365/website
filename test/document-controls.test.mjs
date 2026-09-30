// A few controls ARE an approved document (A.5.1 policies, A.5.2 roles,
// A.5.10 acceptable use, A.5.24 incident planning, their ISO 27701 and
// ISO 42001 counterparts). Approving the document implements them; every
// other linked control stays In progress until evidence shows it operating.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
global.window = global.window || {};
const Lib = require('../public/checkpoint/lib.js');
require('../public/checkpoint/templates.js');
const app = readFileSync(new URL('../public/checkpoint/app.js', import.meta.url), 'utf8');

test('the short list, and each code is one its template already links', () => {
  const m = Lib.DOCUMENT_IMPLEMENTED_CONTROLS;
  assert.deepEqual(Object.keys(m).sort(), ['acceptable-use-policy', 'ai-policy', 'incident-response-plan', 'infosec-policy', 'roles-responsibilities']);
  Object.entries(m).forEach(([id, codes]) => {
    const t = window.POLICY_TEMPLATES.find((x) => x.id === id);
    codes.forEach((c) => assert.ok(t.controls.includes(c), id + ' links ' + c));
  });
  assert.ok(!Object.values(m).flat().includes('A.8.24'), 'a policy is not encrypted devices');
});

test('only applicable, not-yet-implemented controls without other evidence', () => {
  const url = 'https://x/Information Security Policy.html';
  const controls = [
    { id: 'A.5.1', app: true, st: 'In progress', evidenceUrl: url },
    { id: 'A.5.4', app: true, st: 'In progress', evidenceUrl: url },
    { id: 'A.3.3', app: false, st: 'Not applicable' },
    { id: 'A.5.2', app: true, st: 'In progress', evidenceUrl: 'https://other' }
  ];
  assert.deepEqual(Lib.controlsImplementedByDocument('infosec-policy', controls, url).map((c) => c.id), ['A.5.1']);
  assert.deepEqual(Lib.controlsImplementedByDocument('infosec-policy', [{ id: 'A.5.1', app: true, st: 'Implemented' }], url), []);
  assert.deepEqual(Lib.controlsImplementedByDocument('cryptography-policy', [{ id: 'A.8.24', app: true, st: 'In progress' }], url), []);
});

test('runs on approval and backfills documents approved earlier', () => {
  assert.match(app, /if \(approvedDoc && approvedDoc\.url\) implementDocumentControls\(t\.id, approvedDoc\.url, vals\.approvedBy,/);
  assert.match(app, /window\._docs = docs;\n\s+implementControlsFromApprovedDocuments\(docs\);/);
  assert.match(app, /if \(!S \|\| !S\.controls \|\| READONLY\) return 0;/);
  assert.match(app, /'Implemented \(approved document is the control\)'/);
});
