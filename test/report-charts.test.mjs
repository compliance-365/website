// Snapshot tests for public/checkpoint/report.js's six reusable chart
// functions (window.ReportEngine.charts.*) — data in, SVG string out.
// Every fixture below is fixed, and every chart function is a pure
// function of its input (no Date.now()/Math.random() anywhere in
// report.js), so asserting exact string equality against a captured-
// known-good snapshot is safe and reproducible — not flaky by
// construction. Regenerate deliberately (not by hand — see this
// file's own generation script in this session's history) if a chart
// function's rendering intentionally changes.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
global.window = global.window || {};
global.location = global.location || { href: 'https://example.com/checkpoint/index.html' };
require('../public/checkpoint/report.js');

const C = window.ReportEngine.charts;

describe('chart function snapshots (fixed fixture data)', () => {
  test("donut() — mixed status counts", () => {
    const svg = C.donut({"implemented":60,"inProgress":20,"notStarted":10,"notApplicable":3});
    assert.equal(svg, "<svg viewBox=\"0 0 460 200\" width=\"100%\" role=\"img\" aria-label=\"Readiness donut: 67% of applicable controls implemented\"><defs><pattern id=\"rpt-hatch\" width=\"6\" height=\"6\" patternUnits=\"userSpaceOnUse\" patternTransform=\"rotate(45)\"><rect width=\"6\" height=\"6\" fill=\"#D9D4C8\"/><line x1=\"0\" y1=\"0\" x2=\"0\" y2=\"6\" stroke=\"#8B877D\" stroke-width=\"1.5\"/></pattern></defs><circle cx=\"100\" cy=\"100\" r=\"70\" fill=\"none\" stroke=\"#3A7A3A\" stroke-width=\"30\" stroke-dasharray=\"282.2567558081103,157.57\" stroke-dashoffset=\"0\" transform=\"rotate(-90 100 100)\"/><circle cx=\"100\" cy=\"100\" r=\"70\" fill=\"none\" stroke=\"#B57F2A\" stroke-width=\"30\" stroke-dasharray=\"93.08558526937011,346.74\" stroke-dashoffset=\"-283.76\" transform=\"rotate(-90 100 100)\"/><circle cx=\"100\" cy=\"100\" r=\"70\" fill=\"none\" stroke=\"url(#rpt-hatch)\" stroke-width=\"30\" stroke-dasharray=\"45.79279263468506,394.03\" stroke-dashoffset=\"-378.34\" transform=\"rotate(-90 100 100)\"/><circle cx=\"100\" cy=\"100\" r=\"70\" fill=\"none\" stroke=\"#D9D4C8\" stroke-width=\"30\" stroke-dasharray=\"12.687837790405517,427.14\" stroke-dashoffset=\"-425.64\" transform=\"rotate(-90 100 100)\"/><text x=\"100\" y=\"96\" text-anchor=\"middle\" font-family=\"Fraunces,serif\" font-size=\"28\" font-weight=\"500\" fill=\"#0B0B0C\">67%</text><text x=\"100\" y=\"116\" text-anchor=\"middle\" font-family=\"Manrope,sans-serif\" font-size=\"9\" letter-spacing=\"1\" fill=\"#8b877d\">IMPLEMENTED</text><rect x=\"220\" y=\"30\" width=\"12\" height=\"12\" fill=\"#3A7A3A\"/><text x=\"238\" y=\"40\" font-family=\"Manrope,sans-serif\" font-size=\"11\" fill=\"#0B0B0C\">Implemented</text><text x=\"440\" y=\"40\" text-anchor=\"end\" font-family=\"Manrope,sans-serif\" font-size=\"11\" font-weight=\"700\" fill=\"#4b473e\">60 (65%)</text><rect x=\"220\" y=\"54\" width=\"12\" height=\"12\" fill=\"#B57F2A\"/><text x=\"238\" y=\"64\" font-family=\"Manrope,sans-serif\" font-size=\"11\" fill=\"#0B0B0C\">In progress</text><text x=\"440\" y=\"64\" text-anchor=\"end\" font-family=\"Manrope,sans-serif\" font-size=\"11\" font-weight=\"700\" fill=\"#4b473e\">20 (22%)</text><rect x=\"220\" y=\"78\" width=\"12\" height=\"12\" fill=\"url(#rpt-hatch)\"/><text x=\"238\" y=\"88\" font-family=\"Manrope,sans-serif\" font-size=\"11\" fill=\"#0B0B0C\">Not started</text><text x=\"440\" y=\"88\" text-anchor=\"end\" font-family=\"Manrope,sans-serif\" font-size=\"11\" font-weight=\"700\" fill=\"#4b473e\">10 (11%)</text><rect x=\"220\" y=\"102\" width=\"12\" height=\"12\" fill=\"#D9D4C8\"/><text x=\"238\" y=\"112\" font-family=\"Manrope,sans-serif\" font-size=\"11\" fill=\"#0B0B0C\">Not applicable</text><text x=\"440\" y=\"112\" text-anchor=\"end\" font-family=\"Manrope,sans-serif\" font-size=\"11\" font-weight=\"700\" fill=\"#4b473e\">3 (3%)</text></svg>");
  });

  test("donut() — all zero counts renders the placeholder", () => {
    const svg = C.donut({"implemented":0,"inProgress":0,"notStarted":0,"notApplicable":0});
    assert.equal(svg, "<svg viewBox=\"0 0 520 200\" width=\"100%\" role=\"img\" aria-label=\"No controls in scope yet.\"><rect x=\"0.5\" y=\"0.5\" width=\"519\" height=\"199\" fill=\"none\" stroke=\"#D9D4C8\" stroke-width=\"1\" stroke-dasharray=\"4,4\"/><text x=\"260\" y=\"100\" text-anchor=\"middle\" dominant-baseline=\"middle\" font-family=\"Manrope,sans-serif\" font-size=\"12\" fill=\"#8b877d\">No controls in scope yet.</text></svg>");
  });

  test("trend() — no scans renders the placeholder", () => {
    const svg = C.trend([]);
    assert.equal(svg, "<svg viewBox=\"0 0 580 210\" width=\"100%\" role=\"img\" aria-label=\"No posture scans recorded yet — history builds as scans run.\"><rect x=\"0.5\" y=\"0.5\" width=\"579\" height=\"209\" fill=\"none\" stroke=\"#D9D4C8\" stroke-width=\"1\" stroke-dasharray=\"4,4\"/><text x=\"290\" y=\"105\" text-anchor=\"middle\" dominant-baseline=\"middle\" font-family=\"Manrope,sans-serif\" font-size=\"12\" fill=\"#8b877d\">No posture scans recorded yet — history builds as scans run.</text></svg>");
  });

  test("trend() — a single scan (no line, no division-by-zero axis)", () => {
    const svg = C.trend([{"dateLabel":"9 Jul","score":72}]);
    assert.equal(svg, "<svg viewBox=\"0 0 600 196\" width=\"100%\" role=\"img\" aria-label=\"Posture score trend over 1 scan\"><line x1=\"46\" y1=\"156\" x2=\"566\" y2=\"156\" stroke=\"rgba(11,11,12,.12)\" stroke-width=\"1\"/><text x=\"36\" y=\"159\" text-anchor=\"end\" font-family=\"Manrope,sans-serif\" font-size=\"9\" fill=\"#8b877d\">0</text><line x1=\"46\" y1=\"90\" x2=\"566\" y2=\"90\" stroke=\"rgba(11,11,12,.12)\" stroke-width=\"1\"/><text x=\"36\" y=\"93\" text-anchor=\"end\" font-family=\"Manrope,sans-serif\" font-size=\"9\" fill=\"#8b877d\">50</text><line x1=\"46\" y1=\"24\" x2=\"566\" y2=\"24\" stroke=\"rgba(11,11,12,.12)\" stroke-width=\"1\"/><text x=\"36\" y=\"27\" text-anchor=\"end\" font-family=\"Manrope,sans-serif\" font-size=\"9\" fill=\"#8b877d\">100</text><line x1=\"46\" y1=\"156\" x2=\"566\" y2=\"156\" stroke=\"#0B0B0C\" stroke-width=\"1\"/><circle cx=\"306\" cy=\"60.96\" r=\"4.5\" fill=\"#A9812E\"/><text x=\"306\" y=\"50.96\" text-anchor=\"middle\" font-family=\"Manrope,sans-serif\" font-size=\"10\" font-weight=\"700\" fill=\"#0B0B0C\">72</text><text x=\"306\" y=\"174\" text-anchor=\"middle\" font-family=\"Manrope,sans-serif\" font-size=\"9\" fill=\"#8b877d\">9 Jul</text><rect x=\"46\" y=\"180\" width=\"12\" height=\"3\" fill=\"#A9812E\"/><text x=\"62\" y=\"185\" font-family=\"Manrope,sans-serif\" font-size=\"9\" fill=\"#4b473e\">Posture score</text><text x=\"330\" y=\"185\" font-family=\"Manrope,sans-serif\" font-size=\"9\" font-style=\"italic\" fill=\"#8b877d\">First scan — trend appears after a second one.</text></svg>");
  });

  test("trend() — three scans with readiness overlay and a target band", () => {
    const svg = C.trend([{"dateLabel":"1 Jun","score":41,"readiness":12},{"dateLabel":"21 Jun","score":48,"readiness":15},{"dateLabel":"9 Jul","score":45,"readiness":15}], 80);
    assert.equal(svg, "<svg viewBox=\"0 0 600 196\" width=\"100%\" role=\"img\" aria-label=\"Posture score trend over 3 scans\"><line x1=\"46\" y1=\"156\" x2=\"566\" y2=\"156\" stroke=\"rgba(11,11,12,.12)\" stroke-width=\"1\"/><text x=\"36\" y=\"159\" text-anchor=\"end\" font-family=\"Manrope,sans-serif\" font-size=\"9\" fill=\"#8b877d\">0</text><line x1=\"46\" y1=\"90\" x2=\"566\" y2=\"90\" stroke=\"rgba(11,11,12,.12)\" stroke-width=\"1\"/><text x=\"36\" y=\"93\" text-anchor=\"end\" font-family=\"Manrope,sans-serif\" font-size=\"9\" fill=\"#8b877d\">50</text><line x1=\"46\" y1=\"24\" x2=\"566\" y2=\"24\" stroke=\"rgba(11,11,12,.12)\" stroke-width=\"1\"/><text x=\"36\" y=\"27\" text-anchor=\"end\" font-family=\"Manrope,sans-serif\" font-size=\"9\" fill=\"#8b877d\">100</text><rect x=\"46\" y=\"24\" width=\"520\" height=\"26.4\" fill=\"rgba(58,122,58,.08)\"/><line x1=\"46\" y1=\"50.4\" x2=\"566\" y2=\"50.4\" stroke=\"#3A7A3A\" stroke-width=\"1\" stroke-dasharray=\"4,3\"/><text x=\"50\" y=\"46.4\" font-family=\"Manrope,sans-serif\" font-size=\"9\" fill=\"#3A7A3A\">target 80</text><line x1=\"46\" y1=\"156\" x2=\"566\" y2=\"156\" stroke=\"#0B0B0C\" stroke-width=\"1\"/><polygon points=\"46,101.88 306,92.64 566,96.6 566,156 46,156\" fill=\"rgba(169,129,46,.10)\"/><polyline points=\"46,101.88 306,92.64 566,96.6\" fill=\"none\" stroke=\"#A9812E\" stroke-width=\"2\"/><polyline points=\"46,140.16 306,136.2 566,136.2\" fill=\"none\" stroke=\"#B57F2A\" stroke-width=\"1.5\" stroke-dasharray=\"3,3\"/><circle cx=\"46\" cy=\"101.88\" r=\"3\" fill=\"rgba(169,129,46,.55)\"/><circle cx=\"306\" cy=\"92.64\" r=\"3\" fill=\"rgba(169,129,46,.55)\"/><circle cx=\"566\" cy=\"96.6\" r=\"4.5\" fill=\"#A9812E\"/><text x=\"566\" y=\"86.6\" text-anchor=\"end\" font-family=\"Manrope,sans-serif\" font-size=\"10\" font-weight=\"700\" fill=\"#0B0B0C\">45</text><text x=\"46\" y=\"174\" text-anchor=\"start\" font-family=\"Manrope,sans-serif\" font-size=\"9\" fill=\"#8b877d\">1 Jun</text><text x=\"566\" y=\"174\" text-anchor=\"end\" font-family=\"Manrope,sans-serif\" font-size=\"9\" fill=\"#8b877d\">9 Jul</text><rect x=\"46\" y=\"180\" width=\"12\" height=\"3\" fill=\"#A9812E\"/><text x=\"62\" y=\"185\" font-family=\"Manrope,sans-serif\" font-size=\"9\" fill=\"#4b473e\">Posture score</text><rect x=\"180\" y=\"180\" width=\"12\" height=\"3\" fill=\"#B57F2A\"/><text x=\"196\" y=\"185\" font-family=\"Manrope,sans-serif\" font-size=\"9\" fill=\"#4b473e\">Control readiness</text></svg>");
  });

  test("stackedBars() — two theme groups, control-status legend", () => {
    const svg = C.stackedBars([{"label":"Organizational","values":[10,2,1,0]},{"label":"People","values":[5,0,3,1]}], [{"label":"Implemented","color":"#3A7A3A"},{"label":"In progress","color":"#B57F2A"},{"label":"Not started","color":"#8B877D","hatch":true},{"label":"Not applicable","color":"#D9D4C8"}]);
    assert.equal(svg, "<svg viewBox=\"0 0 600 140\" width=\"100%\" role=\"img\" aria-label=\"Composition by group, 2 group(s)\"><defs><pattern id=\"rpt-hatch\" width=\"6\" height=\"6\" patternUnits=\"userSpaceOnUse\" patternTransform=\"rotate(45)\"><rect width=\"6\" height=\"6\" fill=\"#D9D4C8\"/><line x1=\"0\" y1=\"0\" x2=\"0\" y2=\"6\" stroke=\"#8B877D\" stroke-width=\"1.5\"/></pattern></defs><text x=\"170\" y=\"50\" text-anchor=\"end\" font-family=\"Manrope,sans-serif\" font-size=\"11\" fill=\"#0B0B0C\">Organizational</text><rect x=\"180\" y=\"34\" width=\"313.88\" height=\"24\" fill=\"#3A7A3A\"/><rect x=\"495.38\" y=\"34\" width=\"61.58\" height=\"24\" fill=\"#B57F2A\"/><rect x=\"558.46\" y=\"34\" width=\"30.04\" height=\"24\" fill=\"url(#rpt-hatch)\"/><text x=\"170\" y=\"86\" text-anchor=\"end\" font-family=\"Manrope,sans-serif\" font-size=\"11\" fill=\"#0B0B0C\">People</text><rect x=\"180\" y=\"70\" width=\"226.28\" height=\"24\" fill=\"#3A7A3A\"/><rect x=\"407.78\" y=\"70\" width=\"135.17\" height=\"24\" fill=\"url(#rpt-hatch)\"/><rect x=\"544.44\" y=\"70\" width=\"44.06\" height=\"24\" fill=\"#D9D4C8\"/><rect x=\"10\" y=\"103\" width=\"10\" height=\"10\" fill=\"#3A7A3A\"/><text x=\"25\" y=\"112\" font-family=\"Manrope,sans-serif\" font-size=\"9.5\" fill=\"#4b473e\">Implemented</text><rect x=\"155\" y=\"103\" width=\"10\" height=\"10\" fill=\"#B57F2A\"/><text x=\"170\" y=\"112\" font-family=\"Manrope,sans-serif\" font-size=\"9.5\" fill=\"#4b473e\">In progress</text><rect x=\"300\" y=\"103\" width=\"10\" height=\"10\" fill=\"url(#rpt-hatch)\"/><text x=\"315\" y=\"112\" font-family=\"Manrope,sans-serif\" font-size=\"9.5\" fill=\"#4b473e\">Not started</text><rect x=\"445\" y=\"103\" width=\"10\" height=\"10\" fill=\"#D9D4C8\"/><text x=\"460\" y=\"112\" font-family=\"Manrope,sans-serif\" font-size=\"9.5\" fill=\"#4b473e\">Not applicable</text></svg>");
  });

  test("stackedBars() — no rows/legend renders the placeholder", () => {
    const svg = C.stackedBars([], []);
    assert.equal(svg, "<svg viewBox=\"0 0 600 140\" width=\"100%\" role=\"img\" aria-label=\"Not enough data to compare yet.\"><rect x=\"0.5\" y=\"0.5\" width=\"599\" height=\"139\" fill=\"none\" stroke=\"#D9D4C8\" stroke-width=\"1\" stroke-dasharray=\"4,4\"/><text x=\"300\" y=\"70\" text-anchor=\"middle\" dominant-baseline=\"middle\" font-family=\"Manrope,sans-serif\" font-size=\"12\" fill=\"#8b877d\">Not enough data to compare yet.</text></svg>");
  });

  test("riskHeatmap() — three residual pairs", () => {
    const svg = C.riskHeatmap([{"L":4,"I":4},{"L":3,"I":5},{"L":2,"I":2}]);
    assert.equal(svg, "<svg viewBox=\"0 0 400 288\" width=\"100%\" role=\"img\" aria-label=\"Residual risk heatmap, likelihood by impact, 3 open risk(s)\"><text x=\"40\" y=\"46\" text-anchor=\"end\" font-family=\"Manrope,sans-serif\" font-size=\"10\" fill=\"#8b877d\">I5</text><rect x=\"50\" y=\"20\" width=\"42\" height=\"42\" fill=\"rgba(181,127,42,0.08)\"/><rect x=\"94\" y=\"20\" width=\"42\" height=\"42\" fill=\"rgba(169,82,46,0.08)\"/><rect x=\"138\" y=\"20\" width=\"42\" height=\"42\" fill=\"rgba(143,46,46,0.35)\"/><text x=\"159\" y=\"45\" text-anchor=\"middle\" font-family=\"Manrope,sans-serif\" font-size=\"12\" font-weight=\"700\" fill=\"#0B0B0C\">1</text><rect x=\"182\" y=\"20\" width=\"42\" height=\"42\" fill=\"rgba(143,46,46,0.08)\"/><rect x=\"226\" y=\"20\" width=\"42\" height=\"42\" fill=\"rgba(143,46,46,0.08)\"/><text x=\"40\" y=\"90\" text-anchor=\"end\" font-family=\"Manrope,sans-serif\" font-size=\"10\" fill=\"#8b877d\">I4</text><rect x=\"50\" y=\"64\" width=\"42\" height=\"42\" fill=\"rgba(58,122,58,0.08)\"/><rect x=\"94\" y=\"64\" width=\"42\" height=\"42\" fill=\"rgba(181,127,42,0.08)\"/><rect x=\"138\" y=\"64\" width=\"42\" height=\"42\" fill=\"rgba(169,82,46,0.08)\"/><rect x=\"182\" y=\"64\" width=\"42\" height=\"42\" fill=\"rgba(143,46,46,0.35)\"/><text x=\"203\" y=\"89\" text-anchor=\"middle\" font-family=\"Manrope,sans-serif\" font-size=\"12\" font-weight=\"700\" fill=\"#0B0B0C\">1</text><rect x=\"226\" y=\"64\" width=\"42\" height=\"42\" fill=\"rgba(143,46,46,0.08)\"/><text x=\"40\" y=\"134\" text-anchor=\"end\" font-family=\"Manrope,sans-serif\" font-size=\"10\" fill=\"#8b877d\">I3</text><rect x=\"50\" y=\"108\" width=\"42\" height=\"42\" fill=\"rgba(58,122,58,0.08)\"/><rect x=\"94\" y=\"108\" width=\"42\" height=\"42\" fill=\"rgba(181,127,42,0.08)\"/><rect x=\"138\" y=\"108\" width=\"42\" height=\"42\" fill=\"rgba(181,127,42,0.08)\"/><rect x=\"182\" y=\"108\" width=\"42\" height=\"42\" fill=\"rgba(169,82,46,0.08)\"/><rect x=\"226\" y=\"108\" width=\"42\" height=\"42\" fill=\"rgba(143,46,46,0.08)\"/><text x=\"40\" y=\"178\" text-anchor=\"end\" font-family=\"Manrope,sans-serif\" font-size=\"10\" fill=\"#8b877d\">I2</text><rect x=\"50\" y=\"152\" width=\"42\" height=\"42\" fill=\"rgba(58,122,58,0.08)\"/><rect x=\"94\" y=\"152\" width=\"42\" height=\"42\" fill=\"rgba(58,122,58,0.35)\"/><text x=\"115\" y=\"177\" text-anchor=\"middle\" font-family=\"Manrope,sans-serif\" font-size=\"12\" font-weight=\"700\" fill=\"#0B0B0C\">1</text><rect x=\"138\" y=\"152\" width=\"42\" height=\"42\" fill=\"rgba(181,127,42,0.08)\"/><rect x=\"182\" y=\"152\" width=\"42\" height=\"42\" fill=\"rgba(181,127,42,0.08)\"/><rect x=\"226\" y=\"152\" width=\"42\" height=\"42\" fill=\"rgba(169,82,46,0.08)\"/><text x=\"40\" y=\"222\" text-anchor=\"end\" font-family=\"Manrope,sans-serif\" font-size=\"10\" fill=\"#8b877d\">I1</text><rect x=\"50\" y=\"196\" width=\"42\" height=\"42\" fill=\"rgba(58,122,58,0.08)\"/><rect x=\"94\" y=\"196\" width=\"42\" height=\"42\" fill=\"rgba(58,122,58,0.08)\"/><rect x=\"138\" y=\"196\" width=\"42\" height=\"42\" fill=\"rgba(58,122,58,0.08)\"/><rect x=\"182\" y=\"196\" width=\"42\" height=\"42\" fill=\"rgba(58,122,58,0.08)\"/><rect x=\"226\" y=\"196\" width=\"42\" height=\"42\" fill=\"rgba(181,127,42,0.08)\"/><text x=\"71\" y=\"254\" text-anchor=\"middle\" font-family=\"Manrope,sans-serif\" font-size=\"10\" fill=\"#8b877d\">L1</text><text x=\"115\" y=\"254\" text-anchor=\"middle\" font-family=\"Manrope,sans-serif\" font-size=\"10\" fill=\"#8b877d\">L2</text><text x=\"159\" y=\"254\" text-anchor=\"middle\" font-family=\"Manrope,sans-serif\" font-size=\"10\" fill=\"#8b877d\">L3</text><text x=\"203\" y=\"254\" text-anchor=\"middle\" font-family=\"Manrope,sans-serif\" font-size=\"10\" fill=\"#8b877d\">L4</text><text x=\"247\" y=\"254\" text-anchor=\"middle\" font-family=\"Manrope,sans-serif\" font-size=\"10\" fill=\"#8b877d\">L5</text><rect x=\"50\" y=\"265\" width=\"10\" height=\"10\" fill=\"rgba(58,122,58,.75)\"/><text x=\"65\" y=\"274\" font-family=\"Manrope,sans-serif\" font-size=\"9.5\" fill=\"#4b473e\">Low</text><rect x=\"140\" y=\"265\" width=\"10\" height=\"10\" fill=\"rgba(181,127,42,.75)\"/><text x=\"155\" y=\"274\" font-family=\"Manrope,sans-serif\" font-size=\"9.5\" fill=\"#4b473e\">Medium</text><rect x=\"230\" y=\"265\" width=\"10\" height=\"10\" fill=\"rgba(169,82,46,.75)\"/><text x=\"245\" y=\"274\" font-family=\"Manrope,sans-serif\" font-size=\"9.5\" fill=\"#4b473e\">High</text><rect x=\"320\" y=\"265\" width=\"10\" height=\"10\" fill=\"rgba(143,46,46,.75)\"/><text x=\"335\" y=\"274\" font-family=\"Manrope,sans-serif\" font-size=\"9.5\" fill=\"#4b473e\">Critical</text></svg>");
  });

  test("riskHeatmap() — no risks renders the placeholder", () => {
    const svg = C.riskHeatmap([]);
    assert.equal(svg, "<svg viewBox=\"0 0 420 260\" width=\"100%\" role=\"img\" aria-label=\"No open risks recorded yet.\"><rect x=\"0.5\" y=\"0.5\" width=\"419\" height=\"259\" fill=\"none\" stroke=\"#D9D4C8\" stroke-width=\"1\" stroke-dasharray=\"4,4\"/><text x=\"210\" y=\"130\" text-anchor=\"middle\" dominant-baseline=\"middle\" font-family=\"Manrope,sans-serif\" font-size=\"12\" fill=\"#8b877d\">No open risks recorded yet.</text></svg>");
  });

  test("evidenceGauge() — auto-captured, manual and no-evidence split", () => {
    const svg = C.evidenceGauge({"autoCaptured":20,"manual":5,"total":30});
    assert.equal(svg, "<svg viewBox=\"0 0 560 90\" width=\"100%\" role=\"img\" aria-label=\"Evidence coverage: 83% of implemented controls have linked evidence\"><text x=\"0\" y=\"16\" font-family=\"Fraunces,serif\" font-size=\"16\" font-weight=\"500\" fill=\"#0B0B0C\">83% evidence-backed</text><rect x=\"0\" y=\"30\" width=\"560\" height=\"22\" rx=\"4\" fill=\"#D9D4C8\"/><rect x=\"0\" y=\"30\" width=\"373.33\" height=\"22\" rx=\"4\" fill=\"#A9812E\"/><rect x=\"373.33\" y=\"30\" width=\"93.33\" height=\"22\" fill=\"#8B877D\"/><rect x=\"0\" y=\"30\" width=\"560\" height=\"22\" rx=\"4\" fill=\"none\" stroke=\"rgba(11,11,12,.15)\"/><rect x=\"0\" y=\"66\" width=\"10\" height=\"10\" fill=\"#A9812E\"/><text x=\"15\" y=\"75\" font-family=\"Manrope,sans-serif\" font-size=\"9.5\" fill=\"#4b473e\">Auto-captured (20)</text><rect x=\"180\" y=\"66\" width=\"10\" height=\"10\" fill=\"#8B877D\"/><text x=\"195\" y=\"75\" font-family=\"Manrope,sans-serif\" font-size=\"9.5\" fill=\"#4b473e\">Manual (5)</text><rect x=\"330\" y=\"66\" width=\"10\" height=\"10\" fill=\"#D9D4C8\"/><text x=\"345\" y=\"75\" font-family=\"Manrope,sans-serif\" font-size=\"9.5\" fill=\"#4b473e\">No evidence (5)</text></svg>");
  });

  test("evidenceGauge() — no implemented controls renders the placeholder", () => {
    const svg = C.evidenceGauge({"autoCaptured":0,"manual":0,"total":0});
    assert.equal(svg, "<svg viewBox=\"0 0 560 90\" width=\"100%\" role=\"img\" aria-label=\"No implemented controls yet — evidence coverage isn’t measurable.\"><rect x=\"0.5\" y=\"0.5\" width=\"559\" height=\"89\" fill=\"none\" stroke=\"#D9D4C8\" stroke-width=\"1\" stroke-dasharray=\"4,4\"/><text x=\"280\" y=\"45\" text-anchor=\"middle\" dominant-baseline=\"middle\" font-family=\"Manrope,sans-serif\" font-size=\"12\" fill=\"#8b877d\">No implemented controls yet — evidence coverage isn’t measurable.</text></svg>");
  });

  test("kpiStrip() — two tiles, one with a trend arrow", () => {
    const svg = C.kpiStrip([{"value":"82","label":"Posture score","trend":"up","trendGood":true},{"value":"70%","label":"Readiness"}]);
    assert.equal(svg, "<svg viewBox=\"0 0 600 90\" width=\"100%\" role=\"img\" aria-label=\"Key metrics: Posture score 82, Readiness 70%\"><line x1=\"0\" y1=\"8\" x2=\"600\" y2=\"8\" stroke=\"rgba(11,11,12,.2)\"/><line x1=\"0\" y1=\"82\" x2=\"600\" y2=\"82\" stroke=\"rgba(11,11,12,.2)\"/><text x=\"150\" y=\"42\" text-anchor=\"middle\" font-family=\"Fraunces,serif\" font-size=\"26\" font-weight=\"500\" fill=\"#A9812E\">82<tspan dx=\"4\" font-family=\"Manrope,sans-serif\" font-size=\"15\" fill=\"#3A7A3A\">▲</tspan></text><text x=\"150\" y=\"62\" text-anchor=\"middle\" font-family=\"Manrope,sans-serif\" font-size=\"9\" letter-spacing=\".5\" fill=\"#8b877d\">POSTURE SCORE</text><line x1=\"300\" y1=\"10\" x2=\"300\" y2=\"80\" stroke=\"rgba(11,11,12,.15)\"/><text x=\"450\" y=\"42\" text-anchor=\"middle\" font-family=\"Fraunces,serif\" font-size=\"26\" font-weight=\"500\" fill=\"#A9812E\">70%</text><text x=\"450\" y=\"62\" text-anchor=\"middle\" font-family=\"Manrope,sans-serif\" font-size=\"9\" letter-spacing=\".5\" fill=\"#8b877d\">READINESS</text></svg>");
  });

  test("kpiStrip() — no items renders the placeholder", () => {
    const svg = C.kpiStrip([]);
    assert.equal(svg, "<svg viewBox=\"0 0 600 90\" width=\"100%\" role=\"img\" aria-label=\"No KPIs available yet.\"><rect x=\"0.5\" y=\"0.5\" width=\"599\" height=\"89\" fill=\"none\" stroke=\"#D9D4C8\" stroke-width=\"1\" stroke-dasharray=\"4,4\"/><text x=\"300\" y=\"45\" text-anchor=\"middle\" dominant-baseline=\"middle\" font-family=\"Manrope,sans-serif\" font-size=\"12\" fill=\"#8b877d\">No KPIs available yet.</text></svg>");
  });

});

// Separate from the snapshot suite above: these assert a SECURITY
// property, not a rendering — every text label these functions accept
// (group/segment labels, KPI values/labels) is caller-controlled but
// still originates from live tenant data one hop upstream (a control
// title, a risk title, a practitioner-entered value) by the time it
// reaches app.js's REPORT_BUILDERS. Nothing here should ever let a
// label smuggle a tag/attribute into the SVG — every text node AND
// every attribute built from caller text must come out through the
// same escaping helper esc() uses. (This suite caught a real bug
// during development: kpiStrip()'s aria-label built its summary from
// raw item.label/item.value with no escaping at all — fixed by
// routing it through escSvgText() like every other caller-text spot.)
describe('chart functions escape every caller-supplied text label', () => {
  const XSS = '<script>alert(1)</script>&"\'';

  test('stackedBars() escapes a hostile group label', () => {
    const svg = C.stackedBars([{ label: XSS, values: [1, 0] }], [{ label: 'A', color: '#3A7A3A' }, { label: 'B', color: '#B57F2A' }]);
    assert.doesNotMatch(svg, /<script>alert\(1\)<\/script>/);
    assert.match(svg, /&lt;script&gt;alert\(1\)&lt;\/script&gt;&amp;&quot;&#39;/);
  });

  test('stackedBars() escapes a hostile legend label', () => {
    const svg = C.stackedBars([{ label: 'Row', values: [1, 0] }], [{ label: XSS, color: '#3A7A3A' }, { label: 'B', color: '#B57F2A' }]);
    assert.doesNotMatch(svg, /<script>alert\(1\)<\/script>/);
  });

  test('riskHeatmap() output contains no caller-supplied text at all (labels are fixed L#/I#/severity strings)', () => {
    const svg = C.riskHeatmap([{ L: 1, I: 1 }]);
    assert.doesNotMatch(svg, /<script/);
  });

  test('evidenceGauge() output contains no caller-supplied text (only computed counts)', () => {
    const svg = C.evidenceGauge({ autoCaptured: 1, manual: 0, total: 1 });
    assert.doesNotMatch(svg, /<script/);
  });

  test('kpiStrip() escapes a hostile value/label in both the visible text AND the aria-label summary', () => {
    const svg = C.kpiStrip([{ value: XSS, label: XSS }]);
    assert.doesNotMatch(svg, /<script>alert\(1\)<\/script>/);
    // the aria-label is built by concatenating every item's label+value —
    // this is exactly the attribute the pre-fix version left unescaped
    assert.doesNotMatch(svg, /aria-label="[^"]*<script/);
  });

  test('placeholder charts never emit a raw "<script" for any empty-data message', () => {
    [C.donut({ implemented: 0, inProgress: 0, notStarted: 0, notApplicable: 0 }), C.trend([]), C.stackedBars([], []), C.riskHeatmap([]), C.evidenceGauge({ autoCaptured: 0, manual: 0, total: 0 }), C.kpiStrip([])].forEach((svg) => {
      assert.doesNotMatch(svg, /<script/);
    });
  });

  test('every numeric geometry value is a finite Number, never NaN or a raw string, across every chart with sparse/adversarial input', () => {
    const svgs = [
      C.donut({ implemented: 'not-a-number', inProgress: null, notStarted: undefined, notApplicable: -5 }),
      C.trend([{ dateLabel: 'x', score: 'oops' }]),
      C.stackedBars([{ label: 'Row', values: ['a', null] }], [{ label: 'A', color: '#3A7A3A' }, { label: 'B', color: '#B57F2A' }]),
      C.riskHeatmap([{ L: 'x', I: null }]),
      C.evidenceGauge({ autoCaptured: 'x', manual: null, total: 10 }),
      C.kpiStrip([{ value: 5, label: 'x' }])
    ];
    svgs.forEach((svg) => { assert.doesNotMatch(svg, /NaN|undefined|null/); });
  });
});
