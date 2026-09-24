// Regenerates test/fixtures/control-codes.json — the list of every
// control and clause code a client tenant can hold a record against.
//
// Why it exists: a client's Statement of Applicability rows, clause rows
// and evidence links are keyed by framework + code in their own
// SharePoint. Renaming or removing a code in a release would not touch
// their data, but it would orphan it: their row stops matching anything,
// and a blank row appears under the new code. test/control-code-stability
// .test.mjs fails CI on any code that disappears from this snapshot.
//
// Run this ONLY after adding codes (never to make a removal pass):
//   ln -s ../Checkpoint-Content checkpoint-content   # premium packs
//   node scripts/snapshot-control-codes.mjs
import { existsSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { currentCodes } from '../test/helpers/control-codes.mjs';

const require = createRequire(import.meta.url);
const out = new URL('../test/fixtures/control-codes.json', import.meta.url);
const previous = existsSync(out) ? JSON.parse(readFileSync(out, 'utf8')) : { frameworks: {}, clauses: [] };
const now = currentCodes();
if (!now.contentAvailable) {
  console.error('checkpoint-content/ is not present — premium framework codes cannot be read. Link the private content repo first (see the header of this script).');
  process.exit(1);
}

// Additive only: a code already in the snapshot is kept even if it has
// gone missing now, so this script can never be used to launder a removal.
const merged = { frameworks: {}, clauses: [] };
const fws = new Set([...Object.keys(previous.frameworks || {}), ...Object.keys(now.frameworks)]);
for (const fw of [...fws].sort()) {
  merged.frameworks[fw] = [...new Set([...(previous.frameworks[fw] || []), ...(now.frameworks[fw] || [])])].sort();
}
merged.clauses = [...new Set([...(previous.clauses || []), ...now.clauses])].sort();
writeFileSync(out, JSON.stringify(merged, null, 1) + '\n');
const total = Object.values(merged.frameworks).reduce((n, a) => n + a.length, 0);
console.log(`Wrote ${total} control codes across ${Object.keys(merged.frameworks).length} frameworks, and ${merged.clauses.length} clause codes.`);
