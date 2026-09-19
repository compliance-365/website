// The due date every newly-raised action gets, and the single table it
// comes from.
//
// Before REMEDIATION_DAYS existed, each path that could raise an action
// picked its own number: the add-action panel pre-filled 14 days when it
// opened — before the practitioner had touched the priority dropdown, and
// with no listener on it, so Critical and Low both landed on the same
// date. addManualRisk() hard-coded Medium/30 for every treatment action
// regardless of the risk's own L x I. addTreatmentAction() and the audit
// finding modal both defaulted High/30. The register that came out of
// that could not show any relationship between severity and deadline,
// which is the one thing an auditor reads it for.
//
// Note what is NOT asserted here: that the numbers are "correct". ISO/IEC
// 27001 and 42001 prescribe no remediation timeframes at all (see the
// REMEDIATION_DAYS comment in app.js). What is auditable is that the
// organisation applies its stated windows consistently — so these tests
// pin the shape (more severe never gets longer) and the single-sourcing
// (no call site re-invents a number), not the values themselves. Change
// the table and these still pass; scatter a daysFrom(30) back into a call
// site and they don't.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../public/checkpoint/app.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../public/checkpoint/index.html', import.meta.url), 'utf8');
const store = readFileSync(new URL('../public/checkpoint/store.js', import.meta.url), 'utf8');

/* The table as app.js actually declares it, parsed rather than restated,
   so this file cannot drift from the source it is guarding. */
const TABLE = (() => {
  const m = /var REMEDIATION_DAYS = \{([^}]+)\};/.exec(app);
  assert.ok(m, 'REMEDIATION_DAYS has been renamed or removed from app.js');
  const out = {};
  for (const [, k, v] of m[1].matchAll(/(\w+):\s*(\d+)/g)) out[k] = Number(v);
  return out;
})();

const PRIORITIES = ['Critical', 'High', 'Medium', 'Low'];

describe('the remediation window table', () => {
  test('covers every priority the app offers, and nothing else', () => {
    assert.deepEqual(Object.keys(TABLE).sort(), [...PRIORITIES].sort());
    const declared = /var ACTION_PRIORITIES = \[([^\]]+)\]/.exec(app);
    assert.ok(declared, 'ACTION_PRIORITIES has been renamed or removed');
    const names = [...declared[1].matchAll(/'([^']+)'/g)].map(m => m[1]);
    assert.deepEqual(names.sort(), [...PRIORITIES].sort(),
      'a priority was added or renamed without giving it a remediation window');
  });

  test('a more severe priority never gets longer to remediate', () => {
    for (let i = 1; i < PRIORITIES.length; i++) {
      const worse = PRIORITIES[i - 1], milder = PRIORITIES[i];
      assert.ok(TABLE[worse] <= TABLE[milder],
        `${worse} (${TABLE[worse]}d) must not be given longer than ${milder} (${TABLE[milder]}d)`);
    }
  });

  test('every window is a positive number of days', () => {
    for (const p of PRIORITIES) {
      assert.ok(Number.isInteger(TABLE[p]) && TABLE[p] > 0, `${p} window is not a positive integer`);
    }
  });

  test('an unrecognised priority falls back to the Medium window, not the shortest', () => {
    // An action nobody classified must not silently become the most
    // urgent thing in the register. Asserted on both halves of the
    // lookup, since the window each band resolves to became a tenant
    // setting: dueForPriority() decides WHICH band applies, and
    // remediationDays() decides what that band is worth.
    const fn = /function dueForPriority\(pr\) \{([\s\S]*?)\n  \}/.exec(app);
    assert.ok(fn, 'dueForPriority() has been renamed or removed');
    assert.match(fn[1], /Medium/, 'an unknown priority no longer routes to the Medium window');
    assert.doesNotMatch(fn[1], /Critical/, 'an unknown priority must not fall back to the shortest window');

    const resolver = app.slice(app.indexOf('function remediationDays(pr)'), app.indexOf('\n  }', app.indexOf('function remediationDays(pr)')));
    assert.match(resolver, /REMEDIATION_DAYS\[pr\] \|\| REMEDIATION_DAYS\.Medium/,
      'the band lookup itself no longer falls back to Medium');
  });
});

describe('the windows are the tenant\'s own, not hard-coded', () => {
  /* The numbers shipped here are Checkpoint's, not a standard's — ISO
     prescribes none — so a client whose ISMS commits to different
     figures has to be able to say so once rather than override every
     action by hand. Each band is a setting; this table is the fallback
     for a tenant that has saved none. */
  const resolver = (() => {
    const start = app.indexOf('function remediationDays(pr)');
    assert.ok(start > -1, 'remediationDays() has been renamed or removed');
    return app.slice(start, app.indexOf('\n  }', start));
  })();

  for (const band of PRIORITIES) {
    test(`${band} has a tenant setting backing it`, () => {
      assert.match(store, new RegExp("key: 'remediationDays" + band + "'"),
        `remediationDays${band} is not declared in THRESHOLD_DEFS, so the window cannot be configured`);
    });

    test(`the ${band} setting's default matches the shipped table`, () => {
      const m = new RegExp("key: 'remediationDays" + band + "'[^}]*def: '(\\d+)'").exec(store);
      assert.ok(m, `no default found for remediationDays${band}`);
      assert.equal(Number(m[1]), TABLE[band],
        `the setting default and REMEDIATION_DAYS disagree for ${band} — a tenant that never touches Settings would get a different window from one that saves the defaults`);
    });
  }

  test('the setting is read before the fallback', () => {
    assert.match(resolver, /S\.settings && S\.settings\[key\]/, 'the tenant setting is never consulted');
    assert.match(resolver, /REMEDIATION_DAYS\[pr\]/, 'there is no fallback when no setting is saved');
  });

  test('a blank or non-numeric setting falls back instead of producing an Invalid Date', () => {
    // A tenant that typed "two weeks" into the box should get the
    // default, not NaN propagated into daysFrom() and an Invalid Date on
    // every action it raises.
    assert.match(resolver, /isNaN\(n\)/, 'a non-numeric setting is never rejected');
  });

  test('zero and negative windows are rejected', () => {
    // An action due before the day it was raised is not a tighter SLA,
    // it is a broken one — and it would read as instantly overdue.
    assert.match(resolver, /n > 0/, 'a zero or negative setting is never rejected');
  });
});

describe('every path that raises an action uses the table', () => {
  /* Each entry is a call site that creates an action, named by a string
     unique to it, plus what its due date must be derived from. */
  const SITES = [
    ["src: 'Manual entry'", 'a manually-added risk\'s treatment actions'],
    ["src: 'Risk treatment'", 'an action added to an existing risk']
  ];

  for (const [marker, label] of SITES) {
    test(`${label} derives its due date from the table`, () => {
      const line = app.split('\n').find(l => l.includes(marker) && l.includes('due:'));
      assert.ok(line, `no action-creating line found for ${marker}`);
      assert.match(line, /due: [^,]*dueForPriority\(/,
        `${label} sets a due date without going through dueForPriority()`);
      assert.doesNotMatch(line, /due: daysFrom\(\d/,
        `${label} hard-codes a number of days instead of using the table`);
    });
  }

  test('the add-action panel opens with the date already matching its priority', () => {
    const fn = /toggleAddAction: function \(\) \{([\s\S]*?)\n    \},/.exec(app);
    assert.ok(fn, 'toggleAddAction() has been renamed or removed');
    assert.match(fn[1], /getElementById\('naDue'\)\.value = dueForPriority\(/,
      'the panel pre-fills a due date that ignores the priority dropdown');
  });

  test('changing the priority dropdown moves the date with it', () => {
    // Delegated data-change-action, not an inline handler: index.html's
    // CSP has no 'unsafe-inline' for script-src.
    assert.match(html, /id="naPriority"[^>]*data-change-action="App\.syncActionDueToPriority"/,
      'the priority dropdown is not wired to update the due date');
    assert.ok(/syncActionDueToPriority: function \(pr\)/.test(app),
      'App.syncActionDueToPriority is referenced by the markup but not defined');
  });

  test('posture-scan findings keep their own per-finding timeframe', () => {
    // Deliberately exempt: a template that names a specific remediation
    // carries a considered number of days with it, which is more precise
    // than a band default. Pinned so the exemption stays a decision.
    const line = app.split('\n').find(l => l.includes("src: 'Posture scan'") && l.includes('due:'));
    assert.ok(line, 'the posture-scan action-creating line has moved');
    assert.match(line, /due: daysFrom\(a\.days\)/);
  });
});

describe('audit findings run on their own clock, not the severity bands', () => {
  /* A nonconformity answers to whoever raised it. A certification body
     typically wants a corrective action plan within 30 days for a major
     and closure by the next surveillance visit for a minor — terms that
     are the CB's, not the standard's (ISO names no deadline), and not a
     function of the finding's own priority. So a High audit finding and
     a High posture-scan action legitimately carry different dates, and
     tying the two together would be wrong rather than tidy.

     This deliberately reverses part of an earlier change that routed
     audit findings through dueForPriority() for consistency. Consistency
     was the wrong goal: it moved the default from 30 days to 14 and
     quietly put audit findings on a clock their certification body never
     agreed to. */
  const line = app.split('\n').find(l => l.includes("src: 'Internal audit'") && l.includes('due:'));
  const resolver = (() => {
    const start = app.indexOf('function auditFindingDays()');
    assert.ok(start > -1, 'auditFindingDays() has been renamed or removed');
    return app.slice(start, app.indexOf('\n  }', start));
  })();

  test('the setting exists and defaults to 30 days', () => {
    const m = /\{ key: 'auditFindingDueDays'[^}]*def: '(\d+)'/.exec(store);
    assert.ok(m, 'auditFindingDueDays is not declared in THRESHOLD_DEFS');
    assert.equal(m[1], '30',
      'the default should match the corrective-action window a certification body commonly gives');
  });

  test('the shipped fallback agrees with the setting default', () => {
    const m = /var AUDIT_FINDING_DAYS = (\d+);/.exec(app);
    assert.ok(m, 'AUDIT_FINDING_DAYS has been renamed or removed');
    const setting = /\{ key: 'auditFindingDueDays'[^}]*def: '(\d+)'/.exec(store);
    assert.equal(Number(m[1]), Number(setting[1]),
      'a tenant that never touches Settings would get a different window from one that saves the default');
  });

  test('the finding takes that clock, not a severity band', () => {
    assert.ok(line, "no action-creating line found for src: 'Internal audit'");
    assert.match(line, /due: [^,]*auditFindingDays\(\)/,
      'an audit finding no longer uses its own window');
    assert.doesNotMatch(line, /dueForPriority\(/,
      'an audit finding is back on the severity bands, which moves its default off the CB clock');
  });

  test('it still does not hard-code a number of days', () => {
    // The point of the original single-sourcing change stands: the value
    // belongs in one named place, it is just a different place from the
    // severity bands.
    assert.doesNotMatch(line, /due: [^,]*daysFrom\(\d/,
      'the audit window is hard-coded at the call site instead of read from the setting');
  });

  test('a blank, non-numeric, zero or negative setting falls back', () => {
    assert.match(resolver, /isNaN\(n\)/, 'a non-numeric setting is never rejected');
    assert.match(resolver, /n > 0/, 'a zero or negative setting is never rejected');
  });
});
