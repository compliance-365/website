#!/usr/bin/env node
/* Minifies Checkpoint's own JavaScript in the BUILT dist/ output.
 *
 * The app ships ~2.3MB of unminified JavaScript — app.js alone is
 * ~1MB — to a console practitioners open on corporate networks, often
 * over a VPN. Nothing in the pipeline was compressing it: the build
 * content-hashes each file and computes an SRI digest (see
 * hash-checkpoint-assets.mjs) but never made it smaller.
 *
 * Runs as a postbuild step BEFORE hash-checkpoint-assets.mjs, so the
 * content hashes and `integrity` attributes are computed over the
 * MINIFIED bytes — hashing first would produce an SRI digest the
 * browser then rejects.
 *
 * Like the hashing script, this only ever touches dist/. The source
 * files in public/ keep their real names, comments and formatting for
 * normal editing; only the deployed copy is compressed.
 *
 * ---------------------------------------------------------------
 * THREE FILES ARE DELIBERATELY NOT MINIFIED. Each is the target of a
 * literal text substitution in hash-checkpoint-assets.mjs, and
 * minifying it first would rewrite the very text that script searches
 * for:
 *
 *   version.js   injectVersion() replaces the string
 *                `__CHECKPOINT_VERSION__`. (This one would in fact
 *                survive — it lives inside a string literal — but it is
 *                12 lines long, so there is nothing to gain by taking
 *                the risk.)
 *
 *   devflag.js   enforceDevBypassOff() replaces the literal source text
 *                `CHECKPOINT_DEV_BYPASS = true` with `= false`. esbuild
 *                rewrites that to `CHECKPOINT_DEV_BYPASS=!0`, the
 *                substitution silently matches nothing, and the build
 *                then fails on that function's own assertion. It fails
 *                loudly rather than shipping the dev bypass enabled —
 *                but it fails, so this file stays readable.
 *
 *   styles.css   the font-hashing pass matches `url('fonts/x.woff2')`
 *                including its quotes; a CSS minifier drops them. CSS
 *                is ~3% of the payload here, so it is not worth
 *                restructuring that contract to chase.
 *
 * Vendored, already-minified third-party bundles (msal-browser.min.js,
 * pdf-lib.min.js) are skipped too: they are pinned files with their own
 * manually-verified SRI, and re-minifying them would gain nothing.
 * ---------------------------------------------------------------
 */
import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import * as esbuild from 'esbuild';

const DIST_ROOT = join(process.cwd(), 'dist');
const DIST_DIR = join(DIST_ROOT, 'checkpoint');
const OWNER_DIR = join(DIST_ROOT, 'owner');

/* Mirrors hash-checkpoint-assets.mjs's own lists, minus the exclusions
   documented in this file's header. Kept as an explicit list rather
   than a directory glob for the same reason that script does: a new
   file should be a deliberate addition here, not something that starts
   being rewritten silently because it landed in the folder. */
export const CHECKPOINT_SCRIPTS = [
  'store.js', 'guidance.js', 'templates.js', 'courses.js', 'changelog.js',
  'ai.js', 'report.js', 'selftest.js', 'app.js',
  'config.js', 'graph.js', 'lib.js'
];
export const OWNER_SCRIPTS = ['owner.js'];

/* Exported so test/minify-exclusions.test.mjs can assert these are never
   quietly added to the lists above. devflag.js in particular is the one
   file whose text substitution is a SECURITY control (it forces the dev
   bypass off in every build), so "someone adds it to the list one day"
   is worth a failing test rather than a comment. */
export const NEVER_MINIFY = ['version.js', 'devflag.js', 'styles.css', 'msal-browser.min.js', 'pdf-lib.min.js'];

/* es2019 keeps optional chaining and nullish coalescing compiled away
   for the same browser floor MSAL v3 itself supports; the source is
   otherwise conservative ES5-flavoured script code. `format` is left
   unset on purpose — these are classic scripts assigning to `window`,
   not modules, and forcing a module format would break them. */
const TRANSFORM = { minify: true, legalComments: 'none', target: 'es2019' };

function kb(n) { return (n / 1024).toFixed(1) + ' KB'; }

async function minifyOne(dir, name) {
  const path = join(dir, name);
  if (!existsSync(path)) {
    throw new Error('minify-checkpoint-assets: expected ' + path + ' — has it been renamed or removed from the build?');
  }
  const before = readFileSync(path, 'utf8');
  const result = await esbuild.transform(before, TRANSFORM);
  if (!result.code || !result.code.length) {
    throw new Error('minify-checkpoint-assets: ' + name + ' minified to nothing, refusing to write it.');
  }
  writeFileSync(path, result.code);
  const after = statSync(path).size;
  return { name: name, before: Buffer.byteLength(before), after: after };
}

async function main() {
  if (!existsSync(DIST_DIR)) {
    throw new Error('minify-checkpoint-assets: ' + DIST_DIR + ' not found — run this after `astro build`, not before.');
  }
  const rows = [];
  for (const name of CHECKPOINT_SCRIPTS) rows.push(await minifyOne(DIST_DIR, name));
  if (existsSync(OWNER_DIR)) {
    for (const name of OWNER_SCRIPTS) rows.push(await minifyOne(OWNER_DIR, name));
  }

  let before = 0, after = 0;
  for (const r of rows) { before += r.before; after += r.after; }
  const saved = before - after;
  const pct = before ? Math.round(saved / before * 100) : 0;
  console.log('[minify-checkpoint-assets] ' + rows.length + ' files: ' +
    kb(before) + ' -> ' + kb(after) + '  (saved ' + kb(saved) + ', ' + pct + '%)');
}

/* Only run when invoked as a script, not when a test imports the lists
   above. */
if (process.argv[1] && process.argv[1].endsWith('minify-checkpoint-assets.mjs')) {
  main().catch((err) => {
    console.error(err.message || err);
    process.exit(1);
  });
}
