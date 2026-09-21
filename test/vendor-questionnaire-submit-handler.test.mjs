// End-to-end tests for azure/VendorQuestionnaireSubmit/index.js's
// top-level HTTP handler — the actual request/response behaviour a
// vendor contact's browser sees, not just the pure validation helpers
// covered in vendor-questionnaire-submit.test.mjs. Exercised by mocking
// the global `fetch` getAppToken()/graphClient() are both built on (same
// technique evidence-submit-handler.test.mjs uses), so this runs the
// REAL handler, REAL token verification, and REAL Graph-call sequencing
// with no network.
import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const handler = require('../public/checkpoint/azure/VendorQuestionnaireSubmit/index.js');
const { mintVendorToken } = require('../public/checkpoint/azure/lib/vendorToken.js');

const SECRET = 'test-vendor-secret';
const VENDOR_ITEM_ID = '7';

function mockResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body)
  };
}

/* Mimics the real sequence: OAuth token endpoint -> /sites/root (site
   resolve) -> /sites/{id}/lists (list resolve) -> /items/{id} (the
   vendor itself) -> PATCH Vendors/{id}/fields. */
function installFetchMock({ vendorFields, patchCalls }) {
  globalThis.fetch = async (url, opts) => {
    const method = (opts && opts.method) || 'GET';
    if (String(url).indexOf('login.microsoftonline.com') !== -1) {
      return mockResponse(200, { access_token: 'fake-app-token' });
    }
    if (/\/sites\/root\?\$select=id$/.test(url)) {
      return mockResponse(200, { id: 'site-1' });
    }
    if (/\/sites\/site-1\/lists\?/.test(url)) {
      return mockResponse(200, { value: [
        { id: 'vendors-list', displayName: 'Checkpoint Vendors' }
      ] });
    }
    if (new RegExp(`/lists/vendors-list/items/${VENDOR_ITEM_ID}\\?`).test(url) && method === 'GET') {
      if (!vendorFields) return mockResponse(404, { error: 'not found' });
      return mockResponse(200, { id: VENDOR_ITEM_ID, fields: vendorFields });
    }
    if (new RegExp(`/lists/vendors-list/items/${VENDOR_ITEM_ID}/fields$`).test(url) && method === 'PATCH') {
      if (patchCalls) patchCalls.push(JSON.parse(opts.body));
      return mockResponse(204, null);
    }
    throw new Error('unexpected fetch: ' + method + ' ' + url);
  };
}

function ctx() {
  return { log: Object.assign((..._a) => {}, { error: (..._a) => {} }) };
}

describe('VendorQuestionnaireSubmit handler — GET (preview)', () => {
  beforeEach(() => {
    process.env.TENANT_ID = 't'; process.env.CLIENT_ID = 'c'; process.env.CLIENT_SECRET = 's';
    process.env.VENDOR_LINK_SECRET = SECRET;
  });
  afterEach(() => {
    delete process.env.TENANT_ID; delete process.env.CLIENT_ID; delete process.env.CLIENT_SECRET;
    delete process.env.VENDOR_LINK_SECRET; delete globalThis.fetch;
  });

  test('a valid token returns the vendor name/service and the full question set', async () => {
    installFetchMock({ vendorFields: { Title: 'Aria Payments Gateway', Service: 'Card payments' } });
    const token = mintVendorToken(VENDOR_ITEM_ID, SECRET, 14);
    const c = ctx();
    await handler(c, { method: 'GET', query: { token }, body: null });
    assert.equal(c.res.status, 200);
    const body = JSON.parse(c.res.body);
    assert.equal(body.ok, true);
    assert.equal(body.name, 'Aria Payments Gateway');
    assert.equal(body.service, 'Card payments');
    assert.ok(body.questions.security && body.questions.privacy && body.questions.ai, 'all three sections present');
  });

  test('the GET response never includes internal register fields (criticality, risk refs, controls) — vendor-safe preview only', async () => {
    installFetchMock({ vendorFields: { Title: 'Aria', Criticality: 'Critical', RiskRefs: 'R-001', Controls: 'A.5.19' } });
    const token = mintVendorToken(VENDOR_ITEM_ID, SECRET, 14);
    const c = ctx();
    await handler(c, { method: 'GET', query: { token }, body: null });
    const body = JSON.parse(c.res.body);
    assert.deepEqual(Object.keys(body).sort(), ['name', 'ok', 'questions', 'service']);
  });

  test('an invalid token is rejected with 403 before any Graph call is made', async () => {
    installFetchMock({ vendorFields: null });
    const c = ctx();
    await handler(c, { method: 'GET', query: { token: 'garbage' }, body: null });
    assert.equal(c.res.status, 403);
    assert.equal(JSON.parse(c.res.body).ok, false);
  });

  test('a token for a vendor that no longer exists returns 404', async () => {
    installFetchMock({ vendorFields: null });
    const token = mintVendorToken(VENDOR_ITEM_ID, SECRET, 14);
    const c = ctx();
    await handler(c, { method: 'GET', query: { token }, body: null });
    assert.equal(c.res.status, 404);
  });

  test('a token signed with the wrong secret is rejected even though it is well-formed', async () => {
    installFetchMock({ vendorFields: { Title: 'Aria' } });
    const token = mintVendorToken(VENDOR_ITEM_ID, 'wrong-secret', 14);
    const c = ctx();
    await handler(c, { method: 'GET', query: { token }, body: null });
    assert.equal(c.res.status, 403);
  });
});

describe('VendorQuestionnaireSubmit handler — POST (submit)', () => {
  beforeEach(() => {
    process.env.TENANT_ID = 't'; process.env.CLIENT_ID = 'c'; process.env.CLIENT_SECRET = 's';
    process.env.VENDOR_LINK_SECRET = SECRET;
  });
  afterEach(() => {
    delete process.env.TENANT_ID; delete process.env.CLIENT_ID; delete process.env.CLIENT_SECRET;
    delete process.env.VENDOR_LINK_SECRET; delete globalThis.fetch;
  });

  test('a valid submission patches QuestionnaireAnswers/Status/ReceivedDate, then returns 200', async () => {
    const patchCalls = [];
    installFetchMock({ vendorFields: { Title: 'Aria Payments Gateway' }, patchCalls });
    const token = mintVendorToken(VENDOR_ITEM_ID, SECRET, 14);
    const c = ctx();
    await handler(c, { method: 'POST', query: { token }, body: { answers: { encryption: 'Yes', dataLocation: 'Australia' } } });
    assert.equal(c.res.status, 200);
    assert.equal(JSON.parse(c.res.body).ok, true);

    assert.equal(patchCalls.length, 1);
    assert.equal(patchCalls[0].QuestionnaireStatus, 'Received');
    assert.match(patchCalls[0].QuestionnaireReceivedDate, /^\d{4}-\d{2}-\d{2}$/);
    assert.deepEqual(JSON.parse(patchCalls[0].QuestionnaireAnswers), { encryption: 'Yes', dataLocation: 'Australia' });
  });

  test('an invalid submission (unknown question id) is rejected with 400 and writes nothing', async () => {
    const patchCalls = [];
    installFetchMock({ vendorFields: { Title: 'Aria' }, patchCalls });
    const token = mintVendorToken(VENDOR_ITEM_ID, SECRET, 14);
    const c = ctx();
    await handler(c, { method: 'POST', query: { token }, body: { answers: { notReal: 'x' } } });
    assert.equal(c.res.status, 400);
    assert.equal(patchCalls.length, 0);
  });

  test('an expired token is rejected with 403 and writes nothing', async () => {
    const patchCalls = [];
    installFetchMock({ vendorFields: { Title: 'Aria' }, patchCalls });
    const token = mintVendorToken(VENDOR_ITEM_ID, SECRET, -1);
    const c = ctx();
    await handler(c, { method: 'POST', query: { token }, body: { answers: { encryption: 'Yes' } } });
    assert.equal(c.res.status, 403);
    assert.equal(patchCalls.length, 0);
  });

  test('a submission for a vendor that no longer exists returns 404 and writes nothing', async () => {
    const patchCalls = [];
    installFetchMock({ vendorFields: null, patchCalls });
    const token = mintVendorToken(VENDOR_ITEM_ID, SECRET, 14);
    const c = ctx();
    await handler(c, { method: 'POST', query: { token }, body: { answers: { encryption: 'Yes' } } });
    assert.equal(c.res.status, 404);
    assert.equal(patchCalls.length, 0);
  });
});
