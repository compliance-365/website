// normaliseDateInput() exists because of a bug that was visible on the
// owner console's main roster for every synced client, and read as a
// data problem rather than a rendering one.
//
// Both fmtDate() implementations render a date by appending 'T00:00',
// to pin it to local midnight rather than UTC. That is correct for a
// date-only string. For a full ISO timestamp it builds
// '2026-09-16T05:12:33.123Z' + 'T00:00' — which parses to Invalid Date,
// and prints the words "Invalid Date" in the UI. owner.js stores
// lastSynced as new Date().toISOString(), so that was not an edge case:
// it was the primary path, in four places.
//
// app.js had been living with the same trap by remembering to
// .slice(0, 10) at its one timestamp call site. The rule belongs in one
// tested place instead of in each caller's memory.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import CheckpointLib from '../public/checkpoint/lib.js';

const { normaliseDateInput } = CheckpointLib;

describe('normaliseDateInput()', () => {
  test('passes a date-only string through untouched', () => {
    assert.equal(normaliseDateInput('2027-07-27'), '2027-07-27');
  });

  test('takes the date part of a full ISO timestamp — the actual bug', () => {
    assert.equal(normaliseDateInput('2026-09-16T05:12:33.123Z'), '2026-09-16');
  });

  test('the result always survives the T00:00 append that broke it', () => {
    for (const input of ['2027-07-27', '2026-09-16T05:12:33.123Z', new Date().toISOString()]) {
      const s = normaliseDateInput(input);
      assert.ok(s, 'expected a usable date for ' + input);
      assert.ok(!Number.isNaN(new Date(s + 'T00:00').getTime()),
        JSON.stringify(input) + ' normalised to ' + JSON.stringify(s) + ', which is still Invalid Date once T00:00 is appended');
    }
  });

  /* Reading the first ten characters rather than round-tripping through
     Date() is deliberate: an offset timestamp names a date that UTC
     disagrees with, and a round trip would silently shift what the row
     says by a day.

     A 'Z' timestamp cannot show this — toISOString() returns the same
     UTC date it was given — so the first version of this test asserted
     the behaviour using only Z inputs and passed just as happily with
     the fast path deleted. An offset input is what actually pins it. */
  test('reads the date off the string rather than reinterpreting the instant', () => {
    // 08:00 on the 17th in +10:00 is still the 16th in UTC. The row
    // should say the 17th, which is the date the string states.
    assert.equal(normaliseDateInput('2026-09-17T08:00:00+10:00'), '2026-09-17');
    assert.equal(normaliseDateInput('2026-09-16T23:59:59.000Z'), '2026-09-16');
  });

  /* The branch below the fast path — parseable, but not starting with a
     YYYY-MM-DD. Nothing in the app writes these today; the branch exists
     so an unexpected format degrades to a real date instead of a dash,
     and without a case here it was covered by nothing at all. */
  test('falls back to parsing for a date that is not already ISO-shaped', () => {
    assert.equal(normaliseDateInput('September 16, 2026'), '2026-09-16');
    assert.equal(normaliseDateInput('2026/09/16'), '2026-09-16');
  });

  test('returns empty for anything with no usable date, so callers can show a dash', () => {
    for (const bad of ['', null, undefined, 'not a date', '16/09/2026', {}, []]) {
      assert.equal(normaliseDateInput(bad), '', 'expected "" for ' + JSON.stringify(bad));
    }
  });

  test('never returns a value that would render as the words "Invalid Date"', () => {
    for (const input of ['2027-07-27', '2026-09-16T05:12:33.123Z', 'nonsense', '', null]) {
      const s = normaliseDateInput(input);
      const rendered = s ? new Date(s + 'T00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }) : '—';
      assert.notEqual(rendered, 'Invalid Date', 'input ' + JSON.stringify(input) + ' still renders as Invalid Date');
    }
  });
});
