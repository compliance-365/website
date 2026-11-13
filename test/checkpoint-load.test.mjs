// Faster start-up (1.192.0).
//
// 1. Preload hints. Checkpoint's CSP is a <meta> tag (GitHub Pages sends
//    no headers), and Chromium turns its look-ahead preload scanner off
//    for such a page, so the start-up scripts were fetched one after
//    another. scripts/hash-checkpoint-assets.mjs now writes a
//    <link rel="preload"> for each into <head>, copying src, integrity and
//    crossorigin exactly so the preloaded response is the one used.
// 2. A loading screen (#bootSplash) from the first paint, removed by
//    app.js once a real screen is up, and left in place (with a reload
//    prompt after 20 seconds) if a script never arrives.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { addPreloadHints } from '../scripts/hash-checkpoint-assets.mjs';

const html = readFileSync(new URL('../public/checkpoint/index.html', import.meta.url), 'utf8');
const app = readFileSync(new URL('../public/checkpoint/app.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../public/checkpoint/styles.css', import.meta.url), 'utf8');

const PAGE = `<html><head>
<meta http-equiv="Content-Security-Policy" content="default-src 'self'">
<title>x</title>
<link rel="stylesheet" href="styles.abc.css">
</head><body>
<script src="msal.js?v=1"
  integrity="sha384-AAA"
  crossorigin="anonymous"></script>
<script src="lib.123.js" integrity="sha384-BBB" crossorigin="anonymous"></script>
<script src="app.456.js" integrity="sha384-CCC" crossorigin="anonymous"></script>
<template id="deferredScripts"><script src="changelog.789.js" integrity="sha384-DDD" crossorigin="anonymous"></script></template>
</body></html>`;

test('a preload hint for every start-up script, with the same src, integrity and crossorigin', () => {
  const { html: out, count } = addPreloadHints(PAGE, ['fonts/a.1.woff2']);
  assert.equal(count, 4);
  assert.match(out, /<link rel="preload" as="script" href="msal\.js\?v=1" integrity="sha384-AAA" crossorigin="anonymous">/);
  assert.match(out, /<link rel="preload" as="script" href="lib\.123\.js" integrity="sha384-BBB" crossorigin="anonymous">/);
  assert.match(out, /<link rel="preload" as="script" href="app\.456\.js" integrity="sha384-CCC" crossorigin="anonymous">/);
  assert.match(out, /<link rel="preload" as="font" type="font\/woff2" href="fonts\/a\.1\.woff2" crossorigin>/);
});

test('scripts loaded on demand (inside a <template>) get no hint', () => {
  assert.doesNotMatch(addPreloadHints(PAGE, []).html, /rel="preload"[^>]*changelog/);
});

test('the hints go in <head>, after the CSP <meta> and the stylesheet', () => {
  const out = addPreloadHints(PAGE, []).html;
  const first = out.indexOf('rel="preload"');
  assert.ok(first > out.indexOf('Content-Security-Policy'));
  assert.ok(first > out.indexOf('rel="stylesheet"'));
  assert.ok(out.lastIndexOf('rel="preload"') < out.indexOf('</head>'));
});

test('the build fails rather than ship a page whose head it does not recognise', () => {
  assert.throws(() => addPreloadHints(PAGE.replace(/<meta http-equiv[^>]*>/, ''), []), /CSP <meta>/);
  assert.throws(() => addPreloadHints(PAGE.replace(/<link rel="stylesheet"[^>]*>/, ''), []), /stylesheet/);
  assert.throws(() => addPreloadHints(PAGE.replace(/<script[\s\S]*?<\/script>\n/g, ''), []), /no SRI-pinned/);
});

test('the real page has the head the build expects: CSP <meta>, then the stylesheet', () => {
  const csp = html.indexOf('http-equiv="Content-Security-Policy"');
  const sheet = html.indexOf('<link rel="stylesheet" href="styles.css">');
  assert.ok(csp > 0 && sheet > csp);
});

test('the loading screen is the first thing in <body>, styled inline so it shows before styles.css', () => {
  const body = html.slice(html.indexOf('<body>') + 6);
  const firstEl = body.replace(/^\s*(<!--[\s\S]*?-->\s*)*/, '');
  assert.match(firstEl, /^<div class="boot-splash" id="bootSplash" role="status" style="position:fixed;inset:0;[^"]*background:#06060A/);
  assert.match(html, /class="boot-slow"[^>]*visibility:hidden[^>]*>Taking longer than usual\.[^<]*<a href=""[^>]*>reload the page<\/a>/);
  assert.match(css, /\.boot-slow\{animation:bootSlow 0s linear 20s forwards\}/);
});

test('app.js removes it when any top-level screen it watches is shown, and every one of them exists', () => {
  const m = /function watchBootSplash\(\) \{[\s\S]*?var ids = (\[[^\]]+\])/.exec(app);
  assert.ok(m);
  const ids = JSON.parse(m[1].replace(/'/g, '"'));
  for (const id of ['gate', 'wizard', 'appShell', 'busy']) assert.ok(ids.includes(id), id);
  for (const id of ids) assert.match(html, new RegExp('id="' + id + '"'), id);
  assert.match(app, /if \(up\) \{ splash\.remove\(\); obs\.disconnect\(\); \}/);
});
