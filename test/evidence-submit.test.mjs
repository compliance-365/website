// Tests for azure/EvidenceSubmit/index.js's pure validation logic — the
// gate between whatever an owner typed into the no-sign-in evidence form
// and a write into the client's Actions/ActionUpdates SharePoint lists.
// Deliberately narrower than the browser app's own action editing: an
// owner can report 'In progress' or 'Done' with a note and/or an
// evidence link, and nothing else — never reopen or cancel a finding,
// never touch any other field.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { validateSubmission, isSafeUrl, newUpdateId, ALLOWED_STATUSES, MAX_NOTE_LENGTH } =
  require('../public/checkpoint/azure/EvidenceSubmit/index.js').__test;

describe('validateSubmission()', () => {
  test('accepts a note with status "In progress"', () => {
    const r = validateSubmission({ note: 'Started rotating the keys.', status: 'In progress' });
    assert.equal(r.ok, true);
    assert.equal(r.status, 'In progress');
    assert.equal(r.note, 'Started rotating the keys.');
  });

  test('accepts an evidence link with status "Done" and no note', () => {
    const r = validateSubmission({ evidenceUrl: 'https://example.com/evidence.pdf', status: 'Done' });
    assert.equal(r.ok, true);
    assert.equal(r.evidenceUrl, 'https://example.com/evidence.pdf');
  });

  test('rejects a status outside the allowed set — never "Open" or "Cancelled" from an owner link', () => {
    assert.equal(validateSubmission({ note: 'x', status: 'Open' }).ok, false);
    assert.equal(validateSubmission({ note: 'x', status: 'Cancelled' }).ok, false);
    assert.equal(validateSubmission({ note: 'x', status: 'done' }).ok, false, 'case-sensitive, matches the register\'s own values exactly');
    assert.equal(validateSubmission({ note: 'x' }).ok, false, 'no status at all');
  });

  test('rejects a submission with neither a note nor an evidence link — nothing worth recording', () => {
    const r = validateSubmission({ status: 'Done' });
    assert.equal(r.ok, false);
    assert.match(r.error, /note or an evidence link/);
  });

  test('rejects an evidence link that is not http(s) — no javascript: or data: URIs into the register', () => {
    assert.equal(validateSubmission({ status: 'Done', evidenceUrl: 'javascript:alert(1)' }).ok, false);
    assert.equal(validateSubmission({ status: 'Done', evidenceUrl: 'ftp://example.com/x' }).ok, false);
    assert.equal(validateSubmission({ status: 'Done', note: 'x', evidenceUrl: 'not a url' }).ok, false);
  });

  test('rejects a note over the length cap', () => {
    const r = validateSubmission({ status: 'Done', note: 'x'.repeat(MAX_NOTE_LENGTH + 1) });
    assert.equal(r.ok, false);
    assert.match(r.error, /too long/);
  });

  test('a note exactly at the cap is accepted', () => {
    const r = validateSubmission({ status: 'Done', note: 'x'.repeat(MAX_NOTE_LENGTH) });
    assert.equal(r.ok, true);
  });

  test('trims whitespace from note and evidenceUrl', () => {
    const r = validateSubmission({ status: 'Done', note: '  done  ', evidenceUrl: '  https://example.com  ' });
    assert.equal(r.note, 'done');
    assert.equal(r.evidenceUrl, 'https://example.com');
  });

  test('a missing or non-object body never throws', () => {
    assert.equal(validateSubmission(undefined).ok, false);
    assert.equal(validateSubmission(null).ok, false);
    assert.equal(validateSubmission({}).ok, false);
  });

  test('ALLOWED_STATUSES is exactly the two progress-reporting states', () => {
    assert.deepEqual(ALLOWED_STATUSES, ['In progress', 'Done']);
  });
});

describe('isSafeUrl()', () => {
  test('accepts http and https', () => {
    assert.equal(isSafeUrl('http://example.com'), true);
    assert.equal(isSafeUrl('https://example.com/path?x=1'), true);
  });

  test('rejects everything else, including empty', () => {
    assert.equal(isSafeUrl('javascript:alert(1)'), false);
    assert.equal(isSafeUrl('data:text/html,x'), false);
    assert.equal(isSafeUrl(''), false);
    assert.equal(isSafeUrl(undefined), false);
  });
});

describe('newUpdateId()', () => {
  test('never collides across a large batch, and never matches the browser app\'s own UPD-#### sequence', () => {
    const ids = new Set();
    for (let i = 0; i < 500; i++) ids.add(newUpdateId());
    assert.equal(ids.size, 500);
    for (const id of ids) {
      assert.match(id, /^UPD-EV-/);
      assert.doesNotMatch(id, /^UPD-\d{4}$/);
    }
  });
});
