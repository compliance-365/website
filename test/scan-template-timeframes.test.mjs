// Posture-scan finding templates: the relationship between the priority
// a finding is raised at and the number of days it is given.
//
// Every other path that raises an action takes its due date from the
// tenant's remediation windows (see remediation-windows.test.mjs). Scan
// findings deliberately do not: each template carries its own `days`,
// because a finding that names a specific remediation comes with a
// considered timeframe, and flattening them all onto the band default
// would throw that away. Publishing retention labels across an estate
// genuinely takes longer than switching on a Conditional Access policy.
//
// So `days` encodes EFFORT and `pr` encodes SEVERITY. Two different axes,
// both worth carrying — but they must not cross. An audit of the 53
// templates found six that did: two Critical findings given 21 days while
// High findings elsewhere got 7, and four High findings given 45 days
// while Medium ones got 21. A register that hands the more serious
// finding the later deadline argues against its own prioritisation, which
// is the thing an auditor actually queries.
//
// The rule enforced here is a CEILING per band, not equality: a finding
// may be faster than its band (beating the window is never a finding),
// and may be slower than the band default where the work genuinely takes
// longer — but never slower than the next milder band's default window.
// That keeps the effort signal while making an inversion impossible.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../public/checkpoint/app.js', import.meta.url), 'utf8');

/* A ceiling entry is either a literal (`Low: 90`) or a reference to a
   band default (`Critical: REMEDIATION_DAYS.High`), since the two tables
   are deliberately tied together in the source. Both resolve to a
   number here. */
const ceilingValue = (body, key, defaults) => {
  const m = new RegExp(key + ':\\s*(REMEDIATION_DAYS\\.(\\w+)|\\d+)').exec(body);
  assert.ok(m, `${key} not found in REMEDIATION_CEILING`);
  if (m[2]) {
    assert.ok(defaults[m[2]] != null, `REMEDIATION_CEILING.${key} references REMEDIATION_DAYS.${m[2]}, which does not exist`);
    return defaults[m[2]];
  }
  return Number(m[1]);
};

/* Both tables parsed out of app.js rather than restated, so this file
   cannot drift from the source it guards. Change a window and the
   ceilings move with it. */
const DEFAULTS = (() => {
  const m = /var REMEDIATION_DAYS = \{([^}]+)\};/.exec(app);
  assert.ok(m, 'REMEDIATION_DAYS has been renamed or removed');
  const out = {};
  for (const [, k, v] of m[1].matchAll(/(\w+):\s*(\d+)/g)) out[k] = Number(v);
  return out;
})();

const CEILING = (() => {
  const m = /var REMEDIATION_CEILING = \{([^}]+)\};/.exec(app);
  assert.ok(m, 'REMEDIATION_CEILING has been renamed or removed');
  return {
    Critical: ceilingValue(m[1], 'Critical', DEFAULTS),
    High: ceilingValue(m[1], 'High', DEFAULTS),
    Medium: ceilingValue(m[1], 'Medium', DEFAULTS),
    Low: ceilingValue(m[1], 'Low', DEFAULTS)
  };
})();

/* Every { t: '…', pr: '…', days: N } in the scan-finding templates. */
const TEMPLATES = (() => {
  const out = [];
  const re = /\{ t: '((?:[^'\\]|\\.)*)'[^}]*?pr: '(Critical|High|Medium|Low)', days: (\d+)/g;
  let m;
  while ((m = re.exec(app))) out.push({ title: m[1].replace(/\\'/g, "'"), pr: m[2], days: Number(m[3]) });
  return out;
})();

describe('the ceiling table itself', () => {
  test('each band is capped at the next milder band\'s default window', () => {
    assert.equal(CEILING.Critical, DEFAULTS.High);
    assert.equal(CEILING.High, DEFAULTS.Medium);
    assert.equal(CEILING.Medium, DEFAULTS.Low);
  });

  test('a more severe band never gets a longer ceiling than a milder one', () => {
    const order = ['Critical', 'High', 'Medium', 'Low'];
    for (let i = 1; i < order.length; i++) {
      assert.ok(CEILING[order[i - 1]] <= CEILING[order[i]],
        `${order[i - 1]} ceiling (${CEILING[order[i - 1]]}d) exceeds ${order[i]}'s (${CEILING[order[i]]}d)`);
    }
  });

  test('every band\'s own default sits within its ceiling', () => {
    for (const band of Object.keys(DEFAULTS)) {
      assert.ok(DEFAULTS[band] <= CEILING[band],
        `${band}'s default window (${DEFAULTS[band]}d) is already past its own ceiling (${CEILING[band]}d)`);
    }
  });
});

describe('scan-finding templates', () => {
  test('there are templates to check at all', () => {
    // Guards the regex above: a refactor that changes the template shape
    // would otherwise silently make every assertion below vacuous.
    assert.ok(TEMPLATES.length > 40, `only ${TEMPLATES.length} templates parsed — the shape has probably changed`);
  });

  test('no finding is given longer than its band allows', () => {
    const breaches = TEMPLATES
      .filter(t => t.days > CEILING[t.pr])
      .map(t => `${t.pr} given ${t.days}d (max ${CEILING[t.pr]}): ${t.title.slice(0, 70)}`);
    assert.deepEqual(breaches, [],
      'a more severe finding must not carry a later deadline than a milder band\'s default:\n  ' + breaches.join('\n  '));
  });

  test('no finding carries a zero or negative timeframe', () => {
    const bad = TEMPLATES.filter(t => !(t.days > 0)).map(t => t.title.slice(0, 70));
    assert.deepEqual(bad, [], 'a finding due the day it is raised is not an urgent SLA, it is a broken one');
  });

  test('the fastest Critical is no slower than the fastest High', () => {
    // A weaker, direction-only check than the ceiling, but it catches the
    // case where every Critical drifts long while some High stays short.
    const fastest = pr => Math.min(...TEMPLATES.filter(t => t.pr === pr).map(t => t.days));
    assert.ok(fastest('Critical') <= fastest('High'),
      `fastest Critical (${fastest('Critical')}d) is slower than fastest High (${fastest('High')}d)`);
  });
});
