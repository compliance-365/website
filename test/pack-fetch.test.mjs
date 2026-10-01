/* Pack loading must survive a deploy: pack file names are content-hashed
   and change every build, so a cached manifest can name a file that no
   longer exists. See fetchPackText() in lib.js. */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import Lib from '../public/checkpoint/lib.js';

function server(files) {
  const calls = [];
  const fetchFn = async (url) => {
    calls.push(url);
    const r = files[url];
    const status = typeof r === 'function' ? r() : (r === undefined ? 404 : 200);
    return { ok: status === 200, status, text: async () => (typeof r === 'string' ? r : 'body') };
  };
  return { fetchFn, calls };
}

describe('fetchPackText', () => {
  test('fetches the file the manifest names', async () => {
    const { fetchFn } = server({ 'packs/ai.aaa.pack.json': 'CIPHER' });
    const out = await Lib.fetchPackText(fetchFn, 'ai', { ai: { file: 'ai.aaa.pack.json' } }, null);
    assert.equal(out.text, 'CIPHER');
    assert.equal(out.entry.file, 'ai.aaa.pack.json');
  });

  test('a stale manifest (404) re-reads the manifest from the server and retries once', async () => {
    const { fetchFn, calls } = server({ 'packs/ai.new.pack.json': 'NEW' });
    let reloads = 0;
    const loadManifest = async (force) => { assert.equal(force, true); reloads++; return { ai: { file: 'ai.new.pack.json', sha256: 'x' } }; };
    const out = await Lib.fetchPackText(fetchFn, 'ai', { ai: { file: 'ai.old.pack.json' } }, loadManifest);
    assert.equal(reloads, 1);
    assert.equal(out.text, 'NEW');
    assert.equal(out.entry.sha256, 'x', 'the caller hash-checks against the fresh entry');
    assert.deepEqual(calls, ['packs/ai.old.pack.json', 'packs/ai.new.pack.json']);
  });

  test('still missing after the manifest reload is reported with its status', async () => {
    const { fetchFn } = server({});
    const loadManifest = async () => ({ ai: { file: 'ai.gone.pack.json' } });
    await assert.rejects(Lib.fetchPackText(fetchFn, 'ai', { ai: { file: 'ai.old.pack.json' } }, loadManifest), /HTTP 404 fetching pack file/);
  });

  test('a 5xx hosting blip is retried once', async () => {
    let n = 0;
    const { fetchFn, calls } = server({ 'packs/ai.a.pack.json': () => (n++ === 0 ? 503 : 200) });
    const out = await Lib.fetchPackText(fetchFn, 'ai', { ai: { file: 'ai.a.pack.json' } }, null);
    assert.equal(out.text, 'body');
    assert.equal(calls.length, 2);
  });

  test('a module missing from the manifest throws', async () => {
    const { fetchFn } = server({});
    await assert.rejects(Lib.fetchPackText(fetchFn, 'ai', {}, null), /no pack published/);
  });
});

test('app.js revalidates the manifest instead of trusting the HTTP cache', () => {
  const app = readFileSync(new URL('../public/checkpoint/app.js', import.meta.url), 'utf8');
  assert.match(app, /fetch\('packs\/manifest\.json', \{ cache: forceReload \? 'reload' : 'no-cache' \}\)/);
  assert.match(app, /CheckpointLib\.fetchPackText\(/);
});
