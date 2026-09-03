// Tests for isRetryableGraphStatus()/graphRetryDelayMs() — the decision
// logic behind automatic retry on Microsoft Graph throttling (429) and
// transient unavailability (503/504). A posture scan fires dozens of
// Graph calls in quick succession; getting this wrong either means
// scans silently degrade under load (never retrying) or the app hammers
// an already-throttled endpoint (retrying too fast/too often).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import CheckpointLib from '../public/checkpoint/lib.js';

const { isRetryableGraphStatus, graphRetryDelayMs } = CheckpointLib;

describe('isRetryableGraphStatus()', () => {
  test('429 (throttled), 503 and 504 (transient unavailability) are retryable', () => {
    assert.equal(isRetryableGraphStatus(429), true);
    assert.equal(isRetryableGraphStatus(503), true);
    assert.equal(isRetryableGraphStatus(504), true);
  });

  test('real failures are never retried — retrying would only repeat them', () => {
    assert.equal(isRetryableGraphStatus(400), false, 'malformed request');
    assert.equal(isRetryableGraphStatus(401), false, 'expired/invalid token');
    assert.equal(isRetryableGraphStatus(403), false, 'missing consent/permission');
    assert.equal(isRetryableGraphStatus(404), false, 'not found');
    assert.equal(isRetryableGraphStatus(409), false, 'conflict');
    assert.equal(isRetryableGraphStatus(500), false, 'plain internal server error');
    assert.equal(isRetryableGraphStatus(200), false);
  });
});

describe('graphRetryDelayMs()', () => {
  test('honours a numeric Retry-After header exactly, in milliseconds', () => {
    assert.equal(graphRetryDelayMs('5', 0), 5000);
    assert.equal(graphRetryDelayMs('30', 2), 30000, 'the header wins regardless of attempt number');
    assert.equal(graphRetryDelayMs('0', 0), 0, 'a zero-second Retry-After means retry immediately');
  });

  test('falls back to exponential backoff when the header is missing', () => {
    assert.equal(graphRetryDelayMs(null, 0) >= 1000, true);
    assert.equal(graphRetryDelayMs(undefined, 0) >= 1000, true);
    assert.equal(graphRetryDelayMs('', 0) >= 1000, true);
  });

  test('falls back to exponential backoff when the header is unparseable or negative', () => {
    assert.equal(graphRetryDelayMs('not-a-number', 0) >= 1000, true);
    assert.equal(graphRetryDelayMs('-5', 0) >= 1000, true, 'a negative Retry-After is nonsensical, not honoured literally');
  });

  test('exponential backoff grows with the attempt number, before jitter', () => {
    // jitter adds up to 25% on top, so compare floors
    const d0 = graphRetryDelayMs(null, 0);
    const d1 = graphRetryDelayMs(null, 1);
    const d2 = graphRetryDelayMs(null, 2);
    assert.ok(d0 >= 1000 && d0 < 1300, 'attempt 0: ~1s base');
    assert.ok(d1 >= 2000 && d1 < 2600, 'attempt 1: ~2s base');
    assert.ok(d2 >= 4000 && d2 < 5200, 'attempt 2: ~4s base');
  });

  test('exponential backoff is capped, so a runaway attempt count never waits forever', () => {
    const d = graphRetryDelayMs(null, 20);
    assert.ok(d <= 16000 * 1.25, 'capped at 16s base plus jitter');
  });

  test('jitter varies the delay so many concurrent retries do not land in lockstep', () => {
    const delays = new Set();
    for (let i = 0; i < 20; i++) delays.add(graphRetryDelayMs(null, 3));
    assert.ok(delays.size > 1, 'repeated calls at the same attempt number produce different delays');
  });
});
