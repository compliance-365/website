// Regressions found onboarding the first live client (Checkpoint 1.105).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../public/checkpoint/app.js', import.meta.url), 'utf8');
const owner = readFileSync(new URL('../public/owner/owner.js', import.meta.url), 'utf8');
const body = (src, sig) => { const i = src.indexOf(sig); assert.ok(i >= 0, sig); return src.slice(i, src.indexOf('\n  }\n', i)); };

test('the wizard capability step can count collector checks before anything is provisioned', () => {
  /* runWizardCapabilityCheck -> automatableCheckCount -> relevantCheckDefs
     -> awsResultsPresent -> collectorResultsPresent ran with S === null,
     threw, and left the step stuck on "Checking…" with Next disabled. */
  assert.match(body(app, 'function collectorResultsPresent('), /if \(!S\) return false;/);
});

test('the wizard AI step does not read settings before they exist', () => {
  const fn = body(app, 'function renderWizardAiStep(');
  assert.doesNotMatch(fn, /\(S\.settings &&/);
});

test('lists added after a console was set up do not send it back to the setup screen', () => {
  assert.match(owner, /var LATE_PARTNER_LISTS = \['ErrorReports', 'Health'\];/);
  assert.match(body(owner, 'async function afterSignIn('), /LATE_PARTNER_LISTS\.indexOf\(k\) === -1/);
});

test('recording an entitlement by tenant ID reuses a roster row entered by domain', () => {
  const fn = body(owner, 'function findRosterClientForTenant(');
  assert.match(fn, /rep\.domains\.some/);
  assert.match(owner, /var c = findRosterClientForTenant\(plan\.entitlementRecord\.tenantId\);/);
});
