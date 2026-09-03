// Guards against VERSION and changelog.js drifting apart — exactly the
// bug a live defect fixed earlier in this project's history (VERSION had
// gone stale relative to the changelog's own newest entry). app.js's
// checkForNewVersion() compares window.CHECKPOINT_VERSION (built from
// VERSION at build time — see version.js's own comment) against the
// changelog's first entry to decide whether to show the "What's new"
// toast; if the two disagree, that toast either never fires for a real
// release or fires for a release that never happened.
//
// changelog.js sets window.CHECKPOINT_CHANGELOG directly (not a UMD
// module like lib.js — see its own header comment), so it can't be
// require()'d in Node as-is; run its source in a sandboxed vm context
// with a stand-in `window` instead of parsing it as text, so this stays
// robust to reformatting rather than depending on a specific regex
// matching the file's exact layout.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function loadChangelog() {
  const src = readFileSync(new URL('../public/checkpoint/changelog.js', import.meta.url), 'utf8');
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox, { filename: 'changelog.js' });
  return sandbox.window.CHECKPOINT_CHANGELOG;
}

function loadVersion() {
  return readFileSync(new URL('../public/checkpoint/VERSION', import.meta.url), 'utf8').trim();
}

describe('VERSION / changelog.js consistency', () => {
  test('the changelog\'s newest (first) entry matches the VERSION file exactly', () => {
    const version = loadVersion();
    const changelog = loadChangelog();
    assert.ok(Array.isArray(changelog) && changelog.length > 0, 'changelog.js must export a non-empty CHECKPOINT_CHANGELOG array');
    assert.equal(changelog[0].version, version,
      'VERSION (' + version + ') does not match changelog.js\'s newest entry (' + changelog[0].version + ') — ' +
      'bump whichever one you forgot. checkForNewVersion() in app.js compares these directly.');
  });

  test('every entry has a well-formed version, date, and at least one change described', () => {
    const changelog = loadChangelog();
    changelog.forEach((e, i) => {
      assert.match(e.version, /^\d+\.\d+\.\d+$/, 'entry ' + i + ': version "' + e.version + '" is not X.Y.Z');
      assert.match(e.date, /^\d{4}-\d{2}-\d{2}$/, 'entry ' + i + ' (v' + e.version + '): date "' + e.date + '" is not YYYY-MM-DD');
      assert.ok(Array.isArray(e.entries) && e.entries.length > 0, 'entry ' + i + ' (v' + e.version + ') has no change descriptions');
      e.entries.forEach((line, j) => assert.equal(typeof line, 'string', 'entry ' + i + ' (v' + e.version + '), line ' + j + ' is not a string'));
    });
  });

  test('entries are strictly newest-first by version — a misordered entry is easy to miss reading the file top to bottom', () => {
    const changelog = loadChangelog();
    function toComparable(v) {
      var parts = v.split('.').map(Number);
      return parts[0] * 1e6 + parts[1] * 1e3 + parts[2];
    }
    for (let i = 1; i < changelog.length; i++) {
      const prev = toComparable(changelog[i - 1].version);
      const cur = toComparable(changelog[i].version);
      assert.ok(prev > cur,
        'entry ' + (i - 1) + ' (v' + changelog[i - 1].version + ') must be newer than entry ' + i + ' (v' + changelog[i].version + ') — entries are newest-first');
    }
  });

  test('no two entries share the same version', () => {
    const changelog = loadChangelog();
    const versions = changelog.map((e) => e.version);
    const unique = new Set(versions);
    assert.equal(unique.size, versions.length, 'duplicate version(s) found: ' + versions.filter((v, i) => versions.indexOf(v) !== i).join(', '));
  });
});
