/* ============================================================
   Checkpoint — configuration
   ------------------------------------------------------------
   1. Register a multi-tenant app in Microsoft Entra (see SETUP.md)
   2. Paste its Application (client) ID below
   3. Redeploy. Until a clientId is set, the app runs in demo mode.

   NOTE: index.html loads this (and graph.js/store.js/app.js) with a
   "?v=N" cache-buster. Bump N in index.html whenever any of these
   four files change, or browsers/CDN may keep serving a stale copy.
   ============================================================ */
window.CHECKPOINT_CONFIG = {
  /* Application (client) ID from your Entra app registration.
     Empty string = demo mode only. */
  clientId: 'e335e243-0417-4eac-b2d6-8f894891da33',

  /* 'organizations' = any Entra work/school tenant (multi-tenant).
     To lock to a single tenant during testing, put the tenant ID here. */
  authority: 'https://login.microsoftonline.com/organizations',

  /* Delegated Graph scopes, split so sign-in only ever asks for what's
     needed right now (incremental consent) rather than everything up
     front:
     - scopesReadOnly: requested at sign-in. Posture checks only —
       nothing here can write anything.
     - scopesProvision: requested the first time this tenant's
       SharePoint lists are provisioned/read/written (Store.load()).
       Granted once per tenant; silent after that, same as any other
       scope MSAL has already been consented for.
     - scopesMail: requested the first time "Email status update"
       (Board view), "Send questionnaire" (Vendor risk view), or the
       opt-in email digest (Frameworks/Settings view) is used. */
  scopesReadOnly: [
    'User.Read',
    'Directory.Read.All',
    'Policy.Read.All',
    'SecurityEvents.Read.All',
    'DeviceManagementManagedDevices.Read.All',
    'DeviceManagementConfiguration.Read.All',
    'RoleManagement.Read.Directory',
    'IdentityRiskyUser.Read.All'
  ],
  scopesProvision: ['Sites.Manage.All'],
  scopesMail: ['Mail.Send'],
  /* Requested the first time the AI assistant is used (incremental
     consent, same pattern as scopesProvision/scopesMail) — Entra ID
     bearer auth against the client's OWN Azure OpenAI resource in
     THEIR tenant (see AI-SETUP.md). '.default' means "whatever this
     app is already assigned" — RBAC (Cognitive Services OpenAI User)
     is what actually grants access, not this scope string. No API key
     is ever used or stored; this is the only auth path ai.js has. */
  scopesAi: ['https://cognitiveservices.azure.com/.default'],

  /* SharePoint site that holds the Checkpoint lists — the deploy-time
     default. 'root' = the tenant root site (https://contoso.sharepoint.com).
     Or a server-relative path like '/sites/compliance'.
     For a live tenant, the first-run onboarding wizard's site-selection
     step (app.js Wizard, SETUP.md §4a) lets each client choose root or
     their own path, validates it, and overrides this value for that
     tenant/browser going forward (see applyStoredSitePreference() in
     app.js) — this default only matters before a tenant has onboarded,
     or if the wizard's choice was never made (e.g. demo mode, which
     never touches SharePoint at all). */
  site: 'root',

  /* Prefix for the SharePoint lists Checkpoint provisions. */
  listPrefix: 'Checkpoint',

  /* Compliance365's Ed25519 public key (raw, 32 bytes, base64) —
     verifies signed activation files (app.js, lib.js's
     verifyEntitlementSignature()). A valid, current activation now
     licenses the WHOLE app for a real tenant: SpStore refuses to
     provision a brand-new tenant without one (store.js's
     assertActivationAuthorizesProvisioning()), and an already-live
     tenant goes read-only once its activation expires past its grace
     period — see SETUP.md §7a and tools/ISSUANCE.md for the full
     design and issuance runbook. The matching private key is
     generated and held by us (tools/issue-entitlement.mjs keygen),
     never shipped anywhere near this file. Rotate this (and every
     client's issued file) only if the private key is ever exposed —
     see ISSUANCE.md §2.
     The placeholder below verifies nothing real; replace it with your
     own generated key before issuing activation files for a client.
     Until then, every real tenant fails activation (the "missing/
     invalid" state — demo mode only, with a paste-activation entry
     point) exactly as if a genuine file had failed to verify, so a
     placeholder key is safe to ship — it can't accidentally grant
     anything. */
  entitlementPublicKey: 'REPLACE_WITH_YOUR_GENERATED_PUBLIC_KEY_BASE64'
};
