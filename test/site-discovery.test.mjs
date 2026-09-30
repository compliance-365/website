// A second computer (or a colleague) signing in must find the client's
// Checkpoint site without walking the wizard again. The chosen site was
// only remembered in the browser that ran setup, so every other browser
// fell back to the root site, found nothing, and asked for the licence.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
global.window = global.window || {};
const Lib = require('../public/checkpoint/lib.js');
const app = readFileSync(new URL('../public/checkpoint/app.js', import.meta.url), 'utf8');
const store = readFileSync(new URL('../public/checkpoint/store.js', import.meta.url), 'utf8');

describe('sitePathsFromSearchHits', () => {
  const hit = (displayName, webUrl) => ({ resource: { displayName, webUrl } });
  const NAME = 'Checkpoint Settings';
  const HOST = 'mineguard.sharepoint.com';

  test('turns list URLs into site paths, root included', () => {
    assert.deepEqual(Lib.sitePathsFromSearchHits([
      hit(NAME, 'https://mineguard.sharepoint.com/sites/Compliance/Lists/Checkpoint%20Settings'),
      hit(NAME, 'https://mineguard.sharepoint.com/Lists/Checkpoint%20Settings/AllItems.aspx')
    ], NAME, HOST), ['/sites/Compliance', 'root']);
  });

  test('ignores other names, other hosts, non-list URLs and duplicates', () => {
    assert.deepEqual(Lib.sitePathsFromSearchHits([
      hit('Checkpoint Settings Old', 'https://mineguard.sharepoint.com/sites/a/Lists/x'),
      hit(NAME, 'https://contoso.sharepoint.com/sites/b/Lists/Checkpoint%20Settings'),
      hit(NAME, 'https://mineguard.sharepoint.com/sites/c/Shared%20Documents/x'),
      hit(NAME, 'https://mineguard.sharepoint.com/sites/d/Lists/Checkpoint%20Settings'),
      hit('checkpoint settings', 'https://MineGuard.sharepoint.com/sites/d/lists/Checkpoint%20Settings'),
      null, {}
    ], NAME, HOST), ['/sites/d']);
    assert.deepEqual(Lib.sitePathsFromSearchHits(undefined, NAME, HOST), []);
  });
});

describe('sign-in looks for the site before sending an onboarded client to the wizard', () => {
  test('store confirms each candidate is onboarded and restores the configured site', () => {
    assert.match(store, /async function discoverOnboardedSites\(\)/);
    assert.match(store, /entityTypes: \['list'\]/);
    assert.match(store, /var probe = await probeOnboardingState\(\);\n\s+if \(probe\.onboarded\) found\.push\(paths\[i\]\);/);
    assert.match(store, /\} finally \{\n\s+CONFIG\.site = original;/);
    assert.match(store, /discoverOnboardedSites: discoverOnboardedSites,/);
  });

  test('exactly one site is opened and remembered; otherwise the wizard runs as before', () => {
    const fn = app.slice(app.indexOf('async function afterSignIn()'));
    const body = fn.slice(0, fn.indexOf('\n  }\n'));
    const probeAt = body.indexOf('if (probe.onboarded) { await startLive(); return; }');
    const discoverAt = body.indexOf('window.SpStore.discoverOnboardedSites()');
    const wizardAt = body.indexOf('Wizard.startAt(3);');
    assert.ok(probeAt > -1 && discoverAt > probeAt && wizardAt > discoverAt, 'probe, then discovery, then the wizard');
    assert.match(body, /if \(found\.length === 1\) \{\n\s+window\.CHECKPOINT_CONFIG\.site = found\[0\];\n\s+try \{ localStorage\.setItem\('cpSite:' \+ tenantStorageKey\(\), found\[0\]\);/);
  });
});
