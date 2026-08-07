// Produces web-sized derivatives for the few large raster images in
// public/assets/. Everything else on the site is SVG, so this deliberately
// works from an explicit list rather than sweeping the directory — a sweep
// would keep re-encoding OG images that are already generated at the right
// size by src/pages/og/.
//
// Re-run with:  node scripts/optimise-images.mjs
import sharp from 'sharp';
import { statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const ASSETS = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'assets');

// source, output basename, widths to emit. The source stays in the repo as
// the master; the derivatives are what the pages actually reference.
const JOBS = [
  { src: 'about.png', out: 'about', widths: [1100, 700] },
  // Credential badges on /about/. Rendered ~100px tall, so 2x is plenty; the
  // Lead Auditor source is a 116 KB PNG at 300x350.
  // NOTE: `out` must differ from `src`, or the derivative would overwrite the
  // master it was generated from.
  { src: 'badges/cism.png', out: 'badges/cism-web', widths: [200] },
  { src: 'badges/iso-27001-lead-auditor.png', out: 'badges/iso-27001-lead-auditor-web', widths: [172] },
];

const kb = (p) => (statSync(p).size / 1024).toFixed(0).padStart(5);

for (const job of JOBS) {
  const src = join(ASSETS, job.src);
  console.log(`${job.src} — source ${kb(src)} KB`);

  for (const w of job.widths) {
    const suffix = w === job.widths[0] ? '' : `-${w}`;

    const webp = join(ASSETS, `${job.out}${suffix}.webp`);
    await sharp(src).resize({ width: w, withoutEnlargement: true })
      .webp({ quality: 78, effort: 6 }).toFile(webp);
    console.log(`  ${kb(webp)} KB  ${job.out}${suffix}.webp`);

    // Fallback for anything that can't take WebP. WebP support is effectively
    // universal now, but a <picture> costs nothing and keeps the page working
    // for anything odd in a corporate SOE — which is exactly this site's
    // audience. Images with an alpha channel fall back to PNG, since JPEG
    // would flatten transparency onto black.
    const meta = await sharp(src).metadata();
    const ext = meta.hasAlpha ? 'png' : 'jpg';
    const fallback = join(ASSETS, `${job.out}${suffix}.${ext}`);
    const pipeline = sharp(src).resize({ width: w, withoutEnlargement: true });
    await (meta.hasAlpha
      ? pipeline.png({ compressionLevel: 9, palette: true })
      : pipeline.jpeg({ quality: 80, progressive: true, mozjpeg: true })
    ).toFile(fallback);
    console.log(`  ${kb(fallback)} KB  ${job.out}${suffix}.${ext}`);
  }
}
