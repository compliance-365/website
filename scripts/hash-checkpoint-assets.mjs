#!/usr/bin/env node
/* Content-hashes Checkpoint's own JS bundles and self-hosted fonts in the
 * BUILT dist/checkpoint output, rewrites index.html's <script src> and
 * @font-face url() references to the hashed filenames, and computes a
 * fresh SRI `integrity` attribute for each script — replacing the manual
 * ?v=N cache-buster and closing the "our own scripts have no SRI, only
 * MSAL does" gap noted in RELEASE.md.
 *
 * Runs as a postbuild step (see package.json) against dist/, never
 * against the public/checkpoint/ source — source files keep their plain
 * names (app.js, store.js, ...) for normal editing; only the deployed
 * copy is hashed. Dependency-light: only Node's built-in crypto/fs, no
 * bundler, no devDependency.
 *
 * MSAL's own vendored <script> is untouched: it's a pinned third-party
 * file with its own manually-verified SRI hash (see SETUP.md/RELEASE.md
 * on upgrading it) — this script only manages the files Checkpoint
 * itself owns and rebuilds on every change (see HASHED_SCRIPTS below).
 *
 * Also injects the current version (public/checkpoint/VERSION) into
 * version.js's placeholder before hashing it, so window.CHECKPOINT_VERSION
 * is always exactly what VERSION says — see injectVersion() below.
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const DIST_DIR = join(process.cwd(), 'dist', 'checkpoint');
const INDEX_PATH = join(DIST_DIR, 'index.html');
const VERSION_PATH = join(process.cwd(), 'public', 'checkpoint', 'VERSION');

// Order matters only for readability of the log line below.
const HASHED_SCRIPTS = ['config.js', 'version.js', 'graph.js', 'store.js', 'guidance.js', 'templates.js', 'changelog.js', 'lib.js', 'report.js', 'selftest.js', 'app.js'];
const FONT_FILES = ['fonts/fraunces.woff2', 'fonts/manrope.woff2'];

/* Substitutes the real version number into dist/checkpoint/version.js's
   placeholder BEFORE the hashing loop below runs (so the file's content
   hash/SRI reflect the real string, not the placeholder) — reads the
   single source of truth, public/checkpoint/VERSION, never anything
   hand-typed in this script. Throws (failing the build) if either file
   is missing or the placeholder isn't found, so a version number can
   never silently go stale or missing in a deployed build. */
function injectVersion() {
  if (!existsSync(VERSION_PATH)) {
    throw new Error('hash-checkpoint-assets: public/checkpoint/VERSION not found — this file is the single source of truth for the app version (e.g. "1.5.0"); create it before building.');
  }
  const version = readFileSync(VERSION_PATH, 'utf8').trim();
  if (!version) throw new Error('hash-checkpoint-assets: public/checkpoint/VERSION is empty.');
  const versionJsPath = join(DIST_DIR, 'version.js');
  const before = readFileSync(versionJsPath, 'utf8');
  const after = before.split('__CHECKPOINT_VERSION__').join(version);
  if (after === before) {
    throw new Error('hash-checkpoint-assets: __CHECKPOINT_VERSION__ placeholder not found in version.js — has its content changed?');
  }
  writeFileSync(versionJsPath, after);
  return version;
}

function shortHash(buf) {
  return createHash('sha256').update(buf).digest('hex').slice(0, 10);
}
function sriHash(buf) {
  return 'sha384-' + createHash('sha384').update(buf).digest('base64');
}
function hashedName(rel, hash) {
  const dot = rel.lastIndexOf('.');
  return rel.slice(0, dot) + '.' + hash + rel.slice(dot);
}

function main() {
  if (!existsSync(INDEX_PATH)) {
    console.log('hash-checkpoint-assets: dist/checkpoint/index.html not found — skipping (did `astro build` run first?)');
    return;
  }

  let html = readFileSync(INDEX_PATH, 'utf8');
  const version = injectVersion();

  for (const rel of HASHED_SCRIPTS) {
    const srcPath = join(DIST_DIR, rel);
    const buf = readFileSync(srcPath);
    const newName = hashedName(rel, shortHash(buf));
    const integrity = sriHash(buf);
    renameSync(srcPath, join(DIST_DIR, newName));

    // Matches this project's existing tag shape: <script src="name.js?v=N"></script>
    // (with or without the query string), replacing it with the hashed
    // filename plus a fresh integrity/crossorigin pair. Escapes the dot
    // in `rel` since it's used inside a RegExp literal.
    const escaped = rel.replace(/\./g, '\\.');
    const tagRe = new RegExp('<script src="' + escaped + '(?:\\?[^"]*)?"([^>]*)></script>');
    const match = html.match(tagRe);
    if (!match) {
      throw new Error('hash-checkpoint-assets: could not find a <script> tag for ' + rel + ' in index.html — has its markup changed?');
    }
    // Preserve any other attributes already on the tag (there are none
    // today besides src, but this keeps the rewrite non-destructive if
    // that changes), just strip any stale integrity/crossorigin first.
    const extraAttrs = match[1].replace(/\s*integrity="[^"]*"/, '').replace(/\s*crossorigin="[^"]*"/, '');
    html = html.replace(tagRe, '<script src="' + newName + '" integrity="' + integrity + '" crossorigin="anonymous"' + extraAttrs + '></script>');
  }

  for (const rel of FONT_FILES) {
    const srcPath = join(DIST_DIR, rel);
    const buf = readFileSync(srcPath);
    const newName = hashedName(rel, shortHash(buf));
    renameSync(srcPath, join(DIST_DIR, newName));
    const before = html;
    html = html.split("url('" + rel + "')").join("url('" + newName + "')");
    if (html === before) {
      throw new Error('hash-checkpoint-assets: could not find @font-face url(\'' + rel + '\') in index.html — has its markup changed?');
    }
  }

  writeFileSync(INDEX_PATH, html);
  console.log('hash-checkpoint-assets: content-hashed ' + HASHED_SCRIPTS.length + ' script(s) + ' + FONT_FILES.length + ' font(s), injected version ' + version + ', refreshed SRI, rewrote index.html');
}

main();
