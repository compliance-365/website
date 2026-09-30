// The ISMS Scope Document is the first thing an auditor reads. It must
// cover every Clause 4.3 requirement (4.1 issues, 4.2 requirements,
// interfaces, the legal entity, people, locations, technology,
// exclusions) plus 4.4, and the answers it is built from are checked for
// the contradictions an auditor picks up at stage 1.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
global.window = global.window || {};
const Lib = require('../public/checkpoint/lib.js');
require('../public/checkpoint/templates.js');
const app = readFileSync(new URL('../public/checkpoint/app.js', import.meta.url), 'utf8');
const tpl = window.POLICY_TEMPLATES.find((t) => t.id === 'isms-scope');
const text = JSON.stringify(tpl);

describe('the scope template covers Clause 4', () => {
  test('every determination it needs is a token, so nothing defaults to a generic claim', () => {
    ['scopeStatement', 'legalName', 'services', 'businessUnits', 'people', 'locations', 'technology', 'externalIssues',
      'internalIssues', 'interestedParties', 'partyRequirements', 'regulatory', 'climate', 'interfaces', 'exclusions'].forEach((tok) => {
      assert.ok(text.includes('{{' + tok + '}}'), tok);
    });
  });
  test('it names 4.3 a, b and c and 4.4, and no longer assumes a Microsoft 365-centred business', () => {
    ['Clause 4.3 a', 'Clause 4.3 b', 'Clause 4.3 c', 'Clause 4.4'].forEach((c) => assert.ok(text.includes(c), c));
    assert.ok(!text.includes('centred on its Microsoft 365 tenant'));
  });
  test('the new answers are asked in the questionnaire and saved', () => {
    assert.match(app, /\{ id: 'legalName', label: fld\('orgLegalName'\)\.label/);
    assert.match(app, /\{ id: 'people', label: fld\('orgPeople'\)\.label/);
    assert.match(app, /\{ id: 'technology', label: fld\('orgTechnology'\)\.label, type: 'textarea', value: orgProfileValue\('orgTechnology'\) \|\| technologyDraftFromRegister\(\)/);
    assert.match(app, /orgLegalName: step2\.legalName, orgPeople: step2\.people, orgTechnology: step2\.technology,/);
  });
  test('Clause 4.3 needs the legal name, people and technology answered', () => {
    const r = Lib.clauseRequirementsFor('iso27001', '4.3').find((x) => x.id === 'boundaries');
    ['orgLegalName', 'orgPeople', 'orgTechnology'].forEach((k) => assert.ok(r.auto.profile.includes(k), k));
  });
});

describe('answers are tidied and checked', () => {
  test('stray punctuation is tidied, wording kept', () => {
    assert.equal(Lib.tidyProfileAnswer('Australia. And contractors in Nigeria and Canada.,  in accordance'), 'Australia. And contractors in Nigeria and Canada, in accordance');
    assert.equal(Lib.tidyProfileAnswer('Sydney ,  Brisbane ..'), 'Sydney, Brisbane.');
    assert.match(app, /window\.CheckpointLib\.tidyProfileAnswer\(orgProfileValue\(f\.key\)\)/);
  });
  test('the stage 1 contradictions are flagged', () => {
    const w = Lib.scopeProfileWarnings({
      orgBusinessUnits: 'Software development, Software architecture',
      orgScopeStatement: 'The ISMS of Acme covering the platform from Australia. And our contractors in Canada.,',
      orgLegalName: 'Globex Pty Ltd', orgLocations: 'Australia', orgInterfaces: 'microsoft 365 and customers'
    });
    assert.equal(w.length, 5);
    assert.match(w.join(' '), /Business units lists only some teams/);
    assert.match(w.join(' '), /does not name the organisation \(Globex Pty Ltd\)/);
    assert.match(w.join(' '), /stray punctuation/);
    assert.match(w.join(' '), /Contractors are mentioned/);
    assert.match(w.join(' '), /do not name any provider/);
  });
  test('a consistent scope raises nothing', () => {
    assert.deepEqual(Lib.scopeProfileWarnings({
      orgBusinessUnits: 'All functions', orgExclusions: '', orgLegalName: 'Globex Pty Ltd (ABN 1)',
      orgScopeStatement: 'The information security management system of Globex Pty Ltd covering its platform.',
      orgPeople: 'All employees, and contractors in scope as personnel.', orgLocations: 'Remote; contractors in Canada',
      orgInterfaces: 'Azure hosts the platform; GitHub holds the code.'
    }), []);
  });
  test('approving the scope document shows them first, with approve anyway', () => {
    assert.match(app, /if \(t\.id === 'isms-scope'\) \{\n\s+var scopeWarnings = window\.CheckpointLib\.scopeProfileWarnings\(S\.settings \|\| \{\}\);/);
    assert.match(app, /confirmText: 'Approve anyway',\n\s+cancelText: 'Fix first'/);
  });
});
