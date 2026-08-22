/* Checkpoint — AWS collector, SharePoint write side.
 *
 * Split out of index.mjs for one reason: index.mjs imports the AWS SDK,
 * which only exists inside the Lambda runtime, so nothing that imports
 * it can be unit-tested here. Everything below takes its Graph client
 * injected and touches no AWS API, which makes the merge logic — the
 * part where a bug silently blanks a day's Microsoft results rather
 * than throwing — testable without an AWS account or a tenant.
 */
import { AWS_CHECK_LABELS } from './checks.mjs';

/* The union score, computed the way lib.js's score() does: 'manual'
   is excluded from the denominator entirely, pass=1, review=0.5,
   fail=0, floored at 5 once anything at all was measured. Mirrored
   here rather than shared because this runs in a different runtime --
   same standing note as the Azure Function's own copy. */
export function scoreOf(results) {
  const vals = Object.values(results || {}).filter(v => v !== 'manual');
  if (!vals.length) return 100;
  const pts = vals.reduce((s, v) => s + (v === 'pass' ? 1 : v === 'review' ? 0.5 : 0), 0);
  return Math.max(5, Math.round(pts / vals.length * 100));
}

/* Merges this run's aws-* verdicts into today's scan row if one
   exists, otherwise creates it. Returns what it did, for the log. */
export async function mergeIntoScan(g, siteId, scansListId, awsOut, today) {
  const existing = await g(`/sites/${siteId}/lists/${scansListId}/items?$expand=fields&$top=999`);
  const rows = (existing.value || []).filter(i => (i.fields || {}).ScanDate === today);
  const row = rows[rows.length - 1];

  let results = {}, notes = {}, source = 'aws-collector';
  if (row && row.fields.Detail) {
    try {
      const prior = JSON.parse(row.fields.Detail);
      results = prior.results || {};
      notes = prior.notes || {};
      source = prior.source ? prior.source + '+aws' : 'aws-collector';
    } catch (e) { /* malformed prior detail — start from this run's own findings rather than discarding them */ }
  }
  Object.assign(results, awsOut.results);
  Object.assign(notes, awsOut.notes);
  const score = scoreOf(results);
  const fields = { Title: 'Scan ' + today, ScanDate: today, Score: score, Detail: JSON.stringify({ results, notes, source }) };

  if (row) {
    await g(`/sites/${siteId}/lists/${scansListId}/items/${row.id}`, { method: 'PATCH', body: { fields } });
    return { merged: true, score };
  }
  await g(`/sites/${siteId}/lists/${scansListId}/items`, { method: 'POST', body: { fields } });
  return { merged: false, score };
}

/* Raises a drift alert for any AWS check that passed on the most
   recent prior scan and fails now -- same contract, same list and the
   same one-alert-per-check dedup the Azure monitor already uses. */
export async function raiseAwsDrift(g, siteId, scansListId, alertsListId, awsOut, today, log) {
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
  for (const [id, verdict] of Object.entries(awsOut.results)) {
    if (prev[id] !== 'pass' || verdict !== 'fail' || open.has(id)) continue;
    await g(`/sites/${siteId}/lists/${alertsListId}/items`, {
      method: 'POST',
      body: { fields: {
        Title: 'Drift: ' + (AWS_CHECK_LABELS[id] || id), CheckId: id,
        CheckLabel: AWS_CHECK_LABELS[id] || id, PreviousStatus: 'pass', NewStatus: 'fail',
        Note: awsOut.notes[id] || '', DetectedDate: today, Acknowledged: false
      } }
    });
    raised++;
    log(`Checkpoint AWS collector: drift on ${id}`);
  }
  return raised;
}

