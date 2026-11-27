// For managed service providers: signing in to a client's tenant as a
// guest, the delivering firm's brand on reports, a monthly service
// report, actions sent to a PSA by email, and a settings baseline that
// carries only non-client settings between tenants.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import L from '../public/checkpoint/lib.js';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const app = read('public/checkpoint/app.js');
const graph = read('public/checkpoint/graph.js');
const report = read('public/checkpoint/report.js');
const html = read('public/checkpoint/index.html');

test('a client tenant to sign in to must be a domain or tenant ID', () => {
  for (const ok of ['contoso.com', 'contoso.onmicrosoft.com', 'sub.client.com.au', '72f988bf-86f1-41af-91ab-2d7cd011db47']) assert.ok(L.validTenantHint(ok), ok);
  for (const bad of ['', 'contoso', 'evil.com/x', 'a b.com', 'https://contoso.com', '../common', 'x'.repeat(300) + '.com']) assert.ok(!L.validTenantHint(bad), bad);
  assert.match(graph, /authority: tenantAuthority\(\),/);
  assert.match(graph, /'https:\/\/login\.microsoftonline\.com\/' \+ encodeURIComponent\(t\)/);
  assert.match(html, /data-action="App.signInToClientTenant">Sign in to a client's organisation</);
});

test('the delivering firm replaces the Compliance365 mark on report covers when set', () => {
  assert.match(report, /function mast\(partner\)/);
  assert.match(report, /mast\(spec\.partner\)/);
  assert.match(app, /partner: \{ name: \(\(S\.settings && S\.settings\.partnerName\) \|\| ''\)\.trim\(\), logoUrl:/);
});

test('a monthly service report, not tied to one framework', () => {
  assert.match(app, /servicereport: function \(\) \{/);
  assert.match(html, /data-action="App.report" data-id="servicereport">Generate</);
});

test('PSA ticket links are recognised and actions can be emailed to a ticketing address', () => {
  assert.equal(L.ticketSystemFromUrl('https://na.myconnectwise.net/v4_6_release/services/system_io/Service/fv_sr100_request.rails?service_recid=123'), 'ConnectWise');
  assert.equal(L.ticketSystemFromUrl('https://acme.halopsa.com/ticket?id=55'), 'HaloPSA');
  assert.equal(L.ticketSystemFromUrl('https://ww5.autotask.net/Autotask/AutotaskExtend/ExecuteCommand.aspx?TicketID=9'), 'Autotask');
  assert.match(app, /emailTicket: async function \(id\)/);
  assert.match(app, /'\[' \+ a\.id \+ '\] ' \+ a\.title/);
});

test('a settings baseline carries only the allowed keys, and shows only real changes', () => {
  const allowed = ['scanCadenceDays', 'partnerName'];
  const file = L.baselineFile({ scanCadenceDays: '7', partnerName: 'Acme IT', orgServices: 'secret', teamsWebhookUrl: 'https://x' }, allowed, '2026-11-27', 'Client A');
  assert.deepEqual(file.settings, { scanCadenceDays: '7', partnerName: 'Acme IT' });
  const tampered = { ...file, settings: { ...file.settings, entitlementFile: 'forged', orgServices: 'x' } };
  const changes = L.baselineChanges({ scanCadenceDays: '7', partnerName: '' }, tampered, allowed);
  assert.deepEqual(changes, [{ key: 'partnerName', from: '', to: 'Acme IT' }]);
  assert.equal(L.baselineChanges({}, { kind: 'something-else' }, allowed), null);
  assert.ok(!/'orgServices'|'entitlementFile'|'teamsWebhookUrl'|'digestRecipients'/.test(app.slice(app.indexOf('function baselineKeys()'), app.indexOf('function baselineKeys()') + 2000)));
});

test('the new settings and actions are blocked for read-only users', () => {
  for (const a of ['setPartnerName', 'uploadPartnerLogo', 'clearPartnerLogo', 'emailTicket', 'setTicketEmail', 'importBaseline']) {
    assert.match(app, new RegExp("MUTATING_ACTIONS = new Set\\(\\[[\\s\\S]*'" + a + "'"), a);
  }
});
