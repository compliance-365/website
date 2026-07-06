/* ============================================================
   Checkpoint — configuration
   ------------------------------------------------------------
   1. Register a multi-tenant app in Microsoft Entra (see SETUP.md)
   2. Paste its Application (client) ID below
   3. Redeploy. Until a clientId is set, the app runs in demo mode.
   ============================================================ */
window.CHECKPOINT_CONFIG = {
  /* Application (client) ID from your Entra app registration.
     Empty string = demo mode only. */
  clientId: 'e335e243-0417-4eac-b2d6-8f894891da33',

  /* 'organizations' = any Entra work/school tenant (multi-tenant).
     To lock to a single tenant during testing, put the tenant ID here. */
  authority: 'https://login.microsoftonline.com/organizations',

  /* Delegated Graph scopes requested at sign-in.
     All are read-only except Sites.Manage.All, which lets Checkpoint
     create and write its SharePoint lists in the client tenant. */
  scopes: [
    'User.Read',
    'Directory.Read.All',
    'Policy.Read.All',
    'SecurityEvents.Read.All',
    'DeviceManagementManagedDevices.Read.All',
    'Sites.Manage.All'
  ],

  /* SharePoint site that holds the Checkpoint lists.
     'root' = the tenant root site (https://contoso.sharepoint.com).
     Or a server-relative path like '/sites/compliance'. */
  site: 'root',

  /* Prefix for the SharePoint lists Checkpoint provisions. */
  listPrefix: 'Checkpoint'
};
