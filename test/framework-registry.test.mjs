// Extends the round-1 suite (lib.test.mjs) with structural checks over
// the whole framework registry — the control-code data, not the scoring
// logic. Every framework/framework-modifier task touches this registry
// (adding a control, fixing a cross-mapping, introducing a new
// category/maturity/depth field), and the failure modes are easy to
// introduce by hand: a duplicated code, a map reference to a control
// that got renamed or never existed, an empty title, a level/category
// field with a typo'd value. This suite exists to catch those the
// moment they land, not the next time someone happens to eyeball the
// SoA for the affected framework.
//
// Since the content-pack split, ISO 27001 (the included baseline) is
// the only framework whose real control data still lives in store.js —
// the other six ship as empty stubs (see the "premium content is not
// shipped in the bundle" suite below) and their real data lives only in
// checkpoint-content/*.json, the plaintext pack SOURCE (never shipped —
// see scripts/build-content-packs.mjs). REGISTRY below stitches the two
// back together, exactly as mergeLicensedPacks() does at runtime for a
// fully-licensed tenant, so every structural check that used to run
// against window.FRAMEWORKS keeps running against the same real data —
// it just now reads six of those seven frameworks straight from their
// pack source files instead of from window.FRAMEWORKS.
//
// store.js is a plain (non-module) script that assigns onto `window`
// rather than exporting — the same shape used to exercise it outside
// the browser when verifying registry changes by hand during
// development. Stub `window` before requiring it so its top-level code
// (which reads window.CHECKPOINT_CONFIG) doesn't throw.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import CheckpointLib from '../public/checkpoint/lib.js';

const require = createRequire(import.meta.url);
global.window = global.window || {};
window.CHECKPOINT_CONFIG = window.CHECKPOINT_CONFIG || { scopesProvision: [] };
require('../public/checkpoint/store.js');
require('../public/checkpoint/guidance.js');

const { FRAMEWORKS, FRAMEWORK_ORDER, NIST_SUBCATEGORIES, CHECK_DEFS, CHECK_E8, CHECK_IS18, GUIDANCE, allControlSeeds } = window;
const { parseMapTokens } = CheckpointLib;

const PREMIUM_FRAMEWORKS = FRAMEWORK_ORDER.filter((fw) => fw !== 'iso27001');

function loadPack(moduleId) {
  return JSON.parse(readFileSync(new URL(`../checkpoint-content/${moduleId}.json`, import.meta.url)));
}

const PACKS = {};
PREMIUM_FRAMEWORKS.forEach((fw) => { PACKS[fw] = loadPack(fw); });

// The registry as a fully-licensed tenant would see it at runtime, once
// mergeLicensedPacks() has merged every purchased pack in — see app.js.
const REGISTRY = { iso27001: FRAMEWORKS.iso27001 };
PREMIUM_FRAMEWORKS.forEach((fw) => { REGISTRY[fw] = PACKS[fw].framework; });
const MERGED_NIST_SUBCATEGORIES = PACKS.nistcsf.extra.subcategories;

/* Kept in sync BY HAND with graph.js's CAPABILITY_PROBES keys (see the
   comment above CHECK_DEFS in store.js for why this isn't derived from
   one shared source) — this test exists so a typo'd or renamed
   requiresCapability value fails loudly here instead of silently never
   matching anything in Graph.detectCapabilities() at runtime, which
   would make that check permanently show as "review" via a real failed
   Graph call instead of ever gracefully degrading to "manual". */
const KNOWN_CAPABILITY_KEYS = ['conditionalAccess', 'identityProtection', 'pim', 'intune', 'secureScore', 'sensitivityLabels', 'accessReviews', 'sharePointSettings'];

describe('premium content is not shipped in the bundle', () => {
  test('every premium framework ships with an empty controls array in store.js', () => {
    PREMIUM_FRAMEWORKS.forEach((fw) => {
      assert.deepEqual(FRAMEWORKS[fw].controls, [], `${fw} must ship empty in store.js — its real controls belong only in checkpoint-content/${fw}.json's encrypted pack, merged in at runtime by mergeLicensedPacks() for a licensed tenant`);
    });
  });
  test('window.NIST_SUBCATEGORIES ships empty (the real 106 rows live only in the nistcsf pack)', () => {
    assert.deepEqual(NIST_SUBCATEGORIES, []);
  });
  test('window.CHECK_E8 ships empty (the real lookup lives only in the essential8 pack)', () => {
    assert.deepEqual(Object.keys(CHECK_E8), []);
  });
  test('window.CHECK_IS18 ships empty (the real lookup lives only in the is18 pack)', () => {
    assert.deepEqual(Object.keys(CHECK_IS18), []);
  });
  test('window.GUIDANCE ships with no IS18-prefixed entries — they live only in the is18 pack', () => {
    Object.keys(GUIDANCE).forEach((k) => {
      assert.ok(!k.startsWith('IS18.'), `${k} is an IS18 guidance key shipped in guidance.js — it should live only in checkpoint-content/is18.json's pack`);
    });
  });
  test('window.GUIDANCE ships with no SOC2 (CC/A/C/PI/P-prefixed) entries — ISO 27001 only', () => {
    const soc2Codes = new Set(PACKS.soc2.framework.controls.map((c) => c.code));
    Object.keys(GUIDANCE).forEach((k) => {
      assert.ok(!soc2Codes.has(k), `${k} is a SOC2 guidance key shipped in store.js/guidance.js — it should live only in checkpoint-content/soc2.json's pack`);
    });
  });
});

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
  test('every framework has a non-empty controls array once fully licensed (iso27001 shipped, the rest from their content pack)', () => {
    FRAMEWORK_ORDER.forEach((fw) => {
      assert.ok(Array.isArray(REGISTRY[fw].controls) && REGISTRY[fw].controls.length > 0, `${fw} has no controls`);
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
      REGISTRY[fw].controls.forEach((c) => {
        if (seenIn.has(c.code)) dupes.push(`${c.code}  (${seenIn.get(c.code)} vs ${fw})`);
        else seenIn.set(c.code, fw);
      });
    });
    assert.deepEqual(dupes, [], `duplicate control codes across frameworks (codes double as risk-register lookup keys — a collision means a risk's control reference is ambiguous):\n${dupes.join('\n')}`);
  });

  test('no control has an empty or whitespace-only title', () => {
    const bad = [];
    FRAMEWORK_ORDER.forEach((fw) => {
      REGISTRY[fw].controls.forEach((c) => {
        if (!c.t || !String(c.t).trim()) bad.push(`${fw}|${c.code}`);
      });
    });
    assert.deepEqual(bad, []);
  });

  test('no control has an empty or missing code', () => {
    const bad = [];
    FRAMEWORK_ORDER.forEach((fw) => {
      REGISTRY[fw].controls.forEach((c) => {
        if (!c.code || !String(c.code).trim()) bad.push(`${fw}|"${c.t}"`);
      });
    });
    assert.deepEqual(bad, []);
  });
});

describe('map field cross-references', () => {
  test('every internal map reference resolves to a control code that actually exists', () => {
    const codesByFw = {};
    FRAMEWORK_ORDER.forEach((fw) => { codesByFw[fw] = new Set(REGISTRY[fw].controls.map((c) => c.code)); });

    const dangling = [];
    FRAMEWORK_ORDER.forEach((fw) => {
      REGISTRY[fw].controls.forEach((c) => {
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

describe('allControlSeeds() — shipped (unlicensed) behaviour', () => {
  test('count matches the sum of every framework\'s controls array exactly, including empty premium stubs', () => {
    const seeds = allControlSeeds();
    const expected = FRAMEWORK_ORDER.reduce((n, fw) => n + FRAMEWORKS[fw].controls.length, 0);
    assert.equal(seeds.length, expected);
  });

  test('never includes a lazily-seeded NIST CSF subcategory row', () => {
    // allControlSeeds() drives automatic provisioning for every
    // nistcsf-entitled tenant — subcategories must only ever be added
    // via the explicit ensureNistSubcategories() opt-in path.
    const categoryCodes = new Set(REGISTRY.nistcsf.controls.map((c) => c.code));
    allControlSeeds().filter((s) => s.fw === 'nistcsf').forEach((s) => {
      assert.ok(categoryCodes.has(s.code), `${s.code} is a NIST CSF subcategory leaking into allControlSeeds() — it must stay lazily-seeded only`);
    });
  });

  test('no seed code collides with a NIST_SUBCATEGORIES code', () => {
    const seedCodes = new Set(allControlSeeds().map((s) => s.code));
    MERGED_NIST_SUBCATEGORIES.forEach((s) => {
      assert.ok(!seedCodes.has(s.code), `subcategory code ${s.code} collides with a seeded control code`);
    });
  });
});

describe('allControlSeeds() — fully-licensed merge fidelity', () => {
  test('merging every premium pack in and re-running allControlSeeds() reproduces the old static registry exactly', () => {
    // Simulates mergeLicensedPacks() for a fully-licensed entitlement:
    // replace each empty stub's controls with its pack's, call
    // allControlSeeds() (itself unchanged — see store.js), and confirm
    // the result is exactly the pre-split static registry, snapshotted
    // in checkpoint-content/*.json (the extraction was scripted, not
    // hand-transcribed, specifically to make this comparison exact).
    const saved = {};
    PREMIUM_FRAMEWORKS.forEach((fw) => { saved[fw] = FRAMEWORKS[fw].controls; FRAMEWORKS[fw].controls = PACKS[fw].framework.controls; });
    try {
      const merged = allControlSeeds();
      const expectedTotal = FRAMEWORK_ORDER.reduce((n, fw) => n + REGISTRY[fw].controls.length, 0);
      assert.equal(merged.length, expectedTotal);
      FRAMEWORK_ORDER.forEach((fw) => {
        const gotCodes = merged.filter((s) => s.fw === fw).map((s) => s.code).sort();
        const wantCodes = REGISTRY[fw].controls.map((c) => c.code).sort();
        assert.deepEqual(gotCodes, wantCodes, `${fw}'s merged seed codes don't match its pack/shipped registry exactly`);
      });
    } finally {
      PREMIUM_FRAMEWORKS.forEach((fw) => { FRAMEWORKS[fw].controls = saved[fw]; });
    }
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
    REGISTRY.soc2.controls.forEach((c) => {
      assert.ok(valid.includes(c.cat), `${c.code} has invalid/missing cat "${c.cat}"`);
    });
  });
  test('a control\'s cat matches what its own code prefix implies', () => {
    REGISTRY.soc2.controls.forEach((c) => {
      assert.equal(c.cat, inferCat(c.code), `${c.code}'s cat "${c.cat}" doesn't match its code prefix`);
    });
  });
});

describe('Essential Eight — maturity level (lvl) consistency', () => {
  function strategyOf(code) { return code.split('-ML')[0]; }
  test('every strategy has exactly one parent row (no lvl) and children at lvl 1, 2, 3', () => {
    const byStrategy = new Map();
    REGISTRY.essential8.controls.forEach((c) => {
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
    REGISTRY.essential8.controls.filter((c) => c.lvl !== undefined).forEach((c) => {
      assert.equal(c.code, `${strategyOf(c.code)}-ML${c.lvl}`, `${c.code}'s code doesn't match its own lvl field`);
    });
  });
});

describe('NIST CSF — subcategory/parent consistency', () => {
  test('every subcategory\'s parent is a real nistcsf category code', () => {
    const categoryCodes = new Set(REGISTRY.nistcsf.controls.map((c) => c.code));
    MERGED_NIST_SUBCATEGORIES.forEach((s) => {
      assert.ok(categoryCodes.has(s.parent), `${s.code}'s parent "${s.parent}" is not a real nistcsf category code`);
    });
  });
  test('a subcategory\'s own code is prefixed by its declared parent', () => {
    MERGED_NIST_SUBCATEGORIES.forEach((s) => {
      assert.ok(s.code.startsWith(`${s.parent}-`), `${s.code} doesn't start with its declared parent "${s.parent}-"`);
    });
  });
  test('every one of the 22 categories has at least one subcategory', () => {
    const withSubs = new Set(MERGED_NIST_SUBCATEGORIES.map((s) => s.parent));
    REGISTRY.nistcsf.controls.forEach((c) => {
      assert.ok(withSubs.has(c.code), `category ${c.code} has no entries in NIST_SUBCATEGORIES`);
    });
  });
  test('no duplicate subcategory codes', () => {
    const seen = new Set();
    const dupes = [];
    MERGED_NIST_SUBCATEGORIES.forEach((s) => { if (seen.has(s.code)) dupes.push(s.code); seen.add(s.code); });
    assert.deepEqual(dupes, []);
  });
});

describe('IS18 (QGEA) — pack structure, scan-suggest map and guidance consistency', () => {
  const IS18 = PACKS.is18;
  const is18Codes = new Set(IS18.framework.controls.map((c) => c.code));
  const checkIds = new Set(CHECK_DEFS.map((c) => c.id));
  const checkIs18 = IS18.extra.checkIs18 || {};

  test('every control code carries the IS18. prefix (dot-segmented for constellation theming)', () => {
    IS18.framework.controls.forEach((c) => {
      assert.match(c.code, /^IS18\.\d+\.\d+$/, `${c.code} doesn't match the IS18.<section>.<n> shape lib.js's parseMapTokens/constellationTheme expect`);
    });
  });

  test('extra.checkIs18: every key is a real CHECK_DEFS id', () => {
    Object.keys(checkIs18).forEach((id) => {
      assert.ok(checkIds.has(id), `checkIs18 has an entry for "${id}", which isn't a CHECK_DEFS id — it would silently never suggest anything`);
    });
  });

  test('extra.checkIs18: every mapped code is a real is18 control code', () => {
    Object.keys(checkIs18).forEach((id) => {
      checkIs18[id].forEach((code) => {
        assert.ok(is18Codes.has(code), `checkIs18["${id}"] references "${code}", which isn't a real is18 control`);
      });
    });
  });

  test('guidance: every key is a real is18 control code, and every control has a guidance entry', () => {
    const guidanceKeys = Object.keys(IS18.guidance || {});
    guidanceKeys.forEach((k) => {
      assert.ok(is18Codes.has(k), `guidance key "${k}" isn't a real is18 control code`);
    });
    IS18.framework.controls.forEach((c) => {
      assert.ok(IS18.guidance[c.code], `${c.code} has no guidance entry — every IS18 control ships with how/evidence guidance`);
    });
  });

  test('guidance.checks entries are real CHECK_DEFS ids and never disagree with checkIs18', () => {
    Object.keys(IS18.guidance).forEach((code) => {
      (IS18.guidance[code].checks || []).forEach((id) => {
        assert.ok(checkIds.has(id), `guidance["${code}"].checks references "${id}", which isn't a CHECK_DEFS id`);
      });
    });
    // the same never-disagree contract CHECK_CONTROLS/GUIDANCE hold for ISO 27001
    Object.keys(checkIs18).forEach((id) => {
      checkIs18[id].forEach((code) => {
        const g = IS18.guidance[code];
        assert.ok(g && (g.checks || []).includes(id), `guidance["${code}"].checks is missing "${id}", but checkIs18["${id}"] claims it covers ${code}`);
      });
    });
  });

  test('the Essential Eight section covers all eight strategies plus the annual self-assessment row', () => {
    const e8Section = IS18.framework.controls.filter((c) => c.code.startsWith('IS18.4.'));
    assert.equal(e8Section.length, 9, 'IS18.4.x should be the eight strategies plus IS18.4.9 (annual self-assessment/reporting)');
    for (let n = 1; n <= 8; n++) {
      const ctrl = e8Section.find((c) => c.code === `IS18.4.${n}`);
      assert.ok(ctrl, `IS18.4.${n} missing`);
      assert.ok(ctrl.map.includes(`E8.${n}`), `IS18.4.${n} should cross-map to E8.${n} (the bundle's whole point) — map is "${ctrl.map}"`);
    }
  });
});

describe('DISP / IRAP — domain, membershipLevel and ismChapter consistency', () => {
  test('every control has a domain in the valid set', () => {
    const valid = ['Governance', 'Personnel', 'Physical', 'ICT'];
    REGISTRY.dispirap.controls.forEach((c) => {
      assert.ok(valid.includes(c.domain), `${c.code} has invalid/missing domain "${c.domain}"`);
    });
  });
  test('every control has a membershipLevel in the valid set', () => {
    const valid = ['Entry', 'L1', 'L2', 'L3'];
    REGISTRY.dispirap.controls.forEach((c) => {
      assert.ok(valid.includes(c.membershipLevel), `${c.code} has invalid/missing membershipLevel "${c.membershipLevel}"`);
    });
  });
  test('ismChapter is set on every ICT-domain control and only ICT-domain controls', () => {
    REGISTRY.dispirap.controls.forEach((c) => {
      if (c.domain === 'ICT') assert.ok(c.ismChapter && String(c.ismChapter).trim(), `ICT control ${c.code} is missing ismChapter`);
      else assert.ok(!c.ismChapter, `non-ICT control ${c.code} (domain: ${c.domain}) unexpectedly has ismChapter set`);
    });
  });
});

describe('CHECK_DEFS — posture-check definitions', () => {
  test('has exactly 25 checks (the number the Dashboard\'s "X of 25" coverage line assumes)', () => {
    assert.equal(CHECK_DEFS.length, 25);
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
  test('every tpl value is a real check id (self-referential — a check\'s own risk-proposal template is keyed by that same check\'s id in app.js\'s TPL, never a different one)', () => {
    const ids = new Set(CHECK_DEFS.map((c) => c.id));
    CHECK_DEFS.forEach((c) => {
      if (c.tpl) assert.ok(ids.has(c.tpl), `${c.id}'s tpl "${c.tpl}" isn't a real CHECK_DEFS id`);
    });
  });
});

describe('CHECK_CONTROLS / GUIDANCE — check-to-control cross-referencing stays in sync', () => {
  const CHECK_CONTROLS = window.CHECK_CONTROLS;
  const checkIds = new Set(CHECK_DEFS.map((c) => c.id));
  const iso27001Codes = new Set(FRAMEWORKS.iso27001.controls.map((c) => c.code));

  test('every CHECK_CONTROLS key is a real CHECK_DEFS id', () => {
    Object.keys(CHECK_CONTROLS).forEach((id) => {
      assert.ok(checkIds.has(id), `CHECK_CONTROLS has an entry for "${id}", which isn't a CHECK_DEFS id`);
    });
  });
  test('every CHECK_CONTROLS control code is a real ISO 27001 control', () => {
    Object.keys(CHECK_CONTROLS).forEach((id) => {
      CHECK_CONTROLS[id].forEach((code) => {
        assert.ok(iso27001Codes.has(code), `CHECK_CONTROLS["${id}"] references "${code}", which isn't a real ISO 27001 control code`);
      });
    });
  });
  test('every GUIDANCE.checks entry is a real CHECK_DEFS id', () => {
    Object.keys(GUIDANCE).forEach((code) => {
      (GUIDANCE[code].checks || []).forEach((id) => {
        assert.ok(checkIds.has(id), `GUIDANCE["${code}"].checks references "${id}", which isn't a CHECK_DEFS id`);
      });
    });
  });
  test('a check with real controls in CHECK_CONTROLS is cross-referenced back from GUIDANCE on every one of those controls (the two are meant to never disagree — see guidance.js\'s own header comment)', () => {
    Object.keys(CHECK_CONTROLS).forEach((id) => {
      CHECK_CONTROLS[id].forEach((code) => {
        const g = GUIDANCE[code];
        if (!g) return; // a control with no guidance entry yet is a separate, pre-existing gap — not this test's concern
        assert.ok((g.checks || []).includes(id), `GUIDANCE["${code}"].checks is missing "${id}", but CHECK_CONTROLS["${id}"] claims it covers ${code}`);
      });
    });
  });
});
