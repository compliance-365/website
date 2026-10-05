/* An organisation's own document standing in for a Checkpoint one:
   which generated copies it retires and which evidence links move. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import Lib from '../public/checkpoint/lib.js';

const own = { id: 'o1', name: 'MineGuard ISP.docx', url: 'https://x/own', origin: 'own', tplId: 'infosec-policy', status: 'Approved' };
const gen = { id: 'g1', name: 'Information Security Policy.html', url: 'https://x/gen', tplId: 'infosec-policy', status: 'Approved' };
const docs = [own, gen,
  { id: 'g2', name: 'Old ISP.html', url: 'https://x/old', tplId: 'infosec-policy', status: 'Superseded' },
  { id: 'g3', name: 'Access Control Policy.html', url: 'https://x/acp', tplId: 'access-control-policy', status: 'Approved' }];

test('retires the live generated copy of the same template only', () => {
  const plan = Lib.ownDocumentReplacement(own, docs, [], []);
  assert.deepEqual(plan.supersede.map((d) => d.id), ['g1']);
});

test('moves evidence links that point at the retired copy', () => {
  const controls = [{ fw: 'iso27001', id: 'A.5.1', evidenceUrl: 'https://x/gen' }, { fw: 'iso27001', id: 'A.5.15', evidenceUrl: 'https://x/acp' }];
  const clauses = [{ fw: 'iso27001', id: '5.2', evidenceUrl: 'https://x/gen' }, { fw: 'iso27001', id: '4.3', evidenceUrl: '' }];
  const plan = Lib.ownDocumentReplacement(own, docs, controls, clauses);
  assert.deepEqual(plan.repoint.map((r) => r.kind + ':' + r.item.id), ['control:A.5.1', 'clause:5.2']);
});

test('does nothing for a generated document or a plain upload', () => {
  assert.deepEqual(Lib.ownDocumentReplacement(gen, docs, [], []), { supersede: [], repoint: [] });
  assert.deepEqual(Lib.ownDocumentReplacement({ id: 'u', origin: '', tplId: '' }, docs, [], []), { supersede: [], repoint: [] });
});

test('the register stores the origin, and own documents skip template rendering', () => {
  const store = readFileSync(new URL('../public/checkpoint/store.js', import.meta.url), 'utf8');
  const app = readFileSync(new URL('../public/checkpoint/app.js', import.meta.url), 'utf8');
  assert.match(store, /\{ name: 'DocOrigin', text: \{\} \}/);
  assert.match(store, /tplId: 'DocTplId', origin: 'DocOrigin'/);
  assert.match(app, /if \(isOwnDoc\(d\)\) return null;/, 'export-all skips own documents');
  assert.match(app, /!isOwnDoc\(d\) && \(d\.tplId \|\| templateDraftStatus\(d\.name\)\)/, 'no Edit text on own documents');
  assert.match(app, /applyClauseDocumentUpdates\(d\.tplId, d\.url, approved \? 'approved' : 'generated'\)/);
});
