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
