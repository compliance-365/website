// Search, AI crawlers and lead attribution: llms-full.txt is generated
// from the built pages, every enquiry says how the visitor found the site
// (and only remembers a first visit with analytics consent), and the
// time-sensitive regulatory notes carry sources and a review date.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pageText } from '../scripts/build-llms-full.mjs';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

test('llms-full.txt is built in postbuild and in the deploy, and linked from llms.txt', () => {
  assert.match(JSON.parse(read('package.json')).scripts.postbuild, /build-llms-full\.mjs dist/);
  assert.match(read('.github/workflows/deploy.yml'), /node scripts\/build-llms-full\.mjs dist/);
  assert.match(read('public/llms.txt'), /llms-full\.txt/);
  const r = pageText('<html><head><title>T &amp; Co</title></head><body><nav>menu</nav><main><h1>Hello</h1><p>Fixed &mdash; price</p><script>x()</script><ul><li>One</li><li>Two</li></ul></main></body></html>');
  assert.equal(r.title, 'T & Co');
  assert.equal(r.text, '# Hello\nFixed — price\n- One\n- Two');
  assert.ok(!/menu|x\(\)/.test(r.text), 'only <main>, no scripts');
});

test('robots.txt lets every crawler in, AI and search alike', () => {
  const robots = read('public/robots.txt');
  assert.match(robots, /^User-agent: \*\nDisallow:\n/m);
  assert.ok(!/User-agent: (GPTBot|ClaudeBot|PerplexityBot|Google-Extended|Bingbot)/i.test(robots), 'no crawler is singled out');
});

test('every enquiry carries how the visitor found the site', () => {
  const base = read('src/layouts/BaseLayout.astro');
  assert.match(base, /window\.c365LeadSource = function/);
  assert.match(base, /c365_consent[\s\S]{0,120}analytics_storage === 'granted'/, 'first visit only with analytics consent');
  assert.match(base, /30 \* 864e5/);
  assert.match(read('src/components/CookieBanner.astro'), /c365RememberFirstTouch\(\)/);
  for (const p of ['src/pages/contact.astro', 'src/pages/book.astro', 'src/pages/posture-scan/index.astro',
    ...['iso27001', 'iso27701', 'iso42001', 'soc2', 'essential-eight', 'disp-ism-irap'].map((f) => `src/pages/checklist/${f}.astro`)]) {
    assert.match(read(p), /window\.c365LeadSource\(\)/, p);
  }
  assert.ok(!/buildAIContext[\s\S]{0,1500}c365LeadSource/.test(read('src/pages/checklist/iso27001.astro')), 'not in the AI chat context');
  assert.match(read('public/checkpoint/app.js'), /firstTouch: websiteFirstTouch\(\)/);
  assert.match(read('src/pages/privacy.astro'), /How you found us:/);
});

test('time-sensitive regulatory notes cite sources and a review date', () => {
  const e8 = read('src/pages/resources/asd-essentials-framework.astro');
  assert.match(e8, /cyber\.gov\.au\/about-us\/view-all-content\/news\/consultation-on-evolution-of-essential-eight/);
  assert.match(e8, /itnews\.com\.au/);
  assert.match(e8, /Last reviewed 10 October 2026/);
  assert.ok(!/expected late 2026/.test(e8 + read('src/pages/services/essential-eight.astro') + read('src/pages/resources/essential-eight-guide.astro')), 'no unsourced release date');
  const priv = read('src/pages/resources/privacy-act-2024-readiness.astro');
  assert.match(priv, /exposure draft of the Privacy Amendment \(Personal Data Protection\) Bill 2026/);
  assert.match(priv, /hsfkramer\.com/);
  assert.match(read('src/pages/services/disp-ism-irap.astro'), /What changed in the ISM, September 2026[\s\S]*cyber\.gov\.au/);
});
