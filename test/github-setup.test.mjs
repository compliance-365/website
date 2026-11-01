/* Guided GitHub collector set-up: one permission list behind the in-app
   steps, the create-app link and the README; the downloaded workflow
   carries the tenant's settings and still takes its secrets as secrets. */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import Lib from '../public/checkpoint/lib.js';

const app = readFileSync(new URL('../public/checkpoint/app.js', import.meta.url), 'utf8');
const readme = readFileSync(new URL('../public/checkpoint/github/README.md', import.meta.url), 'utf8');
const yml = readFileSync(new URL('../public/checkpoint/github/checkpoint-github-collector.yml', import.meta.url), 'utf8');

describe('GitHub App permissions', () => {
  test('the README table lists exactly the same read permissions', () => {
    for (const p of Lib.GITHUB_APP_PERMISSIONS) {
      const [scope, name] = p.label.split(' \u2192 ');
      assert.match(readme, new RegExp('\\| ' + scope + ' \u2192 ' + name.replace(/[()]/g, '\\$&') + ' \\| Read \\|'), p.label);
    }
    assert.equal((readme.match(/\| (Repository|Organization) → [^|]+ \| Read \|/g) || []).length, Lib.GITHUB_APP_PERMISSIONS.length);
  });
  test('the create-app link asks for each, read-only, private, no webhook', () => {
    const u = new URL(Lib.githubAppCreateUrl('MineGuard'));
    assert.equal(u.origin + u.pathname, 'https://github.com/organizations/MineGuard/settings/apps/new');
    assert.equal(u.searchParams.get('public'), 'false');
    assert.equal(u.searchParams.get('webhook_active'), 'false');
    for (const p of Lib.GITHUB_APP_PERMISSIONS) assert.equal(u.searchParams.get(p.key), 'read', p.key);
    assert.ok(![...u.searchParams.values()].includes('write'));
    assert.equal(Lib.githubAppCreateUrl(''), '');
    assert.match(Lib.githubAppCreateUrl('bad/org?x=1'), /organizations\/badorgx1\//, 'the organisation name cannot change the path');
  });
  test('the in-app steps come from that list (no stray "members")', () => {
    assert.match(app, /L\.GITHUB_APP_PERMISSIONS\.map/);
    assert.doesNotMatch(app, /commit statuses and members/);
  });
});

describe('downloaded workflow', () => {
  test('writes in the tenant settings, leaves secrets as secrets', () => {
    const out = Lib.githubWorkflowYml(yml, { appId: '123', tenantId: 't-1', clientId: 'c-1', hostname: 'x.sharepoint.com', sitePath: '/sites/Checkpoint', listPrefix: 'Checkpoint' });
    assert.match(out, /app-id: '123'/);
    assert.match(out, /TENANT_ID: 't-1'/);
    assert.match(out, /CLIENT_ID: 'c-1'/);
    assert.match(out, /SP_HOSTNAME: 'x\.sharepoint\.com'/);
    assert.match(out, /SP_SITE_PATH: '\/sites\/Checkpoint'/);
    assert.match(out, /\$\{\{ secrets\.CHECKPOINT_GH_APP_PRIVATE_KEY \}\}/);
    assert.match(out, /\$\{\{ secrets\.CHECKPOINT_CLIENT_SECRET \}\}/);
    assert.doesNotMatch(out, /LIST_PREFIX/, 'the default prefix needs no line');
  });
  test('a value not given stays a repository variable; a custom list prefix is added', () => {
    const out = Lib.githubWorkflowYml(yml, { tenantId: 't-1', listPrefix: 'CP' });
    assert.match(out, /app-id: \$\{\{ vars\.CHECKPOINT_GH_APP_ID \}\}/);
    assert.match(out, /CLIENT_ID: \$\{\{ vars\.CHECKPOINT_CLIENT_ID \}\}/);
    assert.match(out, /\n(\s+)SP_SITE_PATH:[^\n]*\n\1LIST_PREFIX: 'CP'/);
  });
  test('the app downloads it with the collector files', () => {
    assert.match(app, /'collector\/index\.mjs', 'collector\/checks\.mjs', 'collector\/scan-merge\.mjs', 'package\.json', 'README\.md', 'checkpoint-github-collector\.yml'/);
    assert.match(app, /name: '\.github\/workflows\/checkpoint-github-collector\.yml', content: yml/);
  });
});
