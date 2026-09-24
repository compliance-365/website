/* Checkpoint — GitHub secure development checks.
 *
 * Pure functions: each takes the shape the GitHub REST API returned
 * (normalised by index.mjs) and decides pass / review / fail / manual,
 * with a note in the same voice as the Microsoft and AWS checks.
 *
 * Why these exist: ISO 27001 A.8.25 (secure development life cycle),
 * A.8.28 (secure coding), A.8.29 (security testing) and A.8.32 (change
 * management) were the largest block of Annex A with no automated
 * signal at all — every one was a practitioner's assertion backed by a
 * screenshot. For a client that ships software, the evidence an
 * assessor actually wants lives in the source platform: is every change
 * reviewed before it merges, do tests and security scans gate it, are
 * leaked secrets and vulnerable dependencies caught and fixed.
 *
 * What these deliberately do NOT claim: A.8.26 (application security
 * requirements) and A.8.27 (secure architecture principles) are about
 * what was DECIDED, which a repository setting cannot show. Mapping a
 * branch rule onto them would be the unearned coverage the assurance
 * ranking exists to prevent, so they stay documentary.
 *
 * Verdict vocabulary mirrors the browser app's, including the rule that
 * matters most: a permission the collector was not granted resolves to
 * 'manual' — never a guess, never a silent pass.
 */

export const GITHUB_CHECK_LABELS = {
  'gh-branch-review': 'Default branches require a reviewed pull request',
  'gh-status-checks': 'Default branches require passing status checks',
  'gh-secret-scanning': 'Secret scanning and push protection enabled',
  'gh-secret-alerts': 'No unresolved leaked-secret alerts',
  'gh-dependabot': 'Vulnerable dependencies fixed within the window',
  'gh-code-scanning': 'Code scanning (SAST) runs on every repository',
  'gh-org-2fa': 'Two-factor authentication required for the organisation'
};

const ok = (note) => ({ result: 'pass', note });
const bad = (note) => ({ result: 'fail', note });
const meh = (note) => ({ result: 'review', note });
const unknown = (note) => ({ result: 'manual', note });

const plural = (n, one, many) => `${n} ${n === 1 ? one : (many || one + 's')}`;
function listSome(names, max = 5) {
  return names.slice(0, max).join(', ') + (names.length > max ? `, +${names.length - max} more` : '');
}

export function daysBetween(fromIso, toIso) {
  const a = Date.parse(String(fromIso).slice(0, 10) + 'T00:00:00Z');
  const b = Date.parse(String(toIso).slice(0, 10) + 'T00:00:00Z');
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((b - a) / 86400000);
}

/* Repositories in scope: not archived (nothing merges into them any
   more). Forks are left to index.mjs's REPO filter rather than dropped
   here, since some organisations develop in forks deliberately. */
function inScope(repos) {
  return (repos || []).filter(r => r && !r.archived);
}

/* A.8.25 / A.8.32 — every change to the default branch goes through a
   pull request that someone other than its author approved. Reads both
   repository rulesets and classic branch protection: an organisation
   can use either, and reading only one would fail a repository that is
   in fact protected. requiredReviews is null when neither source could
   be read, which abstains rather than failing the repository. */
export function branchReviewCheck(repos) {
  if (!Array.isArray(repos)) return unknown('Could not list repositories — check the collector\'s GitHub App has Metadata: read on the organisation.');
  const list = inScope(repos);
  if (!list.length) return unknown('No active repositories in scope.');
  const readable = list.filter(r => r.protection && typeof r.protection.requiredReviews === 'number');
  if (!readable.length) return unknown('Could not read branch rules or protection on any repository — grant Administration: read so classic branch protection is visible.');
  const without = readable.filter(r => r.protection.requiredReviews < 1);
  const unread = list.length - readable.length;
  const tail = unread ? ` ${plural(unread, 'repository', 'repositories')} could not be read and ${unread === 1 ? 'is' : 'are'} not counted.` : '';
  if (!without.length) return ok(`All ${plural(readable.length, 'repository', 'repositories')} require at least one approving review before merging to the default branch.${tail}`);
  /* A stray unprotected repository is a review; more than a quarter of
     them means review-before-merge is not the organisation's practice. */
  return (without.length / readable.length > 0.25 ? bad : meh)(`${without.length} of ${readable.length} repositories let changes reach the default branch without an approving review: ${listSome(without.map(r => r.name))}.${tail}`);
}

/* A.8.25 / A.8.29 — tests and scans are a merge GATE, not a report
   someone may read later. */
export function statusChecksCheck(repos) {
  if (!Array.isArray(repos)) return unknown('Could not list repositories.');
  const list = inScope(repos);
  if (!list.length) return unknown('No active repositories in scope.');
  const readable = list.filter(r => r.protection && typeof r.protection.requiredStatusChecks === 'number');
  if (!readable.length) return unknown('Could not read branch rules or protection on any repository — grant Administration: read so classic branch protection is visible.');
  const without = readable.filter(r => r.protection.requiredStatusChecks < 1);
  if (!without.length) return ok(`All ${plural(readable.length, 'repository', 'repositories')} require status checks to pass before merging.`);
  return (without.length === readable.length ? bad : meh)(`${without.length} of ${readable.length} repositories merge without any required status check: ${listSome(without.map(r => r.name))}. CI that is not required is advice, not a control.`);
}

/* A.8.28 / A.5.17 — leaked credentials are caught, and push protection
   stops them landing in the first place. */
export function secretScanningCheck(repos) {
  if (!Array.isArray(repos)) return unknown('Could not list repositories.');
  const list = inScope(repos);
  if (!list.length) return unknown('No active repositories in scope.');
  const readable = list.filter(r => r.secretScanning === 'enabled' || r.secretScanning === 'disabled');
  if (!readable.length) return unknown('Secret scanning settings are not visible to the collector — they are returned only to identities with Administration: read on the repository.');
  const off = readable.filter(r => r.secretScanning !== 'enabled');
  const noPush = readable.filter(r => r.secretScanning === 'enabled' && r.pushProtection !== 'enabled');
  if (off.length) return bad(`Secret scanning is off on ${off.length} of ${readable.length} repositories: ${listSome(off.map(r => r.name))}.`);
  if (noPush.length) return meh(`Secret scanning is on everywhere, but push protection is off on ${noPush.length}: ${listSome(noPush.map(r => r.name))}. Without it a secret is detected after it is already in history.`);
  return ok(`Secret scanning with push protection is enabled on all ${plural(readable.length, 'repository', 'repositories')}.`);
}

/* An open secret-scanning alert is a credential that is (or was)
   exposed and has not been revoked-and-closed. Any open one older than
   the triage window fails; newer ones are a review. */
export function secretAlertsCheck(alerts, windowDays, today) {
  if (!Array.isArray(alerts)) return unknown('Secret scanning alerts are not readable — grant Secret scanning alerts: read, or secret scanning may not be enabled.');
  if (!alerts.length) return ok('No open secret scanning alerts.');
  const old = alerts.filter(a => { const d = daysBetween(a.createdIso, today); return d !== null && d > windowDays; });
  const repos = [...new Set(alerts.map(a => a.repo))];
  if (old.length) return bad(`${plural(old.length, 'leaked secret')} open longer than ${windowDays} days (of ${alerts.length} open, across ${listSome(repos)}). Revoke the credential first, then close the alert.`);
  return meh(`${plural(alerts.length, 'open secret alert')} inside the ${windowDays}-day window, across ${listSome(repos)}.`);
}

/* A.8.8 / A.8.28 — known-vulnerable dependencies are fixed inside the
   tenant's own window. Critical overdue fails; high overdue reviews. */
export function dependabotCheck(alerts, windowDays, today) {
  if (!Array.isArray(alerts)) return unknown('Dependabot alerts are not readable — grant Dependabot alerts: read, or Dependabot alerts may not be enabled for the organisation.');
  const sev = (a) => String(a.severity || '').toLowerCase();
  const overdue = (a) => { const d = daysBetween(a.createdIso, today); return d !== null && d > windowDays; };
  const crit = alerts.filter(a => sev(a) === 'critical');
  const high = alerts.filter(a => sev(a) === 'high');
  const critOld = crit.filter(overdue), highOld = high.filter(overdue);
  if (!crit.length && !high.length) return ok('No open critical or high Dependabot alerts.');
  const repos = [...new Set(critOld.concat(highOld).map(a => a.repo))];
  if (critOld.length) return bad(`${plural(critOld.length, 'critical dependency vulnerability', 'critical dependency vulnerabilities')} open longer than ${windowDays} days${highOld.length ? `, plus ${highOld.length} high` : ''}, in ${listSome(repos)}.`);
  if (highOld.length) return meh(`${plural(highOld.length, 'high-severity dependency vulnerability', 'high-severity dependency vulnerabilities')} open longer than ${windowDays} days, in ${listSome(repos)}.`);
  return ok(`${crit.length + high.length} open critical/high Dependabot alert(s), all inside the ${windowDays}-day window.`);
}

/* A.8.28 / A.8.29 — static analysis runs, recently, on every repository;
   and its critical/high findings are not left open past the window.
   hasRecentAnalysis is null where the analyses endpoint was not
   readable for that repository, which abstains rather than failing. */
export function codeScanningCheck(repos, alerts, windowDays, today) {
  if (!Array.isArray(repos)) return unknown('Could not list repositories.');
  const list = inScope(repos);
  if (!list.length) return unknown('No active repositories in scope.');
  const readable = list.filter(r => typeof r.hasRecentAnalysis === 'boolean');
  if (!readable.length) return unknown('Code scanning analyses are not readable — grant Code scanning alerts: read.');
  const missing = readable.filter(r => !r.hasRecentAnalysis);
  const overdue = Array.isArray(alerts)
    ? alerts.filter(a => ['critical', 'high'].includes(String(a.severity || '').toLowerCase()))
        .filter(a => { const d = daysBetween(a.createdIso, today); return d !== null && d > windowDays; })
    : [];
  if (missing.length === readable.length) return bad(`None of ${plural(readable.length, 'repository', 'repositories')} has a code scanning analysis in the last 30 days.`);
  if (overdue.length) return bad(`${plural(overdue.length, 'critical/high code scanning finding')} open longer than ${windowDays} days, in ${listSome([...new Set(overdue.map(a => a.repo))])}.`);
  if (missing.length) return meh(`${missing.length} of ${readable.length} repositories have no code scanning analysis in the last 30 days: ${listSome(missing.map(r => r.name))}.`);
  return ok(`Code scanning ran in the last 30 days on all ${plural(readable.length, 'repository', 'repositories')}, with no critical/high finding open past ${windowDays} days.`);
}

/* A.8.4 / A.8.5 — access to source code needs a second factor. GitHub
   only returns two_factor_requirement_enabled to an organisation owner
   or an app with Organisation administration: read; null abstains. */
export function orgTwoFactorCheck(org) {
  if (!org || typeof org.twoFactorRequirementEnabled !== 'boolean') return unknown('The organisation\'s two-factor requirement is not visible — grant the collector\'s GitHub App Organization administration: read.');
  return org.twoFactorRequirementEnabled
    ? ok(`The ${org.login ? org.login + ' ' : ''}organisation requires two-factor authentication for every member.`)
    : bad('The organisation does not require two-factor authentication — a phished password is enough to push code.');
}

/* Whole-organisation roll-up, in the same {results, notes} shape every
   other collector writes into a Scans row. */
export function buildGithubResults(input, opts) {
  const today = (opts && opts.today) || new Date().toISOString().slice(0, 10);
  const vulnWindow = (opts && opts.vulnWindowDays) || 30;
  const secretWindow = (opts && opts.secretWindowDays) || 7;
  const out = { results: {}, notes: {} };
  const put = (id, v) => { out.results[id] = v.result; out.notes[id] = v.note; };
  put('gh-branch-review', branchReviewCheck(input.repos));
  put('gh-status-checks', statusChecksCheck(input.repos));
  put('gh-secret-scanning', secretScanningCheck(input.repos));
  put('gh-secret-alerts', secretAlertsCheck(input.secretAlerts, secretWindow, today));
  put('gh-dependabot', dependabotCheck(input.dependabotAlerts, vulnWindow, today));
  put('gh-code-scanning', codeScanningCheck(input.repos, input.codeScanningAlerts, vulnWindow, today));
  put('gh-org-2fa', orgTwoFactorCheck(input.org));
  return out;
}
