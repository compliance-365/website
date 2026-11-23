// Visual fixes that are easy to lose in a later edit: one floating button on
// phones, the blog's featured card stacking on phones, the service-page
// helpers (jump bar and folded grids), full-width service images, and a
// light placeholder while product screenshots load.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

test('phones show one floating button: the message launcher folds into Ask AI', () => {
  assert.match(read('public/assets/brand.css'), /body:has\(#c365-chat\) \.fab-msg \{ display: none; \}/);
  const chat = read('src/components/AIChat.astro');
  assert.match(chat, /class="c365-contact-row"/);
  assert.match(chat, /href="tel:\+61468752243"/);
  assert.match(chat, /c365-waiting/);
});

test('the blog featured card stacks on phones', () => {
  assert.match(read('src/pages/blog/index.astro'), /#featured-card \{ grid-template-columns: 1fr !important;/);
});

test('service pages load the page helpers, and only service pages', () => {
  const layout = read('src/layouts/BaseLayout.astro');
  assert.match(layout, /\/\^\\\/services\\\/\[\^\/\]\+\\\/\?\$\/\.test\(Astro\.url\.pathname\) && <script is:inline src="\/assets\/page-nav\.js" defer><\/script>/);
  const js = read('public/assets/page-nav.js');
  assert.match(js, /Show all/);
  assert.match(js, /aria-label', 'On this page'/);
});

test('services index shows each illustration at card width', () => {
  assert.match(read('src/pages/services/index.astro'), /<img src=\{s\.image\} alt="" width="720" height="470" style="width:100%;height:auto;/);
});

test('product screenshots load on a light placeholder, not a black box', () => {
  const shot = read('src/components/CheckpointShot.astro');
  assert.match(shot, /background: #E9E3D9 linear-gradient/);
  assert.match(shot, /prefers-reduced-motion: reduce/);
});
