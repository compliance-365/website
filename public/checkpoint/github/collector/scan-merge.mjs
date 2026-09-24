/* Checkpoint — GitHub collector, SharePoint write side.
 *
 * Mirrors aws/collector/scan-merge.mjs rather than importing it: each
 * collector deploys on its own (this one into a GitHub Actions runner,
 * that one into a Lambda), and a shared file across the two folders
 * would break "copy collector/ and run it". The merge contract is the
 * same and test/github-collector.test.mjs pins it the same way.
 *
 * MERGE, DO NOT REPLACE: today's scan row may already hold Microsoft
 * and AWS results. Writing a GitHub-only row would blank them.
 */
import { GITHUB_CHECK_LABELS } from './checks.mjs';

/* Same union score as lib.js's score(): 'manual' leaves the
   denominator, pass=1, review=0.5, fail=0, floored at 5. */
export function scoreOf(results) {
  const vals = Object.values(results || {}).filter(v => v !== 'manual');
  if (!vals.length) return 100;
  const pts = vals.reduce((s, v) => s + (v === 'pass' ? 1 : v === 'review' ? 0.5 : 0), 0);
  return Math.max(5, Math.round(pts / vals.length * 100));
}

/* Appends a source tag once — re-running the collector on the same day
   must not grow "browser+github+github+…". */
export function withSource(prior, tag) {
  if (!prior) return tag + '-collector';
  return prior.split('+').includes(tag) ? prior : prior + '+' + tag;
}

export async function mergeIntoScan(g, siteId, scansListId, ghOut, today) {
  const existing = await g(`/sites/${siteId}/lists/${scansListId}/items?$expand=fields&$top=999`);
  const rows = (existing.value || []).filter(i => (i.fields || {}).ScanDate === today);
  const row = rows[rows.length - 1];

  let results = {}, notes = {}, source = 'github-collector';
  if (row && row.fields.Detail) {
    try {
      const prior = JSON.parse(row.fields.Detail);
      results = prior.results || {};
      notes = prior.notes || {};
      source = withSource(prior.source, 'github');
    } catch (e) { /* malformed prior detail — keep this run's findings rather than discarding them */ }
  }
  Object.assign(results, ghOut.results);
  Object.assign(notes, ghOut.notes);
  const score = scoreOf(results);
  const fields = { Title: 'Scan ' + today, ScanDate: today, Score: score, Detail: JSON.stringify({ results, notes, source }) };

  if (row) {
    await g(`/sites/${siteId}/lists/${scansListId}/items/${row.id}`, { method: 'PATCH', body: { fields } });
    return { merged: true, score };
  }
  await g(`/sites/${siteId}/lists/${scansListId}/items`, { method: 'POST', body: { fields } });
  return { merged: false, score };
}

/* Pass -> fail since the most recent prior scan raises one alert per
   check, deduplicated against unacknowledged alerts — the same contract
   the Azure monitor and the AWS collector use. */
export async function raiseGithubDrift(g, siteId, scansListId, alertsListId, ghOut, today, log) {
  if (!alertsListId) return 0;
  const all = await g(`/sites/${siteId}/lists/${scansListId}/items?$expand=fields&$top=999`);
  const prior = (all.value || [])
    .filter(i => (i.fields || {}).ScanDate && i.fields.ScanDate < today)
    .sort((a, b) => a.fields.ScanDate.localeCompare(b.fields.ScanDate));
  const last = prior[prior.length - 1];
  if (!last || !last.fields.Detail) return 0;
  let prev = {};
  try { prev = JSON.parse(last.fields.Detail).results || {}; } catch (e) { return 0; }

  const openItems = await g(`/sites/${siteId}/lists/${alertsListId}/items?$expand=fields&$top=999`);
  const open = new Set((openItems.value || []).filter(i => (i.fields || {}).CheckId && !i.fields.Acknowledged).map(i => i.fields.CheckId));

  let raised = 0;
  for (const [id, verdict] of Object.entries(ghOut.results)) {
    if (prev[id] !== 'pass' || verdict !== 'fail' || open.has(id)) continue;
    await g(`/sites/${siteId}/lists/${alertsListId}/items`, {
      method: 'POST',
      body: { fields: {
        Title: 'Drift: ' + (GITHUB_CHECK_LABELS[id] || id), CheckId: id,
        CheckLabel: GITHUB_CHECK_LABELS[id] || id, PreviousStatus: 'pass', NewStatus: 'fail',
        Note: ghOut.notes[id] || '', DetectedDate: today, Acknowledged: false
      } }
    });
    raised++;
    log(`Checkpoint GitHub collector: drift on ${id}`);
  }
  return raised;
}
