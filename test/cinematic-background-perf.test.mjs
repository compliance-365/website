import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/* The homepage's WebGL background used to start its render loop on load
   and run it at full frame rate, which was ~99% of the page's main-thread
   work in Lighthouse (mobile score 44). These guard the fixes. */
const src = readFileSync('src/components/CinematicBackground.astro', 'utf8');

test('phones never start WebGL', () => {
  assert.match(src, /if \(window\.innerWidth < 640\) return;[\s\S]*getContext\('webgl'/);
});

test('the loop waits for the visitor to interact before it starts', () => {
  assert.match(src, /startEvents\.forEach\(\(ev\) => window\.addEventListener\(ev, start/);
  // The loop is scheduled in exactly three places: tick() re-arming itself,
  // start() (first interaction) and the pause button's resume. None of them
  // runs at load, and start() is the one that begins it.
  const calls = src.match(/frame = requestAnimationFrame\(tick\);/g) || [];
  assert.equal(calls.length, 3);
  const startFn = src.slice(src.indexOf('function start()'), src.indexOf('startEvents.forEach((ev) => window.addEventListener'));
  assert.match(startFn, /frame = requestAnimationFrame\(tick\);/);
  const resumeFn = src.slice(src.indexOf('function setPaused('), src.indexOf("toggle.addEventListener('click'"));
  assert.match(resumeFn, /frame = requestAnimationFrame\(tick\);/);
});

test('the loop is capped at about 30 frames a second and reads no layout', () => {
  assert.match(src, /now - last < 33/);
  assert.doesNotMatch(src, /getBoundingClientRect\(\)/);
});
