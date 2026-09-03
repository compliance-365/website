// End-to-end tests for azure/EvidenceSubmit/index.js's top-level HTTP
// handler — the actual request/response behaviour an owner's browser
// sees, not just the pure validation helpers covered in
// evidence-submit.test.mjs. Exercised by mocking the global `fetch`
// getAppToken()/graphClient() are both built on (same technique the
// Function's own request-to-Graph plumbing uses at runtime — see
// azure/lib/graph.js), so this runs the REAL handler, REAL token
// verification, and REAL Graph-call sequencing with no network.
import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const handler = require('../public/checkpoint/azure/EvidenceSubmit/index.js');
const { mintEvidenceToken } = require('../public/checkpoint/azure/lib/evidenceToken.js');

const SECRET = 'test-secret';
const ACTION_ITEM_ID = '42';

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
   action itself) -> POST ActionUpdates / PATCH Actions/{id}/fields. */
function installFetchMock({ actionFields, postCalls, patchCalls }) {
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
        { id: 'actions-list', displayName: 'Checkpoint Actions' },
        { id: 'updates-list', displayName: 'Checkpoint ActionUpdates' }
      ] });
    }
    if (new RegExp(`/lists/actions-list/items/${ACTION_ITEM_ID}\\?`).test(url) && method === 'GET') {
      if (!actionFields) return mockResponse(404, { error: 'not found' });
      return mockResponse(200, { id: ACTION_ITEM_ID, fields: actionFields });
    }
    if (/\/lists\/updates-list\/items$/.test(url) && method === 'POST') {
      if (postCalls) postCalls.push(JSON.parse(opts.body));
      return mockResponse(201, { id: 'upd-1' });
    }
    if (new RegExp(`/lists/actions-list/items/${ACTION_ITEM_ID}/fields$`).test(url) && method === 'PATCH') {
      if (patchCalls) patchCalls.push(JSON.parse(opts.body));
      return mockResponse(204, null);
    }
    throw new Error('unexpected fetch: ' + method + ' ' + url);
  };
}

function ctx() {
  return { log: Object.assign((..._a) => {}, { error: (..._a) => {} }) };
}

describe('EvidenceSubmit handler — GET (preview)', () => {
  beforeEach(() => {
    process.env.TENANT_ID = 't'; process.env.CLIENT_ID = 'c'; process.env.CLIENT_SECRET = 's';
    process.env.EVIDENCE_LINK_SECRET = SECRET;
  });
  afterEach(() => {
    delete process.env.TENANT_ID; delete process.env.CLIENT_ID; delete process.env.CLIENT_SECRET;
    delete process.env.EVIDENCE_LINK_SECRET; delete globalThis.fetch;
  });

  test('a valid token returns the action\'s safe preview fields', async () => {
    installFetchMock({ actionFields: { RefId: 'ACT-001', Title: 'Rotate keys', DueDate: '2026-05-01', Priority: 'High', Status: 'Open', Owner: 'K. Patel' } });
    const token = mintEvidenceToken(ACTION_ITEM_ID, SECRET, 30);
    const c = ctx();
    await handler(c, { method: 'GET', query: { token }, body: null });
    assert.equal(c.res.status, 200);
    const body = JSON.parse(c.res.body);
    assert.equal(body.ok, true);
    assert.equal(body.ref, 'ACT-001');
    assert.equal(body.title, 'Rotate keys');
  });

  test('an invalid token is rejected with 403 before any Graph call is made', async () => {
    installFetchMock({ actionFields: null });
    const c = ctx();
    await handler(c, { method: 'GET', query: { token: 'garbage' }, body: null });
    assert.equal(c.res.status, 403);
    assert.equal(JSON.parse(c.res.body).ok, false);
  });

  test('a token for an action that no longer exists returns 404', async () => {
    installFetchMock({ actionFields: null });
    const token = mintEvidenceToken(ACTION_ITEM_ID, SECRET, 30);
    const c = ctx();
    await handler(c, { method: 'GET', query: { token }, body: null });
    assert.equal(c.res.status, 404);
  });

  test('a token signed with the wrong secret is rejected even though it is well-formed', async () => {
    installFetchMock({ actionFields: { RefId: 'ACT-001' } });
    const token = mintEvidenceToken(ACTION_ITEM_ID, 'wrong-secret', 30);
    const c = ctx();
    await handler(c, { method: 'GET', query: { token }, body: null });
    assert.equal(c.res.status, 403);
  });
});

describe('EvidenceSubmit handler — POST (submit)', () => {
  beforeEach(() => {
    process.env.TENANT_ID = 't'; process.env.CLIENT_ID = 'c'; process.env.CLIENT_SECRET = 's';
    process.env.EVIDENCE_LINK_SECRET = SECRET;
  });
  afterEach(() => {
    delete process.env.TENANT_ID; delete process.env.CLIENT_ID; delete process.env.CLIENT_SECRET;
    delete process.env.EVIDENCE_LINK_SECRET; delete globalThis.fetch;
  });

  test('a valid submission writes an ActionUpdates row and patches the Action, then returns 200', async () => {
    const postCalls = [], patchCalls = [];
    installFetchMock({ actionFields: { RefId: 'ACT-001', Title: 'Rotate keys', Owner: 'K. Patel' }, postCalls, patchCalls });
    const token = mintEvidenceToken(ACTION_ITEM_ID, SECRET, 30);
    const c = ctx();
    await handler(c, { method: 'POST', query: { token }, body: { note: 'Rotated the keys today.', status: 'Done' } });
    assert.equal(c.res.status, 200);
    assert.equal(JSON.parse(c.res.body).ok, true);

    assert.equal(postCalls.length, 1);
    assert.equal(postCalls[0].fields.ActionRef, 'ACT-001');
    assert.equal(postCalls[0].fields.Note, 'Rotated the keys today.');
    assert.equal(postCalls[0].fields.Status, 'Done');
    assert.match(postCalls[0].fields.Author, /K\. Patel/);
    assert.match(postCalls[0].fields.Author, /no Checkpoint sign-in/);
    assert.equal(postCalls[0].fields.Title, postCalls[0].fields.RefId, 'Title and RefId use the same generated id');

    assert.equal(patchCalls.length, 1);
    assert.equal(patchCalls[0].Status, 'Done');
    assert.ok(!('EvidenceUrl' in patchCalls[0]), 'no evidence link submitted, so the patch does not touch that field');
  });

  test('an invalid submission (bad status) is rejected with 400 and writes nothing', async () => {
    const postCalls = [], patchCalls = [];
    installFetchMock({ actionFields: { RefId: 'ACT-001' }, postCalls, patchCalls });
    const token = mintEvidenceToken(ACTION_ITEM_ID, SECRET, 30);
    const c = ctx();
    await handler(c, { method: 'POST', query: { token }, body: { note: 'x', status: 'Open' } });
    assert.equal(c.res.status, 400);
    assert.equal(postCalls.length, 0);
    assert.equal(patchCalls.length, 0);
  });

  test('an expired token is rejected with 403 and writes nothing', async () => {
    const postCalls = [], patchCalls = [];
    installFetchMock({ actionFields: { RefId: 'ACT-001' }, postCalls, patchCalls });
    const token = mintEvidenceToken(ACTION_ITEM_ID, SECRET, -1);
    const c = ctx();
    await handler(c, { method: 'POST', query: { token }, body: { note: 'x', status: 'Done' } });
    assert.equal(c.res.status, 403);
    assert.equal(postCalls.length, 0);
  });
});
