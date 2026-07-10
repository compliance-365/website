/* ============================================================
   Checkpoint — local development bypass
   ------------------------------------------------------------
   Grants a synthetic 'partner' entitlement (every framework unlocked,
   Portfolio/Partner Console visible) automatically in DEMO MODE when
   running on localhost, so a developer can preview partner-only UI
   without needing a real signed activation file lying around — see
   app.js's simulatedEntitlementType(). Never touches a real (live
   tenant) sign-in; only demo mode ever reads this flag.

   Two independent gates, BOTH required (see lib.js's
   isDevBypassActive()): this flag AND location.hostname being
   'localhost' or '127.0.0.1'. Neither alone is enough — a stray
   `true` surviving into a real deployment still grants nothing unless
   that deployment is somehow also served from localhost, which a real
   client tenant never is.

   This file ships as `true` in SOURCE, deliberately — that's what
   makes `astro dev` and any other local server usable out of the box
   without a manual step. scripts/hash-checkpoint-assets.mjs's
   enforceDevBypassOff() forces this to `false` in every dist/ build
   and asserts the rewrite took, immediately failing the build
   otherwise — see that function's own comment for why this is
   enforced at build time rather than left to code review alone.
   test/dev-bypass.test.mjs covers both the rewrite and the
   flag-plus-hostname gate itself. */
window.CHECKPOINT_DEV_BYPASS = true;
