// Supplier questionnaire uplift (1.193.0): who is asking, comments on
// answers, last time's answers, reminders for unanswered questionnaires,
// and answers worth checking. The browser and the Azure Function share
// no module, so the reminder rule exists twice; the first test fails if
// the copies differ.
import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const L = require('../public/checkpoint/lib.js');
const VR = require('../public/checkpoint/azure/lib/vendorRenewal.js');
const VQ = require('../public/checkpoint/azure/lib/vendorQuestions.js');
const M = require('../public/checkpoint/azure/PostureMonitor/index.js').__test;
const handler = require('../public/checkpoint/azure/VendorQuestionnaireSubmit/index.js');
const { validateSubmission } = handler.__test;
const { mintVendorToken } = require('../public/checkpoint/azure/lib/vendorToken.js');
const page = readFileSync(new URL('../public/checkpoint/vendor-questionnaire.html', import.meta.url), 'utf8');

const chase = (sentDate, notes, today, extra) => L.questionnaireChaseState(Object.assign({ status: 'Sent', sentDate, contactEmail: 'sec@supplier.example', notes }, extra), today);

describe('reminders for an unanswered questionnaire', () => {
  test('the Function and the app use the same rule', () => {
    assert.equal(String(L.questionnaireChaseState), String(VR.questionnaireChaseState));
  });
  test('first reminder at 7 days, the second a week after it, then none', () => {
    assert.equal(chase('2026-11-01', '', '2026-11-07').due, false);
    assert.equal(chase('2026-11-01', '', '2026-11-08').due, true);
    const one = '[questionnaire-reminder 2026-11-08]';
    assert.equal(chase('2026-11-01', one, '2026-11-14').due, false);
    assert.equal(chase('2026-11-01', one, '2026-11-15').due, true);
    const two = one + '\n[questionnaire-reminder 2026-11-15]';
    assert.equal(chase('2026-11-01', two, '2026-12-30').due, false);
  });
  test('"No reply" from 14 days; nothing once answered or without a contact', () => {
    assert.equal(chase('2026-11-01', '', '2026-11-14').noReply, false);
    assert.equal(chase('2026-11-01', '', '2026-11-15').noReply, true);
    assert.equal(chase('2026-11-01', '', '2026-11-20', { status: 'Received' }).waiting, false);
    assert.equal(chase('2026-11-01', '', '2026-11-20', { contactEmail: '' }).due, false);
  });
  test('sending again starts a new round: older reminders do not count', () => {
    assert.equal(chase('2026-12-01', '[questionnaire-reminder 2026-11-08]\n[questionnaire-reminder 2026-11-15]', '2026-12-08').due, true);
  });
  test('reminder markers are hidden from the notes people read', () => {
    assert.equal(L.vendorNotesText('Renewal under way\n[questionnaire-reminder 2026-11-08]'), 'Renewal under way');
  });
  test('the register says "No reply" with the reminders sent, and lists the supplier under Needs tidying', () => {
    const v = { id: 'VEN-1', questionnaireStatus: 'Sent', questionnaireSentDate: '2026-11-01', contactEmail: 'a@b.c', notes: '[questionnaire-reminder 2026-11-08]' };
    assert.deepEqual(L.supplierQuestionnaireSummary(v, '2026-11-20'), { label: 'No reply · 19 days', tone: 'warn', sub: '1 reminder sent' });
    assert.ok(L.registerTidy('vendors', [v], { today: '2026-11-20' }).some((t) => t.key === 'noReply'));
  });
});

describe('the monitor', () => {
  test('emails name the organisation asking and who to contact', () => {
    const first = M.supplierQuestionnaireEmail({ name: 'Meridian Health', contact: 'security@meridian.example' }, 'Northwind', 'Hosting', 'https://x.example/?t=1', false, '');
    assert.match(first, /<b>Meridian Health<\/b> reviews the security of the suppliers it works with/);
    assert.match(first, /Questions about it: security@meridian\.example/);
    const reminder = M.supplierQuestionnaireEmail({ name: '', contact: '' }, 'Northwind', '', 'https://x.example/?t=1', true, '2026-11-01');
    assert.match(reminder, /A reminder: we are still waiting[\s\S]*sent on 2026-11-01/);
  });
  test('who is asking comes from supplierFormFrom, then clientDisplayName, stripped of markup', () => {
    assert.deepEqual(VQ.supplierFormFrom({ supplierFormFrom: JSON.stringify({ name: 'Acme <b>', contact: 'sec@acme.example' }) }), { name: 'Acme  b', contact: 'sec@acme.example' });
    assert.deepEqual(VQ.supplierFormFrom({ clientDisplayName: 'Acme Pty Ltd' }), { name: 'Acme Pty Ltd', contact: '' });
    assert.deepEqual(VQ.supplierFormFrom({ supplierFormFrom: 'not json' }), { name: '', contact: '' });
  });
});

describe('the Function', () => {
  test('comments are kept with the answers as _notes, for real questions only', () => {
    const ok = validateSubmission({ answers: { mfa: 'No' }, notes: { mfa: '  Rolling out in March ', encryption: '' } });
    assert.deepEqual(ok, { ok: true, answers: { mfa: 'No', _notes: { mfa: 'Rolling out in March' } } });
    assert.match(validateSubmission({ answers: { mfa: 'No' }, notes: { Criticality: 'Low' } }).error, /unknown question/);
    assert.match(validateSubmission({ answers: { mfa: 'No' }, notes: { mfa: 'x'.repeat(501) } }).error, /too long/);
    assert.match(validateSubmission({ answers: { mfa: 'No' }, notes: ['x'] }).error, /notes must be an object/);
  });

  describe('GET', () => {
    const SECRET = 's3cret';
    beforeEach(() => { Object.assign(process.env, { TENANT_ID: 't', CLIENT_ID: 'c', CLIENT_SECRET: 's', VENDOR_LINK_SECRET: SECRET }); });
    afterEach(() => { for (const k of ['TENANT_ID', 'CLIENT_ID', 'CLIENT_SECRET', 'VENDOR_LINK_SECRET']) delete process.env[k]; delete globalThis.fetch; });
    test('returns who is asking, the reply-by date and last time\'s answers', async () => {
      globalThis.fetch = async (url) => {
        const r = (b) => ({ ok: true, status: 200, json: async () => b, text: async () => JSON.stringify(b) });
        if (/login\.microsoftonline/.test(url)) return r({ access_token: 'x' });
        if (/\/sites\/root\?/.test(url)) return r({ id: 'site' });
        if (/\/lists\?/.test(url)) return r({ value: [{ id: 'ven', displayName: 'Checkpoint Vendors' }, { id: 'set', displayName: 'Checkpoint Settings' }] });
        if (/lists\/set\/items/.test(url)) return r({ value: [{ fields: { SettingKey: 'supplierFormFrom', SettingValue: JSON.stringify({ name: 'Meridian Health', contact: 'sec@meridian.example' }) } }] });
        if (/lists\/ven\/items\/7\?/.test(url)) return r({ id: '7', fields: { Title: 'Northwind', QuestionnaireAnswers: JSON.stringify({ mfa: 'No', _notes: { mfa: 'soon' } }), QuestionnaireReceivedDate: '2025-11-20', Criticality: 'Critical' } });
        throw new Error('unexpected ' + url);
      };
      const c = { log: Object.assign(() => {}, { error: () => {} }) };
      await handler(c, { method: 'GET', query: { token: mintVendorToken('7', SECRET, 14) } });
      const body = JSON.parse(c.res.body);
      assert.deepEqual(body.from, { name: 'Meridian Health', contact: 'sec@meridian.example' });
      assert.match(body.replyBy, /^\d{4}-\d{2}-\d{2}$/);
      assert.deepEqual(body.previous, { answers: { mfa: 'No', _notes: { mfa: 'soon' } }, date: '2025-11-20' });
      assert.doesNotMatch(c.res.body, /Critical/);
    });
  });
});

describe('answers worth checking, and the supplier\'s comments', () => {
  test('data overseas, unnamed sub-processors, no exit plan, a certificate with no detail, high-risk AI', () => {
    const ids = L.supplierAnswerChecks({ certification: 'Yes', dataLocation: 'US-East', subProcessors: 'Yes', usesAi: 'Yes', essentialServicesAccess: 'Yes' }).map((c) => c.id);
    assert.deepEqual(ids, ['dataLocation', 'subProcessorsDetail', 'dataAtContractEnd', 'certificationDetail', 'essentialServicesAccess']);
  });
  test('Australian locations, complete answers and an empty questionnaire raise nothing', () => {
    for (const loc of ['Australia', 'AWS Sydney', 'Azure Australia East', 'ap-southeast-2', 'Melbourne and Brisbane']) {
      assert.deepEqual(L.supplierAnswerChecks({ dataLocation: loc, dataAtContractEnd: 'Deleted' }), [], loc);
    }
    assert.deepEqual(L.supplierAnswerChecks({}), []);
  });
  test('every check has a question to put to the supplier', () => {
    for (const c of L.supplierAnswerChecks({ certification: 'Yes', dataLocation: 'US', subProcessors: 'Yes', usesAi: 'Yes', essentialServicesAccess: 'Yes' })) assert.ok(c.ask && c.ask.endsWith('?') || /\.$/.test(c.ask), c.id);
  });
  test('comments are read for real questions only', () => {
    assert.deepEqual(L.supplierAnswerNotes({ _notes: { mfa: ' soon ', Criticality: 'x', encryption: 7 } }), { mfa: 'soon' });
  });
  test('gaps are still read from the answers when comments are present', () => {
    assert.deepEqual(L.supplierQuestionnaireGaps({ mfa: 'No', _notes: { mfa: 'soon' } }).map((g) => g.id), ['mfa']);
  });
});

describe('the supplier\'s page', () => {
  test('keeps answers in the browser, offers a comment on every yes/no answer, and stops a late save after sending', () => {
    assert.match(page, /var DRAFT_KEY = 'cpVendorQ:' \+ token\.slice\(-32\);/);
    assert.match(page, /Add a comment or link/);
    assert.match(page, /clearTimeout\(saveTimer\);\s*clearDraft\(\);/);
    assert.match(page, /body: JSON\.stringify\(\{ answers: sent\.answers, notes: sent\.notes \}\)/);
  });
  test('still refuses an API host that is not an Azure Functions host', () => {
    assert.match(page, /var VALID_HOST = \/\^\[a-z0-9-\]\+\\\.azurewebsites\\\.net\$\/i;/);
  });
});
