/* Checkpoint — vendor self-service questionnaire submission.
 *
 * Runs entirely inside the CLIENT tenant, in the SAME Function App as
 * PostureMonitor, sharing its app-only Graph credential and
 * Sites.Selected write access — see ../README.md. This is the other
 * half of the vendor questionnaire link PostureMonitor's
 * sendVendorQuestionnaireLinks() emails once a practitioner requests
 * one from the browser app: a scoped, no-sign-in web form for exactly
 * ONE vendor.
 *
 * There is no MSAL sign-in and no Graph scope consent here at all — the
 * caller is whoever holds the emailed link, not a directory-known user.
 * The per-vendor HMAC token (azure/lib/vendorToken.js) is therefore the
 * ENTIRE authorisation boundary — see that file's header for why this
 * doesn't reuse EVIDENCE_LINK_SECRET. `authLevel: anonymous` in
 * function.json is deliberate, not an oversight, same reasoning as
 * EvidenceSubmit's own header comment.
 *
 * GET  /api/vendor-questionnaire?token=...   -> preview one vendor + the question set
 * POST /api/vendor-questionnaire?token=...  { answers: {...} }  -> record it
 *
 * A submission writes exactly the same fields recordVendorQuestionnaire()
 * writes from inside the browser app: QuestionnaireAnswers (JSON),
 * QuestionnaireStatus -> 'Received', QuestionnaireReceivedDate. Nothing
 * else on the vendor record is ever touched — a vendor's own reply can
 * update their questionnaire answers and nothing about how Checkpoint's
 * client has classified or is treating them.
 */

const { getAppToken, graphClient, resolveSiteId, resolveOptionalLists } = require('../lib/graph');
const { verifyVendorToken } = require('../lib/vendorToken');
const { VENDOR_QUESTIONNAIRE } = require('../lib/vendorQuestions');

const MAX_TEXT_LENGTH = 500;
const YESNO_VALUES = ['Yes', 'No', 'Unknown'];

/* Every known question id, across all three sections, mapped to its
   type — built once, not per request. An id that isn't in here is
   rejected outright: this endpoint writes only what the questionnaire
   actually asks, never an arbitrary field a tampered request tries to
   smuggle in under the 'answers' object. */
const QUESTION_TYPES = {};
Object.keys(VENDOR_QUESTIONNAIRE).forEach(function (sectionKey) {
  VENDOR_QUESTIONNAIRE[sectionKey].questions.forEach(function (q) { QUESTION_TYPES[q.id] = q.type; });
});

function json(status, body) {
  return { status, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

/* Validates the POST body's shape without touching Graph — split out so
   it can be unit tested without a mocked network at all. Returns
   { ok:true, answers } or { ok:false, error }. Unanswered/blank
   questions are simply left out of the cleaned answers object, same as
   the browser app's own showModal-based recording form treats a
   left-blank field — there is no "required" question here; a vendor
   who skips something the practitioner can chase separately. */
function validateSubmission(body) {
  body = body || {};
  var answers = body.answers;
  if (!answers || typeof answers !== 'object' || Array.isArray(answers)) {
    return { ok: false, error: 'answers must be an object' };
  }
  var cleaned = {};
  var keys = Object.keys(answers);
  for (var i = 0; i < keys.length; i++) {
    var id = keys[i];
    var type = QUESTION_TYPES[id];
    if (!type) return { ok: false, error: 'unknown question: ' + id };
    var value = answers[id];
    if (value === undefined || value === null || value === '') continue;
    if (type === 'yesno') {
      if (YESNO_VALUES.indexOf(value) === -1) return { ok: false, error: id + ' must be Yes, No or Unknown' };
      cleaned[id] = value;
    } else {
      if (typeof value !== 'string') return { ok: false, error: id + ' must be text' };
      if (value.length > MAX_TEXT_LENGTH) return { ok: false, error: id + ' is too long (max ' + MAX_TEXT_LENGTH + ' characters)' };
      cleaned[id] = value.trim();
    }
  }
  if (!Object.keys(cleaned).length) return { ok: false, error: 'answer at least one question' };
  return { ok: true, answers: cleaned };
}

module.exports = async function (context, req) {
  const token = (req.query && req.query.token) || (req.body && req.body.token);
  const secret = process.env.VENDOR_LINK_SECRET;
  const verified = verifyVendorToken(token, secret);
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
    context.log.error('Checkpoint vendor questionnaire link: could not connect to this tenant: ' + (e && e.message ? e.message : e));
    context.res = json(503, { ok: false, error: 'Could not reach this tenant right now — try the link again shortly.' });
    return;
  }

  if (!lists.Vendors) {
    context.res = json(503, { ok: false, error: 'This tenant\'s Checkpoint vendor register is not set up for questionnaire links yet.' });
    return;
  }

  let item;
  try {
    item = await g(`/sites/${siteId}/lists/${lists.Vendors}/items/${encodeURIComponent(verified.vendorItemId)}?$expand=fields`);
  } catch (e) {
    context.res = json(404, { ok: false, error: 'This vendor record no longer exists.' });
    return;
  }
  const f = item.fields || {};

  if (req.method === 'GET') {
    context.res = json(200, {
      ok: true,
      name: f.Title || '', service: f.Service || '',
      questions: VENDOR_QUESTIONNAIRE
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
  try {
    await g(`/sites/${siteId}/lists/${lists.Vendors}/items/${encodeURIComponent(verified.vendorItemId)}/fields`, {
      method: 'PATCH',
      body: {
        QuestionnaireAnswers: JSON.stringify(validated.answers),
        QuestionnaireStatus: 'Received',
        QuestionnaireReceivedDate: today
      }
    });
  } catch (e) {
    context.log.error('Checkpoint vendor questionnaire link: write failed: ' + (e && e.message ? e.message : e));
    context.res = json(502, { ok: false, error: 'Could not record this right now — try again shortly.' });
    return;
  }

  context.log(`Checkpoint vendor questionnaire link: recorded answers for ${f.Title || verified.vendorItemId} (vendor-submitted, no sign-in).`);
  context.res = json(200, { ok: true });
};

module.exports.__test = { validateSubmission, QUESTION_TYPES, MAX_TEXT_LENGTH, YESNO_VALUES };
