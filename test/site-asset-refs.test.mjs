// Covers scripts/hash-checkpoint-assets.mjs's rewriteSiteReferences() —
// the pass that keeps the MARKETING site's references to Checkpoint's
// own scripts pointing at the content-hashed filenames.
//
// This existed as a real, silent production break: the build hashes
// dist/checkpoint/lib.js to lib.<hash>.js and rewrote references in
// exactly two files (dist/checkpoint/index.html and
// dist/owner/index.html). src/components/EuAiActClassifier.astro —
// embedded on /services/iso42001/ and
// /resources/iso42001-vs-nist-ai-rmf-eu-ai-act/ — loads
// /checkpoint/lib.js so the free public EU AI Act tool and the in-app AI
// Systems register share ONE question set rather than drifting as two
// copies. That absolute reference was never rewritten, so the deployed
// tag 404'd, window.CheckpointLib stayed undefined, and the widget's own
// `if (!window.CheckpointLib) return;` guard made it render zero
// questions with no error visible anywhere.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rewriteSiteReferences } from '../scripts/hash-checkpoint-assets.mjs';

const HASHED = { 'lib.js': { newName: 'lib.abc1234567.js', integrity: 'sha384-TESTHASH' } };

function withTempDist(fn) {
  const root = mkdtempSync(join(tmpdir(), 'site-refs-test-'));
  try {
    mkdirSync(join(root, 'checkpoint'), { recursive: true });
    mkdirSync(join(root, 'owner'), { recursive: true });
    return fn(root);
  } finally { rmSync(root, { recursive: true, force: true }); }
}

const page = (body) => '<!doctype html><html><body>' + body + '</body></html>';

describe('rewriteSiteReferences() — marketing pages keep working after content hashing', () => {
  test('rewrites an absolute /checkpoint/lib.js reference to the hashed name, with SRI', () => {
    withTempDist((root) => {
      mkdirSync(join(root, 'services', 'iso42001'), { recursive: true });
      const f = join(root, 'services', 'iso42001', 'index.html');
      writeFileSync(f, page('<script src="/checkpoint/lib.js"></script>'));
      const r = rewriteSiteReferences(HASHED, root);
      const out = readFileSync(f, 'utf8');
      assert.match(out, /src="\/checkpoint\/lib\.abc1234567\.js"/);
      assert.match(out, /integrity="sha384-TESTHASH"/);
      assert.match(out, /crossorigin="anonymous"/);
      assert.doesNotMatch(out, /"\/checkpoint\/lib\.js"/);
      assert.equal(r.rewritten, 1);
      assert.equal(r.pagesTouched, 1);
    });
  });

  test('rewrites EVERY occurrence on a page, not just the first (a page can embed the component twice)', () => {
    withTempDist((root) => {
      const f = join(root, 'twice.html');
      writeFileSync(f, page('<script src="/checkpoint/lib.js"></script><p>x</p><script src="/checkpoint/lib.js"></script>'));
      const r = rewriteSiteReferences(HASHED, root);
      const out = readFileSync(f, 'utf8');
      assert.equal(r.rewritten, 2);
      assert.equal((out.match(/lib\.abc1234567\.js/g) || []).length, 2);
      assert.doesNotMatch(out, /"\/checkpoint\/lib\.js"/);
    });
  });

  test('preserves other attributes on the tag and replaces any stale integrity', () => {
    withTempDist((root) => {
      const f = join(root, 'attrs.html');
      writeFileSync(f, page('<script src="/checkpoint/lib.js" integrity="sha384-STALE" crossorigin="anonymous" defer></script>'));
      rewriteSiteReferences(HASHED, root);
      const out = readFileSync(f, 'utf8');
      assert.match(out, /defer/);
      assert.match(out, /integrity="sha384-TESTHASH"/);
      assert.doesNotMatch(out, /sha384-STALE/);
    });
  });

  test('a cache-busting query string on the reference is still matched', () => {
    withTempDist((root) => {
      const f = join(root, 'query.html');
      writeFileSync(f, page('<script src="/checkpoint/lib.js?v=3"></script>'));
      const r = rewriteSiteReferences(HASHED, root);
      assert.equal(r.rewritten, 1);
      assert.match(readFileSync(f, 'utf8'), /src="\/checkpoint\/lib\.abc1234567\.js"/);
    });
  });

  test('THROWS on a dangling reference it cannot rewrite, rather than shipping a dead script tag', () => {
    withTempDist((root) => {
      const f = join(root, 'dangling.html');
      // a reference this script's <script> matcher can't rewrite (a preload link)
      writeFileSync(f, page('<link rel="preload" as="script" href="/checkpoint/lib.js">'));
      assert.throws(() => rewriteSiteReferences(HASHED, root), /still references \/checkpoint\/lib\.js/);
    });
  });

  test('never touches the two pages the tag-by-tag rewrite above already owns', () => {
    withTempDist((root) => {
      const app = join(root, 'checkpoint', 'index.html');
      const owner = join(root, 'owner', 'index.html');
      // these carry plain-name references mid-rewrite; the site pass must skip them entirely
      writeFileSync(app, page('<script src="/checkpoint/lib.js"></script>'));
      writeFileSync(owner, page('<script src="/checkpoint/lib.js"></script>'));
      const r = rewriteSiteReferences(HASHED, root);
      assert.equal(r.rewritten, 0);
      assert.match(readFileSync(app, 'utf8'), /"\/checkpoint\/lib\.js"/);
      assert.match(readFileSync(owner, 'utf8'), /"\/checkpoint\/lib\.js"/);
    });
  });

  test('leaves a page with no Checkpoint references untouched', () => {
    withTempDist((root) => {
      const f = join(root, 'plain.html');
      const original = page('<script src="/other/thing.js"></script>');
      writeFileSync(f, original);
      const r = rewriteSiteReferences(HASHED, root);
      assert.equal(r.rewritten, 0);
      assert.equal(r.pagesTouched, 0);
      assert.equal(readFileSync(f, 'utf8'), original);
    });
  });
});
