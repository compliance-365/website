// ISO 27001 certification readiness: the asset register (A.5.9), the
// legal and regulatory register (A.5.31 / 4.2), SoA justification for
// inclusion (6.1.3 d)) and the Stage 1 mandatory documented information
// checklist. Each is something a certification auditor asks for by
// name, so the rules behind them are pinned here.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import CheckpointLib from '../public/checkpoint/lib.js';

const { mergeDiscoveredAssets, assetRegisterSummary, legalRegisterSummary, LEGAL_BASELINE_AU,
  soaInclusionReasons, mandatoryDocumentation, MANDATORY_DOCS } = CheckpointLib;
const TODAY = '2026-09-24';

describe('mergeDiscoveredAssets() — re-syncing Microsoft 365 into the register', () => {
  const existing = () => [
    { id: 'AST-001', name: 'LT-1', type: 'Device', source: 'Intune', sourceId: 'd1', owner: 'old@x', classification: 'Internal', criticality: 'High', notes: 'kept', status: 'Active' },
    { id: 'AST-002', name: 'Gone laptop', type: 'Device', source: 'Intune', sourceId: 'd2', owner: 'a@x', status: 'Active' },
    { id: 'AST-003', name: 'Finance', type: 'Information location', source: 'SharePoint', sourceId: 's1', owner: 'CFO', status: 'Active' },
    { id: 'AST-004', name: 'Customer DB', type: 'Information', source: 'Manual', sourceId: '', owner: 'CTO', status: 'Active' }
  ];
  test('a new discovered asset is added; an existing one is updated, not duplicated', () => {
    const ex = existing();
    const r = mergeDiscoveredAssets(ex, [{ source: 'Intune', sourceId: 'd1', name: 'LT-1-renamed', owner: 'new@x' }, { source: 'Intune', sourceId: 'd3', name: 'LT-3', type: 'Device' }], TODAY);
    assert.equal(r.toAdd.length, 1);
    assert.equal(r.toAdd[0].sourceId, 'd3');
    assert.equal(ex[0].name, 'LT-1-renamed');
  });
  test('the Intune primary user owns a device; manual classification, criticality and notes survive', () => {
    const ex = existing();
    mergeDiscoveredAssets(ex, [{ source: 'Intune', sourceId: 'd1', name: 'LT-1', owner: 'new@x' }], TODAY);
    assert.equal(ex[0].owner, 'new@x');
    assert.equal(ex[0].classification, 'Internal');
    assert.equal(ex[0].criticality, 'High');
    assert.equal(ex[0].notes, 'kept');
  });
  test('for other sources a synced owner only fills a blank', () => {
    const ex = existing();
    mergeDiscoveredAssets(ex, [{ source: 'SharePoint', sourceId: 's1', name: 'Finance', owner: 'Site admin' }], TODAY);
    assert.equal(ex[2].owner, 'CFO');
  });
  test('an asset gone from its source is flagged, never deleted', () => {
    const ex = existing();
    const r = mergeDiscoveredAssets(ex, [{ source: 'Intune', sourceId: 'd1', name: 'LT-1' }], TODAY);
    assert.equal(r.missing, 1);
    assert.equal(ex[1].status, 'Not found in last sync');
    assert.equal(ex.length, 4);
  });
  test('a source that was not read this time marks nothing missing', () => {
    const ex = existing();
    mergeDiscoveredAssets(ex, [{ source: 'Intune', sourceId: 'd1', name: 'LT-1' }, { source: 'Intune', sourceId: 'd2', name: 'x' }], TODAY);
    assert.equal(ex[2].status, 'Active', 'SharePoint failed to read — its sites must not be flagged');
  });
  test('manual assets are never touched by a sync', () => {
    const ex = existing();
    mergeDiscoveredAssets(ex, [], TODAY);
    assert.equal(ex[3].status, 'Active');
  });
  test('a re-found asset returns to Active', () => {
    const ex = existing();
    ex[1].status = 'Not found in last sync';
    mergeDiscoveredAssets(ex, [{ source: 'Intune', sourceId: 'd2', name: 'Gone laptop' }], TODAY);
    assert.equal(ex[1].status, 'Active');
  });
});

describe('assetRegisterSummary()', () => {
  test('a device-only register is not ready — A.5.9 is about information', () => {
    const s = assetRegisterSummary([{ type: 'Device', owner: 'a', status: 'Active' }], TODAY);
    assert.equal(s.information, 0);
    assert.equal(s.ready, false);
  });
  test('owned information assets make it ready; retired assets are ignored', () => {
    const s = assetRegisterSummary([{ type: 'Information', owner: 'a', classification: 'Confidential', status: 'Active' }, { type: 'Device', owner: '', status: 'Retired' }], TODAY);
    assert.equal(s.ready, true);
    assert.equal(s.total, 1);
  });
  test('an unowned asset blocks readiness', () => {
    assert.equal(assetRegisterSummary([{ type: 'Information', owner: 'a' }, { type: 'Application', owner: ' ' }], TODAY).ready, false);
  });
});

describe('legal register', () => {
  test('the Australian starting set never asserts applicability it cannot know', () => {
    LEGAL_BASELINE_AU.filter(b => b.type === 'Legislation').forEach(b => assert.equal(b.applies, 'To confirm', b.title));
    LEGAL_BASELINE_AU.forEach(b => assert.ok(b.controls.length && b.controls.every(c => /^A\.\d+\.\d+$/.test(c)), b.title));
  });
  test('ready needs something applying, nothing to confirm and every applying row owned', () => {
    assert.equal(legalRegisterSummary([{ applies: 'Yes', owner: 'a', lastReviewed: TODAY }], TODAY).ready, true);
    assert.equal(legalRegisterSummary([{ applies: 'Yes', owner: 'a' }, { applies: 'To confirm' }], TODAY).ready, false);
    assert.equal(legalRegisterSummary([{ applies: 'Yes', owner: '' }], TODAY).ready, false);
    assert.equal(legalRegisterSummary([{ applies: 'No' }], TODAY).stale, 0, 'a requirement that does not apply is not overdue for review');
  });
});

describe('soaInclusionReasons() — ISO 27001 6.1.3 d)', () => {
  const ctx = {
    risks: [{ id: 'R-001', controls: ['A.8.5'], status: 'Open' }, { id: 'R-009', controls: ['A.8.5'], status: 'Closed' }],
    obligations: [{ id: 'LEG-001', title: 'Privacy Act 1988 (Cth) — Australian Privacy Principles', controls: ['A.5.34'], applies: 'Yes' }, { id: 'LEG-002', title: 'SOCI Act', controls: ['A.5.34'], applies: 'To confirm' }],
    checkLabelsByControl: { 'A.8.5': ['MFA enforced — all users'] }
  };
  test('cites the open risks it treats and the checks that monitor it', () => {
    const r = soaInclusionReasons({ id: 'A.8.5', app: true }, ctx);
    assert.deepEqual(r, ['Risk treatment: R-001', 'Monitored by posture check: MFA enforced — all users']);
  });
  test('cites only requirements that apply', () => {
    assert.deepEqual(soaInclusionReasons({ id: 'A.5.34', app: true }, ctx), ['Legal / contractual: LEG-001 Privacy Act 1988 (Cth)']);
  });
  test('falls back to a stated baseline reason, never an empty cell', () => {
    assert.match(soaInclusionReasons({ id: 'A.7.4', app: true }, ctx)[0], /^Baseline/);
  });
  test('never cites the exclusion justification as a reason for inclusion', () => {
    const r = soaInclusionReasons({ id: 'A.7.4', app: true, just: 'We have no offices' }, ctx);
    assert.ok(!r.some(x => /no offices/.test(x)));
  });
  test('an excluded control has no inclusion reasons', () => {
    assert.deepEqual(soaInclusionReasons({ id: 'A.8.5', app: false }, ctx), []);
  });
});

describe('mandatoryDocumentation() — the Stage 1 checklist', () => {
  test('covers every mandatory ISO 27001 clause item', () => {
    const refs = MANDATORY_DOCS.map(m => m.ref);
    ['4.3', '5.2', '6.1.2', '6.1.3', '6.1.3 d)', '6.1.3 e)', '6.2', '7.2', '7.5', '8.2', '8.3', '9.1', '9.2', '9.3', '10.2'].forEach(r => assert.ok(refs.includes(r), r));
  });
  test('an empty tenant has everything missing', () => {
    assert.ok(mandatoryDocumentation({ today: TODAY }).every(m => m.status === 'missing'));
  });
  test('a draft document is partial; an approved one is done', () => {
    const find = (docs) => mandatoryDocumentation({ today: TODAY, docs }).find(m => m.ref === '5.2');
    assert.equal(find([{ tplId: 'infosec-policy', status: 'Draft' }]).status, 'partial');
    assert.equal(find([{ tplId: 'infosec-policy', status: 'Approved' }]).status, 'done');
  });
  test('an item with a procedure AND a record is only as good as the weaker', () => {
    const m = mandatoryDocumentation({ today: TODAY, docs: [{ tplId: 'internal-audit-procedure', status: 'Approved' }], audits: [] }).find(x => x.ref === '9.2');
    assert.equal(m.status, 'missing', 'an approved audit procedure with no audit ever run is not done');
    const done = mandatoryDocumentation({ today: TODAY, docs: [{ tplId: 'internal-audit-procedure', status: 'Approved' }], audits: [{ status: 'Completed', completed: '2026-06-01' }] }).find(x => x.ref === '9.2');
    assert.equal(done.status, 'done');
  });
  test('SoA is partial with unjustified exclusions', () => {
    const m = mandatoryDocumentation({ today: TODAY, soa: { applicable: 90, notStarted: 0, unjustified: 2 } }).find(x => x.ref === '6.1.3 d)');
    assert.equal(m.status, 'partial');
    assert.match(m.note, /2 exclusion/);
  });
  test('asset inventory: devices only is partial', () => {
    const m = mandatoryDocumentation({ today: TODAY, assets: { total: 30, information: 0, noOwner: 0 } }).find(x => x.ref === 'A.5.9');
    assert.equal(m.status, 'partial');
  });
  test('every template an item names exists in the template library', async () => {
    globalThis.window = globalThis.window || {};
    await import('../public/checkpoint/templates.js');
    const ids = new Set((window.POLICY_TEMPLATES || []).map(t => t.id));
    MANDATORY_DOCS.filter(m => m.tpl).forEach(m => assert.ok(ids.has(m.tpl), m.tpl));
  });
});
