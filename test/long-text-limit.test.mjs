// SharePoint caps a one-line text column at 255 characters and rejects the
// whole save past that. Long evidence links are the usual cause, so a value
// that won't fit is caught before the save, with a message naming the limit
// and pointing to the Share menu's Copy link, which gives a short link.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const store = readFileSync(new URL('../public/checkpoint/store.js', import.meta.url), 'utf8');

function slice(from, to) { const a = store.indexOf(from), b = store.indexOf(to, a); return store.slice(a, b); }
function balanced(at) {
  let i = store.indexOf('{', at), d = 0, j = i;
  for (; j < store.length; j++) { if (store[j] === '{') d++; else if (store[j] === '}') { d--; if (!d) break; } }
  return store.slice(i, j + 1);
}
const DEFS = Function('return ' + balanced(store.indexOf('var DEFS = {')))();
const checkTextLimits = Function('DEFS', slice('  var TEXT_LIMIT = 255;', '  async function addItem(') + 'return checkTextLimits;')(DEFS);
const longUrl = 'https://contoso.sharepoint.com/:w:/r/sites/Compliance/_layouts/15/Doc.aspx?sourcedoc=%7B' + 'A'.repeat(200) + '%7D&action=default';

test('a link too long for a one-line column is stopped with the Copy link hint and the 255 limit', () => {
  assert.throws(() => checkTextLimits('Actions', { EvidenceUrl: longUrl }),
    (e) => /Copy link/.test(e.message) && /255/.test(e.message) && e.message.includes(String(longUrl.length)));
});

test('long text that is not a link names the field and the limit', () => {
  assert.throws(() => checkTextLimits('Risks', { Title: 'x'.repeat(300) }), /Title entry is 300 characters.*255/);
});

test('values that fit, and multi-line columns, save as before', () => {
  assert.doesNotThrow(() => checkTextLimits('Actions', { EvidenceUrl: 'https://' + 'a'.repeat(247) }));
  assert.doesNotThrow(() => checkTextLimits('Actions', { Evidence: 'x'.repeat(5000) }));
  assert.doesNotThrow(() => checkTextLimits('ActionUpdates', { Note: 'x'.repeat(5000), Status: 'Open' }));
});

test('every list save goes through the check', () => {
  assert.match(store, /async function addItem\(k, fields\) \{\n\s+checkTextLimits\(k, fields\);/);
  assert.match(store, /async function patchItem\(k, itemId, fields\) \{\n\s+checkTextLimits\(k, fields\);/);
});

test('the evidence link page and its function give the same advice', () => {
  const { validateSubmission } = require('../public/checkpoint/azure/EvidenceSubmit/index.js').__test;
  const r = validateSubmission({ status: 'In progress', evidenceUrl: longUrl });
  assert.equal(r.ok, false);
  assert.match(r.error, /Copy link/); assert.match(r.error, /255/);
  assert.equal(validateSubmission({ status: 'In progress', evidenceUrl: 'https://' + 'a'.repeat(247) }).ok, true);
  const page = readFileSync(new URL('../public/checkpoint/evidence.html', import.meta.url), 'utf8');
  assert.match(page, /evidenceUrl\.length > 255/); assert.match(page, /Copy link/);
});
