// Extends the round-1 suite (lib.test.mjs) with structural checks over
// the whole window.FRAMEWORKS registry in store.js — the control-code
// data, not the scoring logic. Every framework/framework-modifier task
// touches this registry (adding a control, fixing a cross-mapping,
// introducing a new category/maturity/depth field), and the failure
// modes are easy to introduce by hand: a duplicated code, a map
// reference to a control that got renamed or never existed, an empty
// title, a level/category field with a typo'd value. This suite exists
// to catch those the moment they land, not the next time someone
// happens to eyeball the SoA for the affected framework.
//
// store.js is a plain (non-module) script that assigns onto `window`
// rather than exporting — the same shape used to exercise it outside
// the browser when verifying registry changes by hand during
// development. Stub `window` before requiring it so its top-level code
// (which reads window.CHECKPOINT_CONFIG) doesn't throw.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import CheckpointLib from '../public/checkpoint/lib.js';

const require = createRequire(import.meta.url);
global.window = global.window || {};
window.CHECKPOINT_CONFIG = window.CHECKPOINT_CONFIG || { scopesProvision: [] };
require('../public/checkpoint/store.js');

const { FRAMEWORKS, FRAMEWORK_ORDER, NIST_SUBCATEGORIES, CHECK_DEFS, allControlSeeds } = window;
const { parseMapTokens } = CheckpointLib;

/* Kept in sync BY HAND with graph.js's CAPABILITY_PROBES keys (see the
   comment above CHECK_DEFS in store.js for why this isn't derived from
   one shared source) — this test exists so a typo'd or renamed
   requiresCapability value fails loudly here instead of silently never
   matching anything in Graph.detectCapabilities() at runtime, which
   would make that check permanently show as "review" via a real failed
   Graph call instead of ever gracefully degrading to "manual". */
const KNOWN_CAPABILITY_KEYS = ['conditionalAccess', 'identityProtection', 'pim', 'intune', 'secureScore'];

describe('FRAMEWORK_ORDER <-> FRAMEWORKS consistency', () => {
  test('every id in FRAMEWORK_ORDER has a matching entry in FRAMEWORKS', () => {
    FRAMEWORK_ORDER.forEach((fw) => {
      assert.ok(FRAMEWORKS[fw], `FRAMEWORK_ORDER references unknown framework "${fw}"`);
    });
  });
  test('every entry in FRAMEWORKS is listed in FRAMEWORK_ORDER', () => {
    Object.keys(FRAMEWORKS).forEach((fw) => {
      assert.ok(FRAMEWORK_ORDER.includes(fw), `FRAMEWORKS has "${fw}" but it's missing from FRAMEWORK_ORDER — it will never be seeded, shown in the sidebar, or reachable from the SoA`);
    });
  });
  test('every framework has a non-empty controls array', () => {
    FRAMEWORK_ORDER.forEach((fw) => {
      assert.ok(Array.isArray(FRAMEWORKS[fw].controls) && FRAMEWORKS[fw].controls.length > 0, `${fw} has no controls`);
    });
  });
});

describe('control codes', () => {
  test('every control code is unique across the whole registry', () => {
    // ISO 27001 and ISO 42001 used to collide here (both used their own
    // standard's bare Annex A numbering, e.g. "A.5.2", with no
    // per-framework prefix) — fixed by renaming ISO 42001's codes to an
    // "AI." prefix (e.g. "A.2.2" -> "AI.2.2"), so this is a plain,
    // unconditional uniqueness check with no allowlist.
    const seenIn = new Map();
    const dupes = [];
    FRAMEWORK_ORDER.forEach((fw) => {
      FRAMEWORKS[fw].controls.forEach((c) => {
        if (seenIn.has(c.code)) dupes.push(`${c.code}  (${seenIn.get(c.code)} vs ${fw})`);
        else seenIn.set(c.code, fw);
      });
    });
    assert.deepEqual(dupes, [], `duplicate control codes across frameworks (codes double as risk-register lookup keys — a collision means a risk's control reference is ambiguous):\n${dupes.join('\n')}`);
  });

  test('no control has an empty or whitespace-only title', () => {
    const bad = [];
    FRAMEWORK_ORDER.forEach((fw) => {
      FRAMEWORKS[fw].controls.forEach((c) => {
        if (!c.t || !String(c.t).trim()) bad.push(`${fw}|${c.code}`);
      });
    });
    assert.deepEqual(bad, []);
  });

  test('no control has an empty or missing code', () => {
    const bad = [];
    FRAMEWORK_ORDER.forEach((fw) => {
      FRAMEWORKS[fw].controls.forEach((c) => {
        if (!c.code || !String(c.code).trim()) bad.push(`${fw}|"${c.t}"`);
      });
    });
    assert.deepEqual(bad, []);
  });
});

describe('map field cross-references', () => {
  test('every internal map reference resolves to a control code that actually exists', () => {
    const codesByFw = {};
    FRAMEWORK_ORDER.forEach((fw) => { codesByFw[fw] = new Set(FRAMEWORKS[fw].controls.map((c) => c.code)); });

    const dangling = [];
    FRAMEWORK_ORDER.forEach((fw) => {
      FRAMEWORKS[fw].controls.forEach((c) => {
        parseMapTokens(c.map).forEach((ref) => {
          if (!codesByFw[ref.fw] || !codesByFw[ref.fw].has(ref.code)) {
            dangling.push(`${fw}|${c.code} -> "${ref.fw}|${ref.code}" (from map: "${c.map}")`);
          }
        });
      });
    });
    assert.deepEqual(dangling, [], `map references that parse as internal but don't match any real control (renamed/typo'd code, or a framework prefix pointing at the wrong id space):\n${dangling.join('\n')}`);
  });

  test('parseMapTokens treats a genuinely external citation as external, not a dangling internal reference', () => {
    // sanity-checks the parser's own contract (documented in lib.js),
    // independent of what the registry currently contains.
    assert.deepEqual(parseMapTokens('EU AI Act Art.9'), []);
    assert.deepEqual(parseMapTokens(''), []);
    assert.deepEqual(parseMapTokens(undefined), []);
  });

  test('a bare code continuing a prefixed token inherits that token\'s framework, not treated as external', () => {
    // "ISO27001 A.5.29 · A.5.30" is two ISO 27001 codes — a real
    // shorthand used throughout the registry, not one resolved
    // reference plus one silently-dropped unresolvable token.
    assert.deepEqual(parseMapTokens('ISO27001 A.5.29 · A.5.30'), [
      { fw: 'iso27001', code: 'A.5.29' },
      { fw: 'iso27001', code: 'A.5.30' }
    ]);
  });
});

describe('allControlSeeds()', () => {
  test('count matches the sum of every framework\'s controls array exactly', () => {
    const seeds = allControlSeeds();
    const expected = FRAMEWORK_ORDER.reduce((n, fw) => n + FRAMEWORKS[fw].controls.length, 0);
    assert.equal(seeds.length, expected);
  });

  test('never includes a lazily-seeded NIST CSF subcategory row', () => {
    // allControlSeeds() drives automatic provisioning for every
    // nistcsf-entitled tenant — subcategories must only ever be added
    // via the explicit ensureNistSubcategories() opt-in path.
    const categoryCodes = new Set(FRAMEWORKS.nistcsf.controls.map((c) => c.code));
    allControlSeeds().filter((s) => s.fw === 'nistcsf').forEach((s) => {
      assert.ok(categoryCodes.has(s.code), `${s.code} is a NIST CSF subcategory leaking into allControlSeeds() — it must stay lazily-seeded only`);
    });
  });

  test('no seed code collides with a NIST_SUBCATEGORIES code', () => {
    const seedCodes = new Set(allControlSeeds().map((s) => s.code));
    NIST_SUBCATEGORIES.forEach((s) => {
      assert.ok(!seedCodes.has(s.code), `subcategory code ${s.code} collides with a seeded control code`);
    });
  });
});

describe('SOC 2 — cat field consistency', () => {
  const CAT_PREFIXES = [['CC', 'CC'], ['PI', 'PI'], ['A', 'A'], ['C', 'C'], ['P', 'P']]; // order matters: CC before C, PI before P
  function inferCat(code) {
    const hit = CAT_PREFIXES.find(([prefix]) => code.startsWith(prefix));
    return hit ? hit[1] : null;
  }
  test('every control has a cat in the valid set', () => {
    const valid = ['CC', 'A', 'C', 'PI', 'P'];
    FRAMEWORKS.soc2.controls.forEach((c) => {
      assert.ok(valid.includes(c.cat), `${c.code} has invalid/missing cat "${c.cat}"`);
    });
  });
  test('a control\'s cat matches what its own code prefix implies', () => {
    FRAMEWORKS.soc2.controls.forEach((c) => {
      assert.equal(c.cat, inferCat(c.code), `${c.code}'s cat "${c.cat}" doesn't match its code prefix`);
    });
  });
});

describe('Essential Eight — maturity level (lvl) consistency', () => {
  function strategyOf(code) { return code.split('-ML')[0]; }
  test('every strategy has exactly one parent row (no lvl) and children at lvl 1, 2, 3', () => {
    const byStrategy = new Map();
    FRAMEWORKS.essential8.controls.forEach((c) => {
      const s = strategyOf(c.code);
      if (!byStrategy.has(s)) byStrategy.set(s, []);
      byStrategy.get(s).push(c);
    });
    byStrategy.forEach((group, strategy) => {
      const parents = group.filter((c) => c.lvl === undefined);
      const children = group.filter((c) => c.lvl !== undefined).slice().sort((a, b) => a.lvl - b.lvl);
      assert.equal(parents.length, 1, `${strategy} should have exactly one parent row`);
      assert.deepEqual(children.map((c) => c.lvl), [1, 2, 3], `${strategy} should have children at lvl 1, 2 and 3`);
    });
  });
  test('a child\'s code exactly matches "<strategy>-ML<lvl>"', () => {
    FRAMEWORKS.essential8.controls.filter((c) => c.lvl !== undefined).forEach((c) => {
      assert.equal(c.code, `${strategyOf(c.code)}-ML${c.lvl}`, `${c.code}'s code doesn't match its own lvl field`);
    });
  });
});

describe('NIST CSF — subcategory/parent consistency', () => {
  test('every subcategory\'s parent is a real nistcsf category code', () => {
    const categoryCodes = new Set(FRAMEWORKS.nistcsf.controls.map((c) => c.code));
    NIST_SUBCATEGORIES.forEach((s) => {
      assert.ok(categoryCodes.has(s.parent), `${s.code}'s parent "${s.parent}" is not a real nistcsf category code`);
    });
  });
  test('a subcategory\'s own code is prefixed by its declared parent', () => {
    NIST_SUBCATEGORIES.forEach((s) => {
      assert.ok(s.code.startsWith(`${s.parent}-`), `${s.code} doesn't start with its declared parent "${s.parent}-"`);
    });
  });
  test('every one of the 22 categories has at least one subcategory', () => {
    const withSubs = new Set(NIST_SUBCATEGORIES.map((s) => s.parent));
    FRAMEWORKS.nistcsf.controls.forEach((c) => {
      assert.ok(withSubs.has(c.code), `category ${c.code} has no entries in NIST_SUBCATEGORIES`);
    });
  });
  test('no duplicate subcategory codes', () => {
    const seen = new Set();
    const dupes = [];
    NIST_SUBCATEGORIES.forEach((s) => { if (seen.has(s.code)) dupes.push(s.code); seen.add(s.code); });
    assert.deepEqual(dupes, []);
  });
});

describe('DISP / IRAP — domain, membershipLevel and ismChapter consistency', () => {
  test('every control has a domain in the valid set', () => {
    const valid = ['Governance', 'Personnel', 'Physical', 'ICT'];
    FRAMEWORKS.dispirap.controls.forEach((c) => {
      assert.ok(valid.includes(c.domain), `${c.code} has invalid/missing domain "${c.domain}"`);
    });
  });
  test('every control has a membershipLevel in the valid set', () => {
    const valid = ['Entry', 'L1', 'L2', 'L3'];
    FRAMEWORKS.dispirap.controls.forEach((c) => {
      assert.ok(valid.includes(c.membershipLevel), `${c.code} has invalid/missing membershipLevel "${c.membershipLevel}"`);
    });
  });
  test('ismChapter is set on every ICT-domain control and only ICT-domain controls', () => {
    FRAMEWORKS.dispirap.controls.forEach((c) => {
      if (c.domain === 'ICT') assert.ok(c.ismChapter && String(c.ismChapter).trim(), `ICT control ${c.code} is missing ismChapter`);
      else assert.ok(!c.ismChapter, `non-ICT control ${c.code} (domain: ${c.domain}) unexpectedly has ismChapter set`);
    });
  });
});

describe('CHECK_DEFS — posture-check definitions', () => {
  test('has exactly 22 checks (the number the Dashboard\'s "X of 22" coverage line assumes)', () => {
    assert.equal(CHECK_DEFS.length, 22);
  });
  test('every check id is unique', () => {
    const seen = new Set();
    const dupes = [];
    CHECK_DEFS.forEach((c) => { if (seen.has(c.id)) dupes.push(c.id); seen.add(c.id); });
    assert.deepEqual(dupes, []);
  });
  test('no check has an empty label', () => {
    CHECK_DEFS.forEach((c) => assert.ok(c.label && c.label.trim(), `${c.id} has an empty label`));
  });
  test('every requiresCapability value is a real capability graph.js knows how to probe', () => {
    CHECK_DEFS.forEach((c) => {
      if (c.requiresCapability) {
        assert.ok(KNOWN_CAPABILITY_KEYS.includes(c.requiresCapability), `${c.id}'s requiresCapability "${c.requiresCapability}" isn't one of graph.js's CAPABILITY_PROBES keys`);
      }
    });
  });
  test('a capability-gated check is always scored:true (an unscored check has no denominator to protect)', () => {
    CHECK_DEFS.forEach((c) => {
      if (c.requiresCapability) assert.notEqual(c.scored, false, `${c.id} is scored:false but also requiresCapability — the capability gate is meaningless here`);
    });
  });
});
