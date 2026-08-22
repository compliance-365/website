/* Checkpoint — AWS posture checks.
 *
 * Pure functions: each takes the raw shape an AWS API returned and
 * decides pass / review / fail / manual, with a note explaining the
 * verdict in the same voice the Microsoft checks use.
 *
 * Kept separate from index.mjs (which does the AWS and Graph I/O) for
 * exactly one reason: this is the part worth unit-testing, and it can
 * be tested without an AWS account, without credentials, and without
 * mocking an SDK. index.mjs stays a thin wiring layer over it.
 *
 * The verdict vocabulary mirrors the browser app's:
 *   pass    the control is in place
 *   review  in place but not fully, or in place with a caveat worth a look
 *   fail    not in place
 *   manual  could not be measured -- never a guess, never a silent pass.
 *           A permission the collector was not granted resolves here,
 *           the same way a licence-gated Microsoft check does.
 */

export const AWS_CHECK_LABELS = {
  'aws-root-mfa': 'AWS root account protected by MFA',
  'aws-user-mfa': 'MFA enforced for AWS console users',
  'aws-key-age': 'IAM access keys rotated within policy',
  'aws-cloudtrail': 'CloudTrail enabled and multi-region',
  'aws-config': 'AWS Config recording resource state',
  'aws-guardduty': 'GuardDuty threat detection enabled',
  'aws-s3-public': 'S3 public access blocked account-wide',
  'aws-ebs-encryption': 'EBS volumes encrypted by default',
  'aws-rds-encryption': 'RDS instances encrypted at rest',
  'aws-sg-open': 'No security group exposes admin ports to the internet'
};

/* Ports whose exposure to 0.0.0.0/0 is the finding an assessor looks
   for first. Deliberately narrow: a public 443 is a web server doing
   its job, a public 22 or 3389 is remote administration open to the
   internet, which Essential Eight and ISO 27001 A.8.20/A.8.21 both
   treat as a control failure rather than a configuration choice. */
export const ADMIN_PORTS = [22, 3389, 3306, 5432, 1433, 27017, 6379, 9200];

const ok = (note) => ({ result: 'pass', note });
const bad = (note) => ({ result: 'fail', note });
const meh = (note) => ({ result: 'review', note });
const unknown = (note) => ({ result: 'manual', note });

/* IAM account summary -> root MFA. AWS reports this as a 0/1 counter. */
export function rootMfaCheck(summary) {
  if (!summary || typeof summary.AccountMFAEnabled !== 'number') {
    return unknown('Could not read the IAM account summary — check the collector has iam:GetAccountSummary.');
  }
  return summary.AccountMFAEnabled === 1
    ? ok('The root account has MFA enabled.')
    : bad('The root account has no MFA device. Root can do anything in the account and cannot be constrained by policy — this is the single highest-severity finding available in AWS.');
}

/* Console-capable users without an MFA device. Users with no console
   password are excluded: they are programmatic identities, and holding
   them to a console control would be a finding nobody can action. */
export function userMfaCheck(users) {
  if (!Array.isArray(users)) return unknown('Could not enumerate IAM users — check iam:ListUsers and iam:ListMFADevices.');
  const console_ = users.filter(u => u.hasConsoleAccess);
  if (!console_.length) return ok('No IAM users have console access — access is federated or programmatic only, which is stronger than enforcing MFA on local users.');
  const without = console_.filter(u => !u.mfaEnabled);
  if (!without.length) return ok(`All ${console_.length} console-capable IAM user${console_.length === 1 ? '' : 's'} have MFA.`);
  return bad(`${without.length} of ${console_.length} console-capable IAM users have no MFA device: ${without.slice(0, 5).map(u => u.userName).join(', ')}${without.length > 5 ? `, +${without.length - 5} more` : ''}.`);
}

/* Access-key age. maxAgeDays is the tenant's own policy, passed in
   rather than hard-coded, mirroring how the Microsoft checks read
   their thresholds from the tenant's Settings list. */
export function keyAgeCheck(keys, maxAgeDays, today) {
  if (!Array.isArray(keys)) return unknown('Could not enumerate IAM access keys — check iam:ListAccessKeys.');
  const active = keys.filter(k => k.status === 'Active');
  if (!active.length) return ok('No active IAM access keys — nothing to rotate.');
  const aged = active.filter(k => daysBetween(k.createdIso, today) > maxAgeDays);
  if (!aged.length) return ok(`All ${active.length} active access key${active.length === 1 ? '' : 's'} are within the ${maxAgeDays}-day rotation policy.`);
  const oldest = aged.reduce((m, k) => daysBetween(k.createdIso, today) > daysBetween(m.createdIso, today) ? k : m, aged[0]);
  return bad(`${aged.length} active access key${aged.length === 1 ? '' : 's'} older than ${maxAgeDays} days. Oldest: ${oldest.userName} at ${daysBetween(oldest.createdIso, today)} days.`);
}

export function cloudTrailCheck(trails) {
  if (!Array.isArray(trails)) return unknown('Could not describe CloudTrail — check cloudtrail:DescribeTrails and cloudtrail:GetTrailStatus.');
  if (!trails.length) return bad('No CloudTrail trail exists. Without it there is no record of who did what in this account, which forecloses most incident investigation and fails ISO 27001 A.8.15.');
  const logging = trails.filter(t => t.isLogging);
  if (!logging.length) return bad(`${trails.length} trail${trails.length === 1 ? ' exists' : 's exist'} but none are currently logging.`);
  const multi = logging.filter(t => t.isMultiRegion);
  if (!multi.length) return meh('CloudTrail is logging, but no trail is multi-region — activity in other regions is unrecorded, and an attacker choosing a region is a well-known blind spot.');
  return ok(`CloudTrail is logging across all regions (${multi.length} multi-region trail${multi.length === 1 ? '' : 's'}).`);
}

export function configCheck(recorders) {
  if (!Array.isArray(recorders)) return unknown('Could not read AWS Config status — check config:DescribeConfigurationRecorderStatus.');
  if (!recorders.length) return bad('AWS Config is not recording. Without it there is no history of how resource configuration changed over time.');
  const on = recorders.filter(r => r.recording);
  return on.length
    ? ok('AWS Config is recording resource configuration state.')
    : bad('An AWS Config recorder exists but is stopped.');
}

export function guardDutyCheck(detectors) {
  if (!Array.isArray(detectors)) return unknown('Could not read GuardDuty — check guardduty:ListDetectors and guardduty:GetDetector.');
  if (!detectors.length) return bad('GuardDuty is not enabled. It is the account\'s managed threat detection and is the cheapest detective control available in AWS.');
  const enabled = detectors.filter(d => d.status === 'ENABLED');
  return enabled.length
    ? ok('GuardDuty is enabled and monitoring this account.')
    : bad('A GuardDuty detector exists but is disabled.');
}

/* Account-level S3 Block Public Access. All four flags must be on: a
   partial block is the configuration people believe is protecting them
   and is the usual root cause of a public-bucket incident. */
export function s3PublicAccessCheck(cfg) {
  if (!cfg) return unknown('Could not read the account S3 public access block — check s3:GetAccountPublicAccessBlock.');
  const flags = ['BlockPublicAcls', 'IgnorePublicAcls', 'BlockPublicPolicy', 'RestrictPublicBuckets'];
  const off = flags.filter(f => !cfg[f]);
  if (!off.length) return ok('S3 public access is blocked account-wide on all four settings.');
  if (off.length === flags.length) return bad('S3 public access is not blocked at the account level — any bucket or object can be made public.');
  return meh(`S3 public access is only partly blocked; still permitted: ${off.join(', ')}. A partial block is the configuration people mistake for protection.`);
}

export function ebsEncryptionCheck(enabledByDefault) {
  if (typeof enabledByDefault !== 'boolean') return unknown('Could not read the EBS default-encryption setting — check ec2:GetEbsEncryptionByDefault.');
  return enabledByDefault
    ? ok('New EBS volumes are encrypted by default.')
    : bad('EBS default encryption is off, so a volume created without explicitly asking for encryption is unencrypted at rest.');
}

export function rdsEncryptionCheck(instances) {
  if (!Array.isArray(instances)) return unknown('Could not enumerate RDS instances — check rds:DescribeDBInstances.');
  if (!instances.length) return ok('No RDS instances in this account — nothing to encrypt.');
  const plain = instances.filter(i => !i.storageEncrypted);
  if (!plain.length) return ok(`All ${instances.length} RDS instance${instances.length === 1 ? ' is' : 's are'} encrypted at rest.`);
  return bad(`${plain.length} of ${instances.length} RDS instances are unencrypted at rest: ${plain.slice(0, 5).map(i => i.id).join(', ')}${plain.length > 5 ? `, +${plain.length - 5} more` : ''}. RDS encryption cannot be enabled in place — it needs a snapshot-and-restore, so this is worth planning rather than deferring.`);
}

export function openAdminPortsCheck(groups) {
  if (!Array.isArray(groups)) return unknown('Could not enumerate security groups — check ec2:DescribeSecurityGroups.');
  const offenders = [];
  for (const g of groups) {
    for (const rule of (g.inbound || [])) {
      if (!rule.openToWorld) continue;
      const ports = ADMIN_PORTS.filter(p => rule.fromPort != null && rule.toPort != null && p >= rule.fromPort && p <= rule.toPort);
      if (ports.length) offenders.push({ id: g.id, name: g.name, ports });
    }
  }
  if (!offenders.length) return ok('No security group exposes an administrative port to 0.0.0.0/0.');
  const shown = offenders.slice(0, 5).map(o => `${o.name || o.id} (${o.ports.join(', ')})`).join('; ');
  return bad(`${offenders.length} security group rule${offenders.length === 1 ? '' : 's'} expose admin ports to the whole internet: ${shown}${offenders.length > 5 ? `, +${offenders.length - 5} more` : ''}.`);
}

/* Whole-of-account roll-up, in the same {results, notes} shape the
   browser app and the Azure Function both write into a Scans row. */
export function buildAwsResults(input, opts) {
  const today = (opts && opts.today) || new Date().toISOString().slice(0, 10);
  const maxKeyAge = (opts && opts.maxKeyAgeDays) || 90;
  const out = { results: {}, notes: {} };
  const put = (id, verdict) => { out.results[id] = verdict.result; out.notes[id] = verdict.note; };

  put('aws-root-mfa', rootMfaCheck(input.accountSummary));
  put('aws-user-mfa', userMfaCheck(input.users));
  put('aws-key-age', keyAgeCheck(input.accessKeys, maxKeyAge, today));
  put('aws-cloudtrail', cloudTrailCheck(input.trails));
  put('aws-config', configCheck(input.configRecorders));
  put('aws-guardduty', guardDutyCheck(input.guardDutyDetectors));
  put('aws-s3-public', s3PublicAccessCheck(input.s3PublicAccessBlock));
  put('aws-ebs-encryption', ebsEncryptionCheck(input.ebsEncryptionByDefault));
  put('aws-rds-encryption', rdsEncryptionCheck(input.rdsInstances));
  put('aws-sg-open', openAdminPortsCheck(input.securityGroups));
  return out;
}

export function daysBetween(fromIso, toIso) {
  const a = Date.parse(String(fromIso).slice(0, 10) + 'T00:00:00Z');
  const b = Date.parse(String(toIso).slice(0, 10) + 'T00:00:00Z');
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((b - a) / 86400000);
}
