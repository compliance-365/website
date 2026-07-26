/* Embeds public/checkpoint/onboarding-img/*.webp into
 * public/checkpoint/onboarding.html as data URIs.
 *
 * The guide is deliberately a single self-contained file — it gets
 * emailed to clients, saved to disk and printed, and a relative image
 * path breaks all three. Referencing the shared build output is also
 * not an option: the build content-hashes assets and rewrites only
 * index.html and styles.css, so a relative path from this standalone
 * page would 404 and leave a broken image in a client's inbox.
 *
 * Idempotent. Each <img> carries data-shot="name"; this replaces the
 * src every run, so re-capturing and re-inlining just updates them.
 *
 *   node scripts/capture-onboarding-shots.mjs
 *   node scripts/inline-onboarding-shots.mjs
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const PAGE = 'public/checkpoint/onboarding.html';
const IMGDIR = 'public/checkpoint/onboarding-img';

let html = readFileSync(PAGE, 'utf8');

/* Placeholders for the Microsoft-owned screens sit commented out in the
   page, waiting for someone to capture them from a real tenant. Scan
   with comments stripped so those do not count as missing assets —
   uncommenting one is what opts it in. */
const live = html.replace(/<!--[\s\S]*?-->/g, '');
const wanted = [...live.matchAll(/data-shot="([a-z-]+)"/g)].map((m) => m[1]);
if (!wanted.length) throw new Error('no data-shot="…" images found in ' + PAGE);

let done = 0;
for (const name of [...new Set(wanted)]) {
  const file = `${IMGDIR}/${name}.webp`;
  if (!existsSync(file)) throw new Error(`missing ${file} — run capture-onboarding-shots.mjs first`);
  const b64 = readFileSync(file).toString('base64');
  // Replace whatever src that img currently has, in place.
  const re = new RegExp('(<img[^>]*data-shot="' + name + '"[^>]*\\ssrc=")[^"]*(")');
  /* Check the tag matched, NOT that the output changed — re-running
     after a capture that produced byte-identical bytes is a no-op, and
     treating that as a failure made this script throw on its own
     success. */
  if (!re.test(html)) {
    throw new Error(`no <img data-shot="${name}" … src="…"> found — the img needs a src attribute after data-shot`);
  }
  html = html.replace(re, (_m, a, b) => a + 'data:image/webp;base64,' + b64 + b);
  done++;
}

writeFileSync(PAGE, html);
console.log(`inlined ${done} screenshot(s); ${PAGE} is now ${Math.round(Buffer.byteLength(html) / 1024)}KB`);
