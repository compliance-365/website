// Two mistakes the Astro 7 upgrade surfaced on the live site: braces in
// an is:inline script are not template expressions (the 404 page shipped
// `var endings = {JSON.stringify(...)}` and its legacy redirects never
// ran), and a string passed as a prop is escaped once by Astro, so an
// `&amp;` in it shows as "&amp;" in the title or on the page.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('../src/', import.meta.url).pathname;
const files = [];
(function walk(d) { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (p.endsWith('.astro')) files.push(p); } })(root);

test('inline scripts take values through define:vars, not braces', () => {
  for (const f of files) {
    const src = readFileSync(f, 'utf8');
    for (const m of src.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
      if (!/is:inline/.test(m[1]) || /define:vars/.test(m[1])) continue;
      assert.ok(!/=\s*\{\s*(JSON\.stringify|[A-Z_]{3,}\s*\})/.test(m[2]), f.replace(root, 'src/') + ' has a template expression inside an is:inline script');
    }
  }
});

test('titles and subtitles passed as props use a plain &', () => {
  for (const f of files) {
    const src = readFileSync(f, 'utf8');
    for (const m of src.matchAll(/\b(title|subtitle|description)(=|:\s*)(["'])([^"'\n]*?&amp;[^"'\n]*?)\3/g)) {
      assert.fail(f.replace(root, 'src/') + ': ' + m[0] + ' is escaped twice when rendered');
    }
  }
});

test('Astro.glob is gone (removed in Astro 6)', () => {
  for (const f of files) assert.ok(!/Astro\.glob\(/.test(readFileSync(f, 'utf8')), f);
});

const srcFiles = [];
(function walk(d) { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (/\.(astro|ts)$/.test(p)) srcFiles.push(p); } })(root);

test('blog posts are read through the typed collection, not raw globs', () => {
  for (const f of srcFiles) {
    assert.ok(!/import\.meta\.glob\([^)]*content\/blog/.test(readFileSync(f, 'utf8')), f.replace(root, 'src/') + ' should use getPosts() from src/lib/blog.ts');
  }
});

test('dates shown to readers name a locale (an Australian site must not show 10/9/2025 for 9 October)', () => {
  for (const f of srcFiles) {
    assert.ok(!/toLocaleDateString\(\s*\)/.test(readFileSync(f, 'utf8')), f.replace(root, 'src/') + ' formats a date in the build machine’s locale');
  }
});

test('internal page links end in a slash (trailingSlash: always), so none costs a redirect', () => {
  const re = /(?:href=\{base \+ '|href:\s*`\$\{base\}|action=\{base \+ ')([a-z][a-z0-9/-]*?)(['`])/g;
  for (const f of srcFiles) {
    for (const m of readFileSync(f, 'utf8').matchAll(re)) {
      if (/\.[a-z0-9]+$/i.test(m[1]) || m[1].includes('${')) continue;
      assert.ok(m[1].endsWith('/'), f.replace(root, 'src/') + ' links to ' + m[1] + ' without the trailing slash');
    }
  }
});

test('no marketing page loads all of Checkpoint’s lib.js (about 840KB) for one function', () => {
  for (const f of files) {
    assert.ok(!/<script[^>]*src="\/checkpoint\/lib\.js"/.test(readFileSync(f, 'utf8')), f.replace(root, 'src/') + ' should inline only what it needs at build time');
  }
});

test('blog posts use the brand palette, not the generic blue/indigo/slate one', () => {
  const blogDir = join(root, 'content', 'blog');
  const OFF_BRAND = /#(1e40af|4f46e5|eef2ff|eff6ff|bfdbfe|e5e7eb|f9fafb|f8fafc|e2e8f0|64748b|0f172a|4b5563|f3f4f6|374151|111827)\b/i;
  for (const f of readdirSync(blogDir)) {
    const m = readFileSync(join(blogDir, f), 'utf8').match(OFF_BRAND);
    assert.ok(!m, 'src/content/blog/' + f + ' uses ' + (m && m[0]));
  }
});
