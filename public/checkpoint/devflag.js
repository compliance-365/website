/* ============================================================
   Checkpoint — local development bypass
   ------------------------------------------------------------
   Shared between the client app and the separate internal-only
   console (public/owner/) — loaded via a relative path from either
   directory so both build against the exact same file, never two
   copies to keep in sync.

   The internal-only console (owner.js) reads this flag to let a
   developer preview its UI on a real (non-demo) tenant WITHOUT a
   genuine signed partner activation file lying around — see owner.js's
   own use of lib.js's isDevBypassActive(). The client app (app.js) no
   longer reads this flag at all — it has no owner/partner-only UI left
   to preview since that entire console moved to its own bundle.

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
   (both dist/checkpoint/devflag.js and, via the same file, whatever
   dist/owner/index.html references) and asserts the rewrite took,
   immediately failing the build otherwise — see that function's own
   comment for why this is enforced at build time rather than left to
   code review alone. test/dev-bypass.test.mjs covers both the rewrite
   and the flag-plus-hostname gate itself. */
window.CHECKPOINT_DEV_BYPASS = true;
