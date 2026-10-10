// Guided mode: only for tenants set up from 1.156.0 (never set by
// re-running setup), so existing clients are unchanged; the menu trims to
// the steps reached; the weekly digest opens with the next step; Help
// sends feedback to Compliance365.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const f = (n) => readFileSync(new URL('../public/checkpoint/' + n, import.meta.url), 'utf8');
const app = f('app.js'), html = f('index.html');
const require = createRequire(import.meta.url);
const L = require('../public/checkpoint/lib.js');
const monitor = require('../public/checkpoint/azure/PostureMonitor/index.js').__test;

test('guided mode is on for every live tenant unless switched off, and picks up from its own records', () => {
  assert.match(app, /return Store\.kind === 'sharepoint' && !!\(S && S\.settings\) && S\.settings\.guidedClient !== 'false';/);
  assert.match(app, /data-action="App\.toggleGuided"/, 'switchable per tenant in Settings');
  assert.match(app, /S\.settings\.guidedClient = on \? 'true' : 'false';/);
});

test('only a first-time setup turns the weekly digest on; re-running setup never does', () => {
  assert.match(app, /if \(!_rerunningSetup && !\(S\.settings && S\.settings\.guidedClient\)\) \{\s*try \{\s*var me = myUpn\(\);/);
  assert.match(app, /_rerunningSetup = true;\s*try \{ S\.settings\.onboardedDate = ''/);
  assert.match(app, /if \(!S\.settings\.digestEnabled && me\)/, 'never overrides a digest choice already made');
});

test('everything guided is gated: landing, bar, menu, feedback', () => {
  assert.match(app, /if \(RESTRICTED_ACCESS \|\| READONLY \|\| !isGuidedClient\(\)\) return false;/);
  assert.match(app, /var off = !guidedUi\(\) \|\| RESTRICTED_ACCESS/);
  assert.match(app, /if \(isGuidedClient\(\) && navMode\(\) === 'simple'\)/);
  assert.match(app, /\(isGuidedClient\(\) \? '<div class="howto-feedback">/);
  assert.match(app, /function rememberNextStep\(h\) \{\s*if \(!isGuidedClient\(\) \|\| READONLY \|\| RESTRICTED_ACCESS\) return;/);
});

test('the guided menu shows only real screens, grows step by step, and lifts when the build is done', () => {
  const views = new Set([...html.matchAll(/class="nav-item[^"]*" data-v="([a-z0-9-]+)"/g)].map((m) => m[1]));
  for (const v of L.GUIDED_ALWAYS) assert.ok(views.has(v), v);
  const keys = L.BUILD_STAGES.map((s) => s.key);
  for (const [k, vs] of Object.entries(L.GUIDED_STAGE_VIEWS)) {
    assert.ok(keys.includes(k), k);
    for (const v of vs) assert.ok(views.has(v), k + ' ' + v);
  }
  const stages = keys.map((key, i) => ({ key, n: i + 1 }));
  const at = (cur) => L.guidedNavViews({ stages, current: cur, complete: false });
  assert.ok(at(0).includes('legal') && !at(0).includes('risks'));
  assert.ok(at(3).includes('risks') && at(3).includes('scan') && !at(3).includes('audits'));
  assert.ok(at(8).includes('audits'));
  assert.equal(L.guidedNavViews({ stages, current: 9, complete: true }), null);
  assert.match(html, /id="navLaterNote"/);
});

test('the weekly digest opens with the next step, unless guided mode is off', () => {
  const step = JSON.stringify({ n: 3, of: 10, title: 'Risk framework', label: 'Agree how much risk the business will accept', why: 'Risks above this level must be reduced or accepted.' });
  const d = { score: 70, overdueActions: [], dueSoonActions: [], openAlerts: [], awaitingApproval: [], staleControls: 0 };
  const guided = monitor.buildDigestHtml(d, '2026-10-12', { guidedClient: 'true', buildNextStep: step });
  assert.match(guided, /Your next step · 3 of 10: Risk framework/);
  assert.match(guided, /Agree how much risk the business will accept/);
  assert.match(guided, /href="https:\/\/www\.compliance365\.com\.au\/checkpoint\/"/);
  assert.match(monitor.buildDigestHtml(d, '2026-10-12', { buildNextStep: step }), /Your next step/, 'on unless switched off');
  assert.doesNotMatch(monitor.buildDigestHtml(d, '2026-10-12', { guidedClient: 'false', buildNextStep: step }), /Your next step/, 'switched off: unchanged');
  assert.doesNotMatch(monitor.buildDigestHtml(d, '2026-10-12'), /Your next step/);
  assert.equal(monitor.digestNextStep({ guidedClient: 'true', buildNextStep: '{"complete":true}' }), null);
  assert.deepEqual(L.nextStepRecord({ complete: false, n: 2, of: 10, title: 'Leadership', next: { label: 'Roles', why: 'w' } }), { n: 2, of: 10, title: 'Leadership', label: 'Roles', why: 'w' });
  assert.match(app, /digestNextStepHtml\(\) \+\s*'<h3 style="font-size:14px">Readiness by framework<\/h3>/, 'Send digest now carries it too');
});

test('feedback opens an email to Compliance365 with the screen and step, sent by the person', () => {
  assert.match(app, /var FEEDBACK_EMAIL = 'info@compliance365\.com\.au';/);
  assert.match(app, /location\.href = 'mailto:' \+ FEEDBACK_EMAIL \+ '\?subject=' \+ encodeURIComponent\('Checkpoint feedback: '/);
  assert.match(app, /Screen: ' \+ \(\(navItem && navItem\.textContent\.trim\(\)\) \|\| where\)/);
});
