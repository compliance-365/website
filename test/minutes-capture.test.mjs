// Taking the leadership meeting's minutes: one box per item where a
// "Decision:" line becomes an action, "Noted, no change" from the
// figures, progress through the agenda, and attendance with apologies.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Lib = require('../public/checkpoint/lib.js');

describe('one box per item', () => {
  test('Decision: lines become actions; every other line is the minute', () => {
    const r = Lib.splitMinuteText('Score up after the MFA rollout.\nDecision: Enforce MFA for contractors - Sam Okafor - 30/11/2026\nContractors were the gap.', '2026-10-16');
    assert.equal(r.note, 'Score up after the MFA rollout.\nContractors were the gap.');
    assert.deepEqual(r.decisions, [{ title: 'Enforce MFA for contractors', owner: 'Sam Okafor', due: '2026-11-30' }]);
  });

  test('Action: works too, any case, with a bullet in front', () => {
    const r = Lib.splitMinuteText('- action: Renew the cyber insurance - Cem', '2026-10-16');
    assert.equal(r.note, '');
    assert.equal(r.decisions[0].title, 'Renew the cyber insurance');
    assert.equal(r.decisions[0].owner, 'Cem');
    assert.equal(r.decisions[0].due, '2027-01-14', 'no date: due in 90 days');
  });

  test('prose with a dash in it is never read as an action', () => {
    const r = Lib.splitMinuteText('Phishing results - better than last month - no change needed', '2026-10-16');
    assert.deepEqual(r.decisions, []);
    assert.equal(r.note, 'Phishing results - better than last month - no change needed');
  });

  test('an empty Decision: line raises nothing', () => {
    assert.deepEqual(Lib.splitMinuteText('Decision: ', '2026-10-16').decisions, []);
  });
});

describe('Noted, no change', () => {
  test('the figures on the agenda become the minute', () => {
    assert.equal(Lib.minuteNotedText(['0 incidents since 8 Sep 2026']), '0 incidents since 8 Sep 2026. Noted, no change.');
  });
  test('at most three figures, without doubled full stops', () => {
    assert.equal(Lib.minuteNotedText(['A.', 'B;', 'C', 'D']), 'A; B; C. Noted, no change.');
  });
  test('an item with no figures still records the decision', () => {
    assert.equal(Lib.minuteNotedText([]), 'Noted, no change.');
  });
});

describe('progress through the agenda', () => {
  test('an item counts once it has a minute or a decision recorded with its buttons', () => {
    const p = Lib.minutesProgress(['actions', 'risks', 'incidents', 'posture'], { actions: 'Two closed.', incidents: '  ' }, ['risks']);
    assert.equal(p.done, 2);
    assert.equal(p.total, 4);
    assert.deepEqual(p.doneKeys, ['actions', 'risks']);
  });
});

describe('attendance and apologies', () => {
  const setup = { chair: 'Mei Chen', owner: 'Sam Okafor', facilitator: 'Compliance365' };

  test('invitees: the roles first, then the invite list, once each', () => {
    const people = Lib.securityReviewInvitees(setup, ['m.chen@meridian.example', 's.okafor@meridian.example', 'k.patel@meridian.example'], () => '');
    assert.deepEqual(people.map((p) => p.name), ['Mei Chen', 'Sam Okafor', 'Compliance365', 'K. Patel']);
    assert.deepEqual(people.map((p) => p.role), ['Chair', 'ISMS owner', 'Facilitator', '']);
  });

  test('a directory name is used when the address is known', () => {
    const people = Lib.securityReviewInvitees({ chair: 'Ekin' }, ['cem@mineguard.example'], (e) => (e.startsWith('cem@') ? 'Cem Yilmaz' : ''));
    assert.deepEqual(people.map((p) => p.name), ['Ekin', 'Cem Yilmaz']);
  });

  test('present, apologies, and anyone else who joined', () => {
    const r = Lib.securityReviewAttendanceText([{ name: 'Mei Chen', present: false }, { name: 'Sam Okafor', present: true }], 'Kris Pandey, sam okafor');
    assert.equal(r.present, 'Sam Okafor, Kris Pandey');
    assert.equal(r.apologies, 'Mei Chen');
  });

  test('apologies appear in the minutes email', () => {
    const html = Lib.securityReviewMinutesHtml({ n: 1, label: 'Monthly', items: [] }, { present: 'Sam Okafor', apologies: 'Mei Chen' }, [], { org: 'Meridian', date: '16 Oct 2026' });
    assert.match(html, /Present: Sam Okafor · Apologies: Mei Chen/);
  });
});
