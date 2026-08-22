// The AWS posture collector (public/checkpoint/aws/).
//
// Two things are worth pinning here. First the verdicts: a compliance
// check that guesses is worse than one that abstains, so every check
// must resolve to 'manual' when it could not read what it needed —
// never to a pass, and never to a fail that would send someone chasing
// a control that is actually fine.
//
// Second, and more dangerous: the collector MERGES into the same daily
// scan row the Microsoft scan writes. A merge bug does not look like a
// crash — it looks like every Microsoft check quietly vanishing from
// the day's posture, taking the score with it.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  rootMfaCheck, userMfaCheck, keyAgeCheck, cloudTrailCheck, configCheck,
  guardDutyCheck, s3PublicAccessCheck, ebsEncryptionCheck, rdsEncryptionCheck,
  openAdminPortsCheck, buildAwsResults
} from '../public/checkpoint/aws/collector/checks.mjs';

const TODAY = '2026-08-22';

describe('AWS checks — an unreadable signal abstains, it never guesses', () => {
  test('every check returns manual when its input is missing', () => {
    assert.equal(rootMfaCheck(null).result, 'manual');
    assert.equal(userMfaCheck(null).result, 'manual');
    assert.equal(keyAgeCheck(null, 90, TODAY).result, 'manual');
    assert.equal(cloudTrailCheck(null).result, 'manual');
    assert.equal(configCheck(null).result, 'manual');
    assert.equal(guardDutyCheck(null).result, 'manual');
    assert.equal(s3PublicAccessCheck(null).result, 'manual');
    assert.equal(ebsEncryptionCheck(undefined).result, 'manual');
    assert.equal(rdsEncryptionCheck(null).result, 'manual');
    assert.equal(openAdminPortsCheck(null).result, 'manual');
  });

  test('an unreadable signal is never reported as a pass', () => {
    [rootMfaCheck(null), cloudTrailCheck(null), guardDutyCheck(null), s3PublicAccessCheck(null)]
      .forEach(v => assert.notEqual(v.result, 'pass'));
  });
});

describe('AWS checks — verdicts', () => {
  test('root MFA', () => {
    assert.equal(rootMfaCheck({ AccountMFAEnabled: 1 }).result, 'pass');
    assert.equal(rootMfaCheck({ AccountMFAEnabled: 0 }).result, 'fail');
  });

  test('console users without MFA fail; programmatic-only users are not counted against the tenant', () => {
    assert.equal(userMfaCheck([{ userName: 'a', hasConsoleAccess: true, mfaEnabled: true }]).result, 'pass');
    assert.equal(userMfaCheck([{ userName: 'a', hasConsoleAccess: true, mfaEnabled: false }]).result, 'fail');
    assert.equal(userMfaCheck([{ userName: 'ci-deploy', hasConsoleAccess: false, mfaEnabled: false }]).result, 'pass',
      'a service identity with no console password cannot use MFA and must not be a finding');
  });

  test('access keys are judged against the tenant policy, not a hard-coded number', () => {
    const keys = [{ userName: 'a', status: 'Active', createdIso: '2026-01-01' }];
    assert.equal(keyAgeCheck(keys, 90, TODAY).result, 'fail', 'old against a 90-day policy');
    assert.equal(keyAgeCheck(keys, 365, TODAY).result, 'pass', 'same key, 365-day policy');
    assert.equal(keyAgeCheck([{ userName: 'a', status: 'Inactive', createdIso: '2020-01-01' }], 90, TODAY).result, 'pass',
      'an inactive key is not a rotation finding');
  });

  test('CloudTrail: absent fails, single-region is a review, multi-region passes', () => {
    assert.equal(cloudTrailCheck([]).result, 'fail');
    assert.equal(cloudTrailCheck([{ name: 't', isLogging: false, isMultiRegion: true }]).result, 'fail', 'a trail that is not logging is not a control');
    assert.equal(cloudTrailCheck([{ name: 't', isLogging: true, isMultiRegion: false }]).result, 'review');
    assert.equal(cloudTrailCheck([{ name: 't', isLogging: true, isMultiRegion: true }]).result, 'pass');
  });

  test('S3: a PARTIAL public-access block is a review, not a pass', () => {
    const all = { BlockPublicAcls: true, IgnorePublicAcls: true, BlockPublicPolicy: true, RestrictPublicBuckets: true };
    assert.equal(s3PublicAccessCheck(all).result, 'pass');
    assert.equal(s3PublicAccessCheck({ ...all, RestrictPublicBuckets: false }).result, 'review',
      'the half-configured state people mistake for protection must not read as protected');
    assert.equal(s3PublicAccessCheck({ BlockPublicAcls: false, IgnorePublicAcls: false, BlockPublicPolicy: false, RestrictPublicBuckets: false }).result, 'fail');
  });

  test('RDS: no instances is a pass, not a false failure', () => {
    assert.equal(rdsEncryptionCheck([]).result, 'pass');
    assert.equal(rdsEncryptionCheck([{ id: 'db1', storageEncrypted: true }]).result, 'pass');
    assert.equal(rdsEncryptionCheck([{ id: 'db1', storageEncrypted: false }]).result, 'fail');
  });

  test('security groups: only ADMIN ports open to the world are a finding', () => {
    const world = (fromPort, toPort) => ([{ id: 'sg-1', name: 'web', inbound: [{ fromPort, toPort, openToWorld: true }] }]);
    assert.equal(openAdminPortsCheck(world(443, 443)).result, 'pass', 'a public web port is a web server doing its job');
    assert.equal(openAdminPortsCheck(world(22, 22)).result, 'fail', 'SSH open to the internet');
    assert.equal(openAdminPortsCheck(world(0, 65535)).result, 'fail', 'an all-ports rule covers the admin ports');
    assert.equal(openAdminPortsCheck([{ id: 'sg-2', name: 'int', inbound: [{ fromPort: 22, toPort: 22, openToWorld: false }] }]).result, 'pass',
      'SSH restricted to a known CIDR is not a finding');
  });
});

describe('buildAwsResults() — the shape the app consumes', () => {
  test('produces a verdict and a note for all ten checks', () => {
    const out = buildAwsResults({}, { today: TODAY });
    assert.equal(Object.keys(out.results).length, 10);
    Object.keys(out.results).forEach(id => {
      assert.ok(id.startsWith('aws-'), `${id} must be namespaced so it cannot collide with a Microsoft check id`);
      assert.ok(out.notes[id] && out.notes[id].length > 10, `${id} must explain its verdict`);
    });
  });

  test('an empty account resolves every check to manual, never to a clean bill of health', () => {
    const out = buildAwsResults({}, { today: TODAY });
    assert.ok(Object.values(out.results).every(v => v === 'manual'));
  });
});

// ── The write side ───────────────────────────────────────────────────
// Imported from scan-merge.mjs rather than index.mjs: index.mjs pulls in
// the AWS SDK, which only exists inside the Lambda runtime, so the merge
// logic was split out precisely so it could be tested here.
import { scoreOf, mergeIntoScan } from '../public/checkpoint/aws/collector/scan-merge.mjs';

describe('scoreOf() — mirrors lib.js score()', () => {
  test('manual is excluded from the denominator', () => {
    assert.equal(scoreOf({ a: 'pass', b: 'manual' }), 100);
    assert.equal(scoreOf({ a: 'pass', b: 'fail' }), 50);
    assert.equal(scoreOf({ a: 'review', b: 'review' }), 50);
    assert.equal(scoreOf({ a: 'manual' }), 100, 'nothing measured is not a zero');
    assert.equal(scoreOf({ a: 'fail' }), 5, 'floored at 5 once something was measured');
  });
});

describe('mergeIntoScan() — must never blank the Microsoft results', () => {
  function fakeGraph(rows) {
    const calls = [];
    async function g(path, opts = {}) {
      if (opts.method === 'PATCH') { calls.push({ kind: 'patch', fields: opts.body.fields }); return {}; }
      if (opts.method === 'POST') { calls.push({ kind: 'post', fields: opts.body.fields }); return { id: 'new' }; }
      return { value: rows };
    }
    return { g, calls };
  }
  const awsOut = { results: { 'aws-root-mfa': 'pass', 'aws-cloudtrail': 'fail' }, notes: { 'aws-root-mfa': 'ok', 'aws-cloudtrail': 'no trail' } };

  test("merges into today's existing row, preserving every Microsoft result", async () => {
    const existing = [{ id: '7', fields: { ScanDate: TODAY, Detail: JSON.stringify({ results: { 'mfa-all': 'pass', legacy: 'fail' }, notes: { 'mfa-all': 'x' }, source: 'automated' }) } }];
    const { g, calls } = fakeGraph(existing);
    const res = await mergeIntoScan(g, 'site', 'scans', awsOut, TODAY);
    assert.equal(res.merged, true);
    assert.equal(calls[0].kind, 'patch', "updates the day's row rather than adding a second one");
    const detail = JSON.parse(calls[0].fields.Detail);
    assert.equal(detail.results['mfa-all'], 'pass', 'Microsoft result survives the merge');
    assert.equal(detail.results.legacy, 'fail');
    assert.equal(detail.results['aws-root-mfa'], 'pass', 'AWS result is added');
    assert.equal(detail.source, 'automated+aws', 'the row records that both collectors contributed');
  });

  test('score is recomputed over the UNION, not over the AWS results alone', async () => {
    const existing = [{ id: '7', fields: { ScanDate: TODAY, Detail: JSON.stringify({ results: { a: 'pass', b: 'pass' }, notes: {} }) } }];
    const { g, calls } = fakeGraph(existing);
    await mergeIntoScan(g, 'site', 'scans', { results: { 'aws-x': 'fail', 'aws-y': 'fail' }, notes: {} }, TODAY);
    assert.equal(calls[0].fields.Score, 50, 'two passes and two fails across both clouds');
  });

  test('creates the row when the Microsoft scan has not run today', async () => {
    const { g, calls } = fakeGraph([]);
    const res = await mergeIntoScan(g, 'site', 'scans', awsOut, TODAY);
    assert.equal(res.merged, false);
    assert.equal(calls[0].kind, 'post');
    assert.equal(JSON.parse(calls[0].fields.Detail).source, 'aws-collector');
  });

  test('a row from a PREVIOUS day is never merged into', async () => {
    const stale = [{ id: '1', fields: { ScanDate: '2026-08-01', Detail: JSON.stringify({ results: { a: 'pass' }, notes: {} }) } }];
    const { g, calls } = fakeGraph(stale);
    await mergeIntoScan(g, 'site', 'scans', awsOut, TODAY);
    assert.equal(calls[0].kind, 'post', "yesterday's posture is not overwritten with today's findings");
    assert.equal(JSON.parse(calls[0].fields.Detail).results.a, undefined);
  });

  test("malformed prior Detail does not discard this run's findings", async () => {
    const broken = [{ id: '9', fields: { ScanDate: TODAY, Detail: '{not json' } }];
    const { g, calls } = fakeGraph(broken);
    await mergeIntoScan(g, 'site', 'scans', awsOut, TODAY);
    assert.equal(JSON.parse(calls[0].fields.Detail).results['aws-root-mfa'], 'pass');
  });
});
