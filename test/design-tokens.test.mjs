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

test('the brand accent fill is never used as an inline text colour', () => {
  /* The accent fill #BE4A1E measures 4.69:1 on cream, 5.01:1 on white and
     4.57:1 on the panel ground. That technically passes, but the panel
     margin is thin enough that antialiasing eats it, and the same
     mistake with the previous accent (gold, 3.35:1) appeared 434 times
     across 51 files. Use var(--accent-ink) — a step darker, 5.91:1 at
     worst — which also resolves to the right end of the ramp on dark
     grounds.

     Compared lowercased: inlineTextColours() lowercases its output, so
     an uppercase literal here would silently never match and the guard
     would pass forever. */
  const offenders = [];
  for (const f of FILES) {
    const hits = inlineTextColours(readFileSync(f, 'utf8')).filter(c => c === '#be4a1e');
    if (hits.length) offenders.push(`${f} (${hits.length})`);
  }
  assert.deepEqual(offenders, [],
    'Use color:var(--accent-ink) instead of the raw accent fill for text:\n  ' + offenders.join('\n  '));
});

test('near-black is never placed on the accent fill inline', () => {
  /* This guard inverted when the palette moved from gold to orange, and
     it is the one change most likely to be undone by muscle memory.

     On the old gold, white was the defect (3.58:1) and near-black was
     correct (5.50:1). On #BE4A1E it is the other way round: white is
     5.01:1 and near-black only 3.92:1. Four rules and two stale
     "5.5:1 on the gold" comments were carried over unchanged during the
     swap and had to be fixed by hand.

     var(--on-accent) is white and is the right answer here. Note it is
     NOT the right answer on the green/amber/grey status chips — those
     take var(--on-status), because white fails on all three. */
  const pat = /background:\s*#BE4A1E\s*;\s*color:\s*(?:#0B0B0C|#000(?:000)?|black)\b/gi;
  const offenders = [];
  for (const f of FILES) {
    const n = (readFileSync(f, 'utf8').match(pat) || []).length;
    if (n) offenders.push(`${f} (${n})`);
  }
  assert.deepEqual(offenders, [],
    'Use color:var(--on-accent) on the accent fill:\n  ' + offenders.join('\n  '));
});

test('inline raw-hex text colours do not increase', () => {
  /* A ratchet, not a ban. 687 remain, spread across pages that predate
     the token set; converting them all at once would be a far riskier
     change than the drift itself. This lets that number fall as pages
     are touched for other reasons, and stops it climbing in the
     meantime — which is what actually holds the line.

     Lower BASELINE whenever you convert a batch. Never raise it. */
  const BASELINE = 604;
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

  const OURS = /var\(\s*(--(?:accent-ink|text-muted|text-subtle|ok-ink|warn-ink|danger-ink|on-accent|on-status))\s*(\))/g;
  const missing = new Set();
  for (const f of FILES) {
    for (const m of readFileSync(f, 'utf8').matchAll(OURS)) {
      if (!defined.has(m[1])) missing.add(m[1]);
    }
  }
  assert.deepEqual([...missing], [],
    'Referenced without being defined in src/styles/tokens.css: ' + [...missing].join(', '));
});
