// 1.117.0: objectives tied to confidentiality, integrity and availability
// and stated in the policy; weekly owner reminders (browser and the
// scheduled monitor, which must build identical lists); evidence requests
// to control owners; the run-up to each certification body audit on the
// calendar; and the dated onboarding plan.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const L = require('../public/checkpoint/lib.js');
const A = require('../public/checkpoint/azure/lib/ownerDigest.js');
const monitor = require('../public/checkpoint/azure/PostureMonitor/index.js').__test;
const app = readFileSync(new URL('../public/checkpoint/app.js', import.meta.url), 'utf8');
const templates = readFileSync(new URL('../public/checkpoint/templates.js', import.meta.url), 'utf8');
const today = '2026-10-05';

describe('objectives and C, I, A', () => {
  test('every suggested objective says what it protects', () => {
    L.SUGGESTED_OBJECTIVES.forEach((o) => {
      assert.ok(o.cia.length && o.cia.every((x) => ['C', 'I', 'A'].includes(x)), o.key);
      assert.ok(Array.isArray(o.risks), o.key);
    });
    const covered = new Set(L.SUGGESTED_OBJECTIVES.filter((o) => o.fws.includes('iso27001')).flatMap((o) => o.cia));
    assert.deepEqual([...covered].sort(), ['A', 'C', 'I']);
  });
  test('objectives aimed at an open risk come first and say which', () => {
    const s = L.suggestedObjectives(['iso27001'], [], [{ id: 'R-7', tpl: 'ctx-backup', title: 'Backups cannot be restored', status: 'Open' }]);
    assert.equal(s[0].key, 'obj-restore');
    assert.match(s[0].why, /R-7/);
    assert.equal(L.suggestedObjectives(['iso27001'], [], [{ id: 'R-7', tpl: 'ctx-backup', status: 'Closed' }])[0].why, undefined);
  });
  test('restore tests and MFA are measured', () => {
    const cal = [{ title: 'Backup restore test', category: 'Backup restore test', status: 'Active', lastCompleted: '2026-08-01', nextDue: '2027-02-01' }];
    assert.equal(L.measureObjective({ metric: 'Backup restore tests completed successfully on schedule' }, { calendar: cal }, today).met, true);
    cal[0].nextDue = '2026-09-01';
    assert.equal(L.measureObjective({ metric: 'Backup restore tests completed successfully on schedule' }, { calendar: cal }, today).met, false);
    assert.equal(L.measureObjective({ metric: 'Accounts protected by multi-factor authentication' }, { lastResults: { 'mfa-all': 'pass', 'mfa-registration': 'fail' } }, today).value, 50);
  });
  test('the policy states the aim and lists the current objectives', () => {
    assert.match(templates, /protect the confidentiality, integrity and availability of the organisation’s information by identifying, analysing, evaluating and treating the risks/);
    assert.ok(templates.includes('{{register:objectives}}'));
    assert.ok(app.includes("'{{register:objectives}}'"));
    const st = L.objectivesStatement([{ title: 'We can recover our information when we need to', metric: 'Backup restore tests completed successfully on schedule', target: 'Every test', due: '2027-06-30', owner: 'IT Manager', status: 'On track' }, { title: 'Old', status: 'Achieved' }]);
    assert.match(st, /We can recover.*by 2027-06-30.*owned by IT Manager \[A, I\]/);
    assert.ok(!/Old/.test(st));
    assert.match(L.objectivesStatement([]), /objectives register/);
  });
});

describe('owner reminders', () => {
  const data = {
    actions: [
      { id: 'ACT-1', title: 'Enable MFA', owner: 'Ekin Eraydin', ownerEmail: 'ekin@mineguard.com', due: '2026-09-30', status: 'Open' },
      { id: 'ACT-2', title: 'Later', owner: 'Ekin Eraydin', due: '2027-01-01', status: 'Open' },
      { id: 'ACT-3', title: 'Done', owner: 'Cem', due: '2026-09-01', status: 'Done' },
      { id: 'ACT-4', title: 'Nobody', owner: 'Unassigned', due: '2026-09-01', status: 'Open' }
    ],
    calendar: [{ id: 'CAL-1', title: 'Access review', owner: 'cem caglar', nextDue: '2026-10-12', status: 'Active' }, { id: 'CAL-2', title: 'Retired', owner: 'Cem Caglar', nextDue: '2026-10-06', status: 'Retired' }],
    docs: [{ name: 'Access Control Policy.html', owner: 'Cem Caglar', nextReview: '2026-10-30', status: 'Approved' }, { name: 'Draft.html', owner: 'Cem Caglar', nextReview: '2026-10-01', status: 'Draft' }],
    objectives: [{ id: 'OBJ-1', title: 'Posture', owner: 'Ekin Eraydin', status: 'At risk' }, { id: 'OBJ-2', title: 'Fine', owner: 'Ekin Eraydin', status: 'On track' }],
    evidence: [{ control: 'A.5.18', title: 'Access rights', owner: 'Cem Caglar', email: 'cem@mineguard.com', requested: '2026-10-01' }]
  };
  test('each owner gets only what is theirs and due, overdue first', () => {
    const list = L.ownerWorkItems(data, today);
    assert.deepEqual(list.map((o) => o.owner.toLowerCase()), ['ekin eraydin', 'cem caglar'], 'one entry per person however their name is cased, overdue first');
    const ekin = list.find((o) => o.owner === 'Ekin Eraydin');
    assert.equal(ekin.email, 'ekin@mineguard.com');
    assert.deepEqual(ekin.items.map((i) => i.ref), ['ACT-1', 'OBJ-1']);
    assert.equal(ekin.items[0].overdue, true);
    const cem = list.find((o) => o.owner.toLowerCase() === 'cem caglar');
    assert.deepEqual(cem.items.map((i) => i.kind).sort(), ['Activity', 'Document review', 'Evidence requested']);
  });
  test('the scheduled monitor builds exactly the same lists and email', () => {
    assert.deepEqual(A.ownerWorkItems(data, today), L.ownerWorkItems(data, today));
    const e = L.ownerWorkItems(data, today)[0];
    assert.equal(A.ownerDigestHtml(e, 'MineGuard', 'https://x'), L.ownerDigestHtml(e, 'MineGuard', 'https://x'));
    const users = [{ displayName: 'Cem Caglar', mail: 'cem@mineguard.com' }];
    assert.deepEqual(A.matchOwnerToUser('cem caglar', users), L.matchOwnerToUser('cem caglar', users));
  });
  test('owners match the directory exactly or not at all', () => {
    const users = [{ displayName: 'Cem Caglar', mail: 'cem@x.com', userPrincipalName: 'cem@x.com' }, { displayName: 'Sam Lee', mail: 's1@x.com' }, { displayName: 'Sam Lee', mail: 's2@x.com' }];
    assert.equal(L.matchOwnerToUser('CEM@x.com', users).displayName, 'Cem Caglar');
    assert.equal(L.matchOwnerToUser('Cem', users), null);
    assert.equal(L.matchOwnerToUser('Sam Lee', users), null, 'two people with one name: never guess');
  });
  test('the email escapes what owners typed', () => {
    const html = L.ownerDigestHtml({ owner: '<b>x</b>', items: [{ kind: 'Action', ref: 'A', title: '<script>', due: '2026-10-01', overdue: true }] }, 'C', '');
    assert.ok(!html.includes('<script>') && !html.includes('<b>x</b>'));
  });
  test('the monitor sends weekly, only when switched on', () => {
    assert.equal(monitor.ownerRemindersDue({}, today), false);
    assert.equal(monitor.ownerRemindersDue({ ownerDigestEnabled: 'true' }, today), true);
    assert.equal(monitor.ownerRemindersDue({ ownerDigestEnabled: 'true', ownerDigestLastSent: '2026-10-01' }, today), false);
    assert.equal(monitor.ownerRemindersDue({ ownerDigestEnabled: 'true', ownerDigestLastSent: '2026-09-28' }, today), true);
  });
  test('the monitor stamps the date only after a send and skips unmatched owners', async () => {
    const calls = [];
    const g = async (path, opts) => { calls.push({ path, opts }); if (path.includes('/items?') && path.includes('Settings')) return { value: [] }; return { value: [] }; };
    const gAll = async (path) => {
      if (path.startsWith('/users')) return [{ displayName: 'Ekin Eraydin', mail: 'ekin@mineguard.com' }];
      if (path.includes('/lists/ACT/')) return [{ fields: { RefId: 'ACT-1', Title: 'Enable MFA', Owner: 'Ekin Eraydin', DueDate: '2026-09-30', Status: 'Open' } }, { fields: { RefId: 'ACT-2', Title: 'x', Owner: 'Ghost', DueDate: '2026-09-30', Status: 'Open' } }];
      return [];
    };
    process.env.NOTIFY_FROM = 'isms@mineguard.com';
    const ctx = { log: Object.assign(() => {}, { error: () => {} }) };
    const sent = await monitor.sendOwnerReminders(g, gAll, ctx, 'SITE', { Settings: 'SET' }, { Actions: 'ACT' }, {}, today);
    delete process.env.NOTIFY_FROM;
    assert.equal(sent, 1);
    const mail = calls.find((c) => c.path.includes('/sendMail'));
    assert.equal(mail.opts.body.message.toRecipients[0].emailAddress.address, 'ekin@mineguard.com');
  });
  test('the browser offers the setting, sends on load when due, and never twice', () => {
    assert.ok(app.includes('data-action="App.toggleOwnerDigest"'));
    assert.ok(app.includes('if (!_ownerRemindersTried && ownerRemindersDue())'));
  });
});

describe('evidence requests', () => {
  test('grouped by control owner with what to provide; unowned listed', () => {
    const items = [
      { control: { fw: 'iso27001', id: 'A.5.18', t: 'Access rights', own: 'Cem Caglar' }, folderUrl: 'https://sp/ev/A.5.18' },
      { control: { fw: 'iso27001', id: 'A.8.13', t: 'Backup', own: 'cem caglar' } },
      { control: { fw: 'iso27001', id: 'A.5.9', t: 'Inventory', own: '' } }
    ];
    const r = L.evidenceRequestsByOwner(items, { 'A.5.18': { evidence: 'Quarterly access review sign-off' } });
    assert.equal(r.byOwner.length, 1);
    assert.deepEqual(r.byOwner[0].controls.map((c) => c.id), ['A.5.18', 'A.8.13']);
    assert.equal(r.byOwner[0].controls[0].evidence, 'Quarterly access review sign-off');
    assert.ok(r.byOwner[0].controls[1].evidence.length > 10, 'a default when no guidance exists');
    assert.deepEqual(r.unowned, ['A.5.9']);
    const html = L.evidenceRequestHtml(r.byOwner[0], 'MineGuard', 'https://app');
    assert.ok(html.includes('https://sp/ev/A.5.18') && html.includes('Quarterly access review sign-off'));
  });
  test('requests are offered from the Annex A plan and feed the owner reminders', () => {
    assert.ok(app.includes('data-action="App.requestAnnexEvidence"'));
    assert.ok(/evidence: evidence,/.test(app));
  });
});

describe('certification cycle run-up', () => {
  test('confirm dates, management review and preparation count back from the next audit', () => {
    const steps = L.certificationPrepSteps({ fw: 'iso27001', issued: '2026-03-01', body: 'BSI' }, today, 'ISO 27001');
    assert.deepEqual(steps.map((s) => s.nextDue), ['2026-12-01', '2027-01-15', '2027-02-15']);
    assert.match(steps[0].title, /BSI/);
    assert.equal(steps[1].category, 'Management review');
    assert.equal(new Set(steps.map((s) => s.marker)).size, 3);
  });
  test('a step whose date has passed is due now, and nothing without a certificate', () => {
    const late = L.certificationPrepSteps({ fw: 'iso27001', issued: '2025-11-01' }, today, 'ISO 27001');
    assert.equal(late[0].nextDue, today);
    assert.deepEqual(L.certificationPrepSteps({}, today), []);
  });
  test('recording the certificate puts them on the calendar and offers the audit programme', () => {
    assert.ok(app.includes('certificationPrepSteps(Object.assign({ fw: fw }, cert)'));
    assert.ok(app.includes('await App.planInternalAudits(fw);'));
  });
});

describe('dated onboarding plan', () => {
  const steps = ['scope', 'scan', 'docs', 'approve', 'risks', 'soa', 'audit', 'book'].map((id) => ({ id, label: id, done: id === 'scope' }));
  test('week, due this week and behind plan', () => {
    const p = L.onboardingSchedule(steps, '2026-09-20', '2026-10-04');
    assert.equal(p.week, 3);
    assert.equal(p.weekStart, '2026-10-04');
    assert.deepEqual(p.behind.map((s) => s.id), ['scan', 'docs']);
    assert.deepEqual(p.thisWeek.map((s) => s.id), ['approve', 'risks']);
    assert.deepEqual(L.onboardingSchedule(steps, '2026-09-20', today).behind.map((s) => s.id), ['scan', 'docs', 'approve', 'risks']);
    assert.equal(p.steps[p.steps.length - 1].target, '2026-12-19');
  });
  test('every path step has a target day, set up before certify', () => {
    ['scope', 'scan', 'docs', 'approve', 'risks', 'soa', 'objectives', 'training', 'suppliers', 'rhythm', 'assets', 'legal', 'ai', 'audit', 'review', 'clauses', 'mandatory', 'book']
      .forEach((id) => assert.ok(L.ONBOARDING_DAYS[id] > 0, id));
    assert.ok(L.ONBOARDING_DAYS.soa <= 30 && L.ONBOARDING_DAYS.book <= 90);
  });
});
