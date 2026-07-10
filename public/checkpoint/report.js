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

  /* ============================================================
     Visual dashboard — reusable chart functions (data in, SVG string
     out). Pure inline SVG, no libraries. Every number that reaches an
     SVG attribute or text node goes through fx() (coerced to a finite
     Number, so it can never carry a quote/tag) or escSvgText() (the
     same 5-entity escape esc() uses) — nothing is ever templated into
     SVG unescaped, matching the requirement that these charts can't
     become an injection vector even though their inputs originate
     from live tenant data (control titles, risk titles, etc. never
     appear in a chart directly — only counts/percentages/labels the
     report builder already computed).

     Palette: validated with the dataviz skill's CVD/chroma/contrast
     checks (see PAL's comment) rather than picked by eye. Two neutral
     tones (NEUTRAL/MUTED) deliberately do NOT try to pass as
     categorical hues — a true gray fails the chroma-floor check by
     definition. Per the skill's own guidance for that case, they're
     differentiated by fill treatment (a hatch texture vs a plain
     recessive tint) instead of hue, and always carry a direct text
     label/legend entry, never color alone.
     ============================================================ */
  function escSvgText(s) { return esc(s); }
  function fx(v, d) { v = Number(v); if (!isFinite(v)) v = 0; var m = Math.pow(10, d || 2); return Math.round(v * m) / m; }
  function hexToRgb(hex) { var h = hex.replace('#', ''); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)].join(','); }

  var PAL = {
    good: '#3A7A3A',      /* Implemented / Low risk / auto-captured-good-trend */
    warn: '#B57F2A',      /* In progress / Medium risk */
    high: '#A9522E',      /* High risk (severity ramp only, not used for control status) */
    bad: '#8F2E2E',       /* Critical risk / a "bad" trend arrow */
    neutral: '#8B877D',   /* Not started / manual evidence — deliberately low-chroma; see header comment */
    muted: '#D9D4C8',     /* Not applicable — most receded; also low-chroma by design */
    gold: '#A9812E'       /* brand accent only (target band, auto-captured mark) — never a 5th status hue */
  };

  function chartCard(figure, title, caption, svg) {
    return '<div class="rpt-chart-card">' +
      '<h3 class="rpt-chart-title">Figure ' + fx(figure, 0) + ' — ' + escSvgText(title) + '</h3>' +
      svg +
      '<p class="rpt-chart-caption">' + escSvgText(caption) + '</p>' +
      '</div>';
  }

  function placeholderSvg(w, h, message) {
    return '<svg viewBox="0 0 ' + fx(w, 0) + ' ' + fx(h, 0) + '" width="100%" role="img" aria-label="' + escSvgText(message) + '">' +
      '<rect x="0.5" y="0.5" width="' + fx(w - 1, 0) + '" height="' + fx(h - 1, 0) + '" fill="none" stroke="#D9D4C8" stroke-width="1" stroke-dasharray="4,4"/>' +
      '<text x="' + fx(w / 2) + '" y="' + fx(h / 2) + '" text-anchor="middle" dominant-baseline="middle" font-family="Manrope,sans-serif" font-size="12" fill="#8b877d">' + escSvgText(message) + '</text>' +
      '</svg>';
  }

  var HATCH_DEFS = '<defs>' +
    '<pattern id="rpt-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">' +
    '<rect width="6" height="6" fill="' + PAL.muted + '"/><line x1="0" y1="0" x2="0" y2="6" stroke="' + PAL.neutral + '" stroke-width="1.5"/>' +
    '</pattern></defs>';

  /* 1. Readiness donut — implemented/inProgress/notStarted/notApplicable
     counts in. Centre label is readiness % over APPLICABLE controls
     only (excludes notApplicable), matching readinessPct() elsewhere. */
  function donutChart(data) {
    var implemented = Math.max(0, Math.round(Number(data && data.implemented) || 0));
    var inProgress = Math.max(0, Math.round(Number(data && data.inProgress) || 0));
    var notStarted = Math.max(0, Math.round(Number(data && data.notStarted) || 0));
    var notApplicable = Math.max(0, Math.round(Number(data && data.notApplicable) || 0));
    var total = implemented + inProgress + notStarted + notApplicable;
    if (!total) return placeholderSvg(520, 200, 'No controls in scope yet.');

    var applicable = implemented + inProgress + notStarted;
    var pct = applicable ? Math.round(implemented / applicable * 100) : 0;
    var cx = 100, cy = 100, r = 70, sw = 30;
    var circumference = 2 * Math.PI * r;
    var segments = [
      ['Implemented', implemented, PAL.good, false],
      ['In progress', inProgress, PAL.warn, false],
      ['Not started', notStarted, PAL.neutral, true],
      ['Not applicable', notApplicable, PAL.muted, false]
    ];
    var offset = 0;
    var arcs = segments.map(function (seg) {
      var len = (seg[1] / total) * circumference;
      var gap = total > seg[1] ? 1.5 : 0; /* small surface gap between adjacent segments */
      var dash = Math.max(0, len - gap) + ',' + fx(circumference - len + gap);
      var circle = '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" stroke="' + (seg[3] ? 'url(#rpt-hatch)' : seg[2]) + '" stroke-width="' + sw + '" stroke-dasharray="' + dash + '" stroke-dashoffset="' + fx(-offset) + '" transform="rotate(-90 ' + cx + ' ' + cy + ')"/>';
      offset += len;
      return circle;
    }).join('');
    var legend = segments.map(function (seg, i) {
      var y = 40 + i * 24;
      var segPct = total ? Math.round(seg[1] / total * 100) : 0;
      return '<rect x="220" y="' + (y - 10) + '" width="12" height="12" fill="' + (seg[3] ? 'url(#rpt-hatch)' : seg[2]) + '"/>' +
        '<text x="238" y="' + y + '" font-family="Manrope,sans-serif" font-size="11" fill="#0B0B0C">' + escSvgText(seg[0]) + '</text>' +
        '<text x="440" y="' + y + '" text-anchor="end" font-family="Manrope,sans-serif" font-size="11" font-weight="700" fill="#4b473e">' + seg[1] + ' (' + segPct + '%)</text>';
    }).join('');
    return '<svg viewBox="0 0 460 200" width="100%" role="img" aria-label="Readiness donut: ' + pct + '% of applicable controls implemented">' + HATCH_DEFS +
      arcs +
      '<text x="' + cx + '" y="' + (cy - 4) + '" text-anchor="middle" font-family="Fraunces,serif" font-size="28" font-weight="500" fill="#0B0B0C">' + pct + '%</text>' +
      '<text x="' + cx + '" y="' + (cy + 16) + '" text-anchor="middle" font-family="Manrope,sans-serif" font-size="9" letter-spacing="1" fill="#8b877d">IMPLEMENTED</text>' +
      legend +
      '</svg>';
  }

  /* 2. Posture trend line — scans: [{ dateLabel, score, readiness? }] in
     chronological order (already formatted for display by the caller —
     report.js stays date-formatting-agnostic, same reasoning as its
     other fields). Reuses the dashboard sparkline's own normalised
     point formula (x = i/(n-1), y = 1 - score/100) — see renderDash()'s
     spark rendering in app.js — just at chart, not sparkline, scale,
     with an axis and a target band added. targetScore is optional. */
  function trendChart(scans, targetScore) {
    scans = Array.isArray(scans) ? scans : [];
    var n = scans.length;
    if (!n) return placeholderSvg(580, 210, 'No posture scans recorded yet — history builds as scans run.');

    var x0 = 46, x1 = 566, y0 = 24, y1 = 156; /* plot frame */
    var yFor = function (score) { return y1 - (Math.max(0, Math.min(100, Number(score) || 0)) / 100) * (y1 - y0); };
    var xFor = function (i) { return n === 1 ? (x0 + x1) / 2 : x0 + (i / (n - 1)) * (x1 - x0); };

    var gridlines = [0, 50, 100].map(function (v) {
      var y = fx(yFor(v));
      return '<line x1="' + x0 + '" y1="' + y + '" x2="' + x1 + '" y2="' + y + '" stroke="rgba(11,11,12,.12)" stroke-width="1"/>' +
        '<text x="' + (x0 - 10) + '" y="' + fx(y + 3) + '" text-anchor="end" font-family="Manrope,sans-serif" font-size="9" fill="#8b877d">' + v + '</text>';
    }).join('');

    var targetHtml = '';
    if (targetScore != null) {
      var ty = fx(yFor(targetScore));
      targetHtml = '<rect x="' + x0 + '" y="' + y0 + '" width="' + fx(x1 - x0) + '" height="' + fx(ty - y0) + '" fill="rgba(58,122,58,.08)"/>' +
        '<line x1="' + x0 + '" y1="' + ty + '" x2="' + x1 + '" y2="' + ty + '" stroke="' + PAL.good + '" stroke-width="1" stroke-dasharray="4,3"/>' +
        '<text x="' + (x0 + 4) + '" y="' + fx(ty - 4) + '" font-family="Manrope,sans-serif" font-size="9" fill="' + PAL.good + '">target ' + fx(targetScore, 0) + '</text>';
    }

    var scorePts = scans.map(function (s, i) { return [fx(xFor(i)), fx(yFor(s.score))]; });
    var dateLabels = n === 1
      ? '<text x="' + fx(xFor(0)) + '" y="' + (y1 + 18) + '" text-anchor="middle" font-family="Manrope,sans-serif" font-size="9" fill="#8b877d">' + escSvgText(scans[0].dateLabel || '') + '</text>'
      : [0, n - 1].map(function (i) {
          return '<text x="' + fx(xFor(i)) + '" y="' + (y1 + 18) + '" text-anchor="' + (i === 0 ? 'start' : 'end') + '" font-family="Manrope,sans-serif" font-size="9" fill="#8b877d">' + escSvgText(scans[i].dateLabel || '') + '</text>';
        }).join('');

    var scoreLineHtml, pointsHtml;
    if (n === 1) {
      scoreLineHtml = '';
      pointsHtml = '<circle cx="' + scorePts[0][0] + '" cy="' + scorePts[0][1] + '" r="4.5" fill="' + PAL.gold + '"/>' +
        '<text x="' + scorePts[0][0] + '" y="' + (scorePts[0][1] - 10) + '" text-anchor="middle" font-family="Manrope,sans-serif" font-size="10" font-weight="700" fill="#0B0B0C">' + fx(scans[0].score, 0) + '</text>';
    } else {
      var line = scorePts.map(function (p) { return p[0] + ',' + p[1]; }).join(' ');
      var area = '<polygon points="' + line + ' ' + scorePts[n - 1][0] + ',' + y1 + ' ' + scorePts[0][0] + ',' + y1 + '" fill="rgba(169,129,46,.10)"/>';
      scoreLineHtml = area + '<polyline points="' + line + '" fill="none" stroke="' + PAL.gold + '" stroke-width="2"/>';
      pointsHtml = scorePts.map(function (p, i) {
        var isEnd = i === n - 1;
        return '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="' + (isEnd ? 4.5 : 3) + '" fill="' + (isEnd ? PAL.gold : 'rgba(169,129,46,.55)') + '"/>';
      }).join('') +
        '<text x="' + scorePts[n - 1][0] + '" y="' + (scorePts[n - 1][1] - 10) + '" text-anchor="end" font-family="Manrope,sans-serif" font-size="10" font-weight="700" fill="#0B0B0C">' + fx(scans[n - 1].score, 0) + '</text>';
    }

    var readinessScans = scans.filter(function (s) { return typeof s.readiness === 'number'; });
    var readinessHtml = '';
    if (readinessScans.length > 1) {
      var rPts = scans.map(function (s, i) { return typeof s.readiness === 'number' ? [fx(xFor(i)), fx(yFor(s.readiness))] : null; }).filter(Boolean);
      readinessHtml = '<polyline points="' + rPts.map(function (p) { return p[0] + ',' + p[1]; }).join(' ') + '" fill="none" stroke="' + PAL.warn + '" stroke-width="1.5" stroke-dasharray="3,3"/>';
    }

    var legend = '<rect x="46" y="180" width="12" height="3" fill="' + PAL.gold + '"/><text x="62" y="185" font-family="Manrope,sans-serif" font-size="9" fill="#4b473e">Posture score</text>' +
      (readinessHtml ? '<rect x="180" y="180" width="12" height="3" fill="' + PAL.warn + '"/><text x="196" y="185" font-family="Manrope,sans-serif" font-size="9" fill="#4b473e">Control readiness</text>' : '') +
      (n === 1 ? '<text x="330" y="185" font-family="Manrope,sans-serif" font-size="9" font-style="italic" fill="#8b877d">First scan — trend appears after a second one.</text>' : '');

    return '<svg viewBox="0 0 600 196" width="100%" role="img" aria-label="Posture score trend over ' + n + ' scan' + (n > 1 ? 's' : '') + '">' +
      gridlines + targetHtml +
      '<line x1="' + x0 + '" y1="' + y1 + '" x2="' + x1 + '" y2="' + y1 + '" stroke="#0B0B0C" stroke-width="1"/>' +
      scoreLineHtml + readinessHtml + pointsHtml + dateLabels + legend +
      '</svg>';
  }

  /* 3. Stacked horizontal bars — one 100%-stacked bar per group,
     comparing composition (the MIX of categories) rather than each
     group's absolute size. Generic over what the categories mean —
     the same primitive renders "control status by theme/category"
     (item 3's own example: ISO themes, SOC2 categories, E8
     strategies), a risk severity distribution (one row, Low/Medium/
     High/Critical segments), and an action-throughput-by-month bar
     (Done/Open segments) — every caller supplies its own legendDefs
     rather than the function hardcoding one fixed category set.
     rows: [{ label, values: [n, n, ...] }] — values in the same order
     as legendDefs. legendDefs: [{ label, color, hatch? }]. */
  function stackedBarsChart(rows, legendDefs) {
    rows = Array.isArray(rows) ? rows.filter(function (g) { return (g.values || []).some(function (v) { return v > 0; }); }) : [];
    legendDefs = Array.isArray(legendDefs) ? legendDefs : [];
    if (!rows.length || !legendDefs.length) return placeholderSvg(600, 140, 'Not enough data to compare yet.');

    var labelW = 170, barX = labelW + 10, barW = 600 - barX - 10, rowH = 24, rowGap = 12;
    var top = 34;
    var barsHtml = rows.map(function (g, i) {
      var values = legendDefs.map(function (_, j) { return Math.max(0, Number(g.values[j]) || 0); });
      var total = values.reduce(function (a, b) { return a + b; }, 0);
      var y = top + i * (rowH + rowGap);
      var x = barX;
      var rects = values.map(function (v, j) {
        var w = total ? (v / total) * barW : 0;
        if (w < 0.5) return '';
        var def = legendDefs[j];
        var rect = '<rect x="' + fx(x) + '" y="' + y + '" width="' + fx(Math.max(0, w - 1.5)) + '" height="' + rowH + '" fill="' + (def.hatch ? 'url(#rpt-hatch)' : def.color) + '"/>';
        x += w;
        return rect;
      }).join('');
      return '<text x="' + (labelW) + '" y="' + (y + rowH / 2 + 4) + '" text-anchor="end" font-family="Manrope,sans-serif" font-size="11" fill="#0B0B0C">' + escSvgText(g.label) + '</text>' + rects;
    }).join('');

    var height = top + rows.length * (rowH + rowGap) + 10;
    var legendY = height - 4;
    var legendColW = Math.max(120, Math.floor(580 / legendDefs.length));
    var legend = legendDefs.map(function (def, i) {
      var x = 10 + i * legendColW;
      return '<rect x="' + x + '" y="' + (legendY - 9) + '" width="10" height="10" fill="' + (def.hatch ? 'url(#rpt-hatch)' : def.color) + '"/>' +
        '<text x="' + (x + 15) + '" y="' + legendY + '" font-family="Manrope,sans-serif" font-size="9.5" fill="#4b473e">' + escSvgText(def.label) + '</text>';
    }).join('');

    return '<svg viewBox="0 0 600 ' + fx(height + 24, 0) + '" width="100%" role="img" aria-label="Composition by group, ' + rows.length + ' group(s)">' + HATCH_DEFS +
      barsHtml + legend +
      '</svg>';
  }

  /* 4. Residual-risk heatmap — residuals: [{L,I}, ...] (already-computed
     residual likelihood/impact pairs; caller filters to open risks).
     Fixed 5x5 grid, severity by L*I (same band() thresholds as
     lib.js/app.js — duplicated here since report.js stays independent
     of them), fill strength shows count within a cell, not a single
     hue whose only signal is density — same convention the live
     Dashboard heatmap already uses, print-safe RAG colors (PAL). */
  function bandLocal(score) { return score >= 15 ? 'Critical' : score >= 10 ? 'High' : score >= 5 ? 'Medium' : 'Low'; }
  function riskHeatmapChart(residuals) {
    residuals = Array.isArray(residuals) ? residuals : [];
    if (!residuals.length) return placeholderSvg(420, 260, 'No open risks recorded yet.');

    var counts = {};
    residuals.forEach(function (r) {
      var L = Math.max(1, Math.min(5, Math.round(Number(r.L) || 1)));
      var I = Math.max(1, Math.min(5, Math.round(Number(r.I) || 1)));
      var k = L + '-' + I;
      counts[k] = (counts[k] || 0) + 1;
    });
    var SEV_HEX = { Low: PAL.good, Medium: PAL.warn, High: PAL.high, Critical: PAL.bad };
    var cell = 44, gridX = 50, gridY = 20;
    var cells = '';
    for (var Ii = 5; Ii >= 1; Ii--) {
      var row = 5 - Ii;
      cells += '<text x="' + (gridX - 10) + '" y="' + (gridY + row * cell + cell / 2 + 4) + '" text-anchor="end" font-family="Manrope,sans-serif" font-size="10" fill="#8b877d">I' + Ii + '</text>';
      for (var L = 1; L <= 5; L++) {
        var n = counts[L + '-' + Ii] || 0;
        var sev = bandLocal(L * Ii);
        var alpha = n === 0 ? 0.08 : n === 1 ? 0.35 : n === 2 ? 0.6 : 0.85;
        var x = gridX + (L - 1) * cell, y = gridY + row * cell;
        var textColor = alpha > 0.55 ? '#FAF7F1' : '#0B0B0C';
        cells += '<rect x="' + x + '" y="' + y + '" width="' + (cell - 2) + '" height="' + (cell - 2) + '" fill="rgba(' + hexToRgb(SEV_HEX[sev]) + ',' + alpha + ')"/>' +
          (n ? '<text x="' + (x + (cell - 2) / 2) + '" y="' + (y + (cell - 2) / 2 + 4) + '" text-anchor="middle" font-family="Manrope,sans-serif" font-size="12" font-weight="700" fill="' + textColor + '">' + n + '</text>' : '');
      }
    }
    var colLabels = [1, 2, 3, 4, 5].map(function (L) {
      return '<text x="' + (gridX + (L - 1) * cell + (cell - 2) / 2) + '" y="' + (gridY + 5 * cell + 14) + '" text-anchor="middle" font-family="Manrope,sans-serif" font-size="10" fill="#8b877d">L' + L + '</text>';
    }).join('');
    var legendY = gridY + 5 * cell + 34;
    var legend = ['Low', 'Medium', 'High', 'Critical'].map(function (sev, i) {
      var x = gridX + i * 90;
      return '<rect x="' + x + '" y="' + (legendY - 9) + '" width="10" height="10" fill="rgba(' + hexToRgb(SEV_HEX[sev]) + ',.75)"/>' +
        '<text x="' + (x + 15) + '" y="' + legendY + '" font-family="Manrope,sans-serif" font-size="9.5" fill="#4b473e">' + sev + '</text>';
    }).join('');

    return '<svg viewBox="0 0 400 ' + (legendY + 14) + '" width="100%" role="img" aria-label="Residual risk heatmap, likelihood by impact, ' + residuals.length + ' open risk(s)">' +
      cells + colLabels + legend +
      '</svg>';
  }

  /* 5. Evidence-coverage gauge — how much of "Implemented" is backed by
     a linked evidence document, split auto-captured (a scan wrote it)
     vs manual (a practitioner pasted a link). */
  function evidenceGaugeChart(data) {
    var autoCaptured = Math.max(0, Math.round(Number(data && data.autoCaptured) || 0));
    var manual = Math.max(0, Math.round(Number(data && data.manual) || 0));
    var total = Math.max(0, Math.round(Number(data && data.total) || 0));
    if (!total) return placeholderSvg(560, 90, 'No implemented controls yet — evidence coverage isn’t measurable.');

    var covered = autoCaptured + manual;
    var pct = Math.round(covered / total * 100);
    var trackX = 0, trackY = 30, trackW = 560, trackH = 22;
    var autoW = (autoCaptured / total) * trackW;
    var manualW = (manual / total) * trackW;
    return '<svg viewBox="0 0 560 90" width="100%" role="img" aria-label="Evidence coverage: ' + pct + '% of implemented controls have linked evidence">' +
      '<text x="0" y="16" font-family="Fraunces,serif" font-size="16" font-weight="500" fill="#0B0B0C">' + pct + '% evidence-backed</text>' +
      '<rect x="' + trackX + '" y="' + trackY + '" width="' + trackW + '" height="' + trackH + '" rx="4" fill="' + PAL.muted + '"/>' +
      (autoW > 0.5 ? '<rect x="' + trackX + '" y="' + trackY + '" width="' + fx(autoW) + '" height="' + trackH + '" rx="4" fill="' + PAL.gold + '"/>' : '') +
      (manualW > 0.5 ? '<rect x="' + fx(trackX + autoW) + '" y="' + trackY + '" width="' + fx(manualW) + '" height="' + trackH + '" fill="' + PAL.neutral + '"/>' : '') +
      '<rect x="' + trackX + '" y="' + trackY + '" width="' + trackW + '" height="' + trackH + '" rx="4" fill="none" stroke="rgba(11,11,12,.15)"/>' +
      '<rect x="0" y="66" width="10" height="10" fill="' + PAL.gold + '"/><text x="15" y="75" font-family="Manrope,sans-serif" font-size="9.5" fill="#4b473e">Auto-captured (' + autoCaptured + ')</text>' +
      '<rect x="180" y="66" width="10" height="10" fill="' + PAL.neutral + '"/><text x="195" y="75" font-family="Manrope,sans-serif" font-size="9.5" fill="#4b473e">Manual (' + manual + ')</text>' +
      '<rect x="330" y="66" width="10" height="10" fill="' + PAL.muted + '"/><text x="345" y="75" font-family="Manrope,sans-serif" font-size="9.5" fill="#4b473e">No evidence (' + (total - covered) + ')</text>' +
      '</svg>';
  }

  /* 6. KPI strip — big-number tiles, same information the .rpt-stats
     HTML block has always shown, rendered as one of the six chart
     functions per this feature's spec. items: [{ value, label,
     trend: 'up'|'down'|null, trendGood: boolean }]. `value` is
     pre-formatted by the caller (e.g. "82%", "82/100") and escaped as
     text, never treated as markup. */
  function kpiStripChart(items) {
    items = Array.isArray(items) ? items : [];
    if (!items.length) return placeholderSvg(600, 90, 'No KPIs available yet.');
    var w = 600, h = 90, tileW = w / items.length;
    var tiles = items.map(function (it, i) {
      var x = i * tileW;
      var arrowColor = it.trend ? (it.trendGood ? PAL.good : PAL.bad) : null;
      var arrow = it.trend === 'up' ? '▲' : it.trend === 'down' ? '▼' : '';
      return (i > 0 ? '<line x1="' + x + '" y1="10" x2="' + x + '" y2="' + (h - 10) + '" stroke="rgba(11,11,12,.15)"/>' : '') +
        '<text x="' + (x + tileW / 2) + '" y="42" text-anchor="middle" font-family="Fraunces,serif" font-size="26" font-weight="500" fill="' + PAL.gold + '">' + escSvgText(it.value) +
        (arrow ? '<tspan dx="4" font-family="Manrope,sans-serif" font-size="15" fill="' + arrowColor + '">' + arrow + '</tspan>' : '') + '</text>' +
        '<text x="' + (x + tileW / 2) + '" y="62" text-anchor="middle" font-family="Manrope,sans-serif" font-size="9" letter-spacing=".5" fill="#8b877d">' + escSvgText((it.label || '').toUpperCase()) + '</text>';
    }).join('');
    return '<svg viewBox="0 0 ' + w + ' ' + h + '" width="100%" role="img" aria-label="' + escSvgText('Key metrics: ' + items.map(function (it) { return it.label + ' ' + it.value; }).join(', ')) + '">' +
      '<line x1="0" y1="8" x2="' + w + '" y2="8" stroke="rgba(11,11,12,.2)"/><line x1="0" y1="' + (h - 8) + '" x2="' + w + '" y2="' + (h - 8) + '" stroke="rgba(11,11,12,.2)"/>' +
      tiles +
      '</svg>';
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

  /* The visual dashboard page — sits right after the cover/document
     control/TOC, before the report's own content sections, same
     position the old KPI-only dashboard always occupied. spec.dashboard
     .charts is an ordered array of { svg, title, figure, caption } —
     each already-built by one of the six chart functions above and
     composed per report type in app.js's REPORT_BUILDERS (see that
     file for which report type gets which charts). */
  function dashboardSection(spec, id) {
    if (!spec.dashboard) return '';
    var charts = (spec.dashboard.charts || []).map(function (c) { return chartCard(c.figure, c.title, c.caption, c.svg); }).join('');
    return '<div class="rpt-page" id="' + id + '"><h2>Executive dashboard</h2><div class="rpt-rule"></div>' +
      (spec.dashboard.intro ? '<p class="rpt-intro">' + spec.dashboard.intro + '</p>' : '') +
      charts + '</div>';
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
      '.rpt-chart-card{margin-top:24px}.rpt-chart-card:first-child{margin-top:0}' +
      '.rpt-chart-title{font-size:13px;margin:0 0 10px}' +
      '.rpt-chart-caption{font-size:11px;color:#6b675e;font-style:italic;margin:8px 0 0;max-width:70ch}' +
      '.rpt-chart-card svg{max-width:100%;height:auto;display:block}' +
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
      'tr,.rpt-stats div,.rpt-cover-meta tr,.rpt-chart-card{break-inside:avoid;page-break-inside:avoid}' +
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

  window.ReportEngine = {
    buildReport: buildReport,
    charts: {
      donut: donutChart,
      trend: trendChart,
      stackedBars: stackedBarsChart,
      riskHeatmap: riskHeatmapChart,
      evidenceGauge: evidenceGaugeChart,
      kpiStrip: kpiStripChart
    },
    /* Exposed so app.js's REPORT_BUILDERS can build stackedBars()
       legendDefs (severity distribution, action throughput, ...) using
       the exact same validated print-safe colors the charts above
       already use internally — one palette, never redefined twice. */
    palette: PAL
  };
})();
