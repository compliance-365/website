/* Compliance365 readiness checklist report: one PDF design for every
   checklist. Each checklist page gathers its answers and calls
   window.c365ChecklistReport(data); this file draws the report with
   jsPDF (already loaded by the page) in the brand fonts and colours.

   Fonts: jsPDF cannot read woff2 or variable fonts, so static Latin
   instances of Manrope (400, 700) and Bricolage Grotesque (700) sit in
   /assets/fonts/pdf/ (SIL Open Font License, copies alongside). They are
   fetched once, as soon as this script loads; if they cannot be fetched
   the report falls back to Helvetica rather than failing.

   data = {
     title, framework, fileStem,            e.g. 'IS18 readiness report', 'IS18', 'is18_readiness_'
     org, contact, details: [[label, value]],
     score, answered, total, band: { label, desc },
     groups: [{ key, title, pct }],         pct null when nothing answered
     questions: [{ id, group, label, value }]  value 2 yes, 1 partial, 0 no, undefined unanswered
   }
   Guidance (why it matters, what good looks like) is read from the page's
   <script type="application/json" id="cl-guidance">, keyed by question id. */
(function () {
  var FONT_BASE = '/assets/fonts/pdf/';
  var FONTS = [
    ['manrope-regular.ttf', 'Manrope', 'normal'],
    ['manrope-bold.ttf', 'Manrope', 'bold'],
    ['bricolage-bold.ttf', 'Bricolage', 'bold']
  ];
  var fontData = null;
  function b64(buf) {
    var bytes = new Uint8Array(buf), s = '', CH = 0x8000;
    for (var i = 0; i < bytes.length; i += CH) s += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
    return btoa(s);
  }
  var fontsReady = Promise.all(FONTS.map(function (f) {
    return fetch(FONT_BASE + f[0]).then(function (r) { if (!r.ok) throw new Error(f[0]); return r.arrayBuffer(); }).then(b64);
  })).then(function (list) { fontData = list; }).catch(function () { fontData = null; });

  var C = {
    ink: [11, 11, 12], paper: [250, 247, 241], accent: [190, 74, 30], accentInk: [166, 58, 18],
    peach: [240, 169, 127], tint: [251, 239, 232], track: [237, 232, 224], rule: [221, 216, 207],
    sub: [87, 83, 75], muted: [107, 104, 96], green: [4, 106, 78], greenTint: [226, 241, 235],
    amber: [214, 150, 38], amberInk: [146, 98, 0], amberTint: [253, 243, 222], white: [255, 255, 255]
  };
  var W = 210, H = 297, M = 18, CW = W - 2 * M;

  function colFor(p) { return p == null ? C.muted : p >= 75 ? C.green : p >= 50 ? C.amber : C.accent; }
  function inkFor(p) { return p == null ? C.muted : p >= 75 ? C.green : p >= 50 ? C.amberInk : C.accentInk; }

  window.c365ChecklistReport = function (data) {
    var JS = window.jspdf && window.jspdf.jsPDF;
    if (!JS) { alert('PDF library not loaded yet. Please wait a moment and try again.'); return Promise.resolve(); }
    return fontsReady.then(function () { build(JS, data); });
  };

  function build(JS, d) {
    var doc = new JS('p', 'mm', 'a4');
    var BODY = 'helvetica', HEAD = 'helvetica';
    if (fontData) {
      FONTS.forEach(function (f, i) { doc.addFileToVFS(f[0], fontData[i]); doc.addFont(f[0], f[1], f[2]); });
      BODY = 'Manrope'; HEAD = 'Bricolage';
    }
    var guide = {};
    try { guide = JSON.parse((document.getElementById('cl-guidance') || {}).textContent || '{}'); } catch (e) { guide = {}; }

    function font(fam, style, size, col) { doc.setFont(fam, style); doc.setFontSize(size); doc.setTextColor.apply(doc, col || C.ink); }
    function fill(col) { doc.setFillColor.apply(doc, col); }
    function draw(col) { doc.setDrawColor.apply(doc, col); }
    function spaced(text, x, y, sp) { doc.setCharSpace(sp || 0); doc.text(text, x, y); doc.setCharSpace(0); }
    /* An arc as a polyline: angles in degrees, 0 at the top, clockwise. */
    function arc(cx, cy, r, a0, a1, width, col) {
      if (a1 - a0 < 0.5) return;
      var pts = [], step = 2;
      for (var a = a0; a < a1; a += step) pts.push(a);
      pts.push(a1);
      var P = pts.map(function (a) { var t = (a - 90) * Math.PI / 180; return [cx + r * Math.cos(t), cy + r * Math.sin(t)]; });
      var rel = [];
      for (var i = 1; i < P.length; i++) rel.push([P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]]);
      draw(col); doc.setLineWidth(width); doc.setLineCap('round');
      doc.lines(rel, P[0][0], P[0][1], [1, 1], 'S', false);
      doc.setLineCap('butt');
    }
    function logo(x, y, s, ring, dot) {   // the Compliance365 mark: an open ring and a dot
      arc(x, y, s, 120, 420, s * 0.16, ring);
      fill(dot); doc.circle(x + s, y, s * 0.15, 'F');
    }
    function pill(text, x, y, bg, fg) {    // returns width
      font(BODY, 'bold', 7.5, fg);
      var w = doc.getTextWidth(text) + 6;
      fill(bg); doc.roundedRect(x, y - 3.6, w, 5.4, 2.7, 2.7, 'F');
      doc.text(text, x + 3, y);
      return w;
    }

    var today = new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' });
    var org = d.org || 'Your organisation';
    var aboutDone = false;
    var y;
    function newPage() { doc.addPage(); y = 22; }
    function need(h) { if (y + h > H - 22) newPage(); }

    /* ---------- Page 1: cover band ---------- */
    fill(C.ink); doc.rect(0, 0, W, 62, 'F');
    fill(C.accent); doc.rect(0, 62, W, 1.4, 'F');
    logo(M + 4.5, 17, 4.5, C.paper, C.accent);
    font(BODY, 'normal', 10, C.paper); spaced('COMPLIANCE', M + 13, 18.6, 0.9);
    var cw = doc.getTextWidth('COMPLIANCE') + 0.9 * 10;
    font(BODY, 'bold', 10, C.peach); doc.text('365', M + 13.6 + cw, 18.6);
    font(BODY, 'bold', 8, C.peach); spaced((d.framework + ' · readiness report').toUpperCase(), M, 34, 1.1);
    var ts = 22; font(HEAD, 'bold', ts, C.white);
    while (doc.getTextWidth(d.title) > CW && ts > 14) { ts -= 1; doc.setFontSize(ts); }
    doc.text(d.title, M, 45);
    font(BODY, 'normal', 9.5, [201, 195, 184]); doc.text(org + '   ·   ' + today, M, 54);

    /* Details */
    y = 74;
    var det = [['Organisation', org], ['Prepared for', d.contact || '—']].concat((d.details || []).filter(function (r) { return r[1]; }));
    var colW = CW / 2;
    det.forEach(function (r, i) {
      var x = M + (i % 2) * colW, yy = y + Math.floor(i / 2) * 11;
      font(BODY, 'bold', 6.8, C.muted); spaced(r[0].toUpperCase(), x, yy, 0.6);
      font(BODY, 'normal', 9, C.ink);
      doc.text(doc.splitTextToSize(String(r[1]), colW - 6)[0], x, yy + 4.6);
    });
    y += Math.ceil(det.length / 2) * 11 + 3;
    draw(C.rule); doc.setLineWidth(0.3); doc.line(M, y, W - M, y);
    y += 8;

    /* ---------- Score panel ---------- */
    var counts = { yes: 0, partial: 0, no: 0, none: 0 };
    d.questions.forEach(function (q) { if (q.value === 2) counts.yes++; else if (q.value === 1) counts.partial++; else if (q.value === 0) counts.no++; else counts.none++; });
    var sc = d.answered ? d.score : 0, sCol = colFor(d.answered ? sc : null);
    fill(C.paper); doc.roundedRect(M, y, CW, 54, 3, 3, 'F');
    var gx = M + 27, gy = y + 27;
    arc(gx, gy, 17, 0, 360, 5, C.track);
    arc(gx, gy, 17, 0, 3.6 * sc, 5, sCol);
    font(HEAD, 'bold', 20, C.ink); var st = sc + '%'; doc.text(st, gx - doc.getTextWidth(st) / 2, gy + 2.5);
    font(BODY, 'bold', 6.5, C.muted); var ol = 'OVERALL'; spaced(ol, gx - (doc.getTextWidth(ol) + 0.5 * 6) / 2, gy + 8, 0.5);
    var tx = M + 56;
    font(BODY, 'bold', 7, inkFor(d.answered ? sc : null)); spaced('READINESS', tx, y + 12, 0.8);
    font(HEAD, 'bold', 17, C.ink); doc.text(d.band.label, tx, y + 20);
    font(BODY, 'normal', 9, C.sub);
    var dl = doc.splitTextToSize(d.band.desc + '.', CW - 60); doc.text(dl.slice(0, 2), tx, y + 26.5);
    /* answer mix: one stacked bar and a legend */
    var bx = tx, by = y + 37, bw = CW - 62, total = d.total || d.questions.length;
    var segs = [[counts.yes, C.green, 'In place'], [counts.partial, C.amber, 'Partly'], [counts.no, C.accent, 'Not in place'], [counts.none, C.track, 'Not answered']];
    var sx = bx;
    fill(C.track); doc.roundedRect(bx, by, bw, 3.6, 1.8, 1.8, 'F');
    segs.forEach(function (s) { if (!s[0]) return; var w = bw * s[0] / total; fill(s[1]); doc.rect(sx, by, w, 3.6, 'F'); sx += w; });
    var lx = bx;
    segs.filter(function (s) { return s[0] || s[2] !== 'Not answered'; }).forEach(function (s) {
      fill(s[1]); doc.circle(lx + 1.3, by + 9, 1.3, 'F');
      font(BODY, 'normal', 7.5, C.sub); var t = s[2] + ' ' + s[0]; doc.text(t, lx + 4, by + 10);
      lx += doc.getTextWidth(t) + 9;
    });
    y += 62;

    /* Key points */
    var answeredGroups = d.groups.filter(function (g) { return g.pct != null; });
    var gaps = d.questions.filter(function (q) { return q.value === 0 || q.value === 1; });
    if (answeredGroups.length) {
      var best = answeredGroups.slice().sort(function (a, b) { return b.pct - a.pct; })[0];
      var worst = answeredGroups.slice().sort(function (a, b) { return a.pct - b.pct; })[0];
      var kp = [
        ['Strongest area', best.title + ' (' + best.pct + '%)', C.green],
        worst.pct === 100 ? ['Most to do', 'Nothing outstanding', C.green] : ['Most to do', worst.title + ' (' + worst.pct + '%)', C.accent],
        gaps.length ? ['Priority gaps', counts.no + ' not in place, ' + counts.partial + ' partly in place', C.amber] : ['Priority gaps', 'None recorded', C.green]
      ];
      need(26);
      var kw = (CW - 8) / 3;
      kp.forEach(function (k, i) {
        var x = M + i * (kw + 4);
        fill(C.paper); doc.roundedRect(x, y, kw, 22, 2.5, 2.5, 'F');
        fill(k[2]); doc.rect(x, y + 3, 1.2, 16, 'F');
        font(BODY, 'bold', 6.8, C.muted); spaced(k[0].toUpperCase(), x + 5, y + 7, 0.5);
        font(BODY, 'bold', 8.8, C.ink); doc.text(doc.splitTextToSize(k[1], kw - 8).slice(0, 2), x + 5, y + 12.5);
      });
      y += 29;
    }

    /* ---------- Domain breakdown ---------- */
    font(HEAD, 'bold', 13, C.ink); doc.text('Where you stand, area by area', M, y); y += 7;
    var nameW = 74, barX = M + nameW + 4, barW = CW - nameW - 20;
    var rowH = Math.max(6.5, Math.min(9, (H - 22 - y - 9) / d.groups.length));
    d.groups.forEach(function (g) {
      var p = g.pct, col = colFor(p);
      font(BODY, 'bold', 9, C.ink);
      var nl = doc.splitTextToSize(g.title, nameW);
      doc.text(nl[0], M, y + 3.2);
      fill(C.track); doc.roundedRect(barX, y, barW, 4.2, 2.1, 2.1, 'F');
      if (p) { fill(col); doc.roundedRect(barX, y, Math.max(4.2, barW * p / 100), 4.2, 2.1, 2.1, 'F'); }
      font(BODY, 'bold', 9, inkFor(p)); var pt = p == null ? '—' : p + '%'; doc.text(pt, W - M - doc.getTextWidth(pt), y + 3.4);
      y += rowH;
    });
    /* scale marks */
    font(BODY, 'normal', 6.5, C.muted);
    [0, 50, 75, 100].forEach(function (m) { var t = m + '%'; doc.text(t, barX + barW * m / 100 - doc.getTextWidth(t) / 2, y + 1); });
    y += 7;
    /* The self-assessment note sits at the foot of page 1 when there is room. */
    if (y + 24 <= H - 22) { y = Math.max(y + 2, H - 22 - 20); aboutBlock(); }

    function aboutBlock() {
      font(BODY, 'normal', 7.6);
      var ab = doc.splitTextToSize('This report is generated from the answers given in the Compliance365 ' + d.framework + ' readiness checklist on ' + today + '. It is a self-assessment to help you prioritise. It is not an audit, a certification or a formal assessment, and its results depend on the accuracy of the answers.', CW);
      if (y + 6 + ab.length * 3.6 > H - 17) newPage();
      font(BODY, 'bold', 6.8, C.muted); spaced('ABOUT THIS REPORT', M, y, 0.6); y += 4.5;
      font(BODY, 'normal', 7.6, C.muted); doc.text(ab, M, y); y += ab.length * 3.6 + 4;
      aboutDone = true;
    }
    /* ---------- Priority gaps ---------- */
    function cardParts(q) {
      var gd = guide[q.id] || {}, tw = CW - 20;
      font(BODY, 'bold', 9.2); var L = doc.splitTextToSize(q.label, tw);
      font(BODY, 'normal', 8.2); var Hn = gd.hint ? doc.splitTextToSize(gd.hint, tw - 2) : [];
      var Ex = (gd.examples || []).slice(0, 3).map(function (e) { return doc.splitTextToSize(e, tw - 6); });
      var exLines = Ex.reduce(function (n, e) { return n + e.length; }, 0);
      return { L: L, Hn: Hn, Ex: Ex, h: 9 + L.length * 4.3 + (Hn.length ? 5 + Hn.length * 3.8 : 0) + (Ex.length ? 5.5 + exLines * 3.8 : 0) + 1 };
    }
    function cardH(q) { return cardParts(q).h; }
    if (gaps.length) {
      newPage();
      font(BODY, 'bold', 7.5, C.accentInk); spaced('PRIORITY GAPS', M, y, 1); y += 7;
      font(HEAD, 'bold', 17, C.ink); doc.text('What to close first', M, y); y += 6;
      font(BODY, 'normal', 9, C.sub);
      var intro = doc.splitTextToSize('Controls marked not in place come first, then those partly in place, grouped by area. For each one: why it matters, and what an assessor or auditor will expect to see.', CW);
      doc.text(intro, M, y); y += intro.length * 4.4 + 4;
      var order = d.groups.map(function (g) { return g.key; });
      var n = 0;
      [0, 1].forEach(function (val) {
        order.forEach(function (gk) {
          var inGroup = gaps.filter(function (q) { return q.value === val && q.group === gk; });
          if (!inGroup.length) return;
          var g = d.groups.filter(function (x) { return x.key === gk; })[0];
          need(6 + cardH(inGroup[0]) + 4);
          font(BODY, 'bold', 7, C.muted); spaced((g ? g.title : gk).toUpperCase() + (val === 0 ? '  ·  NOT IN PLACE' : '  ·  PARTLY IN PLACE'), M, y + 2, 0.6);
          y += 6;
          inGroup.forEach(function (q) {
            n++;
            var c = cardParts(q), L = c.L, Hn = c.Hn, Ex = c.Ex, h = c.h;
            need(h + 3);
            var col = val === 0 ? C.accent : C.amber, colInk = val === 0 ? C.accentInk : C.amberInk, tintc = val === 0 ? C.tint : C.amberTint;
            fill(C.white); draw(C.rule); doc.setLineWidth(0.25); doc.roundedRect(M, y, CW, h, 2.5, 2.5, 'FD');
            fill(col); doc.rect(M, y + 2.5, 1.2, h - 5, 'F');
            fill(tintc); doc.circle(M + 8.5, y + 7, 3.6, 'F');
            font(BODY, 'bold', 8.5, colInk); var ns = String(n); doc.text(ns, M + 8.5 - doc.getTextWidth(ns) / 2, y + 8.3);
            var ix = M + 16, iy = y + 7.6;
            font(BODY, 'bold', 9.2, C.ink); doc.text(L, ix, iy);
            iy += L.length * 4.3 + 1;
            if (Hn.length) {
              font(BODY, 'bold', 6.6, colInk); spaced('WHY IT MATTERS', ix, iy + 1.6, 0.5); iy += 5;
              font(BODY, 'normal', 8.2, C.sub); doc.text(Hn, ix, iy); iy += Hn.length * 3.8;
            }
            if (Ex.length) {
              iy += 0.5;
              font(BODY, 'bold', 6.6, C.green); spaced('WHAT GOOD LOOKS LIKE', ix, iy + 1.6, 0.5); iy += 5;
              Ex.forEach(function (e) {
                fill(C.green); doc.circle(ix + 1, iy - 1.1, 0.7, 'F');
                font(BODY, 'normal', 8.2, C.sub); doc.text(e, ix + 4, iy); iy += e.length * 3.8;
              });
            }
            y += h + 3.5;
          });
          y += 2;
        });
      });
    }

    /* ---------- Next steps ---------- */
    need(aboutDone ? 118 : 140);
    if (y > 40) y += 4;
    font(BODY, 'bold', 7.5, C.accentInk); spaced('NEXT STEPS', M, y, 1); y += 7;
    font(HEAD, 'bold', 17, C.ink); doc.text('Turning this into a plan', M, y); y += 8;
    var steps = [
      ['Confirm the facts', 'Check each gap with the person who owns that area. A control that is in place but has no evidence is an evidence gap, usually much quicker to close than a missing control.'],
      ['Put owners and dates on the gaps', 'Start with the not-in-place items in your weakest area. Give each an owner, a realistic date and the evidence that will show it is done.'],
      ['Check progress before it matters', 'Re-run this checklist, or have an independent review, before the audit, assessment or deadline that is driving this work.']
    ];
    steps.forEach(function (s, i) {
      font(BODY, 'normal', 8.8); var sl = doc.splitTextToSize(s[1], CW - 16);
      var h = 8 + sl.length * 4.2;
      fill(C.ink); doc.circle(M + 3.6, y + 2.6, 3.6, 'F');
      font(BODY, 'bold', 9, C.white); var ns = String(i + 1); doc.text(ns, M + 3.6 - doc.getTextWidth(ns) / 2, y + 3.9);
      font(BODY, 'bold', 10, C.ink); doc.text(s[0], M + 11, y + 3.8);
      font(BODY, 'normal', 8.8, C.sub); doc.text(sl, M + 11, y + 9);
      y += h + 4;
    });
    y += 2;
    /* call to action */
    fill(C.ink); doc.roundedRect(M, y, CW, 38, 3, 3, 'F');
    fill(C.accent); doc.rect(M, y + 4, 1.4, 30, 'F');
    font(BODY, 'bold', 7.5, C.peach); spaced('TALK IT THROUGH', M + 8, y + 9, 1);
    font(HEAD, 'bold', 14, C.white); doc.text('A free 30-minute call on your results', M + 8, y + 17);
    font(BODY, 'normal', 8.8, [201, 195, 184]);
    doc.text(doc.splitTextToSize('We will go through your top gaps, what each involves and a realistic timeline. No obligation, and we reply within one business day.', CW - 70), M + 8, y + 23.5);
    var bx2 = W - M - 52, by2 = y + 13;
    fill(C.accent); doc.roundedRect(bx2, by2, 46, 11, 2, 2, 'F');
    font(BODY, 'bold', 9, C.white); var bt = 'Book a call'; doc.text(bt, bx2 + 23 - doc.getTextWidth(bt) / 2, by2 + 7.1);
    doc.link(bx2, by2, 46, 11, { url: 'https://www.compliance365.com.au/book/' });
    font(BODY, 'normal', 7.5, [201, 195, 184]);
    var ct = 'info@compliance365.com.au'; doc.text(ct, bx2 + 23 - doc.getTextWidth(ct) / 2, by2 + 17);
    y += 44;
    if (!aboutDone) aboutBlock();

    /* ---------- Running header and footer ---------- */
    var pages = doc.getNumberOfPages();
    for (var p = 1; p <= pages; p++) {
      doc.setPage(p);
      if (p > 1) {
        logo(M + 2.2, 11, 2.2, C.ink, C.accent);
        font(BODY, 'bold', 7.5, C.ink); doc.text(d.title, M + 7, 11.9);
        font(BODY, 'normal', 7.5, C.muted); doc.text(org, W - M - doc.getTextWidth(org), 11.9);
        draw(C.rule); doc.setLineWidth(0.25); doc.line(M, 15, W - M, 15);
      }
      draw(C.rule); doc.setLineWidth(0.25); doc.line(M, H - 14, W - M, H - 14);
      font(BODY, 'normal', 7, C.muted);
      doc.text('Compliance365  ·  compliance365.com.au', M, H - 9);
      var pg = 'Page ' + p + ' of ' + pages; doc.text(pg, W - M - doc.getTextWidth(pg), H - 9);
      var conf = 'Prepared for ' + org; doc.text(conf, W / 2 - doc.getTextWidth(conf) / 2, H - 9);
    }
    doc.save(d.fileStem + (org.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'report') + '.pdf');
  }
})();
