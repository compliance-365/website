# Deploying the threat intel feed Lambda

`lambda/threat-intel.js` serves a filtered, tagged slice of CISA's Known
Exploited Vulnerabilities (KEV) catalog to the Checkpoint browser app's
**Threat intel** view (Risk & posture). It is the simplest Lambda in
this directory: no Entra app registration, no client secret, no Graph
call, and no tenant-specific behaviour at all — every browser that hits
it gets exactly the same response, so one deployment serves every
Checkpoint client.

## 1. Deploy

1. New Lambda function, Node.js 20.x runtime.
2. Paste `threat-intel.js` as `index.mjs` (or zip and upload).
3. Handler: `index.handler`.
4. No environment variables needed.
5. API Gateway HTTP API trigger, `GET /threat-intel`.
6. CORS on the route: Allow-Origin `https://www.compliance365.com.au`,
   Allow-Methods `GET, OPTIONS`.
7. Deploy it in `ap-southeast-2` (Sydney) like every other Lambda in
   this directory — `public/checkpoint/index.html`'s CSP `connect-src`
   already allowlists `https://*.execute-api.ap-southeast-2.amazonaws.com`
   for this exact reason (see its comment above the `<meta
   http-equiv="Content-Security-Policy">` tag). A different region
   means either widening that pattern or picking a fixed, real region
   label instead — the same trade-off `DEPLOY-PROVISION.md` and
   `DEPLOY-MARKETPLACE.md` already made.
8. Leave the timeout at AWS's default (3 seconds is plenty — the only
   work here is one outbound fetch to CISA, cached for 6 hours across
   warm invocations).

## 2. Point the app at it

Fill in `threatIntelUrl` in `public/checkpoint/config.js` with this
route's invoke URL. Leave it blank and the Threat intel view simply
shows its "not configured" state, exactly like every other optional
endpoint in this repo — nothing else in the app depends on this feed.

## 3. What this endpoint deliberately does NOT do

- **No tenant data in, ever.** This Lambda receives no Graph token, no
  tenant ID, and nothing about a client's declared industry or tech
  stack — those live entirely in the browser (Settings rows
  `orgIndustry`/`orgTechStack`) and are used only client-side, in
  lib.js's `rankThreatIntelItems()`, to re-sort the same feed every
  tenant already received. There is nothing here to scope per client,
  so there is only ever one deployment of this Lambda, unlike
  `provision.js` or `marketplace-fulfillment.js`.
- **Never fails loudly.** A CISA outage, a reshaped feed, or a network
  timeout all degrade to serving whatever is already cached (even if
  stale), and only fall through to an empty `{items: []}` response if
  nothing has ever been cached at all — never a 5xx. The browser side
  degrades further still: a fetch failure there falls back to a static
  "check CISA/ACSC directly" message. This is a "nice to have" panel,
  never something a practitioner's workflow depends on — the same
  "manual is never a failure" posture that runs through the rest of
  this app.
- **No filtering by anything CISA didn't already tell us.** The vendor
  allowlist and topic tags in `threat-intel.js` narrow an otherwise
  huge catalog down to something worth scanning in a few seconds; they
  are a curated starting point, not a claim that only these vendors
  matter to any given tenant.

## 4. Verify

1. In a browser console, run:
   ```js
   fetch(window.CHECKPOINT_CONFIG.threatIntelUrl).then(r => r.json()).then(console.log);
   ```
   Expect `{updatedAt: "...", items: [...]}` with each item carrying
   `cveId`, `vendor`, `product`, `tags`, and a working `url` to its NVD
   detail page.
2. Open the Checkpoint app's **Threat intel** view (Risk & posture) and
   confirm the list renders. Tick a tech-stack checkbox matching one of
   the fetched items' vendors and confirm it re-sorts to the top with a
   "Relevant to you" badge.
3. To see the graceful-degrade path, temporarily point `threatIntelUrl`
   at an unreachable URL and confirm the view falls back to its
   "couldn't load the live feed" message rather than breaking.
