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

describe('already in calendars', () => {
  const rec = { id: 'SR-002', n: 2, date: '2026-11-10' };
  test('the agenda leaves the invite off when the meeting was booked outside Checkpoint', () => {
    assert.equal(Lib.securityReviewInviteAttached(null, rec), true);
    assert.equal(Lib.securityReviewInviteAttached({ n: 2, date: '2026-11-10', sentAt: '2026-10-17' }, rec), true, 'Checkpoint’s own booking: the agenda updates it');
    assert.equal(Lib.securityReviewInviteAttached({ n: 2, date: '2026-11-10', external: true }, rec), false);
    assert.equal(Lib.securityReviewInviteAttached({ n: 2, date: '2026-12-08', external: true }, rec), true, 'a booking for another date does not count');
    assert.equal(String(Az.securityReviewInviteAttached), String(Lib.securityReviewInviteAttached));
  });
  test('the app records the booking without sending, and the card says so', () => {
    assert.match(app, /'sendNextSecReviewInvite', 'markSecReviewBooked',/, 'a Viewer cannot record it');
    assert.match(app, /var b = \{ n: nx\.n, date: nx\.date, time: time, sentAt: [^}]*external: true/);
    assert.match(app, /data-action="App\.markSecReviewBooked">Already in calendars/);
    assert.match(app, /' · in calendars \(invite sent outside Checkpoint\)'/);
    assert.match(app, /securityReviewInviteAttached\(secReviewBooked\(\), rec\) \? \[/);
  });
  test('the scheduled function sends the agenda without an invite', async () => {
    const { runSecurityReview } = require('../public/checkpoint/azure/PostureMonitor/index.js').__test;
    process.env.NOTIFY_FROM = 'checkpoint@mg.example';
    const calls = [];
    const g = async (path, opts) => { calls.push({ path, opts }); if (/\/lists\/settings\/items\?/.test(path)) return { value: [{ id: '7', fields: { SettingKey: 'securityReviews' } }] }; return {}; };
    const gAll = async () => [];
    const ctx = { log: Object.assign(() => {}, { error: () => {} }) };
    const s = { ...setup, emails: 'ekin@mg.example', ownerEmail: 'cem@mg.example', timeZone: 'Australia/Sydney' };
    const held = [{ id: 'SR-001', n: 1, date: '2026-10-13', status: 'Held' }];
    const settings = { clientDisplayName: 'MineGuard', securityReviewSetup: JSON.stringify(s), securityReviews: JSON.stringify(held),
      securityReviewBooked: JSON.stringify({ n: 2, date: '2026-11-10', time: '10:00', external: true }) };
    const optional = { Actions: null, Incidents: null, Risks: null, Vendors: null, Calendar: null, Objectives: null, Controls: null, Documents: null };
    const done = await runSecurityReview(g, gAll, ctx, 'site', { Settings: 'settings' }, optional, settings, '2026-11-06', 70);
    assert.ok(done.includes('sent SR-002'), JSON.stringify(done));
    const mail = calls.find((c) => /sendMail/.test(c.path) && /leadership security meeting 2/.test(c.opts.body.message.subject));
    assert.deepEqual(mail.opts.body.message.attachments, []);
  });
});
