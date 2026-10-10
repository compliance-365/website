/* Captures the Checkpoint screenshots shown on the service pages
 * ("What your deliverables look like" and similar).
 *
 * They are taken from the public demo tenant, so every image is a real
 * Checkpoint screen with the same sample data a visitor sees when they
 * open the demo. Each one is a plain crop of the screen — summary tiles
 * and the table under them — with nothing hidden or edited. Re-run it
 * after any change to these screens:
 *
 *   npm run build && npx http-server dist -p 4321 --silent &
 *   node scripts/capture-site-shots.mjs
 *
 * Writes WebP at two widths into public/assets/checkpoint-shots/, and
 * each image's size into src/data/checkpoint-shot-sizes.json.
 */
import { chromium } from 'playwright-core';
import sharp from 'sharp';
import { mkdirSync, writeFileSync } from 'node:fs';

const SIZES_FILE = 'src/data/checkpoint-shot-sizes.json';
const sizes = {};

const BASE = process.env.SHOT_BASE || 'http://localhost:4321/checkpoint/';
const OUT = 'public/assets/checkpoint-shots';
/* Captured at 2x; the larger file is for wide screens, the smaller one
   for phones (the pages use srcset). */
const WIDTHS = [1600, 900];

/* name, view, SoA framework (or null), the element the crop starts at,
   the element it ends at, and the tallest it may be in CSS pixels. The
   crop is as wide as the start element, plus a margin. */
const SOA = ['#v-soa .card:has(#soaRows)', '#v-soa .card:has(#soaRows)', 820];
const SHOTS = [
  ['risk-register', 'risks', null, '#riskKpiRow', '#v-risks .card:has(#riskRows)', 720],
  ['soa-iso27001', 'soa', 'iso27001', ...SOA],
  ['soa-iso27701', 'soa', 'iso27701', ...SOA],
  ['soa-iso42001', 'soa', 'iso42001', ...SOA],
  ['soa-essential8', 'soa', 'essential8', ...SOA],
  ['soa-nistcsf', 'soa', 'nistcsf', ...SOA],
  ['soa-dispirap', 'soa', 'dispirap', ...SOA],
  ['soa-soc2', 'soa', 'soc2', ...SOA],
  ['posture-scan', 'scan', null, '#v-scan .scan-summary', '#scanChecksCard', 470],
];

mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || '/opt/pw-browsers/chromium' });
const ctx = await browser.newContext({ viewport: { width: 1560, height: 1300 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.getByRole('button', { name: 'Explore the demo' }).first().click();
await page.waitForTimeout(2500);

for (const [name, view, fw, from, to, maxH] of SHOTS) {
  await page.evaluate(([v, f]) => { if (f) window._soaFw = f; window.App.go(v); }, [view, fw]);
  await page.waitForTimeout(1200);
  const box = await page.evaluate(([a, b, h]) => {
    const start = document.querySelector(a), end = document.querySelector(b);
    if (!start || !end) return null;
    /* Scroll so the crop starts below the sticky top bar. */
    window.scrollTo(0, start.getBoundingClientRect().top + window.scrollY - 110);
    const s = start.getBoundingClientRect(), e = end.getBoundingClientRect();
    const pad = 16;
    const y = Math.round(s.top - pad);
    return { x: Math.round(s.left - pad), y, width: Math.round(Math.max(s.width, e.width) + pad * 2),
      height: Math.min(h, Math.round(e.bottom + pad - y), Math.round(window.innerHeight - y)) };
  }, [from, to, maxH]);
  if (!box) throw new Error(`${name}: ${from} or ${to} not found`);
  await page.waitForTimeout(300);
  const png = await page.screenshot({ clip: box });
  for (const w of WIDTHS) {
    const img = sharp(png).resize({ width: w, withoutEnlargement: true });
    const out = await img.webp({ quality: 80, effort: 6 }).toBuffer();
    if (w === WIDTHS[0]) { const m = await sharp(out).metadata(); sizes[name] = { width: m.width, height: m.height }; }
    const file = `${OUT}/${name}${w === WIDTHS[0] ? '' : `-${w}`}.webp`;
    writeFileSync(file, out);
    console.log(`  ${file}  ${Math.round(out.length / 1024)}KB`);
  }
}

await browser.close();
/* Sizes for the pages' width/height attributes, so nothing shifts as
   an image loads. */
writeFileSync(SIZES_FILE, JSON.stringify(sizes, null, 2) + '\n');
console.log(`  ${SIZES_FILE}`);
