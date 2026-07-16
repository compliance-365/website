# Greenfield IT / Queensland Government — Client-Readiness Assessment

Scope: full read of the Checkpoint console (`public/checkpoint/`, ~15k lines), the owner
console (`public/owner/`), the entitlement/licensing tooling (`tools/`), the scheduled
Azure posture monitor (`public/checkpoint/azure/`), the marketing site's dynamic surfaces
(`lambda/`, `src/pages/api/`, `src/components/AIChat.astro`), deployment config
(`.github/workflows/`, `netlify.toml`), and both prior audit reports (`SITE-AUDIT.md` /
`SITE-AUDIT-CLOSED.md`, `OWNER-AUDIT.md`) re-verified against current code. The full test
suite was run (438 tests, all passing). No product code was changed by this assessment.

---

## 1. Executive verdict

**The product's core claims hold up.** The "automated approach to compliance" is real,
not marketing: ~18 scored posture checks run automatically against Microsoft Graph
(MFA, Conditional Access, PIM, guests, risky users, Intune compliance, OAuth grants,
access reviews, DLP/labelling/encryption/patch/macro/logging/alerting via Secure Score,
external sharing), an optional scheduled Azure Function re-runs them unattended in the
client's own tenant with drift alerts written to SharePoint, and auto-evidence capture
refreshes control evidence from scans. The security architecture is genuinely strong for
a government audience: **no backend, no vendor database — every record lives as
SharePoint lists inside the client's own Microsoft 365 tenant**, read-only Graph scopes
requested via incremental consent, a strict CSP with no inline scripts, vendored MSAL,
Ed25519-signed licensing with the private key never shipped, and an AI layer that uses
the client's own Azure OpenAI resource via Entra RBAC (no API keys anywhere).

**But it is not client-ready today.** Three launch blockers stand between this codebase
and a Greenfield pilot, plus a handful of real bugs and a set of Queensland-specific
gaps. None are architectural — all are closable in a focused sprint — but a pilot signed
today would hit at least one of them in week one.

---

## 2. Launch blockers (must close before any client/reseller demo goes live)

### 2.1 The shipped entitlement public key is a placeholder — no real tenant can activate
`public/checkpoint/config.js:135` ships `entitlementPublicKey` documented in its own
comment as *"The placeholder below verifies nothing real; replace it with your own
generated key before issuing activation files for a client."* `ACCEPTANCE.md` §0 lists
replacing it as a hard prerequisite. Until a real Ed25519 keypair is generated
(`node tools/issue-entitlement.mjs keygen`), the key configured, and activation files
issued from it, **every real tenant fails activation by design** — the product cannot be
sold, piloted, or demoed live. If the real key has in fact been configured in the
deployed copy, update this comment and record where the private key is held (it becomes
the single most sensitive secret in the business — its compromise means anyone can
license the product).

### 2.2 The acceptance test plan has never been executed
`public/checkpoint/ACCEPTANCE.md` is a scripted, click-by-click pre-pilot test plan
(8 stages: Onboard → Assess → Plan → Implement → Evidence → Operate → Audit →
Review/Recertify) written precisely for this moment. It requires a fresh real Microsoft
365 tenant, real admin consent, and real (plus deliberately broken) activation files —
nothing the 438 automated tests can substitute for, since those cover pure logic only.
The two critical bugs found by the earlier owner-console audit (silently-lost
activations; the unrecoverable retry loop) were exactly the class of bug only a real
tenant exposes. They're fixed now (commit `b365aed`, with a 299-line regression suite) —
but the fix itself has, as far as this repo shows, never been verified against a live
tenant either. **Run ACCEPTANCE.md top-to-bottom on a dedicated test tenant before
Greenfield sees anything.** Budget a day; record the results in the repo.

### 2.3 Multi-tenant consent will hit Microsoft's publisher-verification wall
The Entra app registration is multi-tenant (`authority: organizations`) and requests
high-trust read scopes (`Directory.Read.All`, `Policy.Read.All`,
`SecurityEvents.Read.All`, `RoleManagement.Read.Directory`, etc.). Since 2020,
**Microsoft blocks users in other tenants from consenting to multi-tenant apps whose
publisher is not verified**, and admin-consent screens show an "unverified" warning that
a government tenant administrator will (rightly) refuse. Confirm the Compliance365 app
registration has publisher verification (requires a Microsoft Partner Network / Cloud
Partner Program account with a verified MPN ID) before any external tenant tries to
onboard. A Queensland agency's Entra tenant will very likely also have admin-consent
workflow enabled — document that flow in SETUP.md so the pilot doesn't stall at step 1.

---

## 3. Bugs found in this review (new — not in prior audits)

### 3.1 Owner-console client sync breaks for any client on a non-root SharePoint site — Medium
`public/owner/owner.js:1487` (`partnerFetchClientSummary`) hard-codes
`GET /sites/root` when syncing a client's posture summary. But the client app's
onboarding wizard explicitly lets each tenant choose a **non-root** site path (e.g.
`/sites/compliance` — `config.js` `site`, wizard step 4a), and government tenants are the
most likely of all to refuse root-site provisioning. For any such client, the owner
console's per-client "Sync" will find no `Checkpoint *` lists and report the client as
not onboarded. Fix: store the client's chosen site path in the PartnerClients list at
issuance/onboarding and use it during sync.

### 3.2 ~60 register writes still fail silently (toast-only) — Medium, data-integrity
The activation path got the loud dual-store fix, but roughly sixty other write sites in
`app.js` still follow `try { await Store.updateRisk/updateControl/updateAction/
setSetting(...) } catch (e) { warn(e); }` — a 3.4-second toast, after which **the UI
keeps showing the edit as if it saved**. In-memory state diverges from SharePoint; the
edit vanishes on the next reload. For a compliance tool whose output is audit evidence,
a risk-treatment note or control-status change that silently evaporates is a
credibility-level defect (an assessor comparing the register against last week's export
will find records that "changed themselves back"). Recommended: route all register
writes through one persistence helper that (a) retries once, (b) on failure reverts the
in-memory change or visibly marks the row unsaved, and (c) raises the same standing
"Persistence problem" banner the activation path now uses (`app.js:8224`).

### 3.3 `src/pages/api/chat.ts` is dead code that becomes a vulnerability if ever enabled — Medium
The Astro build is `output: 'static'` (astro.config.mjs:33), so this server route never
deploys — today it is inert. But as written it is an **unauthenticated open proxy to the
Anthropic API that accepts a caller-supplied system prompt and answers with
`Access-Control-Allow-Origin: *` and no rate limiting**. If anyone ever flips the
project to SSR (or copies the file per its own "SETUP" comment), it ships a
credential-burning, brand-impersonating endpoint. The live chat path is
`lambda/chat.js` + `AIChat.astro`. Delete this file.

### 3.4 Public chat Lambda has no abuse controls — Medium, cost/abuse
`lambda/chat.js` is publicly invokable (CORS headers only constrain browsers, not
`curl`). There is no rate limiting, no CAPTCHA/turnstile, no per-IP throttle, and each
call can carry 10 × 1,000-char history turns. Someone who finds the endpoint (it's
visible in the page source: `AIChat.astro:4`) can run up the Anthropic bill or use the
Compliance365-branded bot as a free LLM. Add API Gateway throttling (e.g. burst 5 /
rate 2 rps per IP via usage plan or WAF) and a modest daily budget alarm. Also:
`AIChat.astro` defines `CHAT_API` twice (lines 4 and 371) — one constant, one drift bug
waiting.

### 3.5 The marketing chatbot asserts the unsubstantiated "100% pass rate" claim — Low code, High commercial
`lambda/chat.js`'s system prompt instructs the model to tell prospects Compliance365 has
"a 100% first-time certification pass rate" and to "never turn anyone away." The site
audit already flagged the 100% claim as needing a denominator before it's defensible;
having an AI *actively assert* it in conversation — to a government buyer via a reseller
— raises the ACCC/misleading-conduct stakes considerably, and "never tell someone we
can't help" is an instruction to overpromise. Soften both before Greenfield's name is
attached: state the claim with its real basis (or drop it), and allow the bot to
gracefully decline out-of-scope work.

### 3.6 No security response headers on the deployed product — Low–Medium
GitHub Pages (the active deploy target per `deploy.yml`) cannot set response headers, so
the console has **no `frame-ancestors`/`X-Frame-Options`** (the CSP meta tag can't carry
frame-ancestors — the code's own comment at `checkpoint/index.html` acknowledges this),
no HSTS, no `X-Content-Type-Options`. A console that displays a tenant's security
posture is a meaningful clickjacking target. Meanwhile `netlify.toml` also exists (with
redirects but **no `[[headers]]` block**), so the repo is configured for two hosts at
once. Decide the real host; if Netlify (or Cloudflare in front of Pages), add the full
header set. A Queensland security assessor will check these in the first five minutes.

### 3.7 Azure posture monitor uses a raw client secret in app settings — Low
`azure/main.bicep:93` passes `CLIENT_SECRET` as a plain Function App setting. It works,
but client secrets expire (max 24 months, often set to 6) — an expired secret silently
stops the scheduled scans a client is relying on — and plain app settings are readable
by anyone with portal access to the Function App. Prefer a Key Vault reference at
minimum; ideally migrate to a **managed identity with Graph app-role assignments**
(no secret at all, no expiry). Government cloud teams will ask for exactly this.

---

## 4. What is genuinely strong (verified, not taken on faith)

- **Automation is real.** Browser scans + the scheduled Azure monitor + drift alerts +
  auto-evidence capture + auto-discovered AI systems + periodic access-review checks.
  Recent commits automated DLP/labelling/encryption, external sharing, and review-due
  tracking. The scored checks map to controls via `guidance.js`, feed the SoA, and land
  in one-click audit reports. This is a defensible "automated compliance" pitch.
- **Data residency story is excellent for government.** No backend, no vendor database;
  registers are SharePoint lists in the client's tenant; posture reads never leave the
  browser; the optional monitor runs in the *client's* Azure subscription. This is the
  strongest differentiator for a QLD agency versus a US-hosted GRC SaaS.
- **AI governance is unusually disciplined.** One enforcement seam (`ai.js`): client's
  own Azure OpenAI via Entra RBAC, zero API keys, no tool/function calling ever,
  per-feature context allow-lists, deterministic truncation, mandatory disclaimer, audit
  logging without prompt text, client-side serialisation + 429 backoff. The system
  prompt explicitly forbids claiming certification outcomes. This will survive an AI
  governance review (and dogfoods the ISO 42001 story).
- **App security hygiene is above average.** CSP with `script-src 'self'` and no inline
  handlers on both consoles; vendored MSAL and fonts; delegated event binding;
  `noindex`; dev-bypass force-rewritten off at build with a test asserting it; signed
  licensing verified in-browser with the fail-safe defaulting to "not licensed."
- **Prior audit findings were actually closed.** The two critical activation-persistence
  bugs have a real fix (dual-store, later-issuedAt-wins reconciliation, standing failure
  banner) plus a dedicated regression suite; the site audit's credibility bugs (ABN,
  dead links, contrast, heading order, claims arithmetic) are closed in
  `SITE-AUDIT-CLOSED.md` and spot-verified here.
- **Test and CI discipline.** 438 passing tests run on every PR/push (`test.yml`);
  in-app self-test (`?selftest=1`); scripted acceptance plan; setup/support/release/
  issuance runbooks all exist and are current.

---

## 5. Queensland-government-specific gaps (the Greenfield conversation)

1. **No IS18/QGEA framework pack.** The console ships ISO 27001 core plus packs for
   Essential Eight, ISO 27701/42001, SOC 2, NIST CSF, DISP/ISM-IRAP
   (`checkpoint-content/`). Queensland agencies report under **IS18:2018 (QGEA), which
   mandates alignment to ISO 27001 and annual Essential Eight maturity reporting** — so
   the substance is already covered, but nothing in the product says "IS18" (the term
   appears only in a marketing resource page). A thin IS18/QGEA mapping layer — even
   labels + a QGEA-shaped report cover on the existing ISO 27001 + E8 data — would let
   Greenfield demo "IS18 readiness" natively. This is the highest-leverage product
   enhancement for this specific deal.
2. **WCAG accessibility of the console itself is unaudited.** Queensland government
   digital services require WCAG 2.2 AA. The marketing site scored 96+ after the audit
   fixes, but the Checkpoint SPA and owner console were never Lighthouse/axe-swept. The
   foundations are good (focus traps, aria-labelled modals, keyboard-bound actions) —
   run an axe pass over the main views before an agency accessibility checklist does.
3. **Reseller model isn't represented in the product.** Branding is hard-coded
   Compliance365; the owner console assumes Compliance365 staff operate it. Decide with
   Greenfield: do they get owner-console access (issuing entitlements → they'd need your
   signing key or the opt-in signing endpoint in `config.js`), or do they sell while you
   operate? The Ed25519 issuance flow is sound for either, but the current CLI/manual
   `--record` bookkeeping (exit-0 on failure, per OWNER-AUDIT finding 6) is easy to lose
   track of once a third party is selling on your behalf. Consider co-branding
   (`config.js`-level logo/name) as a fast follow, not a blocker.
4. **Privacy collateral for the AI chat.** The marketing chatbot sends visitor
   conversations to AWS Sydney and Anthropic, and emails the first message to
   `info@compliance365.com.au`. Make sure the privacy policy states this explicitly —
   a compliance consultancy's own privacy page is the first thing an agency will read.
5. **Marketing claims still need substantiation.** "100% first-time pass rate" and
   "60–80% below Big 4" remain unsourced (flagged in both prior audits, deliberately
   deferred as business decisions). Under a government procurement lens, either attach a
   denominator/methodology or soften. This also resolves finding 3.5 automatically.

---

## 6. Suggested order of work

| # | Item | Effort | Section |
|---|---|---|---|
| 1 | Generate/confirm real Ed25519 keypair; secure the private key; fix the config comment | Hours | 2.1 |
| 2 | Verify Entra app publisher verification + document admin-consent flow | Hours–days | 2.3 |
| 3 | Run ACCEPTANCE.md end-to-end on a fresh test tenant; record results | 1 day | 2.2 |
| 4 | Delete `src/pages/api/chat.ts`; dedupe `CHAT_API`; add API Gateway throttling | Hours | 3.3, 3.4 |
| 5 | Fix owner-console non-root-site sync | Small | 3.1 |
| 6 | Soften chatbot system-prompt claims | Minutes | 3.5 |
| 7 | Pick one host; add security headers (frame-ancestors, HSTS, nosniff) | Small | 3.6 |
| 8 | Central persistence helper for register writes (revert-or-banner on failure) | Medium | 3.2 |
| 9 | IS18/QGEA labelling + report cover over ISO 27001 + E8 data | Medium | 5.1 |
| 10 | axe/Lighthouse pass over the console; Key Vault/managed identity for the monitor | Medium | 5.2, 3.7 |

Items 1–3 are the true launch gate. Items 4–7 are a day of work combined and remove
every finding a competent security reviewer at Greenfield or the agency would flag on
first contact. Items 8–10 are the difference between "passes review" and "impresses the
reviewer."
