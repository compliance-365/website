// Start here, the Next step bar and the how-to guides: the guides only
// name buttons and screens that exist, the screen is wired in, and the
// person running Checkpoint lands on it until the build is done.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const f = (n) => readFileSync(new URL('../public/checkpoint/' + n, import.meta.url), 'utf8');
const app = f('app.js'), html = f('index.html');
const require = createRequire(import.meta.url);
const L = require('../public/checkpoint/lib.js');

test('every how-to opens a real screen and is offered on real screens', () => {
  assert.ok(L.HOW_TOS.length >= 8);
  const views = new Set([...html.matchAll(/id="v-([a-z0-9-]+)"/g)].map((m) => m[1]));
  const stages = new Set(L.BUILD_STAGES.map((s) => s.key));
  for (const g of L.HOW_TOS) {
    assert.ok(views.has(g.view), g.id + ' view ' + g.view);
    for (const v of g.views) assert.ok(views.has(v), g.id + ' offered on ' + v);
    for (const k of g.stages) assert.ok(stages.has(k), g.id + ' stage ' + k);
    assert.ok(g.steps.length >= 3 && g.when && g.title);
  }
});

test('the buttons the guides name exist with those labels', () => {
  const both = app + html;
  for (const label of ['+ Add risk', '+ New campaign', 'Preview recipients', 'Launch campaign', '+ Schedule audit', 'Plan the next 12 months', 'Workpack', 'Give an auditor access', 'Link evidence', 'Ask for review', 'Request approval', 'Run posture scan', 'Show full menu']) {
    assert.ok(both.includes(label), label);
  }
  const text = JSON.stringify(L.HOW_TOS);
  for (const label of ['+ Add risk', '+ New campaign', 'Launch campaign', 'Give an auditor access', 'Link evidence', 'Request approval', 'Run posture scan', 'Show full menu']) assert.ok(text.includes(label), 'guide uses ' + label);
});

test('Start here reports the current step, what to do now and what comes after', () => {
  const b = L.guidedBuild([], {
    scope: { label: 'Scope', done: true }, legal: { label: 'Legal', done: false, why: 'w' },
    roles: { label: 'Roles', done: false }, docs: { label: 'Docs', done: false }, approve: { label: 'Approve', done: false }
  });
  const h = L.startHere(b);
  assert.equal(h.n, 1);
  assert.equal(h.title, 'Scope and context');
  assert.deepEqual(h.now.map((i) => i.label), ['Legal']);
  assert.equal(h.next.label, 'Legal');
  assert.equal(h.after.title, 'Leadership');
  assert.equal(h.complete, false);
  assert.equal(L.startHere(null), null);
});

test('the screen, menu item, Help button, Next step bar and landing are wired in', () => {
  assert.match(html, /<button class="nav-item" data-v="start">Start here<\/button>\s*<button class="nav-item" data-v="mytasks">/);
  assert.match(html, /<section class="view" id="v-start">[\s\S]*?<div id="startBody"><\/div>/);
  assert.match(html, /id="btnHowTo" data-action="App.howToList"/);
  assert.match(app, /start: renderStart,/);
  assert.match(app, /renderPageGuide\(v\);\s*renderNextStepBar\(v\);/);
  assert.match(app, /else if \(Store\.kind === 'sharepoint' && startHereDue\(\)\) App\.go\('start'\);/);
  assert.match(app, /if \(RESTRICTED_ACCESS \|\| READONLY \|\| !isGuidedClient\(\)\) return false;/, 'only guided clients land on Start here');
  assert.match(app, /'gsearchWrap', 'btnHowTo'\]/, 'restricted sessions do not get the practitioner guides');
  assert.match(app, /guides\.length \? ' <span class="pg-howto"><b>How to:<\/b> '/);
  assert.match(app, /var slot = head\.querySelector\('\.page-guide \.pg-foot'\) \|\| head;/, 'the bar shares the page help row');
});
