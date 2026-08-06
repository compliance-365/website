// Resolves a "last modified" date for each built page so the sitemap can carry
// an honest <lastmod>. Google uses lastmod to prioritise recrawls, so the value
// has to reflect real content changes — not build time, which would mark every
// page as changed on every deploy and get the signal ignored.
//
// Source of truth is the last git commit that touched the page's source file.
// Falls back to filesystem mtime (shallow clones / no git), then to null, in
// which case the sitemap simply omits lastmod for that URL.
import { execFileSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Candidate source files for a site-root-relative path like "/blog/foo/". */
function candidates(pathname) {
  const clean = pathname.replace(/^\/+|\/+$/g, '');
  if (clean === '') return ['src/pages/index.astro'];

  const out = [];
  // Blog posts are markdown in src/content/blog, rendered by src/pages/blog/[slug].astro
  if (clean.startsWith('blog/')) out.push(`src/content/blog/${clean.slice(5)}.md`);
  if (clean.startsWith('case-studies/')) out.push(`content/case-studies/${clean.slice(13)}.md`);
  // Regular Astro pages: /foo/bar/ -> src/pages/foo/bar.astro or .../bar/index.astro
  out.push(`src/pages/${clean}.astro`, `src/pages/${clean}/index.astro`);
  return out;
}

let gitWorks = true;
function gitDate(relPath) {
  if (!gitWorks) return null;
  try {
    const out = execFileSync('git', ['log', '-1', '--format=%cI', '--', relPath], {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    return out || null;
  } catch {
    gitWorks = false; // not a git checkout — stop retrying for every URL
    return null;
  }
}

const cache = new Map();

/**
 * @param {string} pathname site-root-relative path, e.g. "/services/iso27001/"
 * @returns {string|undefined} ISO-8601 date, or undefined if unknown
 */
export function lastmodFor(pathname) {
  if (cache.has(pathname)) return cache.get(pathname);

  let result;
  for (const rel of candidates(pathname)) {
    const abs = join(ROOT, rel);
    if (!existsSync(abs)) continue;
    result = gitDate(rel) ?? statSync(abs).mtime.toISOString();
    break;
  }

  cache.set(pathname, result);
  return result;
}
