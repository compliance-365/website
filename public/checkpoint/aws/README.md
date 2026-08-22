# Checkpoint — AWS posture collector

An optional AWS Lambda, deployed into the **client's own** AWS account,
that re-runs a set of AWS posture checks on a schedule and writes the
results into the **client's own** SharePoint — the same `Checkpoint
Scans` and `Checkpoint Alerts` lists the browser app and the Azure
monitor already use.

Compliance365 operates no part of this and holds no credentials for it.
That is the same arrangement as the Azure `PostureMonitor`, and it is
the reason adding AWS coverage does not put a backend into an
architecture whose entire claim is that there isn't one.

## Why it exists

Every other check Checkpoint runs reads Microsoft Graph. For a client
whose product runs on AWS, that meant the console could see the
corporate tenant and not the production environment — the part an ISO
27001 or SOC 2 assessor asks about first. This closes that gap without
moving a single byte of client data outside the client's own accounts.

Entirely optional. Skip it and Checkpoint behaves exactly as before:
the ten `Cloud (AWS)` checks are never populated, resolve to *not
measured*, and are excluded from the posture score and hidden in the
UI. They appear the moment the first collector run lands — there is no
setting to remember to switch on.

## What it checks

| Check | Passes when |
| --- | --- |
| `aws-root-mfa` | The root account has an MFA device |
| `aws-user-mfa` | Every console-capable IAM user has MFA |
| `aws-key-age` | No active access key is older than the rotation policy |
| `aws-cloudtrail` | A multi-region trail exists and is logging |
| `aws-config` | An AWS Config recorder is running |
| `aws-guardduty` | GuardDuty is enabled |
| `aws-s3-public` | All four account-level public-access blocks are on |
| `aws-ebs-encryption` | EBS default encryption is on |
| `aws-rds-encryption` | Every RDS instance is encrypted at rest |
| `aws-sg-open` | No security group exposes an admin port to `0.0.0.0/0` |

Verdicts use the same vocabulary as the Microsoft checks — pass /
review / fail / **manual**. A permission the collector was not granted
resolves to `manual`, never to a pass and never to a fail: a check that
guesses is worse than one that abstains, and a false failure sends
somebody chasing a control that is actually fine.

Two judgements worth knowing about, because they are opinions rather
than facts:

- **Programmatic IAM users are not held to the console-MFA check.** A
  user with no login profile cannot use console MFA, so flagging it
  would be an unactionable finding.
- **Only administrative ports count as an open-to-the-world finding**
  (22, 3389, 3306, 5432, 1433, 27017, 6379, 9200). A public 443 is a
  web server doing its job; a public 22 is remote administration open
  to the internet.

## How results reach the app

The collector **merges into** the day's existing scan row rather than
writing its own. The Microsoft scan and this collector both contribute
to one row per day, and the posture score is recomputed over the union.
Writing an AWS-only row would blank every Microsoft result for that
day, and vice versa — `test/aws-collector.test.mjs` pins that
behaviour specifically.

Drift alerts work exactly as they do for Microsoft checks: a check that
passed on the previous scan and fails on this one raises one alert in
`Checkpoint Alerts`, deduplicated by check id so it is raised once and
acknowledged once.

## 1. Register the Graph app (client's Entra tenant)

The collector writes to SharePoint, so it needs an app-only Graph
identity — the same shape the Azure monitor uses, and it can reuse that
app registration if one already exists.

1. **Entra admin centre → App registrations → New registration.** Single
   tenant. Name it something like `Checkpoint AWS Collector`.
2. **Certificates & secrets → New client secret.** Copy the value now;
   it is shown once.
3. **API permissions → Microsoft Graph → Application permissions →
   `Sites.Selected`**, then grant admin consent.
4. Grant that app **write** access to the Checkpoint site only — scoped
   with `Sites.Selected`, not tenant-wide. See the main `SETUP.md`
   § Continuous monitoring for the exact `/permissions` call.

## 2. IAM policy for the Lambda

Read-only. Every action below maps to a check in the table above; there
is nothing here that can change the account.

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": [
      "iam:GetAccountSummary",
      "iam:ListUsers",
      "iam:ListMFADevices",
      "iam:ListAccessKeys",
      "iam:GetLoginProfile",
      "cloudtrail:DescribeTrails",
      "cloudtrail:GetTrailStatus",
      "config:DescribeConfigurationRecorderStatus",
      "guardduty:ListDetectors",
      "guardduty:GetDetector",
      "s3:GetAccountPublicAccessBlock",
      "ec2:GetEbsEncryptionByDefault",
      "ec2:DescribeSecurityGroups",
      "rds:DescribeDBInstances",
      "sts:GetCallerIdentity"
    ],
    "Resource": "*"
  }]
}
```

`Resource: "*"` is required because these are all account-level
describes with no per-resource ARN to scope to. If the client prefers
to grant less, drop individual actions — the corresponding check
degrades to `manual` and says which permission it was missing, which is
a legitimate way to run this.

## 3. Lambda configuration

Node 20 runtime. The AWS SDK v3 clients used are provided by the
runtime, so there is nothing to bundle — upload `collector/` as-is.

| Setting | Value |
| --- | --- |
| Handler | `index.handler` |
| Runtime | Node.js 20+ |
| Timeout | 60 seconds is comfortable; large accounts may want 120 |
| Trigger | EventBridge Scheduler, e.g. `cron(0 17 * * ? *)` for daily |

Environment variables:

| Variable | Value |
| --- | --- |
| `TENANT_ID` | The client's Entra tenant ID |
| `CLIENT_ID` | App registration (client) ID from step 1 |
| `CLIENT_SECRET` | The secret value from step 1 |
| `SP_HOSTNAME` | e.g. `contoso.sharepoint.com` |
| `SP_SITE_PATH` | e.g. `/sites/compliance` (omit for the root site) |
| `LIST_PREFIX` | Optional, defaults to `Checkpoint` |
| `MAX_KEY_AGE_DAYS` | Optional, defaults to `90` |

**Put `CLIENT_SECRET` in AWS Secrets Manager** and reference it, rather
than pasting it into a plain Lambda environment variable, on any
account where more than one person has console access.

## 4. Verify

Invoke the function once manually. It returns a summary:

```json
{ "today": "2026-08-22", "merged": true, "score": 78, "drift": 0, "checks": 10 }
```

- `merged: true` means it found the day's existing scan row and added
  to it; `false` means it created the row (the Microsoft scan had not
  run yet today).
- Then open Checkpoint: the **Cloud (AWS)** checks appear on the
  Posture scan view, and the Dashboard score now covers both clouds.

If a check reads *not measured*, its note names the AWS permission that
was missing — that is the intended way to find out you under-granted,
rather than discovering a silently-skipped check months later.
