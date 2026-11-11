// Back and Forward move between Checkpoint's screens.
//
// Checkpoint is one page, and until 1.190.0 a screen change left no
// trace in the browser's history: Back, the button people reach for
// first, left Checkpoint altogether. App.go() now records each screen as
// a history entry and a popstate listener opens the one being returned
// to. The address never changes, because sign-in and the links into
// Checkpoint (?view=...) both depend on it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../public/checkpoint/app.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../public/checkpoint/styles.css', import.meta.url), 'utf8');

function body(name) {
  const at = app.indexOf('function ' + name + '(');
  assert.ok(at > -1, name + '() exists');
  return app.slice(at, app.indexOf('\n  }\n', at));
}

test('App.go() records the screen, except when history itself asked for it', () => {
  assert.match(app, /go: function \(v, fromHistory\) \{/);
  assert.match(app, /if \(fromHistory !== true\) recordViewInHistory\(v\);/);
});

test('history entries never change the address', () => {
  const fn = body('recordViewInHistory');
  const calls = [...fn.matchAll(/history\.(?:push|replace)State\(([^)]*)\)/g)].map((m) => m[1]);
  assert.ok(calls.length >= 2, 'both replaceState and pushState are used');
  for (const args of calls) assert.match(args, /^\{ cpView: \w+ \}, ''$/, 'no URL argument: ' + args);
});

test('the first screen is kept as the entry Back returns to', () => {
  const fn = body('recordViewInHistory');
  assert.match(fn, /cur == null/, 'covers both no state yet and a state cleared by replaceState(null)');
  assert.match(fn, /currentView\(\) \|\| v/);
});

test('Back only opens a screen the person can reach from the menu', () => {
  const fn = body('viewReachable');
  assert.match(fn, /\.nav-item\[data-v="/);
  assert.match(fn, /style\.display !== 'none'/);
  assert.match(app, /addEventListener\('popstate'/);
  assert.match(app, /if \(!viewReachable\(v\)/);
});

test('sticky table headings follow the measured height of the top bar', () => {
  assert.match(body('syncTopbarHeight'), /setProperty\('--topbar-h', bar\.offsetHeight \+ 'px'\)/);
});

test('a record reference in the first column stays on one line', () => {
  assert.match(css, /td\.src:first-child\{white-space:nowrap\}/);
});

test('phone: stacked rows wrap their buttons and menus open as a bottom sheet', () => {
  assert.match(css, /\.stack-tbl td\{flex-wrap:wrap\}/);
  assert.match(css, /\.btn-menu-list,\.my-settings \.btn-menu-list\{position:fixed;[^}]*bottom:12px/);
  assert.match(css, /#soaFwTabs\{flex-wrap:nowrap;overflow-x:auto/);
});
