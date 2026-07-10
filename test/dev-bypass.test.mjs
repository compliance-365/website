// Covers the local-development bypass end to end at the unit level:
// scripts/hash-checkpoint-assets.mjs's enforceDevBypassOff() (the
// build-time assertion that a production build can never ship with
// CHECKPOINT_DEV_BYPASS left on) and lib.js's isDevBypassActive() (the
// runtime gate requiring BOTH the flag and a localhost-family
// hostname). See public/checkpoint/devflag.js for the full design.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { enforceDevBypassOff } from '../scripts/hash-checkpoint-assets.mjs';
import CheckpointLib from '../public/checkpoint/lib.js';

function withTempDistDir(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'devflag-test-'));
  try { return fn(dir); } finally { rmSync(dir, { recursive: true, force: true }); }
}

describe('enforceDevBypassOff() — a production build always ships the flag off', () => {
  test('forces "= true" to "= false"', () => {
    withTempDistDir((dir) => {
      writeFileSync(join(dir, 'devflag.js'), 'window.CHECKPOINT_DEV_BYPASS = true;\n');
      enforceDevBypassOff(dir);
      const out = readFileSync(join(dir, 'devflag.js'), 'utf8');
      assert.match(out, /CHECKPOINT_DEV_BYPASS = false/);
      assert.doesNotMatch(out, /CHECKPOINT_DEV_BYPASS = true/);
    });
  });

  test('an already-false file is left false (idempotent, not a no-op that skips the assertion)', () => {
    withTempDistDir((dir) => {
      writeFileSync(join(dir, 'devflag.js'), 'window.CHECKPOINT_DEV_BYPASS = false;\n');
      enforceDevBypassOff(dir);
      const out = readFileSync(join(dir, 'devflag.js'), 'utf8');
      assert.match(out, /CHECKPOINT_DEV_BYPASS = false/);
    });
  });

  test('throws (failing the build) if devflag.js is missing from the dist directory', () => {
    withTempDistDir((dir) => {
      assert.throws(() => enforceDevBypassOff(dir), /devflag\.js/);
    });
  });

  test('throws (failing the build) if the file no longer contains a recognisable false assignment at all — e.g. its content shape changed underneath the substitution', () => {
    withTempDistDir((dir) => {
      writeFileSync(join(dir, 'devflag.js'), 'window.SOMETHING_ELSE = true;\n');
      assert.throws(() => enforceDevBypassOff(dir), /CHECKPOINT_DEV_BYPASS/);
    });
  });
});

describe('CheckpointLib.isDevBypassActive() — requires BOTH the flag and a localhost-family hostname', () => {
  test('active when the flag is true and hostname is localhost', () => {
    assert.equal(CheckpointLib.isDevBypassActive(true, 'localhost'), true);
  });
  test('active for 127.0.0.1 too', () => {
    assert.equal(CheckpointLib.isDevBypassActive(true, '127.0.0.1'), true);
  });
  test('inactive when the flag is true but the hostname is a real deployment', () => {
    assert.equal(CheckpointLib.isDevBypassActive(true, 'app.compliance365.com.au'), false);
  });
  test('inactive when the hostname is localhost but the flag is false (a real production build)', () => {
    assert.equal(CheckpointLib.isDevBypassActive(false, 'localhost'), false);
  });
  test('inactive when the flag is undefined/falsy', () => {
    assert.equal(CheckpointLib.isDevBypassActive(undefined, 'localhost'), false);
    assert.equal(CheckpointLib.isDevBypassActive(0, 'localhost'), false);
  });
  test('a truthy-but-not-strictly-true flag value does not activate it — must be the literal boolean true, not just any truthy value', () => {
    assert.equal(CheckpointLib.isDevBypassActive('true', 'localhost'), false);
    assert.equal(CheckpointLib.isDevBypassActive(1, 'localhost'), false);
  });
});
