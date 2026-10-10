// Checkpoint SEO pages (framework pages, comparisons, the demo page):
// every demo link opens a real screen, every link resolves, prices come
// from pricing.js, and the facts most likely to drift stay pinned to the
// Checkpoint code they describe.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const src = (p) => new URL('../src/' + p, import.meta.url);
const read = (p) => readFileSync(src(p), 'utf8');
const pub = (p) => readFileSync(new URL('../public/' + p, import.meta.url), 'utf8');
const fw = read('data/checkpoint-frameworks.ts');
const cmp = read('data/checkpoint-comparisons.ts');
const demoPage = read('pages/checkpoint-console/demo.astro');
const html = pub('checkpoint/index.html');
const store = pub('checkpoint/store.js');

test('framework and demo pages open the demo on screens that exist', () => {
  const views = [...fw.matchAll(/demoView: '([^']+)'/g), ...demoPage.matchAll(/\{ v: '([^']+)'/g)].map((m) => m[1]);
  assert.ok(views.length >= 14);
  for (const v of views) assert.match(html, new RegExp('data-v="' + v + '"'), v);
});

test('each framework page names a priced module and a consulting page that exist', async () => {
  const { MODULES } = await import('../src/data/pricing.js');
  const ids = [...fw.matchAll(/moduleId: '([^']+)'/g)].map((m) => m[1]);
  assert.deepEqual(ids.sort(), MODULES.map((m) => m.id).sort(), 'one page per self-serve module');
  for (const m of fw.matchAll(/servicePath: '([^']+)'/g)) assert.ok(existsSync(src('pages/' + m[1].replace(/\/$/, '') + '.astro')), m[1]);
  assert.doesNotMatch(fw.replace(/description: '[^']*'/g, ''), /\$\d/, 'prices on the page come from pricing.js');
});

test('prices quoted in descriptions match pricing.js', async () => {
  const { MODULES } = await import('../src/data/pricing.js');
  for (const block of fw.split(/\n  \{\n/).slice(1)) {
    const id = (/moduleId: '([^']+)'/.exec(block) || [])[1];
    const m = /From \$([\d,]+) a year/.exec(block);
    if (!id || !m) continue;
    assert.equal(Number(m[1].replace(/,/g, '')), MODULES.find((x) => x.id === id).prices.micro, id);
  }
});

test('the counts the pages quote match Checkpoint', () => {
  const vm = { window: { CHECKPOINT_CONFIG: { scopesProvision: [], scopesReadOnly: [] } } };
  const fn = new Function('window', 'localStorage', store + '\n;return window;');
  let w; try { w = fn(vm.window, { getItem() { return null; }, setItem() {} }); } catch (e) { w = vm.window; }
  const defs = w.CHECK_DEFS;
  const m365 = defs.filter((c) => !/^(aws|gh)-/.test(c.id)).length;
  assert.equal(m365, 49);
  assert.equal(defs.filter((c) => /^aws-/.test(c.id)).length, 10);
  assert.equal(defs.filter((c) => /^gh-/.test(c.id)).length, 7);
  assert.equal(w.FRAMEWORKS.iso27001.controls.length, 93);
  for (const id of ['wdac', 'macro', 'patch', 'admins', 'pim', 'backup', 'riskyapps', 'privacy-srr', 'retention']) assert.ok(defs.some((c) => c.id === id), id);
  for (const f of [fw, cmp, demoPage, pub('llms.txt')]) for (const n of f.matchAll(/(\d+) (?:checks|posture checks)/g)) assert.ok(['49', '10', '7'].includes(n[1]), n[0]);
});

test('every comparison cites its sources and dates them', () => {
  assert.match(cmp, /export const CHECKED = '[A-Z][a-z]+ 20\d\d';/);
  const blocks = cmp.split(/\n  \{\n    slug: /).slice(1);
  assert.equal(blocks.length, 4);
  for (const b of blocks) {
    if (b.startsWith("'spreadsheets'")) continue;
    assert.match(b, /sources: \[\s*\{ label: '[^']+', url: 'https:\/\//, b.slice(0, 30));
  }
});

test('the new pages are linked from the Checkpoint page, footer, guides and llms.txt', () => {
  const ckpt = read('pages/checkpoint-console/index.astro');
  assert.match(ckpt, /frameworkPages\.map/);
  assert.match(ckpt, /schema=\{\[softwareSchema\]\}/);
  const footer = read('components/Footer.astro');
  for (const p of ['checkpoint-console/demo/', 'checkpoint-console/compare/']) assert.ok(footer.includes(p), p);
  const llms = pub('llms.txt');
  for (const s of [...fw.matchAll(/slug: '([^']+)'/g)].map((m) => m[1])) assert.ok(llms.includes('/checkpoint-console/' + s + '/'), s);
  for (const g of ['inside-statement-of-applicability', 'essential-eight-guide', 'risk-register-sharepoint', 'iso27001-cost-australia', 'automating-compliance'])
    assert.match(read('pages/resources/' + g + '.astro'), /<CheckpointCallout slug="[a-z0-9-]+"/, g);
  assert.match(read('components/RelatedResources.astro'), /checkpoint-console\/essential-eight-software\//);
  assert.match(read('pages/blog/[slug].astro'), /ckpt: 'checkpoint-console\/iso-27001-software\/'/);
});
