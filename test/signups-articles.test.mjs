// Sign-ups where readers decide (service pages, cost estimator), a
// one-off "ASD has published" alert on the Essential Eight pages, and the
// October 2026 regulatory articles: sourced, dated, no invented dates.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

test('the sign-up sends what it is for, so the notification says which list', () => {
  const c = read('src/components/DigestSignup.astro');
  assert.match(c, /body: JSON\.stringify\(\{ email, source, framework: topic \}\)/);
  assert.match(read('lambda/subscribe.js'), /body\.framework/, 'subscribe.js reads the topic as framework');
  const a = read('src/components/EssentialsAlert.astro');
  assert.match(a, /topic="Essentials series release alert"/);
  assert.match(a, /ASD has not given a date/);
});

test('the Essentials alert is on the three Essential Eight pages', () => {
  for (const p of ['src/pages/resources/asd-essentials-framework.astro', 'src/pages/resources/essential-eight-guide.astro', 'src/pages/services/essential-eight.astro']) {
    assert.match(read(p), /<EssentialsAlert source="essentials-alert-/, p);
  }
});

test('every other service page and the cost estimator offer the digest', () => {
  for (const s of ['iso27001', 'iso27701', 'iso42001', 'soc2', 'nist-csf', 'disp-ism-irap']) {
    assert.match(read(`src/pages/services/${s}.astro`), new RegExp(`<DigestSignup source="service-${s}" />`), s);
  }
  assert.match(read('src/pages/cost-estimator.astro'), /<DigestSignup source="cost-estimator" \/>/);
});

test('the October 2026 articles cite sources and a review date, and give no unannounced dates', () => {
  const posts = ['ism-september-2026-changes', 'privacy-act-tranche-2-draft-bill', 'privacy-policy-automated-decisions-10-december-2026', 'essentials-series-status-october-2026'];
  for (const p of posts) {
    const md = read(`src/content/blog/${p}.md`);
    assert.match(md, /\*\*Sources\*\*/, p);
    assert.ok((md.match(/\]\(https:\/\//g) || []).length >= 3, `${p} links at least three sources`);
    assert.match(md, /Last reviewed 10 October 2026/, p);
    assert.ok(!/\]\([^)]*\([^)]*\)[^)]*\)/.test(md.replace(/%28|%29/g, '')), `${p}: no raw parentheses inside a link URL`);
  }
  assert.match(read('src/content/blog/privacy-act-tranche-2-draft-bill.md'), /<strong>It is not law\.<\/strong>/);
  assert.match(read('src/content/blog/essentials-series-status-october-2026.md'), /has not published the final framework or given a release date/);
  assert.ok(!/expected late 2026/.test(read('src/content/blog/essentials-series-status-october-2026.md')));
});
