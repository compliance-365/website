// Tests for public/checkpoint/report.js — window.ReportEngine.buildReport().
// report.js is a plain (non-module) script assigning onto `window`, same
// pattern as store.js/guidance.js — stub `window`/`location` before
// requiring it so its top-level IIFE has somewhere to attach.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
global.window = global.window || {};
global.location = global.location || { href: 'https://example.com/checkpoint/index.html' };
require('../public/checkpoint/report.js');

const { buildReport } = window.ReportEngine;

function baseSpec(overrides) {
  return Object.assign({
    type: 'soa',
    reportTitle: 'Statement of Applicability — ISO 27001',
    framework: 'ISO 27001',
    client: { name: 'Acme Pty Ltd', logoUrl: null },
    classification: 'Commercial in Confidence',
    version: 3,
    date: '9 July 2026',
    dateIso: '2026-07-09',
    preparedBy: 'Jane Practitioner',
    nextReviewDate: '9 October 2026',
    dashboard: { intro: 'Intro paragraph.', charts: [{ figure: 1, title: 'Readiness', caption: 'A one-line takeaway.', svg: '<svg viewBox="0 0 10 10"><rect width="10" height="10"/></svg>' }] },
    sections: [{ heading: 'Control applicability', html: '<table><tr><td>A.5.1</td></tr></table>', pageBreak: true }],
    methodology: {
      signals: [{ label: 'Conditional Access', available: true }, { label: 'Intune device management', available: false }],
      scanTimestamps: ['9 July 2026 — scored 82/100'],
      coverage: { automatable: 15, total: 22 },
      scoringNote: 'Explanation of scoring.'
    },
    signOff: { preparedBy: 'Jane Practitioner', clientApprover: '' }
  }, overrides);
}

describe('buildReport() — structure', () => {
  test('produces a full HTML document', () => {
    const html = buildReport(baseSpec());
    assert.match(html, /^<!DOCTYPE html>/);
    assert.match(html, /<\/html>$/);
  });

  test('cover page shows client, classification, version, date, prepared-by', () => {
    const html = buildReport(baseSpec());
    assert.match(html, /rpt-cover-title">Statement of Applicability — ISO 27001</);
    assert.match(html, /Acme Pty Ltd/);
    assert.match(html, /Commercial in Confidence/);
    assert.match(html, /v3/);
    assert.match(html, /9 July 2026/);
    assert.match(html, /Jane Practitioner/);
  });

  test('cover page renders a logo <img> only when logoUrl is set', () => {
    const withLogo = buildReport(baseSpec({ client: { name: 'Acme', logoUrl: 'data:image/png;base64,AAA' } }));
    assert.match(withLogo, /<img class="rpt-cover-logo" src="data:image\/png;base64,AAA"/);
    const withoutLogo = buildReport(baseSpec());
    assert.doesNotMatch(withoutLogo, /<img class="rpt-cover-logo"/);
  });

  test('document control table includes version/date/author/distribution/next review', () => {
    const html = buildReport(baseSpec());
    assert.match(html, /Document control/);
    assert.match(html, /Practitioner \+ client approver/);
    assert.match(html, /9 October 2026/);
  });

  test('document control shows an em dash when no next review date is set', () => {
    const html = buildReport(baseSpec({ nextReviewDate: '' }));
    assert.match(html, /<td>—<\/td>/);
  });
});

describe('buildReport() — table of contents', () => {
  test('one TOC entry per dashboard + content section + methodology + sign-off', () => {
    const spec = baseSpec({ sections: [
      { heading: 'First section', html: '<p>a</p>' },
      { heading: 'Second section', html: '<p>b</p>' }
    ] });
    const html = buildReport(spec);
    const hrefs = [...html.matchAll(/<a href="#([^"]+)">/g)].map((m) => m[1]);
    assert.deepEqual(hrefs, ['sec-dashboard', 'sec-0-first-section', 'sec-1-second-section', 'sec-methodology', 'sec-signoff']);
  });

  test('every TOC href resolves to a real id in the document', () => {
    const spec = baseSpec({ sections: [
      { heading: 'Alpha', html: '<p>a</p>' },
      { heading: 'Beta', html: '<p>b</p>', pageBreak: false }
    ] });
    const html = buildReport(spec);
    const hrefs = [...html.matchAll(/<a href="#([^"]+)">/g)].map((m) => m[1]);
    hrefs.forEach((id) => {
      assert.match(html, new RegExp('id="' + id + '"'), `no element with id="${id}" found for TOC entry`);
    });
  });

  test('omits the dashboard TOC entry when spec.dashboard is null', () => {
    const html = buildReport(baseSpec({ dashboard: null }));
    assert.doesNotMatch(html, /#sec-dashboard/);
    assert.doesNotMatch(html, /id="sec-dashboard"/);
  });
});

describe('buildReport() — dashboard and sections', () => {
  test('dashboard renders intro and every chart card (figure number, title, svg, caption)', () => {
    const html = buildReport(baseSpec());
    assert.match(html, /Intro paragraph\./);
    assert.match(html, /Figure 1 — Readiness/);
    assert.match(html, /<svg viewBox="0 0 10 10"><rect width="10" height="10"\/><\/svg>/);
    assert.match(html, /A one-line takeaway\./);
  });

  test('a section with pageBreak:false gets the flow class, not the page class', () => {
    const spec = baseSpec({ sections: [{ heading: 'Continuation', html: '<p>x</p>', pageBreak: false }] });
    const html = buildReport(spec);
    assert.match(html, /<div class="rpt-flow" id="sec-0-continuation">/);
  });

  test('a section with pageBreak:true (or omitted) gets the page class', () => {
    const spec = baseSpec({ sections: [{ heading: 'Major', html: '<p>x</p>' }] });
    const html = buildReport(spec);
    assert.match(html, /<div class="rpt-page" id="sec-0-major">/);
  });

  test('section html is inserted as trusted markup, not escaped', () => {
    const spec = baseSpec({ sections: [{ heading: 'Raw', html: '<table><tr><th>Code</th></tr></table>' }] });
    const html = buildReport(spec);
    assert.match(html, /<table><tr><th>Code<\/th><\/tr><\/table>/);
  });
});

describe('buildReport() — methodology appendix', () => {
  test('lists every Graph signal with its availability', () => {
    const html = buildReport(baseSpec());
    assert.match(html, /Conditional Access — <b>available in this tenant<\/b>/);
    assert.match(html, /Intune device management — <b>unavailable — related checks assessed manually<\/b>/);
  });

  test('shows scan timestamps and capability coverage', () => {
    const html = buildReport(baseSpec());
    assert.match(html, /9 July 2026 — scored 82\/100/);
    assert.match(html, /15 of 22 posture checks are automatable/);
  });

  test('falls back to a plain message when there are no scans yet', () => {
    const html = buildReport(baseSpec({ methodology: Object.assign({}, baseSpec().methodology, { scanTimestamps: [] }) }));
    assert.match(html, /No posture scan has been run yet\./);
  });

  test('includes the scoring explanation verbatim (trusted html)', () => {
    const html = buildReport(baseSpec());
    assert.match(html, /Explanation of scoring\./);
  });
});

describe('buildReport() — sign-off', () => {
  test('shows the prepared-by name and blank signature/date lines', () => {
    const html = buildReport(baseSpec());
    assert.match(html, /Sign-off/);
    assert.match(html, /Jane Practitioner/);
    assert.match(html, /Client approver/);
    assert.match(html, /Date: ______________/);
  });
});

describe('buildReport() — escaping of raw fields', () => {
  test('client name, classification and prepared-by are HTML-escaped', () => {
    const spec = baseSpec({
      client: { name: '<script>alert(1)</script>', logoUrl: null },
      classification: 'Tag & <b>bold</b>',
      preparedBy: '"Jane" <Practitioner>'
    });
    const html = buildReport(spec);
    assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/);
    assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
    assert.match(html, /Tag &amp; &lt;b&gt;bold&lt;\/b&gt;/);
    assert.match(html, /&quot;Jane&quot; &lt;Practitioner&gt;/);
  });

  test('a heading containing HTML is escaped even though section html is trusted', () => {
    const spec = baseSpec({ sections: [{ heading: '<img src=x onerror=alert(1)>', html: '<p>safe</p>' }] });
    const html = buildReport(spec);
    assert.doesNotMatch(html, /<img src=x onerror=alert\(1\)>/);
    assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  });
});

describe('buildReport() — print CSS (paged media)', () => {
  test('declares @page A4 with margins', () => {
    const html = buildReport(baseSpec());
    assert.match(html, /@page\{size:A4;margin:/);
  });

  test('header/footer become position:fixed only under @media print', () => {
    const html = buildReport(baseSpec());
    const printBlockMatch = html.match(/@media print\{([\s\S]*?)\}\s*<\/style>/);
    assert.ok(printBlockMatch, 'expected an @media print block in the stylesheet');
    assert.match(printBlockMatch[1], /\.rpt-header\{position:fixed/);
    assert.match(printBlockMatch[1], /\.rpt-footer\{position:fixed/);
    // The footer no longer uses a CSS page counter: it resolved once at the
    // fixed footer's DOM position and printed the same (off-by-one) number on
    // every page, so it was replaced with the document's title + version.
    assert.doesNotMatch(printBlockMatch[1], /counter\(page\)/);
  });

  test('page-break-before:always on .rpt-page, avoided on the first page', () => {
    const html = buildReport(baseSpec());
    assert.match(html, /\.rpt-page\{page-break-before:always\}/);
    assert.match(html, /\.rpt-page:first-child\{page-break-before:avoid\}/);
  });

  test('table rows, stat cards and chart cards avoid breaking across a page', () => {
    const html = buildReport(baseSpec());
    assert.match(html, /tr,\.rpt-stats div,\.rpt-cover-meta tr,\.rpt-chart-card\{break-inside:avoid;page-break-inside:avoid\}/);
  });
});
