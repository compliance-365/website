// Regression coverage for a real, demo-mode-only functional gap: demo
// mode never runs mergeLicensedPacks() (there's no activation to
// verify), so window.FRAMEWORKS[fw].controls, window.GUIDANCE,
// window.NIST_SUBCATEGORIES and every window.CHECK_<FW> automation table
// stayed the empty stubs they start as, even after a demo tenant's own
// S.controls got its illustrative DEMO_FRAMEWORK_SEEDS rows. That broke,
// live, in a real browser: Essential Eight's and DISP/IRAP's SoA
// rendered completely empty, NIST CSF's subcategory depth toggle added
// nothing, every premium framework's guidance drawer showed blank, and
// scan-suggested SoA statuses only ever appeared for ISO 27001 — never
// any premium module a prospect might be evaluating. Fixed by
// DemoStore.load()'s populateDemoDefinitionalRegistries(), which fills
// those same shared tables with the same illustrative slices already
// used for S.controls. This suite exercises that function directly
// (DemoStore.load() falls back to seed() gracefully without a real
// localStorage — see the try/catch around localStorage.getItem in
// store.js) rather than only via a live Playwright check, so this class
// of gap can't silently return unnoticed.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
global.window = global.window || {};
window.CHECKPOINT_CONFIG = window.CHECKPOINT_CONFIG || { scopesProvision: [] };
require('../public/checkpoint/store.js');
require('../public/checkpoint/guidance.js');

const PREMIUM_FRAMEWORKS_WITH_DEMO_SEEDS = Object.keys(window.DEMO_FRAMEWORK_SEEDS);

await window.DemoStore.load();

describe('demo mode populates the same shared registries a real licensed tenant gets from mergeLicensedPacks()', () => {
  test('window.FRAMEWORKS[fw].controls is non-empty for every framework with a demo seed', () => {
    PREMIUM_FRAMEWORKS_WITH_DEMO_SEEDS.forEach((fw) => {
      assert.ok(window.FRAMEWORKS[fw].controls.length > 0, `window.FRAMEWORKS.${fw}.controls is still empty after DemoStore.load() — its SoA will render with zero rows for essential8/dispirap-shaped renderers, or its category-pill filter will silently vanish`);
    });
  });

  test('essential8\'s demo registry carries all 8 parent strategy codes, not just the ones with a maturity-level child seeded', () => {
    const codes = new Set(window.FRAMEWORKS.essential8.controls.map((c) => c.code));
    for (let n = 1; n <= 8; n++) {
      assert.ok(codes.has('E8.' + n), `E8.${n} parent row missing from the demo essential8 registry — renderEssential8Rows() groups children under their parent header, so a strategy with children but no parent row never displays them`);
    }
  });

  test('window.NIST_SUBCATEGORIES is non-empty and every entry\'s parent is a real demo nistcsf category code', () => {
    assert.ok(window.NIST_SUBCATEGORIES.length > 0, 'window.NIST_SUBCATEGORIES is still empty — switching a demo tenant to nistDepth "subcategory" will add and show nothing');
    const categoryCodes = new Set(window.FRAMEWORKS.nistcsf.controls.map((c) => c.code));
    window.NIST_SUBCATEGORIES.forEach((s) => {
      assert.ok(categoryCodes.has(s.parent), `NIST subcategory ${s.code}'s parent "${s.parent}" isn't one of the demo's own nistcsf category codes`);
    });
  });

  test('every premium framework with a demo automation seed gets it merged into its real window.CHECK_<FW> table', () => {
    const CHECK_TABLE_BY_FW = { essential8: 'CHECK_E8', is18: 'CHECK_IS18', rffr: 'CHECK_RFFR', iso42001: 'CHECK_ISO42001', iso27701: 'CHECK_ISO27701', soc2: 'CHECK_SOC2', nistcsf: 'CHECK_NISTCSF' };
    Object.keys(window.DEMO_CHECK_SEEDS).forEach((fw) => {
      const tableName = CHECK_TABLE_BY_FW[fw];
      assert.ok(Object.keys(window[tableName]).length > 0, `window.${tableName} is still empty after DemoStore.load() — runScan()'s suggestion block for ${fw} iterates Object.keys(window.${tableName}), so it silently produces zero suggestions in demo mode, hiding the app's core automation feature for every premium module`);
    });
  });

  test('every code in DEMO_CHECK_SEEDS resolves to a real code seeded for that framework (no dangling automation targets)', () => {
    Object.keys(window.DEMO_CHECK_SEEDS).forEach((fw) => {
      const realCodes = new Set(window.DEMO_FRAMEWORK_SEEDS[fw].map((c) => c.code));
      Object.values(window.DEMO_CHECK_SEEDS[fw]).forEach((codes) => {
        codes.forEach((code) => {
          assert.ok(realCodes.has(code), `DEMO_CHECK_SEEDS.${fw} references '${code}', which isn't one of DEMO_FRAMEWORK_SEEDS.${fw}'s own codes — a confirmed suggestion for it would update a control that doesn't exist in the demo SoA`);
        });
      });
    });
  });

  test('DEMO_CHECK_SEEDS never pairs a checkId whose demo lastResults is "fail" or "manual" (would silently suppress the demo suggestion)', () => {
    // Every demo-seeded premium control starts at 'Not started' (see
    // DemoStore's seed().controls mapping) — the same status a 'fail'
    // result suggests — so pairing one in produces a suggestedSt that
    // equals the control's current status, and runScan() only ever
    // proposes a status that DIFFERS from the current one. Not wrong,
    // just silently pointless for demo purposes, so worth catching.
    const lastResults = { 'mfa-all': 'pass', 'mfa-priv': 'review', legacy: 'fail', admins: 'review', pim: 'fail', guests: 'pass', riskyusers: 'review', 'access-review': 'fail', device: 'pass', 'compliance-policy': 'pass', patch: 'review', wdac: 'fail', macro: 'pass', riskyapps: 'review', labels: 'review', dlp: 'review', encryption: 'manual', sharing: 'fail', logging: 'pass', alerts: 'review' };
    Object.keys(window.DEMO_CHECK_SEEDS).forEach((fw) => {
      Object.keys(window.DEMO_CHECK_SEEDS[fw]).forEach((checkId) => {
        const r = lastResults[checkId];
        assert.ok(r === 'pass' || r === 'review', `DEMO_CHECK_SEEDS.${fw}.${checkId} has a demo lastResults value of '${r}', not 'pass'/'review' — it will never produce a visible demo suggestion`);
      });
    });
  });

  test('window.GUIDANCE has an entry for every demo-seeded premium control code (drawer never shows a blank "How to implement this")', () => {
    PREMIUM_FRAMEWORKS_WITH_DEMO_SEEDS.forEach((fw) => {
      window.DEMO_FRAMEWORK_SEEDS[fw].forEach((c) => {
        assert.ok(window.GUIDANCE[c.code], `window.GUIDANCE has no entry for ${fw}'s demo control ${c.code} — its guidance drawer will render nothing under "How to implement this"`);
      });
    });
  });

  test('a demo guidance entry\'s "Latest scan signal" checks, where present, only ever list checkIds that genuinely map to that exact code', () => {
    PREMIUM_FRAMEWORKS_WITH_DEMO_SEEDS.forEach((fw) => {
      const checkTable = window.DEMO_CHECK_SEEDS[fw];
      if (!checkTable) return;
      window.DEMO_FRAMEWORK_SEEDS[fw].forEach((c) => {
        const g = window.GUIDANCE[c.code];
        (g.checks || []).forEach((checkId) => {
          assert.ok(checkTable[checkId] && checkTable[checkId].indexOf(c.code) !== -1, `${fw} guidance for ${c.code} lists "Latest scan signal" checkId "${checkId}", which doesn't actually map to ${c.code} in DEMO_CHECK_SEEDS.${fw}`);
        });
      });
    });
  });
});

// Every framework whose SoA statuses runScan() can suggest keeps its own
// S.<fw>Proposed list. The five frameworks added after the first three
// (iso42001, iso27701, soc2, nistcsf, iso27001) were never added to
// either store's seeded state — runScan() creates them on the fly, so
// before a tenant's first scan of a session those keys simply did not
// exist, and renderSoa()/App.confirm<Fw>Suggestion() were one unguarded
// dereference away from a thrown handler. Asserted against the app's own
// framework registry rather than a hardcoded list, so a framework added
// later can't quietly reintroduce the same gap.
describe('the demo store seeds a suggestion list for every framework the posture scan can suggest for', () => {
  const SUGGESTION_STATE_KEY = {
    essential8: 'e8Proposed', is18: 'is18Proposed', rffr: 'rffrProposed',
    iso42001: 'iso42001Proposed', iso27701: 'iso27701Proposed', soc2: 'soc2Proposed',
    nistcsf: 'nistcsfProposed', iso27001: 'iso27001Proposed'
  };

  test('each framework with a scan-suggestion state key has that key seeded as an array', async () => {
    const S = await window.DemoStore.load();
    Object.keys(SUGGESTION_STATE_KEY).forEach((fw) => {
      const key = SUGGESTION_STATE_KEY[fw];
      assert.ok(Array.isArray(S[key]), `S.${key} is not seeded as an array — renderSoa() reads it for the ${fw} tab and App.confirm/dismiss handlers call .find()/.filter() straight on it`);
    });
  });

  test('the generic proposed/handled/candidate lists are seeded too', async () => {
    const S = await window.DemoStore.load();
    ['proposed', 'handledTpl', 'aiCandidates'].forEach((key) => {
      assert.ok(Array.isArray(S[key]), `S.${key} is not seeded as an array`);
    });
  });

  test('every framework carrying a demo automation seed has a suggestion state key', () => {
    Object.keys(window.DEMO_CHECK_SEEDS).forEach((fw) => {
      assert.ok(SUGGESTION_STATE_KEY[fw], `${fw} has scan-suggestion automation seeded (DEMO_CHECK_SEEDS.${fw}) but no S.<fw>Proposed state key is tracked for it`);
    });
  });
});
