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
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const Graph = {
    async g(path, opts) {
      if (/^\/sites\/root\?/.test(path)) return { id: 'site1', webUrl: 'https://contoso.sharepoint.com' };
      const m = /\/lists\/([^/]+)\/items$/.exec(path);
      if (m && opts && opts.method === 'POST') { const row = { id: String(nextId++), fields: opts.body.fields || {} }; lists[m[1]].push(row); return row; }
      if (/\/lists\/[^/]+\/items\/[^/]+\/fields$/.test(path)) return {};
      if (/\/lists\/[^/?]+\?\$expand=drive/.test(path)) return { drive: { id: 'drive1' } };
      return {};
    },
    async gAll(path) {
      if (/\/lists\?\$select=id,displayName/.test(path)) return Object.keys(names).map((n) => ({ id: names[n], displayName: n }));
      if (/\/columns\?/.test(path)) return [];
      const m = /\/lists\/([^/]+)\/items\?/.exec(path);
      if (m) {
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
  return { window, lists, names, gets, stats: () => maxInFlight, addList(name) { const id = 'L' + nextId++; names[name] = id; lists[id] = []; return id; } };
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
