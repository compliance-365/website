// The live SharePoint store, run against a fake SharePoint in a real
// browser. The demo never touches SharePoint, so a save that only fails
// against SharePoint (a missing store method, a field that is not a
// column, a number sent to a text column) passes every demo-based test
// and reaches a client. This runs every add, update and delete the live
// store has, then reloads, and fails on anything SharePoint would reject.
// It would have caught "savePolicyDraft is not a function".
import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

let chromium = null, skipReason = null;
try { ({ chromium } = await import('playwright')); } catch (e) { skipReason = 'playwright is not installed'; }
const PUBLIC_DIR = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'public');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json' };
let server = null, baseUrl = '', browser = null;
if (!skipReason) {
  server = createServer(async (req, res) => {
    let filePath = join(PUBLIC_DIR, decodeURIComponent(req.url.split('?')[0]));
    let st = await stat(filePath).catch(() => null);
    if (st && st.isDirectory()) { filePath = join(filePath, 'index.html'); st = await stat(filePath).catch(() => null); }
    if (!st) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': MIME[extname(filePath)] || 'application/octet-stream' });
    res.end(await readFile(filePath));
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  baseUrl = 'http://127.0.0.1:' + server.address().port;
  try { browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined }); }
  catch (e) { skipReason = 'Chromium not found'; }
}
after(async () => { if (browser) await browser.close(); if (server) server.close(); });

describe('live store against a fake SharePoint', { skip: skipReason || false }, () => {
  test('every write is accepted, and an edited policy round-trips as one record', async () => {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(baseUrl + '/checkpoint/index.html', { waitUntil: 'networkidle' });
    const r = await page.evaluate(async () => {
  const problems = [], unknown = [], calls = {};
  const DEFS = window.SpStore._defs;
  const lists = {}; let seq = 1, itemSeq = 1;
  const typeOf = (c) => Object.keys(c).find((x) => !['name', 'indexed', 'required', 'displayName', 'description', 'enforceUniqueValues', 'hidden'].includes(x));
  const colsFor = (cols) => [{ name: 'Title', text: {} }].concat(JSON.parse(JSON.stringify(cols || [])));
  function validate(id, fields, how) {
    const L = lists[id]; if (!L) { problems.push(`${how} to unknown list id ${id}`); return; }
    for (const [f, v] of Object.entries(fields || {})) {
      if (v === undefined || v === null) continue;
      const col = L.cols.find((c) => c.name === f);
      if (!col) { problems.push(`${how} ${L.name}: field "${f}" is not a column`); continue; }
      const t = typeOf(col);
      if (t === 'text' && typeof v !== 'string') problems.push(`${how} ${L.name}.${f}: text column given ${typeof v} (${JSON.stringify(v).slice(0, 40)})`);
      if (t === 'number' && typeof v !== 'number') problems.push(`${how} ${L.name}.${f}: number column given ${typeof v} (${JSON.stringify(v).slice(0, 40)})`);
      if (t === 'boolean' && typeof v !== 'boolean') problems.push(`${how} ${L.name}.${f}: yes/no column given ${typeof v} (${JSON.stringify(v).slice(0, 40)})`);
      if (t === 'text' && typeof v === 'string' && !(col.text && col.text.allowMultipleLines) && v.length > 255) problems.push(`${how} ${L.name}.${f}: ${v.length} characters into a single-line text column (limit 255)`);
    }
  }
  function route(method, url, body) {
    calls[method] = (calls[method] || 0) + 1;
    const u = url.split('?')[0];
    let m;
    if (u === '/sites/root') return { id: 'site1', webUrl: 'https://contoso.sharepoint.com', siteCollection: { hostname: 'contoso.sharepoint.com' } };
    if (/^\/sites\/contoso\.sharepoint\.com:/.test(u)) return { id: 'site1' };
    if (u === '/sites/site1/lists' && method === 'POST') { const id = 'L' + seq++; lists[id] = { id, name: body.displayName, cols: colsFor(body.columns), items: {} }; return { id }; }
    if (u === '/sites/site1/lists') return { value: Object.values(lists).map((l) => ({ id: l.id, displayName: l.name })) };
    if ((m = u.match(/^\/sites\/site1\/lists\/([^/]+)$/))) return { id: m[1], drive: { id: 'drive1' } };
    if ((m = u.match(/^\/sites\/site1\/lists\/([^/]+)\/columns$/))) {
      if (method === 'POST') { lists[m[1]].cols.push(body); return body; }
      return { value: lists[m[1]].cols };
    }
    if ((m = u.match(/^\/sites\/site1\/lists\/([^/]+)\/items$/))) {
      const L = lists[m[1]];
      if (method === 'POST') { validate(m[1], body.fields, 'add'); const id = String(itemSeq++); L.items[id] = { id, fields: Object.assign({ id }, body.fields) }; return { id, fields: L.items[id].fields }; }
      return { value: Object.values(L.items) };
    }
    if ((m = u.match(/^\/sites\/site1\/lists\/([^/]+)\/items\/([^/]+)\/fields$/))) {
      validate(m[1], body, 'update'); const it = lists[m[1]].items[m[2]];
      if (!it) problems.push(`update ${lists[m[1]].name}: item "${m[2]}" does not exist`); else Object.assign(it.fields, body);
      return body;
    }
    if ((m = u.match(/^\/sites\/site1\/lists\/([^/]+)\/items\/([^/]+)$/)) && method === 'DELETE') {
      if (!lists[m[1]].items[m[2]]) problems.push(`delete ${lists[m[1]].name}: item "${m[2]}" does not exist`);
      delete lists[m[1]].items[m[2]]; return {};
    }
    unknown.push(method + ' ' + url.slice(0, 120));
    return { value: [] };
  }
  const G = window.Graph;
  G.g = async (url, opts) => { opts = opts || {}; return route((opts.method || 'GET').toUpperCase(), url, opts.body); };
  G.gAll = async (url) => { const r = route('GET', url); return r.value || []; };
  G.batch = async (reqs) => reqs.map((r) => ({ status: 200, body: route((r.method || 'GET').toUpperCase(), r.url, r.body) }));
  for (const k of ['ensureFolderPath', 'createChildFolders', 'listChildFolders', 'listChildrenMany', 'listDriveFiles', 'setDriveItemFields', 'uploadFileToPath', 'uploadSmallFile', 'uploadSmallFileTo'])
    G[k] = async () => { unknown.push('drive: ' + k); return k.startsWith('list') ? [] : { id: 'f1', webUrl: 'https://x' }; };
  window.CHECKPOINT_CONFIG.site = '/sites/compliance';
  // Learn the list names the store uses from checkSetup (all missing at first).
  let names = [];
  try { const cs = await window.SpStore.checkSetup(); names = cs.listsMissing || cs.missingLists || cs.missing || []; if (!names.length) problems.push('checkSetup shape: ' + JSON.stringify(Object.keys(cs))); } catch (e) { problems.push('checkSetup threw: ' + e.message); }
  Object.keys(DEFS).forEach((k, i) => { const id = 'L' + seq++; lists[id] = { id, name: names[i] || k, cols: colsFor(DEFS[k]), items: {} }; });
  const docName = (names[0] || '').replace(/[^ ]+$/, 'Documents');
  const docId = 'L' + seq++; lists[docId] = { id: docId, name: docName, cols: colsFor([]), items: {} };
  let S;
  try { S = await window.SpStore.load(); } catch (e) { return { fatal: 'load threw: ' + e.stack, problems, unknown, names }; }
  const demo = await window.DemoStore.load();
  const pick = (k) => { const r = JSON.parse(JSON.stringify((demo[k] || [])[0] || {})); delete r._sp; return r; };
  const run = async (label, fn) => { try { await fn(); } catch (e) { problems.push(`${label} threw: ${e.message}`); } };
  const sp = window.SpStore;
  const pairs = [['Risk', 'risks'], ['Action', 'actions'], ['AuditRequest', 'auditRequests'], ['Vendor', 'vendors'], ['AiSystem', 'aiSystems'], ['Audit', 'audits'], ['Incident', 'incidents'], ['Review', 'reviews'], ['Asset', 'assets'], ['Legal', 'legal'], ['Answer', 'answers'], ['Objective', 'objectives'], ['CalendarItem', 'calendar']];
  for (const [n, k] of pairs) {
    const rec = pick(k);
    if (!Object.keys(rec).length) { problems.push(`(harness) no demo ${k} record for add${n}`); continue; }
    await run('add' + n, () => sp['add' + n](rec));
    if (sp['update' + n]) await run('update' + n, () => sp['update' + n](rec));
    if (sp['delete' + n]) await run('delete' + n, () => sp['delete' + n](rec));
  }
  await run('addTicketLink', () => sp.addTicketLink(pick('ticketLinks')));
  await run('addActionUpdate', () => sp.addActionUpdate(pick('actionUpdates')));
  const ctl = (S.controls || [])[0];
  if (ctl) await run('updateControl', () => sp.updateControl(Object.assign({}, ctl, { st: 'Implemented', evidenceUrl: 'https://x/y.pdf', verified: '2026-10-01' })));
  else problems.push('(harness) no controls after load');
  const cl = (S.clauses || [])[0]; if (cl) await run('updateClause', () => sp.updateClause(Object.assign({}, cl, { st: 'Implemented' })));
  await run('addScan', () => sp.addScan(pick('scans')));
  await run('saveScanState', () => sp.saveScanState());
  await run('logActivity', () => sp.logActivity('Posture scan completed'));
  await run('setSetting', () => sp.setSetting('guidedClient', 'true'));
  await run('setSetting(long)', () => sp.setSetting('zzTestKey', 'x'.repeat(300)));
  await run('setEntitlement', () => sp.setEntitlement('soc2', true));
  await run('addAttestations', () => sp.addAttestations([pick('attestations')]));
  if ((S.attestations || [])[0]) await run('updateAttestation', () => sp.updateAttestation(S.attestations[0]));
  await run('addTrainingAssignments', () => sp.addTrainingAssignments([pick('training')]));
  if ((S.training || [])[0]) await run('updateTrainingRecord', () => sp.updateTrainingRecord(S.training[0]));
  await run('appendAudit', () => sp.appendAudit({ actor: 'a', actorId: 'b', action: 'x', targetType: 't', targetId: '1', before: '', after: '', entryDateTime: new Date().toISOString() }));
  await run('savePolicyDraft(add)', () => sp.savePolicyDraft({ docName: 'Information Security Policy.html', tplId: 'isp', content: { scope: 'x' }, updatedBy: 'E', updatedDate: '2026-10-10' }));
  await run('savePolicyDraft(update)', () => sp.savePolicyDraft({ docName: 'Information Security Policy.html', tplId: 'isp', content: { scope: 'y' }, updatedBy: 'E', updatedDate: '2026-10-10' }));
  await run('savePolicyDraft(reset)', () => sp.savePolicyDraft({ docName: 'Information Security Policy.html', tplId: 'isp', content: null, updatedBy: '', updatedDate: '' }));
  await run('setCheckDisposition', () => sp.setCheckDisposition({ checkId: 'mfa-all', disposition: 'accepted', reason: 'r', by: 'b', date: '2026-10-10', until: '2027-01-01' }));
  await run('clearCheckDisposition', () => sp.clearCheckDisposition('mfa-all'));
  let S2; try { S2 = await sp.load(); } catch (e) { problems.push('reload threw: ' + e.message); }
  await run('savePolicyDraft(after reload, re-edit)', () => sp.savePolicyDraft({ docName: 'Information Security Policy.html', tplId: 'isp', content: { scope: 'z' }, updatedBy: 'E', updatedDate: '2026-10-11' }));
  const draftList = Object.values(lists).find((l) => /PolicyDrafts|Policy Drafts/i.test(l.name));
  return { problems: [...new Set(problems)], unknown: [...new Set(unknown)], calls, controls: (S.controls || []).length, clauses: (S.clauses || []).length, draftItems: draftList ? Object.keys(draftList.items).length : -1, draftList: draftList && draftList.name, names: names.slice(0, 3) };
});
    assert.equal(r.fatal, undefined, r.fatal);
    assert.deepEqual(r.problems, [], r.problems.join('\n'));
    assert.deepEqual(r.unknown, [], 'requests the fake does not model: ' + r.unknown.join(', '));
    assert.ok(r.controls > 0 && r.clauses > 0, 'load seeded controls and clauses');
    assert.equal(r.draftItems, 1, 'add, update, reset and re-edit after reload keep one PolicyDrafts item');
    assert.ok(r.calls.POST > 100 && r.calls.PATCH > 10, 'the writes actually ran');
    assert.deepEqual(errors, []);
    await page.close();
  });
});
