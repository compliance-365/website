// An existing tenant's lists get every column the current schema has,
// not a hand-picked subset: a missing column ("Field 'PublicListed' is
// not recognized") stopped a vendor being saved on a live tenant.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const src = await readFile(new URL('../public/checkpoint/store.js', import.meta.url), 'utf8');

test('the self-heal checks every list in DEFS, with every column', () => {
  const fn = src.match(/function columnsToReconcile\(\) \{([\s\S]*?)\n  \}/);
  assert.ok(fn, 'columnsToReconcile() not found');
  assert.match(fn[1], /Object\.keys\(DEFS\)/);
  assert.match(fn[1], /DEFS\[k\]\.map\(function \(d\) \{ return d\.name; \}\)/);
  const rc = src.match(/async function reconcileColumns\(onStatus\) \{([\s\S]*?)\n  \}\n/);
  assert.ok(rc, 'reconcileColumns() not found');
  assert.match(rc[1], /columnsToReconcile\(\)/);
  assert.doesNotMatch(rc[1], /for \(var k in COLUMN_RECONCILE\)/, 'no longer limited to the hand-picked map');
  assert.match(rc[1], /Graph\.batch\(/, 'one batched schema read, not one request per list');
});

test('the Vendors schema includes the columns that were missing live', () => {
  const vendors = src.match(/\n    Vendors: \[([\s\S]*?)\n    \],/);
  assert.ok(vendors);
  for (const c of ['PublicListed', 'DataCategories', 'CalRef']) assert.match(vendors[1], new RegExp("name: '" + c + "'"));
});
