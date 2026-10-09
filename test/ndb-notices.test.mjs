// Notifiable Data Breaches: drafts of the statement to the OAIC and the
// notice to individuals carry what Privacy Act s 26WK(3) requires.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
globalThis.window = globalThis.window || {};
const Lib = require('../public/checkpoint/lib.js');
const app = readFileSync(new URL('../public/checkpoint/app.js', import.meta.url), 'utf8');

test('the statement has the four required parts, in order', () => {
  const d = Lib.ndbNoticeDrafts({ org: 'MineGuard Pty Ltd', contact: 'Cem Caglar, privacy@mineguard.example, 08 1234 5678', description: 'A staff mailbox was accessed by an unknown party.', kinds: 'Names and phone numbers of 40 contractors', occurred: '2 Oct 2026', detected: '3 Oct 2026', steps: ['Be alert to scam calls.', ' '] });
  const c = d.commissioner;
  const order = ['1. Who we are', 'MineGuard Pty Ltd', 'Cem Caglar, privacy@mineguard.example', '2. What happened', 'A staff mailbox', 'occurred on or about 2 Oct 2026', 'aware of it on 3 Oct 2026', '3. The information involved', 'Names and phone numbers', '4. What affected individuals should do', '- Be alert to scam calls.'];
  let at = -1;
  for (const part of order) { const i = c.indexOf(part); assert.ok(i > at, part); at = i; }
  assert.doesNotMatch(c, /^- $/m, 'blank steps are dropped');
  assert.match(d.individuals, /involves your personal information/);
  assert.match(d.individuals, /oaic\.gov\.au/);
});

test('missing facts show as placeholders, never invented', () => {
  const d = Lib.ndbNoticeDrafts({});
  assert.match(d.commissioner, /\[Organisation name\]/);
  assert.match(d.commissioner, /\[The kinds of personal information involved\]/);
  assert.match(d.commissioner, /\[What affected people should do/);
});

test('the incident drawer offers drafts for privacy breaches; nothing is sent', () => {
  assert.match(app, /n\.isPrivacyBreach \? '<button class="btn ghost sm" data-action="App\.draftNdbNotice"/);
  const fn = app.slice(app.indexOf('draftNdbNotice: async function'), app.indexOf('recordIncidentAssessment: async function'));
  assert.doesNotMatch(fn, /sendMail/);
  assert.match(fn, /DRAFT for review\. Not sent\./);
  assert.match(fn, /audit\('Breach notices drafted'/);
});
