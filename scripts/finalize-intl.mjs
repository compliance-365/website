/* Turns an international build (SITE_VARIANT=intl npx astro build) into
 * the www.compliance365.io site. Run on its output directory:
 *
 *   node scripts/finalize-intl.mjs dist
 *
 * - The region chooser built at /world/ becomes the home page.
 * - Only the country pages (src/data/site.js INTL_PATHS) stay as real
 *   pages. Every other page becomes a small redirect to the same path on
 *   www.compliance365.com.au, keeping its query string and #fragment, so
 *   Checkpoint, Microsoft sign-in and the forms (whose backends only
 *   accept .com.au) always run on .com.au, and nothing is published twice.
 * - Checkpoint's app files are removed: they only ever run on .com.au.
 * - Writes this site's robots.txt, sitemap, CNAME and .nojekyll.
 */
import { readdirSync, statSync, readFileSync, writeFileSync, rmSync, renameSync, existsSync, mkdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { AU_ORIGIN, INTL_ORIGIN, INTL_PATHS } from '../src/data/site.js';

export function stub(path) {
  const target = AU_ORIGIN + path;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Compliance365</title>
<meta name="robots" content="noindex">
<link rel="canonical" href="${target}">
<meta http-equiv="refresh" content="0; url=${target}">
<script>location.replace(${JSON.stringify(AU_ORIGIN)} + location.pathname + location.search + location.hash);</script>
</head>
<body><p>This page is at <a href="${target}">${target}</a>.</p></body>
</html>
`;
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
}

const pathOf = (dist, file) => {
  const rel = relative(dist, file).split(sep).join('/');
  return '/' + rel.replace(/index\.html$/, '').replace(/\.html$/, '');
};

export function finalize(dist) {
  if (!existsSync(join(dist, 'world', 'index.html'))) throw new Error(`${dist}/world/index.html missing: was this built with SITE_VARIANT=intl?`);
  renameSync(join(dist, 'world', 'index.html'), join(dist, 'index.html'));
  rmSync(join(dist, 'world'), { recursive: true, force: true });

  for (const app of ['checkpoint', 'owner']) {
    rmSync(join(dist, app), { recursive: true, force: true });
    mkdirSync(join(dist, app), { recursive: true });
    writeFileSync(join(dist, app, 'index.html'), stub(`/${app}/`));
  }

  let stubs = 0;
  for (const file of walk(dist)) {
    if (!file.endsWith('.html')) continue;
    const path = pathOf(dist, file);
    if (INTL_PATHS.includes(path)) continue;
    writeFileSync(file, stub(path === '/404' ? '/' : path));
    stubs++;
  }

  writeFileSync(join(dist, 'robots.txt'), `User-agent: *\nDisallow:\n\nSitemap: ${INTL_ORIGIN}/sitemap-index.xml\n`);
  for (const f of readdirSync(dist)) if (/^sitemap.*\.xml$/.test(f)) rmSync(join(dist, f));
  writeFileSync(join(dist, 'sitemap-0.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${INTL_PATHS.map((p) => `  <url><loc>${INTL_ORIGIN}${p}</loc></url>`).join('\n')}
</urlset>
`);
  writeFileSync(join(dist, 'sitemap-index.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap><loc>${INTL_ORIGIN}/sitemap-0.xml</loc></sitemap>
</sitemapindex>
`);
  writeFileSync(join(dist, 'CNAME'), new URL(INTL_ORIGIN).host + '\n');
  writeFileSync(join(dist, '.nojekyll'), '');
  return { stubs };
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const dist = process.argv[2] || 'dist';
  const { stubs } = finalize(dist);
  console.log(`finalize-intl: ${INTL_PATHS.length} country pages kept, ${stubs} pages redirect to ${AU_ORIGIN}`);
}
