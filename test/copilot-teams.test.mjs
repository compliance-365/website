/* Checkpoint in Teams and Microsoft 365 Copilot: Teams digest cards that
   link straight to the item, links into a live tenant, the Copilot
   briefing Checkpoint writes, and the agent package. */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import Lib from '../public/checkpoint/lib.js';

const require = createRequire(import.meta.url);
const PM = require('../public/checkpoint/azure/PostureMonitor/index.js').__test;
const app = readFileSync(new URL('../public/checkpoint/app.js', import.meta.url), 'utf8');
const graph = readFileSync(new URL('../public/checkpoint/graph.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../public/checkpoint/index.html', import.meta.url), 'utf8');

/* Reads a STORE-method zip (lib buildZip) back into { name: text }. */
function unzip(bytes) {
  const b = Buffer.from(bytes), out = {};
  let i = 0;
  while (b.readUInt32LE(i) === 0x04034b50) {
    const size = b.readUInt32LE(i + 18), nameLen = b.readUInt16LE(i + 26), extra = b.readUInt16LE(i + 28);
    const name = b.slice(i + 30, i + 30 + nameLen).toString();
    const start = i + 30 + nameLen + extra;
    out[name] = b.slice(start, start + size);
    i = start + size;
  }
  return out;
}

describe('Teams digest', () => {
  test('each action and approval links straight to it in Checkpoint', () => {
    const card = PM.buildDigestTeamsCard({ score: 70, overdueActions: [{ ref: 'ACT-012', title: 'Enable MFA', days: 4, owner: 'K' }],
      dueSoonActions: [], openAlerts: [], awaitingApproval: ['Access Control Policy'], staleControls: 0 }, '2026-10-31', {});
    const c = card.attachments[0].content, text = JSON.stringify(c.body);
    assert.match(text, /\[\*\*ACT-012\*\*\]\(https:[^)]*\?view=actions&item=ACT-012\)/);
    assert.match(text, /\[Access Control Policy\]\(https:[^)]*\?view=documents\)/);
    assert.deepEqual(c.actions.map((a) => a.title), ['Open actions', 'Approve documents', 'Open Checkpoint']);
    assert.ok(c.actions.every((a) => a.type === 'Action.OpenUrl'));
  });
  test('an alert card keeps its single Open Checkpoint button', () => {
    const c = PM.buildTeamsCard('Drift', { text: 'x' }).attachments[0].content;
    assert.deepEqual(c.actions.map((a) => a.title), ['Open Checkpoint']);
  });
  test('link text cannot break the markdown link', () => {
    assert.match(JSON.stringify(PM.buildDigestTeamsCard({ score: 1, overdueActions: [], dueSoonActions: [], openAlerts: [], awaitingApproval: ['A [draft] policy'] }, 'd', {})), /\[A draft policy\]\(/);
  });
});

describe('links into a live tenant', () => {
  test('captured before sign-in, applied after load, only to reachable screens', () => {
    assert.match(app, /sessionStorage\.setItem\(DEEP_LINK_KEY/);
    assert.match(app, /else if \(Store\.kind === 'sharepoint' && !RESTRICTED_ACCESS\) applyDeepLink\(\);/);
    assert.match(app, /document\.querySelector\('\.nav-item\[data-v="' \+ view \+ '"\]'\)/);
    assert.match(app, /var DEEP_LINK_OPENERS = \{ actions: 'openAction', risks: 'openRisk', vendors: 'openVendor', scan: 'openCheck' \};/);
    assert.match(app, /replace\(\/\[\^A-Za-z0-9\|\._-\]\/g, ''\)/, 'the item id is sanitised');
  });
});

describe('Copilot briefing', () => {
  const d = { client: 'Acme', today: '2026-10-31', score: 62, scanDate: '2026-10-30',
    frameworks: [{ name: 'ISO 27001', applicable: 92, implemented: 40 }],
    overdue: [{ id: 'ACT-001', title: 'Enable MFA', owner: 'K. Patel', due: '2026-10-01' }],
    certs: [{ name: 'ISO 27001', body: 'BSI', next: 'surveillance audit 1', nextDue: '2027-03-01', expires: '2029-03-01' }],
    paths: Lib.attackPaths({ legacy: 'fail', admins: 'fail' }), checkLabels: { legacy: 'Legacy authentication blocked', admins: 'Global admin count within threshold' } };
  test('says when it was written and what is due, in plain sentences', () => {
    const lines = Lib.copilotBriefingSections(d).flatMap((s) => s.lines).join('\n');
    assert.match(lines, /Written by Checkpoint for Acme on 2026-10-31/);
    assert.match(lines, /ISO 27001: 40 of 92 applicable controls implemented\./);
    assert.match(lines, /ACT-001 Enable MFA was due on 2026-10-01 \(owner K\. Patel\)\./);
    assert.match(lines, /ISO 27001 is certified by BSI; the next audit is the surveillance audit 1, due by 2027-03-01; the certificate expires on 2029-03-01\./);
    assert.match(lines, /Password guessing to full tenant takeover \(Medium\): break it by fixing/);
  });
  test('an empty tenant still reads sensibly', () => {
    const lines = Lib.copilotBriefingSections({}).flatMap((s) => s.lines);
    assert.ok(lines.includes('No posture scan has been run yet.'));
    assert.ok(lines.includes('No actions are overdue.'));
  });
  test('is a Word document, in its own folder kept out of the document register', () => {
    const files = unzip(Lib.buildBriefingDocx({ client: 'Acme', date: '2026-10-31' }, Lib.copilotBriefingSections(d)));
    assert.deepEqual(Object.keys(files).sort(), ['[Content_Types].xml', '_rels/.rels', 'docProps/core.xml', 'word/_rels/document.xml.rels', 'word/document.xml', 'word/styles.xml']);
    assert.match(files['word/document.xml'].toString(), /Checkpoint briefing/);
    assert.equal(Lib.COPILOT_ROOT, 'Copilot briefing');
    assert.match(graph, /if \(f\.name === window\.CheckpointLib\.COPILOT_ROOT\) continue;/);
  });
  test('opt-in, refreshed after a scan and at most daily', () => {
    assert.match(app, /S\.settings\.copilotEnabled === 'true'/);
    assert.match(app, /refreshCopilotBriefing\(false\)\.catch\(warn\);/);
    assert.match(app, /20 \* 3600 \* 1000/);
    assert.match(html, /id="copilotRow"/);
  });
});

describe('Copilot agent package', () => {
  const files = unzip(Lib.buildCopilotAgentPackage({ id: '00000000-0000-4000-8000-000000000001', client: 'Acme', siteUrl: 'https://acme.sharepoint.com/sites/Checkpoint' },
    { color: new Uint8Array([137, 80, 78, 71]), outline: new Uint8Array([137, 80, 78, 71]) }));
  const manifest = JSON.parse(files['manifest.json']), agent = JSON.parse(files['declarativeAgent.json']);
  test('a Teams app with one declarative agent', () => {
    assert.deepEqual(Object.keys(files).sort(), ['color.png', 'declarativeAgent.json', 'manifest.json', 'outline.png']);
    assert.equal(manifest.manifestVersion, '1.19');
    assert.equal(manifest.id, '00000000-0000-4000-8000-000000000001');
    assert.deepEqual(manifest.copilotAgents.declarativeAgents, [{ id: 'checkpointAgent', file: 'declarativeAgent.json' }]);
    assert.ok(manifest.name.short.length <= 30 && manifest.description.short.length <= 80, 'Teams manifest length limits');
  });
  test('grounded on the Checkpoint site, told to cite the briefing date and never guess', () => {
    assert.deepEqual(agent.capabilities, [{ name: 'OneDriveAndSharePoint', items_by_url: [{ url: 'https://acme.sharepoint.com/sites/Checkpoint' }] }]);
    assert.match(agent.instructions, /Always say the date the briefing was written/);
    assert.match(agent.instructions, /never guess a status, date or owner/);
    assert.ok(agent.instructions.length <= 8000);
    assert.ok(agent.conversation_starters.length >= 1 && agent.conversation_starters.length <= 6);
  });
});
