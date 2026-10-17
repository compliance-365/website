// Leadership meeting: the next meeting is worked out from the slot of
// the last one held, and booked in attendees' calendars as soon as the
// minutes are saved.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Lib = require('../public/checkpoint/lib.js');
const Az = require('../public/checkpoint/azure/lib/securityReview.js');
const app = readFileSync(new URL('../public/checkpoint/app.js', import.meta.url), 'utf8');
const az = readFileSync(new URL('../public/checkpoint/azure/PostureMonitor/index.js', import.meta.url), 'utf8');
// Second Tuesday: 13 Oct, 10 Nov, 8 Dec 2026.
const setup = { chair: 'Ekin', owner: 'Cem', week: 2, weekday: 2, time: '10:00', autoSend: 'true', startDate: '2026-01-01' };

describe('the next meeting after minutes are saved', () => {
  test('minutes saved on the day do not make the same day due again', () => {
    const d = Lib.securityReviewDue(setup, [{ id: 'SR-001', n: 1, date: '2026-10-13', status: 'Held' }], '2026-10-13');
    assert.deepEqual([d.n, d.date, d.prepare, d.send], [2, '2026-11-10', false, false]);
  });
  test('a meeting held early counts for its own slot', () => {
    const d = Lib.securityReviewDue(setup, [{ id: 'SR-001', n: 1, date: '2026-10-09', slot: '2026-10-13', status: 'Held' }], '2026-10-09');
    assert.equal(d.date, '2026-11-10');
  });
  test('a meeting held late does not push out the next month', () => {
    const d = Lib.securityReviewDue(setup, [{ id: 'SR-001', n: 1, date: '2026-11-02', slot: '2026-10-13', status: 'Held' }], '2026-11-02');
    assert.equal(d.date, '2026-11-10');
  });
  test('records from before the slot was kept still move on', () => {
    assert.equal(Lib.securityReviewDue(setup, [{ id: 'SR-001', n: 1, date: '2026-10-13', status: 'Held' }], '2026-10-14').date, '2026-11-10');
  });
  test('the scheduled function uses the same rule', () => {
    assert.equal(String(Az.securityReviewDue), String(Lib.securityReviewDue));
    assert.equal(Az.securityReviewDue(setup, [{ id: 'SR-001', n: 1, date: '2026-10-13', status: 'Held' }], '2026-10-13').date, '2026-11-10');
  });
});

describe('booking the next meeting', () => {
  test('the invite carries a sequence, so the agenda invite updates the booked event', () => {
    const base = { uid: 'checkpoint-SR-002-2026-11-10', startUtc: '2026-11-09T23:00:00.000Z', endUtc: '2026-11-09T23:30:00.000Z', summary: 'x' };
    assert.match(Lib.securityReviewIcs({ ...base, sequence: 0 }), /UID:checkpoint-SR-002-2026-11-10\r\nSEQUENCE:0\r\n/);
    assert.match(Lib.securityReviewIcs({ ...base, sequence: 1 }), /SEQUENCE:1/);
    assert.ok(!/SEQUENCE/.test(Lib.securityReviewIcs(base)));
    assert.match(app, /uid: 'checkpoint-' \+ rec\.id \+ '-' \+ rec\.date, sequence: 1/);
    assert.match(az, /uid: 'checkpoint-' \+ rec\.id \+ '-' \+ rec\.date, sequence: 1/);
    assert.match(app, /uid: 'checkpoint-' \+ id \+ '-' \+ nx\.date, sequence: 0/);
  });
  test('saving the minutes keeps the booked slot and books the next meeting', () => {
    assert.match(app, /if \(!r\.slot\) r\.slot = r\.date; r\.status = 'Held'; r\.date = heldOn;/);
    assert.match(app, /var autoBook = book && s\.autoSend === 'true' && await sendNextSecReviewInvite\(true\)/);
    assert.match(app, /if \(book && !autoBook\) await sendNextSecReviewInvite\(false\)/);
    assert.match(app, /'setupSecurityReview', 'sendNextSecReviewInvite',/, 'a Viewer cannot send it');
  });
  test('the card says whether the next meeting is in calendars, and offers the invite', () => {
    assert.match(app, /' · not in attendees’ calendars yet'/);
    assert.match(app, /' · the date changed after the invite went out'/);
    assert.match(app, /data-action="App\.sendNextSecReviewInvite">Send the invite/);
  });
});
