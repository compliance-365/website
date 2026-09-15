#!/usr/bin/env node
/* Checks that every Lambda endpoint config.js points at will actually
 * answer the browser — specifically that its CORS preflight allows the
 * exact method and headers app.js really sends.
 *
 * WHY THIS EXISTS
 * ---------------
 * Every one of these Lambdas sets correct CORS headers in its own code.
 * None of that matters: the moment CORS is switched on at the API
 * Gateway level, the gateway OWNS cors and strips whatever the
 * integration returned. So the Lambda source reads correct, the code
 * review passes, and the browser is still blocked — and the failure is
 * invisible from the server side, because the request SUCCEEDS. The
 * Lambda runs, returns 200 and real data, and the browser throws the
 * response away for want of one header. Nothing is logged anywhere that
 * says so.
 *
 * Three separate misconfigurations were found by hand in one session,
 * each a DIFFERENT missing field, and two of them on endpoints nobody
 * had noticed were broken:
 *   - threat intel:  CORS enabled, allow-origin never populated
 *   - provision:     origin and methods set, allow-headers left empty
 *   - marketplace:   CORS never configured at all
 * Reading the Lambda source would not have found any of them. Only
 * asking the deployed endpoint does.
 *
 * WHAT IT DOES NOT DO
 * -------------------
 * It sends a preflight (OPTIONS) and nothing else — no POST, no body,
 * no credentials. A preflight is a metadata question ("would you allow
 * this?"), so this is safe to run against production and cannot
 * provision, sign, charge or mutate anything. It is deliberately NOT
 * part of `npm test`: the suite must stay offline and deterministic,
 * and a network check that fails when someone's wifi drops is worse
 * than no check. Run it after touching a gateway, and before a release
 * that depends on one.
 *
 *   npm run check:cors
 *   npm run check:cors -- --origin https://staging.example.com
 *
 * Exit code is 1 if any endpoint fails, so it works as a deploy gate.
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CONFIG_PATH = join(ROOT, 'public/checkpoint/config.js');

const DEFAULT_ORIGIN = 'https://www.compliance365.com.au';
const originArg = process.argv.indexOf('--origin');
const ORIGIN = originArg !== -1 ? process.argv[originArg + 1] : DEFAULT_ORIGIN;

/* The request each endpoint actually receives from the browser, taken
   from the fetch() call sites in app.js / owner.js. `headers` is what
   goes in Access-Control-Request-Headers — and it is the field that
   matters most, because a request carrying ANY of them is no longer a
   "simple" request and forces a preflight. threatIntel is the one
   plain GET here: no custom headers, so no preflight, so an empty
   allow-headers on that gateway is harmless rather than fatal. That
   asymmetry is exactly why "it works for the feed, so CORS is fine"
   was a wrong inference. */
const ENDPOINTS = [
  { key: 'threatIntelUrl', label: 'Threat intel (KEV feed)', method: 'GET', headers: [] },
  { key: 'selfServeActivateUrl', label: 'Self-serve activation', method: 'POST', headers: ['content-type', 'authorization'] },
  { key: 'marketplaceFulfillmentUrl', label: 'Marketplace fulfillment', method: 'POST', headers: ['content-type', 'authorization'] },
  { key: 'errorReportUrl', label: 'Error reporting', method: 'POST', headers: ['content-type'] },
  { key: 'signingEndpoint', label: 'Entitlement signing', method: 'POST', headers: ['content-type', 'authorization'] }
];

/* Read the URLs out of config.js rather than restating them here, so
   this can never check an endpoint the app no longer uses, or miss one
   it has been repointed at. config.js is a plain browser script with no
   exports, so it is parsed rather than imported. */
function readConfiguredUrls() {
  const src = readFileSync(CONFIG_PATH, 'utf8');
  const out = {};
  for (const { key } of ENDPOINTS) {
    // signingEndpoint is an object with a url; the rest are bare strings.
    const nested = new RegExp(key + '\\s*:\\s*\\{[^}]*?url\\s*:\\s*[\'"]([^\'"]*)[\'"]', 's');
    const flat = new RegExp(key + '\\s*:\\s*[\'"]([^\'"]*)[\'"]');
    const m = src.match(nested) || src.match(flat);
    out[key] = m ? m[1] : null;
  }
  return out;
}

async function preflight(url, method, headers) {
  const h = {
    Origin: ORIGIN,
    'Access-Control-Request-Method': method
  };
  if (headers.length) h['Access-Control-Request-Headers'] = headers.join(',');
  const res = await fetch(url, { method: 'OPTIONS', headers: h });
  return {
    status: res.status,
    allowOrigin: res.headers.get('access-control-allow-origin'),
    allowMethods: res.headers.get('access-control-allow-methods'),
    allowHeaders: res.headers.get('access-control-allow-headers'),
    maxAge: res.headers.get('access-control-max-age')
  };
}

/* A simple request (GET, no custom headers) never preflights, so for
   those the question is only whether the real response carries an
   allow-origin the browser accepts. */
async function simpleRequest(url) {
  const res = await fetch(url, { method: 'GET', headers: { Origin: ORIGIN } });
  return { status: res.status, allowOrigin: res.headers.get('access-control-allow-origin') };
}

function originOk(value) {
  return value === '*' || value === ORIGIN;
}

async function main() {
  const urls = readConfiguredUrls();
  const failures = [];
  const skipped = [];

  console.log(`Checking CORS as origin ${ORIGIN}\n`);

  for (const ep of ENDPOINTS) {
    const url = urls[ep.key];
    /* An empty URL is a deliberate state everywhere in this app — the
       feature is simply never attempted — so it is not a failure. */
    if (!url) { skipped.push(`${ep.label} (${ep.key} is empty — feature disabled)`); continue; }

    let result, problems = [];
    try {
      result = ep.headers.length || ep.method !== 'GET'
        ? await preflight(url, ep.method, ep.headers)
        : await simpleRequest(url);
    } catch (e) {
      failures.push({ label: ep.label, url, problems: [`request failed: ${e.message}`] });
      console.log(`  FAIL  ${ep.label}\n        request failed: ${e.message}\n`);
      continue;
    }

    if (!result.allowOrigin) {
      problems.push(ep.headers.length
        ? `no Access-Control-Allow-Origin in the preflight response. The gateway rejected it — most often because Access-Control-Allow-Headers does not list ${ep.headers.join(' and ')}.`
        : 'no Access-Control-Allow-Origin on the response.');
    } else if (!originOk(result.allowOrigin)) {
      problems.push(`Access-Control-Allow-Origin is "${result.allowOrigin}", which does not match ${ORIGIN}`);
    }

    if (problems.length) {
      failures.push({ label: ep.label, url, problems });
      console.log(`  FAIL  ${ep.label}`);
      problems.forEach((p) => console.log(`        ${p}`));
      console.log(`        ${url}`);
      console.log(`        needs: method ${ep.method}${ep.headers.length ? `, headers ${ep.headers.join(', ')}` : ', no custom headers'}\n`);
    } else {
      const extra = result.allowHeaders !== undefined && ep.headers.length
        ? `  allow-headers=${result.allowHeaders || '(empty)'}` : '';
      console.log(`  PASS  ${ep.label}  origin=${result.allowOrigin}${extra}`);
      /* Not a failure, but worth saying: a zero max-age means every
         single call pays a second round trip for the preflight. */
      if (result.maxAge === '0') console.log('        note: Access-Control-Max-Age is 0 — every call re-preflights');
    }
  }

  skipped.forEach((s) => console.log(`  SKIP  ${s}`));

  if (failures.length) {
    console.log(`\n${failures.length} endpoint(s) will be blocked by the browser.`);
    console.log('Fix in API Gateway -> the API -> CORS. A known-good configuration on');
    console.log('this account, for a POST endpoint that sends a bearer token, is:');
    console.log('    Access-Control-Allow-Origin:  https://www.compliance365.com.au');
    console.log('    Access-Control-Allow-Methods: OPTIONS, POST');
    console.log('    Access-Control-Allow-Headers: authorization, content-type');
    console.log('    Access-Control-Max-Age:       300');
    process.exit(1);
  }
  console.log('\nAll configured endpoints answer the browser correctly.');
}

main().catch((e) => { console.error(e); process.exit(1); });
