// The service and Checkpoint pages show real Checkpoint screens from the
// demo tenant (scripts/capture-site-shots.mjs), not drawn mock-ups; the
// demo has progress on every framework so those screens are worth
// showing; and the cost estimator is easy to find and offers
// Checkpoint plus consulting days at the published day rate.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import sharp from 'sharp';
import sizes from '../src/data/checkpoint-shot-sizes.json' with { type: 'json' };
import { estimate, DAY_OPTIONS, DEFAULT_DAYS, checkpointLicence, FRAMEWORKS } from '../src/data/cost-estimator.js';
import { CONSULTING_DAY_RATE } from '../src/data/pricing.js';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const SHOT_DIR = new URL('../public/assets/checkpoint-shots/', import.meta.url);

test('every screenshot exists at both widths, at the size the pages declare', async () => {
  for (const [name, s] of Object.entries(sizes)) {
    for (const f of [`${name}.webp`, `${name}-900.webp`]) assert.ok(existsSync(new URL(f, SHOT_DIR)), f);
    const m = await sharp(new URL(`${name}.webp`, SHOT_DIR).pathname).metadata();
    assert.deepEqual({ width: m.width, height: m.height }, s, `${name}: re-run scripts/capture-site-shots.mjs`);
  }
  const shots = read('src/data/checkpoint-shots.ts');
  for (const name of Object.keys(sizes)) assert.ok(shots.includes(`'${name}'`), `${name} is listed in checkpoint-shots.ts`);
});

test('no page uses the old SharePoint mock-ups', () => {
  assert.ok(!readdirSync(new URL('../public/assets/', import.meta.url)).some((f) => f.startsWith('mockup-')));
  const pages = ['iso27001', 'iso27701', 'iso42001', 'soc2', 'nist-csf', 'essential-eight', 'disp-ism-irap'];
  for (const p of pages) {
    const src = read(`src/pages/services/${p}.astro`);
    assert.ok(!src.includes('mockup-'), p);
    assert.match(src, /<CheckpointShot id="/, `${p} shows a real Checkpoint screen`);
    assert.ok(!/look like inside SharePoint/.test(src), `${p} no longer describes the screens as SharePoint`);
  }
  assert.match(read('src/pages/checkpoint-console/[slug].astro'), /<CheckpointShot/);
});

test('each screenshot links to the same screen in the demo', () => {
  const c = read('src/components/CheckpointShot.astro');
  assert.match(c, /checkpoint\/\?demo=1&view=\$\{s\.view\}\$\{s\.fw \? `&fw=\$\{s\.fw\}` : ''\}/);
  assert.match(c, /demo tenant with sample data/);
  const app = read('public/checkpoint/app.js');
  assert.match(app, /get\('fw'\)[\s\S]{0,200}window\._soaFw = startFw/, 'the demo honours &fw=');
});

const require = createRequire(import.meta.url);
global.window = global.window || {};
window.CHECKPOINT_CONFIG = window.CHECKPOINT_CONFIG || { scopesProvision: [] };
require('../public/checkpoint/store.js');
require('../public/checkpoint/guidance.js');
const S = await window.DemoStore.load();

test('the demo frameworks the website shows are part-way through; scan targets and the rest stay Not started', () => {
  const controls = (S && S.controls) || [];
  for (const fw of ['soc2', 'essential8', 'iso42001', 'iso27701', 'nistcsf', 'dispirap']) {
    const rows = controls.filter((c) => c.fw === fw);
    assert.ok(rows.some((c) => c.st === 'Implemented'), `${fw} has implemented controls`);
    assert.ok(rows.some((c) => c.st === 'In progress'), `${fw} has controls in progress`);
    const targets = Object.values(window.DEMO_CHECK_SEEDS[fw] || {}).flat();
    for (const code of targets) {
      const row = rows.find((c) => c.id === code);
      assert.equal(row && row.st, 'Not started', `${fw} ${code} stays Not started so the demo scan still proposes it`);
    }
    for (const c of rows.filter((r) => r.st === 'Implemented')) assert.ok(c.own && c.verified, `${fw} ${c.id} implemented with an owner and a verified date`);
  }
  for (const fw of ['is18', 'rffr', 'cps234', 'privacyact']) {
    assert.ok(controls.filter((c) => c.fw === fw).every((c) => c.st === 'Not started'), `${fw} stays not started, behind the dashboard's toggle`);
  }
});

test('Checkpoint plus consulting days: licence plus the chosen days at the day rate', () => {
  assert.equal(CONSULTING_DAY_RATE, 2000);
  assert.ok(DAY_OPTIONS.includes(DEFAULT_DAYS));
  for (const fw of Object.keys(FRAMEWORKS)) {
    for (const days of DAY_OPTIONS) {
      const self = estimate({ fw, size: 'm', approach: 'selfserve' });
      const r = estimate({ fw, size: 'm', approach: 'days', days: String(days) });
      const fee = days * CONSULTING_DAY_RATE;
      assert.deepEqual(r.year1Total, [self.year1Total[0] + fee, self.year1Total[1] + fee], `${fw} ${days} days`);
      assert.deepEqual(r.threeYearTotal, [self.threeYearTotal[0] + fee, self.threeYearTotal[1] + fee], `${fw}: days are year 1 only`);
      assert.ok(r.year1.some((i) => i.label.includes(`${days} days at $2,000 a day`)));
      assert.ok(r.notes.some((n) => /years 2 and 3 are booked as you need them/.test(n)));
    }
  }
  const odd = estimate({ fw: 'iso27001', size: 's', approach: 'days', days: '7' });
  assert.ok(odd.year1.some((i) => i.label.includes(`${DEFAULT_DAYS} days`)), 'an unknown day count falls back to the default');
  assert.equal(checkpointLicence('iso27001', 'm').amount, 9999);
});

test('the estimator is findable: menu, pricing page, its own page, and near the top of each service page', () => {
  assert.match(read('src/components/Header.astro'), /href=\{base \+ 'cost-estimator\/'\}/);
  const pricing = read('src/pages/pricing.astro');
  assert.match(pricing, /cost-estimator\//);
  assert.match(pricing, /Checkpoint plus consulting days/);
  assert.match(pricing, /fmtAud\(CONSULTING_DAY_RATE\)/);
  assert.ok(existsSync(new URL('../src/pages/cost-estimator.astro', import.meta.url)));
  const map = { iso27001: 'iso27001', iso27701: 'iso27701', iso42001: 'iso42001', soc2: 'soc2', 'nist-csf': 'nistcsf', 'essential-eight': 'essential8' };
  for (const [p, fw] of Object.entries(map)) {
    const src = read(`src/pages/services/${p}.astro`);
    assert.match(src, new RegExp(`href="#ce-${fw}"`), `${p}: hero links to its estimator`);
    const at = src.indexOf(`<CostEstimator fw="${fw}" />`);
    const sections = src.slice(0, at).split('</section>').length - 1;
    assert.ok(at > 0 && sections <= 3, `${p}: estimator sits right after the hero and one section (found after ${sections})`);
  }
});

test('year 1 says how much goes to the certification body, and the quote button prefills the contact form', () => {
  const r = estimate({ fw: 'iso27001', size: 's', approach: 'days', days: '2' });
  assert.deepEqual(r.year1Ours, [7000 + 2 * CONSULTING_DAY_RATE, 7000 + 2 * CONSULTING_DAY_RATE]);
  assert.deepEqual(r.year1External, FRAMEWORKS.iso27001.audit.bands.s);
  assert.deepEqual([r.year1Ours[0] + r.year1External[0], r.year1Ours[1] + r.year1External[1]], r.year1Total);
  assert.deepEqual(estimate({ fw: 'essential8', size: 's', approach: 'selfserve' }).year1External, [0, 0], 'no certification audit, no split');
  assert.equal(DEFAULT_DAYS, 2);
  const c = read('src/components/CostEstimator.astro');
  assert.match(c, /checked=\{i === 0\} \/> <span>\{s\.label\}/, 'starts on the smallest size');
  assert.match(c, /cta\.href = `\$\{cta\.dataset\.contact\}\?\$\{q\}`/);
  const contact = read('src/pages/contact.astro');
  assert.match(contact, /qp\.get\('subject'\) \|\| ''\)\.slice\(0, 200\)/);
  assert.match(contact, /qp\.get\('message'\) \|\| ''\)\.slice\(0, 2000\)/);
  assert.match(contact, /\.value = preMessage/, 'set as a value, never as HTML');
});
