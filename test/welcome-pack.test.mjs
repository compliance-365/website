// The owner console's welcome pack: the setup steps it sends (shared by
// the email and the quick-start PDF), the site path it names, and the
// wiring for Cc and attaching a licence issued with the command line.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import Lib from '../public/checkpoint/lib.js';

const { normaliseSitePath, welcomeGuideContent } = Lib;

describe('normaliseSitePath()', () => {
  test('cleans what people actually paste', () => {
    assert.equal(normaliseSitePath('/sites/MineGuardAICompliance.'), '/sites/MineGuardAICompliance');
    assert.equal(normaliseSitePath('https://netorgft17026336.sharepoint.com/sites/MineGuardAICompliance/SitePages/CollabHome.aspx'), '/sites/MineGuardAICompliance');
    assert.equal(normaliseSitePath('sites/compliance/'), '/sites/compliance');
    assert.equal(normaliseSitePath('/teams/security?web=1'), '/teams/security');
  });
  test('blank and "root" mean the root site', () => {
    assert.equal(normaliseSitePath(''), '');
    assert.equal(normaliseSitePath('  '), '');
    assert.equal(normaliseSitePath('Root'), '');
    assert.equal(normaliseSitePath(null), '');
  });
  test('a clean path is left exactly as it was', () => {
    assert.equal(normaliseSitePath('/sites/compliance'), '/sites/compliance');
  });
});

describe('welcomeGuideContent()', () => {
  const base = { consentDone: true, hasActivationFile: true, activationFileName: 'acme.json', sitePath: '/sites/acme', frameworks: ['ISO 27001', 'Privacy Act (APPs)'] };
  const titles = (g) => g.steps.map((s) => s[0]);

  test('follows the setup wizard in order, without consent once it is granted', () => {
    assert.deepEqual(titles(welcomeGuideContent(base)),
      ['Sign in', 'Capability check', 'Upload your activation file', 'Choose where your records live', 'Confirm your frameworks']);
  });
  test('adds the consent step first when it has not been granted', () => {
    const g = welcomeGuideContent(Object.assign({}, base, { consentDone: false }));
    assert.equal(titles(g)[0], 'Grant admin consent');
    assert.match(g.before, /Global Administrator/);
  });
  test('names the attached file, the site and the frameworks', () => {
    const text = welcomeGuideContent(base).steps.map((s) => s[1]).join(' ');
    assert.match(text, /attached to this email \(acme\.json\)/);
    assert.match(text, /existing SharePoint site \/sites\/acme\./);
    assert.match(text, /Confirm ISO 27001 and Privacy Act \(APPs\)\./);
  });
  test('says the file follows separately, and asks for a site, when neither is known', () => {
    const text = welcomeGuideContent({ consentDone: true }).steps.map((s) => s[1]).join(' ');
    assert.match(text, /we send you separately/);
    assert.match(text, /We recommend a dedicated site/);
    assert.match(text, /Confirm your frameworks\./);
  });
  test('uses only characters the PDF\'s standard fonts can draw', () => {
    const g = welcomeGuideContent(Object.assign({}, base, { consentDone: false }));
    const all = [g.before, g.after].concat(...g.steps).join(' ');
    assert.ok(/^[\x20-\x7e]*$/.test(all), 'non-ASCII character in the guide text');
  });
});

describe('wiring', () => {
  const owner = readFileSync(new URL('../public/owner/owner.js', import.meta.url), 'utf8');
  const graph = readFileSync(new URL('../public/checkpoint/graph.js', import.meta.url), 'utf8');
  test('the email and the PDF both take their steps from the shared guide', () => {
    assert.match(owner, /var steps = guide\.steps;/);
    assert.match(owner, /o\.guide\.steps\.map/);
    assert.doesNotMatch(owner, /Sign in & grant admin consent/, 'old hard-coded steps are gone');
  });
  test('Cc is sent as real Cc recipients', () => {
    assert.match(graph, /async function sendMail\(toCsv, subject, htmlBody, attachments, ccCsv\)/);
    assert.match(graph, /message\.ccRecipients = /);
    assert.match(owner, /Graph\.sendMail\(v\.to, v\.subject, body, attachments, v\.cc\)/);
  });
  test('a licence issued with the command line can be attached, and must be for this client', () => {
    assert.match(owner, /type: 'file', accept: '\.json,application\/json'/);
    assert.match(owner, /That activation file is for tenant /);
  });
  test('stored and edited site paths are cleaned', () => {
    assert.match(owner, /sitePath: window\.CheckpointLib\.normaliseSitePath\(f\.SitePath\) \|\| ''/);
    assert.match(owner, /c\.sitePath = window\.CheckpointLib\.normaliseSitePath\(v\.sitePath\) \|\| ''/);
  });
});
