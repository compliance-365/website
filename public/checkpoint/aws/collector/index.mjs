/* Checkpoint — AWS posture collector.
 *
 * Runs entirely inside the CLIENT's own AWS account (their Lambda,
 * their IAM role, their schedule) and writes its findings into the
 * CLIENT's own SharePoint. Compliance365 operates no part of this and
 * holds no credentials for it -- the same arrangement as the Azure
 * PostureMonitor, and the reason adding AWS coverage does not put a
 * backend into an architecture whose whole claim is that there isn't
 * one.
 *
 * Why this exists: every other check Checkpoint runs reads Microsoft
 * Graph, so for a client whose product runs on AWS the console could
 * see the corporate tenant and not the production environment -- the
 * part an ISO 27001 or SOC 2 assessor asks about first.
 *
 * MERGE, DO NOT REPLACE. The Microsoft scan and this collector both
 * write into the same Scans row for a given day. This reads the
 * existing row for today, merges its aws-* keys in and recomputes the
 * score over the union. Writing an AWS-only row would blank every
 * Microsoft result for that day, and vice versa.
 *
 * All AWS reads are read-only. See ../README.md for the exact IAM
 * policy and why each permission is needed.
 */
import { IAMClient, GetAccountSummaryCommand, ListUsersCommand, ListMFADevicesCommand, ListAccessKeysCommand, GetLoginProfileCommand } from '@aws-sdk/client-iam';
import { CloudTrailClient, DescribeTrailsCommand, GetTrailStatusCommand } from '@aws-sdk/client-cloudtrail';
import { ConfigServiceClient, DescribeConfigurationRecorderStatusCommand } from '@aws-sdk/client-config-service';
import { GuardDutyClient, ListDetectorsCommand, GetDetectorCommand } from '@aws-sdk/client-guardduty';
import { S3ControlClient, GetPublicAccessBlockCommand } from '@aws-sdk/client-s3-control';
import { EC2Client, GetEbsEncryptionByDefaultCommand, DescribeSecurityGroupsCommand } from '@aws-sdk/client-ec2';
import { RDSClient, DescribeDBInstancesCommand } from '@aws-sdk/client-rds';
import { STSClient, GetCallerIdentityCommand } from '@aws-sdk/client-sts';
import { buildAwsResults } from './checks.mjs';
import { mergeIntoScan, raiseAwsDrift } from './scan-merge.mjs';

const GRAPH = 'https://graph.microsoft.com/v1.0';

/* ---------- AWS collection ---------------------------------------- */

/* Every collector is individually fault-tolerant. A permission the
   client chose not to grant must degrade that ONE check to 'manual'
   (see checks.mjs), never fail the run and lose the other nine. */
async function safe(label, fn, log) {
  try { return await fn(); }
  catch (e) { log(`Checkpoint AWS collector: ${label} unavailable — ${e.name || 'error'}: ${e.message}`); return null; }
}

async function collectAws(region, log) {
  const cfg = { region };
  const iam = new IAMClient(cfg);
  const out = {};

  out.accountSummary = await safe('IAM account summary', async () =>
    (await iam.send(new GetAccountSummaryCommand({}))).SummaryMap, log);

  out.users = await safe('IAM users', async () => {
    const users = [];
    let marker;
    do {
      const page = await iam.send(new ListUsersCommand({ Marker: marker }));
      for (const u of (page.Users || [])) {
        const mfa = await iam.send(new ListMFADevicesCommand({ UserName: u.UserName }));
        /* A user with no login profile cannot sign in to the console,
           so an MFA finding against them would be unactionable noise. */
        let hasConsole = false;
        try { await iam.send(new GetLoginProfileCommand({ UserName: u.UserName })); hasConsole = true; }
        catch (e) { if (e.name !== 'NoSuchEntityException') throw e; }
        users.push({ userName: u.UserName, hasConsoleAccess: hasConsole, mfaEnabled: (mfa.MFADevices || []).length > 0 });
      }
      marker = page.IsTruncated ? page.Marker : undefined;
    } while (marker);
    return users;
  }, log);

  out.accessKeys = await safe('IAM access keys', async () => {
    if (!Array.isArray(out.users)) return null;
    const keys = [];
    for (const u of out.users) {
      const res = await iam.send(new ListAccessKeysCommand({ UserName: u.userName }));
      for (const k of (res.AccessKeyMetadata || [])) {
        keys.push({ userName: u.userName, status: k.Status, createdIso: (k.CreateDate || new Date()).toISOString() });
      }
    }
    return keys;
  }, log);

  out.trails = await safe('CloudTrail', async () => {
    const ct = new CloudTrailClient(cfg);
    const res = await ct.send(new DescribeTrailsCommand({ includeShadowTrails: false }));
    const trails = [];
    for (const t of (res.trailList || [])) {
      let isLogging = false;
      try { isLogging = !!(await ct.send(new GetTrailStatusCommand({ Name: t.TrailARN }))).IsLogging; } catch (e) { /* status unreadable — treated as not logging */ }
      trails.push({ name: t.Name, isMultiRegion: !!t.IsMultiRegionTrail, isLogging });
    }
    return trails;
  }, log);

  out.configRecorders = await safe('AWS Config', async () => {
    const c = new ConfigServiceClient(cfg);
    const res = await c.send(new DescribeConfigurationRecorderStatusCommand({}));
    return (res.ConfigurationRecordersStatus || []).map(r => ({ name: r.name, recording: !!r.recording }));
  }, log);

  out.guardDutyDetectors = await safe('GuardDuty', async () => {
    const gd = new GuardDutyClient(cfg);
    const ids = (await gd.send(new ListDetectorsCommand({}))).DetectorIds || [];
    const detectors = [];
    for (const id of ids) {
      const d = await gd.send(new GetDetectorCommand({ DetectorId: id }));
      detectors.push({ id, status: d.Status });
    }
    return detectors;
  }, log);

  out.s3PublicAccessBlock = await safe('S3 account public access block', async () => {
    const accountId = (await new STSClient(cfg).send(new GetCallerIdentityCommand({}))).Account;
    const s3c = new S3ControlClient(cfg);
    const res = await s3c.send(new GetPublicAccessBlockCommand({ AccountId: accountId }));
    return res.PublicAccessBlockConfiguration || null;
  }, log);

  out.ebsEncryptionByDefault = await safe('EBS default encryption', async () => {
    const ec2 = new EC2Client(cfg);
    return !!(await ec2.send(new GetEbsEncryptionByDefaultCommand({}))).EbsEncryptionByDefault;
  }, log);

  out.rdsInstances = await safe('RDS instances', async () => {
    const rds = new RDSClient(cfg);
    const res = await rds.send(new DescribeDBInstancesCommand({}));
    return (res.DBInstances || []).map(i => ({ id: i.DBInstanceIdentifier, storageEncrypted: !!i.StorageEncrypted }));
  }, log);

  out.securityGroups = await safe('security groups', async () => {
    const ec2 = new EC2Client(cfg);
    const res = await ec2.send(new DescribeSecurityGroupsCommand({}));
    return (res.SecurityGroups || []).map(g => ({
      id: g.GroupId, name: g.GroupName,
      inbound: (g.IpPermissions || []).map(p => ({
        fromPort: p.FromPort, toPort: p.ToPort,
        openToWorld: (p.IpRanges || []).some(r => r.CidrIp === '0.0.0.0/0') ||
                     (p.Ipv6Ranges || []).some(r => r.CidrIpv6 === '::/0')
      }))
    }));
  }, log);

  return out;
}

/* ---------- Microsoft Graph (write side) --------------------------- */

async function graphToken() {
  const res = await fetch(`https://login.microsoftonline.com/${process.env.TENANT_ID}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.CLIENT_ID, client_secret: process.env.CLIENT_SECRET,
      scope: 'https://graph.microsoft.com/.default', grant_type: 'client_credentials'
    })
  });
  if (!res.ok) throw new Error('Graph token request failed: ' + res.status + ' ' + await res.text());
  return (await res.json()).access_token;
}

function graphClient(token) {
  return async function g(path, opts = {}) {
    const res = await fetch(path.startsWith('http') ? path : GRAPH + path, {
      method: opts.method || 'GET',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: opts.body ? JSON.stringify(opts.body) : undefined
    });
    if (!res.ok) throw new Error(`Graph ${res.status} on ${path}: ${await res.text()}`);
    return res.status === 204 ? null : res.json();
  };
}

async function resolveSiteAndLists(g) {
  const hostname = process.env.SP_HOSTNAME;
  const sitePath = process.env.SP_SITE_PATH || '';
  const siteId = hostname
    ? (await g(sitePath ? `/sites/${hostname}:${sitePath}?$select=id` : `/sites/${hostname}?$select=id`)).id
    : (await g('/sites/root?$select=id')).id;
  const prefix = process.env.LIST_PREFIX || 'Checkpoint';
  const lists = await g(`/sites/${siteId}/lists?$select=id,displayName&$top=200`);
  const byName = {};
  (lists.value || []).forEach(l => { byName[l.displayName] = l.id; });
  const scans = byName[prefix + ' Scans'];
  if (!scans) throw new Error(`List "${prefix} Scans" not found — has the Checkpoint browser app been run at least once against this site?`);
  return { siteId, scansListId: scans, alertsListId: byName[prefix + ' Alerts'] || null };
}

export const handler = async () => {
  const log = (m) => console.log(m);
  const today = new Date().toISOString().slice(0, 10);
  const region = process.env.AWS_REGION || 'ap-southeast-2';

  const raw = await collectAws(region, log);
  const awsOut = buildAwsResults(raw, { today, maxKeyAgeDays: Number(process.env.MAX_KEY_AGE_DAYS) || 90 });

  const g = graphClient(await graphToken());
  const { siteId, scansListId, alertsListId } = await resolveSiteAndLists(g);
  const { merged, score } = await mergeIntoScan(g, siteId, scansListId, awsOut, today);
  const drift = await raiseAwsDrift(g, siteId, scansListId, alertsListId, awsOut, today, log);

  const summary = { today, merged, score, drift, checks: Object.keys(awsOut.results).length };
  log('Checkpoint AWS collector: ' + JSON.stringify(summary));
  return summary;
};
