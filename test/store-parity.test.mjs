// Every method app.js calls on the active Store must exist on the live
// SharePoint store, not only on the demo one. A method missing from
// SpStore works in the demo and fails only in a client's tenant, which
// is how "g.savePolicyDraft is not a function" reached a live client.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
global.window = global.window || {};
window.CHECKPOINT_CONFIG = window.CHECKPOINT_CONFIG || { scopesProvision: [] };
require('../public/checkpoint/store.js');
const app = readFileSync(new URL('../public/checkpoint/app.js', import.meta.url), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

test('every Store method app.js calls exists on SpStore', () => {
  const called = new Set([...app.matchAll(/\bStore\.([A-Za-z0-9_]+)\(/g)].map((m) => m[1]));
  const sp = new Set(Object.keys(window.SpStore));
  const missing = [...called].filter((k) => !sp.has(k));
  assert.deepEqual(missing, [], 'called on Store but missing from SpStore: ' + missing.join(', '));
});

test('savePolicyDraft: SharePoint in the live store, localStorage in the demo', () => {
  const sp = window.SpStore.savePolicyDraft.toString();
  assert.match(sp, /patchItem\('PolicyDrafts'/);
  assert.match(sp, /addItem\('PolicyDrafts'/);
  assert.match(sp, /_clearedPolicyDrafts/, 'reuses a reset draft\'s list item instead of adding a duplicate');
  const demo = window.DemoStore.savePolicyDraft.toString();
  assert.match(demo, /persist\(\)/);
  assert.doesNotMatch(demo, /patchItem|addItem/);
  const src = readFileSync(new URL('../public/checkpoint/store.js', import.meta.url), 'utf8');
  assert.equal((src.match(/savePolicyDraft: async function/g) || []).length, 2, 'one per store');
});

test('no duplicate keys in any object literal (a duplicate silently replaces the first)', async () => {
  const { buildSync } = await import('esbuild');
  const { readdirSync } = await import('node:fs');
  const dir = new URL('../public/checkpoint/', import.meta.url).pathname;
  const files = readdirSync(dir).filter((f) => f.endsWith('.js') && !f.endsWith('.min.js')).map((f) => dir + f);
  for (const f of files) {
    const r = buildSync({ entryPoints: [f], write: false, logLevel: 'silent' });
    const dups = r.warnings.filter((w) => w.id === 'duplicate-object-key' || /Duplicate key/.test(w.text));
    assert.deepEqual(dups.map((w) => `${w.location && w.location.line}: ${w.text}`), [], f);
  }
});
