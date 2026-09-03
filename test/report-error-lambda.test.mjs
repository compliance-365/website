// Tests for lambda/report-error.js's pure shaping logic — the entire
// "what do we trust from an unauthenticated client, and how much of it"
// decision behind the one endpoint that writes browser error reports
// into Compliance365's own roster. Every field here is client-supplied
// and untrusted, so getting truncation/coercion wrong risks either a
// SharePoint write failure (a field too long) or a genuinely huge
// payload sneaking through.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { truncate, shapeReport } from '../lambda/report-error.js';

describe('truncate()', () => {
  test('passes short strings through unchanged', () => {
    assert.equal(truncate('hello', 100), 'hello');
  });

  test('truncates and marks a string over the limit', () => {
    const long = 'x'.repeat(200);
    const out = truncate(long, 50);
    assert.equal(out.length, 51, '50 chars plus the ellipsis marker');
    assert.ok(out.endsWith('…'));
  });

  test('coerces non-string values via JSON, never throwing', () => {
    assert.equal(truncate({ a: 1 }, 100), '{"a":1}');
    assert.equal(truncate([1, 2, 3], 100), '[1,2,3]');
    assert.equal(truncate(42, 100), '42');
  });

  test('null/undefined become an empty string, not the literal words', () => {
    assert.equal(truncate(null, 100), '');
    assert.equal(truncate(undefined, 100), '');
  });

  test('a value that cannot be JSON-stringified (circular) still returns a string, never throws', () => {
    const circular = {};
    circular.self = circular;
    assert.doesNotThrow(() => truncate(circular, 100));
  });
});

describe('shapeReport()', () => {
  test('a well-formed report round-trips its fields, each within its cap', () => {
    const r = shapeReport({
      tenantId: 't1', clientName: 'Acme', message: 'Something broke', stack: 'at foo()',
      source: 'window.onerror', context: '{"view":"dash"}', appVersion: '1.50.0',
      userAgent: 'Mozilla/5.0', url: 'https://example.com/checkpoint/'
    });
    assert.equal(r.tenantId, 't1');
    assert.equal(r.clientName, 'Acme');
    assert.equal(r.message, 'Something broke');
    assert.equal(r.stack, 'at foo()');
    assert.equal(r.source, 'window.onerror');
    assert.equal(r.appVersion, '1.50.0');
    assert.ok(r.reportedAt);
  });

  test('a missing message gets a placeholder rather than an empty, unfindable row', () => {
    const r = shapeReport({});
    assert.equal(r.message, '(no message provided)');
  });

  test('a missing source defaults to "unknown"', () => {
    const r = shapeReport({ message: 'x' });
    assert.equal(r.source, 'unknown');
  });

  test('never throws on a missing, null, or non-object body', () => {
    assert.doesNotThrow(() => shapeReport(undefined));
    assert.doesNotThrow(() => shapeReport(null));
    assert.doesNotThrow(() => shapeReport('not an object'));
    assert.doesNotThrow(() => shapeReport(42));
  });

  test('every field is capped, even a huge stack trace or context blob', () => {
    const r = shapeReport({ message: 'x'.repeat(5000), stack: 'y'.repeat(10000), context: 'z'.repeat(10000) });
    assert.ok(r.message.length <= 2001);
    assert.ok(r.stack.length <= 4001);
    assert.ok(r.context.length <= 2001);
  });

  test('reportedAt is always the server\'s own clock, never trusted from the client', () => {
    const r = shapeReport({ message: 'x', reportedAt: '1999-01-01T00:00:00.000Z' });
    assert.notEqual(r.reportedAt, '1999-01-01T00:00:00.000Z');
    assert.ok(new Date(r.reportedAt).getFullYear() >= 2026);
  });
});
