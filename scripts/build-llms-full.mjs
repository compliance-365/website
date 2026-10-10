// Writes dist/llms-full.txt: the readable text of the site's main pages in
// one plain-text file, for AI assistants and answer engines (the llms.txt
// convention; public/llms.txt is the short index and links here). Built
// from the finished HTML, so it always matches what the pages say.
//
//   node scripts/build-llms-full.mjs dist
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const DIST = process.argv[2] || 'dist';
const SITE = 'https://www.compliance365.com.au';
// The pages people ask about: what we do, Checkpoint, prices, and the guides.
const SECTIONS = ['', 'about/', 'pricing/', 'cost-estimator/', 'how-we-work/', 'services/', 'checkpoint-console/', 'resources/', 'case-studies/'];
// Not prose: the app itself, utility pages, and the 989-row RFFR control
// list (its own page is the place for that table).
const SKIP = /^(og|owner|checkpoint\/|start|thank-you|search|book|404)|^resources\/rffr-soa-controls\//;

function pagesUnder(rel) {
  const dir = join(DIST, rel);
  if (!existsSync(dir)) return [];
  const out = [];
  if (existsSync(join(dir, 'index.html'))) out.push(rel);
  if (rel === '') return out; // the homepage only, not the whole site again
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...pagesUnder(rel + name + '/'));
  }
  return out;
}

const decode = (s) => s
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#39;|&#x27;|&rsquo;|&lsquo;/g, "'").replace(/&ldquo;|&rdquo;/g, '"')
  .replace(/&mdash;/g, '—').replace(/&ndash;/g, '–').replace(/&hellip;/g, '…').replace(/&middot;/g, '·')
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n));

export function pageText(html) {
  const title = decode((html.match(/<title>([^<]*)<\/title>/) || [])[1] || '').trim();
  let m = html.match(/<main[\s\S]*?<\/main>/i);
  let body = m ? m[0] : html;
  body = body
    .replace(/<(script|style|noscript|svg|template|form|button|select)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<h1[^>]*>/gi, '\n\n# ').replace(/<h2[^>]*>/gi, '\n\n## ').replace(/<h3[^>]*>/gi, '\n\n### ').replace(/<h4[^>]*>/gi, '\n\n#### ')
    .replace(/<\/h[1-6]>/gi, '\n')
    .replace(/<li[^>]*>/gi, '\n- ').replace(/<(p|div|section|tr|summary|dt|dd|br)[^>]*>/gi, '\n')
    .replace(/<t[dh][^>]*>/gi, ' | ')
    .replace(/<[^>]+>/g, ' ');
  const text = decode(body)
    .split('\n').map((l) => l.replace(/[ \t]+/g, ' ').trim())
    .filter((l, i, a) => l && !(l === a[i - 1]))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n');
  return { title, text };
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) build();

function build() {
const paths = [...new Set(SECTIONS.flatMap(pagesUnder))].filter((p) => !SKIP.test(p)).sort();
const parts = [
  '# Compliance365: full text of the main pages',
  '',
  '', // summary line, filled in once the pages are counted
  '',
];
for (const rel of paths) {
  const html = readFileSync(join(DIST, rel, 'index.html'), 'utf8');
  if (/<meta[^>]+name="robots"[^>]+noindex/i.test(html)) continue;
  const { title, text } = pageText(html);
  parts.push('---', '', `Page: ${title}`, `URL: ${SITE}/${rel}`, '', text, '');
}
const count = parts.filter((l) => l.startsWith('URL: ')).length;
parts[2] = `> The readable text of ${count} pages of ${SITE}, generated from the published site at build time. The short index is ${SITE}/llms.txt.`;
const out = parts.join('\n');
writeFileSync(join(DIST, 'llms-full.txt'), out);
console.log(`build-llms-full: ${count} pages, ${Math.round(out.length / 1024)} KB -> ${DIST}/llms-full.txt`);
}
