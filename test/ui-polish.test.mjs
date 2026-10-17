// Visual fixes found by sweeping every demo screen at desktop and phone
// widths: hidden bars must stay hidden, and the top bar's search box
// must stay usable at laptop widths.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../public/checkpoint/styles.css', import.meta.url), 'utf8');
const html = readFileSync(new URL('../public/checkpoint/index.html', import.meta.url), 'utf8');

test('bulk and focus bars stay hidden until something is selected', () => {
  assert.match(css, /\.bulk-bar\[hidden\],\.focus-bar\[hidden\]\{display:none\}/);
  for (const id of ['actBulkBar', 'vendorBulkBar', 'soaBulkBar', 'docBulkBar', 'soaFocusBar', 'docFocusBar']) {
    assert.match(html, new RegExp('id="' + id + '"[^>]*hidden'), id + ' starts hidden');
  }
});

test('the search box keeps a usable width and buttons stay on one line on wide screens only', () => {
  assert.match(css, /\.gsearch\{position:relative;flex:1 1 200px;min-width:180px;max-width:340px/);
  assert.match(css, /@media\(min-width:1001px\)\{\.top \.right \.btn\{white-space:nowrap\}\}/);
  assert.match(css, /@media\(max-width:1500px\)\{\.top \.modenote\{display:none\}\}/);
});
