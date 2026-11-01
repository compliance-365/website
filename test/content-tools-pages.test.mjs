// The new free tools and guides: the calendar repeats dates the site
// already states (and links to where), the sector matrix only names
// frameworks the site has a page for, and every page links where it says.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { EVENTS, RECURRING, split } from '../src/data/compliance-calendar.js';
import { FRAMEWORKS, SECTORS } from '../src/data/framework-by-sector.js';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const pageFor = (href) => {
  const h = href.replace(/\/$/, '');
  const cands = [`src/pages/${h}.astro`, `src/pages/${h}/index.astro`];
  if (h.startsWith('blog/')) cands.push(`src/content/blog/${h.slice(5)}.md`);
  return cands.find((c) => existsSync(new URL('../' + c, import.meta.url)));
};
const longDate = (iso) => new Date(iso + 'T00:00:00Z').toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

test('every calendar entry links to a page that exists', () => {
  for (const e of [...EVENTS, ...RECURRING]) assert.ok(pageFor(e.href), `${e.title}: ${e.href}`);
});

test('every exact calendar date appears in the source it cites', () => {
  for (const e of EVENTS) {
    assert.ok(existsSync(new URL('../' + e.src, import.meta.url)), `${e.title}: ${e.src}`);
    if (e.precision === 'month' || e.fw === 'IS18') continue; // IS18: "30 September" each year
    const src = read(e.src);
    const ok = src.includes(longDate(e.date)) || src.includes(e.date);
    assert.ok(ok, `${e.title}: ${longDate(e.date)} not found in ${e.src}`);
  }
  assert.match(read('src/pages/services/is18.astro'), /30 September/);
});

test('calendar splits around today', () => {
  const { past, upcoming } = split(new Date(2026, 10, 1));
  assert.ok(past.every((e) => e.date < '2026-11-01'));
  assert.equal(upcoming[0].date, '2026-12-10');
});

test('sector matrix names only frameworks with a service page', () => {
  for (const f of FRAMEWORKS) assert.ok(pageFor(f.href), f.href);
  const ids = new Set(FRAMEWORKS.map((f) => f.id));
  for (const s of SECTORS) {
    assert.ok(Object.values(s.cells).includes('core'), `${s.name} has a framework to start with`);
    for (const k of Object.keys(s.cells)) assert.ok(ids.has(k), `${s.name}: ${k}`);
  }
});

test('new pages exist and are linked from the resources index', () => {
  const pages = ['cps234-self-assessment', 'cps234-notification-calculator', 'automated-decisions-checker', 'framework-by-sector', 'compliance-calendar', 'resources/cps234-vs-iso27001', 'resources/is18-vs-essential-eight'];
  const idx = read('src/pages/resources/index.astro');
  for (const p of pages) {
    assert.ok(pageFor(p + '/'), p);
    assert.ok(idx.includes(p.replace('resources/', '')), `resources index links ${p}`);
  }
});
