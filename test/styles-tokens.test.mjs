// styles.css is one hand-maintained file with long explanatory comments
// wrapped around the design tokens, and CSS fails silently: an unbalanced
// comment marker does not throw, it just swallows every declaration after
// it until the parser resyncs. That is not hypothetical — writing these
// very tokens, a paragraph was pasted a line below a `*/` instead of
// inside the comment, which left `--edge` and all three `--elev-*` tokens
// undefined. `box-shadow: var(--elev-1)` then resolved to nothing and the
// whole elevation system was silently absent, while the page still looked
// plausible because the surfaces and radii were unaffected.
//
// So this asserts the two things that failure mode breaks: comment markers
// balance, and every token the stylesheet references via var() is actually
// defined somewhere in it. The second catches typos and deletions too.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../public/checkpoint/styles.css', import.meta.url), 'utf8');

describe('styles.css — comment integrity', () => {
  test('every /* is closed and no */ appears outside a comment', () => {
    let i = 0, open = false;
    const problems = [];
    const lineAt = (idx) => css.slice(0, idx).split('\n').length;
    while (i < css.length) {
      if (css.startsWith('/*', i)) {
        if (open) problems.push('nested /* at line ' + lineAt(i));
        open = true; i += 2; continue;
      }
      if (css.startsWith('*/', i)) {
        // A stray */ means the text before it was being parsed as CSS.
        if (!open) problems.push('unopened */ at line ' + lineAt(i));
        open = false; i += 2; continue;
      }
      i++;
    }
    if (open) problems.push('a /* is never closed');
    assert.deepEqual(problems, []);
  });
});

describe('styles.css — custom properties resolve', () => {
  /* Strip comments first: the prose in this file names tokens constantly
     ("--edge: a 1px light-catch…"), and those mentions are documentation,
     not declarations or uses. */
  const code = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const declared = new Set([...code.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]));
  const used = new Set([...code.matchAll(/var\(\s*(--[\w-]+)/g)].map((m) => m[1]));

  test('the elevation system is declared and non-empty', () => {
    for (const t of ['--edge', '--elev-1', '--elev-2', '--elev-3', '--glow', '--r-sm', '--r-md', '--r-lg']) {
      assert.ok(declared.has(t), t + ' is not declared — a swallowed comment block would do this');
      const value = new RegExp(t + '\\s*:\\s*([^;]+);').exec(code);
      assert.ok(value && value[1].trim().length > 0, t + ' is declared but empty');
    }
  });

  test('every var() references a token this stylesheet defines', () => {
    const missing = [...used].filter((t) => !declared.has(t));
    assert.deepEqual(missing, [], 'used via var() but never declared');
  });

  test('the elevation tokens are actually applied to cards', () => {
    assert.match(code, /\.card\{[^}]*box-shadow:var\(--elev-1\)/,
      '.card must carry --elev-1, or the app has no resting elevation at all');
  });
});
