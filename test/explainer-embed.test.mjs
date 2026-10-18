import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/* The how-we-work page plays the 90-second explainer by swapping its
   poster for an iframe of /brand-explainer.html. That broke silently
   twice over: the CSP's frame-src listed only Outlook and Paddle, so
   the browser refused to frame our own page, and the iframe's sizing
   rule was component-scoped, so the script-made iframe sat at 300x150. */

test("the CSP lets the site frame its own pages", () => {
  const cfg = readFileSync('astro.config.mjs', 'utf8');
  const frameSrc = cfg.match(/"frame-src ([^"]*)"/);
  assert.ok(frameSrc, 'frame-src directive not found');
  assert.match(frameSrc[1], /'self'/);
});

test('the explainer iframe is sized by a :global rule', () => {
  const page = readFileSync('src/pages/how-we-work.astro', 'utf8');
  assert.match(page, /\.explainer-frame :global\(iframe\)\s*\{[^}]*width:\s*100%[^}]*height:\s*100%/);
});

test('the explainer pages load no third-party fonts', () => {
  for (const f of ['public/brand-explainer.html', 'public/brand-explainer-vertical.html']) {
    const s = readFileSync(f, 'utf8');
    assert.doesNotMatch(s, /fonts\.googleapis\.com|fonts\.gstatic\.com/, f);
    assert.match(s, /Bricolage Grotesque/, f);
  }
});
