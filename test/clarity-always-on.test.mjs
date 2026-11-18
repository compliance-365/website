// Microsoft Clarity runs on every visit, whatever the visitor picks in the
// cookie banner, and the banner, privacy page and cookie page all say so.
// (Google Analytics cookies and first-touch tracking still wait for Accept.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

test('the banner starts Clarity once the page has loaded, without waiting for consent', () => {
  const s = read('src/components/CookieBanner.astro');
  assert.match(s, /afterLoad\(function \(\) \{ loadClarity\(\); \}\);/);
  assert.match(s, /if \(window\.__clarityLoaded\) return;/, 'only ever starts once');
});

test('Clarity is still only started from loadClarity(), not from the reject path', () => {
  const s = read('src/components/CookieBanner.astro');
  assert.equal((s.match(/clarity\.ms\/tag/g) || []).length, 1);
});

test('the banner, privacy page and cookie page all say Clarity runs on every visit', () => {
  assert.match(read('src/components/CookieBanner.astro'), /Clarity[^.]*on every visit/);
  assert.match(read('src/pages/privacy.astro'), /Clarity runs on every visit/);
  assert.match(read('src/pages/cookies.astro'), /Clarity[^.]*runs on every visit/i);
});
