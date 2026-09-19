#!/usr/bin/env node
/* Checks that the response headers a CDN is supposed to be adding in
 * front of GitHub Pages are actually arriving at the browser.
 *
 * WHY THIS EXISTS
 * ---------------
 * GitHub Pages cannot send custom response headers. Everything the app
 * can enforce on its own it already does through index.html's CSP
 * <meta> tag — but four things can ONLY travel as real headers, and a
 * <meta> tag carrying them is silently ignored by every browser:
 *
 *   - X-Frame-Options          clickjacking
 *   - CSP frame-ancestors      clickjacking (the modern spelling)
 *   - Strict-Transport-Security
 *   - Referrer-Policy
 *
 * So they are added by a proxy/CDN in front of the origin (see
 * RELEASE.md §5). That makes them infrastructure, configured in someone
 * else's dashboard, with nothing in this repo that would fail if the
 * rule were deleted, disabled, or quietly stopped matching after a DNS
 * or plan change. A dashboard toggle is exactly the kind of control
 * that rots silently: the site still serves, every page still works,
 * and the protection is simply gone.
 *
 * Reading the CDN config would not catch that either — only asking the
 * live URL does.
 *
 * THE TWO VALUES THAT MATTER, AND WHY THEY ARE NOT THE STRICT ONES
 * ----------------------------------------------------------------
 * Checkpoint signs in with MSAL, and graph.js sets
 *
 *     redirectUri: location.origin + location.pathname
 *
 * — the app's own page. MSAL's silent token renewal
 * (acquireTokenSilent, used for every Graph call) can run the authorize
 * request in a HIDDEN IFRAME, which Entra then redirects back to that
 * redirect URI. The app therefore legitimately frames ITSELF,
 * same-origin, as part of normal authentication.
 *
 * So the correct values are the same-origin ones:
 *
 *     X-Frame-Options: SAMEORIGIN          (NOT DENY)
 *     Content-Security-Policy: frame-ancestors 'self'   (NOT 'none')
 *
 * DENY / 'none' would block the renewal frame and users would get
 * apparently-random sign-outs whenever a cached token expired. The
 * deleted public/checkpoint/staticwebapp.config.json specified exactly
 * those two stricter values, which is one more reason it was a bad
 * starting point. This check fails on them deliberately, rather than
 * treating "stricter" as "better".
 *
 * WHAT IT DOES NOT DO
 * -------------------
 * One GET, no credentials, no body — it reads response headers and
 * nothing else, so it is safe against production and cannot mutate
 * anything. It is deliberately NOT part of `npm test`: the suite stays
 * offline and deterministic, and a network check that fails when
 * someone's wifi drops is worse than no check. Run it after touching
 * the CDN, after a DNS change, and before a release that claims these
 * headers are in force.
 *
 *   npm run check:headers
 *   npm run check:headers -- --url https://staging.example.com/checkpoint/
 */
import process from 'node:process';

const DEFAULT_URL = 'https://www.compliance365.com.au/checkpoint/';

const argUrl = (() => {
  const i = process.argv.indexOf('--url');
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : DEFAULT_URL;
})();

/* Each check returns null when satisfied, or a string saying what is
   wrong. `fatal: false` entries are reported but do not fail the run —
   GitHub Pages already sends nosniff itself, so that one is a "nice to
   confirm", not a regression when absent. */
const CHECKS = [
  {
    header: 'x-frame-options',
    fatal: true,
    check: v => {
      if (!v) return 'missing — no clickjacking protection';
      const got = v.trim().toUpperCase();
      if (got === 'SAMEORIGIN') return null;
      if (got === 'DENY') return "set to DENY — blocks MSAL's same-origin silent-renewal iframe; use SAMEORIGIN";
      return `unexpected value ${JSON.stringify(v)} — expected SAMEORIGIN`;
    }
  },
  {
    header: 'content-security-policy',
    fatal: true,
    check: v => {
      if (!v) return "missing — expected a header CSP carrying frame-ancestors 'self'";
      const m = /frame-ancestors([^;]*)/i.exec(v);
      if (!m) return "present but has no frame-ancestors directive (the meta CSP cannot supply one)";
      const val = m[1].trim().toLowerCase();
      if (val === "'self'") return null;
      if (val === "'none'") return "frame-ancestors 'none' — blocks MSAL's same-origin silent-renewal iframe; use 'self'";
      return `frame-ancestors ${JSON.stringify(val)} — expected 'self'`;
    }
  },
  {
    header: 'strict-transport-security',
    fatal: true,
    check: v => {
      if (!v) return 'missing';
      const m = /max-age=(\d+)/i.exec(v);
      if (!m) return `no max-age in ${JSON.stringify(v)}`;
      const age = Number(m[1]);
      if (age < 86400) return `max-age=${age} is under a day — too short to be meaningful`;
      return null;
    }
  },
  {
    header: 'referrer-policy',
    fatal: true,
    check: v => (v ? null : 'missing')
  },
  {
    header: 'x-content-type-options',
    fatal: false,
    check: v => (v && v.trim().toLowerCase() === 'nosniff' ? null : 'not nosniff (GitHub Pages normally supplies this itself)')
  }
];

let res;
try {
  res = await fetch(argUrl, { redirect: 'follow' });
} catch (e) {
  console.error(`check:headers — could not reach ${argUrl}\n  ${e.message}`);
  process.exit(2);
}

console.log(`check:headers — ${argUrl} (HTTP ${res.status})\n`);

/* A non-2xx response did not come from the page, so its headers say
   nothing about the page's headers. Judging them anyway produces a
   confident, wrong "4 required headers missing" — which is exactly what
   this script did the first time it was run from behind a filtering
   proxy that answers 403 host_not_allowed on its own behalf. Captive
   portals, corporate proxies, a WAF block and a plain outage all land
   here. Stop instead, with an exit code distinct from a real failure. */
if (!res.ok) {
  const reason = res.headers.get('x-deny-reason');
  console.error(
    `Not a successful response, so nothing here describes the real page — not checking.\n` +
    (reason ? `  The responder gave x-deny-reason: ${reason}\n` : '') +
    `  A proxy, WAF, captive portal or outage can answer in the site's place.\n` +
    `  Re-run from a network that can reach the host directly.`
  );
  process.exit(2);
}

let failed = 0;
let warned = 0;
for (const { header, check, fatal } of CHECKS) {
  const problem = check(res.headers.get(header));
  if (!problem) {
    console.log(`  ok    ${header}: ${res.headers.get(header)}`);
  } else if (fatal) {
    failed++;
    console.log(`  FAIL  ${header}: ${problem}`);
  } else {
    warned++;
    console.log(`  warn  ${header}: ${problem}`);
  }
}

console.log('');
if (failed) {
  console.error(
    `${failed} required header(s) not in force. If the CDN was meant to add these, ` +
    `re-check its response-header rule and that the hostname is actually proxied ` +
    `through it — see public/checkpoint/RELEASE.md §5.`
  );
  process.exit(1);
}
console.log(`All required headers present${warned ? ` (${warned} warning(s))` : ''}.`);
