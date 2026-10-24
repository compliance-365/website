/* Checkpoint — GitHub secure development collector.
 *
 * Runs entirely inside the CLIENT's own GitHub organisation (a scheduled
 * GitHub Actions workflow, authenticated as the client's own read-only
 * GitHub App) and writes its findings into the CLIENT's own SharePoint.
 * Compliance365 operates no part of this and holds no credentials for
 * it — the same arrangement as the AWS collector and the Azure
 * PostureMonitor.
 *
 * Every GitHub call below is a GET. The collector cannot change a
 * setting, dismiss an alert or touch code. See ../README.md for the
 * exact GitHub App permissions and why each one is needed.
 *
 * Usage (see ../checkpoint-github-collector.yml):
 *   node collector/index.mjs            collect, then merge into SharePoint
 *   DRY_RUN=1 node collector/index.mjs  collect and print, write nothing
 */
import { pathToFileURL } from 'node:url';
import { buildGithubResults } from './checks.mjs';
import { mergeIntoScan, raiseGithubDrift } from './scan-merge.mjs';

const GITHUB = 'https://api.github.com';
const GRAPH = 'https://graph.microsoft.com/v1.0';
const MAX_PAGES = 20;

/* ---------- GitHub (read side) ------------------------------------ */

export function githubClient(token, fetchImpl = fetch) {
  async function req(path) {
    const res = await fetchImpl(path.startsWith('http') ? path : GITHUB + path, {
      headers: {
        Authorization: 'Bearer ' + token,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'checkpoint-github-collector'
      }
    });
    let body = null;
    try { body = await res.json(); } catch (e) { /* empty or non-JSON body */ }
    return { status: res.status, body, link: (res.headers && res.headers.get && res.headers.get('link')) || '' };
  }
  /* Follows rel="next" up to MAX_PAGES. Returns null (not []) when the
     first page is not readable, so a missing permission reaches the
     checks as "unknown" rather than as "nothing open". */
  async function all(path) {
    let url = path, out = [], pages = 0;
    while (url && pages < MAX_PAGES) {
      const r = await req(url);
      if (r.status !== 200) return pages === 0 ? null : out;
      out = out.concat(Array.isArray(r.body) ? r.body : []);
      const m = /<([^>]+)>;\s*rel="next"/.exec(r.link);
      url = m ? m[1] : null;
      pages++;
    }
    return out;
  }
  return { req, all };
}

const enc = encodeURIComponent;

/* Classic branch protection and repository rulesets are two separate
   systems; either can require reviews and status checks. A 404 from the
   protection endpoint means "not protected" (readable, zero); a 403
   means "not allowed to look", which must stay unknown. */
async function readProtection(gh, org, repo, branch) {
  const rules = await gh.req(`/repos/${enc(org)}/${enc(repo)}/rules/branches/${enc(branch)}`);
  let rReviews = null, rChecks = null;
  if (rules.status === 200 && Array.isArray(rules.body)) {
    rReviews = 0; rChecks = 0;
    for (const rule of rules.body) {
      if (rule.type === 'pull_request') rReviews = Math.max(rReviews, Number((rule.parameters || {}).required_approving_review_count) || 0);
      if (rule.type === 'required_status_checks') rChecks = Math.max(rChecks, ((rule.parameters || {}).required_status_checks || []).length);
    }
  }
  const prot = await gh.req(`/repos/${enc(org)}/${enc(repo)}/branches/${enc(branch)}/protection`);
  let cReviews = null, cChecks = null;
  if (prot.status === 200 && prot.body) {
    const pr = prot.body.required_pull_request_reviews;
    cReviews = pr ? Number(pr.required_approving_review_count) || 0 : 0;
    const sc = prot.body.required_status_checks;
    cChecks = sc ? Math.max((sc.checks || []).length, (sc.contexts || []).length) : 0;
  } else if (prot.status === 404) {
    cReviews = 0; cChecks = 0;
  }
  /* A positive answer from either source is conclusive. A zero is only
     conclusive when BOTH sources were readable. */
  const combine = (a, b) => {
    if ((a || 0) > 0 || (b || 0) > 0) return Math.max(a || 0, b || 0);
    return (a === null || b === null) ? null : 0;
  };
  return { requiredReviews: combine(rReviews, cReviews), requiredStatusChecks: combine(rChecks, cChecks) };
}

async function readRecentAnalysis(gh, org, repo, today) {
  const r = await gh.req(`/repos/${enc(org)}/${enc(repo)}/code-scanning/analyses?per_page=1`);
  if (r.status === 200) {
    const latest = Array.isArray(r.body) && r.body[0];
    if (!latest) return false;
    const age = (Date.parse(today + 'T00:00:00Z') - Date.parse(latest.created_at)) / 86400000;
    return !Number.isNaN(age) && age <= 30;
  }
  /* 404 = no analysis ever uploaded; a 403 whose message says code
     scanning / Advanced Security is not enabled is the same answer.
     Any other 403 is a permission gap and abstains. */
  if (r.status === 404) return false;
  const msg = String((r.body && r.body.message) || '');
  if (r.status === 403 && /advanced security|not enabled/i.test(msg)) return false;
  return null;
}

export async function collectGithub(gh, org, opts = {}) {
  const today = opts.today || new Date().toISOString().slice(0, 10);
  const log = opts.log || (() => {});
  const out = {};

  const orgRes = await gh.req(`/orgs/${enc(org)}`);
  out.org = orgRes.status === 200
    ? { login: orgRes.body.login, twoFactorRequirementEnabled: typeof orgRes.body.two_factor_requirement_enabled === 'boolean' ? orgRes.body.two_factor_requirement_enabled : null }
    : null;

  const allRepos = await gh.all(`/orgs/${enc(org)}/repos?type=all&per_page=100`);
  if (!allRepos) { log('Checkpoint GitHub collector: repositories not readable'); out.repos = null; }
  else {
    const allow = (opts.repos || []).map(s => s.toLowerCase());
    let picked = allRepos.filter(r => !r.archived && (opts.includeForks || !r.fork));
    if (allow.length) picked = picked.filter(r => allow.includes(String(r.name).toLowerCase()));
    picked = picked.slice(0, opts.maxRepos || 200);
    out.repos = [];
    for (const r of picked) {
      const sa = r.security_and_analysis || null;
      const repo = {
        name: r.name, archived: !!r.archived, fork: !!r.fork, visibility: r.visibility, defaultBranch: r.default_branch,
        secretScanning: sa && sa.secret_scanning ? sa.secret_scanning.status : null,
        pushProtection: sa && sa.secret_scanning_push_protection ? sa.secret_scanning_push_protection.status : null
      };
      repo.protection = r.default_branch ? await readProtection(gh, org, r.name, r.default_branch) : { requiredReviews: null, requiredStatusChecks: null };
      repo.hasRecentAnalysis = await readRecentAnalysis(gh, org, r.name, today);
      out.repos.push(repo);
    }
  }
  const scope = out.repos ? new Set(out.repos.map(r => r.name)) : null;
  const inScope = (a) => !scope || scope.has(a.repo);

  const dep = await gh.all(`/orgs/${enc(org)}/dependabot/alerts?state=open&severity=critical,high&per_page=100`);
  out.dependabotAlerts = dep && dep.map(a => ({
    repo: a.repository && a.repository.name, createdIso: a.created_at,
    severity: (a.security_advisory && a.security_advisory.severity) || (a.security_vulnerability && a.security_vulnerability.severity),
    id: a.security_advisory && a.security_advisory.ghsa_id
  })).filter(inScope);

  const cs = await gh.all(`/orgs/${enc(org)}/code-scanning/alerts?state=open&per_page=100`);
  out.codeScanningAlerts = cs && cs.map(a => ({
    repo: a.repository && a.repository.name, createdIso: a.created_at,
    severity: a.rule && (a.rule.security_severity_level || a.rule.severity), rule: a.rule && a.rule.id
  })).filter(inScope);

  if (opts.changeSample !== false && out.repos) out.changeSample = await collectChangeSample(gh, org, out.repos, { today, days: opts.sampleDays || 90, size: opts.sampleSize || 25, log });

  const ss = await gh.all(`/orgs/${enc(org)}/secret-scanning/alerts?state=open&per_page=100`);
  out.secretAlerts = ss && ss.map(a => ({ repo: a.repository && a.repository.name, createdIso: a.created_at, type: a.secret_type_display_name || a.secret_type })).filter(inScope);

  return out;
}

/* ---------- A.8.32 change sample ----------------------------------
   The sample an auditor draws for change management: pull requests
   merged into each in-scope default branch in the last `days`, a
   reproducible random sample of `size` (or all, if fewer), and for each
   one who approved it, whether its checks passed and what request it
   traces to. Reads only. */
export function sampleSeed(str) {
  let h = 2166136261;
  for (const c of String(str)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  return () => { h = (Math.imul(h ^ (h >>> 15), 2246822507) + 0x6d2b79f5) >>> 0; return h / 4294967296; };
}
export function drawSample(population, size, seed) {
  const rnd = sampleSeed(seed);
  const list = population.slice().sort((a, b) => (a.repo + '#' + a.n).localeCompare(b.repo + '#' + b.n));
  for (let i = list.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [list[i], list[j]] = [list[j], list[i]]; }
  return list.slice(0, size);
}
/* A Jira-style key (ABC-123), a GitHub issue reference, or a link to a
   ticketing system, from the title, branch name or description. */
export function ticketRef(text) {
  const t = String(text || '');
  /* Standards and algorithms look like ticket keys; skip them. */
  const jira = [...t.matchAll(/\b([A-Z][A-Z0-9]{1,9}-\d{1,6})\b/g)].map(m => m[1]).find(k => !/^(SHA|UTF|ISO|IEC|AES|RSA|RFC|CVE|CWE|TLS|SSL|HTTP|ES|PEP|GHSA|X)-/.test(k));
  if (jira) return jira;
  const closes = /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?|refs?)\s+((?:[\w.-]+\/[\w.-]+)?#\d+)/i.exec(t);
  if (closes) return closes[1];
  const url = /https?:\/\/[^\s)]*(?:atlassian\.net\/browse\/[A-Z0-9]+-\d+|service-now\.com\/[^\s)]+|dev\.azure\.com\/[^\s)]+\/_workitems\/edit\/\d+|\/issues\/\d+)/i.exec(t);
  if (url) return url[0].slice(0, 120);
  const hash = /(?:^|\s)(#\d+)\b/.exec(t);
  return hash ? hash[1] : '';
}
export async function collectChangeSample(gh, org, repos, opts) {
  const since = new Date(Date.parse(opts.today + 'T00:00:00Z') - opts.days * 86400000).toISOString();
  const population = [];
  let unreadable = 0;
  for (const r of repos.filter(x => !x.archived && x.defaultBranch)) {
    let url = `/repos/${enc(org)}/${enc(r.name)}/pulls?state=closed&base=${enc(r.defaultBranch)}&sort=updated&direction=desc&per_page=100`, pages = 0;
    while (url && pages < 5) {
      const res = await gh.req(url);
      if (res.status !== 200) { if (pages === 0) unreadable++; break; }
      const prs = Array.isArray(res.body) ? res.body : [];
      prs.filter(p => p.merged_at && p.merged_at >= since).forEach(p => population.push({
        repo: r.name, n: p.number, title: String(p.title || '').slice(0, 120), author: p.user && p.user.login, mergedAt: p.merged_at,
        mergedBy: p.merged_by ? p.merged_by.login : '', head: p.head && p.head.sha, ref: ticketRef([p.title, p.head && p.head.ref, String(p.body || '').slice(0, 4000)].join('\n'))
      }));
      const oldest = prs.length ? prs[prs.length - 1].updated_at : '';
      const m = /<([^>]+)>;\s*rel="next"/.exec(res.link);
      url = m && oldest >= since ? m[1] : null;
      pages++;
    }
  }
  const picked = drawSample(population, opts.size, org + '|' + opts.today.slice(0, 7));
  const items = [];
  for (const p of picked) {
    const rv = await gh.req(`/repos/${enc(org)}/${enc(p.repo)}/pulls/${p.n}/reviews?per_page=100`);
    let approvers = null;
    if (rv.status === 200 && Array.isArray(rv.body)) {
      const last = {};
      rv.body.forEach(x => { if (x.user && x.user.login) last[x.user.login] = x.state; });
      approvers = Object.keys(last).filter(u => last[u] === 'APPROVED' && u !== p.author);
    }
    let checks = 'unknown';
    if (p.head) {
      const cr = await gh.req(`/repos/${enc(org)}/${enc(p.repo)}/commits/${p.head}/check-runs?per_page=100`);
      const st = await gh.req(`/repos/${enc(org)}/${enc(p.repo)}/commits/${p.head}/status`);
      const runs = cr.status === 200 && cr.body && Array.isArray(cr.body.check_runs) ? cr.body.check_runs : null;
      const statuses = st.status === 200 && st.body && Array.isArray(st.body.statuses) ? st.body.statuses : null;
      if (runs !== null || statuses !== null) {
        const bad = (runs || []).some(x => ['failure', 'timed_out', 'cancelled', 'action_required'].includes(x.conclusion)) || (statuses || []).some(x => x.state === 'failure' || x.state === 'error');
        checks = bad ? 'failed' : ((runs || []).length + (statuses || []).length ? 'passed' : 'none');
      }
    }
    items.push({ repo: p.repo, n: p.n, title: p.title, author: p.author, mergedAt: String(p.mergedAt).slice(0, 10), mergedBy: p.mergedBy, approvers, checks, ref: p.ref });
  }
  return { from: since.slice(0, 10), to: opts.today, days: opts.days, population: population.length, size: items.length, unreadableRepos: unreadable,
    method: 'Pull requests merged into each in-scope default branch in the ' + opts.days + ' days to ' + opts.today + '; ' + (population.length > opts.size ? 'a random sample of ' + opts.size + ', seeded by the organisation and month so it can be re-drawn' : 'all of them, as there were ' + population.length) + '.',
    items };
}

/* ---------- Microsoft Graph (write side) — same as the AWS collector */

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

export async function run(env = process.env) {
  const log = (m) => console.log(m);
  const today = new Date().toISOString().slice(0, 10);
  if (!env.GH_TOKEN || !env.GH_ORG) throw new Error('GH_TOKEN and GH_ORG are required — see public/checkpoint/github/README.md');

  const raw = await collectGithub(githubClient(env.GH_TOKEN), env.GH_ORG, {
    today, log,
    repos: (env.REPOS || '').split(',').map(s => s.trim()).filter(Boolean),
    includeForks: env.INCLUDE_FORKS === 'true',
    maxRepos: Number(env.MAX_REPOS) || 200,
    changeSample: env.CHANGE_SAMPLE !== 'false',
    sampleDays: Number(env.SAMPLE_DAYS) || 90,
    sampleSize: Number(env.SAMPLE_SIZE) || 25
  });
  const ghOut = buildGithubResults(raw, {
    today,
    vulnWindowDays: Number(env.VULN_WINDOW_DAYS) || 30,
    secretWindowDays: Number(env.SECRET_WINDOW_DAYS) || 7
  });

  if (env.DRY_RUN === '1' || env.DRY_RUN === 'true') {
    log(JSON.stringify(ghOut, null, 2));
    return { today, dryRun: true, checks: Object.keys(ghOut.results).length };
  }

  const g = graphClient(await graphToken());
  const { siteId, scansListId, alertsListId } = await resolveSiteAndLists(g);
  const { merged, score } = await mergeIntoScan(g, siteId, scansListId, ghOut, today);
  const drift = await raiseGithubDrift(g, siteId, scansListId, alertsListId, ghOut, today, log);
  const summary = { today, merged, score, drift, repos: raw.repos ? raw.repos.length : 0, checks: Object.keys(ghOut.results).length };
  log('Checkpoint GitHub collector: ' + JSON.stringify(summary));
  return summary;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run().catch((e) => { console.error(e.message); process.exit(1); });
}
