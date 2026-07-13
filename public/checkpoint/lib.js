/* Pure, dependency-free scoring/threshold logic shared between app.js
   (browser) and the test suite (Node's built-in test runner). Nothing in
   here touches S/Store/DOM/window — every input is a parameter — so
   behaviour can be verified in isolation without booting the app.
   Exposed as window.CheckpointLib in the browser and via module.exports
   under Node; same functions either way, never two implementations to
   keep in sync. */
(function (factory) {
  var lib = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = lib;
  if (typeof window !== 'undefined') window.CheckpointLib = lib;
})(function () {

  /* Risk severity band — used for both inherent and residual scores. */
  function band(sc) {
    return sc >= 15 ? 'Critical' : sc >= 10 ? 'High' : sc >= 5 ? 'Medium' : 'Low';
  }

  /* Residual likelihood/impact for a risk: each completed treatment
     action shaves a point off likelihood (floor 1); impact drops by one
     (floor 1) only once every linked action is done. `actions` is the
     full actions register (or any array of {id, status} objects) — the
     risk itself only stores action id references. */
  function residual(r, actions) {
    var done = r.actions.filter(function (id) {
      var a = actions.find(function (x) { return x.id === id; });
      return a && a.status === 'Done';
    }).length;
    var all = r.actions.length > 0 && done === r.actions.length;
    return { L: Math.max(1, r.L - done), I: all ? Math.max(1, r.I - 1) : r.I };
  }

  /* Posture-check contract: 'pass' | 'review' | 'fail' | 'manual' | null.
     - scored:false checks have no Graph signal at all -> always 'manual'.
     - No scan has ever run -> null (distinct from 'manual': a manual
       check is inherently unautomatable; null just means "not scanned
       yet" and could still resolve to a real result after one runs).
     - ctx.isDemo + a template-linked check: demo mode has no real Graph
       signal to flip a check from fail/review to pass, so completing
       every remediation action tied to that check's proposed risk
       simulates the same outcome a real re-scan would show.
     ctx: { lastResults: {checkId: result} | null, isDemo: bool,
            risks: [...], actions: [...] } */
  function checkResult(c, ctx) {
    if (c.scored === false) return 'manual';
    if (!ctx.lastResults) return null;
    var base = ctx.lastResults[c.id];
    if (ctx.isDemo && c.tpl) {
      var made = (ctx.risks || []).find(function (r) { return r.tpl === c.tpl; });
      if (made) {
        var allDone = made.actions.every(function (id) {
          var a = (ctx.actions || []).find(function (x) { return x.id === id; });
          return a && a.status === 'Done';
        });
        if (allDone) return 'pass';
      }
    }
    return base;
  }

  /* Overall posture score (0-100, floor 5 once any scan has run). Only
     scored:true checks feed the number — manual/unautomatable checks are
     a separate checklist and must never drag the score down just for
     being honestly flagged. A scored:true check can still come back
     'manual' for a given scan (e.g. a Secure Score check with no
     confident control-name match this time) — excluded from the
     denominator too, same reason: "we couldn't measure it" must never
     count as "it failed". checkResultFn defaults to checkResult itself;
     overridable for tests that want to stub per-check outcomes directly
     instead of building a full ctx. */
  function score(checkDefs, ctx, checkResultFn) {
    checkResultFn = checkResultFn || function (c) { return checkResult(c, ctx); };
    var scored = checkDefs.filter(function (c) { return c.scored !== false; });
    var measured = scored.filter(function (c) { return checkResultFn(c) !== 'manual'; });
    if (!measured.length) return 100;
    var pts = measured.reduce(function (sum, c) {
      var r = checkResultFn(c);
      return sum + (r === 'pass' ? 1 : r === 'review' ? 0.5 : 0);
    }, 0);
    return Math.max(5, Math.round(pts / measured.length * 100));
  }

  /* % of applicable controls marked Implemented, for a single
     framework's control rows (caller filters by fw first). */
  function readinessPct(controls) {
    var applicable = controls.filter(function (c) { return c.app; });
    var impl = applicable.filter(function (c) { return c.st === 'Implemented'; }).length;
    return applicable.length ? Math.round(impl / applicable.length * 100) : 0;
  }

  /* Suggested vendor criticality from the data-access categories ticked
     on its record (VENDOR_DATA_CATEGORIES in store.js). A suggestion,
     never an override — the practitioner can always set criticality
     themselves; this just stops "Medium by default" being the silent
     answer for a vendor holding health records. Highest-sensitivity
     category wins. */
  function suggestVendorCriticality(categories) {
    var cats = categories || [];
    var has = function (c) { return cats.indexOf(c) > -1; };
    if (has('Health information') || has('Credentials & secrets') || has('Production system access')) return 'Critical';
    if (has('Customer PII') || has('Financial / payment data')) return 'High';
    if (has('Employee data') || has('Company confidential')) return 'Medium';
    return 'Low';
  }

  /* Parses a control's "Also satisfies" map string (e.g. "SOC2 CC6.1 ·
     NIST PR.AC · DISP.16") into { fw, code } pairs pointing at internal
     framework ids and that framework's own control codes. Three token
     shapes: "FWNAME CODE" for most frameworks; a bare self-identifying
     code (DISP.n, E8.n or E8.n-MLx) for the two frameworks whose own
     code format needs no separate prefix; and a bare code with NO
     recognisable prefix at all, which continues the framework of the
     immediately preceding prefixed token in the same string — the
     shorthand this codebase uses for citing two codes from the same
     framework, e.g. "ISO27001 A.5.29 · A.5.30" is two ISO 27001 codes,
     not one ISO 27001 code plus an unresolvable second reference. A
     bare token is only treated as an external reference (e.g. "EU AI
     Act Art.9") when there's no preceding internal token to inherit
     from, or when it doesn't even look like a control-code shape. */
  function parseMapTokens(mapStr) {
    if (!mapStr) return [];
    var MAP_FW = { SOC2: 'soc2', NIST: 'nistcsf', ISO42001: 'iso42001', ISO27701: 'iso27701', ISO27001: 'iso27001' };
    var lastFw = null;
    return mapStr.split('·').map(function (s) { return s.trim(); }).filter(Boolean).map(function (tok) {
      var m = tok.match(/^(SOC2|NIST|ISO42001|ISO27701|ISO27001)\s+(.+)$/);
      if (m) { lastFw = MAP_FW[m[1]]; return { fw: lastFw, code: m[2] }; }
      if (/^DISP\.\d+/.test(tok)) { lastFw = 'dispirap'; return { fw: 'dispirap', code: tok }; }
      if (/^E8\.\d+/.test(tok)) { lastFw = 'essential8'; return { fw: 'essential8', code: tok }; }
      if (lastFw && /^[A-Za-z]{1,4}\.?\d/.test(tok)) return { fw: lastFw, code: tok };
      lastFw = null; /* prose like "EU AI Act Art.9" resets the chain */
      return null;
    }).filter(Boolean);
  }

  /* Deterministic per-control "theme" key for the Control Constellation
     view — grouping is derived purely from the control code's own
     string shape, never from a `cat`/`domain` field, because live
     S.controls rows (SharePoint-backed) don't persist one. Every
     framework's code format is documented at each seed site (see
     store.js's ISO 27001 seed and the checkpoint-content/*.json packs
     for the others): ISO 27001/42001/27701 codes are dot-segmented
     (e.g. "A.5.29", "AI.3.2", "P.7.2.8") and the first two segments are
     the theme; SOC 2 codes are a letter prefix + number run together
     (e.g. "CC6.1", "A1.2", "PI1.3") so the leading letters are the
     theme; Essential Eight codes share a "<strategy>-MLx" suffix
     pattern, so splitting on "-" gives the parent strategy; NIST CSF
     codes are "FUNCTION.CATEGORY" (e.g. "GV.OC", "PR.AA") and the
     function (first segment) is the theme; DISP/IRAP codes ("DISP.n")
     have no further sub-structure in this app, so every control
     shares one flat theme. */
  function constellationTheme(fw, code) {
    code = String(code || '');
    if (fw === 'iso27001' || fw === 'iso42001' || fw === 'iso27701') {
      var segs = code.split('.');
      return segs.length > 1 ? segs.slice(0, 2).join('.') : (code || fw);
    }
    if (fw === 'soc2') {
      var m = code.match(/^[A-Za-z]+/);
      return m ? m[0] : (code || fw);
    }
    if (fw === 'essential8') return code.split('-')[0] || fw;
    if (fw === 'nistcsf') return code.split('.')[0] || fw;
    return fw;
  }

  /* Edge list for the Control Constellation: cross-references a
     control's own `map` field (via parseMapTokens above) against the
     set of nodes actually present, so an edge only ever exists when
     BOTH endpoints are real, currently-rendered controls. `nodes` is
     an array of {fw, id, map} (any extra fields are ignored). Returns
     deduped, unordered-pair edges {a, b} where a/b are "fw|id" keys
     with a < b, so the same relationship is never emitted twice even
     if both controls happen to cite each other. */
  function constellationEdges(nodes) {
    var present = {};
    (nodes || []).forEach(function (n) { present[n.fw + '|' + n.id] = true; });
    var seen = {};
    var edges = [];
    (nodes || []).forEach(function (n) {
      var aKey = n.fw + '|' + n.id;
      parseMapTokens(n.map).forEach(function (tok) {
        var bKey = tok.fw + '|' + tok.code;
        if (bKey === aKey || !present[bKey]) return;
        var lo = aKey < bKey ? aKey : bKey;
        var hi = aKey < bKey ? bKey : aKey;
        var pairKey = lo + '' + hi;
        if (seen[pairKey]) return;
        seen[pairKey] = true;
        edges.push({ a: lo, b: hi });
      });
    });
    return edges;
  }

  /* Deterministic radial-by-framework layout for the Control
     Constellation — no physics simulation, no iterative relaxation:
     every position is computed once, straight from each control's own
     framework/theme/code, so the same node set always lands in the
     same place. The circle is divided into one angular sector per
     framework (in `fwOrder`'s order, with a fixed gap between
     sectors); each sector is then subdivided into per-theme wedges
     sized proportionally to how many of that framework's controls
     share the theme; and within a wedge, controls are laid out in
     concentric rings (a compact "polar grid", perRing ~= sqrt(count))
     rather than one long spoke, so even a 37-control theme (ISO
     27001's Organizational controls) stays inside the sector instead
     of running off the edge. `nodes` is an array of {fw, id, theme};
     returns a plain object keyed by "fw|id" -> {x, y, angle, radius}. */
  function constellationLayout(nodes, fwOrder, opts) {
    opts = opts || {};
    var cx = opts.cx != null ? opts.cx : 500;
    var cy = opts.cy != null ? opts.cy : 500;
    var innerR = opts.innerR != null ? opts.innerR : 70;
    var outerR = opts.outerR != null ? opts.outerR : 470;
    var sectorGap = opts.sectorGap != null ? opts.sectorGap : 0.05;
    var positions = {};
    var fws = (fwOrder || []).filter(function (fw) {
      return (nodes || []).some(function (n) { return n.fw === fw; });
    });
    var n = fws.length;
    if (!n) return positions;
    var sectorSpan = (2 * Math.PI - sectorGap * n) / n;
    fws.forEach(function (fw, fi) {
      var sectorStart = fi * (sectorSpan + sectorGap) - Math.PI / 2;
      var fwNodes = nodes.filter(function (nd) { return nd.fw === fw; })
        .slice().sort(function (a, b) { return a.id < b.id ? -1 : a.id > b.id ? 1 : 0; });
      var themeMap = {};
      fwNodes.forEach(function (nd) { (themeMap[nd.theme] = themeMap[nd.theme] || []).push(nd); });
      var themeKeys = Object.keys(themeMap).sort();
      var total = fwNodes.length;
      var cursor = sectorStart;
      themeKeys.forEach(function (theme) {
        var group = themeMap[theme];
        var wedgeSpan = sectorSpan * (group.length / total);
        var wedgeStart = cursor;
        cursor += wedgeSpan;
        var gn = group.length;
        var perRing = Math.max(1, Math.ceil(Math.sqrt(gn)));
        var numRings = Math.ceil(gn / perRing);
        var ringStep = numRings > 1 ? (outerR - innerR) / numRings : 0;
        group.forEach(function (nd, i) {
          var ring = Math.floor(i / perRing);
          var ringStartIdx = ring * perRing;
          var ringCount = Math.min(perRing, gn - ringStartIdx);
          var idxInRing = i - ringStartIdx;
          var angle = wedgeStart + ((idxInRing + 0.5) / ringCount) * wedgeSpan;
          var radius = numRings > 1 ? innerR + ring * ringStep : (innerR + outerR) / 2;
          positions[nd.fw + '|' + nd.id] = {
            x: cx + radius * Math.cos(angle),
            y: cy + radius * Math.sin(angle),
            angle: angle,
            radius: radius,
            theme: theme
          };
        });
      });
    });
    return positions;
  }

  /* Groups applicable-control rows into concentric "rings" for the
     Compliance Fingerprint — one ring per theme (reuses whatever theme
     key the caller attaches to each row, typically constellationTheme()
     above), each ring's completion % = implemented/total within that
     theme. `rows`: [{ theme, implemented: bool, evidenced: bool }].
     Pure aggregation — the caller decides what counts as "applicable"
     before calling this, same division of responsibility as
     readinessPct() elsewhere in this file. */
  function fingerprintFromRows(rows) {
    rows = Array.isArray(rows) ? rows : [];
    var themeMap = {};
    rows.forEach(function (r) {
      var key = r.theme || '—';
      (themeMap[key] = themeMap[key] || []).push(r);
    });
    var rings = Object.keys(themeMap).sort().map(function (theme) {
      var arr = themeMap[theme];
      var implemented = arr.filter(function (r) { return !!r.implemented; }).length;
      return { key: theme, label: theme, total: arr.length, implemented: implemented, pct: arr.length ? Math.round(implemented / arr.length * 100) : 0 };
    });
    var total = rows.length;
    var implementedTotal = rows.filter(function (r) { return !!r.implemented; }).length;
    var evidencedTotal = rows.filter(function (r) { return !!r.evidenced; }).length;
    return {
      rings: rings,
      total: total,
      centerPct: total ? Math.round(implementedTotal / total * 100) : 0,
      evidencePct: total ? Math.round(evidencedTotal / total * 100) : 0
    };
  }

  /* The Certification Journey's projected audit-ready date — the one
     number in this file that gets quoted to a board, so it is
     deliberately conservative and honest rather than clever:
       - `events`: one ISO date per control the moment it became
         Implemented (from the audit log's "Control status changed"
         entries, deduped to each control's most recent transition, or
         its LastVerified date as a fallback — the caller's job, this
         function only ever sees plain date strings).
       - Velocity is measured ONLY inside the trailing 8-week window
         ending `today` — a control implemented 4 months ago says
         nothing about whether the team is still moving, so it must
         not prop up a stalled team's projection.
       - Under 3 weeks of history, or zero velocity in that window,
         returns 'insufficient-history' — never a fabricated date.
       - The projection is a straight line (remaining controls ÷
         weekly velocity), clamped at 10 years out so a near-zero
         velocity can't produce an absurd or Date-overflowing result;
         still returned as a real (if distant) projected date, not a
         second "insufficient" excuse — a slow team deserves an honest
         "years away" over a hidden number. */
  function remediationVelocityProjection(opts) {
    opts = opts || {};
    var today = opts.today;
    var todayMs = Date.parse(today);
    var applicableTotal = Math.max(0, Math.round(Number(opts.applicableTotal) || 0));
    var implementedNow = Math.max(0, Math.min(applicableTotal, Math.round(Number(opts.implementedNow) || 0)));
    var remaining = applicableTotal - implementedNow;
    if (!isFinite(todayMs)) return { status: 'insufficient-history' };
    if (remaining <= 0) return { status: 'complete' };

    var events = (opts.events || [])
      .map(function (e) { return Date.parse(e); })
      .filter(function (ms) { return isFinite(ms) && ms <= todayMs; })
      .sort(function (a, b) { return a - b; });
    if (!events.length) return { status: 'insufficient-history' };

    var DAY_MS = 86400000, WEEK_DAYS = 7, WINDOW_WEEKS = 8;
    var historyDays = (todayMs - events[0]) / DAY_MS;
    if (historyDays < WEEK_DAYS * 3) return { status: 'insufficient-history' };

    var windowStartMs = todayMs - WINDOW_WEEKS * WEEK_DAYS * DAY_MS;
    var windowEvents = events.filter(function (ms) { return ms >= windowStartMs; });
    var windowSpanDays = Math.min(WINDOW_WEEKS * WEEK_DAYS, historyDays);
    var velocityPerWeek = windowSpanDays > 0 ? windowEvents.length / (windowSpanDays / WEEK_DAYS) : 0;
    if (velocityPerWeek <= 0) return { status: 'insufficient-history' };

    var MAX_WEEKS = 520; /* 10-year clamp — see header comment */
    var weeksNeeded = Math.min(MAX_WEEKS, remaining / velocityPerWeek);
    var projectedMs = todayMs + weeksNeeded * WEEK_DAYS * DAY_MS;
    return {
      status: 'projected',
      date: new Date(projectedMs).toISOString().slice(0, 10),
      clamped: remaining / velocityPerWeek > MAX_WEEKS,
      velocityPerWeek: Math.round(velocityPerWeek * 100) / 100,
      weeksNeeded: Math.round(weeksNeeded * 10) / 10,
      remaining: remaining
    };
  }

  /* Buckets a flat list of activity events into `weeks` trailing 7-day
     windows ending `todayIso`, for the Assurance Pulse grid. `events`:
     [{ date: isoDate, type: 'scan'|'evidence'|'attestation'|'review'|
     'audit' }] — the caller (app.js) is responsible for turning
     S.scans/S.auditLog/S.reviews/S.audits into this flat shape; this
     function only ever aggregates. Bucket 0 is the OLDEST week, bucket
     `weeks-1` is the most recent (ending today) — left-to-right reads
     oldest-to-newest, matching how the grid renders. An event whose
     date can't be parsed, or falls outside the window, or carries an
     unrecognised type, is silently dropped rather than mis-bucketed —
     same "degrade safely, never throw" posture as the rest of this
     file's caller-data functions. */
  function weeklyActivityGrid(events, weeks, todayIso) {
    weeks = weeks > 0 ? Math.round(weeks) : 26;
    var todayMs = Date.parse(todayIso);
    var DAY_MS = 86400000, WEEK_MS = 7 * DAY_MS;
    var TYPES = ['scan', 'evidence', 'attestation', 'review', 'audit'];
    var buckets = [];
    for (var w = 0; w < weeks; w++) {
      var weeksAgo = weeks - 1 - w;
      var endMs = isFinite(todayMs) ? todayMs - weeksAgo * WEEK_MS : NaN;
      var startMs = endMs - WEEK_MS + DAY_MS;
      var counts = {};
      TYPES.forEach(function (t) { counts[t] = 0; });
      buckets.push({
        weekIndex: w,
        start: isFinite(startMs) ? new Date(startMs).toISOString().slice(0, 10) : null,
        end: isFinite(endMs) ? new Date(endMs).toISOString().slice(0, 10) : null,
        counts: counts,
        total: 0
      });
    }
    if (!isFinite(todayMs)) return buckets;
    (events || []).forEach(function (e) {
      if (!e) return;
      var ms = Date.parse(e.date);
      if (!isFinite(ms) || ms > todayMs) return;
      var weeksAgo = Math.floor((todayMs - ms) / WEEK_MS);
      var idx = weeks - 1 - weeksAgo;
      if (idx < 0 || idx >= weeks) return;
      if (TYPES.indexOf(e.type) === -1) return;
      buckets[idx].counts[e.type]++;
      buckets[idx].total++;
    });
    return buckets;
  }

  /* A single risk bubble's deterministic position for the Risk
     Landscape — seeded by the risk's own id (never Math.random()), so
     the same risk always lands in the same spot within its L×I cell
     (small jitter only, to separate risks that share a cell) and a
     "previous quarter" trail point computed with the risk's OLD L/I
     via this same function lines up with its current bubble's jitter
     automatically, since both calls hash the same id. */
  function riskBubblePoint(id, L, I, opts) {
    opts = opts || {};
    var size = opts.size != null ? opts.size : 300;
    var margin = opts.margin != null ? opts.margin : 30;
    var cell = (size - 2 * margin) / 5;
    L = Math.max(1, Math.min(5, Math.round(Number(L) || 1)));
    I = Math.max(1, Math.min(5, Math.round(Number(I) || 1)));
    function hash(s) {
      var h = 0;
      s = String(s);
      for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
      return h >>> 0;
    }
    function unit(h) { return (h % 1000) / 1000; } /* deterministic 0..1 */
    var jx = (unit(hash(id + '|x')) - 0.5) * cell * 0.55;
    var jy = (unit(hash(id + '|y')) - 0.5) * cell * 0.55;
    return {
      x: Math.round((margin + (L - 0.5) * cell + jx) * 100) / 100,
      y: Math.round((size - margin - (I - 0.5) * cell + jy) * 100) / 100,
      L: L, I: I
    };
  }

  /* Full bubble layout for the Risk Landscape: every risk over
     `opts.maxIndividual` (default 50) — the busiest tenants can have
     more open risks than a field can show as distinct, clickable
     bubbles — is dropped from individual layout and rolled into
     `overflowCount` instead, so the caller can render a single "+N"
     cluster badge rather than either crashing or drawing 200
     unreadable overlapping circles. The most severe risks (by residual
     score) are always the ones kept individual. `risks`: [{ id, L, I }]
     (residual L/I — the caller computes residual() before calling
     this, same division of responsibility as fingerprintFromRows()). */
  function riskBubbleLayout(risks, opts) {
    opts = opts || {};
    var maxIndividual = opts.maxIndividual != null ? opts.maxIndividual : 50;
    var minR = opts.minR != null ? opts.minR : 6;
    var maxR = opts.maxR != null ? opts.maxR : 22;
    risks = Array.isArray(risks) ? risks : [];
    var sorted = risks.slice().sort(function (a, b) {
      var sa = (Number(a.L) || 0) * (Number(a.I) || 0), sb = (Number(b.L) || 0) * (Number(b.I) || 0);
      return sb - sa || String(a.id).localeCompare(String(b.id));
    });
    var shown = sorted.slice(0, maxIndividual);
    var overflow = sorted.slice(maxIndividual);
    var bubbles = shown.map(function (r) {
      var p = riskBubblePoint(r.id, r.L, r.I, opts);
      var score = p.L * p.I;
      var radius = minR + (maxR - minR) * Math.sqrt(score / 25);
      return { id: r.id, x: p.x, y: p.y, r: Math.round(radius * 100) / 100, L: p.L, I: p.I, score: score, band: band(score) };
    });
    return { bubbles: bubbles, overflowCount: overflow.length, size: opts.size != null ? opts.size : 300, margin: opts.margin != null ? opts.margin : 30 };
  }

  /* WCAG relative-luminance/contrast-ratio primitives — used to pick a
     readable text color for the residual risk heatmap's cells, whose
     background is a severity hue alpha-blended over whichever theme
     (dark ink or light paper) is currently showing through. A fixed
     per-severity text color (the old approach) can't be right for
     both: the same "Critical" cell is mostly background at low risk
     counts and mostly the saturated hue at high counts, and dark vs
     light theme flips which end of that range needs light vs dark
     text. Computing it from the actual composited color is the only
     way to stay correct across every theme × alpha combination. */
  function relLuminance(rgb) {
    var a = rgb.map(function (v) {
      v = Math.max(0, Math.min(255, Number(v) || 0)) / 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
  }
  function contrastRatio(rgbA, rgbB) {
    var lA = relLuminance(rgbA), lB = relLuminance(rgbB);
    var lighter = Math.max(lA, lB), darker = Math.min(lA, lB);
    return (lighter + 0.05) / (darker + 0.05);
  }
  /* Alpha-composites `fgRgb` over `bgRgb` (both [r,g,b], 0-255) — the
     same math the browser does for `rgba()`, just resolved in JS so a
     resulting solid color can be contrast-checked. */
  function compositeOverBg(fgRgb, alpha, bgRgb) {
    alpha = Math.max(0, Math.min(1, Number(alpha) || 0));
    return [0, 1, 2].map(function (i) { return fgRgb[i] * alpha + bgRgb[i] * (1 - alpha); });
  }
  /* Picks whichever of `lightRgb`/`darkRgb` has the higher contrast
     against `bgRgb` — the standard "auto" readable-text-color
     technique, resolved via real contrast math rather than a
     luminance-midpoint guess (which mis-picks for saturated hues where
     perceived vs. measured brightness diverge). Ties (a bg exactly as
     readable either way) favor `darkRgb`. */
  function pickReadableRgb(bgRgb, lightRgb, darkRgb) {
    var lightContrast = contrastRatio(lightRgb, bgRgb);
    var darkContrast = contrastRatio(darkRgb, bgRgb);
    return darkContrast >= lightContrast ? darkRgb : lightRgb;
  }

  /* ============================================================
     Financial risk quantification — Monte Carlo simulation over the
     existing ordinal risk register (Likelihood × Impact, 1-5), so a
     board sees a simulated annual-loss distribution instead of just
     "High" or "12". Nothing here needs a new data-entry field: every
     input is derived from a risk's own residual L/I via a documented,
     overridable mapping (RISK_FINANCIAL_BANDS below) — the whole point
     is that this runs automatically, with no separate FAIR-style
     interview per risk required before it's useful.

     Deliberately simple, named distributions rather than a full FAIR/
     Beta-PERT model: a TRIANGULAR distribution for loss magnitude and
     event frequency (closed-form inverse CDF — exact, fast, and a
     standard, industry-accepted stand-in for PERT in lightweight
     quantitative risk tools — see Hubbard, "How to Measure Anything in
     Cybersecurity Risk"), and a POISSON count of loss events per
     trial-year driven by that trial's sampled frequency. This is an
     order-of-magnitude planning tool, not a certified actuarial model
     — every UI surface that shows its output says so.

     Determinism: real use always seeds from crypto/Date-derived
     entropy (the caller's job — this file never calls Math.random()
     itself, so every function here stays a pure, seed-in/numbers-out
     function safe to unit-test bit-for-bit). mulberry32() is the
     seeded PRNG used both by production (seeded fresh per run) and by
     tests (a fixed seed reproduces an exact trial sequence). */
  function mulberry32(seed) {
    var state = seed >>> 0;
    return function () {
      state = (state + 0x6D2B79F5) | 0;
      var t = Math.imul(state ^ (state >>> 15), 1 | state);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* Samples a triangular(min, likely, max) distribution given a
     uniform draw `u` in [0,1) — the standard closed-form inverse CDF,
     so the same `u` always yields the same, hand-verifiable sample.
     Degenerates to a point mass at `min` if max<=min (a risk with no
     real range given). */
  function sampleTriangular(min, likely, max, u) {
    min = Number(min) || 0; max = Number(max) || 0; likely = Number(likely) || 0;
    if (max <= min) return min;
    likely = Math.max(min, Math.min(max, likely));
    var c = (likely - min) / (max - min);
    if (u < c) return min + Math.sqrt(u * (max - min) * (likely - min));
    return max - Math.sqrt((1 - u) * (max - min) * (max - likely));
  }

  /* Knuth's algorithm for a Poisson(lambda) draw, given a `rand()`
     source of uniform [0,1) draws — the number of independent events
     in one trial-year at that trial's own sampled frequency. lambda<=0
     always returns 0 (a year with an effectively-zero event rate has
     no loss events, not a negative or fractional one). */
  function samplePoisson(lambda, rand) {
    lambda = Number(lambda) || 0;
    if (lambda <= 0) return 0;
    var L = Math.exp(-lambda), k = 0, p = 1;
    do { k++; p *= rand(); } while (p > L);
    return k - 1;
  }

  /* The only assumption this whole feature makes: illustrative loss-
     magnitude (USD) and annual-event-frequency ranges per residual L/I
     score, min/likely/max for each of the 5 ordinal levels. These are
     starting points, not measured data — deliberately documented and
     exported so the UI can show them next to every result, and so a
     tenant with real loss history or actuarial data can override
     specific risks rather than trusting the illustrative default. */
  var RISK_FINANCIAL_BANDS = {
    lossUsd: {
      1: { min: 1000, likely: 5000, max: 15000 },
      2: { min: 5000, likely: 20000, max: 60000 },
      3: { min: 20000, likely: 75000, max: 250000 },
      4: { min: 75000, likely: 300000, max: 1000000 },
      5: { min: 300000, likely: 1200000, max: 5000000 }
    },
    eventsPerYear: {
      1: { min: 0.05, likely: 0.1, max: 0.3 },
      2: { min: 0.1, likely: 0.3, max: 0.8 },
      3: { min: 0.3, likely: 0.8, max: 2 },
      4: { min: 0.8, likely: 2, max: 5 },
      5: { min: 2, likely: 5, max: 12 }
    }
  };

  /* One risk's default financial inputs, derived from its own L
     (frequency) and I (loss magnitude) — clamped into 1..5 so an out-
     of-range or missing score never throws. `overrides` (optional)
     lets a caller substitute a risk-specific {lossMin,lossLikely,
     lossMax,freqMin,freqLikely,freqMax} for any subset of these
     fields, without needing a full alternate code path. */
  function riskFinancialInputs(L, I, overrides) {
    overrides = overrides || {};
    var li = Math.max(1, Math.min(5, Math.round(Number(L) || 1)));
    var ii = Math.max(1, Math.min(5, Math.round(Number(I) || 1)));
    var freq = RISK_FINANCIAL_BANDS.eventsPerYear[li];
    var loss = RISK_FINANCIAL_BANDS.lossUsd[ii];
    return {
      freqMin: overrides.freqMin != null ? overrides.freqMin : freq.min,
      freqLikely: overrides.freqLikely != null ? overrides.freqLikely : freq.likely,
      freqMax: overrides.freqMax != null ? overrides.freqMax : freq.max,
      lossMin: overrides.lossMin != null ? overrides.lossMin : loss.min,
      lossLikely: overrides.lossLikely != null ? overrides.lossLikely : loss.likely,
      lossMax: overrides.lossMax != null ? overrides.lossMax : loss.max
    };
  }

  /* Runs `trials` Monte Carlo years for one risk: each trial samples a
     frequency from the triangular(freqMin,freqLikely,freqMax) range,
     draws a Poisson-distributed count of loss events at that sampled
     rate, then sums a fresh triangular(lossMin,lossLikely,lossMax)
     draw per event — so a trial with 3 events sums 3 independent loss
     draws, not one draw multiplied by 3 (a materially different, more
     realistic tail: many small years and occasional very bad ones,
     rather than a smooth scaling of the "average" year). Returns the
     plain array of `trials` annual-loss totals — summarize with
     summarizeLossDistribution() below. */
  function simulateRiskLosses(inputs, trials, seed) {
    trials = Math.max(1, Math.round(Number(trials) || 1000));
    var rand = mulberry32(seed >>> 0);
    var losses = new Array(trials);
    for (var t = 0; t < trials; t++) {
      var freq = sampleTriangular(inputs.freqMin, inputs.freqLikely, inputs.freqMax, rand());
      var events = samplePoisson(freq, rand);
      var total = 0;
      for (var e = 0; e < events; e++) total += sampleTriangular(inputs.lossMin, inputs.lossLikely, inputs.lossMax, rand());
      losses[t] = total;
    }
    return losses;
  }

  /* Runs the whole open-risk portfolio in one pass and returns both
     each risk's own loss array AND the portfolio total per trial (the
     same trial index summed across every risk) — the portfolio total
     is NOT the sum of each risk's independent percentiles (percentiles
     don't add), it has to be simulated jointly, trial by trial, which
     is exactly what this does. `risks`: [{ id, L, I, overrides? }].
     Each risk gets its own seed (derived from the portfolio seed + its
     index) so risks don't share a draw sequence and accidentally
     correlate. */
  function simulatePortfolioLosses(risks, trials, seed) {
    risks = Array.isArray(risks) ? risks : [];
    trials = Math.max(1, Math.round(Number(trials) || 1000));
    var baseSeed = (Number(seed) || 0) >>> 0;
    var portfolioTotals = new Array(trials).fill(0);
    var perRisk = risks.map(function (r, i) {
      var inputs = riskFinancialInputs(r.L, r.I, r.overrides);
      var losses = simulateRiskLosses(inputs, trials, (baseSeed + (i + 1) * 2654435761) >>> 0);
      for (var t = 0; t < trials; t++) portfolioTotals[t] += losses[t];
      return { id: r.id, inputs: inputs, losses: losses };
    });
    return { perRisk: perRisk, portfolioTotals: portfolioTotals };
  }

  /* Summary statistics for one array of simulated annual-loss trials —
     mean (the textbook Annualized Loss Expectancy), median, and the
     percentiles a board actually asks for (P90/P95/P99 — "how bad is
     the bad-but-plausible year"). Percentiles use the nearest-rank
     method (sorted array, index = round(p*(n-1))) rather than
     interpolation — simpler, and exact for the trial counts this
     feature runs at (1,000+). */
  function summarizeLossDistribution(losses) {
    losses = Array.isArray(losses) ? losses : [];
    var n = losses.length;
    if (!n) return { mean: 0, median: 0, p10: 0, p90: 0, p95: 0, p99: 0, min: 0, max: 0, count: 0 };
    var sorted = losses.slice().sort(function (a, b) { return a - b; });
    function pct(p) { return sorted[Math.max(0, Math.min(n - 1, Math.round(p * (n - 1))))]; }
    var sum = 0;
    for (var i = 0; i < n; i++) sum += sorted[i];
    return {
      mean: sum / n, median: pct(0.5), p10: pct(0.1), p90: pct(0.9), p95: pct(0.95), p99: pct(0.99),
      min: sorted[0], max: sorted[n - 1], count: n
    };
  }

  /* Loss exceedance curve — P(annual loss > x) at each of `points`
   x-values evenly spaced from 0 to the trial set's own max (so the
   curve always spans its real data range, never an arbitrarily-guessed
   axis). This is the standard FAIR/quantitative-risk chart: the
   further right a given probability holds, the fatter the tail. */
  function lossExceedanceCurve(losses, points) {
    losses = Array.isArray(losses) ? losses : [];
    points = Math.max(2, Math.round(Number(points) || 40));
    var n = losses.length;
    if (!n) return [];
    var max = losses.reduce(function (m, v) { return Math.max(m, v); }, 0);
    if (max <= 0) return [{ x: 0, p: 0 }];
    var sorted = losses.slice().sort(function (a, b) { return a - b; });
    function exceedanceProb(x) {
      // count of losses > x, via binary search on the sorted array (upper bound)
      var lo = 0, hi = n;
      while (lo < hi) { var mid = (lo + hi) >> 1; if (sorted[mid] <= x) lo = mid + 1; else hi = mid; }
      return (n - lo) / n;
    }
    var curve = [];
    for (var i = 0; i < points; i++) {
      var x = (max / (points - 1)) * i;
      curve.push({ x: x, p: exceedanceProb(x) });
    }
    return curve;
  }

  /* RFC 4182-ish CSV serialisation for a client-side export — `rows` is
     an array of arrays (row 0 conventionally the header), each cell
     coerced to a string. A cell is quoted only when it contains a
     comma, quote or newline (quotes doubled inside); everything else is
     written bare, matching how Excel/Numbers/Google Sheets round-trip
     a CSV. CRLF line endings throughout, since that's what every major
     spreadsheet app expects from a CSV regardless of platform. No BOM
     here — that's an output-encoding concern for whatever wraps this
     string in a Blob, not part of "build correct CSV text". */
  function toCsv(rows) {
    function cell(v) {
      var s = v == null ? '' : String(v);
      return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    }
    return rows.map(function (row) { return row.map(cell).join(','); }).join('\r\n');
  }

  /* Minimal ZIP writer — STORE method (no compression), no external
     dependency. Just enough of PKZIP's format to produce a file every
     major unzip tool (Windows Explorer, macOS Archive Utility, 7-Zip,
     Python's zipfile) opens correctly: a local file header + raw bytes
     per entry, a central directory, and the end-of-central-directory
     record. `files` is an array of {name, content} (content: a string,
     UTF-8 encoded here); returns a Uint8Array, not a Blob — wrapping it
     in one is a DOM/window concern for whatever downloads it, kept out
     of this dependency-free module same as everywhere else in this
     file. `date` (optional, defaults to now) sets every entry's
     modified-time field — exposed as a parameter purely so tests can
     pass a fixed date instead of asserting against the clock. */
  var CRC_TABLE = (function () {
    var t = [];
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c >>> 0;
    }
    return t;
  })();
  function crc32(bytes) {
    var c = 0xFFFFFFFF;
    for (var i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }
  function u16(v) { return [v & 0xFF, (v >>> 8) & 0xFF]; }
  function u32(v) { return [v & 0xFF, (v >>> 8) & 0xFF, (v >>> 16) & 0xFF, (v >>> 24) & 0xFF]; }
  function dosDateTime(d) {
    return {
      time: ((d.getHours() & 0x1F) << 11) | ((d.getMinutes() & 0x3F) << 5) | (Math.floor(d.getSeconds() / 2) & 0x1F),
      date: (((Math.max(0, d.getFullYear() - 1980)) & 0x7F) << 9) | (((d.getMonth() + 1) & 0xF) << 5) | (d.getDate() & 0x1F)
    };
  }
  function buildZip(files, date) {
    var dt = dosDateTime(date || new Date());
    var enc = new TextEncoder();
    var localEntries = [], centralEntries = [], offset = 0;
    files.forEach(function (f) {
      var nameBytes = Array.from(enc.encode(f.name));
      var dataBytes = Array.from(enc.encode(f.content));
      var crc = crc32(dataBytes);
      var local = [].concat(
        u32(0x04034b50), u16(20), u16(0), u16(0), u16(dt.time), u16(dt.date),
        u32(crc), u32(dataBytes.length), u32(dataBytes.length),
        u16(nameBytes.length), u16(0), nameBytes, dataBytes
      );
      localEntries.push(local);
      centralEntries.push([].concat(
        u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(dt.time), u16(dt.date),
        u32(crc), u32(dataBytes.length), u32(dataBytes.length),
        u16(nameBytes.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset), nameBytes
      ));
      offset += local.length;
    });
    var centralBytes = [].concat.apply([], centralEntries);
    var eocd = [].concat(
      u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length),
      u32(centralBytes.length), u32(offset), u16(0)
    );
    return Uint8Array.from([].concat.apply([], localEntries).concat(centralBytes, eocd));
  }

  /* ==========================================================
     Signed entitlement files — verification logic shared between the
     browser (app.js, via window.crypto.subtle) and tools/issue-
     entitlement.mjs (Node, via require('node:crypto').webcrypto.subtle)
     AND the test suite, so "what bytes get signed" and "what bytes get
     verified" can never silently drift apart between the CLI that
     issues a file and the app that checks it — the single real risk in
     any signed-artifact scheme. SubtleCrypto itself is passed in as a
     parameter rather than referenced globally, since neither this file
     nor its Node caller should assume which global (window.crypto vs.
     require('node:crypto').webcrypto) is present. */

  /* Deterministic JSON — sorts object keys recursively so the exact
     same payload always serialises to the exact same bytes regardless
     of property insertion order, which is what both the signer and the
     verifier must sign/check over. Not a general canonical-JSON
     implementation (no float/whitespace edge cases to handle — every
     entitlement field is a string or an array of strings), just enough
     determinism for this one artifact shape. */
  function canonicalJson(v) {
    if (Array.isArray(v)) return '[' + v.map(canonicalJson).join(',') + ']';
    if (v && typeof v === 'object') {
      return '{' + Object.keys(v).sort().map(function (k) { return JSON.stringify(k) + ':' + canonicalJson(v[k]); }).join(',') + '}';
    }
    return JSON.stringify(v);
  }

  function base64ToBytes(b64) {
    if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(b64, 'base64'));
    var bin = atob(b64), bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }
  function bytesToBase64(bytes) {
    if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64');
    var bin = '';
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  }

  /* Verifies an entitlement file's Ed25519 signature over its own
     canonicalised payload. Returns true/false — never throws for a
     malformed signature/key (WebCrypto's own verify() already resolves
     false rather than rejecting for a bad signature; a genuinely
     malformed base64/key still rejects, left to the caller to catch,
     since that's an "this file is garbage" case worth surfacing
     distinctly from "this file is tampered"). */
  async function verifyEntitlementSignature(subtle, publicKeyBase64, payload, signatureBase64) {
    var key = await subtle.importKey('raw', base64ToBytes(publicKeyBase64), { name: 'Ed25519' }, false, ['verify']);
    var data = new TextEncoder().encode(canonicalJson(payload));
    return subtle.verify('Ed25519', key, base64ToBytes(signatureBase64), data);
  }

  /* Signs a payload with an Ed25519 private CryptoKey — the CLI-side
     counterpart to verifyEntitlementSignature(), kept here so signing
     and verifying share the exact same canonicalJson() call. Returns
     the signature as base64. */
  async function signEntitlementPayload(subtle, privateKey, payload) {
    var data = new TextEncoder().encode(canonicalJson(payload));
    var sig = await subtle.sign('Ed25519', privateKey, data);
    return bytesToBase64(new Uint8Array(sig));
  }

  /* Adds `days` calendar days to a YYYY-MM-DD string, in UTC, with no
     dependency on the ambient clock (the date to add to is always a
     parameter). Used to compute a grace-period cutoff, and (in
     tools/issue-entitlement.mjs) a demo activation's default 30-day
     expiry. */
  function addDaysToDateStr(dateStr, days) {
    var d = new Date(dateStr + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  }

  /* Whole calendar days from one YYYY-MM-DD string to another, UTC,
     no ambient clock dependency — negative once `to` is in the past
     relative to `from`. Used only for the "Trial — N days remaining"
     banner a demo-type activation shows while still valid. */
  function daysBetweenDateStr(from, to) {
    var a = new Date(from + 'T00:00:00Z'), b = new Date(to + 'T00:00:00Z');
    return Math.round((b - a) / 86400000);
  }

  var ENTITLEMENT_TYPES = ['client', 'partner', 'demo'];
  /* payload.type didn't exist before this feature — every activation
     issued earlier has no `type` field at all, and must keep behaving
     exactly as it always did. Normalising an absent/unrecognised value
     to 'client' (today's only behaviour) is what makes that backward
     compatible, rather than a validation error breaking every
     already-issued file the moment this ships. */
  function normalizeEntitlementType(t) {
    return ENTITLEMENT_TYPES.indexOf(t) === -1 ? 'client' : t;
  }

  /* Business-rule evaluation of an ALREADY signature-verified payload —
     tenant match, expiry and grace period — kept separate from the
     crypto step so it stays synchronous and trivially testable. `now`
     is a YYYY-MM-DD string parameter (never Date.now()/new Date()
     internally) so a test can assert against a fixed date instead of
     the real clock.

     `acceptTenantIds` accepts either a single string or an array —
     this activation now licenses the whole app (not just which
     framework toggles are on), and a client's own tenant identity can
     legitimately be presented to us as either their Entra tenant ID
     (a GUID) or one of their verified domains, so the caller passes
     every identifier this signed-in tenant answers to and a match on
     ANY of them (case-insensitive) counts as a match. No match at all
     -> 'mismatch', frameworks empty, regardless of expiry.

     Three post-match statuses:
       - 'valid'   — today is on or before payload.expiry.
       - 'grace'   — today is within payload.graceDays (default 14,
                     Compliance365's standard grace window) after
                     expiry. Still returns the full frameworks list;
                     the caller decides what "grace" means for the UI
                     (Checkpoint's app.js keeps the app fully
                     operational during grace, with a countdown
                     banner, per SETUP.md).
       - 'expired' — past the grace cutoff. Still returns the granted
                     frameworks list (never an empty one) — the caller
                     decides what to do with an expired-but-signed
                     grant (Checkpoint's app.js forces read-only rather
                     than yanking the data away — it's the client's own
                     data in their own tenant).

     `type` — 'client' | 'partner' | 'demo', normalised from
     payload.type (see normalizeEntitlementType() above). Every type
     goes through the exact same status/expiry/grace logic above —
     'partner' and 'demo' aren't a different licensing STATE machine,
     just a different issuance-time grant (see
     tools/issue-entitlement.mjs: both force every framework + module
     key; only their intended audience, --i-know requirement and
     default expiry differ) and different UI built on top elsewhere
     ('partner' unlocks the separate owner console in public/owner/; a
     "Trial — N days remaining" banner in the client app for 'demo').
     `daysRemaining` is always computed (whole calendar days from `now`
     to expiry, negative once past it) — every caller that isn't
     'demo' simply never reads it. */
  function evaluateEntitlement(payload, acceptTenantIds, now) {
    var ids = (Array.isArray(acceptTenantIds) ? acceptTenantIds : [acceptTenantIds])
      .filter(Boolean).map(function (s) { return String(s).toLowerCase(); });
    var payloadId = payload && payload.tenantId ? String(payload.tenantId).toLowerCase() : '';
    if (!payload || !payloadId || ids.indexOf(payloadId) === -1) {
      return { status: 'mismatch', type: normalizeEntitlementType(payload && payload.type), frameworks: [], tenantId: payload && payload.tenantId };
    }
    var graceDays = (payload.graceDays === undefined || payload.graceDays === null) ? 14 : Number(payload.graceDays);
    var isPastExpiry = !!payload.expiry && payload.expiry < now;
    var graceUntil = payload.expiry ? addDaysToDateStr(payload.expiry, graceDays) : null;
    var status = 'valid';
    if (isPastExpiry) status = now <= graceUntil ? 'grace' : 'expired';
    return {
      status: status, type: normalizeEntitlementType(payload.type), frameworks: (payload.frameworks || []).slice(), expiry: payload.expiry,
      issuedAt: payload.issuedAt, tenantId: payload.tenantId, graceDays: graceDays,
      graceUntil: isPastExpiry ? graceUntil : null,
      daysRemaining: payload.expiry ? daysBetweenDateStr(now, payload.expiry) : null,
      /* One AES-256 key per premium module this activation grants,
         base64 raw bytes — see decryptPack() below. Passed straight
         through unmodified; this function only handles the licensing
         decision, not decryption itself. '' -> {} so callers never have
         to null-check. */
      moduleKeys: payload.moduleKeys || {}
    };
  }

  /* Picks which of zero-or-more ALREADY-VERIFIED activation candidates
     should govern this session, and which of the stores they came from
     are now stale and need to be brought in line with the winner.

     Each candidate is the caller's own record of one independent store
     (typically `{ source: 'local', raw, ok, evalResult }` for this
     browser's localStorage and `{ source: 'tenant', raw, ok,
     evalResult }` for the tenant's shared Settings-list cache) AFTER
     that store's raw text has already been run through
     verifyEntitlementSignature()+evaluateEntitlement() (async, needs
     WebCrypto — done by the caller, not here). This function itself is
     pure/sync: it only ever compares `evalResult.issuedAt` strings
     (YYYY-MM-DD, so a plain string compare sorts correctly) between
     candidates that already passed signature+tenant+expiry checks —
     never re-verifies anything, never touches storage.

     No verified candidates -> no winner, nothing to reconcile (every
     store this tenant/browser has is either empty or invalid — up to
     the caller to report that as "missing" or "rejected"). Exactly one
     verified candidate -> it wins trivially, and every OTHER store
     (empty or invalid) counts as stale so the caller can (re)populate
     it. Two or more verified candidates -> the one with the latest
     issuedAt wins; every candidate whose raw text differs from the
     winner's is reported stale (including a candidate that verified
     fine but is simply an older issuance) so the caller can mirror the
     winner over it. Byte-identical raw text across candidates is never
     reported stale, even if compared to itself, since nothing would
     change by "fixing" it. */
  function reconcileActivationSources(candidates) {
    var verified = (candidates || []).filter(function (c) { return c && c.ok; });
    if (!verified.length) return { winner: null, staleSources: [] };
    var winner = verified.slice().sort(function (a, b) {
      var ai = String((a.evalResult && a.evalResult.issuedAt) || '');
      var bi = String((b.evalResult && b.evalResult.issuedAt) || '');
      return bi.localeCompare(ai);
    })[0];
    var staleSources = verified
      .filter(function (c) { return c.raw !== winner.raw; })
      .map(function (c) { return c.source; });
    return { winner: winner, staleSources: staleSources };
  }

  /* ==========================================================
     Owner console analytics — pure functions shared between
     public/owner/owner.js (browser) and the test suite (Node), same
     "pure logic here, DOM/Graph orchestration in the caller" split as
     everything else in this file. Every function takes its inputs as
     plain parameters (a `today` YYYY-MM-DD string, never Date.now()
     internally) so a test can assert against a fixed date. ========== */

  /* Picks the single governing entitlement per tenant — the one with
     the latest issuedAt, same "later issuedAt wins" rule
     reconcileActivationSources() already uses for the two-store
     activation design. An issuance history naturally accumulates one
     row per renewal for the same tenant; only the latest one is ever
     "the" entitlement for revenue/renewal purposes — counting every
     row would double- (or triple-, or more-) count a client who has
     renewed a few times. Returns a plain { [tenantId]: entitlement }
     map, not an array, so callers never have to search it. */
  function latestEntitlementsByTenant(entitlements) {
    var byTenant = {};
    (entitlements || []).forEach(function (e) {
      if (!e || !e.tenantId) return;
      var existing = byTenant[e.tenantId];
      if (!existing || String(e.issuedAt || '').localeCompare(String(existing.issuedAt || '')) > 0) {
        byTenant[e.tenantId] = e;
      }
    });
    return byTenant;
  }

  /* Revenue math over PartnerEntitlements x PartnerPrices, as of
     `today`. `entitlements`: [{tenantId, type, modules, issuedAt,
     expiry, renewedBy}] (renewedBy: truthy once a superseding
     entitlement has been recorded against this one — see owner.js's
     "prepare renewal" flow). `prices`: { [moduleId]: annualPrice } —
     a module with no price on file contributes 0, never throws (a
     missing price is a PartnerPrices data-entry gap to fix, not a
     reason to crash the revenue board).

     Only the LATEST entitlement per tenant counts (via
     latestEntitlementsByTenant() above) — a superseded old entitlement
     contributes nothing, even if its own `expiry` hasn't technically
     passed yet, since its tenant's real current terms are whatever the
     latest entitlement says.

     'client'-type entitlements drive activeAnnualRevenue/revenueByModule
     /committedNext12Months/expiringUnrenewed/expiringIn30Days — actual
     contracted revenue. 'demo'-type entitlements drive
     trialPipelineValue only — POTENTIAL revenue if the trial converts,
     kept entirely separate so it's never double-counted as booked
     revenue. 'partner'-type entitlements (Compliance365's own) are
     never revenue and are ignored here entirely.

     committedNext12Months + expiringUnrenewed always sums to exactly
     activeAnnualRevenue — every active client entitlement falls into
     exactly one bucket: still-committed for the full next 12 months
     (>=365 days to expiry, OR already renewed) or genuinely at risk
     this year (renews within 365 days AND nothing recorded against it
     yet). expiringIn30Days is the same "at risk, not yet renewed" test
     narrowed to a 30-day window — the cash-flow number: revenue that
     lapses within the month unless someone acts on it right now. */
  function computePartnerRevenue(entitlements, prices, today) {
    prices = prices || {};
    var byTenant = latestEntitlementsByTenant((entitlements || []).filter(function (e) { return e && e.type === 'client'; }));
    var demoByTenant = latestEntitlementsByTenant((entitlements || []).filter(function (e) { return e && e.type === 'demo'; }));

    function entitlementValue(e) {
      return (e.modules || []).reduce(function (sum, m) { return sum + (Number(prices[m]) || 0); }, 0);
    }
    function isActive(e) { return !!e.expiry && e.expiry >= today; }

    var activeAnnualRevenue = 0;
    var revenueByModule = {};
    var committedNext12Months = 0;
    var expiringUnrenewed = 0;
    var expiringIn30Days = 0;

    Object.keys(byTenant).forEach(function (tenantId) {
      var e = byTenant[tenantId];
      if (!isActive(e)) return;
      var value = entitlementValue(e);
      activeAnnualRevenue += value;
      (e.modules || []).forEach(function (m) { revenueByModule[m] = (revenueByModule[m] || 0) + (Number(prices[m]) || 0); });

      var daysToExpiry = daysBetweenDateStr(today, e.expiry);
      var renewed = !!e.renewedBy;
      if (daysToExpiry >= 365 || renewed) {
        committedNext12Months += value;
      } else {
        expiringUnrenewed += value;
        if (daysToExpiry <= 30) expiringIn30Days += value;
      }
    });

    var trialPipelineValue = 0;
    Object.keys(demoByTenant).forEach(function (tenantId) {
      var e = demoByTenant[tenantId];
      if (!isActive(e)) return;
      trialPipelineValue += entitlementValue(e);
    });

    return {
      activeAnnualRevenue: activeAnnualRevenue,
      revenueByModule: revenueByModule,
      committedNext12Months: committedNext12Months,
      expiringUnrenewed: expiringUnrenewed,
      expiringIn30Days: expiringIn30Days,
      trialPipelineValue: trialPipelineValue
    };
  }

  /* "Next best module" — the unlicensed framework a client is already
     closest to being ready for, based on cross-mapped controls from
     what they've actually implemented in a framework they DO have.
     Reuses the exact same control cross-reference data the client
     app's own Control Constellation draws from (each control's
     `MapsTo` field, parsed by parseMapTokens() above) — the owner
     console never needs the full framework/control registry itself,
     just this one string per synced control row.

     `controlRows`: this client's own last-synced Controls rows,
     [{applicable, status, mapsTo}] (fw of the SOURCE control is
     irrelevant here — only where each one's MapsTo tokens point).
     `licensedModules`: framework ids this client is already licensed
     for (a target framework they already have is never a "next"
     anything). `minSample` (default 3) guards against a single stray
     cross-reference producing a misleading 100% — a target framework
     needs at least this many of the client's own applicable, mapped
     controls before it's considered at all.

     Returns { moduleId, pct, sampleSize } for the highest-percentage
     qualifying target, or null if nothing meets minSample. Ties break
     on larger sample size, then lower moduleId string, so the result
     is always deterministic. */
  function computeNextBestModule(controlRows, licensedModules, minSample) {
    minSample = minSample || 3;
    var licensed = {};
    (licensedModules || []).forEach(function (m) { licensed[m] = true; });
    var totals = {}; /* moduleId -> { total, implemented } */
    (controlRows || []).forEach(function (c) {
      if (!c || !c.applicable) return;
      parseMapTokens(c.mapsTo).forEach(function (tok) {
        if (licensed[tok.fw]) return;
        var bucket = totals[tok.fw] || (totals[tok.fw] = { total: 0, implemented: 0 });
        bucket.total++;
        if (c.status === 'Implemented') bucket.implemented++;
      });
    });
    var best = null;
    Object.keys(totals).sort().forEach(function (moduleId) {
      var bucket = totals[moduleId];
      if (bucket.total < minSample) return;
      var pct = Math.round((bucket.implemented / bucket.total) * 100);
      if (!best || pct > best.pct || (pct === best.pct && bucket.total > best.sampleSize)) {
        best = { moduleId: moduleId, pct: pct, sampleSize: bucket.total };
      }
    });
    return best;
  }

  /* Composite Red/Amber/Green health for one client, as of `today` —
     drives the Client Health Strip's sort order (worst-first) and its
     summary card ("2 clients red…"). Every rule is checked in order;
     the FIRST one that matches wins, so precedence is: never synced
     (nothing to base health on at all — 'unknown', never fabricated)
     > confirmed problems (sync error, expired activation, owner-flagged
     "At risk", drift+low score, imminent unrenewed expiry) > confirmed
     caution (dormant, mediocre score, expiry within 60 days unrenewed)
     > green. `input`: {syncError, lastSynced, lastScanDate, score,
     driftAlerts, entitlementStatus, entitlementExpiry, manualStatus}
     — every field optional/nullable; a missing one just can't trigger
     the rules that need it. Returns {color: 'red'|'amber'|'green'|
     'unknown', reason}. `color` also defines sort order via
     CLIENT_HEALTH_RANK below (unknown sorts after red/amber — it isn't
     confirmed bad, but it's less trustworthy than a confirmed green). */
  var CLIENT_HEALTH_RANK = { red: 0, amber: 1, unknown: 2, green: 3 };
  function computeClientHealth(input, today) {
    input = input || {};
    if (!input.lastSynced) return { color: 'unknown', reason: 'Never synced — no health data available' };
    if (input.syncError) return { color: 'red', reason: 'Sync error: ' + input.syncError };
    if (input.entitlementStatus === 'expired') return { color: 'red', reason: 'Activation expired' };
    if (input.manualStatus === 'At risk') return { color: 'red', reason: 'Flagged "At risk" by the owner' };
    if ((input.driftAlerts || 0) >= 1 && input.score != null && input.score < 40) {
      return { color: 'red', reason: input.driftAlerts + ' drift alert(s), score ' + input.score };
    }
    var daysToExpiry = input.entitlementExpiry ? daysBetweenDateStr(today, input.entitlementExpiry) : null;
    if (daysToExpiry != null && daysToExpiry <= 30 && input.manualStatus !== 'Renewed') {
      return { color: 'red', reason: 'Renewal due in ' + daysToExpiry + ' day(s), not yet renewed' };
    }
    var dormant = !input.lastScanDate || daysBetweenDateStr(input.lastScanDate, today) > 30;
    if (dormant) return { color: 'amber', reason: input.lastScanDate ? 'No scan activity in 30+ days' : 'No scan on record yet' };
    if (daysToExpiry != null && daysToExpiry <= 60 && input.manualStatus !== 'Renewed') {
      return { color: 'amber', reason: 'Renewal due in ' + daysToExpiry + ' day(s)' };
    }
    if (input.score != null && input.score < 70) return { color: 'amber', reason: 'Posture score ' + input.score };
    return { color: 'green', reason: 'Healthy' };
  }

  /* Adds whole calendar months to a YYYY-MM-DD string, UTC, no ambient
     clock dependency — used to turn a 12/24/36-month issuance term into
     an expiry date (owner console's "New client" form). Relies on
     JS Date's own month-overflow rollover (setUTCMonth) rather than a
     hand-rolled calendar, same "don't reinvent it" principle as
     addDaysToDateStr above; the one edge case worth naming is a
     day-of-month that doesn't exist in the target month (e.g. Jan 31 +
     1 month), which Date rolls forward into the following month rather
     than clamping — acceptable here since this only ever feeds a
     12/24/36-month term, never a single-month add where that edge case
     would actually bite in practice. */
  function addMonthsToDateStr(dateStr, months) {
    var d = new Date(dateStr + 'T00:00:00Z');
    d.setUTCMonth(d.getUTCMonth() + months);
    return d.toISOString().slice(0, 10);
  }

  /* A tenant identifier is either an Entra tenant GUID or a verified
     domain — the same two shapes evaluateEntitlement()/tenantIdsFor()
     already accept at verification time (see SETUP.md §7a). This is
     purely a form-level sanity check ("did I paste something that
     LOOKS like a tenant id/domain") — it can't and doesn't confirm the
     tenant actually exists or that this domain is actually verified for
     it; only a live activation/`--tenant` issuance against the real
     tenant does that. */
  function isValidTenantIdentifier(s) {
    if (!s) return false;
    var v = String(s).trim();
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)) return true;
    return /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/i.test(v);
  }

  /* Case-insensitive, trimmed match against an existing PartnerClients
     roster — the owner console's "New client" form warns rather than
     blocks on a hit (a tenant might legitimately be re-added after
     being removed, or the match might be a coincidence worth a second
     look rather than a hard stop) — see buildClientIssuancePlan()'s
     caller in owner.js. Returns the matching client, or null. */
  function findDuplicateTenantClient(tenantId, clients) {
    var needle = String(tenantId || '').trim().toLowerCase();
    if (!needle) return null;
    return (clients || []).find(function (c) { return String(c.tenantId || '').trim().toLowerCase() === needle; }) || null;
  }

  /* Builds everything the owner console's "New client" form needs from
     one submission — the exact issue-entitlement.mjs CLI invocation
     (this console never holds the Ed25519 private key, see
     tools/ISSUANCE.md, so it can never sign a file itself), and the
     PartnerEntitlements row to record once that command has actually
     been run (or, if CONFIG.signingEndpoint is configured, once that
     endpoint has signed it instead — see ISSUANCE.md's "signing
     endpoint" section for the trade-off between the two paths).
     `input`: { tenantId, modules: [...], termMonths: 12|24|36,
     type: 'client'|'trial', renewsEntitlementId (optional, SharePoint
     item id of the entitlement this issuance renews) }. `today`:
     YYYY-MM-DD, passed in rather than read from the ambient clock so
     this stays a pure, fixture-testable function. A 'trial' form type
     maps to the payload/CLI's 'demo' type — the CLI and signed payload
     have never used the word "trial"; the form uses the client-facing
     word, this is the one place the translation happens. */
  function buildClientIssuancePlan(input, today) {
    input = input || {};
    var type = input.type === 'trial' ? 'demo' : 'client';
    var modules = (input.modules || []).slice().sort();
    var termMonths = Number(input.termMonths) || 12;
    var issuedAt = today;
    var expiry = addMonthsToDateStr(issuedAt, termMonths);
    var outFile = String(input.tenantId || 'client').replace(/[^a-z0-9.-]/gi, '-') + '-activation.json';
    var command = [
      'node tools/issue-entitlement.mjs issue',
      '--tenant ' + input.tenantId,
      '--frameworks ' + modules.join(','),
      '--expiry ' + expiry,
      type === 'demo' ? '--type demo' : '',
      '--key entitlement-private.json --module-keys tools/module-keys.json',
      '--out ' + outFile,
      '--record'
    ].filter(Boolean).join(' ');
    return {
      type: type, modules: modules, issuedAt: issuedAt, expiry: expiry, termMonths: termMonths,
      command: command, outFile: outFile,
      entitlementRecord: {
        tenantId: input.tenantId, type: type, modules: modules, issuedAt: issuedAt, expiry: expiry,
        manualStatus: '', renewedBy: '', renewsEntitlementId: input.renewsEntitlementId || ''
      }
    };
  }

  /* Post-purchase progress, purely derived from fields the roster
     already carries (plus one new one, packSentAt) — never a separate
     hand-maintained status enum that could drift from what actually
     happened. "Activated" reads c.onboarded (set true the moment a
     sync finds this tenant's own Controls list — which can only exist
     if that tenant's provisioning gate, itself gated on a verified
     activation, already opened; see store.js's
     assertActivationAuthorizesProvisioning()), not a separate
     unverifiable "did they apply the file" flag. Each stage's `at`
     is the timestamp/date that made it true, or '' if not reached yet
     — the owner console renders '' as "not yet", never a guessed date.
     Order matters (pack sent -> activated -> first scan -> synced) but
     stages are independently derived, not a strict state machine — e.g.
     a client who pastes an old activation file straight in without
     ever receiving "the pack" from this console can still show
     activated/scanned/synced with packSent still false, and that's
     honest, not a bug. */
  function computeClientChecklist(client) {
    var c = client || {};
    return [
      { key: 'packSent', label: 'Welcome pack sent', done: !!c.packSentAt, at: c.packSentAt || '' },
      { key: 'activated', label: 'Activated', done: !!c.onboarded, at: c.onboarded ? (c.lastSynced || '') : '' },
      { key: 'firstScan', label: 'First scan', done: !!c.lastScanDate, at: c.lastScanDate || '' },
      { key: 'synced', label: 'Synced', done: !!c.lastSynced, at: c.lastSynced || '' }
    ];
  }

  /* The local-development bypass's ONE piece of testable logic — see
     public/checkpoint/devflag.js and scripts/hash-checkpoint-assets.mjs
     for the rest of the design. Requires BOTH a truthy dev flag AND a
     localhost-family hostname; neither alone is enough, so a flag that
     somehow survives into a real deployment still grants nothing
     unless that deployment is also, somehow, served from localhost —
     which a real client tenant never is. Pure and synchronous so it's
     trivially testable without touching window/location directly. */
  function isDevBypassActive(devFlag, hostname) {
    return devFlag === true && (hostname === 'localhost' || hostname === '127.0.0.1');
  }

  /* ==========================================================
     Content packs — the premium framework registries (soc2,
     essential8, iso42001, iso27701, dispirap, nistcsf) don't ship in
     this app's JS bundle at all; they're fetched as small,
     AES-256-GCM-encrypted static JSON files (checkpoint-content/*.json
     source -> scripts/build-content-packs.mjs -> dist/checkpoint/
     packs/*.pack.json) and decrypted in the browser using the module
     key embedded in the signed activation payload above. Hosting the
     ciphertext publicly alongside the app is fine — without the right
     key (i.e. without a valid activation naming that module) a pack
     file decrypts to nothing.
     Same WebCrypto-everywhere principle as the Ed25519 signing above:
     one implementation, shared by the browser (via window.crypto.subtle)
     and scripts/build-content-packs.mjs (Node, via
     require('node:crypto').webcrypto.subtle) and the test suite, so
     "what gets encrypted" and "what gets decrypted" can never drift
     apart. */

  /* SHA-256 hex digest of a byte buffer (Uint8Array/ArrayBuffer) — the
     manifest-hash integrity check on a fetched pack file, independent
     of AES-GCM's own built-in authentication (defence in depth: catches
     a corrupted/substituted file before ever attempting to decrypt it,
     with a clearer error than a decrypt failure would give). */
  async function sha256Hex(subtle, bytes) {
    var digest = await subtle.digest('SHA-256', bytes);
    return Array.prototype.map.call(new Uint8Array(digest), function (b) { return (b < 16 ? '0' : '') + b.toString(16); }).join('');
  }

  /* Encrypts a plaintext pack object with AES-256-GCM under the given
     raw key (base64). `iv` is optional — pass a fixed 12-byte Uint8Array
     only for deterministic tests; the build script always omits it so
     every build gets a fresh random IV. Returns the on-disk pack shape:
     {moduleId, version, iv, ciphertext} (iv/ciphertext both base64). */
  async function encryptPack(subtle, moduleKeyBase64, moduleId, version, plaintextObj, iv) {
    var key = await subtle.importKey('raw', base64ToBytes(moduleKeyBase64), { name: 'AES-GCM' }, false, ['encrypt']);
    var ivBytes = iv || crypto.getRandomValues(new Uint8Array(12));
    var data = new TextEncoder().encode(JSON.stringify(plaintextObj));
    var ctBuf = await subtle.encrypt({ name: 'AES-GCM', iv: ivBytes }, key, data);
    return { moduleId: moduleId, version: version, iv: bytesToBase64(ivBytes), ciphertext: bytesToBase64(new Uint8Array(ctBuf)) };
  }

  /* Decrypts a fetched pack file with the module key an activation
     granted. Throws (never returns a partial/garbage result) on a wrong
     key or tampered ciphertext — AES-GCM's authentication tag makes the
     two indistinguishable, which is exactly right here: the caller
     (app.js's mergeLicensedPacks()) treats any throw here as "this
     module isn't available," the same clear, safe fallback whether the
     cause was a bad key, a corrupted file, or a mismatched pack. */
  async function decryptPack(subtle, moduleKeyBase64, pack) {
    var key = await subtle.importKey('raw', base64ToBytes(moduleKeyBase64), { name: 'AES-GCM' }, false, ['decrypt']);
    var iv = base64ToBytes(pack.iv);
    var ct = base64ToBytes(pack.ciphertext);
    var ptBuf = await subtle.decrypt({ name: 'AES-GCM', iv: iv }, key, ct);
    return JSON.parse(new TextDecoder().decode(ptBuf));
  }

  /* Structural validation for a just-decrypted pack — cheap sanity
     checks that catch "this decrypted to something, but not a real
     pack" (e.g. a version mismatch, or moduleKeys mixed up between two
     modules that both happen to produce syntactically valid JSON)
     before any of it is merged into window.FRAMEWORKS/GUIDANCE. Returns
     an error string, or null if the pack looks right. */
  function validatePackShape(moduleId, content) {
    if (!content || typeof content !== 'object') return 'decrypted content is not an object';
    if (!content.framework || content.framework.id !== moduleId) return 'framework.id does not match the expected module';
    if (!Array.isArray(content.framework.controls)) return 'framework.controls is not an array';
    if (content.guidance && typeof content.guidance !== 'object') return 'guidance is not an object';
    return null;
  }

  return {
    band: band, residual: residual, checkResult: checkResult, score: score, readinessPct: readinessPct,
    suggestVendorCriticality: suggestVendorCriticality, parseMapTokens: parseMapTokens,
    constellationTheme: constellationTheme, constellationEdges: constellationEdges, constellationLayout: constellationLayout,
    fingerprintFromRows: fingerprintFromRows, remediationVelocityProjection: remediationVelocityProjection,
    weeklyActivityGrid: weeklyActivityGrid, riskBubblePoint: riskBubblePoint, riskBubbleLayout: riskBubbleLayout,
    relLuminance: relLuminance, contrastRatio: contrastRatio, compositeOverBg: compositeOverBg, pickReadableRgb: pickReadableRgb,
    mulberry32: mulberry32, sampleTriangular: sampleTriangular, samplePoisson: samplePoisson,
    riskFinancialInputs: riskFinancialInputs, simulateRiskLosses: simulateRiskLosses,
    simulatePortfolioLosses: simulatePortfolioLosses, summarizeLossDistribution: summarizeLossDistribution,
    lossExceedanceCurve: lossExceedanceCurve, RISK_FINANCIAL_BANDS: RISK_FINANCIAL_BANDS,
    toCsv: toCsv, buildZip: buildZip,
    canonicalJson: canonicalJson, base64ToBytes: base64ToBytes, bytesToBase64: bytesToBase64,
    verifyEntitlementSignature: verifyEntitlementSignature, signEntitlementPayload: signEntitlementPayload,
    evaluateEntitlement: evaluateEntitlement, reconcileActivationSources: reconcileActivationSources, addDaysToDateStr: addDaysToDateStr,
    latestEntitlementsByTenant: latestEntitlementsByTenant, computePartnerRevenue: computePartnerRevenue,
    computeNextBestModule: computeNextBestModule, computeClientHealth: computeClientHealth,
    daysBetweenDateStr: daysBetweenDateStr, normalizeEntitlementType: normalizeEntitlementType,
    addMonthsToDateStr: addMonthsToDateStr, isValidTenantIdentifier: isValidTenantIdentifier,
    findDuplicateTenantClient: findDuplicateTenantClient, buildClientIssuancePlan: buildClientIssuancePlan,
    computeClientChecklist: computeClientChecklist,
    isDevBypassActive: isDevBypassActive,
    sha256Hex: sha256Hex, encryptPack: encryptPack, decryptPack: decryptPack, validatePackShape: validatePackShape
  };
});
