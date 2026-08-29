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
// Capabilities probed against Microsoft Graph (graph.js CAPABILITY_PROBES).
const KNOWN_CAPABILITY_KEYS = ['conditionalAccess', 'identityProtection', 'pim', 'intune', 'secureScore', 'sensitivityLabels', 'accessReviews', 'sharePointSettings', 'defenderXdr', 'priva', 'recordsManagement'];
// Capabilities that are DERIVED rather than probed, because nothing in
// Microsoft 365 knows the answer. 'aws' is set by app.js from whether the
// optional AWS collector has ever written an aws-* result for this tenant.
// Listed separately so the guard below still catches a genuine typo in a
// requiresCapability value, rather than being loosened to accept anything.
const DERIVED_CAPABILITY_KEYS = ['aws'];
const ALL_CAPABILITY_KEYS = [...KNOWN_CAPABILITY_KEYS, ...DERIVED_CAPABILITY_KEYS];

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

/* Every framework whose content pack ships a scan-suggest table (the
   checkId -> control code(s) map that drives runScan()'s Sxxx Proposed
   suggestion blocks in app.js) alongside `guidance` — generalizes the
   IS18-specific "guidance.checks entries ... never disagree with
   checkIs18" test above to every such framework, not just IS18.

   This exists because that exact class of drift shipped for real, more
   than once: `guidance[code].checks` (the "Latest scan signal" panel a
   practitioner sees when they open a control's guidance) silently fell
   out of sync with the scan-suggest table that actually drives that
   control's SoA suggestion — in RFFR (pre-existing, checked in with
   ZERO guidance entries carrying a `checks` array despite 48 controls
   having a live scan-suggest source) and in every framework's
   scan-suggest table added after IS18 (ISO 42001, ISO 27701, SOC 2,
   NIST CSF) — because adding a new entry to extra.checkXxx never
   touched the corresponding guidance entry, and only IS18 had a test
   catching the disagreement. A practitioner confirming a scan-suggested
   status change with no matching "why" shown in guidance is exactly the
   kind of automation-undermining gap this suite exists to catch before
   it ships again. */
describe('scan-suggest tables never disagree with their guidance.checks panel, across every framework', () => {
  const checkIds = new Set(CHECK_DEFS.map((c) => c.id));
  const SCAN_SUGGEST_KEY = {
    essential8: 'checkE8', is18: 'checkIs18', rffr: 'checkRffr',
    iso42001: 'checkIso42001', iso27701: 'checkIso27701', soc2: 'checkSoc2', nistcsf: 'checkNistCsf'
  };

  Object.keys(SCAN_SUGGEST_KEY).forEach((fw) => {
    describe(fw, () => {
      const pack = PACKS[fw];
      const key = SCAN_SUGGEST_KEY[fw];
      const checkMap = (pack.extra && pack.extra[key]) || {};
      const codes = new Set(pack.framework.controls.map((c) => c.code));
      const guidance = pack.guidance || {};

      test(`extra.${key}: every key is a real CHECK_DEFS id`, () => {
        Object.keys(checkMap).forEach((id) => {
          assert.ok(checkIds.has(id), `${key} has an entry for "${id}", which isn't a CHECK_DEFS id — it would silently never suggest anything`);
        });
      });

      test(`extra.${key}: every mapped code is a real ${fw} control code`, () => {
        Object.keys(checkMap).forEach((id) => {
          checkMap[id].forEach((code) => {
            assert.ok(codes.has(code), `${key}["${id}"] references "${code}", which isn't a real ${fw} control`);
          });
        });
      });

      test('guidance.checks entries are real CHECK_DEFS ids', () => {
        Object.keys(guidance).forEach((code) => {
          (guidance[code].checks || []).forEach((id) => {
            assert.ok(checkIds.has(id), `guidance["${code}"].checks references "${id}", which isn't a CHECK_DEFS id`);
          });
        });
      });

      test(`every ${key} suggestion source is reflected in that control's guidance.checks`, () => {
        Object.keys(checkMap).forEach((id) => {
          checkMap[id].forEach((code) => {
            const g = guidance[code];
            assert.ok(g && (g.checks || []).includes(id), `guidance["${code}"].checks is missing "${id}", but ${key}["${id}"] claims it covers ${code} — a practitioner confirming this scan suggestion would see no matching "Latest scan signal" in guidance`);
          });
        });
      });
    });
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
  test('check count is pinned, so adding one is a deliberate act', () => {
    // 26 Microsoft + 10 Cloud (AWS). The AWS ten are only ever populated
    // by the optional collector; app.js drops them from the Dashboard's
    // coverage denominator for a tenant that has not deployed it, so this
    // number growing does NOT mean every tenant is suddenly 10 short.
    //
    // 25 -> 26 when 'xdr-incidents' was added (Defender XDR incident
    // triage). An unlicensed tenant is unaffected: the defenderXdr
    // capability probe fails, the check degrades to 'manual', and
    // score() excludes 'manual' from its denominator entirely.
    assert.equal(CHECK_DEFS.length, 40);
    assert.equal(CHECK_DEFS.filter((c) => c.requiresCapability === 'aws').length, 10);
    assert.equal(CHECK_DEFS.filter((c) => c.requiresCapability !== 'aws').length, 30);
  });

  test('every AWS check id is namespaced, so it can never collide with a Microsoft check', () => {
    CHECK_DEFS.filter((c) => c.requiresCapability === 'aws')
      .forEach((c) => assert.ok(c.id.startsWith('aws-'), `${c.id} must start with aws-`));
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
        assert.ok(ALL_CAPABILITY_KEYS.includes(c.requiresCapability), `${c.id}'s requiresCapability "${c.requiresCapability}" is neither a graph.js CAPABILITY_PROBES key nor a known derived capability`);
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

/* app.js's TPL — the hand-written risk-proposal templates behind
   S.proposed (a scored posture-check finding, or the AI-governance
   discovery flow, proposes a risk + treatment actions a practitioner
   approves into the register) — hardcodes control codes as string
   literals (e.g. `controls: ['A.8.5', 'A.5.15']`, `control: 'A.5.9'`)
   rather than referencing the registry, so nothing catches a typo'd
   code at write time. This shipped for real: the AI-governance
   template referenced 'A.9.2', which doesn't exist anywhere in the
   registry (ISO 27001 has no "A.9" section at all — Organizational/
   People/Physical/Technological are A.5/A.6/A.7/A.8) — almost
   certainly a dropped "I" from ISO 42001's real 'AI.9.2' ("Processes
   for responsible use of AI systems"), a much better conceptual fit
   for that template's "high-privilege OAuth grant to an AI
   application" risk anyway. The practical effect wasn't a crash —
   app.js's risk-drawer control lookup fails soft on a missing match —
   it silently rendered a blank "A.9.2 — " row in "Linked controls"
   instead of the real control's title and status.

   app.js can't be required() under Node — it assumes a full browser
   environment (DOM, MSAL, etc.) from the moment it loads, unlike
   store.js/guidance.js/lib.js, which is why this reads it as plain
   text and regex-extracts the literal string arguments to `controls:`
   and `control:` rather than executing it. A code that's real in some
   OTHER entitled framework but not iso27001 is intentionally allowed
   (the AI-governance template itself now references an ISO 42001
   code), so this checks against every framework's codes combined, not
   just ISO 27001's. */
describe('app.js\'s TPL risk templates never reference a control code that doesn\'t exist anywhere in the registry', () => {
  const appJs = readFileSync(new URL('../public/checkpoint/app.js', import.meta.url), 'utf8');
  const allCodes = new Set();
  FRAMEWORK_ORDER.forEach((fw) => { REGISTRY[fw].controls.forEach((c) => allCodes.add(c.code)); });

  function extractCodes(pattern) {
    const codes = new Set();
    let m;
    while ((m = pattern.exec(appJs))) {
      (m[1].match(/'([^']+)'/g) || []).forEach((tok) => codes.add(tok.slice(1, -1)));
    }
    return codes;
  }

  test('every `controls: [...]` literal in app.js references a real control code', () => {
    const codes = extractCodes(/controls:\s*\[([^\]]*)\]/g);
    codes.forEach((code) => {
      assert.ok(allCodes.has(code), `app.js references controls: [... '${code}' ...], which isn't a real control code in any framework`);
    });
  });

  test('every `control: \'...\'` single-code literal in app.js references a real control code', () => {
    // Deliberately narrow pattern (control: '<code-shaped token>') so it
    // only matches the TPL action's own control field, not the many
    // unrelated `control` identifiers/params elsewhere in this file
    // (DOM element vars, function parameters, etc.) that happen to share
    // the word but aren't control-code references at all.
    const codes = extractCodes(/\bcontrol:\s*('[A-Za-z]{1,6}\.[\w.-]+')/g);
    codes.forEach((code) => {
      assert.ok(allCodes.has(code), `app.js references control: '${code}', which isn't a real control code in any framework`);
    });
  });

  // aiControlsFor() (the AI Systems drawer's "linked ISO 42001 controls"
  // panel) hardcodes the exact same way TPL does, and was found broken by
  // this exact class of bug: it kept returning pre-rename bare `A.x.y`
  // codes after ISO 42001's Annex A numbering was given the `AI.` prefix,
  // so openAiSystem()'s `S.controls.find(fw === 'iso42001' && ...)` silently
  // matched nothing for every AI system, every time.
  test('aiControlsFor() only ever returns real ISO 42001 control codes', () => {
    const fnMatch = appJs.match(/function aiControlsFor\(sys\) \{([\s\S]*?)\n  \}/);
    assert.ok(fnMatch, 'aiControlsFor() not found in app.js — did it get renamed or removed?');
    const iso42001Codes = new Set(REGISTRY.iso42001.controls.map((c) => c.code));
    const codes = new Set();
    // Only strings inside `var codes = [...]` and `codes.push(...)` are
    // control-code literals — other quoted strings in this function (e.g.
    // the `=== 'Completed'` status comparison) are not.
    (fnMatch[1].match(/(?:var codes = |codes\.push\()([^;)]*)/g) || []).forEach((chunk) => {
      (chunk.match(/'([^']+)'/g) || []).forEach((tok) => codes.add(tok.slice(1, -1)));
    });
    assert.ok(codes.size > 0, 'expected aiControlsFor() to reference at least one control code');
    codes.forEach((code) => {
      assert.ok(iso42001Codes.has(code), `aiControlsFor() references '${code}', which isn't a real ISO 42001 control code`);
    });
  });
});

/* A client's S.controls list keeps every framework's control rows
   forever once seeded, regardless of current entitlement — downgrading
   only flips S.entitlements[fw] off, it never deletes the SharePoint
   rows a since-removed module left behind (see reconcileControls()/
   seedControls() in store.js: additive only). Two real, ordinary-UI-
   reachable surfaces were found reading S.controls without checking
   current entitlement first: the global search index (any user typing
   into the search box could find and label a downgraded/never-licensed
   framework's real control titles) and the "Controls (SoA)" CSV/ZIP
   export (a single click could download another module's full control
   set). Both fixed by filtering on S.entitlements[c.fw] before using a
   control row. This is a static-text check (app.js can't be require()'d
   under Node) that both filters stay in place — a plausible-looking
   refactor of either function that drops the entitlement check would
   otherwise ship silently, since demo mode's toggles are always all
   consistent with S.controls and would never surface this in manual
   testing. */
describe('S.controls-derived exports and search never surface a framework the client isn\'t currently entitled to', () => {
  const appJs = readFileSync(new URL('../public/checkpoint/app.js', import.meta.url), 'utf8');

  test('buildSearchIndex()\'s controls loop checks S.entitlements[c.fw] before indexing a row', () => {
    const fnMatch = appJs.match(/function buildSearchIndex\(q\) \{([\s\S]*?)\n {2}\}/);
    assert.ok(fnMatch, 'buildSearchIndex() not found in app.js — did it get renamed?');
    const controlsBlockMatch = fnMatch[1].match(/S\.controls\.forEach\(function \(c\) \{([\s\S]*?)\n {4}\}\);/);
    assert.ok(controlsBlockMatch, 'buildSearchIndex() no longer has an S.controls.forEach block — did the control search feature move or get removed?');
    assert.match(controlsBlockMatch[1], /S\.entitlements\[c\.fw\]/, 'buildSearchIndex()\'s S.controls loop no longer checks S.entitlements[c.fw] — search would surface a downgraded or never-licensed framework\'s real control titles to any user typing into the search box');
  });

  test('the "Controls (SoA)" CSV/ZIP export register filters S.controls by S.entitlements[c.fw]', () => {
    const registerMatch = appJs.match(/key: 'controls', label: 'Controls \(SoA\)'[\s\S]*?rows: function \(\) \{([\s\S]*?)\n {6}\}/);
    assert.ok(registerMatch, 'the "Controls (SoA)" EXPORT_REGISTERS entry not found in app.js — did its key or label change?');
    assert.match(registerMatch[1], /S\.controls\.filter\(function \(c\) \{ return S\.entitlements\s*&&\s*S\.entitlements\[c\.fw\]; \}\)/, 'the "Controls (SoA)" export no longer filters S.controls by current entitlement before mapping rows — a single click on Export CSV or Export all (ZIP) could download another module\'s full control set (titles, status, evidence, justification) for any framework this tenant has ever had seeded, entitled or not');
  });

  test('generateAuditorPack() re-checks S.entitlements[fw] before generating, not just trusting the <select>\'s current options', () => {
    const fnMatch = appJs.match(/generateAuditorPack: async function \(\) \{([\s\S]*?)\n {6}busy\(true\);/);
    assert.ok(fnMatch, 'generateAuditorPack() not found in app.js — did it get renamed?');
    assert.match(fnMatch[1], /S\.entitlements\[fw\]/, 'generateAuditorPack() no longer re-checks S.entitlements[fw] before generating — the #apFramework <select> is populated from entitledFrameworks() at render time, but its value could still be tampered with between render and click, and this document may be shared with a third-party auditor');
  });
});

/* Static-text coverage for the client-side half of the multi-subscription
   fix (the Lambda-side merge logic itself is unit-tested directly in
   test/provision-merge.test.mjs, which doesn't need app.js to be
   require()'d at all). This app.js half can't run under Node — the
   self-serve activation path only ever executes against a real,
   Graph-authenticated SharePoint tenant (Store.kind === 'sharepoint'),
   which this test environment has no way to stand up — so this checks
   the deployed text stays wired the way the fix requires, rather than
   silently regressing back to tracking only a single subscription id
   (which is exactly the bug: a second, separate purchase would then
   overwrite the first module's entitlement instead of merging with it).
   See the fix's commit message / PR description for the live manual
   verification this was checked against instead. */
describe('self-serve activation tracks every Paddle subscription a tenant has ever completed checkout for, not just the latest one', () => {
  const appJs = readFileSync(new URL('../public/checkpoint/app.js', import.meta.url), 'utf8');

  test('the old singular subscription-id helpers are gone, not left dangling alongside the new plural ones', () => {
    assert.doesNotMatch(appJs, /function writePaddleSubLocal\(/, 'writePaddleSubLocal() (singular, overwrite-only) should have been replaced by addPaddleSubLocal() (accumulates)');
    assert.doesNotMatch(appJs, /function readPaddleSub\(\)/, 'readPaddleSub() (singular) should have been replaced by readPaddleSubs() (plural)');
  });

  test('readPaddleSubs()/addPaddleSubLocal() exist and are actually used by both the refresh path and the fresh-purchase path', () => {
    assert.match(appJs, /function readPaddleSubs\(\)/, 'readPaddleSubs() not found');
    assert.match(appJs, /function addPaddleSubLocal\(id\)/, 'addPaddleSubLocal() not found');
    const refreshFn = appJs.match(/async function refreshSelfServeEntitlementOnLoad\(acceptTenantIds\) \{([\s\S]*?)\n {2}\}/);
    assert.ok(refreshFn, 'refreshSelfServeEntitlementOnLoad() not found — did it get renamed?');
    assert.match(refreshFn[1], /readPaddleSubs\(\)/, 'refreshSelfServeEntitlementOnLoad() no longer calls readPaddleSubs() — it would only ever refresh a single subscription again');
    const attemptFn = appJs.match(/async function attemptSelfServeActivation\(\) \{([\s\S]*?)\n {2}\}/);
    assert.ok(attemptFn, 'attemptSelfServeActivation() not found — did it get renamed?');
    assert.match(attemptFn[1], /readPaddleSubs\(\)/, 'attemptSelfServeActivation() no longer calls readPaddleSubs() to send its known subscription history alongside a fresh purchase — a returning customer\'s second purchase would stop merging with their first');
  });

  test('the refresh request sends subscriptionIds (plural) to the Lambda, not the old singular subscriptionId', () => {
    const refreshFn = appJs.match(/async function refreshSelfServeEntitlementOnLoad\(acceptTenantIds\) \{([\s\S]*?)\n {2}\}/);
    assert.ok(refreshFn, 'refreshSelfServeEntitlementOnLoad() not found');
    assert.match(refreshFn[1], /body:\s*JSON\.stringify\(\{\s*subscriptionIds:\s*subIds/, 'refreshSelfServeEntitlementOnLoad() no longer sends { subscriptionIds: subIds } — the Lambda would only ever resolve one subscription per refresh again');
  });

  test('the fresh-purchase request sends knownSubscriptionIds alongside the new transactionId', () => {
    const attemptFn = appJs.match(/async function attemptSelfServeActivation\(\) \{([\s\S]*?)\n {2}\}/);
    assert.ok(attemptFn, 'attemptSelfServeActivation() not found');
    assert.match(attemptFn[1], /knownSubscriptionIds:\s*readPaddleSubs\(\)/, 'attemptSelfServeActivation() no longer sends knownSubscriptionIds — a returning, already-onboarded customer\'s new purchase would stop merging with modules they already have');
  });

  test('both paths persist the FULL subscriptionIds array the Lambda returns, not just a single id', () => {
    const refreshFn = appJs.match(/async function refreshSelfServeEntitlementOnLoad\(acceptTenantIds\) \{([\s\S]*?)\n {2}\}/);
    const attemptFn = appJs.match(/async function attemptSelfServeActivation\(\) \{([\s\S]*?)\n {2}\}/);
    assert.match(refreshFn[1], /data\.subscriptionIds/, 'refreshSelfServeEntitlementOnLoad() no longer reads data.subscriptionIds from the Lambda response');
    assert.match(attemptFn[1], /\(data\.subscriptionIds \|\| \[\]\)\.forEach\(addPaddleSubLocal\)/, 'attemptSelfServeActivation() no longer stores every id in data.subscriptionIds — only the most recent purchase\'s subscription would be remembered for future refreshes');
  });
});

/* Static-text coverage for owner-initiated access revocation. Like the
   suites above, none of this can run under Node — checkAccessRevoked()
   only means anything against a real, Graph-authenticated tenant, and
   the whole point of this feature is that it's independent of whatever
   the (otherwise perfectly verifiable) signed activation file says, so
   there's no pure logic to unit-test here the way
   mergeResolvedSubscriptions() had. What IS worth guarding statically:
   every distinct code path that can reach a live tenant's app (bootUi())
   actually performs the check — this feature was built with three call
   sites for exactly that reason (startLive(), retryActivationFromGate()'s
   already-loaded-Store branch, and Wizard.finish() for a first-time
   onboarding), each discovered by tracing bootUi()'s callers by hand
   rather than a single central choke point. A future bootUi() call site
   added without this check would be a genuine, silent revocation
   bypass — exactly the class of bug the second and third call sites
   here were fixing before this even shipped once. */
describe('owner-initiated access revocation cannot be bypassed by any path that reaches the live app', () => {
  const appJs = readFileSync(new URL('../public/checkpoint/app.js', import.meta.url), 'utf8');

  test('checkAccessRevoked() exists and fails open (never blocks) when self-serve isn\'t configured or the Lambda call fails', () => {
    const fnMatch = appJs.match(/async function checkAccessRevoked\(tenantId\) \{([\s\S]*?)\n {2}\}/);
    assert.ok(fnMatch, 'checkAccessRevoked() not found — did it get renamed?');
    assert.match(fnMatch[1], /if \(!CONFIG\.selfServeActivateUrl \|\| !tenantId\) return \{ blocked: false \}/, 'checkAccessRevoked() no longer fails open when unconfigured — a deployment with no provisioning Lambda wired up would be unable to boot any live tenant at all');
    assert.match(fnMatch[1], /catch \(e\) \{ return \{ blocked: false \}; \}/, 'checkAccessRevoked() no longer fails open on a network/parse error — a transient Lambda hiccup would lock out a paying customer');
  });

  test('every one of bootUi()\'s three live-tenant call sites (startLive, retryActivationFromGate, Wizard.finish) checks access revocation first', () => {
    // Every `bootUi('Live —` call site, found the same way this test's
    // own comment says the fix was found: by tracing bootUi()'s callers.
    // A count assertion here is deliberate — a fourth call site being
    // added (a new onboarding shortcut, a new retry path) should fail
    // this test until it's confirmed that new site ALSO checks
    // revocation, not silently pass because the regex still matches the
    // three sites that already do.
    const liveBootCalls = appJs.match(/bootUi\('Live —/g) || [];
    assert.equal(liveBootCalls.length, 3, `expected exactly 3 live-tenant bootUi() call sites (startLive, retryActivationFromGate, Wizard.finish) — found ${liveBootCalls.length}. If this is a deliberate new call site, confirm it checks checkAccessRevoked() before bootUi() and update this count.`);

    const startLiveFn = appJs.match(/async function startLive\(\) \{([\s\S]*?)\n {2}\}/);
    assert.ok(startLiveFn, 'startLive() not found');
    assert.match(startLiveFn[1], /checkAccessRevoked\(/, 'startLive() no longer calls checkAccessRevoked() — the primary path for a returning tenant loading the app would no longer honour a revocation');

    const retryFn = appJs.match(/async function retryActivationFromGate\(\) \{([\s\S]*?)\n {2}\}/);
    assert.ok(retryFn, 'retryActivationFromGate() not found');
    assert.match(retryFn[1], /checkAccessRevoked\(/, 'retryActivationFromGate() no longer calls checkAccessRevoked() — its "Store && S already loaded" branch calls bootUi() directly without going through startLive(), so a revoked tenant pasting any validly-signed file here would boot straight past the block');

    const finishFn = appJs.match(/finish: async function \(\) \{([\s\S]*?)\n {4}\}/);
    assert.ok(finishFn, 'Wizard.finish() not found, or is no longer async');
    assert.match(finishFn[1], /checkAccessRevoked\(/, 'Wizard.finish() no longer calls checkAccessRevoked() — a brand-new tenant already on the owner\'s blocklist would still complete onboarding straight into the live app');
  });

  test('the client-facing revoked screen never echoes the owner\'s internal BlockedReason note', () => {
    // The owner console's own "Revoke access" field label says the
    // reason is "not shown to the client" — this is the other half of
    // that promise: the app-side call sites must never forward
    // revocation.reason into showAccessRevokedScreen().
    const callSites = appJs.match(/showAccessRevokedScreen\([^)]*\)/g) || [];
    assert.ok(callSites.length > 0, 'showAccessRevokedScreen() is never called anywhere');
    callSites.forEach((call) => {
      assert.doesNotMatch(call, /revocation\.reason/, `${call} passes the owner's internal BlockedReason note to the client-facing screen — it's meant to stay owner-only (see the "Revoke access" modal's field label)`);
    });
  });
});

describe('owner console: access revocation writes the fields the Lambda\'s checkTenantBlocked() reads', () => {
  const ownerJs = readFileSync(new URL('../public/owner/owner.js', import.meta.url), 'utf8');
  const provisionJs = readFileSync(new URL('../lambda/provision.js', import.meta.url), 'utf8');

  test('checkTenantBlocked() in the Lambda reads fields.Blocked/fields.BlockedReason, matching what the owner console writes', () => {
    assert.match(provisionJs, /fields\.Blocked/, 'checkTenantBlocked() no longer reads fields.Blocked — the owner console\'s revoke action would have no effect');
    assert.match(provisionJs, /fields\.BlockedReason/, 'checkTenantBlocked() no longer reads fields.BlockedReason');
  });

  test('partnerRevokeAccess() sets Blocked/BlockedAt/BlockedReason; partnerRestoreAccess() clears them', () => {
    const revokeFn = ownerJs.match(/partnerRevokeAccess: async function \(id\) \{([\s\S]*?)\n {4}\},/);
    assert.ok(revokeFn, 'partnerRevokeAccess() not found');
    assert.match(revokeFn[1], /c\.blocked = true/, 'partnerRevokeAccess() no longer sets blocked = true');
    assert.match(revokeFn[1], /c\.blockedReason = v\.reason/, 'partnerRevokeAccess() no longer records the reason');

    const restoreFn = ownerJs.match(/partnerRestoreAccess: async function \(id\) \{([\s\S]*?)\n {4}\},/);
    assert.ok(restoreFn, 'partnerRestoreAccess() not found');
    assert.match(restoreFn[1], /c\.blocked = false/, 'partnerRestoreAccess() no longer clears blocked');
  });

  test('updatePartnerClient() persists Blocked/BlockedAt/BlockedReason to SharePoint — a UI-only flag with no PATCH would never actually revoke anything', () => {
    const fnMatch = ownerJs.match(/async function updatePartnerClient\(c\) \{([\s\S]*?)\n {2}\}/);
    assert.ok(fnMatch, 'updatePartnerClient() not found');
    assert.match(fnMatch[1], /Blocked: !!c\.blocked/, 'updatePartnerClient() no longer writes the Blocked field to SharePoint');
  });

  test('PartnerClients\' column reconciliation includes Blocked/BlockedAt/BlockedReason, so an existing owner console self-heals the new columns', () => {
    const reconcileMatch = ownerJs.match(/PartnerClients: \[([^\]]*)\]/);
    assert.ok(reconcileMatch, 'PARTNER_COLUMN_RECONCILE.PartnerClients not found');
    ['Blocked', 'BlockedAt', 'BlockedReason'].forEach((col) => {
      assert.match(reconcileMatch[1], new RegExp("'" + col + "'"), `PARTNER_COLUMN_RECONCILE.PartnerClients is missing '${col}' — an owner console provisioned before this feature shipped would never get the column added, and revocation would silently fail to persist`);
    });
  });
});

/* A control's exclusion justification (ISO 27001 clause 6.1.3(d)
   requires one for every SoA exclusion) had a fully-wired read path —
   SharePoint's Justification column, updateControl() persisting it,
   five separate places displaying it (the SoA row, the CSV export,
   the Auditor Pack's exclusion summary, the Executive Summary's "what
   the auditor will ask" section, the Trust Center) — but no write
   path anywhere in the UI at all. A practitioner could mark a control
   Not Applicable and would have no way, short of editing the raw
   SharePoint list directly, to ever record why. Fixed by
   App.setControlJustification(); this guards both that it exists and
   that it's wired into the one row renderer every one of those five
   read sites ultimately depends on for how the data ever gets there
   in the first place. */
describe('a control\'s exclusion justification can actually be written, not just displayed', () => {
  const appJs = readFileSync(new URL('../public/checkpoint/app.js', import.meta.url), 'utf8');

  test('App.setControlJustification exists, persists via Store.updateControl(), and is in MUTATING_ACTIONS', () => {
    const fnMatch = appJs.match(/setControlJustification: async function \(key\) \{([\s\S]*?)\n {4}\},/);
    assert.ok(fnMatch, 'App.setControlJustification not found — was it renamed or removed?');
    assert.match(fnMatch[1], /c\.just = vals\.just\.trim\(\)/, 'setControlJustification() no longer writes c.just from the modal\'s input');
    assert.match(fnMatch[1], /Store\.updateControl\(c\)/, 'setControlJustification() no longer persists via Store.updateControl() — the edit would be lost on the next page load');
    assert.match(appJs, /'setControlJustification'/, 'setControlJustification is missing from MUTATING_ACTIONS — a read-only Viewer session would incorrectly be able to call it, or (if the list is otherwise enforced) a Practitioner might be blocked from a legitimate write');
    // Found live, not by inspection: App.go('dash') never re-renders the
    // Dashboard on its own (it only toggles view visibility), so saving
    // a justification without ALSO calling renderDash() left the new
    // "Exclusions missing justification" KPI tile showing a stale count
    // until some unrelated action happened to trigger a fresh render.
    assert.match(fnMatch[1], /renderDash\(\)/, 'setControlJustification() no longer calls renderDash() — the "Exclusions missing justification" KPI tile would go stale after saving a justification, since App.go(\'dash\') itself never re-renders');
  });

  test('renderSoaRow() offers the edit action for every excluded (Not Applicable) control, not just ones that already have a justification', () => {
    const fnMatch = appJs.match(/function renderSoaRow\(c\) \{([\s\S]*?)\n {2}\}/);
    assert.ok(fnMatch, 'renderSoaRow() not found');
    assert.match(fnMatch[1], /App\.setControlJustification/, 'renderSoaRow() no longer offers App.setControlJustification anywhere — regressing back to a display-only field');
    // Specifically: the button must be reachable when c.just is falsy,
    // not only shown once a value already exists (which would make the
    // FIRST justification for a given control impossible to enter from
    // the row itself again).
    assert.match(fnMatch[1], /No justification recorded/, 'renderSoaRow() no longer flags a Not Applicable control with an empty justification inline — this is what surfaces the gap before report-generation time, not just in the Auditor Pack');
  });

  test('the Dashboard KPI row surfaces a live count of unjustified exclusions across every entitled framework', () => {
    const fnMatch = appJs.match(/function renderDash\(\) \{([\s\S]*?)\n  \}/);
    assert.ok(fnMatch, 'renderDash() not found');
    // Matches the actual assignment, not just any mention of the name —
    // a bare reference to an undefined variable in the KPI template
    // literal would still satisfy a looser "does this string appear
    // anywhere" check while throwing at render time.
    assert.match(fnMatch[1], /var unjustifiedExclusions = entitledFrameworks\(\)/, 'renderDash() no longer computes an unjustified-exclusions count — this was added so the gap is an ambient dashboard signal, not something only discovered while generating an Auditor Pack');
    assert.match(fnMatch[1], /!c\.app && !c\.just/, 'the unjustified-exclusions count no longer filters on "not applicable and no justification" — check the filter predicate wasn\'t changed to something that no longer matches an actual exclusion gap');
    assert.match(fnMatch[1], /Exclusions missing justification/, 'the Dashboard KPI row no longer shows the "Exclusions missing justification" tile');
  });
});

/* Confirmed live on a real tenant: patching a control's LastVerified
   field threw "Field 'LastVerified' is not recognized". Root cause —
   Controls' DEFS schema has LastVerified/EvidenceUrl/VerifiedBy, but
   unlike Risks and Actions, Controls was never added to
   COLUMN_RECONCILE, so an already-provisioned tenant's Controls list
   never got the missing column(s) added by reconcileColumns(). This
   guards the fix: every field DEFS.Controls defines beyond the
   original baseline (Code/Framework/Applicable/Status/Owner/MapsTo/
   Justification) must also be listed in COLUMN_RECONCILE.Controls, or
   the exact same class of bug reappears the next time a Controls field
   gets added without remembering this table too. */
describe('Controls column reconciliation — self-heal for an already-provisioned tenant', () => {
  const storeJs = readFileSync(new URL('../public/checkpoint/store.js', import.meta.url), 'utf8');

  test('COLUMN_RECONCILE.Controls lists LastVerified/EvidenceUrl/VerifiedBy, so a tenant provisioned before they existed self-heals instead of throwing "Field ... is not recognized"', () => {
    const reconcileBlock = storeJs.match(/var COLUMN_RECONCILE = \{([\s\S]*?)\n {2}\};/);
    assert.ok(reconcileBlock, 'COLUMN_RECONCILE not found');
    const controlsEntry = reconcileBlock[1].match(/Controls: \[([^\]]*)\]/);
    assert.ok(controlsEntry, 'COLUMN_RECONCILE.Controls not found — a tenant provisioned before LastVerified/EvidenceUrl/VerifiedBy existed will hit "Field \'LastVerified\' is not recognized" the moment anything patches a control, exactly the live bug this test exists to catch');
    ['LastVerified', 'EvidenceUrl', 'VerifiedBy'].forEach((col) => {
      assert.match(controlsEntry[1], new RegExp("'" + col + "'"), `COLUMN_RECONCILE.Controls is missing '${col}' — an existing tenant's Controls list would never get this column added, and any write touching it throws "Field '${col}' is not recognized" instead of saving`);
    });
  });

  test('COLUMN_RECONCILE.AISystems lists AiActAnswers, so a tenant with an AI Systems register from before the EU AI Act classifier shipped self-heals instead of throwing the same "Field ... is not recognized" error', () => {
    const reconcileBlock = storeJs.match(/var COLUMN_RECONCILE = \{([\s\S]*?)\n {2}\};/);
    assert.ok(reconcileBlock, 'COLUMN_RECONCILE not found');
    const aiSystemsEntry = reconcileBlock[1].match(/AISystems: \[([^\]]*)\]/);
    assert.ok(aiSystemsEntry, 'COLUMN_RECONCILE.AISystems not found — a tenant with AI systems already on record before AiActAnswers existed would hit "Field \'AiActAnswers\' is not recognized" the next time they saved one');
    assert.match(aiSystemsEntry[1], /'AiActAnswers'/, 'COLUMN_RECONCILE.AISystems is missing \'AiActAnswers\'');
  });

  test('reconcileColumns() never gates its column-widening on assertActivationAuthorizesProvisioning() — a tenant whose activation happens not to be verified yet at that exact moment must still self-heal, not throw and silently skip every remaining list too', () => {
    const fnMatch = storeJs.match(/async function reconcileColumns\(onStatus\) \{([\s\S]*?)\n {2}\}/);
    assert.ok(fnMatch, 'reconcileColumns() not found');
    // Matches the real call signature (as it always appeared when this
    // gate was live), not a bare mention of the function's name — the
    // fix's own explanatory comment legitimately references the name in
    // prose, which a looser pattern would misfire on.
    assert.doesNotMatch(fnMatch[1], /assertActivationAuthorizesProvisioning\(listName\(k\)\)/, 'reconcileColumns() calls assertActivationAuthorizesProvisioning(listName(k)) again — this throws (uncaught, aborting the whole for-loop, every other list\'s missing columns included) for any tenant whose activation isn\'t verified at that exact moment, which reproduces the "Field \'...\' is not recognized" bug indefinitely regardless of what COLUMN_RECONCILE lists, since the widening step that would fix it never runs. reconcileColumns() only ever touches lists already confirmed to exist (lists[k] populated by ensureLists() moments earlier in the same session) — this gate belongs to actual list CREATION only, per this function\'s own header comment');
  });
});
