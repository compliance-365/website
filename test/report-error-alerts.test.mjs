// Email alerts from lambda/report-error.js: a signed-in client's error,
// or a tenant's setup health turning failing, is emailed to
// OWNER_NOTIFY_EMAIL in plain English (who, which screen, likely cause,
// what to do); the public endpoint can't flood the inbox or inject
// markup; and an email failure never changes the response.
import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  shapeReport, shapeHealth, errorAlertDue, errorAlertEmail, healthAlertDue, healthAlertEmail,
  shouldAlert, newAlertState, explainError, screenName, browserName, localTime, clientFromLists, SCREEN_NAMES, handler
} from '../lambda/report-error.js';

const T = '11111111-2222-3333-4444-555555555555';
const report = (o) => shapeReport(Object.assign({ tenantId: T, message: 'Cannot read properties of undefined', stack: 'at a (https://x/app.js:1:2)', source: 'window.onerror', context: '{"view":"v-documents"}', appVersion: '1.158.1', userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15' }, o));
const client = { name: 'MineGuard', contactName: 'Ekin', contactEmail: 'ekin@example.com', status: 'Active', domain: 'mineguard.com.au', health: 'healthy' };

describe('when an error is emailed', () => {
  test('only signed-in client tenants; the demo and anonymous reports are not', () => {
    assert.ok(errorAlertDue(report(), 0, newAlertState()));
    assert.equal(errorAlertDue(report({ tenantId: '' }), 0, newAlertState()), false);
    assert.equal(errorAlertDue(report({ tenantId: 'not-a-guid' }), 0, newAlertState()), false);
  });
  test('the same error from the same client once per 6 hours; a different error still goes', () => {
    const s = newAlertState();
    assert.ok(errorAlertDue(report(), 0, s));
    assert.equal(errorAlertDue(report(), 3600_000, s), false);
    assert.ok(errorAlertDue(report({ message: 'Another' }), 3600_000, s));
    assert.ok(errorAlertDue(report(), 6 * 3600_000 + 1, s));
  });
  test('no more than 10 alert emails an hour', () => {
    const s = newAlertState();
    let sent = 0;
    for (let i = 0; i < 25; i++) if (shouldAlert('k' + i, 1000 + i, s)) sent++;
    assert.equal(sent, 10);
    assert.ok(shouldAlert('later', 3600_000 + 2000, s), 'the cap resets after an hour');
  });
});

describe('what the error email says', () => {
  test('names the client, screen, browser and local time, with a likely cause and next step', () => {
    const m = errorAlertEmail(report(), client);
    assert.match(m.subject, /^MineGuard hit an error in Checkpoint \(Documents\): Cannot read/);
    assert.match(m.html, /MineGuard hit an error on Documents/);
    assert.match(m.html, /Probably a bug in Checkpoint/);
    assert.match(m.html, /Safari on macOS/);
    assert.match(m.html, /Brisbane time/);
    assert.match(m.html, /Ekin &lt;<a href="mailto:ekin@example\.com">/);
    assert.match(m.html, /mineguard\.com\.au/);
    assert.match(m.html, /app\.js:1:2/, 'a stack that names a file is kept');
    assert.match(m.html, /compliance365\.com\.au\/owner\//);
  });
  test('falls back to "A client" and drops a meaningless stack', () => {
    const m = errorAlertEmail(report({ stack: '@' }), {});
    assert.match(m.subject, /^A client hit an error/);
    assert.match(m.html, /Not on your client list/);
    assert.ok(!/>@</.test(m.html) && !/\n\n@/.test(m.html));
  });
  test('everything the client sent is escaped', () => {
    const m = errorAlertEmail(report({ message: '<img src=x onerror=alert(1)>', context: '{"view":"<b>x</b>"}', userAgent: '<script>' }), { name: '<i>Evil</i>' });
    assert.ok(!/<img|<script|<i>Evil|<b>x/.test(m.html));
    assert.match(m.html, /&lt;img src=x/);
  });
  test('likely causes for the common failures', () => {
    assert.match(explainError('Graph 401: InvalidAuthenticationToken').likely, /sign-in expired/);
    assert.match(explainError('Graph 403: accessDenied').likely, /refused access/);
    assert.match(explainError('List not found').likely, /SharePoint was not there/);
    assert.match(explainError('429 TooManyRequests').likely, /throttling/);
    assert.match(explainError('Failed to fetch').likely, /connection dropped/);
    assert.match(explainError('x is not a function').likely, /bug in Checkpoint/);
    assert.match(explainError('something odd').likely, /Not clear/);
    assert.match(explainError('x', 'warn').seen, /Sync issue/);
  });
  test('screen names cover every Checkpoint screen in index.html', () => {
    const html = readFileSync(new URL('../public/checkpoint/index.html', import.meta.url), 'utf8');
    const ids = [...html.matchAll(/<section class="view[^"]*" id="(v-[a-z0-9-]+)"/g)].map((m) => m[1]);
    assert.ok(ids.length > 30);
    for (const id of ids) assert.ok(SCREEN_NAMES[id], `${id} has a name in SCREEN_NAMES`);
    assert.equal(screenName('{"view":"v-start"}'), 'Start here');
    assert.equal(screenName('not json'), 'unknown screen');
  });
  test('browser and time helpers', () => {
    assert.equal(browserName('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 Edg/130.0'), 'Edge on Windows');
    assert.equal(browserName(''), 'unknown browser');
    assert.match(localTime('2026-10-11T09:33:00Z', 'Australia/Brisbane'), /7:33\s?pm \(Brisbane time\)/);
  });
  test('the client is found in the owner console lists by tenant id', () => {
    const c = clientFromLists(T.toUpperCase(), [{ TenantId: T, ClientName: 'MineGuard', ContactName: 'Ekin', ContactEmail: 'e@x.com', Status: 'Active' }], [{ TenantId: T, Domains: 'mineguard.com.au,mg.com', Status: 'healthy' }]);
    assert.deepEqual([c.name, c.contactName, c.domain, c.health], ['MineGuard', 'Ekin', 'mineguard.com.au', 'healthy']);
    assert.equal(clientFromLists(T, [], []).name, '');
  });
});

describe('setup health emails', () => {
  const h = shapeHealth({ tenantId: T, status: 'failing', clientName: 'MineGuard', headline: 'Lists missing', details: ['PolicyDrafts list missing'] });
  test('sent when a tenant turns failing, with the findings and the fix buttons to use', () => {
    assert.ok(healthAlertDue(h, 'healthy', 0, newAlertState()));
    assert.ok(healthAlertDue(h, '', 0, newAlertState()), 'a first report that is already failing');
    const m = healthAlertEmail(h, 'healthy', { name: 'MineGuard' });
    assert.equal(m.subject, "MineGuard's Checkpoint setup is failing: Lists missing");
    assert.match(m.html, /it was healthy/);
    assert.match(m.html, /<li>PolicyDrafts list missing<\/li>/);
    assert.match(m.html, /Repair setup/);
  });
  test('not sent while it stays failing, or for warning', () => {
    assert.equal(healthAlertDue(h, 'failing', 0, newAlertState()), false);
    assert.equal(healthAlertDue(Object.assign({}, h, { status: 'warning' }), 'healthy', 0, newAlertState()), false);
  });
  test('the Repair setup and Grant admin consent buttons it names exist in Checkpoint', () => {
    const app = readFileSync(new URL('../public/checkpoint/app.js', import.meta.url), 'utf8');
    assert.match(app, /repairSetup: 'Repair setup'/);
    assert.match(app, /openAdminConsent: 'Grant admin consent'/);
  });
});

describe('handler with a mocked Graph', () => {
  const realFetch = global.fetch;
  afterEach(() => { global.fetch = realFetch; delete process.env.OWNER_NOTIFY_EMAIL; });
  function mockGraph({ failMail = false, healthRows = [], clients = [] } = {}) {
    const calls = [];
    global.fetch = async (url, opts = {}) => {
      calls.push({ url: String(url), method: opts.method || 'GET', body: opts.body });
      const ok = (b, status = 200) => ({ ok: true, status, json: async () => b, text: async () => JSON.stringify(b) });
      if (/oauth2/.test(url)) return ok({ access_token: 'tok', expires_in: 3600 });
      if (/\/sites\/root/.test(url)) return ok({ id: 's1' });
      if (/\/lists\?/.test(url)) return ok({ value: [{ id: 'E', displayName: 'Checkpoint Partner ErrorReports' }, { id: 'H', displayName: 'Checkpoint Partner Health' }, { id: 'C', displayName: 'Checkpoint Partner PartnerClients' }] });
      if (/\/sendMail/.test(url)) return failMail ? { ok: false, status: 403, text: async () => 'denied' } : ok(null, 202);
      if (/\/lists\/H\/items\?/.test(url)) return ok({ value: healthRows });
      if (/\/lists\/C\/items\?/.test(url)) return ok({ value: clients });
      return ok({ id: '1' }, 201);
    };
    return calls;
  }
  const ev = (body) => ({ requestContext: { http: { method: 'POST', sourceIp: 'ip-' + Math.random() } }, headers: {}, body: JSON.stringify(body) });

  test('an error report is saved and emailed as HTML naming the client from the roster', async () => {
    process.env.OWNER_NOTIFY_EMAIL = 'alerts@example.com';
    const calls = mockGraph({ clients: [{ id: '5', fields: { TenantId: T, ClientName: 'MineGuard', ContactName: 'Ekin' } }] });
    const r = await handler(ev({ tenantId: T, message: 'Handler test ' + Date.now() }));
    assert.deepEqual(JSON.parse(r.body), { ok: true });
    const mail = calls.find((c) => /sendMail/.test(c.url));
    assert.ok(mail && /users\/alerts%40example\.com\/sendMail/.test(mail.url));
    const msg = JSON.parse(mail.body).message;
    assert.equal(msg.body.contentType, 'html');
    assert.match(msg.subject, /^MineGuard hit an error/);
    assert.match(msg.body.content, /Ekin/);
  });
  test('without OWNER_NOTIFY_EMAIL nothing is emailed or looked up', async () => {
    const calls = mockGraph();
    await handler(ev({ tenantId: T, message: 'No mail ' + Date.now() }));
    assert.ok(!calls.some((c) => /sendMail|lists\/C\/items/.test(c.url)));
  });
  test('a failed email still answers ok: the report was saved', async () => {
    process.env.OWNER_NOTIFY_EMAIL = 'alerts@example.com';
    mockGraph({ failMail: true });
    const r = await handler(ev({ tenantId: T, message: 'Mail fails ' + Date.now() }));
    assert.deepEqual(JSON.parse(r.body), { ok: true });
  });
  test('a health report that turns failing is emailed, using the previous status from the list', async () => {
    process.env.OWNER_NOTIFY_EMAIL = 'alerts@example.com';
    const T2 = 'aaaaaaaa-2222-3333-4444-555555555555';
    let calls = mockGraph({ healthRows: [{ id: '9', fields: { TenantId: T2, Status: 'healthy' } }] });
    await handler(ev({ type: 'health', tenantId: T2, status: 'failing', headline: 'x' }));
    assert.ok(calls.some((c) => /sendMail/.test(c.url)));
    calls = mockGraph({ healthRows: [{ id: '9', fields: { TenantId: T2, Status: 'failing' } }] });
    await handler(ev({ type: 'health', tenantId: T2, status: 'failing', headline: 'x' }));
    assert.ok(!calls.some((c) => /sendMail/.test(c.url)), 'still failing: no second email');
  });
});
