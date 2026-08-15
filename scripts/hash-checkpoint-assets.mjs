#!/usr/bin/env node
/* Content-hashes Checkpoint's own JS/CSS bundles and self-hosted fonts in
 * the BUILT dist/checkpoint (and dist/owner) output, rewrites each
 * index.html's <script src>/<link href> and styles.css's @font-face
 * url() references to the hashed filenames, and computes a fresh SRI
 * `integrity` attribute for each script — replacing the manual ?v=N
 * cache-buster and closing the "our own scripts have no SRI, only MSAL
 * does" gap noted in RELEASE.md.
 *
 * Runs as a postbuild step (see package.json) against dist/, never
 * against the public/ source — source files keep their plain names
 * (app.js, store.js, owner.js, styles.css, ...) for normal editing; only
 * the deployed copy is hashed. Dependency-light: only Node's built-in
 * crypto/fs, no bundler, no devDependency.
 *
 * Two independent static pages share several files WITHOUT duplicating
 * them: config.js, version.js, graph.js, lib.js and styles.css physically
 * live only in dist/checkpoint/, but dist/owner/index.html references
 * them via a relative "../checkpoint/..." path — one canonical file,
 * hashed once, both index.html's rewritten to point at the same hashed
 * name. devflag.js is the same file physically, but (since the
 * client-facing bundle has no owner/partner-only UI left to preview
 * locally) is referenced ONLY from dist/owner/index.html now — see
 * public/checkpoint/devflag.js's own comment.
 *
 * MSAL's own vendored <script> is untouched: it's a pinned third-party
 * file with its own manually-verified SRI hash (see SETUP.md/RELEASE.md
 * on upgrading it) — this script only manages the files Checkpoint
 * itself owns and rebuilds on every change.
 *
 * Also injects the current version (public/checkpoint/VERSION) into
 * version.js's placeholder before hashing it, so window.CHECKPOINT_VERSION
 * is always exactly what VERSION says — see injectVersion() below.
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, renameSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIST_ROOT = join(process.cwd(), 'dist');
const DIST_DIR = join(DIST_ROOT, 'checkpoint');
const OWNER_DIR = join(DIST_ROOT, 'owner');
const INDEX_PATH = join(DIST_DIR, 'index.html');
const OWNER_INDEX_PATH = join(OWNER_DIR, 'index.html');
const VERSION_PATH = join(process.cwd(), 'public', 'checkpoint', 'VERSION');

// Lives only in dist/checkpoint/, referenced only from that directory's
// own index.html — the client-facing app itself.
const CLIENT_SCRIPTS = ['store.js', 'guidance.js', 'templates.js', 'courses.js', 'changelog.js', 'ai.js', 'report.js', 'selftest.js', 'app.js'];
// Lives only in dist/checkpoint/, but referenced from BOTH index.html's —
// dist/checkpoint/index.html by its plain name, dist/owner/index.html via
// a relative "../checkpoint/" path. One physical file, hashed once.
const SHARED_SCRIPTS = ['config.js', 'version.js', 'graph.js', 'lib.js'];
// Lives in dist/checkpoint/ but is now an owner-portal-only concern —
// referenced only from dist/owner/index.html (see devflag.js's comment).
const OWNER_ONLY_SHARED_SCRIPT = 'devflag.js';
// Lives only in dist/owner/, referenced only from dist/owner/index.html —
// the internal-only console's own bundle, plus the vendored pdf-lib
// (see index.html's own comment) that owner.js uses to build the
// welcome-pack quick-start guide as a real PDF.
const OWNER_ONLY_SCRIPTS = ['owner.js', 'pdf-lib.min.js'];
// Shared stylesheet ("design tokens") — same sharing shape as SHARED_SCRIPTS.
const SHARED_CSS = 'styles.css';

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

/* Forces devflag.js's CHECKPOINT_DEV_BYPASS to false in the BUILT
   output, unconditionally, and asserts the result — never trusts that
   the source file simply "happened" to already say false. Source ships
   `= true` deliberately (so `astro dev`/any local server works out of
   the box for a developer previewing the owner console locally — see
   public/checkpoint/devflag.js), which makes this the one and only
   place that guarantees a real deployment can never ship with it on —
   for dist/checkpoint/devflag.js, the one physical file dist/owner/
   index.html also references.
   Runs BEFORE the hashing loop below (same reason injectVersion() does)
   — hashing/SRI must reflect the rewritten content, not the source.
   Exported (and parameterised on distDir, not the module-level
   DIST_DIR constant) so test/dev-bypass.test.mjs can exercise it
   against a throwaway temp directory instead of a real dist/ build. */
export function enforceDevBypassOff(distDir) {
  const devflagPath = join(distDir, 'devflag.js');
  if (!existsSync(devflagPath)) {
    throw new Error('hash-checkpoint-assets: ' + devflagPath + ' not found — has public/checkpoint/devflag.js been removed or renamed?');
  }
  const before = readFileSync(devflagPath, 'utf8');
  const after = before.split('CHECKPOINT_DEV_BYPASS = true').join('CHECKPOINT_DEV_BYPASS = false');
  writeFileSync(devflagPath, after);
  const final = readFileSync(devflagPath, 'utf8');
  if (!/CHECKPOINT_DEV_BYPASS\s*=\s*false/.test(final) || /CHECKPOINT_DEV_BYPASS\s*=\s*true/.test(final)) {
    throw new Error('hash-checkpoint-assets: refused to ship a production build with CHECKPOINT_DEV_BYPASS possibly still enabled — this must always be false outside local development. Check devflag.js\'s content hasn\'t changed shape.');
  }
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

/* Rewrites a single <script src="srcAttr(?:?...)?"> tag (if present —
   callers decide whether absence is an error) to point at `newSrcAttr`
   with fresh integrity/crossorigin. Returns the possibly-unchanged html
   plus whether a match was found. */
function rewriteScriptTag(html, srcAttr, newSrcAttr, integrity) {
  const escaped = srcAttr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const tagRe = new RegExp('<script src="' + escaped + '(?:\\?[^"]*)?"([^>]*)></script>');
  const match = html.match(tagRe);
  if (!match) return { html, matched: false };
  const extraAttrs = match[1].replace(/\s*integrity="[^"]*"/, '').replace(/\s*crossorigin="[^"]*"/, '');
  const replaced = html.replace(tagRe, '<script src="' + newSrcAttr + '" integrity="' + integrity + '" crossorigin="anonymous"' + extraAttrs + '></script>');
  return { html: replaced, matched: true };
}

/* Same idea for a <link rel="stylesheet" href="..."> tag — no SRI added
   here (the rest of this codebase doesn't SRI-pin stylesheets, only
   scripts; adding it would need a matching crossorigin on font @font-face
   loads too, a larger change than this cache-busting rename). */
function rewriteStylesheetTag(html, hrefAttr, newHrefAttr) {
  const escaped = hrefAttr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const tagRe = new RegExp('<link rel="stylesheet" href="' + escaped + '(?:\\?[^"]*)?">');
  const match = html.match(tagRe);
  if (!match) return { html, matched: false };
  const replaced = html.replace(tagRe, '<link rel="stylesheet" href="' + newHrefAttr + '">');
  return { html: replaced, matched: true };
}

/* Every built .html in dist/ EXCEPT the two Checkpoint/owner pages this
   script rewrites tag-by-tag above — i.e. the Astro marketing site. */
function siteHtmlFiles(root) {
  const out = [];
  const appIndex = join(root, 'checkpoint', 'index.html');
  const ownerIndex = join(root, 'owner', 'index.html');
  (function walk(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, entry.name);
      if (entry.isDirectory()) walk(p);
      else if (entry.name.endsWith('.html') && p !== appIndex && p !== ownerIndex) out.push(p);
    }
  })(root);
  return out;
}

/* Site pages can legitimately load a Checkpoint script by absolute path
   — src/components/EuAiActClassifier.astro loads lib.js so the public EU
   AI Act tool and the in-app AI Systems register share ONE question set
   and classification engine rather than drifting as two copies.
   Those pages are plain Astro output, so nothing above ever rewrote
   them, and content-hashing renamed the file out from under them: the
   tag 404'd in production, window.CheckpointLib stayed undefined, and
   the classifier silently rendered zero questions on every page
   embedding it — a visibly empty widget, with no error anywhere.

   Rewrites every such reference to the hashed name (global, so a page
   embedding a component twice is fully handled) and then re-scans for
   any surviving plain-name reference, throwing if one is left. Same
   self-verifying contract as the rest of this script: a dangling
   reference fails the build rather than shipping a dead <script>. */
export function rewriteSiteReferences(hashedByRel, root = DIST_ROOT) {
  const rels = Object.keys(hashedByRel);
  let rewritten = 0, pagesTouched = 0;
  for (const file of siteHtmlFiles(root)) {
    let pageHtml = readFileSync(file, 'utf8');
    const before = pageHtml;
    for (const rel of rels) {
      const { newName, integrity } = hashedByRel[rel];
      const escaped = ('/checkpoint/' + rel).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const tagRe = new RegExp('<script src="' + escaped + '(?:\\?[^"]*)?"([^>]*)></script>', 'g');
      pageHtml = pageHtml.replace(tagRe, (_m, extraAttrs) => {
        rewritten++;
        const attrs = extraAttrs.replace(/\s*integrity="[^"]*"/, '').replace(/\s*crossorigin="[^"]*"/, '');
        return '<script src="/checkpoint/' + newName + '" integrity="' + integrity + '" crossorigin="anonymous"' + attrs + '></script>';
      });
    }
    if (pageHtml !== before) { writeFileSync(file, pageHtml); pagesTouched++; }

    for (const rel of rels) {
      if (pageHtml.includes('"/checkpoint/' + rel + '"')) {
        throw new Error('hash-checkpoint-assets: ' + file + ' still references /checkpoint/' + rel +
          ', which no longer exists after content hashing — it would 404 in production. Reference it from a <script src="/checkpoint/' + rel + '"></script> tag this script can rewrite, or stop referencing it.');
      }
    }
  }
  return { rewritten, pagesTouched };
}

function main() {
  if (!existsSync(INDEX_PATH)) {
    console.log('hash-checkpoint-assets: dist/checkpoint/index.html not found — skipping (did `astro build` run first?)');
    return;
  }

  let html = readFileSync(INDEX_PATH, 'utf8');
  const hasOwnerIndex = existsSync(OWNER_INDEX_PATH);
  let ownerHtml = hasOwnerIndex ? readFileSync(OWNER_INDEX_PATH, 'utf8') : null;
  if (!hasOwnerIndex && existsSync(OWNER_DIR)) {
    throw new Error('hash-checkpoint-assets: dist/owner/ exists but dist/owner/index.html does not — half-built owner console output?');
  }

  const version = injectVersion();
  enforceDevBypassOff(DIST_DIR);

  let hashedCount = 0;
  /* rel -> { newName, integrity } for every file physically in
     dist/checkpoint/, so rewriteSiteReferences() below can fix (and
     verify) any absolute /checkpoint/<name> reference a marketing page
     makes. */
  const hashedByRel = {};

  // Client-only scripts: hashed in dist/checkpoint/, rewritten only in
  // dist/checkpoint/index.html — required match.
  for (const rel of CLIENT_SCRIPTS) {
    const buf = readFileSync(join(DIST_DIR, rel));
    const newName = hashedName(rel, shortHash(buf));
    const integrity = sriHash(buf);
    renameSync(join(DIST_DIR, rel), join(DIST_DIR, newName));
    const r = rewriteScriptTag(html, rel, newName, integrity);
    if (!r.matched) throw new Error('hash-checkpoint-assets: could not find a <script> tag for ' + rel + ' in dist/checkpoint/index.html — has its markup changed?');
    html = r.html;
    hashedByRel[rel] = { newName, integrity };
    hashedCount++;
  }

  // Shared scripts: one physical file in dist/checkpoint/, referenced by
  // BOTH pages (dist/checkpoint/index.html by plain name, dist/owner/
  // index.html via "../checkpoint/" + name). Both references are
  // required whenever dist/owner/index.html exists — a shared file this
  // build script silently stopped wiring up in one of the two pages is
  // exactly the kind of drift this script exists to prevent.
  for (const rel of SHARED_SCRIPTS) {
    const buf = readFileSync(join(DIST_DIR, rel));
    const newName = hashedName(rel, shortHash(buf));
    const integrity = sriHash(buf);
    renameSync(join(DIST_DIR, rel), join(DIST_DIR, newName));

    const r1 = rewriteScriptTag(html, rel, newName, integrity);
    if (!r1.matched) throw new Error('hash-checkpoint-assets: could not find a <script> tag for ' + rel + ' in dist/checkpoint/index.html — has its markup changed?');
    html = r1.html;

    if (hasOwnerIndex) {
      const ownerSrc = '../checkpoint/' + rel;
      const ownerNewSrc = '../checkpoint/' + newName;
      const r2 = rewriteScriptTag(ownerHtml, ownerSrc, ownerNewSrc, integrity);
      if (!r2.matched) throw new Error('hash-checkpoint-assets: could not find a <script src="' + ownerSrc + '"> tag in dist/owner/index.html — has its markup changed?');
      ownerHtml = r2.html;
    }
    hashedByRel[rel] = { newName, integrity };
    hashedCount++;
  }

  // devflag.js: same physical file, but owner-only now.
  {
    const rel = OWNER_ONLY_SHARED_SCRIPT;
    const buf = readFileSync(join(DIST_DIR, rel));
    const newName = hashedName(rel, shortHash(buf));
    const integrity = sriHash(buf);
    renameSync(join(DIST_DIR, rel), join(DIST_DIR, newName));
    if (hasOwnerIndex) {
      const ownerSrc = '../checkpoint/' + rel;
      const ownerNewSrc = '../checkpoint/' + newName;
      const r = rewriteScriptTag(ownerHtml, ownerSrc, ownerNewSrc, integrity);
      if (!r.matched) throw new Error('hash-checkpoint-assets: could not find a <script src="' + ownerSrc + '"> tag in dist/owner/index.html — has its markup changed?');
      ownerHtml = r.html;
    }
    hashedByRel[rel] = { newName, integrity };
    hashedCount++;
  }

  // Owner-only scripts: physically in dist/owner/, referenced only from
  // dist/owner/index.html.
  if (hasOwnerIndex) {
    for (const rel of OWNER_ONLY_SCRIPTS) {
      const buf = readFileSync(join(OWNER_DIR, rel));
      const newName = hashedName(rel, shortHash(buf));
      const integrity = sriHash(buf);
      renameSync(join(OWNER_DIR, rel), join(OWNER_DIR, newName));
      const r = rewriteScriptTag(ownerHtml, rel, newName, integrity);
      if (!r.matched) throw new Error('hash-checkpoint-assets: could not find a <script> tag for ' + rel + ' in dist/owner/index.html — has its markup changed?');
      ownerHtml = r.html;
      hashedCount++;
    }
  }

  // Fonts: rewrite the @font-face url()s inside styles.css's ON-DISK
  // content FIRST, then hash styles.css itself last, so its content
  // hash reflects the final, font-renamed content (not the pre-rename
  // source).
  const stylesPath = join(DIST_DIR, SHARED_CSS);
  let stylesCss = readFileSync(stylesPath, 'utf8');
  for (const rel of FONT_FILES) {
    const srcPath = join(DIST_DIR, rel);
    const buf = readFileSync(srcPath);
    const newName = hashedName(rel, shortHash(buf));
    renameSync(srcPath, join(DIST_DIR, newName));
    const before = stylesCss;
    stylesCss = stylesCss.split("url('" + rel + "')").join("url('" + newName + "')");
    if (stylesCss === before) {
      throw new Error('hash-checkpoint-assets: could not find @font-face url(\'' + rel + '\') in styles.css — has its markup changed?');
    }
  }
  writeFileSync(stylesPath, stylesCss);

  // Shared stylesheet — same sharing shape as SHARED_SCRIPTS, no SRI.
  {
    const buf = readFileSync(stylesPath);
    const newName = hashedName(SHARED_CSS, shortHash(buf));
    renameSync(stylesPath, join(DIST_DIR, newName));

    const r1 = rewriteStylesheetTag(html, SHARED_CSS, newName);
    if (!r1.matched) throw new Error('hash-checkpoint-assets: could not find a <link rel="stylesheet"> tag for ' + SHARED_CSS + ' in dist/checkpoint/index.html — has its markup changed?');
    html = r1.html;

    if (hasOwnerIndex) {
      const ownerHref = '../checkpoint/' + SHARED_CSS;
      const ownerNewHref = '../checkpoint/' + newName;
      const r2 = rewriteStylesheetTag(ownerHtml, ownerHref, ownerNewHref);
      if (!r2.matched) throw new Error('hash-checkpoint-assets: could not find a <link rel="stylesheet" href="' + ownerHref + '"> tag in dist/owner/index.html — has its markup changed?');
      ownerHtml = r2.html;
    }
  }

  writeFileSync(INDEX_PATH, html);
  if (hasOwnerIndex) writeFileSync(OWNER_INDEX_PATH, ownerHtml);

  const site = rewriteSiteReferences(hashedByRel);

  console.log('hash-checkpoint-assets: content-hashed ' + hashedCount + ' script(s), 1 stylesheet + ' + FONT_FILES.length + ' font(s), injected version ' + version + ', refreshed SRI, rewrote index.html' + (hasOwnerIndex ? ' + owner/index.html' : '') +
    (site.rewritten ? ' + ' + site.rewritten + ' site reference(s) across ' + site.pagesTouched + ' page(s)' : ''));
}

/* Only runs main() when this file is executed directly (`node
   scripts/hash-checkpoint-assets.mjs`, exactly how package.json's
   postbuild step invokes it) — NOT when test/dev-bypass.test.mjs
   imports enforceDevBypassOff() from it, which would otherwise try to
   run the full build pipeline (and fail — there's no real dist/ in a
   test run) just from being imported. */
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
