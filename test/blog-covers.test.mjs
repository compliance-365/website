// Every post has its own cover, so no card in "Keep reading" or on the
// blog index falls back to text, and the post page opens on a picture.
// A new post without one still gets its generated link-preview card in
// lists (cardImageUrl in src/lib/blog.ts), but should get a real cover.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';

const DIR = new URL('../src/content/blog/', import.meta.url);

test('every blog post names a cover image that exists', () => {
  for (const f of readdirSync(DIR).filter((n) => n.endsWith('.md'))) {
    const front = readFileSync(new URL(f, DIR), 'utf8').split('\n---\n')[0];
    const m = front.match(/^image:\s*"?([^"\n]+)"?/m);
    assert.ok(m, `${f} has no image: in its front matter`);
    assert.ok(existsSync(new URL('../public/' + m[1].replace(/^\//, ''), import.meta.url)), `${f}: ${m[1]} is not in public/`);
  }
});

test('lists fall back to the generated preview card, the post page does not', () => {
  const lib = readFileSync(new URL('../src/lib/blog.ts', import.meta.url), 'utf8');
  assert.match(lib, /export function cardImageUrl[\s\S]*og\/og-blog-\$\{post\.id\}\.png/);
  assert.match(readFileSync(new URL('../src/pages/blog/index.astro', import.meta.url), 'utf8'), /cardImageUrl\(post\)/);
  assert.match(readFileSync(new URL('../src/pages/blog/[slug].astro', import.meta.url), 'utf8'), /img: cardImageUrl\(x\.p, base\)/);
});
