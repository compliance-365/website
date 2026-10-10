// Feature pages and the glossary: every internal link resolves to a page
// that exists, every demo link opens a real screen, and the claims that
// are easiest to get wrong stay pinned to the code.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const src = (p) => new URL('../src/' + p, import.meta.url);
const read = (p) => readFileSync(src(p), 'utf8');
const features = read('data/checkpoint-features.ts');
const glossary = read('data/glossary.ts');
const checkpointHtml = readFileSync(new URL('../public/checkpoint/index.html', import.meta.url), 'utf8');
const flows = readFileSync(new URL('../public/checkpoint/POWER-AUTOMATE.md', import.meta.url), 'utf8');
const app = readFileSync(new URL('../public/checkpoint/app.js', import.meta.url), 'utf8');

/* A site path like 'services/iso27001/' or 'blog/x/' maps to a page file. */
function pageExists(path) {
  const p = path.replace(/^\//, '').replace(/#.*$/, '').replace(/\/$/, '');
  const m = /^blog\/(.+)$/.exec(p);
  if (m) return existsSync(src('content/blog/' + m[1] + '.md'));
  return existsSync(src('pages/' + p + '.astro')) || existsSync(src('pages/' + p + '/index.astro'));
}

test('every glossary link goes to a page that exists', () => {
  const hrefs = [...glossary.matchAll(/href: '([^']+)'/g)].map((m) => m[1]);
  assert.ok(hrefs.length > 20);
  const missing = hrefs.filter((h) => !pageExists(h));
  assert.deepEqual(missing, []);
});

test('every feature page opens the demo on a real menu screen', () => {
  const views = [...features.matchAll(/demoView: '([^']+)'/g)].map((m) => m[1]);
  assert.equal(views.length, 3);
  for (const v of views) assert.match(checkpointHtml, new RegExp('data-v="' + v + '"'), v);
});

test('feature pages are linked from the Checkpoint page and the footer; the glossary from the footer', () => {
  const ckpt = read('pages/checkpoint-console/index.astro');
  const footer = read('components/Footer.astro');
  for (const slug of ['approvals', 'ticket-sync', 'excel-word-exports']) {
    assert.match(ckpt, new RegExp('checkpoint-console/features/' + slug + '/'));
    assert.match(footer, new RegExp('checkpoint-console/features/' + slug + '/'));
  }
  assert.match(footer, /'glossary\/'/);
});

test('claims match the code and the flow guide', () => {
  assert.match(features, /ServiceNow uses a premium connector/);
  assert.match(flows, /\*\*ServiceNow\*\* \(premium connector\)/);
  assert.match(features, /Planner uses a standard connector/);
  assert.match(flows, /\*\*Planner\*\* \(standard connector\)/);
  assert.match(features, /A nonconformity is never closed from a ticket/);
  assert.match(flows, /A nonconformity is never closed from a ticket/);
  assert.match(features, /none, the information security policy, every policy, or every generated document/);
  assert.match(app, /lvlLabels = \{ '': 'No review step', isp: 'Information security policy', policies: 'All policies', all: 'All generated documents' \}/);
  for (const reg of ['risks', 'actions', 'controls', 'assets', 'vendors', 'legal', 'documents']) {
    assert.match(checkpointHtml, new RegExp('data-action="App\\.exportXlsx" data-id="' + reg + '"'), reg);
  }
  for (const reg of ['controls', 'risks', 'assets']) {
    assert.match(checkpointHtml, new RegExp('data-action="App\\.exportRegisterWord" data-id="' + reg + '"'), reg);
  }
});
