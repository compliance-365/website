// The public help page (/checkpoint-console/help/) is built from the
// app's own help: CheckpointLib.HOW_TOS and pageGuide() in lib.js, and
// the menu labels in index.html. These tests pin that wiring, so the
// page keeps one source and every link it builds opens a real screen.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const page = readFileSync(new URL('../src/pages/checkpoint-console/help.astro', import.meta.url), 'utf8');
const html = readFileSync(new URL('../public/checkpoint/index.html', import.meta.url), 'utf8');
const footer = readFileSync(new URL('../src/components/Footer.astro', import.meta.url), 'utf8');
const L = createRequire(import.meta.url)('../public/checkpoint/lib.js');

test('the page reads its guides from the app, and holds none of its own', () => {
  assert.match(page, /L\.HOW_TOS/);
  assert.match(page, /L\.pageGuide\(x\.v, 'practitioner'\)/);
  assert.doesNotMatch(page, /steps: \[/, 'no hand-written guide in the page');
});

test('the menu pattern the page uses finds every screen with a guide', () => {
  const menu = [...html.matchAll(/<button class="nav-item[^"]*" data-v="([a-z0-9-]+)"[^>]*>([^<]+)/g)].map((m) => ({ v: m[1], label: m[2].trim() }));
  assert.ok(menu.length >= 35, 'menu items found: ' + menu.length);
  for (const m of menu) assert.ok(m.label.length > 2, 'label for ' + m.v);
  const withGuide = menu.filter((m) => L.pageGuide(m.v, 'practitioner'));
  assert.ok(withGuide.length >= 20, 'screens with a guide: ' + withGuide.length);
});

test('every how-to opens the demo on a screen that is in the menu', () => {
  assert.ok(L.HOW_TOS.length >= 9);
  for (const g of L.HOW_TOS) {
    assert.match(html, new RegExp('data-v="' + g.view + '"'), g.id + ' -> ' + g.view);
    assert.ok(g.steps.length >= 3 && g.when, g.id);
  }
});

test('the footer links to the help page', () => {
  assert.match(footer, /checkpoint-console\/help\//);
});
