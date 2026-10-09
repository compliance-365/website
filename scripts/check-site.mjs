#!/usr/bin/env node
/* Checks the BUILT marketing site (dist/, after `astro build`) for:
 *
 *   1. Broken internal links: every href/src that points at this site
 *      must resolve to a file in dist/, and a #fragment on an HTML page
 *      must match an id on that page.
 *   2. Page weight: each page's HTML, and the same-site JavaScript it
 *      loads, must stay under a budget, so a page cannot quietly grow
 *      back to the size the RFFR controls page or the AI pages once were.
 *
 * Run by the Test workflow after `astro build`; exits non-zero with a
 * list of problems. The Checkpoint app (dist/checkpoint/) and the owner
 * console (dist/owner/) are apps with their own tests, so their pages
 * are not checked here, but links INTO them are.
 *
 * Usage: node scripts/check-site.mjs [distDir]
 */
import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { join, dirname, resolve, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const BUDGET = {
  htmlBytes: 700 * 1024,      // largest page today is ~620KB (the RFFR controls list)
  scriptBytes: 150 * 1024,    // same-site JS a marketing page loads; the heaviest today is ~31KB
};

const SKIP_DIRS = ['checkpoint', 'owner', '_astro', 'og', 'fonts', 'assets'];

function htmlFiles(dir, root, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (dir === root && SKIP_DIRS.includes(e.name)) continue;
      htmlFiles(p, root, out);
    } else if (e.name.endsWith('.html')) out.push(p);
  }
  return out;
}

/* The file a site path resolves to, or null. */
export function resolveSitePath(root, urlPath) {
  const clean = decodeURIComponent(urlPath.split('#')[0].split('?')[0]);
  const p = resolve(root, '.' + (clean.startsWith('/') ? clean : '/' + clean));
  if (!p.startsWith(resolve(root))) return null;
  if (existsSync(p) && statSync(p).isFile()) return p;
  if (existsSync(join(p, 'index.html'))) return join(p, 'index.html');
  if (existsSync(p + '.html')) return p + '.html';
  return null;
}

const ATTR_RE = /\s(?:href|src)="([^"]*)"/g;
const SKIP_RE = /^(?:[a-z][a-z0-9+.-]*:|\/\/|#?$|\{)/i;

function idsOf(html) {
  const ids = new Set();
  for (const m of html.matchAll(/\s(?:id|name)="([^"]+)"/g)) ids.add(m[1]);
  return ids;
}

export function checkSite(root) {
  const problems = [];
  const idCache = new Map();
  const pages = htmlFiles(root, root);
  for (const file of pages) {
    const html = readFileSync(file, 'utf8');
    const rel = '/' + relative(root, file).split(sep).join('/');
    const here = '/' + relative(root, dirname(file)).split(sep).join('/') + '/';
    /* Inline script bodies (JSON-LD, string-built URLs) and comments hold
       text that looks like a link but is not one. */
    const body = html.replace(/<!--[\s\S]*?-->/g, '').replace(/(<script\b[^>]*>)[\s\S]*?(<\/script>)/g, '$1$2');
    let scriptBytes = 0;
    for (const m of body.matchAll(/<script\b[^>]*\ssrc="([^"]+)"/g)) {
      const raw = m[1].replace(/&amp;/g, '&');
      if (SKIP_RE.test(raw)) continue;
      const target = resolveSitePath(root, raw.startsWith('/') ? raw : here + raw);
      if (target) scriptBytes += statSync(target).size;
    }
    for (const m of body.matchAll(ATTR_RE)) {
      const raw = m[1].replace(/&amp;/g, '&');
      if (raw.startsWith('#')) {
        const id = decodeURIComponent(raw.slice(1));
        if (id && !idsOf(html).has(id)) problems.push(rel + ': link to #' + id + ' has no matching id on the page');
        continue;
      }
      if (SKIP_RE.test(raw)) continue;
      const path = raw.startsWith('/') ? raw : here + raw;
      const target = resolveSitePath(root, path);
      if (!target) { problems.push(rel + ': broken link ' + raw); continue; }
      const frag = raw.includes('#') ? decodeURIComponent(raw.split('#')[1]) : '';
      if (frag && target.endsWith('.html')) {
        if (!idCache.has(target)) idCache.set(target, idsOf(readFileSync(target, 'utf8')));
        if (!idCache.get(target).has(frag)) problems.push(rel + ': link ' + raw + ' has no matching id on that page');
      }
    }
    const htmlBytes = Buffer.byteLength(html);
    if (htmlBytes > BUDGET.htmlBytes) problems.push(rel + ': HTML is ' + Math.round(htmlBytes / 1024) + 'KB, over the ' + Math.round(BUDGET.htmlBytes / 1024) + 'KB budget');
    if (scriptBytes > BUDGET.scriptBytes) problems.push(rel + ': loads ' + Math.round(scriptBytes / 1024) + 'KB of site JavaScript, over the ' + Math.round(BUDGET.scriptBytes / 1024) + 'KB budget');
  }
  return { pages: pages.length, problems };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(process.argv[2] || 'dist');
  if (!existsSync(root)) { console.error('check-site: ' + root + ' not found. Run `npx astro build` first.'); process.exit(2); }
  const { pages, problems } = checkSite(root);
  if (problems.length) {
    console.error('check-site: ' + problems.length + ' problem(s) in ' + pages + ' pages:\n  ' + problems.join('\n  '));
    process.exit(1);
  }
  console.log('check-site: ' + pages + ' pages, no broken links, every page within budget.');
}
