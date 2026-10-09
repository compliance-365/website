// Start-up stays lean: scripts only some screens need are kept out of the
// initial load and fetched on demand, with the same hashed name and SRI
// integrity the build gives every other script.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../public/checkpoint/index.html', import.meta.url), 'utf8');
const app = readFileSync(new URL('../public/checkpoint/app.js', import.meta.url), 'utf8');

test('changelog.js is not loaded at start-up, only from the deferred template', () => {
  const tpl = /<template id="deferredScripts">([\s\S]*?)<\/template>/.exec(html);
  assert.ok(tpl, 'index.html has the #deferredScripts template');
  assert.match(tpl[1], /<script src="changelog\.js"><\/script>/);
  const outside = html.replace(tpl[0], '');
  assert.doesNotMatch(outside, /<script src="changelog\.js"/);
});

test('What\'s new loads it on demand, copying the integrity attribute', () => {
  assert.match(app, /openChangelog: async function \(\) \{\s*if \(!window\.CHECKPOINT_CHANGELOG\) \{\s*try \{ await loadDeferredScript\('changelog\.js'\)/);
  assert.match(app, /el\.integrity = tag\.getAttribute\('integrity'\); el\.crossOrigin = 'anonymous';/);
});
