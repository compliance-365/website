// The monthly security review on what matters: actions, risks, incidents
// and posture; nothing-to-report items in one line; a traffic-light
// pre-read; and a nudge to decision owners a week later.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Lib = require('../public/checkpoint/lib.js');
const setup = { chair: 'Ekin', owner: 'Cem', week: 2, weekday: 2, time: '10:00' };
const quietPack = Lib.buildSecurityReviewPack({ today: '2026-10-08', since: '2026-09-08', scans: [{ date: '2026-09-01', score: 70 }, { date: '2026-10-01', score: 70 }], certified: true });

describe('a quiet month', () => {
  test('items with nothing new are one line, not time', () => {
    const a = Lib.securityReviewAgenda(setup, 2, quietPack);
    assert.deepEqual(a.items.map((i) => i.key), ['decisions']);
    assert.deepEqual(a.quiet, ['No actions overdue or due soon', 'No new or changed risks, none above appetite', 'No incidents since 8 Sep 2026', 'Posture score unchanged at 70/100', 'No leavers, retired assets or supplier changes']);
    assert.ok(a.minutes <= 10, 'a quiet month is a short meeting');
  });
  test('certification progress drops out once certified, and before then only when there is something', () => {
    const before = Lib.buildSecurityReviewPack({ today: '2026-10-08', readiness: 80, docs: [{ status: 'Draft' }] });
    assert.ok(Lib.securityReviewAgenda(setup, 2, before).items.some((i) => i.key === 'certification'));
    assert.ok(!Lib.securityReviewAgenda(setup, 2, quietPack).items.some((i) => i.key === 'certification'));
  });
  test('the kick-off keeps every item: there is no baseline to be quiet against', () => {
    assert.ok(Lib.securityReviewAgenda(setup, 1, quietPack).items.some((i) => i.key === 'incidents'));
  });
});

describe('meeting length', () => {
  const busy = Lib.buildSecurityReviewPack({ today: '2026-10-08', since: '2026-09-08', scans: [{ date: '2026-09-01', score: 41 }, { date: '2026-10-01', score: 48 }],
    actions: [{ id: 'A1', title: 'x', owner: 'Cem', due: '2026-09-01', status: 'Open' }], incidents: [{ id: 'I1', title: 'y', severity: 'High', detected: '2026-09-20', status: 'Open' }],
    aboveAppetite: ['R-1'], auditLog: [{ targetType: 'Owner', action: 'Leaver hand-over', entryDateTime: '2026-09-15T00:00:00Z' }], readiness: 50, docs: [{ status: 'Draft' }] });
  test('30 by default; 45 or 60 when set; quarterly and management review meetings run longer', () => {
    assert.equal(Lib.securityReviewAgenda(setup, 2, busy).minutes, 30);
    assert.equal(Lib.securityReviewAgenda({ ...setup, length: 45 }, 2, busy).minutes, 45);
    assert.equal(Lib.securityReviewAgenda({ ...setup, length: 60 }, 2, busy).minutes, 60);
    assert.equal(Lib.securityReviewAgenda(setup, 3, busy).minutes, 45);
    assert.equal(Lib.securityReviewAgenda({ ...setup, mrEvery: 3 }, 3, busy).minutes, 60);
  });
  test('top three only, and no clause references in what people read', () => {
    const many = Lib.buildSecurityReviewPack({ today: '2026-10-08', actions: [1, 2, 3, 4, 5].map((n) => ({ id: 'A' + n, title: 't', due: '2026-01-0' + n, status: 'Open' })) });
    const a = Lib.securityReviewAgenda(setup, 2, many);
    assert.equal(a.items[0].facts.filter((f) => /^A\d/.test(f)).length, 3);
    assert.match(a.items[0].facts[0], /5 actions overdue, the three oldest:/);
    const h = Lib.securityReviewEmailHtml(a, { org: 'MineGuard', date: '13 Oct' }, Lib.securityReviewStatus(many));
    assert.ok(!/9\.3\.2|10\.1|A\.5\.\d/.test(h));
    assert.match(a.evidences, /Clause 9\.1/);
  });
});

describe('at a glance', () => {
  test('red, amber and green by area, with a one-line headline', () => {
    const p = Lib.buildSecurityReviewPack({ today: '2026-10-08', since: '2026-09-08',
      scans: [{ date: '2026-09-01', score: 60 }, { date: '2026-10-01', score: 52 }],
      actions: [1, 2, 3].map((n) => ({ id: 'A' + n, title: 't', owner: 'Cem', due: '2026-09-0' + n, status: 'Open' })),
      incidents: [{ id: 'I1', title: 'Phish', severity: 'High', detected: '2026-09-20', status: 'Open' }],
      aboveAppetite: ['R-1'], readiness: 90 });
    const st = Object.fromEntries(Lib.securityReviewStatus(p).map((x) => [x.key, x]));
    assert.deepEqual([st.actions.rag, st.risks.rag, st.incidents.rag, st.posture.rag, st.certification.rag], ['red', 'amber', 'red', 'red', 'green']);
    assert.equal(st.actions.headline, '3 overdue, oldest A1 (Cem)');
    assert.equal(st.incidents.headline, '1 since last meeting, 1 serious and open');
    assert.equal(st.posture.headline, '52/100, down 8');
    assert.deepEqual(Lib.securityReviewStatus(quietPack).map((x) => x.rag), ['green', 'green', 'green', 'green']);
  });
  test('the pre-read leads the email', () => {
    const a = Lib.securityReviewAgenda(setup, 2, quietPack);
    const h = Lib.securityReviewEmailHtml(a, { org: 'MineGuard', date: '13 Oct' }, Lib.securityReviewStatus(quietPack));
    assert.match(h, /At a glance[\s\S]*On track[\s\S]*Agenda[\s\S]*Nothing to report:/);
  });
});

describe('follow-ups a week later', () => {
  const reviews = [{ id: 'SR-002', n: 2, date: '2026-10-13', status: 'Held', actions: ['A1', 'A2', 'A3', 'A4'] }];
  const actions = [
    { id: 'A1', title: 'Enforce MFA', owner: 'Cem', ownerEmail: 'cem@mg.example', status: 'Open', due: '2026-11-30' },
    { id: 'A2', title: 'Rotate keys', owner: 'Cem', status: 'Open' },
    { id: 'A3', title: 'Started', owner: 'Ekin', status: 'In progress' },
    { id: 'A4', title: 'Done', owner: 'Ekin', status: 'Done' }
  ];
  test('only after a week, only actions still Open, grouped by owner, once', () => {
    assert.equal(Lib.securityReviewFollowUps(reviews, actions, '2026-10-19'), null);
    const fu = Lib.securityReviewFollowUps(reviews, actions, '2026-10-20');
    assert.deepEqual(fu.owners.map((o) => [o.owner, o.email, o.items.map((i) => i.id)]), [['Cem', 'cem@mg.example', ['A1', 'A2']]]);
    assert.equal(Lib.securityReviewFollowUps([{ ...reviews[0], followUpSent: '2026-10-20' }], actions, '2026-10-27'), null);
  });
  test('the nudge is short and escaped', () => {
    const h = Lib.securityReviewFollowUpHtml({ owner: '<Cem>', items: [{ id: 'A1', title: 'Enforce <b>MFA</b>', due: '2026-11-30' }] }, reviews[0], { org: 'MineGuard', appUrl: 'https://x' });
    assert.ok(h.includes('&lt;Cem&gt;') && h.includes('Enforce &lt;b&gt;MFA&lt;/b&gt;') && /due 30 Nov 2026/.test(h));
  });
  test('the scheduled function sends them and stamps the meeting', async () => {
    const { runSecurityReview } = require('../public/checkpoint/azure/PostureMonitor/index.js').__test;
    process.env.NOTIFY_FROM = 'checkpoint@mg.example';
    const calls = [];
    const g = async (path, opts) => { calls.push({ path, opts }); if (/\/lists\/settings\/items\?/.test(path)) return { value: [{ id: '7', fields: { SettingKey: 'securityReviews' } }] }; return {}; };
    const rows = { acts: actions.map((a) => ({ RefId: a.id, Title: a.title, Owner: a.owner, OwnerEmail: a.ownerEmail || '', Status: a.status, DueDate: a.due || '' })) };
    const gAll = async (path) => { const m = /lists\/([^/]+)\/items/.exec(path); return m ? (rows[m[1]] || []).map((fields) => ({ fields })) : []; };
    const ctx = { log: Object.assign(() => {}, { error: () => {} }) };
    const settings = { clientDisplayName: 'MineGuard', securityReviewSetup: JSON.stringify({ ...setup, emails: 'e@mg.example', ownerEmail: 'cem@mg.example', autoSend: 'false' }), securityReviews: JSON.stringify(reviews) };
    const done = await runSecurityReview(g, gAll, ctx, 'site', { Settings: 'settings' }, { Actions: 'acts' }, settings, '2026-10-20', 60, { failingTop: [] });
    assert.deepEqual(done, ['follow-ups SR-002 (1)']);
    const mail = calls.find((c) => /sendMail/.test(c.path));
    assert.equal(mail.opts.body.message.toRecipients[0].emailAddress.address, 'cem@mg.example');
    assert.match(mail.opts.body.message.subject, /Your actions from the leadership security meeting on 13 Oct 2026/);
    const saved = JSON.parse(calls.find((c) => c.opts && c.opts.method === 'PATCH').opts.body.SettingValue);
    assert.equal(saved[0].followUpSent, '2026-10-20');
  });
});
