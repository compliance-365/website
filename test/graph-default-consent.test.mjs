// Sign-in and every Graph token ask for Graph's '.default' (whatever the
// admin approved), so a tenant with admin consent never sees a
// permissions screen at sign-in, however many permissions the app lists.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';

const require = createRequire(import.meta.url);
const L = require('../public/checkpoint/lib.js');
const DEFAULT = 'https://graph.microsoft.com/.default';

test('Graph permissions become one .default request', () => {
  assert.deepEqual(L.graphTokenScopes(['User.Read', 'Directory.Read.All']), [DEFAULT]);
  assert.deepEqual(L.graphTokenScopes(['Sites.Manage.All']), [DEFAULT]);
  assert.deepEqual(L.graphTokenScopes(['Mail.Send']), [DEFAULT]);
  assert.deepEqual(L.graphTokenScopes([]), [DEFAULT]);
  assert.deepEqual(L.graphTokenScopes(null), [DEFAULT]);
  assert.equal(L.GRAPH_DEFAULT_SCOPE, DEFAULT);
});

test('other resources keep their own scopes', () => {
  assert.deepEqual(L.graphTokenScopes(['https://cognitiveservices.azure.com/.default']), ['https://cognitiveservices.azure.com/.default']);
  assert.deepEqual(L.graphTokenScopes(['api://946504dc-6983-46aa-b81c-45e62de3efb0/Sign.Entitlement']), ['api://946504dc-6983-46aa-b81c-45e62de3efb0/Sign.Entitlement']);
});

test('graph.js routes sign-in, tokens and the permissions check through it', async () => {
  const src = await readFile(new URL('../public/checkpoint/graph.js', import.meta.url), 'utf8');
  assert.match(src, /var req = \{ scopes: scopesFor\(CONFIG\.scopesReadOnly\) \};[\s\S]{0,420}await msalApp\.loginRedirect\(req\);/);
  assert.match(src, /scopes = scopesFor\(scopes \|\| CONFIG\.scopesReadOnly\)/);
  assert.match(src, /acquireTokenSilent\(\{ scopes: scopesFor\(CONFIG\.scopesReadOnly\)/);
  assert.doesNotMatch(src, /loginRedirect\(\{ scopes: CONFIG\./, 'no sign-in that lists the permissions one by one');
});
