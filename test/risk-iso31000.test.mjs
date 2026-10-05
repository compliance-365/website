// The risk register and the Risk Management Framework document, aligned
// to ISO 31000:2018 (the process) and ISO/IEC 27005:2022 (information
// security risk): risk scenarios, the standard's treatment terms, and a
// framework document that states the scales, bands and acceptance
// criteria the register actually applies.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
global.window = global.window || {};
const Lib = require('../public/checkpoint/lib.js');
require('../public/checkpoint/templates.js');
const app = readFileSync(new URL('../public/checkpoint/app.js', import.meta.url), 'utf8');
const store = readFileSync(new URL('../public/checkpoint/store.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../public/checkpoint/index.html', import.meta.url), 'utf8');
const rmf = window.POLICY_TEMPLATES.find((t) => t.id === 'risk-management-framework');
const text = [rmf.purpose].concat(rmf.policyStatements.map((s) => s.rule + ' ' + s.because)).join(' ');

describe('risk scenario (ISO/IEC 27005)', () => {
  test('a complete scenario has a threat, a consequence, assets or a vulnerability, and C/I/A', () => {
    assert.deepEqual(Lib.riskScenarioGaps({ threat: 'Phishing', consequence: 'Breach', assetRefs: ['AST-1'], cia: ['C'] }), []);
    assert.deepEqual(Lib.riskScenarioGaps({ threat: 'Phishing', consequence: 'Breach', vulnerability: 'No MFA', cia: ['C'] }), [], 'event-based with a vulnerability is complete too');
    assert.deepEqual(Lib.riskScenarioGaps({}), ['threat or risk source', 'consequence', 'assets affected or vulnerability', 'confidentiality, integrity or availability it threatens']);
  });

  test('the scenario is stored on the Risks list and reaches existing tenants', () => {
    ['AssetRefs', 'Threat', 'Vulnerability', 'Consequence'].forEach((col) => {
      assert.match(store, new RegExp("name: '" + col + "'"), col + ' in DEFS');
    });
    assert.match(store, /'ResidualDate', 'AssetRefs', 'Threat', 'Vulnerability', 'Consequence', 'RiskType'\],\n    Actions:/);
    assert.match(store, /assetRefs: uncsv\(f\.AssetRefs\), threat: f\.Threat \|\| '', vulnerability: f\.Vulnerability \|\| '', consequence: f\.Consequence \|\| ''/);
    assert.equal((store.match(/AssetRefs: csv\(r\.assetRefs \|\| \[\]\), Threat: r\.threat \|\| '', Vulnerability: r\.vulnerability \|\| '', Consequence: r\.consequence \|\| ''/g) || []).length, 2, 'written on add and on update');
  });

  test('it can be entered on a new risk, edited, and is shown in the drawer and reports', () => {
    ['nrAssets', 'nrThreat', 'nrVulnerability', 'nrConsequence'].forEach((id) => assert.match(html, new RegExp('id="' + id + '"')));
    assert.match(app, /\{ id: 'threat', label: 'Threat or risk source'/);
    assert.match(app, /Risk scenario \(ISO\/IEC 27005\)/);
    assert.equal((app.match(/\+ riskScenarioReportLine\(r\)/g) || []).length, 2, 'risk register report and treatment plan');
  });

  test('a scan-raised risk records the failed check as its vulnerability', () => {
    assert.match(app, /vulnerability: checkDef \? 'Posture scan check failed: ' \+ checkDef\.label/);
  });
});

describe('treatment options use the ISO/IEC 27005 terms', () => {
  test('each stored option is shown with its 27005 name, and stored values do not change', () => {
    assert.match(app, /var TREATMENT_ISO = \{ Treat: 'modify', Tolerate: 'retain', Transfer: 'share', Terminate: 'avoid' \};/);
    assert.match(app, /var RISK_TREATMENTS = \['Treat', 'Tolerate', 'Transfer', 'Terminate'\];/);
    ['risk modification', 'risk retention', 'risk sharing', 'risk avoidance'].forEach((t) => {
      assert.match(html, new RegExp(t), 'new-risk options: ' + t);
      assert.match(text, new RegExp(t), 'framework document: ' + t);
    });
  });
});

describe('the Risk Management Framework states what the register does', () => {
  test('it follows the ISO 31000 process and names ISO/IEC 27005', () => {
    assert.match(rmf.purpose, /ISO 31000:2018/);
    assert.match(rmf.purpose, /ISO\/IEC 27005:2022/);
    ['communication and consultation', 'scope, context and criteria', 'monitoring and review', 'recording and reporting'].forEach((step) => assert.match(text, new RegExp(step), step));
    assert.match(text, /Asset-based/);
    assert.match(text, /Event-based/);
  });

  test('the bands it states are the bands band() applies', () => {
    const edges = { 4: 'Low', 5: 'Medium', 9: 'Medium', 10: 'High', 14: 'High', 15: 'Critical', 25: 'Critical', 1: 'Low' };
    Object.entries(edges).forEach(([score, b]) => assert.equal(Lib.band(Number(score)), b, score));
    assert.match(text, /1–4 Low, 5–9 Medium, 10–14 High, 15–25 Critical/);
  });

  test('the scale descriptors it states are the ones the risk form offers', () => {
    const opts = (id) => [...html.slice(html.indexOf('id="' + id + '"')).split('</select>')[0].matchAll(/<option value="(\d)"[^>]*>\d — ([^<]+)</g)].map((m) => m[1] + ' ' + m[2]);
    opts('nrLikelihood').forEach((o) => assert.ok(text.includes(o), 'likelihood ' + o));
    opts('nrImpact').forEach((o) => assert.ok(text.includes(o), 'consequence ' + o));
    assert.equal(opts('nrLikelihood').length, 5);
  });

  test('the review commitment is the organisation\'s own risk review setting, not a fixed number', () => {
    // Stated through {{cadence:risk-review}}, which reads riskReviewCadenceDays,
    // so the document and the register's overdue flag can never disagree.
    assert.match(text, /\{\{cadence:risk-review\}\}/);
    assert.doesNotMatch(text, /at least quarterly/);
  });
});

describe('opportunities (ISO 31000; ISO 27001 6.1.1)', () => {
  test('stored on the Risks list with a type, loaded into their own register', () => {
    assert.match(store, /\{ name: 'RiskType', text: \{\} \}/);
    assert.match(store, /type: f\.RiskType === 'Opportunity' \? 'Opportunity' : 'Threat'/);
    assert.match(store, /S\.opportunities = S\.risks\.filter\(function \(r\) \{ return r\.type === 'Opportunity'; \}\);\n      S\.risks = S\.risks\.filter\(function \(r\) \{ return r\.type !== 'Opportunity'; \}\);/);
    assert.match(store, /RiskType: r\.type === 'Opportunity' \? 'Opportunity' : 'Threat'/);
  });

  test('the register has an Opportunities section with add, edit and review', () => {
    assert.match(html, /id="oppRows"/);
    assert.match(html, /data-action="App\.addOpportunity"/);
    ['addOpportunity', 'editOpportunity', 'reviewOpportunity', 'deleteOpportunity'].forEach((a) => assert.match(app, new RegExp("'" + a + "'"), a + ' is gated for read-only sessions'));
    assert.match(app, /var OPPORTUNITY_RESPONSES = \['Pursue', 'Share', 'Retain', 'Decline'\];/);
    assert.match(app, /concat\(opportunitiesReportSection\(\)\)/);
  });

  test('Clause 6.1.1 needs opportunities recorded, owned and reviewed', () => {
    const rec = (x) => Lib.clauseRecordStatus('opportunities', Object.assign({ today: '2026-09-30' }, x));
    assert.equal(rec({ opportunities: [] }).st, 'missing');
    assert.equal(rec({ opportunities: [{ owner: 'A', lastReviewed: '2026-06-01', status: 'Open' }] }).st, 'done');
    assert.equal(rec({ opportunities: [{ owner: '', lastReviewed: '2026-06-01', status: 'Open' }] }).st, 'partial');
    ['iso27001', 'iso42001', 'iso27701'].forEach((fw) => {
      const d = Lib.clauseRequirementsFor(fw, '6.1.1').find((r) => r.id === 'determine');
      assert.ok([].concat(d.auto.record || []).includes('opportunities'), fw);
    });
  });

  test('the framework document covers opportunities', () => {
    const t = window.POLICY_TEMPLATES.find((x) => x.id === 'risk-management-framework');
    assert.ok(t.policyStatements.some((s) => /Opportunities are identified and recorded alongside risks/.test(s.rule)));
  });
});

describe('confidentiality, integrity and availability', () => {
  test('captured as three explicit choices on a new risk and when editing', () => {
    ['nrCiaC', 'nrCiaI', 'nrCiaA'].forEach((id) => assert.match(html, new RegExp('<input type="checkbox" id="' + id + '">')));
    ['ciaC', 'ciaI', 'ciaA'].forEach((id) => assert.match(app, new RegExp("\\{ id: '" + id + "', label: 'Threatens")));
  });
});

describe('C/I/A on automatically created risks', () => {
  const AI = require('../public/checkpoint/ai.js');
  test('every posture scan risk template carries a C/I/A classification', () => {
    const tplBlock = app.slice(app.indexOf('  var TPL = {'));
    const risks = [...tplBlock.matchAll(/risk: \{ title: '((?:[^'\\]|\\.)*)', cat: '[^']*', cia: \[([^\]]*)\]/g)];
    const all = (tplBlock.match(/risk: \{ title:/g) || []).length;
    assert.ok(all >= 40, 'expected the full template set');
    assert.equal(risks.length, all, 'a scan template has no cia');
    risks.forEach((m) => {
      const v = m[2].split(',').map((x) => x.trim().replace(/'/g, '')).filter(Boolean);
      assert.ok(v.length && v.every((x) => ['C', 'I', 'A'].includes(x)), m[1]);
      assert.deepEqual(v, ['C', 'I', 'A'].filter((x) => v.includes(x)), 'canonical order: ' + m[1]);
    });
  });

  test('approving a scan finding copies it, and older scan risks are backfilled once, never overwriting', () => {
    assert.match(app, /cia: \(t\.risk\.cia \|\| \[\]\)\.slice\(\), src: src,/);
    assert.match(app, /function backfillScanRiskCia\(\)/);
    assert.match(app, /\|\| \(r\.cia \|\| \[\]\)\.length\) return;/);
    assert.match(app, /backfillScanRiskCia\(\); runClauseAutomation\(\);/);
  });

  test('the AI risk draft proposes C/I/A and only ever C, I or A', () => {
    assert.match(AI.buildRiskDraftPrompt('x'), /THREATENS:/);
    const base = 'TITLE: t\nLIKELIHOOD: 3\nIMPACT: 3\n';
    assert.deepEqual(AI.parseRiskDraft(base + 'THREATENS: C, I\nACTIONS:\n1. a').cia, ['C', 'I']);
    assert.deepEqual(AI.parseRiskDraft(base + 'THREATENS: availability and confidentiality\nACTIONS:\n1. a').cia, ['C', 'A']);
    assert.deepEqual(AI.parseRiskDraft(base + 'ACTIONS:\n1. a').cia, []);
    assert.match(app, /el\.checked = \(draft\.cia \|\| \[\]\)\.indexOf\(k\) !== -1/);
  });
});

describe('the Risk Management Framework covers ISO 31000 principles, framework and process', () => {
  test('the principles and the framework (leadership, integration, evaluation, improvement) are stated', () => {
    ['integrated into all organisational activities', 'structured and comprehensive', 'customised', 'inclusive', 'dynamic',
      'best available information', 'human and cultural factors', 'continually improved'].forEach((p) => assert.match(text, new RegExp(p), p));
    assert.match(text, /Top management leads and commits to risk management/);
    assert.match(text, /procurement and supplier onboarding/);
    assert.match(text, /ISO 31000 clauses 5\.6 and 5\.7/);
  });
  test('treatment plans, interim measures, register contents, identification sources and time-limited acceptance', () => {
    assert.match(text, /interim measures are put in place/);
    assert.match(text, /Each risk records at least/);
    assert.match(text, /posture scan findings, security incidents/);
    assert.match(text, /valid for no more than 12 months/);
  });
  test('criteria tables: consequence by area, likelihood, the matrix and the response at each level', () => {
    const titles = rmf.tables.map((t) => t.title);
    assert.deepEqual(titles, ['Consequence criteria', 'Likelihood criteria', 'Risk level matrix', 'Response at each risk level']);
    const cons = rmf.tables[0];
    assert.deepEqual(cons.head.slice(1), ['Financial', 'Legal and regulatory', 'Reputation', 'Customers and service', 'Information', 'People']);
    assert.deepEqual(cons.rows.map((r) => r[0]), ['1 Negligible', '2 Minor', '3 Moderate', '4 Major', '5 Severe']);
    assert.match(cons.note, /\{\{riskFinancial\}\}/);
  });
  test('every cell of the matrix is the level band() gives', () => {
    const m = rmf.tables[2];
    m.rows.forEach((row) => {
      const c = Number(row[0][0]);
      row.slice(1).forEach((cell, i) => {
        const score = c * (i + 1);
        assert.equal(cell, Lib.band(score) + ' ' + score, row[0] + ' x ' + (i + 1));
      });
    });
  });
  test('tables render in the document and resolve tokens; the thresholds are asked in the questionnaire', () => {
    assert.match(app, /var tablesHtml = \(t\.tables \|\| \[\]\)\.map/);
    assert.match(app, /sectionHeading\('policy', 'Policy'\) \+ statementsHtml \+ tablesHtml \+/);
    assert.match(app, /if \(Array\.isArray\(out\.tables\)\) \{/);
    assert.match(app, /\{ id: 'riskFinancial', label: fld\('orgRiskFinancial'\)\.label/);
    assert.match(app, /orgRiskFinancial: step3\.riskFinancial,/);
  });
});
