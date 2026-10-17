// The sidebar: one rule for badges (what needs attention, said on
// hover), a compact footer, scroll fades, a Simple/Full switch, a Home
// heading, and Start here / Guided build leaving once the build is done.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../public/checkpoint/styles.css', import.meta.url), 'utf8');
const html = readFileSync(new URL('../public/checkpoint/index.html', import.meta.url), 'utf8');
const app = readFileSync(new URL('../public/checkpoint/app.js', import.meta.url), 'utf8');

test('risk and action badges count what needs attention, not the register size', () => {
  assert.match(app, /risksAboveAppetite\(\)\.concat\(risksOverdueForReview\(\)\)/);
  assert.match(app, /setNavBadge\('nRisks', riskN, plural\(riskN, 'risk'\) \+ ' above appetite or overdue for review'\)/);
  assert.match(app, /setNavBadge\('nActions', actN, plural\(actN, 'action'\) \+ ' overdue'\)/);
  assert.ok(!/getElementById\('nRisks'\)\.textContent = S\.risks/.test(app), 'no more open-risk total');
});

test('every badge says what it counts, and a closed group lists them', () => {
  assert.match(app, /if \(show\) \{ el\.title = what; el\.setAttribute\('aria-label', what\); \}/);
  for (const id of ['nMyTasks', 'nRisks', 'nActions', 'nScan', 'nSoa', 'nCert', 'nClauses', 'nAudits', 'nReviews', 'nAssets', 'nPrivacy', 'nLegal', 'nObjectives', 'nCalendar', 'nVendors', 'nIncidents', 'nAiSystems', 'nAttest', 'nTraining']) {
    assert.match(app, new RegExp("setNavBadge\\('" + id + "'"), id + ' uses the shared rule');
  }
  assert.match(app, /summary\.title = 'Needs attention: ' \+ tips\.join\('; '\)/);
});

test('the footer is one compact block and the menu fades at a scrolled edge', () => {
  assert.match(html, /<div class="side-foot">[\s\S]*class="nav-help"[\s\S]*id="versionTag"[\s\S]*Records stay in your Microsoft 365/);
  assert.ok(!/<div class="foot"><b>Data residency<\/b>/.test(html), 'the sidebar footer no longer takes four lines');
  assert.match(css, /\.nav-scroll\.fade-top\{--ft:28px\}/);
  assert.match(css, /\.nav-scroll\.fade-bottom\{--fb:28px\}/);
  assert.match(app, /ns\.classList\.toggle\('fade-bottom', ns\.scrollTop \+ ns\.clientHeight < ns\.scrollHeight - 2\)/);
});

test('Simple and Full is a visible switch with an accessible name', () => {
  assert.match(html, /id="navModeBtn" data-action="App\.toggleNavMode" aria-pressed="false" aria-label="Show full menu"><span class="nm-k">Menu<\/span>/);
  assert.match(app, /btn\.setAttribute\('aria-label', simple \? 'Show full menu' : 'Show simple menu'\)/);
  assert.match(css, /\.nav-mode:not\(\.is-full\) \.nm-simple,\.nav-mode\.is-full \.nm-full\{/);
});

test('the first group is headed Home, and finished build screens leave the menu', () => {
  assert.match(html, /<div class="nav-group" data-group="home">\s*<div class="nav-label">Home<\/div>/);
  assert.match(app, /el\.classList\.toggle\('nav-built', built && !el\.classList\.contains\('on'\)\)/);
  assert.match(css, /\.nav-item\.nav-built\{display:none\}/);
});
