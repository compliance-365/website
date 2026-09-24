// Control and clause codes are append-only.
//
// A client's own records — SoA status, owner, evidence links, clause
// status, risk-to-control links — live in their SharePoint, keyed by
// framework + code. A release never edits or deletes those records
// (store.js only ever ADDS missing rows). But renaming or removing a code
// would orphan them: the client's row would stop matching any control,
// and a blank "Not started" row would appear under the new code, so their
// work would look lost even though it is still in their tenant.
//
// This test fails on any code missing from the current registries that
// is in test/fixtures/control-codes.json, and on any new code not yet in
// it. To add codes: run `node scripts/snapshot-control-codes.mjs` (with
// checkpoint-content/ linked) and commit the fixture. To retire a code,
// don't — mark it not applicable or supersede it in its title instead.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { currentCodes } from './helpers/control-codes.mjs';

const snapshot = JSON.parse(readFileSync(new URL('./fixtures/control-codes.json', import.meta.url), 'utf8'));
const now = currentCodes();
// Frameworks whose codes are readable in this checkout: ISO 27001 ships
// in store.js, so always; every other framework's codes (including the
// NIST CSF subcategories) come from its content pack, readable only when
// checkpoint-content/ is present (CI with the content PAT, or a local
// link).
const readable = Object.keys(snapshot.frameworks).filter((fw) => fw === 'iso27001' || now.contentAvailable);

describe('control and clause codes are append-only', () => {
  test('no framework control code has been removed or renamed', () => {
    const gone = [];
    readable.forEach((fw) => {
      const have = new Set(now.frameworks[fw] || []);
      snapshot.frameworks[fw].forEach((code) => { if (!have.has(code)) gone.push(fw + ' ' + code); });
    });
    assert.deepEqual(gone, [], 'These codes have client records keyed to them and would be orphaned — restore them:\n  ' + gone.join('\n  '));
  });

  test('no management-system clause code has been removed or renamed', () => {
    const have = new Set(now.clauses);
    const gone = snapshot.clauses.filter((k) => !have.has(k));
    assert.deepEqual(gone, [], 'These clause codes have client records keyed to them — restore them:\n  ' + gone.join('\n  '));
  });

  test('every current code is in the snapshot, so it is protected too', () => {
    const fresh = [];
    Object.keys(now.frameworks).forEach((fw) => {
      if (!readable.includes(fw) && snapshot.frameworks[fw]) return;
      const known = new Set(snapshot.frameworks[fw] || []);
      now.frameworks[fw].forEach((code) => { if (!known.has(code)) fresh.push(fw + ' ' + code); });
    });
    const knownClauses = new Set(snapshot.clauses);
    now.clauses.forEach((k) => { if (!knownClauses.has(k)) fresh.push('clause ' + k); });
    assert.deepEqual(fresh, [], 'New codes are not yet protected. Run `node scripts/snapshot-control-codes.mjs` (with checkpoint-content/ linked) and commit test/fixtures/control-codes.json:\n  ' + fresh.slice(0, 20).join('\n  ') + (fresh.length > 20 ? '\n  …and ' + (fresh.length - 20) + ' more' : ''));
  });
});
