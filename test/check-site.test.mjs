// scripts/check-site.mjs, which the Test workflow runs on the built site:
// broken internal links, missing #fragments and page weight.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkSite, BUDGET } from '../scripts/check-site.mjs';

function site(files, fn) {
  const root = mkdtempSync(join(tmpdir(), 'check-site-'));
  try {
    for (const [p, body] of Object.entries(files)) {
      mkdirSync(join(root, p, '..'), { recursive: true });
      writeFileSync(join(root, p), body);
    }
    return fn(root);
  } finally { rmSync(root, { recursive: true, force: true }); }
}
const page = (body) => '<!doctype html><html><body>' + body + '</body></html>';

test('a clean site passes', () => {
  site({
    'index.html': page('<a href="/about/">About</a> <a href="/about/#team">Team</a> <a href="#top" id="top">Top</a> <a href="https://example.com/">x</a> <a href="mailto:a@b.c">m</a>'),
    'about/index.html': page('<h2 id="team">Team</h2><img src="../logo.svg">'),
    'logo.svg': '<svg/>',
  }, (root) => assert.deepEqual(checkSite(root).problems, []));
});

test('broken links and missing fragments are reported', () => {
  site({
    'index.html': page('<a href="/nope/">x</a> <a href="/about/#missing">y</a> <a href="#gone">z</a>'),
    'about/index.html': page('<h2 id="team">Team</h2>'),
  }, (root) => {
    const p = checkSite(root).problems;
    assert.equal(p.length, 3);
    assert.match(p[0], /broken link \/nope\//);
    assert.match(p[1], /\/about\/#missing has no matching id/);
    assert.match(p[2], /#gone has no matching id/);
  });
});

test('URLs inside inline scripts, JSON-LD and comments are not links', () => {
  site({
    'index.html': page('<script>var u = "/x/" + id;</script><script type="application/ld+json">{"url":"/nowhere/"}</script><!-- <a href="/draft/">d</a> -->'),
  }, (root) => assert.deepEqual(checkSite(root).problems, []));
});

test('pages over the HTML or JavaScript budget are reported; the apps are not checked', () => {
  site({
    'big/index.html': page('x'.repeat(BUDGET.htmlBytes + 10)),
    'ai/index.html': page('<script src="/checkpoint/lib.js"></script>'),
    'checkpoint/lib.js': 'x'.repeat(BUDGET.scriptBytes + 10),
    'checkpoint/index.html': page('<a href="/missing/">not checked</a>'),
  }, (root) => {
    const p = checkSite(root).problems;
    assert.equal(p.length, 2);
    assert.match(p.join('\n'), /\/ai\/index\.html: loads \d+KB of site JavaScript/);
    assert.match(p.join('\n'), /\/big\/index\.html: HTML is \d+KB/);
  });
});
