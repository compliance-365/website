// Tests for the continuous-monitoring in-app setup panel's pure helpers:
// MONITOR_APP_PERMISSIONS (the monitor's own permission list, mirrored
// from azure/README.md §2) and monitorGrantSnippet() (the exact Graph
// Explorer request a tenant admin runs once to grant Sites.Selected
// access — README.md §3 — with known values substituted in). These
// replace the plain-text "see SETUP.md" Dashboard fallback with real,
// pre-filled instructions, so the formatting has to be right.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import CheckpointLib from '../public/checkpoint/lib.js';

const { MONITOR_APP_PERMISSIONS, monitorGrantSnippet } = CheckpointLib;

describe('MONITOR_APP_PERMISSIONS', () => {
  test('is a non-empty array of distinct permission strings', () => {
    assert.ok(Array.isArray(MONITOR_APP_PERMISSIONS));
    assert.ok(MONITOR_APP_PERMISSIONS.length > 0);
    const unique = new Set(MONITOR_APP_PERMISSIONS);
    assert.equal(unique.size, MONITOR_APP_PERMISSIONS.length, 'no duplicate permission names');
    MONITOR_APP_PERMISSIONS.forEach((p) => assert.equal(typeof p, 'string'));
  });

  test('includes Sites.Selected — the monitor\'s only write-capable permission', () => {
    assert.ok(MONITOR_APP_PERMISSIONS.indexOf('Sites.Selected') !== -1);
  });
});

describe('monitorGrantSnippet()', () => {
  test('with siteId and clientId supplied, both appear in the request', () => {
    const snippet = monitorGrantSnippet('contoso.sharepoint.com,abc-123,def-456', 'my-client-id', 'Checkpoint Posture Monitor');
    assert.match(snippet, /^POST https:\/\/graph\.microsoft\.com\/v1\.0\/sites\/contoso\.sharepoint\.com,abc-123,def-456\/permissions$/m);
    assert.match(snippet, /"id": "my-client-id"/);
    assert.match(snippet, /"displayName": "Checkpoint Posture Monitor"/);
  });

  test('missing siteId or clientId degrades to a labelled placeholder, not a throw or blank', () => {
    const snippet = monitorGrantSnippet('', '', '');
    assert.match(snippet, /POST https:\/\/graph\.microsoft\.com\/v1\.0\/sites\/<siteId/);
    assert.match(snippet, /"id": "<clientId from step 1>"/);
    assert.doesNotThrow(() => monitorGrantSnippet(null, null, null));
  });

  test('a missing displayName falls back to the standard app registration name', () => {
    const snippet = monitorGrantSnippet('site-1', 'client-1', '');
    assert.match(snippet, /"displayName": "Checkpoint Posture Monitor"/);
  });

  test('the body half is valid, parseable JSON with roles: ["write"]', () => {
    const snippet = monitorGrantSnippet('site-1', 'client-1', 'Custom Name');
    const bodyJson = snippet.split('\n\n')[1];
    const parsed = JSON.parse(bodyJson);
    assert.deepEqual(parsed.roles, ['write']);
    assert.equal(parsed.grantedToIdentities[0].application.id, 'client-1');
    assert.equal(parsed.grantedToIdentities[0].application.displayName, 'Custom Name');
  });
});
