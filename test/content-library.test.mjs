// Structural checks over the two content libraries — the policy
// templates (public/checkpoint/templates.js) and the training courses
// (public/checkpoint/courses.js).
//
// These are now the largest assets in the product and they had no test
// coverage at all: 35 documents and 3 courses, authored by hand, whose
// failure modes are silent. A control code that no framework defines
// still renders — it just quietly claims a mapping that does not exist,
// which is precisely the sort of thing an auditor pulls on. A policy
// statement missing its reason renders as a bare rule. A quiz whose
// answer index is out of range marks every attempt wrong forever.
// None of that throws, and none of it is visible without reading the
// file.
//
// The control-code check is the important one. It stitches the shipped
// ISO 27001 registry together with the six premium content packs
// exactly as framework-registry.test.mjs does (and as
// mergeLicensedPacks() does at runtime), so "does this code exist?" is
// answered against the same real data the app resolves against — not
// against a hand-maintained list that would drift.
//
// templates.js and courses.js are plain scripts that assign onto
// `window`, so `window` is stubbed before requiring them, same shape as
// the registry suite.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
global.window = global.window || {};
window.CHECKPOINT_CONFIG = window.CHECKPOINT_CONFIG || { scopesProvision: [] };
require('../public/checkpoint/store.js');
require('../public/checkpoint/templates.js');
require('../public/checkpoint/courses.js');

const { POLICY_TEMPLATES, TRAINING_COURSES, FRAMEWORKS, FRAMEWORK_ORDER } = window;

function loadPack(moduleId) {
  return JSON.parse(readFileSync(new URL(`../checkpoint-content/${moduleId}.json`, import.meta.url)));
}

// Every control code the app can resolve for a fully-licensed tenant:
// ISO 27001 from store.js, the rest from their pack sources.
const KNOWN_CODES = new Set();
FRAMEWORK_ORDER.forEach((fw) => {
  const controls = fw === 'iso27001' ? FRAMEWORKS.iso27001.controls : loadPack(fw).framework.controls;
  (controls || []).forEach((c) => KNOWN_CODES.add(c.code));
});

/* Documents whose subject is the management system itself rather than a
   control — their audience genuinely is management and the auditor, so
   they deliberately carry no reader-facing sections. Listed explicitly
   so that ADDING a document without a "what this means for you" section
   fails this suite rather than silently joining the exemption. */
const CLAUSE_DOCUMENTS = new Set([
  'isms-scope', 'risk-management-framework', 'infosec-objectives-metrics',
  'aims-scope', 'ai-risk-framework', 'ai-objectives-metrics'
]);

describe('policy template library — shape', () => {
  test('the library is non-empty and every id is unique', () => {
    assert.ok(POLICY_TEMPLATES.length >= 35, `expected at least 35 templates, found ${POLICY_TEMPLATES.length}`);
    const ids = POLICY_TEMPLATES.map((t) => t.id);
    assert.equal(ids.length, new Set(ids).size, 'duplicate template id — the id is the SharePoint filename stem and must be unique');
  });

  test('every template carries the required scalar fields, non-empty', () => {
    POLICY_TEMPLATES.forEach((t) => {
      ['id', 'title', 'purpose', 'scope', 'reviewCadence', 'exceptions', 'nonCompliance'].forEach((k) => {
        assert.equal(typeof t[k], 'string', `${t.id}.${k} must be a string`);
        assert.ok(t[k].trim().length > 0, `${t.id}.${k} must not be empty`);
      });
    });
  });

  test('every template carries the required array fields', () => {
    POLICY_TEMPLATES.forEach((t) => {
      ['policyStatements', 'roles', 'relatedDocuments', 'controls', 'frameworks'].forEach((k) => {
        assert.ok(Array.isArray(t[k]), `${t.id}.${k} must be an array`);
      });
      assert.ok(t.policyStatements.length > 0, `${t.id} has no policy statements`);
      assert.ok(t.roles.length > 0, `${t.id} has no roles — "who is responsible" is the section auditors most often find missing`);
      assert.ok(t.frameworks.length > 0, `${t.id} is tagged to no framework, so no tenant will ever see it in the picker`);
    });
  });
});

describe('policy template library — the reader-facing rewrite', () => {
  test('every control-shaped document has a reader-facing opener and practical examples', () => {
    POLICY_TEMPLATES.filter((t) => !CLAUSE_DOCUMENTS.has(t.id)).forEach((t) => {
      assert.ok(t.whyItMatters && t.whyItMatters.trim(), `${t.id} has no "what this means for you" section`);
      assert.ok(Array.isArray(t.inPractice) && t.inPractice.length >= 2, `${t.id} needs at least two "in practice" examples — these are the part readers remember`);
    });
  });

  test('management-system clause documents deliberately have no reader-facing sections', () => {
    [...CLAUSE_DOCUMENTS].forEach((id) => {
      const t = POLICY_TEMPLATES.find((x) => x.id === id);
      assert.ok(t, `CLAUSE_DOCUMENTS names "${id}" but no such template exists — remove it from the exemption list`);
      assert.equal(t.whyItMatters, undefined, `${id} is exempt from the reader-facing section; if it has gained one, take it out of CLAUSE_DOCUMENTS`);
    });
  });

  test('every policy statement is a rule paired with a reason', () => {
    POLICY_TEMPLATES.forEach((t) => {
      t.policyStatements.forEach((s, i) => {
        assert.equal(typeof s, 'object', `${t.id} statement ${i} is a bare string — statements carry { rule, because }`);
        assert.ok(s.rule && s.rule.trim(), `${t.id} statement ${i} has no rule`);
        assert.ok(s.because && s.because.trim(), `${t.id} statement ${i} has no reason — a rule without one reads as arbitrary`);
      });
    });
  });

  test('the normative sections stay out of second person', () => {
    // Register discipline: "you" belongs in whyItMatters/inPractice only.
    // An auditor tests policy statements as assertions, so a rule
    // phrased as advice to the reader is not auditable.
    const secondPerson = /\b(you|your|yours)\b/i;
    POLICY_TEMPLATES.forEach((t) => {
      t.policyStatements.forEach((s, i) => {
        assert.ok(!secondPerson.test(s.rule), `${t.id} statement ${i} addresses the reader directly: "${s.rule.slice(0, 70)}…" — policy statements stay declarative`);
      });
      assert.ok(!secondPerson.test(t.purpose), `${t.id}.purpose addresses the reader directly — that belongs in whyItMatters`);
      assert.ok(!secondPerson.test(t.scope), `${t.id}.scope addresses the reader directly — that belongs in whyItMatters`);
    });
  });

  test('every role entry names both a role and a responsibility', () => {
    POLICY_TEMPLATES.forEach((t) => {
      t.roles.forEach((r, i) => {
        assert.ok(r && r.role && r.role.trim(), `${t.id} role ${i} has no role name`);
        assert.ok(r && r.responsibility && r.responsibility.trim(), `${t.id} role ${i} has no responsibility`);
      });
    });
  });
});

describe('policy template library — mappings resolve to real controls', () => {
  test('every cited control code exists in a real framework registry', () => {
    const bad = [];
    POLICY_TEMPLATES.forEach((t) => {
      t.controls.forEach((code) => { if (!KNOWN_CODES.has(code)) bad.push(`${t.id} → ${code}`); });
    });
    assert.deepEqual(bad, [], `template(s) cite control codes no framework defines: ${bad.join(', ')}`);
  });

  test('every framework tag is a real framework id', () => {
    const bad = [];
    POLICY_TEMPLATES.forEach((t) => {
      t.frameworks.forEach((fw) => { if (FRAMEWORK_ORDER.indexOf(fw) === -1) bad.push(`${t.id} → ${fw}`); });
    });
    assert.deepEqual(bad, [], `template(s) tagged to unknown framework ids: ${bad.join(', ')}`);
  });

  test('a document citing a control is tagged to a framework that could contain it', () => {
    // Guards the case where a document is retagged but its controls
    // aren't (or vice versa) — the picker would then offer a policy
    // whose every mapping is invisible to that tenant.
    const codesByFramework = {};
    FRAMEWORK_ORDER.forEach((fw) => {
      const controls = fw === 'iso27001' ? FRAMEWORKS.iso27001.controls : loadPack(fw).framework.controls;
      codesByFramework[fw] = new Set((controls || []).map((c) => c.code));
    });
    const orphans = [];
    POLICY_TEMPLATES.forEach((t) => {
      t.controls.forEach((code) => {
        const reachable = t.frameworks.some((fw) => codesByFramework[fw] && codesByFramework[fw].has(code));
        if (!reachable) orphans.push(`${t.id} cites ${code} but is tagged only to ${t.frameworks.join('/')}`);
      });
    });
    assert.deepEqual(orphans, [], orphans.join('; '));
  });

  test('related-document references name real templates where they look like one', () => {
    // relatedDocuments is free text by design (it can name an external
    // artefact), but a reference that ALMOST matches a template title is
    // far more likely a typo than a deliberate external reference.
    const titles = new Set(POLICY_TEMPLATES.map((t) => t.title.toLowerCase()));
    const suspicious = [];
    POLICY_TEMPLATES.forEach((t) => {
      t.relatedDocuments.forEach((d) => {
        const k = d.toLowerCase();
        if (titles.has(k)) return;
        // near-miss: same first three words as a real title
        const head = k.split(/\s+/).slice(0, 3).join(' ');
        for (const title of titles) {
          if (title.startsWith(head) && head.length > 8 && title !== k) {
            suspicious.push(`${t.id} → "${d}" (did you mean "${title}"?)`);
            break;
          }
        }
      });
    });
    assert.deepEqual(suspicious, [], suspicious.join('; '));
  });
});

describe('training course catalogue', () => {
  test('the catalogue is non-empty and every id is unique', () => {
    assert.ok(TRAINING_COURSES.length >= 3, `expected at least 3 courses, found ${TRAINING_COURSES.length}`);
    const ids = TRAINING_COURSES.map((c) => c.id);
    assert.equal(ids.length, new Set(ids).size, 'duplicate course id — completion records key off it');
  });

  test('every course carries the required fields', () => {
    TRAINING_COURSES.forEach((c) => {
      ['id', 'title', 'version', 'audience', 'purpose'].forEach((k) => {
        assert.ok(typeof c[k] === 'string' && c[k].trim(), `${c.id}.${k} must be a non-empty string`);
      });
      assert.equal(typeof c.duration, 'number', `${c.id}.duration must be a number of minutes`);
      assert.ok(c.duration > 0 && c.duration <= 120, `${c.id}.duration of ${c.duration} minutes is not plausible`);
      assert.ok(Array.isArray(c.modules) && c.modules.length > 0, `${c.id} has no modules`);
      assert.ok(Array.isArray(c.quiz) && c.quiz.length > 0, `${c.id} has no comprehension check`);
      assert.ok(Array.isArray(c.frameworks) && c.frameworks.length > 0, `${c.id} is tagged to no framework`);
    });
  });

  test('every module has a heading, an intro and substance', () => {
    TRAINING_COURSES.forEach((c) => {
      c.modules.forEach((m, i) => {
        assert.ok(m.heading && m.heading.trim(), `${c.id} module ${i} has no heading`);
        assert.ok(m.intro && m.intro.trim(), `${c.id} module ${i} has no intro`);
        assert.ok(Array.isArray(m.points) && m.points.length >= 3, `${c.id} module ${i} needs at least three points`);
        if (m.callout) {
          assert.ok(['do', 'avoid', 'note'].includes(m.callout.kind), `${c.id} module ${i} callout kind "${m.callout.kind}" is not one the reader styles (do/avoid/note)`);
          assert.ok(m.callout.text && m.callout.text.trim(), `${c.id} module ${i} callout has no text`);
        }
      });
    });
  });

  test('every quiz question is answerable and explains itself', () => {
    TRAINING_COURSES.forEach((c) => {
      c.quiz.forEach((q, i) => {
        assert.ok(q.q && q.q.trim(), `${c.id} question ${i} has no text`);
        assert.ok(Array.isArray(q.options) && q.options.length >= 2, `${c.id} question ${i} needs at least two options`);
        assert.equal(typeof q.answer, 'number', `${c.id} question ${i} answer must be an index`);
        assert.ok(Number.isInteger(q.answer) && q.answer >= 0 && q.answer < q.options.length,
          `${c.id} question ${i} answer index ${q.answer} is out of range for ${q.options.length} options — every attempt would be marked wrong`);
        assert.ok(q.why && q.why.trim(), `${c.id} question ${i} has no explanation — a wrong answer has to teach something`);
        assert.equal(new Set(q.options).size, q.options.length, `${c.id} question ${i} has duplicate options`);
      });
    });
  });

  test('the pass mark is achievable and demanding enough to mean something', () => {
    TRAINING_COURSES.forEach((c) => {
      assert.equal(typeof c.passMark, 'number', `${c.id}.passMark must be a number`);
      assert.ok(c.passMark >= 1, `${c.id}.passMark of ${c.passMark} would pass someone who got everything wrong`);
      assert.ok(c.passMark <= c.quiz.length, `${c.id}.passMark of ${c.passMark} exceeds its ${c.quiz.length} questions — nobody could ever pass`);
      assert.ok(c.passMark / c.quiz.length >= 0.6, `${c.id} passes at ${Math.round(c.passMark / c.quiz.length * 100)}%, which does not demonstrate comprehension`);
    });
  });

  test('every cited control code and framework id is real', () => {
    const badCodes = [], badFw = [];
    TRAINING_COURSES.forEach((c) => {
      (c.controls || []).forEach((code) => { if (!KNOWN_CODES.has(code)) badCodes.push(`${c.id} → ${code}`); });
      c.frameworks.forEach((fw) => { if (FRAMEWORK_ORDER.indexOf(fw) === -1) badFw.push(`${c.id} → ${fw}`); });
    });
    assert.deepEqual(badCodes, [], `course(s) cite control codes no framework defines: ${badCodes.join(', ')}`);
    assert.deepEqual(badFw, [], `course(s) tagged to unknown framework ids: ${badFw.join(', ')}`);
  });

  test('a jurisdiction-specific module is flagged so it can be swapped', () => {
    // The privacy course's Australian-law module must stay labelled —
    // it is the one piece of content with a real maintenance obligation,
    // and a practitioner delivering outside Australia has to be able to
    // find it without reading the whole course.
    const privacy = TRAINING_COURSES.find((c) => c.id === 'privacy-awareness');
    assert.ok(privacy, 'the privacy course is missing');
    const flagged = privacy.modules.filter((m) => m.jurisdiction);
    assert.ok(flagged.length >= 1, 'the privacy course no longer flags its jurisdiction-specific module');
    flagged.forEach((m) => {
      assert.match(m.jurisdiction, /^[A-Z]{2}$/, `jurisdiction "${m.jurisdiction}" should be a two-letter country code`);
    });
  });
});
