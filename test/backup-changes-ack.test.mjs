// Weekly backup, the ISMS change log, policy acknowledgement nudges,
// bulk import with column matching and duplicates, and the phone-width
// accessibility pass.
import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const L = require('../public/checkpoint/lib.js');
const BK = require('../public/checkpoint/azure/lib/backup.js');
const ACK = require('../public/checkpoint/azure/lib/acknowledgements.js');
const SRA = require('../public/checkpoint/azure/lib/securityReview.js');
const PM = require('../public/checkpoint/azure/PostureMonitor/index.js').__test;

describe('the Function copies match the browser', () => {
  test('backup, acknowledgement and chair summary code is identical', () => {
    for (const k of ['buildZip', 'toCsv', 'backupStrip', 'backupSafeSettings', 'backupFileName', 'buildBackupFiles', 'backupsToPrune', 'backupDue']) assert.equal(String(BK[k]), String(L[k]), k);
    assert.equal(BK.BACKUP_ROOT, L.BACKUP_ROOT);
    for (const k of ['attestationCampaigns', 'attestationsToChase', 'addDaysIso']) assert.equal(String(ACK[k]), String(L[k]), k);
    assert.equal(String(SRA.chairSummary), String(L.chairSummary));
  });
});

describe('weekly backup', () => {
  const files = L.buildBackupFiles({
    created: '2026-10-08', source: 'scheduled', client: 'Acme', appVersion: '1.136.0',
    registers: { risks: [{ id: 'R-001', title: 'Phishing', _sp: 12, '@odata.etag': 'x' }], actions: [] },
    settings: { clientDisplayName: 'Acme', teamsWebhookUrl: 'https://secret', aiApiKey: 'k', vendorTokenSecret: 's', backupKeep: '13' },
    evidence: [{ framework: 'iso27001', ref: 'A.5.1', title: 'Policies', status: 'Implemented', url: 'https://sp/e', verified: '2026-09-01' }, { framework: 'iso27001', ref: '9.2', title: 'Internal audit', status: 'Not started', url: '' }],
    csvs: [{ name: 'registers/risks.csv', content: 'ID\r\nR-001' }]
  });
  test('a README, the full JSON without secrets or SharePoint plumbing, an evidence index and the CSVs', () => {
    assert.deepEqual(files.map((f) => f.name), ['README.txt', 'checkpoint-backup.json', 'evidence-index.csv', 'registers/risks.csv']);
    const json = JSON.parse(files[1].content);
    assert.equal(json.format, 'checkpoint-backup');
    assert.deepEqual(json.registers.risks, [{ id: 'R-001', title: 'Phishing' }]);
    assert.deepEqual(json.counts, { risks: 1, actions: 0 });
    assert.deepEqual(Object.keys(json.settings).sort(), ['backupKeep', 'clientDisplayName']);
    assert.match(files[0].content, /Acme[\s\S]*weekly scheduled backup[\s\S]*1 of 2 have one[\s\S]*Import CSV/);
    assert.match(files[2].content, /^Framework,Control or clause,Title,Status,Evidence link,Last verified\r\niso27001,A\.5\.1,Policies,Implemented,https:\/\/sp\/e,2026-09-01/);
  });
  test('it zips into a file every unzip tool opens', () => {
    const zip = Buffer.from(L.buildZip(files));
    assert.equal(zip.readUInt32LE(0), 0x04034b50);
    assert.equal(zip.readUInt32LE(zip.length - 22), 0x06054b50);
    assert.equal(zip.readUInt16LE(zip.length - 12), 4, 'four entries');
  });
  test('weekly, can be switched off, and keeps the newest 13', () => {
    assert.equal(L.backupDue({}, '2026-10-08'), true);
    assert.equal(L.backupDue({ backupLastRun: '2026-10-02' }, '2026-10-08'), false);
    assert.equal(L.backupDue({ backupLastRun: '2026-10-01' }, '2026-10-08'), true);
    assert.equal(L.backupDue({ backupEnabled: 'false' }, '2026-10-08'), false);
    const names = Array.from({ length: 15 }, (_, i) => 'checkpoint-backup-2026-' + String(i + 1).padStart(2, '0').replace(/^(\d\d)$/, (m) => (Number(m) > 12 ? '12' : m)) + '-' + String(i + 1).padStart(2, '0') + '.zip');
    const prune = L.backupsToPrune(names.concat(['notes.docx', 'checkpoint-backup-2026-12-31-manual.zip']), 13);
    assert.equal(prune.length, 3);
    assert.ok(!prune.includes('notes.docx'), 'never touches anything else');
    assert.ok(!prune.includes('checkpoint-backup-2026-12-31-manual.zip'), 'the newest stays');
    assert.deepEqual(L.backupsToPrune(names, 0), [], '0 keeps everything');
    assert.equal(L.backupFileName('2026-10-08', 'manual'), 'checkpoint-backup-2026-10-08-manual.zip');
  });

  test('the scheduled monitor writes it into the Documents library and tidies old copies', async () => {
    const calls = [], uploads = [], settings = {};
    const kids = Array.from({ length: 14 }, (_, i) => ({ id: 'K' + i, name: 'checkpoint-backup-2026-0' + (i % 9 + 1) + '-' + String(10 + i) + '.zip' }));
    const g = async (path, opts = {}) => {
      calls.push((opts.method || 'GET') + ' ' + path);
      if (path.includes('/lists?$select=id,displayName,list')) return { value: [{ id: 'RISKS', displayName: 'Checkpoint Risks', list: { template: 'genericList' } }, { id: 'CTRL', displayName: 'Checkpoint Controls', list: { template: 'genericList' } }, { id: 'DOCS', displayName: 'Checkpoint Documents', list: { template: 'documentLibrary' } }, { id: 'SET', displayName: 'Checkpoint Settings', list: { template: 'genericList' } }, { id: 'OTHER', displayName: 'Team calendar' }] };
      if (path.includes('/lists/DOCS?$expand=drive')) return { drive: { id: 'DRV' } };
      if (path.includes('createUploadSession')) return { uploadUrl: 'https://upload.example/session' };
      if (path.includes('/lists/SET/items?$expand=fields')) return { value: [] };
      if (path.includes('/lists/SET/items') && opts.method === 'POST') { settings[opts.body.fields.SettingKey] = opts.body.fields.SettingValue; return {}; }
      if (opts.method === 'DELETE') return null;
      throw new Error('unexpected ' + path);
    };
    const gAll = async (path) => {
      if (path.includes('/lists/RISKS/items')) return [{ fields: { RefId: 'R-001', Title: 'Phishing', _UIVersionString: '1.0', '@odata.etag': 'x' } }];
      if (path.includes('/lists/CTRL/items')) return [{ fields: { Code: 'A.5.1', Framework: 'iso27001', Applicable: true, Status: 'Implemented', EvidenceUrl: 'https://sp/e' } }, { fields: { Code: 'A.7.1', Applicable: false } }];
      if (path.includes('/drives/DRV/root/children')) return [];
      if (path.includes('Checkpoint%20backups')) return kids;
      throw new Error('unexpected gAll ' + path);
    };
    const realFetch = globalThis.fetch;
    globalThis.fetch = async (url, init) => { uploads.push({ url, range: init.headers['Content-Range'], bytes: Buffer.from(init.body) }); return { ok: true, status: 201, text: async () => '' }; };
    try {
      const name = await PM.runWeeklyBackup(g, gAll, { log: Object.assign(() => {}, { error: () => {} }) }, 'SITE', { Settings: 'SET' }, { Documents: 'DOCS' }, { clientDisplayName: 'Acme', backupKeep: '13', teamsWebhookUrl: 'https://hooks.example/secret' }, '2026-10-08');
      assert.equal(name, 'checkpoint-backup-2026-10-08.zip');
      assert.ok(calls.some((c) => c.includes('/drives/DRV/root:/Checkpoint%20backups/checkpoint-backup-2026-10-08.zip:/createUploadSession')));
      assert.equal(uploads.length, 1);
      const zip = uploads[0].bytes;
      assert.equal(uploads[0].range, 'bytes 0-' + (zip.length - 1) + '/' + zip.length);
      const text = zip.toString('utf8');
      assert.match(text, /"Risks": \[/);
      assert.ok(!/_UIVersionString|odata/.test(text), 'SharePoint plumbing left out');
      assert.ok(!text.includes('hooks.example'), 'no secrets, and the raw Settings list is not copied');
      assert.match(text, /"clientDisplayName": "Acme"/);
      assert.match(text, /iso27001,A\.5\.1,,Implemented,https:\/\/sp\/e/);
      assert.ok(!/A\.7\.1/.test(text.split('evidence-index.csv')[2] || ''), 'excluded controls are not in the evidence index');
      assert.equal(settings.backupLastRun, '2026-10-08');
      assert.equal(calls.filter((c) => c.startsWith('DELETE')).length, 1, '14 old + the newest are kept to 13');
      assert.equal(await PM.runWeeklyBackup(g, gAll, { log: () => {} }, 'SITE', { Settings: 'SET' }, { Documents: 'DOCS' }, { backupLastRun: '2026-10-05' }, '2026-10-08'), '', 'not due');
    } finally { globalThis.fetch = realFetch; }
  });
});

describe('ISMS change log', () => {
  const e = (d, action, targetType, targetId, after) => ({ entryDateTime: d + 'T09:00:00Z', action, targetType, targetId, after: after || '' });
  const log = [
    e('2026-07-01', 'Policy document approved', 'Document', 'Access Control Policy.html', 'Approved v1.1'),
    e('2026-08-02', 'Vendor added', 'Vendor', 'VEN-004', 'Xero (High)'),
    e('2026-08-03', 'Risk added manually', 'Risk', 'R-010', 'Ransomware'),
    e('2026-08-04', 'Document details changed', 'Document', 'Backup Procedure.html', 'IT | 2.0 | Approved | 2027-08-01 | CEO'),
    e('2026-08-05', 'Document details changed', 'Document', 'Draft.html', 'IT | 0.1 | Draft |  | '),
    e('2026-08-06', 'Register exported (CSV)', 'Export', 'risks', 'risks.csv'),
    e('2026-08-07', 'Leaver hand-over', 'Person', 'J. Smith', '4 records to A. Lee'),
    e('2026-08-08', 'Scope answer changed', 'Setting', 'orgSites', 'Perth, Brisbane')
  ];
  test('groups what changed, leaves housekeeping out, and respects the period', () => {
    const c = L.ismsChangeLog(log, '2026-08-01', '2026-08-31');
    assert.equal(c.total, 5);
    assert.deepEqual(c.groups.map((g) => g.key), ['scope', 'policies', 'risks', 'suppliers', 'people']);
    assert.match(c.groups[1].items[0].text, /Document details changed: Backup Procedure/);
    const lines = L.ismsChangeLines(c);
    assert.equal(lines[1], 'Policies and documents: 1 change (Backup Procedure)');
    assert.equal(L.ismsChangeLog(log, '2026-07-01').total, 6);
  });
  test('the chair reads how much changed this month', () => {
    const p = { actions: { overdue: 0, open: 2, closedSince: 0, stuck: [] }, incidents: { count: 0, since: [] }, posture: { score: null }, risks: { aboveAppetite: 0 }, since: '2026-08-01', certification: null };
    const sum = L.chairSummary(p, { changes: L.ismsChangeLog(log, '2026-08-01') });
    assert.ok(sum.trend.some((t) => /^5 changes to the security programme this month, mostly /.test(t)));
  });
});

describe('policy acknowledgement', () => {
  const docs = [{ id: '1', name: 'Access Control Policy.html', version: '1.1', approvalDate: '2026-09-01' }, { id: '2', name: 'AI Policy.html', version: '1.0', approvalDate: '2026-08-01' }, { id: '3', name: 'Incident Policy.html', version: '2.0' }];
  const row = (campaign, docName, docVersion, upn, status, assigned) => ({ id: 'ATT-' + upn + campaign, campaign, docName, docVersion, upn, userName: upn.toUpperCase(), assigned, status, acknowledged: status === 'Acknowledged' ? assigned : '' });
  const rows = [
    row('CAMP-1', 'Access Control Policy.html', '1.0', 'ann@x', 'Acknowledged', '2026-01-10'),
    row('CAMP-2', 'Incident Policy.html', '2.0', 'ann@x', 'Assigned', '2026-09-20'),
    row('CAMP-2', 'Incident Policy.html', '2.0', 'bob@x', 'Acknowledged', '2026-09-20'),
    row('CAMP-3', 'AI Policy.html', '0.9', 'bob@x', 'Assigned', '2026-10-05')
  ];
  test('a new version replaces what staff acknowledged; a policy never sent is flagged too', () => {
    const w = L.policiesNeedingAcknowledgement(docs, rows);
    assert.deepEqual(w.map((x) => [x.name, x.reason, x.previousVersion]), [['Access Control Policy.html', 'changed', '1.0'], ['AI Policy.html', 'changed', '0.9']]);
    assert.deepEqual(L.policiesNeedingAcknowledgement([{ id: '9', name: 'New.html', version: '1.0' }], rows).map((x) => x.reason), ['new']);
  });
  test('chased a week after sending, then weekly, until it reaches 100%', () => {
    assert.deepEqual(L.attestationsToChase(rows, '2026-10-08', {}).map((c) => c.campaign), ['CAMP-2'], 'CAMP-3 is only 3 days old; CAMP-1 is complete');
    assert.deepEqual(L.attestationsToChase(rows, '2026-10-08', { 'CAMP-2': '2026-10-04' }), [], 'chased four days ago');
    assert.equal(L.attestationsToChase(rows, '2026-10-08', { 'CAMP-2': '2026-10-01' }).length, 1);
    const people = ACK.ackChaseByPerson(L.attestationsToChase(rows, '2026-10-20', {}));
    assert.deepEqual(people.map((p) => [p.upn, p.policies.map((x) => x.name)]).sort(), [['ann@x', ['Incident Policy']], ['bob@x', ['AI Policy']]]);
    const html = ACK.ackChaseHtml({ name: '<Ann>', policies: [{ name: 'A<b>', version: '1', url: 'javascript:alert(1)' }] }, 'Acme', 'https://app');
    assert.ok(!html.includes('<Ann>') && !html.includes('A<b>') && !html.includes('javascript:'), 'escaped, and only https links');
    assert.ok(html.includes('&lt;Ann&gt;') && html.includes('A&lt;b&gt;'));
  });
  test('Do next asks for policies not yet sent', () => {
    const list = L.dashDoNext({ ackWaiting: ['Access Control Policy.html'] });
    assert.equal(list[0].title, '1 approved policy has not been sent to staff');
    assert.equal(list[0].id, 'attestations');
  });
  test('the monitor emails each person once, skips leavers and records the chase', async () => {
    const sent = [], settings = {};
    const prev = process.env.NOTIFY_FROM; process.env.NOTIFY_FROM = 'isms@acme.example';
    const fields = (r) => ({ fields: { RefId: r.id, Campaign: r.campaign, DocName: r.docName, DocVersion: r.docVersion, UserUpn: r.upn, UserName: r.userName, AssignedDate: r.assigned, Status: r.status } });
    const all = rows.concat([row('CAMP-2', 'Incident Policy.html', '2.0', 'gone@x', 'Assigned', '2026-09-20')]);
    const gAll = async (p) => p.includes('/lists/ATT/') ? all.map(fields) : [{ userPrincipalName: 'ann@x', accountEnabled: true }, { userPrincipalName: 'bob@x', accountEnabled: true }, { userPrincipalName: 'gone@x', accountEnabled: false }];
    const g = async (p, o = {}) => {
      if (p.includes('/sendMail')) { sent.push(o.body.message.toRecipients[0].emailAddress.address); return null; }
      if (p.includes('/lists/SET/items?$expand')) return { value: [] };
      if (p.includes('/lists/SET/items')) { settings[o.body.fields.SettingKey] = o.body.fields.SettingValue; return {}; }
      throw new Error(p);
    };
    try {
      const n = await PM.chaseAcknowledgements(g, gAll, { log: Object.assign(() => {}, { error: () => {} }) }, 'SITE', { Settings: 'SET' }, { Attestations: 'ATT' }, {}, '2026-10-08');
      assert.equal(n, 1);
      assert.deepEqual(sent, ['ann@x']);
      assert.deepEqual(JSON.parse(settings.attestChaseLog), { 'CAMP-2': '2026-10-08' });
      assert.equal(await PM.chaseAcknowledgements(g, gAll, { log: () => {} }, 'SITE', { Settings: 'SET' }, { Attestations: 'ATT' }, { attestChaseEnabled: 'false' }, '2026-10-08'), 0);
    } finally { if (prev === undefined) delete process.env.NOTIFY_FROM; else process.env.NOTIFY_FROM = prev; }
  });
});

describe('bulk import', () => {
  const spec = { label: 'Vendors', dupKey: 'Vendor', columns: [{ key: 'Vendor', aliases: ['Name', 'Supplier'], required: true }, { key: 'Criticality', aliases: ['Tier'] }, { key: 'Owner' }] };
  const csv = 'Company name,Risk tier,Relationship lead\nXero,High,Ann\nMicrosoft,Critical,Bob\nxero ,Low,Cy\nSlack,Medium,Dee\n';
  test('headings that do not match are matched by the person, with a best guess', () => {
    const first = L.planCsvImport(csv, spec);
    assert.deepEqual(first.missingRequired, ['Vendor']);
    assert.deepEqual(first.headers, ['Company name', 'Risk tier', 'Relationship lead']);
    const guess = L.guessImportMapping(first.headers, spec);
    assert.deepEqual(guess, { Vendor: 0, Criticality: 1, Owner: -1 }, '"Company name" holds a name; nothing looks like an owner');
    const plan = L.planCsvImport(csv, spec, { mapping: { Vendor: 0, Criticality: 1, Owner: 2 }, existing: ['Microsoft'] });
    assert.equal(plan.error, undefined);
    assert.deepEqual(plan.ready.map((r) => r.rec.Vendor), ['Xero', 'Slack']);
    assert.deepEqual(plan.duplicates.map((d) => [d.line, d.reason]), [[3, 'already in the register'], [4, 'repeats line 2 of this file']]);
    assert.equal(plan.ready[0].rec.Owner, 'Ann');
  });
  test('a mapping of "not in this file" leaves the column out, and a matching file still imports without one', () => {
    const plan = L.planCsvImport('Company name,Tier,Owner\nXero,High,Ann\n', spec, { mapping: { Vendor: 0, Owner: -1 } });
    assert.equal(plan.ready[0].rec.Vendor, 'Xero');
    assert.equal(plan.ready[0].rec.Owner, undefined, 'the person said Owner is not in this file');
    assert.equal(plan.ready[0].rec.Criticality, 'High', 'aliases still apply to the rest');
    const plain = L.planCsvImport('Name,Tier\nXero,High\n', spec);
    assert.deepEqual(plain.ready.map((r) => r.rec), [{ Vendor: 'Xero', Criticality: 'High' }]);
  });
});

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

async function reportText(doc) {
  const parts = [];
  for (const f of doc.frames()) parts.push(await f.evaluate(() => document.body ? document.body.innerText : ''));
  return parts.join('\n');
}

describe('in the browser', { skip: skipReason || false }, () => {
  test('backup, change log, acknowledgement chase and import buttons', async () => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(baseUrl + '/checkpoint/index.html?demo=1', { waitUntil: 'networkidle' });
    // Back up now, in demo, downloads the zip.
    const dl = page.waitForEvent('download');
    await page.evaluate(() => window.App.backupNow());
    assert.match((await dl).suggestedFilename(), /^checkpoint-backup-\d{4}-\d{2}-\d{2}-manual\.zip$/);
    await page.evaluate(() => window.App.go('settings'));
    assert.match(await page.locator('#backupStatus').innerText(), /Weekly backup is on/);
    // The change log opens from the management review page.
    await page.evaluate(() => window.App.go('reviews'));
    const popup = context.waitForEvent('page');
    await page.click('#v-reviews [data-id="changelog"]');
    const doc = await popup; await doc.waitForLoadState(); await doc.waitForTimeout(300);
    assert.match(await reportText(doc), /ISMS change log[\s\S]*Clause 9\.3\.2 b/);
    await doc.close();
    // Acknowledgements: the weekly chase switch, and import on every register people arrive with.
    await page.evaluate(() => window.App.go('attestations'));
    assert.match(await page.locator('#ackChaseToggle').innerText(), /Weekly reminders/);
    for (const v of ['risks', 'actions', 'vendors', 'assets']) assert.equal(await page.locator('[data-action="App.importCsv"][data-id="' + v + '"]').count(), 1, v);
    assert.deepEqual(errors, []);
    await context.close();
  });

  test('at phone width: nothing scrolls the page sideways, wide tables are reachable by keyboard, every control has a name', async () => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(baseUrl + '/checkpoint/index.html?demo=1', { waitUntil: 'networkidle' });
    for (const v of ['dash', 'mytasks', 'risks', 'actions', 'soa', 'clauses', 'vendors', 'assets', 'documents', 'attestations', 'reviews', 'audits', 'reports', 'settings', 'integrations']) {
      await page.evaluate((x) => window.App.go(x), v);
      await page.waitForTimeout(450);
      const r = await page.evaluate(() => {
        const view = document.querySelector('.view.on');
        const unreachable = [], unnamed = [], small = [];
        view.querySelectorAll('*').forEach((el) => {
          const cs = getComputedStyle(el);
          if ((cs.overflowX === 'auto' || cs.overflowX === 'scroll') && el.offsetParent && el.scrollWidth > el.clientWidth + 2 && el.querySelector('table') && !(el.tabIndex >= 0 && el.getAttribute('aria-label'))) unreachable.push(el.className || el.id);
        });
        view.querySelectorAll('button, input:not([type=hidden]), select, textarea').forEach((el) => {
          if (!el.offsetParent) return;
          const lb = el.getAttribute('aria-labelledby');
          const name = (el.getAttribute('aria-label') || (lb && document.getElementById(lb) && document.getElementById(lb).textContent) || el.textContent || el.title || (el.id && document.querySelector('label[for="' + el.id + '"]') && document.querySelector('label[for="' + el.id + '"]').textContent) || (el.closest('label') && el.closest('label').textContent) || '').trim();
          if (!name) unnamed.push(el.outerHTML.slice(0, 100));
          if (el.matches('table input[type=checkbox], button.lnk')) { const b = el.getBoundingClientRect(); if (b.height < 24 || b.width < 24) small.push(el.outerHTML.slice(0, 80)); }
        });
        return { overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth, unreachable, unnamed, small };
      });
      assert.equal(r.overflow, 0, v + ': page scrolls sideways');
      assert.deepEqual(r.unreachable, [], v + ': wide table not reachable by keyboard');
      assert.deepEqual(r.unnamed, [], v + ': control without an accessible name');
      assert.deepEqual(r.small, [], v + ': touch target under 24px');
    }
    assert.deepEqual(errors, []);
    await context.close();
  });
});
