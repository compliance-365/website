// Cyber Essentials guide and checker (www.compliance365.io/uk/...). The
// scheme is pass or fail on each requirement, so the checker must never
// average a "No" away; the guide must stay consistent with the .com.au
// readiness page (4 of 5 controls from the tenant, firewalls attested);
// and every Checkpoint check it names must exist.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CONTROLS, QUESTIONS, assess } from '../src/data/cyber-essentials.js';

const store = readFileSync(new URL('../public/checkpoint/store.js', import.meta.url), 'utf8');
const all = (v) => Object.fromEntries(QUESTIONS.map((q) => [q.id, v]));

test('the five Cyber Essentials controls, four read from the tenant', () => {
  assert.deepEqual(CONTROLS.map((c) => c.name), ['Firewalls', 'Secure configuration', 'Security update management', 'User access control', 'Malware protection']);
  assert.equal(CONTROLS.filter((c) => c.automated).length, 4);
  assert.equal(CONTROLS.find((c) => c.id === 'firewalls').automated, false);
  assert.match(readFileSync(new URL('../src/pages/resources/cyber-essentials-readiness.astro', import.meta.url), 'utf8'), /4 of 5 themes automated/);
});

test('key requirements are stated as the scheme states them', () => {
  const text = (id) => CONTROLS.find((c) => c.id === id).asks.join(' ');
  assert.match(text('security-updates'), /within 14 days/);
  assert.match(text('user-access-control'), /Multi-factor authentication is turned on for every user of cloud services/);
  assert.match(text('secure-configuration'), /at least six characters/);
  assert.match(text('malware-protection'), /application allow-listing/);
});

test('every Checkpoint check named exists in the posture catalogue', () => {
  for (const c of CONTROLS) for (const id of c.checks) assert.match(store, new RegExp(`id: '${id}',`), `${c.id}: ${id}`);
});

test('any "No" is a blocker, whatever else is answered', () => {
  assert.equal(assess({}).verdict, 'start');
  assert.equal(assess(all('yes')).verdict, 'ready');
  const one = { ...all('yes'), [QUESTIONS[3].id]: 'no' };
  const r = assess(one);
  assert.equal(r.verdict, 'not-ready');
  assert.equal(r.blockers.length, 1);
  assert.equal(r.controls.find((c) => c.id === QUESTIONS[3].control).status, 'blocked');
  assert.equal(assess({ ...all('yes'), [QUESTIONS[0].id]: 'unsure' }).verdict, 'nearly');
  assert.equal(assess({ [QUESTIONS[0].id]: 'yes' }).verdict, 'so-far');
});

test('the US ISO 42001 page only names Checkpoint checks that exist', () => {
  const page = readFileSync(new URL('../src/components/intl/Iso42001Microsoft.astro', import.meta.url), 'utf8');
  const named = [...page.matchAll(/checks: \[([^\]]+)\]/g)].flatMap((m) => [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1].replace('\\u2014', '—')));
  assert.ok(named.length >= 8);
  for (const label of named) assert.ok(store.includes(`label: '${label}'`), label);
  assert.match(page, /38 Annex A controls/);
});
