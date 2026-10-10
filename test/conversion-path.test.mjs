// The buying path: funnel events, the "ask your IT admin" approval email,
// the self-serve line on the homepage, the setup call that comes with a
// purchase, and the demo's lead prompt.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const require = createRequire(import.meta.url);
global.window = global.window || {};
require('../public/checkpoint/lib.js');
const L = window.CheckpointLib;

test('funnel events: one helper, every step of the buying path named', () => {
  const base = read('src/layouts/BaseLayout.astro');
  assert.match(base, /window\.c365Track = function \(name, params\)/);
  for (const n of ['cta_book_call_click', 'checkpoint_demo_open', 'trial_start_click', 'estimator_page_click']) assert.ok(base.includes(`name = '${n}'`), n);
  const start = read('src/pages/start/index.astro');
  assert.match(start, /c365Track\('checkout_opened'/);
  assert.match(start, /ev\.name === 'checkout\.completed'[\s\S]*track\('purchase'/);
  assert.match(start, /checkout\.closed' && !done[\s\S]*checkout_closed/);
  const ce = read('src/components/CostEstimator.astro');
  assert.match(ce, /track\('estimator_used'\)/);
  assert.match(ce, /track\('estimator_quote_click'/);
});

test('the IT admin email: approval link, honest about what it grants, short enough for mailto', () => {
  const url = L.buildAdminConsentUrl('11111111-2222-3333-4444-555555555555', '', 'https://www.compliance365.com.au/checkpoint/');
  const r = L.adminConsentRequest({ consentUrl: url, appUrl: 'https://www.compliance365.com.au/checkpoint/', requester: 'Jane Smith' });
  assert.equal(r.subject, 'Please approve Checkpoint for our Microsoft 365');
  assert.ok(r.body.includes(url));
  assert.match(r.body, /Global Administrator or Privileged Role Administrator/);
  assert.match(r.body, /Sites\.Manage\.All/);
  assert.match(r.body, /Mail\.Send/);
  assert.match(r.body, /delegated/);
  assert.match(r.body, /Thanks,\nJane Smith$/);
  const mailto = 'mailto:it@example.com?subject=' + encodeURIComponent(r.subject) + '&body=' + encodeURIComponent(r.body);
  assert.ok(mailto.length < 2000, `mailto is ${mailto.length} characters`);
  assert.ok(L.isAdminConsentError({ errorCode: 'invalid_grant', errorMessage: 'AADSTS65001: The user or administrator has not consented to use the application' }));
  assert.ok(L.isAdminConsentError({ errorMessage: 'AADSTS90094: Need admin approval' }));
  assert.ok(!L.isAdminConsentError({ errorCode: 'user_cancelled' }));
  assert.ok(!L.isAdminConsentError({ errorCode: 'interaction_required', errorMessage: 'AADSTS50058: no session' }));
  const html = read('public/checkpoint/index.html');
  assert.equal((html.match(/data-action="App\.askAdminForConsent"/g) || []).length, 2, 'on the sign-in screen and the Before you sign in step');
  assert.ok(!/Two more permissions are requested later/.test(html), 'no longer claims the write permissions are approved separately');
  const app = read('public/checkpoint/app.js');
  assert.match(app, /askAdminForConsent: async function/);
  assert.match(app, /isAdminConsentError\(re\)/);
});

test('homepage offers the self-serve path, priced from pricing.js', () => {
  const home = read('src/pages/index.astro');
  assert.match(home, /class="hdk-self/);
  assert.match(home, /fmtAud\(Math\.min\(\.\.\.MODULES\.map\(\(m\) => m\.prices\.micro\)\)\)/);
  assert.match(home, /checkpoint\/\?demo=1/);
});

test('every self-serve purchase is offered the free setup call', () => {
  const app = read('public/checkpoint/app.js');
  assert.equal((app.match(/await runWizardActivationCheck\(\);\n\s*offerSetupCall\(\);/g) || []).length, 2, 'Paddle and Marketplace');
  assert.match(read('public/checkpoint/config.js'), /setupCallUrl: 'https:\/\/outlook\.office\.com\/book\//);
  assert.match(read('src/pages/start/index.astro'), /Includes a free 30-minute setup call/);
});

test('demo lead prompt: only after real exploring, once, and says what it sends', () => {
  assert.ok(!L.demoLeadDue({ views: 3, ms: 600000 }));
  assert.ok(!L.demoLeadDue({ views: 6, ms: 60000 }));
  assert.ok(L.demoLeadDue({ views: 4, ms: 120000 }));
  const m = L.demoLeadMessage({ size: 'Under 50 staff', views: ['dash', 'risks', 'soa'], minutes: 5 });
  assert.match(m, /Organisation size: Under 50 staff/);
  assert.match(m, /Screens opened: dash, risks, soa/);
  const app = read('public/checkpoint/app.js');
  assert.match(app, /if \(Store && Store\.kind === 'demo'\) noteDemoView\(v\);/);
  assert.match(app, /localStorage\.getItem\('cpDemoLeadDone'\)/);
  assert.match(read('public/checkpoint/index.html'), /No mailing list\./);
});
