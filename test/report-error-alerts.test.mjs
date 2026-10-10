// Email alerts from lambda/report-error.js: a signed-in client's error,
// or a tenant's setup health turning failing, is emailed to
// OWNER_NOTIFY_EMAIL; the public endpoint can't be used to flood the
// inbox; and an email failure never changes the response.
import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { shapeReport, shapeHealth, errorAlert, healthAlert, shouldAlert, newAlertState, handler } from '../lambda/report-error.js';

const T = '11111111-2222-3333-4444-555555555555';
const report = (o) => shapeReport(Object.assign({ tenantId: T, clientName: 'MineGuard', message: 'Cannot read properties of undefined', stack: 'at a\nat b', source: 'window.onerror', context: '{"view":"v-docs"}', appVersion: '1.158.1' }, o));

describe('errorAlert()', () => {
  test('a signed-in client error becomes an email naming the client, screen and error', () => {
    const m = errorAlert(report(), 0, newAlertState());
    assert.match(m.subject, /^Checkpoint error: MineGuard: Cannot read/);
    assert.match(m.text, /Tenant id: 11111111/);
    assert.match(m.text, /Screen: v-docs/);
    assert.match(m.text, /Version: 1\.158\.1/);
    assert.match(m.text, /compliance365\.com\.au\/owner\//);
  });
  test('demo and anonymous reports (no tenant GUID) are not emailed', () => {
    assert.equal(errorAlert(report({ tenantId: '' }), 0, newAlertState()), null);
    assert.equal(errorAlert(report({ tenantId: 'not-a-guid' }), 0, newAlertState()), null);
  });
  test('the same error from the same client is emailed once per 6 hours; a different error still goes', () => {
    const s = newAlertState();
    assert.ok(errorAlert(report(), 0, s));
    assert.equal(errorAlert(report(), 3600_000, s), null);
    assert.ok(errorAlert(report({ message: 'Another' }), 3600_000, s));
    assert.ok(errorAlert(report(), 6 * 3600_000 + 1, s));
  });
  test('no more than 10 alert emails an hour', () => {
    const s = newAlertState();
    let sent = 0;
    for (let i = 0; i < 25; i++) if (shouldAlert('k' + i, 1000 + i, s)) sent++;
    assert.equal(sent, 10);
    assert.ok(shouldAlert('later', 3600_000 + 2000, s), 'the cap resets after an hour');
  });
});

describe('healthAlert()', () => {
  const h = shapeHealth({ tenantId: T, status: 'failing', clientName: 'MineGuard', headline: 'Lists missing', details: ['PolicyDrafts list missing'] });
  test('emailed when a tenant turns failing, with the details', () => {
    const m = healthAlert(h, 'healthy', 0, newAlertState());
    assert.equal(m.subject, 'Checkpoint setup failing: MineGuard');
    assert.match(m.text, /was healthy/);
    assert.match(m.text, /- PolicyDrafts list missing/);
    assert.ok(healthAlert(h, '', 0, newAlertState()), 'a first report that is already failing');
  });
  test('not emailed while it stays failing, or for warning/healthy', () => {
    assert.equal(healthAlert(h, 'failing', 0, newAlertState()), null);
    assert.equal(healthAlert(Object.assign({}, h, { status: 'warning' }), 'healthy', 0, newAlertState()), null);
  });
});

describe('handler with a mocked Graph', () => {
  const realFetch = global.fetch;
  afterEach(() => { global.fetch = realFetch; delete process.env.OWNER_NOTIFY_EMAIL; });
  function mockGraph({ failMail = false, healthRows = [] } = {}) {
    const calls = [];
    global.fetch = async (url, opts = {}) => {
      calls.push({ url: String(url), method: opts.method || 'GET', body: opts.body });
      const ok = (b, status = 200) => ({ ok: true, status, json: async () => b, text: async () => JSON.stringify(b) });
      if (/oauth2/.test(url)) return ok({ access_token: 'tok', expires_in: 3600 });
      if (/\/sites\/root/.test(url)) return ok({ id: 's1' });
      if (/\/lists\?/.test(url)) return ok({ value: [{ id: 'E', displayName: 'Checkpoint Partner ErrorReports' }, { id: 'H', displayName: 'Checkpoint Partner Health' }] });
      if (/\/sendMail/.test(url)) return failMail ? { ok: false, status: 403, text: async () => 'denied' } : ok(null, 202);
      if (/\/lists\/H\/items\?/.test(url)) return ok({ value: healthRows });
      return ok({ id: '1' }, 201);
    };
    return calls;
  }
  const ev = (body) => ({ requestContext: { http: { method: 'POST', sourceIp: 'ip-' + Math.random() } }, headers: {}, body: JSON.stringify(body) });

  test('an error report is saved and emailed to OWNER_NOTIFY_EMAIL', async () => {
    process.env.OWNER_NOTIFY_EMAIL = 'alerts@example.com';
    const calls = mockGraph();
    const r = await handler(ev({ tenantId: T, message: 'Handler test ' + Date.now(), clientName: 'X' }));
    assert.deepEqual(JSON.parse(r.body), { ok: true });
    const mail = calls.find((c) => /sendMail/.test(c.url));
    assert.ok(mail && /users\/alerts%40example\.com\/sendMail/.test(mail.url));
    assert.equal(JSON.parse(mail.body).message.toRecipients[0].emailAddress.address, 'alerts@example.com');
  });
  test('without OWNER_NOTIFY_EMAIL nothing is emailed', async () => {
    const calls = mockGraph();
    await handler(ev({ tenantId: T, message: 'No mail ' + Date.now() }));
    assert.ok(!calls.some((c) => /sendMail/.test(c.url)));
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
