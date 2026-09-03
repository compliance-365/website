// Tests for azure/lib/graph.js's throttling retry — the scheduled
// monitor's app-only side of the same fix as test/graph-retry.test.mjs
// (the browser app). Runs unattended once a day with nobody signed in
// to notice or retry a throttled call by hand, so getting this wrong
// silently costs checks or skips the owner-chase emails.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { graphClient, isRetryableGraphStatus, graphRetryDelayMs } = require('../public/checkpoint/azure/lib/graph.js');

describe('isRetryableGraphStatus() / graphRetryDelayMs() — mirrors the browser lib.js decision', () => {
  test('429/503/504 retryable, everything else is not', () => {
    assert.equal(isRetryableGraphStatus(429), true);
    assert.equal(isRetryableGraphStatus(503), true);
    assert.equal(isRetryableGraphStatus(504), true);
    assert.equal(isRetryableGraphStatus(403), false);
    assert.equal(isRetryableGraphStatus(404), false);
  });

  test('honours Retry-After, falls back to capped exponential backoff', () => {
    assert.equal(graphRetryDelayMs('2', 0), 2000);
    assert.ok(graphRetryDelayMs(null, 0) >= 1000);
    assert.ok(graphRetryDelayMs(null, 10) <= 16000 * 1.25);
  });
});

function mockResponse(status, retryAfter, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => (name === 'Retry-After' ? (retryAfter || null) : null) },
    json: async () => body,
    text: async () => JSON.stringify(body)
  };
}

describe('graphClient(token).g() — throttling retry end to end', () => {
  test('retries once on 429 (Retry-After: 0) then returns the eventual 200', async () => {
    let calls = 0;
    globalThis.fetch = async () => {
      calls++;
      if (calls === 1) return mockResponse(429, '0');
      return mockResponse(200, null, { value: 'ok' });
    };
    const { g } = graphClient('fake-token');
    const result = await g('/sites/root');
    assert.equal(calls, 2);
    assert.deepEqual(result, { value: 'ok' });
    delete globalThis.fetch;
  });

  test('gives up after GRAPH_MAX_RETRIES on sustained throttling and throws', async () => {
    let calls = 0;
    globalThis.fetch = async () => { calls++; return mockResponse(429, '0'); };
    const { g } = graphClient('fake-token');
    await assert.rejects(() => g('/sites/root'), /Graph 429/);
    assert.equal(calls, 4, '1 initial attempt + 3 retries');
    delete globalThis.fetch;
  });

  test('a real error (403) is never retried', async () => {
    let calls = 0;
    globalThis.fetch = async () => { calls++; return mockResponse(403, null, { error: { message: 'Forbidden' } }); };
    const { g } = graphClient('fake-token');
    await assert.rejects(() => g('/sites/root'), /Graph 403/);
    assert.equal(calls, 1);
    delete globalThis.fetch;
  });

  test('503 is retried the same way as 429', async () => {
    let calls = 0;
    globalThis.fetch = async () => {
      calls++;
      if (calls === 1) return mockResponse(503, '0');
      return mockResponse(200, null, { value: 'ok' });
    };
    const { g } = graphClient('fake-token');
    const result = await g('/sites/root');
    assert.equal(calls, 2);
    assert.deepEqual(result, { value: 'ok' });
    delete globalThis.fetch;
  });
});
