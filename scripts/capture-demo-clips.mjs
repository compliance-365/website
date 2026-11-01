/* Records the short Checkpoint clips shown on the Checkpoint and service
 * pages, from the public demo tenant (the same sample data a visitor
 * sees). Nothing is edited: each clip is a recording of the demo doing
 * one thing, trimmed to that thing.
 *
 *   npm run build && (cd dist && python3 -m http.server 4400) &
 *   CLIP_BASE=http://localhost:4400/checkpoint/ node scripts/capture-demo-clips.mjs
 *
 * Needs ffmpeg with libx264 on PATH. Writes an H.264 MP4 and a WebP
 * poster per clip into public/assets/checkpoint-clips/, and their sizes
 * into src/data/checkpoint-clip-sizes.json.
 */
import { chromium } from 'playwright-core';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BASE = process.env.CLIP_BASE || 'http://localhost:4400/checkpoint/';
const OUT = 'public/assets/checkpoint-clips';
const SIZES = 'src/data/checkpoint-clip-sizes.json';
const W = 1280;

/* name: the window height, then the steps. `mark` is where the clip
   starts; everything before it (loading, opening the view) is cut. */
const CLIPS = {
  'posture-scan': [800, async (page, mark) => {
    await page.evaluate(() => window.App.go('scan'));
    await page.waitForTimeout(1500);
    mark();
    await page.waitForTimeout(800);
    await page.getByRole('button', { name: /Run scan now/ }).first().click();
    await page.waitForTimeout(4500);
  }],
  /* Switching framework re-renders the view from the top, so the window
     is tall enough to show the tabs and the controls under them. */
  'soa-frameworks': [1180, async (page, mark) => {
    await page.evaluate(() => { window._soaFw = 'iso27001'; window.App.go('soa'); });
    await page.waitForTimeout(1500);
    mark();
    for (const name of ['Essential Eight', 'SOC 2', 'ISO 42001', 'ISO 27001']) {
      await page.waitForTimeout(1300);
      await page.getByRole('button', { name, exact: true }).first().click();
    }
    await page.waitForTimeout(1500);
  }],
};

mkdirSync(OUT, { recursive: true });
const sizes = {};
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || '/opt/pw-browsers/chromium' });

for (const [name, [H, run]] of Object.entries(CLIPS)) {
  const dir = mkdtempSync(join(tmpdir(), 'clip-'));
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, recordVideo: { dir, size: { width: W, height: H } } });
  const page = await ctx.newPage();
  const t0 = Date.now();
  let start = 0;
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Explore the demo' }).first().click();
  await page.waitForTimeout(2500);
  await run(page, () => { start = (Date.now() - t0) / 1000; });
  const end = (Date.now() - t0) / 1000;
  await ctx.close();
  const webm = join(dir, readdirSync(dir).find((f) => f.endsWith('.webm')));
  const mp4 = `${OUT}/${name}.mp4`;
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', String(start), '-t', String(end - start), '-i', webm,
    '-vf', 'fps=25,scale=1280:-2', '-c:v', 'libx264', '-preset', 'slow', '-crf', '26', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', mp4]);
  /* Poster: the last frame, so the still shows the outcome. */
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-sseof', '-0.2', '-i', mp4, '-frames:v', '1', '-vf', 'scale=1280:-2', '-c:v', 'libwebp', '-quality', '78', `${OUT}/${name}.webp`]);
  sizes[name] = { width: W, height: H, seconds: Math.round((end - start) * 10) / 10 };
  rmSync(dir, { recursive: true, force: true });
  console.log(`  ${mp4}  ${sizes[name].seconds}s`);
}
await browser.close();
writeFileSync(SIZES, JSON.stringify(sizes, null, 2) + '\n');
console.log(`  ${SIZES}`);
