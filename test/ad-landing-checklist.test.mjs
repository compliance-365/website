import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { AD_LANDING_PAGES } from '../src/data/ad-landing-pages.js';

test('every ad landing page offers a free checklist that exists, as the smaller step', () => {
  for (const p of AD_LANDING_PAGES) {
    assert.ok(p.checklist && p.checklist.name, p.slug + ' has a checklist');
    assert.match(p.checklist.href, /^checklist\/[a-z0-9-]+\/$/, p.slug);
    assert.ok(existsSync('src/pages/' + p.checklist.href.replace(/\/$/, '.astro')), p.slug + ' -> ' + p.checklist.href);
  }
  const lp = readFileSync('src/pages/lp/[slug].astro', 'utf8');
  assert.match(lp, /data-lp-checklist/);
  assert.match(lp, /track\('lp_checklist_click'/);
});
