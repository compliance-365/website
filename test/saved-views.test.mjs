// Saved views (1.191.0): a named set of filter choices on a screen,
// kept per person in their browser. The storage format is read back
// through CheckpointLib.savedViewsParse(), which must drop anything that
// is not the expected shape: localStorage is writable by anyone at the
// keyboard, and a view is applied by pressing pills already on screen,
// never by calling a function a stored value names.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const L = createRequire(import.meta.url)('../public/checkpoint/lib.js');
const app = readFileSync(new URL('../public/checkpoint/app.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../public/checkpoint/index.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('../public/checkpoint/styles.css', import.meta.url), 'utf8');

const pick = (g, id) => ({ g, id });

test('savedViewsUpsert() adds a view and trims its name', () => {
  const out = L.savedViewsUpsert([], { name: '  My   overdue ', picks: [pick('actFilters', 'Overdue')] });
  assert.deepEqual(out.list, [{ name: 'My overdue', picks: [pick('actFilters', 'Overdue')], isDefault: false }]);
});

test('a view with the same name, in any case, replaces the old one', () => {
  const first = L.savedViewsUpsert([], { name: 'Mine', picks: [pick('riskFilters', 'High')] }).list;
  const out = L.savedViewsUpsert(first, { name: 'MINE', picks: [pick('riskFilters', 'Critical')] });
  assert.equal(out.list.length, 1);
  assert.equal(out.list[0].picks[0].id, 'Critical');
  assert.equal(first[0].picks[0].id, 'High', 'the list passed in is not changed');
});

test('only one view per screen is the default', () => {
  let list = L.savedViewsUpsert([], { name: 'A', picks: [pick('g1', 'x')], isDefault: true }).list;
  list = L.savedViewsUpsert(list, { name: 'B', picks: [pick('g1', 'y')], isDefault: true }).list;
  assert.deepEqual(list.map((v) => v.name + ':' + v.isDefault), ['A:false', 'B:true']);
});

test('a blank name or no picks is refused, and so is a ninth view', () => {
  assert.ok(L.savedViewsUpsert([], { name: '  ', picks: [pick('g1', 'x')] }).error);
  assert.ok(L.savedViewsUpsert([], { name: 'A', picks: [] }).error);
  let list = [];
  for (let i = 0; i < L.SAVED_VIEW_MAX; i++) list = L.savedViewsUpsert(list, { name: 'V' + i, picks: [pick('g1', 'x')] }).list;
  assert.equal(list.length, L.SAVED_VIEW_MAX);
  assert.match(L.savedViewsUpsert(list, { name: 'One more', picks: [pick('g1', 'x')] }).error, /Delete one first/);
});

test('savedViewsParse() keeps well-formed views and drops everything else', () => {
  const raw = JSON.stringify({
    risks: [
      { name: 'ok', picks: [pick('riskFilters', 'High')], isDefault: true },
      { name: 'second default', picks: [pick('riskFilters', 'Low')], isDefault: true },
      { name: 'bad group', picks: [pick('risk filters"><img>', 'High')] },
      { name: 'names a function', picks: [{ g: 'riskFilters', id: 'High', a: 'App.resetDemo' }] },
      { name: '', picks: [pick('riskFilters', 'High')] },
      'not an object'
    ],
    'Bad View!': [{ name: 'x', picks: [pick('g', '1')] }],
    actions: 'not a list'
  });
  const out = L.savedViewsParse(raw);
  assert.deepEqual(Object.keys(out), ['risks']);
  assert.deepEqual(out.risks.map((v) => v.name), ['ok', 'second default', 'names a function']);
  assert.deepEqual(out.risks.map((v) => v.isDefault), [true, false, false]);
  assert.deepEqual(out.risks[2].picks, [pick('riskFilters', 'High')], 'only g and id survive');
});

test('savedViewsParse() never throws on rubbish', () => {
  for (const raw of ['', '{', 'null', '[]', '42', undefined, null]) assert.deepEqual(L.savedViewsParse(raw), {});
});

test('savedViewsSame() ignores the order the groups were read in', () => {
  const a = [pick('g1', 'x'), pick('g2', 'y')];
  assert.equal(L.savedViewsSame(a, [pick('g2', 'y'), pick('g1', 'x')]), true);
  assert.equal(L.savedViewsSame(a, [pick('g1', 'x')]), false);
  assert.equal(L.savedViewsSame(a, [pick('g1', 'x'), pick('g2', 'z')]), false);
});

test('a view is applied by pressing a pill on the screen, never by resolving a stored name', () => {
  const at = app.indexOf('async function applyFilterPicks(');
  assert.ok(at > -1);
  const fn = app.slice(at, app.indexOf('\n  }\n', at));
  assert.match(fn, /pill\.click\(\)/);
  assert.doesNotMatch(fn, /resolvePath|runAction|window\[/);
});

test('the filter groups saved views rely on are labelled the way filterGroupsIn() expects', () => {
  assert.match(app, /\/\^\(Filter\|Group\|Framework\)\/\.test\(g\.getAttribute\('aria-label'\)/);
  for (const id of ['riskFilters', 'actFilters', 'actTypeFilters', 'actGroupBy', 'vendorCritFilters', 'soaFwTabs', 'soaCatFilters']) {
    const m = new RegExp('class="filters" id="' + id + '"[^>]*aria-label="([^"]+)"').exec(html);
    assert.ok(m, id + ' is a labelled .filters group');
    assert.match(m[1], /^(Filter|Group|Framework)/, id + ': ' + m[1]);
  }
  /* The supplier form's data-category toggles are .filters too, and
     must stay outside that pattern. */
  const form = /id="vDataCategories"[^>]*aria-label="([^"]+)"/.exec(html);
  assert.ok(form && !/^(Filter|Group|Framework)/.test(form[1]));
});

test('personInitials() gives two letters for a badge', () => {
  assert.equal(L.personInitials('S. Okafor'), 'SO');
  assert.equal(L.personInitials('Mei Ling Chen'), 'MC');
  assert.equal(L.personInitials('priya.nair@example.com'), 'PN');
  assert.equal(L.personInitials('Ops'), 'OP');
  for (const blank of ['', '   ', '—', null, undefined]) assert.equal(L.personInitials(blank), '');
});

test('the status amber is its own colour in both themes, apart from the accent', () => {
  const dark = /--warn:(#[0-9A-Fa-f]{6}); --warn-rgb:([\d,]+);/.exec(css);
  assert.ok(dark, '--warn and --warn-rgb are defined together');
  const accent = /--accent-ink:(#[0-9A-Fa-f]{6});/.exec(css)[1];
  assert.notEqual(dark[1].toLowerCase(), accent.toLowerCase());
  const [r, g, b] = dark[2].split(',').map(Number);
  assert.equal('#' + [r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('').toUpperCase(), dark[1].toUpperCase(), 'the triplet is the same colour');
  const light = /\[data-theme="light"\]\{[\s\S]*?--warn:(#[0-9A-Fa-f]{6}); --warn-rgb:/.exec(css);
  assert.ok(light);
  /* contrastRatio() takes [r, g, b] triplets. */
  const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  for (const [fg, bg] of [[dark[1], '#1C1B22'], [light[1], '#FAF7F1'], [light[1], '#FFFFFF']]) {
    const ratio = L.contrastRatio(rgb(fg), rgb(bg));
    assert.ok(ratio >= 4.5, fg + ' on ' + bg + ' = ' + ratio);
  }
});
