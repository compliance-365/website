/* Checkpoint — owner reminders for the scheduled monitor.
 * A copy of ownerWorkItems / matchOwnerToUser / ownerDigestHtml from
 * public/checkpoint/lib.js: the Function and the browser bundle share no
 * module, so test/owner-reminders.test.mjs runs both on the same data
 * and fails if they ever differ. Change one, change the other.
 */
  /* ============================================================
     Owner reminders
     ------------------------------------------------------------
     What each named owner has due, so "do what you document" does not
     depend on anyone opening Checkpoint. Pure: the browser app and the
     scheduled Azure Function (azure/lib/ownerDigest.js, kept identical
     and tested against this one) both build the same lists.
     d = { actions:[{id,title,owner,ownerEmail,due,status}],
           calendar:[{id,title,owner,nextDue,status}],
           docs:[{name,owner,nextReview,status}],
           objectives:[{id,title,owner,status}],
           evidence:[{control,title,owner,email,requested}] }
     Returns [{ owner, email, items:[{ kind, ref, title, due, overdue }] }],
     owners with something overdue first. Nothing due → not listed. */
  function ownerWorkItems(d, today, horizonDays) {
    d = d || {};
    var h = horizonDays == null ? 14 : horizonDays;
    var limit = (function () { var x = new Date(String(today).slice(0, 10) + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + h); return x.toISOString().slice(0, 10); })();
    var docLimit = (function () { var x = new Date(String(today).slice(0, 10) + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + 30); return x.toISOString().slice(0, 10); })();
    var by = {}, order = [];
    function add(owner, email, item) {
      var name = String(owner || '').trim();
      if (!name || /^unassigned$/i.test(name)) return;
      var k = name.toLowerCase();
      if (!by[k]) { by[k] = { owner: name, email: '', items: [] }; order.push(k); }
      if (email && !by[k].email) by[k].email = String(email).trim();
      by[k].items.push(item);
    }
    var closed = { Done: 1, Closed: 1, Cancelled: 1 };
    (d.actions || []).forEach(function (a) {
      if (!a || closed[a.status] || !a.due || a.due > limit) return;
      add(a.owner, a.ownerEmail, { kind: 'Action', ref: a.id || '', title: a.title || '', due: a.due, overdue: a.due < today });
    });
    (d.calendar || []).forEach(function (c) {
      if (!c || c.status === 'Retired' || c.status === 'Done' || !c.nextDue || c.nextDue > limit) return;
      add(c.owner, '', { kind: 'Activity', ref: c.id || '', title: c.title || '', due: c.nextDue, overdue: c.nextDue < today });
    });
    (d.docs || []).forEach(function (x) {
      if (!x || x.status !== 'Approved' || !x.nextReview || x.nextReview > docLimit) return;
      add(x.owner, '', { kind: 'Document review', ref: '', title: String(x.name || '').replace(/\.html$/i, ''), due: x.nextReview, overdue: x.nextReview < today });
    });
    (d.objectives || []).forEach(function (o) {
      if (!o || (o.status !== 'At risk' && o.status !== 'Missed')) return;
      add(o.owner, '', { kind: 'Objective ' + String(o.status).toLowerCase(), ref: o.id || '', title: o.title || '', due: '', overdue: o.status === 'Missed' });
    });
    (d.evidence || []).forEach(function (e) {
      if (!e) return;
      add(e.owner, e.email, { kind: 'Evidence requested', ref: e.control || '', title: e.title || '', due: e.requested || '', overdue: false });
    });
    return order.map(function (k) {
      var o = by[k];
      o.items.sort(function (a, b) { return (b.overdue ? 1 : 0) - (a.overdue ? 1 : 0) || String(a.due || '9999').localeCompare(String(b.due || '9999')); });
      return o;
    }).sort(function (a, b) {
      var ao = a.items.filter(function (i) { return i.overdue; }).length, bo = b.items.filter(function (i) { return i.overdue; }).length;
      return bo - ao || a.owner.localeCompare(b.owner);
    });
  }
  /* Matches an owner as written in a register (a name, an email or a
     UPN) to a directory user. Exact matches only, case-insensitive:
     a near-miss sends someone else's list to the wrong person. */
  function matchOwnerToUser(owner, users) {
    var o = String(owner || '').trim().toLowerCase();
    if (!o) return null;
    var hits = (users || []).filter(function (u) {
      return u && [u.displayName, u.mail, u.userPrincipalName, u.upn, u.name].some(function (v) { return v && String(v).trim().toLowerCase() === o; });
    });
    return hits.length === 1 ? hits[0] : null;
  }
  function ownerDigestHtml(entry, clientLabel, appUrl) {
    var e = function (v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
    var od = entry.items.filter(function (i) { return i.overdue; }).length;
    return '<div style="font-family:Arial,sans-serif;color:#222;max-width:600px">' +
      '<h2 style="margin-bottom:4px">Your security tasks — ' + e(clientLabel) + '</h2>' +
      '<p style="color:#666;font-size:13px;margin-top:0">Hi ' + e(entry.owner) + ', here is what is assigned to you in the information security management system' + (od ? ', including ' + od + ' overdue' : '') + '.</p>' +
      '<table style="width:100%;border-collapse:collapse;font-size:13px">' +
      entry.items.map(function (i) {
        return '<tr><td style="padding:6px;border-bottom:1px solid #eee;white-space:nowrap;color:#666">' + e(i.kind) + '</td><td style="padding:6px;border-bottom:1px solid #eee">' + (i.ref ? '<b>' + e(i.ref) + '</b> ' : '') + e(i.title) + '</td>' +
          '<td style="padding:6px;border-bottom:1px solid #eee;white-space:nowrap;' + (i.overdue ? 'color:#b00020;font-weight:bold' : '') + '">' + (i.due ? (i.overdue ? 'Overdue: ' : (i.kind === 'Evidence requested' ? 'Requested ' : 'Due ')) + e(i.due) : '') + '</td></tr>';
      }).join('') + '</table>' +
      (appUrl ? '<p style="margin-top:16px"><a href="' + e(appUrl) + '">Open Checkpoint</a> to complete them and attach evidence.</p>' : '') +
      '<p style="color:#999;font-size:11px;margin-top:24px">Sent from Checkpoint by Compliance365. You receive this because you are named as an owner.</p></div>';
  }


module.exports = { ownerWorkItems: ownerWorkItems, matchOwnerToUser: matchOwnerToUser, ownerDigestHtml: ownerDigestHtml };
