# Owner / Partner Console & Entitlement Persistence — Audit

Scope: `public/checkpoint/{app.js,store.js,lib.js,graph.js,config.js,devflag.js,index.html}`,
`tools/issue-entitlement.mjs`, `tools/ISSUANCE.md`, `scripts/hash-checkpoint-assets.mjs`,
`src/pages/checkpoint-console/index.astro`. No code was changed to produce this report.

**Note on the rating rubric**: the brief asks for each finding to be rated against
"Separation / Persistence / Truthfulness / Bootstrap / Auditability (defined in
`Checkpoint-Owner-Portal-Design.md` Part 2)". That file does not exist anywhere in this
repository or filesystem (checked by filename and by grepping for the dimension names
across all `.md` files). The ratings below use the plain-English reading of those five
words rather than a rubric I could not locate — flag this if the actual source document
turns up elsewhere, since its definitions may not match mine exactly:

- **Separation** — is partner/owner-only capability actually isolated from the
  client-facing surface (code, data, UI), or only nominally hidden?
- **Persistence** — does verified state survive reload / new tab / browser restart via
  durable, shared storage, or can it silently evaporate?
- **Truthfulness** — does the UI's reported state match what's actually durably true,
  including on failure?
- **Bootstrap** — can a tenant get from zero to a working, licensed state without a
  circular dependency blocking it?
- **Auditability** — is every material state change (and failure to persist one)
  visible after the fact, not just in a toast that's gone in 3.4 seconds?

Each dimension is rated **Pass / Weak / Fail** per finding.

---

## Top finding: confirmed root cause of the "forgotten activation" bug

**It is not the bootstrap chicken-and-egg described in the brief's hypothesis (a) in its
purest form — the wizard's first-time provisioning path actually avoids that deadlock
correctly (see "What's actually solid" below). The real, confirmed root cause is
hypothesis (c): SharePoint write failures on the activation persistence path are caught,
logged only as a transient toast, and never surfaced as a failure to the rest of the
flow — which then reports success anyway.**

`App.applyEntitlementFile`, the main path a practitioner uses to apply or renew an
activation (Frameworks & Settings view), `public/checkpoint/app.js:6734-6772`:

```js
try {
  await Store.setSetting('entitlementFile', result.raw);
  S.settings.entitlementFile = result.raw;
  await applyEntitlementFrameworks(result.evalResult);
} catch (e) { warn(e); }          // <- only a console.error + 3.4s toast
busy(false);
...
ENTITLEMENT_STATE = result.evalResult;      // <- set UNCONDITIONALLY, whether or not the write above succeeded
recomputeReadOnly();
...
toast('Activation verified and applied.');  // <- SUCCESS message shown even if the SharePoint write just failed
```

`Store.setSetting` (`public/checkpoint/store.js:1446-1453`) does a Graph `POST`/`PATCH`
against the tenant's "Checkpoint Settings" list. If that call throws for any reason
(throttling, a transient 5xx, a consent that lapsed, a network blip), `warn(e)`
(`app.js:1685`) shows `<b>Sync issue:</b> ...` for 3.4 seconds and nothing else — no
retry, no re-throw, no blocking of the "success" flow that follows immediately after.
The practitioner sees "Activation verified and applied," closes the tab satisfied.

On the **next** load (reload, new tab, another practitioner, browser restart),
`Store.load()` rebuilds `S.settings` entirely fresh from a live Graph read of the
Settings list (`store.js:1349-1356`) — there is no client-side cache to fall back to.
If the write silently failed, `S.settings.entitlementFile` is empty again.
`reconcileEntitlementsOnLoad()` (`app.js:7738-7775`) then logs `'Activation missing'`
to the audit log and returns `false`, and the tenant is bounced to the "This tenant
isn't activated" gate screen (`app.js:7880`) — with **no record anywhere that an
activation was ever successfully verified in a prior session.** The only trace is a
toast nobody was necessarily still looking at.

The exact same pattern repeats at every other write site on this path:
- `runWizardProvisioning()` — `app.js:8206-8208` (the `entitlementFile` write itself),
  `8215`, `8228`, `8247`, and even the terminal `onboardedDate` marker at `8263` — every
  one is `try { await Store.setSetting/setEntitlement(...) } catch (e) { warn(e); }`,
  and the wizard still advances to the success screen (`showWizardStep(9)`, line 8265)
  regardless.
- `retryActivationFromGate()` — `app.js:7913` — identical pattern on the "not
  activated" gate's own retry path.

**Rating**: Persistence — **Fail** (the "durable" store can silently not durably
store). Truthfulness — **Fail** (UI states "verified and applied" independent of
whether the write landed). Auditability — **Weak** (a toast exists, but nothing
durable records the failure — the audit log entry that *would* prove this happened is
itself one of the writes that can silently not happen). Bootstrap — **Weak** (see next
finding, which this one feeds). Separation — N/A.

---

## Finding 2 — Self-defeating recovery loop when a returning tenant's cached activation can't be read and a list still needs creating

This is the concrete way finding #1 (or an admin editing/deleting the Settings row
directly) becomes **permanently stuck**, not just "wrong once."

`assertActivationAuthorizesProvisioning()` (`store.js:1017-1021`) blocks **creation**
of any missing SharePoint list unless `window.CHECKPOINT_ACTIVATION.verified` is
`true`. For a returning tenant, that flag is set from a **read-only pre-check** of the
*cached* file, `readCachedActivation()` + `verifyActivationRaw()`
(`app.js:7846-7849`, `store.js:963-985`):

```js
try { cached = await Store.readCachedActivation(); } catch (e) { cached = { raw: null }; }
var preCheck = cached && cached.raw ? await verifyActivationRaw(cached.raw, acceptIds) : null;
window.CHECKPOINT_ACTIVATION = { verified: !!(preCheck && preCheck.ok) };
```

If the cached `entitlementFile` value is empty (finding #1), corrupted, or the
Settings list itself can't be read, `verified` is `false`. `ensureLists()`
(`store.js:1023-1044`) only needs this flag when it finds an **actual list missing** —
which normally never happens for an already-onboarded tenant, *except* exactly the
self-heal case the code's own comments anticipate (`app.js:7841-7844`): "a tenant
provisioned before a new [list/framework] was added." When both conditions coincide —
stale/missing cached activation **and** a list needing (re)creation —
`Store.load()` throws, `S` is never assigned, and `startLive()`'s catch
(`app.js:7861-7869`) shows the **"not activated" gate screen**, telling the user to
paste a file.

The user does exactly that. `retryActivationFromGate()` (`app.js:7893-7922`):

```js
if (Store && S) {
  try { await Store.setSetting('entitlementFile', rawText); S.settings.entitlementFile = rawText; } catch (e) { warn(e); }
  var proceed = await reconcileEntitlementsOnLoad(acceptIds);
  ...
} else {
  window.CHECKPOINT_ACTIVATION = { verified: true };
  await startLive();
}
```

Because `Store.load()` never succeeded the first time, `S` is still `undefined` — this
takes the **`else` branch**. It sets the in-memory flag and calls `startLive()` again.
But `startLive()`'s own first act (`app.js:7849`) is to **recompute
`window.CHECKPOINT_ACTIVATION` from the cached (still-empty/invalid) SharePoint value**
— which immediately overwrites the `verified: true` just set. The newly-pasted,
freshly-verified `rawText` is **never persisted anywhere in this branch** — the
variable simply falls out of scope once `retryActivationFromGate()` returns. The
tenant lands back on the exact same gate screen. Pasting the same, genuinely valid
file again produces the exact same result, indefinitely — there is no code path in
this branch that breaks the loop.

This is the sharpest, most literal confirmation of hypothesis (a)'s spirit — not "the
Settings list doesn't exist yet for a brand-new tenant" (that path, via the wizard, is
handled correctly — see below), but "a *returning* tenant whose activation cache is
unreadable, at the moment a list needs creating, has no working recovery path through
the UI it's shown."

**Rating**: Bootstrap — **Fail** (unrecoverable loop through the intended recovery UI).
Persistence — **Fail** (the one write that would fix it never happens on this path).
Truthfulness — **Weak** (no error is shown — the user isn't told the paste didn't
stick; it just silently re-shows the same screen). Auditability — **Fail** (no audit
entry distinguishes "genuinely still invalid" from "verified but not saved").

### What's actually solid (so this isn't over-claimed)

The **first-time** wizard path does **not** have the circular dependency as literally
stated in hypothesis (a). `verifyActivationRaw()` is pure with respect to
Store/SharePoint (confirmed by reading the full function, `app.js:7588-7611` — no
`Store.`/`Graph.` calls inside it) — a brand-new tenant's file is Ed25519-verified
entirely in-browser *before* any list exists (wizard step 4,
`runWizardActivationCheck()`, `app.js:8102-8144`). That in-memory result then
authorizes `ensureLists()` to create the Settings list for the first time
(`runWizardProvisioning()`, `app.js:8202`), and only *after* that succeeds does the
raw file get written into the newly-created list (`app.js:8206-8208`). A genuinely
never-onboarded tenant also cannot reach `startLive()` directly — `afterSignIn()`
(`app.js:7931-7941`) always routes an unprovisioned tenant through the wizard, gated on
`probeOnboardingState()` (`store.js:948-961`) finding an `onboardedDate` row. Finding
#2 above requires an **already-onboarded** tenant to hit this specific edge — it is
real and reachable, but it is not "every brand-new tenant hits a deadlock."

---

## Finding 3 — A transient Graph failure is indistinguishable from "wrong tenant"

Tenant matching itself is **soundly designed**, contrary to hypothesis (d) taken
literally: `evaluateEntitlement()` (`lib.js:922-946`) matches the payload's `tenantId`
against an **array** of acceptable identifiers, not a single value, and that array
(`tenantIdsFor()`, `app.js:7575-7578`) is built from **both** the tenant's Entra GUID
*and* every verified domain, fetched live via `GET /organization?$select=id,
displayName,verifiedDomains` (`graph.js:519-531`) — exactly mirroring
`tools/issue-entitlement.mjs --tenant` accepting either a GUID or a domain
(`ISSUANCE.md` §3). So a domain-issued file correctly matches a GUID-reporting tenant
and vice versa, by design, not by accident.

The problem is what happens when that one Graph call **fails** — throttled,
`Directory.Read.All` not yet consented, transient network error. `tenantInfo()`
catches internally and returns `null` (`graph.js:529`); `tenantIdsFor(null)` returns
`[]` (`app.js:7576`); an empty acceptable-ids array can never match anything, so
`evaluateEntitlement()` always reports `'mismatch'` — **regardless of whether the
activation is actually valid for this tenant.** The user sees: *"This activation file
is issued for a different tenant"* (`app.js:7608`) — an actively misleading message
for what is really "we couldn't ask Microsoft who you are just now." This will send
support down the wrong path (re-issuing a file that was never the problem) rather than
"retry" or "check Graph/consent status."

This is a deliberate fail-safe choice (never grant a false "valid," per the code's own
comment at `app.js:7571-7574`) — reasonable from a security standpoint, but it comes at
a real cost to diagnosability that's worth calling out explicitly, since it's the exact
kind of thing that produces "the activation just stopped working" support tickets that
are actually a Graph hiccup.

**Rating**: Truthfulness — **Weak** (message asserts a specific wrong cause).
Auditability — **Weak** (the audit log entry, `'Activation rejected'`, records the
generic reason string, not that the underlying cause was an empty tenant-info lookup).
Separation/Persistence/Bootstrap — N/A.

---

## Finding 4 — No real separation between partner/owner code and the client-facing bundle

There is **one** shipped entry point, `public/checkpoint/index.html`, loading one
`app.js`/`store.js`/`lib.js`/`graph.js` set for every visitor — client tenants, demo
users, and Compliance365's own partner session alike. There is no separate build, no
separate route, no code-splitting. Gating is entirely client-side:
`currentEntitlementType() === 'partner'` (`app.js:232-236`) toggles `display:none` on
the nav item (`renderFeatureVisibility()`, `app.js:4651-4661`) and short-circuits
`renderPartnerConsole()` (`app.js:2786`) — the markup itself (`index.html:1591-1606`)
and the full Partner Console JS (`app.js:2589-2941` region: client roster, renewal
countdowns, licensing matrix, per-client sync) ship to every browser regardless.

What a client can learn by reading the shipped source, without any special access:
- The entire Partner Console feature and its SharePoint schema — the
  `Checkpoint Partner PartnerClients`/`PartnerEntitlements` list column definitions
  (`store.js` `PARTNER_DEFS`, ~line 902-919) and every rendering function.
- The complete Ed25519 verification scheme, canonical-JSON signing convention, and the
  public key itself (`config.js:89`) — enough to understand exactly what a valid
  activation file must contain (not enough to forge one without the private key, which
  never ships — `tools/issue-entitlement.mjs`'s generated `entitlement-private.json`).
- Debug hooks that are inert in production but fully legible in source: the
  `?entType=partner|demo|client` query param and `CHECKPOINT_DEV_BYPASS`
  (`app.js:226-231`).
- `Store.setEntitlement(fw, enabled)` (`store.js:1438-1445`) has **no entitlement or
  role check inside the function itself** — it just patches/creates a row in the
  tenant's own "Entitlements" list. Any signed-in user with SharePoint edit rights on
  the Checkpoint site (which every practitioner already has, by design) could call
  `Store.setEntitlement('soc2', true)` from the browser console to flip a premium
  framework's *display* on. This isn't a privilege escalation beyond what the UI
  already lets that user do via other buttons, but it confirms the JS-level "gate" is
  cosmetic, not a boundary — same principle the code's own `#gate`/READONLY comments
  (`app.js:151-159`) already state explicitly ("this is UX only, never enforcement").

What genuinely **is** protected, and why: actual partner *data* (other clients'
tenant IDs, contacts, sync snapshots) lives in Compliance365's own SharePoint site.
A client's Graph token is scoped to their own tenant by Microsoft 365's own
architecture — it cannot reach a different tenant's SharePoint regardless of what the
client-side code believes about `currentEntitlementType()`. So no client can exfiltrate
another client's data this way; what leaks is business logic, schema, and internal
conventions (e.g., the `--i-know` speed-bump concept), not data.

**Rating**: Separation — **Weak** (code/schema fully exposed; actual cross-tenant data
access is blocked by Microsoft 365's tenant isolation, not by this app's design).
Truthfulness/Persistence/Bootstrap/Auditability — N/A.

---

## Finding 5 — Local dev bypass is well-built, but structurally never exercises the real activation path

`devflag.js:27` ships `window.CHECKPOINT_DEV_BYPASS = true` in source, deliberately, so
`astro dev` previews partner UI without a real file. `isDevBypassActive()`
(`lib.js:956-958`) requires **both** the flag and a `localhost`/`127.0.0.1` hostname.
`scripts/hash-checkpoint-assets.mjs`'s `enforceDevBypassOff()` (lines 72-84)
force-rewrites the flag to `false` in every `dist/` build and **throws the build** if
the rewrite can't be verified afterward; wired into `postbuild` (`package.json:7`);
covered by `test/dev-bypass.test.mjs`. This is genuinely solid, layered protection
against the bypass ever reaching production, and it does not affect a real
(`sharepoint`-kind) tenant at all — `currentEntitlementType()` (`app.js:232-236`) only
ever consults the bypass when `Store.kind === 'demo'`.

The real risk isn't "the bypass leaks to prod" (that's well-covered) — it's that the
bypass exists **only in demo mode**, which never calls `Store.setSetting`,
`ensureLists()`, or `assertActivationAuthorizesProvisioning()` at all. A developer
running locally to "check the Partner Console looks right" never touches the Ed25519
verification path, the SharePoint write path, or the provisioning gate — i.e., never
exercises any of the code in Findings #1-#2. The bypass makes the partner UI easy to
preview while making the exact subsystem those bugs live in invisible during normal
local development; catching them requires deliberately testing against a real,
Graph-connected tenant.

**Rating**: Separation — **Pass** (build-time enforcement is real and tested).
Bootstrap — **Weak** (as a side effect, masks the very bug class in Findings #1-#2
from routine local testing). Persistence/Truthfulness/Auditability — N/A.

---

## Finding 6 — `tools/issue-entitlement.mjs --record` works as documented; its failure mode is honest but easy to miss operationally

Confirmed against the CLI source and its test suite. `--record` (`issue-entitlement.mjs
:300-322,432-444`):
1. The activation `.json` file is **always** written first
   (`writeFileSync(outPath, ...)`, line 413) — unconditional on `--record`'s outcome.
2. If `--record` is passed, it signs the practitioner in via OAuth2 device-code flow
   (dependency-free, Node `fetch`), then appends a row to **Compliance365's own**
   `Checkpoint Partner PartnerEntitlements` SharePoint list (never a client's tenant).
3. That list is **not auto-provisioned by the CLI** — it requires Partner Console to
   have been opened at least once in-app first (line 312), so the CLI itself is
   subject to the same "list must already exist" precondition as Finding #2.
4. On any failure (list missing, consent, network, sign-in timeout), the error is
   caught, printed clearly (`'Could not record automatically (...)'`) with a
   fallback JSON row for manual entry into Partner Console — and the **process exit
   code stays 0**, confirmed by `test/issue-entitlement-cli.test.mjs:70-77`
   (`assert.equal(code, 0, 'a failed --record must not crash the CLI or change its
   exit code')`).

This is a deliberate, well-tested, honestly-surfaced degrade — not silent. The
residual risk is operational, not technical: an activation can be issued and handed to
a client while Compliance365's own tracking register never learns about it, with only
a console-printed JSON blob (easy to lose in scrollback, easy to forget to paste back
in) as the record of that gap. Exit code 0 also means this can't be used as a CI/script
signal that bookkeeping didn't happen — someone has to read the CLI's own stdout.

**Rating**: Auditability — **Weak** (clear at the moment it happens, no durable record
if the fallback row is never manually re-entered; exit code doesn't distinguish
partial success). Truthfulness — **Pass** (never claims the record succeeded when it
didn't). Persistence/Separation/Bootstrap — N/A.

---

## Finding 7 (informational) — Partner Console staleness is actually handled well

Every client row shows a literal `lastSynced` date or `'Never'`, plus a colour-coded
health dot (`partnerHealthOf()`, `app.js:2635-2642`) that explicitly labels `'Sync
error'` / `'Not synced yet'` / `'Not yet onboarded'` distinctly from a genuinely
healthy, recently-synced client (`renderPartnerClientRows()`, `app.js:2701-2729`).
There is no automatic background refresh — data only updates on an explicit per-client
"Sync" click (`App.partnerSyncClient`, `app.js:6896-6919`, which opens a separate
delegated sign-in into the *client's* own tenant) — so staleness can grow silently
between syncs in the sense that nothing proactively nags "this hasn't synced in 60
days," but the raw date is always visibly present, never hidden or presented as live.
`src/pages/checkpoint-console/index.astro` (the marketing page, not the app) is
unrelated to this — its charts are synthetic SVG generated at Astro build time for
illustration (explicitly commented as such, lines 11-13), not live data, so staleness
doesn't apply to it at all.

**Rating**: Truthfulness — **Pass**. Auditability — **Weak** (no proactive staleness
alerting, only passive display).

---

## Finding 8 (informational) — Non-root SharePoint site preference is genuinely per-browser

Distinct from the entitlement file itself: the wizard's chosen non-root SharePoint site
path is cached in `localStorage` keyed by tenant (`app.js:7958-7967`, write at
`8193`), with the limitation **documented in the code's own comment**
(`app.js:7943-7957`): a different browser/device's first live use falls back to
`config.js`'s root default rather than failing, and needs the path set again from that
device. This is the closest literal match to hypothesis (b) ("session-only storage")
anywhere in the codebase, but it does not affect the entitlement/activation state,
which — per Finding above (§7 of the research trace) — is fully re-verified from
SharePoint on every load and never cached in `localStorage`/`sessionStorage` at all.

**Rating**: Persistence — **Weak** (by design, with the limitation disclosed in-code,
not hidden). Separation/Truthfulness/Bootstrap/Auditability — N/A.

---

## Severity-ranked summary

| # | Finding | Severity | Sep. | Persist. | Truth. | Bootstrap | Audit. |
|---|---|---|---|---|---|---|---|
| 1 | Swallowed SharePoint write on activation apply → false "success" | **Critical** | – | Fail | Fail | Weak | Weak |
| 2 | Self-defeating retry loop (stale cache + list self-heal) | **Critical** | – | Fail | Weak | Fail | Fail |
| 3 | Graph failure reported as "wrong tenant" | High | – | – | Weak | – | Weak |
| 4 | No code/schema separation between client and partner bundle | Medium | Weak | – | – | – | – |
| 5 | Dev bypass masks the real activation path from local testing | Low–Med | Pass | – | – | Weak | – |
| 6 | `--record` best-effort, exit 0 on failure | Low | – | – | Pass | – | Weak |
| 7 | Partner Console staleness display | Informational (Pass) | – | – | Pass | – | Weak |
| 8 | Site-preference is per-browser `localStorage` | Informational | – | Weak | – | – | – |

Findings #1 and #2 compound each other and together are the confirmed mechanism behind
"an applied entitlement can be forgotten": #1 is how a persist attempt can silently
fail while reporting success; #2 is why, once that happens (or once the cache is
otherwise unreadable) at the wrong moment, there is no working in-app recovery path —
the retry screen's own repair action can silently fail to repair anything, with no
error surfaced, indefinitely.
