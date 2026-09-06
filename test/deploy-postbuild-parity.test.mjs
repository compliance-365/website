// Guards the one seam that has now silently broken production three times:
// .github/workflows/deploy.yml re-implements package.json's `postbuild` by
// hand, and nothing kept the two in step.
//
// It has to re-implement it. The workflow builds with `npx astro build`, and
// npm only fires the `postbuild` lifecycle script for `npm run build` — so a
// step added to `postbuild` reaches every contributor's local build and
// never reaches the deployed site. Both previous failures were invisible
// rather than loud, which is why they survived: the missing content-pack
// step made every premium framework read as unentitled for a live tenant,
// and the missing minify step left production serving ~2.2 MB of unminified
// source that worked perfectly, just slowly.
//
// So: same scripts, same order, in both places. Order is not cosmetic —
// hash-checkpoint-assets.mjs writes each file's content hash into its name
// and the matching SRI digest into the HTML, so anything that rewrites a
// file's bytes must run BEFORE it or every integrity check fails and the
// browser refuses to execute the script.
//
// If you are here because this test failed after adding a postbuild step:
// add the same step to deploy.yml, before the hashing step if it modifies
// file contents, and this passes.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const pkg = JSON.parse(readFileSync(new URL('package.json', root), 'utf8'));
const workflow = readFileSync(new URL('.github/workflows/deploy.yml', root), 'utf8');

/* "node scripts/a.mjs && node scripts/b.mjs" -> ['scripts/a.mjs','scripts/b.mjs'] */
function scriptsIn(text) {
  return [...text.matchAll(/node\s+(scripts\/[\w.-]+\.mjs)/g)].map((m) => m[1]);
}

describe('deploy.yml stays in step with package.json postbuild', () => {
  const postbuild = scriptsIn(pkg.scripts.postbuild || '');
  const deployed = scriptsIn(workflow);

  test('postbuild is a non-empty chain of scripts/*.mjs', () => {
    assert.ok(postbuild.length > 0, 'package.json has no postbuild scripts to compare against');
  });

  test('every postbuild script also runs in the deploy workflow', () => {
    const missing = postbuild.filter((s) => !deployed.includes(s));
    assert.deepEqual(missing, [], 'in package.json postbuild but never run by deploy.yml — ' +
      'these would work locally and silently never reach the deployed site');
  });

  test('the deploy workflow runs them in the same order', () => {
    // Compare only the postbuild scripts: the workflow may legitimately run
    // other scripts of its own, but the ones it shares must not be reordered.
    const shared = deployed.filter((s) => postbuild.includes(s));
    assert.deepEqual(shared, postbuild);
  });

  test('minification precedes hashing, so SRI is computed over the final bytes', () => {
    const minify = deployed.indexOf('scripts/minify-checkpoint-assets.mjs');
    const hash = deployed.indexOf('scripts/hash-checkpoint-assets.mjs');
    assert.notEqual(minify, -1, 'deploy.yml never minifies');
    assert.notEqual(hash, -1, 'deploy.yml never hashes');
    assert.ok(minify < hash, 'minify must run before hash or every SRI digest is stale');
  });
});
