// Everything feeds the leadership meeting: threat intel, incidents and
// supplier questionnaires reach the agenda, and incidents and supplier
// gaps attach to the business risk they belong to instead of adding a
// risk each. Also: one word for suppliers, and the Trust Center shows
// the leadership rhythm from the records.
import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const L = require('../public/checkpoint/lib.js');
const Az = require('../public/checkpoint/azure/lib/securityReview.js');
const html = readFileSync(new URL('../public/checkpoint/index.html', import.meta.url), 'utf8');
const app = readFileSync(new URL('../public/checkpoint/app.js', import.meta.url), 'utf8');
const today = '2026-10-09';

describe('threat intel in the pack', () => {
  const ranked = [
    { cveId: 'CVE-1', vendor: 'Microsoft', product: 'Exchange', matchedStack: true, dueDate: '2026-10-01', knownRansomwareUse: true },
    { cveId: 'CVE-2', vendor: 'Citrix', product: 'NetScaler', matchedStack: true, dueDate: '2026-11-01' },
    { cveId: 'CVE-3', vendor: 'Fortinet', product: 'FortiOS', matchedStack: false }
  ];
  const triage = { 'CVE-2': { status: 'affected', actionId: 'ACT-009' } };
  const actions = [{ id: 'ACT-009', status: 'Open' }];
  test('affected, open remediation, relevant and unassessed, past fix-by', () => {
    const t = L.threatIntelPackSummary(L.threatIntelTriage(ranked, triage, today), triage, actions);
    assert.deepEqual([t.affected, t.remediationOpen, t.awaiting, t.pastDue, t.ransomwareOpen], [1, 1, 1, 1, 1]);
    assert.equal(t.top[0].cveId, 'CVE-1');
  });
  test('without the feed, the assessments recorded still count', () => {
    const t = L.threatIntelPackSummary(null, triage, [{ id: 'ACT-009', status: 'Done' }]);
    assert.deepEqual([t.affected, t.remediationOpen, t.awaiting, t.loaded], [1, 0, 0, false]);
  });
  test('it shows under Security posture, keeps the item off the quiet list, and gets a traffic light', () => {
    const threat = L.threatIntelPackSummary(L.threatIntelTriage(ranked, triage, today), triage, actions);
    const p = L.buildSecurityReviewPack({ today, threat, scans: [{ date: '2026-09-01', score: 70 }, { date: '2026-10-01', score: 70 }] });
    const facts = L.securityReviewFacts('posture', p).join('\n');
    assert.match(facts, /Threat intel: 1 exploited vulnerability affects us, 1 remediation action open/);
    assert.match(facts, /1 advisory relevant to us not yet assessed, 1 past CISA’s fix-by date/);
    assert.equal(L.securityReviewQuiet('posture', p), '', 'not "nothing to report"');
    const st = L.securityReviewStatus(p).find((x) => x.key === 'threat');
    assert.equal(st.rag, 'red');
  });
});

describe('incidents and the business risk they belong to', () => {
  test('the business risk is chosen by category, then by what happened', () => {
    assert.equal(L.incidentRiskKey({ category: 'Security', title: 'Phishing email led to one compromised mailbox' }), 'biz-account-takeover');
    assert.equal(L.incidentRiskKey({ category: 'Physical', title: 'Laptop left on a train' }), 'biz-device');
    assert.equal(L.incidentRiskKey({ category: 'Privacy', title: 'Customer list emailed to the wrong external recipient' }), 'biz-privacy');
    assert.equal(L.incidentRiskKey({ category: 'Third party', title: 'Supplier breach' }), 'biz-third-party');
    assert.equal(L.incidentRiskKey({ category: 'Security', title: 'Ransomware on a file server' }), 'biz-attack-undetected');
  });
  test('the risk already in the register is suggested, not a new one', () => {
    const risks = [{ id: 'R-007', tpl: 'biz-device', status: 'Open', title: 'Devices lost' }, { id: 'R-008', tpl: 'biz-device', status: 'Closed' }];
    const s = L.incidentRiskSuggestion({ category: 'Physical', title: 'Laptop lost' }, risks);
    assert.equal(s.existing.id, 'R-007');
    assert.equal(L.incidentRiskSuggestion({ category: 'Privacy', title: 'x' }, risks).existing, null);
  });
  test('the agenda names the risk, and counts incidents with none', () => {
    const p = L.buildSecurityReviewPack({ today, since: '2026-09-01', incidents: [
      { id: 'INC-1', title: 'Phish', severity: 'High', detected: '2026-09-20', status: 'Open', riskRefs: ['R-003'] },
      { id: 'INC-2', title: 'Laptop', severity: 'Medium', detected: '2026-09-25', status: 'Open' }] });
    const f = L.securityReviewFacts('incidents', p).join('\n');
    assert.match(f, /INC-1 Phish \(High\): risk R-003/);
    assert.match(f, /1 incident not linked to a risk/);
  });
});

describe('supplier questionnaire gaps', () => {
  const v = { id: 'VEN-003', name: 'Lumen Legal', questionnaireAnswers: { certification: 'No', encryption: 'Yes', mfa: 'Unknown', incidentResponse: 'Yes' } };
  test('an explicit No or Unknown on a security question is a gap', () => {
    const g = L.supplierQuestionnaireGaps(v.questionnaireAnswers);
    assert.deepEqual(g.map((x) => x.id), ['certification', 'mfa']);
    assert.ok(g[1].unconfirmed && /^not confirmed: /.test(g[1].text));
    assert.deepEqual(L.supplierQuestionnaireGaps({ certification: 'Yes', encryption: 'Yes', mfa: 'Yes', incidentResponse: 'Yes' }), []);
  });
  test('treated once an action names the supplier’s questionnaire', () => {
    assert.equal(L.supplierGapStatus([v], [])[0].treated, false);
    const st = L.supplierGapStatus([v], [{ id: 'ACT-1', src: 'Supplier questionnaire VEN-003', status: 'Open' }])[0];
    assert.equal(st.actionId, 'ACT-1');
    assert.equal(L.supplierGapStatus([v], [{ id: 'ACT-1', src: 'Supplier questionnaire VEN-003', status: 'Done' }])[0].treated, true);
  });
  test('untreated gaps are on the agenda, and the item is not quiet', () => {
    const p = L.buildSecurityReviewPack({ today, vendors: [v] });
    assert.deepEqual(p.people.supplierGaps, [{ id: 'VEN-003', name: 'Lumen Legal', count: 2 }]);
    assert.match(L.securityReviewFacts('people', p).join('\n'), /Questionnaire gaps not yet treated: Lumen Legal \(2\)/);
    assert.equal(L.securityReviewQuiet('people', p), '');
  });
  test('treatment goes to the third-party business risk, and the supplier is linked to it', () => {
    assert.match(app, /treatSupplierGaps: async function[\s\S]*?r\.tpl === 'biz-third-party'[\s\S]*?supplier\|third[\s\S]*?ensureBusinessRisk\('biz-third-party'/);
    assert.match(app, /v\.riskRefs = \(v\.riskRefs \|\| \[\]\)\.concat\(\[tp\.id\]\)/);
  });
});

describe('one word for suppliers', () => {
  test('the screens say supplier, never vendor', () => {
    const visible = html.replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]+>/g, ' ');
    assert.ok(!/\bvendors?\b/i.test(visible), 'no "vendor" in the page text');
    for (const m of html.matchAll(/(placeholder|aria-label|title)="([^"]*)"/g)) assert.ok(!/\bvendors?\b/i.test(m[2]), m[0]);
  });
  test('audit entries from before the change still count', () => {
    const log = [{ action: 'Vendor added', targetType: 'Vendor', entryDateTime: '2026-09-15T00:00:00Z' }, { action: 'Supplier added', targetType: 'Vendor', entryDateTime: '2026-09-20T00:00:00Z' }];
    assert.equal(L.buildSecurityReviewPack({ today, since: '2026-09-01', auditLog: log }).people.vendorsAdded, 2);
  });
  test('the scheduled function still decides the same way', () => {
    for (const k of ['securityReviewFacts', 'securityReviewQuiet', 'securityReviewStatus']) assert.equal(String(Az[k]), String(L[k]), k);
  });
});

describe('Trust Center', () => {
  test('leadership reviewing security monthly, from the meetings held', () => {
    const base = { today, company: 'Acme', show: { activity: true }, frameworks: [], certs: {}, documents: [], vendors: [], answers: [] };
    const m = L.trustCenterModel(Object.assign({}, base, { activity: { leadershipMeetings: ['2026-08-11', '2026-09-08'], supplierReview: '2026-07-01' } }));
    assert.ok(m.activity.some((a) => a.label === 'Security reviewed by leadership' && a.when === 'Monthly'));
    assert.ok(m.activity.some((a) => a.label === 'Supplier security reviews'));
    const one = L.trustCenterModel(Object.assign({}, base, { activity: { leadershipMeetings: ['2026-09-08'] } }));
    assert.ok(!one.activity.some((a) => a.label === 'Security reviewed by leadership'), 'one meeting is not a rhythm');
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

describe('in the browser', { skip: skipReason || false }, () => {
  test('link an incident to its risk, treat supplier gaps, and see both in the meeting', async () => {
    const page = await browser.newPage({ viewport: { width: 1300, height: 950 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(baseUrl + '/checkpoint/index.html?demo=1', { waitUntil: 'networkidle' });

    // Incident → risk: the device business risk is offered.
    await page.evaluate(() => window.App.openIncident('INC-0002'));
    assert.match(await page.locator('#drawer').innerText(), /Not linked to a risk yet/);
    await page.click('#drawer [data-action="App.linkIncidentRisk"]');
    await page.waitForSelector('#modalBox select');
    const chosen = await page.locator('#modalBox select').first().inputValue();
    assert.match(chosen, /^(R-\d+|new:biz-device)$/);
    await page.locator('#modalBox .m-btns .btn:not(.ghost)').click();
    await page.waitForTimeout(300);
    const inc = await page.locator('#drawer').innerText();
    const rid = (inc.match(/\b(R-\d{3})\b/) || [])[1];
    assert.ok(rid, 'linked: ' + inc.slice(0, 300));
    await page.evaluate((id) => window.App.openRisk(id), rid);
    assert.match(await page.locator('#drawer').innerText(), /Incidents \(it happened\)[\s\S]*INC-0002/i);

    // Supplier gaps: recording answers with gaps offers the treatment
    // straight away, as one action against the supplier risk.
    await page.evaluate(() => { window.App.openVendor('VEN-003'); window.App.recordVendorQuestionnaire('VEN-003'); });
    await page.waitForSelector('#modalBox select');
    await page.getByLabel(/Current independent security certification/).selectOption('No');
    await page.getByLabel(/Is MFA enforced/).selectOption('Unknown');
    await page.locator('#modalBox .m-btns .btn:not(.ghost)').click();
    await page.waitForSelector('#modalBox h3:has-text("questionnaire gap")');
    assert.match(await page.locator('#modalBox').innerText(), /No current independent security certification[\s\S]*Not confirmed: MFA/i);
    assert.equal(await page.locator('#modalBox select').first().inputValue(), 'R-001', 'the supplier risk already in the register, not a new one');
    await page.locator('#modalBox .m-btns .btn:not(.ghost)').click();
    await page.waitForTimeout(400);
    await page.evaluate(() => window.App.openVendor('VEN-003'));
    assert.match(await page.locator('#drawer').innerText(), /Questionnaire gaps[\s\S]*No current independent security certification/i);
    assert.match(await page.locator('#drawer').innerText(), /Being treated: ACT-\d+/);
    assert.match(await page.locator('#drawer').innerText(), /R-001/, 'linked to the third-party risk');

    // The meeting: gaps treated drop off; the threat intel line is there.
    await page.evaluate(() => { window.App.closeDrawer(); window.App.go('reviews'); });
    await page.click('#secReviewCard button[data-action="App.openSecurityReview"]');
    if (await page.locator('#drawer button[data-action="App.prepareSecurityReview"]').count()) await page.click('#drawer button[data-action="App.prepareSecurityReview"]');
    await page.waitForSelector('#drawer button[data-action="App.recordSecurityReview"]');
    await page.click('#drawer button[data-action="App.recordSecurityReview"]');
    await page.waitForTimeout(300);
    const minutes = await page.locator('#drawer').innerText();
    assert.ok(!/Questionnaire gaps not yet treated: Lumen/.test(minutes));
    assert.match(minutes, /INC-0002[\s\S]*risk R-\d{3}/);
    assert.deepEqual(errors, []);
    await page.close();
  });
});
