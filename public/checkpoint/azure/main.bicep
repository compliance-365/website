// Checkpoint — continuous posture monitor infrastructure.
// Source of truth for azuredeploy.json (the "Deploy to Azure" button
// target). Hand-kept in sync with that file since this repo has no
// Bicep CLI in its build pipeline — if you change one, change the
// other. To regenerate azuredeploy.json yourself: `az bicep build
// --file main.bicep --outfile azuredeploy.json`.
//
// Deploys entirely into the CLIENT tenant's own Azure subscription —
// Compliance365 never runs or has access to this compute. See
// README.md for the app registration steps and the exact Graph
// application permissions this Function needs, with a least-privilege
// justification for each.

@description('Globally-unique name for the Function App (also becomes <name>.azurewebsites.net).')
param functionAppName string

@description('Region to deploy into — use the same region as the client\'s other Microsoft 365/Azure resources.')
param location string = resourceGroup().location

@description('The client\'s Entra tenant ID (Directory (tenant) ID from the app registration\'s Overview page).')
param tenantId string

@description('Application (client) ID of the app registration created for this monitor.')
param clientId string

@description('Client secret value for that app registration, stored directly as a Function App setting. Leave BLANK and supply clientSecretKeyVaultSecretUri instead to keep the secret in Key Vault, which is the recommended production path — see README.md.')
@secure()
param clientSecret string = ''

@description('Optional. Key Vault secret URI holding the client secret, e.g. https://my-vault.vault.azure.net/secrets/checkpoint-monitor-secret. When set, CLIENT_SECRET becomes a Key Vault reference resolved at runtime by this Function App\'s system-assigned managed identity (grant it \'get\' on the vault\'s secrets) and no secret value is ever stored in app settings or passed through this template. Takes precedence over clientSecret.')
param clientSecretKeyVaultSecretUri string = ''

@description('SharePoint hostname, e.g. contoso.sharepoint.com — the same tenant the interactive Checkpoint app is configured against.')
param spHostname string

@description('Site-relative path, e.g. /sites/Checkpoint. Leave blank for the root site — must match CHECKPOINT_CONFIG.site in config.js.')
param spSitePath string = ''

@description('Must match CHECKPOINT_CONFIG.listPrefix in config.js.')
param listPrefix string = 'Checkpoint'

@description('NCRONTAB schedule (seconds precision, UTC). Default: once daily at 17:00 UTC.')
param scanCron string = '0 0 17 * * *'

var storageAccountName = substring(concat('cpmon', uniqueString(resourceGroup().id)), 0, 20)
var hostingPlanName = '${functionAppName}-plan'
var appInsightsName = '${functionAppName}-ai'
// Signs the short-lived, per-action tokens behind the owner-driven
// evidence links this Function App emails to an overdue action's
// OwnerEmail (see EvidenceSubmit/index.js and lib/evidenceToken.js).
// Deployment-derived, not a parameter: nothing here needs the
// practitioner to type in yet another secret, and guid() is
// unpredictable enough for an HMAC key nobody outside this deployment
// ever needs to see or type.
var evidenceLinkSecret = guid(resourceGroup().id, functionAppName, 'evidenceLinkSecret')

resource storage 'Microsoft.Storage/storageAccounts@2022-09-01' = {
  name: storageAccountName
  location: location
  sku: { name: 'Standard_LRS' }
  kind: 'StorageV2'
  properties: {
    minimumTlsVersion: 'TLS1_2'
    allowBlobPublicAccess: false
  }
}

resource appInsights 'Microsoft.Insights/components@2020-02-02' = {
  name: appInsightsName
  location: location
  kind: 'web'
  properties: { Application_Type: 'web' }
}

resource hostingPlan 'Microsoft.Web/serverfarms@2022-03-01' = {
  name: hostingPlanName
  location: location
  sku: { name: 'Y1', tier: 'Dynamic' }
  kind: 'functionapp,linux'
  properties: { reserved: true }
}

resource functionApp 'Microsoft.Web/sites@2022-03-01' = {
  name: functionAppName
  location: location
  kind: 'functionapp,linux'
  // Needed for the Key Vault reference path above: the runtime resolves
  // @Microsoft.KeyVault(...) as this identity, so it is what gets 'get'
  // on the vault's secrets. Harmless when the plaintext path is used.
  identity: { type: 'SystemAssigned' }
  properties: {
    serverFarmId: hostingPlan.id
    httpsOnly: true
    siteConfig: {
      linuxFxVersion: 'Node|20'
      minTlsVersion: '1.2'
      ftpsState: 'Disabled'
      appSettings: [
        { name: 'AzureWebJobsStorage', value: 'DefaultEndpointsProtocol=https;AccountName=${storageAccountName};AccountKey=${storage.listKeys().keys[0].value};EndpointSuffix=core.windows.net' }
        { name: 'WEBSITE_CONTENTAZUREFILECONNECTIONSTRING', value: 'DefaultEndpointsProtocol=https;AccountName=${storageAccountName};AccountKey=${storage.listKeys().keys[0].value};EndpointSuffix=core.windows.net' }
        { name: 'WEBSITE_CONTENTSHARE', value: toLower(functionAppName) }
        { name: 'FUNCTIONS_EXTENSION_VERSION', value: '~4' }
        { name: 'FUNCTIONS_WORKER_RUNTIME', value: 'node' }
        { name: 'WEBSITE_NODE_DEFAULT_VERSION', value: '~20' }
        { name: 'APPINSIGHTS_INSTRUMENTATIONKEY', value: appInsights.properties.InstrumentationKey }
        { name: 'TENANT_ID', value: tenantId }
        { name: 'CLIENT_ID', value: clientId }
        { name: 'CLIENT_SECRET', value: empty(clientSecretKeyVaultSecretUri) ? clientSecret : '@Microsoft.KeyVault(SecretUri=${clientSecretKeyVaultSecretUri})' }
        { name: 'SP_HOSTNAME', value: spHostname }
        { name: 'SP_SITE_PATH', value: spSitePath }
        { name: 'LIST_PREFIX', value: listPrefix }
        { name: 'SCAN_CRON', value: scanCron }
        { name: 'EVIDENCE_LINK_SECRET', value: evidenceLinkSecret }
      ]
      // Lets the browser page at https://www.compliance365.com.au/checkpoint/evidence.html
      // (Compliance365's own public site — NOT this Function App) call
      // EvidenceSubmit's HTTP endpoint from a different origin. The page
      // is static and holds no secrets; the per-action token in its own
      // URL is the real authorisation boundary (see
      // lib/evidenceToken.js), so this only needs to allow the ONE
      // origin the page is actually served from — never '*'.
      cors: {
        allowedOrigins: [
          'https://www.compliance365.com.au'
        ]
      }
    }
  }
}

output functionAppName string = functionAppName
output nextStep string = 'Infrastructure is up. Now deploy the function code: cd public/checkpoint/azure && func azure functionapp publish ${functionAppName}. See README.md.'
