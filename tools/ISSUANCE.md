# Checkpoint activation — issuance runbook

This is the operational companion to `tools/issue-entitlement.mjs`. It
covers key generation, where to store the private key, issuing a new
client's activation, renewing one, "revoking" one (and the real limits
of that), and the email template that goes out with every file.

Read this before you run the CLI for the first time. If you're looking
for how Checkpoint *verifies* an activation client-side, or the
provisioning/read-only states an activation drives, see
`public/checkpoint/SETUP.md` §7a instead — this file is entirely about
the issuing side, which only Compliance365 ever does.

## 1. Key generation

```
node tools/issue-entitlement.mjs keygen
```

This writes `entitlement-private.json` (a JWK — a JSON Web Key, not a
PEM) into the current directory and prints the matching public key
(base64, 32 raw bytes) to paste into `public/checkpoint/config.js`'s
`entitlementPublicKey`.

**Do this exactly once**, ever, for the whole product — not once per
client. Every client's activation file is signed with the same private
key and verified against the same public key baked into the deployed
app. Regenerating the keypair invalidates every activation file issued
with the old one; every client would need reissuing before their
Checkpoint stopped going read-only (past their existing file's grace
period) or, for a new client provisioning for the first time, before
they could onboard at all.

## 2. Where to keep the private key

`entitlement-private.json` **is** the security of this entire scheme —
anyone holding it can mint an activation for any tenant, unlocking any
framework, for as long an expiry as they like. Treat it exactly like a
code-signing key:

- **Never commit it.** `.gitignore` already excludes
  `entitlement-private.json` and `*-entitlement.json` — don't override
  that.
- **Recommended: Azure Key Vault**, as a Key Vault *secret* (the raw
  JWK JSON as the secret value — Key Vault's own asymmetric-key objects
  don't speak Ed25519 as of this writing, so store it as an opaque
  secret rather than trying to use Key Vault's native key operations).
  Grant access via a Key Vault access policy or RBAC role scoped to
  exactly the person/service issuing activations — not the whole team.
  Retrieve it into a local temp file only for the duration of an
  `issue`/`keygen` run, then delete the temp copy.
  ```
  az keyvault secret set --vault-name <your-vault> --name checkpoint-activation-key \
    --file entitlement-private.json
  az keyvault secret show --vault-name <your-vault> --name checkpoint-activation-key \
    --query value -o tsv > entitlement-private.json
  # ... run issue/keygen ...
  rm entitlement-private.json
  ```
  A password manager entry (1Password, Bitwarden) with the file
  attached is an acceptable smaller-team alternative to a full Key
  Vault — the important properties are: not in git, not on a shared
  drive in plaintext, access limited to whoever actually issues
  activations, and a copy exists somewhere durable enough that losing
  one laptop doesn't mean re-keying the whole product.
- If the key is ever exposed (a leaked laptop, a misconfigured Key
  Vault policy, a former employee who kept a copy) — rotate it: `keygen
  --force`, update `entitlementPublicKey` in config.js, redeploy, and
  reissue every currently-active client's file against the new key.
  There's no way to selectively invalidate just the exposed copy; the
  public key is what every client's browser trusts, so changing it is
  the only lever.
- **Who may run this CLI at all**: whoever holds Key Vault access to
  `entitlement-private.json`, full stop — this tool has no separate
  authorization layer of its own (no login, no audit log beyond what
  Key Vault itself records access as). Scope the Key Vault access
  policy/RBAC role narrowly (see above) rather than relying on "well,
  nobody else would think to run it" — anyone who can read the secret
  can issue a `client` file for any tenant, and (see §8) a `partner`
  file that unlocks everything. `--i-know` on `--type partner` is a
  speed bump against an accidental keystroke, not an access control —
  it doesn't require any additional credential or permission beyond
  whatever already let you reach the private key in the first place.

## 3. Issuing a new client's activation

```
node tools/issue-entitlement.mjs issue \
  --tenant <their Entra tenant ID or a verified domain> \
  --frameworks iso27001,soc2,essential8 \
  --expiry 2027-07-09 \
  --grace-days 14 \
  --key entitlement-private.json \
  --module-keys tools/module-keys.json \
  --out acme-corp-activation.json
```

If `--frameworks` names any premium module (anything other than
`iso27001`), `issue` also needs `tools/module-keys.json` (default path —
`--module-keys` only needed to point elsewhere) so it can embed that
module's content-pack decryption key inside the signed payload. See §7
below if that file doesn't exist yet or is missing a key for a module
you're issuing.

- `--tenant`: **recommended: the client's Entra tenant ID** (a GUID —
  Entra admin center → your tenant → Overview → Tenant ID). It's the
  most precise option and never changes for the life of the tenant. A
  **verified domain** (`contoso.com`, `contoso.onmicrosoft.com`) is also
  fully supported and often easier to get from a client without needing
  them to open the Entra admin center themselves — Checkpoint matches
  against either, case-insensitively, at verification time (it fetches
  the signed-in tenant's own GUID *and* every verified domain via one
  `GET /organization?$select=id,verifiedDomains` Graph call, and accepts
  a match against any of them). Prefer the GUID when you have it: a
  domain can be added, removed or reassigned on a tenant later (a
  divestiture, a rebrand, a removed alias) in a way the GUID never can,
  so a domain-issued file carries a small extra assumption that the
  domain you typed still resolves to this same tenant whenever it's
  re-verified.
- `--frameworks`: comma-separated framework ids — see
  `VALID_FRAMEWORKS` in the CLI, or `window.FRAMEWORK_ORDER` in
  store.js, for the current list. `iso27001` is the included baseline
  and stays on in Checkpoint regardless of whether it's listed here —
  include it anyway for the file's own record-keeping.
- `--expiry`: the date this activation's normal (non-grace) term ends.
  Match it to the client's actual billing/contract term.
- `--grace-days` (optional, default 14): how long Checkpoint keeps
  operating normally past `--expiry` before forcing read-only.
  Compliance365's standard is 14 days; only override this for a
  specific commercial reason.
- Send the resulting `.json` file to the client's practitioner (§5
  below has the email template) to paste/upload in Checkpoint — the
  onboarding wizard's Activation step for a brand-new tenant, or the
  Frameworks/Settings view for an existing one.

Run `node tools/issue-entitlement.mjs verify --file FILE.json --pubkey
<base64>` on the file before sending it — catches a typo'd tenant ID
or an inverted expiry before it reaches the client.

## 4. Renewing

Renewal is just issuing a new file with a later `--expiry` (and
current `--frameworks`, if the client's changed what they've
purchased) and sending it the same way. The practitioner applies it
the same way they'd apply a first-time activation — Checkpoint detects
this is a renewal (it already has a still-known expiry on file) and
logs `'Activation renewed'` to the tenant's audit log instead of
`'Activation applied'`.

There's no reminder system built into Checkpoint itself for when a
renewal is coming due on YOUR side (Compliance365's) — track client
expiry dates in whatever CRM/spreadsheet you already use for renewals,
and issue the new file before the grace period runs out so the client
never actually goes read-only. Checkpoint's own UI does remind the
*client*: the Frameworks/Settings view shows the current expiry and
grace deadline, and the app surfaces a grace-period banner once it's
in that window.

## 5. Revoking — and its real limits

**Read this section before promising a client "we can revoke access
immediately" — it isn't fully true, by design.**

Checkpoint has no server, no phone-home, and no ability to push
anything into an already-provisioned client's tenant. Once a client's
practitioner has applied an activation file, that file — with
whatever `expiry` it was signed with — sits in their own tenant's
`Checkpoint Settings` SharePoint list, in their tenant, under their
control. Checkpoint re-verifies it on every load, but always against
*today's date compared to the expiry already embedded in that file* —
never against anything Compliance365 can change after the fact.

**What "revoke" actually means here**: issuing a **new** file with an
earlier expiry (e.g. `--expiry` set to yesterday, `--grace-days 0`)
does nothing on its own — the client's tenant is still running on the
file they already applied, which Compliance365 cannot reach or
overwrite remotely. Revocation only takes effect once the client (or
someone with access to their tenant) applies that new, already-expired
file in place of the old one. If a client has gone silent, stopped
paying, and would obviously never apply a file that cuts off their own
access, there is **no remote mechanism in this design** to force it —
that's the deliberate trade-off of a no-backend, tenant-owns-its-data
architecture (see SETUP.md's security posture summary).

**What this is actually useful for:**
- A client who under-purchased and needs a framework removed — issue a
  corrected file, ask them to apply it (a legitimate, cooperative
  scenario, not an adversarial one).
- A client whose contract genuinely ended and who understands they'll
  go read-only — issue nothing further; their existing file's own
  expiry (already set at issuance) does the work automatically, once
  it and its grace period pass. This is the normal, expected path —
  most "revocation" is really just *not renewing*.
- A key-compromise scenario (§2) — rotating the key and not reissuing
  a file for that client is the closest thing to a hard stop this
  design has, and even then their existing file keeps verifying until
  its own expiry, since the OLD public key isn't what's deployed
  anymore only after you rotate config.js's `entitlementPublicKey` —
  meaning EVERY client's file stops verifying at that point, not just
  the one you wanted to cut off. Rotating the key is a blunt,
  product-wide instrument, not a scalpel.

If genuine, timely, non-cooperative revocation is ever a hard
requirement, that needs a different architecture (a backend Checkpoint
calls to check a live allow-list) — a real, considered departure from
this app's "no backend" design, not a small tweak to this scheme.

## 6. Client-facing email template

Send this alongside the issued `.json` file (as an attachment, not
pasted inline — some email clients mangle JSON in the body).

---

> Subject: Your Checkpoint activation file — [Client Name]
>
> Hi [name],
>
> Attached is the activation file for your Checkpoint compliance
> console. It licenses [ISO 27001 / SOC 2 / … — list the frameworks]
> for your tenant through **[expiry date]**.
>
> **If you're setting up Checkpoint for the first time:**
> Sign in to Checkpoint, and when you reach the "Activate this tenant"
> step, upload or paste the contents of the attached file. Checkpoint
> verifies it in your browser before anything is created in your
> tenant — nothing is sent to us to check it.
>
> **If you're renewing an existing Checkpoint tenant:**
> Sign in to Checkpoint, open **Frameworks** in the sidebar, and
> upload or paste the attached file under "Entitlement file." Your
> existing data, registers and evidence are unaffected — this only
> updates your licensing.
>
> A few notes:
> - This file only works for your specific tenant — it can't be
>   applied to any other organisation's Checkpoint.
> - If your activation lapses before a renewal reaches you, Checkpoint
>   keeps working normally for a [N]-day grace period, then goes
>   read-only (you can still see and export everything, but can't add
>   or change anything) until a renewed file is applied. Nothing is
>   ever deleted.
> - Keep this file somewhere your team can find it if you ever need to
>   re-apply it (e.g. after Checkpoint moved to a different SharePoint
>   site).
>
> Questions, or need a different set of frameworks activated — just
> reply to this email.
>
> [Your name]
> Compliance365

## 7. Content packs — module keys and rotation

The six premium frameworks (everything except `iso27001`, the shipped
baseline) don't ship in the Checkpoint bundle at all — their real
control data lives only in `checkpoint-content/*.json` (plaintext
source, never committed near the deployed app) and is built into
AES-256-GCM encrypted pack files (`dist/checkpoint/packs/*.pack.json`,
public, but useless without the right key) by
`scripts/build-content-packs.mjs`, a postbuild step. A tenant's
activation file carries the AES key for exactly the modules it's
licensed for — that key, not the Ed25519 signature, is what lets
Checkpoint decrypt those specific packs client-side. See
`public/checkpoint/SETUP.md` for the runtime/build design; this section
is only the operational side.

The `ai` add-on (the AI assistant — see `AI-SETUP.md`) goes through this
exact same module-key/content-pack mechanism even though it isn't a
compliance framework at all — `--frameworks`/`keygen-modules` treat it as
just another premium module id (see `ADDON_MODULES` near the top of
`issue-entitlement.mjs`).

**Generating module keys (once per module, same "do this once for the
whole product" rule as §1's signing keypair):**

```
node tools/issue-entitlement.mjs keygen-modules
```

Writes `tools/module-keys.json` (gitignored — never commit it, it
decrypts every premium content pack for every client at once) with a
fresh random AES-256 key for every premium module that doesn't already
have one in that file. Re-running it is safe: existing keys are left
alone unless you pass `--force` (see below). Pass `--modules
soc2,essential8` to only touch specific modules, and `--out
some/other/path.json` to write somewhere else (then pass that same path
to `issue`'s `--module-keys`).

Rebuild (`npm run build`) after generating keys — a module with no key
in `tools/module-keys.json` yet just doesn't get a pack built, and
stays unavailable to every client (fails safe, not open — same
principle as a missing/placeholder Ed25519 key in config.js).

**Rotating a module's key** (the key was exposed, or you want to force
every current holder to re-apply a fresh activation for some other
reason):

```
node tools/issue-entitlement.mjs keygen-modules --modules soc2 --force
npm run build
```

This bumps that module's encryption key and produces a **new pack
file** (a new content hash, since the ciphertext is now different —
`build-content-packs.mjs` names/hashes each pack file, so the old one
simply stops being referenced by the manifest once you redeploy). Any
activation file issued with the OLD key can no longer decrypt the new
pack — it isn't a version mismatch Checkpoint reports gracefully at
runtime, it's the same "wrong key" failure `mergeLicensedPacks()`
treats identically to an unlicensed module (see SETUP.md), so **every
client licensed for that module needs a reissued activation file**
before their next Checkpoint load, or that module will appear to go
dark for them. Reissue exactly like §3/§4 (`issue ... --module-keys
tools/module-keys.json`, sending the resulting file the same way) —
there's no way to push the new key into an already-applied file, same
"tenant owns its own activation file" limitation §5 already describes
for the signing key.

Rotating a module's `version` field (in its `checkpoint-content/*.json`
source) is a separate, lighter-weight thing — bump it when the
control/guidance CONTENT changes but the encryption key doesn't; it's
carried through into the pack and the manifest for your own
troubleshooting reference, but Checkpoint's runtime doesn't currently
gate on it (a pack always decrypts and replaces the stub if the key and
hash check out, regardless of version). Only an actual key change is a
"reissue everyone" event.

**Key-compromise scenario, module-specific**: if a client somehow
extracted their own module key (see the honesty note in SETUP.md — a
legitimate holder of a valid activation can technically do this,
that's an accepted, documented limit of this design, not a bug) and
that key leaked publicly, rotating just that module's key (above)
invalidates it for everyone, including the original leaker, the moment
you redeploy and reissue. This is a scalpel, unlike §5's product-wide
Ed25519 key rotation — rotating one module's AES key doesn't touch any
other module's pack, or the signature scheme, at all.

---

## 8. Licence types — client, partner, demo

Every activation payload carries a `type` field: `'client'` |
`'partner'` | `'demo'`, defaulting to `'client'` if the field is
missing entirely (`lib.js`'s `normalizeEntitlementType()`) — every file
issued before this field existed keeps behaving exactly as it always
did, no reissuing needed just because this shipped. `--type` on the
`issue` command sets it; omit the flag for the default.

```
node tools/issue-entitlement.mjs issue --type client   ...   # default — today's behaviour
node tools/issue-entitlement.mjs issue --type partner  --i-know  ...
node tools/issue-entitlement.mjs issue --type demo     ...
```

**`client`** — a normal paying client. Exactly what this tool has
always done: `--frameworks` names what they've purchased, `--expiry`
is required and should match their contract term.

**`partner`** — every framework and every content-pack module key
unlocked, *regardless of what `--frameworks` you pass* (a note is
printed if you passed one anyway — it's ignored; the file always grants
everything). This is what unlocks the owner console — a separate app
(`public/owner/`, served at `/owner/`, see `public/checkpoint/
SETUP.md` §7b) with its own client roster, renewals and per-client
sync — meaningless for a client tenant.
**This is for Compliance365's own tenant only — never issue one for a
client.** Two deliberate speed bumps against issuing this by accident:
it refuses to run without `--i-know`, and there's no default `--expiry`
(you have to choose one, same as `client` — "long expiry supported"
just means there's no artificial cap, not that one is assumed).

**`demo`** — the same "every framework + module key" grant as
`partner`, but for a **prospect tenant during a sales trial**, not
internal use. The app shows a persistent "Trial — N days remaining"
banner, and follows the *exact same*
expiry/grace/read-only degradation as any other type once it lapses —
no special leniency, no different code path, just a different banner
while it's still valid (see `public/checkpoint/app.js`'s
`renderTrialBanner()`). If you don't pass `--expiry`, it defaults to 30
days out (`node tools/issue-entitlement.mjs issue --type demo` alone is
enough to produce a standard 30-day trial); pass one yourself for a
longer or shorter proof-of-concept.

### Trial-to-client conversion

A demo/trial tenant that decides to purchase doesn't need any special
"conversion" command — just issue them a normal `client` file:

```
node tools/issue-entitlement.mjs issue --tenant <their tenant> \
  --frameworks <what they actually purchased> \
  --expiry <their real contract term> \
  --type client \
  --key entitlement-private.json --module-keys tools/module-keys.json \
  --out acme-corp-activation.json
```

The client applies it the same way as any renewal (Frameworks view,
"Verify & apply") — Checkpoint re-verifies from scratch on every load,
so there's nothing to "migrate": the moment this file replaces the old
demo one in their tenant's Settings list, the trial banner disappears
(type is now `client`, not `demo`) and their framework set matches
whatever they purchased, which may well be a SUBSET of what the trial
let them explore (the demo file always grants everything; the real
purchase might not — that's expected and correct, not a downgrade bug).
If they purchased everything the trial showed them, `--frameworks`
here would just happen to list every framework too, same file shape
either way. Don't reuse the demo file's expiry or extend it — issue a
proper client file with their actual contracted term.

If a trial lapses (expiry + grace pass with no purchase decision),
nothing further is needed — the same standard read-only degradation
every type gets handles it automatically; there's no separate "trial
expiry" cleanup step. If they come back and purchase later, issue the
`client` file above whenever that happens, same as a first-time client.

### Key custody recap for this section

Nothing above changes where the signing key lives — see §2 (Azure Key
Vault, access scoped to whoever issues activations) and the "who may
run this CLI" note there. `partner`/`demo` activations are signed with
the exact same private key as every `client` one; there is no separate
"internal-use key". The only thing distinguishing a `partner` file from
a `client` one, cryptographically, is the `type` field inside the same
signed payload — which is exactly why `--i-know` exists as a manual
confirmation step: the CLI itself has no other way to know "this one's
supposed to unlock everything for us, not a client."

### Keeping the owner console's register in sync — `--record`

The owner console (`public/owner/` — a separate app, own tenant,
internal-only, see `public/checkpoint/SETUP.md` §7b) tracks every
issuance in a `PartnerEntitlements` SharePoint list, so a practitioner
can see at a glance which clients are due for renewal without
cross-checking this CLI's own output. Passing `--record` on `issue`
keeps that register automatic instead of manual:

```
node tools/issue-entitlement.mjs issue --tenant acme.onmicrosoft.com \
  --frameworks iso27001,soc2 --expiry 2027-01-01 \
  --key entitlement-private.json --module-keys tools/module-keys.json \
  --out acme-corp-activation.json --record
```

`--record` signs *you* (the practitioner running this CLI) in via the
OAuth2 device-code flow against Microsoft's identity platform —
dependency-free, using Node's own `fetch`, no MSAL/browser needed. It
prints a URL and a one-time code; complete that in any browser, and the
CLI polls until it's done. Once signed in, it appends a row to
`Checkpoint Partner PartnerEntitlements` in OUR OWN tenant (the exact
list `public/owner/owner.js`'s `PARTNER_DEFS`/`provisionPartnerLists()`
provisions, and the owner console reads) — never a client's tenant.
`--client-id` defaults to whatever's already in
`public/checkpoint/config.js`; `--partner-tenant` defaults to
`organizations` (pass a specific tenant ID to skip the account picker
if you only ever sign into one tenant this way).

If `--record` is omitted, or the sign-in/list-write fails for any
reason — the list hasn't been provisioned yet (open the owner console
at `/owner/` at least once first and use its one-click provisioning),
consent wasn't granted, no network, no `--client-id` and none in
config.js — the CLI falls back to printing the row as JSON:

```json
{
  "tenantId": "acme.onmicrosoft.com",
  "type": "client",
  "modules": ["iso27001", "soc2"],
  "issuedAt": "2026-07-10",
  "expiry": "2027-01-01"
}
```

Paste that into the owner console's "+ Record entitlement" form by
hand. This is best-effort bookkeeping only — the client's activation
file itself (and its own signature verification) is the actual source
of truth for what they're licensed for; PartnerEntitlements is a
practitioner-facing register, not something Checkpoint's client-side
verification ever reads.

### Two fields `--record` doesn't set: `ManualStatus` and `RenewedBy`

`PartnerEntitlements` carries two more columns the owner console owns
end-to-end — neither is ever set by this CLI or by `--record`:

- `ManualStatus` — the owner's own read on a renewal ("Renewed" / "In
  discussion" / "At risk"), set from the Renewals runway tab. It only
  ever suppresses the runway's own at-risk colouring and the client
  health strip's renewal-due signal; it never changes what a client is
  actually licensed for.
- `RenewedBy` — set automatically when the owner console's "prepare
  renewal" action records a new entitlement row against an existing
  one: the old row's `RenewedBy` is stamped with the new row's SharePoint
  item ID, so the revenue board can count the old entitlement's value as
  committed rather than expiring-unrenewed. "Prepare renewal" opens the
  same "New client" form described below, pre-filled from the existing
  entitlement's tenant/modules/type — it does not sign or issue anything
  itself, since the owner console has no access to the private key (§2).

### Pricing and the four owner-console insight views

A `PartnerPrices` list (`ModuleId`, `AnnualPrice`, `Currency`, `Notes`)
lives in our own tenant only, next to `PartnerEntitlements` — it is
never read by, or exposed to, a client tenant. It's the input to the
owner console's Revenue board (active annualised revenue, revenue by
module, committed-vs-expiring-unrenewed, trial pipeline value), whose
numbers are all derived purely from `PartnerEntitlements × PartnerPrices`
(latest entitlement per tenant only) plus today's date — see
`computePartnerRevenue()` in `public/checkpoint/lib.js`. The other three
insight views — the Renewals runway, the Module adoption matrix (whose
"next best module" upsell hint is computed per client from that
client's own last-synced control rows via `computeNextBestModule()`),
and the Client health strip (`computeClientHealth()`) — read from the
roster and sync data already described above. Every figure across all
four views is labelled with its data source and an "as at" timestamp,
and a client with no `LastSynced` date renders as "never synced" rather
than a guessed health colour.

### The "New client" form — post-purchase setup as one form, not a CLI session

The owner console's **+ New client** tab (`public/owner/owner.js`'s
`renderNewClientForm()`/`OwnerApp.partnerGenerateIssuance()`/
`partnerRecordIssuance()`) turns "we just closed a deal" into one form:
client name/contact, tenant ID or verified domain (format-checked
client-side and cross-checked against the existing roster — a hit
warns rather than blocks, since re-issuing to a tenant already on the
roster, e.g. a renewal, is a normal case, not an error), a module
checklist priced from `PartnerPrices` with a running total, a 12/24/36-
month term, and client vs. trial type. "Generate" builds the plan (pure,
tested — `window.CheckpointLib.buildClientIssuancePlan()`) and shows the
exact `issue-entitlement.mjs` command to copy and run, exactly as
"prepare renewal" already did for a single field before this existed.
"Record entitlement" writes the `PartnerClients` roster row (Prospect ->
Active) and the `PartnerEntitlements` row — the same two writes
`--record` performs automatically if you run the printed command with
that flag — and, for a renewal, stamps `RenewedBy`/`ManualStatus` on the
entitlement being superseded. **Recording is bookkeeping, not
issuance** — the client isn't actually licensed until the signed file
this CLI (or the signing endpoint below) produces is applied in their
own tenant; recording early just keeps the owner console's register in
sync with a deal that's already been agreed, the same trust boundary
`--record`'s own fallback-to-JSON path already assumes.

### The signing endpoint (optional) — trade-off against the CLI-copy path

**The CLI-copy path above is always available and requires nothing
extra to configure.** `CONFIG.signingEndpoint.url` (`public/checkpoint/
config.js`, empty by default) optionally points the "New client" form
at a small Azure Function of your own that signs an entitlement
server-side, so routine issuances don't need a CLI session with the
private key file on disk at all. Whether to stand this up is a genuine
trade-off, not a strict upgrade:

| | CLI-copy path (default) | Signing endpoint (opt-in) |
|---|---|---|
| Private key exposure | Key only ever touches whatever machine runs the CLI, under your control | Key lives in Azure Key Vault behind a Function — a second place it can be compromised, network-reachable rather than local-only |
| Who can issue | Whoever has the key file and runs the CLI | Whoever can authenticate to the Function as an identity in OUR tenant (Entra-protected — see below) — potentially a wider set of practitioners without ever handing them the key file itself |
| Auditability | Whatever your own shell/OS logs | The Function's own logs — a second thing to secure and review |
| Setup cost | None — already built | An Azure Function + Key Vault + its own Entra app registration to provision and maintain |
| Failure mode | CLI doesn't run — no file, no risk | A compromised or misconfigured Function could sign entitlements nobody asked for |

If you do stand one up: create an Entra app registration for the
Function, expose an API scope on it (e.g. `api://<function-app-id>/
Sign.Entitlement`), grant Checkpoint's own owner-console app
registration access to that scope (admin-consented once, in OUR
tenant only — this is what "callable only by identities in OUR tenant"
means; a client's browser session has no path to this scope at all),
put `entitlement-private.json` and `module-keys.json` in the Function's
Key Vault, and set `CONFIG.signingEndpoint.url`/`scopesSigning` in
`config.js`. **HTTP contract**: `POST {tenantId, frameworks, expiry,
type}` (JSON body, `Authorization: Bearer <token>` for that scope) ->
`200 {payload, signature}` — the exact same shape
`issue-entitlement.mjs issue` writes to disk, so the owner console
verifies the response against `config.js`'s own `entitlementPublicKey`
with the identical `verifyEntitlementSignature()` call it uses for a
pasted activation file before ever trusting it (never blindly trusting
a network response, even from your own endpoint). The Function's own
implementation (how it loads the key from Key Vault, whether it applies
its own rate-limiting/audit-logging) is entirely up to you — it lives
outside this repository.

### Welcome pack (task 4's "one form" also sends the client their first email)

Once an entitlement is recorded, "Send welcome pack" (from the New
client tab's result, or a client's drawer) composes an email — subject
and recipient pre-filled and editable — with a quick-start guide
attached (`buildQuickStartGuideHtml()`, styled in the same ink/
charcoal/gold identity as Checkpoint's reports; opens in any browser and
prints to PDF the same way every Checkpoint report does — see SETUP.md
§8b — rather than this bundle fabricating actual PDF bytes with no PDF
library vendored) and, if a real signed file was produced via the
signing endpoint this session, that file attached too. Sent from the
practitioner's own mailbox via delegated `Mail.Send` (incremental
consent, same as every other email this app sends) — never a service
account, never a backend. Sending sets `PackSentAt` on the client's
roster row, the first of the four checklist stages
`computeClientChecklist()` reports (pack sent -> activated -> first scan
-> synced) — every stage after the first is derived from what a sync
already finds, never a separate hand-maintained status.
