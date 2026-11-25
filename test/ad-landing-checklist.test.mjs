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

test('the guides offer a free readiness score near the top, from the shared checklist data', async () => {
  const { CHECKLISTS } = await import('../src/data/checklists.js');
  const box = readFileSync('src/components/ReadinessScoreBox.astro', 'utf8');
  assert.match(box, /from '\.\.\/data\/checklists\.js'/);
  assert.match(readFileSync('src/pages/checklist/index.astro', 'utf8'), /from '\.\.\/\.\.\/data\/checklists\.js'/, 'one source for the counts');
  const slugs = new Set(CHECKLISTS.map((c) => c.slug));
  for (const g of ['essential-eight-guide', 'is18-guide', 'iso27001-cost-australia', 'ai-governance-readiness', 'privacy-act-2024-readiness']) {
    const src = readFileSync(`src/pages/resources/${g}.astro`, 'utf8');
    const m = src.match(/<ReadinessScoreBox checklist="([a-z0-9-]+)" \/>/);
    assert.ok(m, g + ' has the box');
    assert.ok(slugs.has(m[1]), g + ' -> ' + m[1]);
    assert.ok(src.indexOf(m[0]) < src.length * 0.45, g + ': the box sits in the first part of the page');
  }
});

test('visitors are asked to follow the LinkedIn page where they have just got something useful', () => {
  const { LINKEDIN_PAGE } = { LINKEDIN_PAGE: readFileSync('src/data/social.js', 'utf8').match(/'(https:[^']+)'/)[1] };
  assert.match(LINKEDIN_PAGE, /^https:\/\/www\.linkedin\.com\/company\/compliance-365\/$/);
  for (const f of ['iso27001', 'essential-eight', 'is18', 'iso42001', 'iso27701', 'soc2', 'disp-ism-irap']) {
    const src = readFileSync(`src/pages/checklist/${f}.astro`, 'utf8');
    const stage3 = src.indexOf('id="stage-3"');
    assert.ok(stage3 > 0 && src.indexOf('<LinkedInFollow', stage3) > stage3, f + ': on the results stage');
  }
  for (const f of ['src/components/ReadinessScoreBox.astro', 'src/pages/thank-you.astro', 'src/pages/lp/[slug].astro']) {
    assert.match(readFileSync(f, 'utf8'), /<LinkedInFollow/, f);
  }
  assert.match(readFileSync('src/layouts/BaseLayout.astro', 'utf8'), /name = 'linkedin_follow_click'/);
});
