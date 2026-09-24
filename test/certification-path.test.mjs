// certificationPathSteps() — the Dashboard's guided path to
// certification. Every step's done-state must come from register data,
// so these pin what "done" means for each one.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { certificationPathSteps } = require('../public/checkpoint/lib.js');
const TODAY = '2026-09-24';
const byId = (s) => Object.fromEntries(certificationPathSteps(Object.assign({ today: TODAY }, s)).map((x) => [x.id, x]));

describe('certificationPathSteps()', () => {
  test('a brand-new tenant has every step outstanding, in the intended order', () => {
    const steps = certificationPathSteps({ today: TODAY, entitled: ['iso27001'] });
    assert.deepEqual(steps.map((s) => s.id), ['scope', 'scan', 'docs', 'approve', 'assets', 'legal', 'risks', 'soa', 'objectives', 'training', 'suppliers', 'audit', 'review', 'clauses', 'mandatory', 'book']);
    assert.ok(steps.every((s) => !s.done));
  });

  test('the asset, legal and mandatory-documents steps are ISO 27001 only', () => {
    const other = byId({ entitled: ['soc2'] });
    assert.ok(!other.assets && !other.legal && !other.mandatory);
    const iso = byId({ entitled: ['iso27001'] });
    assert.ok(iso.assets && iso.legal && iso.mandatory);
  });

  test('asset register: a device list alone is not done; owned information assets are', () => {
    assert.equal(byId({ entitled: ['iso27001'], assets: { total: 40, information: 0, noOwner: 0, ready: false } }).assets.detail, 'no information assets yet');
    assert.equal(byId({ entitled: ['iso27001'], assets: { total: 40, information: 3, noOwner: 0, ready: true } }).assets.done, true);
  });

  test('legal register: requirements still to confirm keep the step open', () => {
    const s = byId({ entitled: ['iso27001'], legal: { total: 10, toConfirm: 4, noOwner: 0, ready: false } });
    assert.equal(s.legal.done, false);
    assert.equal(s.legal.detail, '4 still to confirm');
  });

  test('mandatory documents: done only when every item is in place', () => {
    assert.equal(byId({ entitled: ['iso27001'], mandatory: [{ status: 'done' }, { status: 'partial' }] }).mandatory.done, false);
    assert.equal(byId({ entitled: ['iso27001'], mandatory: [{ status: 'done' }, { status: 'done' }] }).mandatory.done, true);
  });

  test('the AI step appears only for tenants entitled to ISO 42001', () => {
    assert.ok(!byId({ entitled: ['iso27001'] }).ai);
    assert.ok(byId({ entitled: ['iso27001', 'iso42001'] }).ai);
  });

  test('documents: generated counts any status, approved needs every one Approved', () => {
    const s = byId({ pathTemplates: ['isms-scope', 'infosec-policy'], docs: [{ tplId: 'isms-scope', status: 'Approved' }, { tplId: 'infosec-policy', status: 'Draft' }] });
    assert.equal(s.docs.done, true);
    assert.equal(s.approve.done, false);
    assert.equal(s.approve.detail, '1 of 2 approved');
  });

  test('risks are done only when every open risk has a treatment and an owner', () => {
    assert.equal(byId({ risks: [{ status: 'Open', treat: 'Treat', owner: 'K' }, { status: 'Open', treat: '', owner: 'K' }] }).risks.done, false);
    assert.equal(byId({ risks: [{ status: 'Open', treat: 'Treat', owner: 'K' }, { status: 'Closed' }] }).risks.done, true);
  });

  test('the Statement of Applicability is done when no applicable control is Not started', () => {
    assert.equal(byId({ appControls: [{ st: 'Implemented' }, { st: 'Not started' }] }).soa.detail, '1 control not started');
    assert.equal(byId({ appControls: [{ st: 'Implemented' }, { st: 'In progress' }] }).soa.done, true);
  });

  test('internal audit and management review must be within the last year', () => {
    assert.equal(byId({ audits: [{ status: 'Completed', completed: '2025-06-01' }] }).audit.done, false);
    assert.equal(byId({ audits: [{ status: 'Completed', completed: '2026-06-01' }] }).audit.done, true);
    assert.equal(byId({ reviews: [{ date: '2026-03-01', decisions: '' }] }).review.done, false);
    assert.equal(byId({ reviews: [{ date: '2026-03-01', decisions: 'Approved budget' }] }).review.done, true);
  });

  test('booking is recognised from a certification or external audit on the calendar', () => {
    assert.equal(byId({ calendar: [{ title: 'Quarterly backup restore test', category: 'Backup restore test' }] }).book.done, false);
    assert.equal(byId({ calendar: [{ title: 'ISO 27001 Stage 1 audit', category: 'Other' }] }).book.done, true);
  });

  test('clauses are done only when every visible clause is Implemented', () => {
    assert.equal(byId({ clauses: [{ st: 'Implemented' }, { st: 'In progress' }] }).clauses.detail, '1 clause still open');
    assert.equal(byId({ clauses: [{ st: 'Implemented' }] }).clauses.done, true);
  });
});
