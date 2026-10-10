// The Checkpoint procurement pack on the website: questionnaire answers
// (page + Excel built from one data file) and the accessibility statement.
// Each outbound connection the answers list must exist in Checkpoint's
// config, and Checkpoint must not connect anywhere the answers don't list.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const root = new URL('../', import.meta.url).pathname;
const data = JSON.parse(readFileSync(root + 'src/data/checkpoint-security-answers.json', 'utf8'));

test('every answer is a complete question and answer, grouped', () => {
  assert.ok(data.groups.length >= 8);
  for (const g of data.groups) for (const it of g.items) {
    assert.ok(it.q && it.q.length > 8, g.name);
    assert.ok(it.a && it.a.length > 20, it.q);
    assert.doesNotMatch(it.a, /TODO|TBC|\[.*\]/, it.q + ' has a placeholder');
  }
});

test('Checkpoint connects only to Microsoft and the endpoints the answers list', () => {
  const html = readFileSync(root + 'public/checkpoint/index.html', 'utf8');
  const connect = (html.match(/connect-src ([^;"]*)/) || [])[1] || '';
  const hosts = connect.split(/\s+/).filter((h) => h && h !== "'self'");
  for (const h of hosts) {
    assert.ok(/microsoft(online)?\.com$|azure\.com$|\.amazonaws\.com$/.test(h), 'unlisted connection: ' + h);
  }
  const cfg = readFileSync(root + 'public/checkpoint/config.js', 'utf8');
  const urls = [...cfg.matchAll(/(\w+(?:Url|url)):\s*'(https:[^']+)'/g)].map((m) => m[1]);
  // Each Compliance365 endpoint in config is described by a row in the table.
  const described = { errorReportUrl: 'Error reports', selfServeActivateUrl: 'Activation', marketplaceFulfillmentUrl: 'Activation', threatIntelUrl: 'Threat intelligence feed', contactUrl: 'Demo enquiry', setupCallUrl: 'a link the buyer opens (booking page); Checkpoint sends nothing to it', url: 'owner-only signing (not used by client sessions)' };
  for (const u of urls) assert.ok(described[u], 'config endpoint ' + u + ' is not covered by the answers');
  for (const w of ['Error reports', 'Setup health', 'Activation', 'Threat intelligence feed', 'Demo enquiry']) assert.ok(data.outbound.some((o) => o.what === w), w);
});

test('the page, the Excel download and the accessibility statement exist and are linked', () => {
  for (const f of ['src/pages/security/questionnaire.astro', 'src/pages/security/checkpoint-security-answers.xlsx.ts', 'src/pages/accessibility.astro']) assert.ok(existsSync(root + f), f);
  assert.match(readFileSync(root + 'src/components/Footer.astro', 'utf8'), /accessibility\//);
  assert.match(readFileSync(root + 'src/pages/security/index.astro', 'utf8'), /security\/questionnaire\//);
  assert.match(readFileSync(root + 'src/pages/security/questionnaire.astro', 'utf8'), /checkpoint-security-answers\.xlsx/);
});

test('the accessibility statement does not claim an audit that has not happened', () => {
  const a = readFileSync(root + 'src/pages/accessibility.astro', 'utf8');
  assert.match(a, /self-assessed/);
  assert.match(a, /partially conformant/);
});
