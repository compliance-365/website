// Microsoft Teams notifications from the scheduled monitor
// (azure/PostureMonitor). Office 365 Connectors (classic Incoming
// Webhooks) were retired from Teams in May 2026, so posts go to a Teams
// Workflows webhook as an Adaptive Card in a message envelope. These
// pin the payload shape, where the URL comes from, and the digest and
// connection-status behaviour, with fetch stubbed.
import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const M = require('../public/checkpoint/azure/PostureMonitor/index.js').__test;
const context = { log: Object.assign(() => {}, { error: () => {} }) };
const HOOK = 'https://prod-01.australiasoutheast.logic.azure.com/workflows/abc/triggers/manual/paths/invoke?sig=xyz';

let posts, realFetch, status;
beforeEach(() => {
  posts = []; status = 200;
  realFetch = globalThis.fetch;
  globalThis.fetch = async (url, opts) => { posts.push({ url, body: JSON.parse(opts.body) }); return { ok: status < 300, status }; };
  delete process.env.TEAMS_WEBHOOK_URL;
  delete process.env.NOTIFY_FROM;
});
afterEach(() => { globalThis.fetch = realFetch; M.configureTeams({}); });

function fakeSettingsGraph() {
  const set = {};
  async function g(path, opts) {
    if (/\/lists\/settings\/items\?/.test(path)) return { value: Object.keys(set).map((k, i) => ({ id: String(i), fields: { SettingKey: k, SettingValue: set[k] } })) };
    if (/\/lists\/settings\/items\/\d+\/fields$/.test(path)) { const k = Object.keys(set)[Number(path.match(/items\/(\d+)/)[1])]; set[k] = opts.body.SettingValue; return {}; }
    if (/\/lists\/settings\/items$/.test(path)) { set[opts.body.fields.SettingKey] = opts.body.fields.SettingValue; return {}; }
    throw new Error('unexpected ' + path);
  }
  return { g, set };
}
const lists = { Settings: 'settings' };

describe('buildTeamsCard()', () => {
  test('is an Adaptive Card in the message envelope Workflows webhooks accept', () => {
    const card = M.buildTeamsCard('Title', { text: 'Body', facts: [['A', 1]] });
    assert.equal(card.type, 'message');
    assert.equal(card.attachments[0].contentType, 'application/vnd.microsoft.card.adaptive');
    const c = card.attachments[0].content;
    assert.equal(c.type, 'AdaptiveCard');
    assert.equal(c.body[0].text, 'Title');
    assert.deepEqual(c.body.find((b) => b.type === 'FactSet').facts, [{ title: 'A', value: '1' }]);
    assert.equal(c.actions[0].type, 'Action.OpenUrl');
  });
});

describe('configureTeams()', () => {
  test('uses the Checkpoint setting, and the app setting wins over it', () => {
    assert.equal(M.configureTeams({ teamsWebhookUrl: HOOK }).url, HOOK);
    process.env.TEAMS_WEBHOOK_URL = 'https://override.example/hook';
    assert.equal(M.configureTeams({ teamsWebhookUrl: HOOK }).url, 'https://override.example/hook');
  });
  test('ignores anything that is not https', () => {
    assert.equal(M.configureTeams({ teamsWebhookUrl: 'http://insecure/hook' }).url, '');
  });
  test('alerts and digest are on unless set to false', () => {
    const t = M.configureTeams({ teamsWebhookUrl: HOOK, teamsDigest: 'false' });
    assert.equal(t.alerts, true);
    assert.equal(t.digest, false);
  });
});

describe('alerts to Teams', () => {
  test('an alert posts a card when alerts are on', async () => {
    M.configureTeams({ teamsWebhookUrl: HOOK });
    assert.equal(await M.notifyTeams(context, 'Checkpoint: 2 items', '<p>x</p><ul><li><b>A</b></li></ul>'), true);
    assert.equal(posts.length, 1);
    assert.equal(posts[0].url, HOOK);
    assert.equal(posts[0].body.attachments[0].content.body[0].text, 'Checkpoint: 2 items');
  });
  test('nothing posts when alerts are switched off', async () => {
    M.configureTeams({ teamsWebhookUrl: HOOK, teamsAlerts: 'false' });
    assert.equal(await M.notifyTeams(context, 's', '<p>x</p>'), false);
    assert.equal(posts.length, 0);
  });
});

describe('the digest', () => {
  const digest = { score: 72, prevScore: 70, overdueActions: [{ ref: 'ACT-1', title: 'Patch', days: 3, owner: 'K' }], dueSoonActions: [], openAlerts: [], staleControls: 2, awaitingApproval: ['ISMS Scope Document (owner ISMS manager)'] };

  test('is due with a Teams channel even when there are no email recipients', () => {
    const s = { digestEnabled: 'true', digestRecipients: '' };
    assert.equal(M.digestDue(s, '2026-09-24', false), false);
    assert.equal(M.digestDue(s, '2026-09-24', true), true);
  });

  test('posts to Teams without NOTIFY_FROM and stamps digestLastSent', async () => {
    M.configureTeams({ teamsWebhookUrl: HOOK });
    const { g, set } = fakeSettingsGraph();
    assert.equal(await M.sendDigest(g, context, 'site', lists, { digestRecipients: '' }, digest, '2026-09-24'), true);
    assert.equal(posts.length, 1);
    const text = JSON.stringify(posts[0].body);
    assert.match(text, /Awaiting approval/);
    assert.match(text, /ISMS Scope Document/);
    assert.equal(set.digestLastSent, '2026-09-24');
  });

  test('a failed Teams post with no email path is not stamped as sent', async () => {
    M.configureTeams({ teamsWebhookUrl: HOOK });
    status = 404;
    const { g, set } = fakeSettingsGraph();
    assert.equal(await M.sendDigest(g, context, 'site', lists, {}, digest, '2026-09-24'), false);
    assert.equal(set.digestLastSent, undefined);
  });

  test('the email digest lists documents waiting for approval', () => {
    assert.match(M.buildDigestHtml(digest, '2026-09-24'), /Documents waiting for approval \(1\)/);
  });
});

describe('connection status written back for Checkpoint Settings', () => {
  test('announces once per webhook URL, recording a fingerprint rather than the URL', async () => {
    M.configureTeams({ teamsWebhookUrl: HOOK });
    const { g, set } = fakeSettingsGraph();
    await M.announceTeamsConnection(g, context, 'site', lists, {}, '2026-09-24');
    assert.equal(posts.length, 1);
    assert.match(JSON.stringify(posts[0].body), /Checkpoint is connected/);
    assert.equal(set.teamsConnectedAt, '2026-09-24');
    assert.equal(set.teamsConnectedUrl, M.teamsUrlFingerprint(HOOK));
    assert.ok(!Object.values(set).includes(HOOK), 'the webhook URL itself is never written back');
    await M.announceTeamsConnection(g, context, 'site', lists, { teamsConnectedUrl: M.teamsUrlFingerprint(HOOK) }, '2026-09-25');
    assert.equal(posts.length, 1, 'no second announcement for the same URL');
  });

  test('a failed post records teamsLastError; a later success clears it', async () => {
    M.configureTeams({ teamsWebhookUrl: HOOK });
    const { g, set } = fakeSettingsGraph();
    status = 410;
    await M.notifyTeams(context, 's', '<p>x</p>');
    await M.recordTeamsStatus(g, context, 'site', lists, {});
    assert.match(set.teamsLastError, /410/);
    status = 200;
    await M.notifyTeams(context, 's', '<p>x</p>');
    await M.recordTeamsStatus(g, context, 'site', lists, { teamsLastError: set.teamsLastError });
    assert.equal(set.teamsLastError, '');
  });
});
