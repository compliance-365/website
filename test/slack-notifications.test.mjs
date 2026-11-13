// Slack notifications from the scheduled monitor (1.192.0): the same
// alerts and digest as Teams, posted through a Slack incoming webhook.
// These pin the URL rule (hooks.slack.com/services/ only, so a setting
// cannot point the monitor at another address), the Block Kit payload
// and Slack's size limits, mrkdwn escaping, and that the digest reaches
// Slack and stamps digestLastSent like Teams does. fetch is stubbed.
import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const M = require('../public/checkpoint/azure/PostureMonitor/index.js').__test;
const L = require('../public/checkpoint/lib.js');
const context = { log: Object.assign(() => {}, { error: () => {} }) };
const HOOK = 'https://hooks.slack.com/services/T0001/B0002/abcdefXYZ123';

let posts, realFetch, status, body;
beforeEach(() => {
  posts = []; status = 200; body = 'ok';
  realFetch = globalThis.fetch;
  globalThis.fetch = async (url, opts) => { posts.push({ url, body: JSON.parse(opts.body) }); return { ok: status < 300, status, text: async () => body }; };
  delete process.env.SLACK_WEBHOOK_URL;
  delete process.env.TEAMS_WEBHOOK_URL;
  delete process.env.NOTIFY_FROM;
});
afterEach(() => { globalThis.fetch = realFetch; M.configureSlack({}); M.configureTeams({}); });

describe('which webhook URLs are accepted', () => {
  test('only https://hooks.slack.com/services/..., in the monitor and in the app alike', () => {
    const good = [HOOK];
    const bad = ['http://hooks.slack.com/services/T/B/x', 'https://hooks.slack.com.evil.example/services/x', 'https://evil.example/hooks.slack.com/services/x',
      'https://hooks.slack.com/triggers/T/1/x', 'https://hooks.slack.com/services/T/B/x?redirect=1', 'https://user@hooks.slack.com/services/T/B/x', '', 'not a url'];
    for (const u of good) { assert.equal(M.slackWebhookOk(u), true, u); assert.equal(L.slackWebhookOk(u), true, u); }
    for (const u of bad) { assert.equal(M.slackWebhookOk(u), false, u); assert.equal(L.slackWebhookOk(u), false, u); }
  });
  test('the app setting wins over the Checkpoint setting, and a bad URL configures nothing', () => {
    assert.equal(M.configureSlack({ slackWebhookUrl: HOOK }).url, HOOK);
    process.env.SLACK_WEBHOOK_URL = 'https://hooks.slack.com/services/T9/B9/override';
    assert.equal(M.configureSlack({ slackWebhookUrl: HOOK }).url, 'https://hooks.slack.com/services/T9/B9/override');
    delete process.env.SLACK_WEBHOOK_URL;
    assert.equal(M.configureSlack({ slackWebhookUrl: 'https://evil.example/collect' }).url, '');
  });
});

describe('buildSlackMessage()', () => {
  test('is Block Kit with a fallback text, facts as fields and an Open Checkpoint button', () => {
    const m = M.buildSlackMessage('Title', { subtitle: 'Sub', facts: [['A', 1]], text: 'Body', sections: [{ heading: 'H', lines: ['one'] }] });
    assert.equal(m.text, 'Title');
    assert.deepEqual(m.blocks.map((b) => b.type), ['header', 'context', 'section', 'section', 'section', 'actions']);
    assert.equal(m.blocks[2].fields[0].text, '*A*\n1');
    assert.equal(m.blocks[5].elements[0].text.text, 'Open Checkpoint');
  });
  test('keeps to Slack\'s limits', () => {
    const m = M.buildSlackMessage('x'.repeat(400), { facts: Array.from({ length: 14 }, (_, i) => ['k' + i, 'v']), text: 'y'.repeat(5000) });
    assert.ok(m.blocks[0].text.text.length <= 150);
    assert.equal(m.blocks[1].fields.length, 10);
    assert.ok(m.blocks[2].text.text.length <= 3000);
  });
  test('escapes &, < and >, and turns the cards\' markdown into Slack mrkdwn', () => {
    assert.equal(M.slackText('<b> & **bold** [ACT-1](https://x.example/?a=1&b=2)'), '&lt;b&gt; &amp; *bold* <https://x.example/?a=1&amp;b=2|ACT-1>');
    assert.equal(M.slackText('[a|b](https://x.example)'), '<https://x.example|a/b>');
  });
});

describe('delivery', () => {
  test('an alert is posted when alerts are on, and not when they are off', async () => {
    M.configureSlack({ slackWebhookUrl: HOOK });
    assert.equal(await M.notifySlack(context, 'Drift', '<p>MFA <b>failed</b></p>'), true);
    assert.equal(posts[0].url, HOOK);
    assert.match(posts[0].body.blocks[1].text.text, /MFA \*failed\*/);
    M.configureSlack({ slackWebhookUrl: HOOK, slackAlerts: 'false' });
    assert.equal(await M.notifySlack(context, 'Drift', '<p>x</p>'), false);
    assert.equal(posts.length, 1);
  });

  test('the digest goes to Slack alone and stamps digestLastSent', async () => {
    M.configureSlack({ slackWebhookUrl: HOOK });
    const set = {};
    const g = async (path, opts) => {
      if (/\/items\?/.test(path)) return { value: [] };
      if (/\/items$/.test(path)) { set[opts.body.fields.SettingKey] = opts.body.fields.SettingValue; return {}; }
      throw new Error('unexpected ' + path);
    };
    const data = { score: 70, prevScore: 65, overdueActions: [{ ref: 'ACT-1', title: 'Fix [it]', days: 3, owner: 'K. Patel' }], dueSoonActions: [], openAlerts: [], awaitingApproval: ['Access policy'], staleControls: 2 };
    const ok = await M.sendDigest(g, context, 'site', { Settings: 'settings' }, { digestEnabled: 'true' }, data, '2026-11-13');
    assert.equal(ok, true);
    assert.equal(set.digestLastSent, '2026-11-13');
    const msg = posts[0].body;
    assert.match(msg.blocks[0].text.text, /Checkpoint compliance digest/);
    assert.ok(msg.blocks.some((b) => b.type === 'section' && /<https:[^|]+view=actions&amp;item=ACT-1\|\*ACT-1\*>/.test((b.text || {}).text || '')), 'the overdue action links to itself');
    assert.equal(msg.blocks.at(-1).elements.length, 3, 'Open actions, Approve documents, Open Checkpoint');
  });

  test('digestDue() counts a Slack channel as somewhere to send', () => {
    assert.equal(M.digestDue({ digestEnabled: 'true' }, '2026-11-13', false), false);
    assert.equal(M.digestDue({ digestEnabled: 'true' }, '2026-11-13', true), true);
  });

  test('a failed post records slackLastError with Slack\'s reason; a later success clears it', async () => {
    M.configureSlack({ slackWebhookUrl: HOOK });
    const set = {};
    const g = async (path, opts) => {
      if (/\/items\?/.test(path)) return { value: Object.keys(set).map((k, i) => ({ id: String(i), fields: { SettingKey: k, SettingValue: set[k] } })) };
      if (/\/items\/\d+\/fields$/.test(path)) { set[Object.keys(set)[Number(path.match(/items\/(\d+)/)[1])]] = opts.body.SettingValue; return {}; }
      if (/\/items$/.test(path)) { set[opts.body.fields.SettingKey] = opts.body.fields.SettingValue; return {}; }
      throw new Error('unexpected ' + path);
    };
    status = 404; body = 'no_service';
    await M.notifySlack(context, 'x', '<p>y</p>');
    await M.recordSlackStatus(g, context, 'site', { Settings: 'settings' }, {});
    assert.match(set.slackLastError, /404 \(no_service\)/);
    status = 200; body = 'ok';
    await M.notifySlack(context, 'x', '<p>y</p>');
    await M.recordSlackStatus(g, context, 'site', { Settings: 'settings' }, { slackLastError: set.slackLastError });
    assert.equal(set.slackLastError, '');
  });

  test('the first run with a new webhook posts a confirmation and records it once', async () => {
    M.configureSlack({ slackWebhookUrl: HOOK });
    const set = {};
    const g = async (path, opts) => {
      if (/\/items\?/.test(path)) return { value: [] };
      if (/\/items$/.test(path)) { set[opts.body.fields.SettingKey] = opts.body.fields.SettingValue; return {}; }
      throw new Error('unexpected ' + path);
    };
    await M.announceSlackConnection(g, context, 'site', { Settings: 'settings' }, {}, '2026-11-13');
    assert.equal(posts.length, 1);
    assert.match(posts[0].body.text, /connected to this channel/);
    assert.equal(set.slackConnectedAt, '2026-11-13');
    assert.notEqual(set.slackConnectedUrl, HOOK, 'a hash, never the URL');
    await M.announceSlackConnection(g, context, 'site', { Settings: 'settings' }, { slackConnectedUrl: set.slackConnectedUrl }, '2026-11-14');
    assert.equal(posts.length, 1);
  });
});

test('backups leave the Slack webhook out, like every other secret setting', () => {
  const files = L.buildBackupFiles({ created: '2026-11-13', source: 'manual', client: 'Acme', appVersion: '1.192.0', registers: {}, settings: { clientDisplayName: 'Acme', slackWebhookUrl: HOOK }, evidence: [], csvs: [] });
  assert.deepEqual(Object.keys(JSON.parse(files[1].content).settings), ['clientDisplayName']);
});
