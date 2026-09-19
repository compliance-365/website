// The three ISO-alignment fields added to the Risks register, and the
// schema plumbing they depend on.
//
// Checkpoint's own Risk Management Framework policy template (templates.js)
// states what the register does. Three of its statements were not true of
// the app:
//
//   "Risks are identified in terms of their effect on the confidentiality,
//    integrity and availability of information assets"  -> no CIA field
//   "Residual risk is reviewed at least quarterly"       -> nothing recorded
//                                                           when a risk was
//                                                           last reviewed
//   ISO/IEC 27005 determines residual by re-assessing    -> residual was
//   with treatment in place                                 arithmetic only
//
// A client generated that policy, handed it to an auditor, and the
// register did not do what the policy said. These tests pin the fields
// that closed the gap, and the migration path that gets them onto a
// tenant provisioned before they existed.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../public/checkpoint/app.js', import.meta.url), 'utf8');
const store = readFileSync(new URL('../public/checkpoint/store.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../public/checkpoint/index.html', import.meta.url), 'utf8');

const NEW_RISK_COLUMNS = ['Cia', 'LastReviewed', 'LastReviewedBy', 'ResidualL', 'ResidualI', 'ResidualBy', 'ResidualDate'];

describe('the new Risks columns exist and reach an existing tenant', () => {
  const defs = (() => {
    const start = store.indexOf('    Risks: [');
    assert.ok(start > -1, "DEFS.Risks has moved or been renamed");
    return store.slice(start, store.indexOf('\n    ],', start));
  })();

  for (const col of NEW_RISK_COLUMNS) {
    test(`DEFS.Risks declares ${col}`, () => {
      assert.match(defs, new RegExp("name: '" + col + "'"));
    });
  }

  /* The bug class store.js's own comments record hitting live three
     separate times: a column added to DEFS but never added to
     COLUMN_RECONCILE, so a tenant provisioned earlier never receives it
     and the next write fails with "Field 'X' is not recognized". Risks,
     Actions and Controls each carry a comment declaring their reconcile
     entry to be the FULL column list from their own DEFS for exactly
     this reason — so that claim is worth enforcing rather than trusting.
     (AISystems/Vendors/AuditLog are deliberately targeted subsets of
     later-added columns, so they are not checked here.) */
  const FULL_RECONCILE_LISTS = ['Risks', 'Actions', 'Controls'];

  for (const list of FULL_RECONCILE_LISTS) {
    test(`COLUMN_RECONCILE.${list} covers every column in DEFS.${list}`, () => {
      const defStart = store.indexOf('    ' + list + ': [');
      assert.ok(defStart > -1, `DEFS.${list} not found`);
      const defBlock = store.slice(defStart, store.indexOf('\n    ],', defStart));
      const declared = [...defBlock.matchAll(/name: '([A-Za-z0-9_]+)'/g)].map(m => m[1]);
      assert.ok(declared.length, `no columns parsed out of DEFS.${list}`);

      // Anchored INSIDE the COLUMN_RECONCILE block: DEFS declares its
      // lists with the same `Name: [` shape and appears earlier in the
      // file, so an unanchored match silently compares DEFS against
      // itself and passes no matter what the reconcile map says.
      const recBlock = store.slice(store.indexOf('var COLUMN_RECONCILE'), store.indexOf('\n  };', store.indexOf('var COLUMN_RECONCILE')));
      const recMatch = new RegExp(list + ": \\[([^\\]]*)\\]").exec(recBlock);
      assert.ok(recMatch, `COLUMN_RECONCILE.${list} not found`);
      const reconciled = new Set([...recMatch[1].matchAll(/'([^']+)'/g)].map(m => m[1]));

      const missing = declared.filter(c => !reconciled.has(c));
      assert.deepEqual(missing, [],
        `COLUMN_RECONCILE.${list} is missing ${missing.join(', ')} — a tenant provisioned before ` +
        `those columns existed would never receive them, and the next write would fail with ` +
        `"Field not recognized"`);
    });
  }

  test('the new fields are both read back and written', () => {
    // A column that is declared but never mapped is invisible: the read
    // path is what turns it into a risk property, and both write paths
    // are what persist it.
    for (const [field, prop] of [['Cia', 'cia'], ['LastReviewed', 'lastReviewed'], ['ResidualL', 'resL']]) {
      assert.match(store, new RegExp(prop + ':[^,;]*f\\.' + field), `${field} is never read back into ${prop}`);
    }
    // The SharePoint-backed updateRisk specifically — the demo store
    // defines one too, earlier in the file, and it keeps risks in memory
    // where no column mapping is needed. Anchoring on the patch call is
    // what distinguishes them.
    const patch = store.slice(store.indexOf("patchItem('Risks'"), store.indexOf("patchItem('Risks'") + 1400);
    for (const col of NEW_RISK_COLUMNS) {
      assert.match(patch, new RegExp(col + ':'), `the Risks patch never persists ${col}`);
    }
  });

  test('the tenant-configurable review cadence is a real setting with a 90-day default', () => {
    const m = /\{ key: 'riskReviewCadenceDays'[^}]*def: '(\d+)'/.exec(store);
    assert.ok(m, 'riskReviewCadenceDays is not declared in THRESHOLD_DEFS');
    assert.equal(m[1], '90', 'the default should match the framework template\'s quarterly commitment');
  });
});

describe('CIA classification', () => {
  /* normaliseCia() lives inside app.js's IIFE, so it is exercised here
     the way the favicon geometry test exercises updateFavicon(): by
     reading the source. What matters is that it maps to a canonical
     subset in a fixed order and drops anything it does not recognise —
     a register with a stray "X" in the CIA column is worse than a blank
     one, because a blank at least reads as "not classified". */
  const fn = (() => {
    const start = app.indexOf('function normaliseCia(');
    assert.ok(start > -1, 'normaliseCia() has been renamed or removed');
    return app.slice(start, app.indexOf('\n  }', start));
  })();

  test('it returns a canonical, fixed-order subset', () => {
    assert.match(fn, /\['C', 'I', 'A'\]\.filter/,
      'the result should be built from the canonical order, not from input order');
  });

  test('it accepts spelled-out words as well as initials', () => {
    for (const word of ['CONF', 'INTEG', 'AVAIL']) {
      assert.ok(fn.includes("'" + word + "'"), `"${word}…" is not recognised`);
    }
  });

  test('the register and the add form both expose it', () => {
    assert.match(html, /id="nrCia"/, 'the add-risk form has no CIA input');
    assert.match(html, /<th scope="col">CIA<\/th>/, 'the register has no CIA column');
    assert.match(app, /function ciaChips\(/, 'nothing renders the CIA value');
  });

  test('an unclassified risk renders an explicit dash, not an empty cell', () => {
    const chips = app.slice(app.indexOf('function ciaChips('), app.indexOf('\n  }', app.indexOf('function ciaChips(')));
    assert.match(chips, /—/, 'a blank CIA should read as "not classified", not as a rendering bug');
  });
});

describe('the assessed-residual and review actions are wired', () => {
  for (const action of ['markRiskReviewed', 'recordAssessedResidual']) {
    test(`App.${action} exists and is gated for read-only sessions`, () => {
      assert.match(app, new RegExp(action + ': async function'), `App.${action} is not defined`);
      const mutating = app.slice(app.indexOf('var MUTATING_ACTIONS'), app.indexOf('var HIDE_ACTIONS'));
      assert.match(mutating, new RegExp("'" + action + "'"),
        `${action} writes to the register but is missing from MUTATING_ACTIONS, so a Viewer would see a live button`);
    });
  }

  test('clearing both residual fields is possible, so an assessment is reversible', () => {
    const fn = app.slice(app.indexOf('recordAssessedResidual: async function'), app.indexOf('acceptRisk: async function'));
    assert.match(fn, /r\.resL = null; r\.resI = null/,
      'there is no path back to the derived estimate once an assessment is recorded');
  });

  test('a half-completed assessment is rejected at the modal rather than half-saved', () => {
    const fn = app.slice(app.indexOf('recordAssessedResidual: async function'), app.indexOf('acceptRisk: async function'));
    assert.match(fn, /hasL !== hasI/, 'nothing stops one of the two numbers being saved alone');
  });
});
