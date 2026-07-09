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
       (Board view) or "Send questionnaire" (Vendor risk view) is used. */
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
  listPrefix: 'Checkpoint'
};
