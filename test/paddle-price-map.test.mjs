// The Paddle price -> module mapping is written out by hand in THREE
// places, each with a comment telling the next person to keep it in
// sync manually:
//
//   src/data/pricing.js   SELF_SERVE.priceIds   what the browser charges
//   lambda/provision.js   PRICE_TO_MODULE       what activation grants
//   lambda/webhook.js     PRICE_TO_MODULE       what lifecycle events grant
//
// The duplication is deliberate (both Lambdas ship as single pasteable
// files with no build step, and pricing.js is an Astro module that
// assumes a bundler), but nothing checked the three agreed. A price id
// present in pricing.js and missing from provision.js is invisible
// until a real customer pays: checkout succeeds, the card is charged,
// and activation dies on "None of this subscription's prices are in
// PRICE_TO_MODULE". Nothing throws before the money moves.
//
// Both catalogues now live in the Lambdas permanently. Sandbox and
// production ids are disjoint and a Paddle response only ever carries
// one catalogue's ids, so carrying both is inert — and it means a
// sandbox run no longer requires editing either Lambda.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SELF_SERVE } from '../src/data/pricing.js';

function mapFrom(file, re) {
  const src = readFileSync(file, 'utf8');
  const body = src.slice(src.indexOf('const PRICE_TO_MODULE'));
  const end = body.indexOf('\n};');
  const out = new Map();
  for (const m of body.slice(0, end).matchAll(re)) out.set(m[1], m[2]);
  return out;
}
const provision = mapFrom('lambda/provision.js', /'(pri_[a-z0-9]+)':\s*\{\s*moduleId:\s*'([a-z0-9]+)'/g);
const webhook = mapFrom('lambda/webhook.js', /'(pri_[a-z0-9]+)':\s*'([a-z0-9]+)'/g);

/* pricing.js keys are `<module>_<tier>`, or bare `ai` for the add-on. */
const livePriceIds = new Map(
  Object.entries(SELF_SERVE.priceIds).map(([k, id]) => [id, k === 'ai' ? 'ai' : k.split('_')[0]])
);

describe('Paddle price ids agree across the three files that duplicate them', () => {
  test('every id the browser can charge is one provision.js can grant', () => {
    const missing = [...livePriceIds.keys()].filter((id) => !provision.has(id));
    assert.deepEqual(missing, [],
      'pricing.js can sell ' + JSON.stringify(missing) + ' but lambda/provision.js cannot map it. ' +
      'A customer paying for this gets charged and then fails activation.');
  });

  test('every id the browser can charge is one webhook.js can grant', () => {
    const missing = [...livePriceIds.keys()].filter((id) => !webhook.has(id));
    assert.deepEqual(missing, [],
      'pricing.js can sell ' + JSON.stringify(missing) + ' but lambda/webhook.js cannot map it. ' +
      'Lifecycle events for this subscription would silently grant nothing.');
  });

  test('the two Lambdas never disagree about what an id grants', () => {
    const conflicts = [];
    for (const [id, mod] of provision) {
      if (webhook.has(id) && webhook.get(id) !== mod) conflicts.push(id + ': provision=' + mod + ' webhook=' + webhook.get(id));
    }
    assert.deepEqual(conflicts, [], 'the same price id grants different modules in each Lambda: ' + JSON.stringify(conflicts));
  });

  test('the live catalogue maps each id to the module pricing.js sells it as', () => {
    const wrong = [];
    for (const [id, mod] of livePriceIds) {
      if (provision.has(id) && provision.get(id) !== mod) wrong.push(id + ': pricing=' + mod + ' provision=' + provision.get(id));
    }
    assert.deepEqual(wrong, [], 'a price is sold as one module and granted as another: ' + JSON.stringify(wrong));
  });

  /* The property that lets both catalogues live in the Lambdas at once.
     If Paddle ever reissued an id across environments this would break,
     and carrying both would stop being safe. */
  test('sandbox and production ids are disjoint, so carrying both is inert', () => {
    const live = new Set(livePriceIds.keys());
    const other = [...provision.keys()].filter((id) => !live.has(id));
    assert.ok(other.length >= 12,
      'expected the other catalogue to still be present in provision.js — found ' + other.length + ' ids');
    assert.equal(other.filter((id) => live.has(id)).length, 0,
      'a sandbox id collides with a production id; the two catalogues can no longer both be carried');
  });

  test('both Lambdas carry the same set of ids', () => {
    const onlyProvision = [...provision.keys()].filter((id) => !webhook.has(id));
    const onlyWebhook = [...webhook.keys()].filter((id) => !provision.has(id));
    assert.deepEqual({ onlyProvision, onlyWebhook }, { onlyProvision: [], onlyWebhook: [] });
  });
});
