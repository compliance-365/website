// The site's Content Security Policy: Astro emits it (security.csp), and
// scripts/csp-inline-hashes.mjs fingerprints the inline scripts, moves the
// policy ahead of them, and refuses inline event handlers.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { addInlineHashes, inlineScripts, inlineHandlers, policyFirst, hashOf } from '../scripts/csp-inline-hashes.mjs';

const page = (head, body = '') => `<!DOCTYPE html><html><head><meta charset="utf-8" /><script>var a=1;</script><script type="application/ld+json">{"x":1}</script><script src="/x.js"></script>${head}<meta http-equiv="content-security-policy" content="default-src 'self'; script-src 'self' 'sha256-astro='; style-src 'self' 'unsafe-inline'"></head><body>${body}<script type="module">go()</script></body></html>`;

test('every executable inline script gets a fingerprint, data blocks do not', () => {
  const out = addInlineHashes(page(''));
  const pol = /content-security-policy" content="([^"]*)"/.exec(out)[1];
  assert.ok(pol.includes(hashOf('var a=1;')));
  assert.ok(pol.includes(hashOf('go()')));
  assert.ok(!pol.includes(hashOf('{"x":1}')));
  assert.ok(pol.includes("'sha256-astro='"), 'keeps the hashes Astro wrote');
  assert.deepEqual(inlineScripts(page('')), ['var a=1;', 'go()']);
});

test('the policy is moved ahead of every script, and the step can run twice', () => {
  const once = addInlineHashes(page(''));
  assert.ok(policyFirst(once));
  assert.ok(!policyFirst(page('')));
  assert.equal(addInlineHashes(once), once);
});

test('pages without Astro’s policy are left alone; unsafe-inline scripts are refused', () => {
  assert.equal(addInlineHashes('<html><head><meta http-equiv="Content-Security-Policy" content="script-src \'self\'"></head></html>'), null);
  assert.throws(() => addInlineHashes(page('').replace("script-src 'self'", "script-src 'self' 'unsafe-inline'")), /unsafe-inline/);
});

test('inline event handlers are found, but not text inside scripts', () => {
  assert.equal(inlineHandlers('<button onclick="x()">a</button>').length, 1);
  assert.equal(inlineHandlers('<script>el.innerHTML = "<b onclick=x>";</script><button data-a="1">').length, 0);
});

test('no page source uses an inline event handler', () => {
  const hits = [];
  (function walk(d) {
    for (const n of readdirSync(d)) {
      const p = join(d, n);
      if (statSync(p).isDirectory()) walk(p);
      else if (n.endsWith('.astro')) {
        const s = readFileSync(p, 'utf8').replace(/<script[\s\S]*?<\/script>/g, '');
        for (const m of s.matchAll(/<[a-zA-Z][^>]*\son[a-z]+\s*=\s*["'{]/g)) hits.push(p + ': ' + m[0].slice(0, 80));
      }
    }
  })(new URL('../src', import.meta.url).pathname);
  assert.deepEqual(hits, []);
});

test('Astro emits the policy, script-src has no unsafe-inline, and the step runs everywhere the site is built', () => {
  const cfg = readFileSync(new URL('../astro.config.mjs', import.meta.url), 'utf8');
  assert.match(cfg, /security: \{\s*csp: \{/);
  const script = /scriptDirective: \{\s*resources: \[([^\]]*)\]/.exec(cfg)[1];
  assert.doesNotMatch(script, /unsafe-inline|unsafe-eval/);
  assert.doesNotMatch(readFileSync(new URL('../src/layouts/BaseLayout.astro', import.meta.url), 'utf8'), /<meta http-equiv="Content-Security-Policy"/);
  assert.match(readFileSync(new URL('../package.json', import.meta.url), 'utf8'), /"postbuild": "node scripts\/csp-inline-hashes\.mjs dist/);
  for (const wf of ['deploy.yml', 'test.yml']) assert.match(readFileSync(new URL('../.github/workflows/' + wf, import.meta.url), 'utf8'), /run: node scripts\/csp-inline-hashes\.mjs dist/, wf);
});
