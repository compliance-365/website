// After sign-in Checkpoint reads every register from SharePoint. They are
// read a few at a time rather than one after another, and Controls and
// Clauses, just read by the self-heal, are not fetched a second time.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const src = (f) => readFileSync(new URL('../public/checkpoint/' + f, import.meta.url), 'utf8');

function makeSandbox() {
  const lists = {};      // listId -> rows
  const names = {};      // displayName -> listId
  let nextId = 1, inFlight = 0, maxInFlight = 0;
  const gets = {};       // listId -> item GET count
  const calls = { root: 0, lists: 0, tops: [] };
  let reject999 = false;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const Graph = {
    async g(path, opts) {
      if (/^\/sites\/root\?/.test(path)) { calls.root++; } if (/^\/sites\/root\?/.test(path)) return { id: 'site1', webUrl: 'https://contoso.sharepoint.com' };
      const m = /\/lists\/([^/]+)\/items$/.exec(path);
      if (m && opts && opts.method === 'POST') { const row = { id: String(nextId++), fields: opts.body.fields || {} }; lists[m[1]].push(row); return row; }
      if (/\/lists\/[^/]+\/items\/[^/]+\/fields$/.test(path)) return {};
      if (/\/lists\/[^/?]+\?\$expand=drive/.test(path)) return { drive: { id: 'drive1' } };
      return {};
    },
    async gAll(path) {
      if (/\/lists\?\$select=id,displayName/.test(path)) calls.lists++;
      if (/\/lists\?\$select=id,displayName/.test(path)) return Object.keys(names).map((n) => ({ id: names[n], displayName: n }));
      if (/\/columns\?/.test(path)) return [];
      const m = /\/lists\/([^/]+)\/items\?/.exec(path);
      if (m) {
        const top = Number((/\$top=(\d+)/.exec(path) || [])[1]);
        calls.tops.push(top);
        if (reject999 && top === 999) { const e = new Error('Invalid request'); e.status = 400; throw e; }
        gets[m[1]] = (gets[m[1]] || 0) + 1;
        inFlight++; maxInFlight = Math.max(maxInFlight, inFlight);
        await sleep(5);
        inFlight--;
        return lists[m[1]].slice();
      }
      return [];
    },
    async batch(reqs) { return reqs.map(() => ({ status: 200, body: { value: [] } })); },
    getAccount() { return { name: 'Tester', homeAccountId: 'h1' }; },
  };
  const window = { localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} }, Graph, location: { search: '' }, addEventListener() {}, setTimeout, clearTimeout };
  window.window = window;
  const ctx = vm.createContext({ window, console, setTimeout, clearTimeout, Promise, Date, JSON, Math, Object, Array, String, Number, Boolean, RegExp, Error, Set, Map, encodeURIComponent, decodeURIComponent, localStorage: window.localStorage, Graph });
  vm.runInContext(src('config.js'), ctx);
  vm.runInContext(src('lib.js'), ctx);
  vm.runInContext(src('guidance.js'), ctx);
  vm.runInContext(src('store.js'), ctx);
  window.CHECKPOINT_CONFIG.site = 'root';
  return { window, lists, names, gets, calls, reject: () => { reject999 = true; }, stats: () => maxInFlight, addList(name) { const id = 'L' + nextId++; names[name] = id; lists[id] = []; return id; } };
}

test('registers load a few at a time, and Controls and Clauses are read once', async () => {
  const sb = makeSandbox();
  const S = sb.window.SpStore;
  assert.ok(S && typeof S.load === 'function', 'SpStore loads in the sandbox');
  const prefix = sb.window.CHECKPOINT_CONFIG.listPrefix;
  const DEFS = Object.keys(S._defs || {});
  const keys = DEFS.length ? DEFS : null;
  assert.ok(keys, 'store exposes its list definitions to tests');
  for (const k of keys.concat(['Documents'])) sb.addList(prefix + ' ' + k);
  await S.load();                      // first run seeds Controls and Clauses
  const ctl = sb.names[prefix + ' Controls'], cl = sb.names[prefix + ' Clauses'];
  for (const id of Object.keys(sb.gets)) sb.gets[id] = 0;
  await S.load();                      // nothing missing now
  assert.equal(sb.gets[ctl], 1, 'Controls read once');
  assert.equal(sb.gets[cl], 1, 'Clauses read once');
  assert.ok(sb.stats() > 1 && sb.stats() <= 6, 'several lists in flight, at most 6: ' + sb.stats());
});

test('one site lookup and one list-of-lists per sign-in; pages of 999 rows', async () => {
  const sb = makeSandbox();
  const S = sb.window.SpStore;
  const prefix = sb.window.CHECKPOINT_CONFIG.listPrefix;
  for (const k of Object.keys(S._defs).concat(['Documents'])) sb.addList(prefix + ' ' + k);
  await S.probeOnboardingState();
  await S.readCachedActivation();
  await S.load();
  assert.equal(sb.calls.root, 1, 'the site is resolved once');
  assert.equal(sb.calls.lists, 1, 'the list of lists is read once');
  assert.ok(sb.calls.tops.length && sb.calls.tops.every((t) => t === 999), 'pages of 999');
});

test('a tenant that refuses 999-row pages falls back to 200', async () => {
  const sb = makeSandbox();
  const S = sb.window.SpStore;
  const prefix = sb.window.CHECKPOINT_CONFIG.listPrefix;
  for (const k of Object.keys(S._defs).concat(['Documents'])) sb.addList(prefix + ' ' + k);
  sb.reject();
  await S.load();
  assert.ok(sb.calls.tops.includes(200), 'retried at 200');
  assert.ok(sb.calls.tops.filter((t) => t === 999).length <= 6, 'stops asking for 999 once refused');
});

test('missing controls are added in batches of 20, and each row lands in the list and the register', async () => {
  const sb = makeSandbox();
  const S = sb.window.SpStore;
  const prefix = sb.window.CHECKPOINT_CONFIG.listPrefix;
  for (const k of Object.keys(S._defs).concat(['Documents'])) sb.addList(prefix + ' ' + k);
  const state = await S.load();
  const ctl = sb.names[prefix + ' Controls'];
  // Remove 45 seeded rows so the self-heal has to add them back.
  const removed = sb.lists[ctl].splice(0, 45).map((r) => r.fields.Code);
  state.controls = state.controls.filter((c) => !removed.includes(c.id));
  const sizes = [];
  let n = 9000;
  sb.window.Graph.batch = async (reqs) => {
    sizes.push(reqs.length);
    return reqs.map((r) => { const listId = /\/lists\/([^/]+)\/items$/.exec(r.url)[1]; const row = { id: String(n++), fields: r.body.fields }; sb.lists[listId].push(row); return { status: 201, body: row }; });
  };
  const added = await S.reconcileControls();
  assert.equal(added, 45);
  assert.deepEqual(sizes, [45], 'one call to the batch helper for the chunk (it splits into 20s itself)');
  assert.equal(sb.lists[ctl].filter((r) => removed.includes(r.fields.Code)).length, 45);
  assert.equal(state.controls.filter((c) => removed.includes(c.id)).length, 45);
});
