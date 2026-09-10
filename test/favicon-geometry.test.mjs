// The Checkpoint app does not serve /assets/favicon.svg. It redraws the
// mark on a 64px canvas in app.js's updateFavicon(), because the dot has
// to turn red when the tenant has an open Critical residual risk and a
// static file cannot do that.
//
// Two copies of one logo in two languages, with nothing tying them
// together, is exactly the setup that drifts — and it did. The canvas
// version shipped with the ring's gap at 270deg (straight up, canvas y
// running downward) instead of the 0deg the real mark uses, so the tab
// icon appeared rotated a quarter turn; the gold dot sat outside the ring
// on top of the stroke; and the ring was drawn at radius 20 where the
// 64/200 scale calls for 28.16. Only the stroke width and the dot radius
// had been scaled correctly. Nothing failed — the icon simply looked
// wrong, in a 16px square nobody diffs.
//
// So this reads BOTH files and asserts the canvas is the SVG times K.
// Every expected number below comes out of favicon.svg itself, never a
// literal here: change the brand mark and this test tells you the canvas
// still has to follow.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const svg = readFileSync(new URL('../public/assets/favicon.svg', import.meta.url), 'utf8');
const app = readFileSync(new URL('../public/checkpoint/app.js', import.meta.url), 'utf8');

/* Just the function, so a stray `88 * K` elsewhere in a 10k-line file
   cannot satisfy an assertion about the favicon. */
const fn = (() => {
  const start = app.indexOf('function updateFavicon()');
  assert.ok(start > -1, 'updateFavicon() has been renamed or removed');
  const end = app.indexOf('\n  }', start);
  return app.slice(start, end);
})();

const attr = (re, label) => {
  const m = re.exec(svg);
  assert.ok(m, 'favicon.svg no longer has ' + label);
  return m[1];
};

const SVG = {
  rx: Number(attr(/<rect[^>]*\brx="([\d.]+)"/, 'a rounded backdrop')),
  ring: Number(attr(/<path[^>]*\bd="M[\d.,]+ A([\d.]+),/, 'its ring path')),
  stroke: Number(attr(/<path[^>]*\bstroke-width="([\d.]+)"/, 'a ring stroke width')),
  dotX: Number(attr(/<circle[^>]*\bcx="([\d.]+)"/, 'its dot')),
  dotY: Number(attr(/<circle[^>]*\bcy="([\d.]+)"/, 'its dot')),
  dotR: Number(attr(/<circle[^>]*\br="([\d.]+)"/, 'its dot')),
  box: Number(attr(/viewBox="0 0 ([\d.]+)/, 'a viewBox')),
  ink: attr(/<rect[^>]*\bfill="(#[0-9A-Fa-f]{6})"/, 'a backdrop colour'),
  paper: attr(/<path[^>]*\bstroke="(#[0-9A-Fa-f]{6})"/, 'a ring colour'),
  gold: attr(/<circle[^>]*\bfill="(#[0-9A-Fa-f]{6})"/, 'a dot colour')
};

describe('the canvas favicon is the SVG mark, to scale', () => {
  test('it scales by canvas size over viewBox, not by hand-picked numbers', () => {
    // The original bug was four independent literals, two of them wrong.
    // Deriving K once is what makes the rest of this checkable at all.
    assert.match(fn, /var K = 64 \/ 200;/,
      'updateFavicon() must derive one scale factor from the viewBox');
    assert.equal(SVG.box, 200, 'favicon.svg viewBox changed — K in app.js must change with it');
  });

  for (const [label, value] of [
    ['backdrop corner radius', SVG.rx],
    ['ring radius', SVG.ring],
    ['ring stroke width', SVG.stroke],
    ['dot centre x', SVG.dotX],
    ['dot radius', SVG.dotR]
  ]) {
    test(label + ' is the SVG\'s ' + value + ', scaled', () => {
      assert.ok(new RegExp('\\b' + value + ' \\* K\\b').test(fn),
        label + ' must be drawn as `' + value + ' * K`; found none in updateFavicon()');
    });
  }

  test('the ring is centred in the box', () => {
    const half = SVG.box / 2;
    assert.equal(SVG.dotY, half, 'the mark is no longer vertically centred in the SVG');
    assert.match(fn, new RegExp('CX = ' + half + ' \\* K, CY = ' + half + ' \\* K'));
  });
});

describe('the gap in the ring faces right, where the dot is', () => {
  // This is the defect a user actually reported: "why does the logo look
  // on the side?" A gap anywhere but 0deg reads as a rotated logo.
  const arc = /ctx\.arc\(CX, CY, R, (-?[\d.]+) \* Math\.PI \/ 180, (-?[\d.]+) \* Math\.PI \/ 180\)/.exec(fn);

  test('the arc is drawn from an explicit start and end angle', () => {
    assert.ok(arc, 'the ring arc is no longer written as two degree literals');
  });

  test('its gap is centred on 0deg — the right-hand side', () => {
    const [start, end] = [Number(arc[1]), Number(arc[2])];
    // Canvas arcs default to clockwise, so the ink runs start -> end and
    // the gap is what is left over, from `end` round to `start + 360`.
    const gapMid = ((end + (start + 360)) / 2) % 360;
    assert.equal(gapMid, 0, 'the gap must sit at 0deg; 90 is up, 180 is left, 270 is down');
  });

  test('the dot sits inside that gap, on the ring, not beyond it', () => {
    // The shipped version put the dot at distance 24 from a radius-20
    // ring: floating off the stroke rather than closing the C.
    assert.equal(SVG.dotX - SVG.box / 2, SVG.ring,
      'in favicon.svg the dot centre must lie on the ring; the canvas copies it');
  });

  test('the whole gap is wider than the dot it holds', () => {
    const [start, end] = [Number(arc[1]), Number(arc[2])];
    const gapDeg = start + 360 - end;
    const dotDeg = 2 * Math.atan(SVG.dotR / SVG.ring) * 180 / Math.PI;
    assert.ok(gapDeg > dotDeg, 'the dot (' + dotDeg.toFixed(1) + 'deg) does not fit in a ' + gapDeg + 'deg gap');
  });
});

describe('the palette matches the brand mark', () => {
  for (const [label, hex] of [['backdrop', SVG.ink], ['ring', SVG.paper], ['dot', SVG.gold]]) {
    test(label + ' is ' + hex, () => {
      assert.ok(fn.includes("'" + hex + "'"), 'updateFavicon() should paint the ' + label + ' ' + hex);
    });
  }

  test('the dot has an alternate colour for an open Critical risk', () => {
    // The entire reason this is a canvas and not the static file.
    assert.match(fn, /hasCritical \? '#[0-9a-fA-F]{6}' : '#[0-9A-Fa-f]{6}'/);
  });
});

describe('drawing degrades rather than throws', () => {
  test('a browser without roundRect still gets a backdrop', () => {
    assert.match(fn, /typeof ctx\.roundRect === 'function'/);
    assert.match(fn, /ctx\.fillRect\(0, 0, 64, 64\)/);
  });

  test('a tainted or unsupported canvas leaves the static favicon in place', () => {
    assert.match(fn, /try \{ link\.href = c\.toDataURL/);
  });
});

/* The mark is drawn inline in twenty places — headers, footers, the
   Checkpoint and owner shells, the marketing page, the PDF export — and
   only two of them are the .svg files. Nothing tied the copies together,
   so the site-wide gold-to-orange palette change recoloured thirteen of
   them by search and replace and left favicon.svg and logo.svg gold: the
   browser tab showed one mark and the header another.

   The dot is the one element that stayed gold on purpose. Orange does
   every working job on the site — buttons, rules, eyebrows, links — and
   the mark keeps the single gold accent it always had. That only reads
   as deliberate if it is gold in every copy, which is what this asserts,
   against favicon.svg rather than a literal written here. */
describe('every inline copy of the mark uses the same dot colour', () => {
  const DOT = /cx="188" cy="100" r="\d+" fill="(#[0-9A-Fa-f]{6})"/g;
  const files = execSync('git ls-files', { encoding: 'utf8' }).split('\n')
    .filter(Boolean)
    .filter(f => !f.startsWith('design/'))
    .filter(f => /\.(svg|html|astro|js|ts|mjs)$/.test(f));

  const found = [];
  for (const f of files) {
    let src;
    try { src = readFileSync(new URL('../' + f, import.meta.url), 'utf8'); } catch { continue; }
    for (const m of src.matchAll(DOT)) found.push({ f, hex: m[1].toUpperCase() });
  }

  test('the mark is drawn in more than one place, so this check has something to compare', () => {
    assert.ok(found.length > 1, 'no inline copies of the mark were found — has its geometry changed?');
  });

  test(`all ${found.length} copies match favicon.svg's dot`, () => {
    const want = SVG.gold.toUpperCase();
    const wrong = found.filter(x => x.hex !== want).map(x => `${x.f} (${x.hex})`);
    assert.deepEqual(wrong, [],
      `favicon.svg paints the dot ${want}; these copies disagree:\n  ` + wrong.join('\n  '));
  });
});
