// Covers the scheduled monitor's newer posture checks — the ones added
// to close the gap between the 19 checks public/checkpoint/azure/
// PostureMonitor/index.js used to score unattended and the 41+ the
// interactive browser app scores on demand. Without these, a tenant
// running the monitor saw a nightly score computed over a different,
// smaller denominator than a browser scan of the identical tenant, and
// pass->fail drift on any of the missing checks (a Privileged Role
// Administrator gaining a second role, a Conditional Access policy
// disabled) went undetected until someone happened to click Scan.
//
// Two kinds of coverage:
//
// 1. Drift protection for the six register-derived checks (backup, bcp,
//    supplier, policy, audit-review, incident-lessons). index.js's own
//    header comment says "no shared module between the browser bundle
//    and this Function... if you change one, change the other" — true
//    of the Graph-fetching, but the SCORING logic for these six was
//    deliberately ported using the exact same input shape lib.js's own
//    functions take, specifically so the two sides can be fed identical
//    fixtures and asserted equal here — turning "remember to update
//    both by hand" into something a failing test catches instead.
//
// 2. End-to-end tests of runPostureChecks()/runRegisterChecks() against
//    a fake Graph client, for the checks that mine fields off a
//    response another check already fetches (ca-device/ca-risk/ca-sif/
//    ca-tou/ca-cas off the same Conditional Access policy array;
//    oauth-consent off the same OAuth grants array; device-checkin off
//    the same managed-devices array) or make a small number of new
//    calls under a permission already granted (leaver/sod/device-config).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const monitor = require('../public/checkpoint/azure/PostureMonitor/index.js').__test;
const CheckpointLib = require('../public/checkpoint/lib.js');

const TODAY = '2026-06-15';
const PAST = '2026-01-01';
const FUTURE = '2027-01-01';

function fakeGraph(routes) {
  async function g(path, opts) {
    for (const [re, handler] of routes) {
      const m = path.match(re);
      if (m) return handler(path, opts, m);
    }
    throw new Error('unexpected path in test fake: ' + path);
  }
  async function gAll(path) {
    const page = await g(path);
    return page.value || [];
  }
  return { g, gAll };
}

const NO_OP_SETTINGS = {};

describe('drift protection — register-derived checks agree with lib.js', () => {
  const calendarCases = [
    [],
    [{ category: 'Backup restore test', status: 'Active', nextDue: FUTURE, lastCompleted: PAST }],
    [{ category: 'Backup restore test', status: 'Active', nextDue: PAST, lastCompleted: PAST }],
    [{ category: 'Backup restore test', status: 'Active', nextDue: FUTURE, lastCompleted: '' }],
    [{ category: 'BCP/DR test', status: 'Active', nextDue: FUTURE, lastCompleted: PAST }],
    [{ category: 'Access control review', status: 'Active', nextDue: FUTURE, lastCompleted: PAST }]
  ];

  test('backupCheckResult() matches lib.js across every calendar fixture', () => {
    calendarCases.forEach((cal) => {
      assert.deepEqual(
        monitor.backupCheckResult(cal, TODAY),
        CheckpointLib.backupCheckResult(cal, TODAY),
        JSON.stringify(cal)
      );
    });
  });

  const docsCases = [
    [],
    [{ category: 'Policies & Procedures', tplId: 'bcp-dr-plan', status: 'Approved', nextReview: FUTURE, version: '1.0', owner: 'S. Okafor' }],
    [{ category: 'Policies & Procedures', tplId: 'bcp-dr-plan', status: 'Draft', nextReview: FUTURE, version: '', owner: '' }],
    [{ category: 'Policies & Procedures', tplId: 'bcp-dr-plan', status: 'Approved', nextReview: PAST, version: '1.0', owner: 'S. Okafor' }]
  ];

  test('bcpCheckResult() matches lib.js across combined calendar/docs fixtures', () => {
    calendarCases.forEach((cal) => {
      docsCases.forEach((docs) => {
        assert.deepEqual(
          monitor.bcpCheckResult(cal, docs, TODAY),
          CheckpointLib.bcpCheckResult(cal, docs, TODAY),
          JSON.stringify({ cal, docs })
        );
      });
    });
  });

  const vendorCases = [
    [],
    [{ criticality: 'Critical', lastReviewed: PAST, nextReviewDue: FUTURE }],
    [{ criticality: 'Critical', lastReviewed: PAST, nextReviewDue: PAST }],
    [{ criticality: 'Low', lastReviewed: '', nextReviewDue: '' }],
    [{ criticality: 'Critical', nextReviewDue: FUTURE }, { criticality: 'Low', nextReviewDue: PAST }]
  ];

  test('supplierCheckResult() matches lib.js across every vendor fixture', () => {
    vendorCases.forEach((v) => {
      assert.deepEqual(
        monitor.supplierCheckResult(v, TODAY),
        CheckpointLib.supplierCheckResult(v, TODAY),
        JSON.stringify(v)
      );
    });
  });

  const policyDocsCases = [
    [],
    [{ category: 'Policies & Procedures', status: 'Approved', version: '1.0', owner: 'S. Okafor', nextReview: FUTURE }],
    [{ category: 'Policies & Procedures', status: 'Draft', version: '', owner: '', nextReview: '' }],
    [{ category: 'Policies & Procedures', status: 'Approved', version: '1.0', owner: 'S. Okafor', nextReview: PAST }],
    [{ category: 'Policies & Procedures', status: 'Approved', version: '', owner: 'S. Okafor', nextReview: FUTURE }],
    [{ category: 'Auto-evidence', status: '' }]
  ];

  test('policyCheckResult() matches lib.js across every document fixture', () => {
    policyDocsCases.forEach((docs) => {
      assert.deepEqual(
        monitor.policyCheckResult(docs, TODAY, {}),
        CheckpointLib.policyCheckResult(docs, TODAY, {}),
        JSON.stringify(docs)
      );
    });
  });

  const auditCases = [
    [],
    [{ status: 'Completed', completed: PAST }],
    [{ status: 'Planned', completed: '' }],
    [{ status: 'Completed', completed: '2024-01-01' }],
    [{ status: 'Completed', completed: '2024-01-01' }, { status: 'Completed', completed: PAST }]
  ];

  test('independentReviewResult() matches lib.js across every audit fixture', () => {
    auditCases.forEach((audits) => {
      assert.deepEqual(
        monitor.independentReviewResult(audits, TODAY),
        CheckpointLib.independentReviewResult(audits, TODAY),
        JSON.stringify(audits)
      );
    });
  });

  const incidentCases = [
    [],
    [{ status: 'Closed', severity: 'High', rootCause: 'Phishing', lessonsLearned: 'MFA rollout' }],
    [{ status: 'Open', severity: 'High', rootCause: '', lessonsLearned: '' }],
    [{ status: 'Closed', severity: 'Critical', rootCause: '', lessonsLearned: '' }],
    [{ status: 'Closed', severity: 'Low', rootCause: '', lessonsLearned: '' }]
  ];

  test('incidentLessonsResult() matches lib.js across every incident fixture', () => {
    incidentCases.forEach((incidents) => {
      assert.deepEqual(
        monitor.incidentLessonsResult(incidents),
        CheckpointLib.incidentLessonsResult(incidents),
        JSON.stringify(incidents)
      );
    });
  });
});

describe('runPostureChecks() — Conditional Access mining (ca-device/ca-risk/ca-sif/ca-tou/ca-cas)', () => {
  function graphWithPolicies(policies) {
    return fakeGraph([
      [/^\/identity\/conditionalAccess\/policies$/, () => ({ value: policies })],
      [/^\/directoryRoles\(roleTemplateId=/, () => ({ value: [] })],
      [/^\/roleManagement\/directory\/roleAssignmentScheduleInstances/, () => ({ value: [] })],
      [/^\/roleManagement\/directory\/roleEligibilityScheduleInstances/, () => ({ value: [] })],
      [/^\/users\?\$select=id,displayName,userPrincipalName,accountEnabled/, () => ({ value: [] })],
      [/^\/directoryRoles\?\$select/, () => ({ value: [] })],
      [/^\/users\?\$filter=userType/, () => ({ value: [] })],
      [/^\/identityProtection\/riskyUsers/, () => ({ value: [] })],
      [/^\/deviceManagement\/managedDevices/, () => ({ value: [] })],
      [/^\/deviceManagement\/deviceCompliancePolicies/, () => ({ value: [] })],
      [/^\/deviceManagement\/deviceConfigurations/, () => ({ value: [] })],
      [/^\/oauth2PermissionGrants/, () => ({ value: [] })],
      [/^\/identityGovernance\/accessReviews\/definitions/, () => ({ value: [] })],
      [/^\/security\/secureScores/, () => ({ value: [] })]
    ]);
  }

  test('an all-apps device-compliance policy passes ca-device', async () => {
    const { g, gAll } = graphWithPolicies([{
      state: 'enabled',
      conditions: { applications: { includeApplications: ['All'] } },
      grantControls: { builtInControls: ['compliantDevice'] }
    }]);
    const { results } = await monitor.runPostureChecks(g, gAll, NO_OP_SETTINGS);
    assert.equal(results['ca-device'], 'pass');
  });

  test('device compliance on some but not all apps is a review', async () => {
    const { g, gAll } = graphWithPolicies([{
      state: 'enabled',
      conditions: { applications: { includeApplications: ['app-1'] } },
      grantControls: { builtInControls: ['compliantDevice'] }
    }]);
    const { results } = await monitor.runPostureChecks(g, gAll, NO_OP_SETTINGS);
    assert.equal(results['ca-device'], 'review');
  });

  test('no policies at all fails ca-device and ca-sif, but reviews ca-tou/ca-cas', async () => {
    const { g, gAll } = graphWithPolicies([]);
    const { results } = await monitor.runPostureChecks(g, gAll, NO_OP_SETTINGS);
    assert.equal(results['ca-device'], 'fail');
    assert.equal(results['ca-sif'], 'fail');
    assert.equal(results['ca-tou'], 'review');
    assert.equal(results['ca-cas'], 'review');
  });

  test('sign-in-risk AND user-risk enforced passes ca-risk; only one is a review', async () => {
    const both = [{
      state: 'enabled',
      conditions: { signInRiskLevels: ['high'], userRiskLevels: ['high'] },
      grantControls: { builtInControls: ['block'] }
    }];
    let r = await monitor.runPostureChecks(...Object.values(graphWithPolicies(both)), NO_OP_SETTINGS);
    assert.equal(r.results['ca-risk'], 'pass');

    const oneOnly = [{ state: 'enabled', conditions: { signInRiskLevels: ['high'] }, grantControls: { builtInControls: ['block'] } }];
    r = await monitor.runPostureChecks(...Object.values(graphWithPolicies(oneOnly)), NO_OP_SETTINGS);
    assert.equal(r.results['ca-risk'], 'review');
  });

  test('sign-in frequency scoped to a privileged role passes ca-sif', async () => {
    const { g, gAll } = graphWithPolicies([{
      state: 'enabled',
      conditions: { users: { includeRoles: ['role-1'] } },
      sessionControls: { signInFrequency: { isEnabled: true } }
    }]);
    const { results } = await monitor.runPostureChecks(g, gAll, NO_OP_SETTINGS);
    assert.equal(results['ca-sif'], 'pass');
  });

  test('Terms of Use required passes ca-tou', async () => {
    const { g, gAll } = graphWithPolicies([{ state: 'enabled', grantControls: { termsOfUse: ['tou-1'] } }]);
    const { results } = await monitor.runPostureChecks(g, gAll, NO_OP_SETTINGS);
    assert.equal(results['ca-tou'], 'pass');
  });

  test('Defender for Cloud Apps session control enabled passes ca-cas', async () => {
    const { g, gAll } = graphWithPolicies([{
      state: 'enabled',
      sessionControls: { cloudAppSecurity: { isEnabled: true } }
    }]);
    const { results } = await monitor.runPostureChecks(g, gAll, NO_OP_SETTINGS);
    assert.equal(results['ca-cas'], 'pass');
  });

  test('a disabled policy is ignored by every CA-mining check', async () => {
    const { g, gAll } = graphWithPolicies([{
      state: 'disabled',
      conditions: { applications: { includeApplications: ['All'] }, signInRiskLevels: ['high'], userRiskLevels: ['high'], users: { includeRoles: ['role-1'] } },
      grantControls: { builtInControls: ['compliantDevice', 'block'], termsOfUse: ['tou-1'] },
      sessionControls: { signInFrequency: { isEnabled: true }, cloudAppSecurity: { isEnabled: true } }
    }]);
    const { results } = await monitor.runPostureChecks(g, gAll, NO_OP_SETTINGS);
    assert.equal(results['ca-device'], 'fail');
    assert.equal(results['ca-risk'], 'fail');
    assert.equal(results['ca-sif'], 'fail');
    assert.equal(results['ca-tou'], 'review');
    assert.equal(results['ca-cas'], 'review');
  });
});

describe('runPostureChecks() — leaver and sod share one directory-role read', () => {
  function graphWithDirectory(users, roles, membersByRole) {
    return fakeGraph([
      [/^\/identity\/conditionalAccess\/policies$/, () => ({ value: [] })],
      [/^\/users\?\$select=id,displayName,userPrincipalName,accountEnabled/, () => ({ value: users })],
      [/^\/directoryRoles\?\$select/, () => ({ value: roles })],
      [/^\/directoryRoles\/([^/]+)\/members/, (path, opts, m) => ({ value: membersByRole[m[1]] || [] })],
      [/^\/directoryRoles\(roleTemplateId=/, () => ({ value: [] })],
      [/^\/roleManagement\/directory\/roleAssignmentScheduleInstances/, () => ({ value: [] })],
      [/^\/roleManagement\/directory\/roleEligibilityScheduleInstances/, () => ({ value: [] })],
      [/^\/users\?\$filter=userType/, () => ({ value: [] })],
      [/^\/identityProtection\/riskyUsers/, () => ({ value: [] })],
      [/^\/deviceManagement\/managedDevices/, () => ({ value: [] })],
      [/^\/deviceManagement\/deviceCompliancePolicies/, () => ({ value: [] })],
      [/^\/deviceManagement\/deviceConfigurations/, () => ({ value: [] })],
      [/^\/oauth2PermissionGrants/, () => ({ value: [] })],
      [/^\/identityGovernance\/accessReviews\/definitions/, () => ({ value: [] })],
      [/^\/security\/secureScores/, () => ({ value: [] })]
    ]);
  }

  test('a disabled account with no privileged role or licence passes leaver', async () => {
    const users = [{ id: 'u1', userType: 'Member', accountEnabled: false, assignedLicenses: [] }];
    const { g, gAll } = graphWithDirectory(users, [], {});
    const { results } = await monitor.runPostureChecks(g, gAll, NO_OP_SETTINGS);
    assert.equal(results.leaver, 'pass');
  });

  test('a disabled account still holding a privileged role fails leaver', async () => {
    const users = [{ id: 'u1', userType: 'Member', accountEnabled: false, assignedLicenses: [] }];
    const roles = [{ id: 'role-pra', displayName: 'Privileged Role Administrator' }];
    const membersByRole = { 'role-pra': [{ id: 'u1', displayName: 'Departed User' }] };
    const { g, gAll } = graphWithDirectory(users, roles, membersByRole);
    const { results } = await monitor.runPostureChecks(g, gAll, NO_OP_SETTINGS);
    assert.equal(results.leaver, 'fail');
  });

  test('a disabled account still licensed (no privileged role) is a review', async () => {
    const users = [{ id: 'u1', userType: 'Member', accountEnabled: false, assignedLicenses: [{ skuId: 'x' }] }];
    const { g, gAll } = graphWithDirectory(users, [], {});
    const { results } = await monitor.runPostureChecks(g, gAll, NO_OP_SETTINGS);
    assert.equal(results.leaver, 'review');
  });

  test('a Privileged Role Administrator holding another role fails sod', async () => {
    const roles = [
      { id: 'role-pra', displayName: 'Privileged Role Administrator' },
      { id: 'role-ua', displayName: 'User Administrator' }
    ];
    const membersByRole = {
      'role-pra': [{ id: 'u1', displayName: 'Alex' }],
      'role-ua': [{ id: 'u1', displayName: 'Alex' }]
    };
    const { g, gAll } = graphWithDirectory([], roles, membersByRole);
    const { results } = await monitor.runPostureChecks(g, gAll, NO_OP_SETTINGS);
    assert.equal(results.sod, 'fail');
  });

  test('a Privileged Role Administrator holding no other role passes sod', async () => {
    const roles = [{ id: 'role-pra', displayName: 'Privileged Role Administrator' }];
    const membersByRole = { 'role-pra': [{ id: 'u1', displayName: 'Alex' }] };
    const { g, gAll } = graphWithDirectory([], roles, membersByRole);
    const { results } = await monitor.runPostureChecks(g, gAll, NO_OP_SETTINGS);
    assert.equal(results.sod, 'pass');
  });

  test('no readable role data at all leaves sod manual', async () => {
    const { g, gAll } = graphWithDirectory([], [], {});
    const { results } = await monitor.runPostureChecks(g, gAll, NO_OP_SETTINGS);
    assert.equal(results.sod, 'manual');
  });
});

describe('runPostureChecks() — device-checkin, device-config, oauth-consent', () => {
  function graphWith({ devices = [], deviceConfigs = [], grants = [] }) {
    return fakeGraph([
      [/^\/identity\/conditionalAccess\/policies$/, () => ({ value: [] })],
      [/^\/users\?\$select=id,displayName,userPrincipalName,accountEnabled/, () => ({ value: [] })],
      [/^\/directoryRoles\?\$select/, () => ({ value: [] })],
      [/^\/directoryRoles\(roleTemplateId=/, () => ({ value: [] })],
      [/^\/roleManagement\/directory\/roleAssignmentScheduleInstances/, () => ({ value: [] })],
      [/^\/roleManagement\/directory\/roleEligibilityScheduleInstances/, () => ({ value: [] })],
      [/^\/users\?\$filter=userType/, () => ({ value: [] })],
      [/^\/identityProtection\/riskyUsers/, () => ({ value: [] })],
      [/^\/deviceManagement\/managedDevices/, () => ({ value: devices })],
      [/^\/deviceManagement\/deviceCompliancePolicies/, () => ({ value: [] })],
      [/^\/deviceManagement\/deviceConfigurations/, () => ({ value: deviceConfigs })],
      [/^\/oauth2PermissionGrants/, () => ({ value: grants })],
      [/^\/identityGovernance\/accessReviews\/definitions/, () => ({ value: [] })],
      [/^\/security\/secureScores/, () => ({ value: [] })]
    ]);
  }

  test('all devices recently checked in passes device-checkin', async () => {
    const devices = [{ complianceState: 'compliant', lastSyncDateTime: new Date().toISOString() }];
    const { g, gAll } = graphWith({ devices });
    const { results } = await monitor.runPostureChecks(g, gAll, NO_OP_SETTINGS);
    assert.equal(results['device-checkin'], 'pass');
  });

  test('a device that never checked in fails device-checkin once past 10% of the fleet', async () => {
    const devices = [{ complianceState: 'compliant', lastSyncDateTime: null }];
    const { g, gAll } = graphWith({ devices });
    const { results } = await monitor.runPostureChecks(g, gAll, NO_OP_SETTINGS);
    assert.equal(results['device-checkin'], 'fail');
  });

  test('zero classic device configuration profiles is manual, not fail', async () => {
    const { g, gAll } = graphWith({ deviceConfigs: [] });
    const { results } = await monitor.runPostureChecks(g, gAll, NO_OP_SETTINGS);
    assert.equal(results['device-config'], 'manual');
  });

  test('at least one device configuration profile passes device-config', async () => {
    const { g, gAll } = graphWith({ deviceConfigs: [{ id: 'c1' }] });
    const { results } = await monitor.runPostureChecks(g, gAll, NO_OP_SETTINGS);
    assert.equal(results['device-config'], 'pass');
  });

  test('a high-privilege grant consented to directly by an end user fails oauth-consent', async () => {
    const grants = [{ scope: 'Mail.ReadWrite', consentType: 'Principal' }];
    const { g, gAll } = graphWith({ grants });
    const { results } = await monitor.runPostureChecks(g, gAll, NO_OP_SETTINGS);
    assert.equal(results['oauth-consent'], 'review');
  });

  test('the same high-privilege grant admin-consented passes oauth-consent', async () => {
    const grants = [{ scope: 'Mail.ReadWrite', consentType: 'AllPrincipals' }];
    const { g, gAll } = graphWith({ grants });
    const { results } = await monitor.runPostureChecks(g, gAll, NO_OP_SETTINGS);
    assert.equal(results['oauth-consent'], 'pass');
  });
});

describe('runPostureChecks() — xdr-incidents, privacy-srr, lifecycle-workflows', () => {
  function graphWith({ incidents = [], srrs = [], workflows = [] } = {}) {
    return fakeGraph([
      [/^\/identity\/conditionalAccess\/policies$/, () => ({ value: [] })],
      [/^\/users\?\$select=id,displayName,userPrincipalName,accountEnabled/, () => ({ value: [] })],
      [/^\/directoryRoles\?\$select/, () => ({ value: [] })],
      [/^\/directoryRoles\(roleTemplateId=/, () => ({ value: [] })],
      [/^\/roleManagement\/directory\/roleAssignmentScheduleInstances/, () => ({ value: [] })],
      [/^\/roleManagement\/directory\/roleEligibilityScheduleInstances/, () => ({ value: [] })],
      [/^\/users\?\$filter=userType/, () => ({ value: [] })],
      [/^\/identityProtection\/riskyUsers/, () => ({ value: [] })],
      [/^\/deviceManagement\/managedDevices/, () => ({ value: [] })],
      [/^\/deviceManagement\/deviceCompliancePolicies/, () => ({ value: [] })],
      [/^\/deviceManagement\/deviceConfigurations/, () => ({ value: [] })],
      [/^\/oauth2PermissionGrants/, () => ({ value: [] })],
      [/^\/identityGovernance\/accessReviews\/definitions/, () => ({ value: [] })],
      [/^\/security\/secureScores/, () => ({ value: [] })],
      [/^\/security\/incidents/, () => ({ value: incidents })],
      [/^\/security\/subjectRightsRequests/, () => ({ value: srrs })],
      [/^\/identityGovernance\/lifecycleWorkflows\/workflows/, () => ({ value: workflows })]
    ]);
  }

  test('no active incidents passes xdr-incidents', async () => {
    const { g, gAll } = graphWith({ incidents: [] });
    const { results } = await monitor.runPostureChecks(g, gAll, NO_OP_SETTINGS);
    assert.equal(results['xdr-incidents'], 'pass');
  });

  test('a high-severity incident overdue its triage window fails xdr-incidents', async () => {
    const incidents = [{ status: 'active', severity: 'high', createdDateTime: new Date(Date.now() - 10 * 86400000).toISOString(), assignedTo: 'someone' }];
    const { g, gAll } = graphWith({ incidents });
    const { results } = await monitor.runPostureChecks(g, gAll, NO_OP_SETTINGS);
    assert.equal(results['xdr-incidents'], 'fail');
  });

  test('an unassigned high-severity incident within the window is a review, not a fail', async () => {
    const incidents = [{ status: 'active', severity: 'high', createdDateTime: new Date().toISOString(), assignedTo: '' }];
    const { g, gAll } = graphWith({ incidents });
    const { results } = await monitor.runPostureChecks(g, gAll, NO_OP_SETTINGS);
    assert.equal(results['xdr-incidents'], 'review');
  });

  test('no open subject rights requests passes privacy-srr', async () => {
    const { g, gAll } = graphWith({ srrs: [] });
    const { results } = await monitor.runPostureChecks(g, gAll, NO_OP_SETTINGS);
    assert.equal(results['privacy-srr'], 'pass');
  });

  test('an open request past its due date fails privacy-srr', async () => {
    const srrs = [{ status: 'active', dueDateTime: PAST }];
    const { g, gAll } = graphWith({ srrs });
    const { results } = await monitor.runPostureChecks(g, gAll, NO_OP_SETTINGS);
    assert.equal(results['privacy-srr'], 'fail');
  });

  test('a closed request past its recorded due date does not count as open', async () => {
    const srrs = [{ status: 'closed', dueDateTime: PAST }];
    const { g, gAll } = graphWith({ srrs });
    const { results } = await monitor.runPostureChecks(g, gAll, NO_OP_SETTINGS);
    assert.equal(results['privacy-srr'], 'pass');
  });

  test('joiner and leaver both automated and enabled passes lifecycle-workflows', async () => {
    const workflows = [{ isEnabled: true, category: 'joiner' }, { isEnabled: true, category: 'leaver' }];
    const { g, gAll } = graphWith({ workflows });
    const { results } = await monitor.runPostureChecks(g, gAll, NO_OP_SETTINGS);
    assert.equal(results['lifecycle-workflows'], 'pass');
  });

  test('only one of joiner/leaver automated is a review', async () => {
    const workflows = [{ isEnabled: true, category: 'joiner' }];
    const { g, gAll } = graphWith({ workflows });
    const { results } = await monitor.runPostureChecks(g, gAll, NO_OP_SETTINGS);
    assert.equal(results['lifecycle-workflows'], 'review');
  });

  test('no Lifecycle Workflows configured fails, not manual — this Function does no capability probing', async () => {
    const { g, gAll } = graphWith({ workflows: [] });
    const { results } = await monitor.runPostureChecks(g, gAll, NO_OP_SETTINGS);
    assert.equal(results['lifecycle-workflows'], 'fail');
  });

  test('a disabled workflow in the right category is ignored', async () => {
    const workflows = [{ isEnabled: false, category: 'joiner' }, { isEnabled: false, category: 'leaver' }];
    const { g, gAll } = graphWith({ workflows });
    const { results } = await monitor.runPostureChecks(g, gAll, NO_OP_SETTINGS);
    assert.equal(results['lifecycle-workflows'], 'fail');
  });
});

describe('runRegisterChecks() — end to end against a fake SharePoint site', () => {
  function graphWithLists(listRows) {
    async function g(path) {
      for (const [listId, rows] of Object.entries(listRows)) {
        if (new RegExp('/lists/' + listId + '/items').test(path)) return { value: rows.map((f) => ({ fields: f })) };
      }
      throw new Error('unexpected path in test fake: ' + path);
    }
    async function gAll(path) { return (await g(path)).value || []; }
    return { g, gAll };
  }

  const optionalAllLists = { Calendar: 'cal', Documents: null, Vendors: 'ven', Audits: 'aud', Incidents: 'inc' };
  const ctx = () => ({ log: Object.assign(() => {}, { error: () => {} }) });

  test('an empty tenant scores every register check manual, never fail', async () => {
    const { g, gAll } = graphWithLists({ cal: [], ven: [], aud: [], inc: [] });
    const results = {}, notes = {};
    await monitor.runRegisterChecks(g, gAll, ctx(), 'site', optionalAllLists, {}, results, notes, TODAY);
    assert.equal(results.backup, 'manual');
    assert.equal(results.bcp, 'manual');
    assert.equal(results.supplier, 'manual');
    assert.equal(results.policy, 'manual');
    assert.equal(results['audit-review'], 'manual');
    assert.equal(results['incident-lessons'], 'manual');
  });

  test('a populated, healthy tenant passes every register check', async () => {
    const { g, gAll } = graphWithLists({
      cal: [{ Category: 'Backup restore test', Status: 'Active', NextDue: FUTURE, LastCompleted: PAST }],
      ven: [{ Criticality: 'Critical', LastReviewed: PAST, NextReviewDue: FUTURE }],
      aud: [{ Status: 'Completed', CompletedDate: PAST }],
      inc: [{ Status: 'Closed', Severity: 'High', RootCause: 'Phishing', LessonsLearned: 'Rolled out phishing-resistant MFA' }]
    });
    const results = {}, notes = {};
    await monitor.runRegisterChecks(g, gAll, ctx(), 'site', optionalAllLists, {}, results, notes, TODAY);
    assert.equal(results.backup, 'pass');
    assert.equal(results.supplier, 'pass');
    assert.equal(results['audit-review'], 'pass');
    assert.equal(results['incident-lessons'], 'pass');
  });

  test('an overdue backup restore test fails, not reviews', async () => {
    const { g, gAll } = graphWithLists({
      cal: [{ Category: 'Backup restore test', Status: 'Active', NextDue: PAST, LastCompleted: PAST }],
      ven: [], aud: [], inc: []
    });
    const results = {}, notes = {};
    await monitor.runRegisterChecks(g, gAll, ctx(), 'site', optionalAllLists, {}, results, notes, TODAY);
    assert.equal(results.backup, 'fail');
  });

  test('an unresolved list (no Calendar/Vendors/Audits/Incidents) degrades every register check to manual, not a throw', async () => {
    const { g, gAll } = graphWithLists({});
    const results = {}, notes = {};
    await assert.doesNotReject(() =>
      monitor.runRegisterChecks(g, gAll, ctx(), 'site', { Calendar: null, Documents: null, Vendors: null, Audits: null, Incidents: null }, {}, results, notes, TODAY)
    );
    assert.equal(results.backup, 'manual');
    assert.equal(results.supplier, 'manual');
    assert.equal(results['audit-review'], 'manual');
    assert.equal(results['incident-lessons'], 'manual');
  });
});

describe('SCORED_CHECK_IDS / CHECK_LABELS', () => {
  test('the pinned check count reflects every batch added so far', () => {
    // 19 original + 16 no-new-permission (five CA-mining checks,
    // oauth-consent, leaver, sod, device-checkin, device-config, and six
    // register-derived checks) + 3 needing a new application permission
    // (xdr-incidents, privacy-srr, lifecycle-workflows). 'retention' is
    // deliberately NOT here and never will be — RecordsManagement.Read.All
    // has no Application permission type at all in Entra ID, a Microsoft
    // platform limitation rather than a scoping choice. Deliberately
    // pinned, same reasoning as store.js's CHECK_DEFS.length test —
    // adding a check id here should be a visible, deliberate diff, not
    // something that silently drifts out of sync with what the browser
    // app scores.
    assert.equal(monitor.SCORED_CHECK_IDS.length, 38);
    assert.ok(monitor.SCORED_CHECK_IDS.indexOf('retention') === -1, 'retention can never be scored unattended');
  });

  test('every scored check id has a drift-alert label', () => {
    monitor.SCORED_CHECK_IDS.forEach((id) => {
      assert.ok(monitor.CHECK_LABELS[id], 'missing CHECK_LABELS entry for ' + id);
    });
  });

  test('no duplicate ids', () => {
    assert.equal(new Set(monitor.SCORED_CHECK_IDS).size, monitor.SCORED_CHECK_IDS.length);
  });
});
