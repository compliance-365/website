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
  assert.match(graph, /else if \(opts\.selectAccount !== false\) req\.prompt = 'select_account';/);
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

test('a returning browser signs in on its own once per tab, never after sign-out', () => {
  assert.match(graph, /if \(opts\.silent\) req\.prompt = 'none';/);
  assert.match(graph, /try \{ redirectResult = await msalApp\.handleRedirectPromise\(\); \}\s*catch \(e\) \{ lastRedirectError = e; \}/);
  assert.match(app, /return signedInBefore\(\) && localStorage\.getItem\('cpSignedOut'\) !== '1' &&\s*sessionStorage\.getItem\('cpAutoSignInTried'\) !== '1' && !Graph\.redirectError\(\);/);
  const boot = app.slice(app.indexOf('if (ok && autoSignInDue())'));
  assert.ok(boot.indexOf("sessionStorage.setItem('cpAutoSignInTried', '1')") < boot.indexOf('Graph.signIn({ silent: true })'), 'the tried flag is set before redirecting, so no loop');
  assert.match(graph, /localStorage\.setItem\('cpSignedOut', '1'\)/);
  assert.match(graph, /localStorage\.removeItem\('cpLoginHint'\)/);
  const signIn = app.slice(app.indexOf('    signIn: function () {'), app.indexOf('    showSignInPermissions:'));
  assert.match(signIn, /localStorage\.removeItem\('cpSignedOut'\)/);
});

test('licence results are remembered for a day, refreshed in the background, fresh for scans', () => {
  assert.match(graph, /var CAP_STORE_TTL_MS = 24 \* 60 \* 60 \* 1000;/);
  assert.match(graph, /CAP_STORE_PREFIX \+ account\.homeAccountId/);
  assert.match(graph, /capabilitiesCache = stored; capabilitiesFromStore = true;\s*probeOnce\(\)\.catch/);
  assert.match(graph, /var capabilities = await freshCapabilities\(\);/);
  assert.match(app, /var cap = await Graph\.freshCapabilities\(\);/);
  assert.match(app, /var refreshing = Graph\.capabilitiesRefreshing && Graph\.capabilitiesRefreshing\(\);/);
});
