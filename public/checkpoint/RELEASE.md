# Checkpoint — Release & Integrity Guide

This is the practitioner-facing companion to `SETUP.md`, focused specifically
on how a release is built, how its integrity is verified, and what to do if
something in the delivery chain (repo, CI, hosting) is ever suspected of
being compromised. `SETUP.md` covers app registration, permissions and
day-to-day operation; this file covers *shipping it safely*.

---

## 1. Cache-busting, not content-hashed filenames

Checkpoint does not use a build step that renames files to a content hash
(e.g. `app.a1b2c3.js`) the way a bundler-based deploy pipeline would. It's
five plain files (`config.js`, `graph.js`, `store.js`, `app.js`,
`index.html`) served as-is, with a **`?v=N` query-string cache-buster** on
each `<script src="...">` tag in `index.html`.

**The rule**: bump `N` on *every one of the four JS files' tags* whenever
any of them changes, even if only one file actually changed — browsers and
any intermediate CDN cache each URL independently, and a stale copy of
just one of the four is enough to break the app in confusing ways (this
bit the project early on; see the git history around the first few
Checkpoint commits for what that looked like in practice). This is a
simpler, deliberate alternative to content-hashed filenames — no build
step is required to produce or reference the hash, at the cost of relying
on a human (or a pre-commit check, not currently wired up) to remember to
bump the number. If that discipline ever slips enough to be a real
problem, moving to content-hashed filenames via a small build script is
the natural next step — it wasn't done now because the manual convention
has been sufficient in practice and this app has no other build tooling
to hook into.

`msal-browser.min.js` and the two font files (`fonts/fraunces.woff2`,
`fonts/manrope.woff2`) are vendored binaries, not source files edited in
place — see §2 for how those get updated.

---

## 2. Regenerating the MSAL Subresource Integrity (SRI) hash

MSAL is vendored locally (`public/checkpoint/msal-browser.min.js`) rather
than loaded from a CDN, and its `<script>` tag in `index.html` carries an
`integrity="sha384-..."` attribute. **Both the pinned version and the hash
must be updated together** whenever MSAL is upgraded — an upgrade with a
stale hash will fail closed (the browser refuses to execute the script at
all, breaking sign-in), which is the correct failure mode but worth knowing
in advance rather than debugging live.

To upgrade to a new version (replace `3.30.0` with the target version):

```bash
# 1. Download the exact npm package tarball for the target version —
#    not jsdelivr, not unpkg — the primary source of truth.
curl -sL "https://registry.npmjs.org/@azure/msal-browser/-/msal-browser-3.30.0.tgz" \
  -o msal-browser-3.30.0.tgz

# 2. Extract just the minified browser bundle.
tar xzf msal-browser-3.30.0.tgz package/lib/msal-browser.min.js

# 3. Replace the vendored file.
cp package/lib/msal-browser.min.js public/checkpoint/msal-browser.min.js

# 4. Compute its SHA-384 hash in the exact SRI-attribute format.
openssl dgst -sha384 -binary public/checkpoint/msal-browser.min.js \
  | openssl base64 -A
# → paste the output after "sha384-" in index.html's <script integrity="...">

# 5. Clean up.
rm -rf msal-browser-3.30.0.tgz package/
```

Then in `index.html`:
- Update `msal-browser.min.js?v=3.30.0` (both places: the filename's query
  string *and* the `integrity` attribute) to the new version/hash.
- Bump the `?v=N` cache-buster on `config.js`/`graph.js`/`store.js`/`app.js`
  too if you're shipping this alongside any other change (see §1) — not
  strictly required for the MSAL bump alone, since its own version string
  in the URL already busts *its* cache, but keep the habit.

**Why the npm tarball and not jsdelivr/unpkg directly**: those CDNs mirror
npm's published files unmodified, so the hash should match either way — but
downloading from the registry directly removes a CDN from the trust chain
for the one step that determines what ships in the app, rather than
trusting that a CDN response at hash-computation time is the same bytes a
browser fetches later (which is the entire threat SRI exists to catch).

**Regenerating the font files**: if a new weight/style is ever needed,
re-fetch from Google Fonts' CSS API with a real browser User-Agent (Google
serves different files per client), extract the Latin-subset `@font-face`
block's `src` URL, and `curl` that `.woff2` directly — see the git history
for the exact commands used the first time (search for "self-host" in the
Checkpoint commits). Font files aren't SRI-hashed in `index.html` because
they're referenced from `@font-face` `src: url(...)` in a `<style>` block,
not a `<link>` tag — SRI only applies to `<script>` and `<link rel=
"stylesheet">`/`<link rel="modulepreload">` elements per spec.

---

## 3. Branch protection & required review

**Not currently configured** — this is a recommendation for the repository
owner to apply via GitHub (Settings → Branches → Branch protection rules
for `main`), not something applied automatically by shipping this file:

- Require a pull request before merging to `main` (no direct pushes).
- Require at least one approving review.
- Require status checks to pass before merging, once any CI checks exist
  beyond the deploy workflow itself.
- Do not allow force-pushes or branch deletion for `main`.
- Consider requiring signed commits if multiple people gain push access.

The reasoning: `.github/workflows/deploy.yml` publishes straight to
production on every push to `main` with no build/test gate today. Branch
protection plus required review is the cheapest control available to make
sure a compromised or careless commit can't reach production unreviewed —
it costs nothing to configure and doesn't require any code change, just an
admin visiting the repo settings once.

---

## 4. Hosting-compromise runbook

Checkpoint's hosting is `compliance365.com.au` → GitHub Pages, built and
deployed by `.github/workflows/deploy.yml` on every push to `main`. If a
compromise of any part of that chain (GitHub account, Actions workflow,
DNS, or the deployed content itself) is ever suspected:

1. **Contain**: from a GitHub account with admin rights on
   `compliance-365/website`, revoke/rotate any potentially-compromised
   credentials first (personal access tokens, SSH keys, any Actions
   secrets — Checkpoint's own workflow doesn't currently use secrets, but
   check `.github/workflows/deploy.yml` for what it actually references
   at the time). If the GitHub account itself is compromised, start
   there: change its password, revoke all active sessions, re-enable/
   rotate 2FA.
2. **Stop the bleed**: disable GitHub Pages for the repository (Settings
   → Pages → set source to "None") to immediately take the site offline
   rather than continuing to serve a potentially-tampered build, or —
   if DNS/registrar-level compromise is suspected instead — that takes
   priority since disabling Pages won't help if traffic is being
   redirected before it ever reaches GitHub.
3. **Rotate the app's own trust anchors**:
   - In Entra (**entra.microsoft.com** → the Checkpoint app registration),
     consider rotating/regenerating anything sensitive if the app
     registration itself might have been altered — check API permissions
     match SETUP.md §2 exactly (an attacker with write access to the app
     registration could silently add a new permission).
   - If MSAL's vendored file or its SRI hash might have been altered by
     the compromise, re-derive both fresh from §2's procedure rather than
     trusting whatever is currently in the repo.
4. **Verify integrity before restoring service**: diff the suspect
   deployment against a known-good commit (`git diff <known-good-sha>
   HEAD -- public/checkpoint/`), specifically checking `index.html`'s CSP
   meta tag, the MSAL `integrity` hash, and `config.js`'s `clientId`/
   `authority` haven't been altered to point anywhere unexpected.
5. **Re-enable Pages** once the above is clean, and **notify any
   onboarded client tenants** if there's any chance their data (which
   lives in *their* SharePoint, not this hosting) could have been
   affected — e.g. if a tampered build could have exfiltrated tokens or
   redirected Graph calls. Checkpoint's architecture (no backend, client
   data never leaves the client's own tenant) limits blast radius here,
   but a compromised script served to a signed-in user's browser could
   still misuse their live delegated token for as long as they had the
   tampered page open.
6. **Post-incident**: apply §3's branch protection if not already done,
   and consider whether the compromise vector (leaked credential,
   dependency, social engineering) needs a structural fix beyond this
   one incident.
