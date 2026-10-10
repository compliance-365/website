// Sign-in: a returning browser goes straight to Microsoft (no set-up
// welcome or permissions explainer, no account picker), the wait shows
// three plain steps, and the licence probes neither queue nor retry.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const f = (n) => readFileSync(new URL('../public/checkpoint/' + n, import.meta.url), 'utf8');
const app = f('app.js'), graph = f('graph.js'), store = f('store.js'), html = f('index.html');

test('returning users skip the wizard and the account picker', () => {
  const signIn = app.slice(app.indexOf('    signIn: function () {'), app.indexOf('    showSignInPermissions:'));
  assert.doesNotMatch(signIn, /Wizard\.start\(\)/, 'Sign in never opens the set-up welcome');
  assert.match(signIn, /Graph\.signIn\(\{ selectAccount: !signedInBefore\(\) \}\)/);
  assert.match(app, /showSignInPermissions: function \(\) \{ Wizard\.start\(\); \}/);
  assert.match(html, /data-action="App\.showSignInPermissions">See exactly what Checkpoint asks for</);
  assert.match(app, /localStorage\.setItem\('cpSignedInBefore', '1'\)/);
  assert.match(graph, /if \(!opts \|\| opts\.selectAccount !== false\) req\.prompt = 'select_account';/);
  assert.match(html, /id="btnGateOtherAccount"[^>]*data-action="App\.signInOtherAccount">Use a different account</);
});

test('the wait is three plain steps, not technical messages', () => {
  assert.match(html, /<ol class="busy-steps" id="busySteps"><\/ol>/);
  for (const s of ['Checking your access', 'Loading your registers', 'Preparing your dashboard']) assert.ok(app.includes("'" + s + "'"), s);
  assert.doesNotMatch(store, /Requesting permission to store your compliance registers/);
});

test('licence probes run together, once each, and start at the beginning of sign-in', () => {
  assert.match(graph, /await Promise\.all\(CAPABILITY_PROBES\.map\(async function \(p\) \{\s*try \{\s*await g\(p\.path, Object\.assign\(\{ retries: 0 \}, p\.opts \|\| \{\}\)\);/);
  assert.match(graph, /var limit = typeof maxRetries === 'number' \? maxRetries : GRAPH_MAX_RETRIES;/);
  assert.match(app, /Graph\.detectCapabilities\(\)\.catch\(function \(\) \{\}\);\s*Graph\.detectRole\(\)\.catch\(function \(\) \{\}\);/);
});
