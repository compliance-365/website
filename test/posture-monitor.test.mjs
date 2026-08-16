// Covers the scheduled monitor's date and escaping logic —
// public/checkpoint/azure/PostureMonitor/index.js, the Azure Function
// that runs unattended inside the client's own tenant.
//
// Everything here is chosen because it decides whether MAIL GOES OUT, or
// what ends up inside it. An off-by-one in digestDue() means a weekly
// digest either arrives every single night or never arrives at all, and
// neither failure is visible from inside the app — the Function's only
// witness is an Application Insights log nobody reads until someone asks
// why they stopped getting emails.
//
// The Function shares no module with the browser bundle by design
// (different runtimes, different auth models — see the file's own header
// comment), so these tests pin the mirrored logic on this side of that
// boundary.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { digestDue, buildDigestHtml, esc, daysBetween, computeScore, DIGEST_FREQ_DAYS } =
  require('../public/checkpoint/azure/PostureMonitor/index.js').__test;

const TODAY = '2026-08-15';
const on = (over = {}) => ({ digestEnabled: 'true', digestRecipients: 'isms@example.com', digestFrequency: 'Weekly', ...over });

describe('digestDue() — whether the unattended digest sends tonight', () => {
  test('off by default: no settings at all sends nothing', () => {
    assert.equal(digestDue({}, TODAY), false);
  });

  test('enabled but never sent -> due immediately', () => {
    assert.equal(digestDue(on(), TODAY), true);
  });

  test('enabled with no recipients never sends', () => {
    assert.equal(digestDue(on({ digestRecipients: '' }), TODAY), false);
    assert.equal(digestDue(on({ digestRecipients: '   ' }), TODAY), false,
      'whitespace is not a recipient');
  });

  test('digestEnabled must be the literal string "true"', () => {
    assert.equal(digestDue(on({ digestEnabled: 'false' }), TODAY), false);
    assert.equal(digestDue(on({ digestEnabled: true }), TODAY), false,
      'the Settings list stores strings; a boolean here means something wrote it wrong');
  });

  test('weekly: not due on day 6, due on day 7', () => {
    assert.equal(digestDue(on({ digestLastSent: '2026-08-09' }), TODAY), false, '6 days');
    assert.equal(digestDue(on({ digestLastSent: '2026-08-08' }), TODAY), true, '7 days');
  });

  test('monthly: not due on day 29, due on day 30', () => {
    const monthly = (last) => digestDue(on({ digestFrequency: 'Monthly', digestLastSent: last }), TODAY);
    assert.equal(monthly('2026-07-17'), false, '29 days');
    assert.equal(monthly('2026-07-16'), true, '30 days');
  });

  test('an unrecognised frequency falls back to weekly rather than never sending', () => {
    assert.equal(digestDue(on({ digestFrequency: 'Fortnightly', digestLastSent: '2026-08-08' }), TODAY), true);
    assert.equal(DIGEST_FREQ_DAYS.Weekly, 7);
  });

  test('sending twice on the same day cannot happen', () => {
    assert.equal(digestDue(on({ digestLastSent: TODAY }), TODAY), false);
  });

  test('a future digestLastSent (clock skew, hand-edited list) does not spam', () => {
    assert.equal(digestDue(on({ digestLastSent: '2026-09-01' }), TODAY), false);
  });
});

describe('esc() — tenant-controlled text goes into an HTML email body', () => {
  test('escapes the characters that would break out of the markup', () => {
    assert.equal(esc('<script>alert(1)</script>'), '&lt;script&gt;alert(1)&lt;/script&gt;');
    assert.equal(esc('Tom & "Jerry"'), 'Tom &amp; &quot;Jerry&quot;');
    assert.equal(esc("O'Brien"), 'O&#39;Brien');
  });

  test('null and undefined render as empty, not as the words "null"/"undefined"', () => {
    assert.equal(esc(null), '');
    assert.equal(esc(undefined), '');
    assert.equal(esc(0), '0', 'but a real zero still renders');
  });
});

describe('buildDigestHtml() — what the recipient actually reads', () => {
  const data = {
    score: 62,
    prevScore: 55,
    overdueActions: [{ ref: 'ACT-004', title: 'Enable PIM for <all> admins', days: 12, owner: 'K. Patel' }],
    dueSoonActions: [{ ref: 'ACT-009', title: 'Restore test', due: '2026-08-20', owner: '' }],
    openAlerts: ['Drift: MFA enforced — all users'],
    staleControls: 7
  };

  test('reports the score with its movement since the previous scan', () => {
    const html = buildDigestHtml(data, TODAY);
    assert.match(html, /62\/100/);
    assert.match(html, /\+7 since the previous scan/);
  });

  test('omits the movement clause entirely when there is no previous scan', () => {
    const html = buildDigestHtml({ ...data, prevScore: undefined }, TODAY);
    assert.match(html, /62\/100/);
    assert.doesNotMatch(html, /since the previous scan/);
  });

  test('escapes register content — an action title is tenant-controlled text', () => {
    const html = buildDigestHtml(data, TODAY);
    assert.match(html, /Enable PIM for &lt;all&gt; admins/);
    assert.doesNotMatch(html, /<all>/);
  });

  test('every section is present and counted, including the empty ones', () => {
    const html = buildDigestHtml({ score: 40, overdueActions: [], dueSoonActions: [], openAlerts: [], staleControls: 0 }, TODAY);
    assert.match(html, /Overdue remediation actions \(0\)/);
    assert.match(html, /Due in the next 14 days \(0\)/);
    assert.match(html, /Open drift alerts \(0\)/);
    assert.match(html, /None\./, 'an empty section says None rather than rendering an empty list');
  });

  test('a missing data bag section degrades to zero rather than throwing', () => {
    assert.doesNotThrow(() => buildDigestHtml({ score: 10 }, TODAY));
  });
});

describe('daysBetween() / computeScore() — mirrored arithmetic', () => {
  test('daysBetween is signed: future is positive, past is negative', () => {
    assert.equal(daysBetween('2026-08-15', '2026-08-22'), 7);
    assert.equal(daysBetween('2026-08-22', '2026-08-15'), -7);
    assert.equal(daysBetween('2026-08-15', '2026-08-15'), 0);
  });

  test('daysBetween is unaffected by a daylight-saving boundary', () => {
    // AEST -> AEDT in the tenant's local zone; the Function works in UTC dates only
    assert.equal(daysBetween('2026-10-03', '2026-10-05'), 2);
  });

  test('computeScore ignores unmeasured checks rather than scoring them as failures', () => {
    assert.equal(computeScore({ 'mfa-all': 'pass', legacy: 'pass' }), 100);
    assert.equal(computeScore({ 'mfa-all': 'pass', legacy: 'fail' }), 50);
    assert.equal(computeScore({ 'mfa-all': 'pass', legacy: 'manual' }), 100,
      '"we could not measure it" must never read as "it failed"');
    assert.equal(computeScore({}), 100, 'nothing measured at all is not a zero');
  });

  test('computeScore floors at 5 once anything was measured', () => {
    assert.equal(computeScore({ 'mfa-all': 'fail', legacy: 'fail' }), 5);
  });

  test('a review counts as half a pass', () => {
    assert.equal(computeScore({ 'mfa-all': 'review', legacy: 'review' }), 50);
  });
});
