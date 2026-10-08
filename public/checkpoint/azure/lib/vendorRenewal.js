/* Checkpoint — supplier certificate renewal through the supplier's own
 * no-sign-in link. A copy of vendorRenewalState / validateVendorRenewal /
 * vendorRenewalNote from public/checkpoint/lib.js (the Function and the
 * browser share no module); test/supplier-assurance.test.mjs fails if
 * they differ. Change one, change the other.
 *
 * Everything is recorded as dated marker lines in the vendor's Notes:
 *   [renewal-requested 2026-10-08]
 *   [renewal-submitted 2026-10-12] valid until 2027-10-01; ISO 27001; report https://...; note
 * A submission is the supplier's claim, never applied by itself: the
 * practitioner accepts it in Checkpoint, which then sets the expiry.
 */
  function vendorRenewalState(notes, today) {
    var text = String(notes || '');
    var last = function (re) { var m, out = null; re.lastIndex = 0; while ((m = re.exec(text))) out = m; return out; };
    var req = last(/\[renewal-requested (\d{4}-\d{2}-\d{2})\]/g);
    var sub = last(/\[renewal-submitted (\d{4}-\d{2}-\d{2})\] valid until (\d{4}-\d{2}-\d{2})(?:; ([^;\n]*))?(?:; report (https:\/\/[^\s;]+))?(?:; ([^\n]*))?/g);
    var acc = last(/\[renewal-accepted (\d{4}-\d{2}-\d{2})\]/g);
    var requested = req ? req[1] : '', submitted = sub ? sub[1] : '', accepted = acc ? acc[1] : '';
    var pending = !!submitted && (!accepted || accepted < submitted);
    var recent = function (d) { return d && today && (Date.parse(today) - Date.parse(d)) / 86400000 < 30; };
    return {
      requested: requested, submitted: submitted, accepted: accepted, pending: pending,
      submission: pending ? { validUntil: sub[2], certifications: (sub[3] || '').trim(), reportUrl: sub[4] || '', note: (sub[5] || '').trim() } : null,
      canRequest: !pending && !recent(requested)
    };
  }
  function validateVendorRenewal(body, today) {
    var r = (body || {}).renewal;
    if (!r || typeof r !== 'object' || Array.isArray(r)) return { ok: false, error: 'renewal must be an object' };
    var d = String(r.validUntil || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || isNaN(Date.parse(d))) return { ok: false, error: 'Give the date the new certificate or report is valid until.' };
    var days = (Date.parse(d) - Date.parse(today)) / 86400000;
    if (days <= 0) return { ok: false, error: 'That date has already passed.' };
    if (days > 5 * 366) return { ok: false, error: 'That date is more than five years away.' };
    var url = String(r.reportUrl || '').trim();
    if (url && (!/^https:\/\/[^\s;]+$/i.test(url) || url.length > 500)) return { ok: false, error: 'The link must start with https:// and contain no spaces.' };
    var clean = function (v, n) { return String(v || '').replace(/[\r\n;\[\]]+/g, ' ').trim().slice(0, n); };
    return { ok: true, renewal: { validUntil: d, certifications: clean(r.certifications, 200), reportUrl: url, note: clean(r.note, 300) } };
  }
  function vendorRenewalNote(r, today) {
    return '[renewal-submitted ' + today + '] valid until ' + r.validUntil + '; ' + (r.certifications || '') + (r.reportUrl ? '; report ' + r.reportUrl : '') + (r.note ? '; ' + r.note : '');
  }

module.exports = { vendorRenewalState: vendorRenewalState, validateVendorRenewal: validateVendorRenewal, vendorRenewalNote: vendorRenewalNote };
