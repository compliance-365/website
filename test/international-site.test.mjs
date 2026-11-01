// The international site (www.compliance365.io) is built from the same
// code with SITE_VARIANT=intl. Pinned here: only the country pages are
// real pages there; everything else redirects to the same path on
// .com.au; hreflang ties the Australian home page to the country pages,
// and .com.au only claims it once the .io site is live.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const au = await import('../src/data/site.js');
process.env.SITE_VARIANT = 'intl';
const intl = await import('../src/data/site.js?intl');
delete process.env.SITE_VARIANT;
const { REGION_COPY } = await import('../src/data/regions.js');

test('the .com.au build is unchanged until the .io site is live', () => {
  assert.equal(au.VARIANT, 'au');
  assert.equal(au.canonicalFor('/services/iso27001/'), 'https://www.compliance365.com.au/services/iso27001/');
  assert.deepEqual(au.localeFor('/'), { lang: 'en-AU', og: 'en_AU' });
  if (!au.INTL_LIVE) assert.deepEqual(au.hreflangFor('/'), [], 'no hreflang pointing at a domain that only forwards');
});

test('once .io is live, the .com.au home page carries the same hreflang cluster, and only the home page', () => {
  assert.equal(au.INTL_LIVE, true);
  assert.deepEqual(au.hreflangFor('/').map((h) => h.hreflang), ['en-AU', 'en-US', 'en-GB', 'en-AE', 'x-default']);
  assert.deepEqual(au.hreflangFor('/').map((h) => h.href), intl.hreflangFor('/us/').map((h) => h.href), 'both sites describe the same cluster');
  assert.deepEqual(au.hreflangFor('/services/iso27001/'), []);
});

test('on .io, country pages are canonical to themselves and carry the hreflang cluster', () => {
  assert.equal(intl.VARIANT, 'intl');
  assert.equal(intl.canonicalFor('/us/'), 'https://www.compliance365.io/us/');
  assert.equal(intl.canonicalFor('/world/'), 'https://www.compliance365.io/', 'the region chooser is the home page');
  assert.equal(intl.canonicalFor('/services/soc2/'), 'https://www.compliance365.com.au/services/soc2/');
  const cluster = intl.hreflangFor('/uk/').map((h) => `${h.hreflang} ${h.href}`);
  assert.deepEqual(cluster, [
    'en-AU https://www.compliance365.com.au/',
    'en-US https://www.compliance365.io/us/',
    'en-GB https://www.compliance365.io/uk/',
    'en-AE https://www.compliance365.io/ae/',
    'x-default https://www.compliance365.io/',
  ]);
  assert.deepEqual(intl.hreflangFor('/blog/'), []);
  assert.equal(intl.localeFor('/ae/').lang, 'en-AE');
  assert.equal(intl.localeFor('/us/').og, 'en_US');
});

test('every region has copy, and its service links are real .com.au pages', () => {
  for (const r of Object.keys(au.REGIONS)) {
    const c = REGION_COPY[r];
    assert.ok(c && c.title.length <= 60, `${r} title fits a search result`);
    assert.ok(c.description.length <= 160, `${r} description fits a search result`);
    for (const s of [...c.services, ...(c.guides || [])]) {
      const h = s.href.replace(/\/$/, '');
      const blog = h.startsWith('blog/') && existsSync(new URL(`../src/content/blog/${h.slice(5)}.md`, import.meta.url));
      assert.ok(blog || existsSync(new URL(`../src/pages/${h}.astro`, import.meta.url)) || existsSync(new URL(`../src/pages/${h}/index.astro`, import.meta.url)), `${r}: ${s.href}`);
    }
  }
  assert.ok(REGION_COPY.us.asks.some((a) => /SOC 2/.test(a.h) && /CPA firm/.test(a.p)), 'SOC 2 reports come from a CPA firm, not us');
  assert.ok(REGION_COPY.uk.asks.some((a) => /Cyber Essentials/.test(a.h) && /IASME-licensed/.test(a.p)), 'Cyber Essentials is certified by an IASME body, not us');
});

test('finalize-intl keeps only the country pages and redirects the rest', async () => {
  const { finalize } = await import('../scripts/finalize-intl.mjs');
  const dist = mkdtempSync(join(tmpdir(), 'intl-'));
  const page = (p, html) => { mkdirSync(join(dist, p), { recursive: true }); writeFileSync(join(dist, p, 'index.html'), html); };
  page('', 'AU HOME'); page('world', 'CHOOSER'); page('us', 'US'); page('uk', 'UK'); page('ae', 'AE');
  page('services/soc2', 'SOC2'); page('checkpoint', 'APP'); writeFileSync(join(dist, 'checkpoint', 'app.js'), 'x');
  writeFileSync(join(dist, '404.html'), '404'); writeFileSync(join(dist, 'sitemap-0.xml'), 'old');
  finalize(dist);
  const read = (p) => readFileSync(join(dist, p), 'utf8');
  assert.equal(read('index.html'), 'CHOOSER');
  assert.equal(read('us/index.html'), 'US');
  assert.ok(!existsSync(join(dist, 'world')));
  assert.ok(!existsSync(join(dist, 'checkpoint', 'app.js')), 'Checkpoint only runs on .com.au');
  assert.match(read('services/soc2/index.html'), /url=https:\/\/www\.compliance365\.com\.au\/services\/soc2\//);
  assert.match(read('services/soc2/index.html'), /location\.search \+ location\.hash/, 'keeps ?demo=1 and #anchors');
  assert.match(read('404.html'), /location\.replace/);
  assert.equal(read('CNAME').trim(), 'www.compliance365.io');
  assert.match(read('robots.txt'), /Sitemap: https:\/\/www\.compliance365\.io\/sitemap-index\.xml/);
  assert.equal((read('sitemap-0.xml').match(/<loc>/g) || []).length, 4);
});
