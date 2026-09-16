// The threat-intel feature is split across three files that each own a
// piece of one shared vocabulary of topic tags, and nothing until now
// checked that the three agree:
//
//   lambda/threat-intel.js  TAG_RULES        — PRODUCES tags
//   templates.js            TECH_STACK_OPTIONS — SELECTS tags (checkboxes)
//   lib.js  THREAT_INTEL_INDUSTRY_TAGS       — SELECTS tags (per industry)
//
// A tag that one side produces and no other side can ever select is
// invisible: it throws nothing, logs nothing, and renders normally. It
// simply means a whole class of advisory can never be marked "Relevant
// to you". The reverse — a checkbox naming a tag the Lambda cannot
// emit — is worse, because the control is visibly present and ticking
// it provably does nothing.
//
// Both had actually happened. 'microsoft' and 'browser' were emitted by
// the Lambda (11 and 2 of 40 items in a live feed measured 2026-09-15)
// with no checkbox to select them at all, while five of the seven
// checkboxes that DID exist matched zero live items. That is what
// "whenever I select an option it returns the same results" looked like
// from the outside: the control worked perfectly and had nothing to act
// on. Reading any one of the three files would not have found it —
// each is self-consistent. Only comparing them does.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { TAG_RULES } from '../lambda/threat-intel.js';
import CheckpointLib from '../public/checkpoint/lib.js';

const require = createRequire(import.meta.url);
global.window = global.window || {};
window.CHECKPOINT_CONFIG = window.CHECKPOINT_CONFIG || { scopesProvision: [] };
require('../public/checkpoint/templates.js');

const { TECH_STACK_OPTIONS } = window;
const { THREAT_INTEL_INDUSTRY_TAGS } = CheckpointLib;

/* tagEntry() falls back to ['general'] when no rule matches, so
   'general' is a real emitted tag but deliberately not selectable —
   it means "we have nothing specific to say about this one". */
const FALLBACK_TAG = 'general';

const emitted = new Set(TAG_RULES.map((r) => r.tag));
const stackSelectable = new Set(TECH_STACK_OPTIONS.flatMap((o) => o.tags));
const industrySelectable = new Set(Object.values(THREAT_INTEL_INDUSTRY_TAGS).flat());

describe('threat-intel tag vocabulary agrees across the three files that share it', () => {
  test('every tag the Lambda can emit is selectable by a tech-stack checkbox', () => {
    const orphans = [...emitted].filter((t) => !stackSelectable.has(t));
    assert.deepEqual(orphans, [],
      'TAG_RULES emits ' + JSON.stringify(orphans) + ' but no TECH_STACK_OPTIONS entry ' +
      'lists them, so no tenant can ever mark such an advisory relevant to its stack. ' +
      'Add an option in templates.js, or drop the rule from the Lambda.');
  });

  test('every tech-stack checkbox selects a tag the Lambda can actually emit', () => {
    const dead = TECH_STACK_OPTIONS
      .filter((o) => !o.tags.some((t) => emitted.has(t)))
      .map((o) => o.id);
    assert.deepEqual(dead, [],
      'TECH_STACK_OPTIONS entries ' + JSON.stringify(dead) + ' name no tag in TAG_RULES. ' +
      'Ticking them can never change anything, which reads to a user as a broken control.');
  });

  test('every industry profile selects tags the Lambda can actually emit', () => {
    const bad = [];
    for (const [industry, tags] of Object.entries(THREAT_INTEL_INDUSTRY_TAGS)) {
      for (const t of tags) if (!emitted.has(t)) bad.push(industry + ':' + t);
    }
    assert.deepEqual(bad, [],
      'THREAT_INTEL_INDUSTRY_TAGS references tags no TAG_RULES rule produces: ' + JSON.stringify(bad));
  });

  test('the general fallback is never offered as something to tick', () => {
    assert.equal(stackSelectable.has(FALLBACK_TAG), false,
      "'general' means 'no specific topic matched' — offering it as a stack " +
      'checkbox would mark the untagged remainder of the feed as relevant.');
    assert.equal(industrySelectable.has(FALLBACK_TAG), false);
  });

  test('no tech-stack option is a duplicate of another', () => {
    const ids = TECH_STACK_OPTIONS.map((o) => o.id);
    assert.equal(new Set(ids).size, ids.length, 'duplicate TECH_STACK_OPTIONS id');
  });
});
