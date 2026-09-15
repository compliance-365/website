#!/usr/bin/env node
/* Asks each deployed Lambda whether it is actually running the code in
 * this repository.
 *
 * WHY THIS EXISTS
 * ---------------
 * These Lambdas are deployed by hand — paste the file into the AWS
 * console, save. Nothing connects a merged commit to a running
 * function, so git and production drift apart silently and there is no
 * signal anywhere that they have. `npm run check:cors` answers "can the
 * browser reach it"; this answers the question underneath that, which
 * nothing was asking: "is the thing it reaches the code we think it is".
 *
 * It was written after a Paddle sandbox smoke test found the provision
 * Lambda still running pre-84431721 code, two weeks after that commit
 * merged. The commit was the fix for a real vulnerability — the
 * endpoint signing an activation for any tenant id a caller named,
 * without checking the caller held a token for it. Every test passed,
 * `check:cors` passed, the source read correctly, and production was
 * unprotected the whole time. Nothing in the repo could have told you.
 *
 * HOW IT WORKS
 * ------------
 * It cannot read the deployed source, so it does the next best thing:
 * probes for a BEHAVIOURAL SIGNATURE that only the current code
 * produces — a status code or response field that changed in a known
 * commit. A signature is only useful if the old and new code answer the
 * same request differently, so each check below names the commit it is
 * detecting and what the old behaviour was.
 *
 * WHAT IT DOES NOT DO
 * -------------------
 * Every probe is a request that is REFUSED by the current code — a
 * missing credential, an unauthenticated read. Nothing is signed,
 * charged, provisioned or written, on either version. The strongest
 * evidence of that is the failure mode itself: these probes are only
 * interesting because they come back as rejections.
 *
 * One caveat, stated because it is the single side effect here: against
 * a STALE provision Lambda the auth-gate probe reaches Paddle before
 * being refused, costing one Paddle API read of a transaction id that
 * does not exist. Against current code it is refused before any
 * outbound call at all. That asymmetry IS the signature.
 *
 *   npm run check:deploy
 *
 * Exit code is 1 if any endpoint is running stale code, so it works as
 * a release gate. Like check:cors it is deliberately not part of
 * `npm test`, which must stay offline and deterministic.
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CONFIG_PATH = join(ROOT, 'public/checkpoint/config.js');

/* A tenant id that is GUID-shaped (so it passes the format check and
   the probe reaches the logic being tested) and belongs to nobody. */
const NOBODY_TENANT = '00000000-0000-4000-8000-000000000000';

const CHECKS = [
  {
    id: 'provision-auth-gate',
    key: 'selfServeActivateUrl',
    label: 'Self-serve provisioning — caller-tenant auth gate',
    commit: '84431721 "Verify caller controls tenantId before signing a self-serve activation"',
    stale: 'signs an activation for whatever tenantId the request body names, with no check that the caller holds a token for it',
    async probe(url) {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // No Authorization header. Current code must refuse this before
        // it calls anything; DEPLOY-PROVISION.md §8.5 states the rule.
        body: JSON.stringify({ tenantId: NOBODY_TENANT, transactionId: 'txn_deployment_probe_not_a_real_transaction' })
      });
      const text = await res.text();
      if (res.status === 401) return { ok: true, detail: '401 before any outbound call, as expected' };
      return {
        ok: false,
        detail: `expected 401, got ${res.status}: ${text.slice(0, 160)}`
      };
    }
  },
  {
    id: 'provision-revocation-reason',
    key: 'selfServeActivateUrl',
    label: 'Self-serve provisioning — revocation reason is not disclosed',
    commit: 'd9398195 "Harden the self-serve provisioning Lambda"',
    stale: "returns the owner's private note on why a tenant was revoked (e.g. \"fraud suspected\") to any unauthenticated caller, for any tenant id",
    async probe(url) {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ checkRevocation: true, tenantId: NOBODY_TENANT })
      });
      const body = await res.json().catch(() => ({}));
      if (res.status !== 200) return { ok: false, detail: `expected 200 from the revocation check, got ${res.status}` };
      if (Object.prototype.hasOwnProperty.call(body, 'reason')) {
        return { ok: false, detail: 'the response still carries a "reason" field' };
      }
      return { ok: true, detail: 'no reason field in the response' };
    }
  },
  {
    key: 'threatIntelUrl',
    label: 'Threat intel — browser and identity tag rules',
    commit: 'the TAG_RULES chromium/entra fix',
    stale: "tags every Chromium advisory 'general', so no browser-facing tenant ever sees one marked relevant",
    async probe(url) {
      const res = await fetch(url);
      const data = await res.json().catch(() => ({}));
      const items = Array.isArray(data.items) ? data.items : [];
      if (!items.length) return { ok: false, detail: 'the feed returned no items to inspect' };
      /* A live catalog need not contain a browser advisory on any given
         day, so absence is not proof of staleness. What IS proof is a
         Chromium/Firefox entry that came back tagged 'general'. */
      const misTagged = items.filter((i) => {
        const s = `${i.vendor || ''} ${i.product || ''}`.toLowerCase();
        const isBrowser = /chrome|chromium|firefox|safari/.test(s);
        return isBrowser && !(i.tags || []).includes('browser');
      });
      if (misTagged.length) {
        return { ok: false, detail: `${misTagged.length} browser advisory/advisories still tagged ${JSON.stringify(misTagged[0].tags)} (e.g. ${misTagged[0].vendor} ${misTagged[0].product})` };
      }
      const tagged = items.filter((i) => (i.tags || []).includes('browser')).length;
      return { ok: true, detail: tagged ? `${tagged} item(s) correctly tagged 'browser'` : "no browser advisories in today's feed, and none mis-tagged" };
    }
  }
];

function readConfiguredUrls() {
  const src = readFileSync(CONFIG_PATH, 'utf8');
  const out = {};
  for (const { key } of CHECKS) {
    const nested = new RegExp(key + '\\s*:\\s*\\{[^}]*?url\\s*:\\s*[\'"]([^\'"]*)[\'"]', 's');
    const flat = new RegExp(key + '\\s*:\\s*[\'"]([^\'"]*)[\'"]');
    const m = src.match(nested) || src.match(flat);
    out[key] = m ? m[1] : null;
  }
  return out;
}

/* Which release the running provision function matches, read off the
   combination of signatures above. "Stale" alone is not actionable —
   the first thing you need after a redeploy that changed nothing is
   whether the running code moved AT ALL, because "still exactly the
   old version" and "moved, but not far enough" point at completely
   different mistakes. The first means the paste never reached this
   function; the second means it did and you are missing a later
   commit. */
const PROVISION_ERAS = [
  { authGate: false, leaksReason: true, era: '2026-08-12 (24af8a7c…9d4349fb)' },
  { authGate: false, leaksReason: false, era: '2026-08-16 (d9398195)' },
  { authGate: true, leaksReason: true, era: 'inconsistent — an auth gate but the old revocation response; check you pasted a whole file' }
];

function describeProvisionEra(results) {
  const gate = results.get('provision-auth-gate');
  const reason = results.get('provision-revocation-reason');
  if (!gate || !reason) return null;
  if (gate.ok && reason.ok) return null; // current; nothing to date
  const match = PROVISION_ERAS.find((e) => e.authGate === gate.ok && e.leaksReason === !reason.ok);
  return match ? match.era : 'unrecognised — the running code matches no release this script knows about';
}

async function main() {
  const urls = readConfiguredUrls();
  const stale = [];
  const results = new Map();

  console.log('Checking whether each deployed Lambda is running current code\n');

  for (const check of CHECKS) {
    const url = urls[check.key];
    if (!url) { console.log(`  SKIP  ${check.label} (${check.key} is empty — feature disabled)`); continue; }

    let result;
    try {
      result = await check.probe(url);
    } catch (e) {
      result = { ok: false, detail: `request failed: ${e.message}` };
    }

    if (check.id) results.set(check.id, result);

    if (result.ok) {
      console.log(`  CURRENT  ${check.label}\n           ${result.detail}`);
    } else {
      stale.push(check);
      console.log(`  STALE    ${check.label}`);
      console.log(`           ${result.detail}`);
      console.log(`           missing: ${check.commit}`);
      console.log(`           while stale, this endpoint ${check.stale}`);
    }
    console.log('');
  }

  if (stale.length) {
    console.log(`${stale.length} deployed Lambda behaviour(s) predate this repository.`);
    const era = describeProvisionEra(results);
    if (era) console.log(`The running provision function matches lambda/provision.js as of ${era}.`);
    console.log('');
    console.log('Redeploy by pasting the file from lambda/ into the AWS console');
    console.log('(Lambda -> the function -> Code -> index.mjs -> Deploy), then re-run this.');
    console.log('');
    console.log('IF YOU BELIEVE YOU ALREADY REDEPLOYED and the era above has not moved,');
    console.log('the paste did not reach the function this URL invokes. In order of how');
    console.log('often each one is the answer:');
    console.log('  1. The console editor keeps unsaved edits indefinitely and still shows');
    console.log('     your new code. Changes go live only on **Deploy** (Ctrl+Shift+U), not');
    console.log('     Save. A greyed-out Deploy button means it already went live.');
    console.log('  2. The API Gateway route points at a different function, or at a');
    console.log('     published VERSION or ALIAS rather than $LATEST — editing $LATEST then');
    console.log('     changes nothing for callers. Check: API Gateway -> the API -> Routes');
    console.log('     -> the POST route -> Integration, and see exactly which function ARN');
    console.log('     (and whether it ends in a :version or :alias) it names.');
    console.log('  3. Two similarly-named functions exist and the edit went to the other.');
    console.log('     The URL being probed is the only authority on which one matters:');
    console.log(`       ${urls.selfServeActivateUrl || '(none configured)'}`);
    process.exit(1);
  }
  console.log('Every probed endpoint is running current code.');
}

main().catch((e) => { console.error(e); process.exit(1); });
