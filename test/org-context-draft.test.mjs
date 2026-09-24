// The scope & context questionnaire drafts ISO 27001 Clause 4 text from
// plain-English answers (CheckpointLib.buildOrgContextDraft, lib.js;
// questions in ORG_CONTEXT_QUESTIONS, templates.js). The draft is shown
// for editing before it is saved, but it must never assert something
// the answers don't support, and every answer must be one it knows.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
global.window = global.window || {};
const { buildOrgContextDraft } = require('../public/checkpoint/lib.js');
require('../public/checkpoint/templates.js');
const { ORG_CONTEXT_QUESTIONS, INDUSTRY_PROFILES, ORG_PROFILE_FIELDS } = window;

describe('buildOrgContextDraft()', () => {
  test('no answers drafts no internal issues, interfaces or climate claim', () => {
    const d = buildOrgContextDraft({}, {}, '');
    assert.equal(d.internalIssues, '');
    assert.equal(d.interfaces, '');
    assert.equal(d.climate, '');
    assert.match(d.scopeStatement, /^The information security management system of the organisation covering/);
  });

  test('an MSP answer names the provider as an interface and an issue', () => {
    const d = buildOrgContextDraft({ itModel: 'msp', cloud: 'm365' }, {}, 'Acme');
    assert.match(d.interfaces, /managed service provider/);
    assert.match(d.externalIssues, /managed service provider/);
    assert.match(d.internalIssues, /external IT expertise/);
  });

  test('personal-data breach notification only appears when customer personal information is held', () => {
    assert.doesNotMatch(buildOrgContextDraft({ personalData: 'staff' }, {}, '').externalIssues, /breach/);
    assert.match(buildOrgContextDraft({ personalData: 'sensitive' }, {}, '').externalIssues, /breach/);
  });

  test('the climate determination follows the answer, and is empty when unanswered', () => {
    assert.match(buildOrgContextDraft({ climate: 'relevant' }, {}, '').climate, /determined to be a relevant issue/);
    assert.match(buildOrgContextDraft({ climate: 'not-relevant' }, {}, '').climate, /not to be a material issue/);
  });

  test('the industry preset leads the external issues, as a sentence', () => {
    const d = buildOrgContextDraft({}, { externalIssues: 'sector regulation' }, '');
    assert.match(d.externalIssues, /^Sector regulation; /);
    assert.match(d.externalIssues, /\.$/);
  });

  test('the scope statement uses the organisation and scope answers', () => {
    const d = buildOrgContextDraft({ services: 'the claims platform', businessUnits: 'Engineering', locations: 'Brisbane' }, {}, 'Acme Pty Ltd');
    assert.equal(d.scopeStatement, 'The information security management system of Acme Pty Ltd covering the claims platform, provided by Engineering from Brisbane, in accordance with the current Statement of Applicability.');
  });
});

describe('questionnaire definitions', () => {
  test('every question has a unique id and settings key, and at least two options', () => {
    const ids = ORG_CONTEXT_QUESTIONS.map((q) => q.id);
    const keys = ORG_CONTEXT_QUESTIONS.map((q) => q.key);
    assert.equal(new Set(ids).size, ids.length);
    assert.equal(new Set(keys).size, keys.length);
    ORG_CONTEXT_QUESTIONS.forEach((q) => assert.ok(q.options.length >= 2, `${q.id} has fewer than two options`));
  });

  test('no question key collides with a drafted profile field', () => {
    const fieldKeys = new Set(ORG_PROFILE_FIELDS.map((f) => f.key));
    ORG_CONTEXT_QUESTIONS.forEach((q) => assert.ok(!fieldKeys.has(q.key), `${q.key} is both a question and a profile field`));
  });

  test('every option value the drafter branches on is one a question offers', () => {
    const offered = {};
    ORG_CONTEXT_QUESTIONS.forEach((q) => { offered[q.id] = new Set(q.options.map((o) => o.value)); });
    const src = buildOrgContextDraft.toString();
    const used = [...src.matchAll(/a\.(\w+) === '([\w-]+)'/g)].map((m) => [m[1], m[2]]);
    assert.ok(used.length > 10, 'expected the drafter to branch on answers');
    used.forEach(([id, v]) => {
      assert.ok(offered[id], `drafter reads a.${id}, which no question sets`);
      assert.ok(offered[id].has(v), `drafter checks a.${id} === '${v}', which question ${id} never offers`);
    });
  });

  test('every industry preset carries a sector-specific external issue', () => {
    INDUSTRY_PROFILES.forEach((p) => {
      assert.ok(p.externalIssues && p.externalIssues.length > 20, `${p.id} has no externalIssues`);
      assert.equal(p.externalIssues[0], p.externalIssues[0].toLowerCase(), `${p.id}.externalIssues should start lower-case — it is the head of a list`);
    });
  });
});

describe('buildAimsContextDraft()', () => {
  const { buildAimsContextDraft } = require('../public/checkpoint/lib.js');

  test('the systems line comes from the AI system register when it has entries', () => {
    const d = buildAimsContextDraft({ ai: 'tools' }, [{ name: 'Microsoft 365 Copilot', purpose: 'Drafting assistance.' }], 'Acme');
    assert.equal(d.aiSystems, 'Microsoft 365 Copilot (drafting assistance).');
  });

  test('with an empty register the systems line follows the AI-use answer, and is empty when unanswered', () => {
    assert.match(buildAimsContextDraft({ ai: 'tools' }, [], '').aiSystems, /Generative AI tools used by staff/);
    assert.equal(buildAimsContextDraft({}, [], '').aiSystems, '');
  });

  test('the role follows the AI-use answer: tools is a user, builds is provider and user', () => {
    assert.match(buildAimsContextDraft({ ai: 'tools' }, [], '').aiRole, /user \(deployer\)/);
    assert.doesNotMatch(buildAimsContextDraft({ ai: 'tools' }, [], '').aiRole, /both a provider/);
    assert.match(buildAimsContextDraft({ ai: 'builds' }, [], '').aiRole, /both a provider/);
    assert.equal(buildAimsContextDraft({ ai: 'none' }, [], '').aiRole, '');
  });

  test('personal information only appears among AI issues when the organisation uses AI and holds it', () => {
    assert.match(buildAimsContextDraft({ ai: 'tools', personalData: 'customers' }, [], '').aiIssues, /personal information/);
    assert.doesNotMatch(buildAimsContextDraft({ ai: 'tools', personalData: 'staff' }, [], '').aiIssues, /personal information/);
    assert.equal(buildAimsContextDraft({ ai: 'none', personalData: 'sensitive' }, [], '').aiIssues, '');
  });

  test('the scope statement names development and provision only for an organisation that builds AI', () => {
    assert.match(buildAimsContextDraft({ ai: 'builds' }, [], 'Acme').aimsScopeStatement, /^The AI management system of Acme covering the development, provision and use/);
    assert.match(buildAimsContextDraft({ ai: 'tools' }, [], 'Acme').aimsScopeStatement, /covering the use of AI systems/);
  });

  test('the ISO 42001 profile fields are flagged, so tenants without it are not counted against them', () => {
    const aims = ORG_PROFILE_FIELDS.filter((f) => f.aims).map((f) => f.token).sort();
    assert.deepEqual(aims, ['aiIssues', 'aiRole', 'aiSystems', 'aimsScopeStatement']);
  });
});
