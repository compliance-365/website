// The client onboarding guide (public/checkpoint/onboarding.html) tells a
// Global Administrator exactly which permissions the consent screen will
// show and to STOP if the list differs. That makes the table a promise:
// when config.js gains a scope and the guide does not, a careful admin
// halts onboarding on a false alarm. This pins the two together.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
global.window = global.window || {};
require('../public/checkpoint/config.js');
const CONFIG = window.CHECKPOINT_CONFIG;
const html = readFileSync(new URL('../public/checkpoint/onboarding.html', import.meta.url), 'utf8');

const tbody = html.slice(html.indexOf('<tbody>', html.indexOf('What we ask for, and why')), html.indexOf('</tbody>', html.indexOf('What we ask for, and why')));
const listed = [...tbody.matchAll(/<span class="mono">([^<]+)<\/span>/g)].map(m => m[1].trim());
const graphScopes = [...CONFIG.scopesReadOnly, ...CONFIG.scopesProvision, ...CONFIG.scopesMail];

test('every Graph permission Checkpoint requests is listed in the onboarding guide', () => {
  const missing = graphScopes.filter(s => !listed.includes(s));
  assert.deepEqual(missing, [], 'add these to the onboarding guide\'s permissions table: ' + missing.join(', '));
});

test('the guide lists nothing Checkpoint does not request', () => {
  const extra = listed.filter(s => !graphScopes.includes(s));
  assert.deepEqual(extra, []);
});

test('the stated permission count matches', () => {
  const words = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty', 'twenty-one', 'twenty-two', 'twenty-three', 'twenty-four', 'twenty-five'];
  const m = html.match(/You should see ([a-z-]+) Microsoft Graph permissions/);
  assert.ok(m, 'the "You should see N Microsoft Graph permissions" sentence is missing');
  assert.equal(m[1], words[new Set(graphScopes).size]);
});
