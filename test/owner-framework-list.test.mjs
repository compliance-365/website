// The owner console keeps its own small copy of the framework list (it
// deliberately doesn't load the client bundle). That copy once fell
// three frameworks behind (RFFR, CPS 234, Privacy Act), which meant
// they could not be ticked on the New client form. This keeps it in
// step with store.js, the CLI and the signing Lambda.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { VALID_FRAMEWORKS as SIGN_VALID } from '../lambda/sign.js';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const arrayFrom = (src, re) => JSON.parse(src.match(re)[1].replace(/'/g, '"'));

const storeOrder = arrayFrom(read('../public/checkpoint/store.js'), /window\.FRAMEWORK_ORDER = (\[[^\]]*\])/);
const ownerSrc = read('../public/owner/owner.js');
const ownerOrder = arrayFrom(ownerSrc, /var FRAMEWORK_ORDER = (\[[^\]]*\])/);
const cliValid = arrayFrom(read('../tools/issue-entitlement.mjs'), /const VALID_FRAMEWORKS = (\[[^\]]*\])/);

test('the owner console lists exactly the frameworks the app has, in the same order', () => {
  assert.deepEqual(ownerOrder, storeOrder);
});

test('every framework has a display name in the owner console', () => {
  for (const fw of storeOrder) assert.match(ownerSrc, new RegExp('\\b' + fw + ": '[^']+'"), fw + ' has no name in FRAMEWORK_NAMES');
});

test('every framework can be issued by the CLI and the signing Lambda', () => {
  for (const fw of storeOrder) {
    assert.ok(cliValid.includes(fw), fw + ' missing from the CLI');
    assert.ok(SIGN_VALID.includes(fw), fw + ' missing from lambda/sign.js');
  }
});
