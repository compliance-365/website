// Table cards must never set their own overflow inline.
//
// styles.css decides how a `.card:has(table)` scrolls at each width
// (see the long comment above its sticky <thead> rules): at 1400px and
// up the card is overflow:visible and the header sticks to the WINDOW,
// offset by var(--topbar-h). An inline overflow-x:auto overrides that,
// turns the card into its own scroll container, and the header is then
// drawn --topbar-h pixels down INSIDE the card, on top of the first
// rows. On a one-client roster that hid the client entirely (owner
// console, reproduced in Chromium at 1500px: header 22px below the top
// of the first row, covering it).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const FILES = ['public/owner/index.html', 'public/owner/owner.js', 'public/checkpoint/index.html', 'public/checkpoint/app.js'];

test('no .card sets overflow inline — styles.css owns table-card scrolling', () => {
  const offenders = [];
  for (const f of FILES) {
    const src = readFileSync(new URL('../' + f, import.meta.url), 'utf8');
    for (const m of src.matchAll(/class="card[^"]*"[^>]*style="[^"]*overflow[^"]*"/g)) offenders.push(f + ': ' + m[0].slice(0, 90));
  }
  assert.deepEqual(offenders, [], offenders.join('\n'));
});
