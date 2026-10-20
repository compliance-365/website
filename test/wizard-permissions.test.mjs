import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/* The setup wizard's "Before you sign in" step lists every permission
   Checkpoint asks Microsoft for, with the reason. Nine of them had no
   reason written and showed only "Used by a posture check.", which is
   the one place a cautious IT admin decides whether to approve. Every
   sign-in scope must carry its own explanation. */

test('every sign-in permission has its own explanation in the wizard', () => {
  const config = readFileSync('public/checkpoint/config.js', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const block = config.match(/scopesReadOnly:\s*\[([\s\S]*?)\]/);
  assert.ok(block, 'scopesReadOnly not found');
  const scopes = [...block[1].matchAll(/'([A-Za-z.]+)'/g)].map((m) => m[1]);
  assert.ok(scopes.length > 10, 'expected the full scope list');

  const app = readFileSync('public/checkpoint/app.js', 'utf8');
  const why = app.match(/var WIZARD_PERM_WHY = \{([\s\S]*?)\n {2}\};/);
  assert.ok(why, 'WIZARD_PERM_WHY not found');
  const explained = new Set([...why[1].matchAll(/'([A-Za-z.]+)':/g)].map((m) => m[1]));
  assert.deepEqual(scopes.filter((s) => !explained.has(s)), []);
});
