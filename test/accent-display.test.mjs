import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/* --accent-display is the full brand orange (#BE4A1E) as TEXT. It measures
   3.92:1 on the #0B0B0C ground and 3.41:1 on Checkpoint's card tier: a pass
   for large text (3:1) and a fail for anything smaller (4.5:1). So it may
   only be applied to headlines. This test reads every rule that uses it and
   checks the selector lands on a heading, or on the one named display
   class each surface has for a headline phrase. */

const FILES = [];
function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(astro|css)$/.test(entry)) FILES.push(p);
  }
}
walk('src');
FILES.push('public/checkpoint/styles.css');

/* The last compound of the selector must be a heading (optionally its em),
   or a display-accent class. */
const ALLOWED = /(?:^|[\s>])(?:h1|h2)(?:\s+em)?$|\.hdk-accent$|\.display-accent$/;

function uses(src) {
  const out = [];
  src = src.replace(/\/\*[\s\S]*?\*\//g, '');
  for (const m of src.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!/(?<![-\w])color:\s*var\(--accent-display\)/.test(m[2])) continue;
    for (const sel of m[1].split(',')) out.push(sel.trim());
  }
  return out;
}

test('--accent-display is only used as a headline colour', () => {
  const bad = [];
  let seen = 0;
  for (const f of FILES) {
    for (const sel of uses(readFileSync(f, 'utf8'))) {
      seen++;
      if (!ALLOWED.test(sel)) bad.push(`${f}: ${sel}`);
    }
  }
  assert.ok(seen > 0, 'expected at least one headline rule using --accent-display');
  assert.deepEqual(bad, [], 'full brand orange used on non-headline text');
});

test('--accent-display is never set inline', () => {
  for (const f of FILES.filter(f => f.endsWith('.astro'))) {
    assert.ok(!/style="[^"]*var\(--accent-display\)/.test(readFileSync(f, 'utf8')), f);
  }
});
