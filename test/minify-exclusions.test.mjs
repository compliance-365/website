// Guards the contract between the two postbuild steps.
//
// hash-checkpoint-assets.mjs performs literal TEXT substitutions on
// three built files — it swaps `__CHECKPOINT_VERSION__` into version.js,
// rewrites `CHECKPOINT_DEV_BYPASS = true` to `= false` in devflag.js, and
// replaces `url('fonts/...')` inside styles.css. minify-checkpoint-assets.mjs
// runs FIRST, so if any of those files were ever added to its lists the
// minifier would rewrite the very text the hashing step then looks for.
//
// The devflag.js case is the one that matters most: that substitution is
// a security control (it is the single place guaranteeing a deployed
// build can never ship with the local dev bypass enabled). It fails the
// build loudly rather than silently shipping the bypass on — but a
// failing build is still a bad way to find out, and a future edit that
// "tidies" the exclusion away should be caught here instead.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CHECKPOINT_SCRIPTS, OWNER_SCRIPTS, NEVER_MINIFY } from '../scripts/minify-checkpoint-assets.mjs';

const hashScript = readFileSync(new URL('../scripts/hash-checkpoint-assets.mjs', import.meta.url), 'utf8');
const minified = CHECKPOINT_SCRIPTS.concat(OWNER_SCRIPTS);

describe('minify/hash postbuild contract', () => {
  test('no file targeted by a text substitution is ever minified', () => {
    for (const name of NEVER_MINIFY) {
      assert.ok(!minified.includes(name),
        name + ' must not be minified — hash-checkpoint-assets.mjs performs a literal text substitution on it, ' +
        'which minification would rewrite. See minify-checkpoint-assets.mjs\'s header for the reasoning.');
    }
  });

  test('devflag.js is excluded — its substitution is a security control', () => {
    assert.ok(NEVER_MINIFY.includes('devflag.js'));
    assert.ok(!minified.includes('devflag.js'));
    // The exact literal the hashing step rewrites. If this string ever
    // changes shape in that script, this test should be revisited
    // alongside it rather than quietly passing.
    assert.match(hashScript, /CHECKPOINT_DEV_BYPASS = true/,
      'hash-checkpoint-assets.mjs no longer contains the literal it substitutes on — re-check the exclusion reasoning.');
  });

  test('already-minified vendor bundles are not re-minified', () => {
    assert.ok(!minified.some((n) => n.endsWith('.min.js')));
  });

  test('every minified file is one the hashing step also knows about', () => {
    // Both scripts keep explicit lists; a file minified but never hashed
    // would ship uncompressed-but-unhashed, or vice versa.
    for (const name of minified) {
      assert.ok(hashScript.includes("'" + name + "'"),
        name + ' is minified but does not appear in hash-checkpoint-assets.mjs\'s own lists.');
    }
  });
});
