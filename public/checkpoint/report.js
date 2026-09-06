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
       client: { name: string, logoUrl: string|null, brandColor: string|null },
       classification: string,          // e.g. "Commercial in Confidence"
       footerText: string|'',           // optional printed-footer line; '' -> classification
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

  /* The same seven roles, re-tuned for the app's near-black ground.
     PAL above is a PRINT palette: every hue in it was chosen to sit on
     white paper. Several of these charts are also rendered live in the
     app (anything called with {palette:'app'}), and there the print
     values are wrong in two separate ways.

     Wrong on contrast: measured with lib.js's own contrastRatio()
     against a card (#17161B), PAL.bad lands at 2.23:1 and PAL.good at
     3.45:1 — under WCAG 1.4.11's 3:1 floor for a graphic that carries
     meaning. The values below are 7.3:1 and 8.6:1.

     Wrong on prominence, which is the more visible bug: PAL.muted
     ("Not applicable", the category meant to recede furthest) is a
     near-white #D9D4C8. On paper that recedes; on a dark card it
     measures 12.2:1 — brighter than every real status hue on the same
     bar, so the one segment nobody needs to read was the one the eye
     went to first. The screen values restore the intended order —
     in progress 9.6 > implemented 8.6 > not started 6.0 > not
     applicable 2.5 — with "not applicable" still 2.1:1 clear of the
     empty track behind it so it stays visible as a segment.

     GOOD/WARN/BAD are the app's own --pass/--warn/--critical tokens, so
     a chart and the KPI tile beside it finally name the same state in
     the same colour. NEUTRAL and MUTED remain deliberately low-chroma
     and keep the hatch/label treatment described in the header above —
     they are not trying to pass as categorical hues in either palette. */
  var PAL_APP = {
    good: '#8fbf9a',
    warn: '#D8BA78',
    high: '#dda07a',
    bad: '#e0908f',
    neutral: '#9a958c',
    muted: '#5b5666',
    gold: '#D8BA78'
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

  /* Each chart gets its OWN uniquely-id'd hatch pattern rather than a
     shared "rpt-hatch" — the live app can have several of these charts'
     SVGs sitting in the DOM at once (one per register view, all built
     at boot by renderAll(), long before the practitioner navigates to
     look at any of them). Two-plus <pattern id="rpt-hatch"> elements in
     one document is invalid HTML/SVG (ids must be document-unique), and
     in practice it silently breaks the hatch fill on every chart but
     one — url(#rpt-hatch) resolves to a single element document-wide,
     and only that element's pattern actually paints; every other
     "hatched" segment renders fully transparent instead, indistinguishable
     from a rendering bug. A per-call counter sidesteps the collision
     entirely. */
  var hatchIdSeq = 0;
  /* `app` picks the screen palette. The pattern is built the same way
     in both: a recessive ground with the neutral drawn across it, so
     "not started" stays a TEXTURE — distinguishable from the plain
     "not applicable" fill without relying on hue — whichever palette
     is in play. Getting this wrong is very visible: with the print
     values on a dark card the hatch's near-white ground made "not
     started" the single brightest band on a bar whose other segments
     were the real answer. */
  function hatchDefs(app) {
    var id = 'rpt-hatch-' + (++hatchIdSeq);
    var P = app ? PAL_APP : PAL;
    return {
      id: id,
      html: '<defs><pattern id="' + id + '" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">' +
        '<rect width="6" height="6" fill="' + P.muted + '"/><line x1="0" y1="0" x2="0" y2="6" stroke="' + P.neutral + '" stroke-width="1.5"/>' +
        '</pattern></defs>'
    };
  }

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
    var hatch = hatchDefs();
    var hatchFill = 'url(#' + hatch.id + ')';
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
      var circle = '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" stroke="' + (seg[3] ? hatchFill : seg[2]) + '" stroke-width="' + sw + '" stroke-dasharray="' + dash + '" stroke-dashoffset="' + fx(-offset) + '" transform="rotate(-90 ' + cx + ' ' + cy + ')"/>';
      offset += len;
      return circle;
    }).join('');
    var legend = segments.map(function (seg, i) {
      var y = 40 + i * 24;
      var segPct = total ? Math.round(seg[1] / total * 100) : 0;
      return '<rect x="220" y="' + (y - 10) + '" width="12" height="12" fill="' + (seg[3] ? hatchFill : seg[2]) + '"/>' +
        '<text x="238" y="' + y + '" font-family="Manrope,sans-serif" font-size="11" fill="#0B0B0C">' + escSvgText(seg[0]) + '</text>' +
        '<text x="440" y="' + y + '" text-anchor="end" font-family="Manrope,sans-serif" font-size="11" font-weight="700" fill="#4b473e">' + seg[1] + ' (' + segPct + '%)</text>';
    }).join('');
    return '<svg viewBox="0 0 460 200" width="100%" role="img" aria-label="Readiness donut: ' + pct + '% of applicable controls implemented">' + hatch.html +
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
  function trendChart(scans, targetScore, opts) {
    opts = opts || {};
    /* Same text-only dark-palette override as stackedBarsChart above —
       the score-value labels, baseline axis and legend text were
       hardcoded to near-black print colors, invisible on Boardroom
       Mode's ink background (app.js's boardroomSlideTrend()). */
    var valueColor = opts.palette === 'app' ? 'var(--paper)' : '#0B0B0C';
    var baselineColor = opts.palette === 'app' ? 'var(--line)' : '#0B0B0C';
    var legendColor = opts.palette === 'app' ? 'var(--paper-dim)' : '#4b473e';
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
        '<text x="' + scorePts[0][0] + '" y="' + (scorePts[0][1] - 10) + '" text-anchor="middle" font-family="Manrope,sans-serif" font-size="10" font-weight="700" fill="' + valueColor + '">' + fx(scans[0].score, 0) + '</text>';
    } else {
      var line = scorePts.map(function (p) { return p[0] + ',' + p[1]; }).join(' ');
      var area = '<polygon points="' + line + ' ' + scorePts[n - 1][0] + ',' + y1 + ' ' + scorePts[0][0] + ',' + y1 + '" fill="rgba(169,129,46,.10)"/>';
      scoreLineHtml = area + '<polyline points="' + line + '" fill="none" stroke="' + PAL.gold + '" stroke-width="2"/>';
      pointsHtml = scorePts.map(function (p, i) {
        var isEnd = i === n - 1;
        return '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="' + (isEnd ? 4.5 : 3) + '" fill="' + (isEnd ? PAL.gold : 'rgba(169,129,46,.55)') + '"/>';
      }).join('') +
        '<text x="' + scorePts[n - 1][0] + '" y="' + (scorePts[n - 1][1] - 10) + '" text-anchor="end" font-family="Manrope,sans-serif" font-size="10" font-weight="700" fill="' + valueColor + '">' + fx(scans[n - 1].score, 0) + '</text>';
    }

    var readinessScans = scans.filter(function (s) { return typeof s.readiness === 'number'; });
    var readinessHtml = '';
    if (readinessScans.length > 1) {
      var rPts = scans.map(function (s, i) { return typeof s.readiness === 'number' ? [fx(xFor(i)), fx(yFor(s.readiness))] : null; }).filter(Boolean);
      readinessHtml = '<polyline points="' + rPts.map(function (p) { return p[0] + ',' + p[1]; }).join(' ') + '" fill="none" stroke="' + PAL.warn + '" stroke-width="1.5" stroke-dasharray="3,3"/>';
    }

    var legend = '<rect x="46" y="180" width="12" height="3" fill="' + PAL.gold + '"/><text x="62" y="185" font-family="Manrope,sans-serif" font-size="9" fill="' + legendColor + '">Posture score</text>' +
      (readinessHtml ? '<rect x="180" y="180" width="12" height="3" fill="' + PAL.warn + '"/><text x="196" y="185" font-family="Manrope,sans-serif" font-size="9" fill="' + legendColor + '">Control readiness</text>' : '') +
      (n === 1 ? '<text x="330" y="185" font-family="Manrope,sans-serif" font-size="9" font-style="italic" fill="#8b877d">First scan — trend appears after a second one.</text>' : '');

    return '<svg viewBox="0 0 600 196" width="100%" role="img" aria-label="Posture score trend over ' + n + ' scan' + (n > 1 ? 's' : '') + '">' +
      gridlines + targetHtml +
      '<line x1="' + x0 + '" y1="' + y1 + '" x2="' + x1 + '" y2="' + y1 + '" stroke="' + baselineColor + '" stroke-width="1"/>' +
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
  function stackedBarsChart(rows, legendDefs, opts) {
    opts = opts || {};
    /* Text-only dark-palette override — bar segment colors already
       come from the caller's legendDefs (THROUGHPUT_LEGEND,
       CONTROL_STATUS_LEGEND, ...), which are all readable on both a
       light report page and a pure-ink boardroom slide already; only
       the row/legend LABEL text was ever hardcoded to a near-black
       print color, invisible against Boardroom Mode's ink background
       (see app.js's boardroomSlideActions()) until this opts param
       existed. */
    var labelColor = opts.palette === 'app' ? 'var(--paper)' : '#0B0B0C';
    var legendColor = opts.palette === 'app' ? 'var(--paper-dim)' : '#4b473e';
    /* showValues: an itemized count line under each bar ("2 done · 3 in
       progress · 4 open — 9 total") — deliberately NOT numbers overlaid
       on the segments themselves. legendDefs' colors are fixed print-
       safe hex (PAL), not contrast-checked against arbitrary overlaid
       text, and the hatched "Open"-style segment in particular has no
       single readable text color against its own pattern. A separate,
       always-legible line in labelColor sidesteps needing per-segment
       contrast logic entirely, at the cost of one extra line per row —
       worth it for a chart meant to be read at a glance in the live
       app, not just eyeballed as a proportion in a PDF. */
    var showValues = !!opts.showValues;
    /* scaleByCount: bar LENGTH reflects each row's actual total against
       the largest row (magnitude), same idea as hbarsChart, instead of
       every row stretching to the same full width regardless of size
       (composition). Without this, a register where every action shares
       one status renders as several identical full-width bars — visually
       indistinguishable, and easy to mistake for a rendering bug rather
       than "nothing has moved yet". With it, at least the row's size is
       legible even when its own composition is monochrome. Zero-total
       rows are kept rather than dropped — a real "none at this priority"
       is informative, not noise (see hbarsChart's own reasoning). */
    var scaleByCount = !!opts.scaleByCount;
    var trackColor = opts.palette === 'app' ? 'rgba(var(--paper-rgb),.07)' : 'rgba(11,11,12,.06)';
    rows = Array.isArray(rows) ? (scaleByCount ? rows.slice() : rows.filter(function (g) { return (g.values || []).some(function (v) { return v > 0; }); })) : [];
    legendDefs = Array.isArray(legendDefs) ? legendDefs : [];
    if (!rows.length || !legendDefs.length) return placeholderSvg(600, 140, 'Not enough data to compare yet.');

    var labelW = 170, barX = labelW + 10, barW = 600 - barX - 10, rowH = 24, rowGap = showValues ? 26 : 12;
    var top = 34;
    /* Clamp each row's values to legendDefs' own length ONCE, up front —
       used for both maxTotal (scaleByCount's scale reference) and the
       actual rendering below. A row whose values array happened to be
       longer than legendDefs (extra, unmapped entries) must not inflate
       maxTotal beyond what the bars themselves ever draw, or every row
       silently under-scales relative to what's actually on screen. */
    var rowValues = rows.map(function (g) { return legendDefs.map(function (_, j) { return Math.max(0, Number(g.values[j]) || 0); }); });
    var rowTotals = rowValues.map(function (values) { return values.reduce(function (a, b) { return a + b; }, 0); });
    var maxTotal = Math.max.apply(null, rowTotals.concat([0]));
    var hatch = hatchDefs(opts && opts.palette === 'app');
    var hatchFill = 'url(#' + hatch.id + ')';
    var barsHtml = rows.map(function (g, i) {
      var values = rowValues[i];
      var total = rowTotals[i];
      var rowWidth = scaleByCount ? (maxTotal ? (total / maxTotal) * barW : 0) : barW;
      var y = top + i * (rowH + rowGap);
      var x = barX;
      /* Same labelColor opt-in tints the track too — a row that's
         entirely one status (every Critical action still "Open", say)
         would otherwise render as a flat neutral bar indistinguishable
         from every other all-Open row regardless of priority, losing
         the one signal a reader actually wants at a glance. Kept to a
         faint wash (12%), not a solid fill, so the status segments
         drawn on top stay the dominant, legible signal. */
      var rowTrackColor = g.labelColor ? 'rgba(' + hexToRgb(g.labelColor) + ',.12)' : trackColor;
      var track = scaleByCount ? '<rect x="' + fx(barX) + '" y="' + y + '" width="' + fx(barW) + '" height="' + rowH + '" rx="2" fill="' + rowTrackColor + '"/>' : '';
      /* A row that's ENTIRELY one status (every action still "Open", every
         control still "Not started" — the normal state for a brand-new
         register) has nothing to distinguish the hatch texture FROM: the
         diagonal stripe exists to tell adjacent segments apart, not to
         decorate a lone one. Filled edge-to-edge, it reads as an
         unstyled/loading placeholder rather than a deliberate value — see
         the live report of exactly that reaction. Solid color once a row
         has only one non-zero segment keeps the hatch meaningful for the
         mixed-status rows where it's actually doing work. */
      var soloSegment = values.filter(function (v) { return v > 0; }).length === 1;
      /* labelColor tokens are shared with SEVERITY_LEGEND, which reuses
         the very same "good"/"warn" colours ACTION_STATUS_LEGEND already
         uses for Done/In-progress (Low's severity green === Done's
         status green, Medium's amber === In-progress's amber) — so
         swapping labelColor onto the neutral segment below is only safe
         when it can't be mistaken for one of THIS chart's own other
         segment colours. Checked once per row, not assumed from the
         legend's shape, since a future caller's legendDefs could collide
         differently. */
      var labelColorCollides = g.labelColor && legendDefs.some(function (def) { return !def.hatch && def.color.toLowerCase() === g.labelColor.toLowerCase(); });
      var rects = track + values.map(function (v, j) {
        var w = total ? (v / total) * rowWidth : 0;
        if (w < 0.5) return '';
        var def = legendDefs[j];
        /* A row that's entirely the neutral/hatch-flagged status (every
           Critical action still "Open", say) is the common real case,
           not an edge case — and status-neutral-grey is the ONE thing
           worth overriding with the row's own labelColor here: Done and
           In-progress segments already carry real, non-neutral colour
           (green/amber) that would be actively misleading to replace
           with a severity tint (a fully-Done Critical row must not
           render red), so this only ever swaps in labelColor for the
           "nothing has happened yet" segment — exactly where knowing
           the priority is more useful than re-stating "still open".
           Skipped entirely when labelColorCollides, per the note above. */
        var fill = (soloSegment && def.hatch && g.labelColor && !labelColorCollides) ? g.labelColor : (def.hatch && !soloSegment ? hatchFill : def.color);
        var rect = '<rect x="' + fx(x) + '" y="' + y + '" width="' + fx(Math.max(0, w - 1.5)) + '" height="' + rowH + '" fill="' + fill + '"/>';
        x += w;
        return rect;
      }).join('');
      var valuesLine = '';
      if (showValues) {
        var parts = legendDefs.map(function (def, j) { return values[j] > 0 ? values[j] + ' ' + def.label.toLowerCase() : ''; }).filter(Boolean);
        var summary = (parts.length ? parts.join(' · ') : 'none yet') + ' — ' + total + ' total';
        valuesLine = '<text x="' + barX + '" y="' + (y + rowH + 12) + '" font-family="Manrope,sans-serif" font-size="10" fill="' + legendColor + '">' + escSvgText(summary) + '</text>';
      }
      /* Per-row label colour is opt-in (g.labelColor) — every existing
         caller (control-status-by-theme, risk severity, action
         throughput-by-month) leaves it unset and keeps the exact same
         output as before (including no font-weight, to match pinned
         snapshot tests byte-for-byte); only actionPriorityBreakdown()
         supplies one, to distinguish Critical/High/Medium/Low rows from
         each other without touching the segment colours, which already
         carry a DIFFERENT signal (done/in-progress/open) this chart
         exists to show. */
      var labelWeight = g.labelColor ? ' font-weight="700"' : '';
      return '<text x="' + (labelW) + '" y="' + (y + rowH / 2 + 4) + '" text-anchor="end" font-family="Manrope,sans-serif" font-size="11"' + labelWeight + ' fill="' + (g.labelColor || labelColor) + '">' + escSvgText(g.label) + '</text>' + rects + valuesLine;
    }).join('');

    var height = top + rows.length * (rowH + rowGap) + 10;
    var legendY = height - 4;
    var legendColW = Math.max(120, Math.floor(580 / legendDefs.length));
    var legend = legendDefs.map(function (def, i) {
      var x = 10 + i * legendColW;
      return '<rect x="' + x + '" y="' + (legendY - 9) + '" width="10" height="10" fill="' + (def.hatch ? hatchFill : def.color) + '"/>' +
        '<text x="' + (x + 15) + '" y="' + legendY + '" font-family="Manrope,sans-serif" font-size="9.5" fill="' + legendColor + '">' + escSvgText(def.label) + '</text>';
    }).join('');

    return '<svg viewBox="0 0 600 ' + fx(height + 24, 0) + '" width="100%" role="img" aria-label="Composition by group, ' + rows.length + ' group(s)">' + hatch.html +
      barsHtml + legend +
      '</svg>';
  }

  /* 3b. Count-scaled horizontal bars — deliberately NOT stackedBars.
     That one normalises every row to 100% to compare COMPOSITION, which
     makes it structurally incapable of showing anything when every row
     sits in a single category (an actions register where nothing has
     been started yet renders as N identical full-width bars — no
     signal at all). This compares MAGNITUDE instead: bar length is the
     count itself, scaled against the largest row, so the shape of the
     distribution is the message.

     rows: [{ label, value, color?, sub? }] — color defaults to the
     brand accent; `sub` is an optional dim caption under the label.
     Rows with value 0 are kept, not filtered, because "zero here" is
     usually the interesting part of a distribution (nothing overdue
     30+ days is a real, readable result — dropping the row would
     silently rewrite the axis). */
  function hbarsChart(rows, opts) {
    opts = opts || {};
    var app = opts.palette === 'app';
    var labelColor = app ? 'var(--paper)' : '#0B0B0C';
    var dimColor = app ? 'var(--paper-dim)' : '#4b473e';
    var trackColor = app ? 'rgba(var(--paper-rgb),.07)' : 'rgba(11,11,12,.06)';
    rows = Array.isArray(rows) ? rows : [];
    if (!rows.length) return placeholderSvg(600, 120, 'Nothing to chart yet.');

    var values = rows.map(function (r) { return Math.max(0, Number(r.value) || 0); });
    var max = Math.max.apply(null, values.concat([0]));
    var labelW = 150, barX = labelW + 12, barW = 600 - barX - 46, rowH = 20, rowGap = rows.some(function (r) { return r.sub; }) ? 22 : 14;
    var top = 12;

    var barsHtml = rows.map(function (r, i) {
      var v = values[i];
      /* A zero row still draws its track, so the row reads as a real
         "none" rather than looking like a rendering failure. */
      var w = max > 0 ? (v / max) * barW : 0;
      var y = top + i * (rowH + rowGap);
      var mid = y + rowH / 2 + 4;
      return '<text x="' + labelW + '" y="' + mid + '" text-anchor="end" font-family="Manrope,sans-serif" font-size="11" fill="' + labelColor + '">' + escSvgText(r.label) + '</text>' +
        (r.sub ? '<text x="' + labelW + '" y="' + (mid + 12) + '" text-anchor="end" font-family="Manrope,sans-serif" font-size="9" fill="' + dimColor + '">' + escSvgText(r.sub) + '</text>' : '') +
        '<rect x="' + barX + '" y="' + y + '" width="' + fx(barW) + '" height="' + rowH + '" rx="2" fill="' + trackColor + '"/>' +
        (w > 0.5 ? '<rect x="' + barX + '" y="' + y + '" width="' + fx(w) + '" height="' + rowH + '" rx="2" fill="' + (r.color || PAL.gold) + '"/>' : '') +
        '<text x="' + (barX + barW + 8) + '" y="' + mid + '" font-family="Manrope,sans-serif" font-size="11" font-weight="700" fill="' + (v > 0 ? labelColor : dimColor) + '">' + fx(v, 0) + '</text>';
    }).join('');

    var height = top + rows.length * (rowH + rowGap) + 4;
    return '<svg viewBox="0 0 600 ' + fx(height, 0) + '" width="100%" role="img" aria-label="' + escSvgText(rows.map(function (r, i) { return r.label + ': ' + values[i]; }).join(', ')) + '">' +
      barsHtml +
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

  /* 7. Compliance fingerprint — concentric ring gauge, one ring per
     "theme" (a control theme on the live Dashboard, or any other
     grouping — the caller decides what a "ring" means; this function
     only draws whatever rings it's given).
     Same function renders three ways from one opts object:
       - the live Dashboard's full interactive fingerprint (palette:
         'app', interactive:true — each ring gets a data-tip + focus
         target for app.js's shared tooltip helper, and the centre
         number carries data-count for the existing countUp() animation)
       - a report cover's static print-palette fingerprint (defaults —
         palette omitted/'print', interactive:false)
       - a 60px-compact per-item glyph (compact: true — rings only, no
         centre number, an optional native <title> for a zero-JS hover
         instead of the interactive tooltip, since a table of these
         needs no per-row JS wiring).
     Ring color bands by completion (>=90% good, >=50% warn, else
     neutral) — never a categorical hue, since a ring's identity is
     already carried by its position + label, exactly per the dataviz
     skill's "color follows the entity, never a repurposed status
     scale" guidance applied to a completion metric instead of a state
     enum. The evidence ring (if data.evidencePct is given) is always
     drawn in the single accent gold, never band-colored, so it reads
     as a distinct kind of ring rather than one more theme. */
  function fingerprintSvg(data, opts) {
    opts = opts || {};
    var interactive = !!opts.interactive;
    var compact = !!opts.compact;
    var dark = opts.palette === 'app';
    /* The dark/'app' branch emits CSS var() references, not hex — this
       SVG is always inserted straight into the live app's DOM (never
       serialized standalone), so the browser resolves these against
       :root/[data-theme="light"] at paint time. The chart therefore
       re-themes itself automatically the instant data-theme flips, with
       no re-render needed — same reasoning for every other chart
       function's dark branch below. The print branch (PAL) stays
       literal hex on purpose: a generated report is a standalone
       document with its own frozen palette, never the live app's CSS. */
    var P = dark
      ? { good: 'var(--pass)', warn: 'var(--warn)', neutral: 'var(--paper-faint)', track: 'var(--line)', gold: 'var(--gold)', text: 'var(--paper)', textDim: 'var(--paper-dim)' }
      : { good: PAL.good, warn: PAL.warn, neutral: PAL.neutral, track: PAL.muted, gold: PAL.gold, text: '#0B0B0C', textDim: '#8b877d' };

    var rings = Array.isArray(data && data.rings) ? data.rings : [];
    var evidencePct = data && typeof data.evidencePct === 'number' ? data.evidencePct : null;
    var centerPct = data && typeof data.centerPct === 'number' ? data.centerPct : 0;
    var size = compact ? 60 : 200;
    if (!rings.length) return placeholderSvg(size, size, 'No applicable controls yet.');

    var cx = 100, cy = 100, outerR = 92, innerFloor = compact ? 46 : 30;
    var slots = rings.length + (evidencePct != null ? 1 : 0);
    var pitch = Math.min(11, (outerR - innerFloor) / Math.max(1, slots));
    var ringWidth = Math.max(3, pitch * 0.68);
    function bandColor(pct) { return pct >= 90 ? P.good : pct >= 50 ? P.warn : P.neutral; }

    var ringsHtml = rings.map(function (ring, i) {
      var r = outerR - i * pitch - pitch / 2;
      var circumference = 2 * Math.PI * r;
      var arcLen = Math.max(0, Math.min(100, ring.pct)) / 100 * circumference;
      var tip = escSvgText(ring.label + ' — ' + fx(ring.pct, 0) + '% (' + fx(ring.implemented, 0) + ' of ' + fx(ring.total, 0) + ' implemented)');
      var tipAttr = interactive ? ' tabindex="0" role="img" aria-label="' + tip + '" data-tip="' + tip + '"' : (compact ? '' : '');
      return '<g' + tipAttr + '>' +
        '<circle cx="' + cx + '" cy="' + cy + '" r="' + fx(r) + '" fill="none" stroke="' + P.track + '" stroke-width="' + fx(ringWidth) + '"/>' +
        (arcLen > 0.3 ? '<circle cx="' + cx + '" cy="' + cy + '" r="' + fx(r) + '" fill="none" stroke="' + bandColor(ring.pct) + '" stroke-width="' + fx(ringWidth) + '" stroke-linecap="round" stroke-dasharray="' + fx(arcLen) + ',' + fx(circumference - arcLen) + '" transform="rotate(-90 ' + cx + ' ' + cy + ')"/>' : '') +
        '</g>';
    }).join('');

    var evidenceHtml = '';
    if (evidencePct != null) {
      var er = outerR - rings.length * pitch - pitch / 2;
      var ec = 2 * Math.PI * er;
      var earc = Math.max(0, Math.min(100, evidencePct)) / 100 * ec;
      var etip = escSvgText('Evidence attached — ' + fx(evidencePct, 0) + '% of applicable controls');
      var etipAttr = interactive ? ' tabindex="0" role="img" aria-label="' + etip + '" data-tip="' + etip + '"' : '';
      evidenceHtml = '<g' + etipAttr + '>' +
        '<circle cx="' + cx + '" cy="' + cy + '" r="' + fx(er) + '" fill="none" stroke="' + P.track + '" stroke-width="' + fx(ringWidth * 0.8) + '" stroke-dasharray="1.5,3"/>' +
        (earc > 0.3 ? '<circle cx="' + cx + '" cy="' + cy + '" r="' + fx(er) + '" fill="none" stroke="' + P.gold + '" stroke-width="' + fx(ringWidth * 0.8) + '" stroke-linecap="round" stroke-dasharray="' + fx(earc) + ',' + fx(ec - earc) + '" transform="rotate(-90 ' + cx + ' ' + cy + ')"/>' : '') +
        '</g>';
    }

    /* The headline number is sized from the hole the rings actually
       leave, not a fixed 30. The hole grows and shrinks with the number
       of themes (more rings, tighter pitch), so a constant font-size
       made the figure look lost inside a wide ring stack — the single
       most-read number on the dashboard, drawn smaller than the axis
       labels around it. Width is checked against the digit count too,
       so a three-digit 100 still fits where a two-digit 45 sits. */
    var innerR = outerR - (slots - 1) * pitch - pitch / 2;
    var holeR = Math.max(12, innerR - ringWidth / 2);
    var centerDigits = String(fx(centerPct, 0)).length;
    /* 0.62 of the hole's height, or whatever the width allows at ~0.6em
       per digit — whichever is smaller. */
    var numSize = Math.min(46, holeR * 2 * 0.62, (holeR * 2 * 0.86) / (centerDigits * 0.6));
    var capHalf = numSize * 0.36;
    var centerHtml = compact ? '' :
      '<text x="' + cx + '" y="' + fx(cy + capHalf - 3) + '" text-anchor="middle" font-family="Fraunces,serif" font-size="' + fx(numSize) + '" font-weight="500" fill="' + P.text + '"' + (interactive ? ' class="rpt-fp-num" data-count="' + fx(centerPct, 0) + '"' : '') + '>' + fx(centerPct, 0) + '</text>' +
      '<text x="' + cx + '" y="' + fx(cy + capHalf + 12) + '" text-anchor="middle" font-family="Manrope,sans-serif" font-size="9" letter-spacing="1" fill="' + P.textDim + '">READINESS</text>';

    var ariaLabel = escSvgText('Compliance fingerprint: ' + fx(centerPct, 0) + '% overall readiness across ' + rings.length + ' theme(s)' + (evidencePct != null ? ', ' + fx(evidencePct, 0) + '% evidence coverage' : ''));
    var titleHtml = (!interactive && opts.title) ? '<title>' + escSvgText(opts.title) + '</title>' : '';
    return '<svg viewBox="0 0 200 200" width="100%" role="img" aria-label="' + ariaLabel + '">' + titleHtml + ringsHtml + evidenceHtml + centerHtml + '</svg>';
  }

  /* 8. Audit-ready projection drift — plots "weeks to audit-ready, as
     projected at the time of each scan" across a tenant's scan
     history, so a management review can see whether the projection is
     trending down (team accelerating) or flat/up (stalling) rather
     than only ever seeing the single latest number. `series`: the
     scan history's own recorded projections, in chronological order —
     [{ dateLabel, status, weeksNeeded }] (see app.js's
     remediationVelocityProjection() call site) — points whose status
     isn't 'projected' (insufficient history, or already complete) are
     skipped rather than plotted as a fabricated value. */
  function projectionDriftChart(series) {
    series = Array.isArray(series) ? series : [];
    var pts = series.filter(function (s) { return s && s.status === 'projected' && typeof s.weeksNeeded === 'number'; });
    if (pts.length < 2) return placeholderSvg(580, 170, 'Not enough scan history yet to chart projection drift.');

    var n = pts.length;
    var x0 = 46, x1 = 566, y0 = 20, y1 = 140;
    var maxW = Math.max.apply(null, pts.map(function (p) { return p.weeksNeeded; }).concat([12]));
    var yFor = function (w) { return y1 - (Math.min(w, maxW) / maxW) * (y1 - y0); };
    var xFor = function (i) { return n === 1 ? (x0 + x1) / 2 : x0 + (i / (n - 1)) * (x1 - x0); };
    var linePts = pts.map(function (p, i) { return [fx(xFor(i)), fx(yFor(p.weeksNeeded))]; });
    var line = linePts.map(function (p) { return p[0] + ',' + p[1]; }).join(' ');
    var dots = pts.map(function (p, i) {
      var isEnd = i === n - 1;
      return '<circle cx="' + linePts[i][0] + '" cy="' + linePts[i][1] + '" r="' + (isEnd ? 4.5 : 3) + '" fill="' + (isEnd ? PAL.gold : 'rgba(169,129,46,.55)') + '"/>';
    }).join('');
    var dateLabels = [0, n - 1].map(function (i) {
      return '<text x="' + fx(xFor(i)) + '" y="' + (y1 + 16) + '" text-anchor="' + (i === 0 ? 'start' : 'end') + '" font-family="Manrope,sans-serif" font-size="9" fill="#8b877d">' + escSvgText(pts[i].dateLabel || '') + '</text>';
    }).join('');
    var lastLabel = '<text x="' + linePts[n - 1][0] + '" y="' + (linePts[n - 1][1] - 10) + '" text-anchor="end" font-family="Manrope,sans-serif" font-size="10" font-weight="700" fill="#0B0B0C">' + fx(pts[n - 1].weeksNeeded, 0) + 'w</text>';
    return '<svg viewBox="0 0 580 170" width="100%" role="img" aria-label="' + escSvgText('Audit-ready projection drift: ' + fx(pts[n - 1].weeksNeeded, 0) + ' weeks projected as of the latest scan') + '">' +
      '<line x1="' + x0 + '" y1="' + y1 + '" x2="' + x1 + '" y2="' + y1 + '" stroke="rgba(11,11,12,.15)"/>' +
      '<text x="' + x0 + '" y="14" font-family="Manrope,sans-serif" font-size="9" fill="#8b877d">Weeks to audit-ready (at scan-time velocity)</text>' +
      '<polyline points="' + line + '" fill="none" stroke="' + PAL.gold + '" stroke-width="2"/>' + dots + lastLabel + dateLabels +
      '</svg>';
  }

  /* 9. Certification Journey — a horizontal timeline of real milestones
     (never invented placeholder dates): each `milestones` entry is
     { key, label, date: isoDate|null, kind: 'past'|'today'|'future'|
     'projected', pct: number|null, offScale: boolean }. A milestone
     with no date (a fact this tenant simply doesn't have yet — no
     internal audit planned, no gap analysis on record) is skipped
     rather than plotted at a guessed position. The date range is
     derived purely from whichever dated, on-scale milestones are
     present; a 'projected' milestone marked offScale (the audit-ready
     projection clamped at its 10-year ceiling — see
     remediationVelocityProjection() in lib.js) is pinned at the right
     edge with an outward »-marker instead of stretching the whole
     timeline to fit one absurd date, but its real date always stays in
     the label/tooltip — compressed on the axis, never hidden. */
  function journeyTimelineSvg(milestones, opts) {
    opts = opts || {};
    var interactive = !!opts.interactive;
    var dark = opts.palette === 'app';
    var P = dark
      ? { line: 'var(--line)', past: 'var(--paper-faint)', today: 'var(--warn)', future: 'var(--gold)', projected: 'var(--pass)', text: 'var(--paper)', textDim: 'var(--paper-dim)' }
      : { line: 'rgba(11,11,12,.18)', past: '#8b877d', today: PAL.warn, future: PAL.gold, projected: PAL.good, text: '#0B0B0C', textDim: '#8b877d' };

    milestones = Array.isArray(milestones) ? milestones : [];
    var hasValidDate = function (m) { return !!m.date && isFinite(Date.parse(m.date)); };
    var onScale = milestones.filter(function (m) { return hasValidDate(m) && !m.offScale; });
    var offScale = milestones.filter(function (m) { return hasValidDate(m) && m.offScale; });
    if (!onScale.length) return placeholderSvg(640, 140, 'Not enough milestone history yet to chart the certification journey.');

    var x0 = 40, x1 = 580, y = 78;
    var msList = onScale.map(function (m) { return Date.parse(m.date); });
    var minMs = Math.min.apply(null, msList), maxMs = Math.max.apply(null, msList);
    if (minMs === maxMs) { minMs -= 30 * 86400000; maxMs += 30 * 86400000; }
    var xFor = function (ms) { return x0 + Math.max(0, Math.min(1, (ms - minMs) / (maxMs - minMs))) * (x1 - x0); };
    var colorFor = function (kind) { return kind === 'today' ? P.today : kind === 'projected' ? P.projected : kind === 'future' ? P.future : P.past; };

    /* Label placement is collision-aware rather than a fixed
       above/below alternation. Alternating alone is fine when
       milestones are evenly spread and falls apart the moment two
       cluster -- which is the normal case early in an engagement, when
       "Engagement start", "Gap analysis" and "Evidence today" can sit
       within days of each other. The result was the one chart meant to
       answer "when are we certified" being the least readable thing on
       the page.

       Each milestone still alternates side; if it would overlap the
       previous label on ITS OWN side, it is promoted to an outer tier
       instead. Markers never move -- only their labels -- so the
       timeline stays truthful about dates. Width is estimated from
       character count, which is imprecise but consistently
       over-estimates for this font, and over-separating is a far
       cheaper mistake here than overlapping. */
    var tierOf = {};
    (function assignTiers() {
      var ordered = onScale.map(function (m, i) { return { i: i, x: xFor(Date.parse(m.date)), w: String(m.label || '').length * 4.9 }; })
        .sort(function (a, b) { return a.x - b.x; });
      var lastOnSide = { true: null, false: null };
      ordered.forEach(function (item, n) {
        var above = n % 2 === 0;
        var prev = lastOnSide[above];
        var collides = prev && (item.x - prev.x) < ((item.w + prev.w) / 2 + 6);
        tierOf[item.i] = { above: above, outer: !!collides };
        /* Only a non-promoted label occupies the near tier, so a run of
           three tight milestones does not cascade everything outward. */
        if (!collides) lastOnSide[above] = item;
      });
    })();

    var markers = onScale.map(function (m, i) {
      var x = fx(xFor(Date.parse(m.date)));
      var color = colorFor(m.kind);
      var tier = tierOf[i] || { above: i % 2 === 0, outer: false };
      var above = tier.above;
      var labelY = above ? (tier.outer ? y - 40 : y - 16) : (tier.outer ? y + 50 : y + 26);
      var lineY2 = above ? (tier.outer ? y - 32 : y - 8) : (tier.outer ? y + 42 : y + 8);
      var label = escSvgText(m.label + (m.pct != null ? ' — ' + fx(m.pct, 0) + '%' : '') + ' (' + m.date + ')');
      var tipAttr = interactive ? ' tabindex="0" role="img" aria-label="' + label + '" data-tip="' + label + '"' : '';
      var isToday = m.kind === 'today';
      var markerShape = '<circle cx="' + x + '" cy="' + y + '" r="' + (isToday ? 6 : 5) + '" fill="' + color + '"' + (isToday ? ' class="rpt-journey-pulse"' : '') + '/>';
      return '<g' + tipAttr + '>' +
        '<line x1="' + x + '" y1="' + y + '" x2="' + x + '" y2="' + lineY2 + '" stroke="' + color + '" stroke-width="1"/>' +
        markerShape +
        '<text x="' + x + '" y="' + labelY + '" text-anchor="middle" font-family="Manrope,sans-serif" font-size="9" fill="' + P.text + '">' + escSvgText(m.label) + '</text>' +
        '<text x="' + x + '" y="' + (labelY + (above ? 12 : -12)) + '" text-anchor="middle" font-family="Manrope,sans-serif" font-size="8" fill="' + P.textDim + '">' + escSvgText(m.date + (m.pct != null ? ' · ' + fx(m.pct, 0) + '%' : '')) + '</text>' +
        '</g>';
    }).join('');

    var offScaleHtml = offScale.map(function (m) {
      var color = colorFor(m.kind);
      var label = escSvgText(m.label + ' — ' + m.date + ' (beyond chart, at current velocity)');
      var tipAttr = interactive ? ' tabindex="0" role="img" aria-label="' + label + '" data-tip="' + label + '"' : '';
      return '<g' + tipAttr + '>' +
        '<text x="' + (x1 + 6) + '" y="' + (y + 4) + '" font-family="Manrope,sans-serif" font-size="13" fill="' + color + '">»</text>' +
        '<text x="' + (x1 + 6) + '" y="' + (y + 22) + '" font-family="Manrope,sans-serif" font-size="8" fill="' + P.textDim + '">' + escSvgText(m.date) + '</text>' +
        '</g>';
    }).join('');

    var ariaLabel = escSvgText('Certification journey: ' + onScale.map(function (m) { return m.label + ' ' + m.date; }).join(', '));
    return '<svg viewBox="0 0 640 140" width="100%" role="img" aria-label="' + ariaLabel + '">' +
      '<line x1="' + x0 + '" y1="' + y + '" x2="' + x1 + '" y2="' + y + '" stroke="' + P.line + '" stroke-width="1.5"/>' +
      markers + offScaleHtml +
      '</svg>';
  }

  /* 10. Assurance Pulse — a 26-week activity contribution strip (one
     cell per week, GitHub-contribution-graph style but at week, not
     day, granularity — each cell IS a week, per this feature's own
     spec). `weeks`: the output of lib.js's weeklyActivityGrid(), in
     oldest-to-newest order. Intensity is a 4-step gold ramp scaled to
     that data set's own busiest week (not a fixed absolute scale —
     a quiet solo-practitioner tenant and a busy audit-season tenant
     should both show visible variation, not one all-empty and the
     other all-maxed). Each cell's fade-in delay is baked directly into
     its own `style` attribute (i * 14ms, purely a function of its
     index — no Date.now()/Math.random() needed for a deterministic,
     reproducible stagger); the CSS side (index.html's .rpt-ag-cell
     keyframe) does the actual animating, and the app's existing
     blanket prefers-reduced-motion rule (near-zero animation-duration)
     already covers it, same as every other CSS-driven motion in this
     app. */
  function activityGridSvg(weeks, opts) {
    opts = opts || {};
    var interactive = !!opts.interactive;
    var dark = opts.palette === 'app';
    var trackColor = dark ? 'var(--line)' : '#EFEAE0';
    var goldFill = dark ? 'var(--gold)' : PAL.gold;
    var goldOpacities = [.3, .55, .78, 1];
    weeks = Array.isArray(weeks) ? weeks : [];
    if (!weeks.length) return placeholderSvg(640, 70, 'No activity recorded yet.');

    var n = weeks.length;
    var gap = 3, cellSize = Math.min(18, (620 - (n - 1) * gap) / n);
    var totalW = n * cellSize + (n - 1) * gap;
    var x0 = (640 - totalW) / 2, y0 = 14;
    var safeTotal = function (w) { var n = Number(w && w.total); return isFinite(n) && n > 0 ? n : 0; };
    var totals = weeks.map(safeTotal);
    var maxTotal = Math.max.apply(null, totals.concat([1]));
    var grandTotal = totals.reduce(function (s, t) { return s + t; }, 0);

    var TYPE_LABELS = { scan: 'scan', evidence: 'evidence capture', attestation: 'attestation', review: 'review', audit: 'audit' };
    var cells = weeks.map(function (w, i) {
      var total = safeTotal(w);
      var step = total === 0 ? 0 : Math.max(1, Math.min(4, Math.ceil(total / maxTotal * 4)));
      var fill = step === 0 ? trackColor : goldFill;
      var fillOpacity = step === 0 ? 1 : goldOpacities[step - 1];
      var x = fx(x0 + i * (cellSize + gap));
      var counts = (w && w.counts) || {};
      var parts = Object.keys(TYPE_LABELS).map(function (t) {
        var c = Number(counts[t]);
        return isFinite(c) && c > 0 ? c + ' ' + TYPE_LABELS[t] + (c > 1 ? 's' : '') : null;
      }).filter(Boolean);
      var tip = escSvgText((w.start || '?') + ' – ' + (w.end || '?') + ': ' + (parts.length ? parts.join(', ') : 'no activity'));
      var attrs = interactive
        ? ' tabindex="0" role="img" aria-label="' + tip + '" data-tip="' + tip + '" data-week-start="' + escSvgText(w.start || '') + '" data-week-end="' + escSvgText(w.end || '') + '" style="animation-delay:' + fx(i * 14, 0) + 'ms"'
        : '';
      return '<rect class="rpt-ag-cell" x="' + x + '" y="' + y0 + '" width="' + fx(cellSize) + '" height="' + fx(cellSize) + '" rx="2" fill="' + fill + '" fill-opacity="' + fillOpacity + '"' + attrs + '/>';
    }).join('');

    var ariaLabel = escSvgText('Assurance pulse: ' + n + '-week activity grid, ' + grandTotal + ' total activity event' + (grandTotal === 1 ? '' : 's'));
    return '<svg viewBox="0 0 640 ' + (y0 + cellSize + 12) + '" width="100%" role="img" aria-label="' + ariaLabel + '">' + cells + '</svg>';
  }

  /* 11. Risk Landscape — the risk register as a likelihood × impact
     bubble field: each open risk is a circle (radius ~ residual score,
     colour by severity band, position from lib.js's deterministic
     riskBubbleLayout()/riskBubblePoint()), with an optional thin gold
     trail from where it sat last quarter to where it sits now. `data`:
     { bubbles: [{ id, x, y, r, L, I, score, band, label }], trails:
     [{ fromX, fromY, toX, toY }] (already position-matched by the
     caller — this file draws whatever line segments it's given, no
     risk-matching logic here), overflowCount, size, margin }. Every
     bubble needs its own `label` (risk id + title, already computed by
     the caller — this file has no S.risks to look up a title from)
     for its tooltip; bubbles from riskBubbleLayout() alone don't carry
     one, so app.js merges it in before calling this. */
  function riskLandscapeSvg(data, opts) {
    opts = opts || {};
    var interactive = !!opts.interactive;
    var dark = opts.palette === 'app';
    var gridColor = dark ? 'var(--line)' : 'rgba(11,11,12,.14)';
    var textColor = dark ? 'var(--paper-faint)' : '#8b877d';
    var BAND_HEX = dark
      ? { Low: 'var(--pass)', Medium: 'var(--warn)', High: 'var(--fail)', Critical: 'var(--critical)' }
      : { Low: PAL.good, Medium: PAL.warn, High: PAL.high, Critical: PAL.bad };

    var bubbles = Array.isArray(data && data.bubbles) ? data.bubbles : [];
    var overflowCount = Math.max(0, Math.round(Number(data && data.overflowCount) || 0));
    var rawSize = Number(data && data.size), rawMargin = Number(data && data.margin);
    var size = isFinite(rawSize) && rawSize > 0 ? rawSize : 300;
    var margin = isFinite(rawMargin) && rawMargin >= 0 ? rawMargin : 30;
    if (!bubbles.length && !overflowCount) return placeholderSvg(size, size, 'No open risks recorded yet.');

    var cell = (size - 2 * margin) / 5;
    var grid = '';
    for (var g = 0; g <= 5; g++) {
      var gp = fx(margin + g * cell);
      grid += '<line x1="' + gp + '" y1="' + fx(margin) + '" x2="' + gp + '" y2="' + fx(size - margin) + '" stroke="' + gridColor + '" stroke-width="1"/>';
      grid += '<line x1="' + fx(margin) + '" y1="' + gp + '" x2="' + fx(size - margin) + '" y2="' + gp + '" stroke="' + gridColor + '" stroke-width="1"/>';
    }
    var axis = '';
    for (var a = 1; a <= 5; a++) {
      axis += '<text x="' + fx(margin + (a - 0.5) * cell) + '" y="' + fx(size - margin + 14) + '" text-anchor="middle" font-family="Manrope,sans-serif" font-size="9" fill="' + textColor + '">' + a + '</text>';
      axis += '<text x="' + fx(margin - 8) + '" y="' + fx(size - margin - (a - 0.5) * cell + 3) + '" text-anchor="end" font-family="Manrope,sans-serif" font-size="9" fill="' + textColor + '">' + a + '</text>';
    }
    axis += '<text x="' + fx(margin + 2.5 * cell) + '" y="' + fx(size - 6) + '" text-anchor="middle" font-family="Manrope,sans-serif" font-size="8.5" letter-spacing="1" fill="' + textColor + '">LIKELIHOOD</text>';
    axis += '<text x="10" y="' + fx(margin + 2.5 * cell) + '" text-anchor="middle" font-family="Manrope,sans-serif" font-size="8.5" letter-spacing="1" fill="' + textColor + '" transform="rotate(-90 10 ' + fx(margin + 2.5 * cell) + ')">IMPACT</text>';

    var trails = Array.isArray(data && data.trails) ? data.trails : [];
    var trailHtml = opts.showTrails === false ? '' : trails.map(function (t) {
      if (t == null || t.fromX == null || t.fromY == null || t.toX == null || t.toY == null) return '';
      return '<line class="rpt-rl-trail" x1="' + fx(t.fromX) + '" y1="' + fx(t.fromY) + '" x2="' + fx(t.toX) + '" y2="' + fx(t.toY) + '" stroke="' + PAL.gold + '" stroke-width="1.2" stroke-dasharray="2,2" opacity=".5"/>';
    }).join('');

    var bubbleHtml = bubbles.map(function (b) {
      var color = BAND_HEX[b.band] || PAL.neutral;
      var tip = escSvgText((b.label || b.id) + ' — score ' + fx(b.score, 0) + ' (' + b.band + ')');
      var attrs = interactive
        ? ' tabindex="0" role="img" aria-label="' + tip + '" data-tip="' + tip + '" data-risk-id="' + escSvgText(b.id) + '"'
        : '';
      return '<circle class="rpt-rl-bubble" cx="' + fx(b.x) + '" cy="' + fx(b.y) + '" r="' + fx(b.r) + '" fill="' + color + '" fill-opacity=".78" stroke="' + color + '" stroke-width="1.2"' + attrs + '/>';
    }).join('');

    var overflowHtml = '';
    if (overflowCount) {
      var ox = size - margin - 4, oy = margin + 4;
      var otip = escSvgText(overflowCount + ' more open risk' + (overflowCount === 1 ? '' : 's') + ' not shown individually');
      var oattrs = interactive ? ' tabindex="0" role="img" aria-label="' + otip + '" data-tip="' + otip + '"' : '';
      overflowHtml = '<g' + oattrs + '><circle cx="' + fx(ox) + '" cy="' + fx(oy) + '" r="13" fill="' + PAL.neutral + '" fill-opacity=".85"/>' +
        '<text x="' + fx(ox) + '" y="' + fx(oy + 3) + '" text-anchor="middle" font-family="Manrope,sans-serif" font-size="9" font-weight="700" fill="#FAF7F1">+' + overflowCount + '</text></g>';
    }

    var ariaLabel = escSvgText('Risk landscape: ' + bubbles.length + ' open risk' + (bubbles.length === 1 ? '' : 's') + ' plotted by likelihood × impact' + (overflowCount ? ', ' + overflowCount + ' more not shown individually' : ''));
    return '<svg viewBox="0 0 ' + size + ' ' + size + '" width="100%" role="img" aria-label="' + ariaLabel + '">' + grid + axis + trailHtml + bubbleHtml + overflowHtml + '</svg>';
  }

  /* Compact USD axis label — $1.2M / $300K / $850, never a raw
     six-figure integer crowding the axis. Never negative (annual loss
     is never negative); always at least "$0". */
  function fmtUsdCompact(n) {
    n = Math.max(0, Number(n) || 0);
    if (n >= 1000000) return '$' + (Math.round(n / 100000) / 10) + 'M';
    if (n >= 1000) return '$' + Math.round(n / 1000) + 'K';
    return '$' + Math.round(n);
  }

  /* 12. Loss exceedance curve — the standard quantitative-risk chart:
     P(annual loss > x) at each x along the loss axis, from lib.js's
     lossExceedanceCurve(). Read any point as "there's a Y% chance
     losses exceed $X this year" — the further right a given
     probability holds, the fatter the tail. `curve`: the plain
     [{x,p}] array that function returns; this file only draws it,
     same "app.js/lib.js computes, report.js renders" split as every
     other chart here. */
  function lossExceedanceSvg(curve, opts) {
    opts = opts || {};
    var interactive = !!opts.interactive;
    var dark = opts.palette === 'app';
    var lineColor = dark ? 'var(--gold)' : PAL.gold;
    var areaFill = dark ? 'var(--gold)' : PAL.gold;
    var gridColor = dark ? 'var(--line)' : 'rgba(11,11,12,.12)';
    var textColor = dark ? 'var(--paper-dim)' : '#8b877d';
    var textStrong = dark ? 'var(--paper)' : '#0B0B0C';

    curve = Array.isArray(curve) ? curve : [];
    if (curve.length < 2) return placeholderSvg(580, 220, 'Not enough simulated trials yet to chart a loss curve.');

    var x0 = 56, x1 = 566, y0 = 20, y1 = 170;
    var maxX = curve[curve.length - 1].x || 1;
    var xFor = function (x) { return x0 + (Math.max(0, Math.min(maxX, x)) / maxX) * (x1 - x0); };
    var yFor = function (p) { return y1 - Math.max(0, Math.min(1, p)) * (y1 - y0); };

    var gridlines = [0, 0.25, 0.5, 0.75, 1].map(function (p) {
      var y = fx(yFor(p));
      return '<line x1="' + x0 + '" y1="' + y + '" x2="' + x1 + '" y2="' + y + '" stroke="' + gridColor + '" stroke-width="1"/>' +
        '<text x="' + (x0 - 8) + '" y="' + fx(y + 3) + '" text-anchor="end" font-family="Manrope,sans-serif" font-size="9" fill="' + textColor + '">' + Math.round(p * 100) + '%</text>';
    }).join('');

    var pts = curve.map(function (pt) { return [fx(xFor(pt.x)), fx(yFor(pt.p))]; });
    var line = pts.map(function (p) { return p[0] + ',' + p[1]; }).join(' ');
    var area = '<polygon points="' + line + ' ' + pts[pts.length - 1][0] + ',' + y1 + ' ' + pts[0][0] + ',' + y1 + '" fill="' + areaFill + '" fill-opacity=".1"/>';
    var pathHtml = area + '<polyline points="' + line + '" fill="none" stroke="' + lineColor + '" stroke-width="2"/>';

    /* A handful of evenly-spaced x-axis labels — every point would
       crowd a 40-60-point curve unreadable. */
    var labelCount = Math.min(5, curve.length);
    var xLabels = [];
    for (var i = 0; i < labelCount; i++) {
      var idx = Math.round((i / (labelCount - 1)) * (curve.length - 1));
      var pt = curve[idx];
      xLabels.push('<text x="' + fx(xFor(pt.x)) + '" y="' + (y1 + 16) + '" text-anchor="' + (i === 0 ? 'start' : i === labelCount - 1 ? 'end' : 'middle') + '" font-family="Manrope,sans-serif" font-size="9" fill="' + textColor + '">' + escSvgText(fmtUsdCompact(pt.x)) + '</text>');
    }

    var interactiveDots = '';
    if (interactive) {
      interactiveDots = curve.map(function (pt, i) {
        var tip = escSvgText((Math.round(pt.p * 1000) / 10) + '% chance annual loss exceeds ' + fmtUsdCompact(pt.x));
        return '<circle cx="' + pts[i][0] + '" cy="' + pts[i][1] + '" r="9" fill="transparent" tabindex="0" role="img" aria-label="' + tip + '" data-tip="' + tip + '"/>';
      }).join('');
    }

    var p50 = curve.reduce(function (best, pt) { return Math.abs(pt.p - 0.5) < Math.abs(best.p - 0.5) ? pt : best; }, curve[0]);
    var headline = '<text x="' + x0 + '" y="12" font-family="Manrope,sans-serif" font-size="9" fill="' + textStrong + '" font-weight="700">' + escSvgText('~50% chance annual loss exceeds ' + fmtUsdCompact(p50.x)) + '</text>';

    var ariaLabel = escSvgText('Loss exceedance curve, median annual loss around ' + fmtUsdCompact(p50.x));
    return '<svg viewBox="0 0 580 200" width="100%" role="img" aria-label="' + ariaLabel + '">' + headline + gridlines + pathHtml + interactiveDots + xLabels.join('') + '</svg>';
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

  /* accent: a validated #rrggbb string (app.js re-validates spec.client
     .brandColor before it reaches here; anything malformed falls back
     to Checkpoint gold). Only document furniture takes the client
     accent — section rules, KPI figures, the cover framework tag, TOC
     hover — never the charts, whose palette is print-contrast
     validated and stays fixed, and never the Checkpoint mast (.w2),
     which is the producer's mark, not the client's. */
  function css(fontBase, accent) {
    return "@font-face{font-family:'Fraunces';font-style:normal;font-weight:400 500;src:url('" + fontBase + "fonts/fraunces.woff2') format('woff2')}" +
      "@font-face{font-family:'Manrope';font-style:normal;font-weight:300 800;src:url('" + fontBase + "fonts/manrope.woff2') format('woff2')}" +
      '@page{size:A4;margin:34mm 16mm 26mm 16mm}' +
      'html,body{margin:0;padding:0}' +
      'body{font-family:Manrope,sans-serif;background:#FAF7F1;color:#0B0B0C;font-size:12.5px;line-height:1.6}' +
      '.rpt-doc{max-width:900px;margin:0 auto;padding:28px 40px}' +
      '.rpt-mast{display:flex;align-items:center;gap:8px;margin-bottom:28px}.w1{font-weight:300;letter-spacing:.13em;font-size:12px}.w2{font-weight:800;color:#A9812E;font-size:12px}' +
      'h1{font-family:Fraunces,serif;font-weight:500}h2{font-family:Fraunces,serif;font-weight:500;font-size:18px;margin:0 0 4px}h3{font-family:Fraunces,serif;font-weight:500;font-size:14px;margin:22px 0 8px}' +
      '.rpt-rule{width:26px;height:1px;background:' + accent + ';margin:10px 0 18px}' +
      '.rpt-intro{color:#4b473e;max-width:70ch}' +
      '.rpt-plain{margin:6px 0 0 18px;padding:0}.rpt-plain li{margin-bottom:6px}' +
      '.rpt-table{width:100%;border-collapse:collapse;margin-top:14px}.rpt-table th{font-size:9px;letter-spacing:.14em;text-transform:uppercase;text-align:left;padding:8px 10px;border-bottom:1px solid #0B0B0C;color:#6b675e}' +
      '.rpt-table td{padding:9px 10px;border-bottom:1px solid rgba(11,11,12,.12);vertical-align:top}.rpt-idc{font-weight:800;font-size:11px;white-space:nowrap}' +
      '.rpt-just{font-size:11px;color:#6b675e;font-style:italic;margin-top:4px}' +
      '.rpt-signoff td{padding-top:24px}.rpt-signoff-line{white-space:nowrap;color:#6b675e}' +
      '.rpt-stats{display:flex;border-top:1px solid rgba(11,11,12,.2);border-bottom:1px solid rgba(11,11,12,.2);margin:18px 0}' +
      '.rpt-stats div{flex:1;padding:14px;border-right:1px solid rgba(11,11,12,.12)}.rpt-stats div:last-child{border-right:none}' +
      '.rpt-stats b{display:block;font-size:24px;font-weight:800;color:' + accent + '}.rpt-stats span{font-size:9.5px;letter-spacing:.1em;text-transform:uppercase;color:#6b675e}' +
      '.rpt-toc{margin:8px 0 0 0;padding:0;list-style:none}.rpt-toc li{border-bottom:1px solid rgba(11,11,12,.1);padding:9px 0}.rpt-toc a{color:#0B0B0C;text-decoration:none;font-size:13px}' +
      '.rpt-chart-card{margin-top:24px}.rpt-chart-card:first-child{margin-top:0}' +
      '.rpt-chart-title{font-size:13px;margin:0 0 10px}' +
      '.rpt-chart-caption{font-size:11px;color:#6b675e;font-style:italic;margin:8px 0 0;max-width:70ch}' +
      '.rpt-chart-card svg{max-width:100%;height:auto;display:block}' +
      '.rpt-cover{display:flex;flex-direction:column;min-height:210mm}' +
      '.rpt-cover-class{align-self:flex-start;font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:#6b675e;border:1px solid rgba(11,11,12,.3);padding:4px 10px;border-radius:2px;margin-bottom:40px}' +
      '.rpt-cover-mid{flex:1;display:flex;flex-direction:column;justify-content:center}' +
      '.rpt-cover-logo{max-height:56px;max-width:220px;object-fit:contain;margin-bottom:22px}' +
      '.rpt-cover-title{font-size:32px;margin:0 0 8px}.rpt-cover-fw{font-size:13px;letter-spacing:.06em;text-transform:uppercase;color:' + accent + ';font-weight:700}' +
      '.rpt-cover-meta{width:100%;border-collapse:collapse;margin-top:30px}.rpt-cover-meta th{text-align:left;font-size:9px;letter-spacing:.14em;text-transform:uppercase;color:#6b675e;padding:8px 0;width:35%}.rpt-cover-meta td{padding:8px 0;font-size:13px;border-bottom:1px solid rgba(11,11,12,.12)}' +
      '.rpt-header,.rpt-footer{display:flex;justify-content:space-between;align-items:center;font-size:9.5px;letter-spacing:.08em;text-transform:uppercase;color:#8b877d}' +
      '.rpt-header-client{display:inline-flex;align-items:center;gap:8px}' +
      '.rpt-header-logo{max-height:16px;max-width:70px;object-fit:contain;display:block}' +
      '.rpt-header{border-bottom:1px solid rgba(11,11,12,.15);padding:0 40px 10px;margin-bottom:6px}' +
      '.rpt-footer{border-top:1px solid rgba(11,11,12,.15);padding:10px 40px 0}' +
      '.rpt-page{page-break-before:always}.rpt-page:first-child{page-break-before:avoid}' +
      '.rpt-flow{margin-top:26px}' +
      'tr,.rpt-stats div,.rpt-cover-meta tr,.rpt-chart-card{break-inside:avoid;page-break-inside:avoid}' +
      '@media screen{' +
        '.rpt-header,.rpt-footer{max-width:900px;margin:0 auto}' +
        '.rpt-page{background:#fff;box-shadow:0 1px 3px rgba(11,11,12,.15);border-radius:2px;padding:34px 40px;margin:22px auto;max-width:820px}' +
      '}' +
      '@media print{' +
        'body{background:#fff}' +
        '.rpt-doc{padding:0 24px}' +
        '.rpt-header{position:fixed;top:-22mm;left:16mm;right:16mm;width:auto}' +
        '.rpt-footer{position:fixed;bottom:-18mm;left:16mm;right:16mm;width:auto}' +
      '}';
  }

  function buildReport(spec) {
    var fontBase = (typeof location !== 'undefined') ? location.href.slice(0, location.href.lastIndexOf('/') + 1) : '';
    /* Defence in depth: app.js validates the brand colour on save and
       again when building the spec, but this engine is also handed
       specs by tests and (per the header comment) a future server-side
       renderer — so it never trusts the field either. */
    var accent = (spec.client && /^#[0-9a-fA-F]{6}$/.test(spec.client.brandColor || '')) ? spec.client.brandColor : '#A9812E';
    var entries = buildTocEntries(spec);
    var contentEntryStart = spec.dashboard ? 1 : 0;
    var headerLogo = (spec.client && spec.client.logoUrl)
      ? '<img class="rpt-header-logo" src="' + esc(spec.client.logoUrl) + '" alt="">'
      : '';
    var header = '<div class="rpt-header"><span class="rpt-header-client">' + headerLogo + esc(spec.client.name) + ' — ' + esc(spec.reportTitle) + '</span><span>' + esc(spec.classification) + '</span></div>';
    /* The footer's left slot carries the document identity (title +
       version), not a page number — the old "Page N" CSS counter
       resolved once at the fixed footer's DOM position, printing the
       same (off-by-one) total on every page. Browser print engines
       add no reliable per-physical-page counter to fixed elements, so
       an accurate identity beats an inaccurate number. */
    var footerMid = spec.footerText ? esc(spec.footerText) : esc(spec.classification);
    var footer = '<div class="rpt-footer"><span>' + esc(spec.reportTitle) + ' · v' + esc(spec.version) + '</span><span>' + footerMid + '</span><span>Generated ' + esc(spec.date) + '</span></div>';
    var body = coverPage(spec) + docControlPage(spec) + tocPage(entries) +
      dashboardSection(spec, 'sec-dashboard') +
      contentSections(spec, entries, contentEntryStart) +
      methodologyPage(spec, 'sec-methodology') +
      signOffPage(spec, 'sec-signoff');
    return '<!DOCTYPE html><html><head><meta charset="utf-8"><style>' + css(fontBase, accent) + '</style></head><body>' +
      header + '<div class="rpt-doc">' + body + '</div>' + footer +
      '</body></html>';
  }

  window.ReportEngine = {
    buildReport: buildReport,
    charts: {
      donut: donutChart,
      trend: trendChart,
      stackedBars: stackedBarsChart,
      hbars: hbarsChart,
      riskHeatmap: riskHeatmapChart,
      evidenceGauge: evidenceGaugeChart,
      kpiStrip: kpiStripChart,
      fingerprint: fingerprintSvg,
      projectionDrift: projectionDriftChart,
      journey: journeyTimelineSvg,
      activityGrid: activityGridSvg,
      riskLandscape: riskLandscapeSvg,
      lossExceedance: lossExceedanceSvg
    },
    /* Exposed so app.js's REPORT_BUILDERS can build stackedBars()
       legendDefs (severity distribution, action throughput, ...) using
       the exact same validated print-safe colors the charts above
       already use internally — one palette, never redefined twice. */
    palette: PAL,
    paletteApp: PAL_APP
  };
})();
