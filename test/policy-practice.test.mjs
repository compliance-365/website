/* Document what you do, do what you document (1.114.0): frequencies come
   from the organisation's own calendar and settings, statements are
   tailored to its answers and confirmed at approval, each framework
   sees only its own documents, and drift between documents and
   practice is flagged. */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import Lib from '../public/checkpoint/lib.js';

const require = createRequire(import.meta.url);
global.window = global.window || {};
window.CHECKPOINT_CONFIG = window.CHECKPOINT_CONFIG || { scopesProvision: [] };
require('../public/checkpoint/store.js');
require('../public/checkpoint/templates.js');
const T = window.POLICY_TEMPLATES;
const app = readFileSync(new URL('../public/checkpoint/app.js', import.meta.url), 'utf8');
const store = readFileSync(new URL('../public/checkpoint/store.js', import.meta.url), 'utf8');
const cal = (category, freq, extra) => Object.assign({ category, freq, status: 'Active', notes: '' }, extra || {});

describe('frequencies come from the organisation, not the template', () => {
  test('no statement or review line prescribes a fixed frequency (statutory deadlines aside)', () => {
    const fixed = /\b(at least (annually|quarterly|monthly|weekly)|every (six|three) months|quarterly|annually|monthly|weekly|\d+ days)\b/i;
    const hits = [];
    T.forEach((t) => {
      t.policyStatements.forEach((s) => { if (typeof s.rule === 'string' && fixed.test(s.rule)) hits.push(t.id + ': ' + s.rule.match(fixed)[0]); });
      if (fixed.test(t.reviewCadence || '')) hits.push(t.id + ' review line');
      (t.roles || []).forEach((r) => { if (fixed.test(r.responsibility || '')) hits.push(t.id + ' role'); });
    });
    // The Privacy Act's 30-day breach assessment and access-request period are law, not a choice.
    assert.deepEqual(hits, ['privacy-management-plan: 30 days', 'privacy-management-plan: 30 days']);
  });

  test('every frequency token names a known source', () => {
    const json = JSON.stringify(T);
    const used = [...json.matchAll(/\{\{(?:cadence|Interval):([a-z-]+)\}\}/g)].map((m) => m[1]);
    assert.ok(used.length > 60);
    used.forEach((k) => assert.ok(Lib.CADENCES[k], k));
  });

  test('a calendar-backed frequency says what is scheduled, or that the organisation sets it', () => {
    const state = { calendar: [cal('Access control review', 'Biannual')], settings: {} };
    assert.equal(Lib.resolveCadenceTokens('reviewed {{cadence:access-review}}.', state), 'reviewed at the interval the organisation has set (currently every six months).');
    assert.equal(Lib.resolveCadenceTokens('reviewed {{cadence:log-review}}.', state), 'reviewed at an interval the organisation sets and records in its compliance calendar.');
    assert.equal(Lib.resolveCadenceTokens('{{cadence:access-review}}', { calendar: [cal('Access control review', 'Biannual', { status: 'Retired' })] }), 'at an interval the organisation sets and records in its compliance calendar');
  });

  test('a setting-backed frequency follows the setting, with its default', () => {
    assert.match(Lib.resolveCadenceTokens('{{cadence:risk-review}}', { settings: {} }), /currently quarterly/);
    assert.match(Lib.resolveCadenceTokens('{{cadence:risk-review}}', { settings: { riskReviewCadenceDays: '182' } }), /currently every six months/);
    assert.equal(Lib.resolveCadenceTokens('{{Interval:document-review}}, or sooner', { settings: { documentReviewMonths: '24' } }), 'Every two years, or sooner');
    assert.match(Lib.resolveCadenceTokens('{{cadence:dormant-account}}', { settings: { dormantAccountDays: '60' } }), /longer than the period the organisation has set \(currently 60 days\)/);
    ['documentReviewMonths', 'managementReviewMonths', 'internalAuditMonths'].forEach((k) => assert.ok(window.THRESHOLD_DEFS.find((d) => d.key === k), k));
  });

  test('a document records the frequencies it stated', () => {
    const acp = T.find((t) => t.id === 'access-control-policy');
    const keys = Lib.cadenceKeysIn(acp);
    assert.deepEqual(keys.sort(), ['access-review', 'document-review', 'dormant-account']);
    assert.deepEqual(Lib.cadenceSnapshot(keys, { calendar: [cal('Access control review', 'Quarterly')], settings: {} }),
      { 'access-review': 'Quarterly', 'dormant-account': '90 days', 'document-review': '12 months' });
    assert.match(store, /\{ name: 'DocCadences', text: \{\} \}/);
    assert.match(app, /cadences: docCadenceSnapshot\(t, filename\)/);
    assert.match(app, /cadences: docCadenceSnapshot\(t, name\)/);
  });

  test('calendar items are editable, and every field is saved', () => {
    assert.match(app, /editCalItem: async function \(id\)/);
    assert.match(store, /Title: c\.title, Category: c\.category, Frequency: c\.freq, Owner: c\.owner \|\| '',\s*NextDue: c\.nextDue \|\| '', LastCompleted: c\.lastCompleted \|\| '', Notes: c\.notes \|\| '', Status: c\.status \|\| 'Active'/);
  });
});

describe('policy versus practice', () => {
  const docs = [
    { id: 1, name: 'ACP.html', tplId: 'access-control-policy', status: 'Approved' },
    { id: 2, name: 'LOG.html', tplId: 'logging-monitoring-policy', status: 'Approved', cadences: JSON.stringify({ 'log-review': 'Monthly', 'document-review': '12 months' }) },
    { id: 3, name: 'Ours.docx', tplId: 'infosec-policy', origin: 'own', status: 'Approved' },
    { id: 4, name: 'Old.html', tplId: 'bcp-dr-plan', status: 'Superseded' },
    { id: 5, name: 'Draft.html', tplId: 'bcp-dr-plan', status: 'Draft', cadences: JSON.stringify({ 'backup-restore': 'Biannual', 'bcp-test': '', 'document-review': '12 months' }) }];
  const gaps = Lib.policyPracticeGaps({ docs, templates: T, calendar: [cal('Log and alert review', 'Quarterly', { nextDue: '2026-01-01' }), cal('Backup restore test', 'Biannual')], settings: {}, today: '2026-10-05' });
  const key = (g) => g.kind + ':' + g.doc.name + (g.key ? ':' + g.key : '');

  test('flags old documents, changed frequencies, unscheduled and overdue commitments', () => {
    const k = gaps.map(key);
    assert.ok(k.includes('legacy:ACP.html'));
    assert.ok(k.includes('unscheduled:ACP.html:access-review'));
    assert.ok(k.includes('changed:LOG.html:log-review'));
    assert.ok(k.includes('overdue:LOG.html:log-review'));
  });
  test('ignores the organisation’s own documents and superseded ones; drafts are not held to their commitments', () => {
    assert.ok(!gaps.some((g) => g.doc.name === 'Ours.docx' || g.doc.name === 'Old.html'));
    assert.ok(!gaps.some((g) => g.doc.name === 'Draft.html'), 'a draft whose snapshot matches has nothing to flag');
  });
  test('the Documents view shows it with the action that closes each gap', () => {
    assert.match(app, /function renderPracticeCard\(\)/);
    assert.match(app, /Re-approve with current frequencies/);
    assert.match(app, /regenerateForPractice: async function \(docName\)/);
  });
});

describe('statements describe what this organisation does', () => {
  test('conditional statements follow the scope & context answers, and keep everything when unanswered', () => {
    const phys = T.find((t) => t.id === 'physical-security-policy').policyStatements;
    const kept = (p) => phys.filter((s) => Lib.statementApplies(s, p)).map((s) => s.rule);
    assert.ok(kept({ orgWorkModel: 'remote' }).some((r) => /no premises/.test(r)));
    assert.ok(!kept({ orgWorkModel: 'remote' }).some((r) => /Visitors to secured areas/.test(r)));
    assert.ok(!kept({ orgWorkModel: 'office' }).some((r) => /no premises/.test(r)));
    assert.equal(kept({}).length, phys.length);
    const sd = T.find((t) => t.id === 'secure-development-policy');
    assert.equal(Lib.statementApplies(sd, { orgDevelops: 'no' }), false, 'no software development, no secure development policy in the set');
    assert.ok(!sd.policyStatements.filter((s) => Lib.statementApplies(s, { orgDevelops: 'yes' })).some((s) => /Outsourced development/.test(s.rule)));
    assert.match(app, /window\.CheckpointLib\.statementApplies\(t, S\.settings\)/);
  });

  test('an operational policy is confirmed statement by statement before approval', () => {
    assert.match(app, /async function confirmPractices\(t, docName\)/);
    assert.match(app, /if \(!params\.aiAssisted && !\(await confirmPractices\(t, name\)\)\) return;/);
    assert.match(app, /src: 'Policy approval'/);
    assert.match(app, /audit\('Policy practices confirmed'/);
    assert.match(app, /Confirm the documents describe what you do/);
  });
});

describe('each framework sees its own documents', () => {
  const ids = (fw) => T.filter((t) => t.frameworks.includes(fw)).map((t) => t.id);
  test('ISO 27001 offers information security documents only', () => {
    const iso = ids('iso27001');
    assert.ok(!iso.some((id) => /^ai-|privacy|^pii-|ropa|consent|^international-transfer/.test(id)), iso.join(','));
  });
  test('ISO 42001 offers AI documents only (plus the shared roles register)', () => {
    assert.deepEqual(ids('iso42001').filter((id) => !/^ai-|^aims-/.test(id)), ['roles-responsibilities']);
  });
  test('privacy documents belong to ISO 27701 or the Privacy Act', () => {
    ['privacy-policy-skeleton', 'privacy-management-plan', 'ropa-data-handling-procedure', 'pii-principal-rights-procedure'].forEach((id) =>
      assert.ok(T.find((t) => t.id === id).frameworks.every((fw) => fw === 'iso27701' || fw === 'privacyact'), id));
  });
  test('ISO 27001 still addresses A.5.34 through its own set', () => {
    assert.ok(T.find((t) => t.id === 'legal-regulatory-policy').controls.includes('A.5.34'));
  });
  test('documents already generated outside the tenant’s frameworks are flagged, not hidden', () => {
    assert.match(app, /function outsideFrameworksNote\(d\)/);
  });
});
