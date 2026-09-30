// The setup wizard's last step offers the organisation logo, so the
// first document set is branded. It shares one save path with the
// Settings branding card.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../public/checkpoint/app.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../public/checkpoint/index.html', import.meta.url), 'utf8');

test('the last wizard step offers a logo upload, after the lists exist', () => {
  const step10 = html.slice(html.indexOf('id="wizStep10"'));
  assert.match(step10, /Brand your documents \(optional\)/);
  assert.match(step10, /<input type="file" id="wizLogoInput"[^>]*accept="image\/\*"/);
  assert.match(step10, /data-action="Wizard\.uploadLogo"/);
  assert.ok(html.indexOf('id="wizStep8"') < html.indexOf('id="wizLogoInput"'), 'after provisioning');
});

test('the wizard and Settings share one logo save path', () => {
  assert.match(app, /async function saveClientLogoFromInput\(input\)/);
  assert.match(app, /uploadLogo: async function \(\) \{\n\s+var ok = await saveClientLogoFromInput\(document\.getElementById\('wizLogoInput'\)\);/);
  assert.match(app, /if \(await saveClientLogoFromInput\(input\)\) renderFrameworksAdmin\(\);/);
  assert.equal((app.match(/var MAX_BYTES = 40 \* 1024;/g) || []).length, 1, 'one size limit, in the shared helper');
});
