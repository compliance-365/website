// The email check on the website's forms (public/email-check.js): turns away
// disposable inboxes, obvious typos and domains with no mail server, but
// never blocks a real visitor because the DNS lookup itself failed.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function load() {
  const window = {};
  vm.runInNewContext(readFileSync(new URL('../public/email-check.js', import.meta.url), 'utf8'), { window, setTimeout, clearTimeout, encodeURIComponent });
  return window.c365EmailCheck;
}
const dns = (answers) => async (url) => {
  const name = new URL(url).searchParams.get('name'), type = new URL(url).searchParams.get('type');
  const r = answers[name + ':' + type] || answers[name] || { Status: 3 };
  return { ok: true, json: async () => r };
};

describe('shape checks', () => {
  const { checkShape } = load();
  test('the mailinator addresses from the checklist leads are refused', () => {
    assert.equal(checkShape('svsdvs@mailinator.com').reason, 'disposable');
    assert.equal(checkShape('nope@mailinator.com').reason, 'disposable');
  });
  test('other throwaway domains and their subdomains are refused', () => {
    assert.equal(checkShape('a@guerrillamail.com').reason, 'disposable');
    assert.equal(checkShape('a@x.mailinator.com').reason, 'disposable');
    assert.equal(checkShape('a@yopmail.com').reason, 'disposable');
  });
  test('a real domain that merely ends the same way is not caught', () => {
    assert.equal(checkShape('a@notmailinator.com').ok, true);
  });
  test('typos of common webmail suggest the fix', () => {
    const r = checkShape('jane@gmial.com');
    assert.equal(r.reason, 'typo');
    assert.equal(r.suggestion, 'jane@gmail.com');
  });
  test('bad shapes are refused', () => {
    for (const e of ['', 'jane', 'jane@', '@x.com', 'jane@x', 'jane@@x.com', 'ja ne@x.com', 'jane@x..com']) assert.equal(checkShape(e).ok, false, e);
  });
  test('ordinary work and webmail addresses pass', () => {
    for (const e of ['matt@compliance365.com.au', 'jane.doe+iso@acme.com', 'owner@gmail.com']) assert.equal(checkShape(e).ok, true, e);
  });
});

describe('domain checks', () => {
  test('a domain with a mail server passes', async () => {
    const { checkDomain } = load();
    const r = await checkDomain('a@acme.com.au', dns({ 'acme.com.au:MX': { Status: 0, Answer: [{ type: 15, data: '10 mail.acme.com.au.' }] } }));
    assert.equal(r.ok, true);
  });
  test('a domain that does not exist is refused', async () => {
    const { checkDomain } = load();
    const r = await checkDomain('a@no-such-domain-xyz.com', dns({}));
    assert.equal(r.ok, false);
    assert.equal(r.reason, 'no-mail');
  });
  test('no MX but an address record still passes (mail goes to the domain itself)', async () => {
    const { checkDomain } = load();
    const r = await checkDomain('a@small.com.au', dns({ 'small.com.au:MX': { Status: 0 }, 'small.com.au:A': { Status: 0, Answer: [{ type: 1, data: '1.2.3.4' }] } }));
    assert.equal(r.ok, true);
  });
  test('a null MX (the domain says it takes no email) is refused', async () => {
    const { checkDomain } = load();
    const r = await checkDomain('a@nomail.com', dns({ 'nomail.com:MX': { Status: 0, Answer: [{ type: 15, data: '0 .' }] } }));
    assert.equal(r.ok, false);
  });
  test('if the lookup fails the visitor is let through', async () => {
    const { checkDomain } = load();
    const r = await checkDomain('a@down.com', async () => { throw new Error('offline'); });
    assert.equal(r.ok, true);
    assert.equal(r.reason, 'lookup-failed');
  });
  test('check() stops at the shape check without any lookup', async () => {
    const { check } = load();
    let called = false;
    const r = await check('a@mailinator.com', async () => { called = true; return { ok: true, json: async () => ({}) }; });
    assert.equal(r.ok, false);
    assert.equal(called, false);
  });
});

describe('wiring', () => {
  const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
  test('every checklist checks the email before moving on, and the script loads site-wide', () => {
    for (const f of ['iso27001', 'iso27701', 'iso42001', 'soc2', 'essential-eight', 'disp-ism-irap']) {
      assert.match(read(`src/pages/checklist/${f}.astro`), /c365EmailGate\(document\.getElementById\('contact-email'\)/, f);
    }
    assert.match(read('src/layouts/BaseLayout.astro'), /src="\/email-check\.js"/);
  });
});

describe('site policy', () => {
  test('the content security policy lets the browser reach the DNS lookup the check uses', () => {
    const cfg = readFileSync(new URL('../astro.config.mjs', import.meta.url), 'utf8');
    const connect = (cfg.match(/connect-src ([^"]*)"/) || [])[1] || '';
    assert.match(connect, /https:\/\/cloudflare-dns\.com/);
    assert.match(readFileSync(new URL('../public/email-check.js', import.meta.url), 'utf8'), /https:\/\/cloudflare-dns\.com\/dns-query/);
  });
});
