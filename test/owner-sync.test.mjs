// Owner-console Sync into a client tenant, as a guest account: finding
// the SharePoint host without the root site, and saying what to do
// when access is refused.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import Lib from '../public/checkpoint/lib.js';

const { sharePointHostFromDomains } = Lib;

test('the SharePoint host comes from the initial .onmicrosoft.com domain', () => {
  assert.equal(sharePointHostFromDomains([
    { name: 'mineguard-ai.com', isInitial: false },
    { name: 'NETORGFT17026336.onmicrosoft.com', isInitial: true }
  ]), 'netorgft17026336.sharepoint.com');
});

test('without an isInitial flag, the .onmicrosoft.com domain is used, never the .mail one', () => {
  assert.equal(sharePointHostFromDomains([
    { name: 'contoso.mail.onmicrosoft.com' }, { name: 'contoso.onmicrosoft.com' }, { name: 'contoso.com' }
  ]), 'contoso.sharepoint.com');
});

test('no usable domain gives an empty host rather than a guess', () => {
  assert.equal(sharePointHostFromDomains([{ name: 'contoso.com', isInitial: true }]), '');
  assert.equal(sharePointHostFromDomains([]), '');
  assert.equal(sharePointHostFromDomains(null), '');
});

test('sync falls back from the root site, and explains a refusal', () => {
  const owner = readFileSync(new URL('../public/owner/owner.js', import.meta.url), 'utf8');
  assert.match(owner, /sharePointHostFromDomains\(/);
  assert.match(owner, /Ask the client to give this account at least Visitor \(read\) access to that site/);
  assert.match(owner, /throw syncStepError\(e, 'opening the site'\)/);
  assert.match(owner, /throw syncStepError\(e, 'reading its lists'\)/);
});

test('sync keeps the console\'s own sign-in: no cache clear, and silent renewal is allowed', () => {
  const owner = readFileSync(new URL('../public/owner/owner.js', import.meta.url), 'utf8');
  assert.doesNotMatch(owner, /msalApp\.clearCache\(\)/);
  assert.match(owner, /if \(res\.account && !accountsBefore\[res\.account\.homeAccountId\]\)/);
  assert.match(owner, /msalApp\.clearCache\(\{ account: res\.account \}\)/);
  const html = readFileSync(new URL('../public/owner/index.html', import.meta.url), 'utf8');
  assert.match(html, /frame-src https:\/\/login\.microsoftonline\.com/);
});
