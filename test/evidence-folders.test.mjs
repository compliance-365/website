// Evidence folders: Documents/Evidence/<framework>/<control> in the
// client's SharePoint, created for every applicable control and clause
// in every framework the tenant holds, and linked automatically once a
// file lands in one. The naming, planning and link rules are pure
// (lib.js); the Graph batching is exercised against a fake drive.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import vm from 'node:vm';
import Lib from '../public/checkpoint/lib.js';

const {
  evidenceFolderSegment, evidenceFolderName, evidenceFolderCode, evidenceKey,
  planEvidenceFolders, diffEvidenceFolders, evidenceFolderSummary,
  evidenceFolderLinkUpdates, evidenceFolderFreshness, EVIDENCE_ROOT
} = Lib;

describe('folder naming', () => {
  test('characters SharePoint rejects are replaced, not dropped', () => {
    assert.equal(evidenceFolderSegment('ISO/IEC 27001:2022'), 'ISO-IEC 27001-2022');
    assert.equal(evidenceFolderSegment('a*b?c<d>e|f"g\\h#i%j'), 'a-b-c-d-e-f-g-h-i-j');
  });
  test('trailing dots and spaces are removed and long titles are capped', () => {
    assert.equal(evidenceFolderSegment('Policies...  '), 'Policies');
    assert.ok(evidenceFolderSegment('x'.repeat(300), 70).length <= 70);
    assert.equal(evidenceFolderSegment(''), '-');
  });
  test('controls are "<code> <title>" and clauses are prefixed so codes never collide', () => {
    assert.equal(evidenceFolderName({ id: 'A.5.15', t: 'Access control' }, 'control'), 'A.5.15 Access control');
    assert.equal(evidenceFolderName({ id: '4.1', t: 'Understanding the organization' }, 'clause'), 'Clause 4.1 Understanding the organization');
  });
  test('a folder is matched back by its code, whatever its title says', () => {
    assert.deepEqual(evidenceFolderCode('A.5.15 Access control (renamed by client)'), { kind: 'control', code: 'A.5.15' });
    assert.deepEqual(evidenceFolderCode('Clause 9.2 Internal audit'), { kind: 'clause', code: '9.2' });
    assert.deepEqual(evidenceFolderCode('APP1.1'), { kind: 'control', code: 'APP1.1' });
    assert.equal(evidenceFolderCode('   '), null);
  });
  test('every shipped control code survives naming and round-trips to itself', () => {
    const codes = ['A.5.1', 'A.8.25', '4.1', '10.2'];
    const dir = new URL('../checkpoint-content/', import.meta.url);
    if (existsSync(dir)) {
      for (const f of readdirSync(dir).filter((n) => n.endsWith('.json'))) {
        const walk = (o) => {
          if (Array.isArray(o)) o.forEach(walk);
          else if (o && typeof o === 'object') { if (typeof o.code === 'string') codes.push(o.code); Object.values(o).forEach(walk); }
        };
        walk(JSON.parse(readFileSync(new URL(f, dir), 'utf8')));
      }
    }
    for (const code of codes) {
      assert.equal(evidenceFolderCode(evidenceFolderName({ id: code, t: 'Title' }, 'control')).code, code, code);
      assert.equal(evidenceFolderCode(evidenceFolderName({ id: code, t: 'Title' }, 'clause')).code, code, code);
    }
  });
});

const controls = [
  { fw: 'iso27001', id: 'A.5.1', t: 'Policies for information security', app: true, st: 'Not started', evidenceUrl: '' },
  { fw: 'iso27001', id: 'A.7.4', t: 'Physical security monitoring', app: false, st: 'Not started', evidenceUrl: '' },
  { fw: 'privacyact', id: 'APP1.1', t: 'Open and transparent management', app: true, st: 'In progress', evidenceUrl: '' },
  { fw: 'soc2', id: 'CC6.1', t: 'Logical access', app: true, st: 'Not started', evidenceUrl: '' }
];
const clauses = [{ fw: 'iso27001', id: '4.1', t: 'Context', st: 'Not started', evidenceUrl: '' }];

describe('planEvidenceFolders()', () => {
  const plan = planEvidenceFolders([{ fw: 'iso27001', name: 'ISO/IEC 27001:2022' }, { fw: 'privacyact', name: 'Privacy Act 1988 (APPs)' }], controls, clauses);
  test('covers every framework in scope, and only those', () => {
    assert.deepEqual(plan.map((p) => p.fw), ['iso27001', 'privacyact']);
    assert.equal(plan[0].folder, 'ISO-IEC 27001-2022');
  });
  test('applicable controls and every clause get a folder; excluded controls do not', () => {
    const ids = plan[0].items.map((i) => i.kind + ':' + i.id);
    assert.deepEqual(ids, ['control:A.5.1', 'clause:4.1']);
  });
  test('a framework with nothing to plan is dropped rather than creating an empty folder', () => {
    assert.equal(planEvidenceFolders([{ fw: 'iso42001', name: 'ISO 42001' }], controls, clauses).length, 0);
  });
});

describe('diffEvidenceFolders()', () => {
  const planned = planEvidenceFolders([{ fw: 'iso27001', name: 'ISO' }], controls, clauses)[0].items;
  test('finds existing folders by code and lists the rest as missing', () => {
    const d = diffEvidenceFolders(planned, [{ name: 'A.5.1 Old policy title', id: 'f1', webUrl: 'u1', childCount: 2 }, { name: 'Random folder', id: 'x' }]);
    assert.equal(d.found.length, 1);
    assert.equal(d.found[0].folder.id, 'f1');
    assert.deepEqual(d.missing.map((m) => m.id), ['4.1']);
  });
  test('a clause folder does not satisfy a control with the same code', () => {
    const d = diffEvidenceFolders([{ kind: 'control', id: '4.1' }], [{ name: 'Clause 4.1 Context', id: 'c' }]);
    assert.equal(d.missing.length, 1);
  });
});

describe('evidenceFolderSummary()', () => {
  test('counts files only and reports the newest date', () => {
    const s = evidenceFolderSummary([
      { name: 'a.pdf', lastModifiedDateTime: '2026-03-01T10:00:00Z' },
      { name: 'sub', folder: true, lastModifiedDateTime: '2026-09-01T00:00:00Z' },
      { name: 'b.docx', lastModifiedDateTime: '2026-08-15T09:00:00Z' }
    ]);
    assert.equal(s.count, 2);
    assert.equal(s.latest, '2026-08-15');
  });
});

describe('evidenceFolderLinkUpdates()', () => {
  const folders = {
    [evidenceKey('control', 'iso27001', 'A.5.1')]: { url: 'https://sp/Evidence/ISO/A.5.1', count: 2 },
    [evidenceKey('control', 'iso27001', 'A.7.4')]: { url: 'https://sp/Evidence/ISO/A.7.4', count: 1 },
    [evidenceKey('control', 'privacyact', 'APP1.1')]: { url: 'https://sp/Evidence/APP/APP1.1', count: 1 },
    [evidenceKey('control', 'soc2', 'CC6.1')]: { url: 'https://sp/Evidence/SOC/CC6.1', count: 0 },
    [evidenceKey('clause', 'iso27001', '4.1')]: { url: 'https://sp/Evidence/ISO/Clause 4.1', count: 3 }
  };
  test('links an unlinked control with files, and moves Not started to In progress', () => {
    const ups = evidenceFolderLinkUpdates(controls, 'control', folders);
    const a51 = ups.find((u) => u.record.id === 'A.5.1');
    assert.deepEqual(a51.set, { evidenceUrl: 'https://sp/Evidence/ISO/A.5.1', st: 'In progress' });
  });
  test('never moves a status beyond In progress, and never touches one already further', () => {
    const app = evidenceFolderLinkUpdates(controls, 'control', folders).find((u) => u.record.id === 'APP1.1');
    assert.deepEqual(app.set, { evidenceUrl: 'https://sp/Evidence/APP/APP1.1' });
    const impl = evidenceFolderLinkUpdates([{ fw: 'iso27001', id: 'A.5.1', app: true, st: 'Implemented', evidenceUrl: '' }], 'control', folders);
    assert.deepEqual(impl[0].set, { evidenceUrl: 'https://sp/Evidence/ISO/A.5.1' });
  });
  test('an empty folder, an excluded control, and an existing link are all left alone', () => {
    const ids = evidenceFolderLinkUpdates(controls, 'control', folders).map((u) => u.record.id);
    assert.ok(!ids.includes('CC6.1'), 'empty folder');
    assert.ok(!ids.includes('A.7.4'), 'not applicable');
    const linked = evidenceFolderLinkUpdates([{ fw: 'iso27001', id: 'A.5.1', app: true, st: 'Not started', evidenceUrl: 'https://sp/policy.docx' }], 'control', folders);
    assert.equal(linked.length, 0, 'a person\'s link wins');
  });
  test('clauses follow the same rule', () => {
    const ups = evidenceFolderLinkUpdates(clauses, 'clause', folders);
    assert.equal(ups.length, 1);
    assert.equal(ups[0].set.st, 'In progress');
  });
});

describe('evidenceFolderFreshness()', () => {
  test('flags evidence older than the review cadence', () => {
    assert.equal(evidenceFolderFreshness('2025-01-01', '2026-09-25', 365).stale, true);
    assert.equal(evidenceFolderFreshness('2026-06-01', '2026-09-25', 365).stale, false);
    assert.equal(evidenceFolderFreshness('', '2026-09-25', 365).stale, false);
    assert.equal(evidenceFolderFreshness('2026-06-01', '2026-09-25', 30).stale, true);
  });
});

/* ---- graph.js against a fake SharePoint drive ---- */
function loadGraph(fetchImpl) {
  const src = readFileSync(new URL('../public/checkpoint/graph.js', import.meta.url), 'utf8');
  const msal = {
    PublicClientApplication: class {
      async initialize() {}
      async handleRedirectPromise() { return { account: { name: 'test' } }; }
      getAllAccounts() { return []; }
      async acquireTokenSilent() { return { accessToken: 't' }; }
    }
  };
  const sandbox = {
    window: { CHECKPOINT_CONFIG: { clientId: 'x', scopesReadOnly: [], scopesProvision: [] }, CheckpointLib: Lib },
    msal, location: { origin: 'https://app', pathname: '/checkpoint/' },
    fetch: fetchImpl, setTimeout, encodeURIComponent, btoa: (s) => Buffer.from(s, 'binary').toString('base64'), unescape, console, JSON, Promise
  };
  sandbox.self = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox, { filename: 'graph.js' });
  return sandbox.window.Graph;
}

function jsonRes(status, body) {
  const text = body == null ? '' : JSON.stringify(body);
  return { ok: status >= 200 && status < 300, status, statusText: '', headers: { get: () => null }, text: async () => text, json: async () => body };
}

/* A drive holding one parent folder "p" with one existing child. */
function fakeDrive() {
  const children = { p: [{ id: 'old', name: 'A.5.1 Policies', webUrl: 'https://sp/A.5.1', folder: { childCount: 1 } }] };
  const files = { old: [{ id: 'f1', name: 'policy.pdf', lastModifiedDateTime: '2026-09-01T00:00:00Z', file: {} }] };
  const batches = [];
  let n = 0;
  const handle = (method, url, body) => {
    let m = url.match(/\/items\/([^/]+)\/children/);
    if (method === 'POST' && m) {
      const list = children[m[1]] || (children[m[1]] = []);
      if (list.some((c) => c.name === body.name)) return { status: 409, body: { error: { code: 'nameAlreadyExists' } } };
      const item = { id: 'new' + (++n), name: body.name, webUrl: 'https://sp/' + body.name, folder: { childCount: 0 } };
      list.push(item);
      return { status: 201, body: item };
    }
    if (method === 'GET' && m) {
      const id = m[1];
      return { status: 200, body: { value: files[id] || children[id] || [] } };
    }
    return { status: 404, body: { error: { message: 'nope' } } };
  };
  const fetchImpl = async (url, init) => {
    const path = url.replace('https://graph.microsoft.com/v1.0', '');
    const body = init && init.body ? JSON.parse(init.body) : null;
    if (path === '/$batch') {
      batches.push(body.requests.length);
      assert.ok(body.requests.length <= 20, 'Graph allows at most 20 requests per batch');
      return jsonRes(200, { responses: body.requests.map((r) => Object.assign({ id: r.id, headers: {} }, handle(r.method, r.url, r.body))) });
    }
    const r = handle((init && init.method) || 'GET', path, body);
    return jsonRes(r.status, r.body);
  };
  return { fetchImpl, batches, children };
}

describe('graph.js evidence-folder calls', () => {
  test('createChildFolders batches in 20s and treats an existing name as found, not failed', async () => {
    const drive = fakeDrive();
    const Graph = loadGraph(drive.fetchImpl);
    await Graph.init();
    const names = ['A.5.1 Policies'].concat(Array.from({ length: 44 }, (_, i) => 'A.9.' + i + ' Control'));
    const out = await Graph.createChildFolders('d', 'p', names);
    assert.equal(Object.keys(out).length, 45);
    assert.equal(out['A.5.1 Policies'].id, 'old');
    assert.deepEqual(drive.batches, [20, 20, 5]);
    assert.equal(drive.children.p.length, 45, 'no duplicate folder created');
  });
  test('listChildrenMany returns each folder\'s files', async () => {
    const drive = fakeDrive();
    const Graph = loadGraph(drive.fetchImpl);
    await Graph.init();
    const out = await Graph.listChildrenMany('d', ['old', 'empty']);
    assert.equal(out.old.length, 1);
    assert.equal(out.old[0].name, 'policy.pdf');
    assert.deepEqual(out.empty, []);
  });
});

describe('wiring', () => {
  const app = readFileSync(new URL('../public/checkpoint/app.js', import.meta.url), 'utf8');
  const html = readFileSync(new URL('../public/checkpoint/index.html', import.meta.url), 'utf8');
  const graph = readFileSync(new URL('../public/checkpoint/graph.js', import.meta.url), 'utf8');
  test('the upload and sync actions are gated for read-only sessions', () => {
    for (const a of ['addControlEvidenceFiles', 'addClauseEvidenceFiles', 'syncEvidenceFolders']) {
      assert.match(app, new RegExp("'" + a + "'"), a + ' must be in MUTATING_ACTIONS');
      assert.match(app, new RegExp('\\n    ' + a + ': '), a + ' must be an App action');
    }
  });
  test('both registers carry the folder status line', () => {
    assert.match(html, /id="soaEvidenceFolders"/);
    assert.match(html, /id="clauseEvidenceFolders"/);
  });
  test('the Documents view skips the Evidence root', () => {
    assert.match(graph, /f\.name === window\.CheckpointLib\.EVIDENCE_ROOT/);
    assert.equal(EVIDENCE_ROOT, 'Evidence');
  });
  test('scan evidence may replace a folder link, but never a person\'s', () => {
    assert.match(app, /c\.verifiedBy !== AUTO_EVIDENCE_TAG && !isEvidenceFolderUrl\(c\.evidenceUrl\)\) continue;/);
  });
});
