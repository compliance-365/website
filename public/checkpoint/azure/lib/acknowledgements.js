/* Checkpoint — policy acknowledgement chase for the scheduled monitor.
 * attestationCampaigns / attestationsToChase / addDaysIso are copies of
 * the same functions in public/checkpoint/lib.js (the Function and the
 * browser share no module); test/backup-changes-ack.test.mjs fails if
 * they differ. Change one, change the other.
 *
 * ackChaseByPerson and ackChaseHtml are the Function's own: one email
 * per person listing every policy they still owe, not one per policy.
 */
  function addDaysIso(iso, days) {
    var d = new Date(String(iso).slice(0, 10) + 'T00:00:00Z');
    if (isNaN(d)) return '';
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  }
  function attestationCampaigns(rows) {
    var byCampaign = {};
    (rows || []).forEach(function (r) {
      var key = r.campaign || '(none)';
      var c = byCampaign[key] || (byCampaign[key] = {
        id: key, docName: r.docName || '', docVersion: r.docVersion || '', docUrl: r.docUrl || '',
        total: 0, acknowledged: 0, exempt: 0, outstanding: 0,
        launched: '', lastAcknowledged: '', outstandingRows: []
      });
      c.total++;
      if (r.status === 'Acknowledged') {
        c.acknowledged++;
        if ((r.acknowledged || '') > c.lastAcknowledged) c.lastAcknowledged = r.acknowledged || '';
      } else if (r.status === 'Exempt') {
        c.exempt++;
      } else {
        c.outstanding++;
        c.outstandingRows.push(r);
      }
      if (r.assigned && (!c.launched || r.assigned < c.launched)) c.launched = r.assigned;
    });
    return Object.keys(byCampaign).map(function (k) {
      var c = byCampaign[k];
      var chaseable = c.acknowledged + c.outstanding;
      c.pct = chaseable === 0 ? 100 : Math.round((c.acknowledged / chaseable) * 100);
      c.complete = c.outstanding === 0;
      return c;
    }).sort(function (a, b) { return (b.launched || '').localeCompare(a.launched || ''); });
  }
  function attestationsToChase(rows, today, lastChased, afterDays, everyDays) {
    var after = afterDays == null ? 7 : afterDays, every = everyDays == null ? 7 : everyDays;
    var chased = lastChased || {};
    return attestationCampaigns(rows || []).filter(function (c) {
      if (!c.outstanding || !c.launched) return false;
      if (c.launched > addDaysIso(today, -after)) return false;
      var last = chased[c.id];
      return !last || last <= addDaysIso(today, -every);
    }).map(function (c) {
      return { campaign: c.id, docName: c.docName, docVersion: c.docVersion, docUrl: c.docUrl, pct: c.pct, outstanding: c.outstandingRows.map(function (r) { return { id: r.id, upn: r.upn, userName: r.userName }; }) };
    });
  }
  function ackChaseByPerson(chase) {
    var people = {};
    (chase || []).forEach(function (c) {
      c.outstanding.forEach(function (r) {
        var k = String(r.upn || '').toLowerCase();
        if (!k) return;
        var p = people[k] || (people[k] = { upn: r.upn, name: r.userName || '', policies: [] });
        p.policies.push({ name: String(c.docName || '').replace(/\.html$/i, ''), version: c.docVersion || '', url: c.docUrl || '' });
      });
    });
    return Object.keys(people).map(function (k) { return people[k]; });
  }
  function ackChaseHtml(person, label, appUrl) {
    var e = function (v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
    var n = person.policies.length;
    return '<div style="font-family:Arial,sans-serif;color:#222;max-width:600px">' +
      '<p>Hello ' + e(person.name || '') + ',</p>' +
      '<p>' + (n === 1 ? 'One policy is' : n + ' policies are') + ' still waiting for you to read and acknowledge for ' + e(label) + ':</p>' +
      '<ul>' + person.policies.map(function (p) { return '<li>' + (/^https:\/\//i.test(p.url) ? '<a href="' + e(p.url) + '">' + e(p.name) + '</a>' : e(p.name)) + (p.version ? ' (version ' + e(p.version) + ')' : '') + '</li>'; }).join('') + '</ul>' +
      '<p>When you have read ' + (n === 1 ? 'it' : 'them') + ', confirm on the <b>Policy attestation</b> page in Checkpoint' + (/^https:\/\//i.test(appUrl || '') ? ': <a href="' + e(appUrl) + '">' + e(appUrl) + '</a>' : '') + '. It takes a minute.</p>' +
      '<p style="color:#666;font-size:12px">You get this reminder once a week until you have acknowledged. Your name and the date are recorded as evidence the policy was communicated.</p></div>';
  }

module.exports = { addDaysIso: addDaysIso, attestationCampaigns: attestationCampaigns, attestationsToChase: attestationsToChase, ackChaseByPerson: ackChaseByPerson, ackChaseHtml: ackChaseHtml };
