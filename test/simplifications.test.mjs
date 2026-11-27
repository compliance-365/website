// Simplifications from real use: framework settings reachable from
// Settings, one way into the management review, a check of who can use
// Checkpoint, a menu without a mapping view that has nothing to map, and
// activation files created from the owner console in one step.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import CheckpointLib from '../public/checkpoint/lib.js';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const app = read('public/checkpoint/app.js');
const html = read('public/checkpoint/index.html');

test('Settings has a Frameworks & licence tab that leads to the framework settings', () => {
  assert.match(html, /data-action="App.settingsSection" data-id="frameworks">Frameworks &amp; licence</);
  assert.match(html, /<div class="set-sec" data-sec="frameworks">/);
  assert.match(app, /function renderSettingsFwSummary\(\)/);
  assert.match(app, /data-action="App.go" data-id="frameworks">Open framework settings and licence/);
});

test('one button records a management review and asks where it was held', () => {
  assert.match(html, /data-action="App.recordManagementReview">Record a management review</);
  assert.match(app, /recordManagementReview: async function \(\) \{[\s\S]{0,900}At the leadership security meeting/);
  assert.doesNotMatch(html, /Record a review held outside the meeting/);
});

test('setup health says who can use Checkpoint, from the two Entra groups', () => {
  const run = (access) => CheckpointLib.setupHealthChecks({ access }, '2026-11-27').find((c) => c.id === 'access');
  assert.equal(run({ practitioners: { exists: true, members: 2 }, viewers: { exists: false } }).status, 'pass');
  assert.match(run({ practitioners: { exists: true, members: 2 } }).detail, /2 members/);
  const none = run({ practitioners: { exists: false }, viewers: { exists: false } });
  assert.equal(none.status, 'info');
  assert.equal(none.fix, 'openAccessHelp');
  assert.equal(run({ demo: true }), undefined);
  assert.match(app, /openAccessHelp: async function/);
  assert.match(read('public/checkpoint/SETUP.md'), /The two groups are Microsoft Entra groups, not SharePoint site\ngroups\./);
});

test('cross-framework mapping is hidden when there is only one framework', () => {
  assert.match(app, /var mapOn = entitledFrameworks\(\)\.length > 1;/);
});

test('the owner console creates and downloads the activation file in one step when the signing service is set up', () => {
  const owner = read('public/owner/owner.js');
  assert.match(owner, /Create and download the activation file/);
  assert.match(owner, /Signing service unavailable\? Use the command line instead/);
  assert.match(owner, /NEW_CLIENT_SIGNED_FILE = [^\n]+\n\s*OwnerApp\.partnerDownloadSignedFile\(\);/);
});
