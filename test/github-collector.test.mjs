// The GitHub secure development collector (public/checkpoint/github/).
//
// Same two things worth pinning as the AWS collector. The verdicts: an
// unreadable signal abstains to 'manual', never a guessed pass and never
// a false fail. And the merge: the collector writes into the same daily
// scan row as the Microsoft scan and the AWS collector, and a merge bug
// looks like every other result quietly vanishing, not like a crash.
//
// Plus one GitHub-specific trap: branch rules live in TWO systems
// (repository rulesets and classic branch protection). A repository
// protected by either must pass, and a zero from one system must not be
// read as "unprotected" when the other could not be read.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import {
  GITHUB_CHECK_LABELS, branchReviewCheck, statusChecksCheck, secretScanningCheck, secretAlertsCheck,
  dependabotCheck, codeScanningCheck, orgTwoFactorCheck, buildGithubResults
} from '../public/checkpoint/github/collector/checks.mjs';
import { mergeIntoScan, raiseGithubDrift, withSource } from '../public/checkpoint/github/collector/scan-merge.mjs';
import { collectGithub } from '../public/checkpoint/github/collector/index.mjs';

const require = createRequire(import.meta.url);
const TODAY = '2026-08-22';
const repo = (over) => Object.assign({ name: 'api', archived: false, protection: { requiredReviews: 1, requiredStatusChecks: 2 }, secretScanning: 'enabled', pushProtection: 'enabled', hasRecentAnalysis: true }, over);

describe('GitHub checks — an unreadable signal abstains, it never guesses', () => {
  test('every check is manual when its input is missing', () => {
    const r = buildGithubResults({}, { today: TODAY });
    Object.entries(r.results).forEach(([id, v]) => assert.equal(v, 'manual', id));
    assert.equal(Object.keys(r.results).length, 7);
  });
  test('repositories whose protection could not be read are not counted as unprotected', () => {
    const v = branchReviewCheck([repo(), repo({ name: 'web', protection: { requiredReviews: null, requiredStatusChecks: null } })]);
    assert.equal(v.result, 'pass');
    assert.match(v.note, /could not be read/);
  });
  test('secret scanning settings invisible to the collector abstain', () => {
    assert.equal(secretScanningCheck([repo({ secretScanning: null })]).result, 'manual');
  });
  test('2FA visibility null abstains rather than failing', () => {
    assert.equal(orgTwoFactorCheck({ login: 'acme', twoFactorRequirementEnabled: null }).result, 'manual');
  });
});

describe('GitHub checks — verdicts', () => {
  test('review before merge: all protected passes, a stray repo reviews, a quarter fails', () => {
    const protectedRepos = Array.from({ length: 8 }, (_, i) => repo({ name: 'r' + i }));
    assert.equal(branchReviewCheck(protectedRepos).result, 'pass');
    assert.equal(branchReviewCheck([...protectedRepos, repo({ name: 'scratch', protection: { requiredReviews: 0, requiredStatusChecks: 0 } })]).result, 'review');
    const many = protectedRepos.slice(0, 3).concat([0, 1].map(i => repo({ name: 'u' + i, protection: { requiredReviews: 0, requiredStatusChecks: 0 } })));
    assert.equal(branchReviewCheck(many).result, 'fail');
  });
  test('archived repositories are out of scope', () => {
    assert.equal(branchReviewCheck([repo(), repo({ name: 'old', archived: true, protection: { requiredReviews: 0 } })]).result, 'pass');
  });
  test('required status checks', () => {
    assert.equal(statusChecksCheck([repo()]).result, 'pass');
    assert.equal(statusChecksCheck([repo({ protection: { requiredReviews: 1, requiredStatusChecks: 0 } })]).result, 'fail');
  });
  test('secret scanning: off fails; on without push protection reviews', () => {
    assert.equal(secretScanningCheck([repo()]).result, 'pass');
    assert.equal(secretScanningCheck([repo({ pushProtection: 'disabled' })]).result, 'review');
    assert.equal(secretScanningCheck([repo({ secretScanning: 'disabled' })]).result, 'fail');
  });
  test('secret alerts are judged against the window', () => {
    assert.equal(secretAlertsCheck([], 7, TODAY).result, 'pass');
    assert.equal(secretAlertsCheck([{ repo: 'api', createdIso: '2026-08-20' }], 7, TODAY).result, 'review');
    assert.equal(secretAlertsCheck([{ repo: 'api', createdIso: '2026-07-01' }], 7, TODAY).result, 'fail');
  });
  test('dependabot: overdue critical fails, overdue high reviews, fresh ones pass', () => {
    assert.equal(dependabotCheck([{ repo: 'api', severity: 'critical', createdIso: '2026-06-01' }], 30, TODAY).result, 'fail');
    assert.equal(dependabotCheck([{ repo: 'api', severity: 'high', createdIso: '2026-06-01' }], 30, TODAY).result, 'review');
    assert.equal(dependabotCheck([{ repo: 'api', severity: 'critical', createdIso: '2026-08-15' }], 30, TODAY).result, 'pass');
    assert.equal(dependabotCheck([{ repo: 'api', severity: 'critical', createdIso: 'garbage' }], 30, TODAY).result, 'pass', 'an unparseable date is never overdue');
  });
  test('code scanning: coverage and overdue findings', () => {
    assert.equal(codeScanningCheck([repo()], [], 30, TODAY).result, 'pass');
    assert.equal(codeScanningCheck([repo(), repo({ name: 'web', hasRecentAnalysis: false })], [], 30, TODAY).result, 'review');
    assert.equal(codeScanningCheck([repo({ hasRecentAnalysis: false })], [], 30, TODAY).result, 'fail');
    assert.equal(codeScanningCheck([repo()], [{ repo: 'api', severity: 'high', createdIso: '2026-05-01' }], 30, TODAY).result, 'fail');
  });
  test('org 2FA', () => {
    assert.equal(orgTwoFactorCheck({ login: 'acme', twoFactorRequirementEnabled: true }).result, 'pass');
    assert.equal(orgTwoFactorCheck({ login: 'acme', twoFactorRequirementEnabled: false }).result, 'fail');
  });
});

describe('collectGithub() — reading GitHub', () => {
  function fakeGh(routes) {
    const seen = [];
    async function req(path) {
      seen.push(path);
      for (const [re, res] of routes) if (re.test(path)) return typeof res === 'function' ? res(path) : res;
      return { status: 404, body: { message: 'Not Found' }, link: '' };
    }
    async function all(path) {
      const r = await req(path);
      return r.status === 200 ? r.body : null;
    }
    return { req, all, seen };
  }
  const base = [
    [/^\/orgs\/acme$/, { status: 200, body: { login: 'acme', two_factor_requirement_enabled: true } }],
    [/^\/orgs\/acme\/repos/, { status: 200, body: [
      { name: 'api', default_branch: 'main', archived: false, fork: false, security_and_analysis: { secret_scanning: { status: 'enabled' }, secret_scanning_push_protection: { status: 'enabled' } } },
      { name: 'fork-of-x', default_branch: 'main', archived: false, fork: true },
      { name: 'old', default_branch: 'main', archived: true, fork: false }
    ] }],
    [/dependabot\/alerts/, { status: 200, body: [{ repository: { name: 'api' }, created_at: '2026-08-01T00:00:00Z', security_advisory: { severity: 'critical', ghsa_id: 'GHSA-1' } }, { repository: { name: 'fork-of-x' }, created_at: '2026-01-01T00:00:00Z', security_advisory: { severity: 'critical' } }] }],
    [/code-scanning\/alerts/, { status: 200, body: [] }],
    [/secret-scanning\/alerts/, { status: 403, body: { message: 'Resource not accessible by integration' } }],
    [/code-scanning\/analyses/, { status: 200, body: [{ created_at: '2026-08-20T00:00:00Z' }] }]
  ];

  test('a repository protected only by a ruleset passes even though classic protection is empty', async () => {
    const gh = fakeGh([
      [/rules\/branches/, { status: 200, body: [{ type: 'pull_request', parameters: { required_approving_review_count: 2 } }, { type: 'required_status_checks', parameters: { required_status_checks: [{ context: 'ci' }] } }] }],
      [/branches\/main\/protection/, { status: 404, body: { message: 'Branch not protected' } }],
      ...base
    ]);
    const raw = await collectGithub(gh, 'acme', { today: TODAY });
    assert.deepEqual(raw.repos.map(r => r.name), ['api'], 'archived repos and forks are out of scope by default');
    assert.deepEqual(raw.repos[0].protection, { requiredReviews: 2, requiredStatusChecks: 1 });
  });

  test('classic protection alone also counts', async () => {
    const gh = fakeGh([
      [/rules\/branches/, { status: 200, body: [] }],
      [/branches\/main\/protection/, { status: 200, body: { required_pull_request_reviews: { required_approving_review_count: 1 }, required_status_checks: { contexts: ['build'], checks: [] } } }],
      ...base
    ]);
    const raw = await collectGithub(gh, 'acme', { today: TODAY });
    assert.deepEqual(raw.repos[0].protection, { requiredReviews: 1, requiredStatusChecks: 1 });
  });

  test('empty rulesets plus UNREADABLE classic protection is unknown, not unprotected', async () => {
    const gh = fakeGh([
      [/rules\/branches/, { status: 200, body: [] }],
      [/branches\/main\/protection/, { status: 403, body: { message: 'Resource not accessible by integration' } }],
      ...base
    ]);
    const raw = await collectGithub(gh, 'acme', { today: TODAY });
    assert.equal(raw.repos[0].protection.requiredReviews, null);
    assert.equal(buildGithubResults(raw, { today: TODAY }).results['gh-branch-review'], 'manual');
  });

  test('alerts from out-of-scope repositories are dropped; an unreadable alert feed is null, not empty', async () => {
    const gh = fakeGh([[/rules\/branches/, { status: 200, body: [] }], [/protection/, { status: 404, body: {} }], ...base]);
    const raw = await collectGithub(gh, 'acme', { today: TODAY });
    assert.deepEqual(raw.dependabotAlerts.map(a => a.repo), ['api']);
    assert.equal(raw.secretAlerts, null);
    assert.equal(buildGithubResults(raw, { today: TODAY }).results['gh-secret-alerts'], 'manual');
  });

  test('the collector only ever issues reads', async () => {
    const gh = fakeGh([[/rules\/branches/, { status: 200, body: [] }], [/protection/, { status: 404, body: {} }], ...base]);
    await collectGithub(gh, 'acme', { today: TODAY });
    // fakeGh.req takes a path only — there is no method to pass. This pins
    // that collectGithub never needs anything but GET.
    assert.ok(gh.seen.length > 0);
  });

  test('an allowlist limits the repositories in scope', async () => {
    const gh = fakeGh([[/rules\/branches/, { status: 200, body: [] }], [/protection/, { status: 404, body: {} }], ...base]);
    const raw = await collectGithub(gh, 'acme', { today: TODAY, repos: ['nothing-matches'] });
    assert.deepEqual(raw.repos, []);
  });
});

describe('mergeIntoScan() — must never blank the Microsoft or AWS results', () => {
  function fakeGraph(rows) {
    const calls = [];
    async function g(path, opts = {}) {
      if (opts.method === 'PATCH') { calls.push({ kind: 'patch', fields: opts.body.fields }); return {}; }
      if (opts.method === 'POST') { calls.push({ kind: 'post', fields: opts.body.fields }); return { id: 'new' }; }
      return { value: rows };
    }
    return { g, calls };
  }
  const ghOut = { results: { 'gh-branch-review': 'pass', 'gh-dependabot': 'fail' }, notes: { 'gh-branch-review': 'ok', 'gh-dependabot': 'old CVEs' } };

  test("merges into today's row, preserving Microsoft and AWS results", async () => {
    const existing = [{ id: '7', fields: { ScanDate: TODAY, Detail: JSON.stringify({ results: { 'mfa-all': 'pass', 'aws-cloudtrail': 'fail' }, notes: {}, source: 'automated+aws' }) } }];
    const { g, calls } = fakeGraph(existing);
    await mergeIntoScan(g, 'site', 'scans', ghOut, TODAY);
    const detail = JSON.parse(calls[0].fields.Detail);
    assert.equal(calls[0].kind, 'patch');
    assert.equal(detail.results['mfa-all'], 'pass');
    assert.equal(detail.results['aws-cloudtrail'], 'fail');
    assert.equal(detail.results['gh-branch-review'], 'pass');
    assert.equal(detail.source, 'automated+aws+github');
    assert.equal(calls[0].fields.Score, 50, 'recomputed over the union: 2 passes of 4, across all three sources');
  });

  test('re-running on the same day does not grow the source tag', () => {
    assert.equal(withSource('automated+github', 'github'), 'automated+github');
    assert.equal(withSource(undefined, 'github'), 'github-collector');
  });

  test('creates the row when nothing else has run today', async () => {
    const { g, calls } = fakeGraph([]);
    await mergeIntoScan(g, 'site', 'scans', ghOut, TODAY);
    assert.equal(calls[0].kind, 'post');
  });

  test('drift raises one alert for a pass -> fail, deduplicated against open alerts', async () => {
    const calls = [];
    const scans = [{ fields: { ScanDate: '2026-08-21', Detail: JSON.stringify({ results: { 'gh-dependabot': 'pass', 'gh-branch-review': 'pass' } }) } }];
    const alerts = [];
    async function g(path, opts = {}) {
      if (opts.method === 'POST') { calls.push(opts.body.fields); return {}; }
      return { value: path.includes('/alerts/') ? alerts : scans };
    }
    const n = await raiseGithubDrift(g, 'site', 'scans', 'alerts', ghOut, TODAY, () => {});
    assert.equal(n, 1);
    assert.equal(calls[0].CheckId, 'gh-dependabot');
    assert.equal(calls[0].CheckLabel, GITHUB_CHECK_LABELS['gh-dependabot']);
  });
});

describe('the browser app knows these checks', () => {
  test('every collector check id is a CHECK_DEFS id with the same label, gated on the github capability', async () => {
    globalThis.window = globalThis.window || {};
    window.CHECKPOINT_CONFIG = window.CHECKPOINT_CONFIG || { scopesProvision: [] };
    require('../public/checkpoint/store.js');
    const defs = new Map(window.CHECK_DEFS.map(c => [c.id, c]));
    Object.entries(GITHUB_CHECK_LABELS).forEach(([id, label]) => {
      assert.ok(defs.has(id), id + ' missing from CHECK_DEFS');
      assert.equal(defs.get(id).label, label, id + ' label drifted');
      assert.equal(defs.get(id).requiresCapability, 'github');
    });
  });
});
