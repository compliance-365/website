/* Captures the screenshots used by public/checkpoint/onboarding.html.
 *
 * Re-runnable on purpose: the guide's images go stale the moment the
 * wizard or the dashboard changes, and a stale screenshot in a client
 * document is worse than none because the client trusts it and then
 * finds a screen that does not match. Run this after any change to the
 * onboarding flow.
 *
 *   npm run build && npx http-server dist -p 4321 --silent &
 *   node scripts/capture-onboarding-shots.mjs
 *
 * Writes optimised WebP into public/checkpoint/onboarding-img/, which
 * inline-onboarding-shots.mjs then embeds into the guide as data URIs
 * so the document stays a single shareable file.
 *
 * The two Microsoft-owned screens in the flow — creating a SharePoint
 * site, and the Entra admin-consent prompt — cannot be captured here;
 * they need a real tenant and a real admin sign-in. Those are left as
 * clearly-marked gaps for a human to drop in.
 */
import { chromium } from 'playwright-core';
import sharp from 'sharp';
import { mkdirSync, writeFileSync } from 'node:fs';

const BASE = process.env.SHOT_BASE || 'http://localhost:4321/checkpoint/';
const OUT = 'public/checkpoint/onboarding-img';
/* Captured at 980 rather than a desktop width on purpose: these are
   displayed around 640px wide in the guide, and a 1400px-wide capture
   scaled down leaves body text too small to read. Narrower capture =
   larger effective type. deviceScaleFactor 2 keeps it crisp. */
const WIDTH = 980;
const VIEWPORT = { width: WIDTH, height: 900 };

mkdirSync(OUT, { recursive: true });

/* Quality 78 WebP lands each shot around 20-40KB — small
   enough that the whole set can be embedded without the guide becoming
   unwieldy, and still sharp on a high-DPI screen at the ~640px the
   document actually displays them at. */
async function save(buf, name) {
  const out = await sharp(buf).resize({ width: WIDTH, withoutEnlargement: true }).webp({ quality: 78 }).toBuffer();
  writeFileSync(`${OUT}/${name}.webp`, out);
  console.log(`  ${name}.webp  ${Math.round(out.length / 1024)}KB`);
}

/* The wizard centres a short card in a tall viewport, so a plain
   viewport shot is mostly empty background — which reads as a mistake
   in a document. Clip to the step's own bounds plus breathing room. */
async function shotElement(selector, pad = 26) {
  const box = await page.evaluate(({ sel, p }) => {
    const els = [...document.querySelectorAll(sel)].filter((e) => e.offsetParent !== null);
    if (!els.length) return null;
    /* Both the sign-in gate and the wizard are full-height flex
       containers that centre a short card, so the container's own rect
       is mostly empty space. Take the union of its rendered descendants
       instead — that is where the content actually is, whatever the
       container does. */
    const kids = [...els[0].querySelectorAll('*')]
      .filter((e) => e.offsetParent !== null || e === els[0])
      .map((e) => e.getBoundingClientRect())
      .filter((r) => r.width > 0 && r.height > 0);
    const base = els[0].getBoundingClientRect();
    const rects = kids.length ? kids : [base];
    const top = Math.min(...rects.map((r) => r.top));
    const bottom = Math.max(...rects.map((r) => r.bottom));
    const left = Math.min(...rects.map((r) => r.left));
    const right = Math.max(...rects.map((r) => r.right));
    const x = Math.max(0, Math.round(left - p));
    const y = Math.max(0, Math.round(top - p));
    return {
      x, y,
      width: Math.min(window.innerWidth - x, Math.round(right - left + p * 2)),
      height: Math.min(window.innerHeight - y, Math.round(bottom - top + p * 2))
    };
  }, { sel: selector, p: pad });
  return box && box.width > 40 && box.height > 40 ? page.screenshot({ clip: box }) : page.screenshot();
}

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 2 });
const page = await ctx.newPage();

console.log('capturing:');

/* 1. The sign-in screen, before anything happens. */
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForTimeout(800);
await save(await shotElement('#gate', 24), 'signin');

/* 2-4. Wizard steps. Driven directly via Wizard.startAt() rather than
   clicked through, because the real path needs a live tenant sign-in.
   The screens are identical either way — startAt only changes which
   step is visible. */
const steps = [[5, 'wizard-site'], [4, 'wizard-activate'], [6, 'wizard-frameworks']];
for (const [n, name] of steps) {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(700);
  await page.evaluate((s) => window.Wizard.startAt(s), n);
  await page.waitForTimeout(600);
  if (n === 5) {
    // Show the recommended path filled in, which is what we ask them to do.
    await page.fill('#wizSitePath', '/sites/compliance');
  }
  await page.waitForTimeout(300);
  await save(await shotElement('.wizard-step', 30), name);
}

/* 5-6. What they get afterwards, from demo data — the payoff shots.
   Demo mode is used deliberately: it is the only dataset that is
   populated, consistent and safe to publish. */
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.getByRole('button', { name: 'Explore the demo' }).first().click();
await page.waitForTimeout(2400);
await save(await page.screenshot(), 'dashboard');

await page.locator('.nav-item[data-v="documents"]').first().click();
await page.waitForTimeout(1200);
await page.evaluate(() => {
  const t = document.querySelector('#docRows');
  if (t) window.scrollTo(0, t.getBoundingClientRect().top + window.scrollY - 220);
});
await page.waitForTimeout(400);
await save(await page.screenshot(), 'documents');

await browser.close();
console.log('done — now run: node scripts/inline-onboarding-shots.mjs');
