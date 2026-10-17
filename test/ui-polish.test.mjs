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

const app = readFileSync(new URL('../public/checkpoint/app.js', import.meta.url), 'utf8');

test('page help folds to one line once seen in an earlier session', () => {
  assert.match(app, /var PAGE_GUIDE_SEEN_KEY = 'cpGuideSeen';/);
  assert.match(app, /var folded = _guideSeenAtStart\.indexOf\(v\) !== -1;/, 'judged from the session start, so a first visit stays open');
  assert.match(app, /<summary>About this page<\/summary>/);
  assert.match(css, /\.next-step-bar\.in-guide\{margin:4px 0 0;flex:1 1 auto\}/, 'the Next step bar sits left, filling the row');
});

test('phones fold Reset, Help and Settings behind More', () => {
  assert.match(html, /id="btnTopMore" data-action="App\.toggleTopMore" aria-label="More" aria-expanded="false"/);
  assert.match(css, /\.top \.right > \.btn:not\(#btnScanTop\):not\(\.top-more\)\{display:none\}/);
  assert.match(css, /\.top\.more-open \.right > \.btn:not\(#btnScanTop\):not\(\.top-more\)\{display:inline-flex\}/);
  assert.match(app, /toggleTopMore: function \(\) \{/);
});

test('column headings stay on one line, and the actions table fits its card', () => {
  assert.match(css, /^th\{[^}]*white-space:nowrap\}/m);
  assert.match(css, /#v-actions \.card > table th,#v-actions \.card > table td\{padding-left:10px;padding-right:10px\}/);
  assert.match(css, /\.integ-head \.integ-st \{ order: -1;/);
});
