// Tests for public/checkpoint/graph.js — the Microsoft Graph layer.
//
// This is the largest module in the app with no dedicated tests: ~1,380
// lines whose failure modes (throttling, pagination, permission
// degradation) are precisely the ones that only show up against a real
// tenant and can't be reproduced in demo mode. Most of it genuinely
// can't be unit tested — it needs a signed-in MSAL session — but the
// LOOP MECHANICS can be, and those are where the interesting bugs live:
// does a retry stop at the right point, does pagination follow every
// page and then halt.
//
// graph.js is a classic browser script (`window.Graph = (function(){…})()`),
// not a module, so it is evaluated in a vm sandbox with a stand-in
// `window` — the same approach test/version-changelog-consistency.test.mjs
// uses for changelog.js. The real lib.js is wired in, not a stub, so the
// retry decisions under test are the ones that actually ship.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import CheckpointLib from '../public/checkpoint/lib.js';

function loadGraph() {
  const src = readFileSync(new URL('../public/checkpoint/graph.js', import.meta.url), 'utf8');
  const sandbox = {
    window: { CHECKPOINT_CONFIG: { clientId: '', scopesReadOnly: [] }, CheckpointLib },
    setTimeout,
    btoa: (s) => Buffer.from(s, 'binary').toString('base64'),
    unescape,
    encodeURIComponent,
    console
  };
  sandbox.self = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox, { filename: 'graph.js' });
  return sandbox.window.Graph;
}

const Graph = loadGraph();
const { fetchWithGraphRetry, GRAPH_MAX_RETRIES, collectPages, encodeSharingUrl } = Graph.__test;

/* Minimal stand-in for a fetch Response: only .status and .headers.get
   are read by the retry loop. Retry-After: 0 keeps the real delay at
   0ms (see graphRetryDelayMs), so these tests don't sleep. */
function res(status, retryAfter = '0') {
  return { status, headers: { get: (h) => (h.toLowerCase() === 'retry-after' ? retryAfter : null) } };
}

describe('graph.js — module loads outside a browser', () => {
  test('exposes its public surface and its test seam', () => {
    assert.equal(typeof Graph.runPostureChecks, 'function');
    assert.equal(typeof Graph.detectCapabilities, 'function');
    assert.equal(typeof fetchWithGraphRetry, 'function');
    assert.equal(typeof collectPages, 'function');
  });
});

describe('fetchWithGraphRetry() — the throttling retry loop', () => {
  test('a success is returned immediately, with no retry', async () => {
    let calls = 0;
    const out = await fetchWithGraphRetry(() => { calls++; return res(200); });
    assert.equal(out.status, 200);
    assert.equal(calls, 1);
  });

  test('a 429 is retried and the eventual success returned', async () => {
    let calls = 0;
    const out = await fetchWithGraphRetry(() => { calls++; return res(calls < 3 ? 429 : 200); });
    assert.equal(out.status, 200);
    assert.equal(calls, 3);
  });

  test('503 and 504 retry the same way', async () => {
    for (const transient of [503, 504]) {
      let calls = 0;
      const out = await fetchWithGraphRetry(() => { calls++; return res(calls < 2 ? transient : 200); });
      assert.equal(out.status, 200, 'status ' + transient + ' should be retried');
      assert.equal(calls, 2);
    }
  });

  test('gives up after GRAPH_MAX_RETRIES and returns the last response', async () => {
    let calls = 0;
    const out = await fetchWithGraphRetry(() => { calls++; return res(429); });
    // one initial attempt plus GRAPH_MAX_RETRIES retries
    assert.equal(calls, GRAPH_MAX_RETRIES + 1);
    assert.equal(out.status, 429, 'the caller still sees the throttled response, not a thrown error');
  });

  test('a real error is never retried — retrying only repeats it', async () => {
    for (const status of [400, 401, 403, 404, 409, 500]) {
      let calls = 0;
      const out = await fetchWithGraphRetry(() => { calls++; return res(status); });
      assert.equal(calls, 1, status + ' must not be retried');
      assert.equal(out.status, status);
    }
  });

  test('honours a Retry-After header (0s here, so the test stays fast)', async () => {
    let seen = 0;
    const out = await fetchWithGraphRetry(() => {
      seen++;
      return { status: seen < 2 ? 429 : 200, headers: { get: () => '0' } };
    });
    assert.equal(out.status, 200);
    assert.equal(seen, 2);
  });

  test('a missing Retry-After falls back to backoff without throwing', async () => {
    let calls = 0;
    const out = await fetchWithGraphRetry(() => {
      calls++;
      return { status: calls < 2 ? 429 : 200, headers: { get: () => null } };
    });
    assert.equal(out.status, 200);
  });
});

/* collectPages() builds its array inside the vm sandbox, so the result
   is an Array from THAT realm — structurally identical but with a
   different prototype, which assert.deepEqual (rightly) rejects.
   Array.from() brings it back into this realm; the assertion is about
   contents, not which realm allocated the array. */
const realm = (a) => Array.from(a);

describe('collectPages() — @odata.nextLink pagination', () => {
  test('a single page returns its own values', async () => {
    const out = await collectPages('/users', async () => ({ value: [1, 2, 3] }));
    assert.deepEqual(realm(out), [1, 2, 3]);
  });

  test('follows nextLink across pages and concatenates in order', async () => {
    const pages = {
      '/users': { value: ['a'], '@odata.nextLink': '/users?skip=1' },
      '/users?skip=1': { value: ['b'], '@odata.nextLink': '/users?skip=2' },
      '/users?skip=2': { value: ['c'] }
    };
    const seen = [];
    const out = await collectPages('/users', async (url) => { seen.push(url); return pages[url]; });
    assert.deepEqual(realm(out), ['a', 'b', 'c']);
    assert.deepEqual(seen, ['/users', '/users?skip=1', '/users?skip=2']);
  });

  test('stops as soon as a page has no nextLink', async () => {
    let calls = 0;
    await collectPages('/x', async () => { calls++; return { value: [] }; });
    assert.equal(calls, 1);
  });

  test('a page with no value array contributes nothing rather than throwing', async () => {
    const out = await collectPages('/x', async () => ({}));
    assert.deepEqual(realm(out), []);
  });

  test('tolerates a null page body', async () => {
    const out = await collectPages('/x', async () => null);
    assert.deepEqual(realm(out), []);
  });
});

describe('encodeSharingUrl() — Graph /shares addressing', () => {
  // Microsoft's documented encoding: base64 of the URL, trailing "="
  // stripped, "/" -> "_", "+" -> "-", prefixed "u!".
  test('produces the u! base64url form', () => {
    const out = encodeSharingUrl('https://contoso.sharepoint.com/a b');
    assert.match(out, /^u!/);
    assert.ok(!out.includes('='), 'padding must be stripped');
    assert.ok(!out.includes('/'), '"/" must be replaced with "_"');
    assert.ok(!out.includes('+'), '"+" must be replaced with "-"');
  });

  test('round-trips back to the original URL', () => {
    const url = 'https://contoso.sharepoint.com/sites/x/Shared Documents/f.docx?a=1&b=2';
    const enc = encodeSharingUrl(url).slice(2).replace(/_/g, '/').replace(/-/g, '+');
    const decoded = decodeURIComponent(escape(Buffer.from(enc, 'base64').toString('binary')));
    assert.equal(decoded, url);
  });

  test('handles non-ASCII characters', () => {
    assert.doesNotThrow(() => encodeSharingUrl('https://contoso.sharepoint.com/Ä-café/naïve.docx'));
  });
});
