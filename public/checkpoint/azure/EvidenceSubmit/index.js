/* Checkpoint — owner-driven evidence submission.
 *
 * Runs entirely inside the CLIENT tenant, in the SAME Function App as
 * PostureMonitor, sharing its app-only Graph credential and Sites.Selected
 * write access — see ../README.md. This is the other half of the
 * "owner-driven evidence" link PostureMonitor's runGovernanceSweep()
 * emails to an overdue action's OwnerEmail: a scoped, no-sign-in web
 * form for exactly ONE action.
 *
 * There is no MSAL sign-in and no Graph scope consent here at all — the
 * caller is whoever holds the emailed link, not a directory-known user.
 * The per-action HMAC token (azure/lib/evidenceToken.js) is therefore the
 * ENTIRE authorisation boundary: it names one action item id and an
 * expiry, signed with a secret only this Function App holds
 * (EVIDENCE_LINK_SECRET), and every request must present a valid one.
 * `authLevel: anonymous` in function.json is deliberate, not an
 * oversight — see evidenceToken.js's own header comment for why a
 * second, static Function key wouldn't add real protection beyond what
 * the token already provides, and would be one more secret travelling in
 * every emailed link.
 *
 * GET  /api/evidence?token=...                    -> preview one action
 * POST /api/evidence?token=...  { note, evidenceUrl, status }  -> record it
 *
 * A submission writes exactly like a practitioner's own "Complete
 * action" / progress-note flow in the browser app (recordActionUpdate()
 * in app.js): an append-only ActionUpdates row, plus the Action's own
 * Status/EvidenceUrl fields patched to match. The Author field and the
 * email's own "no sign-in" framing keep this provenance visible in the
 * audit trail — this was never meant to look indistinguishable from a
 * practitioner-authored update. Deliberately narrower than the browser
 * app's own action editing: an owner can report progress ('In progress')
 * or completion ('Done') with a note and an optional evidence link, and
 * nothing else — never reopen ('Open'), never cancel a finding
 * ('Cancelled'), never touch title/owner/priority/due date/control. The
 * practitioner who put this owner's email on the action already
 * authorised them to report on THIS action; nothing here can touch any
 * other row.
 */

const { getAppToken, graphClient, resolveSiteId, resolveOptionalLists } = require('../lib/graph');
const { verifyEvidenceToken } = require('../lib/evidenceToken');

const ALLOWED_STATUSES = ['In progress', 'Done'];
const MAX_NOTE_LENGTH = 4000;

/* Same "must start with http(s)" rule app.js's isSafeUrl() enforces on
   every evidence link field in the browser app — this is the one field
   here that could otherwise carry a javascript: URI or similar into a
   register another practitioner later clicks from inside Checkpoint. */
function isSafeUrl(u) {
  return /^https?:\/\//i.test(String(u || '').trim());
}

function json(status, body) {
  return { status, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

/* Validates the POST body's shape without touching Graph — split out so
   it can be unit tested without a mocked network at all. Returns
   { ok:true, note, evidenceUrl, status } or { ok:false, error }. */
function validateSubmission(body) {
  body = body || {};
  var status = body.status;
  if (ALLOWED_STATUSES.indexOf(status) === -1) {
    return { ok: false, error: 'status must be one of: ' + ALLOWED_STATUSES.join(', ') };
  }
  var note = typeof body.note === 'string' ? body.note.trim() : '';
  if (note.length > MAX_NOTE_LENGTH) {
    return { ok: false, error: 'note is too long (max ' + MAX_NOTE_LENGTH + ' characters)' };
  }
  var evidenceUrl = typeof body.evidenceUrl === 'string' ? body.evidenceUrl.trim() : '';
  if (evidenceUrl && !isSafeUrl(evidenceUrl)) {
    return { ok: false, error: 'evidenceUrl must start with http:// or https://' };
  }
  if (!note && !evidenceUrl) {
    return { ok: false, error: 'record at least a note or an evidence link' };
  }
  return { ok: true, note: note, evidenceUrl: evidenceUrl, status: status };
}

/* Short, collision-resistant id for the ActionUpdates row — distinct
   namespace from the browser app's own 'UPD-0001'-style sequence
   (nextActionUpdateSeq() in app.js), which this Function has no cheap
   way to compute (it would mean reading the whole ActionUpdates list on
   every submission just to find the next number) and no need to share:
   the two only need to never collide with each other, not to interleave
   into one visible sequence. */
function newUpdateId() {
  return 'UPD-EV-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}

module.exports = async function (context, req) {
  const token = (req.query && req.query.token) || (req.body && req.body.token);
  const secret = process.env.EVIDENCE_LINK_SECRET;
  const verified = verifyEvidenceToken(token, secret);
  if (!verified.valid) {
    context.res = json(403, { ok: false, error: 'This link is invalid or has expired (' + verified.reason + ').' });
    return;
  }

  let g, siteId, lists;
  try {
    const appToken = await getAppToken();
    ({ g } = graphClient(appToken));
    siteId = await resolveSiteId(g);
    lists = await resolveOptionalLists(g, siteId);
  } catch (e) {
    context.log.error('Checkpoint evidence link: could not connect to this tenant: ' + (e && e.message ? e.message : e));
    context.res = json(503, { ok: false, error: 'Could not reach this tenant right now — try the link again shortly.' });
    return;
  }

  if (!lists.Actions || !lists.ActionUpdates) {
    context.res = json(503, { ok: false, error: 'This tenant\'s Checkpoint action register is not set up for evidence links yet.' });
    return;
  }

  let item;
  try {
    item = await g(`/sites/${siteId}/lists/${lists.Actions}/items/${encodeURIComponent(verified.actionItemId)}?$expand=fields`);
  } catch (e) {
    context.res = json(404, { ok: false, error: 'This action no longer exists.' });
    return;
  }
  const f = item.fields || {};

  if (req.method === 'GET') {
    context.res = json(200, {
      ok: true,
      ref: f.RefId || '', title: f.Title || '', due: f.DueDate || '',
      priority: f.Priority || '', control: f.Control || '', status: f.Status || '',
      owner: f.Owner || ''
    });
    return;
  }

  // POST
  const validated = validateSubmission(req.body);
  if (!validated.ok) {
    context.res = json(400, { ok: false, error: validated.error });
    return;
  }
  const today = new Date().toISOString().slice(0, 10);
  const author = (f.Owner ? f.Owner + ' ' : '') + '(submitted via evidence link, no Checkpoint sign-in)';
  const updateId = newUpdateId();
  try {
    await g(`/sites/${siteId}/lists/${lists.ActionUpdates}/items`, {
      method: 'POST',
      body: { fields: {
        Title: updateId, RefId: updateId, ActionRef: f.RefId || '', UpdateDate: today,
        Note: validated.note, EvidenceUrl: validated.evidenceUrl, Status: validated.status, Author: author
      } }
    });
    const patch = { Status: validated.status };
    if (validated.evidenceUrl) patch.EvidenceUrl = validated.evidenceUrl;
    await g(`/sites/${siteId}/lists/${lists.Actions}/items/${encodeURIComponent(verified.actionItemId)}/fields`, {
      method: 'PATCH', body: patch
    });
  } catch (e) {
    context.log.error('Checkpoint evidence link: write failed: ' + (e && e.message ? e.message : e));
    context.res = json(502, { ok: false, error: 'Could not record this update right now — try again shortly.' });
    return;
  }

  context.log(`Checkpoint evidence link: recorded a ${validated.status} update on ${f.RefId || verified.actionItemId} (owner-submitted, no sign-in).`);
  context.res = json(200, { ok: true });
};

module.exports.__test = { validateSubmission, isSafeUrl, newUpdateId, ALLOWED_STATUSES, MAX_NOTE_LENGTH };
