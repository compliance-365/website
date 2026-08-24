import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/* Guards against the colour-contrast defects a rendered-contrast sweep
   found across the site, so they cannot come back by hand.

   The sweep measured 175 text nodes below the WCAG AA 4.5:1 floor. They
   collapsed to eight colour pairs, and two mistakes accounted for most
   of them — both easy to reintroduce, because both look reasonable in
   source and only fail once rendered against their actual ground.

   These checks are deliberately narrow. They do not try to police every
   colour in the codebase; they encode the two specific errors that were
   made hundreds of times, plus a ratchet so the broader pile of inline
   colours can only shrink. */

const ROOTS = ['src/pages', 'src/components', 'src/layouts'];

function astroFiles(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) astroFiles(p, out);
    else if (entry.endsWith('.astro')) out.push(p);
  }
  return out;
}
const FILES = ROOTS.flatMap(r => astroFiles(r));
const STYLE_ATTR = /style="([^"]*)"/g;

/* `(?<![-\w])` keeps this off border-color, background-color,
   outline-color, caret-color and text-decoration-color, which all end
   in "color" and are legitimate uses of the brand gold. */
const TEXT_COLOUR = /(?<![-\w])color:\s*(#[0-9A-Fa-f]{3,8})/g;

function inlineTextColours(src) {
  const found = [];
  for (const m of src.matchAll(STYLE_ATTR)) {
    for (const c of m[1].matchAll(TEXT_COLOUR)) found.push(c[1].toLowerCase());
  }
  return found;
}

test('the brand gold is never used as an inline text colour', () => {
  /* #A9812E measures 3.35:1 on cream and 3.32:1 on white — it is a fill,
     not a text colour. This exact mistake appeared 434 times across 51
     files. Use var(--gold-ink), which resolves to a legible gold for
     whichever ground it lands on. */
  const offenders = [];
  for (const f of FILES) {
    const hits = inlineTextColours(readFileSync(f, 'utf8')).filter(c => c === '#a9812e');
    if (hits.length) offenders.push(`${f} (${hits.length})`);
  }
  assert.deepEqual(offenders, [],
    'Use color:var(--gold-ink) instead of the raw brand gold for text:\n  ' + offenders.join('\n  '));
});

test('white is never placed on a gold fill inline', () => {
  /* White on #A9812E measures 3.58:1. This was the .btn-primary defect
     and it recurred in 40 inline styles. var(--on-gold) is 5.50:1. */
  const pat = /background:\s*#A9812E\s*;\s*color:\s*(?:#fff(?:fff)?|white)\b/gi;
  const offenders = [];
  for (const f of FILES) {
    const n = (readFileSync(f, 'utf8').match(pat) || []).length;
    if (n) offenders.push(`${f} (${n})`);
  }
  assert.deepEqual(offenders, [],
    'Use color:var(--on-gold) on a gold fill:\n  ' + offenders.join('\n  '));
});

test('inline raw-hex text colours do not increase', () => {
  /* A ratchet, not a ban. 687 remain, spread across pages that predate
     the token set; converting them all at once would be a far riskier
     change than the drift itself. This lets that number fall as pages
     are touched for other reasons, and stops it climbing in the
     meantime — which is what actually holds the line.

     Lower BASELINE whenever you convert a batch. Never raise it. */
  const BASELINE = 606;
  const total = FILES.reduce((n, f) => n + inlineTextColours(readFileSync(f, 'utf8')).length, 0);
  assert.ok(total <= BASELINE,
    `Inline raw-hex text colours rose to ${total} (baseline ${BASELINE}). ` +
    'Use a token from src/styles/tokens.css instead of a literal.');
  if (total < BASELINE) {
    console.log(`  note: inline raw-hex text colours now ${total} — lower BASELINE in this test to ${total}`);
  }
});

test('every token the stylesheets reference is actually defined', () => {
  /* A var(--x) with no definition and no fallback silently renders as
     the inherited colour, which is exactly the kind of failure that is
     invisible in source and only shows up on screen. */
  const tokens = readFileSync('src/styles/tokens.css', 'utf8');
  const defined = new Set([...tokens.matchAll(/(--[a-z0-9-]+)\s*:/g)].map(m => m[1]));

  const OURS = /var\(\s*(--(?:gold-ink|text-muted|text-subtle|ok-ink|warn-ink|danger-ink|on-gold))\s*(\))/g;
  const missing = new Set();
  for (const f of FILES) {
    for (const m of readFileSync(f, 'utf8').matchAll(OURS)) {
      if (!defined.has(m[1])) missing.add(m[1]);
    }
  }
  assert.deepEqual([...missing], [],
    'Referenced without being defined in src/styles/tokens.css: ' + [...missing].join(', '));
});
