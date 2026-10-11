// Website enquiries and sign-ups are kept in HubSpot (lambda/subscribe.js
// with HUBSPOT_TOKEN): the right contact properties, the first visit set
// once and never overwritten, the enquiry as an escaped note, and a
// sign-up endpoint without HubSpot that keeps working exactly as before.
import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { contactProps, splitName, noteBody, C365_PROPERTIES, handler } from '../lambda/subscribe.js';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const touch = { at: '2026-09-01', landing: '/services/iso27001/', ref: 'www.google.com', utm_source: 'linkedin', utm_campaign: 'oct', ad: 'Google Ads' };

describe('contact properties', () => {
  test('a lead: name, company, last form and page always; first visit from the consented touch', () => {
    const p = contactProps({ kind: 'lead', email: ' Ekin@MineGuard.com.au ', name: 'Ekin van der Berg', company: 'MineGuard', form: 'Contact form', page: '/contact/', touch });
    assert.deepEqual(p.always, { email: 'ekin@mineguard.com.au', firstname: 'Ekin', lastname: 'van der Berg', company: 'MineGuard', c365_last_form: 'Contact form', c365_last_page: '/contact/' });
    assert.deepEqual(p.firstOnly, { c365_first_visit: '2026-09-01', c365_first_page: '/services/iso27001/', c365_first_referrer: 'www.google.com', c365_utm_source: 'linkedin', c365_utm_campaign: 'oct', c365_ad_click: 'Google Ads' });
  });
  test('without consent the first visit is this page and its referrer, and no campaign is recorded', () => {
    const p = contactProps({ kind: 'lead', email: 'a@b.co', page: '/book/', ref: '' });
    assert.equal(p.firstOnly.c365_first_page, '/book/');
    assert.equal(p.firstOnly.c365_first_referrer, 'direct or not shown');
    assert.ok(!('c365_utm_source' in p.firstOnly));
  });
  test('sign-ups set the right flag; the free roadmap sets neither', () => {
    assert.equal(contactProps({ kind: 'signup', email: 'a@b.co', topic: 'Essentials series release alert' }).always.c365_essentials_alert, 'true');
    assert.equal(contactProps({ kind: 'signup', email: 'a@b.co', topic: 'Monthly digest' }).always.c365_digest_signup, 'true');
    const r = contactProps({ kind: 'signup', email: 'a@b.co', topic: 'ISO 27001', source: 'free-roadmap' }).always;
    assert.ok(!r.c365_digest_signup && !r.c365_essentials_alert);
  });
  test('values are capped and names split sensibly', () => {
    assert.equal(contactProps({ email: 'a@b.co', company: 'x'.repeat(500) }).always.company.length, 160);
    assert.deepEqual(splitName('  Matt  '), { firstname: 'Matt', lastname: '' });
    assert.ok(C365_PROPERTIES.every((p) => /^c365_[a-z_]+$/.test(p.name)));
  });
  test('the note is escaped', () => {
    const n = noteBody({ kind: 'lead', form: 'Contact form', subject: '<b>Hi</b>', message: '<script>x</script>\nline 2', page: '/contact/' });
    assert.ok(!/<script>|<b>/.test(n));
    assert.match(n, /&lt;script&gt;/);
    assert.match(n, /<br>line 2/);
  });
});

describe('the sign-up Lambda with a mocked HubSpot', () => {
  const realFetch = global.fetch;
  afterEach(() => { global.fetch = realFetch; delete process.env.HUBSPOT_TOKEN; });
  const ev = (body) => ({ requestContext: { http: { method: 'POST', sourceIp: 'ip-' + Math.random() } }, headers: {}, body: JSON.stringify(body) });
  function mock({ existing = null, props = [] } = {}) {
    const calls = [];
    global.fetch = async (url, opts = {}) => {
      const u = String(url); const body = opts.body ? JSON.parse(opts.body) : null;
      calls.push({ u, method: opts.method || 'GET', body });
      const ok = (b) => ({ ok: true, status: 200, text: async () => JSON.stringify(b) });
      if (/contact-us/.test(u)) return ok({});
      if (/\/properties\/contacts$/.test(u)) return ok({ results: props.map((name) => ({ name })) });
      if (/batch\/create/.test(u)) return ok({});
      if (/contacts\/search/.test(u)) return ok({ results: existing ? [existing] : [] });
      if (/objects\/contacts$/.test(u)) return ok({ id: 'new1' });
      if (/objects\/contacts\//.test(u)) return ok({});
      if (/objects\/notes/.test(u)) return ok({ id: 'n1' });
      return ok({});
    };
    return calls;
  }

  test('without HUBSPOT_TOKEN a sign-up is emailed as before and HubSpot is never called', async () => {
    const calls = mock();
    const r = await handler(ev({ email: 'a@b.co', framework: 'Monthly digest', source: 'x' }));
    assert.equal(r.statusCode, 200);
    assert.ok(calls.some((c) => /contact-us/.test(c.u)));
    assert.ok(!calls.some((c) => /hubapi/.test(c.u)));
    const lead = await handler(ev({ type: 'lead', lead: { email: 'a@b.co' } }));
    assert.equal(JSON.parse(lead.body).hubspot, 'off');
  });
  test('a lead is never emailed, creates the contact as a lead with first visit, and adds a note', async () => {
    process.env.HUBSPOT_TOKEN = 't';
    const calls = mock();
    const r = await handler(ev({ type: 'lead', lead: { email: 'new@x.co', name: 'New Person', form: 'Contact form', message: 'Hello', page: '/contact/', touch } }));
    assert.equal(JSON.parse(r.body).hubspot, 'saved');
    assert.ok(!calls.some((c) => /contact-us/.test(c.u)), 'the form already emailed it');
    assert.ok(calls.some((c) => /batch\/create/.test(c.u) && c.body.inputs.length === C365_PROPERTIES.length), 'missing properties created');
    const create = calls.find((c) => /objects\/contacts$/.test(c.u));
    assert.equal(create.body.properties.lifecyclestage, 'lead');
    assert.equal(create.body.properties.c365_first_page, '/services/iso27001/');
    const note = calls.find((c) => /objects\/notes/.test(c.u));
    assert.equal(note.body.associations[0].to.id, 'new1');
    assert.equal(note.body.associations[0].types[0].associationTypeId, 202);
  });
  test('an existing contact keeps its first visit', async () => {
    process.env.HUBSPOT_TOKEN = 't';
    const calls = mock({ existing: { id: '42', properties: { c365_first_page: '/blog/x/' } } });
    await handler(ev({ type: 'lead', lead: { email: 'old@x.co', form: 'Contact form', page: '/contact/', touch } }));
    const patch = calls.find((c) => c.method === 'PATCH');
    assert.ok(/contacts\/42$/.test(patch.u));
    assert.ok(!('c365_first_page' in patch.body.properties) && !('lifecyclestage' in patch.body.properties));
    assert.equal(patch.body.properties.c365_last_page, '/contact/');
  });
  test('a sign-up is emailed and flagged in HubSpot; a HubSpot failure does not fail it', async () => {
    process.env.HUBSPOT_TOKEN = 't';
    let calls = mock();
    let r = await handler(ev({ email: 'a@b.co', framework: 'Essentials series release alert', source: 'essentials-alert-e8-guide', page: '/resources/essential-eight-guide/' }));
    assert.equal(r.statusCode, 200);
    assert.ok(calls.some((c) => /contact-us/.test(c.u)));
    assert.equal(calls.find((c) => /objects\/contacts$/.test(c.u)).body.properties.c365_essentials_alert, 'true');
    global.fetch = async (u) => (/hubapi/.test(String(u)) ? { ok: false, status: 500, text: async () => 'down' } : { ok: true, status: 200, text: async () => '{}' });
    r = await handler(ev({ email: 'a@b.co', framework: 'Monthly digest' }));
    assert.equal(r.statusCode, 200);
  });
  test('a lead without a valid email is refused', async () => {
    process.env.HUBSPOT_TOKEN = 't';
    mock();
    assert.equal((await handler(ev({ type: 'lead', lead: { email: 'nope' } }))).statusCode, 400);
  });
});

describe('the website sends leads', () => {
  test('one helper, nested so an old sign-up endpoint rejects it, skipping our own addresses', () => {
    const base = read('src/layouts/BaseLayout.astro');
    assert.match(base, /window\.c365SendLead = function/);
    assert.match(base, /type: 'lead', lead: \{/);
    assert.match(base, /@compliance365\\\.com\\\.au\$\/i\.test\(email\)\) return;/);
    assert.match(base, /keepalive: true/);
    assert.match(base, /window\.c365LeadTouch = function[\s\S]{0,120}consented\(\)/);
  });
  test('every enquiry form calls it, and sign-ups send the first visit', () => {
    for (const p of ['src/pages/contact.astro', 'src/pages/book.astro', 'src/pages/posture-scan/index.astro',
      ...['iso27001', 'iso27701', 'iso42001', 'soc2', 'essential-eight', 'disp-ism-irap'].map((f) => `src/pages/checklist/${f}.astro`)]) {
      assert.match(read(p), /window\.c365SendLead\(\{/, p);
    }
    assert.match(read('src/components/DigestSignup.astro'), /touch: typeof window\.c365LeadTouch/);
    assert.match(read('src/pages/free-roadmap.astro'), /touch: typeof window\.c365LeadTouch/);
  });
  test('the privacy policy says enquiries and sign-ups are kept in HubSpot', () => {
    const p = read('src/pages/privacy.astro');
    assert.match(p, /<strong>HubSpot:<\/strong> our customer relationship manager/);
    assert.match(p, /Apollo\.io and HubSpot\./);
  });
});
