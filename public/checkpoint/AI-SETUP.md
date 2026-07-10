# Checkpoint — AI Assistant Setup

Checkpoint's AI assistant is a **purchasable add-on** (the `ai` entitlement
module — see §5) that gives a practitioner a drafting aid grounded in their
own compliance registers: policy language, evidence descriptions, risk
treatment notes, report commentary. It is a thin client in
`public/checkpoint/ai.js` for **the client's own Azure OpenAI resource, in
the client's own tenant and subscription** — Checkpoint never hosts, proxies,
or has its own access to any model. See `SETUP.md` for everything else
(app registration, permissions, the SharePoint-backed registers); this file
covers only what's specific to the AI assistant.

---

## 1. Data-flow statement (read this first)

**Everything stays in the client's own tenant.** Concretely:

- The AI assistant calls **the client's own Azure OpenAI resource**, at
  the endpoint URL the client themselves provisions and configures
  (`https://<their-resource>.openai.azure.com`) — never a
  Compliance365-hosted endpoint, never a third party's API.
- Authentication is **Entra ID bearer auth only** — the signed-in
  practitioner's own token, scoped to `https://cognitiveservices.azure.com/.default`,
  requested the first time the assistant is used (incremental consent,
  same pattern as every other Graph scope Checkpoint requests). **No API
  key is ever used, stored, or sent by this app.** Access is granted
  entirely through the client's own Entra RBAC role assignment (§3).
- The only data sent to the model is **whatever the practitioner
  explicitly ticks to include** for that specific question (§6's context
  picker) — Checkpoint never sends a whole register, never sends
  anything automatically, and every inclusion is visible in the UI
  before the practitioner clicks "Ask".
- The assistant is **strictly text-in/text-out** — it has no ability to
  call a function, invoke a tool, or reach Microsoft Graph. It cannot
  write to any register, cannot take any action, and every response is
  labelled "AI-assisted draft — review before use". See §7.
- Checkpoint's own audit log records that a call was made (who, which
  feature, which model deployment, when) — **never the prompt or
  response text itself**. See §8.
- No new third-party network origin is introduced: the Content-Security-
  Policy allows `https://*.openai.azure.com` and
  `https://*.cognitiveservices.azure.com` so the browser can reach
  whatever Azure OpenAI resource the client configures — this is the
  client's own resource, not a new external service Checkpoint talks to
  on their behalf.

If a client's own compliance/privacy review needs a written statement of
the above, §9 has a ready-to-adapt "AI transparency note" template.

---

## 2. Provision the Azure OpenAI resource (client tenant, once)

Done by the client's own Azure administrator, in **their** subscription —
Compliance365 never has access to this resource.

1. In the [Azure portal](https://portal.azure.com), search **Azure OpenAI**
   → **Create**.
2. Choose the client's own subscription and a resource group (a new one
   named something like `rg-checkpoint-ai` is fine).
3. **Region**: pick one where the desired model is available and that
   satisfies the client's own data-residency requirements (Azure OpenAI
   processes data in the region the resource is deployed to — check
   current model/region availability in Microsoft's docs, as this
   changes over time).
4. **Pricing tier**: Standard S0 is the usual choice for this workload
   (low, bursty usage — drafting assistance, not high-volume production
   traffic).
5. Create the resource. Once deployed, note its **endpoint URL** —
   Overview → "Endpoint" (looks like `https://your-resource.openai.azure.com`).
   This is what goes into Checkpoint's `aiEndpoint` setting (§6).

### Recommended model deployment

1. Open the resource → **Model deployments** → **Azure AI Foundry portal**
   (or **Deployments**, depending on portal version) → **Create new
   deployment**.
2. **Model**: `gpt-4o` is the recommended default — capable enough for
   drafting compliance language and following the grounding instructions
   in Checkpoint's system prompt. `gpt-4o-mini` is a reasonable
   lower-cost alternative for lighter usage; avoid older/smaller models
   for this use case, as the system prompt's grounding and
   don't-invent-references instructions are more reliably followed by
   more capable models.
3. **Deployment name**: whatever you like (e.g. `gpt-4o`, `checkpoint-assistant`)
   — this exact string is what goes into Checkpoint's `aiDeployment`
   setting (§6); it does not need to match the model name.
4. Leave content filtering at Azure's default configuration unless the
   client has a specific reason to change it.

---

## 3. RBAC — grant practitioners access (Cognitive Services OpenAI User)

Checkpoint authenticates with **the signed-in practitioner's own Entra
identity** — there is no service principal, no shared credential. Each
practitioner who should be able to use the AI assistant needs the
**Cognitive Services OpenAI User** role on the Azure OpenAI resource (or
its resource group, to cover everyone who might need it):

1. Azure portal → the Azure OpenAI resource → **Access control (IAM)** →
   **Add role assignment**.
2. Role: **Cognitive Services OpenAI User** (read/inference access —
   deliberately not **Cognitive Services OpenAI Contributor**, which
   would also allow managing the resource itself; practitioners only
   ever need to call it).
3. Assign to: the individual practitioners, or (more commonly) an Entra
   security group containing everyone who uses Checkpoint in a
   practitioner capacity — the same "Checkpoint Practitioners" group
   `SETUP.md`'s two-role model already describes is a natural fit, if the
   client has already set that up.
4. Save. Consent for the `https://cognitiveservices.azure.com/.default`
   scope is requested automatically the first time a practitioner with
   this role uses the AI assistant in Checkpoint — no separate admin
   consent step beyond the role assignment itself and the tenant's
   general Checkpoint app registration (`SETUP.md` §2).

A practitioner without this role reaches Checkpoint's normal "not
authorised" error (§7's error handling) the first time they try — this is
expected and correct, not a bug; grant the role and it starts working on
their very next attempt (no re-sign-in needed).

---

## 4. Network access

If the Azure OpenAI resource is configured with network restrictions
(private endpoint, selected networks), the practitioner's browser needs a
network path to it — same consideration as any other browser-based call to
a network-restricted Azure resource. Most Checkpoint deployments use the
resource's default public endpoint (still authenticated via Entra RBAC,
never anonymous) and don't need to change anything here.

---

## 5. It's a purchasable add-on — the `ai` entitlement module

The AI assistant nav item and view are invisible until this tenant's
signed activation grants the `ai` module — same purchasable-module
mechanism as every compliance framework, just not a compliance framework
itself (see `store.js`'s `window.ADDON_MODULES` comment).

To issue an activation that includes it:

```
node tools/issue-entitlement.mjs issue --tenant <client tenant> \
  --frameworks iso27001,soc2,ai \
  --expiry 2027-01-01 \
  --key entitlement-private.json --module-keys tools/module-keys.json \
  --out client-activation.json
```

`ai` goes in the same `--frameworks` list as any compliance framework —
see `tools/ISSUANCE.md` for the full issuance workflow. It needs a module
key the same way every other premium module does
(`node tools/issue-entitlement.mjs keygen-modules` generates one for `ai`
along with every other premium module by default). `--type partner` and
`--type demo` activations grant `ai` automatically, same as every other
module.

Once granted, the tenant's Frameworks & Settings view shows an "AI
assistant" row (status/toggle, same as any framework), and the AI
assistant nav item appears in the sidebar.

---

## 6. Configuring Checkpoint

Once the tenant is entitled (§5), a practitioner configures the assistant
either during onboarding (the wizard's optional "Enable AI" step, shown
only when the activation grants `ai`) or any time afterwards from the
**AI assistant** view:

1. **Azure OpenAI endpoint** — the resource's endpoint URL from §2.
2. **Deployment name** — the deployment name from §2 (not the model name,
   unless you named them the same).
3. Tick **Enable the AI assistant**, then **Save**.
4. **Test connection** verifies Checkpoint can reach the deployment with
   the practitioner's own current sign-in — a clean pass here means
   everything in §2–§4 is correctly wired.

These three values live in this tenant's own `Settings` SharePoint list
(`aiEndpoint`, `aiDeployment`, `aiEnabled`) — nothing is stored outside the
client's own tenant.

If any of the three isn't set, or the entitlement isn't granted, the AI
assistant view shows a plain "AI assistant not configured yet" card
linking back to this document — never a broken or silently-disabled
button.

---

## 7. Governance rails (what the assistant will and won't do)

These are enforced once, centrally, in `ai.js` — not something any
individual feature can accidentally skip:

- **Text in, text out only.** No function/tool calling is ever sent to
  the model, and the assistant never has Microsoft Graph access from
  within an AI call. It cannot write to any register or take any action.
- **Every response carries a visible "AI-assisted draft — review before
  use" label** — never presented as a finished, authoritative answer.
- **A central system prompt** instructs the model to ground answers in
  the supplied context and say which register data it used, to say "I
  don't have enough information" rather than invent control or risk
  references, and to never state or imply that a certification,
  accreditation, or audit outcome has been achieved — those are decided
  by accredited external auditors, never by this assistant.
- **Client-side rate limiting**: at most one AI request in flight at a
  time; a 429 (rate-limited) response from the Azure OpenAI resource is
  retried with exponential backoff (honouring a `Retry-After` header if
  present) before surfacing a clear "try again shortly" message.
- **Consent-not-granted / not-onboarded states** are handled cleanly: a
  401/403 response is shown as "not authorised — check the RBAC role
  assignment" (pointing back to §3), a 404 as "endpoint or deployment
  name not found" (pointing back to §2), and a network failure as
  "could not reach the AI endpoint" — never a raw stack trace or a
  silently broken button.

---

## 8. Audit logging

Every AI call — successful or failed — writes one entry to this tenant's
own Checkpoint audit log: **who** made the call (the signed-in
practitioner), **which feature** (general chat, policy drafting, evidence
drafting, risk drafting, report drafting), **which model deployment**
handled it, and **when**. The prompt text and the model's response are
**never** written to the audit log — only that a call happened, by whom,
for what, when.

---

## 9. AI transparency note (template)

Adapt this for the client's own AI-use disclosure, privacy notice, or
ISO/IEC 42001 documentation, as needed:

> **AI assistance in our compliance program.** We use an AI assistant,
> integrated into our Checkpoint compliance console, to help draft
> compliance-related text (policy language, evidence descriptions, risk
> treatment notes, report commentary). The assistant runs against our own
> Azure OpenAI resource, in our own tenant and subscription — no
> third-party service or Compliance365 ever receives our compliance data
> through this feature. Only the specific register data a staff member
> chooses to include with a given question is sent to the model; nothing
> is sent automatically. The assistant cannot access our systems, modify
> our records, or take any action — it only ever returns draft text for a
> human to review. Every AI-generated response is clearly labelled as a
> draft requiring review before use, and the assistant is instructed to
> say when it lacks sufficient information rather than invent details,
> and never to claim that a certification or audit outcome has been
> achieved. Use of this assistant is logged (who, when, for what purpose)
> for our own internal governance; the content of requests and responses
> is not retained in that log.

---

## 10. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| "AI assistant not configured yet" | `aiEnabled`/`aiEndpoint`/`aiDeployment` not all set, or the `ai` entitlement isn't granted | Check §5 (entitlement) and §6 (Settings) |
| "Not authorised" (401/403) on Test connection or Ask | Practitioner lacks the Cognitive Services OpenAI User role | §3 — grant the role, no re-sign-in needed |
| "Endpoint or deployment name not found" (404) | Typo in the endpoint URL, or the deployment name doesn't match what's in Azure | Double-check both against the Azure portal (§2) |
| "The AI endpoint is rate-limiting requests" | The Azure OpenAI resource is at its quota — this is Azure's rate limit, not Checkpoint's | Wait and retry, or raise the resource's quota in Azure |
| Nav item never appears at all | Tenant's activation doesn't grant `ai` | Reissue the activation with `ai` in `--frameworks` (§5) |
