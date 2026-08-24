// APRA CPS 234 module.
//
// This suite exists mainly to pin facts that are expensive to get
// wrong. CPS 234 is a prudential standard: an APRA-regulated entity
// builds a notification process around what this module says, and a
// wrong obligation here is a regulatory problem for the client, not a
// cosmetic bug. The two notification clocks in particular are DIFFERENT
// and are routinely conflated — an early draft of this module's source
// register stated 72 hours for both.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const pack = JSON.parse(readFileSync(new URL('../checkpoint-content/cps234.json', import.meta.url)));
const controls = pack.framework.controls;
const byCode = Object.fromEntries(controls.map((c) => [c.code, c]));

describe('CPS 234 — requirement coverage', () => {
  test('covers paragraphs 13 to 36 with no gaps and no extras', () => {
    // The standard self-anchors: paragraph 28 cites "paragraphs 27(a) to
    // 27(e)" for the systematic testing program, which fixes 27 and so
    // the whole run. If this ever fails, re-derive from the standard —
    // do not renumber to make the test pass.
    const nums = controls.map((c) => Number(c.code.split('.')[1])).sort((a, b) => a - b);
    const expected = Array.from({ length: 24 }, (_, i) => i + 13);
    assert.deepEqual(nums, expected);
  });

  test('every control has a title, an audit domain and cross-mapping', () => {
    controls.forEach((c) => {
      assert.ok(c.t && c.t.trim(), `${c.code} has no title`);
      assert.ok(c.cat && c.cat.startsWith('cps'), `${c.code} has no CPS-prefixed audit domain`);
      assert.ok(c.map && c.map.trim(), `${c.code} has no cross-mapping`);
      assert.equal(c.app, true, `${c.code} must ship applicable — CPS 234 requirements are not optional`);
    });
  });

  test('every control has guidance carrying both how-to and evidence', () => {
    controls.forEach((c) => {
      const g = pack.guidance[c.code];
      assert.ok(g, `${c.code} has no guidance`);
      assert.ok(g.how && g.how.length > 80, `${c.code} guidance lacks substantive how-to`);
      assert.ok(g.evidence && g.evidence.length > 40, `${c.code} guidance lacks evidence description`);
    });
  });
});

describe('CPS 234 — the two notification clocks are distinct', () => {
  // Conflating these is the single most consequential error this module
  // could ship. They are different triggers AND different deadlines.
  test('paragraph 35 is the 72-HOUR material incident notification', () => {
    const c = byCode['CPS234.35'];
    assert.match(c.t, /72 hours/i);
    assert.match(pack.guidance['CPS234.35'].how, /72 HOURS/);
    assert.doesNotMatch(c.t, /business days/i, 'paragraph 35 is an hours clock, not a business-days one');
  });

  test('paragraph 36 is the 10-BUSINESS-DAY control weakness notification', () => {
    const c = byCode['CPS234.36'];
    assert.match(c.t, /10 business days/i);
    assert.match(pack.guidance['CPS234.36'].how, /10 BUSINESS DAYS/);
    assert.doesNotMatch(c.t, /72 hours/i, 'paragraph 36 is NOT a 72-hour obligation — a common and costly conflation');
  });

  test('paragraph 36 is triggered by an unremediable weakness, not by an incident', () => {
    // No incident is required for the 10-day clock to start; that is
    // exactly why entities miss it.
    assert.match(pack.guidance['CPS234.36'].how, /no incident required/i);
  });
});

describe('CPS 234 — requirements that are commonly mis-scoped', () => {
  test('paragraph 27 names a SYSTEMATIC testing program, not ad hoc testing', () => {
    assert.match(pack.guidance['CPS234.27'].how, /systematic/i);
    assert.match(pack.guidance['CPS234.27'].how, /five named factors|five factors/i);
  });

  test('paragraph 30 requires functional independence, not just skill', () => {
    assert.match(byCode['CPS234.30'].t, /independent/i);
    assert.match(pack.guidance['CPS234.30'].how, /functional independence/i);
  });

  test('paragraph 32 requires BOTH design and operating effectiveness', () => {
    assert.match(pack.guidance['CPS234.32'].how, /design/i);
    assert.match(pack.guidance['CPS234.32'].how, /operating effectiveness/i);
  });

  test('third-party obligations are represented across capability, controls, testing and audit', () => {
    // CPS 234 extends to related and third parties at four separate
    // points; a module covering only the entity's own estate under-scopes
    // the standard.
    ['CPS234.16', 'CPS234.22', 'CPS234.28', 'CPS234.34'].forEach((code) => {
      const text = byCode[code].t + ' ' + pack.guidance[code].how;
      assert.match(text, /third[- ]party|third parties/i, `${code} should carry the third-party obligation`);
    });
  });
});

describe('CPS 234 — pack integrity', () => {
  test('declares its source publication and a verification date', () => {
    assert.equal(pack.moduleId, 'cps234');
    assert.match(pack.sourceRef.publication, /CPS 234/);
    assert.ok(pack.sourceRef.edition, 'edition must be recorded');
    assert.match(pack.sourceRef.lastVerified, /^\d{4}-\d{2}-\d{2}$/);
  });

  test('every automated check mapping points at a real requirement', () => {
    Object.entries(pack.extra.checkCps234).forEach(([checkId, codes]) => {
      codes.forEach((code) => {
        assert.ok(byCode[code], `check "${checkId}" maps to unknown requirement ${code}`);
      });
    });
  });

  test('guidance check lists agree with the check mapping', () => {
    Object.entries(pack.extra.checkCps234).forEach(([checkId, codes]) => {
      codes.forEach((code) => {
        assert.ok(pack.guidance[code].checks.includes(checkId),
          `${code}'s guidance does not list check "${checkId}" that maps to it`);
      });
    });
  });
});
