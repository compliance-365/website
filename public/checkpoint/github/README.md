# Checkpoint — GitHub secure development collector

An optional scheduled job that runs in the **client's own** GitHub
organisation, reads how its repositories are protected and how quickly
security findings get fixed, and writes the results into the
**client's own** SharePoint. It uses the same `Checkpoint Scans` and
`Checkpoint Alerts` lists the browser app, the Azure monitor and the
AWS collector already use.

Compliance365 operates no part of this and holds no credentials for it.
That is the same arrangement as the AWS collector.

## Why it exists

ISO 27001 A.8.25–A.8.29 and A.8.32 cover secure development and change
management. For a client that builds software they are some of the
controls an assessor tests hardest, and they were the largest block of
Annex A with no automated evidence: each one was a practitioner's
assertion backed by a screenshot. The evidence already exists in GitHub.
Is every change reviewed before it merges? Do tests and scans gate the
merge? Are leaked secrets and vulnerable dependencies caught and fixed?

Entirely optional. Skip it and Checkpoint behaves exactly as before:
the seven `Secure development (GitHub)` checks are never populated,
resolve to *not measured*, and are left out of the posture score and
hidden in the UI. They appear once the first collector run lands.

## What it checks

| Check | Passes when | ISO 27001 |
| --- | --- | --- |
| `gh-branch-review` | Every default branch requires ≥1 approving review (rulesets or classic branch protection) | A.8.25, A.8.32 |
| `gh-status-checks` | Every default branch requires status checks to pass before merge | A.8.25, A.8.29 |
| `gh-secret-scanning` | Secret scanning **and** push protection are on for every repository | A.8.28, A.5.17 |
| `gh-secret-alerts` | No open secret-scanning alert older than `SECRET_WINDOW_DAYS` (7) | A.5.17, A.8.28 |
| `gh-dependabot` | No open critical Dependabot alert older than `VULN_WINDOW_DAYS` (30); an overdue high is a Review | A.8.8, A.8.28 |
| `gh-code-scanning` | Every repository has a code-scanning analysis in the last 30 days, with no critical/high finding open past the window | A.8.28, A.8.29 |
| `gh-org-2fa` | The organisation requires two-factor authentication | A.8.4, A.8.5 |

**A.8.26 and A.8.27 are deliberately not mapped.** They are about what
was *decided*: the security requirements for an application and the
architecture principles behind it. A repository setting cannot show
that, so these controls stay backed by documents.

Verdicts use the same vocabulary as every other Checkpoint check: pass /
review / fail / **manual**. If the collector was not granted a
permission, the check it backs resolves to `manual`. It never becomes a
guessed pass or a false fail.

Three judgement calls:

- **Archived repositories are out of scope**, because nothing merges
  into them. **Forks are out of scope by default.** Set
  `INCLUDE_FORKS=true` if your organisation develops in forks.
- **A zero from branch rules only counts when both rulesets and classic
  protection were readable.** A repository protected by one system must
  not fail because the other one is empty.
- **One unprotected repository is a Review. More than a quarter is a
  Fail.** A stray scratch repository is housekeeping. A quarter of the
  estate means review-before-merge is not how the organisation works.

Use `REPOS` to limit the collector to the repositories that are actually
in your ISMS scope. That also keeps sandboxes and experiments out of the
numbers.

## 1. Create the read-only GitHub App (client's organisation)

**Organisation settings → Developer settings → GitHub Apps → New GitHub
App.** Name it something like `Checkpoint Collector`. It needs no
webhook and no callback URL. Grant **read-only** permissions:

| Permission | Level | Why |
| --- | --- | --- |
| Repository → Metadata | Read | List repositories and read branch rulesets |
| Repository → Administration | Read | Classic branch protection, and the secret scanning / push protection settings |
| Repository → Secret scanning alerts | Read | `gh-secret-alerts` |
| Repository → Dependabot alerts | Read | `gh-dependabot` |
| Repository → Code scanning alerts | Read | `gh-code-scanning` |
| Organization → Administration | Read | Whether 2FA is required (`gh-org-2fa`) |

Nothing here can write. Install the App on the organisation (all
repositories, or just the in-scope ones). Generate a private key, and
note the App ID.

You can drop any permission. The check that depends on it becomes
`manual` and its note names the missing permission. That is a
legitimate way to run this collector.

## 2. Register the Graph app (client's Entra tenant)

This step is identical to the AWS collector's step 1: an app-only
identity with `Sites.Selected`, granted **write** on the Checkpoint site
only. If you already created one for the AWS collector or the Azure
monitor, reuse it. See `../aws/README.md` §1 and `SETUP.md`
§ Continuous monitoring.

## 3. Add the workflow

In a **private** repository in the organisation (a dedicated
`checkpoint-collector` repository works well):

1. Copy `collector/` and `package.json` into the repository root.
2. Copy `checkpoint-github-collector.yml` to `.github/workflows/`.
3. Add **repository variables**: `CHECKPOINT_GH_APP_ID`,
   `CHECKPOINT_TENANT_ID`, `CHECKPOINT_CLIENT_ID`,
   `CHECKPOINT_SP_HOSTNAME`, and optionally `CHECKPOINT_SP_SITE_PATH`,
   `CHECKPOINT_REPOS`, `CHECKPOINT_VULN_WINDOW_DAYS` and
   `CHECKPOINT_SECRET_WINDOW_DAYS`.
4. Add **repository secrets**: `CHECKPOINT_GH_APP_PRIVATE_KEY` (the
   App's .pem) and `CHECKPOINT_CLIENT_SECRET` (the Graph app's secret).
5. Run it once from the **Actions** tab (`workflow_dispatch`) and check
   the log.

Copying the code in, rather than fetching it at run time, is deliberate.
You get a reviewed, pinned copy, and an update from us only reaches
your runner when you choose to take it.

To see what it would write without touching SharePoint, run
`DRY_RUN=1 GH_TOKEN=… GH_ORG=… node collector/index.mjs` locally.

## How results reach the app

The same as the AWS collector. The collector **merges into** the day's
existing scan row, never replaces it, and the posture score is
recomputed over the union. A check that goes from pass to fail raises
one drift alert in `Checkpoint Alerts`, deduplicated by check id.
`test/github-collector.test.mjs` pins both behaviours.

## Limits worth knowing

- Up to 200 repositories and 20 pages of each alert type are read per
  run. Raise `MAX_REPOS` if you need more.
- Code scanning, secret scanning on private repositories, and push
  protection need GitHub Advanced Security (or GitHub Secret Protection
  / Code Security) on private repositories. Where the organisation does
  not have it, those checks report what is actually true, that the
  capability is off. Consider carefully whether that is a finding or a
  scoping decision, and record it on the check.
- Azure DevOps and GitLab are not covered yet. The check functions in
  `collector/checks.mjs` take a platform-neutral shape, so adding a
  second source means writing a collector, not new checks.
