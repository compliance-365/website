/* ============================================================
   Checkpoint — report engine
   ------------------------------------------------------------
   window.ReportEngine.buildReport(spec) assembles one of Checkpoint's
   five report types (soa/risk/ready/exec/mgmt — see app.js's
   buildReportSpec()) into a single, self-contained, print-ready HTML
   document: cover page, document control table, table of contents,
   executive dashboard, the report's own content sections, a
   methodology appendix, and a sign-off block. Every report moves
   through this ONE engine — no per-type HTML assembly lives outside
   app.js's small per-type spec builders any more.

   This file knows nothing about Store/S/Graph — app.js computes every
   value (already escaped exactly as it always was: buildReportSpec()
   calls the same esc()/fmtDate() helpers App.report() used to call
   inline) and hands this file a plain data object. That keeps the
   engine reusable/testable in isolation and, per SETUP.md's note on
   future server-side rendering, trivially portable to a headless-
   Chromium render step later — it's plain HTML/CSS, nothing here
   depends on the browser DOM being interactive.

   spec shape (all string fields are already HTML-safe — this file
   does its own escaping only for the handful of raw display fields
   it's given directly: client name, classification, prepared-by,
   version, dates):
     {
       type: 'soa'|'risk'|'ready'|'exec'|'mgmt',
       reportTitle: string,             // e.g. "Statement of Applicability — ISO 27001"
       framework: string,               // e.g. "ISO 27001"
       client: { name: string, logoUrl: string|null },
       classification: string,          // e.g. "Commercial in Confidence"
       version: number,
       date: string,                    // human-formatted report date
       preparedBy: string,
       nextReviewDate: string,          // human-formatted, or '' for none set
       dashboard: { intro: string(html), kpis: [{ value: string, label: string }] } | null,
       sections: [ { heading: string, html: string(trusted html), pageBreak: boolean } ],
       methodology: {
         signals: [{ label: string, available: boolean }],
         scanTimestamps: string[],       // human-formatted, most recent first
         coverage: { automatable: number, total: number },
         scoringNote: string(html)
       },
       signOff: { preparedBy: string, clientApprover: string }
     }

   Paged-media design: printed header/footer repeat per physical page
   using position:fixed with a negative offset into the @page margin
   band (the one cross-browser-reliable way to do this in Chrome/Edge,
   which do not implement CSS Paged Media's @page margin boxes at
   all) — @media print only; on screen the same markup renders once,
   inline, at the top/bottom of the scrollable document. The printed
   "Page N" comes from a CSS counter incremented once per .rpt-page —
   this counts logical report pages we've deliberately paginated
   (cover, document control, TOC, dashboard, each major content
   section, methodology, sign-off), not necessarily the exact physical
   page a long table overflows onto — an honest, documented limit of
   doing this in plain browser CSS rather than a real pagination
   engine (see SETUP.md's note on headless-Chromium rendering for the
   pixel-perfect alternative). */
(function () {
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }

  function slugify(s, i) { return 'sec-' + i + '-' + String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 40); }

  function mast() {
    return '<div class="rpt-mast"><svg width="22" height="22" viewBox="0 0 200 200" fill="none"><path d="M176.2,56 A88,88 0 1,0 176.2,144" stroke="#0B0B0C" stroke-width="16" stroke-linecap="round"/><circle cx="188" cy="100" r="14" fill="#A9812E"/></svg><span class="w1">COMPLIANCE</span><span class="w2">365</span></div>';
  }

  function coverPage(spec) {
    var logoHtml = spec.client.logoUrl ? '<img class="rpt-cover-logo" src="' + esc(spec.client.logoUrl) + '" alt="' + esc(spec.client.name) + ' logo">' : '';
    return '<div class="rpt-page rpt-cover">' +
      mast() +
      '<div class="rpt-cover-class">' + esc(spec.classification) + '</div>' +
      '<div class="rpt-cover-mid">' + logoHtml + '<h1 class="rpt-cover-title">' + esc(spec.reportTitle) + '</h1>' +
      (spec.framework ? '<div class="rpt-cover-fw">' + esc(spec.framework) + '</div>' : '') + '</div>' +
      '<table class="rpt-cover-meta"><tbody>' +
      '<tr><th>Client</th><td>' + esc(spec.client.name) + '</td></tr>' +
      '<tr><th>Report date</th><td>' + esc(spec.date) + '</td></tr>' +
      '<tr><th>Prepared by</th><td>' + esc(spec.preparedBy) + '</td></tr>' +
      '<tr><th>Version</th><td>v' + esc(spec.version) + '</td></tr>' +
      '<tr><th>Classification</th><td>' + esc(spec.classification) + '</td></tr>' +
      '</tbody></table></div>';
  }

  function docControlPage(spec) {
    return '<div class="rpt-page"><h2>Document control</h2><div class="rpt-rule"></div>' +
      '<table class="rpt-table"><thead><tr><th>Version</th><th>Date</th><th>Author</th><th>Distribution</th><th>Next review</th></tr></thead><tbody>' +
      '<tr><td class="rpt-idc">v' + esc(spec.version) + '</td><td>' + esc(spec.date) + '</td><td>' + esc(spec.preparedBy) + '</td><td>Practitioner + client approver</td><td>' + esc(spec.nextReviewDate || '—') + '</td></tr>' +
      '</tbody></table></div>';
  }

  function tocPage(entries) {
    return '<div class="rpt-page"><h2>Table of contents</h2><div class="rpt-rule"></div><ol class="rpt-toc">' +
      entries.map(function (e) { return '<li><a href="#' + e.id + '">' + esc(e.heading) + '</a></li>'; }).join('') +
      '</ol></div>';
  }

  function dashboardSection(spec, id) {
    if (!spec.dashboard) return '';
    var kpis = (spec.dashboard.kpis || []).map(function (k) { return '<div><b>' + k.value + '</b><span>' + esc(k.label) + '</span></div>'; }).join('');
    return '<div class="rpt-page" id="' + id + '"><h2>Executive dashboard</h2><div class="rpt-rule"></div>' +
      (spec.dashboard.intro ? '<p class="rpt-intro">' + spec.dashboard.intro + '</p>' : '') +
      (kpis ? '<div class="rpt-stats">' + kpis + '</div>' : '') + '</div>';
  }

  function contentSections(spec, entries, startIndex) {
    return (spec.sections || []).map(function (s, i) {
      var entry = entries[startIndex + i];
      var pageBreak = s.pageBreak !== false;
      return '<div class="' + (pageBreak ? 'rpt-page' : 'rpt-flow') + '" id="' + entry.id + '"><h2>' + esc(s.heading) + '</h2><div class="rpt-rule"></div>' + s.html + '</div>';
    }).join('');
  }

  function methodologyPage(spec, id) {
    var m = spec.methodology || {};
    var signalsHtml = (m.signals || []).length
      ? '<ul class="rpt-plain">' + m.signals.map(function (s) { return '<li>' + esc(s.label) + ' — <b>' + (s.available ? 'available in this tenant' : 'unavailable — related checks assessed manually') + '</b></li>'; }).join('') + '</ul>'
      : '<p class="rpt-intro">No Graph signals were used to prepare this report.</p>';
    var scansHtml = (m.scanTimestamps || []).length
      ? '<ul class="rpt-plain">' + m.scanTimestamps.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul>'
      : '<p class="rpt-intro">No posture scan has been run yet.</p>';
    var coverage = m.coverage || { automatable: 0, total: 0 };
    return '<div class="rpt-page" id="' + id + '"><h2>Methodology</h2><div class="rpt-rule"></div>' +
      '<h3>Graph signals informing this report</h3>' + signalsHtml +
      '<h3>Scan timestamps</h3>' + scansHtml +
      '<h3>Capability coverage</h3><p class="rpt-intro">' + coverage.automatable + ' of ' + coverage.total + ' posture checks are automatable via Microsoft Graph in this tenant, given its current licensing. Every other check is assessed manually by the practitioner.</p>' +
      '<h3>How results are scored</h3><p class="rpt-intro">' + (m.scoringNote || '') + '</p>' +
      '</div>';
  }

  function signOffPage(spec, id) {
    var so = spec.signOff || {};
    return '<div class="rpt-flow" id="' + id + '"><h2>Sign-off</h2><div class="rpt-rule"></div>' +
      '<table class="rpt-table rpt-signoff"><tbody>' +
      '<tr><th>Prepared by</th><td>' + esc(so.preparedBy || '') + '</td><td class="rpt-signoff-line">Date: ______________</td></tr>' +
      '<tr><th>Client approver</th><td class="rpt-signoff-line">Name: ______________</td><td class="rpt-signoff-line">Date: ______________</td></tr>' +
      '</tbody></table></div>';
  }

  function buildTocEntries(spec) {
    var entries = [];
    if (spec.dashboard) entries.push({ id: 'sec-dashboard', heading: 'Executive dashboard' });
    (spec.sections || []).forEach(function (s, i) { entries.push({ id: slugify(s.heading, i), heading: s.heading }); });
    entries.push({ id: 'sec-methodology', heading: 'Methodology' });
    entries.push({ id: 'sec-signoff', heading: 'Sign-off' });
    return entries;
  }

  function css(fontBase) {
    return "@font-face{font-family:'Fraunces';font-style:normal;font-weight:400 500;src:url('" + fontBase + "fonts/fraunces.woff2') format('woff2')}" +
      "@font-face{font-family:'Manrope';font-style:normal;font-weight:300 800;src:url('" + fontBase + "fonts/manrope.woff2') format('woff2')}" +
      '@page{size:A4;margin:34mm 16mm 26mm 16mm}' +
      'html,body{margin:0;padding:0}' +
      'body{font-family:Manrope,sans-serif;background:#FAF7F1;color:#0B0B0C;font-size:12.5px;line-height:1.6}' +
      '.rpt-doc{max-width:900px;margin:0 auto;padding:28px 40px}' +
      '.rpt-mast{display:flex;align-items:center;gap:8px;margin-bottom:28px}.w1{font-weight:300;letter-spacing:.13em;font-size:12px}.w2{font-weight:800;color:#A9812E;font-size:12px}' +
      'h1{font-family:Fraunces,serif;font-weight:500}h2{font-family:Fraunces,serif;font-weight:500;font-size:18px;margin:0 0 4px}h3{font-family:Fraunces,serif;font-weight:500;font-size:14px;margin:22px 0 8px}' +
      '.rpt-rule{width:26px;height:1px;background:#A9812E;margin:10px 0 18px}' +
      '.rpt-intro{color:#4b473e;max-width:70ch}' +
      '.rpt-plain{margin:6px 0 0 18px;padding:0}.rpt-plain li{margin-bottom:6px}' +
      '.rpt-table{width:100%;border-collapse:collapse;margin-top:14px}.rpt-table th{font-size:9px;letter-spacing:.14em;text-transform:uppercase;text-align:left;padding:8px 10px;border-bottom:1px solid #0B0B0C;color:#6b675e}' +
      '.rpt-table td{padding:9px 10px;border-bottom:1px solid rgba(11,11,12,.12);vertical-align:top}.rpt-idc{font-weight:800;font-size:11px;white-space:nowrap}' +
      '.rpt-just{font-size:11px;color:#6b675e;font-style:italic;margin-top:4px}' +
      '.rpt-signoff td{padding-top:24px}.rpt-signoff-line{white-space:nowrap;color:#6b675e}' +
      '.rpt-stats{display:flex;border-top:1px solid rgba(11,11,12,.2);border-bottom:1px solid rgba(11,11,12,.2);margin:18px 0}' +
      '.rpt-stats div{flex:1;padding:14px;border-right:1px solid rgba(11,11,12,.12)}.rpt-stats div:last-child{border-right:none}' +
      '.rpt-stats b{display:block;font-size:24px;font-weight:800;color:#A9812E}.rpt-stats span{font-size:9.5px;letter-spacing:.1em;text-transform:uppercase;color:#6b675e}' +
      '.rpt-toc{margin:8px 0 0 0;padding:0;list-style:none}.rpt-toc li{border-bottom:1px solid rgba(11,11,12,.1);padding:9px 0}.rpt-toc a{color:#0B0B0C;text-decoration:none;font-size:13px}' +
      '.rpt-cover{display:flex;flex-direction:column;min-height:210mm}' +
      '.rpt-cover-class{align-self:flex-start;font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:#6b675e;border:1px solid rgba(11,11,12,.3);padding:4px 10px;border-radius:2px;margin-bottom:40px}' +
      '.rpt-cover-mid{flex:1;display:flex;flex-direction:column;justify-content:center}' +
      '.rpt-cover-logo{max-height:56px;max-width:220px;object-fit:contain;margin-bottom:22px}' +
      '.rpt-cover-title{font-size:32px;margin:0 0 8px}.rpt-cover-fw{font-size:13px;letter-spacing:.06em;text-transform:uppercase;color:#A9812E;font-weight:700}' +
      '.rpt-cover-meta{width:100%;border-collapse:collapse;margin-top:30px}.rpt-cover-meta th{text-align:left;font-size:9px;letter-spacing:.14em;text-transform:uppercase;color:#6b675e;padding:8px 0;width:35%}.rpt-cover-meta td{padding:8px 0;font-size:13px;border-bottom:1px solid rgba(11,11,12,.12)}' +
      '.rpt-header,.rpt-footer{display:flex;justify-content:space-between;align-items:center;font-size:9.5px;letter-spacing:.08em;text-transform:uppercase;color:#8b877d}' +
      '.rpt-header{border-bottom:1px solid rgba(11,11,12,.15);padding:0 40px 10px;margin-bottom:6px}' +
      '.rpt-footer{border-top:1px solid rgba(11,11,12,.15);padding:10px 40px 0}' +
      '.rpt-page{page-break-before:always}.rpt-page:first-child{page-break-before:avoid}' +
      '.rpt-flow{margin-top:26px}' +
      'tr,.rpt-stats div,.rpt-cover-meta tr{break-inside:avoid;page-break-inside:avoid}' +
      '@media screen{' +
        '.rpt-header,.rpt-footer{max-width:900px;margin:0 auto}' +
        '.page-num::after{content:"On-screen preview — page numbers appear when printed"}' +
        '.rpt-page{background:#fff;box-shadow:0 1px 3px rgba(11,11,12,.15);border-radius:2px;padding:34px 40px;margin:22px auto;max-width:820px}' +
      '}' +
      '@media print{' +
        'body{background:#fff;counter-reset:page 1}' +
        '.rpt-doc{padding:0 24px}' +
        '.rpt-page{counter-increment:page}' +
        '.rpt-header{position:fixed;top:-22mm;left:16mm;right:16mm;width:auto}' +
        '.rpt-footer{position:fixed;bottom:-18mm;left:16mm;right:16mm;width:auto}' +
        '.page-num::after{content:"Page " counter(page)}' +
      '}';
  }

  function buildReport(spec) {
    var fontBase = (typeof location !== 'undefined') ? location.href.slice(0, location.href.lastIndexOf('/') + 1) : '';
    var entries = buildTocEntries(spec);
    var contentEntryStart = spec.dashboard ? 1 : 0;
    var header = '<div class="rpt-header"><span>' + esc(spec.client.name) + ' — ' + esc(spec.reportTitle) + '</span><span>' + esc(spec.classification) + '</span></div>';
    var footer = '<div class="rpt-footer"><span class="page-num"></span><span>' + esc(spec.classification) + '</span><span>Generated ' + esc(spec.date) + '</span></div>';
    var body = coverPage(spec) + docControlPage(spec) + tocPage(entries) +
      dashboardSection(spec, 'sec-dashboard') +
      contentSections(spec, entries, contentEntryStart) +
      methodologyPage(spec, 'sec-methodology') +
      signOffPage(spec, 'sec-signoff');
    return '<!DOCTYPE html><html><head><meta charset="utf-8"><style>' + css(fontBase) + '</style></head><body>' +
      header + '<div class="rpt-doc">' + body + '</div>' + footer +
      '</body></html>';
  }

  window.ReportEngine = { buildReport: buildReport };
})();
